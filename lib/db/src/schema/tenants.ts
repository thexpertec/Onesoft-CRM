import { pgTable, text, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable(
  "tenants",
  {
    id:                text("id").primaryKey(),
    name:              text("name").notNull(),
    slug:              text("slug").notNull(),
    adminUsername:     text("admin_username").notNull(),
    adminPasswordHash: text("admin_password_hash").notNull(),
    contactEmail:      text("contact_email").notNull(),
    status:            text("status").notNull().default("active"),
    plan:              text("plan").notNull().default("free"),
    moduleGroupId:     text("module_group_id"),
    isDemo:            boolean("is_demo").notNull().default(false),
    demoResetInterval: integer("demo_reset_interval"),
    demoLastReset:     timestamp("demo_last_reset", { withTimezone: true }),
    archivedAt:        timestamp("archived_at", { withTimezone: true }),
    createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tenants_slug_uq").on(t.slug),
    uniqueIndex("tenants_admin_username_uq").on(t.adminUsername),
    index("tenants_status_idx").on(t.status),
  ],
);

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
});
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
