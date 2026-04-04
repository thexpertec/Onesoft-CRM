import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useSales } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import {
  Sale, SaleItem, SaleStatus, SalePayment,
  SALE_STATUSES, SALE_PAYMENTS,
  getProducts, getCustomers, getProductCategories, getSales, Product,
} from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Search, X, Save, Trash2, Eye,
  ShoppingCart, Check, RotateCcw, Ban, CreditCard, Banknote,
  ArrowLeft, Tag, Minus, Package, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";
import { Combobox, ComboOption } from "@/components/combobox";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_BG: Record<SaleStatus, string> = {
  Draft:     "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
  Completed: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  Refunded:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Cancelled: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
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
  unit: "pcs", unitPrice: "0.00", discount: "0", notes: "",
});

const blankSale = (): Omit<Sale, "id" | "saleNumber" | "createdAt" | "updatedAt"> => ({
  saleDate: new Date().toISOString().slice(0, 10),
  customer: "", status: "Draft", paymentMethod: "Cash", notes: "", items: [],
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
  onDeleteItem: (itemId: string) => void;
  onAddProduct: (product: Product) => void;
  onAddCustomItem: () => void;
  onSetStatus: (status: SaleStatus) => void;
  addingItem: boolean;
  newItem: SaleItem | null;
  onNewItemChange: (item: SaleItem) => void;
  onCommitNewItem: () => void;
  onCancelNewItem: () => void;
}

function POSView({
  sale, localItems, localMeta, customerComboOpts, productComboOpts,
  onClose, onMetaChange, onSaveMeta, onItemChange, onItemBlur,
  onDeleteItem, onAddProduct, onAddCustomItem, onSetStatus,
  addingItem, newItem, onNewItemChange, onCommitNewItem, onCancelNewItem,
}: POSViewProps) {
  const [prodSearch, setProdSearch] = useState("");
  const [catFilter, setCatFilter]   = useState("All");

  const allProducts  = useMemo(() => getProducts().filter(p => p.status !== "Inactive"), []);
  const allCats      = useMemo(() => {
    const cats = getProductCategories().map(c => c.name);
    const fromProds = allProducts.map(p => p.category).filter(Boolean);
    const set = new Set([...cats, ...fromProds]);
    return Array.from(set).sort();
  }, [allProducts]);

  const filteredProds = useMemo(() => {
    let list = allProducts;
    if (catFilter !== "All") list = list.filter(p => p.category === catFilter);
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

  const grandTotal    = localItems.reduce((s, i) => s + lineTotal(i), 0);
  const discountAmt   = discountTotal(localItems);
  const isDraft       = sale.status === "Draft";
  const isCompleted   = sale.status === "Completed";

  const qtyChange = (itemId: string, delta: number) => {
    const item = localItems.find(i => i.id === itemId);
    if (!item) return;
    const next = Math.max(0, (parseFloat(item.qty) || 0) + delta);
    onItemChange(itemId, "qty", String(next));
    setTimeout(onItemBlur, 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-zinc-950 overflow-hidden">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="h-13 flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="w-px h-5 bg-gray-200 dark:bg-zinc-700" />

        {/* Sale # + status */}
        <div className="flex items-center gap-2">
          <ShoppingCart size={15} className="text-blue-500" />
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{sale.saleNumber}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BG[sale.status]}`}>{sale.status}</span>
        </div>

        <div className="w-px h-5 bg-gray-200 dark:bg-zinc-700" />

        {/* Meta fields */}
        <div className="flex items-center gap-4 flex-1 min-w-0 flex-wrap">
          <label className="flex items-center gap-1.5 text-[11px] text-gray-400 whitespace-nowrap">
            Customer
            <Combobox
              value={localMeta.customer}
              onChange={v => onMetaChange({ customer: v })}
              onSelect={opt => { onMetaChange({ customer: opt.value }); onSaveMeta(); }}
              options={customerComboOpts}
              placeholder="Walk-in customer…"
              className="w-40"
              inputClassName="border border-gray-200 dark:border-zinc-600 rounded px-2 py-1 text-[12px] text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800 w-40 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-400 whitespace-nowrap">
            Date
            <input type="date"
              value={localMeta.saleDate}
              onChange={e => onMetaChange({ saleDate: e.target.value })}
              onBlur={onSaveMeta}
              className="border border-gray-200 dark:border-zinc-600 rounded px-2 py-1 text-[12px] text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-400 whitespace-nowrap">
            Payment
            <div className="relative">
              <select
                value={localMeta.paymentMethod}
                onChange={e => { onMetaChange({ paymentMethod: e.target.value as SalePayment }); }}
                onBlur={onSaveMeta}
                className="appearance-none border border-gray-200 dark:border-zinc-600 rounded px-2 pr-6 py-1 text-[12px] text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {SALE_PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-400 whitespace-nowrap">
            Notes
            <input
              value={localMeta.notes}
              onChange={e => onMetaChange({ notes: e.target.value })}
              onBlur={onSaveMeta}
              placeholder="Optional…"
              className="border border-gray-200 dark:border-zinc-600 rounded px-2 py-1 text-[12px] text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800 w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </label>
        </div>

        {/* Last saved */}
        <span className="text-[11px] text-gray-400 hidden sm:block whitespace-nowrap">
          {new Date(sale.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* ── Body: two panels ────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ LEFT: Cart ══════════════════════════════════════════════════════ */}
        <div className="w-[56%] flex flex-col border-r border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950">

          {/* Cart header */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
            <h2 className="text-[13px] font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
              <ShoppingCart size={14} className="text-blue-400" />
              Order Items
              <span className="text-[11px] text-gray-400 font-normal ml-1">({localItems.length})</span>
            </h2>
            {isDraft && (
              <button
                onClick={onAddCustomItem}
                className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-2 py-1 rounded transition-colors"
              >
                <Plus size={11} /> Custom Item
              </button>
            )}
          </div>

          {/* Cart items — scrollable */}
          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">

            {localItems.length === 0 && !addingItem && (
              <div className="flex flex-col items-center justify-center h-40 text-gray-300 dark:text-zinc-600 gap-3">
                <ShoppingCart size={36} strokeWidth={1.2} />
                <span className="text-sm">
                  {isDraft ? "Select products from the right to add them here" : "No items recorded"}
                </span>
              </div>
            )}

            {localItems.map((item, idx) => (
              <div key={item.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-3 flex gap-3 items-start group/item hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
                {/* Index */}
                <span className="text-[11px] text-gray-300 w-4 shrink-0 pt-0.5">{idx + 1}</span>

                {/* Thumbnail small */}
                <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
                  {(() => {
                    const prod = getProducts().find(p => p.name === item.productName || p.sku === item.sku);
                    return <ProductThumbnail product={prod ?? { name: item.productName, sku: item.sku } as Product} size="sm" />;
                  })()}
                </div>

                {/* Name + SKU */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-800 dark:text-gray-100 truncate">{item.productName || "—"}</div>
                  <div className="text-[10px] text-gray-400 font-mono">{item.sku || "no sku"}</div>
                  {/* Notes in-line */}
                  {isDraft && (
                    <input
                      value={item.notes}
                      onChange={e => onItemChange(item.id, "notes", e.target.value)}
                      onBlur={onItemBlur}
                      placeholder="Notes…"
                      className="mt-1 w-full text-[11px] text-gray-500 bg-transparent placeholder:text-gray-300 outline-none border-b border-transparent hover:border-gray-200 focus:border-blue-300 transition-colors"
                    />
                  )}
                </div>

                {/* Qty control */}
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wide">Qty</span>
                  <div className="flex items-center gap-0.5">
                    {isDraft && (
                      <button
                        onClick={() => qtyChange(item.id, -1)}
                        className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-700 transition-colors"
                      >
                        <Minus size={10} />
                      </button>
                    )}
                    <input
                      type="number" min="0"
                      value={item.qty}
                      onChange={e => onItemChange(item.id, "qty", e.target.value)}
                      onBlur={onItemBlur}
                      disabled={!isDraft}
                      className="w-10 h-5 text-center text-[12px] font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded disabled:bg-transparent disabled:border-transparent outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    {isDraft && (
                      <button
                        onClick={() => qtyChange(item.id, 1)}
                        className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-700 transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    )}
                  </div>
                  <span className="text-[9px] text-gray-400">{item.unit}</span>
                </div>

                {/* Price + Discount */}
                <div className="flex flex-col gap-1 shrink-0 w-20">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-400 uppercase tracking-wide">Price</span>
                    <div className="flex items-center">
                      <span className="text-[11px] text-gray-400 mr-0.5">£</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={item.unitPrice}
                        onChange={e => onItemChange(item.id, "unitPrice", e.target.value)}
                        onBlur={onItemBlur}
                        disabled={!isDraft}
                        className="flex-1 text-[12px] text-right text-gray-700 dark:text-gray-200 bg-transparent outline-none disabled:pointer-events-none border-b border-transparent hover:border-gray-200 focus:border-blue-300 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-400 uppercase tracking-wide">Disc %</span>
                    <div className="flex items-center">
                      <input
                        type="number" min="0" max="100"
                        value={item.discount}
                        onChange={e => onItemChange(item.id, "discount", e.target.value)}
                        onBlur={onItemBlur}
                        disabled={!isDraft}
                        className="flex-1 text-[12px] text-right text-gray-700 dark:text-gray-200 bg-transparent outline-none disabled:pointer-events-none border-b border-transparent hover:border-gray-200 focus:border-blue-300 transition-colors"
                      />
                      <span className="text-[11px] text-gray-400 ml-0.5">%</span>
                    </div>
                  </div>
                </div>

                {/* Line total */}
                <div className="shrink-0 w-20 text-right pt-0.5">
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Total</div>
                  <div className="text-[14px] font-bold font-mono tabular-nums text-gray-800 dark:text-gray-100">
                    £{lineTotal(item).toFixed(2)}
                  </div>
                  {parseFloat(item.discount) > 0 && (
                    <div className="text-[10px] text-amber-500 font-mono">
                      −£{((parseFloat(item.qty)||0)*(parseFloat(item.unitPrice)||0)*(parseFloat(item.discount)||0)/100).toFixed(2)}
                    </div>
                  )}
                </div>

                {/* Delete */}
                {isDraft && (
                  <button
                    onClick={() => onDeleteItem(item.id)}
                    className="opacity-0 group-hover/item:opacity-100 shrink-0 w-5 h-5 mt-0.5 text-gray-300 hover:text-red-500 transition-all rounded"
                    title="Remove item"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}

            {/* New custom item form */}
            {addingItem && newItem && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border-2 border-amber-300 dark:border-amber-700 p-3 space-y-2">
                <div className="text-[11px] font-semibold text-amber-600 mb-2">New Custom Item</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-wide">Product / Service *</label>
                    <Combobox
                      autoFocus
                      value={newItem.productName}
                      onChange={v => onNewItemChange({ ...newItem, productName: v })}
                      onSelect={opt => {
                        const prod = getProducts().find(p => p.name === opt.value);
                        onNewItemChange({ ...newItem, productName: opt.value, sku: prod?.sku ?? newItem.sku, unit: prod?.unit || newItem.unit, unitPrice: prod?.price || newItem.unitPrice });
                      }}
                      options={productComboOpts}
                      placeholder="Name *"
                      className="w-full"
                      inputClassName="w-full mt-0.5 px-2 py-1 border border-amber-300 dark:border-amber-600 rounded text-[12px] bg-white dark:bg-zinc-800 outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-wide">SKU</label>
                    <input value={newItem.sku}
                      onChange={e => onNewItemChange({ ...newItem, sku: e.target.value })}
                      placeholder="SKU"
                      className="w-full mt-0.5 px-2 py-1 border border-amber-300 dark:border-amber-600 rounded text-[12px] bg-white dark:bg-zinc-800 outline-none focus:ring-1 focus:ring-amber-400" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-wide">Qty</label>
                    <input type="number" min="0" value={newItem.qty}
                      onChange={e => onNewItemChange({ ...newItem, qty: e.target.value })}
                      className="w-full mt-0.5 px-2 py-1 border border-amber-300 dark:border-amber-600 rounded text-[12px] bg-white dark:bg-zinc-800 outline-none focus:ring-1 focus:ring-amber-400" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-wide">Unit</label>
                    <input value={newItem.unit}
                      onChange={e => onNewItemChange({ ...newItem, unit: e.target.value })}
                      placeholder="pcs"
                      className="w-full mt-0.5 px-2 py-1 border border-amber-300 dark:border-amber-600 rounded text-[12px] bg-white dark:bg-zinc-800 outline-none focus:ring-1 focus:ring-amber-400" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-wide">Unit Price (£)</label>
                    <input type="number" min="0" step="0.01" value={newItem.unitPrice}
                      onChange={e => onNewItemChange({ ...newItem, unitPrice: e.target.value })}
                      className="w-full mt-0.5 px-2 py-1 border border-amber-300 dark:border-amber-600 rounded text-[12px] bg-white dark:bg-zinc-800 outline-none focus:ring-1 focus:ring-amber-400 text-right" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 uppercase tracking-wide">Discount %</label>
                    <input type="number" min="0" max="100" value={newItem.discount}
                      onChange={e => onNewItemChange({ ...newItem, discount: e.target.value })}
                      className="w-full mt-0.5 px-2 py-1 border border-amber-300 dark:border-amber-600 rounded text-[12px] bg-white dark:bg-zinc-800 outline-none focus:ring-1 focus:ring-amber-400 text-right" />
                  </div>
                </div>
                <div className="text-right font-mono font-semibold text-[13px] text-gray-700 dark:text-gray-300">
                  Line Total: £{((parseFloat(newItem.qty)||0)*(parseFloat(newItem.unitPrice)||0)*(1-parseFloat(newItem.discount||"0")/100)).toFixed(2)}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={onCancelNewItem} className="h-7 text-[11px]">Cancel</Button>
                  <Button size="sm" onClick={onCommitNewItem} className="h-7 gap-1 text-[11px]"><Plus size={11} /> Add to Sale</Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Totals + Action bar ─────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 space-y-2.5">
            {/* Totals */}
            <div className="space-y-1">
              <div className="flex justify-between text-[12px] text-gray-500 dark:text-gray-400">
                <span>Subtotal</span>
                <span className="font-mono">£{subTotal(localItems).toFixed(2)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-[12px] text-amber-600">
                  <span>Discount saved</span>
                  <span className="font-mono">−£{discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-100 dark:border-zinc-800 pt-1.5">
                <span className="text-[15px] font-bold text-gray-800 dark:text-gray-100">Grand Total</span>
                <span className="text-[18px] font-bold font-mono tabular-nums text-gray-900 dark:text-white">
                  £{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              {isDraft && (
                <>
                  <Button size="sm" variant="outline" onClick={onClose} className="gap-1 flex-1 h-9 text-[12px]">
                    <Save size={13} /> Save Draft
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => { onSetStatus("Completed"); onClose(); }}
                    className="gap-1 flex-1 h-9 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Check size={13} /> Complete Sale
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => onSetStatus("Cancelled")}
                    className="gap-1 h-9 text-[12px] text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
                  >
                    <Ban size={13} /> Cancel
                  </Button>
                </>
              )}
              {isCompleted && (
                <>
                  <Button size="sm" variant="outline" onClick={() => onSetStatus("Refunded")} className="gap-1 flex-1 h-9 text-[12px] text-amber-600 border-amber-200 hover:bg-amber-50">
                    <RotateCcw size={13} /> Refund
                  </Button>
                  <Button size="sm" variant="outline" onClick={onClose} className="flex-1 h-9 text-[12px]">Close</Button>
                </>
              )}
              {(sale.status === "Refunded" || sale.status === "Cancelled") && (
                <Button size="sm" variant="outline" onClick={onClose} className="flex-1 h-9 text-[12px]">Close</Button>
              )}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Product Catalogue ═════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 overflow-hidden">

          {/* Search + category filters */}
          <div className="px-4 pt-3 pb-2 border-b border-gray-100 dark:border-zinc-800 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                  placeholder="Search products by name, SKU or category…"
                  className="w-full pl-8 pr-3 py-1.5 text-[13px] border border-gray-200 dark:border-zinc-700 rounded-lg bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white dark:focus:bg-zinc-700"
                />
                {prodSearch && (
                  <button onClick={() => setProdSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={11} />
                  </button>
                )}
              </div>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">{filteredProds.length} products</span>
            </div>

            {/* Category filter pills */}
            <div className="flex gap-1 flex-wrap">
              {["All", ...allCats].map((cat, i) => {
                const isActive = catFilter === cat;
                const colClass = cat === "All" ? "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300" : CAT_COLOURS[(i - 1) % CAT_COLOURS.length];
                return (
                  <button
                    key={cat}
                    onClick={() => setCatFilter(prev => prev === cat && cat !== "All" ? "All" : cat)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${colClass} ${isActive ? "ring-2 ring-offset-1 ring-blue-400 scale-105" : "opacity-70 hover:opacity-100"}`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product grid — scrollable */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredProds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-300 dark:text-zinc-600 gap-2">
                <Package size={32} strokeWidth={1.2} />
                <span className="text-sm">No products found</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 content-start">
                {filteredProds.map((product, pi) => {
                  const catColour = (() => {
                    const idx = allCats.indexOf(product.category);
                    return idx >= 0 ? CAT_COLOURS[idx % CAT_COLOURS.length] : CAT_COLOURS[0];
                  })();
                  return (
                    <button
                      key={product.id}
                      disabled={!isDraft}
                      onClick={() => onAddProduct(product)}
                      title={isDraft ? `Add ${product.name} to cart` : "Sale is not in Draft status"}
                      className={`group text-left bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-3 flex flex-col gap-2 transition-all ${isDraft ? "hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md cursor-pointer active:scale-[0.97]" : "opacity-50 cursor-not-allowed"}`}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-square w-full rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-700">
                        <ProductThumbnail product={product} size="full" />
                      </div>

                      {/* Info */}
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {product.name}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono truncate">{product.sku || "—"}</div>

                        <div className="flex items-center justify-between mt-1.5 gap-1">
                          <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            £{parseFloat(product.price || "0").toFixed(2)}
                          </span>
                          {product.category && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full truncate max-w-[60px] ${catColour}`}>
                              {product.category}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Add overlay on hover */}
                      {isDraft && (
                        <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-blue-500/0 group-hover:bg-blue-500/5 transition-colors pointer-events-none">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                            <Plus size={9} /> Add
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom strip: custom item shortcut */}
          {isDraft && (
            <div className="shrink-0 border-t border-gray-100 dark:border-zinc-800 px-4 py-2 flex items-center gap-2">
              <Tag size={12} className="text-gray-400" />
              <span className="text-[11px] text-gray-400 flex-1">Can't find the product?</span>
              <button
                onClick={onAddCustomItem}
                className="text-[11px] text-blue-500 hover:text-blue-700 font-medium px-2 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded transition-colors"
              >
                + Add Custom Item
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main SalesPage component ─────────────────────────────────────────────────
export default function SalesPage() {
  const [location, navigate] = useLocation();
  const isNewSale = location.includes("/new");
  const { sales, addSale, editSale, removeSale } = useSales();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const products          = useMemo(() => getProducts(), []);
  const customerComboOpts = useMemo<ComboOption[]>(() => getCustomers().map(c => ({ value: c.name, label: c.name, sub: c.email || c.phone })), []);
  const productComboOpts  = useMemo<ComboOption[]>(() => getProducts().map(p => ({ value: p.name, label: p.name, sub: p.sku, tag: p.category })), []);

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
  const [addingItem,  setAddingItem] = useState(false);
  const [newItem,     setNewItem]    = useState<SaleItem | null>(null);
  const [localMeta,   setLocalMeta]  = useState<{ customer: string; saleDate: string; paymentMethod: SalePayment; notes: string } | null>(null);

  // ── COLS ──
  const COLS: ColDef[] = useMemo(() => [
    { field: "saleNumber",    label: "Sale #",     minW: 145, type: "readonly" },
    { field: "saleDate",      label: "Date",       minW: 130, type: "date"     },
    { field: "customer",      label: "Customer",   minW: 200, type: "text"     },
    { field: "status",        label: "Status",     minW: 130, type: "select",  options: [...SALE_STATUSES] },
    { field: "itemCount",     label: "Items",      minW: 60,  type: "readonly" },
    { field: "total",         label: "Total (£)",  minW: 110, type: "readonly" },
    { field: "paymentMethod", label: "Payment",    minW: 140, type: "select",  options: [...SALE_PAYMENTS] },
    { field: "notes",         label: "Notes",      minW: 230, type: "text"     },
  ], []);
  const TOTAL_W = useMemo(() => COLS.reduce((a, c) => a + c.minW, 0), [COLS]);

  const cellValue = (sale: Sale, field: string): string => {
    if (field === "itemCount") return String(sale.items.length);
    if (field === "total")     return saleTotal(sale.items).toFixed(2);
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
    setAddingItem(false);
    setNewItem(null);
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
    if (!detailId || !localMeta) return;
    setLocalItems(items);
    editSale(detailId, { ...localMeta, items });
  }, [detailId, localMeta, editSale]);

  // ── Add product from right panel ──
  const handleAddProductFromCatalogue = useCallback((product: Product) => {
    const item: SaleItem = {
      ...blankSaleItem(),
      productName: product.name,
      sku: product.sku,
      unit: product.unit || "pcs",
      unitPrice: product.price || "0.00",
    };
    const next = [...localItems, item];
    saveItems(next);
    toast({ title: `${product.name} added` });
  }, [localItems, saveItems, toast]);

  const handleItemFieldChange = (itemId: string, field: keyof SaleItem, value: string) => {
    setLocalItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
  };

  const handleItemBlur = () => {
    if (detailId && localMeta) editSale(detailId, { ...localMeta, items: localItems });
  };

  const handleDeleteItem = (itemId: string) => saveItems(localItems.filter(i => i.id !== itemId));

  const handleCommitNewItem = () => {
    if (!newItem?.productName.trim()) { toast({ title: "Product/service name is required", variant: "destructive" }); return; }
    saveItems([...localItems, newItem]);
    setNewItem(null); setAddingItem(false);
  };

  const setStatus = (status: SaleStatus) => {
    if (!detailId || !localMeta) return;
    editSale(detailId, { ...localMeta, status, items: localItems });
    toast({ title: status === "Completed" ? "Sale completed!" : status === "Refunded" ? "Sale refunded" : "Sale cancelled" });
  };

  const closePOS = () => {
    saveMeta();
    setDetailId(null);
    setLocalMeta(null);
    setLocalItems([]);
    setAddingItem(false);
    setNewItem(null);
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
      notes: newRow.notes, items: [],
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
        onDeleteItem={handleDeleteItem}
        onAddProduct={handleAddProductFromCatalogue}
        onAddCustomItem={() => { setAddingItem(true); setNewItem(blankSaleItem()); }}
        onSetStatus={setStatus}
        addingItem={addingItem}
        newItem={newItem}
        onNewItemChange={setNewItem}
        onCommitNewItem={handleCommitNewItem}
        onCancelNewItem={() => { setNewItem(null); setAddingItem(false); }}
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
            Revenue: £{revenue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
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
                    ) : c.field === "total" ? (
                      <div className="w-full h-full flex items-center px-3">
                        <span className="text-[13px] font-mono font-semibold tabular-nums text-gray-700 dark:text-foreground">£{parseFloat(rawVal || "0").toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
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
