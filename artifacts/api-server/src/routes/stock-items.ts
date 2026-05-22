import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "stock_items",
  entityType: "stock_item",
  writableColumns: [
    "product_name", "sku", "store", "stock_type", "quantity", "min_level",
    "unit", "hold_customer", "hold_reason", "notes",
  ],
  /**
   * Mirrors the frontend `_stockItemFinancialBlockers`: a stock balance row
   * cannot be removed while its corresponding ledger history exists. Match
   * is on `stock_ledger.entity_id = stock_item.id` (the FE uses the same
   * key — stock balances are addressed by their own id, not the product id).
   */
  deleteBlockers: async (client, tenantId, before) => {
    const blockers: string[] = [];
    const id = typeof before.id === "string" ? before.id : "";
    if (!id) return blockers;
    const r = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM stock_ledger WHERE tenant_id = $1 AND entity_id = $2`,
      [tenantId, id],
    );
    const n = parseInt(r.rows[0]?.c ?? "0", 10);
    if (n > 0) blockers.push(`${n} stock ledger entry record(s)`);
    return blockers;
  },
});

export default router;
