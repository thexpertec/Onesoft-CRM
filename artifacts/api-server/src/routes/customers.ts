import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "customers",
  entityType: "customer",
  writableColumns: [
    "name", "company", "email", "phone", "industry",
    "city", "area", "billing_address", "shipping_address",
    "billing_address_details", "shipping_address_details",
    "status", "source", "customer_type", "customer_role", "lead_id",
    "customer_since", "total_value", "currency",
    "opening_balance", "advance_credit", "notes", "tags",
    "ledger_account_id", "advance_ledger_account_id", "supplier_products",
  ],
  /**
   * Mirrors the frontend `_customerFinancialBlockers`:
   *   - sales.customer = name
   *   - invoices.customer = name OR invoices.customer_id = id
   *   - purchase_orders.supplier = name   (only when customer_role = 'Supplier')
   *   - rp_vouchers.party_name = name
   *   - journal_entry_lines.ledger_account_id = ledger_account_id (when set)
   *
   * All checks tenant-scoped and parameterized. We rely on `name` matching
   * because every transactional row records the party as text — the FK-by-id
   * cutover hasn't completed for these tables yet. Returns descriptive
   * blocker strings so the 409 message is actionable.
   */
  deleteBlockers: async (client, tenantId, before) => {
    const blockers: string[] = [];
    const name           = typeof before.name === "string" ? before.name : "";
    const id             = typeof before.id   === "string" ? before.id   : "";
    const role           = typeof before.customer_role === "string" ? before.customer_role : "";
    const ledgerId       = typeof before.ledger_account_id === "string" ? before.ledger_account_id : "";

    if (name) {
      const sales = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM sales WHERE tenant_id = $1 AND customer = $2`,
        [tenantId, name],
      );
      const n = parseInt(sales.rows[0]?.c ?? "0", 10);
      if (n > 0) blockers.push(`${n} sale(s)`);

      const invs = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM invoices WHERE tenant_id = $1 AND (customer = $2 OR customer_id = $3)`,
        [tenantId, name, id],
      );
      const ni = parseInt(invs.rows[0]?.c ?? "0", 10);
      if (ni > 0) blockers.push(`${ni} invoice(s)`);

      if (role === "Supplier") {
        const pos = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM purchase_orders WHERE tenant_id = $1 AND supplier = $2`,
          [tenantId, name],
        );
        const np = parseInt(pos.rows[0]?.c ?? "0", 10);
        if (np > 0) blockers.push(`${np} purchase order(s)`);
      }

      const vs = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM rp_vouchers WHERE tenant_id = $1 AND party_name = $2`,
        [tenantId, name],
      );
      const nv = parseInt(vs.rows[0]?.c ?? "0", 10);
      if (nv > 0) blockers.push(`${nv} payment voucher(s)`);
    }

    if (ledgerId) {
      const jel = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM journal_entry_lines WHERE tenant_id = $1 AND ledger_account_id = $2`,
        [tenantId, ledgerId],
      );
      const nl = parseInt(jel.rows[0]?.c ?? "0", 10);
      if (nl > 0) blockers.push(`${nl} journal entry line(s) on this party's ledger`);
    }

    return blockers;
  },
});

export default router;
