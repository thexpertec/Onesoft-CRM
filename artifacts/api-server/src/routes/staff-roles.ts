import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "staff_roles",
  entityType: "staff_role",
  writableColumns: ["color", "name", "description", "permissions"],
});

export default router;
