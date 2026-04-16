import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  getSession, saveSession, clearSession,
  hashPassword, normalizeEmail, getTenantIdFromUrl,
  type CustomerSession,
} from "@/lib/auth";
import {
  fetchCustomers, fetchSettings, fetchPortalAccounts, savePortalAccounts,
  type StoreSettings,
} from "@/lib/api";

interface AuthContextValue {
  session: CustomerSession | null;
  settings: StoreSettings;
  tenantId: string;
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]   = useState<CustomerSession | null>(null);
  const [settings, setSettings] = useState<StoreSettings>({});
  const [tenantId]              = useState<string>(() => getTenantIdFromUrl());
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    const s = getSession();
    if (s) {
      setSession(s);
      fetchSettings(s.tenantId).then(setSettings);
    }
  }, []);

  const clearError = useCallback(() => setError(""), []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!tenantId) { setError("Invalid portal link. Please use the link provided by your store."); return false; }
    setLoading(true);
    setError("");
    try {
      const [accounts, customers, s] = await Promise.all([
        fetchPortalAccounts(tenantId),
        fetchCustomers(tenantId),
        fetchSettings(tenantId),
      ]);
      const key = normalizeEmail(email);
      const hash = await hashPassword(password);
      const account = accounts.find(a => normalizeEmail(a.email) === key && a.passwordHash === hash);
      if (!account) {
        setError("Incorrect email or password.");
        return false;
      }
      // Use linked customer record if it exists, otherwise build a minimal stub
      const customer = customers.find(c => c.id === account.customerId) ?? {
        id: account.customerId,
        name: account.name || key.split("@")[0],
        email: account.email,
        company: "", phone: "", industry: "", city: "", area: undefined,
        status: "Active" as const, source: "direct", customerType: "Regular Customer",
        customerSince: account.createdAt.split("T")[0],
        totalValue: "0", currency: "GBP", notes: "", tags: [],
        createdAt: account.createdAt, updatedAt: account.createdAt,
      };
      saveSession(tenantId, customer);
      setSession({ tenantId, customer, loginAt: new Date().toISOString() });
      setSettings(s);
      return true;
    } catch (err) {
      console.error("[portal] login error:", err);
      setError("Something went wrong. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const signup = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!tenantId) { setError("Invalid portal link. Please use the link provided by your store."); return false; }
    setLoading(true);
    setError("");
    try {
      const [customers, accounts, s] = await Promise.all([
        fetchCustomers(tenantId),
        fetchPortalAccounts(tenantId),
        fetchSettings(tenantId),
      ]);
      const key = normalizeEmail(email);

      // Cannot sign up twice
      if (accounts.some(a => normalizeEmail(a.email) === key)) {
        setError("An account with this email already exists. Please sign in instead.");
        return false;
      }

      // Link to existing customer record if email matches, otherwise create a self-registered account
      const existingCustomer = customers.find(c => normalizeEmail(c.email) === key);
      const customerId = existingCustomer?.id ?? crypto.randomUUID();
      const displayName = existingCustomer?.name ?? key.split("@")[0];

      const hash = await hashPassword(password);
      const newAccount = {
        email: key,
        passwordHash: hash,
        customerId,
        name: displayName,
        createdAt: new Date().toISOString(),
      };
      await savePortalAccounts(tenantId, [...accounts, newAccount]);

      const customer = existingCustomer ?? {
        id: customerId,
        name: displayName,
        email: key,
        company: "", phone: "", industry: "", city: "", area: undefined,
        status: "Active" as const, source: "direct", customerType: "Regular Customer",
        customerSince: new Date().toISOString().split("T")[0],
        totalValue: "0", currency: "GBP", notes: "", tags: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };

      saveSession(tenantId, customer);
      setSession({ tenantId, customer, loginAt: new Date().toISOString() });
      setSettings(s);
      return true;
    } catch (err) {
      console.error("[portal] signup error:", err);
      setError("Something went wrong. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
    if (!tenantId || !session) return { ok: false, error: "Not logged in." };
    try {
      const accounts = await fetchPortalAccounts(tenantId);
      const email = normalizeEmail(session.customer.email);
      const currentHash = await hashPassword(currentPassword);
      const idx = accounts.findIndex(a => normalizeEmail(a.email) === email && a.passwordHash === currentHash);
      if (idx === -1) return { ok: false, error: "Current password is incorrect." };
      const newHash = await hashPassword(newPassword);
      const updated = accounts.map((a, i) => i === idx ? { ...a, passwordHash: newHash } : a);
      await savePortalAccounts(tenantId, updated);
      return { ok: true };
    } catch (err) {
      console.error("[portal] changePassword error:", err);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  }, [tenantId, session]);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setSettings({});
  }, []);

  return (
    <AuthContext.Provider value={{ session, settings, tenantId, loading, error, login, signup, logout, clearError, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
