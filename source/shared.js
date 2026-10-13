/*
  ============================================================
  shared.js - Gemeinsamer Code aller Seiten
  ============================================================
  Wird auf jeder Seite NACH data.js / sheet-loader.js / image-resolver.js und
  VOR dem seiteneigenen Skript eingebunden:

    script.js              -> Kachelansicht (index.html)
    timeline.js            -> Zeitstrahl (pages/timeline.html)
    experimente-layouts.js -> Aufbau-Experimente (pages/experimente/aufbau.html)

  Hier liegt alles, was mehr als eine Seite braucht: Hilfsfunktionen für Zeiten
  und Auslastung, das Info-Pop-up und der gemeinsame Seitenstart (initPage).
  Dadurch muss z.B. das Pop-up nur an EINER Stelle geändert werden.
*/

// Alle Angebote der Seite (Sheet + EXTRA_OFFERS), wird in initPage() befüllt.
let OFFERS = [];

// ------------------------------------------------------------
// Slots und Uhrzeiten
// ------------------------------------------------------------

function getSlotById(slotId) {
  return SLOTS.find((slot) => slot.id === slotId);
}

// Slot-Zeitspanne als Text, z.B. "13:00 - 18:00 Uhr" (für Überschriften)
function formatSlotTime(slot) {
  return `${slot.start} - ${slot.end} Uhr`;
}

// Start-/Endzeit eines Angebots; fehlt sie im Sheet, gilt die des Slots.
function offerTimes(offer) {
  const slot = getSlotById(offer.slotId);
  return {
    start: offer.startTime || (slot ? slot.start : "?"),
    end: offer.endTime || (slot ? slot.end : "?")
  };
}

// {start, end} als Text, z.B. "13:00 - 17:30 Uhr" (timeSuffix = " Uhr" oder "")
function formatTimeRange(times, timeSuffix) {
  return `${times.start} - ${times.end}${timeSuffix}`;
}

// ------------------------------------------------------------
// Texte
// ------------------------------------------------------------

// Escaped Text für die Verwendung in innerHTML (Sheet-Inhalte nie ungeprüft einsetzen)
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Feste Texte im Pop-up, abhängig von offer.language ("DE"/"ENG", siehe
// normalizeLanguage() in sheet-loader.js). Die Freitexte (Beschreibung, Content
// Warning) stehen schon in der Sprache, in der sie im Sheet eingetragen wurden -
// hier geht es nur um die festen Labels drumherum. Neue Sprache = neuer Block.
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

// Unbekannte oder fehlende Sprache fällt auf Deutsch zurück.
function getUiText(language) {
  return UI_TEXT[language] || UI_TEXT.DE;
}

// ------------------------------------------------------------
// Auslastung (Spielerplätze)
// ------------------------------------------------------------

// Nur relevant, wenn currentPlayers bekannt ist (kommt aus dem Google Sheet).
function hasFillInfo(offer) {
  return offer.currentPlayers !== undefined && offer.currentPlayers !== null && offer.maxPlayers > 0;
}

function fillPercent(offer) {
  if (!offer.maxPlayers) return 0;
  return Math.min(100, Math.round((offer.currentPlayers / offer.maxPlayers) * 100));
}

function playerCountText(offer) {
  return hasFillInfo(offer) ? `${offer.currentPlayers} / ${offer.maxPlayers} Spieler` : `max. ${offer.maxPlayers} Spieler`;
}

// Ampel-Farbe je nach Auslastung: unter 50% grün, 50-99% gelb, 100% rot
function fillLevelClass(offer) {
  const percent = fillPercent(offer);
  if (percent >= 100) return "fill-full";
  if (percent >= 50) return "fill-mid";
  return "fill-low";
}

// Ein Segment pro Platz (maxPlayers), die ersten currentPlayers davon gefüllt in
// der Ampel-Farbe - so sieht man auf einen Blick sowohl die grobe Auslastung
// (Farbe) als auch die genaue Anzahl freier/belegter Plätze.
function buildFillSegments(offer) {
  const filled = Math.min(offer.currentPlayers, offer.maxPlayers);
  const levelClass = fillLevelClass(offer);
  let html = "";
  for (let i = 0; i < offer.maxPlayers; i++) {
    html += `<span class="fill-segment${i < filled ? ` filled ${levelClass}` : ""}"></span>`;
  }
  return html;
}

// Fertiger Balken für Karten/Balken; leer, wenn es keine Auslastungsinfo gibt.
function buildFillBarMarkup(offer) {
  if (!hasFillInfo(offer)) return "";
  return `<div class="fill-bar">${buildFillSegments(offer)}</div>`;
}

// ------------------------------------------------------------
// Bilder und Sprache
// ------------------------------------------------------------

// Pausenangebote suchen ihr Bild nur im Default-Ordner (siehe image-resolver.js)
function getImageOptions(offer) {
  const slot = getSlotById(offer.slotId);
  return slot && slot.isBreak ? { defaultOnly: true } : undefined;
}

// Flagge für englische Angebote (leer bei allen anderen Sprachen)
function languageFlagMarkup(offer, className) {
  if (offer.language !== "ENG") return "";
  return `<img class="${className}" src="${DEFAULT_IMAGE_FOLDER}/englisch.png" alt="Englisch">`;
}

// ------------------------------------------------------------
// Seitenkopf
// ------------------------------------------------------------

// Trägt Titel, Datum und Ort aus EVENT_INFO (kommt aus dem Sheet) in den Kopf ein.
function renderEventHeader() {
  document.getElementById("event-title").textContent = EVENT_INFO.title;
  document.getElementById("event-date").textContent = EVENT_INFO.date;
  document.getElementById("event-location").textContent = EVENT_INFO.location;
}

// ------------------------------------------------------------
// Info-Pop-up
// ------------------------------------------------------------

// Öffnet das Pop-up für ein Angebot. `times` ({start, end}) kann die Seite
// vorgeben (der Zeitstrahl rechnet sie aus Minuten); ohne Angabe gelten die
// Zeiten des Angebots.
function openModal(offer, times) {
  const t = getUiText(offer.language);

  document.getElementById("modal-image-inner").innerHTML = buildImageMarkup(
    offer,
    "modal-image",
    "modal-placeholder",
    getImageOptions(offer)
  );
  document.getElementById("modal-system").textContent = offer.system;
  document.getElementById("modal-title").textContent = offer.title;

  const languageEl = document.getElementById("modal-language");
  if (offer.language === "ENG") languageEl.src = `${DEFAULT_IMAGE_FOLDER}/englisch.png`;
  languageEl.classList.toggle("hidden", offer.language !== "ENG");

  const timeText = formatTimeRange(times || offerTimes(offer), t.timeSuffix);
  document.getElementById("modal-time").innerHTML = `<strong>${timeText}</strong><span>${t.time}</span>`;
  document.getElementById("modal-players").innerHTML = hasFillInfo(offer)
    ? `<strong>${offer.currentPlayers} / ${offer.maxPlayers}</strong><span>${t.reservations}</span>`
    : `<strong>${offer.maxPlayers}</strong><span>${t.maxPlayers}</span>`;

  const fillBar = document.getElementById("modal-fill-bar");
  fillBar.classList.toggle("hidden", !hasFillInfo(offer));
  fillBar.innerHTML = hasFillInfo(offer) ? buildFillSegments(offer) : "";

  // Marker "CW" neben dem Beschreibungs-Label; der Warntext selbst steht als
  // roter Kasten am Ende der Beschreibung.
  document.getElementById("modal-description-label").textContent = t.description;
  const warningFlag = document.getElementById("modal-content-warning-flag");
  warningFlag.classList.toggle("hidden", !offer.contentWarning);
  warningFlag.textContent = t.contentWarningFlag;
  warningFlag.title = t.contentWarningFlagTitle;

  const descriptionEl = document.getElementById("modal-description");
  descriptionEl.innerHTML = offer.contentWarning
    ? `${escapeHtml(offer.description)}\n\n<span class="content-warning-text"><strong>${t.contentWarningLabel}</strong><br>${escapeHtml(offer.contentWarning)}</span>`
    : escapeHtml(offer.description);

  const gmEl = document.getElementById("modal-gm");
  gmEl.classList.toggle("hidden", !offer.gm);
  if (offer.gm) gmEl.textContent = `${t.gm} ${offer.gm}`;

  document.getElementById("modal-overlay").classList.remove("hidden");
  lockPageScroll();
  document.getElementById("modal-close").focus();

  // Erst NACH dem Sichtbarmachen nach oben scrollen (und einen Frame später
  // nochmal): manche Browser ignorieren scrollTop an noch unsichtbaren
  // (display:none) Elementen bzw. verschieben die Position erst nach dem Layout.
  descriptionEl.scrollTop = 0;
  requestAnimationFrame(() => {
    descriptionEl.scrollTop = 0;
  });
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  unlockPageScroll();
}

// Friert die Seite optisch am aktuellen Scroll-Stand ein, solange das Pop-up
// offen ist. Bewusst per position:fixed (siehe body.modal-open in style.css)
// statt overflow:hidden - das würde die Scrollbar-Breite ändern und den Inhalt
// seitlich springen lassen.
function lockPageScroll() {
  const scrollY = window.scrollY;
  document.body.dataset.scrollY = scrollY;
  document.body.style.top = `-${scrollY}px`;
  document.body.classList.add("modal-open");
}

function unlockPageScroll() {
  const scrollY = parseInt(document.body.dataset.scrollY || "0", 10);
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
}

// Schließen per X-Button, Klick neben das Pop-up oder Escape-Taste
function bindModalEvents() {
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// Macht ein Element (Karte, Balken, Zeile) klick- und tastaturbedienbar:
// Klick oder Enter/Leertaste öffnen das Pop-up für das Angebot.
function makeOpenable(element, offer, times) {
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `${offer.system}: ${offer.title} - Details anzeigen`);
  element.addEventListener("click", () => openModal(offer, times));
  element.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal(offer, times);
    }
  });
}

// ------------------------------------------------------------
// Seitenstart
// ------------------------------------------------------------

// Gemeinsamer Ablauf jeder Seite: Angebote laden, Seite aufbauen (renderPage),
// Ladescreen ausblenden und das Pop-up scharf schalten.
async function initPage(renderPage) {
  OFFERS = await loadOffers();
  renderPage();
  document.getElementById("loading-overlay")?.classList.add("hidden");
  bindModalEvents();
}
