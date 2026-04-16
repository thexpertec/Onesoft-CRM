import type { Customer } from "./api";

const SESSION_KEY = "cp_session";

export interface CustomerSession {
  tenantId: string;
  customer: Customer;
  loginAt: string;
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
  const session: CustomerSession = { tenantId, customer, loginAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function normalizePhone(p: string): string {
  return p.replace(/[\s\-().+]/g, "").toLowerCase();
}

export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}
