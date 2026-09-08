import test from 'node:test';
import assert from 'node:assert/strict';
import { findTextMatches } from '../src/find.js';

test('case conversion never shifts a match past its original text', () => {
  const text = 'İstanbul: needle NEEDLE';
  const matches = findTextMatches(text, 'needle');
  assert.deepEqual(matches.map(({ start, end }) => text.slice(start, end)), ['needle', 'NEEDLE']);
  assert.equal(matches[0].start, text.indexOf('needle'));
});

test('Unicode, emoji, and regular-expression characters remain literal', () => {
  for (const query of ['한글', '😀', '[x].*', 'İ', 'Σ']) {
    const text = `prefix ${query} suffix ${query}`;
    const matches = findTextMatches(text, query);
    assert.equal(matches.length, 2);
    assert.deepEqual(matches.map(({ start, end }) => text.slice(start, end)), [query, query]);
  }
  assert.deepEqual(findTextMatches('sample', ''), []);
  assert.deepEqual(findTextMatches('sample', 'absent'), []);
});
