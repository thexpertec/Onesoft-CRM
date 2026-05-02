import { useState, useMemo } from "react";
import {
  getSales, getInvoices, getSaleReturns, getPurchaseReturns,
  getJournalEntries, getRPVouchers, getPaymentAccounts,
  type Sale, type Invoice, type SaleReturn, type PurchaseReturn,
  type JournalEntry, type RPVoucher,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import {
  ArrowUpRight, ArrowDownLeft, RefreshCw, BookOpen, FileText,
  CreditCard, Search, Download, Filter, ChevronDown, ChevronUp,
  X, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const dp = getSettingsDecimalPlaces();
const sym = getSettingsCurrencySymbol();
const fmt = (n: number) => `${sym}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

// ─── Unified row ──────────────────────────────────────────────────────────────

type TxnType =
  | "Sale (POS)"
  | "Sale Invoice"
  | "Purchase Invoice"
  | "Sale Return"
  | "Purchase Return"
  | "Journal Entry"
  | "Receipt Voucher"
  | "Payment Voucher";

type TxnRow = {
  id:             string;
  date:           string;
  type:           TxnType;
  reference:      string;
  party:          string;
  payAccount:     string;   // payment method / account name
  debit:          number;   // money OUT / expense
  credit:         number;   // money IN / income
  status:         string;
  notes:          string;
  sourceId:       string;
};

// ── local total helpers ───────────────────────────────────────────────────────

function calcSaleTotal(sale: Sale): number {
  const sub = sale.items.reduce((s, i) => {
    const p = parseFloat(i.unitPrice) || 0;
    const q = parseFloat(i.qty)      || 0;
    const d = parseFloat(i.discount) || 0;
    return s + q * p * (1 - d / 100);
  }, 0);
  const tax      = sub * ((parseFloat(sale.taxRate || "0")) / 100);
  const delivery = parseFloat(sale.deliveryCharges || "0") || 0;
  const disc     = (() => {
    const v = parseFloat(sale.invoiceDiscount || "0") || 0;
    if (!v) return 0;
    return sale.invoiceDiscountType === "pct" ? sub * v / 100 : v;
  })();
  return sub + tax + delivery - disc;
}

function calcInvoiceTotal(inv: Invoice): number {
  const sub = inv.items.reduce((s, i) => {
    const p = parseFloat(i.unitPrice) || 0;
    const q = parseFloat(i.qty)      || 0;
    const d = parseFloat(i.discount) || 0;
    return s + q * p * (1 - d / 100);
  }, 0);
  const tax      = sub * ((parseFloat(inv.taxRate || "0")) / 100);
  const shipping = parseFloat(inv.shippingFee || "0") || 0;
  const handling = parseFloat(inv.handlingFee || "0") || 0;
  return sub + tax + shipping + handling;
}

// ── Build unified rows ────────────────────────────────────────────────────────

function buildRows(): TxnRow[] {
  const rows: TxnRow[] = [];

  // 1. Sales (POS)
  for (const s of getSales()) {
    if (s.status === "Draft") continue;
    const total = calcSaleTotal(s);
    rows.push({
      id:         s.id,
      date:       s.saleDate,
      type:       "Sale (POS)",
      reference:  s.saleNumber,
      party:      s.customer || "Walk-in",
      payAccount: s.paymentMethod || "",
      credit:     total,
      debit:      0,
      status:     s.status,
      notes:      s.notes || "",
      sourceId:   s.id,
    });
  }

  // 2. Invoices (sale + purchase)
  for (const inv of getInvoices()) {
    const isPurchase = inv.invoiceType === "purchase";
    const total = calcInvoiceTotal(inv);
    rows.push({
      id:         inv.id,
      date:       inv.invoiceDate,
      type:       isPurchase ? "Purchase Invoice" : "Sale Invoice",
      reference:  inv.invoiceNumber,
      party:      inv.customer,
      payAccount: inv.paymentMethod || "",
      credit:     isPurchase ? 0 : total,
      debit:      isPurchase ? total : 0,
      status:     inv.status,
      notes:      inv.notes || "",
      sourceId:   inv.id,
    });
  }

  // 3. Sale Returns
  for (const sr of getSaleReturns()) {
    rows.push({
      id:         sr.id,
      date:       sr.date,
      type:       "Sale Return",
      reference:  sr.returnNumber,
      party:      sr.customer,
      payAccount: sr.refundMethod || "",
      credit:     0,
      debit:      sr.grandTotal,
      status:     sr.status,
      notes:      sr.reason || sr.notes || "",
      sourceId:   sr.id,
    });
  }

  // 4. Purchase Returns
  for (const pr of getPurchaseReturns()) {
    rows.push({
      id:         pr.id,
      date:       pr.date,
      type:       "Purchase Return",
      reference:  pr.returnNumber,
      party:      pr.supplier,
      payAccount: pr.refundMethod || "",
      credit:     pr.grandTotal,
      debit:      0,
      status:     pr.status,
      notes:      pr.reason || pr.notes || "",
      sourceId:   pr.id,
    });
  }

  // 5. Journal Entries
  for (const je of getJournalEntries()) {
    rows.push({
      id:         je.id,
      date:       je.date,
      type:       "Journal Entry",
      reference:  je.reference,
      party:      "",
      payAccount: "",
      credit:     je.totalCredit,
      debit:      je.totalDebit,
      status:     je.status,
      notes:      je.description || "",
      sourceId:   je.id,
    });
  }

  // 6. Receipt & Payment Vouchers
  for (const v of getRPVouchers()) {
    const isReceipt = v.voucherType === "receipt";
    rows.push({
      id:         v.id,
      date:       v.date,
      type:       isReceipt ? "Receipt Voucher" : "Payment Voucher",
      reference:  v.voucherNumber,
      party:      v.partyName,
      payAccount: v.cashBankAccountName || "",
      credit:     isReceipt ? v.totalAmount : 0,
      debit:      isReceipt ? 0 : v.totalAmount,
      status:     v.status,
      notes:      v.narration || "",
      sourceId:   v.id,
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

// ─── Type meta ────────────────────────────────────────────────────────────────

const TYPE_META: Record<TxnType, { color: string; icon: React.ReactNode }> = {
  "Sale (POS)":       { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: <ArrowUpRight size={10} /> },
  "Sale Invoice":     { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",             icon: <ArrowUpRight size={10} /> },
  "Purchase Invoice": { color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",     icon: <ArrowDownLeft size={10} /> },
  "Sale Return":      { color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",                 icon: <RefreshCw size={10} /> },
  "Purchase Return":  { color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",     icon: <RefreshCw size={10} /> },
  "Journal Entry":    { color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",                icon: <BookOpen size={10} /> },
  "Receipt Voucher":  { color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",             icon: <CreditCard size={10} /> },
  "Payment Voucher":  { color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",             icon: <CreditCard size={10} /> },
};

const STATUS_COLOR: Record<string, string> = {
  Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  posted:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Posted:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Draft:     "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  draft:     "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Paid:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Unpaid:    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Partial:   "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  Overdue:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const ALL_TYPES: TxnType[] = [
  "Sale (POS)", "Sale Invoice", "Purchase Invoice",
  "Sale Return", "Purchase Return",
  "Journal Entry", "Receipt Voucher", "Payment Voucher",
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionHistoryPage() {
  const allRows  = useMemo(() => buildRows(), []);
  const payAccounts = useMemo(() =>
    getPaymentAccounts().filter(a => a.isActive !== false).map(a => a.accountTitle),
  []);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [dateFrom,    setDateFrom]    = useState(monthStart());
  const [dateTo,      setDateTo]      = useState(today());
  const [typeFilter,  setTypeFilter]  = useState<TxnType | "">("");
  const [payFilter,   setPayFilter]   = useState("");
  const [statusFilter,setStatusFilter]= useState("");
  const [partySearch, setPartySearch] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    return allRows.filter(r => {
      if (dateFrom  && r.date < dateFrom)            return false;
      if (dateTo    && r.date > dateTo)              return false;
      if (typeFilter && r.type !== typeFilter)       return false;
      if (statusFilter && r.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (partySearch && !r.party.toLowerCase().includes(partySearch.toLowerCase()) &&
          !r.reference.toLowerCase().includes(partySearch.toLowerCase()) &&
          !r.notes.toLowerCase().includes(partySearch.toLowerCase())) return false;
      if (payFilter) {
        const pa = r.payAccount.toLowerCase();
        const pf = payFilter.toLowerCase();
        if (!pa.includes(pf)) return false;
      }
      return true;
    });
  }, [allRows, dateFrom, dateTo, typeFilter, payFilter, statusFilter, partySearch]);

  // ── Summary stats ────────────────────────────────────────────────────────
  const totCredit = useMemo(() => rows.reduce((s, r) => s + r.credit, 0), [rows]);
  const totDebit  = useMemo(() => rows.reduce((s, r) => s + r.debit,  0), [rows]);
  const net       = totCredit - totDebit;

  // ── CSV export ───────────────────────────────────────────────────────────
  const exportCsv = () => {
    const hdr = ["Date","Type","Reference","Party","Payment Account","Debit","Credit","Status","Notes"];
    const lines = rows.map(r =>
      [r.date, r.type, r.reference, r.party, r.payAccount,
       r.debit.toFixed(dp), r.credit.toFixed(dp), r.status, r.notes]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[hdr.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transactions-${dateFrom}-${dateTo}.csv`;
    a.click();
  };

  const clearFilters = () => {
    setDateFrom(monthStart()); setDateTo(today());
    setTypeFilter(""); setPayFilter(""); setStatusFilter(""); setPartySearch("");
  };

  const hasActiveFilter = typeFilter || payFilter || statusFilter || partySearch;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm">
              <FileText size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">Transaction History</h1>
              <p className="text-[11px] text-gray-400">All transactions · Sales, Purchases, Returns, Vouchers, Journal Entries</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] font-medium transition-colors ${showFilters ? "border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-400" : "border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"}`}
            >
              <Filter size={12} /> Filters {showFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">

        {/* ── Filter panel ─────────────────────────────────────────────────── */}
        {showFilters && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

              {/* Date From */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-full h-8 text-[12px] px-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              {/* Date To */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-full h-8 text-[12px] px-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              {/* Type */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as TxnType | "")}
                  className="w-full h-8 text-[12px] px-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">All Types</option>
                  {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Payment Account */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payment Account</label>
                <select value={payFilter} onChange={e => setPayFilter(e.target.value)}
                  className="w-full h-8 text-[12px] px-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">All Accounts</option>
                  {payAccounts.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="w-full h-8 text-[12px] px-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">All Statuses</option>
                  <option value="posted">Posted</option>
                  <option value="completed">Completed</option>
                  <option value="paid">Paid</option>
                  <option value="draft">Draft</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>

              {/* Party / Search */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Party / Ref</label>
                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={partySearch} onChange={e => setPartySearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full h-8 pl-6 pr-2 text-[12px] border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
            </div>

            {hasActiveFilter && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Active filters:</span>
                {typeFilter   && <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-medium">{typeFilter}</span>}
                {payFilter    && <span className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[11px] font-medium">{payFilter}</span>}
                {statusFilter && <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[11px] font-medium">{statusFilter}</span>}
                {partySearch  && <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] font-medium">"{partySearch}"</span>}
                <button onClick={clearFilters} className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 ml-1">
                  <X size={11} /> Clear
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── KPI summary ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <TrendingUp size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Credit (In)</p>
              <p className="text-[20px] font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">{fmt(totCredit)}</p>
              <p className="text-[10px] text-muted-foreground">{rows.filter(r => r.credit > 0).length} transactions</p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <TrendingDown size={18} className="text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Debit (Out)</p>
              <p className="text-[20px] font-black text-red-600 dark:text-red-400 tabular-nums leading-tight">{fmt(totDebit)}</p>
              <p className="text-[10px] text-muted-foreground">{rows.filter(r => r.debit > 0).length} transactions</p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${net >= 0 ? "bg-blue-100 dark:bg-blue-900/40" : "bg-orange-100 dark:bg-orange-900/40"}`}>
              <Minus size={18} className={net >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Net</p>
              <p className={`text-[20px] font-black tabular-nums leading-tight ${net >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}>
                {net >= 0 ? "+" : "-"}{fmt(net)}
              </p>
              <p className="text-[10px] text-muted-foreground">{rows.length} total records</p>
            </div>
          </div>
        </div>

        {/* ── Transactions table ────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">

          {/* Table header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/40">
            <span className="text-[12px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              {rows.length} Transaction{rows.length !== 1 ? "s" : ""}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {dateFrom} → {dateTo}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <FileText size={32} className="opacity-20" />
              <p className="text-sm font-medium">No transactions found</p>
              <p className="text-[11px]">Try adjusting the date range or filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]" style={{ minWidth: 860 }}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700">
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-24">Date</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-36">Type</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-32">Reference</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Party</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-32">Payment Account</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-blue-500 uppercase tracking-wider w-28">Credit</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-red-500 uppercase tracking-wider w-28">Debit</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-24">Status</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const meta = TYPE_META[row.type];
                    const stColor = STATUS_COLOR[row.status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
                    return (
                      <tr key={row.id}
                        className={`border-b border-gray-100 dark:border-zinc-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors ${idx % 2 === 1 ? "bg-gray-50/40 dark:bg-zinc-800/10" : ""}`}
                      >
                        {/* Date */}
                        <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 font-mono whitespace-nowrap">
                          {row.date}
                        </td>

                        {/* Type badge */}
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.color}`}>
                            {meta.icon} {row.type}
                          </span>
                        </td>

                        {/* Reference */}
                        <td className="px-3 py-2.5 font-mono font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {row.reference}
                        </td>

                        {/* Party */}
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 max-w-[160px] truncate" title={row.party}>
                          {row.party || <span className="text-muted-foreground italic">—</span>}
                        </td>

                        {/* Payment Account */}
                        <td className="px-3 py-2.5">
                          {row.payAccount ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium">
                              <CreditCard size={9} /> {row.payAccount}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Credit */}
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {row.credit > 0
                            ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(row.credit)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>

                        {/* Debit */}
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {row.debit > 0
                            ? <span className="font-semibold text-red-600 dark:text-red-400">{fmt(row.debit)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${stColor}`}>
                            {row.status}
                          </span>
                        </td>

                        {/* Notes */}
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 max-w-[220px] truncate text-[11px]" title={row.notes}>
                          {row.notes || <span className="text-muted-foreground/40">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Totals footer */}
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-zinc-800/60 border-t-2 border-gray-200 dark:border-zinc-700">
                    <td colSpan={5} className="px-4 py-3 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Totals ({rows.length} records)
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400 text-[13px]">
                      {fmt(totCredit)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-red-600 dark:text-red-400 text-[13px]">
                      {fmt(totDebit)}
                    </td>
                    <td colSpan={2} className={`px-3 py-3 text-[11px] font-bold ${net >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}>
                      Net: {net >= 0 ? "+" : "-"}{fmt(net)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
