/* handlers/markdown.js — .md and .markdown (plan 6-2).

   marked renders, DOMPurify sanitizes, and the result arrives as a DOM
   fragment that is appended. The sanitized HTML never passes back through a
   string, so no app code ever assigns markup to an element.

   Three reading-focused additions (Plan/folio_bsb-reading-plan, 2026-09-01):
   relation diagrams (mermaid `flowchart` fenced blocks) render as inline SVG
   instead of a raw code block; four-column tables scroll horizontally
   instead of overflowing or crushing; and blockquotes / rank tags carry a
   visible style so a brief can be triaged at a glance. None of this reaches
   outside the sanitized DOM — no HTML string is ever assigned. */

import { el, clear, toast, customSheet } from '../ui.js';
import { decodeBlob } from './encoding.js';
import { Finder } from '../find.js';
import * as diagram from '../diagram.js';

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

// ---------------------------------------------------------------------------
// Relation diagrams — mermaid fenced blocks become inline SVG.
// ---------------------------------------------------------------------------

/** Replace every `pre > code.language-mermaid` block with a lazily-rendered
    diagram container. Rendering happens on scroll-into-view (IntersectionObserver)
    so a brief with several diagrams still paints its first screen quickly.
    A block that fails to parse (anything outside the subset diagram.js
    supports) is left exactly as it was — the original code, highlighted like
    any other fenced block — with one small note explaining why. */
function wireDiagrams(article, observers) {
  const blocks = Array.from(article.querySelectorAll('pre > code.language-mermaid'));
  if (!blocks.length) return;
  const rendered = new WeakSet();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const container = entry.target;
      observer.unobserve(container);
      renderInto(container);
    });
  }, { root: null, rootMargin: '200px 0px' });
  observers.push(observer);

  function renderInto(container) {
    if (rendered.has(container)) return;
    rendered.add(container);
    const source = container.dataset.source || '';
    let result;
    try { result = diagram.build(source); } catch { result = { ok: false, reason: 'Could not draw this diagram.' }; }
    clear(container);
    if (result.ok) {
      const frame = el('div', {
        class: 'diagram-frame', tabindex: '0', role: 'button',
        'aria-label': 'View diagram full screen',
      });
      frame.appendChild(result.svg);
      frame.addEventListener('click', () => openDiagramSheet(result.svg));
      frame.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDiagramSheet(result.svg); }
      });
      container.appendChild(frame);
    } else {
      const originalPre = container.__folioSourcePre;
      container.replaceWith(originalPre);
      originalPre.insertAdjacentElement('beforebegin', el('p', {
        class: 'diagram-fallback-note small muted',
        text: `Shown as code — this diagram uses flowchart syntax folio doesn't draw (${result.reason})`,
      }));
      if (window.hljs) { try { window.hljs.highlightElement(originalPre.querySelector('code')); } catch { /* unknown language */ } }
    }
  }

  blocks.forEach((code) => {
    const pre = code.parentElement;
    const container = el('div', { class: 'diagram-block' }, [
      el('div', { class: 'diagram-placeholder small muted', text: 'Diagram' }),
    ]);
    container.dataset.source = code.textContent;
    container.__folioSourcePre = pre;
    pre.replaceWith(container);
    observer.observe(container);
  });
}

/** Full-screen pinch-zoom view for one diagram, reusing the pointer-gesture
    pattern the image viewer already uses (fit-to-screen, pinch, double-tap). */
function openDiagramSheet(svg) {
  customSheet((panel, close) => {
    panel.classList.add('diagram-sheet');
    panel.appendChild(el('h2', { text: 'Diagram' }));
    const stage = el('div', { class: 'imgstage' });
    const canvas = el('div', { class: 'imgcanvas' });
    const clone = svg.cloneNode(true);
    panel.appendChild(stage);
    panel.appendChild(el('button', { type: 'button', text: 'Close', onclick: close }));
    stage.appendChild(canvas);
    canvas.appendChild(clone);

    const naturalW = Number(svg.getAttribute('width')) || 300;
    const naturalH = Number(svg.getAttribute('height')) || 200;
    let scale = 1;
    let fit = true;

    function applyTransform() {
      if (fit) {
        const availableW = Math.max(1, stage.clientWidth - 16);
        const availableH = Math.max(1, stage.clientHeight - 16);
        scale = Math.min(2, availableW / naturalW, availableH / naturalH);
      }
      const w = naturalW * scale;
      const h = naturalH * scale;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const verticalRoom = Math.max(0, stage.clientHeight - 16 - h);
      canvas.style.marginTop = `${verticalRoom / 2}px`;
      canvas.style.marginBottom = `${verticalRoom / 2}px`;
      clone.style.width = `${w}px`;
      clone.style.height = `${h}px`;
    }
    requestAnimationFrame(applyTransform);

    const active = new Map();
    let pinchStart = 0;
    let pinchScale = 1;
    let suppressTapUntil = 0;
    let lastTap = 0;
    const distance = () => {
      const points = Array.from(active.values());
      return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };
    stage.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      active.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (active.size === 2) { pinchStart = distance(); pinchScale = scale; suppressTapUntil = Date.now() + 400; }
    });
    stage.addEventListener('pointermove', (event) => {
      if (active.has(event.pointerId)) active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    const finishPinch = (event) => {
      if (active.size === 2 && pinchStart) {
        fit = false;
        scale = Math.max(0.5, Math.min(4, pinchScale * distance() / pinchStart));
        applyTransform();
      }
      active.delete(event.pointerId);
      if (active.size < 2) pinchStart = 0;
    };
    stage.addEventListener('pointerup', finishPinch);
    stage.addEventListener('pointercancel', finishPinch);
    stage.addEventListener('pointerup', (event) => {
      if (event.pointerType !== 'touch') return;
      const now = Date.now();
      if (now < suppressTapUntil) return;
      if (now - lastTap < 320) {
        fit = scale > 1.5;
        if (!fit) scale = 2;
        applyTransform();
        lastTap = 0;
      } else lastTap = now;
    });
  });
}

// ---------------------------------------------------------------------------
// Tables — wrap in a horizontal-scroll container so a 4-column Key terms
// table never crushes or clips on a narrow phone screen.
// ---------------------------------------------------------------------------

function wrapTables(article) {
  article.querySelectorAll('table').forEach((table) => {
    if (table.parentElement && table.parentElement.classList.contains('tablewrap')) return;
    const wrap = el('div', { class: 'tablewrap' });
    table.replaceWith(wrap);
    wrap.appendChild(table);
  });
}

// ---------------------------------------------------------------------------
// Blockquotes — the source ledger, 전제 지식, 다른 관점, and 원문 quotes each
// read differently once marked+DOMPurify have turned them into <blockquote>.
// ---------------------------------------------------------------------------

function classifyBlockquote(bq) {
  const text = bq.textContent || '';
  if (/읽은\s*자료/.test(text) && /빠진\s*내용/.test(text)) return 'ledger';
  const firstStrong = bq.querySelector('strong');
  const lead = firstStrong ? firstStrong.textContent : '';
  if (/^전제\s*지식/.test(lead)) return 'prereq';
  if (/^다른\s*관점/.test(lead)) return 'altview';
  return 'quote';
}

function ledgerHasAlert(text) {
  const readingClean = /못\s*읽은\s*자료\s*[:：]?\s*없음/.test(text);
  const contentClean = /빠진\s*내용\s*[:：]?\s*없음/.test(text);
  return !(readingClean && contentClean);
}

function styleBlockquotes(article) {
  article.querySelectorAll('blockquote').forEach((bq) => {
    const kind = classifyBlockquote(bq);
    bq.classList.add(`bq-${kind}`);
    if (kind === 'ledger' && ledgerHasAlert(bq.textContent || '')) bq.classList.add('bq-alert');
  });
}

// ---------------------------------------------------------------------------
// Rank tags — literal `[load-bearing]` / `[supporting]` / `[skippable]` text
// in headings and the Key terms table's rank column becomes a small chip,
// distinguished by fill/border/text per CONSTRAINTS → Color rather than by
// hue, so it still reads in greyscale.
// ---------------------------------------------------------------------------

const RANK_RE = /\[(load-bearing|supporting|skippable)\]/g;

function wrapRankTags(article) {
  const hosts = article.querySelectorAll('h1,h2,h3,h4,h5,h6,td,th');
  hosts.forEach((host) => {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const targets = [];
    let node = walker.nextNode();
    while (node) {
      RANK_RE.lastIndex = 0;
      if (RANK_RE.test(node.textContent)) targets.push(node);
      node = walker.nextNode();
    }
    targets.forEach((textNode) => {
      const text = textNode.textContent;
      RANK_RE.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let match = RANK_RE.exec(text);
      while (match) {
        if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        const rank = match[1];
        frag.appendChild(el('span', { class: `rank-chip rank-${rank}`, text: `[${rank}]` }));
        last = match.index + match[0].length;
        match = RANK_RE.exec(text);
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.replaceWith(frag);
    });
  });
}

// ---------------------------------------------------------------------------
// Contents (TOC) — keeps heading hierarchy, shows the current section, and
// no longer hard-truncates a long heading to 90 characters.
// ---------------------------------------------------------------------------

function openContentsSheet(headings, currentIndex, body) {
  customSheet((panel, close) => {
    panel.appendChild(el('h2', { text: 'Contents' }));
    const menu = el('menu', { class: 'toc-menu' });
    headings.forEach((heading, idx) => {
      const level = Math.min(4, Number(heading.tagName[1]) || 1);
      menu.appendChild(el('li', {}, [
        el('button', {
          type: 'button',
          class: idx === currentIndex ? 'toc-current' : '',
          dataset: { level: String(level) },
          text: heading.textContent,
          onclick: () => {
            close();
            try { heading.scrollIntoView({ block: 'start' }); } catch { heading.scrollIntoView(); }
          },
        }),
      ]));
    });
    panel.appendChild(menu);
    panel.appendChild(el('button', { type: 'button', text: 'Cancel', onclick: close }));
  });
  void body;
}

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
  const observers = [];

  function paintRendered() {
    observers.forEach((observer) => observer.disconnect());
    observers.length = 0;
    clear(article);
    const html = marked.parse(source, { gfm: true, breaks: false, async: false });
    const fragment = window.DOMPurify.sanitize(html, PURIFY_CONFIG);
    // Rewrite every fetch-capable node while the fragment is detached. Once a
    // src-bearing node enters the live document the browser may start a
    // request before the next JavaScript statement can remove it.
    fragment.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (!/^data:/i.test(src)) {
        img.replaceWith(el('span', { class: 'faint small', text: `[image: ${img.getAttribute('alt') || src}]` }));
      }
    });
    fragment.querySelectorAll('source,picture,video,audio,track').forEach((node) => {
      node.removeAttribute('src');
      node.removeAttribute('srcset');
      node.removeAttribute('poster');
      if (node.matches('source,track')) node.remove();
    });
    // javascript: links are stripped by DOMPurify; remaining external links are
    // confirmed by address before opening (plan 10장).
    fragment.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      if (/^https?:/i.test(href)) {
        anchor.addEventListener('click', (event) => { event.preventDefault(); ctx.openExternal(href); });
      } else if (!href.startsWith('#')) {
        anchor.removeAttribute('href');
      }
    });
    article.appendChild(fragment);

    // Every mermaid block is pulled out (into a diagram container) before
    // this query runs, whether or not it will end up parsing successfully —
    // a block that fails is spliced back into the DOM and highlighted
    // directly inside wireDiagrams' own IntersectionObserver callback, once
    // it is known to have failed. So nothing here needs to special-case them.
    wireDiagrams(article, observers);
    wrapTables(article);
    styleBlockquotes(article);
    wrapRankTags(article);

    if (hljs) {
      article.querySelectorAll('pre code').forEach((block) => {
        try { hljs.highlightElement(block); } catch { /* unknown language */ }
      });
    }
  }

  body.classList.add('pad');
  clear(body);
  body.appendChild(article);
  body.appendChild(raw);
  paintRendered();

  const state = await ctx.readingState();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const max = Math.max(0, body.scrollHeight - body.clientHeight);
    const ratio = Number(state.scrollRatio ?? state.progress);
    body.scrollTop = Number.isFinite(ratio) && ratio > 0 ? Math.min(max, ratio * max) : Math.min(max, Number(state.scrollY || 0));
  }));

  let showingSource = false;

  return {
    finder,
    tools: [
      el('button', {
        type: 'button', text: 'Contents',
        onclick: () => {
          const headings = Array.from(article.querySelectorAll('h1,h2,h3,h4'));
          if (!headings.length) { toast('This document has no headings.'); return; }
          let currentIndex = 0;
          headings.forEach((heading, idx) => { if (heading.offsetTop - 8 <= body.scrollTop) currentIndex = idx; });
          openContentsSheet(headings, currentIndex, body);
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
    destroy() { finder.clear(); observers.forEach((observer) => observer.disconnect()); },
  };
}
