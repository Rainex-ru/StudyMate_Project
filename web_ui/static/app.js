(function () {
  "use strict";

  const API_BASE = "/api";
  const TELEGRAM_BOT_USERNAME = "StudyMateRU_bot";
  const THEME_KEY = "studymate_theme";
  const TG_ID_KEY = "studymate_tg_id";
  const FAV_KEY = "studymate_saved_v1";

  const INTEREST_PRESETS = [
    "Программирование и ИТ",
    "Медицина и здоровье",
    "Инженерия и техника",
    "Экономика и финансы",
    "Педагогика",
    "Юриспруденция",
    "Дизайн и медиа",
    "Естественные науки"
  ];

  const state = {
    tgId: null,
    dashboard: null,
    meta: { subjects: [], cities: [] },
    careerQuestions: [],
    lastAiResponse: "",
    searchStep: 1,
    quizStep: 1,
    searchExam: "",
    quizExam: "",
    quizSubjects: [],
    quizCities: [],
    searchInterests: [],
    loading: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeText(v, fb = "—") {
    if (v === null || v === undefined || v === "") return fb;
    return String(v);
  }

  function parseJsonMaybe(v, fb = null) {
    if (v === null || v === undefined || v === "") return fb;
    if (typeof v === "object") return v;
    try {
      return JSON.parse(v);
    } catch (e) {
      return fb;
    }
  }

  function joinList(v) {
    return Array.isArray(v) ? v.filter(Boolean).join(", ") || "—" : safeText(v);
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return safeText(value);
    return d.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
  }

  function humanError(err) {
    const m = String(err.message || err || "");
    if (/tg_id|Parameter/.test(m)) return "Сначала войдите через Telegram.";
    if (/network|fetch/i.test(m)) return "Нет соединения с сервером. Проверьте интернет.";
    if (/GIGA|credentials/i.test(m)) return "На сервере не настроен доступ к GigaChat. Обратитесь к администратору.";
    return m.replace(/^Field `/g, "Поле ").replace(/`/g, "") || "Что-то пошло не так. Попробуйте ещё раз.";
  }

  function persistTgId(id) {
    if (!id) {
      localStorage.removeItem(TG_ID_KEY);
      state.tgId = null;
      return;
    }
    state.tgId = String(id).trim();
    localStorage.setItem(TG_ID_KEY, state.tgId);
  }

  function getStoredTgId() {
    const v = localStorage.getItem(TG_ID_KEY);
    return v ? String(v).trim() : null;
  }

  function getAuthQuery() {
    return state.tgId ? `?tg_id=${encodeURIComponent(state.tgId)}` : "";
  }

  async function request(path, opt = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(opt.headers || {}) },
      ...opt
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      throw new Error(data?.error || data?.message || "Запрос не выполнен.");
    }
    return data || {};
  }

  function showStatus(id, msg, tone = "info") {
    const node = typeof id === "string" ? byId(id) : id;
    if (!node) return;
    if (!msg) {
      node.hidden = true;
      node.textContent = "";
      delete node.dataset.tone;
      return;
    }
    node.hidden = false;
    node.textContent = msg;
    node.dataset.tone = tone;
  }

  function setLoading(on) {
    state.loading = !!on;
    const sp = byId("spinner");
    if (sp) sp.classList.toggle("hidden", !on);
  }

  /* -------- structured AI cards -------- */

  function segmentAiText(raw) {
    const text = String(raw || "").trim();
    if (!text) return [];
    const paragraphs = text.split(/\n\s*\n+/).filter(Boolean);
    const cards = [];

    for (const para of paragraphs) {
      const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;

      const allNumbered =
        lines.length >= 2 &&
        lines.every((l) => /^\d+[\).\s]\s*\S/.test(l));

      if (allNumbered) {
        lines.forEach((line) => {
          const m = line.match(/^(\d+)[\).\s]\s*(.+)$/);
          if (m) {
            cards.push({
              title: `Вариант ${m[1]}`,
              body: m[2],
              variant: "numbered"
            });
          }
        });
        continue;
      }

      const allBullets = lines.every((l) => /^[-•–]\s/.test(l));
      if (allBullets && lines.length >= 2) {
        lines.forEach((line) => {
          cards.push({
            title: null,
            body: line.replace(/^[-•–]\s/, ""),
            variant: "bullet"
          });
        });
        continue;
      }

      cards.push({
        title: null,
        body: lines.join("\n"),
        variant: "prose"
      });
    }

    return cards.length ? cards : [{ title: null, body: text, variant: "prose" }];
  }

  function renderCardStack(container, rawText) {
    if (!container) return;
    const items = segmentAiText(rawText);
    container.innerHTML = items
      .map(
        (it) => `
      <article class="insightCard insightCard--${it.variant}" data-variant="${escapeHtml(it.variant)}">
        ${it.title ? `<h5 class="insightCard__title">${escapeHtml(it.title)}</h5>` : ""}
        <div class="insightCard__body">${escapeHtml(it.body).replace(/\n/g, "<br>")}</div>
      </article>`
      )
      .join("");
  }

  function showDeck(deckEl, cardsEl, text) {
    if (!deckEl || !cardsEl) return;
    renderCardStack(cardsEl, text);
    deckEl.classList.toggle("hidden", !String(text || "").trim());
  }

  /* -------- themes -------- */

  function resolveThemeMode() {
    return localStorage.getItem(THEME_KEY) || "auto";
  }

  function getEffectiveTheme() {
    const mode = resolveThemeMode();
    if (mode === "auto" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return mode === "light" ? "light" : "dark";
  }

  function applyTheme(mode) {
    const theme = mode || resolveThemeMode();
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);

    qsa(".themeBtn[data-theme]").forEach((btn) => {
      const on = btn.dataset.theme === theme;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    document.documentElement.setAttribute("data-effective-theme", getEffectiveTheme());
  }

  function initTheme() {
    applyTheme(resolveThemeMode());
    qsa(".themeBtn[data-theme]").forEach((btn) => {
      btn.addEventListener("click", () => applyTheme(btn.dataset.theme || "auto"));
    });
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const fn = () => {
      if (resolveThemeMode() === "auto") {
        document.documentElement.setAttribute("data-effective-theme", getEffectiveTheme());
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", fn);
    else mq.addListener(fn);
  }

  /* -------- auth shell -------- */

  function setAuthedUi(on) {
    document.body.classList.toggle("needs-auth", !on);
    document.body.classList.toggle("is-authed", !!on);
    const gate = byId("authGate");
    const shell = byId("appShell");
    const nav = byId("mainNav");
    if (gate) gate.hidden = !!on;
    if (shell) shell.hidden = !on;
    if (nav) nav.hidden = !on;
    const badge = byId("authBadge");
    if (badge) {
      badge.textContent = on ? "Вошли через Telegram" : "";
      badge.dataset.state = on ? "ready" : "idle";
    }
  }

  function initTelegramWidget() {
    const box = byId("telegramWidget");
    if (!box || box.dataset.ready === "true") return;
    box.dataset.ready = "true";
    box.innerHTML = "";
    const sc = document.createElement("script");
    sc.async = true;
    sc.src = "https://telegram.org/js/telegram-widget.js?22";
    sc.setAttribute("data-telegram-login", TELEGRAM_BOT_USERNAME);
    sc.setAttribute("data-size", "large");
    sc.setAttribute("data-userpic", "false");
    sc.setAttribute("data-request-access", "write");
    sc.setAttribute("data-onauth", "StudyMateTelegramAuth(user)");
    box.appendChild(sc);
    window.StudyMateTelegramAuth = async function (user) {
      try {
        await handleTelegramAuth(user);
      } catch (e) {
        showStatus("authStatus", humanError(e), "error");
      }
    };
  }

  async function handleTelegramAuth(user) {
    if (!user?.id) throw new Error("Telegram не передал профиль.");
    setLoading(true);
    showStatus("authStatus", "Подключаем аккаунт…", "info");
    try {
      const payload = {
        id: user.id,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        username: user.username || "",
        photo_url: user.photo_url || "",
        auth_date: user.auth_date || "",
        hash: user.hash || ""
      };
      const data = await request("/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ user: payload })
      });
      persistTgId(user.id);
      showStatus(
        "authStatus",
        `Готово, ${data.display_name || "добро пожаловать"}.`,
        "success"
      );
      setAuthedUi(true);
      await refreshAllData();
      applyTheme(resolveThemeMode());
    } finally {
      setLoading(false);
    }
  }

  /* -------- meta & dashboard -------- */

  async function loadMeta() {
    try {
      const m = await request("/meta", { method: "GET" });
      state.meta.subjects = Array.isArray(m.subjects) ? m.subjects : [];
      state.meta.cities = Array.isArray(m.cities) ? m.cities : [];
    } catch (e) {
      state.meta.subjects = [];
      state.meta.cities = [];
    }
    fillDatalist();
    buildInterestTray();
    buildQuizSubjectTray();
    buildQuizCityTray();
    fillCityQuickTray();
  }

  function fillDatalist() {
    const dl = byId("cityDatalist");
    if (!dl) return;
    dl.innerHTML = state.meta.cities.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
  }

  function fillCityQuickTray() {
    const tray = byId("cityQuickTray");
    if (!tray) return;
    tray.innerHTML = "";
    state.meta.cities.slice(0, 8).forEach((city) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip chip--ghost";
      b.textContent = city;
      b.addEventListener("click", () => {
        const inp = byId("searchCityInput");
        if (inp) inp.value = city;
      });
      tray.appendChild(b);
    });
  }

  function buildInterestTray() {
    const tray = byId("interestTray");
    if (!tray) return;
    tray.innerHTML = "";
    INTEREST_PRESETS.forEach((label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.interest = label;
      b.textContent = label;
      b.addEventListener("click", () => {
        b.classList.toggle("is-selected");
        const i = state.searchInterests.indexOf(label);
        if (i >= 0) state.searchInterests.splice(i, 1);
        else state.searchInterests.push(label);
      });
      tray.appendChild(b);
    });
  }

  function buildQuizSubjectTray() {
    const tray = byId("quizSubjectTray");
    if (!tray) return;
    tray.innerHTML = "";
    state.meta.subjects.forEach((subj) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.subject = subj;
      b.textContent = subj;
      b.addEventListener("click", () => {
        b.classList.toggle("is-selected");
        const idx = state.quizSubjects.indexOf(subj);
        if (idx >= 0) state.quizSubjects.splice(idx, 1);
        else state.quizSubjects.push(subj);
      });
      tray.appendChild(b);
    });
  }

  function buildQuizCityTray() {
    const tray = byId("quizCityTray");
    if (!tray) return;
    tray.innerHTML = "";
    state.meta.cities.forEach((city) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.city = city;
      b.textContent = city;
      b.addEventListener("click", () => {
        b.classList.toggle("is-selected");
        const idx = state.quizCities.indexOf(city);
        if (idx >= 0) state.quizCities.splice(idx, 1);
        else state.quizCities.push(city);
      });
      tray.appendChild(b);
    });
  }

  async function refreshAllData() {
    if (!state.tgId) return;
    setLoading(true);
    try {
      const dash = await request(`/dashboard${getAuthQuery()}`, { method: "GET" });
      state.dashboard = dash;
      renderFromDashboard(dash);
      showStatus("dashboardStatus", "");
    } catch (e) {
      showStatus("dashboardStatus", humanError(e), "error");
    } finally {
      setLoading(false);
    }
  }

  function renderFromDashboard(dash) {
    renderProfileCard(dash?.profile, dash?.display_name);
    renderDashboardMetrics(dash);
    renderLegacyScoreHistory(dash?.score_history || []);
    renderLegacySearchHistory(dash?.search_history || []);
  }

  function renderProfileCard(profile, displayName) {
    const card = byId("profileCard");
    if (!card) return;
    if (!profile) {
      card.innerHTML = `<div class="emptyState">Профиль появится после первого сохранённого запроса.</div>`;
      return;
    }
    const name =
      displayName ||
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
      (profile.username ? `@${profile.username}` : "Вы");
    card.innerHTML = `
      <div class="profileHeader">
        <div class="profileAvatar profileAvatar--placeholder">${escapeHtml(name.slice(0, 1).toUpperCase())}</div>
        <div class="profileMeta">
          <h3>${escapeHtml(name)}</h3>
          <p class="muted">${profile.username ? "@" + escapeHtml(profile.username) : "Telegram"}</p>
        </div>
      </div>`;
  }

  function renderDashboardMetrics(dash) {
    const node = byId("dashboardMetrics");
    if (!node || !dash) {
      if (node) node.innerHTML = "";
      return;
    }
    const sc = dash.stats?.score_history_count ?? (dash.score_history || []).length;
    const se = dash.stats?.search_history_count ?? (dash.search_history || []).length;
    const ls = dash.latest_score;
    const lr = dash.latest_search;
    node.innerHTML = `
      <div class="statGrid">
        <div class="statItem"><span>Сохранённых опросов</span><strong>${sc}</strong></div>
        <div class="statItem"><span>Сохранённых поисков</span><strong>${se}</strong></div>
        <div class="statItem"><span>Последний опрос</span><strong>${ls ? formatDate(ls.created_at) : "—"}</strong></div>
        <div class="statItem"><span>Последний поиск</span><strong>${lr ? formatDate(lr.created_at) : "—"}</strong></div>
      </div>`;
  }

  /* -------- history lists (compact cards) -------- */

  function clearLegacyScoreWidgets() {
    ["wScoresCount", "wLastExam", "wLastCities", "wScoresExamPill"].forEach((id) => {
      const el = byId(id);
      if (el) el.textContent = "—";
    });
    const bars = byId("scoreBars");
    if (bars) bars.innerHTML = "";
  }

  function clearLegacySearchWidgets() {
    ["wSearchCount", "wLastSearchCity", "wLastSearchExam"].forEach((id) => {
      const el = byId(id);
      if (el) el.textContent = "—";
    });
    ["wTopSubjects", "wTopCities"].forEach((id) => {
      const el = byId(id);
      if (el) el.innerHTML = "";
    });
  }

  function renderBarsFromScores(obj, examType) {
    const scoreBars = byId("scoreBars");
    if (!scoreBars) return;
    scoreBars.innerHTML = "";
    if (!obj || typeof obj !== "object") return;
    const entries = Object.entries(obj)
      .map(([k, v]) => ({ k: String(k), v: Number(v) }))
      .filter((x) => Number.isFinite(x.v))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    while (entries.length < 5) entries.push({ k: "", v: 0 });
    const pill = byId("wScoresExamPill");
    if (pill) pill.textContent = examType || "—";
    entries.forEach((item) => {
      const wrap = document.createElement("div");
      wrap.className = "barItem";
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.max(6, Math.min(100, item.v))}%`;
      const lab = document.createElement("div");
      lab.className = "barLabel";
      lab.textContent = item.k || "—";
      wrap.appendChild(bar);
      wrap.appendChild(lab);
      scoreBars.appendChild(wrap);
    });
  }

  function topFreq(rows, fn, max = 8) {
    const m = new Map();
    rows.forEach((r) => {
      const k = fn(r);
      if (!k) return;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, max);
  }

  function renderPillCloud(container, pairs) {
    if (!container) return;
    container.innerHTML = "";
    pairs.forEach(([name, n]) => {
      const t = document.createElement("div");
      t.className = "tag";
      t.innerHTML = `<b>${escapeHtml(name)}</b><span>${n}×</span>`;
      container.appendChild(t);
    });
  }

  function renderLegacyScoreHistory(items) {
    clearLegacyScoreWidgets();
    const list = byId("scoresList");
    const empty = byId("scoresEmpty");
    const meta = byId("scoresMeta");
    if (meta) meta.textContent = items?.length ? `${items.length} записей` : "—";
    if (!list) return;
    list.innerHTML = "";
    if (empty) empty.hidden = !!(items && items.length);
    if (!items?.length) return;

    const latest = items[0];
    if (byId("wScoresCount")) byId("wScoresCount").textContent = String(items.length);
    if (byId("wLastExam")) byId("wLastExam").textContent = safeText(latest.exam_type);
    const cities = Array.isArray(latest.cities) ? latest.cities : [];
    if (byId("wLastCities")) byId("wLastCities").textContent = cities.length ? cities.join(", ") : "—";

    renderBarsFromScores(parseJsonMaybe(latest.scores, {}), safeText(latest.exam_type));

    items.forEach((entry) => {
      const citiesStr = Array.isArray(entry.cities) ? entry.cities.join(", ") : joinList(entry.cities);
      const subs = Array.isArray(entry.subjects) ? entry.subjects.join(", ") : joinList(entry.subjects);
      const scoresObj = parseJsonMaybe(entry.scores, {}) || {};
      const scoreBits = Object.entries(scoresObj)
        .map(([k, v]) => `<span class="miniPill">${escapeHtml(k)} <b>${escapeHtml(String(v))}</b></span>`)
        .join(" ");

      const el = document.createElement("div");
      el.className = "historyCard";
      el.innerHTML = `
        <div class="historyCard__top">
          <strong>${escapeHtml(safeText(entry.exam_type, "Опрос"))}</strong>
          <span>${escapeHtml(formatDate(entry.created_at))}</span>
        </div>
        <p><b>Города:</b> ${escapeHtml(citiesStr || "—")}</p>
        <p><b>Предметы:</b> ${escapeHtml(subs || "—")}</p>
        <div class="miniPillRow">${scoreBits || '<span class="muted">Баллы не указаны</span>'}</div>
      `;
      list.appendChild(el);
    });
  }

  function renderLegacySearchHistory(items) {
    clearLegacySearchWidgets();
    const list = byId("searchList");
    const empty = byId("searchEmpty");
    const meta = byId("searchMeta");
    if (meta) meta.textContent = items?.length ? `${items.length} записей` : "—";
    if (!list) return;
    list.innerHTML = "";
    if (empty) empty.hidden = !!(items && items.length);
    if (!items?.length) return;

    const latest = items[0];
    if (byId("wSearchCount")) byId("wSearchCount").textContent = String(items.length);
    if (byId("wLastSearchCity")) byId("wLastSearchCity").textContent = safeText(latest.city);
    if (byId("wLastSearchExam")) byId("wLastSearchExam").textContent = safeText(latest.exam_type);

    renderPillCloud(
      byId("wTopSubjects"),
      topFreq(items, (r) => safeText(r.subject).trim() || "—")
    );
    renderPillCloud(
      byId("wTopCities"),
      topFreq(items, (r) => safeText(r.city).trim() || "—")
    );

    items.forEach((row) => {
      const el = document.createElement("div");
      el.className = "historyCard";
      el.innerHTML = `
        <div class="historyCard__top"><strong>Поиск</strong><span>${escapeHtml(formatDate(row.created_at))}</span></div>
        <p><b>${escapeHtml(safeText(row.city))}</b> · ${escapeHtml(safeText(row.subject))}</p>
        <span class="pill pill--tiny">${escapeHtml(safeText(row.exam_type))}</span>
      `;
      list.appendChild(el);
    });
  }

  function renderStructuredAi(container, text) {
    if (!container) return;
    container.innerHTML = "";
    if (!text || !String(text).trim()) {
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");
    renderCardStack(container, text);
  }

  async function handleRegen(endpoint, wrapId) {
    if (!state.tgId) {
      showStatus("dashboardStatus", "Нужен вход через Telegram.", "warning");
      return;
    }
    setLoading(true);
    try {
      const data = await request(`${endpoint}?tg_id=${encodeURIComponent(state.tgId)}`, {
        method: "POST",
        body: "{}"
      });
      const el = byId(wrapId);
      state.lastAiResponse = data.response || "";
      syncSupplementHidden();
      renderStructuredAi(el, data.response || "");
    } catch (e) {
      showStatus("dashboardStatus", humanError(e), "error");
    } finally {
      setLoading(false);
    }
  }

  function syncSupplementHidden() {
    const h = byId("supplementPreviousResponse");
    if (h) h.value = state.lastAiResponse || "";
  }

  /* -------- search wizard -------- */

  function setSearchStep(n) {
    state.searchStep = n;
    qsa("[data-search-step]").forEach((pane) => {
      const step = Number(pane.dataset.searchStep);
      pane.classList.toggle("is-active", step === n);
    });
    const rail = byId("searchStepRail");
    if (rail) {
      rail.innerHTML = [1, 2, 3]
        .map(
          (i) =>
            `<span class="stepDot ${i === n ? "is-active" : ""} ${i < n ? "is-done" : ""}">${i}</span>`
        )
        .join("");
    }
    const prev = byId("searchPrev");
    const next = byId("searchNext");
    const go = byId("searchSubmitBtn");
    if (prev) prev.disabled = n <= 1;
    if (next) next.classList.toggle("hidden", n >= 3);
    if (go) go.classList.toggle("hidden", n < 3);

    qsa("#searchExamChoices .choiceTile").forEach((t) => {
      t.classList.toggle("is-selected", t.dataset.exam === state.searchExam);
    });
  }

  function bindSearchWizard() {
    qsa("#searchExamChoices .choiceTile").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.searchExam = btn.dataset.exam || "";
        const hid = byId("searchExamValue");
        if (hid) hid.value = state.searchExam;
        qsa("#searchExamChoices .choiceTile").forEach((b) =>
          b.classList.toggle("is-selected", b === btn)
        );
      });
    });

    byId("searchPrev")?.addEventListener("click", () => {
      if (state.searchStep > 1) setSearchStep(state.searchStep - 1);
    });

    byId("searchNext")?.addEventListener("click", () => {
      try {
        validateSearchStep(state.searchStep);
      } catch (e) {
        showStatus("searchStatus", humanError(e), "warning");
        return;
      }
      if (state.searchStep < 3) setSearchStep(state.searchStep + 1);
    });

    byId("searchSubmitBtn")?.addEventListener("click", () => submitSearch());

    setSearchStep(1);
  }

  function validateSearchStep(step) {
    if (step === 1 && !state.searchExam) throw new Error("Выберите ЕГЭ или ОГЭ.");
    if (step === 2) {
      const city = String(byId("searchCityInput")?.value || "").trim();
      if (!city) throw new Error("Укажите город.");
    }
  }

  async function submitSearch() {
    if (!state.tgId) {
      showStatus("searchStatus", "Войдите через Telegram.", "warning");
      return;
    }
    try {
      validateSearchStep(2);
    } catch (e) {
      showStatus("searchStatus", humanError(e), "warning");
      return;
    }
    const city = String(byId("searchCityInput")?.value || "").trim();
    const extra = String(byId("searchSubjectFree")?.value || "").trim();
    const parts = [...state.searchInterests];
    if (extra) parts.push(extra);
    const subject = parts.length ? parts.join("; ") : "не указано";

    setLoading(true);
    showStatus("searchStatus", "Подбираем варианты…", "info");
    try {
      const data = await request("/search/submit", {
        method: "POST",
        body: JSON.stringify({
          tg_id: Number(state.tgId),
          city,
          subject,
          exam_type: state.searchExam
        })
      });
      state.lastAiResponse = data.response || "";
      syncSupplementHidden();
      showDeck(byId("searchResultDeck"), byId("searchResultCards"), data.response || "");
      byId("searchResultDeck")?.classList.remove("hidden");
      showStatus("searchStatus", "Готово.", "success");
      await refreshAllData();
    } catch (e) {
      showStatus("searchStatus", humanError(e), "error");
    } finally {
      setLoading(false);
    }
  }

  /* -------- quiz wizard -------- */

  function renderQuizScores() {
    const box = byId("quizScoreFields");
    if (!box) return;
    box.innerHTML = "";
    if (!state.quizSubjects.length) {
      box.innerHTML = `<p class="muted">Сначала выберите предметы на шаге 3.</p>`;
      return;
    }
    state.quizSubjects.forEach((subj) => {
      const row = document.createElement("div");
      row.className = "scoreRow";
      row.innerHTML = `
        <label class="scoreRow__label">${escapeHtml(subj)}</label>
        <input type="number" class="field scoreRow__input" min="0" max="100" step="1" inputmode="numeric" data-score="${escapeHtml(subj)}" placeholder="0–100" />
      `;
      box.appendChild(row);
    });
  }

  function collectScores() {
    const out = {};
    qsa("#quizScoreFields [data-score]").forEach((inp) => {
      const k = inp.getAttribute("data-score");
      const v = Number(inp.value);
      if (!k) return;
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        throw new Error(`Балл по «${k}»: введите число от 0 до 100.`);
      }
      out[k] = v;
    });
    return out;
  }

  function setQuizStep(n) {
    state.quizStep = n;
    qsa("[data-quiz-step]").forEach((pane) => {
      pane.classList.toggle("is-active", Number(pane.dataset.quizStep) === n);
    });
    const rail = byId("quizStepRail");
    if (rail) {
      rail.innerHTML = Array.from({ length: 6 }, (_, i) => i + 1)
        .map(
          (i) =>
            `<span class="stepDot ${i === n ? "is-active" : ""} ${i < n ? "is-done" : ""}">${i}</span>`
        )
        .join("");
    }
    byId("quizPrev").disabled = n <= 1;
    byId("quizNext").classList.toggle("hidden", n >= 6);
    byId("quizSubmitBtn").classList.toggle("hidden", n < 6);

    qsa("#quizExamChoices .choiceTile").forEach((t) => {
      t.classList.toggle("is-selected", t.dataset.exam === state.quizExam);
    });

    if (n === 4) renderQuizScores();
  }

  function validateQuizStep(step) {
    if (step === 1) {
      const p = String(byId("quizProfession")?.value || "").trim();
      if (!p) throw new Error("Опишите желаемую профессию или направление.");
    }
    if (step === 2 && !state.quizExam) throw new Error("Выберите тип экзамена.");
    if (step === 3 && !state.quizSubjects.length) throw new Error("Выберите хотя бы один предмет.");
    if (step === 4) collectScores();
    if (step === 5) {
      const extra = String(byId("quizCityExtra")?.value || "").trim();
      if (!state.quizCities.length && !extra) {
        throw new Error("Выберите город на кнопках или введите название и нажмите Enter.");
      }
    }
  }

  function bindQuizWizard() {
    qsa("#quizExamChoices .choiceTile").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.quizExam = btn.dataset.exam || "";
        byId("quizExamValue").value = state.quizExam;
        qsa("#quizExamChoices .choiceTile").forEach((b) =>
          b.classList.toggle("is-selected", b === btn)
        );
      });
    });

    byId("quizPrev")?.addEventListener("click", () => {
      if (state.quizStep > 1) setQuizStep(state.quizStep - 1);
    });

    byId("quizNext")?.addEventListener("click", () => {
      if (state.quizStep === 5) {
        const extra = String(byId("quizCityExtra")?.value || "").trim();
        if (extra && !state.quizCities.includes(extra)) state.quizCities.push(extra);
        const inp = byId("quizCityExtra");
        if (inp) inp.value = "";
      }
      try {
        validateQuizStep(state.quizStep);
      } catch (e) {
        showStatus("recommendStatus", humanError(e), "warning");
        return;
      }
      if (state.quizStep < 6) setQuizStep(state.quizStep + 1);
    });

    byId("quizCityExtra")?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const v = String(byId("quizCityExtra").value || "").trim();
      if (!v) return;
      if (!state.quizCities.includes(v)) state.quizCities.push(v);
      const tray = byId("quizCityTray");
      const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\"');
      const chip = tray?.querySelector(`[data-city="${esc}"]`);
      if (chip) chip.classList.add("is-selected");
      byId("quizCityExtra").value = "";
    });

    byId("quizSubmitBtn")?.addEventListener("click", () => submitQuiz());

    setQuizStep(1);
  }

  async function submitQuiz() {
    if (!state.tgId) {
      showStatus("recommendStatus", "Войдите через Telegram.", "warning");
      return;
    }
    try {
      validateQuizStep(6);
      const scores = collectScores();
      if (Object.keys(scores).length === 0) throw new Error("Заполните баллы по предметам.");
    } catch (e) {
      showStatus("recommendStatus", humanError(e), "warning");
      return;
    }

    const profession = String(byId("quizProfession")?.value || "").trim();
    const scores = collectScores();
    const additional = String(byId("quizAdditional")?.value || "").trim();

    setLoading(true);
    showStatus("recommendStatus", "Готовим рекомендации…", "info");

    try {
      const data = await request("/recommend/quiz_submit", {
        method: "POST",
        body: JSON.stringify({
          tg_id: Number(state.tgId),
          profession,
          subjects: state.quizSubjects,
          exam_type: state.quizExam,
          scores,
          cities: state.quizCities,
          additional
        })
      });
      state.lastAiResponse = data.response || "";
      syncSupplementHidden();

      const hint = byId("quizHintBlock");
      if (hint && data.score_hint) {
        hint.textContent = data.score_hint;
        hint.classList.remove("hidden");
      } else if (hint) {
        hint.classList.add("hidden");
      }

      showDeck(byId("quizResultDeck"), byId("quizResultCards"), data.response || "");
      byId("quizResultDeck")?.classList.remove("hidden");
      showStatus("recommendStatus", "Готово.", "success");
      await refreshAllData();
    } catch (e) {
      showStatus("recommendStatus", humanError(e), "error");
    } finally {
      setLoading(false);
    }
  }

  /* -------- career -------- */

  async function loadCareerQuestions() {
    setLoading(true);
    showStatus("careerStatus", "Загружаем вопросы…", "info");
    try {
      const data = await request("/career_test/questions", { method: "GET" });
      state.careerQuestions = data.items || [];
      renderCareerQs();
      showStatus(
        "careerStatus",
        state.careerQuestions.length ? "Ответьте на все пункты." : "Нет вопросов.",
        state.careerQuestions.length ? "success" : "warning"
      );
      byId("careerSubmitBtn").hidden = !state.careerQuestions.length;
    } catch (e) {
      showStatus("careerStatus", humanError(e), "error");
    } finally {
      setLoading(false);
    }
  }

  function renderCareerQs() {
    const box = byId("careerQuestions");
    if (!box) return;
    box.innerHTML = state.careerQuestions
      .map((q, idx) => {
        const opts = (q.options || [])
          .map((opt, j) => {
            const id = `cq_${idx}_${j}`;
            return `<label class="optionChip" for="${id}">
            <input type="radio" name="career_q_${idx}" id="${id}" value="${j}" required />
            <span>${escapeHtml(opt)}</span>
          </label>`;
          })
          .join("");
        return `<fieldset class="questionCard"><legend>${idx + 1}. ${escapeHtml(q.question)}</legend><div class="optionList">${opts}</div></fieldset>`;
      })
      .join("");
  }

  byId("careerForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const answers = [];
    for (let i = 0; i < state.careerQuestions.length; i++) {
      const sel = qs(`input[name="career_q_${i}"]:checked`);
      if (!sel) {
        showStatus("careerStatus", "Ответьте на каждый вопрос.", "warning");
        return;
      }
      const q = state.careerQuestions[i];
      const opts = q.options || [];
      const idx = Number(sel.value);
      answers.push(opts[idx]);
    }
    setLoading(true);
    showStatus("careerStatus", "Анализируем ответы…", "info");
    try {
      const data = await request("/career_test/submit", {
        method: "POST",
        body: JSON.stringify({ answers })
      });
      state.lastAiResponse = data.result || "";
      syncSupplementHidden();
      showDeck(byId("careerResultDeck"), byId("careerResultCards"), data.result || "");
      showStatus("careerStatus", "Готово.", "success");
    } catch (e) {
      showStatus("careerStatus", humanError(e), "error");
    } finally {
      setLoading(false);
    }
  });

  /* -------- supplement -------- */

  byId("supplementForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const prev = String(byId("supplementPreviousResponse")?.value || "").trim();
    const supplement = String(byId("supplementText")?.value || "").trim();
    if (!prev || !supplement) {
      showStatus("supplementStatus", "Сначала получите ответ в сервисах выше — затем уточните запрос.", "warning");
      return;
    }
    setLoading(true);
    showStatus("supplementStatus", "Уточняем ответ…", "info");
    try {
      const data = await request("/supplement", {
        method: "POST",
        body: JSON.stringify({ previous_response: prev, supplement })
      });
      state.lastAiResponse = data.response || "";
      syncSupplementHidden();
      showDeck(byId("supplementResultDeck"), byId("supplementResultCards"), data.response || "");
      showStatus("supplementStatus", "Готово.", "success");
    } catch (e) {
      showStatus("supplementStatus", humanError(e), "error");
    } finally {
      setLoading(false);
    }
  });

  /* -------- favorites -------- */

  function loadFavs() {
    try {
      return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveFavs(list) {
    localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 40)));
  }

  function addFavorite(kind, title, text) {
    if (!String(text || "").trim()) {
      showStatus(
        "dashboardStatus",
        "Сначала получите ответ в сервисе — затем сохраните.",
        "warning"
      );
      return;
    }
    const list = loadFavs();
    list.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      kind,
      title,
      preview: String(text || "").slice(0, 160),
      full: text,
      at: new Date().toISOString()
    });
    saveFavs(list);
    renderSaved();
  }

  function renderSaved() {
    const list = loadFavs();
    const box = byId("savedList");
    const empty = byId("savedEmpty");
    if (!box) return;
    box.innerHTML = "";
    if (!list.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    list.forEach((item) => {
      const el = document.createElement("article");
      el.className = "savedCard";
      el.innerHTML = `
        <div class="savedCard__top">
          <span class="pill pill--tiny">${escapeHtml(item.kind)}</span>
          <time class="muted">${escapeHtml(formatDate(item.at))}</time>
        </div>
        <h4>${escapeHtml(item.title)}</h4>
        <p class="savedCard__preview">${escapeHtml(item.preview)}…</p>
        <div class="savedCard__actions">
          <button type="button" class="btn btnTiny btnGhost" data-expand="${escapeHtml(item.id)}">Развернуть</button>
          <button type="button" class="btn btnTiny btnGhost" data-del="${escapeHtml(item.id)}">Удалить</button>
        </div>
        <div class="savedCard__full hidden" id="full-${escapeHtml(item.id)}"></div>
      `;
      box.appendChild(el);
    });

    box.querySelectorAll("[data-expand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-expand");
        const item = loadFavs().find((x) => x.id === id);
        const wrap = byId(`full-${id}`);
        if (!item || !wrap) return;
        wrap.classList.toggle("hidden");
        renderCardStack(wrap, item.full || "");
      });
    });

    box.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del");
        saveFavs(loadFavs().filter((x) => x.id !== id));
        renderSaved();
      });
    });
  }

  byId("saveQuizResultBtn")?.addEventListener("click", () => {
    addFavorite("Опрос по баллам", "Рекомендации", state.lastAiResponse);
  });

  byId("saveCareerResultBtn")?.addEventListener("click", () => {
    addFavorite("Профориентация", "Разбор теста", state.lastAiResponse);
  });

  byId("saveSearchResultBtn")?.addEventListener("click", () => {
    addFavorite("Поиск по городу", "Подбор учебных заведений", state.lastAiResponse);
  });

  byId("saveSupplementResultBtn")?.addEventListener("click", () => {
    addFavorite("Уточнение", "Дополнение к ответу", state.lastAiResponse);
  });

  /* -------- tabs & jumps -------- */

  function setActiveTab(tabId) {
    if (!tabId) return;
    if (location.hash !== `#${tabId}`) history.replaceState(null, "", `#${tabId}`);
    qsa(".tabbtn[data-tab]").forEach((b) => {
      const on = b.dataset.tab === tabId;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "page" : "false");
    });
    const map = {
      home: byId("tabHome"),
      tools: byId("tabTools"),
      history: byId("tabHistory"),
      saved: byId("tabSaved"),
      help: byId("tabHelp")
    };
    Object.entries(map).forEach(([k, node]) => {
      if (!node) return;
      node.classList.toggle("hidden", k !== tabId);
      if (k === tabId) {
        node.classList.remove("tabEnter");
        void node.offsetHeight;
        node.classList.add("tabEnter");
      }
    });
  }

  function initTabs() {
    const triggers = qsa(".tabbtn[data-tab]");
    triggers.forEach((t) =>
      t.addEventListener("click", (ev) => {
        ev.preventDefault();
        setActiveTab(t.dataset.tab);
      })
    );
    const hash = location.hash?.slice(1);
    const valid = triggers.some((t) => t.dataset.tab === hash);
    setActiveTab(valid ? hash : "home");

    window.addEventListener("hashchange", () => {
      const h = location.hash.slice(1);
      if (triggers.some((t) => t.dataset.tab === h)) setActiveTab(h);
    });

    qsa("[data-jump-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-jump-tab");
        const anchor = btn.getAttribute("data-scroll-to");
        setActiveTab(tab || "tools");
        if (anchor) {
          requestAnimationFrame(() =>
            byId(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" })
          );
        }
      });
    });
  }

  /* -------- smooth cursor -------- */

  function initCursorSmooth() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    document.addEventListener(
      "pointermove",
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
      },
      { passive: true }
    );
    function tick() {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      const root = document.documentElement;
      root.style.setProperty("--cursor-x", `${cx}px`);
      root.style.setProperty("--cursor-y", `${cy}px`);
      root.style.setProperty("--mx", `${(cx / window.innerWidth) * 100}%`);
      root.style.setProperty("--my", `${(cy / window.innerHeight) * 100}%`);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* -------- boot -------- */

  function wireChrome() {
    byId("logoutBtn")?.addEventListener("click", () => {
      persistTgId(null);
      state.dashboard = null;
      state.lastAiResponse = "";
      setAuthedUi(false);
      showStatus("authStatus", "Вы вышли из аккаунта на этом устройстве.", "info");
      const tw = byId("telegramWidget");
      if (tw) {
        delete tw.dataset.ready;
        tw.innerHTML = "";
      }
      initTelegramWidget();
    });

    byId("loadCareerBtn")?.addEventListener("click", loadCareerQuestions);

    byId("btnRegenFromScore")?.addEventListener("click", () =>
      handleRegen("/recommend/from_score", "aiResultScores")
    );

    byId("btnRegenFromSearch")?.addEventListener("click", () =>
      handleRegen("/recommend/from_search", "aiResultSearch")
    );

    bindSearchWizard();
    bindQuizWizard();
  }

  async function boot() {
    initTheme();
    initCursorSmooth();
    await loadMeta();

    state.tgId = getStoredTgId();
    if (state.tgId) {
      setAuthedUi(true);
      await refreshAllData();
    } else {
      setAuthedUi(false);
      initTelegramWidget();
    }

    initTabs();
    wireChrome();
    renderSaved();

    if (byId("spinner")) byId("spinner").classList.add("hidden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
