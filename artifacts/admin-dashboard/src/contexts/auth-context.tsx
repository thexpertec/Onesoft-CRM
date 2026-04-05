import { createContext, useContext, useState } from "react";
import {
  AdminUser,
  Tenant,
  getAdminUsers,
  getAdminUserById,
  getTenantByCredentials,
  getTenantById,
  tenantToAdminUser,
  setActiveTenant,
  getActiveTenantId,
} from "@/lib/store";

const AUTH_KEY     = "onesoft-admin-auth";
const AUTH_USER_ID = "onesoft-admin-user-id";
const TENANT_KEY   = "onesoft-tenant-id";

type AuthContextType = {
  isAuthenticated:  boolean;
  currentUser:      AdminUser | null;
  isSuperAdmin:     boolean;
  currentTenantId:  string | null;
  currentTenant:    Tenant | null;
  login:            (username: string, password: string) => boolean;
  logout:           () => void;
  refreshCurrentUser: () => void;
  switchTenant:     (tenantId: string | null) => void;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated:    false,
  currentUser:        null,
  isSuperAdmin:       false,
  currentTenantId:    null,
  currentTenant:      null,
  login:              () => false,
  logout:             () => {},
  refreshCurrentUser: () => {},
  switchTenant:       () => {},
});

/** Restore tenant namespace from sessionStorage on page load. */
function restoreActiveTenant(): string | null {
  try {
    const raw = sessionStorage.getItem(TENANT_KEY);
    if (raw === null) return null;
    const id = raw === "" ? null : raw;
    setActiveTenant(id);
    return id;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => {
    try {
      const isAuth = sessionStorage.getItem(AUTH_KEY) === "true";
      const userId  = sessionStorage.getItem(AUTH_USER_ID);
      if (!isAuth || !userId) return null;
      restoreActiveTenant();
      return getAdminUserById(userId) ?? null;
    } catch {
      return null;
    }
  });

  const [currentTenantId, setCurrentTenantId] = useState<string | null>(
    () => getActiveTenantId()
  );

  const isAuthenticated = currentUser !== null;
  const isSuperAdmin    = currentUser?.role === "superadmin";
  const currentTenant   = currentTenantId ? (getTenantById(currentTenantId) ?? null) : null;

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = (username: string, password: string): boolean => {
    // 1. Check platform users first (superadmin + any platform staff)
    const users  = getAdminUsers();
    const user   = users.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (user) {
      setActiveTenant(null);
      sessionStorage.setItem(AUTH_KEY,     "true");
      sessionStorage.setItem(AUTH_USER_ID, user.id);
      sessionStorage.setItem(TENANT_KEY,   "");
      setCurrentUser(user);
      setCurrentTenantId(null);
      return true;
    }

    // 2. Check tenant registry
    const tenant = getTenantByCredentials(username, password);
    if (tenant) {
      if (tenant.status === "suspended") return false;
      const tenantUser = tenantToAdminUser(tenant);
      setActiveTenant(tenant.id);
      sessionStorage.setItem(AUTH_KEY,     "true");
      sessionStorage.setItem(AUTH_USER_ID, `tenant:${tenant.id}`);
      sessionStorage.setItem(TENANT_KEY,   tenant.id);
      setCurrentUser(tenantUser);
      setCurrentTenantId(tenant.id);
      return true;
    }

    return false;
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = () => {
    setActiveTenant(null);
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_USER_ID);
    sessionStorage.removeItem(TENANT_KEY);
    setCurrentUser(null);
    setCurrentTenantId(null);
  };

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refreshCurrentUser = () => {
    const userId = sessionStorage.getItem(AUTH_USER_ID);
    if (userId) setCurrentUser(getAdminUserById(userId) ?? null);
  };

  // ── Switch tenant (superadmin only) ────────────────────────────────────────
  const switchTenant = (tenantId: string | null) => {
    setActiveTenant(tenantId);
    setCurrentTenantId(tenantId);
    // Don't change the user — superadmin stays logged in as superadmin
    // but store the view context in session so refresh restores it
    sessionStorage.setItem(TENANT_KEY, tenantId ?? "");
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated, currentUser, isSuperAdmin,
      currentTenantId, currentTenant,
      login, logout, refreshCurrentUser, switchTenant,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
