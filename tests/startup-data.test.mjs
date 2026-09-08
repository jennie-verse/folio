import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('startup never resets saved data because a release marker is absent', async () => {
  const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /freshStart|freshStartResetOnce|ensureFreshStart|needsFreshStart/);
  assert.doesNotMatch(source, /indexedDB\.deleteDatabase/);
});
