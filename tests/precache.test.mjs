/* precache.test.mjs — the offline shell must contain every module the app can load.

   sw.js caches unlisted same-origin files only when they are first fetched
   while the Service Worker already controls the page. A module that is missing
   from the precache list therefore works after one online launch and breaks
   when the app is first opened offline — right after installing it, or right
   after an update replaced the cache (diagram.js and expiry.js were missing
   for exactly this reason). A single missing module fails the whole ES-module
   graph, so the app does not start at all. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const block = /const ASSETS = \[([\s\S]*?)\n\];/.exec(sw)[1];
const listed = [...block.matchAll(/'\.\/([^']*)'/g)].map((match) => match[1]);

test('every application module on disk is in the precache list', () => {
  const onDisk = [
    ...readdirSync(join(root, 'src')).filter((name) => name.endsWith('.js')).map((name) => `src/${name}`),
    ...readdirSync(join(root, 'src/handlers')).filter((name) => name.endsWith('.js')).map((name) => `src/handlers/${name}`),
  ];
  const missing = onDisk.filter((path) => !listed.includes(path));
  assert.deepEqual(missing, [], `these modules would fail to load when the app is first opened offline: ${missing.join(', ')}`);
});

test('every precache entry exists, so install() can never fail on a 404', () => {
  const absent = listed.filter((path) => path && !existsSync(join(root, path)));
  assert.deepEqual(absent, []);
});

test('the precache list has no duplicates', () => {
  const seen = new Set();
  const repeated = listed.filter((path) => (seen.has(path) ? true : (seen.add(path), false)));
  assert.deepEqual(repeated, []);
});

test('every stylesheet, script and icon the shell HTML references is precached', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"#?]+)"/g)].map((match) => match[1]).filter((ref) => !/^(?:https?:|data:|blob:)/.test(ref));
  const missing = refs.filter((ref) => !listed.includes(ref));
  assert.deepEqual(missing, [], `index.html references files the offline shell does not hold: ${missing.join(', ')}`);
});
