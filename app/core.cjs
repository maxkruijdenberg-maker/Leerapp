const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const MEDIA = /\.(mp4|webm|mp3|wav|png|jpe?g|webp|gif|pdf|txt|md)$/i;
const VIDEO = /\.(mp4|webm)$/i;
const DOCUMENT = /\.(pdf|txt|md)$/i;

function assert(ok, message) {
  if (!ok) throw Error(message);
}

function validId(value) {
  return typeof value === 'string' && ID.test(value);
}

function safeRel(value) {
  assert(typeof value === 'string' && value.length < 240 &&
    !value.includes('\\') && !value.includes(':') && !value.startsWith('/') &&
    value.split('/').every(part => part && part !== '.' && part !== '..'), 'Ongeldig bestandspad');
  return value;
}

function text(value, maximum = 200000) {
  assert(typeof value === 'string' && value.length <= maximum, 'Tekst ontbreekt of is te lang');
  return value;
}

function validate(pkg) {
  assert(pkg && pkg.format === 'makelaar-lespakket' && pkg.schemaVersion === 1,
    'Dit is geen lespakket versie 1.');
  assert(validId(pkg.id) && validId(pkg.moduleId), 'Ongeldig pakket- of module-ID');
  text(pkg.title, 200);
  text(pkg.moduleTitle, 200);
  // An empty package also represents a newly created module.
  assert(Array.isArray(pkg.topics) && pkg.topics.length <= 200,
    'Een module bevat maximaal 200 onderwerpen.');
  const topicIds = new Set();
  const references = [];
  const asset = (file, pattern = MEDIA) => {
    if (file === undefined || file === null || file === '') return;
    safeRel(file);
    assert(pattern.test(file), 'Bestandstype niet toegestaan: ' + file);
    references.push(file);
  };
  const attachments = (items, pattern) => {
    assert(Array.isArray(items) && items.length <= 100, 'Te veel of ongeldige bijlagen');
    const ids = new Set();
    for (const item of items) {
      assert(item && validId(item.id) && !ids.has(item.id), 'Dubbel of ongeldig bijlage-ID');
      ids.add(item.id);
      text(item.title, 200);
      assert(typeof item.file === 'string' && item.file, 'Bijlagebestand ontbreekt');
      asset(item.file, pattern);
    }
  };
  const questions = items => {
    assert(Array.isArray(items) && items.length <= 2000, 'Ongeldige vragenlijst');
    const ids = new Set();
    for (const question of items) {
      assert(question && validId(question.id) && !ids.has(question.id), 'Dubbel of ongeldig vraag-ID');
      ids.add(question.id);
      text(question.prompt, 5000);
      assert(question.prompt.trim(), 'Een vraag mag niet leeg zijn');
      text(question.explanation ?? '', 10000);
      assert(['choice', 'number', 'open'].includes(question.type), 'Onbekend vraagtype');
      if (question.type === 'choice') {
        assert(Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 8,
          'Een vraag heeft 2 tot 8 opties');
        question.options.forEach(option => text(option, 2000));
        assert(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length,
          'Antwoordindex ongeldig');
      }
      if (question.type === 'number') {
        assert(Number.isFinite(question.answer) && Number.isFinite(question.tolerance ?? 0) &&
          (question.tolerance ?? 0) >= 0, 'Getalantwoord ongeldig');
      }
      if (question.type === 'open') text(question.answer, 10000);
      asset(question.image);
      if (question.clip) {
        assert(Number.isFinite(question.clip.start) && question.clip.start >= 0 &&
          Number.isFinite(question.clip.end) && question.clip.end > question.clip.start, 'Ongeldige videotijden');
        if (question.clip.videoId !== undefined) assert(validId(question.clip.videoId), 'Ongeldige hulpvideo');
      }
    }
  };
  for (const topic of pkg.topics) {
    assert(topic && validId(topic.id) && !topicIds.has(topic.id), 'Dubbel of ongeldig onderwerp-ID');
    topicIds.add(topic.id);
    text(topic.title, 200);
    text(topic.summary ?? '');
    text(topic.assignmentText ?? '');
    asset(topic.video, VIDEO);
    asset(topic.pdf, /\.pdf$/i);
    asset(topic.image);
    attachments(topic.videos ?? [], VIDEO);
    attachments(topic.assignments ?? [], DOCUMENT);
    attachments(topic.examFiles ?? [], DOCUMENT);
    questions(topic.questions ?? []);
    questions(topic.examQuestions ?? []);
    const allQuestions = [...(topic.questions ?? []), ...(topic.examQuestions ?? [])];
    assert(new Set(allQuestions.map(question => question.id)).size === allQuestions.length,
      'Gebruik verschillende IDs voor oefen- en toetsvragen');
    for (const question of allQuestions) {
      if (question.clip?.videoId) assert((topic.videos ?? []).some(video => video.id === question.clip.videoId),
        'Hulpfragment verwijst naar een onbekende video');
    }
  }
  asset(pkg.overviewVideo, VIDEO);
  questions(pkg.finalQuestions ?? []);
  assert(!(pkg.finalQuestions ?? []).length || pkg.topics.length, 'Een eindtoets heeft een onderwerp nodig');
  for (const question of pkg.finalQuestions ?? []) {
    if (question.topicId) assert(topicIds.has(question.topicId), 'Eindtoets verwijst naar onbekend onderwerp');
    if (question.clip?.videoId) {
      const topic = pkg.topics.find(item => item.id === question.topicId) ?? pkg.topics[0];
      assert((topic.videos ?? []).some(video => video.id === question.clip.videoId),
        'Hulpfragment verwijst naar een onbekende video');
    }
  }
  if (pkg.examMinutes !== undefined) assert(Number.isFinite(pkg.examMinutes) && pkg.examMinutes >= 0 &&
    pkg.examMinutes <= 360, 'Ongeldige toetsduur');
  return [...new Set(references)];
}

function readPackage(source) {
  const zip = /\.(zip|lespakket)$/i.test(source) ? new AdmZip(source) : null;
  let pkg;
  let entries = [];
  if (zip) {
    entries = zip.getEntries();
    assert(entries.length <= 4000, 'Te veel bestanden');
    let total = 0;
    const names = new Set();
    for (const entry of entries) {
      safeRel(entry.entryName.replace(/\/$/, ''));
      assert(!names.has(entry.entryName), 'Dubbele bestanden in het pakket');
      names.add(entry.entryName);
      total += entry.header.size;
      assert(total <= 2 * 1024 ** 3, 'Pakket is groter dan 2 GB');
      assert((entry.header.attr >>> 16 & 0xf000) !== 0xa000, 'Symbolische links zijn niet toegestaan');
    }
    const manifest = entries.find(entry => entry.entryName === 'lespakket.json');
    assert(manifest && manifest.header.size < 5 * 1024 ** 2, 'lespakket.json ontbreekt of is te groot');
    pkg = JSON.parse(manifest.getData().toString('utf8'));
  } else {
    assert(fs.statSync(source).size < 5 * 1024 ** 2, 'JSON is te groot');
    pkg = JSON.parse(fs.readFileSync(source, 'utf8'));
  }
  const refs = validate(pkg);
  const assets = new Map();
  for (const reference of refs) {
    if (zip) {
      const entry = entries.find(item => item.entryName === reference && !item.isDirectory);
      assert(entry, 'Bestand ontbreekt: ' + reference);
      assets.set(reference, () => entry.getData());
    } else {
      const file = path.resolve(path.dirname(source), reference);
      assert(fs.existsSync(file) && fs.statSync(file).isFile(), 'Bestand ontbreekt: ' + reference);
      assert(fs.realpathSync(file).startsWith(fs.realpathSync(path.dirname(source)) + path.sep), 'Bestand buiten pakket');
      assets.set(reference, () => fs.readFileSync(file));
    }
  }
  return { p: pkg, assets };
}

function atomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  fs.renameSync(temporary, file);
}

function installPackage(source, root) {
  const { p: pkg, assets } = readPackage(source);
  const destination = path.join(root, pkg.id);
  const stage = destination + '.incoming';
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  try {
    for (const [reference, read] of assets) {
      const file = path.join(stage, reference);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, read());
    }
    atomic(path.join(stage, 'lespakket.json'), pkg);
    const previous = destination + '.previous';
    fs.rmSync(previous, { recursive: true, force: true });
    if (fs.existsSync(destination)) fs.renameSync(destination, previous);
    try {
      fs.renameSync(stage, destination);
    } catch (error) {
      if (fs.existsSync(previous)) fs.renameSync(previous, destination);
      throw error;
    }
    fs.rmSync(previous, { recursive: true, force: true });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  return pkg;
}

function grade(question, answer) {
  if (question.type === 'open') return null;
  if (question.type === 'choice') return Number.isInteger(answer) && answer === question.answer;
  if (answer === null || answer === undefined || String(answer).trim() === '') return false;
  const number = Number(String(answer).replace(',', '.'));
  return Number.isFinite(number) && Math.abs(number - question.answer) <= (question.tolerance || 0);
}

module.exports = { validate, safeRel, readPackage, installPackage, atomic, grade, ID, MEDIA };
