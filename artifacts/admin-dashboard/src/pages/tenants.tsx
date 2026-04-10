import { useState, useMemo, useEffect } from "react";
import {
  Building2, Plus, Pencil, Trash2, LogIn, Users, ShoppingCart,
  Package, BarChart3, AlertTriangle, Check, X, Eye, EyeOff,
  Crown, Zap, Rocket, Shield, Search, Layers, FlaskConical, RefreshCw,
} from "lucide-react";
import {
  seedDemoTenant, clearDemoTenant, isDemoSeeded, DEMO_TENANT_ID,
  seedDataIntoTenant, clearTenantData, isTenantDataSeeded,
} from "@/lib/demo-seed";
import {
  Tenant, TenantStatus, TenantPlan,
  getTenants, createTenant, updateTenant, deleteTenant,
  getTenantStats,
  ModuleGroup, getModuleGroups, getModuleGroupById,
  MODULE_DEFINITIONS,
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
const blankForm = (): Omit<Tenant, "id" | "createdAt" | "updatedAt"> => ({
  name:          "",
  slug:          "",
  adminUsername: "",
  adminPassword: "",
  contactEmail:  "",
  status:        "trial",
  plan:          "starter",
  moduleGroupId: undefined,
  isDemo:        false,
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
  onSave:  (data: Omit<Tenant, "id" | "createdAt" | "updatedAt">) => void;
}) {
  const [form,       setForm]       = useState(() => editing ? { ...editing } : blankForm());
  const [showPwd,    setShowPwd]    = useState(false);
  const [slugLocked, setSlugLocked] = useState(!!editing);
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

            {/* Demo Tenant toggle */}
            <button
              type="button"
              onClick={() => patch("isDemo", !form.isDemo)}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
                form.isDemo
                  ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30"
                  : "border-dashed border-gray-200 dark:border-zinc-700 bg-transparent hover:bg-gray-50 dark:hover:bg-zinc-900/40"
              }`}
            >
              <div className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${form.isDemo ? "bg-violet-500" : "bg-gray-200 dark:bg-zinc-700"}`}>
                <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${form.isDemo ? "left-[18px]" : "left-[2px]"}`} />
              </div>
              <span className={`text-[12px] font-semibold flex-1 ${form.isDemo ? "text-violet-700 dark:text-violet-300" : "text-gray-500 dark:text-gray-400"}`}>
                This is a Demo Tenant
              </span>
              <FlaskConical size={13} className={`flex-shrink-0 ${form.isDemo ? "text-violet-500" : "text-gray-300 dark:text-zinc-600"}`} />
            </button>
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
            disabled={!canSave}
            onClick={() => onSave(form)}
            className="h-10 px-5 text-sm bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check size={15} className="mr-1.5" /> {editing ? "Save Changes" : "Create Tenant"}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TenantsPage() {
  const { switchTenant, currentTenantId, isSuperAdmin } = useAuth();
  const { toast }   = useToast();
  const [, navigate] = useLocation();

  const [tenants,     setTenants]     = useState<Tenant[]>(() => getTenants());
  const [search,      setSearch]      = useState("");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editing,     setEditing]     = useState<Tenant | null>(null);
  const [deleteId,    setDeleteId]    = useState<string | null>(null);
  const [statsCache,  setStatsCache]  = useState<Record<string, Record<string, number>>>({});
  const [demoSeeded,  setDemoSeeded]  = useState(() => isDemoSeeded());
  const [demoLoading, setDemoLoading] = useState(false);
  const [seedingId,   setSeedingId]   = useState<string | null>(null);

  const reload = () => {
    setTenants(getTenants());
    setDemoSeeded(isDemoSeeded());
  };

  function handleLoadDemo() {
    setDemoLoading(true);
    setTimeout(() => {
      try {
        const tenantId = seedDemoTenant();
        reload();
        toast({
          title: "Demo data loaded!",
          description: `Premier Furnishings Ltd. is ready. Switch to it below to explore all modules.`,
        });
        // Auto-switch into the demo tenant
        switchTenant(tenantId);
        navigate("/");
      } catch (e) {
        toast({ title: "Seed failed", description: String(e), variant: "destructive" });
      } finally {
        setDemoLoading(false);
      }
    }, 50);
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

  function handleSave(data: Omit<Tenant, "id" | "createdAt" | "updatedAt">) {
    if (editing) {
      const updates = { ...data };
      if (!updates.adminPassword) delete (updates as Partial<typeof updates>).adminPassword;
      updateTenant(editing.id, updates);
      toast({ title: `"${data.name}" updated` });
    } else {
      createTenant(data);
      toast({ title: `Tenant "${data.name}" created`, description: `Login: ${data.adminUsername}` });
    }
    reload();
    setModalOpen(false);
    setEditing(null);
  }

  function handleDelete(id: string) {
    const t = tenants.find(x => x.id === id);
    deleteTenant(id);
    reload();
    setDeleteId(null);
    toast({ title: `"${t?.name}" deleted`, variant: "destructive" });
  }

  function handleSwitch(tenant: Tenant) {
    switchTenant(tenant.id);
    navigate("/");
    toast({ title: `Switched to ${tenant.name}`, description: "You are now viewing this tenant's data." });
  }

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
                    onClick={() => isActive ? handleExitSwitch() : handleSwitch(t)}
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

                {/* Demo data row — only visible on demo-flagged tenants */}
                {t.isDemo && (
                  <div className="pt-2.5">
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
                        onClick={() => handleLoadDemoInto(t)}
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
    </div>
  );
}
