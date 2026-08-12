/* hashing.js — main-thread wrapper around hash-worker.js.
   One worker is reused, because starting one per file made importing a folder
   of PDFs noticeably slower than the hashing itself. */

let worker = null;
let sequence = 0;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./hash-worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event) => {
    const { id, hash, error, progress } = event.data || {};
    const entry = pending.get(id);
    if (!entry) return;
    if (typeof progress === 'number') { if (entry.onProgress) entry.onProgress(progress); return; }
    pending.delete(id);
    if (error) entry.reject(new Error(error));
    else entry.resolve(hash);
  });
  worker.addEventListener('error', () => {
    pending.forEach((entry) => entry.reject(new Error('Hashing failed.')));
    pending.clear();
    worker = null;
  });
  return worker;
}

/** SHA-256 of a Blob as lowercase hex. Falls back to the main thread when
    Workers are unavailable, so hashing never blocks an import outright. */
export async function hashBlob(blob, onProgress) {
  try {
    const target = ensureWorker();
    const id = (sequence += 1);
    return await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      target.postMessage({ id, blob });
    });
  } catch {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}
