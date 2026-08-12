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

import { db, listDocuments, newId, putDocText, getDocText, getPackageAssets, putPackageAssets, deleteEverything, saveFile } from './store.js';
import { base64, fromBase64 } from './package.js';
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

/** Replace everything with the backup's contents. The caller confirms first. */
export async function restore(parsed) {
  validate(parsed);
  await deleteEverything();

  let restored = 0;
  for (const entry of parsed.documents) {
    const doc = entry && entry.doc;
    if (!doc || !doc.kind) continue;
    const id = String(doc.id || newId());
    const record = {
      ...doc,
      id,
      released: true,
      deletedAt: undefined,
      updatedAt: Date.now(),
    };
    delete record.deletedAt;

    if (entry.file && entry.file.data) {
      const bytes = fromBase64(entry.file.data);
      const blob = new Blob([bytes]);
      await saveFile(record.fileHash, id, blob);
      record.released = false;
    }
    if (entry.packageAssets) await putPackageAssets(id, entry.packageAssets);
    if (entry.entryContent) record.entryContent = entry.entryContent;

    await db.documents.put(record);
    if (entry.text) await putDocText(id, entry.text);
    restored += 1;
  }

  if (Array.isArray(parsed.readingStates)) await db.readingStates.bulkPut(parsed.readingStates);
  if (Array.isArray(parsed.annotations)) await db.annotations.bulkPut(parsed.annotations);
  if (Array.isArray(parsed.bookmarks)) await db.bookmarks.bulkPut(parsed.bookmarks);

  return restored;
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
