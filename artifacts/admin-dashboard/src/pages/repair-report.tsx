import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wrench, RefreshCw, Printer, CalendarDays, TrendingUp,
  CheckCircle2, AlertCircle, AlertTriangle,
  Settings2, Globe, Store, Flag, BarChart3, ArrowLeft, Building2,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from "recharts";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { getTenants } from "@/lib/store";
import { kvGet } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
type BookingStatus =
  | "New" | "Diagnosing" | "Quoted" | "Awaiting Parts"
  | "In Repair" | "Ready" | "Completed";
type Priority      = "Low" | "Normal" | "High" | "Urgent";
type RequestSource = "Online" | "Shop Visitor";

interface RepairBooking {
  id:            string;
  name:          string;
  phone:         string;
  service:       string;
  deviceIssue?:  string;
  tenantId:      string;
  createdAt:     string;
  status:        BookingStatus;
  priority?:     Priority;
  estimatedDate?: string;
  notes?:        string;
  source?:       RequestSource;
}

const BOOKINGS_KEY = "repair-bookings";

const STATUS_ORDER: BookingStatus[] = [
  "New","Diagnosing","Quoted","Awaiting Parts","In Repair","Ready","Completed",
];

const LEGACY_MAP: Record<string, BookingStatus> = {
  "In Progress": "In Repair", "Resolved": "Completed",
};
function normalise(b: RepairBooking): RepairBooking {
  const status: BookingStatus = STATUS_ORDER.includes(b.status as BookingStatus)
    ? b.status : (LEGACY_MAP[b.status] ?? "New");
  return { ...b, status };
}

// ── Colours ───────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<BookingStatus, string> = {
  "New":            "#3b82f6",
  "Diagnosing":     "#8b5cf6",
  "Quoted":         "#6366f1",
  "Awaiting Parts": "#f97316",
  "In Repair":      "#f59e0b",
  "Ready":          "#14b8a6",
  "Completed":      "#10b981",
};
const PRIORITY_COLOR: Record<Priority, string> = {
  "Low":    "#9ca3af",
  "Normal": "#3b82f6",
  "High":   "#f97316",
  "Urgent": "#ef4444",
};
const SOURCE_COLOR: Record<RequestSource, string> = {
  "Online":       "#0ea5e9",
  "Shop Visitor": "#8b5cf6",
};
const BIZ_COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6","#f97316"];

// ── Date helpers ──────────────────────────────────────────────────────────────
function today(): string      { return new Date().toISOString().slice(0, 10); }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }); }
  catch { return iso; }
}
function fmtDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }); }
  catch { return iso; }
}
function dayKey(iso: string): string { return iso.slice(0, 10); }
function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-border p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{label}</p>
        <p className="text-2xl font-bold text-foreground leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-gray-50 dark:bg-muted/30 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ChartTip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-[12px]">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RepairReportPage() {
  const [, navigate]  = useLocation();
  const searchStr     = useSearch();
  const { isManager, assignedTenants, isSuperAdmin } = useAuth();

  // Pre-select business from ?biz= query param (set by manager dashboard)
  const initialBiz = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    return p.get("biz") ?? "all";
  }, []);

  const [bookings, setBookings] = useState<RepairBooking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo,   setDateTo]   = useState(today());
  const [selectedBiz, setSelectedBiz] = useState<string>(initialBiz);
  const [sortCol,  setSortCol]  = useState<keyof RepairBooking>("createdAt");
  const [sortDir,  setSortDir]  = useState<"asc"|"desc">("desc");

  // Tenants visible to this user
  const allTenants = useMemo(() => {
    const all = getTenants();
    if (isManager && assignedTenants.length > 0) {
      return all.filter(t => assignedTenants.includes(t.id));
    }
    return all;
  }, [isManager, assignedTenants]);

  // Show biz tabs if manager/superadmin with multiple tenants
  const showBizTabs = (isManager || isSuperAdmin) && allTenants.length > 0;

  // Bookings are now stored per-tenant at `t:{tenantId}/repair-bookings`
  // (May 2026 hardening). For the multi-tenant report we fetch each visible
  // tenant's bucket in parallel and merge. The legacy global key is also
  // included so any rows that haven't been migrated yet remain visible.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const namespaces = allTenants.map(t => `t:${t.id}`);
      namespaces.push("global");
      const results = await Promise.all(
        namespaces.map(ns => kvGet(ns, BOOKINGS_KEY).catch(() => null)),
      );
      const merged: RepairBooking[] = [];
      for (const raw of results) {
        if (Array.isArray(raw)) {
          for (const b of raw as RepairBooking[]) merged.push(normalise(b));
        }
      }
      setBookings(merged);
    } finally {
      setLoading(false);
    }
  }, [allTenants]);

  useEffect(() => { load(); }, [load]);

  // ── Date + business filter ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let arr = bookings.filter(b => {
      const d = b.createdAt.slice(0, 10);
      return d >= dateFrom && d <= dateTo;
    });
    // Business filter
    if (selectedBiz !== "all") {
      arr = arr.filter(b => b.tenantId === selectedBiz);
    } else if (isManager && assignedTenants.length > 0) {
      // Manager "all" → only their assigned tenants
      arr = arr.filter(b => assignedTenants.includes(b.tenantId));
    }
    return arr;
  }, [bookings, dateFrom, dateTo, selectedBiz, isManager, assignedTenants]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const total       = filtered.length;
  const openCount   = filtered.filter(b => ["New","Diagnosing","Quoted"].includes(b.status)).length;
  const activeCount = filtered.filter(b => ["Awaiting Parts","In Repair"].includes(b.status)).length;
  const doneCount   = filtered.filter(b => ["Ready","Completed"].includes(b.status)).length;
  const urgentCount = filtered.filter(b => b.priority === "Urgent").length;
  const completionPct = total > 0 ? Math.round((filtered.filter(b => b.status === "Completed").length / total) * 100) : 0;

  // ── Charts data ────────────────────────────────────────────────────────────
  const byStatus = STATUS_ORDER.map(s => ({
    name: s, value: filtered.filter(b => b.status === s).length, fill: STATUS_COLOR[s],
  })).filter(x => x.value > 0);

  const byPriority = (["Urgent","High","Normal","Low"] as Priority[]).map(p => ({
    name: p, value: filtered.filter(b => (b.priority ?? "Normal") === p).length, fill: PRIORITY_COLOR[p],
  })).filter(x => x.value > 0);

  const serviceMap: Record<string, number> = {};
  filtered.forEach(b => { serviceMap[b.service] = (serviceMap[b.service] ?? 0) + 1; });
  const byService = Object.entries(serviceMap)
    .sort(([,a],[,b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  const sourceData = [
    { name: "Online",       value: filtered.filter(b => (b.source ?? "Online") === "Online").length,  fill: SOURCE_COLOR["Online"]       },
    { name: "Shop Visitor", value: filtered.filter(b => b.source === "Shop Visitor").length,           fill: SOURCE_COLOR["Shop Visitor"] },
  ].filter(x => x.value > 0);

  // Timeline
  const timelineMap: Record<string, number> = {};
  filtered.forEach(b => { const k = dayKey(b.createdAt); timelineMap[k] = (timelineMap[k] ?? 0) + 1; });
  const timeline = Object.entries(timelineMap)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date,
      label: new Date(date).toLocaleDateString("en-GB", { day:"2-digit", month:"short" }),
      count,
    }));

  // Aging
  const openJobs    = filtered.filter(b => !["Ready","Completed"].includes(b.status));
  const agingUnder3 = openJobs.filter(b => ageDays(b.createdAt) < 3).length;
  const aging3to7   = openJobs.filter(b => ageDays(b.createdAt) >= 3 && ageDays(b.createdAt) <= 7).length;
  const agingOver7  = openJobs.filter(b => ageDays(b.createdAt) > 7).length;
  const agingData   = [
    { name: "< 3 days", value: agingUnder3, fill: "#10b981" },
    { name: "3–7 days", value: aging3to7,   fill: "#f59e0b" },
    { name: "> 7 days", value: agingOver7,  fill: "#ef4444" },
  ].filter(x => x.value > 0);

  // ── Business comparison (manager "all" view) ───────────────────────────────
  const bizComparison = useMemo(() => {
    if (selectedBiz !== "all" || allTenants.length < 2) return [];
    return allTenants.map((t, i) => {
      const tJobs = filtered.filter(b => b.tenantId === t.id);
      return {
        name:    t.name,
        total:   tJobs.length,
        open:    tJobs.filter(b => ["New","Diagnosing","Quoted"].includes(b.status)).length,
        active:  tJobs.filter(b => ["Awaiting Parts","In Repair"].includes(b.status)).length,
        done:    tJobs.filter(b => ["Ready","Completed"].includes(b.status)).length,
        urgent:  tJobs.filter(b => b.priority === "Urgent").length,
        online:  tJobs.filter(b => (b.source ?? "Online") === "Online").length,
        walkIn:  tJobs.filter(b => b.source === "Shop Visitor").length,
        fill:    BIZ_COLORS[i % BIZ_COLORS.length],
      };
    });
  }, [filtered, allTenants, selectedBiz]);

  // ── Sorted detail table ────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = String(a[sortCol] ?? "");
      const bv = String(b[sortCol] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortCol, sortDir]);

  function handleSort(col: keyof RepairBooking) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }
  function SortIcon({ col }: { col: keyof RepairBooking }) {
    if (sortCol !== col) return <span className="opacity-20">↕</span>;
    return <span>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const showBizColumn = showBizTabs && selectedBiz === "all";

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 print:p-0 print:space-y-3">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate("/repair")}
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Wrench size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Repair Report</h1>
            <p className="text-xs text-muted-foreground">
              {showBizTabs ? "Multi-business analytics & detailed log" : "Analytics & detailed log of all repair bookings"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 bg-white dark:bg-card text-sm">
            <CalendarDays size={13} className="text-muted-foreground" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-transparent text-foreground outline-none text-[13px] w-32" />
            <span className="text-muted-foreground">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-transparent text-foreground outline-none text-[13px] w-32" />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 text-xs">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 text-xs">
            <Printer size={13} /> Print / Export
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Repair Report</h1>
        <p className="text-sm text-gray-500">{fmtDate(dateFrom)} – {fmtDate(dateTo)}</p>
        {selectedBiz !== "all" && (
          <p className="text-sm text-gray-500">{allTenants.find(t => t.id === selectedBiz)?.name}</p>
        )}
      </div>

      {/* ── Business tabs (manager / superadmin) ────────────────────────── */}
      {showBizTabs && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedBiz("all")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${
              selectedBiz === "all"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white dark:bg-card border-border text-muted-foreground hover:border-indigo-300 hover:text-indigo-600"
            }`}
          >
            <Building2 size={12} />
            All Businesses
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5 ${
              selectedBiz === "all" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            }`}>
              {allTenants.length}
            </span>
          </button>
          {allTenants.map((t, i) => {
            const isActive = selectedBiz === t.id;
            const col = BIZ_COLORS[i % BIZ_COLORS.length];
            const tCount = bookings.filter(b => {
              const d = b.createdAt.slice(0, 10);
              return b.tenantId === t.id && d >= dateFrom && d <= dateTo;
            }).length;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedBiz(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${
                  isActive ? "text-white border-current shadow-sm" : "bg-white dark:bg-card border-border text-muted-foreground hover:border-current"
                }`}
                style={isActive ? { backgroundColor: col, borderColor: col } : { "--hover-color": col } as React.CSSProperties}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: col }} />
                {t.name}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5 ${
                  isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {tCount}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Jobs"      value={total}            icon={Wrench}        color="bg-blue-600"    sub={`${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`} />
        <KpiCard label="Open"            value={openCount}        icon={AlertCircle}   color="bg-violet-500"  sub="New / Diagnosing / Quoted" />
        <KpiCard label="Active"          value={activeCount}      icon={Settings2}     color="bg-amber-500"   sub="In-work jobs" />
        <KpiCard label="Done"            value={doneCount}        icon={CheckCircle2}  color="bg-emerald-500" sub="Ready & Completed" />
        <KpiCard label="Completion Rate" value={`${completionPct}%`} icon={TrendingUp} color="bg-teal-500"   sub={`${filtered.filter(b => b.status === "Completed").length} completed`} />
        <KpiCard label="Urgent"          value={urgentCount}      icon={AlertTriangle} color="bg-red-500"     sub="Priority = Urgent" />
      </div>

      {/* ── Business comparison (all-businesses view, manager) ──────────── */}
      {showBizTabs && selectedBiz === "all" && bizComparison.length >= 2 && (
        <Section title="Business Comparison">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Bar comparison */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Jobs per Business</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={bizComparison} margin={{ top: 4, right: 16, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="open"   name="Open"   stackId="a" radius={[0,0,0,0]}>
                    {bizComparison.map((e, i) => <Cell key={i} fill="#8b5cf6" />)}
                  </Bar>
                  <Bar dataKey="active" name="Active" stackId="a">
                    {bizComparison.map((e, i) => <Cell key={i} fill="#f59e0b" />)}
                  </Bar>
                  <Bar dataKey="done"   name="Done"   stackId="a" radius={[4,4,0,0]}>
                    {bizComparison.map((e, i) => <Cell key={i} fill="#10b981" />)}
                  </Bar>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Business summary tiles */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Summary per Business</p>
              <div className="space-y-2">
                {bizComparison.map((b) => (
                  <div key={b.name} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-gray-50/50 dark:bg-muted/20">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: b.fill }} />
                    <span className="text-[13px] font-semibold text-foreground flex-1 truncate">{b.name}</span>
                    <div className="flex items-center gap-2 text-[11px] flex-shrink-0">
                      <span className="text-violet-600 font-semibold px-1.5 py-0.5 bg-violet-50 dark:bg-violet-950/30 rounded">{b.open} open</span>
                      <span className="text-amber-600 font-semibold px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/30 rounded">{b.active} active</span>
                      <span className="text-emerald-600 font-semibold px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 rounded">{b.done} done</span>
                      {b.urgent > 0 && <span className="text-red-600 font-semibold px-1.5 py-0.5 bg-red-50 dark:bg-red-950/30 rounded">{b.urgent} !</span>}
                    </div>
                    {/* Mini progress bar */}
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0">
                      {b.total > 0 && (
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.round((b.done / b.total) * 100)}%`, backgroundColor: b.fill }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── Charts row 1: Status + Priority ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Jobs by Status">
          {byStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byStatus} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="value" name="Jobs" radius={[4,4,0,0]}>
                  {byStatus.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Jobs by Priority">
          {byPriority.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byPriority} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={80} innerRadius={40} paddingAngle={3}
                  label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {byPriority.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* ── Charts row 2: Service type + Source ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Jobs by Service Type">
          {byService.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byService} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="value" name="Jobs" fill="#6366f1" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Online vs Walk-in">
          <div className="flex flex-col gap-4">
            {sourceData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={70} paddingAngle={4}
                    label={({ name, percent, value }) => `${name}: ${value} (${(percent*100).toFixed(0)}%)`}>
                    {sourceData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="grid grid-cols-2 gap-3">
              {([ ["Online", Globe, "bg-sky-100 text-sky-700 dark:bg-sky-900/40"], ["Shop Visitor", Store, "bg-violet-100 text-violet-700 dark:bg-violet-900/40"] ] as const).map(([label, Icon, cls]) => (
                <div key={label} className={`rounded-lg px-3 py-2 flex items-center gap-2 ${cls}`}>
                  <Icon size={14} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
                    <p className="text-xl font-bold">{sourceData.find(s => s.name === label)?.value ?? 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      {/* ── Timeline ────────────────────────────────────────────────────── */}
      <Section title="Jobs Received per Day">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No data in range</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timeline} margin={{ top: 4, right: 16, bottom: 4, left: -16 }}>
              <defs>
                <linearGradient id="repairGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="count" name="Jobs" stroke="#3b82f6" strokeWidth={2}
                fill="url(#repairGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* ── Open-job aging ───────────────────────────────────────────────── */}
      {openJobs.length > 0 && (
        <Section title={`Open Job Aging (${openJobs.length} unfinished jobs)`}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "< 3 days", val: agingUnder3, cls: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
              { label: "3–7 days", val: aging3to7,   cls: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
              { label: "> 7 days", val: agingOver7,  cls: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800" },
            ].map(({ label, val, cls }) => (
              <div key={label} className={`rounded-xl border px-4 py-3 ${cls}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
                <p className="text-2xl font-bold mt-0.5">{val}</p>
              </div>
            ))}
          </div>
          {agingData.length > 0 && (
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={agingData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="value" name="Jobs" radius={[4,4,0,0]}>
                  {agingData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      )}

      {/* ── Detailed table ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-gray-50 dark:bg-muted/30 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">
            Detailed Job List <span className="text-muted-foreground font-normal">({sorted.length})</span>
          </h3>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <BarChart3 size={12} /> Click column headers to sort
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <RefreshCw size={16} className="animate-spin" /> Loading…
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Wrench size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No jobs in this date range{selectedBiz !== "all" ? " for this business" : ""}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50 dark:bg-muted/20 text-xs text-muted-foreground select-none">
                  {[
                    ["#", null],
                    ...(showBizColumn ? [["Business", "tenantId"]] : []),
                    ["Customer",   "name"],
                    ["Phone",      "phone"],
                    ["Service",    "service"],
                    ["Issue",      "deviceIssue"],
                    ["Source",     "source"],
                    ["Status",     "status"],
                    ["Priority",   "priority"],
                    ["Received",   "createdAt"],
                    ["Est. Date",  "estimatedDate"],
                    ["Age",        null],
                    ["Notes",      "notes"],
                  ].map(([label, col]) => (
                    <th key={label}
                      className={`px-3 py-3 text-left font-medium whitespace-nowrap ${col ? "cursor-pointer hover:text-foreground" : ""}`}
                      onClick={() => col && handleSort(col as keyof RepairBooking)}
                    >
                      {label} {col && <SortIcon col={col as keyof RepairBooking} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((b, i) => {
                  const age   = ageDays(b.createdAt);
                  const done  = ["Ready","Completed"].includes(b.status);
                  const ageCls = done ? "text-emerald-600" : age > 7 ? "text-red-600 font-semibold" : age >= 3 ? "text-amber-600" : "text-muted-foreground";
                  const sCls  = {
                    "New":"text-blue-700 bg-blue-50 border-blue-200", "Diagnosing":"text-violet-700 bg-violet-50 border-violet-200",
                    "Quoted":"text-indigo-700 bg-indigo-50 border-indigo-200", "Awaiting Parts":"text-orange-700 bg-orange-50 border-orange-200",
                    "In Repair":"text-amber-700 bg-amber-50 border-amber-200", "Ready":"text-teal-700 bg-teal-50 border-teal-200",
                    "Completed":"text-emerald-700 bg-emerald-50 border-emerald-200",
                  }[b.status] ?? "";
                  const pCls  = {
                    "Low":"text-gray-500 bg-gray-100 border-gray-200", "Normal":"text-blue-600 bg-blue-50 border-blue-200",
                    "High":"text-orange-600 bg-orange-50 border-orange-200", "Urgent":"text-red-600 bg-red-50 border-red-200",
                  }[(b.priority ?? "Normal")] ?? "";
                  const bizName = allTenants.find(t => t.id === b.tenantId)?.name ?? b.tenantId;
                  const bizIdx  = allTenants.findIndex(t => t.id === b.tenantId);
                  const bizColor = BIZ_COLORS[bizIdx >= 0 ? bizIdx % BIZ_COLORS.length : 0];
                  const src = b.source ?? "Online";
                  return (
                    <tr key={b.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-950/10 transition-colors">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                      {showBizColumn && (
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                            style={{ backgroundColor: bizColor + "18", borderColor: bizColor + "60", color: bizColor }}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bizColor }} />
                            {bizName}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-foreground text-sm">{b.name}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{b.phone}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800 font-medium">
                          <Wrench size={9} /> {b.service}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-foreground/80 max-w-36">
                        <span className="line-clamp-2">{b.deviceIssue || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {src === "Online"
                          ? <span className="inline-flex items-center gap-1 text-sky-600 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-md border border-sky-100 dark:border-sky-800 whitespace-nowrap"><Globe size={10}/> Online</span>
                          : <span className="inline-flex items-center gap-1 text-violet-600 bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded-md border border-violet-100 dark:border-violet-800 whitespace-nowrap"><Store size={10}/> Walk-in</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={`inline-block px-2 py-0.5 rounded-md border font-medium whitespace-nowrap ${sCls}`}>{b.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium whitespace-nowrap ${pCls}`}>
                          <Flag size={9}/> {b.priority ?? "Normal"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(b.createdAt)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {b.estimatedDate ? fmtDate(b.estimatedDate) : <span className="opacity-40">—</span>}
                      </td>
                      <td className={`px-3 py-2.5 text-xs tabular-nums text-right ${ageCls}`}>
                        {done ? <span className="text-emerald-600">✓</span> : `${age}d`}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-foreground/70 max-w-44">
                        <span className="line-clamp-2">{b.notes || <span className="opacity-30">—</span>}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {sorted.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-gray-50 dark:bg-muted/30 flex items-center gap-4 text-[12px] text-muted-foreground flex-wrap">
            <span><strong className="text-foreground">{sorted.length}</strong> jobs</span>
            <span>·</span>
            <span><strong className="text-blue-600">{sorted.filter(b => ["New","Diagnosing","Quoted"].includes(b.status)).length}</strong> open</span>
            <span>·</span>
            <span><strong className="text-amber-600">{sorted.filter(b => ["Awaiting Parts","In Repair"].includes(b.status)).length}</strong> active</span>
            <span>·</span>
            <span><strong className="text-emerald-600">{sorted.filter(b => ["Ready","Completed"].includes(b.status)).length}</strong> done</span>
            <span>·</span>
            <span><strong className="text-red-600">{sorted.filter(b => b.priority === "Urgent").length}</strong> urgent</span>
          </div>
        )}
      </div>

    </div>
  );
}
