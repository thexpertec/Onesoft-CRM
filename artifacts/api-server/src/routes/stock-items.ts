import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "stock_items",
  entityType: "stock_item",
  writableColumns: [
    "product_name", "sku", "store", "stock_type", "quantity", "min_level",
    "unit", "hold_customer", "hold_reason", "notes",
  ],
});

export default router;
