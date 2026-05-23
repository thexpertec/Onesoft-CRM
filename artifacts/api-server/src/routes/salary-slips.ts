import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "salary_slips",
  entityType: "salary_slip",
  writableColumns: [
    "staff_id",
    "staff_name",
    "department",
    "designation",
    "role",
    "period",
    "salary_type",
    "basic_salary",
    "allowances",
    "deductions",
    "advance_salary",
    "gross_salary",
    "net_salary",
    "status",
    "payment_method",
    "payment_account_id",
    "paid_at",
    "amount_paid",
    "journal_entry_id",
    "accrual_journal_entry_id",
    "staff_payable_ledger_id",
    "notes",
  ],
});

export default router;
