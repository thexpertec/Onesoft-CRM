/**
 * Phase 1 — per-tenant data migrator.
 *
 * Reads Chart of Accounts and Journal Entries from the legacy kv_store JSON
 * blobs and inserts them into the new relational tables (accounts,
 * journal_entries, journal_entry_lines), skipping rows that already exist
 * (idempotent by primary key).
 *
 * Usage (dry-run — no writes):
 *   node -e "import('./dist/lib/migrate-tenant.mjs').then(m => m.migrateTenant('TENANT_ID', true))"
 *
 * Or via scripts/migrate-tenant-run.mjs (see that file).
 */

import { pool, query } from "./db.js";
import { assertIdent } from "./records.js";
import { randomUUID } from "node:crypto";

/**
 * Safely parse an optional timestamp string from legacy KV data. Returns a
 * Date on success, `null` on missing/invalid input. Critical for migrators:
 * pg rejects `Invalid Date`, so a naked `new Date(s)` would hard-fail the
 * whole row if a legacy record contains a non-parseable string in an
 * *optional* timestamp column.
 */
function parseOptionalDate(s: unknown): Date | null {
  if (s == null || s === "") return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
  if (typeof s !== "string" && typeof s !== "number") return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

interface FrontendAccount {
  id: string;
  code: string;
  name: string;
  head: string;
  subType?: string;
  description?: string;
  parentId?: string | null;
  accountType?: string;
  openingBalance?: number;
  paymentType?: string | null;
  partyType?: string | null;
  partyId?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface FrontendJELine {
  id: string;
  ledgerId: string;
  narration?: string;
  debit: number;
  credit: number;
  staffId?: string;
}

interface FrontendJE {
  id: string;
  reference: string;
  description?: string;
  date: string;
  status?: "draft" | "posted";
  lines: FrontendJELine[];
  totalDebit?: number;
  totalCredit?: number;
  isBalanced?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MigrateSection {
  found: number; inserted: number; skipped: number; errors: string[];
}

export interface MigrateResult {
  tenantId: string;
  dryRun: boolean;
  accounts:          MigrateSection;
  journalEntries:    MigrateSection;
  customers:         MigrateSection;
  products:          MigrateSection;
  brands:            MigrateSection;
  productCategories: MigrateSection;
  units:             MigrateSection;
  attributes:        MigrateSection;
  leads:             MigrateSection;
  departments:       MigrateSection;
  designations:      MigrateSection;
  cities:            MigrateSection;
  areas:             MigrateSection;
  requirementDocs:   MigrateSection;
  stockItems:        MigrateSection;
  stockLedger:       MigrateSection;
  purchaseOrders:    MigrateSection;
  sales:             MigrateSection;
}

interface FrontendProduct {
  id: string;
  name: string;
  localName?: string;
  model?: string;
  sku?: string;
  barcode?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  subSubcategory?: string;
  department?: string;
  unit?: string;
  purchasePrice?: string;
  costPrice?: string;
  price?: string;
  wholesalePrice?: string;
  commissionPct?: string;
  openingStock?: string;
  stockAlertValue?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  status?: string;
  condition?: string;
  thumbnail?: string;
  images?: unknown;
  showOnWeb?: boolean;
  websitePrice?: string;
  websitePriceWas?: string;
  clubcardPrice?: string;
  clubcardBogo?: boolean;
  productAttributes?: unknown;
  variants?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

interface FrontendCustomer {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  industry?: string;
  city?: string;
  area?: string;
  billingAddress?: string;
  shippingAddress?: string;
  billingAddressDetails?: unknown;
  shippingAddressDetails?: unknown;
  status?: string;
  source?: string;
  customerType?: string;
  customerRole?: string;
  leadId?: string;
  customerSince?: string;
  totalValue?: string | number;
  currency?: string;
  openingBalance?: number;
  advanceCredit?: number;
  notes?: string;
  tags?: string[];
  ledgerAccountId?: string;
  advanceLedgerAccountId?: string;
  supplierProducts?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Read a kv_store JSON blob for a given tenant + key. Returns null if missing. */
async function readKv(tenantId: string, key: string): Promise<unknown> {
  const rows = await query<{ value: unknown }>(
    `SELECT value FROM kv_store WHERE namespace = $1 AND key = $2 LIMIT 1`,
    [`t:${tenantId}`, key],
  );
  if (rows.length === 0) return null;
  const val = rows[0].value;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val;
}

export async function migrateTenant(
  tenantId: string,
  dryRun = true,
): Promise<MigrateResult> {
  const result: MigrateResult = {
    tenantId,
    dryRun,
    accounts:          { found: 0, inserted: 0, skipped: 0, errors: [] },
    journalEntries:    { found: 0, inserted: 0, skipped: 0, errors: [] },
    customers:         { found: 0, inserted: 0, skipped: 0, errors: [] },
    products:          { found: 0, inserted: 0, skipped: 0, errors: [] },
    brands:            { found: 0, inserted: 0, skipped: 0, errors: [] },
    productCategories: { found: 0, inserted: 0, skipped: 0, errors: [] },
    units:             { found: 0, inserted: 0, skipped: 0, errors: [] },
    attributes:        { found: 0, inserted: 0, skipped: 0, errors: [] },
    leads:             { found: 0, inserted: 0, skipped: 0, errors: [] },
    departments:       { found: 0, inserted: 0, skipped: 0, errors: [] },
    designations:      { found: 0, inserted: 0, skipped: 0, errors: [] },
    cities:            { found: 0, inserted: 0, skipped: 0, errors: [] },
    areas:             { found: 0, inserted: 0, skipped: 0, errors: [] },
    requirementDocs:   { found: 0, inserted: 0, skipped: 0, errors: [] },
    stockItems:        { found: 0, inserted: 0, skipped: 0, errors: [] },
    stockLedger:       { found: 0, inserted: 0, skipped: 0, errors: [] },
    purchaseOrders:    { found: 0, inserted: 0, skipped: 0, errors: [] },
    sales:             { found: 0, inserted: 0, skipped: 0, errors: [] },
  };

  // ── 0. Ensure a tenants row exists ─────────────────────────────────────────
  // The customers / accounts / JE tables FK onto tenants(id). Legacy tenants
  // whose data lives only in kv_store may have no relational tenant row yet,
  // so we upsert a minimal placeholder. Real tenant metadata (name, admin
  // credentials) is filled in by the superadmin UI separately.
  if (!dryRun) {
    // Insert a minimal placeholder so FKs on customers/accounts/JEs hold.
    // If the row already exists by id, do nothing. If a UNIQUE on slug or
    // admin_username collides (extremely rare), append a short random suffix
    // and retry — we never want migration to abort just to seed a placeholder.
    const existing = await query<{ id: string }>(
      `SELECT id FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    if (existing.length === 0) {
      let attempt = 0;
      // 4 attempts is overkill — uniqueness via random suffix is effectively certain.
      while (attempt < 4) {
        const suffix = attempt === 0 ? "" : `-${randomUUID().slice(0, 6)}`;
        try {
          await query(
            `INSERT INTO tenants (id, name, slug, admin_username, admin_password_hash, contact_email, status)
             VALUES ($1, $1, $2, $2, '', $3, 'active')
             ON CONFLICT (id) DO NOTHING`,
            [tenantId, `migrated-${tenantId}${suffix}`, `${tenantId}${suffix}@migrated.local`],
          );
          break;
        } catch (err) {
          if ((err as { code?: string })?.code === "23505" && attempt < 3) {
            attempt++;
            continue;
          }
          throw err;
        }
      }
    }
  }

  // ── 1. Accounts ────────────────────────────────────────────────────────────
  const rawAccounts = await readKv(tenantId, "admin-chart-of-accounts");
  const accounts: FrontendAccount[] = Array.isArray(rawAccounts) ? rawAccounts as FrontendAccount[] : [];
  result.accounts.found = accounts.length;

  // Build a map from id → account for quick code lookups later
  const accountById = new Map(accounts.map(a => [a.id, a]));

  for (const acc of accounts) {
    try {
      const existing = await query(
        `SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [acc.id, tenantId],
      );
      if (existing.length > 0) {
        result.accounts.skipped++;
        continue;
      }

      if (dryRun) {
        result.accounts.inserted++;
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO accounts
             (id, tenant_id, code, name, head, sub_type, description,
              parent_id, account_type, opening_balance, payment_type,
              party_type, party_id, is_active, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (id, tenant_id) DO NOTHING`,
          [
            acc.id,
            tenantId,
            acc.code ?? "",
            acc.name ?? "",
            acc.head ?? "Assets",
            acc.subType ?? "",
            acc.description ?? "",
            acc.parentId ?? null,
            acc.accountType ?? "Group",
            acc.openingBalance ?? 0,
            acc.paymentType ?? null,
            acc.partyType ?? null,
            acc.partyId ?? null,
            acc.isActive !== false,
            acc.createdAt ? new Date(acc.createdAt) : new Date(),
            acc.updatedAt ? new Date(acc.updatedAt) : new Date(),
          ],
        );
        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate','account',$3,'create',NULL,$4)`,
          [randomUUID(), tenantId, acc.id, JSON.stringify(acc)],
        );
        await client.query("COMMIT");
        result.accounts.inserted++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.accounts.errors.push(`Account ${acc.id} (${acc.code}): ${(err as Error).message}`);
    }
  }

  // ── 2. Journal Entries ─────────────────────────────────────────────────────
  const rawJEs = await readKv(tenantId, "admin-journal-entries");
  const jes: FrontendJE[] = Array.isArray(rawJEs) ? rawJEs as FrontendJE[] : [];
  result.journalEntries.found = jes.length;

  for (const je of jes) {
    try {
      const existing = await query(
        `SELECT id FROM journal_entries WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [je.id, tenantId],
      );
      if (existing.length > 0) {
        result.journalEntries.skipped++;
        continue;
      }

      // Validate that every line references a known account
      const invalidLines = je.lines?.filter(l => !accountById.has(l.ledgerId)) ?? [];
      if (invalidLines.length > 0) {
        const ids = invalidLines.map(l => l.ledgerId).join(", ");
        result.journalEntries.errors.push(
          `JE ${je.id} (${je.reference}): lines reference unknown accounts [${ids}] — skipped`,
        );
        result.journalEntries.skipped++;
        continue;
      }

      const lines = je.lines ?? [];
      const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
      const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.0001;
      const status      = je.status ?? "posted";

      if (dryRun) {
        result.journalEntries.inserted++;
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO journal_entries
             (id, tenant_id, reference, description, date, status,
              total_debit, total_credit, is_balanced,
              posted_at, posted_by, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (id, tenant_id) DO NOTHING`,
          [
            je.id,
            tenantId,
            je.reference ?? "",
            je.description ?? "",
            je.date,
            status,
            totalDebit.toString(),
            totalCredit.toString(),
            isBalanced,
            status === "posted" ? (je.updatedAt ? new Date(je.updatedAt) : new Date()) : null,
            status === "posted" ? "migrate" : null,
            je.createdAt ? new Date(je.createdAt) : new Date(),
            je.updatedAt ? new Date(je.updatedAt) : new Date(),
          ],
        );

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const acc = accountById.get(l.ledgerId)!;
          await client.query(
            `INSERT INTO journal_entry_lines
               (id, tenant_id, journal_entry_id, ledger_account_id, account_code,
                staff_id, narration, debit, credit, line_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT DO NOTHING`,
            [
              l.id ?? randomUUID(),
              tenantId,
              je.id,
              l.ledgerId,
              acc.code ?? "",
              l.staffId ?? null,
              l.narration ?? "",
              (Number(l.debit) || 0).toString(),
              (Number(l.credit) || 0).toString(),
              i,
            ],
          );
        }

        // Lock accounts touched by posted JEs
        if (status === "posted" && lines.length > 0) {
          const ids = [...new Set(lines.map(l => l.ledgerId))];
          await client.query(
            `UPDATE accounts SET is_locked = TRUE, locked_at = COALESCE(locked_at, NOW()), updated_at = NOW()
             WHERE tenant_id = $1 AND id = ANY($2::text[]) AND is_locked = FALSE`,
            [tenantId, ids],
          );
        }

        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate','journal_entry',$3,'create',NULL,$4)`,
          [randomUUID(), tenantId, je.id, JSON.stringify({ reference: je.reference, lineCount: lines.length })],
        );

        await client.query("COMMIT");
        result.journalEntries.inserted++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.journalEntries.errors.push(
        `JE ${je.id} (${je.reference}): ${(err as Error).message}`,
      );
    }
  }

  // ── 3. Customers ───────────────────────────────────────────────────────────
  const rawCustomers = await readKv(tenantId, "admin-customers");
  const customers: FrontendCustomer[] = Array.isArray(rawCustomers)
    ? (rawCustomers as FrontendCustomer[])
    : [];
  result.customers.found = customers.length;

  // Defensive coercion: legacy KV blobs occasionally contain JSON-encoded
  // strings for fields that should be arrays/objects. Normalise here so jsonb
  // columns always receive a real array/object, not a string-of-an-array.
  const coerceArray = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  };
  const coerceObjectOrNull = (v: unknown): unknown => {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v === "string") {
      try { const p = JSON.parse(v); return p && typeof p === "object" ? p : null; } catch { return null; }
    }
    return null;
  };

  for (const cust of customers) {
    try {
      if (!cust?.id || !cust.name) {
        result.customers.errors.push(
          `Customer ${cust?.id ?? "?"}: missing required fields (id, name) — skipped`,
        );
        result.customers.skipped++;
        continue;
      }

      // customers PK is (id) globally — check id without tenant scoping so we
      // detect cross-tenant collisions and report them rather than silently
      // skipping. (A cross-tenant collision means two different tenants reused
      // the same customer ID in KV — surface it loudly.)
      const existing = await query<{ tenant_id: string }>(
        `SELECT tenant_id FROM customers WHERE id = $1 LIMIT 1`,
        [cust.id],
      );
      if (existing.length > 0) {
        if (existing[0].tenant_id === tenantId) {
          result.customers.skipped++;
        } else {
          result.customers.errors.push(
            `Customer ${cust.id} (${cust.name}): id already exists under another tenant (${existing[0].tenant_id}) — skipped`,
          );
          result.customers.skipped++;
        }
        continue;
      }

      if (dryRun) {
        result.customers.inserted++;
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const insertRes = await client.query(
          `INSERT INTO customers (
             id, tenant_id, name, company, email, phone, industry, city, area,
             billing_address, shipping_address,
             billing_address_details, shipping_address_details,
             status, source, customer_type, customer_role, lead_id,
             customer_since, total_value, currency,
             opening_balance, advance_credit, notes, tags,
             ledger_account_id, advance_ledger_account_id, supplier_products,
             created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,
             $10,$11,$12,$13,
             $14,$15,$16,$17,$18,
             $19,$20,$21,
             $22,$23,$24,$25,
             $26,$27,$28,
             $29,$30
           )
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            cust.id,
            tenantId,
            cust.name,
            cust.company ?? "",
            cust.email ?? "",
            cust.phone ?? "",
            cust.industry ?? "",
            cust.city ?? "",
            cust.area ?? null,
            cust.billingAddress ?? null,
            cust.shippingAddress ?? null,
            (() => { const o = coerceObjectOrNull(cust.billingAddressDetails);  return o ? JSON.stringify(o) : null; })(),
            (() => { const o = coerceObjectOrNull(cust.shippingAddressDetails); return o ? JSON.stringify(o) : null; })(),
            cust.status ?? "active",
            cust.source ?? "direct",
            cust.customerType ?? null,
            cust.customerRole ?? "Buyer",
            cust.leadId ?? null,
            cust.customerSince ?? "",
            String(cust.totalValue ?? "0"),
            cust.currency ?? "USD",
            (cust.openingBalance ?? 0).toString(),
            (cust.advanceCredit ?? 0).toString(),
            cust.notes ?? "",
            JSON.stringify(coerceArray(cust.tags)),
            cust.ledgerAccountId ?? null,
            cust.advanceLedgerAccountId ?? null,
            JSON.stringify(coerceArray(cust.supplierProducts)),
            cust.createdAt ? new Date(cust.createdAt) : new Date(),
            cust.updatedAt ? new Date(cust.updatedAt) : new Date(),
          ],
        );
        // Only count + audit if the INSERT actually produced a row.
        // ON CONFLICT (id) silently no-ops if a row with the same id exists
        // (e.g. race with another tenant migration) — without this guard we
        // would falsely report success and write a misleading audit entry.
        if (insertRes.rowCount && insertRes.rowCount > 0) {
          await client.query(
            `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
             VALUES ($1,$2,'migrate','customer',$3,'create',NULL,$4)`,
            [randomUUID(), tenantId, cust.id, JSON.stringify({ name: cust.name, role: cust.customerRole ?? "Buyer" })],
          );
          await client.query("COMMIT");
          result.customers.inserted++;
        } else {
          await client.query("ROLLBACK");
          result.customers.errors.push(
            `Customer ${cust.id} (${cust.name}): id collision detected during insert — skipped`,
          );
          result.customers.skipped++;
        }
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.customers.errors.push(`Customer ${cust.id} (${cust.name}): ${(err as Error).message}`);
    }
  }

  // ── 4. Products ────────────────────────────────────────────────────────────
  const rawProducts = await readKv(tenantId, "admin-products");
  const products: FrontendProduct[] = Array.isArray(rawProducts)
    ? (rawProducts as FrontendProduct[])
    : [];
  result.products.found = products.length;

  for (const prod of products) {
    try {
      if (!prod?.id || !prod.name) {
        result.products.errors.push(
          `Product ${prod?.id ?? "?"}: missing required fields (id, name) — skipped`,
        );
        result.products.skipped++;
        continue;
      }

      // products PK is (id) globally — same pattern as customers.
      const existing = await query<{ tenant_id: string }>(
        `SELECT tenant_id FROM products WHERE id = $1 LIMIT 1`,
        [prod.id],
      );
      if (existing.length > 0) {
        if (existing[0].tenant_id === tenantId) {
          result.products.skipped++;
        } else {
          result.products.errors.push(
            `Product ${prod.id} (${prod.name}): id already exists under another tenant (${existing[0].tenant_id}) — skipped`,
          );
          result.products.skipped++;
        }
        continue;
      }

      if (dryRun) {
        result.products.inserted++;
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const insertRes = await client.query(
          `INSERT INTO products (
             id, tenant_id, name, local_name, model, sku, barcode,
             brand, category, subcategory, sub_subcategory, department,
             unit, purchase_price, cost_price, price, wholesale_price,
             commission_pct, opening_stock, stock_alert_value,
             description, meta_title, meta_description,
             status, condition, thumbnail, images,
             show_on_web, website_price, website_price_was,
             clubcard_price, clubcard_bogo,
             product_attributes, variants,
             created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,
             $8,$9,$10,$11,$12,
             $13,$14,$15,$16,$17,
             $18,$19,$20,
             $21,$22,$23,
             $24,$25,$26,$27,
             $28,$29,$30,
             $31,$32,
             $33,$34,
             $35,$36
           )
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            prod.id,
            tenantId,
            prod.name,
            prod.localName ?? null,
            prod.model ?? null,
            prod.sku ?? "",
            prod.barcode ?? null,
            prod.brand ?? "",
            prod.category ?? "",
            prod.subcategory ?? null,
            prod.subSubcategory ?? null,
            prod.department ?? null,
            prod.unit ?? "",
            prod.purchasePrice ?? null,
            prod.costPrice ?? null,
            String(prod.price ?? "0"),
            prod.wholesalePrice ?? null,
            prod.commissionPct ?? null,
            prod.openingStock ?? null,
            prod.stockAlertValue ?? null,
            prod.description ?? "",
            prod.metaTitle ?? null,
            prod.metaDescription ?? null,
            prod.status ?? "Active",
            prod.condition ?? null,
            prod.thumbnail ?? null,
            JSON.stringify(coerceArray(prod.images)),
            prod.showOnWeb === true,
            prod.websitePrice ?? null,
            prod.websitePriceWas ?? null,
            prod.clubcardPrice ?? null,
            prod.clubcardBogo === true,
            JSON.stringify(coerceArray(prod.productAttributes)),
            JSON.stringify(coerceArray(prod.variants)),
            prod.createdAt ? new Date(prod.createdAt) : new Date(),
            prod.updatedAt ? new Date(prod.updatedAt) : new Date(),
          ],
        );
        if (insertRes.rowCount && insertRes.rowCount > 0) {
          await client.query(
            `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
             VALUES ($1,$2,'migrate','product',$3,'create',NULL,$4)`,
            [randomUUID(), tenantId, prod.id, JSON.stringify({ name: prod.name, sku: prod.sku ?? "" })],
          );
          await client.query("COMMIT");
          result.products.inserted++;
        } else {
          await client.query("ROLLBACK");
          result.products.errors.push(
            `Product ${prod.id} (${prod.name}): id collision detected during insert — skipped`,
          );
          result.products.skipped++;
        }
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.products.errors.push(`Product ${prod.id} (${prod.name}): ${(err as Error).message}`);
    }
  }

  // ── 5. Masters (brands, product_categories, units, attributes) ─────────────
  await migrateMaster<{ id: string; name: string; color?: string; website?: string; description?: string; status?: string; createdAt?: string; updatedAt?: string }>({
    tenantId, dryRun, result, section: "brands",
    kvKey: "admin-brands", table: "brands", entityType: "brand",
    columns: ["name", "color", "website", "description", "status"],
    extractValues: (b) => [b.name, b.color ?? "", b.website ?? "", b.description ?? "", b.status ?? "Active"],
    auditSummary: (b) => ({ name: b.name }),
  });
  await migrateMaster<{ id: string; name: string; description?: string; color?: string; parentId?: string | null; createdAt?: string; updatedAt?: string }>({
    tenantId, dryRun, result, section: "productCategories",
    kvKey: "admin-product-categories", table: "product_categories", entityType: "product_category",
    columns: ["name", "description", "color", "parent_id"],
    extractValues: (c) => [c.name, c.description ?? "", c.color ?? "", c.parentId ?? null],
    auditSummary: (c) => ({ name: c.name }),
  });
  await migrateMaster<{ id: string; name: string; symbol?: string; description?: string; createdAt?: string; updatedAt?: string }>({
    tenantId, dryRun, result, section: "units",
    kvKey: "admin-units", table: "units", entityType: "unit",
    columns: ["name", "symbol", "description"],
    extractValues: (u) => [u.name, u.symbol ?? "", u.description ?? ""],
    auditSummary: (u) => ({ name: u.name }),
  });
  await migrateMaster<{ id: string; name: string; type?: string; values?: string; description?: string; active?: boolean; createdAt?: string; updatedAt?: string }>({
    tenantId, dryRun, result, section: "attributes",
    kvKey: "admin-attributes", table: "attributes", entityType: "attribute",
    columns: ["name", "type", "values", "description", "active"],
    extractValues: (a) => [a.name, a.type ?? "text", a.values ?? "", a.description ?? "", a.active !== false],
    auditSummary: (a) => ({ name: a.name }),
  });

  // ── 6. Leads / Departments / Designations ──────────────────────────────────
  type LeadRow = {
    id: string; name: string; company?: string; email?: string; phone?: string;
    industry?: string; city?: string; country?: string; website?: string;
    status?: string; source?: string; notes?: string;
    isRelevant?: boolean; nextReminder?: string; reminderNote?: string;
    dealValue?: number; assignedTo?: string; temperature?: string;
    nextFollowUp?: string; callLogs?: unknown;
    createdAt?: string; updatedAt?: string;
  };
  await migrateMaster<LeadRow>({
    tenantId, dryRun, result, section: "leads",
    kvKey: "admin-leads", table: "leads", entityType: "lead",
    columns: [
      "name", "company", "email", "phone", "industry", "city", "country", "website",
      "status", "source", "notes", "is_relevant",
      "next_reminder", "reminder_note", "deal_value",
      "assigned_to", "temperature", "next_follow_up", "call_logs",
    ],
    extractValues: (l) => [
      l.name, l.company ?? "", l.email ?? "", l.phone ?? "",
      l.industry ?? "", l.city ?? "", l.country ?? null, l.website ?? null,
      l.status ?? "New", l.source ?? "", l.notes ?? "",
      typeof l.isRelevant === "boolean" ? l.isRelevant : null,
      parseOptionalDate(l.nextReminder),
      l.reminderNote ?? null,
      typeof l.dealValue === "number" ? l.dealValue : null,
      l.assignedTo ?? null, l.temperature ?? null,
      parseOptionalDate(l.nextFollowUp),
      JSON.stringify(coerceArray(l.callLogs)),
    ],
    auditSummary: (l) => ({ name: l.name, company: l.company ?? "" }),
  });

  await migrateMaster<{
    id: string; name: string; roleName?: string; description?: string;
    headOf?: string; isActive?: boolean; createdAt?: string; updatedAt?: string;
  }>({
    tenantId, dryRun, result, section: "departments",
    kvKey: "admin-hrm-departments", table: "departments", entityType: "department",
    columns: ["name", "role_name", "description", "head_of", "is_active"],
    extractValues: (d) => [d.name, d.roleName ?? null, d.description ?? "", d.headOf ?? "", d.isActive !== false],
    auditSummary: (d) => ({ name: d.name }),
  });

  await migrateMaster<{
    id: string; title: string; department?: string; jobDescription?: string;
    isActive?: boolean; createdAt?: string; updatedAt?: string;
  }>({
    tenantId, dryRun, result, section: "designations",
    kvKey: "admin-hrm-designations", table: "designations", entityType: "designation",
    columns: ["title", "department", "job_description", "is_active"],
    extractValues: (d) => [d.title, d.department ?? "", d.jobDescription ?? "", d.isActive !== false],
    auditSummary: (d) => ({ title: d.title }),
    getDisplayName: (d) => d.title,
  });

  // ── 7. Cities / Areas / Requirement Docs ───────────────────────────────────
  await migrateMaster<{
    id: string; name: string; country?: string; notes?: string;
    createdAt?: string; updatedAt?: string;
  }>({
    tenantId, dryRun, result, section: "cities",
    kvKey: "admin-cities", table: "cities", entityType: "city",
    columns: ["name", "country", "notes"],
    extractValues: (c) => [c.name, c.country ?? "", c.notes ?? ""],
    auditSummary: (c) => ({ name: c.name }),
  });

  await migrateMaster<{
    id: string; name: string; cityId?: string; notes?: string;
    createdAt?: string; updatedAt?: string;
  }>({
    tenantId, dryRun, result, section: "areas",
    kvKey: "admin-areas", table: "areas", entityType: "area",
    columns: ["name", "city_id", "notes"],
    extractValues: (a) => [a.name, a.cityId || null, a.notes ?? ""],
    auditSummary: (a) => ({ name: a.name, cityId: a.cityId ?? null }),
  });

  type ReqDocRow = {
    id: string; title: string;
    clientName?: string; company?: string; email?: string; phone?: string;
    industry?: string; city?: string; status?: string;
    softwareType?: string; budget?: string; startDate?: string; deliveryDate?: string;
    sections?: unknown;
    createdAt?: string; updatedAt?: string;
  };
  await migrateMaster<ReqDocRow>({
    tenantId, dryRun, result, section: "requirementDocs",
    kvKey: "admin-req-docs", table: "requirement_docs", entityType: "requirement_doc",
    columns: [
      "title", "client_name", "company", "email", "phone", "industry", "city",
      "status", "software_type", "budget", "start_date", "delivery_date", "sections",
    ],
    extractValues: (d) => [
      d.title, d.clientName ?? "", d.company ?? "", d.email ?? "", d.phone ?? "",
      d.industry ?? "", d.city ?? "", d.status ?? "Draft",
      d.softwareType ?? "", d.budget ?? "", d.startDate ?? "", d.deliveryDate ?? "",
      JSON.stringify(
        d.sections != null && typeof d.sections === "object" && !Array.isArray(d.sections)
          ? d.sections
          : {},
      ),
    ],
    auditSummary: (d) => ({ title: d.title, clientName: d.clientName ?? "" }),
    getDisplayName: (d) => d.title,
  });

  // ── 8. Stock Items + Stock Ledger ──────────────────────────────────────────
  // Quantities arrive as strings from the frontend grid type — coerce to
  // number, treating non-numeric values as 0 rather than failing the row.
  const toNum = (v: unknown): number => {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (typeof v === "string") { const n = parseFloat(v); return isFinite(n) ? n : 0; }
    return 0;
  };

  await migrateMaster<{
    id: string; productName: string; sku?: string; store?: string;
    stockType?: string; quantity?: unknown; minLevel?: unknown; unit?: string;
    holdCustomer?: string; holdReason?: string; notes?: string;
    createdAt?: string; updatedAt?: string;
  }>({
    tenantId, dryRun, result, section: "stockItems",
    kvKey: "admin-stock", table: "stock_items", entityType: "stock_item",
    columns: [
      "product_name", "sku", "store", "stock_type", "quantity", "min_level",
      "unit", "hold_customer", "hold_reason", "notes",
    ],
    extractValues: (s) => [
      s.productName, s.sku ?? "", s.store ?? "", s.stockType ?? "For Sale",
      toNum(s.quantity), toNum(s.minLevel),
      s.unit ?? "", s.holdCustomer ?? "", s.holdReason ?? "", s.notes ?? "",
    ],
    auditSummary: (s) => ({ productName: s.productName, sku: s.sku ?? "", store: s.store ?? "" }),
    getDisplayName: (s) => s.productName,
  });

  await migrateMaster<{
    id: string; entityType?: string; entityId: string; entityName?: string;
    date?: string; txType: string; sourceType?: string; reference?: string;
    qtyBefore?: unknown; qtyChange?: unknown; qtyAfter?: unknown;
    unit?: string; notes?: string;
    createdAt?: string; updatedAt?: string;
  }>({
    tenantId, dryRun, result, section: "stockLedger",
    kvKey: "admin-stock-ledger", table: "stock_ledger", entityType: "stock_ledger_entry",
    columns: [
      "entity_type", "entity_id", "entity_name", "date", "tx_type",
      "source_type", "reference", "qty_before", "qty_change", "qty_after",
      "unit", "notes",
    ],
    extractValues: (l) => [
      l.entityType ?? "product", l.entityId, l.entityName ?? "",
      l.date ?? "", l.txType, l.sourceType ?? null, l.reference ?? "",
      toNum(l.qtyBefore), toNum(l.qtyChange), toNum(l.qtyAfter),
      l.unit ?? "", l.notes ?? "",
    ],
    auditSummary: (l) => ({ entityId: l.entityId, txType: l.txType, reference: l.reference ?? "" }),
    // Ledger rows have no `name` field; use a composite label for error messages.
    getDisplayName: (l) => `${l.txType} ${l.reference ?? ""}`.trim() || l.entityId,
  });

  // ── 9. Purchase Orders + Items (first transactional entity) ────────────────
  // Parent + child line items. Doesn't fit `migrateMaster` shape — needs
  // dedicated per-row transaction that writes the PO header and all its
  // items atomically (mirrors the JE migrator above).
  type IncomingPoItem = {
    id?: string; itemType?: string; rmId?: string;
    productName?: string; sku?: string;
    qty?: unknown; unit?: string; unitPrice?: unknown; notes?: string;
  };
  type IncomingPo = {
    id: string; poNumber: string;
    supplier?: string; orderDate?: string; deliveryDate?: string;
    status?: string; notes?: string;
    jeId?: string;
    items?: IncomingPoItem[];
    createdAt?: string; updatedAt?: string;
  };

  const rawPos = await readKv(tenantId, "admin-purchase-orders");
  const pos: IncomingPo[] = Array.isArray(rawPos) ? (rawPos as IncomingPo[]) : [];
  result.purchaseOrders.found = pos.length;

  for (const po of pos) {
    try {
      if (!po.id || !po.poNumber) {
        result.purchaseOrders.errors.push(
          `PO ${po.id ?? "(no id)"}: missing required field (id or poNumber) — skipped`,
        );
        result.purchaseOrders.skipped++;
        continue;
      }
      const existing = await query(
        `SELECT id FROM purchase_orders WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [po.id, tenantId],
      );
      if (existing.length > 0) {
        result.purchaseOrders.skipped++;
        continue;
      }
      if (dryRun) {
        result.purchaseOrders.inserted++;
        continue;
      }

      const items = Array.isArray(po.items) ? po.items : [];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO purchase_orders
            (id, tenant_id, po_number, supplier, order_date, delivery_date,
             status, notes, je_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id, tenant_id) DO NOTHING`,
          [
            po.id, tenantId, po.poNumber,
            po.supplier ?? "", po.orderDate ?? "", po.deliveryDate ?? "",
            po.status ?? "Draft", po.notes ?? "", po.jeId ?? null,
            po.createdAt ? new Date(po.createdAt) : new Date(),
            po.updatedAt ? new Date(po.updatedAt) : new Date(),
          ],
        );
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          await client.query(
            `INSERT INTO purchase_order_items
              (id, tenant_id, po_id, item_type, rm_id, product_name, sku,
               qty, unit, unit_price, notes, line_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (id, tenant_id) DO NOTHING`,
            [
              it.id ?? randomUUID(), tenantId, po.id,
              it.itemType ?? "product", it.rmId ?? null,
              it.productName ?? "", it.sku ?? "",
              toNum(it.qty), it.unit ?? "", toNum(it.unitPrice),
              it.notes ?? "", i,
            ],
          );
        }
        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate','purchase_order',$3,'create',NULL,$4)`,
          [
            randomUUID(), tenantId, po.id,
            JSON.stringify({ poNumber: po.poNumber, supplier: po.supplier ?? "", itemCount: items.length }),
          ],
        );
        await client.query("COMMIT");
        result.purchaseOrders.inserted++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.purchaseOrders.errors.push(
        `PO ${po.id} (${po.poNumber}): ${(err as Error).message}`,
      );
    }
  }

  // ── 10. Sales + Sale Items ─────────────────────────────────────────────────
  // Same parent+items shape as PO. Payment-tracking fields (amount_paid,
  // paid_at, payment_method) and je_id are persisted as-is — financial
  // blocker / reverse-cascade logic stays in the frontend store layer.
  // String-typed numerics preserve the frontend's "string-of-decimal"
  // contract exactly (see schema-init.ts comment on the sales table).
  type IncomingSaleItem = {
    id?: string; productName?: string; localName?: string; sku?: string;
    qty?: unknown; unit?: string; unitPrice?: unknown;
    discount?: unknown; discountType?: string;
    notes?: string; itemStatus?: string;
    bogoApplied?: boolean; variantLabel?: string;
    costPrice?: unknown; purchaseUnit?: string; conversionFactor?: unknown;
  };
  type IncomingSale = {
    id: string; saleNumber: string;
    saleDate?: string; customer?: string;
    status?: string; paymentMethod?: string; notes?: string;
    taxRate?: unknown; amountPaid?: unknown; paidAt?: string;
    stockDeducted?: boolean;
    jeId?: string; agentId?: string; agentName?: string;
    saleMode?: string; deliveryStatus?: string;
    deliveryCharges?: unknown; invoiceDiscount?: unknown; invoiceDiscountType?: string;
    orderType?: string; onlineCustomer?: string;
    items?: IncomingSaleItem[];
    createdAt?: string; updatedAt?: string;
  };

  // Local string-coercer: defensive against numbers/null in legacy KV blobs.
  const toStrOrEmpty = (v: unknown, dflt = ""): string => {
    if (v === null || v === undefined) return dflt;
    if (typeof v === "number") return isFinite(v) ? String(v) : dflt;
    return String(v);
  };
  const toStrOrNull = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return isFinite(v) ? String(v) : null;
    const s = String(v);
    return s === "" ? null : s;
  };

  const rawSales = await readKv(tenantId, "admin-sales");
  const sales: IncomingSale[] = Array.isArray(rawSales) ? (rawSales as IncomingSale[]) : [];
  result.sales.found = sales.length;

  for (const sale of sales) {
    try {
      if (!sale.id || !sale.saleNumber) {
        result.sales.errors.push(
          `Sale ${sale.id ?? "(no id)"}: missing required field (id or saleNumber) — skipped`,
        );
        result.sales.skipped++;
        continue;
      }
      const existing = await query(
        `SELECT id FROM sales WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [sale.id, tenantId],
      );
      if (existing.length > 0) {
        result.sales.skipped++;
        continue;
      }
      if (dryRun) {
        result.sales.inserted++;
        continue;
      }

      const items = Array.isArray(sale.items) ? sale.items : [];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO sales
            (id, tenant_id, sale_number, sale_date, customer, status,
             payment_method, notes, tax_rate, amount_paid, paid_at,
             stock_deducted, je_id, agent_id, agent_name, sale_mode,
             delivery_status, delivery_charges, invoice_discount,
             invoice_discount_type, order_type, online_customer,
             created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
           ON CONFLICT (id, tenant_id) DO NOTHING`,
          [
            sale.id, tenantId, sale.saleNumber,
            sale.saleDate ?? "", sale.customer ?? "",
            sale.status ?? "Pending", sale.paymentMethod ?? "", sale.notes ?? "",
            toStrOrEmpty(sale.taxRate, "0"), toStrOrEmpty(sale.amountPaid, "0"), sale.paidAt ?? "",
            sale.stockDeducted === true,
            sale.jeId ?? null, sale.agentId ?? null, sale.agentName ?? null,
            sale.saleMode ?? null, sale.deliveryStatus ?? null,
            toStrOrNull(sale.deliveryCharges), toStrOrNull(sale.invoiceDiscount),
            sale.invoiceDiscountType ?? null, sale.orderType ?? null, sale.onlineCustomer ?? null,
            sale.createdAt ? new Date(sale.createdAt) : new Date(),
            sale.updatedAt ? new Date(sale.updatedAt) : new Date(),
          ],
        );
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          await client.query(
            `INSERT INTO sale_items
              (id, tenant_id, sale_id, product_name, local_name, sku, qty, unit,
               unit_price, discount, discount_type, notes, item_status, bogo_applied,
               variant_label, cost_price, purchase_unit, conversion_factor, line_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             ON CONFLICT (id, tenant_id) DO NOTHING`,
            [
              it.id ?? randomUUID(), tenantId, sale.id,
              it.productName ?? "", it.localName ?? null, it.sku ?? "",
              toStrOrEmpty(it.qty, "0"), it.unit ?? "", toStrOrEmpty(it.unitPrice, "0"),
              toStrOrEmpty(it.discount, "0"), it.discountType ?? null,
              it.notes ?? "", it.itemStatus ?? "Pending",
              it.bogoApplied === true, it.variantLabel ?? null,
              toStrOrNull(it.costPrice), it.purchaseUnit ?? null,
              toStrOrNull(it.conversionFactor), i,
            ],
          );
        }
        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate','sale',$3,'create',NULL,$4)`,
          [
            randomUUID(), tenantId, sale.id,
            JSON.stringify({ saleNumber: sale.saleNumber, customer: sale.customer ?? "", itemCount: items.length, amountPaid: toStrOrEmpty(sale.amountPaid, "0") }),
          ],
        );
        await client.query("COMMIT");
        result.sales.inserted++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.sales.errors.push(
        `Sale ${sale.id} (${sale.saleNumber}): ${(err as Error).message}`,
      );
    }
  }

  return result;
}

/**
 * Generic master/lookup migrator. Handles tiny tables with a global-PK `id`,
 * `tenant_id`, simple scalar columns, `created_at`/`updated_at`, and no nested
 * JSON. Mirrors the customers/products pattern: cross-tenant collision is an
 * error, ON CONFLICT...RETURNING id guards real inserts, audit row per insert.
 */
async function migrateMaster<T extends { id: string; createdAt?: string; updatedAt?: string }>(opts: {
  tenantId: string;
  dryRun: boolean;
  result: MigrateResult;
  section: keyof MigrateResult & (
    "brands" | "productCategories" | "units" | "attributes" |
    "leads" | "departments" | "designations" |
    "cities" | "areas" | "requirementDocs" |
    "stockItems" | "stockLedger"
  );
  kvKey: string;
  table: string;
  entityType: string;
  columns: string[];
  extractValues: (row: T) => unknown[];
  auditSummary: (row: T) => Record<string, unknown>;
  /** Optional display-name extractor for tables where the natural label is not `name`
   *  (e.g. designations use `title`). Used for the required-field guard and error messages. */
  getDisplayName?: (row: T) => string | undefined;
}): Promise<void> {
  const { tenantId, dryRun, result, section, kvKey, table, entityType, columns, extractValues, auditSummary, getDisplayName } = opts;
  assertIdent(table);
  for (const c of columns) assertIdent(c);
  const bucket = result[section] as MigrateSection;
  const nameOf = (row: T): string | undefined =>
    getDisplayName ? getDisplayName(row) : (row as { name?: string }).name;

  const raw = await readKv(tenantId, kvKey);
  const rows: T[] = Array.isArray(raw) ? (raw as T[]) : [];
  bucket.found = rows.length;

  for (const row of rows) {
    try {
      const display = nameOf(row);
      if (!row?.id || !display) {
        bucket.errors.push(`${entityType} ${row?.id ?? "?"}: missing required fields (id + name/title) — skipped`);
        bucket.skipped++;
        continue;
      }

      const existing = await query<{ tenant_id: string }>(
        `SELECT tenant_id FROM ${table} WHERE id = $1 LIMIT 1`,
        [row.id],
      );
      if (existing.length > 0) {
        if (existing[0].tenant_id !== tenantId) {
          bucket.errors.push(
            `${entityType} ${row.id} (${display}): id already exists under another tenant (${existing[0].tenant_id}) — skipped`,
          );
        }
        bucket.skipped++;
        continue;
      }

      if (dryRun) { bucket.inserted++; continue; }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const allCols = ["id", "tenant_id", ...columns, "created_at", "updated_at"];
        const placeholders = allCols.map((_, i) => `$${i + 1}`).join(",");
        const values = [
          row.id,
          tenantId,
          ...extractValues(row),
          row.createdAt ? new Date(row.createdAt) : new Date(),
          row.updatedAt ? new Date(row.updatedAt) : new Date(),
        ];
        const ins = await client.query(
          `INSERT INTO ${table} (${allCols.join(",")}) VALUES (${placeholders})
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          values,
        );
        if (ins.rowCount && ins.rowCount > 0) {
          await client.query(
            `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
             VALUES ($1,$2,'migrate',$3,$4,'create',NULL,$5)`,
            [randomUUID(), tenantId, entityType, row.id, JSON.stringify(auditSummary(row))],
          );
          await client.query("COMMIT");
          bucket.inserted++;
        } else {
          await client.query("ROLLBACK");
          bucket.errors.push(`${entityType} ${row.id} (${display}): id collision detected during insert — skipped`);
          bucket.skipped++;
        }
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      bucket.errors.push(`${entityType} ${row.id} (${nameOf(row) ?? "?"}): ${(err as Error).message}`);
    }
  }
}

/** Run migrations for multiple tenants and print a summary. */
export async function migrateMultipleTenants(
  tenantIds: string[],
  dryRun = true,
): Promise<void> {
  console.log(`\n=== Tenant migration (dryRun=${dryRun}) ===`);
  for (const tid of tenantIds) {
    const r = await migrateTenant(tid, dryRun);
    console.log(`\nTenant: ${tid}`);
    console.log(`  Accounts: found=${r.accounts.found} inserted=${r.accounts.inserted} skipped=${r.accounts.skipped}`);
    if (r.accounts.errors.length) r.accounts.errors.forEach(e => console.error(`  [!] ${e}`));
    console.log(`  JEs:      found=${r.journalEntries.found} inserted=${r.journalEntries.inserted} skipped=${r.journalEntries.skipped}`);
    if (r.journalEntries.errors.length) r.journalEntries.errors.forEach(e => console.error(`  [!] ${e}`));
  }
  console.log("\n=== Done ===\n");
}
