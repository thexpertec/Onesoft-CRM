/**
 * Lightweight KV-store API client.
 * The API server is mounted at /api (Replit application router).
 */

const BASE = "/api/kv";

/** Milliseconds before a read fetch gives up and returns null. */
const READ_TIMEOUT_MS  = 10_000;
/** Milliseconds before a write fetch gives up and throws. */
const WRITE_TIMEOUT_MS = 15_000;

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/**
 * Read fetch — swallows errors and returns null on failure.
 * Used for GET requests where in-memory cache is an acceptable fallback.
 */
async function apiFetch(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, {
      signal: withTimeout(READ_TIMEOUT_MS),
      // Prevent browser (and Replit deployment proxy) from serving a cached
      // 304 Not Modified response. Without this, a fresh page load gets null
      // from kvGetAll and the in-memory store never populates from the server.
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
    // 304 means "your cached copy is still valid" — treat it as a clean no-op
    // (in-memory store already has the data from a prior successful sync).
    if (res.status === 304) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Use "return await" so JSON parse errors are caught by the try/catch above.
    return await res.json();
  } catch (e) {
    // Silently swallow network/timeout errors — in-memory cache is the fallback
    console.warn("[api]", url, e);
    return null;
  }
}

/**
 * Write fetch — THROWS on failure so callers know the write did not persist.
 * Used for PUT/DELETE requests. Losing a mutation silently leads to data loss
 * on the next page refresh (server data overwrites the in-memory cache).
 */
async function apiWriteFetch(url: string, options: RequestInit): Promise<void> {
  const res = await fetch(url, {
    signal: withTimeout(WRITE_TIMEOUT_MS),
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}${detail ? ": " + detail : ""}`);
  }
}

/** Read a single key from a namespace. Returns parsed value or null. */
export async function kvGet(namespace: string, key: string): Promise<unknown> {
  const data = await apiFetch(`${BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`);
  return data?.value ?? null;
}

/** Write a value to a namespace+key (upsert). Throws on failure — never silently drops data. */
export async function kvPut(namespace: string, key: string, value: unknown): Promise<void> {
  await apiWriteFetch(`${BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

/** Delete a key from a namespace. Throws on failure. */
export async function kvDelete(namespace: string, key: string): Promise<void> {
  await apiWriteFetch(`${BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

/** Fetch ALL key-value pairs for a namespace in one request. */
export async function kvGetAll(namespace: string): Promise<Record<string, unknown> | null> {
  // Use "return await" so any rejection from apiFetch propagates to the caller
  // rather than being silently converted to a resolved-but-rejected promise chain.
  return await apiFetch(`${BASE}/${encodeURIComponent(namespace)}`);
}

/** Delete an entire namespace (used when a tenant is deleted).
 *  Uses apiWriteFetch so a failed namespace purge throws instead of being
 *  silently swallowed — callers can detect and surface the failure. */
export async function kvDeleteNamespace(namespace: string): Promise<void> {
  await apiWriteFetch(`${BASE}/${encodeURIComponent(namespace)}`, { method: "DELETE" });
}
