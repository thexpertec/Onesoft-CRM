import { useState, useEffect } from "react";
import { Building2, Users, UserCog, ChevronRight, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth, ImpersonateAs } from "@/contexts/auth-context";
import {
  getTenants, getStaff, getSalesAgents,
  setActiveTenant,
  syncAllFromServer,
  type Tenant, type Staff, type SalesAgent,
} from "@/lib/store";

// ── Role tab config ─────────────────────────────────────────────────────────
const ROLES: { id: ImpersonateAs; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { id: "admin",       label: "Admin",       icon: ShieldCheck, color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"   },
  { id: "staff",       label: "Staff",       icon: UserCog,     color: "text-teal-600",   bg: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800"   },
  { id: "sales_agent", label: "Sales Agent", icon: Users,       color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function LoginAsDialog({ open, onClose }: Props) {
  const { loginAs, assignedTenants, isSyncing } = useAuth();

  const [tenants, setTenants]         = useState<Tenant[]>([]);
  const [selectedTenant, setSelected] = useState<Tenant | null>(null);
  const [selectedRole, setRole]       = useState<ImpersonateAs>("admin");
  const [memberId, setMemberId]       = useState<string>("");
  const [staffList, setStaffList]     = useState<Staff[]>([]);
  const [agentList, setAgentList]     = useState<SalesAgent[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // Load tenants on open
  useEffect(() => {
    if (!open) return;
    const all = getTenants().filter(t => t.status !== "suspended");
    const visible = assignedTenants.length > 0
      ? all.filter(t => assignedTenants.includes(t.id))
      : all;
    setTenants(visible);
    setSelected(null);
    setRole("admin");
    setMemberId("");
    setError("");
  }, [open, assignedTenants]);

  // Load staff/agents when tenant is selected
  useEffect(() => {
    if (!selectedTenant) return;
    const orig = setActiveTenantAndGet(selectedTenant.id);
    syncAllFromServer(selectedTenant.id).then(() => {
      const staff  = getStaff().filter(s => s.status !== "Terminated");
      const agents = getSalesAgents().filter(a => a.status === "Active");
      setStaffList(staff);
      setAgentList(agents);
      setMemberId("");
    });
    return orig;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenant?.id]);

  // Reset member selection when role changes
  useEffect(() => { setMemberId(""); }, [selectedRole]);

  const needsMember = selectedRole === "staff" || selectedRole === "sales_agent";
  const memberList  = selectedRole === "staff" ? staffList : agentList;
  const canConfirm  = !!selectedTenant && (!needsMember || !!memberId);

  const handleConfirm = async () => {
    if (!selectedTenant || !canConfirm) return;
    setLoading(true);
    setError("");
    const ok = await loginAs(selectedTenant.id, selectedRole, memberId || undefined);
    setLoading(false);
    if (ok) {
      onClose();
    } else {
      setError("Could not log in as that user. Please try a different selection.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Building2 size={16} className="text-indigo-500" />
            Login as Business
          </DialogTitle>
          <DialogDescription className="text-[12px] mt-0.5">
            Select a business and the role you want to enter as.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-5">

          {/* ── Step 1: Pick business ───────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              1. Select Business
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
              {tenants.length === 0 ? (
                <p className="text-[12px] text-muted-foreground px-2 py-3 text-center">No active businesses found.</p>
              ) : tenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelected(t); setError(""); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                    selectedTenant?.id === t.id
                      ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40"
                      : "border-border bg-card hover:border-indigo-200 hover:bg-gray-50 dark:hover:bg-muted"
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                    {t.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{t.adminUsername} · {t.plan}</p>
                  </div>
                  {selectedTenant?.id === t.id && (
                    <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-white fill-current">
                        <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Step 2: Pick role ───────────────────────────────────────── */}
          {selectedTenant && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                2. Select Role
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setRole(r.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${
                      selectedRole === r.id
                        ? r.bg + " border-current " + r.color
                        : "border-border bg-card hover:border-gray-300 text-muted-foreground"
                    }`}
                  >
                    <r.icon size={18} className={selectedRole === r.id ? r.color : ""} />
                    <span className="text-[11px] font-semibold">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Pick member (staff / agent) ─────────────────────── */}
          {selectedTenant && needsMember && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                3. Select {selectedRole === "staff" ? "Staff Member" : "Sales Agent"}
              </p>
              {memberList.length === 0 ? (
                <p className="text-[12px] text-muted-foreground px-2 py-2 text-center">
                  No {selectedRole === "staff" ? "staff members" : "sales agents"} found for this business.
                </p>
              ) : (
                <select
                  value={memberId}
                  onChange={e => setMemberId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">— Choose a member —</option>
                  {memberList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{(m as Staff).role ? ` · ${(m as Staff).role}` : (m as SalesAgent).agentCode ? ` · ${(m as SalesAgent).agentCode}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────────────── */}
          {error && (
            <p className="text-[12px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-border text-[13px] text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading || isSyncing}
            className="flex items-center gap-2 h-9 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading || isSyncing ? (
              <><Loader2 size={13} className="animate-spin" /> Logging in…</>
            ) : (
              <><ChevronRight size={14} /> Enter as {ROLES.find(r => r.id === selectedRole)?.label}</>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// helper: temporarily switch active tenant to load data, return cleanup fn
function setActiveTenantAndGet(tenantId: string): () => void {
  setActiveTenant(tenantId);
  return () => setActiveTenant(null);
}
