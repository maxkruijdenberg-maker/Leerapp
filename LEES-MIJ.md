# Makelaar Academie — eerste werkende versie 0.1

Een lokale Windows-leerapp voor jouw opleiding Makelaar Wonen.

## Installeren

Pak de volledige ZIP eerst uit (rechtsklik → Alles uitpakken). Open daarna Makelaar-Academie-Setup-0.1.0.exe. Laat de map app naast het installatieprogramma staan; die bevat de bestanden die worden geïnstalleerd. De installatie gebruikt je persoonlijke programmamap en maakt een snelkoppeling op je bureaublad. Er is geen account of internet nodig voor het leren. Dit is een eerste, niet digitaal ondertekende versie; Windows kan daarom aangeven dat de uitgever onbekend is. De installatie wordt per gebruiker uitgevoerd.

## Beginnen

1. Open de demonstratieles om de knoppen, video, hulpfragmenten en toets te proberen. Deze bevat géén officiële examenstof en géén gegenereerde AI-presentator.
2. Kies ‘Eigen onderwerp’ en selecteer BT1 of BT2.
3. Upload binnen het onderwerp je samenvatting (PDF, TXT of Markdown) en video (MP4 of WebM). Bestanden worden naar de app gekopieerd.
4. Open ‘Mijn leeromgeving’ → ‘Open instructies voor ChatGPT’. Kopieer de briefing en voeg die samen met je examen-pdf en boekfoto's in ChatGPT toe. Pas de algemene briefing lokaal aan op je eigen voorkeuren.
5. Importeer het gegenereerde .lespakket-, .zip- of .json-bestand. Een compleet .lespakket bevat de afbeeldingen en video's. Bij een losse JSON moeten de genoemde bestanden naast het bestand in de beschreven mappen aanwezig zijn.
6. Oefen met directe feedback en ‘Help me even’: een video start op de begintijd en pauzeert bij het einde van het gekoppelde fragment.
7. Maak een proeftoets per onderwerp, een afsluitende toets per pakket, of de eindtoets over alle modules. Tijdens een toets verschijnt geen hulp. Na inleveren krijg je uitleg en gekoppelde fragmenten.

## Wat wordt opgeslagen?

Je laatst geopende onderwerp, afgeronde onderwerpen, videopositie, voltooid bekijken, antwoordenstatistieken, fouten, herhaalmomenten en toetsgeschiedenis. Foute antwoorden staan meteen bij Herhalen. Na goede antwoorden verschuift de herhaling naar 1, 3, 7, 14 en 30 dagen. Dit is een eenvoudige herhaalplanning, geen AI-inschatting. Een onderwerp markeer je zelf als afgerond. Je kijkpositie is geen maat voor hoeveel je werkelijk hebt bekeken.

Toetsgeschiedenis blijft bewaard. Antwoorden van een nog niet ingeleverde toets worden niet hersteld na afsluiten. Open vragen beoordeel je zelf aan de hand van het modelantwoord; het automatische percentage gebruikt alleen meerkeuze- en rekenvragen. Er is geen officiële slaaggrens ingesteld.

## Back-up en updates

‘Mijn leeromgeving’ → ‘Volledige back-up maken’ bewaart lessen, media en voortgang in één ZIP. Bewaar deze op een andere plek dan je pc. ‘Back-up terugzetten’ vervangt huidige gegevens na bevestiging. De eerdere gegevens blijven als herstelkopie in de gegevensmap staan.

Import van een bestaand pakket-ID vraagt bevestiging en vervangt het volledige pakket. Zorg dat alle te behouden onderwerpen en media in de update zitten. Voortgang gebruikt pakket-, onderwerp- en vraag-ID's. Gebruik nieuwe vraag-ID's wanneer inhoud of antwoordvolgorde verandert.

De appgegevens staan in de Windows-gebruikersmap onder %APPDATA%\Makelaar Academie (de exacte mapnaam kan door Electron op de package-naam gebaseerd zijn). Verwijder deze gegevens niet als je de app opnieuw installeert. Gebruik bij voorkeur de ingebouwde back-upfunctie.

## Video's en jouw personages

Video's worden buiten de app gemaakt. De app levert je persoonlijke productiebriefing, speelt bestanden af en koppelt oefeningen via tijdcodes aan de juiste fragmenten. Er zit geen video- of AI-generator ingebouwd. De openbare versie bevat een algemene videobriefing. Voeg persoonlijke presentator- en stijlvoorkeuren alleen lokaal toe.

Samenvattingen en vragen kunnen al worden toegevoegd vóór een video klaar is. Pas fragmenttijden aan op de definitieve video. Gebruik voor brede compatibiliteit MP4 met H.264-video en AAC-audio of WebM. Tijdcodes worden gecontroleerd op geldige volgorde, niet vooraf automatisch vergeleken met de videoduur; de speler meldt een begintijd buiten de video.

## Wat nog nodig is voor jouw echte cursus

Het examen-pdf en de foto's van de relevante LOI-pagina's. Zonder die bronnen bevat de app geen echte BT1/BT2-lespakketten en geen gecontroleerde nabootsing van je examen. De demonstratie laat alleen zien hoe de app werkt. Er zijn nog geen echte AI-avatarvideo's gemaakt.

## Technische broncode

De broncode en tests zitten bij dit pakket. Bouw opnieuw met een recente Node.js: npm ci en npm run build:win. Distribueer de gegenereerde installer samen met dist/win-unpacked als map app; het is een offline installatiebundel, geen enkelvoudige installer. Gebruik voor lokaal starten npm start. Windows x64 is het distributiedoel. Er zijn geen achtergrondservers, online logins, telemetrie of externe lettertypen nodig.

De app is gebouwd met Electron en electron-builder. Externe navigatie is geblokkeerd, het scherm draait zonder Node-toegang en lespakketten worden gevalideerd. Controleer desondanks zelf altijd of het lesmateriaal klopt. Grote video-imports en back-ups kunnen tijdens het kopiëren tijdelijk de app laten wachten; pakketimport is beperkt tot 2 GB en herstel tot 4 GB.
