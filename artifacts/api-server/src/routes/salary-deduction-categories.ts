import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "salary_deduction_categories",
  entityType: "salary_deduction_category",
  writableColumns: ["name", "account_group_id", "account_group_name", "type"],
});

export default router;
