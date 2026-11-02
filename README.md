# Makelaar Academie

Persoonlijke offline Windows-leerapp voor Makelaar Wonen (BT1/BT2), gebouwd met Electron. Dit is versie 0.1: een functioneel prototype met demonstratiemateriaal, nog niet op Windows 11 getest.

## Installatie voor ontwikkeling / Codex Cloud

Gebruik Node.js 24 of nieuwer, met npm. Open de repository-root, waar package.json staat.

```sh
npm ci
npm test
npm run test:ui
```

Of in een Linux-cloudomgeving: `bash scripts/setup-cloud.sh`.
De installatie heeft netwerktoegang nodig voor npm en de Electron-binary. De leerapp zelf werkt offline.

De geautomatiseerde tests gebruiken geen grafische desktop. `test:ui` test DOM-interacties in jsdom; dit is geen echte videospeler- of visuele test.

## App starten

```sh
npm start
```

Hiervoor is een grafische sessie nodig. Een headless Linux-cloudomgeving kan de Electron-app niet zonder extra displayvoorziening tonen. Windows-gedrag moet apart op Windows worden getest.

## Windows-bundel bouwen

```sh
npm run build:win
```

Dit maakt `dist/win-unpacked` en `dist/Makelaar-Academie-Setup-0.1.0.exe`. Distribueer de installer naast een map `app` met de inhoud van `win-unpacked`, samen in een ZIP. De installer verwacht die map naast zich. Het is dus geen enkelvoudige installatie-EXE. Installer en app zijn niet digitaal ondertekend.

## Functies

- Modules en onderwerpen; import van een ZIP/.lespakket of JSON plus lokale media.
- Samenvattingen in PDF/TXT/Markdown; video's in MP4/WebM.
- Meerkeuze-, beeld-, reken- en open vragen; open vragen worden zelf beoordeeld.
- Gekoppelde video-hulpfragmenten via tijdcodes.
- Proeftoetsen, afsluitende toetsen, overzichtsfilms, voortgang en herhaalvragen.
- Export, volledige back-up en herstel van lessen, media en voortgang.

Video's worden extern gemaakt, niet door de app. Een algemene inhoudelijke briefing en het importformaat staan in `app/MAAK-EEN-LESPAKKET.md`. Echte leerstof, AI-avatarvideo's en gecontroleerde examenvragen ontbreken nog: daarvoor zijn het examen-pdf en de boekfoto's nodig.

## Bestanden

- `app/main.cjs`: Electron, opslag, import/export, back-ups en mediaprotocol.
- `app/renderer.js`, `app/index.html`, `app/style.css`: gebruikersinterface.
- `app/core.cjs`: pakketvalidatie, import en beoordeling.
- `app/demo/`: complete kleine demonstratieles inclusief beeld en video.
- `tests/`: core-, desktopdiensten- en DOM-tests.
- `build/installer.cjs`: NSIS-installer voor de offline bundel.
- `LEES-MIJ.md`: gebruikershandleiding.
- `TESTRESULTATEN.md`: eerdere controles en expliciete testbeperkingen.

## Eerstvolgende werk

Controleer de app op Windows 11, vooral media/PDF-weergave, hulpfragmenten, snelkoppelingen, installer en verwijderen. Werk de interface verder af op basis van gebruik. Behoud het offline karakter en de bestaande lespakketcompatibiliteit. Voeg pas echte examengerichte lessen toe na ontvangst van de bronstukken.

## Privacy

Deze openbare repository bevat een algemene briefing. Persoonlijke leerstijl, politieke voorkeuren en letterlijke gesprekscitaten zijn niet opgenomen. Bewaar persoonlijke aanpassingen buiten Git.
