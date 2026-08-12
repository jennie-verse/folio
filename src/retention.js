/* retention.js — keeping and releasing local copies (plan 7장).

   Ported from tide's retention logic. One field drives expiry, `lastTouchedAt`,
   and exactly one function resets it: store.touch(). Rendering, searching and
   app startup deliberately never call it.

   Releasing deletes the original bytes and nothing else. Title, tags, reading
   position, highlights and the extracted text stay, so a released document is
   still searchable and can be reconnected from the original file. */

import { db, listDocuments, dropFile } from './store.js';
import { NEVER_RELEASED, isExpired, daysLeft, expiryBadge } from './expiry.js';
import * as settings from './settings.js';

export { isExpired, daysLeft, expiryBadge };

export const PIN_LIMIT = 50;

async function releaseDocs(docs) {
  let released = 0;
  for (const doc of docs) {
    const others = await db.documents.where('fileHash').equals(doc.fileHash || '').toArray();
    const shared = others.some((row) => row.id !== doc.id && !row.deletedAt && row.pinned);
    if (shared) continue;
    await dropFile(doc.fileHash);
    await db.packageAssets.where('docId').equals(doc.id).delete();
    await db.documents.put({ ...doc, released: true, updatedAt: Date.now() });
    released += 1;
  }
  return released;
}

/** Find what would be released now, without touching anything. */
export async function findExpired() {
  const days = settings.get('retentionDays');
  if (!days) return [];
  const docs = await listDocuments();
  const withCopies = [];
  for (const doc of docs) {
    if (!isExpired(doc, days)) continue;
    const file = doc.fileHash ? await db.documentFiles.get(doc.fileHash) : null;
    if (file) withCopies.push(doc);
  }
  return withCopies;
}

export async function releaseExpired(docs) {
  const released = await releaseDocs(docs);
  settings.setLastCleanupAt(new Date().toISOString());
  return released;
}

/** Storage ran out while saving. Release the oldest unpinned copies first and
    never touch a pinned document (plan 7장, spec 7장 exception). */
export async function releaseOldestUnpinned(neededBytes) {
  const docs = await listDocuments();
  const candidates = [];
  for (const doc of docs) {
    if (doc.pinned || NEVER_RELEASED.has(doc.kind)) continue;
    const file = doc.fileHash ? await db.documentFiles.get(doc.fileHash) : null;
    if (file) candidates.push({ doc, bytes: file.bytes || 0 });
  }
  candidates.sort((a, b) => (a.doc.lastTouchedAt || 0) - (b.doc.lastTouchedAt || 0));

  let freed = 0;
  const chosen = [];
  for (const candidate of candidates) {
    if (freed >= neededBytes) break;
    chosen.push(candidate.doc);
    freed += candidate.bytes;
  }
  const released = await releaseDocs(chosen);
  return { released, freed };
}

export function lastCleanupLine() {
  const stamp = settings.getLastCleanupAt();
  if (!stamp) return 'Last cleanup: never';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return 'Last cleanup: never';
  return `Last cleanup: ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
