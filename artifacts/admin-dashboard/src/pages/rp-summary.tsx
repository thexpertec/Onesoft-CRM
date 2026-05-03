import { useState, useMemo, useRef } from "react";
import { useAccounts, useJournalEntries } from "@/hooks/use-data";
import { getCashBankLedgers, getJournalEntries } from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { Printer, Calendar, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string      { return new Date().toISOString().slice(0, 10); }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

const sym = getSettingsCurrencySymbol();
const dp  = getSettingsDecimalPlaces();

function fmt(n: number): string {
  if (n === 0) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ColId = string;

type SummaryRow = {
  head:    string;
  amounts: Record<ColId, number>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RpSummaryPage() {
  const { accounts } = useAccounts();
  const { entries }  = useJournalEntries();

  const [from, setFrom] = useState(monthStart);
  const [to,   setTo]   = useState(today);
  const [recSearch, setRecSearch] = useState("");
  const [paySearch, setPaySearch] = useState("");

  const printRef = useRef<HTMLDivElement>(null);

  // ── Cash & Bank columns ────────────────────────────────────────────────────
  const cbCols = useMemo(() => getCashBankLedgers(), [accounts]);
  const cbIds  = useMemo(() => new Set(cbCols.map(a => a.id)), [cbCols]);

  // ── Opening balance per column (openingBalance field + pre-period JE movements) ──
  const openingBalance = useMemo(() => {
    const ob: Record<ColId, number> = {};
    cbCols.forEach(a => { ob[a.id] = parseFloat(String(a.openingBalance || 0)) || 0; });

    // Add JE movements before the start date (normalise to YYYY-MM-DD)
    getJournalEntries().forEach(je => {
      if (je.status !== "posted") return;
      if (je.date.slice(0, 10) >= from) return;
      je.lines.forEach(l => {
        if (!cbIds.has(l.ledgerId)) return;
        ob[l.ledgerId] = (ob[l.ledgerId] ?? 0) + l.debit - l.credit;
      });
    });
    return ob;
  }, [cbCols, cbIds, from, entries]);

  // ── Account name lookup (id → name) ───────────────────────────────────────
  const acctName = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach(a => m.set(a.id, a.name));
    return m;
  }, [accounts]);

  // ── Receipt & Payment rows from JEs within date range ─────────────────────
  // Rows are grouped by the COUNTERPART account name(s), not by JE reference.
  // For a CB-debit (receipt) line the counterpart is the non-CB credit side.
  // For a CB-credit (payment) line the counterpart is the non-CB debit side.
  const { receiptRows, paymentRows } = useMemo(() => {
    const recMap = new Map<string, Record<ColId, number>>();
    const payMap = new Map<string, Record<ColId, number>>();

    // Normalise to YYYY-MM-DD so full ISO timestamps compare correctly
    const posted = entries.filter(je => {
      if (je.status !== "posted") return false;
      const d = je.date.slice(0, 10);
      return d >= from && d <= to;
    });

    posted.forEach(je => {
      const cbLines    = je.lines.filter(l =>  cbIds.has(l.ledgerId));
      const nonCbLines = je.lines.filter(l => !cbIds.has(l.ledgerId));

      // Unique account names on each side of the non-CB lines
      const counterpartCredits = [...new Set(
        nonCbLines.filter(l => l.credit > 0)
          .map(l => acctName.get(l.ledgerId) || l.narration || je.description || je.reference)
      )].join(" / ");

      const counterpartDebits = [...new Set(
        nonCbLines.filter(l => l.debit > 0)
          .map(l => acctName.get(l.ledgerId) || l.narration || je.description || je.reference)
      )].join(" / ");

      cbLines.forEach(l => {
        if (l.debit > 0) {
          // Debit to cash/bank = receipt — head is the non-CB credit account(s)
          const head = counterpartCredits || je.description || je.reference;
          if (!recMap.has(head)) recMap.set(head, {});
          recMap.get(head)![l.ledgerId] = (recMap.get(head)![l.ledgerId] ?? 0) + l.debit;
        }
        if (l.credit > 0) {
          // Credit to cash/bank = payment — head is the non-CB debit account(s)
          const head = counterpartDebits || je.description || je.reference;
          if (!payMap.has(head)) payMap.set(head, {});
          payMap.get(head)![l.ledgerId] = (payMap.get(head)![l.ledgerId] ?? 0) + l.credit;
        }
      });
    });

    const toRows = (map: Map<string, Record<ColId, number>>): SummaryRow[] =>
      Array.from(map.entries()).map(([head, amounts]) => ({ head, amounts }));

    return { receiptRows: toRows(recMap), paymentRows: toRows(payMap) };
  }, [entries, accounts, acctName, cbIds, from, to]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const recTotals = useMemo(() => {
    const t: Record<ColId, number> = {};
    cbCols.forEach(c => { t[c.id] = 0; });
    receiptRows.forEach(r => cbCols.forEach(c => { t[c.id] = (t[c.id] ?? 0) + (r.amounts[c.id] ?? 0); }));
    return t;
  }, [receiptRows, cbCols]);

  const payTotals = useMemo(() => {
    const t: Record<ColId, number> = {};
    cbCols.forEach(c => { t[c.id] = 0; });
    paymentRows.forEach(r => cbCols.forEach(c => { t[c.id] = (t[c.id] ?? 0) + (r.amounts[c.id] ?? 0); }));
    return t;
  }, [paymentRows, cbCols]);

  const closingBalance = useMemo(() => {
    const cb: Record<ColId, number> = {};
    cbCols.forEach(c => {
      cb[c.id] = (openingBalance[c.id] ?? 0) + (recTotals[c.id] ?? 0) - (payTotals[c.id] ?? 0);
    });
    return cb;
  }, [openingBalance, recTotals, payTotals, cbCols]);

  const recSubTotal = useMemo(() => cbCols.reduce((s, c) => s + (recTotals[c.id] ?? 0), 0), [recTotals, cbCols]);
  const paySubTotal = useMemo(() => cbCols.reduce((s, c) => s + (payTotals[c.id] ?? 0), 0), [payTotals, cbCols]);

  // ── Filtered rows (search) ─────────────────────────────────────────────────
  const filteredRec = useMemo(() => {
    const q = recSearch.toLowerCase();
    if (!q) return receiptRows;
    return receiptRows.filter(r => r.head.toLowerCase().includes(q));
  }, [receiptRows, recSearch]);

  const filteredPay = useMemo(() => {
    const q = paySearch.toLowerCase();
    if (!q) return paymentRows;
    return paymentRows.filter(r => r.head.toLowerCase().includes(q));
  }, [paymentRows, paySearch]);

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── Panel renderer ─────────────────────────────────────────────────────────
  const renderPanel = (
    type: "receipt" | "payment",
    rows: SummaryRow[],
    search: string,
    setSearch: (v: string) => void,
    totals: Record<ColId, number>,
    subTotal: number,
  ) => {
    const isReceipt = type === "receipt";
    const color     = isReceipt ? "emerald" : "rose";
    const title     = isReceipt ? "Receipt" : "Payment";

    // Opening Balance row only on Receipt; Closing Balance row only on Payment
    const openRow = isReceipt ? (
      <tr className="bg-blue-50 dark:bg-blue-950/20 font-semibold text-[12px]">
        <td className="px-3 py-2 text-center text-muted-foreground">—</td>
        <td className="px-3 py-2 text-blue-700 dark:text-blue-400">Opening Balance</td>
        {cbCols.map(c => (
          <td key={c.id} className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-400">
            {fmt(openingBalance[c.id] ?? 0)}
          </td>
        ))}
      </tr>
    ) : null;

    const closeRow = !isReceipt ? (
      <tr className="bg-blue-50 dark:bg-blue-950/20 font-semibold text-[12px]">
        <td className="px-3 py-2 text-center text-muted-foreground">—</td>
        <td className="px-3 py-2 text-blue-700 dark:text-blue-400">Closing Balance</td>
        {cbCols.map(c => (
          <td key={c.id} className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-400">
            {fmt(closingBalance[c.id] ?? 0)}
          </td>
        ))}
      </tr>
    ) : null;

    return (
      <div className="flex flex-col gap-3 min-w-0">
        {/* Panel header */}
        <div className="flex items-center justify-between">
          <h2 className={`text-[15px] font-bold text-${color}-700 dark:text-${color}-400`}>{title}</h2>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 pl-7 text-xs w-40"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-8">Sl</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[150px]">Voucher Head</th>
                {cbCols.map(c => (
                  <th key={c.id} className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[90px]">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {openRow}
              {rows.length === 0 && !isReceipt && search === "" ? null : null}
              {rows.map((row, i) => (
                <tr key={row.head} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                  <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{row.head}</td>
                  {cbCols.map(c => (
                    <td key={c.id} className="px-3 py-2 text-right tabular-nums text-foreground">
                      {(row.amounts[c.id] ?? 0) > 0 ? fmt(row.amounts[c.id]) : "0.00"}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={2 + cbCols.length} className="px-3 py-8 text-center text-muted-foreground text-[11px]">
                    No {title.toLowerCase()} transactions found for this period
                  </td>
                </tr>
              )}
              {closeRow}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 border-${color}-200 dark:border-${color}-800 bg-${color}-50 dark:bg-${color}-950/20 font-bold text-[12px]`}>
                <td className="px-3 py-2.5" colSpan={2}>Total</td>
                {cbCols.map(c => (
                  <td key={c.id} className={`px-3 py-2.5 text-right tabular-nums text-${color}-700 dark:text-${color}-400`}>
                    {fmt(totals[c.id] ?? 0)}
                  </td>
                ))}
              </tr>
              <tr className={`bg-${color}-100/60 dark:bg-${color}-950/30 font-bold text-[12px]`}>
                <td className="px-3 py-2" colSpan={2 + cbCols.length}>
                  <div className="flex items-center justify-between">
                    <span className={`text-${color}-800 dark:text-${color}-300`}>Sub Total</span>
                    <span className={`font-black text-[14px] text-${color}-700 dark:text-${color}-400 tabular-nums`}>
                      {sym}{fmt(subTotal)}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-black tracking-tight text-foreground flex items-center gap-2">
            Receipt & Payment Summary
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Cash & Bank movements by voucher head — {from} to {to}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range */}
          <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-3 h-9">
            <Calendar size={13} className="text-muted-foreground shrink-0" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-transparent text-[12px] text-foreground outline-none w-[110px]" />
            <span className="text-muted-foreground text-[11px]">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-transparent text-[12px] text-foreground outline-none w-[110px]" />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={() => { setFrom(monthStart()); setTo(today()); }}>
            <RefreshCw size={13} /> This Month
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 print:hidden" onClick={handlePrint}>
            <Printer size={13} /> Print
          </Button>
        </div>
      </div>

      {/* No columns warning */}
      {cbCols.length === 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
          No active Cash & Bank accounts found. Please configure them under Accounts → Cash & Bank Accounts.
        </div>
      )}

      {/* Two-panel report */}
      <div ref={printRef} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {renderPanel("receipt", filteredRec, recSearch, setRecSearch, recTotals, recSubTotal)}
        {renderPanel("payment", filteredPay, paySearch, setPaySearch, payTotals, paySubTotal)}
      </div>

      {/* Balance check */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 flex items-center justify-between flex-wrap gap-4">
        <span className="text-[12px] text-muted-foreground font-medium">Balance Check</span>
        <div className="flex items-center gap-6 flex-wrap">
          {cbCols.map(c => {
            const ob    = openingBalance[c.id] ?? 0;
            const rec   = recTotals[c.id] ?? 0;
            const pay   = payTotals[c.id] ?? 0;
            const close = closingBalance[c.id] ?? 0;
            return (
              <div key={c.id} className="text-center">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{c.name}</p>
                <p className="text-[13px] font-bold text-foreground tabular-nums mt-0.5">{sym}{fmt(close)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {sym}{fmt(ob)} + {sym}{fmt(rec)} − {sym}{fmt(pay)}
                </p>
              </div>
            );
          })}
          <div className="text-center border-l border-border pl-6">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Net Cash Flow</p>
            <p className={`text-[13px] font-bold tabular-nums mt-0.5 ${recSubTotal - paySubTotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {recSubTotal - paySubTotal >= 0 ? "+" : ""}{sym}{fmt(recSubTotal - paySubTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #root > * { display: none !important; }
          .print\\:hidden { display: none !important; }
          [data-rp-summary-print] { display: block !important; }
        }
      `}</style>
    </div>
  );
}
