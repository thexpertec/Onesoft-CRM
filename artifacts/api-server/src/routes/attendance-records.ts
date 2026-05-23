import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "attendance_records",
  entityType: "attendance_record",
  writableColumns: ["staff_id", "date", "status", "check_in", "check_out", "notes"],
});

export default router;
