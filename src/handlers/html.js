/* handlers/html.js — one document, three viewing modes (plan 6-4).

     Read (default) — DOMPurify strips scripts, event attributes, <iframe> and
                      <object>; the result renders in a sandbox with no
                      allow-scripts, inside preview-host.html's own CSP.
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
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base'],
  ALLOW_DATA_ATTR: false,
  // Data attributes are off, but this one is folio's own marker for a link
  // that points inside the package, so it is allowed back in by name.
  ADD_ATTR: ['data-folio-path'],
};

export async function extractText(blob, doc) {
  if (doc && doc.kind === 'html-package') return { text: '', patch: {} };
  const decoded = await decodeBlob(blob, doc && doc.encoding);
  const parsed = new DOMParser().parseFromString(decoded.text, 'text/html');
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

/** Read mode markup. DOMPurify returns a DOM tree; `outerHTML` only reads it
    back for the sandbox's srcdoc — no markup is ever assigned to an element.
    Exported so the review can assert on the exact string Read mode renders. */
export function sanitizeDocument(source) {
  const root = window.DOMPurify.sanitize(source, PURIFY_DOCUMENT);
  return `<!DOCTYPE html>\n${root.outerHTML}`;
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

  const analysis = pkg.analyze(source);
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
    const readSource = isPackage
      ? pkg.materialize({ content: source, packageAssets: assets, entryPath: doc.entryPath || 'index.html' }, preview.newSession(), '', '').html
      : source;
    const state = await ctx.readingState();
    mounted = preview.mount(stage, {
      html: preview.ensureViewport(sanitizeDocument(readSource)),
      allowScripts: false,
      title: doc.title,
      restoreY: state.scrollY || 0,
      onScroll: (y) => ctx.saveReading({ scrollY: y }),
      onOpen: (url) => ctx.openExternal(url),
      onOpenAsset: (path) => ctx.openAsset(path),
    });
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
