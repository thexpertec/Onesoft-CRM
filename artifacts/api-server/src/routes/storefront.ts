import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { pool, query } from "../lib/db.js";
import { rowToApi } from "../lib/records.js";

/**
 * Storefront write surface (anonymous).
 *
 * Replaces the storefront's previous direct write to
 * `PUT /api/kv/t:{tid}/admin-sales` (which required dumping the entire sales
 * array client-side and accepting a read-modify-write race). The new endpoint
 * inserts a single sale + its line items atomically in a transaction, then
 * appends the order envelope to the `online-orders` kv key for the admin's
 * order management view.
 *
 * Routes:
 *   POST  /place-order   { tenantId, sale, items, order? } -> { ok, sale }
 *
 * SECURITY NOTE: This endpoint is anonymous. It must remain narrow in scope
 * (sale insert only; no update / delete / list). Rate limiting + per-IP
 * throttling are deferred to the broader auth epic.
 */

const router: IRouter = Router();

function toStr(v: unknown, dflt = ""): string {
  if (v === null || v === undefined) return dflt;
  if (typeof v === "number") return String(v);
  return String(v);
}

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
  saleMode?: string | null;
  deliveryStatus?: string | null;
  deliveryCharges?: string | number | null;
  invoiceDiscount?: string | number | null;
  invoiceDiscountType?: string | null;
  orderType?: string | null;
  onlineCustomer?: string | null;
}

router.post("/place-order", async (req, res) => {
  // Validate first so we don't acquire a pool client on a bad request
  // (and so the finally-block release isn't paired with an early release —
  // architect-flagged double-release bug, May 2026).
  const tenantId = String(req.body?.tenantId ?? "");
  const sale = req.body?.sale as IncomingSale | undefined;
  const items: IncomingItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
  const order = req.body?.order;
  if (!tenantId || !sale?.saleNumber) {
    return res.status(400).json({ ok: false, error: "tenantId and sale.saleNumber required" });
  }
  const saleId = sale.id ?? randomUUID();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO sales (
         id, tenant_id, sale_number, sale_date, customer, status,
         payment_method, notes, tax_rate, amount_paid, paid_at,
         stock_deducted, je_id, agent_id, agent_name, sale_mode,
         delivery_status, delivery_charges, invoice_discount,
         invoice_discount_type, order_type, online_customer
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        saleId, tenantId, sale.saleNumber,
        sale.saleDate ?? "", sale.customer ?? "",
        sale.status ?? "Pending", sale.paymentMethod ?? "", sale.notes ?? "",
        toStr(sale.taxRate, "0"), toStr(sale.amountPaid, "0"), sale.paidAt ?? "",
        sale.stockDeducted === true,
        null, null, null,
        sale.saleMode ?? null, sale.deliveryStatus ?? null,
        sale.deliveryCharges != null ? toStr(sale.deliveryCharges) : null,
        sale.invoiceDiscount != null ? toStr(sale.invoiceDiscount) : null,
        sale.invoiceDiscountType ?? null, sale.orderType ?? null, sale.onlineCustomer ?? null,
      ],
    );
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      await client.query(
        `INSERT INTO sale_items
           (id, tenant_id, sale_id, product_name, local_name, sku, qty, unit,
            unit_price, discount, discount_type, notes, item_status, bogo_applied,
            variant_label, cost_price, purchase_unit, conversion_factor, line_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          it.id ?? randomUUID(), tenantId, saleId,
          it.productName ?? "", it.localName ?? null, it.sku ?? "",
          toStr(it.qty, "0"), it.unit ?? "", toStr(it.unitPrice, "0"),
          toStr(it.discount, "0"), it.discountType ?? null,
          it.notes ?? "", it.itemStatus ?? "Pending",
          it.bogoApplied === true,
          it.variantLabel ?? null,
          it.costPrice != null ? toStr(it.costPrice) : null,
          it.purchaseUnit ?? null,
          it.conversionFactor != null ? toStr(it.conversionFactor) : null,
          typeof it.lineOrder === "number" ? it.lineOrder : i,
        ],
      );
    }
    await client.query("COMMIT");

    // Append order envelope to `online-orders` kv (non-fatal; the sale is the
    // canonical record — online-orders is just the admin's "view of recent
    // online orders" surface).
    if (order) {
      try {
        const ns = `t:${tenantId}`;
        const existingRows = await query<{ value: unknown }>(
          `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'online-orders'`,
          [ns],
        );
        const arr = existingRows.length > 0 && Array.isArray(existingRows[0]!.value)
          ? (existingRows[0]!.value as unknown[])
          : [];
        await query(
          `INSERT INTO kv_store (namespace, key, value, updated_at)
           VALUES ($1, 'online-orders', $2, NOW())
           ON CONFLICT (namespace, key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [ns, JSON.stringify([...arr, order])],
        );
      } catch (err) {
        console.warn("[storefront] place-order: online-orders append failed (non-fatal)", err);
      }
    }

    const persisted = await query<Record<string, unknown>>(
      `SELECT * FROM sales WHERE id = $1 AND tenant_id = $2`, [saleId, tenantId],
    );
    return res.status(201).json({ ok: true, sale: persisted[0] ? rowToApi(persisted[0]) : null });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[storefront] place-order error", err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
