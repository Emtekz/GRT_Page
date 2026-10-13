/*
  ============================================================
  experimente-layouts.js - Aufbau-Experimente (pages/experimente/aufbau.html)
  ============================================================
  Drei komplett andere Anordnungen derselben Angebote. Gewählt wird per Adresse:
  aufbau.html?layout=poster | programm | reihen

  Daten, Pop-up und Seitenstart kommen aus shared.js, die Optik aus
  styles/experimente/layouts.css (alle Klassen dort mit "lx-" Präfix).
  Ein neuer Aufbau braucht nur eine render-Funktion und einen Eintrag in LAYOUTS.
*/

const LAYOUTS = {
  poster: { label: "Poster-Wand", render: renderPosterWall },
  programm: { label: "Programmheft", render: renderProgram },
  reihen: { label: "Reihen", render: renderRails }
};

const layoutParam = new URLSearchParams(location.search).get("layout");
const activeLayout = Object.prototype.hasOwnProperty.call(LAYOUTS, layoutParam) ? layoutParam : "poster";

// Kopf, Umschalter und der gewählte Aufbau
function renderExperimentLayout() {
  renderEventHeader();

  document.getElementById("lx-switch").innerHTML = Object.keys(LAYOUTS)
    .map((key) => `<a href="?layout=${key}"${key === activeLayout ? ' class="active"' : ""}>${LAYOUTS[key].label}</a>`)
    .join("");

  const root = document.getElementById("lx-root");
  root.className = `lx-root lx-${activeLayout}`;
  LAYOUTS[activeLayout].render(root);
}

// ------------------------------------------------------------
// Gemeinsame Helfer
// ------------------------------------------------------------

// Angebote je Slot (Reihenfolge wie in SLOTS, darin nach Startzeit sortiert);
// Slots ohne Angebote entfallen.
function offersBySlot() {
  return SLOTS.map((slot) => ({
    slot,
    offers: OFFERS.filter((offer) => offer.slotId === slot.id).sort((a, b) => offerTimes(a).start.localeCompare(offerTimes(b).start))
  })).filter((group) => group.offers.length > 0);
}

// Titelbild bzw. Platzhalter als Hintergrund eines Elements (füllt es per CSS aus)
function layoutImage(offer) {
  return buildImageMarkup(offer, "lx-img", "lx-placeholder", getImageOptions(offer));
}

// Zeile mit Systemname und (bei englischen Angeboten) Flagge
function systemRowMarkup(offer) {
  return `<div class="lx-system-row"><span class="lx-system">${escapeHtml(offer.system)}</span>${languageFlagMarkup(offer, "lx-flag")}</div>`;
}

// ------------------------------------------------------------
// 1) Poster-Wand: hohe Plakat-Karten, oben Filter-Chips pro Slot
// ------------------------------------------------------------

function renderPosterWall(root) {
  const groups = offersBySlot();
  const chips = [`<button class="lx-chip active" data-slot="all">Alle <span>${OFFERS.length}</span></button>`]
    .concat(groups.map(({ slot, offers }) => `<button class="lx-chip" data-slot="${slot.id}">${slot.label} <span>${offers.length}</span></button>`))
    .join("");
  root.innerHTML = `<div class="lx-chips">${chips}</div><div class="lx-poster-grid"></div>`;

  const grid = root.querySelector(".lx-poster-grid");
  groups.forEach(({ slot, offers }) => {
    offers.forEach((offer) => {
      const card = document.createElement("article");
      card.className = "lx-poster-card";
      card.dataset.slot = slot.id;
      card.innerHTML = `
        ${layoutImage(offer)}
        <div class="lx-shade"></div>
        <span class="lx-time-pill">${formatTimeRange(offerTimes(offer), "")}</span>
        <div class="lx-poster-body">
          ${systemRowMarkup(offer)}
          <h3>${escapeHtml(offer.title)}</h3>
          ${buildFillBarMarkup(offer)}
        </div>`;
      makeOpenable(card, offer);
      grid.appendChild(card);
    });
  });

  // Filter: blendet Karten anderer Slots aus
  root.querySelector(".lx-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".lx-chip");
    if (!chip) return;
    root.querySelectorAll(".lx-chip").forEach((other) => other.classList.toggle("active", other === chip));
    grid.querySelectorAll(".lx-poster-card").forEach((card) => {
      card.hidden = chip.dataset.slot !== "all" && card.dataset.slot !== chip.dataset.slot;
    });
  });
}

// ------------------------------------------------------------
// 2) Programmheft: ruhige Liste mit großer Uhrzeit links, wie ein gedruckter Ablaufplan
// ------------------------------------------------------------

function renderProgram(root) {
  const groups = offersBySlot();
  root.innerHTML = groups
    .map(({ slot }) => `<section class="lx-prog-slot" data-slot="${slot.id}"><h2>${slot.label}<small>${formatSlotTime(slot)}</small></h2><ol></ol></section>`)
    .join("");

  groups.forEach(({ slot, offers }) => {
    const list = root.querySelector(`[data-slot="${slot.id}"] ol`);
    offers.forEach((offer) => {
      const times = offerTimes(offer);
      const row = document.createElement("li");
      row.className = "lx-prog-row";
      row.innerHTML = `
        <div class="lx-prog-time"><strong>${times.start}</strong><span>${times.end}</span></div>
        <div class="lx-prog-thumb">${layoutImage(offer)}</div>
        <div class="lx-prog-main">
          ${systemRowMarkup(offer)}
          <h3>${escapeHtml(offer.title)}</h3>
        </div>
        <div class="lx-prog-side">
          <span>${hasFillInfo(offer) ? `${offer.currentPlayers} / ${offer.maxPlayers}` : `max. ${offer.maxPlayers}`}</span>
          ${buildFillBarMarkup(offer)}
        </div>`;
      makeOpenable(row, offer);
      list.appendChild(row);
    });
  });
}

// ------------------------------------------------------------
// 3) Reihen: pro Slot eine horizontal wischbare Reihe breiter Karten (wie bei Streaming-Diensten)
// ------------------------------------------------------------

function renderRails(root) {
  const groups = offersBySlot();
  root.innerHTML = groups
    .map(({ slot }) => `<section class="lx-rail" data-slot="${slot.id}"><h2>${slot.label}<small>${formatSlotTime(slot)}</small></h2><div class="lx-rail-track"></div></section>`)
    .join("");

  groups.forEach(({ slot, offers }) => {
    const track = root.querySelector(`[data-slot="${slot.id}"] .lx-rail-track`);
    offers.forEach((offer) => {
      const card = document.createElement("article");
      card.className = "lx-rail-card";
      card.innerHTML = `
        ${layoutImage(offer)}
        <div class="lx-shade"></div>
        <span class="lx-time-pill">${formatTimeRange(offerTimes(offer), "")}</span>
        <div class="lx-rail-body">
          ${systemRowMarkup(offer)}
          <h3>${escapeHtml(offer.title)}</h3>
          ${buildFillBarMarkup(offer)}
        </div>`;
      makeOpenable(card, offer);
      track.appendChild(card);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => initPage(renderExperimentLayout));
