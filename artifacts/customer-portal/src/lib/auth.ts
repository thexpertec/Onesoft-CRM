import type { Customer } from "./api";

const SESSION_KEY = "cp_session";

export interface CustomerSession {
  tenantId: string;
  customer: Customer;
  loginAt: string;
}

export interface PortalAccount {
  email: string;
  passwordHash: string;
  customerId: string;  // linked admin customer id, or a generated uuid for self-registered accounts
  name: string;        // display name (from customer record or derived from email)
  createdAt: string;
}

export function getSession(): CustomerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomerSession;
  } catch {
    return null;
  }
}

export function saveSession(tenantId: string, customer: Customer): void {
  try {
    const session: CustomerSession = { tenantId, customer, loginAt: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be restricted in some browsers/privacy modes; session continues in memory
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export function getTenantIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("t") || params.get("tenant") || "";
}
