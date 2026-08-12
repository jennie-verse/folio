/* package-map.test.js — the DOM half of the package tests.
   See package-map.test.html for how to run it. */

import * as pkg from '../src/package.js';

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail: detail || '' });
}

/* The sample ZIPs live in the WebApp folder, not in the app, so they are only
   reachable when this page is served from a local review server. On the
   deployed site that is not a failure — the check simply cannot run. */
function skip(name, detail) {
  results.push({ name, ok: true, skipped: true, detail });
}

/* A page that links to a PDF, draws one image, and does both with a third
   file. Only the link-only file may leave the runtime map. */
const MIXED = [
  '<!doctype html><html><head><title>Mixed</title></head><body>',
  '<a href="docs/report.pdf">report</a>',
  '<img src="pics/logo.png" alt="logo">',
  '<a href="pics/both.png">both</a><img src="pics/both.png" alt="both">',
  '</body></html>',
].join('');

const b64 = (text) => btoa(text);
const mixed = {
  content: MIXED,
  entryPath: 'index.html',
  packageAssets: {
    'docs/report.pdf': { mime: 'application/pdf', encoding: 'base64', data: b64('X'.repeat(4000)) },
    'pics/logo.png': { mime: 'image/png', encoding: 'base64', data: b64('L'.repeat(40)) },
    'pics/both.png': { mime: 'image/png', encoding: 'base64', data: b64('B'.repeat(40)) },
    'unreferenced.txt': { mime: 'text/plain', encoding: 'base64', data: b64('orphan') },
  },
};

function payloadOf(html) {
  const raw = /var P=(\{[\s\S]*?\}),M=P\.map/.exec(html)[1];
  return JSON.parse(raw.replace(/\\u003c/g, '<').replace(/\\u2028|\\u2029/g, ''));
}

async function run() {
  const out = pkg.materialize(mixed, 's1', '', '');
  const payload = payloadOf(out.html);

  check('anchor-only asset leaves the map', !payload.map['docs/report.pdf']);
  check('drawn asset stays inlined', Boolean(payload.map['pics/logo.png']));
  check('dual-use asset stays inlined', Boolean(payload.map['pics/both.png']));
  check('unreferenced asset stays inlined', Boolean(payload.map['unreferenced.txt']));
  check('anchor-only asset is still known', Boolean(payload.known['docs/report.pdf']));
  check('link carries data-folio-path', out.html.includes('data-folio-path="docs/report.pdf"'));
  check('dual-use link also carries the path', out.html.includes('data-folio-path="pics/both.png"'));

  for (const name of ['mindmap.zip', 'mindmap-.zip']) {
    try {
      const response = await fetch(`../../../sample/${name}`);
      if (!response.ok) { skip(`${name} size check`, 'sample not served here — run from the local review server'); continue; }
      const meta = await pkg.importZip(new File([await response.blob()], name));
      const materialized = pkg.materialize(meta, 's1', '', '');
      const kb = materialized.html.length / 1024;
      check(`${name} materializes under 100 KB`, kb < 100, `${kb.toFixed(1)} KB`);
      check(`${name} materializes without warnings`, materialized.warnings.length === 0, materialized.warnings.join(' · '));
      const anchors = (materialized.html.match(/data-folio-path="/g) || []).length;
      check(`${name} tags its links`, anchors > 0, `${anchors} links tagged`);
    } catch (error) {
      check(`${name} materializes under 100 KB`, false, String(error.message || error));
    }
  }

  const failed = results.filter((row) => !row.ok).length;
  const skipped = results.filter((row) => row.skipped).length;
  const head = document.getElementById('head');
  head.textContent = failed
    ? `${failed} of ${results.length} checks FAILED`
    : `All ${results.length - skipped} checks passed${skipped ? ` (${skipped} skipped)` : ''}`;

  const list = document.getElementById('results');
  results.forEach((row) => {
    const item = document.createElement('li');
    const line = document.createElement('div');
    line.className = 'docrow';
    const main = document.createElement('div');
    main.className = 'dr-main';
    const title = document.createElement('div');
    title.className = 'dr-title';
    title.textContent = row.name;
    main.appendChild(title);
    if (row.detail) {
      const sub = document.createElement('div');
      sub.className = 'dr-sub';
      sub.textContent = row.detail;
      main.appendChild(sub);
    }
    const badge = document.createElement('span');
    badge.className = row.skipped ? 'badge needs' : row.ok ? 'badge pin' : 'badge days';
    badge.textContent = row.skipped ? 'SKIP' : row.ok ? 'PASS' : 'FAIL';
    line.appendChild(main);
    line.appendChild(badge);
    item.appendChild(line);
    list.appendChild(item);
  });

  window.__folioPackageMapResults = results;
}

run().catch((error) => {
  document.getElementById('head').textContent = `Harness error: ${error.message}`;
});
