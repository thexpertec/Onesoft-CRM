import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "products",
  entityType: "product",
  writableColumns: [
    "name", "local_name", "model", "sku", "barcode",
    "brand", "category", "subcategory", "sub_subcategory", "department",
    "unit",
    "purchase_price", "cost_price", "price", "wholesale_price",
    "commission_pct", "opening_stock", "stock_alert_value",
    "description", "meta_title", "meta_description",
    "status", "condition", "thumbnail", "images",
    "show_on_web", "website_price", "website_price_was",
    "clubcard_price", "clubcard_bogo",
    "product_attributes", "variants",
  ],
  /**
   * Mirrors the frontend `_productFinancialBlockers`:
   *   - sale_items by sku OR product_name (case-insensitive)
   *   - invoice_items by sku OR product_name
   *   - purchase_order_items by sku OR product_name
   *   - sale_return_items by sku OR product_name
   *   - purchase_return_items by sku OR product_name
   *   - stock_ledger where entity_type='product' and entity_name matches name
   *
   * SKU set = product.sku ∪ every variants[*].sku (variants is jsonb). All checks
   * are tenant-scoped via `tenant_id` on each item table — no joins required.
   * Manufacturing-orders / recipes blockers (present in FE) are intentionally
   * skipped: those tables don't exist in PostgreSQL yet.
   */
  deleteBlockers: async (client, tenantId, before) => {
    const blockers: string[] = [];
    const name = typeof before.name === "string" ? before.name.trim() : "";
    const nameL = name.toLowerCase();
    const skuSet = new Set<string>();
    const pSku = typeof before.sku === "string" ? before.sku.trim().toLowerCase() : "";
    if (pSku) skuSet.add(pSku);
    const variants = Array.isArray(before.variants) ? before.variants : [];
    for (const v of variants) {
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).sku === "string") {
        const s = ((v as Record<string, unknown>).sku as string).trim().toLowerCase();
        if (s) skuSet.add(s);
      }
    }
    const skus = Array.from(skuSet);

    /**
     * Item-table check template. We COUNT(DISTINCT parent_id) so the blocker
     * message mirrors the FE document count (e.g. "2 sale(s)") rather than
     * the raw line count (which would be inflated when one document has
     * multiple lines for the same SKU). Table names and parent FK columns
     * are a closed const list — no user input can reach the interpolated
     * identifier, but kept here as literals to keep that invariant obvious.
     */
    const ITEM_CHECKS = [
      { table: "sale_items",            parent: "sale_id",   label: "sale(s)" },
      { table: "invoice_items",         parent: "invoice_id", label: "invoice(s)" },
      { table: "purchase_order_items",  parent: "po_id",     label: "purchase order(s)" },
      { table: "sale_return_items",     parent: "return_id", label: "sale return(s)" },
      { table: "purchase_return_items", parent: "return_id", label: "purchase return(s)" },
    ] as const;

    for (const { table, parent, label } of ITEM_CHECKS) {
      const r = await client.query<{ c: string }>(
        `SELECT COUNT(DISTINCT ${parent})::text AS c FROM ${table}
         WHERE tenant_id = $1
           AND ( ($2::text[] IS NOT NULL AND lower(sku) = ANY($2::text[]))
                 OR ($3 <> '' AND lower(product_name) = $3) )`,
        [tenantId, skus.length ? skus : null, nameL],
      );
      const n = parseInt(r.rows[0]?.c ?? "0", 10);
      if (n > 0) blockers.push(`${n} ${label} containing this product`);
    }

    if (nameL) {
      const led = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM stock_ledger
         WHERE tenant_id = $1 AND entity_type = 'product' AND lower(entity_name) = $2`,
        [tenantId, nameL],
      );
      const nl = parseInt(led.rows[0]?.c ?? "0", 10);
      if (nl > 0) blockers.push(`${nl} stock ledger entry record(s) for this product`);
    }

    return blockers;
  },
});

export default router;
