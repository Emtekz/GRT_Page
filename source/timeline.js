/*
  ============================================================
  timeline.js - Zeitstrahl-Ansicht (pages/timeline.html)
  ============================================================
  Stellt die Angebote als Zeitstrahl dar: jede Zeile ist eine Spur, ein Angebot
  ein Balken, dessen Position und Breite sich aus Start- und Endzeit ergibt.

  - Desktop:  EIN durchgehender Zeitstrahl über den ganzen Tag.
  - Mobile:   pro Zeitslot ein eigener Mini-Zeitstrahl, die Slots liegen
              nebeneinander und lassen sich wischen (Scroll-Snap).
  - Die Stunden-Skala sitzt in der Navbar (#nav-time-ruler) und bleibt dort beim
    Scrollen stehen; auf Mobile zeigt sie den Zeitraum des aktuellen Slots.

  Pop-up und Seitenstart kommen aus shared.js, Slot-Zeiträume aus sheet-loader.js
  (computeSlotRanges), Bilder aus image-resolver.js.
*/

const ROW_HEIGHT = 100; // Höhe je Zeile im Zeitstrahl (px)
const ROW_GAP = 12; // Lücke zwischen den Zeilen (px), auch oberhalb der ersten Zeile

// Unterhalb dieser Breite gilt die Mobile-Variante (muss zum Breakpoint in
// timeline.css passen). Ein durchgehender Tag (13:00-00:00) wäre auf einem
// Handy zu schmal, deshalb dort ein Mini-Zeitstrahl pro Slot.
const MOBILE_QUERY = "(max-width: 700px)";

// ------------------------------------------------------------
// Zeit-Berechnung
// ------------------------------------------------------------

// 810 -> "13:30" (Werte über 24:00 laufen wieder bei 00:00 los)
function formatMinutesAsTime(minutes) {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

// Start-/Endzeit eines Angebots in Minuten auf der Zeitachse (siehe computeSlotRanges)
function getOfferRange(offer, range) {
  const times = offerTimes(offer);
  return {
    startMin: range.normalize(timeToMinutes(times.start)),
    endMin: range.normalize(timeToMinutes(times.end))
  };
}

// Minuten -> Position auf der Achse in Prozent (0% = Anfang, 100% = Ende)
function toPercent(minutes, range) {
  return ((minutes - range.globalStartMin) / (range.globalEndMin - range.globalStartMin)) * 100;
}

// Alle vollen Stunden innerhalb der Achse, z.B. [780, 840, ...] für 13:00, 14:00, ...
function hourTicks(range) {
  const ticks = [];
  for (let tick = Math.ceil(range.globalStartMin / 60) * 60; tick <= range.globalEndMin; tick += 60) {
    ticks.push(tick);
  }
  return ticks;
}

// Verteilt die Angebote auf Zeilen: überlappende Angebote kommen in verschiedene
// Zeilen. Angebote derselben Spielleitung (offer.gmKey) landen nach Möglichkeit
// immer in derselben Zeile, damit ihr Tagesablauf zusammenhängend zu sehen ist -
// der Name selbst wird dabei nirgends angezeigt.
function assignRows(offersWithRange) {
  const rowEnds = []; // Endzeit des zuletzt platzierten Angebots je Zeile
  const rowIndexByGm = new Map();

  function findFreeRow(startMin) {
    const index = rowEnds.findIndex((endMin) => endMin <= startMin);
    return index === -1 ? rowEnds.length : index;
  }

  const placed = offersWithRange
    .slice()
    .sort((a, b) => a.startMin - b.startMin)
    .map((entry) => {
      const gmKey = (entry.offer.gmKey || "").trim();
      let rowIndex = gmKey ? rowIndexByGm.get(gmKey) : undefined;

      // Die Zeile der Spielleitung ist belegt (oder es gibt noch keine): freie suchen
      if (rowIndex === undefined || rowEnds[rowIndex] > entry.startMin) {
        rowIndex = findFreeRow(entry.startMin);
        if (gmKey) rowIndexByGm.set(gmKey, rowIndex);
      }

      rowEnds[rowIndex] = entry.endMin;
      return { ...entry, rowIndex };
    });

  return { placed, rowCount: rowEnds.length };
}

// ------------------------------------------------------------
// Zeitstrahl aufbauen
// ------------------------------------------------------------

// Stunden-Marken für ein Lineal. Die äußerste linke/rechte Marke wird an der Kante
// ausgerichtet statt zentriert, damit sie nicht über den Rand hinausragt.
function buildRulerTicks(range) {
  const ticks = hourTicks(range);
  const fragment = document.createDocumentFragment();
  ticks.forEach((tick, i) => {
    const tickEl = document.createElement("div");
    const edgeClass = i === 0 ? " timeline-tick--first" : i === ticks.length - 1 ? " timeline-tick--last" : "";
    tickEl.className = `timeline-tick${edgeClass}`;
    tickEl.style.left = `${toPercent(tick, range)}%`;
    tickEl.textContent = formatMinutesAsTime(tick);
    fragment.appendChild(tickEl);
  });
  return fragment;
}

// Ein Balken für ein Angebot (Bild/Farbverlauf als Hintergrund, Text darüber)
function buildTimelineBar(placed, range) {
  const offer = placed.offer;
  const left = toPercent(placed.startMin, range);

  const bar = document.createElement("div");
  bar.className = "timeline-bar";
  bar.style.left = `${left}%`;
  bar.style.width = `${toPercent(placed.endMin, range) - left}%`;
  bar.style.top = `${placed.rowIndex * ROW_HEIGHT + ROW_GAP}px`;
  bar.style.height = `${ROW_HEIGHT - ROW_GAP}px`;
  makeOpenable(bar, offer, { start: formatMinutesAsTime(placed.startMin), end: formatMinutesAsTime(placed.endMin) });

  bar.innerHTML = `
    ${buildImageMarkup(offer, "offer-image", "offer-placeholder", getImageOptions(offer))}
    <div class="offer-overlay"></div>
    <div class="timeline-bar-body">
      <div class="timeline-bar-header-row">
        <span class="timeline-bar-system">${escapeHtml(offer.system)}</span>
        ${languageFlagMarkup(offer, "timeline-bar-language")}
      </div>
      <div class="timeline-bar-title">${escapeHtml(offer.title)}</div>
      ${buildFillBarMarkup(offer)}
    </div>
  `;
  return bar;
}

// Ein kompletter Zeitstrahl-Block für den Zeitraum `range` (Gitterlinien, optionale
// Pausen-Bänder, Angebots-Balken). `offersWithRange` sind Einträge {offer, startMin,
// endMin} auf derselben Achse. `breakBands` ({startMin, endMin}) werden als gestreifte
// Flächen hinterlegt - nur beim durchgehenden Desktop-Zeitstrahl nötig, auf Mobile
// ist die Pause ein eigener Block.
function buildTimelineBlock(offersWithRange, range, breakBands) {
  const { placed, rowCount } = assignRows(offersWithRange);

  const wrapper = document.createElement("div");
  wrapper.className = "timeline-wrapper";

  const track = document.createElement("div");
  track.className = "timeline-track";
  track.style.height = `${Math.max(rowCount, 1) * ROW_HEIGHT + ROW_GAP}px`;

  hourTicks(range).forEach((tick) => {
    const line = document.createElement("div");
    line.className = "timeline-gridline";
    line.style.left = `${toPercent(tick, range)}%`;
    track.appendChild(line);
  });

  (breakBands || []).forEach((band) => {
    const left = toPercent(band.startMin, range);
    const bandEl = document.createElement("div");
    bandEl.className = "timeline-break";
    bandEl.style.left = `${left}%`;
    bandEl.style.width = `${toPercent(band.endMin, range) - left}%`;
    bandEl.innerHTML = "<span>Pause</span>";
    track.appendChild(bandEl);
  });

  placed.forEach((entry) => track.appendChild(buildTimelineBar(entry, range)));

  wrapper.appendChild(track);
  return wrapper;
}

// Desktop: ein durchgehender Zeitstrahl über den ganzen Tag. Lücken zwischen den
// Slots und als Pause markierte Slots werden als Bänder hinterlegt.
function renderContinuousTimeline(container, range, offersWithRange) {
  const breakBands = [];

  const sortedSlots = range.slotRanges.slice().sort((a, b) => a.startMin - b.startMin);
  for (let i = 0; i < sortedSlots.length - 1; i++) {
    const gapStart = sortedSlots[i].endMin;
    const gapEnd = sortedSlots[i + 1].startMin;
    if (gapEnd > gapStart) breakBands.push({ startMin: gapStart, endMin: gapEnd });
  }
  range.slotRanges
    .filter((slot) => slot.isBreak)
    .forEach((slot) => breakBands.push({ startMin: slot.startMin, endMin: slot.endMin }));

  container.appendChild(buildTimelineBlock(offersWithRange, range, breakBands));
}

// Mobile: pro Slot ein eigener, auf volle Breite skalierter Mini-Zeitstrahl. Alle
// Slots liegen nebeneinander in einem horizontal wischbaren Streifen (Scroll-Snap),
// vertikal scrollt die ganze Seite. Slots ohne Angebote (z.B. eine Pause ohne
// Programm) entfallen, damit man direkt zwischen Slots mit Programm wischen kann.
function renderTimelineBySlot(container, range, offersWithRange) {
  const scroller = document.createElement("div");
  scroller.className = "timeline-slot-scroller";

  const slotEntries = []; // {slot, slotRange} je Section, gleiche Reihenfolge wie im Streifen
  range.slotRanges.forEach((slot) => {
    const entries = offersWithRange.filter((entry) => entry.offer.slotId === slot.id);
    if (entries.length === 0) return;

    // Jeder Slot bekommt eine eigene Achse von seinem Anfang bis zu seinem Ende
    const slotRange = { globalStartMin: slot.startMin, globalEndMin: slot.endMin };
    slotEntries.push({ slot, slotRange });

    const section = document.createElement("section");
    section.className = "timeline-slot-section";
    section.id = `timeline-slot-${slot.id}`;
    section.appendChild(buildTimelineBlock(entries, slotRange));
    scroller.appendChild(section);
  });
  container.appendChild(scroller);

  // Navbar passend zum Slot beschriften, zu dem gerade hingewischt wurde: Name +
  // Zeitspanne, Wisch-Hinweis und Stunden-Skala. Dank Scroll-Snap ist der aktuelle
  // Slot eindeutig. Der Abstand zweier Sections wird aus dem DOM gelesen (statt
  // scroller.clientWidth anzunehmen), damit es unabhängig vom CSS stimmt.
  function updateNavForCurrentSlot() {
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
    const { slot, slotRange } = slotEntries[Math.min(Math.max(index, 0), slotEntries.length - 1)];

    renderNavTimeRuler(slotRange);
    if (headingEl) {
      headingEl.innerHTML = `${slot.label}<span class="nav-slot-time">${formatSlotTime(slot)}</span>`;
    }
    if (hintEl) {
      hintEl.textContent = slotEntries.length > 1 ? "Wischen für weitere Sessions" : "";
    }
  }

  scroller.addEventListener("scroll", updateNavForCurrentSlot, { passive: true });
  updateNavForCurrentSlot();
}

// Stunden-Skala in der Navbar. Nutzt dieselben Prozent-Positionen wie der Zeitstrahl
// darunter (buildRulerTicks); das CSS gibt #nav-time-ruler-track dafür dieselbe
// Breite wie <main>, damit die Marken exakt über den Gitterlinien sitzen.
function renderNavTimeRuler(range) {
  const track = document.getElementById("nav-time-ruler-track");
  if (!track) return;
  track.innerHTML = "";
  track.appendChild(buildRulerTicks(range));
}

// Baut die Seite je nach Bildschirmbreite als Desktop- oder Mobile-Zeitstrahl.
function renderTimeline() {
  renderEventHeader();

  const range = computeSlotRanges();
  const offersWithRange = OFFERS.map((offer) => ({ offer, ...getOfferRange(offer, range) }));

  const container = document.getElementById("timeline-container");
  container.innerHTML = "";

  if (window.matchMedia(MOBILE_QUERY).matches) {
    renderTimelineBySlot(container, range, offersWithRange);
  } else {
    renderContinuousTimeline(container, range, offersWithRange);
    renderNavTimeRuler(range);
    const headingEl = document.getElementById("nav-slot-heading");
    if (headingEl) headingEl.innerHTML = "";
  }
}

// Rendert bei Drehung/Fenstergröße neu (z.B. beim Wechsel über/unter die Mobile-
// Schwelle). Nur bei echter BREITENänderung: Auf dem Handy feuert "resize" auch,
// wenn beim Scrollen nur die Adressleiste ein-/ausgeblendet wird (Höhe ändert sich,
// Breite nicht) - ein Neu-Rendern würde sonst den Wisch-Fortschritt zurücksetzen.
function rerenderOnWidthChange() {
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderTimeline, 150);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await initPage(renderTimeline);
  rerenderOnWidthChange();
});
