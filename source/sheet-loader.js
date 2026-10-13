/*
  ============================================================
  sheet-loader.js - Lädt die Angebote aus dem Google Sheet
  ============================================================
  Liest die veröffentlichte CSV (SHEET_CSV_URL in csv-link.js), macht daraus
  Angebots-Objekte und überträgt Event-Infos und Pause auf EVENT_INFO / SLOTS /
  EXTRA_OFFERS (data.js). Ist das Sheet nicht erreichbar, werden stattdessen die
  FALLBACK_OFFERS aus data.js angezeigt.

  Erwartetes Sheet-Layout (von oben nach unten):

    1. Kopfbereich mit "Label:" / Wert-Paaren (optional, beliebig viele Zeilen)
         Event:    | GamesCafe Rollenspieltag 2026 | | | Datum: | 19.09.2026
         Eventort: | GamesCafe - Luhe Wildenau
       Bei "Eventname"/"Event" und "Datum des Events"/"Datum" gelten beide Schreibweisen.

    2. Darin eine kleine Tabelle für das Pausenangebot
         Kategorie     | Name des Angebots       | Sprache | Spielleiter | Startzeit | Endzeit | Max. Spieleranzahl
         Pausenangebot | Blood On The Clocktower | DE      | ...         | 18:00     | 19:00   | 15

    3. Die Haupttabelle, Kopfzeile beginnt mit "System":
         System | Name des Abenteuers | Sprache | Spielleiter | Startzeit | Endzeit | Max. Spieleranzahl
         | Anzahl der Spieler | Spieler 1 ... Spieler 10 | Abenteuerbeschreibung | Content Warning

  Fehlt der Kopfbereich, gilt die erste Zeile als Tabellenkopf (altes Format).
  Uhrzeiten dürfen als "18:00", "18" oder "18.30" im Sheet stehen (normalizeTime).
*/

// ------------------------------------------------------------
// Kleine Helfer
// ------------------------------------------------------------

// "13:30" -> 810 (Minuten seit Mitternacht)
function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Vereinheitlicht Uhrzeiten aus dem Sheet auf "HH:MM", egal ob dort "18", "18.30"
// oder "18:30 Uhr" steht (Google Sheets liefert je nach Zellformat auch nur "18").
// Alles Unlesbare wird unverändert durchgereicht.
function normalizeTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})(?:[:.](\d{1,2}))?\s*(?:Uhr)?$/i);
  if (!match) return text;
  return `${match[1].padStart(2, "0")}:${(match[2] || "0").padStart(2, "0")}`;
}

// Erkennt Platzhalter für "leer" (z.B. "/", "-", "--"), die im Sheet statt einer
// echten leeren Zelle eingetragen wurden.
function isBlankPlaceholder(value) {
  return /^[\/\-–—]+$/.test(value.trim());
}

// Normalisiert die "Sprache"-Spalte auf ein einheitliches Kürzel ("DE"/"ENG"),
// egal ob im Sheet "Deutsch", "German", "de" o.ä. steht. Unbekannte Werte
// werden nur groß geschrieben durchgereicht, damit nichts verloren geht.
function normalizeLanguage(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (["de", "deu", "ger", "deutsch", "german"].includes(text)) return "DE";
  if (["en", "eng", "engl", "englisch", "english"].includes(text)) return "ENG";
  return value.trim().toUpperCase();
}

// Einfacher CSV-Parser mit Unterstützung für "..."-Felder, die Kommas, Zeilenumbrüche
// und doppelte Anführungszeichen ("") enthalten dürfen. Ergebnis: Liste von Zeilen,
// jede Zeile eine Liste von Zellen.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------
// Kopfbereich: Event-Infos und Pausenangebot
// ------------------------------------------------------------

// Liest "Label:" / Wert-Paare aus dem Kopfbereich ("Eventort:" | "Luhe" -> {Eventort: "Luhe"}).
function parseMetaBlock(metaRows) {
  const meta = {};
  metaRows.forEach((row) => {
    row.forEach((cell, i) => {
      const label = (cell || "").trim();
      if (!label.endsWith(":")) return;
      const value = (row[i + 1] || "").trim();
      if (value !== "" && !isBlankPlaceholder(value)) {
        meta[label.slice(0, -1).trim()] = value;
      }
    });
  });
  return meta;
}

// Überträgt die Event-Infos aus dem Sheet auf EVENT_INFO. Ohne Kopfbereich
// bleiben die lokalen Werte aus data.js erhalten.
function applySheetMeta(meta) {
  const title = meta["Eventname"] || meta["Event"];
  const date = meta["Datum des Events"] || meta["Datum"];
  if (title) EVENT_INFO.title = title;
  if (date) EVENT_INFO.date = date;
  if (meta["Eventort"]) EVENT_INFO.location = meta["Eventort"];
}

// Liest die kleine "Kategorie"-Tabelle im Kopfbereich und überträgt die Zeile
// "Pausenangebot" auf den Pause-Slot und das Pausenangebot.
function applyCategoryTable(metaRows) {
  const headerIndex = metaRows.findIndex((row) => (row[0] || "").trim() === "Kategorie");
  if (headerIndex === -1) return;

  const headers = metaRows[headerIndex].map((header) => header.trim());
  metaRows.slice(headerIndex + 1).forEach((row) => {
    if (!row.some((cell) => cell.trim() !== "")) return;
    const values = rowToObject(headers, row);
    if (values["Kategorie"] === "Pausenangebot") applyPauseRow(values);
  });
}

// Zeitraum der Pause und Daten des Pausenangebots (Titel, Plätze, Leitung, Sprache)
function applyPauseRow(row) {
  const pauseSlot = SLOTS.find((slot) => slot.id === "pause");
  if (pauseSlot && row["Startzeit"] && row["Endzeit"]) {
    pauseSlot.start = normalizeTime(row["Startzeit"]);
    pauseSlot.end = normalizeTime(row["Endzeit"]);
  }

  const pauseOffer = EXTRA_OFFERS.find((offer) => offer.slotId === "pause");
  if (!pauseOffer) return;

  // Ein Platzhalter wie "-" als Titel blendet das Pausenangebot aus (siehe loadOffers)
  const title = row["Name des Angebots"] || "";
  pauseOffer.title = isBlankPlaceholder(title) ? "" : title;

  const maxPlayers = parseInt(row["Max. Spieleranzahl"], 10);
  if (maxPlayers > 0) pauseOffer.maxPlayers = maxPlayers;

  const gm = row["Spielleiter"] || "";
  if (gm && !isBlankPlaceholder(gm)) pauseOffer.gm = gm;

  const language = row["Sprache"] || "";
  if (language && !isBlankPlaceholder(language)) pauseOffer.language = normalizeLanguage(language);
}

// ------------------------------------------------------------
// Zeiträume und Haupttabelle
// ------------------------------------------------------------

// Rechnet die Slots in Minuten um. Zeiten vor dem Tagesstart gelten als "nach
// Mitternacht" (z.B. Slotende "00:00" -> 24:00 = 1440), siehe normalize().
// Wird auch vom Zeitstrahl für seine Zeitachse genutzt.
function computeSlotRanges() {
  const globalStartMin = Math.min(...SLOTS.map((slot) => timeToMinutes(slot.start)));
  const normalize = (minutes) => (minutes < globalStartMin ? minutes + 1440 : minutes);
  const slotRanges = SLOTS.map((slot) => ({
    ...slot,
    startMin: normalize(timeToMinutes(slot.start)),
    endMin: normalize(timeToMinutes(slot.end))
  }));
  const globalEndMin = Math.max(...slotRanges.map((slot) => slot.endMin));
  return { slotRanges, globalStartMin, globalEndMin, normalize };
}

// Ordnet eine Startzeit dem passenden Slot zu (unpassende Zeiten landen im ersten Slot).
function findSlotId(startTime, range) {
  const startMin = range.normalize(timeToMinutes(startTime));
  const match = range.slotRanges.find((slot) => startMin >= slot.startMin && startMin < slot.endMin);
  return match ? match.id : range.slotRanges[0].id;
}

// Kopfzeile + Zeile -> Objekt: (["System", "Name"], ["DSA", "Foo"]) -> {System: "DSA", Name: "Foo"}
function rowToObject(headers, row) {
  const object = {};
  headers.forEach((header, i) => {
    object[header] = (row[i] || "").trim();
  });
  return object;
}

// Namen der angemeldeten Spieler (Spalten "Spieler 1" bis "Spieler 10")
function getPlayerNames(row) {
  const names = [];
  for (let i = 1; i <= 10; i++) {
    const name = (row[`Spieler ${i}`] || "").trim();
    if (name !== "") names.push(name);
  }
  return names;
}

// Die Spalte heißt im Sheet mal "Content Warning", mal "Content Warnings" - beides
// gilt. Leere Zellen und Platzhalter wie "-" bedeuten: keine Content Warning.
function readContentWarning(row) {
  const value = (row["Content Warnings"] || row["Content Warning"] || "").trim();
  return isBlankPlaceholder(value) ? "" : value;
}

// Eine Zeile der Haupttabelle -> Angebots-Objekt (gleiche Felder wie in data.js)
function rowToOffer(row, index, range) {
  const startTime = normalizeTime(row["Startzeit"]);
  const playerNames = getPlayerNames(row);
  return {
    id: `sheet-${index}`,
    slotId: findSlotId(startTime, range),
    system: row["System"] || "",
    title: row["Name des Abenteuers"] || "",
    language: normalizeLanguage(row["Sprache"]),
    gm: "",
    // Nur zum Sortieren im Zeitstrahl (assignRows in timeline.js): Angebote
    // derselben Leitung landen in derselben Zeile. Wird bewusst NIRGENDS
    // angezeigt, deshalb bleibt das sichtbare Feld gm leer.
    gmKey: (row["Spielleiter"] || "").trim(),
    image: "",
    maxPlayers: parseInt(row["Max. Spieleranzahl"], 10) || 0,
    currentPlayers: playerNames.length,
    playerNames,
    startTime,
    endTime: normalizeTime(row["Endzeit"]),
    description: row["Abenteuerbeschreibung"] || "",
    contentWarning: readContentWarning(row)
  };
}

// ------------------------------------------------------------
// Laden
// ------------------------------------------------------------

async function loadOffersFromSheet() {
  const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("CSV-Abruf fehlgeschlagen: " + response.status);
  const allRows = parseCSV(await response.text());

  // Tabellenkopf suchen (Zeile, die mit "System" beginnt); ohne Treffer wird
  // die erste Zeile als Kopf angenommen (altes Sheet-Format ohne Kopfbereich).
  const headerRowIndex = allRows.findIndex((row) => (row[0] || "").trim() === "System");
  const hasMetaBlock = headerRowIndex > 0;
  const headers = allRows[hasMetaBlock ? headerRowIndex : 0].map((header) => header.trim());
  const metaRows = hasMetaBlock ? allRows.slice(0, headerRowIndex) : [];
  const bodyRows = allRows.slice((hasMetaBlock ? headerRowIndex : 0) + 1);

  applySheetMeta(parseMetaBlock(metaRows));
  applyCategoryTable(metaRows);

  const range = computeSlotRanges();
  return bodyRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => rowToObject(headers, row))
    .filter((row) => row["System"] !== "")
    .map((row, index) => rowToOffer(row, index, range));
}

// Lädt alle Angebote (Sheet + EXTRA_OFFERS) und fällt bei Fehlern auf FALLBACK_OFFERS
// zurück. Angebote ohne Titel (z.B. ein leeres Pausenangebot) werden ausgeblendet.
async function loadOffers() {
  const extraOffers = typeof EXTRA_OFFERS !== "undefined" ? EXTRA_OFFERS : [];
  let offers;
  try {
    const sheetOffers = await loadOffersFromSheet();
    if (sheetOffers.length > 0) {
      offers = sheetOffers.concat(extraOffers);
    } else {
      console.warn("Sheet enthielt keine Angebote, nutze FALLBACK_OFFERS.");
    }
  } catch (err) {
    console.warn("Konnte Angebote nicht aus dem Google Sheet laden, nutze FALLBACK_OFFERS.", err);
  }
  if (!offers) {
    const fallbackOffers = typeof FALLBACK_OFFERS !== "undefined" ? FALLBACK_OFFERS : [];
    offers = fallbackOffers.concat(extraOffers);
  }
  return offers.filter((offer) => (offer.title || "").trim() !== "");
}
