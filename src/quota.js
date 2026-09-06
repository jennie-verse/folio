/* Pure quota retry primitive. Keeping this independent of IndexedDB and the
   browser lets the two failure paths stay covered by executable tests. */

export function isQuotaError(error) {
  return Boolean(error) && (error.name === 'QuotaExceededError' || /quota|storage/i.test(String(error.message || '')));
}

export async function retryAfterRelease(operation, release) {
  try {
    await operation();
    return { saved: true, released: 0 };
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const { released = 0 } = await release();
    try {
      await operation();
      return { saved: true, released };
    } catch (again) {
      if (!isQuotaError(again)) throw again;
      return { saved: false, released };
    }
  }
}
