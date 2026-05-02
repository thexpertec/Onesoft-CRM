import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  getSales, getSaleReturns, createSaleReturn, updateSaleReturn, deleteSaleReturn,
  restoreStockForSale, autoPostSaleReturnJE,
  getInvoices, getPurchaseReturns, createPurchaseReturn, deletePurchaseReturn,
  deductStockForSale, getPaymentAccounts, getProducts,
  type Sale, type SaleReturn, type SaleReturnItem, type SalePayment, SALE_PAYMENTS,
  type Invoice, type PurchaseReturn, type PurchaseReturnItem,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Undo2, Plus, Search, Trash2, Eye, Printer, CheckCircle2,
  ShoppingBag, ShoppingCart, ChevronRight, AlertCircle, Package, X, ExternalLink,
} from "lucide-react";

const dp  = getSettingsDecimalPlaces();
const fmt = (n: number) => `${getSettingsCurrencySymbol()}${n.toFixed(dp)}`;
const today = () => new Date().toISOString().slice(0, 10);

// ─── Shared calc helpers ──────────────────────────────────────────────────────

function calcSaleItems(items: SaleReturnItem[]) {
  return items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0;
    const p = parseFloat(i.unitPrice) || 0;
    const d = parseFloat(i.discount) || 0;
    return s + q * p * (1 - d / 100);
  }, 0);
}

function calcSaleCost(items: SaleReturnItem[]) {
  return items.reduce((s, i) => {
    return s + (parseFloat(i.qty) || 0) * (parseFloat(i.costPrice || "0") || 0);
  }, 0);
}

function calcPurchaseItems(items: PurchaseReturnItem[]) {
  return items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0;
    const p = parseFloat(i.unitPrice) || 0;
    const d = parseFloat(i.discount) || 0;
    return s + q * p * (1 - d / 100);
  }, 0);
}

function getCreditMethodOptions(): { value: string; label: string }[] {
  const accounts = getPaymentAccounts().filter(a => a.isActive !== false);
  return [
    ...accounts.map(a => ({
      value: a.accountTitle,
      label: a.bankName ? `${a.accountTitle} (${a.bankName})` : a.accountTitle,
    })),
    { value: "Supplier Credit", label: "Supplier Credit" },
    { value: "Adjustment",      label: "Adjustment" },
  ];
}

// ─── Sale Return: Print View ──────────────────────────────────────────────────

function CreditNoteView({ sr, onClose }: { sr: SaleReturn; onClose: () => void }) {
  const sym = getSettingsCurrencySymbol();
  return (
    <div className="flex flex-col gap-0 h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 shrink-0 print:hidden">
        <div className="flex items-center gap-2">
          <Undo2 size={16} className="text-rose-500" />
          <span className="font-semibold text-sm">{sr.returnNumber}</span>
          <Badge variant="outline" className={sr.status === "posted" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-amber-400 text-amber-600 dark:text-amber-400"}>
            {sr.status === "posted" ? "Posted" : "Draft"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer size={13} /> Print</Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X size={14} /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 print:p-4 bg-white dark:bg-zinc-950">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center"><Undo2 size={16} className="text-white" /></div>
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
                  return (
                    <tr key={item.id} className={`border-b border-gray-100 dark:border-zinc-800 ${idx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-zinc-900/40"}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{item.productName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.sku || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{q} {item.unit}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{sym}{p.toFixed(dp)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{d > 0 ? `${d}%` : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sym}{(q * p * (1 - d / 100)).toFixed(dp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          {sr.notes && (
            <div className="rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{sr.notes}</p>
            </div>
          )}
          <div className="border-t border-gray-200 dark:border-zinc-800 pt-4 text-center">
            <p className="text-[10px] text-muted-foreground">This is an official Credit Note / Sale Return document generated by Onesoft.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Purchase Return: Print View ──────────────────────────────────────────────

function DebitNoteView({ pr, onClose }: { pr: PurchaseReturn; onClose: () => void }) {
  const sym = getSettingsCurrencySymbol();
  return (
    <div className="flex flex-col gap-0 h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 shrink-0 print:hidden">
        <div className="flex items-center gap-2">
          <Undo2 size={16} className="text-orange-500" />
          <span className="font-semibold text-sm">{pr.returnNumber}</span>
          <Badge variant="outline" className={pr.status === "posted" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-amber-400 text-amber-600 dark:text-amber-400"}>
            {pr.status === "posted" ? "Posted" : "Draft"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer size={13} /> Print</Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X size={14} /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 print:p-4 bg-white dark:bg-zinc-950">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center"><Undo2 size={16} className="text-white" /></div>
                <span className="text-xl font-black text-gray-900 dark:text-white">DEBIT NOTE</span>
              </div>
              <p className="text-xs text-muted-foreground">Purchase Return</p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{pr.returnNumber}</p>
              <p className="text-xs text-muted-foreground">Date: {pr.date}</p>
              <p className="text-xs text-muted-foreground">Orig. Invoice: <span className="font-semibold text-gray-700 dark:text-gray-300">{pr.originalInvoiceNumber}</span></p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Supplier</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{pr.supplier || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Credit Method</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{pr.refundMethod}</p>
            </div>
            {pr.reason && (
              <div className="col-span-2 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reason</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{pr.reason}</p>
              </div>
            )}
          </div>
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
                {pr.items.map((item, idx) => {
                  const q = parseFloat(item.qty) || 0;
                  const p = parseFloat(item.unitPrice) || 0;
                  const d = parseFloat(item.discount) || 0;
                  return (
                    <tr key={item.id} className={`border-b border-gray-100 dark:border-zinc-800 ${idx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-zinc-900/40"}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{item.productName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.sku || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{q} {item.unit}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{sym}{p.toFixed(dp)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{d > 0 ? `${d}%` : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sym}{(q * p * (1 - d / 100)).toFixed(dp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <div className="space-y-2 min-w-[220px]">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span><span className="tabular-nums">{fmt(pr.subtotal)}</span>
              </div>
              {pr.taxAmount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Tax</span><span className="tabular-nums">{fmt(pr.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-orange-600 dark:text-orange-400 border-t border-gray-200 dark:border-zinc-700 pt-2">
                <span>Total Return</span><span className="tabular-nums">{fmt(pr.grandTotal)}</span>
              </div>
            </div>
          </div>
          {pr.notes && (
            <div className="rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{pr.notes}</p>
            </div>
          )}
          <div className="border-t border-gray-200 dark:border-zinc-800 pt-4 text-center">
            <p className="text-[10px] text-muted-foreground">This is an official Debit Note / Purchase Return document generated by Onesoft.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New Sale Return Sheet ────────────────────────────────────────────────────

function NewSaleReturnSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [step, setStep]                   = useState<1 | 2>(1);
  const [saleSearch, setSaleSearch]       = useState("");
  const [selectedSale, setSelectedSale]   = useState<Sale | null>(null);
  const [returnItems, setReturnItems]     = useState<SaleReturnItem[]>([]);
  const [refundMethod, setRefundMethod]   = useState<SalePayment>("Cash");
  const [reason, setReason]               = useState("");
  const [notes, setNotes]                 = useState("");
  const [date, setDate]                   = useState(today());
  const [submitting, setSubmitting]       = useState(false);

  const [sales, setSales]       = useState<Sale[]>(() =>
    getSales().filter(s => s.status === "Completed" || s.status === "Draft"));
  const [products, setProducts] = useState(() => getProducts());
  useEffect(() => {
    const refresh = () => {
      setSales(getSales().filter(s => s.status === "Completed" || s.status === "Draft"));
      setProducts(getProducts());
    };
    window.addEventListener("onesoft:data-synced", refresh);
    return () => window.removeEventListener("onesoft:data-synced", refresh);
  }, []);

  const sym = getSettingsCurrencySymbol();

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
      qty:         item.qty,
      unitPrice:   item.unitPrice,
      discount:    item.discount || "0",
      costPrice:   products.find(p => p.sku === item.sku)?.costPrice || "",
    })));
    setStep(2);
  };

  const patchItem = (id: string, field: keyof SaleReturnItem, value: string) =>
    setReturnItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const removeItem = (id: string) => setReturnItems(prev => prev.filter(i => i.id !== id));

  const subtotal   = calcSaleItems(returnItems);
  const grandTotal = subtotal;
  const costTotal  = calcSaleCost(returnItems);

  const handlePost = async () => {
    if (!selectedSale) return;
    if (returnItems.length === 0) { toast({ title: "No items to return", variant: "destructive" }); return; }
    const effectiveItems = returnItems.filter(i => parseFloat(i.qty) > 0);
    if (effectiveItems.length === 0) { toast({ title: "All return quantities are zero", variant: "destructive" }); return; }
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

      restoreStockForSale(
        effectiveItems.map(i => ({
          id: i.id, productName: i.productName, sku: i.sku, unit: i.unit,
          qty: i.qty, unitPrice: i.unitPrice, discount: i.discount,
          notes: "", itemStatus: "Reserved" as const,
        })),
        sr.returnNumber
      );

      const catMap = new Map<string, { subtotal: number; costTotal: number }>();
      for (const it of effectiveItems) {
        const prod  = products.find(p => p.sku === it.sku);
        const qty   = parseFloat(it.qty) || 0;
        const price = parseFloat(it.unitPrice) || 0;
        const disc  = parseFloat(it.discount) || 0;
        const lineNet = qty * price * (1 - disc / 100);
        const cp    = parseFloat(it.costPrice || "0") || 0;
        const cat   = prod?.category?.trim() || "Uncategorised";
        const prev  = catMap.get(cat) ?? { subtotal: 0, costTotal: 0 };
        catMap.set(cat, { subtotal: prev.subtotal + lineNet, costTotal: prev.costTotal + qty * cp });
      }
      const categoryLines = Array.from(catMap.entries()).map(([category, v]) => ({
        category,
        subtotal:  parseFloat(v.subtotal.toFixed(2)),
        costTotal: parseFloat(v.costTotal.toFixed(2)),
      }));

      const je = autoPostSaleReturnJE({
        returnNumber: sr.returnNumber, originalRef: selectedSale.saleNumber,
        customer: sr.customer, date, refundMethod, subtotal, taxAmount: 0,
        grandTotal, costTotal, categoryLines,
      });
      if (je) updateSaleReturn(sr.id, { jeId: je.id });

      toast({ title: `${sr.returnNumber} posted`, description: `Stock restored · ${je ? "JE posted" : "JE skipped"}` });
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

      {step === 1 && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Search for the original sale to create a return against:</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input autoFocus value={saleSearch} onChange={e => setSaleSearch(e.target.value)}
              placeholder="Sale number, customer or item name…" className="pl-9" />
          </div>
          {filteredSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No sales found</div>
          ) : (
            <div className="space-y-2">
              {filteredSales.slice(0, 30).map(sale => {
                const total = sale.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
                return (
                  <button key={sale.id} onClick={() => handleSelectSale(sale)}
                    className="w-full text-left rounded-xl border border-gray-200 dark:border-zinc-800 p-3.5 hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all group">
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
                          <p className="text-xs text-muted-foreground">{sale.saleDate || sale.createdAt?.slice(0, 10)}</p>
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

      {step === 2 && selectedSale && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Return Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Refund Method</label>
              <Select value={refundMethod} onValueChange={v => setRefundMethod(v as SalePayment)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SALE_PAYMENTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reason</label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Defective product…" className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Items to Return</p>
              <p className="text-xs text-muted-foreground">Set qty to 0 to exclude</p>
            </div>
            <div className="space-y-2">
              {returnItems.map(item => {
                const maxQty = selectedSale.items.find(i => i.sku === item.sku)?.qty || item.qty;
                const q = parseFloat(item.qty) || 0;
                const p = parseFloat(item.unitPrice) || 0;
                const d = parseFloat(item.discount) || 0;
                return (
                  <div key={item.id} className={`rounded-xl border p-3 transition-all ${q === 0 ? "border-gray-100 dark:border-zinc-800 opacity-50" : "border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/10"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          <Package size={14} className="text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.sku || "—"} · {sym}{p.toFixed(dp)} each{d > 0 ? ` · ${d}% disc` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] text-muted-foreground">Qty (max {maxQty})</label>
                            <Input type="number" min="0" max={maxQty} value={item.qty}
                              onChange={e => patchItem(item.id, "qty", e.target.value)} className="w-20 h-7 text-sm text-right" />
                          </div>
                          {q > 0 && <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{sym}{(q * p * (1 - d / 100)).toFixed(dp)}</p>}
                        </div>
                        <button onClick={() => removeItem(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notes (optional)</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes…" className="mt-1 h-8 text-sm" />
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-gray-200 dark:border-zinc-800 px-6 py-4 bg-gray-50 dark:bg-zinc-900 flex items-center justify-between gap-3">
        {step === 2 ? (
          <>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Total Refund</p>
              <p className="text-xl font-black text-rose-600 dark:text-rose-400">{fmt(grandTotal)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Back</Button>
              <Button size="sm" onClick={handlePost}
                disabled={submitting || returnItems.filter(i => parseFloat(i.qty) > 0).length === 0}
                className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5">
                <CheckCircle2 size={14} />{submitting ? "Posting…" : "Post Return"}
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

// ─── New Purchase Return Sheet ────────────────────────────────────────────────

function NewPurchaseReturnSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [step, setStep]               = useState<1 | 2>(1);
  const [search, setSearch]           = useState("");
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [returnItems, setReturnItems] = useState<PurchaseReturnItem[]>([]);

  const creditMethodOptions = useMemo(() => getCreditMethodOptions(), []);
  const [refundMethod, setRefundMethod] = useState<string>(
    () => getCreditMethodOptions()[0]?.value ?? "Supplier Credit"
  );
  const [reason, setReason]   = useState("");
  const [notes, setNotes]     = useState("");
  const [date, setDate]       = useState(today());
  const [submitting, setSubmitting] = useState(false);

  const sym = getSettingsCurrencySymbol();

  const purchaseInvoices = useMemo(
    () => getInvoices().filter(i => i.invoiceType === "purchase"), []
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return purchaseInvoices;
    const q = search.toLowerCase();
    return purchaseInvoices.filter(inv =>
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.customer || "").toLowerCase().includes(q) ||
      inv.items.some(it => (it.productName || "").toLowerCase().includes(q))
    );
  }, [purchaseInvoices, search]);

  const handleSelect = (inv: Invoice) => {
    setSelectedInv(inv);
    setReturnItems(inv.items.map(it => ({
      id:          crypto.randomUUID(),
      productName: it.productName || "",
      sku:         it.sku || "",
      unit:        it.unit || "pcs",
      qty:         it.qty,
      unitPrice:   it.unitPrice,
      discount:    it.discount || "0",
    })));
    setStep(2);
  };

  const patchItem = (id: string, field: keyof PurchaseReturnItem, value: string) =>
    setReturnItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const removeItem = (id: string) => setReturnItems(prev => prev.filter(i => i.id !== id));

  const subtotal   = calcPurchaseItems(returnItems);
  const grandTotal = subtotal;

  const handlePost = async () => {
    if (!selectedInv) return;
    const effectiveItems = returnItems.filter(i => parseFloat(i.qty) > 0);
    if (effectiveItems.length === 0) { toast({ title: "All quantities are zero", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const pr = createPurchaseReturn({
        originalInvoiceNumber: selectedInv.invoiceNumber,
        originalInvoiceId:     selectedInv.id,
        date,
        supplier:    selectedInv.customer || "Unknown Supplier",
        refundMethod,
        items:       effectiveItems,
        subtotal,
        taxAmount:   0,
        grandTotal,
        reason,
        notes,
        status:      "posted",
      });

      deductStockForSale(
        effectiveItems.map(i => ({
          id: i.id, productName: i.productName, sku: i.sku, unit: i.unit,
          qty: i.qty, unitPrice: i.unitPrice, discount: i.discount,
          notes: "", itemStatus: "Reserved" as const,
        })),
        pr.returnNumber,
        "purchase-return"
      );

      toast({ title: `${pr.returnNumber} posted`, description: "Stock adjusted · Debit note created" });
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
          <Undo2 size={18} className="text-orange-500" />
          New Purchase Return
          {selectedInv && <span className="text-sm font-normal text-muted-foreground">← {selectedInv.invoiceNumber}</span>}
        </SheetTitle>
      </SheetHeader>

      {step === 1 && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Search for the original purchase invoice to create a return against:</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Invoice number, supplier or item name…" className="pl-9" />
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No purchase invoices found</div>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 30).map(inv => {
                const total = inv.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
                return (
                  <button key={inv.id} onClick={() => handleSelect(inv)}
                    className="w-full text-left rounded-xl border border-gray-200 dark:border-zinc-800 p-3.5 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-all group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center">
                          <ShoppingCart size={16} className="text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{inv.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">{inv.customer || "Unknown Supplier"} · {inv.items.length} item(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-bold text-orange-600 dark:text-orange-400">{sym}{total.toFixed(dp)}</p>
                          <p className="text-xs text-muted-foreground">{inv.invoiceDate}</p>
                        </div>
                        <ChevronRight size={14} className="text-muted-foreground group-hover:text-orange-500 transition-colors" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 2 && selectedInv && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Return Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Credit Method</label>
              <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}
                className="mt-1 h-8 w-full text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring">
                {creditMethodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reason</label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged on arrival…" className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Items to Return</p>
              <p className="text-xs text-muted-foreground">Set qty to 0 to exclude</p>
            </div>
            <div className="space-y-2">
              {returnItems.map(item => {
                const origItem = selectedInv.items.find(i => i.sku === item.sku || i.productName === item.productName);
                const maxQty = origItem?.qty || item.qty;
                const q = parseFloat(item.qty) || 0;
                const p = parseFloat(item.unitPrice) || 0;
                const d = parseFloat(item.discount) || 0;
                return (
                  <div key={item.id} className={`rounded-xl border p-3 transition-all ${q === 0 ? "border-gray-100 dark:border-zinc-800 opacity-50" : "border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/10"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          <Package size={14} className="text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.sku || "—"} · {sym}{p.toFixed(dp)} each{d > 0 ? ` · ${d}% disc` : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] text-muted-foreground">Qty (max {maxQty})</label>
                            <Input type="number" min="0" max={maxQty} value={item.qty}
                              onChange={e => patchItem(item.id, "qty", e.target.value)} className="w-20 h-7 text-sm text-right" />
                          </div>
                          {q > 0 && <p className="text-[11px] font-bold text-orange-600 dark:text-orange-400">{sym}{(q * p * (1 - d / 100)).toFixed(dp)}</p>}
                        </div>
                        <button onClick={() => removeItem(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notes (optional)</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes…" className="mt-1 h-8 text-sm" />
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-gray-200 dark:border-zinc-800 px-6 py-4 bg-gray-50 dark:bg-zinc-900 flex items-center justify-between gap-3">
        {step === 2 ? (
          <>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Total Return</p>
              <p className="text-xl font-black text-orange-600 dark:text-orange-400">{fmt(grandTotal)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Back</Button>
              <Button size="sm" onClick={handlePost}
                disabled={submitting || returnItems.filter(i => parseFloat(i.qty) > 0).length === 0}
                className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5">
                <CheckCircle2 size={14} />{submitting ? "Posting…" : "Post Return"}
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

// ─── Main Unified Returns Page ────────────────────────────────────────────────

type Tab = "sale" | "purchase";

export default function ReturnsPage() {
  const [, navigate]   = useLocation();
  const { toast }      = useToast();
  const sym            = getSettingsCurrencySymbol();

  const [tab, setTab]  = useState<Tab>("sale");
  const [search, setSearch]   = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [rev, setRev]         = useState(0);
  const reload = () => setRev(r => r + 1);

  // Sale returns state
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>(() => getSaleReturns());
  const [viewSR, setViewSR]           = useState<SaleReturn | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);

  // Purchase returns state
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>(() =>
    [...getPurchaseReturns()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );
  const [viewPR, setViewPR] = useState<PurchaseReturn | null>(null);

  const refreshAll = () => {
    setSaleReturns(getSaleReturns());
    setPurchaseReturns([...getPurchaseReturns()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  };

  useEffect(() => {
    window.addEventListener("onesoft:data-synced", refreshAll);
    return () => window.removeEventListener("onesoft:data-synced", refreshAll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run when rev changes (after create/delete)
  useEffect(() => { refreshAll(); }, [rev]);

  // Reset search when switching tabs
  const switchTab = (t: Tab) => { setTab(t); setSearch(""); };

  const filteredSale = useMemo(() => {
    if (!search.trim()) return saleReturns;
    const q = search.toLowerCase();
    return saleReturns.filter(r =>
      r.returnNumber.toLowerCase().includes(q) ||
      r.originalSaleNumber.toLowerCase().includes(q) ||
      r.customer.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q)
    );
  }, [saleReturns, search]);

  const filteredPurchase = useMemo(() => {
    if (!search.trim()) return purchaseReturns;
    const q = search.toLowerCase();
    return purchaseReturns.filter(r =>
      r.returnNumber.toLowerCase().includes(q) ||
      r.originalInvoiceNumber.toLowerCase().includes(q) ||
      r.supplier.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q) ||
      r.items.some(it => it.productName.toLowerCase().includes(q))
    );
  }, [purchaseReturns, search]);

  const handleDeleteSale = (id: string) => {
    try {
      deleteSaleReturn(id);
    } catch (err) {
      toast({ title: "Cannot delete", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setDeleteId(null);
      return;
    }
    reload();
    setDeleteId(null);
    toast({ title: "Sale Return deleted" });
  };

  const handleDeletePurchase = (pr: PurchaseReturn) => {
    if (!confirm(`Delete ${pr.returnNumber}? This cannot be undone.`)) return;
    try {
      deletePurchaseReturn(pr.id);
    } catch (err) {
      toast({ title: "Cannot delete", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      return;
    }
    toast({ title: `${pr.returnNumber} deleted` });
    reload();
  };

  const isSale     = tab === "sale";
  const accent     = isSale ? "rose" : "orange";
  const totalCount = isSale ? saleReturns.length : purchaseReturns.length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSale ? "bg-rose-100 dark:bg-rose-950/40" : "bg-orange-100 dark:bg-orange-950/40"}`}>
            <Undo2 size={18} className={isSale ? "text-rose-600 dark:text-rose-400" : "text-orange-600 dark:text-orange-400"} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Returns</h1>
            <p className="text-xs text-muted-foreground">
              {totalCount} {isSale ? "sale" : "purchase"} return{totalCount !== 1 ? "s" : ""} ·{" "}
              {isSale ? "Credit notes & refunds" : "Debit notes & supplier returns"}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setNewOpen(true)}
          className={`gap-2 text-white ${isSale ? "bg-rose-600 hover:bg-rose-700" : "bg-orange-600 hover:bg-orange-700"}`}
        >
          <Plus size={15} /> New Return
        </Button>
      </div>

      {/* Tabs + Search row */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-100 dark:border-zinc-800 shrink-0">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-800 rounded-xl p-1">
          <button
            onClick={() => switchTab("sale")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
              tab === "sale"
                ? "bg-white dark:bg-zinc-700 text-rose-600 dark:text-rose-400 shadow-sm"
                : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
            }`}
          >
            <ShoppingBag size={12} />
            Sale Returns
            <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === "sale" ? "bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400" : "bg-gray-200 dark:bg-zinc-700 text-gray-500"}`}>
              {saleReturns.length}
            </span>
          </button>
          <button
            onClick={() => switchTab("purchase")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
              tab === "purchase"
                ? "bg-white dark:bg-zinc-700 text-orange-600 dark:text-orange-400 shadow-sm"
                : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
            }`}
          >
            <ShoppingCart size={12} />
            Purchase Returns
            <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === "purchase" ? "bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400" : "bg-gray-200 dark:bg-zinc-700 text-gray-500"}`}>
              {purchaseReturns.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isSale ? "Search sale returns…" : "Search purchase returns…"}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-auto px-6 py-4">

        {/* ── Sale Returns Tab ── */}
        {tab === "sale" && (
          filteredSale.length === 0 ? (
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
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSale.map((sr, idx) => (
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
                          <button onClick={() => setViewSR(sr)} title="View / Print"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                            <Eye size={13} />
                          </button>
                          {sr.originalSaleId && (
                            <button onClick={() => navigate(`/sales?q=${encodeURIComponent(sr.originalSaleNumber)}`)} title={`View ${sr.originalSaleNumber}`}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                              <ExternalLink size={13} />
                            </button>
                          )}
                          <button onClick={() => setDeleteId(sr.id)} title="Delete"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Purchase Returns Tab ── */}
        {tab === "purchase" && (
          filteredPurchase.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                <Undo2 size={28} className="text-orange-300 dark:text-orange-700" />
              </div>
              <div>
                <p className="font-semibold text-gray-600 dark:text-gray-400">No purchase returns yet</p>
                <p className="text-sm text-muted-foreground mt-1">Click <strong>New Return</strong> to record a return against a purchase invoice.</p>
              </div>
              <Button onClick={() => setNewOpen(true)} size="sm" variant="outline" className="gap-2">
                <Plus size={14} /> New Return
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Return #</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Orig. Invoice</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Supplier</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Credit Method</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Reason</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {filteredPurchase.map(pr => (
                    <tr key={pr.id} className="hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-orange-700 dark:text-orange-400 font-mono">{pr.returnNumber}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => navigate(`/invoices?q=${encodeURIComponent(pr.originalInvoiceNumber)}`)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-[12px]">
                          {pr.originalInvoiceNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">{pr.supplier}</td>
                      <td className="px-4 py-3 text-muted-foreground">{pr.date}</td>
                      <td className="px-4 py-3 text-muted-foreground">{pr.refundMethod}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                        {sym}{pr.grandTotal.toFixed(dp)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={pr.status === "posted" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 text-[11px]" : "border-amber-400 text-amber-600 text-[11px]"}>
                          {pr.status === "posted" ? "Posted" : "Draft"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-[12px] max-w-[180px] truncate">{pr.reason || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setViewPR(pr)} title="View / Print"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                            <Eye size={13} />
                          </button>
                          <button onClick={() => handleDeletePurchase(pr)} title="Delete"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* New Return Sheet — opens the right form based on active tab */}
      <Sheet open={newOpen} onOpenChange={o => { if (!o) setNewOpen(false); }}>
        {tab === "sale" ? (
          <NewSaleReturnSheet onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); reload(); }} />
        ) : (
          <NewPurchaseReturnSheet onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); reload(); }} />
        )}
      </Sheet>

      {/* View Credit Note */}
      <Dialog open={!!viewSR} onOpenChange={o => { if (!o) setViewSR(null); }}>
        <DialogContent className="max-w-3xl h-[90vh] p-0 overflow-hidden flex flex-col">
          {viewSR && <CreditNoteView sr={viewSR} onClose={() => setViewSR(null)} />}
        </DialogContent>
      </Dialog>

      {/* View Debit Note */}
      <Dialog open={!!viewPR} onOpenChange={o => { if (!o) setViewPR(null); }}>
        <DialogContent className="max-w-3xl h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="sr-only"><DialogTitle>Purchase Return</DialogTitle></DialogHeader>
          {viewPR && <DebitNoteView pr={viewPR} onClose={() => setViewPR(null)} />}
        </DialogContent>
      </Dialog>

      {/* Delete Sale Return confirm */}
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
            <Button size="sm" variant="destructive" onClick={() => deleteId && handleDeleteSale(deleteId)}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suppress unused variable warning — accent is used conceptually via isSale */}
      {void accent}
    </div>
  );
}
