import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useSales, useCustomers } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import {
  Sale, SaleItem, SaleStatus, SalePayment, ItemStatus, ITEM_STATUSES,
  SALE_STATUSES, SALE_PAYMENTS,
  getProducts, getCustomers, getProductCategories, getSales, getStock, Product,
  deductStockForSale, restoreStockForSale, getSettings,
} from "@/lib/store";
import { printSaleInvoice } from "@/lib/print-invoice";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Search, X, Save, Trash2, Eye,
  ShoppingCart, Check, RotateCcw, Ban, CreditCard, Banknote,
  ArrowLeft, Minus, Package, ChevronDown, Lock, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";
import { Combobox, ComboOption } from "@/components/combobox";
import { getSettingsCurrencySymbol, fmtMoney } from "@/lib/currencies";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_BG: Record<SaleStatus, string> = {
  Draft:       "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
  Completed:   "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "On Credit": "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  Refunded:    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Cancelled:   "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
};

const ITEM_STATUS_STYLE: Record<ItemStatus, string> = {
  Reserved:  "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50",
  Delivered: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50",
  Pending:   "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50",
};

const PAYMENT_ICON: Record<SalePayment, React.ReactNode> = {
  Cash:            <Banknote size={12} className="text-emerald-500" />,
  Card:            <CreditCard size={12} className="text-blue-500" />,
  "Bank Transfer": <CreditCard size={12} className="text-violet-500" />,
  Cheque:          <Receipt size={12} className="text-gray-500" />,
  Credit:          <CreditCard size={12} className="text-orange-500" />,
};

const lineTotal = (item: SaleItem): number => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  const d = parseFloat(item.discount) || 0;
  return q * p * (1 - d / 100);
};

const saleTotal    = (items: SaleItem[]): number => items.reduce((s, i) => s + lineTotal(i), 0);
const discountTotal = (items: SaleItem[]): number =>
  items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0, p = parseFloat(i.unitPrice) || 0, d = parseFloat(i.discount) || 0;
    return s + q * p * (d / 100);
  }, 0);
const subTotal = (items: SaleItem[]): number =>
  items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);

const blankSaleItem = (): SaleItem => ({
  id: crypto.randomUUID(), productName: "", sku: "", qty: "1",
  unit: "pcs", unitPrice: "0.00", discount: "0", notes: "", itemStatus: "Reserved",
});

const blankSale = (): Omit<Sale, "id" | "saleNumber" | "createdAt" | "updatedAt"> => ({
  saleDate: new Date().toISOString().slice(0, 10),
  customer: "", status: "Draft", paymentMethod: "Cash", notes: "", items: [],
  taxRate: "0", amountPaid: "0", paidAt: "", stockDeducted: false,
});

const blankNewRow = (): Record<string, string> => ({
  saleDate: new Date().toISOString().slice(0, 10),
  customer: "", status: "Draft", paymentMethod: "Cash", notes: "",
});

// ─── Category colour palette (cycles) ────────────────────────────────────────
const CAT_COLOURS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
];

// ─── Tiny avatar / thumbnail ──────────────────────────────────────────────────
const AVATAR_COLOURS = [
  "bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500",
  "bg-pink-500","bg-cyan-500","bg-rose-500","bg-indigo-500",
];

function ProductThumbnail({ product, size = "full" }: { product: Product; size?: "full" | "sm" }) {
  const colIdx = product.name.charCodeAt(0) % AVATAR_COLOURS.length;
  const bg = AVATAR_COLOURS[colIdx];
  const letter = product.name.charAt(0).toUpperCase();
  if (product.thumbnail) {
    return (
      <img
        src={product.thumbnail}
        alt={product.name}
        className={`${size === "full" ? "w-full h-full" : "w-9 h-9"} object-cover rounded-lg`}
      />
    );
  }
  return (
    <div className={`${size === "full" ? "w-full h-full" : "w-9 h-9"} ${bg} flex items-center justify-center rounded-lg`}>
      <span className={`${size === "full" ? "text-3xl" : "text-base"} font-bold text-white/80`}>{letter}</span>
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
interface PaymentModalProps {
  saleNumber: string;
  billedAmount: number;
  discountAmt: number;
  afterDiscount: number;
  defaultPaymentMethod?: SalePayment;
  onConfirm: (amountPaid: string, taxRate: string, paymentMethod: SalePayment) => void;
  onCancel: () => void;
}

const PAY_METHOD_META: { method: SalePayment; icon: React.ReactNode; color: string; ring: string }[] = [
  { method: "Cash",            icon: <Banknote  size={26} />, color: "text-emerald-600 bg-emerald-50  dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-700", ring: "ring-emerald-500" },
  { method: "Card",            icon: <CreditCard size={26} />, color: "text-blue-600    bg-blue-50     dark:bg-blue-950/40    border-blue-200    dark:border-blue-700",    ring: "ring-blue-500"    },
  { method: "Bank Transfer",   icon: <CreditCard size={26} />, color: "text-violet-600  bg-violet-50   dark:bg-violet-950/40  border-violet-200  dark:border-violet-700",  ring: "ring-violet-500"  },
  { method: "Cheque",          icon: <Receipt    size={26} />, color: "text-gray-600    bg-gray-50     dark:bg-zinc-800       border-gray-200    dark:border-zinc-700",     ring: "ring-gray-400"    },
  { method: "Credit",          icon: <CreditCard size={26} />, color: "text-orange-600  bg-orange-50   dark:bg-orange-950/40  border-orange-200  dark:border-orange-700",  ring: "ring-orange-500"  },
];

function PaymentModal({ saleNumber, billedAmount, discountAmt, afterDiscount, defaultPaymentMethod = "Cash", onConfirm, onCancel }: PaymentModalProps) {
  const [taxRate,    setTaxRate]    = useState("0");
  const [payAmount,  setPayAmount]  = useState("0");
  const [payMethod,  setPayMethod]  = useState<SalePayment>(defaultPaymentMethod);

  const taxPct   = Math.max(0, parseFloat(taxRate) || 0);
  const taxAmt   = afterDiscount * taxPct / 100;
  const total    = afterDiscount + taxAmt;
  const paid     = parseFloat(payAmount) || 0;
  const remaining = total - paid;
  const overPaid  = paid > total;

  const sym = getSettingsCurrencySymbol();
  const fmt = (n: number) => `${sym}${n.toFixed(2)}`;

  const presets = [
    { label: "Exact", value: total.toFixed(2) },
    ...([5, 10, 20, 50, 100, 200].filter(v => v >= Math.ceil(paid)).slice(0, 4).map(v => ({ label: `${sym}${v}`, value: String(Math.min(v, total)) }))),
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Card — extra-wide, compact height */}
      <div className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex">

        {/* ── LEFT PANEL — Order summary ───────────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-gray-100 dark:border-zinc-800">

          {/* Header */}
          <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Payment</div>
            <div className="text-[15px] font-bold text-gray-900 dark:text-gray-100 font-mono tracking-wide">{saleNumber}</div>
          </div>

          {/* Breakdown rows */}
          <div className="px-6 py-4 space-y-3 flex-1">

            {/* Billed Amount */}
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] text-gray-500 dark:text-gray-400">Billed Amount</span>
              <span className="text-[18px] font-bold text-gray-800 dark:text-gray-100 font-mono tabular-nums">
                {fmt(billedAmount)}
              </span>
            </div>

            {/* Discount */}
            {discountAmt > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] text-gray-500 dark:text-gray-400">Discount</span>
                <span className="text-[18px] font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                  −{fmt(discountAmt)}
                </span>
              </div>
            )}

            {/* Tax */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-gray-500 dark:text-gray-400">Tax</span>
                <div className="flex items-center border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={taxRate}
                    onChange={e => setTaxRate(e.target.value)}
                    className="w-12 text-center text-[12px] font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800 outline-none py-1 px-1"
                  />
                  <span className="px-1.5 text-[11px] text-gray-400 bg-gray-50 dark:bg-zinc-700 border-l border-gray-200 dark:border-zinc-700 py-1 select-none">%</span>
                </div>
              </div>
              <span className="text-[18px] font-bold text-gray-800 dark:text-gray-100 font-mono tabular-nums">
                {fmt(taxAmt)}
              </span>
            </div>

            {/* Dashed divider */}
            <div className="border-t-2 border-dashed border-gray-200 dark:border-zinc-700" />

            {/* Total to Pay */}
            <div className="space-y-0.5">
              <div className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total to Pay</div>
              <div className="text-[38px] font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums leading-none">
                {fmt(total)}
              </div>
            </div>
          </div>

          {/* Cancel button — bottom of left panel */}
          <div className="px-6 pb-5 pt-2">
            <button
              onClick={onCancel}
              className="w-full h-10 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-[13px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL — Payment method + input ─────────────────────── */}
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-zinc-800/60">

          {/* Payment method tiles + amount input side by side */}
          <div className="flex flex-1 divide-x divide-gray-100 dark:divide-zinc-700/60">

            {/* Payment method section */}
            <div className="flex-1 px-5 pt-5 pb-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Payment Method</div>
              <div className="grid grid-cols-3 gap-2">
                {PAY_METHOD_META.map(m => {
                  const isSelected = payMethod === m.method;
                  return (
                    <button
                      key={m.method}
                      onClick={() => setPayMethod(m.method)}
                      className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 font-semibold text-[11px] transition-all
                        ${m.color}
                        ${isSelected ? `${m.ring} ring-2 ring-offset-1 shadow-sm scale-[1.03]` : "opacity-70 hover:opacity-100 hover:scale-[1.01]"}`}
                    >
                      {m.icon}
                      <span className="leading-tight text-center">{m.method}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount received section */}
            <div className="flex-1 px-5 pt-5 pb-4 flex flex-col gap-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Amount Received</div>

              {/* Amount input */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[22px] font-black text-gray-400 dark:text-zinc-500 pointer-events-none">{sym}</span>
                <input
                  type="number" min="0" step="0.01"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  onBlur={e => {
                    const v = parseFloat(e.target.value) || 0;
                    setPayAmount(Math.min(v, total).toFixed(2));
                  }}
                  onFocus={e => { if (e.target.value === "0") setPayAmount(""); }}
                  className="w-full pl-10 pr-3 py-3 text-[32px] font-black text-gray-900 dark:text-gray-100 bg-white dark:bg-zinc-700 border-2 border-gray-200 dark:border-zinc-600 rounded-xl outline-none focus:border-blue-400 dark:focus:border-blue-500 font-mono tabular-nums transition-colors"
                />
              </div>

              {/* Quick-amount presets */}
              <div className="grid grid-cols-3 gap-1.5">
                {presets.map(p => (
                  <button
                    key={p.label}
                    onClick={() => setPayAmount(p.value)}
                    className="py-2 text-[12px] font-bold rounded-lg bg-white dark:bg-zinc-700 border-2 border-gray-200 dark:border-zinc-600 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 text-gray-700 dark:text-gray-200 transition-all"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Remaining / fully paid */}
              {remaining > 0.005 ? (
                <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-xl px-4 py-2.5">
                  <span className="text-[12px] font-semibold text-orange-600 dark:text-orange-400">Remaining</span>
                  <span className="text-[22px] font-black text-orange-600 dark:text-orange-400 font-mono tabular-nums leading-none">{fmt(remaining)}</span>
                </div>
              ) : paid > 0 ? (
                <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl px-4 py-2.5">
                  <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">Fully paid</span>
                  <span className="text-[22px] font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums leading-none">{fmt(paid)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Confirm button — full width at bottom */}
          <div className="px-5 pb-5 pt-0">
            <button
              onClick={() => onConfirm(payAmount, taxRate, payMethod)}
              disabled={overPaid}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-200/60 dark:shadow-none"
            >
              <Check size={16} /> Confirm Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── POS Full-Page Layout ─────────────────────────────────────────────────────
interface POSViewProps {
  sale: Sale;
  localItems: SaleItem[];
  localMeta: { customer: string; saleDate: string; paymentMethod: SalePayment; notes: string };
  customerComboOpts: ComboOption[];
  productComboOpts: ComboOption[];
  onClose: () => void;
  onMetaChange: (meta: Partial<{ customer: string; saleDate: string; paymentMethod: SalePayment; notes: string }>) => void;
  onSaveMeta: () => void;
  onItemChange: (itemId: string, field: keyof SaleItem, value: string) => void;
  onItemBlur: () => void;
  onSaveItems: (items: SaleItem[]) => void;
  onDeleteItem: (itemId: string) => void;
  onAddProduct: (product: Product) => void;
  onSetStatus: (status: SaleStatus) => void;
  onComplete: (amountPaid: string, taxRate: string, paymentMethod: SalePayment) => void;
  onAddCustomer: (name: string, phone: string, email: string) => void;
}

function POSView({
  sale, localItems, localMeta, customerComboOpts, productComboOpts,
  onClose, onMetaChange, onSaveMeta, onItemChange, onItemBlur,
  onSaveItems, onDeleteItem, onAddProduct, onSetStatus, onComplete, onAddCustomer,
}: POSViewProps) {
  const [prodSearch,    setProdSearch]    = useState("");
  const [catFilter,     setCatFilter]     = useState("All");
  const [payModalOpen,  setPayModalOpen]  = useState(false);

  // ── Quick-add customer dialog ────────────────────────────────────────────
  const [qaOpen,  setQaOpen]  = useState(false);
  const [qaName,  setQaName]  = useState("");
  const [qaPhone, setQaPhone] = useState("");
  const [qaEmail, setQaEmail] = useState("");

  const customerExists = customerComboOpts.some(
    o => o.value.toLowerCase() === localMeta.customer.toLowerCase().trim()
  );
  const showAddBtn = localMeta.customer.trim().length > 0 && !customerExists;

  const openQuickAdd = () => {
    setQaName(localMeta.customer.trim());
    setQaPhone(""); setQaEmail("");
    setQaOpen(true);
  };

  const confirmQuickAdd = () => {
    if (!qaName.trim()) return;
    onAddCustomer(qaName.trim(), qaPhone.trim(), qaEmail.trim());
    onMetaChange({ customer: qaName.trim() });
    onSaveMeta();
    setQaOpen(false);
  };

  const allProducts  = useMemo(() => getProducts().filter(p => p.status !== "Inactive"), []);
  const allCats      = useMemo(() => {
    const allCategoryRecords = getProductCategories();
    const parentCats = allCategoryRecords.filter(c => !c.parentId).map(c => c.name);
    const fromProds = allProducts.map(p => p.category).filter(Boolean);
    const parentPrefix = (cat: string) => cat.includes(" > ") ? cat.split(" > ")[0] : cat;
    const set = new Set([...parentCats, ...fromProds.map(parentPrefix)]);
    return Array.from(set).sort();
  }, [allProducts]);

  const filteredProds = useMemo(() => {
    let list = allProducts;
    if (catFilter !== "All") {
      list = list.filter(p => {
        if (!p.category) return false;
        const parentName = p.category.includes(" > ") ? p.category.split(" > ")[0] : p.category;
        return parentName === catFilter || p.category === catFilter;
      });
    }
    if (prodSearch.trim()) {
      const q = prodSearch.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allProducts, catFilter, prodSearch]);

  const grandTotal   = localItems.reduce((s, i) => s + lineTotal(i), 0);
  const discountAmt  = discountTotal(localItems);
  const sym          = getSettingsCurrencySymbol();
  const isDraft      = sale.status === "Draft";
  const isCompleted  = sale.status === "Completed";
  const isOnCredit   = sale.status === "On Credit";
  const isCredit     = localMeta.paymentMethod === "Credit";

  // Blue badge on product card showing how many are already in cart
  const cartQtyMap = useMemo(() => {
    const m: Record<string, number> = {};
    localItems.forEach(i => { if (i.sku) m[i.sku] = (m[i.sku] || 0) + (parseFloat(i.qty) || 0); });
    return m;
  }, [localItems]);

  // Stock qty per SKU (sum across all stock entries)
  const stockMap = useMemo(() => {
    const m: Record<string, number> = {};
    getStock().forEach(s => { if (s.sku) m[s.sku] = (m[s.sku] || 0) + (parseFloat(s.quantity) || 0); });
    return m;
  }, []);

  const qtyChange = (itemId: string, delta: number) => {
    const item = localItems.find(i => i.id === itemId);
    if (!item) return;
    const next = Math.max(0, (parseFloat(item.qty) || 0) + delta);
    const newItems = localItems.map(i => i.id === itemId ? { ...i, qty: String(next) } : i);
    onSaveItems(newItems);
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-zinc-950 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-stretch bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">

        {/* Left: back + sale id */}
        <div className="flex items-center gap-2.5 px-3 py-2 border-r border-gray-200 dark:border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div className="w-px h-6 bg-gray-200 dark:bg-zinc-700" />
          <div className="flex flex-col leading-none gap-1">
            <span className="text-[12px] font-bold text-gray-800 dark:text-gray-100 font-mono tracking-wide">{sale.saleNumber}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full self-start ${STATUS_BG[sale.status]}`}>{sale.status}</span>
          </div>
        </div>

        {/* Centre: meta fields */}
        <div className="flex items-center gap-4 px-4 py-2 flex-1 min-w-0 overflow-x-auto">

          {/* CUSTOMER */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Customer</span>
            <div className="flex items-center gap-1">
              <Combobox
                value={localMeta.customer}
                onChange={v => onMetaChange({ customer: v })}
                onSelect={opt => { onMetaChange({ customer: opt.value }); onSaveMeta(); }}
                options={customerComboOpts}
                placeholder="Walk-in…"
                maxResults={50}
                className="w-48"
                inputClassName="border-0 border-b-2 border-gray-200 dark:border-zinc-700 px-0 pb-0.5 text-[13px] font-semibold text-gray-700 dark:text-gray-200 bg-transparent w-48 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-gray-300"
              />
              {showAddBtn && (
                <button
                  onClick={openQuickAdd}
                  title="Add this customer"
                  className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors mb-0.5"
                >
                  <Plus size={11} />
                </button>
              )}
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-zinc-700 shrink-0" />

          {/* DATE */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Date</span>
            <input type="date"
              value={localMeta.saleDate}
              onChange={e => onMetaChange({ saleDate: e.target.value })}
              onBlur={onSaveMeta}
              className="border-0 border-b-2 border-gray-200 dark:border-zinc-700 px-0 pb-0.5 text-[13px] font-semibold text-gray-700 dark:text-gray-200 bg-transparent focus:outline-none focus:border-blue-500 transition-colors w-36"
            />
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-zinc-700 shrink-0" />

          {/* PAYMENT METHOD + AMOUNT */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Payment</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 shrink-0 text-base leading-none">{PAYMENT_ICON[localMeta.paymentMethod]}</span>
              <div className="relative flex items-center">
                <select
                  value={localMeta.paymentMethod}
                  onChange={e => { onMetaChange({ paymentMethod: e.target.value as SalePayment }); onSaveMeta(); }}
                  className="appearance-none border-0 border-b-2 border-gray-200 dark:border-zinc-700 pl-0 pr-5 pb-0.5 text-[13px] font-semibold text-gray-700 dark:text-gray-200 bg-transparent focus:outline-none focus:border-blue-500 transition-colors"
                >
                  {SALE_PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown size={10} className="absolute right-0 bottom-1 text-gray-400 pointer-events-none" />
              </div>
              <span className="text-[13px] font-bold text-blue-600 dark:text-blue-400 pl-2 border-l border-gray-200 dark:border-zinc-700">
                {sym}{grandTotal.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-zinc-700 shrink-0" />

          {/* NOTES — flex-1 takes remaining space */}
          <div className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Notes</span>
            <input
              value={localMeta.notes}
              onChange={e => onMetaChange({ notes: e.target.value })}
              onBlur={onSaveMeta}
              placeholder="Optional…"
              className="border-0 border-b-2 border-gray-200 dark:border-zinc-700 px-0 pb-0.5 text-[13px] text-gray-700 dark:text-gray-200 bg-transparent focus:outline-none focus:border-blue-500 transition-colors placeholder:text-gray-300 dark:placeholder:text-zinc-600 w-full"
            />
          </div>
        </div>

        {/* Right: timestamps */}
        <div className="px-4 py-2 flex flex-col justify-center text-right border-l border-gray-100 dark:border-zinc-800 shrink-0 gap-1.5">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Created</div>
            <div className="text-[11px] font-semibold text-gray-500 font-mono mt-0.5">
              {new Date(sale.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          {sale.paidAt ? (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">Paid at</div>
              <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                {new Date(sale.paidAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Updated</div>
              <div className="text-[11px] font-semibold text-gray-400 font-mono mt-0.5">
                {new Date(sale.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body: two panels ────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ LEFT: Cart ══════════════════════════════════════════════════════ */}
        <div className="w-[56%] flex flex-col border-r border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950">

          {/* Cart sub-header */}
          <div className="px-5 py-2.5 bg-gray-50 dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart size={14} className="text-blue-500" />
              <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Order Items</span>
              {localItems.length > 0 && (
                <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold px-2 py-0 rounded-full">{localItems.length}</span>
              )}
            </div>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <Lock size={9} /> Catalogue only
            </span>
          </div>

          {/* Cart rows — scrollable */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-950">
            {localItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-zinc-700 gap-4 py-20">
                <ShoppingCart size={52} strokeWidth={0.9} />
                <div className="text-center space-y-1">
                  <p className="text-[14px] font-semibold text-gray-400 dark:text-zinc-500">
                    {isDraft ? "Cart is empty" : "No items recorded"}
                  </p>
                  {isDraft && (
                    <p className="text-[12px] text-gray-300 dark:text-zinc-600">
                      Tap a product on the right to add it here
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                {localItems.map((item, idx) => {
                  const prod = getProducts().find(p => p.name === item.productName || p.sku === item.sku);
                  return (
                    <div key={item.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/80 dark:hover:bg-zinc-900/50 transition-colors group">

                      {/* Row number */}
                      <span className="text-[12px] text-gray-300 dark:text-zinc-700 w-5 text-center shrink-0 font-medium">{idx + 1}</span>

                      {/* Thumbnail */}
                      <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 ring-1 ring-gray-100 dark:ring-zinc-800">
                        <ProductThumbnail product={prod ?? { name: item.productName, sku: item.sku } as Product} size="sm" />
                      </div>

                      {/* Product name + unit + stock + item status */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-bold text-gray-900 dark:text-gray-100 truncate leading-tight">{item.productName || "—"}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {item.unit && (
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">
                              {item.unit}
                            </span>
                          )}
                          {(() => {
                            const avail = item.sku ? (stockMap[item.sku] ?? null) : null;
                            if (avail === null) return null;
                            const low = avail <= 5;
                            return (
                              <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                                low
                                  ? "bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400"
                                  : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                              }`}>
                                Stock: {avail}
                              </span>
                            );
                          })()}
                          {/* Item delivery status — clickable pill cycles through states */}
                          <button
                            title="Click to change delivery status"
                            onClick={() => {
                              const cur = (item.itemStatus as ItemStatus) || "Reserved";
                              const next = ITEM_STATUSES[(ITEM_STATUSES.indexOf(cur) + 1) % ITEM_STATUSES.length];
                              onItemChange(item.id, "itemStatus", next);
                              onItemBlur();
                            }}
                            className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md cursor-pointer select-none transition-colors ${ITEM_STATUS_STYLE[(item.itemStatus as ItemStatus) || "Reserved"]}`}
                          >
                            {item.itemStatus || "Reserved"}
                          </button>
                        </div>
                      </div>

                      {/* Qty stepper */}
                      <div className="shrink-0 flex items-center">
                        {isDraft ? (
                          <div className="flex items-center border-2 border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                            <button
                              onClick={() => qtyChange(item.id, -1)}
                              className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-700 transition-colors"
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number" min="0"
                              value={item.qty}
                              onChange={e => onItemChange(item.id, "qty", e.target.value)}
                              onBlur={onItemBlur}
                              className="w-12 h-9 text-center text-[15px] font-bold text-gray-800 dark:text-gray-100 bg-white dark:bg-zinc-800 outline-none border-x-2 border-gray-200 dark:border-zinc-700 focus:bg-blue-50 dark:focus:bg-blue-950/20"
                            />
                            <button
                              onClick={() => qtyChange(item.id, 1)}
                              className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 transition-colors"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[15px] font-bold text-gray-600 dark:text-gray-300 w-14 text-center">×{item.qty}</span>
                        )}
                      </div>

                      {/* Unit price */}
                      <div className="shrink-0 w-[88px]">
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1 font-bold">Unit {sym}</div>
                        <input
                          type="number" min="0" step="0.01"
                          value={item.unitPrice}
                          onChange={e => onItemChange(item.id, "unitPrice", e.target.value)}
                          onBlur={onItemBlur}
                          disabled={!isDraft}
                          className="w-full text-[15px] font-bold text-right text-gray-800 dark:text-gray-100 bg-transparent outline-none disabled:pointer-events-none border-b-2 border-gray-200 dark:border-zinc-700 focus:border-blue-400 dark:focus:border-blue-500 transition-colors pb-0.5"
                        />
                      </div>

                      {/* Discount */}
                      <div className="shrink-0 w-[62px]">
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1 font-bold">Disc %</div>
                        <input
                          type="number" min="0" max="100"
                          value={item.discount}
                          onChange={e => onItemChange(item.id, "discount", e.target.value)}
                          onBlur={onItemBlur}
                          disabled={!isDraft}
                          className="w-full text-[15px] font-bold text-right text-gray-800 dark:text-gray-100 bg-transparent outline-none disabled:pointer-events-none border-b-2 border-gray-200 dark:border-zinc-700 focus:border-blue-400 dark:focus:border-blue-500 transition-colors pb-0.5"
                        />
                      </div>

                      {/* Subtotal */}
                      <div className="shrink-0 w-[88px] text-right">
                        <div className="text-[18px] font-extrabold font-mono tabular-nums text-gray-900 dark:text-gray-100 leading-tight">
                          {sym}{lineTotal(item).toFixed(2)}
                        </div>
                        {parseFloat(item.discount) > 0 && (
                          <div className="text-[11px] font-semibold text-emerald-500 dark:text-emerald-400 font-mono">
                            −{sym}{((parseFloat(item.qty)||0)*(parseFloat(item.unitPrice)||0)*(parseFloat(item.discount)||0)/100).toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => isDraft && onDeleteItem(item.id)}
                        disabled={!isDraft}
                        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isDraft ? "text-gray-300 dark:text-zinc-700 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" : "opacity-0 pointer-events-none"}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Totals + Actions ─────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="px-5 pt-3.5 pb-2 space-y-1.5">
              <div className="flex justify-between text-[12px] text-gray-500 dark:text-gray-400">
                <span>Subtotal ({localItems.length} item{localItems.length !== 1 ? "s" : ""})</span>
                <span className="font-mono font-semibold">{sym}{subTotal(localItems).toFixed(2)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-[12px] text-emerald-600 dark:text-emerald-400">
                  <span>Discount savings</span>
                  <span className="font-mono font-semibold">−{sym}{discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-zinc-800">
                <span className="text-[14px] font-bold text-gray-600 dark:text-gray-300">Total to Pay</span>
                <span className="text-[26px] font-black font-mono tabular-nums text-blue-600 dark:text-blue-400 leading-none">
                  {sym}{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="px-5 pb-4 space-y-2">
              {isDraft && (
                <>
                  {/* Credit sale notice */}
                  {isCredit && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                      <CreditCard size={13} className="text-orange-500 shrink-0" />
                      <span className="text-[11px] text-orange-700 dark:text-orange-300 font-medium">
                        Credit sale — goods released now, payment collected later.
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => isCredit ? (onSetStatus("On Credit"), onClose()) : setPayModalOpen(true)}
                    className={`w-full h-12 rounded-xl text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] ${
                      isCredit
                        ? "bg-orange-500 hover:bg-orange-600 shadow-orange-200 dark:shadow-none"
                        : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 dark:shadow-none"
                    }`}
                  >
                    {isCredit ? <><CreditCard size={17} /> Issue on Credit</> : <><Check size={17} /> Complete &amp; Pay</>}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={onClose}
                      className="flex-1 h-9 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-[12px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Save size={13} /> Save Draft
                    </button>
                    <button
                      onClick={() => onSetStatus("Cancelled")}
                      className="h-9 px-3 rounded-xl border-2 border-red-100 dark:border-red-900/50 text-[12px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5 transition-colors"
                    >
                      <Ban size={13} /> Void
                    </button>
                  </div>
                </>
              )}
              {isOnCredit && (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                    <CreditCard size={13} className="text-orange-500 shrink-0" />
                    <span className="text-[11px] text-orange-700 dark:text-orange-300 font-medium">
                      Payment outstanding — mark as paid when customer settles.
                    </span>
                  </div>
                  <button
                    onClick={() => setPayModalOpen(true)}
                    className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-[14px] flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-200 dark:shadow-none"
                  >
                    <Check size={16} /> Mark as Paid
                  </button>
                  <button
                    onClick={() => { try { printSaleInvoice(sale, getSettings()); } catch { /* blocked */ } }}
                    className="w-full h-10 rounded-xl border-2 border-blue-200 dark:border-blue-800 text-[13px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Printer size={14} /> Print Invoice
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSetStatus("Refunded")}
                      className="flex-1 h-9 rounded-xl border-2 border-amber-200 dark:border-amber-800 text-[12px] font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center justify-center gap-2 transition-colors"
                    >
                      <RotateCcw size={13} /> Refund
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 h-9 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-[12px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
              {isCompleted && (
                <div className="space-y-2">
                  <button
                    onClick={() => { try { printSaleInvoice(sale, getSettings()); } catch { /* blocked */ } }}
                    className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-[14px] flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-200 dark:shadow-none"
                  >
                    <Printer size={16} /> Print Invoice
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSetStatus("Refunded")}
                      className="flex-1 h-10 rounded-xl border-2 border-amber-200 dark:border-amber-800 text-[13px] font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center justify-center gap-2 transition-colors"
                    >
                      <RotateCcw size={14} /> Refund
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 h-10 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-[13px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
              {(sale.status === "Refunded" || sale.status === "Cancelled") && (
                <button
                  onClick={onClose}
                  className="w-full h-10 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-[13px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Product Catalogue ══════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-zinc-950 overflow-hidden">

          {/* Search + filters */}
          <div className="px-4 pt-3 pb-3 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 space-y-2.5 shrink-0">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={prodSearch}
                onChange={e => setProdSearch(e.target.value)}
                placeholder="Search by name or SKU…"
                className="w-full pl-9 pr-8 py-2.5 text-[13px] border-2 border-gray-200 dark:border-zinc-700 rounded-xl bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-0 focus:border-blue-400 focus:bg-white dark:focus:bg-zinc-700 transition-all placeholder:text-gray-400 dark:placeholder:text-zinc-500"
              />
              {prodSearch && (
                <button
                  onClick={() => setProdSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 dark:bg-zinc-600 hover:bg-gray-400 dark:hover:bg-zinc-500 flex items-center justify-center transition-colors"
                >
                  <X size={10} className="text-white" />
                </button>
              )}
            </div>

            {/* Category pills */}
            {allCats.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {["All", ...allCats].map((cat, i) => {
                  const isActive = catFilter === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCatFilter(prev => prev === cat && cat !== "All" ? "All" : cat)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                        cat === "All"
                          ? isActive
                            ? "bg-gray-800 dark:bg-white text-white dark:text-gray-900 shadow-sm"
                            : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                          : `${CAT_COLOURS[(i-1) % CAT_COLOURS.length]} ${isActive ? "ring-2 ring-offset-1 ring-blue-400 opacity-100" : "opacity-55 hover:opacity-90"}`
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="text-[11px] text-gray-400 font-medium">
              {filteredProds.length} product{filteredProds.length !== 1 ? "s" : ""}
              {!isDraft && <span className="ml-2 text-amber-500">(view only — sale is {sale.status})</span>}
            </div>
          </div>

          {/* Product grid — scrollable */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredProds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-300 dark:text-zinc-600 gap-3">
                <Package size={40} strokeWidth={1} />
                <div className="text-center space-y-1">
                  <p className="text-[13px] font-semibold text-gray-400 dark:text-zinc-500">No products found</p>
                  {prodSearch && (
                    <p className="text-[11px] text-gray-300 dark:text-zinc-600">
                      Try a different name or SKU, or{" "}
                      <button onClick={() => setProdSearch("")} className="text-blue-500 hover:underline">clear search</button>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 content-start">
                {filteredProds.map((product) => {
                  const catIdx   = allCats.indexOf(product.category);
                  const catColor = catIdx >= 0 ? CAT_COLOURS[catIdx % CAT_COLOURS.length] : CAT_COLOURS[0];
                  const inCart   = cartQtyMap[product.sku] || 0;
                  const stockQty = stockMap[product.sku] ?? null;
                  const lowStock = stockQty !== null && stockQty <= 5;
                  return (
                    <button
                      key={product.id}
                      disabled={!isDraft}
                      onClick={() => onAddProduct(product)}
                      title={isDraft ? `Add ${product.name}` : `Sale is ${sale.status}`}
                      className={`group relative text-left bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden flex flex-col transition-all ${
                        isDraft
                          ? inCart > 0
                            ? "border-blue-300 dark:border-blue-700 hover:border-blue-400 hover:shadow-sm cursor-pointer active:scale-[0.98]"
                            : "border-gray-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm cursor-pointer active:scale-[0.98]"
                          : "border-gray-100 dark:border-zinc-800 opacity-40 cursor-not-allowed"
                      }`}
                    >
                      {/* In-cart badge */}
                      {inCart > 0 && (
                        <div className="absolute top-1.5 right-1.5 z-10 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {inCart}
                        </div>
                      )}

                      {/* Thumbnail — square, compact */}
                      <div className="aspect-square w-full overflow-hidden bg-gray-100 dark:bg-zinc-800">
                        <ProductThumbnail product={product} size="full" />
                      </div>

                      {/* Info */}
                      <div className="p-1.5 flex flex-col gap-0.5">
                        <div className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-tight">
                          {product.name}
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            {getSettingsCurrencySymbol()}{parseFloat(product.price || "0").toFixed(2)}
                          </span>
                          {product.category && (
                            <span className={`text-[8px] font-semibold px-1 py-0.5 rounded-full truncate max-w-[44px] ${catColor}`}>
                              {product.category}
                            </span>
                          )}
                        </div>
                        {/* Stock qty */}
                        <div className={`text-[9px] font-medium ${stockQty === null ? "text-gray-300 dark:text-zinc-700" : lowStock ? "text-amber-500" : "text-gray-400"}`}>
                          {stockQty === null ? "No stock data" : lowStock ? `⚠ ${stockQty} left` : `${stockQty} in stock`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Payment Modal */}
    {payModalOpen && (
      <PaymentModal
        saleNumber={sale.saleNumber}
        billedAmount={subTotal(localItems)}
        discountAmt={discountAmt}
        afterDiscount={grandTotal}
        defaultPaymentMethod={localMeta.paymentMethod}
        onConfirm={(amountPaid, taxRate, paymentMethod) => {
          setPayModalOpen(false);
          onComplete(amountPaid, taxRate, paymentMethod);
        }}
        onCancel={() => setPayModalOpen(false)}
      />
    )}

    {/* ── Quick-add Customer Dialog ─────────────────────────────────────── */}
    <Dialog open={qaOpen} onOpenChange={v => !v && setQaOpen(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus size={16} className="text-blue-600" /> Add New Customer
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Name *</label>
            <Input value={qaName} onChange={e => setQaName(e.target.value)} placeholder="Full name" autoFocus className="h-9 text-[13px]" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Phone</label>
            <Input value={qaPhone} onChange={e => setQaPhone(e.target.value)} placeholder="+44 7xxx xxxxxx" className="h-9 text-[13px]" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Email</label>
            <Input value={qaEmail} onChange={e => setQaEmail(e.target.value)} placeholder="email@example.com" className="h-9 text-[13px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setQaOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={!qaName.trim()} onClick={confirmQuickAdd} className="gap-1.5">
            <Plus size={13} /> Add Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Main SalesPage component ─────────────────────────────────────────────────
export default function SalesPage() {
  const [location, navigate] = useLocation();
  const isNewSale = location.includes("/new");
  const { sales, addSale, editSale, removeSale } = useSales();
  const { customers, addCustomer } = useCustomers();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const products          = useMemo(() => getProducts(), []);
  const customerComboOpts = useMemo<ComboOption[]>(() =>
    customers.map(c => ({
      value: c.name,
      label: c.name,
      sub: [c.phone, c.email].filter(Boolean).join("  ·  "),
    })),
  [customers]);
  const productComboOpts  = useMemo<ComboOption[]>(() => getProducts().map(p => ({ value: p.name, label: p.name, sub: p.sku, tag: p.category })), []);
  const sym               = useMemo(() => getSettingsCurrencySymbol(), []);

  // ── List state ──
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [search,       setSearch]       = useState("");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [newRow,       setNewRow]       = useState<Record<string, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // ── POS state ──
  const [detailId,    setDetailId]   = useState<string | null>(null);
  const [localItems,  setLocalItems] = useState<SaleItem[]>([]);
  const [localMeta,   setLocalMeta]  = useState<{ customer: string; saleDate: string; paymentMethod: SalePayment; notes: string } | null>(null);

  // Refs so callbacks always see latest values without stale-closure issues
  const localItemsRef = useRef<SaleItem[]>(localItems);
  const localMetaRef  = useRef(localMeta);
  useEffect(() => { localItemsRef.current = localItems; }, [localItems]);
  useEffect(() => { localMetaRef.current  = localMeta;  }, [localMeta]);

  // ── COLS ──
  const COLS: ColDef[] = useMemo(() => [
    { field: "saleNumber",    label: "Sale #",          minW: 145, type: "readonly" },
    { field: "saleDate",      label: "Date",            minW: 130, type: "date"     },
    { field: "customer",      label: "Customer",        minW: 200, type: "text"     },
    { field: "status",        label: "Status",          minW: 130, type: "select",  options: [...SALE_STATUSES] },
    { field: "itemCount",     label: "Items",           minW: 60,  type: "readonly" },
    { field: "total",         label: `Total (${sym})`,   minW: 110, type: "readonly" },
    { field: "amountPaid",    label: `Paid (${sym})`,   minW: 110, type: "readonly" },
    { field: "balance",       label: `Balance (${sym})`,minW: 110, type: "readonly" },
    { field: "payStatus",     label: "Pay Status",      minW: 100, type: "readonly" },
    { field: "paymentMethod", label: "Payment",         minW: 140, type: "select",  options: [...SALE_PAYMENTS] },
    { field: "notes",         label: "Notes",           minW: 230, type: "text"     },
  ], [sym]);
  const TOTAL_W = useMemo(() => COLS.reduce((a, c) => a + c.minW, 0), [COLS]);

  const cellValue = (sale: Sale, field: string): string => {
    if (field === "itemCount") {
      const totalQty = sale.items.reduce((sum, i) => sum + (parseFloat(i.qty) || 0), 0);
      return Number.isInteger(totalQty) ? String(totalQty) : totalQty.toFixed(1);
    }
    if (field === "total")     return saleTotal(sale.items).toFixed(2);
    if (field === "balance") {
      const total = saleTotal(sale.items);
      const paid  = parseFloat(sale.amountPaid || "0");
      return Math.max(0, total - paid).toFixed(2);
    }
    if (field === "payStatus") {
      if (sale.status === "Cancelled" || sale.status === "Refunded" || sale.status === "Draft") return "N/A";
      if (sale.status === "On Credit") return "On Credit";
      const total = saleTotal(sale.items);
      const paid  = parseFloat(sale.amountPaid || "0");
      if (paid >= total && total > 0) return "Paid";
      if (paid > 0)                   return "Partial";
      return "Unpaid";
    }
    return String((sale as unknown as Record<string, string>)[field] ?? "");
  };

  // ── Auto-open POS for /sales/new ──
  useEffect(() => {
    if (isNewSale && isAuthenticated) {
      const draft = addSale(blankSale());
      openDetailDirect(draft);
      navigate("/sales", { replace: true });
    }
  }, [isNewSale, isAuthenticated]);

  // ── Open POS — accepts a Sale object directly (avoids stale-state lookup) ──
  const openDetailDirect = useCallback((sale: Sale) => {
    setLocalItems([...sale.items]);
    setLocalMeta({ customer: sale.customer, saleDate: sale.saleDate, paymentMethod: sale.paymentMethod, notes: sale.notes });
    setDetailId(sale.id);
  }, []);

  const openDetail = (id: string) => {
    // Try current React state first; fall back to a fresh localStorage read
    // for a just-created sale that hasn't propagated to state yet.
    const sale = sales.find(s => s.id === id) ?? getSales().find(s => s.id === id);
    if (!sale) { setDetailId(id); return; }
    openDetailDirect(sale);
  };

  const detailSale = sales.find(s => s.id === detailId);

  useEffect(() => {
    if (detailId && !localMeta) {
      const sale = sales.find(s => s.id === detailId);
      if (sale) {
        setLocalItems([...sale.items]);
        setLocalMeta({ customer: sale.customer, saleDate: sale.saleDate, paymentMethod: sale.paymentMethod, notes: sale.notes });
      }
    }
  }, [detailId, sales]);

  const saveMeta = useCallback(() => {
    if (!detailId || !localMeta) return;
    editSale(detailId, { ...localMeta, items: localItems });
  }, [detailId, localMeta, localItems, editSale]);

  const saveItems = useCallback((items: SaleItem[]) => {
    const meta = localMetaRef.current;
    if (!detailId || !meta) return;
    setLocalItems(items);
    localItemsRef.current = items;
    editSale(detailId, { ...meta, items });
  }, [detailId, editSale]);

  // ── Add product from right panel ──
  const handleAddProductFromCatalogue = useCallback((product: Product) => {
    const current = localItemsRef.current;
    const existing = current.find(i => i.sku === product.sku);
    if (existing) {
      const next = current.map(i =>
        i.sku === product.sku
          ? { ...i, qty: String((parseFloat(i.qty) || 0) + 1) }
          : i
      );
      saveItems(next);
    } else {
      const item: SaleItem = {
        ...blankSaleItem(),
        productName: product.name,
        sku: product.sku,
        unit: product.unit || "pcs",
        unitPrice: product.price || "0.00",
      };
      saveItems([...current, item]);
      toast({ title: `${product.name} added` });
    }
  }, [saveItems, toast]);

  const handleItemFieldChange = (itemId: string, field: keyof SaleItem, value: string) => {
    setLocalItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
  };

  const handleItemBlur = () => {
    const meta = localMetaRef.current;
    if (detailId && meta) editSale(detailId, { ...meta, items: localItemsRef.current });
  };

  const handleDeleteItem = (itemId: string) => saveItems(localItemsRef.current.filter(i => i.id !== itemId));

  const setStatus = (status: SaleStatus) => {
    if (!detailId || !localMeta) return;
    const wasDeducted = detailSale?.stockDeducted ?? false;
    let stockDeducted = wasDeducted;

    if (status === "On Credit" && !wasDeducted) {
      deductStockForSale(localItems);
      stockDeducted = true;
    }
    if ((status === "Refunded" || status === "Cancelled") && wasDeducted) {
      restoreStockForSale(localItems);
      stockDeducted = false;
    }

    editSale(detailId, { ...localMeta, status, items: localItems, stockDeducted });
    toast({ title: status === "Completed" ? "Sale completed!" : status === "On Credit" ? "Issued on credit" : status === "Refunded" ? "Sale refunded" : "Sale cancelled" });
  };

  const closePOS = () => {
    saveMeta();
    setDetailId(null);
    setLocalMeta(null);
    setLocalItems([]);
  };

  const handleComplete = (amountPaid: string, taxRate: string, paymentMethod: SalePayment) => {
    if (!detailId || !localMeta) return;

    // Deduct stock only if not already done (avoids double-deduction on re-payment)
    if (!(detailSale?.stockDeducted ?? false)) {
      deductStockForSale(localItems);
    }

    const completedSale = editSale(detailId, {
      ...localMeta,
      paymentMethod,
      status: "Completed",
      items: localItems,
      amountPaid,
      taxRate,
      paidAt: new Date().toISOString(),
      stockDeducted: true,
    });

    toast({ title: "Sale completed!", description: `${sym}${parseFloat(amountPaid || "0").toFixed(2)} received` });

    // Open print invoice window
    try { printSaleInvoice(completedSale, getSettings()); } catch { /* ignore popup blockers */ }

    closePOS();
  };

  // ── List filtering ──
  const filtered = useMemo(() => {
    let rows = [...sales];
    if (statusFilter !== "All") rows = rows.filter(s => s.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        s.saleNumber.toLowerCase().includes(q) ||
        s.customer.toLowerCase().includes(q) ||
        s.notes.toLowerCase().includes(q),
      );
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales, statusFilter, search]);

  const counts: Record<string, number> = useMemo(() => {
    const c: Record<string, number> = { All: sales.length };
    SALE_STATUSES.forEach(s => { c[s] = sales.filter(x => x.status === s).length; });
    return c;
  }, [sales]);

  const revenue = useMemo(() =>
    sales.filter(s => s.status === "Completed").reduce((sum, s) => sum + saleTotal(s.items), 0), [sales]);

  const filteredSums = useMemo(() => ({
    items:   filtered.reduce((s, sale) => s + sale.items.reduce((q, i) => q + (parseFloat(i.qty) || 0), 0), 0),
    total:   filtered.reduce((s, sale) => s + saleTotal(sale.items), 0),
    paid:    filtered.reduce((s, sale) => s + (parseFloat(sale.amountPaid || "0") || 0), 0),
    balance: filtered.reduce((s, sale) => s + Math.max(0, saleTotal(sale.items) - (parseFloat(sale.amountPaid || "0") || 0)), 0),
  }), [filtered]);

  // ── Grid handlers ──
  const commitCell = useCallback((id: string, field: string, value: string) => {
    const sale = sales.find(s => s.id === id);
    if (!sale || cellValue(sale, field) === value) { setActiveCell(null); return; }
    editSale(id, { [field]: value } as Partial<Sale>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [sales, editSale, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const ids = filtered.map(s => s.id);
    const ri = ids.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= ids.length) { setActiveCell(null); return; }
    setActiveCell({ id: ids[nr], col: nc });
  }, [filtered, COLS.length]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const ids = filtered.map(s => s.id);
    const ri = ids.indexOf(id);
    if (ri + 1 >= ids.length) { setActiveCell(null); return; }
    setActiveCell({ id: ids[ri + 1], col });
  }, [filtered]);

  const navigateNewRow = (col: number, shift: boolean) => {
    let nc = col + (shift ? -1 : 1);
    if (nc >= COLS.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow) return;
    const sale = addSale({
      saleDate: newRow.saleDate || new Date().toISOString().slice(0, 10),
      customer: newRow.customer, status: (newRow.status as SaleStatus) || "Draft",
      paymentMethod: (newRow.paymentMethod as SalePayment) || "Cash",
      notes: newRow.notes, items: [], taxRate: "0", amountPaid: "0",
      paidAt: "", stockDeducted: false,
    });
    toast({ title: "Sale created", description: `${sale.saleNumber} saved` });
    setNewRow(null); setNewRowActive(null);
    openDetailDirect(sale);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => { if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pillColors: Record<string, { base: string; active: string }> = {
    All:       { base: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",               active: "ring-2 ring-gray-400"    },
    Draft:     { base: "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400",                active: "ring-2 ring-gray-400"    },
    Completed: { base: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300", active: "ring-2 ring-emerald-500" },
    Refunded:  { base: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",         active: "ring-2 ring-amber-400"   },
    Cancelled: { base: "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400",                 active: "ring-2 ring-red-500"     },
  };

  // ─── If POS is open, render full-page POS ───────────────────────────────────
  if (detailId && detailSale && localMeta) {
    return (
      <POSView
        sale={detailSale}
        localItems={localItems}
        localMeta={localMeta}
        customerComboOpts={customerComboOpts}
        productComboOpts={productComboOpts}
        onClose={closePOS}
        onMetaChange={patch => setLocalMeta(m => m ? { ...m, ...patch } : m)}
        onSaveMeta={saveMeta}
        onItemChange={handleItemFieldChange}
        onItemBlur={handleItemBlur}
        onSaveItems={saveItems}
        onDeleteItem={handleDeleteItem}
        onAddProduct={handleAddProductFromCatalogue}
        onSetStatus={setStatus}
        onComplete={handleComplete}
        onAddCustomer={(name, phone, email) => {
          addCustomer({
            name, phone, email,
            company: "", industry: "", city: "", status: "Active",
            source: "direct", customerSince: new Date().toISOString().slice(0, 10),
            totalValue: "0", currency: "GBP", notes: "", tags: [],
          });
          toast({ title: "Customer added", description: `"${name}" added to Customers.` });
        }}
      />
    );
  }

  // ─── Sales list ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt size={22} className="text-zinc-500" /> Sales
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Click any cell to edit · Click <Eye size={11} className="inline" /> to open POS terminal
          </p>
        </div>
        {isAuthenticated && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setNewRow(blankNewRow()); setNewRowActive(0); }} className="gap-1.5" disabled={!!newRow} data-testid="btn-new-sale-row">
              <Plus size={14} /> New Sale
            </Button>
            <Button size="sm" onClick={() => { const s = addSale(blankSale()); openDetailDirect(s); }} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <ShoppingCart size={14} /> Open POS
            </Button>
          </div>
        )}
      </div>

      {/* KPI pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {["All", ...SALE_STATUSES].map(s => {
          const isActive = statusFilter === s;
          const colors = pillColors[s] ?? pillColors["All"];
          return (
            <button key={s} aria-pressed={isActive}
              onClick={() => setStatusFilter(prev => prev === s && s !== "All" ? "All" : s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] ${colors.base} ${isActive ? `${colors.active} ring-offset-1 shadow-sm` : "ring-0 opacity-80 hover:opacity-100"}`}>
              {s}: <span>{counts[s] ?? 0}</span>
              {isActive && s !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
            </button>
          );
        })}
        {revenue > 0 && (
          <span className="ml-2 text-[12px] text-emerald-700 dark:text-emerald-400 font-semibold">
            Revenue: {sym}{revenue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search sale#, customer…" className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 font-medium">1 unsaved sale</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {sales.length}</div>
      </div>

      {/* Grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* New row */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: CELL_H }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field] ?? "";
                return (
                  <td key={c.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : c.type === "readonly" ? "bg-gray-50/60 dark:bg-gray-800/20" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                    style={{ height: CELL_H }}>
                    {c.type === "readonly" ? (
                      <div className="w-full h-full flex items-center px-3"><span className="text-[12px] text-gray-400">auto</span></div>
                    ) : isA && c.type === "select" ? (
                      <select autoFocus value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none">
                        {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : isA && c.type === "date" ? (
                      <input autoFocus type="date" value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none" />
                    ) : isA && c.field === "customer" ? (
                      <div className="absolute inset-0 flex items-center">
                        <Combobox autoFocus value={val}
                          onChange={v => setNewRow(r => r ? { ...r, customer: v } : r)}
                          options={customerComboOpts}
                          placeholder="Select customer…"
                          className="w-full h-full"
                          inputClassName="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none placeholder:text-gray-300"
                          onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); commitNewRow(); } }}
                        />
                      </div>
                    ) : isA ? (
                      <input autoFocus type="text" value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); commitNewRow(); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none placeholder:text-gray-300" />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => c.type !== "readonly" && setNewRowActive(ci)}>
                        {c.field === "status" && val ? (
                          <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${STATUS_BG[val as SaleStatus] ?? ""}`}>{val}</span>
                        ) : (
                          <span className={`truncate text-[13px] ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: CELL_H }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Save"><Save size={13} /></button>
                  <button onClick={() => { setNewRow(null); setNewRowActive(null); }} className="p-1 rounded text-red-400 hover:bg-red-50" title="Cancel"><X size={13} /></button>
                </div>
              </td>
            </tr>
          )}

          {/* Existing rows */}
          {filtered.length === 0 ? (
            <tr><td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
              {search || statusFilter !== "All" ? "No sales match your filters." : "No sales yet — click Open POS to create your first sale."}
            </td></tr>
          ) : filtered.map((sale, ri) => (
            <tr key={sale.id}
              className={`border-b border-gray-100 dark:border-border transition-colors group ${activeCell?.id === sale.id ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
              <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 font-mono select-none" style={{ height: CELL_H }}>{ri + 1}</td>
              {COLS.map((c, ci) => {
                const isA = activeCell?.id === sale.id && activeCell.col === ci;
                const rawVal = cellValue(sale, c.field);
                const canEdit = isAuthenticated && c.type !== "readonly";
                return (
                  <td key={c.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${c.type === "readonly" ? "bg-gray-50/40 dark:bg-gray-800/10" : isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : canEdit ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                    style={{ height: CELL_H }}
                    onClick={() => canEdit && !isA && setActiveCell({ id: sale.id, col: ci })}>
                    {c.field === "status" && !isA ? (
                      <div className="w-full h-full flex items-center px-3 cursor-pointer">
                        <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${STATUS_BG[rawVal as SaleStatus] ?? ""}`}>{rawVal}</span>
                      </div>
                    ) : c.field === "paymentMethod" && !isA ? (
                      <div className="w-full h-full flex items-center gap-1.5 px-3 cursor-pointer">
                        {PAYMENT_ICON[rawVal as SalePayment]}
                        <span className="text-[12px] text-gray-600 dark:text-gray-400">{rawVal}</span>
                      </div>
                    ) : (c.field === "total" || c.field === "amountPaid" || c.field === "balance") ? (
                      <div className="w-full h-full flex items-center px-3">
                        <span className={`text-[13px] font-mono font-semibold tabular-nums ${
                          c.field === "balance" && parseFloat(rawVal) > 0
                            ? "text-red-500 dark:text-red-400"
                            : c.field === "amountPaid" && parseFloat(rawVal) > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-gray-700 dark:text-foreground"
                        }`}>
                          {sym}{parseFloat(rawVal || "0").toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : c.field === "payStatus" ? (
                      <div className="w-full h-full flex items-center px-3">
                        {rawVal === "N/A" ? (
                          <span className="text-[11px] text-gray-300 dark:text-zinc-600">—</span>
                        ) : (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            rawVal === "Paid"      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
                            rawVal === "Partial"   ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                            rawVal === "On Credit" ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300" :
                                                    "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                          }`}>{rawVal}</span>
                        )}
                      </div>
                    ) : (
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={canEdit}
                        onActivate={() => setActiveCell({ id: sale.id, col: ci })}
                        onCommit={v => commitCell(sale.id, c.field, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={s => navigateCell(sale.id, ci, s)}
                        onEnter={() => moveCellDown(sale.id, ci)}
                        suggestions={c.field === "customer" ? customerComboOpts : undefined}
                      />
                    )}
                  </td>
                );
              })}
              <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: CELL_H }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                    title="Open POS" onClick={() => openDetail(sale.id)}>
                    <Eye size={13} />
                  </button>
                  {isAuthenticated && (
                    <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Delete" onClick={() => setDeleteId(sale.id)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {/* ── Totals row ── */}
          {filtered.length > 0 && (
            <tr className="border-t-2 border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 sticky bottom-0 z-10">
              <td className="border-r border-blue-200 dark:border-blue-800 text-center text-[11px] font-bold text-blue-500 dark:text-blue-400 select-none" style={{ height: CELL_H }}>Σ</td>
              {COLS.map((c) => (
                <td key={c.field} className="border-r border-blue-100 dark:border-blue-900/50 px-3" style={{ height: CELL_H }}>
                  {c.field === "saleNumber" ? (
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      {filtered.length} sale{filtered.length !== 1 ? "s" : ""}
                    </span>
                  ) : c.field === "itemCount" ? (
                    <span className="text-[13px] font-mono font-bold text-gray-900 dark:text-foreground tabular-nums">
                      {Number.isInteger(filteredSums.items) ? filteredSums.items : filteredSums.items.toFixed(1)}
                    </span>
                  ) : c.field === "total" ? (
                    <span className="text-[13px] font-mono font-bold text-gray-900 dark:text-foreground tabular-nums">
                      {sym}{filteredSums.total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </span>
                  ) : c.field === "amountPaid" ? (
                    <span className="text-[13px] font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {sym}{filteredSums.paid.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </span>
                  ) : c.field === "balance" ? (
                    <span className={`text-[13px] font-mono font-bold tabular-nums ${filteredSums.balance > 0.005 ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-muted-foreground"}`}>
                      {sym}{filteredSums.balance.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </span>
                  ) : null}
                </td>
              ))}
              <td className="sticky right-0 bg-blue-50/60 dark:bg-blue-950/20 border-l border-blue-100 dark:border-blue-900/50" style={{ height: CELL_H }} />
            </tr>
          )}

          {/* Add row */}
          {isAuthenticated && !newRow && (
            <tr><td colSpan={COLS.length + 2}>
              <button onClick={() => { setNewRow(blankNewRow()); setNewRowActive(0); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                <Plus size={13} /> Add row
              </button>
            </td></tr>
          )}
        </ExcelGridShell>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sale?</AlertDialogTitle>
            <AlertDialogDescription>
              "{sales.find(s => s.id === deleteId)?.saleNumber}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { removeSale(deleteId); toast({ title: "Sale deleted" }); setDeleteId(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
