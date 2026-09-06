/* Pure annotation helpers. Original document bytes are never changed. */

export const ANNOTATION_KINDS = Object.freeze(['highlight', 'note', 'exported-excerpt']);
export const ANNOTATION_COLORS = Object.freeze(['core', 'agree', 'question', 'word', 'quote']);
export const MAX_JOURNAL_TEXT_BYTES = 64 * 1024;

const normalize = (value) => String(value ?? '').normalize('NFC');
const yamlString = (value) => JSON.stringify(normalize(value));
const safeFilePart = (value) => normalize(value).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) || 'document';
const quoteMarkdown = (value) => normalize(value).split('\n').map((line) => `> ${line}`).join('\n');

export function annotationLocation(body, node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  const page = element?.closest?.('.pdfpage')?.dataset?.page;
  if (page) return { page: Number(page), locationLabel: `p. ${page}` };
  const row = element?.closest?.('tr')?.querySelector?.('th')?.textContent?.trim();
  if (row) return { row: Number(row) || row, locationLabel: `row ${row}` };
  const max = Math.max(1, body.scrollHeight - body.clientHeight);
  const scrollRatio = Math.max(0, Math.min(1, body.scrollTop / max));
  return { scrollRatio, locationLabel: `${Math.round(scrollRatio * 100)}%` };
}

export function currentLocation(body) {
  const centerX = Math.min(window.innerWidth - 1, Math.max(0, body.getBoundingClientRect().left + body.clientWidth / 2));
  const centerY = Math.min(window.innerHeight - 1, Math.max(0, body.getBoundingClientRect().top + body.clientHeight / 2));
  return annotationLocation(body, document.elementFromPoint(centerX, centerY) || body);
}

export function captureSelection(body, selection = window.getSelection()) {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (!common || !body.contains(common) || common.closest('iframe')) return null;
  const quote = normalize(selection.toString()).trim();
  if (!quote) return null;
  const location = annotationLocation(body, range.startContainer);
  const context = normalize(body.innerText || body.textContent || '');
  const at = context.indexOf(quote);
  return {
    quote,
    locator: {
      type: location.page ? 'pdf' : location.row ? 'csv' : 'text',
      ...location,
      textQuote: {
        exact: quote,
        prefix: at >= 0 ? context.slice(Math.max(0, at - 48), at) : '',
        suffix: at >= 0 ? context.slice(at + quote.length, at + quote.length + 48) : '',
      },
    },
  };
}

function textNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.length) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest('script,style,textarea,input,button,.annotation-toolbar')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

export function findTextRange(root, annotation) {
  const exact = normalize(annotation?.quote || annotation?.locator?.textQuote?.exact);
  if (!exact) return null;
  const nodes = textNodes(root);
  const text = nodes.map((node) => node.nodeValue).join('');
  const candidates = [];
  for (let at = text.indexOf(exact); at >= 0; at = text.indexOf(exact, at + Math.max(1, exact.length))) candidates.push(at);
  if (!candidates.length) return null;
  const prefix = normalize(annotation?.locator?.textQuote?.prefix || '');
  const suffix = normalize(annotation?.locator?.textQuote?.suffix || '');
  const startAt = candidates.find((at) => (!prefix || text.slice(Math.max(0, at - prefix.length), at).endsWith(prefix))
    && (!suffix || text.slice(at + exact.length, at + exact.length + suffix.length).startsWith(suffix))) ?? candidates[0];
  let cursor = 0; let startNode; let startOffset; let endNode; let endOffset;
  for (const node of nodes) {
    const next = cursor + node.nodeValue.length;
    if (!startNode && startAt >= cursor && startAt <= next) { startNode = node; startOffset = startAt - cursor; }
    const endAt = startAt + exact.length;
    if (endAt >= cursor && endAt <= next) { endNode = node; endOffset = endAt - cursor; break; }
    cursor = next;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function applyStoredHighlights(root, annotations) {
  if (!globalThis.CSS?.highlights || typeof globalThis.Highlight !== 'function') return () => {};
  const names = ANNOTATION_COLORS.map((color) => `folio-${color}`);
  names.forEach((name) => CSS.highlights.delete(name));
  const groups = new Map(ANNOTATION_COLORS.map((color) => [color, []]));
  (annotations || []).filter((item) => !item.deletedAt && item.kind === 'highlight' && item.quote).forEach((item) => {
    const range = findTextRange(root, item);
    if (range) groups.get(ANNOTATION_COLORS.includes(item.semanticColor) ? item.semanticColor : 'core').push(range);
  });
  groups.forEach((ranges, color) => { if (ranges.length) CSS.highlights.set(`folio-${color}`, new Highlight(...ranges)); });
  return () => names.forEach((name) => CSS.highlights.delete(name));
}

export function serializeAnnotationMarkdown(annotation, doc, { exportedAt = new Date().toISOString() } = {}) {
  const lines = [
    '---',
    'app: folio',
    `document: ${yamlString(doc?.title || doc?.fileName || 'Untitled')}`,
    `document_type: ${yamlString(doc?.kind || 'document')}`,
    `location: ${yamlString(annotation?.locator?.locationLabel || '')}`,
    `created_at: ${yamlString(annotation?.createdAt || exportedAt)}`,
    `exported_at: ${yamlString(exportedAt)}`,
    '---', '',
  ];
  if (annotation?.quote) lines.push('# Excerpt', '', quoteMarkdown(annotation.quote), '');
  if (annotation?.note) lines.push('# Note', '', normalize(annotation.note), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

// Shared by the single-document export and the multi-document (Export
// selected) export below, so both stay in the same order and format.
// `headingLevel` is 1 for a standalone file (the document gets an `#` title)
// and 2 when the document is one of several sections in a combined file
// (the document gets a `##` heading, so its own Highlight/Note entries drop
// to `###` and stay nested under it).
function documentAnnotationLines(annotations, doc, { headingLevel = 1 } = {}) {
  const active = (annotations || []).filter((item) => !item.deletedAt && item.kind !== 'exported-excerpt');
  const docHeading = '#'.repeat(headingLevel);
  const itemHeading = '#'.repeat(headingLevel + 1);
  const title = normalize(doc?.title || doc?.fileName || 'Untitled');
  const lines = [`${docHeading} ${title}${headingLevel === 1 ? ' — Folio notes' : ''}`, ''];
  if (!active.length) {
    // Decision (folio multi-export plan): a selected document with no
    // annotations still gets its heading, plus this line, rather than being
    // silently dropped — so `document_count`/`documents` in the frontmatter
    // always matches what actually appears in the body.
    lines.push('_No annotations._', '');
  } else {
    active.forEach((item) => {
      const label = item.kind === 'note' ? 'Note' : 'Highlight';
      lines.push(`${itemHeading} ${label}${item.locator?.locationLabel ? ` · ${item.locator.locationLabel}` : ''}`, '');
      if (item.quote) lines.push(quoteMarkdown(item.quote), '');
      if (item.note) lines.push(item.note, '');
    });
  }
  return { lines, count: active.length };
}

export function serializeDocumentAnnotations(annotations, doc, { exportedAt = new Date().toISOString() } = {}) {
  const { lines: body, count } = documentAnnotationLines(annotations, doc, { headingLevel: 1 });
  const head = [
    '---', 'app: folio',
    `document: ${yamlString(doc?.title || doc?.fileName || 'Untitled')}`,
    `document_type: ${yamlString(doc?.kind || 'document')}`,
    `exported_at: ${yamlString(exportedAt)}`,
    `annotation_count: ${count}`,
    '---', '',
  ];
  return `${[...head, ...body].join('\n').trimEnd()}\n`;
}

// Combines several documents' full annotation sets into one Markdown file.
// `entries` is an ordered array of { doc, annotations } — order is the
// caller's responsibility (library.js / app.js own the reorder UI).
export function serializeMultiDocumentAnnotations(entries, { exportedAt = new Date().toISOString() } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const head = [
    '---', 'app: folio',
    `exported_at: ${yamlString(exportedAt)}`,
    `document_count: ${list.length}`,
    'documents:',
    ...list.map(({ doc }) => `  - ${yamlString(doc?.title || doc?.fileName || 'Untitled')}`),
    '---', '',
  ];
  const body = [];
  list.forEach(({ doc, annotations }, index) => {
    if (index > 0) body.push('');
    body.push(...documentAnnotationLines(annotations, doc, { headingLevel: 2 }).lines);
  });
  return `${[...head, ...body].join('\n').trimEnd()}\n`;
}

export function multiAnnotationFileName(date = new Date()) {
  return `folio-notes-${date.toISOString().slice(0, 10)}.md`;
}

export function annotationFileName(doc, suffix = 'folio-notes', date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `${safeFilePart(doc?.title || doc?.fileName)}--${suffix}-${stamp}.md`;
}

export function journalTextFits(annotation) {
  return new TextEncoder().encode(`${annotation?.quote || ''}${annotation?.note || ''}`).byteLength <= MAX_JOURNAL_TEXT_BYTES;
}
