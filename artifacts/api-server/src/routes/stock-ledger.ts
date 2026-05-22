import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "stock_ledger",
  entityType: "stock_ledger_entry",
  writableColumns: [
    "entity_type", "entity_id", "entity_name", "date", "tx_type",
    "source_type", "reference", "qty_before", "qty_change", "qty_after",
    "unit", "notes",
  ],
});

export default router;
