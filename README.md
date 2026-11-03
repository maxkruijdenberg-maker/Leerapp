# Makelaar Academie

Offline Windows-leerapp, versie 0.4.0. Maak modules met eigen namen en voeg onderwerpen met deelonderwerpen toe. Doorloop per deel de uitleg, voorbeelden en opdrachten en sluit het onderwerp af met een eindtoets. De interface gebruikt donkergroen, goud en klassieke typografie. De app start schermvullend, met eigen vensterknoppen. Alle pagina’s gebruiken dezelfde vaste, lichtere groene basis. Invoervensters verduisteren de achtergrond niet; het bureaubladicoon gebruikt goud op herkenbaar donkergroen.

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

Voer deze distributiebouw uit op Windows. Dit bouwt de Windows x64-app, de installer en `dist/Makelaar-Academie-0.4.0-Windows-x64.zip` met SHA256-controlebestand. In de ZIP staan de setup, de volledige map `app`, de handleiding en de broncode van de huidige Git-commit. Commit de geteste broncode voordat je een distributiebundel maakt.

De installer kopieert de map `app` die naast de setup staat: pak altijd de volledige ZIP uit. De setup is geen zelfstandige installatie-EXE. App en installer zijn niet digitaal ondertekend. Een update bewaart de persoonlijke gegevensmap; maak vooraf een back-up en sluit de vorige versie.

De releaseworkflow controleert de echte appstart en opslag op een Windows-runner en bouwt de distributie op Windows, inclusief het icoon in het programmabestand. De workflow uploadt alleen naar een bestaande conceptrelease; publicatie volgt na controle van de bestanden. Installatie/verwijderen, echte video-/PDF-weergave en handmatige Windows-UX moeten afzonderlijk worden getest.

## Modules, onderwerpen en deelonderwerpen

- Maak een module en voeg onderwerpen toe. Verwijder een onderwerp met bevestiging wanneer je het niet meer nodig hebt.
- Deel ieder onderwerp op in geordende deelonderwerpen. Je kunt delen aanmaken, hernoemen, verplaatsen en verwijderen.
- Lees per deel de uitleg rechtstreeks op de pagina. Voeg lokale voorbeeldafbeeldingen met titel, onderschrift en bron toe.
- Maak vervolgens de opdrachten; meerkeuze- en rekenvragen worden automatisch nagekeken, open antwoorden beoordeel je zelf.
- Rond het deel af en ga naar het volgende. Eerdere delen blijven bereikbaar om te herhalen.
- Na alle deelonderwerpen kun je de eindtoets van het onderwerp starten. De inhoud en verdeling van die toets worden door het lespakket bepaald; de app genereert geen exameneisen of slagingsnorm.
- Bewaar je voortgang, exporteer lespakketten en maak volledige lokale back-ups.

Lespakketformaat 1 blijft ondersteund. Oude onderwerpen worden als bestaande uitleg en opdrachten toegankelijk gehouden; bij het toevoegen van een deel worden ze met behoud van tekst, media en vraag-IDs als eerste deel opgenomen. De topic-eindtoets blijft behouden. Zie `app/MAAK-EEN-LESPAKKET.md` voor het veld `subtopics` en voorbeelden. Bestaande PDF-/videobijlagen blijven bruikbaar; nieuwe lessen kunnen volledig als tekst en afbeeldingen worden aangeboden.

Een kleine demonstratieles is meegeleverd. Voor gecontroleerde BT1/BT2-lesstof zijn echte bronstukken nodig. Persoonlijke voorkeuren, lesmateriaal, foto's en voortgang horen niet in deze openbare repository.

Zie `LEES-MIJ.md` voor de gebruikershandleiding en `CHANGELOG.md` voor de wijzigingen.
