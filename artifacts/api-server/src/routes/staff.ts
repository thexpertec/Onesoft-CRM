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
});

export default router;
