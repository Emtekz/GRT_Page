// Experimentelle Seitenaufbauten (pages/experimente/aufbau.html?layout=...).
// Nutzt dieselben Daten, dasselbe Pop-up und denselben Ladescreen wie die
// normale Kachelansicht (script.js ruft window.renderExperimentLayout() statt
// renderDashboard() auf, wenn es existiert) - hier steht nur das Rendering.

const LAYOUTS = {
  poster: { label: "Poster-Wand", render: renderPosterWall },
  programm: { label: "Programmheft", render: renderProgram },
  reihen: { label: "Reihen", render: renderRails }
};

const layoutParam = new URLSearchParams(location.search).get("layout");
const activeLayout = Object.prototype.hasOwnProperty.call(LAYOUTS, layoutParam) ? layoutParam : "poster";

window.renderExperimentLayout = function () {
  document.getElementById("event-title").textContent = EVENT_INFO.title;
  document.getElementById("event-date").textContent = EVENT_INFO.date;
  document.getElementById("event-location").textContent = EVENT_INFO.location;

  document.getElementById("lx-switch").innerHTML = Object.keys(LAYOUTS)
    .map((key) => `<a href="?layout=${key}"${key === activeLayout ? ' class="active"' : ""}>${LAYOUTS[key].label}</a>`)
    .join("");

  const root = document.getElementById("lx-root");
  root.className = `lx-root lx-${activeLayout}`;
  LAYOUTS[activeLayout].render(root);
};

// Angebote je Slot (Reihenfolge wie in SLOTS, darin nach Startzeit sortiert),
// Slots ohne Angebote entfallen
function offersBySlot() {
  return SLOTS.map((slot) => ({
    slot,
    offers: OFFERS.filter((o) => o.slotId === slot.id).sort((a, b) => (a.startTime || slot.start).localeCompare(b.startTime || slot.start))
  })).filter((g) => g.offers.length > 0);
}

function lxImage(offer, slot) {
  const options = slot.isBreak ? { defaultOnly: true } : undefined;
  return buildImageMarkup(offer, "lx-img", "lx-placeholder", options);
}

function lxFlag(offer) {
  return offer.language === "ENG" ? `<img class="lx-flag" src="${DEFAULT_IMAGE_FOLDER}/englisch.png" alt="Englisch">` : "";
}

function lxSlotTime(slot) {
  return `${slot.start} - ${slot.end} Uhr`;
}

// Macht ein Element klick- und tastaturbedienbar (öffnet das Pop-up)
function lxMakeOpenable(el, offer) {
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${offer.system}: ${offer.title} - Details anzeigen`);
  el.addEventListener("click", () => openModal(offer));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal(offer);
    }
  });
}

// 1) Poster-Wand: hohe Plakat-Karten, oben Filter-Chips pro Slot
function renderPosterWall(root) {
  const groups = offersBySlot();
  const chips = [`<button class="lx-chip active" data-slot="all">Alle <span>${OFFERS.length}</span></button>`]
    .concat(groups.map((g) => `<button class="lx-chip" data-slot="${g.slot.id}">${g.slot.label} <span>${g.offers.length}</span></button>`))
    .join("");
  root.innerHTML = `<div class="lx-chips">${chips}</div><div class="lx-poster-grid"></div>`;

  const grid = root.querySelector(".lx-poster-grid");
  groups.forEach(({ slot, offers }) => {
    offers.forEach((offer) => {
      const card = document.createElement("article");
      card.className = "lx-poster-card";
      card.dataset.slot = slot.id;
      card.innerHTML = `
        ${lxImage(offer, slot)}
        <div class="lx-shade"></div>
        <span class="lx-time-pill">${formatTimeRange(offer, "")}</span>
        <div class="lx-poster-body">
          <div class="lx-system-row"><span class="lx-system">${escapeHtml(offer.system)}</span>${lxFlag(offer)}</div>
          <h3>${escapeHtml(offer.title)}</h3>
          ${buildFillBarMarkup(offer)}
        </div>`;
      lxMakeOpenable(card, offer);
      grid.appendChild(card);
    });
  });

  root.querySelector(".lx-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".lx-chip");
    if (!chip) return;
    root.querySelectorAll(".lx-chip").forEach((c) => c.classList.toggle("active", c === chip));
    grid.querySelectorAll(".lx-poster-card").forEach((card) => {
      card.hidden = chip.dataset.slot !== "all" && card.dataset.slot !== chip.dataset.slot;
    });
  });
}

// 2) Programmheft: ruhige Liste mit großer Uhrzeit links, wie ein gedruckter Ablaufplan
function renderProgram(root) {
  root.innerHTML = offersBySlot()
    .map(({ slot }) => `<section class="lx-prog-slot" data-slot="${slot.id}"><h2>${slot.label}<small>${lxSlotTime(slot)}</small></h2><ol></ol></section>`)
    .join("");

  offersBySlot().forEach(({ slot, offers }) => {
    const list = root.querySelector(`[data-slot="${slot.id}"] ol`);
    offers.forEach((offer) => {
      const row = document.createElement("li");
      row.className = "lx-prog-row";
      const end = offer.endTime || slot.end;
      const start = offer.startTime || slot.start;
      row.innerHTML = `
        <div class="lx-prog-time"><strong>${start}</strong><span>${end}</span></div>
        <div class="lx-prog-thumb">${lxImage(offer, slot)}</div>
        <div class="lx-prog-main">
          <div class="lx-system-row"><span class="lx-system">${escapeHtml(offer.system)}</span>${lxFlag(offer)}</div>
          <h3>${escapeHtml(offer.title)}</h3>
        </div>
        <div class="lx-prog-side">
          <span>${hasFillInfo(offer) ? `${offer.currentPlayers} / ${offer.maxPlayers}` : `max. ${offer.maxPlayers}`}</span>
          ${buildFillBarMarkup(offer)}
        </div>`;
      lxMakeOpenable(row, offer);
      list.appendChild(row);
    });
  });
}

// 3) Reihen: pro Slot eine horizontal wischbare Reihe breiter Karten (wie bei Streaming-Diensten)
function renderRails(root) {
  root.innerHTML = offersBySlot()
    .map(({ slot }) => `<section class="lx-rail" data-slot="${slot.id}"><h2>${slot.label}<small>${lxSlotTime(slot)}</small></h2><div class="lx-rail-track"></div></section>`)
    .join("");

  offersBySlot().forEach(({ slot, offers }) => {
    const track = root.querySelector(`[data-slot="${slot.id}"] .lx-rail-track`);
    offers.forEach((offer) => {
      const card = document.createElement("article");
      card.className = "lx-rail-card";
      card.innerHTML = `
        ${lxImage(offer, slot)}
        <div class="lx-shade"></div>
        <span class="lx-time-pill">${formatTimeRange(offer, "")}</span>
        <div class="lx-rail-body">
          <div class="lx-system-row"><span class="lx-system">${escapeHtml(offer.system)}</span>${lxFlag(offer)}</div>
          <h3>${escapeHtml(offer.title)}</h3>
          ${buildFillBarMarkup(offer)}
        </div>`;
      lxMakeOpenable(card, offer);
      track.appendChild(card);
    });
  });
}
