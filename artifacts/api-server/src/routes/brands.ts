import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "brands",
  entityType: "brand",
  writableColumns: ["name", "color", "website", "description", "status"],
});

export default router;
