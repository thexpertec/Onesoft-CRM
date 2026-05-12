import { useState, useMemo, useEffect } from "react";
import {
  Building2, Plus, Pencil, Trash2, LogIn, Users, ShoppingCart,
  Package, BarChart3, AlertTriangle, Check, X, Eye, EyeOff,
  Crown, Zap, Rocket, Shield, Search, Layers, FlaskConical, RefreshCw,
  History, PlusCircle, MinusCircle, ChevronDown, ChevronUp, Eraser, Download,
} from "lucide-react";
import {
  seedDemoTenant, clearDemoTenant, isDemoSeeded, DEMO_TENANT_ID,
  seedDataIntoTenant, clearTenantData, isTenantDataSeeded,
} from "@/lib/demo-seed";
import {
  Tenant, TenantStatus, TenantPlan,
  getTenants, getTenantActivities, TenantActivityEntry,
  createTenantAsync, updateTenantAsync, deleteTenantAsync,
  cleanTenantTransactions, cleanTenantMasterData, checkTenantTransactionBlocks,
  exportTenantBackup,
  getTenantStats, seedTenantCOA, getChartOfAccountsForTenant,
  ModuleGroup, getModuleGroups, getModuleGroupById,
  MODULE_DEFINITIONS,
  syncAllFromServer,
  seedDirectorForTenant,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { ConfirmPasswordDialog } from "@/components/confirm-password-dialog";

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAN_META: Record<TenantPlan, { label: string; color: string; icon: React.ElementType }> = {
  starter:      { label: "Starter",      color: "text-gray-500  bg-gray-100  dark:bg-gray-800",      icon: Zap     },
  professional: { label: "Professional", color: "text-blue-600  bg-blue-50   dark:bg-blue-950/40",   icon: Rocket  },
  enterprise:   { label: "Enterprise",   color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40", icon: Crown   },
};

const STATUS_META: Record<TenantStatus, { label: string; color: string; dot: string }> = {
  active:    { label: "Active",    color: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500" },
  trial:     { label: "Trial",     color: "text-amber-700   bg-amber-50   dark:bg-amber-950/40   border-amber-200   dark:border-amber-800",   dot: "bg-amber-500"   },
  suspended: { label: "Suspended", color: "text-red-700     bg-red-50     dark:bg-red-950/40     border-red-200     dark:border-red-800",     dot: "bg-red-500"     },
};

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Blank form ───────────────────────────────────────────────────────────────
const RESET_INTERVALS = [
  { value: 0,    label: "Never"      },
  { value: 15,   label: "15 minutes" },
  { value: 30,   label: "30 minutes" },
  { value: 60,   label: "1 hour"     },
  { value: 120,  label: "2 hours"    },
  { value: 240,  label: "4 hours"    },
  { value: 480,  label: "8 hours"    },
  { value: 1440, label: "24 hours"   },
];

function nextResetLabel(lastReset: string | undefined, intervalMins: number | undefined): string {
  if (!intervalMins) return "";
  const lastMs = lastReset ? new Date(lastReset).getTime() : 0;
  const remaining = lastMs + intervalMins * 60_000 - Date.now();
  if (remaining <= 0) return "Resetting soon…";
  const mins  = Math.floor(remaining / 60_000);
  const hours = Math.floor(mins / 60);
  const m     = mins % 60;
  return hours > 0 ? `Resets in ${hours}h ${m}m` : `Resets in ${m}m`;
}

const blankForm = (): Omit<Tenant, "id" | "createdAt" | "updatedAt"> => ({
  name:               "",
  slug:               "",
  adminUsername:      "",
  adminPassword:      "",
  contactEmail:       "",
  status:             "trial",
  plan:               "starter",
  moduleGroupId:      undefined,
  isDemo:             false,
  demoResetInterval:  0,
});

// ─── Tenant form modal ────────────────────────────────────────────────────────
function TenantModal({
  open,
  editing,
  onClose,
  onSave,
}: {
  open:    boolean;
  editing: Tenant | null;
  onClose: () => void;
  onSave:  (data: Omit<Tenant, "id" | "createdAt" | "updatedAt">) => Promise<void> | void;
}) {
  const [form,       setForm]       = useState(() => editing ? { ...editing } : blankForm());
  const [showPwd,    setShowPwd]    = useState(false);
  const [slugLocked, setSlugLocked] = useState(!!editing);
  const [saving,     setSaving]     = useState(false);
  const [moduleGroups, setModuleGroups] = useState<ModuleGroup[]>(() => getModuleGroups());

  // Reset form when modal opens or editing target changes
  useEffect(() => {
    if (open) {
      setForm(editing ? { ...editing } : blankForm());
      setSlugLocked(!!editing);
      setShowPwd(false);
      setModuleGroups(getModuleGroups());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "name" && !slugLocked) next.slug = slugify(v as string);
      return next;
    });
  }

  const canSave =
    form.name.trim() &&
    form.slug.trim() &&
    form.adminUsername.trim() &&
    (editing ? true : form.adminPassword.trim()); // password required only on create

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">

        {/* ── Modal Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-7 py-5 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/60">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
            <Building2 size={17} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none">
              {editing ? "Edit Tenant" : "Add New Tenant"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {editing ? "Update tenant details and credentials" : "Set up a new isolated client organisation"}
            </p>
          </div>
        </div>

        {/* ── Two-column body ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-zinc-800">

          {/* ── LEFT: General Info ─────────────────────────────────────────── */}
          <div className="px-7 py-6 space-y-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
              Organisation Details
            </p>

            {/* Company Name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Company Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={e => patch("name", e.target.value)}
                placeholder="Acme Corp"
                className="h-10 text-sm"
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Slug <span className="text-red-500">*</span>
                <span className="ml-1.5 text-xs text-muted-foreground font-normal">— unique identifier</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={form.slug}
                  onChange={e => { setSlugLocked(true); patch("slug", slugify(e.target.value)); }}
                  placeholder="acme-corp"
                  className="h-10 text-sm font-mono"
                />
                {slugLocked && !editing && (
                  <Button size="sm" variant="ghost" className="h-10 px-3 text-xs text-muted-foreground shrink-0" onClick={() => setSlugLocked(false)}>
                    Auto
                  </Button>
                )}
              </div>
            </div>

            {/* Plan + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Plan</Label>
                <Select value={form.plan} onValueChange={v => patch("plan", v as TenantPlan)}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLAN_META) as TenantPlan[]).map(p => (
                      <SelectItem key={p} value={p} className="text-sm">{PLAN_META[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Status</Label>
                <Select value={form.status} onValueChange={v => patch("status", v as TenantStatus)}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_META) as TenantStatus[]).map(s => (
                      <SelectItem key={s} value={s} className="text-sm">{STATUS_META[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact Email */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Contact Email</Label>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={e => patch("contactEmail", e.target.value)}
                placeholder="admin@acmecorp.com"
                className="h-10 text-sm"
              />
            </div>

            {/* Demo Tenant toggle + interval */}
            <div className={`rounded-lg border transition-all overflow-hidden ${
              form.isDemo
                ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/20"
                : "border-dashed border-gray-200 dark:border-zinc-700"
            }`}>
              {/* Toggle row */}
              <button
                type="button"
                onClick={() => patch("isDemo", !form.isDemo)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
              >
                <div className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${form.isDemo ? "bg-violet-500" : "bg-gray-200 dark:bg-zinc-700"}`}>
                  <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${form.isDemo ? "left-[18px]" : "left-[2px]"}`} />
                </div>
                <span className={`text-[12px] font-semibold flex-1 ${form.isDemo ? "text-violet-700 dark:text-violet-300" : "text-gray-500 dark:text-gray-400"}`}>
                  This is a Demo Tenant
                </span>
                <FlaskConical size={13} className={`flex-shrink-0 ${form.isDemo ? "text-violet-500" : "text-gray-300 dark:text-zinc-600"}`} />
              </button>

              {/* Interval row — only when demo is ON */}
              {form.isDemo && (
                <div className="flex items-center gap-2 px-3 pb-2.5 pt-0.5 border-t border-violet-100 dark:border-violet-900/40">
                  <RefreshCw size={11} className="text-violet-400 flex-shrink-0" />
                  <span className="text-[11px] text-violet-600 dark:text-violet-400 font-medium flex-shrink-0">
                    Auto-reset every
                  </span>
                  <Select
                    value={String(form.demoResetInterval ?? 0)}
                    onValueChange={v => patch("demoResetInterval", Number(v))}
                  >
                    <SelectTrigger className="h-6 text-[11px] border-violet-200 dark:border-violet-800 bg-white dark:bg-zinc-900 px-2 rounded-md flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESET_INTERVALS.map(o => (
                        <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Access & Credentials ───────────────────────────────── */}
          <div className="px-7 py-6 space-y-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
              Access &amp; Credentials
            </p>

            {/* Module Group */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Layers size={13} className="text-blue-500" /> Module Group
              </Label>
              <Select
                value={form.moduleGroupId ?? "__none__"}
                onValueChange={v => patch("moduleGroupId", v === "__none__" ? undefined : v)}
              >
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="No restriction — full access" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-sm text-muted-foreground">
                    No restriction — full access
                  </SelectItem>
                  {moduleGroups.map(g => (
                    <SelectItem key={g.id} value={g.id} className="text-sm">
                      {g.name}
                      <span className="ml-2 text-muted-foreground text-xs">({g.modules.length} modules)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.moduleGroupId && (() => {
                const g = moduleGroups.find(x => x.id === form.moduleGroupId);
                if (!g) return null;
                return (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {g.modules.slice(0, 6).map(id => {
                      const def = MODULE_DEFINITIONS.find(m => m.id === id);
                      return def ? (
                        <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium">
                          {def.label}
                        </span>
                      ) : null;
                    })}
                    {g.modules.length > 6 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500">
                        +{g.modules.length - 6} more
                      </span>
                    )}
                  </div>
                );
              })()}
              {moduleGroups.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No module groups defined yet — create them in HRM → Module Groups.
                </p>
              )}
            </div>

            {/* Credentials divider */}
            <div className="border-t border-dashed border-gray-200 dark:border-zinc-700 pt-4">
              <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
                <Shield size={12} className="text-gray-400" />
                Login credentials for this tenant's admin user
              </p>
              <div className="space-y-4">
                {/* Admin Username */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Admin Username <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.adminUsername}
                    onChange={e => patch("adminUsername", e.target.value)}
                    placeholder="acme-admin"
                    className="h-10 text-sm font-mono"
                  />
                </div>

                {/* Admin Password */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Admin Password {!editing && <span className="text-red-500">*</span>}
                    {editing && <span className="text-muted-foreground font-normal ml-1 text-xs">(blank = keep current)</span>}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPwd ? "text" : "password"}
                      value={form.adminPassword}
                      onChange={e => patch("adminPassword", e.target.value)}
                      placeholder={editing ? "••••••••" : "Set a strong password"}
                      className="h-10 text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-7 py-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/60">
          <Button variant="outline" onClick={onClose} className="h-10 px-5 text-sm">Cancel</Button>
          <Button
            disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true);
              try { await onSave(form); } finally { setSaving(false); }
            }}
            className="h-10 px-5 text-sm bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check size={15} className="mr-1.5" /> {saving ? (editing ? "Saving…" : "Creating…") : (editing ? "Save Changes" : "Create Tenant")}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TenantsPage() {
  const { switchTenant, currentTenantId, isSuperAdmin, isSyncing, currentUser } = useAuth();
  const { toast }   = useToast();
  const [, navigate] = useLocation();

  const [tenants,     setTenants]     = useState<Tenant[]>(() => getTenants());
  const [search,      setSearch]      = useState("");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editing,     setEditing]     = useState<Tenant | null>(null);
  const [deleteId,    setDeleteId]    = useState<string | null>(null);
  const [statsCache,  setStatsCache]  = useState<Record<string, Record<string, number>>>({});
  const [demoSeeded,    setDemoSeeded]    = useState(() => isDemoSeeded());
  const [demoLoading,   setDemoLoading]   = useState(false);
  const [seedingId,     setSeedingId]     = useState<string | null>(null);
  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const [activities,    setActivities]    = useState<TenantActivityEntry[]>(() => getTenantActivities());
  const [activityOpen,  setActivityOpen]  = useState(true);
  const [cleanId,       setCleanId]       = useState<string | null>(null);
  const [isCleaning,    setIsCleaning]    = useState(false);
  const [masterCleanId,     setMasterCleanId]     = useState<string | null>(null);
  const [isMasterCleaning,  setIsMasterCleaning]  = useState(false);
  const [masterBlockInfo,   setMasterBlockInfo]   = useState<{ label: string; count: number }[] | null>(null);
  const [downloadingId,     setDownloadingId]     = useState<string | null>(null);
  const [pwGateOpen,    setPwGateOpen]    = useState(false);
  const [pwGateLabel,   setPwGateLabel]   = useState("");
  const [pwGateAction,  setPwGateAction]  = useState<(() => void) | null>(null);

  const reload = () => {
    setTenants(getTenants());
    setDemoSeeded(isDemoSeeded());
    setActivities(getTenantActivities());
  };

  // After every server sync completes, re-read the latest tenant list
  // (this catches the case where a deleted tenant reappears after page refresh)
  useEffect(() => {
    if (!isSyncing) reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing]);

  // On mount: always pull the latest tenant list directly from the server so
  // stale in-memory state (e.g. from a previous session or HMR update) is
  // replaced with the real DB contents immediately.
  useEffect(() => {
    setIsRefreshing(true);
    syncAllFromServer(null)
      .then(() => reload())
      .catch(() => {})
      .finally(() => setIsRefreshing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync whenever the user switches back to this browser tab after being away.
  // This prevents a long-lived session from accumulating stale in-memory state
  // and accidentally overwriting the server's tenant list (the root cause of
  // deleted tenants reappearing and new tenants going missing).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncAllFromServer(null).then(() => reload()).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualRefresh() {
    setIsRefreshing(true);
    try {
      await syncAllFromServer(null);
      reload();
      toast({ title: "Tenant list refreshed from server" });
    } catch {
      toast({ title: "Refresh failed", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleLoadDemo() {
    setDemoLoading(true);
    seedDemoTenant()
      .then(tenantId => {
        reload();
        toast({
          title: "Demo data loaded!",
          description: `Premier Furnishings Ltd. is ready. Switch to it below to explore all modules.`,
        });
        switchTenant(tenantId);
        navigate("/");
      })
      .catch(e => {
        toast({ title: "Seed failed", description: String(e), variant: "destructive" });
      })
      .finally(() => {
        setDemoLoading(false);
      });
  }

  function handleClearDemo() {
    clearDemoTenant();
    if (currentTenantId === DEMO_TENANT_ID) {
      switchTenant(null);
    }
    reload();
    toast({ title: "Demo data removed", variant: "destructive" });
  }

  function handleLoadDemoInto(tenant: Tenant) {
    setSeedingId(tenant.id);
    setTimeout(() => {
      try {
        seedDataIntoTenant(tenant.id, tenant.name);
        // Fire-and-forget metadata update — server will eventually persist;
        // failure here doesn't affect the demo seed itself.
        updateTenantAsync(tenant.id, { demoLastReset: new Date().toISOString() })
          .catch(err => console.warn("[tenants] demoLastReset persist failed:", err));
        reload();
        toast({
          title: "Demo data loaded!",
          description: `${tenant.name} now has full sample data across all modules.`,
        });
        switchTenant(tenant.id);
        navigate("/");
      } catch (e) {
        toast({ title: "Seed failed", description: String(e), variant: "destructive" });
      } finally {
        setSeedingId(null);
      }
    }, 50);
  }

  function handleClearDemoFrom(tenant: Tenant) {
    clearTenantData(tenant.id);
    if (currentTenantId === tenant.id) switchTenant(null);
    reload();
    toast({ title: `Demo data cleared from "${tenant.name}"`, variant: "destructive" });
  }

  function requirePassword(label: string, action: () => void) {
    setPwGateLabel(label);
    setPwGateAction(() => action);
    setPwGateOpen(true);
  }

  async function handleDownloadBackup(tenant: Tenant) {
    setDownloadingId(tenant.id);
    try {
      const backup = await exportTenantBackup(tenant.id, tenant);
      const json   = JSON.stringify(backup, null, 2);
      const blob   = new Blob([json], { type: "application/json" });
      const url    = URL.createObjectURL(blob);
      const date   = new Date().toISOString().split("T")[0];
      const a      = document.createElement("a");
      a.href       = url;
      a.download   = `${tenant.slug}-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const keyCount = Object.keys(backup.data).length;
      toast({
        title: "Backup downloaded",
        description: `${tenant.name} — ${keyCount} data module${keyCount !== 1 ? "s" : ""} saved to ${a.download}`,
      });
    } catch (e) {
      toast({ title: "Backup failed", description: String(e), variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleCleanMasterData(tenantId: string) {
    setIsMasterCleaning(true);
    try {
      await cleanTenantMasterData(tenantId);
      const t = tenants.find(x => x.id === tenantId);
      toast({
        title: "Master data removed",
        description: `All reference data cleared from "${t?.name ?? tenantId}". Transactions were already empty.`,
      });
    } catch (e) {
      const msg = String(e);
      // Parse which modules are blocking and surface a structured error dialog
      if (msg.includes("transactions exist:")) {
        // Extract { label, count } blocks from the error for display
        setMasterCleanId(null);
        checkTenantTransactionBlocks(tenantId)
          .then(blocks => setMasterBlockInfo(blocks))
          .catch(() => setMasterBlockInfo([]));
      } else {
        toast({ title: "Remove master data failed", description: msg, variant: "destructive" });
      }
    } finally {
      setIsMasterCleaning(false);
      setMasterCleanId(null);
    }
  }

  async function handleCleanTransactions(tenantId: string) {
    setIsCleaning(true);
    try {
      await cleanTenantTransactions(tenantId);
      const t = tenants.find(x => x.id === tenantId);
      toast({
        title: `Transactions cleared`,
        description: `All invoices, sales, purchases, and accounts data removed from "${t?.name ?? tenantId}".`,
      });
    } catch (e) {
      toast({ title: "Clean failed", description: String(e), variant: "destructive" });
    } finally {
      setIsCleaning(false);
      setCleanId(null);
    }
  }

  const filtered = useMemo(() =>
    tenants.filter(t =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()) ||
      t.adminUsername.toLowerCase().includes(search.toLowerCase())
    ), [tenants, search]);

  // Stats
  const totalActive    = tenants.filter(t => t.status === "active").length;
  const totalTrial     = tenants.filter(t => t.status === "trial").length;
  const totalSuspended = tenants.filter(t => t.status === "suspended").length;

  function loadStats(tenantId: string) {
    if (statsCache[tenantId]) return;
    const stats = getTenantStats(tenantId);
    setStatsCache(s => ({ ...s, [tenantId]: stats }));
  }

  async function handleSave(data: Omit<Tenant, "id" | "createdAt" | "updatedAt">) {
    try {
      if (editing) {
        const updates = { ...data };
        if (!updates.adminPassword) delete (updates as Partial<typeof updates>).adminPassword;
        await updateTenantAsync(editing.id, updates);
        toast({ title: `"${data.name}" updated` });
      } else {
        const t = await createTenantAsync(data);
        const coaCount = getChartOfAccountsForTenant(t.id).length;
        toast({
          title: `Tenant "${data.name}" created`,
          description: `Login: ${data.adminUsername}${coaCount > 0 ? ` · ${coaCount} COA accounts seeded` : ""}`,
        });
      }
      reload();
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      toast({
        title: "Save failed",
        description: `Could not persist tenant to the server. ${err instanceof Error ? err.message : ""}`,
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string) {
    const t = tenants.find(x => x.id === id);
    try {
      await deleteTenantAsync(id);
      reload();
      setDeleteId(null);
      toast({ title: `"${t?.name}" deleted`, variant: "destructive" });
    } catch (err) {
      // Persistence failed — surface the error so the user knows the deletion
      // didn't reach the server (and would likely come back on next sync).
      toast({
        title: "Delete failed",
        description: `Could not persist deletion to the server. Please retry. ${err instanceof Error ? err.message : ""}`,
        variant: "destructive",
      });
    }
  }

  function handleSwitch(tenant: Tenant) {
    // Open the tenant dashboard in a new tab with ?tenant=<id> so the new tab
    // auto-switches to that tenant's namespace on load.
    const url = new URL(window.location.href);
    url.pathname = "/admin-dashboard/";
    url.search   = `?tenant=${encodeURIComponent(tenant.id)}`;
    window.open(url.toString(), "_blank");
    toast({ title: `Opening ${tenant.name} in a new tab…` });
  }

  function handleSeedCOA(tenant: Tenant) {
    try {
      seedTenantCOA(tenant.id);
      const coaCount = getChartOfAccountsForTenant(tenant.id).length;
      toast({
        title: `COA seeded for ${tenant.name}`,
        description: coaCount > 0 ? `${coaCount} accounts copied from system template` : "COA structure applied",
      });
    } catch (e) {
      toast({ title: "COA seed failed", description: String(e), variant: "destructive" });
    }
  }

  function handleSeedDirector(tenant: Tenant) {
    try {
      const result = seedDirectorForTenant(tenant.id);
      if (result) {
        setStatsCache(s => ({ ...s, [tenant.id]: undefined as unknown as Record<string, number> }));
        toast({
          title: `Director created for "${tenant.name}"`,
          description: `Login: ${result.username}  ·  Password: ${result.password}`,
        });
      } else {
        toast({
          title: `Staff already exist in "${tenant.name}"`,
          description: "Director seed skipped — this tenant already has staff members.",
        });
      }
    } catch (e) {
      toast({ title: "Director seed failed", description: String(e), variant: "destructive" });
    }
  }

  // Auto-seed a Director for every tenant that has zero staff on page load
  useEffect(() => {
    if (!isSuperAdmin || tenants.length === 0) return;
    let seeded = 0;
    for (const t of tenants) {
      try {
        const result = seedDirectorForTenant(t.id);
        if (result) seeded++;
      } catch { /* best-effort */ }
    }
    if (seeded > 0) {
      toast({
        title: `Director accounts seeded`,
        description: `Created a Director (director / Director@123) for ${seeded} tenant${seeded !== 1 ? "s" : ""} that had no staff.`,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenants.length]);

  function handleExitSwitch() {
    switchTenant(null);
    toast({ title: "Returned to platform view" });
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Shield size={20} /> Access restricted to platform administrators.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 size={22} className="text-blue-500" /> Tenants
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage client organisations — each tenant has isolated data and their own login.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {currentTenantId && (
            <Button
              variant="outline"
              onClick={handleExitSwitch}
              className="h-9 gap-1.5 text-[13px] border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <X size={14} /> Exit Tenant View
            </Button>
          )}
          {demoSeeded ? (
            <Button
              variant="outline"
              onClick={handleClearDemo}
              className="h-9 gap-1.5 text-[13px] border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              <Trash2 size={14} /> Remove Demo
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleLoadDemo}
              disabled={demoLoading}
              className="h-9 gap-1.5 text-[13px] border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30"
            >
              {demoLoading
                ? <><RefreshCw size={13} className="animate-spin" /> Loading…</>
                : <><FlaskConical size={14} /> Load Demo Data</>
              }
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="h-9 gap-1.5 text-[13px]"
            title="Reload tenant list from database"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="h-9 gap-1.5 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus size={14} /> Add Tenant
          </Button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Tenants",  value: tenants.length,   color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Active",         value: totalActive,       color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Trial",          value: totalTrial,        color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Suspended",      value: totalSuspended,    color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950/30" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-transparent`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tenants…"
          className="pl-8 h-9 text-[13px]"
        />
      </div>

      {/* ── Tenant cards ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-300 dark:text-zinc-600">
          <Building2 size={52} strokeWidth={0.8} />
          <div className="text-center">
            <p className="text-[14px] font-semibold text-gray-400 dark:text-zinc-500">
              {search ? "No tenants match your search" : "No tenants yet"}
            </p>
            {!search && (
              <p className="text-[12px] mt-1">
                Click "Add Tenant" to onboard your first client organisation.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(t => {
            const planMeta   = PLAN_META[t.plan];
            const statusMeta = STATUS_META[t.status];
            const PlanIcon   = planMeta.icon;
            const stats      = statsCache[t.id];
            const isActive   = currentTenantId === t.id;
            const isSeeded   = isTenantDataSeeded(t.id);
            const isSeeding  = seedingId === t.id;

            return (
              <div
                key={t.id}
                className={`relative bg-white dark:bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow ${
                  isActive ? "border-blue-400 dark:border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900/40" : "border-gray-200 dark:border-border"
                }`}
                onMouseEnter={() => loadStats(t.id)}
              >
                {/* Active viewer badge */}
                {isActive && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                    <BarChart3 size={9} /> Viewing
                  </div>
                )}

                {/* Card header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40 flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-gray-900 dark:text-foreground truncate">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{t.slug}</div>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                    {statusMeta.label}
                  </span>
                  {t.isDemo && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
                      <FlaskConical size={9} /> Demo
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${planMeta.color}`}>
                    <PlanIcon size={9} /> {planMeta.label}
                  </span>
                  {t.moduleGroupId && (() => {
                    const grp = getModuleGroups().find(g => g.id === t.moduleGroupId);
                    return grp ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                        <Layers size={9} /> {grp.name}
                      </span>
                    ) : null;
                  })()}
                  {!t.moduleGroupId && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-gray-50 dark:bg-zinc-900/50 border border-dashed border-gray-200 dark:border-zinc-700">
                      Full access
                    </span>
                  )}
                </div>

                {/* Info row */}
                <div className="text-[12px] text-muted-foreground space-y-1 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Shield size={11} />
                    <span className="font-mono">{t.adminUsername}</span>
                  </div>
                  {t.contactEmail && (
                    <div className="truncate">{t.contactEmail}</div>
                  )}
                  <div>Created {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>

                {/* Usage stats (lazy) */}
                {stats && (
                  <div className="grid grid-cols-4 gap-1 mb-4">
                    {[
                      { icon: Users,       val: (stats["admin-leads"] ?? 0) + (stats["admin-customers"] ?? 0), label: "CRM"      },
                      { icon: Package,     val: stats["admin-products"] ?? 0,                                   label: "Products" },
                      { icon: ShoppingCart,val: stats["admin-sales"]    ?? 0,                                   label: "Sales"    },
                      { icon: BarChart3,   val: stats["admin-stock"]    ?? 0,                                   label: "Stock"    },
                    ].map(s => (
                      <div key={s.label} className="flex flex-col items-center bg-gray-50 dark:bg-zinc-900/50 rounded-lg py-1.5 px-1">
                        <s.icon size={11} className="text-muted-foreground mb-0.5" />
                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{s.val}</span>
                        <span className="text-[9px] text-muted-foreground">{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-border">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 gap-1.5 text-[12px]"
                    onClick={() => { setEditing(t); setModalOpen(true); }}
                  >
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button
                    size="sm"
                    className={`flex-1 h-8 gap-1.5 text-[12px] ${
                      isActive
                        ? "bg-amber-500 hover:bg-amber-600 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                    onClick={() => isActive
                      ? handleExitSwitch()
                      : requirePassword(`switch to "${t.name}"`, () => handleSwitch(t))
                    }
                    disabled={t.status === "suspended"}
                  >
                    <LogIn size={12} />
                    {isActive ? "Exit" : "Switch to"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => setDeleteId(t.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>

                {/* Clean transactions row — always visible */}
                <div className="pt-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-7 gap-1.5 text-[11px] text-orange-600 dark:text-orange-400 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20 border border-dashed border-orange-200 dark:border-orange-800"
                    onClick={() => requirePassword(`clean all transactions for "${t.name}"`, () => setCleanId(t.id))}
                  >
                    <Eraser size={11} /> Clean Transactions
                  </Button>
                </div>

                {/* Remove master data row */}
                <div className="pt-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-7 gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 border border-dashed border-rose-200 dark:border-rose-800"
                    onClick={() => requirePassword(`remove all master data from "${t.name}"`, () => setMasterCleanId(t.id))}
                  >
                    <Trash2 size={11} /> Remove Master Data
                  </Button>
                </div>

                {/* Download backup row */}
                <div className="pt-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={downloadingId === t.id}
                    className="w-full h-7 gap-1.5 text-[11px] text-sky-600 dark:text-sky-400 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/20 border border-dashed border-sky-200 dark:border-sky-800 disabled:opacity-60"
                    onClick={() => handleDownloadBackup(t)}
                  >
                    {downloadingId === t.id
                      ? <><RefreshCw size={10} className="animate-spin" /> Exporting…</>
                      : <><Download size={11} /> Download Backup</>
                    }
                  </Button>
                </div>

                {/* COA seed row — always visible for non-active-context tenants */}
                {!isActive && (
                  <div className="pt-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full h-7 gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border border-dashed border-emerald-200 dark:border-emerald-800"
                      onClick={() => handleSeedCOA(t)}
                    >
                      <BarChart3 size={11} /> Seed / Rebuild COA
                    </Button>
                  </div>
                )}

                {/* Director seed row — repair for tenants with no staff */}
                {!isActive && (
                  <div className="pt-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full h-7 gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 border border-dashed border-indigo-200 dark:border-indigo-800"
                      onClick={() => handleSeedDirector(t)}
                    >
                      <Crown size={11} /> Seed Director Account
                    </Button>
                  </div>
                )}

                {/* Demo data row — only visible on demo-flagged tenants */}
                {t.isDemo && (
                  <div className="pt-2.5">
                  {/* countdown chip */}
                  {isSeeded && t.demoResetInterval ? (
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] text-violet-500 dark:text-violet-400 font-medium">
                      <RefreshCw size={9} className={nextResetLabel(t.demoLastReset, t.demoResetInterval) === "Resetting soon…" ? "animate-spin" : ""} />
                      {nextResetLabel(t.demoLastReset, t.demoResetInterval)}
                    </div>
                  ) : null}
                    {isSeeded ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full h-7 gap-1.5 text-[11px] text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20 border border-dashed border-orange-200 dark:border-orange-800"
                        onClick={() => handleClearDemoFrom(t)}
                      >
                        <X size={11} /> Remove Demo Data
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSeeding}
                        className="w-full h-7 gap-1.5 text-[11px] text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/20 border border-dashed border-violet-200 dark:border-violet-800"
                        onClick={() => requirePassword(`load demo data into "${t.name}"`, () => handleLoadDemoInto(t))}
                      >
                        {isSeeding
                          ? <><RefreshCw size={10} className="animate-spin" /> Loading…</>
                          : <><FlaskConical size={11} /> Load Demo Data</>
                        }
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Activity Report ─────────────────────────────────────────────────── */}
      <div className="border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setActivityOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-zinc-900/60 hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History size={15} className="text-blue-500" />
            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
              Tenant Activity Report
            </span>
            <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-full">
              {activities.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              {activities.length > 0
                ? `Last event: ${new Date(activities[0].timestamp).toLocaleString()}`
                : "No events recorded yet"}
            </span>
            {activityOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </div>
        </button>

        {activityOpen && (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800/60">
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <History size={32} strokeWidth={0.8} className="text-gray-300 dark:text-zinc-600" />
                <p className="text-[13px]">No activity recorded yet.</p>
                <p className="text-[11px] text-gray-400">Create or delete a tenant to start the log.</p>
              </div>
            ) : (
              <>
                {/* Header row */}
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-x-4 px-5 py-2 bg-gray-50/80 dark:bg-zinc-900/40 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                  <div className="w-20">Action</div>
                  <div>Tenant</div>
                  <div>Slug</div>
                  <div>Plan</div>
                  <div>Status</div>
                  <div>Timestamp</div>
                </div>

                {activities.map((ev) => {
                  const isCreated = ev.action === "created";
                  return (
                    <div
                      key={ev.id}
                      className={`grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-x-4 items-center px-5 py-3 text-[12px] transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30 ${
                        isCreated
                          ? "border-l-2 border-emerald-400"
                          : "border-l-2 border-red-400"
                      }`}
                    >
                      {/* Action badge */}
                      <div className="w-20">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          isCreated
                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                        }`}>
                          {isCreated
                            ? <PlusCircle size={10} />
                            : <MinusCircle size={10} />}
                          {isCreated ? "Created" : "Deleted"}
                        </span>
                      </div>

                      {/* Tenant name + actor */}
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-gray-200 leading-tight">{ev.tenantName}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">by {ev.actor}</p>
                      </div>

                      {/* Slug */}
                      <div className="font-mono text-[11px] text-gray-500 dark:text-zinc-400 truncate">
                        {ev.tenantSlug}
                      </div>

                      {/* Plan */}
                      <div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          ev.plan === "enterprise"   ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" :
                          ev.plan === "professional" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" :
                                                       "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        }`}>
                          {ev.plan === "enterprise" ? <Crown size={9} /> : ev.plan === "professional" ? <Rocket size={9} /> : <Zap size={9} />}
                          {ev.plan.charAt(0).toUpperCase() + ev.plan.slice(1)}
                        </span>
                      </div>

                      {/* Status */}
                      <div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          ev.status === "active"    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" :
                          ev.status === "suspended" ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800" :
                                                      "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                        }`}>
                          {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
                        </span>
                      </div>

                      {/* Timestamp */}
                      <div className="text-gray-500 dark:text-zinc-400 text-[11px]">
                        <p>{new Date(ev.timestamp).toLocaleDateString()}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(ev.timestamp).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <TenantModal
        open={modalOpen}
        editing={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" /> Delete Tenant?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{tenants.find(t => t.id === deleteId)?.name}"</strong> will be permanently removed from the platform registry.
              Their isolated data in localStorage will remain but become inaccessible.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete Tenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Admin password gate ─────────────────────────────────────────────── */}
      <ConfirmPasswordDialog
        open={pwGateOpen}
        onOpenChange={open => { setPwGateOpen(open); if (!open) setPwGateAction(null); }}
        currentUser={currentUser}
        actionLabel={pwGateLabel}
        onConfirm={() => pwGateAction && pwGateAction()}
      />

      {/* ── Remove master data confirmation ─────────────────────────────────── */}
      <AlertDialog open={!!masterCleanId} onOpenChange={() => setMasterCleanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 size={16} className="text-rose-500" /> Remove Master Data?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will permanently erase all reference / master data for{" "}
                  <strong className="text-foreground">
                    "{tenants.find(t => t.id === masterCleanId)?.name}"
                  </strong>:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[12px]">
                  <li>Customers &amp; suppliers</li>
                  <li>Products, brands, categories, groups, departments</li>
                  <li>Units, attributes</li>
                  <li>Sales agents &amp; team members</li>
                  <li>Payment accounts &amp; chart of accounts</li>
                  <li>Raw materials &amp; manufacturing recipes</li>
                  <li>Shareholders &amp; investment plans</li>
                  <li>Cities, areas, media library, leads</li>
                  <li>All HRM records (staff, roles, payroll, attendance…)</li>
                </ul>
                <p className="font-medium text-rose-600 dark:text-rose-400">
                  Company settings are kept. This is irreversible and will fail
                  if any transactions still exist — clean those first.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMasterCleaning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMasterCleaning}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => masterCleanId && handleCleanMasterData(masterCleanId)}
            >
              {isMasterCleaning ? "Removing…" : "Yes, Remove Master Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Master data blocked by transactions — error dialog ───────────────── */}
      <AlertDialog open={!!masterBlockInfo} onOpenChange={() => setMasterBlockInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" /> Cannot Remove Master Data
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  The following modules still have transactional records linked to this
                  tenant's master data. Remove them first using{" "}
                  <strong className="text-foreground">Clean Transactions</strong>.
                </p>
                {masterBlockInfo && masterBlockInfo.length > 0 && (
                  <ul className="space-y-1">
                    {masterBlockInfo.map(b => (
                      <li key={b.label} className="flex items-center justify-between text-[12px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5">
                        <span className="font-medium text-amber-800 dark:text-amber-300">{b.label}</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{b.count} record{b.count !== 1 ? "s" : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setMasterBlockInfo(null)}>
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Clean transactions confirmation ──────────────────────────────────── */}
      <AlertDialog open={!!cleanId} onOpenChange={() => setCleanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Eraser size={16} className="text-orange-500" /> Clean Transactions?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will permanently erase all transactional data for{" "}
                  <strong className="text-foreground">
                    "{tenants.find(t => t.id === cleanId)?.name}"
                  </strong>:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[12px]">
                  <li>Sales &amp; invoices</li>
                  <li>Purchase orders &amp; returns</li>
                  <li>Sale returns</li>
                  <li>Stock levels &amp; ledger</li>
                  <li>Journal entries &amp; vouchers (accounts)</li>
                  <li>Manufacturing orders</li>
                  <li>Activity log</li>
                </ul>
                <p className="font-medium text-orange-600 dark:text-orange-400">
                  Master data (customers, products, COA, settings, HR) is kept intact.
                  This cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isCleaning}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => cleanId && handleCleanTransactions(cleanId)}
            >
              {isCleaning ? "Cleaning…" : "Yes, Clean Transactions"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
