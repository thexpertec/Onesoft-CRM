import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "products",
  entityType: "product",
  writableColumns: [
    "name", "local_name", "model", "sku", "barcode",
    "brand", "category", "subcategory", "sub_subcategory", "department",
    "unit",
    "purchase_price", "cost_price", "price", "wholesale_price",
    "commission_pct", "opening_stock", "stock_alert_value",
    "description", "meta_title", "meta_description",
    "status", "condition", "thumbnail", "images",
    "show_on_web", "website_price", "website_price_was",
    "clubcard_price", "clubcard_bogo",
    "product_attributes", "variants",
  ],
});

export default router;
