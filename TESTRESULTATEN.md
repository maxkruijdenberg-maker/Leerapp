# Validatie van versie 0.1

Geslaagd:
- 8 geautomatiseerde tests voor pakketimport, media, ongeldige paden en vraagantwoorden, ongeldige tijdcodes, antwoordbeoordeling, behoud bij mislukte import, archiefimport, en desktopdiensten met gesimuleerde Electron-dialogen.
- Desktopdiensten getest: onderwerp aanmaken, samenvatting/video toevoegen, voortgang bewaren, pakket exporteren, volledige back-up, terugzetten en verwijderen/importeren.
- DOM-interactietest: navigatie, feedback op fout antwoord, open vraag zelf beoordelen, herhaalvragen, toets zonder hints, 100%-score, toetsgeschiedenis, algemene lespakketbriefing, nieuw onderwerp en lege toets.
- JavaScript syntaxis gecontroleerd.
- Verpakte appbestanden byte voor byte vergeleken met de geteste bronbestanden.

Beperkingen van deze validatie:
- De installer is voor Windows x64 gebouwd vanuit een andere omgeving. Niet uitgevoerd op Windows 11.
- De desktopruntime kon hier niet worden gestart; de DOM-test is geen volledige browser- of visuele test.
- Echte videoweergave, codeccompatibiliteit, PDF-weergave en het springen naar fragmenten moeten nog op Windows worden gecontroleerd.
- De installer is niet digitaal ondertekend. Installatie, snelkoppelingen en de verwijderfunctie zijn nog niet op Windows beproefd.
- Demonstratie-inhoud is geen echte examenstof. Er zijn nog geen AI-avatarvideo's of gecontroleerde BT1/BT2-proeftoetsen gemaakt.
