import { createContext, useContext, useState, useEffect } from "react";
import {
  AdminUser,
  getAdminUsers,
  getAdminUserById,
  getTenantByCredentials,
  getTenantById,
  tenantToAdminUser,
  getStaffByCredentials,
  getStaff,
  getStaffRoles,
  staffToAdminUser,
  getAgentByCredentials,
  agentToAdminUser,
  getSalesAgents,
  setActiveTenant,
  getActiveTenantId,
  syncAllFromServer,
  setActivityUser,
  seedDefaultCoaAccounts,
} from "@/lib/store";

const AUTH_KEY     = "onesoft-admin-auth";
const AUTH_USER_ID = "onesoft-admin-user-id";
const TENANT_KEY   = "onesoft-tenant-id";

type AuthContextType = {
  isAuthenticated:   boolean;
  currentUser:       AdminUser | null;
  isSuperAdmin:      boolean;
  isStaff:           boolean;
  isSalesAgent:      boolean;
  currentAgentId:    string | null;  // the raw SalesAgent.id when logged in as agent
  staffPermissions:  Set<string>; // HRM role permissions for staff/agent users
  currentTenantId:   string | null;
  currentTenant:     Tenant | null;
  isSyncing:         boolean;
  login:             (username: string, password: string) => Promise<boolean>;
  logout:            () => void;
  refreshCurrentUser: () => void;
  switchTenant:      (tenantId: string | null) => void;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated:    false,
  currentUser:        null,
  isSuperAdmin:       false,
  isStaff:            false,
  isSalesAgent:       false,
  currentAgentId:     null,
  staffPermissions:   new Set(),
  currentTenantId:    null,
  currentTenant:      null,
  isSyncing:          false,
  login:              async () => false,
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

  // True while we're fetching latest data from the database after login/refresh
  const [isSyncing, setIsSyncing] = useState(false);

  const isAuthenticated = currentUser !== null;
  const isSuperAdmin    = currentUser?.role === "superadmin";
  const isStaff         = currentUser?.role === "staff";
  const isSalesAgent    = currentUser?.role === "sales_agent";
  const currentTenant   = currentTenantId ? (getTenantById(currentTenantId) ?? null) : null;

  /** Raw SalesAgent.id when a sales agent is logged in, null otherwise. */
  const currentAgentId: string | null = (() => {
    if (!isSalesAgent || !currentUser) return null;
    const userId = sessionStorage.getItem(AUTH_USER_ID);
    if (userId?.startsWith("agent:")) return userId.slice(6);
    return null;
  })();

  /** Permissions set for the currently logged-in staff member or sales agent (empty for admins). */
  const staffPermissions = (() => {
    if (isSalesAgent) {
      // Sales agents always have a fixed set of permissions
      return new Set<string>([
        "View Leads", "Manage Leads",
        "View Customers",
        "View Sales", "Manage Sales",
        "View Dashboard",
      ]);
    }
    if (!isStaff || !currentUser) return new Set<string>();
    const staffMember = getStaff().find(s => s.id === currentUser.id);
    if (!staffMember) return new Set<string>();
    const roles = getStaffRoles();
    const hrmRole = roles.find(r => r.name === staffMember.role);
    if (!hrmRole) return new Set<string>();
    return new Set(
      hrmRole.permissions.split(",").map(p => p.trim()).filter(Boolean)
    );
  })();

  // ── On app load: if already authenticated, sync from DB ────────────────────
  useEffect(() => {
    const isAuth = sessionStorage.getItem(AUTH_KEY) === "true";
    const userId  = sessionStorage.getItem(AUTH_USER_ID);
    if (!isAuth || !userId) return;

    const tenantId = sessionStorage.getItem(TENANT_KEY);
    const resolvedTenantId = tenantId === "" ? null : (tenantId ?? null);

    setIsSyncing(true);
    syncAllFromServer(resolvedTenantId).finally(() => {
      // Seed default COA + auto-link accounting settings on every login
      seedDefaultCoaAccounts();
      // After sync, re-read the user in case their record was updated in DB
      const refreshed = getAdminUserById(userId);
      if (refreshed) setCurrentUser(refreshed);
      setIsSyncing(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (username: string, password: string): Promise<boolean> => {
    // First sync global data from the DB so we have the latest users/tenants
    setIsSyncing(true);
    try {
      await syncAllFromServer(null);
    } finally {
      setIsSyncing(false);
    }

    // 1. Check platform users first (superadmin + any platform staff)
    const users  = getAdminUsers();
    const user   = users.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (user) {
      setActiveTenant(null);
      setActivityUser(user.fullName || user.username);
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

      // Sync tenant-specific data from DB
      setIsSyncing(true);
      try {
        await syncAllFromServer(tenant.id);
        seedDefaultCoaAccounts();
      } finally {
        setIsSyncing(false);
      }

      const tenantUser = tenantToAdminUser(tenant);
      setActiveTenant(tenant.id);
      setActivityUser(tenantUser.fullName || tenantUser.username);
      sessionStorage.setItem(AUTH_KEY,     "true");
      sessionStorage.setItem(AUTH_USER_ID, `tenant:${tenant.id}`);
      sessionStorage.setItem(TENANT_KEY,   tenant.id);
      setCurrentUser(tenantUser);
      setCurrentTenantId(tenant.id);
      return true;
    }

    // 3. Check HRM staff with login enabled
    const staffMember = getStaffByCredentials(username, password);
    if (staffMember) {
      if (staffMember.status === "Terminated") return false;
      const staffUser = staffToAdminUser(staffMember);
      setActiveTenant(null);
      setActivityUser(staffUser.fullName || staffUser.username);
      sessionStorage.setItem(AUTH_KEY,     "true");
      sessionStorage.setItem(AUTH_USER_ID, `staff:${staffMember.id}`);
      sessionStorage.setItem(TENANT_KEY,   "");
      setCurrentUser(staffUser);
      setCurrentTenantId(null);
      return true;
    }

    // 4. Check Sales Agents with portal login enabled
    const agent = getAgentByCredentials(username, password);
    if (agent) {
      const agentUser = agentToAdminUser(agent);
      setActiveTenant(null);
      setActivityUser(agentUser.fullName || agentUser.username);
      sessionStorage.setItem(AUTH_KEY,     "true");
      sessionStorage.setItem(AUTH_USER_ID, `agent:${agent.id}`);
      sessionStorage.setItem(TENANT_KEY,   "");
      setCurrentUser(agentUser);
      setCurrentTenantId(null);
      return true;
    }

    return false;
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = () => {
    setActiveTenant(null);
    setActivityUser("System");
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
    sessionStorage.setItem(TENANT_KEY, tenantId ?? "");

    // Sync that tenant's data from DB
    if (tenantId) {
      setIsSyncing(true);
      syncAllFromServer(tenantId).finally(() => {
        seedDefaultCoaAccounts();
        setIsSyncing(false);
      });
    }
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated, currentUser, isSuperAdmin,
      isStaff, isSalesAgent, currentAgentId, staffPermissions,
      currentTenantId, currentTenant,
      isSyncing,
      login, logout, refreshCurrentUser, switchTenant,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
