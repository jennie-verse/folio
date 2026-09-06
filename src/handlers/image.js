/* handlers/image.js — jpg, png, gif, webp, svg, heic (plan 6-6).

   SVG is shown through <img src="blob:"> and never inlined. An image-loaded
   SVG cannot run scripts and cannot fetch external resources [ref 1], so an
   `onload` handler inside the file simply never fires. Running a scripted SVG
   on purpose means wrapping it in HTML and opening that in Run mode. */

import { el, clear, toast, formatBytes } from '../ui.js';
import { extensionOf } from '../detect.js';

export const kinds = ['image'];

const IMAGE_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif',
};

/* Files that arrive without a MIME type — some pickers and some restored
   backups — would otherwise produce a blob: URL the browser cannot decode, so
   the type is derived from the file name before the URL is made. */
function typedUrl(blob, fileName) {
  const mime = IMAGE_MIME[extensionOf(fileName)] || blob.type || '';
  const typed = blob.type === mime ? blob : new Blob([blob], { type: mime });
  return URL.createObjectURL(typed);
}

export async function extractText() {
  return { text: '', patch: {} };   // images have no searchable text
}

export async function render(ctx) {
  const { body, doc, blob } = ctx;
  const url = typedUrl(blob, doc.fileName || doc.title || '');
  const stage = el('div', { class: 'imgstage' });
  const canvas = el('div', { class: 'imgcanvas' });
  const image = el('img', { alt: doc.title || doc.fileName || 'Image' });

  let rotation = 0;
  let scale = 1;
  let fit = true;
  let zoom = null;
  const gestures = new AbortController();

  function applyTransform() {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const quarterTurn = rotation % 180 !== 0;
    const naturalW = image.naturalWidth;
    const naturalH = image.naturalHeight;
    if (fit) {
      const availableW = Math.max(1, stage.clientWidth - 16);
      const availableH = Math.max(1, stage.clientHeight - 16);
      const rotatedW = quarterTurn ? naturalH : naturalW;
      const rotatedH = quarterTurn ? naturalW : naturalH;
      scale = Math.min(1, availableW / rotatedW, availableH / rotatedH);
    }
    const imageW = naturalW * scale;
    const imageH = naturalH * scale;
    canvas.style.width = `${quarterTurn ? imageH : imageW}px`;
    canvas.style.height = `${quarterTurn ? imageW : imageH}px`;
    const verticalRoom = Math.max(0, stage.clientHeight - 16 - (quarterTurn ? imageW : imageH));
    canvas.style.marginTop = `${verticalRoom / 2}px`;
    canvas.style.marginBottom = `${verticalRoom / 2}px`;
    image.style.width = `${imageW}px`;
    image.style.height = `${imageH}px`;
    image.style.transform = `translate(-50%,-50%) rotate(${rotation}deg)`;
    if (zoom) zoom.value = String(Math.round(scale * 100));
  }

  const failed = el('div', { class: 'empty hidden' }, [
    el('p', { text: "This device can't display this image format. Export the original to open it in Files." }),
  ]);

  image.addEventListener('load', () => {
    if (!doc.width || !doc.height) {
      ctx.patchDoc({ width: image.naturalWidth, height: image.naturalHeight }).catch(() => {});
    }
    applyTransform();
  });
  image.addEventListener('error', () => {
    stage.classList.add('hidden');
    failed.classList.remove('hidden');
  });
  image.src = url;

  body.classList.remove('pad');
  clear(body);
  canvas.appendChild(image);
  stage.appendChild(canvas);
  body.appendChild(failed);
  body.appendChild(stage);

  zoom = el('input', { type: 'range', min: '25', max: '400', value: '100', 'aria-label': 'Zoom' });
  zoom.addEventListener('input', () => {
    fit = false;
    scale = Number(zoom.value) / 100;
    applyTransform();
  });

  const active = new Map();
  let pinchStart = 0;
  let pinchScale = 1;
  let suppressTapUntil = 0;
  const distance = () => {
    const points = Array.from(active.values());
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (active.size === 2) {
      pinchStart = distance();
      pinchScale = scale;
      suppressTapUntil = Date.now() + 400;
    }
  }, { signal: gestures.signal });
  stage.addEventListener('pointermove', (event) => {
    if (active.has(event.pointerId)) active.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }, { signal: gestures.signal });
  const finishPinch = (event) => {
    if (active.size === 2 && pinchStart) {
      fit = false;
      scale = Math.max(0.25, Math.min(4, pinchScale * distance() / pinchStart));
      zoom.value = String(Math.round(scale * 100));
      applyTransform();
    }
    active.delete(event.pointerId);
    if (active.size < 2) pinchStart = 0;
  };
  stage.addEventListener('pointerup', finishPinch, { signal: gestures.signal });
  stage.addEventListener('pointercancel', finishPinch, { signal: gestures.signal });
  let lastTap = 0;
  stage.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch') return;
    const now = Date.now();
    if (now < suppressTapUntil) return;
    if (now - lastTap < 320) {
      fit = false;
      scale = scale > 1.5 ? 1 : 2;
      zoom.value = String(scale * 100);
      applyTransform();
      lastTap = 0;
    } else lastTap = now;
  }, { signal: gestures.signal });

  return {
    tools: [
      el('button', {
        type: 'button', text: 'Rotate',
        onclick: () => { rotation = (rotation + 90) % 360; applyTransform(); },
      }),
      el('button', {
        type: 'button', text: 'Info',
        onclick: () => toast(`${image.naturalWidth || '?'}×${image.naturalHeight || '?'} · ${formatBytes(blob.size)}`),
      }),
    ],
    bottom: [
      zoom,
      el('button', {
        type: 'button', text: 'Fit',
        onclick: () => { fit = true; scale = 1; zoom.value = '100'; applyTransform(); },
      }),
    ],
    destroy() { gestures.abort(); URL.revokeObjectURL(url); },
  };
}
