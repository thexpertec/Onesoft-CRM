import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "product_categories",
  entityType: "product_category",
  writableColumns: ["name", "description", "color", "parent_id"],
  /**
   * Mirrors the frontend `_categoryFinancialBlockers`:
   *   - products.category = name (FE uses exact string equality)
   *   - journal_entry_lines.ledger_account_id IN
   *       (`sr-cat-{slug}`, `pur-cat-{slug}`, `inv-cat-{slug}`)
   *     where slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-")
   *           trimmed of leading/trailing dashes, or "uncategorised" if empty.
   *     These three ledger ids are auto-derived from category name by the FE
   *     COA seed for sale-returns / purchase / invoice posting groupings.
   */
  deleteBlockers: async (client, tenantId, before) => {
    const blockers: string[] = [];
    const rawName = typeof before.name === "string" ? before.name : "";
    if (!rawName) return blockers;

    // FE uses strict `p.category === c.name` (raw, untrimmed) for the
    // products-by-category check, so we match on the raw stored name to
    // avoid divergence on whitespace-edge category names.
    const prods = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM products WHERE tenant_id = $1 AND category = $2`,
      [tenantId, rawName],
    );
    const np = parseInt(prods.rows[0]?.c ?? "0", 10);
    if (np > 0) blockers.push(`${np} product(s) using this category`);

    // Slug derivation does trim — mirrors FE `_categoryFinancialBlockers`.
    const slug = (rawName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "uncategorised";
    const catLedgerIds = [`sr-cat-${slug}`, `pur-cat-${slug}`, `inv-cat-${slug}`];
    const jes = await client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT journal_entry_id)::text AS c FROM journal_entry_lines
       WHERE tenant_id = $1 AND ledger_account_id = ANY($2::text[])`,
      [tenantId, catLedgerIds],
    );
    const nj = parseInt(jes.rows[0]?.c ?? "0", 10);
    if (nj > 0) blockers.push(`${nj} journal entry record(s) on this category's ledgers`);

    return blockers;
  },
});

export default router;
