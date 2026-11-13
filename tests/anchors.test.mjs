import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slugify, uniqueSlugs, fragmentToSlug, resolveFragment, collectAuthoredTargets, ANCHOR_PREFIX } from '../src/anchors.js';

const md = readFileSync(new URL('../src/handlers/markdown.js', import.meta.url), 'utf8');

test('slugify is GitHub-style and keeps Korean', () => {
  assert.equal(slugify('Section Two'), 'section-two');
  assert.equal(slugify('What\'s new? (v2.0)'), 'whats-new-v20');
  assert.equal(slugify('한글 제목!'), '한글-제목');
  assert.equal(slugify(''), '');
});

test('duplicate headings get -1, -2', () => {
  assert.deepEqual(uniqueSlugs(['Intro', 'Intro', 'Intro', 'Other']), ['intro', 'intro-1', 'intro-2', 'other']);
  assert.deepEqual(uniqueSlugs(['한글', '한글']), ['한글', '한글-1']);
  assert.deepEqual(uniqueSlugs(['!!!']), ['section']);
});

test('fragments decode percent-encoding and reject junk', () => {
  assert.equal(fragmentToSlug('#section-two'), 'section-two');
  assert.equal(fragmentToSlug('#한글-제목'), '한글-제목');
  assert.equal(fragmentToSlug('#' + encodeURIComponent('한글-제목')), '한글-제목');
  assert.equal(fragmentToSlug('#'), null);
  assert.equal(fragmentToSlug('#%E0%A4%A'), null);
  assert.equal(fragmentToSlug('https://x/#a'), null);
});

test('resolveFragment: headings by slug, missing and app ids are null', () => {
  const h = { tag: 'h2' };
  const reg = { authored: new Map(), headings: new Map([['section-two', h]]) };
  assert.equal(resolveFragment('#Section-Two', reg), h);
  assert.equal(resolveFragment('#nope', reg), null);
  assert.equal(resolveFragment('#btnSettings', reg), null, 'app element ids are never looked up');
  assert.equal(ANCHOR_PREFIX, 'md-');
});

function fakeRoot(nodes) {
  return { querySelectorAll: () => nodes.map((n) => ({ ...n, getAttribute: (a) => n[a] ?? null })) };
}

test('authored <a id>, <a name>, and ids equal to app ids resolve to the DOC element only', () => {
  const nodes = [{ id: 'fn1' }, { name: 'nm' }, { id: 'viewer' }, { id: '한글', name: 'dup' }, { id: 'dup' }];
  const authored = collectAuthoredTargets(fakeRoot(nodes));
  const reg = { authored, headings: new Map() };
  assert.equal(resolveFragment('#fn1', reg), [...authored.values()][0]);
  assert.ok(resolveFragment('#nm', reg), 'name works');
  assert.equal(resolveFragment('#viewer', reg).id, 'viewer', 'scrolls the doc element (registry), never document.getElementById');
  assert.ok(resolveFragment('#' + encodeURIComponent('한글'), reg), 'percent-decoded authored id');
  assert.equal(resolveFragment('#dup', reg).id, '한글', 'first authored wins');
  assert.equal(resolveFragment('#library', reg), null, 'app ids not in the document stay unreachable');
});

test('authored ids take precedence over a heading slug of the same text', () => {
  const authoredEl = { who: 'authored' }; const headingEl = { who: 'heading' };
  const reg = { authored: new Map([['intro', authoredEl]]), headings: new Map([['intro', headingEl]]) };
  assert.equal(resolveFragment('#intro', reg), authoredEl);
  assert.equal(resolveFragment('#intro-1', reg), null);
});

test('markdown handler strips authored id/name, maps through the registry, never sets the hash', () => {
  assert.match(md, /querySelectorAll\('\[id\],\[name\]'\)[^;]*removeAttribute\('id'\)[\s\S]*?removeAttribute\('name'\)/);
  assert.match(md, /collectAuthoredTargets\(fragment\)[\s\S]*removeAttribute\('id'\)/);
  assert.match(md, /assignHeadingIds\(article\)/);
  assert.match(md, /resolveFragment\(anchor\.getAttribute\('href'\), registry\)/);
  assert.match(md, /article\.contains\(target\)/);
  assert.doesNotMatch(md, /location\.hash/);
  assert.doesNotMatch(md, /getElementById/);
  assert.match(md, /ALLOW_DATA_ATTR: false/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./src/anchors.js'"));
});
