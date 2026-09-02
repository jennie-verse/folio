// sw.js — three-tier cache, versioned (plan 11장).
//
//   folio-shell-<VERSION>  the app, the small libraries and the 24 Korean
//                          CMaps, so the first Korean PDF renders offline
//   folio-pdfjs-<VERSION>   PDF.js itself, filled on the first PDF
//   folio-cmaps-<VERSION>   every other language's CMaps, on request
//
// PDF.js is about 5 MB. Precaching it would make the very first install slow
// for someone who may never open a PDF, so it is fetched on demand and then
// kept.
const VERSION = '2026.09.02-settingsaudit1';   // must match APP_BUILD in src/version.js

const SHELL  = `folio-shell-${VERSION}`;
const PDFJS  = `folio-pdfjs-${VERSION}`;
const CMAPS  = `folio-cmaps-${VERSION}`;
const OWNED  = [SHELL, PDFJS, CMAPS];

// All same-origin. Every file here must exist or install() fails.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './preview-host.html',
  './assets/app.css',
  './assets/fonts/lexend-400.woff2',
  './assets/fonts/lexend-700.woff2',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/dexie.min.js',
  './vendor/highlight.min.js',
  './vendor/purify.min.js',
  './vendor/papaparse.min.js',
  './vendor/marked.esm.js',
  './src/app.js',
  './src/version.js',
  './src/deployment.js',
  './src/store.js',
  './src/storage.js',
  './src/quota.js',
  './src/ui.js',
  './src/settings.js',
  './src/detect.js',
  './src/find.js',
  './src/hashing.js',
  './src/hash-worker.js',
  './src/library.js',
  './src/search.js',
  './src/retention.js',
  './src/relink.js',
  './src/backup.js',
  './src/package.js',
  './src/preview.js',
  './src/sync.js',
  './src/sync-runner.js',
  './src/journal.js',
  './src/journal-record.js',
  './src/activity-session.js',
  './src/annotation.js',
  './src/handlers/encoding.js',
  './src/handlers/text.js',
  './src/handlers/markdown.js',
  './src/handlers/html.js',
  './src/handlers/csv.js',
  './src/handlers/image.js',
  './src/handlers/pdf.js',
  // Korean CMaps (228 KB). Without these a Korean CID PDF opened offline
  // renders as empty boxes.
  './vendor/pdfjs/cmaps/Adobe-Korea1-0.bcmap',
  './vendor/pdfjs/cmaps/Adobe-Korea1-1.bcmap',
  './vendor/pdfjs/cmaps/Adobe-Korea1-2.bcmap',
  './vendor/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap',
  './vendor/pdfjs/cmaps/KSC-EUC-H.bcmap',
  './vendor/pdfjs/cmaps/KSC-EUC-V.bcmap',
  './vendor/pdfjs/cmaps/KSC-H.bcmap',
  './vendor/pdfjs/cmaps/KSC-Johab-H.bcmap',
  './vendor/pdfjs/cmaps/KSC-Johab-V.bcmap',
  './vendor/pdfjs/cmaps/KSC-V.bcmap',
  './vendor/pdfjs/cmaps/KSCms-UHC-H.bcmap',
  './vendor/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap',
  './vendor/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap',
  './vendor/pdfjs/cmaps/KSCms-UHC-V.bcmap',
  './vendor/pdfjs/cmaps/KSCpc-EUC-H.bcmap',
  './vendor/pdfjs/cmaps/KSCpc-EUC-V.bcmap',
  './vendor/pdfjs/cmaps/UniKS-UCS2-H.bcmap',
  './vendor/pdfjs/cmaps/UniKS-UCS2-V.bcmap',
  './vendor/pdfjs/cmaps/UniKS-UTF16-H.bcmap',
  './vendor/pdfjs/cmaps/UniKS-UTF16-V.bcmap',
  './vendor/pdfjs/cmaps/UniKS-UTF32-H.bcmap',
  './vendor/pdfjs/cmaps/UniKS-UTF32-V.bcmap',
  './vendor/pdfjs/cmaps/UniKS-UTF8-H.bcmap',
  './vendor/pdfjs/cmaps/UniKS-UTF8-V.bcmap',
];

// Nice to have offline, but not worth failing an install over. The shared sync
// module lives in another repository on the same origin, and folio must
// install and run even if it is briefly unavailable. Putting it in addAll()
// would make one missing file break the whole Service Worker install.
const OPTIONAL = ['../shared/v1/sync.js', '../shared/v2/journal.js'];

/* cache.addAll() calls plain fetch() under the hood, which is free to answer
   from the browser's own HTTP cache. GitHub Pages sends a Cache-Control on
   these files, and none of the shell URLs carry a version query string, so a
   stale HTTP-cache hit here would seed a brand-new versioned Cache Storage
   entry with bytes from the OLD deploy — defeating the version bump before
   install even finishes. {cache:'reload'} forces every install-time fetch to
   the network. Failure semantics match addAll(): any non-OK response throws,
   Promise.all rejects, and install() fails (pkglink4 fix). */
async function installFresh(cache, urls) {
  await Promise.all(urls.map(async (path) => {
    const response = await fetch(new Request(path, { cache: 'reload' }));
    if (!response.ok) throw new Error(`Shell asset failed to install: ${path} (${response.status})`);
    await cache.put(path, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await installFresh(cache, ASSETS);
    await Promise.all(OPTIONAL.map((path) => cache.add(new URL(path, self.registration.scope)).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('folio-') && !OWNED.includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function cacheFor(url) {
  if (/\/vendor\/pdfjs\/cmaps\//.test(url.pathname)) return CMAPS;
  if (/\/vendor\/pdfjs\//.test(url.pathname)) return PDFJS;
  return SHELL;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;   // ignore anything off-origin

  // Navigations are network-first so a fresh deploy lands on the FIRST launch
  // instead of the second, with a bounded wait so a slow or captive network
  // never stalls an offline-first start.
  //
  // preview-host.html is excluded even though setting an <iframe src> to it
  // also fires a request with mode:'navigate' — that is a nested browsing
  // context, not a user opening the app. It is a versioned shell file paired
  // one-to-one with preview.js, and it must resolve exactly like every other
  // shell file: cache-first, from whichever version's cache this Service
  // Worker instance owns. Routing it through network-first meant a success
  // response — itself possibly served from a stale intermediate cache, since
  // the URL carries no version marker — would overwrite the freshly installed,
  // version-matched copy with old bytes. That decoupled it from preview.js and
  // made package links silently dead on devices that had it happen to them
  // (pkglink4 fix).
  if (event.request.mode === 'navigate' && !url.pathname.endsWith('/preview-host.html')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        let response;
        try { response = await fetch(event.request, { signal: controller.signal }); }
        finally { clearTimeout(timer); }
        if (response && response.ok && response.type === 'basic') cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request))
          || (await cache.match('./index.html'))
          || (await cache.match('./'))
          || Response.error();
      }
    })());
    return;
  }

  // Everything else is cache-first with a background refresh.
  event.respondWith((async () => {
    const cache = await caches.open(cacheFor(url));
    const cached = await cache.match(event.request);
    const fromNetwork = fetch(event.request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') cache.put(event.request, response.clone());
        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(fromNetwork);
      return cached;
    }
    const fresh = await fromNetwork;
    return fresh || Response.error();
  })());
});
