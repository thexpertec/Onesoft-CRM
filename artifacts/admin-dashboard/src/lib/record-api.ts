/**
 * Async REST client for the per-record relational endpoints (Phase 1+).
 *
 * Wraps /api/accounts and /api/journal-entries.  Every function:
 *   - Throws on any non-2xx response (caller shows destructive toast)
 *   - Returns the server's persisted row — the UI updates from that response,
 *     never from an optimistic local mutation
 */

import type {
  Account, JournalEntry, JournalEntryLine,
  Brand, Unit, Attribute, City, Area,
  Department, Designation, ProductCategory,
  Lead, RequirementDoc, Customer,
  StockItem, StockLedgerEntry,
  Sale, Invoice, PurchaseOrder,
  SaleReturn, PurchaseReturn, RPVoucher,
  Product, Staff, StaffRole,
  SalaryTemplate, SalaryAllowanceCategory, SalaryDeductionCategory,
  SalarySlip, AttendanceRecord,
} from "@/lib/store";

const BASE = "/api";
const TIMEOUT_MS = 15_000;
const KV_API_KEY = (import.meta.env.VITE_KV_API_SECRET as string) ?? "";

async function rFetch(url: string, opts: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": KV_API_KEY,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = (j?.error ?? j?.message ?? "") as string;
    } catch { /* ignore */ }
    throw new Error(detail || `Server error (HTTP ${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function apiCreateAccount(
  tenantId: string,
  data: Omit<Account, "id" | "createdAt" | "updatedAt">,
): Promise<Account> {
  return rFetch(`${BASE}/accounts`, {
    method: "POST",
    body: JSON.stringify({ tenantId, ...data }),
  }) as Promise<Account>;
}

export async function apiUpdateAccount(
  tenantId: string,
  id: string,
  data: Partial<Omit<Account, "id" | "createdAt">>,
): Promise<Account> {
  return rFetch(`${BASE}/accounts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ tenantId, ...data }),
  }) as Promise<Account>;
}

/** Soft-delete (archive) an account via the REST API.
 *  If the server returns 409 (FK violation) the caller receives the thrown error. */
export async function apiDeleteAccount(
  tenantId: string,
  id: string,
): Promise<void> {
  await rFetch(
    `${BASE}/accounts/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`,
    { method: "DELETE" },
  );
}

// ─── Journal Entries ──────────────────────────────────────────────────────────

export interface ApiJELine {
  id?: string;
  ledgerAccountId: string;
  accountCode: string;
  narration?: string;
  debit?: number | string;
  credit?: number | string;
  staffId?: string | null;
  partyType?: string | null;
  partyId?: string | null;
  lineOrder?: number;
}

export interface ApiJEPayload {
  id?: string;
  reference: string;
  description?: string;
  date: string;
  status?: "draft" | "posted";
  reversesJeId?: string | null;
}

interface ApiJEResponse extends Record<string, unknown> {
  id: string;
  reference: string;
  description: string;
  date: string;
  status: "draft" | "posted";
  totalDebit: string;
  totalCredit: string;
  isBalanced: boolean;
  createdAt: string;
  updatedAt: string;
  lines: Array<Record<string, unknown>>;
}

/**
 * Map the API's camelCase JE response (server already ran rowToApi) back to
 * the frontend JournalEntry shape:
 *   - `ledgerAccountId` → `ledgerId`
 *   - numeric strings for debit/credit → numbers
 */
export function mapApiJEToFrontend(raw: ApiJEResponse): JournalEntry {
  const lines: JournalEntryLine[] = (raw.lines ?? []).map((l) => ({
    id: l.id as string,
    ledgerId: (l.ledgerAccountId as string) ?? "",
    narration: (l.narration as string) ?? "",
    debit: parseFloat((l.debit as string) ?? "0") || 0,
    credit: parseFloat((l.credit as string) ?? "0") || 0,
    staffId: (l.staffId as string | undefined) ?? undefined,
  }));
  return {
    id: raw.id,
    reference: raw.reference,
    description: raw.description ?? "",
    date: raw.date,
    status: raw.status,
    lines,
    totalDebit: parseFloat((raw.totalDebit as string) ?? "0") || 0,
    totalCredit: parseFloat((raw.totalCredit as string) ?? "0") || 0,
    isBalanced: raw.isBalanced,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function apiCreateJE(
  tenantId: string,
  je: ApiJEPayload,
  lines: ApiJELine[],
): Promise<JournalEntry> {
  const raw = await rFetch(`${BASE}/journal-entries`, {
    method: "POST",
    body: JSON.stringify({ tenantId, je, lines }),
  }) as ApiJEResponse;
  return mapApiJEToFrontend(raw);
}

export async function apiUpdateJE(
  tenantId: string,
  id: string,
  je: Partial<ApiJEPayload>,
  lines: ApiJELine[],
): Promise<JournalEntry> {
  const raw = await rFetch(`${BASE}/journal-entries/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ tenantId, je, lines }),
  }) as ApiJEResponse;
  return mapApiJEToFrontend(raw);
}

export async function apiDeleteJE(
  tenantId: string,
  id: string,
): Promise<void> {
  await rFetch(
    `${BASE}/journal-entries/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`,
    { method: "DELETE" },
  );
}

// ─── Generic per-record CRUD factory ──────────────────────────────────────────
// Used by master-data entities whose backend routes are mounted via the
// generic `mountRecordRoutes` helper (no custom request/response shaping
// needed beyond default camelCase ↔ snake_case conversion).
//
// The factory returns three async methods matching the established
// accounts/JEs contract: throws on non-2xx, returns the server's persisted
// row on success, no optimistic local mutation.

interface RecordApi<T> {
  create(tenantId: string, data: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T>;
  update(tenantId: string, id: string, data: Partial<Omit<T, "id" | "createdAt">>): Promise<T>;
  delete(tenantId: string, id: string): Promise<void>;
}

function makeRecordApi<T extends { id: string }>(path: string): RecordApi<T> {
  return {
    create: (tenantId, data) =>
      rFetch(`${BASE}/${path}`, {
        method: "POST",
        body: JSON.stringify({ tenantId, ...data }),
      }) as Promise<T>,
    update: (tenantId, id, data) =>
      rFetch(`${BASE}/${path}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ tenantId, ...data }),
      }) as Promise<T>,
    delete: async (tenantId, id) => {
      await rFetch(
        `${BASE}/${path}/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: "DELETE" },
      );
    },
  };
}

// ─── Master-data REST clients (Batch 1) ───────────────────────────────────────
export const brandsApi             = makeRecordApi<Brand>("brands");
export const unitsApi              = makeRecordApi<Unit>("units");
export const attributesApi         = makeRecordApi<Attribute>("attributes");
export const citiesApi             = makeRecordApi<City>("cities");
export const areasApi              = makeRecordApi<Area>("areas");
export const departmentsApi        = makeRecordApi<Department>("departments");
export const designationsApi       = makeRecordApi<Designation>("designations");
export const productCategoriesApi  = makeRecordApi<ProductCategory>("product-categories");

// ─── CRM REST clients (Batch 2) ───────────────────────────────────────────────
export const leadsApi              = makeRecordApi<Lead>("leads");
export const requirementDocsApi    = makeRecordApi<RequirementDoc>("requirement-docs");

// ─── Stock REST clients (Batch 4b) ────────────────────────────────────────────
// `stockItemsApi` covers full CRUD on the `stock_items` table. `stockLedgerApi`
// is append-only-plus-delete in practice (entries are immutable — the only
// writes the FE does are CREATE via batchLedger and DELETE via
// clearEntityLedger / deleteStockLedgerEntry / dedup passes). The `.update`
// surface is exposed by makeRecordApi but never called.
export const stockItemsApi         = makeRecordApi<StockItem>("stock-items");
export const stockLedgerApi        = makeRecordApi<StockLedgerEntry>("stock-ledger");

// ─── Transactional REST clients (Batch 4c) ────────────────────────────────────
// Each route uses a custom POST/PUT body shape — parent record + child arrays
// (items / payments / lines / bankLines). The factory here splits the FE
// record into the route-specific envelope and returns the persisted parent.
// The frontend cache keeps its own copy via `_saveXxx` chokepoints; the REST
// roundtrip is fire-and-forget dual-write, so the .then is intentionally
// unused at call sites.

interface TxRecordApi<T> {
  create(tenantId: string, record: T): Promise<unknown>;
  update(tenantId: string, id: string, record: T): Promise<unknown>;
  delete(tenantId: string, id: string): Promise<void>;
}

/** Build a per-tx REST client from a splitter that converts a FE record into the
 *  `{ tenantId, ...envelope }` POST/PUT body the route expects. */
function makeTxRecordApi<T extends { id: string }>(
  path: string,
  toBody: (record: T) => Record<string, unknown>,
): TxRecordApi<T> {
  return {
    create: (tenantId, record) =>
      rFetch(`${BASE}/${path}`, {
        method: "POST",
        body: JSON.stringify({ tenantId, ...toBody(record) }),
      }),
    update: (tenantId, id, record) =>
      rFetch(`${BASE}/${path}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ tenantId, ...toBody(record) }),
      }),
    delete: async (tenantId, id) => {
      await rFetch(
        `${BASE}/${path}/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: "DELETE" },
      );
    },
  };
}

/**
 * Convert top-level `undefined` keys to explicit `null` before serialization.
 *
 * Why: the reverse-cascade in `deleteJournalEntry` clears fields like
 * `jeId`, `journalEntryId`, `jeUsesAR` by setting them to `undefined`.
 * `JSON.stringify` drops `undefined` keys outright, which on the server's
 * PUT routes is indistinguishable from "field not provided — keep existing"
 * (the routes use either `COALESCE($N, col)` or `field ?? before.field`
 * semantics). Without this normalization the relational table would retain
 * the stale `je_id` even after the JE row was deleted, and the kv.ts
 * read-back bridge would surface those stale links on next page reload.
 *
 * Top-level only — child arrays (items, payments, lines, bankLines) flow
 * straight through; their per-row undefined→null handling happens in the
 * route's value helpers (e.g. `saleValues`, `payValues`).
 */
export function nullifyUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) out[k] = obj[k] === undefined ? null : obj[k];
  return out as T;
}

export const salesApi = makeTxRecordApi<Sale>("sales", (s) => {
  const { items, ...sale } = s;
  return { sale: nullifyUndefined(sale), items: items ?? [] };
});

export const invoicesApi = makeTxRecordApi<Invoice>("invoices", (i) => {
  const { items, paymentHistory, ...invoice } = i;
  return { invoice: nullifyUndefined(invoice), items: items ?? [], payments: paymentHistory ?? [] };
});

export const purchaseOrdersApi = makeTxRecordApi<PurchaseOrder>("purchase-orders", (p) => {
  const { items, ...po } = p;
  return { po: nullifyUndefined(po), items: items ?? [] };
});

export const saleReturnsApi = makeTxRecordApi<SaleReturn>("sale-returns", (r) => {
  const { items, ...saleReturn } = r;
  return { saleReturn: nullifyUndefined(saleReturn), items: items ?? [] };
});

export const purchaseReturnsApi = makeTxRecordApi<PurchaseReturn>("purchase-returns", (r) => {
  const { items, ...purchaseReturn } = r;
  return { purchaseReturn: nullifyUndefined(purchaseReturn), items: items ?? [] };
});

export const rpVouchersApi = makeTxRecordApi<RPVoucher>("rp-vouchers", (v) => {
  const { lines, bankLines, ...voucher } = v;
  return { voucher: nullifyUndefined(voucher), lines: lines ?? [], bankLines: bankLines ?? [] };
});

// ─── Catalogue REST clients (Batch 5) ─────────────────────────────────────────
// Products carry jsonb `variants` and `productAttributes` directly on the row
// (no child tables), so the simple `makeRecordApi` factory is sufficient —
// no custom splitter needed.
export const productsApi           = makeRecordApi<Product>("products");

// ─── HRM REST clients (Batch 5+6) ─────────────────────────────────────────────
// Staff carry jsonb `allowances` / `deductions` on the row (no child tables).
export const staffApi              = makeRecordApi<Staff>("staff");
// Staff roles (Batch 6) — simple lookup table, permissions stored as
// comma-separated string column.
export const staffRolesApi         = makeRecordApi<StaffRole>("staff-roles");

// Salary cluster lookups (Batch 7). Templates carry jsonb allowances/deductions
// on the row; categories are flat scalar columns.
export const salaryTemplatesApi              = makeRecordApi<SalaryTemplate>("salary-templates");
export const salaryAllowanceCategoriesApi    = makeRecordApi<SalaryAllowanceCategory>("salary-allowance-categories");
export const salaryDeductionCategoriesApi    = makeRecordApi<SalaryDeductionCategory>("salary-deduction-categories");

// Salary slips + attendance (Batch 8). Slips have many nullable JE-cascade
// fields; the chokepoint in store.ts applies `nullifyUndefined` on the update
// payload so JE-delete reverse-cascade clears propagate to the relational row.
export const salarySlipsApi          = makeRecordApi<SalarySlip>("salary-slips");
export const attendanceRecordsApi    = makeRecordApi<AttendanceRecord>("attendance-records");

// ─── CRM REST clients (Batch 3) ───────────────────────────────────────────────
// `customersApi` is consumed by `useCustomers` (hook-side cutover) AND fired
// dual-write style from the legacy sync `createCustomer`/`updateCustomer`/
// `deleteCustomer` in `store.ts` so that internal callers (m10 walk-in seed,
// PO-receive supplier write-back, sale-JE write-back, m14 advance clear, COA
// contact heal, convertLeadToCustomer, ensureCustomerAdvanceLedger) all
// persist to the relational `customers` table. Without the legacy dual-write,
// any customer mutation issued outside the React hook would vanish on refresh
// (the kv.ts read-back bridge ignores `kv_store` once `admin-customers` is in
// the MIGRATED_KEY_TO_TABLE registry).
export const customersApi          = makeRecordApi<Customer>("customers");
