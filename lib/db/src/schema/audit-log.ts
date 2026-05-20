import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

/**
 * Append-only audit log. Every mutation across the system writes one row here.
 *
 * Answers questions like:
 *   "Why did account 116b2dea-... change state on 2026-05-18 at 14:23?"
 *   "Who deleted customer ACME and when?"
 *   "What did the JE look like before the reversing entry was posted?"
 *
 * Application code MUST NOT update or delete rows here — INSERT only.
 */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id:         text("id").primaryKey(),
    tenantId:   text("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    actor:      text("actor").notNull(),
    entityType: text("entity_type").notNull(),
    entityId:   text("entity_id").notNull(),
    operation:  text("operation").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson:  jsonb("after_json"),
    requestId:  text("request_id"),
    at:         timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_tenant_at_idx").on(t.tenantId, t.at),
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_request_idx").on(t.requestId),
  ],
);

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  at: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
