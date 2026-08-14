/* app.js — routing, the viewer shell and everything that wires the screens
   together. Screen text follows Folio_Screen_Spec_2026-08-12.md exactly. */

import { $, $$, el, clear, toast, sheet, choose, confirmDialog, customSheet, formatBytes } from './ui.js';
import * as store from './store.js';
import * as settings from './settings.js';
import * as library from './library.js';
import * as search from './search.js';
import * as retention from './retention.js';
import * as backup from './backup.js';
import * as relink from './relink.js';
import * as sync from './sync.js';
import * as syncRunner from './sync-runner.js';
import * as pkg from './package.js';
import { TAG_OF, KINDS, detect } from './detect.js';
import { APP_BUILD } from './version.js';

import * as textHandler from './handlers/text.js';
import * as markdownHandler from './handlers/markdown.js';
import * as htmlHandler from './handlers/html.js';
import * as csvHandler from './handlers/csv.js';
import * as imageHandler from './handlers/image.js';
import * as pdfHandler from './handlers/pdf.js';

const HANDLERS = {
  text: textHandler,
  markdown: markdownHandler,
  html: htmlHandler,
  'html-package': htmlHandler,
  csv: csvHandler,
  image: imageHandler,
  pdf: pdfHandler,
};

const State = {
  docs: [],
  current: null,
  view: null,          // the mounted handler instance
  transient: false,    // true while showing a file that lives inside a package
  assetReturn: null,   // {docId} — where Back goes from an opened package asset
  storageOk: true,
  pendingUndo: new Map(),
  viewerAbort: null,
  scrollSaveTimer: null,
  pendingZoom: null,
};

/* ── routing ───────────────────────────────────────────────────────────── */

function show(name) {
  ['library', 'viewer', 'settings'].forEach((screen) => {
    $(`#${screen}`).classList.toggle('hidden', screen !== name);
  });
  // iPad landscape keeps the library rail beside the viewer.
  $('#app').classList.toggle('split', name === 'viewer' && window.matchMedia('(min-width:1024px) and (orientation:landscape)').matches);
  if (name === 'viewer') $('#library').classList.toggle('hidden', !$('#app').classList.contains('split'));
}

/* ── library ───────────────────────────────────────────────────────────── */

async function refreshLibrary() {
  try {
    State.docs = await store.listDocuments();
    State.storageOk = true;
  } catch {
    State.storageOk = false;
  }

  const list = $('#docList');
  const stateHost = $('#libraryState');
  clear(list);
  clear(stateHost);

  if (!State.storageOk) { stateHost.appendChild(library.storageError()); return; }

  const query = $('#q').value;
  const days = settings.get('retentionDays');
  const { list: filtered } = await search.filterDocuments(State.docs, {
    query,
    stateFilter: settings.get('stateFilter'),
    typeFilter: settings.get('typeFilter'),
    retentionDays: days,
  });
  const ordered = search.sortDocuments(filtered, settings.get('sort'));

  ordered.forEach((doc) => {
    list.appendChild(el('li', {}, [library.documentRow(doc, {
      retentionDays: days,
      onOpen: openDocument,
      onMenu: openRowSheet,
    })]));
  });

  if (!State.docs.length) stateHost.appendChild(library.emptyState({ onImport: pickFiles }));
  else if (!ordered.length && query.trim()) stateHost.appendChild(library.noMatches(query.trim()));
  else if (!ordered.length) {
    stateHost.appendChild(library.nothingHere(() => {
      settings.set('stateFilter', 'all');
      settings.set('typeFilter', []);
      paintChips();
      refreshLibrary();
    }));
  }

  await refreshContinue();
}

async function refreshContinue() {
  const host = $('#continueRow');
  const trail = $('#continueTrail');
  clear(trail);

  // Folded when there is nothing to continue, or in the 6px/8px dense steps.
  if (settings.isCompact()) { host.classList.add('hidden'); return; }
  const states = await store.db.readingStates.orderBy('lastReadAt').reverse().limit(12).toArray();
  const byId = new Map(State.docs.map((doc) => [doc.id, doc]));
  const recent = states.map((state) => ({ state, doc: byId.get(state.docId) })).filter((pair) => pair.doc).slice(0, 3);
  if (!recent.length) { host.classList.add('hidden'); return; }
  host.classList.remove('hidden');
  recent.forEach(({ doc, state }) => trail.appendChild(library.continueCard(doc, state, openDocument)));
}

function paintChips() {
  $$('#stateChips .chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.state === settings.get('stateFilter')));
  });
}

/* ── import ────────────────────────────────────────────────────────────── */

function pickFiles() { $('#filePicker').click(); }

function pickOneFile() {
  return new Promise((resolve) => {
    const picker = $('#reconnectPicker');
    let settled = false;
    let leftWindow = false;
    let focusTimer = null;
    const finish = (file = null) => {
      if (settled) return;
      settled = true;
      if (focusTimer) clearTimeout(focusTimer);
      picker.removeEventListener('change', onChange);
      picker.removeEventListener('cancel', onCancel);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      picker.value = '';
      resolve(file || null);
    };
    const onChange = () => finish(picker.files && picker.files[0]);
    const onCancel = () => finish(null);
    const onBlur = () => { leftWindow = true; };
    const onFocus = () => {
      if (!leftWindow || settled) return;
      // Some Safari versions do not send the input `cancel` event. Let a
      // pending `change` win, then resolve a genuine return-without-a-file.
      focusTimer = setTimeout(() => finish(picker.files && picker.files[0]), 250);
    };
    const onVisibility = () => {
      if (document.hidden) { leftWindow = true; return; }
      onFocus();
    };
    picker.addEventListener('change', onChange, { once: true });
    picker.addEventListener('cancel', onCancel, { once: true });
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    picker.click();
  });
}

async function handleImport(files) {
  if (!files || !files.length) return;
  const result = await library.importFiles(Array.from(files), HANDLERS);
  if (result.failures.length) {
    customSheet((panel) => {
      panel.appendChild(el('h2', { text: `${result.failures.length} file${result.failures.length === 1 ? '' : 's'} could not be added` }));
      panel.appendChild(library.failureReport(result.failures));
    });
  }
  await refreshLibrary();
  syncRunner.schedulePush();
}

/* ── row actions ───────────────────────────────────────────────────────── */

function openRowSheet(doc) {
  sheet(doc.title || doc.fileName, [
    { label: 'Open', run: () => openDocument(doc) },
    { label: doc.pinned ? 'Unpin' : 'Pin', run: () => togglePin(doc) },
    { label: 'Rename', run: () => renameDocument(doc) },
    { label: 'Edit tags', run: () => editTags(doc) },
    { label: 'Export original', disabled: doc.released, run: () => exportOriginal(doc) },
    { label: 'Delete', run: () => deleteDocument(doc) },
  ]);
}

async function togglePin(doc) {
  if (!doc.pinned) {
    const pinned = State.docs.filter((row) => row.pinned).length;
    if (pinned >= retention.PIN_LIMIT) { toast(`Pin limit reached (${retention.PIN_LIMIT}). Unpin one first.`); return; }
    await store.patchDocument(doc.id, { pinned: true });
    toast('Pinned.');
  } else {
    await store.patchDocument(doc.id, { pinned: false });
    await store.touch(doc.id);   // unpinning restarts the clock (plan 7장)
    toast('Unpinned.');
  }
  await refreshLibrary();
  syncRunner.schedulePush();
}

function promptText(title, label, value) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
    customSheet((panel, close) => {
      panel.appendChild(el('h2', { text: title }));
      const input = el('input', { type: 'text', value: value || '', 'aria-label': label });
      panel.appendChild(input);
      // A Korean IME fires Enter once to commit the composition and once to
      // submit; `isComposing` keeps the first one from saving early.
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); close(); finish(input.value); }
      });
      panel.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'primary', type: 'button', text: 'Save', onclick: () => { close(); finish(input.value); } }),
        el('button', { type: 'button', text: 'Cancel', onclick: () => { close(); finish(null); } }),
      ]));
    });
  });
}

async function renameDocument(doc) {
  const next = await promptText('Rename', 'Title', doc.title || '');
  if (next === null) return;
  await store.patchDocument(doc.id, { title: String(next).trim() || doc.fileName });
  await store.touch(doc.id);
  await refreshLibrary();
  syncRunner.schedulePush();
}

async function editTags(doc) {
  const next = await promptText('Edit tags', 'Tags, separated by commas', (doc.tags || []).join(', '));
  if (next === null) return;
  const tags = String(next).split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
  await store.patchDocument(doc.id, { tags });
  await store.touch(doc.id);
  await refreshLibrary();
  syncRunner.schedulePush();
}

async function exportOriginal(doc) {
  const file = await store.getFile(doc.fileHash);
  if (!file || !file.blob) { toast('This document has no local copy.'); return; }
  const name = doc.fileName || `${doc.title}.bin`;
  const wrapped = new File([file.blob], name);
  if (navigator.canShare && navigator.canShare({ files: [wrapped] }) && navigator.share) {
    navigator.share({ files: [wrapped], title: name }).catch(() => downloadBlob(file.blob, name));
    return;
  }
  downloadBlob(file.blob, name);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Single delete is undoable, so it runs without a dialog (spec 7장).
    The sync tombstone is written only after the Undo window closes. */
async function deleteDocument(doc) {
  if (State.current && State.current.id === doc.id) await closeViewer();
  await store.softDelete(doc.id);
  await refreshLibrary();

  const timer = setTimeout(async () => {
    State.pendingUndo.delete(doc.id);
    const removed = await store.finalizeDelete(doc.id);
    if (removed) sync.markDeleted(removed);
    search.invalidateTextIndex();
    syncRunner.schedulePush();
  }, 5000);
  State.pendingUndo.set(doc.id, timer);

  toast('Deleted.', {
    actionLabel: 'Undo',
    onAction: async () => {
      clearTimeout(State.pendingUndo.get(doc.id));
      State.pendingUndo.delete(doc.id);
      await store.undoDelete(doc.id);
      await refreshLibrary();
    },
  });
}

/* ── external links ────────────────────────────────────────────────────── */

async function openExternal(url) {
  if (/^(?:mailto|tel|sms):/i.test(url)) { window.location.href = url; return; }
  if (!/^https?:\/\//i.test(url)) { toast('Unsupported link'); return; }
  const ok = await confirmDialog({
    title: 'Open this link?',
    message: url,
    confirmLabel: 'Open link',
  });
  if (!ok) return;
  // A click inside a sandboxed frame carries no user activation, so window.open
  // can be blocked; this call comes from a real tap on the dialog button.
  let opened = null;
  try { opened = window.open(url, '_blank', 'noopener'); } catch { opened = null; }
  if (!opened) { try { window.location.href = url; } catch { toast('Could not open link'); } }
}

/* ── viewer ────────────────────────────────────────────────────────────── */

/* Handlers report their position while they paint, which can be before the
   bottom bar exists, so the last value is remembered and applied when it does. */
let bottomText = '';
function setBottomText(text) {
  bottomText = String(text || '');
  const slot = $('#viewerBottom').querySelector('.vbottom-text');
  if (slot) slot.textContent = bottomText;
}

/** The `Needs file` flow. Returns true when the document is usable again. */
async function reconnectDocument(fresh) {
  const answer = await confirmDialog({
    title: 'Choose the original file',
    message: [
      fresh.fileName || fresh.title,
      formatBytes(fresh.size),
      fresh.pageCount ? `${fresh.pageCount} pages` : '',
      fresh.rowCount ? `${fresh.rowCount} rows` : '',
    ].filter(Boolean).join(' · '),
    confirmLabel: 'Choose file',
  });
  if (!answer) return false;
  const result = await relink.reconnect(fresh, {
    pickFile: pickOneFile,
    importFiles: (files) => handleImport(files),
  });
  await refreshLibrary();
  return result === 'linked';
}

async function openDocument(doc) {
  const fresh = await store.getDocument(doc.id);
  if (!fresh) { await refreshLibrary(); return; }

  if (fresh.released) {
    if (!await reconnectDocument(fresh)) return;
    return openDocument(fresh);
  }

  const file = await store.getFile(fresh.fileHash);
  if (!file || !file.blob) {
    await store.patchDocument(fresh.id, { released: true });
    await refreshLibrary();
    toast('This document needs its original file.');
    return;
  }

  State.assetReturn = null;
  await showInViewer(fresh, file.blob);
  await refreshLibrary();
}

/** Mount one document — stored or transient — into the viewer chrome. */
async function showInViewer(record, blob, { transient = false } = {}) {
  await closeViewer();
  State.current = record;
  State.transient = transient;
  bottomText = '';
  if (!transient) await store.touch(record.id);

  $('#viewerTitle').textContent = record.title || record.fileName || '';
  $('#viewer').classList.remove('bars-hidden');
  const body = $('#viewerBody');
  clear(body);
  body.appendChild(el('div', { class: 'empty', text: 'Opening…' }));
  show('viewer');

  const handler = HANDLERS[record.kind];
  if (!handler) { clear(body); body.appendChild(el('div', { class: 'empty', text: 'folio has no viewer for this document.' })); return; }

  const context = buildContext(record, blob, body, transient);
  let view;
  try {
    view = await handler.render(context);
  } catch (error) {
    clear(body);
    body.appendChild(el('div', { class: 'empty' }, [
      el('p', { text: 'This file could not be read. It may be damaged.' }),
      transient
        ? el('button', { type: 'button', text: 'Export file', onclick: () => downloadBlob(blob, record.fileName || 'file') })
        : el('button', { type: 'button', text: 'Export original', onclick: () => exportOriginal(record) }),
    ]));
    console.warn('viewer', error);
    return;
  }
  State.view = view;

  const tools = $('#viewerTools');
  clear(tools);
  (view.tools || []).forEach((tool) => tools.appendChild(tool));

  const bottom = $('#viewerBottom');
  clear(bottom);
  const wantsBottom = (view.bottom && view.bottom.length) || ['text', 'csv'].includes(record.kind);
  if (wantsBottom) {
    (view.bottom || []).forEach((control) => bottom.appendChild(control));
    bottom.appendChild(el('span', { class: 'vbottom-text small muted', text: bottomText }));
    bottom.classList.remove('hidden');
  } else {
    bottom.classList.add('hidden');
  }

  const reading = transient ? {} : await store.getReadingState(record.id);
  applyDocZoom(reading);
  attachBodyGestures(body);
  if (['text', 'markdown'].includes(record.kind)) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const max = Math.max(0, body.scrollHeight - body.clientHeight);
      const ratio = Number(reading.scrollRatio ?? reading.progress);
      const target = Number.isFinite(ratio) && ratio > 0 ? ratio * max : Number(reading.scrollY || 0);
      body.scrollTop = Math.max(0, Math.min(max, target));
    }));
  }

  if (!settings.get('viewerHintSeen')) {
    settings.set('viewerHintSeen', true);
    toast('Tap the page to hide the bars.');
  }
}

function buildContext(doc, blob, body, transient = false) {
  return {
    doc,
    blob,
    body,
    openExternal,
    setBottomText,
    async patchDoc(patch) {
      if (transient) { Object.assign(doc, patch); return doc; }
      const next = await store.patchDocument(doc.id, patch);
      if (next) Object.assign(doc, patch);
      return next;
    },
    readingState: () => (transient ? Promise.resolve({}) : store.getReadingState(doc.id)),
    saveReading: (patch) => {
      if (transient) return Promise.resolve({});
      const merged = { ...patch };
      if (patch.scrollY !== undefined && body.scrollHeight > body.clientHeight) {
        merged.progress = Math.min(1, patch.scrollY / Math.max(1, body.scrollHeight - body.clientHeight));
      }
      if (patch.page && doc.pageCount) merged.progress = patch.page / doc.pageCount;
      return store.putReadingState(doc.id, merged);
    },
    packageAssets: () => (transient ? Promise.resolve({}) : store.getPackageAssets(doc.id)),
    openFind: (finder) => openFindSheet(finder),
    openPdfFind: (pdf, goToPage) => openPdfFindSheet(pdf, goToPage),
    openAsset: (path) => openPackageAsset(doc, path),
    async reconnect() {
      if (await reconnectDocument(doc)) await openDocument(doc);
    },
  };
}

/* ── opening a file that lives inside a package ────────────────────────── */

const ASSET_MIME_FALLBACK = 'application/octet-stream';

/**
 * A link inside a package opens in folio's own viewer — PDF.js for a PDF, the
 * image viewer for a picture — instead of navigating the sandbox to a
 * multi-megabyte data: URL.
 *
 * The Blob is built HERE, on the app side. The sandbox never receives it: its
 * origin is opaque, so a blob: URL would be unreadable there anyway, and
 * handing one over would blur the isolation that keeps a stored document away
 * from the rest of the library.
 */
async function openPackageAsset(parentDoc, path) {
  const assets = await store.getPackageAssets(parentDoc.id);
  const asset = assets[path];
  if (!asset) { toast('This file is not in the package.'); return; }

  const blob = new Blob([pkg.fromBase64(asset.data)], { type: asset.mime || ASSET_MIME_FALLBACK });
  const fileName = path.split('/').pop() || path;
  const probe = new File([blob], fileName, { type: blob.type });
  const { kind } = await detect(probe);

  if (!kind || !HANDLERS[kind]) {
    const ok = await confirmDialog({
      title: 'Export this file?',
      message: `folio has no viewer for ${fileName}.`,
      confirmLabel: 'Export file',
    });
    if (ok) downloadBlob(blob, fileName);
    return;
  }

  // Where Back returns to. The package's own scroll position was saved while
  // it was open, so reopening it lands where the link was tapped.
  State.assetReturn = { docId: parentDoc.id };
  await showInViewer({
    id: `${parentDoc.id}#${path}`,
    kind,
    title: fileName,
    fileName,
    size: blob.size,
  }, blob, { transient: true });
}

async function leaveViewer() {
  const back = State.assetReturn;
  State.assetReturn = null;
  if (back) {
    const parent = await store.getDocument(back.docId);
    if (parent) { await openDocument(parent); return; }
  }
  await closeViewer();
  show('library');
  await refreshLibrary();
}

async function flushViewerReading() {
  if (State.scrollSaveTimer) {
    clearTimeout(State.scrollSaveTimer);
    State.scrollSaveTimer = null;
  }
  const current = State.current;
  if (!current) { State.pendingZoom = null; return; }
  if (State.transient) { State.pendingZoom = null; return; }
  if (State.view && State.view.flush) await State.view.flush();
  if (['text', 'markdown'].includes(current.kind)) {
    const body = $('#viewerBody');
    const max = Math.max(1, body.scrollHeight - body.clientHeight);
    await store.putReadingState(current.id, {
      scrollY: body.scrollTop,
      scrollRatio: Math.min(1, body.scrollTop / max),
      progress: Math.min(1, body.scrollTop / max),
    });
  }
  if (State.pendingZoom !== null && ZOOM_KINDS.has(current.kind)) {
    await store.putReadingState(current.id, { zoom: State.pendingZoom });
    State.pendingZoom = null;
  }
}

async function closeViewer() {
  await flushViewerReading().catch(() => {});
  State.pendingZoom = null;
  State.viewerAbort?.abort();
  State.viewerAbort = null;
  if (State.view && State.view.destroy) { try { State.view.destroy(); } catch { /* already gone */ } }
  State.view = null;
  State.current = null;
  State.transient = false;
  const body = $('#viewerBody');
  clear(body);
  clear($('#viewerTools'));
  clear($('#viewerBottom'));
}

function onViewerScroll() {
  const body = $('#viewerBody');
  const docId = State.current && State.current.id;
  if (State.scrollSaveTimer) clearTimeout(State.scrollSaveTimer);
  State.scrollSaveTimer = setTimeout(() => {
    if (!State.current || State.transient) return;
    const max = Math.max(1, body.scrollHeight - body.clientHeight);
    store.putReadingState(docId, {
      scrollY: body.scrollTop,
      scrollRatio: Math.min(1, body.scrollTop / max),
      progress: Math.min(1, body.scrollTop / max),
    }).catch(() => {});
  }, 700);
}

/* ── document text size: pinch, with a single-pointer alternative ──────── */

const ZOOM_KINDS = new Set(['text', 'markdown', 'html']);
const DOC_STEPS = [6, 8, 10, 12, 15, 19];

function textZoomAvailable() {
  if (!State.current || !ZOOM_KINDS.has(State.current.kind)) return false;
  return !State.view || !State.view.textZoomEnabled || State.view.textZoomEnabled();
}

function applyDocZoom(state) {
  const step = DOC_STEPS.includes(Number(state && state.zoom)) ? Number(state.zoom) : 15;
  document.documentElement.style.setProperty('--fs-doc', `${step}px`);
}

async function setDocZoom(step) {
  if (!State.current) return;
  document.documentElement.style.setProperty('--fs-doc', `${step}px`);
  if (State.transient) return;
  await store.putReadingState(State.current.id, { zoom: step });
}

function attachBodyGestures(body) {
  State.viewerAbort?.abort();
  const controller = new AbortController();
  State.viewerAbort = controller;
  const signal = controller.signal;
  body.addEventListener('scroll', onViewerScroll, { passive: true, signal });

  // Tap the page to hide both bars; the safe-area padding stays (spec 3-1).
  body.addEventListener('click', (event) => {
    if (event.target.closest('a,button,input,select,textarea,iframe,mark')) return;
    $('#viewer').classList.toggle('bars-hidden');
  }, { signal });

  if (!textZoomAvailable()) return;

  // Custom pinch, body only, so the browser's own page zoom keeps working.
  let startDistance = 0;
  let startIndex = 3;
  const active = new Map();
  const distance = () => {
    const points = Array.from(active.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  body.addEventListener('pointerdown', (event) => {
    if (!textZoomAvailable()) return;
    if (event.pointerType !== 'touch') return;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (active.size === 2) {
      startDistance = distance();
      const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs-doc'), 10) || 15;
      startIndex = Math.max(0, DOC_STEPS.indexOf(current));
      if (startIndex < 0) startIndex = 4;
    }
  }, { signal });
  body.addEventListener('pointermove', (event) => {
    if (!active.has(event.pointerId)) return;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (active.size !== 2 || !startDistance) return;
    const ratio = distance() / startDistance;
    const shift = ratio > 1.18 ? 1 : ratio < 0.85 ? -1 : 0;
    if (!shift) return;
    const next = Math.max(0, Math.min(DOC_STEPS.length - 1, startIndex + shift));
    startDistance = distance();
    startIndex = next;
    State.pendingZoom = DOC_STEPS[next];
    document.documentElement.style.setProperty('--fs-doc', `${State.pendingZoom}px`);
  }, { signal });
  const drop = (event) => {
    active.delete(event.pointerId);
    if (active.size < 2) {
      startDistance = 0;
      if (State.pendingZoom !== null && State.current && !State.transient) {
        const zoom = State.pendingZoom;
        State.pendingZoom = null;
        store.putReadingState(State.current.id, { zoom }).catch(() => {});
      }
    }
  };
  body.addEventListener('pointerup', drop, { signal });
  body.addEventListener('pointercancel', drop, { signal });
}

/** The title button is the single-pointer alternative to the pinch, required
    by WCAG 2.1 SC 2.5.1 (design 8장). */
function openDocumentSheet() {
  const doc = State.current;
  if (!doc) return;
  customSheet((panel, close) => {
    panel.appendChild(el('h2', { text: doc.title || doc.fileName || 'Document' }));
    if (textZoomAvailable()) {
      panel.appendChild(el('p', { class: 'small muted', text: 'Text size' }));
      const segment = el('div', { class: 'seg', role: 'group', 'aria-label': 'Text size' });
      DOC_STEPS.forEach((step) => {
        segment.appendChild(el('button', { type: 'button', text: String(step), onclick: () => setDocZoom(step) }));
      });
      panel.appendChild(segment);
    }
    // A file opened from inside a package has no library record to pin,
    // rename or export as an original.
    if (State.transient) {
      panel.appendChild(el('p', { class: 'small muted', text: 'This file is inside a package.' }));
      return;
    }
    panel.appendChild(el('div', { class: 'row' }, [
      el('button', { type: 'button', text: doc.pinned ? 'Unpin' : 'Pin', onclick: () => { close(); togglePin(doc); } }),
      el('button', { type: 'button', text: 'Rename', onclick: () => { close(); renameDocument(doc); } }),
      el('button', { type: 'button', text: 'Export original', disabled: doc.released, onclick: () => { close(); exportOriginal(doc); } }),
    ]));
  });
}

/* ── find ──────────────────────────────────────────────────────────────── */

function openFindSheet(finder) {
  customSheet((panel) => {
    panel.appendChild(el('h2', { text: 'Find' }));
    const input = el('input', { type: 'search', 'aria-label': 'Find in document', enterkeyhint: 'search' });
    const count = el('p', { class: 'small muted', text: '' });
    let request = 0;
    const run = async () => {
      const current = ++request;
      count.textContent = 'Searching…';
      const found = await finder.search(input.value);
      if (current !== request || found === null) return;
      count.textContent = found ? `${found} matches` : 'No matches';
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); run(); }
    });
    panel.appendChild(input);
    panel.appendChild(count);
    panel.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'primary', type: 'button', text: 'Find', onclick: run }),
      el('button', { type: 'button', text: 'Previous', onclick: () => finder.previous() }),
      el('button', { type: 'button', text: 'Next', onclick: () => finder.next() }),
      el('button', { type: 'button', text: 'Clear', onclick: () => { request += 1; finder.clear(); count.textContent = ''; } }),
    ]));
  });
}

function openPdfFindSheet(pdf, goToPage) {
  customSheet((panel) => {
    panel.appendChild(el('h2', { text: 'Find' }));
    const input = el('input', { type: 'search', 'aria-label': 'Find in document', enterkeyhint: 'search' });
    const results = el('menu');
    const run = async () => {
      clear(results);
      const needle = input.value.trim().toLowerCase();
      if (!needle) return;
      const limit = Math.min(pdf.numPages, 400);
      let hits = 0;
      for (let page = 1; page <= limit && hits < 40; page += 1) {
        const content = await (await pdf.getPage(page)).getTextContent();
        const text = content.items.map((item) => item.str).join(' ');
        const at = text.toLowerCase().indexOf(needle);
        if (at < 0) continue;
        hits += 1;
        const excerpt = text.slice(Math.max(0, at - 30), at + 60).replace(/\s+/g, ' ');
        results.appendChild(el('li', {}, [el('button', {
          type: 'button', text: `p.${page} — ${excerpt}`,
          onclick: () => goToPage(page),
        })]));
      }
      if (!hits) results.appendChild(el('li', {}, [el('p', { class: 'small muted', text: 'No matches' })]));
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); run(); }
    });
    panel.appendChild(input);
    panel.appendChild(el('div', { class: 'row' }, [el('button', { class: 'primary', type: 'button', text: 'Find', onclick: run })]));
    panel.appendChild(results);
  });
}

/* ── settings ──────────────────────────────────────────────────────────── */

function paintSegments() {
  $$('#segTextSize button').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.fs) === settings.get('fs')));
  });
  $$('#segTheme button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.theme === settings.get('theme')));
  });
  $$('#segRetention button').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.days) === settings.get('retentionDays')));
  });
  $('#lastCleanup').textContent = retention.lastCleanupLine();
  $('#buildLine').textContent = `Build ${APP_BUILD}`;
}

async function paintUsage() {
  const { totals, total } = await store.usageByFamily();
  const quota = await store.estimateQuota();
  const { bar, text } = library.usageSummary(totals, total, quota);
  const host = $('#usageBar');
  clear(host);
  Array.from(bar.children).forEach((piece) => host.appendChild(piece));
  $('#usageText').textContent = text;
}

function paintSyncState() {
  const line = $('#syncState');
  if (!sync.isEnabled()) {
    line.textContent = 'Off — everything stays on this device.';
    $('#btnSyncToggle').textContent = 'Turn on';
    $('#syncTokenRow').classList.add('hidden');
    return;
  }
  const label = sync.getContextLabel() || sync.getContextId() || 'this device';
  const last = sync.getLastSyncAt();
  const ago = last ? `${Math.max(1, Math.round((Date.now() - last) / 60000))} min ago` : 'never';
  line.textContent = `On · device ${label} · last sync ${ago}`;
  $('#btnSyncToggle').textContent = 'Turn off';
  $('#syncTokenRow').classList.remove('hidden');
}

async function toggleSync() {
  if (sync.isEnabled()) {
    sync.setEnabled(false);
    paintSyncState();
    return;
  }
  // The context id is fixed when it is created and ends up in the remote file
  // name, so the device name is asked for BEFORE sync is switched on.
  const name = await promptText('Name this device', 'Device name', sync.getContextLabel() || '');
  if (name === null) return;
  try {
    await sync.ensureContext(name);
    sync.setContextLabel(name);
    sync.setEnabled(true);
    paintSyncState();
    toast('Sync is on. Add an access token to start.');
  } catch (error) {
    toast(sync.describeError(error));
  }
}

async function exportBackup() {
  const built = await backup.build();
  const ok = await confirmDialog({
    title: 'Export backup',
    message: [
      `About ${formatBytes(Math.round(built.bytes * 1.02))} as a file.`,
      built.skipped.length ? `${built.skipped.length} document${built.skipped.length === 1 ? '' : 's'} are listed but not included.` : '',
    ].filter(Boolean).join('\n'),
    confirmLabel: 'Save',
  });
  if (!ok) return;
  // Built already; save() runs synchronously inside this tap so Safari keeps
  // the user gesture alive for the Share Sheet.
  backup.save(built.json, built.fileName);
  toast('Backup saved.');
  if (built.skipped.length) {
    customSheet((panel) => {
      panel.appendChild(el('h2', { text: 'Not included in the backup' }));
      built.skipped.slice(0, 40).forEach((item) => {
        panel.appendChild(el('p', { class: 'small muted', text: `${item.title} — ${item.reason}` }));
      });
    });
  }
}

async function restoreBackup(file) {
  let parsed;
  try {
    parsed = backup.validate(JSON.parse(await file.text()));
  } catch (error) {
    toast(String((error && error.message) || 'This file is not a folio backup.'));
    return;
  }
  const ok = await confirmDialog({
    title: 'Replace everything?',
    message: 'Restoring replaces the documents currently in folio.',
    confirmLabel: 'Replace',
    danger: true,
  });
  if (!ok) return;
  try {
    const restored = await backup.restore(parsed);
    search.invalidateTextIndex();
    await refreshLibrary();
    await paintUsage();
    paintSegments();
    toast(`Restored ${restored} document${restored === 1 ? '' : 's'}.`);
  } catch (error) {
    console.warn('restore', error);
    toast('Restore failed — your existing library was not changed.');
  }
}

async function deleteAll() {
  const ok = await confirmDialog({
    title: 'Delete all documents?',
    message: 'This deletes everything folio has stored, including pinned documents and highlights. Back up first if you want to keep a copy.',
    confirmLabel: 'Delete all',
    danger: true,
  });
  if (!ok) return;
  const docs = await store.listDocuments();
  await store.deleteEverything();
  // A whole-library delete IS a user delete, so tombstones are correct here.
  docs.forEach((doc) => sync.markDeleted(doc));
  search.invalidateTextIndex();
  await refreshLibrary();
  await paintUsage();
  toast(`Deleted ${docs.length} document${docs.length === 1 ? '' : 's'}.`);
}

async function releaseNow(silent) {
  const days = settings.get('retentionDays');
  if (!days) { if (!silent) toast('Retention is set to Never — nothing to release.'); return; }
  const expired = await retention.findExpired();
  if (!expired.length) {
    settings.setLastCleanupAt(new Date().toISOString());
    paintSegments();
    if (!silent) toast('Nothing to release.');
    return;
  }
  if (!settings.get('releaseConfirmed')) {
    const answer = await confirmDialog({
      title: `Release ${expired.length} local ${expired.length === 1 ? 'copy' : 'copies'}?`,
      message: `These documents haven't been opened in ${days} days. folio will delete the local copy and keep the title, tags, reading position and highlights. You'll need the original file from Files to open them again.`,
      confirmLabel: 'Release',
      extraLabel: 'Pin these',
    });
    if (answer === 'extra') {
      for (const doc of expired.slice(0, retention.PIN_LIMIT)) await store.patchDocument(doc.id, { pinned: true });
      await refreshLibrary();
      return;
    }
    if (!answer) return;
    settings.set('releaseConfirmed', true);
  }
  const released = await retention.releaseExpired(expired);
  paintSegments();
  await refreshLibrary();
  await paintUsage();
  toast(`Released ${released} document${released === 1 ? '' : 's'}.`);
}

function showLicences() {
  const items = [
    ['PDF.js', 'Apache-2.0', 'licenses/pdfjs-Apache-2.0.txt'],
    ['marked', 'MIT', 'licenses/marked-MIT.txt'],
    ['DOMPurify', 'MPL-2.0 or Apache-2.0', 'licenses/dompurify-MPL-2.0-or-Apache-2.0.txt'],
    ['papaparse', 'MIT', 'licenses/papaparse-MIT.txt'],
    ['Dexie', 'Apache-2.0', 'licenses/dexie-Apache-2.0.txt'],
    ['highlight.js', 'BSD-3-Clause', 'licenses/highlightjs-BSD-3-Clause.txt'],
    ['Lexend', 'SIL OFL', 'licenses/Lexend-OFL.txt'],
  ];
  customSheet((panel) => {
    panel.appendChild(el('h2', { text: 'Licences' }));
    items.forEach(([name, licence, href]) => {
      panel.appendChild(el('p', { class: 'small' }, [
        el('a', { href, target: '_blank', rel: 'noopener', text: `${name} — ${licence}` }),
      ]));
    });
  });
}

/* ── wiring ────────────────────────────────────────────────────────────── */

function wire() {
  let searchTimer = null;
  const queryInput = $('#q');
  // Never search mid-composition: a Korean IME would search the half-formed
  // syllable and then again on commit.
  const scheduleSearch = () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshLibrary(), 200);
  };
  queryInput.addEventListener('input', (event) => { if (!event.isComposing) scheduleSearch(); });
  queryInput.addEventListener('compositionend', scheduleSearch);
  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); refreshLibrary(); }
  });

  $('#btnSort').addEventListener('click', async () => {
    const picked = await choose('Sort', search.SORT_OPTIONS, settings.get('sort'));
    if (!picked) return;
    settings.set('sort', picked);
    refreshLibrary();
  });

  $('#btnTypeFilter').addEventListener('click', () => {
    const selected = settings.get('typeFilter');
    customSheet((panel, close) => {
      panel.appendChild(el('h2', { text: 'Filter by type' }));
      const menu = el('menu');
      KINDS.forEach((kind) => {
        const on = selected.includes(kind);
        menu.appendChild(el('li', {}, [el('button', {
          type: 'button', text: `${TAG_OF[kind]}${on ? ' ·' : ''}`, 'aria-pressed': String(on),
          onclick: () => {
            const next = on ? selected.filter((value) => value !== kind) : selected.concat(kind);
            settings.set('typeFilter', next);
            close();
            refreshLibrary();
          },
        })]));
      });
      panel.appendChild(menu);
      panel.appendChild(el('button', { type: 'button', text: 'Show all types', onclick: () => { settings.set('typeFilter', []); close(); refreshLibrary(); } }));
    });
  });

  $$('#stateChips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      settings.set('stateFilter', chip.dataset.state);
      paintChips();
      refreshLibrary();
    });
  });

  $('#btnImport').addEventListener('click', pickFiles);
  $('#filePicker').addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    handleImport(files);
  });

  // iPad drag and drop.
  document.addEventListener('dragover', (event) => { event.preventDefault(); });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = event.dataTransfer && event.dataTransfer.files;
    if (files && files.length) handleImport(Array.from(files));
  });

  $('#btnSettings').addEventListener('click', async () => {
    show('settings');
    paintSegments();
    paintSyncState();
    await paintUsage();
  });
  $('#btnSettingsBack').addEventListener('click', () => { show('library'); refreshLibrary(); });

  $('#btnBack').addEventListener('click', () => { leaveViewer(); });
  $('#viewerTitle').addEventListener('click', openDocumentSheet);

  $$('#segTextSize button').forEach((button) => {
    button.addEventListener('click', () => { settings.set('fs', Number(button.dataset.fs)); paintSegments(); refreshContinue(); });
  });
  $('#btnTextReset').addEventListener('click', () => { settings.resetFontSize(); paintSegments(); refreshContinue(); });
  $$('#segTheme button').forEach((button) => {
    button.addEventListener('click', () => { settings.set('theme', button.dataset.theme); paintSegments(); });
  });
  $$('#segRetention button').forEach((button) => {
    button.addEventListener('click', () => { settings.set('retentionDays', Number(button.dataset.days)); paintSegments(); refreshLibrary(); });
  });
  $('#btnReleaseNow').addEventListener('click', () => releaseNow(false));

  $('#btnExportBackup').addEventListener('click', exportBackup);
  $('#btnRestoreBackup').addEventListener('click', () => $('#restorePicker').click());
  $('#restorePicker').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (file) restoreBackup(file);
  });

  $('#btnSyncToggle').addEventListener('click', toggleSync);
  $('#btnSyncSave').addEventListener('click', () => {
    const value = $('#syncToken').value;
    if (!sync.saveToken(value)) { toast('That token could not be saved.'); return; }
    $('#syncToken').value = '';
    toast('Token saved.');
    paintSyncState();
  });
  $('#btnSyncNow').addEventListener('click', async () => {
    const result = await syncRunner.runSync();
    if (result && result.error) toast(sync.describeError(result.error));
    else toast('Sync finished.');
    paintSyncState();
  });

  $('#btnDeleteAll').addEventListener('click', deleteAll);
  $('#btnLicences').addEventListener('click', showLicences);

  window.addEventListener('orientationchange', () => { if (State.current) show('viewer'); });
  window.addEventListener('resize', () => { if (State.current) show('viewer'); });
}

/* ── boot ──────────────────────────────────────────────────────────────── */

async function boot() {
  settings.applyFontSize();
  settings.applyTheme();
  settings.watchSystemTheme();
  paintChips();
  wire();

  try {
    await store.open();
  } catch (error) {
    State.storageOk = false;
    console.warn('storage', error);
  }

  if (State.storageOk) {
    // An Undo window that was still open when the app closed resolves as a
    // delete — the user already asked for it (plan 8-1).
    try {
      const finalized = await store.finalizePendingDeletes();
      finalized.forEach((doc) => sync.markDeleted(doc));
    } catch { /* storage unavailable */ }
  }

  await refreshLibrary();
  paintSegments();

  syncRunner.attach({ getDocs: () => store.listDocuments() });
  syncRunner.onSyncState(() => paintSyncState());
  if (sync.isReady()) syncRunner.schedulePush();

  // Retention runs once a day at most, and never before the library is drawn.
  const lastCleanup = settings.getLastCleanupAt();
  const due = !lastCleanup || Date.now() - new Date(lastCleanup).getTime() > 86400000;
  if (due && settings.get('retentionDays')) setTimeout(() => releaseNow(true).catch(() => {}), 1500);

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch { /* offline install can retry later */ }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
