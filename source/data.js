/*
  ============================================================
  data.js - Grunddaten des Rollenspieltags
  ============================================================
  Die Seiten bauen sich aus diesen Daten auf. Das meiste wird beim Laden vom
  Google Sheet überschrieben (siehe sheet-loader.js); die Werte hier gelten nur,
  solange das Sheet nichts anderes liefert oder nicht erreichbar ist.

  1) EVENT_INFO      Titel, Datum, Ort und Maps-Link zum Ort (Titel/Datum/Ort
                     überschreibt der Sheet-Kopfbereich, der Link steht nur hier)
  2) SLOTS           die festen Zeitslots des Tages
  3) EXTRA_OFFERS    Angebote, die nicht aus der Haupttabelle kommen (die Pause);
                     Titel, Plätze, Leitung und Sprache stammen aus der
                     "Pausenangebot"-Zeile im Sheet
  4) FALLBACK_OFFERS Beispiel-Angebote, die nur erscheinen, wenn das Sheet nicht
                     erreichbar ist

  Der Link zum Sheet steht in csv-link.js.

  Ein Slot mit isBreak: true wird als Pause dargestellt (eigener Abschnitt, Bilder
  nur aus Images/Default/), kann aber ganz normal Angebote enthalten.

  Felder eines Angebots (Sheet-Spalten bzw. EXTRA_OFFERS/FALLBACK_OFFERS):
    id, slotId        interne Kennung / Zuordnung zu einem Slot (id aus SLOTS)
    system            Name des Rollenspielsystems
    title             Name des Abenteuers (leer = Angebot wird nicht angezeigt)
    language          "DE" oder "ENG" (optional; ENG zeigt die Flagge und
                      übersetzt die festen Pop-up-Texte)
    startTime/endTime Uhrzeit "13:00" (bestimmt den Slot; fehlt sie, gilt die des Slots)
    maxPlayers        maximale Spieleranzahl
    currentPlayers    angemeldete Spieler (optional, für die Auslastungsanzeige)
    description       Beschreibung für das Pop-up
    contentWarning    Content Warning für das Pop-up (optional)
    gm                Name der Spielleitung für das Pop-up (optional; aus dem Sheet
                      wird er bewusst nicht angezeigt)
    image             fester Bildpfad (optional, sonst wird das Bild über den
                      Namen gesucht - siehe image-resolver.js)
*/

const EVENT_INFO = {
  title: "Rollenspieltag 2026",
  date: "Samstag, 14. November 2026",
  location: "Vereinsheim, Hauptstraße 1",
  // Der Ort im Seitenkopf verlinkt hierhin (Wegbeschreibung). Leer lassen = kein Link.
  mapsUrl: "https://maps.app.goo.gl/dViqe8wzPt1ftDReA"
};

// Feste Zeitslots des Tages (Reihenfolge = Reihenfolge auf der Seite).
// Die Pause wird beim Laden aus dem Sheet angepasst.
const SLOTS = [
  { id: "slot1", label: "Nachmittag", start: "13:00", end: "18:00" },
  { id: "pause", label: "Pause", start: "18:00", end: "19:00", isBreak: true },
  { id: "slot2", label: "Abend", start: "19:00", end: "00:00" }
];

// Angebote außerhalb der Haupttabelle. Das Pausenangebot wird aus der Zeile
// "Pausenangebot" im Sheet befüllt; bleibt der Titel leer, wird es ausgeblendet.
const EXTRA_OFFERS = [
  {
    id: "extra-pause",
    slotId: "pause",
    system: "Pausenangebot",
    title: "",
    gm: "Orga-Team",
    image: "",
    maxPlayers: 20,
    description: "Lockeres Pausenangebot zum Entspannen zwischen den Abenteuern - Einstieg jederzeit möglich, keine Anmeldung nötig."
  }
];

// Nur als Rückfallebene, falls das Sheet nicht geladen werden kann
const FALLBACK_OFFERS = [
  {
    id: "fallback-1",
    slotId: "slot1",
    system: "Dungeons & Dragons 5e",
    title: "Der Fluch von Schattenfels",
    gm: "Markus",
    image: "",
    maxPlayers: 5,
    description: "Eine kleine Gruppe von Abenteurern wird in die verfluchte Burg Schattenfels gerufen, um ein jahrhundertealtes Rätsel zu lösen, bevor die Dunkelheit die Region verschlingt. Einsteigerfreundlich, Vorkenntnisse nicht nötig."
  },
  {
    id: "fallback-2",
    slotId: "slot2",
    system: "Das Schwarze Auge",
    title: "Schatten über Havena",
    gm: "Julia",
    image: "",
    maxPlayers: 4,
    description: "In den Gassen Havenas verschwinden Kinder spurlos. Die Gruppe muss ermitteln, bevor die Spur endgültig kalt wird. Ein klassisches DSA-Abenteuer im Stil eines Krimis."
  }
];
