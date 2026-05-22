import type { Request, Response, Router } from "express";
import { pool, query } from "./db.js";
import { randomUUID } from "node:crypto";

/**
 * Generic per-record CRUD helper.
 *
 * Turns a TableSpec into 5 REST handlers:
 *   GET    /             ?tenantId=...&includeArchived=1
 *   GET    /:id          ?tenantId=...
 *   POST   /                 body: { id?, tenantId, ...fields }
 *   PUT    /:id              body: { tenantId, ...fields }
 *   DELETE /:id          ?tenantId=...&hard=1   (soft = archived_at; hard = real DELETE)
 *
 * Every mutation also INSERTs into audit_log inside the same transaction.
 *
 * Why hand-rolled SQL? Three reasons:
 *   1. Matches the existing kv.ts style (raw pg) — no new abstraction for the
 *      reader to learn.
 *   2. Drizzle's runtime helpers (eq, and, sql) add no value when columns are
 *      already known at write time and we're not composing dynamic queries.
 *   3. The audit-log INSERT must share the same transaction as the data write
 *      to be honest about durability — easier to reason about with explicit BEGIN.
 */

export interface TableSpec {
  /** SQL table name (already a valid identifier — not user-supplied). */
  table: string;
  /** Logical entity type used in audit_log.entity_type. */
  entityType: string;
  /**
   * Writable column names in snake_case.
   * Order does not matter — INSERT uses an object spread.
   * Do NOT include `id`, `tenant_id`, `created_at`, `updated_at`, `archived_at`.
   */
  writableColumns: readonly string[];
  /**
   * camelCase → snake_case map for fields where the casing differs from the
   * default lowerCamel → snake conversion. Most fields don't need this.
   */
  columnAliases?: Record<string, string>;
  /**
   * Locked-row protection. When set, the UPDATE handler reads the row's
   * boolean `lockedFlagColumn` and refuses to mutate any column listed in
   * `protectedColumnsWhenLocked` if the flag is true. Used for COA
   * accounts: once a JE references an account, its identity fields
   * (code/name/head/parent_id/account_type/party_*) are frozen.
   */
  lockedFlagColumn?: string;
  protectedColumnsWhenLocked?: readonly string[];
}

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;
const assertIdent = (s: string) => {
  if (!SAFE_IDENT.test(s)) throw new Error(`Unsafe identifier: ${s}`);
  return s;
};

const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** Convert a DB row (snake_case) to API shape (camelCase). */
function rowToApi<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[snakeToCamel(k)] = v;
  return out;
}

/** Convert an API body (camelCase) to DB columns, restricted to spec.writableColumns. */
function bodyToColumns(spec: TableSpec, body: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(spec.writableColumns);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    const col = spec.columnAliases?.[k] ?? camelToSnake(k);
    if (allowed.has(col)) out[col] = v;
  }
  return out;
}

/** Validates required fields and returns the parsed tenantId, or sends 400. */
function requireTenant(req: Request, res: Response): string | null {
  const tenantId =
    typeof req.body?.tenantId === "string" && req.body.tenantId
      ? req.body.tenantId
      : typeof req.query?.tenantId === "string"
      ? req.query.tenantId
      : "";
  if (!tenantId) {
    res.status(400).json({ error: "tenantId is required" });
    return null;
  }
  return tenantId;
}

async function writeAuditLog(
  client: import("pg").PoolClient,
  args: {
    tenantId: string | null;
    actor: string;
    entityType: string;
    entityId: string;
    operation: "create" | "update" | "delete" | "soft-delete";
    before: unknown;
    after: unknown;
    requestId: string | null;
  },
) {
  await client.query(
    `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      args.tenantId,
      args.actor,
      args.entityType,
      args.entityId,
      args.operation,
      args.before === undefined ? null : JSON.stringify(args.before),
      args.after === undefined ? null : JSON.stringify(args.after),
      args.requestId,
    ],
  );
}

function actorOf(req: Request): string {
  const a = req.headers["x-actor"];
  return (typeof a === "string" && a) || "system";
}
function requestIdOf(req: Request): string | null {
  const r = req.headers["x-request-id"];
  return typeof r === "string" && r ? r : null;
}

/**
 * Mounts the 5 CRUD handlers on `router` for `spec`.
 * Call once per table.
 */
export function mountRecordRoutes(router: Router, spec: TableSpec): void {
  const tbl = assertIdent(spec.table);
  for (const c of spec.writableColumns) assertIdent(c);

  // LIST
  router.get("/", async (req, res) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const includeArchived = req.query.includeArchived === "1";
      const sql = includeArchived
        ? `SELECT * FROM ${tbl} WHERE tenant_id = $1 ORDER BY created_at`
        : `SELECT * FROM ${tbl} WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY created_at`;
      const rows = await query<Record<string, unknown>>(sql, [tenantId]);
      return res.json({ items: rows.map(rowToApi) });
    } catch (err) {
      console.error(`${spec.entityType} LIST error`, err);
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // READ ONE
  router.get("/:id", async (req, res) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM ${tbl} WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [req.params.id, tenantId],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.json(rowToApi(rows[0]));
    } catch (err) {
      console.error(`${spec.entityType} GET error`, err);
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // CREATE
  router.post("/", async (req, res) => {
    const client = await pool.connect();
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const id = typeof req.body?.id === "string" && req.body.id ? req.body.id : randomUUID();
      const cols = bodyToColumns(spec, req.body ?? {});

      const colNames = ["id", "tenant_id", ...Object.keys(cols)];
      const values = [id, tenantId, ...Object.values(cols)];
      const placeholders = colNames.map((_, i) => `$${i + 1}`).join(", ");
      const colList = colNames.map(assertIdent).join(", ");

      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO ${tbl} (${colList}) VALUES (${placeholders}) RETURNING *`,
        values,
      );
      const row = inserted.rows[0] as Record<string, unknown>;
      await writeAuditLog(client, {
        tenantId, actor: actorOf(req), entityType: spec.entityType, entityId: id,
        operation: "create", before: null, after: row, requestId: requestIdOf(req),
      });
      await client.query("COMMIT");
      return res.status(201).json(rowToApi(row));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`${spec.entityType} CREATE error`, err);
      return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
    } finally {
      client.release();
    }
  });

  // UPDATE
  router.put("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const cols = bodyToColumns(spec, req.body ?? {});
      if (Object.keys(cols).length === 0) {
        return res.status(400).json({ error: "No writable fields supplied" });
      }

      await client.query("BEGIN");
      const beforeRes = await client.query(
        `SELECT * FROM ${tbl} WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, tenantId],
      );
      if (beforeRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Not found" });
      }
      const before = beforeRes.rows[0] as Record<string, unknown>;

      // Locked-row protection — refuse identity-field changes once locked.
      if (spec.lockedFlagColumn && spec.protectedColumnsWhenLocked?.length) {
        const isLocked = Boolean(before[spec.lockedFlagColumn]);
        if (isLocked) {
          const violations = spec.protectedColumnsWhenLocked.filter((c) => c in cols);
          if (violations.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
              error: `Cannot modify locked ${spec.entityType}: protected columns [${violations.join(", ")}] are frozen once a journal entry references this record.`,
            });
          }
        }
      }

      const colNames = Object.keys(cols);
      const setClause = colNames.map((c, i) => `${assertIdent(c)} = $${i + 1}`).join(", ");
      const values = [...Object.values(cols), req.params.id, tenantId];
      const updated = await client.query(
        `UPDATE ${tbl} SET ${setClause}, updated_at = NOW()
         WHERE id = $${colNames.length + 1} AND tenant_id = $${colNames.length + 2}
         RETURNING *`,
        values,
      );
      const row = updated.rows[0] as Record<string, unknown>;
      await writeAuditLog(client, {
        tenantId, actor: actorOf(req), entityType: spec.entityType, entityId: req.params.id,
        operation: "update", before, after: row, requestId: requestIdOf(req),
      });
      await client.query("COMMIT");
      return res.json(rowToApi(row));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`${spec.entityType} UPDATE error`, err);
      return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
    } finally {
      client.release();
    }
  });

  // DELETE (soft by default; hard=1 attempts real DELETE — may fail FK)
  router.delete("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const hard = req.query.hard === "1";

      await client.query("BEGIN");
      const beforeRes = await client.query(
        `SELECT * FROM ${tbl} WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, tenantId],
      );
      if (beforeRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Not found" });
      }
      const before = beforeRes.rows[0] as Record<string, unknown>;

      if (hard) {
        await client.query(`DELETE FROM ${tbl} WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
        await writeAuditLog(client, {
          tenantId, actor: actorOf(req), entityType: spec.entityType, entityId: req.params.id,
          operation: "delete", before, after: null, requestId: requestIdOf(req),
        });
      } else {
        await client.query(
          `UPDATE ${tbl} SET archived_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, tenantId],
        );
        await writeAuditLog(client, {
          tenantId, actor: actorOf(req), entityType: spec.entityType, entityId: req.params.id,
          operation: "soft-delete", before, after: null, requestId: requestIdOf(req),
        });
      }
      await client.query("COMMIT");
      return res.status(204).end();
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`${spec.entityType} DELETE error`, err);
      return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
    } finally {
      client.release();
    }
  });
}

/**
 * Translate common pg error codes to HTTP status codes.
 *   23503 foreign_key_violation        → 409
 *   23505 unique_violation             → 409
 *   23514 check_violation              → 422
 *   23502 not_null_violation           → 422
 */
export function httpStatusFor(err: unknown): number {
  const code = (err as { code?: string })?.code;
  if (code === "23503" || code === "23505") return 409;
  if (code === "23514" || code === "23502") return 422;
  return 500;
}

export { rowToApi };
