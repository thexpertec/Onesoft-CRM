import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePurchaseOrders } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, getSuppliers, getProducts, getRawMaterials, receivePurchaseOrder } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Plus, Search, X, Save, Trash2, Eye, Package, ReceiptText, Truck, AlertCircle, FileDown } from "lucide-react";
import { downloadExcel } from "@/lib/export-excel";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";
import { Combobox, ComboOption } from "@/components/combobox";
import { getSettingsCurrencySymbol } from "@/lib/currencies";

// ─── Status styles ────────────────────────────────────────────────────────────
const STATUS_OPTS: PurchaseOrderStatus[] = ["Draft", "Sent", "Confirmed", "Received", "Cancelled"];
const STATUS_BG: Record<PurchaseOrderStatus, string> = {
  Draft:     "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
  Sent:      "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  Confirmed: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  Received:  "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  Cancelled: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
};

type HeaderField = "supplier" | "orderDate" | "deliveryDate" | "status" | "notes";
type NewRowState = Record<HeaderField, string>;

const blankNewRow = (): NewRowState => ({
  supplier: "", orderDate: new Date().toISOString().slice(0, 10),
  deliveryDate: "", status: "Draft", notes: "",
});

// ─── Line item helpers ────────────────────────────────────────────────────────
type PurchaseOrderItem2 = PurchaseOrderItem;

const blankItem = (type: "product" | "raw-material" = "product"): PurchaseOrderItem2 => ({
  id: crypto.randomUUID(), itemType: type, productName: "", productId: undefined, rmId: undefined, qty: "1", unit: "", unitPrice: "", notes: "",
});

function lineTotal(item: PurchaseOrderItem2): number {
  return parseFloat(item.qty || "0") * parseFloat(item.unitPrice || "0");
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const { purchaseOrders, addPurchaseOrder, editPurchaseOrder, removePurchaseOrder } = usePurchaseOrders();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // ── supplier / product options ──
  const supplierComboOpts   = useMemo<ComboOption[]>(() => getSuppliers().filter(s => s.status !== "Blacklisted").map(s => ({ value: s.company, label: s.company, sub: s.contactPerson })), []);
  const productComboOpts    = useMemo<ComboOption[]>(() => getProducts().map(p => ({ value: p.name, label: p.name, sub: p.sku, tag: p.category })), []);
  const rawMatComboOpts     = useMemo<ComboOption[]>(() => getRawMaterials().map(r => ({ value: r.name, label: r.name, sub: `${r.rmCode} · Stock: ${r.currentStock} ${r.unit}`, tag: "Raw Material" })), []);
  const noSuppliers = supplierComboOpts.length === 0;
  const sym = useMemo(() => getSettingsCurrencySymbol(), []);

  // ── COLS (inside component to pick up dynamic supplier options) ──
  const COLS: ColDef[] = useMemo(() => [
    { field: "poNumber",     label: "PO Number",         minW: 145, type: "readonly" },
    { field: "supplier",     label: "Supplier",          minW: 200, type: "text"     },
    { field: "orderDate",    label: "Order Date",        minW: 130, type: "date"     },
    { field: "deliveryDate", label: "Expected Delivery", minW: 140, type: "date"     },
    { field: "status",       label: "Status",            minW: 130, type: "select",  options: STATUS_OPTS as unknown as string[] },
    { field: "itemCount",    label: "Items",             minW: 65,  type: "readonly" },
    { field: "total",        label: `Total (${sym})`,   minW: 115, type: "readonly" },
    { field: "notes",        label: "Notes",             minW: 240, type: "text"     },
  ], [sym]);
  const TOTAL_W = useMemo(() => COLS.reduce((a, c) => a + c.minW, 0), [COLS]);

  // ── grid state ──
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [search, setSearch]             = useState("");
  const [activeCell, setActiveCell]     = useState<{ id: string; col: number } | null>(null);
  const [newRow, setNewRow]             = useState<NewRowState | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // ── detail dialog state ──
  const [detailPoId, setDetailPoId]   = useState<string | null>(null);
  const [localItems, setLocalItems]   = useState<PurchaseOrderItem2[]>([]);
  const [addingItem, setAddingItem]   = useState(false);
  const [newItem, setNewItem]         = useState<PurchaseOrderItem2 | null>(null);
  const [newItemType, setNewItemType] = useState<"product" | "raw-material">("product");

  // Sync localItems when dialog opens / PO changes
  useEffect(() => {
    if (detailPoId) {
      const po = purchaseOrders.find(p => p.id === detailPoId);
      setLocalItems(po ? [...po.items] : []);
      setAddingItem(false);
      setNewItem(null);
    }
  }, [detailPoId, purchaseOrders]);

  const detailPo = purchaseOrders.find(p => p.id === detailPoId);

  // ── close detail on outside click ──
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── filtered rows ──
  const filtered = useMemo(() => {
    let rows = [...purchaseOrders];
    if (statusFilter !== "All") rows = rows.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(p =>
        p.poNumber.toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q),
      );
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [purchaseOrders, statusFilter, search]);

  // ── counts for pills ──
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: purchaseOrders.length };
    STATUS_OPTS.forEach(s => { c[s] = purchaseOrders.filter(p => p.status === s).length; });
    return c;
  }, [purchaseOrders]);

  // ── cell value for a given PO row ──
  const cellValue = (po: PurchaseOrder, field: string): string => {
    if (field === "itemCount") return String(po.items.length);
    if (field === "total") return po.items.reduce((s, i) => s + lineTotal(i), 0).toFixed(2);
    return String((po as unknown as Record<string, string>)[field] ?? "");
  };

  // ── commit existing cell ──
  const commitCell = useCallback((id: string, field: string, value: string) => {
    const po = purchaseOrders.find(p => p.id === id);
    if (!po || (po as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editPurchaseOrder(id, { [field]: value } as Partial<PurchaseOrder>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [purchaseOrders, editPurchaseOrder, toast]);

  // ── tab navigation for existing rows ──
  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = newRow ? [NEW_ROW_ID, ...filtered.map(p => p.id)] : filtered.map(p => p.id);
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(nc); }
    else setActiveCell({ id: nid, col: nc });
  }, [filtered, newRow, COLS]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = filtered.map(p => p.id);
    const ri = rows.indexOf(id);
    const nr = ri + 1;
    if (nr >= rows.length) { setActiveCell(null); return; }
    setActiveCell({ id: rows[nr], col });
  }, [filtered]);

  // ── new row helpers ──
  const navigateNewRow = (col: number, shift: boolean) => {
    const editableCols = COLS.filter(c => c.type !== "readonly");
    const nc = col + (shift ? -1 : 1);
    if (nc >= editableCols.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow) return;
    if (!newRow.supplier.trim()) {
      toast({ title: "Supplier is required", variant: "destructive" });
      setNewRowActive(1);
      return;
    }
    if (supplierComboOpts.length > 0) {
      const match = supplierComboOpts.find(s => s.value.toLowerCase() === newRow.supplier.trim().toLowerCase());
      if (!match) {
        toast({ title: "Unknown supplier", description: "Select a supplier from the list, or add one in the Suppliers section first.", variant: "destructive" });
        setNewRowActive(1);
        return;
      }
    }
    const created = addPurchaseOrder({ ...newRow, items: [], status: newRow.status as PurchaseOrderStatus });
    toast({ title: "Purchase order created", description: `${created.poNumber} — ${created.supplier}` });
    setNewRow(null); setNewRowActive(null);
  };

  // ── delete ──
  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    const po = purchaseOrders.find(p => p.id === deleteId);
    removePurchaseOrder(deleteId);
    setDeleteId(null);
    toast({ title: "Purchase order deleted", description: po ? `${po.poNumber} removed` : undefined });
  }, [deleteId, purchaseOrders, removePurchaseOrder, toast]);

  // ── line item helpers ──────────────────────────────────────────────────────
  const saveItems = useCallback((items: PurchaseOrderItem2[]) => {
    if (!detailPoId) return;
    editPurchaseOrder(detailPoId, { items });
    setLocalItems(items);
  }, [detailPoId, editPurchaseOrder]);

  const handleItemFieldChange = (itemId: string, field: keyof PurchaseOrderItem2, value: string) => {
    setLocalItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
  };
  const handleItemBlur = () => { if (detailPoId) saveItems(localItems); };

  const handleDeleteItem = (itemId: string) => saveItems(localItems.filter(i => i.id !== itemId));

  const handleCommitNewItem = () => {
    if (!newItem?.productName.trim()) {
      toast({ title: newItemType === "raw-material" ? "Raw material name is required" : "Product/service name is required", variant: "destructive" });
      return;
    }
    saveItems([...localItems, { ...newItem, itemType: newItemType }]);
    setNewItem(null); setAddingItem(false);
  };

  const handleReceiveOrder = () => {
    if (!detailPoId) return;
    try {
      receivePurchaseOrder(detailPoId);
      toast({ title: "Order received — stock updated", description: "Raw material quantities and product stock have been updated." });
      setDetailPoId(null);
    } catch (e: unknown) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const grandTotal = localItems.reduce((s, i) => s + lineTotal(i), 0);

  // ── render ────────────────────────────────────────────────────────────────
  const pillColors: Record<string, { base: string; active: string }> = {
    All:       { base: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",           active: "ring-2 ring-gray-400"     },
    Draft:     { base: "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400",            active: "ring-2 ring-gray-500"     },
    Sent:      { base: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",         active: "ring-2 ring-blue-500"     },
    Confirmed: { base: "bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300", active: "ring-2 ring-violet-500"   },
    Received:  { base: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300", active: "ring-2 ring-emerald-500" },
    Cancelled: { base: "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400",             active: "ring-2 ring-red-500"      },
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart size={22} className="text-zinc-500" /> Purchase Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Click <Eye size={11} className="inline" /> to manage line items</p>
        </div>
        {isAuthenticated && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              downloadExcel("Purchase_Orders", "Purchase Orders", filtered, [
                { header: "#",             key: "id",           getValue: r => filtered.indexOf(r) + 1, width: 5 },
                { header: "PO Number",     key: "poNumber",     width: 18 },
                { header: "Supplier",      key: "supplier",     width: 24 },
                { header: "Order Date",    key: "orderDate",    getValue: r => r.orderDate?.slice(0, 10) ?? "", width: 14 },
                { header: "Delivery Date", key: "deliveryDate", getValue: r => r.deliveryDate?.slice(0, 10) ?? "", width: 16 },
                { header: "Status",        key: "status",       width: 14 },
                { header: "Items",         key: "items",        getValue: r => r.items.length, width: 8 },
                { header: "Total (£)",     key: "items",        getValue: r => r.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0).toFixed(2), width: 14 },
                { header: "Notes",         key: "notes",        width: 40 },
              ]);
            }} className="gap-1.5">
              <FileDown size={13} /> Export Excel
            </Button>
            <Button
              size="sm"
              onClick={() => { if (noSuppliers) { navigate("/suppliers"); return; } setNewRow(blankNewRow()); setNewRowActive(0); }}
              className="gap-1.5"
              disabled={!!newRow}
              title={noSuppliers ? "Add suppliers first before creating a purchase order" : undefined}
              data-testid="btn-new-po"
            >
              {noSuppliers ? <Truck size={14} /> : <Plus size={14} />}
              {noSuppliers ? "Add Suppliers First" : "New PO"}
            </Button>
          </div>
        )}
      </div>

      {/* No-suppliers notice */}
      {noSuppliers && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">No suppliers found</p>
            <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-0.5">
              Suppliers can only be created from the Suppliers page. Add your suppliers there first, then select them here when creating purchase orders.
            </p>
          </div>
          <button
            onClick={() => navigate("/suppliers")}
            className="shrink-0 flex items-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-800/60 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Truck size={13} /> Go to Suppliers
          </button>
        </div>
      )}

      {/* KPI pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {["All", ...STATUS_OPTS].map(s => {
          const isActive = statusFilter === s;
          const colors = pillColors[s] ?? pillColors["All"];
          return (
            <button key={s} aria-pressed={isActive}
              onClick={() => setStatusFilter(prev => prev === s && s !== "All" ? "All" : s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] ${colors.base} ${isActive ? `${colors.active} ring-offset-1 shadow-sm font-bold` : "ring-0 opacity-80 hover:opacity-100"}`}>
              {s}: <span>{counts[s] ?? 0}</span>
              {isActive && s !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search PO#, supplier…" className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved order</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {purchaseOrders.length}</div>
      </div>


      {/* Excel grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W} tableId="purchases">

          {/* ── New row ── */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: CELL_H }}>★</td>
              {COLS.map((c, ci) => {
                const editableCols = COLS.filter(col => col.type !== "readonly");
                const editableIdx  = editableCols.findIndex(col => col.field === c.field);
                const isA = newRowActive === editableIdx && editableIdx !== -1;
                if (c.type === "readonly") {
                  return (
                    <td key={c.field} className="border-r border-gray-100 dark:border-border relative p-0" style={{ height: CELL_H }}>
                      <div className="w-full h-full flex items-center px-3 text-[12px] text-muted-foreground">
                        {c.field === "poNumber" ? <span className="italic text-gray-400">Auto</span> : "—"}
                      </div>
                    </td>
                  );
                }
                const val = newRow[c.field as HeaderField] ?? "";
                return (
                  <td key={c.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                    style={{ height: CELL_H }}>
                    {isA && c.type === "select" ? (
                      <select autoFocus value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(editableIdx, e.shiftKey); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground">
                        <option value="">— Select supplier —</option>
                        {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : isA && c.type === "date" ? (
                      <input autoFocus type="date" value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(editableIdx, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); navigateNewRow(editableIdx, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground" />
                    ) : isA && c.field === "supplier" ? (
                      <div className="absolute inset-0 flex items-center">
                        {noSuppliers ? (
                          <div className="absolute inset-0 flex items-center px-3 gap-2">
                            <AlertCircle size={12} className="text-amber-400 shrink-0" />
                            <button onClick={() => navigate("/suppliers")} className="text-[12px] text-amber-600 hover:underline truncate">
                              Add suppliers in Suppliers page first
                            </button>
                          </div>
                        ) : (
                          <Combobox autoFocus value={val}
                            onChange={v => setNewRow(r => r ? { ...r, [c.field]: v } : r)}
                            onSelect={opt => setNewRow(r => r ? { ...r, supplier: opt.value } : r)}
                            options={supplierComboOpts}
                            placeholder="Select supplier from list…"
                            className="w-full h-full"
                            inputClassName="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300"
                            onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(editableIdx, e.shiftKey); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                          />
                        )}
                      </div>
                    ) : isA ? (
                      <input autoFocus type="text" value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(editableIdx, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); navigateNewRow(editableIdx, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(editableIdx)}>
                        {c.field === "status" && val ? (
                          <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${STATUS_BG[val as PurchaseOrderStatus] ?? ""}`}>{val}</span>
                        ) : (
                          <span className={`truncate text-[13px] ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
              {/* Action cell */}
              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: CELL_H }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Save PO"><Save size={13} /></button>
                  <button onClick={() => { setNewRow(null); setNewRowActive(null); }} className="p-1 rounded text-red-400 hover:bg-red-50" title="Cancel"><X size={13} /></button>
                </div>
              </td>
            </tr>
          )}

          {/* ── Existing rows ── */}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
                {search || statusFilter !== "All"
                  ? "No purchase orders match your filter."
                  : (
                    <div className="flex flex-col items-center gap-3">
                      <ReceiptText size={36} strokeWidth={1} className="text-zinc-300" />
                      <p>No purchase orders yet.</p>
                      {isAuthenticated && (
                        <Button size="sm" variant="outline" onClick={() => { setNewRow(blankNewRow()); setNewRowActive(0); }}>
                          <Plus size={13} className="mr-1" /> Create first PO
                        </Button>
                      )}
                    </div>
                  )
                }
              </td>
            </tr>
          ) : filtered.map((po, ri) => {
            const isRowActive = activeCell?.id === po.id;
            return (
              <tr key={po.id}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: CELL_H }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === po.id && activeCell.col === ci;
                  const rawVal = cellValue(po, c.field);
                  const canEdit = c.type !== "readonly" && isAuthenticated;
                  return (
                    <td key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : canEdit ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: CELL_H }}
                      onClick={() => !isA && canEdit && setActiveCell({ id: po.id, col: ci })}>
                      {c.field === "status" && !isA ? (
                        <div className="w-full h-full flex items-center px-3">
                          <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${STATUS_BG[rawVal as PurchaseOrderStatus] ?? ""}`}>{rawVal}</span>
                        </div>
                      ) : c.field === "total" && !isA ? (
                        <div className="w-full h-full flex items-center px-3 font-mono tabular-nums text-[12px]">
                          {parseFloat(rawVal) > 0 ? `${sym}${rawVal}` : "—"}
                        </div>
                      ) : (
                        <EditableCell
                          value={rawVal} col={c} active={isA} canEdit={canEdit}
                          onActivate={() => setActiveCell({ id: po.id, col: ci })}
                          onCommit={v => commitCell(po.id, c.field, v)}
                          onCancel={() => setActiveCell(null)}
                          onTab={s => navigateCell(po.id, ci, s)}
                          onEnter={() => moveCellDown(po.id, ci)}
                          suggestions={c.field === "supplier" ? supplierComboOpts : undefined}
                        />
                      )}
                    </td>
                  );
                })}
                {/* Actions */}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: CELL_H }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors" title="View / Edit Line Items"
                      onClick={() => setDetailPoId(po.id)} data-testid={`btn-view-items-${po.id}`}>
                      <Eye size={13} />
                    </button>
                    {isAuthenticated && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete PO"
                        onClick={() => setDeleteId(po.id)} data-testid={`btn-delete-po-${po.id}`}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* ── Add row button ── */}
          {isAuthenticated && !newRow && (
            <tr><td colSpan={COLS.length + 2}>
              <button onClick={() => { setNewRow(blankNewRow()); setNewRowActive(0); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                data-testid="btn-add-row">
                <Plus size={13} /> Add row
              </button>
            </td></tr>
          )}
        </ExcelGridShell>
      </div>

      {/* ══ Detail Dialog (line items) ══════════════════════════════════════════ */}
      <Dialog open={!!detailPoId} onOpenChange={v => { if (!v) { setDetailPoId(null); setAddingItem(false); setNewItem(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
            <DialogTitle className="flex items-center gap-3 text-base font-semibold">
              <ShoppingCart size={16} className="text-blue-500" />
              {detailPo?.poNumber}
              <span className={`text-xs font-medium rounded px-2 py-0.5 ${STATUS_BG[detailPo?.status ?? "Draft"]}`}>
                {detailPo?.status}
              </span>
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-xs text-zinc-500 flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                <span><strong>Supplier:</strong> {detailPo?.supplier || "—"}</span>
                <span><strong>Order:</strong> {detailPo?.orderDate || "—"}</span>
                <span><strong>Delivery:</strong> {detailPo?.deliveryDate || "—"}</span>
                {detailPo?.notes && <span><strong>Notes:</strong> {detailPo.notes}</span>}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <Package size={14} /> Line Items
              </h3>
              <Button size="sm" variant="outline" onClick={() => { setNewItemType("product"); setAddingItem(true); setNewItem(blankItem("product")); }} disabled={addingItem}>
                <Plus size={13} className="mr-1" /> Add Item
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/60">
                    {["#", "Product / Service", "Qty", "Unit", `Unit Price (${sym})`, "Notes", `Total (${sym})`, ""].map((h, i) => (
                      <th key={i} className={`text-left text-[11px] font-semibold text-zinc-500 py-2 px-3 border border-zinc-200 dark:border-zinc-700 ${i === 0 ? "w-7" : i === 7 ? "w-8" : i === 2 ? "w-20" : i === 3 ? "w-24" : i === 4 ? "w-28" : i === 6 ? "w-24 text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {localItems.length === 0 && !addingItem && (
                    <tr><td colSpan={8} className="py-8 text-center text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      No items yet — click "Add Item" to get started
                    </td></tr>
                  )}
                  {localItems.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="py-1 px-3 border border-zinc-200 dark:border-zinc-700 text-zinc-400">{idx + 1}</td>
                      {(["productName", "qty", "unit", "unitPrice", "notes"] as (keyof PurchaseOrderItem2)[]).map(field => (
                        <td key={field} className={`py-1 px-1 border border-zinc-200 dark:border-zinc-700 ${field === "productName" ? "bg-gray-50/60 dark:bg-gray-800/20" : ""}`}>
                          {field === "productName" ? (
                            <div className="flex items-center gap-1.5 px-2 py-1">
                              <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${item.itemType === "raw-material" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                                {item.itemType === "raw-material" ? "RM" : "Prod"}
                              </span>
                              <span className="flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300">{String(item[field]) || "—"}</span>
                            </div>
                          ) : (
                            <input
                              type={field === "qty" || field === "unitPrice" ? "number" : "text"}
                              min={field === "qty" || field === "unitPrice" ? "0" : undefined}
                              step={field === "qty" || field === "unitPrice" ? "any" : undefined}
                              placeholder={field === "qty" ? "1" : field === "unit" ? "e.g. pcs" : field === "unitPrice" ? "0.00" : ""}
                              className="w-full bg-transparent outline-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:bg-white dark:focus:bg-zinc-800 focus:ring-1 focus:ring-blue-400 text-xs"
                              value={String(item[field])}
                              onChange={e => handleItemFieldChange(item.id, field, e.target.value)}
                              onBlur={handleItemBlur}
                            />
                          )}
                        </td>
                      ))}
                      <td className="py-1 px-3 border border-zinc-200 dark:border-zinc-700 text-right font-mono tabular-nums">
                        {sym}{lineTotal(item).toFixed(2)}
                      </td>
                      <td className="py-1 px-1 border border-zinc-200 dark:border-zinc-700 text-center">
                        <button onClick={() => handleDeleteItem(item.id)} className="text-zinc-300 hover:text-red-500 transition-colors" title="Remove item">
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* New item form row */}
                  {addingItem && newItem && (
                    <tr className="bg-amber-50 dark:bg-amber-900/20">
                      <td className="py-1 px-3 border border-amber-300 dark:border-amber-700 text-zinc-400">{localItems.length + 1}</td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        {/* Type toggle */}
                        <div className="flex gap-1 px-1 pt-1 pb-0.5">
                          {(["product", "raw-material"] as const).map(t => (
                            <button key={t} type="button"
                              onClick={() => { setNewItemType(t); setNewItem(blankItem(t)); }}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${newItemType === t ? (t === "raw-material" ? "bg-amber-500 border-amber-500 text-white" : "bg-blue-500 border-blue-500 text-white") : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-500"}`}>
                              {t === "product" ? "Product" : "Raw Material"}
                            </button>
                          ))}
                        </div>
                        <Combobox autoFocus value={newItem.productName}
                          onChange={v => setNewItem(p => p ? { ...p, productName: v } : p)}
                          onSelect={opt => {
                            if (newItemType === "raw-material") {
                              const rm = getRawMaterials().find(r => r.name === opt.value);
                              setNewItem(prev => prev ? { ...prev, productName: opt.value, rmId: rm?.id, unit: rm?.unit || prev.unit, unitPrice: rm?.costPerUnit || prev.unitPrice } : prev);
                            } else {
                              const prod = getProducts().find(p => p.name === opt.value);
                              setNewItem(prev => prev ? { ...prev, productName: opt.value, productId: prod?.id, unit: prod?.unit || prev.unit, unitPrice: prod?.price || prev.unitPrice } : prev);
                            }
                          }}
                          options={newItemType === "raw-material" ? rawMatComboOpts : productComboOpts}
                          placeholder={newItemType === "raw-material" ? "Select raw material *" : "Product or service name *"}
                          className="w-full"
                          inputClassName="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                        />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input type="number" min="0" step="any" placeholder="1"
                          className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                          value={newItem.qty}
                          onChange={e => setNewItem(p => p ? { ...p, qty: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input placeholder="e.g. kg"
                          className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                          value={newItem.unit}
                          onChange={e => setNewItem(p => p ? { ...p, unit: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input type="number" min="0" step="any" placeholder="0.00"
                          className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                          value={newItem.unitPrice}
                          onChange={e => setNewItem(p => p ? { ...p, unitPrice: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700">
                        <input placeholder="Optional"
                          className="w-full bg-white dark:bg-zinc-800 outline-none px-2 py-1 rounded ring-1 ring-amber-400 text-xs"
                          value={newItem.notes}
                          onChange={e => setNewItem(p => p ? { ...p, notes: e.target.value } : p)} />
                      </td>
                      <td className="py-1 px-3 border border-amber-300 dark:border-amber-700 text-right font-mono tabular-nums text-zinc-400">
                        {sym}{(parseFloat(newItem.qty || "0") * parseFloat(newItem.unitPrice || "0")).toFixed(2)}
                      </td>
                      <td className="py-1 px-1 border border-amber-300 dark:border-amber-700 text-center">
                        <button onClick={() => { setNewItem(null); setAddingItem(false); }} className="text-zinc-400 hover:text-zinc-600"><X size={13} /></button>
                      </td>
                    </tr>
                  )}
                </tbody>

                {(localItems.length > 0 || addingItem) && (
                  <tfoot>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/60 font-semibold">
                      <td colSpan={6} className="py-2 px-3 border border-zinc-200 dark:border-zinc-700 text-right text-[11px] text-zinc-500">Grand Total</td>
                      <td className="py-2 px-3 border border-zinc-200 dark:border-zinc-700 text-right font-mono tabular-nums text-sm">
                        {sym}{(grandTotal + (addingItem && newItem ? parseFloat(newItem.qty || "0") * parseFloat(newItem.unitPrice || "0") : 0)).toFixed(2)}
                      </td>
                      <td className="border border-zinc-200 dark:border-zinc-700" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between shrink-0 gap-3 flex-wrap">
            <p className="text-xs text-zinc-400">{localItems.length} item{localItems.length !== 1 ? "s" : ""} · Changes saved automatically</p>
            {addingItem ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setNewItem(null); setAddingItem(false); }}>Cancel</Button>
                <Button size="sm" onClick={handleCommitNewItem}><Plus size={13} className="mr-1" /> Add to PO</Button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {detailPo && detailPo.status !== "Received" && detailPo.status !== "Cancelled" && localItems.length > 0 && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    onClick={handleReceiveOrder}>
                    <Truck size={13} /> Mark as Received — Update Stock
                  </Button>
                )}
                {detailPo?.status === "Received" && (
                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                    Received — Stock Updated
                  </span>
                )}
                <Button size="sm" variant="outline" onClick={() => setDetailPoId(null)}>Close</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => { const po = purchaseOrders.find(p => p.id === deleteId); return po ? `${po.poNumber} — ${po.supplier}` : ""; })()}
              {" "}will be permanently removed, including all line items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
