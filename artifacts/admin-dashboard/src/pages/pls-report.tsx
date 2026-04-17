import { useState, useMemo } from "react";
import { useAccounts, useJournalEntries } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { Account, getSettings, reconcileAccountingData } from "@/lib/store";
import {
  TrendingUp, TrendingDown, Minus, Printer, FileDown, RefreshCw,
  Calendar, ChevronRight, ChevronDown, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

type JeMap = Record<string, { dr: number; cr: number }>;

type PnlNode = {
  id:         string;
  code:       string;
  name:       string;
  type:       "group" | "ledger";
  depth:      number;
  amount:     number;       // net amount in the head's normal direction (always ≥ 0 is natural)
  children:   PnlNode[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today():      string { return new Date().toISOString().slice(0, 10); }
function yearStart():  string { const d = new Date(); d.setMonth(0, 1); return d.toISOString().slice(0, 10); }

function fmtN(n: number): string {
  return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSym(n: number, sym: string): string {
  return `${sym} ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

/**
 * Recursively compute the net P&L amount for a node (group or ledger).
 * Revenue accounts: net = cr - dr  (credit-normal: credits increase revenue)
 * Expense accounts: net = dr - cr  (debit-normal: debits increase expense)
 */
function nodeAmount(
  accounts: Account[],
  id: string,
  jeMap: JeMap,
  isExpense: boolean,
): number {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return 0;
  if (acc.accountType === "Ledger") {
    const je = jeMap[id] ?? { dr: 0, cr: 0 };
    return isExpense ? je.dr - je.cr : je.cr - je.dr;
  }
  return accounts
    .filter(a => (a.parentId ?? null) === id)
    .reduce((s, c) => s + nodeAmount(accounts, c.id, jeMap, isExpense), 0);
}

function buildTree(
  accounts: Account[],
  parentId: string | null,
  head: "Revenue / Income" | "Expense",
  jeMap: JeMap,
  depth: number,
): PnlNode[] {
  const isExpense = head === "Expense";
  return accounts
    .filter(a => a.head === head && (a.parentId ?? null) === parentId)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map(acc => {
      const children = acc.accountType === "Group"
        ? buildTree(accounts, acc.id, head, jeMap, depth + 1)
        : [];
      const amount = nodeAmount(accounts, acc.id, jeMap, isExpense);
      return {
        id: acc.id, code: acc.code, name: acc.name,
        type: acc.accountType === "Group" ? "group" : "ledger",
        depth, amount, children,
      };
    });
}

/** Flatten tree for display, skipping zero-amount groups that have no active children (optional). */
function flattenTree(nodes: PnlNode[], showZero: boolean): PnlNode[] {
  const result: PnlNode[] = [];
  for (const n of nodes) {
    if (!showZero && n.amount === 0 && n.children.length === 0) continue;
    result.push(n);
    if (n.children.length > 0) {
      result.push(...flattenTree(n.children, showZero));
    }
  }
  return result;
}

// ─── Section component ────────────────────────────────────────────────────────

function Section({
  title,
  color,
  icon: Icon,
  nodes,
  total,
  sym,
  showZero,
  collapsed,
  onToggle,
}: {
  title: string;
  color: string;
  icon: React.ElementType;
  nodes: PnlNode[];
  total: number;
  sym: string;
  showZero: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const flat = useMemo(() => flattenTree(nodes, showZero), [nodes, showZero]);

  return (
    <div className="rounded-xl border border-border overflow-hidden mb-4">
      {/* Section header */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 py-3.5 ${color} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2.5">
          <Icon size={16} />
          <span className="text-[14px] font-bold">{title}</span>
          <span className="text-[11px] opacity-70">({flat.length} accounts)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-bold tabular-nums">{fmtSym(total, sym)}</span>
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {/* Rows */}
      {!collapsed && (
        <div>
          {flat.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No activity in selected period
            </div>
          )}
          {flat.map(n => (
            <div
              key={n.id}
              className={`flex items-center justify-between border-b border-border/50 last:border-0
                ${n.type === "group" ? "bg-muted/20" : "hover:bg-muted/10"} transition-colors`}
              style={{ paddingLeft: `${20 + n.depth * 20}px`, paddingRight: "20px", paddingTop: "9px", paddingBottom: "9px" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {n.type === "group" ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                )}
                <span className={`font-mono text-[11px] text-muted-foreground w-[54px] flex-shrink-0`}>{n.code}</span>
                <span className={`text-sm truncate ${n.type === "group" ? "font-semibold text-foreground" : "text-foreground"}`}>
                  {n.name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {n.type === "group" ? (
                  <span className="text-[12px] font-bold text-foreground tabular-nums">{fmtN(n.amount)}</span>
                ) : (
                  <span className={`text-[13px] font-semibold tabular-nums
                    ${n.amount < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                    {n.amount < 0 ? `(${fmtN(n.amount)})` : fmtN(n.amount)}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Subtotal bar */}
          <div className={`flex justify-between items-center px-5 py-3 ${color} opacity-90`}>
            <span className="text-[12px] font-bold">Total {title}</span>
            <span className="text-[14px] font-bold tabular-nums">{fmtSym(total, sym)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlsReportPage() {
  const { accounts, refresh: refreshAccounts } = useAccounts();
  const { entries,  refresh: refreshEntries  } = useJournalEntries();
  const { toast } = useToast();
  const sym = useMemo(() => getSettingsCurrencySymbol(), []);

  const [from,         setFrom]         = useState(yearStart());
  const [to,           setTo]           = useState(today());
  const [statusFilter, setStatusFilter] = useState<"all" | "posted" | "draft">("posted");
  const [showZero,     setShowZero]     = useState(false);
  const [colRevenue,   setColRevenue]   = useState(false);
  const [colExpense,   setColExpense]   = useState(false);
  const [reconciling,  setReconciling]  = useState(false);

  function handleReconcile() {
    setReconciling(true);
    try {
      const result = reconcileAccountingData();
      refreshAccounts();
      refreshEntries();
      const added = result.accountsAdded;
      toast({
        title: "Reconciliation complete",
        description: added > 0
          ? `${added} system account${added !== 1 ? "s" : ""} added and accounting mappings verified.`
          : "Chart of Accounts is up to date — no changes needed.",
      });
    } finally {
      setReconciling(false);
    }
  }

  // ── Build JE map for the selected period ────────────────────────────────────
  const jeMap = useMemo((): JeMap => {
    const map: JeMap = {};
    entries
      .filter(e => {
        const statusOk =
          statusFilter === "all"    ? true :
          statusFilter === "posted" ? e.status === "posted" :
          e.status === "draft";
        return statusOk && e.date >= from && e.date <= to;
      })
      .forEach(e => {
        e.lines.forEach(l => {
          if (!map[l.ledgerId]) map[l.ledgerId] = { dr: 0, cr: 0 };
          map[l.ledgerId].dr += l.debit;
          map[l.ledgerId].cr += l.credit;
        });
      });
    return map;
  }, [entries, from, to, statusFilter]);

  // ── Build P&L trees ─────────────────────────────────────────────────────────
  const revenueTree = useMemo(
    () => buildTree(accounts, null, "Revenue / Income", jeMap, 0),
    [accounts, jeMap],
  );
  const expenseTree = useMemo(
    () => buildTree(accounts, null, "Expense", jeMap, 0),
    [accounts, jeMap],
  );

  const totalRevenue  = useMemo(() => revenueTree.reduce((s, n) => s + n.amount, 0), [revenueTree]);
  const totalExpenses = useMemo(() => expenseTree.reduce((s, n) => s + n.amount, 0), [expenseTree]);
  const netProfit     = totalRevenue - totalExpenses;
  const isProfitable  = netProfit >= 0;

  // ── Print / PDF ─────────────────────────────────────────────────────────────

  function handlePrint() {
    const s = getSettings();
    const generatedAt = new Date().toLocaleString();

    const addrParts  = [s.addressHull, s.addressIslamabad].filter(Boolean).join(" & ");
    const phoneParts = [s.phoneHull,   s.phoneIslamabad  ].filter(Boolean).join(" / ");
    const locationLine = [addrParts, phoneParts].filter(Boolean).join(" | ");

    // ── Build table rows for a section ──
    function buildSectionRows(nodes: PnlNode[], isExpense: boolean): string {
      const flat = flattenTree(nodes, true);
      if (flat.length === 0) {
        return `<tr><td colspan="3" style="text-align:center;color:#9ca3af;padding:16px;">No activity in selected period</td></tr>`;
      }
      return flat.map(n => {
        const indent = n.depth * 20;
        const isNeg  = n.amount < 0;
        const dispAmt = n.amount === 0 ? "—" : (isNeg ? `(${fmtN(n.amount)})` : fmtN(n.amount));
        return `
          <tr class="${n.type === "group" ? "group-row" : "ledger-row"}">
            <td style="padding-left:${14 + indent}px;" class="code-col">${n.code}</td>
            <td style="padding-left:${8 + indent}px;">${n.name}</td>
            <td class="num ${isNeg ? "neg-amt" : ""}">${dispAmt}</td>
          </tr>`;
      }).join("");
    }

    const revRows = buildSectionRows(revenueTree, false);
    const expRows = buildSectionRows(expenseTree, true);

    const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <title>P&amp;L Statement – ${s.companyName || "Onesoft"}</title>
  <style>
    @page { size: A4; margin: 14mm 15mm 18mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }

    /* Header */
    .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 12px; border-bottom: 2.5px solid #059669; margin-bottom: 14px; }
    .company { font-size: 18px; font-weight: 800; color: #059669; letter-spacing: -0.5px; }
    .company-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 15px; font-weight: 700; color: #111; }
    .doc-title .period { font-size: 10px; color: #6b7280; margin-top: 4px; }
    .doc-title .printed { font-size: 9px; color: #9ca3af; margin-top: 2px; }

    /* Period info */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .info-block { padding: 9px 12px; }
    .info-block:not(:last-child) { border-right: 1px solid #e5e7eb; }
    .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; margin-bottom: 3px; }
    .info-value { font-size: 12px; font-weight: 700; color: #111; }
    .info-sub   { font-size: 10px; color: #6b7280; margin-top: 1px; }

    /* Tables */
    .section { margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .section-head { padding: 9px 14px; display: flex; justify-content: space-between; font-weight: 800; font-size: 12px; }
    .section-head.rev { background: #ecfdf5; color: #065f46; border-bottom: 1px solid #bbf7d0; }
    .section-head.exp { background: #fff7ed; color: #9a3412; border-bottom: 1px solid #fed7aa; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .code-col { width: 70px; color: #6b7280; font-family: 'Courier New', monospace; font-size: 10px; }
    td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .ledger-row td { color: #111; }
    .ledger-row:nth-child(even) td { background: #f9fafb; }
    .group-row td { font-weight: 700; background: #f3f4f6 !important; color: #374151; }
    .neg-amt { color: #dc2626; }
    .subtotal { background: #f0fdf4 !important; }
    .subtotal-exp { background: #fff7ed !important; }
    .subtotal td { font-weight: 800; border-top: 2px solid #bbf7d0; padding: 8px 10px; }
    .subtotal-exp td { font-weight: 800; border-top: 2px solid #fed7aa; padding: 8px 10px; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0 12px; }
    .s-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 11px 14px; }
    .s-card.rev-card  { border-color: #bbf7d0; background: #f0fdf4; }
    .s-card.exp-card  { border-color: #fed7aa; background: #fff7ed; }
    .s-card.prof-card { border-color: #bfdbfe; background: #eff6ff; }
    .s-card.loss-card { border-color: #fecaca; background: #fff5f5; }
    .s-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 5px; }
    .s-value { font-size: 16px; font-weight: 800; color: #111; }
    .s-rev  { color: #065f46; }
    .s-exp  { color: #9a3412; }
    .s-prof { color: #1e40af; }
    .s-loss { color: #dc2626; }

    /* Net P&L bar */
    .net-bar { border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
    .net-bar.profit { background: #dcfce7; border: 2px solid #16a34a; }
    .net-bar.loss   { background: #fee2e2; border: 2px solid #dc2626; }
    .net-label { font-size: 13px; font-weight: 800; }
    .net-value { font-size: 20px; font-weight: 900; }
    .net-bar.profit .net-label, .net-bar.profit .net-value { color: #15803d; }
    .net-bar.loss   .net-label, .net-bar.loss   .net-value { color: #dc2626; }

    /* Footer */
    .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; }
    .print-bar { display: flex; justify-content: center; gap: 12px; padding: 14px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
    .btn { padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: #059669; color: white; }
    .btn-secondary { background: white; color: #374151; border: 1px solid #d1d5db; }
    @media print {
      .print-bar { display: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn btn-primary" onclick="window.print()">🖨 Print / Save as PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
  </div>

  <div style="padding: 16px 18px;">

    <!-- Header -->
    <div class="header">
      <div>
        <div class="company">${s.companyName || "Onesoft"}</div>
        <div class="company-sub">${locationLine}</div>
      </div>
      <div class="doc-title">
        <h1>Profit &amp; Loss Statement</h1>
        <div class="period">Period: ${from} — ${to}</div>
        <div class="printed">Printed: ${generatedAt}</div>
      </div>
    </div>

    <!-- Period Info -->
    <div class="info-grid">
      <div class="info-block">
        <div class="info-label">Report Period</div>
        <div class="info-value">${from} &rarr; ${to}</div>
      </div>
      <div class="info-block">
        <div class="info-label">Status Filter</div>
        <div class="info-value">${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} entries</div>
      </div>
      <div class="info-block">
        <div class="info-label">Currency</div>
        <div class="info-value">${sym} &nbsp; ${s.currency || "GBP"}</div>
        <div class="info-sub">${s.fiscalYearStart ? `Fiscal year starts: ${s.fiscalYearStart}` : ""}</div>
      </div>
    </div>

    <!-- Revenue Section -->
    <div class="section">
      <div class="section-head rev">
        <span>Revenue / Income</span>
        <span>${fmtSym(totalRevenue, sym)}</span>
      </div>
      <table>
        <thead>
          <tr style="background:#f0fdf4;">
            <th style="width:70px;padding:6px 10px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Code</th>
            <th style="padding:6px 10px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Account</th>
            <th style="width:120px;padding:6px 10px;text-align:right;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">${sym} Amount</th>
          </tr>
        </thead>
        <tbody>
          ${revRows}
          <tr class="subtotal">
            <td class="code-col"></td>
            <td><strong>Total Revenue / Income</strong></td>
            <td class="num"><strong>${fmtN(totalRevenue)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Expense Section -->
    <div class="section">
      <div class="section-head exp">
        <span>Expenses</span>
        <span>${fmtSym(totalExpenses, sym)}</span>
      </div>
      <table>
        <thead>
          <tr style="background:#fff7ed;">
            <th style="width:70px;padding:6px 10px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Code</th>
            <th style="padding:6px 10px;text-align:left;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Account</th>
            <th style="width:120px;padding:6px 10px;text-align:right;font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">${sym} Amount</th>
          </tr>
        </thead>
        <tbody>
          ${expRows}
          <tr class="subtotal-exp">
            <td class="code-col"></td>
            <td><strong>Total Expenses</strong></td>
            <td class="num"><strong>${fmtN(totalExpenses)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Summary cards -->
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:5px;margin-bottom:10px;">Summary</div>
    <div class="summary-grid">
      <div class="s-card rev-card">
        <div class="s-label">Total Revenue</div>
        <div class="s-value s-rev">${fmtSym(totalRevenue, sym)}</div>
      </div>
      <div class="s-card exp-card">
        <div class="s-label">Total Expenses</div>
        <div class="s-value s-exp">${fmtSym(totalExpenses, sym)}</div>
      </div>
      <div class="s-card ${isProfitable ? "prof-card" : "loss-card"}">
        <div class="s-label">Net ${isProfitable ? "Profit" : "Loss"}</div>
        <div class="s-value ${isProfitable ? "s-prof" : "s-loss"}">${fmtSym(netProfit, sym)}</div>
      </div>
    </div>

    <!-- Net P&L bar -->
    <div class="net-bar ${isProfitable ? "profit" : "loss"}">
      <span class="net-label">
        ${isProfitable ? "✓ Net Profit" : "⚠ Net Loss"} &nbsp;·&nbsp; ${from} to ${to}
      </span>
      <span class="net-value">${fmtSym(netProfit, sym)}</span>
    </div>

    <!-- Footer -->
    <div class="footer">
      <span>${s.companyName || "Onesoft"} &nbsp;·&nbsp; Profit &amp; Loss Statement</span>
      <span>All amounts in ${sym} &nbsp;·&nbsp; ${generatedAt}</span>
    </div>

  </div>
</body></html>`;

    const win = window.open("", "_blank", "width=1000,height=820");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const netColor = isProfitable
    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
    : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300";

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <BarChart3 size={15} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-foreground leading-tight">P&L Statement</h1>
            <p className="text-[11px] text-muted-foreground">Profit &amp; Loss · Income &amp; Expenditure</p>
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Calendar size={14} className="text-muted-foreground" />
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-sm w-[140px]" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="h-9 text-sm w-[140px]" />
        </div>

        {/* Status filter */}
        <div className="flex rounded-lg border border-input overflow-hidden text-sm">
          {(["posted", "all", "draft"] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`px-3 h-9 capitalize transition-colors
                ${statusFilter === s
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-background text-muted-foreground hover:bg-muted"}`}
            >{s}</button>
          ))}
        </div>

        {/* Show zero toggle */}
        <button type="button" onClick={() => setShowZero(v => !v)}
          className={`h-9 px-3 rounded-lg border text-sm transition-colors
            ${showZero
              ? "border-primary bg-primary/10 text-primary font-semibold"
              : "border-input bg-background text-muted-foreground hover:bg-muted"}`}
        >
          {showZero ? "Hide zero" : "Show zero"}
        </button>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={handleReconcile}
            disabled={reconciling}
            title="Reconcile COA — reseed system accounts and verify accounting mappings"
            className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/20"
          >
            <RefreshCw size={14} className={reconciling ? "animate-spin" : ""} />
            Reconcile
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer size={14} className="mr-1.5" /> Print
          </Button>
          <Button size="sm" onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <FileDown size={14} className="mr-1.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 py-5">

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Revenue */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Total Revenue</span>
            </div>
            <div className="text-[22px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {fmtSym(totalRevenue, sym)}
            </div>
          </div>

          {/* Expenses */}
          <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingDown size={14} className="text-orange-600 dark:text-orange-400" />
              <span className="text-[11px] font-medium text-orange-700 dark:text-orange-300">Total Expenses</span>
            </div>
            <div className="text-[22px] font-bold text-orange-700 dark:text-orange-300 tabular-nums">
              {fmtSym(totalExpenses, sym)}
            </div>
          </div>

          {/* Net P&L */}
          <div className={`rounded-xl border p-4 ${netColor}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Minus size={14} />
              <span className="text-[11px] font-medium">Net {isProfitable ? "Profit" : "Loss"}</span>
            </div>
            <div className="text-[22px] font-bold tabular-nums">
              {isProfitable ? "" : "("}
              {fmtSym(netProfit, sym)}
              {isProfitable ? "" : ")"}
            </div>
          </div>
        </div>

        {/* Revenue section */}
        <Section
          title="Revenue / Income"
          color="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200"
          icon={TrendingUp}
          nodes={revenueTree}
          total={totalRevenue}
          sym={sym}
          showZero={showZero}
          collapsed={colRevenue}
          onToggle={() => setColRevenue(v => !v)}
        />

        {/* Expense section */}
        <Section
          title="Expenses"
          color="bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-200"
          icon={TrendingDown}
          nodes={expenseTree}
          total={totalExpenses}
          sym={sym}
          showZero={showZero}
          collapsed={colExpense}
          onToggle={() => setColExpense(v => !v)}
        />

        {/* Net P&L bar */}
        <div className={`rounded-xl border-2 p-5 flex items-center justify-between ${netColor}`}>
          <div>
            <div className="text-[12px] font-semibold opacity-70 mb-0.5">Net {isProfitable ? "Profit" : "Loss"}</div>
            <div className="text-[11px] opacity-60">
              {from} → {to} &nbsp;·&nbsp;
              Revenue {fmtSym(totalRevenue, sym)} − Expenses {fmtSym(totalExpenses, sym)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[28px] font-black tabular-nums">
              {isProfitable ? "" : "("}{fmtSym(netProfit, sym)}{isProfitable ? "" : ")"}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
