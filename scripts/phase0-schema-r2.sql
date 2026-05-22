-- Phase 0 schema delta r2 — fixes flagged by code review.
-- Idempotent: wraps each ALTER in a DO block that swallows duplicate_object.
--
-- Why composite (id, tenant_id) FKs?
--   The single-column FK on (ledger_account_id) only proves the account
--   *exists somewhere*. It does NOT prevent a malicious or buggy caller from
--   posting a JE line that references an account belonging to a different
--   tenant. The composite FK closes that hole at the database layer —
--   structurally enforced, not relying on every code path remembering to
--   check tenant_id.
--
-- The composite targets already exist in the base schema:
--   accounts_id_tenant_uq         on accounts(id, tenant_id)
--   je_id_tenant_uq               on journal_entries(id, tenant_id)

BEGIN;

DO $$ BEGIN
  ALTER TABLE journal_entry_lines
    ADD CONSTRAINT jel_je_tenant_fkey
    FOREIGN KEY (journal_entry_id, tenant_id)
    REFERENCES journal_entries(id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE journal_entry_lines
    ADD CONSTRAINT jel_ledger_tenant_fkey
    FOREIGN KEY (ledger_account_id, tenant_id)
    REFERENCES accounts(id, tenant_id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customers
    ADD CONSTRAINT customers_ledger_tenant_fkey
    FOREIGN KEY (ledger_account_id, tenant_id)
    REFERENCES accounts(id, tenant_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customers
    ADD CONSTRAINT customers_advance_ledger_tenant_fkey
    FOREIGN KEY (advance_ledger_account_id, tenant_id)
    REFERENCES accounts(id, tenant_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff
    ADD CONSTRAINT staff_ledger_tenant_fkey
    FOREIGN KEY (ledger_account_id, tenant_id)
    REFERENCES accounts(id, tenant_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff
    ADD CONSTRAINT staff_payable_tenant_fkey
    FOREIGN KEY (staff_payable_ledger_id, tenant_id)
    REFERENCES accounts(id, tenant_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
