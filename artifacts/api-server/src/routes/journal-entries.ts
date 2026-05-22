import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { pool, query } from "../lib/db.js";
import { httpStatusFor, rowToApi } from "../lib/records.js";

/**
 * Journal Entries — the load-bearing endpoint for double-entry integrity.
 *
 * Routes:
 *   GET    /                 ?tenantId=...           list (lines included)
 *   GET    /:id              ?tenantId=...           one (lines included)
 *   POST   /                 body: { tenantId, je: {...}, lines: [{...}] }
 *                            Single transaction:
 *                              1. INSERT journal_entries
 *                              2. INSERT N journal_entry_lines (FK validates account)
 *                              3. UPDATE accounts SET is_locked=true for every account touched
 *                              4. INSERT audit_log
 *                            Validates SUM(debit) = SUM(credit) before commit.
 *   POST   /:id/post         body: { tenantId, postedBy }
 *                            Flips status from draft → posted; sets posted_at.
 *                            Re-asserts balance.
 *   DELETE /:id              ?tenantId=...
 *                            Refuses if status='posted'. Cascades to lines via FK.
 */

const router: IRouter = Router();

interface IncomingLine {
  id?: string;
  ledgerAccountId: string;
  accountCode: string;
  partyType?: string | null;
  partyId?: string | null;
  staffId?: string | null;
  narration?: string;
  debit?: string | number;
  credit?: string | number;
  lineOrder?: number;
}

interface IncomingJE {
  id?: string;
  reference: string;
  description?: string;
  date: string;
  status?: "draft" | "posted";
  reversesJeId?: string | null;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v) return Number(v);
  return 0;
}

function actorOf(headers: Record<string, unknown>): string {
  const a = headers["x-actor"];
  return (typeof a === "string" && a) || "system";
}
function requestIdOf(headers: Record<string, unknown>): string | null {
  const r = headers["x-request-id"];
  return typeof r === "string" && r ? r : null;
}

// LIST
router.get("/", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    const entries = await query<Record<string, unknown>>(
      `SELECT * FROM journal_entries WHERE tenant_id = $1 ORDER BY date DESC, created_at DESC`,
      [tenantId],
    );
    const ids = entries.map((e) => e.id as string);
    const lines = ids.length === 0
      ? []
      : await query<Record<string, unknown>>(
          `SELECT * FROM journal_entry_lines
           WHERE tenant_id = $1 AND journal_entry_id = ANY($2::text[])
           ORDER BY journal_entry_id, line_order`,
          [tenantId, ids],
        );
    const linesByJe = new Map<string, Record<string, unknown>[]>();
    for (const l of lines) {
      const k = l.journal_entry_id as string;
      const arr = linesByJe.get(k) ?? [];
      arr.push(rowToApi(l));
      linesByJe.set(k, arr);
    }
    return res.json({
      items: entries.map((e) => ({
        ...rowToApi(e),
        lines: linesByJe.get(e.id as string) ?? [],
      })),
    });
  } catch (err) {
    console.error("journal-entries LIST error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// GET ONE
router.get("/:id", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    const entries = await query<Record<string, unknown>>(
      `SELECT * FROM journal_entries WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.params.id, tenantId],
    );
    if (entries.length === 0) return res.status(404).json({ error: "Not found" });
    const lines = await query<Record<string, unknown>>(
      `SELECT * FROM journal_entry_lines
       WHERE tenant_id = $1 AND journal_entry_id = $2
       ORDER BY line_order`,
      [tenantId, req.params.id],
    );
    return res.json({ ...rowToApi(entries[0]), lines: lines.map(rowToApi) });
  } catch (err) {
    console.error("journal-entries GET error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// CREATE — transactional JE + N lines + auto-lock referenced accounts
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const je: IncomingJE = req.body?.je;
    const lines: IncomingLine[] = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (!je || !je.reference || !je.date) {
      return res.status(400).json({ error: "je.reference and je.date are required" });
    }
    if (lines.length < 2) {
      return res.status(400).json({ error: "A journal entry needs at least 2 lines" });
    }

    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      if (!l.ledgerAccountId || !l.accountCode) {
        return res.status(400).json({ error: "Every line needs ledgerAccountId and accountCode" });
      }
      totalDebit += num(l.debit);
      totalCredit += num(l.credit);
    }
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.0001;
    const status = je.status ?? "draft";
    if (status === "posted" && !isBalanced) {
      return res.status(422).json({
        error: `JE not balanced: debit=${totalDebit} credit=${totalCredit}`,
      });
    }

    const jeId = je.id ?? randomUUID();
    const now = new Date();

    await client.query("BEGIN");

    // 1. Insert the header
    await client.query(
      `INSERT INTO journal_entries
        (id, tenant_id, reference, description, date, status,
         total_debit, total_credit, is_balanced, reverses_je_id,
         posted_at, posted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        jeId, tenantId, je.reference, je.description ?? "", je.date, status,
        totalDebit.toString(), totalCredit.toString(), isBalanced, je.reversesJeId ?? null,
        status === "posted" ? now : null,
        status === "posted" ? actorOf(req.headers as Record<string, unknown>) : null,
      ],
    );

    // 2. Insert lines — FK on ledger_account_id will reject any unknown account
    const referencedAccountIds = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      referencedAccountIds.add(l.ledgerAccountId);
      await client.query(
        `INSERT INTO journal_entry_lines
          (id, tenant_id, journal_entry_id, ledger_account_id, account_code,
           party_type, party_id, staff_id, narration,
           debit, credit, line_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          l.id ?? randomUUID(), tenantId, jeId, l.ledgerAccountId, l.accountCode,
          l.partyType ?? null, l.partyId ?? null, l.staffId ?? null, l.narration ?? "",
          num(l.debit).toString(), num(l.credit).toString(),
          typeof l.lineOrder === "number" ? l.lineOrder : i,
        ],
      );
    }

    // 3. Lock every account touched (no-op if already locked)
    if (status === "posted" && referencedAccountIds.size > 0) {
      await client.query(
        `UPDATE accounts SET is_locked = TRUE, locked_at = COALESCE(locked_at, NOW()), updated_at = NOW()
         WHERE tenant_id = $1 AND id = ANY($2::text[]) AND is_locked = FALSE`,
        [tenantId, Array.from(referencedAccountIds)],
      );
    }

    // 4. Audit log
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'journal_entry',$4,'create',NULL,$5,$6)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>),
        jeId,
        JSON.stringify({ je, lines, totalDebit, totalCredit }),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );

    await client.query("COMMIT");

    // Return the fully persisted shape
    const persistedJe = await query<Record<string, unknown>>(
      `SELECT * FROM journal_entries WHERE id = $1`, [jeId],
    );
    const persistedLines = await query<Record<string, unknown>>(
      `SELECT * FROM journal_entry_lines WHERE journal_entry_id = $1 ORDER BY line_order`, [jeId],
    );
    return res.status(201).json({
      ...rowToApi(persistedJe[0]),
      lines: persistedLines.map(rowToApi),
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("journal-entries CREATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// POST :id/post  — flip draft → posted
router.post("/:id/post", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId ?? req.query?.tenantId;
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM journal_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;
    if (before.status === "posted") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Already posted" });
    }

    const balRes = await client.query(
      `SELECT
         COALESCE(SUM(debit), 0)::text  AS d,
         COALESCE(SUM(credit), 0)::text AS c
       FROM journal_entry_lines WHERE journal_entry_id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    const d = Number(balRes.rows[0].d);
    const c = Number(balRes.rows[0].c);
    if (Math.abs(d - c) > 0.0001) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: `JE not balanced: debit=${d} credit=${c}` });
    }

    const updated = await client.query(
      `UPDATE journal_entries
       SET status = 'posted', posted_at = NOW(), posted_by = $1,
           total_debit = $2, total_credit = $3, is_balanced = TRUE, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [actorOf(req.headers as Record<string, unknown>), d.toString(), c.toString(), req.params.id, tenantId],
    );

    // Lock the accounts referenced by lines of this JE.
    // Tenant filter on the inner SELECT is defence-in-depth: the composite
    // FK already guarantees the line's tenant matches its account's tenant.
    await client.query(
      `UPDATE accounts SET is_locked = TRUE, locked_at = COALESCE(locked_at, NOW()), updated_at = NOW()
       WHERE tenant_id = $1 AND is_locked = FALSE
         AND id IN (
           SELECT ledger_account_id FROM journal_entry_lines
           WHERE journal_entry_id = $2 AND tenant_id = $1
         )`,
      [tenantId, req.params.id],
    );

    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'journal_entry',$4,'update',$5,$6,$7)`,
      [
        randomUUID(), tenantId, actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before), JSON.stringify(updated.rows[0]),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );

    await client.query("COMMIT");
    return res.json(rowToApi(updated.rows[0]));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("journal-entries POST error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// UPDATE — replace lines of a DRAFT journal entry (posted entries are immutable)
router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const je: Partial<IncomingJE> = req.body?.je ?? {};
    const lines: IncomingLine[] = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (lines.length < 2) {
      return res.status(400).json({ error: "A journal entry needs at least 2 lines" });
    }

    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      if (!l.ledgerAccountId || !l.accountCode) {
        return res.status(400).json({ error: "Every line needs ledgerAccountId and accountCode" });
      }
      totalDebit  += num(l.debit);
      totalCredit += num(l.credit);
    }
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.0001;

    await client.query("BEGIN");

    const beforeRes = await client.query(
      `SELECT * FROM journal_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;
    if (before.status === "posted") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Posted journal entries cannot be edited. Post a reversing entry instead.",
      });
    }

    const updatedStatus = (je.status as string) ?? (before.status as string);
    if (updatedStatus === "posted" && !isBalanced) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: `JE not balanced: debit=${totalDebit} credit=${totalCredit}`,
      });
    }

    // Delete existing lines then reinsert
    await client.query(
      `DELETE FROM journal_entry_lines WHERE journal_entry_id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );

    const referencedAccountIds = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      referencedAccountIds.add(l.ledgerAccountId);
      await client.query(
        `INSERT INTO journal_entry_lines
          (id, tenant_id, journal_entry_id, ledger_account_id, account_code,
           party_type, party_id, staff_id, narration,
           debit, credit, line_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          l.id ?? randomUUID(), tenantId, req.params.id, l.ledgerAccountId, l.accountCode,
          l.partyType ?? null, l.partyId ?? null, l.staffId ?? null, l.narration ?? "",
          num(l.debit).toString(), num(l.credit).toString(),
          typeof l.lineOrder === "number" ? l.lineOrder : i,
        ],
      );
    }

    const updated = await client.query(
      `UPDATE journal_entries
       SET reference   = COALESCE($1, reference),
           description = COALESCE($2, description),
           date        = COALESCE($3, date),
           status      = $4,
           total_debit  = $5,
           total_credit = $6,
           is_balanced  = $7,
           posted_at   = CASE WHEN $4 = 'posted' AND posted_at IS NULL THEN NOW() ELSE posted_at END,
           posted_by   = CASE WHEN $4 = 'posted' AND posted_by IS NULL THEN $8 ELSE posted_by END,
           updated_at  = NOW()
       WHERE id = $9 AND tenant_id = $10
       RETURNING *`,
      [
        je.reference   ?? null,
        je.description ?? null,
        je.date        ?? null,
        updatedStatus,
        totalDebit.toString(),
        totalCredit.toString(),
        isBalanced,
        actorOf(req.headers as Record<string, unknown>),
        req.params.id,
        tenantId,
      ],
    );

    // Lock accounts when posting
    if (updatedStatus === "posted" && referencedAccountIds.size > 0) {
      await client.query(
        `UPDATE accounts SET is_locked = TRUE, locked_at = COALESCE(locked_at, NOW()), updated_at = NOW()
         WHERE tenant_id = $1 AND id = ANY($2::text[]) AND is_locked = FALSE`,
        [tenantId, Array.from(referencedAccountIds)],
      );
    }

    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'journal_entry',$4,'update',$5,$6,$7)`,
      [
        randomUUID(), tenantId, actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before), JSON.stringify(updated.rows[0]),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );

    await client.query("COMMIT");

    const persistedLines = await query<Record<string, unknown>>(
      `SELECT * FROM journal_entry_lines WHERE journal_entry_id = $1 ORDER BY line_order`,
      [req.params.id],
    );
    return res.json({ ...rowToApi(updated.rows[0]), lines: persistedLines.map(rowToApi) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("journal-entries UPDATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE — refuses if status='posted'; cascades to lines via FK
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }

    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM journal_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;
    if (before.status === "posted") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Posted journal entries cannot be deleted. Post a reversing entry instead.",
      });
    }

    await client.query(
      `DELETE FROM journal_entries WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'journal_entry',$4,'delete',$5,NULL,$6)`,
      [
        randomUUID(), tenantId, actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");
    return res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("journal-entries DELETE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
