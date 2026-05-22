import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { pool, query } from "../lib/db.js";
import { httpStatusFor, rowToApi } from "../lib/records.js";

/**
 * Receipt & Payment Vouchers — parent + flattened lines.
 *
 * The frontend `RPVoucher` carries two arrays — `lines` and (optionally)
 * `bankLines`. They share the same row shape, so the DB stores both in a
 * single child table with a `line_kind` discriminator (`'line' | 'bank'`).
 * The list/get routes split them back into the FE-native shape.
 *
 * Routes:
 *   GET    /        ?tenantId=&type=receipt|payment (optional)
 *   GET    /:id     ?tenantId=
 *   POST   /        body: { tenantId, voucher, lines?, bankLines? }
 *   PUT    /:id     body: { tenantId, voucher, lines?, bankLines? }
 *   DELETE /:id     ?tenantId=
 *
 * Backend integrity guard refuses delete when status='posted' (mirrors
 * `deleteRPVoucher` in store.ts — posted vouchers carry a committed JE and
 * cleared invoice payments, so they must be unposted before deletion).
 */

const router: IRouter = Router();

interface IncomingLine {
  id?: string;
  accountId?: string;
  accountName?: string;
  description?: string;
  amount?: string | number;
  invoiceId?: string | null;
}

interface IncomingVoucher {
  id?: string;
  voucherNumber: string;
  voucherType?: "receipt" | "payment";
  date?: string;
  partyName?: string;
  cashBankAccountId?: string;
  cashBankAccountName?: string;
  reference?: string;
  totalAmount?: string | number;
  narration?: string;
  status?: "draft" | "posted";
  journalEntryId?: string | null;
  linkedInvoiceId?: string | null;
  linkedInvoiceIds?: string[] | null;
}

function toStr(v: unknown, dflt = ""): string {
  if (v === null || v === undefined) return dflt;
  return String(v);
}
function actorOf(headers: Record<string, unknown>): string {
  const a = headers["x-actor"];
  return (typeof a === "string" && a) || "system";
}
function requestIdOf(headers: Record<string, unknown>): string | null {
  const r = headers["x-request-id"];
  return typeof r === "string" && r ? r : null;
}

const VALID_TYPES = new Set(["receipt", "payment"]);
const VALID_STATUSES = new Set(["draft", "posted"]);

const INSERT_VOUCHER_SQL = `
  INSERT INTO rp_vouchers
    (id, tenant_id, voucher_number, voucher_type, voucher_date,
     party_name, cash_bank_account_id, cash_bank_account_name, reference,
     total_amount, narration, status,
     journal_entry_id, linked_invoice_id, linked_invoice_ids)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
`;

const INSERT_LINE_SQL = `
  INSERT INTO rp_voucher_lines
    (id, tenant_id, voucher_id, line_kind, account_id, account_name,
     description, amount, invoice_id, line_order)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
`;

function voucherValues(id: string, tenantId: string, v: IncomingVoucher): unknown[] {
  const linkedIds = Array.isArray(v.linkedInvoiceIds)
    ? v.linkedInvoiceIds.filter(x => typeof x === "string")
    : null;
  return [
    id, tenantId, v.voucherNumber,
    v.voucherType ?? "receipt", v.date ?? "",
    v.partyName ?? "",
    v.cashBankAccountId ?? "", v.cashBankAccountName ?? "",
    v.reference ?? "",
    toStr(v.totalAmount, "0"),
    v.narration ?? "",
    v.status ?? "draft",
    v.journalEntryId ?? null,
    v.linkedInvoiceId ?? null,
    linkedIds,
  ];
}

function lineValues(voucherId: string, tenantId: string, kind: "line" | "bank", l: IncomingLine, lineNo: number): unknown[] {
  return [
    l.id ?? randomUUID(), tenantId, voucherId, kind,
    l.accountId ?? "", l.accountName ?? "",
    l.description ?? "",
    toStr(l.amount, "0"),
    l.invoiceId ?? null, lineNo,
  ];
}

function splitLines(rows: Record<string, unknown>[]) {
  const lines: Record<string, unknown>[] = [];
  const bankLines: Record<string, unknown>[] = [];
  for (const r of rows) {
    const api = rowToApi(r);
    if (r.line_kind === "bank") bankLines.push(api); else lines.push(api);
  }
  return { lines, bankLines };
}

router.get("/", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    const typeFilter = typeof req.query.type === "string" && VALID_TYPES.has(req.query.type) ? req.query.type : null;
    const rows = typeFilter
      ? await query<Record<string, unknown>>(
          `SELECT * FROM rp_vouchers WHERE tenant_id = $1 AND voucher_type = $2 AND archived_at IS NULL ORDER BY voucher_date DESC, created_at DESC`,
          [tenantId, typeFilter],
        )
      : await query<Record<string, unknown>>(
          `SELECT * FROM rp_vouchers WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY voucher_date DESC, created_at DESC`,
          [tenantId],
        );
    const ids = rows.map(r => r.id as string);
    if (ids.length === 0) return res.json({ items: [] });
    const lineRows = await query<Record<string, unknown>>(
      `SELECT * FROM rp_voucher_lines WHERE tenant_id = $1 AND voucher_id = ANY($2::text[]) ORDER BY voucher_id, line_kind, line_order`,
      [tenantId, ids],
    );
    const byVoucher = new Map<string, Record<string, unknown>[]>();
    for (const ln of lineRows) {
      const k = ln.voucher_id as string;
      const arr = byVoucher.get(k) ?? [];
      arr.push(ln);
      byVoucher.set(k, arr);
    }
    return res.json({
      items: rows.map(r => {
        const { lines, bankLines } = splitLines(byVoucher.get(r.id as string) ?? []);
        return { ...rowToApi(r), lines, bankLines };
      }),
    });
  } catch (err) {
    console.error("rp-vouchers LIST error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM rp_vouchers WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.params.id, tenantId],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    const lineRows = await query<Record<string, unknown>>(
      `SELECT * FROM rp_voucher_lines WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_kind, line_order`,
      [tenantId, req.params.id],
    );
    const { lines, bankLines } = splitLines(lineRows);
    return res.json({ ...rowToApi(rows[0]), lines, bankLines });
  } catch (err) {
    console.error("rp-vouchers GET error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const v: IncomingVoucher = req.body?.voucher;
    const lines: IncomingLine[] = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const bankLines: IncomingLine[] = Array.isArray(req.body?.bankLines) ? req.body.bankLines : [];
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (!v || !v.voucherNumber) {
      return res.status(400).json({ error: "voucher.voucherNumber is required" });
    }
    if (v.voucherType !== undefined && !VALID_TYPES.has(v.voucherType)) {
      return res.status(400).json({ error: `voucher.voucherType must be 'receipt' or 'payment' (got '${v.voucherType}')` });
    }
    if (v.status !== undefined && !VALID_STATUSES.has(v.status)) {
      return res.status(400).json({ error: `voucher.status must be 'draft' or 'posted' (got '${v.status}')` });
    }
    const id = v.id ?? randomUUID();

    await client.query("BEGIN");
    await client.query(INSERT_VOUCHER_SQL, voucherValues(id, tenantId, v));
    for (let i = 0; i < lines.length; i++) {
      await client.query(INSERT_LINE_SQL, lineValues(id, tenantId, "line", lines[i], i));
    }
    for (let i = 0; i < bankLines.length; i++) {
      await client.query(INSERT_LINE_SQL, lineValues(id, tenantId, "bank", bankLines[i], i));
    }
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'rp_voucher',$4,'create',NULL,$5,$6)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), id,
        JSON.stringify({ voucher: v, lineCount: lines.length, bankLineCount: bankLines.length }),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const persisted = await query<Record<string, unknown>>(
      `SELECT * FROM rp_vouchers WHERE id = $1 AND tenant_id = $2`, [id, tenantId],
    );
    const persistedLines = await query<Record<string, unknown>>(
      `SELECT * FROM rp_voucher_lines WHERE voucher_id = $1 AND tenant_id = $2 ORDER BY line_kind, line_order`, [id, tenantId],
    );
    const split = splitLines(persistedLines);
    return res.status(201).json({ ...rowToApi(persisted[0]), lines: split.lines, bankLines: split.bankLines });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("rp-vouchers CREATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const v: Partial<IncomingVoucher> = req.body?.voucher ?? {};
    const lines: IncomingLine[] | undefined = Array.isArray(req.body?.lines) ? req.body.lines : undefined;
    const bankLines: IncomingLine[] | undefined = Array.isArray(req.body?.bankLines) ? req.body.bankLines : undefined;
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (v.voucherType !== undefined && !VALID_TYPES.has(v.voucherType)) {
      return res.status(400).json({ error: `voucher.voucherType must be 'receipt' or 'payment' (got '${v.voucherType}')` });
    }
    if (v.status !== undefined && !VALID_STATUSES.has(v.status)) {
      return res.status(400).json({ error: `voucher.status must be 'draft' or 'posted' (got '${v.status}')` });
    }

    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM rp_vouchers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;

    const linkedIdsParam = v.linkedInvoiceIds === undefined
      ? before.linked_invoice_ids
      : (v.linkedInvoiceIds === null ? null : (Array.isArray(v.linkedInvoiceIds) ? v.linkedInvoiceIds : null));

    const updated = await client.query(
      `UPDATE rp_vouchers SET
         voucher_number         = COALESCE($1,  voucher_number),
         voucher_type           = COALESCE($2,  voucher_type),
         voucher_date           = COALESCE($3,  voucher_date),
         party_name             = COALESCE($4,  party_name),
         cash_bank_account_id   = COALESCE($5,  cash_bank_account_id),
         cash_bank_account_name = COALESCE($6,  cash_bank_account_name),
         reference              = COALESCE($7,  reference),
         total_amount           = COALESCE($8,  total_amount),
         narration              = COALESCE($9,  narration),
         status                 = COALESCE($10, status),
         journal_entry_id       = $11,
         linked_invoice_id      = $12,
         linked_invoice_ids     = $13,
         updated_at             = NOW()
       WHERE id = $14 AND tenant_id = $15
       RETURNING *`,
      [
        v.voucherNumber         ?? null,
        v.voucherType           ?? null,
        v.date                  ?? null,
        v.partyName             ?? null,
        v.cashBankAccountId     ?? null,
        v.cashBankAccountName   ?? null,
        v.reference             ?? null,
        v.totalAmount !== undefined ? toStr(v.totalAmount) : null,
        v.narration             ?? null,
        v.status                ?? null,
        v.journalEntryId !== undefined ? v.journalEntryId : before.journal_entry_id,
        v.linkedInvoiceId !== undefined ? v.linkedInvoiceId : before.linked_invoice_id,
        linkedIdsParam,
        req.params.id, tenantId,
      ],
    );

    if (lines || bankLines) {
      // Wholesale replace: clear ALL lines (both kinds) when either array is
      // present, then re-insert. This matches the FE's array-mutation pattern
      // where the whole voucher is re-saved on any line edit.
      await client.query(
        `DELETE FROM rp_voucher_lines WHERE voucher_id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId],
      );
      const ls = lines ?? [];
      const bls = bankLines ?? [];
      for (let i = 0; i < ls.length; i++) {
        await client.query(INSERT_LINE_SQL, lineValues(req.params.id, tenantId, "line", ls[i], i));
      }
      for (let i = 0; i < bls.length; i++) {
        await client.query(INSERT_LINE_SQL, lineValues(req.params.id, tenantId, "bank", bls[i], i));
      }
    }

    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'rp_voucher',$4,'update',$5,$6,$7)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before), JSON.stringify(updated.rows[0]),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const persistedLines = await query<Record<string, unknown>>(
      `SELECT * FROM rp_voucher_lines WHERE voucher_id = $1 AND tenant_id = $2 ORDER BY line_kind, line_order`,
      [req.params.id, tenantId],
    );
    const split = splitLines(persistedLines);
    return res.json({ ...rowToApi(updated.rows[0]), lines: split.lines, bankLines: split.bankLines });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("rp-vouchers UPDATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM rp_vouchers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
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
        error: `Cannot delete posted voucher ${before.voucher_number ?? req.params.id}: it carries a posted journal entry and may have settled invoice payments. Reverse (unpost) the voucher first, then delete it.`,
      });
    }

    await client.query(`DELETE FROM rp_vouchers WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'rp_voucher',$4,'delete',$5,NULL,$6)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");
    return res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("rp-vouchers DELETE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
