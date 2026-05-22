import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "product_categories",
  entityType: "product_category",
  writableColumns: ["name", "description", "color", "parent_id"],
});

export default router;
