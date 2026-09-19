/* library.js — importing files and drawing the Library screen (design 3장). */

import { el, toast, formatBytes, formatWhen } from './ui.js';
import { detect, TAG_OF, FAMILY_CLASS, subtitleFor } from './detect.js';
import { hashBlob } from './hashing.js';
import * as store from './store.js';
import * as pkg from './package.js';
import * as retention from './retention.js';
import * as search from './search.js';
import * as settings from './settings.js';
import { withRoom } from './storage.js';

/* ── importing ─────────────────────────────────────────────────────────── */

function titleFrom(fileName) {
  return String(fileName || 'Untitled').replace(/\.[A-Za-z0-9]+$/, '') || 'Untitled';
}

/** Reconnecting a package has to rebuild its assets — releasing one deletes
    its `packageAssets` rows, and for a package those rows ARE the document
    (relink.js carries the long version of this). A duplicate-hash import
    hits the exact same released package, so it needs the exact same rebuild;
    without it the document is left with `released:false` (no "Needs file"
    badge, looks healthy) but zero assets, and every open shows "This
    package's files are missing" forever, Reconnect button included, no
    matter how many times the same correct ZIP is re-imported. */
async function packagePatch(doc, file) {
  if (doc.kind !== 'html-package') return {};
  const meta = await pkg.importZip(file);
  return {
    packageAssets: meta.packageAssets,
    entryPath: meta.entryPath,
    entryContent: meta.content,
    packageFileCount: meta.packageFileCount,
    packageAssetsReleased: false,
  };
}

/** Save the original bytes, making room by releasing old unpinned copies if
    the device is full. Pinned documents are never touched (spec 7장). */
async function saveWithRoom(doc, blob) {
  return withRoom(() => store.commitDocumentImport(doc, blob), blob.size, { excludeHashes: [doc.fileHash] });
}

/**
 * Import picked files.
 * @param {File[]} files
 * @param {object} handlers  kind → handler module (for extractText)
 * @param {object} [options]
 * @param {string|null} [options.folderId]    file the new documents into this folder
 * @param {string} [options.folderName]       only used in the "Added …" message
 * @param {string} [options.title]            title for a single file (typed-in text)
 * @param {boolean} [options.pasted]          the file is typed text, not a picked file
 * @param {boolean} [options.quiet]           caller announces "Added" itself
 * @returns {{added:number, reconnected:number, released:number, failures:Array}}
 */
export async function importFiles(files, handlers, options = {}) {
  const { folderId = null, folderName = '', pasted = false, quiet = false } = options;
  const customTitle = files.length === 1 ? String(options.title || '').trim() : '';
  let added = 0;
  let reconnected = 0;
  let releasedTotal = 0;
  const failures = [];

  for (const file of files) {
    try {
      const { kind, reason } = await detect(file);
      if (!kind) { failures.push({ name: file.name, reason }); continue; }

      const fileHash = await hashBlob(file);

      // A file already in folio is reconnected, never duplicated (spec 8장).
      const existing = await store.findByHash(fileHash);
      if (existing) {
        let patch;
        try {
          patch = await packagePatch(existing, file);
        } catch {
          // A ZIP that fails to re-read must not be marked reconnected — that
          // would clear the "Needs file" badge on a document still missing
          // its assets, hiding the very thing the user needs to fix.
          failures.push({ name: file.name, reason: 'This ZIP could not be read.' });
          continue;
        }
        const { packageAssets, ...docPatch } = patch;
        const room = await withRoom(
          () => store.commitReconnect(existing, fileHash, file, { size: file.size, fileName: file.name, ...docPatch }, packageAssets ?? null),
          file.size,
          { excludeHashes: [existing.fileHash, fileHash] },
        );
        releasedTotal += room.released;
        if (!room.saved) {
          failures.push({ name: file.name, reason: 'there was not enough storage space' });
          continue;
        }
        reconnected += 1;
        continue;
      }

      const now = Date.now();
      const id = store.newId();
      const doc = {
        id,
        kind,
        fileName: file.name,
        title: customTitle || titleFrom(file.name),
        size: file.size,
        fileHash,
        tags: [],
        folder: '',
        ...(folderId ? { folderId } : {}),
        addedAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        pinned: false,
        runEnabled: false,
        released: false,
      };

      if (kind === 'html-package') {
        const meta = await pkg.importZip(file);
        doc.entryPath = meta.entryPath;
        doc.entryContent = meta.content;
        doc.packageFileCount = meta.packageFileCount;
        doc._packageAssets = meta.packageAssets;
      }

      const room = kind === 'html-package'
        ? await withRoom(
          () => store.commitPackageImport(doc, file, doc._packageAssets, doc.entryContent.replace(/<[^>]+>/g, ' ')),
          file.size,
          { excludeHashes: [fileHash] },
        )
        : await saveWithRoom(doc, file);
      releasedTotal += room.released;
      delete doc._packageAssets;
      if (!room.saved) {
        failures.push({ name: file.name, reason: 'there was not enough storage space' });
        continue;
      }

      const handler = handlers[kind];
      if (handler && handler.extractText && kind !== 'html-package') {
        try {
          const result = await handler.extractText(file, doc);
          if (result.patch && Object.keys(result.patch).length) await store.patchDocument(id, result.patch);
          if (result.text) await store.putDocText(id, result.text);
          if (result.error) failures.push({ name: file.name, reason: result.error });
        } catch (error) {
          // A document that cannot be indexed still opens; only search suffers.
          console.warn('index', file.name, error);
        }
      }
      added += 1;
    } catch (error) {
      failures.push({ name: file.name, reason: String((error && error.message) || 'could not be read') });
    }
  }

  search.invalidateTextIndex();
  if (releasedTotal) toast(`Storage is full — released ${releasedTotal} old ${releasedTotal === 1 ? 'copy' : 'copies'} and saved.`);
  else if (added && !quiet) toast(`Added ${added} document${added === 1 ? '' : 's'}${folderId && folderName ? ` to ${folderName}` : ''}.`);
  if (reconnected) toast(pasted ? 'That exact text is already in folio.' : 'Already in folio — reconnected instead.');
  return { added, reconnected, released: releasedTotal, failures };
}

/* ── drawing ───────────────────────────────────────────────────────────── */

export function tagFor(doc) {
  return el('span', { class: `tag ${FAMILY_CLASS[doc.kind] || 'f-write'}`, text: TAG_OF[doc.kind] || '?' });
}

function keepClass(doc) {
  if (doc.pinned) return 'docrow k-pin';
  if (doc.released) return 'docrow k-needs';
  return 'docrow';
}

function metaLine(doc) {
  const parts = [subtitleFor(doc), formatBytes(doc.size), formatWhen(doc.lastTouchedAt)];
  return parts.filter(Boolean).join(' · ');
}

function annotationBadgeText(count) {
  if (!count) return '';
  const parts = [];
  if (count.highlights) parts.push(`${count.highlights} hl`);
  if (count.notes) parts.push(`${count.notes} note${count.notes === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** One list row. Tap opens, long press opens the row sheet.
    In selection mode (`selectMode: true`), tap toggles selection instead —
    used by "Export selected .md" (folio multi-export plan). */
export function documentRow(doc, { onOpen, onMenu, retentionDays, selectMode = false, selected = false, onToggleSelect, annotationCount, folderName, folderHue = 0 }) {
  const row = el('button', { class: keepClass(doc) + (selectMode && selected ? ' selected' : ''), type: 'button' });
  if (selectMode) {
    row.setAttribute('aria-pressed', String(selected));
    row.appendChild(el('span', { class: 'selectbox', 'aria-hidden': 'true', text: selected ? '✓' : '' }));
  }
  const main = el('div', { class: 'dr-main' }, [
    el('div', { class: 'dr-title', text: doc.title || doc.fileName || 'Untitled' }),
    el('div', { class: 'dr-sub', text: metaLine(doc) }),
  ]);
  if ((doc.tags || []).length) {
    main.appendChild(el('div', { class: 'dr-tags', text: doc.tags.map((tag) => `#${tag}`).join(' ') }));
  }
  row.appendChild(main);

  if (folderName) row.appendChild(el('span', { class: `badge folder hue-${folderHue}`, text: folderName, title: folderName }));
  if (doc.pinned) row.appendChild(el('span', { class: 'badge pin', text: 'Pinned' }));
  else if (doc.released) row.appendChild(el('span', { class: 'badge needs', text: 'Needs file' }));
  // The countdown is about a local copy, so a released document never shows it.
  const days = doc.released ? '' : retention.expiryBadge(doc, retentionDays);
  if (days) row.appendChild(el('span', { class: 'badge days', text: days }));
  const annotationText = annotationBadgeText(annotationCount);
  if (annotationText) row.appendChild(el('span', { class: 'badge annot', text: annotationText }));
  row.appendChild(tagFor(doc));

  if (selectMode) {
    row.addEventListener('click', () => onToggleSelect(doc));
    return row;
  }

  let pressTimer = null;
  let longPressed = false;
  const startPress = () => {
    longPressed = false;
    pressTimer = setTimeout(() => { longPressed = true; onMenu(doc); }, 500);
  };
  const endPress = () => { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; };
  row.addEventListener('pointerdown', startPress);
  row.addEventListener('pointerup', endPress);
  row.addEventListener('pointerleave', endPress);
  row.addEventListener('pointercancel', endPress);
  row.addEventListener('contextmenu', (event) => { event.preventDefault(); onMenu(doc); });
  row.addEventListener('click', () => { if (!longPressed) onOpen(doc); });
  // Keyboard users reach the same sheet without a long press.
  row.addEventListener('keydown', (event) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); onMenu(doc); }
  });

  return row;
}

/** A Continue card: title, tag, percentage and the thin progress line. */
export function continueCard(doc, state, onOpen) {
  const ratio = Math.max(0, Math.min(1, Number(state && state.progress) || 0));
  const bar = el('div', { class: 'progress' }, [el('i')]);
  bar.firstChild.style.width = `${Math.round(ratio * 100)}%`;
  return el('button', { class: 'concard', type: 'button', onclick: () => onOpen(doc) }, [
    el('div', { class: 'cc-title', text: doc.title || doc.fileName || 'Untitled' }),
    el('div', { class: 'cc-meta' }, [
      tagFor(doc),
      el('span', { class: 'small muted', text: `${Math.round(ratio * 100)}%` }),
    ]),
    bar,
  ]);
}

export function emptyState({ onImport, onCompose }) {
  return el('div', { class: 'empty' }, [
    el('h2', { text: 'No documents yet' }),
    el('p', { text: 'Import files from Files or iCloud Drive, or paste text and code straight in. Pin the ones you open often — pinned documents always keep a local copy.' }),
    el('div', { class: 'actions' }, [
      el('button', { class: 'primary', type: 'button', text: 'Import files', onclick: onImport }),
      el('button', { type: 'button', text: 'Paste code', onclick: onCompose }),
    ]),
  ]);
}

/** A folder with nothing in it — the one place a new user is most likely to be
    staring at a blank list, so it says how to fill it. */
export function emptyFolder({ name, onImport, onCompose }) {
  return el('div', { class: 'empty' }, [
    el('h2', { class: 'title', text: `“${name}” is empty` }),
    el('p', { text: 'Anything you import or paste while this folder is open is saved into it. You can also move documents here from a row’s menu.' }),
    el('div', { class: 'actions' }, [
      el('button', { class: 'primary', type: 'button', text: 'Import files', onclick: onImport }),
      el('button', { type: 'button', text: 'Paste code', onclick: onCompose }),
    ]),
  ]);
}

export function noMatches(query) {
  return el('div', { class: 'empty' }, [
    el('p', { text: `No matches for "${query}".` }),
    el('p', { class: 'small', text: 'Search covers titles, tags and document text.' }),
  ]);
}

export function nothingHere(onShowAll) {
  return el('div', { class: 'empty' }, [
    el('p', { text: 'Nothing here yet.' }),
    el('button', { type: 'button', text: 'Show all', onclick: onShowAll }),
  ]);
}

export function storageError() {
  return el('div', { class: 'empty' }, [
    el('p', { text: 'Storage is unavailable. Your documents are safe on this device — reopen the app to try again.' }),
  ]);
}

export function usageSummary(totals, total, quota) {
  const bar = el('div', { class: 'usebar' });
  ['write', 'page', 'fixed', 'media'].forEach((family) => {
    const share = total ? (totals[family] / total) * 100 : 0;
    const piece = el('i', { class: `f-${family}` });
    piece.style.width = `${share}%`;
    bar.appendChild(piece);
  });
  const text = quota && quota.quota
    ? `Using ${formatBytes(total)} of ~${formatBytes(quota.quota)}`
    : `Using ${formatBytes(total)}`;
  return { bar, text };
}

export function failureReport(failures) {
  return el('div', {}, failures.slice(0, 12).map((failure) => el('p', {
    class: 'small muted',
    text: `${failure.name} — ${failure.reason || 'could not be read'}`,
  })));
}
