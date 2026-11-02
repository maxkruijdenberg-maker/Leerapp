"use strict";

const api = window.academy;
const main = document.querySelector("#main");
const modal = document.querySelector("#modal");
let data = { packages: [], modules: [], progress: {} };
let route = { view: "home" };
let quiz = null;
let timer = null;
let saveQueue = Promise.resolve();
let fullscreen = true;

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const attr = esc;
const key = (p, t) => p.id + "/" + t.id;
const qkey = (p, t, q) => key(p, t) + "/" + q.id;
const media = (p, file) =>
  "academy://media/" +
  encodeURIComponent(p.id) +
  "/" +
  file.split("/").map(encodeURIComponent).join("/");
const btn = (label, action, extra = "", cls = "") =>
  `<button data-action="${action}" ${extra} class="${cls}">${label}</button>`;
const allTopics = () =>
  data.packages.flatMap((p) => p.topics.map((t) => ({ p, t })));
const modules = () =>
  data.modules?.length
    ? data.modules
    : [
        ...new Map(
          data.packages.map((p) => [
            p.moduleId,
            { id: p.moduleId, title: p.moduleTitle },
          ]),
        ).values(),
      ];
const moduleById = (id) => modules().find((m) => m.id === id);
const topicVideos = (t) => {
  const videos = [...(t.videos || [])];
  if (t.video && !videos.some((video) => video.file === t.video))
    videos.unshift({ id: "legacy-video", title: "Uitlegvideo", file: t.video });
  return videos;
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const questionTypes = {
  choice: "Meerkeuze",
  number: "Rekenvraag",
  open: "Open vraag",
};

function initProgress() {
  data.progress ||= {};
  data.progress.topics ??= {};
  data.progress.questions ??= {};
  data.progress.attempts ??= [];
}
function tp(p, t) {
  return data.progress.topics[key(p, t)] || {};
}
function save() {
  const snapshot = JSON.parse(JSON.stringify(data.progress));
  saveQueue = saveQueue.catch(() => {}).then(() => api.save(snapshot));
  saveQueue.catch((e) => toast("Opslaan mislukt: " + e.message));
  return saveQueue;
}
function acceptState(state) {
  data = state;
  initProgress();
}
function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.style.display = "block";
  clearTimeout(element.hide);
  element.hide = setTimeout(() => {
    element.style.display = "none";
  }, 6000);
}
function markdown(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map((block) => {
      if (/^### /.test(block)) return "<h3>" + esc(block.slice(4)) + "</h3>";
      if (/^## /.test(block)) return "<h2>" + esc(block.slice(3)) + "</h2>";
      if (/^# /.test(block)) return "<h2>" + esc(block.slice(2)) + "</h2>";
      if (block.split("\n").every((line) => /^[-*] /.test(line)))
        return (
          "<ul>" +
          block
            .split("\n")
            .map((line) => "<li>" + esc(line.slice(2)) + "</li>")
            .join("") +
          "</ul>"
        );
      return (
        "<p>" +
        esc(block).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") +
        "</p>"
      );
    })
    .join("");
}
function chosen() {
  const p = data.packages.find((pkg) => pkg.id === route.p);
  return { p, t: p?.topics.find((topic) => topic.id === route.t) };
}
function openAttrs(p, t) {
  return `data-p="${attr(p.id)}" data-t="${attr(t.id)}"`;
}
function pauseMedia(scope = main) {
  scope.querySelectorAll("video").forEach((video) => {
    video.savePosition?.();
    video.pause();
  });
}
function nav() {
  const currentModule = route.moduleId || chosen().p?.moduleId;
  document.querySelector("#nav").innerHTML = [
    ["home", "⌂", "Mijn studeerkamer"],
    ["review", "↻", "Herhalen"],
    ["progress", "◷", "Mijn voortgang"],
    [
      "settings",
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h2m4 0h12"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
      "Instellingen",
    ],
  ]
    .map(([view, icon, label]) =>
      btn(
        `<span class="nav-icon" aria-hidden="true">${icon}</span>${label}`,
        "nav",
        `data-view="${view}" ${route.view === view ? 'aria-current="page"' : ""}`,
        route.view === view ? "active" : "",
      ),
    )
    .join("");
  document.querySelector("#modules").innerHTML =
    modules()
      .map((module, i) =>
        btn(
          `<span class="module-number">${String(i + 1).padStart(2, "0")}</span><span>${esc(module.title)}</span>`,
          "module",
          `data-id="${attr(module.id)}" ${module.id === currentModule ? 'aria-current="page"' : ""}`,
          module.id === currentModule ? "active" : "",
        ),
      )
      .join("") ||
    '<p class="sidebar-empty">Geef jouw eerste module een naam met ＋.</p>';
}
function go(nextRoute) {
  if (
    quiz &&
    route.view === "quiz" &&
    !quiz.done &&
    !confirm(
      "Je huidige sessie verlaten? Niet ingeleverde antwoorden gaan verloren.",
    )
  )
    return;
  pauseMedia();
  clearInterval(timer);
  quiz = null;
  route = nextRoute;
  render();
  main.focus();
}
function render() {
  nav();
  const { p, t } = chosen();
  const titles = {
    home: "Mijn studeerkamer",
    review: "Herhalen",
    progress: "Mijn voortgang",
    settings: "Instellingen",
    quiz: "Oefenen & toetsen",
  };
  document.querySelector("#breadcrumb").textContent =
    route.view === "topic"
      ? `${moduleById(p?.moduleId)?.title || p?.moduleTitle || ""}  /  ${t?.title || ""}`
      : route.view === "module"
        ? moduleById(route.moduleId)?.title || "Module"
        : titles[route.view];
  const pages = {
    home,
    module: modulePage,
    topic: topicPage,
    settings,
    progress: progressPage,
    review: reviewPage,
    quiz: quizPage,
  };
  pages[route.view]?.();
}
function art() {
  return `<svg class="hero-art" viewBox="0 0 480 320" fill="none" stroke="currentColor" aria-hidden="true"><g stroke-width="1"><path d="M24 284h432M48 272h384M64 260h352M88 250V126l152-88 152 88v124M72 126h336M95 132h290M104 144v94m16-94v94m40-94v94m16-94v94m40-94v94m16-94v94m40-94v94m16-94v94m40-94v94m16-94v94m40-94v94m16-94v94M88 119l152-80 152 80H88ZM102 244h276M80 253h320"/><path d="M16 292h448M40 300h400M240 18v18M226 25h28M40 232v-92m-5 8 5-8 5 8M440 232v-92m-5 8 5-8 5 8" opacity=".5"/><circle cx="240" cy="86" r="16"/><path d="M230 90l10-17 10 17h-20Z"/></g></svg>`;
}
function empty(title, copy, actionHtml = "") {
  return `<div class="empty"><span class="empty-mark">◇</span><h2>${title}</h2><p>${copy}</p>${actionHtml}</div>`;
}
function home() {
  const topics = allTopics();
  const done = topics.filter(({ p, t }) => tp(p, t).done).length;
  const next =
    topics.find(({ p, t }) => key(p, t) === data.progress.last) ||
    topics.find(({ p, t }) => !tp(p, t).done);
  const list = modules();
  main.innerHTML = `<div class="page-intro"><div class="eyebrow">RUIMTE VOOR KENNIS</div><h1>Jouw eigen studeerkamer.</h1><p>Een heldere plek voor alles wat je wilt leren.</p></div>
    <section class="hero"><div class="hero-content"><div class="eyebrow">${next ? "GA VERDER WAAR JE BLEEF" : "EEN GOED BEGIN"}</div><h2>${next ? esc(next.t.title) : "Geef jouw kennis de ruimte."}</h2><p>${next ? esc(moduleById(next.p.moduleId)?.title || next.p.moduleTitle) + " · Lees, bekijk en oefen op jouw tempo." : "Maak een module, voeg onderwerpen toe en verzamel je eigen lesmateriaal."}</p>${next ? btn('Verder met mijn onderwerp <svg class="arrow-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg>', "topic", openAttrs(next.p, next.t), "primary") : list.length ? btn("Voeg een onderwerp toe", "new", `data-module="${attr(list[0].id)}"`, "primary") : btn("Mijn eerste module maken", "newModule", "", "primary")}</div>${art()}</section>
    <div class="overview-line"><span><strong>${list.length}</strong> modules</span><span><strong>${topics.length}</strong> onderwerpen</span><span><strong>${done}</strong> afgerond</span><span><strong>${data.progress.attempts.length}</strong> toetsen gemaakt</span></div>
    <div class="section-heading"><div><div class="eyebrow">JOUW VERZAMELING</div><h2>Mijn modules</h2></div><span class="quiet">Vrij in te delen. Helemaal van jou.</span></div>
    ${
      list.length
        ? `<div class="module-grid">${list
            .map((module, i) => {
              const moduleTopics = topics.filter(
                ({ p }) => p.moduleId === module.id,
              );
              const completed = moduleTopics.filter(
                ({ p, t }) => tp(p, t).done,
              ).length;
              return `<article class="module-card"><div class="module-card-top"><span class="number">${String(i + 1).padStart(2, "0")}</span><span class="module-glyph" aria-hidden="true">⌂</span></div><h3>${esc(module.title)}</h3><p>${moduleTopics.length} ${moduleTopics.length === 1 ? "onderwerp" : "onderwerpen"} · ${completed} afgerond</p><div class="bar"><span style="width:${moduleTopics.length ? (completed / moduleTopics.length) * 100 : 0}%"></span></div><div class="module-card-footer"><small>${moduleTopics.length ? "Jouw leerroute ligt klaar." : "Begin met je eerste onderwerp."}</small>${btn('Open module <svg class="arrow-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg>', "module", `data-id="${attr(module.id)}"`, "text-button")}</div></article>`;
            })
            .join("")}</div>`
        : empty(
            "Nog alle ruimte.",
            "Voeg een module toe met het plusje bij Mijn modules. Kies zelf de naam en de indeling.",
          )
    }
    ${data.packages.some((p) => p.id === "start-demo") ? '<p class="demo-caption">De meegeleverde demonstratieles laat zien hoe de app werkt. Je eigen modules voeg je toe via ＋ in de zijbalk.</p>' : ""}`;
}
function modulePage() {
  const module = moduleById(route.moduleId);
  if (!module) {
    go({ view: "home" });
    return;
  }
  const packages = data.packages.filter((p) => p.moduleId === module.id);
  const topics = packages.flatMap((p) => p.topics.map((t) => ({ p, t })));
  main.innerHTML = `<div class="eyebrow">MIJN MODULES</div><div class="page-heading"><div><h1>${esc(module.title)}</h1><p>${topics.length} ${topics.length === 1 ? "onderwerp" : "onderwerpen"} · Een plek voor je samenvattingen, video's en opdrachten.</p></div><div class="actions">${btn("＋ Onderwerp toevoegen", "new", `data-module="${attr(module.id)}"`, "primary")}<details class="more-menu"><summary aria-label="Module beheren">•••</summary><div>${btn("Naam wijzigen", "renameModule", `data-module="${attr(module.id)}"`)}${btn("Module verwijderen", "deleteModule", `data-module="${attr(module.id)}"`, "danger")}</div></details></div></div>
    <div class="module-rule"></div>
    ${topics.length ? `<div class="topic-list">${topics.map(({ p, t }, index) => `<article class="topic-row"><span class="topic-index">${tp(p, t).done ? "✓" : String(index + 1).padStart(2, "0")}</span><div class="body"><h3>${esc(t.title)}</h3><p>${t.pdf || t.summary ? "Samenvatting" : "Nog geen samenvatting"} <span>·</span> ${topicVideos(t).length} video's <span>·</span> ${(t.questions || []).length} opdrachten <span>·</span> ${(t.examQuestions || []).length} toetsvragen</p></div>${btn('Open onderwerp <svg class="arrow-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg>', "topic", openAttrs(p, t), "ghost small")}</article>`).join("")}</div>` : empty("Hier begint jouw module.", "Maak een onderwerp aan. Daarin verzamel je alle uitleg, video’s, opdrachten en je oefentoets.")}
    <details class="module-tools section-space"><summary>Lespakketten & afsluitende toets</summary><div class="tool-content">${packages.map((p) => `<div class="package-tools"><span>${esc(p.title)}</span><div class="actions">${btn("Exporteren", "export", `data-p="${attr(p.id)}"`, "ghost small")}${p.topics.length ? btn("Afsluitende toets", "finalExam", `data-p="${attr(p.id)}"`, "ghost small") : ""}${p.overviewVideo ? btn("Overzichtsfilm", "overview", `data-p="${attr(p.id)}"`, "ghost small") : ""}${p.topics.length ? btn("Overzichtsfilm toevoegen", "attach", `${openAttrs(p, p.topics[0])} data-kind="overviewVideo"`, "ghost small") : ""}</div></div>`).join("")}</div></details>`;
}
function fileList(p, t, files, kind) {
  if (!files?.length) return "";
  return `<div class="file-list">${files.map((file) => `<div class="file-row"><span class="file-icon">▤</span><div class="body"><strong>${esc(file.title)}</strong><small>${esc(file.file.split(".").pop().toUpperCase())} · Lokaal bewaard</small></div>${btn("Openen", "openFile", `${openAttrs(p, t)} data-kind="${kind}" data-id="${attr(file.id)}"`, "ghost small")}${btn("×", "removeAttachment", `${openAttrs(p, t)} data-kind="${kind}" data-id="${attr(file.id)}" aria-label="${attr(file.title)} verwijderen"`, "icon-button danger")}</div>`).join("")}</div>`;
}
function questionList(p, t, field) {
  const questions = t[field] || [];
  if (!questions.length)
    return '<p class="quiet question-empty">Nog geen vragen toegevoegd. Schrijf je eigen vraag of importeer een vragenbestand.</p>';
  return `<div class="question-library">${questions.map((q, i) => `<div class="library-row"><span class="topic-index">${String(i + 1).padStart(2, "0")}</span><div class="body"><strong>${esc(q.prompt)}</strong><small>${questionTypes[q.type]}</small></div>${btn("Bewerken", "editQuestion", `${openAttrs(p, t)} data-list="${field}" data-id="${attr(q.id)}"`, "ghost small")}${btn("×", "deleteQuestion", `${openAttrs(p, t)} data-list="${field}" data-id="${attr(q.id)}" aria-label="Vraag ${i + 1} verwijderen"`, "icon-button danger")}</div>`).join("")}</div>`;
}
function topicPage() {
  const { p, t } = chosen();
  if (!p || !t) {
    go({ view: "home" });
    return;
  }
  data.progress.last = key(p, t);
  save();
  const tab = route.tab || "summary";
  main.innerHTML = `<div class="eyebrow">${esc(moduleById(p.moduleId)?.title || p.moduleTitle)}</div><div class="page-heading"><div><h1>${esc(t.title)}</h1><p>${p.id === "start-demo" ? '<span class="tag">DEMONSTRATIE</span>' : ""} Jouw materiaal, overzichtelijk bij elkaar.</p></div><div class="actions">${btn(tp(p, t).done ? "✓ Afgerond" : "Markeer als afgerond", "done", openAttrs(p, t), "ghost small")}${btn("Naam wijzigen", "renameTopic", openAttrs(p, t), "text-button small")}</div></div>
    <div class="tabs" role="tablist" aria-label="Onderdelen van het onderwerp">${[
      ["summary", "Samenvatting"],
      ["video", "Video’s"],
      ["practice", "Opdrachten"],
      ["exam", "Oefentoets"],
    ]
      .map(([value, label], i) =>
        btn(
          `<span class="tab-number">0${i + 1}</span>${label}`,
          "tab",
          `data-tab="${value}" role="tab" aria-selected="${tab === value}" aria-controls="lesson-body" id="tab-${value}"`,
          tab === value ? "active" : "",
        ),
      )
      .join(
        "",
      )}</div><section id="lesson-body" role="tabpanel" aria-labelledby="tab-${tab}"></section>`;
  const body = document.querySelector("#lesson-body");
  if (tab === "summary") {
    body.innerHTML = `<div class="content-toolbar"><span class="quiet">De kern van je onderwerp.</span><div class="actions">${btn("Tekst schrijven", "editSummary", openAttrs(p, t), "ghost small")}${btn("↑ Bestand uploaden", "attach", `${openAttrs(p, t)} data-kind="summary"`, "primary small")}</div></div>${t.pdf ? `<iframe class="pdf" title="Samenvatting van ${attr(t.title)}" src="${media(p, t.pdf)}"></iframe>` : t.summary ? `<article class="card prose">${markdown(t.summary)}</article>` : empty("Alles begint met overzicht.", "Schrijf je samenvatting of upload een PDF-, tekst- of Markdown-bestand.")}`;
  }
  if (tab === "video") {
    const videos = topicVideos(t);
    const video = videos.find((v) => v.id === route.videoId) || videos[0];
    body.innerHTML = `<div class="content-toolbar"><span class="quiet">${videos.length} ${videos.length === 1 ? "video" : "video’s"} in dit onderwerp.</span>${btn("↑ Video’s toevoegen", "attach", `${openAttrs(p, t)} data-kind="video"`, "primary small")}</div>${video ? `<div class="video-layout"><div class="video-wrap"><video id="lesson-video" controls preload="metadata" src="${media(p, video.file)}"></video><div class="video-meta"><strong>${esc(video.title)}</strong><span>Je kijkpositie wordt bewaard.</span></div></div><div class="video-playlist">${videos.map((v, i) => `<div class="playlist-row ${v.id === video.id ? "active" : ""}">${btn(`<span class="playlist-index">${String(i + 1).padStart(2, "0")}</span>${esc(v.title)}`, "selectVideo", `data-id="${attr(v.id)}" ${v.id === video.id ? 'aria-current="true"' : ""}`, "playlist-button")}${btn("×", "removeAttachment", `${openAttrs(p, t)} data-kind="video" data-id="${attr(v.id)}" aria-label="${attr(v.title)} verwijderen"`, "icon-button danger")}</div>`).join("")}</div></div>` : empty("Ruimte voor jouw uitleg.", "Voeg één of meer MP4- of WebM-video’s toe. Ze blijven op je eigen computer.")}`;
    if (video) wireVideo(p, t, video);
  }
  if (tab === "practice") {
    body.innerHTML = `<div class="content-toolbar"><span class="quiet">Instructies, bestanden en vragen.</span><div class="actions">${btn("Tekst schrijven", "editAssignment", openAttrs(p, t), "ghost small")}${btn("↑ Opdracht uploaden", "attach", `${openAttrs(p, t)} data-kind="assignment"`, "primary small")}</div></div>${t.assignmentText ? `<article class="card prose assignment-copy">${markdown(t.assignmentText)}</article>` : ""}${fileList(p, t, t.assignments, "assignment")}<section class="card question-section"><div class="section-heading"><div><div class="eyebrow">ACTIEF MET DE STOF</div><h2>Opdrachtvragen</h2></div>${btn("Start oefenen →", "practice", openAttrs(p, t), "primary small")}</div><p>Oefen met directe feedback en uitleg.</p><div class="actions">${btn("＋ Vraag maken", "editQuestion", `${openAttrs(p, t)} data-list="questions"`, "ghost small")}${btn("Vragen importeren (JSON)", "attach", `${openAttrs(p, t)} data-kind="practice"`, "text-button small")}</div>${questionList(p, t, "questions")}</section>`;
  }
  if (tab === "exam") {
    body.innerHTML = `<div class="content-toolbar"><span class="quiet">Controleer wat je hebt onthouden.</span>${btn("↑ Toetsbestand uploaden", "attach", `${openAttrs(p, t)} data-kind="exam"`, "ghost small")}</div>${fileList(p, t, t.examFiles, "exam")}<section class="card question-section"><div class="section-heading"><div><div class="eyebrow">ZELFSTANDIG TOETSEN</div><h2>Jouw oefentoets</h2></div>${btn("Start oefentoets →", "exam", openAttrs(p, t), "primary")}</div><p>${t.examQuestions?.length || 0} vragen · ${p.examMinutes ? p.examMinutes + " minuten" : "Geen tijdslimiet"}. Antwoorden en uitleg zie je na het inleveren.</p><div class="actions">${btn("＋ Toetsvraag maken", "editQuestion", `${openAttrs(p, t)} data-list="examQuestions"`, "ghost small")}<small>Upload JSON voor interactieve vragen, of PDF, TXT en Markdown voor een toetsbestand.</small></div>${questionList(p, t, "examQuestions")}</section>`;
  }
}
function wireVideo(p, t, video) {
  const element = document.querySelector("#lesson-video");
  let lastSave = 0;
  const primary = video.file === t.video;
  const videoProgress = () => {
    const state = tp(p, t);
    return (
      state.videos?.[video.id] ||
      (primary
        ? {
            position: state.position,
            duration: state.duration,
            videoDone: state.videoDone,
          }
        : {})
    );
  };
  element.addEventListener("loadedmetadata", () => {
    const position = videoProgress().position || 0;
    if (position < element.duration) element.currentTime = position;
  });
  element.addEventListener("error", () =>
    toast(
      "Deze video kan niet worden afgespeeld. Gebruik MP4 met H.264/AAC of WebM.",
    ),
  );
  const update = () => {
    const state = { ...tp(p, t) };
    const value = { ...videoProgress(), position: element.currentTime };
    if (Number.isFinite(element.duration)) value.duration = element.duration;
    if (element.ended) value.videoDone = true;
    state.videos = { ...state.videos, [video.id]: value };
    if (primary) Object.assign(state, value);
    data.progress.topics[key(p, t)] = state;
    save();
  };
  element.savePosition = update;
  element.addEventListener("timeupdate", () => {
    if (Date.now() - lastSave > 3000) {
      lastSave = Date.now();
      update();
    }
  });
  element.addEventListener("pause", update);
  element.addEventListener("ended", update);
}
function settings() {
  main.innerHTML = `<div class="eyebrow">JOUW LEEROMGEVING</div><h1>Goed geregeld.</h1><p>Bewaar je studie en houd je materiaal bij de hand.</p><div class="settings-grid"><section class="card"><span class="section-index">01</span><h2>Je studie bewaren</h2><p>Neem lessen, media en voortgang mee in één volledige back-up.</p><div class="actions">${btn("Back-up maken", "backup", "", "primary")}${btn("Terugzetten", "restore", "", "ghost")}</div></section><section class="card"><span class="section-index">02</span><h2>Je eigen lesmateriaal</h2><p>Modules en onderwerpen maak je zelf aan. Gebruik de algemene briefing om op basis van je bronnen een lespakket te laten maken.</p>${btn("Instructies voor ChatGPT", "prompt", "", "ghost")}</section><section class="card"><span class="section-index">03</span><h2>Alles samen oefenen</h2><p>Gebruik de toetsvragen en overzichtsfilms uit al je eigen modules.</p><div class="actions">${btn("Eindtoets alle modules", "courseExam", "", "ghost")}${btn("Overzichtsfilms", "courseOverview", "", "ghost")}</div></section></div><p class="version-note">Makelaar Academie 0.2 · Lokaal & offline · Geen account nodig</p>`;
}

function progressPage() {
  const a = data.progress.attempts;
  main.innerHTML = `<div class="eyebrow">ELKE STAP TELT</div><h1>Je ziet jezelf groeien.</h1><p>Je kijkpositie, afgeronde onderwerpen, antwoorden en toetsresultaten blijven bewaard.</p><h2 class="section-space">Per onderwerp</h2>${allTopics()
    .map(({ p, t }) => {
      const s = tp(p, t);
      return `<div class="topic-row"><span class="topic-index">${s.done ? "✓" : "○"}</span><div class="body"><h3>${esc(t.title)}</h3><p>${esc(p.moduleTitle)} · ${s.done ? "Afgerond" : "Nog bezig"}${s.videoDone ? " · Video uitgekeken" : ""}${s.duration ? " · Video " + Math.round(((s.position || 0) / s.duration) * 100) + "% positie" : ""}</p></div>${btn("Verder", "topic", openAttrs(p, t), "small")}</div>`;
    })
    .join("")}<h2 class="section-space">Toetsgeschiedenis</h2>${
    a.length
      ? `<table class="table"><thead><tr><th>Datum</th><th>Toets</th><th>Automatisch beoordeeld</th><th>Zelf beoordeeld</th></tr></thead><tbody>${[
          ...a,
        ]
          .reverse()
          .map(
            (x) =>
              `<tr><td>${esc(new Date(x.date).toLocaleString("nl-NL"))}</td><td>${esc(x.title)}</td><td>${x.correct}/${x.total} (${x.total ? Math.round((x.correct / x.total) * 100) : 0}%)</td><td>${x.self || 0} open vragen</td></tr>`,
          )
          .join("")}</tbody></table>`
      : '<div class="empty"><p>Je eerste toetsresultaat verschijnt hier zodra je een toets inlevert.</p></div>'
  }`;
}
function reviewList() {
  const items = data.packages.flatMap((p) => [
    ...p.topics.flatMap((t) =>
      (t.questions || [])
        .concat(t.examQuestions || [])
        .map((q) => ({ p, t, q })),
    ),
    ...(p.finalQuestions || []).map((q) => ({
      p,
      t: p.topics.find((t) => t.id === q.topicId) || p.topics[0],
      q,
    })),
  ]);
  return items
    .filter(
      (x, i, a) =>
        a.findIndex((y) => qkey(y.p, y.t, y.q) === qkey(x.p, x.t, x.q)) === i,
    )
    .filter(({ p, t, q }) => {
      const s = data.progress.questions[qkey(p, t, q)];
      return s && (!s.correct || s.due <= Date.now());
    });
}
function reviewPage() {
  const r = reviewList();
  main.innerHTML = `<div class="eyebrow">HERHALEN MAAKT HET VERSCHIL</div><h1>Maak van twijfel kennis.</h1><p>Hier komen foute antwoorden en vragen die weer aan herhaling toe zijn. Na een goed antwoord schuift de herhaling op.</p><div class="card"><h2>${r.length} vragen klaar voor herhaling</h2><p>Een fout antwoord komt direct terug in deze lijst. Goed beantwoorde vragen keren na 1, 3, 7, 14 en daarna 30 dagen terug. Dit zijn suggesties binnen de app.</p>${btn("Start herhaalsessie →", "reviewStart", "", r.length ? "primary" : "ghost")}</div>`;
}
function startQuiz(items, title, exam = false, minutes = 0) {
  pauseMedia();
  if (!items.length) {
    toast("Er zijn nog geen vragen toegevoegd voor dit onderdeel.");
    return;
  }
  quiz = {
    items,
    title,
    exam,
    index: 0,
    answers: [],
    checked: [],
    self: [],
    done: false,
    deadline: exam && minutes ? Date.now() + minutes * 60000 : null,
  };
  route = { view: "quiz" };
  render();
  if (quiz.deadline)
    timer = setInterval(() => {
      const e = document.querySelector("#timer");
      if (e)
        e.textContent = fmt(Math.max(0, (quiz.deadline - Date.now()) / 1000));
      if (Date.now() >= quiz.deadline && !quiz.done) finishQuiz();
    }, 1000);
}
function fmt(s) {
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}
function grade(q, a) {
  if (q.type === "open") return null;
  if (q.type === "choice") return Number.isInteger(a) && q.answer === a;
  if (a === undefined || a === null || String(a).trim() === "") return false;
  const n = Number(String(a).replace(",", "."));
  return Number.isFinite(n) && Math.abs(n - q.answer) <= (q.tolerance || 0);
}
function record(item, correct) {
  const k = qkey(item.p, item.t, item.q),
    old = data.progress.questions[k] || {},
    streak = correct ? (old.streak || 0) + 1 : 0;
  data.progress.questions[k] = {
    correct,
    count: (old.count || 0) + 1,
    streak,
    due:
      Date.now() +
      (correct ? [1, 3, 7, 14, 30][Math.min(4, streak - 1)] * 864e5 : 0),
    last: Date.now(),
  };
  save();
}
function quizPage() {
  if (quiz.done) {
    resultPage();
    return;
  }
  const i = quiz.index,
    { p, t, q } = quiz.items[i],
    a = quiz.answers[i],
    checked = quiz.checked[i];
  main.innerHTML = `<div class="row"><div><div class="eyebrow">${quiz.exam ? "PROEFTOETS" : "OEFENEN"} · ${i + 1} VAN ${quiz.items.length}</div><h2>${esc(quiz.title)}</h2></div>${quiz.deadline ? '<span class="pill" id="timer">' + fmt((quiz.deadline - Date.now()) / 1000) + "</span>" : ""}</div><div class="bar"><span style="width:${((i + 1) / quiz.items.length) * 100}%"></span></div><section class="card question section-space"><small>${esc(t.title)}</small><h2>${esc(q.prompt)}</h2>${q.image ? `<img class="question-image" alt="Afbeelding bij de vraag" src="${media(p, q.image)}">` : ""}${q.type === "choice" ? `<div class="choices">${q.options.map((o, j) => btn(`<span class="letter">${String.fromCharCode(65 + j)}</span>${esc(o)}`, "answer", `data-index="${j}" ${checked ? "disabled" : ""}`, "choice " + (a === j ? "selected " : "") + (checked && j === q.answer ? "correct" : ""))).join("")}</div>` : q.type === "number" ? `<input class="answer-input" id="answer-text" aria-label="Jouw numerieke antwoord" inputmode="decimal" placeholder="Typ je antwoord" value="${attr(a ?? "")}" ${checked ? "disabled" : ""}>` : `<textarea id="answer-text" aria-label="Jouw antwoord" placeholder="Leg het in je eigen woorden uit" ${checked ? "disabled" : ""}>${esc(a ?? "")}</textarea>`}${checked ? feedback(q, a, i) : ""}<div id="hint"></div><div class="question-footer"><div class="actions">${!quiz.exam ? btn("Help me even", "hint", "", "ghost small") : btn("← Vorige", "prev", i === 0 ? "disabled" : "", "ghost small")}</div><div class="actions">${!quiz.exam && !checked ? btn(q.type === "open" ? "Toon modelantwoord" : "Controleer antwoord", "check", "", "primary") : ""}${quiz.exam || checked ? btn(i === quiz.items.length - 1 ? (quiz.exam ? "Toets inleveren" : "Afronden") : "Volgende →", "next", !quiz.exam && q.type === "open" && quiz.self[i] === undefined ? "disabled" : "", "primary") : ""}</div></div></section>`;
  const input = document.querySelector("#answer-text");
  if (input)
    input.addEventListener("input", () => (quiz.answers[i] = input.value));
}
function feedback(q, a, i) {
  if (q.type === "open")
    return `<div class="feedback"><strong>Modelantwoord</strong><p>${esc(q.answer)}</p><p>${esc(q.explanation)}</p><div class="actions section-space">${btn("Dit wist ik", "self", `data-value="yes" ${quiz.self[i] !== undefined ? "disabled" : ""}`, "small")}${btn("Dit wil ik herhalen", "self", `data-value="no" ${quiz.self[i] !== undefined ? "disabled" : ""}`, "small ghost")}</div><small>Open vragen beoordeel je zelf; er is geen AI-beoordeling.</small></div>`;
  const correct = grade(q, a);
  return `<div class="feedback ${correct ? "" : "wrong"}"><strong>${correct ? "Goed gezien." : "Nog even aanscherpen."}</strong><p>${esc(q.explanation || "Het juiste antwoord is: " + (q.type === "choice" ? q.options[q.answer] : q.answer))}</p>${q.source ? "<small>Bron: " + esc(q.source) + "</small>" : ""}</div>`;
}
function finishQuiz() {
  clearInterval(timer);
  quiz.done = true;
  if (quiz.exam) {
    let correct = 0,
      total = 0,
      self = 0;
    quiz.items.forEach((item, i) => {
      const result = grade(item.q, quiz.answers[i]);
      if (result === null) {
        self++;
        return;
      }
      total++;
      if (result) correct++;
      record(item, result);
    });
    data.progress.attempts.push({
      date: new Date().toISOString(),
      title: quiz.title,
      correct,
      total,
      self,
      answers: quiz.items.map((x, i) => ({
        packageId: x.p.id,
        topicId: x.t.id,
        questionId: x.q.id,
        answer: quiz.answers[i] ?? null,
        correct: grade(x.q, quiz.answers[i]),
      })),
    });
    save();
  }
  resultPage();
}
function resultPage() {
  let auto = quiz.items.filter((x) => x.q.type !== "open").length,
    correct = quiz.items.filter(
      (x, i) => grade(x.q, quiz.answers[i]) === true,
    ).length;
  main.innerHTML = `<div class="eyebrow">${quiz.exam ? "TOETSRESULTAAT" : "OEFENSESSIE AFGEROND"}</div><h1>Dit neem je mee.</h1><div class="card"><div class="score">${auto ? Math.round((correct / auto) * 100) + "%" : "—"}</div><p>${correct} van ${auto} automatisch beoordeelde vragen goed. ${quiz.items.length - auto} open vragen beoordeel je zelf.</p><p>Dit is een oefenresultaat, geen officiële uitslag of voorspelling van slagen.</p><div class="actions">${btn("Naar mijn voortgang", "nav", 'data-view="progress"', "primary")}${btn("Mijn herhaalvragen", "nav", 'data-view="review"', "ghost")}</div></div><h2 class="section-space">Antwoorden & uitleg</h2>${quiz.items.map(({ p, t, q }, i) => `<div class="results-item"><h3>${i + 1}. ${esc(q.prompt)}</h3><p>Jouw antwoord: ${esc(q.type === "choice" ? (q.options[quiz.answers[i]] ?? "Niet beantwoord") : (quiz.answers[i] ?? "Niet beantwoord"))}</p><p>Juiste antwoord${q.type === "open" ? " (model)" : ""}: ${esc(q.type === "choice" ? q.options[q.answer] : q.answer)}</p><p>${esc(q.explanation)}</p>${q.source ? "<small>Bron: " + esc(q.source) + "</small>" : ""}${q.type === "open" && quiz.exam ? `<div class="actions">${btn("Dit wist ik", "resultSelf", `data-i="${i}" data-value="yes" ${quiz.self[i] !== undefined ? "disabled" : ""}`, "small")}${btn("Nog herhalen", "resultSelf", `data-i="${i}" data-value="no" ${quiz.self[i] !== undefined ? "disabled" : ""}`, "small ghost")}</div>` : ""}${topicVideos(t).length && q.clip ? btn("Bekijk bijbehorend fragment", "resultClip", `data-i="${i}"`, "small ghost") : ""}</div>`).join("")}`;
}
function showClip(item, target) {
  const { p, t, q } = item;
  const clipVideo = q.clip?.videoId
    ? topicVideos(t).find((v) => v.id === q.clip.videoId)?.file
    : t.video || topicVideos(t)[0]?.file;
  if (!clipVideo || !q.clip) {
    target.innerHTML = `<div class="note">${esc(q.hint || "Er is nog geen videofragment gekoppeld aan deze vraag. Voeg tijdcodes toe aan het lespakket.")}</div>`;
    return;
  }
  target.innerHTML = `<div class="video-wrap section-space"><video id="hint-video" controls src="${media(p, clipVideo)}"></video><div class="video-meta">Fragment ${fmt(q.clip.start)}–${fmt(q.clip.end)} · ${esc(q.hint || "Bekijk de uitleg en probeer het opnieuw.")}</div></div>`;
  const v = target.querySelector("video");
  v.addEventListener("loadedmetadata", () => {
    if (q.clip.start >= v.duration) {
      toast("Deze tijdcode valt buiten de video. Controleer je lespakket.");
      return;
    }
    v.currentTime = q.clip.start;
    v.play().catch(() => {});
  });
  v.addEventListener("timeupdate", () => {
    if (v.currentTime >= q.clip.end) v.pause();
  });
  v.addEventListener("error", () =>
    toast("Video kan niet worden afgespeeld. Controleer het bestand."),
  );
}

function dialogBody(html) {
  pauseMedia();
  if (modal.open) modal.close();
  modal.dataset.dirty = "";
  modal.innerHTML = html;
  modal.showModal();
}
function formFooter(label = "Opslaan") {
  return `<p id="form-error" class="form-error" role="alert"></p><div class="form-actions"><button class="primary" type="submit">${label}</button>${btn("Annuleren", "close", 'type="button"', "ghost")}</div>`;
}
function bindForm(id, submit) {
  const form = document.querySelector("#" + id);
  form.addEventListener("input", () => {
    modal.dataset.dirty = "true";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    const error = form.querySelector("#form-error");
    error.textContent = "";
    try {
      await saveQueue;
      await submit(form);
      modal.dataset.dirty = "";
      modal.close();
    } catch (failure) {
      error.textContent = failure.message;
      button.disabled = false;
    }
  });
}
function nameEditor(kind, value = "", moduleId) {
  const isNewModule = kind === "newModule";
  const isNewTopic = kind === "new";
  const isModule = isNewModule || kind === "renameModule";
  const title = isNewModule
    ? "Een nieuwe module."
    : isNewTopic
      ? "Een nieuw onderwerp."
      : isModule
        ? "Modulenaam wijzigen."
        : "Onderwerp wijzigen.";
  if (isNewTopic && !modules().length) {
    nameEditor("newModule");
    return;
  }
  dialogBody(
    `<div class="eyebrow">${isModule ? "JOUW EIGEN INDELING" : "BINNEN JOUW MODULE"}</div><h2 id="dialog-title">${title}</h2><form id="name-form">${
      isNewTopic
        ? `<label for="new-module">Module</label><select id="new-module">${modules()
            .map(
              (module) =>
                `<option value="${attr(module.id)}">${esc(module.title)}</option>`,
            )
            .join("")}</select>`
        : ""
    }<label for="name-title">${isModule ? "Modulenaam" : "Naam van het onderwerp"}</label><input id="name-title" maxlength="200" required value="${attr(value)}" placeholder="${isModule ? "Bijvoorbeeld: Bouwkunde" : "Bijvoorbeeld: Bouwstijlen"}" autocomplete="off">${formFooter(isNewModule ? "Module maken" : isNewTopic ? "Onderwerp maken" : "Naam opslaan")}</form>`,
  );
  if (isNewTopic)
    document.querySelector("#new-module").value = moduleId || modules()[0].id;
  bindForm("name-form", async () => {
    const titleValue = document.querySelector("#name-title").value.trim();
    if (!titleValue) throw Error("Vul een naam in.");
    if (isNewModule) {
      const before = new Set(modules().map((module) => module.id));
      acceptState(await api.newModule({ title: titleValue }));
      const added = modules().find((module) => !before.has(module.id));
      go({ view: "module", moduleId: added?.id || modules().at(-1)?.id });
    } else if (kind === "renameModule") {
      acceptState(await api.renameModule({ moduleId, title: titleValue }));
      render();
    } else if (isNewTopic) {
      const chosenModule = document.querySelector("#new-module").value;
      const before = new Set(allTopics().map(({ p, t }) => key(p, t)));
      acceptState(
        await api.newTopic({ moduleId: chosenModule, title: titleValue }),
      );
      const added = allTopics().find(
        ({ p, t }) => p.moduleId === chosenModule && !before.has(key(p, t)),
      );
      go(
        added
          ? { view: "topic", p: added.p.id, t: added.t.id }
          : { view: "module", moduleId: chosenModule },
      );
    } else {
      const { p, t } = chosen();
      acceptState(
        await api.updateTopic({
          packageId: p.id,
          topicId: t.id,
          title: titleValue,
        }),
      );
      render();
    }
    toast(
      isNewModule
        ? "Module toegevoegd."
        : isNewTopic
          ? "Onderwerp toegevoegd."
          : "Naam opgeslagen.",
    );
  });
}
function contentEditor(field) {
  const { p, t } = chosen();
  const summary = field === "summary";
  dialogBody(
    `<div class="eyebrow">${esc(t.title)}</div><h2 id="dialog-title">${summary ? "Jouw samenvatting." : "Jouw opdracht."}</h2><form id="content-form"><label for="content-text">${summary ? "Samenvatting" : "Opdrachttekst"}</label><textarea class="writing-area" id="content-text" maxlength="200000" placeholder="Typ hier je tekst…">${esc(t[field] || "")}</textarea><small>Kopjes en lijsten kun je schrijven met Markdown.</small>${summary && t.pdf ? '<p class="note">Deze tekst vervangt de huidige PDF-samenvatting in dit onderwerp.</p>' : ""}${formFooter()}</form>`,
  );
  bindForm("content-form", async () => {
    acceptState(
      await api.updateTopic({
        packageId: p.id,
        topicId: t.id,
        [field]: document.querySelector("#content-text").value,
      }),
    );
    render();
    toast("Tekst opgeslagen.");
  });
}
function questionEditor(field, questionId) {
  const { p, t } = chosen();
  const old = t[field]?.find((question) => question.id === questionId);
  if (questionId && !old) throw Error("Deze vraag bestaat niet meer.");
  const exam = field === "examQuestions";
  dialogBody(
    `<div class="eyebrow">${esc(t.title)}</div><h2 id="dialog-title">${old ? "Vraag bewerken." : exam ? "Een nieuwe toetsvraag." : "Een nieuwe opdrachtvraag."}</h2><form id="question-form"><div class="form-grid"><div><label for="question-type">Vraagvorm</label><select id="question-type"><option value="choice">Meerkeuze</option><option value="number">Rekenvraag</option><option value="open">Open vraag</option></select></div><div><label for="question-source">Bron (optioneel)</label><input id="question-source" maxlength="1000" value="${attr(old?.source || "")}" placeholder="Boek, hoofdstuk of pagina"></div></div><label for="question-prompt">Vraag</label><textarea id="question-prompt" maxlength="5000" required>${esc(old?.prompt || "")}</textarea><div id="question-fields"></div><label for="question-explanation">Uitleg bij het antwoord</label><textarea id="question-explanation" maxlength="10000">${esc(old?.explanation || "")}</textarea>${old ? "<small>Bij inhoudelijke wijzigingen krijgt de vraag een nieuw ID, zodat oude voortgang niet aan een gewijzigd antwoord wordt gekoppeld.</small>" : ""}${formFooter(old ? "Wijzigingen opslaan" : "Vraag toevoegen")}</form>`,
  );
  const type = document.querySelector("#question-type");
  type.value = old?.type || "choice";
  const renderFields = () => {
    const fields = document.querySelector("#question-fields");
    if (type.value === "choice") {
      fields.innerHTML = `<label for="question-options">Antwoordopties — één per regel</label><textarea id="question-options" required placeholder="Eerste mogelijkheid\nTweede mogelijkheid">${esc(old?.type === "choice" ? old.options.join("\n") : "")}</textarea><label for="question-answer">Juiste antwoord</label><select id="question-answer"></select>`;
      const options = document.querySelector("#question-options");
      const answer = document.querySelector("#question-answer");
      const sync = () => {
        const current = answer.value;
        answer.innerHTML = options.value
          .trim()
          .split(/\r?\n/)
          .map(
            (option, index) =>
              `<option value="${index}">${String.fromCharCode(65 + index)} · ${esc(option.trim() || "Nog invullen")}</option>`,
          )
          .join("");
        if ([...answer.options].some((option) => option.value === current))
          answer.value = current;
      };
      options.addEventListener("input", sync);
      sync();
      if (old?.type === "choice") answer.value = String(old.answer);
    } else if (type.value === "number") {
      fields.innerHTML = `<div class="form-grid"><div><label for="question-answer">Juiste getal</label><input id="question-answer" inputmode="decimal" required value="${attr(old?.type === "number" ? old.answer : "")}"></div><div><label for="question-tolerance">Toegestane afwijking</label><input id="question-tolerance" inputmode="decimal" value="${attr(old?.type === "number" ? old.tolerance || 0 : 0)}"></div></div><small>Noem eenheid en afronding in de vraag.</small>`;
    } else {
      fields.innerHTML = `<label for="question-answer">Modelantwoord</label><textarea id="question-answer" maxlength="10000" required>${esc(old?.type === "open" ? old.answer : "")}</textarea><small>Open vragen beoordeel je zelf aan de hand van dit antwoord.</small>`;
    }
  };
  renderFields();
  type.addEventListener("change", renderFields);
  bindForm("question-form", async () => {
    const prompt = document.querySelector("#question-prompt").value.trim();
    if (!prompt) throw Error("Vul de vraag in.");
    const question = {
      ...old,
      type: type.value,
      prompt,
      explanation: document.querySelector("#question-explanation").value.trim(),
    };
    const source = document.querySelector("#question-source").value.trim();
    if (source) question.source = source;
    else delete question.source;
    delete question.options;
    delete question.tolerance;
    if (question.type === "choice") {
      question.options = document
        .querySelector("#question-options")
        .value.trim()
        .split(/\r?\n/)
        .map((option) => option.trim());
      if (
        question.options.length < 2 ||
        question.options.length > 8 ||
        question.options.some((option) => !option || option.length > 2000)
      )
        throw Error("Vul 2 tot 8 antwoordopties in, één per regel.");
      question.answer = Number(
        document.querySelector("#question-answer").value,
      );
      if (
        !Number.isInteger(question.answer) ||
        question.answer >= question.options.length
      )
        throw Error("Kies het juiste antwoord.");
    } else if (question.type === "number") {
      const value = document.querySelector("#question-answer").value.trim();
      if (!value) throw Error("Vul het juiste getal in.");
      question.answer = Number(value.replace(",", "."));
      question.tolerance = Number(
        document
          .querySelector("#question-tolerance")
          .value.trim()
          .replace(",", ".") || 0,
      );
      if (
        !Number.isFinite(question.answer) ||
        !Number.isFinite(question.tolerance) ||
        question.tolerance < 0
      )
        throw Error("Vul een geldig getal en een niet-negatieve afwijking in.");
    } else {
      question.answer = document.querySelector("#question-answer").value.trim();
      if (!question.answer) throw Error("Vul een modelantwoord in.");
    }
    const comparison = { ...question };
    delete comparison.id;
    const previous = { ...old };
    if (old) {
      previous.explanation ||= "";
      if (old.type === "number") previous.tolerance ??= 0;
      if (!old.source) delete previous.source;
    }
    delete previous.id;
    question.id =
      old &&
      JSON.stringify(canonical(comparison)) ===
        JSON.stringify(canonical(previous))
        ? old.id
        : "vraag-" + crypto.randomUUID();
    const questions = [...(t[field] || [])];
    const index = old ? questions.findIndex((item) => item.id === old.id) : -1;
    if (index >= 0) questions[index] = question;
    else questions.push(question);
    acceptState(
      await api.updateTopic({
        packageId: p.id,
        topicId: t.id,
        [field]: questions,
      }),
    );
    render();
    toast(old ? "Vraag opgeslagen." : "Vraag toegevoegd.");
  });
}
async function controlWindow(command) {
  if (command === "close") {
    if (
      modal.dataset.dirty === "true" &&
      !confirm("Je hebt niet-opgeslagen tekst. Toch sluiten?")
    )
      return;
    if (
      quiz &&
      !quiz.done &&
      !confirm("Je huidige sessie is nog niet afgerond. Toch sluiten?")
    )
      return;
    pauseMedia();
    await saveQueue;
  }
  const state = await api.windowControl(command);
  if (state && typeof state.fullscreen === "boolean")
    fullscreen = state.fullscreen;
  const button = document.querySelector("#window-fullscreen");
  button.setAttribute(
    "aria-label",
    fullscreen ? "Venstermodus" : "Volledig scherm",
  );
  button.title = fullscreen ? "Venstermodus · Esc" : "Volledig scherm · F11";
}
async function action(name, element) {
  const { p, t } = chosen();
  const ds = element.dataset;
  if (name === "window") return controlWindow(ds.command);
  if (name === "nav") return go({ view: ds.view });
  if (name === "module") return go({ view: "module", moduleId: ds.id });
  if (name === "topic") return go({ view: "topic", p: ds.p, t: ds.t });
  if (name === "tab") {
    pauseMedia();
    route.tab = ds.tab;
    topicPage();
    return;
  }
  if (name === "newModule") return nameEditor("newModule");
  if (name === "renameModule")
    return nameEditor(
      "renameModule",
      moduleById(ds.module)?.title || "",
      ds.module,
    );
  if (name === "new") return nameEditor("new", "", ds.module || p?.moduleId);
  if (name === "renameTopic") return nameEditor("renameTopic", t.title);
  if (name === "editSummary") return contentEditor("summary");
  if (name === "editAssignment") return contentEditor("assignmentText");
  if (name === "editQuestion") return questionEditor(ds.list, ds.id);
  if (name === "selectVideo") {
    pauseMedia();
    route.videoId = ds.id;
    topicPage();
    return;
  }
  if (name === "done") {
    data.progress.topics[key(p, t)] = { ...tp(p, t), done: !tp(p, t).done };
    await save();
    topicPage();
    return;
  }
  if (name === "deleteModule") {
    await saveQueue;
    const result = await api.deleteModule(ds.module);
    if (result) {
      acceptState(result);
      go({ view: "home" });
      toast("Module verwijderd.");
    }
    return;
  }
  if (name === "deleteQuestion") {
    if (
      !confirm(
        "Deze vraag verwijderen? Eerdere toetsresultaten blijven bewaard.",
      )
    )
      return;
    await saveQueue;
    acceptState(
      await api.updateTopic({
        packageId: p.id,
        topicId: t.id,
        [ds.list]: t[ds.list].filter((question) => question.id !== ds.id),
      }),
    );
    render();
    toast("Vraag verwijderd.");
    return;
  }
  if (name === "import") {
    await saveQueue;
    const result = await api.import();
    if (result) {
      acceptState(result);
      go({ view: "home" });
      toast("Lespakket toegevoegd.");
    }
    return;
  }
  if (name === "attach") {
    pauseMedia();
    await saveQueue;
    const result = await api.attach({
      packageId: ds.p,
      topicId: ds.t,
      kind: ds.kind,
    });
    if (result) {
      acceptState(result);
      render();
      toast("Toegevoegd en lokaal bewaard.");
    }
    return;
  }
  if (name === "removeAttachment") {
    if (!confirm("Dit bestand uit het onderwerp verwijderen?")) return;
    pauseMedia();
    await saveQueue;
    acceptState(
      await api.removeAttachment({
        packageId: ds.p,
        topicId: ds.t,
        kind: ds.kind,
        id: ds.id,
      }),
    );
    render();
    toast("Bestand verwijderd.");
    return;
  }
  if (name === "openFile") {
    const file = (ds.kind === "exam" ? t.examFiles : t.assignments)?.find(
      (item) => item.id === ds.id,
    );
    if (!file) throw Error("Bestand ontbreekt.");
    dialogBody(
      `<h2 id="dialog-title">${esc(file.title)}</h2><iframe class="document-viewer" title="${attr(file.title)}" src="${media(p, file.file)}"></iframe><div class="form-actions">${btn("Sluiten", "close", "", "ghost")}</div>`,
    );
    return;
  }
  if (name === "export") {
    if (await api.exportPackage(ds.p)) toast("Lespakket geëxporteerd.");
    return;
  }
  if (name === "backup") {
    await saveQueue;
    if (await api.backup()) toast("Back-up opgeslagen.");
    return;
  }
  if (name === "restore") {
    await saveQueue;
    const result = await api.restore();
    if (result) {
      acceptState(result);
      go({ view: "home" });
      toast("Back-up teruggezet.");
    }
    return;
  }
  if (name === "close") {
    if (
      modal.dataset.dirty === "true" &&
      !confirm("Je wijzigingen zijn nog niet opgeslagen. Toch sluiten?")
    )
      return;
    pauseMedia(modal);
    modal.close();
    return;
  }
  if (name === "prompt") {
    const text = await api.prompt();
    dialogBody(
      `<h2 id="dialog-title">Instructies voor ChatGPT</h2><p>Kopieer de briefing en voeg je bronnen toe in ChatGPT.</p><textarea id="prompt-text" class="writing-area" readonly>${esc(text)}</textarea><div class="form-actions">${btn("Selecteer alles", "selectPrompt", "", "primary")}${btn("Sluiten", "close", "", "ghost")}</div>`,
    );
    return;
  }
  if (name === "selectPrompt") {
    document.querySelector("#prompt-text").select();
    toast("Druk op Ctrl+C om te kopiëren.");
    return;
  }
  if (name === "practice" || name === "exam") {
    startQuiz(
      (name === "exam" ? t.examQuestions || [] : t.questions || []).map(
        (q) => ({ p, t, q }),
      ),
      t.title,
      name === "exam",
      p.examMinutes || 0,
    );
    return;
  }
  if (name === "reviewStart") {
    startQuiz(reviewList(), "Herhalen");
    return;
  }
  if (name === "finalExam" || name === "courseExam") {
    const packages =
      name === "courseExam"
        ? data.packages.filter((pkg) => pkg.id !== "start-demo")
        : data.packages.filter((pkg) => pkg.id === ds.p);
    const items = packages.flatMap((pkg) =>
      pkg.finalQuestions?.length
        ? pkg.finalQuestions.map((q) => ({
            p: pkg,
            t:
              pkg.topics.find((topic) => topic.id === q.topicId) ||
              pkg.topics[0],
            q,
          }))
        : pkg.topics.flatMap((topic) =>
            (topic.examQuestions || []).map((q) => ({ p: pkg, t: topic, q })),
          ),
    );
    startQuiz(
      items,
      name === "courseExam"
        ? "Eindtoets · alle modules"
        : "Afsluitende toets · " + packages[0].title,
      true,
      name === "finalExam" ? packages[0].examMinutes || 0 : 0,
    );
    return;
  }
  if (name === "overview" || name === "courseOverview") {
    const videos = data.packages.filter(
      (pkg) => pkg.overviewVideo && (name !== "overview" || pkg.id === ds.p),
    );
    dialogBody(
      `<h2 id="dialog-title">Overzichtsfilms</h2>${videos.length ? videos.map((pkg) => `<h3>${esc(pkg.title)}</h3><video controls src="${media(pkg, pkg.overviewVideo)}"></video>`).join("") : "<p>Nog geen overzichtsfilm toegevoegd. Je kunt een film toevoegen bij de lespakketten van een module.</p>"}<div class="form-actions">${btn("Sluiten", "close", "", "ghost")}</div>`,
    );
    return;
  }
  if (name === "answer") {
    quiz.answers[quiz.index] = Number(ds.index);
    quizPage();
    return;
  }
  if (name === "check") {
    const index = quiz.index;
    const item = quiz.items[index];
    if (
      quiz.answers[index] === undefined ||
      String(quiz.answers[index]).trim() === ""
    ) {
      toast("Geef eerst een antwoord.");
      return;
    }
    quiz.checked[index] = true;
    if (item.q.type !== "open")
      record(item, grade(item.q, quiz.answers[index]));
    quizPage();
    return;
  }
  if (name === "self") {
    quiz.self[quiz.index] = ds.value === "yes";
    record(quiz.items[quiz.index], ds.value === "yes");
    quizPage();
    return;
  }
  if (name === "hint") {
    showClip(quiz.items[quiz.index], document.querySelector("#hint"));
    return;
  }
  if (name === "prev") {
    quiz.index = Math.max(0, quiz.index - 1);
    quizPage();
    return;
  }
  if (name === "next") {
    if (quiz.index === quiz.items.length - 1) {
      if (
        quiz.exam &&
        quiz.answers.filter(
          (value) => value !== undefined && String(value).trim() !== "",
        ).length < quiz.items.length &&
        !confirm("Niet alle vragen zijn beantwoord. Toch inleveren?")
      )
        return;
      finishQuiz();
    } else {
      quiz.index++;
      quizPage();
    }
    return;
  }
  if (name === "resultSelf") {
    const index = Number(ds.i);
    quiz.self[index] = ds.value === "yes";
    record(quiz.items[index], ds.value === "yes");
    resultPage();
    return;
  }
  if (name === "resultClip") {
    dialogBody(
      `<h2 id="dialog-title">Uitleg bij de vraag</h2><div id="result-video"></div><div class="form-actions">${btn("Sluiten", "close")}</div>`,
    );
    showClip(quiz.items[Number(ds.i)], document.querySelector("#result-video"));
  }
}

document.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (element)
    action(element.dataset.action, element).catch((error) =>
      toast(error.message),
    );
});
modal.addEventListener("close", () => {
  pauseMedia(modal);
  modal.dataset.dirty = "";
});
modal.addEventListener("cancel", (event) => {
  if (
    modal.dataset.dirty === "true" &&
    !confirm("Je wijzigingen zijn nog niet opgeslagen. Toch sluiten?")
  )
    event.preventDefault();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "F11" ||
    (event.key === "Escape" && fullscreen && !modal.open)
  ) {
    event.preventDefault();
    controlWindow("toggleFullscreen").catch((error) => toast(error.message));
  }
});
document.querySelector("#titlebar").addEventListener("dblclick", (event) => {
  if (!event.target.closest("button"))
    controlWindow("toggleFullscreen").catch((error) => toast(error.message));
});
(async () => {
  try {
    acceptState(await api.state());
    render();
    if (api.windowControl) await controlWindow("state");
  } catch (error) {
    main.innerHTML =
      '<div class="empty"><h1>Starten lukt nog niet.</h1><p>' +
      esc(error.message) +
      "</p></div>";
  }
})();
