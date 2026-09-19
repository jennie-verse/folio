import test from 'node:test';
import assert from 'node:assert/strict';
import { HUE_COUNT, hueIndexOf, isHueIndex, nextHueIndex } from '../src/folder-color.js';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../assets/app.css', import.meta.url), 'utf8');

test('five hues, and only a whole number in range counts as one', () => {
  assert.equal(HUE_COUNT, 5);
  for (const good of [0, 1, 4]) assert.equal(isHueIndex(good), true);
  for (const bad of [-1, 5, 2.5, '2', null, undefined, NaN, Infinity]) assert.equal(isHueIndex(bad), false);
});

test('a stored hue wins; a folder without one gets a stable hue from its id', () => {
  assert.equal(hueIndexOf({ id: 'a', hue: 3 }), 3);
  const legacy = { id: 'k9x2m1' };
  const first = hueIndexOf(legacy);
  assert.ok(isHueIndex(first));
  for (let i = 0; i < 20; i += 1) assert.equal(hueIndexOf({ id: 'k9x2m1' }), first, 'same id, same hue, every time');
  assert.ok(isHueIndex(hueIndexOf({ id: 'z', hue: 99 })), 'an out-of-range stored value falls back rather than breaking the CSS class');
  assert.ok(isHueIndex(hueIndexOf(null)));
  assert.ok(isHueIndex(hueIndexOf({})));
});

test('hashed hues actually spread across the palette', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(hueIndexOf({ id: `folder-${i}-${(i * 7919).toString(36)}` }));
  assert.equal(seen.size, HUE_COUNT, 'every hue is reachable');
});

test('the first five folders each get a different hue, then the least-used repeats', () => {
  const made = [];
  for (let i = 0; i < 5; i += 1) made.push({ id: `f${i}`, hue: nextHueIndex(made) });
  assert.deepEqual(made.map((f) => f.hue).sort(), [0, 1, 2, 3, 4]);
  assert.ok(isHueIndex(nextHueIndex(made)), 'a sixth folder still gets a valid hue');
  assert.equal(nextHueIndex([]), 0);
});

test('deleting a folder frees its hue for the next one and never recolours the others', () => {
  const folders = [0, 1, 2, 3, 4].map((hue) => ({ id: `f${hue}`, hue }));
  const survivors = folders.filter((f) => f.id !== 'f2');
  assert.equal(nextHueIndex(survivors), 2);
  assert.deepEqual(survivors.map(hueIndexOf), [0, 1, 3, 4]);
});

test('legacy folders count toward "used" so a new folder does not collide with them', () => {
  const legacy = { id: 'legacy-one' };
  const taken = hueIndexOf(legacy);
  assert.notEqual(nextHueIndex([legacy]), taken);
});

test('app.css defines a class and tokens for every hue in both themes', () => {
  for (let i = 0; i < HUE_COUNT; i += 1) {
    assert.match(css, new RegExp(`\\.hue-${i}\\{--h:var\\(--fh${i}\\);--h-tint:var\\(--fh${i}-tint\\);--h-edge:var\\(--fh${i}-edge\\)\\}`), `.hue-${i}`);
    const declared = css.match(new RegExp(`--fh${i}:#[0-9A-Fa-f]{6}; --fh${i}-tint:#[0-9A-Fa-f]{6}; --fh${i}-edge:#[0-9A-Fa-f]{6};`, 'g')) || [];
    assert.equal(declared.length, 2, `--fh${i} needs a light and a dark value`);
  }
});
