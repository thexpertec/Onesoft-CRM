import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { pool, query } from "../lib/db.js";
import { httpStatusFor, rowToApi } from "../lib/records.js";

/**
 * Purchase Returns — parent + line items. Reversal of a Purchase Invoice.
 *
 * Same routes / contract as sale-returns. Item rows carry an extra `category`
 * column that's locked at invoice-selection time so the reversal JE hits the
 * same inventory sub-ledger as the original PO JE.
 *
 * Backend integrity guard refuses delete when a journal entry references the
 * return (je_id set) — mirrors `deletePurchaseReturn` in store.ts.
 */

const router: IRouter = Router();

interface IncomingItem {
  id?: string;
  productName?: string;
  sku?: string;
  unit?: string;
  qty?: string | number;
  unitPrice?: string | number;
  discount?: string | number;
  category?: string | null;
  lineOrder?: number;
}

interface IncomingReturn {
  id?: string;
  returnNumber: string;
  originalInvoiceNumber?: string;
  originalInvoiceId?: string;
  date?: string;
  supplier?: string;
  refundMethod?: string;
  subtotal?: string | number;
  taxAmount?: string | number;
  grandTotal?: string | number;
  reason?: string;
  notes?: string;
  status?: "draft" | "posted";
  jeId?: string | null;
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

const VALID_STATUSES = new Set(["draft", "posted"]);

const INSERT_PR_SQL = `
  INSERT INTO purchase_returns
    (id, tenant_id, return_number, original_invoice_number, original_invoice_id,
     return_date, supplier, refund_method,
     subtotal, tax_amount, grand_total,
     reason, notes, status, je_id)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
`;

const INSERT_ITEM_SQL = `
  INSERT INTO purchase_return_items
    (id, tenant_id, return_id, product_name, sku, unit, qty, unit_price, discount, category, line_order)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
`;

function prValues(id: string, tenantId: string, v: IncomingReturn): unknown[] {
  return [
    id, tenantId, v.returnNumber,
    v.originalInvoiceNumber ?? "", v.originalInvoiceId ?? "",
    v.date ?? "", v.supplier ?? "",
    v.refundMethod ?? "Cash",
    toStr(v.subtotal, "0"),
    toStr(v.taxAmount, "0"),
    toStr(v.grandTotal, "0"),
    v.reason ?? "", v.notes ?? "",
    v.status ?? "draft",
    v.jeId ?? null,
  ];
}

function itemValues(returnId: string, tenantId: string, it: IncomingItem, lineNo: number): unknown[] {
  return [
    it.id ?? randomUUID(), tenantId, returnId,
    it.productName ?? "", it.sku ?? "", it.unit ?? "",
    toStr(it.qty, "0"), toStr(it.unitPrice, "0"), toStr(it.discount, "0"),
    it.category ?? null,
    typeof it.lineOrder === "number" ? it.lineOrder : lineNo,
  ];
}

router.get("/", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_returns WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY return_date DESC, created_at DESC`,
      [tenantId],
    );
    const ids = rows.map(r => r.id as string);
    if (ids.length === 0) return res.json({ items: [] });
    const items = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_return_items WHERE tenant_id = $1 AND return_id = ANY($2::text[]) ORDER BY return_id, line_order`,
      [tenantId, ids],
    );
    const byReturn = new Map<string, Record<string, unknown>[]>();
    for (const it of items) {
      const k = it.return_id as string;
      const arr = byReturn.get(k) ?? [];
      arr.push(rowToApi(it));
      byReturn.set(k, arr);
    }
    return res.json({
      items: rows.map(r => ({
        ...rowToApi(r),
        items: byReturn.get(r.id as string) ?? [],
      })),
    });
  } catch (err) {
    console.error("purchase-returns LIST error", err);
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
      `SELECT * FROM purchase_returns WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.params.id, tenantId],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    const items = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_return_items WHERE tenant_id = $1 AND return_id = $2 ORDER BY line_order`,
      [tenantId, req.params.id],
    );
    return res.json({ ...rowToApi(rows[0]), items: items.map(rowToApi) });
  } catch (err) {
    console.error("purchase-returns GET error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const pr: IncomingReturn = req.body?.purchaseReturn;
    const items: IncomingItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (!pr || !pr.returnNumber) {
      return res.status(400).json({ error: "purchaseReturn.returnNumber is required" });
    }
    if (pr.status !== undefined && !VALID_STATUSES.has(pr.status)) {
      return res.status(400).json({ error: `status must be 'draft' or 'posted' (got '${pr.status}')` });
    }
    const id = pr.id ?? randomUUID();

    await client.query("BEGIN");
    await client.query(INSERT_PR_SQL, prValues(id, tenantId, pr));
    for (let i = 0; i < items.length; i++) {
      await client.query(INSERT_ITEM_SQL, itemValues(id, tenantId, items[i], i));
    }
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'purchase_return',$4,'create',NULL,$5,$6)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), id,
        JSON.stringify({ purchaseReturn: pr, itemCount: items.length }),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const persisted = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_returns WHERE id = $1 AND tenant_id = $2`, [id, tenantId],
    );
    const pItems = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_return_items WHERE return_id = $1 AND tenant_id = $2 ORDER BY line_order`, [id, tenantId],
    );
    return res.status(201).json({ ...rowToApi(persisted[0]), items: pItems.map(rowToApi) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("purchase-returns CREATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const pr: Partial<IncomingReturn> = req.body?.purchaseReturn ?? {};
    const items: IncomingItem[] | undefined = Array.isArray(req.body?.items) ? req.body.items : undefined;
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (pr.status !== undefined && !VALID_STATUSES.has(pr.status)) {
      return res.status(400).json({ error: `status must be 'draft' or 'posted' (got '${pr.status}')` });
    }

    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM purchase_returns WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;

    const updated = await client.query(
      `UPDATE purchase_returns SET
         return_number           = COALESCE($1, return_number),
         original_invoice_number = COALESCE($2, original_invoice_number),
         original_invoice_id     = COALESCE($3, original_invoice_id),
         return_date             = COALESCE($4, return_date),
         supplier                = COALESCE($5, supplier),
         refund_method           = COALESCE($6, refund_method),
         subtotal                = COALESCE($7, subtotal),
         tax_amount              = COALESCE($8, tax_amount),
         grand_total             = COALESCE($9, grand_total),
         reason                  = COALESCE($10, reason),
         notes                   = COALESCE($11, notes),
         status                  = COALESCE($12, status),
         je_id                   = $13,
         updated_at              = NOW()
       WHERE id = $14 AND tenant_id = $15
       RETURNING *`,
      [
        pr.returnNumber          ?? null,
        pr.originalInvoiceNumber ?? null,
        pr.originalInvoiceId     ?? null,
        pr.date                  ?? null,
        pr.supplier              ?? null,
        pr.refundMethod          ?? null,
        pr.subtotal   !== undefined ? toStr(pr.subtotal)   : null,
        pr.taxAmount  !== undefined ? toStr(pr.taxAmount)  : null,
        pr.grandTotal !== undefined ? toStr(pr.grandTotal) : null,
        pr.reason                ?? null,
        pr.notes                 ?? null,
        pr.status                ?? null,
        pr.jeId !== undefined ? pr.jeId : before.je_id,
        req.params.id, tenantId,
      ],
    );

    if (items) {
      await client.query(
        `DELETE FROM purchase_return_items WHERE return_id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId],
      );
      for (let i = 0; i < items.length; i++) {
        await client.query(INSERT_ITEM_SQL, itemValues(req.params.id, tenantId, items[i], i));
      }
    }

    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'purchase_return',$4,'update',$5,$6,$7)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before), JSON.stringify(updated.rows[0]),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const pItems = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_return_items WHERE return_id = $1 AND tenant_id = $2 ORDER BY line_order`,
      [req.params.id, tenantId],
    );
    return res.json({ ...rowToApi(updated.rows[0]), items: pItems.map(rowToApi) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("purchase-returns UPDATE error", err);
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
      `SELECT * FROM purchase_returns WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;
    const jeId = before.je_id;
    if (typeof jeId === "string" && jeId) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `Cannot delete purchase return: linked to journal entry ${jeId}. Delete the journal entry first to unwind the reversal.`,
      });
    }

    await client.query(`DELETE FROM purchase_returns WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'purchase_return',$4,'delete',$5,NULL,$6)`,
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
    console.error("purchase-returns DELETE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
