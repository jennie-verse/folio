/* handlers/text.js — .txt and .log (plan 6-1). */

import { el, clear, toast, choose } from '../ui.js';
import { decodeBlob, ENCODINGS, labelFor } from './encoding.js';
import { Finder } from '../find.js';

export const kinds = ['text'];

export async function extractText(blob, doc) {
  const decoded = await decodeBlob(blob, doc && doc.encoding);
  return { text: decoded.text, patch: { encoding: decoded.encoding } };
}

export async function render(ctx) {
  const { body, doc, blob } = ctx;
  let encoding = doc.encoding || '';
  let wrap = true;

  const pre = el('pre', { class: 'plain' });
  const finder = new Finder(pre);

  async function paint() {
    const decoded = await decodeBlob(blob, encoding);
    encoding = decoded.encoding;
    pre.textContent = decoded.text;
    if (decoded.uncertain) toast('This file is not valid UTF-8 or CP949. Some characters may be wrong.');
  }

  body.classList.add('pad');
  clear(body);
  body.appendChild(pre);
  await paint();

  return {
    finder,
    tools: [
      el('button', { type: 'button', text: 'Find', onclick: () => ctx.openFind(finder) }),
      el('button', {
        type: 'button', text: 'Encoding',
        onclick: async () => {
          const picked = await choose('Encoding', ENCODINGS.map((value) => ({ value, label: labelFor(value) })), encoding);
          if (!picked || picked === encoding) return;
          encoding = picked;
          await paint();
          await ctx.patchDoc({ encoding });
          toast(`Reading as ${labelFor(encoding)}.`);
        },
      }),
      el('button', {
        type: 'button', text: 'Wrap', 'aria-pressed': 'true',
        onclick: (event) => {
          wrap = !wrap;
          pre.classList.toggle('nowrap', !wrap);
          event.currentTarget.setAttribute('aria-pressed', String(wrap));
        },
      }),
    ],
    destroy() { finder.clear(); },
  };
}
