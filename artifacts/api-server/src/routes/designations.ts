import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "designations",
  entityType: "designation",
  writableColumns: ["title", "department", "job_description", "is_active"],
});

export default router;
