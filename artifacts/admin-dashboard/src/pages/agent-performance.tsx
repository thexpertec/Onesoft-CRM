import { useState, useMemo } from "react";
import { getSales, getSalesAgents, getAreas, getCities } from "@/lib/store";
import type { Sale, SaleItem, SalesAgent, Area } from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import {
  Users2, TrendingUp, Award, Target, BarChart3,
  Printer, Download, Search, Calendar, ChevronUp,
  ChevronDown as ChevronDownIcon, Medal, Star,
  ArrowUpRight, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string     { return new Date().toISOString().slice(0, 10); }
function yearStart(): string { const d = new Date(); d.setMonth(0, 1); return d.toISOString().slice(0, 10); }
function monthStart(): string{ const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

const lineTotal = (item: SaleItem): number => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  const d = parseFloat(item.discount) || 0;
  if (item.discountType === "amt") return Math.max(0, q * p - d);
  return q * p * (1 - d / 100);
};
const saleTotal = (items: SaleItem[]): number =>
  items.reduce((s, i) => s + lineTotal(i), 0);

const saleGrandTotal = (sale: Sale): number => {
  const sub = saleTotal(sale.items);
  const tax = parseFloat(sale.taxRate || "0") || 0;
  return sub * (1 + tax / 100);
};

function fmt(n: number, sym: string): string {
  return `${sym} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtN(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SortKey = "name" | "area" | "sales" | "revenue" | "avgOrder" | "commission" | "target" | "achievement";

type AgentRow = {
  agent:       SalesAgent;
  numSales:    number;
  revenue:     number;
  avgOrder:    number;
  commission:  number;
  target:      number;
  achievement: number;
};

// ─── Date preset ──────────────────────────────────────────────────────────────
type Preset = "month" | "year" | "all" | "custom";

export default function AgentPerformancePage() {
  const sym = useMemo(() => getSettingsCurrencySymbol(), []);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [preset,     setPreset]     = useState<Preset>("year");
  const [fromDate,   setFromDate]   = useState(yearStart());
  const [toDate,     setToDate]     = useState(today());
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [statusOnly, setStatusOnly] = useState<"all" | "completed">("completed");
  const [agentSearch,setAgentSearch]= useState("");
  const [sortKey,    setSortKey]    = useState<SortKey>("revenue");
  const [sortAsc,    setSortAsc]    = useState(false);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "month") { setFromDate(monthStart()); setToDate(today()); }
    else if (p === "year") { setFromDate(yearStart()); setToDate(today()); }
    else if (p === "all") { setFromDate("2000-01-01"); setToDate("2099-12-31"); }
  };

  // ── Reference data ─────────────────────────────────────────────────────────
  const areas   = useMemo(() => getAreas(),       []);
  const cities  = useMemo(() => getCities(),      []);
  const agents  = useMemo(() => getSalesAgents(), []);

  const areaOptions = useMemo(() => {
    const names = new Set<string>();
    agents.forEach(a => { if (a.area) names.add(a.area); });
    return Array.from(names).sort();
  }, [agents]);

  const cityName = (cityId: string) => cities.find(c => c.id === cityId)?.name ?? cityId;

  // ── Sales data ─────────────────────────────────────────────────────────────
  const allSales = useMemo(() => getSales(), []);

  const periodSales = useMemo(() => {
    return allSales.filter(s => {
      const d = s.saleDate.slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      if (statusOnly === "completed" && s.status !== "Completed") return false;
      return true;
    });
  }, [allSales, fromDate, toDate, statusOnly]);

  // ── Per-agent rows ─────────────────────────────────────────────────────────
  const rows: AgentRow[] = useMemo(() => {
    // Build a map agentId → sales
    const salesByAgent = new Map<string, Sale[]>();

    periodSales.forEach(s => {
      if (!s.agentId) return;
      const arr = salesByAgent.get(s.agentId) ?? [];
      arr.push(s);
      salesByAgent.set(s.agentId, arr);
    });

    // Also capture unassigned sales (no agentId) under a synthetic entry later
    return agents.map(agent => {
      const agentSales = salesByAgent.get(agent.id) ?? [];
      const revenue    = agentSales.reduce((s, sale) => s + saleGrandTotal(sale), 0);
      const numSales   = agentSales.length;
      const avgOrder   = numSales > 0 ? revenue / numSales : 0;
      const rate       = parseFloat(agent.commissionRate || "0") || 0;
      const commission = revenue * (rate / 100);
      const target     = parseFloat(agent.targetAmount || "0") || 0;
      const achievement= target > 0 ? (revenue / target) * 100 : 0;
      return { agent, numSales, revenue, avgOrder, commission, target, achievement };
    });
  }, [agents, periodSales]);

  // ── Filtering & sorting ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = rows;
    if (areaFilter !== "all") r = r.filter(row => row.agent.area === areaFilter);
    if (agentSearch.trim()) {
      const q = agentSearch.toLowerCase();
      r = r.filter(row =>
        row.agent.name.toLowerCase().includes(q) ||
        row.agent.agentCode.toLowerCase().includes(q) ||
        (row.agent.area ?? "").toLowerCase().includes(q)
      );
    }
    return [...r].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "name":        va = a.agent.name; vb = b.agent.name; break;
        case "area":        va = a.agent.area ?? ""; vb = b.agent.area ?? ""; break;
        case "sales":       va = a.numSales;    vb = b.numSales; break;
        case "revenue":     va = a.revenue;     vb = b.revenue; break;
        case "avgOrder":    va = a.avgOrder;    vb = b.avgOrder; break;
        case "commission":  va = a.commission;  vb = b.commission; break;
        case "target":      va = a.target;      vb = b.target; break;
        case "achievement": va = a.achievement; vb = b.achievement; break;
        default:            va = a.revenue;     vb = b.revenue;
      }
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, areaFilter, agentSearch, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  // ── KPI summary ────────────────────────────────────────────────────────────
  const totalRevenue    = filtered.reduce((s, r) => s + r.revenue,    0);
  const totalSalesCount = filtered.reduce((s, r) => s + r.numSales,   0);
  const totalCommission = filtered.reduce((s, r) => s + r.commission, 0);
  const topAgent        = [...filtered].sort((a, b) => b.revenue - a.revenue)[0];
  const maxRevenue      = topAgent?.revenue ?? 0;

  const activeAgents    = filtered.filter(r => r.numSales > 0).length;

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["Rank","Agent","Code","Area","City","# Sales","Revenue","Avg Order","Commission Rate %","Commission Earned","Target","Achievement %"];
    const csvRows = filtered.map((r, i) => [
      i + 1, r.agent.name, r.agent.agentCode, r.agent.area ?? "",
      r.agent.city ?? "", r.numSales,
      r.revenue.toFixed(2), r.avgOrder.toFixed(2),
      r.agent.commissionRate,
      r.commission.toFixed(2), r.target.toFixed(2),
      r.achievement.toFixed(1) + "%",
    ]);
    const content = [headers, ...csvRows].map(row => row.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `agent-performance-${fromDate}-to-${toDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Sort icon ──────────────────────────────────────────────────────────────
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc ? <ChevronUp size={11} className="inline" /> : <ChevronDownIcon size={11} className="inline" />
      : <Minus size={10} className="inline opacity-20" />;

  // ── Achievement badge ──────────────────────────────────────────────────────
  const achieveBadge = (pct: number, hasTarget: boolean) => {
    if (!hasTarget) return <span className="text-[11px] text-muted-foreground">No target</span>;
    const cls = pct >= 100
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
      : pct >= 75
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
      : "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400";
    return (
      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
        {pct >= 100 ? "✓ " : ""}{pct.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <Award size={20} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Agent Performance Report</h1>
            <p className="text-[13px] text-muted-foreground">Sales by agent with commission & target tracking</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={() => window.print()}>
            <Printer size={13} /> Print
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={exportCSV}>
            <Download size={13} /> Export CSV
          </Button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date presets */}
          <div className="flex rounded-lg border border-border overflow-hidden text-[12px] h-8">
            {(["month","year","all","custom"] as Preset[]).map(p => (
              <button key={p} onClick={() => applyPreset(p)}
                className={`px-3 capitalize transition-colors ${preset === p
                  ? "bg-indigo-500 text-white font-semibold"
                  : "hover:bg-muted text-muted-foreground"}`}>
                {p === "month" ? "This Month" : p === "year" ? "This Year" : p === "all" ? "All Time" : "Custom"}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5 h-8">
            <Calendar size={13} className="text-muted-foreground" />
            <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPreset("custom"); }}
              className="h-8 text-[12px] w-36" />
            <span className="text-muted-foreground text-[12px]">to</span>
            <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPreset("custom"); }}
              className="h-8 text-[12px] w-36" />
          </div>

          {/* Area filter */}
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
            className="h-8 text-[12px] px-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[140px]">
            <option value="all">All Areas</option>
            {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Status filter */}
          <div className="flex rounded-lg border border-border overflow-hidden text-[12px] h-8">
            {(["completed","all"] as const).map(s => (
              <button key={s} onClick={() => setStatusOnly(s)}
                className={`px-3 capitalize transition-colors ${statusOnly === s
                  ? "bg-emerald-500 text-white font-semibold"
                  : "hover:bg-muted text-muted-foreground"}`}>
                {s === "completed" ? "Completed Only" : "All Sales"}
              </button>
            ))}
          </div>

          {/* Agent search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input placeholder="Search agent…" value={agentSearch} onChange={e => setAgentSearch(e.target.value)}
              className="pl-8 h-8 text-[12px]" />
          </div>
        </div>

        {/* Area chips row */}
        {areaOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setAreaFilter("all")}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all
                ${areaFilter === "all"
                  ? "bg-indigo-500 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"}`}>
              All Areas
            </button>
            {areaOptions.map(a => (
              <button key={a} onClick={() => setAreaFilter(areaFilter === a ? "all" : a)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all
                  ${areaFilter === a
                    ? "bg-violet-500 text-white"
                    : "bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100"}`}>
                {a}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Revenue */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total Revenue</span>
            <TrendingUp size={15} className="text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(totalRevenue, sym)}</div>
          <div className="text-[11px] text-muted-foreground">{totalSalesCount} sale{totalSalesCount !== 1 ? "s" : ""} in period</div>
        </div>

        {/* Active Agents */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Active Agents</span>
            <Users2 size={15} className="text-blue-500" />
          </div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{activeAgents} <span className="text-sm font-normal text-muted-foreground">/ {filtered.length}</span></div>
          <div className="text-[11px] text-muted-foreground">with at least 1 sale</div>
        </div>

        {/* Total Commission */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total Commission</span>
            <Target size={15} className="text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{fmt(totalCommission, sym)}</div>
          <div className="text-[11px] text-muted-foreground">across all agents</div>
        </div>

        {/* Top Performer */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Top Performer</span>
            <Medal size={15} className="text-yellow-500" />
          </div>
          {topAgent && topAgent.numSales > 0 ? (
            <>
              <div className="text-sm font-bold text-foreground truncate">{topAgent.agent.name}</div>
              <div className="text-[11px] text-muted-foreground">{fmt(topAgent.revenue, sym)} · {topAgent.numSales} sales</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No sales in period</div>
          )}
        </div>
      </div>

      {/* ── Bar chart (mini visual) ─────────────────────────────────────────── */}
      {filtered.filter(r => r.numSales > 0).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={15} className="text-indigo-500" />
            <h2 className="text-[13px] font-semibold text-foreground">Revenue by Agent</h2>
            <span className="text-[11px] text-muted-foreground ml-1">(top 10)</span>
          </div>
          <div className="space-y-2">
            {[...filtered]
              .filter(r => r.numSales > 0)
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 10)
              .map((r, i) => {
                const pct = maxRevenue > 0 ? (r.revenue / maxRevenue) * 100 : 0;
                const barColor = i === 0
                  ? "bg-gradient-to-r from-violet-500 to-indigo-500"
                  : i === 1
                  ? "bg-gradient-to-r from-indigo-400 to-blue-400"
                  : i === 2
                  ? "bg-gradient-to-r from-blue-400 to-cyan-400"
                  : "bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500";
                return (
                  <div key={r.agent.id} className="flex items-center gap-3">
                    <div className="w-5 text-[11px] text-muted-foreground text-right shrink-0">{i + 1}</div>
                    <div className="w-28 text-[12px] font-medium text-foreground truncate shrink-0">{r.agent.name}</div>
                    <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-28 text-[12px] font-semibold tabular-nums text-right shrink-0 text-foreground">{fmt(r.revenue, sym)}</div>
                    {r.agent.area && (
                      <div className="w-24 text-[11px] text-muted-foreground truncate shrink-0">{r.agent.area}</div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Performance Table ───────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
            <Star size={14} className="text-amber-500" />
            Agent Breakdown
            <span className="text-[11px] text-muted-foreground font-normal ml-1">{filtered.length} agent{filtered.length !== 1 ? "s" : ""}</span>
          </h2>
          <div className="text-[11px] text-muted-foreground">
            {fromDate} → {toDate}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-50 dark:bg-muted/40 border-b border-border">
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground w-10">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("name")}>
                  Agent <SortIcon k="name" />
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("area")}>
                  Area <SortIcon k="area" />
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("sales")}>
                  Sales <SortIcon k="sales" />
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("revenue")}>
                  Revenue <SortIcon k="revenue" />
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("avgOrder")}>
                  Avg Order <SortIcon k="avgOrder" />
                </th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Rate %</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("commission")}>
                  Commission <SortIcon k="commission" />
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("target")}>
                  Target <SortIcon k="target" />
                </th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort("achievement")}>
                  Achievement <SortIcon k="achievement" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-muted-foreground">
                    No agents match your filters.
                  </td>
                </tr>
              ) : filtered.map((r, i) => {
                const isTop    = i === 0 && r.numSales > 0 && !sortAsc;
                const hasTarget = r.target > 0;
                const achPct   = r.achievement;
                return (
                  <tr key={r.agent.id}
                    className={`border-b border-gray-100 dark:border-border transition-colors hover:bg-blue-50/20 dark:hover:bg-blue-950/10
                      ${isTop ? "bg-amber-50/40 dark:bg-amber-950/10" : i % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"}`}>

                    <td className="px-3 py-2.5 text-muted-foreground font-mono">
                      {i === 0 && r.numSales > 0 && !sortAsc
                        ? <span title="Top performer" className="text-amber-500">🥇</span>
                        : i === 1 && r.numSales > 0 && !sortAsc
                        ? <span title="2nd place" className="text-gray-400">🥈</span>
                        : i === 2 && r.numSales > 0 && !sortAsc
                        ? <span title="3rd place" className="text-amber-700">🥉</span>
                        : <span className="text-[11px]">{i + 1}</span>}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-foreground truncate max-w-[160px]">{r.agent.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{r.agent.agentCode}</div>
                    </td>

                    <td className="px-3 py-2.5">
                      {r.agent.area ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">
                          {r.agent.area}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      {r.numSales > 0
                        ? <span className="font-semibold text-foreground">{r.numSales}</span>
                        : <span className="text-muted-foreground/50">0</span>}
                    </td>

                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {r.revenue > 0
                        ? <span className="text-emerald-600 dark:text-emerald-400">{fmt(r.revenue, sym)}</span>
                        : <span className="text-muted-foreground/50">—</span>}
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.avgOrder > 0 ? fmt(r.avgOrder, sym) : "—"}
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold">
                        {r.agent.commissionRate || "0"}%
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.commission > 0
                        ? <span className="text-amber-600 dark:text-amber-400 font-semibold">{fmt(r.commission, sym)}</span>
                        : <span className="text-muted-foreground/50">—</span>}
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {hasTarget ? fmt(r.target, sym) : <span className="text-muted-foreground/40">—</span>}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-center gap-1">
                        {achieveBadge(achPct, hasTarget)}
                        {hasTarget && (
                          <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${achPct >= 100 ? "bg-emerald-500" : achPct >= 75 ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${Math.min(achPct, 100)}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 1 && (
              <tfoot>
                <tr className="bg-gray-50 dark:bg-muted/40 border-t-2 border-border font-semibold">
                  <td colSpan={3} className="px-3 py-2.5 text-foreground">Total / Average</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{totalSalesCount}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(totalRevenue, sym)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {totalSalesCount > 0 ? fmt(totalRevenue / totalSalesCount, sym) : "—"}
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400 tabular-nums">{fmt(totalCommission, sym)}</td>
                  <td colSpan={2} className="px-3 py-2.5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}
