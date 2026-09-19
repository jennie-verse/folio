/* folders.js — folder create/rename/delete/reorder.

   A folder is just a label a document's `folderId` points at (store.js v2).
   Deleting a folder never deletes documents — it moves them back to
   Unsorted (folderId: null), the same "never delete data the user didn't
   ask to delete" rule the rest of folio follows for retention and sync. */

import { db, newId } from './store.js';
import { nextHueIndex } from './folder-color.js';

/** One past the highest existing order. `folders.length` is not enough: after a
    folder is deleted it repeats a value still in use, and the new folder then
    sorts into the middle of the tab row instead of the end. */
export function nextOrder(folders) {
  return (folders || []).reduce((max, folder) => (Number.isFinite(folder.order) ? Math.max(max, folder.order) : max), -1) + 1;
}

export async function listFolders() {
  const rows = await db.folders.toArray();
  return rows.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function createFolder(name) {
  const trimmed = String(name || '').trim().slice(0, 60);
  if (!trimmed) throw new Error('Enter a folder name.');
  const folders = await listFolders();
  if (folders.some((folder) => folder.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
    throw new Error('That folder already exists.');
  }
  const row = { id: newId(), name: trimmed, order: nextOrder(folders), createdAt: Date.now(), hue: nextHueIndex(folders) };
  await db.folders.put(row);
  return row;
}

/** Finds a folder by name (case-insensitive) or creates it. Used when a
    remote device reports a folder this one hasn't seen yet — never throws
    on a name collision, since "already exists" is exactly the success case. */
export async function ensureFolder(name) {
  const trimmed = String(name || '').trim().slice(0, 60);
  if (!trimmed) return null;
  const folders = await listFolders();
  const existing = folders.find((folder) => folder.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  if (existing) return existing;
  const row = { id: newId(), name: trimmed, order: nextOrder(folders), createdAt: Date.now(), hue: nextHueIndex(folders) };
  await db.folders.put(row);
  return row;
}

export async function renameFolder(id, name) {
  const trimmed = String(name || '').trim().slice(0, 60);
  if (!trimmed) throw new Error('Enter a folder name.');
  const folders = await listFolders();
  if (folders.some((folder) => folder.id !== id && folder.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
    throw new Error('That folder already exists.');
  }
  return db.transaction('rw', db.folders, db.documents, async () => {
    const folder = await db.folders.get(id);
    if (!folder) return null;
    if (folder.name === trimmed) return folder;
    const next = { ...folder, name: trimmed };
    await db.folders.put(next);
    // Sync identifies a document's folder by NAME and applies a remote change
    // only when its updatedAt is newer than the local one (app.js
    // applyRemoteFolderTags). Without a fresh stamp on the folder's documents,
    // another device would keep showing the old name indefinitely.
    const docs = await db.documents.where('folderId').equals(id).toArray();
    const now = Date.now();
    for (const doc of docs) await db.documents.put({ ...doc, updatedAt: now });
    return next;
  });
}

/** Documents in this folder move to Unsorted; never deleted. Resolves with
    how many visible documents moved, for the confirmation message. */
export async function deleteFolder(id) {
  return db.transaction('rw', db.folders, db.documents, async () => {
    const docs = await db.documents.where('folderId').equals(id).toArray();
    const now = Date.now();
    for (const doc of docs) await db.documents.put({ ...doc, folderId: null, updatedAt: now });
    await db.folders.delete(id);
    return docs.filter((doc) => !doc.deletedAt).length;
  });
}

export function folderDocCounts(docs) {
  const counts = new Map();
  docs.forEach((doc) => {
    const key = doc.folderId || null;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}
