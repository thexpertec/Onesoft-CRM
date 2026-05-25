/**
 * One-shot, idempotent migration: partition the legacy `global/repair-bookings`
 * KV blob into per-tenant `t:{tenantId}/repair-bookings` buckets.
 *
 * Why: prior to May 2026 every tenant's bookings were written to a single
 * shared global key that was both readable and writable anonymously, leaking
 * every tenant's repair queue cross-tenant. The fix moves bookings to the
 * standard `t:{tid}/...` namespace shape used by every other tenant-scoped
 * resource, and tightens the anon allowlist (see routes/kv.ts).
 *
 * Behaviour:
 *   - Reads `global/repair-bookings`. If absent or empty array, no-op.
 *   - Groups bookings by their `tenantId` field. Bookings missing a tenantId
 *     are kept under the `global` namespace so a superadmin can manually
 *     reclassify them — never silently dropped.
 *   - For each tenant bucket, reads the existing per-tenant array (if any),
 *     dedupes by booking `id` (existing rows win), and writes the merged
 *     array back.
 *   - On full success, deletes the legacy global key.
 *   - Runs inside a single transaction so a failure mid-way leaves the legacy
 *     blob intact — the migration can be retried on the next server start.
 *
 * Idempotent: re-running after a successful migration finds the global key
 * gone and exits immediately. Re-running mid-failure picks up where it left
 * off because the per-tenant writes merge with existing data.
 */

import { pool } from "./db.js";
import { logger } from "./logger.js";

interface RepairBooking {
  id?: string;
  tenantId?: string;
  [key: string]: unknown;
}

export async function migrateRepairBookings(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = 'global' AND key = 'repair-bookings' FOR UPDATE`,
    );
    if (existing.rows.length === 0) {
      await client.query("COMMIT");
      return;
    }
    const raw = existing.rows[0]!.value;
    const bookings: RepairBooking[] = Array.isArray(raw) ? (raw as RepairBooking[]) : [];
    if (bookings.length === 0) {
      // Empty legacy blob — just drop it.
      await client.query(
        `DELETE FROM kv_store WHERE namespace = 'global' AND key = 'repair-bookings'`,
      );
      await client.query("COMMIT");
      logger.info("[migrate-repair-bookings] empty legacy key removed");
      return;
    }

    // Partition by tenantId. Bookings without a tenantId remain under
    // `global` so they're not silently lost; an admin can retag them later.
    const byTenant = new Map<string, RepairBooking[]>();
    for (const b of bookings) {
      const ns = b?.tenantId ? `t:${b.tenantId}` : "global";
      const arr = byTenant.get(ns) ?? [];
      arr.push(b);
      byTenant.set(ns, arr);
    }

    let totalWritten = 0;
    let touchedNs = 0;
    for (const [ns, newRows] of byTenant) {
      if (ns === "global") {
        // We're about to DELETE the global key — but we have untenanted rows
        // we don't want to lose. Stash them under a sentinel key so the data
        // is preserved without re-leaking through the original anon-readable
        // path.
        const orphanCount = newRows.length;
        await client.query(
          `INSERT INTO kv_store (namespace, key, value, updated_at)
           VALUES ('global', 'repair-bookings-orphans', $1::jsonb, NOW())
           ON CONFLICT (namespace, key) DO UPDATE
             SET value = $1::jsonb, updated_at = NOW()`,
          [JSON.stringify(newRows)],
        );
        logger.warn(
          { count: orphanCount },
          "[migrate-repair-bookings] bookings without tenantId stashed at global/repair-bookings-orphans",
        );
        continue;
      }

      // Merge with any existing per-tenant rows (an admin may have already
      // started using the per-tenant key before migration ran). Existing rows
      // win on id collision so we never overwrite admin edits.
      const tenantRow = await client.query<{ value: unknown }>(
        `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'repair-bookings' FOR UPDATE`,
        [ns],
      );
      const tenantExisting: RepairBooking[] = tenantRow.rows.length > 0 && Array.isArray(tenantRow.rows[0]!.value)
        ? (tenantRow.rows[0]!.value as RepairBooking[])
        : [];
      const seen = new Set<string>();
      const merged: RepairBooking[] = [];
      for (const b of tenantExisting) {
        if (b?.id) seen.add(String(b.id));
        merged.push(b);
      }
      for (const b of newRows) {
        const id = b?.id ? String(b.id) : "";
        if (id && seen.has(id)) continue;
        merged.push(b);
        if (id) seen.add(id);
      }
      await client.query(
        `INSERT INTO kv_store (namespace, key, value, updated_at)
         VALUES ($1, 'repair-bookings', $2::jsonb, NOW())
         ON CONFLICT (namespace, key) DO UPDATE
           SET value = $2::jsonb, updated_at = NOW()`,
        [ns, JSON.stringify(merged)],
      );
      totalWritten += newRows.length;
      touchedNs++;
    }

    await client.query(
      `DELETE FROM kv_store WHERE namespace = 'global' AND key = 'repair-bookings'`,
    );
    await client.query("COMMIT");
    logger.info(
      { bookings: totalWritten, tenants: touchedNs, total: bookings.length },
      "[migrate-repair-bookings] partitioned legacy global key into per-tenant buckets",
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err }, "[migrate-repair-bookings] failed — legacy key left intact");
    throw err;
  } finally {
    client.release();
  }
}
