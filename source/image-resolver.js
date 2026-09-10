// Löst Titelbilder für Angebote auf und wird von script.js UND timeline.js genutzt.
//
// Reihenfolge der Bildsuche für ein Angebot:
//   1. offer.image (falls in data.js/Sheet manuell gesetzt) - hat immer Vorrang
//   2. Images/<Name des Abenteuers>.<jpg|jpeg|png|webp>          (abenteuerspezifisches Bild)
//   3. Images/Default/<System>.<jpg|jpeg|png|webp>               (allgemeines System-Bild)
//   4. automatischer Farbverlauf-Platzhalter mit Systemnamen
//
// Mit buildImageMarkup(offer, imgClass, placeholderClass, { defaultOnly: true })
// wird NUR in Images/Default/ gesucht (nicht in Images/) - erst nach dem Namen
// des Angebots, dann nach dem System. Genutzt fürs Pausenangebot, das kein
// eigenes Bild im Haupt-Ordner haben soll.
//
// Der Dateiname muss dabei dem Text aus "Name des Abenteuers" bzw. "System"
// entsprechen, aber komplett klein geschrieben sein - Leerzeichen werden zu
// Unterstrichen, Klammern/Sonderzeichen entfernt, "&" wird zu "and".
// Beispiel: System "Daggerheart" -> Images/Default/daggerheart.webp
// Beispiel: System "Cthulhu (Now)" -> Images/Default/cthulhu_now.webp
// Beispiel: System "Eldershard (D&D 5e)" -> Images/Default/eldershard_dandd_5e.webp
//
// Seiten außerhalb des Projekt-Hauptordners (z.B. pages/timeline.html) müssen VOR
// dieser Datei ein globales ASSET_BASE setzen (z.B. "../"), damit die Bild-Pfade
// trotzdem auf den echten Images-Ordner im Hauptordner zeigen.

const ASSET_PREFIX = typeof ASSET_BASE !== "undefined" ? ASSET_BASE : "";
const IMAGE_FOLDER = `${ASSET_PREFIX}Images`;
const DEFAULT_IMAGE_FOLDER = `${ASSET_PREFIX}Images/Default`;
const IMAGE_EXTENSIONS = ["webp", "jpg", "jpeg", "png"];

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 55%, 32%), hsl(${hue2}, 55%, 18%))`;
}

function escapeAttr(str) {
  return String(str || "").replace(/"/g, "&quot;");
}

// Macht aus einem Abenteuer-/Systemnamen einen dateisystem-/URL-tauglichen Namen.
// Es bleiben nur Buchstaben/Zahlen übrig (Klammern, Doppelpunkte, Sonderzeichen
// etc. werden komplett entfernt statt einzeln aufgezählt), alles wird klein
// geschrieben. "&" wird vorher zu "and", damit "D&D" und "D and D" auf
// denselben Dateinamen führen. Bilddateien müssen daher komplett klein
// geschrieben sein (z.B. "Cthulhu (Now)" -> Images/Default/cthulhu_now.jpg).
function slugifyForImage(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "_");
}

// options.defaultOnly: true -> überspringt die abenteuerspezifische Suche in
// Images/ und sucht nur in Images/Default/<System> (z.B. fürs Pausenangebot,
// dessen Titel sich jede Woche ändert und daher kein eigenes Bild braucht).
function buildImageCandidates(offer, options) {
  const opts = options || {};
  const candidates = [];
  const titleSlug = slugifyForImage(offer.title);
  const systemSlug = slugifyForImage(offer.system);
  const titleFolder = opts.defaultOnly ? DEFAULT_IMAGE_FOLDER : IMAGE_FOLDER;

  if (titleSlug) {
    IMAGE_EXTENSIONS.forEach((ext) => {
      candidates.push(`${titleFolder}/${encodeURIComponent(titleSlug)}.${ext}`);
    });
  }
  if (systemSlug && systemSlug !== titleSlug) {
    IMAGE_EXTENSIONS.forEach((ext) => {
      candidates.push(`${DEFAULT_IMAGE_FOLDER}/${encodeURIComponent(systemSlug)}.${ext}`);
    });
  }
  return candidates;
}

// Wird per onerror auf dem <img> aufgerufen: probiert die nächste Bild-Variante,
// und ersetzt das <img> erst durch den Farbplatzhalter, wenn nichts mehr übrig ist.
function handleImageError(imgEl) {
  const remaining = JSON.parse(decodeURIComponent(imgEl.dataset.remaining || "%5B%5D"));
  if (remaining.length > 0) {
    const [next, ...rest] = remaining;
    imgEl.dataset.remaining = encodeURIComponent(JSON.stringify(rest));
    imgEl.src = next;
    return;
  }
  const div = document.createElement("div");
  div.className = imgEl.dataset.placeholderClass;
  div.style.background = hashColor(imgEl.dataset.system);
  div.textContent = imgEl.dataset.system;
  imgEl.replaceWith(div);
}

function buildImageMarkup(offer, imgClass, placeholderClass, options) {
  if (offer.image) {
    return `<img class="${imgClass}" src="${offer.image}" alt="${escapeAttr(offer.system)}"
              onerror="this.outerHTML = '<div class=&quot;${placeholderClass}&quot; style=&quot;background:${hashColor(offer.system)}&quot;>${offer.system}</div>'">`;
  }

  const candidates = buildImageCandidates(offer, options);
  if (candidates.length === 0) {
    return `<div class="${placeholderClass}" style="background:${hashColor(offer.system)}">${offer.system}</div>`;
  }

  const remaining = candidates.slice(1);
  return `<img class="${imgClass}" src="${candidates[0]}" alt="${escapeAttr(offer.system)}"
            data-remaining="${encodeURIComponent(JSON.stringify(remaining))}"
            data-system="${escapeAttr(offer.system)}"
            data-placeholder-class="${placeholderClass}"
            onerror="handleImageError(this)">`;
}
