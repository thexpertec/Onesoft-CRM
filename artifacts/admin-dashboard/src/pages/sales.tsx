import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useSales, useCustomers, useStock } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import {
  Sale, SaleItem, SaleStatus, SalePayment,
  SALE_STATUSES, SALE_PAYMENTS,
  getProducts, getCustomers, getProductCategories, getSales, getSalesAgents, Product,
  deductStockForSale, restoreStockForSale, getSettings, autoPostSaleJE,
} from "@/lib/store";
import { buildSaleReceiptHtml, printReceiptHtml } from "@/lib/print-invoice";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Search, X, Save, Trash2, Eye,
  ShoppingCart, Check, RotateCcw, Ban, CreditCard, Banknote,
  ArrowLeft, Package, ChevronDown, Lock, Printer, SlidersHorizontal, ChevronUp,
  MapPin, UserCheck, Users2, Calendar, Wallet, BadgeCheck, ScanLine,
} from "lucide-react";
import BarcodeScanner from "@/components/barcode-scanner";
import { useKeyboardScanner } from "@/hooks/use-keyboard-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";
import { Combobox, ComboOption } from "@/components/combobox";
import { getSettingsCurrencySymbol, fmtMoney, getSettingsDecimalPlaces } from "@/lib/currencies";

const dp = getSettingsDecimalPlaces();

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_BG: Record<SaleStatus, string> = {
  Draft:       "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
  Completed:   "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "On Credit": "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  Refunded:    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Cancelled:   "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
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
  if (item.discountType === "amt") return Math.max(0, q * p - d);
  return q * p * (1 - d / 100);
};

const lineDiscAmt = (item: SaleItem): number => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  const d = parseFloat(item.discount) || 0;
  if (item.discountType === "amt") return Math.min(d, q * p);
  return q * p * (d / 100);
};

const saleTotal    = (items: SaleItem[]): number => items.reduce((s, i) => s + lineTotal(i), 0);
const discountTotal = (items: SaleItem[]): number => items.reduce((s, i) => s + lineDiscAmt(i), 0);
const subTotal = (items: SaleItem[]): number =>
  items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);

const blankSaleItem = (): SaleItem => ({
  id: crypto.randomUUID(), productName: "", sku: "", qty: "1",
  unit: "pcs", unitPrice: "0.00", discount: "0", discountType: "pct", notes: "", itemStatus: "Delivered",
});

const CHIP_COLORS: Record<string, string> = {
  violet:  "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  emerald: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  blue:    "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  amber:   "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  teal:    "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  rose:    "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
};

function Chip({ label, onRemove, color = "blue" }: { label: string; onRemove: () => void; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CHIP_COLORS[color] ?? CHIP_COLORS.blue}`}>
      {label}
      <button onClick={onRemove} className="opacity-60 hover:opacity-100 ml-0.5">
        <X size={9} />
      </button>
    </span>
  );
}

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

// ─── Sale Complete Modal ──────────────────────────────────────────────────────
function SaleCompleteModal({
  sale,
  onNewSale,
  onClose,
}: {
  sale: Sale;
  onNewSale: () => void;
  onClose: () => void;
}) {
  const settings = getSettings();
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();

  const subtotal    = sale.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
  const discAmt     = discountTotal(sale.items);
  const afterDisc   = subtotal - discAmt;
  const taxRate     = parseFloat(sale.taxRate || "0") || 0;
  const taxAmt      = afterDisc * taxRate / 100;
  const total       = afterDisc + taxAmt;
  const paid        = parseFloat(sale.amountPaid || "0") || 0;
  const change      = Math.max(0, paid - total);
  const balance     = Math.max(0, total - paid);
  const fmt = (n: number) => `${sym}${n.toFixed(dp)}`;

  function handlePrint() {
    try { printReceiptHtml(buildSaleReceiptHtml(sale, settings)); } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Success header ── */}
        <div className="bg-emerald-500 text-white px-6 py-5 text-center shrink-0">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2">
            <Check size={26} className="text-white" />
          </div>
          <h2 className="text-xl font-bold">Sale Complete!</h2>
          <p className="text-emerald-100 text-sm mt-0.5">{sale.saleNumber} · {sale.saleDate}</p>
        </div>

        {/* ── Receipt summary ── */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3 text-sm">
          {/* Customer / Payment */}
          <div className="flex justify-between text-gray-700 dark:text-gray-300">
            <span className="font-medium">Customer</span>
            <span>{sale.customer || "Walk-in"}</span>
          </div>
          <div className="flex justify-between text-gray-700 dark:text-gray-300">
            <span className="font-medium">Payment</span>
            <span>{sale.paymentMethod}</span>
          </div>

          <hr className="border-dashed border-gray-200 dark:border-zinc-700" />

          {/* Items */}
          <div className="space-y-1.5">
            {sale.items.map(item => (
              <div key={item.id} className="flex justify-between text-gray-600 dark:text-gray-400">
                <span className="truncate max-w-[60%]">{item.productName || "—"} <span className="text-gray-400">×{item.qty}</span></span>
                <span className="font-mono shrink-0">{fmt(lineTotal(item))}</span>
              </div>
            ))}
          </div>

          <hr className="border-dashed border-gray-200 dark:border-zinc-700" />

          {/* Totals */}
          <div className="space-y-1">
            {discAmt > 0 && (
              <div className="flex justify-between text-red-500 text-xs">
                <span>Discount</span><span>−{fmt(discAmt)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Tax ({taxRate}%)</span><span>{fmt(taxAmt)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-gray-900 dark:text-gray-100">
              <span>Total</span><span>{fmt(total)}</span>
            </div>
            {paid > 0 && (
              <div className="flex justify-between text-emerald-600 text-sm">
                <span>Paid</span><span>{fmt(paid)}</span>
              </div>
            )}
            {change > 0.005 && (
              <div className="flex justify-between text-blue-600 font-semibold">
                <span>Change</span><span>{fmt(change)}</span>
              </div>
            )}
            {balance > 0.005 && (
              <div className="flex justify-between text-orange-600 font-semibold">
                <span>Balance Due</span><span>{fmt(balance)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex gap-2 shrink-0">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={onNewSale}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
          >
            <Plus size={15} /> New Sale
          </button>
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 font-semibold text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
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
  const dp  = getSettingsDecimalPlaces();
  const fmt = (n: number) => `${sym}${n.toFixed(dp)}`;

  const presets = [
    { label: "Exact", value: total.toFixed(dp) },
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
                    setPayAmount(Math.min(v, total).toFixed(dp));
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
  localMeta: { customer: string; saleDate: string; paymentMethod: SalePayment; notes: string; agentId?: string; agentName?: string };
  customerComboOpts: ComboOption[];
  productComboOpts: ComboOption[];
  agentOpts: { id: string; code: string; name: string }[];
  onClose: () => void;
  onMetaChange: (meta: Partial<{ customer: string; saleDate: string; paymentMethod: SalePayment; notes: string; agentId?: string; agentName?: string }>) => void;
  onSaveMeta: () => void;
  onItemChange: (itemId: string, field: keyof SaleItem, value: string) => void;
  onItemBlur: () => void;
  onSaveItems: (items: SaleItem[]) => void;
  onDeleteItem: (itemId: string) => void;
  onAddProduct: (product: Product) => void;
  priceMode: "retail" | "wholesale";
  onPriceModeChange: (mode: "retail" | "wholesale") => void;
  onSetStatus: (status: SaleStatus) => void;
  onComplete: (amountPaid: string, taxRate: string, paymentMethod: SalePayment) => void;
  onAddCustomer: (name: string, phone: string, email: string, company?: string) => void;
}

function POSView({
  sale, localItems, localMeta, customerComboOpts, productComboOpts, agentOpts,
  onClose, onMetaChange, onSaveMeta, onItemChange, onItemBlur,
  onSaveItems, onDeleteItem, onAddProduct, priceMode, onPriceModeChange,
  onSetStatus, onComplete, onAddCustomer,
}: POSViewProps) {
  const { stock } = useStock();
  const settings = getSettings();
  const dp  = getSettingsDecimalPlaces();
  const [prodSearch,    setProdSearch]    = useState("");
  const [catFilter,     setCatFilter]     = useState("All");
  const [prodSort,      setProdSort]      = useState("listing");
  const [payModalOpen,  setPayModalOpen]  = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [resetConfirmOpen,  setResetConfirmOpen]  = useState(false);
  const [scannerOpen,   setScannerOpen]   = useState(false);
  const [filtersOpen,   setFiltersOpen]   = useState(true);
  const { toast } = useToast();

  // ── Barcode / QR scanner — shared lookup for both camera and keyboard ──────
  const handleScan = useCallback((code: string) => {
    const allProducts = getProducts().filter(p => p.status !== "Inactive");
    const q = code.toLowerCase();
    const found = allProducts.find(
      p => p.barcode === code || p.sku === code ||
           (p.barcode ?? "").toLowerCase() === q ||
           p.sku.toLowerCase() === q
    );
    if (found) {
      onAddProduct(found);
      setScannerOpen(false);
      setProdSearch("");
      toast({ title: `Added: ${found.name}`, description: "Scanned successfully" });
    } else {
      // Fall back to populating the search so user can pick manually
      setProdSearch(code);
      setScannerOpen(false);
      toast({ title: "Product not found", description: `No match for "${code}" — check barcode or SKU`, variant: "destructive" });
    }
  }, [onAddProduct, toast]);

  // ── Keyboard-wedge scanner (USB / Bluetooth hardware scanner) ─────────────
  // When the search box is NOT focused the hook intercepts scanner keystrokes.
  // When the search box IS focused the scanner types into it; pressing Enter
  // then triggers the exact-match lookup in the onKeyDown handler below.
  useKeyboardScanner({ onScan: handleScan, enabled: true, captureFromInputs: false });

  // ── Quick-add customer dialog ────────────────────────────────────────────
  const [qaOpen,    setQaOpen]    = useState(false);
  const [qaName,    setQaName]    = useState("");
  const [qaCompany, setQaCompany] = useState("");
  const [qaPhone,   setQaPhone]   = useState("");
  const [qaEmail,   setQaEmail]   = useState("");

  const customerExists = customerComboOpts.some(
    o => o.value.toLowerCase() === localMeta.customer.toLowerCase().trim()
  );
  const showAddBtn = localMeta.customer.trim().length > 0 && !customerExists;

  const openQuickAdd = () => {
    setQaName(localMeta.customer.trim());
    setQaCompany(""); setQaPhone(""); setQaEmail("");
    setQaOpen(true);
  };

  const confirmQuickAdd = () => {
    if (!qaName.trim()) return;
    onAddCustomer(qaName.trim(), qaPhone.trim(), qaEmail.trim(), qaCompany.trim());
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

  // Stock qty per SKU (moved here so filteredProds can use it for sorting)
  const stockMap = useMemo(() => {
    const m: Record<string, number> = {};
    stock.forEach(s => { if (s.sku) m[s.sku] = (m[s.sku] || 0) + (parseFloat(s.quantity) || 0); });
    return m;
  }, [stock]);

  // ── Sales summary for top-selling sorts ──────────────────────────────────
  const saleSummary = useMemo(() => {
    const qtyMap: Record<string, number>    = {};
    const orderMap: Record<string, number>  = {};
    getSales().forEach(s => {
      s.items.forEach(item => {
        if (!item.sku) return;
        qtyMap[item.sku]   = (qtyMap[item.sku]   || 0) + (parseFloat(item.qty) || 0);
        orderMap[item.sku] = (orderMap[item.sku]  || 0) + 1;
      });
    });
    return { qtyMap, orderMap };
  }, []);

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
        p.category.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    switch (prodSort) {
      case "qty":
        sorted.sort((a, b) => (saleSummary.qtyMap[b.sku] || 0) - (saleSummary.qtyMap[a.sku] || 0));
        break;
      case "orders":
        sorted.sort((a, b) => (saleSummary.orderMap[b.sku] || 0) - (saleSummary.orderMap[a.sku] || 0));
        break;
      case "az":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "price-high":
        sorted.sort((a, b) => parseFloat(b.price || "0") - parseFloat(a.price || "0"));
        break;
      case "price-low":
        sorted.sort((a, b) => parseFloat(a.price || "0") - parseFloat(b.price || "0"));
        break;
      case "stock-high":
        sorted.sort((a, b) => (stockMap[b.sku] ?? 0) - (stockMap[a.sku] ?? 0));
        break;
      case "stock-low":
        sorted.sort((a, b) => (stockMap[a.sku] ?? 0) - (stockMap[b.sku] ?? 0));
        break;
      default:
        break;
    }
    return sorted;
  }, [allProducts, catFilter, prodSearch, prodSort, saleSummary, stockMap]);

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

  // Whether overselling is allowed (read once per render; Settings.allowNegativeStock)
  const allowNegativeStock = useMemo(() => getSettings().allowNegativeStock !== false, []);

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

          {/* NOTES */}
          <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Notes</span>
            <input
              value={localMeta.notes}
              onChange={e => onMetaChange({ notes: e.target.value })}
              onBlur={onSaveMeta}
              placeholder="Optional…"
              className="border-0 border-b-2 border-gray-200 dark:border-zinc-700 px-0 pb-0.5 text-[13px] text-gray-700 dark:text-gray-200 bg-transparent focus:outline-none focus:border-blue-500 transition-colors placeholder:text-gray-300 dark:placeholder:text-zinc-600 w-full"
            />
          </div>

          {agentOpts.length > 0 && (<>
            <div className="w-px h-8 bg-gray-200 dark:bg-zinc-700 shrink-0" />

            {/* SALES AGENT */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Sales Agent</span>
              <div className="flex items-center gap-1">
                <select
                  value={localMeta.agentId || ""}
                  onChange={e => {
                    const agent = agentOpts.find(a => a.id === e.target.value);
                    onMetaChange({ agentId: agent?.id || "", agentName: agent?.name || "" });
                    onSaveMeta();
                  }}
                  className="appearance-none border-0 border-b-2 border-gray-200 dark:border-zinc-700 pr-5 pb-0.5 text-[13px] font-semibold text-gray-700 dark:text-gray-200 bg-transparent focus:outline-none focus:border-teal-500 transition-colors max-w-[160px]"
                >
                  <option value="">— None —</option>
                  {agentOpts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                  ))}
                </select>
              </div>
              {localMeta.agentName && (
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold font-mono">{localMeta.agentName}</span>
              )}
            </div>
          </>)}
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
                    <div key={item.id} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50/80 dark:hover:bg-zinc-900/50 transition-colors group">

                      {/* Row number */}
                      <span className="text-[12px] text-gray-300 dark:text-zinc-700 w-5 text-center shrink-0 font-medium">{idx + 1}</span>

                      {/* Thumbnail */}
                      <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 ring-1 ring-gray-100 dark:ring-zinc-800">
                        <ProductThumbnail product={prod ?? { name: item.productName, sku: item.sku } as Product} size="sm" />
                      </div>

                      {/* Product name + unit + stock + cost tag */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-bold text-gray-900 dark:text-gray-100 truncate leading-tight">{item.productName || "—"}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {item.unit && (
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">
                              {item.unit}
                            </span>
                          )}
                          {parseFloat(prod?.costPrice ?? "0") > 0 && (
                            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/30 text-red-400 dark:text-red-500 tabular-nums">
                              {sym}{parseFloat(prod!.costPrice).toFixed(2)}
                            </span>
                          )}
                          {(() => {
                            if (!item.sku) return null;
                            const rawStock = stockMap[item.sku];
                            const avail = rawStock !== undefined ? rawStock : null;
                            if (avail === null) return null;
                            const isNeg  = avail < 0;
                            const isZero = avail === 0;
                            const isLow  = avail > 0 && avail <= 5;
                            return (
                              <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md tabular-nums ${
                                isNeg || isZero
                                  ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                                  : isLow
                                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                                    : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                              }`}>
                                Stock: {avail}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Qty — plain input, no +/- buttons */}
                      <div className="shrink-0 w-[42px]">
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1 font-bold">Qty</div>
                        {isDraft ? (
                          <input
                            type="number" min="0"
                            value={item.qty}
                            onChange={e => onItemChange(item.id, "qty", e.target.value)}
                            onBlur={onItemBlur}
                            className="w-full text-[15px] font-bold text-center text-gray-800 dark:text-gray-100 bg-transparent outline-none border-b-2 border-gray-200 dark:border-zinc-700 focus:border-blue-400 dark:focus:border-blue-500 transition-colors pb-0.5"
                          />
                        ) : (
                          <span className="text-[15px] font-bold text-gray-600 dark:text-gray-300 block text-center">×{item.qty}</span>
                        )}
                      </div>

                      {/* Unit price */}
                      <div className="shrink-0 w-[72px]">
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

                      {/* Discount — toggle between % and flat amount */}
                      <div className="shrink-0 w-[58px]">
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1 font-bold flex items-center gap-1">
                          Disc
                          {isDraft && (
                            <button
                              type="button"
                              onClick={() => onItemChange(item.id, "discountType" as keyof SaleItem,
                                (item.discountType ?? "pct") === "pct" ? "amt" : "pct"
                              )}
                              className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors leading-tight"
                              title="Toggle % / amount"
                            >
                              {(item.discountType ?? "pct") === "pct" ? "%" : sym}
                            </button>
                          )}
                          {!isDraft && <span className="text-[9px]">{(item.discountType ?? "pct") === "pct" ? "%" : sym}</span>}
                        </div>
                        <input
                          type="number" min="0"
                          max={(item.discountType ?? "pct") === "pct" ? "100" : undefined}
                          step={(item.discountType ?? "pct") === "pct" ? "1" : "0.01"}
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
                          {sym}{lineTotal(item).toFixed(dp)}
                        </div>
                        {lineDiscAmt(item) > 0 && (
                          <div className="text-[11px] font-semibold text-red-500 dark:text-red-400 font-mono">
                            −{lineDiscAmt(item).toFixed(dp)}
                          </div>
                        )}
                        {settings.showPosProfit !== false && (() => {
                          const cp = parseFloat(prod?.costPrice ?? "0") || 0;
                          if (cp <= 0) return null;
                          const qty = parseFloat(item.qty) || 0;
                          const profit = lineTotal(item) - cp * qty;
                          if (profit <= 0) return null;
                          return (
                            <div className="text-[11px] font-bold font-mono text-green-600 dark:text-green-400 tabular-nums">
                              +{profit.toFixed(dp)}
                            </div>
                          );
                        })()}
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
                <span className="font-mono font-semibold">{sym}{subTotal(localItems).toFixed(dp)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-[12px] text-emerald-600 dark:text-emerald-400">
                  <span>Discount savings</span>
                  <span className="font-mono font-semibold">−{sym}{discountAmt.toFixed(dp)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-zinc-800">
                <span className="text-[14px] font-bold text-gray-600 dark:text-gray-300">Total to Pay</span>
                <span className="text-[26px] font-black font-mono tabular-nums text-blue-600 dark:text-blue-400 leading-none">
                  {sym}{grandTotal.toFixed(dp)}
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
                  {/* ── Secondary actions row ── */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Hold / Save Draft */}
                    <button
                      onClick={onClose}
                      className="h-9 rounded-xl border-2 border-blue-200 dark:border-blue-800/60 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-1.5 transition-colors"
                      title="Save as Draft and return to list"
                    >
                      <Save size={13} /> Hold
                    </button>
                    {/* Cancel sale */}
                    <button
                      onClick={() => setCancelConfirmOpen(true)}
                      className="h-9 rounded-xl border-2 border-red-200 dark:border-red-900/60 text-[12px] font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center gap-1.5 transition-colors"
                      title="Cancel this sale"
                    >
                      <Ban size={13} /> Cancel
                    </button>
                    {/* Reset cart */}
                    <button
                      onClick={() => setResetConfirmOpen(true)}
                      disabled={localItems.length === 0}
                      className="h-9 rounded-xl border-2 border-amber-200 dark:border-amber-800/60 text-[12px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Clear all items from cart"
                    >
                      <RotateCcw size={13} /> Reset
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
            {/* Search + Scan button + collapse toggle */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && prodSearch.trim()) {
                      // When the USB/Bluetooth scanner types into this box and presses Enter,
                      // try an exact barcode/SKU lookup before falling back to search results
                      handleScan(prodSearch.trim());
                    }
                  }}
                  placeholder="Search by name, SKU or barcode…"
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
              {/* QR / Barcode scan button */}
              <button
                onClick={() => setScannerOpen(true)}
                className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border-2 border-blue-200 dark:border-blue-800 transition-colors"
                title="Scan barcode / QR code to add product"
              >
                <ScanLine size={16} />
              </button>
              {/* Collapse / expand filters toggle */}
              <button
                onClick={() => setFiltersOpen(o => !o)}
                className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-colors ${
                  filtersOpen
                    ? "bg-gray-50 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-700"
                    : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                }`}
                title={filtersOpen ? "Collapse filters" : "Expand filters"}
              >
                <ChevronUp
                  size={16}
                  className={`transition-transform duration-200 ${filtersOpen ? "rotate-0" : "rotate-180"}`}
                />
              </button>
            </div>

            {/* Collapsible: Price/Sort + Category pills + count */}
            <div
              className={`overflow-hidden transition-all duration-200 ${filtersOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0 !mt-0 !space-y-0"}`}
            >
              <div className="space-y-2.5">
                {/* Retail / Wholesale toggle + Sort by — same row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Price:</span>
                    <div className="flex rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden text-[11px] font-semibold">
                      <button
                        onClick={() => onPriceModeChange("retail")}
                        className={`px-3 py-1 transition-colors ${priceMode === "retail" ? "bg-blue-600 text-white" : "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}
                      >
                        Retail
                      </button>
                      <button
                        onClick={() => onPriceModeChange("wholesale")}
                        className={`px-3 py-1 transition-colors border-l border-gray-200 dark:border-zinc-700 ${priceMode === "wholesale" ? "bg-purple-600 text-white" : "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}
                      >
                        Wholesale
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Sort:</span>
                    <select
                      value={prodSort}
                      onChange={e => setProdSort(e.target.value)}
                      className="text-[11px] font-semibold border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                    >
                      <option value="listing">Listing Sequence</option>
                      <option value="qty">Top Selling (Qty)</option>
                      <option value="orders">Top Selling (Orders)</option>
                      <option value="az">A – Z</option>
                      <option value="price-high">Highest Price</option>
                      <option value="price-low">Lowest Price</option>
                      <option value="stock-high">Highest Stock</option>
                      <option value="stock-low">Lowest Stock</option>
                    </select>
                  </div>
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
                  const inCart       = cartQtyMap[product.sku] || 0;
                  const stockQty     = stockMap[product.sku] ?? null;
                  const availableQty = (stockQty ?? 0) - inCart;
                  const lowStock     = stockQty !== null && availableQty > 0 && availableQty <= 5;
                  // Card is blocked if: sale not draft  OR  (overselling disabled AND no available stock)
                  const stockBlocked = !allowNegativeStock && stockQty !== null && availableQty <= 0;
                  const isDisabled   = !isDraft || stockBlocked;
                  return (
                    <button
                      key={product.id}
                      disabled={isDisabled}
                      onClick={() => onAddProduct(product)}
                      title={
                        !isDraft          ? `Sale is ${sale.status}`
                        : stockBlocked    ? `${product.name} — out of stock (overselling disabled)`
                        : `Add ${product.name}`
                      }
                      className={`group relative text-left bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden flex flex-col transition-all ${
                        !isDraft
                          ? "border-gray-100 dark:border-zinc-800 opacity-40 cursor-not-allowed"
                          : stockBlocked
                            ? "border-red-200 dark:border-red-900 opacity-60 cursor-not-allowed"
                            : inCart > 0
                              ? "border-blue-300 dark:border-blue-700 hover:border-blue-400 hover:shadow-sm cursor-pointer active:scale-[0.98]"
                              : "border-gray-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm cursor-pointer active:scale-[0.98]"
                      }`}
                    >
                      {/* In-cart badge */}
                      {inCart > 0 && !stockBlocked && (
                        <div className="absolute top-1.5 right-1.5 z-10 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {inCart}
                        </div>
                      )}

                      {/* Blocked overlay — shown when overselling is disabled & stock exhausted */}
                      {stockBlocked && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-red-50/80 dark:bg-red-950/60 rounded-xl gap-0.5">
                          <div className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide text-center px-1 leading-tight">
                            No Stock
                          </div>
                          {stockQty !== null && (
                            <div className="text-[9px] font-bold text-red-500 dark:text-red-400 tabular-nums">
                              ({stockQty})
                            </div>
                          )}
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
                          <span className={`text-[12px] font-bold font-mono ${priceMode === "wholesale" ? "text-purple-600 dark:text-purple-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {getSettingsCurrencySymbol()}{parseFloat((priceMode === "wholesale" ? product.wholesalePrice || product.price : product.price) || "0").toFixed(2)}
                          </span>
                          {product.category && (
                            <span className={`text-[8px] font-semibold px-1 py-0.5 rounded-full truncate max-w-[44px] ${catColor}`}>
                              {product.category}
                            </span>
                          )}
                        </div>
                        {/* Stock qty — read-only pill, colour-coded (uses availableQty = stock − in-cart) */}
                        <div className="flex items-center justify-between mt-0.5">
                          {stockQty === null ? (
                            <span className="text-[9px] text-gray-300 dark:text-zinc-700 tabular-nums">No record</span>
                          ) : availableQty < 0 ? (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 tabular-nums">⚠ {availableQty}</span>
                          ) : availableQty === 0 ? (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 tabular-nums">0 left</span>
                          ) : lowStock ? (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 tabular-nums">⚠ {availableQty} left</span>
                          ) : (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 tabular-nums">{availableQty} in stock</span>
                          )}
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
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Company</label>
            <Input value={qaCompany} onChange={e => setQaCompany(e.target.value)} placeholder="Company / organisation name" className="h-9 text-[13px]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Phone</label>
              <Input value={qaPhone} onChange={e => setQaPhone(e.target.value)} placeholder="+44 7xxx xxxxxx" className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Email</label>
              <Input value={qaEmail} onChange={e => setQaEmail(e.target.value)} placeholder="email@example.com" className="h-9 text-[13px]" />
            </div>
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
    {/* ── Cancel confirm ───────────────────────────────────────────────────── */}
    <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this sale?</AlertDialogTitle>
          <AlertDialogDescription>
            This sale will be marked as <strong>Cancelled</strong>. You can view it in the sales list but it will no longer be editable from the POS.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => { onSetStatus("Cancelled"); setCancelConfirmOpen(false); onClose(); }}
          >
            Yes, Cancel Sale
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ── Reset (clear cart) confirm ────────────────────────────────────────── */}
    <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset cart?</AlertDialogTitle>
          <AlertDialogDescription>
            All items in the cart will be removed. Customer, agent and payment details will be kept. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 hover:bg-amber-700"
            onClick={() => { onSaveItems([]); setResetConfirmOpen(false); }}
          >
            Yes, Clear Cart
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ── Barcode / QR scanner ─────────────────────────────────────────────── */}
    <BarcodeScanner
      open={scannerOpen}
      onClose={() => setScannerOpen(false)}
      onScan={handleScan}
      title="Scan to Add Product"
      hint="Scan a product barcode or QR code to instantly add it to the cart"
    />
    </>
  );
}

// ─── Main SalesPage component ─────────────────────────────────────────────────
export default function SalesPage() {
  const [location, navigate] = useLocation();
  const dp = getSettingsDecimalPlaces();
  const isNewSale = location.includes("/new");
  const { sales, addSale, editSale, removeSale } = useSales();
  const { customers, addCustomer } = useCustomers();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const products          = useMemo(() => getProducts(), []);
  const allProducts       = useMemo(() => getProducts().filter(p => p.status !== "Inactive"), []);
  const customerComboOpts = useMemo<ComboOption[]>(() =>
    customers.map(c => ({
      value: c.name,
      label: c.name,
      sub: [c.phone, c.email].filter(Boolean).join("  ·  "),
    })),
  [customers]);
  const productComboOpts  = useMemo<ComboOption[]>(() => getProducts().map(p => ({ value: p.name, label: p.name, sub: p.sku, tag: p.category })), []);
  const agentOpts         = useMemo(() => getSalesAgents().filter(a => a.status === "Active").map(a => ({ id: a.id, code: a.agentCode, name: a.name })), []);
  const sym               = useMemo(() => getSettingsCurrencySymbol(), []);

  // ── List state ──
  const [statusFilter,   setStatusFilter]   = useState<string>("All");
  const [search,         setSearch]         = useState("");
  const [activeCell,     setActiveCell]     = useState<{ id: string; col: number } | null>(null);
  const [newRow,         setNewRow]         = useState<Record<string, string> | null>(null);
  const [newRowActive,   setNewRowActive]   = useState<number | null>(null);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // ── Advanced filters ──────────────────────────────────────────────────────
  const [advOpen,        setAdvOpen]        = useState(false);
  const [filterArea,     setFilterArea]     = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterAgent,    setFilterAgent]    = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [filterPayMode,  setFilterPayMode]  = useState("");
  const [filterPayStatus,setFilterPayStatus]= useState("");

  const clearAdvFilters = () => {
    setFilterArea(""); setFilterCustomer(""); setFilterAgent("");
    setFilterDateFrom(""); setFilterDateTo(""); setFilterPayMode(""); setFilterPayStatus("");
  };
  const advActiveCount = [filterArea, filterCustomer, filterAgent,
    filterDateFrom, filterDateTo, filterPayMode, filterPayStatus].filter(Boolean).length;

  // Advanced filter option lists
  const agentAreaOpts  = useMemo(() => {
    const s = new Set<string>();
    getSalesAgents().forEach(a => { if (a.area) s.add(a.area); });
    return Array.from(s).sort();
  }, []);
  const customerOpts   = useMemo(() => {
    const s = new Set<string>();
    sales.forEach(s2 => { if (s2.customer) s.add(s2.customer); });
    return Array.from(s).sort();
  }, [sales]);
  const agentIdAreaMap = useMemo(() => {
    const m = new Map<string, string>();
    getSalesAgents().forEach(a => { if (a.area) m.set(a.id, a.area); });
    return m;
  }, []);

  // ── POS state ──
  const [detailId,               setDetailId]               = useState<string | null>(null);
  const [localItems,             setLocalItems]             = useState<SaleItem[]>([]);
  const [priceMode,              setPriceMode]              = useState<"retail" | "wholesale">("retail");
  const [localMeta,              setLocalMeta]              = useState<{ customer: string; saleDate: string; paymentMethod: SalePayment; notes: string; agentId?: string; agentName?: string } | null>(null);
  const [completedSaleForReceipt, setCompletedSaleForReceipt] = useState<Sale | null>(null);

  // Refs so callbacks always see latest values without stale-closure issues
  const localItemsRef = useRef<SaleItem[]>(localItems);
  const localMetaRef  = useRef(localMeta);
  useEffect(() => { localItemsRef.current = localItems; }, [localItems]);
  useEffect(() => { localMetaRef.current  = localMeta;  }, [localMeta]);

  // Track if the current POS session was a brand-new blank sale (created by "Open POS").
  // If the user closes without adding any items or customer, we delete it automatically.
  const freshSaleIdRef = useRef<string | null>(null);

  // ── COLS ──
  const agentNameOpts = useMemo(() => agentOpts.map(a => a.name), [agentOpts]);

  const COLS: ColDef[] = useMemo(() => [
    { field: "saleNumber",    label: "Sale #",          minW: 145, type: "readonly" },
    { field: "saleDate",      label: "Date",            minW: 130, type: "date"     },
    { field: "customer",      label: "Customer",        minW: 180, type: "text"     },
    { field: "agentName",     label: "Sales Agent",     minW: 150, type: agentNameOpts.length ? "select" : "text", options: agentNameOpts },
    { field: "status",        label: "Status",          minW: 130, type: "select",  options: [...SALE_STATUSES] },
    { field: "itemCount",     label: "Items",           minW: 60,  type: "readonly" },
    { field: "total",         label: `Total (${sym})`,   minW: 110, type: "readonly" },
    { field: "amountPaid",    label: `Paid (${sym})`,   minW: 110, type: "readonly" },
    { field: "balance",       label: `Balance (${sym})`,minW: 110, type: "readonly" },
    { field: "payStatus",     label: "Pay Status",      minW: 100, type: "readonly" },
    { field: "paymentMethod", label: "Payment",         minW: 140, type: "select",  options: [...SALE_PAYMENTS] },
    { field: "notes",         label: "Notes",           minW: 230, type: "text"     },
  ], [sym, agentNameOpts]);
  const TOTAL_W = useMemo(() => COLS.reduce((a, c) => a + c.minW, 0), [COLS]);

  const cellValue = (sale: Sale, field: string): string => {
    if (field === "itemCount") {
      const totalQty = sale.items.reduce((sum, i) => sum + (parseFloat(i.qty) || 0), 0);
      return Number.isInteger(totalQty) ? String(totalQty) : totalQty.toFixed(1);
    }
    if (field === "total")     return saleTotal(sale.items).toFixed(dp);
    if (field === "balance") {
      const total = saleTotal(sale.items);
      const paid  = parseFloat(sale.amountPaid || "0");
      return Math.max(0, total - paid).toFixed(dp);
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
      freshSaleIdRef.current = draft.id;
      openDetailDirect(draft);
      navigate("/sales", { replace: true });
    }
  }, [isNewSale, isAuthenticated]);

  // ── Open POS — accepts a Sale object directly (avoids stale-state lookup) ──
  const openDetailDirect = useCallback((sale: Sale) => {
    setLocalItems([...sale.items]);
    setLocalMeta({ customer: sale.customer, saleDate: sale.saleDate, paymentMethod: sale.paymentMethod, notes: sale.notes, agentId: sale.agentId, agentName: sale.agentName });
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
        setLocalMeta({ customer: sale.customer, saleDate: sale.saleDate, paymentMethod: sale.paymentMethod, notes: sale.notes, agentId: sale.agentId, agentName: sale.agentName });
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
    const settings = getSettings();
    const allowNeg = settings.allowNegativeStock !== false; // default true

    // ── Stock guard ──────────────────────────────────────────────────────────
    if (!allowNeg) {
      // Sum stock across all stock-items with this SKU
      const available = getStock()
        .filter(s => s.sku === product.sku)
        .reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);

      // Count qty already in cart for this SKU
      const inCart = localItemsRef.current
        .filter(i => i.sku === product.sku)
        .reduce((sum, i) => sum + (parseFloat(i.qty) || 0), 0);

      if (available - inCart <= 0) {
        toast({
          title: "Out of stock",
          description: `${product.name} has no available stock. Overselling is disabled in Settings.`,
          variant: "destructive",
        });
        return;
      }
    }

    const current = localItemsRef.current;
    const resolvedPrice = priceMode === "wholesale" && product.wholesalePrice
      ? product.wholesalePrice
      : product.price || "0.00";
    const existing = current.find(i => i.sku === product.sku);
    if (existing) {
      const next = current.map(i =>
        i.sku === product.sku
          ? { ...i, qty: String((parseFloat(i.qty) || 0) + 1) }
          : i
      );
      saveItems(next);
    } else {
      const defaultDiscountType = settings.posDiscountType ?? "pct";
      const item: SaleItem = {
        ...blankSaleItem(),
        productName: product.name,
        sku: product.sku,
        unit: product.unit || "pcs",
        unitPrice: resolvedPrice,
        discountType: defaultDiscountType,
      };
      saveItems([...current, item]);
      toast({ title: `${product.name} added` });
    }
  }, [saveItems, toast, priceMode]);

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
      deductStockForSale(localItems, detailSale?.saleNumber || "");
      stockDeducted = true;
    }
    if ((status === "Refunded" || status === "Cancelled") && wasDeducted) {
      restoreStockForSale(localItems, detailSale?.saleNumber || "");
      stockDeducted = false;
    }

    // Auto-post JE for On Credit sales (only once)
    let jeId: string | undefined = detailSale?.jeId;
    if (status === "On Credit" && !jeId) {
      const subtotal  = saleTotal(localItems);
      const taxPct    = Math.max(0, parseFloat(localMeta.taxRate ?? "0") || 0);
      const taxAmount = parseFloat((subtotal * taxPct / 100).toFixed(2));
      const costTotal = localItems.reduce((sum, item) => {
        const prod = allProducts.find(p => p.sku === item.sku || p.name === item.productName);
        return sum + (parseFloat(prod?.costPrice ?? "0") || 0) * (parseFloat(item.qty) || 0);
      }, 0);
      const je = autoPostSaleJE({
        source:        "POS",
        reference:     detailSale?.saleNumber || "",
        customer:      localMeta.customer || "Walk-in",
        date:          detailSale?.saleDate || new Date().toISOString().slice(0, 10),
        paymentMethod: "Credit",
        subtotal,
        taxAmount,
        grandTotal:    parseFloat((subtotal + taxAmount).toFixed(2)),
        costTotal:     parseFloat(costTotal.toFixed(2)),
      });
      if (je) jeId = je.id;
    }

    editSale(detailId, { ...localMeta, status, items: localItems, stockDeducted, ...(jeId ? { jeId } : {}) });
    toast({ title: status === "Completed" ? "Sale completed!" : status === "On Credit" ? "Issued on credit" : status === "Refunded" ? "Sale refunded" : "Sale cancelled" });
  };

  const closePOS = () => {
    const currentId  = detailId;
    const isFresh    = currentId !== null && currentId === freshSaleIdRef.current;
    const hasItems   = localItemsRef.current.length > 0;
    const hasCustomer = !!localMetaRef.current?.customer?.trim();
    const hasNotes    = !!localMetaRef.current?.notes?.trim();

    if (isFresh && !hasItems && !hasCustomer && !hasNotes) {
      // Brand-new blank sale — delete it so it never appears in the list
      removeSale(currentId!);
    } else {
      saveMeta();
    }

    freshSaleIdRef.current = null;
    setDetailId(null);
    setLocalMeta(null);
    setLocalItems([]);
  };

  const handleComplete = (amountPaid: string, taxRate: string, paymentMethod: SalePayment) => {
    if (!detailId || !localMeta) return;

    try {
      // Deduct stock only if not already done (avoids double-deduction on re-payment)
      if (!(detailSale?.stockDeducted ?? false)) {
        deductStockForSale(localItems, detailSale?.saleNumber || "");
      }

      // Auto-post journal entry (only once — skip if already linked)
      let jeId: string | undefined = detailSale?.jeId;
      if (!jeId) {
        const subtotal  = saleTotal(localItems);
        const taxPct    = Math.max(0, parseFloat(taxRate) || 0);
        const taxAmount = parseFloat((subtotal * taxPct / 100).toFixed(2));
        const costTotal = allProducts.length > 0
          ? localItems.reduce((sum, item) => {
              const prod = allProducts.find(p => p.sku === item.sku || p.name === item.productName);
              return sum + (parseFloat(prod?.costPrice ?? "0") || 0) * (parseFloat(item.qty) || 0);
            }, 0)
          : 0;
        const je = autoPostSaleJE({
          source:        "POS",
          reference:     detailSale?.saleNumber || "",
          customer:      localMeta.customer || "Walk-in",
          date:          detailSale?.saleDate || new Date().toISOString().slice(0, 10),
          paymentMethod,
          subtotal,
          taxAmount,
          grandTotal:    parseFloat((subtotal + taxAmount).toFixed(2)),
          costTotal:     parseFloat(costTotal.toFixed(2)),
        });
        if (je) jeId = je.id;
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
        ...(jeId ? { jeId } : {}),
      });

      toast({ title: "Sale completed!", description: `${sym}${parseFloat(amountPaid || "0").toFixed(2)} received` });

      // Close POS and show the in-page Sale Complete overlay
      closePOS();
      setCompletedSaleForReceipt(completedSale);
    } catch (err) {
      toast({ title: "Error completing sale", description: String(err), variant: "destructive" });
    }
  };

  // ── List filtering ──
  const filtered = useMemo(() => {
    let rows = [...sales];

    // Status pill filter
    if (statusFilter !== "All") rows = rows.filter(s => s.status === statusFilter);

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        s.saleNumber.toLowerCase().includes(q) ||
        s.customer.toLowerCase().includes(q) ||
        (s.agentName ?? "").toLowerCase().includes(q) ||
        s.notes.toLowerCase().includes(q),
      );
    }

    // ── Advanced filters ─────────────────────────────────────────────────────
    if (filterArea) {
      rows = rows.filter(s => !!s.agentId && agentIdAreaMap.get(s.agentId) === filterArea);
    }
    if (filterCustomer) {
      rows = rows.filter(s => s.customer === filterCustomer);
    }
    if (filterAgent) {
      rows = rows.filter(s => s.agentName === filterAgent || s.agentId === filterAgent);
    }
    if (filterDateFrom) {
      rows = rows.filter(s => s.saleDate >= filterDateFrom);
    }
    if (filterDateTo) {
      rows = rows.filter(s => s.saleDate <= filterDateTo);
    }
    if (filterPayMode) {
      rows = rows.filter(s => s.paymentMethod === filterPayMode);
    }
    if (filterPayStatus) {
      rows = rows.filter(s => {
        const total = saleTotal(s.items);
        const paid  = parseFloat(s.amountPaid || "0") || 0;
        switch (filterPayStatus) {
          case "paid":    return total > 0 && paid >= total;
          case "unpaid":  return paid === 0;
          case "partial": return paid > 0 && paid < total;
          case "overdue": return s.status === "On Credit" && paid < total;
          default:        return true;
        }
      });
    }

    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales, statusFilter, search,
      filterArea, filterCustomer, filterAgent, filterDateFrom, filterDateTo, filterPayMode, filterPayStatus,
      agentIdAreaMap]);

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
    if (field === "agentName") {
      const agent = agentOpts.find(a => a.name === value);
      editSale(id, { agentName: value, agentId: agent?.id ?? "" });
    } else {
      editSale(id, { [field]: value } as Partial<Sale>);
    }
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [sales, editSale, agentOpts, toast]);

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
        agentOpts={agentOpts}
        onClose={closePOS}
        onMetaChange={patch => setLocalMeta(m => m ? { ...m, ...patch } : m)}
        onSaveMeta={saveMeta}
        onItemChange={handleItemFieldChange}
        onItemBlur={handleItemBlur}
        onSaveItems={saveItems}
        onDeleteItem={handleDeleteItem}
        onAddProduct={handleAddProductFromCatalogue}
        priceMode={priceMode}
        onPriceModeChange={setPriceMode}
        onSetStatus={setStatus}
        onComplete={handleComplete}
        onAddCustomer={(name, phone, email, company) => {
          addCustomer({
            name, phone, email,
            company: company || "", industry: "", city: "", status: "Active",
            source: "direct", customerSince: new Date().toISOString().slice(0, 10),
            totalValue: "0", currency: "GBP", notes: "", tags: [],
          });
          toast({ title: "Customer added", description: `"${name}"${company ? ` (${company})` : ""} added to Customers.` });
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
            <Button size="sm" onClick={() => { const s = addSale(blankSale()); freshSaleIdRef.current = s.id; openDetailDirect(s); }} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
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
          <Input placeholder="Search sale#, customer, agent…" className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Advanced Filters toggle */}
        <Button size="sm" variant={advOpen || advActiveCount > 0 ? "default" : "outline"}
          className={`h-8 gap-1.5 text-[12px] ${advOpen || advActiveCount > 0 ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}`}
          onClick={() => setAdvOpen(v => !v)}>
          <SlidersHorizontal size={13} />
          Filters
          {advActiveCount > 0 && (
            <span className="ml-0.5 bg-white/25 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{advActiveCount}</span>
          )}
          {advOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </Button>

        {advActiveCount > 0 && (
          <button onClick={clearAdvFilters} className="h-8 px-2 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors font-medium">
            <X size={11} className="inline mr-0.5" />Clear all
          </button>
        )}

        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 font-medium">1 unsaved sale</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {sales.length}</div>
      </div>

      {/* Advanced Filter Panel */}
      {advOpen && (
        <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/50 rounded-xl p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={13} className="text-indigo-500" />
              <span className="text-[12px] font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">Advanced Filters</span>
              {advActiveCount > 0 && (
                <span className="px-1.5 py-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full">{advActiveCount} active</span>
              )}
            </div>
            {advActiveCount > 0 && (
              <button onClick={clearAdvFilters} className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold flex items-center gap-1">
                <X size={10} /> Reset all
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">

            {/* Area */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <MapPin size={10} className="text-violet-500" /> Area (Agent)
              </label>
              <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
                className="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">All Areas</option>
                {agentAreaOpts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Customer */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <UserCheck size={10} className="text-emerald-500" /> Customer
              </label>
              <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
                className="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">All Customers</option>
                {customerOpts.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Sales Agent */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Users2 size={10} className="text-blue-500" /> Sales Agent
              </label>
              <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
                className="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">All Agents</option>
                {agentOpts.map(a => <option key={a.id} value={a.name}>{a.name} ({a.code})</option>)}
              </select>
            </div>

            {/* Payment Mode */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Wallet size={10} className="text-amber-500" /> Payment Mode
              </label>
              <select value={filterPayMode} onChange={e => setFilterPayMode(e.target.value)}
                className="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">All Modes</option>
                {SALE_PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Payment Status */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <BadgeCheck size={10} className="text-teal-500" /> Payment Status
              </label>
              <select value={filterPayStatus} onChange={e => setFilterPayStatus(e.target.value)}
                className="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">All Statuses</option>
                <option value="paid">Paid in Full</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial Payment</option>
                <option value="overdue">Overdue (On Credit)</option>
              </select>
            </div>

            {/* Date From */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Calendar size={10} className="text-rose-500" /> Date From
              </label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                className="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            {/* Date To */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Calendar size={10} className="text-rose-500" /> Date To
              </label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                className="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

          </div>

          {/* Active filter chips */}
          {advActiveCount > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800/40">
              {filterArea     && <Chip label={`Area: ${filterArea}`}       onRemove={() => setFilterArea("")} color="violet" />}
              {filterCustomer && <Chip label={`Customer: ${filterCustomer}`} onRemove={() => setFilterCustomer("")} color="emerald" />}
              {filterAgent    && <Chip label={`Agent: ${filterAgent}`}     onRemove={() => setFilterAgent("")} color="blue" />}
              {filterPayMode  && <Chip label={`Mode: ${filterPayMode}`}    onRemove={() => setFilterPayMode("")} color="amber" />}
              {filterPayStatus && <Chip label={`Pay: ${filterPayStatus}`}  onRemove={() => setFilterPayStatus("")} color="teal" />}
              {filterDateFrom && <Chip label={`From: ${filterDateFrom}`}   onRemove={() => setFilterDateFrom("")} color="rose" />}
              {filterDateTo   && <Chip label={`To: ${filterDateTo}`}       onRemove={() => setFilterDateTo("")} color="rose" />}
            </div>
          )}
        </div>
      )}

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

      {/* ── Sale Complete overlay ─────────────────────────────────────────── */}
      {completedSaleForReceipt && (
        <SaleCompleteModal
          sale={completedSaleForReceipt}
          onNewSale={() => {
            setCompletedSaleForReceipt(null);
            const draft = addSale(blankSale());
            freshSaleIdRef.current = draft.id;
            openDetailDirect(draft);
          }}
          onClose={() => setCompletedSaleForReceipt(null)}
        />
      )}

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
