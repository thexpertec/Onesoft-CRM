import { useState, useMemo, useRef } from "react";
import { useAccounts, useJournalEntries } from "@/hooks/use-data";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { Account } from "@/lib/store";
import {
  BookOpen, Printer, Search, ChevronDown,
  TrendingUp, TrendingDown, BarChart3, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }
function monthStart(): string {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number, sym: string): string {
  return `${sym} ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtN(n: number): string {
  return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isDebitNormal(head: string): boolean {
  return head === "Assets" || head === "Expense";
}

function balanceLabel(balance: number, debitNormal: boolean): string {
  if (balance === 0) return "—";
  // Running balance is always stored as (sum of debits) - (sum of credits).
  // Debit-normal  (Assets, Expense):        positive running = DR  ✓, negative = CR
  // Credit-normal (Liabilities, Revenue, Equity): negative running = CR ✓, positive = DR
  if (debitNormal) return balance > 0 ? "DR" : "CR";
  return balance < 0 ? "CR" : "DR";
}

function absBalance(balance: number, debitNormal: boolean): number {
  return debitNormal ? balance : -balance;
}

// ─── Account Selector (searchable dropdown) ───────────────────────────────────

function AccountSelector({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const ledgers = useMemo(
    () => accounts.filter(a => a.accountType === "Ledger" && a.isActive)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [accounts],
  );

  const filtered = useMemo(() => {
    if (!q) return ledgers;
    const lq = q.toLowerCase();
    return ledgers.filter(a =>
      a.name.toLowerCase().includes(lq) || a.code.toLowerCase().includes(lq),
    );
  }, [ledgers, q]);

  const selected = accounts.find(a => a.id === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQ(""); }}
        className="flex items-center justify-between gap-2 h-9 px-3 rounded-lg border border-input bg-background text-sm w-full min-w-[260px] hover:border-ring transition-colors"
      >
        <span className={selected ? "text-foreground font-medium" : "text-muted-foreground"}>
          {selected ? `${selected.code} — ${selected.name}` : "Select account…"}
        </span>
        <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-[340px] bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search account name or code…"
                className="w-full h-8 pl-7 pr-3 text-sm bg-muted/40 rounded-lg border border-transparent focus:outline-none focus:border-ring"
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No accounts found</div>
            )}
            {filtered.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.id); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-accent transition-colors text-sm
                  ${a.id === value ? "bg-primary/8 text-primary font-semibold" : "text-foreground"}`}
              >
                <span className="truncate">{a.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-muted-foreground font-mono">{a.code}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.head}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}

// ─── Ledger Table Row ─────────────────────────────────────────────────────────

type LedgerRow = {
  date: string;
  reference: string;
  description: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
  isDebitNormal: boolean;
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LedgerReportPage() {
  const { accounts } = useAccounts();
  const { entries } = useJournalEntries();
  const sym = useMemo(() => getSettingsCurrencySymbol(), []);

  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [statusFilter, setStatusFilter] = useState<"all" | "posted" | "draft">("posted");

  const printRef = useRef<HTMLDivElement>(null);

  // Selected account
  const account = useMemo(() => accounts.find(a => a.id === accountId) ?? null, [accounts, accountId]);
  const debitNormal = account ? isDebitNormal(account.head) : true;

  // All posted entries that touch this account, across all time
  const allRelevant = useMemo(() => {
    if (!accountId) return [];
    return entries.filter(e => {
      const statusOk =
        statusFilter === "all" ? true :
        statusFilter === "posted" ? e.status === "posted" :
        e.status === "draft";
      return statusOk && e.lines.some(l => l.ledgerId === accountId);
    });
  }, [entries, accountId, statusFilter]);

  // Opening balance: sum of all relevant entries strictly BEFORE from date
  const openingBalance = useMemo(() => {
    let bal = 0;
    allRelevant
      .filter(e => e.date < from)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(e => {
        e.lines.filter(l => l.ledgerId === accountId).forEach(l => {
          bal += l.debit - l.credit;
        });
      });
    return bal;
  }, [allRelevant, from, accountId]);

  // In-range rows
  const rows = useMemo((): LedgerRow[] => {
    const inRange = allRelevant
      .filter(e => e.date >= from && e.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));

    let running = openingBalance;
    const result: LedgerRow[] = [];

    for (const e of inRange) {
      for (const l of e.lines.filter(line => line.ledgerId === accountId)) {
        running += l.debit - l.credit;
        result.push({
          date: e.date,
          reference: e.reference,
          description: e.description,
          narration: l.narration,
          debit: l.debit,
          credit: l.credit,
          balance: running,
          isDebitNormal: debitNormal,
        });
      }
    }

    return result;
  }, [allRelevant, from, to, openingBalance, accountId, debitNormal]);

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

  // ── Print ──────────────────────────────────────────────────────────────────

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`
      <html><head><title>Ledger Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 24px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        p  { margin: 2px 0; color: #555; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 12px; border-bottom: 2px solid #e5e7eb; }
        td { padding: 6px 10px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
        tr.opening td, tr.closing td { background: #f8fafc; font-weight: 700; }
        tr.total td { background: #f0f9ff; font-weight: 700; border-top: 2px solid #bae6fd; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .dr { color: #059669; } .cr { color: #dc2626; }
        .badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; background:#e0f2fe; color: #0369a1; }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen size={15} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-foreground leading-tight">Ledger Report</h1>
            <p className="text-[11px] text-muted-foreground">Account statement with running balance</p>
          </div>
        </div>

        {/* Account selector */}
        <AccountSelector accounts={accounts} value={accountId} onChange={setAccountId} />

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Calendar size={14} className="text-muted-foreground" />
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-9 text-sm w-[140px]" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-9 text-sm w-[140px]" />
        </div>

        {/* Status filter */}
        <div className="flex rounded-lg border border-input overflow-hidden text-sm">
          {(["posted", "all", "draft"] as const).map(s => (
            <button key={s} type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 h-9 capitalize transition-colors
                ${statusFilter === s
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!accountId}>
            <Printer size={14} className="mr-1.5" /> Print
          </Button>
        </div>
      </div>

      {/* ── No account selected placeholder ─────────────────────────────────── */}
      {!accountId && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <BookOpen size={28} className="opacity-40" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Select an Account</p>
            <p className="text-sm mt-1">Choose a ledger account above to generate its statement</p>
          </div>
        </div>
      )}

      {/* ── Report ──────────────────────────────────────────────────────────── */}
      {accountId && account && (
        <div className="flex-1 overflow-auto px-6 py-5">

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: "Opening Balance",
                value: fmt(Math.abs(absBalance(openingBalance, debitNormal)), sym),
                side: openingBalance === 0 ? "" : balanceLabel(openingBalance, debitNormal),
                icon: BarChart3,
                color: "bg-slate-50 dark:bg-slate-900/40",
                iconColor: "text-slate-500",
              },
              {
                label: "Total Debits",
                value: fmt(totalDebit, sym),
                side: totalDebit > 0 ? "DR" : "",
                icon: TrendingUp,
                color: "bg-emerald-50 dark:bg-emerald-950/20",
                iconColor: "text-emerald-600",
              },
              {
                label: "Total Credits",
                value: fmt(totalCredit, sym),
                side: totalCredit > 0 ? "CR" : "",
                icon: TrendingDown,
                color: "bg-rose-50 dark:bg-rose-950/20",
                iconColor: "text-rose-600",
              },
              {
                label: "Closing Balance",
                value: fmt(Math.abs(absBalance(closingBalance, debitNormal)), sym),
                side: closingBalance === 0 ? "" : balanceLabel(closingBalance, debitNormal),
                icon: BookOpen,
                color: "bg-primary/5",
                iconColor: "text-primary",
              },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border border-border p-4 ${c.color}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <c.icon size={14} className={c.iconColor} />
                  <span className="text-[11px] text-muted-foreground font-medium">{c.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-bold text-foreground">{c.value}</span>
                  {c.side && (
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded
                      ${c.side === "DR" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"}`}
                    >{c.side}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Printable content */}
          <div ref={printRef}>

            {/* Print-only header */}
            <div className="hidden print:block mb-4">
              <h1 className="text-xl font-bold">Ledger Report</h1>
              <p>{account.code} — {account.name} &nbsp;|&nbsp; {account.head}</p>
              <p>Period: {from} to {to} &nbsp;|&nbsp; Status: {statusFilter}</p>
            </div>

            {/* Account info bar */}
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-muted/30 border border-border">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-medium">Account</span>
                <span className="text-sm font-bold text-foreground">{account.name}</span>
                <span className="text-[11px] font-mono text-muted-foreground">{account.code}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{account.head}</span>
                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{account.subType ?? account.accountType}</span>
                <span className={`px-2 py-0.5 rounded-full font-semibold
                  ${debitNormal ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"}`}
                >{debitNormal ? "Debit Normal" : "Credit Normal"}</span>
              </div>
              <div className="ml-auto text-[11px] text-muted-foreground">
                {from} → {to} &nbsp;·&nbsp; {rows.length} transactions
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[100px]">Date</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[110px]">Ref #</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Description / Narration</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">Debit</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">Credit</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[140px]">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening Balance row */}
                  <tr className="bg-slate-50/80 dark:bg-slate-900/30 border-b border-dashed border-border">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">{from}</td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">B/F</span>
                        <span className="text-[12px] font-semibold text-foreground">Opening Balance</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {openingBalance > 0 ? fmtN(openingBalance) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {openingBalance < 0 ? fmtN(Math.abs(openingBalance)) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <BalanceCell balance={openingBalance} debitNormal={debitNormal} />
                    </td>
                  </tr>

                  {/* Transaction rows */}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No transactions found for this account in the selected period
                      </td>
                    </tr>
                  )}
                  {rows.map((row, i) => (
                    <tr key={i}
                      className={`border-b border-border/60 transition-colors hover:bg-muted/30
                        ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground font-medium whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[12px] font-mono font-semibold text-primary">{row.reference}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-[13px] font-medium text-foreground leading-tight">{row.description}</div>
                        {row.narration && row.narration !== row.description && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">{row.narration}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {row.debit > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[13px]">
                            {fmtN(row.debit)}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {row.credit > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold text-[13px]">
                            {fmtN(row.credit)}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <BalanceCell balance={row.balance} debitNormal={debitNormal} />
                      </td>
                    </tr>
                  ))}

                  {/* Totals row */}
                  {rows.length > 0 && (
                    <tr className="bg-primary/5 border-t-2 border-primary/20">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <span className="text-[12px] font-bold text-foreground">Period Totals</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[13px] tabular-nums">
                          {fmtN(totalDebit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-rose-600 dark:text-rose-400 font-bold text-[13px] tabular-nums">
                          {fmtN(totalCredit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" />
                    </tr>
                  )}

                  {/* Closing balance row */}
                  <tr className="bg-primary/8 dark:bg-primary/10 border-t border-primary/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground font-medium">{to}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary">C/F</span>
                        <span className="text-[12px] font-bold text-foreground">Closing Balance</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {closingBalance > 0 ? fmtN(closingBalance) : ""}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {closingBalance < 0 ? fmtN(Math.abs(closingBalance)) : ""}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <BalanceCell balance={closingBalance} debitNormal={debitNormal} large />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              All amounts in {sym} &nbsp;·&nbsp; Positive balance = DR for debit-normal accounts (Assets, Expense), CR for credit-normal
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Balance Cell ─────────────────────────────────────────────────────────────

function BalanceCell({
  balance,
  debitNormal,
  large = false,
}: {
  balance: number;
  debitNormal: boolean;
  large?: boolean;
}) {
  const label = balanceLabel(balance, debitNormal);
  const abs   = Math.abs(balance);
  const isDR  = label === "DR";
  const isCR  = label === "CR";

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className={`tabular-nums ${large ? "text-[14px] font-bold" : "text-[13px] font-semibold"} text-foreground`}>
        {abs === 0 ? "—" : abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      {abs > 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
          ${isDR ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                 : isCR ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" : ""}`}
        >{label}</span>
      )}
    </div>
  );
}
