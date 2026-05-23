import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "jobs",
  entityType: "job",
  writableColumns: [
    "title",
    "department",
    "location",
    "type",
    "status",
    "description",
    "requirements",
    "salary",
  ],
});

export default router;
