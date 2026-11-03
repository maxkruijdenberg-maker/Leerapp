'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
const dist = path.join(root, 'dist');
const payload = path.join(dist, 'win-unpacked');
const installer = 'Makelaar-Academie-Setup-' + version + '.exe';
const archiveName = 'Makelaar-Academie-' + version + '-Windows-x64.zip';
const archivePath = path.join(dist, archiveName);
const appArchive = path.join(payload, 'resources', 'app.asar');
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), '',
  'Commit de geteste broncode voordat je een distributiebundel maakt.');
const sourceFiles = execFileSync('git', ['ls-files', '-z', '--', 'app'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);

assert.equal(JSON.parse(asar.extractFile(appArchive, 'package.json')).version, version);
for (const file of sourceFiles) {
  assert.deepEqual(asar.extractFile(appArchive, path.normalize(file)), fs.readFileSync(path.join(root, file)), 'Verpakte bron wijkt af: ' + file);
}
assert.equal(fs.readFileSync(path.join(dist, installer)).subarray(0, 2).toString(), 'MZ');
assert.equal(fs.readFileSync(path.join(payload, 'Makelaar Academie.exe')).subarray(0, 2).toString(), 'MZ');

const zip = new AdmZip();
zip.addLocalFolder(payload, 'app');
zip.addLocalFile(path.join(dist, installer));
zip.addLocalFile(path.join(root, 'LEES-MIJ.md'));
zip.addLocalFile(path.join(root, 'CHANGELOG.md'));
zip.addFile('broncode.zip', execFileSync('git', ['archive', '--format=zip', 'HEAD'], { cwd: root, maxBuffer: 20 * 1024 * 1024 }));
zip.addFile('LEES-EERST.txt', Buffer.from([
  'Makelaar Academie ' + version + ' — Windows x64',
  '',
  'INSTALLEREN',
  '1. Pak de volledige ZIP uit met Alles uitpakken.',
  '2. Open ' + installer + '.',
  '3. Laat de map app naast het installatieprogramma staan.',
  '4. Start Makelaar Academie via de snelkoppeling op je bureaublad.',
  '',
  'Sluit een eerdere versie voordat je installeert. Maak eerst een back-up in de app.',
  'Je bestaande lessen en voortgang blijven in je persoonlijke gegevensmap staan.',
  'Lees LEES-MIJ.md voor modules, onderwerpen, uploaden en back-ups.',
  '',
  'Een demonstratieles is inbegrepen; eigen lesstof en video\'s importeer je zelf.',
  'App en installer zijn niet digitaal ondertekend.',
  'De Windows-installatie en echte video-/PDF-weergave moeten nog handmatig worden gecontroleerd.',
  '',
].join('\r\n'), 'utf8'));
zip.writeZip(archivePath);

const check = new AdmZip(archivePath);
assert(check.test(), 'ZIP-integriteitscontrole mislukt');
for (const file of [installer, 'app/Makelaar Academie.exe', 'app/resources/app.asar', 'LEES-MIJ.md', 'broncode.zip']) {
  assert(check.getEntry(file), 'Ontbreekt in bundel: ' + file);
}
const digest = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
fs.writeFileSync(archivePath.replace(/\.zip$/, '.sha256'), digest + '  ' + archiveName + '\n');
console.log('Windows-bundel: ' + archivePath);
console.log('SHA256: ' + digest);
