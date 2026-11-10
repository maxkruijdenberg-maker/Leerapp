# Makelaar Academie

Offline Windows-leerapp, versie 0.5.0. Maak modules en onderwerpen met eigen namen. Importeer een hoofdstuk met één doorlopende samenvatting, opdrachten over het hele hoofdstuk en een toets, of gebruik een onderwerp met deelonderwerpen. De interface gebruikt donkergroen, goud en klassieke typografie. De app start schermvullend, met eigen vensterknoppen. Alle pagina’s gebruiken dezelfde vaste, lichtere groene basis. Invoervensters verduisteren de achtergrond niet; het bureaubladicoon gebruikt goud op herkenbaar donkergroen.

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

Voer deze distributiebouw uit op Windows. Dit bouwt de Windows x64-app, de installer en `dist/Makelaar-Academie-0.5.0-Windows-x64.zip` met SHA256-controlebestand. In de ZIP staan de setup, de volledige map `app`, de handleiding en de broncode van de huidige Git-commit. Commit de geteste broncode voordat je een distributiebundel maakt.

De installer kopieert de map `app` die naast de setup staat: pak altijd de volledige ZIP uit. De setup is geen zelfstandige installatie-EXE. App en installer zijn niet digitaal ondertekend. Een update bewaart de persoonlijke gegevensmap; maak vooraf een back-up en sluit de vorige versie.

De releaseworkflow controleert de echte appstart en opslag op een Windows-runner en bouwt de distributie op Windows, inclusief het icoon in het programmabestand. De workflow uploadt alleen naar een bestaande conceptrelease; publicatie volgt na controle van de bestanden. Installatie/verwijderen, echte video-/PDF-weergave en handmatige Windows-UX moeten afzonderlijk worden getest.

## Modules en hoofdstukken

- Maak een module en voeg onderwerpen met eigen titels toe, of importeer een lespakket met hoofdstukken. Verwijder een onderwerp met bevestiging wanneer je het niet meer nodig hebt.
- Een geïmporteerd hoofdstuk met `layout: "chapter"` opent rechtstreeks op **Samenvatting**. De tabbladen **Opdrachten** en **Toets** blijven direct bereikbaar.
- Schrijf één doorlopende samenvatting en voeg desgewenst lokale afbeeldingen of bijlagen toe. Zonder afbeeldingen verschijnt er geen leeg voorbeeldvak.
- Maak opdrachten over het hele hoofdstuk; meerkeuze- en rekenvragen worden automatisch nagekeken, open antwoorden beoordeel je zelf.
- **Help me even** geeft de hint bij de vraag. Ontbreekt die, dan krijg je een algemene aanwijzing om zelf verder te denken. Het modelantwoord heeft een aparte knop; bestaande hulpvideofragmenten blijven ondersteund.
- De hoofdstuktoets vereist geen afronding van afzonderlijke delen. De inhoud en verdeling van die toets worden door het lespakket bepaald; de app genereert geen exameneisen of slagingsnorm.
- Bewaar je voortgang, exporteer lespakketten en maak volledige lokale back-ups.

Lespakketformaat 1 blijft ondersteund. Gebruik `topic.layout: "chapter"` met `topic.summary`, `topic.questions` en `topic.examQuestions` voor één hoofdstuk zonder deelonderwerpen. Deze inhoud blijft op het onderwerp zelf opgeslagen. Zie `app/MAAK-EEN-LESPAKKET.md` voor een generiek voorbeeld.

Onderwerpen die je zelf in de app aanmaakt en bestaande onderwerpen met `subtopics` gebruiken de geordende deelroute en toets na afronding van de delen. Je kunt die delen aanmaken, hernoemen, verplaatsen en verwijderen. Oude onderwerpen blijven toegankelijk; bij het toevoegen van een deel aan zo’n oud onderwerp wordt de bestaande leerinhoud met behoud van tekst, media en vraag-IDs als eerste deel opgenomen. Bestaande PDF-/videobijlagen blijven bruikbaar.

Een kleine demonstratieles is meegeleverd. Voor gecontroleerde lesstof zijn echte bronstukken nodig. Persoonlijke voorkeuren, lesmateriaal, foto's en voortgang horen niet in deze openbare repository.

Zie `LEES-MIJ.md` voor de gebruikershandleiding en `CHANGELOG.md` voor de wijzigingen.
