const { JSDOM } = require("jsdom");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const clone = (value) => structuredClone(value);
const wait = () => new Promise((resolve) => setTimeout(resolve, 15));

(async () => {
  const dom = new JSDOM(
    fs.readFileSync(path.join(__dirname, "../app/index.html"), "utf8"),
    {
      runScripts: "outside-only",
      url: "http://localhost",
    },
  );
  const w = dom.window;
  const d = w.document;
  w.structuredClone = structuredClone;
  w.confirm = () => true;
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.play = function () {
    return Promise.resolve();
  };
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  const demo = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../app/demo/lespakket.json"), "utf8"),
  );
  // A legacy primary video and an additional v0.2 video must both remain visible.
  demo.topics[0].videos = [
    { id: "additional-video", title: "Verdieping", file: "assets/second.webm" },
  ];
  demo.topics[0].questions[0].clip.videoId = "additional-video";
  let state = { packages: [demo], progress: {} };
  let serial = 0;
  let fullscreen = true;
  const windowCalls = [];
  const attachmentCalls = [];
  const reply = () =>
    clone({
      ...state,
      modules: [
        ...new Map(
          state.packages.map((pkg) => [
            pkg.moduleId,
            { id: pkg.moduleId, title: pkg.moduleTitle },
          ]),
        ).values(),
      ],
    });
  const topic = (request) =>
    state.packages
      .find((pkg) => pkg.id === request.packageId)
      .topics.find((item) => item.id === request.topicId);
  w.academy = {
    state: async () => reply(),
    save: async (progress) => {
      state.progress = clone(progress);
    },
    windowControl: async (command) => {
      windowCalls.push(command);
      if (command === "toggleFullscreen") fullscreen = !fullscreen;
      return { fullscreen };
    },
    prompt: async () =>
      fs.readFileSync(
        path.join(__dirname, "../app/MAAK-EEN-LESPAKKET.md"),
        "utf8",
      ),
    newModule: async (request) => {
      const id = "custom-module-" + ++serial;
      state.packages.push({
        format: "makelaar-lespakket",
        schemaVersion: 1,
        id,
        moduleId: id,
        moduleTitle: request.title,
        title: request.title,
        topics: [],
      });
      return reply();
    },
    renameModule: async (request) => {
      state.packages
        .filter((pkg) => pkg.moduleId === request.moduleId)
        .forEach((pkg) => {
          pkg.moduleTitle = request.title;
        });
      return reply();
    },
    deleteModule: async (id) => {
      state.packages = state.packages.filter((pkg) => pkg.moduleId !== id);
      return reply();
    },
    newTopic: async (request) => {
      const pkg = state.packages.find(
        (pkg) => pkg.moduleId === request.moduleId,
      );
      pkg.topics.push({
        id: "custom-topic-" + ++serial,
        title: request.title,
        summary: "",
        questions: [],
        examQuestions: [],
      });
      return reply();
    },
    updateTopic: async (request) => {
      const target = topic(request);
      for (const field of [
        "title",
        "summary",
        "assignmentText",
        "questions",
        "examQuestions",
      ]) {
        if (Object.hasOwn(request, field))
          target[field] = clone(request[field]);
      }
      if (Object.hasOwn(request, "summary")) delete target.pdf;
      return reply();
    },
    attach: async (request) => {
      attachmentCalls.push(request.kind);
      const target = topic(request);
      if (request.kind === "video") {
        target.videos = [
          { id: "video-one", title: "Introductie", file: "assets/one.mp4" },
          { id: "video-two", title: "Verdieping", file: "assets/two.webm" },
        ];
        target.video = target.videos[0].file;
      }
      if (request.kind === "assignment")
        target.assignments = [
          {
            id: "assignment-one",
            title: "Opdracht <gebouw>",
            file: "assets/opdracht.pdf",
          },
        ];
      if (request.kind === "practice")
        target.questions.push({
          id: "imported-practice",
          type: "choice",
          prompt: "Geïmporteerde opdrachtvraag",
          options: ["Ja", "Nee"],
          answer: 0,
          explanation: "Uitleg",
        });
      if (request.kind === "exam") {
        target.examQuestions = [
          {
            id: "imported-exam",
            type: "choice",
            prompt: "Geïmporteerde toetsvraag",
            options: ["A", "B"],
            answer: 1,
            explanation: "B klopt",
          },
        ];
        target.examFiles = [
          { id: "exam-file", title: "Toetsdocument", file: "assets/toets.pdf" },
        ];
      }
      return reply();
    },
    removeAttachment: async (request) => {
      const target = topic(request);
      const field =
        request.kind === "video"
          ? "videos"
          : request.kind === "exam"
            ? "examFiles"
            : "assignments";
      target[field] = target[field].filter((file) => file.id !== request.id);
      return reply();
    },
  };
  w.eval(fs.readFileSync(path.join(__dirname, "../app/renderer.js"), "utf8"));
  await wait();
  const click = async (selector) => {
    const element = d.querySelector(selector);
    assert(element, "Missing " + selector);
    element.click();
    await wait();
  };
  const input = (selector, value, type = "input") => {
    const element = d.querySelector(selector);
    assert(element, "Missing " + selector);
    element.value = value;
    element.dispatchEvent(new w.Event(type, { bubbles: true }));
  };
  const submit = async (selector) => {
    d.querySelector(selector).dispatchEvent(
      new w.Event("submit", { cancelable: true, bubbles: true }),
    );
    await wait();
  };
  const text = () => d.querySelector("main").textContent;

  assert.match(text(), /Jouw eigen studeerkamer/);
  assert.equal(
    d.querySelector('#modules [data-id="bt2"]'),
    null,
    "No fabricated default modules",
  );
  assert.equal(d.querySelectorAll(".window-controls button").length, 3);
  assert(windowCalls.includes("state"));
  await click('[data-action="window"][data-command="minimize"]');
  await click('[data-action="window"][data-command="toggleFullscreen"]');
  assert.equal(fullscreen, false);
  assert.equal(
    d.querySelector("#window-fullscreen").getAttribute("aria-label"),
    "Volledig scherm",
  );
  const f11 = new w.KeyboardEvent("keydown", {
    key: "F11",
    bubbles: true,
    cancelable: true,
  });
  d.dispatchEvent(f11);
  await wait();
  assert.equal(fullscreen, true);
  assert(f11.defaultPrevented);

  // Existing lessons, clip linkage, feedback and complete examination flow remain usable.
  await click("[data-action=topic]");
  await click("[data-tab=video]");
  assert.equal(d.querySelectorAll("[data-action=selectVideo]").length, 2);
  assert.match(d.querySelector("#lesson-video").src, /demo\.mp4$/);
  await click("[data-tab=practice]");
  await click("[data-action=practice]");
  await click("[data-action=hint]");
  assert.match(d.querySelector("#hint-video").src, /second\.webm$/);
  await click('[data-action=answer][data-index="1"]');
  await click("[data-action=check]");
  assert.match(text(), /Nog even aanscherpen/);
  await click("[data-action=next]");
  input("#answer-text", "Humor en concrete voorbeelden");
  await click("[data-action=check]");
  await click("[data-action=self][data-value=yes]");
  await click("[data-action=next]");
  assert.match(text(), /Dit neem je mee/);
  await click("#nav [data-view=review]");
  assert.match(text(), /1 vragen klaar/);
  await click("#nav [data-view=home]");
  await click("[data-action=topic]");
  await click("[data-tab=exam]");
  await click("[data-action=exam]");
  assert.equal(d.querySelector("[data-action=hint]"), null);
  await click('[data-action=answer][data-index="0"]');
  await click("[data-action=next]");
  input("#answer-text", "2");
  await click("[data-action=next]");
  assert.match(text(), /100%/);
  assert.equal(state.progress.attempts[0].correct, 2);
  await click("#nav [data-view=progress]");
  assert.match(text(), /2\/2 \(100%\)/);
  await click("#nav [data-view=settings]");
  await click("[data-action=prompt]");
  assert.match(d.querySelector("#prompt-text").value, /makelaar-lespakket/);
  await click("[data-action=close]");

  // A custom empty module persists and is named by the user rather than by a fixed list.
  await click("[data-action=newModule]");
  input("#name-title", "Praktijk & Recht");
  await submit("#name-form");
  const custom = state.packages.find(
    (pkg) => pkg.moduleTitle === "Praktijk & Recht",
  );
  assert(custom);
  assert.equal(custom.topics.length, 0);
  assert.equal(d.querySelector("main h1").textContent, "Praktijk & Recht");
  await click("[data-action=renameModule]");
  input("#name-title", "Mijn makelaarsopleiding");
  await submit("#name-form");
  assert.equal(
    d.querySelector("main h1").textContent,
    "Mijn makelaarsopleiding",
  );
  await click("[data-action=new]");
  assert.equal(d.querySelector("#new-module").value, custom.moduleId);
  input("#name-title", "Een eigen onderwerp");
  await submit("#name-form");
  const ownTopic = custom.topics[0];
  assert.equal(d.querySelector("main h1").textContent, "Een eigen onderwerp");
  assert.deepEqual(
    [...d.querySelectorAll("[role=tab]")].map((tab) =>
      tab.textContent.replace(/^0\d/, "").trim(),
    ),
    ["Samenvatting", "Video’s", "Opdrachten", "Oefentoets"],
  );
  await click("[data-action=editSummary]");
  input("#content-text", "# Eigen samenvatting\n\nEen heldere uitleg.");
  await submit("#content-form");
  assert.match(d.querySelector(".prose").textContent, /Een heldere uitleg/);
  assert.match(ownTopic.summary, /Eigen samenvatting/);
  await click("[data-action=renameTopic]");
  input("#name-title", "Bouwstijlen");
  await submit("#name-form");
  assert.equal(d.querySelector("main h1").textContent, "Bouwstijlen");

  // Unsaved editing can be cancelled without silently discarding text.
  await click("[data-action=editSummary]");
  input("#content-text", "Nog niet opgeslagen");
  w.confirm = () => false;
  await click("[data-action=close]");
  assert.equal(d.querySelector("#modal").open, true);
  assert.match(ownTopic.summary, /Eigen samenvatting/);
  w.confirm = () => true;
  await click("[data-action=close]");

  // Manual assignments and authoring each supported question type.
  await click("[data-tab=practice]");
  await click("[data-action=editAssignment]");
  input("#content-text", "## Opdracht\n\nBeschrijf het gebouw.");
  await submit("#content-form");
  assert.match(text(), /Beschrijf het gebouw/);
  await click("[data-action=editQuestion]");
  input("#question-prompt", "Welk materiaal?");
  input("#question-options", "Baksteen");
  await submit("#question-form");
  assert.equal(d.querySelector("#modal").open, true);
  assert.match(d.querySelector("#form-error").textContent, /2 tot 8/);
  input("#question-options", "Baksteen\nHout");
  input("#question-answer", "1", "change");
  input("#question-explanation", "Het gebouw heeft houten gevels.");
  await submit("#question-form");
  assert.equal(ownTopic.questions.length, 1);
  assert.equal(ownTopic.questions[0].answer, 1);
  const originalId = ownTopic.questions[0].id;
  await click("[data-action=editQuestion][data-id]");
  await submit("#question-form");
  assert.equal(
    ownTopic.questions[0].id,
    originalId,
    "Unchanged question retains progress identity",
  );
  await click("[data-action=editQuestion][data-id]");
  input("#question-prompt", "Welk materiaal zie je?");
  await submit("#question-form");
  assert.notEqual(
    ownTopic.questions[0].id,
    originalId,
    "Changed question gets fresh progress identity",
  );
  await click("[data-action=editQuestion]:not([data-id])");
  input("#question-type", "number", "change");
  input("#question-prompt", "Hoeveel meter?");
  input("#question-answer", "2,5");
  input("#question-tolerance", "0,1");
  await submit("#question-form");
  assert.equal(ownTopic.questions[1].answer, 2.5);
  assert.equal(ownTopic.questions[1].tolerance, 0.1);
  await click("[data-action=editQuestion]:not([data-id])");
  input("#question-type", "open", "change");
  input("#question-prompt", "Beschrijf de bouwstijl.");
  input("#question-answer", "Model met herkenbare kenmerken.");
  await submit("#question-form");
  assert.equal(ownTopic.questions[2].type, "open");
  await click("[data-action=attach][data-kind=assignment]");
  assert.match(text(), /Opdracht <gebouw>/);
  await click("[data-action=openFile]");
  assert.match(
    d.querySelector(".document-viewer").src,
    /academy:\/\/media\/.+\/assets\/opdracht\.pdf$/,
  );
  assert.equal(
    d.querySelector("#modal gebouw"),
    null,
    "Attachment title is escaped",
  );
  await click("[data-action=close]");
  await click("[data-action=attach][data-kind=practice]");
  assert.match(text(), /Geïmporteerde opdrachtvraag/);

  // Multiple videos keep distinct positions, while old primary-video fields are compatible.
  await click("[data-tab=video]");
  await click("[data-action=attach][data-kind=video]");
  assert.equal(d.querySelectorAll("[data-action=selectVideo]").length, 2);
  const firstVideo = d.querySelector("#lesson-video");
  firstVideo.currentTime = 3.5;
  Object.defineProperty(firstVideo, "duration", {
    value: 20,
    configurable: true,
  });
  firstVideo.dispatchEvent(new w.Event("timeupdate"));
  await wait();
  await click("[data-action=selectVideo][data-id=video-two]");
  const secondVideo = d.querySelector("#lesson-video");
  assert.match(secondVideo.src, /two\.webm$/);
  secondVideo.currentTime = 8;
  Object.defineProperty(secondVideo, "duration", {
    value: 30,
    configurable: true,
  });
  secondVideo.dispatchEvent(new w.Event("timeupdate"));
  await wait();
  const saved = state.progress.topics[custom.id + "/" + ownTopic.id];
  assert.equal(saved.position, 3.5);
  assert.equal(saved.videos["video-one"].position, 3.5);
  assert.equal(saved.videos["video-two"].position, 8);
  assert.equal(
    saved.videos["video-one"].videos,
    undefined,
    "No recursive video-state nesting",
  );

  // Interactive examination import, manual editing and local document access.
  await click("[data-tab=exam]");
  await click("[data-action=exam]");
  assert.match(d.querySelector("#toast").textContent, /nog geen vragen/);
  await click("[data-action=attach][data-kind=exam]");
  assert.match(text(), /Geïmporteerde toetsvraag/);
  await click("[data-action=editQuestion]:not([data-id])");
  input("#question-type", "open", "change");
  input("#question-prompt", "Leg het uit.");
  input("#question-answer", "Een goed modelantwoord.");
  await submit("#question-form");
  assert.equal(ownTopic.examQuestions.length, 2);
  await click("[data-action=deleteQuestion][data-id=imported-exam]");
  assert.equal(ownTopic.examQuestions.length, 1);
  await click("[data-action=openFile]");
  assert.match(d.querySelector(".document-viewer").src, /toets\.pdf$/);
  await click("[data-action=close]");
  await click("[data-action=removeAttachment][data-kind=exam]");
  assert.equal(ownTopic.examFiles.length, 0);
  await click('#modules [data-id="' + custom.moduleId + '"]');
  await click("[data-action=deleteModule]");
  assert(!state.packages.some((pkg) => pkg.id === custom.id));
  assert.match(text(), /Jouw eigen studeerkamer/);
  await click('[data-action="window"][data-command="close"]');
  assert(windowCalls.includes("close"));
  assert.deepEqual(attachmentCalls, [
    "assignment",
    "practice",
    "video",
    "exam",
  ]);

  console.log(
    "PASS: DOM flows: legacy lessons and exams; custom module/topic naming; summary and assignment editing; choice/number/open question authoring and identity; JSON/document imports; multiple videos with independent progress; fullscreen controls and safe cancellation.",
  );
  dom.window.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
