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
  syncTenantsFromServer,
  getTenants,
  setActivityUser,
  seedDefaultCoaAccounts,
  Tenant,
} from "@/lib/store";
import { verifyTenantCredentials } from "@/lib/api";

// Core auth state (isAuthenticated, userId, tenantId) is stored in localStorage
// so it survives page refreshes and iframe reloads. The Replit preview pane is
// an iframe — sessionStorage is cleared on every iframe refresh there.
// Impersonation and tab-tenant-override remain in sessionStorage (tab-scoped by design).
const AUTH_KEY        = "onesoft-admin-auth";
const AUTH_USER_ID    = "onesoft-admin-user-id";
const TENANT_KEY      = "onesoft-tenant-id";
const IMPERSONATE_KEY = "onesoft-impersonate-from"; // stores manager's original userId — sessionStorage

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

    // Check for ?tenant=<id> URL param — used when opening a tenant in a new tab.
    const SESSION_TENANT_KEY = "onesoft_tab_tenant";
    const urlParams = new URLSearchParams(window.location.search);
    const tenantParam = urlParams.get("tenant");
    let resolvedTenantId: string | null;
    if (tenantParam) {
      // URL param takes priority — store per-tab, clean up the URL
      sessionStorage.setItem(SESSION_TENANT_KEY, tenantParam);
      resolvedTenantId = tenantParam;
      setActiveTenant(tenantParam);
      setCurrentTenantId(tenantParam);
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      // Check per-tab sessionStorage override first (survives F5 refresh of tab)
      const tabTenant = sessionStorage.getItem(SESSION_TENANT_KEY);
      if (tabTenant) {
        resolvedTenantId = tabTenant;
        setActiveTenant(tabTenant);
        setCurrentTenantId(tabTenant);
      } else {
        const tenantId = localStorage.getItem(TENANT_KEY);
        resolvedTenantId = tenantId === "" ? null : (tenantId ?? null);
      }
    }

    setIsSyncing(true);
    syncAllFromServer(resolvedTenantId).finally(() => {
      // Seed default COA + auto-link accounting settings on every login
      seedDefaultCoaAccounts();
      // After sync, re-read the user in case their record was updated in DB
      const refreshed = getAdminUserById(userId);
      if (refreshed) {
        setCurrentUser(refreshed);
        // Restore the activity-user name so actions taken after a page refresh
        // are attributed correctly (without this it always shows "by System").
        setActivityUser(refreshed.fullName || refreshed.username);
      }
      setIsSyncing(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (username: string, password: string): Promise<boolean> => {
    // SECURITY: clear any tab-scoped tenant override from a previous session
    // before authenticating. Without this, a refresh after a fresh login in
    // the same tab could re-apply the prior session's tenant context and
    // surface the wrong tenant's data.
    sessionStorage.removeItem("onesoft_tab_tenant");

    // ── Step 1: Server-side tenant credential check (primary path) ────────────
    // Ask the API server to verify credentials directly against the database.
    // This bypasses the entire KV-sync pipeline — no large fetches, no caches,
    // no race conditions.  If the server says yes, the tenant is logged in
    // immediately without any further credential lookup on the client.
    const serverCheck = await verifyTenantCredentials(username, password);
    if (serverCheck !== null) {
      if (serverCheck.ok) {
        // Server confirmed the credentials. Reconstruct a minimal Tenant object
        // from the server response so we can call the normal session setup path.
        const tenantFromServer = serverCheck.tenant as unknown as Tenant;
        if (tenantFromServer.status === "suspended") return false;

        setActiveTenant(tenantFromServer.id);
        setIsSyncing(true);
        try {
          await syncAllFromServer(tenantFromServer.id);
          seedDefaultCoaAccounts();
        } catch {
          // Swallow; COA seed retries on next sync.
        } finally {
          setIsSyncing(false);
        }

        const tenantUser = tenantToAdminUser(tenantFromServer);
        setActivityUser(tenantUser.fullName || tenantUser.username);
        localStorage.setItem(AUTH_KEY,     "true");
        localStorage.setItem(AUTH_USER_ID, `tenant:${tenantFromServer.id}`);
        localStorage.setItem(TENANT_KEY,   tenantFromServer.id);
        setCurrentUser(tenantUser);
        setCurrentTenantId(tenantFromServer.id);
        return true;
      }

      // Server explicitly said "not found" or "suspended".
      // Still continue so platform users (superadmin/staff/agent) can log in.
    }

    // ── Step 2: Sync global data for platform-user checks ─────────────────────
    // We only reach here when the server check failed the network request
    // (serverCheck === null) or the credentials didn't match a tenant.
    // Sync so platform users (superadmin, staff, agents) can be checked locally.
    setIsSyncing(true);
    try {
      await syncAllFromServer(null);
    } catch {
      // Swallow: fall back to in-memory cache.
    } finally {
      setIsSyncing(false);
    }

    // Targeted tenant-list refresh as an extra safety net.
    await syncTenantsFromServer();

    // Wrap ALL credential checks so no unexpected runtime error surfaces as
    // the scary "Sign in failed — please check your connection" message.
    try {
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

      // 2. Tenant registry — local fallback (server check above is primary)
      const tenant = getTenantByCredentials(username, password);
      if (tenant) {
        if (tenant.status === "suspended") return false;

        setActiveTenant(tenant.id);
        setIsSyncing(true);
        try {
          await syncAllFromServer(tenant.id);
          seedDefaultCoaAccounts();
        } catch {
          // Swallow: fall back to in-memory cache; COA seed may retry on next sync.
        } finally {
          setIsSyncing(false);
        }

        const tenantUser = tenantToAdminUser(tenant);
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
    } catch (credErr) {
      // An unexpected runtime error slipped through — log it and report as wrong
      // credentials rather than showing the misleading "check your connection" banner.
      console.error("[login] unexpected credential-check error:", credErr);
      return false;
    }
  };

  // ── Login As (manager impersonation) ───────────────────────────────────────
  const loginAs = async (
    tenantId: string,
    as: ImpersonateAs,
    memberId?: string
  ): Promise<boolean> => {
    const tenant = getTenantById(tenantId);
    if (!tenant || tenant.status === "suspended") return false;

    // Save manager's original user ID so we can restore (tab-scoped — sessionStorage is correct)
    const origUserId = localStorage.getItem(AUTH_USER_ID) ?? "";
    sessionStorage.setItem(IMPERSONATE_KEY, origUserId);

    // Set active tenant FIRST so seedDefaultCoaAccounts writes to the correct namespace.
    setActiveTenant(tenantId);

    // Sync tenant-specific data
    setIsSyncing(true);
    try {
      await syncAllFromServer(tenantId);
      seedDefaultCoaAccounts();
    } catch {
      // Swallow: fall back to in-memory cache.
    } finally {
      setIsSyncing(false);
    }

    if (as === "admin") {
      const tenantUser = tenantToAdminUser(tenant);
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
    sessionStorage.removeItem("onesoft_tab_tenant");
    sessionStorage.removeItem(IMPERSONATE_KEY);
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
    // Clear the per-tab sessionStorage override so the explicit switch takes over
    sessionStorage.removeItem("onesoft_tab_tenant");

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
