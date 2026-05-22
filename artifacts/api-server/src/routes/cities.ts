import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "cities",
  entityType: "city",
  writableColumns: ["name", "country", "notes"],
});

export default router;
