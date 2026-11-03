const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const AdmZip = require('adm-zip');
const { readPackage } = require('../app/core.cjs');

const demoDirectory = path.join(__dirname, '../app/demo');
const demoVideo = path.join(demoDirectory, 'assets/demo.mp4');
const choice = (id = 'keuze-1') => ({ id, type: 'choice', prompt: 'Wat klopt?', options: ['A', 'B'], answer: 1,
  explanation: 'B is juist.' });

async function desktop(t, reuseRoot) {
  const root = reuseRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'academy-desktop-'));
  if (!reuseRoot) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const handlers = new Map();
  const protocols = new Map();
  let window;
  let openFiles = [];
  let savePath;
  let answer = 1;
  let canceled = false;
  let openOptions;
  class BrowserWindow {
    constructor(options) {
      window = this;
      this.options = options;
      this.fullscreen = options.fullscreen;
      this.webContents = { setWindowOpenHandler() {}, on() {} };
    }
    setMenuBarVisibility() {}
    loadFile() {}
    isMinimized() { return !!this.minimized; }
    minimize() { this.minimized = true; }
    restore() { this.minimized = false; }
    focus() {}
    isFullScreen() { return this.fullscreen; }
    setFullScreen(value) { this.fullscreen = value; }
    isMaximized() { return false; }
    close() { this.closed = true; }
  }
  const electron = {
    app: {
      requestSingleInstanceLock: () => true, hasSingleInstanceLock: () => true,
      on() {}, quit() {}, whenReady: () => Promise.resolve(), getPath: () => root
    },
    BrowserWindow,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    protocol: { registerSchemesAsPrivileged() {}, handle: (name, fn) => protocols.set(name, fn) },
    session: { defaultSession: { setPermissionRequestHandler() {}, webRequest: { onBeforeRequest() {} } } },
    net: { fetch: async () => {} },
    dialog: {
      showOpenDialog: async (_win, options) => { openOptions = options; return { canceled, filePaths: openFiles }; },
      showSaveDialog: async () => ({ canceled, filePath: savePath }),
      showMessageBox: async () => ({ response: answer })
    }
  };
  const file = path.join(__dirname, '../app/main.cjs');
  const requireFromMain = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => name === 'electron' ? electron : requireFromMain(name),
    __dirname: path.dirname(file), Response, URL, console, Buffer
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  const raw = (name, args = [], sender = window.webContents) => handlers.get(name)({ sender }, ...args);
  const invoke = async (name, ...args) => {
    const result = await raw(name, args);
    assert.equal(result.ok, true, result.error);
    return result.data === undefined ? undefined : JSON.parse(JSON.stringify(result.data));
  };
  return {
    root, window, invoke, raw, protocols,
    open: (...files) => { openFiles = files; },
    save: file => { savePath = file; },
    answer: value => { answer = value; },
    cancel: value => { canceled = value; },
    openOptions: () => openOptions,
    manifest: id => path.join(root, 'packages', id, 'lespakket.json'),
    write: (name, contents) => {
      const destination = path.join(root, name);
      fs.writeFileSync(destination, contents);
      return destination;
    }
  };
}

function customModule(state) {
  return state.packages.find(pkg => pkg.id.startsWith('module-'));
}

async function moduleAndTopic(h, moduleTitle = 'Mijn eigen module') {
  let current = await h.invoke('newModule', { title: moduleTitle });
  let pkg = customModule(current);
  current = await h.invoke('newTopic', { moduleId: pkg.moduleId, title: 'Mijn onderwerp' });
  pkg = current.packages.find(item => item.id === pkg.id);
  return { pkg, topic: pkg.topics[0] };
}

test('Desktop starts fullscreen without a native frame and restricts window controls to its own renderer', async t => {
  const h = await desktop(t);
  assert.equal(h.window.options.frame, false);
  assert.equal(h.window.options.fullscreen, true);
  assert.equal(h.window.options.webPreferences.sandbox, true);
  assert.equal(h.window.options.webPreferences.contextIsolation, true);
  assert.equal(h.window.options.webPreferences.nodeIntegration, false);
  assert.equal((await h.invoke('windowControl', 'state')).fullscreen, true);
  assert.equal((await h.invoke('windowControl', 'toggleFullscreen')).fullscreen, false);
  await h.invoke('windowControl', 'minimize');
  assert.equal(h.window.minimized, true);
  assert.equal((await h.raw('windowControl', ['close'], {})).ok, false);
  assert.equal(h.window.closed, undefined);
  assert.equal((await h.raw('windowControl', ['unsupported'])).ok, false);
  await h.invoke('windowControl', 'close');
  assert.equal(h.window.closed, true);
});

test('Custom modules stay empty until topics are added; names and IDs survive restart, export and import', async t => {
  const h = await desktop(t);
  let current = await h.invoke('newModule', { title: '  Privaatrecht & eigendom  ' });
  let pkg = customModule(current);
  assert.equal(pkg.moduleTitle, 'Privaatrecht & eigendom');
  assert.equal(pkg.topics.length, 0);
  assert(current.modules.some(module => module.id === pkg.moduleId && module.title === pkg.moduleTitle));
  assert(!current.modules.some(module => module.id === 'bt2'));
  current = await h.invoke('renameModule', { moduleId: pkg.moduleId, title: 'Mijn rechtmodule' });
  assert.equal(current.packages.find(item => item.id === pkg.id).title, 'Mijn rechtmodule');
  const restarted = await desktop(t, h.root);
  assert((await restarted.invoke('state')).modules.some(module => module.title === 'Mijn rechtmodule'));
  const exported = path.join(h.root, 'empty-module.lespakket');
  h.save(exported);
  await h.invoke('exportPackage', pkg.id);
  assert.equal(readPackage(exported).p.topics.length, 0);
  await h.invoke('deleteModule', pkg.moduleId);
  h.open(exported);
  current = await h.invoke('import');
  assert.equal(current.packages.find(item => item.id === pkg.id).moduleId, pkg.moduleId);
  assert.equal((await h.raw('newModule', [{ title: '   ' }])).ok, false);
  assert.equal((await h.raw('newTopic', [{ moduleId: '../bad', title: 'X' }])).ok, false);
  assert.equal((await h.raw('newTopic', [{ moduleId: 'bt2', title: '' }])).ok, false);
});

test('Topics accept authored content, multiple videos, assignment documents and exam files; backup and export retain every asset', async t => {
  const h = await desktop(t);
  let { pkg, topic } = await moduleAndTopic(h);
  const target = { packageId: pkg.id, topicId: topic.id };
  let current = await h.invoke('updateTopic', { ...target, title: 'Overeenkomsten', summary: '# Kern\n\nMijn tekst.',
    assignmentText: 'Lees de casus en leg je antwoord uit.', questions: [choice()] });
  assert.equal(current.packages.find(item => item.id === pkg.id).topics[0].title, 'Overeenkomsten');
  h.open(demoVideo, demoVideo);
  current = await h.invoke('attach', { ...target, kind: 'video' });
  assert(h.openOptions().properties.includes('multiSelections'));
  topic = current.packages.find(item => item.id === pkg.id).topics[0];
  assert.equal(topic.videos.length, 2);
  assert.notEqual(topic.videos[0].id, topic.videos[1].id);
  assert.equal(topic.video, topic.videos[0].file);
  const document = h.write('opdracht.pdf', '%PDF-1.4\nTestdocument');
  const text = h.write('casus.md', '# Opdracht\n\nWerk de casus uit.');
  h.open(document, text);
  await h.invoke('attach', { ...target, kind: 'assignment' });
  h.open(document);
  await h.invoke('attach', { ...target, kind: 'exam' });
  const exam = h.write('toets.json', JSON.stringify({ questions: [choice('toets-1')] }));
  h.open(exam);
  current = await h.invoke('attach', { ...target, kind: 'exam' });
  pkg = current.packages.find(item => item.id === pkg.id);
  topic = pkg.topics[0];
  assert.equal(topic.assignments.length, 2);
  assert.equal(topic.examFiles.length, 1);
  assert.equal(topic.examQuestions[0].id, 'toets-1');
  assert.equal(topic.assignmentText, 'Lees de casus en leg je antwoord uit.');
  const exported = path.join(h.root, 'complete.lespakket');
  h.save(exported);
  await h.invoke('exportPackage', pkg.id);
  const packaged = readPackage(exported);
  assert.equal(packaged.assets.size, 5);
  assert.equal(packaged.assets.get(topic.assignments[1].file)().toString(), '# Opdracht\n\nWerk de casus uit.');
  await h.invoke('save', { topics: {}, questions: {}, attempts: [], custom: 'bewaard' });
  const backup = path.join(h.root, 'all.zip');
  h.save(backup);
  await h.invoke('backup');
  await h.invoke('deleteModule', pkg.moduleId);
  await h.invoke('save', { custom: 'gewijzigd' });
  h.open(backup);
  current = await h.invoke('restore');
  assert.equal(current.progress.custom, 'bewaard');
  pkg = current.packages.find(item => item.id === pkg.id);
  assert.equal(pkg.topics[0].videos.length, 2);
  assert.equal(pkg.topics[0].examFiles.length, 1);
  for (const file of packaged.assets.keys()) assert(fs.existsSync(path.join(h.root, 'packages', pkg.id, file)));
  const removedVideo = pkg.topics[0].videos[1];
  await h.invoke('removeAttachment', { ...target, kind: 'video', id: removedVideo.id });
  assert(!fs.existsSync(path.join(h.root, 'packages', pkg.id, removedVideo.file)));
  current = await h.invoke('removeAttachment', { ...target, kind: 'assignment', id: topic.assignments[0].id });
  assert.equal(current.packages.find(item => item.id === pkg.id).topics[0].assignments.length, 1);
});

test('Invalid edits and canceled replacements leave the stored topic and existing files untouched', async t => {
  const h = await desktop(t);
  const { pkg, topic } = await moduleAndTopic(h);
  const target = { packageId: pkg.id, topicId: topic.id };
  await h.invoke('updateTopic', { ...target, questions: [choice()] });
  const original = fs.readFileSync(h.manifest(pkg.id), 'utf8');
  assert.equal((await h.raw('updateTopic', [{ ...target, questions: [{ ...choice(), answer: 99 }] }])).ok, false);
  assert.equal((await h.raw('updateTopic', [{ ...target, questions: [{ ...choice(), image: 'assets/missing.png' }] }])).ok, false);
  assert.equal((await h.raw('updateTopic', [{ ...target, title: ' ' }])).ok, false);
  h.open(h.write('bad-questions.json', JSON.stringify({ questions: [{ ...choice(), type: 'unknown' }] })));
  assert.equal((await h.raw('attach', [{ ...target, kind: 'practice' }])).ok, false);
  h.open(h.write('valid-questions.json', JSON.stringify([choice('replacement')])));
  h.answer(0);
  assert.equal(await h.invoke('attach', { ...target, kind: 'practice' }), null);
  h.answer(1);
  h.open(demoVideo, h.write('bad-video.html', '<script>bad()</script>'));
  assert.equal((await h.raw('attach', [{ ...target, kind: 'video' }])).ok, false);
  assert.equal(fs.readFileSync(h.manifest(pkg.id), 'utf8'), original);
  assert(!fs.existsSync(path.join(h.root, 'packages', pkg.id, 'assets')));
  h.cancel(true);
  assert.equal(await h.invoke('attach', { ...target, kind: 'summary' }), null);
  assert.equal(fs.readFileSync(h.manifest(pkg.id), 'utf8'), original);
});

test('Legacy lessons, help clips and progress retain their IDs through module rename and media additions', async t => {
  const h = await desktop(t);
  const initial = await h.invoke('state');
  const pkg = initial.packages[0];
  const topic = pkg.topics[0];
  const target = { packageId: pkg.id, topicId: topic.id };
  const key = pkg.id + '/' + topic.id;
  await h.invoke('save', { last: key, topics: { [key]: { done: true } }, questions: {}, attempts: [{ title: 'Oude toets' }] });
  let current = await h.invoke('renameModule', { moduleId: pkg.moduleId, title: 'Mijn hernoemde module' });
  assert.equal(current.progress.last, key);
  assert.equal(current.progress.topics[key].done, true);
  assert.equal(current.packages[0].topics[0].questions[0].id, topic.questions[0].id);
  h.open(demoVideo);
  current = await h.invoke('attach', { ...target, kind: 'video' });
  const videos = current.packages[0].topics[0].videos;
  assert.equal(videos[0].file, topic.video);
  assert.equal(videos[0].id, 'legacy-video');
  const rejected = await h.raw('removeAttachment', [{ ...target, kind: 'video', id: 'legacy-video' }]);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /hulpfragmenten/);
  const summary = h.write('samenvatting.md', '# Nieuwe samenvatting');
  h.open(summary);
  current = await h.invoke('attach', { ...target, kind: 'summary' });
  assert.match(current.packages[0].topics[0].summary, /Nieuwe samenvatting/);
  assert.match(await h.invoke('prompt'), /Leer- en videobriefing/);
});

test('Module deletion removes all member packages only after confirmation and keeps exam history', async t => {
  const h = await desktop(t);
  const initial = await h.invoke('state');
  const pkg = initial.packages[0];
  const extra = JSON.parse(fs.readFileSync(path.join(demoDirectory, 'lespakket.json'), 'utf8'));
  extra.id = 'extra-pakket';
  const imported = new AdmZip();
  imported.addLocalFolder(demoDirectory);
  imported.updateFile('lespakket.json', Buffer.from(JSON.stringify(extra)));
  const source = path.join(h.root, 'extra.lespakket');
  imported.writeZip(source);
  h.open(source);
  await h.invoke('import');
  await h.invoke('save', { topics: { 'start-demo/les': { done: true }, 'extra-pakket/les': { done: true } },
    questions: { 'extra-pakket/les/vraag': { correct: true } }, last: 'extra-pakket/les', attempts: [{ title: 'Behoud mij' }] });
  h.answer(0);
  assert.equal(await h.invoke('deleteModule', pkg.moduleId), null);
  assert.equal((await h.invoke('state')).packages.length, 2);
  h.answer(1);
  const current = await h.invoke('deleteModule', pkg.moduleId);
  assert.equal(current.packages.length, 0);
  assert.equal(current.modules.length, 0);
  assert.deepEqual(current.progress.topics, {});
  assert.deepEqual(current.progress.questions, {});
  assert.equal(current.progress.last, undefined);
  assert.equal(current.progress.attempts[0].title, 'Behoud mij');
});

test('Empty workspaces and empty modules can be backed up and restored without reseeding the demo', async t => {
  const h = await desktop(t);
  await h.invoke('deleteModule', (await h.invoke('state')).packages[0].moduleId);
  const backup = path.join(h.root, 'empty.zip');
  h.save(backup);
  await h.invoke('backup');
  await h.invoke('newModule', { title: 'Tijdelijk' });
  h.open(backup);
  assert.equal((await h.invoke('restore')).packages.length, 0);
  assert.equal((await (await desktop(t, h.root)).invoke('state')).packages.length, 0);
  await h.invoke('newModule', { title: 'Lege module' });
  h.save(backup);
  await h.invoke('backup');
  await h.invoke('deleteModule', (await h.invoke('state')).modules[0].id);
  h.open(backup);
  const restored = await h.invoke('restore');
  assert.equal(restored.modules[0].title, 'Lege module');
  assert.equal(restored.packages[0].topics.length, 0);
});

test('Invalid backup references and traversal paths cannot replace the current library', async t => {
  const h = await desktop(t);
  const original = fs.readFileSync(h.manifest('start-demo'), 'utf8');
  const broken = new AdmZip();
  broken.addFile('backup.json', Buffer.from(JSON.stringify({ format: 'makelaar-backup', version: 1 })));
  broken.addFile('packages/start-demo/lespakket.json', Buffer.from(original));
  const source = path.join(h.root, 'broken.zip');
  broken.writeZip(source);
  h.open(source);
  assert.equal((await h.raw('restore')).ok, false);
  assert.equal(fs.readFileSync(h.manifest('start-demo'), 'utf8'), original);
  const request = new Request('academy://media/start-demo/%2e%2e%2fprogress.json');
  const response = await h.protocols.get('academy')(request);
  assert.equal(response.status, 404);
});

test('Malformed saved progress is reported without overwriting the existing data', async t => {
  const h = await desktop(t);
  for (const contents of ['null', '[]', '{invalid']) {
    h.write('progress.json', contents);
    const result = await h.raw('state');
    assert.equal(result.ok, false);
    assert.match(result.error, /Voortgang kon niet worden gelezen/);
    assert.equal(fs.readFileSync(path.join(h.root, 'progress.json'), 'utf8'), contents);
  }
});

test('Videos-only imports protect the first video used by implicit clips while unrelated videos can be removed', async t => {
  const h = await desktop(t);
  const clip = { start: 0, end: 2 };
  const pkg = {
    format: 'makelaar-lespakket', schemaVersion: 1, id: 'videos-only', moduleId: 'videos-only',
    moduleTitle: 'Geïmporteerde videomodule', title: 'Videolessen', finalQuestions: [],
    topics: [{ id: 'onderwerp', title: 'Onderwerp met twee video’s', summary: '',
      videos: [
        { id: 'eerste', title: 'Eerste video', file: 'assets/eerste.mp4' },
        { id: 'tweede', title: 'Tweede video', file: 'assets/tweede.mp4' }
      ], questions: [{ ...choice('impliciet-fragment'), clip }], examQuestions: [] }]
  };
  const archive = new AdmZip();
  archive.addFile('lespakket.json', Buffer.from(JSON.stringify(pkg)));
  archive.addLocalFile(demoVideo, 'assets', 'eerste.mp4');
  archive.addLocalFile(demoVideo, 'assets', 'tweede.mp4');
  const source = path.join(h.root, 'videos-only.lespakket');
  archive.writeZip(source);
  h.open(source);
  await h.invoke('import');
  const target = { packageId: pkg.id, topicId: 'onderwerp', kind: 'video' };
  const manifest = fs.readFileSync(h.manifest(pkg.id), 'utf8');
  const primaryFile = path.join(h.root, 'packages', pkg.id, 'assets/eerste.mp4');
  const primaryBytes = fs.readFileSync(primaryFile);
  const rejected = await h.raw('removeAttachment', [{ ...target, id: 'eerste' }]);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /hulpfragmenten/);
  assert.equal(fs.readFileSync(h.manifest(pkg.id), 'utf8'), manifest);
  assert.deepEqual(fs.readFileSync(primaryFile), primaryBytes);
  const current = await h.invoke('removeAttachment', { ...target, id: 'tweede' });
  const topic = current.packages.find(item => item.id === pkg.id).topics[0];
  assert.equal(topic.videos.length, 1);
  assert.equal(topic.videos[0].file, 'assets/eerste.mp4');
  assert.equal(topic.video, undefined);
  assert.deepEqual(topic.questions[0].clip, clip);
  assert.deepEqual(fs.readFileSync(primaryFile), primaryBytes);
  assert(!fs.existsSync(path.join(h.root, 'packages', pkg.id, 'assets/tweede.mp4')));
});

test('Subtopics are created, ordered and edited independently; examples and progress survive export and backup', async t => {
  const h = await desktop(t);
  let { pkg, topic } = await moduleAndTopic(h);
  const target = { packageId: pkg.id, topicId: topic.id };
  assert.deepEqual(topic.subtopics, []);
  let current = await h.invoke('newSubtopic', { ...target, title: 'Eerste stap' });
  topic = current.packages.find(p => p.id === pkg.id).topics[0];
  const first = topic.subtopics[0];
  current = await h.invoke('newSubtopic', { ...target, title: 'Tweede stap' });
  topic = current.packages.find(p => p.id === pkg.id).topics[0];
  const second = topic.subtopics[1];
  const one = { ...target, subtopicId: first.id };
  const two = { ...target, subtopicId: second.id };
  await h.invoke('updateSubtopic', { ...one, summary: '# Stap een\n\nEerste tekst.', assignmentText: 'Werk uit.', questions: [choice('deelvraag-1')] });
  await h.invoke('updateSubtopic', { ...two, summary: 'Tweede tekst.', questions: [choice('deelvraag-2')] });
  await h.invoke('updateTopic', { ...target, examQuestions: [choice('onderwerp-eindtoets')] });
  h.open(path.join(demoDirectory, 'assets/vormen.png'));
  current = await h.invoke('attach', { ...one, kind: 'example', title: 'Vormvoorbeeld', caption: 'Let op de vorm.', source: 'Eigen demonstratieschema.' });
  pkg = current.packages.find(p => p.id === pkg.id);
  let example = pkg.topics[0].subtopics[0].examples[0];
  assert.equal(example.caption, 'Let op de vorm.');
  assert.equal(example.source, 'Eigen demonstratieschema.');
  assert(h.openOptions().filters[0].extensions.includes('png'));
  await h.invoke('updateSubtopic', { ...two, examples: [{ ...example, id: 'gedeeld-voorbeeld' }] });
  const key = pkg.id + '/' + topic.id;
  const progress = { topics: { [key]: { done: true, subtopics: { [first.id]: { read: true, done: true }, [second.id]: { read: true } } } },
    questions: { [key + '/deelvraag-1']: { correct: true }, [key + '/deelvraag-2']: { correct: true } }, attempts: [{ title: 'Behoud toets' }] };
  await h.invoke('save', progress);
  current = await h.invoke('moveSubtopic', { ...two, direction: 'up' });
  assert.equal(current.packages.find(p => p.id === pkg.id).topics[0].subtopics[0].id, second.id);
  assert.equal(current.progress.topics[key].subtopics[first.id].done, true);
  const exported = path.join(h.root, 'subtopics.lespakket');
  h.save(exported); await h.invoke('exportPackage', pkg.id);
  const packaged = readPackage(exported);
  assert.equal(packaged.p.topics[0].subtopics.length, 2);
  assert(packaged.assets.has(example.file));
  const backup = path.join(h.root, 'subtopics-backup.zip');
  h.save(backup); await h.invoke('backup');
  h.answer(0);
  assert.equal(await h.invoke('deleteSubtopic', one), null);
  h.answer(1);
  current = await h.invoke('deleteSubtopic', one);
  topic = current.packages.find(p => p.id === pkg.id).topics[0];
  assert.equal(topic.subtopics.length, 1);
  assert.equal(topic.subtopics[0].id, second.id);
  assert.equal(topic.examQuestions[0].id, 'onderwerp-eindtoets');
  assert.equal(current.progress.topics[key].done, true);
  assert.equal(current.progress.topics[key].subtopics[first.id], undefined);
  assert.equal(current.progress.topics[key].subtopics[second.id].read, true);
  assert.equal(current.progress.questions[key + '/deelvraag-1'], undefined);
  assert.equal(current.progress.questions[key + '/deelvraag-2'].correct, true);
  assert.equal(current.progress.attempts[0].title, 'Behoud toets');
  assert(fs.existsSync(path.join(h.root, 'packages', pkg.id, example.file)), 'Shared example remains');
  h.open(backup); current = await h.invoke('restore');
  topic = current.packages.find(p => p.id === pkg.id).topics[0];
  assert.equal(topic.subtopics.length, 2);
  assert.equal(current.progress.topics[key].subtopics[first.id].done, true);
  assert.equal(current.progress.questions[key + '/deelvraag-1'].correct, true);
  current = await h.invoke('removeAttachment', { ...one, kind: 'example', id: example.id });
  assert.equal(current.packages.find(p => p.id === pkg.id).topics[0].subtopics.find(p => p.id === first.id).examples.length, 0);
  assert(fs.existsSync(path.join(h.root, 'packages', pkg.id, example.file)), 'Other subtopic still uses file');
  await h.invoke('removeAttachment', { ...two, kind: 'example', id: 'gedeeld-voorbeeld' });
  assert(!fs.existsSync(path.join(h.root, 'packages', pkg.id, example.file)), 'Unused example is removed');
});

test('First subtopic addition migrates old material, preserves IDs and keeps the final exam on its topic', async t => {
  const h = await desktop(t);
  const original = (await h.invoke('state')).packages[0];
  const topic = original.topics[0];
  const target = { packageId: original.id, topicId: topic.id };
  const current = await h.invoke('newSubtopic', { ...target, title: 'Volgende les' });
  const updated = current.packages.find(p => p.id === original.id).topics[0];
  assert.equal(updated.subtopics.length, 2);
  assert.equal(updated.subtopics[0].id, 'legacy');
  assert.equal(updated.subtopics[0].summary, topic.summary);
  assert.equal(updated.subtopics[0].video, topic.video);
  assert.deepEqual(updated.subtopics[0].questions, topic.questions);
  assert.deepEqual(updated.examQuestions, topic.examQuestions);
  assert.equal(updated.summary, undefined);
  assert.equal(updated.questions, undefined);
  assert(fs.existsSync(path.join(h.root, 'packages', original.id, topic.video)));
  const rejected = await h.raw('removeAttachment', [{ ...target, subtopicId: 'legacy', kind: 'video', id: 'legacy-video' }]);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /hulpfragmenten/);
});

test('Invalid section edits, missing images and canceled imports do not damage saved content', async t => {
  const h = await desktop(t);
  const { pkg, topic } = await moduleAndTopic(h);
  const target = { packageId: pkg.id, topicId: topic.id };
  let current = await h.invoke('newSubtopic', { ...target, title: 'Deel' });
  const part = current.packages.find(p => p.id === pkg.id).topics[0].subtopics[0];
  const request = { ...target, subtopicId: part.id };
  await h.invoke('updateSubtopic', { ...request, questions: [choice('bestaande-vraag')] });
  const original = fs.readFileSync(h.manifest(pkg.id), 'utf8');
  assert.equal((await h.raw('updateSubtopic', [{ ...request, examples: [{ id: 'x', title: 'X', file: 'assets/mist.png' }] }])).ok, false);
  assert.equal((await h.raw('updateSubtopic', [{ ...request, questions: [{ ...choice(), answer: 8 }] }])).ok, false);
  assert.equal((await h.raw('moveSubtopic', [{ ...request, direction: 'up' }])).ok, false);
  assert.equal((await h.raw('newSubtopic', [{ ...target, title: ' ' }])).ok, false);
  assert.equal((await h.raw('attach', [{ ...request, kind: 'exam' }])).ok, false);
  h.open(h.write('nieuwe-vragen.json', JSON.stringify([choice('andere-vraag')])));
  h.answer(0);
  assert.equal(await h.invoke('attach', { ...request, kind: 'practice' }), null);
  assert.equal(fs.readFileSync(h.manifest(pkg.id), 'utf8'), original);
  h.answer(1);
  h.open(h.write('stuk.md', '# Nieuwe tekst'));
  current = await h.invoke('attach', { ...request, kind: 'summary' });
  assert.equal(current.packages.find(p => p.id === pkg.id).topics[0].subtopics[0].summary, '# Nieuwe tekst');
});

test('Topic deletion cancels safely, isolates progress and assets, and keeps the last module empty', async t => {
  const h = await desktop(t);
  let { pkg, topic } = await moduleAndTopic(h);
  const first = { packageId: pkg.id, topicId: topic.id };
  let current = await h.invoke('newSubtopic', { ...first, title: 'Deel een' });
  let part = current.packages.find(p => p.id === pkg.id).topics[0].subtopics[0];
  const imageSource = path.join(demoDirectory, 'assets/vormen.png');
  h.open(imageSource);
  current = await h.invoke('attach', { ...first, subtopicId: part.id, kind: 'example', source: 'Eigen schema.' });
  pkg = current.packages.find(p => p.id === pkg.id);
  const shared = pkg.topics[0].subtopics[0].examples[0];
  current = await h.invoke('newTopic', { packageId: pkg.id, title: 'Ander onderwerp' });
  pkg = current.packages.find(p => p.id === pkg.id);
  const secondTopic = pkg.topics[1];
  const second = { packageId: pkg.id, topicId: secondTopic.id };
  current = await h.invoke('newSubtopic', { ...second, title: 'Ander deel' });
  const otherPart = current.packages.find(p => p.id === pkg.id).topics[1].subtopics[0];
  await h.invoke('updateSubtopic', { ...second, subtopicId: otherPart.id, examples: [{ ...shared, id: 'gedeeld' }] });
  // One local image used only by the topic being deleted.
  h.open(imageSource);
  current = await h.invoke('attach', { ...first, subtopicId: part.id, kind: 'example', title: 'Alleen eerste' });
  pkg = current.packages.find(p => p.id === pkg.id);
  const exclusive = pkg.topics[0].subtopics[0].examples[1];
  pkg.finalQuestions = [
    { ...choice('final-first'), topicId: topic.id },
    { ...choice('final-second'), topicId: secondTopic.id },
    choice('implicit-first')
  ];
  fs.writeFileSync(h.manifest(pkg.id), JSON.stringify(pkg));
  const firstKey = pkg.id + '/' + topic.id;
  const secondKey = pkg.id + '/' + secondTopic.id;
  const otherPackageKey = 'ander-pakket/' + topic.id;
  await h.invoke('save', {
    topics: { [firstKey]: { done: true, subtopics: { [part.id]: { read: true } } }, [secondKey]: { done: true }, [otherPackageKey]: { done: true } },
    subtopics: { [firstKey + '/' + part.id]: { done: true }, [secondKey + '/' + otherPart.id]: { done: true } },
    questions: { [firstKey + '/vraag']: { correct: true }, [secondKey + '/vraag']: { correct: true }, [otherPackageKey + '/vraag']: { correct: true } },
    last: firstKey, attempts: [{ title: 'Oude toets', answers: [{ packageId: pkg.id, topicId: topic.id }] }]
  });
  const before = fs.readFileSync(h.manifest(pkg.id), 'utf8');
  h.answer(0);
  assert.equal(await h.invoke('deleteTopic', first), null);
  assert.equal(fs.readFileSync(h.manifest(pkg.id), 'utf8'), before);
  assert(fs.existsSync(path.join(h.root, 'packages', pkg.id, exclusive.file)));
  h.answer(1);
  current = await h.invoke('deleteTopic', first);
  pkg = current.packages.find(p => p.id === pkg.id);
  assert.equal(pkg.topics.length, 1);
  assert.equal(pkg.topics[0].id, secondTopic.id);
  assert.deepEqual(pkg.finalQuestions.map(q => q.id), ['final-second']);
  assert.equal(current.progress.topics[firstKey], undefined);
  assert.equal(current.progress.subtopics[firstKey + '/' + part.id], undefined);
  assert.equal(current.progress.questions[firstKey + '/vraag'], undefined);
  assert.equal(current.progress.last, undefined);
  assert.equal(current.progress.topics[secondKey].done, true);
  assert.equal(current.progress.questions[secondKey + '/vraag'].correct, true);
  assert.equal(current.progress.questions[otherPackageKey + '/vraag'].correct, true);
  assert.equal(current.progress.attempts[0].title, 'Oude toets');
  assert(fs.existsSync(path.join(h.root, 'packages', pkg.id, shared.file)));
  assert(!fs.existsSync(path.join(h.root, 'packages', pkg.id, exclusive.file)));
  current = await h.invoke('deleteTopic', second);
  pkg = current.packages.find(p => p.id === pkg.id);
  assert.equal(pkg.topics.length, 0);
  assert.equal(pkg.finalQuestions.length, 0);
  assert(current.modules.some(m => m.id === pkg.moduleId));
  assert(!fs.existsSync(path.join(h.root, 'packages', pkg.id, shared.file)));
});

test('Deleting a later topic preserves implicit final questions attached to the existing first topic', async t => {
  const h = await desktop(t);
  let { pkg, topic } = await moduleAndTopic(h);
  const current = await h.invoke('newTopic', { packageId: pkg.id, title: 'Tweede onderwerp' });
  pkg = current.packages.find(p => p.id === pkg.id);
  const secondId = pkg.topics[1].id;
  pkg.finalQuestions = [choice('implicit-first'), { ...choice('explicit-second'), topicId: secondId }];
  fs.writeFileSync(h.manifest(pkg.id), JSON.stringify(pkg));
  const after = await h.invoke('deleteTopic', { packageId: pkg.id, topicId: secondId });
  const kept = after.packages.find(p => p.id === pkg.id);
  assert.equal(kept.topics[0].id, topic.id);
  assert.deepEqual(kept.finalQuestions.map(q => q.id), ['implicit-first']);
});

test('Deleting a reordered part protects implicit clips but permits unrelated and own-only videos', async t => {
  const h = await desktop(t);
  const clip = { start: 0, end: 2 };
  const pkg = {
    format: 'makelaar-lespakket', schemaVersion: 1, id: 'part-clips', moduleId: 'part-clips',
    moduleTitle: 'Videodelen', title: 'Videodelen', finalQuestions: [{ ...choice('pakket-clip'), clip }],
    topics: [{ id: 'onderwerp', title: 'Onderwerp', subtopics: [
      { id: 'primary', title: 'Primaire video', summary: '', videos: [{ id: 'a', title: 'A', file: 'assets/a.mp4' }], questions: [] },
      { id: 'text', title: 'Tekst met hulpfragment', summary: '', questions: [{ ...choice('deel-clip'), clip }] },
      { id: 'unrelated', title: 'Andere video', summary: '', video: 'assets/b.mp4', questions: [] },
      { id: 'own', title: 'Eigen video en vraag', summary: '', video: 'assets/c.mp4', questions: [{ ...choice('eigen-clip'), clip }] }
    ], examQuestions: [{ ...choice('eind-clip'), clip }] }]
  };
  const archive = new AdmZip();
  archive.addFile('lespakket.json', Buffer.from(JSON.stringify(pkg)));
  for (const name of ['a', 'b', 'c']) archive.addLocalFile(demoVideo, 'assets', name + '.mp4');
  const source = path.join(h.root, 'part-clips.zip'); archive.writeZip(source); h.open(source); await h.invoke('import');
  const target = { packageId: pkg.id, topicId: 'onderwerp' };
  await h.invoke('moveSubtopic', { ...target, subtopicId: 'primary', direction: 'down' });
  const manifest = fs.readFileSync(h.manifest(pkg.id), 'utf8');
  const bytes = fs.readFileSync(path.join(h.root, 'packages', pkg.id, 'assets/a.mp4'));
  const rejected = await h.raw('deleteSubtopic', [{ ...target, subtopicId: 'primary' }]);
  assert.equal(rejected.ok, false); assert.match(rejected.error, /hulpfragmenten/);
  assert.equal(fs.readFileSync(h.manifest(pkg.id), 'utf8'), manifest);
  assert.deepEqual(fs.readFileSync(path.join(h.root, 'packages', pkg.id, 'assets/a.mp4')), bytes);
  const withoutExams = JSON.parse(manifest);
  withoutExams.finalQuestions = [];
  withoutExams.topics[0].examQuestions = [];
  fs.writeFileSync(h.manifest(pkg.id), JSON.stringify(withoutExams));
  const sectionOnly = await h.raw('deleteSubtopic', [{ ...target, subtopicId: 'primary' }]);
  assert.equal(sectionOnly.ok, false, 'Another part without its own video still depends on the fallback video');
  assert.match(sectionOnly.error, /hulpfragmenten/);
  assert.deepEqual(JSON.parse(fs.readFileSync(h.manifest(pkg.id), 'utf8')), withoutExams);
  await h.invoke('deleteSubtopic', { ...target, subtopicId: 'unrelated' });
  const current = await h.invoke('deleteSubtopic', { ...target, subtopicId: 'own' });
  assert.deepEqual(current.packages.find(p => p.id === pkg.id).topics[0].subtopics.map(p => p.id), ['text', 'primary']);
});

test('A topic videos-only primary permits deleting a subtopic video used only by its own questions', async t => {
  const h = await desktop(t);
  const pkg = {
    format: 'makelaar-lespakket', schemaVersion: 1, id: 'root-clip', moduleId: 'root-clip',
    moduleTitle: 'Onderwerpvideo', title: 'Onderwerpvideo', finalQuestions: [],
    topics: [{ id: 'onderwerp', title: 'Onderwerp', videos: [{ id: 'root', title: 'Hoofdvideo', file: 'assets/root.mp4' }],
      subtopics: [{ id: 'deel', title: 'Eigen video', video: 'assets/deel.mp4', questions: [] },
        { id: 'tekst', title: 'Alleen tekst', questions: [{ ...choice('fallback'), clip: { start: 0, end: 2 } }] }],
      examQuestions: [{ ...choice('root-exam'), clip: { start: 0, end: 2 } }] }]
  };
  const archive = new AdmZip(); archive.addFile('lespakket.json', Buffer.from(JSON.stringify(pkg)));
  for (const name of ['root', 'deel']) archive.addLocalFile(demoVideo, 'assets', name + '.mp4');
  const source = path.join(h.root, 'root-clip.zip'); archive.writeZip(source); h.open(source); await h.invoke('import');
  const current = await h.invoke('deleteSubtopic', { packageId: pkg.id, topicId: 'onderwerp', subtopicId: 'deel' });
  const topic = current.packages.find(p => p.id === pkg.id).topics[0];
  assert.equal(topic.subtopics.length, 1); assert.equal(topic.videos[0].file, 'assets/root.mp4');
  assert(fs.existsSync(path.join(h.root, 'packages', pkg.id, 'assets/root.mp4')));
  assert(!fs.existsSync(path.join(h.root, 'packages', pkg.id, 'assets/deel.mp4')));
});
