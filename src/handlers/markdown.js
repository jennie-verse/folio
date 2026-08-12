/* handlers/markdown.js — .md and .markdown (plan 6-2).

   marked renders, DOMPurify sanitizes, and the result arrives as a DOM
   fragment that is appended. The sanitized HTML never passes back through a
   string, so no app code ever assigns markup to an element. */

import { el, clear, sheet, toast } from '../ui.js';
import { decodeBlob } from './encoding.js';
import { Finder } from '../find.js';

export const kinds = ['markdown'];

let markedPromise = null;
function loadMarked() {
  if (!markedPromise) markedPromise = import('../../vendor/marked.esm.js');
  return markedPromise;
}

export async function extractText(blob, doc) {
  const decoded = await decodeBlob(blob, doc && doc.encoding);
  return { text: decoded.text, patch: { encoding: decoded.encoding } };
}

const PURIFY_CONFIG = {
  RETURN_DOM_FRAGMENT: true,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'svg'],
  FORBID_ATTR: ['srcset'],
  ALLOW_DATA_ATTR: false,
};

export async function render(ctx) {
  const { body, doc, blob } = ctx;
  const decoded = await decodeBlob(blob, doc.encoding);
  const source = decoded.text;
  const { marked } = await loadMarked();
  const hljs = window.hljs;

  const article = el('article', { class: 'doctext' });
  const raw = el('pre', { class: 'plain hidden' });
  raw.textContent = source;
  const finder = new Finder(article);

  function paintRendered() {
    clear(article);
    const html = marked.parse(source, { gfm: true, breaks: false, async: false });
    const fragment = window.DOMPurify.sanitize(html, PURIFY_CONFIG);
    article.appendChild(fragment);

    // Relative images cannot resolve — a Markdown file carries no assets.
    article.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (!/^(?:https?:|data:|blob:)/i.test(src)) {
        img.replaceWith(el('span', { class: 'faint small', text: `[image: ${img.getAttribute('alt') || src}]` }));
      }
    });
    // javascript: links are stripped by DOMPurify; remaining external links are
    // confirmed by address before opening (plan 10장).
    article.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      if (/^https?:/i.test(href)) {
        anchor.addEventListener('click', (event) => { event.preventDefault(); ctx.openExternal(href); });
      } else if (!href.startsWith('#')) {
        anchor.removeAttribute('href');
      }
    });
    if (hljs) article.querySelectorAll('pre code').forEach((block) => { try { hljs.highlightElement(block); } catch { /* unknown language */ } });
  }

  body.classList.add('pad');
  clear(body);
  body.appendChild(article);
  body.appendChild(raw);
  paintRendered();

  let showingSource = false;

  return {
    finder,
    tools: [
      el('button', {
        type: 'button', text: 'Contents',
        onclick: () => {
          const headings = Array.from(article.querySelectorAll('h1,h2,h3,h4'));
          if (!headings.length) { toast('This document has no headings.'); return; }
          sheet('Contents', headings.map((heading) => ({
            label: `${'· '.repeat(Number(heading.tagName[1]) - 1)}${heading.textContent}`.slice(0, 90),
            run: () => { try { heading.scrollIntoView({ block: 'start' }); } catch { heading.scrollIntoView(); } },
          })));
        },
      }),
      el('button', { type: 'button', text: 'Find', onclick: () => ctx.openFind(finder) }),
      el('button', {
        type: 'button', text: 'Source', 'aria-pressed': 'false',
        onclick: (event) => {
          showingSource = !showingSource;
          finder.clear();
          article.classList.toggle('hidden', showingSource);
          raw.classList.toggle('hidden', !showingSource);
          event.currentTarget.setAttribute('aria-pressed', String(showingSource));
          finder.container = showingSource ? raw : article;
        },
      }),
    ],
    destroy() { finder.clear(); },
  };
}
