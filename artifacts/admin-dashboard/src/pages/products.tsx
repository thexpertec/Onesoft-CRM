import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useProducts } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Product, getBrands, getProductCategories, getUnits } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Package, Plus, Search, X, Save, Trash2, Link as LinkIcon, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";
import { ProductImagesDialog } from "@/components/product-images-dialog";
import { getSettingsCurrencySymbol } from "@/lib/currencies";

type EditableField = "name" | "sku" | "brand" | "category" | "unit" | "price" | "status" | "description";

const STATUS_COLORS: Record<string, string> = {
  Active:   "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  Inactive: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Draft:    "bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400",
};

const BLANK = (): Record<EditableField, string> => ({
  name: "", sku: "", brand: "", category: "", unit: "", price: "", status: "Active", description: "",
});

export default function ProductsPage() {
  const { products, addProduct, editProduct, removeProduct } = useProducts();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState<string>("All");
  const [activeCell,     setActiveCell]     = useState<{ id: string; col: number } | null>(null);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const [newRow,         setNewRow]         = useState<Record<EditableField, string> | null>(null);
  const [newRowActive,   setNewRowActive]   = useState<number | null>(null);
  const [imagesDialogId, setImagesDialogId] = useState<string | null>(null);

  // Load reference data from other stores
  const brandOptions    = useMemo(() => getBrands().map(b => b.name), [products]);
  const categoryOptions = useMemo(() => getProductCategories().map(c => c.name), [products]);
  const unitOptions     = useMemo(() => getUnits().map(u => u.symbol ? `${u.name} (${u.symbol})` : u.name), [products]);
  const sym             = useMemo(() => getSettingsCurrencySymbol(), []);

  const COLS: ColDef[] = useMemo(() => [
    { field: "name",        label: "Product Name",  minW: 220, type: "text"                                                                   },
    { field: "sku",         label: "SKU",           minW: 120, type: "text"                                                                   },
    { field: "brand",       label: "Brand",         minW: 150, type: "select", options: brandOptions.length    ? brandOptions    : undefined   },
    { field: "category",    label: "Category",      minW: 160, type: "select", options: categoryOptions.length ? categoryOptions : undefined   },
    { field: "unit",        label: "Unit",          minW: 140, type: "select", options: unitOptions.length     ? unitOptions     : undefined   },
    { field: "price",       label: `Price (${sym})`,minW: 110, type: "text"                                                                   },
    { field: "status",      label: "Status",        minW: 120, type: "select",
      options: ["Active", "Inactive", "Draft"],
      optionColors: STATUS_COLORS,
    },
    { field: "description", label: "Description",   minW: 260, type: "text"                                                                   },
  ], [brandOptions, categoryOptions, unitOptions, sym]);

  const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

  const filtered = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => statusFilter === "All" || p.status === statusFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const prod = products.find(p => p.id === id);
    if (!prod || (prod as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editProduct(id, { [field]: value } as Partial<Product>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [products, editProduct, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(p => p.id)];
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(nc); }
    else { setActiveCell({ id: nid, col: nc }); setNewRowActive(null); }
  }, [filtered, COLS.length]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = [NEW_ROW_ID, ...filtered.map(p => p.id)];
    const ri = rows.indexOf(id);
    const nr = ri + 1;
    if (nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(col); }
    else { setActiveCell({ id: nid, col }); setNewRowActive(null); }
  }, [filtered]);

  const navigateNewRow = (col: number, shift: boolean) => {
    const nc = col + (shift ? -1 : 1);
    if (nc >= COLS.filter(c => c.type !== "readonly").length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow?.name.trim()) { toast({ title: "Product name is required", variant: "destructive" }); setNewRowActive(0); return; }
    addProduct({
      name: newRow.name, sku: newRow.sku, brand: newRow.brand, category: newRow.category,
      unit: newRow.unit, price: newRow.price, status: (newRow.status as Product["status"]) || "Active",
      description: newRow.description,
    });
    toast({ title: "Product added", description: `"${newRow.name}" created.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const prod = products.find(p => p.id === deleteId);
    removeProduct(deleteId);
    toast({ title: "Product deleted", description: `"${prod?.name}" removed.` });
    setDeleteId(null);
  };

  const pills = [
    { label: "Total",    value: products.length,                                     filter: "All",      color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                        activeRing: "ring-gray-400 dark:ring-gray-500"    },
    { label: "Active",   value: products.filter(p => p.status === "Active").length,   filter: "Active",   color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",          activeRing: "ring-emerald-500 dark:ring-emerald-400" },
    { label: "Inactive", value: products.filter(p => p.status === "Inactive").length, filter: "Inactive", color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",                  activeRing: "ring-amber-400 dark:ring-amber-500"  },
    { label: "Draft",    value: products.filter(p => p.status === "Draft").length,    filter: "Draft",    color: "bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400",                       activeRing: "ring-gray-300 dark:ring-gray-600"    },
  ];

  const hasRefData = brandOptions.length === 0 || categoryOptions.length === 0 || unitOptions.length === 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Enter to save · Esc to cancel</p>
        </div>
        {isAuthenticated && (
          <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5" data-testid="btn-add-product">
            <Plus size={14} /> Add Product
          </Button>
        )}
      </div>

      {/* Ref data hint */}
      {hasRefData && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 text-[12px] text-blue-700 dark:text-blue-300">
          <LinkIcon size={13} className="flex-shrink-0" />
          <span>
            Set up{" "}
            {brandOptions.length === 0 && <button onClick={() => navigate("/brands")} className="font-semibold underline hover:no-underline">Brands</button>}
            {brandOptions.length === 0 && (categoryOptions.length === 0 || unitOptions.length === 0) && ", "}
            {categoryOptions.length === 0 && <button onClick={() => navigate("/categories")} className="font-semibold underline hover:no-underline">Categories</button>}
            {categoryOptions.length === 0 && unitOptions.length === 0 && " and "}
            {unitOptions.length === 0 && <button onClick={() => navigate("/units")} className="font-semibold underline hover:no-underline">Units</button>}
            {" "}first to enable dropdown selection in Brand, Category, and Unit columns.
          </span>
        </div>
      )}

      {/* KPI pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {pills.map(k => {
          const isActive = statusFilter === k.filter;
          return (
            <button key={k.label} aria-pressed={isActive}
              onClick={() => setStatusFilter(prev => prev === k.filter && k.filter !== "All" ? "All" : k.filter)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] hover:shadow-sm ${k.color} ${isActive ? `ring-2 ring-offset-1 ${k.activeRing} shadow-sm font-bold` : "ring-0 opacity-80 hover:opacity-100"}`}
              title={isActive && k.filter !== "All" ? "Click to clear filter" : `Filter by ${k.label}`}>
              {k.label}: <span>{k.value}</span>
              {isActive && k.filter !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search products or SKU..." className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {products.length}</div>
      </div>

      {/* Excel grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* New row */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: `${CELL_H}px` }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field as EditableField] ?? "";
                return (
                  <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`} style={{ height: `${CELL_H}px` }}>
                    {isA && c.type === "select" ? (
                      <select autoFocus value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground">
                        <option value="">— none —</option>
                        {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : isA ? (
                      <input autoFocus type="text" value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                        <span className={`truncate ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px` }}>
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
              {search || statusFilter !== "All"
                ? "No products match your current filter."
                : <span>No products yet. Click <strong>Add Product</strong> to get started.</span>}
            </td></tr>
          ) : filtered.map((prod, ri) => {
            const isRowActive = activeCell?.id === prod.id;
            return (
              <tr key={prod.id} data-testid={`row-product-${prod.id}`}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === prod.id && activeCell.col === ci;
                  const rawVal = String((prod as unknown as Record<string, string>)[c.field] ?? "");
                  return (
                    <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : isAuthenticated ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && isAuthenticated && setActiveCell({ id: prod.id, col: ci })}>
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={isAuthenticated}
                        onActivate={() => setActiveCell({ id: prod.id, col: ci })}
                        onCommit={v => commitCell(prod.id, c.field as EditableField, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={s => navigateCell(prod.id, ci, s)}
                        onEnter={() => moveCellDown(prod.id, ci)}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px`, width: 70 }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 h-full px-1">
                    {/* Thumbnail indicator — always visible */}
                    {prod.thumbnail ? (
                      <img src={prod.thumbnail} alt="" title="Has thumbnail"
                        className="w-5 h-5 rounded object-cover border border-zinc-200 dark:border-zinc-600 flex-shrink-0 cursor-pointer hover:opacity-80"
                        onClick={() => isAuthenticated && setImagesDialogId(prod.id)} />
                    ) : (prod.images?.length ?? 0) > 0 ? (
                      <span className="text-[9px] font-bold bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 rounded px-1 flex-shrink-0 leading-4">{prod.images!.length}img</span>
                    ) : null}
                    {/* Action buttons — visible on row hover */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isAuthenticated && (
                        <button className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors" title="Manage images"
                          onClick={() => setImagesDialogId(prod.id)}>
                          <Camera size={13} />
                        </button>
                      )}
                      {isAuthenticated && (
                        <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete"
                          onClick={() => setDeleteId(prod.id)} data-testid={`btn-delete-product-${prod.id}`}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Add row */}
          {isAuthenticated && !newRow && (
            <tr><td colSpan={COLS.length + 2}>
              <button onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                data-testid="btn-add-row">
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
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the product and cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete-product">Delete Product</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Images dialog */}
      {imagesDialogId && (() => {
        const prod = products.find(p => p.id === imagesDialogId);
        if (!prod) return null;
        return (
          <ProductImagesDialog
            key={imagesDialogId}
            product={prod}
            open={true}
            onClose={() => setImagesDialogId(null)}
            onSave={(thumbnail, images) => {
              editProduct(imagesDialogId, { thumbnail, images });
              toast({ title: "Images saved", description: `Images updated for "${prod.name}".` });
            }}
          />
        );
      })()}
    </div>
  );
}
