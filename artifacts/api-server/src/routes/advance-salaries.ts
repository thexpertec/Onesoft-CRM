import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "advance_salaries",
  entityType: "advance_salary",
  writableColumns: [
    "staff_id",
    "staff_name",
    "staff_role",
    "amount",
    "deduct_month",
    "pay_via",
    "payment_account_id",
    "status",
    "applied_on",
    "notes",
    "approved_by",
  ],
});

export default router;
