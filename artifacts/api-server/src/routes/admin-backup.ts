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
 * to the superadmin role.
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

async function listColumns(table: string): Promise<string[]> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return rows.map(r => r.column_name);
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

    // Wipe every restorable table first so a partial restore can't leave
    // orphan rows behind. RESTART IDENTITY is safe — no auto-increment cols
    // are in use (we use TEXT primary keys throughout).
    for (const t of toRestore) {
      const ident = `"${t.replace(/"/g, '""')}"`;
      await client.query(`TRUNCATE TABLE ${ident} RESTART IDENTITY CASCADE`);
    }

    let totalInserted = 0;
    for (const t of toRestore) {
      const rows = Array.isArray(incoming[t]) ? (incoming[t] as Record<string, unknown>[]) : [];
      if (rows.length === 0) continue;
      const cols = await listColumns(t);
      const colSet = new Set(cols);
      const ident = `"${t.replace(/"/g, '""')}"`;
      // Filter each row to only columns that currently exist (drift-tolerant).
      const safeRows = rows.map(r => {
        const o: Record<string, unknown> = {};
        for (const k of Object.keys(r)) if (colSet.has(k)) o[k] = r[k];
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
          // pg driver needs objects/arrays stringified for jsonb columns when
          // we pass them via parameterised query. It auto-handles primitives.
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
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

export default router;
