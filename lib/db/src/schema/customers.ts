import { pgTable, text, timestamp, numeric, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { accountsTable } from "./accounts";

/**
 * Customers (and Suppliers — disambiguated by customer_role).
 *
 * The link to the COA is bidirectional:
 *   - customers.ledger_account_id          → accounts.id  (FK, ON DELETE SET NULL)
 *   - customers.advance_ledger_account_id  → accounts.id  (FK, ON DELETE SET NULL)
 * AND the accounts row carries (party_type, party_id) pointing back to this
 * customer (see accounts schema). Either side can be used to resolve the link.
 *
 * Soft-delete via archived_at. Hard-deletes are forbidden by application policy
 * for any customer that has ever appeared on a journal entry — preserved by the
 * locked-account chain (deleting the customer would orphan its locked AP/AR
 * account, which the FK prevents).
 */
export const customersTable = pgTable(
  "customers",
  {
    id:                       text("id").primaryKey(),
    tenantId:                 text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
    name:                     text("name").notNull(),
    company:                  text("company").notNull().default(""),
    email:                    text("email").notNull().default(""),
    phone:                    text("phone").notNull().default(""),
    industry:                 text("industry").notNull().default(""),
    city:                     text("city").notNull().default(""),
    area:                     text("area"),
    billingAddress:           text("billing_address"),
    shippingAddress:          text("shipping_address"),
    billingAddressDetails:    jsonb("billing_address_details"),
    shippingAddressDetails:   jsonb("shipping_address_details"),
    status:                   text("status").notNull().default("active"),
    source:                   text("source").notNull().default("direct"),
    customerType:             text("customer_type"),
    customerRole:             text("customer_role").notNull().default("Buyer"),
    leadId:                   text("lead_id"),
    customerSince:            text("customer_since").notNull(),
    totalValue:               text("total_value").notNull().default("0"),
    currency:                 text("currency").notNull().default("USD"),
    openingBalance:           numeric("opening_balance", { precision: 20, scale: 6 }).notNull().default("0"),
    advanceCredit:            numeric("advance_credit",  { precision: 20, scale: 6 }).notNull().default("0"),
    notes:                    text("notes").notNull().default(""),
    tags:                     jsonb("tags").notNull().default([]),
    ledgerAccountId:          text("ledger_account_id").references(() => accountsTable.id, { onDelete: "set null" }),
    advanceLedgerAccountId:   text("advance_ledger_account_id").references(() => accountsTable.id, { onDelete: "set null" }),
    supplierProducts:         jsonb("supplier_products").notNull().default([]),
    archivedAt:               timestamp("archived_at", { withTimezone: true }),
    createdAt:                timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:                timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customers_tenant_status_idx").on(t.tenantId, t.status, t.archivedAt),
    index("customers_tenant_role_idx").on(t.tenantId, t.customerRole),
    index("customers_tenant_ledger_idx").on(t.tenantId, t.ledgerAccountId),
    // Non-unique — two real customers may legitimately share name+company.
    // De-duplication is a UI concern, not a DB invariant.
    index("customers_tenant_name_idx").on(t.tenantId, t.name),
  ],
);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
