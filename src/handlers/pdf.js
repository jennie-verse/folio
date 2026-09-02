/* handlers/pdf.js — PDF.js 6.2.108 (plan 6-3).

   The four asset URLs below are not optional. Without cmaps a Korean CID PDF
   renders as boxes; without standard_fonts a non-embedded font shifts the whole
   page; without wasm JBIG2/CCITT/JPEG2000 images fail to decode; without iccs
   colour profiles are ignored. Each one MUST end in a slash or PDF.js throws.

   `quickjs-eval.*` and `pdf.sandbox.*` are not deployed at all, so a PDF's own
   embedded scripts have no execution path. */

import { el, clear, sheet, toast } from '../ui.js';

export const kinds = ['pdf'];

const VENDOR = new URL('../../vendor/pdfjs/', import.meta.url).href;

const ASSET_OPTIONS = {
  cMapUrl: `${VENDOR}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${VENDOR}standard_fonts/`,
  wasmUrl: `${VENDOR}wasm/`,
  iccUrl: `${VENDOR}iccs/`,
};

let libraryPromise = null;
function loadPdfjs() {
  if (!libraryPromise) {
    libraryPromise = import('../../vendor/pdfjs/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${VENDOR}pdf.worker.min.mjs`;
      return lib;
    });
  }
  return libraryPromise;
}

/* Returns {pdf, close}. The loading task — not the document proxy — owns
   teardown in pdf.js 6, so it is kept and closed through `close()`. */
async function openDocument(lib, blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = lib.getDocument({ data, ...ASSET_OPTIONS });
  const pdf = await task.promise;
  return { pdf, close: () => task.destroy() };
}

export async function extractText(blob) {
  const lib = await loadPdfjs();
  let pdf = null;
  let close = () => {};
  try {
    ({ pdf, close } = await openDocument(lib, blob));
  } catch (error) {
    if (error && error.name === 'PasswordException') {
      return { text: '', patch: { encrypted: true }, error: "This PDF is password-protected. folio can't open encrypted files." };
    }
    return { text: '', patch: {}, error: 'This file could not be read. It may be damaged.' };
  }
  // Read numPages before destroy(): the handle is unusable afterwards.
  const pageCount = pdf.numPages;
  const limit = Math.min(pageCount, 400);
  const chunks = [];
  for (let page = 1; page <= limit; page += 1) {
    const content = await (await pdf.getPage(page)).getTextContent();
    chunks.push(content.items.map((item) => item.str).join(' '));
  }
  const text = chunks.join('\n');
  await close();
  return { text, patch: { pageCount, hasTextLayer: text.trim().length > 0 } };
}

export async function render(ctx) {
  const { body, doc, blob } = ctx;
  const lib = await loadPdfjs();

  let pdf;
  let close = () => {};
  try {
    ({ pdf, close } = await openDocument(lib, blob));
  } catch (error) {
    clear(body);
    const message = error && error.name === 'PasswordException'
      ? "This PDF is password-protected. folio can't open encrypted files."
      : 'This file could not be read. It may be damaged.';
    body.appendChild(el('div', { class: 'empty' }, [el('p', { text: message })]));
    return { tools: [], destroy() {} };
  }

  const pages = el('div', { class: 'pdfpages' });
  body.classList.remove('pad');
  clear(body);
  body.appendChild(pages);

  let rotation = 0;
  let scale = 1;
  let currentPage = 1;
  let paintGeneration = 0;
  let navigationLocked = false;
  let navigationUnlockTimer = 0;
  let scrollFrame = 0;
  const gestures = new AbortController();
  const slots = [];
  const rendered = new Set();
  const slider = el('input', { type: 'range', min: '1', max: String(pdf.numPages), value: '1', 'aria-label': 'Page' });
  const zoomSlider = el('input', { type: 'range', min: '35', max: '400', value: '100', 'aria-label': 'PDF zoom' });

  function baseWidth() {
    return Math.max(240, body.clientWidth - 24);
  }

  async function paintPage(number) {
    if (rendered.has(number)) return;
    rendered.add(number);
    const generation = paintGeneration;
    const slot = slots[number - 1];
    const page = await pdf.getPage(number);
    if (generation !== paintGeneration) return;
    const unscaled = page.getViewport({ scale: 1, rotation });
    const ratio = (baseWidth() * scale) / unscaled.width;
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: ratio, rotation });

    const canvas = el('canvas');
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    clear(slot);
    slot.appendChild(canvas);
    slot.style.width = `${Math.floor(viewport.width)}px`;
    slot.style.height = `${Math.floor(viewport.height)}px`;

    const context = canvas.getContext('2d', { alpha: false });
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    await page.render({ canvasContext: context, viewport }).promise;
    if (generation !== paintGeneration) return;

    if (doc.hasTextLayer !== false) {
      const layer = el('div', { class: 'textLayer' });
      layer.style.setProperty('--total-scale-factor', String(ratio));
      slot.appendChild(layer);
      try {
        const textLayer = new lib.TextLayer({
          textContentSource: await page.getTextContent(),
          container: layer,
          viewport,
        });
        await textLayer.render();
      } catch (error) {
        // Keep the layer container in place and surface the failure for
        // diagnostics. Removing it silently made a text PDF indistinguishable
        // from a scan and prevented native Copy / Look Up without explanation.
        layer.dataset.textLayerError = 'true';
        console.warn('pdf text layer', { page: number, error });
      }
    }
  }

  function releasePage(number) {
    if (!rendered.has(number)) return;
    rendered.delete(number);
    const slot = slots[number - 1];
    clear(slot);
  }

  function setCurrentPage(number, save = true) {
    const next = Math.min(Math.max(1, Number(number) || 1), pdf.numPages);
    const changed = next !== currentPage || slider.value !== String(next);
    currentPage = next;
    slider.value = String(next);
    ctx.setBottomText(`${next} / ${pdf.numPages}`);
    if (save && changed) ctx.saveReading({ page: next });
  }

  function detectCurrentPage() {
    scrollFrame = 0;
    if (navigationLocked || !slots.length) return;
    const root = body.getBoundingClientRect();
    const center = (root.top + root.bottom) / 2;
    let bestPage = currentPage;
    let bestVisible = -1;
    let bestDistance = Infinity;
    slots.forEach((slot, index) => {
      const rect = slot.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.bottom, root.bottom) - Math.max(rect.top, root.top));
      const distance = Math.abs((rect.top + rect.bottom) / 2 - center);
      if (visible > bestVisible || (visible === bestVisible && distance < bestDistance)) {
        bestPage = index + 1;
        bestVisible = visible;
        bestDistance = distance;
      }
    });
    if (bestVisible > 0) setCurrentPage(bestPage);
  }

  function schedulePageDetection() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(detectCurrentPage);
  }

  function goToPage(number, save = true) {
    const next = Math.min(Math.max(1, Number(number) || 1), pdf.numPages);
    const slot = slots[next - 1];
    if (!slot) return;
    navigationLocked = true;
    setCurrentPage(next, save);
    paintPage(next).catch(() => {});
    slot.scrollIntoView({ block: 'start', inline: 'start' });
    if (navigationUnlockTimer) clearTimeout(navigationUnlockTimer);
    navigationUnlockTimer = setTimeout(() => {
      navigationLocked = false;
      navigationUnlockTimer = 0;
    }, 250);
  }

  slider.addEventListener('input', () => goToPage(Number(slider.value)));
  zoomSlider.addEventListener('change', () => setScale(Number(zoomSlider.value) / 100).catch(() => {}));
  body.addEventListener('scroll', schedulePageDetection, { passive: true, signal: gestures.signal });

  // Only the pages near the viewport are held as bitmaps; a 300-page scan would
  // otherwise exhaust memory on an iPhone.
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const number = Number(entry.target.dataset.page);
      if (entry.isIntersecting) {
        paintPage(number).catch(() => {});
        [number - 1, number + 1, number + 2].forEach((near) => {
          if (near >= 1 && near <= pdf.numPages) paintPage(near).catch(() => {});
        });
      } else if (Math.abs(number - currentPage) > 3) {
        releasePage(number);
      }
    });
  }, { root: body, rootMargin: '200px 0px' });

  for (let number = 1; number <= pdf.numPages; number += 1) {
    const slot = el('div', { class: 'pdfpage', dataset: { page: String(number) } });
    slot.style.minHeight = '160px';
    slot.style.width = `${baseWidth()}px`;
    slots.push(slot);
    pages.appendChild(slot);
    observer.observe(slot);
  }

  async function repaintAll() {
    const pageToKeep = currentPage;
    paintGeneration += 1;
    rendered.clear();
    slots.forEach((slot) => { clear(slot); slot.style.width = `${baseWidth() * scale}px`; });
    await paintPage(pageToKeep);
    requestAnimationFrame(() => goToPage(pageToKeep, false));
  }

  async function setScale(next) {
    scale = Math.max(0.35, Math.min(4, Number(next) || 1));
    zoomSlider.value = String(Math.round(scale * 100));
    await repaintAll();
  }

  async function fitPage() {
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1, rotation });
    const widthScale = baseWidth() / viewport.width;
    const heightScale = Math.max(120, body.clientHeight - 24) / viewport.height;
    scale = Math.max(0.35, Math.min(1, heightScale / widthScale));
    zoomSlider.value = String(Math.round(scale * 100));
    await repaintAll();
  }

  const active = new Map();
  let pinchStart = 0;
  let pinchScale = 1;
  const pinchDistance = () => {
    const points = Array.from(active.values());
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  body.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (active.size === 2) { pinchStart = pinchDistance(); pinchScale = scale; }
  }, { signal: gestures.signal });
  body.addEventListener('pointermove', (event) => {
    if (!active.has(event.pointerId)) return;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }, { signal: gestures.signal });
  const finishPinch = (event) => {
    if (active.size === 2 && pinchStart) {
      const next = pinchScale * (pinchDistance() / pinchStart);
      setScale(next).catch(() => {});
    }
    active.delete(event.pointerId);
    if (active.size < 2) pinchStart = 0;
  };
  body.addEventListener('pointerup', finishPinch, { signal: gestures.signal });
  body.addEventListener('pointercancel', finishPinch, { signal: gestures.signal });

  const start = await ctx.readingState();
  setCurrentPage(start && start.page ? start.page : 1, false);
  if (start && start.page > 1) setTimeout(() => goToPage(start.page, false), 60);

  if (doc.hasTextLayer === false) {
    body.appendChild(el('div', { class: 'pv-note', text: 'No text layer — search and highlights are unavailable for this document.' }));
  }

  return {
    tools: [
      el('button', {
        type: 'button', text: 'Outline',
        onclick: async () => {
          const outline = await pdf.getOutline();
          if (!outline || !outline.length) { toast('This PDF has no outline.'); return; }
          sheet('Outline', outline.slice(0, 60).map((item) => ({
            label: String(item.title || '').slice(0, 90),
            run: async () => {
              try {
                const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
                const index = await pdf.getPageIndex(destination[0]);
                goToPage(index + 1);
              } catch { toast('That destination could not be resolved.'); }
            },
          })));
        },
      }),
      el('button', { type: 'button', text: 'Find', onclick: () => ctx.openPdfFind(pdf, goToPage) }),
      el('button', {
        type: 'button', text: 'Rotate',
        onclick: () => { rotation = (rotation + 90) % 360; repaintAll().catch(() => {}); },
      }),
      el('button', { type: 'button', text: 'Fit width', onclick: () => setScale(1).catch(() => {}) }),
      el('button', { type: 'button', text: 'Fit page', onclick: () => fitPage().catch(() => {}) }),
    ],
    bottom: [slider, zoomSlider],
    setScale,
    goToPage,
    destroy() {
      gestures.abort();
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      if (navigationUnlockTimer) clearTimeout(navigationUnlockTimer);
      observer.disconnect();
      Promise.resolve(close()).catch(() => {});
    },
  };
}
