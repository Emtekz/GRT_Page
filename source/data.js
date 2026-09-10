/*
  ============================================================
  DATEN FÜR DEN ROLLENSPIELTAG-ZEITPLAN
  ============================================================
  Hier trägst du alle Infos zum Event ein. Die Seite (index.html)
  liest diese Datei aus und baut daraus automatisch das Dashboard.

  1) EVENT_INFO      -> allgemeine Infos zum Event (Titel, Datum, Ort)
  2) SLOTS           -> die festen Zeitslots des Tages
  3) EXTRA_OFFERS    -> Angebote, die NICHT aus dem Sheet kommen
                         (z.B. die Pause), werden immer zusätzlich angezeigt
  4) FALLBACK_OFFERS -> Beispiel-/Test-Angebote, die nur verwendet werden,
                         wenn das Sheet nicht erreichbar ist

  Der Link zur Google-Sheets-Tabelle steht in der eigenen Datei csv-link.js,
  damit er auch ohne Code-Kenntnisse leicht zu finden und zu ändern ist.

  Ein Slot kann mit isBreak: true als Pause markiert werden. Er wird
  dann optisch abgehoben dargestellt, kann aber trotzdem ganz normal
  Angebote enthalten.

  Angebots-Felder (Sheet-Spalten bzw. EXTRA_OFFERS/FALLBACK_OFFERS):
    system            - Name des Rollenspielsystems
    title             - Name des Abenteuers
    startTime/endTime - Uhrzeit im Format "13:00" (bestimmt automatisch den Slot)
    maxPlayers        - maximale Spieleranzahl
    currentPlayers    - aktuell angemeldete Spieler (optional, für Auslastungsanzeige)
    description       - Kurzbeschreibung des Abenteuers (für das Pop-up)
    gm                - Name des Spielleiters (optional, im Sheet aktuell nicht enthalten)
*/

const EVENT_INFO = {
  title: "Rollenspieltag 2026",
  date: "Samstag, 14. November 2026",
  location: "Vereinsheim, Hauptstraße 1"
};

// Feste Zeitslots des Tages
const SLOTS = [
  { id: "slot1", label: "Nachmittag", start: "13:00", end: "18:00" },
  { id: "pause", label: "Pause",               start: "18:00", end: "19:00", isBreak: true },
  { id: "slot2", label: "Abend",      start: "19:00", end: "00:00" }
];

// Angebote, die zusätzlich zum Sheet angezeigt werden (z.B. die Pause).
// Der Titel wird aus "Pausenangebot:" im Sheet befüllt - bleibt er dort leer,
// wird dieses Angebot automatisch ausgeblendet (siehe sheet-loader.js).
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
