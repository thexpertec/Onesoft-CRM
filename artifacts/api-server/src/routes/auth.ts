import { Router } from "express";
import { query } from "../lib/db.js";

const router = Router();

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  isDemo: boolean;
  adminUsername: string;
  adminPassword: string;
  contactEmail: string;
  demoResetInterval: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * POST /api/auth/verify-tenant
 * Body: { username: string, password: string }
 *
 * Checks tenant credentials directly against the database — no client-side
 * sync or cache involved.  This is the single source of truth for tenant login.
 *
 * Returns:
 *   200 { ok: true,  tenant: { id, name, slug, status, plan, isDemo, ... } }
 *   200 { ok: false, reason: "not_found" | "suspended" }
 *   400 { error: "username and password are required" }
 *   500 { error: "internal server error" }
 */
router.post("/verify-tenant", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || password === undefined || password === null) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const rows = await query<{ value: Tenant[] }>(
      "SELECT value FROM kv_store WHERE namespace = 'global' AND key = 'admin-tenants'",
      []
    );

    if (rows.length === 0) {
      return res.json({ ok: false, reason: "not_found" });
    }

    const tenants: Tenant[] = Array.isArray(rows[0].value) ? rows[0].value : [];

    const tenant = tenants.find(
      t =>
        typeof t.adminUsername === "string" &&
        t.adminUsername.toLowerCase() === username.toLowerCase() &&
        t.adminPassword === password
    );

    if (!tenant) {
      return res.json({ ok: false, reason: "not_found" });
    }

    if (tenant.status === "suspended") {
      return res.json({ ok: false, reason: "suspended" });
    }

    // Return the full tenant object so the client can populate its session
    // without needing a separate fetch.
    const { adminPassword: _pw, ...safeTenant } = tenant;
    return res.json({ ok: true, tenant: safeTenant });
  } catch (err) {
    console.error("auth/verify-tenant error", err);
    return res.status(500).json({ error: "internal server error" });
  }
});

export default router;
