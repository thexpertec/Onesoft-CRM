import { pgTable, text, timestamp, boolean, numeric, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

/**
 * Chart of Accounts (COA) — the source of truth for every ledger in the system.
 *
 * Invariants enforced at the database layer:
 *   1. `is_locked = true` once any journal_entry_line references this account.
 *      Application code MUST refuse to update locked accounts' identity fields
 *      (code, name, parent_id, head, party_id). Soft-delete only via archived_at.
 *   2. Hard-deletes are blocked at the FK layer: journal_entry_lines.ledger_account_id
 *      uses ON DELETE RESTRICT.
 *   3. Bidirectional back-pointer: (party_type, party_id) tells you which CRM
 *      entity owns this account. Replaces all name-matching heuristics.
 *   4. (tenant_id, code) is unique so codes like "1131-007" cannot collide.
 *   5. (tenant_id, party_type, party_id) is unique-when-present so one party
 *      cannot accidentally have two AP/AR subsidiary ledgers.
 *      EXCEPTION: Staff get two ledgers (salary + payable) but with different
 *      party_type values ("staff_salary", "staff_payable") so uniqueness holds.
 */
export const accountsTable = pgTable(
  "accounts",
  {
    id:           text("id").primaryKey(),
    tenantId:     text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    code:         text("code").notNull(),
    name:         text("name").notNull(),
    head:         text("head").notNull(),
    subType:      text("sub_type").notNull().default(""),
    description:  text("description").notNull().default(""),
    parentId:     text("parent_id"),
    accountType:  text("account_type").notNull(),
    openingBalance: numeric("opening_balance", { precision: 20, scale: 6 }).notNull().default("0"),
    paymentType:  text("payment_type"),
    partyType:    text("party_type"),
    partyId:      text("party_id"),
    isActive:     boolean("is_active").notNull().default(true),
    isLocked:     boolean("is_locked").notNull().default(false),
    lockedAt:     timestamp("locked_at", { withTimezone: true }),
    archivedAt:   timestamp("archived_at", { withTimezone: true }),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_tenant_code_uq").on(t.tenantId, t.code),
    uniqueIndex("accounts_tenant_party_uq")
      .on(t.tenantId, t.partyType, t.partyId)
      .where(sql`${t.partyId} IS NOT NULL`),
    index("accounts_tenant_parent_idx").on(t.tenantId, t.parentId),
    index("accounts_tenant_party_idx").on(t.tenantId, t.partyType, t.partyId),
    index("accounts_tenant_active_idx").on(t.tenantId, t.isActive, t.archivedAt),
    // Party identity is all-or-nothing — prevents malformed half-set rows.
    check("accounts_party_consistency_chk", sql`(${t.partyType} IS NULL) = (${t.partyId} IS NULL)`),
    // Composite unique target for cross-table tenant-consistency FKs from
    // journal_entry_lines (id+tenant_id must match) — see SQL migration.
    uniqueIndex("accounts_id_tenant_uq").on(t.id, t.tenantId),
  ],
);

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  lockedAt: true,
  isLocked: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
