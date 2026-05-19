import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  getSales, getSaleReturns, createSaleReturn, updateSaleReturn, deleteSaleReturn,
  restoreStockForSale, autoPostSaleReturnJE, getPaymentAccounts,
  type Sale, type SaleReturn, type SaleReturnItem, type SalePayment,
  getProducts, getCustomers, getCustomerWalletBalance,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Undo2, Plus, Search, Trash2, Eye, Printer, CheckCircle2,
  ShoppingBag, ChevronRight, AlertCircle, Package, X, ExternalLink, Wallet,
} from "lucide-react";

const dp = getSettingsDecimalPlaces();

/** Build refund method options from live Payment Accounts so the dropdown
 *  stays in sync with whatever Cash & Bank accounts are configured. */
function getSaleRefundOptions(): { value: string; label: string }[] {
  const accounts = getPaymentAccounts().filter(a => a.isActive !== false);
  if (accounts.length === 0) {
    // Fallback when no payment accounts are configured yet
    return [
      { value: "Cash",          label: "Cash" },
      { value: "Bank Transfer", label: "Bank Transfer" },
      { value: "Card",          label: "Card" },
      { value: "Cheque",        label: "Cheque" },
    ];
  }
  return accounts.map(a => ({
    value: a.accountTitle,
    label: a.bankName ? `${a.accountTitle} (${a.bankName})` : a.accountTitle,
  }));
}

// ── helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => `${getSettingsCurrencySymbol()}${n.toFixed(dp)}`;

function calcItems(items: SaleReturnItem[]) {
  return items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0;
    const p = parseFloat(i.unitPrice) || 0;
    const d = parseFloat(i.discount) || 0;
    return s + q * p * (1 - d / 100);
  }, 0);
}

function calcCost(items: SaleReturnItem[]) {
  return items.reduce((s, i) => {
    const q   = parseFloat(i.qty) || 0;
    const cp  = parseFloat(i.costPrice || "0") || 0;
    return s + q * cp;
  }, 0);
}

// ── Return Invoice Print View ─────────────────────────────────────────────────

function ReturnInvoiceView({ sr, onClose }: { sr: SaleReturn; onClose: () => void }) {
  const sym = getSettingsCurrencySymbol();
  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 shrink-0 print:hidden">
        <div className="flex items-center gap-2">
          <Undo2 size={16} className="text-rose-500" />
          <span className="font-semibold text-sm">{sr.returnNumber}</span>
          <Badge variant="outline" className={sr.status === "posted" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-amber-400 text-amber-600 dark:text-amber-400"}>
            {sr.status === "posted" ? "Posted" : "Draft"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
            <Printer size={13} /> Print
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X size={14} /></Button>
        </div>
      </div>

      {/* Invoice body */}
      <div className="flex-1 overflow-y-auto p-8 print:p-4 bg-white dark:bg-zinc-950">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center">
                  <Undo2 size={16} className="text-white" />
                </div>
                <span className="text-xl font-black text-gray-900 dark:text-white">CREDIT NOTE</span>
              </div>
              <p className="text-xs text-muted-foreground">Sale Return / Refund</p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{sr.returnNumber}</p>
              <p className="text-xs text-muted-foreground">Date: {sr.date}</p>
              <p className="text-xs text-muted-foreground">Orig. Sale: <span className="font-semibold text-gray-700 dark:text-gray-300">{sr.originalSaleNumber}</span></p>
            </div>
          </div>

          {/* Customer + refund */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Customer</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{sr.customer || "Walk-in"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Refund Method</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{sr.refundMethod}</p>
            </div>
            {sr.reason && (
              <div className="col-span-2 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reason</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{sr.reason}</p>
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Product</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">SKU</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Qty</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Unit Price</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Disc %</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {sr.items.map((item, idx) => {
                  const q = parseFloat(item.qty) || 0;
                  const p = parseFloat(item.unitPrice) || 0;
                  const d = parseFloat(item.discount) || 0;
                  const total = q * p * (1 - d / 100);
                  return (
                    <tr key={item.id} className={`border-b border-gray-100 dark:border-zinc-800 ${idx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-zinc-900/40"}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{item.productName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.sku || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{q} {item.unit}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{sym}{p.toFixed(dp)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{d > 0 ? `${d}%` : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sym}{total.toFixed(dp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="space-y-2 min-w-[220px]">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span><span className="tabular-nums">{fmt(sr.subtotal)}</span>
              </div>
              {sr.taxAmount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Tax</span><span className="tabular-nums">{fmt(sr.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-rose-600 dark:text-rose-400 border-t border-gray-200 dark:border-zinc-700 pt-2">
                <span>Total Refund</span><span className="tabular-nums">{fmt(sr.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {sr.notes && (
            <div className="rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{sr.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-zinc-800 pt-4 text-center">
            <p className="text-[10px] text-muted-foreground">This is an official Credit Note / Sale Return document generated by Onesoft.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New Return Sheet ──────────────────────────────────────────────────────────

interface ReturnFormProps {
  onClose: () => void;
  onSaved: () => void;
}

function NewReturnSheet({ onClose, onSaved }: ReturnFormProps) {
  const { toast } = useToast();
  const [step, setStep]                   = useState<1 | 2>(1);
  const [saleSearch, setSaleSearch]       = useState("");
  const [selectedSale, setSelectedSale]   = useState<Sale | null>(null);
  const [returnItems, setReturnItems]     = useState<SaleReturnItem[]>([]);
  const refundMethodOptions = useMemo(() => getSaleRefundOptions(), []);
  const [refundMethod, setRefundMethod]   = useState<SalePayment>(
    () => getSaleRefundOptions()[0]?.value ?? "Cash"
  );
  const [reason, setReason]               = useState("");
  const [notes, setNotes]                 = useState("");
  const [date, setDate]                   = useState(today());
  const [submitting, setSubmitting]       = useState(false);

  // Re-read from store whenever data syncs from the server. Without this, opening
  // the "New Return" sheet right after a fresh page load (before sync completes)
  // would show "No sales found" even though the sale exists in the DB.
  // Include all non-cancelled, non-refunded sales (Completed, Draft, On Credit, Pending).
  const isReturnable = (s: Sale) => s.status !== "Cancelled" && s.status !== "Refunded";
  const [sales, setSales]       = useState<Sale[]>(() => getSales().filter(isReturnable));
  const [products, setProducts] = useState(() => getProducts());
  useEffect(() => {
    const refresh = () => {
      setSales(getSales().filter(isReturnable));
      setProducts(getProducts());
    };
    window.addEventListener("onesoft:data-synced", refresh);
    return () => window.removeEventListener("onesoft:data-synced", refresh);
  }, []);
  const sym = getSettingsCurrencySymbol();

  // Wallet helpers — only meaningful for named (non walk-in) customers
  const isWalkIn    = !selectedSale?.customer?.trim() || selectedSale.customer.trim().toLowerCase() === "walk-in";
  const custWallet  = selectedSale?.customer && !isWalkIn
    ? getCustomerWalletBalance(selectedSale.customer)
    : 0;

  const filteredSales = useMemo(() => {
    if (!saleSearch.trim()) return sales;
    const q = saleSearch.toLowerCase();
    return sales.filter(s =>
      s.saleNumber.toLowerCase().includes(q) ||
      (s.customer || "").toLowerCase().includes(q) ||
      s.items.some(it => (it.productName || "").toLowerCase().includes(q))
    );
  }, [sales, saleSearch]);

  const handleSelectSale = (sale: Sale) => {
    setSelectedSale(sale);
    setReturnItems(sale.items.map(item => ({
      id:          crypto.randomUUID(),
      productName: item.productName,
      sku:         item.sku || "",
      unit:        item.unit || "pcs",
      qty:         "0",           // all unchecked by default
      unitPrice:   item.unitPrice,
      discount:    item.discount || "0",
      // Use costPrice locked at sale time first; fall back to catalogue with variant-aware lookup
      costPrice:   item.costPrice ||
                   products.find(p => p.sku === item.sku ||
                     p.variants?.some(v => v.sku === item.sku))?.costPrice || "",
    })));
    setStep(2);
  };

  const patchItem = (id: string, field: keyof SaleReturnItem, value: string) => {
    setReturnItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeItem = (id: string) => setReturnItems(prev => prev.filter(i => i.id !== id));

  const subtotal = calcItems(returnItems);
  const grandTotal = subtotal;
  const costTotal = calcCost(returnItems);

  const handlePost = async () => {
    if (!selectedSale) return;
    if (returnItems.length === 0) {
      toast({ title: "No items to return", variant: "destructive" }); return;
    }
    const hasQty = returnItems.some(i => parseFloat(i.qty) > 0);
    if (!hasQty) {
      toast({ title: "All return quantities are zero", variant: "destructive" }); return;
    }
    const effectiveItems = returnItems.filter(i => parseFloat(i.qty) > 0);
    setSubmitting(true);
    try {
      const sr = createSaleReturn({
        originalSaleNumber: selectedSale.saleNumber,
        originalSaleId:     selectedSale.id,
        date,
        customer:    selectedSale.customer || "Walk-in",
        refundMethod,
        items:       effectiveItems,
        subtotal,
        taxAmount:   0,
        grandTotal,
        reason,
        notes,
        status:      "posted",
      });

      // Restore stock
      restoreStockForSale(
        effectiveItems.map(i => ({
          id:          i.id,
          productName: i.productName,
          sku:         i.sku,
          unit:        i.unit,
          qty:         i.qty,
          unitPrice:   i.unitPrice,
          discount:    i.discount,
          notes:       "",
          itemStatus:  "Reserved",
        })),
        sr.returnNumber
      );

      // Build per-category breakdown so the return JE mirrors the original sale
      // (per-category Revenue and Inventory ledgers are properly reversed).
      const catMap = new Map<string, { subtotal: number; costTotal: number }>();
      for (const it of effectiveItems) {
        const prod  = products.find(p => p.sku === it.sku || p.variants?.some(v => v.sku === it.sku));
        const qty   = parseFloat(it.qty)       || 0;
        const price = parseFloat(it.unitPrice) || 0;
        const disc  = parseFloat(it.discount)  || 0;
        const lineNet = qty * price * (1 - disc / 100);
        const cp    = parseFloat(it.costPrice || "0") || 0;
        const cost  = qty * cp;
        const cat   = prod?.category?.trim() || "Uncategorised";
        const prev  = catMap.get(cat) ?? { subtotal: 0, costTotal: 0 };
        catMap.set(cat, { subtotal: prev.subtotal + lineNet, costTotal: prev.costTotal + cost });
      }
      const categoryLines = Array.from(catMap.entries()).map(([category, v]) => ({
        category,
        subtotal:  parseFloat(v.subtotal.toFixed(2)),
        costTotal: parseFloat(v.costTotal.toFixed(2)),
      }));

      // Post JE
      const je = autoPostSaleReturnJE({
        returnNumber:  sr.returnNumber,
        originalRef:   selectedSale.saleNumber,
        customer:      sr.customer,
        date,
        refundMethod,
        subtotal,
        taxAmount:     0,
        grandTotal,
        costTotal,
        categoryLines,
      });

      if (je) {
        updateSaleReturn(sr.id, { jeId: je.id });
      }

      // Single-ledger model: the return JE already credits the customer's primary
      // ledger (CR Customer Ledger = grandTotal), which automatically creates or
      // increases their wallet balance.  No separate fundCustomerWallet JE needed.

      const walletNote = refundMethod === "Wallet" ? " · Refund credited to wallet" : "";
      toast({ title: `${sr.returnNumber} posted`, description: `Stock restored · ${je ? "JE posted" : "JE skipped (configure COA accounts in Settings)"}${walletNote}` });
      onSaved();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col gap-0">
      <SheetHeader className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 shrink-0">
        <SheetTitle className="flex items-center gap-2">
          <Undo2 size={18} className="text-rose-500" />
          New Sale Return
          {selectedSale && <span className="text-sm font-normal text-muted-foreground">← {selectedSale.saleNumber}</span>}
        </SheetTitle>
      </SheetHeader>

      {/* Step 1: Select sale */}
      {step === 1 && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Search for the original sale to create a return against:</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              autoFocus
              value={saleSearch}
              onChange={e => setSaleSearch(e.target.value)}
              placeholder="Sale number, customer or item name…"
              className="pl-9"
            />
          </div>

          {filteredSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No sales found</div>
          ) : (
            <div className="space-y-2">
              {filteredSales.slice(0, 30).map(sale => {
                const total = sale.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
                return (
                  <button
                    key={sale.id}
                    onClick={() => handleSelectSale(sale)}
                    className="w-full text-left rounded-xl border border-gray-200 dark:border-zinc-800 p-3.5 hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                          <ShoppingBag size={16} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{sale.saleNumber}</p>
                          <p className="text-xs text-muted-foreground">{sale.customer || "Walk-in"} · {sale.items.length} item(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{sym}{total.toFixed(dp)}</p>
                          <p className="text-xs text-muted-foreground">{sale.date || sale.createdAt?.slice(0, 10)}</p>
                        </div>
                        <ChevronRight size={14} className="text-muted-foreground group-hover:text-rose-500 transition-colors" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Return items */}
      {step === 2 && selectedSale && (
        <div className="flex-1 overflow-y-auto">
          {/* Meta row */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800 grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Return Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Refund Via</label>
              <select
                value={refundMethod}
                onChange={e => setRefundMethod(e.target.value as SalePayment)}
                className="mt-1 w-full h-8 px-2 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-ring outline-none"
              >
                {refundMethodOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
                <option value="Wallet">Wallet / Advance Credit</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reason</label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Defective product…" className="mt-1 h-8 text-sm" />
            </div>
          </div>

          {/* Wallet info strip */}
          {refundMethod === "Wallet" && (
            <div className={`px-6 py-3 border-b flex items-center gap-2.5 ${
              isWalkIn
                ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/40"
                : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40"
            }`}>
              <Wallet size={14} className={isWalkIn ? "text-orange-500 shrink-0" : "text-blue-500 shrink-0"}/>
              {isWalkIn ? (
                <p className="text-[12px] font-semibold text-orange-700 dark:text-orange-400">
                  Wallet refunds are not available for walk-in customers. Please select a cash or bank method.
                </p>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[12px] font-semibold text-blue-700 dark:text-blue-400">
                    Wallet Balance: {sym}{custWallet.toFixed(dp)}
                  </span>
                  <span className="text-[11px] text-blue-600 dark:text-blue-500">
                    · {fmt(grandTotal)} will be credited to <strong>{selectedSale.customer}</strong>'s wallet on posting.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Items to return */}
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Items to Return</p>
              <p className="text-xs text-muted-foreground">Check items you want to return</p>
            </div>

            {returnItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No items</div>
            ) : (
              <div className="space-y-2">
                {returnItems.map(item => {
                  const maxQty = selectedSale.items.find(i => i.sku === item.sku)?.qty || item.qty;
                  const q = parseFloat(item.qty) || 0;
                  const checked = q > 0;
                  const p = parseFloat(item.unitPrice) || 0;
                  const d = parseFloat(item.discount) || 0;
                  const lineTotal = q * p * (1 - d / 100);
                  return (
                    <div key={item.id} className={`rounded-xl border p-3 transition-all ${checked ? "border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/10" : "border-gray-100 dark:border-zinc-800 opacity-60"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Checkbox */}
                          <button
                            onClick={() => patchItem(item.id, "qty", checked ? "0" : maxQty)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-rose-500 border-rose-500 text-white" : "border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800"}`}
                          >
                            {checked && <svg viewBox="0 0 10 8" fill="none" className="w-3 h-3"><path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </button>
                          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                            <Package size={14} className="text-gray-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate">{item.productName}</p>
                            <p className="text-[10px] text-muted-foreground">{item.sku || "—"} · {sym}{p.toFixed(dp)} each{d > 0 ? ` · ${d}% disc` : ""}</p>
                          </div>
                        </div>
                        {checked && (
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[10px] text-muted-foreground">Qty (max {maxQty})</label>
                              <Input
                                type="number"
                                min="1"
                                max={maxQty}
                                value={item.qty}
                                onChange={e => patchItem(item.id, "qty", e.target.value)}
                                className="w-20 h-7 text-sm text-right"
                              />
                            </div>
                            <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{sym}{lineTotal.toFixed(dp)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notes (optional)</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes…" className="mt-1 h-8 text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="shrink-0 border-t border-gray-200 dark:border-zinc-800 px-6 py-4 bg-gray-50 dark:bg-zinc-900 flex items-center justify-between gap-3">
        {step === 2 ? (
          <>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Total Refund</p>
              <p className="text-xl font-black text-rose-600 dark:text-rose-400">{fmt(grandTotal)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Back</Button>
              <Button
                size="sm"
                onClick={handlePost}
                disabled={submitting || returnItems.filter(i => parseFloat(i.qty) > 0).length === 0 || (refundMethod === "Wallet" && isWalkIn)}
                className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
              >
                <CheckCircle2 size={14} />
                {submitting ? "Posting…" : "Post Return"}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        )}
      </div>
    </SheetContent>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SaleReturnPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const dp  = getSettingsDecimalPlaces();
  const [returns, setReturns]       = useState<SaleReturn[]>(() => getSaleReturns());
  const [search, setSearch]         = useState("");
  const [newOpen, setNewOpen]       = useState(false);
  const [viewSR, setViewSR]         = useState<SaleReturn | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const sym = getSettingsCurrencySymbol();

  const refresh = () => setReturns(getSaleReturns());

  // Re-pull from the store after server data sync completes (e.g. page reload).
  useEffect(() => {
    window.addEventListener("onesoft:data-synced", refresh);
    return () => window.removeEventListener("onesoft:data-synced", refresh);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return returns;
    const q = search.toLowerCase();
    return returns.filter(r =>
      r.returnNumber.toLowerCase().includes(q) ||
      r.originalSaleNumber.toLowerCase().includes(q) ||
      r.customer.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q)
    );
  }, [returns, search]);

  const handleDelete = (id: string) => {
    try {
      deleteSaleReturn(id);
    } catch (err) {
      toast({
        title: "Cannot delete",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      setDeleteId(null);
      return;
    }
    refresh();
    setDeleteId(null);
    toast({ title: "Sale Return deleted" });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center">
            <Undo2 size={18} className="text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Sale Returns</h1>
            <p className="text-xs text-muted-foreground">{returns.length} return{returns.length !== 1 ? "s" : ""} · Credit notes &amp; refunds</p>
          </div>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
          <Plus size={15} /> New Return
        </Button>
      </div>

      {/* Search bar */}
      <div className="px-6 py-3 border-b border-gray-100 dark:border-zinc-800 shrink-0">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search returns…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
              <Undo2 size={28} className="text-rose-300 dark:text-rose-700" />
            </div>
            <div>
              <p className="font-semibold text-gray-600 dark:text-gray-400">No sale returns yet</p>
              <p className="text-sm text-muted-foreground mt-1">Click <strong>New Return</strong> to process a sale return or refund.</p>
            </div>
            <Button onClick={() => setNewOpen(true)} size="sm" className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
              <Plus size={14} /> New Return
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Return #</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Original Sale</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Refund Via</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Reason</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sr, idx) => (
                  <tr key={sr.id} className={`border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/30 dark:bg-zinc-900/20"}`}>
                    <td className="px-4 py-3">
                      <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">{sr.returnNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{sr.date}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{sr.customer || "Walk-in"}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-blue-600 dark:text-blue-400 text-[12px]">{sr.originalSaleNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{sr.refundMethod}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                      {sym}{sr.grandTotal.toFixed(dp)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={sr.status === "posted" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 text-[11px]" : "border-amber-400 text-amber-600 dark:text-amber-400 text-[11px]"}>
                        {sr.status === "posted" ? "Posted" : "Draft"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-[12px] max-w-[180px] truncate">{sr.reason || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setViewSR(sr)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                          title="View / Print return"
                        >
                          <Eye size={13} />
                        </button>
                        {sr.originalSaleId && (
                          <button
                            onClick={() => navigate(`/sales?q=${encodeURIComponent(sr.originalSaleNumber)}`)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                            title={`View original sale ${sr.originalSaleNumber}`}
                          >
                            <ExternalLink size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteId(sr.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Return Sheet */}
      <Sheet open={newOpen} onOpenChange={o => { if (!o) setNewOpen(false); }}>
        <NewReturnSheet
          onClose={() => setNewOpen(false)}
          onSaved={() => { setNewOpen(false); refresh(); }}
        />
      </Sheet>

      {/* View Invoice Dialog */}
      <Dialog open={!!viewSR} onOpenChange={o => { if (!o) setViewSR(null); }}>
        <DialogContent className="max-w-3xl h-[90vh] p-0 overflow-hidden flex flex-col">
          {viewSR && (
            <ReturnInvoiceView sr={viewSR} onClose={() => setViewSR(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle size={18} /> Delete Sale Return?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the return record. Stock and JE entries already posted will <strong>not</strong> be automatically reversed.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
