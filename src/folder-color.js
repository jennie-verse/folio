/* folder-color.js — which pastel hue a folder wears.

   WebApp_House_Style 2-1 (rainbow extension, applied to folio on 2026-09-18).
   The brand colour stays pink; these hues only tell folders apart — on the
   folder tabs, the selected-folder bar and the folder badge on a row. There
   are five, not the table's seven: pink is the brand itself, and indigo sits
   between sky and lilac at tab size. The colours live in assets/app.css
   (.hue-0 … .hue-4); this file only decides the index. Pure, so Node can test
   it. */

export const HUE_COUNT = 5;

export function isHueIndex(value) {
  return Number.isInteger(value) && value >= 0 && value < HUE_COUNT;
}

// FNV-1a over the id: cheap, stable across sessions and devices.
function hashIndex(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % HUE_COUNT;
}

/** A folder made before hues existed — or by sync or a restore that carried
    none — gets a stable hue from its id, so its colour never changes. */
export function hueIndexOf(folder) {
  if (folder && isHueIndex(folder.hue)) return folder.hue;
  return hashIndex(String((folder && folder.id) || ''));
}

/** The least-used hue, so the first five folders are all different. Ties go
    to the lowest index. */
export function nextHueIndex(folders) {
  const used = new Array(HUE_COUNT).fill(0);
  (folders || []).forEach((folder) => { used[hueIndexOf(folder)] += 1; });
  let best = 0;
  for (let i = 1; i < HUE_COUNT; i += 1) if (used[i] < used[best]) best = i;
  return best;
}
