const els = {
  tgId: document.getElementById("tgId"),
  btnLoad: document.getElementById("btnLoad"),
  spinner: document.getElementById("spinner"),
  tabScores: document.getElementById("tabScores"),
  tabSearch: document.getElementById("tabSearch"),
  tabSettings: document.getElementById("tabSettings"),
  scoresList: document.getElementById("scoresList"),
  scoresEmpty: document.getElementById("scoresEmpty"),
  searchList: document.getElementById("searchList"),
  searchEmpty: document.getElementById("searchEmpty"),
  scoresMeta: document.getElementById("scoresMeta"),
  searchMeta: document.getElementById("searchMeta"),
  scoreBars: document.getElementById("scoreBars"),

  wScoresCount: document.getElementById("wScoresCount"),
  wLastExam: document.getElementById("wLastExam"),
  wLastCities: document.getElementById("wLastCities"),
  wScoresExamPill: document.getElementById("wScoresExamPill"),

  wSearchCount: document.getElementById("wSearchCount"),
  wLastSearchCity: document.getElementById("wLastSearchCity"),
  wLastSearchExam: document.getElementById("wLastSearchExam"),
  wTopSubjects: document.getElementById("wTopSubjects"),
  wTopCities: document.getElementById("wTopCities"),

  themePill: document.getElementById("wThemePill"),
  themeButtons: Array.from(document.querySelectorAll(".segBtn[data-theme]")),

  btnRegenFromScore: document.getElementById("btnRegenFromScore"),
  aiResultScores: document.getElementById("aiResultScores"),
  btnRegenFromSearch: document.getElementById("btnRegenFromSearch"),
  aiResultSearch: document.getElementById("aiResultSearch"),

  tabs: Array.from(document.querySelectorAll(".tabbtn")),
};

function setTab(tabName, originEl) {
  if (originEl) {
    const r = originEl.getBoundingClientRect();
    const lens = document.createElement("div");
    lens.className = "lens";
    lens.style.left = `${r.left + r.width / 2}px`;
    lens.style.top = `${r.top + r.height / 2}px`;
    document.body.appendChild(lens);
    lens.addEventListener("animationend", () => lens.remove());
  }

  els.tabScores.classList.toggle("hidden", tabName !== "scores");
  els.tabSearch.classList.toggle("hidden", tabName !== "search");
  els.tabSettings.classList.toggle("hidden", tabName !== "settings");

  for (const b of els.tabs) {
    const isActive = b.dataset.tab === tabName;
    b.classList.toggle("active", isActive);
  }

  const active = tabName === "scores" ? els.tabScores : tabName === "search" ? els.tabSearch : els.tabSettings;
  active.classList.remove("tabEnter");
  // Force reflow so animation restarts reliably
  void active.offsetHeight;
  active.classList.add("tabEnter");
}

function showSpinner(on) {
  els.spinner.style.display = on ? "block" : "none";
}

function safeText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function formatDate(iso) {
  const v = safeText(iso).trim();
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function clearScoreWidgets() {
  if (els.wScoresCount) els.wScoresCount.textContent = "—";
  if (els.wLastExam) els.wLastExam.textContent = "—";
  if (els.wLastCities) els.wLastCities.textContent = "—";
  if (els.wScoresExamPill) els.wScoresExamPill.textContent = "—";
  if (els.scoreBars) els.scoreBars.innerHTML = "";
}

function clearSearchWidgets() {
  if (els.wSearchCount) els.wSearchCount.textContent = "—";
  if (els.wLastSearchCity) els.wLastSearchCity.textContent = "—";
  if (els.wLastSearchExam) els.wLastSearchExam.textContent = "—";
  if (els.wTopSubjects) els.wTopSubjects.innerHTML = "";
  if (els.wTopCities) els.wTopCities.innerHTML = "";
}

function applyTheme(themeMode) {
  // themeMode: auto | dark | light
  const body = document.body;
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  let actual = themeMode;
  if (themeMode === "auto" && mq) actual = mq.matches ? "light" : "dark";
  if (themeMode === "auto" && !mq) actual = "dark";

  body.setAttribute("data-theme", actual);

  if (els.themePill) {
    els.themePill.textContent = themeMode === "auto" ? "Auto" : actual === "light" ? "Light" : "Dark";
  }

  for (const b of els.themeButtons) {
    const t = b.dataset.theme;
    b.dataset.active = String(t === themeMode);
  }
}

function initTheme() {
  const saved = localStorage.getItem("studymate_theme") || "auto";
  applyTheme(saved);

  for (const b of els.themeButtons) {
    b.addEventListener("click", () => {
      const themeMode = b.dataset.theme || "auto";
      localStorage.setItem("studymate_theme", themeMode);
      applyTheme(themeMode);
    });
  }

  if (saved === "auto" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", () => applyTheme("auto"));
  }
}

function renderBarsFromScores(scoresObj, examType) {
  els.scoreBars.innerHTML = "";

  if (!scoresObj || typeof scoresObj !== "object") return;

  const entries = Object.entries(scoresObj)
    .map(([k, v]) => ({ k: String(k), v: Number(v) }))
    .filter((x) => Number.isFinite(x.v))
    .sort((a, b) => b.v - a.v);

  const top = entries.slice(0, 5);
  while (top.length < 5) top.push({ k: "", v: 0 });

  if (els.wScoresExamPill) els.wScoresExamPill.textContent = examType || "Опрос";

  for (const item of top) {
    const height = Math.max(6, Math.min(100, item.v)) / 100 * 100;
    const wrap = document.createElement("div");
    wrap.className = "barItem";

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${height}%`;

    const label = document.createElement("div");
    label.className = "barLabel";
    label.textContent = item.k || "—";

    wrap.appendChild(bar);
    wrap.appendChild(label);
    els.scoreBars.appendChild(wrap);
  }
}

function renderScoreWidgets(items) {
  clearScoreWidgets();
  if (!items || items.length === 0) return;

  const latest = items[0];
  const scoresCount = items.length;
  const examType = safeText(latest.exam_type);
  const citiesArr = Array.isArray(latest.cities) ? latest.cities : [];

  els.wScoresCount.textContent = String(scoresCount);
  els.wLastExam.textContent = examType || "—";
  els.wLastCities.textContent = citiesArr.length ? citiesArr.join(", ") : "—";

  renderBarsFromScores(latest.scores, examType);
}

function topFreq(rows, keyFn, max = 8) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
}

function renderPillCloud(container, entries) {
  container.innerHTML = "";
  if (!entries || entries.length === 0) return;
  for (const [name, count] of entries) {
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `<b>${name}</b><span>${count}×</span>`;
    container.appendChild(tag);
  }
}

function renderSearchWidgets(items) {
  clearSearchWidgets();
  if (!items || items.length === 0) return;

  const latest = items[0];
  els.wSearchCount.textContent = String(items.length);
  els.wLastSearchCity.textContent = safeText(latest.city) || "—";
  els.wLastSearchExam.textContent = safeText(latest.exam_type) || "—";

  const topSubjects = topFreq(items, (r) => safeText(r.subject).trim() || "не указано", 8);
  const topCities = topFreq(items, (r) => safeText(r.city).trim() || "не указано", 8);

  renderPillCloud(els.wTopSubjects, topSubjects);
  renderPillCloud(els.wTopCities, topCities);
}

function setAiResult(el, text) {
  if (!el) return;
  el.innerHTML = "";
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const p = document.createElement("div");
  p.className = "aiText";
  p.textContent = text;
  el.appendChild(p);
}

function renderScoreHistory(items) {
  renderScoreWidgets(items);
  els.scoresList.innerHTML = "";
  els.scoresEmpty.hidden = items && items.length > 0;

  els.scoresMeta.textContent = items?.length
    ? `${items.length} запис(ей)`
    : "—";

  if (!items || items.length === 0) return;

  for (const entry of items) {
    const card = document.createElement("div");
    card.className = "card";

    const examType = safeText(entry.exam_type);
    const cities = Array.isArray(entry.cities) ? entry.cities.join(", ") : "";
    const subjects = Array.isArray(entry.subjects) ? entry.subjects.join(", ") : "";
    const scoresObj = entry.scores && typeof entry.scores === "object" ? entry.scores : {};

    const title = document.createElement("div");
    title.className = "cardTitle";
    title.innerHTML = `<span>${examType || "Опрос"}</span>`;

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = cities ? `Города: ${cities}` : "Города: —";
    title.appendChild(pill);

    const kv = document.createElement("div");
    kv.className = "kv";
    kv.innerHTML = `
      <div class="krow"><div class="k">Предметы</div><div class="v">${subjects || "—"}</div></div>
      <div class="krow"><div class="k">Баллы</div><div class="v">по каждому предмету</div></div>
    `;

    const scores = document.createElement("div");
    scores.className = "scores";

    const entries = Object.entries(scoresObj);
    if (entries.length === 0) {
      const emptyLine = document.createElement("div");
      emptyLine.className = "muted";
      emptyLine.textContent = "Список баллов пуст.";
      scores.appendChild(emptyLine);
    } else {
      for (const [k, v] of entries) {
        const line = document.createElement("div");
        line.className = "scoreLine";
        const left = document.createElement("div");
        left.textContent = safeText(k);
        const right = document.createElement("div");
        right.style.fontWeight = "800";
        right.textContent = safeText(v);
        line.appendChild(left);
        line.appendChild(right);
        scores.appendChild(line);
      }
    }

    card.appendChild(title);
    card.appendChild(kv);
    card.appendChild(scores);

    els.scoresList.appendChild(card);
  }
}

function renderSearchHistory(items) {
  renderSearchWidgets(items);
  els.searchList.innerHTML = "";
  els.searchEmpty.hidden = items && items.length > 0;

  els.searchMeta.textContent = items?.length
    ? `${items.length} запис(ей)`
    : "—";

  if (!items || items.length === 0) return;

  for (const row of items) {
    const card = document.createElement("div");
    card.className = "card";

    const city = safeText(row.city);
    const subject = safeText(row.subject);
    const examType = safeText(row.exam_type);
    const createdAt = formatDate(row.created_at);

    card.innerHTML = `
      <div class="cardTitle">
        <span>Поиск</span>
        <div class="pill">${examType || "—"}</div>
      </div>

      <div class="kv">
        <div class="krow"><div class="k">Город</div><div class="v">${city || "—"}</div></div>
        <div class="krow"><div class="k">Направление</div><div class="v">${subject || "—"}</div></div>
        <div class="krow"><div class="k">Дата</div><div class="v">${createdAt || "—"}</div></div>
      </div>
    `;

    els.searchList.appendChild(card);
  }
}

async function loadProfile() {
  const tgId = safeText(els.tgId.value).trim();
  if (!tgId) {
    alert("Введите Telegram ID.");
    return;
  }

  showSpinner(true);
  try {
    const url = `/api/profile?tg_id=${encodeURIComponent(tgId)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Не удалось загрузить данные.");
    }

    renderScoreHistory(data?.score_history || []);
    renderSearchHistory(data?.search_history || []);
  } catch (e) {
    console.error(e);
    alert(e?.message || "Ошибка при загрузке.");
  } finally {
    showSpinner(false);
  }
}

function attachTabHandlers() {
  for (const b of els.tabs) {
    b.addEventListener("click", (e) => setTab(b.dataset.tab, e.currentTarget));
  }
}

async function init() {
  attachTabHandlers();
  initTheme();

  setTab("scores");
  els.spinner.style.display = "none";

  const saved = localStorage.getItem("studymate_tg_id") || "";
  if (saved) els.tgId.value = saved;

  els.btnLoad.addEventListener("click", () => {
    localStorage.setItem("studymate_tg_id", safeText(els.tgId.value).trim());
    loadProfile();
  });

  els.tgId.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      localStorage.setItem("studymate_tg_id", safeText(els.tgId.value).trim());
      loadProfile();
    }
  });

  // Ленивая загрузка, только если уже есть ID
  if (saved) loadProfile();

  els.btnRegenFromScore?.addEventListener("click", async () => {
    const tgId = safeText(els.tgId.value).trim();
    if (!tgId) return alert("Введите Telegram ID.");

    showSpinner(true);
    try {
      const res = await fetch(`/api/recommend/from_score?tg_id=${encodeURIComponent(tgId)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Не удалось получить рекомендации.");
      setAiResult(els.aiResultScores, data?.response || "");
    } catch (e) {
      console.error(e);
      setAiResult(els.aiResultScores, `Ошибка: ${e?.message || "неизвестная"}`);
    } finally {
      showSpinner(false);
    }
  });

  els.btnRegenFromSearch?.addEventListener("click", async () => {
    const tgId = safeText(els.tgId.value).trim();
    if (!tgId) return alert("Введите Telegram ID.");

    showSpinner(true);
    try {
      const res = await fetch(`/api/recommend/from_search?tg_id=${encodeURIComponent(tgId)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Не удалось получить рекомендации.");
      setAiResult(els.aiResultSearch, data?.response || "");
    } catch (e) {
      console.error(e);
      setAiResult(els.aiResultSearch, `Ошибка: ${e?.message || "неизвестная"}`);
    } finally {
      showSpinner(false);
    }
  });
}

init();

