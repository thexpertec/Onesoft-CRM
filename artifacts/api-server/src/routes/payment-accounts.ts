import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "payment_accounts",
  entityType: "payment_account",
  writableColumns: [
    "account_title",
    "bank_name",
    "payment_method",
    "iban",
    "description",
    "is_active",
    "ledger_account_id",
  ],
});

export default router;
