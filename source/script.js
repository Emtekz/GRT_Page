/*
  ============================================================
  script.js - Kachelansicht (index.html)
  ============================================================
  Baut aus den Angeboten (OFFERS) die Kacheln, gruppiert nach Zeitslot, und
  zeigt in der Navbar den Abschnitt an, der gerade oben im Fenster steht.
  Pop-up, Auslastung und Seitenstart kommen aus shared.js,
  Bilder aus image-resolver.js, Daten aus sheet-loader.js.
*/

// ------------------------------------------------------------
// Kacheln und Abschnitte
// ------------------------------------------------------------

// Eine Angebotskarte: Titelbild/Farbverlauf füllt die ganze Karte, Text und
// Auslastung liegen (mit dunklem Verlauf für die Lesbarkeit) darüber.
// options.extraClass hängt eine Zusatzklasse an (z.B. "offer-card--pause").
function buildOfferCard(offer, options) {
  const extraClass = options && options.extraClass ? ` ${options.extraClass}` : "";
  const card = document.createElement("article");
  card.className = `offer-card${extraClass}`;
  makeOpenable(card, offer);

  card.innerHTML = `
    ${buildImageMarkup(offer, "offer-image", "offer-placeholder", getImageOptions(offer))}
    <div class="offer-overlay"></div>
    <div class="offer-body">
      <div class="offer-header-row">
        <span class="offer-system">${escapeHtml(offer.system)}</span>
        ${languageFlagMarkup(offer, "offer-language")}
      </div>
      <h3 class="offer-title">${escapeHtml(offer.title)}</h3>
      <div class="offer-footer">
        <span>${formatTimeRange(offerTimes(offer), " Uhr")}</span>
        <span>${playerCountText(offer)}</span>
      </div>
      ${buildFillBarMarkup(offer)}
    </div>
  `;
  return card;
}

// Ein Zeitslot: Überschrift mit Zeitspanne plus Raster mit den Karten. Ein Slot
// ohne Angebote (z.B. eine Pause ohne Pausenprogramm) zeigt nur Überschrift und
// Trennlinie, keine leere Box.
function buildSlotSection(slot, offers) {
  const section = document.createElement("section");
  section.id = `slot-${slot.id}`;
  section.className = "slot-section" + (slot.isBreak ? " slot-section--break" : "");

  const heading = document.createElement("div");
  heading.className = "slot-heading";
  heading.innerHTML = `<h2>${slot.label}</h2><span class="slot-time">${formatSlotTime(slot)}</span>`;
  section.appendChild(heading);

  if (offers.length === 0) {
    section.classList.add("slot-section--empty");
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "offer-grid";
  const cardOptions = slot.isBreak ? { extraClass: "offer-card--pause" } : undefined;
  offers.forEach((offer) => grid.appendChild(buildOfferCard(offer, cardOptions)));
  section.appendChild(grid);
  return section;
}

// Baut die ganze Seite: normale Slots nur mit Angeboten, die Pause immer - direkt
// hinter dem Slot, der unmittelbar vor ihr endet.
function renderDashboard() {
  renderEventHeader();

  const container = document.getElementById("slots-container");
  container.innerHTML = "";

  const normalSlots = SLOTS.filter((slot) => !slot.isBreak);
  const sectionsBySlotId = {};

  normalSlots.forEach((slot) => {
    const offers = OFFERS.filter((offer) => offer.slotId === slot.id);
    if (offers.length === 0) return;
    sectionsBySlotId[slot.id] = buildSlotSection(slot, offers);
    container.appendChild(sectionsBySlotId[slot.id]);
  });

  SLOTS.filter((slot) => slot.isBreak).forEach((slot) => {
    const section = buildSlotSection(slot, OFFERS.filter((offer) => offer.slotId === slot.id));
    const previousSlot = normalSlots.find((other) => other.end === slot.start);
    if (previousSlot && sectionsBySlotId[previousSlot.id]) {
      sectionsBySlotId[previousSlot.id].insertAdjacentElement("afterend", section);
    } else {
      container.appendChild(section);
    }
  });

  setupNavCurrentSection();
}

// ------------------------------------------------------------
// Navbar: aktueller Abschnitt
// ------------------------------------------------------------

// Zeigt in der Navbar Name + Zeitspanne des Abschnitts an, der gerade oben im
// Fenster steht (aktualisiert sich beim Scrollen). Ist der letzte Abschnitt zu
// kurz, um seine Überschrift bis zur Nav-Kante zu scrollen, würde er nie "aktiv" -
// deshalb gilt am Seitenende immer der letzte Abschnitt.
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

    // Der unterste Abschnitt, dessen Oberkante die Navbar erreicht hat. Vor dem
    // ersten Scrollen ist das bewusst keiner - dann bleibt die Anzeige leer.
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
    if (atBottom) current = sections[sections.length - 1];

    if (!current) {
      headingEl.innerHTML = "";
      return;
    }

    const slot = getSlotById(current.id.replace("slot-", ""));
    if (slot) {
      headingEl.innerHTML = `${slot.label}<span class="slot-nav-current-time">${formatSlotTime(slot)}</span>`;
    }
  }

  window.addEventListener("scroll", updateCurrentSection, { passive: true });
  updateCurrentSection();
}

document.addEventListener("DOMContentLoaded", () => initPage(renderDashboard));
