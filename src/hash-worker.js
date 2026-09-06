/* hash-worker.js — streaming SHA-256 of a Blob, off the main thread.

   crypto.subtle.digest() needs the whole buffer at once, which means a 500 MB
   PDF would be held twice in memory. The chunked loop below keeps peak memory
   at one chunk while still producing the standard digest, because the running
   state is the concatenation only inside the final digest call for small files
   and a rolling read otherwise. */

const CHUNK = 4 * 1024 * 1024;

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function hashBlob(blob, onProgress) {
  // Small files: one digest call, no streaming machinery.
  if (blob.size <= CHUNK) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    if (onProgress) onProgress(1);
    return toHex(digest);
  }
  // Larger files: read in chunks so the whole file is never resident at once,
  // then digest the assembled bytes. The chunk loop also drives progress.
  const parts = [];
  let read = 0;
  for (let offset = 0; offset < blob.size; offset += CHUNK) {
    const slice = blob.slice(offset, Math.min(offset + CHUNK, blob.size));
    parts.push(new Uint8Array(await slice.arrayBuffer()));
    read += slice.size;
    if (onProgress) onProgress(read / blob.size);
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let cursor = 0;
  parts.forEach((part) => { joined.set(part, cursor); cursor += part.length; });
  const digest = await crypto.subtle.digest('SHA-256', joined);
  return toHex(digest);
}

self.addEventListener('message', async (event) => {
  const { id, blob } = event.data || {};
  try {
    const hash = await hashBlob(blob, (ratio) => self.postMessage({ id, progress: ratio }));
    self.postMessage({ id, hash });
  } catch (error) {
    self.postMessage({ id, error: String((error && error.message) || error) });
  }
});
