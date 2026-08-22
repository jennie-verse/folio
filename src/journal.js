import * as sync from './sync.js';
import { localDate, localIso, mergeFileActivity } from './journal-record.js';
import { webappDataConfig } from './deployment.js';

const ENABLED_KEY = 'folio.journalEnabled.v1';
const ACTIVITY_KEY = 'folio.journalActivity.v1';
let clientPromise = null;
let lastState = { status: 'not reported', pendingCount: 0, errorCode: '' };

function readItem(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function writeItem(key, value) { try { localStorage.setItem(key, value); } catch { /* local app remains usable */ } }
function parse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }

function activityMap() {
  const value = parse(readItem(ACTIVITY_KEY), {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function saveActivityMap(value) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);
  const cutoffDate = localDate(cutoff);
  const kept = Object.fromEntries(Object.entries(value).filter(([key]) => key.slice(0, 10) >= cutoffDate));
  writeItem(ACTIVITY_KEY, JSON.stringify(kept));
}

function safeCode(error, fallback) {
  return typeof error?.code === 'string' && /^[A-Z0-9_-]{1,64}$/.test(error.code) ? error.code : fallback;
}

export function isJournalEnabled() { return readItem(ENABLED_KEY) === '1'; }
export function getJournalState() { return { enabled: isJournalEnabled(), ...lastState }; }

async function getClient() {
  if (clientPromise) {
    const existing = await clientPromise;
    if (existing) return existing;
    clientPromise = null;
  }
  clientPromise = (async () => {
    const context = sync.getContextId();
    if (!context) return null;
    const module = await import('../../shared/v2/journal.js');
    return module.createJournalClient({
      app: 'folio', context, namespace: 'folio-journal', isEnabled: isJournalEnabled,
      resolveConfig: async () => {
        const token = sync.getToken();
        if (!token) throw Object.assign(new Error('Journal authentication unavailable'), { code: 'AUTH' });
        return webappDataConfig(token);
      },
      onState: state => { lastState = {
        ...lastState, status: state.status, pendingCount: state.pendingCount,
        errorCode: state.errorCode || '', lastSuccessfulWriteAt: state.lastSuccessfulWriteAt,
      }; },
    });
  })().catch(() => null);
  return clientPromise;
}

export async function toggleJournal(enabled, preferredName = '') {
  if (enabled) {
    if (!sync.getToken()) return { ok: false, reason: 'token' };
    try {
      if (!sync.getContextId()) await sync.ensureContext(preferredName);
      if (preferredName) sync.setContextLabel(preferredName);
    } catch { return { ok: false, reason: 'context' }; }
  }
  writeItem(ENABLED_KEY, enabled ? '1' : '0');
  clientPromise = null;
  lastState = { ...lastState, status: enabled ? 'ready' : 'disabled', errorCode: '' };
  await reportStatus({ enabledAt: enabled ? localIso() : undefined });
  return { ok: true };
}

export async function reportStatus(extra = {}) {
  const client = await getClient();
  if (!client) return false;
  try {
    await client.reportStatus({ journalEnabled: isJournalEnabled(), ...extra });
    return true;
  } catch (error) {
    lastState = { ...lastState, status: 'error', errorCode: safeCode(error, 'STATUS_FAILED') };
    return false;
  }
}

export async function recordActivity(doc, action, { at = new Date(), importedHistory = false } = {}) {
  if (!doc?.id) return false;
  if (!isJournalEnabled()) return false;
  const date = localDate(at);
  const key = `${date}:${doc.id}`;
  const map = activityMap();
  const record = mergeFileActivity(map[key], doc, action, at, { importedHistory });
  map[key] = record;
  saveActivityMap(map);
  const client = await getClient();
  if (!client) { lastState = { ...lastState, status: 'error', errorCode: 'MODULE_UNAVAILABLE' }; return false; }
  try {
    await client.enqueue(record, { date });
    return true;
  } catch (error) {
    lastState = { ...lastState, status: 'error', errorCode: safeCode(error, 'QUEUE_FAILED') };
    return false;
  }
}

export async function backfillJournal(documents, { from, to }) {
  const client = await getClient();
  if (!client) return { written: 0, error: new Error('Journal unavailable') };
  const eligible = documents.filter(doc => {
    try { const date = localDate(Number(doc.addedAt)); return !doc.deletedAt && date >= from && date <= to; }
    catch { return false; }
  });
  const dates = new Set(eligible.map(doc => localDate(Number(doc.addedAt))));
  await reportStatus({ backfill: { status: 'running', from, to, processedDates: 0, totalDates: dates.size, updatedAt: localIso() } });
  for (const doc of eligible) {
    const record = mergeFileActivity(null, doc, 'added', Number(doc.addedAt), { importedHistory: true });
    await client.enqueue(record, { date: localDate(record.at) });
  }
  const result = await client.flush();
  await reportStatus({ backfill: {
    status: result.error ? 'partial' : 'complete', from, to,
    processedDates: result.error ? 0 : dates.size, totalDates: dates.size, updatedAt: localIso(),
  } });
  return { ...result, records: eligible.length, dates: dates.size };
}

export async function refreshJournalState() {
  const client = await getClient();
  if (client) { try { lastState.pendingCount = await client.pendingCount(); } catch { /* status only */ } }
  return getJournalState();
}
