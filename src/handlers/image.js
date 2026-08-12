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
  const image = el('img', { alt: doc.title || doc.fileName || 'Image' });

  let rotation = 0;
  let scale = 1;
  let fit = true;

  function applyTransform() {
    image.style.transform = `rotate(${rotation}deg) scale(${scale})`;
    image.style.maxWidth = fit ? '100%' : 'none';
    image.style.maxHeight = fit ? '100%' : 'none';
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
  stage.appendChild(image);
  body.appendChild(failed);
  body.appendChild(stage);

  const zoom = el('input', { type: 'range', min: '25', max: '400', value: '100', 'aria-label': 'Zoom' });
  zoom.addEventListener('input', () => {
    fit = false;
    scale = Number(zoom.value) / 100;
    applyTransform();
  });

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
    destroy() { URL.revokeObjectURL(url); },
  };
}
