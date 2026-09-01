/* handlers/html.js — one document, three viewing modes (plan 6-4).

     Read (default) — DOMPurify strips scripts, event attributes, <iframe> and
                      <object>; the result renders in a sandbox inside
                      preview-host.html's own CSP. `<style>` and inline `style`
                      attributes survive (2026-09-01, Plan/folio_bsb-reading-plan
                      F항) — a self-contained styled document (inline SVG
                      diagrams, coloured sections) reads as it was built to,
                      not stripped to plain text. This is safe with no
                      allowlist of "safe" CSS: the frame's own injected CSP
                      (sanitizeDocument, below) blocks every network-capable
                      CSS feature outright (style-src carries no host, only
                      'unsafe-inline'; img/font-src are data: only; connect-src
                      is 'none'), so a CSS `url(…)` pointed at a remote host
                      anywhere in the document's CSS fails at the browser's
                      CSP layer even
                      though DOMPurify never inspected it. The inner frame also
                      gets allow-scripts now, but ONLY to run folio's own
                      scroll-position/zoom messenger (preview.instrument(),
                      injected after sanitizing) — never the document's own
                      code, which DOMPurify has already deleted outright by
                      forbidding the `script` tag. The same-origin sandbox
                      token is never granted, in any mode (tests/static.test
                      .mjs greps the whole tree for it).
     Run            — the vault engine, off until the user turns it on per
                      document. connect-src 'none', memory-backed storage,
                      remote JavaScript blocked.
     Source         — the original code, highlighted.

   ZIP packages are Run-only; there is no meaningful Read of a package. */

import { el, clear, confirmDialog, toast } from '../ui.js';
import { decodeBlob } from './encoding.js';
import { Finder } from '../find.js';
import * as pkg from '../package.js';
import * as preview from '../preview.js';

export const kinds = ['html', 'html-package'];

const PURIFY_DOCUMENT = {
  WHOLE_DOCUMENT: true,
  RETURN_DOM: true,
  // 'style' stays forbidden here — DOMPurify never sees a real <style> tag or
  // style="" attribute at all; extractStyles() below swaps both out for inert
  // placeholders before sanitizing, and restoreStyles() puts them back on the
  // serialized string afterwards. See the note above extractStyles for why.
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta', 'source', 'picture', 'video', 'audio', 'track'],
  ALLOW_DATA_ATTR: false,
  // Data attributes are off, but these are folio's own markers — the link
  // that points inside a package, and the two style placeholders below — so
  // they're allowed back in by name.
  ADD_ATTR: ['data-folio-path', 'data-folio-style-block', 'data-folio-style-attr'],
};

export async function extractText(blob, doc) {
  if (doc && doc.kind === 'html-package') return { text: '', patch: {} };
  const decoded = await decodeBlob(blob, doc && doc.encoding);
  // Same reason as pkg.analyze() below: a style block/attribute reaching
  // DOMParser here sets it for real, under folio's own CSP. Only title/body
  // text is read back, so the placeholder swap costs nothing.
  const parsed = new DOMParser().parseFromString(extractStyles(decoded.text).html, 'text/html');
  return {
    text: `${parsed.title || ''}\n${parsed.body ? parsed.body.textContent : ''}`,
    patch: { encoding: decoded.encoding },
  };
}

/**
 * Has this package lost its assets?
 *
 * An empty asset map is not by itself a fault — a ZIP holding nothing but
 * `index.html` legitimately has none, and blocking those was the regression
 * this replaces. The fault is assets that are *gone*, which shows up two ways:
 *
 *   · `packageAssetsReleased` — a release deleted them (current builds);
 *   · more files at import than the entry alone — the document was broken by
 *     build 2026.08.12-init1, whose release deleted the assets and whose
 *     reconnect cleared `released` without restoring them or setting the flag.
 *
 * The second test is what still protects documents already on a device; the
 * flag alone cannot see them, because it did not exist when they broke.
 */
export function packageAssetsMissing(doc, assets) {
  if (!doc || doc.kind !== 'html-package') return false;
  if (assets && Object.keys(assets).length > 0) return false;
  return Boolean(doc.packageAssetsReleased) || Number(doc.packageFileCount) > 1;
}

/* DOMPurify (RETURN_DOM + WHOLE_DOCUMENT) has to build real DOM nodes to walk
   and serialize the document. If any of those nodes carried a real `<style>`
   tag or a real style="" attribute, the moment DOMPurify's parser sets it,
   the browser enforces folio's OWN shell CSP (style-src 'self') against it —
   as pure console noise, since none of this ever attaches to the visible
   page — because that DOM belongs to folio's own document, the one the shell
   CSP governs. (A scratch iframe doesn't dodge this: an unnavigated
   same-origin frame inherits its creator's CSP by spec, precisely to close
   off this kind of workaround.) The only way to keep the parser from ever
   seeing a real style attribute or tag is to not give it one: extractStyles
   swaps each for an inert numbered placeholder as plain text BEFORE
   sanitizing (a `<template data-folio-style-block>` for a `<style>` block,
   a `data-folio-style-attr` marker for a style="" attribute — 'template' is
   valid metadata content, so a block that was inside <head> stays there);
   restoreStyles swaps the placeholders back on the SERIALIZED STRING
   afterwards. Pure text substitution, before and after — nothing is ever
   DOM-attribute-set under folio's CSP, so there is nothing for it to catch.
   What comes out the other end is identical to what DOMPurify would have
   produced had it been allowed to carry style content through directly. */
const STYLE_BLOCK_RE = /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi;
const TAG_OPEN_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*)?)(\/?)>/g;
const STYLE_ATTR_RE = /(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/i;

function extractStyles(html) {
  const styleBlocks = [];
  const styleAttrs = [];
  let out = html.replace(STYLE_BLOCK_RE, (match, attrs, content) => {
    const id = styleBlocks.length;
    styleBlocks.push({ attrs, content });
    return `<template data-folio-style-block="${id}"></template>`;
  });
  out = out.replace(TAG_OPEN_RE, (tag, name, attrPart) => {
    if (!attrPart || !STYLE_ATTR_RE.test(attrPart)) return tag;
    const id = styleAttrs.length;
    let value = '';
    const newAttrPart = attrPart.replace(STYLE_ATTR_RE, (m, pre, quoted, dq, sq) => {
      value = dq !== undefined ? dq : sq;
      return '';
    });
    styleAttrs.push(value);
    return tag.replace(attrPart, `${newAttrPart} data-folio-style-attr="${id}"`);
  });
  return { html: out, styleBlocks, styleAttrs };
}

function restoreStyles(html, styleBlocks, styleAttrs) {
  let out = html.replace(/<template\s+data-folio-style-block="(\d+)"[^>]*>\s*<\/template>/gi, (match, idStr) => {
    const entry = styleBlocks[Number(idStr)];
    if (!entry) return '';
    return `<style${entry.attrs}>${entry.content}</style>`;
  });
  out = out.replace(/\s*data-folio-style-attr="(\d+)"/gi, (match, idStr) => {
    const value = styleAttrs[Number(idStr)];
    if (value === undefined) return '';
    return ` style="${value.replace(/"/g, '&quot;')}"`;
  });
  return out;
}

/** Read mode markup. DOMPurify returns a DOM tree; `outerHTML` only reads it
    back for the sandbox's srcdoc — no markup is ever assigned to an element.
    Exported so the review can assert on the exact string Read mode renders. */
export function sanitizeDocument(source) {
  const { html: doctored, styleBlocks, styleAttrs } = extractStyles(source);
  const root = window.DOMPurify.sanitize(doctored, PURIFY_DOCUMENT);
  root.querySelectorAll('[src],[srcset],[poster],[background]').forEach((node) => {
    node.removeAttribute('src');
    node.removeAttribute('srcset');
    node.removeAttribute('poster');
    node.removeAttribute('background');
  });
  const head = root.head || root.querySelector('head');
  if (head) {
    const csp = document.createElement('meta');
    csp.setAttribute('http-equiv', 'Content-Security-Policy');
    // style-src carries no host — only 'unsafe-inline' — so a <style> block
    // or a style="" attribute renders, but any url(…) pointed at a remote
    // host inside one
    // fails at this layer even though DOMPurify never inspected CSS text.
    // script-src 'unsafe-inline' exists solely so folio's own instrumentation
    // (injected AFTER this sanitize, never before) can run; the document's
    // own <script> tags are already gone by the time this string is built.
    csp.setAttribute('content', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'none'; media-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'");
    head.prepend(csp);
  }
  return restoreStyles(`<!DOCTYPE html>\n${root.outerHTML}`, styleBlocks, styleAttrs);
}

export async function render(ctx) {
  const { body, doc } = ctx;
  const isPackage = doc.kind === 'html-package';

  let source = '';
  let assets = null;
  if (isPackage) {
    assets = await ctx.packageAssets();
    source = doc.entryContent || '';
  } else {
    source = (await decodeBlob(ctx.blob, doc.encoding)).text;
  }

  /* A package that has LOST its assets is not a document that renders badly —
     it is a document folio no longer has. The entry HTML alone would draw a
     page that looks fine and whose every internal link is dead, which misleads
     rather than informs. A package that never had assets renders normally. */
  if (packageAssetsMissing(doc, assets)) {
    body.classList.add('pad');
    clear(body);
    body.appendChild(el('div', { class: 'empty' }, [
      el('p', { text: "This package's files are missing. Reconnect the original ZIP." }),
      el('button', { class: 'primary', type: 'button', text: 'Reconnect', onclick: () => ctx.reconnect() }),
    ]));
    return { tools: [], destroy() {} };
  }

  // pkg.analyze only reads src/href/script/link attributes — the style
  // content itself is irrelevant to it, so it gets the same style-stripped
  // string sanitizeDocument uses. Feeding it the raw source, unstripped,
  // makes ITS internal DOMParser().parseFromString() set a real style
  // attribute/tag too, tripping folio's shell CSP the same way (see the note
  // above extractStyles).
  const analysis = pkg.analyze(extractStyles(source).html);
  const wrapper = el('div', { class: 'framewrap' });
  const noticeHost = el('div');
  const stage = el('div', { class: 'framewrap' });
  const issueHost = el('div');
  wrapper.appendChild(noticeHost);
  wrapper.appendChild(stage);
  wrapper.appendChild(issueHost);

  body.classList.remove('pad');
  clear(body);
  body.appendChild(wrapper);

  const sourceView = el('pre', { class: 'plain hidden' });
  const sourceCode = el('code');
  sourceCode.textContent = source;
  sourceView.appendChild(sourceCode);
  body.appendChild(sourceView);
  const finder = new Finder(sourceView);
  let highlighted = false;

  let mounted = null;
  let issues = [];
  let mode = isPackage ? 'run' : 'read';
  const buttons = {};

  // Read mode's zoom follows the app's own text-size steps (settings.js /
  // app.js DOC_STEPS), which live on the OUTER document as --fs-doc — a var
  // that cannot cross the sandboxed iframe boundary on its own. Watching it
  // here and relaying through preview.mount().setZoom() is the bridge.
  let zoomObserver = null;
  function currentZoomRatio() {
    const px = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs-doc'), 10) || 15;
    return px / 15; // 15px is the app's own default doc size (DOC_STEPS[4])
  }
  function watchZoom() {
    zoomObserver?.disconnect();
    zoomObserver = new MutationObserver(() => { if (mounted && mode === 'read') mounted.setZoom(currentZoomRatio()); });
    zoomObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  }

  function addIssue(kind, message, severity) {
    const clean = String(message || '').slice(0, 300);
    if (!clean) return;
    const key = `${kind}\u0000${clean}`;
    if (issues.some((issue) => issue.key === key)) return;
    issues.push({ key, kind, message: clean, severity: severity === 'error' ? 'error' : 'warning' });
    paintIssues();
  }

  function paintIssues() {
    clear(issueHost);
    if (mode !== 'run') return;
    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const details = el('details', { class: 'preview-issues', dataset: { severity: errors ? 'error' : 'none' } });
    details.appendChild(el('summary', { text: `Preview issues (${issues.length})` }));
    if (issues.length) {
      const list = el('ul');
      issues.forEach((issue) => {
        list.appendChild(el('li', {}, [el('strong', { text: `${issue.kind}: ` }), document.createTextNode(issue.message)]));
      });
      details.appendChild(list);
    }
    issueHost.appendChild(details);
  }

  function unmount() {
    zoomObserver?.disconnect();
    zoomObserver = null;
    if (mounted) { mounted.destroy(); mounted = null; }
    clear(stage);
    clear(noticeHost);
  }

  async function mountRead() {
    unmount();
    issues = [];
    paintIssues();
    const blocked = analysis.remote.length + analysis.remoteScripts.length + analysis.remoteStyles.length;
    if (blocked) {
      noticeHost.appendChild(el('div', {
        class: 'pv-note',
        text: `Blocked ${blocked} remote resource${blocked === 1 ? '' : 's'}. Switch to Run to load this document with scripts.`,
      }));
    }
    /* A package is rewritten first so its images resolve and its links carry
       `data-folio-path`, then sanitized — the sanitizer removes every script
       the rewrite inlined, so the frame still loads with no scripting at all.
       (Packages are Run-only in the UI per plan 6-4; this keeps Read correct
       for the day it is reachable.) */
    const session = preview.newSession();
    const readSource = isPackage
      ? pkg.materialize({ content: source, packageAssets: assets, entryPath: doc.entryPath || 'index.html' }, session, '', '').html
      : source;
    const state = await ctx.readingState();
    // sanitize FIRST — every original <script> is deleted by DOMPurify — then
    // inject folio's own instrumentation, which never passes through
    // DOMPurify at all and is the only script the inner frame will ever hold.
    const sanitized = preview.ensureViewport(sanitizeDocument(readSource));
    const instrumented = preview.injectHead(sanitized, preview.instrument(session));
    mounted = preview.mount(stage, {
      html: instrumented,
      session,
      allowScripts: false,
      innerSandbox: preview.INNER_SANDBOX_READ_SCRIPTED,
      title: doc.title,
      restoreY: state.scrollY || 0,
      onScroll: (y) => ctx.saveReading({ scrollY: y }),
      onOpen: (url) => ctx.openExternal(url),
      onOpenAsset: (path) => ctx.openAsset(path),
    });
    watchZoom();
    mounted.setZoom(currentZoomRatio());
  }

  function buildRunHtml(session) {
    if (isPackage) {
      const result = pkg.materialize(
        { content: source, packageAssets: assets, entryPath: doc.entryPath || 'index.html' },
        session, preview.instrument(session), preview.STORAGE_SHIM,
      );
      result.warnings.forEach((warning) => {
        addIssue('Package materialization', warning, /script|blocked|unsupported/i.test(warning) ? 'error' : 'warning');
      });
      return result.html;
    }
    let html = preview.ensureViewport(source);
    html = preview.injectHead(html, preview.STORAGE_SHIM);
    return preview.injectHead(html, preview.instrument(session));
  }

  async function mountRun() {
    unmount();
    issues = [];
    if (analysis.remoteScripts.length) {
      noticeHost.appendChild(el('div', {
        class: 'pv-note critical',
        text: `Required JavaScript is blocked. This document depends on ${analysis.remoteScripts.length} remote script${analysis.remoteScripts.length === 1 ? '' : 's'}, so its charts or controls may not run. Import a local ZIP package instead.`,
      }));
    }
    const session = preview.newSession();
    const html = buildRunHtml(session);
    paintIssues();
    const state = await ctx.readingState();
    mounted = preview.mount(stage, {
      html,
      // The same id the instrumentation inside `html` posts with; without it
      // preview-host discards every message the document sends.
      session,
      allowScripts: true,
      title: doc.title,
      restoreY: state.scrollY || 0,
      onScroll: (y) => ctx.saveReading({ scrollY: y }),
      onOpen: (url) => ctx.openExternal(url),
      onOpenAsset: (path) => ctx.openAsset(path),
      onIssue: addIssue,
    });
  }

  function paintButtons() {
    Object.entries(buttons).forEach(([name, button]) => {
      if (button) button.setAttribute('aria-pressed', String(mode === name));
    });
  }

  async function setMode(next) {
    if (next === mode && next !== 'run') return;
    if (next === 'run' && !doc.runEnabled) {
      const ok = await confirmDialog({
        title: 'Run this document?',
        message: 'Scripts in this document will run in an isolated sandbox. It cannot read your other documents, send data anywhere, or keep anything after you leave.',
        confirmLabel: 'Run',
      });
      if (!ok) { paintButtons(); return; }
      await ctx.patchDoc({ runEnabled: true });
      doc.runEnabled = true;
    }
    mode = next;
    finder.clear();
    sourceView.classList.toggle('hidden', mode !== 'source');
    wrapper.classList.toggle('hidden', mode === 'source');
    if (mode === 'source') {
      unmount();
      if (!highlighted && window.hljs) {
        highlighted = true;
        try { window.hljs.highlightElement(sourceCode); } catch { /* unknown language */ }
      }
    } else if (mode === 'read') {
      await mountRead();
    } else {
      await mountRun();
    }
    paintButtons();
  }

  const segment = el('div', { class: 'seg', role: 'group', 'aria-label': 'View mode' });
  if (!isPackage) {
    buttons.read = el('button', { type: 'button', text: 'Read', onclick: () => setMode('read') });
    segment.appendChild(buttons.read);
  }
  buttons.run = el('button', { type: 'button', text: 'Run', onclick: () => setMode('run') });
  segment.appendChild(buttons.run);
  buttons.source = el('button', { type: 'button', text: 'Source', onclick: () => setMode('source') });
  if (!isPackage) segment.appendChild(buttons.source);

  if (isPackage && !doc.runEnabled) {
    // A package has nothing to show until Run is allowed, so ask straight away.
    const ok = await confirmDialog({
      title: 'Run this document?',
      message: 'Scripts in this document will run in an isolated sandbox. It cannot read your other documents, send data anywhere, or keep anything after you leave.',
      confirmLabel: 'Run',
    });
    if (ok) { await ctx.patchDoc({ runEnabled: true }); doc.runEnabled = true; await mountRun(); }
    else { clear(stage); stage.appendChild(el('div', { class: 'empty' }, [el('p', { text: 'Run is off for this document.' })])); }
  } else if (isPackage) {
    await mountRun();
  } else {
    await mountRead();
  }
  paintButtons();

  return {
    finder,
    textZoomEnabled: () => mode === 'read' || mode === 'source',
    tools: [
      segment,
      el('button', {
        type: 'button', text: 'Find',
        onclick: () => {
          if (mode !== 'source') { toast('Switch to Source to search inside the code.'); return; }
          ctx.openFind(finder);
        },
      }),
    ],
    destroy() { unmount(); finder.clear(); },
  };
}
