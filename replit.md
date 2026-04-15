# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

- **requirement-doc** (`artifacts/requirement-doc/`): Customer Requirement Collection Document — a beautiful, view-only single-page React + Vite frontend. No backend. Served at `/`.
- **admin-dashboard** (`artifacts/admin-dashboard/`): Onesoft Admin Dashboard — React + Vite + Tailwind. Data uses **write-through cache**: every save goes to both localStorage (fast sync read) AND PostgreSQL (persistent backup via API server). On login, all data is hydrated from PostgreSQL into localStorage. Auth via sessionStorage. Served at `/admin-dashboard/`.
- **api-server** (`artifacts/api-server/`): Express 5 API server. Provides `/api/kv/:namespace/:key` REST endpoints (GET/PUT/DELETE) backed by PostgreSQL `kv_store` table. Served at `/api`. No auth on API — it is internal only.
- **tenant-store** (`artifacts/tenant-store/`): Tenant-facing e-commerce storefront. Minimal, tech-industry focused React + Vite app served at `/tenant-store/`. Reads products from `/api/kv/{namespace}/admin-products` (namespace = `t:{tenantId}` for tenant-specific, or `global` for superadmin). Cart stored in `onesoft-store-cart` localStorage key. Tenant ID passed via `?tenant=` URL param. Pages: Home, Shop, Product Detail, Category. Features: search, filter by category/brand/price, sort, cart drawer, mobile responsive.

### Admin Dashboard — Routes & Data

| Route | Page | localStorage key |
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
| `/users` | User management (superadmin) | `admin-users` |
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

Default credentials: superadmin `admin` / `Onesoft@2024` (sessionStorage key `onesoft-admin-auth`)

### Multi-tenant & Module Groups System

- **Multi-tenant storage**: Superadmin data uses unprefixed keys. Tenant data uses `t:{tenantId}:{baseKey}` prefix. Global platform keys (users, tenants, module-groups) always unprefixed.
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
