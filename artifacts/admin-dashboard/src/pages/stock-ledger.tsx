import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  getStock, getStockLedger,
  StockLedgerEntry, LedgerTxType, LEDGER_TX_LABELS,
} from "@/lib/store";
import {
  BookOpen, Search, Printer, ArrowLeft,
  TrendingUp, TrendingDown, Package, BarChart3,
  Filter, X,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const today    = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const fmtQty   = (n: number, unit = "") =>
  `${n >= 0 ? "+" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: 3 })}${unit ? " " + unit : ""}`;
const absQty   = (n: number, unit = "") =>
  `${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 3 })}${unit ? " " + unit : ""}`;

const TX_COLORS: Record<LedgerTxType, string> = {
  "purchase-receipt": "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  "sale":             "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  "sale-refund":      "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  "mfg-input":        "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  "mfg-output":       "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  "manual-adjustment":"bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  "opening-balance":  "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400",
};

function kpiCard(label: string, value: string, sub: string, icon: React.ReactNode, color: string) {
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-zinc-100 leading-tight">{value}</p>
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

// ─── Print ────────────────────────────────────────────────────────────────────
function printLedger(
  productName: string,
  from: string,
  to: string,
  rows: StockLedgerEntry[],
  openingQty: number,
  totalIn: number,
  totalOut: number,
  closingQty: number,
  unit: string,
) {
  const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8"/><title>Stock Ledger — ${productName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',sans-serif;font-size:12px;color:#111;padding:24px;}
  h1{font-size:18px;font-weight:700;margin-bottom:2px;}
  .sub{color:#555;font-size:11px;margin-bottom:16px;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px;}
  .kpi label{font-size:10px;color:#666;display:block;}
  .kpi span{font-size:15px;font-weight:700;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  th{background:#f3f4f6;text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb;font-weight:600;white-space:nowrap;}
  td{padding:5px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;}
  tr:hover td{background:#fafafa;}
  .in{color:#059669;font-weight:600;}
  .out{color:#dc2626;font-weight:600;}
  .bal{font-weight:700;}
  @media print{@page{margin:1cm;size:A4 landscape;}}
</style></head>
<body>
<h1>Product Stock Ledger</h1>
<p class="sub">Product: <b>${productName}</b> &nbsp;|&nbsp; Period: ${from} to ${to}</p>
<div class="kpis">
  <div class="kpi"><label>Opening Stock</label><span>${openingQty.toLocaleString(undefined,{maximumFractionDigits:3})} ${unit}</span></div>
  <div class="kpi"><label>Total In</label><span class="in">${totalIn.toLocaleString(undefined,{maximumFractionDigits:3})} ${unit}</span></div>
  <div class="kpi"><label>Total Out</label><span class="out">${totalOut.toLocaleString(undefined,{maximumFractionDigits:3})} ${unit}</span></div>
  <div class="kpi"><label>Closing Stock</label><span>${closingQty.toLocaleString(undefined,{maximumFractionDigits:3})} ${unit}</span></div>
</div>
<table>
<thead><tr>
  <th>#</th><th>Date</th><th>Reference</th><th>Type</th>
  <th>Qty In</th><th>Qty Out</th><th>Balance</th><th>Notes</th>
</tr></thead>
<tbody>
${rows.map((r,i) => `<tr>
  <td>${i+1}</td>
  <td>${r.date}</td>
  <td>${r.reference || "—"}</td>
  <td>${LEDGER_TX_LABELS[r.txType] || r.txType}</td>
  <td class="in">${r.qtyChange > 0 ? r.qtyChange.toLocaleString(undefined,{maximumFractionDigits:3}) : ""}</td>
  <td class="out">${r.qtyChange < 0 ? Math.abs(r.qtyChange).toLocaleString(undefined,{maximumFractionDigits:3}) : ""}</td>
  <td class="bal">${r.qtyAfter.toLocaleString(undefined,{maximumFractionDigits:3})}</td>
  <td>${r.notes || ""}</td>
</tr>`).join("")}
</tbody></table>
<p style="margin-top:20px;font-size:10px;color:#999;">Printed ${new Date().toLocaleString()}</p>
</body></html>`;
  const w = window.open("", "_blank", "width=1050,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StockLedgerPage() {
  const [, navigate]   = useLocation();

  // Filters
  const [search,    setSearch]    = useState("");
  const [productId, setProductId] = useState<string>("__all__");
  const [fromDate,  setFromDate]  = useState(monthStart());
  const [toDate,    setToDate]    = useState(today());
  const [txFilter,  setTxFilter]  = useState<"__all__" | LedgerTxType>("__all__");

  const stocks  = useMemo(() => getStock(), []);
  const ledger  = useMemo(() => getStockLedger(), []);

  // Product options (deduplicated by id)
  const productOpts = useMemo(() =>
    stocks
      .filter(s => !search || s.productName.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase()))
      .map(s => ({ id: s.id, name: s.productName, sku: s.sku, unit: s.unit })),
    [stocks, search]
  );

  const selectedStock = stocks.find(s => s.id === productId);

  // Ledger rows for selected product, sorted by date then createdAt
  const productLedger = useMemo(() => {
    let rows = productId === "__all__" ? ledger : ledger.filter(e => e.entityId === productId);
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }, [ledger, productId]);

  // Opening balance = qtyAfter of last row BEFORE fromDate
  const openingQty = useMemo(() => {
    const before = productLedger.filter(r => r.date < fromDate);
    return before.length > 0 ? before[before.length - 1].qtyAfter : 0;
  }, [productLedger, fromDate]);

  // Filter to the selected date range and tx type
  const filtered = useMemo(() => {
    return productLedger.filter(r => {
      const inRange = r.date >= fromDate && r.date <= toDate;
      const matchTx = txFilter === "__all__" || r.txType === txFilter;
      return inRange && matchTx;
    });
  }, [productLedger, fromDate, toDate, txFilter]);

  const totalIn  = useMemo(() => filtered.filter(r => r.qtyChange > 0).reduce((s, r) => s + r.qtyChange, 0), [filtered]);
  const totalOut = useMemo(() => filtered.filter(r => r.qtyChange < 0).reduce((s, r) => s + Math.abs(r.qtyChange), 0), [filtered]);
  const closingQty = openingQty + totalIn - totalOut;

  const unit = selectedStock?.unit || "";

  return (
    <div className="-mx-5 md:-mx-8 -my-6 md:-my-8 min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col">

      {/* ── Header ── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 md:px-6 py-4 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/stock")}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft size={15}/> Stock
          </button>
          <span className="text-gray-300 dark:text-zinc-700">/</span>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center shrink-0">
              <BookOpen size={14} className="text-white"/>
            </div>
            <h1 className="font-bold text-gray-900 dark:text-zinc-100 text-base">Product Stock Ledger</h1>
          </div>
        </div>
        <button
          onClick={() => printLedger(
            selectedStock?.productName ?? "All Products",
            fromDate, toDate, filtered,
            openingQty, totalIn, totalOut, closingQty, unit,
          )}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <Printer size={14}/> Print
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 md:px-6 py-3 flex flex-wrap items-center gap-3">

        {/* Product search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12}/>
            </button>
          )}
        </div>

        {/* From date */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 whitespace-nowrap">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"/>
        </div>

        {/* To date */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 whitespace-nowrap">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"/>
        </div>

        {/* Tx type filter */}
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400 shrink-0"/>
          <select
            value={txFilter}
            onChange={e => setTxFilter(e.target.value as typeof txFilter)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="__all__">All Types</option>
            {(Object.entries(LEDGER_TX_LABELS) as [LedgerTxType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Body: product list + ledger ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Product list sidebar */}
        <div className="hidden lg:flex flex-col w-64 shrink-0 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-zinc-800">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Products ({productOpts.length})</p>
          </div>

          {/* All products option */}
          <button
            onClick={() => setProductId("__all__")}
            className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors text-sm border-b border-gray-100 dark:border-zinc-800 ${
              productId === "__all__"
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold"
                : "text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
            }`}
          >
            <Package size={13} className="shrink-0"/>
            <span className="truncate">All Products</span>
          </button>

          {productOpts.map(p => {
            const s = stocks.find(x => x.id === p.id);
            const qty = parseFloat(s?.quantity ?? "0") || 0;
            return (
              <button
                key={p.id}
                onClick={() => setProductId(p.id)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors border-b border-gray-100 dark:border-zinc-800/50 ${
                  productId === p.id
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                    : "text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate font-medium ${productId === p.id ? "" : ""}`}>{p.name}</p>
                  {p.sku && <p className="text-[10px] text-gray-400 dark:text-zinc-500 truncate">{p.sku}</p>}
                </div>
                <span className={`text-xs font-bold shrink-0 tabular-nums ${
                  qty <= 0 ? "text-red-500" : qty < 10 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"
                }`}>{qty.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              </button>
            );
          })}

          {productOpts.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-zinc-500">No products found</div>
          )}
        </div>

        {/* Mobile product selector */}
        <div className="lg:hidden absolute top-[140px] left-4 right-4 z-10">
          <select
            value={productId}
            onChange={e => setProductId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 outline-none"
          >
            <option value="__all__">All Products</option>
            {stocks.map(s => <option key={s.id} value={s.id}>{s.productName} ({s.sku})</option>)}
          </select>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-5">

          {/* Product title */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">
              {selectedStock ? selectedStock.productName : "All Products"}
            </h2>
            {selectedStock?.sku && (
              <p className="text-sm text-gray-500 dark:text-zinc-400">SKU: {selectedStock.sku} &nbsp;·&nbsp; Store: {selectedStock.store} &nbsp;·&nbsp; Type: {selectedStock.stockType}</p>
            )}
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpiCard(
              "Opening Stock", absQty(openingQty, unit), `as of ${fromDate}`,
              <BarChart3 size={16} className="text-gray-600 dark:text-zinc-300"/>,
              "bg-gray-100 dark:bg-zinc-800"
            )}
            {kpiCard(
              "Total In", absQty(totalIn, unit), `${filtered.filter(r => r.qtyChange > 0).length} receipt(s)`,
              <TrendingUp size={16} className="text-emerald-600"/>,
              "bg-emerald-50 dark:bg-emerald-950/40"
            )}
            {kpiCard(
              "Total Out", absQty(totalOut, unit), `${filtered.filter(r => r.qtyChange < 0).length} issue(s)`,
              <TrendingDown size={16} className="text-red-500"/>,
              "bg-red-50 dark:bg-red-950/40"
            )}
            {kpiCard(
              "Closing Stock", absQty(closingQty, unit), `as of ${toDate}`,
              <Package size={16} className={closingQty <= 0 ? "text-red-500" : "text-emerald-600"}/>,
              closingQty <= 0 ? "bg-red-50 dark:bg-red-950/40" : "bg-emerald-50 dark:bg-emerald-950/40"
            )}
          </div>

          {/* Ledger table */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200">
                Transaction History
                <span className="ml-2 text-xs font-normal text-gray-400 dark:text-zinc-500">({filtered.length} entries)</span>
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <BookOpen size={36} className="mx-auto mb-3 text-gray-300 dark:text-zinc-700"/>
                <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">No transactions in this period</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Adjust the date range or select a different product</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-zinc-800/60 text-xs uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                      <th className="text-left px-4 py-3 font-semibold w-8">#</th>
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Reference</th>
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      {productId === "__all__" && (
                        <th className="text-left px-4 py-3 font-semibold">Product</th>
                      )}
                      <th className="text-right px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">Qty In</th>
                      <th className="text-right px-4 py-3 font-semibold text-red-500">Qty Out</th>
                      <th className="text-right px-4 py-3 font-semibold">Balance</th>
                      <th className="text-left px-4 py-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {/* Opening balance row */}
                    <tr className="bg-gray-50/70 dark:bg-zinc-800/30">
                      <td className="px-4 py-2.5 text-gray-400 dark:text-zinc-600 text-xs">—</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-zinc-400">{fromDate}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-zinc-400 italic" colSpan={productId === "__all__" ? 3 : 2}>Opening Balance</td>
                      <td className="px-4 py-2.5" colSpan={2}/>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-700 dark:text-zinc-300">
                        {openingQty.toLocaleString(undefined, { maximumFractionDigits: 3 })} {unit}
                      </td>
                      <td className="px-4 py-2.5"/>
                    </tr>

                    {filtered.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-zinc-600">{idx + 1}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-zinc-300 font-medium text-xs">
                          {new Date(row.date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.reference ? (
                            <span className="text-blue-600 dark:text-blue-400 font-medium text-xs">{row.reference}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-zinc-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${TX_COLORS[row.txType] || "bg-gray-100 text-gray-600"}`}>
                            {LEDGER_TX_LABELS[row.txType] || row.txType}
                          </span>
                        </td>
                        {productId === "__all__" && (
                          <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-zinc-300 max-w-[150px] truncate">{row.entityName}</td>
                        )}
                        <td className="px-4 py-2.5 text-right">
                          {row.qtyChange > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                              +{row.qtyChange.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                            </span>
                          ) : <span className="text-gray-300 dark:text-zinc-700">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.qtyChange < 0 ? (
                            <span className="text-red-500 font-bold text-sm">
                              {Math.abs(row.qtyChange).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                            </span>
                          ) : <span className="text-gray-300 dark:text-zinc-700">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-bold text-sm ${row.qtyAfter <= 0 ? "text-red-500" : row.qtyAfter < 5 ? "text-amber-500" : "text-gray-800 dark:text-zinc-100"}`}>
                            {row.qtyAfter.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                            {unit && <span className="text-xs font-normal text-gray-400 dark:text-zinc-500 ml-1">{unit}</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-zinc-400 max-w-[160px] truncate">
                          {row.notes || "—"}
                        </td>
                      </tr>
                    ))}

                    {/* Closing balance row */}
                    <tr className="bg-emerald-50/50 dark:bg-emerald-950/20 font-semibold">
                      <td className="px-4 py-2.5 text-gray-400 dark:text-zinc-600 text-xs">—</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-zinc-400">{toDate}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-zinc-300 italic" colSpan={productId === "__all__" ? 3 : 2}>Closing Balance</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                        +{totalIn.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-500 text-sm font-bold">
                        {totalOut.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-base font-bold ${closingQty <= 0 ? "text-red-500" : "text-gray-900 dark:text-zinc-100"}`}>
                          {closingQty.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                          {unit && <span className="text-xs font-normal text-gray-400 dark:text-zinc-500 ml-1">{unit}</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5"/>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
