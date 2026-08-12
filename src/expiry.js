/* expiry.js — the retention arithmetic, kept free of storage and DOM so the
   boundary cases can be tested directly (plan 12장). */

/** Formats that are never released: they cost almost nothing, and releasing
    them would mean picking the file again on every open (plan 7장). */
export const NEVER_RELEASED = new Set(['text', 'markdown', 'html', 'csv']);

const DAY = 86400000;

/** A pinned document's clock is stopped; `Never` (0 days) stops everyone's. */
export function isExpired(doc, retentionDays, now = Date.now()) {
  if (!retentionDays) return false;
  if (!doc || doc.pinned) return false;
  if (NEVER_RELEASED.has(doc.kind)) return false;
  const touched = Number(doc.lastTouchedAt) || 0;
  if (!touched) return false;
  return now - touched >= retentionDays * DAY;
}

/** Days remaining, or null when the document cannot expire. */
export function daysLeft(doc, retentionDays, now = Date.now()) {
  if (!retentionDays || !doc || doc.pinned || NEVER_RELEASED.has(doc.kind)) return null;
  const touched = Number(doc.lastTouchedAt) || 0;
  if (!touched) return null;
  return Math.ceil((touched + retentionDays * DAY - now) / DAY);
}

/** The badge shows only in the last three days (design 5장). */
export function expiryBadge(doc, retentionDays, now = Date.now()) {
  const left = daysLeft(doc, retentionDays, now);
  if (left === null || left > 3) return '';
  return `${Math.max(0, left)}d`;
}
