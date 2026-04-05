# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

- **requirement-doc** (`artifacts/requirement-doc/`): Customer Requirement Collection Document — a beautiful, view-only single-page React + Vite frontend. No backend. Served at `/`.
- **admin-dashboard** (`artifacts/admin-dashboard/`): Onesoft Admin Dashboard — React + Vite + Tailwind. All data stored in localStorage. Auth via sessionStorage. Served at `/admin-dashboard/`.

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
| `/leads` | Leads pipeline | `admin-leads` |
| `/customers` | Customer management | `admin-customers` |
| `/suppliers` | Supplier management | `admin-suppliers` |
| `/documents` | Requirement documents | `admin-req-docs` |
| `/users` | User management (superadmin) | `admin-users` |
| `/tenants` | Tenant management (superadmin) — create/edit/delete client orgs, switch views | `admin-tenants` (global) |
| `/module-groups` | Module Group management (superadmin) — define feature sets for tenant plans | `admin-module-groups` (global) |
| `/settings` | App settings — company profile, financial, POS defaults, data management | `admin-settings` |

Key files: `src/lib/store.ts`, `src/hooks/use-data.ts`, `src/components/editable-cell.tsx`, `src/components/layout.tsx`

Default credentials: superadmin `admin` / `Onesoft@2024` (sessionStorage key `onesoft-admin-auth`)

### Multi-tenant & Module Groups System

- **Multi-tenant storage**: Superadmin data uses unprefixed keys. Tenant data uses `t:{tenantId}:{baseKey}` prefix. Global platform keys (users, tenants, module-groups) always unprefixed.
- **Module Groups**: Each group defines a set of allowed module IDs (crm_leads, crm_customers, crm_suppliers, products, stock, purchases, sales, documents, hrm_staff, hrm_roles, media, settings). A tenant can be assigned a module group to restrict their nav.
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
