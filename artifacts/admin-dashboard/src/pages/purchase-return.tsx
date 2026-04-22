import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  getInvoices, getPurchaseReturns, createPurchaseReturn, updatePurchaseReturn, deletePurchaseReturn,
  deductStockForSale,
  type Invoice, type PurchaseReturn, type PurchaseReturnItem,
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
  ShoppingCart, ChevronRight, Package, X,
} from "lucide-react";

const dp = getSettingsDecimalPlaces();
const fmt = (n: number) => `${getSettingsCurrencySymbol()}${n.toFixed(dp)}`;
const today = () => new Date().toISOString().slice(0, 10);

const REFUND_METHODS = ["Bank Transfer", "Supplier Credit", "Cash", "Cheque", "Adjustment"] as const;
type RefundMethod = typeof REFUND_METHODS[number];

function calcItems(items: PurchaseReturnItem[]) {
  return items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0;
    const p = parseFloat(i.unitPrice) || 0;
    const d = parseFloat(i.discount) || 0;
    return s + q * p * (1 - d / 100);
  }, 0);
}

// ── Debit Note Print View ─────────────────────────────────────────────────────

function DebitNoteView({ pr, onClose }: { pr: PurchaseReturn; onClose: () => void }) {
  const sym = getSettingsCurrencySymbol();
  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 shrink-0 print:hidden">
        <div className="flex items-center gap-2">
          <Undo2 size={16} className="text-orange-500" />
          <span className="font-semibold text-sm">{pr.returnNumber}</span>
          <Badge variant="outline" className={pr.status === "posted" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-amber-400 text-amber-600 dark:text-amber-400"}>
            {pr.status === "posted" ? "Posted" : "Draft"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
            <Printer size={13} /> Print
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X size={14} /></Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-8 print:p-4 bg-white dark:bg-zinc-950">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                  <Undo2 size={16} className="text-white" />
                </div>
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

          {/* Supplier + refund method */}
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

          {/* Items */}
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

// ── New Purchase Return Sheet ──────────────────────────────────────────────────

interface NewReturnSheetProps {
  onClose: () => void;
  onSaved: () => void;
}

function NewPurchaseReturnSheet({ onClose, onSaved }: NewReturnSheetProps) {
  const { toast } = useToast();
  const [step, setStep]                 = useState<1 | 2>(1);
  const [search, setSearch]             = useState("");
  const [selectedInv, setSelectedInv]   = useState<Invoice | null>(null);
  const [returnItems, setReturnItems]   = useState<PurchaseReturnItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("Supplier Credit");
  const [reason, setReason]             = useState("");
  const [notes, setNotes]               = useState("");
  const [date, setDate]                 = useState(today());
  const [submitting, setSubmitting]     = useState(false);

  const sym = getSettingsCurrencySymbol();

  const purchaseInvoices = useMemo(
    () => getInvoices().filter(i => i.invoiceType === "purchase"),
    []
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return purchaseInvoices;
    const q = search.toLowerCase();
    return purchaseInvoices.filter(inv =>
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.customer || "").toLowerCase().includes(q) ||
      inv.items.some(it => (it.productName || it.description || "").toLowerCase().includes(q))
    );
  }, [purchaseInvoices, search]);

  const handleSelect = (inv: Invoice) => {
    setSelectedInv(inv);
    setReturnItems(inv.items.map(it => ({
      id:          crypto.randomUUID(),
      productName: it.productName || it.description || "",
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

  const removeItem = (id: string) =>
    setReturnItems(prev => prev.filter(i => i.id !== id));

  const subtotal   = calcItems(returnItems);
  const grandTotal = subtotal;

  const handlePost = async () => {
    if (!selectedInv) return;
    const effectiveItems = returnItems.filter(i => parseFloat(i.qty) > 0);
    if (effectiveItems.length === 0) {
      toast({ title: "All quantities are zero", variant: "destructive" }); return;
    }
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

      // Deduct stock (items returned to supplier leave our warehouse)
      deductStockForSale(
        effectiveItems.map(i => ({
          id:          i.id,
          productName: i.productName,
          sku:         i.sku,
          unit:        i.unit,
          qty:         i.qty,
          unitPrice:   i.unitPrice,
          discount:    i.discount,
          notes:       "",
          itemStatus:  "Reserved" as const,
        })),
        pr.returnNumber,
        "purchase-return"
      );

      toast({ title: `${pr.returnNumber} posted`, description: `Stock adjusted · Debit note created` });
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

      {/* Step 1 — Select invoice */}
      {step === 1 && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Search for the original purchase invoice to create a return against:</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Invoice number, supplier or item name…"
              className="pl-9"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No purchase invoices found</div>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 30).map(inv => {
                const total = inv.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
                return (
                  <button
                    key={inv.id}
                    onClick={() => handleSelect(inv)}
                    className="w-full text-left rounded-xl border border-gray-200 dark:border-zinc-800 p-3.5 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-all group"
                  >
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

      {/* Step 2 — Return items */}
      {step === 2 && selectedInv && (
        <div className="flex-1 overflow-y-auto">
          {/* Meta */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Return Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Credit Method</label>
              <select
                value={refundMethod}
                onChange={e => setRefundMethod(e.target.value as RefundMethod)}
                className="mt-1 h-8 w-full text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {REFUND_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reason</label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged on arrival…" className="mt-1 h-8 text-sm" />
            </div>
          </div>

          {/* Items */}
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Items to Return</p>
              <p className="text-xs text-muted-foreground">Set qty to 0 to exclude</p>
            </div>

            <div className="space-y-2">
              {returnItems.map(item => {
                const origItem = selectedInv.items.find(i => i.sku === item.sku || (i.productName || i.description) === item.productName);
                const maxQty = origItem?.qty || item.qty;
                const q = parseFloat(item.qty) || 0;
                const p = parseFloat(item.unitPrice) || 0;
                const d = parseFloat(item.discount) || 0;
                const lineTotal = q * p * (1 - d / 100);
                return (
                  <div key={item.id}
                    className={`rounded-xl border p-3 transition-all ${q === 0
                      ? "border-gray-100 dark:border-zinc-800 opacity-50"
                      : "border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/10"}`}
                  >
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
                            <Input
                              type="number"
                              min="0"
                              max={maxQty}
                              value={item.qty}
                              onChange={e => patchItem(item.id, "qty", e.target.value)}
                              className="w-20 h-7 text-sm text-right"
                            />
                          </div>
                          {q > 0 && <p className="text-[11px] font-bold text-orange-600 dark:text-orange-400">{sym}{lineTotal.toFixed(dp)}</p>}
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

      {/* Footer */}
      <div className="shrink-0 border-t border-gray-200 dark:border-zinc-800 px-6 py-4 bg-gray-50 dark:bg-zinc-900 flex items-center justify-between gap-3">
        {step === 2 ? (
          <>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Total Return</p>
              <p className="text-xl font-black text-orange-600 dark:text-orange-400">{fmt(grandTotal)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Back</Button>
              <Button
                size="sm"
                onClick={handlePost}
                disabled={submitting || returnItems.filter(i => parseFloat(i.qty) > 0).length === 0}
                className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
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

export default function PurchaseReturnPage() {
  const [, navigate]          = useLocation();
  const { toast }             = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [viewPr, setViewPr]   = useState<PurchaseReturn | null>(null);
  const [search, setSearch]   = useState("");
  const [rev, setRev]         = useState(0);
  const reload = () => setRev(r => r + 1);

  const returns = useMemo(() => {
    const all = getPurchaseReturns();
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  const filtered = useMemo(() => {
    if (!search.trim()) return returns;
    const q = search.toLowerCase();
    return returns.filter(r =>
      r.returnNumber.toLowerCase().includes(q) ||
      r.originalInvoiceNumber.toLowerCase().includes(q) ||
      r.supplier.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q) ||
      r.items.some(it => it.productName.toLowerCase().includes(q))
    );
  }, [returns, search]);

  const handleDelete = (pr: PurchaseReturn) => {
    if (!confirm(`Delete ${pr.returnNumber}? This cannot be undone.`)) return;
    deletePurchaseReturn(pr.id);
    toast({ title: `${pr.returnNumber} deleted` });
    reload();
  };

  const sym = getSettingsCurrencySymbol();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center">
              <Undo2 size={18} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Purchase Returns</h1>
              <p className="text-xs text-muted-foreground">Debit notes &amp; supplier returns</p>
            </div>
          </div>
          <Button onClick={() => setNewOpen(true)} className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white">
            <Plus size={15} /> New Return
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search returns…"
            className="pl-9"
          />
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center mx-auto">
              <Undo2 size={28} className="text-orange-400" />
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">No purchase returns yet</p>
            <p className="text-xs text-muted-foreground">Click "New Return" to record a return against a purchase invoice.</p>
            <Button onClick={() => setNewOpen(true)} variant="outline" size="sm" className="gap-1.5 mt-2">
              <Plus size={13} /> New Return
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Return #</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Orig. Invoice</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Supplier</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Credit Method</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {filtered.map(pr => (
                    <tr key={pr.id} className="hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-orange-700 dark:text-orange-400">{pr.returnNumber}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/invoices?q=${encodeURIComponent(pr.originalInvoiceNumber)}`)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs"
                        >
                          {pr.originalInvoiceNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{pr.supplier}</td>
                      <td className="px-4 py-3 text-muted-foreground">{pr.date}</td>
                      <td className="px-4 py-3 text-muted-foreground">{pr.refundMethod}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600 dark:text-orange-400">{sym}{pr.grandTotal.toFixed(dp)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={pr.status === "posted"
                          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                          : "border-amber-400 text-amber-600"}>
                          {pr.status === "posted" ? "Posted" : "Draft"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setViewPr(pr)} title="View"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                            <Eye size={13} />
                          </button>
                          <button onClick={() => handleDelete(pr)} title="Delete"
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
          </div>
        )}
      </div>

      {/* New Return Sheet */}
      <Sheet open={newOpen} onOpenChange={o => { if (!o) setNewOpen(false); }}>
        <NewPurchaseReturnSheet onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); reload(); }} />
      </Sheet>

      {/* View / Print Dialog */}
      <Dialog open={!!viewPr} onOpenChange={o => { if (!o) setViewPr(null); }}>
        <DialogContent className="max-w-3xl h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Purchase Return</DialogTitle>
          </DialogHeader>
          {viewPr && <DebitNoteView pr={viewPr} onClose={() => setViewPr(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
