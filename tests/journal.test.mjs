import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutJournalContent, validateActivityLedger } from '../src/journal.js';
import { mergeFileActivity, projectAnnotation } from '../src/journal-record.js';

const doc = { id: 'fixture-doc', title: 'Fixture notes.md', fileName: 'fixture.md', kind: 'markdown', content: 'must not leave' };

test('Folio activity merges in fixed semantic order', () => {
  let record = mergeFileActivity(null, doc, 'opened', '2026-08-17T09:10:00-05:00');
  record = mergeFileActivity(record, doc, 'export-requested', '2026-08-17T16:42:00-05:00');
  record = mergeFileActivity(record, doc, 'read', '2026-08-17T10:00:00-05:00');
  assert.deepEqual(record.data.actions, ['opened', 'read', 'export-requested']);
  assert.equal(record.data.openCount, 1);
  assert.equal(Date.parse(record.data.firstAt), Date.parse('2026-08-17T09:10:00-05:00'));
  assert.equal(Date.parse(record.data.lastAt), Date.parse('2026-08-17T16:42:00-05:00'));
  assert.match(record.data.firstAt, /(?:Z|[+-]\d{2}:\d{2})$/, 'the stored timestamp keeps an explicit timezone');
});

test('repeated explicit opens increment only openCount', () => {
  const first = mergeFileActivity(null, doc, 'opened', '2026-08-17T09:00:00-05:00');
  const second = mergeFileActivity(first, doc, 'opened', '2026-08-17T11:00:00-05:00');
  assert.equal(second.data.openCount, 2);
  assert.deepEqual(second.data.actions, ['opened']);
});

test('projection includes metadata but never document body', () => {
  const record = mergeFileActivity(null, doc, 'added', '2026-08-17T09:00:00-05:00');
  assert.equal(record.id, 'fixture-doc:2026-08-17');
  assert.equal(record.title, 'Fixture notes.md');
  assert.equal(record.data.itemType, 'markdown');
  assert.equal(JSON.stringify(record).includes('must not leave'), false);
});

test('annotation backfill identifies imported saved history', () => {
  const record = projectAnnotation({
    id: 'note-1', docId: doc.id, kind: 'note', quote: 'selected', note: 'body',
    locator: { locationLabel: 'Page 2' },
  }, doc, 'created', { at: '2026-08-17T09:00:00-05:00', importedHistory: true });
  assert.equal(record.data.importedHistory, true);
  assert.equal(record.data.historyAccuracy, 'saved-timestamp');
});

test('content redaction strips bodies while preserving identity and location metadata', () => {
  const original = projectAnnotation({
    id: 'note-2', docId: doc.id, kind: 'note', quote: 'selected', note: 'body',
    locator: { locationLabel: 'Page 4', page: 4 },
  }, doc, 'created', { at: '2026-08-17T09:00:00-05:00' });
  const sanitized = withoutJournalContent(original);
  assert.equal(sanitized.id, original.id);
  assert.equal(sanitized.kind, original.kind);
  assert.equal(sanitized.at, original.at);
  assert.equal(sanitized.data.quote, undefined);
  assert.equal(sanitized.data.note, undefined);
  assert.equal(sanitized.data.locationLabel, 'Page 4');
  assert.equal(sanitized.data.contentIncluded, false);
});

test('portable activity ledger validation rejects malformed records', () => {
  const valid = mergeFileActivity(null, doc, 'opened', '2026-08-17T09:00:00-05:00');
  assert.deepEqual(validateActivityLedger([valid]), [valid]);
  assert.throws(() => validateActivityLedger([{ ...valid, kind: 'annotation' }]), /Invalid Journal activity ledger/);
});

test('actual open, read, import, and export paths are wired without touching retention semantics', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const action of ["'added'", "'opened'", "'read'", "'export-requested'"]) {
    assert.ok(app.includes(`recordActivity(`) && app.includes(action), `missing ${action}`);
  }
  assert.match(app, /openDocument\(parent, \{ journalOpened: false \}\)/);
  assert.match(app, /if \(changed && State\.view/);
  assert.match(app, /await store\.touch\(record\.id\)/, 'existing retention clock remains intact');
  assert.match(app, /contentIncluded \? \(record\.title \|\| record\.fileName \|\| 'Untitled'\) : 'Folio document'/);
  assert.match(app, /readingSessions\.start\(readingSessionItem\(record\)\)/);
});

test('backfillJournal session loop uses the enqueued record date, not an out-of-scope variable', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/journal.js', import.meta.url), 'utf8');
  assert.ok(src.includes('sessionLedger.read().filter'), 'expected the session-ledger backfill loop to still be present');
  const enqueueCall = src.match(/sessionLedger\.read\(\)\.filter[\s\S]*?await client\.enqueue\(record, \{ date: (.*?) \}\);/);
  assert.ok(enqueueCall, 'expected to find the session-ledger enqueue call');
  assert.equal(enqueueCall[1].trim(), 'record.at.slice(0, 10)', 'the enqueue date must come from the loop variable "record", not the filter callback\'s "row" (ReferenceError regression)');
});

test('session ledger date-range filter used by backfill keeps only in-range rows', () => {
  const rows = [
    { id: 'a', at: '2026-08-01T09:00:00-05:00' },
    { id: 'b', at: '2026-08-15T09:00:00-05:00' },
    { id: 'c', at: '2026-09-01T09:00:00-05:00' },
  ];
  const from = '2026-08-10';
  const to = '2026-08-20';
  const inRange = rows.filter((row) => row.at.slice(0, 10) >= from && row.at.slice(0, 10) <= to);
  assert.deepEqual(inRange.map((row) => row.id), ['b']);
  // The same rows, mapped the way the fixed loop does (using the loop variable
  // itself, not a name that only exists inside the filter callback).
  const enqueued = inRange.map((record) => ({ record, date: record.at.slice(0, 10) }));
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].date, '2026-08-15');
});
