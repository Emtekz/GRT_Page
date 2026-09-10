// Lädt die Angebote aus der veröffentlichten Google-Sheets-CSV (SHEET_CSV_URL in csv-link.js).
// Fällt automatisch auf FALLBACK_OFFERS zurück, falls das Sheet nicht erreichbar ist.
//
// Erwartetes Sheet-Layout:
//   Kopfbereich (beliebig viele Zeilen) mit "Label:" / Wert-Paaren, z.B.
//     Eventname: | GcRT 2026        | | | Datum des Events: | 19.09.2026
//     Eventort:  | GamesCafe ...    | | | Organisator:       | GamesCafe
//   darin eine kleine Tabelle für Sonder-Angebote wie die Pause:
//     Kategorie      | Name des Angebots       | Spielleiter | Startzeit | Endzeit | Max. Spieleranzahl
//     Pausenangebot  | Blood On The Clocktower |             | 18:00     | 19:00   | 15
//   danach die Haupttabelle mit der Kopfzeile:
//     System | Name des Abenteuers | Spielleiter | Startzeit | Endzeit | Max. Spieleranzahl
//     | Anzahl der Spieler | Spieler 1..Spieler 10 | Abenteuerbeschreibung
//
// Der Kopfbereich ist optional - fehlt er, wird einfach die erste Zeile als
// Tabellenkopf angenommen (altes Sheet-Format ohne Event-Metadaten).

function timeToMinutesRaw(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Einfacher CSV-Parser mit Unterstützung für "..."-Felder, die Kommas enthalten.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignorieren
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
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
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (["de", "deu", "ger", "deutsch", "german"].includes(v)) return "DE";
  if (["en", "eng", "engl", "englisch", "english"].includes(v)) return "ENG";
  return value.trim().toUpperCase();
}

// Feste UI-Texte im Pop-up (script.js/timeline.js), abhängig von offer.language.
// Die Freitexte (Beschreibung, Content Warning) kommen ja schon in der Sprache
// aus dem Sheet, wie sie eingetragen wurden - hier geht es nur um die festen
// Labels drumherum ("Uhrzeit", "Beschreibung:" etc.).
const UI_TEXT = {
  DE: {
    timeSuffix: " Uhr",
    time: "Uhrzeit",
    reservations: "Reservierungen",
    maxPlayers: "max. Spieler",
    description: "Beschreibung:",
    contentWarningFlag: "⚠ CW - unter der Beschreibung",
    contentWarningFlagTitle: "Enthält eine Content Warning, siehe unten",
    contentWarningLabel: "Content Warning:",
    gm: "Spielleitung:"
  },
  ENG: {
    timeSuffix: "",
    time: "Time",
    reservations: "Reservations",
    maxPlayers: "max. players",
    description: "Description:",
    contentWarningFlag: "⚠ CW - below description",
    contentWarningFlagTitle: "Contains a content warning, see below",
    contentWarningLabel: "Content Warning:",
    gm: "Game Master:"
  }
};

function getUiText(language) {
  return UI_TEXT[language] || UI_TEXT.DE;
}

// Liest "Label:" / Wert-Paare aus dem Kopfbereich des Sheets (Zeilen vor der Tabelle).
function parseMetaBlock(metaRows) {
  const meta = {};
  metaRows.forEach((row) => {
    row.forEach((cell, i) => {
      const label = (cell || "").trim();
      if (label.endsWith(":")) {
        const value = (row[i + 1] || "").trim();
        if (value !== "" && !isBlankPlaceholder(value)) {
          meta[label.slice(0, -1).trim()] = value;
        }
      }
    });
  });
  return meta;
}

// Überträgt die Event-Metadaten aus dem Sheet auf EVENT_INFO, falls im Sheet
// vorhanden. Ohne Kopfbereich bleiben die lokalen Werte aus data.js erhalten.
function applySheetMeta(meta) {
  const title = meta["Eventname"] || meta["Event"];
  const date = meta["Datum des Events"] || meta["Datum"];
  if (title) EVENT_INFO.title = title;
  if (date) EVENT_INFO.date = date;
  if (meta["Eventort"]) EVENT_INFO.location = meta["Eventort"];
}

// Liest die kleine "Kategorie"-Tabelle im Kopfbereich (z.B. für das Pausenangebot)
// und überträgt passende Zeilen auf SLOTS / EXTRA_OFFERS.
function applyCategoryTable(metaRows) {
  const headerIdx = metaRows.findIndex((r) => (r[0] || "").trim() === "Kategorie");
  if (headerIdx === -1) return;

  const headers = metaRows[headerIdx].map((h) => h.trim());
  for (let i = headerIdx + 1; i < metaRows.length; i++) {
    const row = metaRows[i];
    if (!row.some((c) => c.trim() !== "")) continue;

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] || "").trim();
    });

    if (obj["Kategorie"] === "Pausenangebot") {
      applyPauseCategoryRow(obj);
    }
  }
}

function applyPauseCategoryRow(row) {
  const pauseSlot = SLOTS.find((s) => s.id === "pause");
  if (pauseSlot && row["Startzeit"] && row["Endzeit"]) {
    pauseSlot.start = row["Startzeit"];
    pauseSlot.end = row["Endzeit"];
  }

  const pauseOffer = EXTRA_OFFERS.find((o) => o.slotId === "pause");
  if (pauseOffer) {
    const title = row["Name des Angebots"] || "";
    pauseOffer.title = isBlankPlaceholder(title) ? "" : title;

    const maxPlayers = parseInt(row["Max. Spieleranzahl"], 10);
    if (!isNaN(maxPlayers) && maxPlayers > 0) {
      pauseOffer.maxPlayers = maxPlayers;
    }

    const gm = row["Spielleiter"] || "";
    if (gm && !isBlankPlaceholder(gm)) {
      pauseOffer.gm = gm;
    }

    const language = row["Sprache"] || "";
    if (language && !isBlankPlaceholder(language)) {
      pauseOffer.language = normalizeLanguage(language);
    }
  }
}

// Ordnet einer Startzeit den passenden Slot aus SLOTS zu.
function computeSlotRanges() {
  const globalStartMin = Math.min(...SLOTS.map((s) => timeToMinutesRaw(s.start)));
  const normalize = (min) => (min < globalStartMin ? min + 1440 : min);
  const slotRanges = SLOTS.map((s) => ({
    ...s,
    startMin: normalize(timeToMinutesRaw(s.start)),
    endMin: normalize(timeToMinutesRaw(s.end))
  }));
  return { slotRanges, globalStartMin, normalize };
}

function findSlotId(startRaw, range) {
  const startMin = range.normalize(timeToMinutesRaw(startRaw));
  const match = range.slotRanges.find((s) => startMin >= s.startMin && startMin < s.endMin);
  return match ? match.id : range.slotRanges[0].id;
}

function getPlayerNames(row) {
  const names = [];
  for (let i = 1; i <= 10; i++) {
    const name = (row[`Spieler ${i}`] || "").trim();
    if (name !== "") names.push(name);
  }
  return names;
}

function rowToOffer(row, index, range) {
  const startTime = row["Startzeit"] || "";
  const endTime = row["Endzeit"] || "";
  const playerNames = getPlayerNames(row);
  return {
    id: `sheet-${index}`,
    slotId: findSlotId(startTime, range),
    system: row["System"] || "",
    title: row["Name des Abenteuers"] || "",
    language: normalizeLanguage(row["Sprache"]),
    gm: "",
    // Nur für die Zeilen-Zuordnung im Zeitstrahl (assignRows in timeline.js) -
    // wird bewusst NIRGENDS angezeigt, siehe gm-Feld oben dafür.
    gmKey: (row["Spielleiter"] || "").trim(),
    image: "",
    maxPlayers: parseInt(row["Max. Spieleranzahl"], 10) || 0,
    currentPlayers: playerNames.length,
    playerNames,
    startTime,
    endTime,
    description: row["Abenteuerbeschreibung"] || "",
    contentWarning: isBlankPlaceholder(row["Content Warnings"] || "") ? "" : (row["Content Warnings"] || "").trim()
  };
}

async function loadOffersFromSheet() {
  const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("CSV-Abruf fehlgeschlagen: " + response.status);
  const text = await response.text();
  const allRows = parseCSV(text);

  // Tabellenkopf suchen (Zeile, die mit "System" beginnt); ohne Treffer wird
  // die erste Zeile als Kopf angenommen (altes Sheet-Format ohne Metadaten).
  const headerRowIndex = allRows.findIndex((r) => (r[0] || "").trim() === "System");
  const hasMetaBlock = headerRowIndex > 0;
  const headers = (hasMetaBlock ? allRows[headerRowIndex] : allRows[0]).map((h) => h.trim());
  const metaRows = hasMetaBlock ? allRows.slice(0, headerRowIndex) : [];
  const bodyRows = allRows.slice((hasMetaBlock ? headerRowIndex : 0) + 1);

  applySheetMeta(parseMetaBlock(metaRows));
  applyCategoryTable(metaRows);

  const rows = bodyRows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (r[i] || "").trim();
      });
      return obj;
    })
    .filter((r) => (r["System"] || "").trim() !== "");

  const range = computeSlotRanges();
  return rows.map((r, i) => rowToOffer(r, i, range));
}

// Lädt die Angebote (Sheet + EXTRA_OFFERS), fällt bei Fehlern auf FALLBACK_OFFERS zurück.
// Angebote ohne Titel (z.B. ein leeres "Pausenangebot:" im Sheet) werden ausgeblendet.
async function loadOffers() {
  const extra = typeof EXTRA_OFFERS !== "undefined" ? EXTRA_OFFERS : [];
  let combined;
  try {
    const sheetOffers = await loadOffersFromSheet();
    if (sheetOffers.length > 0) {
      combined = sheetOffers.concat(extra);
    } else {
      console.warn("Sheet enthielt keine Angebote, nutze FALLBACK_OFFERS.");
    }
  } catch (err) {
    console.warn("Konnte Angebote nicht aus dem Google Sheet laden, nutze FALLBACK_OFFERS.", err);
  }
  if (!combined) {
    const fallback = typeof FALLBACK_OFFERS !== "undefined" ? FALLBACK_OFFERS : [];
    combined = fallback.concat(extra);
  }
  return combined.filter((o) => (o.title || "").trim() !== "");
}
