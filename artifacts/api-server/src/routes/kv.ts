import { Router } from "express";
import { query } from "../lib/db.js";
import { requireApiKey } from "../middleware/require-api-key.js";
import { rowToApi } from "../lib/records.js";

const router = Router();

// ─── Per-record migration bridge ──────────────────────────────────────────────
// As entities are cut over from KV-array writes (`/api/kv/{ns}/{key}` writing a
// whole `Brand[]` blob) to per-record REST endpoints (`/api/{entity}` writing a
// single row to a relational table), the frontend's read path — `kvGetAll`
// inside `syncAllFromServer` — still reads ONLY from `kv_store`. Without this
// bridge, every record created/updated/deleted through a migrated REST
// endpoint vanishes from the UI on page refresh because `_memRaw` is empty
// after a reload and the kv_store row for that key has no fresh data.
//
// The bridge: for every migrated key listed below, GET /api/kv/:ns/:key and
// GET /api/kv/:ns synthesize the array from the relational table (active rows
// only) instead of returning the stale (or empty) kv_store row. The frontend
// is unchanged. The bridge can be deleted once kv.ts itself is retired.
//
// Keep this map in lockstep with `mountRecordRoutes(...)` callsites in the
// API server. Adding an entity here is a one-line change per migration batch.
// NEON DATA DEPLOYMENT (May 2026): bridge intentionally emptied.
// The production Neon database holds 12+ months of real tenant data in
// `kv_store` only — the relational tables (created by `pg_dump --schema-only`
// from Replit) are empty. Routing reads through the bridge would surface
// 0 rows for every tenant. By emptying this map, every GET falls through to
// the kv_store value, which is the real data.
//
// Writes are unaffected: the admin-dashboard chokepoints (`_saveProducts`,
// `_saveSales`, …) still call `setStored(KEY, items)` which fires a PUT to
// /api/kv/:ns/:key writing the FULL array to kv_store. The fire-and-forget
// per-record dual-write is best-effort; failures only log.
//
// Repopulating the relational tables for analytics/reporting is a separate
// follow-up — see also the in-process backfill plan in scratchpad.
const MIGRATED_KEY_TO_TABLE: Record<string, string> = {
  "admin-products": "products",
};

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

function tenantOfNamespace(namespace: string): string | null {
  const m = namespace.match(/^t:(.+)$/);
  return m ? m[1]! : null;
}

/**
 * Returns the active (non-archived) rows of a migrated entity table for the
 * given tenant, shaped as the FE expects (camelCase via `rowToApi`).
 * Throws on unsafe identifiers (defensive — the table name comes from the
 * registry above, not user input).
 */
async function fetchMigratedRows(table: string, tenantId: string): Promise<unknown[]> {
  if (!SAFE_IDENT.test(table)) throw new Error(`Unsafe migrated table identifier: ${table}`);
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY created_at`,
    [tenantId],
  );
  return rows.map(rowToApi);
}

// ── /api/kv gate ─────────────────────────────────────────────────────────────
// `/api/kv` cannot use the global `requireApiKey` middleware because the
// public-facing storefronts (`tenant-store`, `customer-portal`,
// `requirement-doc`) call a small set of these endpoints anonymously. So we
// use a per-method/per-key allowlist: anything not on the allowlist is gated
// by `requireApiKey` (i.e. only the admin-dashboard, which sends `X-Api-Key`,
// can reach it).
//
// The allowlists below were derived from a complete audit of every storefront
// `/api/kv/*` call (May 2026). Anything new the storefronts need must be
// added here — silently failing with 401 is the intended outcome otherwise.
//
// admin-customers / admin-sales (read + write) used to be on this list as
// acknowledged residuals because the customer-portal login matched
// email+phone against the customer list and the storefront checkout wrote
// the resulting sale back into `admin-sales`. They were removed (May 2026)
// once the dedicated `/api/portal/*` and `/api/storefront/place-order`
// endpoints landed — both now scope each request to a single customer or
// transaction server-side, so the whole-tenant exposure is closed.
//
// Namespace-level operations (GET `/`, GET `/:namespace`, DELETE `/:namespace`)
// and all DELETEs are admin-only — storefronts have no legitimate use for any
// of them.

const ANON_EXACT_READ = new Set<string>([
  "admin-products",
  "admin-settings",
  "website-cms",
  "repair-bookings",
  "store-orders",
  "online-orders",
]);
const ANON_EXACT_WRITE = new Set<string>([
  "repair-bookings",
  "store-orders",
  "online-orders",
]);
// `portal-accounts` is intentionally NOT on the anonymous allowlist any more
// (May 2026). It holds the SHA-256 password hashes for every portal user
// in the tenant — leaving it readable lets anyone extract hashes for offline
// cracking, and leaving it writable lets anyone overwrite the whole list and
// hijack every account. All account operations now go exclusively through
// the `/api/portal/*` endpoints, which scope every call to a single account.
const ANON_PREFIX_READ = ["portal-profile-", "clubcard-"];
const ANON_PREFIX_WRITE = ["portal-profile-", "clubcard-"];

function isAnonymousKvAllowed(method: string, key: string): boolean {
  if (method === "GET") {
    if (ANON_EXACT_READ.has(key)) return true;
    return ANON_PREFIX_READ.some(p => key.startsWith(p));
  }
  if (method === "PUT" || method === "POST") {
    if (ANON_EXACT_WRITE.has(key)) return true;
    return ANON_PREFIX_WRITE.some(p => key.startsWith(p));
  }
  // DELETE and everything else: admin-only.
  return false;
}

router.use((req, res, next) => {
  // Router-level middleware runs BEFORE Express route matching, so
  // `req.params` is empty here — we have to parse `req.path` ourselves.
  // Path shapes (router is mounted at `/api/kv`, so paths are relative):
  //   `/`                         → list namespaces  (admin)
  //   `/:namespace`               → namespace dump   (admin)  or  wipe (admin)
  //   `/:namespace/:key`          → per-key get/put/delete (allowlist)
  const segments = req.path.split("/").filter(Boolean);
  // Only `/:namespace/:key` is eligible for the anonymous allowlist; every
  // other shape (no key, namespace-level, deeper paths) is admin-only.
  if (segments.length === 2) {
    let key: string;
    try {
      key = decodeURIComponent(segments[1]!);
    } catch {
      // Malformed percent-encoding — fail closed to the gate rather than
      // throwing a 500. The gate will 401 and the request never reaches the
      // handler below (which would also throw on the same input).
      requireApiKey(req, res, next);
      return;
    }
    if (isAnonymousKvAllowed(req.method, key)) {
      next();
      return;
    }
  }
  requireApiKey(req, res, next);
});

// GET /api/kv  → [{ namespace, keyCount, updatedAt }]  (all namespaces summary)
router.get("/", async (_req, res) => {
  try {
    const rows = await query<{ namespace: string; key_count: string; last_updated: string }>(
      `SELECT namespace,
              COUNT(*)::text          AS key_count,
              MAX(updated_at)::text   AS last_updated
       FROM kv_store
       GROUP BY namespace
       ORDER BY namespace`,
      []
    );
    return res.json(rows);
  } catch (err) {
    console.error("KV LIST namespaces error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/kv/:namespace/:key  → { value: any }
router.get("/:namespace/:key", async (req, res) => {
  try {
    const { namespace, key } = req.params;

    // Bridge: for migrated entities in a tenant namespace, the relational
    // table is the source of truth. Ignore kv_store (post-migration stale).
    const tenantId = tenantOfNamespace(namespace);
    const migratedTable = MIGRATED_KEY_TO_TABLE[key];
    if (tenantId && migratedTable) {
      const value = await fetchMigratedRows(migratedTable, tenantId);
      return res.json({ value });
    }

    const rows = await query(
      "SELECT value FROM kv_store WHERE namespace = $1 AND key = $2",
      [namespace, key]
    );
    if (rows.length === 0) {
      return res.json({ value: null });
    }
    return res.json({ value: (rows[0] as { value: unknown }).value });
  } catch (err) {
    console.error("KV GET error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/kv/:namespace  → { [key]: value, ... }  (all keys in namespace)
router.get("/:namespace", async (req, res) => {
  try {
    const { namespace } = req.params;
    const rows = await query<{ key: string; value: unknown }>(
      "SELECT key, value FROM kv_store WHERE namespace = $1",
      [namespace]
    );
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }

    // Bridge: overlay every migrated entity from its relational table. This
    // OVERWRITES any same-key kv_store entry — once an entity is migrated, the
    // kv_store row is dead history. Only applies to tenant namespaces; the
    // migrated entities are all tenant-scoped.
    const tenantId = tenantOfNamespace(namespace);
    if (tenantId) {
      const migrated = await Promise.all(
        Object.entries(MIGRATED_KEY_TO_TABLE).map(async ([key, table]) =>
          [key, await fetchMigratedRows(table, tenantId)] as const,
        ),
      );
      for (const [key, value] of migrated) result[key] = value;
    }

    return res.json(result);
  } catch (err) {
    console.error("KV GET namespace error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Defence-in-depth: validate JE writes against the live COA in the same
// namespace. Refuses any write where a JE line references a ledger UUID that
// does not exist in the tenant's chart of accounts. This is the final
// backstop against the "Unknown ledger" data-loss class — even a buggy or
// malicious client cannot poison the database.
async function validateJournalEntriesPayload(
  namespace: string,
  value: unknown,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "Journal entries payload must be an array" };
  }
  const rows = await query<{ value: unknown }>(
    "SELECT value FROM kv_store WHERE namespace = $1 AND key = $2",
    [namespace, "admin-chart-of-accounts"]
  );
  // If the COA hasn't been written yet for this namespace, accept the write
  // (initial seed paths legitimately post the JE list before COA seeding finishes).
  if (rows.length === 0) return { ok: true };
  const coa = rows[0]!.value;
  if (!Array.isArray(coa) || coa.length === 0) return { ok: true };
  // Only postable accounts (accountType === "Ledger") are valid targets for JE
  // lines. Group accounts exist for hierarchy and must never receive postings.
  // This mirrors the client-side guard in store.ts → createJournalEntry().
  const validIds = new Set<string>(
    (coa as Array<{ id?: unknown; accountType?: unknown }>)
      .map(a => {
        if (!a || typeof a !== "object" || typeof a.id !== "string") return null;
        if (a.accountType !== "Ledger") return null;
        return a.id;
      })
      .filter((s): s is string => s !== null)
  );
  const offenders: Array<{ entryRef: string; ledgerId: string }> = [];
  for (const je of value as Array<{ reference?: string; id?: string; lines?: Array<{ ledgerId?: string }> }>) {
    if (!je || !Array.isArray(je.lines)) continue;
    for (const l of je.lines) {
      if (typeof l?.ledgerId !== "string") continue;
      if (!validIds.has(l.ledgerId)) {
        offenders.push({ entryRef: je.reference ?? je.id ?? "(unknown)", ledgerId: l.ledgerId });
        if (offenders.length >= 5) break;
      }
    }
    if (offenders.length >= 5) break;
  }
  if (offenders.length > 0) {
    const summary = offenders
      .map(o => `${o.entryRef} → ${o.ledgerId.slice(0, 8)}…`)
      .join(", ");
    return { ok: false, reason: `Journal entry references ${offenders.length} ledger ID(s) not in the chart of accounts: ${summary}` };
  }
  return { ok: true };
}

// PUT /api/kv/:namespace/:key  body: { value: any }
router.put("/:namespace/:key", async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const { value } = req.body;

    // Server-side referential integrity for journal entries
    if (key === "admin-journal-entries") {
      const check = await validateJournalEntriesPayload(namespace, value);
      if (!check.ok) {
        console.warn(`KV PUT rejected — JE ledger integrity: ${namespace} :: ${check.reason}`);
        return res.status(422).json({ error: "Ledger integrity violation", detail: check.reason });
      }
    }

    await query(
      `INSERT INTO kv_store (namespace, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (namespace, key)
       DO UPDATE SET value = $3::jsonb, updated_at = NOW()`,
      [namespace, key, JSON.stringify(value)]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("KV PUT error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/kv/:namespace/:key
router.delete("/:namespace/:key", async (req, res) => {
  try {
    const { namespace, key } = req.params;
    await query(
      "DELETE FROM kv_store WHERE namespace = $1 AND key = $2",
      [namespace, key]
    );
    // Bridge cleanup: when the deleted key is bridged to a relational table
    // and the namespace is tenant-scoped, also purge the relational rows so
    // readers (which see the bridged table, not kv_store) actually observe
    // the deletion. Without this, frontend "clean tenant master data" and
    // similar flows would leave behind ghost rows for migrated entities.
    const tenantId = tenantOfNamespace(namespace);
    const table = MIGRATED_KEY_TO_TABLE[key];
    if (tenantId && table && SAFE_IDENT.test(table)) {
      await query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("KV DELETE error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/kv/:namespace  (wipe entire namespace — used on tenant delete)
router.delete("/:namespace", async (req, res) => {
  try {
    const { namespace } = req.params;
    await query("DELETE FROM kv_store WHERE namespace = $1", [namespace]);
    // Bridge cleanup: tenant-scoped namespace wipes (demo reset, tenant
    // delete) must also clear every bridged relational table for that tenant
    // — otherwise migrated entities (products, staff, sales, …) survive the
    // wipe and reappear on next reload via the bridge.
    const tenantId = tenantOfNamespace(namespace);
    if (tenantId) {
      for (const table of Object.values(MIGRATED_KEY_TO_TABLE)) {
        if (!SAFE_IDENT.test(table)) continue;
        await query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("KV DELETE namespace error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
