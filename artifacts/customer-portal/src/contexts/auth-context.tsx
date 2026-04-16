import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getSession, saveSession, clearSession, type CustomerSession } from "@/lib/auth";
import { fetchCustomers, fetchSettings, type Customer, type StoreSettings } from "@/lib/api";
import { normalizeEmail, normalizePhone } from "@/lib/auth";

interface AuthContextValue {
  session: CustomerSession | null;
  settings: StoreSettings;
  loading: boolean;
  error: string;
  login: (tenantId: string, email: string, phone: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [settings, setSettings] = useState<StoreSettings>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = getSession();
    if (s) {
      setSession(s);
      fetchSettings(s.tenantId).then(setSettings);
    }
  }, []);

  const login = useCallback(async (tenantId: string, email: string, phone: string): Promise<boolean> => {
    setLoading(true);
    setError("");
    try {
      const customers = await fetchCustomers(tenantId.trim());
      const match = customers.find(
        (c: Customer) =>
          normalizeEmail(c.email) === normalizeEmail(email) &&
          normalizePhone(c.phone) === normalizePhone(phone)
      );
      if (!match) {
        setError("No account found with those details. Please check your email and phone number.");
        return false;
      }
      saveSession(tenantId.trim(), match);
      setSession({ tenantId: tenantId.trim(), customer: match, loginAt: new Date().toISOString() });
      const s = await fetchSettings(tenantId.trim());
      setSettings(s);
      return true;
    } catch {
      setError("Something went wrong. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setSettings({});
  }, []);

  return (
    <AuthContext.Provider value={{ session, settings, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
