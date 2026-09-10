// Rendert das Dashboard aus den Daten in data.js / sheet-loader.js und steuert das Info-Pop-up.

let OFFERS = [];

// hashColor() und buildImageMarkup() kommen aus image-resolver.js

function getSlotById(slotId) {
  return SLOTS.find((s) => s.id === slotId);
}

function formatTimeRange(offer) {
  const slot = getSlotById(offer.slotId);
  const start = offer.startTime || (slot ? slot.start : "?");
  const end = offer.endTime || (slot ? slot.end : "?");
  return `${start} - ${end} Uhr`;
}

// Auslastung: nur relevant, wenn currentPlayers bekannt ist (z.B. aus dem Google Sheet)
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

// Ampel-Farbe je nach Auslastung: <50% grün, 50-99% gelb, 100% rot
function fillLevelClass(offer) {
  const pct = fillPercent(offer);
  if (pct >= 100) return "fill-full";
  if (pct >= 50) return "fill-mid";
  return "fill-low";
}

// Ein Segment pro Platz (max. Spieleranzahl), die ersten currentPlayers davon
// gefüllt in der Ampel-Farbe - so sieht man auf einen Blick sowohl den Prozentwert
// (Ampel-Farbe) als auch die konkrete Anzahl freier/belegter Plätze.
function buildFillSegments(offer) {
  const total = offer.maxPlayers;
  const filled = Math.min(offer.currentPlayers, total);
  const levelClass = fillLevelClass(offer);
  let html = "";
  for (let i = 0; i < total; i++) {
    html += `<span class="fill-segment${i < filled ? ` filled ${levelClass}` : ""}"></span>`;
  }
  return html;
}

function buildFillBarMarkup(offer) {
  if (!hasFillInfo(offer)) return "";
  return `<div class="fill-bar">${buildFillSegments(offer)}</div>`;
}

// Baut eine Angebotskarte: Titelbild/Farbverlauf füllt die ganze Karte, Text
// liegt (mit Verlauf für Lesbarkeit) darüber. options.extraClass für Modifier
// (z.B. "offer-card--pause"), options.imageOptions wird an buildImageMarkup() durchgereicht.
function buildOfferCard(offer, options) {
  const opts = options || {};
  const card = document.createElement("article");
  card.className = "offer-card" + (opts.extraClass ? ` ${opts.extraClass}` : "");
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${offer.system}: ${offer.title} - Details anzeigen`);

  card.innerHTML = `
    ${buildImageMarkup(offer, "offer-image", "offer-placeholder", opts.imageOptions)}
    <div class="offer-overlay"></div>
    <div class="offer-body">
      <div class="offer-header-row">
        <span class="offer-system">${offer.system}</span>
        ${offer.language === "ENG" ? `<img class="offer-language" src="${DEFAULT_IMAGE_FOLDER}/englisch.png" alt="Englisch">` : ""}
      </div>
      <h3 class="offer-title">${offer.title}</h3>
      <div class="offer-footer">
        <span>${formatTimeRange(offer)}</span>
        <span>${playerCountText(offer)}</span>
      </div>
      ${buildFillBarMarkup(offer)}
    </div>
  `;

  card.addEventListener("click", () => openModal(offer));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal(offer);
    }
  });

  return card;
}

function buildSlotSection(slot, offers) {
  const section = document.createElement("section");
  section.id = `slot-${slot.id}`;
  section.className = "slot-section" + (slot.isBreak ? " slot-section--break" : "");

  const heading = document.createElement("div");
  heading.className = "slot-heading";
  heading.innerHTML = `<h2>${slot.label}</h2><span class="slot-time">${slot.start} - ${slot.end} Uhr</span>`;
  section.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "offer-grid";

  offers.forEach((offer) => grid.appendChild(buildOfferCard(offer)));

  section.appendChild(grid);
  return section;
}

// Ohne Pausenangebot reicht die Überschrift mit Zeit und Trennlinie -
// keine leere Box/Karte anzeigen.
function buildPauseSection(slot, offers) {
  const section = document.createElement("section");
  section.id = `slot-${slot.id}`;
  section.className = "slot-section slot-section--break";

  const heading = document.createElement("div");
  heading.className = "slot-heading";
  heading.innerHTML = `<h2>${slot.label}</h2><span class="slot-time">${slot.start} - ${slot.end} Uhr</span>`;
  section.appendChild(heading);

  if (offers.length > 0) {
    const grid = document.createElement("div");
    grid.className = "offer-grid";
    offers.forEach((offer) =>
      grid.appendChild(buildOfferCard(offer, { extraClass: "offer-card--pause", imageOptions: { defaultOnly: true } }))
    );
    section.appendChild(grid);
  } else {
    section.classList.add("slot-section--empty");
  }

  return section;
}

function renderDashboard() {
  document.getElementById("event-title").textContent = EVENT_INFO.title;
  document.getElementById("event-date").textContent = EVENT_INFO.date;
  document.getElementById("event-location").textContent = EVENT_INFO.location;

  const main = document.getElementById("slots-container");
  main.innerHTML = "";

  const normalSlots = SLOTS.filter((s) => !s.isBreak);
  const breakSlots = SLOTS.filter((s) => s.isBreak);
  const sectionsById = {};

  normalSlots.forEach((slot) => {
    const offers = OFFERS.filter((o) => o.slotId === slot.id);
    if (offers.length === 0) return;
    const section = buildSlotSection(slot, offers);
    sectionsById[slot.id] = section;
    main.appendChild(section);
  });

  breakSlots.forEach((slot) => {
    const offers = OFFERS.filter((o) => o.slotId === slot.id);

    // Immer als eigener Abschnitt direkt zwischen den beiden umliegenden Sessions -
    // mit Angebot(en) als flachere Karten, ohne Angebot mit Platzhaltertext.
    const section = buildPauseSection(slot, offers);
    const prevSlot = normalSlots.find((s) => s.end === slot.start);
    if (prevSlot && sectionsById[prevSlot.id]) {
      sectionsById[prevSlot.id].insertAdjacentElement("afterend", section);
    } else {
      main.appendChild(section);
    }
  });

  setupNavCurrentSection();
}

// Zeigt in der Navbar Name + Zeitspanne der Session an, die gerade oben im
// Viewport steht (ersetzt die früheren Sprunglinks zu Nachmittag/Pause/Abend) -
// aktualisiert sich beim Scrollen. Ist der letzte Abschnitt zu kurz, um seine
// Überschrift bis zur Nav-Kante zu scrollen, würde er sonst nie "aktiv" werden -
// deshalb zusätzlich ein Fallback für "ganz unten angekommen".
function setupNavCurrentSection() {
  const headingEl = document.getElementById("slot-nav-current");
  const nav = document.getElementById("slot-nav");
  if (!headingEl || !nav) return;

  const sections = Array.from(document.querySelectorAll("#slots-container .slot-section"));
  if (sections.length === 0) {
    headingEl.innerHTML = "";
    return;
  }

  function updateCurrentSection() {
    const threshold = nav.getBoundingClientRect().bottom;
    // Vor dem ersten Scrollen (Nachmittag noch unterhalb der Nav) ist bewusst
    // noch keine Überschrift zu sehen - erst wenn ein Abschnitt tatsächlich
    // oben angekommen ist.
    let current = null;
    let bestTop = -Infinity;
    sections.forEach((section) => {
      const top = section.getBoundingClientRect().top;
      if (top <= threshold + 1 && top > bestTop) {
        bestTop = top;
        current = section;
      }
    });

    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) {
      current = sections[sections.length - 1];
    }

    if (!current) {
      headingEl.innerHTML = "";
      return;
    }

    const slot = getSlotById(current.id.replace("slot-", ""));
    if (slot) {
      headingEl.innerHTML = `${slot.label}<span class="slot-nav-current-time">${slot.start} - ${slot.end} Uhr</span>`;
    }
  }

  window.addEventListener("scroll", updateCurrentSection, { passive: true });
  updateCurrentSection();
}

function openModal(offer) {
  const overlay = document.getElementById("modal-overlay");
  const imageSlot = document.getElementById("modal-image-inner");
  const slot = getSlotById(offer.slotId);
  const imageOptions = slot && slot.isBreak ? { defaultOnly: true } : undefined;
  imageSlot.innerHTML = buildImageMarkup(offer, "modal-image", "modal-placeholder", imageOptions);

  document.getElementById("modal-system").textContent = offer.system;
  document.getElementById("modal-title").textContent = offer.title;

  const modalLanguageEl = document.getElementById("modal-language");
  if (offer.language === "ENG") {
    modalLanguageEl.src = `${DEFAULT_IMAGE_FOLDER}/englisch.png`;
    modalLanguageEl.classList.remove("hidden");
  } else {
    modalLanguageEl.classList.add("hidden");
  }

  document.getElementById("modal-time").innerHTML = `<strong>${formatTimeRange(offer)}</strong><span>Uhrzeit</span>`;
  document.getElementById("modal-players").innerHTML = hasFillInfo(offer)
    ? `<strong>${offer.currentPlayers} / ${offer.maxPlayers}</strong><span>Reservierungen</span>`
    : `<strong>${offer.maxPlayers}</strong><span>max. Spieler</span>`;

  const fillBarWrapper = document.getElementById("modal-fill-bar");
  if (hasFillInfo(offer)) {
    fillBarWrapper.classList.remove("hidden");
    fillBarWrapper.innerHTML = buildFillSegments(offer);
  } else {
    fillBarWrapper.classList.add("hidden");
    fillBarWrapper.innerHTML = "";
  }

  const descriptionEl = document.getElementById("modal-description");
  descriptionEl.textContent = offer.description;

  const gmEl = document.getElementById("modal-gm");
  if (offer.gm) {
    gmEl.textContent = `Spielleitung: ${offer.gm}`;
    gmEl.classList.remove("hidden");
  } else {
    gmEl.classList.add("hidden");
  }

  overlay.classList.remove("hidden");
  lockPageScroll();
  document.getElementById("modal-close").focus();

  // Erst NACH dem Sichtbarmachen zurücksetzen (und einen Frame später nochmal
  // zur Sicherheit) - manche Browser ignorieren scrollTop-Änderungen an noch
  // unsichtbaren (display:none) Elementen bzw. verschieben die Scroll-Position
  // erst nach dem Layout wieder.
  descriptionEl.scrollTop = 0;
  requestAnimationFrame(() => {
    descriptionEl.scrollTop = 0;
  });
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  unlockPageScroll();
}

// Friert die Seite optisch am aktuellen Scroll-Stand ein (statt overflow:hidden,
// das die reservierte Scrollbar-Breite ändern und den Inhalt zur Seite
// verschieben würde - siehe body.modal-open in style.css).
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

document.addEventListener("DOMContentLoaded", async () => {
  OFFERS = await loadOffers();
  renderDashboard();
  document.getElementById("loading-overlay")?.classList.add("hidden");

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
});
