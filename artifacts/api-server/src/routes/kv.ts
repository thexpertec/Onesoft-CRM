import { Router } from "express";
import { query } from "../lib/db.js";

const router = Router();

const KV_API_SECRET = process.env["KV_API_SECRET"];

router.use((req, res, next) => {
  if (!KV_API_SECRET) { next(); return; }
  const provided = req.headers["x-api-key"];
  if (provided !== KV_API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
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
    return res.json({ ok: true });
  } catch (err) {
    console.error("KV DELETE namespace error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
