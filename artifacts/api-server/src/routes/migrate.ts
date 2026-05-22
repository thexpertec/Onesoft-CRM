import { Router } from "express";
import { migrateTenant } from "../lib/migrate-tenant.js";
import { query } from "../lib/db.js";

const router = Router();

/**
 * GET /api/migrate/tenant/:tenantId/status
 * Returns a live comparison of how many accounts/JEs exist in the KV blob vs
 * the relational tables, so the dashboard can show whether migration is needed.
 */
router.get("/tenant/:tenantId/status", async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const [accRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM accounts WHERE tenant_id = $1`,
      [tenantId],
    );
    const [jeRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM journal_entries WHERE tenant_id = $1`,
      [tenantId],
    );
    const [custRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM customers WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [prodRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM products WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [brandRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM brands WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [pcRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM product_categories WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [unitRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM units WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [attrRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM attributes WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [leadRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM leads WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [deptRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM departments WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [desigRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM designations WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [cityRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cities WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [areaRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM areas WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [reqDocRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM requirement_docs WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [stockRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM stock_items WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [ledgerRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM stock_ledger WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [poRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM purchase_orders WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [salesRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM sales WHERE tenant_id = $1 AND archived_at IS NULL`,
      [tenantId],
    );
    const [kvAccRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-chart-of-accounts' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvJeRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-journal-entries' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvCustRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-customers' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvProdRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-products' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvBrandRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-brands' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvPcRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-product-categories' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvUnitRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-units' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvAttrRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-attributes' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvLeadRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-leads' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvDeptRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-hrm-departments' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvDesigRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-hrm-designations' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvCityRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-cities' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvAreaRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-areas' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvReqDocRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-req-docs' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvStockRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-stock' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvLedgerRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-stock-ledger' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvPoRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-purchase-orders' LIMIT 1`,
      [`t:${tenantId}`],
    );
    const [kvSalesRow] = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'admin-sales' LIMIT 1`,
      [`t:${tenantId}`],
    );

    const parseCount = (raw: unknown): number => {
      if (raw == null) return 0;
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr.length : 0;
    };

    res.json({
      tenantId,
      db: {
        accounts:          parseInt(accRow?.count    ?? "0", 10),
        journalEntries:    parseInt(jeRow?.count     ?? "0", 10),
        customers:         parseInt(custRow?.count   ?? "0", 10),
        products:          parseInt(prodRow?.count   ?? "0", 10),
        brands:            parseInt(brandRow?.count  ?? "0", 10),
        productCategories: parseInt(pcRow?.count     ?? "0", 10),
        units:             parseInt(unitRow?.count   ?? "0", 10),
        attributes:        parseInt(attrRow?.count   ?? "0", 10),
        leads:             parseInt(leadRow?.count    ?? "0", 10),
        departments:       parseInt(deptRow?.count    ?? "0", 10),
        designations:      parseInt(desigRow?.count   ?? "0", 10),
        cities:            parseInt(cityRow?.count    ?? "0", 10),
        areas:             parseInt(areaRow?.count    ?? "0", 10),
        requirementDocs:   parseInt(reqDocRow?.count  ?? "0", 10),
        stockItems:        parseInt(stockRow?.count   ?? "0", 10),
        stockLedger:       parseInt(ledgerRow?.count  ?? "0", 10),
        purchaseOrders:    parseInt(poRow?.count      ?? "0", 10),
        sales:             parseInt(salesRow?.count   ?? "0", 10),
      },
      kv: {
        accounts:          parseCount(kvAccRow?.value),
        journalEntries:    parseCount(kvJeRow?.value),
        customers:         parseCount(kvCustRow?.value),
        products:          parseCount(kvProdRow?.value),
        brands:            parseCount(kvBrandRow?.value),
        productCategories: parseCount(kvPcRow?.value),
        units:             parseCount(kvUnitRow?.value),
        attributes:        parseCount(kvAttrRow?.value),
        leads:             parseCount(kvLeadRow?.value),
        departments:       parseCount(kvDeptRow?.value),
        designations:      parseCount(kvDesigRow?.value),
        cities:            parseCount(kvCityRow?.value),
        areas:             parseCount(kvAreaRow?.value),
        requirementDocs:   parseCount(kvReqDocRow?.value),
        stockItems:        parseCount(kvStockRow?.value),
        stockLedger:       parseCount(kvLedgerRow?.value),
        purchaseOrders:    parseCount(kvPoRow?.value),
        sales:             parseCount(kvSalesRow?.value),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/migrate/tenant/:tenantId/dry-run
 * Returns counts of what *would* be inserted without touching the DB.
 */
router.post("/tenant/:tenantId/dry-run", async (req, res, next) => {
  try {
    const result = await migrateTenant(req.params.tenantId, true);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/migrate/tenant/:tenantId
 * Runs the full migration (idempotent — skips rows that already exist).
 */
router.post("/tenant/:tenantId", async (req, res, next) => {
  try {
    const result = await migrateTenant(req.params.tenantId, false);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
