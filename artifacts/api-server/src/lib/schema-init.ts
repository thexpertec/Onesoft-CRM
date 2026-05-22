/**
 * Idempotent schema initialiser — runs on every server start.
 * Each statement is executed independently so a pre-existing table or index
 * never prevents other statements from running.
 */
import { pool } from "./db.js";

const STATEMENTS: string[] = [
  // ── KV store (legacy blob storage) ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS kv_store (
    namespace   TEXT        NOT NULL,
    key         TEXT        NOT NULL,
    value       JSONB       NOT NULL DEFAULT 'null'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (namespace, key)
  )`,
  `CREATE INDEX IF NOT EXISTS kv_store_ns_idx ON kv_store (namespace)`,

  // ── Tenants ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS tenants (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    admin_username  TEXT NOT NULL,
    admin_password  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── Chart of accounts ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT          NOT NULL,
    tenant_id       TEXT          NOT NULL,
    code            TEXT          NOT NULL,
    name            TEXT          NOT NULL,
    head            TEXT          NOT NULL,
    sub_type        TEXT          NOT NULL DEFAULT '',
    description     TEXT          NOT NULL DEFAULT '',
    parent_id       TEXT,
    account_type    TEXT          NOT NULL,
    opening_balance NUMERIC(20,6) NOT NULL DEFAULT 0,
    payment_type    TEXT,
    party_type      TEXT,
    party_id        TEXT,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    is_locked       BOOLEAN       NOT NULL DEFAULT FALSE,
    locked_at       TIMESTAMPTZ,
    archived_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS accounts_tenant_idx ON accounts (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS accounts_code_idx   ON accounts (tenant_id, code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_uniq ON accounts (tenant_id, code)`,

  // ── Journal entries ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS journal_entries (
    id            TEXT          NOT NULL,
    tenant_id     TEXT          NOT NULL,
    reference     TEXT          NOT NULL,
    description   TEXT          NOT NULL DEFAULT '',
    date          TEXT          NOT NULL,
    status        TEXT          NOT NULL DEFAULT 'draft',
    total_debit   NUMERIC(20,6) NOT NULL DEFAULT 0,
    total_credit  NUMERIC(20,6) NOT NULL DEFAULT 0,
    is_balanced   BOOLEAN       NOT NULL DEFAULT FALSE,
    posted_at     TIMESTAMPTZ,
    posted_by     TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS je_tenant_idx ON journal_entries (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS je_date_idx   ON journal_entries (tenant_id, date)`,

  // ── Journal entry lines ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id                TEXT          NOT NULL,
    tenant_id         TEXT          NOT NULL,
    journal_entry_id  TEXT          NOT NULL,
    ledger_account_id TEXT          NOT NULL,
    account_code      TEXT          NOT NULL DEFAULT '',
    staff_id          TEXT,
    narration         TEXT          NOT NULL DEFAULT '',
    debit             NUMERIC(20,6) NOT NULL DEFAULT 0,
    credit            NUMERIC(20,6) NOT NULL DEFAULT 0,
    line_order        INT           NOT NULL DEFAULT 0,
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS jel_entry_idx ON journal_entry_lines (tenant_id, journal_entry_id)`,

  // ── Customers ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS customers (
    id          TEXT        NOT NULL,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    email       TEXT,
    phone       TEXT,
    address     TEXT,
    city        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers (tenant_id)`,

  // ── Staff ────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS staff (
    id          TEXT        NOT NULL,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    email       TEXT,
    phone       TEXT,
    role        TEXT,
    status      TEXT        NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS staff_tenant_idx ON staff (tenant_id)`,

  // ── Products ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS products (
    id                  TEXT        NOT NULL PRIMARY KEY,
    tenant_id           TEXT        NOT NULL,
    name                TEXT        NOT NULL,
    local_name          TEXT,
    model               TEXT,
    sku                 TEXT        NOT NULL DEFAULT '',
    barcode             TEXT,
    brand               TEXT        NOT NULL DEFAULT '',
    category            TEXT        NOT NULL DEFAULT '',
    subcategory         TEXT,
    sub_subcategory     TEXT,
    department          TEXT,
    unit                TEXT        NOT NULL DEFAULT '',
    purchase_price      TEXT,
    cost_price          TEXT,
    price               TEXT        NOT NULL DEFAULT '0',
    wholesale_price     TEXT,
    commission_pct      TEXT,
    opening_stock       TEXT,
    stock_alert_value   TEXT,
    description         TEXT        NOT NULL DEFAULT '',
    meta_title          TEXT,
    meta_description    TEXT,
    status              TEXT        NOT NULL DEFAULT 'Active',
    condition           TEXT,
    thumbnail           TEXT,
    images              JSONB       NOT NULL DEFAULT '[]'::jsonb,
    show_on_web         BOOLEAN     NOT NULL DEFAULT FALSE,
    website_price       TEXT,
    website_price_was   TEXT,
    clubcard_price      TEXT,
    clubcard_bogo       BOOLEAN     NOT NULL DEFAULT FALSE,
    product_attributes  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    variants            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS products_tenant_idx     ON products (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS products_tenant_sku_idx ON products (tenant_id, sku)`,
  `CREATE INDEX IF NOT EXISTS products_tenant_cat_idx ON products (tenant_id, category)`,

  // ── Audit log ────────────────────────────────────────────────────────────────
  // Table pre-exists with column "at" (not "created_at") — create-if-not-exists is safe.
  `CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT,
    actor       TEXT        NOT NULL,
    entity_type TEXT        NOT NULL,
    entity_id   TEXT        NOT NULL,
    operation   TEXT        NOT NULL,
    before_json JSONB,
    after_json  JSONB,
    request_id  TEXT,
    at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Index may already exist under a different name — the IF NOT EXISTS guard
  // only covers name conflicts, not column conflicts, so we match the live name.
  `CREATE INDEX IF NOT EXISTS audit_tenant_at_idx ON audit_log (tenant_id, at DESC)`,
];

export async function initSchema(): Promise<void> {
  const client = await pool.connect();
  let ok = 0;
  let failed = 0;
  try {
    for (const sql of STATEMENTS) {
      try {
        await client.query(sql);
        ok++;
      } catch (err) {
        failed++;
        // Log but keep going — other statements are independent.
        console.warn(
          `[schema-init] statement skipped (${(err as Error).message.split("\n")[0]}):`,
          sql.slice(0, 60).replace(/\s+/g, " "),
        );
      }
    }
    console.log(`[schema-init] done — ${ok} ok, ${failed} skipped.`);
  } finally {
    client.release();
  }
}
