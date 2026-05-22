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
  invoices:          MigrateSection;
  saleReturns:       MigrateSection;
  purchaseReturns:   MigrateSection;
  rpVouchers:        MigrateSection;
  staff:             MigrateSection;
  settings:          MigrateSection;
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
    invoices:          { found: 0, inserted: 0, skipped: 0, errors: [] },
    saleReturns:       { found: 0, inserted: 0, skipped: 0, errors: [] },
    purchaseReturns:   { found: 0, inserted: 0, skipped: 0, errors: [] },
    rpVouchers:        { found: 0, inserted: 0, skipped: 0, errors: [] },
    staff:             { found: 0, inserted: 0, skipped: 0, errors: [] },
    settings:          { found: 0, inserted: 0, skipped: 0, errors: [] },
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

  // ── 11. Invoices + Items + Payments ────────────────────────────────────────
  // Same parent+items shape as Sales/PO, plus a second child table for the
  // PaymentRecord history. Sale and purchase invoices share the table — they
  // are distinguished by invoice_type. paymentHistory[] is exploded into the
  // invoice_payments child so each payment is independently queryable.
  type IncomingInvoiceItem = {
    id?: string; productName?: string; localName?: string; sku?: string;
    qty?: unknown; unit?: string; unitPrice?: unknown;
    discount?: unknown; discountType?: string;
    notes?: string; itemStatus?: string;
    bogoApplied?: boolean; variantLabel?: string;
    costPrice?: unknown; purchaseUnit?: string; conversionFactor?: unknown;
  };
  type IncomingPaymentRecord = {
    id?: string; date?: string; amount?: unknown;
    method?: string; note?: string; jeRef?: string;
  };
  type IncomingInvoiceDoc = { id: string; title: string; content: string };
  type IncomingInvoice = {
    id: string; invoiceNumber: string; invoiceTitle?: string;
    invoiceType?: "sale" | "purchase";
    invoiceDate?: string; dueDate?: string;
    customer?: string; customerId?: string;
    buyerAddress?: string; buyerTown?: string; buyerPhone?: string; buyerEmail?: string;
    salesOfficer?: string;
    status?: string; saleStatus?: string; stockReceived?: boolean;
    paymentMethod?: string; paymentTerms?: string;
    bankDetails?: string; bankAccountIds?: string[];
    amountPaid?: unknown; paidAt?: string;
    paymentHistory?: IncomingPaymentRecord[];
    items?: IncomingInvoiceItem[];
    taxRate?: unknown; pricingMode?: "wholesale" | "retail";
    shippingFee?: unknown; handlingFee?: unknown; shippingMethod?: string;
    agentId?: string; agentName?: string;
    notes?: string; agreement?: string; invoiceFooter?: string;
    invoiceDocs?: IncomingInvoiceDoc[];
    stockDeducted?: boolean; jeId?: string; jeUsesAr?: boolean; jeUsesAR?: boolean;
    createdAt?: string; updatedAt?: string;
  };

  // Reuse the toStrOrEmpty / toStrOrNull helpers defined in the Sales section
  // above — they're in scope here.
  const rawInvoices = await readKv(tenantId, "admin-invoices");
  const invoices: IncomingInvoice[] = Array.isArray(rawInvoices) ? (rawInvoices as IncomingInvoice[]) : [];
  result.invoices.found = invoices.length;

  for (const inv of invoices) {
    try {
      if (!inv.id || !inv.invoiceNumber) {
        result.invoices.errors.push(
          `Invoice ${inv.id ?? "(no id)"}: missing required field (id or invoiceNumber) — skipped`,
        );
        result.invoices.skipped++;
        continue;
      }
      const existing = await query(
        `SELECT id FROM invoices WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [inv.id, tenantId],
      );
      if (existing.length > 0) {
        result.invoices.skipped++;
        continue;
      }
      if (dryRun) {
        result.invoices.inserted++;
        continue;
      }

      const items = Array.isArray(inv.items) ? inv.items : [];
      const payments = Array.isArray(inv.paymentHistory) ? inv.paymentHistory : [];
      const bankAccountIds = Array.isArray(inv.bankAccountIds) ? inv.bankAccountIds.filter(x => typeof x === "string") : null;
      const jeUsesAr = inv.jeUsesAr ?? inv.jeUsesAR ?? null;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO invoices
            (id, tenant_id, invoice_number, invoice_title, invoice_type,
             invoice_date, due_date, customer, customer_id,
             buyer_address, buyer_town, buyer_phone, buyer_email, sales_officer,
             status, sale_status, stock_received,
             payment_method, payment_terms, bank_details, bank_account_ids,
             amount_paid, paid_at, tax_rate, pricing_mode,
             shipping_fee, handling_fee, shipping_method,
             agent_id, agent_name,
             notes, agreement, invoice_footer, invoice_docs,
             stock_deducted, je_id, je_uses_ar,
             created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)
           ON CONFLICT (id, tenant_id) DO NOTHING`,
          [
            inv.id, tenantId, inv.invoiceNumber,
            inv.invoiceTitle ?? "Invoice",
            inv.invoiceType ?? "sale",
            inv.invoiceDate ?? "", inv.dueDate ?? "",
            inv.customer ?? "", inv.customerId ?? "",
            inv.buyerAddress ?? "", inv.buyerTown ?? "",
            inv.buyerPhone ?? "", inv.buyerEmail ?? "",
            inv.salesOfficer ?? "",
            inv.status ?? "Draft",
            inv.saleStatus ?? null,
            typeof inv.stockReceived === "boolean" ? inv.stockReceived : null,
            inv.paymentMethod ?? "", inv.paymentTerms ?? "",
            inv.bankDetails ?? "", bankAccountIds,
            toStrOrEmpty(inv.amountPaid, "0"), inv.paidAt ?? "",
            toStrOrEmpty(inv.taxRate, "0"), inv.pricingMode ?? null,
            toStrOrEmpty(inv.shippingFee, "0"), toStrOrEmpty(inv.handlingFee, "0"),
            inv.shippingMethod ?? "",
            inv.agentId ?? null, inv.agentName ?? null,
            inv.notes ?? "", inv.agreement ?? "", inv.invoiceFooter ?? "",
            Array.isArray(inv.invoiceDocs) ? JSON.stringify(inv.invoiceDocs) : null,
            inv.stockDeducted === true,
            inv.jeId ?? null,
            typeof jeUsesAr === "boolean" ? jeUsesAr : null,
            inv.createdAt ? new Date(inv.createdAt) : new Date(),
            inv.updatedAt ? new Date(inv.updatedAt) : new Date(),
          ],
        );
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          await client.query(
            `INSERT INTO invoice_items
              (id, tenant_id, invoice_id, product_name, local_name, sku, qty, unit,
               unit_price, discount, discount_type, notes, item_status, bogo_applied,
               variant_label, cost_price, purchase_unit, conversion_factor, line_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             ON CONFLICT (id, tenant_id) DO NOTHING`,
            [
              it.id ?? randomUUID(), tenantId, inv.id,
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
        for (let i = 0; i < payments.length; i++) {
          const pay = payments[i];
          await client.query(
            `INSERT INTO invoice_payments
              (id, tenant_id, invoice_id, payment_date, amount, method, note, je_ref, line_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id, tenant_id) DO NOTHING`,
            [
              pay.id ?? randomUUID(), tenantId, inv.id,
              pay.date ?? "", toStrOrEmpty(pay.amount, "0"),
              pay.method ?? "", pay.note ?? "",
              pay.jeRef ?? null, i,
            ],
          );
        }
        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate','invoice',$3,'create',NULL,$4)`,
          [
            randomUUID(), tenantId, inv.id,
            JSON.stringify({
              invoiceNumber: inv.invoiceNumber,
              invoiceType: inv.invoiceType ?? "sale",
              customer: inv.customer ?? "",
              itemCount: items.length,
              paymentCount: payments.length,
              amountPaid: toStrOrEmpty(inv.amountPaid, "0"),
            }),
          ],
        );
        await client.query("COMMIT");
        result.invoices.inserted++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.invoices.errors.push(
        `Invoice ${inv.id} (${inv.invoiceNumber}): ${(err as Error).message}`,
      );
    }
  }

  // ── 12. Sale Returns + Items ───────────────────────────────────────────────
  type IncomingSaleReturnItem = {
    id?: string; productName?: string; sku?: string; unit?: string;
    qty?: unknown; unitPrice?: unknown; discount?: unknown; costPrice?: unknown;
  };
  type IncomingSaleReturn = {
    id: string; returnNumber: string;
    originalSaleNumber?: string; originalSaleId?: string;
    date?: string; customer?: string; refundMethod?: string;
    items?: IncomingSaleReturnItem[];
    subtotal?: unknown; taxAmount?: unknown; grandTotal?: unknown;
    reason?: string; notes?: string;
    status?: "draft" | "posted";
    jeId?: string;
    createdAt?: string; updatedAt?: string;
  };

  const rawSaleReturns = await readKv(tenantId, "admin-sale-returns");
  const saleReturns: IncomingSaleReturn[] = Array.isArray(rawSaleReturns) ? (rawSaleReturns as IncomingSaleReturn[]) : [];
  result.saleReturns.found = saleReturns.length;

  for (const sr of saleReturns) {
    try {
      if (!sr.id || !sr.returnNumber) {
        result.saleReturns.errors.push(
          `Sale Return ${sr.id ?? "(no id)"}: missing required field (id or returnNumber) — skipped`,
        );
        result.saleReturns.skipped++;
        continue;
      }
      const existing = await query(
        `SELECT id FROM sale_returns WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [sr.id, tenantId],
      );
      if (existing.length > 0) { result.saleReturns.skipped++; continue; }
      if (dryRun) { result.saleReturns.inserted++; continue; }

      const items = Array.isArray(sr.items) ? sr.items : [];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO sale_returns
            (id, tenant_id, return_number, original_sale_number, original_sale_id,
             return_date, customer, refund_method,
             subtotal, tax_amount, grand_total,
             reason, notes, status, je_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (id, tenant_id) DO NOTHING`,
          [
            sr.id, tenantId, sr.returnNumber,
            sr.originalSaleNumber ?? "", sr.originalSaleId ?? "",
            sr.date ?? "", sr.customer ?? "",
            sr.refundMethod ?? "Cash",
            toStrOrEmpty(sr.subtotal, "0"),
            toStrOrEmpty(sr.taxAmount, "0"),
            toStrOrEmpty(sr.grandTotal, "0"),
            sr.reason ?? "", sr.notes ?? "",
            sr.status ?? "draft",
            sr.jeId ?? null,
            sr.createdAt ? new Date(sr.createdAt) : new Date(),
            sr.updatedAt ? new Date(sr.updatedAt) : new Date(),
          ],
        );
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          await client.query(
            `INSERT INTO sale_return_items
              (id, tenant_id, return_id, product_name, sku, unit, qty, unit_price, discount, cost_price, line_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id, tenant_id) DO NOTHING`,
            [
              it.id ?? randomUUID(), tenantId, sr.id,
              it.productName ?? "", it.sku ?? "", it.unit ?? "",
              toStrOrEmpty(it.qty, "0"), toStrOrEmpty(it.unitPrice, "0"),
              toStrOrEmpty(it.discount, "0"), toStrOrNull(it.costPrice), i,
            ],
          );
        }
        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate','sale_return',$3,'create',NULL,$4)`,
          [
            randomUUID(), tenantId, sr.id,
            JSON.stringify({
              returnNumber: sr.returnNumber,
              originalSaleNumber: sr.originalSaleNumber ?? "",
              itemCount: items.length,
              grandTotal: toStrOrEmpty(sr.grandTotal, "0"),
            }),
          ],
        );
        await client.query("COMMIT");
        result.saleReturns.inserted++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.saleReturns.errors.push(
        `Sale Return ${sr.id} (${sr.returnNumber}): ${(err as Error).message}`,
      );
    }
  }

  // ── 13. Purchase Returns + Items ───────────────────────────────────────────
  type IncomingPurchaseReturnItem = {
    id?: string; productName?: string; sku?: string; unit?: string;
    qty?: unknown; unitPrice?: unknown; discount?: unknown; category?: string;
  };
  type IncomingPurchaseReturn = {
    id: string; returnNumber: string;
    originalInvoiceNumber?: string; originalInvoiceId?: string;
    date?: string; supplier?: string; refundMethod?: string;
    items?: IncomingPurchaseReturnItem[];
    subtotal?: unknown; taxAmount?: unknown; grandTotal?: unknown;
    reason?: string; notes?: string;
    status?: "draft" | "posted";
    jeId?: string;
    createdAt?: string; updatedAt?: string;
  };

  const rawPurchaseReturns = await readKv(tenantId, "admin-purchase-returns");
  const purchaseReturns: IncomingPurchaseReturn[] = Array.isArray(rawPurchaseReturns) ? (rawPurchaseReturns as IncomingPurchaseReturn[]) : [];
  result.purchaseReturns.found = purchaseReturns.length;

  for (const pr of purchaseReturns) {
    try {
      if (!pr.id || !pr.returnNumber) {
        result.purchaseReturns.errors.push(
          `Purchase Return ${pr.id ?? "(no id)"}: missing required field (id or returnNumber) — skipped`,
        );
        result.purchaseReturns.skipped++;
        continue;
      }
      const existing = await query(
        `SELECT id FROM purchase_returns WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [pr.id, tenantId],
      );
      if (existing.length > 0) { result.purchaseReturns.skipped++; continue; }
      if (dryRun) { result.purchaseReturns.inserted++; continue; }

      const items = Array.isArray(pr.items) ? pr.items : [];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO purchase_returns
            (id, tenant_id, return_number, original_invoice_number, original_invoice_id,
             return_date, supplier, refund_method,
             subtotal, tax_amount, grand_total,
             reason, notes, status, je_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (id, tenant_id) DO NOTHING`,
          [
            pr.id, tenantId, pr.returnNumber,
            pr.originalInvoiceNumber ?? "", pr.originalInvoiceId ?? "",
            pr.date ?? "", pr.supplier ?? "",
            pr.refundMethod ?? "Cash",
            toStrOrEmpty(pr.subtotal, "0"),
            toStrOrEmpty(pr.taxAmount, "0"),
            toStrOrEmpty(pr.grandTotal, "0"),
            pr.reason ?? "", pr.notes ?? "",
            pr.status ?? "draft",
            pr.jeId ?? null,
            pr.createdAt ? new Date(pr.createdAt) : new Date(),
            pr.updatedAt ? new Date(pr.updatedAt) : new Date(),
          ],
        );
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          await client.query(
            `INSERT INTO purchase_return_items
              (id, tenant_id, return_id, product_name, sku, unit, qty, unit_price, discount, category, line_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id, tenant_id) DO NOTHING`,
            [
              it.id ?? randomUUID(), tenantId, pr.id,
              it.productName ?? "", it.sku ?? "", it.unit ?? "",
              toStrOrEmpty(it.qty, "0"), toStrOrEmpty(it.unitPrice, "0"),
              toStrOrEmpty(it.discount, "0"), it.category ?? null, i,
            ],
          );
        }
        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate','purchase_return',$3,'create',NULL,$4)`,
          [
            randomUUID(), tenantId, pr.id,
            JSON.stringify({
              returnNumber: pr.returnNumber,
              originalInvoiceNumber: pr.originalInvoiceNumber ?? "",
              itemCount: items.length,
              grandTotal: toStrOrEmpty(pr.grandTotal, "0"),
            }),
          ],
        );
        await client.query("COMMIT");
        result.purchaseReturns.inserted++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.purchaseReturns.errors.push(
        `Purchase Return ${pr.id} (${pr.returnNumber}): ${(err as Error).message}`,
      );
    }
  }

  // ── 14. Receipt/Payment Vouchers + Lines ───────────────────────────────────
  type IncomingRpLine = {
    id?: string; accountId?: string; accountName?: string;
    description?: string; amount?: unknown; invoiceId?: string;
  };
  type IncomingRpVoucher = {
    id: string; voucherNumber: string;
    voucherType?: "receipt" | "payment";
    date?: string;
    partyName?: string;
    cashBankAccountId?: string; cashBankAccountName?: string;
    reference?: string;
    lines?: IncomingRpLine[]; bankLines?: IncomingRpLine[];
    totalAmount?: unknown;
    narration?: string;
    status?: "draft" | "posted";
    journalEntryId?: string;
    linkedInvoiceId?: string;
    linkedInvoiceIds?: string[];
    createdAt?: string; updatedAt?: string;
  };

  const rawRpVouchers = await readKv(tenantId, "admin-rp-vouchers");
  const rpVouchers: IncomingRpVoucher[] = Array.isArray(rawRpVouchers) ? (rawRpVouchers as IncomingRpVoucher[]) : [];
  result.rpVouchers.found = rpVouchers.length;

  for (const v of rpVouchers) {
    try {
      if (!v.id || !v.voucherNumber) {
        result.rpVouchers.errors.push(
          `RP Voucher ${v.id ?? "(no id)"}: missing required field (id or voucherNumber) — skipped`,
        );
        result.rpVouchers.skipped++;
        continue;
      }
      const existing = await query(
        `SELECT id FROM rp_vouchers WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [v.id, tenantId],
      );
      if (existing.length > 0) { result.rpVouchers.skipped++; continue; }
      if (dryRun) { result.rpVouchers.inserted++; continue; }

      const lines = Array.isArray(v.lines) ? v.lines : [];
      const bankLines = Array.isArray(v.bankLines) ? v.bankLines : [];
      const linkedIds = Array.isArray(v.linkedInvoiceIds)
        ? v.linkedInvoiceIds.filter(x => typeof x === "string")
        : null;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO rp_vouchers
            (id, tenant_id, voucher_number, voucher_type, voucher_date,
             party_name, cash_bank_account_id, cash_bank_account_name, reference,
             total_amount, narration, status,
             journal_entry_id, linked_invoice_id, linked_invoice_ids,
             created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (id, tenant_id) DO NOTHING`,
          [
            v.id, tenantId, v.voucherNumber,
            v.voucherType ?? "receipt", v.date ?? "",
            v.partyName ?? "",
            v.cashBankAccountId ?? "", v.cashBankAccountName ?? "",
            v.reference ?? "",
            toStrOrEmpty(v.totalAmount, "0"),
            v.narration ?? "",
            v.status ?? "draft",
            v.journalEntryId ?? null,
            v.linkedInvoiceId ?? null,
            linkedIds,
            v.createdAt ? new Date(v.createdAt) : new Date(),
            v.updatedAt ? new Date(v.updatedAt) : new Date(),
          ],
        );
        const insertLine = async (kind: "line" | "bank", arr: IncomingRpLine[]) => {
          for (let i = 0; i < arr.length; i++) {
            const l = arr[i];
            await client.query(
              `INSERT INTO rp_voucher_lines
                (id, tenant_id, voucher_id, line_kind, account_id, account_name,
                 description, amount, invoice_id, line_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (id, tenant_id) DO NOTHING`,
              [
                l.id ?? randomUUID(), tenantId, v.id, kind,
                l.accountId ?? "", l.accountName ?? "",
                l.description ?? "",
                toStrOrEmpty(l.amount, "0"),
                l.invoiceId ?? null, i,
              ],
            );
          }
        };
        await insertLine("line", lines);
        await insertLine("bank", bankLines);
        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate','rp_voucher',$3,'create',NULL,$4)`,
          [
            randomUUID(), tenantId, v.id,
            JSON.stringify({
              voucherNumber: v.voucherNumber,
              voucherType: v.voucherType ?? "receipt",
              partyName: v.partyName ?? "",
              lineCount: lines.length,
              bankLineCount: bankLines.length,
              totalAmount: toStrOrEmpty(v.totalAmount, "0"),
              status: v.status ?? "draft",
            }),
          ],
        );
        await client.query("COMMIT");
        result.rpVouchers.inserted++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.rpVouchers.errors.push(
        `RP Voucher ${v.id} (${v.voucherNumber}): ${(err as Error).message}`,
      );
    }
  }

  // ── 15. Staff ──────────────────────────────────────────────────────────────
  // Mirrors the live staff table (drift-corrected). KV key `admin-hrm-staff`.
  // ledger_account_id / staff_payable_ledger_id FK into accounts(id, tenant_id)?
  // — the live table uses a single-column FK to accounts(id), so we follow that
  // convention here. Missing ledger refs are stored as NULL and the FK is
  // SET NULL on delete.
  type IncomingStaff = {
    id: string; name: string;
    fatherName?: string;
    department?: string; designation?: string; role?: string;
    status?: string; email?: string; phone?: string;
    joinDate?: string; leavingDate?: string; notes?: string;
    openingBalance?: unknown;
    salaryType?: string;
    basicSalary?: unknown; allowances?: unknown; deductions?: unknown;
    bankName?: string; accountNumber?: string;
    username?: string; passwordHash?: string; loginEnabled?: boolean;
    ledgerAccountId?: string; staffPayableLedgerId?: string;
    createdAt?: string; updatedAt?: string;
  };

  const rawStaff = await readKv(tenantId, "admin-hrm-staff");
  const staffList: IncomingStaff[] = Array.isArray(rawStaff) ? (rawStaff as IncomingStaff[]) : [];
  result.staff.found = staffList.length;

  const toNumOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isFinite(n) ? n : null;
  };
  const toNumOrZero = (v: unknown): number => toNumOrNull(v) ?? 0;
  const toDateOrNull = (v: unknown): string | null => {
    if (typeof v !== "string" || !v) return null;
    // Accept either YYYY-MM-DD or full ISO; return YYYY-MM-DD slice.
    return v.length >= 10 ? v.slice(0, 10) : null;
  };

  for (const s of staffList) {
    try {
      if (!s.id || !s.name) {
        result.staff.errors.push(
          `Staff ${s.id ?? "(no id)"}: missing required field (id or name) — skipped`,
        );
        result.staff.skipped++;
        continue;
      }
      const joinDate = toDateOrNull(s.joinDate);
      if (!joinDate) {
        result.staff.errors.push(
          `Staff ${s.id} (${s.name}): joinDate is required (got "${s.joinDate ?? ""}") — skipped`,
        );
        result.staff.skipped++;
        continue;
      }
      const existing = await query(
        `SELECT id FROM staff WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [s.id, tenantId],
      );
      if (existing.length > 0) { result.staff.skipped++; continue; }
      if (dryRun) { result.staff.inserted++; continue; }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          `INSERT INTO staff
            (id, tenant_id, name, father_name, department, designation, role, status,
             email, phone, join_date, leaving_date, notes,
             opening_balance, salary_type, basic_salary, allowances, deductions,
             bank_name, account_number, username, password_hash, login_enabled,
             ledger_account_id, staff_payable_ledger_id,
             created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            s.id, tenantId, s.name,
            s.fatherName ?? null,
            s.department ?? "", s.designation ?? "", s.role ?? "",
            s.status ?? "active",
            s.email ?? "", s.phone ?? "",
            joinDate, toDateOrNull(s.leavingDate),
            s.notes ?? "",
            toNumOrZero(s.openingBalance),
            s.salaryType ?? null,
            toNumOrNull(s.basicSalary), toNumOrNull(s.allowances), toNumOrNull(s.deductions),
            s.bankName ?? null, s.accountNumber ?? null,
            s.username ?? null, s.passwordHash ?? null,
            Boolean(s.loginEnabled),
            s.ledgerAccountId ?? null, s.staffPayableLedgerId ?? null,
            s.createdAt ? new Date(s.createdAt) : new Date(),
            s.updatedAt ? new Date(s.updatedAt) : new Date(),
          ],
        );
        // Cross-tenant id collision: the pre-check is scoped by (id, tenant_id)
        // but staff.id is globally unique (single-column PK), so a different
        // tenant may already own this id. ON CONFLICT swallows it silently —
        // count + audit only when we actually inserted (rowCount > 0).
        if ((ins.rowCount ?? 0) > 0) {
          await client.query(
            `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
             VALUES ($1,$2,'migrate','staff',$3,'create',NULL,$4)`,
            [
              randomUUID(), tenantId, s.id,
              JSON.stringify({
                name: s.name, designation: s.designation ?? "",
                role: s.role ?? "", status: s.status ?? "active",
                ledgerAccountId: s.ledgerAccountId ?? null,
                staffPayableLedgerId: s.staffPayableLedgerId ?? null,
              }),
            ],
          );
          await client.query("COMMIT");
          result.staff.inserted++;
        } else {
          await client.query("ROLLBACK");
          result.staff.skipped++;
          result.staff.errors.push(
            `Staff ${s.id} (${s.name}): id already exists in another tenant — skipped (staff.id is globally unique)`,
          );
        }
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.staff.errors.push(
        `Staff ${s.id} (${s.name}): ${(err as Error).message}`,
      );
    }
  }

  // ── 16. App Settings (single blob per tenant) ──────────────────────────────
  // AppSettings is one JSON object (not an array) keyed `admin-settings` in
  // the tenant namespace. It carries 80+ fields (font sizes, invoice labels,
  // COA mappings, print options, etc.) so we store it verbatim as JSONB in
  // admin_settings(tenant_id PK, payload, updated_at). Idempotency: presence
  // of the row counts as "skipped". UPDATE is intentionally NOT done here —
  // settings overwrite would silently clobber later UI edits on re-run; if a
  // re-sync is wanted, the row must be deleted first (or the dedicated
  // settings PUT route used). Found/inserted/skipped semantics:
  //   found    = 1 if blob present and is a non-null object (else 0)
  //   inserted = 1 if a new row was written (dry-run: 1 if would write)
  //   skipped  = 1 if a row already exists for this tenant
  try {
    const rawSettings = await readKv(tenantId, "admin-settings");
    const isObjBlob = rawSettings !== null
      && typeof rawSettings === "object"
      && !Array.isArray(rawSettings);
    result.settings.found = isObjBlob ? 1 : 0;

    if (isObjBlob) {
      const existing = await query(
        `SELECT tenant_id FROM admin_settings WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );
      if (existing.length > 0) {
        result.settings.skipped = 1;
      } else if (dryRun) {
        result.settings.inserted = 1;
      } else {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const ins = await client.query(
            `INSERT INTO admin_settings (tenant_id, payload, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (tenant_id) DO NOTHING
             RETURNING tenant_id`,
            [tenantId, JSON.stringify(rawSettings)],
          );
          if ((ins.rowCount ?? 0) > 0) {
            await client.query(
              `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
               VALUES ($1,$2,'migrate','app_settings',$2,'create',NULL,$3)`,
              [
                randomUUID(),
                tenantId,
                JSON.stringify({
                  fields: Object.keys(rawSettings as Record<string, unknown>).length,
                  companyName: (rawSettings as { companyName?: string }).companyName ?? null,
                }),
              ],
            );
            await client.query("COMMIT");
            result.settings.inserted = 1;
          } else {
            await client.query("ROLLBACK");
            result.settings.skipped = 1;
          }
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      }
    }
  } catch (err) {
    result.settings.errors.push(`Settings: ${(err as Error).message}`);
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
