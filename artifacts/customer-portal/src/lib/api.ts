const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiRoot(): string {
  const { protocol, host } = window.location;
  const prefix = BASE.replace(/\/customer-portal.*/, "");
  return `${protocol}//${host}${prefix}/api`;
}

async function kvGet<T>(ns: string, key: string): Promise<T | null> {
  try {
    const r = await fetch(`${apiRoot()}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.value as T;
  } catch {
    return null;
  }
}

async function kvPut(ns: string, key: string, value: unknown): Promise<void> {
  const r = await fetch(`${apiRoot()}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`);
}

export type CustomerStatus = "Active" | "Inactive" | "Churned";

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  city: string;
  area?: string;
  status: CustomerStatus;
  source: string;
  customerType?: string;
  customerSince: string;
  totalValue: string;
  currency: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  id: string;
  productId?: string;
  productName: string;
  sku: string;
  qty: string;
  price?: string;       // legacy field (portal-created)
  unitPrice?: string;   // admin/online-order field
  discount: string;
  discountType: "pct" | "amt";
  unit: string;
}

export interface Sale {
  id: string;
  saleNumber: string;
  saleDate: string;
  customer: string;
  status: string;
  paymentMethod: string;
  notes: string;
  items: SaleItem[];
  taxRate: string;
  amountPaid: string;
  paidAt: string;
  deliveryStatus?: string;
  deliveryCharges?: string;
  invoiceDiscount?: string;
  invoiceDiscountType?: "pct" | "amt";
  orderType?: string;
  onlineCustomer?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettings {
  storeName?: string;
  currency?: string;
  currencySymbol?: string;
  decimalPlaces?: string;
}

export async function fetchSettings(tenantId: string): Promise<StoreSettings> {
  const data = await kvGet<StoreSettings>(`t:${tenantId}`, "admin-settings");
  return data ?? {};
}

/**
 * Portal-scoped server endpoints (no admin API key needed). These replace
 * the previous anonymous reads of `admin-customers` / `admin-sales` via
 * `/api/kv/*` — each call returns only the requesting customer's data
 * instead of the whole tenant dataset.
 */
export interface PortalLoginResult {
  ok: boolean;
  customer?: Customer;
  error?: string;
}

export async function portalLogin(
  tenantId: string, email: string, passwordHash: string,
): Promise<PortalLoginResult> {
  try {
    const r = await fetch(`${apiRoot()}/portal/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, email, passwordHash }),
    });
    const json = await r.json();
    return r.ok ? { ok: true, customer: json.customer as Customer }
                : { ok: false, error: json.error || "Sign in failed." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function portalSignup(
  tenantId: string, email: string, passwordHash: string,
): Promise<PortalLoginResult> {
  try {
    const r = await fetch(`${apiRoot()}/portal/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, email, passwordHash }),
    });
    const json = await r.json();
    return r.ok ? { ok: true, customer: json.customer as Customer }
                : { ok: false, error: json.error || "Sign up failed." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function portalChangePassword(
  tenantId: string, email: string, currentHash: string, newHash: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${apiRoot()}/portal/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, email, currentHash, newHash }),
    });
    const json = await r.json();
    return r.ok ? { ok: true } : { ok: false, error: json.error || "Update failed." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Server-side filter: returns only this customer's sales. */
export async function portalSales(tenantId: string, customerName: string): Promise<Sale[]> {
  try {
    const r = await fetch(
      `${apiRoot()}/portal/sales?tenantId=${encodeURIComponent(tenantId)}&customerName=${encodeURIComponent(customerName)}`,
    );
    if (!r.ok) return [];
    const json = await r.json();
    return Array.isArray(json.items) ? (json.items as Sale[]) : [];
  } catch {
    return [];
  }
}

export interface ClubCardTransaction {
  id: string;
  type: "credit" | "debit";
  coins: number;
  description: string;
  date: string;
}

export interface ClubCard {
  cardId?: string;
  coins: number;
  transactions: ClubCardTransaction[];
}

/** Generate a unique Clubcard ID: CC + 4 uppercase chars + 4 digits. e.g. CCAB3D-7821 */
export function generateCardId(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const part1 = Array.from({ length: 4 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
  const part2 = String(Math.floor(Math.random() * 9000) + 1000);
  return `CC${part1}-${part2}`;
}

export async function fetchClubcard(tenantId: string, customerId: string): Promise<ClubCard> {
  const data = await kvGet<ClubCard>(`t:${tenantId}`, `clubcard-${customerId}`);
  if (!data || Array.isArray(data) || typeof data !== "object") {
    return { cardId: generateCardId(), coins: 0, transactions: [] };
  }
  return {
    cardId: data.cardId || generateCardId(),
    coins: typeof data.coins === "number" ? data.coins : 0,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
  };
}

export async function saveClubcard(tenantId: string, customerId: string, card: ClubCard): Promise<void> {
  await kvPut(`t:${tenantId}`, `clubcard-${customerId}`, card);
}

export interface PortalProfile {
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export async function fetchPortalProfile(tenantId: string, customerId: string): Promise<PortalProfile> {
  const data = await kvGet<PortalProfile>(`t:${tenantId}`, `portal-profile-${customerId}`);
  return data ?? {};
}

export async function savePortalProfile(tenantId: string, customerId: string, profile: PortalProfile): Promise<void> {
  await kvPut(`t:${tenantId}`, `portal-profile-${customerId}`, profile);
}

export function calcLineTotal(item: SaleItem): number {
  const price = parseFloat(item.unitPrice ?? item.price ?? "0") || 0;
  const qty = parseFloat(item.qty) || 0;
  const disc = parseFloat(item.discount) || 0;
  const gross = price * qty;
  if (disc <= 0) return gross;
  if (item.discountType === "pct") return gross * (1 - disc / 100);
  return Math.max(0, gross - disc * qty);
}

export function calcSaleTotal(
  items: SaleItem[],
  taxRate: string,
  deliveryCharges?: string,
  invoiceDiscount?: string,
  invoiceDiscountType?: string
): number {
  const sub = items.reduce((s, i) => s + calcLineTotal(i), 0);
  const tax = parseFloat(taxRate) || 0;
  const delivery = parseFloat(deliveryCharges ?? "0") || 0;
  const invDisc = parseFloat(invoiceDiscount ?? "0") || 0;
  let afterInvDisc = sub;
  if (invDisc > 0) {
    afterInvDisc =
      invoiceDiscountType === "pct"
        ? sub * (1 - invDisc / 100)
        : Math.max(0, sub - invDisc);
  }
  return afterInvDisc * (1 + tax / 100) + delivery;
}
