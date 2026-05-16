import { useState, useMemo } from "react";
import {
  Clock, User, Search, X, ChevronDown, Download,
  Shield, Activity, Filter, Eye, RefreshCw,
  LogIn, LogOut, Plus, Pencil, Trash2, CheckCircle2,
  ArrowLeftRight, Printer, Upload, FileDown, Check,
  AlertTriangle, KeyRound, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { getActivities, ActivityEntry, ActivityAction } from "@/lib/store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ─── Module mapping ────────────────────────────────────────────────────────────
function entityToModule(entity: string): string {
  const map: Record<string, string> = {
    Lead: "CRM", Customer: "CRM",
    Product: "Inventory", RawMaterial: "Inventory",
    "Purchase Order": "Purchasing",
    Sale: "Sales", Invoice: "Sales", SaleReturn: "Sales", PurchaseReturn: "Sales",
    ManufacturingOrder: "Manufacturing", ManufacturingRecipe: "Manufacturing",
    Staff: "HRM", SalarySlip: "HRM", SalesAgent: "HRM",
    JournalEntry: "Accounts", Payment: "Accounts",
    Shareholder: "Equity", InvestmentPlan: "Equity",
    Auth: "Authentication",
    Settings: "Settings",
  };
  return map[entity] || entity;
}

// ─── Action meta ───────────────────────────────────────────────────────────────
type ActionMeta = { label: string; color: string; icon: React.ElementType };
const ACTION_META: Record<ActivityAction, ActionMeta> = {
  created:          { label: "Created",          color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",       icon: Plus          },
  updated:          { label: "Updated",          color: "bg-blue-100    text-blue-700    dark:bg-blue-950/40    dark:text-blue-400    border-blue-200    dark:border-blue-800",           icon: Pencil        },
  deleted:          { label: "Deleted",          color: "bg-red-100     text-red-700     dark:bg-red-950/40     dark:text-red-400     border-red-200     dark:border-red-800",             icon: Trash2        },
  converted:        { label: "Converted",        color: "bg-indigo-100  text-indigo-700  dark:bg-indigo-950/40  dark:text-indigo-400  border-indigo-200  dark:border-indigo-800",         icon: ArrowLeftRight },
  completed:        { label: "Completed",        color: "bg-teal-100    text-teal-700    dark:bg-teal-950/40    dark:text-teal-400    border-teal-200    dark:border-teal-800",           icon: CheckCircle2  },
  status_changed:   { label: "Status Changed",   color: "bg-amber-100   text-amber-700   dark:bg-amber-950/40   dark:text-amber-400   border-amber-200   dark:border-amber-800",         icon: RefreshCw     },
  login:            { label: "Login",            color: "bg-violet-100  text-violet-700  dark:bg-violet-950/40  dark:text-violet-400  border-violet-200  dark:border-violet-800",         icon: LogIn         },
  logout:           { label: "Logout",           color: "bg-gray-100    text-gray-600    dark:bg-gray-800       dark:text-gray-400    border-gray-200    dark:border-gray-700",           icon: LogOut        },
  printed:          { label: "Printed",          color: "bg-sky-100     text-sky-700     dark:bg-sky-950/40     dark:text-sky-400     border-sky-200     dark:border-sky-800",             icon: Printer       },
  exported:         { label: "Exported",         color: "bg-sky-100     text-sky-700     dark:bg-sky-950/40     dark:text-sky-400     border-sky-200     dark:border-sky-800",             icon: FileDown      },
  imported:         { label: "Imported",         color: "bg-orange-100  text-orange-700  dark:bg-orange-950/40  dark:text-orange-400  border-orange-200  dark:border-orange-800",         icon: Upload        },
  approved:         { label: "Approved",         color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",       icon: Check         },
  cancelled:        { label: "Cancelled",        color: "bg-rose-100    text-rose-700    dark:bg-rose-950/40    dark:text-rose-400    border-rose-200    dark:border-rose-800",           icon: AlertTriangle },
  password_changed: { label: "Pwd Changed",      color: "bg-yellow-100  text-yellow-700  dark:bg-yellow-950/40  dark:text-yellow-400  border-yellow-200  dark:border-yellow-800",       icon: KeyRound      },
};

function ActionBadge({ action }: { action: ActivityAction }) {
  const meta = ACTION_META[action] ?? ACTION_META.updated;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.color}`}>
      <Icon size={9} /> {meta.label}
    </span>
  );
}

// ─── JSON Viewer ──────────────────────────────────────────────────────────────
function JsonBlock({ data, label }: { data: Record<string, unknown>; label: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <div className="bg-muted/60 rounded-lg p-3 overflow-auto max-h-64 text-[11px] font-mono leading-relaxed">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-blue-500 dark:text-blue-400 shrink-0">{k}:</span>
            <span className="text-foreground break-all">{JSON.stringify(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ entry, onClose }: { entry: ActivityEntry; onClose: () => void }) {
  const mod = entry.module || entityToModule(entry.entity);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Activity size={15} className="text-blue-500" /> Activity Detail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User size={13} /> <span className="font-medium text-foreground">{entry.user}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={13} /> {new Date(entry.timestamp).toLocaleString()}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[12px]">Action:</span>
                <ActionBadge action={entry.action} />
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-[12px]">Module:</span>
                <span className="text-[12px] font-medium text-foreground">{mod} → {entry.entity}</span>
              </div>
            </div>
          </div>

          {/* Record */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-[13px]">
            <span className="text-muted-foreground">Record: </span>
            <span className="font-semibold text-foreground">{entry.entityName}</span>
            {entry.recordId && (
              <span className="ml-3 text-[11px] font-mono text-muted-foreground">ID: {entry.recordId}</span>
            )}
          </div>

          {/* Detail */}
          {entry.detail && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-2 text-[13px] text-amber-800 dark:text-amber-300">
              {entry.detail}
            </div>
          )}

          {/* Old / New values */}
          {(entry.oldValues || entry.newValues) && (
            <div className="flex gap-3">
              {entry.oldValues && <JsonBlock data={entry.oldValues} label="Before" />}
              {entry.newValues && <JsonBlock data={entry.newValues} label="After" />}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ActivityLogPage() {
  const { isSuperAdmin, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [rawLog]        = useState<ActivityEntry[]>(() => getActivities());
  const [search,        setSearch]        = useState("");
  const [actionFilter,  setActionFilter]  = useState<string>("all");
  const [moduleFilter,  setModuleFilter]  = useState<string>("all");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");
  const [selected,      setSelected]      = useState<ActivityEntry | null>(null);

  // Enrich with module if missing
  const entries = useMemo(() =>
    rawLog.map(e => ({ ...e, module: e.module || entityToModule(e.entity) })),
  [rawLog]);

  // Unique module values for filter
  const moduleOptions = useMemo(() => {
    const s = new Set(entries.map(e => e.module ?? ""));
    return Array.from(s).filter(Boolean).sort();
  }, [entries]);

  // Unique action values for filter
  const actionOptions = useMemo(() => {
    const s = new Set(entries.map(e => e.action));
    return Array.from(s).sort();
  }, [entries]);

  // Filtered set
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to   = dateTo   ? new Date(dateTo + "T23:59:59").getTime() : Infinity;
    return entries.filter(e => {
      if (q && ![e.user, e.entity, e.entityName, e.detail ?? ""].some(s => s.toLowerCase().includes(q))) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (moduleFilter !== "all" && (e.module ?? "") !== moduleFilter) return false;
      const t = new Date(e.timestamp).getTime();
      if (t < from || t > to) return false;
      return true;
    });
  }, [entries, search, actionFilter, moduleFilter, dateFrom, dateTo]);

  // Stats
  const total    = entries.length;
  const creates  = entries.filter(e => e.action === "created").length;
  const updates  = entries.filter(e => e.action === "updated" || e.action === "status_changed").length;
  const deletes  = entries.filter(e => e.action === "deleted").length;
  const logins   = entries.filter(e => e.action === "login").length;

  // CSV Export
  function handleExport() {
    const rows = [
      ["#", "Timestamp", "User", "Module", "Entity", "Action", "Record", "Detail"],
      ...filtered.map((e, i) => [
        String(i + 1),
        new Date(e.timestamp).toLocaleString(),
        e.user,
        e.module ?? entityToModule(e.entity),
        e.entity,
        e.action,
        e.entityName,
        e.detail ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${filtered.length} records` });
  }

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity size={22} className="text-blue-500" /> Activity Log
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Complete audit trail of all actions performed in the system.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-[12px]"
          onClick={handleExport}
          disabled={filtered.length === 0}
        >
          <Download size={13} /> Export CSV
        </Button>
      </div>

      {/* Stats pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Total",    count: total,   color: "bg-gray-100    dark:bg-gray-800    text-gray-700   dark:text-gray-300",   border: "border-gray-200 dark:border-gray-700" },
          { label: "Created",  count: creates, color: "bg-emerald-50  dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800" },
          { label: "Updated",  count: updates, color: "bg-blue-50     dark:bg-blue-950/30  text-blue-700   dark:text-blue-400",   border: "border-blue-200 dark:border-blue-800" },
          { label: "Deleted",  count: deletes, color: "bg-red-50      dark:bg-red-950/30   text-red-700    dark:text-red-400",    border: "border-red-200 dark:border-red-800" },
          { label: "Logins",   count: logins,  color: "bg-violet-50   dark:bg-violet-950/30 text-violet-700 dark:text-violet-400", border: "border-violet-200 dark:border-violet-800" },
        ].map(p => (
          <button
            key={p.label}
            onClick={() => {
              const map: Record<string, string> = { Created: "created", Updated: "updated", Deleted: "deleted", Logins: "login" };
              setActionFilter(prev => {
                const target = map[p.label] ?? "all";
                return (prev === target || p.label === "Total") ? "all" : target;
              });
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border ${p.color} ${p.border} cursor-pointer hover:opacity-80 transition-opacity`}
          >
            {p.label}: <span className="font-bold">{p.count}</span>
          </button>
        ))}
        {filtered.length !== entries.length && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] text-muted-foreground border border-dashed">
            <Filter size={9} /> {filtered.length} shown
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-[13px]"
            placeholder="Search user, record, module…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Action filter */}
        <div className="relative">
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="h-8 appearance-none pl-3 pr-7 text-[12px] rounded-md border border-input bg-background text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Actions</option>
            {actionOptions.map(a => (
              <option key={a} value={a}>{ACTION_META[a as ActivityAction]?.label ?? a}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>

        {/* Module filter */}
        <div className="relative">
          <select
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
            className="h-8 appearance-none pl-3 pr-7 text-[12px] rounded-md border border-input bg-background text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Modules</option>
            {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>

        {/* Date range */}
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="h-8 px-2.5 text-[12px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-[11px] text-muted-foreground">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="h-8 px-2.5 text-[12px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {(search || actionFilter !== "all" || moduleFilter !== "all" || dateFrom || dateTo) && (
          <Button
            size="sm" variant="ghost"
            className="h-8 gap-1 text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => { setSearch(""); setActionFilter("all"); setModuleFilter("all"); setDateFrom(""); setDateTo(""); }}
          >
            <X size={11} /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <BarChart3 size={32} className="opacity-20" />
          <p className="text-sm">{entries.length === 0 ? "No activity recorded yet. Start using the system to generate logs." : "No entries match the current filters."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground w-8">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">Date & Time</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">User</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Module</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Action</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Record</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground hidden md:table-cell">Detail</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => (
                  <tr
                    key={e.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelected(e)}
                  >
                    <td className="px-3 py-2 text-muted-foreground text-[11px]">{idx + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[12px] text-muted-foreground">
                      <span className="font-medium text-foreground">{new Date(e.timestamp).toLocaleDateString()}</span>
                      {" "}
                      <span>{new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-[9px] font-bold text-blue-700 dark:text-blue-400 shrink-0">
                          {(e.user?.[0] ?? "?").toUpperCase()}
                        </div>
                        <span className="text-[12px] font-medium">{e.user}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                        {e.module ?? entityToModule(e.entity)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <ActionBadge action={e.action} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{e.entityName}</span>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{e.entity}</span>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-[12px] text-muted-foreground max-w-[200px] truncate">
                      {e.detail ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={ev => { ev.stopPropagation(); setSelected(e); }}
                        className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 text-muted-foreground hover:text-blue-600 transition-colors"
                        title="View detail"
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>Showing {filtered.length} of {entries.length} entries</span>
            {isSuperAdmin && (
              <span className="flex items-center gap-1"><Shield size={10} /> Logs are read-only</span>
            )}
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && <DetailModal entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
