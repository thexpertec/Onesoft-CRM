import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useSales, useCustomers, useStock, useSaleReturns, useInvoices } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import {
  Sale, SaleItem, SaleStatus, SalePayment, SaleReturn, Invoice,
  SALE_STATUSES,
  getProducts, getCustomers, getProductCategories, getSales, getSalesAgents, Product, ProductVariant,
  getStock, deductStockForSale, restoreStockForSale, getSettings, saveSettings, autoPostSaleJE,
  importOnlineSalesFromKv, findProductForItem, effectiveItemCost, getProductStockQty,
  getCashBankLedgers, getPaymentAccounts, Account, autoPostCashReceiptJE, getJournalEntries, getAccounts,
  getCustomerWalletBalance,
} from "@/lib/store";
import { buildSaleReceiptHtml, printReceiptHtml, printSaleInvoice } from "@/lib/print-invoice";
import { kvGet } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Minus, Search, X, Save, Trash2, Eye,
  ShoppingCart, Check, RotateCcw, Ban, CreditCard, Banknote,
  ArrowLeft, Package, ChevronDown, Lock, Printer, SlidersHorizontal, ChevronUp,
  MapPin, UserCheck, Users2, Calendar, Wallet, BadgeCheck, ScanLine,
  LayoutGrid, List, RefreshCw, Globe,
  CheckCircle2, Circle, Clock, XCircle, Truck, DollarSign, Undo2, Wrench,
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
import { SelectCombobox } from "@/components/select-combobox";
import { getSettingsCurrencySymbol, fmtMoney, getSettingsDecimalPlaces } from "@/lib/currencies";

const dp = getSettingsDecimalPlaces();

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_BG: Record<string, string> = {
  Pending:     "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
  Draft:       "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
  Hold:        "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  Completed:   "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "On Credit": "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  Refunded:    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Returned:    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Cancelled:   "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
  // Invoice-specific statuses
  Sent:        "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  Paid:        "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  Partial:     "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Overdue:     "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
};

/** Returns the human-readable status label for display.
 *  POS orders with status "Draft" are shown as "Hold" — matching the Hold button in POS. */
function saleDisplayStatus(sale: Sale): string {
  if (sale.status === "Draft" && (sale.orderType === "POS" || !sale.orderType)) return "Hold";
  return sale.status;
}


function getPaymentIcon(method: string): React.ReactNode {
  const m = (method || "").toLowerCase();
  if (m === "credit")                        return <CreditCard size={12} className="text-orange-500" />;
  if (m.includes("cash"))                    return <Banknote size={12} className="text-emerald-500" />;
  if (m.includes("card"))                    return <CreditCard size={12} className="text-blue-500" />;
  if (m.includes("cheque") || m.includes("check")) return <Receipt size={12} className="text-gray-500" />;
  if (m.includes("wallet"))                  return <Wallet size={12} className="text-cyan-500" />;
  // Default: bank icon for named bank accounts (HBL, MCB, etc.)
  return <CreditCard size={12} className="text-violet-500" />;
}

const lineTotal = (item: SaleItem): number => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  // BOGO: every 2nd unit is free → charge for ceil(q/2) units
  if (item.bogoApplied) return Math.ceil(q / 2) * p;
  const d = parseFloat(item.discount) || 0;
  if (item.discountType === "amt") return Math.max(0, q * p - d);
  return q * p * (1 - d / 100);
};

const lineDiscAmt = (item: SaleItem): number => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  // BOGO: discount = value of free units = floor(q/2) units
  if (item.bogoApplied) return Math.floor(q / 2) * p;
  const d = parseFloat(item.discount) || 0;
  if (item.discountType === "amt") return Math.min(d, q * p);
  return q * p * (d / 100);
};

const saleTotal    = (items: SaleItem[]): number => items.reduce((s, i) => s + lineTotal(i), 0);

/** Full order total — items after line-discounts → invoice-discount → tax → delivery. */
const saleTotalFull = (sale: Sale): number => {
  const sub       = saleTotal(sale.items);
  const invDiscVal = parseFloat(sale.invoiceDiscount || "0") || 0;
  const afterDisc  = invDiscVal <= 0 ? sub
    : sale.invoiceDiscountType === "amt"
      ? Math.max(0, sub - invDiscVal)
      : sub * (1 - invDiscVal / 100);
  const taxPct    = (parseFloat(sale.taxRate || "0") || 0) / 100;
  const delivery  = parseFloat(sale.deliveryCharges || "0") || 0;
  return afterDisc * (1 + taxPct) + delivery;
};
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

// ─── Unified row type: Sale rows + adapted Sale Return rows + adapted Invoice rows ──
type SaleRowData = Sale & { _returnRef?: SaleReturn; _invoiceRef?: Invoice };

/** Adapt a SaleReturn into a display-compatible SaleRowData for the unified table. */
function adaptReturn(r: SaleReturn): SaleRowData {
  return {
    id:            r.id,
    saleNumber:    r.returnNumber,
    saleDate:      r.date,
    customer:      r.customer,
    orderType:     "Sale Return" as unknown as "POS" | "Invoice" | "Online",
    status:        r.status === "posted" ? "Completed" as SaleStatus : "Draft" as SaleStatus,
    items:         r.items.map((i, idx) => ({
      id:           `${r.id}-${idx}`,
      productName:  i.productName,
      sku:          i.sku || "",
      qty:          String(i.qty),
      unit:         i.unit || "pcs",
      unitPrice:    String(i.unitPrice),
      discount:     String(i.discount || "0"),
      discountType: "flat" as "pct" | "amt",
      notes:        "",
      itemStatus:   "Pending" as import("@/lib/store").ItemStatus,
    })),
    paymentMethod:       r.refundMethod,
    amountPaid:          String(r.grandTotal),
    taxRate:             "0",
    invoiceDiscount:     "0",
    invoiceDiscountType: "pct",
    deliveryCharges:     "0",
    saleMode:            "Retail",
    deliveryStatus:      "Delivered",
    paidAt:              r.date,
    stockDeducted:       true,
    notes:               [r.reason, r.notes].filter(Boolean).join(" · "),
    createdAt:           r.createdAt,
    updatedAt:           r.updatedAt,
    _returnRef:          r,
  };
}

/** Compute the grand total for a sale Invoice (items − discounts + tax + shipping + handling). */
function invoiceTotalFull(inv: Invoice): number {
  const sub     = inv.items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.unitPrice)||0), 0);
  const discAmt = inv.items.reduce((s, i) => {
    const q = parseFloat(i.qty)||0, p = parseFloat(i.unitPrice)||0, d = parseFloat(i.discount)||0;
    return s + (i.discountType === "amt" ? Math.min(d, q * p) : q * p * d / 100);
  }, 0);
  const after = sub - discAmt;
  const tax   = after * (parseFloat(inv.taxRate)||0) / 100;
  const ship  = parseFloat(inv.shippingFee)||0;
  const hand  = parseFloat(inv.handlingFee)||0;
  return after + tax + ship + hand;
}

/** Map Invoice status to the nearest SaleStatus for filter compatibility. */
function invStatusToSaleStatus(s: string): SaleStatus {
  if (s === "Paid")      return "Completed";
  if (s === "Cancelled") return "Cancelled";
  if (s === "Draft")     return "Draft";
  return "Pending";
}

/** Adapt a sale Invoice into a display-compatible SaleRowData for the unified table. */
function adaptInvoice(inv: Invoice): SaleRowData {
  return {
    id:                  inv.id,
    saleNumber:          inv.invoiceNumber,
    saleDate:            inv.invoiceDate,
    customer:            inv.customer,
    orderType:           "Invoice" as "Invoice",
    status:              invStatusToSaleStatus(inv.status),
    items:               inv.items,
    paymentMethod:       inv.paymentMethod,
    amountPaid:          inv.amountPaid,
    taxRate:             inv.taxRate,
    invoiceDiscount:     "0",
    invoiceDiscountType: "pct",
    deliveryCharges:     "0",
    saleMode:            "Retail",
    deliveryStatus:      "Delivered",
    paidAt:              inv.paidAt,
    stockDeducted:       inv.stockDeducted,
    notes:               inv.notes,
    agentId:             inv.agentId,
    agentName:           inv.agentName,
    createdAt:           inv.createdAt,
    updatedAt:           inv.updatedAt,
    _invoiceRef:         inv,
  };
}

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

type LocalMeta = {
  customer: string; saleDate: string; paymentMethod: SalePayment; notes: string;
  agentId?: string; agentName?: string;
  saleMode?: "Retail" | "Wholesale" | "Clubcard";
  deliveryStatus?: "Pending" | "Processing" | "Shipped" | "Delivered";
  deliveryCharges?: string;
  invoiceDiscount?: string;
  invoiceDiscountType?: "pct" | "amt";
  taxRate?: string;
};

const DELIVERY_STATUSES = ["Pending", "Processing", "Shipped", "Delivered"] as const;
const DELIVERY_STATUS_COLOR: Record<string, string> = {
  Pending: "#9ca3af", Processing: "#f59e0b", Shipped: "#3b82f6", Delivered: "#10b981",
};

const defaultPayMethod = (): string =>
  getPaymentAccounts().find(a => a.isActive !== false)?.accountTitle ?? "Cash";

const blankSale = (): Omit<Sale, "id" | "saleNumber" | "createdAt" | "updatedAt"> => ({
  saleDate: new Date().toISOString().slice(0, 10),
  customer: "Walk-in", status: "Draft", paymentMethod: defaultPayMethod(), notes: "", items: [],
  taxRate: "0", amountPaid: "0", paidAt: "", stockDeducted: false,
  saleMode: "Retail", deliveryStatus: "Pending",
  deliveryCharges: "0", invoiceDiscount: "0", invoiceDiscountType: "pct",
  orderType: "POS",
});

const blankNewRow = (): Record<string, string> => ({
  saleDate: new Date().toISOString().slice(0, 10),
  customer: "", status: "Draft", paymentMethod: defaultPayMethod(), notes: "",
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

  const subtotal      = sale.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
  const lineDiscAmt   = discountTotal(sale.items);
  const afterLineDisc = subtotal - lineDiscAmt;
  const invDiscVal    = parseFloat(sale.invoiceDiscount || "0") || 0;
  const invDiscAmt    = sale.invoiceDiscountType === "amt"
    ? Math.min(invDiscVal, afterLineDisc) : afterLineDisc * invDiscVal / 100;
  const afterDisc     = Math.max(0, afterLineDisc - invDiscAmt);
  const taxRate       = parseFloat(sale.taxRate || "0") || 0;
  const taxAmt        = afterDisc * taxRate / 100;
  const deliveryAmt   = parseFloat(sale.deliveryCharges || "0") || 0;
  const total         = afterDisc + taxAmt + deliveryAmt;
  const paid          = parseFloat(sale.amountPaid || "0") || 0;
  const change        = Math.max(0, paid - total);
  const balance       = Math.max(0, total - paid);
  const discAmt       = lineDiscAmt + invDiscAmt;
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
            {deliveryAmt > 0 && (
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Delivery</span><span>+{fmt(deliveryAmt)}</span>
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
  saleNumber:            string;
  total:                 number;
  customer?:             string;
  walletBalance?:        number; // customer advance credit available
  defaultPaymentMethod?: SalePayment;
  defaultNotes?:         string;
  onConfirm: (amountPaid: string, paymentMethod: SalePayment, notes: string, walletUsed: number) => void;
  onCancel: () => void;
}

// Colour palette cycled across COA-based payment tiles
const PAY_TILE_PALETTE = [
  { color: "text-emerald-600 bg-emerald-50  dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-700", ring: "ring-emerald-500" },
  { color: "text-blue-600    bg-blue-50     dark:bg-blue-950/40    border-blue-200    dark:border-blue-700",    ring: "ring-blue-500"    },
  { color: "text-violet-600  bg-violet-50   dark:bg-violet-950/40  border-violet-200  dark:border-violet-700",  ring: "ring-violet-500"  },
  { color: "text-amber-600   bg-amber-50    dark:bg-amber-950/40   border-amber-200   dark:border-amber-700",   ring: "ring-amber-500"   },
  { color: "text-cyan-600    bg-cyan-50     dark:bg-cyan-950/40    border-cyan-200    dark:border-cyan-700",    ring: "ring-cyan-500"    },
  { color: "text-rose-600    bg-rose-50     dark:bg-rose-950/40    border-rose-200    dark:border-rose-700",    ring: "ring-rose-500"    },
];

function payTileIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("cash")) return <Banknote size={26} />;
  if (n.includes("wallet")) return <Wallet size={26} />;
  return <CreditCard size={26} />;
}

function PaymentModal({ saleNumber, total, customer = "", walletBalance = 0, defaultPaymentMethod = "Cash", defaultNotes = "", onConfirm, onCancel }: PaymentModalProps) {
  // Walk-in = no named customer selected
  const isWalkIn = !customer.trim() || customer.trim().toLowerCase() === "walk-in";

  // Load Cash & Bank ledger accounts from COA — these become the payment method tiles.
  // Credit is excluded from POS entirely.
  const cbLedgers: Account[] = useMemo(() => getCashBankLedgers(), []);

  // Determine a valid initial payment method: prefer defaultPaymentMethod if it matches a COA account name,
  // otherwise fall back to the first available account or "Cash".
  const resolveDefault = (): SalePayment => {
    if (!cbLedgers.length) return "Cash";
    const match = cbLedgers.find(a => a.name.toLowerCase() === (defaultPaymentMethod || "").toLowerCase());
    return match ? match.name : cbLedgers[0].name;
  };

  // Wallet: auto-applied for named customers (not walk-in)
  const initWalletUsed = !isWalkIn ? Math.min(Math.max(0, walletBalance), total) : 0;
  const [walletUsed, setWalletUsed] = useState(initWalletUsed);
  const [payAmount, setPayAmount]   = useState(() => {
    if (isWalkIn) return total.toFixed(2);
    return Math.max(0, total - initWalletUsed).toFixed(2);
  });
  const [payMethod, setPayMethod] = useState<SalePayment>(resolveDefault);
  const [notes,     setNotes]     = useState(defaultNotes);

  const sym  = getSettingsCurrencySymbol();
  const dp   = getSettingsDecimalPlaces();
  const fmt  = (n: number) => `${sym}${n.toFixed(dp)}`;
  const paid         = parseFloat(payAmount) || 0;
  const totalCovered = paid + walletUsed;
  const remaining    = total - totalCovered;
  const excessCash   = Math.max(0, totalCovered - total);

  // For walk-ins: confirm is disabled unless the full cash amount covers the bill
  const walkInUnderPaid = isWalkIn && paid < total - 0.005;

  const presets = [
    { label: "Exact", value: total.toFixed(dp) },
    ...([5, 10, 20, 50, 100, 200, 500].filter(v => v >= Math.ceil(total)).slice(0, 5).map(v => ({ label: `${sym}${v}`, value: String(v) }))),
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex">

        {/* ── LEFT: Amount ─────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col px-6 pt-5 pb-5 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Payment · {saleNumber}</div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-1">Total to Collect</div>
            <div className="text-[44px] font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums leading-none">{fmt(total)}</div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Amount Received</div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[22px] font-black text-gray-400 dark:text-zinc-500 pointer-events-none">{sym}</span>
              <input
                type="number" min="0" step="0.01"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                onFocus={e => { if (e.target.value === "0") setPayAmount(""); }}
                className="w-full pl-10 pr-3 py-3 text-[32px] font-black text-gray-900 dark:text-gray-100 bg-white dark:bg-zinc-700 border-2 border-gray-200 dark:border-zinc-600 rounded-xl outline-none focus:border-blue-400 dark:focus:border-blue-500 font-mono tabular-nums transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {presets.map(p => (
              <button key={p.label} onClick={() => setPayAmount(p.value)}
                className="py-2 text-[12px] font-bold rounded-lg bg-white dark:bg-zinc-700 border-2 border-gray-200 dark:border-zinc-600 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 text-gray-700 dark:text-gray-200 transition-all">
                {p.label}
              </button>
            ))}
          </div>

          {/* Wallet applied strip */}
          {walletUsed > 0.005 && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-blue-500 shrink-0"/>
                <span className="text-[12px] font-semibold text-blue-600 dark:text-blue-400">Wallet Applied</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[18px] font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums">{fmt(walletUsed)}</span>
                <button
                  onClick={() => { setWalletUsed(0); setPayAmount(total.toFixed(dp)); }}
                  className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 flex items-center justify-center hover:bg-blue-300 dark:hover:bg-blue-700 transition-colors"
                  title="Remove wallet">
                  <X size={10}/>
                </button>
              </div>
            </div>
          )}

          {/* Balance / excess display */}
          {remaining > 0.005 ? (
            <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-xl px-4 py-2.5">
              <span className="text-[12px] font-semibold text-orange-600 dark:text-orange-400">Remaining</span>
              <span className="text-[22px] font-black text-orange-600 dark:text-orange-400 font-mono tabular-nums leading-none">{fmt(remaining)}</span>
            </div>
          ) : totalCovered > 0 ? (
            <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl px-4 py-2.5">
              <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                {paid <= 0.005 ? "Covered by wallet" : "Fully paid"}
              </span>
              {excessCash > 0.005 && paid > 0 && (
                isWalkIn ? (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                    <Banknote size={10}/> Change: {fmt(excessCash)}
                  </span>
                ) : (
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                    <Wallet size={10}/> {fmt(excessCash)} → wallet
                  </span>
                )
              )}
            </div>
          ) : null}

          {walkInUnderPaid && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-xs font-semibold text-red-600 dark:text-red-400">
              Walk-in customers must pay the full amount.
            </div>
          )}

          {isWalkIn && excessCash > 0.005 && paid > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Banknote size={12} className="shrink-0"/>
              Walk-in customers cannot hold advance credit — return {fmt(excessCash)} as change.
            </div>
          )}

          <div className="flex gap-2 mt-auto">
            <button
              onClick={() => !walkInUnderPaid && onConfirm(payAmount, payMethod, notes, walletUsed)}
              disabled={walkInUnderPaid}
              className={`flex-1 h-11 rounded-xl text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-all ${walkInUnderPaid ? "bg-gray-300 dark:bg-zinc-600 cursor-not-allowed shadow-none" : "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200/60 dark:shadow-none"}`}>
              <Check size={16} /> Confirm Payment
            </button>
            <button onClick={onCancel}
              className="h-11 px-5 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-[13px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>

        {/* ── RIGHT: Payment method + Notes ────────────────────────────── */}
        <div className="w-[240px] flex-shrink-0 flex flex-col border-l border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/60 px-4 pt-5 pb-5 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Payment Method</div>
            <div className="grid grid-cols-2 gap-2">
              {cbLedgers.length > 0 ? cbLedgers.map((acct, idx) => {
                const palette = PAY_TILE_PALETTE[idx % PAY_TILE_PALETTE.length];
                const isSelected = payMethod === acct.name;
                return (
                  <button key={acct.id} onClick={() => setPayMethod(acct.name)}
                    className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 font-semibold text-[11px] transition-all ${palette.color} ${isSelected ? `${palette.ring} ring-2 ring-offset-1 shadow-sm scale-[1.03]` : "opacity-70 hover:opacity-100 hover:scale-[1.01]"}`}>
                    {payTileIcon(acct.name)}
                    <span className="leading-tight text-center">{acct.name}</span>
                  </button>
                );
              }) : (
                // Fallback when no COA Cash & Bank accounts exist yet
                <button className="col-span-2 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 font-semibold text-[11px] text-emerald-600 bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500 ring-offset-1 shadow-sm scale-[1.03]">
                  <Banknote size={26} /><span>Cash</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 mt-auto">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Notes</div>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Order notes (optional)…"
              className="w-full resize-none rounded-xl border-2 border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-700 px-3 py-2 text-[12px] text-gray-700 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Variant Picker Dialog ────────────────────────────────────────────────────
interface VariantPickerDialogProps {
  product: Product | null;
  priceMode: "retail" | "wholesale" | "clubcard";
  localItems: SaleItem[];
  onClose: () => void;
  onAdd: (variantSku: string, variantName: string, variantPrice: string, qty: number, unit: string, costPrice: string) => void;
  onAddBase: (product: Product) => void;
}

function VariantPickerDialog({ product, priceMode, localItems, onClose, onAdd, onAddBase }: VariantPickerDialogProps) {
  const curr = getSettingsCurrencySymbol();
  const variants = product?.variants ?? [];
  const attrName = variants[0] ? Object.keys(variants[0].attributes)[0] ?? "" : "";

  const allowNegativeStock = getSettings().allowNegativeStock !== false;

  // Build stock + cart maps for quick lookup
  const stockMap = useMemo<Record<string, number>>(() => {
    const all = getStock();
    const m: Record<string, number> = {};
    all.forEach(s => { m[s.sku] = (m[s.sku] ?? 0) + (parseFloat(s.quantity) || 0); });
    return m;
  }, [product]);

  const cartQtyMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    localItems.forEach(i => { m[i.sku] = (m[i.sku] ?? 0) + (parseFloat(i.qty) || 0); });
    return m;
  }, [localItems]);

  const [selected, setSelected] = useState<ProductVariant | null>(null);
  const [qty, setQty] = useState(1);

  // Reset when product changes
  useEffect(() => {
    setSelected(null);
    setQty(1);
  }, [product?.id]);

  const variantLabel = (v: ProductVariant) => Object.values(v.attributes).join(" / ");

  const resolvedPrice = (v: ProductVariant) => {
    const base = priceMode === "wholesale" && product?.wholesalePrice
      ? product.wholesalePrice
      : priceMode === "clubcard" && product?.clubcardPrice
        ? product.clubcardPrice
        : v.price || product?.price || "0.00";
    return base;
  };

  const variantStock = (v: ProductVariant) => {
    const sku = v.sku || product?.sku || "";
    return stockMap[sku] ?? null;
  };

  const isBlocked = (v: ProductVariant) => {
    if (allowNegativeStock) return false;
    const stk = variantStock(v);
    if (stk === null) return false;
    const inCart = cartQtyMap[v.sku || product?.sku || ""] || 0;
    return (stk - inCart) <= 0;
  };

  const handleAdd = () => {
    if (!selected || !product) return;
    const sku = selected.sku || product.sku;
    const name = `${product.name} — ${variantLabel(selected)}`;
    const price = resolvedPrice(selected);
    const variantCost = selected.costPrice ?? product.costPrice ?? "0";
    onAdd(sku, name, price, qty, product.unit || "pcs", variantCost);
  };

  if (!product) return null;

  const selStock = selected ? variantStock(selected) : null;
  const selInCart = selected ? (cartQtyMap[selected.sku || product.sku] || 0) : 0;
  const selAvailable = selStock !== null ? selStock - selInCart : null;

  return (
    <Dialog open={!!product} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[820px] w-[95vw] p-0 overflow-hidden rounded-2xl gap-0 flex flex-col max-h-[90vh]">
        {/* Header — fixed */}
        <div className="flex-shrink-0 flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800">
          {product.thumbnail && (
            <img src={product.thumbnail} alt={product.name}
              className="w-14 h-14 rounded-xl object-cover border border-gray-200 dark:border-zinc-700 flex-shrink-0" loading="lazy" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[15px] text-gray-900 dark:text-gray-100 leading-snug line-clamp-2">{product.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {product.brand && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 uppercase tracking-wide">{product.brand}</span>
              )}
              {product.category && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">{product.category}</span>
              )}
            </div>
          </div>
        </div>

        {/* Variant chips — scrollable, fills available space */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-3">
          {attrName && (
            <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">
              Choose {attrName}:
            </p>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
            {variants.map(v => {
              const label = variantLabel(v);
              const price = resolvedPrice(v);
              const blocked = isBlocked(v);
              const isSelected = selected?.id === v.id;
              const stk = variantStock(v);
              const inCart = cartQtyMap[v.sku || product.sku] || 0;
              const avail = stk !== null ? stk - inCart : null;
              return (
                <button
                  key={v.id}
                  disabled={blocked}
                  onClick={() => { setSelected(v); setQty(1); }}
                  className={`relative flex flex-col items-center gap-0.5 px-3.5 py-2.5 rounded-xl border-2 transition-all text-left min-w-[80px] ${
                    blocked
                      ? "border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 opacity-50 cursor-not-allowed"
                      : isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-sm"
                        : "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm"
                  }`}>
                  {v.image && (
                    <img src={v.image} alt={label}
                      className="w-10 h-10 object-cover rounded-lg mb-1 border border-gray-100 dark:border-zinc-700" loading="lazy" />
                  )}
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check size={9} strokeWidth={3} className="text-white" />
                    </span>
                  )}
                  <span className={`text-[12px] font-semibold leading-tight text-center ${
                    isSelected ? "text-blue-700 dark:text-blue-300" : "text-gray-800 dark:text-gray-200"
                  }`}>{label}</span>
                  <span className={`text-[11px] font-bold font-mono tabular-nums ${
                    priceMode === "wholesale" ? "text-purple-600 dark:text-purple-400"
                    : priceMode === "clubcard" ? "text-teal-600 dark:text-teal-400"
                    : "text-emerald-600 dark:text-emerald-400"
                  }`}>{curr}{parseFloat(price || "0").toFixed(dp)}</span>
                  {blocked ? (
                    <span className="text-[9px] text-red-500 font-semibold">No Stock</span>
                  ) : avail !== null ? (
                    <span className={`text-[9px] font-medium ${avail <= 5 ? "text-amber-500" : "text-gray-400 dark:text-zinc-500"}`}>
                      {avail <= 0 ? "0 left" : avail <= 5 ? `⚠ ${avail} left` : `${avail} in stock`}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom panel — fixed, never pushed off screen */}
        <div className="flex-shrink-0 border-t border-gray-100 dark:border-zinc-800">
          {/* Selected info + qty stepper */}
          {selected && (
            <div className="px-5 pt-3 pb-3 space-y-3">
              <div className="flex items-center gap-4 py-2 px-3.5 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-800">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-500 dark:text-zinc-400">Selected</p>
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{variantLabel(selected)}</p>
                  <p className={`text-[13px] font-extrabold font-mono tabular-nums ${
                    priceMode === "wholesale" ? "text-purple-600 dark:text-purple-400"
                    : priceMode === "clubcard" ? "text-teal-600 dark:text-teal-400"
                    : "text-emerald-600 dark:text-emerald-400"
                  }`}>{curr}{parseFloat(resolvedPrice(selected) || "0").toFixed(dp)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {selAvailable !== null && (
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 dark:text-zinc-500">Stock</p>
                      <p className={`text-[13px] font-bold tabular-nums ${
                        selAvailable <= 0 ? "text-red-500" : selAvailable <= 5 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"
                      }`}>{selAvailable}</p>
                    </div>
                  )}
                  {/* Qty stepper inline */}
                  <div className="flex items-center gap-0">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-l-lg border border-r-0 border-gray-200 dark:border-zinc-700 flex items-center justify-center text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 active:bg-gray-200 transition-colors">
                      <Minus size={13} strokeWidth={2.5} />
                    </button>
                    <div className="w-10 h-8 border-y border-gray-200 dark:border-zinc-700 flex items-center justify-center text-[14px] font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-zinc-900 tabular-nums select-none">
                      {qty}
                    </div>
                    <button onClick={() => setQty(q => q + 1)}
                      className="w-8 h-8 rounded-r-lg border border-l-0 border-gray-200 dark:border-zinc-700 flex items-center justify-center text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 active:bg-gray-200 transition-colors">
                      <Plus size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 pb-5 pt-1 flex flex-col gap-2">
            <Button
              onClick={handleAdd}
              disabled={!selected}
              className="w-full h-11 text-[14px] font-bold rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40">
              <ShoppingCart size={16} />
              {selected ? `Add ${qty > 1 ? `${qty}×` : ""} ${variantLabel(selected)} to Cart` : "Select a variant above"}
            </Button>
            <button
              onClick={() => { onAddBase(product); onClose(); }}
              className="text-[11px] text-gray-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors py-1 text-center w-full">
              Add base product without variant
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── POS Full-Page Layout ─────────────────────────────────────────────────────
interface POSViewProps {
  sale: Sale;
  localItems: SaleItem[];
  localMeta: LocalMeta;
  isFresh: boolean;
  customerComboOpts: ComboOption[];
  productComboOpts: ComboOption[];
  agentOpts: { id: string; code: string; name: string }[];
  onClose: () => void;
  onMetaChange: (meta: Partial<LocalMeta>) => void;
  onSaveMeta: () => void;
  onItemChange: (itemId: string, field: keyof SaleItem, value: string) => void;
  onItemBlur: () => void;
  onSaveItems: (items: SaleItem[]) => void;
  onDeleteItem: (itemId: string) => void;
  onAddProduct: (product: Product) => void;
  priceMode: "retail" | "wholesale" | "clubcard";
  onPriceModeChange: (mode: "retail" | "wholesale" | "clubcard") => void;
  onSetStatus: (status: SaleStatus) => void;
  onComplete: (amountPaid: string, paymentMethod: SalePayment, notes: string, walletUsed?: number) => void;
  onAcceptOrder?: () => void;
  onAddCustomer: (name: string, phone: string, city: string, company?: string) => void;
  tenantId: string | null;
}

// ─── Order Pipeline (admin) ───────────────────────────────────────────────────
const DELIVERY_STAGES = ["Pending", "Processing", "Shipped", "Delivered"] as const;
type DeliveryStage = (typeof DELIVERY_STAGES)[number];
const DELIVERY_RANK: Record<DeliveryStage, number> = { Pending: 0, Processing: 1, Shipped: 2, Delivered: 3 };

function AdminOrderPipeline({
  sale,
  deliveryStatus,
  onChangeDelivery,
}: {
  sale: Sale;
  deliveryStatus: DeliveryStage;
  onChangeDelivery: (ds: DeliveryStage) => void;
}) {
  const isOnline = sale.orderType === "Online";
  const [expanded, setExpanded] = useState(isOnline);

  const rank = DELIVERY_RANK[deliveryStatus] ?? 0;
  const isCancelled = sale.status === "Cancelled" || sale.status === "Refunded";
  const isDraft      = sale.status === "Draft" || sale.status === "Pending";

  type Stage = { key: string; label: string; desc: string; done: boolean; active: boolean; ds?: DeliveryStage };

  const stages: Stage[] = [
    {
      key: "placed", label: "Order Placed",
      desc: new Date(sale.saleDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      done: true, active: false,
    },
    {
      key: "confirmed", label: "Confirmed",
      desc: isDraft ? "Awaiting confirmation" : "Order accepted",
      done: !isDraft && !isCancelled, active: false,
    },
    {
      key: "processing", label: "Processing",
      desc: rank >= 1 ? "Preparing for dispatch" : "Not yet started",
      done: rank >= 1, active: rank === 0 && !isCancelled && !isDraft,
      ds: "Processing",
    },
    {
      key: "shipped", label: "Shipped",
      desc: rank >= 2 ? "On the way" : "Not yet dispatched",
      done: rank >= 2, active: rank === 1,
      ds: "Shipped",
    },
    {
      key: "delivered", label: "Delivered",
      desc: rank >= 3 ? "Successfully delivered" : "Awaiting delivery",
      done: rank >= 3, active: rank === 2,
      ds: "Delivered",
    },
  ];

  const currentStageLabel = isCancelled
    ? sale.status
    : deliveryStatus === "Delivered" ? "Delivered"
    : deliveryStatus === "Shipped" ? "Shipped"
    : deliveryStatus === "Processing" ? "Processing"
    : isDraft ? "Placed" : "Confirmed";

  const stageBadgeColor = isCancelled
    ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
    : currentStageLabel === "Delivered" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    : currentStageLabel === "Shipped"   ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
    : currentStageLabel === "Processing"? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

  return (
    <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">

      {/* ── Collapsed bar ─────────────────────────────────────────────────────── */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 px-6 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800/60 transition-colors group"
        >
          <ChevronDown size={13} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors shrink-0" />
          <span className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">Order Pipeline</span>
          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${stageBadgeColor}`}>{currentStageLabel}</span>
          {isCancelled && (
            <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
              · This order has been {sale.status.toLowerCase()}
            </span>
          )}
        </button>
      )}

      {/* ── Expanded pipeline ─────────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-6 py-2.5">
          <div className="flex items-start">
            {stages.map((stage, idx) => {
              const effectiveDone   = isCancelled ? stage.key === "placed" : stage.done;
              const effectiveActive = isCancelled ? false : stage.active;
              const isCancelledStage = isCancelled && stage.key !== "placed";

              const lineColor = isCancelled
                ? "bg-red-200 dark:bg-red-900/40"
                : (stages[idx - 1]?.done ? "bg-emerald-400 dark:bg-emerald-600" : "bg-gray-200 dark:bg-zinc-700");

              const canClick = !isDraft && !isCancelled && stage.ds !== undefined;

              const labelColor = isCancelledStage
                ? "text-red-400 dark:text-red-500"
                : effectiveDone
                  ? "text-emerald-700 dark:text-emerald-400"
                  : effectiveActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-400 dark:text-zinc-500";

              return (
                <div key={stage.key} className="flex-1 flex flex-col items-center relative min-w-0">
                  {idx > 0 && (
                    <div className={`absolute top-[9px] right-1/2 w-full h-[2px] ${lineColor}`} />
                  )}
                  <button
                    disabled={!canClick}
                    onClick={() => stage.ds && onChangeDelivery(stage.ds)}
                    title={canClick ? `Mark as ${stage.ds}` : undefined}
                    className={`relative z-10 bg-white dark:bg-zinc-900 px-1 transition-transform ${canClick ? "hover:scale-110 cursor-pointer" : "cursor-default"}`}
                  >
                    {isCancelledStage ? (
                      <XCircle size={19} className="text-red-400 dark:text-red-500" />
                    ) : effectiveDone ? (
                      <CheckCircle2 size={19} className="text-emerald-500 dark:text-emerald-400" />
                    ) : effectiveActive ? (
                      <Clock size={19} className="text-blue-500 dark:text-blue-400 animate-pulse" />
                    ) : (
                      <Circle size={19} className="text-gray-300 dark:text-zinc-600" />
                    )}
                  </button>
                  <p className={`mt-1 text-[10.5px] font-semibold text-center leading-tight truncate w-full px-0.5 ${labelColor}`}>
                    {stage.label}
                  </p>
                  <p className="text-[9.5px] text-center text-gray-400 dark:text-zinc-600 leading-tight truncate w-full px-0.5 hidden lg:block">
                    {stage.desc}
                  </p>
                </div>
              );
            })}

            {/* Collapse toggle */}
            <button
              onClick={() => setExpanded(false)}
              title="Collapse pipeline"
              className="shrink-0 ml-4 self-start mt-0.5 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronUp size={14} />
            </button>
          </div>
          {isCancelled && (
            <p className="text-center text-[10px] text-red-500 dark:text-red-400 font-medium mt-1">
              This order has been {sale.status.toLowerCase()}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function POSView({
  sale, localItems, localMeta, isFresh, customerComboOpts, productComboOpts, agentOpts,
  onClose, onMetaChange, onSaveMeta, onItemChange, onItemBlur,
  onSaveItems, onDeleteItem, onAddProduct, priceMode, onPriceModeChange,
  onSetStatus, onComplete, onAcceptOrder, onAddCustomer, tenantId,
}: POSViewProps) {
  const { stock } = useStock();
  const settings = getSettings();
  const dp  = getSettingsDecimalPlaces();
  const sym = getSettingsCurrencySymbol();
  const [prodSearch,    setProdSearch]    = useState("");
  const [catFilter,     setCatFilter]     = useState("All");
  const [prodSort,      setProdSort]      = useState("listing");
  const [payModalOpen,  setPayModalOpen]  = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [resetConfirmOpen,  setResetConfirmOpen]  = useState(false);
  const [scannerOpen,   setScannerOpen]   = useState(false);
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const [showTotalsDetail, setShowTotalsDetail] = useState(false);
  const [prodView, setProdView] = useState<"image" | "list">(() => getSettings().posProductView ?? "image");
  const [dropdownIdx, setDropdownIdx] = useState(-1);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // ── Barcode / QR scanner — shared lookup for both camera and keyboard ──────
  const handleScan = useCallback(async (code: string) => {
    // ── Clubcard QR detection (format: CCxxxx-9999) ──────────────────────────
    if (/^CC[A-Z]{4}-\d{4}$/.test(code)) {
      setScannerOpen(false);
      const tid = tenantId;
      if (!tid) {
        toast({ title: "Clubcard scan failed", description: "No active tenant", variant: "destructive" });
        return;
      }
      try {
        // 1. Fetch all portal accounts for this tenant
        const accounts = (await kvGet(`t:${tid}`, "portal-accounts")) as Array<{ email: string; name: string; customerId: string }> | null;
        if (!accounts || accounts.length === 0) {
          toast({ title: "Card not found", description: `No portal accounts for this tenant`, variant: "destructive" });
          return;
        }
        // 2. Find which account has this cardId in their clubcard record
        let matchName = "";
        let matchCoins = 0;
        for (const acc of accounts) {
          const card = (await kvGet(`t:${tid}`, `clubcard-${acc.customerId}`)) as { cardId?: string; coins?: number } | null;
          if (card?.cardId === code) {
            matchName = acc.name || acc.email;
            matchCoins = card.coins ?? 0;
            break;
          }
        }
        if (!matchName) {
          toast({ title: "Card not found", description: `Clubcard "${code}" is not registered`, variant: "destructive" });
          return;
        }
        // 3. Set customer + switch to Clubcard mode
        onMetaChange({ customer: matchName, saleMode: "Clubcard" });
        onPriceModeChange("clubcard");
        onSaveMeta();
        toast({ title: `Clubcard: ${matchName}`, description: `${matchCoins} coins · Clubcard prices applied` });
      } catch {
        toast({ title: "Clubcard scan error", description: "Could not look up the card, try again", variant: "destructive" });
      }
      return;
    }

    // ── Product barcode / SKU lookup ─────────────────────────────────────────
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
  }, [onAddProduct, toast, tenantId, onMetaChange, onPriceModeChange, onSaveMeta]);

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
  const [qaCity,    setQaCity]    = useState("");

  const customerExists = customerComboOpts.some(
    o => o.value.toLowerCase() === localMeta.customer.toLowerCase().trim()
  );
  const showAddBtn = localMeta.customer.trim().length > 0 && !customerExists;

  const openQuickAdd = () => {
    setQaName(localMeta.customer.trim());
    setQaCompany(""); setQaPhone(""); setQaCity("");
    setQaOpen(true);
  };

  const confirmQuickAdd = () => {
    if (!qaName.trim()) return;
    onAddCustomer(qaName.trim(), qaPhone.trim(), qaCity.trim(), qaCompany.trim());
    onMetaChange({ customer: qaName.trim() });
    onSaveMeta();
    setQaOpen(false);
  };

  const allProducts  = useMemo(() => getProducts().filter(p => p.status !== "Inactive"), []);

  // ── Search dropdown results (all products, unfiltered by category) ──────────
  const dropdownResults = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    if (!q) return [];
    return allProducts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? "").toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allProducts, prodSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setDropdownIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allCats      = useMemo(() => {
    const allCategoryRecords = getProductCategories();
    const parentCats = allCategoryRecords.filter(c => !c.parentId).map(c => c.name);
    const fromProds = allProducts.map(p => p.category).filter(Boolean);
    const parentPrefix = (cat: string) => cat.includes(" > ") ? cat.split(" > ")[0] : cat;
    const set = new Set([...parentCats, ...fromProds.map(parentPrefix)]);
    return Array.from(set).sort();
  }, [allProducts]);

  // Stock qty per SKU (for variant-level lookups: POS variant picker, cart map)
  const stockMap = useMemo(() => {
    const m: Record<string, number> = {};
    stock.forEach(s => { if (s.sku) m[s.sku] = (m[s.sku] || 0) + (parseFloat(s.quantity) || 0); });
    return m;
  }, [stock]);

  // Product-level stock map: product.id → total qty (parent SKU + ALL variant SKUs)
  // This is what the product grid uses so variant stock shows correctly per product card.
  const productStockMap = useMemo(() => {
    const m: Record<string, number | null> = {};
    allProducts.forEach(p => { m[p.id] = getProductStockQty(p, stock); });
    return m;
  }, [allProducts, stock]);

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

  // ── Invoice totals (full breakdown) ─────────────────────────────────────────
  const subTotalAmt    = subTotal(localItems);
  const totalLineDisc  = discountTotal(localItems);
  const afterLineDisc  = subTotalAmt - totalLineDisc;
  const invDiscVal     = parseFloat(localMeta.invoiceDiscount || "0") || 0;
  const invDiscAmt     = localMeta.invoiceDiscountType === "amt"
    ? Math.min(invDiscVal, afterLineDisc) : afterLineDisc * invDiscVal / 100;
  const afterInvDisc   = Math.max(0, afterLineDisc - invDiscAmt);
  const liveTaxPct     = parseFloat(localMeta.taxRate || "0") || 0;
  const liveTaxAmt     = afterInvDisc * liveTaxPct / 100;
  const deliveryAmt    = parseFloat(localMeta.deliveryCharges || "0") || 0;
  const grandTotal     = afterInvDisc + liveTaxAmt + deliveryAmt;
  const discountAmt    = totalLineDisc;  // kept for in-line badge display
  const isDraft       = sale.status === "Draft";
  const isPending     = sale.status === "Pending";
  const isCompleted   = sale.status === "Completed";
  const isOnCredit    = sale.status === "On Credit";
  const isCredit      = localMeta.paymentMethod === "Credit";

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
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full self-start ${STATUS_BG[saleDisplayStatus(sale)] ?? STATUS_BG[sale.status]}`}>{saleDisplayStatus(sale)}</span>
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
              {/* Scan Clubcard QR button */}
              <button
                onClick={() => setScannerOpen(true)}
                title="Scan customer's Clubcard QR code"
                className="flex-shrink-0 w-6 h-6 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors mb-0.5"
              >
                <ScanLine size={12} />
              </button>
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

          {/* SALE MODE */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Mode</span>
            <div className="flex rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden text-[11px] font-bold">
              {(["Retail", "Wholesale", "Clubcard"] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => { onMetaChange({ saleMode: mode }); onPriceModeChange(mode === "Retail" ? "retail" : mode === "Wholesale" ? "wholesale" : "clubcard"); onSaveMeta(); }}
                  className={`px-2.5 py-0.5 transition-colors ${mode !== "Retail" ? "border-l border-gray-200 dark:border-zinc-700" : ""} ${(localMeta.saleMode ?? "Retail") === mode ? (mode === "Retail" ? "bg-blue-600 text-white" : mode === "Wholesale" ? "bg-purple-600 text-white" : "bg-emerald-600 text-white") : "bg-white dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
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

        {/* Right: timestamps — two columns */}
        <div className="px-4 py-2 flex items-center border-l border-gray-100 dark:border-zinc-800 shrink-0 gap-4">
          <div className="text-right">
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Created</div>
            <div className="text-[11px] font-semibold text-gray-500 font-mono mt-0.5">
              {new Date(sale.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          {sale.paidAt ? (
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">Paid at</div>
              <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                {new Date(sale.paidAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Updated</div>
              <div className="text-[11px] font-semibold text-gray-400 font-mono mt-0.5">
                {new Date(sale.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Order Pipeline ──────────────────────────────────────────────────── */}
      <AdminOrderPipeline
        sale={sale}
        deliveryStatus={(localMeta.deliveryStatus ?? sale.deliveryStatus ?? "Pending") as DeliveryStage}
        onChangeDelivery={ds => { onMetaChange({ deliveryStatus: ds }); onSaveMeta(); }}
      />

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
                              {sym}{parseFloat(prod!.costPrice ?? "0").toFixed(2)}
                            </span>
                          )}
                          {item.bogoApplied && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
                              B1G1 · {Math.floor(parseFloat(item.qty) || 0) - Math.ceil((parseFloat(item.qty) || 0) / 2)} FREE
                            </span>
                          )}
                          {(() => {
                            if (!item.sku) return null;
                            const rawStock = stockMap[item.sku];
                            const avail = rawStock !== undefined ? rawStock : 0;
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
              {/* Collapsible detail rows */}
              {showTotalsDetail && (
                <>
                  {/* Subtotal */}
                  <div className="flex justify-between text-[12px] text-gray-500 dark:text-gray-400">
                    <span>Subtotal ({localItems.length} item{localItems.length !== 1 ? "s" : ""})</span>
                    <span className="font-mono font-semibold">{sym}{subTotalAmt.toFixed(dp)}</span>
                  </div>

                  {/* Line discounts */}
                  {totalLineDisc > 0 && (
                    <div className="flex justify-between text-[12px] text-emerald-600 dark:text-emerald-400">
                      <span>Item Discounts</span>
                      <span className="font-mono font-semibold">−{sym}{totalLineDisc.toFixed(dp)}</span>
                    </div>
                  )}

                  {/* Invoice Discount */}
                  <div className="flex justify-between items-center text-[12px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 dark:text-gray-400">Invoice Discount</span>
                      {isDraft && (
                        <button
                          onClick={() => { onMetaChange({ invoiceDiscountType: localMeta.invoiceDiscountType === "amt" ? "pct" : "amt" }); onSaveMeta(); }}
                          className="text-[10px] font-bold px-1.5 py-0 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors leading-5"
                        >
                          {localMeta.invoiceDiscountType === "amt" ? sym : "%"}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {invDiscAmt > 0 && <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">−{sym}{invDiscAmt.toFixed(dp)}</span>}
                      {isDraft ? (
                        <input
                          type="number" min="0"
                          value={localMeta.invoiceDiscount || ""}
                          onChange={e => onMetaChange({ invoiceDiscount: e.target.value })}
                          onBlur={onSaveMeta}
                          placeholder="0"
                          className="w-14 text-right text-[12px] font-semibold text-gray-700 dark:text-gray-200 bg-transparent border-b border-gray-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 pb-0"
                        />
                      ) : (
                        <span className="text-[12px] font-semibold text-gray-500 dark:text-gray-400 font-mono">
                          {localMeta.invoiceDiscountType === "amt" ? `${sym}${parseFloat(localMeta.invoiceDiscount || "0").toFixed(dp)}` : `${parseFloat(localMeta.invoiceDiscount || "0").toFixed(1)}%`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tax */}
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-gray-500 dark:text-gray-400">Tax</span>
                    <div className="flex items-center gap-1">
                      {liveTaxAmt > 0 && <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">+{sym}{liveTaxAmt.toFixed(dp)}</span>}
                      {isDraft ? (
                        <>
                          <input
                            type="number" min="0" max="100"
                            value={localMeta.taxRate || ""}
                            onChange={e => onMetaChange({ taxRate: e.target.value })}
                            onBlur={onSaveMeta}
                            placeholder="0"
                            className="w-12 text-right text-[12px] font-semibold text-gray-700 dark:text-gray-200 bg-transparent border-b border-gray-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 pb-0"
                          />
                          <span className="text-gray-400 text-[11px]">%</span>
                        </>
                      ) : (
                        <span className="text-[12px] font-semibold text-gray-500 dark:text-gray-400 font-mono">{parseFloat(sale.taxRate || "0").toFixed(1)}%</span>
                      )}
                    </div>
                  </div>

                  {/* Delivery Charges */}
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-gray-500 dark:text-gray-400">Delivery</span>
                    <div className="flex items-center gap-1">
                      {deliveryAmt > 0 && <span className="font-mono font-semibold text-gray-600 dark:text-gray-300">+{sym}{deliveryAmt.toFixed(dp)}</span>}
                      {isDraft ? (
                        <>
                          <span className="text-[11px] text-gray-400">{sym}</span>
                          <input
                            type="number" min="0"
                            value={localMeta.deliveryCharges || ""}
                            onChange={e => onMetaChange({ deliveryCharges: e.target.value })}
                            onBlur={onSaveMeta}
                            placeholder="0"
                            className="w-14 text-right text-[12px] font-semibold text-gray-700 dark:text-gray-200 bg-transparent border-b border-gray-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 pb-0"
                          />
                        </>
                      ) : (
                        <span className="text-[12px] font-semibold text-gray-500 dark:text-gray-400 font-mono">{sym}{parseFloat(sale.deliveryCharges || "0").toFixed(dp)}</span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Grand Total — clicking the label toggles the breakdown */}
              <div className={`flex justify-between items-center ${showTotalsDetail ? "pt-2 border-t border-gray-100 dark:border-zinc-800" : ""}`}>
                <button
                  onClick={() => setShowTotalsDetail(v => !v)}
                  className="flex items-center gap-1 text-[14px] font-bold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Total to Pay
                  <ChevronDown size={13} className={`transition-transform duration-200 ${showTotalsDetail ? "rotate-180" : ""}`} />
                </button>
                <span className="text-[26px] font-black font-mono tabular-nums text-blue-600 dark:text-blue-400 leading-none">
                  {sym}{grandTotal.toFixed(dp)}
                </span>
              </div>

              {/* Received / Balance (for completed/credit sales) */}
              {(isCompleted || isOnCredit) && parseFloat(sale.amountPaid || "0") === 0 && grandTotal > 0.005 && (
                <div className="flex justify-between text-[12px] text-orange-600 dark:text-orange-400 font-semibold">
                  <span>Payment</span>
                  <span className="flex items-center gap-1"><Clock size={11} /> Not yet collected</span>
                </div>
              )}
              {(isCompleted || isOnCredit) && parseFloat(sale.amountPaid || "0") > 0 && (() => {
                const paid = parseFloat(sale.amountPaid) || 0;
                const change = Math.max(0, paid - grandTotal);
                const balance = Math.max(0, grandTotal - paid);
                return (
                  <>
                    <div className="flex justify-between text-[12px] text-emerald-600 dark:text-emerald-400">
                      <span>Received</span>
                      <span className="font-mono font-semibold">{sym}{paid.toFixed(dp)}</span>
                    </div>
                    {change > 0.005 && (
                      <div className="flex justify-between text-[12px] text-blue-600 dark:text-blue-400">
                        <span>Change</span>
                        <span className="font-mono font-semibold">{sym}{change.toFixed(dp)}</span>
                      </div>
                    )}
                    {balance > 0.005 && (
                      <div className="flex justify-between text-[12px] text-orange-600 dark:text-orange-400 font-semibold">
                        <span>Balance Due</span>
                        <span className="font-mono">{sym}{balance.toFixed(dp)}</span>
                      </div>
                    )}
                  </>
                );
              })()}
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
                    {isCredit ? <><CreditCard size={17} /> Issue on Credit</> : <><Check size={17} /> Confirm &amp; Pay</>}
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
              {isPending && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                    <Clock size={13} className="text-yellow-600 shrink-0" />
                    <span className="text-[11px] text-yellow-700 dark:text-yellow-300 font-medium">
                      Online order awaiting processing — accept to begin fulfilment.
                    </span>
                  </div>
                  {/* Accept & collect payment now (pre-paid / card on delivery) */}
                  <button
                    onClick={() => setPayModalOpen(true)}
                    className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-[14px] flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-200 dark:shadow-none"
                  >
                    <Check size={16} /> Accept &amp; Collect Payment
                  </button>
                  {/* Accept without payment now (COD — driver collects on delivery) */}
                  {onAcceptOrder && (
                    <button
                      onClick={onAcceptOrder}
                      className="w-full h-10 rounded-xl border-2 border-emerald-200 dark:border-emerald-800/60 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Truck size={14} /> Accept Order (Pay on Delivery)
                    </button>
                  )}
                  <button
                    onClick={() => { try { printSaleInvoice(sale, getSettings()); } catch { /* blocked */ } }}
                    className="w-full h-10 rounded-xl border-2 border-blue-200 dark:border-blue-800 text-[13px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Printer size={14} /> Print Invoice
                  </button>
                  <button
                    onClick={() => setCancelConfirmOpen(true)}
                    className="w-full h-9 rounded-xl border-2 border-red-200 dark:border-red-900/60 text-[12px] font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Ban size={13} /> Cancel Order
                  </button>
                </div>
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
                  {/* Collect payment if not yet received */}
                  {parseFloat(sale.amountPaid || "0") < grandTotal - 0.005 && (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                        <DollarSign size={13} className="text-orange-500 shrink-0" />
                        <span className="text-[11px] text-orange-700 dark:text-orange-300 font-medium">
                          Payment not yet collected — record it now.
                        </span>
                      </div>
                      <button
                        onClick={() => setPayModalOpen(true)}
                        className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-[14px] flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-200 dark:shadow-none"
                      >
                        <DollarSign size={16} /> Collect Payment
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { try { printSaleInvoice(sale, getSettings()); } catch { /* blocked */ } }}
                    className={`w-full rounded-xl text-white font-bold text-[14px] flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] ${parseFloat(sale.amountPaid || "0") >= grandTotal - 0.005 ? "h-11 bg-blue-600 hover:bg-blue-700 shadow-blue-200 dark:shadow-none" : "h-10 bg-blue-500 hover:bg-blue-600 shadow-blue-200 dark:shadow-none"}`}
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
              <div className="relative flex-1" ref={searchWrapRef}>
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
                <input
                  autoFocus
                  type="text"
                  value={prodSearch}
                  onChange={e => { setProdSearch(e.target.value); setDropdownIdx(-1); }}
                  onKeyDown={e => {
                    if (dropdownResults.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setDropdownIdx(i => Math.min(i + 1, dropdownResults.length - 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setDropdownIdx(i => Math.max(i - 1, -1));
                        return;
                      }
                      if (e.key === "Enter" && dropdownIdx >= 0) {
                        e.preventDefault();
                        onAddProduct(dropdownResults[dropdownIdx]);
                        setProdSearch("");
                        setDropdownIdx(-1);
                        return;
                      }
                      if (e.key === "Escape") {
                        setProdSearch("");
                        setDropdownIdx(-1);
                        return;
                      }
                    }
                    if (e.key === "Enter" && prodSearch.trim()) {
                      handleScan(prodSearch.trim());
                    }
                  }}
                  placeholder="Search by name, SKU or barcode…"
                  className="w-full pl-9 pr-8 py-2.5 text-[13px] border-2 border-gray-200 dark:border-zinc-700 rounded-xl bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-0 focus:border-blue-400 focus:bg-white dark:focus:bg-zinc-700 transition-all placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                />
                {prodSearch && (
                  <button
                    onClick={() => { setProdSearch(""); setDropdownIdx(-1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 dark:bg-zinc-600 hover:bg-gray-400 dark:hover:bg-zinc-500 flex items-center justify-center transition-colors z-10"
                  >
                    <X size={10} className="text-white" />
                  </button>
                )}

                {/* ── Dropdown results ── */}
                {dropdownResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                    {dropdownResults.map((p, i) => {
                      const stock = stockMap[p.sku] ?? 0;
                      const stockColor = stock <= 0 ? "text-red-500" : stock <= 5 ? "text-amber-500" : "text-emerald-600";
                      const isActive = i === dropdownIdx;
                      return (
                        <button
                          key={p.id}
                          onMouseDown={e => { e.preventDefault(); onAddProduct(p); setProdSearch(""); setDropdownIdx(-1); }}
                          onMouseEnter={() => setDropdownIdx(i)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${isActive ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-gray-50 dark:hover:bg-zinc-800"} ${i > 0 ? "border-t border-gray-100 dark:border-zinc-800" : ""}`}
                        >
                          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 ring-1 ring-gray-100 dark:ring-zinc-700">
                            <ProductThumbnail product={p} size="sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{p.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-mono">{p.sku}</span>
                              {p.category && (
                                <span className="text-[10px] px-1.5 py-0 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">{p.category}</span>
                              )}
                              <span className={`text-[10px] font-semibold ${stockColor}`}>Stk: {stock}</span>
                            </div>
                          </div>
                          <div className="text-[13px] font-bold text-blue-600 dark:text-blue-400 font-mono shrink-0">
                            {sym}{parseFloat(p.price || "0").toFixed(dp)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
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
              {/* Image / List view toggle */}
              <div className="flex rounded-xl border-2 border-gray-200 dark:border-zinc-700 overflow-hidden shrink-0">
                <button
                  onClick={() => { setProdView("image"); saveSettings({ ...getSettings(), posProductView: "image" }); }}
                  className={`w-9 h-9 flex items-center justify-center transition-colors ${prodView === "image" ? "bg-blue-600 text-white" : "bg-white dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}
                  title="Image grid (4 columns)"
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => { setProdView("list"); saveSettings({ ...getSettings(), posProductView: "list" }); }}
                  className={`w-9 h-9 flex items-center justify-center border-l border-gray-200 dark:border-zinc-700 transition-colors ${prodView === "list" ? "bg-blue-600 text-white" : "bg-white dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}
                  title="List view (2 columns)"
                >
                  <List size={14} />
                </button>
              </div>
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
                {/* Sort by */}
                <div className="flex items-center gap-3 flex-wrap">
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
            ) : prodView === "list" ? (
              /* ── 2-column text list ─────────────────────────────────────────── */
              <div className="grid grid-cols-2 gap-1.5 content-start">
                {filteredProds.map((product) => {
                  const catIdx   = allCats.indexOf(product.category);
                  const catColor = catIdx >= 0 ? CAT_COLOURS[catIdx % CAT_COLOURS.length] : CAT_COLOURS[0];
                  // Aggregate inCart across parent + all variant SKUs
                  const allSkus = [product.sku, ...(product.variants?.map(v => v.sku).filter(Boolean) ?? [])] as string[];
                  const inCart       = allSkus.reduce((s, sku) => s + (cartQtyMap[sku] || 0), 0);
                  const stockQty     = productStockMap[product.id] ?? null;
                  const availableQty = (stockQty ?? 0) - inCart;
                  const lowStock     = stockQty !== null && availableQty > 0 && availableQty <= 5;
                  const stockBlocked = !allowNegativeStock && stockQty !== null && availableQty <= 0;
                  const isDisabled   = !isDraft || stockBlocked;
                  const salePrice    = parseFloat((priceMode === "wholesale" ? product.wholesalePrice || product.price : priceMode === "clubcard" ? product.clubcardPrice || product.price : product.price) || "0");
                  return (
                    <button
                      key={product.id}
                      disabled={isDisabled}
                      onClick={() => onAddProduct(product)}
                      title={
                        !isDraft       ? `Sale is ${sale.status}`
                        : stockBlocked ? `${product.name} — out of stock (overselling disabled)`
                        : `Add ${product.name}`
                      }
                      className={`group relative text-left bg-white dark:bg-zinc-900 border rounded-xl px-3 py-2.5 flex flex-col gap-1 transition-all ${
                        !isDraft
                          ? "border-gray-100 dark:border-zinc-800 opacity-40 cursor-not-allowed"
                          : stockBlocked
                            ? "border-red-200 dark:border-red-900 opacity-70 cursor-not-allowed"
                            : inCart > 0
                              ? "border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 hover:border-blue-400 hover:shadow-sm cursor-pointer active:scale-[0.99]"
                              : "border-gray-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm cursor-pointer active:scale-[0.99]"
                      }`}
                    >
                      {/* In-cart badge */}
                      {inCart > 0 && !stockBlocked && (
                        <div className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {inCart}
                        </div>
                      )}

                      {/* Full product name — wraps */}
                      <div className="text-[12px] font-bold text-gray-900 dark:text-gray-100 leading-snug pr-6 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {product.name}
                      </div>

                      {/* Category + price row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {product.category && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${catColor}`}>
                            {product.category}
                          </span>
                        )}
                        <span className={`text-[13px] font-extrabold font-mono tabular-nums ml-auto ${priceMode === "wholesale" ? "text-purple-600 dark:text-purple-400" : priceMode === "clubcard" ? "text-teal-600 dark:text-teal-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {getSettingsCurrencySymbol()}{salePrice.toFixed(dp)}
                        </span>
                      </div>

                      {/* Stock pill */}
                      <div>
                        {stockBlocked ? (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 tabular-nums">
                            No Stock {stockQty !== null ? `(${stockQty})` : ""}
                          </span>
                        ) : stockQty === null ? (
                          <span className="text-[9px] text-gray-300 dark:text-zinc-600">No record</span>
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
                    </button>
                  );
                })}
              </div>
            ) : (
              /* ── 4-column image grid ────────────────────────────────────────── */
              <div className="grid grid-cols-4 gap-2 content-start">
                {filteredProds.map((product) => {
                  const catIdx   = allCats.indexOf(product.category);
                  const catColor = catIdx >= 0 ? CAT_COLOURS[catIdx % CAT_COLOURS.length] : CAT_COLOURS[0];
                  const allSkus2 = [product.sku, ...(product.variants?.map(v => v.sku).filter(Boolean) ?? [])] as string[];
                  const inCart       = allSkus2.reduce((s, sku) => s + (cartQtyMap[sku] || 0), 0);
                  const stockQty     = productStockMap[product.id] ?? null;
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
                          <span className={`text-[12px] font-bold font-mono ${priceMode === "wholesale" ? "text-purple-600 dark:text-purple-400" : priceMode === "clubcard" ? "text-teal-600 dark:text-teal-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {getSettingsCurrencySymbol()}{parseFloat((priceMode === "wholesale" ? product.wholesalePrice || product.price : priceMode === "clubcard" ? product.clubcardPrice || product.price : product.price) || "0").toFixed(2)}
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
        total={grandTotal}
        customer={localMeta.customer ?? ""}
        walletBalance={localMeta.customer ? getCustomerWalletBalance(localMeta.customer) : 0}
        defaultPaymentMethod={localMeta.paymentMethod}
        defaultNotes={localMeta.notes ?? ""}
        onConfirm={(amountPaid, paymentMethod, notes, walletUsed) => {
          setPayModalOpen(false);
          onComplete(amountPaid, paymentMethod, notes, walletUsed);
        }}
        onCancel={() => setPayModalOpen(false)}
      />
    )}

    {/* ── Quick-add Customer Dialog ─────────────────────────────────────── */}
    <Dialog open={qaOpen} onOpenChange={v => !v && setQaOpen(false)}>
      <DialogContent className="max-w-lg">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Phone</label>
              <Input value={qaPhone} onChange={e => setQaPhone(e.target.value)} placeholder="+44 7xxx xxxxxx" className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">City</label>
              <Input value={qaCity} onChange={e => setQaCity(e.target.value)} placeholder="City" className="h-9 text-[13px]" />
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
          <AlertDialogTitle>{isFresh ? "Discard this sale?" : "Cancel this sale?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {isFresh
              ? "This sale has not been completed. It will be discarded and removed — nothing will be saved to the sales list."
              : <>This sale will be marked as <strong>Cancelled</strong>. You can view it in the sales list but it will no longer be editable from the POS.</>
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              if (!isFresh) onSetStatus("Cancelled");
              setCancelConfirmOpen(false);
              onClose();
            }}
          >
            {isFresh ? "Yes, Discard" : "Yes, Cancel Sale"}
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
      hint="Scan a product barcode / QR code to add it, or a customer's Clubcard QR to select them and apply Clubcard prices"
    />
    </>
  );
}

// ─── Main SalesPage component ─────────────────────────────────────────────────
export default function SalesPage() {
  const [location, navigate] = useLocation();
  const dp = getSettingsDecimalPlaces();
  const isNewSale = location.includes("/new");
  const { sales, addSale, editSale, removeSale, refresh } = useSales();
  const { customers, addCustomer } = useCustomers();
  const { saleReturns } = useSaleReturns();
  const { invoices: allInvoices } = useInvoices();
  const saleInvoices = useMemo(() => allInvoices.filter(i => i.invoiceType !== "purchase"), [allInvoices]);
  /** Map: saleId → { count, qty } summarising returns against that sale.
   *  Drives the "Returned" badge on the sales list so users can see at-a-
   *  glance which sales have any return activity. */
  const returnsBySaleId = useMemo(() => {
    const m = new Map<string, { count: number; qty: number }>();
    for (const r of saleReturns) {
      const prev = m.get(r.originalSaleId) ?? { count: 0, qty: 0 };
      const qty  = r.items.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
      m.set(r.originalSaleId, { count: prev.count + 1, qty: prev.qty + qty });
    }
    return m;
  }, [saleReturns]);
  const { isAuthenticated, currentTenantId, can } = useAuth();
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

  const rawSearch = useSearch();
  // ── List state ──
  const [statusFilter,   setStatusFilter]   = useState<string>("All");
  const [typeFilter,     setTypeFilter]     = useState<string>("All");
  const [search,         setSearch]         = useState(() => new URLSearchParams(rawSearch).get("q") || "");
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
  const [wrapText,       setWrapText]       = useState<boolean>(() => {
    try { return sessionStorage.getItem("sales-wrap-text") === "true"; } catch { return false; }
  });
  const toggleWrap = () => setWrapText(v => {
    const next = !v;
    try { sessionStorage.setItem("sales-wrap-text", String(next)); } catch {}
    return next;
  });

  const [syncing, setSyncing] = useState(false);
  const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);

  const syncOnlineOrders = useCallback(async () => {
    setSyncing(true);
    try {
      // Use the active tenant's namespace so orders never bleed across tenants
      const ns = currentTenantId ? `t:${currentTenantId}` : "global";
      const n = await importOnlineSalesFromKv(ns);
      setLastSyncCount(n);
      if (n > 0) {
        refresh();
        toast({ title: `${n} online order${n !== 1 ? "s" : ""} imported`, description: "Online orders synced from the store." });
      }
    } finally {
      setSyncing(false);
    }
  }, [currentTenantId, refresh, toast]);

  // Auto-sync online orders once the tenant is known.
  // Depends on syncOnlineOrders (which captures currentTenantId via useCallback)
  // so it re-fires whenever the active tenant changes, never with a stale null ID.
  useEffect(() => {
    syncOnlineOrders();
  }, [syncOnlineOrders]);

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

  // Auto-open a sale from URL param: ?open=<saleId>  (from ledger / transaction-history)
  useEffect(() => {
    const openId = new URLSearchParams(rawSearch).get("open");
    if (openId) setDetailId(openId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [localItems,             setLocalItems]             = useState<SaleItem[]>([]);
  const [priceMode,              setPriceMode]              = useState<"retail" | "wholesale" | "clubcard">("retail");
  const [localMeta,              setLocalMeta]              = useState<LocalMeta | null>(null);
  const [completedSaleForReceipt, setCompletedSaleForReceipt] = useState<Sale | null>(null);
  const [variantPickerProduct,   setVariantPickerProduct]   = useState<Product | null>(null);

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
    { field: "orderType",     label: "Type",            minW: 90,  type: "readonly" },
    { field: "saleDate",      label: "Date",            minW: 130, type: "date"     },
    { field: "customer",      label: "Customer",        minW: 180, type: "text"     },
    { field: "agentName",     label: "Sales Agent",     minW: 150, type: agentNameOpts.length ? "select" : "text", options: agentNameOpts },
    { field: "status",        label: "Status",          minW: 130, type: "select",  options: [...SALE_STATUSES] },
    { field: "itemCount",     label: "Items",           minW: 60,  type: "readonly" },
    { field: "total",         label: `Total (${sym})`,   minW: 110, type: "readonly" },
    { field: "amountPaid",    label: `Paid (${sym})`,   minW: 110, type: "readonly" },
    { field: "balance",       label: `Balance (${sym})`,minW: 110, type: "readonly" },
    { field: "payStatus",     label: "Pay Status",      minW: 100, type: "readonly" },
    { field: "orderStage",    label: "Order Stage",     minW: 120, type: "readonly" },
    { field: "paymentMethod", label: "Payment",         minW: 140, type: "readonly" },
    { field: "notes",         label: "Notes",           minW: 230, type: "text"     },
  ], [sym, agentNameOpts]);
  const TOTAL_W = useMemo(() => COLS.reduce((a, c) => a + c.minW, 0), [COLS]);

  const cellValue = (sale: SaleRowData, field: string): string => {
    const ret = sale._returnRef;
    const inv = sale._invoiceRef;
    if (ret) {
      if (field === "itemCount") return String(ret.items.length);
      if (field === "total")     return ret.grandTotal.toFixed(dp);
      if (field === "amountPaid") return ret.grandTotal.toFixed(dp);
      if (field === "balance")   return (0).toFixed(dp);
      if (field === "payStatus") return "Refunded";
      if (field === "orderStage") return "Refunded";
      if (field === "status")    return ret.status === "posted" ? "Completed" : "Draft";
    }
    if (inv) {
      if (field === "itemCount") {
        const q = inv.items.reduce((s, i) => s + (parseFloat(i.qty)||0), 0);
        return Number.isInteger(q) ? String(q) : q.toFixed(1);
      }
      if (field === "total")      return invoiceTotalFull(inv).toFixed(dp);
      if (field === "balance") {
        const total = invoiceTotalFull(inv);
        const paid  = parseFloat(inv.amountPaid||"0");
        return Math.max(0, total - paid).toFixed(dp);
      }
      if (field === "payStatus") {
        const s = inv.status;
        if (s === "Cancelled" || s === "Draft") return "N/A";
        if (s === "Paid")    return "Paid";
        if (s === "Partial") return "Partial";
        if (s === "Overdue") return "On Credit";
        const paid = parseFloat(inv.amountPaid||"0");
        const total = invoiceTotalFull(inv);
        if (paid >= total && total > 0) return "Paid";
        if (paid > 0)                   return "Partial";
        return "Unpaid";
      }
      if (field === "orderStage") return inv.saleStatus || "—";
      if (field === "status")     return inv.status;   // show actual invoice status
      return String((inv as unknown as Record<string, string>)[field] ?? (sale as unknown as Record<string, string>)[field] ?? "");
    }
    if (field === "itemCount") {
      const totalQty = sale.items.reduce((sum, i) => sum + (parseFloat(i.qty) || 0), 0);
      return Number.isInteger(totalQty) ? String(totalQty) : totalQty.toFixed(1);
    }
    if (field === "total")     return saleTotalFull(sale).toFixed(dp);
    if (field === "balance") {
      const total = saleTotalFull(sale);
      const paid  = parseFloat(sale.amountPaid || "0");
      return Math.max(0, total - paid).toFixed(dp);
    }
    if (field === "payStatus") {
      if (sale.status === "Cancelled" || sale.status === "Refunded" || sale.status === "Draft") return "N/A";
      if (sale.status === "On Credit") return "On Credit";
      const total = saleTotalFull(sale);
      const paid  = parseFloat(sale.amountPaid || "0");
      if (paid >= total && total > 0) return "Paid";
      if (paid > 0)                   return "Partial";
      return "Unpaid";
    }
    if (field === "orderStage") {
      const st = sale.status;
      if (st === "Cancelled") return "Cancelled";
      if (st === "Refunded")  return "Refunded";
      if (st === "Draft")     return "Placed";
      if (st === "Pending")   return "Placed";
      const ds = sale.deliveryStatus ?? "Pending";
      if (ds === "Delivered")  return "Delivered";
      if (ds === "Shipped")    return "Shipped";
      if (ds === "Processing") return "Processing";
      return "Confirmed";
    }
    if (field === "status") return saleDisplayStatus(sale);
    return String((sale as unknown as Record<string, string>)[field] ?? "");
  };

  // ── Auto-open POS for /sales/new ──
  useEffect(() => {
    if (isNewSale && can("Add Sales")) {
      const draft = addSale(blankSale());
      freshSaleIdRef.current = draft.id;
      openDetailDirect(draft);
      navigate("/sales", { replace: true });
    }
  }, [isNewSale, isAuthenticated]);

  // ── Open POS — accepts a Sale object directly (avoids stale-state lookup) ──
  const openDetailDirect = useCallback((sale: Sale) => {
    setLocalItems([...sale.items]);
    setPriceMode(sale.saleMode === "Wholesale" ? "wholesale" : sale.saleMode === "Clubcard" ? "clubcard" : "retail");
    setLocalMeta({
      customer: sale.customer, saleDate: sale.saleDate, paymentMethod: sale.paymentMethod,
      notes: sale.notes, agentId: sale.agentId, agentName: sale.agentName,
      saleMode: sale.saleMode ?? "Retail",
      deliveryStatus: sale.deliveryStatus ?? "Pending",
      deliveryCharges: sale.deliveryCharges ?? "0",
      invoiceDiscount: sale.invoiceDiscount ?? "0",
      invoiceDiscountType: sale.invoiceDiscountType ?? "pct",
      taxRate: sale.taxRate ?? "0",
    });
    setDetailId(sale.id);
  }, []);

  const openDetail = (id: string) => {
    // Try current React state first; fall back to a fresh in-memory read
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
        setPriceMode(sale.saleMode === "Wholesale" ? "wholesale" : sale.saleMode === "Clubcard" ? "clubcard" : "retail");
        setLocalMeta({
          customer: sale.customer, saleDate: sale.saleDate, paymentMethod: sale.paymentMethod,
          notes: sale.notes, agentId: sale.agentId, agentName: sale.agentName,
          saleMode: sale.saleMode ?? "Retail",
          deliveryStatus: sale.deliveryStatus ?? "Pending",
          deliveryCharges: sale.deliveryCharges ?? "0",
          invoiceDiscount: sale.invoiceDiscount ?? "0",
          invoiceDiscountType: sale.invoiceDiscountType ?? "pct",
          taxRate: sale.taxRate ?? "0",
        });
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

  // ── Add variant from picker ──
  const handleAddVariant = useCallback((variantSku: string, variantName: string, variantPrice: string, qty: number, unit: string, costPrice: string) => {
    setVariantPickerProduct(null);
    const current = localItemsRef.current;
    const settings = getSettings();
    const defaultDiscountType = settings.posDiscountType ?? "pct";
    const existing = current.find(i => i.sku === variantSku);
    if (existing) {
      saveItems(current.map(i => i.sku === variantSku ? { ...i, qty: String((parseFloat(i.qty) || 0) + qty) } : i));
    } else {
      const item: SaleItem = {
        ...blankSaleItem(),
        productName: variantName,
        sku: variantSku,
        unit,
        unitPrice: variantPrice,
        qty: String(qty),
        discountType: defaultDiscountType,
        costPrice,
      };
      saveItems([...current, item]);
      toast({ title: `${variantName} added` });
    }
  }, [saveItems, toast]);

  // ── Add product from right panel ──
  const handleAddProductFromCatalogue = useCallback((product: Product) => {
    // If product has variants, open the picker instead of adding directly
    if (product.variants && product.variants.length > 0) {
      setVariantPickerProduct(product);
      return;
    }
    const settings = getSettings();
    const allowNeg = settings.allowNegativeStock !== false; // default true

    // ── Stock guard ──────────────────────────────────────────────────────────
    if (!allowNeg) {
      // Use getProductStockQty for accurate stock level (handles SKU/name matching + trim)
      const available = getProductStockQty(product) ?? 0;

      // Count qty already in cart for this product (match by SKU case-insensitively, fall back to name)
      const skuKey = product.sku?.trim().toLowerCase();
      const inCart = localItemsRef.current
        .filter(i => skuKey
          ? (i.sku?.trim().toLowerCase() === skuKey)
          : (i.productName?.trim().toLowerCase() === product.name?.trim().toLowerCase()))
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
    const isBogo = priceMode === "clubcard" && product.clubcardBogo === true;
    const resolvedPrice = priceMode === "wholesale" && product.wholesalePrice
      ? product.wholesalePrice
      : priceMode === "clubcard" && !isBogo && product.clubcardPrice
        ? product.clubcardPrice
        : product.price || "0.00";
    // Match existing cart item by SKU (case-insensitive) or product name when no SKU
    const skuKey = product.sku?.trim().toLowerCase();
    const existing = current.find(i => skuKey
      ? (i.sku?.trim().toLowerCase() === skuKey)
      : (i.productName?.trim().toLowerCase() === product.name?.trim().toLowerCase()));
    if (existing) {
      // For BOGO: increment by 2 to maintain pairs; otherwise +1
      const addQty = isBogo ? 2 : 1;
      const next = current.map(i =>
        (skuKey
          ? i.sku?.trim().toLowerCase() === skuKey
          : i.productName?.trim().toLowerCase() === product.name?.trim().toLowerCase())
          ? { ...i, qty: String((parseFloat(i.qty) || 0) + addQty), bogoApplied: isBogo || i.bogoApplied }
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
        qty: isBogo ? "2" : "1",
        bogoApplied: isBogo || undefined,
        costPrice: product.costPrice ?? "0",
      };
      saveItems([...current, item]);
      toast({ title: isBogo ? `${product.name} added — B1G1 applied` : `${product.name} added` });
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
    // Completing or crediting a fresh sale → it's now saved, clear the fresh flag
    if (status !== "Cancelled" && detailId === freshSaleIdRef.current) {
      freshSaleIdRef.current = null;
    }
    const wasDeducted = detailSale?.stockDeducted ?? false;
    let stockDeducted = wasDeducted;

    if (status === "On Credit" && !wasDeducted) {
      deductStockForSale(localItems, detailSale?.saleNumber || "", "POS");
      stockDeducted = true;
    }
    if ((status === "Refunded" || status === "Cancelled") && wasDeducted) {
      restoreStockForSale(localItems, detailSale?.saleNumber || "");
      stockDeducted = false;
    }

    // Auto-post JE for On Credit sales (only once)
    let jeId: string | undefined = detailSale?.jeId;
    if (status === "On Credit" && !jeId) {
      const sub_    = saleTotal(localItems);
      const taxPct_ = Math.max(0, parseFloat(localMeta.taxRate || "0") || 0);
      const taxAmt_ = parseFloat((sub_ * taxPct_ / 100).toFixed(2));
      const delAmt_ = parseFloat(localMeta.deliveryCharges || "0") || 0;
      // Use fresh product list for accurate cost prices (same approach as handleComplete)
      const freshProds = getProducts();
      // Build per-category breakdown for COGS and Inventory lines
      const catMap = new Map<string, { subtotal: number; costTotal: number }>();
      for (const item of localItems) {
        const prod    = findProductForItem(item, freshProds);
        const qty     = parseFloat(item.qty) || 0;
        const price   = parseFloat(item.unitPrice) || 0;
        const disc    = parseFloat(item.discount) || 0;
        const lineNet = qty * price - (item.discountType === "amt" ? Math.min(disc, price) * qty : qty * price * disc / 100);
        const cost    = effectiveItemCost(item, prod) * qty;
        const cat     = prod?.category?.trim() || "Uncategorised";
        const prev    = catMap.get(cat) ?? { subtotal: 0, costTotal: 0 };
        catMap.set(cat, { subtotal: prev.subtotal + lineNet, costTotal: prev.costTotal + cost });
      }
      const categoryLines = Array.from(catMap.entries()).map(([category, v]) => ({
        category,
        subtotal:  parseFloat(v.subtotal.toFixed(2)),
        costTotal: parseFloat(v.costTotal.toFixed(2)),
      }));
      const costTotal = categoryLines.reduce((s, cl) => s + cl.costTotal, 0);
      const je = autoPostSaleJE({
        source:          "POS",
        reference:       detailSale?.saleNumber || "",
        customer:        localMeta.customer || "Walk-in",
        date:            detailSale?.saleDate || new Date().toISOString().slice(0, 10),
        paymentMethod:   "Credit",
        subtotal:        sub_,
        taxAmount:       taxAmt_,
        deliveryAmount:  delAmt_,
        grandTotal:      parseFloat((sub_ + taxAmt_ + delAmt_).toFixed(2)),
        costTotal:       parseFloat(costTotal.toFixed(2)),
        categoryLines,
      });
      if (je) jeId = je.id;
    }

    editSale(detailId, { ...localMeta, status, items: localItems, stockDeducted, ...(jeId ? { jeId } : {}) });
    toast({ title: status === "Completed" ? "Sale completed!" : status === "On Credit" ? "Issued on credit" : status === "Refunded" ? "Sale refunded" : "Sale cancelled" });
  };

  const closePOS = () => {
    const currentId  = detailId;
    const isFresh    = currentId !== null && currentId === freshSaleIdRef.current;

    if (isFresh) {
      // New sale that was never completed — discard entirely, never appears in the list.
      // Wrap in try/catch defensively: removeSale now throws if any financial record
      // exists (a fresh draft never has one, so this normally succeeds silently).
      try {
        removeSale(currentId!);
      } catch (err) {
        toast({
          title: "Cannot discard",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    } else {
      saveMeta();
    }

    freshSaleIdRef.current = null;
    setDetailId(null);
    setLocalMeta(null);
    setLocalItems([]);
  };

  const handleComplete = (amountPaid: string, paymentMethod: SalePayment, notes: string, walletUsed: number = 0) => {
    if (!detailId || !localMeta) return;

    try {
      // Deduct stock only if not already done (avoids double-deduction on re-payment)
      if (!(detailSale?.stockDeducted ?? false)) {
        deductStockForSale(localItems, detailSale?.saleNumber || "", "POS");
      }

      // Compute grand total from localMeta (tax, delivery, invoice discount)
      const subtotal_     = saleTotal(localItems);
      const lineDiscAmt_  = localItems.reduce((s, i) => {
        const p = parseFloat(i.unitPrice) || 0, q = parseFloat(i.qty) || 0, d = parseFloat(i.discount) || 0;
        return s + (i.discountType === "amt" ? Math.min(d, p) * q : p * q * d / 100);
      }, 0);
      const afterLine_    = subtotal_ - lineDiscAmt_;
      const invDiscVal_   = parseFloat(localMeta.invoiceDiscount || "0") || 0;
      const invDiscAmt_   = localMeta.invoiceDiscountType === "amt"
        ? Math.min(invDiscVal_, afterLine_) : afterLine_ * invDiscVal_ / 100;
      const afterInvDisc_ = Math.max(0, afterLine_ - invDiscAmt_);
      const taxPct_       = Math.max(0, parseFloat(localMeta.taxRate || "0") || 0);
      const taxAmount     = parseFloat((afterInvDisc_ * taxPct_ / 100).toFixed(2));
      const deliveryAmt_  = parseFloat(localMeta.deliveryCharges || "0") || 0;
      const grandTotal_   = parseFloat((afterInvDisc_ + taxAmount + deliveryAmt_).toFixed(2));

      // Auto-post journal entry (only once — skip if already linked)
      let jeId: string | undefined = detailSale?.jeId;
      const prevPaid     = parseFloat(detailSale?.amountPaid || "0") || 0;
      const paidNum      = parseFloat(amountPaid || "0") || 0;   // cash received
      const walletNum    = Math.max(0, walletUsed);              // wallet credit used
      const totalCovered = paidNum + walletNum;                  // total value applied
      const excessCash   = Math.max(0, totalCovered - grandTotal_); // overpayment → refund to wallet
      if (!jeId) {
        // ── First completion: post the primary sale JE ─────────────────────
        // Always use a fresh product list so cost prices are up-to-date
        const freshProds = getProducts();
        // Build per-category breakdown for COGS and Inventory lines
        const catMap = new Map<string, { subtotal: number; costTotal: number }>();
        for (const item of localItems) {
          const prod   = findProductForItem(item, freshProds);
          const qty    = parseFloat(item.qty) || 0;
          const price  = parseFloat(item.unitPrice) || 0;
          const disc   = parseFloat(item.discount) || 0;
          const lineNet = qty * price - (item.discountType === "amt" ? Math.min(disc, price) * qty : qty * price * disc / 100);
          const cost   = effectiveItemCost(item, prod) * qty;
          const cat    = prod?.category?.trim() || "Uncategorised";
          const prev   = catMap.get(cat) ?? { subtotal: 0, costTotal: 0 };
          catMap.set(cat, { subtotal: prev.subtotal + lineNet, costTotal: prev.costTotal + cost });
        }
        const categoryLines = Array.from(catMap.entries()).map(([category, v]) => ({
          category,
          subtotal:  parseFloat(v.subtotal.toFixed(2)),
          costTotal: parseFloat(v.costTotal.toFixed(2)),
        }));
        const costTotal = categoryLines.reduce((s, cl) => s + cl.costTotal, 0);
        const je = autoPostSaleJE({
          source:          "POS",
          reference:       detailSale?.saleNumber || "",
          customer:        localMeta.customer || "Walk-in",
          date:            detailSale?.saleDate || new Date().toISOString().slice(0, 10),
          paymentMethod,
          subtotal:        afterInvDisc_,
          taxAmount,
          deliveryAmount:  deliveryAmt_,
          grandTotal:      grandTotal_,
          costTotal:       parseFloat(costTotal.toFixed(2)),
          categoryLines,
          amountPaid:      paidNum,
        });
        if (je) {
          jeId = je.id;
        }

        // ── Cash receipt for credit sales with upfront partial payment ──────
        // Named-customer cash POS sales already have the full transit embedded
        // (DR Cash + wallet lines / CR Customer AR) in the sale JE, so no
        // separate receipt JE is needed — check `receiptEmbedded`.
        // Only post a separate RCPT JE for credit sales where payment is being
        // collected at the time of "Complete" (unusual but possible).
        if (je?.usesAR && !je.receiptEmbedded && paidNum > 0) {
          const receiptAmt = Math.min(paidNum, grandTotal_);
          autoPostCashReceiptJE({
            reference:     detailSale?.saleNumber || "",
            customer:      localMeta.customer || "Walk-in",
            date:          detailSale?.saleDate || new Date().toISOString().slice(0, 10),
            amount:        receiptAmt,
            paymentMethod,
          });
        }
      } else {
        // ── Subsequent collection against an existing AR sale JE ────────────
        // The primary JE (Dr AR / Cr Revenue) already exists.
        // If new payment is being collected, post a cash-receipt JE:
        //   Dr Cash/Bank | Cr [Contact's sub-ledger]  (works for both buyers/AR and suppliers/AP)
        const additionalPaid = parseFloat((paidNum - prevPaid).toFixed(2));
        if (additionalPaid > 0.005) {
          // Confirm the linked JE debits a contact sub-ledger (Receivable OR Payable)
          // before posting the receipt — avoids double-posting on fully-cash sales
          const linkedJE = getJournalEntries().find(e => e.id === jeId);
          if (linkedJE) {
            const debitLine    = linkedJE.lines.find(l => l.debit > 0);
            const debitSubType = debitLine
              ? (getAccounts().find(a => a.id === debitLine.ledgerId)?.subType ?? "")
              : "";
            const isContactLedger = debitSubType === "Receivable" || debitSubType === "Payable";
            if (isContactLedger) {
              const outstanding = parseFloat((grandTotal_ - prevPaid).toFixed(2));
              const receiptAmt  = Math.min(additionalPaid, outstanding);
              if (receiptAmt > 0.005) {
                autoPostCashReceiptJE({
                  reference:     detailSale?.saleNumber || "",
                  customer:      localMeta.customer || "Walk-in",
                  date:          new Date().toISOString().slice(0, 10),
                  amount:        receiptAmt,
                  paymentMethod,
                });
              }
            }
          }
        }
      }

      // Amount to record on the sale = cash + wallet, capped at grand total
      const recordedPaid = Math.min(totalCovered, grandTotal_).toFixed(2);

      const completedSale = editSale(detailId, {
        ...localMeta,
        notes,
        paymentMethod,
        status: "Completed",
        items: localItems,
        amountPaid: recordedPaid,
        taxRate: localMeta.taxRate ?? "0",
        paidAt: new Date().toISOString(),
        stockDeducted: true,
        ...(jeId ? { jeId } : {}),
      });

      // Wallet balance is now the net CR position on the customer's primary ledger —
      // the sale JE transit (DR Cash / CR Customer Ledger) handles it automatically.
      // No separate wallet-adjustment JE is needed.

      const walletNote = walletNum > 0.005 ? ` (${sym}${walletNum.toFixed(2)} wallet)` : "";
      toast({ title: "Sale completed!", description: `${sym}${paidNum.toFixed(2)} received${walletNote}` });

      // Sale is now saved — clear the fresh flag so closePOS won't delete it
      freshSaleIdRef.current = null;
      // Close POS and show the in-page Sale Complete overlay
      closePOS();
      setCompletedSaleForReceipt(completedSale);
    } catch (err) {
      toast({ title: "Error completing sale", description: String(err), variant: "destructive" });
    }
  };

  // Accept online order without collecting payment now (COD — paid on delivery)
  const handleAcceptOrder = () => {
    if (!detailId || !localMeta) return;
    try {
      // Deduct stock if not already done
      if (!(detailSale?.stockDeducted ?? false)) {
        deductStockForSale(localItems, detailSale?.saleNumber || "", "POS");
      }
      editSale(detailId, {
        ...localMeta,
        status: "Completed",
        items: localItems,
        amountPaid: "0",
        stockDeducted: true,
        paidAt: "",
      });
      toast({ title: "Order accepted", description: "Order confirmed. Collect payment on delivery." });
      freshSaleIdRef.current = null;
      closePOS();
    } catch (err) {
      toast({ title: "Error accepting order", description: String(err), variant: "destructive" });
    }
  };

  // ── List filtering ──
  const filtered = useMemo(() => {
    // Merge sales + adapted sale returns + adapted sale invoices
    const adaptedReturns: SaleRowData[]  = saleReturns.map(adaptReturn);
    const adaptedInvoices: SaleRowData[] = saleInvoices.map(adaptInvoice);
    let rows: SaleRowData[] = [...sales, ...adaptedReturns, ...adaptedInvoices];

    // Type filter
    if (typeFilter !== "All") {
      if (typeFilter === "Sale Return") {
        rows = rows.filter(s => !!s._returnRef);
      } else if (typeFilter === "Invoice") {
        // Show both adapted Invoices AND POS-Invoice typed sales
        rows = rows.filter(s => !s._returnRef && (!!s._invoiceRef || (s.orderType ?? "POS") === "Invoice"));
      } else {
        rows = rows.filter(s => !s._returnRef && !s._invoiceRef && ((s.orderType ?? "POS") === typeFilter));
      }
    }

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

    // ── Advanced filters (skip for return rows where data may not apply) ─────
    if (filterArea) {
      rows = rows.filter(s => !s._returnRef && !!s.agentId && agentIdAreaMap.get(s.agentId) === filterArea);
    }
    if (filterCustomer) {
      rows = rows.filter(s => s.customer === filterCustomer);
    }
    if (filterAgent) {
      rows = rows.filter(s => !s._returnRef && (s.agentName === filterAgent || s.agentId === filterAgent));
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
        if (s._returnRef) return filterPayStatus === "paid"; // returns are always refunded/paid
        const total = saleTotalFull(s);
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
  }, [sales, saleReturns, saleInvoices, typeFilter, statusFilter, search,
      filterArea, filterCustomer, filterAgent, filterDateFrom, filterDateTo, filterPayMode, filterPayStatus,
      agentIdAreaMap]);

  const counts: Record<string, number> = useMemo(() => {
    const c: Record<string, number> = { All: sales.length + saleReturns.length + saleInvoices.length };
    SALE_STATUSES.forEach(s => {
      c[s] = sales.filter(x => x.status === s).length
            + saleInvoices.filter(i => invStatusToSaleStatus(i.status) === s).length;
    });
    c["Sale Return"] = saleReturns.length;
    return c;
  }, [sales, saleReturns, saleInvoices]);

  const revenue = useMemo(() =>
    sales.filter(s => s.status === "Completed").reduce((sum, s) => sum + saleTotalFull(s), 0)
    + saleInvoices.filter(i => i.status === "Paid").reduce((sum, i) => sum + invoiceTotalFull(i), 0),
  [sales, saleInvoices]);

  const filteredSums = useMemo(() => ({
    items: filtered.reduce((s, sale) => {
      if (sale._returnRef) return s + sale._returnRef.items.reduce((q, i) => q + (parseFloat(String(i.qty)) || 0), 0);
      return s + sale.items.reduce((q, i) => q + (parseFloat(i.qty) || 0), 0);
    }, 0),
    total: filtered.reduce((s, sale) => {
      if (sale._returnRef)  return s + sale._returnRef.grandTotal;
      if (sale._invoiceRef) return s + invoiceTotalFull(sale._invoiceRef);
      return s + saleTotalFull(sale);
    }, 0),
    paid: filtered.reduce((s, sale) => {
      if (sale._returnRef) return s + sale._returnRef.grandTotal;
      return s + (parseFloat(sale.amountPaid || "0") || 0);
    }, 0),
    balance: filtered.reduce((s, sale) => {
      if (sale._returnRef) return s;
      if (sale._invoiceRef) return s + Math.max(0, invoiceTotalFull(sale._invoiceRef) - (parseFloat(sale._invoiceRef.amountPaid||"0")||0));
      return s + Math.max(0, saleTotalFull(sale) - (parseFloat(sale.amountPaid || "0") || 0));
    }, 0),
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
      paymentMethod: (newRow.paymentMethod as SalePayment) || defaultPayMethod(),
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
    All:         { base: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                 active: "ring-2 ring-gray-400"     },
    Pending:     { base: "bg-yellow-50 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300",       active: "ring-2 ring-yellow-400"   },
    Draft:       { base: "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400",                  active: "ring-2 ring-gray-400"     },
    Completed:   { base: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",   active: "ring-2 ring-emerald-500"  },
    "On Credit": { base: "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300",       active: "ring-2 ring-orange-400"   },
    Refunded:    { base: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",           active: "ring-2 ring-amber-400"    },
    Cancelled:   { base: "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400",                   active: "ring-2 ring-red-500"      },
  };

  // ─── If POS is open, render full-page POS ───────────────────────────────────
  if (detailId && detailSale && localMeta) {
    return (
      <>
        <POSView
          sale={detailSale}
          localItems={localItems}
          localMeta={localMeta}
          isFresh={detailId === freshSaleIdRef.current}
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
          onPriceModeChange={mode => { setPriceMode(mode); setLocalMeta(m => m ? { ...m, saleMode: mode === "retail" ? "Retail" : mode === "wholesale" ? "Wholesale" : "Clubcard" } : m); }}
          onSetStatus={setStatus}
          onComplete={handleComplete}
          onAcceptOrder={handleAcceptOrder}
          onAddCustomer={async (name, phone, city, company) => {
            try {
              await addCustomer({
                name, phone, email: "",
                company: company || "", industry: "", city: city || "", status: "Active",
                source: "direct", customerType: "POS Customer",
                customerSince: new Date().toISOString().slice(0, 10),
                totalValue: "0", currency: "GBP", notes: "", tags: [],
              });
              toast({ title: "Customer added", description: `"${name}"${company ? ` (${company})` : ""} added to Customers.` });
            } catch (err) {
              toast({ title: "Could not add", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
            }
          }}
          tenantId={currentTenantId}
        />
        <VariantPickerDialog
          product={variantPickerProduct}
          priceMode={priceMode}
          localItems={localItems}
          onClose={() => setVariantPickerProduct(null)}
          onAdd={handleAddVariant}
          onAddBase={p => { setVariantPickerProduct(null); handleAddProductFromCatalogue({ ...p, variants: [] }); }}
        />
      </>
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
        <div className="flex gap-2 items-center">
          <Button size="sm" variant="outline" onClick={syncOnlineOrders} disabled={syncing} className="gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" title="Sync online orders from store">
            <Globe size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : lastSyncCount !== null && lastSyncCount === 0 ? "Synced" : "Sync Online"}
          </Button>
          {can("Add Sales") && (
            <>
              <Button size="sm" variant="outline" onClick={() => { setNewRow(blankNewRow()); setNewRowActive(0); }} className="gap-1.5" disabled={!!newRow} data-testid="btn-new-sale-row">
                <Plus size={14} /> New Sale
              </Button>
              <Button size="sm" onClick={() => { const s = addSale(blankSale()); freshSaleIdRef.current = s.id; openDetailDirect(s); }} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                <ShoppingCart size={14} /> Open POS
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Status KPI pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {["All", ...SALE_STATUSES].map(s => {
          const isActive = statusFilter === s;
          const colors = pillColors[s] ?? pillColors["All"];
          return (
            <button key={s} aria-pressed={isActive}
              onClick={() => setStatusFilter(prev => prev === s && s !== "All" ? "All" : s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] ${colors.base} ${isActive ? `${colors.active} ring-offset-1 shadow-sm` : "ring-0 opacity-80 hover:opacity-100"}`}>
              {s === "Draft" ? "Hold" : s}: <span>{counts[s] ?? 0}</span>
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

      {/* Type filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Type:</span>
        {(["All", "POS", "Invoice", "Online", "Repair", "Sale Return"] as const).map(t => {
          const isActive = typeFilter === t;
          const colorMap: Record<string, string> = {
            All:          "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
            POS:          "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
            Invoice:      "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
            Online:       "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
            Repair:       "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
            "Sale Return":"bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300",
          };
          const activeRing: Record<string, string> = {
            All: "ring-2 ring-gray-400", POS: "ring-2 ring-blue-400",
            Invoice: "ring-2 ring-violet-400", Online: "ring-2 ring-emerald-400",
            Repair: "ring-2 ring-amber-400",
            "Sale Return": "ring-2 ring-rose-400",
          };
          const iconMap: Record<string, React.ReactNode> = {
            POS:          <ShoppingCart size={10} />,
            Invoice:      <Receipt size={10} />,
            Online:       <Globe size={10} />,
            Repair:       <Wrench size={10} />,
            "Sale Return":<Undo2 size={10} />,
          };
          const count = t === "All" ? counts["All"]
            : t === "Sale Return" ? (counts["Sale Return"] ?? 0)
            : t === "Invoice" ? (sales.filter(s => (s.orderType ?? "POS") === "Invoice").length + saleInvoices.length)
            : sales.filter(s => (s.orderType ?? "POS") === t).length;
          return (
            <button key={t} aria-pressed={isActive}
              onClick={() => setTypeFilter(prev => prev === t && t !== "All" ? "All" : t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] ${colorMap[t]} ${isActive ? `${activeRing[t]} ring-offset-1 shadow-sm` : "opacity-80 hover:opacity-100"}`}>
              {iconMap[t]} {t}: <span>{count}</span>
              {isActive && t !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
            </button>
          );
        })}
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

        {/* Wrap text toggle */}
        <button
          onClick={toggleWrap}
          title={wrapText ? "Disable text wrap" : "Enable text wrap"}
          className={`h-8 px-2.5 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition-all ${
            wrapText
              ? "border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
              : "border-gray-200 dark:border-border bg-white dark:bg-card text-muted-foreground hover:border-gray-300"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 0 1 0 6H3"/>
            <polyline points="9 15 6 18 9 21"/><line x1="3" y1="18" x2="6" y2="18"/>
          </svg>
          Wrap
        </button>

        {can("Add Sales") && newRow && (
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
              <SelectCombobox
                value={filterArea}
                onChange={setFilterArea}
                options={[{ value: "", label: "All Areas" }, ...agentAreaOpts.map(a => ({ value: a, label: a }))]}
                placeholder="All Areas"
                inputClassName="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Customer */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <UserCheck size={10} className="text-emerald-500" /> Customer
              </label>
              <SelectCombobox
                value={filterCustomer}
                onChange={setFilterCustomer}
                options={[{ value: "", label: "All Customers" }, ...customerOpts.map(c => ({ value: c, label: c }))]}
                placeholder="All Customers"
                inputClassName="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Sales Agent */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Users2 size={10} className="text-blue-500" /> Sales Agent
              </label>
              <SelectCombobox
                value={filterAgent}
                onChange={setFilterAgent}
                options={[
                  { value: "", label: "All Agents" },
                  ...agentOpts.map(a => ({ value: a.name, label: `${a.name} (${a.code})`, sub: a.code })),
                ]}
                placeholder="All Agents"
                inputClassName="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Payment Mode */}
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Wallet size={10} className="text-amber-500" /> Payment Mode
              </label>
              {(() => {
                // Combine COA Cash & Bank ledger names with any payment methods already on existing sales
                const coaNames = getCashBankLedgers().map(a => a.name);
                const inData   = [...new Set(sales.map(s => s.paymentMethod).filter(Boolean))] as string[];
                const modes    = [...new Set([...coaNames, ...inData])];
                return (
                  <SelectCombobox
                    value={filterPayMode}
                    onChange={setFilterPayMode}
                    options={[{ value: "", label: "All Modes" }, ...modes.map(p => ({ value: p, label: p }))]}
                    placeholder="All Modes"
                    inputClassName="w-full h-8 text-[12px] px-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                );
              })()}
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
          {can("Add Sales") && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field] ?? "";
                return (
                  <td key={c.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : c.type === "readonly" ? "bg-gray-50/60 dark:bg-gray-800/20" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                    style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }}>
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
                      <div className={`w-full flex items-center px-3 cursor-text ${wrapText ? "py-2" : "h-full"}`} onClick={() => c.type !== "readonly" && setNewRowActive(ci)}>
                        {c.field === "status" && val ? (
                          <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${STATUS_BG[val as SaleStatus] ?? ""}`}>{val}</span>
                        ) : (
                          <span className={`${wrapText ? "break-words" : "truncate"} text-[13px] ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }}>
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
              {search || statusFilter !== "All" || typeFilter !== "All" ? "No sales match your filters." : "No sales yet — click Open POS to create your first sale."}
            </td></tr>
          ) : filtered.map((sale, ri) => {
            const isReturnRow  = !!sale._returnRef;
            const isInvoiceRow = !!sale._invoiceRef;
            return (
            <tr key={sale.id}
              className={`border-b transition-colors group ${
                isReturnRow
                  ? "border-rose-100 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-50/50 dark:hover:bg-rose-950/20"
                  : isInvoiceRow
                  ? "border-violet-100 dark:border-violet-900/40 bg-violet-50/20 dark:bg-violet-950/10 hover:bg-violet-50/40 dark:hover:bg-violet-950/20"
                  : activeCell?.id === sale.id ? "border-gray-100 dark:border-border bg-blue-50/30 dark:bg-blue-950/10"
                  : ri % 2 === 0 ? "border-gray-100 dark:border-border bg-white dark:bg-card hover:bg-blue-50/20 dark:hover:bg-blue-950/10"
                  : "border-gray-100 dark:border-border bg-gray-50/50 dark:bg-muted/10 hover:bg-blue-50/20 dark:hover:bg-blue-950/10"
              }`}>
              <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 font-mono select-none" style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }}>{ri + 1}</td>
              {COLS.map((c, ci) => {
                const isA = !isReturnRow && !isInvoiceRow && activeCell?.id === sale.id && activeCell.col === ci;
                const rawVal = cellValue(sale, c.field);
                const canEdit = !isReturnRow && !isInvoiceRow && can("Edit Sales") && c.type !== "readonly";
                return (
                  <td key={c.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${c.type === "readonly" ? "bg-gray-50/40 dark:bg-gray-800/10" : isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : canEdit ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                    style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }}
                    onClick={() => canEdit && !isA && setActiveCell({ id: sale.id, col: ci })}>
                    {c.field === "orderType" ? (
                      <div className={`w-full flex items-center px-3 ${wrapText ? "py-2" : "h-full"}`}>
                        {rawVal === "Sale Return" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                            <Undo2 size={9} /> Return
                          </span>
                        ) : rawVal === "Online" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            <Globe size={9} /> Online
                          </span>
                        ) : rawVal === "Invoice" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                            <Receipt size={9} /> Invoice
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            <ShoppingCart size={9} /> POS
                          </span>
                        )}
                      </div>
                    ) : c.field === "status" && !isA ? (
                      <div className={`w-full flex items-center gap-1 px-3 cursor-pointer ${wrapText ? "py-2" : "h-full"}`}>
                        <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${STATUS_BG[rawVal as SaleStatus] ?? ""}`}>{rawVal}</span>
                        {(() => {
                          const ret = returnsBySaleId.get(sale.id);
                          if (!ret) return null;
                          return (
                            <span
                              title={`${ret.count} return${ret.count > 1 ? "s" : ""} · ${Number.isInteger(ret.qty) ? ret.qty : ret.qty.toFixed(1)} item${ret.qty !== 1 ? "s" : ""} returned`}
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
                            >
                              <Undo2 size={9} /> Returned
                            </span>
                          );
                        })()}
                      </div>
                    ) : c.field === "paymentMethod" && !isA ? (
                      <div className={`w-full flex items-center gap-1.5 px-3 cursor-pointer ${wrapText ? "py-2" : "h-full"}`}>
                        {getPaymentIcon(rawVal)}
                        <span className="text-[12px] text-gray-600 dark:text-gray-400">{rawVal}</span>
                      </div>
                    ) : (c.field === "total" || c.field === "amountPaid" || c.field === "balance") ? (
                      <div className={`w-full flex items-center px-3 ${wrapText ? "py-2" : "h-full"}`}>
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
                      <div className={`w-full flex items-center px-3 ${wrapText ? "py-2" : "h-full"}`}>
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
                    ) : c.field === "orderStage" ? (
                      <div className={`w-full flex items-center px-3 ${wrapText ? "py-2" : "h-full"}`}>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          rawVal === "Delivered"  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
                          rawVal === "Shipped"    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" :
                          rawVal === "Processing" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                          rawVal === "Confirmed"  ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" :
                          rawVal === "Placed"     ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300" :
                          rawVal === "Cancelled"  ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400" :
                          rawVal === "Refunded"   ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300" :
                                                   "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                        }`}>
                          {rawVal === "Delivered"  ? <CheckCircle2 size={10} /> :
                           rawVal === "Shipped"    ? <Truck size={10} /> :
                           rawVal === "Processing" ? <Clock size={10} /> :
                           rawVal === "Confirmed"  ? <CheckCircle2 size={10} /> :
                           rawVal === "Cancelled" || rawVal === "Refunded" ? <XCircle size={10} /> :
                                                    <Circle size={10} />}
                          {rawVal}
                        </span>
                      </div>
                    ) : (
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={canEdit}
                        wrapText={wrapText}
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
              <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isReturnRow ? (
                    <button className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      title="View return" onClick={() => navigate(`/returns?q=${encodeURIComponent(sale.saleNumber)}`)}>
                      <Eye size={13} />
                    </button>
                  ) : isInvoiceRow ? (
                    <button className="p-1 rounded text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
                      title="Open Invoice" onClick={() => navigate(`/invoices/${sale.id}`)}>
                      <Eye size={13} />
                    </button>
                  ) : (
                    <button className="p-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      title="Open POS" onClick={() => openDetail(sale.id)}>
                      <Eye size={13} />
                    </button>
                  )}
                  {!isReturnRow && !isInvoiceRow && can("Delete Sales") && (
                    <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Delete" onClick={() => setDeleteId(sale.id)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
            );
          })}

          {/* ── Totals row ── */}
          {filtered.length > 0 && (
            <tr className="border-t-2 border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 sticky bottom-0 z-10">
              <td className="border-r border-blue-200 dark:border-blue-800 text-center text-[11px] font-bold text-blue-500 dark:text-blue-400 select-none" style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }}>Σ</td>
              {COLS.map((c) => (
                <td key={c.field} className="border-r border-blue-100 dark:border-blue-900/50 px-3" style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }}>
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
              <td className="sticky right-0 bg-blue-50/60 dark:bg-blue-950/20 border-l border-blue-100 dark:border-blue-900/50" style={wrapText ? { minHeight: CELL_H } : { height: CELL_H }} />
            </tr>
          )}

          {/* Add row */}
          {can("Add Sales") && !newRow && (
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
            <AlertDialogAction onClick={() => {
              if (!deleteId) return;
              try {
                removeSale(deleteId);
                toast({ title: "Sale deleted" });
              } catch (err) {
                toast({
                  title: "Cannot delete",
                  description: err instanceof Error ? err.message : String(err),
                  variant: "destructive",
                });
              }
              setDeleteId(null);
            }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
