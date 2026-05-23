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
  // Mirrors live production schema. Drift-tolerant: CREATE TABLE IF NOT EXISTS
  // is a no-op when the table already exists, so the ALTER TABLE statements
  // below bring any pre-drift instances up to current shape.
  `CREATE TABLE IF NOT EXISTS tenants (
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
  )`,
  // Drift catch-up: legacy tenants tables seeded from the old 7-column DDL
  // are missing the columns below. ADD COLUMN IF NOT EXISTS is a no-op on the
  // already-updated live DB and a real upgrade on any fresh-from-old instance.
  // Legacy `admin_password` column is also renamed to `admin_password_hash`
  // (live already uses the new name; rename is a no-op there).
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug                TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email       TEXT`,
  // Drift convergence: legacy rows pre-rename may have NULL slug/contact_email.
  // Backfill deterministically from id/admin_username so we can enforce NOT NULL
  // to match the declared CREATE TABLE shape. Idempotent — no-ops when values
  // are already present.
  `UPDATE tenants SET slug          = id              WHERE slug          IS NULL`,
  `UPDATE tenants SET contact_email = ''              WHERE contact_email IS NULL`,
  `UPDATE tenants SET admin_password_hash = ''        WHERE admin_password_hash IS NULL`,
  `ALTER TABLE tenants ALTER COLUMN slug                SET NOT NULL`,
  `ALTER TABLE tenants ALTER COLUMN contact_email       SET NOT NULL`,
  `ALTER TABLE tenants ALTER COLUMN admin_password_hash SET NOT NULL`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan                TEXT NOT NULL DEFAULT 'free'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS module_group_id     TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_demo             BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS demo_reset_interval INTEGER`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS demo_last_reset     TIMESTAMPTZ`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS archived_at         TIMESTAMPTZ`,
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='tenants' AND column_name='admin_password')
        AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='tenants' AND column_name='admin_password_hash') THEN
       ALTER TABLE tenants RENAME COLUMN admin_password TO admin_password_hash;
     END IF;
   END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_uq           ON tenants (slug) WHERE slug IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenants_admin_username_uq ON tenants (admin_username)`,
  `CREATE        INDEX IF NOT EXISTS tenants_status_idx        ON tenants (status)`,

  // ── Platform users (superadmin + tenant managers; always global namespace) ──
  `CREATE TABLE IF NOT EXISTS admin_users (
    id                TEXT PRIMARY KEY,
    username          TEXT NOT NULL,
    full_name         TEXT NOT NULL DEFAULT '',
    email             TEXT NOT NULL DEFAULT '',
    role              TEXT NOT NULL,
    password          TEXT NOT NULL,
    assigned_tenants  TEXT[] NOT NULL DEFAULT '{}'::text[],
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_uq ON admin_users (LOWER(username))`,
  `CREATE        INDEX IF NOT EXISTS admin_users_role_idx    ON admin_users (role)`,

  // ── Module groups (platform RBAC; always global namespace) ──────────────────
  `CREATE TABLE IF NOT EXISTS module_groups (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    modules      TEXT[] NOT NULL DEFAULT '{}'::text[],
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS module_groups_name_uq ON module_groups (LOWER(name))`,

  // ── App settings (one JSON blob per tenant) ─────────────────────────────────
  // Single-row-per-tenant table. The payload is stored verbatim as JSONB so
  // the 80+ fields on AppSettings (font sizes, invoice labels, COA mappings,
  // print options, quick-actions, etc.) don't require a column-per-field DDL.
  // FK to tenants(id) keeps orphaned settings rows from surviving a tenant
  // delete; ON DELETE CASCADE matches the "everything tenant-scoped goes
  // when the tenant goes" rule.
  `CREATE TABLE IF NOT EXISTS admin_settings (
    tenant_id  TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    payload    JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  // accounts.id is globally unique across tenants (UUIDs / sys-* literals) —
  // required so single-column FKs (e.g. staff.ledger_account_id → accounts(id))
  // have a valid FK target. The composite PK guarantees per-tenant uniqueness;
  // this index extends that to global uniqueness on `id` alone (matches the
  // live production schema where `accounts_pkey` is on `id`).
  `CREATE UNIQUE INDEX IF NOT EXISTS accounts_id_uniq ON accounts (id)`,

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
  // NOTE: This table is the source of truth for HRM staff. It predates the
  // composite-PK convention used by later tables (sales/invoices/returns/RP
  // vouchers); kept on a single-column PK because staff records carry
  // outgoing FKs into `accounts` (per-staff salary & payable ledgers), and
  // also act as a parent for future relations (attendance, salary slips).
  // Columns mirror the live production table exactly — prior versions of
  // this DDL drifted, so the canonical column set is enumerated below.
  `CREATE TABLE IF NOT EXISTS staff (
    id                       TEXT        NOT NULL PRIMARY KEY,
    tenant_id                TEXT        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name                     TEXT        NOT NULL,
    father_name              TEXT,
    department               TEXT        NOT NULL DEFAULT '',
    designation              TEXT        NOT NULL DEFAULT '',
    role                     TEXT        NOT NULL DEFAULT '',
    status                   TEXT        NOT NULL DEFAULT 'active',
    email                    TEXT        NOT NULL DEFAULT '',
    phone                    TEXT        NOT NULL DEFAULT '',
    join_date                DATE        NOT NULL,
    leaving_date             DATE,
    notes                    TEXT        NOT NULL DEFAULT '',
    opening_balance          NUMERIC(20,6) NOT NULL DEFAULT 0,
    salary_type              TEXT,
    basic_salary             NUMERIC(20,6),
    allowances               NUMERIC(20,6),
    deductions               NUMERIC(20,6),
    bank_name                TEXT,
    account_number           TEXT,
    username                 TEXT,
    password_hash            TEXT,
    login_enabled            BOOLEAN     NOT NULL DEFAULT FALSE,
    ledger_account_id        TEXT        REFERENCES accounts(id) ON DELETE SET NULL,
    staff_payable_ledger_id  TEXT        REFERENCES accounts(id) ON DELETE SET NULL,
    archived_at              TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS staff_tenant_idx          ON staff (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS staff_tenant_ledger_idx   ON staff (tenant_id, ledger_account_id)`,
  `CREATE INDEX IF NOT EXISTS staff_tenant_payable_idx  ON staff (tenant_id, staff_payable_ledger_id)`,
  `CREATE INDEX IF NOT EXISTS staff_tenant_status_idx   ON staff (tenant_id, status, archived_at)`,

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

  // ── Brands ───────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS brands (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    color       TEXT        NOT NULL DEFAULT '',
    website     TEXT        NOT NULL DEFAULT '',
    description TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'Active',
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS brands_tenant_idx ON brands (tenant_id)`,

  // ── Product Categories ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS product_categories (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    color       TEXT        NOT NULL DEFAULT '',
    parent_id   TEXT,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS product_categories_tenant_idx ON product_categories (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS product_categories_parent_idx ON product_categories (tenant_id, parent_id)`,

  // ── Units ────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS units (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    symbol      TEXT        NOT NULL DEFAULT '',
    description TEXT        NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS units_tenant_idx ON units (tenant_id)`,

  // ── Attributes ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS attributes (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    type        TEXT        NOT NULL DEFAULT 'text',
    values      TEXT        NOT NULL DEFAULT '',
    description TEXT        NOT NULL DEFAULT '',
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS attributes_tenant_idx ON attributes (tenant_id)`,

  // ── Leads ────────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS leads (
    id             TEXT        NOT NULL PRIMARY KEY,
    tenant_id      TEXT        NOT NULL,
    name           TEXT        NOT NULL,
    company        TEXT        NOT NULL DEFAULT '',
    email          TEXT        NOT NULL DEFAULT '',
    phone          TEXT        NOT NULL DEFAULT '',
    industry       TEXT        NOT NULL DEFAULT '',
    city           TEXT        NOT NULL DEFAULT '',
    country        TEXT,
    website        TEXT,
    status         TEXT        NOT NULL DEFAULT 'New',
    source         TEXT        NOT NULL DEFAULT '',
    notes          TEXT        NOT NULL DEFAULT '',
    is_relevant    BOOLEAN,
    next_reminder  TIMESTAMPTZ,
    reminder_note  TEXT,
    deal_value     NUMERIC(18,2),
    assigned_to    TEXT,
    temperature    TEXT,
    next_follow_up TIMESTAMPTZ,
    call_logs      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    archived_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS leads_tenant_idx        ON leads (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS leads_tenant_status_idx ON leads (tenant_id, status)`,

  // ── Departments (HRM) ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS departments (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    role_name   TEXT,
    description TEXT        NOT NULL DEFAULT '',
    head_of     TEXT        NOT NULL DEFAULT '',
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS departments_tenant_idx ON departments (tenant_id)`,

  // ── Designations (HRM) ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS designations (
    id              TEXT        NOT NULL PRIMARY KEY,
    tenant_id       TEXT        NOT NULL,
    title           TEXT        NOT NULL,
    department      TEXT        NOT NULL DEFAULT '',
    job_description TEXT        NOT NULL DEFAULT '',
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    archived_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS designations_tenant_idx     ON designations (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS designations_tenant_dept_idx ON designations (tenant_id, department)`,

  // ── Staff roles (HRM) — Batch 6 ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS staff_roles (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    color       TEXT        NOT NULL DEFAULT '',
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    permissions TEXT        NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS staff_roles_tenant_idx ON staff_roles (tenant_id)`,

  // ── Salary Templates (HRM) — Batch 7 ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS salary_templates (
    id                        TEXT        NOT NULL PRIMARY KEY,
    tenant_id                 TEXT        NOT NULL,
    designation               TEXT        NOT NULL DEFAULT '',
    staff_id                  TEXT        NOT NULL DEFAULT '',
    basic_salary              NUMERIC     NOT NULL DEFAULT 0,
    overtime_rate_per_hour    NUMERIC     NOT NULL DEFAULT 0,
    per_leave_deduction       NUMERIC     NOT NULL DEFAULT 0,
    per_short_leave_deduction NUMERIC     NOT NULL DEFAULT 0,
    allowances                JSONB       NOT NULL DEFAULT '[]'::jsonb,
    deductions                JSONB       NOT NULL DEFAULT '[]'::jsonb,
    archived_at               TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS salary_templates_tenant_idx ON salary_templates (tenant_id)`,

  // ── Salary Allowance Categories (HRM) — Batch 7 ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS salary_allowance_categories (
    id                  TEXT        NOT NULL PRIMARY KEY,
    tenant_id           TEXT        NOT NULL,
    name                TEXT        NOT NULL,
    account_group_id    TEXT        NOT NULL DEFAULT '',
    account_group_name  TEXT        NOT NULL DEFAULT '',
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS salary_allowance_categories_tenant_idx ON salary_allowance_categories (tenant_id)`,

  // ── Salary Deduction Categories (HRM) — Batch 7 ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS salary_deduction_categories (
    id                  TEXT        NOT NULL PRIMARY KEY,
    tenant_id           TEXT        NOT NULL,
    name                TEXT        NOT NULL,
    account_group_id    TEXT        NOT NULL DEFAULT '',
    account_group_name  TEXT        NOT NULL DEFAULT '',
    type                TEXT        NOT NULL DEFAULT '',
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS salary_deduction_categories_tenant_idx ON salary_deduction_categories (tenant_id)`,

  // ── Salary Slips (HRM) — Batch 8 ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS salary_slips (
    id                        TEXT        NOT NULL PRIMARY KEY,
    tenant_id                 TEXT        NOT NULL,
    staff_id                  TEXT        NOT NULL,
    staff_name                TEXT        NOT NULL DEFAULT '',
    department                TEXT        NOT NULL DEFAULT '',
    designation               TEXT        NOT NULL DEFAULT '',
    role                      TEXT,
    period                    TEXT        NOT NULL,
    salary_type               TEXT        NOT NULL DEFAULT 'Monthly',
    basic_salary              NUMERIC     NOT NULL DEFAULT 0,
    allowances                JSONB       NOT NULL DEFAULT '[]'::jsonb,
    deductions                JSONB       NOT NULL DEFAULT '[]'::jsonb,
    advance_salary            NUMERIC,
    gross_salary              NUMERIC     NOT NULL DEFAULT 0,
    net_salary                NUMERIC     NOT NULL DEFAULT 0,
    status                    TEXT        NOT NULL DEFAULT 'Draft',
    payment_method            TEXT,
    payment_account_id        TEXT,
    paid_at                   TEXT,
    amount_paid               NUMERIC,
    journal_entry_id          TEXT,
    accrual_journal_entry_id  TEXT,
    staff_payable_ledger_id   TEXT,
    notes                     TEXT,
    archived_at               TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS salary_slips_tenant_idx ON salary_slips (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS salary_slips_tenant_staff_period_idx ON salary_slips (tenant_id, staff_id, period)`,

  // ── Attendance (HRM) — Batch 8 ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS attendance_records (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    staff_id    TEXT        NOT NULL,
    date        TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'Present',
    check_in    TEXT,
    check_out   TEXT,
    notes       TEXT,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS attendance_records_tenant_idx ON attendance_records (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS attendance_records_tenant_staff_date_idx ON attendance_records (tenant_id, staff_id, date)`,

  // ── Advance Salary (HRM) — Batch 9 ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS advance_salaries (
    id                  TEXT        NOT NULL PRIMARY KEY,
    tenant_id           TEXT        NOT NULL,
    staff_id            TEXT        NOT NULL,
    staff_name          TEXT        NOT NULL DEFAULT '',
    staff_role          TEXT        NOT NULL DEFAULT '',
    amount              NUMERIC     NOT NULL DEFAULT 0,
    deduct_month        TEXT        NOT NULL,
    pay_via             TEXT        NOT NULL DEFAULT 'Cash',
    payment_account_id  TEXT,
    status              TEXT        NOT NULL DEFAULT 'Pending',
    applied_on          TEXT        NOT NULL,
    notes               TEXT,
    approved_by         TEXT,
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS advance_salaries_tenant_idx ON advance_salaries (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS advance_salaries_tenant_staff_idx ON advance_salaries (tenant_id, staff_id)`,

  // ── Cities ───────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS cities (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    country     TEXT        NOT NULL DEFAULT '',
    notes       TEXT        NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS cities_tenant_idx ON cities (tenant_id)`,

  // ── Areas ────────────────────────────────────────────────────────────────────
  // city_id is a soft reference (no FK) — mirrors how brands/categories handle
  // parent_id. Frontend already tolerates orphaned cityId references.
  `CREATE TABLE IF NOT EXISTS areas (
    id          TEXT        NOT NULL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    city_id     TEXT,
    notes       TEXT        NOT NULL DEFAULT '',
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS areas_tenant_idx      ON areas (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS areas_tenant_city_idx ON areas (tenant_id, city_id)`,

  // ── Requirement Documents ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS requirement_docs (
    id            TEXT        NOT NULL PRIMARY KEY,
    tenant_id     TEXT        NOT NULL,
    title         TEXT        NOT NULL,
    client_name   TEXT        NOT NULL DEFAULT '',
    company       TEXT        NOT NULL DEFAULT '',
    email         TEXT        NOT NULL DEFAULT '',
    phone         TEXT        NOT NULL DEFAULT '',
    industry      TEXT        NOT NULL DEFAULT '',
    city          TEXT        NOT NULL DEFAULT '',
    status        TEXT        NOT NULL DEFAULT 'Draft',
    software_type TEXT        NOT NULL DEFAULT '',
    budget        TEXT        NOT NULL DEFAULT '',
    start_date    TEXT        NOT NULL DEFAULT '',
    delivery_date TEXT        NOT NULL DEFAULT '',
    sections      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    archived_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS requirement_docs_tenant_idx        ON requirement_docs (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS requirement_docs_tenant_status_idx ON requirement_docs (tenant_id, status)`,

  // ── Stock Items ──────────────────────────────────────────────────────────────
  // Quantities are stored as the frontend type uses STRINGS to keep grid-edit
  // compatibility. We coerce to NUMERIC(18,4) on migration so SQL aggregations
  // (sum-by-product, low-stock alerts) can run server-side without JS parseFloat.
  `CREATE TABLE IF NOT EXISTS stock_items (
    id             TEXT        NOT NULL PRIMARY KEY,
    tenant_id      TEXT        NOT NULL,
    product_name   TEXT        NOT NULL,
    sku            TEXT        NOT NULL DEFAULT '',
    store          TEXT        NOT NULL DEFAULT '',
    stock_type     TEXT        NOT NULL DEFAULT 'For Sale',
    quantity       NUMERIC(18,4) NOT NULL DEFAULT 0,
    min_level      NUMERIC(18,4) NOT NULL DEFAULT 0,
    unit           TEXT        NOT NULL DEFAULT '',
    hold_customer  TEXT        NOT NULL DEFAULT '',
    hold_reason    TEXT        NOT NULL DEFAULT '',
    notes          TEXT        NOT NULL DEFAULT '',
    archived_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS stock_items_tenant_idx      ON stock_items (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS stock_items_tenant_sku_idx  ON stock_items (tenant_id, lower(sku))`,
  `CREATE INDEX IF NOT EXISTS stock_items_tenant_type_idx ON stock_items (tenant_id, stock_type)`,

  // ── Stock Ledger ─────────────────────────────────────────────────────────────
  // Append-only movement journal. entity_id is a SOFT reference (no FK) because
  // ledger entries can outlive their stock_item row (mirrors brands/parent_id
  // pattern). High cardinality table — composite (tenant_id, entity_id, date)
  // index supports per-product timeline queries.
  `CREATE TABLE IF NOT EXISTS stock_ledger (
    id           TEXT        NOT NULL PRIMARY KEY,
    tenant_id    TEXT        NOT NULL,
    entity_type  TEXT        NOT NULL DEFAULT 'product',
    entity_id    TEXT        NOT NULL,
    entity_name  TEXT        NOT NULL DEFAULT '',
    date         TEXT        NOT NULL DEFAULT '',
    tx_type      TEXT        NOT NULL,
    source_type  TEXT,
    reference    TEXT        NOT NULL DEFAULT '',
    qty_before   NUMERIC(18,4) NOT NULL DEFAULT 0,
    qty_change   NUMERIC(18,4) NOT NULL DEFAULT 0,
    qty_after    NUMERIC(18,4) NOT NULL DEFAULT 0,
    unit         TEXT        NOT NULL DEFAULT '',
    notes        TEXT        NOT NULL DEFAULT '',
    archived_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS stock_ledger_tenant_idx        ON stock_ledger (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS stock_ledger_tenant_entity_idx ON stock_ledger (tenant_id, entity_id, date)`,
  `CREATE INDEX IF NOT EXISTS stock_ledger_tenant_ref_idx    ON stock_ledger (tenant_id, reference)`,

  // ── Purchase Orders ──────────────────────────────────────────────────────────
  // Parent + child line items, mirroring the journal_entries / journal_entry_lines
  // pattern (composite PK on (id, tenant_id); je_id is a soft reference — no FK,
  // mirrors how brands/parent_id is handled — because legacy POs may point at
  // JEs that haven't been migrated yet, and deleting a JE is allowed to leave
  // the PO with a stale jeId per the reverse-cascade documented in replit.md).
  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id            TEXT        NOT NULL,
    tenant_id     TEXT        NOT NULL,
    po_number     TEXT        NOT NULL,
    supplier      TEXT        NOT NULL DEFAULT '',
    order_date    TEXT        NOT NULL DEFAULT '',
    delivery_date TEXT        NOT NULL DEFAULT '',
    status        TEXT        NOT NULL DEFAULT 'Draft',
    notes         TEXT        NOT NULL DEFAULT '',
    je_id         TEXT,
    archived_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS po_tenant_idx        ON purchase_orders (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS po_tenant_number_idx ON purchase_orders (tenant_id, po_number)`,
  `CREATE INDEX IF NOT EXISTS po_tenant_status_idx ON purchase_orders (tenant_id, status)`,
  `CREATE INDEX IF NOT EXISTS po_tenant_date_idx   ON purchase_orders (tenant_id, order_date)`,

  // ── Purchase Order Items ─────────────────────────────────────────────────────
  // Composite FK ON DELETE CASCADE so a PO delete sweeps its lines (the store
  // layer still refuses the parent delete when financial blockers exist; this
  // FK only protects against orphaned lines if a PO is removed via SQL).
  `CREATE TABLE IF NOT EXISTS purchase_order_items (
    id           TEXT          NOT NULL,
    tenant_id    TEXT          NOT NULL,
    po_id        TEXT          NOT NULL,
    item_type    TEXT          NOT NULL DEFAULT 'product',
    rm_id        TEXT,
    product_name TEXT          NOT NULL DEFAULT '',
    sku          TEXT          NOT NULL DEFAULT '',
    qty          NUMERIC(18,4) NOT NULL DEFAULT 0,
    unit         TEXT          NOT NULL DEFAULT '',
    unit_price   NUMERIC(18,4) NOT NULL DEFAULT 0,
    notes        TEXT          NOT NULL DEFAULT '',
    line_order   INT           NOT NULL DEFAULT 0,
    PRIMARY KEY (id, tenant_id),
    FOREIGN KEY (po_id, tenant_id) REFERENCES purchase_orders (id, tenant_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS poi_po_idx     ON purchase_order_items (tenant_id, po_id)`,
  `CREATE INDEX IF NOT EXISTS poi_tenant_idx ON purchase_order_items (tenant_id)`,

  // ── Sales ────────────────────────────────────────────────────────────────────
  // Parent + child line items, mirroring the purchase_orders pattern.
  // Sale has substantially more fields than PO: payment tracking (amount_paid,
  // paid_at, payment_method), JE linkage (je_id, soft reference like PO), POS
  // mode/delivery/discount fields, and the stock_deducted boolean.
  //
  // Numeric fields kept as TEXT (not NUMERIC) to preserve the frontend's
  // string-of-decimal contract exactly — the store layer relies on `parseFloat`
  // and writes back as `String(n)`, and any silent coercion to NUMERIC would
  // round-trip "20" ↔ "20.0000" and break equality checks in tests. PO used
  // NUMERIC because its consumers (reports) want SQL aggregation; sale items
  // are exclusively consumed via the frontend's own per-line totals helpers.
  `CREATE TABLE IF NOT EXISTS sales (
    id                    TEXT        NOT NULL,
    tenant_id             TEXT        NOT NULL,
    sale_number           TEXT        NOT NULL,
    sale_date             TEXT        NOT NULL DEFAULT '',
    customer              TEXT        NOT NULL DEFAULT '',
    status                TEXT        NOT NULL DEFAULT 'Pending',
    payment_method        TEXT        NOT NULL DEFAULT '',
    notes                 TEXT        NOT NULL DEFAULT '',
    tax_rate              TEXT        NOT NULL DEFAULT '0',
    amount_paid           TEXT        NOT NULL DEFAULT '0',
    paid_at               TEXT        NOT NULL DEFAULT '',
    stock_deducted        BOOLEAN     NOT NULL DEFAULT FALSE,
    je_id                 TEXT,
    agent_id              TEXT,
    agent_name            TEXT,
    sale_mode             TEXT,
    delivery_status       TEXT,
    delivery_charges      TEXT,
    invoice_discount      TEXT,
    invoice_discount_type TEXT,
    order_type            TEXT,
    online_customer       TEXT,
    archived_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS sales_tenant_idx        ON sales (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS sales_tenant_number_idx ON sales (tenant_id, sale_number)`,
  `CREATE INDEX IF NOT EXISTS sales_tenant_status_idx ON sales (tenant_id, status)`,
  `CREATE INDEX IF NOT EXISTS sales_tenant_date_idx   ON sales (tenant_id, sale_date)`,
  `CREATE INDEX IF NOT EXISTS sales_tenant_customer_idx ON sales (tenant_id, customer)`,
  `CREATE INDEX IF NOT EXISTS sales_tenant_agent_idx  ON sales (tenant_id, agent_id)`,
  // Partial index for "show source sale for this JE" lookups (most sales have
  // no JE yet, so the partial WHERE keeps the index small).
  `CREATE INDEX IF NOT EXISTS sales_tenant_je_idx     ON sales (tenant_id, je_id) WHERE je_id IS NOT NULL`,

  // ── Sale Items ───────────────────────────────────────────────────────────────
  // Composite FK with ON DELETE CASCADE matching the PO/JE pattern.
  `CREATE TABLE IF NOT EXISTS sale_items (
    id                TEXT    NOT NULL,
    tenant_id         TEXT    NOT NULL,
    sale_id           TEXT    NOT NULL,
    product_name      TEXT    NOT NULL DEFAULT '',
    local_name        TEXT,
    sku               TEXT    NOT NULL DEFAULT '',
    qty               TEXT    NOT NULL DEFAULT '0',
    unit              TEXT    NOT NULL DEFAULT '',
    unit_price        TEXT    NOT NULL DEFAULT '0',
    discount          TEXT    NOT NULL DEFAULT '0',
    discount_type     TEXT,
    notes             TEXT    NOT NULL DEFAULT '',
    item_status       TEXT    NOT NULL DEFAULT 'Pending',
    bogo_applied      BOOLEAN NOT NULL DEFAULT FALSE,
    variant_label     TEXT,
    cost_price        TEXT,
    purchase_unit     TEXT,
    conversion_factor TEXT,
    line_order        INT     NOT NULL DEFAULT 0,
    PRIMARY KEY (id, tenant_id),
    FOREIGN KEY (sale_id, tenant_id) REFERENCES sales (id, tenant_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS sale_items_sale_idx   ON sale_items (tenant_id, sale_id)`,
  `CREATE INDEX IF NOT EXISTS sale_items_tenant_idx ON sale_items (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS sale_items_sku_idx    ON sale_items (tenant_id, sku)`,

  // ── Invoices (standalone, separate from POS Sales) ───────────────────────────
  // Sale invoices AND purchase invoices share this table (distinguished by
  // invoice_type). Items shape mirrors sale_items (SaleItem reused on the
  // frontend). paymentHistory[] is split into the invoice_payments child table
  // so each PaymentRecord is independently queryable / JE-linkable.
  //
  // String-typed numerics preserve the frontend's "string-of-decimal" contract
  // exactly (same rationale as sales). bank_account_ids is a small string array
  // → native TEXT[] keeps it queryable without adding a join table. invoice_docs
  // is JSONB because it's a free-form ordered list of named markdown blocks.
  `CREATE TABLE IF NOT EXISTS invoices (
    id                    TEXT        NOT NULL,
    tenant_id             TEXT        NOT NULL,
    invoice_number        TEXT        NOT NULL,
    invoice_title         TEXT        NOT NULL DEFAULT 'Invoice',
    invoice_type          TEXT        NOT NULL DEFAULT 'sale',
    invoice_date          TEXT        NOT NULL DEFAULT '',
    due_date              TEXT        NOT NULL DEFAULT '',
    customer              TEXT        NOT NULL DEFAULT '',
    customer_id           TEXT        NOT NULL DEFAULT '',
    buyer_address         TEXT        NOT NULL DEFAULT '',
    buyer_town            TEXT        NOT NULL DEFAULT '',
    buyer_phone           TEXT        NOT NULL DEFAULT '',
    buyer_email           TEXT        NOT NULL DEFAULT '',
    sales_officer         TEXT        NOT NULL DEFAULT '',
    status                TEXT        NOT NULL DEFAULT 'Draft',
    sale_status           TEXT,
    stock_received        BOOLEAN,
    payment_method        TEXT        NOT NULL DEFAULT '',
    payment_terms         TEXT        NOT NULL DEFAULT '',
    bank_details          TEXT        NOT NULL DEFAULT '',
    bank_account_ids      TEXT[],
    amount_paid           TEXT        NOT NULL DEFAULT '0',
    paid_at               TEXT        NOT NULL DEFAULT '',
    tax_rate              TEXT        NOT NULL DEFAULT '0',
    pricing_mode          TEXT,
    shipping_fee          TEXT        NOT NULL DEFAULT '0',
    handling_fee          TEXT        NOT NULL DEFAULT '0',
    shipping_method       TEXT        NOT NULL DEFAULT '',
    agent_id              TEXT,
    agent_name            TEXT,
    notes                 TEXT        NOT NULL DEFAULT '',
    agreement             TEXT        NOT NULL DEFAULT '',
    invoice_footer        TEXT        NOT NULL DEFAULT '',
    invoice_docs          JSONB,
    stock_deducted        BOOLEAN     NOT NULL DEFAULT FALSE,
    je_id                 TEXT,
    je_uses_ar            BOOLEAN,
    archived_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS invoices_tenant_idx          ON invoices (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS invoices_tenant_number_idx   ON invoices (tenant_id, invoice_number)`,
  `CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx   ON invoices (tenant_id, status)`,
  `CREATE INDEX IF NOT EXISTS invoices_tenant_date_idx     ON invoices (tenant_id, invoice_date)`,
  `CREATE INDEX IF NOT EXISTS invoices_tenant_customer_idx ON invoices (tenant_id, customer)`,
  `CREATE INDEX IF NOT EXISTS invoices_tenant_type_idx     ON invoices (tenant_id, invoice_type)`,
  `CREATE INDEX IF NOT EXISTS invoices_tenant_agent_idx    ON invoices (tenant_id, agent_id)`,
  `CREATE INDEX IF NOT EXISTS invoices_tenant_je_idx       ON invoices (tenant_id, je_id) WHERE je_id IS NOT NULL`,

  // ── Invoice Items ────────────────────────────────────────────────────────────
  // Mirrors sale_items column-for-column (frontend reuses the SaleItem type).
  `CREATE TABLE IF NOT EXISTS invoice_items (
    id                TEXT    NOT NULL,
    tenant_id         TEXT    NOT NULL,
    invoice_id        TEXT    NOT NULL,
    product_name      TEXT    NOT NULL DEFAULT '',
    local_name        TEXT,
    sku               TEXT    NOT NULL DEFAULT '',
    qty               TEXT    NOT NULL DEFAULT '0',
    unit              TEXT    NOT NULL DEFAULT '',
    unit_price        TEXT    NOT NULL DEFAULT '0',
    discount          TEXT    NOT NULL DEFAULT '0',
    discount_type     TEXT,
    notes             TEXT    NOT NULL DEFAULT '',
    item_status       TEXT    NOT NULL DEFAULT 'Pending',
    bogo_applied      BOOLEAN NOT NULL DEFAULT FALSE,
    variant_label     TEXT,
    cost_price        TEXT,
    purchase_unit     TEXT,
    conversion_factor TEXT,
    line_order        INT     NOT NULL DEFAULT 0,
    PRIMARY KEY (id, tenant_id),
    FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices (id, tenant_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (tenant_id, invoice_id)`,
  `CREATE INDEX IF NOT EXISTS invoice_items_tenant_idx  ON invoice_items (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS invoice_items_sku_idx     ON invoice_items (tenant_id, sku)`,

  // ── Invoice Payments (PaymentRecord history) ─────────────────────────────────
  // Each payment is a separate row so JE refs / methods can be reasoned about
  // individually. line_order preserves the original frontend array order.
  `CREATE TABLE IF NOT EXISTS invoice_payments (
    id            TEXT NOT NULL,
    tenant_id     TEXT NOT NULL,
    invoice_id    TEXT NOT NULL,
    payment_date  TEXT NOT NULL DEFAULT '',
    amount        TEXT NOT NULL DEFAULT '0',
    method        TEXT NOT NULL DEFAULT '',
    note          TEXT NOT NULL DEFAULT '',
    je_ref        TEXT,
    line_order    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (id, tenant_id),
    FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices (id, tenant_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON invoice_payments (tenant_id, invoice_id)`,
  `CREATE INDEX IF NOT EXISTS invoice_payments_tenant_idx  ON invoice_payments (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS invoice_payments_je_idx      ON invoice_payments (tenant_id, je_ref) WHERE je_ref IS NOT NULL`,

  // ── Sale Returns + Items ─────────────────────────────────────────────────────
  // Reversal of a POS Sale. Numeric totals (subtotal/tax/grand) are stored as
  // TEXT to preserve string-of-decimal precision the same way sales/invoices
  // do (the FE types them as number but pg-numerics also come back as strings,
  // so callers parse on read either way).
  //
  // Only blocker on DELETE is a linked JE — mirrors `deleteSaleReturn` in
  // store.ts. Partial je_id index supports the JE-reverse-cascade query.
  `CREATE TABLE IF NOT EXISTS sale_returns (
    id                   TEXT        NOT NULL,
    tenant_id            TEXT        NOT NULL,
    return_number        TEXT        NOT NULL,
    original_sale_number TEXT        NOT NULL DEFAULT '',
    original_sale_id     TEXT        NOT NULL DEFAULT '',
    return_date          TEXT        NOT NULL DEFAULT '',
    customer             TEXT        NOT NULL DEFAULT '',
    refund_method        TEXT        NOT NULL DEFAULT 'Cash',
    subtotal             TEXT        NOT NULL DEFAULT '0',
    tax_amount           TEXT        NOT NULL DEFAULT '0',
    grand_total          TEXT        NOT NULL DEFAULT '0',
    reason               TEXT        NOT NULL DEFAULT '',
    notes                TEXT        NOT NULL DEFAULT '',
    status               TEXT        NOT NULL DEFAULT 'draft',
    je_id                TEXT,
    archived_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS sale_returns_tenant_idx        ON sale_returns (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS sale_returns_tenant_number_idx ON sale_returns (tenant_id, return_number)`,
  `CREATE INDEX IF NOT EXISTS sale_returns_tenant_sale_idx   ON sale_returns (tenant_id, original_sale_id)`,
  `CREATE INDEX IF NOT EXISTS sale_returns_tenant_status_idx ON sale_returns (tenant_id, status)`,
  `CREATE INDEX IF NOT EXISTS sale_returns_tenant_date_idx   ON sale_returns (tenant_id, return_date)`,
  `CREATE INDEX IF NOT EXISTS sale_returns_tenant_je_idx     ON sale_returns (tenant_id, je_id) WHERE je_id IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS sale_return_items (
    id            TEXT NOT NULL,
    tenant_id     TEXT NOT NULL,
    return_id     TEXT NOT NULL,
    product_name  TEXT NOT NULL DEFAULT '',
    sku           TEXT NOT NULL DEFAULT '',
    unit          TEXT NOT NULL DEFAULT '',
    qty           TEXT NOT NULL DEFAULT '0',
    unit_price    TEXT NOT NULL DEFAULT '0',
    discount      TEXT NOT NULL DEFAULT '0',
    cost_price    TEXT,
    line_order    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (id, tenant_id),
    FOREIGN KEY (return_id, tenant_id) REFERENCES sale_returns (id, tenant_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS sale_return_items_return_idx ON sale_return_items (tenant_id, return_id)`,
  `CREATE INDEX IF NOT EXISTS sale_return_items_tenant_idx ON sale_return_items (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS sale_return_items_sku_idx    ON sale_return_items (tenant_id, sku)`,

  // ── Purchase Returns + Items ─────────────────────────────────────────────────
  // Mirror shape of sale_returns but for purchase invoices. PR items carry an
  // extra `category` column that's locked at invoice-selection time so the
  // reversal JE hits the same inventory sub-ledger as the original PO JE even
  // if the product's category is edited later.
  `CREATE TABLE IF NOT EXISTS purchase_returns (
    id                      TEXT        NOT NULL,
    tenant_id               TEXT        NOT NULL,
    return_number           TEXT        NOT NULL,
    original_invoice_number TEXT        NOT NULL DEFAULT '',
    original_invoice_id     TEXT        NOT NULL DEFAULT '',
    return_date             TEXT        NOT NULL DEFAULT '',
    supplier                TEXT        NOT NULL DEFAULT '',
    refund_method           TEXT        NOT NULL DEFAULT 'Cash',
    subtotal                TEXT        NOT NULL DEFAULT '0',
    tax_amount              TEXT        NOT NULL DEFAULT '0',
    grand_total             TEXT        NOT NULL DEFAULT '0',
    reason                  TEXT        NOT NULL DEFAULT '',
    notes                   TEXT        NOT NULL DEFAULT '',
    status                  TEXT        NOT NULL DEFAULT 'draft',
    je_id                   TEXT,
    archived_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_tenant_idx          ON purchase_returns (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_tenant_number_idx   ON purchase_returns (tenant_id, return_number)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_tenant_invoice_idx  ON purchase_returns (tenant_id, original_invoice_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_tenant_status_idx   ON purchase_returns (tenant_id, status)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_tenant_date_idx     ON purchase_returns (tenant_id, return_date)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_tenant_supplier_idx ON purchase_returns (tenant_id, supplier)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_tenant_je_idx       ON purchase_returns (tenant_id, je_id) WHERE je_id IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS purchase_return_items (
    id            TEXT NOT NULL,
    tenant_id     TEXT NOT NULL,
    return_id     TEXT NOT NULL,
    product_name  TEXT NOT NULL DEFAULT '',
    sku           TEXT NOT NULL DEFAULT '',
    unit          TEXT NOT NULL DEFAULT '',
    qty           TEXT NOT NULL DEFAULT '0',
    unit_price    TEXT NOT NULL DEFAULT '0',
    discount      TEXT NOT NULL DEFAULT '0',
    category      TEXT,
    line_order    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (id, tenant_id),
    FOREIGN KEY (return_id, tenant_id) REFERENCES purchase_returns (id, tenant_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS purchase_return_items_return_idx ON purchase_return_items (tenant_id, return_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_return_items_tenant_idx ON purchase_return_items (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_return_items_sku_idx    ON purchase_return_items (tenant_id, sku)`,

  // ── Receipt & Payment Vouchers + Lines ───────────────────────────────────────
  // RPVoucher carries TWO arrays: `lines` (per-invoice/AR/AP/expense legs) and
  // optional `bankLines` (multi-bank cash side). We collapse both into a single
  // `rp_voucher_lines` table with a `line_kind` discriminator (`'line' | 'bank'`)
  // so the child shape is uniform; routes split them back out on read.
  //
  // `linked_invoice_ids` (TEXT[]) is a small denormalised list used for fast
  // reverse-lookup ("which voucher cleared invoice X?"); no FK to invoices
  // since it's a snapshot/historical reference.
  //
  // DELETE blocker: backend refuses when status='posted' (mirrors store.ts
  // `deleteRPVoucher`). Drafts are freely deletable.
  `CREATE TABLE IF NOT EXISTS rp_vouchers (
    id                       TEXT        NOT NULL,
    tenant_id                TEXT        NOT NULL,
    voucher_number           TEXT        NOT NULL,
    voucher_type             TEXT        NOT NULL DEFAULT 'receipt',
    voucher_date             TEXT        NOT NULL DEFAULT '',
    party_name               TEXT        NOT NULL DEFAULT '',
    cash_bank_account_id     TEXT        NOT NULL DEFAULT '',
    cash_bank_account_name   TEXT        NOT NULL DEFAULT '',
    reference                TEXT        NOT NULL DEFAULT '',
    total_amount             TEXT        NOT NULL DEFAULT '0',
    narration                TEXT        NOT NULL DEFAULT '',
    status                   TEXT        NOT NULL DEFAULT 'draft',
    journal_entry_id         TEXT,
    linked_invoice_id        TEXT,
    linked_invoice_ids       TEXT[],
    archived_at              TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS rp_vouchers_tenant_idx          ON rp_vouchers (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS rp_vouchers_tenant_number_idx   ON rp_vouchers (tenant_id, voucher_number)`,
  `CREATE INDEX IF NOT EXISTS rp_vouchers_tenant_type_idx     ON rp_vouchers (tenant_id, voucher_type)`,
  `CREATE INDEX IF NOT EXISTS rp_vouchers_tenant_status_idx   ON rp_vouchers (tenant_id, status)`,
  `CREATE INDEX IF NOT EXISTS rp_vouchers_tenant_date_idx     ON rp_vouchers (tenant_id, voucher_date)`,
  `CREATE INDEX IF NOT EXISTS rp_vouchers_tenant_party_idx    ON rp_vouchers (tenant_id, party_name)`,
  `CREATE INDEX IF NOT EXISTS rp_vouchers_tenant_je_idx       ON rp_vouchers (tenant_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS rp_vouchers_tenant_linked_inv_idx ON rp_vouchers (tenant_id, linked_invoice_id) WHERE linked_invoice_id IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS rp_voucher_lines (
    id            TEXT NOT NULL,
    tenant_id     TEXT NOT NULL,
    voucher_id    TEXT NOT NULL,
    line_kind     TEXT NOT NULL DEFAULT 'line',
    account_id    TEXT NOT NULL DEFAULT '',
    account_name  TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    amount        TEXT NOT NULL DEFAULT '0',
    invoice_id    TEXT,
    line_order    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (id, tenant_id),
    FOREIGN KEY (voucher_id, tenant_id) REFERENCES rp_vouchers (id, tenant_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS rp_voucher_lines_voucher_idx  ON rp_voucher_lines (tenant_id, voucher_id, line_kind, line_order)`,
  `CREATE INDEX IF NOT EXISTS rp_voucher_lines_tenant_idx   ON rp_voucher_lines (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS rp_voucher_lines_account_idx  ON rp_voucher_lines (tenant_id, account_id)`,
  `CREATE INDEX IF NOT EXISTS rp_voucher_lines_invoice_idx  ON rp_voucher_lines (tenant_id, invoice_id) WHERE invoice_id IS NOT NULL`,

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
