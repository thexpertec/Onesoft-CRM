import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "sales_agents",
  entityType: "sales_agent",
  writableColumns: [
    "agent_code",
    "name",
    "email",
    "phone",
    "region",
    "city",
    "area",
    "commission_rate",
    "target_amount",
    "status",
    "join_date",
    "notes",
    "opening_balance",
    "ledger_account_id",
    "username",
    "password",
    "login_enabled",
  ],
});

export default router;
