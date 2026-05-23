# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

- **requirement-doc** (`artifacts/requirement-doc/`): Customer Requirement Collection Document — a beautiful, view-only single-page React + Vite frontend. No backend. Served at `/`.
- **admin-dashboard** (`artifacts/admin-dashboard/`): Onesoft Admin Dashboard — React + Vite + Tailwind. Data storage: **PostgreSQL only** — no localStorage for business data. Every mutation writes to `_memRaw` (in-memory Map, tab-scoped) immediately and fires `_apiWrite` to persist to PostgreSQL via the API server. On login, `syncAllFromServer` hydrates `_memRaw` from the DB. Auth state (login, tenant, impersonation) uses **sessionStorage** (per-tab, no cross-tab bleed). UI-only preferences (theme, document drafts, form layout modes) remain in localStorage. Served at `/admin-dashboard/`.
- **api-server** (`artifacts/api-server/`): Express 5 API server. Provides `/api/kv/:namespace/:key` REST endpoints (GET/PUT/DELETE) backed by PostgreSQL `kv_store` table, plus 30+ per-record relational endpoints (`/api/customers`, `/api/sales`, `/api/journal-entries`, …). Served at `/api`. Auth: `X-Api-Key` header matching `KV_API_SECRET` env var (fail-closed at startup); see "API auth & CORS" section below for the exact gated/anonymous matrix.
- **customer-portal** (`artifacts/customer-portal/`): Tenant-based customer self-service portal served at `/customer-portal/`. Customers log in with email + phone number (matched against the tenant's `admin-customers` KV data). Pages: Dashboard (stats + recent orders), Orders (full list + search), Order Detail (line items, totals, delivery status), Profile (read-only info). Tenant identified via `?t=<tenantId>` URL param or typed at login. No separate backend — reads directly from the shared KV API (`t:{tenantId}/admin-customers`, `t:{tenantId}/admin-sales`, `t:{tenantId}/admin-settings`).
- **tenant-store** (`artifacts/tenant-store/`): Tenant-facing e-commerce storefront. Minimal, tech-industry focused React + Vite app served at `/tenant-store/`. Reads products from `/api/kv/{namespace}/admin-products` (namespace = `t:{tenantId}` for tenant-specific, or `global` for superadmin). Cart stored in `onesoft-store-cart` localStorage key. Tenant ID passed via `?tenant=` URL param. Pages: Home, Shop, Product Detail, Category. Features: search, filter by category/brand/price, sort, cart drawer, mobile responsive.

### Admin Dashboard — Routes & Data

All data is stored in PostgreSQL KV store (`kv_store` table) and mirrored in `_memRaw` (in-memory Map).
Global keys (users, tenants) use namespace `global`. Tenant-scoped keys use `t:{tenantId}:{key}`.

| Route | Page | KV key |
|---|---|---|
| `/stock` | All Stock (All / For Sale / Not For Sale / Business Asset / Low Stock) | `admin-stock` |
| `/stock/holds` | Stock Holds — reserved (Not For Sale) items by customer | `admin-stock` |
| `/products` | Products catalogue | `admin-products` |
| `/brands` | Brand management | `admin-brands` |
| `/categories` | Product categories | `admin-product-categories` |
| `/attributes` | Product attributes | `admin-attributes` |
| `/units` | Units of measurement | `admin-units` |
| `/areas` | Cities & Areas / Regions master data | `admin-cities`, `admin-areas` |
| `/leads` | Leads pipeline | `admin-leads` |
| `/customers` | Customer management (city + area/region fields) | `admin-customers` |
| `/suppliers` | Supplier management (city + area/region fields) | `admin-suppliers` |
| `/documents` | Requirement documents | `admin-req-docs` |
| `/users` | User management (superadmin) | `admin-users` (global) |
| `/tenants` | Tenant management (superadmin) — create/edit/delete client orgs, switch views | `admin-tenants` (global) |
| `/module-groups` | Module Group management (superadmin) — define feature sets for tenant plans | `admin-module-groups` (global) |
| `/settings` | App settings — company profile, financial, POS defaults, data management | `admin-settings` |

Key files: `src/lib/store.ts`, `src/hooks/use-data.ts`, `src/components/editable-cell.tsx`, `src/components/layout.tsx`

### Chart of Accounts — IFRS/IAS-1 Hierarchy (as of April 2026)

Accounts are seeded by `seedDefaultCoaAccounts()` (called on every login). The migration in that function auto-upgrades existing tenants on next login.

```
1000  Assets (root)
  1100  Current Assets
    1110  Cash
    1120  Bank
    1130  Accounts Receivable (group)
      1130-000  Walk-in Customer  [SYSTEM — sys-walkin-ar, cannot be deleted]
    1131  Trade Receivables
    1140  Inventory
  1200  Non-Current Assets
    1210  Property, Plant & Equipment
    1220  Accumulated Depreciation (contra-asset)
2000  Liabilities (root)
  2100  Current Liabilities
    2110  Accounts Payable (group)
    2111  Trade Payables
    2120  VAT Payable
    2130  Accrued Expenses
  2200  Non-Current Liabilities
    2210  Long-term Loans
3000  Revenue / Income
  3100  Sales Revenue
  3200  Other Income
4000  Operating Expenses
  4100  COGS
  4200  Salary & Wages
  4300  Sales Commission
  4400  Office & Admin Expenses
  4500  Utility Bills
  4600  Purchases
5000  Capital & Equity
  5100  Owner's Capital
  5200  Retained Earnings
```

System account ID constants live in `SYS_ACCS` (see `store.ts`). New root IDs: `ASSETS_ROOT="sys-1000r"`, `NON_CURRENT_ASSETS="sys-1200g"`, `LIAB_ROOT="sys-2000r"`, `NON_CURRENT_LIAB="sys-2200g"`.

### Walk-in Customer (anonymous POS sales)

- `SYS_ACCS.WALK_IN_CUSTOMER_AR = "sys-walkin-ar"` — COA Ledger account `1130-000 Walk-in Customer`, child of AR Group (1130). Seeded by `SYSTEM_ACCOUNTS`.
- `SYS_WALKIN_CUSTOMER_ID = "sys-walkin-customer"` — Customer record with `name="Walk-in"`, `customerType="POS Customer"`, `ledgerAccountId="sys-walkin-ar"`. Seeded by COA migration **m10** on first login.
- `blankSale()` defaults `customer: "Walk-in"` so every new POS session starts with Walk-in pre-filled.
- `findSubLedgerForParty("Walk-in", AR_GROUP)` finds the Customer record by name, returns `sys-walkin-ar` — all JEs for anonymous sales debit account `1130-000` instead of the generic `1131 Trade Receivables`.
- **Protected from deletion**: `deleteCustomer` throws if `id === SYS_WALKIN_CUSTOMER_ID`; the delete button is hidden in the customers table row and detail panel for this record; `isSystemAccount("sys-walkin-ar")` returns `true` so the COA account is also protected.

Default credentials: superadmin `admin` / `Onesoft@2024` (sessionStorage key `onesoft-admin-auth`)

### Delete restrictions (financial integrity guards)

To preserve double-entry book integrity, the following records cannot be deleted while any payment, journal entry, or DR/CR ledger reference still exists. The store layer throws a descriptive `Error`, and every UI delete callsite catches it and shows a destructive toast titled "Cannot delete" with the error message. Implemented in `src/lib/store.ts` as `_saleFinancialBlockers`, `_invoiceFinancialBlockers`, `_purchaseOrderFinancialBlockers`, `_customerFinancialBlockers`, plus `_jesReferencingToken` and `_rpVouchersReferencingToken` (bounded-token regex matching, no false positives between e.g. `SAL-…-0001` and `SAL-…-00010`).

| Entity | Blocking conditions |
|---|---|
| Sale (POS or list) | `amountPaid > 0`, JE references `saleNumber` or `sale.jeId`, RP voucher references it, or sale return exists |
| Invoice (sale or purchase) | `amountPaid > 0`, non-empty `paymentHistory`, JE references `invoiceNumber` or `inv.jeId`, or RP voucher links via `linkedInvoiceId`/`linkedInvoiceIds`/`lines[].invoiceId` |
| Purchase Order | status is `Received`, JE references `poNumber` or `po.jeId`, or RP voucher references it |
| Customer / Supplier | any sale, invoice, PO (suppliers), RP voucher, or JE line on `customer.ledgerAccountId` |
| Sale Return / Purchase Return | linked JE (by `jeId` or `returnNumber`) |

`deleteInvoice` no longer cascades into vouchers/JEs — it now refuses outright, matching the user's "delete the underlying records first" requirement.

**Backend defence-in-depth**: The API DELETE routes for sales, invoices, sale-returns, purchase-returns, rp-vouchers, and purchase-orders enforce the same blockers and return **HTTP 409** with a descriptive message. Non-UI clients (scripts, integrations) get the same protection — the rules live in two layers, not in the UI alone. One intentional divergence: backend PO delete does **not** treat `status='Received'` as a blocker, because the frontend `deletePurchaseOrder` issues compensating `purchase-cancel` stock-ledger rows + rolls back stock *before* calling the API; gating on Received at the API would break that flow. The route docblock in `artifacts/api-server/src/routes/purchase-orders.ts` documents this explicitly.

### Reverse cascade — JE removal unwinds linked records

When `deleteJournalEntry(id)` runs, the store now scans every record that points at that JE via `jeId` and resets the financial state so the source record reflects "payment removed":

| Record | Effect on JE removal |
|---|---|
| Sale | `jeId` cleared, `amountPaid="0"`, `paidAt=""`; status reverts `Completed`/`On Credit` → `Pending` |
| Invoice | `jeId`/`jeUsesAR` cleared, `amountPaid="0"`, `paidAt=""`, `paymentHistory=[]`; status reverts `Paid`/`Partial` → `Sent` |
| Purchase Order | `jeId` cleared (stock receipt is left intact) |
| Sale Return | `jeId` cleared, status `posted` → `draft` |
| Purchase Return | `jeId` cleared, status `posted` → `draft` |
| RP Voucher | (existing behaviour) reset to draft, linked invoice payments reversed |

This complements the deletion blockers above: blockers prevent users from deleting the *source* record while a JE still exists; the reverse-cascade lets users delete the *JE* and have the source automatically return to its pre-payment state. Stock movements are not touched — those are handled separately via stock adjustments.

### API auth & CORS (May 2026 hardening)

The api-server runs `assertApiKeyEnvOrExit()` at startup — if `KV_API_SECRET` is unset, the process refuses to boot. Fail-closed, never fail-open. The previous design fell open without the env var, which silently anonymized every per-record route in any environment that forgot the secret.

| Surface | Auth | Notes |
|---|---|---|
| `/api/healthz` | anonymous | Deployment probes. |
| `/api/auth/*` | anonymous | Tenant login (must be open so the admin-dashboard login page can call it). |
| `/api/public/*` | anonymous | Public requirement-doc lookups. |
| `/api/kv/:ns/:key` | **per-method allowlist** | Anonymous only for the storefront key set; everything else requires `X-Api-Key`. See `routes/kv.ts`. |
| `/api/kv/` and `/api/kv/:ns` | `X-Api-Key` | Namespace list, namespace dump, namespace wipe — never anonymous. |
| All per-record routes (`/api/customers`, `/api/sales`, `/api/journal-entries`, all 30+) | `X-Api-Key` | Admin-dashboard `rFetch` (in `record-api.ts` and `api.ts`) sends the header automatically. No other client should reach these. |

**KV allowlist** (`routes/kv.ts` — `ANON_EXACT_READ` / `ANON_EXACT_WRITE` / `ANON_PREFIX_READ` / `ANON_PREFIX_WRITE`):
- Anon READ: `admin-products`, `admin-settings`, `website-cms`, `repair-bookings`, `store-orders`, `online-orders`, `portal-accounts`, prefix `portal-profile-`, prefix `clubcard-`
- Anon WRITE (PUT/POST): `repair-bookings`, `store-orders`, `online-orders`, `portal-accounts`, prefix `portal-profile-`, prefix `clubcard-`
- Anon DELETE: **never**

**Scoped storefront endpoints** (replaced previous whole-tenant anon reads of `admin-customers` / `admin-sales`, May 2026):
- `POST /api/portal/login` — verifies email + sha256 password hash against `portal-accounts`; returns the matching customer record only.
- `POST /api/portal/signup` — creates portal account + seeds clubcard (100 coins).
- `POST /api/portal/change-password` — verifies current hash before swapping.
- `GET /api/portal/sales?tenantId&customerName` — returns only the named customer's sales from the relational `sales`+`sale_items` tables.
- `POST /api/storefront/place-order` — atomic insert into `sales` + `sale_items` + append to tenant's `online-orders` kv. Callers: `customer-portal/src/{lib/api.ts,contexts/auth-context.tsx,pages/*}` + `tenant-store/src/pages/checkout.tsx`.

The gate uses a router-level middleware that parses `req.path` directly (Express `req.params` is empty in `router.use()` callbacks before route matching). Only the `/:namespace/:key` shape is eligible for the allowlist; root list, namespace dump, namespace wipe all require the key. Malformed percent-encoding fails closed to the gate (try/catch around `decodeURIComponent`).

**CORS** (`app.ts`): explicit allowlist from `ALLOWED_ORIGINS` env (comma-separated), with fallback to `REPLIT_DEV_DOMAIN` and a `*.replit.app` / `*.replit.dev` wildcard. Same-origin requests (no `Origin` header — curl, server-to-server) are allowed. Policy deny returns `cb(null, false)` (no CORS headers, browser drops cleanly) instead of throwing through Express's error handler as 500. `credentials: false` — every protected route uses the `X-Api-Key` header, never cookies.

**Known residual exposure** (May 2026):
1. ~~`admin-customers` / `admin-sales` / `portal-accounts` anonymous KV~~ — **CLOSED**. Replaced by the scoped `/api/portal/*` + `/api/storefront/*` endpoints above; all three keys now require `X-Api-Key`.
2. **`/api/portal/sales` and the rest of `/api/portal/*` are still anonymous** — they only require `tenantId` + a customer name or password hash, not a server-issued session. So anyone who guesses a customer's email + a weak password (or a name for `/sales`) can read their orders. This is materially better than the previous whole-tenant leak but full caller binding requires server-issued sessions — same auth epic as #3.
3. `VITE_KV_API_SECRET` is shipped in the admin-dashboard JS bundle (same value as `KV_API_SECRET`) — anyone who can load the admin app can extract the key. The gate is meaningful only against casual scanners, bots, other tenants of the same Replit deployment, and cross-origin attempts bypassing CORS. **Real per-user authentication (server-issued sessions, server-derived `tenantId`) is a separate epic** and remains unbuilt.
4. Plaintext password comparison in `admin-tenants` and `admin-sales-agents` (still done client-side in `store.ts`). Needs hashing + server-side auth route. Deferred to the same auth epic.

### Per-record REST migration (incremental cutover from KV)

The admin-dashboard is moving from KV-array writes (`/api/kv/{ns}/{key}` writing the entire `Brand[]`/`Lead[]`/etc array per mutation) to per-record relational endpoints (`/api/{entity}` returning the persisted row). The cutover is intentionally incremental:

| Batch | Status | Entities |
|---|---|---|
| 1 | Shipped | brands, units, attributes, cities, areas, departments, designations, product-categories |
| 2 | Shipped | leads, requirement-docs |
| Read-back bridge | Shipped (foundational fix) | See section below — was silently regressing Batches 1+2 across page refreshes. |
| 3 | Shipped | customers (and therefore "suppliers" — they are customer rows with `customerRole === "Supplier"`, not a separate table). Used dual-write + hook-side suppression flag — see "Batch 3 — customers" below. |
| Cleanup sweep | Shipped (May 2026) | Deleted 27 unused legacy CRUDs from store.ts (lead/doc/city/area/attribute/department/designation × all 3 ops; brand/unit/product-category × update+delete). Inlined the 18 `Parameters<typeof legacyFn>[N]` type-refs in `use-data.ts`. Kept `createBrand` / `createUnit` / `createProductCategory` because `products.tsx` CSV-import auto-create still calls them — added `_persistMigratedCreate` generic dual-write helper so those creates persist through to the relational table (otherwise the read-back bridge silently drops them on refresh). Customer CRUD untouched — still needed by m10/m11/COA heal/m14/PO-receive/sale-JE/findSubLedgerForParty/convertLeadToCustomer/ensureCustomerAdvanceLedger. |
| 4a | Shipped (May 2026) | accounts + journal-entries. Dual-write at `_saveAccounts` and `_doSaveJournalEntries` chokepoints via `_persistAccountRest` / `_persistJERest`. Tenant-switch race guarded by capturing `originTenantId` synchronously at the top of `_saveJournalEntries` and threading it through `_doSaveJournalEntries` → `_dualWriteJEsDiff` → `_persistJERest`. See "Batch 4 — chokepoint dual-write" below for the pattern. |
| 4b | Shipped (May 2026) | stock-items + stock-ledger. `_saveStock` / `_saveStockLedger` chokepoints introduced and every `setStored(STOCK_KEY,…)` / `setStored(LEDGER_KEY,…)` callsite (16+/5+ respectively) rerouted through them. Stock-ledger rows are immutable so the diff is id-set only — added-ids POST, removed-ids DELETE, no per-field comparison. The `_flushLedger` microtask coalescer now pins the origin tenant at the first `batchLedger` push of each tick and aborts the flush (with a warning) if `_activeTenantId` differs at drain time — closes the previously-documented cross-tenant race. |
| 4c | Shipped (May 2026) | sales + invoices + purchase-orders + sale-returns + purchase-returns + rp-vouchers — the transactional outer cluster. All six follow the same generic `_makeTxDualWrite<T>(label, api)` factory pattern. See "Batch 4 — chokepoint dual-write" below for details, including the two architect-flagged bugs caught and fixed before ship. |
| 12 | Shipped (May 2026) | **HRM recruitment cluster — jobs + job-applicants + interview-schedules**. Three simple HRM lookups, no JE/financial linkage. Three new backend tables in `schema-init.ts` (all flat-scalar, no jsonb) + tenant-scoped indexes (`jobs_tenant_status_idx`, `job_applicants_tenant_job_idx`, `interview_schedules_tenant_applicant_idx`). Three routes via `mountRecordRoutes` (`jobs.ts`, `job-applicants.ts`, `interview-schedules.ts`), mounted in `routes/index.ts`. Frontend: `jobsApi` / `jobApplicantsApi` / `interviewSchedulesApi` exported; three chokepoints `_saveJobs` / `_saveJobApplicants` / `_saveInterviews` with stable-JSON / persist-REST / diff-dual-write triplet matching Batch 9. All 9 `setStored(JOBS_KEY,…)` / `setStored(APPLICANTS_KEY,…)` / `setStored(INTERVIEWS_KEY,…)` callsites rerouted: 3 CRUD funcs per entity + `upsertInterviewSchedule`. Anti-recursion invariant respected — exactly 1 inner `setStored` per chokepoint, verified by grep. Bridge entries registered for all 3 keys in `MIGRATED_KEY_TO_TABLE`. Bulk-replace registry (Batch 11) extended with 3 chokepoint entries. `TENANT_ONLY_ORPHAN_KEYS` extended with 3 entries + 3 new `else if (k === …)` orphan-rescue arms calling the per-record REST helpers. **`nullifyUndefined` applied to all 3 `_persistXxxRest` create + update payloads** (architect-flagged: `recruitment.tsx` clears `JobApplicant.rating` via `parseInt(e.target.value) || undefined` — without the conversion, `JSON.stringify` drops the key and the relational row keeps the stale value, then the bridge surfaces it again on refresh). Applied defensively to all 3 entities since they all have nullable columns (`jobs.salary`; `applicants.{phone,round,rating,decision,resume_url,notes}`; `interviews.{notes,email_sent}`). No `BRIDGED_KEY_TO_REST` demo-seed entries — recruitment not part of demo seed. |
| 11 | Shipped (May 2026) | **ALL_STORE_KEYS hardening sweep** — closes the architect-flagged debt that `clearStoredModule` / `restoreStoredModuleSnapshot` / `clearAllStoredModules` wrote directly via `_apiWrite(sk, …)` for every key in `ALL_STORE_KEYS`, bypassing the bridge for ~14 already-migrated keys (only PA + SA were special-cased in Batch 10). New lazy-init `_bulkReplaceRegistry: Map<string, (items) => void>` in `store.ts`, built on first call so chokepoint references resolve correctly regardless of in-file declaration order. Registers all 21 migrated keys in `ALL_STORE_KEYS`: 12 chokepoint-bearing keys (Batches 4–10) wrap their `_saveXxx` (which handles cache + diff dual-write internally), 9 hook-cutover keys (Batches 1–3 — brands/units/attributes/product-categories/departments/designations/leads/req-docs/customers) wrap a new generic `_diffReplaceViaApi(key, api, items)` helper that captures prior from local cache, writes new via `setStored`, then diffs vs prior and fires DELETE (removed ids, 404-tolerated) / UPDATE (kept ids) / POST-then-PUT-on-409 (new ids) via the per-record api instance. Tenant capture moved to top of the helper per architect tightening suggestion. `_bulkReplaceMigratedKey(k, items)` returns true if handled — both module-snapshot functions consult it before falling through to legacy `_apiWrite`. Non-migrated keys (admin-users, admin-team-members, admin-settings) still take the legacy path. Removed the PA/SA special-cases from Batch 10 as they're now covered uniformly. No new entities migrated — pure hardening. |
| 10 | Shipped (May 2026) | **payment-accounts + sales-agents** — admin infra with COA ledger linkage (just `ledgerAccountId`, no JE-cascade fields on the record). Two new backend tables in `schema-init.ts` (flat-scalar) + tenant_id indexes. Two routes via `mountRecordRoutes`, mounted in `routes/index.ts`. Frontend: `paymentAccountsApi` / `salesAgentsApi` exported; chokepoints `_savePaymentAccounts` / `_saveSalesAgents` with stable-JSON / persist-REST / diff-dual-write triplet. All 6 PA `setStored(PAYMENT_ACCOUNTS_KEY,…)` sites rerouted: 3 CRUD funcs + 3 COA-heal/migration backfills (m07 default-Cash seed, m08 Cash-rename, CB-group ledger backfill at ~9050). All 3 SA CRUDs rerouted. Bridge entries + 2 orphan-rescue arms + TENANT_ONLY_ORPHAN_KEYS tuple +2 entries. Demo-seed `BRIDGED_KEY_TO_REST` extended with both keys (architect-flagged: PA + SA seeded in demo data and direct KV writes would be invisible to the bridge). `nullifyUndefined` applied in `_persistSalesAgentRest` for both create+update (architect-flagged: UI clears portal-login fields `username`/`password`/`loginEnabled` to `undefined` in sales-agents.tsx — without it, the field clear is silently dropped and stale credentials reappear after refresh). `clearStoredModule`/`restoreStoredModuleSnapshot` route PA + SA through their chokepoints (architect-flagged: `ALL_STORE_KEYS` writers bypassed the bridge — fixed for the new keys; broader pre-existing latent gap for earlier-migrated keys in ALL_STORE_KEYS is tracked separately). `admin-sales-agents` added to ALL_STORE_KEYS so backup/restore covers it. |
| 9 | Shipped (May 2026) | **advance-salaries** — HRM lookup. New `advance_salaries` table in `schema-init.ts` (flat scalar, no jsonb) + `advance_salaries_tenant_idx` / `advance_salaries_tenant_staff_idx`. New route `routes/advance-salaries.ts` using `mountRecordRoutes`, mounted at `/api/advance-salaries`. Frontend: `advanceSalariesApi` exported; `_saveAdvanceSalaries` chokepoint with stable-JSON / persist-REST / diff-dual-write triplet (no `nullifyUndefined` — the AdvanceSalary type has no nullable JE-cascade fields). All 3 `setStored(ADVANCE_SALARY_KEY,…)` callsites in the 3 CRUD funcs rerouted. Bridge entry `"admin-hrm-advance-salary": "advance_salaries"` registered. Orphan-rescue branch in `syncAllFromServer` Step 4a extended with new `else if (k === "admin-hrm-advance-salary")` arm. No `BRIDGED_KEY_TO_REST` demo-seed entry — advance-salary is not part of demo seed. Note: the `staff-loans` candidate was scoped but no such KV key exists in the codebase, so this batch is advance-salary alone. |
| 8 | Shipped (May 2026) | **salary-slips + attendance-records** — HRM transactional + simple lookup. Two new backend tables (`salary_slips` carries jsonb allowances/deductions + many nullable JE-cascade columns: journal_entry_id, accrual_journal_entry_id, staff_payable_ledger_id, payment_method, payment_account_id, paid_at, amount_paid; `attendance_records` is flat-scalar) + tenant_id + composite indexes. Two new routes (`salary-slips.ts`, `attendance-records.ts`) using `mountRecordRoutes`, mounted in `routes/index.ts`. Frontend: `salarySlipsApi` / `attendanceRecordsApi` exported; two chokepoints `_saveSalarySlips` / `_saveAttendance`. **`nullifyUndefined` now exported from `record-api.ts`** and applied inside `_persistSalarySlipRest` on both create and update payloads — this is the Batch 4 Bug #2 fix generalized: `deleteJournalEntry`'s reverse-cascade resets slip fields (`journalEntryId`, `accrualJournalEntryId`, `paidAt`, `paymentAccountId`, `paymentMethod`) to `undefined`; without the conversion, `JSON.stringify` drops those keys and the relational row keeps the stale je_id, then the kv.ts read-back bridge surfaces it again on refresh. All 6 `setStored(SALARY_SLIPS_KEY,…)` callsites rerouted: 3 CRUD funcs (create/update/delete) + 2 COA-heal bulk-backfills in `seedDefaultCoaAccounts` (accrual-JE seed at ~9280, payment-JE seed at ~9304) + 1 JE reverse-cascade at ~10517. All 3 `setStored(ATTENDANCE_KEY,…)` callsites (upsert insert/update branches + delete) rerouted. Bridge entries registered for both keys. Demo-seed `BRIDGED_KEY_TO_REST` extended with 1 entry (slips only — attendance is not seeded). Orphan-rescue branch in `syncAllFromServer` Step 4a extended with 2 new `else if (k === …)` arms. Anti-recursion invariant respected — exactly 1 inner `setStored` per chokepoint, verified by grep. |
| 7 | Shipped (May 2026) | **salary-templates + salary-allowance-categories + salary-deduction-categories** — HRM payroll lookup tables. Three new backend tables in `schema-init.ts` (salary_templates carries jsonb allowances/deductions; the two category tables are flat-scalar) + tenant_id indexes. Three new route files (`salary-templates.ts`, `salary-allowance-categories.ts`, `salary-deduction-categories.ts`) using `mountRecordRoutes`, mounted in `routes/index.ts`. Frontend: `salaryTemplatesApi` / `salaryAllowanceCategoriesApi` / `salaryDeductionCategoriesApi` exported; three chokepoints `_saveSalaryTemplates` / `_saveSalaryAllowanceCats` / `_saveSalaryDeductionCats` (each with stable-JSON / persist-REST / diff-dual-write triplet matching Batch 6); all 9 `setStored(SALARY_*_KEY, …)` callsites in the 9 CRUD funcs rerouted. Bridge entries registered for all 3 keys. Demo-seed `BRIDGED_KEY_TO_REST` extended with 3 entries (templates + both cat tables). Orphan-rescue branch in `syncAllFromServer` Step 4a extended with 3 new `else if (k === …)` arms calling the per-record REST helpers. No transactional dependencies — salary-slips deferred to next batch (has JE linkage + financial blockers). |
| 6 | Shipped (May 2026) | **staff-roles** — HRM lookup table. New backend artifacts: `staff_roles` table added to `schema-init.ts` (id, tenant_id, color, name, description, permissions, archived_at, created_at, updated_at) + index on tenant_id; `routes/staff-roles.ts` mounts `mountRecordRoutes`; mounted at `/api/staff-roles` in `routes/index.ts`. Frontend: `staffRolesApi = makeRecordApi<StaffRole>("staff-roles")` exported; `_saveStaffRoles` chokepoint with `_stableStaffRoleJson`/`_persistStaffRoleRest`/`_dualWriteStaffRolesDiff`; all 3 `setStored(HRM_ROLES_KEY,…)` callsites (createStaffRole/updateStaffRole/deleteStaffRole) rerouted. Bridge entry `"admin-hrm-roles": "staff_roles"` registered. Simple lookup entity — no child tables, no transactional dependencies, no callsite scope outside the 3 CRUD funcs. Note: backend "Bridge cleanup on namespace delete" (added end of Batch 5) automatically purges this table on tenant delete / demo reset / `cleanTenantMasterData`, no extra wiring needed. |
| 5 | Shipped (May 2026) | **products + staff** — catalogue + HRM entities. Both use the simple `makeRecordApi<T>(path)` factory (no child tables — jsonb on row). `_saveProducts` / `_saveStaff` chokepoints introduced; all 8 `setStored(PRODUCTS_KEY,…)` callsites (createProduct/updateProduct/deleteProduct/bulkReplaceProductImages/reorderProducts/PO-receive/Mfg-output/SKU-backfill migration) and all 8 `setStored(STAFF_KEY,…)` callsites (createStaff/updateStaff/deleteStaff/COA-heal/m11-backfill/role-rename/desig-rename/m14-clear) rerouted through them. Bridge entries `"admin-products": "products"` + `"admin-hrm-staff": "staff"` registered. **Three bypass sites fixed during architect review** (products only): `syncProductsToStore` uses per-record `productsApi.update` for tenant scope; `bulkImportProducts` calls `_saveProducts(finalList)` + adds an **awaited** `_persistProductsAwait(prior, next, tid)` to `writes[]` so CSV import keeps its "products durable on resolve" contract (fire-and-forget would lose writes on fast reload); `syncAllFromServer` Step 4b dedup fires per-record `_persistProductRest("delete")` for removed IDs in tenant scope. Same anti-recursion invariant as Batch 4b — the single inner `setStored` per chokepoint is the only one for each key in the file. Recursion was caught & fixed during the staff sed-replace, same as Batch 4 Bug #1. **Re-ship May 2026** (Neon migration follow-up): `MIGRATED_KEY_TO_TABLE` had been emptied during the Neon cutover; bridge entry re-registered in `kv.ts`. Architect also re-flagged that `_persistProductRest` and `_persistProductsAwait` were missing `nullifyUndefined` on create+update payloads — Product has ~12 optional fields (`localName`, `model`, `barcode`, `subcategory`, `department`, `metaTitle`, `metaDescription`, `clubcardPrice`, `websitePriceWas`, `thumbnail`, `variants`, `productAttributes`) that the UI clears via `... || undefined`; without the conversion `JSON.stringify` drops the keys, `mountRecordRoutes` only updates provided columns, and the bridge surfaces the stale row on refresh. Both helpers now apply `nullifyUndefined` on every payload, matching the Batch 8 (`_persistSalarySlipRest`) / Batch 10 (`_persistSalesAgentRest`) precedent. |

**Pattern** (consistent across batches):
- Typed REST client in `src/lib/record-api.ts` via the `makeRecordApi<T>(path)` factory.
- Tenant-aware cache helpers in `store.ts`: `patchXInCache(tenantId, row)` / `removeXFromCache(tenantId, id)`. Both **no-op if `_activeTenantId` changed mid-flight** — this is the load-bearing tenant-switch race guard.
- Hook in `src/hooks/use-data.ts`: `requireTenantId()` → `apiX.create/update/delete()` → `patchXInCache(tid, row)` → `fetch()` re-render. Returns the **server's persisted row**, never an optimistic local mutation.
- Side effects (activity log, etc.) called from the hook are guarded by `if (getActiveTenantId() === tid)` so a stale completion from tenant A cannot write into tenant B after a switch.

**`useLeads` field-clear normalization** (Batch 2): the leads UI clears nullable timestamp/numeric fields (`nextReminder`, `dealValue`, `nextFollowUp`, etc.) by passing `undefined` or `""`. `JSON.stringify` drops `undefined` keys and the backend's `TIMESTAMPTZ` columns reject `""` outright. The `normalizeLeadUpdates` helper in `use-data.ts` converts `undefined` → `null` universally and `""` → `null` for the known-nullable column set, so caller intent ("key present" = "set, possibly to null") survives the wire.

Legacy `createLead`/`updateLead`/`deleteLead`/`createDoc`/`updateDoc`/`deleteDoc` (and the analogous Batch 1 functions) remain exported from `store.ts` but are no longer called by hooks. They will be removed in a follow-up sweep after every batch ships, to keep churn low while the migration is in flight.

**Read-back bridge** (`artifacts/api-server/src/routes/kv.ts`): the foundational fix that makes Batches 1+2 actually durable across page refreshes. The frontend's `syncAllFromServer` only calls `kvGetAll` (which reads `kv_store`), and `_lsCache` only writes to `_memRaw` (an in-memory `Map`, lost on reload — NOT localStorage). Without the bridge, every record written through a migrated REST endpoint vanished on the next refresh because the relational table was never read back. The bridge: a `MIGRATED_KEY_TO_TABLE` registry in `kv.ts` (10 entries today, one per migrated entity) — `GET /api/kv/:ns/:key` and `GET /api/kv/:ns` short-circuit for tenant namespaces, returning rows synthesized from the relational table (active rows only, `rowToApi`-ified) instead of reading `kv_store`. The frontend is unchanged. Add a new entry per batch as it lands. The bridge is removable once `kv.ts` is fully retired. **Critical invariant**: once a key is in the registry, EVERY writer for that entity must go through the per-record REST endpoint — any remaining KV writes for that key become invisible (the bridge ignores `kv_store` for migrated keys). This invariant is what makes Batch 3 (customers) more involved than it first appears.

### Batch 4 — chokepoint dual-write (transactional cluster)

Batches 4a/4b/4c all share one pattern: dual-write at the `_saveXxx` chokepoint layer rather than at the legacy CRUD entrypoint. This is necessary because the transactional cluster has many bulk writers (PO-receive, sale fulfillment, m11/m14 reseeds, reverse-cascade in `deleteJournalEntry`) that bypass the CRUD funcs and call `setStored(KEY, …)` directly. Diffing at the chokepoint covers every writer in one place.

**Generic factory** (`store.ts`): `_makeTxDualWrite<T>(label, api)` returns `{ persist, diff }`. The diff helper compares `prev` vs `next` records by `JSON.stringify(record minus createdAt/updatedAt)` — equality at this level subsumes child-array changes since children are nested in the parent JSON. New ids → POST, changed records → PUT (which the backend routes treat as wholesale child-array replace), removed ids → DELETE. Tenant-switch race guarded by `tenantIdOverride` captured synchronously at the chokepoint top, threaded through `persist()` and into the REST call.

**Six 4c chokepoints**: `_saveSales`, `_saveInvoices`, `_savePOs`, `_saveSaleReturns`, `_savePurchaseReturns` are new wrappers around `setStored`; `_saveRPVouchers` (which already existed for the legacy `_apiWrite` path) was extended to add the diff. All consume their per-entity TxApi client built via `makeTxRecordApi<T>(path, toBody)` in `record-api.ts`.

**Custom POST/PUT body shapes**: each route accepts a bespoke envelope (`{tenantId, sale, items}` for sales, `{tenantId, invoice, items, payments}` for invoices, `{tenantId, po, items}` for POs, `{tenantId, saleReturn, items}` / `{tenantId, purchaseReturn, items}` for returns, `{tenantId, voucher, lines, bankLines}` for RP vouchers). The `toBody` splitters destructure the FE record into the route's parent + child arrays.

**Bug #1 caught in T403 review** — fatal recursion in 5 chokepoints. The initial sed-replace of `setStored(KEY,…)` → `_saveXxx(…)` blindly hit the writes *inside* the newly added chokepoints themselves, turning each `_saveXxx` into an infinite self-call. Fix: revert the single `setStored(KEY, items)` line inside each chokepoint back to the real storage write. Always sed-replace AFTER adding the chokepoint, or anchor the sed pattern to exclude the chokepoint body.

**Bug #2 caught in T403 review** — JE-link clears silently dropped on the wire. `deleteJournalEntry`'s reverse-cascade resets fields like `jeId`, `journalEntryId`, `jeUsesAR` to `undefined`. `JSON.stringify` omits undefined keys entirely; on the server PUT routes, "key absent" was indistinguishable from "preserve existing" (the routes use `COALESCE($N, col)` or `field ?? before.field`). Without normalization, the relational table kept the stale `je_id` and the kv.ts read-back bridge surfaced it again on next reload — the very class of bug the read-back bridge was meant to prevent. Fix: `nullifyUndefined()` helper in `record-api.ts` converts top-level `undefined` → explicit `null` on every parent record before serialization (applied in all 6 `toBody` splitters). Child arrays flow through unchanged; their per-row undefined→null handling happens in the route's per-column value helpers.

**Bridge invariant** — once a key joins `MIGRATED_KEY_TO_TABLE`, every writer for that key MUST hit the per-record REST endpoint (the bridge ignores `kv_store` for migrated keys). Batch 4 satisfies this by funneling every write through the chokepoint, which is the single shared edge with the dual-write helper. Future writers added to the file MUST use the chokepoint, never `setStored(KEY,…)` directly.

### Batch 3 — customers (shipped)

Rather than make `createCustomer`/`updateCustomer`/`deleteCustomer` async — which would have rippled through ~16 call sites including transactional flows on the unmigrated stock/sales path (PO-receive, sale-JE write-back, findSubLedgerForParty, ensureCustomerAdvanceLedger, m14 advance clears) — Batch 3 uses a **dual-write + hook suppression** pattern that keeps the legacy CRUD synchronous while still routing every customer mutation through the relational `customers` table.

**Mechanics** (`artifacts/admin-dashboard/src/lib/store.ts`):
- `_persistCustomerRest(op, customer)` — fire-and-forget helper that POSTs/PUTs/DELETEs to `customersApi`, tolerates HTTP 409 on idempotent re-seed (m10 walk-in on every login), logs other failures non-fatally. Called by `createCustomer`, `updateCustomer`, `deleteCustomer`, the m10 walk-in seed, and the m11/COA contact-ledger heal loop.
- `_suppressCustomerRestDualWrite` — module-scoped flag exposed via `_runWithSuppressedCustomerRest(fn)`. Set synchronously around the legacy CRUD call from inside the React hook so the hook can own the awaited REST roundtrip and patch the cache with the server's persisted row. Because the legacy CRUD is fully synchronous, the flag is always cleared before any other code can observe it.

**Hook** (`useCustomers` in `use-data.ts`): now returns Promises from `addCustomer`/`editCustomer`/`removeCustomer`. Each handler runs the legacy sync CRUD under suppression (for COA ledger, OB-JE, activity log, `_memRaw`, blocker preflight), then awaits the per-record REST call, then `patchCustomerInCache(tid, row)` / `removeCustomerFromCache(tid, id)`. 404 on delete is tolerated (already gone).

**Internal callers left untouched** — they keep calling the sync `createCustomer`/`updateCustomer`/`deleteCustomer`, and the built-in fire-and-forget dual-write inside those functions automatically persists every mutation through to the `customers` table. This includes the walk-in seed (m10), COA contact-ledger heal (~8097), `convertLeadToCustomer`, the createSubsidiaryLedger / sale-JE / PO-receive / findSubLedgerForParty backfills, m14 advance-ledger clears, and `ensureCustomerAdvanceLedger`. Verified by grep that no other write path exists.

**Page callsites** updated to `await`: `customers.tsx` (commitCell, commitNewRow, handleDelete, handleImportCustomers — import loop changed `forEach` → `for…of` to await sequentially), `customer-new.tsx`, `customer-edit.tsx`, `supplier-new.tsx`, `dashboard.tsx` quick-add, `sales.tsx` POS onAddCustomer. Every handler wraps in try/catch and surfaces failures via destructive toast.

**Bridge** (`artifacts/api-server/src/routes/kv.ts`): `"admin-customers": "customers"` added to `MIGRATED_KEY_TO_TABLE` — the cutover invariant is satisfied because every writer (hook OR legacy sync) now hits the REST endpoint.

**Cache helpers** (`store.ts`): `patchCustomerInCache(tid, c)` / `removeCustomerFromCache(tid, id)` exported alongside the existing Batch 1+2 cache helpers, all built on `_patchRecordInCache` / `_removeRecordFromCache` which already no-op on tenant-switch race.

### Sale-return visibility on the sales list

`sales.tsx` consumes the new `useSaleReturns()` hook and builds a `Map<saleId → {count, qty}>`. When a sale has any returns, a small rose-coloured "↩ Returned" pill is rendered next to its Status badge with a tooltip showing return count and total returned quantity. The hook follows the same `useStoreEffect` pattern as all other data hooks: the badge re-evaluates on mount and on `storage` / `onesoft:data-synced` events. In practice it appears when the user navigates back to the Sales list after creating a Sale Return (re-mount), which matches the rest of the app's data-flow conventions — there is no in-page live update channel for `setStored` writes.

### Multi-tenant & Module Groups System

- **Multi-tenant storage**: Superadmin data uses unprefixed keys. Tenant data uses `t:{tenantId}:{baseKey}` prefix. Global platform keys (users, tenants, module-groups) always unprefixed.
- **Strict tenant isolation** (`store.ts`):
  - `PLATFORM_GLOBAL_KEYS` whitelist defines the only keys that may legitimately live in the unprefixed `global` namespace: `admin-tenants`, `admin-users`, `admin-module-groups`. Every other key is treated as tenant-business data.
  - `setActiveTenant(id)` purges every `_memRaw` entry that does not belong to the new scope on every tenant switch (including login, logout, impersonation, exit-impersonation, and superadmin tenant switching). This prevents prior-session bytes from leaking into the next session within the same browser tab.
  - `syncAllFromServer(tenantId)` only loads keys from the `global` namespace into the cache when `tenantId === null` (superadmin) OR the key is in `PLATFORM_GLOBAL_KEYS`. Legacy single-tenant business data that may still exist in `global` (admin-sales, admin-customers, admin-products, …) is therefore never surfaced to a tenant session, even if `_activeTenantId` were ever transiently null.
- **Module Groups**: Each group defines a set of allowed module IDs (crm_leads, crm_customers, crm_suppliers, products, stock, purchases, sales, documents, hrm_staff, hrm_roles, hrm_org, media, settings). A tenant can be assigned a module group to restrict their nav.
- **HRM Org** (`/hrm-org`): Departments & Designations page with two inline Excel-style grids — add/edit/delete departments (with staff and designation counts) and designations (with department select and Job Description dialog). Data stored in localStorage via `store.ts` using `Department` and `Designation` types.
- **Nav enforcement**: When superadmin is in "view as tenant" mode (amber banner), or a tenant user is logged in, the top nav is filtered to only show modules allowed by the tenant's module group. Superadmin admin-only items (Tenants, Module Groups, Admin Accounts) always remain accessible.
- **Switch to / Exit Tenant View**: Superadmin can click "Switch to" on any tenant card to preview their restricted view. An amber banner with "Exit Tenant View" restores full admin access.
- **SessionStorage keys**: `onesoft-admin-auth`, `onesoft-admin-user-id`, `onesoft-tenant-id`

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
