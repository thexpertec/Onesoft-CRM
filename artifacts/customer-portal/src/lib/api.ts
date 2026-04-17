import type { PortalAccount } from "./auth";

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
  await fetch(`${apiRoot()}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
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
  productId: string;
  productName: string;
  sku: string;
  qty: string;
  price: string;
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

export async function fetchCustomers(tenantId: string): Promise<Customer[]> {
  const data = await kvGet<Customer[]>(`t:${tenantId}`, "admin-customers");
  return data ?? [];
}

export async function fetchSales(tenantId: string): Promise<Sale[]> {
  const data = await kvGet<Sale[]>(`t:${tenantId}`, "admin-sales");
  return data ?? [];
}

export async function fetchSettings(tenantId: string): Promise<StoreSettings> {
  const data = await kvGet<StoreSettings>(`t:${tenantId}`, "admin-settings");
  return data ?? {};
}

export async function fetchPortalAccounts(tenantId: string): Promise<PortalAccount[]> {
  const data = await kvGet<PortalAccount[]>(`t:${tenantId}`, "portal-accounts");
  return data ?? [];
}

export async function savePortalAccounts(tenantId: string, accounts: PortalAccount[]): Promise<void> {
  await kvPut(`t:${tenantId}`, "portal-accounts", accounts);
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
  return data ?? { cardId: generateCardId(), coins: 0, transactions: [] };
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
  const price = parseFloat(item.price) || 0;
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
