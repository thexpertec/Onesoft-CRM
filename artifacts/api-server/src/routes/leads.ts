import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "leads",
  entityType: "lead",
  writableColumns: [
    "name", "company", "email", "phone", "industry", "city", "country", "website",
    "status", "source", "notes", "is_relevant",
    "next_reminder", "reminder_note", "deal_value",
    "assigned_to", "temperature", "next_follow_up", "call_logs",
  ],
});

export default router;
