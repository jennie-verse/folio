import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// search.js imports store.js, which expects the vendored Dexie global.
globalThis.window = { Dexie: class { version() { return { stores() { return this; }, upgrade() { return this; } }; } } };
const search = await import('../src/search.js');
const settings = await readFile(new URL('../src/settings.js', import.meta.url), 'utf8');

const docs = [
  { id: 'a', title: 'Banana', size: 30, addedAt: 3, lastTouchedAt: 1, kind: 'text' },
  { id: 'b', title: '가나다', size: 10, addedAt: 1, lastTouchedAt: 3, kind: 'pdf', pinned: true },
  { id: 'c', title: 'Apple', size: 20, addedAt: 2, lastTouchedAt: 2, kind: 'csv' },
];
const ids = (mode) => search.sortDocuments(docs, mode).map((doc) => doc.id).join('');

test('every sort option has a working, distinct ordering', () => {
  assert.equal(ids('added'), 'bac');           // pinned first, then newest added
  assert.equal(ids('added-asc'), 'bca');
  assert.equal(ids('title'), 'bca');           // Korean sorts before Latin; pins do not float
  assert.equal(ids('title-desc'), 'acb');
  assert.equal(ids('size'), 'bac');
  assert.equal(ids('size-asc'), 'bca');
  for (const { value } of search.SORT_OPTIONS) assert.equal(search.sortDocuments(docs, value).length, 3);
});

test('every sort option survives a backup restore', () => {
  for (const { value } of search.SORT_OPTIONS) {
    assert.ok(settings.includes(`'${value}'`), `settings.js must accept sort "${value}"`);
  }
});

test('custom order honours sortOrder, with unarranged documents on top and pins not floated', () => {
  const arranged = [
    { id: 'x', sortOrder: 1, addedAt: 1 },
    { id: 'y', sortOrder: 0, addedAt: 2, pinned: false },
    { id: 'p', sortOrder: 2, addedAt: 3, pinned: true },
    { id: 'n', addedAt: 9 },
  ];
  assert.equal(search.sortDocuments(arranged, 'custom').map((d) => d.id).join(''), 'nyxp');
});

test('rearranging a filtered subset only trades places among that subset', () => {
  const all = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, sortOrder: i }));
  // The library shows b, d, e; the user moves e to the top of those.
  const out = search.customOrderAssignments(all, [all[4], all[1], all[3]]);
  assert.equal(out.map((row) => row.id).join(''), 'aecbd');
  assert.deepEqual(out.map((row) => row.sortOrder), [0, 1, 2, 3, 4]);
});
