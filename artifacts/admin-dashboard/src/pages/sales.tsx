import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useSales } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import {
  Sale, SaleItem, SaleStatus, SalePayment,
  SALE_STATUSES, SALE_PAYMENTS,
  getProducts, getCustomers,
} from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  Receipt, Plus, Search, X, Save, Trash2, Eye,
  ShoppingCart, Check, RotateCcw, Ban, CreditCard, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
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

const saleTotal = (items: SaleItem[]): number => items.reduce((s, i) => s + lineTotal(i), 0);
const discountTotal = (items: SaleItem[]): number => {
  return items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0, p = parseFloat(i.unitPrice) || 0, d = parseFloat(i.discount) || 0;
    return s + q * p * (d / 100);
  }, 0);
};
const subTotal = (items: SaleItem[]): number => items.reduce((s, i) => {
  return s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0);
}, 0);

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

// ─── Main component ───────────────────────────────────────────────────────────
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

  // ── POS dialog state ──
  const [detailId,    setDetailId]    = useState<string | null>(null);
  const [localItems,  setLocalItems]  = useState<SaleItem[]>([]);
  const [newItem,     setNewItem]     = useState<SaleItem | null>(null);
  const [addingItem,  setAddingItem]  = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [localMeta,   setLocalMeta]   = useState<{ customer: string; saleDate: string; paymentMethod: SalePayment; notes: string } | null>(null);

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
      setDetailId(draft.id);
      navigate("/sales", { replace: true });
    }
  }, [isNewSale, isAuthenticated]);

  // ── Open POS dialog ──
  const openDetail = (id: string) => {
    const sale = sales.find(s => s.id === id);
    if (!sale) return;
    setLocalItems([...sale.items]);
    setLocalMeta({ customer: sale.customer, saleDate: sale.saleDate, paymentMethod: sale.paymentMethod, notes: sale.notes });
    setProductSearch("");
    setAddingItem(false);
    setNewItem(null);
    setDetailId(id);
  };

  const detailSale = sales.find(s => s.id === detailId);

  // Auto-open newly created sale when dialog is fresh
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

  const handleAddProduct = () => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return;
    const match = products.find(p => p.name.toLowerCase() === q || p.sku.toLowerCase() === q);
    if (!match) {
      // Free text product not in catalogue
      const item: SaleItem = { ...blankSaleItem(), productName: productSearch.trim() };
      setNewItem(item); setAddingItem(true); setProductSearch("");
      return;
    }
    const item: SaleItem = {
      ...blankSaleItem(),
      productName: match.name, sku: match.sku,
      unit: match.unit || "pcs", unitPrice: match.price || "0.00",
    };
    saveItems([...localItems, item]);
    toast({ title: `${match.name} added` });
    setProductSearch("");
  };

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
    openDetail(sale.id);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => { if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pillColors: Record<string, { base: string; active: string }> = {
    All:       { base: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",               active: "ring-2 ring-gray-400"     },
    Draft:     { base: "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400",                active: "ring-2 ring-gray-400"     },
    Completed: { base: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300", active: "ring-2 ring-emerald-500"  },
    Refunded:  { base: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",         active: "ring-2 ring-amber-400"    },
    Cancelled: { base: "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400",                 active: "ring-2 ring-red-500"      },
  };

  const grandTotal = localItems.reduce((s, i) => s + lineTotal(i), 0);

  // ─────────────────────────────────────────────────────────────────────────────
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
            <Button size="sm" onClick={() => { const s = addSale(blankSale()); openDetail(s.id); }} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
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

      {/* ══ POS Dialog ═══════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailId} onOpenChange={v => { if (!v) closePOS(); }}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col gap-0 p-0" aria-describedby="pos-desc">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <ShoppingCart size={16} className="text-blue-500" />
                {detailSale?.saleNumber}
              </DialogTitle>
              <span className={`text-xs font-medium rounded px-2 py-0.5 ${STATUS_BG[detailSale?.status ?? "Draft"]}`}>
                {detailSale?.status}
              </span>
              <span className="text-xs text-zinc-400 ml-1">
                {detailSale && new Date(detailSale.updatedAt).toLocaleString("en-GB")}
              </span>
            </div>
            <DialogDescription asChild id="pos-desc">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                  Customer:
                  <Combobox
                    value={localMeta?.customer ?? ""}
                    onChange={v => setLocalMeta(m => m ? { ...m, customer: v } : m)}
                    onSelect={opt => { setLocalMeta(m => m ? { ...m, customer: opt.value } : m); saveMeta(); }}
                    options={customerComboOpts}
                    placeholder="Select customer…"
                    className="w-44"
                    inputClassName="border border-zinc-200 dark:border-zinc-600 rounded px-2 py-0.5 text-xs text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800 w-44 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                  Date:
                  <input type="date"
                    value={localMeta?.saleDate ?? ""}
                    onChange={e => setLocalMeta(m => m ? { ...m, saleDate: e.target.value } : m)}
                    onBlur={saveMeta}
                    className="border border-zinc-200 dark:border-zinc-600 rounded px-2 py-0.5 text-xs text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                  Payment:
                  <select
                    value={localMeta?.paymentMethod ?? "Cash"}
                    onChange={e => { setLocalMeta(m => m ? { ...m, paymentMethod: e.target.value as SalePayment } : m); }}
                    onBlur={saveMeta}
                    className="border border-zinc-200 dark:border-zinc-600 rounded px-2 py-0.5 text-xs text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-400">
                    {SALE_PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                  Notes:
                  <input value={localMeta?.notes ?? ""}
                    onChange={e => setLocalMeta(m => m ? { ...m, notes: e.target.value } : m)}
                    onBlur={saveMeta}
                    placeholder="Optional"
                    className="border border-zinc-200 dark:border-zinc-600 rounded px-2 py-0.5 text-xs text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800 w-44 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </label>
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* POS body */}
          <div className="flex-1 overflow-auto px-6 py-4 space-y-4">

            {/* Product search */}
            {detailSale?.status === "Draft" && (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-[9px] h-3.5 w-3.5 text-zinc-400 pointer-events-none z-10" />
                  <Combobox
                    value={productSearch}
                    onChange={v => setProductSearch(v)}
                    onSelect={opt => { setProductSearch(opt.value); setTimeout(handleAddProduct, 0); }}
                    options={productComboOpts}
                    placeholder="Search product by name or SKU → Enter to add…"
                    className="w-full"
                    inputClassName="w-full pl-8 pr-3 py-1.5 border border-zinc-200 dark:border-zinc-600 rounded text-sm bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddProduct(); } }}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={handleAddProduct} className="gap-1">
                  <Plus size={13} /> Add Product
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingItem(true); setNewItem(blankSaleItem()); }} className="gap-1 text-zinc-500">
                  <Plus size={13} /> Custom Item
                </Button>
              </div>
            )}

            {/* Line items table */}
            <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/60">
                    {["#", "Product / Service 🔒", "SKU 🔒", "Qty", "Unit", "Unit Price (£)", "Disc %", "Line Total (£)", ""].map((h, i) => (
                      <th key={i} className={`text-left text-[11px] font-semibold text-zinc-500 py-2 px-3 border border-zinc-200 dark:border-zinc-700 ${i === 0 ? "w-7" : i === 8 ? "w-8" : i === 3 || i === 6 ? "w-20" : i === 4 ? "w-24" : i === 5 || i === 7 ? "w-28 text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {localItems.length === 0 && !addingItem && (
                    <tr><td colSpan={9} className="py-8 text-center text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      {detailSale?.status === "Draft" ? "No items — search a product above to add it" : "No items recorded"}
                    </td></tr>
                  )}
                  {localItems.map((item, idx) => (
                    <tr key={item.id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 ${detailSale?.status !== "Draft" ? "opacity-90" : ""}`}>
                      <td className="py-1.5 px-3 border border-zinc-200 dark:border-zinc-700 text-zinc-400">{idx + 1}</td>
                      {/* productName — locked */}
                      <td className="py-1.5 px-1 border border-zinc-200 dark:border-zinc-700 bg-gray-50/60 dark:bg-gray-800/20">
                        <div className="group/lock flex items-center gap-1 px-2 py-0.5">
                          <span className="flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400 font-medium">{item.productName || "—"}</span>
                          <span className="opacity-0 group-hover/lock:opacity-40 text-[10px] text-zinc-400 whitespace-nowrap">🔒 Products</span>
                        </div>
                      </td>
                      {/* sku — locked */}
                      <td className="py-1.5 px-1 border border-zinc-200 dark:border-zinc-700 bg-gray-50/60 dark:bg-gray-800/20">
                        <div className="group/lock flex items-center px-2 py-0.5">
                          <span className="flex-1 text-xs text-zinc-400 font-mono">{item.sku || "—"}</span>
                        </div>
                      </td>
                      {/* editable fields */}
                      {(["qty", "unit", "unitPrice", "discount", "notes"] as (keyof SaleItem)[]).map(field => (
                        <td key={field} className="py-1 px-1 border border-zinc-200 dark:border-zinc-700">
                          {detailSale?.status === "Draft" ? (
                            <input
                              type={field === "qty" || field === "unitPrice" || field === "discount" ? "number" : "text"}
                              min={0} step={field === "unitPrice" ? "0.01" : field === "discount" ? "1" : "1"}
                              placeholder={field === "qty" ? "1" : field === "unit" ? "pcs" : field === "unitPrice" ? "0.00" : field === "discount" ? "0" : ""}
                              className={`w-full bg-transparent outline-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:bg-white dark:focus:bg-zinc-800 focus:ring-1 focus:ring-blue-400 text-xs ${field === "unitPrice" || field === "discount" ? "text-right" : ""}`}
                              value={String(item[field])}
                              onChange={e => handleItemFieldChange(item.id, field, e.target.value)}
                              onBlur={handleItemBlur}
                            />
                          ) : (
                            <span className={`px-2 text-xs text-zinc-600 dark:text-zinc-400 ${field === "unitPrice" || field === "discount" ? "block text-right" : ""}`}>
                              {field === "unitPrice" ? `£${parseFloat(String(item[field]) || "0").toFixed(2)}` : String(item[field]) || "—"}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="py-1.5 px-3 border border-zinc-200 dark:border-zinc-700 text-right font-mono tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                        £{lineTotal(item).toFixed(2)}
                      </td>
                      <td className="py-1 px-1 border border-zinc-200 dark:border-zinc-700 text-center">
                        {detailSale?.status === "Draft" && (
                          <button onClick={() => handleDeleteItem(item.id)} className="text-zinc-300 hover:text-red-500 transition-colors" title="Remove"><X size={13} /></button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* New custom item form */}
                  {addingItem && newItem && (
                    <tr className="bg-amber-50 dark:bg-amber-900/20">
                      <td className="py-1 px-3 border border-amber-300 dark:border-amber-700 text-zinc-400">{localItems.length + 1}</td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <Combobox autoFocus value={newItem.productName}
                          onChange={v => setNewItem(prev => prev ? { ...prev, productName: v } : prev)}
                          onSelect={opt => {
                            const prod = products.find(p => p.name === opt.value);
                            setNewItem(prev => prev ? { ...prev, productName: opt.value, sku: prod?.sku ?? prev.sku, unit: prod?.unit || prev.unit, unitPrice: prod?.price || prev.unitPrice } : prev);
                          }}
                          options={productComboOpts}
                          placeholder="Product / service name *"
                          className="w-full"
                          inputClassName="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                        />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input placeholder="SKU" className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                          value={newItem.sku} onChange={e => setNewItem(p => p ? { ...p, sku: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input type="number" min="0" placeholder="1" className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                          value={newItem.qty} onChange={e => setNewItem(p => p ? { ...p, qty: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input placeholder="pcs" className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                          value={newItem.unit} onChange={e => setNewItem(p => p ? { ...p, unit: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input type="number" min="0" step="0.01" placeholder="0.00" className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs text-right"
                          value={newItem.unitPrice} onChange={e => setNewItem(p => p ? { ...p, unitPrice: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input type="number" min="0" max="100" placeholder="0" className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs text-right"
                          value={newItem.discount} onChange={e => setNewItem(p => p ? { ...p, discount: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-3 border border-amber-300 dark:border-amber-700 text-right font-mono tabular-nums text-zinc-400">
                        £{(parseFloat(newItem.qty || "0") * parseFloat(newItem.unitPrice || "0") * (1 - parseFloat(newItem.discount || "0") / 100)).toFixed(2)}
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700 text-center">
                        <button onClick={() => { setNewItem(null); setAddingItem(false); }} className="text-zinc-400 hover:text-zinc-600"><X size={13} /></button>
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Totals footer */}
                {(localItems.length > 0 || addingItem) && (
                  <tfoot>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/60">
                      <td colSpan={6} className="py-1.5 px-3 border border-zinc-200 dark:border-zinc-700 text-right text-[11px] text-zinc-500">Subtotal</td>
                      <td colSpan={2} className="py-1.5 px-3 border border-zinc-200 dark:border-zinc-700 text-right font-mono text-xs text-zinc-600 dark:text-zinc-400">£{subTotal(localItems).toFixed(2)}</td>
                      <td className="border border-zinc-200 dark:border-zinc-700" />
                    </tr>
                    {discountTotal(localItems) > 0 && (
                      <tr className="bg-zinc-50 dark:bg-zinc-800/60">
                        <td colSpan={6} className="py-1 px-3 border border-zinc-200 dark:border-zinc-700 text-right text-[11px] text-amber-600">Discount</td>
                        <td colSpan={2} className="py-1 px-3 border border-zinc-200 dark:border-zinc-700 text-right font-mono text-xs text-amber-600">−£{discountTotal(localItems).toFixed(2)}</td>
                        <td className="border border-zinc-200 dark:border-zinc-700" />
                      </tr>
                    )}
                    <tr className="bg-zinc-100 dark:bg-zinc-800 font-bold">
                      <td colSpan={6} className="py-2 px-3 border border-zinc-200 dark:border-zinc-700 text-right text-sm text-zinc-700 dark:text-zinc-200">Grand Total</td>
                      <td colSpan={2} className="py-2 px-3 border border-zinc-200 dark:border-zinc-700 text-right font-mono text-base text-zinc-800 dark:text-zinc-100">
                        £{(grandTotal + (addingItem && newItem ? parseFloat(newItem.qty || "0") * parseFloat(newItem.unitPrice || "0") * (1 - parseFloat(newItem.discount || "0") / 100) : 0)).toFixed(2)}
                      </td>
                      <td className="border border-zinc-200 dark:border-zinc-700" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* POS footer */}
          <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-3 shrink-0 flex-wrap">
            <p className="text-xs text-zinc-400">
              {localItems.length} item{localItems.length !== 1 ? "s" : ""} · <span className="font-semibold text-zinc-600 dark:text-zinc-300">£{grandTotal.toFixed(2)}</span>
            </p>
            <div className="flex gap-2 flex-wrap">
              {addingItem ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => { setNewItem(null); setAddingItem(false); }}>Cancel</Button>
                  <Button size="sm" onClick={handleCommitNewItem} className="gap-1"><Plus size={13} /> Add to Sale</Button>
                </>
              ) : (
                <>
                  {detailSale?.status === "Draft" && (
                    <>
                      <Button size="sm" variant="outline" onClick={closePOS} className="gap-1"><Save size={13} /> Save Draft</Button>
                      <Button size="sm" onClick={() => { setStatus("Completed"); closePOS(); }} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Check size={13} /> Complete Sale
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus("Cancelled")} className="gap-1 text-red-500 border-red-200 hover:bg-red-50">
                        <Ban size={13} /> Cancel Sale
                      </Button>
                    </>
                  )}
                  {detailSale?.status === "Completed" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setStatus("Refunded")} className="gap-1 text-amber-600 border-amber-200 hover:bg-amber-50">
                        <RotateCcw size={13} /> Refund
                      </Button>
                      <Button size="sm" variant="outline" onClick={closePOS}>Close</Button>
                    </>
                  )}
                  {(detailSale?.status === "Refunded" || detailSale?.status === "Cancelled") && (
                    <Button size="sm" variant="outline" onClick={closePOS}>Close</Button>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
