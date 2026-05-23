import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "job_applicants",
  entityType: "job_applicant",
  writableColumns: [
    "job_id",
    "full_name",
    "email",
    "phone",
    "experience",
    "education",
    "match",
    "stage",
    "round",
    "rating",
    "decision",
    "resume_url",
    "notes",
    "applied_at",
  ],
});

export default router;
