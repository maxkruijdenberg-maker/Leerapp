# Mijn persoonlijke leerstijl en lespakket voor Makelaar Academie

Ik studeer Makelaar Wonen, nu Bouwkunde BT1 en BT2. Gebruik de exameninformatie en de foto's van mijn LOI-boek die ik bijvoeg. Vraag om ontbrekende of onleesbare pagina's. Verzin geen exameneisen, bronnen, feiten of antwoorden. Noem bronpagina's per samenvatting en vraag. Maak onderscheid tussen de periode waarin een bouwstijl ontstond en latere heroplevingen. Romeins is niet hetzelfde als romaans.

## Leer- en videobriefing

Vraag de gebruiker lokaal naar gewenste uitlegstijl, presentatoren, videolengte en oefenvormen. Bewaar persoonlijke voorkeuren en gesprekscitaten niet in deze openbare repository. Gebruik concrete voorbeelden, historische achtergrond waar relevant, visuele uitleg en ezelsbruggetjes. De feitelijke uitleg moet controleerbaar zijn met bronverwijzingen.

Video's worden extern gemaakt en als bestand geïmporteerd. Maak een script met scènes en gesproken tekst, en geef aan dat definitieve tijdcodes pas na het renderen bekend zijn. Gebruik eigen fictieve personages tenzij de gebruiker anders vraagt en de gekozen videodienst dat ondersteunt.

## Op te leveren

1. Beknopte, prettig leesbare samenvatting met bronverwijzingen.
2. Volledig videoscript met scènes, gesproken tekst, visuele aanwijzingen, personagebeschrijving en hoofdstukken. Geschatte script-tijden zijn voorlopig. Pas vraagfragmenten aan op de definitieve gerenderde video.
3. Oefenvragen die bij de stof passen: beeldherkenning, meerkeuze, berekeningen en open vragen met modelantwoord. De app ondersteunt choice, number en open; nog geen drag-and-drop. Gebruik echte beschikbare afbeeldingen met correct brongebruik, geen verzonnen bestandsnamen.
4. Apart samengestelde proeftoetsvragen per onderwerp, met antwoord en uitleg; daarna eindtoetsvragen over alle onderwerpen en een script voor een globale overzichtsfilm. Stem aantallen, tijd en vraagvorm af op mijn aangeleverde examendocument; vermeld wanneer aansluiting niet kan worden gecontroleerd. Claim geen officiële toets of gegarandeerde examendekking.
5. Eén importeerbaar lespakketbestand: ZIP met extensie .lespakket, lespakket.json direct in de hoofdmap en alle gebruikte media in assets/. Geen bestanden van externe URLs tijdens het leren. Houd hetzelfde pakket-ID en onderwerp-ID bij een kleine correctie. Bij vervanging wordt het gehele pakket vervangen: lever dus ook eerdere onderwerpen die behouden moeten blijven mee. Gebruik nieuwe vraag-ID's als de betekenis of antwoordopties veranderen.

## Bestandsformaat versie 1

JSON met deze structuur (geldige JSON, geen opmerkingen):

{
  "format": "makelaar-lespakket",
  "schemaVersion": 1,
  "id": "bt1-bouwstijlen",
  "moduleId": "bt1",
  "moduleTitle": "Bouwkunde BT1",
  "title": "Bouwstijlen",
  "examMinutes": 0,
  "topics": [
    {
      "id": "onderwerp-1",
      "title": "Titel op basis van mijn bronnen",
      "summary": "# Kern\n\nSamenvatting met bronpagina's.\n\n## Onthouden\n\n- Ezelsbruggetje",
      "presenter": "Eigen presentator",
      "questions": [
        {
          "id": "oefen-01",
          "type": "choice",
          "prompt": "Een vraag over de aangeleverde stof",
          "options": ["Optie A", "Optie B", "Optie C"],
          "answer": 1,
          "explanation": "Waarom B klopt en de andere opties niet.",
          "hint": "Waar moet ik op letten?",
          "source": "LOI, hoofdstuk en paginanummer"
        }
      ],
      "examQuestions": []
    }
  ],
  "finalQuestions": []
}

IDs: maximaal 80 tekens; alleen letters, cijfers, - en _. Vraag-ID's uniek binnen het onderwerp, ook tussen oefenen en toets. Gebruik eigen examenvragen, niet simpelweg dezelfde oefenvragen als eindtoets.

Voor video: voeg aan het onderwerp "video": "assets/uitleg.mp4" toe, alleen als dit bestand werkelijk is meegeleverd. Voor een PDF: "pdf": "assets/samenvatting.pdf". Voor een afbeelding bij een vraag: "image": "assets/foto.jpg". Voor hulpvideo voeg aan de vraag "clip": {"start": 35, "end": 58} toe: seconden in de definitieve video van dit onderwerp. Laat clip weg als de uiteindelijke timing nog onbekend is. Geen verzonnen timecodes.

Voor een rekenvraag: "type": "number", "answer": 125, "tolerance": 0.01. Vermeld eenheid en afronding in de vraag. Voor open vragen: "type": "open", "answer": "Modelantwoord". Open vragen worden door de leerling zelf beoordeeld; geen AI nodig. Combineer geen answer-index met een teksttype.

finalQuestions bevat hetzelfde vraagformaat plus "topicId" om naar een bestaand onderwerp te verwijzen; clip gebruikt de video van dat onderwerp. Als finalQuestions leeg is, combineert de app de proeftoetsvragen. Dit is een fallback, geen nieuw samengestelde eindtoets.

Overzichtsfilm: "overviewVideo": "assets/overzicht.mp4" op pakketniveau. Een globale film over alle stof kan als overzichtsfilm aan een pakket worden toegevoegd; de startpagina toont alle beschikbare overzichtsfilms.

examMinutes is een niet-negatief getal. 0 is zonder tijdslimiet. Geldt voor de onderwerp- en pakketproeftoets. De toets over alle modules heeft in versie 0.1 geen tijdslimiet.

Media: MP4 (H.264/AAC), WebM, PNG, JPG, WebP, GIF, PDF. Geen HTML, JavaScript of externe verwijzingen in pakketten. Markdown is beperkt tot kopjes, alinea's, lijsten en vetgedrukte tekst. Plaats geen video-verwijzing in JSON totdat het bestand beschikbaar is; ik kan de video later via de app uploaden. Samenvatting, vragen en afbeeldingen kunnen dus al eerder worden geïmporteerd.

Controleer vóór aflevering: JSON syntaxis, juiste antwoorden, bronverwijzingen, unieke IDs, alle mediabestanden aanwezig, clip-eindtijd na begintijd en binnen videoduur. Lever een korte lijst met nog ontbrekende broninformatie mee buiten het importbestand.

## Aanvullingen vanaf appversie 0.2

Het bestand blijft `schemaVersion: 1`. Bestaande pakketten blijven bruikbaar. Een lege module mag `topics: []` hebben. De gebruiker kiest de zichtbare `moduleTitle` en onderwerptitels zelf; IDs zijn technische, stabiele verwijzingen.

Aan een onderwerp kun je deze optionele velden toevoegen:

```json
{
  "assignmentText": "# Opdracht\n\nBeschrijf hier wat de leerling moet doen.",
  "videos": [
    {"id": "film-1", "title": "De eerste uitleg", "file": "assets/uitleg.mp4"}
  ],
  "assignments": [
    {"id": "opdracht-1", "title": "Werkblad", "file": "assets/werkblad.pdf"}
  ],
  "examFiles": [
    {"id": "toetsdocument-1", "title": "Oefentoets", "file": "assets/oefentoets.pdf"}
  ]
}
```

Dit is een veldenvoorbeeld: neem alleen verwijzingen op naar werkelijk meegeleverde bestanden. Bijlage-IDs zijn uniek binnen de betreffende lijst. Video's gebruiken MP4/WebM; opdracht- en toetsdocumenten PDF, TXT of Markdown. Documenten worden als documenten getoond, niet automatisch beoordeeld. Interactieve vragen blijven in `questions` en `examQuestions` staan.

Het oude veld `video` blijft de primaire video voor bestaande hulpfragmenten. Nieuwe hulpfragmenten kunnen met `clip.videoId` naar het ID in `videos` verwijzen. Verwijderen van een gebruikte hulpvideo wordt geblokkeerd zolang vragen ernaar verwijzen.

Een los vragenbestand kan een JSON-array zijn, of een object met `questions`. Bij een oefentoets mag het object ook `examQuestions` gebruiken. Het vraagformaat is hetzelfde als hierboven. Verwijs alleen naar media die al in het onderwerp/pakket aanwezig zijn, of importeer een compleet lespakket met media. Gebruik nieuwe vraag-IDs wanneer betekenis of antwoorden veranderen, zodat oude resultaten niet met een andere vraag worden verward.
