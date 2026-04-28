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
  Tenant,
} from "@/lib/store";

const AUTH_KEY        = "onesoft-admin-auth";
const AUTH_USER_ID    = "onesoft-admin-user-id";
const TENANT_KEY      = "onesoft-tenant-id";
const IMPERSONATE_KEY = "onesoft-impersonate-from"; // stores manager's original userId

export type ImpersonateAs = "admin" | "staff" | "sales_agent";

type AuthContextType = {
  isAuthenticated:   boolean;
  currentUser:       AdminUser | null;
  isSuperAdmin:      boolean;
  isManager:         boolean;         // multi-tenant manager role
  assignedTenants:   string[];        // tenant IDs assigned to the manager
  isStaff:           boolean;
  isSalesAgent:      boolean;
  currentAgentId:    string | null;  // the raw SalesAgent.id when logged in as agent
  staffPermissions:  Set<string>; // HRM role permissions for staff/agent users
  currentTenantId:   string | null;
  currentTenant:     Tenant | null;
  isSyncing:         boolean;
  isImpersonating:   boolean;          // manager is currently logged-in as a business
  /** Check if the current user has a specific permission (e.g. "Add Leads", "Edit Products"). Superadmin/tenant-admin always return true. */
  can:               (permission: string) => boolean;
  login:             (username: string, password: string) => Promise<boolean>;
  loginAs:           (tenantId: string, as: ImpersonateAs, memberId?: string) => Promise<boolean>;
  exitImpersonation: () => void;
  logout:            () => void;
  refreshCurrentUser: () => void;
  switchTenant:      (tenantId: string | null) => void;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated:    false,
  currentUser:        null,
  isSuperAdmin:       false,
  isManager:          false,
  assignedTenants:    [],
  isStaff:            false,
  isSalesAgent:       false,
  currentAgentId:     null,
  staffPermissions:   new Set(),
  currentTenantId:    null,
  currentTenant:      null,
  isSyncing:          false,
  isImpersonating:    false,
  can:                () => false,
  login:              async () => false,
  loginAs:            async () => false,
  exitImpersonation:  () => {},
  logout:             () => {},
  refreshCurrentUser: () => {},
  switchTenant:       () => {},
});

/** Restore tenant namespace from localStorage on page load. */
function restoreActiveTenant(): string | null {
  try {
    const raw = localStorage.getItem(TENANT_KEY);
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
      const isAuth = localStorage.getItem(AUTH_KEY) === "true";
      const userId  = localStorage.getItem(AUTH_USER_ID);
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

  // True while manager is impersonating a business user
  const [isImpersonating, setIsImpersonating] = useState<boolean>(
    () => sessionStorage.getItem(IMPERSONATE_KEY) !== null
  );

  const isAuthenticated  = currentUser !== null;
  const isSuperAdmin     = currentUser?.role === "superadmin";
  const isManager        = currentUser?.role === "manager";
  const assignedTenants  = currentUser?.assignedTenants ?? [];
  const isStaff          = currentUser?.role === "staff";
  const isSalesAgent     = currentUser?.role === "sales_agent";
  const currentTenant    = currentTenantId ? (getTenantById(currentTenantId) ?? null) : null;

  /** Raw SalesAgent.id when a sales agent is logged in, null otherwise. */
  const currentAgentId: string | null = (() => {
    if (!isSalesAgent || !currentUser) return null;
    const userId = localStorage.getItem(AUTH_USER_ID);
    if (userId?.startsWith("agent:")) return userId.slice(6);
    return null;
  })();

  /** Permissions set for the currently logged-in staff member or sales agent (empty for admins). */
  const staffPermissions = (() => {
    if (isSalesAgent) {
      // Sales agents always have a fixed set of permissions
      return new Set<string>([
        "View Dashboard",
        "View Leads", "Add Leads", "Edit Leads",
        "View Customers", "Add Customers", "Edit Customers",
        "View Sales", "Add Sales",
        "View Invoices",
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

  /**
   * Check if the current user has a specific permission string.
   * - Superadmin / tenant-admin → always true.
   * - Staff / sales agent     → checks staffPermissions; also accepts legacy "Manage X" in place of Add/Edit/Delete X.
   * - Unauthenticated          → false.
   */
  const can = (permission: string): boolean => {
    if (!isAuthenticated) return false;
    // Superadmin, managers (no tenant context) and tenant admins have full access
    if (!isStaff && !isSalesAgent) return true;
    // Exact match
    if (staffPermissions.has(permission)) return true;
    // Legacy backward-compat: "Manage X" satisfies Add/Edit/Delete X
    const writeActions = ["Add ", "Edit ", "Delete "];
    for (const prefix of writeActions) {
      if (permission.startsWith(prefix)) {
        const resource = permission.slice(prefix.length);
        if (staffPermissions.has(`Manage ${resource}`)) return true;
      }
    }
    return false;
  };

  // ── On app load: if already authenticated, sync from DB ────────────────────
  useEffect(() => {
    const isAuth = localStorage.getItem(AUTH_KEY) === "true";
    const userId  = localStorage.getItem(AUTH_USER_ID);
    if (!isAuth || !userId) return;

    const tenantId = localStorage.getItem(TENANT_KEY);
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
      localStorage.setItem(AUTH_KEY,     "true");
      localStorage.setItem(AUTH_USER_ID, user.id);
      localStorage.setItem(TENANT_KEY,   "");
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
      localStorage.setItem(AUTH_KEY,     "true");
      localStorage.setItem(AUTH_USER_ID, `tenant:${tenant.id}`);
      localStorage.setItem(TENANT_KEY,   tenant.id);
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
      localStorage.setItem(AUTH_KEY,     "true");
      localStorage.setItem(AUTH_USER_ID, `staff:${staffMember.id}`);
      localStorage.setItem(TENANT_KEY,   "");
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
      localStorage.setItem(AUTH_KEY,     "true");
      localStorage.setItem(AUTH_USER_ID, `agent:${agent.id}`);
      localStorage.setItem(TENANT_KEY,   "");
      setCurrentUser(agentUser);
      setCurrentTenantId(null);
      return true;
    }

    return false;
  };

  // ── Login As (manager impersonation) ───────────────────────────────────────
  const loginAs = async (
    tenantId: string,
    as: ImpersonateAs,
    memberId?: string
  ): Promise<boolean> => {
    const tenant = getTenantById(tenantId);
    if (!tenant || tenant.status === "suspended") return false;

    // Save manager's original user ID so we can restore
    const origUserId = localStorage.getItem(AUTH_USER_ID) ?? "";
    sessionStorage.setItem(IMPERSONATE_KEY, origUserId);

    // Sync tenant-specific data
    setIsSyncing(true);
    try {
      await syncAllFromServer(tenantId);
      seedDefaultCoaAccounts();
    } finally {
      setIsSyncing(false);
    }

    if (as === "admin") {
      const tenantUser = tenantToAdminUser(tenant);
      setActiveTenant(tenantId);
      setActivityUser(tenantUser.fullName || tenantUser.username);
      localStorage.setItem(AUTH_USER_ID, `tenant:${tenantId}`);
      localStorage.setItem(TENANT_KEY, tenantId);
      setCurrentUser(tenantUser);
      setCurrentTenantId(tenantId);
      setIsImpersonating(true);
      return true;
    }

    if (as === "staff" && memberId) {
      const staffMember = getStaff().find(s => s.id === memberId);
      if (!staffMember) return false;
      const staffUser = staffToAdminUser(staffMember);
      setActiveTenant(tenantId);
      setActivityUser(staffUser.fullName || staffUser.username);
      localStorage.setItem(AUTH_USER_ID, `staff:${memberId}`);
      localStorage.setItem(TENANT_KEY, tenantId);
      setCurrentUser(staffUser);
      setCurrentTenantId(tenantId);
      setIsImpersonating(true);
      return true;
    }

    if (as === "sales_agent" && memberId) {
      const agent = getSalesAgents().find(a => a.id === memberId);
      if (!agent) return false;
      const agentUser = agentToAdminUser(agent);
      setActiveTenant(tenantId);
      setActivityUser(agentUser.fullName || agentUser.username);
      localStorage.setItem(AUTH_USER_ID, `agent:${memberId}`);
      localStorage.setItem(TENANT_KEY, tenantId);
      setCurrentUser(agentUser);
      setCurrentTenantId(tenantId);
      setIsImpersonating(true);
      return true;
    }

    // Cleanup if something went wrong
    sessionStorage.removeItem(IMPERSONATE_KEY);
    return false;
  };

  // ── Exit Impersonation ─────────────────────────────────────────────────────
  const exitImpersonation = () => {
    const origUserId = sessionStorage.getItem(IMPERSONATE_KEY);
    if (!origUserId) return;

    sessionStorage.removeItem(IMPERSONATE_KEY);
    setActiveTenant(null);
    localStorage.setItem(AUTH_USER_ID, origUserId);
    localStorage.setItem(TENANT_KEY, "");

    const managerUser = getAdminUserById(origUserId);
    setActivityUser(managerUser?.fullName || managerUser?.username || "Manager");
    setCurrentUser(managerUser ?? null);
    setCurrentTenantId(null);
    setIsImpersonating(false);
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = () => {
    setActiveTenant(null);
    setActivityUser("System");
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_USER_ID);
    localStorage.removeItem(TENANT_KEY);
    setCurrentUser(null);
    setCurrentTenantId(null);
  };

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refreshCurrentUser = () => {
    const userId = localStorage.getItem(AUTH_USER_ID);
    if (userId) setCurrentUser(getAdminUserById(userId) ?? null);
  };

  // ── Switch tenant (superadmin only) ────────────────────────────────────────
  const switchTenant = (tenantId: string | null) => {
    setActiveTenant(tenantId);
    setCurrentTenantId(tenantId);
    localStorage.setItem(TENANT_KEY, tenantId ?? "");

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
      isManager, assignedTenants,
      isStaff, isSalesAgent, currentAgentId, staffPermissions,
      currentTenantId, currentTenant,
      isSyncing, isImpersonating, can,
      login, loginAs, exitImpersonation,
      logout, refreshCurrentUser, switchTenant,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
