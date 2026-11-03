# Makelaar Academie — versie 0.3.1

Je eigen offline leeromgeving voor Windows, met modules en onderwerpen die je zelf invult.

## Installeren of bijwerken

1. Sluit een oudere versie van Makelaar Academie. Maak bij bestaande lessen eerst een volledige back-up in de app.
2. Pak de volledige ZIP uit met **Alles uitpakken**.
3. Open **Makelaar-Academie-Setup-0.3.1.exe**. Laat de map **app** naast het installatieprogramma staan.
4. Start Makelaar Academie via de snelkoppeling op je bureaublad.

De update bewaart je persoonlijke lessen en voortgang. App en installer zijn niet digitaal ondertekend; Windows kan een onbekende uitgever aangeven. De installatie wordt per gebruiker uitgevoerd. De Windows-installatie en echte video-/PDF-weergave moeten nog handmatig worden gecontroleerd.

## Je eigen modules

Kies **Module toevoegen**, geef de module een eigen naam en open hem. Maak daarna onderwerpen aan met je eigen titels. Je kunt een module later hernoemen. Verwijderen vraagt bevestiging en verwijdert de bijbehorende lessen en bestanden; maak vooraf een back-up als je ze wilt bewaren.

Bestaande modules en onderwerpen uit V0.1 worden overgenomen. De demonstratieles laat zien hoe de app werkt en bevat geen officiële examenstof. Je kunt die module hernoemen of verwijderen.

## Een onderwerp vullen

Ieder onderwerp heeft vier onderdelen:

- **Samenvatting:** schrijf de tekst rechtstreeks in de app of upload een PDF, TXT of Markdown-bestand. Een tekstbewerking vervangt een eerder gekoppelde PDF.
- **Video's:** voeg een of meer MP4-/WebM-bestanden toe en kies de video die je wilt bekijken. Bestanden worden naar de app gekopieerd. Gebruik MP4 met H.264/AAC of WebM voor brede compatibiliteit.
- **Opdrachten:** schrijf opdrachttekst, voeg PDF-/tekst-/Markdown-documenten toe en maak interactieve vragen. Meerkeuze- en rekenvragen worden automatisch beoordeeld; open vragen beoordeel je zelf aan de hand van het modelantwoord.
- **Oefentoets:** stel eigen toetsvragen samen of importeer een JSON-vragenlijst. Een PDF-/teksttoets kan ook als document worden toegevoegd. Documenten worden niet automatisch naar interactieve vragen omgezet. Tijdens een interactieve toets krijg je de antwoorden pas na het inleveren.

De vrageneditor biedt een vraag, antwoord, antwoordopties en uitleg. Voor import gebruik je een JSON-array met vragen of een object met `questions`; voor toetsvragen mag ook `examQuestions` worden gebruikt. In de broncode staat `examples/vragenlijst.json` als invulvoorbeeld. Gebruik het lespakketformaat uit de meegeleverde briefing voor afbeeldingen, video's en gekoppelde hulpfragmenten. Vervangen van bestaande vragen vraagt bevestiging.

## Scherm en bediening

De app opent volledig schermvullend, zonder de witte Windows-titelbalk. De eigen knoppen rechtsboven verkleinen het venster, wisselen tussen volledig scherm en vensterweergave, en sluiten de app. Je blijft je gewone Windows-sneltoetsen kunnen gebruiken. De app gebruikt op alle pagina’s één vaste, lichtere groene basis. Bij het openen van invoervensters blijft de achtergrond gelijk. Het bureaublad- en taakbalkicoon is goud op herkenbaar donkergroen.

## Importeren en veilig bewaren

Een compleet `.lespakket` of ZIP bevat `lespakket.json` en alle media. Bij een losse JSON staan de genoemde media in de beschreven mappen naast het bestand. Een bestaand pakket-ID vervangen vraagt bevestiging en vervangt het hele pakket; neem dus alle te behouden onderwerpen mee in de update.

Een volledige back-up bewaart modules, onderwerpen, bestanden en voortgang samen in een ZIP. Bewaar hem op een andere schijf. Terugzetten vervangt de huidige gegevens na bevestiging; de vorige gegevens blijven als herstelkopie in de gegevensmap staan. Ook lege, zelfgemaakte modules worden meegenomen.

Je gegevens staan in je persoonlijke Windows-appgegevensmap onder `%APPDATA%` (doorgaans `makelaar-academie`). Verwijder die map niet bij een update. Gebruik bij voorkeur de ingebouwde back-upfunctie.

## Voortgang en herhalen

Afgeronde onderwerpen, kijkpositie, antwoorden en toetsgeschiedenis worden lokaal bewaard. Herhaalvragen volgen een eenvoudig schema van 1, 3, 7, 14 en 30 dagen na goede antwoorden. Dit is geen AI-inschatting. Open vragen worden zelf beoordeeld; automatische percentages gebruiken alleen automatisch beoordeelbare vragen. Niet-ingeleverde toetsantwoorden worden niet na afsluiten hersteld.

Video's en lesstof worden door jou gemaakt of aangeleverd. De app genereert geen video's en claimt geen officiële examendekking. Je hebt geen account, API-sleutel of internet nodig om te leren.
