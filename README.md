# Makelaar Academie

Offline Windows-leerapp, versie 0.3.1. Maak zelf modules met eigen namen, voeg onderwerpen toe en bouw per onderwerp je samenvatting, video's, opdrachten en oefentoets op. De interface gebruikt donkergroen, goud en klassieke typografie. De app start schermvullend, met eigen vensterknoppen. Alle pagina’s gebruiken dezelfde vaste, lichtere groene basis. Invoervensters verduisteren de achtergrond niet; het bureaubladicoon gebruikt goud op herkenbaar donkergroen.

## Ontwikkelen

Gebruik Node.js 24 of nieuwer en npm vanuit de repository-root:

```sh
npm ci
npm test
npm run test:ui
```

`bash scripts/setup-cloud.sh` installeert de afhankelijkheden en voert de core-/integratie- en DOM-tests uit. De DOM-test gebruikt jsdom. Voor een echte desktopcontrole:

```sh
npx --no install-electron
npm run test:desktop
```

Op Linux vereist de desktopcontrole een grafische sessie, bijvoorbeeld de Xorg-dummydisplay uit de cloud-startinstructies. De controle gebruikt een tijdelijk profiel en wijzigt je eigen lessen niet. Handmatig starten kan met `npm start`.

De installatie heeft toegang nodig tot npm en de Electron-downloads. In de beheerde cloudomgeving gebruikt Node-fetch `NODE_USE_ENV_PROXY=1` met de bestaande proxy en CA-vertrouwensketen. De leerapp zelf gebruikt geen externe diensten of API-sleutels.

## Windows-bundel

```sh
npm run bundle:win
```

Voer deze distributiebouw uit op Windows. Dit bouwt de Windows x64-app, de installer en `dist/Makelaar-Academie-0.3.1-Windows-x64.zip` met SHA256-controlebestand. In de ZIP staan de setup, de volledige map `app`, de handleiding en de broncode van de huidige Git-commit. Commit de geteste broncode voordat je een distributiebundel maakt.

De installer kopieert de map `app` die naast de setup staat: pak altijd de volledige ZIP uit. De setup is geen zelfstandige installatie-EXE. App en installer zijn niet digitaal ondertekend. Een update bewaart de persoonlijke gegevensmap; maak vooraf een back-up en sluit de vorige versie.

De releaseworkflow controleert de echte appstart en opslag op een Windows-runner en bouwt de distributie op Windows, inclusief het icoon in het programmabestand. De workflow uploadt alleen naar een bestaande conceptrelease; publicatie volgt na controle van de bestanden. Installatie/verwijderen, echte video-/PDF-weergave en handmatige Windows-UX moeten afzonderlijk worden getest.

## Modules en onderwerpen

- Maak modules met vrij gekozen namen; hernoem ze wanneer nodig.
- Voeg binnen een module onderwerpen toe, of importeer een bestaand `.lespakket`, ZIP of JSON.
- Schrijf of upload de samenvatting (PDF, TXT of Markdown).
- Voeg meerdere MP4-/WebM-video's toe.
- Voeg opdrachttekst, documenten en interactieve meerkeuze-, reken- of open vragen toe.
- Stel zelf oefentoetsvragen samen of importeer een JSON-vragenlijst. Een PDF-/teksttoets kan ook als document worden toegevoegd.
- Bewaar voortgang, oefen herhaalvragen en maak volledige lokale back-ups.

Lespakketformaat 1 blijft ondersteund, inclusief bestaande videoverwijzingen en back-ups uit V0.1. De nieuwe optionele velden staan in `app/MAAK-EEN-LESPAKKET.md`. Open vragen beoordeel je zelf. De app verzint geen officiële exameneisen en genereert geen AI-video's.

Een kleine demonstratieles is meegeleverd. Voor gecontroleerde BT1/BT2-lesstof zijn echte bronstukken nodig. Persoonlijke voorkeuren, lesmateriaal, foto's en voortgang horen niet in deze openbare repository.

Zie `LEES-MIJ.md` voor de gebruikershandleiding en `CHANGELOG.md` voor de wijzigingen.
