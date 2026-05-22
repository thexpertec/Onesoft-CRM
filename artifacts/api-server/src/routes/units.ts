import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "units",
  entityType: "unit",
  writableColumns: ["name", "symbol", "description"],
});

export default router;
