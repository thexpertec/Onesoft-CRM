import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useInvoices } from "@/hooks/use-data";
import {
  Invoice, InvoiceStatus, INVOICE_STATUSES,
  SaleItem, SalePayment, SALE_PAYMENTS,
  PaymentRecord, LegalDocument, InvoiceDoc,
  getProducts, getCustomers, getSuppliers, getSettings, getSalesAgents,
  deductStockForSale, restoreStockForSale, autoPostSaleJE,
  createJournalEntry, getJournalEntries,
} from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { Combobox, ComboOption } from "@/components/combobox";
import RichTextEditor from "@/components/RichTextEditor";
import { printFullInvoice } from "@/lib/print-invoice-full";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, Search, X, Trash2, Printer, Send,
  CheckCircle, AlertTriangle, Ban, RotateCcw,
  Save, CreditCard, ArrowLeft, Eye,
  ChevronDown, ChevronUp, PlusCircle, FileDown,
  DollarSign, Receipt, BookOpen, ChevronRight,
} from "lucide-react";
import { downloadExcel } from "@/lib/export-excel";
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
}
function CollectPaymentModal({ open, onClose, invoiceNumber, outstanding, onConfirm }: CollectPaymentModalProps) {
  const sym = getSettingsCurrencySymbol();
  const [amount, setAmount]   = useState(outstanding > 0 ? outstanding.toFixed(2) : "");
  const [method, setMethod]   = useState<SalePayment>("Bank Transfer");
  const [date,   setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [note,   setNote]     = useState("");

  useEffect(() => {
    if (open) {
      setAmount(outstanding > 0 ? outstanding.toFixed(2) : "");
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
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Collect Payment</p>
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
              <span className="text-base font-bold font-mono text-amber-700 dark:text-amber-400">{sym}{outstanding.toFixed(2)}</span>
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

  const [form, setForm]         = useState<ReturnType<typeof blankInvoice>>(
    () => invoice ? { ...invoice } : blankInvoice(defaultType)
  );
  const [items, setItems]       = useState<SaleItem[]>(() => invoice?.items ?? [blankItem()]);
  const [payHistory, setPayHist]= useState<PaymentRecord[]>(() => invoice?.paymentHistory ?? []);
  const [deleteOpen, setDeleteOpen]         = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [payInput, setPayInput]       = useState(invoice?.amountPaid ?? "");
  const [collectPayOpen, setCollectPayOpen] = useState(false);
  const [docsOpen, setDocsOpen]            = useState(false);
  const [moreOpen, setMoreOpen]            = useState(false);

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
    setForm(invoice ? { ...invoice } : blankInvoice());
    setItems(invoice?.items ?? [blankItem()]);
    setPayHist(invoice?.paymentHistory ?? []);
    setPayInput(invoice?.amountPaid ?? "");
    setDocs(initDocs(invoice));
  }, [invoice?.id]);

  const products    = useMemo(() => getProducts(), []);
  const customers   = useMemo(() => getCustomers(), []);
  const suppliers   = useMemo(() => getSuppliers(), []);
  const settings    = useMemo(() => getSettings(), []);
  const legalDocs   = useMemo(() => settings.legalDocuments ?? [], [settings]);
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
  const supplierOpts = useMemo<ComboOption[]>(() =>
    suppliers.map(s => ({
      value: s.company,
      label: s.company,
      sub:   [s.contactPerson, s.email, s.phone].filter(Boolean).join(" · "),
    })),
  [suppliers]);

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

  const handleSupplierSelect = useCallback((name: string) => {
    const s = suppliers.find(x => x.company === name);
    setForm(f => ({
      ...f,
      customer:    name,
      customerId:  s ? s.id.slice(-8).toUpperCase() : f.customerId,
      buyerPhone:  s?.phone  || f.buyerPhone,
      buyerEmail:  s?.email  || f.buyerEmail,
      buyerAddress: s ? [s.contactPerson, s.city, s.country].filter(Boolean).join(", ") : f.buyerAddress,
    }));
  }, [suppliers]);

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


  const addItem    = () => setItems(p => [...p, blankItem()]);
  const removeItem = (id: string) => setItems(p => p.filter(i => i.id !== id));

  const handleSave = () => {
    onSave({
      ...form,
      items,
      paymentHistory: payHistory,
      amountPaid:     payInput,
      invoiceDocs:    docs.map(({ id, title, content }) => ({ id, title, content })),
      // Clear legacy fields — data now lives in invoiceDocs
      paymentTerms:   "",
      notes:          "",
      agreement:      "",
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
      <div className="flex-1 px-4 md:px-6 py-5 pb-24 md:pb-24">
        <div className="max-w-7xl mx-auto space-y-5">

          {/* Two-column grid */}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-5 items-start">

            {/* ── Left Column ───────────────────────────────────────────────── */}
            <div className="space-y-4">

              {/* Invoice Details Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-100 dark:border-zinc-800">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${invoiceType === "purchase" ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"}`}>
                    {invoiceType === "purchase" ? "Purchase Invoice" : "Sale Invoice"}
                  </span>
                  {!isNew && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      Created {new Date(invoice.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Customer / Supplier */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      {invoiceType === "purchase" ? "Supplier" : "Customer"}
                    </label>
                    {invoiceType === "purchase" ? (
                      <Combobox
                        value={form.customer} onChange={v => setF("customer", v)}
                        onSelect={opt => handleSupplierSelect(opt.value)}
                        options={supplierOpts} placeholder="Search supplier…"
                        inputClassName="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    ) : (
                      <Combobox
                        value={form.customer} onChange={v => setF("customer", v)}
                        onSelect={opt => handleCustomerSelect(opt.value)}
                        options={customerOpts} placeholder="Search customer…"
                        inputClassName="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    )}
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Invoice Date</label>
                      <input type="date" value={form.invoiceDate} onChange={e => setF("invoiceDate", e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Due Date</label>
                      <input type="date" value={form.dueDate} onChange={e => setF("dueDate", e.target.value)}
                        className={`w-full px-3 py-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isOverdue(form as unknown as Invoice) ? "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400" : "border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-gray-100"}`}/>
                    </div>
                  </div>

                  {/* Payment Method + Tax */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Payment Method</label>
                      <select value={form.paymentMethod} onChange={e => setF("paymentMethod", e.target.value as SalePayment)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                        {SALE_PAYMENTS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Tax / VAT %</label>
                      <input type="number" min="0" max="100" value={form.taxRate} onChange={e => setF("taxRate", e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                  </div>

                  {/* More Details accordion */}
                  <button
                    onClick={() => setMoreOpen(o => !o)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <ChevronRight size={13} className={`transition-transform ${moreOpen ? "rotate-90" : ""}`}/>
                    {moreOpen ? "Hide" : "Show"} additional details
                  </button>

                  {moreOpen && (
                    <div className="space-y-3 pt-1 border-t border-gray-100 dark:border-zinc-800">
                      {/* Invoice Title */}
                      <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Invoice Title</label>
                        <input value={form.invoiceTitle} onChange={e => setF("invoiceTitle", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                      </div>

                      {/* Customer ID + Phone + Email */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Customer ID / Ref</label>
                          <input value={form.customerId} onChange={e => setF("customerId", e.target.value)} placeholder="ID"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Phone</label>
                          <input value={form.buyerPhone} onChange={e => setF("buyerPhone", e.target.value)} placeholder="+44…"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Email</label>
                        <input value={form.buyerEmail} onChange={e => setF("buyerEmail", e.target.value)} placeholder="customer@example.com"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Billing Address</label>
                        <textarea rows={2} value={form.buyerAddress} onChange={e => setF("buyerAddress", e.target.value)} placeholder="Address…"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"/>
                      </div>

                      {/* Sales Agent */}
                      {invoiceType !== "purchase" && (() => {
                        const agents = getSalesAgents().filter(a => a.status === "Active");
                        if (agents.length === 0) return null;
                        return (
                          <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Sales Agent</label>
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

                      {/* Shipping + Handling */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Shipping Fee</label>
                          <input type="number" min="0" step="0.01" value={form.shippingFee} onChange={e => setF("shippingFee", e.target.value)} placeholder="0.00"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Handling Fee</label>
                          <input type="number" min="0" step="0.01" value={form.handlingFee} onChange={e => setF("handlingFee", e.target.value)} placeholder="0.00"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                        </div>
                      </div>

                      {/* Bank Details + Footer */}
                      <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Bank Details</label>
                        <textarea rows={2} value={form.bankDetails} onChange={e => setF("bankDetails", e.target.value)} placeholder="Bank name, sort code, account number…"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"/>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Footer Note</label>
                        <input value={form.invoiceFooter} onChange={e => setF("invoiceFooter", e.target.value)} placeholder="Thank you for your business!"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Payments Card (existing invoices only) ─────────────────── */}
              {!isNew && (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt size={15} className="text-emerald-600 dark:text-emerald-400"/>
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Payments</span>
                    </div>
                    {jeId && (
                      <a href="#" onClick={e => e.preventDefault()}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-[11px] font-bold text-violet-700 dark:text-violet-400"
                        title={`Journal Entry: ${jeId}`}
                      >
                        <BookOpen size={11}/> JE Posted
                      </a>
                    )}
                  </div>

                  {/* Balance summary */}
                  <div className="px-5 py-4">
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 text-center">
                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Invoice Total</p>
                        <p className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100">{sym}{total.toFixed(2)}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-center">
                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider mb-1">Collected</p>
                        <p className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">{sym}{paid.toFixed(2)}</p>
                      </div>
                      <div className={`p-3 rounded-xl text-center ${balance > 0.005 ? "bg-red-50 dark:bg-red-950/20" : "bg-emerald-50 dark:bg-emerald-950/20"}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${balance > 0.005 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-500"}`}>
                          {balance > 0.005 ? "Outstanding" : "✓ Settled"}
                        </p>
                        <p className={`text-sm font-bold font-mono ${balance > 0.005 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {sym}{balance.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Payment history */}
                    {savedHistory.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Payment History</p>
                        {savedHistory.map((rec, i) => (
                          <div key={rec.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-700">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                              <div>
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{rec.method}</p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {fmtDate(rec.date)}{rec.note ? ` · ${rec.note}` : ""}
                                </p>
                              </div>
                            </div>
                            <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">{sym}{parseFloat(rec.amount || "0").toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">No payments recorded yet.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Status Actions Card ────────────────────────────────────── */}
              {!isNew && (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-4 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status Actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {s === "Draft" && (
                      <button onClick={() => onStatusChange(inv!.id, "Sent")}
                        className="h-9 rounded-lg border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-1.5 transition-colors">
                        <Send size={12}/> Send
                      </button>
                    )}
                    {(s === "Sent" || s === "Draft" || s === "Overdue" || s === "Partial") && (
                      <button onClick={() => onStatusChange(inv!.id, "Paid", payInput)}
                        className="h-9 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-center gap-1.5 transition-colors">
                        <CheckCircle size={12}/> Mark Paid
                      </button>
                    )}
                    {(s === "Sent" || s === "Draft") && (
                      <button onClick={() => onStatusChange(inv!.id, "Overdue")}
                        className="h-9 rounded-lg border border-red-200 dark:border-red-800 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center gap-1.5 transition-colors">
                        <AlertTriangle size={12}/> Mark Overdue
                      </button>
                    )}
                    {(s === "Paid" || s === "Partial") && (
                      <button onClick={() => setRevertConfirmOpen(true)}
                        className="h-9 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1.5 transition-colors">
                        <RotateCcw size={12}/> Revert to Draft
                      </button>
                    )}
                    {s !== "Cancelled" && (
                      <button onClick={() => setCancelConfirmOpen(true)}
                        className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1.5 transition-colors">
                        <Ban size={12}/> Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right Column — Line Items + Totals ────────────────────────── */}
            <div className="space-y-4">

              {/* Line Items Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/60">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Line Items</span>
                  <button onClick={addItem}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 px-2.5 py-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                    <Plus size={13}/> Add Item
                  </button>
                </div>

                <div className="px-4 py-3 space-y-2">
                  {items.map((item, idx) => (
                    <div key={item.id} className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-700">
                      {/* Row 1: product name + delete */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{idx + 1}.</span>
                        <div className="flex-1">
                          <Combobox
                            value={item.productName}
                            onChange={v => pickProduct(item.id, v)}
                            onSelect={opt => pickProduct(item.id, opt.value)}
                            options={productOpts}
                            placeholder="Product / service…"
                            inputClassName="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <button onClick={() => removeItem(item.id)} className="shrink-0 p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
                          <X size={14}/>
                        </button>
                      </div>

                      {/* Row 2: qty / unit / price / discount */}
                      <div className="grid grid-cols-4 gap-2 pl-7">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Qty</label>
                          <input type="number" min="0" value={item.qty} onChange={e => updateItem(item.id, "qty", e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unit</label>
                          <input value={item.unit} onChange={e => updateItem(item.id, "unit", e.target.value)} placeholder="pcs"
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Price</label>
                          <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(item.id, "unitPrice", e.target.value)} placeholder="0.00"
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Disc %</label>
                          <input type="number" min="0" max="100" value={item.discount} onChange={e => updateItem(item.id, "discount", e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                        </div>
                      </div>

                      {/* Line total */}
                      <div className="pl-7 mt-1.5 flex justify-between items-center">
                        {item.sku && <span className="text-[10px] text-gray-400">SKU: {item.sku}</span>}
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 ml-auto font-mono">
                          = {sym}{lineTotal(item).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {items.length === 0 && (
                    <button onClick={addItem}
                      className="w-full py-6 rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-700 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-2">
                      <Plus size={15}/> Add first item
                    </button>
                  )}
                </div>
              </div>

              {/* Totals Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 px-5 py-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span><span className="font-mono">{sym}{subtotal.toFixed(2)}</span>
                  </div>
                  {discountAmt > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                      <span>Discount</span><span className="font-mono">−{sym}{discountAmt.toFixed(2)}</span>
                    </div>
                  )}
                  {parseFloat(form.taxRate) > 0 && (
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                      <span>Tax / VAT ({form.taxRate}%)</span><span className="font-mono">{sym}{tax.toFixed(2)}</span>
                    </div>
                  )}
                  {shipping > 0 && (
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                      <span>Shipping{form.shippingMethod ? ` (${form.shippingMethod})` : ""}</span>
                      <span className="font-mono">{sym}{shipping.toFixed(2)}</span>
                    </div>
                  )}
                  {handling > 0 && (
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                      <span>Handling</span><span className="font-mono">{sym}{handling.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-zinc-700">
                    <span>Total</span><span className="font-mono">{sym}{total.toFixed(2)}</span>
                  </div>
                  {balance > 0.005 && (
                    <div className="flex justify-between text-sm font-bold text-red-600 dark:text-red-400">
                      <span>Balance Due</span><span className="font-mono">{sym}{balance.toFixed(2)}</span>
                    </div>
                  )}
                  {paid > 0 && balance <= 0.005 && (
                    <div className="flex justify-between text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      <span>✓ Fully Paid</span><span className="font-mono">{sym}{total.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

            </div>{/* /right column */}
          </div>{/* /two-column grid */}

          {/* ── Documents Section (collapsible) ─────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <button
              onClick={() => setDocsOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronRight size={14} className={`text-gray-400 transition-transform ${docsOpen ? "rotate-90" : ""}`}/>
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Documents</span>
                {docs.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500">{docs.length}</span>
                )}
              </div>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">Payment terms, agreements, notes</span>
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
                        <input
                          value={doc.title}
                          onChange={e => setDocs(prev => prev.map((d, i) => i === idx ? { ...d, title: e.target.value, kind: titleToKind(e.target.value) } : d))}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200 bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-blue-400 transition-colors pb-0.5"
                          placeholder="Document Title"
                        />
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
                            ))}
                          />
                          <RichTextEditor value={doc.content}
                            onChange={html => setDocs(prev => prev.map((d, i) => i === idx ? { ...d, content: html } : d))}
                            placeholder="Start typing or insert a template above…" minHeight="100px"/>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add Document */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {PREDEFINED_DOC_TYPES.map(pt => (
                    <button key={pt.kind}
                      onClick={() => setDocs(prev => [...prev, { id: crypto.randomUUID(), kind: pt.kind, title: pt.title, content: "", open: true }])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-zinc-600 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                      <PlusCircle size={12}/> {pt.title}
                    </button>
                  ))}
                  <button
                    onClick={() => setDocs(prev => [...prev, { id: crypto.randomUUID(), kind: "notes", title: "Custom Document", content: "", open: true }])}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-zinc-600 text-xs text-gray-500 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                    <PlusCircle size={12}/> Custom Document
                  </button>
                </div>
              </div>
            )}
          </div>

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

          {/* Collect Payment — existing, not fully paid/cancelled */}
          {!isNew && s !== "Paid" && s !== "Cancelled" && (
            <button
              onClick={() => setCollectPayOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <DollarSign size={14}/> Collect Payment
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
          onConfirm={(record) => {
            const newHistory = [...savedHistory, record];
            const newPaid = newHistory.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const { total: invTotal } = computeTotals(invoice.items, form.taxRate, newPaid.toFixed(2), form.shippingFee, form.handlingFee);
            const newStatus: InvoiceStatus = newPaid >= invTotal - 0.005 ? "Paid" : "Partial";
            setPayHist(newHistory);
            setPayInput(newPaid.toFixed(2));
            onCollectPayment(invoice.id, record, newPaid.toFixed(2), newStatus);
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

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this invoice?</AlertDialogTitle>
            <AlertDialogDescription>Invoice "{invoice?.invoiceNumber}" will be marked as Cancelled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (invoice) onStatusChange(invoice.id, "Cancelled"); setCancelConfirmOpen(false); }}>
              Cancel Invoice
            </AlertDialogAction>
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

  // Read ?type=purchase from URL for new invoices
  const searchParams = new URLSearchParams(search);
  const defaultType: "sale" | "purchase" =
    searchParams.get("type") === "purchase" ? "purchase" : "sale";

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
      deductStockForSale(inv.items, inv.invoiceNumber);
      updates.stockDeducted = true;
    }
    if ((status === "Draft" || status === "Cancelled") && inv.stockDeducted) {
      restoreStockForSale(inv.items, inv.invoiceNumber);
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
      const costTotal = inv.items.reduce((sum, item) => {
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
  }, [invoices, editInvoice, toast]);

  const handleCollectPayment = useCallback((
    id: string,
    record: PaymentRecord,
    newTotalPaid: string,
    newStatus: InvoiceStatus
  ) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;

    const updatedHistory = [...(inv.paymentHistory ?? []), record];
    const updates: Partial<Invoice> = {
      paymentHistory: updatedHistory,
      amountPaid:     newTotalPaid,
      status:         newStatus,
      paidAt:         inv.paidAt || new Date().toISOString(),
    };

    // Deduct stock once
    if (!inv.stockDeducted) {
      deductStockForSale(inv.items, inv.invoiceNumber);
      updates.stockDeducted = true;
    }

    // Auto-post JE on first payment (once only)
    if (!inv.jeId) {
      const { after: saleSubtotal, tax: taxAmount, total: grandTotal } = computeTotals(
        inv.items, inv.taxRate, newTotalPaid, inv.shippingFee, inv.handlingFee,
      );
      const allProds = getProducts();
      const costTotal = inv.items.reduce((sum, item) => {
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
            status:      "Posted",
            lines: [
              { id: crypto.randomUUID(), ledgerId: cashAcc,    ledgerName: cashName,            dr: amt,  cr: 0,   description: `Receipt from ${inv.customer || "Customer"}` },
              { id: crypto.randomUUID(), ledgerId: "sys-1101", ledgerName: "Accounts Receivable", dr: 0,   cr: amt, description: `Settlement of ${inv.invoiceNumber}` },
            ],
          });
        } catch { /* JE posting is non-critical */ }
      }
    }

    editInvoice(id, updates);
    const sym = getSettingsCurrencySymbol();
    toast({ title: "Payment recorded", description: `${sym}${parseFloat(newTotalPaid).toFixed(2)} collected · ${newStatus}` });
  }, [invoices, editInvoice, toast]);

  const handleDelete = useCallback((id: string) => {
    const inv = invoices.find(i => i.id === id);
    if (inv?.stockDeducted) restoreStockForSale(inv.items, inv.invoiceNumber);
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

  // Derive type from ?type= URL param so sidebar links work correctly
  const typeFilter: "sale" | "purchase" =
    new URLSearchParams(rawSearch).get("type") === "purchase" ? "purchase" : "sale";

  const [statusFilter, setStatusFilter] = useState<"All" | InvoiceStatus>("All");
  const [search,       setSearch]       = useState("");

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
                    { header: "Total (£)",      key: "id",            getValue: r => computeTotals(r.items, r.taxRate, r.amountPaid, r.shippingFee, r.handlingFee).total.toFixed(2), width: 14 },
                    { header: "Paid (£)",       key: "amountPaid",    width: 12 },
                    { header: "Balance (£)",    key: "id",            getValue: r => computeTotals(r.items, r.taxRate, r.amountPaid, r.shippingFee, r.handlingFee).balance.toFixed(2), width: 14 },
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
      <div className="px-6 py-3 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isPurchase ? "Search by invoice #, supplier, notes…" : "Search by invoice #, customer, notes…"}
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
            <div className="grid grid-cols-[1.4fr_1.6fr_1fr_1fr_0.8fr_1fr_1fr_1.2fr_auto] gap-0 px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              <div>Invoice #</div>
              <div>{isPurchase ? "Supplier" : "Customer"}</div>
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

                  {/* Customer / Supplier */}
                  <div className="text-[12px] text-gray-700 dark:text-gray-300 truncate pr-2">
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
