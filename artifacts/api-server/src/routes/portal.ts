import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { query } from "../lib/db.js";
import { rowToApi } from "../lib/records.js";

/**
 * Customer-portal authentication + per-customer sales lookup.
 *
 * These routes replace the anonymous reads of `admin-customers` and
 * `admin-sales` that the storefronts previously performed via `/api/kv/*`.
 * Each endpoint scopes the response to just what the caller needs (one
 * customer, one customer's orders) so the bulk-tenant-data leak is closed.
 *
 * Routes:
 *   POST   /login            { tenantId, email, passwordHash } -> { ok, customer }
 *   POST   /signup           { tenantId, email, passwordHash } -> { ok, customer }
 *   POST   /change-password  { tenantId, email, currentHash, newHash } -> { ok }
 *   GET    /sales            ?tenantId=...&customerName=...    -> { items: Sale[] }
 *
 * SECURITY NOTE: These endpoints are anonymous (storefront clients have no
 * API key). Brute-force protection (rate limiting, exponential backoff,
 * per-IP throttling) is deferred — TODO in the broader auth epic.
 *
 * Password hashing: client computes SHA-256 hex; server stores and compares
 * the hex string. Real per-user sessions (server-issued tokens) are also
 * deferred to the auth epic.
 */

const router: IRouter = Router();

interface PortalAccount {
  email: string;
  passwordHash: string;
  customerId: string;
  name: string;
  createdAt: string;
}

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

async function readPortalAccounts(tenantId: string): Promise<PortalAccount[]> {
  const rows = await query<{ value: unknown }>(
    `SELECT value FROM kv_store WHERE namespace = $1 AND key = 'portal-accounts'`,
    [`t:${tenantId}`],
  );
  if (rows.length === 0) return [];
  const v = rows[0]!.value;
  return Array.isArray(v) ? (v as PortalAccount[]) : [];
}

async function writePortalAccounts(tenantId: string, accounts: PortalAccount[]): Promise<void> {
  await query(
    `INSERT INTO kv_store (namespace, key, value, updated_at)
     VALUES ($1, 'portal-accounts', $2, NOW())
     ON CONFLICT (namespace, key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [`t:${tenantId}`, JSON.stringify(accounts)],
  );
}

async function findCustomerById(tenantId: string, id: string): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, id],
  );
  return rows[0] ?? null;
}

async function findCustomerByEmail(tenantId: string, email: string): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM customers WHERE tenant_id = $1 AND LOWER(email) = $2 LIMIT 1`,
    [tenantId, email],
  );
  return rows[0] ?? null;
}

/** Build a customer-shaped object from a relational row, or null if the row is null. */
function shapeCustomer(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const c = rowToApi(row);
  // Fill in fields the FE expects but the customers table doesn't carry.
  return {
    id: c.id,
    name: c.name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    company: "",
    industry: "",
    address: c.address ?? "",
    city: c.city ?? "",
    area: undefined,
    status: "Active",
    source: "portal",
    customerType: "Regular Customer",
    customerSince: typeof c.createdAt === "string"
      ? (c.createdAt as string).slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    totalValue: "0",
    currency: "GBP",
    notes: "",
    tags: [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Fallback when a portal account has no linked customer record (self-registered). */
function stubCustomer(email: string, account: PortalAccount): Record<string, unknown> {
  return {
    id: account.customerId,
    name: account.name || email.split("@")[0],
    email: account.email,
    phone: "",
    company: "",
    industry: "",
    address: "",
    city: "",
    area: undefined,
    status: "Active",
    source: "portal",
    customerType: "Regular Customer",
    customerSince: account.createdAt.split("T")[0],
    totalValue: "0",
    currency: "GBP",
    notes: "",
    tags: [],
    createdAt: account.createdAt,
    updatedAt: account.createdAt,
  };
}

// ── POST /login ──────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const tenantId = String(req.body?.tenantId ?? "");
    const email = normEmail(String(req.body?.email ?? ""));
    const passwordHash = String(req.body?.passwordHash ?? "");
    if (!tenantId || !email || !passwordHash) {
      return res.status(400).json({ ok: false, error: "tenantId, email, passwordHash required" });
    }
    const accounts = await readPortalAccounts(tenantId);
    const account = accounts.find(a => normEmail(a.email) === email && a.passwordHash === passwordHash);
    if (!account) {
      return res.status(401).json({ ok: false, error: "Incorrect email or password." });
    }
    const row = (await findCustomerById(tenantId, account.customerId))
      ?? (await findCustomerByEmail(tenantId, email));
    const customer = shapeCustomer(row) ?? stubCustomer(email, account);
    return res.json({ ok: true, customer });
  } catch (err) {
    console.error("[portal] login error", err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── POST /signup ─────────────────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  try {
    const tenantId = String(req.body?.tenantId ?? "");
    const email = normEmail(String(req.body?.email ?? ""));
    const passwordHash = String(req.body?.passwordHash ?? "");
    if (!tenantId || !email || !passwordHash) {
      return res.status(400).json({ ok: false, error: "tenantId, email, passwordHash required" });
    }
    const accounts = await readPortalAccounts(tenantId);
    if (accounts.some(a => normEmail(a.email) === email)) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists. Please sign in instead." });
    }
    const existingRow = await findCustomerByEmail(tenantId, email);
    const customerId = (existingRow?.id as string | undefined) ?? randomUUID();
    const displayName = (existingRow?.name as string | undefined) ?? email.split("@")[0];
    const now = new Date().toISOString();

    const newAccount: PortalAccount = {
      email, passwordHash, customerId, name: displayName, createdAt: now,
    };
    await writePortalAccounts(tenantId, [...accounts, newAccount]);

    // Seed/credit clubcard with 100 welcome coins
    const ns = `t:${tenantId}`;
    const ccKey = `clubcard-${customerId}`;
    const ccRows = await query<{ value: unknown }>(
      `SELECT value FROM kv_store WHERE namespace = $1 AND key = $2`,
      [ns, ccKey],
    );
    const existingCard = (ccRows.length > 0 && ccRows[0]!.value && typeof ccRows[0]!.value === "object"
      ? ccRows[0]!.value as Record<string, unknown>
      : {}) as { cardId?: string; coins?: number; transactions?: unknown[] };
    const cardId = existingCard.cardId || `CC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const coins = existingCard.coins ?? 0;
    const transactions = Array.isArray(existingCard.transactions) ? existingCard.transactions : [];
    const updatedCard = {
      cardId,
      coins: coins + 100,
      transactions: [
        ...transactions,
        { id: randomUUID(), type: "credit", coins: 100, description: "Welcome bonus — Club Card sign-up", date: now },
      ],
    };
    await query(
      `INSERT INTO kv_store (namespace, key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (namespace, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [ns, ccKey, JSON.stringify(updatedCard)],
    );

    const customer = shapeCustomer(existingRow) ?? stubCustomer(email, newAccount);
    return res.json({ ok: true, customer });
  } catch (err) {
    console.error("[portal] signup error", err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── POST /change-password ────────────────────────────────────────────────────
router.post("/change-password", async (req, res) => {
  try {
    const tenantId = String(req.body?.tenantId ?? "");
    const email = normEmail(String(req.body?.email ?? ""));
    const currentHash = String(req.body?.currentHash ?? "");
    const newHash = String(req.body?.newHash ?? "");
    if (!tenantId || !email || !currentHash || !newHash) {
      return res.status(400).json({ ok: false, error: "tenantId, email, currentHash, newHash required" });
    }
    const accounts = await readPortalAccounts(tenantId);
    const idx = accounts.findIndex(a => normEmail(a.email) === email && a.passwordHash === currentHash);
    if (idx === -1) {
      return res.status(401).json({ ok: false, error: "Current password is incorrect." });
    }
    const updated = accounts.map((a, i) => i === idx ? { ...a, passwordHash: newHash } : a);
    await writePortalAccounts(tenantId, updated);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[portal] change-password error", err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── GET /sales ───────────────────────────────────────────────────────────────
// Returns only the requested customer's sales (server-side filter by name).
// Matches `sales.customer = <name>` exactly — the current schema stores the
// customer as a name string; a portal_customer_id column / FK is a future
// schema migration.
router.get("/sales", async (req, res) => {
  try {
    const tenantId = String(req.query.tenantId ?? "");
    const customerName = String(req.query.customerName ?? "");
    if (!tenantId || !customerName) {
      return res.status(400).json({ error: "tenantId and customerName required" });
    }
    const sales = await query<Record<string, unknown>>(
      `SELECT * FROM sales
       WHERE tenant_id = $1
         AND LOWER(BTRIM(customer)) = LOWER(BTRIM($2))
         AND archived_at IS NULL
       ORDER BY sale_date DESC, created_at DESC`,
      [tenantId, customerName],
    );
    const ids = sales.map(s => s.id as string);
    const items = ids.length === 0 ? [] : await query<Record<string, unknown>>(
      `SELECT * FROM sale_items WHERE tenant_id = $1 AND sale_id = ANY($2::text[]) ORDER BY sale_id, line_order`,
      [tenantId, ids],
    );
    const itemsBySale = new Map<string, Record<string, unknown>[]>();
    for (const it of items) {
      const k = it.sale_id as string;
      const arr = itemsBySale.get(k) ?? [];
      arr.push(rowToApi(it));
      itemsBySale.set(k, arr);
    }
    return res.json({
      items: sales.map(s => ({
        ...rowToApi(s),
        items: itemsBySale.get(s.id as string) ?? [],
      })),
    });
  } catch (err) {
    console.error("[portal] sales error", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
