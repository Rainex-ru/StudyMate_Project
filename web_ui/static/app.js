(function () {
  "use strict";

  const API_BASE = "/api";
  const TELEGRAM_BOT_USERNAME = "StudyMateRU_bot";
  const THEME_KEY = "studymate_theme";
  const TG_ID_KEY = "studymate_tg_id";

  const state = {
    tgId: null,
    authSource: null,
    profile: null,
    dashboard: null,
    searchResult: null,
    recommendationResult: null,
    careerQuestions: [],
    activeTab: null,
    loading: {}
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

  function safeText(value, fallback = "—") {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    return String(value);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&",
      "<": "<",
      ">": ">",
      """: """,
      "'": "'"
    }[char]));
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
      .split(/\n|,/)
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

  function setLoading(key, isLoading) {
    state.loading[key] = !!isLoading;
    qsa(`[data-loading-key="${key}"]`).forEach((node) => {
      node.toggleAttribute("data-loading", !!isLoading);
      if ("disabled" in node) {
        node.disabled = !!isLoading;
      }
    });
  }

  function showStatus(target, message, tone = "info") {
    const node = typeof target === "string" ? byId(target) : target;
    if (!node) {
      return;
    }
    if (!message) {
      node.hidden = true;
      node.textContent = "";
      node.dataset.tone = "";
      return;
    }
    node.hidden = false;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function normalizeCollection(data) {
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.items)) {
      return data.items;
    }
    if (data && Array.isArray(data.history)) {
      return data.history;
    }
    if (data && Array.isArray(data.results)) {
      return data.results;
    }
    return [];
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

  function applyTheme(themeMode) {
    const theme = themeMode || localStorage.getItem(THEME_KEY) || "auto";
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);

    qsa(".segBtn[data-theme]").forEach((button) => {
      const active = button.dataset.theme === theme;
      button.classList.toggle("is-active", active);
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const themePill = byId("wThemePill");
    if (themePill) {
      themePill.textContent = theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark";
    }
  }

  function initThemeControls() {
    applyTheme(localStorage.getItem(THEME_KEY) || "auto");

    qsa(".segBtn[data-theme]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.theme || "auto");
      });
    });
  }

  function setActiveTab(tabId) {
    if (!tabId) {
      return;
    }

    state.activeTab = tabId;
    if (location.hash !== `#${tabId}`) {
      history.replaceState(null, "", `#${tabId}`);
    }

    qsa("[data-tab-target], .tabbtn[data-tab]").forEach((trigger) => {
      const target = trigger.dataset.tabTarget || trigger.dataset.tab;
      const active = target === tabId;
      trigger.classList.toggle("is-active", active);
      trigger.classList.toggle("active", active);
      trigger.setAttribute("aria-selected", active ? "true" : "false");
    });

    qsa("[data-tab-panel]").forEach((panel) => {
      const active = panel.dataset.tabPanel === tabId;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });

    const legacyMap = {
      dashboard: byId("tabDashboard"),
      tools: byId("tabTools"),
      help: byId("tabHelp"),
      settings: byId("tabSettings"),
      scores: byId("tabScores"),
      search: byId("tabSearch")
    };

    Object.entries(legacyMap).forEach(([name, node]) => {
      if (node) {
        const active = name === tabId;
        node.classList.toggle("hidden", !active);
        if (active) {
          node.classList.remove("tabEnter");
          void node.offsetHeight;
          node.classList.add("tabEnter");
        }
      }
    });
  }

  function initTabs() {
    const triggers = qsa("[data-tab-target], .tabbtn[data-tab]");
    if (!triggers.length) {
      return;
    }

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        setActiveTab(trigger.dataset.tabTarget || trigger.dataset.tab);
      });
    });

    const hashTab = location.hash ? location.hash.slice(1) : "";
    const firstTab = triggers[0]?.dataset.tabTarget || triggers[0]?.dataset.tab || "dashboard";
    setActiveTab(hashTab || firstTab);
  }

  function initCursorGlow() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    document.addEventListener("pointermove", (event) => {
      document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
    }, { passive: true });
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
        showStatus("authStatus", error.message || "Не удалось авторизоваться через Telegram.", "error");
      }
    };
  }

  async function handleTelegramAuth(user) {
    if (!user || !user.id) {
      throw new Error("Telegram не передал идентификатор пользователя.");
    }

    setLoading("auth", true);
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

      const data = await request("/telegram_auth", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      persistTgId(user.id);
      state.authSource = "telegram";
      fillAuthFields();
      showStatus("authStatus", data.message || "Telegram аккаунт подключён.", "success");
      await refreshAllData();
    } finally {
      setLoading("auth", false);
    }
  }

  async function handleManualAuth(event) {
    event.preventDefault();

    const input = byId("tgIdInput") || byId("tgId");
    const tgId = String(input?.value || "").trim();

    if (!tgId) {
      showStatus("authStatus", "Введите Telegram ID.", "warning");
      return;
    }

    setLoading("auth", true);
    showStatus("authStatus", "Проверяем ID пользователя…", "info");

    try {
      const data = await request(`/profile?tg_id=${encodeURIComponent(tgId)}`, {
        method: "GET"
      });
      persistTgId(tgId);
      state.authSource = "manual";
      state.profile = data;
      fillAuthFields();
      showStatus("authStatus", "Профиль найден. Данные загружены.", "success");
      await refreshAllData();
    } catch (error) {
      showStatus("authStatus", error.message || "Не удалось загрузить профиль по ID.", "error");
    } finally {
      setLoading("auth", false);
    }
  }

  function handleLogout() {
    persistTgId(null);
    state.profile = null;
    state.dashboard = null;
    state.searchResult = null;
    state.recommendationResult = null;
    fillAuthFields();
    renderProfile(null);
    renderDashboardMeta(null, null, [], []);
    renderHistory("scoreHistoryList", [], "score");
    renderHistory("searchHistoryList", [], "search");
    renderSearchResult(null);
    renderRecommendationResult(null);
    renderSupplementResult(null);
    showStatus("authStatus", "Локальная авторизация очищена.", "info");
  }

  function getAuthQuery() {
    return state.tgId ? `?tg_id=${encodeURIComponent(state.tgId)}` : "";
  }

  async function refreshAllData() {
    if (!state.tgId) {
      fillAuthFields();
      return;
    }
    await Promise.allSettled([
      loadProfile(),
      loadDashboard()
    ]);
  }

  async function loadProfile() {
    if (!state.tgId) {
      return;
    }

    try {
      const data = await request(`/profile${getAuthQuery()}`, { method: "GET" });
      state.profile = data;
      renderProfile(data);
    } catch (error) {
      showStatus("dashboardStatus", error.message || "Не удалось загрузить профиль.", "error");
    }
  }

  async function loadDashboard() {
    if (!state.tgId) {
      return;
    }

    const results = await Promise.allSettled([
      request(`/score_history${getAuthQuery()}`, { method: "GET" }),
      request(`/search_history${getAuthQuery()}`, { method: "GET" }),
      request(`/dashboard${getAuthQuery()}`, { method: "GET" }).catch(() => null)
    ]);

    const scoreData = results[0].status === "fulfilled" ? results[0].value : [];
    const searchData = results[1].status === "fulfilled" ? results[1].value : [];
    const dashboardData = results[2].status === "fulfilled" ? results[2].value : null;

    state.dashboard = {
      scoreHistory: normalizeCollection(scoreData),
      searchHistory: normalizeCollection(searchData),
      meta: dashboardData
    };

    renderDashboardMeta(dashboardData, state.profile, state.dashboard.scoreHistory, state.dashboard.searchHistory);
    renderHistory("scoreHistoryList", state.dashboard.scoreHistory, "score");
    renderHistory("searchHistoryList", state.dashboard.searchHistory, "search");

    renderLegacyScoreHistory(state.dashboard.scoreHistory);
    renderLegacySearchHistory(state.dashboard.searchHistory);
  }

  function statItem(label, value) {
    return `<div class="statItem"><span>${escapeHtml(label)}</span><strong>${escapeHtml(safeText(value))}</strong></div>`;
  }

  function renderProfile(profile) {
    const card = byId("profileCard");
    if (!card) {
      return;
    }

    if (!profile) {
      card.innerHTML = '<div class="emptyState">Авторизуйтесь через Telegram или введите Telegram ID, чтобы увидеть профиль.</div>';
      return;
    }

    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.username || "Пользователь StudyMate";
    const username = profile.username ? `@${profile.username}` : "Без username";
    const photo = profile.photo_url || profile.avatar_url || "";
    const city = profile.city || profile.selected_city || "—";
    const examType = profile.exam_type || profile.selected_exam_type || "—";
    const searchCount = state.dashboard?.searchHistory?.length || 0;
    const scoreCount = state.dashboard?.scoreHistory?.length || 0;

    card.innerHTML = `
      <div class="profileHeader">
        ${photo ? `<img class="profileAvatar" src="${escapeHtml(photo)}" alt="Avatar">` : `<div class="profileAvatar profileAvatar--placeholder">${escapeHtml(fullName.slice(0, 1).toUpperCase())}</div>`}
        <div class="profileMeta">
          <h3>${escapeHtml(fullName)}</h3>
          <p>${escapeHtml(username)}</p>
          <p>${escapeHtml(state.tgId || "—")}</p>
        </div>
      </div>
      <div class="statGrid">
        ${statItem("Город", city)}
        ${statItem("Формат экзамена", examType)}
        ${statItem("История поисков", searchCount)}
        ${statItem("Сохранено результатов", scoreCount)}
      </div>
    `;
  }

  function renderDashboardMeta(meta, profile, scoreHistory, searchHistory) {
    const node = byId("dashboardMetrics");
    const metrics = parseJsonMaybe(meta?.metrics || meta?.summary, null);
    const lastSearch = (searchHistory || [])[0];
    const lastScore = (scoreHistory || [])[0];

    if (node) {
      node.innerHTML = `
        <div class="statGrid">
          ${statItem("Поисков всего", metrics?.search_count ?? (searchHistory || []).length)}
          ${statItem("Рекомендаций всего", metrics?.quiz_count ?? (scoreHistory || []).length)}
          ${statItem("Последний поиск", lastSearch ? formatDate(lastSearch.created_at || lastSearch.timestamp || lastSearch.date) : "—")}
          ${statItem("Последняя рекомендация", lastScore ? formatDate(lastScore.created_at || lastScore.timestamp || lastScore.date) : "—")}
        </div>
      `;
    }

    renderProfile(profile || state.profile);
  }

  function renderHistory(targetId, items, kind) {
    const node = byId(targetId);
    if (!node) {
      return;
    }

    if (!items || !items.length) {
      node.innerHTML = '<div class="emptyState">Пока пусто — после использования инструментов здесь появится история.</div>';
      return;
    }

    node.innerHTML = items.map((item, index) => {
      if (kind === "search") {
        return renderSearchHistoryCard(item, index);
      }
      if (kind === "score") {
        return renderScoreHistoryCard(item, index);
      }
      return renderGenericHistoryCard(item, index);
    }).join("");
  }

  function renderSearchHistoryCard(item, index) {
    const query = item.query || item.city || item.search_text || joinList(item.cities);
    const examType = item.exam_type || item.type || "—";
    const response = item.response || item.result || item.ai_response || "";
    return `
      <article class="historyCard">
        <div class="historyCard__top">
          <strong>Поиск #${index + 1}</strong>
          <span>${escapeHtml(formatDate(item.created_at || item.timestamp || item.date))}</span>
        </div>
        <p><b>Город/запрос:</b> ${escapeHtml(safeText(query))}</p>
        <p><b>Экзамен:</b> ${escapeHtml(safeText(examType))}</p>
        <details>
          <summary>Показать ответ</summary>
          <div class="richText">${renderMultiline(response)}</div>
        </details>
      </article>
    `;
  }

  function renderScoreHistoryCard(item, index) {
    const scores = parseJsonMaybe(item.scores, item.scores);
    const subjects = parseJsonMaybe(item.subjects, item.subjects);
    const cities = parseJsonMaybe(item.cities, item.cities);
    const profession = item.profession || item.target_profession || "—";
    const answer = item.result || item.response || item.ai_response || "";

    return `
      <article class="historyCard">
        <div class="historyCard__top">
          <strong>Рекомендация #${index + 1}</strong>
          <span>${escapeHtml(formatDate(item.created_at || item.timestamp || item.date))}</span>
        </div>
        <p><b>Профессия:</b> ${escapeHtml(safeText(profession))}</p>
        <p><b>Предметы:</b> ${escapeHtml(joinList(subjects))}</p>
        <p><b>Города:</b> ${escapeHtml(joinList(cities))}</p>
        <p><b>Баллы:</b> ${escapeHtml(typeof scores === "object" ? JSON.stringify(scores) : safeText(scores))}</p>
        <details>
          <summary>Показать результат</summary>
          <div class="richText">${renderMultiline(answer)}</div>
        </details>
      </article>
    `;
  }

  function renderGenericHistoryCard(item, index) {
    return `
      <article class="historyCard">
        <div class="historyCard__top">
          <strong>Запись #${index + 1}</strong>
          <span>${escapeHtml(formatDate(item.created_at || item.timestamp || item.date))}</span>
        </div>
        <div class="richText">${renderMultiline(JSON.stringify(item, null, 2))}</div>
      </article>
    `;
  }

  function clearLegacyScoreWidgets() {
    const ids = ["wScoresCount", "wLastExam", "wLastCities", "wScoresExamPill"];
    ids.forEach((id) => {
      const el = byId(id);
      if (el) {
        el.textContent = "—";
      }
    });
    const bars = byId("scoreBars");
    if (bars) {
      bars.innerHTML = "";
    }
  }

  function clearLegacySearchWidgets() {
    const ids = ["wSearchCount", "wLastSearchCity", "wLastSearchExam"];
    ids.forEach((id) => {
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
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, max);
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
    const citiesArr = Array.isArray(latest.cities) ? latest.cities : parseJsonMaybe(latest.cities, []) || [];

    const wScoresCount = byId("wScoresCount");
    const wLastExam = byId("wLastExam");
    const wLastCities = byId("wLastCities");

    if (wScoresCount) wScoresCount.textContent = String(scoresCount);
    if (wLastExam) wLastExam.textContent = examType;
    if (wLastCities) wLastCities.textContent = Array.isArray(citiesArr) && citiesArr.length ? citiesArr.join(", ") : "—";

    renderBarsFromScores(parseJsonMaybe(latest.scores, latest.scores), examType);

    items.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "card";

      const cities = Array.isArray(entry.cities) ? entry.cities.join(", ") : joinList(parseJsonMaybe(entry.cities, entry.cities));
      const subjects = Array.isArray(entry.subjects) ? entry.subjects.join(", ") : joinList(parseJsonMaybe(entry.subjects, entry.subjects));
      const scoresObj = parseJsonMaybe(entry.scores, entry.scores) || {};
      const scoreLines = Object.entries(scoresObj).length
        ? Object.entries(scoresObj).map(([k, v]) => `<div class="scoreLine"><div>${escapeHtml(k)}</div><div style="font-weight:800">${escapeHtml(String(v))}</div></div>`).join("")
        : '<div class="muted">Список баллов пуст.</div>';

      card.innerHTML = `
        <div class="cardTitle">
          <span>${escapeHtml(safeText(entry.exam_type, "Опрос"))}</span>
          <div class="pill">Города: ${escapeHtml(cities || "—")}</div>
        </div>
        <div class="kv">
          <div class="krow"><div class="k">Предметы</div><div class="v">${escapeHtml(subjects || "—")}</div></div>
          <div class="krow"><div class="k">Баллы</div><div class="v">по каждому предмету</div></div>
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

    renderPillCloud(byId("wTopSubjects"), topFreq(items, (row) => safeText(row.subject, "").trim() || "не указано"));
    renderPillCloud(byId("wTopCities"), topFreq(items, (row) => safeText(row.city, "").trim() || "не указано"));

    items.forEach((row) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="cardTitle">
          <span>Поиск</span>
          <div class="pill">${escapeHtml(safeText(row.exam_type))}</div>
        </div>
        <div class="kv">
          <div class="krow"><div class="k">Город</div><div class="v">${escapeHtml(safeText(row.city))}</div></div>
          <div class="krow"><div class="k">Направление</div><div class="v">${escapeHtml(safeText(row.subject))}</div></div>
          <div class="krow"><div class="k">Дата</div><div class="v">${escapeHtml(formatDate(row.created_at))}</div></div>
        </div>
      `;
      list.appendChild(card);
    });
  }

  async function loadCareerQuestions() {
    const container = byId("careerQuestions");
    if (!container) {
      return;
    }

    setLoading("career", true);
    showStatus("careerStatus", "Загружаем вопросы профориентации…", "info");

    try {
      const data = await request("/career_test/questions", { method: "GET" });
      const questions = data.questions || data.items || data;
      state.careerQuestions = Array.isArray(questions) ? questions : [];
      renderCareerQuestions(state.careerQuestions);
      showStatus("careerStatus", state.careerQuestions.length ? "Ответьте на вопросы и получите разбор." : "Вопросы пока недоступны.", state.careerQuestions.length ? "success" : "warning");
    } catch (error) {
      renderCareerQuestions([]);
      showStatus("careerStatus", error.message || "Не удалось загрузить вопросы.", "error");
    } finally {
      setLoading("career", false);
    }
  }

  function renderCareerQuestions(questions) {
    const container = byId("careerQuestions");
    if (!container) {
      return;
    }

    if (!questions || !questions.length) {
      container.innerHTML = '<div class="emptyState">Вопросы пока не загружены.</div>';
      return;
    }

    container.innerHTML = questions.map((question, index) => {
      const qText = typeof question === "string" ? question : (question.question || question.text || `Вопрос ${index + 1}`);
      const options = question.options || [
        "Полностью не согласен",
        "Скорее не согласен",
        "Нейтрально",
        "Скорее согласен",
        "Полностью согласен"
      ];

      return `
        <fieldset class="questionCard">
          <legend>${index + 1}. ${escapeHtml(qText)}</legend>
          <div class="optionList">
            ${options.map((option, optionIndex) => {
              const value = question.values && question.values[optionIndex] !== undefined ? question.values[optionIndex] : (optionIndex + 1);
              const inputName = `career_question_${index}`;
              const inputId = `${inputName}_${optionIndex}`;
              return `
                <label class="optionChip" for="${inputId}">
                  <input type="radio" id="${inputId}" name="${inputName}" value="${escapeHtml(String(value))}">
                  <span>${escapeHtml(option)}</span>
                </label>
              `;
            }).join("")}
          </div>
        </fieldset>
      `;
    }).join("");
  }

  async function handleCareerSubmit(event) {
    event.preventDefault();

    if (!state.careerQuestions.length) {
      showStatus("careerStatus", "Сначала загрузите вопросы теста.", "warning");
      return;
    }

    const answers = [];
    for (let i = 0; i < state.careerQuestions.length; i += 1) {
      const checked = qs(`input[name="career_question_${i}"]:checked`);
      if (!checked) {
        showStatus("careerStatus", "Ответьте на все вопросы теста.", "warning");
        return;
      }
      answers.push(checked.value);
    }

    setLoading("career", true);
    showStatus("careerStatus", "Анализируем ваши ответы…", "info");

    try {
      const data = await request("/career_test/submit", {
        method: "POST",
        body: JSON.stringify({
          tg_id: state.tgId || null,
          answers
        })
      });
      renderCareerResult(data);
      showStatus("careerStatus", "Профориентационный результат готов.", "success");
    } catch (error) {
      showStatus("careerStatus", error.message || "Не удалось отправить ответы теста.", "error");
    } finally {
      setLoading("career", false);
    }
  }

  function renderCareerResult(data) {
    const node = byId("careerResult");
    if (!node) {
      return;
    }
    const result = data?.result || data?.response || data?.analysis || data?.text || "";
    node.innerHTML = `<div class="resultCard"><h3>Ваш карьерный вектор</h3><div class="richText">${renderMultiline(result)}</div></div>`;
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

  function collectScores(form, raw) {
    const scoreMap = {};
    qsa("[data-score-subject]", form).forEach((input) => {
      const subject = (input.dataset.scoreSubject || "").trim();
      const value = String(input.value || "").trim();
      if (subject && value !== "") {
        scoreMap[subject] = value;
      }
    });

    if (Object.keys(scoreMap).length) {
      return scoreMap;
    }
    if (raw.scores_json) {
      return parseJsonMaybe(raw.scores_json, {});
    }
    if (raw.scores) {
      return raw.scores;
    }
    return {};
  }

  function syncSupplementSource(data) {
    const hidden = byId("supplementPreviousResponse");
    if (!hidden || !data) {
      return;
    }
    hidden.value = data.result || data.response || data.text || data.answer || "";
  }

  async function handleSearchSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = formToObject(form);

    const payload = {
      tg_id: state.tgId || null,
      city: raw.city || raw.search_city || "",
      cities: splitLines(raw.cities || raw.city || raw.search_city || ""),
      exam_type: raw.exam_type || raw.search_exam_type || "",
      profession: raw.profession || "",
      subjects: splitLines(raw.subjects || ""),
      additional: raw.additional || raw.search_additional || ""
    };

    setLoading("search", true);
    showStatus("searchStatus", "Ищем университеты и подходящие программы…", "info");

    try {
      const data = await request("/university_search", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.searchResult = data;
      renderSearchResult(data);
      syncSupplementSource(data);
      showStatus("searchStatus", "Поиск завершён.", "success");
      if (state.tgId) {
        await loadDashboard();
      }
    } catch (error) {
      showStatus("searchStatus", error.message || "Ошибка поиска университетов.", "error");
    } finally {
      setLoading("search", false);
    }
  }

  function renderSearchResult(data) {
    const node = byId("searchResult");
    if (!node) {
      return;
    }

    if (!data) {
      node.innerHTML = '<div class="emptyState">Здесь появится ответ по университетам после отправки формы.</div>';
      return;
    }

    const answer = data.result || data.response || data.text || data.answer || "";
    const suggestions = data.universities || data.items || [];
    const cards = Array.isArray(suggestions) && suggestions.length
      ? suggestions.map((item) => {
        if (typeof item === "string") {
          return `<li>${escapeHtml(item)}</li>`;
        }
        return `<li><b>${escapeHtml(item.name || item.university || "Университет")}</b>${item.city ? ` — ${escapeHtml(item.city)}` : ""}${item.program ? `<br>${escapeHtml(item.program)}` : ""}</li>`;
      }).join("")
      : "";

    node.innerHTML = `
      <div class="resultCard">
        <h3>Подбор университетов</h3>
        <div class="richText">${renderMultiline(answer)}</div>
        ${cards ? `<div class="resultListWrap"><h4>Выделенные варианты</h4><ul class="resultList">${cards}</ul></div>` : ""}
      </div>
    `;
  }

  async function handleRecommendationSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = formToObject(form);

    const payload = {
      tg_id: state.tgId || null,
      profession: raw.profession || raw.target_profession || "",
      subjects: splitLines(raw.subjects || ""),
      exam_type: raw.exam_type || "",
      scores: collectScores(form, raw),
      cities: splitLines(raw.cities || raw.city || ""),
      additional: raw.additional || ""
    };

    setLoading("recommend", true);
    showStatus("recommendStatus", "Собираем персональные рекомендации…", "info");

    try {
      const data = await request("/recommendation_quiz", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.recommendationResult = data;
      renderRecommendationResult(data);
      syncSupplementSource(data);
      showStatus("recommendStatus", "Рекомендация готова.", "success");
      if (state.tgId) {
        await loadDashboard();
      }
    } catch (error) {
      showStatus("recommendStatus", error.message || "Не удалось получить рекомендацию.", "error");
    } finally {
      setLoading("recommend", false);
    }
  }

  function renderRecommendationResult(data) {
    const node = byId("recommendResult");
    if (!node) {
      return;
    }

    if (!data) {
      node.innerHTML = '<div class="emptyState">После отправки анкеты здесь появится персональная рекомендация.</div>';
      return;
    }

    const answer = data.result || data.response || data.text || data.answer || "";
    const hint = data.score_hint || data.hint || "";
    const recommendations = data.recommendations || data.items || [];

    node.innerHTML = `
      <div class="resultCard">
        <h3>Персональная рекомендация</h3>
        ${hint ? `<div class="hintBox">${renderMultiline(hint)}</div>` : ""}
        <div class="richText">${renderMultiline(answer)}</div>
        ${Array.isArray(recommendations) && recommendations.length ? `<ul class="resultList">${recommendations.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : (item.name || JSON.stringify(item)))}</li>`).join("")}</ul>` : ""}
      </div>
    `;
  }

  async function handleSupplementSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = formToObject(form);
    const previous = raw.previous_response || raw.previous || "";
    const supplement = raw.supplement || raw.question || "";

    if (!previous || !supplement) {
      showStatus("supplementStatus", "Нужны исходный ответ и уточняющий запрос.", "warning");
      return;
    }

    setLoading("supplement", true);
    showStatus("supplementStatus", "Дополняем предыдущий ответ…", "info");

    try {
      const data = await request("/supplement", {
        method: "POST",
        body: JSON.stringify({
          tg_id: state.tgId || null,
          previous_response: previous,
          supplement
        })
      });
      renderSupplementResult(data);
      showStatus("supplementStatus", "Дополнение готово.", "success");
    } catch (error) {
      showStatus("supplementStatus", error.message || "Не удалось получить дополнение.", "error");
    } finally {
      setLoading("supplement", false);
    }
  }

  function renderSupplementResult(data) {
    const node = byId("supplementResult");
    if (!node) {
      return;
    }

    if (!data) {
      node.innerHTML = '<div class="emptyState">Здесь появится дополнение к предыдущему AI-ответу.</div>';
      return;
    }

    const answer = data.result || data.response || data.text || data.answer || "";
    node.innerHTML = `<div class="resultCard"><h3>Дополнение</h3><div class="richText">${renderMultiline(answer)}</div></div>`;
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
    const tgId = state.tgId || String((byId("tgId") || byId("tgIdInput"))?.value || "").trim();
    if (!tgId) {
      alert("Введите Telegram ID.");
      return;
    }

    try {
      const data = await request(`${endpoint}?tg_id=${encodeURIComponent(tgId)}`, {
        method: "POST"
      });
      setAiResult(targetEl, data.response || data.result || "");
    } catch (error) {
      setAiResult(targetEl, `Ошибка: ${error.message || "неизвестная"}`);
    }
  }

  function bindForms() {
    const manualAuthForm = byId("manualAuthForm");
    const legacyLoadBtn = byId("btnLoad");
    const legacyTgInput = byId("tgId");
    const searchForm = byId("searchForm");
    const recommendForm = byId("recommendForm");
    const supplementForm = byId("supplementForm");
    const careerForm = byId("careerForm");
    const logoutBtn = byId("logoutBtn");
    const loadCareerBtn = byId("loadCareerBtn");
    const btnRegenFromScore = byId("btnRegenFromScore");
    const btnRegenFromSearch = byId("btnRegenFromSearch");

    if (manualAuthForm) {
      manualAuthForm.addEventListener("submit", handleManualAuth);
    }

    if (legacyLoadBtn) {
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
      btnRegenFromScore.addEventListener("click", () => handleLegacyRegen("/recommend/from_score", byId("aiResultScores")));
    }
    if (btnRegenFromSearch) {
      btnRegenFromSearch.addEventListener("click", () => handleLegacyRegen("/recommend/from_search", byId("aiResultSearch")));
    }
  }

  function initStateFromStorage() {
    state.tgId = getStoredTgId();
    fillAuthFields();
    if (state.tgId) {
      const input = byId("tgIdInput") || byId("tgId");
      if (input) {
        input.value = state.tgId;
      }
      showStatus("authStatus", "Используем сохранённый Telegram ID.", "info");
    }
  }

  function bootPlaceholders() {
    renderProfile(null);
    renderDashboardMeta(null, null, [], []);
    renderSearchResult(null);
    renderRecommendationResult(null);
    renderSupplementResult(null);
    renderHistory("scoreHistoryList", [], "score");
    renderHistory("searchHistoryList", [], "search");
  }

  async function init() {
    initThemeControls();
    initTabs();
    initCursorGlow();
    initTelegramWidget();
    bindForms();
    initStateFromStorage();
    bootPlaceholders();

    if (state.tgId) {
      await refreshAllData();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();