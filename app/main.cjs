const { app, BrowserWindow, ipcMain, dialog, protocol, net, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { validate, safeRel, readPackage, installPackage, atomic, ID, MEDIA } = require('./core.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'academy', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true
} }]);
let win, root, packages, progressFile;
const VIDEO_EXTENSIONS = ['mp4', 'webm'];
const DOCUMENT_EXTENSIONS = ['pdf', 'txt', 'md'];
const MAX_PACKAGE_BYTES = 2 * 1024 ** 3;

function assert(condition, message) {
  if (!condition) throw Error(message);
}

function identifier(value, message = 'Ongeldig ID') {
  assert(typeof value === 'string' && ID.test(value), message);
  return value;
}

function title(value) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200,
    'Vul een naam in van maximaal 200 tekens.');
  return value.trim();
}

function packageFile(id) {
  return path.join(packages, identifier(id, 'Ongeldig pakket'), 'lespakket.json');
}

function loadPackage(id) {
  return JSON.parse(fs.readFileSync(packageFile(id), 'utf8'));
}

function listPackages() {
  return fs.readdirSync(packages, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && ID.test(entry.name))
    .map(entry => {
      try { return loadPackage(entry.name); } catch { return null; }
    }).filter(Boolean);
}

function state() {
  let progress = {};
  if (fs.existsSync(progressFile)) {
    try {
      progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      assert(progress && typeof progress === 'object' && !Array.isArray(progress), 'Ongeldige voortgang');
    }
    catch { throw Error('Voortgang kon niet worden gelezen. Je bestaande bestand blijft bewaard.'); }
  }
  const packageList = listPackages();
  const modules = [...new Map(packageList.map(pkg => [pkg.moduleId,
    { id: pkg.moduleId, title: pkg.moduleTitle }])).values()];
  return { packages: packageList, progress, modules };
}

function assertAssets(pkg) {
  const references = validate(pkg);
  const directory = path.join(packages, identifier(pkg.id));
  const realDirectory = fs.realpathSync(directory) + path.sep;
  let total = 0;
  for (const reference of references) {
    const file = path.join(directory, reference);
    assert(fs.existsSync(file) && fs.statSync(file).isFile(), 'Bestand ontbreekt: ' + reference);
    assert(fs.realpathSync(file).startsWith(realDirectory), 'Bestand buiten pakket');
    total += fs.statSync(file).size;
    assert(total <= MAX_PACKAGE_BYTES, 'Een lespakket mag maximaal 2 GB aan bestanden bevatten.');
  }
  return references;
}

function savePackage(pkg) {
  validate(pkg);
  fs.mkdirSync(path.join(packages, identifier(pkg.id)), { recursive: true });
  assertAssets(pkg);
  atomic(packageFile(pkg.id), pkg);
}

function findTopic(pkg, topicId) {
  const topic = pkg.topics.find(item => item.id === identifier(topicId, 'Ongeldig onderwerp'));
  assert(topic, 'Onderwerp ontbreekt');
  return topic;
}

function topicVideos(topic) {
  const videos = [...(topic.videos ?? [])];
  if (topic.video && !videos.some(video => video.file === topic.video)) {
    videos.unshift({ id: 'legacy-video', title: 'Uitlegvideo', file: topic.video });
  }
  return videos;
}

function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    try {
      assert(event.sender === win.webContents, 'Onbekende afzender');
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

async function confirm(message, detail, button) {
  const answer = await dialog.showMessageBox(win, {
    type: 'question', message, detail, buttons: ['Annuleren', button], defaultId: 0, cancelId: 0
  });
  return answer.response === 1;
}

function cleanProgress(packageIds) {
  const current = state();
  for (const collection of ['topics', 'questions']) {
    for (const key of Object.keys(current.progress[collection] ?? {})) {
      if (packageIds.some(id => key.startsWith(id + '/'))) delete current.progress[collection][key];
    }
  }
  if (packageIds.some(id => (current.progress.last ?? '').startsWith(id + '/'))) delete current.progress.last;
  atomic(progressFile, current.progress);
}

function copyAttachments(pkg, plans) {
  validate(pkg);
  const copied = [];
  try {
    for (const plan of plans) {
      const destination = path.join(packages, pkg.id, plan.file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(plan.source, destination);
      copied.push(destination);
    }
    savePackage(pkg);
  } catch (error) {
    for (const file of copied) fs.rmSync(file, { force: true });
    throw error;
  }
}

function selectedFile(source, extensions) {
  assert(typeof source === 'string' && fs.statSync(source).isFile(), 'Kies een bestand.');
  const extension = path.extname(source).slice(1).toLowerCase();
  assert(extensions.includes(extension), 'Bestandstype niet toegestaan');
  assert(fs.statSync(source).size <= MAX_PACKAGE_BYTES, 'Bestand is groter dan 2 GB');
  return extension;
}

function questionList(source, kind) {
  assert(fs.statSync(source).size < 5 * 1024 ** 2, 'Het vragenbestand is te groot.');
  const contents = JSON.parse(fs.readFileSync(source, 'utf8'));
  const questions = Array.isArray(contents) ? contents :
    (kind === 'exam' ? contents.examQuestions ?? contents.questions : contents.questions);
  assert(Array.isArray(questions), 'Gebruik een JSON-vragenlijst of een object met questions.');
  return questions;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  root = app.getPath('userData');
  packages = path.join(root, 'packages');
  progressFile = path.join(root, 'progress.json');
  fs.mkdirSync(packages, { recursive: true });
  if (!fs.existsSync(path.join(root, 'initialized'))) {
    installPackage(path.join(__dirname, 'demo', 'lespakket.json'), packages);
    atomic(path.join(root, 'initialized'), '1');
  }
  protocol.handle('academy', request => {
    try {
      const url = new URL(request.url);
      assert(url.host === 'media', 'Onbekende media');
      const parts = decodeURIComponent(url.pathname).slice(1).split('/');
      const id = identifier(parts.shift());
      const relative = safeRel(parts.join('/'));
      assert(MEDIA.test(relative), 'Bestandstype niet toegestaan');
      const file = path.join(packages, id, relative);
      assert(fs.realpathSync(file).startsWith(fs.realpathSync(path.join(packages, id)) + path.sep),
        'Bestand buiten pakket');
      return net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
    } catch { return new Response('Niet gevonden', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_window, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/i.test(details.url) }));
  win = new BrowserWindow({
    width: 1380, height: 920, minWidth: 940, minHeight: 650,
    frame: false, fullscreen: true, backgroundColor: '#101b18', title: 'Makelaar Academie',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());

  handle('state', state);
  handle('windowControl', action => {
    assert(['state', 'minimize', 'toggleFullscreen', 'close'].includes(action), 'Onbekende vensteractie');
    if (action === 'minimize') win.minimize();
    let fullscreen = win.isFullScreen();
    if (action === 'toggleFullscreen') {
      fullscreen = !fullscreen;
      win.setFullScreen(fullscreen);
    }
    const maximized = win.isMaximized?.() ?? false;
    if (action === 'close') win.close();
    return { fullscreen, maximized };
  });
  handle('save', progress => {
    assert(progress && typeof progress === 'object' && !Array.isArray(progress) && JSON.stringify(progress).length <= 20e6,
      'Ongeldige voortgang');
    atomic(progressFile, progress);
    return true;
  });
  handle('newModule', data => {
    const name = title(data?.title);
    const id = 'module-' + crypto.randomUUID();
    savePackage({ format: 'makelaar-lespakket', schemaVersion: 1, id,
      moduleId: id, moduleTitle: name, title: name, topics: [] });
    return state();
  });
  handle('renameModule', data => {
    const moduleId = identifier(data?.moduleId, 'Ongeldige module');
    const name = title(data?.title);
    const members = listPackages().filter(pkg => pkg.moduleId === moduleId);
    assert(members.length, 'Module ontbreekt');
    const originals = members.map(pkg => ({ file: packageFile(pkg.id), content: fs.readFileSync(packageFile(pkg.id), 'utf8') }));
    for (const pkg of members) {
      if (pkg.title === pkg.moduleTitle) pkg.title = name;
      pkg.moduleTitle = name;
      assertAssets(pkg);
    }
    try { for (const pkg of members) atomic(packageFile(pkg.id), pkg); }
    catch (error) { for (const original of originals) atomic(original.file, original.content); throw error; }
    return state();
  });
  handle('deleteModule', async moduleId => {
    identifier(moduleId, 'Ongeldige module');
    const members = listPackages().filter(pkg => pkg.moduleId === moduleId);
    assert(members.length, 'Module ontbreekt');
    if (!await confirm('Module verwijderen?', 'Alle onderwerpen en bestanden in deze module worden verwijderd. Maak eerst een back-up als je ze wilt bewaren. Toetsgeschiedenis blijft bewaard.', 'Verwijderen')) return null;
    for (const pkg of members) fs.rmSync(path.join(packages, pkg.id), { recursive: true, force: true });
    cleanProgress(members.map(pkg => pkg.id));
    return state();
  });
  handle('newTopic', data => {
    assert(data && typeof data === 'object', 'Onderwerp ontbreekt');
    const name = title(data.title);
    let pkg;
    if (data.packageId) {
      pkg = loadPackage(data.packageId);
      if (data.moduleId) assert(pkg.moduleId === data.moduleId, 'Dit pakket hoort bij een andere module');
    } else {
      const moduleId = identifier(data.moduleId, 'Kies een module');
      pkg = listPackages().find(item => item.moduleId === moduleId);
      // Compatibility for callers of the v0.1 API, without prescribing module names.
      if (!pkg) {
        const moduleTitle = title(data.moduleTitle ?? moduleId);
        pkg = { format: 'makelaar-lespakket', schemaVersion: 1, id: 'eigen-' + crypto.randomUUID(),
          moduleId, moduleTitle, title: moduleTitle, topics: [] };
      }
    }
    pkg.topics.push({ id: 'onderwerp-' + crypto.randomUUID(), title: name, summary: '', questions: [], examQuestions: [] });
    savePackage(pkg);
    return state();
  });
  handle('updateTopic', data => {
    assert(data && typeof data === 'object', 'Onderwerp ontbreekt');
    const pkg = loadPackage(data.packageId);
    const topic = findTopic(pkg, data.topicId);
    if (Object.hasOwn(data, 'title')) topic.title = title(data.title);
    for (const field of ['summary', 'assignmentText', 'questions', 'examQuestions']) {
      if (Object.hasOwn(data, field)) topic[field] = data[field];
    }
    if (Object.hasOwn(data, 'summary')) delete topic.pdf;
    savePackage(pkg);
    return state();
  });
  handle('import', async () => {
    const selection = await dialog.showOpenDialog(win, {
      title: 'Lespakket toevoegen', filters: [{ name: 'Lespakket', extensions: ['zip', 'lespakket', 'json'] }], properties: ['openFile']
    });
    if (selection.canceled) return null;
    const source = selection.filePaths[0];
    const { p: pkg } = readPackage(source);
    if (fs.existsSync(packageFile(pkg.id)) && !await confirm('Dit lespakket bestaat al. Vervangen?',
      'De inhoud wordt vervangen. Voortgang blijft bewaard. Maak bij grote wijzigingen eerst een back-up.', 'Vervangen')) return null;
    installPackage(source, packages);
    return state();
  });
  handle('attach', async data => {
    assert(data && ['summary', 'video', 'assignment', 'practice', 'exam', 'overviewVideo'].includes(data.kind), 'Ongeldige selectie');
    const { kind } = data;
    const pkg = loadPackage(data.packageId);
    const topic = kind === 'overviewVideo' ? null : findTopic(pkg, data.topicId);
    const extensions = ['video', 'overviewVideo'].includes(kind) ? VIDEO_EXTENSIONS :
      kind === 'practice' ? ['json'] : kind === 'exam' ? ['json', ...DOCUMENT_EXTENSIONS] : DOCUMENT_EXTENSIONS;
    const titles = { summary: 'Samenvatting uploaden', video: 'Video’s toevoegen', overviewVideo: 'Overzichtsfilm uploaden',
      assignment: 'Opdrachten uploaden', practice: 'Oefenvragen importeren', exam: 'Oefentoets uploaden' };
    const multiple = ['video', 'assignment'].includes(kind);
    const selection = await dialog.showOpenDialog(win, {
      title: titles[kind], filters: [{ name: titles[kind], extensions }],
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile']
    });
    if (selection.canceled) return null;
    const sources = selection.filePaths;
    assert(Array.isArray(sources) && sources.length > 0 && sources.length <= 50 && (multiple || sources.length === 1),
      'Kies maximaal 50 bestanden tegelijk.');
    const plans = [];
    for (const source of sources) {
      const extension = selectedFile(source, extensions);
      if (extension === 'json') {
        const field = kind === 'exam' ? 'examQuestions' : 'questions';
        const replacement = questionList(source, kind);
        const previous = topic[field] ?? [];
        topic[field] = replacement;
        assertAssets(pkg);
        if (previous.length && !await confirm('Bestaande vragen vervangen?',
          'Deze vragenlijst vervangt de huidige vragen in dit onderdeel. Toetsgeschiedenis blijft bewaard.', 'Vervangen')) return null;
      } else if (kind === 'summary' && ['txt', 'md'].includes(extension)) {
        assert(fs.statSync(source).size <= 200000, 'Tekstbestand te groot (maximaal 200.000 bytes).');
        topic.summary = fs.readFileSync(source, 'utf8');
        delete topic.pdf;
      } else {
        const file = 'assets/' + crypto.randomUUID() + '.' + extension;
        plans.push({ source, file });
        const attachment = { id: 'bestand-' + crypto.randomUUID(), title: path.basename(source), file };
        if (kind === 'video') {
          topic.videos = topicVideos(topic);
          topic.videos.push(attachment);
          topic.video ??= file;
        } else if (kind === 'overviewVideo') pkg.overviewVideo = file;
        else if (kind === 'summary') topic.pdf = file;
        else {
          const field = kind === 'exam' ? 'examFiles' : 'assignments';
          (topic[field] ??= []).push(attachment);
        }
      }
    }
    copyAttachments(pkg, plans);
    return state();
  });
  handle('removeAttachment', data => {
    assert(data && ['video', 'assignment', 'exam'].includes(data.kind), 'Ongeldige selectie');
    const pkg = loadPackage(data.packageId);
    const topic = findTopic(pkg, data.topicId);
    const field = data.kind === 'video' ? 'videos' : data.kind === 'exam' ? 'examFiles' : 'assignments';
    const items = data.kind === 'video' ? topicVideos(topic) : topic[field] ?? [];
    const item = items.find(attachment => attachment.id === identifier(data.id, 'Ongeldige bijlage'));
    assert(item, 'Bijlage ontbreekt');
    if (data.kind === 'video') {
      const primaryFile = topic.video ?? topicVideos(topic)[0]?.file;
      const questions = [...(topic.questions ?? []), ...(topic.examQuestions ?? []),
        ...(pkg.finalQuestions ?? []).filter(question => question.topicId === topic.id || (!question.topicId && topic === pkg.topics[0]))];
      assert(!questions.some(question => question.clip && (question.clip.videoId === item.id ||
        (!question.clip.videoId && item.file === primaryFile))),
      'Deze video wordt gebruikt door hulpfragmenten. Pas die vragen eerst aan.');
    }
    topic[field] = items.filter(attachment => attachment.id !== item.id);
    if (data.kind === 'video' && topic.video === item.file) {
      if (topic.videos.length) topic.video = topic.videos[0].file;
      else delete topic.video;
    }
    savePackage(pkg);
    if (!validate(pkg).includes(item.file)) fs.rmSync(path.join(packages, pkg.id, item.file), { force: true });
    return state();
  });
  handle('deletePackage', async id => {
    loadPackage(id);
    if (!await confirm('Dit lespakket verwijderen?',
      'De lessen en media van dit pakket worden verwijderd. Maak eerst een back-up als je ze wilt bewaren. Toetsgeschiedenis blijft bewaard.', 'Verwijderen')) return null;
    fs.rmSync(path.join(packages, id), { recursive: true, force: true });
    cleanProgress([id]);
    return state();
  });
  handle('exportPackage', async id => {
    const pkg = loadPackage(id);
    assertAssets(pkg);
    const selection = await dialog.showSaveDialog(win, {
      defaultPath: id + '.lespakket', filters: [{ name: 'Lespakket', extensions: ['lespakket'] }]
    });
    if (selection.canceled) return null;
    const zip = new AdmZip();
    zip.addLocalFolder(path.join(packages, id));
    zip.writeZip(selection.filePath);
    return true;
  });
  handle('backup', async () => {
    const selection = await dialog.showSaveDialog(win, {
      defaultPath: 'Makelaar-backup-' + new Date().toISOString().slice(0, 10) + '.zip',
      filters: [{ name: 'Back-up', extensions: ['zip'] }]
    });
    if (selection.canceled) return null;
    const zip = new AdmZip();
    zip.addFile('backup.json', Buffer.from(JSON.stringify({ format: 'makelaar-backup', version: 1 })));
    if (fs.existsSync(progressFile)) zip.addLocalFile(progressFile);
    zip.addFile('packages/', Buffer.alloc(0));
    zip.addLocalFolder(packages, 'packages');
    zip.writeZip(selection.filePath);
    return true;
  });
  handle('restore', async () => {
    const selection = await dialog.showOpenDialog(win, {
      filters: [{ name: 'Back-up', extensions: ['zip'] }], properties: ['openFile']
    });
    if (selection.canceled) return null;
    const zip = new AdmZip(selection.filePaths[0]);
    const entries = zip.getEntries();
    assert(entries.length <= 50000, 'Te veel bestanden in de back-up');
    let total = 0;
    const names = new Set();
    for (const entry of entries) {
      safeRel(entry.entryName.replace(/\/$/, ''));
      assert(!names.has(entry.entryName), 'Dubbele bestanden in de back-up');
      names.add(entry.entryName);
      total += entry.header.size;
      assert(total <= 4 * 1024 ** 3, 'Back-up te groot');
      assert((entry.header.attr >>> 16 & 0xf000) !== 0xa000, 'Symbolische links zijn niet toegestaan');
    }
    const metadata = JSON.parse(zip.readAsText('backup.json'));
    assert(metadata.format === 'makelaar-backup' && metadata.version === 1, 'Ongeldige back-up');
    const progressText = zip.readAsText('progress.json') || '{}';
    assert(progressText.length <= 20e6, 'Voortgangbestand te groot');
    const progress = JSON.parse(progressText);
    assert(progress && typeof progress === 'object' && !Array.isArray(progress), 'Ongeldige voortgang');
    const stage = path.join(root, 'restore-' + crypto.randomUUID());
    const stagedPackages = path.join(stage, 'packages');
    fs.mkdirSync(stagedPackages, { recursive: true });
    try {
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const parts = entry.entryName.split('/');
        if (parts[0] !== 'packages' || parts.length < 3) continue;
        identifier(parts[1], 'Ongeldig pakket in back-up');
        if (!(parts.length === 3 && parts[2] === 'lespakket.json') && !MEDIA.test(entry.entryName)) continue;
        const destination = path.join(stage, entry.entryName);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, entry.getData());
      }
      for (const id of fs.readdirSync(stagedPackages)) {
        identifier(id, 'Ongeldig pakket in back-up');
        const { p: pkg } = readPackage(path.join(stagedPackages, id, 'lespakket.json'));
        assert(pkg.id === id, 'Pakket-ID komt niet overeen met de back-upmap');
      }
      if (!await confirm('Back-up terugzetten?',
        'Alle huidige lessen en voortgang worden vervangen. De huidige gegevens blijven als herstelkopie op deze pc bewaard.', 'Terugzetten')) return null;
      const previous = path.join(root, 'voor-herstel-' + crypto.randomUUID());
      fs.mkdirSync(previous);
      fs.renameSync(packages, path.join(previous, 'packages'));
      if (fs.existsSync(progressFile)) fs.copyFileSync(progressFile, path.join(previous, 'progress.json'));
      try {
        fs.renameSync(stagedPackages, packages);
        atomic(progressFile, progress);
      } catch (error) {
        fs.rmSync(packages, { recursive: true, force: true });
        fs.renameSync(path.join(previous, 'packages'), packages);
        if (fs.existsSync(path.join(previous, 'progress.json'))) fs.copyFileSync(path.join(previous, 'progress.json'), progressFile);
        else fs.rmSync(progressFile, { force: true });
        throw error;
      }
      return state();
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  });
  handle('prompt', () => fs.readFileSync(path.join(__dirname, 'MAAK-EEN-LESPAKKET.md'), 'utf8'));
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
