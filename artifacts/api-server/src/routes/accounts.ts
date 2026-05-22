import { Router, type IRouter } from "express";
import { mountRecordRoutes } from "../lib/records.js";

const router: IRouter = Router();

mountRecordRoutes(router, {
  table: "accounts",
  entityType: "account",
  writableColumns: [
    "code",
    "name",
    "head",
    "sub_type",
    "description",
    "parent_id",
    "account_type",
    "opening_balance",
    "payment_type",
    "party_type",
    "party_id",
    "is_active",
  ],
  // Once any JE line references this account, its identity is frozen by the
  // FK + lock flag. UPDATE refuses to change these fields; soft-delete via
  // archived_at still works (it's not in this list).
  lockedFlagColumn: "is_locked",
  protectedColumnsWhenLocked: [
    "code",
    "name",
    "head",
    "parent_id",
    "account_type",
    "party_type",
    "party_id",
  ],
});

export default router;
