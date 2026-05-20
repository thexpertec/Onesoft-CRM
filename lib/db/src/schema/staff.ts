import { pgTable, text, timestamp, numeric, boolean, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { accountsTable } from "./accounts";

/**
 * Staff members. Each staff has TWO ledger references:
 *   - ledger_account_id          → expense ledger under Salary & Wages (4200)
 *   - staff_payable_ledger_id    → payable ledger under Staff Payable (2113)
 *
 * Both are FKs with ON DELETE SET NULL — but the locked-account guard makes
 * staff deletion impossible once any salary JE has posted.
 */
export const staffTable = pgTable(
  "staff",
  {
    id:                     text("id").primaryKey(),
    tenantId:               text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    name:                   text("name").notNull(),
    fatherName:             text("father_name"),
    department:             text("department").notNull().default(""),
    designation:            text("designation").notNull().default(""),
    role:                   text("role").notNull().default(""),
    status:                 text("status").notNull().default("active"),
    email:                  text("email").notNull().default(""),
    phone:                  text("phone").notNull().default(""),
    joinDate:               date("join_date").notNull(),
    leavingDate:            date("leaving_date"),
    notes:                  text("notes").notNull().default(""),
    openingBalance:         numeric("opening_balance", { precision: 20, scale: 6 }).notNull().default("0"),
    salaryType:             text("salary_type"),
    basicSalary:            numeric("basic_salary", { precision: 20, scale: 6 }),
    allowances:             numeric("allowances",   { precision: 20, scale: 6 }),
    deductions:             numeric("deductions",   { precision: 20, scale: 6 }),
    bankName:               text("bank_name"),
    accountNumber:          text("account_number"),
    username:               text("username"),
    passwordHash:           text("password_hash"),
    loginEnabled:           boolean("login_enabled").notNull().default(false),
    ledgerAccountId:        text("ledger_account_id").references(() => accountsTable.id, { onDelete: "set null" }),
    staffPayableLedgerId:   text("staff_payable_ledger_id").references(() => accountsTable.id, { onDelete: "set null" }),
    archivedAt:             timestamp("archived_at", { withTimezone: true }),
    createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:              timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("staff_tenant_status_idx").on(t.tenantId, t.status, t.archivedAt),
    index("staff_tenant_ledger_idx").on(t.tenantId, t.ledgerAccountId),
    index("staff_tenant_payable_idx").on(t.tenantId, t.staffPayableLedgerId),
  ],
);

export const insertStaffSchema = createInsertSchema(staffTable).omit({
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
});
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staffTable.$inferSelect;
