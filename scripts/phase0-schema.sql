-- Phase 0 schema: per-record relational core, replaces the JSON-array kv_store model.
-- Safe to re-run: every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- This runs ALONGSIDE the existing kv_store; nothing here drops or modifies kv_store.

BEGIN;

CREATE TABLE IF NOT EXISTS tenants (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  admin_username      TEXT NOT NULL,
  admin_password_hash TEXT NOT NULL,
  contact_email       TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  plan                TEXT NOT NULL DEFAULT 'free',
  module_group_id     TEXT,
  is_demo             BOOLEAN NOT NULL DEFAULT FALSE,
  demo_reset_interval INTEGER,
  demo_last_reset     TIMESTAMPTZ,
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_uq ON tenants (slug);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_admin_username_uq ON tenants (admin_username);
CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants (status);

CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  head            TEXT NOT NULL,
  sub_type        TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  parent_id       TEXT,
  account_type    TEXT NOT NULL,
  opening_balance NUMERIC(20, 6) NOT NULL DEFAULT 0,
  payment_type    TEXT,
  party_type      TEXT,
  party_id        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at       TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_party_consistency_chk CHECK ((party_type IS NULL) = (party_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_code_uq ON accounts (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_party_uq ON accounts (tenant_id, party_type, party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounts_tenant_parent_idx ON accounts (tenant_id, parent_id);
CREATE INDEX IF NOT EXISTS accounts_tenant_party_idx ON accounts (tenant_id, party_type, party_id);
CREATE INDEX IF NOT EXISTS accounts_tenant_active_idx ON accounts (tenant_id, is_active, archived_at);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_id_tenant_uq ON accounts (id, tenant_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  reference       TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  date            DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  total_debit     NUMERIC(20, 6) NOT NULL DEFAULT 0,
  total_credit    NUMERIC(20, 6) NOT NULL DEFAULT 0,
  is_balanced     BOOLEAN NOT NULL DEFAULT FALSE,
  reverses_je_id  TEXT,
  posted_at       TIMESTAMPTZ,
  posted_by       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS je_tenant_reference_uq ON journal_entries (tenant_id, reference);
CREATE INDEX IF NOT EXISTS je_tenant_date_idx ON journal_entries (tenant_id, date);
CREATE INDEX IF NOT EXISTS je_tenant_status_idx ON journal_entries (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS je_id_tenant_uq ON journal_entries (id, tenant_id);

-- THE LOAD-BEARING TABLE — ledger_account_id FK with ON DELETE RESTRICT makes
-- the "Unknown Ledger" class of bug structurally impossible.
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  journal_entry_id  TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  ledger_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  account_code      TEXT NOT NULL,
  party_type        TEXT,
  party_id          TEXT,
  staff_id          TEXT,
  narration         TEXT NOT NULL DEFAULT '',
  debit             NUMERIC(20, 6) NOT NULL DEFAULT 0,
  credit            NUMERIC(20, 6) NOT NULL DEFAULT 0,
  line_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS jel_je_idx ON journal_entry_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS jel_tenant_ledger_idx ON journal_entry_lines (tenant_id, ledger_account_id);
CREATE INDEX IF NOT EXISTS jel_tenant_party_idx ON journal_entry_lines (tenant_id, party_type, party_id);

CREATE TABLE IF NOT EXISTS customers (
  id                          TEXT PRIMARY KEY,
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name                        TEXT NOT NULL,
  company                     TEXT NOT NULL DEFAULT '',
  email                       TEXT NOT NULL DEFAULT '',
  phone                       TEXT NOT NULL DEFAULT '',
  industry                    TEXT NOT NULL DEFAULT '',
  city                        TEXT NOT NULL DEFAULT '',
  area                        TEXT,
  billing_address             TEXT,
  shipping_address            TEXT,
  billing_address_details     JSONB,
  shipping_address_details    JSONB,
  status                      TEXT NOT NULL DEFAULT 'active',
  source                      TEXT NOT NULL DEFAULT 'direct',
  customer_type               TEXT,
  customer_role               TEXT NOT NULL DEFAULT 'Buyer',
  lead_id                     TEXT,
  customer_since              TEXT NOT NULL,
  total_value                 TEXT NOT NULL DEFAULT '0',
  currency                    TEXT NOT NULL DEFAULT 'USD',
  opening_balance             NUMERIC(20, 6) NOT NULL DEFAULT 0,
  advance_credit              NUMERIC(20, 6) NOT NULL DEFAULT 0,
  notes                       TEXT NOT NULL DEFAULT '',
  tags                        JSONB NOT NULL DEFAULT '[]'::jsonb,
  ledger_account_id           TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  advance_ledger_account_id   TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  supplier_products           JSONB NOT NULL DEFAULT '[]'::jsonb,
  archived_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customers_tenant_status_idx ON customers (tenant_id, status, archived_at);
CREATE INDEX IF NOT EXISTS customers_tenant_role_idx ON customers (tenant_id, customer_role);
CREATE INDEX IF NOT EXISTS customers_tenant_ledger_idx ON customers (tenant_id, ledger_account_id);
CREATE INDEX IF NOT EXISTS customers_tenant_name_idx ON customers (tenant_id, name);

CREATE TABLE IF NOT EXISTS staff (
  id                       TEXT PRIMARY KEY,
  tenant_id                TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name                     TEXT NOT NULL,
  father_name              TEXT,
  department               TEXT NOT NULL DEFAULT '',
  designation              TEXT NOT NULL DEFAULT '',
  role                     TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT 'active',
  email                    TEXT NOT NULL DEFAULT '',
  phone                    TEXT NOT NULL DEFAULT '',
  join_date                DATE NOT NULL,
  leaving_date             DATE,
  notes                    TEXT NOT NULL DEFAULT '',
  opening_balance          NUMERIC(20, 6) NOT NULL DEFAULT 0,
  salary_type              TEXT,
  basic_salary             NUMERIC(20, 6),
  allowances               NUMERIC(20, 6),
  deductions               NUMERIC(20, 6),
  bank_name                TEXT,
  account_number           TEXT,
  username                 TEXT,
  password_hash            TEXT,
  login_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  ledger_account_id        TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  staff_payable_ledger_id  TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  archived_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_tenant_status_idx ON staff (tenant_id, status, archived_at);
CREATE INDEX IF NOT EXISTS staff_tenant_ledger_idx ON staff (tenant_id, ledger_account_id);
CREATE INDEX IF NOT EXISTS staff_tenant_payable_idx ON staff (tenant_id, staff_payable_ledger_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  actor       TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  operation   TEXT NOT NULL,
  before_json JSONB,
  after_json  JSONB,
  request_id  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_tenant_at_idx ON audit_log (tenant_id, at);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_request_idx ON audit_log (request_id);

COMMIT;
