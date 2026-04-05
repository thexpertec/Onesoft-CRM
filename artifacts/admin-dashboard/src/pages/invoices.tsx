import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { useInvoices } from "@/hooks/use-data";
import {
  Invoice, InvoiceStatus, INVOICE_STATUSES,
  SaleItem, SalePayment, SALE_PAYMENTS, ItemStatus, ITEM_STATUSES,
  PaymentRecord,
  getProducts, getCustomers, getSettings,
  deductStockForSale, restoreStockForSale,
} from "@/lib/store";
import { Combobox, ComboOption } from "@/components/combobox";
import { printFullInvoice } from "@/lib/print-invoice-full";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, Search, X, Trash2, Printer, Send,
  CheckCircle, AlertTriangle, Ban, RotateCcw,
  Save, CreditCard, ArrowLeft, Eye,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<InvoiceStatus, { bg: string; dot: string; label: string }> = {
  Draft:     { bg: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",         dot: "bg-gray-400",    label: "Draft"     },
  Sent:      { bg: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",       dot: "bg-blue-500",    label: "Sent"      },
  Paid:      { bg: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", label: "Paid" },
  Partial:   { bg: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",   dot: "bg-amber-500",   label: "Partial"   },
  Overdue:   { bg: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",           dot: "bg-red-500",     label: "Overdue"   },
  Cancelled: { bg: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",          dot: "bg-zinc-400",    label: "Cancelled" },
};

const ITEM_STATUS_STYLE: Record<ItemStatus, string> = {
  Reserved:  "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
  Delivered: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
  Pending:   "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const in30  = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };

const lineTotal = (item: SaleItem) => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  const d = parseFloat(item.discount) || 0;
  return q * p * (1 - d / 100);
};

const itemsSubtotal = (items: SaleItem[]) =>
  items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
const itemsDiscount = (items: SaleItem[]) =>
  items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0) * ((parseFloat(i.discount) || 0) / 100), 0);

const blankItem = (): SaleItem => ({
  id: crypto.randomUUID(),
  productName: "", sku: "", qty: "1", unit: "",
  unitPrice: "", discount: "0", notes: "",
  itemStatus: "Reserved",
});

const blankInvoice = (): Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt"> => {
  const s = getSettings();
  return {
    invoiceTitle:   "Tax Invoice",
    invoiceDate:    today(),
    dueDate:        in30(),
    customer:       "",
    customerId:     "",
    buyerAddress:   "",
    buyerPhone:     "",
    buyerEmail:     "",
    status:         "Draft",
    paymentMethod:  "Bank Transfer",
    paymentTerms:   "",
    bankDetails:    s.bankDetails || "",
    amountPaid:     "",
    paidAt:         "",
    paymentHistory: [],
    items:          [blankItem()],
    taxRate:        s.vatRate || "20",
    shippingFee:    "",
    handlingFee:    "",
    shippingMethod: "",
    notes:          "",
    agreement:      "",
    invoiceFooter:  "",
    stockDeducted:  false,
  };
};

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCcy(n: number): string {
  const sym = (() => {
    try { return (0).toLocaleString("en", { style: "currency", currency: getSettings().currency || "GBP", minimumFractionDigits: 0 }).replace(/[\d,. ]/g, "").trim(); }
    catch { return "£"; }
  })();
  return `${sym}${n.toFixed(2)}`;
}

function computeTotals(
  items: SaleItem[], taxRate: string, amountPaid: string,
  shippingFee = "0", handlingFee = "0"
) {
  const subtotal    = itemsSubtotal(items);
  const discountAmt = itemsDiscount(items);
  const after       = subtotal - discountAmt;
  const tax         = after * (parseFloat(taxRate) || 0) / 100;
  const shipping    = parseFloat(shippingFee) || 0;
  const handling    = parseFloat(handlingFee) || 0;
  const total       = after + tax + shipping + handling;
  const paid        = parseFloat(amountPaid) || 0;
  const balance     = Math.max(0, total - paid);
  return { subtotal, discountAmt, after, tax, shipping, handling, total, paid, balance };
}

function isOverdue(inv: Invoice): boolean {
  if (!inv.dueDate) return false;
  if (inv.status === "Paid" || inv.status === "Cancelled") return false;
  return new Date(inv.dueDate) < new Date(today());
}

// ─── Print — full A4 professional invoice ────────────────────────────────────
function printInvoice(inv: Invoice) {
  printFullInvoice(inv, getSettings());
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: InvoiceStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── Invoice Panel ────────────────────────────────────────────────────────────
interface PanelProps {
  invoice: Invoice | null;   // null = create mode
  onClose: () => void;
  onSave: (data: Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">, id?: string) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: InvoiceStatus, amountPaid?: string) => void;
}

function InvoicePanel({ invoice, onClose, onSave, onDelete, onStatusChange }: PanelProps) {
  const isNew = !invoice;

  const [form, setForm]         = useState<ReturnType<typeof blankInvoice>>(
    () => invoice ? { ...invoice } : blankInvoice()
  );
  const [items, setItems]       = useState<SaleItem[]>(() => invoice?.items ?? [blankItem()]);
  const [payHistory, setPayHist]= useState<PaymentRecord[]>(() => invoice?.paymentHistory ?? []);
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [payInput, setPayInput]       = useState(invoice?.amountPaid ?? "");
  useEffect(() => {
    setForm(invoice ? { ...invoice } : blankInvoice());
    setItems(invoice?.items ?? [blankItem()]);
    setPayHist(invoice?.paymentHistory ?? []);
    setPayInput(invoice?.amountPaid ?? "");
  }, [invoice?.id]);

  const products  = useMemo(() => getProducts(), []);
  const customers = useMemo(() => getCustomers(), []);
  const productOpts = useMemo<ComboOption[]>(() =>
    products.map(p => ({
      value: p.name,
      label: p.name,
      sub:   p.sku,
      tag:   p.category || undefined,
    })),
  [products]);
  const customerOpts = useMemo<ComboOption[]>(() =>
    customers.map(c => ({
      value: c.name,
      label: c.name,
      sub:   [c.company, c.email, c.phone].filter(Boolean).join(" · "),
    })),
  [customers]);

  const handleCustomerSelect = useCallback((name: string) => {
    const c = customers.find(x => x.name === name);
    setForm(f => ({
      ...f,
      customer:    name,
      customerId:  c ? c.id.slice(-8).toUpperCase() : f.customerId,
      buyerPhone:  c?.phone  || f.buyerPhone,
      buyerEmail:  c?.email  || f.buyerEmail,
      buyerAddress: c ? [c.company, c.city].filter(Boolean).join(", ") : f.buyerAddress,
    }));
  }, [customers]);

  const setF = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const { subtotal, discountAmt, tax, shipping, handling, total, paid, balance } =
    computeTotals(items, form.taxRate, payInput || "0", form.shippingFee, form.handlingFee);

  // ── Payment history helpers ──
  const blankPayRec = (): PaymentRecord => ({
    id: crypto.randomUUID(), date: today(), amount: "", method: "Bank Transfer", note: "",
  });
  const addPayRec    = () => setPayHist(p => [...p, blankPayRec()]);
  const removePayRec = (id: string) => setPayHist(p => p.filter(r => r.id !== id));
  const updatePayRec = (id: string, field: keyof PaymentRecord, val: string) =>
    setPayHist(p => p.map(r => r.id === id ? { ...r, [field]: val } : r));

  // ── Item helpers ──
  const updateItem = (id: string, field: keyof SaleItem, value: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const pickProduct = (id: string, name: string) => {
    const p = products.find(pr => pr.name === name);
    if (!p) return updateItem(id, "productName", name);
    setItems(prev => prev.map(i =>
      i.id === id
        ? { ...i, productName: p.name, sku: p.sku, unit: p.unit, unitPrice: p.price }
        : i
    ));
  };

  const cycleStatus = (id: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const next = ITEM_STATUSES[(ITEM_STATUSES.indexOf(i.itemStatus) + 1) % ITEM_STATUSES.length];
      return { ...i, itemStatus: next };
    }));
  };

  const addItem    = () => setItems(p => [...p, blankItem()]);
  const removeItem = (id: string) => setItems(p => p.filter(i => i.id !== id));

  const handleSave = () => {
    onSave({ ...form, items, paymentHistory: payHistory, amountPaid: payInput }, invoice?.id);
  };

  const inv = invoice;
  const s   = inv?.status;

  const statusActions = !isNew && inv ? (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Status Actions</p>
      <div className="grid grid-cols-2 gap-2">
        {(s === "Draft") && (
          <button onClick={() => onStatusChange(inv.id, "Sent")}
            className="h-9 rounded-xl border-2 border-blue-200 dark:border-blue-800 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-1.5 transition-colors">
            <Send size={13}/> Send Invoice
          </button>
        )}
        {(s === "Sent" || s === "Draft" || s === "Overdue" || s === "Partial") && (
          <button onClick={() => onStatusChange(inv.id, "Paid", payInput)}
            className="h-9 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-center gap-1.5 transition-colors">
            <CheckCircle size={13}/> Mark Paid
          </button>
        )}
        {(s === "Sent" || s === "Draft" || s === "Overdue") && (
          <button onClick={() => onStatusChange(inv.id, "Partial", payInput)}
            className="h-9 rounded-xl border-2 border-amber-200 dark:border-amber-800 text-[12px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center justify-center gap-1.5 transition-colors">
            <CreditCard size={13}/> Mark Partial
          </button>
        )}
        {(s === "Sent" || s === "Draft") && (
          <button onClick={() => onStatusChange(inv.id, "Overdue")}
            className="h-9 rounded-xl border-2 border-red-200 dark:border-red-800 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center gap-1.5 transition-colors">
            <AlertTriangle size={13}/> Mark Overdue
          </button>
        )}
        {(s === "Paid" || s === "Partial") && (
          <button onClick={() => onStatusChange(inv.id, "Draft")}
            className="h-9 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-[12px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1.5 transition-colors">
            <RotateCcw size={13}/> Revert to Draft
          </button>
        )}
        {(s !== "Cancelled") && (
          <button onClick={() => onStatusChange(inv.id, "Cancelled")}
            className="h-9 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 text-[12px] font-semibold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1.5 transition-colors">
            <Ban size={13}/> Cancel
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col">

      {/* ══ Top Bar ══════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0 sticky top-0 z-10">
        {/* Left: back + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft size={14}/> Invoices
          </button>
          <span className="text-gray-300 dark:text-zinc-600">/</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
              <FileText size={12} className="text-white"/>
            </div>
            <span className="text-[15px] font-bold text-gray-900 dark:text-gray-100">
              {isNew ? "New Invoice" : invoice.invoiceNumber}
            </span>
          </div>
          {!isNew && <StatusBadge status={invoice.status}/>}
          {!isNew && isOverdue(invoice) && invoice.status !== "Overdue" && (
            <span className="text-[11px] font-bold text-red-500">⚠ Overdue</span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={() => { try { printInvoice(invoice); } catch { /* blocked */ } }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors"
            >
              <Printer size={13}/> Print Invoice
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold shadow-md shadow-blue-200 dark:shadow-none transition-colors"
          >
            <Save size={13}/> {isNew ? "Create Invoice" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* ══ Single-column Body ════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800">
            <div className="px-5 py-4 space-y-4">

            {/* Customer + ID */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Customer</label>
                <Combobox
                  value={form.customer}
                  onChange={v => setF("customer", v)}
                  onSelect={opt => handleCustomerSelect(opt.value)}
                  options={customerOpts}
                  placeholder="Search or type customer name…"
                  className="w-full"
                  inputClassName="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Customer ID</label>
                <input
                  value={form.customerId}
                  onChange={e => setF("customerId", e.target.value)}
                  placeholder="Ref / ID"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Invoice Date + Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Invoice Date</label>
                <input
                  type="date" value={form.invoiceDate}
                  onChange={e => setF("invoiceDate", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Due Date</label>
                <input
                  type="date" value={form.dueDate}
                  onChange={e => setF("dueDate", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Payment Method + Tax */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Payment Method</label>
                <select
                  value={form.paymentMethod}
                  onChange={e => setF("paymentMethod", e.target.value as SalePayment)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {SALE_PAYMENTS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tax / VAT %</label>
                <input
                  type="number" min="0" max="100" value={form.taxRate}
                  onChange={e => setF("taxRate", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* ── Timestamps ── */}
          {!isNew && (
            <div className="border-t border-gray-100 dark:border-zinc-800 px-5 py-3 grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              <div><span className="font-semibold text-gray-700 dark:text-gray-300">Created:</span> {new Date(invoice.createdAt).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</div>
              <div><span className="font-semibold text-gray-700 dark:text-gray-300">Updated:</span> {new Date(invoice.updatedAt).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</div>
              {invoice.paidAt && <div className="col-span-2 text-emerald-600 dark:text-emerald-400"><span className="font-semibold">Paid at:</span> {new Date(invoice.paidAt).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</div>}
            </div>
          )}
        </div>{/* /left card */}

          {/* Items Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-zinc-800">
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Line Items</span>
              <button
                onClick={addItem}
                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              >
                <Plus size={12}/> Add Item
              </button>
            </div>

            <div className="px-4 pb-4 pt-2 space-y-2">
              {items.map((item, idx) => (
                <div key={item.id} className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-700">
                  {/* Row 1: product name + delete */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-gray-400 w-5 shrink-0">{idx + 1}.</span>
                    <div className="relative flex-1">
                      <Combobox
                        value={item.productName}
                        onChange={v => pickProduct(item.id, v)}
                        onSelect={opt => pickProduct(item.id, opt.value)}
                        options={productOpts}
                        placeholder="Search product / service…"
                        className="w-full"
                        inputClassName="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[12px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    {/* Item status pill */}
                    <button
                      onClick={() => cycleStatus(item.id)}
                      className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${ITEM_STATUS_STYLE[item.itemStatus]}`}
                      title="Click to cycle status"
                    >
                      {item.itemStatus}
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="shrink-0 p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Row 2: qty / unit / price / discount */}
                  <div className="grid grid-cols-4 gap-2 pl-7">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Qty</label>
                      <input
                        type="number" min="0" value={item.qty}
                        onChange={e => updateItem(item.id, "qty", e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[12px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Unit</label>
                      <input
                        value={item.unit}
                        onChange={e => updateItem(item.id, "unit", e.target.value)}
                        placeholder="pcs"
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[12px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Unit Price</label>
                      <input
                        type="number" min="0" step="0.01" value={item.unitPrice}
                        onChange={e => updateItem(item.id, "unitPrice", e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[12px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Disc %</label>
                      <input
                        type="number" min="0" max="100" value={item.discount}
                        onChange={e => updateItem(item.id, "discount", e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[12px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Line total */}
                  <div className="pl-7 mt-1.5 flex justify-between items-center">
                    {item.sku && <span className="text-[10px] text-gray-400">SKU: {item.sku}</span>}
                    <span className="text-[12px] font-bold text-gray-900 dark:text-gray-100 ml-auto">
                      = {fmtCcy(lineTotal(item))}
                    </span>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <button
                  onClick={addItem}
                  className="w-full py-6 rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-700 text-[12px] text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Add first item
                </button>
              )}
            </div>
          </div>

          {/* ── Totals + Payment History Card ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800">
            <div className="px-5 py-4 space-y-1.5 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex justify-between text-[12px] text-gray-600 dark:text-gray-400">
                <span>Subtotal</span><span className="font-mono">{fmtCcy(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-[12px] text-emerald-600 dark:text-emerald-400">
                  <span>Discount</span><span className="font-mono">−{fmtCcy(discountAmt)}</span>
                </div>
              )}
              {parseFloat(form.taxRate) > 0 && (
                <div className="flex justify-between text-[12px] text-gray-600 dark:text-gray-400">
                  <span>Tax / VAT ({form.taxRate}%)</span><span className="font-mono">{fmtCcy(tax)}</span>
                </div>
              )}
              {shipping > 0 && (
                <div className="flex justify-between text-[12px] text-gray-600 dark:text-gray-400">
                  <span>Shipping{form.shippingMethod ? ` (${form.shippingMethod})` : ""}</span>
                  <span className="font-mono">{fmtCcy(shipping)}</span>
                </div>
              )}
              {handling > 0 && (
                <div className="flex justify-between text-[12px] text-gray-600 dark:text-gray-400">
                  <span>Handling</span><span className="font-mono">{fmtCcy(handling)}</span>
                </div>
              )}
              <div className="flex justify-between text-[15px] font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-zinc-700">
                <span>Total</span><span className="font-mono">{fmtCcy(total)}</span>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <span className="text-[12px] text-gray-600 dark:text-gray-400 whitespace-nowrap">Amount Paid</span>
                <input
                  type="number" min="0" step="0.01"
                  value={payInput}
                  onChange={e => setPayInput(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {balance > 0.005 && (
                <div className="flex justify-between text-[13px] font-bold text-red-600 dark:text-red-400">
                  <span>Balance Due</span><span className="font-mono">{fmtCcy(balance)}</span>
                </div>
              )}
              {paid > 0 && balance <= 0.005 && (
                <div className="flex justify-between text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span>✓ Fully Paid</span><span className="font-mono">{fmtCcy(total)}</span>
                </div>
              )}
            </div>
          </div>{/* /sub-total card */}

          {/* ── Payment History ─────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-zinc-800">
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payment History</span>
              <button onClick={addPayRec} className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                <Plus size={12}/> Add Record
              </button>
            </div>
            <div className="px-4 pb-4 pt-2 space-y-2">
              {payHistory.length === 0 && (
                <p className="text-[12px] text-gray-400 dark:text-gray-500 py-2 text-center">No payment records yet. Click "Add Record" to start.</p>
              )}
              {payHistory.map(rec => (
                <div key={rec.id} className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-700">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Date</label>
                      <input type="date" value={rec.date} onChange={e => updatePayRec(rec.id, "date", e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[11px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Amount</label>
                      <input type="number" min="0" step="0.01" value={rec.amount} onChange={e => updatePayRec(rec.id, "amount", e.target.value)} placeholder="0.00" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[11px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Method</label>
                      <input value={rec.method} onChange={e => updatePayRec(rec.id, "method", e.target.value)} placeholder="Bank, Cash…" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[11px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Note</label>
                      <input value={rec.note} onChange={e => updatePayRec(rec.id, "note", e.target.value)} placeholder="Ref…" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-[11px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    <div className="col-span-1 pb-0.5">
                      <button onClick={() => removePayRec(rec.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"><X size={13}/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>{/* /payment history card */}

          {/* ── Payment Terms ────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 px-5 py-4">
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Payment Terms</label>
            <textarea
              rows={3} value={form.paymentTerms}
              onChange={e => setF("paymentTerms", e.target.value)}
              placeholder="e.g. Payment is due within 30 days of invoice date. Late payments may incur a 2% monthly fee…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* ── Agreement ────────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 px-5 py-4">
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Agreement</label>
            <textarea
              rows={4} value={form.agreement}
              onChange={e => setF("agreement", e.target.value)}
              placeholder="By accepting this invoice, the buyer agrees to the terms and conditions set out herein…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* ── Additional Notes / Terms ──────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 px-5 py-4">
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Additional Notes / Terms</label>
            <textarea
              rows={3} value={form.notes}
              onChange={e => setF("notes", e.target.value)}
              placeholder="Any extra notes, special conditions, or remarks shown on the invoice…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* ── Footer ───────────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 px-5 py-4">
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Invoice Footer</label>
            <textarea
              rows={2} value={form.invoiceFooter}
              onChange={e => setF("invoiceFooter", e.target.value)}
              placeholder="e.g. Thank you for your business! · Company Reg: 12345678 · VAT: GB123456789"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Status Actions */}
          {statusActions && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-4">
              {statusActions}
            </div>
          )}

          {/* Delete */}
          {!isNew && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="w-full h-9 rounded-xl border-2 border-red-100 dark:border-red-900/50 text-[12px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 size={13}/> Delete Invoice
            </button>
          )}
        </div>{/* /inner container */}
      </div>{/* /body */}

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              "{invoice?.invoiceNumber}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete(invoice!.id); onClose(); }} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Invoice Form Page (route wrapper) ────────────────────────────────────────
export function InvoiceFormPage() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { invoices, addInvoice, editInvoice, removeInvoice } = useInvoices();
  const { toast } = useToast();

  const invoiceId = params.id;
  const isNewRoute = !invoiceId || invoiceId === "new";
  const invoice = isNewRoute ? null : invoices.find(i => i.id === invoiceId) ?? null;

  const handleSave = useCallback((data: Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">, id?: string) => {
    if (id) {
      editInvoice(id, { ...data });
      toast({ title: "Invoice updated" });
    } else {
      const inv = addInvoice(data);
      toast({ title: "Invoice created", description: inv.invoiceNumber });
      navigate(`/invoices/${inv.id}`);
    }
  }, [editInvoice, addInvoice, toast, navigate]);

  const handleStatusChange = useCallback((id: string, status: InvoiceStatus, amountPaid?: string) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    const updates: Partial<Invoice> = { status };
    if (amountPaid !== undefined) updates.amountPaid = amountPaid;
    if (status === "Paid" || status === "Partial") {
      if (!inv.paidAt) updates.paidAt = new Date().toISOString();
    }
    if ((status === "Paid" || status === "Partial") && !inv.stockDeducted) {
      deductStockForSale(inv.items);
      updates.stockDeducted = true;
    }
    if ((status === "Draft" || status === "Cancelled") && inv.stockDeducted) {
      restoreStockForSale(inv.items);
      updates.stockDeducted = false;
      updates.paidAt = "";
    }
    editInvoice(id, updates);
    toast({ title: `Invoice marked ${status}` });
  }, [invoices, editInvoice, toast]);

  const handleDelete = useCallback((id: string) => {
    const inv = invoices.find(i => i.id === id);
    if (inv?.stockDeducted) restoreStockForSale(inv.items);
    removeInvoice(id);
    toast({ title: "Invoice deleted", variant: "destructive" });
    navigate("/invoices");
  }, [invoices, removeInvoice, toast, navigate]);

  return (
    <InvoicePanel
      invoice={invoice}
      onClose={() => navigate("/invoices")}
      onSave={handleSave}
      onDelete={handleDelete}
      onStatusChange={handleStatusChange}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const { invoices } = useInvoices();
  const [, navigate] = useLocation();

  const [statusFilter, setStatusFilter] = useState<"All" | InvoiceStatus>("All");
  const [search,       setSearch]       = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      const matchStatus = statusFilter === "All" || inv.status === statusFilter;
      const matchSearch = !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customer.toLowerCase().includes(q) ||
        inv.notes.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [invoices, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: invoices.length };
    INVOICE_STATUSES.forEach(s => { c[s] = invoices.filter(i => i.status === s).length; });
    return c;
  }, [invoices]);

  const TAB_DEFS: Array<{ label: string; value: "All" | InvoiceStatus }> = [
    { label: "All",       value: "All"       },
    { label: "Draft",     value: "Draft"     },
    { label: "Sent",      value: "Sent"      },
    { label: "Paid",      value: "Paid"      },
    { label: "Partial",   value: "Partial"   },
    { label: "Overdue",   value: "Overdue"   },
    { label: "Cancelled", value: "Cancelled" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">

      {/* ── Page Header ── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-200 dark:shadow-none">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">Invoices</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""} total</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/invoices/new")}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold shadow-md shadow-blue-200 dark:shadow-none transition-colors"
          >
            <Plus size={15} /> New Invoice
          </button>
        </div>

        {/* ── Filter Tabs ── */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto">
          {TAB_DEFS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                statusFilter === tab.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`}
            >
              {tab.label}
              {counts[tab.value] > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  statusFilter === tab.value ? "bg-white/20" : "bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-400"
                }`}>
                  {counts[tab.value]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-6 py-3 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice #, customer, notes…"
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>}
        </div>
      </div>

      {/* ── Invoice List ── */}
      <div className="px-6 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-gray-400" />
            </div>
            <p className="text-[15px] font-semibold text-gray-500 dark:text-gray-400">
              {invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}
            </p>
            {invoices.length === 0 && (
              <button onClick={() => navigate("/invoices/new")} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-[13px] font-bold mx-auto hover:bg-blue-700 transition-colors">
                <Plus size={14} /> Create First Invoice
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1.4fr_1.6fr_1fr_1fr_0.8fr_1fr_1fr_1.2fr_auto] gap-0 px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <div>Invoice #</div>
              <div>Customer</div>
              <div>Date</div>
              <div>Due Date</div>
              <div className="text-right">Items</div>
              <div className="text-right">Total</div>
              <div className="text-right">Paid</div>
              <div>Status</div>
              <div />
            </div>

            {/* Rows */}
            {filtered.map(inv => {
              const { total, paid, balance } = computeTotals(inv.items, inv.taxRate, inv.amountPaid);
              const overdue = isOverdue(inv);
              return (
                <div
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="grid grid-cols-[1.4fr_1.6fr_1fr_1fr_0.8fr_1fr_1fr_1.2fr_auto] gap-0 px-4 py-3 border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors items-center group"
                >
                  {/* Invoice # */}
                  <div className="font-mono text-[12px] font-bold text-gray-900 dark:text-gray-100 truncate pr-2">
                    {inv.invoiceNumber}
                  </div>

                  {/* Customer */}
                  <div className="text-[12px] text-gray-700 dark:text-gray-300 truncate pr-2">
                    {inv.customer || <span className="text-gray-400 italic">Walk-in</span>}
                  </div>

                  {/* Date */}
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    {fmtDate(inv.invoiceDate)}
                  </div>

                  {/* Due Date */}
                  <div className={`text-[11px] font-semibold ${overdue ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                    {fmtDate(inv.dueDate)}
                    {overdue && <span className="ml-1 text-[9px]">⚠</span>}
                  </div>

                  {/* Items count */}
                  <div className="text-[12px] text-gray-500 dark:text-gray-400 text-right">
                    {inv.items.length}
                  </div>

                  {/* Total */}
                  <div className="text-[12px] font-bold text-gray-900 dark:text-gray-100 text-right font-mono">
                    {fmtCcy(total)}
                  </div>

                  {/* Paid */}
                  <div className={`text-[12px] font-semibold text-right font-mono ${
                    paid >= total - 0.005 && total > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : paid > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-gray-400"
                  }`}>
                    {paid > 0 ? fmtCcy(paid) : "—"}
                  </div>

                  {/* Status */}
                  <div>
                    <StatusBadge status={inv.status} />
                  </div>

                  {/* Open arrow */}
                  <div className="pl-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400">
                    <Eye size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
