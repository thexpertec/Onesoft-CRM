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
  /**
   * Mirrors the FE `deleteAccount` (store.ts ~line 9144) plus a hardened
   * system-account guard that the FE only enforces in the UI layer.
   *
   * Hard guards (always 409):
   *   1. System accounts — every `sys-*` id is part of the SYSTEM_ACCOUNTS
   *      seed (Chart-of-Accounts root + fallback ledgers, see SYS_ACCS in
   *      store.ts ~line 7294). The FE hides the delete button for these but
   *      doesn't block at the store level — non-UI clients could otherwise
   *      remove `sys-1100` (AR Group) and silently orphan every existing JE
   *      line + per-party sub-ledger.
   *   2. Child accounts — soft-deleting a parent would orphan its visible
   *      children. `archived_at IS NULL` filter ensures already-archived
   *      children don't keep their parent undeletable indefinitely.
   *
   * Intentionally NOT mirrored: the FE
   * "deactivate-instead-of-delete-when-referenced" branch (JE / Customer /
   * PaymentAccount / Staff / Shareholder references → set isActive=false).
   * Our hook contract is block-or-allow; converting a DELETE into an UPDATE
   * would break response/audit semantics. Defence-in-depth is still solid:
   *   - Soft-delete only sets `archived_at`. The row stays intact so any JE
   *     line still resolves to a real account name (same intent as FE's
   *     "deactivate" branch).
   *   - Hard-delete (?hard=1) is constrained by DB FK behaviour. Note that
   *     `journal_entry_lines.ledger_account_id` is `ON DELETE RESTRICT`
   *     (PG raises 23503 → 409 via the error middleware), but
   *     `customers.ledger_account_id` / `customers.advance_ledger_account_id`
   *     / `staff.ledger_account_id` are `ON DELETE SET NULL` — a hard-delete
   *     can null those back-pointers rather than block. That's an accepted
   *     divergence from FE policy and worth revisiting if it bites us.
   */
  deleteBlockers: async (client, tenantId, before) => {
    const blockers: string[] = [];
    const id = typeof before.id === "string" ? before.id : "";
    if (!id) return blockers;

    // (1) System-account guard — every sys-* id is COA infrastructure.
    if (id.startsWith("sys-")) {
      blockers.push("this is a system account and cannot be removed");
      return blockers; // short-circuit: a fundamental block, no point counting children
    }

    // (2) Live child accounts (archived ones excluded).
    const r = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM accounts
       WHERE tenant_id = $1 AND parent_id = $2 AND archived_at IS NULL`,
      [tenantId, id],
    );
    const n = parseInt(r.rows[0]?.c ?? "0", 10);
    if (n > 0) blockers.push(`${n} child account(s) — remove or reassign them first`);
    return blockers;
  },
});

export default router;
