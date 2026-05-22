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
import { randomUUID } from "node:crypto";

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

export interface MigrateResult {
  tenantId: string;
  dryRun: boolean;
  accounts: { found: number; inserted: number; skipped: number; errors: string[] };
  journalEntries: { found: number; inserted: number; skipped: number; errors: string[] };
  customers: { found: number; inserted: number; skipped: number; errors: string[] };
  products: { found: number; inserted: number; skipped: number; errors: string[] };
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
    accounts: { found: 0, inserted: 0, skipped: 0, errors: [] },
    journalEntries: { found: 0, inserted: 0, skipped: 0, errors: [] },
    customers: { found: 0, inserted: 0, skipped: 0, errors: [] },
    products: { found: 0, inserted: 0, skipped: 0, errors: [] },
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

  return result;
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
