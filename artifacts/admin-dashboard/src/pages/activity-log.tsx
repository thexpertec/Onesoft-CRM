import { useState, useMemo, useCallback } from "react";
import {
  Clock, User, Search, X, ChevronDown, Download,
  Shield, Activity, Filter, Eye, RefreshCw,
  LogIn, LogOut, Plus, Pencil, Trash2, CheckCircle2,
  ArrowLeftRight, Printer, Upload, FileDown, Check,
  AlertTriangle, KeyRound, BarChart3, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown,
  ArrowUp, ArrowDown, ListFilter,
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
  created:          { label: "Created",        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", icon: Plus          },
  updated:          { label: "Updated",        color: "bg-blue-100    text-blue-700    dark:bg-blue-950/40    dark:text-blue-400    border-blue-200    dark:border-blue-800",   icon: Pencil        },
  deleted:          { label: "Deleted",        color: "bg-red-100     text-red-700     dark:bg-red-950/40     dark:text-red-400     border-red-200     dark:border-red-800",     icon: Trash2        },
  converted:        { label: "Converted",      color: "bg-indigo-100  text-indigo-700  dark:bg-indigo-950/40  dark:text-indigo-400  border-indigo-200  dark:border-indigo-800", icon: ArrowLeftRight },
  completed:        { label: "Completed",      color: "bg-teal-100    text-teal-700    dark:bg-teal-950/40    dark:text-teal-400    border-teal-200    dark:border-teal-800",   icon: CheckCircle2  },
  status_changed:   { label: "Status Changed", color: "bg-amber-100   text-amber-700   dark:bg-amber-950/40   dark:text-amber-400   border-amber-200   dark:border-amber-800", icon: RefreshCw     },
  login:            { label: "Login",          color: "bg-violet-100  text-violet-700  dark:bg-violet-950/40  dark:text-violet-400  border-violet-200  dark:border-violet-800", icon: LogIn         },
  logout:           { label: "Logout",         color: "bg-gray-100    text-gray-600    dark:bg-gray-800       dark:text-gray-400    border-gray-200    dark:border-gray-700",   icon: LogOut        },
  printed:          { label: "Printed",        color: "bg-sky-100     text-sky-700     dark:bg-sky-950/40     dark:text-sky-400     border-sky-200     dark:border-sky-800",     icon: Printer       },
  exported:         { label: "Exported",       color: "bg-sky-100     text-sky-700     dark:bg-sky-950/40     dark:text-sky-400     border-sky-200     dark:border-sky-800",     icon: FileDown      },
  imported:         { label: "Imported",       color: "bg-orange-100  text-orange-700  dark:bg-orange-950/40  dark:text-orange-400  border-orange-200  dark:border-orange-800", icon: Upload        },
  approved:         { label: "Approved",       color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", icon: Check         },
  cancelled:        { label: "Cancelled",      color: "bg-rose-100    text-rose-700    dark:bg-rose-950/40    dark:text-rose-400    border-rose-200    dark:border-rose-800",   icon: AlertTriangle },
  password_changed: { label: "Pwd Changed",    color: "bg-yellow-100  text-yellow-700  dark:bg-yellow-950/40  dark:text-yellow-400  border-yellow-200  dark:border-yellow-800", icon: KeyRound      },
};

function ActionBadge({ action }: { action: ActivityAction }) {
  const meta = ACTION_META[action] ?? ACTION_META.updated;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${meta.color}`}>
      <Icon size={9} /> {meta.label}
    </span>
  );
}

// ─── JSON Block ───────────────────────────────────────────────────────────────
function JsonBlock({ data, label }: { data: Record<string, unknown>; label: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
      <div className="bg-muted/60 rounded-lg p-3 overflow-auto max-h-60 text-[11px] font-mono leading-relaxed">
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
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User size={13} className="shrink-0" />
                <span className="font-semibold text-foreground">{entry.user}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={13} className="shrink-0" />
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[12px] shrink-0">Action:</span>
                <ActionBadge action={entry.action} />
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-[12px]">
                <span className="shrink-0">Module:</span>
                <span className="font-medium text-foreground">{mod} → {entry.entity}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-[13px] flex items-center gap-3">
            <span className="text-muted-foreground shrink-0">Record:</span>
            <span className="font-semibold text-foreground">{entry.entityName}</span>
            {entry.recordId && (
              <span className="ml-auto text-[11px] font-mono text-muted-foreground">ID: {entry.recordId}</span>
            )}
          </div>

          {entry.detail && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-[13px] text-amber-800 dark:text-amber-300">
              {entry.detail}
            </div>
          )}

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

// ─── Sort indicator ───────────────────────────────────────────────────────────
type SortField = "timestamp" | "user" | "module" | "action" | "entity";
type SortDir   = "asc" | "desc";

function SortIcon({ field, active, dir }: { field: string; active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={11} className="opacity-30 ml-1" />;
  return dir === "asc"
    ? <ArrowUp size={11} className="opacity-80 ml-1 text-blue-500" />
    : <ArrowDown size={11} className="opacity-80 ml-1 text-blue-500" />;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, count, icon: Icon, iconBg, iconColor, cardBorder, onClick, active,
}: {
  label: string; count: number; icon: React.ElementType;
  iconBg: string; iconColor: string; cardBorder: string;
  onClick?: () => void; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-white dark:bg-card shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer text-left group flex-1 min-w-[120px]
        ${active ? `${cardBorder} ring-2 ring-offset-0 ring-blue-200 dark:ring-blue-800` : "border-border hover:border-blue-200 dark:hover:border-blue-800"}`}
    >
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
        <Icon size={16} className={iconColor} />
      </div>
      <div>
        <p className="text-[22px] font-bold leading-tight text-foreground">{count.toLocaleString()}</p>
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function ActivityLogPage() {
  const { isSuperAdmin, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [rawLog]       = useState<ActivityEntry[]>(() => getActivities());
  const [search,       setSearch]       = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [selected,     setSelected]     = useState<ActivityEntry | null>(null);
  const [sortField,    setSortField]    = useState<SortField>("timestamp");
  const [sortDir,      setSortDir]      = useState<SortDir>("desc");
  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState<typeof PAGE_SIZES[number]>(25);

  // Enrich with module if missing
  const entries = useMemo(() =>
    rawLog.map(e => ({ ...e, module: e.module || entityToModule(e.entity) })),
  [rawLog]);

  const moduleOptions = useMemo(() => {
    const s = new Set(entries.map(e => e.module ?? ""));
    return Array.from(s).filter(Boolean).sort();
  }, [entries]);

  const actionOptions = useMemo(() => {
    const s = new Set(entries.map(e => e.action));
    return Array.from(s).sort();
  }, [entries]);

  // Filter
  const filtered = useMemo(() => {
    const q    = search.toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to   = dateTo   ? new Date(dateTo + "T23:59:59").getTime() : Infinity;
    return entries.filter(e => {
      if (q && ![e.user, e.entity, e.entityName, e.module ?? "", e.detail ?? ""].some(s => s.toLowerCase().includes(q))) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (moduleFilter !== "all" && (e.module ?? "") !== moduleFilter) return false;
      const t = new Date(e.timestamp).getTime();
      if (t < from || t > to) return false;
      return true;
    });
  }, [entries, search, actionFilter, moduleFilter, dateFrom, dateTo]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "timestamp") cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      else if (sortField === "user")   cmp = a.user.localeCompare(b.user);
      else if (sortField === "module") cmp = (a.module ?? "").localeCompare(b.module ?? "");
      else if (sortField === "action") cmp = a.action.localeCompare(b.action);
      else if (sortField === "entity") cmp = a.entityName.localeCompare(b.entityName);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageStart  = (safePage - 1) * pageSize;
  const paginated  = sorted.slice(pageStart, pageStart + pageSize);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setPage(1);
  }, [sortField]);

  const handleFilterChange = useCallback(() => setPage(1), []);

  // Stats
  const total   = entries.length;
  const creates = entries.filter(e => e.action === "created").length;
  const updates = entries.filter(e => e.action === "updated" || e.action === "status_changed").length;
  const deletes = entries.filter(e => e.action === "deleted").length;
  const logins  = entries.filter(e => e.action === "login").length;

  // CSV Export
  function handleExportCsv() {
    const rows = [
      ["#", "Timestamp", "User", "Module", "Entity", "Action", "Record", "Detail"],
      ...sorted.map((e, i) => [
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
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${sorted.length} records as CSV` });
  }

  // Print
  function handlePrint() {
    const printContent = `
      <html><head><title>Activity Log</title><style>
        body{font-family:sans-serif;font-size:12px;padding:20px;color:#111}
        h1{font-size:18px;margin-bottom:4px}p{color:#666;font-size:11px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse}
        th{background:#f3f4f6;text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb}
        td{padding:7px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
        tr:nth-child(even) td{background:#fafafa}
        .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600}
        @media print{body{padding:0}}
      </style></head><body>
        <h1>Activity Log</h1>
        <p>Exported: ${new Date().toLocaleString()} · Total records: ${sorted.length}</p>
        <table>
          <thead><tr>
            <th>#</th><th>Date & Time</th><th>User</th><th>Module</th><th>Action</th><th>Record</th><th>Detail</th>
          </tr></thead>
          <tbody>
            ${sorted.map((e, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${new Date(e.timestamp).toLocaleString()}</td>
                <td>${e.user}</td>
                <td>${e.module ?? entityToModule(e.entity)} / ${e.entity}</td>
                <td><span class="badge">${e.action}</span></td>
                <td>${e.entityName}</td>
                <td>${e.detail ?? ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </body></html>
    `;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(printContent);
    win.document.close();
    win.focus();
    win.print();
  }

  const clearFilters = () => {
    setSearch(""); setActionFilter("all"); setModuleFilter("all");
    setDateFrom(""); setDateTo(""); setPage(1);
  };
  const hasFilters = search || actionFilter !== "all" || moduleFilter !== "all" || dateFrom || dateTo;

  const thClass = (f: SortField) =>
    `px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wide text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors ${sortField === f ? "text-blue-600 dark:text-blue-400" : ""}`;

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity size={21} className="text-blue-500" /> Activity Log
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Complete audit trail of all actions performed in the system.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={handlePrint} disabled={sorted.length === 0}>
            <Printer size={13} /> Print / PDF
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={handleExportCsv} disabled={sorted.length === 0}>
            <Download size={13} /> Export CSV
          </Button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="flex gap-3 flex-wrap">
        <StatCard
          label="Total Activities" count={total}
          icon={BarChart3} iconBg="bg-gray-100 dark:bg-gray-800" iconColor="text-gray-600 dark:text-gray-300"
          cardBorder="border-gray-400"
          onClick={() => { setActionFilter("all"); handleFilterChange(); }}
          active={actionFilter === "all" && !hasFilters}
        />
        <StatCard
          label="Created" count={creates}
          icon={Plus} iconBg="bg-emerald-100 dark:bg-emerald-950/50" iconColor="text-emerald-600 dark:text-emerald-400"
          cardBorder="border-emerald-400"
          onClick={() => { setActionFilter(f => f === "created" ? "all" : "created"); handleFilterChange(); }}
          active={actionFilter === "created"}
        />
        <StatCard
          label="Updated" count={updates}
          icon={Pencil} iconBg="bg-blue-100 dark:bg-blue-950/50" iconColor="text-blue-600 dark:text-blue-400"
          cardBorder="border-blue-400"
          onClick={() => { setActionFilter(f => f === "updated" ? "all" : "updated"); handleFilterChange(); }}
          active={actionFilter === "updated"}
        />
        <StatCard
          label="Deleted" count={deletes}
          icon={Trash2} iconBg="bg-red-100 dark:bg-red-950/50" iconColor="text-red-600 dark:text-red-400"
          cardBorder="border-red-400"
          onClick={() => { setActionFilter(f => f === "deleted" ? "all" : "deleted"); handleFilterChange(); }}
          active={actionFilter === "deleted"}
        />
        <StatCard
          label="Logins" count={logins}
          icon={LogIn} iconBg="bg-violet-100 dark:bg-violet-950/50" iconColor="text-violet-600 dark:text-violet-400"
          cardBorder="border-violet-400"
          onClick={() => { setActionFilter(f => f === "login" ? "all" : "login"); handleFilterChange(); }}
          active={actionFilter === "login"}
        />
      </div>

      {/* ── Filters ── */}
      <div className="rounded-xl border border-border bg-white dark:bg-card p-3 shadow-sm">
        <div className="flex flex-wrap gap-2 items-center">
          <ListFilter size={13} className="text-muted-foreground shrink-0" />

          {/* Search */}
          <div className="relative flex-1 min-w-44 max-w-64">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-[12px]"
              placeholder="Search user, record, module…"
              value={search}
              onChange={e => { setSearch(e.target.value); handleFilterChange(); }}
            />
            {search && (
              <button onClick={() => { setSearch(""); handleFilterChange(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={11} />
              </button>
            )}
          </div>

          {/* Action */}
          <div className="relative">
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); handleFilterChange(); }}
              className="h-8 appearance-none pl-3 pr-7 text-[12px] rounded-md border border-input bg-background text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Actions</option>
              {actionOptions.map(a => (
                <option key={a} value={a}>{ACTION_META[a as ActivityAction]?.label ?? a}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>

          {/* Module */}
          <div className="relative">
            <select
              value={moduleFilter}
              onChange={e => { setModuleFilter(e.target.value); handleFilterChange(); }}
              className="h-8 appearance-none pl-3 pr-7 text-[12px] rounded-md border border-input bg-background text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Modules</option>
              {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); handleFilterChange(); }}
              className="h-8 px-2 text-[12px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-[11px] text-muted-foreground">–</span>
            <input
              type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); handleFilterChange(); }}
              className="h-8 px-2 text-[12px] rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-[12px] text-muted-foreground" onClick={clearFilters}>
              <X size={11} /> Clear
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {filtered.length !== entries.length && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Filter size={10} /> {filtered.length.toLocaleString()} filtered
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-border bg-white dark:bg-card flex flex-col items-center justify-center py-20 gap-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-muted flex items-center justify-center">
            <BarChart3 size={26} className="text-gray-300 dark:text-gray-600" />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-semibold text-foreground">No activity recorded yet</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              {entries.length === 0
                ? "Start using the system to generate logs."
                : "No entries match the current filters — try adjusting or clearing them."}
            </p>
          </div>
          {hasFilters && (
            <Button size="sm" variant="outline" onClick={clearFilters} className="gap-1.5 text-[12px]">
              <X size={11} /> Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white dark:bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-gray-50/80 dark:bg-muted/40">
                  <th className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wide text-muted-foreground w-10">#</th>
                  <th className={thClass("timestamp")} onClick={() => handleSort("timestamp")}>
                    <span className="flex items-center">Date & Time<SortIcon field="timestamp" active={sortField === "timestamp"} dir={sortDir} /></span>
                  </th>
                  <th className={thClass("user")} onClick={() => handleSort("user")}>
                    <span className="flex items-center">User<SortIcon field="user" active={sortField === "user"} dir={sortDir} /></span>
                  </th>
                  <th className={thClass("module")} onClick={() => handleSort("module")}>
                    <span className="flex items-center">Module<SortIcon field="module" active={sortField === "module"} dir={sortDir} /></span>
                  </th>
                  <th className={thClass("action")} onClick={() => handleSort("action")}>
                    <span className="flex items-center">Action<SortIcon field="action" active={sortField === "action"} dir={sortDir} /></span>
                  </th>
                  <th className={thClass("entity")} onClick={() => handleSort("entity")}>
                    <span className="flex items-center">Record<SortIcon field="entity" active={sortField === "entity"} dir={sortDir} /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Detail</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[11px] uppercase tracking-wide text-muted-foreground w-14">View</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((e, idx) => (
                  <tr
                    key={e.id}
                    className="border-b border-border/50 hover:bg-blue-50/40 dark:hover:bg-blue-950/10 transition-colors cursor-pointer even:bg-gray-50/40 dark:even:bg-muted/10"
                    onClick={() => setSelected(e)}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground text-[11px] font-mono">
                      {pageStart + idx + 1}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="text-[12px] font-medium">{new Date(e.timestamp).toLocaleDateString()}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-[9px] font-bold text-blue-700 dark:text-blue-400 shrink-0">
                          {(e.user?.[0] ?? "?").toUpperCase()}
                        </div>
                        <span className="text-[12px] font-medium whitespace-nowrap">{e.user}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium inline-block">
                        {e.module ?? entityToModule(e.entity)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <ActionBadge action={e.action} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[12px] font-medium text-foreground">{e.entityName}</div>
                      <div className="text-[10px] text-muted-foreground">{e.entity}</div>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell text-[12px] text-muted-foreground max-w-[220px] truncate">
                      {e.detail ?? <span className="text-[11px] opacity-40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={ev => { ev.stopPropagation(); setSelected(e); }}
                        className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-950/40 text-muted-foreground hover:text-blue-600 transition-colors"
                        title="View details"
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination footer ── */}
          <div className="px-4 py-3 border-t border-border bg-gray-50/60 dark:bg-muted/20 flex items-center justify-between gap-4 flex-wrap">
            {/* Left: rows per page */}
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span>Rows:</span>
              <div className="relative">
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number]); setPage(1); }}
                  className="h-7 pl-2 pr-6 text-[12px] rounded border border-input bg-background text-foreground appearance-none cursor-pointer focus:outline-none"
                >
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
              <span className="text-[12px] text-muted-foreground">
                {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} of {sorted.length.toLocaleString()}
              </span>
              {isSuperAdmin && (
                <span className="hidden sm:flex items-center gap-1 ml-2 text-[11px]">
                  <Shield size={10} /> Read-only log
                </span>
              )}
            </div>

            {/* Right: page controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)} disabled={safePage === 1}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors"
                title="First page"
              ><ChevronsLeft size={13} /></button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors"
                title="Previous page"
              ><ChevronLeft size={13} /></button>

              {/* Page number pills */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="w-7 h-7 flex items-center justify-center text-[12px] text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-7 h-7 flex items-center justify-center rounded text-[12px] font-medium transition-colors
                        ${safePage === p ? "bg-blue-600 text-white shadow-sm" : "hover:bg-muted text-foreground"}`}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors"
                title="Next page"
              ><ChevronRight size={13} /></button>
              <button
                onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors"
                title="Last page"
              ><ChevronsRight size={13} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail modal ── */}
      {selected && <DetailModal entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
