/* Shared quota recovery contract. Callers only report success after the
   supplied IndexedDB operation has committed. */

import * as retention from './retention.js';
import { retryAfterRelease } from './quota.js';

export async function withRoom(operation, neededBytes, { excludeHashes = [] } = {}) {
  return retryAfterRelease(operation, () => retention.releaseOldestUnpinned(
    Math.max(0, Number(neededBytes) || 0) * 2,
    { excludeHashes },
  ));
}
