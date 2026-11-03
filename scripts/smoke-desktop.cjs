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

async function showTopic(app, ids) {
  const client = app.devtools;
  const moduleSelector = '[data-action="module"][data-id="' + ids.moduleId + '"]';
  const topicSelector = '[data-action="topic"][data-p="' + ids.packageId + '"][data-t="' + ids.topicId + '"]';
  await eventually(() => client.evaluate('Boolean(document.querySelector(' + JSON.stringify(moduleSelector) + '))'),
    'Saved module in the sidebar');
  await client.evaluate('document.querySelector(' + JSON.stringify(moduleSelector) + ').click()');
  await eventually(() => client.evaluate('Boolean(document.querySelector(' + JSON.stringify(topicSelector) + '))'),
    'Saved subject in the module');
  await client.evaluate('document.querySelector(' + JSON.stringify(topicSelector) + ').click()');
  await eventually(() => client.evaluate('document.querySelector("#main")?.textContent.includes("Een eigen samenvatting voor de desktopcontrole.")'),
    'Saved summary in the lesson');
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
    const tabs = await client.evaluate('[...document.querySelectorAll("[data-action=tab]")].map(button=>button.dataset.tab)');
    assert.deepEqual(tabs, ['summary', 'video', 'practice', 'exam']);
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
    assert(saved.topic.summary.includes('Een eigen samenvatting voor de desktopcontrole.'));
    assert.equal(saved.topic.assignmentText, 'Beschrijf in je eigen woorden wat je hebt geleerd.');
    assert.equal(saved.topic.questions[0].answer, 0);
    assert.equal(saved.topic.examQuestions[0].answer, 2);
    assert.equal(saved.window.fullscreen, true, 'Restart did not start fullscreen');
    await showTopic(app, ids);
    await stop(app, true);
    console.log(JSON.stringify({
      status: 'passed', platform: process.platform,
      checks: ['real Electron startup', 'fullscreen on startup and restart', 'custom window controls',
        'isolated renderer', 'custom module and subject', 'summary and questions saved',
        'lesson navigation', 'persistence across restart', 'clean close'],
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
