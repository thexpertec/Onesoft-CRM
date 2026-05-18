import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  getCustomers, getWalletLedger,
  type Customer, type WalletTransaction, type WalletTxType,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import {
  Wallet, Search, Printer, ExternalLink, TrendingUp, TrendingDown,
  Users, RefreshCw, ArrowUpRight, ArrowDownLeft, X, Calendar,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const today      = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const fmtDate    = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const TX_LABEL: Record<WalletTxType, string> = {
  "funded":        "Funded",
  "used":          "Used",
  "manual-credit": "Manual Credit",
  "manual-debit":  "Manual Debit",
  "refund":        "Refund",
};

// ─── Row type ─────────────────────────────────────────────────────────────────
type WalletRow = {
  customer:     Customer;
  balance:      number;
  totalCredit:  number;
  totalDebit:   number;
  txCount:      number;
  lastTxDate:   string | null;
  lastTxType:   WalletTxType | null;
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WalletReportPage() {
  const [, navigate] = useLocation();
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();
  const fmt = (n: number) => `${sym}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

  const [search,     setSearch]     = useState("");
  const [dateFrom,   setDateFrom]   = useState(monthStart());
  const [dateTo,     setDateTo]     = useState(today());
  const [showAll,    setShowAll]    = useState(false); // false = only customers with balance > 0

  // Build per-customer wallet rows
  const allRows: WalletRow[] = useMemo(() => {
    const customers = getCustomers();
    return customers.map(c => {
      const txs = getWalletLedger(c.id);
      const periodTxs = txs.filter(t => t.date >= dateFrom && t.date <= dateTo);
      const credit  = txs.filter(t => t.delta > 0).reduce((s, t) => s + t.delta, 0);
      const debit   = txs.filter(t => t.delta < 0).reduce((s, t) => s + Math.abs(t.delta), 0);
      const last    = txs.length > 0 ? txs[txs.length - 1] : null;
      return {
        customer:    c,
        balance:     Math.max(0, c.advanceCredit ?? 0),
        totalCredit: credit,
        totalDebit:  debit,
        txCount:     periodTxs.length,
        lastTxDate:  last?.date ?? null,
        lastTxType:  last?.type ?? null,
      };
    });
  }, [dateFrom, dateTo]);

  // Filter rows
  const rows = useMemo(() => {
    let r = showAll ? allRows : allRows.filter(r => r.balance > 0.005 || r.totalCredit > 0.005);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(r =>
        r.customer.name.toLowerCase().includes(q) ||
        (r.customer.company ?? "").toLowerCase().includes(q) ||
        (r.customer.email ?? "").toLowerCase().includes(q)
      );
    }
    return r.sort((a, b) => b.balance - a.balance);
  }, [allRows, search, showAll]);

  // Summary KPIs (all customers, all time)
  const kpis = useMemo(() => {
    const totalBalance = allRows.reduce((s, r) => s + r.balance, 0);
    const withBalance  = allRows.filter(r => r.balance > 0.005).length;
    const totalCredit  = allRows.reduce((s, r) => s + r.totalCredit, 0);
    const totalDebit   = allRows.reduce((s, r) => s + r.totalDebit, 0);
    return { totalBalance, withBalance, totalCredit, totalDebit };
  }, [allRows]);

  const handlePrint = () => {
    const rowsHtml = rows.map(r => `
      <tr>
        <td>${r.customer.name}${r.customer.company ? `<br><small style="color:#6b7280">${r.customer.company}</small>` : ""}</td>
        <td style="text-align:right;font-weight:700;color:${r.balance > 0 ? "#1d4ed8" : "#374151"}">${sym}${r.balance.toFixed(dp)}</td>
        <td style="text-align:right;color:#059669">${sym}${r.totalCredit.toFixed(dp)}</td>
        <td style="text-align:right;color:#dc2626">${sym}${r.totalDebit.toFixed(dp)}</td>
        <td style="text-align:center">${r.txCount}</td>
        <td>${r.lastTxDate ? fmtDate(r.lastTxDate) : "—"}${r.lastTxType ? `<br><small style="color:#6b7280">${TX_LABEL[r.lastTxType]}</small>` : ""}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><title>Customer Wallet Report</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;font-size:13px}
        h1{font-size:18px;margin:0 0 4px}p{margin:0;color:#555}
        .kpis{display:flex;gap:24px;margin:16px 0;padding:12px 16px;background:#f9fafb;border-radius:8px}
        .kpis div{display:flex;flex-direction:column}
        .kpis .label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
        .kpis .value{font-size:15px;font-weight:700}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th{background:#f3f4f6;text-align:left;padding:8px 10px;border-bottom:2px solid #d1d5db;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
        td{padding:7px 10px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
        @media print{@page{margin:20mm}}
      </style></head><body>
      <h1>Customer Wallet / Advance Credit Report</h1>
      <p style="font-size:11px;color:#9ca3af;margin-top:4px">Period: ${fmtDate(dateFrom)} – ${fmtDate(dateTo)} · Printed ${fmtDate(today())}</p>
      <div class="kpis">
        <div><span class="label">Total Wallet Funds</span><span class="value" style="color:#1d4ed8">${sym}${kpis.totalBalance.toFixed(dp)}</span></div>
        <div><span class="label">Customers with Balance</span><span class="value">${kpis.withBalance}</span></div>
        <div><span class="label">Total Credited (all time)</span><span class="value" style="color:#059669">${sym}${kpis.totalCredit.toFixed(dp)}</span></div>
        <div><span class="label">Total Debited (all time)</span><span class="value" style="color:#dc2626">${sym}${kpis.totalDebit.toFixed(dp)}</span></div>
      </div>
      <table><thead><tr>
        <th>Customer</th><th style="text-align:right">Balance</th>
        <th style="text-align:right">Total Credited</th><th style="text-align:right">Total Debited</th>
        <th style="text-align:center">Txns (period)</th><th>Last Transaction</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-border bg-white dark:bg-card">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow">
          <Wallet size={17} className="text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-bold text-gray-900 dark:text-foreground">Customer Wallet Report</h1>
          <p className="text-[12px] text-muted-foreground">Advance credit balances & transaction summary</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowAll(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-semibold transition-colors ${
              showAll
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
            }`}>
            <Users size={13}/> {showAll ? "All Customers" : "With Balance Only"}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-[12px] font-semibold transition-colors">
            <Printer size={13}/> Print
          </button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-4 gap-4 px-5 py-4 border-b border-gray-100 dark:border-border">
        <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Wallet size={16} className="text-white"/>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Total Wallet Funds</p>
            <p className="text-[18px] font-black text-blue-700 dark:text-blue-300 font-mono tabular-nums leading-tight">{fmt(kpis.totalBalance)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <Users size={16} className="text-white"/>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Customers w/ Balance</p>
            <p className="text-[18px] font-black text-indigo-700 dark:text-indigo-300 font-mono tabular-nums leading-tight">{kpis.withBalance}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp size={16} className="text-white"/>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Credited</p>
            <p className="text-[18px] font-black text-emerald-700 dark:text-emerald-300 font-mono tabular-nums leading-tight">{fmt(kpis.totalCredit)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-rose-600 flex items-center justify-center shrink-0">
            <TrendingDown size={16} className="text-white"/>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Debited</p>
            <p className="text-[18px] font-black text-rose-700 dark:text-rose-300 font-mono tabular-nums leading-tight">{fmt(kpis.totalDebit)}</p>
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-border bg-white dark:bg-card">
        <Calendar size={13} className="text-gray-400 shrink-0"/>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-8 px-2.5 text-[12px] rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
          <span className="text-[12px] text-muted-foreground">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-8 px-2.5 text-[12px] rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, company…"
            className="w-full h-8 pl-8 pr-8 text-[12px] rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12}/>
            </button>
          )}
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">{rows.length} customer{rows.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Wallet size={36} className="text-gray-200 dark:text-zinc-700"/>
            <p className="text-[13px]">
              {showAll ? "No customers found." : "No customers have a wallet balance."}
            </p>
            {!showAll && (
              <button onClick={() => setShowAll(true)} className="text-blue-500 hover:underline text-[12px]">
                Show all customers
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                {[
                  { label: "Customer",             align: "left"  },
                  { label: "Current Balance",       align: "right" },
                  { label: "Total Credited",        align: "right" },
                  { label: "Total Debited",         align: "right" },
                  { label: "Txns (period)",         align: "center"},
                  { label: "Last Transaction",      align: "left"  },
                  { label: "",                      align: "right" },
                ].map((h, i) => (
                  <th key={i} className={`border-b border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide px-4 py-2.5 text-${h.align}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const hasBalance = row.balance > 0.005;
                return (
                  <tr key={row.customer.id}
                    className="border-b border-gray-100 dark:border-border hover:bg-gray-50/60 dark:hover:bg-muted/30 transition-colors group">

                    {/* Customer */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 text-white text-[11px] font-bold">
                          {row.customer.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-gray-200 leading-tight">{row.customer.name}</p>
                          {row.customer.company && (
                            <p className="text-[11px] text-muted-foreground">{row.customer.company}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Balance */}
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[15px] font-black font-mono tabular-nums ${hasBalance ? "text-blue-700 dark:text-blue-400" : "text-gray-400 dark:text-zinc-600"}`}>
                        {fmt(row.balance)}
                      </span>
                    </td>

                    {/* Total Credited */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowUpRight size={11} className="text-emerald-500 shrink-0"/>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">{fmt(row.totalCredit)}</span>
                      </div>
                    </td>

                    {/* Total Debited */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowDownLeft size={11} className="text-rose-500 shrink-0"/>
                        <span className="font-semibold text-rose-700 dark:text-rose-400 font-mono tabular-nums">{fmt(row.totalDebit)}</span>
                      </div>
                    </td>

                    {/* Txns */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-[11px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                        {row.txCount}
                      </span>
                    </td>

                    {/* Last Tx */}
                    <td className="px-4 py-3">
                      {row.lastTxDate ? (
                        <div>
                          <p className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{fmtDate(row.lastTxDate)}</p>
                          {row.lastTxType && (
                            <p className="text-[10px] text-muted-foreground">{TX_LABEL[row.lastTxType]}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[12px]">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/customers/${row.customer.id}/wallet`)}
                        className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-[11px] font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors opacity-0 group-hover:opacity-100">
                        <ExternalLink size={11}/>
                        Statement
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer totals */}
            {rows.length > 1 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-border bg-gray-50/80 dark:bg-muted/40">
                  <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-muted-foreground">
                    Total ({rows.length} customers)
                  </td>
                  <td className="px-4 py-3 text-right font-black text-[14px] text-blue-700 dark:text-blue-400 font-mono tabular-nums">
                    {fmt(rows.reduce((s, r) => s + r.balance, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                    {fmt(rows.reduce((s, r) => s + r.totalCredit, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-rose-700 dark:text-rose-400 font-mono tabular-nums">
                    {fmt(rows.reduce((s, r) => s + r.totalDebit, 0))}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-gray-600 dark:text-zinc-300">
                    {rows.reduce((s, r) => s + r.txCount, 0)}
                  </td>
                  <td colSpan={2}/>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
