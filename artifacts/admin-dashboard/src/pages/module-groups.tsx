import { useState, useMemo, useEffect } from "react";
import {
  Layers, Plus, Pencil, Trash2, Check, X, Shield, AlertTriangle,
  ChevronDown, ChevronRight, CheckSquare, Square, LayoutGrid,
  Users2, Package, ShoppingCart, Receipt, FileText, Image as ImageIcon,
  Settings, Copy, Sparkles, Users, DollarSign, Hammer, Globe, Wrench,
} from "lucide-react";
import {
  ModuleGroup, ModuleId, ModuleDef,
  MODULE_DEFINITIONS, ALL_MODULE_IDS,
  getModuleGroups, createModuleGroup, updateModuleGroup, deleteModuleGroup,
  getTenants,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

// ─── Module group colours by category ─────────────────────────────────────────
const GROUP_META: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  CRM:           { color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/40",       icon: Users2      },
  Products:      { color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950/40",   icon: Package     },
  Sales:         { color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", icon: Receipt     },
  HRM:           { color: "text-orange-600",  bg: "bg-orange-50 dark:bg-orange-950/40",   icon: Users       },
  Accounting:    { color: "text-teal-600",    bg: "bg-teal-50 dark:bg-teal-950/40",       icon: DollarSign  },
  Manufacturing: { color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/40",     icon: Hammer      },
  Website:       { color: "text-purple-600",  bg: "bg-purple-50 dark:bg-purple-950/40",   icon: Globe       },
  Repairs:       { color: "text-rose-600",    bg: "bg-rose-50 dark:bg-rose-950/40",       icon: Wrench      },
  Other:         { color: "text-gray-600",    bg: "bg-gray-50 dark:bg-zinc-800/40",       icon: Settings    },
};

// Group module definitions by their category
const MODULE_GROUPS_BY_CAT = MODULE_DEFINITIONS.reduce<Record<string, ModuleDef[]>>((acc, m) => {
  (acc[m.group] = acc[m.group] || []).push(m);
  return acc;
}, {});

const CAT_ORDER = ["CRM", "Products", "Sales", "HRM", "Accounting", "Manufacturing", "Website", "Repairs", "Other"];

// Presets
const PRESETS: { name: string; description: string; modules: ModuleId[]; color: string }[] = [
  {
    name: "Starter",
    description: "Basic CRM, sales & invoicing for small teams.",
    modules: ["crm_leads", "crm_customers", "sales", "invoices", "media", "settings"],
    color: "text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100 dark:bg-zinc-800/40 dark:border-zinc-700",
  },
  {
    name: "Professional",
    description: "Full CRM, products, stock, sales, accounting & HRM for growing businesses.",
    modules: [
      "crm_leads","crm_customers","crm_suppliers",
      "products","categories","brands","stock","purchases",
      "sales","invoices","sale_return","sales_agents",
      "hrm_staff","hrm_roles",
      "accounting_coa","accounting_journal","accounting_pls","accounting_receipts",
      "documents","media","settings",
    ],
    color: "text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:border-blue-800",
  },
  {
    name: "Enterprise",
    description: "Every module unlocked — complete platform access.",
    modules: ALL_MODULE_IDS,
    color: "text-violet-600 bg-violet-50 border-violet-200 hover:bg-violet-100 dark:bg-violet-950/40 dark:border-violet-800",
  },
];

// ─── Module checkbox group component ──────────────────────────────────────────
function ModuleCategorySection({
  cat,
  mods,
  selected,
  onChange,
}: {
  cat:      string;
  mods:     ModuleDef[];
  selected: Set<ModuleId>;
  onChange: (id: ModuleId, on: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta  = GROUP_META[cat] ?? GROUP_META.Other;
  const Icon  = meta.icon;
  const allOn = mods.every(m => selected.has(m.id));
  const anyOn = mods.some(m => selected.has(m.id));

  const toggleAll = () => {
    if (allOn) mods.forEach(m => onChange(m.id, false));
    else        mods.forEach(m => onChange(m.id, true));
  };

  return (
    <div className="border border-gray-200 dark:border-border rounded-xl overflow-hidden">
      {/* Category header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2.5 px-4 py-3 ${meta.bg} transition-colors`}
      >
        <Icon size={14} className={meta.color} />
        <span className={`text-[13px] font-semibold ${meta.color} flex-1 text-left`}>{cat}</span>
        <span className="text-[11px] text-muted-foreground mr-2">
          {mods.filter(m => selected.has(m.id)).length}/{mods.length} selected
        </span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); toggleAll(); }}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
            allOn
              ? "border-current text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              : "border-current " + meta.color + " hover:bg-white/50"
          }`}
        >
          {allOn ? "Clear all" : "Select all"}
        </button>
        {open ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
      </button>

      {/* Module checkboxes */}
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y dark:divide-border">
          {mods.map(m => {
            const on = selected.has(m.id);
            return (
              <label
                key={m.id}
                onClick={e => { e.preventDefault(); onChange(m.id, !on); }}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  on
                    ? "bg-blue-50/60 dark:bg-blue-950/20"
                    : "hover:bg-gray-50 dark:hover:bg-zinc-800/30"
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                  on ? "bg-blue-600 border-blue-600" : "border-gray-300 dark:border-zinc-600"
                }`}>
                  {on && <Check size={11} className="text-white" strokeWidth={3} />}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={e => onChange(m.id, e.target.checked)}
                />
                <div>
                  <p className={`text-[13px] font-medium ${on ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-foreground"}`}>
                    {m.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit modal ──────────────────────────────────────────────────────────
function GroupModal({
  open,
  editing,
  onClose,
  onSave,
}: {
  open:    boolean;
  editing: ModuleGroup | null;
  onClose: () => void;
  onSave:  (name: string, description: string, modules: ModuleId[]) => void;
}) {
  const [name,     setName]     = useState(editing?.name        ?? "");
  const [desc,     setDesc]     = useState(editing?.description ?? "");
  const [selected, setSelected] = useState<Set<ModuleId>>(new Set(editing?.modules ?? []));

  // Reset when modal re-opens
  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setDesc(editing?.description ?? "");
      setSelected(new Set(editing?.modules ?? []));
    }
  }, [open, editing]);

  const toggle = (id: ModuleId, on: boolean) =>
    setSelected(s => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  const applyPreset = (p: typeof PRESETS[0]) => {
    setName(n => n || p.name);
    setDesc(d => d || p.description);
    setSelected(new Set(p.modules));
  };

  const canSave = name.trim() && selected.size > 0;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Layers size={16} className="text-blue-500" />
            {editing ? "Edit Module Group" : "Create Module Group"}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Name + description */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Group Name <span className="text-red-500">*</span></Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Professional Plan, CRM Only…"
                className="h-9 text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Short Description</Label>
              <Textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Describe what this module group provides…"
                className="text-[13px] resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* Preset shortcuts */}
          {!editing && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={11} /> Quick Presets
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${p.color}`}
                  >
                    <Sparkles size={11} /> {p.name} ({p.modules.length} modules)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Module selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <LayoutGrid size={11} /> Select Modules
                <span className="ml-1 text-blue-600 dark:text-blue-400 normal-case font-bold">
                  ({selected.size}/{MODULE_DEFINITIONS.length} selected)
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(ALL_MODULE_IDS))}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                >
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-[11px] text-red-500 hover:underline font-semibold"
                >
                  Clear all
                </button>
              </div>
            </div>

            {CAT_ORDER.map(cat => (
              MODULE_GROUPS_BY_CAT[cat] && (
                <ModuleCategorySection
                  key={cat}
                  cat={cat}
                  mods={MODULE_GROUPS_BY_CAT[cat]}
                  selected={selected}
                  onChange={toggle}
                />
              )
            ))}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-gray-50/50 dark:bg-zinc-900/30">
          {!canSave && (
            <p className="text-[12px] text-muted-foreground mr-auto">
              {!name.trim() ? "Enter a group name to continue." : "Select at least one module."}
            </p>
          )}
          <Button variant="outline" onClick={onClose} className="h-9 text-[13px]">Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave(name.trim(), desc.trim(), Array.from(selected))}
            className="h-9 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check size={14} /> {editing ? "Save Changes" : "Create Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Module badge chips ───────────────────────────────────────────────────────
function ModuleBadges({ modules, max = 6 }: { modules: ModuleId[]; max?: number }) {
  const shown = modules.slice(0, max);
  const rest  = modules.length - max;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(id => {
        const def = MODULE_DEFINITIONS.find(m => m.id === id);
        if (!def) return null;
        const meta = GROUP_META[def.group] ?? GROUP_META.Other;
        return (
          <span
            key={id}
            className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}
          >
            {def.label}
          </span>
        );
      })}
      {rest > 0 && (
        <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500">
          +{rest} more
        </span>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ModuleGroupsPage() {
  const { isSuperAdmin } = useAuth();
  const { toast }        = useToast();

  const [groups,    setGroups]    = useState<ModuleGroup[]>(() => getModuleGroups());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<ModuleGroup | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [dupeId,    setDupeId]    = useState<string | null>(null);

  const tenants = getTenants();
  const reload  = () => setGroups(getModuleGroups());

  // Tenant counts per group
  const tenantCountByGroup = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tenants) if (t.moduleGroupId) m[t.moduleGroupId] = (m[t.moduleGroupId] || 0) + 1;
    return m;
  }, [tenants]);

  function handleSave(name: string, description: string, modules: ModuleId[]) {
    if (editing) {
      updateModuleGroup(editing.id, { name, description, modules });
      toast({ title: `"${name}" updated` });
    } else {
      createModuleGroup({ name, description, modules });
      toast({ title: `Module group "${name}" created`, description: `${modules.length} modules` });
    }
    reload();
    setModalOpen(false);
    setEditing(null);
  }

  function handleDuplicate(g: ModuleGroup) {
    createModuleGroup({ name: `${g.name} (copy)`, description: g.description, modules: [...g.modules] });
    reload();
    setDupeId(null);
    toast({ title: `"${g.name}" duplicated` });
  }

  function handleDelete(id: string) {
    const g = groups.find(x => x.id === id);
    deleteModuleGroup(id);
    reload();
    setDeleteId(null);
    toast({ title: `"${g?.name}" deleted`, variant: "destructive" });
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

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers size={22} className="text-blue-500" /> Module Groups
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Define named sets of features and assign them to tenants to control what they can access.
          </p>
        </div>
        <Button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="h-9 gap-1.5 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus size={14} /> New Group
        </Button>
      </div>

      {/* ── Stat bar ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Groups",    value: groups.length,                                              color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/30"    },
          { label: "Total Modules",   value: MODULE_DEFINITIONS.length,                                  color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950/30" },
          { label: "Assigned Tenants",value: tenants.filter(t => t.moduleGroupId).length,               color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Unassigned",      value: tenants.filter(t => !t.moduleGroupId).length,              color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/30"  },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Cards ──────────────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 gap-4 text-gray-300 dark:text-zinc-600">
          <Layers size={56} strokeWidth={0.8} />
          <div className="text-center">
            <p className="text-[14px] font-semibold text-gray-400 dark:text-zinc-500">No module groups yet</p>
            <p className="text-[12px] mt-1">Click "New Group" to define your first feature set.</p>
          </div>
          {/* Quick start presets */}
          <div className="flex flex-wrap gap-3 mt-4">
            {PRESETS.map(p => (
              <button
                key={p.name}
                onClick={() => {
                  createModuleGroup({ name: p.name, description: p.description, modules: p.modules });
                  reload();
                  toast({ title: `"${p.name}" preset created` });
                }}
                className={`flex flex-col items-center gap-1 px-5 py-3 rounded-xl border text-left transition-colors ${p.color}`}
              >
                <span className="text-[13px] font-bold">{p.name}</span>
                <span className="text-[11px] text-muted-foreground">{p.modules.length} modules</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {groups.map(g => {
            const tenantCount = tenantCountByGroup[g.id] ?? 0;
            const catCounts   = CAT_ORDER.reduce<Record<string, number>>((acc, cat) => {
              const catMods = MODULE_GROUPS_BY_CAT[cat] ?? [];
              acc[cat] = catMods.filter(m => g.modules.includes(m.id)).length;
              return acc;
            }, {});

            return (
              <div
                key={g.id}
                className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Card header */}
                <div className="p-5 flex-1">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-violet-100 dark:from-blue-900/40 dark:to-violet-800/40 flex items-center justify-center shrink-0">
                      <Layers size={18} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold text-gray-900 dark:text-foreground">{g.name}</div>
                      {g.description && (
                        <div className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{g.description}</div>
                      )}
                    </div>
                  </div>

                  {/* Category coverage bar */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {CAT_ORDER.map(cat => {
                      const total  = (MODULE_GROUPS_BY_CAT[cat] ?? []).length;
                      const active = catCounts[cat] ?? 0;
                      if (total === 0) return null;
                      const meta = GROUP_META[cat] ?? GROUP_META.Other;
                      const Icon = meta.icon;
                      return (
                        <div
                          key={cat}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold ${
                            active === 0
                              ? "bg-gray-50 dark:bg-zinc-900/50 text-gray-300 dark:text-zinc-600"
                              : meta.bg + " " + meta.color
                          }`}
                        >
                          <Icon size={10} />
                          {cat}
                          <span className={`ml-0.5 font-bold ${active === 0 ? "text-gray-300 dark:text-zinc-600" : ""}`}>
                            {active}/{total}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Module badges */}
                  <ModuleBadges modules={g.modules} max={8} />

                  <div className="mt-3 text-[12px] text-muted-foreground">
                    <span className="font-semibold text-gray-700 dark:text-foreground">{g.modules.length}</span> of {MODULE_DEFINITIONS.length} modules
                    {tenantCount > 0 && (
                      <span className="ml-2">
                        · <span className="font-semibold text-blue-600 dark:text-blue-400">{tenantCount}</span> tenant{tenantCount !== 1 ? "s" : ""} assigned
                      </span>
                    )}
                  </div>
                </div>

                {/* Card actions */}
                <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 dark:border-border">
                  <Button
                    size="sm" variant="outline"
                    className="flex-1 h-8 gap-1.5 text-[12px]"
                    onClick={() => { setEditing(g); setModalOpen(true); }}
                  >
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-blue-600"
                    title="Duplicate"
                    onClick={() => setDupeId(g.id)}
                  >
                    <Copy size={12} />
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => setDeleteId(g.id)}
                    disabled={tenantCount > 0}
                    title={tenantCount > 0 ? `${tenantCount} tenant(s) use this group — reassign first` : "Delete"}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <GroupModal
        open={modalOpen}
        editing={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
      />

      {/* Duplicate confirmation */}
      <AlertDialog open={!!dupeId} onOpenChange={() => setDupeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate this group?</AlertDialogTitle>
            <AlertDialogDescription>
              A copy of <strong>"{groups.find(g => g.id === dupeId)?.name}"</strong> will be created with all the same module selections. You can then rename and adjust it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => { const g = groups.find(x => x.id === dupeId); if (g) handleDuplicate(g); }}
            >
              Duplicate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" /> Delete Module Group?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{groups.find(g => g.id === deleteId)?.name}"</strong> will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
