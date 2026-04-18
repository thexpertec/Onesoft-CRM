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

function today():      string { return new Date().toISOString().slice(0, 10); }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

function fmtAbs(n: number): string {
  if (!n) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Row type ─────────────────────────────────────────────────────────────────

type TBRow = {
  id:      string;
  code:    string;
  name:    string;
  head:    string;
  openDr:  number;
  openCr:  number;
  moveDr:  number;
  moveCr:  number;
  closeDr: number;
  closeCr: number;
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrialBalance6ColPage() {
  const { accounts } = useAccounts();
  const { entries }  = useJournalEntries();
  const { toast }    = useToast();
  const sym          = getSettingsCurrencySymbol();

  const [from,        setFrom]        = useState(monthStart());
  const [to,          setTo]          = useState(today());
  const [submitted,   setSubmitted]   = useState(false);
  const [appliedFrom, setAppliedFrom] = useState(monthStart());
  const [appliedTo,   setAppliedTo]   = useState(today());
  const [search,      setSearch]      = useState("");
  const [perPage,     setPerPage]     = useState(25);
  const [page,        setPage]        = useState(1);
  const printRef = useRef<HTMLDivElement>(null);

  const ledgers = useMemo(
    () => accounts.filter(a => a.accountType === "Ledger"),
    [accounts],
  );

  const rows: TBRow[] = useMemo(() => {
    if (!submitted) return [];

    type Acc = { openDr: number; openCr: number; moveDr: number; moveCr: number };
    const map: Record<string, Acc> = {};

    for (const je of entries) {
      const jeDate       = je.date?.slice(0, 10) ?? "";
      const beforePeriod = jeDate < appliedFrom;
      const inPeriod     = jeDate >= appliedFrom && jeDate <= appliedTo;
      if (!beforePeriod && !inPeriod) continue;

      for (const line of je.lines) {
        if (!map[line.ledgerId]) map[line.ledgerId] = { openDr: 0, openCr: 0, moveDr: 0, moveCr: 0 };
        const dr = line.debit  ?? 0;
        const cr = line.credit ?? 0;
        if (beforePeriod) { map[line.ledgerId].openDr += dr; map[line.ledgerId].openCr += cr; }
        else              { map[line.ledgerId].moveDr  += dr; map[line.ledgerId].moveCr  += cr; }
      }
    }

    return ledgers
      .map(a => {
        const m = map[a.id] ?? { openDr: 0, openCr: 0, moveDr: 0, moveCr: 0 };
        return {
          id:      a.id,
          code:    a.code ?? "",
          name:    a.name,
          head:    a.head ?? "",
          openDr:  m.openDr,
          openCr:  m.openCr,
          moveDr:  m.moveDr,
          moveCr:  m.moveCr,
          closeDr: m.openDr + m.moveDr,
          closeCr: m.openCr + m.moveCr,
        } as TBRow;
      })
      .filter(r => r.openDr || r.openCr || r.moveDr || r.moveCr)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [submitted, appliedFrom, appliedTo, entries, ledgers]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    openDr:  acc.openDr  + r.openDr,
    openCr:  acc.openCr  + r.openCr,
    moveDr:  acc.moveDr  + r.moveDr,
    moveCr:  acc.moveCr  + r.moveCr,
    closeDr: acc.closeDr + r.closeDr,
    closeCr: acc.closeCr + r.closeCr,
  }), { openDr: 0, openCr: 0, moveDr: 0, moveCr: 0, closeDr: 0, closeCr: 0 }), [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? rows : rows.filter(r =>
      r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged      = filtered.slice((page - 1) * perPage, page * perPage);

  function handleSubmit() {
    setAppliedFrom(from); setAppliedTo(to);
    setSubmitted(true); setPage(1);
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
    w.document.write(`<html><head><title>6-Column Trial Balance</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#111}
        h2{text-align:center;margin-bottom:4px;font-size:14px}
        p{text-align:center;color:#555;margin-bottom:12px;font-size:10px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #999;padding:4px 6px}
        th{background:#f0f0f0;font-weight:700;text-align:center}
        td.num{text-align:right} td.acc{font-family:monospace;color:#555}
        .total-row td{font-weight:700;background:#f9f9f9;border-top:2px solid #666}
        .section-hdr{background:#e8e8e8;font-weight:700}
      </style></head><body>
      <h2>6-Column Trial Balance</h2>
      <p>Period: ${appliedFrom} to ${appliedTo}</p>
      ${el.innerHTML}
      </body></html>`);
    w.document.close(); w.print();
  }

  function handleExportCSV() {
    const hdrs = ["Code","Account Name","Head","Opening DR","Opening CR","Movement DR","Movement CR","Closing DR","Closing CR"];
    const csvRows = [
      hdrs.join(","),
      ...filtered.map(r => [
        r.code, `"${r.name}"`, r.head,
        r.openDr.toFixed(2), r.openCr.toFixed(2),
        r.moveDr.toFixed(2), r.moveCr.toFixed(2),
        r.closeDr.toFixed(2), r.closeCr.toFixed(2),
      ].join(",")),
      ["","TOTAL","",
        totals.openDr.toFixed(2), totals.openCr.toFixed(2),
        totals.moveDr.toFixed(2), totals.moveCr.toFixed(2),
        totals.closeDr.toFixed(2), totals.closeCr.toFixed(2),
      ].join(","),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trial-balance-6col-${appliedFrom}-${appliedTo}.csv`;
    a.click();
    toast({ title: "CSV exported" });
  }

  // ── Number cell ─────────────────────────────────────────────────────────────
  const N = ({ v }: { v: number }) => (
    <td className="text-right px-3 py-2 text-xs tabular-nums text-gray-700 dark:text-gray-300">
      {v ? `${sym}${fmtAbs(v)}` : <span className="text-gray-300 dark:text-zinc-600">—</span>}
    </td>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Scale size={20} className="text-indigo-600" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">6-Column Trial Balance</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 shadow-sm">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none w-32" />
            <span className="text-gray-300 dark:text-zinc-600">—</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none w-32" />
          </div>
          <Button size="sm" onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
            Submit
          </Button>
          <Button size="sm" variant="outline" onClick={handleRefresh} className="text-xs gap-1.5">
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
      </div>

      {!submitted ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
          <Scale size={36} className="opacity-30" />
          <p className="text-sm">Select a date range and click <strong>Submit</strong> to generate the report.</p>
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

          {/* ── 6-Column Table ── */}
          <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto" ref={printRef}>
              <table className="w-full text-xs border-collapse">
                {/* Group header row */}
                <thead>
                  <tr className="bg-gray-100 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700">
                    <th rowSpan={2} className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-zinc-700 w-28">
                      Account Code
                    </th>
                    <th rowSpan={2} className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-zinc-700">
                      Account Name
                    </th>
                    <th colSpan={2} className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-zinc-700">
                      Opening Balance
                    </th>
                    <th colSpan={2} className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-zinc-700">
                      Movement
                    </th>
                    <th colSpan={2} className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-zinc-700">
                      Closing Balance
                    </th>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-zinc-900/70 border-b-2 border-gray-300 dark:border-zinc-600">
                    {["DR","CR","DR","CR","DR","CR"].map((lbl, i) => (
                      <th key={i} className={`text-center px-3 py-1.5 font-bold text-[11px] border border-gray-200 dark:border-zinc-700 w-32 ${
                        lbl === "DR" ? "text-red-500" : "text-green-600"
                      }`}>
                        {lbl}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-gray-400">
                        No accounts with activity in this period.
                      </td>
                    </tr>
                  ) : paged.map((r, i) => (
                    <tr key={r.id}
                      className={`border-b border-gray-100 dark:border-zinc-700/50 hover:bg-indigo-50/30 dark:hover:bg-zinc-700/20 transition-colors ${
                        i % 2 === 1 ? "bg-gray-50/50 dark:bg-zinc-800/30" : ""
                      }`}>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500 dark:text-gray-400 border-r border-gray-100 dark:border-zinc-700">
                        {r.code}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200 border-r border-gray-100 dark:border-zinc-700">
                        {r.name}
                        <span className="ml-1.5 text-[10px] text-gray-400 font-normal">{r.head}</span>
                      </td>
                      <N v={r.openDr} />
                      <N v={r.openCr} />
                      <N v={r.moveDr} />
                      <N v={r.moveCr} />
                      <N v={r.closeDr} />
                      <N v={r.closeCr} />
                    </tr>
                  ))}
                </tbody>

                {/* Totals footer */}
                <tfoot>
                  <tr className="bg-gray-100 dark:bg-zinc-900/60 border-t-2 border-gray-400 dark:border-zinc-500 font-bold">
                    <td colSpan={2} className="px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wide border-r border-gray-300 dark:border-zinc-600">
                      Total ({filtered.length} accounts)
                    </td>
                    {([
                      [totals.openDr,  "text-red-600"],
                      [totals.openCr,  "text-green-600"],
                      [totals.moveDr,  "text-red-600"],
                      [totals.moveCr,  "text-green-600"],
                      [totals.closeDr, "text-red-600"],
                      [totals.closeCr, "text-green-600"],
                    ] as [number, string][]).map(([v, cls], i) => (
                      <td key={i} className={`text-right px-3 py-2.5 text-xs tabular-nums border-r border-gray-300 dark:border-zinc-600 ${cls}`}>
                        {sym}{fmtAbs(v)}
                      </td>
                    ))}
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
                    className="px-2 py-1 rounded border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-700">‹</button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const pg = totalPages <= 7 ? i + 1 : i < 3 ? i + 1 : i < 4 ? page : totalPages - 3 + i;
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        className={`px-2 py-1 rounded border text-xs ${pg === page ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}>
                        {pg}
                      </button>
                    );
                  })}
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-2 py-1 rounded border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-700">›</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
