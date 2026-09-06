/* handlers/encoding.js — Korean text decoding (plan 6-1).

   BOM → strict UTF-8 → euc-kr. The WHATWG `euc-kr` label covers CP949
   (Unified Hangul Code), which is what Excel and older Windows editors write,
   so a Korean CSV saved on Windows lands here rather than as mojibake. */

export const ENCODINGS = ['utf-8', 'euc-kr', 'utf-16le', 'utf-16be', 'iso-8859-1'];

export function labelFor(encoding) {
  if (encoding === 'euc-kr') return 'CP949';
  return String(encoding || 'utf-8').toUpperCase();
}

function bomOf(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: 'utf-8', skip: 3 };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: 'utf-16le', skip: 2 };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: 'utf-16be', skip: 2 };
  return null;
}

/** Decode bytes, choosing an encoding when one was not already stored.
    Returns {text, encoding, hadBom}. */
export function decodeBytes(bytes, preferred) {
  const bom = bomOf(bytes);
  if (bom && !preferred) {
    return { text: new TextDecoder(bom.encoding).decode(bytes.subarray(bom.skip)), encoding: bom.encoding, hadBom: true };
  }
  const body = bom ? bytes.subarray(bom.skip) : bytes;

  if (preferred) {
    try {
      return { text: new TextDecoder(preferred, { fatal: true }).decode(body), encoding: preferred, hadBom: Boolean(bom) };
    } catch {
      // A stored choice that no longer decodes falls through to auto-detection
      // rather than showing an error the user cannot act on.
    }
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8', hadBom: Boolean(bom) };
  } catch { /* not UTF-8 — try the Korean legacy encoding next */ }

  try {
    return { text: new TextDecoder('euc-kr', { fatal: true }).decode(body), encoding: 'euc-kr', hadBom: Boolean(bom) };
  } catch { /* fall through to a lossy read the user can correct */ }

  return { text: new TextDecoder('utf-8').decode(body), encoding: 'utf-8', hadBom: Boolean(bom), uncertain: true };
}

export async function decodeBlob(blob, preferred) {
  return decodeBytes(new Uint8Array(await blob.arrayBuffer()), preferred);
}

/** Export always writes UTF-8: TextEncoder can only produce UTF-8 [ref 5]. */
export function encodeUtf8(text) {
  return new TextEncoder().encode(String(text || ''));
}
