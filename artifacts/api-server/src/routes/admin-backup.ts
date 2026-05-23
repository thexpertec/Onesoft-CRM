/**
 * Full-system DB backup + restore.
 *
 * GET  /api/admin-backup/download — streams a JSON dump of every table in the
 *      public schema (system tables excluded). Format:
 *      { _format: "onesoft-db-backup-v1", takenAt, tables: { name: rows[] } }
 *
 * POST /api/admin-backup/restore  — accepts the same JSON shape and replaces
 *      the current DB contents. Wrapped in a single transaction with
 *      session_replication_role = replica so FK ordering doesn't matter.
 *
 * Auth: protected by the global X-Api-Key gate (mounted under requireApiKey
 * in routes/index.ts). The admin-dashboard UI further restricts the buttons
 * to the superadmin role. KNOWN RESIDUAL: VITE_KV_API_SECRET is shipped in
 * the admin-dashboard bundle (see replit.md "Known residual exposure" #3),
 * so the API key alone is not a strong authorization boundary for these
 * highly destructive endpoints. Tightening to a server-issued superadmin
 * session is deferred to the same auth epic that hashes tenant passwords.
 */
import { Router, type IRouter } from "express";
import { pool } from "../lib/db.js";

const router: IRouter = Router();

const FORMAT_TAG = "onesoft-db-backup-v1";

async function listPublicTables(): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return rows.map(r => r.table_name);
}

interface ColumnInfo { column_name: string; data_type: string; udt_name: string }

async function listColumns(table: string): Promise<ColumnInfo[]> {
  const { rows } = await pool.query<ColumnInfo>(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return rows;
}

router.get("/download", async (_req, res) => {
  try {
    const tables = await listPublicTables();
    const out: Record<string, unknown[]> = {};
    let totalRows = 0;
    for (const t of tables) {
      const ident = `"${t.replace(/"/g, '""')}"`;
      const { rows } = await pool.query(`SELECT * FROM ${ident}`);
      out[t] = rows;
      totalRows += rows.length;
    }
    const payload = {
      _format: FORMAT_TAG,
      takenAt: new Date().toISOString(),
      tableCount: tables.length,
      rowCount: totalRows,
      tables: out,
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="onesoft-db-backup-${stamp}.json"`);
    res.send(JSON.stringify(payload));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "Backup failed", detail: msg });
  }
});

router.post("/restore", async (req, res) => {
  const body = req.body as { _format?: string; tables?: Record<string, unknown[]> };
  if (!body || body._format !== FORMAT_TAG || !body.tables || typeof body.tables !== "object") {
    res.status(400).json({ error: "Invalid backup file. Expected _format=" + FORMAT_TAG });
    return;
  }
  const incoming = body.tables;
  const incomingNames = Object.keys(incoming);
  if (incomingNames.length === 0) {
    res.status(400).json({ error: "Backup contains no tables." });
    return;
  }

  const client = await pool.connect();
  try {
    // Filter to tables that actually exist in the current DB. Skipped names
    // are returned to the client as a warning (older backup, dropped table…).
    const existing = new Set(await listPublicTables());
    const toRestore = incomingNames.filter(n => existing.has(n));
    const skipped = incomingNames.filter(n => !existing.has(n));

    await client.query("BEGIN");
    // Bypass FK ordering for the whole restore. Reset at COMMIT/ROLLBACK
    // because `SET LOCAL` is transaction-scoped.
    await client.query("SET LOCAL session_replication_role = replica");

    // Wipe EVERY existing public table — not just the intersection — so a
    // partial backup can't leave stale rows behind in tables the dump omits.
    // Architect-flagged: previous "toRestore only" wipe was inconsistent with
    // the "full DB replace" semantics the UI promises.
    for (const t of existing) {
      const ident = `"${t.replace(/"/g, '""')}"`;
      await client.query(`TRUNCATE TABLE ${ident} RESTART IDENTITY CASCADE`);
    }

    let totalInserted = 0;
    for (const t of toRestore) {
      const rows = Array.isArray(incoming[t]) ? (incoming[t] as Record<string, unknown>[]) : [];
      if (rows.length === 0) continue;
      const cols = await listColumns(t);
      // data_type === "ARRAY" → native SQL array column (pg expects a JS
      // array, never a JSON string). data_type === "jsonb"/"json" → pg needs
      // objects/arrays stringified. Everything else → primitive passthrough.
      // Architect-flagged: previously stringified all objects/arrays which
      // broke TEXT[] columns (admin_users.assigned_tenants etc).
      const colType = new Map(cols.map(c => [c.column_name, c.data_type] as const));
      const ident = `"${t.replace(/"/g, '""')}"`;
      // Filter each row to only columns that currently exist (drift-tolerant).
      const safeRows = rows.map(r => {
        const o: Record<string, unknown> = {};
        for (const k of Object.keys(r)) if (colType.has(k)) o[k] = r[k];
        return o;
      });
      // Insert one row at a time — keeps memory bounded for very large dumps
      // and gives a clean error message pointing at the offending row.
      for (const row of safeRows) {
        const keys = Object.keys(row);
        if (keys.length === 0) continue;
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const idents = keys.map(k => `"${k.replace(/"/g, '""')}"`).join(", ");
        const values = keys.map(k => {
          const v = row[k];
          if (v === null || v === undefined) return v;
          const dt = colType.get(k);
          if (dt === "ARRAY") return v;                                 // pg handles JS arrays natively
          if (dt === "jsonb" || dt === "json") {
            return typeof v === "object" ? JSON.stringify(v) : v;
          }
          return v;
        });
        await client.query(`INSERT INTO ${ident} (${idents}) VALUES (${placeholders})`, values);
        totalInserted++;
      }
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      restoredTables: toRestore.length,
      restoredRows: totalInserted,
      skippedTables: skipped,
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "Restore failed", detail: msg });
  } finally {
    client.release();
  }
});

/**
 * One-shot backfill: copies kv_store `admin-products` rows into the relational
 * `products` table for every tenant. Idempotent (ON CONFLICT DO NOTHING) so
 * repeat invocations are safe. Must run BEFORE flipping the `admin-products`
 * bridge entry in routes/kv.ts, otherwise the bridge surfaces an empty table.
 *
 * POST /api/admin-backup/backfill-products
 */
router.post("/backfill-products", async (_req, res) => {
  const PRODUCT_COLUMNS = [
    "id","tenant_id","name","local_name","model","sku","barcode","brand","category",
    "subcategory","sub_subcategory","department","unit","purchase_price","cost_price",
    "price","wholesale_price","commission_pct","opening_stock","stock_alert_value",
    "description","meta_title","meta_description","status","condition","thumbnail",
    "images","show_on_web","website_price","website_price_was","clubcard_price",
    "clubcard_bogo","product_attributes","variants",
  ] as const;
  const camelOf = (s: string) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
  const JSON_COLS = new Set(["images", "product_attributes", "variants"]);

  const client = await pool.connect();
  try {
    const { rows: kvRows } = await client.query<{ namespace: string; value: unknown }>(
      `SELECT namespace, value FROM kv_store
        WHERE key = 'admin-products' AND namespace LIKE 't:%'`,
    );

    let tenantsScanned = 0;
    let productsConsidered = 0;
    let productsInserted = 0;
    const perTenant: Array<{ tenant: string; kv: number; inserted: number }> = [];

    for (const row of kvRows) {
      tenantsScanned++;
      const tenantId = row.namespace.slice(2); // strip "t:"
      const items = Array.isArray(row.value) ? (row.value as Record<string, unknown>[]) : [];
      productsConsidered += items.length;
      let insertedHere = 0;

      for (const item of items) {
        if (!item || typeof item.id !== "string") continue;
        const values: unknown[] = [];
        const cols: string[] = [];
        const phs: string[] = [];
        for (const col of PRODUCT_COLUMNS) {
          let v: unknown;
          if (col === "tenant_id") v = tenantId;
          else if (col === "id") v = item.id;
          else v = item[camelOf(col)];
          if (v === undefined) continue;
          if (JSON_COLS.has(col) && v !== null && typeof v === "object") {
            v = JSON.stringify(v);
          }
          cols.push(`"${col}"`);
          phs.push(`$${values.length + 1}`);
          values.push(v);
        }
        const sql = `INSERT INTO products (${cols.join(", ")}) VALUES (${phs.join(", ")}) ON CONFLICT (id) DO NOTHING`;
        const r = await client.query(sql, values);
        if (r.rowCount && r.rowCount > 0) {
          insertedHere++;
          productsInserted++;
        }
      }
      perTenant.push({ tenant: tenantId, kv: items.length, inserted: insertedHere });
    }

    res.json({
      ok: true,
      tenantsScanned,
      productsConsidered,
      productsInserted,
      perTenant,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "Backfill failed", detail: msg });
  } finally {
    client.release();
  }
});

export default router;
