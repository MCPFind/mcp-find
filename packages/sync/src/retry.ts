/** Bounded GET retry for transient registry failures; never retries permanent
 * HTTP errors. Each request and each backoff has an upper bound. */
export async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === 2) return response;
    const retryAfter = response.headers?.get('retry-after');
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    const requestedDelay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter ?? '') - Date.now();
    const delay = Math.min(10_000, Math.max(1000 * 2 ** attempt, Number.isFinite(requestedDelay) ? requestedDelay : 0));
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error('Registry retry budget exhausted');
}
