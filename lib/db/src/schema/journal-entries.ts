import { pgTable, text, timestamp, boolean, numeric, integer, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { accountsTable } from "./accounts";

/**
 * Journal Entries — append-only after posting (GAAP/IFRS audit rule).
 *
 * Invariants enforced at the database layer:
 *   1. Once status = "posted", the row is conceptually frozen.
 *      Application code MUST refuse to UPDATE or DELETE posted entries;
 *      corrections are made via a reversing entry referencing original_je_id.
 *   2. A posted entry must be balanced: SUM(debit) = SUM(credit) across its lines.
 *      Enforced in the API layer transactionally during posting.
 */
export const journalEntriesTable = pgTable(
  "journal_entries",
  {
    id:           text("id").primaryKey(),
    tenantId:     text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    reference:    text("reference").notNull(),
    description:  text("description").notNull().default(""),
    date:         date("date").notNull(),
    status:       text("status").notNull().default("draft"),
    totalDebit:   numeric("total_debit",  { precision: 20, scale: 6 }).notNull().default("0"),
    totalCredit:  numeric("total_credit", { precision: 20, scale: 6 }).notNull().default("0"),
    isBalanced:   boolean("is_balanced").notNull().default(false),
    /** Set when this entry reverses another. Once posted, this entry is itself frozen. */
    reversesJeId: text("reverses_je_id"),
    postedAt:     timestamp("posted_at", { withTimezone: true }),
    postedBy:     text("posted_by"),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("je_tenant_reference_uq").on(t.tenantId, t.reference),
    index("je_tenant_date_idx").on(t.tenantId, t.date),
    index("je_tenant_status_idx").on(t.tenantId, t.status),
    // Composite unique target for cross-table tenant-consistency FK from
    // journal_entry_lines — see SQL migration.
    uniqueIndex("je_id_tenant_uq").on(t.id, t.tenantId),
  ],
);

/**
 * Journal Entry Lines — the actual debits and credits.
 *
 * The FK on ledger_account_id makes the "Unknown Ledger" bug structurally
 * impossible: Postgres will reject any DELETE on accounts that has lines
 * pointing at it (ON DELETE RESTRICT). And the redundant snapshots
 * (account_code, party_type, party_id) give us multiple recovery anchors
 * if the account row ever needs to be archived and replaced.
 */
export const journalEntryLinesTable = pgTable(
  "journal_entry_lines",
  {
    id:              text("id").primaryKey(),
    tenantId:        text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    journalEntryId:  text("journal_entry_id").notNull().references(() => journalEntriesTable.id, { onDelete: "cascade" }),
    /** THE LOAD-BEARING CONSTRAINT — prevents the "Unknown Ledger" class entirely. */
    ledgerAccountId: text("ledger_account_id").notNull().references(() => accountsTable.id, { onDelete: "restrict" }),
    /** Snapshot at post time — recovery anchor #1 (independent of UUID). */
    accountCode:     text("account_code").notNull(),
    /** Snapshot at post time — recovery anchor #2 (party identity). */
    partyType:       text("party_type"),
    partyId:         text("party_id"),
    /** Stable anchor for staff salary lines — kept from legacy model. */
    staffId:         text("staff_id"),
    narration:       text("narration").notNull().default(""),
    debit:           numeric("debit",  { precision: 20, scale: 6 }).notNull().default("0"),
    credit:          numeric("credit", { precision: 20, scale: 6 }).notNull().default("0"),
    /** Preserve order on the JE for display + reproducibility. */
    lineOrder:       integer("line_order").notNull().default(0),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jel_je_idx").on(t.journalEntryId),
    index("jel_tenant_ledger_idx").on(t.tenantId, t.ledgerAccountId),
    index("jel_tenant_party_idx").on(t.tenantId, t.partyType, t.partyId),
  ],
);

export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable).omit({
  createdAt: true,
  updatedAt: true,
  postedAt: true,
  postedBy: true,
});
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;

export const insertJournalEntryLineSchema = createInsertSchema(journalEntryLinesTable).omit({
  createdAt: true,
});
export type InsertJournalEntryLine = z.infer<typeof insertJournalEntryLineSchema>;
export type JournalEntryLine = typeof journalEntryLinesTable.$inferSelect;
