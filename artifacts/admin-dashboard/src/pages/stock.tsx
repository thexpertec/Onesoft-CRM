import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useStock } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { StockItem, StockType, STOCK_TYPES, getProducts, getCustomers, getEntityLedger, StockLedgerEntry, LEDGER_TX_LABELS } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Boxes, Lock, Plus, Search, X, Save, Trash2, AlertTriangle, FileDown, History } from "lucide-react";
import { downloadExcel } from "@/lib/export-excel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_BG } from "@/components/editable-cell";
import { Combobox, ComboOption } from "@/components/combobox";

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_BG: Record<StockType, string> = {
  "For Sale":       "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "Not For Sale":   "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  "Business Asset": "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
};
const TYPE_RING: Record<StockType, string> = {
  "For Sale":       "ring-emerald-500",
  "Not For Sale":   "ring-amber-400",
  "Business Asset": "ring-blue-500",
};

const STORES_LIST  = ["Main Store", "Warehouse A", "Warehouse B", "Workshop", "Showroom", "Office", "Retail Floor"];
const UNITS_LIST   = ["pcs", "kg", "g", "meters", "cm", "liters", "ml", "boxes", "pallets", "rolls", "pairs", "sets"];

const isLowStock = (item: StockItem) => {
  const qty = parseFloat(item.quantity) || 0;
  const min = parseFloat(item.minLevel) || 0;
  return min > 0 && qty <= min;
};

// Fields that must never be edited directly — quantity only moves via Purchase Orders
const PRODUCT_LOCKED = new Set(["productName", "sku", "quantity"]);

// ─── Column definitions ───────────────────────────────────────────────────────
const ALL_COLS: ColDef[] = [
  { field: "productName",  label: "Product / Service",  minW: 200, type: "text"   },
  { field: "sku",          label: "SKU",                minW: 110, type: "text"   },
  { field: "store",        label: "Store / Location",   minW: 145, type: "text"   },
  { field: "stockType",    label: "Stock Type",         minW: 155, type: "select", options: [...STOCK_TYPES] },
  { field: "quantity",     label: "Qty",                minW: 80,  type: "number" },
  { field: "minLevel",     label: "Min Level",          minW: 90,  type: "number" },
  { field: "unit",         label: "Unit",               minW: 90,  type: "text"   },
  { field: "holdCustomer", label: "Customer Hold",      minW: 160, type: "text"   },
  { field: "notes",        label: "Notes",              minW: 185, type: "text"   },
];

const HOLDS_COLS: ColDef[] = [
  { field: "productName",  label: "Product / Service",  minW: 200, type: "text"   },
  { field: "sku",          label: "SKU",                minW: 110, type: "text"   },
  { field: "store",        label: "Store / Location",   minW: 140, type: "text"   },
  { field: "quantity",     label: "Qty Reserved",       minW: 105, type: "number" },
  { field: "unit",         label: "Unit",               minW: 90,  type: "text"   },
  { field: "holdCustomer", label: "Reserved For",       minW: 180, type: "text"   },
  { field: "holdReason",   label: "Hold Reason",        minW: 210, type: "text"   },
  { field: "notes",        label: "Notes",              minW: 180, type: "text"   },
];

const BLANK = (holdsView: boolean): Record<string, string> => ({
  productName: "", sku: "", store: "",
  stockType: holdsView ? "Not For Sale" : "For Sale",
  quantity: "", minLevel: "", unit: "",
  holdCustomer: "", holdReason: "", notes: "",
});

// ─── Component ────────────────────────────────────────────────────────────────
export default function StockPage() {
  const [location] = useLocation();
  const isHoldsView = location.includes("/holds");
  const COLS = isHoldsView ? HOLDS_COLS : ALL_COLS;
  const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

  const { stock, addItem, editItem, removeItem } = useStock();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const productComboOpts  = useMemo<ComboOption[]>(() => getProducts().map(p => ({ value: p.name, label: p.name, sub: p.sku, tag: p.category })), []);
  const storeComboOpts    = useMemo<ComboOption[]>(() => STORES_LIST.map(s => ({ value: s, label: s })), []);
  const unitComboOpts     = useMemo<ComboOption[]>(() => UNITS_LIST.map(u => ({ value: u, label: u })), []);
  const customerComboOpts = useMemo<ComboOption[]>(() => getCustomers().map(c => ({ value: c.name, label: c.name, sub: c.email || c.phone })), []);

  const [typeFilter,     setTypeFilter]     = useState<string>("All");
  const [customerFilter, setCustomerFilter] = useState<string>("All");
  const [search,         setSearch]         = useState("");
  const [activeCell,     setActiveCell]     = useState<{ id: string; col: number } | null>(null);
  const [newRow,         setNewRow]         = useState<Record<string, string> | null>(null);
  const [newRowActive,   setNewRowActive]   = useState<number | null>(null);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const [historyItemId,  setHistoryItemId]  = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Reset filters when switching views
  useEffect(() => { setTypeFilter("All"); setCustomerFilter("All"); setSearch(""); setActiveCell(null); }, [isHoldsView]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── unique customers with holds for filter pills ──
  const holdCustomers = useMemo(() => {
    const notForSale = stock.filter(s => s.stockType === "Not For Sale" && s.holdCustomer.trim());
    return [...new Set(notForSale.map(s => s.holdCustomer))].sort();
  }, [stock]);

  // ── filtered rows ──
  const filtered = useMemo(() => {
    let rows = isHoldsView ? stock.filter(s => s.stockType === "Not For Sale") : [...stock];
    if (!isHoldsView && typeFilter !== "All") {
      if (typeFilter === "Low Stock") rows = rows.filter(isLowStock);
      else rows = rows.filter(s => s.stockType === typeFilter);
    }
    if (isHoldsView && customerFilter !== "All") rows = rows.filter(s => s.holdCustomer === customerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        s.productName.toLowerCase().includes(q) ||
        s.sku.toLowerCase().includes(q) ||
        s.store.toLowerCase().includes(q) ||
        s.holdCustomer.toLowerCase().includes(q),
      );
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [stock, isHoldsView, typeFilter, customerFilter, search]);

  // ── counts ──
  const counts = useMemo(() => ({
    all: stock.length,
    forSale: stock.filter(s => s.stockType === "For Sale").length,
    notForSale: stock.filter(s => s.stockType === "Not For Sale").length,
    businessAsset: stock.filter(s => s.stockType === "Business Asset").length,
    lowStock: stock.filter(isLowStock).length,
    holds: stock.filter(s => s.stockType === "Not For Sale").length,
  }), [stock]);


  // ── cell commit ──
  const commitCell = useCallback((id: string, field: string, value: string) => {
    const s = stock.find(x => x.id === id);
    if (!s || (s as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editItem(id, { [field]: value } as Partial<StockItem>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [stock, editItem, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rowIds = filtered.map(s => s.id);
    const ri = rowIds.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rowIds.length) { setActiveCell(null); return; }
    setActiveCell({ id: rowIds[nr], col: nc });
  }, [filtered, COLS.length]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rowIds = filtered.map(s => s.id);
    const ri = rowIds.indexOf(id);
    if (ri + 1 >= rowIds.length) { setActiveCell(null); return; }
    setActiveCell({ id: rowIds[ri + 1], col });
  }, [filtered]);

  // stockType col index — Tab skips it so number inputs get clean focus
  const stockTypeColIdx = COLS.findIndex(c => c.field === "stockType");

  const navigateNewRow = (col: number, shift: boolean) => {
    let nc = col + (shift ? -1 : 1);
    // Skip the stockType cell (user clicks it directly to change)
    if (nc === stockTypeColIdx) nc += (shift ? -1 : 1);
    if (nc >= COLS.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow?.productName.trim()) { toast({ title: "Product name is required", variant: "destructive" }); setNewRowActive(0); return; }
    addItem({
      productName: newRow.productName, sku: newRow.sku,
      store: newRow.store, stockType: newRow.stockType as StockType,
      quantity: newRow.quantity || "0", minLevel: newRow.minLevel || "0",
      unit: newRow.unit, holdCustomer: newRow.holdCustomer,
      holdReason: newRow.holdReason, notes: newRow.notes,
    });
    toast({ title: "Stock item added", description: `"${newRow.productName}" added.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const s = stock.find(x => x.id === deleteId);
    removeItem(deleteId);
    toast({ title: "Stock item removed", description: `"${s?.productName}" removed.` });
    setDeleteId(null);
  };


  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {isHoldsView ? <><Lock size={22} className="text-amber-500" /> Stock Holds</> : <><Boxes size={22} className="text-zinc-500" /> Stock Tracking</>}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isHoldsView
              ? "Reserved stock (Not For Sale) · Click any cell to edit · Hover row to delete"
              : "Monitor quantities, stock levels, and store locations · Click any cell to edit"}
          </p>
        </div>
        {can("Edit Stock") && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              downloadExcel(
                isHoldsView ? "Stock_Holds" : "Stock",
                isHoldsView ? "Stock Holds" : "Stock",
                filtered,
                [
                  { header: "#",              key: "id",           getValue: r => filtered.indexOf(r) + 1, width: 5 },
                  { header: "Product",        key: "productName",  width: 28 },
                  { header: "SKU",            key: "sku",          width: 18 },
                  { header: "Stock Type",     key: "stockType",    width: 18 },
                  { header: "Quantity",       key: "quantity",     width: 12 },
                  { header: "Unit",           key: "unit",         width: 10 },
                  { header: "Min Level",      key: "minLevel",     width: 12 },
                  { header: "Store/Location", key: "store",        width: 20 },
                  { header: "Hold Customer",  key: "holdCustomer", width: 22 },
                  { header: "Hold Reason",    key: "holdReason",   width: 28 },
                  { header: "Notes",          key: "notes",        width: 40 },
                ]
              );
            }} className="gap-1.5">
              <FileDown size={13} /> Export Excel
            </Button>
            <Button size="sm" onClick={() => { setNewRow(BLANK(isHoldsView)); setNewRowActive(0); }} className="gap-1.5" disabled={!!newRow}>
              <Plus size={14} /> {isHoldsView ? "Add Hold" : "Add Stock"}
            </Button>
          </div>
        )}
      </div>

      {/* Holds banner */}
      {isHoldsView && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-3">
          <Lock size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-[13px] text-amber-800 dark:text-amber-300">
            <strong>Stock Holds</strong> are items marked as <em>Not For Sale</em> and reserved for a specific customer. They are excluded from available inventory to prevent accidental re-sale.
          </div>
        </div>
      )}

      {/* Raw Materials info banner */}
      {!isHoldsView && (
        <div className="flex items-center gap-2.5 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span>
            This page tracks <strong>finished products &amp; sellable stock</strong> only.
            Raw material stock (e.g. Wheat, Steel, Fabric) received via Purchase Orders is tracked separately under
            <strong className="ml-1">Manufacturing → Raw Materials</strong>.
          </span>
        </div>
      )}

      {/* KPI pills — All Stock view */}
      {!isHoldsView && (
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: "All Stock",     filter: "All",            color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300", ring: "ring-gray-400",    count: counts.all          },
            { label: "For Sale",      filter: "For Sale",       color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-500", count: counts.forSale     },
            { label: "Not For Sale",  filter: "Not For Sale",   color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300", ring: "ring-amber-400",   count: counts.notForSale  },
            { label: "Business Asset",filter: "Business Asset", color: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300", ring: "ring-blue-500",    count: counts.businessAsset},
            { label: "⚠ Low Stock",   filter: "Low Stock",      color: "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400", ring: "ring-red-500",     count: counts.lowStock     },
          ].map(p => {
            const isActive = typeFilter === p.filter;
            return (
              <button key={p.label} aria-pressed={isActive}
                onClick={() => setTypeFilter(prev => prev === p.filter && p.filter !== "All" ? "All" : p.filter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] ${p.color} ${isActive ? `ring-2 ring-offset-1 ${p.ring} shadow-sm font-bold` : "ring-0 opacity-80 hover:opacity-100"}`}>
                {p.label}: <span>{p.count}</span>
                {isActive && p.filter !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* KPI pills — Holds view */}
      {isHoldsView && (
        <div className="flex items-center gap-2 flex-wrap">
          <button aria-pressed={customerFilter === "All"}
            onClick={() => setCustomerFilter("All")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${customerFilter === "All" ? "ring-2 ring-offset-1 ring-amber-400 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 shadow-sm" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 opacity-80 hover:opacity-100"}`}>
            Total Holds: {counts.holds}
          </button>
          {holdCustomers.length > 0 && (
            <>
              <span className="text-xs text-zinc-400 ml-1">Customer:</span>
              {holdCustomers.map(c => {
                const isA = customerFilter === c;
                const cnt = stock.filter(s => s.stockType === "Not For Sale" && s.holdCustomer === c).length;
                return (
                  <button key={c} aria-pressed={isA}
                    onClick={() => setCustomerFilter(prev => prev === c ? "All" : c)}
                    className={`text-xs font-medium rounded-full px-2.5 py-1 transition-all ${isA ? "bg-amber-600 text-white ring-2 ring-amber-400" : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100"}`}>
                    {c} ({cnt}){isA && " ×"}
                  </button>
                );
              })}
            </>
          )}
          {holdCustomers.length === 0 && counts.holds === 0 && (
            <span className="text-sm text-muted-foreground">No stock holds yet. Add a hold to reserve stock for a customer.</span>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search product, store…" className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {can("Edit Stock") && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved item</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">
          {`${filtered.length} item${filtered.length !== 1 ? "s" : ""}`}
        </div>
      </div>

      {/* Grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W} tableId="stock">

          {/* ── New row ── */}
          {can("Edit Stock") && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: CELL_H }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field] ?? "";
                return (
                  <td key={c.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                    style={{ height: CELL_H }}>
                    {c.field === "quantity" ? (
                      <div className="w-full h-full flex items-center px-3 cursor-default">
                        <span className="text-[13px] text-gray-400 italic">0 — set via PO</span>
                        <span className="ml-auto flex items-center gap-0.5 text-[10px] text-gray-300 pr-1"><Lock size={9} /> PO only</span>
                      </div>
                    ) : isA && c.field === "stockType" ? (
                      <div className="absolute inset-0 flex items-center gap-1 px-2" tabIndex={0} autoFocus
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}>
                        {STOCK_TYPES.map(t => (
                          <button key={t}
                            data-testid={`new-type-opt-${t.replace(/ /g, "-")}`}
                            onClick={() => { setNewRow(r => r ? { ...r, stockType: t } : r); setNewRowActive(ci + 1); }}
                            className={`text-[10px] font-semibold rounded px-2 py-0.5 whitespace-nowrap ${TYPE_BG[t]} ${val === t ? `ring-2 ring-offset-1 ${TYPE_RING[t]}` : "opacity-60 hover:opacity-100"}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    ) : isA && c.type === "number" ? (
                      <input autoFocus type="number" value={val} min={0} step={1} placeholder="0"
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground" />
                    ) : isA && (c.field === "productName" || c.field === "store" || c.field === "unit" || c.field === "holdCustomer") ? (
                      <div className="absolute inset-0 flex items-center">
                        <Combobox autoFocus value={val}
                          onChange={v => setNewRow(r => r ? { ...r, [c.field]: v } : r)}
                          options={c.field === "productName" ? productComboOpts : c.field === "store" ? storeComboOpts : c.field === "unit" ? unitComboOpts : customerComboOpts}
                          placeholder={c.label}
                          className="w-full h-full"
                          inputClassName="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300"
                          onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        />
                      </div>
                    ) : isA ? (
                      <input autoFocus type="text" value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                        {c.field === "stockType" && val ? (
                          <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${TYPE_BG[val as StockType] ?? ""}`}>{val}</span>
                        ) : (
                          <span className={`truncate text-[13px] ${!val || val === "0" ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
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

          {/* ── Existing rows ── */}
          {filtered.length === 0 ? (
            <tr><td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
              {search || (typeFilter !== "All" && !isHoldsView) || (customerFilter !== "All" && isHoldsView)
                ? "No stock items match your filters."
                : isHoldsView
                  ? "No stock holds. Add a hold to reserve stock for a customer."
                  : "No stock items yet. Click Add Stock to begin."}
            </td></tr>
          ) : filtered.map((item, ri) => {
            const low = isLowStock(item);
            const isRowActive = activeCell?.id === item.id;
            return (
              <tr key={item.id}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${low && !isHoldsView ? "bg-red-50/30 dark:bg-red-950/10" : isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: CELL_H }}>
                  {low && !isHoldsView ? <AlertTriangle size={12} className="mx-auto text-red-400" /> : ri + 1}
                </td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === item.id && activeCell.col === ci;
                  const rawVal = String((item as unknown as Record<string, string>)[c.field] ?? "");
                  const isProductLocked = PRODUCT_LOCKED.has(c.field);
                  const canEdit = can("Edit Stock") && !isProductLocked;
                  return (
                    <td key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${
                        isProductLocked
                          ? "bg-gray-50/60 dark:bg-gray-800/20"
                          : isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10"
                          : canEdit ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: CELL_H }}
                      onClick={() => !isProductLocked && !isA && canEdit && setActiveCell({ id: item.id, col: ci })}>

                      {/* product-locked cell — read-only, managed in Products */}
                      {isProductLocked ? (
                        <div className="w-full h-full flex items-center px-3 cursor-default group/lock">
                          <span className="truncate text-[13px] text-gray-500 dark:text-gray-400">{rawVal || "—"}</span>
                          <span className="ml-auto opacity-0 group-hover/lock:opacity-50 transition-opacity text-[10px] text-gray-400 whitespace-nowrap flex items-center gap-0.5 pr-1">
                            <Lock size={9} /> Products
                          </span>
                        </div>

                      /* stockType cell — pill picker when active */
                      ) : c.field === "stockType" ? (
                        isA ? (
                          <div className="absolute inset-0 flex items-center gap-1 px-2 bg-white dark:bg-card z-20">
                            {STOCK_TYPES.map(t => (
                              <button key={t} data-testid={`type-opt-${t.replace(/ /g, "-")}`}
                                onClick={() => commitCell(item.id, "stockType", t)}
                                onKeyDown={e => { if (e.key === "Escape") setActiveCell(null); }}
                                className={`text-[10px] font-semibold rounded px-2 py-0.5 whitespace-nowrap ${TYPE_BG[t]} ${rawVal === t ? `ring-2 ring-offset-1 ${TYPE_RING[t]} opacity-100` : "opacity-60 hover:opacity-100"}`}>
                                {t}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center px-3 cursor-pointer">
                            <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${TYPE_BG[rawVal as StockType] ?? ""}`}>{rawVal}</span>
                          </div>
                        )

                      /* quantity cell — shows ⚠ if low stock */
                      ) : c.field === "quantity" && !isA ? (
                        <div className="w-full h-full flex items-center gap-1.5 px-3 cursor-text">
                          <span className={`text-[13px] font-mono tabular-nums ${low ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-700 dark:text-foreground"}`}>{rawVal || "0"}</span>
                          {low && <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />}
                        </div>

                      /* holdCustomer cell — show lock icon if set */
                      ) : c.field === "holdCustomer" && !isA && rawVal ? (
                        <div className="w-full h-full flex items-center gap-1.5 px-3 cursor-text">
                          <Lock size={11} className="text-amber-500 flex-shrink-0" />
                          <span className="text-[13px] text-amber-700 dark:text-amber-300 truncate font-medium">{rawVal}</span>
                        </div>

                      ) : (
                        <EditableCell
                          value={rawVal} col={c} active={isA} canEdit={canEdit}
                          onActivate={() => setActiveCell({ id: item.id, col: ci })}
                          onCommit={v => commitCell(item.id, c.field, v)}
                          onCancel={() => setActiveCell(null)}
                          onTab={s => navigateCell(item.id, ci, s)}
                          onEnter={() => moveCellDown(item.id, ci)}
                          suggestions={
                            c.field === "productName" ? productComboOpts :
                            c.field === "store"       ? storeComboOpts :
                            c.field === "unit"        ? unitComboOpts :
                            c.field === "holdCustomer"? customerComboOpts :
                            undefined
                          }
                        />
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: CELL_H }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      title="Stock History" onClick={() => setHistoryItemId(item.id)}>
                      <History size={13} />
                    </button>
                    {can("Edit Stock") && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Remove" onClick={() => setDeleteId(item.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Add row button */}
          {can("Edit Stock") && !newRow && (
            <tr><td colSpan={COLS.length + 2}>
              <button onClick={() => { setNewRow(BLANK(isHoldsView)); setNewRowActive(0); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                data-testid="btn-add-stock-row">
                <Plus size={13} /> Add row
              </button>
            </td></tr>
          )}
        </ExcelGridShell>
      </div>

      {/* ── Stock Ledger History Dialog ── */}
      {(() => {
        const historyItem = historyItemId ? stock.find(s => s.id === historyItemId) ?? null : null;
        const entries = historyItemId ? getEntityLedger(historyItemId).slice().reverse() : [];
        const stTotalIn  = entries.filter(e => e.qtyChange > 0).reduce((s, e) => s + e.qtyChange, 0);
        const stTotalOut = entries.filter(e => e.qtyChange < 0).reduce((s, e) => s + Math.abs(e.qtyChange), 0);
        const stNet      = stTotalIn - stTotalOut;
        return (
          <Dialog open={!!historyItemId} onOpenChange={o => { if (!o) setHistoryItemId(null); }}>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 overflow-hidden">
              <DialogHeader className="px-6 py-4 border-b shrink-0 space-y-2">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <History size={16} className="text-blue-600" />
                  Stock History — {historyItem?.productName || "—"}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">({historyItem?.store} · {historyItem?.unit})</span>
                </DialogTitle>
                {entries.length > 0 && (
                  <div className="flex items-center gap-4 text-[12px]">
                    <span><span className="font-bold text-emerald-600">+{stTotalIn}</span> <span className="text-muted-foreground">received in</span></span>
                    <span><span className="font-bold text-red-500">−{stTotalOut}</span> <span className="text-muted-foreground">sold/used out</span></span>
                    <span className={`font-bold ${stNet >= 0 ? "text-blue-600" : "text-red-600"}`}>{stNet >= 0 ? "+" : ""}{stNet} <span className="font-normal text-muted-foreground">net</span></span>
                  </div>
                )}
              </DialogHeader>
              <div className="flex-1 overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground text-sm">No stock movements recorded yet for this item.</div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                      <tr>
                        {["Date", "Type", "Reference", "Change", "Before", "After", "Notes"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => {
                        const isIn = e.qtyChange > 0;
                        return (
                          <tr key={e.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{e.date}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isIn ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                                {LEDGER_TX_LABELS[e.txType]}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-blue-600 dark:text-blue-400">{e.reference || "—"}</td>
                            <td className={`px-3 py-2 font-bold tabular-nums ${isIn ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {isIn ? "+" : ""}{e.qtyChange} {e.unit}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.qtyBefore}</td>
                            <td className="px-3 py-2 tabular-nums font-semibold">{e.qtyAfter}</td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{e.notes || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 border-t-2">
                        <td colSpan={2} className="px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Net Movement</td>
                        <td className="px-3 py-2"></td>
                        <td className={`px-3 py-2 font-bold tabular-nums text-[12px] ${stNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {stNet >= 0 ? "+" : ""}{stNet} {historyItem?.unit}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">{entries[entries.length - 1]?.qtyBefore ?? "—"}</td>
                        <td className="px-3 py-2 font-bold tabular-nums text-[12px]">{entries[0]?.qtyAfter ?? "—"}</td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove stock item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{stock.find(s => s.id === deleteId)?.productName}" will be permanently removed from stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
