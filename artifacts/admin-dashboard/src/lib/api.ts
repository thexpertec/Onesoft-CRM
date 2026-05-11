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
 * Uses cache:"no-store" so the Replit deployment proxy (which used to return
 * stale 304s based on its own ETag tracking) cannot interfere with reads.
 */
async function apiFetch(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, {
      signal: withTimeout(READ_TIMEOUT_MS),
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
    if (res.status === 304) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
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

/**
 * Read a single key from a namespace.
 * Retries once after a short delay on failure so transient Neon cold-starts
 * or brief Replit network blips don't produce a false null — which callers
 * like createTenantAsync/deleteTenantAsync now treat as a hard error.
 */
export async function kvGet(namespace: string, key: string): Promise<unknown> {
  const url = `${BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
  let data = await apiFetch(url);
  if (data === null) {
    // Wait 1.5 s then retry once before giving up.
    await new Promise(r => setTimeout(r, 1500));
    data = await apiFetch(url);
  }
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
  return await apiFetch(`${BASE}/${encodeURIComponent(namespace)}`);
}

/** Delete an entire namespace (used when a tenant is deleted).
 *  Uses apiWriteFetch so a failed namespace purge throws instead of being
 *  silently swallowed — callers can detect and surface the failure. */
export async function kvDeleteNamespace(namespace: string): Promise<void> {
  await apiWriteFetch(`${BASE}/${encodeURIComponent(namespace)}`, { method: "DELETE" });
}

// ─── Server-side auth ────────────────────────────────────────────────────────

export interface VerifyTenantResult {
  ok: true;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
    isDemo: boolean;
    contactEmail: string;
    demoResetInterval: number;
    createdAt: string;
    updatedAt: string;
    adminUsername: string;
    [key: string]: unknown;
  };
}
export interface VerifyTenantFail {
  ok: false;
  reason: "not_found" | "suspended";
}
export type VerifyTenantResponse = VerifyTenantResult | VerifyTenantFail;

/**
 * Verify tenant credentials directly on the server — no client-side KV sync
 * required.  The server queries the database and returns the sanitised tenant
 * object (adminPassword is stripped server-side) so the caller can populate
 * the session without an additional fetch.
 *
 * Returns null only when the network request itself fails so callers can fall
 * back to the local cache path.
 */
export async function verifyTenantCredentials(
  username: string,
  password: string
): Promise<VerifyTenantResponse | null> {
  try {
    const res = await fetch("/api/auth/verify-tenant", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return null;
    return (await res.json()) as VerifyTenantResponse;
  } catch (e) {
    console.warn("[api] verifyTenantCredentials failed:", e);
    return null;
  }
}
