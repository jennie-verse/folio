/* relink.js — reconnecting a released document to its original file (spec 4장).

   The hash decides. On a match the document opens where it was left; on a
   mismatch folio shows both files side by side and lets the user choose, with
   a warning that highlights may not line up. */

import { el, formatBytes, formatWhen, confirmDialog, toast } from './ui.js';
import { hashBlob } from './hashing.js';
import { saveFile, patchDocument, touch } from './store.js';

/** Ask for a file and reconnect it.
    Returns 'linked' | 'new' | 'cancelled'. */
export async function reconnect(doc, { pickFile, importFiles }) {
  const file = await pickFile();
  if (!file) return 'cancelled';

  const closeChecking = toast('Checking the file…', { ms: 60000 });
  let hash;
  try {
    hash = await hashBlob(file);
  } finally {
    closeChecking();
  }

  if (hash === doc.fileHash) {
    await saveFile(hash, doc.id, file);
    await patchDocument(doc.id, { released: false, size: file.size, fileName: file.name });
    await touch(doc.id);
    toast('Reconnected.');
    return 'linked';
  }

  const answer = await confirmDialog({
    title: 'This looks like a different file.',
    message: [
      `folio has: ${doc.fileName || doc.title} · ${formatBytes(doc.size)}`,
      doc.pageCount ? `${doc.pageCount} pages` : '',
      doc.rowCount ? `${doc.rowCount} rows` : '',
      `last opened ${formatWhen(doc.lastTouchedAt) || 'never'}`,
      '',
      `You chose: ${file.name} · ${formatBytes(file.size)}`,
      '',
      'Link anyway — highlights may not line up.',
    ].filter(Boolean).join('\n'),
    confirmLabel: 'Add as new document',
    extraLabel: 'Link anyway',
  });

  if (answer === 'extra') {
    await saveFile(hash, doc.id, file);
    await patchDocument(doc.id, { released: false, fileHash: hash, size: file.size, fileName: file.name });
    await touch(doc.id);
    toast('Reconnected.');
    return 'linked';
  }
  if (answer === true) {
    await importFiles([file]);
    return 'new';
  }
  return 'cancelled';
}

/** The information panel shown before the picker opens. */
export function describe(doc) {
  return el('div', {}, [
    el('p', { text: doc.fileName || doc.title || '' }),
    el('p', { class: 'muted small', text: [
      formatBytes(doc.size),
      doc.pageCount ? `${doc.pageCount} pages` : '',
      doc.rowCount ? `${doc.rowCount} rows` : '',
      `last opened ${formatWhen(doc.lastTouchedAt) || 'never'}`,
    ].filter(Boolean).join(' · ') }),
  ]);
}
