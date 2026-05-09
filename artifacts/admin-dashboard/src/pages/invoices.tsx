import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useInvoices } from "@/hooks/use-data";
import {
  Invoice, InvoiceStatus, INVOICE_STATUSES,
  SaleItem, SalePayment, SALE_PAYMENTS,
  PaymentRecord, LegalDocument, InvoiceDoc,
  BankAccount, ProductVariant, Product,
  getProducts, getCustomers, getSettings, getSalesAgents, getBankAccounts, getInvoices,
  deductStockForSale, restoreStockForSale, autoPostSaleJE, autoPostCashReceiptJE,
  receiveStockForPurchase, reverseStockForPurchase,
  autoPostPurchaseJE,
  createJournalEntry, updateInvoice, updateProduct, getInvoiceProductName,
  findProductForItem, effectiveItemCost,
  getRawMaterials,
  createInvoicePriceAdjustmentJE,
  revertInvoiceToDraft,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { Combobox, ComboOption } from "@/components/combobox";
import RichTextEditor from "@/components/RichTextEditor";
import { printFullInvoice } from "@/lib/print-invoice-full";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, Search, X, Trash2, Printer, Send, Link2,
  CheckCircle, RotateCcw,
  Save, CreditCard, ArrowLeft, Eye,
  ChevronDown, ChevronUp, PlusCircle, FileDown,
  DollarSign, Receipt, BookOpen, ChevronRight, PackagePlus,
  Calculator, Upload, RefreshCw, Tag, Lock,
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
  itemStatus: "Pending",
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
    saleStatus:     type === "purchase" ? "Received" : "",
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

// ─── Copy Link Button ─────────────────────────────────────────────────────────
function CopyLinkButton({ invoiceId }: { invoiceId: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const url = `${window.location.origin}${window.location.pathname.split("/invoices")[0]}/invoice-view/${invoiceId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy shareable public link"
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-200 dark:border-violet-800 text-sm font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
    >
      {copied ? <CheckCircle size={14} className="text-emerald-500"/> : <Link2 size={14}/>}
      {copied ? "Copied!" : "Share Link"}
    </button>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status as InvoiceStatus] ?? {
    bg:  "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
    dot: "bg-gray-400",
    label: status || "Unknown",
  };
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

  // ── Cost rate calculator (purchase invoices only) ───────────────────────
  const [costCalcOpen, setCostCalcOpen] = useState(false);
  // per-item overrides: { suggestedCost, salePrice }
  const [costOverrides, setCostOverrides] = useState<Record<string, { suggestedCost: string; retailPrice: string; wholesalePrice: string }>>({});

  // Variant price is read directly from the catalogue — no local overrides in the invoice table

  // ── Pricing mode (sale invoices only) — default wholesale ──────────────
  const [pricingMode, setPricingMode] = useState<"wholesale" | "retail">(
    () => {
      const stored = invoice?.pricingMode as "wholesale" | "retail" | undefined;
      return stored ?? "wholesale";
    }
  );

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
    setPricingMode(invoice?.pricingMode ?? "wholesale");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, defaultType]);

  const { toast } = useToast();
  const products    = useMemo(() => getProducts(), []);
  const rawMaterials = useMemo(() => getRawMaterials(), []);
  const customers   = useMemo(() => getCustomers(), []);
  const settings    = useMemo(() => getSettings(), []);
  const legalDocs   = useMemo(() => settings.legalDocuments ?? [], [settings]);
  const productOpts = useMemo<ComboOption[]>(() => {
    // In purchase mode: filter to supplier's linked products if the supplier has any configured
    let availableProducts = products;
    let supplierHasLinkedProducts = false;

    if (invoiceType === "purchase" && form.customer) {
      const supplier = customers.find(c => c.name === form.customer && c.customerRole === "Supplier");
      if (supplier?.supplierProducts?.length) {
        const allowed = new Set(supplier.supplierProducts);
        availableProducts = products.filter(p => allowed.has(p.id));
        supplierHasLinkedProducts = true;
      }
    }

    const prodOpts = availableProducts.map(p => ({
      value: p.name,
      label: p.name,
      sub:   [p.sku, p.brand].filter(Boolean).join(" · "),
      tag:   p.category || undefined,
    }));

    // Only show raw materials when no supplier product restriction is active
    if (invoiceType !== "purchase" || supplierHasLinkedProducts) return prodOpts;

    const rmOpts = rawMaterials.map(r => ({
      value: `__rm__${r.id}`,
      label: r.name,
      sub:   r.rmCode,
      tag:   "Raw Material",
    }));
    return [...prodOpts, ...rmOpts];
  }, [products, rawMaterials, invoiceType, form.customer, customers]);

  // Resolve variants for a line item — SKU is the canonical identifier
  const variantsForItem = useCallback((item: SaleItem): ProductVariant[] => {
    if (item.sku) {
      // Check if item.sku matches a direct product SKU
      const byProductSku = products.find(p => p.sku === item.sku);
      if (byProductSku?.variants?.length) return byProductSku.variants;
      // Check if item.sku matches a variant's SKU — return parent's variants
      const byVariantSku = products.find(p => p.variants?.some(v => v.sku === item.sku));
      if (byVariantSku?.variants?.length) return byVariantSku.variants;
    }
    // Fallback: name match (for legacy records with no SKU)
    const p = products.find(pr => pr.name === item.productName || getInvoiceProductName(pr) === item.productName);
    return p?.variants ?? [];
  }, [products]);
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

  const effectiveTaxRate = invoiceType === "purchase" ? "0" : form.taxRate;
  const { subtotal, discountAmt, tax, shipping, handling, total, paid, balance } =
    computeTotals(items, effectiveTaxRate, payInput || "0", form.shippingFee, form.handlingFee);

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

  // Returns the right price for a product based on invoiceType + pricingMode
  const getAutoPrice = useCallback((p: ReturnType<typeof getProducts>[number]) => {
    if (invoiceType === "purchase") {
      return p.purchasePrice && p.purchasePrice !== "" ? p.purchasePrice : p.price;
    }
    if (pricingMode === "retail") return p.price;
    // wholesale — fall back to retail if no wholesale price set
    return p.wholesalePrice && p.wholesalePrice !== "" ? p.wholesalePrice : p.price;
  }, [invoiceType, pricingMode]);

  const pickProduct = (id: string, name: string) => {
    // Raw-material option — value is prefixed with "__rm__<rmId>"
    if (name.startsWith("__rm__")) {
      const rmId = name.slice(6);
      const rm = rawMaterials.find(r => r.id === rmId);
      if (!rm) return;
      setItems(prev => prev.map(i =>
        i.id === id
          ? {
              ...i,
              productName: rm.name,
              localName: "",
              sku: rm.rmCode,
              unit: rm.unit,
              unitPrice: rm.costPerUnit,
              variantLabel: undefined,
            }
          : i
      ));
      return;
    }
    const p = products.find(pr => pr.name === name);
    if (!p) return updateItem(id, "productName", name);
    setItems(prev => prev.map(i =>
      i.id === id
        ? {
            ...i,
            productName: p.name,
            localName: p.localName || "",
            sku: p.sku,
            unit: p.unit,
            unitPrice: getAutoPrice(p),
            variantLabel: undefined,
          }
        : i
    ));
  };

  const getVariantPrice = useCallback((v: ProductVariant) => {
    if (invoiceType === "purchase") {
      return v.purchasePrice && v.purchasePrice !== "" ? v.purchasePrice : v.price;
    }
    return v.price;
  }, [invoiceType]);

  const pickVariant = useCallback((itemId: string, v: ProductVariant) => {
    const label = Object.entries(v.attributes ?? {}).map(([k, val]) => `${k}: ${val}`).join(" · ") || v.sku || "";
    setItems(prev => prev.map(i =>
      i.id === itemId
        ? { ...i, sku: v.sku ?? i.sku, unitPrice: getVariantPrice(v), variantLabel: label }
        : i
    ));
  }, [getVariantPrice]);

  const clearVariant = useCallback((itemId: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      // Find parent product by checking whose variant SKU matches this item's SKU
      const parentProd = products.find(p => p.variants?.some(v => v.sku === i.sku));
      return {
        ...i,
        sku: parentProd?.sku ?? "",
        unitPrice: parentProd ? getAutoPrice(parentProd) : i.unitPrice,
        variantLabel: undefined,
      };
    }));
  }, [products, getAutoPrice]);

  // Re-price all items whose product is found in the catalogue when mode changes
  useEffect(() => {
    if (invoiceType === "purchase") return;
    setItems(prev => prev.map(item => {
      const p = products.find(pr => getInvoiceProductName(pr) === item.productName || pr.name === item.productName);
      if (!p) return item;
      return { ...item, unitPrice: getAutoPrice(p) };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingMode]);


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

  const handleSave = (overrideStatus?: InvoiceStatus) => {
    onSave({
      ...form,
      ...(overrideStatus ? { status: overrideStatus } : {}),
      pricingMode:     invoiceType !== "purchase" ? pricingMode : undefined,
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

  // Status to use when clicking "Create" on a new invoice
  const createStatus: InvoiceStatus = invoiceType === "purchase" ? "Sent" : "Sent";

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
                <span className="text-[13px] font-bold text-white uppercase tracking-wider">
                  {invoiceType === "purchase" ? "Supplier" : "Customer"}
                </span>
              </div>
              <div className="px-5 py-4 space-y-3">
                {/* Name (combobox) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">
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
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Company</label>
                  <input value={form.salesOfficer} onChange={e => setF("salesOfficer", e.target.value)} placeholder="Company / organisation name"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Phone</label>
                  <input value={form.buyerPhone} onChange={e => setF("buyerPhone", e.target.value)} placeholder="+44…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                {/* Area */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Area / City</label>
                  <input value={form.buyerTown} onChange={e => setF("buyerTown", e.target.value)} placeholder="Town / Area / City"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                {/* Address */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Address</label>
                  <textarea rows={2} value={form.buyerAddress} onChange={e => setF("buyerAddress", e.target.value)} placeholder="Street address…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"/>
                </div>
              </div>
            </div>

            {/* Invoice Details Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
                <span className="text-[13px] font-bold text-white uppercase tracking-wider">Invoice Details</span>
                {!isNew && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Created {new Date(invoice.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
              <div className="px-5 py-4 space-y-3">
                {/* Invoice Title */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Invoice Title</label>
                  <input value={form.invoiceTitle} onChange={e => setF("invoiceTitle", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                {/* Date + Due Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Invoice Date</label>
                    <input type="date" value={form.invoiceDate} onChange={e => setF("invoiceDate", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Due Date</label>
                    <input type="date" value={form.dueDate} onChange={e => setF("dueDate", e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isOverdue(form as unknown as Invoice) ? "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400" : "border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-gray-100"}`}/>
                  </div>
                </div>
                {/* Sales Agent */}
                {invoiceType !== "purchase" && (() => {
                  const agents = getSalesAgents().filter(a => a.status === "Active");
                  return (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Sales Agent</label>
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
                {/* Tax — sale invoices only */}
                {invoiceType !== "purchase" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">VAT / Tax %</label>
                    <input type="number" min="0" max="100" value={form.taxRate} onChange={e => setF("taxRate", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  </div>
                )}
                {/* Sale/Purchase Status */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">
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
            {/* Table header — same grid template as item rows so columns always align */}
            <div className={`grid ${invoiceType !== "purchase" ? "grid-cols-[28px_1fr_110px_80px_110px_100px_36px_156px]" : "grid-cols-[28px_1fr_110px_80px_110px_100px_36px]"} gap-0 px-4 py-2.5 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700 items-center`}>
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">#</span>
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider pl-1">Product / Service</span>
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider text-right">Unit Price</span>
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider text-center">Qty</span>
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider text-center">Discount</span>
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider text-right">Sub Total</span>
              <span />
              {/* Pricing mode switcher — occupies the 8th column for sale invoices so it
                  never steals width from the flex-1 product column */}
              {invoiceType !== "purchase" && (
                <div className="flex items-center justify-end gap-0.5 bg-gray-700 dark:bg-zinc-800 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setPricingMode("wholesale")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      pricingMode === "wholesale"
                        ? "bg-indigo-500 text-white shadow-sm"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    Wholesale
                  </button>
                  <button
                    type="button"
                    onClick={() => setPricingMode("retail")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      pricingMode === "retail"
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    Retail
                  </button>
                </div>
              )}
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {items.length === 0 && (
                <button onClick={addItem}
                  className="w-full py-8 text-sm text-gray-400 hover:text-blue-500 flex items-center justify-center gap-2 transition-colors">
                  <Plus size={15}/> Add first item
                </button>
              )}
              {items.map((item, idx) => {
                const isDelivered = item.itemStatus === "Delivered" && !!item.productName.trim();
                return (
                <div key={item.id}>
                  {/* Item row */}
                  <div className={`grid ${invoiceType !== "purchase" ? "grid-cols-[28px_1fr_110px_80px_110px_100px_36px_156px]" : "grid-cols-[28px_1fr_110px_80px_110px_100px_36px]"} gap-0 px-4 py-3 items-center transition-colors ${isDelivered ? "bg-emerald-50/40 dark:bg-emerald-950/10" : "hover:bg-gray-50/50 dark:hover:bg-zinc-800/30"}`}>
                    {/* # */}
                    <span className="text-sm font-bold text-gray-500 dark:text-zinc-400">{idx + 1}</span>
                    {/* Product */}
                    <div className="pl-1 pr-2" data-item-product={item.id}>
                      {isDelivered ? (
                        <div className="flex items-center gap-1.5">
                          <Lock size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.productName}</span>
                        </div>
                      ) : (
                        <Combobox value={item.productName} onChange={v => pickProduct(item.id, v)}
                          onSelect={opt => pickProduct(item.id, opt.value)} options={productOpts} placeholder="Product / service…"
                          maxResults={15} minDropdownWidth={320}
                          onKeyDown={e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusNextItemField(item.id, "product"); } }}
                          inputClassName="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                      )}
                      {item.localName && (
                        <span className="block text-[11px] text-muted-foreground pl-1 leading-tight mt-0.5 font-medium" dir="auto">
                          {item.localName}
                        </span>
                      )}
                      {item.sku && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 pl-1">
                          SKU: {item.sku}
                          {item.variantLabel && (
                            <span className="ml-1 text-blue-500 font-medium">· {item.variantLabel}</span>
                          )}
                        </span>
                      )}
                    </div>
                    {/* Unit Price — locked when product has variants and none is selected */}
                    {(() => {
                      const variants    = variantsForItem(item);
                      const hasVariants = variants.length > 0;
                      const needsPick   = hasVariants && !variants.some(v => v.sku === item.sku);
                      return (
                        <div className="px-1">
                          <input type="number" min="0" step="0.01"
                            value={needsPick ? "" : item.unitPrice}
                            onChange={e => { if (!needsPick) updateItem(item.id, "unitPrice", e.target.value); }}
                            placeholder={needsPick ? "—" : "0.00"}
                            readOnly={needsPick}
                            data-item-id={item.id} data-field="price"
                            onKeyDown={e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusNextItemField(item.id, "price"); } }}
                            className={`w-full px-2 py-1.5 rounded-lg border text-sm text-right outline-none transition-colors ${
                              needsPick
                                ? "border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-400 dark:text-amber-600 cursor-not-allowed"
                                : "border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                            }`}
                          />
                        </div>
                      );
                    })()}
                    {/* Qty — locked when item is Delivered */}
                    <div className="px-1">
                      <input type="number" min="0" value={item.qty}
                        onChange={e => { if (!isDelivered) updateItem(item.id, "qty", e.target.value); }}
                        data-item-id={item.id} data-field="qty"
                        readOnly={isDelivered}
                        onKeyDown={e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusNextItemField(item.id, "qty"); } }}
                        title={isDelivered ? "Qty locked — product already delivered" : undefined}
                        className={`w-full px-2 py-1.5 rounded-lg border text-sm text-center outline-none transition-colors ${
                          isDelivered
                            ? "border-emerald-200 dark:border-emerald-700/50 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 cursor-not-allowed font-semibold"
                            : "border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                        }`}
                      />
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
                      <span className="text-[15px] font-bold font-mono text-gray-900 dark:text-gray-100">{sym}{lineTotal(item).toFixed(dp)}</span>
                    </div>
                    {/* Delete — blocked when item is Delivered */}
                    <div className="flex justify-center">
                      {isDelivered ? (
                        <span title="Cannot remove a delivered item"
                          className="p-1 text-emerald-400 dark:text-emerald-600 cursor-not-allowed">
                          <Lock size={13}/>
                        </span>
                      ) : (
                        <button onClick={() => removeItem(item.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                          <X size={14}/>
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Variant picker — pill row, shown when the selected product has variants */}
                  {(() => {
                    const allVariants = variantsForItem(item);
                    if (!allVariants || allVariants.length === 0) return null;
                    // Find the parent product for this item (to identify sibling rows)
                    const parentProd = products.find(p =>
                      p.sku === item.sku || p.variants?.some(v => v.sku === item.sku)
                    );
                    // Variant SKUs already claimed by OTHER rows of the same parent product
                    const takenByOthers = new Set(
                      parentProd ? items
                        .filter(i => i.id !== item.id && parentProd.variants?.some(v => v.sku === i.sku))
                        .map(i => i.sku)
                      : []
                    );
                    // Show: this item's own selected variant + any not yet taken
                    const visibleVariants = allVariants.filter(v => v.sku === item.sku || !takenByOthers.has(v.sku));
                    const noneSelected = !allVariants.some(v => v.sku === item.sku);
                    return (
                      <div className={`mx-4 mb-2 mt-0.5 flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors ${
                        noneSelected
                          ? "border-amber-400/60 dark:border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20"
                          : "border-gray-100 dark:border-zinc-700 bg-gray-50/40 dark:bg-zinc-800/20"
                      }`}>
                        {noneSelected && (
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mr-1 shrink-0">
                            Select variant:
                          </span>
                        )}
                        {visibleVariants.length === 0 ? (
                          <span className="text-[11px] text-gray-400 dark:text-zinc-500 italic">
                            All variants already added on other lines
                          </span>
                        ) : (
                          visibleVariants.map(v => {
                            const label = Object.entries(v.attributes ?? {}).map(([k, val]) => `${k}: ${val}`).join(" · ") || v.sku || "";
                            const isSelected = item.sku === v.sku;
                            const price = getVariantPrice(v);
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => { if (!isSelected) pickVariant(item.id, v); }}
                                title={price ? `${sym}${Number(price).toFixed(dp)}` : undefined}
                                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition-colors select-none ${
                                  isSelected
                                    ? "bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500 cursor-default"
                                    : "bg-white dark:bg-zinc-800 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
                  {/* Unit conversion strip — purchase invoices only */}
                  {invoiceType === "purchase" && item.productName && (() => {
                    const factor    = parseFloat(item.conversionFactor || "") || 1;
                    const rawQty    = parseFloat(item.qty) || 0;
                    const stockQty  = rawQty * factor;
                    const baseUnit  = item.unit || "units";
                    const hasConv   = !!(item.purchaseUnit && item.purchaseUnit.trim() && factor > 1);
                    return (
                      <div className="mx-4 mb-2 mt-0.5 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-purple-200/60 dark:border-purple-700/30 bg-purple-50/40 dark:bg-purple-950/20">
                        <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 shrink-0 uppercase tracking-wide">
                          Unit Conversion
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Purchase unit label */}
                          <input
                            type="text"
                            value={item.purchaseUnit || ""}
                            onChange={e => updateItem(item.id, "purchaseUnit", e.target.value)}
                            placeholder={baseUnit}
                            title="Purchase unit (e.g. Box, Carton, Dozen)"
                            className="w-20 px-2 py-1 rounded-md border border-purple-200 dark:border-purple-700/50 bg-white dark:bg-zinc-800 text-xs text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-purple-400 outline-none placeholder:text-gray-400"
                          />
                          <span className="text-xs text-purple-500 dark:text-purple-400 font-bold">×</span>
                          {/* Conversion factor */}
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.conversionFactor || ""}
                            onChange={e => updateItem(item.id, "conversionFactor", e.target.value)}
                            placeholder="1"
                            title="How many stock units per purchase unit (e.g. 12 for 1 Box = 12 pcs)"
                            className="w-16 px-2 py-1 rounded-md border border-purple-200 dark:border-purple-700/50 bg-white dark:bg-zinc-800 text-xs text-center text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-purple-400 outline-none"
                          />
                          {hasConv && (
                            <>
                              <span className="text-xs text-purple-500 dark:text-purple-400">=</span>
                              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                {Number.isInteger(stockQty) ? stockQty : stockQty.toFixed(2)} {baseUnit}
                              </span>
                              <span className="text-[10px] text-gray-500 dark:text-gray-400">added to stock</span>
                            </>
                          )}
                          {!hasConv && (
                            <span className="text-[10px] text-gray-400 dark:text-zinc-500 italic">
                              Enter purchase unit &amp; factor — e.g. Box × 12 = 12 {baseUnit} in stock
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
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
              );
              })}
            </div>
          </div>{/* /section 2 */}

          {/* ── Section 3: Charges + Bank Details (full width) ──────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
              <span className="text-[13px] font-bold text-white uppercase tracking-wider">Charges &amp; Bank Details</span>
            </div>
            <div className="px-5 py-4">
              <div className="grid lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1.5">Delivery Charges</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">{sym}</span>
                    <input type="number" min="0" step="0.01" value={form.shippingFee} onChange={e => setF("shippingFee", e.target.value)} placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1.5">Other Charges</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">{sym}</span>
                    <input type="number" min="0" step="0.01" value={form.handlingFee} onChange={e => setF("handlingFee", e.target.value)} placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"/>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1.5">Payment / Bank Accounts</label>
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
              <span className="text-[13px] font-bold text-white uppercase tracking-wider">Summary</span>
            </div>
            <div className="px-5 py-4">
              <div className="max-w-sm ml-auto space-y-2">
                <div className="flex justify-between text-[14px] text-gray-700 dark:text-gray-300">
                  <span>Sub Total</span>
                  <span className="font-mono font-semibold">{sym}{subtotal.toFixed(dp)}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-[14px] text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-mono font-semibold">−{sym}{discountAmt.toFixed(dp)}</span>
                  </div>
                )}
                {invoiceType !== "purchase" && (
                  <div className="flex justify-between text-[14px] text-gray-700 dark:text-gray-300">
                    <span>VAT / Tax ({form.taxRate || 0}%)</span>
                    <span className="font-mono font-semibold">{sym}{tax.toFixed(dp)}</span>
                  </div>
                )}
                {shipping > 0 && (
                  <div className="flex justify-between text-[14px] text-gray-700 dark:text-gray-300">
                    <span>Delivery Charges</span>
                    <span className="font-mono font-semibold">{sym}{shipping.toFixed(dp)}</span>
                  </div>
                )}
                {handling > 0 && (
                  <div className="flex justify-between text-[14px] text-gray-700 dark:text-gray-300">
                    <span>Other Charges</span>
                    <span className="font-mono font-semibold">{sym}{handling.toFixed(dp)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[18px] font-bold text-gray-900 dark:text-gray-100 pt-3 border-t-2 border-gray-300 dark:border-zinc-600">
                  <span>Total Amount</span>
                  <span className="font-mono">{sym}{total.toFixed(dp)}</span>
                </div>
                {balance > 0.005 && (
                  <div className="flex justify-between text-[15px] font-bold text-red-600 dark:text-red-400">
                    <span>Balance Due</span>
                    <span className="font-mono">{sym}{balance.toFixed(dp)}</span>
                  </div>
                )}
                {paid > 0 && balance <= 0.005 && (
                  <div className="flex justify-between text-[15px] font-semibold text-emerald-600 dark:text-emerald-400">
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
                  <span className="text-[13px] font-bold text-white uppercase tracking-wider">Payment Details</span>
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
                <span className="text-[13px] font-bold text-white uppercase tracking-wider">Document</span>
                {docs.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-600 text-gray-200">{docs.length}</span>
                )}
              </div>
              <span className="text-xs text-gray-300">Payment terms, agreement, notes</span>
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

          {/* ── Cost Rate Calculator (purchase invoices only) ─────────────────── */}
          {invoiceType === "purchase" && items.some(it => it.productName) && (() => {
            const totalPieces   = items.reduce((s, it) => s + (parseFloat(it.qty) || 0), 0);
            const totalCharges  = (parseFloat(form.shippingFee) || 0) + (parseFloat(form.handlingFee) || 0);
            const extraPerPiece = totalPieces > 0 ? totalCharges / totalPieces : 0;

            const findProd = (it: SaleItem) =>
              products.find(p =>
                (it.sku && p.sku === it.sku) ||
                p.name.toLowerCase() === it.productName.toLowerCase()
              );

            /** Find the specific variant selected on this line item (if any). */
            const findVariant = (it: SaleItem): ProductVariant | undefined => {
              if (!it.sku) return undefined;
              return variantsForItem(it).find(v => v.sku === it.sku);
            };

            /**
             * Effective price source for the calculator — variant overrides product
             * for all three price columns (retail, wholesale, cost).
             */
            const effectivePrices = (it: SaleItem) => {
              const v = findVariant(it);
              const p = findProd(it);
              return {
                retail:    v?.price       ?? p?.price          ?? "",
                wholesale: v?.wholesalePrice ?? p?.wholesalePrice ?? "",
                cost:      v?.costPrice   ?? p?.costPrice      ?? "",
                hasProd:   !!p,
              };
            };

            const initOverrides = () => {
              const next: Record<string, { suggestedCost: string; retailPrice: string; wholesalePrice: string }> = {};
              items.forEach(it => {
                const existing = costOverrides[it.id];
                const qty  = parseFloat(it.qty) || 0;
                const uPrc = parseFloat(it.unitPrice) || 0;
                const suggested = (uPrc + (qty > 0 ? extraPerPiece : 0)).toFixed(dp);
                const ep = effectivePrices(it);
                next[it.id] = {
                  suggestedCost: existing?.suggestedCost ?? suggested,
                  retailPrice:   existing?.retailPrice   ?? ep.retail,
                  wholesalePrice:existing?.wholesalePrice ?? ep.wholesale,
                };
              });
              setCostOverrides(next);
            };

            // Push cost + retail + wholesale prices to catalogue (variant-aware)
            const handlePush = () => {
              let pushed = 0;
              items.forEach(it => {
                const prod = findProd(it);
                if (!prod) return;
                const ov = costOverrides[it.id];
                if (!ov) return;
                const variant = findVariant(it);
                if (variant) {
                  const updatedVariants = (prod.variants ?? []).map(v =>
                    v.id === variant.id ? {
                      ...v,
                      ...(ov.suggestedCost ? { purchasePrice: ov.suggestedCost, costPrice: ov.suggestedCost } : {}),
                      ...(ov.retailPrice    ? { price: ov.retailPrice }                                        : {}),
                      ...(ov.wholesalePrice ? { wholesalePrice: ov.wholesalePrice }                            : {}),
                    } : v
                  );
                  updateProduct(prod.id, { variants: updatedVariants });
                } else {
                  const updates: Partial<{ purchasePrice: string; costPrice: string; price: string; wholesalePrice: string }> = {};
                  if (ov.suggestedCost) { updates.purchasePrice = ov.suggestedCost; updates.costPrice = ov.suggestedCost; }
                  if (ov.retailPrice)    updates.price          = ov.retailPrice;
                  if (ov.wholesalePrice) updates.wholesalePrice = ov.wholesalePrice;
                  if (Object.keys(updates).length) updateProduct(prod.id, updates);
                }
                pushed++;
              });
              toast({ title: `Prices updated`, description: `${pushed} product(s) updated in catalogue.` });
            };

            // Push only the raw supplier/purchase price (variant-aware)
            const handlePushPurchasePrice = () => {
              let pushed = 0;
              items.forEach(it => {
                const prod = findProd(it);
                if (!prod) return;
                const uPrc = it.unitPrice;
                if (!uPrc) return;
                const variant = findVariant(it);
                if (variant) {
                  const updatedVariants = (prod.variants ?? []).map(v =>
                    v.id === variant.id ? { ...v, purchasePrice: uPrc } : v
                  );
                  updateProduct(prod.id, { variants: updatedVariants });
                } else {
                  updateProduct(prod.id, { purchasePrice: uPrc });
                }
                pushed++;
              });
              toast({ title: `Purchase price updated`, description: `${pushed} product(s) updated with supplier price from this invoice.` });
            };

            return (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                {/* Header / toggle */}
                <button
                  type="button"
                  onClick={() => {
                    if (!costCalcOpen) initOverrides();
                    setCostCalcOpen(o => !o);
                  }}
                  className="w-full flex items-center justify-between px-5 py-3 bg-gray-800 dark:bg-zinc-950 hover:bg-gray-700 dark:hover:bg-zinc-900 border-b border-gray-700 dark:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight size={14} className={`text-gray-300 transition-transform ${costCalcOpen ? "rotate-90" : ""}`}/>
                    <Calculator size={14} className="text-amber-400"/>
                    <span className="text-[13px] font-bold text-white uppercase tracking-wider">Cost Rate Calculator</span>
                  </div>
                  <span className="text-xs text-gray-300">Landed cost distribution → push to product catalogue</span>
                </button>

                {costCalcOpen && (
                  <div className="p-5 space-y-5">
                    {/* ── Summary bar ──────────────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl px-4 py-3 text-center">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Pieces</p>
                        <p className="text-3xl font-black text-gray-800 dark:text-gray-100">{totalPieces.toFixed(0)}</p>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl px-4 py-3 text-center">
                        <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Total Charges</p>
                        <p className="text-3xl font-black text-amber-700 dark:text-amber-300">{sym}{totalCharges.toFixed(dp)}</p>
                        <p className="text-[11px] text-amber-500 mt-0.5">Delivery + Other</p>
                      </div>
                      <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl px-4 py-3 text-center">
                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">Extra Cost / Piece</p>
                        <p className="text-3xl font-black text-indigo-700 dark:text-indigo-300">
                          {totalPieces > 0 ? `${sym}${extraPerPiece.toFixed(dp)}` : "—"}
                        </p>
                        <p className="text-[11px] text-indigo-400 mt-0.5">÷ {totalPieces} pcs</p>
                      </div>
                    </div>

                    {/* ── Re-calculate button ───────────────────────────── */}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={initOverrides}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
                      >
                        <RefreshCw size={12}/> Recalculate
                      </button>
                    </div>

                    {/* ── Per-item table ────────────────────────────────── */}
                    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
                      {/* Table head */}
                      <div className="grid grid-cols-[1fr_60px_100px_110px_120px_120px_120px] gap-0 px-4 py-2 bg-gray-100 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                        {["Product", "Qty", "Supplier Price", "Extra Cost/Unit", "Cost Price", "Retail Price", "Wholesale Price"].map(h => (
                          <span key={h} className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider text-center first:text-left">{h}</span>
                        ))}
                      </div>

                      {/* Table rows — two rows per item */}
                      {items.filter(it => it.productName).map(it => {
                        const qty     = parseFloat(it.qty) || 0;
                        const uPrc    = parseFloat(it.unitPrice) || 0;
                        const extra   = extraPerPiece;
                        const ep      = effectivePrices(it);
                        const variant = findVariant(it);
                        const ov      = costOverrides[it.id] ?? {
                          suggestedCost: (uPrc + extra).toFixed(dp),
                          retailPrice:   ep.retail,
                          wholesalePrice:ep.wholesale,
                        };

                        const setOv = (field: "suggestedCost" | "retailPrice" | "wholesalePrice", val: string) =>
                          setCostOverrides(prev => ({
                            ...prev,
                            [it.id]: { ...(prev[it.id] ?? { suggestedCost: "", retailPrice: "", wholesalePrice: "" }), [field]: val },
                          }));

                        const hasProd = ep.hasProd;

                        return (
                          <div key={it.id} className={`border-b border-gray-100 dark:border-zinc-800 last:border-0 ${hasProd ? "" : "opacity-50"}`}>
                            {/* ── Row 1: editable inputs ── */}
                            <div className="grid grid-cols-[1fr_60px_100px_110px_120px_120px_120px] gap-0 px-4 py-2 items-center">
                              {/* Product name */}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{it.productName || "—"}</p>
                                {!hasProd && <p className="text-[10px] text-red-400 mt-0.5">Not in catalogue</p>}
                              </div>
                              {/* Qty */}
                              <div className="text-center text-sm font-mono text-gray-600 dark:text-gray-400">{qty}</div>
                              {/* Supplier price */}
                              <div className="text-center text-sm font-mono text-gray-600 dark:text-gray-400">{sym}{uPrc.toFixed(dp)}</div>
                              {/* Extra cost/unit */}
                              <div className="text-center text-sm font-mono text-indigo-600 dark:text-indigo-400">
                                {qty > 0 ? `+${sym}${extra.toFixed(dp)}` : "—"}
                              </div>
                              {/* Cost Price (suggestedCost) — editable */}
                              <div className="px-1.5">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">{sym}</span>
                                  <input type="number" min="0" step="0.01" value={ov.suggestedCost}
                                    onChange={e => setOv("suggestedCost", e.target.value)}
                                    className="w-full pl-5 pr-1 py-1.5 text-sm font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-right"
                                  />
                                </div>
                              </div>
                              {/* Retail Price — editable */}
                              <div className="px-1.5">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">{sym}</span>
                                  <input type="number" min="0" step="0.01" value={ov.retailPrice}
                                    onChange={e => setOv("retailPrice", e.target.value)}
                                    placeholder="—"
                                    className="w-full pl-5 pr-1 py-1.5 text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 text-right"
                                  />
                                </div>
                              </div>
                              {/* Wholesale Price — editable */}
                              <div className="px-1.5">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">{sym}</span>
                                  <input type="number" min="0" step="0.01" value={ov.wholesalePrice}
                                    onChange={e => setOv("wholesalePrice", e.target.value)}
                                    placeholder="—"
                                    className="w-full pl-5 pr-1 py-1.5 text-sm font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* ── Row 2: current catalogue prices (read-only, variant-aware) ── */}
                            <div className="grid grid-cols-[1fr_60px_100px_110px_120px_120px_120px] gap-0 px-4 pb-2 items-center bg-gray-50/60 dark:bg-zinc-800/30">
                              <div className="min-w-0">
                                <p className="text-xs text-gray-500 italic">
                                  {variant ? "Current in catalogue — variant" : "Current in catalogue"}
                                </p>
                                {variant && it.variantLabel && (
                                  <p className="text-[10px] text-indigo-500 truncate">{it.variantLabel}</p>
                                )}
                              </div>
                              <div/><div/><div/>
                              {/* Current Cost Price */}
                              <div className="px-1.5 text-center">
                                <span className="text-[13px] font-bold font-mono text-amber-600 dark:text-amber-400">
                                  {ep.cost ? `${sym}${parseFloat(ep.cost).toFixed(dp)}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                                </span>
                                <p className="text-[10px] text-gray-500 leading-tight">Cost</p>
                              </div>
                              {/* Current Retail Price */}
                              <div className="px-1.5 text-center">
                                <span className="text-[13px] font-bold font-mono text-emerald-600 dark:text-emerald-400">
                                  {ep.retail ? `${sym}${parseFloat(ep.retail).toFixed(dp)}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                                </span>
                                <p className="text-[10px] text-gray-500 leading-tight">Retail</p>
                              </div>
                              {/* Current Wholesale Price */}
                              <div className="px-1.5 text-center">
                                <span className="text-[13px] font-bold font-mono text-blue-600 dark:text-blue-400">
                                  {ep.wholesale ? `${sym}${parseFloat(ep.wholesale).toFixed(dp)}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                                </span>
                                <p className="text-[10px] text-gray-500 leading-tight">Wholesale</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Footer: legend + action buttons ─────────────────── */}
                    <div className="flex items-center justify-between pt-1 gap-3 flex-wrap">
                      <p className="text-xs text-gray-500">
                        Amber = Cost Price · Green = Retail · Blue = Wholesale · Greyed = no catalogue match
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handlePushPurchasePrice}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-600 hover:bg-gray-500 text-white text-sm font-bold shadow transition-colors"
                        >
                          <Upload size={13}/> Push Purchase Price
                        </button>
                        <button
                          type="button"
                          onClick={handlePush}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow transition-colors"
                        >
                          <Upload size={13}/> Push All Prices
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Payments Card (existing invoices only) ───────────────────────── */}
          {!isNew && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-700 dark:border-zinc-700 flex items-center justify-between bg-gray-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2">
                  <Receipt size={14} className="text-emerald-400"/>
                  <span className="text-[13px] font-bold text-white uppercase tracking-wider">Payments</span>
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
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1">Invoice Total</p>
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
                    const _invTotal = invoice!.items.reduce((s, it) => s + (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0), 0)
                      + (parseFloat(invoice!.shippingFee)||0) + (parseFloat(invoice!.handlingFee)||0);
                    const _allProds = getProducts();
                    const _catMap   = new Map<string, number>();
                    for (const it of invoice!.items) {
                      const p   = _allProds.find(p => p.sku === it.sku || p.name === it.productName);
                      const cat = p?.category?.trim() || "Uncategorised";
                      _catMap.set(cat, (_catMap.get(cat) || 0) + (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0));
                    }
                    const _suppName    = (invoice!.customer || "").toLowerCase();
                    const _crm         = getCustomers();
                    const _suppContact = _crm.find(c =>
                      (c.name || "").toLowerCase() === _suppName ||
                      (c.name + (c.company ? ` (${c.company})` : "")).toLowerCase() === _suppName
                    );
                    const _je = autoPostPurchaseJE({
                      poNumber: invoice!.invoiceNumber, supplier: invoice!.customer,
                      date: new Date().toISOString().slice(0, 10), total: _invTotal,
                      supplierLedgerId: _suppContact?.ledgerAccountId,
                      categoryLines: Array.from(_catMap.entries()).map(([category, total]) => ({ category, total })),
                    });
                    updateInvoice(invoice!.id, {
                      stockReceived: true, stockDeducted: true,
                      saleStatus:    "Received",
                      jeId:          _je?.id ?? invoice!.jeId,
                    });
                    toast({ title: "Goods Received — Inventory & Ledger Updated", description: `Stock for ${invoice!.invoiceNumber} added. Journal entry posted to Inventory & Payables.` });
                  }}
                    disabled={stockJustReceived}
                    className={`col-span-2 h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${stockJustReceived ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 cursor-not-allowed" : "border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30"}`}>
                    <PackagePlus size={12}/>{stockJustReceived ? "✓ Goods Already Received" : "Mark as Received"}
                  </button>
                )}
                {s === "Draft" && invoiceType !== "purchase" && (
                  <button onClick={() => onStatusChange(inv!.id, "Sent")}
                    className="h-9 rounded-lg border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-1.5 transition-colors">
                    <Send size={12}/> Send
                  </button>
                )}
                {(s === "Paid" || s === "Partial" || s === "Sent" || s === "Overdue") && invoiceType !== "purchase" && (
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

          {/* Share Link — copy public invoice URL */}
          {!isNew && <CopyLinkButton invoiceId={invoice!.id} />}

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

          {/* New invoice: Draft + Create split */}
          {isNew ? (
            <>
              {/* Draft */}
              <button
                onClick={() => handleSave("Draft")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-600 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
              >
                <FileText size={14}/> Save as Draft
              </button>
              {/* Create (activate immediately) */}
              <button
                onClick={() => handleSave(createStatus)}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-md transition-colors ${
                  invoiceType === "purchase"
                    ? "bg-purple-600 hover:bg-purple-700 shadow-purple-200 dark:shadow-none"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-200 dark:shadow-none"
                }`}
              >
                <CheckCircle size={14}/> Create Invoice
              </button>
            </>
          ) : (
            /* Existing invoice: single Save button preserving current status */
            <button
              onClick={() => handleSave()}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white shadow-md transition-colors ${
                invoiceType === "purchase"
                  ? "bg-purple-600 hover:bg-purple-700 shadow-purple-200 dark:shadow-none"
                  : "bg-blue-600 hover:bg-blue-700 shadow-blue-200 dark:shadow-none"
              }`}
            >
              <Save size={14}/> Save
            </button>
          )}
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
            const { total: invTotal } = computeTotals(invoice.items, effectiveTaxRate, newPaid.toFixed(dp), form.shippingFee, form.handlingFee);
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
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <p>The following will be permanently undone for <strong className="text-gray-900 dark:text-gray-100">{invoice?.invoiceNumber}</strong>:</p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>All recorded payments &amp; payment history cleared</li>
                  <li>Journal entries deleted (sale JE, receipts, adjustments)</li>
                  <li>Linked receipt vouchers reset to draft</li>
                  <li>Deducted stock restored to inventory</li>
                </ul>
                <p className="text-orange-600 dark:text-orange-400 font-medium">This cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (invoice) onStatusChange(invoice.id, "Draft"); setRevertConfirmOpen(false); }}
              className="bg-orange-600 hover:bg-orange-700 text-white">
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

  /** Build per-category purchase cost totals from items */
  const buildPurchaseCatLines = (items: Invoice["items"]) => {
    const prods = getProducts();
    const map   = new Map<string, number>();
    for (const it of items) {
      const prod = prods.find(p => p.sku === it.sku || p.name === it.productName);
      const cat  = prod?.category?.trim() || "Uncategorised";
      map.set(cat, (map.get(cat) || 0) + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0));
    }
    return Array.from(map.entries()).map(([category, total]) => ({ category, total }));
  };

  /** Build per-category sale revenue + cost breakdown from items */
  const buildSaleCatLines = (items: Invoice["items"]) => {
    const prods = getProducts();
    const catMap = new Map<string, { subtotal: number; costTotal: number }>();
    for (const it of items) {
      const prod    = findProductForItem(it, prods);
      const cat     = prod?.category?.trim() || "Uncategorised";
      const qty     = parseFloat(it.qty) || 0;
      const price   = parseFloat(it.unitPrice) || 0;
      const disc    = parseFloat((it as { discountPct?: string }).discountPct || "0") / 100;
      const lineNet = qty * price * (1 - disc);
      const cost    = effectiveItemCost(it, prod) * qty;
      const entry   = catMap.get(cat) ?? { subtotal: 0, costTotal: 0 };
      entry.subtotal  += lineNet;
      entry.costTotal += cost;
      catMap.set(cat, entry);
    }
    return Array.from(catMap.entries()).map(([category, v]) => ({ category, ...v }));
  };

  /** Receive stock + post purchase JE for a purchase invoice — idempotent (guarded by stockDeducted) */
  const receivePurchaseStock = useCallback((inv: Invoice) => {
    if (inv.stockDeducted) return null;
    if (inv.invoiceType !== "purchase") return null;
    receiveStockForPurchase(inv.items, inv.invoiceNumber, "Purchase");
    const total = inv.items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0), 0)
      + (parseFloat(inv.shippingFee) || 0) + (parseFloat(inv.handlingFee) || 0);
    // Look up the supplier's exact ledger account ID from the CRM so the JE
    // posts to their specific sub-ledger rather than the generic AP fallback —
    // this works even if the contact was set up under AR instead of AP.
    const supplierName = (inv.customer || "").toLowerCase();
    const crm = getCustomers();
    const supplierContact = crm.find(c =>
      (c.name || "").toLowerCase() === supplierName ||
      (c.name + (c.company ? ` (${c.company})` : "")).toLowerCase() === supplierName
    );
    return autoPostPurchaseJE({
      poNumber: inv.invoiceNumber, supplier: inv.customer,
      date: new Date().toISOString().slice(0, 10), total,
      supplierLedgerId: supplierContact?.ledgerAccountId,
      categoryLines: buildPurchaseCatLines(inv.items),
    });
  }, []);

  /** Deduct stock + post sale JE for a sale invoice — idempotent (guarded by jeId / stockDeducted) */
  const postSaleJE = useCallback((inv: Invoice, extraUpdates: Partial<Invoice>) => {
    if (inv.invoiceType === "purchase") return;
    const activeStatuses: string[] = ["Sent", "Overdue", "Paid", "Partial"];
    if (!activeStatuses.includes(inv.status as string)) return;
    if (!inv.stockDeducted) {
      deductStockForSale(inv.items, inv.invoiceNumber, "Invoiced");
      extraUpdates.stockDeducted = true;
    }
    if (!inv.jeId) {
      const catLines  = buildSaleCatLines(inv.items);
      const paidSoFar = parseFloat(inv.amountPaid || "0") || 0;
      const { after: subtotal, tax: taxAmount, shipping, handling, total: grandTotal } = computeTotals(
        inv.items, inv.taxRate, inv.amountPaid || "0", inv.shippingFee, inv.handlingFee,
      );
      const je = autoPostSaleJE({
        source: "Invoice", reference: inv.invoiceNumber,
        customer: inv.customer || "Customer",
        date: inv.invoiceDate || new Date().toISOString().slice(0, 10),
        paymentMethod: inv.paymentMethod,
        subtotal, taxAmount, grandTotal,
        deliveryAmount: parseFloat((shipping + handling).toFixed(2)),
        amountPaid: paidSoFar,
        costTotal: catLines.reduce((s, c) => s + c.costTotal, 0),
        categoryLines: catLines.map(c => ({ category: c.category, subtotal: c.subtotal, costTotal: c.costTotal })),
      });
      if (je) { extraUpdates.jeId = je.id; extraUpdates.jeUsesAR = je.usesAR; }
    }
  }, []);

  const handleSave = useCallback((data: Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">, id?: string) => {
    const isPurchase = data.invoiceType === "purchase";
    const isReceived = data.saleStatus === "Received";

    if (id) {
      const existing = getInvoices().find(i => i.id === id);
      const wasReceived = existing?.stockDeducted;
      const updates: Partial<Invoice> = { ...data };

      if (isPurchase) {
        // Purchase: trigger goods-receipt when saleStatus first becomes "Received"
        if (isReceived && !wasReceived) {
          const tempInv = { ...existing!, ...data, id } as Invoice;
          const je = receivePurchaseStock(tempInv);
          updates.stockReceived = true;
          updates.stockDeducted = true;
          if (je) updates.jeId = je.id;
        }
      } else {
        // Sale: post JE + deduct stock if status is active and JE not yet posted
        const tempInv = { ...existing!, ...data, id } as Invoice;
        postSaleJE(tempInv, updates);
      }

      editInvoice(id, updates);

      // ── Price-adjustment JE ───────────────────────────────────────────────
      // If a sale JE has already been posted and the grand total has changed,
      // automatically create a balancing correction entry (Credit Note / Debit Note).
      let adjToastShown = false;
      if (!isPurchase && existing?.jeId) {
        const oldTotals = computeTotals(
          existing.items, existing.taxRate, "0",
          existing.shippingFee, existing.handlingFee,
        );
        const newTotals = computeTotals(
          data.items, data.taxRate, "0",
          data.shippingFee || "0", data.handlingFee || "0",
        );
        const diff = Math.abs(newTotals.total - oldTotals.total);
        if (diff > 0.01) {
          const adjJe = createInvoicePriceAdjustmentJE({
            invoiceNumber: existing.invoiceNumber,
            customer:      data.customer || existing.customer,
            date:          data.invoiceDate || existing.invoiceDate,
            oldTotal:      oldTotals.total,
            newTotal:      newTotals.total,
          });
          if (adjJe) {
            const sym  = getSettingsCurrencySymbol();
            const dp   = getSettingsDecimalPlaces();
            const kind = newTotals.total < oldTotals.total ? "Credit Note" : "Debit Note";
            toast({
              title:       `${kind} adjustment posted`,
              description: `${sym}${diff.toFixed(dp)} difference — JE ADJ-${existing.invoiceNumber} created`,
            });
            adjToastShown = true;
          }
        }
      }

      if (!adjToastShown) toast({ title: "Invoice updated" });
      navigate(isPurchase ? "/invoices?type=purchase" : "/invoices");
    } else {
      // New invoice — create first, then apply JE / stock logic
      const inv = addInvoice(data);
      const extraUpdates: Partial<Invoice> = {};

      if (isPurchase && isReceived) {
        const je = receivePurchaseStock(inv);
        extraUpdates.stockReceived = true;
        extraUpdates.stockDeducted = true;
        if (je) extraUpdates.jeId = je.id;
      } else if (!isPurchase) {
        postSaleJE(inv, extraUpdates);
      }

      if (Object.keys(extraUpdates).length > 0) editInvoice(inv.id, extraUpdates);
      toast({ title: "Invoice created", description: inv.invoiceNumber });
      navigate(isPurchase ? "/invoices?type=purchase" : "/invoices");
    }
  }, [editInvoice, addInvoice, toast, navigate, receivePurchaseStock, postSaleJE]);

  const handleStatusChange = useCallback((id: string, status: InvoiceStatus, amountPaid?: string) => {
    // Read directly from in-memory cache for the freshest state — React state may be stale
    // if the user clicks multiple status buttons in rapid succession.
    const inv = getInvoices().find(i => i.id === id);
    if (!inv) return;

    // ── Full revert for sale invoices — all JEs, vouchers, stock, payments ────
    if (status === "Draft" && inv.invoiceType !== "purchase") {
      revertInvoiceToDraft(id);
      toast({ title: "Reverted to Draft", description: "Payments cleared · journal entries deleted · stock restored" });
      return;
    }

    const updates: Partial<Invoice> = { status };
    if (amountPaid !== undefined) updates.amountPaid = amountPaid;
    if (status === "Paid" || status === "Partial") {
      if (!inv.paidAt) updates.paidAt = new Date().toISOString();
    }

    // ── Build per-category breakdown for accurate ledger posting ─────────────
    const allProducts = getProducts();
    const buildCategoryLines = (items: SaleItem[]) => {
      const catMap = new Map<string, { subtotal: number; costTotal: number; purchaseTotal: number }>();
      for (const item of items) {
        const prod    = findProductForItem(item, allProducts);
        const cat     = prod?.category?.trim() || "Uncategorised";
        const qty     = parseFloat(item.qty) || 0;
        const price   = parseFloat(item.unitPrice) || 0;
        const disc    = parseFloat((item as {discountPct?: string}).discountPct || "0") / 100;
        const lineNet = qty * price * (1 - disc);
        const lineCost = effectiveItemCost(item, prod) * qty;
        const entry   = catMap.get(cat) ?? { subtotal: 0, costTotal: 0, purchaseTotal: qty * price };
        entry.subtotal      += lineNet;
        entry.costTotal     += lineCost;
        entry.purchaseTotal  = (entry.purchaseTotal || 0) + qty * price;
        catMap.set(cat, entry);
      }
      return Array.from(catMap.entries()).map(([category, v]) => ({ category, ...v }));
    };
    const catLines = buildCategoryLines(inv.items);

    // ── Sale invoices: deduct stock when dispatched ───────────────────────────
    if (inv.invoiceType !== "purchase" &&
        (status === "Sent" || status === "Overdue" || status === "Paid" || status === "Partial") &&
        !inv.stockDeducted) {
      deductStockForSale(inv.items, inv.invoiceNumber, "Invoiced");
      updates.stockDeducted = true;
    }

    // ── Reverse stock when voided ─────────────────────────────────────────────
    if ((status === "Draft" || status === "Cancelled") && inv.stockDeducted) {
      if (inv.invoiceType === "purchase") {
        reverseStockForPurchase(inv.items, inv.invoiceNumber);
        updates.stockReceived = false;
      } else {
        restoreStockForSale(inv.items, inv.invoiceNumber);
      }
      updates.stockDeducted = false;
      updates.paidAt = "";
    }
    // ── Clear JE ref when voided (sale invoices) so it is re-posted correctly on next issue ──
    if ((status === "Draft" || status === "Cancelled") && inv.invoiceType !== "purchase" && inv.jeId) {
      updates.jeId      = undefined;
      updates.jeUsesAR  = undefined;
    }

    // ── Journal entries (sale invoices only) ─────────────────────────────────
    if (inv.invoiceType !== "purchase") {
      const today = new Date().toISOString().slice(0, 10);
      const invDate = inv.invoiceDate || today;
      const { after: subtotal, tax: taxAmount, total: grandTotal } = computeTotals(
        inv.items, inv.taxRate, amountPaid ?? inv.amountPaid ?? "0",
        inv.shippingFee, inv.handlingFee,
      );

      const isCredit = inv.paymentMethod === "Credit";

      // 1) Accrual JE when invoice is issued (Sent / Overdue for any payment method).
      //    Pass amountPaid so the function can route to AR when there's an outstanding balance.
      if ((status === "Sent" || status === "Overdue") && !inv.jeId) {
        const paidSoFar = parseFloat(inv.amountPaid || "0") || 0;
        const je = autoPostSaleJE({
          source: "Invoice", reference: inv.invoiceNumber,
          customer: inv.customer || "Customer",
          date: invDate, paymentMethod: inv.paymentMethod,
          subtotal, taxAmount, grandTotal,
          deliveryAmount: parseFloat(((computeTotals(inv.items, inv.taxRate, inv.amountPaid || "0", inv.shippingFee, inv.handlingFee).shipping) + (computeTotals(inv.items, inv.taxRate, inv.amountPaid || "0", inv.shippingFee, inv.handlingFee).handling)).toFixed(2)),
          amountPaid: paidSoFar,
          costTotal: parseFloat(catLines.reduce((s, c) => s + c.costTotal, 0).toFixed(2)),
          categoryLines: catLines.map(c => ({ category: c.category, subtotal: c.subtotal, costTotal: c.costTotal })),
        });
        if (je) { updates.jeId = je.id; updates.jeUsesAR = je.usesAR; }
      }

      // 2) When payment arrives:
      //    - Invoice already has an AR-based accrual JE (credit or outstanding) → post cash receipt (DR Cash/Bank, CR AR)
      //    - Invoice with no prior JE (immediate cash sale) → post full JE now with Cash/Bank debit
      if (status === "Paid" || status === "Partial") {
        const paidDate  = amountPaid !== undefined ? today : (inv.paidAt?.slice(0, 10) || today);
        const paidAmt   = parseFloat(amountPaid ?? inv.amountPaid ?? String(grandTotal)) || grandTotal;
        const hadARJE   = inv.jeId && (isCredit || inv.jeUsesAR);

        if (hadARJE) {
          // Accrual (AR) JE already posted — record the cash receipt to clear AR
          autoPostCashReceiptJE({
            reference: inv.invoiceNumber, customer: inv.customer || "Customer",
            date: paidDate, amount: paidAmt,
            paymentMethod: inv.paymentMethod === "Cash" ? "Cash" : inv.paymentMethod,
          });
        } else if (!inv.jeId) {
          // Immediate cash/bank sale with no prior JE — full JE now (payment in hand → Cash debit)
          const { shipping: _s2, handling: _h2 } = computeTotals(inv.items, inv.taxRate, inv.amountPaid || "0", inv.shippingFee, inv.handlingFee);
          const je = autoPostSaleJE({
            source: "Invoice", reference: inv.invoiceNumber,
            customer: inv.customer || "Customer",
            date: invDate, paymentMethod: inv.paymentMethod,
            subtotal, taxAmount, grandTotal,
            deliveryAmount: parseFloat((_s2 + _h2).toFixed(2)),
            // grandTotal === paidAmt here, so no outstanding balance → Cash/Bank debit
            amountPaid: paidAmt,
            costTotal: parseFloat(catLines.reduce((s, c) => s + c.costTotal, 0).toFixed(2)),
            categoryLines: catLines.map(c => ({ category: c.category, subtotal: c.subtotal, costTotal: c.costTotal })),
          });
          if (je) { updates.jeId = je.id; updates.jeUsesAR = je.usesAR; }
        }
      }
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
    // Read from in-memory cache for freshest state — React state may lag behind
    const inv = getInvoices().find(i => i.id === id);
    if (!inv) return;

    const updatedHistory = [...(inv.paymentHistory ?? []), record];
    const updates: Partial<Invoice> = {
      paymentHistory: updatedHistory,
      amountPaid:     newTotalPaid,
      status:         newStatus,
      paidAt:         inv.paidAt || new Date().toISOString(),
    };

    // ── Build per-category breakdown ──────────────────────────────────────────
    const allProds = getProducts();
    const catMap = new Map<string, { subtotal: number; costTotal: number; purchaseTotal: number }>();
    for (const item of inv.items) {
      const prod    = findProductForItem(item, allProds);
      const cat     = prod?.category?.trim() || "Uncategorised";
      const qty     = parseFloat(item.qty) || 0;
      const price   = parseFloat(item.unitPrice) || 0;
      const disc    = parseFloat((item as {discountPct?: string}).discountPct || "0") / 100;
      const lineNet  = qty * price * (1 - disc);
      const lineCost = effectiveItemCost(item, prod) * qty;
      const entry   = catMap.get(cat) ?? { subtotal: 0, costTotal: 0, purchaseTotal: 0 };
      entry.subtotal      += lineNet;
      entry.costTotal     += lineCost;
      entry.purchaseTotal += qty * price;
      catMap.set(cat, entry);
    }
    const catLines = Array.from(catMap.entries()).map(([category, v]) => ({ category, ...v }));

    // ── Stock management (sales only — purchases receive stock via "Mark as Received") ──
    if (!inv.stockDeducted && inv.invoiceType !== "purchase") {
      deductStockForSale(inv.items, inv.invoiceNumber, "Invoiced");
      updates.stockDeducted = true;
    }

    // ── Journal entries (sale invoices only) ─────────────────────────────────
    if (inv.invoiceType !== "purchase") {
      const { after: subtotal, tax: taxAmount, total: grandTotal } = computeTotals(
        inv.items, inv.taxRate, newTotalPaid, inv.shippingFee, inv.handlingFee,
      );
      const payDate    = record.date || inv.invoiceDate || new Date().toISOString().slice(0, 10);
      const isCredit   = inv.paymentMethod === "Credit";
      const payAmt     = parseFloat(record.amount) || 0;
      const payMethod  = (record.method as SalePayment) || inv.paymentMethod;

      if (!inv.jeId) {
        // First JE: pass amountPaid so AR is used if there's an outstanding balance
        const paidSoFar = parseFloat(newTotalPaid) || 0;
        const { shipping: _s3, handling: _h3 } = computeTotals(inv.items, inv.taxRate, newTotalPaid, inv.shippingFee, inv.handlingFee);
        const je = autoPostSaleJE({
          source: "Invoice", reference: inv.invoiceNumber,
          customer: inv.customer || "Customer",
          date: inv.invoiceDate || payDate, paymentMethod: inv.paymentMethod,
          subtotal, taxAmount, grandTotal,
          deliveryAmount: parseFloat((_s3 + _h3).toFixed(2)),
          amountPaid: paidSoFar,
          costTotal: parseFloat(catLines.reduce((s, c) => s + c.costTotal, 0).toFixed(2)),
          categoryLines: catLines.map(c => ({ category: c.category, subtotal: c.subtotal, costTotal: c.costTotal })),
        });
        if (je) { updates.jeId = je.id; updates.jeUsesAR = je.usesAR; }
      } else {
        // Subsequent payment — post receipt JE (DR Cash/Bank, CR AR) whenever the prior JE used AR
        if (payAmt > 0 && (isCredit || inv.jeUsesAR)) {
          autoPostCashReceiptJE({
            reference: inv.invoiceNumber, customer: inv.customer || "Customer",
            date: payDate, amount: payAmt, paymentMethod: payMethod,
          });
        }
      }
    }

    editInvoice(id, updates);
    const sym = getSettingsCurrencySymbol();
    toast({ title: "Payment recorded", description: `${sym}${parseFloat(newTotalPaid).toFixed(2)} collected · ${newStatus}` });
  }, [editInvoice, toast]);

  const handleDelete = useCallback((id: string) => {
    const inv = getInvoices().find(i => i.id === id);
    try {
      removeInvoice(id);
    } catch (err) {
      toast({
        title: "Cannot delete",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return;
    }
    // Only roll back stock AFTER the invoice was successfully removed.
    if (inv?.stockDeducted) {
      if (inv.invoiceType === "purchase") {
        reverseStockForPurchase(inv.items, inv.invoiceNumber);
      } else {
        restoreStockForSale(inv.items, inv.invoiceNumber);
      }
    }
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
    try { return sessionStorage.getItem("invoices-wrap-text") === "true"; } catch { return false; }
  });
  const toggleWrap = () => setWrapText(v => {
    const next = !v;
    try { sessionStorage.setItem("invoices-wrap-text", String(next)); } catch {}
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
                    { header: "Total (£)",      key: "id",            getValue: r => computeTotals(r.items, r.invoiceType === "purchase" ? "0" : r.taxRate, r.amountPaid, r.shippingFee, r.handlingFee).total.toFixed(dp), width: 14 },
                    { header: "Paid (£)",       key: "amountPaid",    width: 12 },
                    { header: "Balance (£)",    key: "id",            getValue: r => computeTotals(r.items, r.invoiceType === "purchase" ? "0" : r.taxRate, r.amountPaid, r.shippingFee, r.handlingFee).balance.toFixed(dp), width: 14 },
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
            <div className={`grid ${isPurchase ? "grid-cols-[1.2fr_1.4fr_0.9fr_0.9fr_0.6fr_1fr_0.8fr_1fr_0.9fr_1fr_auto]" : "grid-cols-[1.4fr_1.6fr_1fr_1fr_0.8fr_1fr_1fr_1.2fr_auto]"} gap-0 px-4 py-3 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700 text-[12px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider`}>
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
              // Purchase invoices: item prices are entered as-is (tax NOT added on top).
              // The form uses effectiveTaxRate="0" for purchases — the list must match.
              const listTaxRate = inv.invoiceType === "purchase" ? "0" : (inv.taxRate ?? "0");
              const { total, paid } = computeTotals(inv.items, listTaxRate, inv.amountPaid, inv.shippingFee, inv.handlingFee);
              const overdue = isOverdue(inv);
              const inStock = !!(inv.stockReceived || inv.stockDeducted);
              return (
                <div
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}${inv.invoiceType === "purchase" ? "?type=purchase" : ""}`)}
                  className={`grid ${isPurchase ? "grid-cols-[1.2fr_1.4fr_0.9fr_0.9fr_0.6fr_1fr_0.8fr_1fr_0.9fr_1fr_auto]" : "grid-cols-[1.4fr_1.6fr_1fr_1fr_0.8fr_1fr_1fr_1.2fr_auto]"} gap-0 px-4 py-4 border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group ${wrapText ? "items-start" : "items-center"}`}
                >
                  {/* Invoice # */}
                  <div className={`font-mono text-[13px] font-bold text-gray-900 dark:text-gray-100 pr-2 ${wrapText ? "break-words" : "truncate"}`}>
                    {inv.invoiceNumber}
                  </div>

                  {/* Customer / Supplier */}
                  <div className={`text-[13px] text-gray-800 dark:text-gray-200 pr-2 ${wrapText ? "break-words" : "truncate"}`}>
                    {inv.customer || <span className="text-gray-400 italic">{isPurchase ? "—" : "Walk-in"}</span>}
                  </div>

                  {/* Date */}
                  <div className="text-[12px] text-gray-600 dark:text-gray-400">
                    {fmtDate(inv.invoiceDate)}
                  </div>

                  {/* Due Date */}
                  <div className={`text-[12px] font-semibold ${overdue ? "text-red-500" : "text-gray-600 dark:text-gray-400"}`}>
                    {fmtDate(inv.dueDate)}
                    {overdue && <span className="ml-1 text-[10px]">⚠</span>}
                  </div>

                  {/* Items count */}
                  <div className="text-[13px] text-gray-600 dark:text-gray-400 text-right">
                    {inv.items.length}
                  </div>

                  {/* Total */}
                  <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 text-right font-mono">
                    {fmtCcy(total)}
                  </div>

                  {/* Paid */}
                  <div className={`text-[13px] font-semibold text-right font-mono ${
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
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
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
