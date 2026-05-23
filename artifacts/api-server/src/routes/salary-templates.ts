import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "salary_templates",
  entityType: "salary_template",
  writableColumns: [
    "designation",
    "staff_id",
    "basic_salary",
    "overtime_rate_per_hour",
    "per_leave_deduction",
    "per_short_leave_deduction",
    "allowances",
    "deductions",
  ],
});

export default router;
