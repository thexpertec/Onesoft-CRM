import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "interview_schedules",
  entityType: "interview_schedule",
  writableColumns: [
    "job_id",
    "applicant_id",
    "interviewer_id",
    "date",
    "time",
    "link",
    "status",
    "notes",
    "email_sent",
  ],
});

export default router;
