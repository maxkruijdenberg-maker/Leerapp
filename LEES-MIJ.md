# Makelaar Academie — versie 0.4.0

Je eigen offline leeromgeving voor Windows, met modules en onderwerpen die je zelf invult.

## Installeren of bijwerken

1. Sluit een oudere versie van Makelaar Academie. Maak bij bestaande lessen eerst een volledige back-up in de app.
2. Pak de volledige ZIP uit met **Alles uitpakken**.
3. Open **Makelaar-Academie-Setup-0.4.0.exe**. Laat de map **app** naast het installatieprogramma staan.
4. Start Makelaar Academie via de snelkoppeling op je bureaublad.

De update bewaart je persoonlijke lessen en voortgang. App en installer zijn niet digitaal ondertekend; Windows kan een onbekende uitgever aangeven. De installatie wordt per gebruiker uitgevoerd. De Windows-installatie en echte video-/PDF-weergave moeten nog handmatig worden gecontroleerd.

## Je eigen modules

Kies **Module toevoegen**, geef de module een eigen naam en open hem. Maak daarna onderwerpen aan met je eigen titels. Je kunt een module later hernoemen en een onderwerp via het onderwerpsoverzicht verwijderen. Na bevestiging worden de bijbehorende delen en voortgang verwijderd; andere onderwerpen blijven behouden. Verwijderen vraagt bevestiging en verwijdert de bijbehorende lessen en bestanden; maak vooraf een back-up als je ze wilt bewaren.

Bestaande modules en onderwerpen uit V0.1 worden overgenomen. De demonstratieles laat zien hoe de app werkt en bevat geen officiële examenstof. Je kunt die module hernoemen of verwijderen.

## Leren in deelonderwerpen

Een module bevat onderwerpen, bijvoorbeeld een hoofdstuk uit je opleiding. Binnen een onderwerp maak je deelonderwerpen die je in volgorde doorloopt.

1. Kies **Deelonderwerp toevoegen** en vul een titel in.
2. Schrijf of upload de uitleg. Tekst staat rechtstreeks op de pagina; een oude PDF blijft als bijlage beschikbaar als de les die gebruikt.
3. Voeg voorbeelden toe als lokale afbeeldingsbestanden, met een titel, onderschrift en bron. De app bewaart deze bestanden zodat je offline kunt leren.
4. Voeg opdrachten toe: opdrachttekst, documenten of interactieve meerkeuze-, reken- en open vragen.
5. Lees de uitleg, maak de opdrachten en rond het deel af. Ga daarna door naar het volgende deel.
6. Na alle delen wordt de **eindtoets van het onderwerp** beschikbaar. Antwoorden en uitleg verschijnen na het inleveren.

Je kunt onderdelen teruglezen en opnieuw oefenen. Een deel afronden betekent dat je het hebt doorlopen; de app verzint geen voldoende of verplichte examencesuur. Open antwoorden beoordeel je zelf aan het modelantwoord; automatische percentages hebben alleen betrekking op automatisch beoordeelbare vragen.

De volgorde van delen kun je aanpassen. Bij het verwijderen van een deel blijven andere delen en de eindtoets behouden. Maak een back-up voordat je eigen inhoud verwijdert of een compleet lespakket vervangt.

## Bestaande lessen en extra bestanden

Bestaande onderwerpen blijven bruikbaar als uitleg met opdrachten. Voeg je er een deel aan toe, dan wordt de bestaande leerinhoud het eerste deel, met behoud van vragen en media; de onderwerpstoets blijft de eindtoets. Bestaande PDF's, video's en hulpfragmenten blijven ondersteund.

Gebruik voor vragenimport een JSON-array met vragen of een object met `questions`. Bij een onderwerpseindtoets kan ook `examQuestions` worden gebruikt. Een PDF-/teksttoets is een document en wordt niet automatisch naar interactieve vragen omgezet. Gebruik het lespakketformaat uit de meegeleverde briefing voor afbeeldingen en bronvermeldingen.

## Scherm en bediening

De app opent volledig schermvullend, zonder de witte Windows-titelbalk. De eigen knoppen rechtsboven verkleinen het venster, wisselen tussen volledig scherm en vensterweergave, en sluiten de app. Je blijft je gewone Windows-sneltoetsen kunnen gebruiken. De app gebruikt op alle pagina’s één vaste, lichtere groene basis. Bij het openen van invoervensters blijft de achtergrond gelijk. Het bureaublad- en taakbalkicoon is goud op herkenbaar donkergroen.

## Importeren en veilig bewaren

Een compleet `.lespakket` of ZIP bevat `lespakket.json` en alle media. Bij een losse JSON staan de genoemde media in de beschreven mappen naast het bestand. Een bestaand pakket-ID vervangen vraagt bevestiging en vervangt het hele pakket; neem dus alle te behouden onderwerpen mee in de update.

Een volledige back-up bewaart modules, onderwerpen, bestanden en voortgang samen in een ZIP. Bewaar hem op een andere schijf. Terugzetten vervangt de huidige gegevens na bevestiging; de vorige gegevens blijven als herstelkopie in de gegevensmap staan. Ook lege, zelfgemaakte modules worden meegenomen.

Je gegevens staan in je persoonlijke Windows-appgegevensmap onder `%APPDATA%` (doorgaans `makelaar-academie`). Verwijder die map niet bij een update. Gebruik bij voorkeur de ingebouwde back-upfunctie.

## Voortgang en herhalen

Afgeronde onderwerpen, kijkpositie, antwoorden en toetsgeschiedenis worden lokaal bewaard. Herhaalvragen volgen een eenvoudig schema van 1, 3, 7, 14 en 30 dagen na goede antwoorden. Dit is geen AI-inschatting. Open vragen worden zelf beoordeeld; automatische percentages gebruiken alleen automatisch beoordeelbare vragen. Niet-ingeleverde toetsantwoorden worden niet na afsluiten hersteld.

Video's en lesstof worden door jou gemaakt of aangeleverd. De app genereert geen video's en claimt geen officiële examendekking. Je hebt geen account, API-sleutel of internet nodig om te leren.
