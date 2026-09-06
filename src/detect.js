/* detect.js — what kind of document is this?
   Extension first, magic bytes second. The bytes win for the container
   formats (PDF, ZIP, images) because a renamed file must not be handed to the
   wrong viewer; the extension decides among the text families, which share
   the same bytes. */

import { labelFor } from './handlers/encoding.js';

export const KINDS = ['text', 'markdown', 'html', 'html-package', 'pdf', 'csv', 'image'];

export const TAG_OF = Object.freeze({
  text: 'txt', markdown: 'md', html: 'html', 'html-package': 'pkg',
  pdf: 'pdf', csv: 'csv', image: 'img',
});

export const FAMILY_CLASS = Object.freeze({
  text: 'f-write', markdown: 'f-write',
  html: 'f-page', 'html-package': 'f-page',
  pdf: 'f-fixed',
  csv: 'f-media', image: 'f-media',
});

const BY_EXTENSION = Object.freeze({
  txt: 'text', log: 'text',
  md: 'markdown', markdown: 'markdown',
  html: 'html', htm: 'html',
  zip: 'html-package',
  pdf: 'pdf',
  csv: 'csv', tsv: 'csv',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image',
  webp: 'image', svg: 'image', heic: 'image', heif: 'image',
});

export function extensionOf(name) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

function ascii(bytes, start, length) {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Container sniffing. Returns a kind, or '' when the bytes say nothing. */
export function sniff(bytes) {
  if (!bytes || bytes.length < 4) return '';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'pdf';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7)) return 'html-package';
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'image';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image';
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif'].includes(brand)) return 'image';
  }
  return '';
}

const TEXTUAL = new Set(['text', 'markdown', 'html', 'csv']);

/** Decide the kind for one picked file.
    Returns {kind, reason} — `reason` is set only when the file is rejected. */
export async function detect(file) {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const extension = extensionOf(file.name);
  const byExtension = BY_EXTENSION[extension] || '';
  const byBytes = sniff(head);

  if (byBytes === 'pdf') return { kind: 'pdf' };
  if (byBytes === 'html-package') {
    // Office and EPUB files are ZIP containers too, and folio does not open them.
    if (['docx', 'xlsx', 'pptx', 'epub', 'hwpx'].includes(extension)) {
      return { kind: '', reason: `folio can't open ${extension.toUpperCase()} files.` };
    }
    return { kind: 'html-package' };
  }
  if (byBytes === 'image') return { kind: 'image' };

  // SVG is text on disk, so the bytes cannot classify it; the extension and a
  // root-element check do.
  if (extension === 'svg') {
    const sample = new TextDecoder('utf-8').decode(head).trim();
    if (/^(?:<\?xml|<!--|<svg)/i.test(sample)) return { kind: 'image' };
    return { kind: '', reason: 'This file is named .svg but does not contain SVG markup.' };
  }

  if (byExtension && TEXTUAL.has(byExtension)) return { kind: byExtension };
  if (byExtension === 'image') return { kind: 'image' };

  if (!byExtension) {
    return { kind: '', reason: `folio doesn't support ${extension ? `.${extension}` : 'this'} files.` };
  }
  return { kind: byExtension };
}

/** Displayed under the title in the library row (spec 2-4). */
export function subtitleFor(doc) {
  switch (doc.kind) {
    // The spec shows the plural forms (`18 pages`, `1,204 rows`); the singular
    // is added here rather than printing "1 pages" (spec 10장 문구 규칙).
    case 'pdf': return doc.pageCount ? `${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}` : 'PDF';
    case 'csv': return doc.rowCount
      ? `${Number(doc.rowCount).toLocaleString('en-US')} row${doc.rowCount === 1 ? '' : 's'}`
      : 'CSV';
    case 'text': case 'markdown': return doc.encoding ? labelFor(doc.encoding) : '';
    case 'html-package': return doc.runEnabled ? 'Run enabled' : 'Package';
    case 'html': return doc.runEnabled ? 'Run enabled' : 'HTML';
    case 'image': return doc.width && doc.height ? `${doc.width}×${doc.height}` : 'Image';
    default: return '';
  }
}
