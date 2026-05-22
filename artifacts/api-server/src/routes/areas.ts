import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "areas",
  entityType: "area",
  writableColumns: ["name", "city_id", "notes"],
});

export default router;
