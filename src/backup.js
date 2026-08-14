/* backup.js — one JSON file, complete restore where it is affordable (plan 8-2).

   vault's backup contained the document bodies, so a single file restored
   everything. folio keeps that guarantee for the small formats and lists what
   it left out:

     · text · markdown · html · csv · ZIP package  → body included
     · pdf · image                                  → metadata only, restored as
                                                      `Needs file`

   Limits are counted in ORIGINAL bytes: 5 MB per document, 15 MB per package
   (the same as the import limit — a document folio accepts must be a document
   folio can back up), 40 MB in total. base64 makes the file about 1.33× that,
   which is why the size is announced before saving. */

import { db, listDocuments, getDocText, getPackageAssets, replaceFromBackup } from './store.js';
import { base64, fromBase64, validateManifest } from './package.js';
import { formatBytes, todayStamp } from './ui.js';
import { APP_BUILD } from './version.js';
import * as settings from './settings.js';

export const FORMAT = 'folio-backup';
export const SCHEMA_VERSION = 1;

const PER_DOC_BYTES = 5 * 1024 * 1024;
const PER_PACKAGE_BYTES = 15 * 1024 * 1024;
const TOTAL_BYTES = 40 * 1024 * 1024;

const BODY_KINDS = new Set(['text', 'markdown', 'html', 'csv', 'html-package']);

async function blobToBase64(blob) {
  return base64(new Uint8Array(await blob.arrayBuffer()));
}

/** Build the envelope. Returns {json, skipped, bytes}. */
export async function build() {
  const docs = await listDocuments();
  const skipped = [];
  let budget = TOTAL_BYTES;

  const documents = [];
  for (const doc of docs) {
    const record = { ...doc };
    delete record.entryContent;
    const entry = { doc: record, text: await getDocText(doc.id) };

    if (BODY_KINDS.has(doc.kind)) {
      const limit = doc.kind === 'html-package' ? PER_PACKAGE_BYTES : PER_DOC_BYTES;
      const file = doc.fileHash ? await db.documentFiles.get(doc.fileHash) : null;
      if (!file || !file.blob) {
        skipped.push({ title: doc.title, reason: 'no local copy' });
      } else if (file.blob.size > limit) {
        skipped.push({ title: doc.title, reason: `larger than ${formatBytes(limit)}` });
      } else if (file.blob.size > budget) {
        skipped.push({ title: doc.title, reason: 'backup size limit reached' });
      } else {
        entry.file = { bytes: file.blob.size, data: await blobToBase64(file.blob) };
        budget -= file.blob.size;
        if (doc.kind === 'html-package') {
          entry.packageAssets = await getPackageAssets(doc.id);
          entry.entryContent = doc.entryContent || '';
        }
      }
    } else {
      skipped.push({ title: doc.title, reason: 'PDFs and images are listed only' });
    }
    documents.push(entry);
  }

  const readingStates = await db.readingStates.toArray();
  const annotations = await db.annotations.toArray();
  const bookmarks = await db.bookmarks.toArray();

  const envelope = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_BUILD,
    exportedAt: new Date().toISOString(),
    documents,
    readingStates,
    annotations,
    bookmarks,
    settings: settings.all(),
  };

  const json = JSON.stringify(envelope);
  return { json, skipped, bytes: json.length, fileName: `folio-backup-${todayStamp()}.json` };
}

/** Validate a restore file before anything is touched. */
export function validate(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('This file is not a folio backup.');
  if (parsed.format !== FORMAT) throw new Error('This file is not a folio backup.');
  if (Number(parsed.schemaVersion) > SCHEMA_VERSION) throw new Error('This backup was made by a newer version of folio.');
  if (!Array.isArray(parsed.documents)) throw new Error('This backup has no documents.');
  return parsed;
}

const KINDS = new Set(['text', 'markdown', 'html', 'html-package', 'pdf', 'csv', 'image']);
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeBase64(value, label) {
  if (typeof value !== 'string' || !BASE64_RE.test(value)) throw new Error(`Invalid base64 in ${label}.`);
  try { return fromBase64(value); } catch { throw new Error(`Invalid base64 in ${label}.`); }
}

function rowsForText(docId, value) {
  const text = String(value || '');
  const rows = [];
  for (let offset = 0; offset < text.length; offset += 200000) {
    rows.push({ docId, part: rows.length, text: text.slice(offset, offset + 200000) });
  }
  return rows;
}

function referencedRows(rows, name, ids) {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) throw new Error(`Invalid ${name}.`);
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || !ids.has(String(row.docId || ''))) throw new Error(`Invalid document reference in ${name}.`);
    return { ...row, docId: String(row.docId) };
  });
}

/** Validate and materialize the complete backup before touching IndexedDB. */
export function validateAndNormalize(parsed) {
  validate(parsed);
  if (Number(parsed.schemaVersion) !== SCHEMA_VERSION) throw new Error('Unsupported backup schema version.');
  const now = Date.now();
  const ids = new Set();
  const hashes = new Set();
  const documents = [];
  const documentFiles = [];
  const packageAssets = [];
  const docText = [];

  parsed.documents.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || !entry.doc || typeof entry.doc !== 'object') throw new Error(`Invalid document ${index + 1}.`);
    const doc = entry.doc;
    const id = String(doc.id || '');
    if (!id || ids.has(id)) throw new Error('Duplicate or missing document id.');
    if (!KINDS.has(doc.kind)) throw new Error(`Invalid document kind for ${id}.`);
    if (typeof doc.fileHash !== 'string' || !doc.fileHash) throw new Error(`Missing file hash for ${id}.`);
    if (hashes.has(doc.fileHash)) throw new Error('Duplicate file hash.');
    ids.add(id);
    hashes.add(doc.fileHash);

    const record = { ...doc, id, released: true, updatedAt: now };
    delete record.deletedAt;
    if (doc.kind === 'pdf' || doc.kind === 'image') {
      // Large binary formats are metadata-only by contract, even if a
      // malicious backup tries to smuggle bytes into the entry.
      record.released = true;
    } else if (entry.file !== undefined) {
      if (!entry.file || typeof entry.file !== 'object') throw new Error(`Invalid file entry for ${id}.`);
      const bytes = decodeBase64(entry.file.data, `document ${id}`);
      if (Number(entry.file.bytes) !== bytes.byteLength) throw new Error(`File size mismatch for ${id}.`);
      const blob = new Blob([bytes], { type: String(entry.file.type || '') });
      documentFiles.push({ fileHash: record.fileHash, docId: id, blob, bytes: blob.size, savedAt: now });
      record.released = false;
    }

    if (doc.kind === 'html-package') {
      if (entry.packageAssets !== undefined && (!entry.packageAssets || typeof entry.packageAssets !== 'object' || Array.isArray(entry.packageAssets))) {
        throw new Error(`Invalid package assets for ${id}.`);
      }
      const manifest = validateManifest(entry.packageAssets || {});
      Object.entries(manifest).forEach(([path, asset]) => {
        packageAssets.push({ docId: id, path, asset });
      });
      if (entry.entryContent !== undefined && typeof entry.entryContent !== 'string') throw new Error(`Invalid package entry content for ${id}.`);
      if (entry.entryContent !== undefined) record.entryContent = entry.entryContent;
      const expectedAssets = Math.max(0, Number(record.packageFileCount || 1) - 1);
      if (!record.released && Object.keys(manifest).length !== expectedAssets) throw new Error(`Missing package assets for ${id}.`);
    } else if (entry.packageAssets !== undefined) {
      throw new Error(`Unexpected package assets for ${id}.`);
    }
    documents.push(record);
    docText.push(...rowsForText(id, entry.text));
  });

  const readingStates = referencedRows(parsed.readingStates, 'reading states', ids);
  const annotations = referencedRows(parsed.annotations, 'annotations', ids);
  const bookmarks = referencedRows(parsed.bookmarks, 'bookmarks', ids);
  return {
    documents, documentFiles, packageAssets, docText, readingStates, annotations, bookmarks,
    settings: settings.normalizeBackupSettings(parsed.settings),
  };
}

/** Replace everything with the backup's contents. The caller confirms first. */
export async function restore(parsed) {
  const normalized = validateAndNormalize(parsed);
  await replaceFromBackup(normalized);
  settings.restorePortable(normalized.settings);
  return normalized.documents.length;
}

/**
 * Hand the file to the user.
 *
 * The JSON is built by the caller and passed in already serialized: awaiting
 * anything between the tap and navigator.share() expires the user gesture, and
 * Safari then rejects the call with NotAllowedError — in a Home Screen app,
 * every time (plan 8-2).
 */
export function save(json, fileName) {
  const file = new File([json], fileName, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    navigator.share({ files: [file], title: fileName }).catch(() => downloadFallback(file, fileName));
    return;
  }
  downloadFallback(file, fileName);
}

function downloadFallback(file, fileName) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
