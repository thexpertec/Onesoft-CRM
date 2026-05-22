import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { pool, query } from "../lib/db.js";
import { httpStatusFor, rowToApi } from "../lib/records.js";

/**
 * Purchase Orders — parent + line items pattern (mirrors journal-entries.ts).
 *
 * Routes:
 *   GET    /                ?tenantId=...           list (items included)
 *   GET    /:id             ?tenantId=...           one  (items included)
 *   POST   /                body: { tenantId, po: {...}, items: [{...}] }
 *                           Single transaction: INSERT po + N items + audit_log.
 *   PUT    /:id             body: { tenantId, po: {...}, items: [{...}] }
 *                           Replaces items wholesale (delete + reinsert).
 *   DELETE /:id             ?tenantId=...
 *                           CASCADE removes items via composite FK.
 *
 * No business-logic guards (stock reversal, JE unlinking) are enforced here —
 * those still live in the frontend `deletePurchaseOrder` blocker code. This
 * endpoint is the raw persistence layer used during the KV→relational cutover.
 */

const router: IRouter = Router();

interface IncomingItem {
  id?: string;
  itemType?: string;
  rmId?: string | null;
  productName?: string;
  sku?: string;
  qty?: string | number;
  unit?: string;
  unitPrice?: string | number;
  notes?: string;
  lineOrder?: number;
}

interface IncomingPO {
  id?: string;
  poNumber: string;
  supplier?: string;
  orderDate?: string;
  deliveryDate?: string;
  status?: string;
  notes?: string;
  jeId?: string | null;
}

function num(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string" && v) { const n = Number(v); return isFinite(n) ? n : 0; }
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
    const pos = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_orders WHERE tenant_id = $1 AND archived_at IS NULL
       ORDER BY order_date DESC, created_at DESC`,
      [tenantId],
    );
    const ids = pos.map((p) => p.id as string);
    const items = ids.length === 0
      ? []
      : await query<Record<string, unknown>>(
          `SELECT * FROM purchase_order_items
           WHERE tenant_id = $1 AND po_id = ANY($2::text[])
           ORDER BY po_id, line_order`,
          [tenantId, ids],
        );
    const itemsByPo = new Map<string, Record<string, unknown>[]>();
    for (const it of items) {
      const k = it.po_id as string;
      const arr = itemsByPo.get(k) ?? [];
      arr.push(rowToApi(it));
      itemsByPo.set(k, arr);
    }
    return res.json({
      items: pos.map((p) => ({
        ...rowToApi(p),
        items: itemsByPo.get(p.id as string) ?? [],
      })),
    });
  } catch (err) {
    console.error("purchase-orders LIST error", err);
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
    const pos = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.params.id, tenantId],
    );
    if (pos.length === 0) return res.status(404).json({ error: "Not found" });
    const items = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_order_items
       WHERE tenant_id = $1 AND po_id = $2
       ORDER BY line_order`,
      [tenantId, req.params.id],
    );
    return res.json({ ...rowToApi(pos[0]), items: items.map(rowToApi) });
  } catch (err) {
    console.error("purchase-orders GET error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// CREATE
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId: string = req.body?.tenantId;
    const po: IncomingPO = req.body?.po;
    const items: IncomingItem[] = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    if (!po || !po.poNumber) {
      return res.status(400).json({ error: "po.poNumber is required" });
    }

    const poId = po.id ?? randomUUID();

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO purchase_orders
        (id, tenant_id, po_number, supplier, order_date, delivery_date,
         status, notes, je_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        poId, tenantId, po.poNumber, po.supplier ?? "",
        po.orderDate ?? "", po.deliveryDate ?? "",
        po.status ?? "Draft", po.notes ?? "", po.jeId ?? null,
      ],
    );

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await client.query(
        `INSERT INTO purchase_order_items
          (id, tenant_id, po_id, item_type, rm_id, product_name, sku,
           qty, unit, unit_price, notes, line_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          it.id ?? randomUUID(), tenantId, poId,
          it.itemType ?? "product", it.rmId ?? null,
          it.productName ?? "", it.sku ?? "",
          num(it.qty), it.unit ?? "", num(it.unitPrice),
          it.notes ?? "",
          typeof it.lineOrder === "number" ? it.lineOrder : i,
        ],
      );
    }

    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'purchase_order',$4,'create',NULL,$5,$6)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), poId,
        JSON.stringify({ po, itemCount: items.length }),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const persistedPo = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
      [poId, tenantId],
    );
    const persistedItems = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_order_items
       WHERE tenant_id = $1 AND po_id = $2 ORDER BY line_order`,
      [tenantId, poId],
    );
    return res.status(201).json({
      ...rowToApi(persistedPo[0]),
      items: persistedItems.map(rowToApi),
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("purchase-orders CREATE error", err);
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
    const po: Partial<IncomingPO> = req.body?.po ?? {};
    const items: IncomingItem[] | undefined = Array.isArray(req.body?.items) ? req.body.items : undefined;
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });

    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;

    const updated = await client.query(
      `UPDATE purchase_orders SET
         po_number     = COALESCE($1, po_number),
         supplier      = COALESCE($2, supplier),
         order_date    = COALESCE($3, order_date),
         delivery_date = COALESCE($4, delivery_date),
         status        = COALESCE($5, status),
         notes         = COALESCE($6, notes),
         je_id         = $7,
         updated_at    = NOW()
       WHERE id = $8 AND tenant_id = $9
       RETURNING *`,
      [
        po.poNumber     ?? null,
        po.supplier     ?? null,
        po.orderDate    ?? null,
        po.deliveryDate ?? null,
        po.status       ?? null,
        po.notes        ?? null,
        po.jeId !== undefined ? po.jeId : before.je_id,
        req.params.id, tenantId,
      ],
    );

    if (items) {
      await client.query(
        `DELETE FROM purchase_order_items WHERE po_id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId],
      );
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await client.query(
          `INSERT INTO purchase_order_items
            (id, tenant_id, po_id, item_type, rm_id, product_name, sku,
             qty, unit, unit_price, notes, line_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            it.id ?? randomUUID(), tenantId, req.params.id,
            it.itemType ?? "product", it.rmId ?? null,
            it.productName ?? "", it.sku ?? "",
            num(it.qty), it.unit ?? "", num(it.unitPrice),
            it.notes ?? "",
            typeof it.lineOrder === "number" ? it.lineOrder : i,
          ],
        );
      }
    }

    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'purchase_order',$4,'update',$5,$6,$7)`,
      [
        randomUUID(), tenantId,
        actorOf(req.headers as Record<string, unknown>), req.params.id,
        JSON.stringify(before), JSON.stringify(updated.rows[0]),
        requestIdOf(req.headers as Record<string, unknown>),
      ],
    );
    await client.query("COMMIT");

    const persistedItems = await query<Record<string, unknown>>(
      `SELECT * FROM purchase_order_items
       WHERE tenant_id = $1 AND po_id = $2 ORDER BY line_order`,
      [tenantId, req.params.id],
    );
    return res.json({ ...rowToApi(updated.rows[0]), items: persistedItems.map(rowToApi) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("purchase-orders UPDATE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE — CASCADE removes items via composite FK
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.query.tenantId;
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    await client.query("BEGIN");
    const beforeRes = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, tenantId],
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    const before = beforeRes.rows[0] as Record<string, unknown>;
    await client.query(
      `DELETE FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    await client.query(
      `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json, request_id)
       VALUES ($1,$2,$3,'purchase_order',$4,'delete',$5,NULL,$6)`,
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
    console.error("purchase-orders DELETE error", err);
    return res.status(httpStatusFor(err)).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
