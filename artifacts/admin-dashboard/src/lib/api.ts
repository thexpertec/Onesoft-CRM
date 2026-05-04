/**
 * Lightweight KV-store API client.
 * The API server is mounted at /api (Replit application router).
 */

const BASE = "/api/kv";

/**
 * Read fetch — swallows errors and returns null on failure.
 * Used for GET requests where in-memory cache is an acceptable fallback.
 */
async function apiFetch(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (e) {
    // Silently swallow network errors — in-memory cache is the fallback
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
  return apiFetch(`${BASE}/${encodeURIComponent(namespace)}`);
}

/** Delete an entire namespace (used when a tenant is deleted). */
export async function kvDeleteNamespace(namespace: string): Promise<void> {
  await apiFetch(`${BASE}/${encodeURIComponent(namespace)}`, { method: "DELETE" });
}
