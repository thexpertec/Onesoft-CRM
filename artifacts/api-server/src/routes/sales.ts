import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { pool, query } from "../lib/db.js";
import { httpStatusFor, rowToApi } from "../lib/records.js";

/**
 * Sales — parent + line items, mirrors purchase-orders.ts.
 *
 * Routes:
 *   GET    /                ?tenantId=...  list (items included)
 *   GET    /:id             ?tenantId=...  one  (items included)
 *   POST   /                body: { tenantId, sale: {...}, items: [{...}] }
 *   PUT    /:id             body: { tenantId, sale: {...}, items: [{...}] }
 *                           (items replaced wholesale, matching frontend
 *                           updateSale's full-rewrite semantics)
 *   DELETE /:id             ?tenantId=...  (CASCADE removes items)
 *
 * Business-logic guards (financial blockers, stock reversal, JE unlinking)
 * stay in the frontend `deleteSale` for now; this endpoint is the raw
 * persistence layer used during the KV→relational cutover.
 *
 * String-typed numerics (qty, unit_price, amount_paid, …) preserve the
 * frontend's "string-of-decimal" contract so values round-trip exactly.
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

interface IncomingSale {
  id?: string;
  saleNumber: string;
  saleDate?: string;
  customer?: string;
  status?: string;
  paymentMethod?: string;
  notes?: string;
  taxRate?: string | number;
  amountPaid?: string | number;
  paidAt?: string;
  stockDeducted?: boolean;
  jeId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  saleMode?: string | null;
  deliveryStatus?: string | null;
  deliveryCharges?: string | number | null;
  invoiceDiscount?: string | number | null;
  invoiceDiscountType?: string | null;
  orderType?: string | null;
  onlineCustomer?: string | null;
}

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

const SALE_COLS = [
  "id", "tenant_id", "sale_number", "sale_date", "customer", "status",
  "payment_method", "notes", "tax_rate", "amount_paid", "paid_at",
  "stock_deducted", "je_id", "agent_id", "agent_name", "sale_mode",
  "delivery_status", "delivery_charges", "invoice_discount",
  "invoice_discount_type", "order_type", "online_customer",
] as const;

function saleValues(saleId: string, tenantId: string, s: IncomingSale): unknown[] {
  return [
    saleId, tenantId, s.saleNumber,
    s.saleDate ?? "", s.customer ?? "",
    s.status ?? "Pending", s.paymentMethod ?? "", s.notes ?? "",
    toStr(s.taxRate, "0"), toStr(s.amountPaid, "0"), s.paidAt ?? "",
    s.stockDeducted === true,
    s.jeId ?? null, s.agentId ?? null, s.agentName ?? null,
    s.saleMode ?? null, s.deliveryStatus ?? null,
    s.deliveryCharges !== undefined && s.deliveryCharges !== null ? toStr(s.deliveryCharges) : null,
    s.invoiceDiscount !== undefined && s.invoiceDiscount !== null ? toStr(s.invoiceDiscount) : null,
    s.invoiceDiscountType ?? null, s.orderType ?? null, s.onlineCustomer ?? null,
  ];
}

function itemValues(saleId: string, tenantId: string, it: IncomingItem, lineNo: number): unknown[] {
  return [
    it.id ?? randomUUID(), tenantId, saleId,
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

const INSERT_SALE_SQL = `
  INSERT INTO sales (${SALE_COLS.join(", ")})
  VALUES (${SALE_COLS.map((_, i) => `$${i + 1}`).join(",")})
`;

const INSERT_ITEM_SQL = `
  INSERT INTO sale_items
    (id, tenant_id, sale_id, product_name, local_name, sku, qty, unit,
     unit_price, discount, discount_type, notes, item_status, bogo_applied,
     variant_label, cost_price, purchase_unit, conversion_factor, line_order)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
`;

// LIST
router.get("/", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    const sales = await query<Record<string, unknown>>(
      `SELECT * FROM sales WHERE tenant_id = $1 AND archived_at IS NULL
       ORDER BY sale_date DESC, created_at DESC`,
      [tenantId],
    );
    const ids = sales.map((s) => s.id as string);
    const items = ids.length === 0
      ? []
      : await query<Record<string, unknown>>(
          `SELECT * FROM sale_items
           WHERE tenant_id = $1 AND sale_id = ANY($2::text[])
           ORDER BY sale_id, line_order`,
          [tenantId, ids],
        );
    const itemsBySale = new Map<string, Record<string, unknown>[]>();
    for (const it of items) {
      const k = it.sale_id as string;
      const arr = itemsBySale.get(k) ?? [];
      arr.push(rowToApi(it));
      itemsBySale.set(k, arr);
    }
    return res.json({
      items: sales.map((s) => ({
        ...rowToApi(s),
        items: itemsBySale.get(s.id as string) ?? [],
      })),
    });
  } catch (err) {
    console.error("sales LIST error", err);
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
    const sales = await query<Record<string, unknown>>(
      `SELECT * FROM sales WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.params.id, tenantId],
    );
    if (sales.length === 0) return res.status(404).json({ error: "Not found" });
    const items = await query<Record<string, unknown>>(
      `SELECT * FROM sale_items WHERE tenant_id = $1 AND sale_id = $2 ORDER BY line_order`,
      [tenantId, req.params.id],
    );
    return res.json({ ...rowToApi(sales[0]), items: items.map(rowToApi) });
  } catch (err) {
    console.error("sales GET error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// CREATE
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const sale: IncomingSale = req.body?.sale;
    const items: IncomingItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (!sale || !sale.saleNumber) {
      return res.status(400).json({ error: "sale.saleNumber is required" });
    }

    const saleId = sale.id ?? randomUUID();

    await client.query("BEGIN");
    await client.query(INSERT_SALE_SQL, saleValues(saleId, tenantId, sale));
    for (let i = 0; i < items.length; i++) {
      await client.query(INSERT_ITEM_SQL, itemValues(saleId, tenantId, items[i], i));
    }
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'sale',$4,'create',NULL,$5,$6)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), saleId,
        JSON.stringify({ sale, itemCount: items.length }),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const persistedSale = await query<Record<string, unknown>>(
      `SELECT * FROM sales WHERE id = $1 AND tenant_id = $2`, [saleId, tenantId],
    );
    const persistedItems = await query<Record<string, unknown>>(
      `SELECT * FROM sale_items WHERE tenant_id = $1 AND sale_id = $2 ORDER BY line_order`,
      [tenantId, saleId],
    );
    return res.status(201).json({
      ...rowToApi(persistedSale[0]),
      items: persistedItems.map(rowToApi),
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("sales CREATE error", err);
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
    const sale: Partial<IncomingSale> = req.body?.sale ?? {};
    const items: IncomingItem[] | undefined = Array.isArray(req.body?.items) ? req.body.items : undefined;
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;

    const updated = await client.query(
      `UPDATE sales SET
         sale_number           = COALESCE($1, sale_number),
         sale_date             = COALESCE($2, sale_date),
         customer              = COALESCE($3, customer),
         status                = COALESCE($4, status),
         payment_method        = COALESCE($5, payment_method),
         notes                 = COALESCE($6, notes),
         tax_rate              = COALESCE($7, tax_rate),
         amount_paid           = COALESCE($8, amount_paid),
         paid_at               = COALESCE($9, paid_at),
         stock_deducted        = COALESCE($10, stock_deducted),
         je_id                 = $11,
         agent_id              = $12,
         agent_name            = $13,
         sale_mode             = $14,
         delivery_status       = $15,
         delivery_charges      = $16,
         invoice_discount      = $17,
         invoice_discount_type = $18,
         order_type            = $19,
         online_customer       = $20,
         updated_at            = NOW()
       WHERE id = $21 AND tenant_id = $22
       RETURNING *`,
      [
        sale.saleNumber    ?? null,
        sale.saleDate      ?? null,
        sale.customer      ?? null,
        sale.status        ?? null,
        sale.paymentMethod ?? null,
        sale.notes         ?? null,
        sale.taxRate    !== undefined ? toStr(sale.taxRate)    : null,
        sale.amountPaid !== undefined ? toStr(sale.amountPaid) : null,
        sale.paidAt        ?? null,
        sale.stockDeducted !== undefined ? sale.stockDeducted === true : null,
        sale.jeId        !== undefined ? sale.jeId        : before.je_id,
        sale.agentId     !== undefined ? sale.agentId     : before.agent_id,
        sale.agentName   !== undefined ? sale.agentName   : before.agent_name,
        sale.saleMode    !== undefined ? sale.saleMode    : before.sale_mode,
        sale.deliveryStatus  !== undefined ? sale.deliveryStatus  : before.delivery_status,
        sale.deliveryCharges !== undefined ? (sale.deliveryCharges === null ? null : toStr(sale.deliveryCharges)) : before.delivery_charges,
        sale.invoiceDiscount !== undefined ? (sale.invoiceDiscount === null ? null : toStr(sale.invoiceDiscount)) : before.invoice_discount,
        sale.invoiceDiscountType !== undefined ? sale.invoiceDiscountType : before.invoice_discount_type,
        sale.orderType       !== undefined ? sale.orderType       : before.order_type,
        sale.onlineCustomer  !== undefined ? sale.onlineCustomer  : before.online_customer,
        req.params.id, tenantId,
      ],
    );

    if (items) {
      await client.query(
        `DELETE FROM sale_items WHERE sale_id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId],
      );
      for (let i = 0; i < items.length; i++) {
        await client.query(INSERT_ITEM_SQL, itemValues(req.params.id, tenantId, items[i], i));
      }
    }

    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'sale',$4,'update',$5,$6,$7)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before), JSON.stringify(updated.rows[0]),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const persistedItems = await query<Record<string, unknown>>(
      `SELECT * FROM sale_items WHERE tenant_id = $1 AND sale_id = $2 ORDER BY line_order`,
      [tenantId, req.params.id],
    );
    return res.json({ ...rowToApi(updated.rows[0]), items: persistedItems.map(rowToApi) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("sales UPDATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE — CASCADE removes items
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;

    // Backend financial-integrity guard (defence-in-depth — frontend's
    // _saleFinancialBlockers already enforces this, but the API is callable
    // by non-UI clients too). Refuses delete if the sale is paid or linked
    // to a journal entry; the user must remove the JE / refund first, which
    // matches the documented reverse-cascade semantics in replit.md.
    const amountPaid = Number(before.amount_paid ?? 0);
    const jeId = before.je_id;
    const blockers: string[] = [];
    if (amountPaid > 0) blockers.push(`amount_paid=${before.amount_paid}`);
    if (typeof jeId === "string" && jeId) blockers.push(`linked to JE ${jeId}`);
    if (blockers.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `Cannot delete sale: ${blockers.join(", ")}. Remove the underlying journal entry / refund first.`,
      });
    }

    await client.query(`DELETE FROM sales WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'sale',$4,'delete',$5,NULL,$6)`,
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
    console.error("sales DELETE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
