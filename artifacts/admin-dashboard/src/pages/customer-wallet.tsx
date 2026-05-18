import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  getCustomer, getWalletLedger, WalletTransaction, WalletTxType,
  getCustomerWalletBalance, fundCustomerWallet, adjustCustomerWallet,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { formatAmount } from "@/lib/currencies";
import {
  ArrowLeft, Wallet, TrendingUp, TrendingDown, Printer,
  Search, X, Calendar, ArrowUpRight, ArrowDownLeft,
  PlusCircle, MinusCircle, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const today      = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const fmtDate    = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const TX_META: Record<WalletTxType, { label: string; color: string; icon: React.ReactNode; credit: boolean }> = {
  "funded":        { label: "Funded",        color: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300", icon: <TrendingUp size={11}/>,    credit: true  },
  "used":          { label: "Used",           color: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300",           icon: <TrendingDown size={11}/>,   credit: false },
  "manual-credit": { label: "Manual Credit",  color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",           icon: <ArrowUpRight size={11}/>,   credit: true  },
  "manual-debit":  { label: "Manual Debit",   color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",       icon: <ArrowDownLeft size={11}/>,  credit: false },
  "refund":        { label: "Refund",         color: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",   icon: <RefreshCw size={11}/>,      credit: true  },
};

// ─── Manual Adjustment Dialog ─────────────────────────────────────────────────
interface AdjustDialogProps {
  open:       boolean;
  onClose:    () => void;
  customerId: string;
  onDone:     () => void;
}
function AdjustDialog({ open, onClose, customerId, onDone }: AdjustDialogProps) {
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();
  const [dir,    setDir]    = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [ref,    setRef]    = useState("");
  const [note,   setNote]   = useState("");
  const { toast } = useToast();

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    const delta = dir === "credit" ? amt : -amt;
    adjustCustomerWallet(customerId, delta, ref || undefined, note || undefined);
    toast({ title: dir === "credit" ? "Wallet credited" : "Wallet debited", description: `${sym}${amt.toFixed(dp)}` });
    setAmount(""); setRef(""); setNote("");
    onDone();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <Wallet size={16} className="text-blue-500"/> Manual Wallet Adjustment
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-2">
            {(["credit", "debit"] as const).map(d => (
              <button key={d} onClick={() => setDir(d)}
                className={`py-2 rounded-xl border-2 text-[13px] font-bold flex items-center justify-center gap-2 transition-all ${
                  dir === d
                    ? d === "credit"
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                      : "border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400"
                    : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600"
                }`}>
                {d === "credit" ? <PlusCircle size={13}/> : <MinusCircle size={13}/>}
                {d === "credit" ? "Credit" : "Debit"}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">{sym}</span>
              <input
                type="number" min="0.01" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Reference</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Invoice # / sale # / etc."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"/>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for adjustment"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"/>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}
            className={dir === "credit" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}>
            {dir === "credit" ? "Credit Wallet" : "Debit Wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fund Wallet Dialog ───────────────────────────────────────────────────────
interface FundDialogProps {
  open:       boolean;
  onClose:    () => void;
  customerId: string;
  onDone:     () => void;
}
function FundDialog({ open, onClose, customerId, onDone }: FundDialogProps) {
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();
  const [amount, setAmount] = useState("");
  const [ref,    setRef]    = useState("");
  const [note,   setNote]   = useState("");
  const { toast } = useToast();

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    fundCustomerWallet(customerId, amt, ref || undefined, note || "Manual wallet top-up");
    toast({ title: "Wallet funded", description: `${sym}${amt.toFixed(dp)} added` });
    setAmount(""); setRef(""); setNote("");
    onDone();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <PlusCircle size={16} className="text-emerald-500"/> Add Wallet Funds
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">{sym}</span>
              <input
                type="number" min="0.01" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00" autoFocus
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Reference</label>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Receipt # / bank ref"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"/>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Purpose of top-up"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"/>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
            <PlusCircle size={14}/> Add Funds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CustomerWalletPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();
  const fmt = (n: number) => `${sym}${Math.abs(n).toFixed(dp)}`;

  const customer = useMemo(() => getCustomer(id), [id]);

  const [dateFrom,    setDateFrom]    = useState(monthStart());
  const [dateTo,      setDateTo]      = useState(today());
  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState<WalletTxType | "all">("all");
  const [tick,        setTick]        = useState(0); // force re-read after mutation
  const [adjustOpen,  setAdjustOpen]  = useState(false);
  const [fundOpen,    setFundOpen]    = useState(false);

  const allTxs = useMemo(() => {
    void tick; // reactive
    if (!id) return [];
    return getWalletLedger(id);
  }, [id, tick]);

  // Build running balance per tx (chronological)
  const withBalance = useMemo(() => {
    let bal = 0;
    return allTxs.map(tx => {
      bal = Math.max(0, bal + tx.delta);
      return { ...tx, runningBalance: bal };
    });
  }, [allTxs]);

  // Current live balance from customer record
  const liveBalance = useMemo(() => {
    void tick;
    return getCustomerWalletBalance(id);
  }, [id, tick]);

  // Summary stats (all time)
  const stats = useMemo(() => {
    const totalCredit = allTxs.filter(t => t.delta > 0).reduce((s, t) => s + t.delta, 0);
    const totalDebit  = allTxs.filter(t => t.delta < 0).reduce((s, t) => s + Math.abs(t.delta), 0);
    return { totalCredit, totalDebit };
  }, [allTxs]);

  // Filtered view
  const filtered = useMemo(() => {
    return withBalance.filter(tx => {
      if (tx.date < dateFrom || tx.date > dateTo) return false;
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchRef  = (tx.reference ?? "").toLowerCase().includes(q);
        const matchNote = (tx.note ?? "").toLowerCase().includes(q);
        const matchType = TX_META[tx.type].label.toLowerCase().includes(q);
        if (!matchRef && !matchNote && !matchType) return false;
      }
      return true;
    });
  }, [withBalance, dateFrom, dateTo, typeFilter, search]);

  const handlePrint = () => {
    if (!customer) return;
    const rows = filtered.map(tx => `
      <tr>
        <td>${fmtDate(tx.date)}</td>
        <td>${TX_META[tx.type].label}</td>
        <td>${tx.reference ?? "—"}</td>
        <td>${tx.note ?? "—"}</td>
        <td style="text-align:right;color:${tx.delta > 0 ? "#059669" : "#dc2626"}">${tx.delta > 0 ? "+" : ""}${sym}${Math.abs(tx.delta).toFixed(dp)}</td>
        <td style="text-align:right;font-weight:700">${sym}${tx.runningBalance.toFixed(dp)}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><title>Wallet Statement — ${customer.name}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;font-size:13px}
        h1{font-size:18px;margin:0 0 4px}
        p{margin:0;color:#555}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        th{background:#f3f4f6;text-align:left;padding:8px 10px;border-bottom:2px solid #d1d5db;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
        td{padding:7px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top}
        .summary{display:flex;gap:32px;margin-top:16px;padding:12px 16px;background:#f9fafb;border-radius:8px}
        .summary div{display:flex;flex-direction:column}
        .summary .label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
        .summary .value{font-size:16px;font-weight:700}
        @media print{@page{margin:20mm}}
      </style></head><body>
      <h1>Wallet / Advance Credit Statement</h1>
      <p>${customer.name}${customer.company ? " · " + customer.company : ""}</p>
      <p style="margin-top:4px;font-size:11px;color:#9ca3af">Period: ${fmtDate(dateFrom)} – ${fmtDate(dateTo)}</p>
      <div class="summary">
        <div><span class="label">Current Balance</span><span class="value" style="color:#059669">${sym}${liveBalance.toFixed(dp)}</span></div>
        <div><span class="label">Total Credited</span><span class="value" style="color:#1d4ed8">${sym}${stats.totalCredit.toFixed(dp)}</span></div>
        <div><span class="label">Total Debited</span><span class="value" style="color:#dc2626">${sym}${stats.totalDebit.toFixed(dp)}</span></div>
      </div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Note</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Wallet size={40} className="text-gray-300"/>
        <p className="text-gray-500">Customer not found.</p>
        <button onClick={() => navigate("/customers")} className="text-blue-500 hover:underline text-sm">← Back to Customers</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-border bg-white dark:bg-card">
        <button
          onClick={() => navigate("/customers")}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400 transition-colors shrink-0">
          <ArrowLeft size={18}/>
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow">
            <Wallet size={17} className="text-white"/>
          </div>
          <div className="min-w-0">
            <h1 className="text-[16px] font-bold text-gray-900 dark:text-foreground truncate">
              Wallet Statement — {customer.name}
            </h1>
            <p className="text-[12px] text-muted-foreground">{customer.company || customer.email || ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setFundOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold shadow transition-colors">
            <PlusCircle size={13}/> Add Funds
          </button>
          <button
            onClick={() => setAdjustOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-[12px] font-semibold transition-colors">
            <RefreshCw size={13}/> Adjust
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-[12px] font-semibold transition-colors">
            <Printer size={13}/> Print
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-3 gap-4 px-5 py-4 border-b border-gray-100 dark:border-border">
        <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Wallet size={16} className="text-white"/>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Current Balance</p>
            <p className="text-[18px] font-black text-blue-700 dark:text-blue-300 font-mono tabular-nums leading-tight">
              {fmt(liveBalance)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp size={16} className="text-white"/>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Credited</p>
            <p className="text-[18px] font-black text-emerald-700 dark:text-emerald-300 font-mono tabular-nums leading-tight">
              {fmt(stats.totalCredit)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-lg bg-rose-600 flex items-center justify-center shrink-0">
            <TrendingDown size={16} className="text-white"/>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Debited</p>
            <p className="text-[18px] font-black text-rose-700 dark:text-rose-300 font-mono tabular-nums leading-tight">
              {fmt(stats.totalDebit)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-border bg-white dark:bg-card">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-gray-400 shrink-0"/>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-8 px-2.5 text-[12px] rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
          <span className="text-[12px] text-muted-foreground">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-8 px-2.5 text-[12px] rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as WalletTxType | "all")}
          className="h-8 px-2.5 text-[12px] rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="all">All Types</option>
          {(Object.entries(TX_META) as [WalletTxType, typeof TX_META[WalletTxType]][]).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ref, note…"
            className="w-full h-8 pl-8 pr-8 text-[12px] rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12}/>
            </button>
          )}
        </div>

        <span className="ml-auto text-[11px] text-muted-foreground font-mono">{filtered.length} entries</span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              {["Date", "Type", "Reference", "Note", "Amount", "Balance"].map((h, i) => (
                <th key={h} className={`border-b border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide px-4 py-2.5 ${i >= 4 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-20 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Wallet size={36} className="opacity-20"/>
                    <p className="text-sm">No wallet transactions in this period.</p>
                    {allTxs.length === 0 && (
                      <p className="text-[12px] text-muted-foreground/70">
                        Transactions are recorded automatically when wallet credit is added or used.
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ) : filtered.map((tx, i) => {
              const meta    = TX_META[tx.type];
              const isDebit = tx.delta < 0;
              return (
                <tr key={tx.id} className={`border-b border-gray-50 dark:border-border/50 transition-colors hover:bg-gray-50/70 dark:hover:bg-muted/20 ${
                  i % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/40 dark:bg-muted/5"
                }`}>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-zinc-400 font-mono text-[12px] whitespace-nowrap">
                    {fmtDate(tx.date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-blue-600 dark:text-blue-400">
                    {tx.reference || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-zinc-400 max-w-[260px] truncate">
                    {tx.note || "—"}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold text-[13px] tabular-nums ${
                    isDebit ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {isDebit ? "−" : "+"}{fmt(tx.delta)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px] tabular-nums text-gray-900 dark:text-foreground">
                    {sym}{tx.runningBalance.toFixed(dp)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 sticky bottom-0">
                <td colSpan={4} className="px-4 py-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Period Total ({filtered.length} entries)
                </td>
                <td className="px-4 py-2 text-right font-mono font-bold text-[13px] tabular-nums">
                  {(() => {
                    const net = filtered.reduce((s, t) => s + t.delta, 0);
                    return <span className={net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                      {net >= 0 ? "+" : "−"}{sym}{Math.abs(net).toFixed(dp)}
                    </span>;
                  })()}
                </td>
                <td className="px-4 py-2 text-right font-mono font-bold text-[13px] tabular-nums text-blue-700 dark:text-blue-300">
                  {sym}{liveBalance.toFixed(dp)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
      <FundDialog   open={fundOpen}   onClose={() => setFundOpen(false)}   customerId={id} onDone={() => setTick(t => t + 1)}/>
      <AdjustDialog open={adjustOpen} onClose={() => setAdjustOpen(false)} customerId={id} onDone={() => setTick(t => t + 1)}/>
    </div>
  );
}
