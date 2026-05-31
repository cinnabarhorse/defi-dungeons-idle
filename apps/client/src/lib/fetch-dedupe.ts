/**
 * Request deduplication utility.
 *
 * Prevents duplicate in-flight requests to the same URL by caching promises.
 * When multiple components request the same URL simultaneously, only one
 * actual HTTP request is made and the response is shared.
 */

interface CachedRequest {
  promise: Promise<Response>;
  timestamp: number;
}

// In-flight request cache
const inFlightRequests = new Map<string, CachedRequest>();

// Short TTL to allow responses to be reused briefly (50ms)
const RESPONSE_REUSE_TTL_MS = 50;

/**
 * Creates a cache key from a URL and request options.
 * Only caches GET requests without abort signals.
 */
function getCacheKey(url: string, init?: RequestInit): string | null {
  // Only deduplicate GET requests (or requests with no method specified)
  const method = init?.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET') {
    return null;
  }

  // Don't deduplicate requests with abort signals - they have independent lifecycles
  if (init?.signal) {
    return null;
  }

  // Strip cache-busting params for deduplication purposes
  // This ensures requests like /api/player/daily-runs?_t=123 and
  // /api/player/daily-runs?_t=456 made within the TTL window are deduplicated
  try {
    const urlObj = new URL(
      url,
      typeof window !== 'undefined' ? window.location.origin : undefined
    );
    urlObj.searchParams.delete('_t');
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Fetch wrapper that deduplicates concurrent requests to the same URL.
 *
 * Usage:
 * ```ts
 * const response = await fetchDedupe('/api/player', { credentials: 'include' });
 * ```
 */
export async function fetchDedupe(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const cacheKey = getCacheKey(url, init);

  // Non-cacheable request (e.g., POST, PUT, DELETE)
  if (!cacheKey) {
    return fetch(url, init);
  }

  // Clean up expired entries
  const now = Date.now();
  for (const [key, cached] of inFlightRequests.entries()) {
    if (now - cached.timestamp > RESPONSE_REUSE_TTL_MS) {
      inFlightRequests.delete(key);
    }
  }

  // Check for existing in-flight request
  const cached = inFlightRequests.get(cacheKey);
  if (cached && now - cached.timestamp <= RESPONSE_REUSE_TTL_MS) {
    // Clone the response since Response can only be consumed once
    return cached.promise.then((res) => res.clone());
  }

  // Make the actual request
  const promise = fetch(url, init).then((response) => {
    // Schedule cleanup after TTL
    setTimeout(() => {
      inFlightRequests.delete(cacheKey);
    }, RESPONSE_REUSE_TTL_MS);
    return response;
  });

  // Cache the promise
  inFlightRequests.set(cacheKey, { promise, timestamp: now });

  // IMPORTANT: Always return a clone, even for the first caller.
  // This keeps the cached response body unconsumed so subsequent clones work.
  return promise.then((res) => res.clone());
}

/**
 * Clears the request deduplication cache.
 * Useful for testing or when you need to force fresh requests.
 */
export function clearFetchDedupeCache(): void {
  inFlightRequests.clear();
}
