/**
 * Platform-globals migrator.
 *
 * Reads the three `global` namespace KV blobs that hold platform-wide config
 * (admin users, tenant registry, module groups) and writes them to their
 * dedicated relational tables:
 *
 *   admin-users         → admin_users   (NEW table)
 *   admin-tenants       → tenants       (EXISTING table — FK target for every
 *                                        per-tenant table; upsert by id)
 *   admin-module-groups → module_groups (NEW table)
 *
 * Unlike the per-tenant migrator, platform globals have no tenant_id column on
 * the result rows. Audit entries are still written with tenant_id = NULL
 * (audit_log.tenant_id is nullable for exactly this reason).
 *
 * Tenants section uses ON CONFLICT (id) DO UPDATE so re-running this picks up
 * superadmin edits made via the KV path; users + module_groups use
 * insert-only (ON CONFLICT DO NOTHING) to match the per-tenant migrator's
 * conservative idempotency semantics.
 */

import { randomUUID } from "node:crypto";
import { pool, query } from "./db.js";

interface FrontendAdminUser {
  id: string;
  username: string;
  fullName?: string;
  email?: string;
  role: string;
  password: string;
  assignedTenants?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface FrontendTenant {
  id: string;
  name: string;
  slug: string;
  adminUsername: string;
  adminPassword: string;
  contactEmail: string;
  status?: string;
  plan?: string;
  moduleGroupId?: string;
  isDemo?: boolean;
  demoResetInterval?: number;
  demoLastReset?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface FrontendModuleGroup {
  id: string;
  name: string;
  description?: string;
  modules?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformMigrateSection {
  found:    number;
  inserted: number;
  updated:  number;
  skipped:  number;
  errors:   string[];
}

export interface PlatformMigrateResult {
  dryRun:       boolean;
  adminUsers:   PlatformMigrateSection;
  tenants:      PlatformMigrateSection;
  moduleGroups: PlatformMigrateSection;
}

async function readGlobalKv(key: string): Promise<unknown> {
  const rows = await query<{ value: unknown }>(
    `SELECT value FROM kv_store WHERE namespace = 'global' AND key = $1 LIMIT 1`,
    [key],
  );
  if (rows.length === 0) return null;
  const raw = rows[0].value;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function blankSection(): PlatformMigrateSection {
  return { found: 0, inserted: 0, updated: 0, skipped: 0, errors: [] };
}

export async function migratePlatform(dryRun = true): Promise<PlatformMigrateResult> {
  const result: PlatformMigrateResult = {
    dryRun,
    adminUsers:   blankSection(),
    tenants:      blankSection(),
    moduleGroups: blankSection(),
  };

  // ── 1. Tenants ──────────────────────────────────────────────────────────────
  // Tenants must run FIRST: admin_users.assigned_tenants and module_groups
  // references depend on tenant ids existing. (FK on admin_users is not
  // enforced — assigned_tenants is a plain TEXT[] — but order keeps the
  // resulting DB self-consistent for any downstream queries that join.)
  const rawTenants = await readGlobalKv("admin-tenants");
  const tenants: FrontendTenant[] = Array.isArray(rawTenants) ? rawTenants as FrontendTenant[] : [];
  result.tenants.found = tenants.length;

  for (const t of tenants) {
    try {
      if (!t?.id || !t?.name || !t?.slug || !t?.adminUsername) {
        result.tenants.errors.push(
          `Tenant ${t?.id ?? "?"} (${t?.name ?? "?"}): missing required field (id/name/slug/adminUsername) — skipped`,
        );
        result.tenants.skipped++;
        continue;
      }

      const existing = await query<{ id: string }>(
        `SELECT id FROM tenants WHERE id = $1 LIMIT 1`,
        [t.id],
      );
      const alreadyExists = existing.length > 0;

      if (dryRun) {
        if (alreadyExists) result.tenants.updated++;
        else               result.tenants.inserted++;
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // UPSERT — tenants is the FK target; we want the relational row to
        // reflect the latest superadmin edit even on re-run.
        const res = await client.query(
          `INSERT INTO tenants
             (id, name, slug, admin_username, admin_password_hash, contact_email,
              status, plan, module_group_id, is_demo, demo_reset_interval,
              demo_last_reset, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (id) DO UPDATE SET
             name                = EXCLUDED.name,
             slug                = EXCLUDED.slug,
             admin_username      = EXCLUDED.admin_username,
             admin_password_hash = EXCLUDED.admin_password_hash,
             contact_email       = EXCLUDED.contact_email,
             status              = EXCLUDED.status,
             plan                = EXCLUDED.plan,
             module_group_id     = EXCLUDED.module_group_id,
             is_demo             = EXCLUDED.is_demo,
             demo_reset_interval = EXCLUDED.demo_reset_interval,
             demo_last_reset     = EXCLUDED.demo_last_reset,
             updated_at          = EXCLUDED.updated_at
           RETURNING (xmax = 0) AS inserted`,
          [
            t.id, t.name, t.slug, t.adminUsername,
            t.adminPassword ?? "",
            t.contactEmail ?? "",
            t.status ?? "active",
            t.plan ?? "free",
            t.moduleGroupId ?? null,
            Boolean(t.isDemo),
            t.demoResetInterval ?? null,
            t.demoLastReset ? new Date(t.demoLastReset) : null,
            t.createdAt ? new Date(t.createdAt) : new Date(),
            t.updatedAt ? new Date(t.updatedAt) : new Date(),
          ],
        );
        const wasInsert = res.rows[0]?.inserted === true;
        await client.query(
          `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
           VALUES ($1,$2,'migrate-platform','tenant',$3,$4,NULL,$5)`,
          [
            randomUUID(), t.id, t.id, wasInsert ? "create" : "update",
            JSON.stringify({ name: t.name, slug: t.slug, plan: t.plan ?? "free", status: t.status ?? "active" }),
          ],
        );
        await client.query("COMMIT");
        if (wasInsert) result.tenants.inserted++;
        else           result.tenants.updated++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.tenants.errors.push(
        `Tenant ${t?.id ?? "?"} (${t?.name ?? "?"}): ${(err as Error).message}`,
      );
    }
  }

  // ── 2. Module groups ────────────────────────────────────────────────────────
  const rawGroups = await readGlobalKv("admin-module-groups");
  const groups: FrontendModuleGroup[] = Array.isArray(rawGroups) ? rawGroups as FrontendModuleGroup[] : [];
  result.moduleGroups.found = groups.length;

  for (const g of groups) {
    try {
      if (!g?.id || !g?.name) {
        result.moduleGroups.errors.push(
          `Module group ${g?.id ?? "?"} (${g?.name ?? "?"}): missing required field (id/name) — skipped`,
        );
        result.moduleGroups.skipped++;
        continue;
      }
      const existing = await query<{ id: string }>(
        `SELECT id FROM module_groups WHERE id = $1 LIMIT 1`,
        [g.id],
      );
      if (existing.length > 0) { result.moduleGroups.skipped++; continue; }
      if (dryRun) { result.moduleGroups.inserted++; continue; }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          `INSERT INTO module_groups (id, name, description, modules, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            g.id, g.name, g.description ?? "",
            Array.isArray(g.modules) ? g.modules : [],
            g.createdAt ? new Date(g.createdAt) : new Date(),
            g.updatedAt ? new Date(g.updatedAt) : new Date(),
          ],
        );
        if ((ins.rowCount ?? 0) > 0) {
          await client.query(
            `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
             VALUES ($1,NULL,'migrate-platform','module_group',$2,'create',NULL,$3)`,
            [randomUUID(), g.id, JSON.stringify({ name: g.name, modules: g.modules ?? [] })],
          );
          await client.query("COMMIT");
          result.moduleGroups.inserted++;
        } else {
          await client.query("ROLLBACK");
          result.moduleGroups.skipped++;
        }
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.moduleGroups.errors.push(
        `Module group ${g?.id ?? "?"} (${g?.name ?? "?"}): ${(err as Error).message}`,
      );
    }
  }

  // ── 3. Admin users ──────────────────────────────────────────────────────────
  const rawUsers = await readGlobalKv("admin-users");
  const users: FrontendAdminUser[] = Array.isArray(rawUsers) ? rawUsers as FrontendAdminUser[] : [];
  result.adminUsers.found = users.length;

  for (const u of users) {
    try {
      if (!u?.id || !u?.username || !u?.role) {
        result.adminUsers.errors.push(
          `Admin user ${u?.id ?? "?"} (${u?.username ?? "?"}): missing required field (id/username/role) — skipped`,
        );
        result.adminUsers.skipped++;
        continue;
      }
      // Username uniqueness is enforced by admin_users_username_uq (case-
      // insensitive). Pre-check so cross-id collisions report a clear error
      // instead of bubbling up a 23505 message.
      const dupe = await query<{ id: string }>(
        `SELECT id FROM admin_users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1`,
        [u.username, u.id],
      );
      if (dupe.length > 0) {
        result.adminUsers.errors.push(
          `Admin user ${u.id} (${u.username}): username already taken by user ${dupe[0].id} — skipped`,
        );
        result.adminUsers.skipped++;
        continue;
      }
      const existing = await query<{ id: string }>(
        `SELECT id FROM admin_users WHERE id = $1 LIMIT 1`,
        [u.id],
      );
      if (existing.length > 0) { result.adminUsers.skipped++; continue; }
      if (dryRun) { result.adminUsers.inserted++; continue; }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          `INSERT INTO admin_users
             (id, username, full_name, email, role, password, assigned_tenants, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            u.id, u.username, u.fullName ?? "", u.email ?? "", u.role, u.password,
            Array.isArray(u.assignedTenants) ? u.assignedTenants : [],
            u.createdAt ? new Date(u.createdAt) : new Date(),
            u.updatedAt ? new Date(u.updatedAt) : new Date(),
          ],
        );
        if ((ins.rowCount ?? 0) > 0) {
          await client.query(
            `INSERT INTO audit_log (id, tenant_id, actor, entity_type, entity_id, operation, before_json, after_json)
             VALUES ($1,NULL,'migrate-platform','admin_user',$2,'create',NULL,$3)`,
            [randomUUID(), u.id, JSON.stringify({ username: u.username, role: u.role, email: u.email ?? "" })],
          );
          await client.query("COMMIT");
          result.adminUsers.inserted++;
        } else {
          await client.query("ROLLBACK");
          result.adminUsers.skipped++;
        }
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      result.adminUsers.errors.push(
        `Admin user ${u?.id ?? "?"} (${u?.username ?? "?"}): ${(err as Error).message}`,
      );
    }
  }

  return result;
}

export interface PlatformMigrationStatus {
  db: { adminUsers: number; tenants: number; moduleGroups: number };
  kv: { adminUsers: number; tenants: number; moduleGroups: number };
}

export async function getPlatformStatus(): Promise<PlatformMigrationStatus> {
  const [usr] = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM admin_users`);
  const [ten] = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM tenants WHERE archived_at IS NULL`);
  const [grp] = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM module_groups`);

  const kvCount = async (key: string): Promise<number> => {
    const raw = await readGlobalKv(key);
    return Array.isArray(raw) ? raw.length : 0;
  };

  return {
    db: {
      adminUsers:   parseInt(usr?.count ?? "0", 10),
      tenants:      parseInt(ten?.count ?? "0", 10),
      moduleGroups: parseInt(grp?.count ?? "0", 10),
    },
    kv: {
      adminUsers:   await kvCount("admin-users"),
      tenants:      await kvCount("admin-tenants"),
      moduleGroups: await kvCount("admin-module-groups"),
    },
  };
}
