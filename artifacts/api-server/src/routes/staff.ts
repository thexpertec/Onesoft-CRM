import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "staff",
  entityType: "staff",
  writableColumns: [
    "name", "father_name", "department", "designation", "role", "status",
    "email", "phone", "join_date", "leaving_date", "notes",
    "opening_balance", "salary_type", "basic_salary", "allowances", "deductions",
    "bank_name", "account_number", "username", "password_hash", "login_enabled",
    "ledger_account_id", "staff_payable_ledger_id",
  ],
  /**
   * Mirrors `_staffFinancialBlockers` (store.ts ~line 1741), restricted to
   * checks whose tables actually exist in PostgreSQL today:
   *   - rp_vouchers by party_name (case-insensitive, matches FE trim+lower)
   *   - journal_entry_lines by ledger_account_id IN
   *       (staff.ledger_account_id, staff.staff_payable_ledger_id)
   *       — uses COUNT(DISTINCT journal_entry_id) for true document count.
   *
   * Intentionally skipped (tables not yet migrated from KV):
   *   salary_slips, advance_salaries, attendance_records. Same pattern as
   *   products → manufacturing_orders/recipes skip in Step 16.
   */
  deleteBlockers: async (client, tenantId, before) => {
    const blockers: string[] = [];
    const name = typeof before.name === "string" ? before.name.trim() : "";
    const ledgerA = typeof before.ledger_account_id === "string" ? before.ledger_account_id : "";
    const ledgerB = typeof before.staff_payable_ledger_id === "string" ? before.staff_payable_ledger_id : "";

    if (name) {
      // Matches FE: (v.partyName ?? "").trim().toLowerCase() === s.name.trim().toLowerCase()
      const vs = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM rp_vouchers
         WHERE tenant_id = $1 AND lower(btrim(party_name)) = $2`,
        [tenantId, name.toLowerCase()],
      );
      const nv = parseInt(vs.rows[0]?.c ?? "0", 10);
      if (nv > 0) blockers.push(`${nv} payment voucher(s)`);
    }

    const ledgerIds = [ledgerA, ledgerB].filter(x => !!x);
    if (ledgerIds.length > 0) {
      const jes = await client.query<{ c: string }>(
        `SELECT COUNT(DISTINCT journal_entry_id)::text AS c FROM journal_entry_lines
         WHERE tenant_id = $1 AND ledger_account_id = ANY($2::text[])`,
        [tenantId, ledgerIds],
      );
      const nj = parseInt(jes.rows[0]?.c ?? "0", 10);
      if (nj > 0) blockers.push(`${nj} journal entry record(s) on this staff member's ledger(s)`);
    }

    return blockers;
  },
});

export default router;
