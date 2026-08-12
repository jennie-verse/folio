/* store.js — IndexedDB through Dexie (plan 8-1).

   Nine stores. `documents` holds metadata only; the original bytes live in
   `documentFiles` keyed by hash, so releasing a local copy deletes exactly one
   record and leaves the title, tags, reading position and text behind.

   HARD RULE (plan 5-4): a delete is only ever recorded because the user
   deleted something. "This document is not on this device" is never treated as
   evidence of a delete — that inference erased focus's data on 2026-08-09. */

const DB_NAME = 'folio';
const Dexie = window.Dexie;

export const db = new Dexie(DB_NAME);

db.version(1).stores({
  documents: 'id, lastTouchedAt, updatedAt, addedAt, fileHash, kind, *tags, deletedAt, pinned',
  documentFiles: 'fileHash, docId',
  packageAssets: '[docId+path], docId',
  readingStates: 'docId, lastReadAt',
  annotations: 'id, docId, updatedAt, deletedAt',
  bookmarks: 'id, docId, updatedAt, deletedAt',
  docText: '[docId+part], docId',
  preferences: 'id',
  meta: 'key',
});

export const SCHEMA_VERSION = 1;

export async function open() {
  await db.open();
  const stamp = await db.meta.get('schemaVersion');
  if (!stamp) await db.meta.put({ key: 'schemaVersion', value: SCHEMA_VERSION });
  return db;
}

export function newId() {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}${random[0].toString(36)}${random[1].toString(36)}`;
}

/* ── reading ───────────────────────────────────────────────────────────── */

/** Every list in the app goes through here, so soft-deleted rows stay hidden. */
export async function listDocuments() {
  const rows = await db.documents.toArray();
  return rows.filter((doc) => !doc.deletedAt);
}

export async function getDocument(id) {
  const doc = await db.documents.get(id);
  return doc && !doc.deletedAt ? doc : null;
}

export async function getFile(fileHash) {
  if (!fileHash) return null;
  return db.documentFiles.get(fileHash);
}

export async function hasLocalCopy(doc) {
  if (!doc || !doc.fileHash) return false;
  const row = await db.documentFiles.get(doc.fileHash);
  return Boolean(row && row.blob);
}

export async function findByHash(fileHash) {
  if (!fileHash) return null;
  const rows = await db.documents.where('fileHash').equals(fileHash).toArray();
  return rows.find((doc) => !doc.deletedAt) || null;
}

/* ── writing ───────────────────────────────────────────────────────────── */

export async function putDocument(doc) {
  await db.documents.put(doc);
  return doc;
}

export async function patchDocument(id, patch) {
  const doc = await db.documents.get(id);
  if (!doc) return null;
  const next = { ...doc, ...patch, updatedAt: Date.now() };
  await db.documents.put(next);
  return next;
}

/** The only place the retention clock is reset (plan 7장).
    Opening, renaming, editing tags, unpinning and a successful reconnect call
    this. Rendering, searching and app startup deliberately do not. */
export async function touch(id) {
  const now = Date.now();
  return patchDocument(id, { lastTouchedAt: now });
}

export async function saveFile(fileHash, docId, blob) {
  await db.documentFiles.put({ fileHash, docId, blob, bytes: blob.size, savedAt: Date.now() });
}

export async function dropFile(fileHash) {
  if (fileHash) await db.documentFiles.delete(fileHash);
}

export async function putReadingState(docId, patch) {
  const previous = (await db.readingStates.get(docId)) || { docId };
  const next = { ...previous, ...patch, docId, lastReadAt: Date.now() };
  await db.readingStates.put(next);
  return next;
}

export async function getReadingState(docId) {
  return (await db.readingStates.get(docId)) || { docId };
}

/* ── searchable text ───────────────────────────────────────────────────── */

const TEXT_PART_BYTES = 200000;

export async function putDocText(docId, text) {
  await db.docText.where('docId').equals(docId).delete();
  const value = String(text || '');
  if (!value) return;
  const parts = [];
  for (let i = 0; i < value.length; i += TEXT_PART_BYTES) {
    parts.push({ docId, part: parts.length, text: value.slice(i, i + TEXT_PART_BYTES) });
  }
  await db.docText.bulkPut(parts);
}

export async function getDocText(docId) {
  const parts = await db.docText.where('docId').equals(docId).toArray();
  parts.sort((a, b) => a.part - b.part);
  return parts.map((row) => row.text).join('');
}

/* ── package assets ────────────────────────────────────────────────────── */

export async function putPackageAssets(docId, assets) {
  await db.packageAssets.where('docId').equals(docId).delete();
  const rows = Object.keys(assets || {}).map((path) => ({ docId, path, asset: assets[path] }));
  if (rows.length) await db.packageAssets.bulkPut(rows);
}

export async function getPackageAssets(docId) {
  const rows = await db.packageAssets.where('docId').equals(docId).toArray();
  const out = Object.create(null);
  rows.forEach((row) => { out[row.path] = row.asset; });
  return out;
}

/* ── soft delete and undo (plan 8-1, spec 7장) ─────────────────────────── */

/** Marks one document deleted. Nothing is destroyed and no sync tombstone is
    written yet — that happens only when `finalizeDelete` confirms it. */
export async function softDelete(id) {
  const doc = await db.documents.get(id);
  if (!doc) return null;
  await db.documents.put({ ...doc, deletedAt: Date.now(), updatedAt: Date.now() });
  return doc;
}

export async function undoDelete(id) {
  return db.transaction('rw', db.documents, async () => {
    const doc = await db.documents.get(id);
    if (!doc || !doc.deletedAt) return null;
    const { deletedAt, ...rest } = doc;
    await db.documents.put({ ...rest, updatedAt: Date.now() });
    return rest;
  });
}

/** Confirms a soft delete. Everything belonging to the document goes in one
    transaction so a half-deleted document can never be left behind. */
export async function finalizeDelete(id) {
  const doc = await db.documents.get(id);
  if (!doc) return null;
  await db.transaction('rw',
    db.documents, db.documentFiles, db.packageAssets, db.docText,
    db.readingStates, db.annotations, db.bookmarks,
    async () => {
      if (doc.fileHash) {
        const others = await db.documents.where('fileHash').equals(doc.fileHash).toArray();
        const shared = others.some((row) => row.id !== id && !row.deletedAt);
        if (!shared) await db.documentFiles.delete(doc.fileHash);
      }
      await db.packageAssets.where('docId').equals(id).delete();
      await db.docText.where('docId').equals(id).delete();
      await db.readingStates.where('docId').equals(id).delete();
      await db.annotations.where('docId').equals(id).delete();
      await db.bookmarks.where('docId').equals(id).delete();
      await db.documents.delete(id);
    });
  return doc;
}

/** Run at startup: an Undo window that was still open when the app closed
    resolves as a delete, because the user already asked for it (plan 8-1). */
export async function finalizePendingDeletes() {
  const pending = await db.documents.filter((doc) => Boolean(doc.deletedAt)).toArray();
  const finalized = [];
  for (const doc of pending) {
    await finalizeDelete(doc.id);
    finalized.push(doc);
  }
  return finalized;
}

export async function deleteEverything() {
  await db.transaction('rw',
    db.documents, db.documentFiles, db.packageAssets, db.docText,
    db.readingStates, db.annotations, db.bookmarks,
    async () => {
      await Promise.all([
        db.documents.clear(), db.documentFiles.clear(), db.packageAssets.clear(),
        db.docText.clear(), db.readingStates.clear(), db.annotations.clear(), db.bookmarks.clear(),
      ]);
    });
}

/* ── usage ─────────────────────────────────────────────────────────────── */

export async function usageByFamily() {
  const [docs, files] = await Promise.all([listDocuments(), db.documentFiles.toArray()]);
  const byHash = new Map(files.map((row) => [row.fileHash, row.bytes || 0]));
  const totals = { write: 0, page: 0, fixed: 0, media: 0 };
  let total = 0;
  docs.forEach((doc) => {
    const bytes = byHash.get(doc.fileHash) || 0;
    total += bytes;
    const family = FAMILY_OF[doc.kind] || 'write';
    totals[family] += bytes;
  });
  return { totals, total };
}

export const FAMILY_OF = Object.freeze({
  text: 'write', markdown: 'write',
  html: 'page', 'html-package': 'page',
  pdf: 'fixed',
  csv: 'media', image: 'media',
});

export async function estimateQuota() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}
