/* compose.js — add a document by typing or pasting it, instead of importing a
   file.

   The typed text is wrapped in a File and handed to the same import pipeline a
   picked file uses (library.importFiles), so detection, hashing, duplicate
   handling, search indexing and storage-room release all behave identically.
   Nothing about a pasted document is special once it is saved.

   The helpers above the sheet are pure so Node can test them. */

import { el, toast, formatBytes, customSheet } from './ui.js';

/** Only the kinds whose bytes are plain text. PDF, ZIP and images cannot be
    typed. */
export const COMPOSE_TYPES = Object.freeze([
  { kind: 'markdown', ext: 'md', label: 'Markdown', mime: 'text/markdown' },
  { kind: 'text', ext: 'txt', label: 'Text', mime: 'text/plain' },
  { kind: 'html', ext: 'html', label: 'HTML', mime: 'text/html' },
  { kind: 'csv', ext: 'csv', label: 'CSV', mime: 'text/csv' },
]);
export const DEFAULT_KIND = 'markdown';

const MAX_TITLE = 80;

export function typeOf(kind) {
  return COMPOSE_TYPES.find((type) => type.kind === kind) || COMPOSE_TYPES[0];
}

const squash = (text) => String(text).replace(/\s+/g, ' ').trim();
const clip = (text) => Array.from(String(text)).slice(0, MAX_TITLE).join('');
// A line of only ASCII punctuation ("---", "#", "=====") is a marker, not a
// title, so it is skipped. Anything else counts — an emoji-only line included.
const MARKER_ONLY = /^[\s!-/:-@[-`{-~]+$/;
function firstLine(text) {
  for (const raw of String(text).split(/\r?\n/)) {
    const line = squash(raw);
    if (line && !MARKER_ONLY.test(line)) return line;
  }
  return '';
}

// Only the start of a pasted document is ever read for a title. A title lives
// in the first screenful, and everything below runs on this window, so a huge
// or hostile paste cannot make the sheet stall.
const SCAN_CHARS = 100000;
// The fallback that strips tags to find visible text costs more per character.
const FALLBACK_CHARS = 20000;

// One pass, so "&amp;lt;" becomes "&lt;" and not "<".
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
function decodeEntities(text) {
  return String(text).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => ENTITIES[name]);
}

/** Pasted HTML is far more common than Markdown that opens with a raw tag, so
    a document that starts with a tag and closes one somewhere is treated as
    HTML. The sheet only uses this until the person picks a type themselves. */
export function looksLikeHtml(text) {
  const source = String(text || '');
  const head = source.slice(0, 4000).replace(/^\uFEFF/, '').trimStart();
  if (/^<!doctype\s+html/i.test(head) || /^<html[\s>]/i.test(head)) return true;
  return /^<[a-z][a-z0-9-]*[\s>/]/i.test(head) && /<\/[a-z][a-z0-9-]*\s*>/i.test(source.slice(0, 50000));
}

/** The type to show for some text the person has not yet chosen a type for:
    HTML if it reads as HTML, otherwise their usual non-HTML type. */
export function pickKind(text, fallback) {
  return looksLikeHtml(text) ? 'html' : typeOf(fallback).kind;
}

/** What to fall back on next time, given what was just saved. HTML is never
    remembered: it is recognised from the text itself, and remembering it would
    file the next pasted Markdown note as an HTML page. */
export function rememberKind(previous, saved) {
  return saved === 'html' || !COMPOSE_TYPES.some((type) => type.kind === saved) ? previous : saved;
}

/** "## Title ##" -> "Title". A closing run of # counts only when a space or tab
    precedes it, so "# C#" stays "C#". String work, not a regex: a pattern with
    two adjacent optional runs backtracks catastrophically on long lines. */
function stripClosingHashes(text) {
  const trimmed = text.trimEnd();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === '#') end -= 1;
  if (end < trimmed.length && (end === 0 || trimmed[end - 1] === ' ' || trimmed[end - 1] === '\t')) return trimmed.slice(0, end).trimEnd();
  return trimmed;
}

/** The first "# …" heading, skipping anything inside a fenced code block (a
    shell comment in a ``` fence is not the title). */
function firstHeading(source) {
  let fence = '';
  for (const line of source.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = '';
      continue;
    }
    if (fence) continue;
    const match = /^ {0,3}#{1,6}[ \t]+(.*)$/.exec(line);
    if (!match) continue;
    const text = squash(stripClosingHashes(match[1]).replace(/(\*\*|__|~~|`)/g, ''));
    if (text) return text;
  }
  return '';
}

/** YAML front matter — `---` … `---` on the first lines — as its lines and the
    text after it, or null. */
function splitFrontMatter(source) {
  if (!/^---[ \t]*\r?\n/.test(source)) return null;
  const lines = source.split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---[ \t]*$/.test(lines[i])) return { head: lines.slice(1, i), rest: lines.slice(i + 1).join('\n') };
  }
  return null;
}

function unquote(value) {
  const text = squash(value);
  const quote = text[0];
  return (quote === '"' || quote === "'") && text.length > 1 && text[text.length - 1] === quote ? text.slice(1, -1) : text;
}

/** A title from the content, so the person does not have to type one:
    HTML <title> or first <h1>, Markdown's first heading, otherwise the first
    non-empty line. */
export function deriveTitle(kind, text) {
  const source = String(text || '').slice(0, SCAN_CHARS).replace(/^\uFEFF/, '');
  let title = '';
  if (kind === 'html') {
    const match = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(source) || /<h1[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(source);
    if (match) title = squash(decodeEntities(match[1].replace(/<[^>]*>/g, ' ')));
    if (!title) {
      const visible = source
        .slice(0, FALLBACK_CHARS)
        .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]*>/g, '\n');
      title = firstLine(decodeEntities(visible));
    }
  } else if (kind === 'markdown') {
    // Notes often open with YAML front matter; its `title:` beats a heading.
    const front = splitFrontMatter(source);
    const body = front ? front.rest : source;
    const named = front && front.head.map((line) => /^title:[ \t]*(.*)$/i.exec(line)).find(Boolean);
    if (named) title = unquote(named[1]);
    if (!title) title = firstHeading(body);
    if (!title && front) return clip(firstLine(body)) || 'Untitled';
  }
  if (!title) title = firstLine(source);
  return clip(title) || 'Untitled';
}

/** A name that is safe to export and share. The title shown in the library is
    kept exactly as typed; only this file name is cleaned. */
export function buildFileName(title, ext) {
  const cleaned = Array.from(
    String(title || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, ''),
  ).slice(0, MAX_TITLE).join('').replace(/[ .-]+$/, '');
  return `${cleaned || 'untitled'}.${ext}`;
}

/** The File the import pipeline will see, plus the title to show. */
export function buildFile({ title, kind, text }) {
  const type = typeOf(kind);
  const shown = clip(squash(title || '')) || deriveTitle(type.kind, text);
  const file = new File([String(text)], buildFileName(shown, type.ext), { type: `${type.mime};charset=utf-8` });
  return { file, title: shown };
}

/* ── the sheet ─────────────────────────────────────────────────────────── */

// What was typed survives closing the sheet (a stray tap outside dismisses it)
// and is dropped only once the text has actually been added. Memory only: it
// may be a private document, so it is never written anywhere.
let draft = null;
// The type to fall back on when the text does not look like HTML. HTML is never
// remembered here: it is recognised from the text itself, and remembering it
// would file the next pasted Markdown note as an HTML page.
let lastKind = DEFAULT_KIND;

function lineCount(text) { return text ? text.split('\n').length : 0; }
function byteLength(text) { return new TextEncoder().encode(text).length; }

/**
 * @param {object} args
 * @param {{id:string,name:string}[]} args.folders
 * @param {string} args.folderId  folder to pre-select ('' = Unsorted)
 * @param {(values:{title:string,kind:string,text:string,folderId:string|null}) => Promise<boolean>} args.onSave
 *        resolves true once the text is in the library (or already was)
 */
export function openComposeSheet({ folders, folderId = '', onSave }) {
  const values = draft
    ? { ...draft }
    : { title: '', kind: lastKind, kindPicked: false, text: '' };

  customSheet((panel, close) => {
    panel.classList.add('compose');
    panel.appendChild(el('h2', { text: 'Add from text' }));

    // Actions come first: with the keyboard open the bottom of a sheet can sit
    // under it, and the top cannot.
    const addButton = el('button', { class: 'primary', type: 'button', text: 'Add to library', disabled: true });
    panel.appendChild(el('div', { class: 'row' }, [
      addButton,
      el('button', { type: 'button', text: 'Cancel', onclick: close }),
    ]));

    const titleInput = el('input', {
      type: 'text', class: 'compose-title', 'aria-label': 'Title', placeholder: 'Title (optional — taken from the text)',
      autocomplete: 'off', enterkeyhint: 'next', maxlength: '120',
    });
    titleInput.value = values.title;
    panel.appendChild(titleInput);

    const typeRow = el('div', { class: 'compose-types', role: 'group', 'aria-label': 'Type' });
    const paintTypes = () => {
      typeRow.querySelectorAll('button').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.kind === values.kind));
      });
    };
    COMPOSE_TYPES.forEach((type) => {
      typeRow.appendChild(el('button', {
        class: 'chip', type: 'button', text: type.label, dataset: { kind: type.kind },
        onclick: () => { values.kind = type.kind; values.kindPicked = true; paintTypes(); update(); },
      }));
    });
    panel.appendChild(typeRow);

    const folderSelect = el('select', { 'aria-label': 'Folder' }, [
      el('option', { value: '', text: 'Unsorted' }),
      ...folders.map((folder) => el('option', { value: folder.id, text: folder.name })),
    ]);
    folderSelect.value = folders.some((folder) => folder.id === folderId) ? folderId : '';
    panel.appendChild(el('label', { class: 'compose-field' }, [el('span', { class: 'small muted', text: 'Folder' }), folderSelect]));

    const textarea = el('textarea', {
      class: 'compose-text', 'aria-label': 'Text or code', placeholder: 'Paste or type here…', rows: '8',
      spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', 'data-autofocus': '',
    });
    textarea.value = values.text;
    panel.appendChild(textarea);

    const info = el('p', { class: 'small muted compose-info' });
    panel.appendChild(info);

    const clearButton = el('button', { type: 'button', text: 'Clear' });
    const pasteButton = el('button', { type: 'button', text: 'Paste from clipboard' });
    panel.appendChild(el('div', { class: 'row' }, [pasteButton, clearButton]));

    function update() {
      const hasText = values.text.trim().length > 0;
      addButton.disabled = !hasText;
      clearButton.disabled = !values.text;
      info.textContent = values.text
        ? `${lineCount(values.text)} line${lineCount(values.text) === 1 ? '' : 's'} · ${formatBytes(byteLength(values.text))}`
        : 'Nothing yet.';
      draft = { title: values.title, kind: values.kind, kindPicked: values.kindPicked, text: values.text };
    }

    function onText() {
      values.text = textarea.value;
      // Follow the content until the person picks a type themselves.
      if (!values.kindPicked) { values.kind = pickKind(values.text, lastKind); paintTypes(); }
      update();
    }

    // The box itself is the truth, so every `input` is read — composing or not.
    // Skipping the ones flagged `isComposing` (as the search box rightly does)
    // left the mirrored text a syllable behind: on iOS a tap on Add lands while
    // a Korean syllable is still being composed, and the last characters were
    // saved without it. Reading half-formed text is harmless here — it only
    // moves the Add button and the HTML guess, and a syllable is never HTML.
    textarea.addEventListener('input', onText);
    textarea.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.isComposing && !addButton.disabled) {
        event.preventDefault();
        addButton.click();
      }
    });
    titleInput.addEventListener('input', () => { values.title = titleInput.value; update(); });
    titleInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); textarea.focus(); }
    });

    clearButton.addEventListener('click', () => {
      textarea.value = '';
      values.text = '';
      if (!values.kindPicked) { values.kind = pickKind('', lastKind); paintTypes(); }
      update();
      textarea.focus();
    });

    pasteButton.addEventListener('click', async () => {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        toast('Couldn’t read the clipboard. Long-press the box and choose Paste.');
        textarea.focus();
        return;
      }
      if (!text) { toast('The clipboard is empty.'); return; }
      const start = textarea.selectionStart == null ? textarea.value.length : textarea.selectionStart;
      const end = textarea.selectionEnd == null ? start : textarea.selectionEnd;
      textarea.setRangeText(text, start, end, 'end');
      onText();
      textarea.focus();
    });

    addButton.addEventListener('click', async () => {
      // Read the fields again rather than trusting the mirror (see above).
      values.text = textarea.value;
      values.title = titleInput.value;
      if (!values.text.trim()) return;
      const submitted = { title: values.title, kind: values.kind, text: values.text, folderId: folderSelect.value || null };
      close();
      const saved = await onSave(submitted);
      if (saved) {
        lastKind = rememberKind(lastKind, submitted.kind);
        draft = null;
      }
    });

    paintTypes();
    onText();
  });
}
