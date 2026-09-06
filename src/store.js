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

/** Import ordinary document bytes and metadata together. */
export async function commitDocumentImport(doc, blob) {
  return db.transaction('rw', db.documents, db.documentFiles, async () => {
    await db.documentFiles.put({ fileHash: doc.fileHash, docId: doc.id, blob, bytes: blob.size, savedAt: Date.now() });
    await db.documents.put({ ...doc, released: false });
  });
}

/** Commit a reconnect as one unit. A failed transaction preserves the old
    file, package assets and Needs-file metadata. */
export async function commitReconnect(doc, fileHash, blob, patch, assets = null) {
  return db.transaction('rw', db.documents, db.documentFiles, db.packageAssets, async () => {
    const current = await db.documents.get(doc.id);
    if (!current) throw new Error('Document no longer exists.');
    await db.documentFiles.put({ fileHash, docId: doc.id, blob, bytes: blob.size, savedAt: Date.now() });
    if (assets !== null) {
      await db.packageAssets.where('docId').equals(doc.id).delete();
      const rows = Object.entries(assets).map(([path, asset]) => ({ docId: doc.id, path, asset }));
      if (rows.length) await db.packageAssets.bulkPut(rows);
    }
    if (current.fileHash && current.fileHash !== fileHash) {
      const shared = await db.documents.where('fileHash').equals(current.fileHash).toArray();
      if (!shared.some((row) => row.id !== doc.id && !row.deletedAt)) await db.documentFiles.delete(current.fileHash);
    }
    const next = {
      ...current, ...patch, fileHash, released: false,
      lastTouchedAt: Date.now(), updatedAt: Date.now(),
    };
    await db.documents.put(next);
    return next;
  });
}

/** Import a package's blob, assets, searchable text and metadata atomically. */
export async function commitPackageImport(doc, blob, assets, text) {
  return db.transaction('rw', db.documents, db.documentFiles, db.packageAssets, db.docText, async () => {
    await db.documentFiles.put({ fileHash: doc.fileHash, docId: doc.id, blob, bytes: blob.size, savedAt: Date.now() });
    const assetRows = Object.entries(assets || {}).map(([path, asset]) => ({ docId: doc.id, path, asset }));
    if (assetRows.length) await db.packageAssets.bulkPut(assetRows);
    const textRows = [];
    const value = String(text || '');
    for (let offset = 0; offset < value.length; offset += TEXT_PART_BYTES) {
      textRows.push({ docId: doc.id, part: textRows.length, text: value.slice(offset, offset + TEXT_PART_BYTES) });
    }
    if (textRows.length) await db.docText.bulkPut(textRows);
    await db.documents.put({ ...doc, released: false });
  });
}

export async function dropFile(fileHash) {
  if (fileHash) await db.documentFiles.delete(fileHash);
}

/** Release one local copy and its package assets as a single state change.
    A shared file is left alone: deleting its bytes would silently disconnect
    the other document. `beforeMetadata` is a narrow failure-injection seam
    used by the transaction rollback regression test. */
export async function releaseDocumentCopy(doc, { beforeMetadata } = {}) {
  if (!doc || !doc.id) return false;
  return db.transaction('rw', db.documents, db.documentFiles, db.packageAssets, async () => {
    const current = await db.documents.get(doc.id);
    if (!current || current.deletedAt || current.pinned || current.released) return false;
    const sameFile = current.fileHash
      ? await db.documents.where('fileHash').equals(current.fileHash).toArray()
      : [];
    if (sameFile.some((row) => row.id !== current.id && !row.deletedAt)) return false;

    if (current.fileHash) await db.documentFiles.delete(current.fileHash);
    const assetsGone = current.kind === 'html-package'
      ? await db.packageAssets.where('docId').equals(current.id).delete()
      : 0;
    if (beforeMetadata) await beforeMetadata();
    await db.documents.put({
      ...current,
      released: true,
      ...(assetsGone > 0 ? { packageAssetsReleased: true } : {}),
      updatedAt: Date.now(),
    });
    return true;
  });
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

/* ── annotations ──────────────────────────────────────────────────────── */

export async function listAnnotations(docId, { includeDeleted = false, includeExports = true } = {}) {
  const rows = await db.annotations.where('docId').equals(docId).toArray();
  return rows.filter((item) => (includeDeleted || !item.deletedAt)
    && (includeExports || item.kind !== 'exported-excerpt'))
    .sort((a, b) => Number(a.locator?.page || 0) - Number(b.locator?.page || 0)
      || Number(a.locator?.scrollRatio || 0) - Number(b.locator?.scrollRatio || 0)
      || Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
}

export async function getAnnotation(id) { return db.annotations.get(id); }

// One flat, unsorted list of every live annotation in the library, for the
// cross-document "My Highlights & Notes" review screen. Callers group/sort
// and join against listDocuments() themselves.
export async function listAllAnnotations({ includeExports = false } = {}) {
  const rows = await db.annotations.toArray();
  return rows.filter((item) => !item.deletedAt && (includeExports || item.kind !== 'exported-excerpt'));
}

export async function putAnnotation(annotation) {
  await db.annotations.put(annotation);
  invalidateAnnotationCounts();
  return annotation;
}

export async function softDeleteAnnotation(id) {
  const annotation = await db.annotations.get(id);
  if (!annotation || annotation.deletedAt) return annotation || null;
  const next = { ...annotation, deletedAt: Date.now(), updatedAt: new Date().toISOString(), revision: Number(annotation.revision || 1) + 1 };
  await db.annotations.put(next);
  invalidateAnnotationCounts();
  return next;
}

// Library rows show a highlight/note count per document (folio annotation
// improvements plan). A fresh full-table scan on every library render would
// turn into a per-keystroke cost once wired into live search filtering, so
// this caches the same way search.js caches its text index: hold the map
// until something actually changes it.
let countsCache = null;

export function invalidateAnnotationCounts() { countsCache = null; }

export async function annotationCounts() {
  if (countsCache) return countsCache;
  const rows = await db.annotations.toArray();
  const map = new Map();
  rows.forEach((row) => {
    if (row.deletedAt || row.kind === 'exported-excerpt') return;
    const entry = map.get(row.docId) || { highlights: 0, notes: 0 };
    if (row.kind === 'note') entry.notes += 1; else entry.highlights += 1;
    map.set(row.docId, entry);
  });
  countsCache = map;
  return countsCache;
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
  invalidateAnnotationCounts();
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
  invalidateAnnotationCounts();
}

/** Replace every portable document table in one Dexie transaction. All Blob
    construction and validation must already be complete before this starts. */
export async function replaceFromBackup(data) {
  return db.transaction('rw',
    db.documents, db.documentFiles, db.packageAssets, db.docText,
    db.readingStates, db.annotations, db.bookmarks,
    async () => {
      await Promise.all([
        db.documents.clear(), db.documentFiles.clear(), db.packageAssets.clear(),
        db.docText.clear(), db.readingStates.clear(), db.annotations.clear(), db.bookmarks.clear(),
      ]);
      if (data.documents.length) await db.documents.bulkPut(data.documents);
      if (data.documentFiles.length) await db.documentFiles.bulkPut(data.documentFiles);
      if (data.packageAssets.length) await db.packageAssets.bulkPut(data.packageAssets);
      if (data.docText.length) await db.docText.bulkPut(data.docText);
      if (data.readingStates.length) await db.readingStates.bulkPut(data.readingStates);
      if (data.annotations.length) await db.annotations.bulkPut(data.annotations);
      if (data.bookmarks.length) await db.bookmarks.bulkPut(data.bookmarks);
    });
  invalidateAnnotationCounts();
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
