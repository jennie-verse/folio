import { db, open, releaseDocumentCopy } from '../src/store.js';

const result = document.querySelector('#result');
const id = `rollback-${Date.now()}`;
const fileHash = `${id}-hash`;
const doc = {
  id,
  fileHash,
  kind: 'html-package',
  title: 'Rollback fixture',
  released: false,
  pinned: false,
  updatedAt: Date.now(),
};

try {
  await open();
  await db.transaction('rw', db.documents, db.documentFiles, db.packageAssets, async () => {
    await db.documents.put(doc);
    await db.documentFiles.put({ fileHash, docId: id, blob: new Blob(['zip']), bytes: 3 });
    await db.packageAssets.put({
      docId: id,
      path: 'app.js',
      asset: { mime: 'text/javascript', encoding: 'base64', data: 'QQ==', bytes: 1 },
    });
  });

  let rejected = false;
  try {
    await releaseDocumentCopy(doc, { beforeMetadata: () => { throw new Error('injected failure'); } });
  } catch (error) {
    rejected = /injected failure/.test(String(error && error.message));
  }

  const [keptDoc, keptFile, keptAsset] = await Promise.all([
    db.documents.get(id),
    db.documentFiles.get(fileHash),
    db.packageAssets.get([id, 'app.js']),
  ]);
  const syntheticReadingStates = (await db.readingStates.toArray())
    .filter((row) => String(row.docId || '').includes('#')).length;
  const passed = rejected && keptDoc && keptDoc.released === false && keptFile && keptAsset;
  result.textContent = JSON.stringify({
    passed: Boolean(passed), rejected, document: Boolean(keptDoc), file: Boolean(keptFile),
    asset: Boolean(keptAsset), syntheticReadingStates,
  });
} catch (error) {
  result.textContent = JSON.stringify({ passed: false, error: String(error && error.message) });
} finally {
  await db.transaction('rw', db.documents, db.documentFiles, db.packageAssets, async () => {
    await db.documents.delete(id);
    await db.documentFiles.delete(fileHash);
    await db.packageAssets.where('docId').equals(id).delete();
  });
}
