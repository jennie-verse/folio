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

export async function filterDocuments(docs, { query, stateFilter, typeFilter, retentionDays }) {
  let list = docs.slice();

  if (Array.isArray(typeFilter) && typeFilter.length) {
    list = list.filter((doc) => typeFilter.includes(doc.kind));
  }

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

export function sortDocuments(docs, mode) {
  const list = docs.slice();
  const byString = (a, b) => String(a || '').localeCompare(String(b || ''), ['ko', 'en']);
  switch (mode) {
    case 'added': list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); break;
    case 'title': list.sort((a, b) => byString(a.title, b.title)); break;
    case 'size': list.sort((a, b) => (b.size || 0) - (a.size || 0)); break;
    case 'kind': list.sort((a, b) => byString(a.kind, b.kind) || byString(a.title, b.title)); break;
    default: list.sort((a, b) => (b.lastTouchedAt || 0) - (a.lastTouchedAt || 0));
  }
  // Pins float to the top of every ordering except an explicit title sort.
  if (mode !== 'title') list.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  return list;
}

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently opened' },
  { value: 'added', label: 'Date added' },
  { value: 'title', label: 'Title' },
  { value: 'size', label: 'Size' },
  { value: 'kind', label: 'Type' },
];
