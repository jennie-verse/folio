import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slugify, uniqueSlugs, fragmentToSlug, resolveFragment, ANCHOR_PREFIX } from '../src/anchors.js';

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

test('resolveFragment only returns registered headings; missing is null', () => {
  const h = { tag: 'h2' };
  const map = new Map([['section-two', h]]);
  assert.equal(resolveFragment('#Section-Two', map), h);
  assert.equal(resolveFragment('#nope', map), null);
  assert.equal(resolveFragment('#btnSettings', map), null, 'app element ids are never looked up');
  assert.equal(ANCHOR_PREFIX, 'md-');
});

test('markdown handler strips authored id/name, maps through the registry, never sets the hash', () => {
  assert.match(md, /querySelectorAll\('\[id\],\[name\]'\)[^;]*removeAttribute\('id'\)[\s\S]*?removeAttribute\('name'\)/);
  assert.match(md, /assignHeadingIds\(article\)/);
  assert.match(md, /resolveFragment\(anchor\.getAttribute\('href'\), headingMap\)/);
  assert.match(md, /article\.contains\(target\)/);
  assert.doesNotMatch(md, /location\.hash/);
  assert.doesNotMatch(md, /getElementById/);
  assert.match(md, /ALLOW_DATA_ATTR: false/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./src/anchors.js'"));
});
