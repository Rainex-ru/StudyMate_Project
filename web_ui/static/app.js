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
  tabs: Array.from(document.querySelectorAll(".tabbtn")),
};

function setTab(tabName) {
  els.tabScores.classList.toggle("hidden", tabName !== "scores");
  els.tabSearch.classList.toggle("hidden", tabName !== "search");
  els.tabSettings.classList.toggle("hidden", tabName !== "settings");

  for (const b of els.tabs) {
    const isActive = b.dataset.tab === tabName;
    b.classList.toggle("active", isActive);
  }
}

function showSpinner(on) {
  els.spinner.style.display = on ? "block" : "none";
}

function safeText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function renderScoreHistory(items) {
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
    const createdAt = safeText(row.created_at);

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
    b.addEventListener("click", () => setTab(b.dataset.tab));
  }
}

async function init() {
  attachTabHandlers();

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
}

init();

