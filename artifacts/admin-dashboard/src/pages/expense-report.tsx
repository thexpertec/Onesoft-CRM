import { useState, useMemo } from "react";
import { useAccounts, useJournalEntries } from "@/hooks/use-data";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import {
  Receipt, Calendar, Download, Printer, Filter, X,
  TrendingDown, ChevronDown, ChevronRight, Search,
  BarChart3, FileText, Wallet, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today():     string { return new Date().toISOString().slice(0, 10); }
function monthStart():string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

function fmt(n: number, sym: string): string {
  return `${sym} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtN(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

// Colour classes for each account sub-type / code
const CATEGORY_COLORS: Record<string, string> = {
  "4100": "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  "4200": "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  "4300": "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  "4400": "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  "4500": "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  "4600": "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
};
function catColor(code: string): string {
  const root = code.slice(0, 4);
  return CATEGORY_COLORS[root] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseLine = {
  jeId:        string;
  jeRef:       string;
  jeDate:      string;
  jeDesc:      string;
  narration:   string;
  accountId:   string;
  accountName: string;
  accountCode: string;
  amount:      number; // net debit on this expense account
};

type CategorySummary = {
  accountId:   string;
  accountName: string;
  accountCode: string;
  total:       number;
  count:       number;
  lines:       ExpenseLine[];
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExpenseReportPage() {
  const { accounts } = useAccounts();
  const { entries }  = useJournalEntries();
  const sym = useMemo(() => getSettingsCurrencySymbol(), []);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [from,         setFrom]         = useState(monthStart());
  const [to,           setTo]           = useState(today());
  const [catFilter,    setCatFilter]    = useState("__all__");
  const [search,       setSearch]       = useState("");
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // ── Expense account set ────────────────────────────────────────────────────
  const expenseAccounts = useMemo(
    () => accounts.filter(a => a.head === "Expense" && a.accountType === "Ledger"),
    [accounts],
  );
  const expenseAccountIds = useMemo(
    () => new Set(expenseAccounts.map(a => a.id)),
    [expenseAccounts],
  );

  // ── Extract expense lines from journal entries in the date range ───────────
  const allLines = useMemo<ExpenseLine[]>(() => {
    const result: ExpenseLine[] = [];
    for (const je of entries) {
      if (je.status !== "posted") continue;
      if (je.date < from || je.date > to) continue;
      for (const line of je.lines) {
        if (!expenseAccountIds.has(line.ledgerId)) continue;
        const net = line.debit - line.credit; // positive = expense increase
        if (net <= 0) continue;              // skip reversals / zero lines
        const acc = accounts.find(a => a.id === line.ledgerId);
        result.push({
          jeId:        je.id,
          jeRef:       je.reference,
          jeDate:      je.date,
          jeDesc:      je.description,
          narration:   line.narration,
          accountId:   line.ledgerId,
          accountName: acc?.name ?? line.ledgerId,
          accountCode: acc?.code ?? "",
          amount:      net,
        });
      }
    }
    return result.sort((a, b) => b.jeDate.localeCompare(a.jeDate));
  }, [entries, from, to, expenseAccountIds, accounts]);

  // ── Category summaries ─────────────────────────────────────────────────────
  const categories = useMemo<CategorySummary[]>(() => {
    const map = new Map<string, CategorySummary>();
    for (const line of allLines) {
      let cat = map.get(line.accountId);
      if (!cat) {
        cat = {
          accountId:   line.accountId,
          accountName: line.accountName,
          accountCode: line.accountCode,
          total:       0, count: 0, lines: [],
        };
        map.set(line.accountId, cat);
      }
      cat.total += line.amount;
      cat.count += 1;
      cat.lines.push(line);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [allLines]);

  // ── Filtered lines (for detail table) ─────────────────────────────────────
  const filteredLines = useMemo<ExpenseLine[]>(() => {
    const q = search.toLowerCase();
    return allLines.filter(l => {
      if (catFilter !== "__all__" && l.accountId !== catFilter) return false;
      if (q && !l.jeRef.toLowerCase().includes(q) &&
               !l.jeDesc.toLowerCase().includes(q) &&
               !l.narration.toLowerCase().includes(q) &&
               !l.accountName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allLines, catFilter, search]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const grandTotal     = useMemo(() => allLines.reduce((s, l) => s + l.amount, 0), [allLines]);
  const filteredTotal  = useMemo(() => filteredLines.reduce((s, l) => s + l.amount, 0), [filteredLines]);
  const avgTransaction = allLines.length ? grandTotal / allLines.length : 0;

  const toggleCat = (id: string) =>
    setExpandedCats(p => ({ ...p, [id]: !p[id] }));

  // ── Quick-select date ranges ───────────────────────────────────────────────
  const setRange = (preset: string) => {
    const now = new Date();
    const t = now.toISOString().slice(0, 10);
    if (preset === "today") { setFrom(t); setTo(t); return; }
    if (preset === "week") {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      setFrom(d.toISOString().slice(0, 10)); setTo(t); return;
    }
    if (preset === "month") {
      const d = new Date(now); d.setDate(1);
      setFrom(d.toISOString().slice(0, 10)); setTo(t); return;
    }
    if (preset === "quarter") {
      const d = new Date(now); d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
      setFrom(d.toISOString().slice(0, 10)); setTo(t); return;
    }
    if (preset === "year") {
      const d = new Date(now); d.setMonth(0, 1);
      setFrom(d.toISOString().slice(0, 10)); setTo(t); return;
    }
  };

  const handlePrint = () => window.print();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingDown size={20} className="text-rose-500 shrink-0" />
            Expense Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All posted expense transactions grouped by category
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer size={14} /> Print
          </Button>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 print:hidden">
        {/* Date row */}
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={14} className="text-muted-foreground shrink-0" />
          <span className="text-[12px] font-medium text-muted-foreground">Date Range:</span>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-8 w-[140px] text-[13px]" />
          <span className="text-muted-foreground text-xs">to</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-8 w-[140px] text-[13px]" />
          {/* Quick presets */}
          <div className="flex gap-1 flex-wrap">
            {(["today","week","month","quarter","year"] as const).map(p => (
              <button key={p} onClick={() => setRange(p)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-muted hover:bg-muted/80 text-muted-foreground capitalize transition-colors">
                {p === "week" ? "7 Days" : p === "quarter" ? "Quarter" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {/* Second row */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-muted-foreground shrink-0" />
          <span className="text-[12px] font-medium text-muted-foreground">Category:</span>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="h-8 w-[220px] text-[13px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Categories</SelectItem>
              {expenseAccounts
                .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                .map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>
                    <span className="font-mono text-[11px] text-muted-foreground mr-1">{acc.code}</span>
                    {acc.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-[300px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search ref, description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-7 text-[13px]"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>
          {/* Clear all */}
          {(catFilter !== "__all__" || search) && (
            <button onClick={() => { setCatFilter("__all__"); setSearch(""); }}
              className="text-[12px] text-blue-600 dark:text-blue-400 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total Expenses"
          value={fmt(grandTotal, sym)}
          sub={`${from} → ${to}`}
          icon={<TrendingDown size={16} className="text-rose-500" />}
          accent="rose"
        />
        <KpiCard
          label="Transactions"
          value={allLines.length.toString()}
          sub={`${entries.filter(e => e.status === "posted" && e.date >= from && e.date <= to).length} journal entries`}
          icon={<FileText size={16} className="text-blue-500" />}
          accent="blue"
        />
        <KpiCard
          label="Categories Used"
          value={categories.length.toString()}
          sub={`of ${expenseAccounts.length} expense accounts`}
          icon={<BarChart3 size={16} className="text-violet-500" />}
          accent="violet"
        />
        <KpiCard
          label="Avg per Transaction"
          value={fmt(avgTransaction, sym)}
          sub="average expense amount"
          icon={<Wallet size={16} className="text-amber-500" />}
          accent="amber"
        />
      </div>

      {allLines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No expense transactions found</p>
          <p className="text-xs text-muted-foreground mt-1">Adjust the date range or post journal entries with expense accounts</p>
        </div>
      ) : (
        <>
          {/* ── Category breakdown ────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <BarChart3 size={15} className="text-muted-foreground" />
                <span className="text-[13px] font-semibold">Breakdown by Category</span>
              </div>
              <span className="text-[12px] text-muted-foreground">{categories.length} categories</span>
            </div>

            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 border-b border-border bg-muted/10 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Account</span>
              <span className="text-right">Transactions</span>
              <span className="text-right w-28">Amount</span>
              <span className="text-right w-16">Share</span>
            </div>

            {categories.map(cat => {
              const pct = grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0;
              const isExpanded = !!expandedCats[cat.accountId];
              return (
                <div key={cat.accountId}>
                  {/* Category row */}
                  <button
                    onClick={() => toggleCat(cat.accountId)}
                    className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border/50 hover:bg-muted/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isExpanded ? <ChevronDown size={13} className="text-muted-foreground shrink-0" /> : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${catColor(cat.accountCode)}`}>
                        {cat.accountCode}
                      </span>
                      <span className="text-[13px] font-medium text-foreground truncate">{cat.accountName}</span>
                    </div>
                    <span className="text-[12px] text-muted-foreground text-right self-center">{cat.count}</span>
                    <span className="text-[13px] font-semibold text-rose-600 dark:text-rose-400 text-right w-28 tabular-nums self-center">
                      {fmtN(cat.total)}
                    </span>
                    <div className="w-16 flex flex-col items-end gap-1 self-center">
                      <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                        {pct.toFixed(1)}%
                      </span>
                      <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </button>

                  {/* Expanded: sub-transactions */}
                  {isExpanded && (
                    <div className="bg-muted/5 border-b border-border">
                      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-8 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border/30">
                        <span>Date</span><span>Reference / Description</span><span>Narration</span><span className="text-right">Amount</span>
                      </div>
                      {cat.lines.map((ln, i) => (
                        <div key={`${ln.jeId}-${i}`}
                          className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-8 py-2 border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors text-[12px]">
                          <span className="text-muted-foreground tabular-nums whitespace-nowrap font-mono">
                            {fmtDate(ln.jeDate)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{ln.jeRef}</p>
                            {ln.jeDesc && <p className="text-muted-foreground text-[11px] truncate">{ln.jeDesc}</p>}
                          </div>
                          <span className="text-muted-foreground text-[11px] max-w-[140px] truncate text-right">
                            {ln.narration}
                          </span>
                          <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums text-right w-24">
                            {fmtN(ln.amount)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center px-8 py-2 bg-muted/20">
                        <span className="text-[11px] font-bold text-muted-foreground">Subtotal — {cat.accountName}</span>
                        <span className="text-[13px] font-bold text-rose-600 dark:text-rose-400 tabular-nums">{sym} {fmtN(cat.total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Grand total row */}
            <div className="flex justify-between items-center px-5 py-3.5 bg-rose-50 dark:bg-rose-950/30 border-t border-rose-200 dark:border-rose-800">
              <div className="flex items-center gap-2">
                <TrendingDown size={15} className="text-rose-600 dark:text-rose-400" />
                <span className="text-[13px] font-bold text-rose-700 dark:text-rose-300">Grand Total Expenses</span>
              </div>
              <span className="text-[16px] font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {fmt(grandTotal, sym)}
              </span>
            </div>
          </div>

          {/* ── Detailed transactions table ────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 border-b border-border bg-muted/30 gap-2">
              <div className="flex items-center gap-2">
                <Receipt size={15} className="text-muted-foreground" />
                <span className="text-[13px] font-semibold">All Transactions</span>
                {(catFilter !== "__all__" || search) && (
                  <Badge variant="secondary" className="text-[10px]">
                    Filtered: {filteredLines.length}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                {filteredLines.length !== allLines.length && (
                  <span className="text-[12px] text-muted-foreground">
                    Showing {filteredLines.length} of {allLines.length} transactions
                  </span>
                )}
                <span className="text-[13px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {fmt(filteredTotal, sym)}
                </span>
              </div>
            </div>

            {filteredLines.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No transactions match the current filters
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <th className="text-left px-4 py-2.5">Date</th>
                      <th className="text-left px-4 py-2.5">Reference</th>
                      <th className="text-left px-4 py-2.5">Description</th>
                      <th className="text-left px-4 py-2.5">Category</th>
                      <th className="text-left px-4 py-2.5">Narration</th>
                      <th className="text-right px-4 py-2.5">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((ln, i) => (
                      <tr key={`${ln.jeId}-${i}`}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground font-mono whitespace-nowrap">
                          {fmtDate(ln.jeDate)}
                        </td>
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                          {ln.jeRef || <span className="text-muted-foreground italic">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate">
                          {ln.jeDesc || <span className="italic">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${catColor(ln.accountCode)}`}>
                            <span className="font-mono font-bold">{ln.accountCode}</span>
                            <span className="hidden sm:inline">{ln.accountName}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate">
                          {ln.narration || <span className="italic">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400 whitespace-nowrap">
                          {sym} {fmtN(ln.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20">
                      <td colSpan={5} className="px-4 py-3 text-[12px] font-bold text-rose-700 dark:text-rose-300">
                        {catFilter !== "__all__" || search ? "Filtered Total" : "Grand Total"}
                      </td>
                      <td className="px-4 py-3 text-right text-[14px] font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {fmt(filteredTotal, sym)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, accent,
}: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; accent: "rose" | "blue" | "violet" | "amber";
}) {
  const accents = {
    rose:   "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800",
    blue:   "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    violet: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800",
    amber:  "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
  };
  return (
    <div className={`rounded-xl border p-4 ${accents[accent]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="text-[20px] font-bold text-foreground leading-none tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1.5 truncate">{sub}</p>
    </div>
  );
}
