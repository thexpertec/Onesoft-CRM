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
  };

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
