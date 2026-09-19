import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* An in-memory stand-in for the two Dexie tables folders.js touches, so the
   real create / rename / delete code runs — not a copy of it. */
function table() {
  const rows = new Map();
  const copy = (row) => ({ ...row });
  return {
    rows,
    async toArray() { return [...rows.values()].map(copy); },
    async get(id) { const row = rows.get(id); return row ? copy(row) : undefined; },
    async put(row) { rows.set(row.id, copy(row)); return row.id; },
    async delete(id) { rows.delete(id); },
    where(field) {
      return { equals: (value) => ({ toArray: async () => [...rows.values()].filter((row) => row[field] === value).map(copy) }) };
    },
  };
}
class FakeDexie {
  constructor() { this.folders = table(); this.documents = table(); }
  version() { return { stores() { return this; }, upgrade() { return this; } }; }
  async transaction(...args) { return args[args.length - 1](); }
}
globalThis.window = { Dexie: FakeDexie };

const { db } = await import('../src/store.js');
const folders = await import('../src/folders.js');
const { isHueIndex } = await import('../src/folder-color.js');

function reset() { db.folders.rows.clear(); db.documents.rows.clear(); }
const addDoc = (id, extra = {}) => db.documents.put({ id, title: id, updatedAt: 1000, ...extra });
const docs = async () => Object.fromEntries((await db.documents.toArray()).map((doc) => [doc.id, doc]));

test('createFolder trims, caps the length, refuses blanks and case-insensitive duplicates', async () => {
  reset();
  const made = await folders.createFolder('  Work  ');
  assert.equal(made.name, 'Work');
  assert.equal((await folders.createFolder('x'.repeat(100))).name.length, 60);
  await assert.rejects(folders.createFolder('   '), /Enter a folder name/);
  await assert.rejects(folders.createFolder('work'), /already exists/);
  await assert.rejects(folders.createFolder('WORK'), /already exists/);
});

test('the first five folders are created with five different, valid hues', async () => {
  reset();
  const hues = [];
  for (const name of ['a', 'b', 'c', 'd', 'e']) hues.push((await folders.createFolder(name)).hue);
  assert.ok(hues.every(isHueIndex));
  assert.equal(new Set(hues).size, 5);
  assert.ok(isHueIndex((await folders.createFolder('f')).hue), 'a sixth still gets a valid hue');
});

test('ensureFolder (used by sync) finds an existing folder by name or creates one with a hue', async () => {
  reset();
  const first = await folders.ensureFolder('Reading');
  assert.ok(isHueIndex(first.hue));
  assert.equal((await folders.ensureFolder('  reading ')).id, first.id, 'a name match is case- and space-insensitive');
  assert.equal(await folders.ensureFolder('   '), null);
  assert.equal((await folders.listFolders()).length, 1);
});

test('renameFolder keeps the id, hue and order, and only re-stamps that folder\'s documents', async () => {
  reset();
  const work = await folders.createFolder('Work');
  const home = await folders.createFolder('Home');
  await addDoc('in-work-1', { folderId: work.id });
  await addDoc('in-work-2', { folderId: work.id, deletedAt: 5 });
  await addDoc('in-home', { folderId: home.id });
  await addDoc('loose');

  const renamed = await folders.renameFolder(work.id, '  Office ');
  assert.equal(renamed.name, 'Office');
  assert.equal(renamed.id, work.id);
  assert.equal(renamed.hue, work.hue, 'the colour survives a rename');
  assert.equal(renamed.order, work.order);

  const after = await docs();
  // Sync only applies a remote folder change when updatedAt is newer, so a
  // rename must move the stamp of every document in the folder.
  assert.ok(after['in-work-1'].updatedAt > 1000);
  assert.ok(after['in-work-2'].updatedAt > 1000);
  assert.equal(after['in-work-1'].folderId, work.id, 'membership is untouched');
  assert.equal(after['in-home'].updatedAt, 1000, 'other folders are left alone');
  assert.equal(after.loose.updatedAt, 1000);
});

test('renaming to the same name changes nothing, so it never triggers a sync', async () => {
  reset();
  const work = await folders.createFolder('Work');
  await addDoc('d', { folderId: work.id });
  await folders.renameFolder(work.id, ' Work ');
  assert.equal((await docs()).d.updatedAt, 1000);
});

test('renameFolder refuses another folder\'s name but allows changing only the case of its own', async () => {
  reset();
  const work = await folders.createFolder('Work');
  await folders.createFolder('Home');
  await assert.rejects(folders.renameFolder(work.id, 'home'), /already exists/);
  await assert.rejects(folders.renameFolder(work.id, ''), /Enter a folder name/);
  assert.equal((await folders.renameFolder(work.id, 'WORK')).name, 'WORK');
  assert.equal(await folders.renameFolder('missing-id', 'Anything'), null);
  assert.equal((await folders.listFolders()).find((folder) => folder.id === work.id).name, 'WORK');
});

test('deleteFolder moves documents to Unsorted, never deletes them, and reports how many', async () => {
  reset();
  const work = await folders.createFolder('Work');
  const home = await folders.createFolder('Home');
  await addDoc('a', { folderId: work.id });
  await addDoc('b', { folderId: work.id });
  await addDoc('gone', { folderId: work.id, deletedAt: 9 });   // already deleted, waiting out its Undo
  await addDoc('keep', { folderId: home.id });

  const moved = await folders.deleteFolder(work.id);
  assert.equal(moved, 2, 'the count covers only documents the person can see');

  const after = await docs();
  assert.equal(Object.keys(after).length, 4, 'no document was removed');
  assert.equal(after.a.folderId, null);
  assert.equal(after.b.folderId, null);
  assert.ok(after.a.updatedAt > 1000, 'moved documents are re-stamped so sync sees them leave the folder');
  assert.equal(after.keep.folderId, home.id);
  assert.equal(after.keep.updatedAt, 1000);
  assert.deepEqual((await folders.listFolders()).map((folder) => folder.name), ['Home']);
  assert.equal(await folders.deleteFolder(work.id), 0, 'deleting again is a harmless no-op');
});

test('a deleted folder\'s hue is handed to the next one made', async () => {
  reset();
  const made = [];
  for (const name of ['a', 'b', 'c', 'd', 'e']) made.push(await folders.createFolder(name));
  const doomed = made[2];
  await folders.deleteFolder(doomed.id);
  assert.equal((await folders.createFolder('again')).hue, doomed.hue);
});

test('a new folder always sorts after the existing ones, even once earlier folders were deleted', async () => {
  // Regression: order was folders.length, so deleting a folder made the next
  // one repeat a value still in use and land in the middle of the tab row.
  reset();
  const made = [];
  for (const name of ['a', 'b', 'c', 'd', 'e']) made.push(await folders.createFolder(name));
  await folders.deleteFolder(made[0].id);
  await folders.deleteFolder(made[3].id);
  const fresh = await folders.createFolder('z');
  assert.deepEqual((await folders.listFolders()).map((folder) => folder.name), ['b', 'c', 'e', 'z']);
  assert.ok(fresh.order > Math.max(...(await folders.listFolders()).filter((f) => f.id !== fresh.id).map((f) => f.order)));
  assert.equal((await folders.ensureFolder('from sync')).order, fresh.order + 1, 'the sync path orders the same way');
  assert.equal(folders.nextOrder([]), 0);
  assert.equal(folders.nextOrder([{ order: undefined }, { order: 7 }]), 8, 'a folder without an order is ignored');
});

test('folderDocCounts counts Unsorted under null', () => {
  const counts = folders.folderDocCounts([{ folderId: 'x' }, { folderId: 'x' }, {}, { folderId: null }]);
  assert.equal(counts.get('x'), 2);
  assert.equal(counts.get(null), 2);
});

/* ── backup keeps the colour ───────────────────────────────────────────── */

test('a backup restore keeps a valid hue, drops an invalid one, and accepts folders that never had one', async () => {
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const backup = await import('../src/backup.js');
  const base = JSON.parse(await readFile(new URL('./fixtures/restore-valid.json', import.meta.url), 'utf8'));
  base.folders = [
    { id: 'f1', name: 'Has hue', order: 0, createdAt: 5, hue: 3 },
    { id: 'f2', name: 'Out of range', order: 1, createdAt: 5, hue: 99 },
    { id: 'f3', name: 'Wrong type', order: 2, createdAt: 5, hue: '2' },
    { id: 'f4', name: 'Made before hues existed', order: 3, createdAt: 5 },
  ];
  const { folders: restored } = backup.validateAndNormalize(backup.validate(base));
  assert.equal(restored.length, 4, 'every folder is restored');
  assert.equal(restored[0].hue, 3);
  for (const row of restored.slice(1)) assert.equal('hue' in row, false, `${row.name}: no usable hue is carried over`);
  assert.deepEqual(restored.map((row) => row.name), base.folders.map((row) => row.name));
});
