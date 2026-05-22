import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "requirement_docs",
  entityType: "requirement_doc",
  writableColumns: [
    "title", "client_name", "company", "email", "phone", "industry", "city",
    "status", "software_type", "budget", "start_date", "delivery_date", "sections",
  ],
});

export default router;
