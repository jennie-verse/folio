/* search.js — the library's combined search and sort.
   Titles, file names and tags are matched from the document records; body text
   comes from the `docText` store so a released PDF is still findable. */

import { db } from './store.js';

let textIndex = null;

export function invalidateTextIndex() { textIndex = null; }

async function loadTextIndex() {
  if (textIndex) return textIndex;
  const rows = await db.docText.toArray();
  const map = new Map();
  rows.sort((a, b) => a.part - b.part).forEach((row) => {
    map.set(row.docId, (map.get(row.docId) || '') + row.text.toLowerCase());
  });
  textIndex = map;
  return map;
}

/** The documents a folder tab covers: 'unsorted', a folder id, or null for all.
    Shared by the list filter and the "Showing N of M" line, so the two can
    never disagree about what "M" is. */
export function inFolder(docs, folderFilter) {
  if (folderFilter === 'unsorted') return docs.filter((doc) => !doc.folderId);
  if (folderFilter) return docs.filter((doc) => doc.folderId === folderFilter);
  return docs.slice();
}

export async function filterDocuments(docs, { query, stateFilter, typeFilter, tagFilter, folderFilter, retentionDays }) {
  let list = docs.slice();

  if (Array.isArray(typeFilter) && typeFilter.length) {
    list = list.filter((doc) => typeFilter.includes(doc.kind));
  }

  // A document must carry EVERY listed tag (AND, not OR) — matches how
  // "Filter by type" already reads (every checked kind narrows further).
  if (Array.isArray(tagFilter) && tagFilter.length) {
    list = list.filter((doc) => tagFilter.every((tag) => (doc.tags || []).includes(tag)));
  }

  list = inFolder(list, folderFilter);

  if (stateFilter === 'pinned') list = list.filter((doc) => doc.pinned);
  else if (stateFilter === 'needs') list = list.filter((doc) => doc.released);
  else if (stateFilter === 'recent') {
    const week = Date.now() - 7 * 86400000;
    list = list.filter((doc) => (doc.lastTouchedAt || 0) >= week);
  }

  const needle = String(query || '').trim().toLowerCase();
  if (needle) {
    const index = await loadTextIndex();
    list = list.filter((doc) => {
      if (String(doc.title || '').toLowerCase().includes(needle)) return true;
      if (String(doc.fileName || '').toLowerCase().includes(needle)) return true;
      if ((doc.tags || []).some((tag) => String(tag).toLowerCase().includes(needle))) return true;
      const text = index.get(doc.id);
      return Boolean(text && text.includes(needle));
    });
  }

  return { list, retentionDays };
}

/** Custom order: documents the user has arranged carry a numeric `sortOrder`.
    Documents that were added after the last arrangement have none yet and
    sit above the arranged ones, newest first, so a fresh import is visible. */
function compareCustom(a, b) {
  const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : null;
  const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : null;
  if (ao === null && bo === null) return (b.addedAt || 0) - (a.addedAt || 0);
  if (ao === null) return -1;
  if (bo === null) return 1;
  return ao - bo;
}

export function sortDocuments(docs, mode) {
  const list = docs.slice();
  const byString = (a, b) => String(a || '').localeCompare(String(b || ''), ['ko', 'en']);
  switch (mode) {
    case 'added': list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); break;
    case 'added-asc': list.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)); break;
    case 'title': list.sort((a, b) => byString(a.title, b.title)); break;
    case 'title-desc': list.sort((a, b) => byString(b.title, a.title)); break;
    case 'size': list.sort((a, b) => (b.size || 0) - (a.size || 0)); break;
    case 'size-asc': list.sort((a, b) => (a.size || 0) - (b.size || 0)); break;
    case 'kind': list.sort((a, b) => byString(a.kind, b.kind) || byString(a.title, b.title)); break;
    case 'custom': list.sort(compareCustom); break;
    default: list.sort((a, b) => (b.lastTouchedAt || 0) - (a.lastTouchedAt || 0));
  }
  // Pins float to the top of every ordering except an explicit title sort or
  // the user's own custom order (which already says exactly where each goes).
  if (mode !== 'title' && mode !== 'title-desc' && mode !== 'custom') {
    list.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  }
  return list;
}

/** Turns a rearranged subset (what the user sees under the current filter)
    into a `sortOrder` for every document. Documents outside the subset keep
    their place; the subset's documents just trade among their own slots. */
export function customOrderAssignments(allDocs, rearranged) {
  const full = sortDocuments(allDocs, 'custom');
  const inSubset = new Set(rearranged.map((doc) => doc.id));
  const slots = [];
  full.forEach((doc, index) => { if (inSubset.has(doc.id)) slots.push(index); });
  const next = full.slice();
  slots.forEach((slot, k) => { next[slot] = rearranged[k]; });
  return next.map((doc, index) => ({ id: doc.id, sortOrder: index }));
}

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently opened' },
  { value: 'added', label: 'Date added (newest)' },
  { value: 'added-asc', label: 'Date added (oldest)' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'title-desc', label: 'Title Z–A' },
  { value: 'size', label: 'Size (largest)' },
  { value: 'size-asc', label: 'Size (smallest)' },
  { value: 'kind', label: 'Type' },
  { value: 'custom', label: 'Custom order' },
];
