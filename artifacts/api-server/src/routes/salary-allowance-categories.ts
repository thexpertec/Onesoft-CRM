import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "salary_allowance_categories",
  entityType: "salary_allowance_category",
  writableColumns: ["name", "account_group_id", "account_group_name"],
});

export default router;
