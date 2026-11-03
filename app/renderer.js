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
function parts(t) {
  if (Array.isArray(t.subtopics) && (t.subtopics.length || !(t.summary || t.pdf || t.video || t.videos?.length || t.questions?.length || t.assignmentText || t.assignments?.length || t.examples?.length))) return t.subtopics;
  return [{ ...t, id: "legacy", title: "Uitleg en opdrachten" }];
}
function selectedPart(t) { return parts(t).find((part) => part.id === route.part); }
function partProgress(p, t, part) {
  return tp(p, t).subtopics?.[part.id] ||
    (part.id === "legacy" && tp(p, t).done ? { read: true, done: true } : {});
}
function setPartProgress(p, t, part, values) {
  const state = { ...tp(p, t) };
  state.subtopics = { ...state.subtopics, [part.id]: { ...partProgress(p, t, part), ...values } };
  data.progress.topics[key(p, t)] = state;
  return save();
}
function topicDone(p,t) { return tp(p,t).done && allPartsDone(p,t); }
function allPartsDone(p, t) { return parts(t).length > 0 && parts(t).every((part) => partProgress(p, t, part).done); }
function partAttrs(p, t, part) { return openAttrs(p, t) + (part ? ` data-s="${attr(part.id)}"` : ""); }
function contentRequest(p, t, part) {
  return { packageId: p.id, topicId: t.id, ...(part ? { subtopicId: part.id } : {}) };
}
async function updateContent(p, t, part, values) {
  const request = { ...contentRequest(p, t, part), ...values };
  if (!part || !Array.isArray(t.subtopics)) { delete request.subtopicId; return api.updateTopic(request); }
  return api.updateSubtopic(request);
}
async function contentEdited(p,t,part,field) {
  if(!part)return;
  await setPartProgress(p,t,part,{done:false, ...(field==="summary"?{read:false}:{}), ...(field==="questions"?{practiceCompleted:false}:{})});
  data.progress.topics[key(p,t)].done=false;
  await save();
}
function partQuestionItems(p, t, part) { return (part.questions || []).map((q) => ({ p, t, s: part, q })); }
function questionContent(item) { return item.s || item.t; }
function clipVideo(item) {
  const scopes = [...(item.s ? [item.s] : []), item.t, ...parts(item.t)];
  if(item.q.clip?.videoId) {
    for(const scope of scopes) {const found=topicVideos(scope).find(v=>v.id===item.q.clip.videoId);if(found)return found.file;}
    return null;
  }
  for(const scope of scopes) {const found=scope.video || topicVideos(scope)[0]?.file;if(found)return found;}
  return null;
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
            .map((line) => "<li>" + esc(line.slice(2)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") + "</li>")
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
      ? `${moduleById(p?.moduleId)?.title || p?.moduleTitle || ""}  /  ${t?.title || ""}${route.part ? "  /  " + (selectedPart(t)?.title || "") : ""}`
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
  const done = topics.filter(({ p, t }) => topicDone(p, t)).length;
  const next =
    topics.find(({ p, t }) => key(p, t) === data.progress.last) ||
    topics.find(({ p, t }) => !topicDone(p, t));
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
                ({ p, t }) => topicDone(p, t),
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
  main.innerHTML = `<div class="eyebrow">MIJN MODULES</div><div class="page-heading"><div><h1>${esc(module.title)}</h1><p>${topics.length} ${topics.length === 1 ? "onderwerp" : "onderwerpen"} · Uitleg en opdrachten per deelonderwerp, met een eindtoets per onderwerp.</p></div><div class="actions">${btn("＋ Onderwerp toevoegen", "new", `data-module="${attr(module.id)}"`, "primary")}<details class="more-menu"><summary aria-label="Module beheren">•••</summary><div>${btn("Naam wijzigen", "renameModule", `data-module="${attr(module.id)}"`)}${btn("Module verwijderen", "deleteModule", `data-module="${attr(module.id)}"`, "danger")}</div></details></div></div>
    <div class="module-rule"></div>
    ${topics.length ? `<div class="topic-list">${topics.map(({ p, t }, index) => `<article class="topic-row"><span class="topic-index">${topicDone(p, t) ? "✓" : String(index + 1).padStart(2, "0")}</span><div class="body"><h3>${esc(t.title)}</h3><p>${parts(t).length} deelonderwerpen <span>·</span> ${parts(t).reduce((n, part) => n + (part.questions || []).length, 0)} opdrachten <span>·</span> ${(t.examQuestions || []).length} eindtoetsvragen</p></div>${btn('Open onderwerp <svg class="arrow-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg>', "topic", openAttrs(p, t), "ghost small")}</article>`).join("")}</div>` : empty("Hier begint jouw module.", "Maak een onderwerp aan. Daarin verzamel je alle uitleg, video’s, opdrachten en je oefentoets.")}
    <details class="module-tools section-space"><summary>Lespakketten & afsluitende toets</summary><div class="tool-content">${packages.map((p) => `<div class="package-tools"><span>${esc(p.title)}</span><div class="actions">${btn("Exporteren", "export", `data-p="${attr(p.id)}"`, "ghost small")}${p.topics.length ? btn("Afsluitende toets", "finalExam", `data-p="${attr(p.id)}"`, "ghost small") : ""}${p.overviewVideo ? btn("Overzichtsfilm", "overview", `data-p="${attr(p.id)}"`, "ghost small") : ""}${p.topics.length ? btn("Overzichtsfilm toevoegen", "attach", `${openAttrs(p, p.topics[0])} data-kind="overviewVideo"`, "ghost small") : ""}</div></div>`).join("")}</div></details>`;
}
function fileList(p, t, files, kind, part) {
  if (!files?.length) return "";
  return `<div class="file-list">${files.map((file) => `<div class="file-row"><span class="file-icon">▤</span><div class="body"><strong>${esc(file.title)}</strong><small>${esc(file.file.split(".").pop().toUpperCase())} · Lokaal bewaard</small></div>${btn("Openen", "openFile", `${partAttrs(p, t, part)} data-kind="${kind}" data-id="${attr(file.id)}"`, "ghost small")}${btn("×", "removeAttachment", `${partAttrs(p, t, part)} data-kind="${kind}" data-id="${attr(file.id)}" aria-label="${attr(file.title)} verwijderen"`, "icon-button danger")}</div>`).join("")}</div>`;
}
function questionList(p, t, field, part) {
  const questions = (part || t)[field] || [];
  if (!questions.length)
    return '<p class="quiet question-empty">Nog geen vragen toegevoegd. Schrijf je eigen vraag of importeer een vragenbestand.</p>';
  return `<div class="question-library">${questions.map((q, i) => `<div class="library-row"><span class="topic-index">${String(i + 1).padStart(2, "0")}</span><div class="body"><strong>${esc(q.prompt)}</strong><small>${questionTypes[q.type]}</small></div>${btn("Bewerken", "editQuestion", `${partAttrs(p, t, part)} data-list="${field}" data-id="${attr(q.id)}"`, "ghost small")}${btn("×", "deleteQuestion", `${partAttrs(p, t, part)} data-list="${field}" data-id="${attr(q.id)}" aria-label="Vraag ${i + 1} verwijderen"`, "icon-button danger")}</div>`).join("")}</div>`;
}
function examples(p, t, part) {
  return `<section class="examples-section"><div class="section-heading"><h2>Voorbeelden bij de uitleg</h2>${btn("＋ Afbeelding toevoegen", "addExample", partAttrs(p, t, part), "ghost small")}</div>${part.examples?.length ? `<div class="example-grid">${part.examples.map((example) => `<figure class="card example-card"><img src="${media(p, example.file)}" alt="${attr(example.title)}" loading="lazy"><figcaption><h3>${esc(example.title)}</h3>${example.caption ? `<p>${esc(example.caption)}</p>` : ""}${example.source ? `<small>Bron: ${esc(example.source)}</small>` : ""}<div class="actions">${btn("Vergroten", "viewExample", `${partAttrs(p, t, part)} data-id="${attr(example.id)}"`, "ghost small")}${btn("Bijschrift wijzigen", "editExample", `${partAttrs(p, t, part)} data-id="${attr(example.id)}"`, "text-button small")}${btn("Verwijderen", "removeAttachment", `${partAttrs(p, t, part)} data-kind="example" data-id="${attr(example.id)}"`, "text-button small danger")}</div></figcaption></figure>`).join("")}</div>` : '<p class="quiet">Voeg een eigen afbeelding toe met uitleg en bronvermelding. De afbeelding blijft offline beschikbaar.</p>'}</section>`;
}
function legacyVideos(p,t,part) {
  const videos=topicVideos(part), selected=videos.find(v=>v.id===route.videoId)||videos[0];
  if(!selected)return "";
  return `<details class="section-space legacy-media"><summary>Bestaande uitlegvideo’s</summary><div class="content-toolbar">${btn("Video toevoegen","attach",`${partAttrs(p,t,part)} data-kind="video"`,"ghost small")}</div><video id="lesson-video" controls preload="metadata" src="${media(p,selected.file)}"></video><div class="actions">${videos.map(v=>`<div>${btn(esc(v.title),"selectVideo",`data-id="${attr(v.id)}"`,"ghost small")}${btn("×","removeAttachment",`${partAttrs(p,t,part)} data-kind="video" data-id="${attr(v.id)}" aria-label="${attr(v.title)} verwijderen"`,"icon-button danger")}</div>`).join("")}</div></details>`;
}
function topicPage() {
  const { p, t } = chosen();
  if (!p || !t) { go({ view: "home" }); return; }
  data.progress.last = key(p, t);
  save();
  const items = parts(t), part = selectedPart(t), complete = items.filter((item) => partProgress(p, t, item).done).length;
  if (route.part && !part) { delete route.part; delete route.step; }
  const a = openAttrs(p, t);
  main.innerHTML = `<div class="eyebrow">${esc(moduleById(p.moduleId)?.title || p.moduleTitle)} · ${part ? esc(t.title) : "ONDERWERP"}</div><div class="page-heading"><div><h1>${esc(part?.title || t.title)}</h1><p>${p.id === "start-demo" ? '<span class="tag">DEMONSTRATIE</span> ' : ""}${part ? `Deel ${items.indexOf(part) + 1} van ${items.length} · Lees de uitleg en maak daarna de opdrachten.` : `${complete} van ${items.length} deelonderwerpen afgerond · Daarna de eindtoets.`}</p></div><div class="actions">${part ? btn("← Onderwerpoverzicht", "topic", a, "ghost small") : btn("＋ Deelonderwerp", "newSubtopic", a, "primary")}${btn("Naam wijzigen", part ? "renameSubtopic" : "renameTopic", part ? partAttrs(p,t,part) : a, "text-button small")}${!part ? btn("Onderwerp verwijderen", "deleteTopic", a, "text-button small danger") : ""}</div></div><section id="lesson-body"></section>`;
  const body = document.querySelector("#lesson-body");
  if (route.tab === "exam" && !part) { renderTopicExam(body, p, t); return; }
  if (!part) {
    body.innerHTML = `${items.length ? `<div class="learning-route">${items.map((item, index) => { const state = partProgress(p,t,item); return `<article class="topic-row part-row"><span class="topic-index">${state.done ? "✓" : String(index + 1).padStart(2,"0")}</span><div class="body"><h3>${esc(item.title)}</h3><p>${state.done ? "Afgerond" : state.read ? "Uitleg gelezen" : "Begin met de uitleg"} · ${(item.questions || []).length} opdrachten · ${(item.examples || []).length} voorbeelden</p></div><div class="actions">${btn(state.done ? "Herhalen" : "Open deel →", "openPart", partAttrs(p,t,item), "primary small")}<details class="more-menu"><summary aria-label="${attr(item.title)} beheren">•••</summary><div>${btn("Omhoog", "moveSubtopic", `${partAttrs(p,t,item)} data-direction="up" ${index === 0 ? "disabled" : ""}`, "text-button small")}${btn("Omlaag", "moveSubtopic", `${partAttrs(p,t,item)} data-direction="down" ${index === items.length-1 ? "disabled" : ""}`, "text-button small")}${btn("Verwijderen", "deleteSubtopic", partAttrs(p,t,item), "text-button small danger")}</div></details></div></article>`; }).join("")}</div>` : empty("Verdeel dit onderwerp in behapbare stukken.", "Maak een deelonderwerp met uitleg, voorbeelden en opdrachten.", btn("Eerste deelonderwerp maken", "newSubtopic", a, "primary"))}<section class="card final-exam-card section-space"><div class="eyebrow">NA HET LAATSTE DEEL</div><h2>Eindtoets · ${esc(t.title)}</h2><p>${allPartsDone(p,t) ? "Je hebt alle delen afgerond. Controleer nu wat je van het hele onderwerp beheerst." : "Lees ieder deel en rond de bijbehorende opdrachten af. Daarna kun je de eindtoets starten."}</p><p>${t.examQuestions?.length || 0} vragen · ${p.examMinutes ? p.examMinutes + " minuten" : "Geen tijdslimiet"}</p><div class="actions">${btn("Start eindtoets →", "exam", `${a} ${!allPartsDone(p,t) ? "disabled" : ""}`, "primary")}${btn("Toets bekijken en beheren", "manageExam", a, "ghost small")}</div></section>`;
    return;
  }
  const step = route.step || "read", state = partProgress(p,t,part), pa = partAttrs(p,t,part);
  body.innerHTML = `<div class="tabs learning-steps" role="tablist" aria-label="Stappen in dit deel"><button data-action="partStep" data-step="read" role="tab" aria-selected="${step === "read"}" class="${step === "read" ? "active" : ""}"><span class="tab-number">01</span>Uitleg & voorbeelden ${state.read ? "✓" : ""}</button><button data-action="partStep" data-step="work" role="tab" aria-selected="${step === "work"}" class="${step === "work" ? "active" : ""}"><span class="tab-number">02</span>Opdrachten ${state.done ? "✓" : ""}</button></div><div id="part-content"></div>`;
  const content = document.querySelector("#part-content");
  if (step === "read") {
    content.innerHTML = `<div class="content-toolbar"><span class="quiet">Lees rustig en bekijk de voorbeelden.</span><div class="actions">${btn("Tekst schrijven", "editSummary", pa, "ghost small")}${btn("↑ Tekstbestand uploaden", "attach", `${pa} data-kind="summary"`, "ghost small")}</div></div>${part.pdf ? `<iframe class="pdf" title="Bestaande samenvatting van ${attr(part.title)}" src="${media(p,part.pdf)}"></iframe>` : part.summary ? `<article class="card prose">${markdown(part.summary)}</article>` : empty("De uitleg begint hier.", "Schrijf tekst of upload een tekstbestand voor dit deel.")}${examples(p,t,part)}${legacyVideos(p,t,part)}<div class="part-footer">${btn("Uitleg gelezen · naar de opdrachten →", "readPart", pa, "primary")}</div>`;
    const video=topicVideos(part).find(v=>v.id===route.videoId)||topicVideos(part)[0];
    if(video)wireVideo(p,t,video,part);
  } else {
    const questions = part.questions || [], attempted = state.practiceCompleted || questions.length && questions.every(q => data.progress.questions[qkey(p,t,q)]?.count > 0);
    content.innerHTML = `<div class="content-toolbar"><span class="quiet">Oefen met de uitleg uit dit deel.</span><div class="actions">${btn("Opdrachttekst schrijven", "editAssignment", pa, "ghost small")}${btn("↑ Opdracht uploaden", "attach", `${pa} data-kind="assignment"`, "ghost small")}</div></div>${part.assignmentText ? `<article class="card prose">${markdown(part.assignmentText)}</article>` : ""}${fileList(p,t,part.assignments,"assignment",part)}<section class="card question-section"><h2>Opdrachten bij ${esc(part.title)}</h2>${questions.length ? btn("Maak de opdrachten →", "practice", pa, "primary") : '<p>Er zijn nog geen interactieve vragen. Heb je de opdrachttekst of het werkblad gedaan? Rond dit deel hieronder af.</p>'}<div class="actions section-space">${btn("＋ Vraag maken", "editQuestion", `${pa} data-list="questions"`, "ghost small")}${btn("Vragen importeren", "attach", `${pa} data-kind="practice"`, "text-button small")}</div>${questionList(p,t,"questions",part)}</section><div class="part-footer"><p>${state.done ? "Dit deel is afgerond. Je kunt het blijven herhalen." : !state.read ? "Markeer eerst de uitleg als gelezen." : questions.length && !attempted ? "Maak eerst de interactieve opdrachten. Je hoeft niet alles goed te hebben; fouten kun je herhalen." : "Klaar met de opdrachten en eventuele werkbladen? Rond dit deel af en ga verder."}</p>${btn(state.done ? "Verder naar het volgende deel →" : "Deel afronden en verder →", "completePart", `${pa} ${!state.read || questions.length && !attempted ? "disabled" : ""}`, "primary")}</div>`;
  }
}
function renderTopicExam(body, p, t) {
  body.innerHTML = `${btn("← Naar de deelonderwerpen", "topic", openAttrs(p,t), "ghost small")}<div class="content-toolbar"><h2>Eindtoets · ${esc(t.title)}</h2>${btn("↑ Toetsbestand uploaden", "attach", `${openAttrs(p,t)} data-kind="exam"`, "ghost small")}</div>${fileList(p,t,t.examFiles,"exam")}<section class="card question-section"><p>${allPartsDone(p,t) ? "Alle delen zijn afgerond." : "Je kunt de toets hier beheren. Starten kan nadat de deelonderwerpen zijn afgerond."} Antwoorden en uitleg verschijnen na het inleveren.</p><p>${t.examQuestions?.length || 0} vragen · ${p.examMinutes ? p.examMinutes + " minuten" : "Geen tijdslimiet"}</p>${btn("Start eindtoets →", "exam", `${openAttrs(p,t)} ${!allPartsDone(p,t) ? "disabled" : ""}`, "primary")}<div class="actions section-space">${btn("＋ Toetsvraag maken", "editQuestion", `${openAttrs(p,t)} data-list="examQuestions"`, "ghost small")}</div>${questionList(p,t,"examQuestions")}</section>`;
}
function subtopicEditor(kind, part) {
  const {p,t}=chosen();
  dialogBody(`<h2 id="dialog-title">${kind === "newSubtopic" ? "Nieuw deelonderwerp" : "Deelonderwerp hernoemen"}</h2><form id="subtopic-form"><label for="subtopic-title">Titel</label><input id="subtopic-title" required maxlength="200" value="${attr(part?.title || "")}" placeholder="Bijvoorbeeld: De eerste bouwstijlen">${formFooter()}</form>`);
  bindForm("subtopic-form",async()=>{
    const title=document.querySelector("#subtopic-title").value.trim();
    if(!title) throw Error("Vul een titel in.");
    if(kind === "newSubtopic") { const before=new Set(parts(t).map(s=>s.id)); acceptState(await api.newSubtopic({packageId:p.id,topicId:t.id,title})); const current=chosen().t; const added=parts(current).find(s=>!before.has(s.id)); route.part=added?.id; route.step="read"; delete route.tab; }
    else { acceptState(await api.updateSubtopic({...contentRequest(p,t,part),title})); }
    topicPage(); toast("Deelonderwerp opgeslagen.");
  });
}
function exampleEditor(part, example) {
  const {p,t}=chosen();
  dialogBody(`<h2 id="dialog-title">${example ? "Voorbeeld toelichten" : "Afbeelding met uitleg toevoegen"}</h2><form id="example-form"><label for="example-title">Titel / alternatieve tekst</label><input id="example-title" required maxlength="200" value="${attr(example?.title || "")}"><label for="example-caption">Wat moet je op deze afbeelding zien?</label><textarea id="example-caption" maxlength="10000">${esc(example?.caption || "")}</textarea><label for="example-source">Bron en eventuele licentie</label><input id="example-source" maxlength="2000" value="${attr(example?.source || "")}"><small>Gebruik een eigen of toegestaan beeld. De bron wordt als tekst getoond; de afbeelding wordt lokaal bewaard.</small>${formFooter(example ? "Opslaan" : "Afbeelding kiezen")}</form>`);
  bindForm("example-form",async()=>{
    const fields={title:document.querySelector("#example-title").value.trim(),caption:document.querySelector("#example-caption").value.trim(),source:document.querySelector("#example-source").value.trim()};
    if(!fields.title)throw Error("Vul een titel in.");
    let result;
    if(example) result=await api.updateSubtopic({...contentRequest(p,t,part),examples:part.examples.map(x=>x.id===example.id?{...x,...fields}:x)});
    else result=await api.attach({...contentRequest(p,t,part),kind:"example",...fields});
    if(result){acceptState(result);await contentEdited(p,t,part,"summary");}topicPage();
  });
}
function wireVideo(p, t, video, content = t) {
  const element = document.querySelector("#lesson-video");
  let lastSave = 0;
  let initialized = false;
  const primary = video.file === content.video;
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
    initialized = false;
    if (!Number.isFinite(element.duration) || element.duration <= 0) return;
    const position = videoProgress().position || 0;
    try {
      // Do not save the new element's initial zero before restoring its seek.
      element.currentTime = Math.min(Math.max(0, position), element.duration);
      initialized = true;
    } catch {
      toast("De kijkpositie kon niet worden hersteld. Open de video opnieuw.");
    }
  });
  element.addEventListener("error", () => {
    initialized = false;
    toast(
      "Deze video kan niet worden afgespeeld. Gebruik MP4 met H.264/AAC of WebM.",
    );
  });
  const update = () => {
    if (!initialized || element.error) return;
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
    if (initialized && Date.now() - lastSave > 3000) {
      lastSave = Date.now();
      update();
    }
  });
  element.addEventListener("pause", update);
  element.addEventListener("ended", update);
}
function settings() {
  main.innerHTML = `<div class="eyebrow">JOUW LEEROMGEVING</div><h1>Goed geregeld.</h1><p>Bewaar je studie en houd je materiaal bij de hand.</p><div class="settings-grid"><section class="card"><span class="section-index">01</span><h2>Je studie bewaren</h2><p>Neem lessen, media en voortgang mee in één volledige back-up.</p><div class="actions">${btn("Back-up maken", "backup", "", "primary")}${btn("Terugzetten", "restore", "", "ghost")}</div></section><section class="card"><span class="section-index">02</span><h2>Je eigen lesmateriaal</h2><p>Modules en onderwerpen maak je zelf aan. Gebruik de algemene briefing om op basis van je bronnen een lespakket te laten maken.</p>${btn("Instructies voor ChatGPT", "prompt", "", "ghost")}</section><section class="card"><span class="section-index">03</span><h2>Alles samen oefenen</h2><p>Gebruik de toetsvragen en overzichtsfilms uit al je eigen modules.</p><div class="actions">${btn("Eindtoets alle modules", "courseExam", "", "ghost")}${btn("Overzichtsfilms", "courseOverview", "", "ghost")}</div></section></div><p class="version-note">Makelaar Academie 0.4.0 · Lokaal & offline · Geen account nodig</p>`;
}

function progressPage() {
  const a = data.progress.attempts;
  main.innerHTML = `<div class="eyebrow">ELKE STAP TELT</div><h1>Je ziet jezelf groeien.</h1><p>Je kijkpositie, afgeronde onderwerpen, antwoorden en toetsresultaten blijven bewaard.</p><h2 class="section-space">Per onderwerp</h2>${allTopics()
    .map(({ p, t }) => {
      const s = tp(p, t), done = topicDone(p,t);
      return `<div class="topic-row"><span class="topic-index">${done ? "✓" : "○"}</span><div class="body"><h3>${esc(t.title)}</h3><p>${esc(p.moduleTitle)} · ${done ? "Afgerond" : "Nog bezig"} · ${parts(t).filter(part=>partProgress(p,t,part).done).length}/${parts(t).length} delen${s.videoDone ? " · Video uitgekeken" : ""}${s.duration ? " · Video " + Math.round(((s.position || 0) / s.duration) * 100) + "% positie" : ""}</p></div>${btn("Verder", "topic", openAttrs(p, t), "small")}</div>`;
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
      [...parts(t).flatMap(s => (s.questions || []).map(q => ({p,t,s,q}))), ...(t.examQuestions || []).map(q => ({p,t,q}))],
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
function startQuiz(items, title, exam = false, minutes = 0, returnRoute = null) {
  pauseMedia();
  if (!items.length) {
    toast("Er zijn nog geen vragen toegevoegd voor dit onderdeel.");
    return;
  }
  quiz = {
    items,
    title,
    exam,
    returnRoute,
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
  if (!quiz.exam && quiz.returnRoute?.part) {
    const {p,t,s}=quiz.items[0];
    if(s && quiz.items.every((item,i)=>quiz.checked[i] && (item.q.type!=="open" || quiz.self[i]!==undefined))) setPartProgress(p,t,s,{practiceCompleted:true});
  }
  if (quiz.exam && quiz.returnRoute?.t) {
    const {p,t}=quiz.items[0];
    if(allPartsDone(p,t)){data.progress.topics[key(p,t)]={...tp(p,t),done:true};save();}
  }
  resultPage();
}
function resultPage() {
  let auto = quiz.items.filter((x) => x.q.type !== "open").length,
    correct = quiz.items.filter(
      (x, i) => grade(x.q, quiz.answers[i]) === true,
    ).length;
  main.innerHTML = `<div class="eyebrow">${quiz.exam ? "TOETSRESULTAAT" : "OEFENSESSIE AFGEROND"}</div><h1>Dit neem je mee.</h1><div class="card"><div class="score">${auto ? Math.round((correct / auto) * 100) + "%" : "—"}</div><p>${correct} van ${auto} automatisch beoordeelde vragen goed. ${quiz.items.length - auto} open vragen beoordeel je zelf.</p><p>Dit is een oefenresultaat, geen officiële uitslag of voorspelling van slagen.</p><div class="actions">${quiz.returnRoute ? btn(quiz.exam ? "Terug naar het onderwerp" : "Terug naar de opdrachten →", "quizReturn", "", "primary") : ""}${btn("Naar mijn voortgang", "nav", 'data-view="progress"', "ghost")}${btn("Mijn herhaalvragen", "nav", 'data-view="review"', "ghost")}</div></div><h2 class="section-space">Antwoorden & uitleg</h2>${quiz.items.map(({ p, t, s, q }, i) => `<div class="results-item"><h3>${i + 1}. ${esc(q.prompt)}</h3><p>Jouw antwoord: ${esc(q.type === "choice" ? (q.options[quiz.answers[i]] ?? "Niet beantwoord") : (quiz.answers[i] ?? "Niet beantwoord"))}</p><p>Juiste antwoord${q.type === "open" ? " (model)" : ""}: ${esc(q.type === "choice" ? q.options[q.answer] : q.answer)}</p><p>${esc(q.explanation)}</p>${q.source ? "<small>Bron: " + esc(q.source) + "</small>" : ""}${q.type === "open" && quiz.exam ? `<div class="actions">${btn("Dit wist ik", "resultSelf", `data-i="${i}" data-value="yes" ${quiz.self[i] !== undefined ? "disabled" : ""}`, "small")}${btn("Nog herhalen", "resultSelf", `data-i="${i}" data-value="no" ${quiz.self[i] !== undefined ? "disabled" : ""}`, "small ghost")}</div>` : ""}${q.clip && clipVideo({p,t,s,q}) ? btn("Bekijk bijbehorend fragment", "resultClip", `data-i="${i}"`, "small ghost") : ""}</div>`).join("")}`;
}
function showClip(item, target) {
  const { p, q } = item;
  const file = clipVideo(item);
  if (!file || !q.clip) {
    target.innerHTML = `<div class="note">${esc(q.hint || "Er is nog geen videofragment gekoppeld aan deze vraag. Voeg tijdcodes toe aan het lespakket.")}</div>`;
    return;
  }
  target.innerHTML = `<div class="video-wrap section-space"><video id="hint-video" controls src="${media(p, file)}"></video><div class="video-meta">Fragment ${fmt(q.clip.start)}–${fmt(q.clip.end)} · ${esc(q.hint || "Bekijk de uitleg en probeer het opnieuw.")}</div></div>`;
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
  modal.classList.remove("example-dialog");
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
  const summary = field === "summary", part = selectedPart(t), content = part || t;
  dialogBody(
    `<div class="eyebrow">${esc(t.title)}</div><h2 id="dialog-title">${summary ? "Jouw samenvatting." : "Jouw opdracht."}</h2><form id="content-form"><label for="content-text">${summary ? "Samenvatting" : "Opdrachttekst"}</label><textarea class="writing-area" id="content-text" maxlength="200000" placeholder="Typ hier je tekst…">${esc(content[field] || "")}</textarea><small>Kopjes en lijsten kun je schrijven met Markdown.</small>${summary && content.pdf ? '<p class="note">Deze tekst vervangt de huidige PDF-samenvatting in dit onderwerp.</p>' : ""}${formFooter()}</form>`,
  );
  bindForm("content-form", async () => {
    acceptState(
      await updateContent(p,t,part,{ [field]: document.querySelector("#content-text").value }),
    );
    await contentEdited(p,t,part,field);
    render();
    toast("Tekst opgeslagen.");
  });
}
function questionEditor(field, questionId) {
  const { p, t } = chosen();
  const part = field === "questions" ? selectedPart(t) : null, content = part || t;
  const old = content[field]?.find((question) => question.id === questionId);
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
    const questions = [...(content[field] || [])];
    const index = old ? questions.findIndex((item) => item.id === old.id) : -1;
    if (index >= 0) questions[index] = question;
    else questions.push(question);
    acceptState(
      await updateContent(p,t,part,{ [field]: questions }),
    );
    await contentEdited(p,t,part,field);
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
  const part = t ? parts(t).find(s => s.id === (ds.s || route.part)) : null;
  if (name === "deleteTopic") {
    await saveQueue;
    const moduleId=p.moduleId;
    const result=await api.deleteTopic({packageId:p.id,topicId:t.id});
    if(result){acceptState(result);go({view:"module",moduleId});toast("Onderwerp verwijderd.");}
    return;
  }
  if (name === "newSubtopic") return subtopicEditor(name);
  if (name === "renameSubtopic") return subtopicEditor(name,part);
  if (name === "openPart") return go({view:"topic",p:ds.p,t:ds.t,part:ds.s,step:"read"});
  if (name === "partStep") {pauseMedia();route.step=ds.step;topicPage();return;}
  if (name === "readPart") {await setPartProgress(p,t,part,{read:true});route.step="work";topicPage();return;}
  if (name === "completePart") {
    const state=partProgress(p,t,part), qs=part.questions || [];
    if(!state.read || qs.length && !state.practiceCompleted && !qs.every(q=>data.progress.questions[qkey(p,t,q)]?.count>0)){toast("Lees eerst de uitleg en maak de opdrachten.");return;}
    await setPartProgress(p,t,part,{done:true});
    const next=parts(t)[parts(t).findIndex(s=>s.id===part.id)+1];
    return go(next?{view:"topic",p:p.id,t:t.id,part:next.id,step:"read"}:{view:"topic",p:p.id,t:t.id});
  }
  if (name === "moveSubtopic") {
    await saveQueue;acceptState(await api.moveSubtopic({...contentRequest(p,t,part),direction:ds.direction}));topicPage();return;
  }
  if (name === "deleteSubtopic") {
    await saveQueue;
    const result=await api.deleteSubtopic(contentRequest(p,t,part));
    if(result){acceptState(result);delete route.part;delete route.step;topicPage();}
    return;
  }
  if (name === "viewExample") {
    const example=part?.examples?.find(item=>item.id===ds.id);
    if(!example)throw Error("Dit voorbeeld bestaat niet meer.");
    dialogBody(`<h2 id="dialog-title">${esc(example.title)}</h2><figure class="example-expanded"><img src="${media(p,example.file)}" alt="${attr(example.title)}"><figcaption>${example.caption ? `<p>${esc(example.caption)}</p>` : ""}${example.source ? `<small>Bron: ${esc(example.source)}</small>` : ""}</figcaption></figure><div class="form-actions">${btn("Sluiten","close","","ghost")}</div>`);
    modal.classList.add("example-dialog");
    return;
  }
  if (name === "addExample") return exampleEditor(part);
  if (name === "editExample") return exampleEditor(part,part.examples.find(e=>e.id===ds.id));
  if (name === "manageExam") return go({view:"topic",p:p.id,t:t.id,tab:"exam"});
  if (name === "quizReturn") return go(quiz.returnRoute);
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
      await updateContent(p,t,ds.list==="questions"?part:null,{ [ds.list]:(ds.list==="questions"?part||t:t)[ds.list].filter(question=>question.id!==ds.id) }),
    );
    render();
    await contentEdited(p,t,ds.list === "questions" ? part : null,ds.list);
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
      ...(part && Array.isArray(t.subtopics) ? {subtopicId:part.id} : {}),
      kind: ds.kind,
    });
    if (result) {
      acceptState(result);
      render();
      if(part && ["summary","practice","assignment"].includes(ds.kind)) await contentEdited(p,t,part,ds.kind === "practice" ? "questions" : ds.kind === "summary" ? "summary" : "assignmentText");
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
        ...(part && Array.isArray(t.subtopics) ? {subtopicId:part.id} : {}),
        kind: ds.kind,
        id: ds.id,
      }),
    );
    render();
    toast("Bestand verwijderd.");
    return;
  }
  if (name === "openFile") {
    const file = (ds.kind === "exam" ? t.examFiles : (part || t).assignments)?.find(
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
    if(name === "exam" && !allPartsDone(p,t)){toast("Rond eerst alle deelonderwerpen af.");return;}
    const content = part || t;
    const items = name === "exam" ? (t.examQuestions || []).map(q=>({p,t,q})) : (content.questions || []).map(q=>({p,t,s:part,q}));
    startQuiz(items,name === "exam" ? "Eindtoets · "+t.title : content.title,name === "exam",p.examMinutes || 0,{view:"topic",p:p.id,t:t.id,...(name==="practice" && part?{part:part.id,step:"work"}:{})});
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
    if(packages.some(pkg=>pkg.topics.some(topic=>!allPartsDone(pkg,topic)))){toast("Rond eerst de deelonderwerpen van de betrokken onderwerpen af.");return;}
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
