/*
  ============================================================
  image-resolver.js - Titelbilder für die Angebote finden
  ============================================================
  Wird von allen Seiten genutzt (Kacheln, Zeitstrahl, Pop-up).

  Suchreihenfolge für ein Angebot (der erste Treffer gewinnt):
    1. offer.image                    - falls im Angebot fest eingetragen
    2. Images/<Abenteuername>.<ext>   - Bild nur für dieses Abenteuer
    3. Images/Default/<System>.<ext>  - allgemeines Bild des Systems
    4. Images/Default/<System ohne Edition>.<ext>
                                      - z.B. "Dungeons & Dragons 5e" findet auch
                                        dungeons_and_dragons.webp
    5. Platzhalter: Farbverlauf (aus dem Systemnamen) mit dem Logo
  Als Endung wird webp, jpg, jpeg und png probiert.

  Dateinamen: komplett klein, Leerzeichen -> "_", Sonderzeichen entfallen, "&" -> "and"
    "Daggerheart"         -> Images/Default/daggerheart.webp
    "Cthulhu (Now)"       -> Images/Default/cthulhu_now.webp
    "Eldershard (D&D 5e)" -> Images/Default/eldershard_dandd_5e.webp
  Neue Bilder gehören nach Images-Originale/ (siehe optimize-images.ps1), nicht
  direkt nach Images/.

  Mit buildImageMarkup(..., { defaultOnly: true }) wird auch das Abenteuer-Bild nur
  in Images/Default/ gesucht (das Pausenangebot soll kein eigenes Bild bekommen).

  Seiten außerhalb des Hauptordners (z.B. pages/timeline.html) müssen VOR dieser
  Datei die Variable ASSET_BASE setzen (z.B. "../"), damit die Bildpfade stimmen.
*/

const ASSET_PREFIX = typeof ASSET_BASE !== "undefined" ? ASSET_BASE : "";
const IMAGE_FOLDER = `${ASSET_PREFIX}Images`;
const DEFAULT_IMAGE_FOLDER = `${ASSET_PREFIX}Images/Default`;
const IMAGE_EXTENSIONS = ["webp", "jpg", "jpeg", "png"];

// Stabiler Farbverlauf aus einem Text: gleicher Systemname = immer gleiche Farbe
function hashColor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 55%, 32%), hsl(${hue2}, 55%, 18%))`;
}

// Macht einen Text sicher für die Verwendung in einem HTML-Attribut
function escapeAttr(text) {
  return String(text || "").replace(/"/g, "&quot;");
}

// Macht aus einem Abenteuer-/Systemnamen den Dateinamen-Teil: nur Buchstaben und
// Zahlen bleiben (Klammern, Doppelpunkte etc. entfallen), alles klein, "&" wird
// vorher zu "and" ("D&D" und "D and D" führen so zum selben Namen).
function slugifyForImage(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "_");
}

// Alle Dateipfade eines Namens in einem Ordner, einer je Endung
function pathsWithExtensions(folder, slug) {
  return IMAGE_EXTENSIONS.map((ext) => `${folder}/${encodeURIComponent(slug)}.${ext}`);
}

// Alle Bildpfade, die für ein Angebot in Frage kommen, in Suchreihenfolge.
function buildImageCandidates(offer, options) {
  const titleFolder = options && options.defaultOnly ? DEFAULT_IMAGE_FOLDER : IMAGE_FOLDER;
  const titleSlug = slugifyForImage(offer.title);
  const systemSlug = slugifyForImage(offer.system);
  const candidates = [];

  if (titleSlug) candidates.push(...pathsWithExtensions(titleFolder, titleSlug));

  if (systemSlug && systemSlug !== titleSlug) {
    candidates.push(...pathsWithExtensions(DEFAULT_IMAGE_FOLDER, systemSlug));
    // Zusätzlich ohne angehängte Edition/Versionsnummer ("..._5e", "..._7e", "..._5"),
    // damit ein Bild pro System für alle Editionen reicht.
    const withoutEdition = systemSlug.replace(/(_\d+[a-z]{0,2})+$/, "");
    if (withoutEdition && withoutEdition !== systemSlug) {
      candidates.push(...pathsWithExtensions(DEFAULT_IMAGE_FOLDER, withoutEdition));
    }
  }
  return candidates;
}

// Platzhalter-Inhalt: das Logo statt des Systemnamens (der steht in Karte und
// Pop-up ohnehin schon als Text daneben und würde sich sonst doppelt überlagern).
function placeholderLogoMarkup() {
  return `<img class="placeholder-logo" src="${DEFAULT_IMAGE_FOLDER}/gc_logo.png" alt="">`;
}

// Wird per onerror vom <img> aufgerufen: probiert die nächste Variante aus
// data-remaining und ersetzt das Bild erst durch den Platzhalter, wenn nichts übrig ist.
function handleImageError(imgEl) {
  const remaining = JSON.parse(decodeURIComponent(imgEl.dataset.remaining));
  if (remaining.length > 0) {
    const [next, ...rest] = remaining;
    imgEl.dataset.remaining = encodeURIComponent(JSON.stringify(rest));
    imgEl.src = next;
    return;
  }
  const placeholder = document.createElement("div");
  placeholder.className = imgEl.dataset.placeholderClass;
  placeholder.style.background = hashColor(imgEl.dataset.system);
  placeholder.innerHTML = placeholderLogoMarkup();
  imgEl.replaceWith(placeholder);
}

// Liefert das fertige HTML für das Titelbild eines Angebots: ein <img>, das bei
// Fehlern selbstständig die nächste Variante probiert (und am Ende zum Platzhalter
// wird), oder direkt den Platzhalter, wenn es keine Kandidaten gibt.
// imgClass / placeholderClass sind die CSS-Klassen des Bildes bzw. des Platzhalters.
function buildImageMarkup(offer, imgClass, placeholderClass, options) {
  const candidates = offer.image ? [offer.image] : buildImageCandidates(offer, options);

  if (candidates.length === 0) {
    return `<div class="${placeholderClass}" style="background:${hashColor(offer.system)}">${placeholderLogoMarkup()}</div>`;
  }

  return `<img class="${imgClass}" src="${candidates[0]}" alt="${escapeAttr(offer.system)}"
            data-remaining="${encodeURIComponent(JSON.stringify(candidates.slice(1)))}"
            data-system="${escapeAttr(offer.system)}"
            data-placeholder-class="${placeholderClass}"
            onerror="handleImageError(this)">`;
}
