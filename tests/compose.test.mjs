import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSE_TYPES, DEFAULT_KIND, buildFile, buildFileName, deriveTitle, looksLikeHtml, pickKind, rememberKind, typeOf } from '../src/compose.js';
import { detect, KINDS } from '../src/detect.js';

/* ── which kinds can be typed ─────────────────────────────────────────── */

test('every typed kind is a real folio kind that is plain text on disk', () => {
  for (const type of COMPOSE_TYPES) {
    assert.ok(KINDS.includes(type.kind), `${type.kind} must be a folio kind`);
    assert.ok(['markdown', 'text', 'html', 'csv'].includes(type.kind), 'binary kinds cannot be typed');
  }
  assert.equal(typeOf(DEFAULT_KIND).kind, DEFAULT_KIND);
  assert.equal(typeOf('nonsense').kind, COMPOSE_TYPES[0].kind, 'an unknown kind falls back instead of throwing');
});

test('the File built for each type is detected as exactly that type by the import pipeline', async () => {
  const sample = { markdown: '# Hi\n\nbody', text: 'plain', html: '<h1>Hi</h1>', csv: 'a,b\n1,2' };
  for (const type of COMPOSE_TYPES) {
    const { file } = buildFile({ title: 'x', kind: type.kind, text: sample[type.kind] });
    assert.deepEqual(await detect(file), { kind: type.kind }, `${type.kind} must round-trip through detect()`);
  }
});

test('the text is stored byte for byte as UTF-8, Korean included', async () => {
  const text = '# 회의록\n\n한글 😀 emoji\n';
  const { file } = buildFile({ title: '', kind: 'markdown', text });
  assert.equal(await file.text(), text);
  assert.equal(file.size, new TextEncoder().encode(text).length);
});

/* ── HTML sniffing ─────────────────────────────────────────────────────── */

test('looksLikeHtml recognises pasted pages and leaves Markdown and prose alone', () => {
  assert.equal(looksLikeHtml('<!DOCTYPE html>\n<html></html>'), true);
  assert.equal(looksLikeHtml('  <html lang="ko"><body>x</body></html>'), true);
  assert.equal(looksLikeHtml('<div class="a"><p>hi</p></div>'), true);
  assert.equal(looksLikeHtml('\uFEFF<!doctype html><title>x</title>'), true, 'a BOM must not hide the doctype');
  assert.equal(looksLikeHtml('# Heading\n\nSome <b>bold</b> text'), false, 'Markdown with inline HTML stays Markdown');
  assert.equal(looksLikeHtml('<https://example.com> is a link'), false, 'a Markdown autolink is not a tag');
  assert.equal(looksLikeHtml('<div> never closed'), false, 'an opening tag alone is not enough');
  assert.equal(looksLikeHtml('just words'), false);
  assert.equal(looksLikeHtml(''), false);
  assert.equal(looksLikeHtml(undefined), false);
});

/* ── the type the sheet starts on ────────────────────────────────────── */

test('saving an HTML page never makes the next pasted note default to HTML', () => {
  // Regression: after an HTML paste, the next Markdown note was filed as HTML,
  // because the last-used type (html) was the fallback for "not obviously HTML".
  let usual = DEFAULT_KIND;
  usual = rememberKind(usual, 'html');
  assert.equal(usual, 'markdown');
  assert.equal(pickKind('# A note\n\n- one\n- two', usual), 'markdown');
  assert.equal(pickKind('<!doctype html><title>x</title>', usual), 'html', 'HTML is still recognised from the text');
});

test('a non-HTML type the person chose becomes their usual one, and junk is ignored', () => {
  assert.equal(rememberKind('markdown', 'text'), 'text');
  assert.equal(rememberKind('text', 'csv'), 'csv');
  assert.equal(rememberKind('csv', 'pdf'), 'csv', 'a kind that cannot be typed is not remembered');
  assert.equal(rememberKind('csv', undefined), 'csv');
  assert.equal(pickKind('plain words', 'text'), 'text');
  assert.equal(pickKind('', 'nonsense'), 'markdown', 'an unknown fallback cannot leak into the sheet');
});

/* ── titles ────────────────────────────────────────────────────────────── */

test('deriveTitle reads the most meaningful line for each kind', () => {
  assert.equal(deriveTitle('html', '<html><head><title>  My   page </title></head><body><h1>Other</h1></body></html>'), 'My page');
  assert.equal(deriveTitle('html', '<body><h1>Only <em>heading</em></h1></body>'), 'Only heading');
  assert.equal(deriveTitle('html', '<style>p{}</style><script>var a=1</script><p>First visible line</p><p>second</p>'), 'First visible line');
  assert.equal(deriveTitle('markdown', 'intro line\n\n## **Bold** and `code` title ##\n\nbody'), 'Bold and code title');
  assert.equal(deriveTitle('markdown', 'no heading here\nsecond'), 'no heading here');
  assert.equal(deriveTitle('text', '\n\n  first real line \nsecond'), 'first real line');
  assert.equal(deriveTitle('csv', 'name,age\nann,3'), 'name,age');
  assert.equal(deriveTitle('markdown', '#\n'), 'Untitled', 'an empty heading yields the fallback');
  assert.equal(deriveTitle('text', '=====\n-----\nReal first line'), 'Real first line', 'marker-only lines are skipped');
  assert.equal(deriveTitle('text', '   \n\t\n'), 'Untitled');
  assert.equal(deriveTitle('text', ''), 'Untitled');
});

test('deriveTitle reads YAML front matter, and never shows the --- fence as a title', () => {
  assert.equal(deriveTitle('markdown', '---\ntags: [a]\ntitle: "Quarterly notes"\n---\n\n# Ignored heading\n'), 'Quarterly notes');
  assert.equal(deriveTitle('markdown', "---\ntitle: 한글 제목\n---\nbody"), '한글 제목');
  assert.equal(deriveTitle('markdown', '---\ndate: 2026-09-18\n---\n\n# After the fence\n'), 'After the fence');
  assert.equal(deriveTitle('markdown', '---\ndate: 2026-09-18\n---\nplain first line'), 'plain first line');
  assert.equal(deriveTitle('markdown', '---\nnot closed\nfirst'), 'not closed', 'an unclosed fence is not front matter');
});

test('deriveTitle decodes entities once and clips on code points, not UTF-16 halves', () => {
  assert.equal(deriveTitle('html', '<title>Tom &amp; Jerry</title>'), 'Tom & Jerry');
  assert.equal(deriveTitle('html', '<title>&amp;lt;b&amp;gt;</title>'), '&lt;b&gt;', 'a second decode would turn this into <b>');
  const clipped = deriveTitle('text', '😀'.repeat(200));
  assert.equal(Array.from(clipped).length, 80);
  assert.ok(!/[\uD800-\uDBFF]$/.test(clipped), 'never ends on half of a surrogate pair');
  assert.equal(deriveTitle('text', '가'.repeat(200)).length, 80);
});

/* ── file names ────────────────────────────────────────────────────────── */

test('buildFileName is safe to export and keeps Korean and spaces', () => {
  assert.equal(buildFileName('회의록 2026-09', 'md'), '회의록 2026-09.md');
  assert.equal(buildFileName('a/b\\c:d*e?f"g<h>i|j', 'txt'), 'a-b-c-d-e-f-g-h-i-j.txt');
  assert.equal(buildFileName('..hidden', 'md'), 'hidden.md', 'a leading dot must not make a hidden file');
  assert.equal(buildFileName('trailing. . -', 'md'), 'trailing.md');
  assert.equal(buildFileName('   ', 'md'), 'untitled.md');
  assert.equal(buildFileName('', 'html'), 'untitled.html');
  assert.equal(buildFileName('x\u0000y\u001fz', 'txt'), 'x-y-z.txt', 'control characters are removed');
  assert.ok(Array.from(buildFileName('가'.repeat(300), 'md')).length <= 83);
});

test('buildFile uses the typed title as the shown title and derives one when blank', () => {
  assert.equal(buildFile({ title: '  My   notes ', kind: 'text', text: 'x' }).title, 'My notes');
  assert.equal(buildFile({ title: '', kind: 'markdown', text: '# From heading\nbody' }).title, 'From heading');
  const { file, title } = buildFile({ title: 'v1.2 plan: draft?', kind: 'markdown', text: 'x' });
  assert.equal(title, 'v1.2 plan: draft?', 'the shown title keeps characters a file name cannot');
  assert.equal(file.name, 'v1.2 plan- draft.md', 'characters a file name cannot hold become "-", and a trailing "-" is dropped');
});
