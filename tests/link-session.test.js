/* link-session.test.js — the nested-frame half of the package link tests.
   See link-session.test.html for how to run it.

   What it pins: a document rendered by preview.mount() can still be HEARD.
   preview-host.html forwards a message from the document only when its session
   id matches the one the mount announced, so a mount that mints its own id
   instead of reusing the one baked into the HTML silences the document
   completely — which is exactly how every package link died in build
   2026.08.12-pkglink4. `ready` arriving is the proof: it is the document's
   first word, and it travels the same relay a link tap does. */

import * as pkg from '../src/package.js';
import * as preview from '../src/preview.js';

const params = new URLSearchParams(location.search);
const ZIP = params.get('zip') || 'mind_map.zip';
const results = [];

function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail: detail || '' });
}

function row(list, text, detail, state) {
  const item = document.createElement('li');
  const line = document.createElement('div');
  line.className = 'docrow';
  const main = document.createElement('div');
  main.className = 'dr-main';
  const title = document.createElement('div');
  title.className = 'dr-title';
  title.textContent = text;
  main.appendChild(title);
  if (detail) {
    const sub = document.createElement('div');
    sub.className = 'dr-sub';
    sub.textContent = detail;
    main.appendChild(sub);
  }
  line.appendChild(main);
  if (state) {
    const badge = document.createElement('span');
    badge.className = state === 'PASS' ? 'badge pin' : state === 'SKIP' ? 'badge needs' : 'badge days';
    badge.textContent = state;
    line.appendChild(badge);
  }
  item.appendChild(line);
  list.appendChild(item);
}

/* Some managed browsers refuse to load a SANDBOXED frame over http. `srcdoc=1`
   hands preview-host.html to the frame as srcdoc instead — same document, same
   CSP, same nested frame — so the relay under test behaves identically. */
async function useSrcdocHost() {
  const html = await (await fetch('../preview-host.html')).text();
  const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
    configurable: true,
    get: descriptor.get,
    set(value) {
      if (String(value).endsWith('preview-host.html')) { this.srcdoc = html; return; }
      descriptor.set.call(this, value);
    },
  });
}

async function run() {
  if (params.get('srcdoc') === '1') await useSrcdocHost();

  const response = await fetch(`../../../sample/${ZIP}`);
  if (!response.ok) {
    results.push({ name: `${ZIP} is served`, ok: true, skipped: true, detail: 'run from the local review server' });
    return;
  }
  const meta = await pkg.importZip(new File([await response.blob()], ZIP));

  /* Exactly what handlers/html.js mountRun() does. */
  const session = preview.newSession();
  const built = pkg.materialize(
    { content: meta.content, packageAssets: meta.packageAssets, entryPath: meta.entryPath },
    session, preview.instrument(session), preview.STORAGE_SHIM,
  );

  const tagged = (built.html.match(/data-folio-path="/g) || []).length;
  check(`${ZIP} tags its package links`, tagged > 0, `${tagged} links tagged · entry ${meta.entryPath}`);

  const taps = document.getElementById('taps');
  let ready = false;
  const mounted = preview.mount(document.getElementById('stage'), {
    html: built.html,
    session,
    allowScripts: true,
    title: 'link session test',
    restoreY: 0,
    onScroll: () => { ready = true; },
    onOpen: (url) => row(taps, 'open (external)', url),
    onOpenAsset: (path) => row(taps, 'open-asset', path, 'PASS'),
    onIssue: (kind, message) => row(taps, kind, message),
  });

  check('mount reuses the session the document was built with', mounted.session === session,
    `html ${session} · mount ${mounted.session}`);

  /* `ready` is posted by instrument() on load and relayed only if the session
     guard passes. mount() answers it with `restore`, which instrument() also
     session-checks, so a scroll report coming back proves the round trip. */
  await new Promise((resolve) => {
    const stop = setTimeout(resolve, 4000);
    const listen = (event) => {
      const data = event.data;
      if (data && data.protocol === 'folio-preview-v1' && data.session === session && data.type === 'ready') {
        ready = true;
        window.removeEventListener('message', listen);
        clearTimeout(stop);
        resolve();
      }
    };
    window.addEventListener('message', listen);
  });
  check('the document is heard through the relay', ready,
    ready ? 'ready reached the app' : 'no message arrived — preview-host dropped them (session mismatch)');
}

run()
  .catch((error) => { check('harness ran', false, String(error && error.message || error)); })
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    const skipped = results.filter((r) => r.skipped).length;
    document.getElementById('head').textContent = failed
      ? `${failed} of ${results.length} checks FAILED`
      : `All ${results.length - skipped} checks passed${skipped ? ` (${skipped} skipped)` : ''}`;
    const list = document.getElementById('results');
    results.forEach((r) => row(list, r.name, r.detail, r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'));
    window.__folioLinkSessionResults = results;
  });
