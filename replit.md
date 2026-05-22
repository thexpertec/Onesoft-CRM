# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

- **requirement-doc** (`artifacts/requirement-doc/`): Customer Requirement Collection Document — a beautiful, view-only single-page React + Vite frontend. No backend. Served at `/`.
- **admin-dashboard** (`artifacts/admin-dashboard/`): Onesoft Admin Dashboard — React + Vite + Tailwind. Data storage: **PostgreSQL only** — no localStorage for business data. Every mutation writes to `_memRaw` (in-memory Map, tab-scoped) immediately and fires `_apiWrite` to persist to PostgreSQL via the API server. On login, `syncAllFromServer` hydrates `_memRaw` from the DB. Auth state (login, tenant, impersonation) uses **sessionStorage** (per-tab, no cross-tab bleed). UI-only preferences (theme, document drafts, form layout modes) remain in localStorage. Served at `/admin-dashboard/`.
- **api-server** (`artifacts/api-server/`): Express 5 API server. Provides `/api/kv/:namespace/:key` REST endpoints (GET/PUT/DELETE) backed by PostgreSQL `kv_store` table. Served at `/api`. No auth on API — it is internal only.
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

### Per-record REST migration (incremental cutover from KV)

The admin-dashboard is moving from KV-array writes (`/api/kv/{ns}/{key}` writing the entire `Brand[]`/`Lead[]`/etc array per mutation) to per-record relational endpoints (`/api/{entity}` returning the persisted row). The cutover is intentionally incremental:

| Batch | Status | Entities |
|---|---|---|
| 1 | Shipped | brands, units, attributes, cities, areas, departments, designations, product-categories |
| 2 | Shipped | leads, requirement-docs |
| Read-back bridge | Shipped (foundational fix) | See section below — was silently regressing Batches 1+2 across page refreshes. |
| 3 | Shipped | customers (and therefore "suppliers" — they are customer rows with `customerRole === "Supplier"`, not a separate table). Used dual-write + hook-side suppression flag — see "Batch 3 — customers" below. |
| 4 (planned) | Pending | stock-items + sales + invoices + purchase-orders + returns + stock-ledger — the transactional cluster. Stock-items can't be migrated alone because it's called from PO-receive and sale-fulfillment flows still on KV. |

**Pattern** (consistent across batches):
- Typed REST client in `src/lib/record-api.ts` via the `makeRecordApi<T>(path)` factory.
- Tenant-aware cache helpers in `store.ts`: `patchXInCache(tenantId, row)` / `removeXFromCache(tenantId, id)`. Both **no-op if `_activeTenantId` changed mid-flight** — this is the load-bearing tenant-switch race guard.
- Hook in `src/hooks/use-data.ts`: `requireTenantId()` → `apiX.create/update/delete()` → `patchXInCache(tid, row)` → `fetch()` re-render. Returns the **server's persisted row**, never an optimistic local mutation.
- Side effects (activity log, etc.) called from the hook are guarded by `if (getActiveTenantId() === tid)` so a stale completion from tenant A cannot write into tenant B after a switch.

**`useLeads` field-clear normalization** (Batch 2): the leads UI clears nullable timestamp/numeric fields (`nextReminder`, `dealValue`, `nextFollowUp`, etc.) by passing `undefined` or `""`. `JSON.stringify` drops `undefined` keys and the backend's `TIMESTAMPTZ` columns reject `""` outright. The `normalizeLeadUpdates` helper in `use-data.ts` converts `undefined` → `null` universally and `""` → `null` for the known-nullable column set, so caller intent ("key present" = "set, possibly to null") survives the wire.

Legacy `createLead`/`updateLead`/`deleteLead`/`createDoc`/`updateDoc`/`deleteDoc` (and the analogous Batch 1 functions) remain exported from `store.ts` but are no longer called by hooks. They will be removed in a follow-up sweep after every batch ships, to keep churn low while the migration is in flight.

**Read-back bridge** (`artifacts/api-server/src/routes/kv.ts`): the foundational fix that makes Batches 1+2 actually durable across page refreshes. The frontend's `syncAllFromServer` only calls `kvGetAll` (which reads `kv_store`), and `_lsCache` only writes to `_memRaw` (an in-memory `Map`, lost on reload — NOT localStorage). Without the bridge, every record written through a migrated REST endpoint vanished on the next refresh because the relational table was never read back. The bridge: a `MIGRATED_KEY_TO_TABLE` registry in `kv.ts` (10 entries today, one per migrated entity) — `GET /api/kv/:ns/:key` and `GET /api/kv/:ns` short-circuit for tenant namespaces, returning rows synthesized from the relational table (active rows only, `rowToApi`-ified) instead of reading `kv_store`. The frontend is unchanged. Add a new entry per batch as it lands. The bridge is removable once `kv.ts` is fully retired. **Critical invariant**: once a key is in the registry, EVERY writer for that entity must go through the per-record REST endpoint — any remaining KV writes for that key become invisible (the bridge ignores `kv_store` for migrated keys). This invariant is what makes Batch 3 (customers) more involved than it first appears.

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
