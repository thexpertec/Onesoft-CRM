import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { pool, query } from "../lib/db.js";
import { httpStatusFor, rowToApi } from "../lib/records.js";

/**
 * Invoices — parent + line items + payment history. Sale invoices AND
 * purchase invoices share this endpoint (distinguished by invoice_type).
 *
 * Routes:
 *   GET    /                ?tenantId=...[&type=sale|purchase]  list (items + payments included)
 *   GET    /:id             ?tenantId=...                       one
 *   POST   /                body: { tenantId, invoice: {...}, items: [{...}], payments: [{...}] }
 *   PUT    /:id             body: { tenantId, invoice: {...}, items?: [...], payments?: [...] }
 *                           (items / payments replaced wholesale if provided)
 *   DELETE /:id             ?tenantId=...                       (CASCADE removes items + payments)
 *
 * Backend financial-integrity guards refuse delete when:
 *   - amount_paid > 0
 *   - any payment history row exists
 *   - the invoice is linked to a journal entry (je_id)
 * Mirrors `_invoiceFinancialBlockers` on the frontend (see replit.md).
 *
 * String-typed numerics preserve the frontend's "string-of-decimal" contract.
 */

const router: IRouter = Router();

interface IncomingItem {
  id?: string;
  productName?: string;
  localName?: string | null;
  sku?: string;
  qty?: string | number;
  unit?: string;
  unitPrice?: string | number;
  discount?: string | number;
  discountType?: string | null;
  notes?: string;
  itemStatus?: string;
  bogoApplied?: boolean;
  variantLabel?: string | null;
  costPrice?: string | number | null;
  purchaseUnit?: string | null;
  conversionFactor?: string | number | null;
  lineOrder?: number;
}

interface IncomingPayment {
  id?: string;
  date?: string;
  amount?: string | number;
  method?: string;
  note?: string;
  jeRef?: string | null;
  lineOrder?: number;
}

interface IncomingInvoice {
  id?: string;
  invoiceNumber: string;
  invoiceTitle?: string;
  invoiceType?: "sale" | "purchase";
  invoiceDate?: string;
  dueDate?: string;
  customer?: string;
  customerId?: string;
  buyerAddress?: string;
  buyerTown?: string;
  buyerPhone?: string;
  buyerEmail?: string;
  salesOfficer?: string;
  status?: string;
  saleStatus?: string | null;
  stockReceived?: boolean | null;
  paymentMethod?: string;
  paymentTerms?: string;
  bankDetails?: string;
  bankAccountIds?: string[] | null;
  amountPaid?: string | number;
  paidAt?: string;
  taxRate?: string | number;
  pricingMode?: "wholesale" | "retail" | null;
  shippingFee?: string | number;
  handlingFee?: string | number;
  shippingMethod?: string;
  agentId?: string | null;
  agentName?: string | null;
  notes?: string;
  agreement?: string;
  invoiceFooter?: string;
  memoNo?: string;
  invoiceDocs?: unknown | null;
  stockDeducted?: boolean;
  jeId?: string | null;
  // Frontend writes `jeUsesAR` (capital AR) — see store.ts Invoice type.
  // We accept both spellings to round-trip cleanly with the existing payload
  // shape; the migrator already does the same.
  jeUsesAr?: boolean | null;
  jeUsesAR?: boolean | null;
  /** PR3 — set once when invoice is generated from a repair booking. */
  sourceRepairBookingId?: string | null;
}

function pickJeUsesAr(v: Partial<IncomingInvoice>): boolean | null | undefined {
  if (v.jeUsesAR !== undefined) return v.jeUsesAR;
  if (v.jeUsesAr !== undefined) return v.jeUsesAr;
  return undefined;
}

const VALID_INVOICE_TYPES = new Set(["sale", "purchase"]);

function toStr(v: unknown, dflt = ""): string {
  if (v === null || v === undefined) return dflt;
  if (typeof v === "number") return String(v);
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

const INV_COLS = [
  "id", "tenant_id", "invoice_number", "invoice_title", "invoice_type",
  "invoice_date", "due_date", "customer", "customer_id",
  "buyer_address", "buyer_town", "buyer_phone", "buyer_email", "sales_officer",
  "status", "sale_status", "stock_received",
  "payment_method", "payment_terms", "bank_details", "bank_account_ids",
  "amount_paid", "paid_at", "tax_rate", "pricing_mode",
  "shipping_fee", "handling_fee", "shipping_method",
  "agent_id", "agent_name",
  "notes", "agreement", "invoice_footer", "memo_no", "invoice_docs",
  "stock_deducted", "je_id", "je_uses_ar",
  "source_repair_booking_id",
] as const;

function invValues(invId: string, tenantId: string, v: IncomingInvoice): unknown[] {
  const bankIds = Array.isArray(v.bankAccountIds) ? v.bankAccountIds.filter(x => typeof x === "string") : null;
  const jeUsesAr = pickJeUsesAr(v);
  return [
    invId, tenantId, v.invoiceNumber,
    v.invoiceTitle ?? "Invoice",
    v.invoiceType ?? "sale",
    v.invoiceDate ?? "", v.dueDate ?? "",
    v.customer ?? "", v.customerId ?? "",
    v.buyerAddress ?? "", v.buyerTown ?? "",
    v.buyerPhone ?? "", v.buyerEmail ?? "",
    v.salesOfficer ?? "",
    v.status ?? "Draft",
    v.saleStatus ?? null,
    typeof v.stockReceived === "boolean" ? v.stockReceived : null,
    v.paymentMethod ?? "", v.paymentTerms ?? "",
    v.bankDetails ?? "", bankIds,
    toStr(v.amountPaid, "0"), v.paidAt ?? "",
    toStr(v.taxRate, "0"), v.pricingMode ?? null,
    toStr(v.shippingFee, "0"), toStr(v.handlingFee, "0"),
    v.shippingMethod ?? "",
    v.agentId ?? null, v.agentName ?? null,
    v.notes ?? "", v.agreement ?? "", v.invoiceFooter ?? "",
    v.memoNo ?? "",
    v.invoiceDocs === undefined || v.invoiceDocs === null ? null : JSON.stringify(v.invoiceDocs),
    v.stockDeducted === true,
    v.jeId ?? null,
    typeof jeUsesAr === "boolean" ? jeUsesAr : null,
    v.sourceRepairBookingId ?? null,
  ];
}

function itemValues(invoiceId: string, tenantId: string, it: IncomingItem, lineNo: number): unknown[] {
  return [
    it.id ?? randomUUID(), tenantId, invoiceId,
    it.productName ?? "", it.localName ?? null, it.sku ?? "",
    toStr(it.qty, "0"), it.unit ?? "", toStr(it.unitPrice, "0"),
    toStr(it.discount, "0"), it.discountType ?? null,
    it.notes ?? "", it.itemStatus ?? "Pending",
    it.bogoApplied === true,
    it.variantLabel ?? null,
    it.costPrice !== undefined && it.costPrice !== null ? toStr(it.costPrice) : null,
    it.purchaseUnit ?? null,
    it.conversionFactor !== undefined && it.conversionFactor !== null ? toStr(it.conversionFactor) : null,
    typeof it.lineOrder === "number" ? it.lineOrder : lineNo,
  ];
}

function payValues(invoiceId: string, tenantId: string, p: IncomingPayment, lineNo: number): unknown[] {
  return [
    p.id ?? randomUUID(), tenantId, invoiceId,
    p.date ?? "", toStr(p.amount, "0"),
    p.method ?? "", p.note ?? "",
    p.jeRef ?? null,
    typeof p.lineOrder === "number" ? p.lineOrder : lineNo,
  ];
}

const INSERT_INV_SQL = `
  INSERT INTO invoices (${INV_COLS.join(", ")})
  VALUES (${INV_COLS.map((_, i) => `$${i + 1}`).join(",")})
`;

const INSERT_ITEM_SQL = `
  INSERT INTO invoice_items
    (id, tenant_id, invoice_id, product_name, local_name, sku, qty, unit,
     unit_price, discount, discount_type, notes, item_status, bogo_applied,
     variant_label, cost_price, purchase_unit, conversion_factor, line_order)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
`;

const INSERT_PAY_SQL = `
  INSERT INTO invoice_payments
    (id, tenant_id, invoice_id, payment_date, amount, method, note, je_ref, line_order)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
`;

async function fetchChildren(tenantId: string, invoiceId: string): Promise<{ items: Record<string, unknown>[]; payments: Record<string, unknown>[] }> {
  const [items, payments] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT * FROM invoice_items WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY line_order`,
      [tenantId, invoiceId],
    ),
    query<Record<string, unknown>>(
      `SELECT * FROM invoice_payments WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY line_order`,
      [tenantId, invoiceId],
    ),
  ]);
  return { items, payments };
}

// LIST
router.get("/", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    const type = typeof req.query.type === "string" && req.query.type ? req.query.type : null;
    const sql = type
      ? `SELECT * FROM invoices WHERE tenant_id = $1 AND invoice_type = $2 AND archived_at IS NULL ORDER BY invoice_date DESC, created_at DESC`
      : `SELECT * FROM invoices WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY invoice_date DESC, created_at DESC`;
    const params = type ? [tenantId, type] : [tenantId];
    const invs = await query<Record<string, unknown>>(sql, params);
    const ids = invs.map(i => i.id as string);
    if (ids.length === 0) return res.json({ items: [] });
    const [items, payments] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT * FROM invoice_items WHERE tenant_id = $1 AND invoice_id = ANY($2::text[]) ORDER BY invoice_id, line_order`,
        [tenantId, ids],
      ),
      query<Record<string, unknown>>(
        `SELECT * FROM invoice_payments WHERE tenant_id = $1 AND invoice_id = ANY($2::text[]) ORDER BY invoice_id, line_order`,
        [tenantId, ids],
      ),
    ]);
    const itemsByInv = new Map<string, Record<string, unknown>[]>();
    for (const it of items) {
      const k = it.invoice_id as string;
      const arr = itemsByInv.get(k) ?? [];
      arr.push(rowToApi(it));
      itemsByInv.set(k, arr);
    }
    const paysByInv = new Map<string, Record<string, unknown>[]>();
    for (const p of payments) {
      const k = p.invoice_id as string;
      const arr = paysByInv.get(k) ?? [];
      arr.push(rowToApi(p));
      paysByInv.set(k, arr);
    }
    return res.json({
      items: invs.map(i => ({
        ...rowToApi(i),
        items: itemsByInv.get(i.id as string) ?? [],
        paymentHistory: paysByInv.get(i.id as string) ?? [],
      })),
    });
  } catch (err) {
    console.error("invoices LIST error", err);
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
    const invs = await query<Record<string, unknown>>(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.params.id, tenantId],
    );
    if (invs.length === 0) return res.status(404).json({ error: "Not found" });
    const { items, payments } = await fetchChildren(tenantId, req.params.id);
    return res.json({
      ...rowToApi(invs[0]),
      items: items.map(rowToApi),
      paymentHistory: payments.map(rowToApi),
    });
  } catch (err) {
    console.error("invoices GET error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// CREATE
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const inv: IncomingInvoice = req.body?.invoice;
    const items: IncomingItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const payments: IncomingPayment[] = Array.isArray(req.body?.payments) ? req.body.payments : [];
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (!inv || !inv.invoiceNumber) {
      return res.status(400).json({ error: "invoice.invoiceNumber is required" });
    }
    if (inv.invoiceType !== undefined && !VALID_INVOICE_TYPES.has(inv.invoiceType)) {
      return res.status(400).json({ error: `invoice.invoiceType must be 'sale' or 'purchase' (got '${inv.invoiceType}')` });
    }

    const invId = inv.id ?? randomUUID();

    await client.query("BEGIN");
    await client.query(INSERT_INV_SQL, invValues(invId, tenantId, inv));
    for (let i = 0; i < items.length; i++) {
      await client.query(INSERT_ITEM_SQL, itemValues(invId, tenantId, items[i], i));
    }
    for (let i = 0; i < payments.length; i++) {
      await client.query(INSERT_PAY_SQL, payValues(invId, tenantId, payments[i], i));
    }
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'invoice',$4,'create',NULL,$5,$6)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), invId,
        JSON.stringify({ invoice: inv, itemCount: items.length, paymentCount: payments.length }),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const persisted = await query<Record<string, unknown>>(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`, [invId, tenantId],
    );
    const { items: pItems, payments: pPays } = await fetchChildren(tenantId, invId);
    return res.status(201).json({
      ...rowToApi(persisted[0]),
      items: pItems.map(rowToApi),
      paymentHistory: pPays.map(rowToApi),
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("invoices CREATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const inv: Partial<IncomingInvoice> = req.body?.invoice ?? {};
    const items: IncomingItem[] | undefined = Array.isArray(req.body?.items) ? req.body.items : undefined;
    const payments: IncomingPayment[] | undefined = Array.isArray(req.body?.payments) ? req.body.payments : undefined;
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (inv.invoiceType !== undefined && !VALID_INVOICE_TYPES.has(inv.invoiceType)) {
      return res.status(400).json({ error: `invoice.invoiceType must be 'sale' or 'purchase' (got '${inv.invoiceType}')` });
    }

    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;
    const jeUsesArIncoming = pickJeUsesAr(inv);

    const bankIdsParam = inv.bankAccountIds === undefined
      ? before.bank_account_ids
      : (inv.bankAccountIds === null ? null : (Array.isArray(inv.bankAccountIds) ? inv.bankAccountIds : null));

    const updated = await client.query(
      `UPDATE invoices SET
         invoice_number   = COALESCE($1, invoice_number),
         invoice_title    = COALESCE($2, invoice_title),
         invoice_type     = COALESCE($3, invoice_type),
         invoice_date     = COALESCE($4, invoice_date),
         due_date         = COALESCE($5, due_date),
         customer         = COALESCE($6, customer),
         customer_id      = COALESCE($7, customer_id),
         buyer_address    = COALESCE($8, buyer_address),
         buyer_town       = COALESCE($9, buyer_town),
         buyer_phone      = COALESCE($10, buyer_phone),
         buyer_email      = COALESCE($11, buyer_email),
         sales_officer    = COALESCE($12, sales_officer),
         status           = COALESCE($13, status),
         sale_status      = $14,
         stock_received   = $15,
         payment_method   = COALESCE($16, payment_method),
         payment_terms    = COALESCE($17, payment_terms),
         bank_details     = COALESCE($18, bank_details),
         bank_account_ids = $19,
         amount_paid      = COALESCE($20, amount_paid),
         paid_at          = COALESCE($21, paid_at),
         tax_rate         = COALESCE($22, tax_rate),
         pricing_mode     = $23,
         shipping_fee     = COALESCE($24, shipping_fee),
         handling_fee     = COALESCE($25, handling_fee),
         shipping_method  = COALESCE($26, shipping_method),
         agent_id         = $27,
         agent_name       = $28,
         notes            = COALESCE($29, notes),
         agreement        = COALESCE($30, agreement),
         invoice_footer   = COALESCE($31, invoice_footer),
         memo_no          = COALESCE($32, memo_no),
         invoice_docs     = $33,
         stock_deducted   = COALESCE($34, stock_deducted),
         je_id            = $35,
         je_uses_ar       = $36,
         updated_at       = NOW()
       WHERE id = $37 AND tenant_id = $38
       RETURNING *`,
      [
        inv.invoiceNumber ?? null,
        inv.invoiceTitle  ?? null,
        inv.invoiceType   ?? null,
        inv.invoiceDate   ?? null,
        inv.dueDate       ?? null,
        inv.customer      ?? null,
        inv.customerId    ?? null,
        inv.buyerAddress  ?? null,
        inv.buyerTown     ?? null,
        inv.buyerPhone    ?? null,
        inv.buyerEmail    ?? null,
        inv.salesOfficer  ?? null,
        inv.status        ?? null,
        inv.saleStatus    !== undefined ? inv.saleStatus    : before.sale_status,
        inv.stockReceived !== undefined ? inv.stockReceived : before.stock_received,
        inv.paymentMethod ?? null,
        inv.paymentTerms  ?? null,
        inv.bankDetails   ?? null,
        bankIdsParam,
        inv.amountPaid !== undefined ? toStr(inv.amountPaid) : null,
        inv.paidAt        ?? null,
        inv.taxRate !== undefined ? toStr(inv.taxRate) : null,
        inv.pricingMode   !== undefined ? inv.pricingMode   : before.pricing_mode,
        inv.shippingFee !== undefined ? toStr(inv.shippingFee) : null,
        inv.handlingFee !== undefined ? toStr(inv.handlingFee) : null,
        inv.shippingMethod ?? null,
        inv.agentId       !== undefined ? inv.agentId       : before.agent_id,
        inv.agentName     !== undefined ? inv.agentName     : before.agent_name,
        inv.notes         ?? null,
        inv.agreement     ?? null,
        inv.invoiceFooter ?? null,
        inv.memoNo        !== undefined ? inv.memoNo        : before.memo_no,
        // JSONB round-trip: when keeping the existing value, re-stringify it —
        // node-pg returns JSONB as a parsed JS array/object, and binding a raw
        // JS array to a JSONB column makes the driver treat it as TEXT[].
        inv.invoiceDocs === undefined
          ? (before.invoice_docs == null ? null : JSON.stringify(before.invoice_docs))
          : (inv.invoiceDocs === null ? null : JSON.stringify(inv.invoiceDocs)),
        inv.stockDeducted !== undefined ? inv.stockDeducted === true : null,
        inv.jeId          !== undefined ? inv.jeId          : before.je_id,
        jeUsesArIncoming  !== undefined ? jeUsesArIncoming  : before.je_uses_ar,
        req.params.id, tenantId,
      ],
    );

    if (items) {
      await client.query(
        `DELETE FROM invoice_items WHERE invoice_id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId],
      );
      for (let i = 0; i < items.length; i++) {
        await client.query(INSERT_ITEM_SQL, itemValues(req.params.id, tenantId, items[i], i));
      }
    }
    if (payments) {
      await client.query(
        `DELETE FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId],
      );
      for (let i = 0; i < payments.length; i++) {
        await client.query(INSERT_PAY_SQL, payValues(req.params.id, tenantId, payments[i], i));
      }
    }

    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'invoice',$4,'update',$5,$6,$7)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before), JSON.stringify(updated.rows[0]),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const { items: pItems, payments: pPays } = await fetchChildren(tenantId, req.params.id);
    return res.json({
      ...rowToApi(updated.rows[0]),
      items: pItems.map(rowToApi),
      paymentHistory: pPays.map(rowToApi),
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("invoices UPDATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE — CASCADE removes items + payments
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;

    // Backend financial-integrity guard — mirrors `_invoiceFinancialBlockers`
    // on the frontend (see replit.md). Refuses delete if the invoice is paid,
    // has any payment-history rows, or is linked to a journal entry. The user
    // must remove the underlying JE / voucher first.
    const amountPaid = Number(before.amount_paid ?? 0);
    const jeId = before.je_id;
    const blockers: string[] = [];
    if (amountPaid > 0) blockers.push(`amount_paid=${before.amount_paid}`);
    if (typeof jeId === "string" && jeId) blockers.push(`linked to JE ${jeId}`);
    const [payCount] = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    ).then(r => r.rows);
    if (payCount && parseInt(payCount.count, 10) > 0) {
      blockers.push(`${payCount.count} payment record(s) in history`);
    }
    if (blockers.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `Cannot delete invoice: ${blockers.join(", ")}. Remove the underlying journal entry / voucher first.`,
      });
    }

    await client.query(`DELETE FROM invoices WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'invoice',$4,'delete',$5,NULL,$6)`,
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
    console.error("invoices DELETE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
