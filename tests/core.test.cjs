const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { validate, readPackage, installPackage, grade, safeRel } = require('../app/core.cjs');

const source = path.join(__dirname, '../app/demo/lespakket.json');
const fresh = () => JSON.parse(fs.readFileSync(source, 'utf8'));

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('Demo remains a valid legacy package and imports its media', t => {
  const root = temporaryRoot(t);
  const pkg = installPackage(source, root);
  assert.equal(pkg.id, 'start-demo');
  assert(fs.existsSync(path.join(root, pkg.id, 'assets/demo.mp4')));
});

test('Reject malformed answers and identifiers', () => {
  let pkg = fresh();
  pkg.topics[0].questions[0].answer = 99;
  assert.throws(() => validate(pkg), /Antwoordindex/);
  pkg = fresh();
  pkg.id = '../bad';
  assert.throws(() => validate(pkg), /ID/);
  pkg.id = 123;
  assert.throws(() => validate(pkg), /ID/);
});

test('Reject executable media and absolute or traversal paths', () => {
  for (const value of ['../bad', '/etc/passwd', 'C:/test', 'a\\b', 'a/../b', 'a//b']) {
    assert.throws(() => safeRel(value), /bestandspad/);
  }
  const pkg = fresh();
  pkg.topics[0].video = 'assets/script.html';
  assert.throws(() => validate(pkg), /Bestandstype/);
});

test('Reject invalid help clip order and references to unknown videos', () => {
  const pkg = fresh();
  pkg.topics[0].questions[0].clip.end = 1;
  assert.throws(() => validate(pkg), /videotijden/);
  pkg.topics[0].questions[0].clip.end = 20;
  pkg.topics[0].questions[0].clip.videoId = 'missing';
  assert.throws(() => validate(pkg), /onbekende video/);
});

test('Grade choices, decimal commas and open questions without accepting blank numeric answers', () => {
  assert.equal(grade({ type: 'choice', answer: 1 }, 1), true);
  assert.equal(grade({ type: 'choice', answer: 1 }, undefined), false);
  assert.equal(grade({ type: 'number', answer: 2.5, tolerance: 0.01 }, '2,5'), true);
  assert.equal(grade({ type: 'number', answer: 0 }, ''), false);
  assert.equal(grade({ type: 'number', answer: 1 }, 'abc'), false);
  assert.equal(grade({ type: 'open' }, 'anything'), null);
});

test('Missing media cannot replace an existing package', t => {
  const root = temporaryRoot(t);
  installPackage(source, root);
  const pkg = fresh();
  pkg.topics[0].video = 'assets/missing.mp4';
  const invalid = path.join(root, 'bad.json');
  fs.writeFileSync(invalid, JSON.stringify(pkg));
  assert.throws(() => installPackage(invalid, root), /Bestand ontbreekt/);
  assert(fs.existsSync(path.join(root, 'start-demo/assets/demo.mp4')));
});

test('Archive import copies only declared and validated media', t => {
  const root = temporaryRoot(t);
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(__dirname, '../app/demo'));
  zip.addFile('extra.exe', Buffer.from('unused'));
  const file = path.join(root, 'demo.lespakket');
  zip.writeZip(file);
  installPackage(file, path.join(root, 'dest'));
  assert(!fs.existsSync(path.join(root, 'dest/start-demo/extra.exe')));
});

test('An empty custom module is valid, but cannot carry topic-less final exam questions', () => {
  const pkg = fresh();
  pkg.topics = [];
  pkg.finalQuestions = [];
  delete pkg.overviewVideo;
  assert.deepEqual(validate(pkg), []);
  pkg.finalQuestions = [{ id: 'vraag', type: 'open', prompt: 'Leg uit.', answer: 'Modelantwoord' }];
  assert.throws(() => validate(pkg), /onderwerp nodig/);
});

test('New video and document collections participate in validation and package import', t => {
  const root = temporaryRoot(t);
  const pkg = fresh();
  pkg.topics[0].videos = [{ id: 'video-2', title: 'Tweede video', file: 'assets/tweede.webm' }];
  pkg.topics[0].assignmentText = 'Maak eerst de casus.';
  pkg.topics[0].assignments = [{ id: 'opdracht', title: 'Mijn opdracht', file: 'assets/casus.md' }];
  pkg.topics[0].examFiles = [{ id: 'toets', title: 'Toetsdocument', file: 'assets/toets.pdf' }];
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(__dirname, '../app/demo'));
  zip.updateFile('lespakket.json', Buffer.from(JSON.stringify(pkg)));
  zip.addFile('assets/tweede.webm', Buffer.from('test video bytes'));
  zip.addFile('assets/casus.md', Buffer.from('# Casus'));
  zip.addFile('assets/toets.pdf', Buffer.from('%PDF-1.4'));
  const file = path.join(root, 'new.lespakket');
  zip.writeZip(file);
  const imported = readPackage(file);
  assert(imported.assets.has('assets/tweede.webm'));
  assert.equal(imported.assets.get('assets/casus.md')().toString(), '# Casus');
  const destination = path.join(root, 'installed');
  installPackage(file, destination);
  assert.equal(fs.readFileSync(path.join(destination, pkg.id, 'assets/casus.md'), 'utf8'), '# Casus');
});

test('Attachment collections reject duplicate IDs, executable files and a document posing as a video', () => {
  const pkg = fresh();
  pkg.topics[0].assignments = [{ id: 'opdracht', title: 'A', file: 'assets/a.txt' },
    { id: 'opdracht', title: 'B', file: 'assets/b.txt' }];
  assert.throws(() => validate(pkg), /bijlage-ID/);
  pkg.topics[0].assignments = [{ id: 'opdracht', title: 'A', file: 'assets/a.html' }];
  assert.throws(() => validate(pkg), /Bestandstype/);
  pkg.topics[0].assignments = [];
  pkg.topics[0].videos = [{ id: 'film', title: 'A', file: 'assets/a.pdf' }];
  assert.throws(() => validate(pkg), /Bestandstype/);
});

test('Legacy content becomes the first subtopic without changing question IDs or final exam', () => {
  const { ensureSubtopics } = require('../app/core.cjs');
  const pkg = fresh();
  const topic = pkg.topics[0];
  const oldQuestions = structuredClone(topic.questions);
  const final = structuredClone(topic.examQuestions);
  const video = topic.video;
  const parts = ensureSubtopics(topic);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].id, 'legacy');
  assert.deepEqual(parts[0].questions, oldQuestions);
  assert.deepEqual(topic.examQuestions, final);
  assert.equal(parts[0].video, video);
  assert.equal(topic.summary, undefined);
  assert.equal(topic.questions, undefined);
  assert(validate(pkg).includes(video));
  assert.equal(ensureSubtopics(topic), parts);
  assert.equal(parts.length, 1);
});

test('Subtopics validate all examples and question media and import their local assets', t => {
  const root = temporaryRoot(t);
  const pkg = fresh();
  const topic = pkg.topics[0];
  topic.subtopics = [{ id: 'deel-1', title: 'Eerste uitleg', summary: '# Kern', questions: [], examples: [
    { id: 'beeld-1', title: 'Voorbeeld', file: 'assets/voorbeeld.png', caption: 'Een beschrijving.', source: 'Eigen schema.' }
  ] }];
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(__dirname, '../app/demo'));
  zip.updateFile('lespakket.json', Buffer.from(JSON.stringify(pkg)));
  zip.addFile('assets/voorbeeld.png', Buffer.from('image bytes'));
  const archive = path.join(root, 'parts.lespakket');
  zip.writeZip(archive);
  const refs = readPackage(archive);
  assert.equal(refs.assets.get('assets/voorbeeld.png')().toString(), 'image bytes');
  const dest = path.join(root, 'installed');
  installPackage(archive, dest);
  const imported = readPackage(path.join(dest, pkg.id, 'lespakket.json'));
  assert.equal(imported.p.topics[0].subtopics[0].examples[0].caption, 'Een beschrijving.');
  assert(imported.assets.has('assets/voorbeeld.png'));
});

test('Reject duplicate subtopic IDs, unsafe example types and question IDs reused across sections or exam', () => {
  const pkg = fresh();
  const t = pkg.topics[0];
  const q = { id: 'subvraag', type: 'open', prompt: 'Leg uit.', answer: 'Goed.' };
  t.subtopics = [{ id: 'deel', title: 'Een', questions: [q] }, { id: 'deel', title: 'Twee', questions: [] }];
  assert.throws(() => validate(pkg), /deelonderwerp-ID/);
  t.subtopics[1].id = 'twee';
  t.subtopics[1].questions = [q];
  assert.throws(() => validate(pkg), /verschillende IDs/);
  t.subtopics[1].questions = [];
  t.examQuestions.push(q);
  assert.throws(() => validate(pkg), /verschillende IDs/);
  t.examQuestions.pop();
  t.subtopics[0].examples = [{ id: 'beeld', title: 'X', file: 'assets/script.html' }];
  assert.throws(() => validate(pkg), /Bestandstype/);
  t.subtopics[0].examples[0].file = '../foto.png';
  assert.throws(() => validate(pkg), /bestandspad/);
  t.subtopics[0].examples[0].file = 'assets/foto.png';
  t.subtopics[0].examples[0].source = 42;
  assert.throws(() => validate(pkg), /Tekst/);
});
