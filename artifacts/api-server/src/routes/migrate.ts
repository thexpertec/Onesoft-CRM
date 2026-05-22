import { Router } from "express";
import { migrateTenant } from "../lib/migrate-tenant.js";
import { query } from "../lib/db.js";

const router = Router();

/**
 * GET /api/migrate/tenant/:tenantId/status
 * Returns a live comparison of how many accounts/JEs exist in the KV blob vs
 * the relational tables, so the dashboard can show whether migration is needed.
 */
router.get("/tenant/:tenantId/status", async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const [accRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM accounts WHERE tenant_id = $1`,
      [tenantId],
    );
    const [jeRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM journal_entries WHERE tenant_id = $1`,
      [tenantId],
    );
    const [custRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM customers WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [kvAccRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-chart-of-accounts' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvJeRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-journal-entries' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvCustRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-customers' LIMIT 1`,
      [`t:${tenantId}`],
    );

    const parseCount = (raw: unknown): number => {
      if (raw == null) return 0;
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr.length : 0;
    };

    res.json({
      tenantId,
      db: {
        accounts:       parseInt(accRow?.count  ?? "0", 10),
        journalEntries: parseInt(jeRow?.count   ?? "0", 10),
        customers:      parseInt(custRow?.count ?? "0", 10),
      },
      kv: {
        accounts:       parseCount(kvAccRow?.value),
        journalEntries: parseCount(kvJeRow?.value),
        customers:      parseCount(kvCustRow?.value),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/migrate/tenant/:tenantId/dry-run
 * Returns counts of what *would* be inserted without touching the DB.
 */
router.post("/tenant/:tenantId/dry-run", async (req, res, next) => {
  try {
    const result = await migrateTenant(req.params.tenantId, true);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/migrate/tenant/:tenantId
 * Runs the full migration (idempotent — skips rows that already exist).
 */
router.post("/tenant/:tenantId", async (req, res, next) => {
  try {
    const result = await migrateTenant(req.params.tenantId, false);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
