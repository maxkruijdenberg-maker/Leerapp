# Controles van versie 0.2

## In deze ontwikkelomgeving gecontroleerd

- 20 geslaagde core- en desktopintegratietests: bestaande lespakketten, importvalidatie, beoordeling, vrije modules, hernoemen/verwijderen, lege modules, meerdere video's en documenten, JSON-vragen, foutafhandeling, oude voortgang en volledige back-ups.
- Geslaagde DOM-interactietest: module en onderwerp maken/hernamen, samenvatting en opdrachttekst schrijven, meerkeuze-/reken-/open vragen maken en bewerken, JSON-/documentimport, meerdere video's, onafhankelijke kijkpositie, oefenen/toetsen en vensterknoppen.
- De echte Electron-runtime gestart op een virtueel Linux-scherm. Schermvullende start, eigen vensterknoppen, module/onderwerp maken, tekst en vragen opslaan, navigatie, schoon afsluiten en behoud na herstart zijn gecontroleerd met een tijdelijk profiel.
- Startpagina, modulepagina, onderwerppagina en vrageneditor visueel op Linux bekeken. Geen horizontale overflow op de gecontroleerde 1364-pixelviewport; de eigen titelbalk gebruikt de donkere appkleur.

## Bij het uitbrengen

De releaseworkflow voert de tests en echte desktopcontrole ook op een Windows-runner uit. De distributie wordt op Linux gebouwd; het verpakte app-archief wordt byte voor byte vergeleken met de broncode. De complete ZIP en SHA256-controlehash worden gevalideerd voordat upload naar de conceptrelease plaatsvindt. Raadpleeg de workflowrun bij de betreffende releasetag voor het actuele resultaat.

## Apart te controleren

- Installatie, bijwerken, snelkoppelingen en verwijderen op een echte Windows-pc.
- Video-/codeccompatibiliteit, PDF-weergave en hulpfragmenten met echt lesmateriaal.
- Gebruiksgemak op de eigen Windows-pc, schermresolutie en schaalinstelling.

De installer is niet digitaal ondertekend. De demonstratieles is geen officiële examenstof. Er zijn geen AI-avatarvideo's of gecontroleerde BT1/BT2-examenpakketten gemaakt zonder bronstukken.
