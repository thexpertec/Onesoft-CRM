import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import {
  getStock, getStockLedger, deleteStockLedgerEntry, getSettings,
  StockLedgerEntry, LedgerTxType, LEDGER_TX_LABELS,
} from "@/lib/store";
import {
  BookOpen, Search, Printer, ArrowLeft,
  TrendingUp, TrendingDown, Package, BarChart3,
  Filter, X, Trash2, AlertTriangle, ChevronDown,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const today      = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const absQty     = (n: number, unit = "") =>
  `${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}${unit ? " " + unit : ""}`;
const fmtDate    = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const TX_COLORS: Record<LedgerTxType, string> = {
  "purchase-receipt":  "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "sale":              "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300",
  "sale-refund":       "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  "mfg-input":         "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  "mfg-output":        "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  "manual-adjustment": "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  "opening-balance":   "bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400",
};

const TX_PRINT_COLORS: Record<LedgerTxType, string> = {
  "purchase-receipt":  "#065f46",
  "sale":              "#9f1239",
  "sale-refund":       "#92400e",
  "mfg-input":         "#9a3412",
  "mfg-output":        "#1e3a8a",
  "manual-adjustment": "#4c1d95",
  "opening-balance":   "#374151",
};

// ─── Print ────────────────────────────────────────────────────────────────────
type BalancedRow = StockLedgerEntry & { displayBalance: number };

function printLedger(
  productName: string,
  from: string,
  to: string,
  rows: BalancedRow[],
  openingQty: number,
  totalIn: number,
  totalOut: number,
  closingQty: number,
  unit: string,
  companyName: string,
) {
  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const fmtN = (n: number) => Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

  const rowsHtml = rows.map((r, i) => `
    <tr class="${i % 2 === 0 ? "even" : "odd"}">
      <td class="center">${i + 1}</td>
      <td class="nowrap">${fmtDate(r.date)}</td>
      <td><span class="ref">${r.reference || "—"}</span></td>
      <td><span class="badge" style="color:${TX_PRINT_COLORS[r.txType] || "#374151"}">${LEDGER_TX_LABELS[r.txType] || r.txType}</span></td>
      ${productName === "All Products" ? `<td class="ellipsis">${r.entityName}</td>` : ""}
      <td class="right in">${r.qtyChange > 0 ? "+" + fmtN(r.qtyChange) : ""}</td>
      <td class="right out">${r.qtyChange < 0 ? fmtN(Math.abs(r.qtyChange)) : ""}</td>
      <td class="right bal ${r.displayBalance < 0 ? "negative" : ""}">${fmtN(r.displayBalance)}</td>
      <td class="notes">${r.notes || ""}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html lang="en">
<head>
<meta charset="utf-8"/>
<title>Stock Ledger — ${productName}</title>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
  .page { padding: 18mm 16mm; }

  /* ── Header ── */
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 2.5px solid #059669; }
  .company { font-size: 18px; font-weight: 800; color: #059669; letter-spacing: -0.5px; }
  .company-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 15px; font-weight: 700; color: #111; }
  .doc-title .period { font-size: 10px; color: #6b7280; margin-top: 4px; }
  .doc-title .printed { font-size: 9px; color: #9ca3af; margin-top: 2px; }

  /* ── Product info strip ── */
  .product-strip { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; display: flex; align-items: center; gap: 16px; }
  .product-strip .pname { font-weight: 700; font-size: 13px; color: #065f46; }
  .product-strip .pinfo { font-size: 10px; color: #374151; }
  .product-strip .sep { color: #d1d5db; }

  /* ── KPI row ── */
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
  .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
  .kpi-value { font-size: 17px; font-weight: 800; color: #111; line-height: 1; }
  .kpi-unit  { font-size: 10px; color: #6b7280; margin-left: 3px; }
  .kpi-sub   { font-size: 9px; color: #9ca3af; margin-top: 3px; }
  .kpi.green .kpi-value { color: #059669; }
  .kpi.red   .kpi-value { color: #dc2626; }
  .kpi.green { border-color: #a7f3d0; background: #f0fdf4; }
  .kpi.red   { border-color: #fecaca; background: #fff5f5; }

  /* ── Table ── */
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  .section-title span { flex: 1; height: 1px; background: #e5e7eb; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead tr th { background: #1f2937; color: #f9fafb; padding: 7px 8px; font-weight: 600; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
  th.right, td.right { text-align: right; }
  th.center, td.center { text-align: center; }
  tbody tr.even td { background: #fff; }
  tbody tr.odd td { background: #f9fafb; }
  tbody tr.opening td, tbody tr.closing td { background: #f0fdf4; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  .nowrap { white-space: nowrap; }
  .ref { font-weight: 600; color: #1d4ed8; font-size: 10px; }
  .badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 20px; }
  .in   { color: #059669; font-weight: 700; }
  .out  { color: #dc2626; font-weight: 700; }
  .bal  { font-weight: 800; color: #111; }
  .negative { color: #dc2626; }
  .notes { color: #6b7280; max-width: 140px; }
  .ellipsis { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sumrow td { background: #1f2937 !important; color: #f9fafb; font-weight: 700; font-size: 10.5px; }
  .sumrow td.in  { color: #6ee7b7; }
  .sumrow td.out { color: #fca5a5; }
  .sumrow td.bal { color: #fff; font-size: 12px; }

  /* ── Footer ── */
  .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  .sig-box { width: 150px; border-top: 1px solid #374151; padding-top: 4px; font-size: 9px; color: #374151; text-align: center; margin-top: 30px; }
  .sigs { display: flex; justify-content: space-between; margin-top: 10px; }

  @media print {
    @page { margin: 0; size: A4 landscape; }
    .page { padding: 12mm 14mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="company">${companyName || "Onesoft"}</div>
      <div class="company-sub">Hull, UK &amp; Islamabad, Pakistan</div>
    </div>
    <div class="doc-title">
      <h1>Product Stock Ledger</h1>
      <div class="period">Period: ${fmtDate(from)} — ${fmtDate(to)}</div>
      <div class="printed">Printed: ${now}</div>
    </div>
  </div>

  <!-- Product strip -->
  <div class="product-strip">
    <span class="pname">${productName}</span>
    <span class="sep">|</span>
    <span class="pinfo">Opening: <b>${fmtN(openingQty)} ${unit}</b></span>
    <span class="sep">|</span>
    <span class="pinfo">Total In: <b style="color:#059669">${fmtN(totalIn)} ${unit}</b></span>
    <span class="sep">|</span>
    <span class="pinfo">Total Out: <b style="color:#dc2626">${fmtN(totalOut)} ${unit}</b></span>
    <span class="sep">|</span>
    <span class="pinfo">Closing: <b>${fmtN(closingQty)} ${unit}</b></span>
  </div>

  <!-- KPI cards -->
  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Opening Stock</div>
      <div><span class="kpi-value">${fmtN(openingQty)}</span><span class="kpi-unit">${unit}</span></div>
      <div class="kpi-sub">as of ${fmtDate(from)}</div>
    </div>
    <div class="kpi green">
      <div class="kpi-label">Total Received</div>
      <div><span class="kpi-value">${fmtN(totalIn)}</span><span class="kpi-unit">${unit}</span></div>
      <div class="kpi-sub">${rows.filter(r => r.qtyChange > 0).length} receipt(s)</div>
    </div>
    <div class="kpi red">
      <div class="kpi-label">Total Issued</div>
      <div><span class="kpi-value">${fmtN(totalOut)}</span><span class="kpi-unit">${unit}</span></div>
      <div class="kpi-sub">${rows.filter(r => r.qtyChange < 0).length} issue(s)</div>
    </div>
    <div class="kpi ${closingQty < 0 ? "red" : "green"}">
      <div class="kpi-label">Closing Stock</div>
      <div><span class="kpi-value">${fmtN(closingQty)}</span><span class="kpi-unit">${unit}</span></div>
      <div class="kpi-sub">as of ${fmtDate(to)}</div>
    </div>
  </div>

  <!-- Table -->
  <div class="section-title">Transaction History <span></span></div>
  <table>
    <thead>
      <tr>
        <th class="center" style="width:28px">#</th>
        <th style="width:90px">Date</th>
        <th style="width:100px">Reference</th>
        <th style="width:110px">Type</th>
        ${productName === "All Products" ? "<th>Product</th>" : ""}
        <th class="right" style="width:80px">Qty In</th>
        <th class="right" style="width:80px">Qty Out</th>
        <th class="right" style="width:90px">Balance</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening">
        <td class="center">—</td>
        <td class="nowrap">${fmtDate(from)}</td>
        <td colspan="${productName === "All Products" ? 3 : 2}" style="font-style:italic;color:#374151;">Opening Balance</td>
        <td colspan="2"></td>
        <td class="right bal">${fmtN(openingQty)}</td>
        <td></td>
      </tr>
      ${rowsHtml}
      <tr class="sumrow">
        <td class="center">—</td>
        <td class="nowrap">${fmtDate(to)}</td>
        <td colspan="${productName === "All Products" ? 3 : 2}" style="font-style:italic;">Closing Balance</td>
        <td class="right in">+${fmtN(totalIn)}</td>
        <td class="right out">${fmtN(totalOut)}</td>
        <td class="right bal">${fmtN(closingQty)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <!-- Signatures -->
  <div class="sigs">
    <div class="sig-box">Prepared By</div>
    <div class="sig-box">Verified By</div>
    <div class="sig-box">Approved By</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${companyName || "Onesoft"} — Confidential</span>
    <span>${rows.length} transaction(s) in this period</span>
    <span>Printed: ${now}</span>
  </div>

</div>
</body></html>`;

  const w = window.open("", "_blank", "width=1100,height=760");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 500);
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StockLedgerPage() {
  const [, navigate]  = useLocation();

  const [search,    setSearch]    = useState("");
  const [productId, setProductId] = useState<string>("__all__");
  const [fromDate,  setFromDate]  = useState(monthStart());
  const [toDate,    setToDate]    = useState(today());
  const [txFilter,  setTxFilter]  = useState<"__all__" | LedgerTxType>("__all__");
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [revision,  setRevision]  = useState(0);

  const stocks  = useMemo(() => getStock(),       [revision]); // eslint-disable-line
  const ledger  = useMemo(() => getStockLedger(), [revision]); // eslint-disable-line
  const settings = useMemo(() => getSettings(),   []);

  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    deleteStockLedgerEntry(deleteId);
    setDeleteId(null);
    setRevision(r => r + 1);
  }, [deleteId]);

  const productOpts = useMemo(() =>
    stocks.filter(s =>
      !search ||
      s.productName.toLowerCase().includes(search.toLowerCase()) ||
      s.sku.toLowerCase().includes(search.toLowerCase())
    ).map(s => ({ id: s.id, name: s.productName, sku: s.sku, unit: s.unit })),
    [stocks, search]
  );

  const selectedStock = stocks.find(s => s.id === productId);

  const productLedger = useMemo(() => {
    const rows = productId === "__all__" ? ledger : ledger.filter(e => e.entityId === productId);
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }, [ledger, productId]);

  const openingQty = useMemo(() => {
    const before = productLedger.filter(r => r.date < fromDate);
    return before.length > 0 ? before[before.length - 1].qtyAfter : 0;
  }, [productLedger, fromDate]);

  const filtered = useMemo(() =>
    productLedger.filter(r => {
      const inRange = r.date >= fromDate && r.date <= toDate;
      const matchTx = txFilter === "__all__" || r.txType === txFilter;
      return inRange && matchTx;
    }),
    [productLedger, fromDate, toDate, txFilter]
  );

  const totalIn    = useMemo(() => filtered.filter(r => r.qtyChange > 0).reduce((s, r) => s + r.qtyChange, 0), [filtered]);
  const totalOut   = useMemo(() => filtered.filter(r => r.qtyChange < 0).reduce((s, r) => s + Math.abs(r.qtyChange), 0), [filtered]);
  const closingQty = openingQty + totalIn - totalOut;

  const filteredWithBalance = useMemo<BalancedRow[]>(() => {
    let running = openingQty;
    return filtered.map(r => { running += r.qtyChange; return { ...r, displayBalance: running }; });
  }, [filtered, openingQty]);

  const actualQty = selectedStock ? (parseFloat(selectedStock.quantity) || 0) : null;
  const hasGap    = actualQty !== null && Math.abs(actualQty - closingQty) > 0.001;
  const unit      = selectedStock?.unit || "";
  const inCount   = filtered.filter(r => r.qtyChange > 0).length;
  const outCount  = filtered.filter(r => r.qtyChange < 0).length;

  return (
    <div className="-mx-5 md:-mx-8 -my-6 md:-my-8 min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">

      {/* ── Top Header ── */}
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 md:px-6 py-0 flex items-center justify-between gap-3 h-14 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate("/stock")}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors shrink-0"
          >
            <ArrowLeft size={14}/> Stock
          </button>
          <span className="text-gray-200 dark:text-zinc-700 text-lg">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shrink-0 shadow-sm">
              <BookOpen size={13} className="text-white"/>
            </div>
            <h1 className="font-bold text-gray-900 dark:text-zinc-100 text-[15px] truncate">Product Stock Ledger</h1>
          </div>
        </div>

        <button
          onClick={() => printLedger(
            selectedStock?.productName ?? "All Products",
            fromDate, toDate, filteredWithBalance,
            openingQty, totalIn, totalOut, closingQty, unit,
            settings.companyName || "Onesoft",
          )}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold hover:bg-gray-700 dark:hover:bg-white transition-colors shadow-sm shrink-0"
        >
          <Printer size={13}/> Print / Export
        </button>
      </header>

      {/* ── Filter Bar ── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[180px] max-w-xs flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product…"
            className="w-full pl-8 pr-7 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={11}/>
            </button>
          )}
        </div>

        <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700 hidden sm:block"/>

        <label className="text-xs font-semibold text-gray-500 dark:text-zinc-400">From</label>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
          className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition"/>

        <label className="text-xs font-semibold text-gray-500 dark:text-zinc-400">To</label>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
          className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition"/>

        <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700 hidden sm:block"/>

        <div className="relative flex items-center">
          <Filter size={12} className="absolute left-2.5 text-gray-400 pointer-events-none"/>
          <select
            value={txFilter}
            onChange={e => setTxFilter(e.target.value as typeof txFilter)}
            className="appearance-none pl-7 pr-7 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none transition"
          >
            <option value="__all__">All Types</option>
            {(Object.entries(LEDGER_TX_LABELS) as [LedgerTxType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 text-gray-400 pointer-events-none"/>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Sidebar: Product list ── */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 overflow-y-auto">
          <div className="px-3 pt-3 pb-2 sticky top-0 bg-white dark:bg-zinc-900 z-10 border-b border-gray-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest">
              Products ({productOpts.length})
            </p>
          </div>

          <button
            onClick={() => setProductId("__all__")}
            className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors text-sm border-b border-gray-50 dark:border-zinc-800/60 ${
              productId === "__all__"
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold border-l-2 border-l-emerald-500"
                : "text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
            }`}
          >
            <Package size={12} className="shrink-0"/>
            <span className="truncate flex-1">All Products</span>
            <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 tabular-nums">{stocks.length}</span>
          </button>

          {productOpts.map(p => {
            const s = stocks.find(x => x.id === p.id);
            const qty = parseFloat(s?.quantity ?? "0") || 0;
            const isActive = productId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setProductId(p.id)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-all text-sm border-b border-gray-50 dark:border-zinc-800/40 ${
                  isActive
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-l-2 border-l-emerald-500"
                    : "text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate leading-snug">{p.name}</p>
                  {p.sku && <p className="text-[10px] text-gray-400 dark:text-zinc-500 truncate">{p.sku}</p>}
                </div>
                <span className={`text-xs font-bold shrink-0 tabular-nums px-1.5 py-0.5 rounded ${
                  qty <= 0 ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                  : qty < 10 ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                  : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                }`}>
                  {qty.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
                </span>
              </button>
            );
          })}

          {productOpts.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-gray-400 dark:text-zinc-500">No products found</div>
          )}
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto">

          {/* Mobile product select */}
          <div className="lg:hidden px-4 pt-3">
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 outline-none"
            >
              <option value="__all__">All Products</option>
              {stocks.map(s => <option key={s.id} value={s.id}>{s.productName} ({s.sku})</option>)}
            </select>
          </div>

          <div className="px-4 md:px-6 py-5 space-y-4">

            {/* Product title row */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100 leading-tight">
                  {selectedStock ? selectedStock.productName : "All Products"}
                </h2>
                {selectedStock ? (
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1 flex items-center flex-wrap gap-x-2 gap-y-0.5">
                    <span className="font-mono bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 px-1.5 py-0.5 rounded text-[10px]">{selectedStock.sku}</span>
                    <span>·</span>
                    <span>Store: <strong className="text-gray-600 dark:text-zinc-300">{selectedStock.store}</strong></span>
                    <span>·</span>
                    <span>Type: <strong className="text-gray-600 dark:text-zinc-300">{selectedStock.stockType}</strong></span>
                    <span>·</span>
                    <span>Unit: <strong className="text-gray-600 dark:text-zinc-300">{selectedStock.unit || "—"}</strong></span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{stocks.length} product(s) · {filtered.length} total transactions</p>
                )}
              </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Opening */}
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                    <BarChart3 size={15} className="text-slate-500 dark:text-zinc-400"/>
                  </div>
                  <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Opening Stock</span>
                </div>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-zinc-100 tabular-nums leading-none">
                  {Math.abs(openingQty).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                  {unit && <span className="text-sm font-normal text-gray-400 dark:text-zinc-500 ml-1">{unit}</span>}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1.5">as of {fmtDate(fromDate)}</p>
              </div>

              {/* Total In */}
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                    <TrendingUp size={15} className="text-emerald-600 dark:text-emerald-400"/>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Total Received</span>
                </div>
                <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums leading-none">
                  +{totalIn.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                  {unit && <span className="text-sm font-normal text-emerald-500/70 ml-1">{unit}</span>}
                </p>
                <p className="text-[10px] text-emerald-500/80 dark:text-emerald-700 mt-1.5">{inCount} receipt{inCount !== 1 ? "s" : ""}</p>
              </div>

              {/* Total Out */}
              <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
                    <TrendingDown size={15} className="text-rose-600 dark:text-rose-400"/>
                  </div>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Total Issued</span>
                </div>
                <p className="text-2xl font-extrabold text-rose-700 dark:text-rose-300 tabular-nums leading-none">
                  {totalOut.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                  {unit && <span className="text-sm font-normal text-rose-500/70 ml-1">{unit}</span>}
                </p>
                <p className="text-[10px] text-rose-500/80 dark:text-rose-700 mt-1.5">{outCount} issue{outCount !== 1 ? "s" : ""}</p>
              </div>

              {/* Closing */}
              <div className={`rounded-xl p-4 border ${
                closingQty <= 0
                  ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
                  : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    closingQty <= 0 ? "bg-red-100 dark:bg-red-900/50" : "bg-blue-100 dark:bg-blue-900/50"
                  }`}>
                    <Package size={15} className={closingQty <= 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}/>
                  </div>
                  <span className={`text-xs font-semibold ${closingQty <= 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                    Closing Stock
                  </span>
                </div>
                <p className={`text-2xl font-extrabold tabular-nums leading-none ${
                  closingQty <= 0 ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"
                }`}>
                  {closingQty.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                  {unit && <span className="text-sm font-normal opacity-60 ml-1">{unit}</span>}
                </p>
                <p className={`text-[10px] mt-1.5 ${closingQty <= 0 ? "text-red-500/80 dark:text-red-700" : "text-blue-500/80 dark:text-blue-700"}`}>
                  as of {fmtDate(toDate)}
                </p>
              </div>
            </div>

            {/* Mismatch warning */}
            {hasGap && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle size={15} className="text-amber-600"/>
                </div>
                <div className="text-sm">
                  <p className="font-bold text-amber-800 dark:text-amber-400 mb-0.5">Ledger / Stock mismatch detected</p>
                  <p className="text-amber-700 dark:text-amber-500 text-xs leading-relaxed">
                    Ledger closing is <strong>{closingQty.toLocaleString("en-GB", { maximumFractionDigits: 3 })} {unit}</strong> but actual stock card shows <strong>{actualQty!.toLocaleString("en-GB", { maximumFractionDigits: 3 })} {unit}</strong>.
                    A phantom or duplicate entry may exist — hover over a row and click the trash icon to remove it.
                  </p>
                </div>
              </div>
            )}

            {/* Ledger table */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">

              {/* Table header row */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-gray-50/80 dark:bg-zinc-800/40">
                <div className="flex items-center gap-2">
                  <BookOpen size={13} className="text-gray-400 dark:text-zinc-500"/>
                  <p className="text-sm font-bold text-gray-700 dark:text-zinc-200">Transaction History</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 dark:bg-zinc-700 text-xs font-bold text-gray-600 dark:text-zinc-300">
                    {filtered.length}
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-zinc-500">
                  {fmtDate(fromDate)} — {fmtDate(toDate)}
                </p>
              </div>

              {filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                    <BookOpen size={22} className="text-gray-300 dark:text-zinc-600"/>
                  </div>
                  <p className="text-sm font-semibold text-gray-500 dark:text-zinc-400">No transactions in this period</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Try adjusting the date range or transaction type filter</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800 dark:bg-zinc-950 text-[11px] font-semibold tracking-wide uppercase text-gray-100 dark:text-zinc-300">
                        <th className="text-center px-3 py-3 w-9">#</th>
                        <th className="text-left px-4 py-3 whitespace-nowrap">Date</th>
                        <th className="text-left px-4 py-3">Reference</th>
                        <th className="text-left px-4 py-3">Type</th>
                        {productId === "__all__" && <th className="text-left px-4 py-3">Product</th>}
                        <th className="text-right px-4 py-3 text-emerald-400">Qty In</th>
                        <th className="text-right px-4 py-3 text-rose-400">Qty Out</th>
                        <th className="text-right px-4 py-3">Balance</th>
                        <th className="text-left px-4 py-3">Notes</th>
                        <th className="w-9 px-2 py-3"/>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">

                      {/* Opening row */}
                      <tr className="bg-slate-50 dark:bg-zinc-800/30">
                        <td className="text-center px-3 py-2.5 text-xs text-gray-300 dark:text-zinc-600">—</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-zinc-400 whitespace-nowrap">{fmtDate(fromDate)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-zinc-500 italic"
                            colSpan={productId === "__all__" ? 3 : 2}>Opening Balance</td>
                        <td colSpan={2}/>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-700 dark:text-zinc-300">
                          {openingQty.toLocaleString("en-GB", { maximumFractionDigits: 3 })}
                          {unit && <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>}
                        </td>
                        <td colSpan={2}/>
                      </tr>

                      {filteredWithBalance.map((row, idx) => (
                        <tr key={row.id}
                            className={`transition-colors group ${idx % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-slate-50/60 dark:bg-zinc-800/20"} hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20`}>
                          <td className="text-center px-3 py-2.5 text-xs text-gray-300 dark:text-zinc-600 tabular-nums">{idx + 1}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 dark:text-zinc-400 text-xs font-medium">
                            {fmtDate(row.date)}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.reference
                              ? <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded">{row.reference}</span>
                              : <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${TX_COLORS[row.txType] || "bg-gray-100 text-gray-600"}`}>
                              {LEDGER_TX_LABELS[row.txType] || row.txType}
                            </span>
                          </td>
                          {productId === "__all__" && (
                            <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-zinc-300 max-w-[140px] truncate">{row.entityName}</td>
                          )}
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.qtyChange > 0
                              ? <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">+{row.qtyChange.toLocaleString("en-GB", { maximumFractionDigits: 3 })}</span>
                              : <span className="text-gray-200 dark:text-zinc-800">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.qtyChange < 0
                              ? <span className="text-rose-600 dark:text-rose-400 font-bold text-sm">{Math.abs(row.qtyChange).toLocaleString("en-GB", { maximumFractionDigits: 3 })}</span>
                              : <span className="text-gray-200 dark:text-zinc-800">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            <span className={`font-extrabold text-sm ${
                              row.displayBalance < 0 ? "text-red-600 dark:text-red-400"
                              : row.displayBalance === 0 ? "text-gray-400 dark:text-zinc-600"
                              : "text-gray-900 dark:text-zinc-100"
                            }`}>
                              {row.displayBalance.toLocaleString("en-GB", { maximumFractionDigits: 3 })}
                              {unit && <span className="text-[10px] font-normal text-gray-400 dark:text-zinc-600 ml-1">{unit}</span>}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-zinc-500 max-w-[160px] truncate">
                            {row.notes || <span className="text-gray-200 dark:text-zinc-800">—</span>}
                          </td>
                          <td className="px-2 py-2.5">
                            <button
                              onClick={() => setDeleteId(row.id)}
                              title="Delete entry"
                              className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                            >
                              <Trash2 size={12}/>
                            </button>
                          </td>
                        </tr>
                      ))}

                      {/* Closing summary row */}
                      <tr className="bg-gray-800 dark:bg-zinc-950 text-white">
                        <td className="text-center px-3 py-3 text-xs text-gray-400">—</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(toDate)}</td>
                        <td className="px-4 py-3 text-xs text-gray-300 italic" colSpan={productId === "__all__" ? 3 : 2}>Closing Balance</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-bold text-sm tabular-nums">
                          +{totalIn.toLocaleString("en-GB", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3 text-right text-rose-400 font-bold text-sm tabular-nums">
                          {totalOut.toLocaleString("en-GB", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-extrabold text-base tabular-nums ${closingQty < 0 ? "text-red-400" : "text-white"}`}>
                            {closingQty.toLocaleString("en-GB", { maximumFractionDigits: 3 })}
                            {unit && <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>}
                          </span>
                        </td>
                        <td colSpan={2}/>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-700 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-500"/>
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-zinc-100">Delete ledger entry?</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  This will permanently remove this transaction from the stock ledger. The running balances will recalculate automatically.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
              >
                Delete Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
