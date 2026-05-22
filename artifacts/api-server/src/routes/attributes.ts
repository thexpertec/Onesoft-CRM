import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "attributes",
  entityType: "attribute",
  writableColumns: ["name", "type", "values", "description", "active"],
});

export default router;
