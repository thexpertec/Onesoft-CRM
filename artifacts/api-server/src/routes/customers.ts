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
});

export default router;
