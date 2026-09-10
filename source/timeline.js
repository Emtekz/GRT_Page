// Test-Ansicht: stellt die Angebote aus data.js / sheet-loader.js als horizontalen Zeitstrahl dar.

const ROW_HEIGHT = 100; // Höhe je Zeile im Zeitstrahl (px)
const ROW_GAP = 12; // Lücke zwischen den Zeilen (px), auch oberhalb der ersten Zeile

// Auf schmalen Bildschirmen wird der Zeitstrahl statt einem durchgehenden Band
// (13:00-00:00, zu breit für ein Handy) in einen eigenen, auf 100% Breite
// skalierten Mini-Zeitstrahl pro Slot (Nachmittag/Pause/Abend) aufgeteilt -
// dadurch passt jeder Slot komplett ins Display, ganz ohne horizontales Scrollen.
const MOBILE_QUERY = "(max-width: 700px)";

let OFFERS = [];

// Auslastung: nur relevant, wenn currentPlayers bekannt ist (z.B. aus dem Google Sheet)
function hasFillInfo(offer) {
  return offer.currentPlayers !== undefined && offer.currentPlayers !== null && offer.maxPlayers > 0;
}

function fillPercent(offer) {
  if (!offer.maxPlayers) return 0;
  return Math.min(100, Math.round((offer.currentPlayers / offer.maxPlayers) * 100));
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

// hashColor() und buildImageMarkup() kommen aus image-resolver.js

// timeToMinutesRaw() kommt bereits aus sheet-loader.js (vor dieser Datei eingebunden)

function formatMinutesAsTime(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// Ermittelt Start-/Endzeit der Gesamtachse und normalisiert Zeiten,
// die über Mitternacht hinausgehen (z.B. Slotende "00:00" -> 24:00).
function computeTimelineRange() {
  const globalStartMin = Math.min(...SLOTS.map((s) => timeToMinutesRaw(s.start)));

  function normalize(min) {
    return min < globalStartMin ? min + 1440 : min;
  }

  const slotRanges = SLOTS.map((s) => ({
    ...s,
    startMin: normalize(timeToMinutesRaw(s.start)),
    endMin: normalize(timeToMinutesRaw(s.end))
  }));

  const globalEndMin = Math.max(...slotRanges.map((s) => s.endMin));

  return { globalStartMin, globalEndMin, slotRanges, normalize };
}

function getOfferRange(offer, range) {
  const slot = range.slotRanges.find((s) => s.id === offer.slotId);
  const startRaw = offer.startTime || slot.start;
  const endRaw = offer.endTime || slot.end;
  return {
    startMin: range.normalize(timeToMinutesRaw(startRaw)),
    endMin: range.normalize(timeToMinutesRaw(endRaw))
  };
}

function toPercent(min, range) {
  return ((min - range.globalStartMin) / (range.globalEndMin - range.globalStartMin)) * 100;
}

// Verteilt überlappende Angebote auf mehrere Zeilen (wie ein Kalender-Zeitstrahl).
// Verteilt Angebote auf Zeilen. Angebote desselben Spielleiters (offer.gmKey)
// landen dabei immer in derselben Zeile, damit sein Tagesablauf zusammenhängend
// zu sehen ist - der Name selbst wird dabei nirgends angezeigt, nur intern zum Sortieren genutzt.
function assignRows(offersWithRange) {
  const rowEnds = [];
  const rowIndexByGm = new Map();

  function findFreeRow(startMin) {
    const idx = rowEnds.findIndex((endMin) => endMin <= startMin);
    return idx === -1 ? rowEnds.length : idx;
  }

  const placed = offersWithRange
    .slice()
    .sort((a, b) => a.startMin - b.startMin)
    .map((entry) => {
      const gmKey = (entry.offer.gmKey || "").trim();
      let rowIndex = gmKey ? rowIndexByGm.get(gmKey) : undefined;

      if (rowIndex === undefined || rowEnds[rowIndex] > entry.startMin) {
        rowIndex = findFreeRow(entry.startMin);
        if (gmKey) rowIndexByGm.set(gmKey, rowIndex);
      }

      rowEnds[rowIndex] = entry.endMin;
      return { ...entry, rowIndex };
    });

  return { placed, rowCount: rowEnds.length };
}

function renderHeader() {
  document.getElementById("event-title").textContent = EVENT_INFO.title;
  document.getElementById("event-date").textContent = EVENT_INFO.date;
  document.getElementById("event-location").textContent = EVENT_INFO.location;
}

// Baut einen kompletten Zeitstrahl-Block (Stunden-Skala + Zeilen mit Angeboten)
// für den angegebenen Zeitraum und gibt ihn als fertiges .timeline-wrapper-Element
// zurück. `range` braucht nur globalStartMin/globalEndMin - die Angebote sind
// bereits mit (auf dieselbe Skala) normalisierten startMin/endMin annotiert.
// `breakBands` (optional) sind zusätzliche Pausen-Bänder, die als Overlay über
// die Zeilen gelegt werden (nur beim durchgehenden Desktop-Zeitstrahl nötig -
// im mobilen Modus ist die Pause bereits ihr eigener Block).
// Stunden-Marken für ein Zeitlineal - die äußerste linke/rechte Marke wird an
// der Kante ausgerichtet statt zentriert, damit sie nicht über den Rand
// hinausragt (z.B. im horizontal scrollbaren Mobile-Streifen). Wird sowohl für
// das echte Lineal im Zeitstrahl als auch für dessen Kopie in der Navbar
// benutzt, damit beide exakt dieselben Prozent-Positionen verwenden.
function buildRulerTicks(range) {
  const frag = document.createDocumentFragment();
  const firstTick = Math.ceil(range.globalStartMin / 60) * 60;
  const lastTick = firstTick + Math.floor((range.globalEndMin - firstTick) / 60) * 60;
  for (let tick = firstTick; tick <= range.globalEndMin; tick += 60) {
    const tickEl = document.createElement("div");
    tickEl.className =
      "timeline-tick" + (tick === firstTick ? " timeline-tick--first" : tick === lastTick ? " timeline-tick--last" : "");
    tickEl.style.left = toPercent(tick, range) + "%";
    tickEl.textContent = formatMinutesAsTime(tick);
    frag.appendChild(tickEl);
  }
  return frag;
}

function buildTimelineBlock(offersWithRange, range, breakBands, options) {
  const { placed, rowCount } = assignRows(offersWithRange);
  const trackHeight = Math.max(rowCount, 1) * ROW_HEIGHT + ROW_GAP;

  const wrapper = document.createElement("div");
  wrapper.className = "timeline-wrapper";

  // EXPERIMENT: Das Lineal (auf Mobile zusätzlich Überschrift/Swipe-Hinweis)
  // steckt bereits als Kopie in der Navbar (siehe renderNavTimeRuler()/
  // updateNavRuler()), deshalb entfällt es hier testweise komplett - sowohl
  // im durchgehenden Desktop-Zeitstrahl als auch pro Slot auf Mobile.
  const includeRuler = !options || options.includeRuler !== false;
  if (includeRuler) {
    const ruler = document.createElement("div");
    ruler.className = "timeline-ruler";
    ruler.appendChild(buildRulerTicks(range));
    wrapper.appendChild(ruler);
  }

  // Zeilen-Bereich (Gitterlinien, Pausen-Bänder, Angebote)
  const track = document.createElement("div");
  track.className = "timeline-track";
  track.style.height = trackHeight + "px";

  for (let tick = Math.ceil(range.globalStartMin / 60) * 60; tick <= range.globalEndMin; tick += 60) {
    const line = document.createElement("div");
    line.className = "timeline-gridline";
    line.style.left = toPercent(tick, range) + "%";
    track.appendChild(line);
  }

  (breakBands || []).forEach((b) => {
    const band = document.createElement("div");
    band.className = "timeline-break";
    const left = toPercent(b.startMin, range);
    band.style.left = left + "%";
    band.style.width = toPercent(b.endMin, range) - left + "%";
    band.innerHTML = "<span>Pause</span>";
    track.appendChild(band);
  });

  placed.forEach((p) => {
    const offer = p.offer;
    const left = toPercent(p.startMin, range);
    const width = toPercent(p.endMin, range) - left;

    const barSlot = SLOTS.find((s) => s.id === offer.slotId);
    const isBreakOffer = !!(barSlot && barSlot.isBreak);

    const bar = document.createElement("div");
    bar.className = "timeline-bar";
    bar.style.left = left + "%";
    bar.style.width = width + "%";
    bar.style.top = p.rowIndex * ROW_HEIGHT + ROW_GAP + "px";
    bar.style.height = ROW_HEIGHT - ROW_GAP + "px";
    bar.tabIndex = 0;
    bar.setAttribute("role", "button");
    bar.setAttribute("aria-label", `${offer.system}: ${offer.title} - Details anzeigen`);

    const imageOptions = isBreakOffer ? { defaultOnly: true } : undefined;

    bar.innerHTML = `
      ${buildImageMarkup(offer, "offer-image", "offer-placeholder", imageOptions)}
      <div class="offer-overlay"></div>
      <div class="timeline-bar-body">
        <div class="timeline-bar-header-row">
          <span class="timeline-bar-system">${offer.system}</span>
          ${offer.language === "ENG" ? `<img class="timeline-bar-language" src="${DEFAULT_IMAGE_FOLDER}/englisch.png" alt="Englisch">` : ""}
        </div>
        <div class="timeline-bar-title">${offer.title}</div>
        ${buildFillBarMarkup(offer)}
      </div>
    `;

    bar.addEventListener("click", () => openModal(offer, p));
    bar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(offer, p);
      }
    });

    track.appendChild(bar);
  });

  wrapper.appendChild(track);
  return wrapper;
}

// Desktop: ein einziger durchgehender Zeitstrahl über den ganzen Tag,
// echte Lücken und als Pause markierte Slots werden als Bänder hinterlegt.
function renderContinuousTimeline(container, range, offersWithRange) {
  const breakBands = [];

  const sortedSlots = range.slotRanges.slice().sort((a, b) => a.startMin - b.startMin);
  for (let i = 0; i < sortedSlots.length - 1; i++) {
    const gapStart = sortedSlots[i].endMin;
    const gapEnd = sortedSlots[i + 1].startMin;
    if (gapEnd > gapStart) breakBands.push({ startMin: gapStart, endMin: gapEnd });
  }

  range.slotRanges
    .filter((s) => s.isBreak)
    .forEach((s) => breakBands.push({ startMin: s.startMin, endMin: s.endMin }));

  // Das Original-Lineal steckt jetzt (als Kopie) in der Navbar (siehe
  // renderNavTimeRuler()), deshalb hier weggelassen.
  container.appendChild(buildTimelineBlock(offersWithRange, range, breakBands, { includeRuler: false }));
}

// Mobile: pro Slot ein eigener, auf 100% Breite skalierter Mini-Zeitstrahl -
// alle Slots liegen nebeneinander in einem horizontal scrollbaren Streifen mit
// Scroll-Snap (wie ein Kalender-Tageswechsel: swipen statt zusammenquetschen).
function renderTimelineBySlot(container, range, offersWithRange) {
  const bySlot = new Map();
  offersWithRange.forEach((entry) => {
    const key = entry.offer.slotId;
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key).push(entry);
  });

  const scroller = document.createElement("div");
  scroller.className = "timeline-slot-scroller";

  // Slots ohne Angebote (z.B. eine Pause ohne Pausenprogramm) werden komplett
  // übersprungen, damit man direkt zwischen den Slots mit echtem Programm
  // hin- und herswipen kann.
  const slotsWithOffers = range.slotRanges.filter((slot) => (bySlot.get(slot.id) || []).length > 0);
  const slotEntries = [];

  // EXPERIMENT: Überschrift, Lineal und Swipe-Hinweis stecken auf Mobile jetzt
  // als Kopie in der (sticky) Navbar (siehe updateNavRuler() unten) - deshalb
  // testweise hier weggelassen, um die Dopplung zu vermeiden.
  slotsWithOffers.forEach((slot) => {
    const entries = bySlot.get(slot.id);

    const section = document.createElement("section");
    section.className = "timeline-slot-section";
    section.id = `timeline-slot-${slot.id}`;

    const slotRange = { globalStartMin: slot.startMin, globalEndMin: slot.endMin };
    slotEntries.push({ slot, slotRange });
    section.appendChild(buildTimelineBlock(entries, slotRange, null, { includeRuler: false }));

    scroller.appendChild(section);
  });

  container.appendChild(scroller);

  // Springt beim Slot-Wechsel (Wischen) zurück an den oberen Rand der neuen
  // Section - sonst bleibt die Seite auf dem vertikalen Scroll-Stand vom
  // vorherigen Slot stehen und man landet z.B. nach dem Wischen von einem
  // weit heruntergescrollten "Nachmittag" mitten in der viel kürzeren "Pause"
  // auf leerer, grauer Fläche statt oben bei deren Inhalt. Erst NACH dem
  // Absetzen des Snap-Scrolls (debounced), damit es nicht mitten im Wischen
  // ruckelt.
  let lastSlotIndex = 0;
  let verticalResetTimer;

  // EXPERIMENT: Navbar-Kopie der Stunden-Skala auch auf Mobile - zeigt das
  // Lineal des Zeitraums, zu dem gerade hingeswipt wurde, und aktualisiert
  // sich beim Swipen. Dank Scroll-Snap ist "welcher Zeitraum ist gerade
  // sichtbar" hier eindeutig bestimmbar - der Abstand zwischen zwei Sections
  // wird direkt aus dem DOM gelesen (statt einfach scroller.clientWidth
  // anzunehmen), damit das unabhängig vom CSS immer stimmt.
  function updateNavRuler() {
    const headingEl = document.getElementById("nav-slot-heading");
    const hintEl = document.getElementById("nav-slot-hint");
    if (slotEntries.length === 0) {
      document.getElementById("nav-time-ruler-track")?.replaceChildren();
      if (headingEl) headingEl.innerHTML = "";
      if (hintEl) hintEl.innerHTML = "";
      return;
    }
    const sections = scroller.children;
    const step = sections.length > 1 ? sections[1].offsetLeft - sections[0].offsetLeft : scroller.clientWidth;
    const index = Math.round(scroller.scrollLeft / step) || 0;
    const clamped = Math.min(Math.max(index, 0), slotEntries.length - 1);
    const { slot, slotRange } = slotEntries[clamped];
    renderNavTimeRuler(slotRange);
    if (headingEl) {
      headingEl.innerHTML = `${slot.label}<span class="nav-slot-time">${slot.start} - ${slot.end} Uhr</span>`;
    }
    if (hintEl) {
      hintEl.textContent = slotEntries.length > 1 ? "Wischen für weitere Sessions" : "";
    }

    clearTimeout(verticalResetTimer);
    verticalResetTimer = setTimeout(() => {
      if (clamped !== lastSlotIndex) {
        lastSlotIndex = clamped;
        sections[clamped].scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
      }
    }, 120);
  }
  scroller.addEventListener("scroll", updateNavRuler, { passive: true });
  updateNavRuler();
}

function renderTimeline() {
  renderHeader();

  const range = computeTimelineRange();

  const offersWithRange = OFFERS.map((offer) => ({
    offer,
    ...getOfferRange(offer, range)
  }));

  const container = document.getElementById("timeline-container");
  container.innerHTML = "";

  const isMobile = window.matchMedia(MOBILE_QUERY).matches;
  if (isMobile) {
    renderTimelineBySlot(container, range, offersWithRange);
  } else {
    renderContinuousTimeline(container, range, offersWithRange);
    renderNavTimeRuler(range);
    const headingEl = document.getElementById("nav-slot-heading");
    if (headingEl) headingEl.innerHTML = "";
  }
}

// EXPERIMENT: Testweise Kopie der Stunden-Skala in die Navbar - bewusst erstmal
// nur eine Kopie neben dem echten Lineal im Zeitstrahl (noch nichts entfernt/
// verschoben). Nutzt dieselben Prozent-Positionen wie das echte Lineal (siehe
// buildRulerTicks()), damit die Marken exakt über dem Zeitstrahl darunter sitzen -
// das CSS gibt #nav-time-ruler-track dafür dieselbe effektive Breite wie <main>.
function renderNavTimeRuler(range) {
  const wrapper = document.getElementById("nav-time-ruler-track");
  if (!wrapper) return;

  wrapper.innerHTML = "";
  wrapper.appendChild(buildRulerTicks(range));
}

function openModal(offer, range) {
  const overlay = document.getElementById("modal-overlay");
  const imageSlot = document.getElementById("modal-image-inner");
  const slot = SLOTS.find((s) => s.id === offer.slotId);
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

  document.getElementById("modal-time").innerHTML =
    `<strong>${formatMinutesAsTime(range.startMin)} - ${formatMinutesAsTime(range.endMin)} Uhr</strong><span>Uhrzeit</span>`;
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
  renderTimeline();
  document.getElementById("loading-overlay")?.classList.add("hidden");

  // Bei Drehung/Fenstergröße neu rendern (z.B. Wechsel über/unter die Mobile-Schwelle).
  // Nur bei echter Breitenänderung - auf Mobile feuert "resize" nämlich auch,
  // wenn beim Scrollen nur die Adressleiste ein-/ausgeblendet wird (Höhe ändert
  // sich, Breite nicht); ein Neu-Rendern hätte sonst den Swipe-Fortschritt im
  // Zeitstrahl (Nachmittag/Pause/Abend) zurückgesetzt.
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderTimeline, 150);
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
});
