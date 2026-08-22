import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFileActivity } from '../src/journal-record.js';

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

test('actual open, read, import, and export paths are wired without touching retention semantics', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const action of ["'added'", "'opened'", "'read'", "'export-requested'"]) {
    assert.ok(app.includes(`recordActivity(`) && app.includes(action), `missing ${action}`);
  }
  assert.match(app, /openDocument\(parent, \{ journalOpened: false \}\)/);
  assert.match(app, /if \(changed && State\.view/);
  assert.match(app, /await store\.touch\(record\.id\)/, 'existing retention clock remains intact');
});
