(function () {
  "use strict";

  const API_BASE = "/api";
  const TELEGRAM_BOT_USERNAME = "StudyMateRU_bot";
  const THEME_KEY = "studymate_theme";
  const TG_ID_KEY = "studymate_tg_id";

  const state = {
    tgId: null,
    dashboard: null,
    careerQuestions: [],
    lastAiResponse: "",
    loading: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeText(value, fallback = "—") {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    return String(value);
  }

  function parseJsonMaybe(value, fallback = null) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    if (typeof value === "object") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function joinList(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ") || "—";
    }
    return safeText(value);
  }

  function splitLines(value) {
    return String(value || "")
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function renderMultiline(value) {
    if (!value) {
      return "<p>Нет данных.</p>";
    }
    return escapeHtml(String(value)).replace(/\n/g, "<br>");
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return safeText(value);
    }
    return date.toLocaleString("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function persistTgId(tgId) {
    if (!tgId) {
      localStorage.removeItem(TG_ID_KEY);
      state.tgId = null;
      return;
    }
    state.tgId = String(tgId).trim();
    localStorage.setItem(TG_ID_KEY, state.tgId);
  }

  function getStoredTgId() {
    const value = localStorage.getItem(TG_ID_KEY);
    return value ? String(value).trim() : null;
  }

  function getAuthQuery() {
    return state.tgId ? `?tg_id=${encodeURIComponent(state.tgId)}` : "";
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const message = data?.error || data?.message || data?.detail || "Произошла ошибка запроса.";
      throw new Error(message);
    }

    return data || {};
  }

  function showStatus(id, message, tone = "info") {
    const node = typeof id === "string" ? byId(id) : id;
    if (!node) {
      return;
    }
    if (!message) {
      node.hidden = true;
      node.textContent = "";
      node.removeAttribute("data-tone");
      return;
    }
    node.hidden = false;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function setGlobalLoading(on) {
    state.loading = !!on;
    const spinner = byId("spinner");
    if (spinner) {
      spinner.classList.toggle("hidden", !on);
    }
  }

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

  function applyTheme(themeMode) {
    const theme = themeMode || resolveThemeMode();
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);

    qsa(".segBtn[data-theme]").forEach((button) => {
      const active = button.dataset.theme === theme;
      button.classList.toggle("is-active", active);
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const pill = byId("wThemePill");
    if (pill) {
      const label =
        theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark";
      pill.textContent = label;
    }

    const effective = getEffectiveTheme();
    document.documentElement.setAttribute("data-effective-theme", effective);
  }

  function initThemeControls() {
    applyTheme(resolveThemeMode());

    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => {
        if (resolveThemeMode() === "auto") {
          const effective = getEffectiveTheme();
          document.documentElement.setAttribute("data-effective-theme", effective);
        }
      };
      if (mq.addEventListener) {
        mq.addEventListener("change", handler);
      } else {
        mq.addListener(handler);
      }
    }

    qsa(".segBtn[data-theme]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.theme || "auto");
      });
    });
  }

  function fillAuthFields() {
    const tgIdInput = byId("tgIdInput") || byId("tgId");
    const authBadge = byId("authBadge");
    const authUserId = byId("authUserId");

    if (tgIdInput && state.tgId) {
      tgIdInput.value = state.tgId;
    }

    if (authBadge) {
      authBadge.textContent = state.tgId ? "Подключено" : "Не подключено";
      authBadge.dataset.state = state.tgId ? "ready" : "idle";
    }

    if (authUserId) {
      authUserId.textContent = state.tgId ? `Telegram ID: ${state.tgId}` : "Telegram ID не выбран";
    }

    const logoutBtn = byId("logoutBtn");
    if (logoutBtn) {
      logoutBtn.hidden = !state.tgId;
    }
  }

  function initTelegramWidget() {
    const container = byId("telegramWidget");
    if (!container || container.dataset.ready === "true") {
      return;
    }

    container.dataset.ready = "true";
    container.innerHTML = "";

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", TELEGRAM_BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "StudyMateTelegramAuth(user)");

    container.appendChild(script);

    window.StudyMateTelegramAuth = async function (user) {
      try {
        await handleTelegramAuth(user);
      } catch (error) {
        showStatus("authStatus", error.message || "Не удалось войти через Telegram.", "error");
      }
    };
  }

  async function handleTelegramAuth(user) {
    if (!user || !user.id) {
      throw new Error("Telegram не передал идентификатор пользователя.");
    }

    setGlobalLoading(true);
    showStatus("authStatus", "Подтверждаем вход через Telegram…", "info");

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
      state.dashboard = null;
      showStatus(
        "authStatus",
        `Аккаунт подключён: ${data.display_name || "пользователь"}.`,
        "success"
      );
      fillAuthFields();
      await refreshAllData();
    } finally {
      setGlobalLoading(false);
    }
  }

  async function refreshAllData() {
    if (!state.tgId) {
      state.dashboard = null;
      renderFromDashboard(null);
      fillAuthFields();
      showStatus("dashboardStatus", "");
      return;
    }

    setGlobalLoading(true);
    try {
      const dashboard = await request(`/dashboard${getAuthQuery()}`, {
        method: "GET"
      });
      state.dashboard = dashboard;
      renderFromDashboard(dashboard);
      fillAuthFields();
      showStatus("dashboardStatus", "");
    } catch (error) {
      showStatus("dashboardStatus", error.message || "Не удалось загрузить данные.", "error");
    } finally {
      setGlobalLoading(false);
    }
  }

  function renderFromDashboard(dashboard) {
    const profile = dashboard?.profile || null;
    renderProfileCard(profile, dashboard?.display_name);
    renderDashboardMetrics(dashboard);
    const scoreHistory = dashboard?.score_history || [];
    const searchHistory = dashboard?.search_history || [];
    renderLegacyScoreHistory(scoreHistory);
    renderLegacySearchHistory(searchHistory);
  }

  function renderProfileCard(profile, displayName) {
    const card = byId("profileCard");
    if (!card) {
      return;
    }

    if (!state.tgId) {
      card.innerHTML =
        '<div class="emptyState">Войдите через Telegram или укажите Telegram ID.</div>';
      return;
    }

    if (!profile) {
      card.innerHTML = `
        <div class="emptyState">
          Пользователь с ID <b>${escapeHtml(state.tgId)}</b> пока не найден в базе.
          Он появится после первого сохранения в боте или после инструментов ниже.
        </div>`;
      return;
    }

    const name =
      displayName ||
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
      (profile.username ? `@${profile.username}` : "Пользователь");
    const username = profile.username ? `@${profile.username}` : "Без username";

    card.innerHTML = `
      <div class="profileHeader">
        <div class="profileAvatar profileAvatar--placeholder">${escapeHtml(
          String(name).slice(0, 1).toUpperCase()
        )}</div>
        <div class="profileMeta">
          <h3>${escapeHtml(name)}</h3>
          <p>${escapeHtml(username)}</p>
          <p class="muted">tg_id: ${escapeHtml(String(profile.tg_id ?? state.tgId))}</p>
        </div>
      </div>
    `;
  }

  function renderDashboardMetrics(dashboard) {
    const node = byId("dashboardMetrics");
    if (!node) {
      return;
    }

    if (!dashboard) {
      node.innerHTML = "";
      return;
    }

    const stats = dashboard.stats || {};
    const scoreCount =
      stats.score_history_count ?? (dashboard.score_history || []).length ?? 0;
    const searchCount =
      stats.search_history_count ?? (dashboard.search_history || []).length ?? 0;
    const lastScore = dashboard.latest_score;
    const lastSearch = dashboard.latest_search;

    node.innerHTML = `
      <div class="statGrid">
        ${statRow("Опросов сохранено", scoreCount)}
        ${statRow("Поисков сохранено", searchCount)}
        ${statRow(
          "Последний опрос",
          lastScore ? formatDate(lastScore.created_at) : "—"
        )}
        ${statRow(
          "Последний поиск",
          lastSearch ? formatDate(lastSearch.created_at) : "—"
        )}
      </div>
    `;
  }

  function statRow(label, value) {
    return `<div class="statItem"><span>${escapeHtml(
      label
    )}</span><strong>${escapeHtml(safeText(String(value)))}</strong></div>`;
  }

  function clearLegacyScoreWidgets() {
    ["wScoresCount", "wLastExam", "wLastCities", "wScoresExamPill"].forEach(
      (id) => {
        const el = byId(id);
        if (el) {
          el.textContent = "—";
        }
      }
    );
    const bars = byId("scoreBars");
    if (bars) {
      bars.innerHTML = "";
    }
  }

  function clearLegacySearchWidgets() {
    ["wSearchCount", "wLastSearchCity", "wLastSearchExam"].forEach((id) => {
      const el = byId(id);
      if (el) {
        el.textContent = "—";
      }
    });
    const topSubjects = byId("wTopSubjects");
    const topCities = byId("wTopCities");
    if (topSubjects) topSubjects.innerHTML = "";
    if (topCities) topCities.innerHTML = "";
  }

  function renderBarsFromScores(scoresObj, examType) {
    const scoreBars = byId("scoreBars");
    if (!scoreBars) {
      return;
    }

    scoreBars.innerHTML = "";
    if (!scoresObj || typeof scoresObj !== "object") {
      return;
    }

    const entries = Object.entries(scoresObj)
      .map(([k, v]) => ({ k: String(k), v: Number(v) }))
      .filter((item) => Number.isFinite(item.v))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);

    while (entries.length < 5) {
      entries.push({ k: "", v: 0 });
    }

    const examPill = byId("wScoresExamPill");
    if (examPill) {
      examPill.textContent = examType || "Опрос";
    }

    entries.forEach((item) => {
      const wrap = document.createElement("div");
      wrap.className = "barItem";

      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.max(6, Math.min(100, item.v))}%`;

      const label = document.createElement("div");
      label.className = "barLabel";
      label.textContent = item.k || "—";

      wrap.appendChild(bar);
      wrap.appendChild(label);
      scoreBars.appendChild(wrap);
    });
  }

  function topFreq(rows, keyFn, max = 8) {
    const map = new Map();
    rows.forEach((row) => {
      const key = keyFn(row);
      if (!key) {
        return;
      }
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, max);
  }

  function renderPillCloud(container, entries) {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    entries.forEach(([name, count]) => {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.innerHTML = `<b>${escapeHtml(name)}</b><span>${count}×</span>`;
      container.appendChild(tag);
    });
  }

  function renderLegacyScoreHistory(items) {
    clearLegacyScoreWidgets();

    const list = byId("scoresList");
    const empty = byId("scoresEmpty");
    const meta = byId("scoresMeta");

    if (meta) {
      meta.textContent = items?.length ? `${items.length} запис(ей)` : "—";
    }

    if (!list) {
      return;
    }

    list.innerHTML = "";
    if (empty) {
      empty.hidden = !!(items && items.length);
    }
    if (!items || !items.length) {
      return;
    }

    const latest = items[0];
    const scoresCount = items.length;
    const examType = safeText(latest.exam_type);
    const citiesArr = Array.isArray(latest.cities)
      ? latest.cities
      : parseJsonMaybe(latest.cities, []) || [];

    const wScoresCount = byId("wScoresCount");
    const wLastExam = byId("wLastExam");
    const wLastCities = byId("wLastCities");

    if (wScoresCount) wScoresCount.textContent = String(scoresCount);
    if (wLastExam) wLastExam.textContent = examType;
    if (wLastCities) {
      wLastCities.textContent =
        Array.isArray(citiesArr) && citiesArr.length
          ? citiesArr.join(", ")
          : "—";
    }

    renderBarsFromScores(parseJsonMaybe(latest.scores, latest.scores), examType);

    items.forEach((entry, index) => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.setProperty("--index", index);

      const cities = Array.isArray(entry.cities)
        ? entry.cities.join(", ")
        : joinList(parseJsonMaybe(entry.cities, entry.cities));
      const subjects = Array.isArray(entry.subjects)
        ? entry.subjects.join(", ")
        : joinList(parseJsonMaybe(entry.subjects, entry.subjects));
      const scoresObj = parseJsonMaybe(entry.scores, entry.scores) || {};
      const scoreLines = Object.entries(scoresObj).length
        ? Object.entries(scoresObj)
            .map(
              ([k, v]) =>
                `<div class="scoreLine"><div>${escapeHtml(k)}</div><div style="font-weight:800">${escapeHtml(
                  String(v)
                )}</div></div>`
            )
            .join("")
        : '<div class="muted">Список баллов пуст.</div>';

      card.innerHTML = `
        <div class="cardTitle">
          <span>${escapeHtml(safeText(entry.exam_type, "Опрос"))}</span>
          <div class="pill">Города: ${escapeHtml(cities || "—")}</div>
        </div>
        <div class="kv">
          <div class="krow"><div class="k">Предметы</div><div class="v">${escapeHtml(
            subjects || "—"
          )}</div></div>
          <div class="krow"><div class="k">Дополнительно</div><div class="v">${escapeHtml(
            safeText(entry.additional, "—")
          )}</div></div>
        </div>
        <div class="scores">${scoreLines}</div>
      `;
      list.appendChild(card);
    });
  }

  function renderLegacySearchHistory(items) {
    clearLegacySearchWidgets();

    const list = byId("searchList");
    const empty = byId("searchEmpty");
    const meta = byId("searchMeta");

    if (meta) {
      meta.textContent = items?.length ? `${items.length} запис(ей)` : "—";
    }

    if (!list) {
      return;
    }

    list.innerHTML = "";
    if (empty) {
      empty.hidden = !!(items && items.length);
    }
    if (!items || !items.length) {
      return;
    }

    const latest = items[0];
    const wSearchCount = byId("wSearchCount");
    const wLastSearchCity = byId("wLastSearchCity");
    const wLastSearchExam = byId("wLastSearchExam");

    if (wSearchCount) wSearchCount.textContent = String(items.length);
    if (wLastSearchCity) wLastSearchCity.textContent = safeText(latest.city);
    if (wLastSearchExam) wLastSearchExam.textContent = safeText(latest.exam_type);

    renderPillCloud(
      byId("wTopSubjects"),
      topFreq(
        items,
        (row) => safeText(row.subject, "").trim() || "не указано"
      )
    );
    renderPillCloud(
      byId("wTopCities"),
      topFreq(items, (row) => safeText(row.city, "").trim() || "не указано")
    );

    items.forEach((row, index) => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.setProperty("--index", index);
      card.innerHTML = `
        <div class="cardTitle">
          <span>Поиск</span>
          <div class="pill">${escapeHtml(safeText(row.exam_type))}</div>
        </div>
        <div class="kv">
          <div class="krow"><div class="k">Город</div><div class="v">${escapeHtml(
            safeText(row.city)
          )}</div></div>
          <div class="krow"><div class="k">Направление</div><div class="v">${escapeHtml(
            safeText(row.subject)
          )}</div></div>
          <div class="krow"><div class="k">Дата</div><div class="v">${escapeHtml(
            formatDate(row.created_at)
          )}</div></div>
        </div>
      `;
      list.appendChild(card);
    });
  }

  function setAiResult(el, text) {
    if (!el) {
      return;
    }
    el.innerHTML = "";
    if (!text) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const wrapper = document.createElement("div");
    wrapper.className = "aiText";
    wrapper.textContent = text;
    el.appendChild(wrapper);
  }

  async function handleLegacyRegen(endpoint, targetEl) {
    if (!state.tgId) {
      showStatus("dashboardStatus", "Сначала укажите Telegram ID или войдите через Telegram.", "warning");
      return;
    }
    setGlobalLoading(true);
    try {
      const data = await request(`${endpoint}?tg_id=${encodeURIComponent(state.tgId)}`, {
        method: "POST",
        body: "{}"
      });
      setAiResult(targetEl, data.response || "");
      state.lastAiResponse = data.response || "";
      syncSupplementField();
    } catch (error) {
      setAiResult(targetEl, `Ошибка: ${error.message || "неизвестная"}`);
    } finally {
      setGlobalLoading(false);
    }
  }

  function formToObject(form) {
    const data = {};
    if (!form) {
      return data;
    }
    const formData = new FormData(form);
    formData.forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (!Array.isArray(data[key])) {
          data[key] = [data[key]];
        }
        data[key].push(value);
      } else {
        data[key] = value;
      }
    });
    return data;
  }

  async function handleSearchSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = formToObject(form);

    const payload = {
      tg_id: state.tgId ? Number(state.tgId) : null,
      city: String(raw.city || "").trim(),
      subject: String(raw.subject || "").trim() || "не указано",
      exam_type: String(raw.exam_type || "").trim().toUpperCase()
    };

    if (!state.tgId) {
      showStatus("searchStatus", "Сначала войдите через Telegram или введите Telegram ID.", "warning");
      return;
    }
    if (!payload.city) {
      showStatus("searchStatus", "Укажите город.", "warning");
      return;
    }
    if (payload.exam_type !== "ОГЭ" && payload.exam_type !== "ЕГЭ") {
      showStatus("searchStatus", "Выберите тип экзамена: ОГЭ или ЕГЭ.", "warning");
      return;
    }

    setGlobalLoading(true);
    showStatus("searchStatus", "Ищем подходящие варианты…", "info");

    try {
      const data = await request("/search/submit", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      renderSearchResult(data);
      state.lastAiResponse = data.response || "";
      syncSupplementField();
      showStatus("searchStatus", "Готово. Результат ниже.", "success");
      await refreshAllData();
    } catch (error) {
      showStatus("searchStatus", error.message || "Ошибка поиска.", "error");
    } finally {
      setGlobalLoading(false);
    }
  }

  function renderSearchResult(data) {
    const node = byId("searchResult");
    if (!node) {
      return;
    }

    const answer = data?.response || "";
    node.innerHTML = `
      <div class="resultCard">
        <h3>Подбор по городу и направлению</h3>
        <div class="richText">${renderMultiline(answer)}</div>
      </div>
    `;
  }

  async function handleRecommendationSubmit(event) {
    event.preventDefault();
    const raw = formToObject(event.currentTarget);

    if (!state.tgId) {
      showStatus("recommendStatus", "Сначала войдите или укажите Telegram ID.", "warning");
      return;
    }

    let scores = {};
    const scoresRaw = String(raw.scores_json || "").trim();
    if (scoresRaw) {
      try {
        scores = JSON.parse(scoresRaw);
      } catch (error) {
        showStatus(
          "recommendStatus",
          "Поле «Баллы (JSON)» должно быть корректным JSON.",
          "error"
        );
        return;
      }
    }

    const payload = {
      tg_id: Number(state.tgId),
      profession: String(raw.profession || "").trim(),
      subjects: splitLines(raw.subjects || ""),
      exam_type: String(raw.exam_type || "").trim().toUpperCase(),
      scores,
      cities: splitLines(raw.cities || ""),
      additional: String(raw.additional || "").trim()
    };

    setGlobalLoading(true);
    showStatus("recommendStatus", "Собираем персональные рекомендации…", "info");

    try {
      const data = await request("/recommend/quiz_submit", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      renderRecommendationResult(data);
      state.lastAiResponse = data.response || "";
      syncSupplementField();
      showStatus("recommendStatus", "Рекомендация готова.", "success");
      await refreshAllData();
    } catch (error) {
      showStatus("recommendStatus", error.message || "Ошибка запроса.", "error");
    } finally {
      setGlobalLoading(false);
    }
  }

  function renderRecommendationResult(data) {
    const node = byId("recommendResult");
    if (!node) {
      return;
    }

    const answer = data?.response || "";
    const hint = data?.score_hint || "";

    node.innerHTML = `
      <div class="resultCard">
        <h3>Персональная рекомендация</h3>
        ${hint ? `<div class="hintBox"><div class="richText">${renderMultiline(hint)}</div></div>` : ""}
        <div class="richText">${renderMultiline(answer)}</div>
      </div>
    `;
  }

  async function handleSupplementSubmit(event) {
    event.preventDefault();
    const raw = formToObject(event.currentTarget);
    const previous = String(raw.previous_response || "").trim();
    const supplement = String(raw.supplement || "").trim();

    if (!previous || !supplement) {
      showStatus(
        "supplementStatus",
        "Нужны исходный ответ и уточняющий запрос.",
        "warning"
      );
      return;
    }

    setGlobalLoading(true);
    showStatus("supplementStatus", "Дополняем ответ…", "info");

    try {
      const data = await request("/supplement", {
        method: "POST",
        body: JSON.stringify({ previous_response: previous, supplement })
      });
      renderSupplementResult(data);
      state.lastAiResponse = data.response || "";
      syncSupplementField();
      showStatus("supplementStatus", "Готово.", "success");
    } catch (error) {
      showStatus("supplementStatus", error.message || "Ошибка.", "error");
    } finally {
      setGlobalLoading(false);
    }
  }

  function renderSupplementResult(data) {
    const node = byId("supplementResult");
    if (!node) {
      return;
    }
    const answer = data?.response || "";
    node.innerHTML = `
      <div class="resultCard">
        <h3>Уточнённый ответ</h3>
        <div class="richText">${renderMultiline(answer)}</div>
      </div>
    `;
  }

  function syncSupplementField() {
    const hidden = byId("supplementPreviousResponse");
    if (hidden) {
      hidden.value = state.lastAiResponse || "";
    }
  }

  async function loadCareerQuestions() {
    const container = byId("careerQuestions");
    if (!container) {
      return;
    }

    setGlobalLoading(true);
    showStatus("careerStatus", "Загружаем вопросы…", "info");

    try {
      const data = await request("/career_test/questions", { method: "GET" });
      state.careerQuestions = Array.isArray(data.items) ? data.items : [];
      renderCareerQuestions(state.careerQuestions);
      showStatus(
        "careerStatus",
        state.careerQuestions.length
          ? "Ответьте на все вопросы и отправьте тест."
          : "Вопросы недоступны.",
        state.careerQuestions.length ? "success" : "warning"
      );
    } catch (error) {
      state.careerQuestions = [];
      renderCareerQuestions([]);
      showStatus("careerStatus", error.message || "Ошибка загрузки.", "error");
    } finally {
      setGlobalLoading(false);
    }
  }

  function renderCareerQuestions(questions) {
    const container = byId("careerQuestions");
    if (!container) {
      return;
    }

    if (!questions.length) {
      container.innerHTML = '<div class="emptyState">Нет вопросов.</div>';
      return;
    }

    container.innerHTML = questions
      .map((question, index) => {
        const qText =
          typeof question === "string"
            ? question
            : question.question || question.text || `Вопрос ${index + 1}`;
        const options = question.options || [];
        const radios = options
          .map((option, optionIndex) => {
            const inputId = `career_q_${index}_${optionIndex}`;
            return `
            <label class="optionChip" for="${inputId}">
              <input type="radio" id="${inputId}" name="career_question_${index}" value="${optionIndex}">
              <span>${escapeHtml(option)}</span>
            </label>`;
          })
          .join("");
        return `
        <fieldset class="questionCard">
          <legend>${index + 1}. ${escapeHtml(qText)}</legend>
          <div class="optionList">${radios}</div>
        </fieldset>`;
      })
      .join("");
  }

  async function handleCareerSubmit(event) {
    event.preventDefault();

    if (!state.careerQuestions.length) {
      showStatus("careerStatus", "Сначала загрузите вопросы.", "warning");
      return;
    }

    const answers = [];
    for (let i = 0; i < state.careerQuestions.length; i += 1) {
      const checked = qs(`input[name="career_question_${i}"]:checked`);
      if (!checked) {
        showStatus("careerStatus", "Ответьте на все вопросы.", "warning");
        return;
      }
      const q = state.careerQuestions[i];
      const opts = q.options || [];
      const idx = Number(checked.value);
      const optionText = opts[idx];
      if (optionText === undefined) {
        showStatus("careerStatus", "Некорректный ответ. Обновите страницу.", "error");
        return;
      }
      answers.push(optionText);
    }

    setGlobalLoading(true);
    showStatus("careerStatus", "Анализируем ответы…", "info");

    try {
      const data = await request("/career_test/submit", {
        method: "POST",
        body: JSON.stringify({ answers })
      });
      renderCareerResult(data);
      state.lastAiResponse = data.result || "";
      syncSupplementField();
      showStatus("careerStatus", "Результат готов.", "success");
    } catch (error) {
      showStatus("careerStatus", error.message || "Ошибка отправки.", "error");
    } finally {
      setGlobalLoading(false);
    }
  }

  function renderCareerResult(data) {
    const node = byId("careerResult");
    if (!node) {
      return;
    }
    const result = data?.result || "";
    node.innerHTML = `
      <div class="resultCard">
        <h3>Профориентация</h3>
        <div class="richText">${renderMultiline(result)}</div>
      </div>
    `;
  }

  function handleLogout() {
    persistTgId(null);
    state.dashboard = null;
    state.lastAiResponse = "";
    fillAuthFields();
    renderFromDashboard(null);
    showStatus("authStatus", "Локальная сессия очищена.", "info");
    setAiResult(byId("aiResultScores"), "");
    setAiResult(byId("aiResultSearch"), "");
    const clearIds = ["searchResult", "recommendResult", "supplementResult", "careerResult"];
    clearIds.forEach((id) => {
      const n = byId(id);
      if (n) {
        n.innerHTML = '<div class="emptyState">Здесь появится результат.</div>';
      }
    });
  }

  function setActiveTab(tabId) {
    if (!tabId) {
      return;
    }

    if (location.hash !== `#${tabId}`) {
      history.replaceState(null, "", `#${tabId}`);
    }

    qsa(".tabbtn[data-tab]").forEach((trigger) => {
      const target = trigger.dataset.tab;
      const active = target === tabId;
      trigger.classList.toggle("active", active);
      trigger.setAttribute("aria-current", active ? "page" : "false");
    });

    const map = {
      home: byId("tabHome"),
      tools: byId("tabTools"),
      history: byId("tabHistory"),
      help: byId("tabHelp"),
      settings: byId("tabSettings")
    };

    Object.entries(map).forEach(([name, node]) => {
      if (!node) {
        return;
      }
      const active = name === tabId;
      node.classList.toggle("hidden", !active);
      if (active) {
        node.classList.remove("tabEnter");
        void node.offsetHeight;
        node.classList.add("tabEnter");
      }
    });
  }

  function initTabs() {
    const triggers = qsa(".tabbtn[data-tab]");
    if (!triggers.length) {
      return;
    }

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        setActiveTab(trigger.dataset.tab);
      });
    });

    const hashTab = location.hash ? location.hash.slice(1) : "";
    const firstTab = triggers[0].dataset.tab || "home";
    const valid = Array.from(triggers).some((t) => t.dataset.tab === hashTab);
    setActiveTab(valid ? hashTab : firstTab);

    window.addEventListener("hashchange", () => {
      const next = location.hash ? location.hash.slice(1) : "";
      if (next && Array.from(triggers).some((t) => t.dataset.tab === next)) {
        setActiveTab(next);
      }
    });
  }

  function initCursorGlow() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    document.addEventListener(
      "pointermove",
      (event) => {
        document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
        document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
        document.documentElement.style.setProperty("--mx", `${(event.clientX / window.innerWidth) * 100}%`);
        document.documentElement.style.setProperty(
          "--my",
          `${(event.clientY / window.innerHeight) * 100}%`
        );
      },
      { passive: true }
    );
  }

  function bindForms() {
    const manualAuthForm = byId("manualAuthForm");
    const legacyLoadBtn = byId("btnLoad");
    const legacyTgInput = byId("tgId") || byId("tgIdInput");
    const searchForm = byId("searchForm");
    const recommendForm = byId("recommendForm");
    const supplementForm = byId("supplementForm");
    const careerForm = byId("careerForm");
    const logoutBtn = byId("logoutBtn");
    const loadCareerBtn = byId("loadCareerBtn");
    const btnRegenFromScore = byId("btnRegenFromScore");
    const btnRegenFromSearch = byId("btnRegenFromSearch");

    if (manualAuthForm) {
      manualAuthForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = byId("tgIdInput") || byId("tgId");
        const tgId = String(input?.value || "").trim();
        if (!tgId) {
          showStatus("authStatus", "Введите Telegram ID.", "warning");
          return;
        }
        persistTgId(tgId);
        fillAuthFields();
        showStatus("authStatus", "Загружаем данные…", "info");
        await refreshAllData();
      });
    }

    if (legacyLoadBtn && !manualAuthForm) {
      legacyLoadBtn.addEventListener("click", async () => {
        const value = String(legacyTgInput?.value || "").trim();
        if (value) {
          persistTgId(value);
          fillAuthFields();
          await refreshAllData();
        } else {
          showStatus("authStatus", "Введите Telegram ID.", "warning");
        }
      });
    }

    if (legacyTgInput) {
      legacyTgInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const value = String(legacyTgInput.value || "").trim();
          if (value) {
            persistTgId(value);
            fillAuthFields();
            await refreshAllData();
          } else {
            showStatus("authStatus", "Введите Telegram ID.", "warning");
          }
        }
      });
    }

    if (searchForm) {
      searchForm.addEventListener("submit", handleSearchSubmit);
    }
    if (recommendForm) {
      recommendForm.addEventListener("submit", handleRecommendationSubmit);
    }
    if (supplementForm) {
      supplementForm.addEventListener("submit", handleSupplementSubmit);
    }
    if (careerForm) {
      careerForm.addEventListener("submit", handleCareerSubmit);
    }
    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }
    if (loadCareerBtn) {
      loadCareerBtn.addEventListener("click", loadCareerQuestions);
    }
    if (btnRegenFromScore) {
      btnRegenFromScore.addEventListener("click", () =>
        handleLegacyRegen("/recommend/from_score", byId("aiResultScores"))
      );
    }
    if (btnRegenFromSearch) {
      btnRegenFromSearch.addEventListener("click", () =>
        handleLegacyRegen("/recommend/from_search", byId("aiResultSearch"))
      );
    }

    qsa("[data-jump-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-jump-tab");
        if (!tab) {
          return;
        }
        location.hash = `#${tab}`;
        const trigger = qs(`.tabbtn[data-tab="${tab}"]`);
        if (trigger) {
          trigger.click();
        }
      });
    });
  }

  function initStateFromStorage() {
    state.tgId = getStoredTgId();
    fillAuthFields();
    if (state.tgId) {
      const input = byId("tgIdInput") || byId("tgId");
      if (input) {
        input.value = state.tgId;
      }
    }
  }

  async function boot() {
    initThemeControls();
    initTabs();
    initCursorGlow();
    initTelegramWidget();
    bindForms();
    initStateFromStorage();

    const spinner = byId("spinner");
    if (spinner) {
      spinner.classList.add("hidden");
    }

    if (state.tgId) {
      await refreshAllData();
    } else {
      renderFromDashboard(null);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
