import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  getSession, saveSession, clearSession,
  hashPassword, normalizeEmail, getTenantIdFromUrl,
  type CustomerSession,
} from "@/lib/auth";
import {
  fetchSettings,
  portalLogin, portalSignup, portalChangePassword,
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
      const key = normalizeEmail(email);
      const hash = await hashPassword(password);
      const [result, s] = await Promise.all([
        portalLogin(tenantId, key, hash),
        fetchSettings(tenantId),
      ]);
      if (!result.ok || !result.customer) {
        setError(result.error || "Incorrect email or password.");
        return false;
      }
      saveSession(tenantId, result.customer);
      setSession({ tenantId, customer: result.customer, loginAt: new Date().toISOString() });
      setSettings(s);
      return true;
    } catch (err) {
      console.error("[portal] login error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Sign in failed: ${msg}`);
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
      const key = normalizeEmail(email);
      const hash = await hashPassword(password);
      const [result, s] = await Promise.all([
        portalSignup(tenantId, key, hash),
        fetchSettings(tenantId),
      ]);
      if (!result.ok || !result.customer) {
        setError(result.error || "Sign up failed.");
        return false;
      }
      saveSession(tenantId, result.customer);
      setSession({ tenantId, customer: result.customer, loginAt: new Date().toISOString() });
      setSettings(s);
      return true;
    } catch (err) {
      console.error("[portal] signup error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Sign up failed: ${msg}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
    if (!tenantId || !session) return { ok: false, error: "Not logged in." };
    try {
      const email = normalizeEmail(session.customer.email);
      const currentHash = await hashPassword(currentPassword);
      const newHash = await hashPassword(newPassword);
      return await portalChangePassword(tenantId, email, currentHash, newHash);
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
