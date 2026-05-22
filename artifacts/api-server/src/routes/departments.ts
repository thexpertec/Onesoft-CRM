import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "departments",
  entityType: "department",
  writableColumns: ["name", "role_name", "description", "head_of", "is_active"],
});

export default router;
