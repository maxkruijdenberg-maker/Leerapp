#!/usr/bin/env node
'use strict';

// Run against the real desktop runtime, with a disposable profile. This does not
// exercise the Windows installer, video codecs or PDF rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const timeoutMs = 30_000;
const liveApps = new Set();
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function eventually(check, description, milliseconds = timeoutMs) {
  const deadline = Date.now() + milliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(150);
  }
  throw Error(description + ' timed out' + (lastError ? ': ' + lastError.message : ''));
}

class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.requests = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.requests.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.requests.delete(message.id);
      if (message.error) pending.reject(Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.requests.values()) {
        clearTimeout(pending.timer);
        pending.reject(Error('Desktop debugging connection closed'));
      }
      this.requests.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(Error('Desktop debugging connection timed out'));
      }, 10_000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(Error('Desktop debugging connection failed'));
      }, { once: true });
    });
    return new DevTools(socket);
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(Error(method + ' timed out'));
      }, 15_000);
      this.requests.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true
    });
    if (response.exceptionDetails) {
      const error = response.exceptionDetails.exception;
      throw Error(error?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() { this.socket.close(); }
}

async function launch(profile) {
  const executable = process.env.SMOKE_EXECUTABLE
    ? path.resolve(project, process.env.SMOKE_EXECUTABLE)
    : require('electron');
  assert.equal(typeof executable, 'string', 'Run this script with Node.js, not Electron');
  const childEnvironment = { ...process.env };
  delete childEnvironment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [...(process.env.SMOKE_EXECUTABLE ? [] : [project]), '--user-data-dir=' + profile,
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'], {
    cwd: project, env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false
  });
  const app = { child, stderr: '', exit: null, error: null, devtools: null };
  liveApps.add(app);
  child.on('error', error => { app.error = error; });
  child.on('exit', (code, signal) => { app.exit = { code, signal }; });
  child.stdout.on('data', () => {});
  child.stderr.on('data', chunk => { app.stderr = (app.stderr + chunk).slice(-32_000); });
  try {
    const browserUrl = await eventually(() => {
      if (app.error) throw app.error;
      if (app.exit) throw Error('Electron exited before startup: ' + JSON.stringify(app.exit));
      return app.stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    }, 'Electron startup');
    const port = new URL(browserUrl).port;
    const target = await eventually(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list', {
        signal: AbortSignal.timeout(3000)
      });
      assert(response.ok, 'Local debugging target unavailable');
      return (await response.json()).find(page => page.type === 'page' && page.url.endsWith('/app/index.html'));
    }, 'App renderer target');
    app.devtools = await DevTools.connect(target.webSocketDebuggerUrl);
    await eventually(() => app.devtools.evaluate('Boolean(window.academy && document.querySelector(".titlebar") && document.querySelector("#main")?.textContent.trim())'),
      'App renderer readiness');
    assert(fs.existsSync(path.join(profile, 'packages')) && fs.existsSync(path.join(profile, 'initialized')),
      'The isolated profile was not used; refusing to modify application data');
    return app;
  } catch (error) {
    throw Error(error.message + (app.stderr ? '\nElectron stderr:\n' + app.stderr.slice(-4000) : ''), { cause: error });
  }
}

async function stop(app, requireGraceful = false) {
  if (!app.child.pid) {
    liveApps.delete(app);
    if (requireGraceful) throw app.error || Error('Electron did not start');
    return;
  }
  if (!app.exit && app.devtools) {
    try {
      await app.devtools.evaluate(requireGraceful
        ? 'document.querySelector(".window-controls [data-action=window][data-command=close]").click()'
        : 'void window.academy.windowControl("close")');
    } catch { /* The renderer can disconnect before replying to its close request. */ }
    try { await eventually(() => app.exit, 'Closing the desktop app', 7000); }
    catch { /* Fall back to terminating only the process this script started. */ }
  }
  let forced = false;
  if (!app.exit) {
    forced = true;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(app.child.pid), '/T', '/F'], {
        stdio: 'ignore', timeout: 5000, windowsHide: true
      });
    } else {
      app.child.kill('SIGTERM');
      try { await eventually(() => app.exit, 'Stopping Electron', 2000); }
      catch { app.child.kill('SIGKILL'); }
    }
    await eventually(() => app.exit, 'Electron process cleanup', 5000);
  }
  app.devtools?.close();
  liveApps.delete(app);
  if (requireGraceful) {
    assert(!forced, 'The custom close control did not close the application');
    assert.equal(app.exit.code, 0, 'The desktop app did not exit cleanly');
  }
}

async function click(client, selector, description = selector) {
  await eventually(() => client.evaluate('Boolean(document.querySelector(' + JSON.stringify(selector) + '))'),
    'Control available: ' + description);
  await client.evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
}

async function showTopic(app, ids) {
  const client = app.devtools;
  await click(client, '[data-action="module"][data-id="' + ids.moduleId + '"]', 'Saved module');
  await click(client, '[data-action="topic"][data-p="' + ids.packageId + '"][data-t="' + ids.topicId + '"]', 'Saved topic');
  await eventually(() => client.evaluate('Boolean(document.querySelector(".learning-route"))'),
    'Saved subtopics in the topic overview');
}

async function showPart(app, ids, partId, expectedText) {
  await showTopic(app, ids);
  await click(app.devtools, '[data-action="openPart"][data-s="' + partId + '"]', 'Open saved subtopic');
  await eventually(() => app.devtools.evaluate('document.querySelector("#part-content .prose")?.textContent.includes(' + JSON.stringify(expectedText) + ')'),
    'Native subtopic text');
}

async function completePractice(client, type) {
  await click(client, '[data-action="readPart"]', 'Read explanation');
  await eventually(() => client.evaluate('Boolean(document.querySelector("[data-action=completePart]")?.disabled)'),
    'Exercises required before completing the subtopic');
  await click(client, '[data-action="practice"]', 'Start subtopic exercises');
  if (type === 'choice') {
    // A completed attempt permits continuing even when the answer was wrong.
    await click(client, '[data-action="answer"][data-index="1"]');
  } else {
    await client.evaluate('(()=>{const input=document.querySelector("#answer-text");input.value="Mijn eigen antwoord in de desktopcontrole.";input.dispatchEvent(new Event("input",{bubbles:true}));})()');
  }
  await click(client, '[data-action="check"]', 'Check answer');
  if (type === 'open') await click(client, '[data-action="self"][data-value="yes"]', 'Self-assess open answer');
  await click(client, '[data-action="next"]', 'Finish exercise session');
  await click(client, '[data-action="quizReturn"]', 'Return to this subtopic');
  await eventually(() => client.evaluate('document.querySelector("[data-action=completePart]")?.disabled === false'),
    'Subtopic can be completed after exercises');
  await click(client, '[data-action="completePart"]', 'Complete subtopic and continue');
}

async function main() {
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    throw Error('A graphical display is required. Start Xorg/Xvfb and set DISPLAY before running this smoke check.');
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-desktop-smoke-'));
  const profile = path.join(directory, 'profile');
  fs.mkdirSync(profile);
  const onSignal = () => {
    Promise.allSettled([...liveApps].map(app => stop(app))).finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    let app = await launch(profile);
    let client = app.devtools;
    const initial = await client.evaluate('(async()=>({title:document.title,require:typeof window.require,window:await window.academy.windowControl("state"),controls:[...document.querySelectorAll(".window-controls [data-action=window]")].map(button=>button.dataset.command)}))()');
    assert.equal(initial.title, 'Makelaar Academie');
    assert.equal(initial.require, 'undefined', 'Node integration unexpectedly exposed to the renderer');
    assert.equal(initial.window.fullscreen, true, 'The app did not start fullscreen');
    assert.deepEqual([...initial.controls].sort(), ['close', 'minimize', 'toggleFullscreen']);

    const ids = await client.evaluate(`(async()=>{
      let state=await window.academy.newModule({title:'Mijn eigen studie'});
      const module=state.modules.find(module=>module.title==='Mijn eigen studie');
      if(!module)throw Error('New module missing');
      state=await window.academy.newTopic({moduleId:module.id,title:'Mijn eerste onderwerp'});
      const pkg=state.packages.find(pkg=>pkg.moduleId===module.id);
      const topic=pkg.topics.find(topic=>topic.title==='Mijn eerste onderwerp');
      await window.academy.updateTopic({packageId:pkg.id,topicId:topic.id,
        summary:'# Mijn samenvatting\\n\\nEen eigen samenvatting voor de desktopcontrole.',
        assignmentText:'Beschrijf in je eigen woorden wat je hebt geleerd.',
        questions:[{id:'smoke-practice',type:'choice',prompt:'Welk antwoord is juist?',options:['Juist','Onjuist'],answer:0,explanation:'Het eerste antwoord is juist.'}],
        examQuestions:[{id:'smoke-exam',type:'number',prompt:'Hoeveel is één plus één?',answer:2,tolerance:0,explanation:'Eén plus één is twee.'}]
      });
      return {moduleId:module.id,packageId:pkg.id,topicId:topic.id};
    })()`);
    assert(fs.existsSync(path.join(profile, 'packages', ids.packageId, 'lespakket.json')),
      'The custom module was not saved inside the disposable profile');
    await client.call('Page.reload');
    await showTopic(app, ids);
    // First present the existing flat lesson as one implicit part, then migrate
    // through the public API. This preserves the legacy summary/question IDs.
    await click(client, '[data-action="openPart"][data-s="legacy"]');
    await eventually(() => client.evaluate('document.querySelector("#part-content .prose")?.textContent.includes("Een eigen samenvatting voor de desktopcontrole.")'),
      'Legacy lesson is readable as a native part');
    const partIds = await client.evaluate('(async()=>{const request=' + JSON.stringify({packageId: ids.packageId, topicId: ids.topicId}) + ';const state=await window.academy.newSubtopic({...request,title:"Tweede deel"});const topic=state.packages.find(p=>p.id===request.packageId).topics.find(t=>t.id===request.topicId);const added=topic.subtopics.find(s=>s.id!=="legacy");await window.academy.updateSubtopic({...request,subtopicId:added.id,summary:"# Tweede uitleg\\n\\nEen tweede stuk tekst voor de desktopcontrole.",assignmentText:"Leg dit deel in je eigen woorden uit.",questions:[{id:"smoke-open",type:"open",prompt:"Wat neem je mee uit dit deel?",answer:"Een eigen uitleg over het tweede deel.",explanation:"Vergelijk je antwoord zelf met het model."}]});return {first:"legacy",second:added.id};})()');
    const assetDirectory = path.join(profile, 'packages', ids.packageId, 'assets');
    fs.mkdirSync(assetDirectory, {recursive: true});
    fs.copyFileSync(path.join(project, 'app', 'demo', 'assets', 'vormen.png'), path.join(assetDirectory, 'smoke-example.png'));
    await client.evaluate('(async()=>{const request=' + JSON.stringify({packageId: ids.packageId, topicId: ids.topicId, subtopicId: partIds.first}) + ';await window.academy.updateSubtopic({...request,examples:[{id:"smoke-example",title:"Voorbeeld bij de uitleg",file:"assets/smoke-example.png",caption:"Twee schematische vormen voor de desktopcontrole.",source:"Eigen app-demonstratie"}]});})()');
    await client.call('Page.reload');
    await showTopic(app, ids);
    assert.equal(await client.evaluate('document.querySelectorAll(".part-row").length'), 2);
    assert.equal(await client.evaluate('document.querySelector(".final-exam-card [data-action=exam]")?.disabled'), true,
      'The topic exam must remain locked before all parts are completed');
    await showPart(app, ids, partIds.first, 'Een eigen samenvatting voor de desktopcontrole.');
    const displayed = await client.evaluate('({text:document.querySelector(".example-card")?.textContent,src:document.querySelector(".example-card img")?.getAttribute("src"),iframe:!!document.querySelector("#part-content iframe")})');
    assert(displayed.text.includes('Twee schematische vormen voor de desktopcontrole.'));
    assert(displayed.text.includes('Eigen app-demonstratie'));
    assert(displayed.src.includes('smoke-example.png'));
    await eventually(() => client.evaluate('document.querySelector(".example-card img")?.naturalWidth > 0'),
      'Local example image loaded in the real renderer');
    assert.equal(displayed.iframe, false, 'Native text was replaced by a PDF viewer');
    await completePractice(client, 'choice');
    await eventually(() => client.evaluate('document.querySelector("#part-content .prose")?.textContent.includes("Een tweede stuk tekst voor de desktopcontrole.")'),
      'Completing a part opens the next explanation');
    await completePractice(client, 'open');
    await eventually(() => client.evaluate('document.querySelector(".final-exam-card [data-action=exam]")?.disabled === false'),
      'Topic exam unlocks after every part is completed');
    await click(client, '.final-exam-card [data-action="exam"]', 'Start topic final exam');
    await client.evaluate('(()=>{const input=document.querySelector("#answer-text");input.value="2";input.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await click(client, '[data-action="next"]', 'Submit final exam');
    await eventually(() => client.evaluate('document.querySelector(".score")?.textContent === "100%"'), 'Final exam result');
    await click(client, '[data-action="quizReturn"]', 'Return to completed topic');
    await eventually(() => client.evaluate('(async()=>{const s=await window.academy.state();const p=s.progress.topics[' + JSON.stringify(ids.packageId + '/' + ids.topicId) + '];return !!(p?.done && p.subtopics?.legacy?.done && p.subtopics?.[' + JSON.stringify(partIds.second) + ']?.done);})()'),
      'Saved completion of the topic and both parts');
    if (process.env.SCREENSHOT_PATH) {
      const screenshot = await client.call('Page.captureScreenshot', { format: 'png' });
      const filename = path.resolve(process.env.SCREENSHOT_PATH);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, Buffer.from(screenshot.data, 'base64'));
    }
    await client.evaluate('document.querySelector("#window-fullscreen").click()');
    await eventually(() => client.evaluate('(async()=>!(await window.academy.windowControl("state")).fullscreen)()'),
      'Leaving fullscreen with the app control', 7000);
    await client.evaluate('document.querySelector("#window-fullscreen").click()');
    await eventually(() => client.evaluate('(async()=>(await window.academy.windowControl("state")).fullscreen)()'),
      'Entering fullscreen with the app control', 7000);
    await stop(app, true);

    app = await launch(profile);
    client = app.devtools;
    const saved = await client.evaluate('(async()=>{const state=await window.academy.state();const p=state.packages.find(p=>p.id===' + JSON.stringify(ids.packageId) + ');return {module:state.modules.find(m=>m.id===' + JSON.stringify(ids.moduleId) + '),topic:p?.topics.find(t=>t.id===' + JSON.stringify(ids.topicId) + '),window:await window.academy.windowControl("state")}})()');
    assert.equal(saved.module.title, 'Mijn eigen studie');
    assert.equal(saved.topic.title, 'Mijn eerste onderwerp');
    assert.equal(saved.topic.subtopics.length, 2);
    const legacy = saved.topic.subtopics.find(part => part.id === partIds.first);
    const second = saved.topic.subtopics.find(part => part.id === partIds.second);
    assert(legacy.summary.includes('Een eigen samenvatting voor de desktopcontrole.'));
    assert.equal(legacy.assignmentText, 'Beschrijf in je eigen woorden wat je hebt geleerd.');
    assert.equal(legacy.questions[0].id, 'smoke-practice');
    assert.equal(legacy.questions[0].answer, 0);
    assert.equal(legacy.examples[0].source, 'Eigen app-demonstratie');
    assert(second.summary.includes('Een tweede stuk tekst voor de desktopcontrole.'));
    assert.equal(second.questions[0].type, 'open');
    assert.equal(saved.topic.examQuestions[0].answer, 2);
    const progress = await client.evaluate('(async()=>{const s=await window.academy.state();return {topic:s.progress.topics[' + JSON.stringify(ids.packageId + '/' + ids.topicId) + '],legacyQuestion:s.progress.questions[' + JSON.stringify(ids.packageId + '/' + ids.topicId + '/smoke-practice') + '],attempts:s.progress.attempts};})()');
    assert.equal(progress.topic.subtopics[partIds.first].done, true);
    assert.equal(progress.topic.subtopics[partIds.second].done, true);
    assert.equal(progress.topic.done, true);
    assert(progress.legacyQuestion.count > 0, 'Legacy question progress was lost during migration');
    assert(progress.attempts.some(attempt => attempt.correct === 1 && attempt.total === 1));
    assert.equal(saved.window.fullscreen, true, 'Restart did not start fullscreen');
    await showTopic(app, ids);
    await stop(app, true);
    console.log(JSON.stringify({
      status: 'passed', platform: process.platform,
      checks: ['real Electron startup', 'fullscreen on startup and restart', 'custom window controls',
        'isolated renderer', 'custom module and subject', 'legacy lesson migration', 'subtopic text and examples saved',
        'read-exercise-next navigation', 'open-answer self-assessment', 'final exam gating and submission',
        'part and question progress across restart', 'clean close'],
      screenshot: process.env.SCREENSHOT_PATH ? path.resolve(process.env.SCREENSHOT_PATH) : null
    }));
  } finally {
    for (const app of [...liveApps]) {
      try { await stop(app); } catch (error) { console.error('Desktop cleanup:', error.message); }
    }
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

main().catch(error => {
  console.error('Desktop smoke check failed:', error.stack || error.message);
  if (process.env.GITHUB_ACTIONS === 'true') {
    const message = String(error.stack || error.message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.error('::error::' + message);
  }
  process.exitCode = 1;
});
