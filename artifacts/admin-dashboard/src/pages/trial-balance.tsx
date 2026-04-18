import { useState, useMemo, useRef } from "react";
import { useAccounts, useJournalEntries } from "@/hooks/use-data";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { reconcileAccountingData } from "@/lib/store";
import {
  Scale, Printer, FileDown, RefreshCw, Calendar, Search, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string      { return new Date().toISOString().slice(0, 10); }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

function fmtAbs(n: number): string {
  return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** True if this head's normal side is Debit (increases with debits). */
function isDebitNormal(head: string): boolean {
  return head === "Assets" || head === "Expense";
}

/**
 * Given raw net = totalDebit - totalCredit, return display label.
 * Debit-normal : positive net → DR, negative → CR
 * Credit-normal: positive net → DR (abnormal), negative net → CR (normal)
 */
function drCr(net: number, debitNorm: boolean): "DR" | "CR" | "—" {
  if (net === 0) return "—";
  if (debitNorm) return net > 0 ? "DR" : "CR";
  return net < 0 ? "CR" : "DR";
}

// ─── Row type ─────────────────────────────────────────────────────────────────

type TBRow = {
  id:         string;
  code:       string;
  name:       string;
  head:       string;
  openDr:     number;   // opening balance debit total
  openCr:     number;   // opening balance credit total
  periodDr:   number;   // period debit
  periodCr:   number;   // period credit
  closeDr:    number;   // closing debit total
  closeCr:    number;   // closing credit total
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrialBalancePage() {
  const { accounts } = useAccounts();
  const { entries }  = useJournalEntries();
  const { toast }    = useToast();
  const sym          = getSettingsCurrencySymbol();

  const [from,       setFrom]       = useState(monthStart());
  const [to,         setTo]         = useState(today());
  const [submitted,  setSubmitted]  = useState(false);
  const [appliedFrom, setAppliedFrom] = useState(monthStart());
  const [appliedTo,   setAppliedTo]   = useState(today());
  const [search,     setSearch]     = useState("");
  const [perPage,    setPerPage]    = useState(25);
  const [page,       setPage]       = useState(1);
  const printRef = useRef<HTMLDivElement>(null);

  // Only ledger accounts participate in trial balance
  const ledgers = useMemo(
    () => accounts.filter(a => a.accountType === "Ledger"),
    [accounts],
  );

  // Build period totals map: ledgerId → { openDr, openCr, periodDr, periodCr }
  const rows: TBRow[] = useMemo(() => {
    if (!submitted && !appliedFrom) return [];

    type Acc = { openDr: number; openCr: number; perDr: number; perCr: number };
    const map: Record<string, Acc> = {};

    for (const je of entries) {
      const jeDate = je.date?.slice(0, 10) ?? "";
      const beforePeriod = jeDate < appliedFrom;
      const inPeriod     = jeDate >= appliedFrom && jeDate <= appliedTo;
      if (!beforePeriod && !inPeriod) continue;

      for (const line of je.lines) {
        if (!map[line.ledgerId]) map[line.ledgerId] = { openDr: 0, openCr: 0, perDr: 0, perCr: 0 };
        const dr = line.debit  ?? 0;
        const cr = line.credit ?? 0;
        if (beforePeriod) {
          map[line.ledgerId].openDr += dr;
          map[line.ledgerId].openCr += cr;
        } else {
          map[line.ledgerId].perDr += dr;
          map[line.ledgerId].perCr += cr;
        }
      }
    }

    return ledgers
      .map(a => {
        const m = map[a.id] ?? { openDr: 0, openCr: 0, perDr: 0, perCr: 0 };
        const closeDr = m.openDr + m.perDr;
        const closeCr = m.openCr + m.perCr;
        return {
          id:       a.id,
          code:     a.code ?? "",
          name:     a.name,
          head:     a.head ?? "",
          openDr:   m.openDr,
          openCr:   m.openCr,
          periodDr: m.perDr,
          periodCr: m.perCr,
          closeDr,
          closeCr,
        } as TBRow;
      })
      .filter(r => r.openDr || r.openCr || r.periodDr || r.periodCr) // hide zero-activity
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [submitted, appliedFrom, appliedTo, entries, ledgers]);

  // Totals
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    openDr:   acc.openDr   + r.openDr,
    openCr:   acc.openCr   + r.openCr,
    periodDr: acc.periodDr + r.periodDr,
    periodCr: acc.periodCr + r.periodCr,
    closeDr:  acc.closeDr  + r.closeDr,
    closeCr:  acc.closeCr  + r.closeCr,
  }), { openDr: 0, openCr: 0, periodDr: 0, periodCr: 0, closeDr: 0, closeCr: 0 }), [rows]);

  // Search + pagination
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? rows : rows.filter(r =>
      r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.head.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged      = filtered.slice((page - 1) * perPage, page * perPage);

  function handleSubmit() {
    setAppliedFrom(from);
    setAppliedTo(to);
    setSubmitted(true);
    setPage(1);
  }

  function handleRefresh() {
    reconcileAccountingData();
    setSubmitted(false);
    setTimeout(() => setSubmitted(true), 50);
  }

  function handlePrint() {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Trial Balance</title>
      <style>body{font-family:sans-serif;font-size:11px;padding:16px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
      th{background:#f3f4f6;font-weight:600}
      .num{text-align:right} .dr{color:#dc2626} .cr{color:#16a34a}
      .total-row{font-weight:700;background:#f9fafb}
      </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  }

  function handleExportCSV() {
    const hdrs = ["Code","Account","Head","Opening Dr","Opening Cr","Period Dr","Period Cr","Closing Dr","Closing Cr"];
    const csvRows = [
      hdrs.join(","),
      ...filtered.map(r => [
        r.code, `"${r.name}"`, r.head,
        r.openDr.toFixed(2), r.openCr.toFixed(2),
        r.periodDr.toFixed(2), r.periodCr.toFixed(2),
        r.closeDr.toFixed(2), r.closeCr.toFixed(2),
      ].join(",")),
      ["","TOTAL","",
        totals.openDr.toFixed(2), totals.openCr.toFixed(2),
        totals.periodDr.toFixed(2), totals.periodCr.toFixed(2),
        totals.closeDr.toFixed(2), totals.closeCr.toFixed(2),
      ].join(","),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `trial-balance-${appliedFrom}-${appliedTo}.csv`; a.click();
    toast({ title: "CSV exported" });
  }

  // ── Balance cell renderer ──────────────────────────────────────────────────
  function BalCell({ dr, cr, head }: { dr: number; cr: number; head: string }) {
    const net  = dr - cr;
    const dn   = isDebitNormal(head);
    const side = drCr(net, dn);
    const disp = Math.abs(net);
    if (side === "—") return <span className="text-gray-400">—</span>;
    return (
      <span className={side === "DR" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-500"}>
        {side}. {sym}{fmtAbs(disp)}
      </span>
    );
  }

  function NumCell({ val }: { val: number }) {
    if (!val) return <span className="text-gray-400">—</span>;
    return <span>{sym}{fmtAbs(val)}</span>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Scale size={20} className="text-blue-600" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Trial Balance</h1>
        </div>

        {/* Date range + submit */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 shadow-sm">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none w-32" />
            <span className="text-gray-300 dark:text-zinc-600">—</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none w-32" />
          </div>
          <Button size="sm" onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5">
            Submit
          </Button>
          <Button size="sm" variant="outline" onClick={handleRefresh} title="Reconcile & refresh" className="text-xs gap-1.5">
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
      </div>

      {!submitted ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
          <Scale size={36} className="opacity-30" />
          <p className="text-sm">Select a date range and click <strong>Submit</strong> to generate the trial balance.</p>
        </div>
      ) : (
        <>
          {/* ── Toolbar ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span>Show</span>
                <div className="relative">
                  <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                    className="appearance-none pl-2 pr-6 py-1 rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-gray-700 dark:text-gray-300 outline-none">
                    {[10,25,50,100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
                <span>rows per page</span>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <button onClick={handleExportCSV} title="Export CSV"
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-500">
                  <FileDown size={14} />
                </button>
                <button onClick={handlePrint} title="Print"
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-500">
                  <Printer size={14} />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search account…"
                className="pl-7 h-8 text-xs w-52 bg-white dark:bg-zinc-800" />
            </div>
          </div>

          {/* ── Summary chips ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Opening Dr", val: totals.openDr, color: "text-red-600" },
              { label: "Opening Cr", val: totals.openCr, color: "text-green-600" },
              { label: "Period Dr",  val: totals.periodDr, color: "text-red-600" },
              { label: "Period Cr",  val: totals.periodCr, color: "text-green-600" },
              { label: "Closing Dr", val: totals.closeDr, color: "text-red-600" },
              { label: "Closing Cr", val: totals.closeCr, color: "text-green-600" },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{sym}{fmtAbs(val)}</p>
              </div>
            ))}
          </div>

          {/* ── Table ── */}
          <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto" ref={printRef}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 w-12">#</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">Particulars</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">Opening Balance</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-red-500">Debit</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-green-600">Credit</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">Closing Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-gray-400">
                        No accounts with activity in this period.
                      </td>
                    </tr>
                  ) : paged.map((r, i) => (
                    <tr key={r.id}
                      className="border-b border-gray-100 dark:border-zinc-700/50 hover:bg-blue-50/40 dark:hover:bg-zinc-700/30 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400">{(page - 1) * perPage + i + 1}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-[10px] text-gray-400 mr-1.5">{r.code}</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{r.name}</span>
                        <span className="ml-2 text-[10px] text-gray-400 dark:text-zinc-500">{r.head}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <BalCell dr={r.openDr} cr={r.openCr} head={r.head} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400">
                        <NumCell val={r.periodDr} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-500">
                        <NumCell val={r.periodCr} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <BalCell dr={r.closeDr} cr={r.closeCr} head={r.head} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-zinc-900/60 border-t-2 border-gray-300 dark:border-zinc-600 font-semibold">
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 text-xs font-bold uppercase tracking-wide">
                      TOTAL ({filtered.length} accounts)
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="text-red-600 text-[10px]">DR {sym}{fmtAbs(totals.openDr)}</div>
                      <div className="text-green-600 text-[10px]">CR {sym}{fmtAbs(totals.openCr)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400">
                      {sym}{fmtAbs(totals.periodDr)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-500">
                      {sym}{fmtAbs(totals.periodCr)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="text-red-600 text-[10px]">DR {sym}{fmtAbs(totals.closeDr)}</div>
                      <div className="text-green-600 text-[10px]">CR {sym}{fmtAbs(totals.closeCr)}</div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-zinc-700 text-xs text-gray-500">
                <span>Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}</span>
                <div className="flex gap-1">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="px-2 py-1 rounded border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-700">
                    ‹
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const pg = totalPages <= 7 ? i + 1 : i < 3 ? i + 1 : i < 4 ? page : totalPages - 3 + i;
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        className={`px-2 py-1 rounded border text-xs ${pg === page ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}>
                        {pg}
                      </button>
                    );
                  })}
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-2 py-1 rounded border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-700">
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
