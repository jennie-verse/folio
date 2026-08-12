/* settings.js — app preferences in localStorage under `folio.v1`.
   Only small, non-document values live here; documents are in IndexedDB. */

const KEY = 'folio.v1';
export const CLEANUP_KEY = 'folio.v1.lastCleanupAt';   // tide key convention

export const FONT_STEPS = [6, 8, 10, 12, 14, 17];
export const DEFAULT_FS = 12;
export const RETENTION_CHOICES = [7, 14, 30, 0];

const DEFAULTS = Object.freeze({
  fs: DEFAULT_FS,
  theme: 'system',            // system | light | dark
  retentionDays: 7,
  sort: 'recent',             // recent | added | title | size | kind
  stateFilter: 'all',         // all | pinned | needs | recent
  typeFilter: [],             // empty = every kind
  releaseConfirmed: false,    // the first automatic release asks once
  viewerHintSeen: false,
});

let cache = null;

function read() {
  if (cache) return cache;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { stored = null; }
  cache = { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };
  if (!FONT_STEPS.includes(Number(cache.fs))) cache.fs = DEFAULT_FS;
  if (!['system', 'light', 'dark'].includes(cache.theme)) cache.theme = 'system';
  if (!RETENTION_CHOICES.includes(Number(cache.retentionDays))) cache.retentionDays = 7;
  if (!Array.isArray(cache.typeFilter)) cache.typeFilter = [];
  return cache;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* private mode */ }
}

export function get(name) { return read()[name]; }
export function all() { return { ...read() }; }

export function set(name, value) {
  read();
  cache[name] = value;
  write();
  if (name === 'fs') applyFontSize();
  if (name === 'theme') applyTheme();
}

export function getLastCleanupAt() {
  try { return localStorage.getItem(CLEANUP_KEY) || ''; } catch { return ''; }
}
export function setLastCleanupAt(iso) {
  try { localStorage.setItem(CLEANUP_KEY, iso); } catch { /* private mode */ }
}

/* ── applying ──────────────────────────────────────────────────────────── */

export function applyFontSize() {
  document.documentElement.style.setProperty('--fs', `${read().fs}px`);
}

const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme() {
  const choice = read().theme;
  const dark = choice === 'dark' || (choice === 'system' && media && media.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export function watchSystemTheme() {
  if (!media) return;
  const handler = () => { if (read().theme === 'system') applyTheme(); };
  if (media.addEventListener) media.addEventListener('change', handler);
  else if (media.addListener) media.addListener(handler);
}

/** Font steps 6 and 8 are the dense modes; the Continue row folds away there. */
export function isCompact() { return read().fs <= 8; }

export function resetFontSize() { set('fs', DEFAULT_FS); }

export function clearAll() {
  cache = { ...DEFAULTS };
  write();
  try { localStorage.removeItem(CLEANUP_KEY); } catch { /* private mode */ }
  applyFontSize();
  applyTheme();
}
