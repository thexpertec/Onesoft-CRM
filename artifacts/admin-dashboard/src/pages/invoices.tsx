import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useInvoices } from "@/hooks/use-data";
import {
  Invoice, InvoiceStatus, INVOICE_STATUSES,
  SaleItem, SalePayment, SALE_PAYMENTS,
  PaymentRecord, LegalDocument, InvoiceDoc,
  BankAccount,
  getProducts, getCustomers, getSettings, getSalesAgents, getBankAccounts, getInvoices,
  deductStockForSale, restoreStockForSale, autoPostSaleJE,
  receiveStockForPurchase, reverseStockForPurchase,
  createJournalEntry, updateInvoice, getInvoiceProductName,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { Combobox, ComboOption } from "@/components/combobox";
import RichTextEditor from "@/components/RichTextEditor";
import { printFullInvoice } from "@/lib/print-invoice-full";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, Search, X, Trash2, Printer, Send,
  CheckCircle, RotateCcw,
  Save, CreditCard, ArrowLeft, Eye,
  ChevronDown, ChevronUp, PlusCircle, FileDown,
  DollarSign, Receipt, BookOpen, ChevronRight, PackagePlus,
} from "lucide-react";
import { downloadExcel } from "@/lib/export-excel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const dp = getSettingsDecimalPlaces();

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<InvoiceStatus, { bg: string; dot: string; label: string }> = {
  Draft:     { bg: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",         dot: "bg-gray-400",    label: "Draft"     },
  Sent:      { bg: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",       dot: "bg-blue-500",    label: "Sent"      },
  Paid:      { bg: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", label: "Paid" },
  Partial:   { bg: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",   dot: "bg-amber-500",   label: "Partial"   },
  Overdue:   { bg: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",           dot: "bg-red-500",     label: "Overdue"   },
  Cancelled: { bg: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",          dot: "bg-zinc-400",    label: "Cancelled" },
};


// ─── Helpers ─────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const in30  = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };

const SALE_ORDER_STATUSES     = ["Pending", "Processing", "Dispatched", "Delivered", "Completed", "On Hold", "Cancelled"] as const;
const PURCHASE_ORDER_STATUSES = ["Pending", "Ordered", "Received", "Partially Received", "Overdue", "Paid", "Cancelled"] as const;

const lineTotal = (item: SaleItem) => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  const d = parseFloat(item.discount) || 0;
  if (item.discountType === "amt") return Math.max(0, q * p - d);
  return q * p * (1 - d / 100);
};

const itemsSubtotal = (items: SaleItem[]) =>
  items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
const itemsDiscount = (items: SaleItem[]) =>
  items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0;
    const p = parseFloat(i.unitPrice) || 0;
    const d = parseFloat(i.discount) || 0;
    if (i.discountType === "amt") return s + Math.min(d, q * p);
    return s + q * p * (d / 100);
  }, 0);

const blankItem = (): SaleItem => ({
  id: crypto.randomUUID(),
  productName: "", sku: "", qty: "1", unit: "",
  unitPrice: "", discount: "0", discountType: "pct", notes: "",
  itemStatus: "Delivered",
});

const blankInvoice = (type: "sale" | "purchase" = "sale"): Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt"> => {
  const s = getSettings();
  return {
    invoiceType:    type,
    invoiceTitle:   type === "purchase" ? "Purchase Invoice" : "Tax Invoice",
    invoiceDate:    today(),
    dueDate:        in30(),
    customer:       "",
    customerId:     "",
    buyerAddress:   "",
    buyerTown:      "",
    buyerPhone:     "",
    buyerEmail:     "",
    salesOfficer:   "",
    status:         "Draft",
    paymentMethod:  "Bank Transfer",
    paymentTerms:   "",
    bankDetails:    s.bankDetails || "",
    bankAccountIds: (s.bankAccounts ?? []).filter(a => a.isDefault).map(a => a.id),
    amountPaid:     "",
    paidAt:         "",
    paymentHistory: [],
    items:          [blankItem()],
    taxRate:        s.vatRate || "20",
    shippingFee:    "",
    handlingFee:    "",
    shippingMethod: "",
    saleStatus:     "",
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
  return `${sym}${n.toFixed(dp)}`;
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
function printInvoice(inv: Invoice, colsRTL?: boolean) {
  const s = getSettings();
  printFullInvoice(inv, colsRTL !== undefined ? { ...s, invoiceColsRTL: colsRTL } : s);
}

// ─── Built-in template snippets per field kind ────────────────────────────────
const BUILTIN_TEMPLATES: Record<"paymentTerms" | "agreement" | "notes", Array<{ label: string; value: string }>> = {
  paymentTerms: [
    {
      label: "Net 30",
      value: "Payment is due within 30 days of the invoice date. Late payments may incur a 2% monthly finance charge on the outstanding balance.",
    },
    {
      label: "Net 14",
      value: "Payment is due within 14 days of the invoice date. Please reference the invoice number on your payment.",
    },
    {
      label: "Due on Receipt",
      value: "Payment is due upon receipt of this invoice. Please contact us if you have any queries regarding this invoice.",
    },
    {
      label: "50% Upfront / 50% on Completion",
      value: "A 50% deposit is required before work commences. The remaining 50% balance is due upon project completion and delivery.",
    },
    {
      label: "Monthly Retainer",
      value: "This invoice is payable on the 1st of each month as part of the agreed monthly retainer. Direct Debit / Standing Order preferred.",
    },
  ],
  agreement: [
    {
      label: "Standard Acceptance Clause",
      value: "By accepting and/or paying this invoice, the buyer agrees to the terms and conditions set out herein. All work is performed subject to our standard terms of service, available upon request.",
    },
    {
      label: "English Law Clause",
      value: "This agreement is governed by and construed in accordance with the laws of England and Wales. Any disputes arising shall be subject to the exclusive jurisdiction of the courts of England and Wales.",
    },
    {
      label: "Intellectual Property Transfer",
      value: "Upon receipt of full payment, all intellectual property rights in the deliverables are assigned to the client. Until full payment is received, all rights remain with the supplier.",
    },
    {
      label: "Confidentiality",
      value: "Both parties agree to keep all information exchanged in connection with this invoice and the associated project strictly confidential and not to disclose it to any third party without prior written consent.",
    },
  ],
  notes: [
    {
      label: "Bank Transfer Reminder",
      value: "Please transfer payment directly to our bank account. Kindly quote the invoice number as the payment reference to ensure prompt allocation.",
    },
    {
      label: "Thank You Note",
      value: "Thank you for your business — we truly appreciate the opportunity to work with you and look forward to continuing our partnership.",
    },
    {
      label: "Queries Contact",
      value: "If you have any questions regarding this invoice or the services provided, please do not hesitate to contact us before the payment due date.",
    },
    {
      label: "VAT Note",
      value: "All amounts shown are exclusive of VAT unless otherwise stated. VAT will be applied at the prevailing rate where applicable.",
    },
  ],
};

// ─── DocBlock types ────────────────────────────────────────────────────────────
type DocKind = "paymentTerms" | "agreement" | "notes";

interface DocBlock extends InvoiceDoc {
  kind: DocKind;
  open: boolean;
}

const PREDEFINED_DOC_TYPES: Array<{ kind: DocKind; title: string }> = [
  { kind: "paymentTerms", title: "Payment Terms" },
  { kind: "agreement",    title: "Agreement"      },
  { kind: "notes",        title: "Additional Notes" },
];

function titleToKind(title: string): DocKind {
  const t = title.toLowerCase();
  if (t.includes("payment") || t.includes("term")) return "paymentTerms";
  if (t.includes("agreement") || t.includes("contract") || t.includes("t&c")) return "agreement";
  return "notes";
}

// ─── DocPicker — insert content from a built-in template or saved legal doc ───
function DocPicker({
  onPick,
  docs,
  kind,
}: {
  onPick: (content: string, docTitle?: string) => void;
  docs: LegalDocument[];
  kind: DocKind;
}) {
  const builtins = BUILTIN_TEMPLATES[kind] ?? BUILTIN_TEMPLATES.notes;
  const hasCustom = docs.length > 0;

  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">Insert template:</span>
      <select
        value=""
        onChange={e => {
          const val = e.target.value;
          if (!val) return;
          // Built-in template — no title update
          const builtin = builtins.find(b => b.label === val);
          if (builtin) {
            onPick(`<p>${builtin.value}</p>`);
            e.currentTarget.value = "";
            return;
          }
          // Saved legal document — pass its title so the block title can sync
          const doc = docs.find(d => d.id === val);
          if (doc) { onPick(doc.content, doc.title); e.currentTarget.value = ""; }
        }}
        className="flex-1 px-2 py-1 text-[11px] rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
      >
        <option value="">— choose a template —</option>
        <optgroup label="Built-in Templates">
          {builtins.map(b => (
            <option key={b.label} value={b.label}>{b.label}</option>
          ))}
        </optgroup>
        {hasCustom && (
          <optgroup label="My Legal Documents">
            {docs.map(d => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
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

// ─── Collect Payment Modal ─────────────────────────────────────────────────────
interface CollectPaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoiceNumber: string;
  outstanding: number;
  onConfirm: (record: PaymentRecord) => void;
  isPurchase?: boolean;
}
function CollectPaymentModal({ open, onClose, invoiceNumber, outstanding, onConfirm, isPurchase }: CollectPaymentModalProps) {
  const sym = getSettingsCurrencySymbol();
  const [amount, setAmount]   = useState(outstanding > 0 ? outstanding.toFixed(dp) : "");
  const [method, setMethod]   = useState<SalePayment>("Bank Transfer");
  const [date,   setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [note,   setNote]     = useState("");

  useEffect(() => {
    if (open) {
      setAmount(outstanding > 0 ? outstanding.toFixed(dp) : "");
      setDate(new Date().toISOString().slice(0, 10));
      setNote("");
    }
  }, [open, outstanding]);

  if (!open) return null;

  const amt = parseFloat(amount) || 0;
  const valid = amt > 0;

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm({ id: crypto.randomUUID(), date, amount: amount, method, note });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-zinc-800 bg-emerald-50 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <DollarSign size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {isPurchase ? "Pay Supplier" : "Collect Payment"}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{invoiceNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400"><X size={16}/></button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Outstanding balance display */}
          {outstanding > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Outstanding Balance</span>
              <span className="text-base font-bold font-mono text-amber-700 dark:text-amber-400">{sym}{outstanding.toFixed(dp)}</span>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Amount Received *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">{sym}</span>
              <input
                type="number" min="0.01" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-base font-bold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Method */}
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Payment Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value as SalePayment)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {SALE_PAYMENTS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Payment Date</label>
            <input
              type="date" value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Reference / Note</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Bank ref, cheque #, etc."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-zinc-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!valid}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-emerald-200 dark:shadow-none"
          >
            <CheckCircle size={15}/> Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Panel ────────────────────────────────────────────────────────────
interface PanelProps {
  invoice: Invoice | null;   // null = create mode
  onClose: () => void;
  onSave: (data: Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">, id?: string) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: InvoiceStatus, amountPaid?: string) => void;
  onCollectPayment: (id: string, record: PaymentRecord, newTotalPaid: string, newStatus: InvoiceStatus) => void;
  defaultType?: "sale" | "purchase";
}

function InvoicePanel({ invoice, onClose, onSave, onDelete, onStatusChange, onCollectPayment, defaultType = "sale" }: PanelProps) {
  const isNew = !invoice;
  const invoiceType: "sale" | "purchase" = (invoice?.invoiceType ?? defaultType) as "sale" | "purchase";
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();
  const [, navigate] = useLocation();

  const [form, setForm]         = useState<ReturnType<typeof blankInvoice>>(
    () => invoice ? { ...invoice } : blankInvoice(defaultType)
  );
  const [items, setItems]       = useState<SaleItem[]>(() => invoice?.items ?? [blankItem()]);
  const [payHistory, setPayHist]= useState<PaymentRecord[]>(() => invoice?.paymentHistory ?? []);
  const [deleteOpen, setDeleteOpen]         = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [payInput, setPayInput]       = useState(invoice?.amountPaid ?? "");
  const [collectPayOpen, setCollectPayOpen] = useState(false);
  const [docsOpen, setDocsOpen]            = useState(false);
  const [moreOpen, setMoreOpen]            = useState(false);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>(
    () => invoice?.bankAccountIds ?? []
  );
  const availableBankAccounts = useMemo(() => getBankAccounts(), []);

  // ── Stock-receive guard: prevents double-clicks before React re-render ──
  const stockReceiveInProgress = useRef(false);
  const [stockJustReceived, setStockJustReceived] = useState(
    () => !!(invoice?.stockReceived || invoice?.stockDeducted)
  );
  // Sync the local flag whenever the invoice (re-)loads
  useEffect(() => {
    setStockJustReceived(!!(invoice?.stockReceived || invoice?.stockDeducted));
    stockReceiveInProgress.current = false;
  }, [invoice?.id, invoice?.stockReceived, invoice?.stockDeducted]);

  // ── Docs state ──
  const initDocs = (inv: Invoice | null): DocBlock[] => {
    if (!inv) return [];
    if (inv.invoiceDocs?.length) {
      return inv.invoiceDocs.map(d => ({ ...d, kind: titleToKind(d.title), open: true }));
    }
    // Backward-compat: migrate old fields
    const migrated: DocBlock[] = [];
    if (inv.paymentTerms) migrated.push({ id: crypto.randomUUID(), kind: "paymentTerms", title: "Payment Terms",    content: inv.paymentTerms, open: true });
    if (inv.agreement)    migrated.push({ id: crypto.randomUUID(), kind: "agreement",    title: "Agreement",        content: inv.agreement,    open: true });
    if (inv.notes)        migrated.push({ id: crypto.randomUUID(), kind: "notes",        title: "Additional Notes", content: inv.notes,        open: true });
    return migrated;
  };
  const [docs, setDocs] = useState<DocBlock[]>(() => initDocs(invoice));

  useEffect(() => {
    setForm(invoice ? { ...invoice } : blankInvoice(defaultType));
    setItems(invoice?.items ?? [blankItem()]);
    setPayHist(invoice?.paymentHistory ?? []);
    setPayInput(invoice?.amountPaid ?? "");
    setDocs(initDocs(invoice));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, defaultType]);

  const { toast } = useToast();
  const products    = useMemo(() => getProducts(), []);
  const customers   = useMemo(() => getCustomers(), []);
  const settings    = useMemo(() => getSettings(), []);
  const legalDocs   = useMemo(() => settings.legalDocuments ?? [], [settings]);
  const productOpts = useMemo<ComboOption[]>(() =>
    products.map(p => ({
      value: p.name,
      label: p.name,
      sub:   [p.sku, p.brand].filter(Boolean).join(" · "),
      tag:   p.category || undefined,
    })),
  [products]);
  const customerOpts = useMemo<ComboOption[]>(() => {
    const mapped = customers.map(c => ({
      value: c.name,
      label: c.name,
      sub:   [c.company, c.phone].filter(Boolean).join(" · "),
      tag:   (c.customerRole as string | undefined) || undefined,
    }));
    const preferred = invoiceType === "purchase" ? "Supplier" : "Buyer";
    return [
      ...mapped.filter(o => o.tag === preferred),
      ...mapped.filter(o => o.tag !== preferred),
    ];
  }, [customers, invoiceType]);
  const handleCustomerSelect = useCallback((name: string) => {
    const c = customers.find(x => x.name === name);
    setForm(f => ({
      ...f,
      customer:     name,
      customerId:   c ? c.id.slice(-8).toUpperCase() : f.customerId,
      salesOfficer: c?.company || f.salesOfficer,
      buyerPhone:   c?.phone   || f.buyerPhone,
      buyerEmail:   c?.email   || f.buyerEmail,
      buyerAddress: f.buyerAddress,
      buyerTown:    c?.city    || f.buyerTown,
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
    const autoPrice = invoiceType === "purchase"
      ? (p.purchasePrice && p.purchasePrice !== "" ? p.purchasePrice : p.price)
      : p.price;
    setItems(prev => prev.map(i =>
      i.id === id
        ? { ...i, productName: getInvoiceProductName(p), localName: p.localName || "", sku: p.sku, unit: p.unit, unitPrice: autoPrice }
        : i
    ));
  };


  const addItem    = () => setItems(p => [...p, blankItem()]);
  const removeItem = (id: string) => setItems(p => p.filter(i => i.id !== id));

  const focusNextItemField = useCallback((itemId: string, field: "product" | "price" | "qty" | "discount") => {
    const FIELDS = ["product", "price", "qty", "discount"] as const;
    const fieldIdx  = FIELDS.indexOf(field);
    setItems(prev => {
      const itemIdx = prev.findIndex(i => i.id === itemId);
      if (fieldIdx < FIELDS.length - 1) {
        const nextField = FIELDS[fieldIdx + 1];
        setTimeout(() => {
          const el = nextField === "product"
            ? document.querySelector<HTMLElement>(`[data-item-product="${itemId}"] input`)
            : document.querySelector<HTMLElement>(`input[data-item-id="${itemId}"][data-field="${nextField}"]`);
          el?.focus();
        }, 0);
      } else {
        if (itemIdx < prev.length - 1) {
          const nextId = prev[itemIdx + 1].id;
          setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-item-product="${nextId}"] input`);
            el?.focus();
          }, 0);
        } else {
          const fresh = blankItem();
          const updated = [...prev, fresh];
          setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-item-product="${fresh.id}"] input`);
            el?.focus();
          }, 30);
          return updated;
        }
      }
      return prev;
    });
  }, []);

  const handleSave = () => {
    onSave({
      ...form,
      items,
      paymentHistory:  payHistory,
      amountPaid:      payInput,
      bankAccountIds:  selectedBankIds,
      invoiceDocs:     docs.map(({ id, title, content }) => ({ id, title, content })),
      // Clear legacy fields — data now lives in invoiceDocs
      paymentTerms:    "",
      notes:           "",
      agreement:       "",
    }, invoice?.id);
  };

  const inv = invoice;
  const s   = inv?.status;
  const jeId = invoice?.jeId;
  const savedHistory = invoice?.paymentHistory ?? [];

  return (
    <div className="-mx-5 md:-mx-8 -my-6 md:-my-8 min-h-full bg-gray-50 dark:bg-zinc-950 flex flex-col">

      {/* ══ Top Bar ═══════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 md:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
        {/* Left */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0"
          >
            <ArrowLeft size={15}/> Invoices
          </button>
          <span className="text-gray-300 dark:text-zinc-600 shrink-0">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${invoiceType === "purchase" ? "bg-purple-600" : "bg-blue-600"}`}>
              <FileText size={13} className="text-white"/>
            </div>
            <span className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
              {isNew ? (invoiceType === "purchase" ? "New Purchase Invoice" : "New Sale Invoice") : invoice.invoiceNumber}
            </span>
            {!isNew && <StatusBadge status={invoice.status}/>}
            {!isNew && isOverdue(invoice) && invoice.status !== "Overdue" && (
              <span className="text-xs font-bold text-red-500 shrink-0">⚠ Overdue</span>
            )}
          </div>
        </div>

      </div>

      {/* ══ Body ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 px-4 md:px-6 py-5 pb-28">
        <div className="max-w-7xl mx-auto space-y-4">

          {/* ── Section 1: Customer + Invoice Details (2 columns) ───────────── */}
          <div className="grid lg:grid-cols-2 gap-4">

            {/* Customer Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
                <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">
                  {invoiceType === "purchase" ? "Supplier" : "Customer"}
                </span>
              </div>
              <div className="px-5 py-4 space-y-3">
                {/* Name (combobox) */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                    {invoiceType === "purchase" ? "Supplier Name" : "Customer Name"}
                  </label>
                  <Combobox
                    value={form.customer}
                    onChange={v => setF("customer", v)}
                    onSelect={opt => handleCustomerSelect(opt.value)}
                    options={customerOpts}
                    maxResults={20}
                    minDropdownWidth={380}
                    placeholder={invoiceType === "purchase" ? "Search supplier…" : "Search customer…"}
                    inputClassName="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                {/* Company */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Company</label>
                  <input value={form.salesOfficer} onChange={e => setF("salesOfficer", e.target.value)} placeholder="Company / organisation name"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                {/* Phone */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Phone</label>
                  <input value={form.buyerPhone} onChange={e => setF("buyerPhone", e.target.value)} placeholder="+44…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                {/* Area */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Area / City</label>
                  <input value={form.buyerTown} onChange={e => setF("buyerTown", e.target.value)} placeholder="Town / Area / City"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                {/* Address */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Address</label>
                  <textarea rows={2} value={form.buyerAddress} onChange={e => setF("buyerAddress", e.target.value)} placeholder="Street address…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"/>
                </div>
              </div>
            </div>

            {/* Invoice Details Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
                <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">Invoice Details</span>
                {!isNew && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Created {new Date(invoice.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
              <div className="px-5 py-4 space-y-3">
                {/* Invoice Title */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Invoice Title</label>
                  <input value={form.invoiceTitle} onChange={e => setF("invoiceTitle", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                {/* Date + Due Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Invoice Date</label>
                    <input type="date" value={form.invoiceDate} onChange={e => setF("invoiceDate", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Due Date</label>
                    <input type="date" value={form.dueDate} onChange={e => setF("dueDate", e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isOverdue(form as unknown as Invoice) ? "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400" : "border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-gray-100"}`}/>
                  </div>
                </div>
                {/* Sales Agent */}
                {invoiceType !== "purchase" && (() => {
                  const agents = getSalesAgents().filter(a => a.status === "Active");
                  return (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Sales Agent</label>
                      <select value={form.agentId || ""} onChange={e => {
                        const agent = agents.find(a => a.id === e.target.value);
                        setF("agentId", agent?.id || ""); setF("agentName", agent?.name || "");
                      }} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="">— None —</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.agentCode})</option>)}
                      </select>
                    </div>
                  );
                })()}
                {/* Payment Method + Tax */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Payment Method</label>
                    <select value={form.paymentMethod} onChange={e => setF("paymentMethod", e.target.value as SalePayment)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                      {SALE_PAYMENTS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">VAT / Tax %</label>
                    <input type="number" min="0" max="100" value={form.taxRate} onChange={e => setF("taxRate", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  </div>
                </div>
                {/* Sale/Purchase Status */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                    {invoiceType === "purchase" ? "Purchase Status" : "Sale Status"}
                  </label>
                  <select value={form.saleStatus ?? ""} onChange={e => setF("saleStatus", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">— Select status —</option>
                    {(invoiceType === "purchase" ? PURCHASE_ORDER_STATUSES : SALE_ORDER_STATUSES).map(st => <option key={st}>{st}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>{/* /section 1 */}

          {/* ── Section 2: Line Items (full width) ──────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[28px_1fr_110px_80px_110px_100px_36px] gap-0 px-4 py-2.5 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">#</span>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider pl-1">Product / Service</span>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider text-right">Unit Price</span>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider text-center">Qty</span>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider text-center">Discount</span>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider text-right">Sub Total</span>
              <span />
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {items.length === 0 && (
                <button onClick={addItem}
                  className="w-full py-8 text-sm text-gray-400 hover:text-blue-500 flex items-center justify-center gap-2 transition-colors">
                  <Plus size={15}/> Add first item
                </button>
              )}
              {items.map((item, idx) => (
                <div key={item.id}>
                  {/* Item row */}
                  <div className="grid grid-cols-[28px_1fr_110px_80px_110px_100px_36px] gap-0 px-4 py-2 items-center hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                    {/* # */}
                    <span className="text-[11px] font-bold text-gray-400 dark:text-zinc-500">{idx + 1}</span>
                    {/* Product */}
                    <div className="pl-1 pr-2" data-item-product={item.id}>
                      <Combobox value={item.productName} onChange={v => pickProduct(item.id, v)}
                        onSelect={opt => pickProduct(item.id, opt.value)} options={productOpts} placeholder="Product / service…"
                        maxResults={15} minDropdownWidth={320}
                        onKeyDown={e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusNextItemField(item.id, "product"); } }}
                        inputClassName="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                      {item.sku && <span className="text-[10px] text-gray-400 pl-1">SKU: {item.sku}</span>}
                    </div>
                    {/* Unit Price */}
                    <div className="px-1">
                      <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(item.id, "unitPrice", e.target.value)} placeholder="0.00"
                        data-item-id={item.id} data-field="price"
                        onKeyDown={e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusNextItemField(item.id, "price"); } }}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-right text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    {/* Qty */}
                    <div className="px-1">
                      <input type="number" min="0" value={item.qty} onChange={e => updateItem(item.id, "qty", e.target.value)}
                        data-item-id={item.id} data-field="qty"
                        onKeyDown={e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusNextItemField(item.id, "qty"); } }}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-center text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    {/* Discount */}
                    <div className="px-1 flex gap-1">
                      <input type="number" min="0" {...(item.discountType !== "amt" ? { max: "100" } : {})} step="0.01"
                        value={item.discount} onChange={e => updateItem(item.id, "discount", e.target.value)}
                        placeholder="0"
                        data-item-id={item.id} data-field="discount"
                        onKeyDown={e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusNextItemField(item.id, "discount"); } }}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-center text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                      <button type="button"
                        onClick={() => updateItem(item.id, "discountType", item.discountType === "amt" ? "pct" : "amt")}
                        className="shrink-0 w-8 rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 text-[10px] font-bold text-gray-500 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors">
                        {item.discountType === "amt" ? sym : "%"}
                      </button>
                    </div>
                    {/* Sub Total */}
                    <div className="px-1 text-right">
                      <span className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100">{sym}{lineTotal(item).toFixed(dp)}</span>
                    </div>
                    {/* Delete */}
                    <div className="flex justify-center">
                      <button onClick={() => removeItem(item.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                        <X size={14}/>
                      </button>
                    </div>
                  </div>
                  {/* Add item after this row */}
                  <button onClick={() => {
                    const newItem = blankItem();
                    setItems(prev => {
                      const next = [...prev];
                      next.splice(idx + 1, 0, newItem);
                      return next;
                    });
                  }}
                    className="w-full flex items-center gap-1.5 px-6 py-1 text-[11px] font-semibold text-gray-300 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors group">
                    <Plus size={11} className="group-hover:scale-110 transition-transform shrink-0"/>
                    Add item
                  </button>
                </div>
              ))}
            </div>
          </div>{/* /section 2 */}

          {/* ── Section 3: Charges + Bank Details (full width) ──────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
              <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">Charges &amp; Bank Details</span>
            </div>
            <div className="px-5 py-4">
              <div className="grid lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Delivery Charges</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">{sym}</span>
                    <input type="number" min="0" step="0.01" value={form.shippingFee} onChange={e => setF("shippingFee", e.target.value)} placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Other Charges</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">{sym}</span>
                    <input type="number" min="0" step="0.01" value={form.handlingFee} onChange={e => setF("handlingFee", e.target.value)} placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Payment / Bank Accounts</label>
                  {availableBankAccounts.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                      No bank accounts configured. Add them in Settings → Invoice Defaults.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableBankAccounts.map(acc => {
                        const selected = selectedBankIds.includes(acc.id);
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => setSelectedBankIds(prev =>
                              selected ? prev.filter(id => id !== acc.id) : [...prev, acc.id]
                            )}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                              selected
                                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                                : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                            }`}
                          >
                            {selected && <span className="text-[10px]">✓</span>}
                            {acc.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>{/* /section 3 */}

          {/* ── Section 4: Totals (full width) ──────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
              <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">Summary</span>
            </div>
            <div className="px-5 py-4">
              <div className="max-w-sm ml-auto space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Sub Total</span>
                  <span className="font-mono font-semibold">{sym}{subtotal.toFixed(dp)}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-mono font-semibold">−{sym}{discountAmt.toFixed(dp)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>VAT / Tax ({form.taxRate || 0}%)</span>
                  <span className="font-mono font-semibold">{sym}{tax.toFixed(dp)}</span>
                </div>
                {shipping > 0 && (
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Delivery Charges</span>
                    <span className="font-mono font-semibold">{sym}{shipping.toFixed(dp)}</span>
                  </div>
                )}
                {handling > 0 && (
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Other Charges</span>
                    <span className="font-mono font-semibold">{sym}{handling.toFixed(dp)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-zinc-700">
                  <span>Total Amount</span>
                  <span className="font-mono">{sym}{total.toFixed(dp)}</span>
                </div>
                {balance > 0.005 && (
                  <div className="flex justify-between text-sm font-bold text-red-600 dark:text-red-400">
                    <span>Balance Due</span>
                    <span className="font-mono">{sym}{balance.toFixed(dp)}</span>
                  </div>
                )}
                {paid > 0 && balance <= 0.005 && (
                  <div className="flex justify-between text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    <span>✓ Fully Paid</span>
                    <span className="font-mono">{sym}{total.toFixed(dp)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>{/* /section 4 */}

          {/* ── Bank Account Detail Boxes (full width, shown when accounts selected) ── */}
          {selectedBankIds.length > 0 && (() => {
            const selected = availableBankAccounts.filter(a => selectedBankIds.includes(a.id));
            return selected.length > 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-5 py-3 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
                  <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">Payment Details</span>
                </div>
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selected.map(acc => (
                    <div key={acc.id} className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl px-4 py-3">
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1.5">{acc.name}</p>
                      <pre className="text-[12px] text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{acc.details}</pre>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* ── Section 5: Document (full width) ────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <button onClick={() => setDocsOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 bg-gray-800 dark:bg-zinc-950 hover:bg-gray-700 dark:hover:bg-zinc-900 border-b border-gray-700 dark:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2">
                <ChevronRight size={14} className={`text-gray-300 transition-transform ${docsOpen ? "rotate-90" : ""}`}/>
                <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">Document</span>
                {docs.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-600 text-gray-200">{docs.length}</span>
                )}
              </div>
              <span className="text-[11px] text-gray-400">Payment terms, agreement, notes</span>
            </button>
            {docsOpen && (
              <div className="border-t border-gray-100 dark:border-zinc-800 px-5 py-4 space-y-3">
                {docs.map((doc, idx) => {
                  const plainPreview = doc.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
                  return (
                    <div key={doc.id} className="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/60 cursor-pointer"
                        onClick={() => setDocs(prev => prev.map((d, i) => i === idx ? { ...d, open: !d.open } : d))}>
                        <ChevronDown size={13} className={`text-gray-400 transition-transform ${doc.open ? "" : "-rotate-90"}`}/>
                        <input value={doc.title}
                          onChange={e => setDocs(prev => prev.map((d, i) => i === idx ? { ...d, title: e.target.value, kind: titleToKind(e.target.value) } : d))}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200 bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-blue-400 transition-colors pb-0.5"
                          placeholder="Document Title"/>
                        {!doc.open && plainPreview && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[200px] hidden sm:block">{plainPreview}…</span>
                        )}
                        <button onClick={e => { e.stopPropagation(); setDocs(prev => prev.filter((_, i) => i !== idx)); }}
                          className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors flex-shrink-0"><X size={13}/></button>
                      </div>
                      {doc.open && (
                        <div className="px-4 py-3 border-t border-gray-100 dark:border-zinc-800">
                          <DocPicker docs={legalDocs} kind={doc.kind}
                            onPick={(content, docTitle) => setDocs(prev => prev.map((d, i) =>
                              i === idx ? { ...d, content, ...(docTitle ? { title: docTitle, kind: titleToKind(docTitle) } : {}) } : d
                            ))}/>
                          <RichTextEditor value={doc.content}
                            onChange={html => setDocs(prev => prev.map((d, i) => i === idx ? { ...d, content: html } : d))}
                            placeholder="Start typing or insert a template above…" minHeight="100px"/>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2 pt-1">
                  {PREDEFINED_DOC_TYPES.map(pt => (
                    <button key={pt.kind}
                      onClick={() => setDocs(prev => [...prev, { id: crypto.randomUUID(), kind: pt.kind, title: pt.title, content: "", open: true }])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-zinc-600 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                      <PlusCircle size={12}/> {pt.title}
                    </button>
                  ))}
                  <button onClick={() => setDocs(prev => [...prev, { id: crypto.randomUUID(), kind: "notes", title: "Custom Document", content: "", open: true }])}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-zinc-600 text-xs text-gray-500 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                    <PlusCircle size={12}/> Custom Document
                  </button>
                </div>
              </div>
            )}
          </div>{/* /section 5 */}

          {/* ── Payments Card (existing invoices only) ───────────────────────── */}
          {!isNew && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-700 dark:border-zinc-700 flex items-center justify-between bg-gray-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2">
                  <Receipt size={14} className="text-emerald-400"/>
                  <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">Payments</span>
                </div>
                {jeId && (
                  <button
                    onClick={() => navigate(`/journal-entry?q=${encodeURIComponent(invoice?.invoiceNumber || "")}`)}
                    title="View journal entry"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-[11px] font-bold text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
                    <BookOpen size={11}/> JE Posted ↗
                  </button>
                )}
              </div>
              <div className="px-5 py-4">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 text-center">
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Invoice Total</p>
                    <p className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100">{sym}{total.toFixed(dp)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-center">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider mb-1">
                      {invoiceType === "purchase" ? "Paid to Supplier" : "Collected"}
                    </p>
                    <p className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">{sym}{paid.toFixed(dp)}</p>
                  </div>
                  <div className={`p-3 rounded-xl text-center ${balance > 0.005 ? "bg-red-50 dark:bg-red-950/20" : "bg-emerald-50 dark:bg-emerald-950/20"}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${balance > 0.005 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-500"}`}>
                      {balance > 0.005 ? "Outstanding" : "✓ Settled"}
                    </p>
                    <p className={`text-sm font-bold font-mono ${balance > 0.005 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                      {sym}{balance.toFixed(dp)}
                    </p>
                  </div>
                </div>
                {savedHistory.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Payment History</p>
                    {savedHistory.map((rec, i) => (
                      <div key={rec.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-700">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <div>
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{rec.method}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{fmtDate(rec.date)}{rec.note ? ` · ${rec.note}` : ""}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">{sym}{parseFloat(rec.amount || "0").toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                    {invoiceType === "purchase" ? "No payments made yet." : "No payments recorded yet."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Status Actions ───────────────────────────────────────────────── */}
          {!isNew && (
            (invoiceType === "purchase" && s !== ("Cancelled" as InvoiceStatus)) ||
            (s === "Draft" && invoiceType !== "purchase") ||
            s === "Paid" || s === "Partial"
          ) && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-4 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {invoiceType === "purchase" && !isNew && s !== ("Cancelled" as InvoiceStatus) && (
                  <button onClick={() => {
                    if (stockReceiveInProgress.current || stockJustReceived) return;
                    stockReceiveInProgress.current = true;
                    setStockJustReceived(true);
                    receiveStockForPurchase(invoice!.items, invoice!.invoiceNumber, "Purchase");
                    updateInvoice(invoice!.id, { stockReceived: true, stockDeducted: true });
                    toast({ title: "Stock Updated", description: `Items from ${invoice!.invoiceNumber} added to stock.` });
                  }}
                    disabled={stockJustReceived}
                    className={`col-span-2 h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${stockJustReceived ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 cursor-not-allowed" : "border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30"}`}>
                    <PackagePlus size={12}/>{stockJustReceived ? "✓ Stock Already Received" : "Receive to Stock"}
                  </button>
                )}
                {s === "Draft" && invoiceType !== "purchase" && (
                  <button onClick={() => onStatusChange(inv!.id, "Sent")}
                    className="h-9 rounded-lg border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-1.5 transition-colors">
                    <Send size={12}/> Send
                  </button>
                )}
                {(s === "Paid" || s === "Partial") && (
                  <button onClick={() => setRevertConfirmOpen(true)}
                    className="col-span-2 h-9 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1.5 transition-colors">
                    <RotateCcw size={12}/> Revert to Draft
                  </button>
                )}
              </div>
            </div>
          )}

        </div>{/* /max-w-7xl */}
      </div>{/* /body */}

      {/* ══ BOTTOM STICKY ACTION BAR ════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[54px] md:right-[54px] z-30 px-4 md:px-6 py-3 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between gap-3">

        {/* Left — danger zone */}
        {!isNew && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/50 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={14}/> Delete
          </button>
        )}
        {isNew && <div />}

        {/* Right — primary actions */}
        <div className="flex items-center gap-2">
          {/* Send — only when existing draft */}
          {!isNew && s === "Draft" && (
            <button
              onClick={() => onStatusChange(inv!.id, "Sent")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 text-sm font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <Send size={14}/> Send
            </button>
          )}

          {/* Print — only existing invoice */}
          {!isNew && (
            <button
              onClick={() => { try { printInvoice(invoice); } catch { /* blocked */ } }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <Printer size={14}/> Print
            </button>
          )}

          {/* Collect / Pay — navigate to receipt-payment page with invoice pre-filled */}
          {!isNew && s !== "Paid" && s !== "Cancelled" && (
            <button
              onClick={() => {
                const params = new URLSearchParams({
                  invoiceId:     invoice!.id,
                  invoiceNumber: invoice!.invoiceNumber,
                  customer:      form.customer,
                  amount:        balance.toFixed(dp),
                  type:          invoiceType === "purchase" ? "payment" : "receipt",
                });
                navigate(`/receipt-payment?${params.toString()}`);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <DollarSign size={14}/> {invoiceType === "purchase" ? "Pay Supplier" : "Collect Payment"}
            </button>
          )}

          {/* Save / Create — always visible */}
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-md transition-colors ${
              invoiceType === "purchase"
                ? "bg-purple-600 hover:bg-purple-700 shadow-purple-200 dark:shadow-none"
                : "bg-blue-600 hover:bg-blue-700 shadow-blue-200 dark:shadow-none"
            }`}
          >
            <Save size={14}/> {isNew ? "Create Invoice" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Collect Payment Modal ─────────────────────────────────────────── */}
      {!isNew && (
        <CollectPaymentModal
          open={collectPayOpen}
          onClose={() => setCollectPayOpen(false)}
          invoiceNumber={invoice.invoiceNumber}
          outstanding={balance}
          isPurchase={invoiceType === "purchase"}
          onConfirm={(record) => {
            const newHistory = [...savedHistory, record];
            const newPaid = newHistory.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const { total: invTotal } = computeTotals(invoice.items, form.taxRate, newPaid.toFixed(dp), form.shippingFee, form.handlingFee);
            const newStatus: InvoiceStatus = newPaid >= invTotal - 0.005 ? "Paid" : "Partial";
            setPayHist(newHistory);
            setPayInput(newPaid.toFixed(dp));
            onCollectPayment(invoice.id, record, newPaid.toFixed(dp), newStatus);
          }}
        />
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>"{invoice?.invoiceNumber}" will be permanently deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete(invoice!.id); onClose(); }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={revertConfirmOpen} onOpenChange={setRevertConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Draft?</AlertDialogTitle>
            <AlertDialogDescription>Invoice "{invoice?.invoiceNumber}" will be reverted to Draft. Any recorded payments will be cleared.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (invoice) onStatusChange(invoice.id, "Draft"); setRevertConfirmOpen(false); }}>
              Revert to Draft
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
  const search = useSearch();
  const [, navigate] = useLocation();
  const { invoices, addInvoice, editInvoice, removeInvoice } = useInvoices();
  const { toast } = useToast();

  const invoiceId = params.id;
  const isNewRoute = !invoiceId || invoiceId === "new";
  const invoice = isNewRoute ? null : invoices.find(i => i.id === invoiceId) ?? null;

  // Determine type: prefer stored invoice type, fall back to URL param, then "sale"
  const searchParams = new URLSearchParams(search);
  const defaultType: "sale" | "purchase" =
    (invoice?.invoiceType as "sale" | "purchase" | undefined) ??
    (searchParams.get("type") === "purchase" ? "purchase" : "sale");

  const handleSave = useCallback((data: Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">, id?: string) => {
    if (id) {
      editInvoice(id, { ...data });
      toast({ title: "Invoice updated" });
      const backUrl = data.invoiceType === "purchase" ? "/invoices?type=purchase" : "/invoices";
      navigate(backUrl);
    } else {
      const inv = addInvoice(data);
      toast({ title: "Invoice created", description: inv.invoiceNumber });
      const backUrl = inv.invoiceType === "purchase" ? "/invoices?type=purchase" : "/invoices";
      navigate(backUrl);
    }
  }, [editInvoice, addInvoice, toast, navigate]);

  const handleStatusChange = useCallback((id: string, status: InvoiceStatus, amountPaid?: string) => {
    // Read directly from localStorage for the freshest state — React state may be stale
    // if the user clicks multiple status buttons in rapid succession.
    const inv = getInvoices().find(i => i.id === id);
    if (!inv) return;
    const updates: Partial<Invoice> = { status };
    if (amountPaid !== undefined) updates.amountPaid = amountPaid;
    if (status === "Paid" || status === "Partial") {
      if (!inv.paidAt) updates.paidAt = new Date().toISOString();
    }
    if ((status === "Paid" || status === "Partial") && !inv.stockDeducted) {
      if (inv.invoiceType === "purchase") {
        receiveStockForPurchase(inv.items, inv.invoiceNumber, "Purchase");
        updates.stockReceived = true;   // keep in sync so the button shows ✓
      } else {
        deductStockForSale(inv.items, inv.invoiceNumber, "Invoiced");
      }
      updates.stockDeducted = true;
    }
    if ((status === "Draft" || status === "Cancelled") && inv.stockDeducted) {
      if (inv.invoiceType === "purchase") {
        reverseStockForPurchase(inv.items, inv.invoiceNumber);
        updates.stockReceived = false;  // reset so button is usable again if re-activated
      } else {
        restoreStockForSale(inv.items, inv.invoiceNumber);
      }
      updates.stockDeducted = false;
      updates.paidAt = "";
    }
    // Auto-post journal entry when invoice is first paid (only once)
    if ((status === "Paid" || status === "Partial") && !inv.jeId) {
      const { after: subtotal, tax: taxAmount, total: grandTotal } = computeTotals(
        inv.items, inv.taxRate, amountPaid ?? inv.amountPaid ?? "0",
        inv.shippingFee, inv.handlingFee,
      );
      const allProducts = getProducts();
      const costTotal = inv.items.reduce((sum: number, item: SaleItem) => {
        const prod = allProducts.find(p => p.sku === item.sku || p.name === item.productName);
        return sum + (parseFloat(prod?.costPrice ?? "0") || 0) * (parseFloat(item.qty) || 0);
      }, 0);
      const je = autoPostSaleJE({
        source:        "Invoice",
        reference:     inv.invoiceNumber,
        customer:      inv.customer || "Customer",
        date:          inv.invoiceDate || new Date().toISOString().slice(0, 10),
        paymentMethod: inv.paymentMethod,
        subtotal,
        taxAmount,
        grandTotal,
        costTotal:     parseFloat(costTotal.toFixed(2)),
      });
      if (je) updates.jeId = je.id;
    }
    editInvoice(id, updates);
    toast({ title: `Invoice marked ${status}` });
  }, [editInvoice, toast]);

  const handleCollectPayment = useCallback((
    id: string,
    record: PaymentRecord,
    newTotalPaid: string,
    newStatus: InvoiceStatus
  ) => {
    // Read from localStorage for freshest state — React state may lag behind
    const inv = getInvoices().find(i => i.id === id);
    if (!inv) return;

    const updatedHistory = [...(inv.paymentHistory ?? []), record];
    const updates: Partial<Invoice> = {
      paymentHistory: updatedHistory,
      amountPaid:     newTotalPaid,
      status:         newStatus,
      paidAt:         inv.paidAt || new Date().toISOString(),
    };

    // Update stock once — add for purchases, deduct for sales
    if (!inv.stockDeducted) {
      if (inv.invoiceType === "purchase") {
        receiveStockForPurchase(inv.items, inv.invoiceNumber, "Purchase");
        updates.stockReceived = true;   // keep in sync with the "Receive to Stock" button
      } else {
        deductStockForSale(inv.items, inv.invoiceNumber, "Invoiced");
      }
      updates.stockDeducted = true;
    }

    // Auto-post JE on first payment (once only)
    if (!inv.jeId) {
      const { after: saleSubtotal, tax: taxAmount, total: grandTotal } = computeTotals(
        inv.items, inv.taxRate, newTotalPaid, inv.shippingFee, inv.handlingFee,
      );
      const allProds = getProducts();
      const costTotal = inv.items.reduce((sum: number, item: SaleItem) => {
        const prod = allProds.find(p => p.sku === item.sku || p.name === item.productName);
        return sum + (parseFloat(prod?.costPrice ?? "0") || 0) * (parseFloat(item.qty) || 0);
      }, 0);
      const je = autoPostSaleJE({
        source:        "Invoice",
        reference:     inv.invoiceNumber,
        customer:      inv.customer || "Customer",
        date:          record.date || inv.invoiceDate || new Date().toISOString().slice(0, 10),
        paymentMethod: record.method as SalePayment,
        subtotal:      saleSubtotal,
        taxAmount,
        grandTotal,
        costTotal:     parseFloat(costTotal.toFixed(2)),
      });
      if (je) updates.jeId = je.id;
    } else {
      // Subsequent partial payment — create a supplementary cash receipt JE
      // Dr Cash/Bank, Cr Accounts Receivable for the incremental amount
      const amt = parseFloat(record.amount) || 0;
      if (amt > 0) {
        const cashAcc  = record.method === "Bank Transfer" ? "sys-1210" : "sys-1200";
        const cashName = record.method === "Bank Transfer" ? "Bank" : "Cash";
        try {
          createJournalEntry({
            date:        record.date || new Date().toISOString().slice(0, 10),
            reference:   inv.invoiceNumber,
            description: `Payment receipt — ${inv.customer || "Customer"} (${record.method})${record.note ? ` · ${record.note}` : ""}`,
            status:      "posted",
            totalDebit:  amt,
            totalCredit: amt,
            isBalanced:  true,
            lines: [
              { id: crypto.randomUUID(), ledgerId: cashAcc,    narration: `[${cashName}] Receipt from ${inv.customer || "Customer"}`, debit: amt,  credit: 0   },
              { id: crypto.randomUUID(), ledgerId: "sys-1101", narration: `Settlement of ${inv.invoiceNumber}`,                       debit: 0,    credit: amt },
            ],
          });
        } catch { /* JE posting is non-critical */ }
      }
    }

    editInvoice(id, updates);
    const sym = getSettingsCurrencySymbol();
    toast({ title: "Payment recorded", description: `${sym}${parseFloat(newTotalPaid).toFixed(2)} collected · ${newStatus}` });
  }, [editInvoice, toast]);

  const handleDelete = useCallback((id: string) => {
    const inv = getInvoices().find(i => i.id === id);
    if (inv?.stockDeducted) {
      if (inv.invoiceType === "purchase") {
        reverseStockForPurchase(inv.items, inv.invoiceNumber);
      } else {
        restoreStockForSale(inv.items, inv.invoiceNumber);
      }
    }
    removeInvoice(id);
    toast({ title: "Invoice deleted", variant: "destructive" });
    const backUrl = inv?.invoiceType === "purchase" ? "/invoices?type=purchase" : "/invoices";
    navigate(backUrl);
  }, [removeInvoice, toast, navigate]);

  const backUrl = defaultType === "purchase" ? "/invoices?type=purchase" : "/invoices";

  return (
    <InvoicePanel
      invoice={invoice}
      onClose={() => navigate(backUrl)}
      onSave={handleSave}
      onDelete={handleDelete}
      onStatusChange={handleStatusChange}
      onCollectPayment={handleCollectPayment}
      defaultType={defaultType}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const { invoices } = useInvoices();
  const [, navigate] = useLocation();
  const rawSearch    = useSearch();
  const dp           = getSettingsDecimalPlaces();

  // Derive type from ?type= URL param so sidebar links work correctly
  const typeFilter: "sale" | "purchase" =
    new URLSearchParams(rawSearch).get("type") === "purchase" ? "purchase" : "sale";

  const [statusFilter, setStatusFilter] = useState<"All" | InvoiceStatus>("All");
  const [search,       setSearch]       = useState(() => new URLSearchParams(rawSearch).get("q") || "");
  const [wrapText,     setWrapText]     = useState<boolean>(() => {
    try { return localStorage.getItem("invoices-wrap-text") === "true"; } catch { return false; }
  });
  const toggleWrap = () => setWrapText(v => {
    const next = !v;
    try { localStorage.setItem("invoices-wrap-text", String(next)); } catch {}
    return next;
  });

  // Invoice type colour palette
  const isPurchase = typeFilter === "purchase";
  const accentCls  = isPurchase
    ? "bg-purple-600 hover:bg-purple-700 shadow-purple-200 dark:shadow-none"
    : "bg-blue-600 hover:bg-blue-700 shadow-blue-200 dark:shadow-none";

  // Invoices of the current type
  const typedInvoices = useMemo(() =>
    invoices.filter(inv => (inv.invoiceType ?? "sale") === typeFilter),
  [invoices, typeFilter]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return typedInvoices.filter(inv => {
      const matchStatus = statusFilter === "All" || inv.status === statusFilter;
      const matchSearch = !q || [
        inv.invoiceNumber, inv.customer, inv.status, inv.invoiceTitle,
        inv.paymentMethod, inv.paymentTerms, inv.notes ?? "",
      ].some(v => v?.toLowerCase().includes(q));
      return matchStatus && matchSearch;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [typedInvoices, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: typedInvoices.length };
    INVOICE_STATUSES.forEach(s => { c[s] = typedInvoices.filter(i => i.status === s).length; });
    return c;
  }, [typedInvoices]);

  const TAB_DEFS: Array<{ label: string; value: "All" | InvoiceStatus }> = [
    { label: "All",       value: "All"       },
    { label: "Draft",     value: "Draft"     },
    { label: "Sent",      value: "Sent"      },
    { label: "Paid",      value: "Paid"      },
    { label: "Partial",   value: "Partial"   },
    { label: "Overdue",   value: "Overdue"   },
    { label: "Cancelled", value: "Cancelled" },
  ];

  const saleCount     = useMemo(() => invoices.filter(i => (i.invoiceType ?? "sale") === "sale").length,     [invoices]);
  const purchaseCount = useMemo(() => invoices.filter(i => (i.invoiceType ?? "sale") === "purchase").length, [invoices]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">

      {/* ── Page Header ── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4">

        {/* ── Type Tabs (top level) ── */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { navigate("/invoices?type=sale"); setStatusFilter("All"); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors border-2 ${
              typeFilter === "sale"
                ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none"
                : "border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
            }`}
          >
            <FileText size={15} />
            Sale Invoices
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
              typeFilter === "sale" ? "bg-white/25 text-white" : "bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-400"
            }`}>{saleCount}</span>
          </button>
          <button
            onClick={() => { navigate("/invoices?type=purchase"); setStatusFilter("All"); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors border-2 ${
              typeFilter === "purchase"
                ? "border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-200 dark:shadow-none"
                : "border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
            }`}
          >
            <FileText size={15} />
            Purchase Invoices
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
              typeFilter === "purchase" ? "bg-white/25 text-white" : "bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-400"
            }`}>{purchaseCount}</span>
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md ${isPurchase ? "bg-purple-600 shadow-purple-200 dark:shadow-none" : "bg-blue-600 shadow-blue-200 dark:shadow-none"}`}>
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">
                {isPurchase ? "Purchase Invoices" : "Sale Invoices"}
              </h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{typedInvoices.length} invoice{typedInvoices.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                downloadExcel(
                  isPurchase ? "Purchase_Invoices" : "Sale_Invoices",
                  isPurchase ? "Purchase Invoices" : "Sale Invoices",
                  filtered,
                  [
                    { header: "#",              key: "id",            getValue: r => filtered.indexOf(r) + 1, width: 5 },
                    { header: "Invoice #",      key: "invoiceNumber", width: 18 },
                    { header: "Title",          key: "invoiceTitle",  width: 18 },
                    { header: "Date",           key: "invoiceDate",   width: 14 },
                    { header: "Due Date",       key: "dueDate",       width: 14 },
                    { header: isPurchase ? "Supplier" : "Customer", key: "customer", width: 24 },
                    { header: "Status",         key: "status",        width: 14 },
                    { header: "Payment",        key: "paymentMethod", width: 16 },
                    { header: "Total (£)",      key: "id",            getValue: r => computeTotals(r.items, r.taxRate, r.amountPaid, r.shippingFee, r.handlingFee).total.toFixed(dp), width: 14 },
                    { header: "Paid (£)",       key: "amountPaid",    width: 12 },
                    { header: "Balance (£)",    key: "id",            getValue: r => computeTotals(r.items, r.taxRate, r.amountPaid, r.shippingFee, r.handlingFee).balance.toFixed(dp), width: 14 },
                  ]
                );
              }}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-semibold border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <FileDown size={14} /> Export Excel
            </button>
            <button
              onClick={() => navigate(isPurchase ? "/invoices/new?type=purchase" : "/invoices/new")}
              className={`flex items-center gap-2 h-9 px-4 rounded-xl text-white text-[13px] font-bold shadow-md transition-colors ${accentCls}`}
            >
              <Plus size={15} /> {isPurchase ? "New Purchase Invoice" : "New Sale Invoice"}
            </button>
          </div>
        </div>

        {/* ── Status Filter Tabs ── */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto">
          {TAB_DEFS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                statusFilter === tab.value
                  ? isPurchase ? "bg-purple-600 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm"
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
      <div className="px-6 py-3 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isPurchase ? "Search by invoice #, supplier, notes…" : "Search by invoice #, customer, notes…"}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>}
        </div>
        {/* Wrap text toggle */}
        <button
          onClick={toggleWrap}
          title={wrapText ? "Disable text wrap" : "Enable text wrap"}
          className={`shrink-0 h-9 px-2.5 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition-all ${
            wrapText
              ? "border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
              : "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:border-gray-300"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 0 1 0 6H3"/>
            <polyline points="9 15 6 18 9 21"/><line x1="3" y1="18" x2="6" y2="18"/>
          </svg>
          Wrap
        </button>
      </div>

      {/* ── Invoice List ── */}
      <div className="px-6 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-gray-400" />
            </div>
            <p className="text-[15px] font-semibold text-gray-500 dark:text-gray-400">
              {typedInvoices.length === 0
                ? `No ${isPurchase ? "purchase" : "sale"} invoices yet`
                : "No invoices match your filters"}
            </p>
            {typedInvoices.length === 0 && (
              <button
                onClick={() => navigate(isPurchase ? "/invoices/new?type=purchase" : "/invoices/new")}
                className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-xl text-white text-[13px] font-bold mx-auto transition-colors ${accentCls}`}
              >
                <Plus size={14} /> {isPurchase ? "Create First Purchase Invoice" : "Create First Sale Invoice"}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            {/* Table Header */}
            <div className={`grid ${isPurchase ? "grid-cols-[1.2fr_1.4fr_0.9fr_0.9fr_0.6fr_1fr_0.8fr_1fr_0.9fr_1fr_auto]" : "grid-cols-[1.4fr_1.6fr_1fr_1fr_0.8fr_1fr_1fr_1.2fr_auto]"} gap-0 px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider`}>
              <div>Invoice #</div>
              <div>{isPurchase ? "Supplier" : "Customer"}</div>
              <div>Date</div>
              <div>Due Date</div>
              <div className="text-right">Items</div>
              <div className="text-right">Total</div>
              <div className="text-right">Paid</div>
              <div>Status</div>
              {isPurchase && <div>Stock Status</div>}
              {isPurchase && <div>Purchase Status</div>}
              <div />
            </div>

            {/* Rows */}
            {filtered.map(inv => {
              const { total, paid } = computeTotals(inv.items, inv.taxRate, inv.amountPaid);
              const overdue = isOverdue(inv);
              const inStock = !!(inv.stockReceived || inv.stockDeducted);
              return (
                <div
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}${inv.invoiceType === "purchase" ? "?type=purchase" : ""}`)}
                  className={`grid ${isPurchase ? "grid-cols-[1.2fr_1.4fr_0.9fr_0.9fr_0.6fr_1fr_0.8fr_1fr_0.9fr_1fr_auto]" : "grid-cols-[1.4fr_1.6fr_1fr_1fr_0.8fr_1fr_1fr_1.2fr_auto]"} gap-0 px-4 py-3 border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group ${wrapText ? "items-start" : "items-center"}`}
                >
                  {/* Invoice # */}
                  <div className={`font-mono text-[12px] font-bold text-gray-900 dark:text-gray-100 pr-2 ${wrapText ? "break-words" : "truncate"}`}>
                    {inv.invoiceNumber}
                  </div>

                  {/* Customer / Supplier */}
                  <div className={`text-[12px] text-gray-700 dark:text-gray-300 pr-2 ${wrapText ? "break-words" : "truncate"}`}>
                    {inv.customer || <span className="text-gray-400 italic">{isPurchase ? "—" : "Walk-in"}</span>}
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

                  {/* Payment Status */}
                  <div>
                    <StatusBadge status={inv.status} />
                  </div>

                  {/* Stock Status — purchase only */}
                  {isPurchase && (
                    <div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        inStock
                          ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-emerald-500" : "bg-gray-400"}`}/>
                        {inStock ? "Received" : "Pending"}
                      </span>
                    </div>
                  )}

                  {/* Purchase Status — purchase only */}
                  {isPurchase && (
                    <div>
                      {inv.saleStatus ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                          {inv.saleStatus}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-[11px]">—</span>
                      )}
                    </div>
                  )}

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
