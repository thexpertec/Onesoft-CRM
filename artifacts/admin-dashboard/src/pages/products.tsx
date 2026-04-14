import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import { useProducts, useStock } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Product, getBrands, getProductCategories, getUnits } from "@/lib/store";
import { useKeyboardScanner } from "@/hooks/use-keyboard-scanner";
import BarcodeScanner from "@/components/barcode-scanner";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Package, Plus, Search, X, Save, Trash2, Link as LinkIcon, Camera, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronDown, RefreshCw, FileDown, Eye, ShoppingCart, ReceiptText, Boxes, TrendingUp, TrendingDown, Minus, GripVertical, Columns3, ScanLine } from "lucide-react";
import { downloadExcel } from "@/lib/export-excel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";
import { ProductImagesDialog } from "@/components/product-images-dialog";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { getStock, getPurchaseOrders, getInvoices } from "@/lib/store";

const dp = getSettingsDecimalPlaces();

type EditableField = "name" | "localName" | "sku" | "barcode" | "brand" | "category" | "subcategory" | "unit" | "purchasePrice" | "costPrice" | "price" | "wholesalePrice" | "retailProfit" | "wholesaleProfit" | "commissionPct" | "openingStock" | "stockAlertValue" | "status" | "condition" | "description";

const STATUS_COLORS: Record<string, string> = {
  Active:   "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  Inactive: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Draft:    "bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400",
};

const CONDITION_COLORS: Record<string, string> = {
  New:          "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  Used:         "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  Fresh:        "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  Refurbished:  "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  Damaged:      "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
};

const BLANK = (): Record<EditableField, string> => ({
  name: "", localName: "", sku: "", barcode: "", brand: "", category: "", subcategory: "", unit: "",
  purchasePrice: "", costPrice: "", price: "", wholesalePrice: "",
  retailProfit: "", wholesaleProfit: "", commissionPct: "",
  openingStock: "", stockAlertValue: "",
  status: "Active", condition: "", description: "",
});

// ── CSV helpers ─────────────────────────────────────────────────────────────
const CSV_HEADERS: EditableField[] = ["name", "sku", "brand", "category", "unit", "purchasePrice", "costPrice", "price", "wholesalePrice", "status", "condition", "description"];
const CSV_HEADER_LABELS = ["name", "sku", "brand", "category", "unit", "purchasePrice", "costPrice", "retailPrice", "wholesalePrice", "status", "condition", "description"];

function downloadTemplate() {
  const sample = [
    "Onesoft CRM Software", "SKU-001", "Onesoft", "Software", "Licence", "600.00", "750.00", "999.00", "799.00", "Active", "New", "Cloud-based CRM solution",
  ];
  const rows = [CSV_HEADER_LABELS.join(","), sample.map(v => `"${v.replace(/"/g, '""')}"`).join(",")];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "products_import_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

type ImportRow = Record<EditableField, string> & { _rowNum: number; _error?: string; _updateId?: string };

function parseCSV(text: string): ImportRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse a single CSV line respecting quoted fields
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };

  const headerRow = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ""));
  const colMap: Record<EditableField, number> = {} as Record<EditableField, number>;
  CSV_HEADERS.forEach(f => {
    const idx = headerRow.findIndex(h => h === f.toLowerCase());
    colMap[f] = idx;
  });

  return lines.slice(1).map((line, i) => {
    const cells = parseLine(line);
    const row: ImportRow = { _rowNum: i + 2, name: "", sku: "", brand: "", category: "", unit: "", purchasePrice: "", costPrice: "", price: "", wholesalePrice: "", retailProfit: "", wholesaleProfit: "", status: "Active", condition: "", description: "" };
    CSV_HEADERS.forEach(f => {
      const ci = colMap[f];
      row[f] = ci >= 0 && cells[ci] !== undefined ? cells[ci] : "";
    });
    if (!row.name.trim()) row._error = "Name is required";
    const validStatuses = ["Active", "Inactive", "Draft"];
    if (row.status && !validStatuses.includes(row.status)) row.status = "Active";
    const validConditions = ["New", "Used", "Fresh", "Refurbished", "Damaged"];
    if (row.condition && !validConditions.includes(row.condition)) row.condition = "";
    return row;
  });
}

export default function ProductsPage() {
  const { products, addProduct, editProduct, removeProduct, reorderProds } = useProducts();
  const { stock } = useStock();
  const { isAuthenticated } = useAuth();
  const dp = getSettingsDecimalPlaces();

  // Build a map: SKU (lowercased) → total qty across all stock entries
  const stockBySkuMap = useMemo(() => {
    const m: Record<string, number> = {};
    stock.forEach(s => {
      const key = s.sku?.trim().toLowerCase() || s.productName.trim().toLowerCase();
      m[key] = (m[key] || 0) + (parseFloat(s.quantity) || 0);
    });
    return m;
  }, [stock]);

  const getProductStock = (prod: Product): number | null => {
    const bysku  = prod.sku?.trim()  ? stockBySkuMap[prod.sku.trim().toLowerCase()]  : undefined;
    const byname = prod.name?.trim() ? stockBySkuMap[prod.name.trim().toLowerCase()] : undefined;
    const v = bysku ?? byname;
    return v !== undefined ? v : null;
  };

  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState<string>("All");
  const [scannerOpen,    setScannerOpen]    = useState(false);
  const [activeCell,     setActiveCell]     = useState<{ id: string; col: number } | null>(null);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const [newRow,         setNewRow]         = useState<Record<EditableField, string> | null>(null);
  const [newRowActive,   setNewRowActive]   = useState<number | null>(null);
  const [imagesDialogId, setImagesDialogId] = useState<string | null>(null);
  const [viewProdId,    setViewProdId]    = useState<string | null>(null);

  const [showHelp,      setShowHelp]      = useState(false);

  // ── Column visibility ──────────────────────────────────────────────────────
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem("products-hidden-cols") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const colsMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (colsMenuRef.current && !colsMenuRef.current.contains(e.target as Node)) setColsMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggleCol = (field: string) => {
    if (field === "name") return; // always visible
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field); else next.add(field);
      localStorage.setItem("products-hidden-cols", JSON.stringify([...next]));
      return next;
    });
  };

  // ── Import state ──────────────────────────────────────────────────────────
  const [importOpen,     setImportOpen]     = useState(false);
  const [rawImportRows,  setRawImportRows]  = useState<ImportRow[]>([]);
  const [importMode,     setImportMode]     = useState<"insert" | "upsert">("insert");
  const [importing,      setImporting]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── SKU check: "insert" mode flags conflicts; "upsert" mode marks them for update ──
  const enrichWithSkuErrors = useCallback((rows: ImportRow[], mode: "insert" | "upsert"): ImportRow[] => {
    const existingSkuMap = new Map(
      products.filter(p => p.sku.trim()).map(p => [p.sku.trim().toLowerCase(), { name: p.name, id: p.id }])
    );
    const seenInFile = new Map<string, number>();
    return rows.map(r => {
      if (r._error) return r;
      if (!r.sku.trim()) return r;
      const key = r.sku.trim().toLowerCase();
      if (existingSkuMap.has(key)) {
        const existing = existingSkuMap.get(key)!;
        if (mode === "upsert") return { ...r, _updateId: existing.id };
        return { ...r, _error: `SKU "${r.sku}" already used by "${existing.name}"` };
      }
      if (seenInFile.has(key))
        return { ...r, _error: `SKU "${r.sku}" duplicated in this file (first at row ${seenInFile.get(key)})` };
      seenInFile.set(key, r._rowNum);
      return r;
    });
  }, [products]);

  // Derived rows re-evaluated whenever raw rows OR mode changes
  const importRows = useMemo(
    () => enrichWithSkuErrors(rawImportRows, importMode),
    [rawImportRows, importMode, enrichWithSkuErrors]
  );

  const resetImport = () => { setImportOpen(false); setRawImportRows([]); setImportMode("insert"); };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target?.result as string);
      setRawImportRows(rows);
      setImportOpen(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith(".csv")) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target?.result as string);
      setRawImportRows(rows);
      setImportOpen(true);
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    setImporting(true);
    const valid = importRows.filter(r => !r._error);
    let created = 0, updated = 0;
    valid.forEach(r => {
      const payload = {
        name: r.name, sku: r.sku, brand: r.brand, category: r.category,
        unit: r.unit, purchasePrice: r.purchasePrice, costPrice: r.costPrice,
        price: r.price, wholesalePrice: r.wholesalePrice,
        status: (r.status as Product["status"]) || "Active",
        condition: (r.condition as Product["condition"]) || undefined,
        description: r.description,
      };
      if (r._updateId) { editProduct(r._updateId, payload); updated++; }
      else              { addProduct(payload); created++; }
    });
    const skipped = importRows.length - valid.length;
    const parts: string[] = [];
    if (created > 0) parts.push(`${created} created`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    toast({ title: "Import complete", description: parts.join(" · ") });
    resetImport();
    setImporting(false);
  };

  // Load reference data from other stores
  const brandOptions    = useMemo(() => getBrands().map(b => b.name), [products]);
  const categoryOptions = useMemo(() => {
    const cats = getProductCategories();
    return cats.filter(c => !c.parentId).map(c => c.name);
  }, [products]);
  const unitOptions     = useMemo(() => getUnits().map(u => u.symbol ? `${u.name} (${u.symbol})` : u.name), [products]);
  const sym             = useMemo(() => getSettingsCurrencySymbol(), []);

  const COLS: ColDef[] = useMemo(() => [
    { field: "name",        label: "Product Name",       minW: 200, type: "text" },
    { field: "localName",   label: "Local Name",         minW: 160, type: "text" },
    { field: "sku",         label: "SKU",                minW: 110, type: "text" },
    { field: "barcode",     label: "Barcode / QR",       minW: 150, type: "text" },
    { field: "brand",       label: "Brand",              minW: 140, type: "select", options: brandOptions.length    ? brandOptions    : undefined   },
    { field: "category",    label: "Category",           minW: 140, type: "select", options: categoryOptions.length ? categoryOptions : undefined   },
    { field: "unit",          label: "Unit",                 minW: 120, type: "select", options: unitOptions.length ? unitOptions : undefined },
    { field: "purchasePrice",   label: `Purchase (${sym})`,         minW: 120, type: "text"     },
    { field: "costPrice",       label: `Cost (${sym})`,             minW: 110, type: "text"     },
    { field: "price",           label: `Retail Price (${sym})`,     minW: 125, type: "text"     },
    { field: "retailProfit",    label: `Retail Profit (${sym})`,    minW: 125, type: "readonly" },
    { field: "wholesalePrice",  label: `Wholesale (${sym})`,        minW: 120, type: "text"     },
    { field: "wholesaleProfit", label: `Wholesale Profit (${sym})`, minW: 140, type: "readonly" },
    { field: "stock",           label: "Stock",                     minW: 90,  type: "readonly" },
    { field: "status",      label: "Status",             minW: 120, type: "select",
      options: ["Active", "Inactive", "Draft"],
      optionColors: STATUS_COLORS,
    },
    { field: "condition",   label: "Condition",          minW: 130, type: "select",
      options: ["", "New", "Used", "Fresh", "Refurbished", "Damaged"],
      optionColors: CONDITION_COLORS,
    },
    { field: "description", label: "Description",        minW: 220, type: "text"                                                                   },
  ], [brandOptions, categoryOptions, unitOptions, sym]);

  const visibleCols = useMemo(() => COLS.filter(c => !hiddenCols.has(c.field)), [COLS, hiddenCols]);
  const TOTAL_W = visibleCols.reduce((a, c) => a + c.minW, 0);

  const isFiltered = !!(search || statusFilter !== "All");

  const applyStatusFilter = (p: Product): boolean => {
    switch (statusFilter) {
      case "All":          return true;
      case "Active":
      case "Inactive":
      case "Draft":        return p.status === statusFilter;
      case "no-price":     return !p.price || parseFloat(p.price) === 0;
      case "no-cost":      return !p.costPrice || parseFloat(p.costPrice) === 0;
      case "has-wholesale":return !!(p.wholesalePrice && parseFloat(p.wholesalePrice) > 0);
      case "no-category":  return !p.category;
      case "with-images":  return !!(p.images && p.images.length > 0);
      case "no-image":     return !(p.images && p.images.length > 0);
      default:             return true;
    }
  };

  // ── Barcode / QR scan handler (shared by camera scanner + keyboard wedge) ──
  const handleProductScan = useCallback((code: string) => {
    const q = code.toLowerCase();
    const match = products.find(
      p => p.barcode === code || p.sku === code ||
           (p.barcode ?? "").toLowerCase() === q ||
           p.sku.toLowerCase() === q
    );
    setScannerOpen(false);
    if (match) {
      setSearch(match.barcode || match.sku || match.name);
      toast({ title: `Found: ${match.name}`, description: match.barcode ? `Barcode: ${match.barcode}` : `SKU: ${match.sku}` });
    } else {
      // Show the code in search so user can find a partial match
      setSearch(code);
      toast({ title: "No exact match", description: `Showing results for "${code}"`, variant: "destructive" });
    }
  }, [products, toast]);

  // ── Keyboard-wedge scanner (USB / Bluetooth) ─────────────────────────────
  useKeyboardScanner({ onScan: handleProductScan, enabled: true });

  const filtered = products
    .filter(p => !search || [p.name, p.localName, p.sku, p.barcode, p.brand, p.category, p.description, p.status, p.condition, p.purchasePrice, p.costPrice, p.price, p.wholesalePrice].some(v => v?.toLowerCase().includes(search.toLowerCase())))
    .filter(applyStatusFilter);

  // Drag-and-drop reorder state
  const [dragId,    setDragId]    = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (id: string) => { setDragId(id); };
  const handleDragOver  = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  };
  const handleDrop = (dropId: string) => {
    if (!dragId || dragId === dropId) { setDragId(null); setDragOverId(null); return; }
    const ids = filtered.map(p => p.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx   = ids.indexOf(dropId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId);
    reorderProds(ids);
    setDragId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

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
    try {
      editProduct(id, { [field]: value } as Partial<Product>);
      setActiveCell(null);
      toast({ title: "Saved" });
    } catch (err: unknown) {
      toast({ title: "Cannot save", description: err instanceof Error ? err.message : "An error occurred.", variant: "destructive" });
      setActiveCell(null);
    }
  }, [products, editProduct, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(p => p.id)];
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= visibleCols.length) { nc = 0; nr++; }
    if (nc < 0) { nc = visibleCols.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(nc); }
    else { setActiveCell({ id: nid, col: nc }); setNewRowActive(null); }
  }, [filtered, visibleCols.length]);

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
    if (nc >= visibleCols.filter(c => c.type !== "readonly").length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow?.name.trim()) { toast({ title: "Product name is required", variant: "destructive" }); setNewRowActive(0); return; }
    try {
      addProduct({
        name: newRow.name, localName: newRow.localName || undefined,
        sku: newRow.sku, brand: newRow.brand, category: newRow.category,
        unit: newRow.unit, purchasePrice: newRow.purchasePrice, costPrice: newRow.costPrice,
        price: newRow.price, wholesalePrice: newRow.wholesalePrice,
        status: (newRow.status as Product["status"]) || "Active",
        condition: (newRow.condition as Product["condition"]) || undefined,
        description: newRow.description,
      });
      toast({ title: "Product added", description: `"${newRow.name}" created.` });
      setNewRow(null); setNewRowActive(null);
    } catch (err: unknown) {
      toast({ title: "Cannot add product", description: err instanceof Error ? err.message : "An error occurred.", variant: "destructive" });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const prod = products.find(p => p.id === deleteId);
    removeProduct(deleteId);
    toast({ title: "Product deleted", description: `"${prod?.name}" removed.` });
    setDeleteId(null);
  };

  const pills = [
    { label: "Total",         value: products.length,                                                                         filter: "All",           color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                           activeRing: "ring-gray-400 dark:ring-gray-500"        },
    { label: "Active",        value: products.filter(p => p.status === "Active").length,                                      filter: "Active",        color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",             activeRing: "ring-emerald-500 dark:ring-emerald-400"  },
    { label: "Inactive",      value: products.filter(p => p.status === "Inactive").length,                                    filter: "Inactive",      color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",                     activeRing: "ring-amber-400 dark:ring-amber-500"      },
    { label: "Draft",         value: products.filter(p => p.status === "Draft").length,                                       filter: "Draft",         color: "bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400",                        activeRing: "ring-gray-300 dark:ring-gray-600"        },
    { label: "No Price",      value: products.filter(p => !p.price || parseFloat(p.price) === 0).length,                     filter: "no-price",      color: "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300",                        activeRing: "ring-rose-400 dark:ring-rose-500"        },
    { label: "No Cost",       value: products.filter(p => !p.costPrice || parseFloat(p.costPrice) === 0).length,              filter: "no-cost",       color: "bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300",                           activeRing: "ring-red-400 dark:ring-red-500"          },
    { label: "Has Wholesale", value: products.filter(p => !!(p.wholesalePrice && parseFloat(p.wholesalePrice) > 0)).length,  filter: "has-wholesale", color: "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300",                activeRing: "ring-purple-400 dark:ring-purple-500"    },
    { label: "No Category",   value: products.filter(p => !p.category).length,                                               filter: "no-category",   color: "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300",                activeRing: "ring-orange-400 dark:ring-orange-500"    },
    { label: "With Images",   value: products.filter(p => !!(p.images && p.images.length > 0)).length,                       filter: "with-images",   color: "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300",                           activeRing: "ring-sky-400 dark:ring-sky-500"          },
    { label: "No Image",      value: products.filter(p => !(p.images && p.images.length > 0)).length,                        filter: "no-image",      color: "bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400",                    activeRing: "ring-slate-300 dark:ring-slate-600"      },
  ];

  const hasRefData = brandOptions.length === 0 || categoryOptions.length === 0 || unitOptions.length === 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Hidden file input for CSV import */}
      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Enter to save · Esc to cancel</p>
        </div>
        {isAuthenticated && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1.5 h-8 text-[13px]" title="Download CSV template">
              <Download size={13} /> Template
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5 h-8 text-[13px]" data-testid="btn-import-products">
              <Upload size={13} /> Import CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              downloadExcel("Products", "Products", filtered, [
                { header: "#",               key: "id",            getValue: r => filtered.indexOf(r) + 1, width: 5 },
                { header: "Product Name",    key: "name",          width: 32 },
                { header: "Local Name",      key: "localName",     width: 24 },
                { header: "SKU",             key: "sku",           width: 18 },
                { header: "Brand",           key: "brand",         width: 16 },
                { header: "Category",        key: "category",      width: 20 },
                { header: "Unit",            key: "unit",          width: 10 },
                { header: "Purchase Price",     key: "purchasePrice",   width: 16 },
                { header: "Cost Price",        key: "costPrice",       width: 14 },
                { header: "Retail Price",      key: "price",           width: 14 },
                { header: "Retail Profit",     key: "retailProfit",    width: 14, getValue: (r: Product) => {
                    const cost = parseFloat(r.costPrice ?? ""); const retail = parseFloat(r.price ?? "");
                    return (!isNaN(cost) && !isNaN(retail)) ? (retail - cost).toFixed(dp) : "";
                  }
                },
                { header: "Wholesale Price",   key: "wholesalePrice",  width: 16 },
                { header: "Wholesale Profit",  key: "wholesaleProfit", width: 17, getValue: (r: Product) => {
                    const cost = parseFloat(r.costPrice ?? ""); const ws = parseFloat(r.wholesalePrice ?? "");
                    return (!isNaN(cost) && !isNaN(ws)) ? (ws - cost).toFixed(dp) : "";
                  }
                },
                { header: "Status",            key: "status",          width: 12 },
                { header: "Condition",       key: "condition",     width: 14 },
                { header: "Description",     key: "description",   width: 40 },
              ]);
            }} className="gap-1.5 h-8 text-[13px]">
              <FileDown size={13} /> Export Excel
            </Button>

            <Button size="sm"
              onClick={() => navigate("/products/new")}
              className="gap-1.5 h-8 text-[13px]" data-testid="btn-add-product">
              <Plus size={14} /> Add Product
            </Button>
          </div>
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

      {/* Collapsible how-to instructions */}
      <div className="rounded-lg border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHelp(v => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        >
          <span className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
            <FileSpreadsheet size={13} className="text-primary flex-shrink-0" />
            How to add products &amp; import data
          </span>
          <ChevronDown size={14} className={`text-muted-foreground flex-shrink-0 transition-transform duration-200 ${showHelp ? "rotate-180" : ""}`} />
        </button>

        {showHelp && (
          <div className="px-4 py-4 bg-background border-t border-border grid grid-cols-1 md:grid-cols-3 gap-5 text-[12px] text-foreground">

            {/* Column 1 — Adding products */}
            <div className="space-y-2.5">
              <p className="font-semibold text-primary uppercase tracking-wide text-[10px]">Adding Products</p>
              <ol className="space-y-1.5 list-decimal list-inside text-muted-foreground leading-relaxed">
                <li>Click <span className="font-semibold text-foreground">+ Add Product</span> to insert a blank row directly in the table.</li>
                <li>Type into each cell — use <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">Tab</kbd> to move right, <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">Enter</kbd> to save.</li>
                <li>Click any cell on an existing row to edit it inline — changes save immediately.</li>
                <li>Use the <span className="font-semibold text-foreground">Actions</span> column to open the image gallery or delete a row.</li>
              </ol>
              <p className="text-[11px] text-muted-foreground/70 pt-1">Tip: Set up <span className="font-semibold">Brands</span>, <span className="font-semibold">Categories</span> and <span className="font-semibold">Units</span> first so those columns become searchable dropdowns.</p>
            </div>

            {/* Column 2 — CSV import */}
            <div className="space-y-2.5">
              <p className="font-semibold text-primary uppercase tracking-wide text-[10px]">Bulk Import via CSV</p>
              <ol className="space-y-1.5 list-decimal list-inside text-muted-foreground leading-relaxed">
                <li>Click <span className="font-semibold text-foreground">Template</span> to download a ready-made CSV with the correct column headers and a sample row.</li>
                <li>Open the file in Excel, Google Sheets, or any spreadsheet app.</li>
                <li>Fill in your products — one row per product (or per variant).</li>
                <li>Save as <span className="font-semibold text-foreground">.csv</span> and click <span className="font-semibold text-foreground">Import CSV</span> to upload.</li>
                <li>Review the preview — rows with errors are highlighted. Fix and re-import if needed.</li>
              </ol>
              <p className="text-[11px] text-muted-foreground/70 pt-1">
                CSV columns in order: <span className="font-mono">name · sku · brand · category · unit · purchasePrice · costPrice · price · status · description</span>
              </p>
            </div>

            {/* Column 3 — Multiple variants */}
            <div className="space-y-2.5">
              <p className="font-semibold text-primary uppercase tracking-wide text-[10px]">Multiple Variants (Sizes, Colours, etc.)</p>
              <p className="text-muted-foreground leading-relaxed">Each variant is a <span className="font-semibold text-foreground">separate row</span>. Every row must have its own unique SKU — add a suffix to the base code for each variant:</p>
              <div className="rounded bg-muted/60 border border-border divide-y divide-border font-mono text-[10.5px] text-foreground overflow-hidden">
                <div className="grid grid-cols-2 gap-2 px-3 py-1.5 bg-muted/80 text-[9px] font-sans font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Name (one row each)</span><span>SKU</span>
                </div>
                <div className="grid grid-cols-2 gap-2 px-3 py-1.5">
                  <span>T-Shirt Blue – S</span><span className="text-blue-600 dark:text-blue-400">TSH-BLU-S</span>
                </div>
                <div className="grid grid-cols-2 gap-2 px-3 py-1.5">
                  <span>T-Shirt Blue – M</span><span className="text-blue-600 dark:text-blue-400">TSH-BLU-M</span>
                </div>
                <div className="grid grid-cols-2 gap-2 px-3 py-1.5">
                  <span>T-Shirt Blue – L</span><span className="text-blue-600 dark:text-blue-400">TSH-BLU-L</span>
                </div>
              </div>
              <div className="rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-semibold">What is a SKU?</p>
                <p className="leading-relaxed">A <span className="font-semibold">SKU (Stock Keeping Unit)</span> is a short unique code you assign to identify each product or variant. It must be <span className="font-semibold">unique across all rows</span> — no two products can share one. A common format is <span className="font-mono">BRAND-PRODUCT-VARIANT</span> (e.g. <span className="font-mono">TSH-BLU-M</span> = T-Shirt, Blue, Medium).</p>
              </div>
              <p className="text-[11px] text-muted-foreground/70">Keep <span className="font-semibold">Brand</span> and <span className="font-semibold">Category</span> the same across variants — each row has its own purchase, cost, and sale price.</p>
            </div>

          </div>
        )}
      </div>

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
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search products, SKU or barcode…" className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {/* Camera barcode / QR scan button */}
        <button
          onClick={() => setScannerOpen(true)}
          className="h-8 w-8 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-colors shrink-0"
          title="Scan barcode / QR code to find product (or plug in a USB/Bluetooth scanner and scan directly)"
        >
          <ScanLine size={14} />
        </button>

        {/* Columns visibility dropdown */}
        <div className="relative" ref={colsMenuRef}>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={() => setColsMenuOpen(v => !v)}>
            <Columns3 size={13} />
            Columns
            {hiddenCols.size > 0 && (
              <span className="ml-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{hiddenCols.size}</span>
            )}
            <ChevronDown size={11} className={`transition-transform ${colsMenuOpen ? "rotate-180" : ""}`} />
          </Button>
          {colsMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg shadow-lg w-52 py-1 max-h-80 overflow-y-auto">
              <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100 dark:border-border">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Show / Hide Columns</span>
                {hiddenCols.size > 0 && (
                  <button onClick={() => { setHiddenCols(new Set()); localStorage.removeItem("products-hidden-cols"); }}
                    className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">Reset</button>
                )}
              </div>
              {COLS.map(c => {
                const visible = !hiddenCols.has(c.field);
                const locked  = c.field === "name";
                return (
                  <button key={c.field} disabled={locked}
                    onClick={() => toggleCol(c.field)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors
                      ${locked ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50 dark:hover:bg-muted/40 cursor-pointer"}
                      ${visible ? "text-gray-800 dark:text-foreground" : "text-gray-400 dark:text-muted-foreground"}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                      ${visible ? "bg-indigo-500 border-indigo-500 text-white" : "border-gray-300 dark:border-border bg-transparent"}`}>
                      {visible && <CheckCircle2 size={10} className="stroke-[3]" />}
                    </span>
                    <span className="truncate">{c.label}</span>
                  </button>
                );
              })}
            </div>
          )}
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
        <ExcelGridShell cols={visibleCols} totalMinW={TOTAL_W} tableId="products"
          extraLeadingCol={{ width: 28 }}
        >

          {/* New row */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-100 dark:border-border w-7" style={{ height: `${CELL_H}px` }} />
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: `${CELL_H}px` }}>★</td>
              {visibleCols.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field as EditableField] ?? "";
                // Readonly / computed columns (profit) — show "—" in new row
                if (c.type === "readonly") {
                  return (
                    <td key={c.field} className="border-r border-gray-100 dark:border-border relative p-0" style={{ height: `${CELL_H}px` }}>
                      <div className="w-full h-full flex items-center px-3 text-[12px] text-muted-foreground/50 select-none">—</div>
                    </td>
                  );
                }
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
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === visibleCols.length - 1 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
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
            <tr><td colSpan={visibleCols.length + 3} className="text-center py-16 text-muted-foreground text-sm">
              {search || statusFilter !== "All"
                ? "No products match your current filter."
                : <span>No products yet. Click <strong>Add Product</strong> to get started.</span>}
            </td></tr>
          ) : filtered.map((prod, ri) => {
            const isRowActive = activeCell?.id === prod.id;
            const isDragging  = dragId === prod.id;
            const isDragOver  = dragOverId === prod.id;
            return (
              <tr key={prod.id} data-testid={`row-product-${prod.id}`}
                draggable={!isFiltered && isAuthenticated}
                onDragStart={() => handleDragStart(prod.id)}
                onDragOver={e => handleDragOver(e, prod.id)}
                onDrop={() => handleDrop(prod.id)}
                onDragEnd={handleDragEnd}
                className={`border-b border-gray-100 dark:border-border transition-colors group select-none
                  ${isDragging  ? "opacity-40 bg-blue-50 dark:bg-blue-950/20" : ""}
                  ${isDragOver  ? "border-t-2 border-t-blue-500 bg-blue-50/50 dark:bg-blue-950/10" : ""}
                  ${!isDragging && !isDragOver ? (isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10") : ""}
                  hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>

                {/* Drag handle */}
                <td className="border-r border-gray-100 dark:border-border w-7 text-center select-none" style={{ height: `${CELL_H}px` }}>
                  {!isFiltered && isAuthenticated ? (
                    <div className="flex items-center justify-center h-full cursor-grab active:cursor-grabbing text-gray-300 dark:text-zinc-700 group-hover:text-gray-400 dark:group-hover:text-zinc-500 transition-colors">
                      <GripVertical size={13} />
                    </div>
                  ) : null}
                </td>

                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                {visibleCols.map((c, ci) => {
                  const isA = activeCell?.id === prod.id && activeCell.col === ci;
                  // Compute readonly profit columns
                  let rawVal: string;
                  const cost = parseFloat(prod.costPrice ?? "");
                  if (c.field === "retailProfit") {
                    const retail = parseFloat(prod.price ?? "");
                    rawVal = (!isNaN(cost) && !isNaN(retail)) ? (retail - cost).toFixed(dp) : "";
                  } else if (c.field === "wholesaleProfit") {
                    const ws = parseFloat(prod.wholesalePrice ?? "");
                    rawVal = (!isNaN(cost) && !isNaN(ws)) ? (ws - cost).toFixed(dp) : "";
                  } else {
                    rawVal = String((prod as unknown as Record<string, string>)[c.field] ?? "");
                  }
                  // Color profit cells: green positive, red negative, muted zero/empty
                  const isProfitCol = c.field === "retailProfit" || c.field === "wholesaleProfit";
                  const profitColor = isProfitCol && rawVal !== ""
                    ? (parseFloat(rawVal) > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium"
                      : parseFloat(rawVal) < 0 ? "text-red-500 dark:text-red-400 font-medium"
                      : "text-muted-foreground")
                    : "";

                  // Stock column — read-only pill
                  if (c.field === "stock") {
                    const qty = getProductStock(prod);
                    const isLow = qty !== null && qty > 0 && qty <= 5;
                    const isOut = qty !== null && qty === 0;
                    return (
                      <td key={c.field} className="border-r border-gray-100 dark:border-border relative p-0 select-none"
                        style={{ height: `${CELL_H}px` }}>
                        <div className="w-full h-full flex items-center justify-end px-2.5">
                          {qty === null ? (
                            <span className="text-[11px] text-muted-foreground/40">—</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums
                              ${isOut  ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                               : isLow ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                               :         "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"}`}>
                              {isOut ? "0 — Out" : isLow ? `⚠ ${qty}` : qty}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : isAuthenticated && c.type !== "readonly" ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && isAuthenticated && c.type !== "readonly" && setActiveCell({ id: prod.id, col: ci })}>
                      {isProfitCol ? (
                        <div className={`w-full h-full flex items-center px-3 text-[12px] truncate select-none ${rawVal ? profitColor : "text-muted-foreground/40"}`}>
                          {rawVal || "—"}
                        </div>
                      ) : (
                        <EditableCell
                          value={rawVal} col={c} active={isA} canEdit={isAuthenticated}
                          onActivate={() => setActiveCell({ id: prod.id, col: ci })}
                          onCommit={v => commitCell(prod.id, c.field as EditableField, v)}
                          onCancel={() => setActiveCell(null)}
                          onTab={s => navigateCell(prod.id, ci, s)}
                          onEnter={() => moveCellDown(prod.id, ci)}
                        />
                      )}
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
                      <button className="p-1 rounded text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors" title="View product details & ledger"
                        onClick={e => { e.stopPropagation(); setViewProdId(prod.id); }}>
                        <Eye size={13} />
                      </button>
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
            <tr><td colSpan={visibleCols.length + 2}>
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

      {/* ── Import Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={v => { if (!v) resetImport(); }}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet size={16} className="text-blue-600" />
                Import Products from CSV
              </DialogTitle>
              {rawImportRows.length > 0 && (
                <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5 text-[11px]">
                  <button
                    onClick={() => setImportMode("insert")}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${importMode === "insert" ? "bg-white dark:bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Insert new only
                  </button>
                  <button
                    onClick={() => setImportMode("upsert")}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${importMode === "upsert" ? "bg-white dark:bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <RefreshCw size={10} className="inline mr-1" />Update existing too
                  </button>
                </div>
              )}
            </div>
          </DialogHeader>

          {rawImportRows.length === 0 ? (
            /* Drop zone — shown before a file is loaded */
            <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4"
              onDragOver={e => e.preventDefault()} onDrop={handleFileDrop}>
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                <Upload size={28} className="text-blue-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Drop your CSV file here</p>
                <p className="text-xs text-muted-foreground mt-1">or click the button below to browse</p>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                  <Upload size={13} /> Choose CSV file
                </Button>
                <Button size="sm" variant="ghost" onClick={downloadTemplate} className="gap-1.5 text-muted-foreground">
                  <Download size={13} /> Download template
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground border border-dashed rounded-lg px-4 py-2.5 bg-muted/30 leading-relaxed">
                Expected columns (in any order):<br />
                <code className="font-mono text-[11px]">name, sku, brand, category, unit, price, status, description</code>
              </p>
            </div>
          ) : (
            /* Preview table */
            <Fragment>
              {/* Summary bar */}
              <div className="px-6 py-3 border-b bg-muted/30 flex items-center gap-3 flex-wrap text-[12px]">
                <span className="font-medium">{importRows.length} row{importRows.length !== 1 ? "s" : ""} detected</span>
                {(() => {
                  const newRows    = importRows.filter(r => !r._error && !r._updateId).length;
                  const updateRows = importRows.filter(r => !r._error && !!r._updateId).length;
                  const errorRows  = importRows.filter(r => !!r._error).length;
                  return (
                    <>
                      {newRows > 0 && <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"><CheckCircle2 size={12} />{newRows} new</span>}
                      {updateRows > 0 && <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium"><RefreshCw size={12} />{updateRows} will update</span>}
                      {errorRows > 0 && <span className="flex items-center gap-1 text-red-500 dark:text-red-400 font-medium"><AlertCircle size={12} />{errorRows} skipped (errors)</span>}
                    </>
                  );
                })()}
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="bg-muted/60 sticky top-0 z-10">
                      <th className="border-b border-r px-3 py-2 text-left font-semibold text-muted-foreground w-10">#</th>
                      {CSV_HEADERS.map(h => (
                        <th key={h} className="border-b border-r px-3 py-2 text-left font-semibold text-muted-foreground capitalize">{h}</th>
                      ))}
                      <th className="border-b px-3 py-2 text-left font-semibold text-muted-foreground w-36">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map(row => (
                      <tr key={row._rowNum} className={`border-b transition-colors ${row._error ? "bg-red-50/60 dark:bg-red-950/20" : row._updateId ? "bg-blue-50/40 dark:bg-blue-950/10" : "hover:bg-muted/20"}`}>
                        <td className="border-r px-3 py-1.5 text-muted-foreground font-mono">{row._rowNum}</td>
                        {CSV_HEADERS.map(h => (
                          <td key={h} className="border-r px-3 py-1.5 max-w-[180px] truncate" title={row[h]}>
                            {row[h] || <span className="text-muted-foreground/40">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-1.5">
                          {row._error ? (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-[11px]"><AlertCircle size={11} />{row._error}</span>
                          ) : row._updateId ? (
                            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium"><RefreshCw size={11} />Update existing</span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"><CheckCircle2 size={11} />New</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Fragment>
          )}

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex items-center gap-2 justify-between sm:justify-between">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={downloadTemplate}>
              <Download size={13} /> Download Template
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetImport}>Cancel</Button>
              {rawImportRows.length > 0 && (() => {
                const validCount = importRows.filter(r => !r._error).length;
                const newCount   = importRows.filter(r => !r._error && !r._updateId).length;
                const updCount   = importRows.filter(r => !r._error && !!r._updateId).length;
                const label = [newCount > 0 && `${newCount} new`, updCount > 0 && `${updCount} update`].filter(Boolean).join(" + ");
                return (
                  <Button size="sm" className="gap-1.5" disabled={importing || validCount === 0} onClick={confirmImport}>
                    <Upload size={13} />
                    Import {label || `${validCount} product${validCount !== 1 ? "s" : ""}`}
                  </Button>
                );
              })()}
              {rawImportRows.length === 0 && (
                <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={13} /> Choose file…
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Product Detail Sheet ─────────────────────────────────────────────── */}
      {(() => {
        const prod = viewProdId ? products.find(p => p.id === viewProdId) ?? null : null;
        if (!prod) return null;

        const sym          = getSettingsCurrencySymbol();
        const purchaseP    = parseFloat(prod.purchasePrice   ?? "") || 0;
        const costP        = parseFloat(prod.costPrice       ?? "") || 0;
        const retailP      = parseFloat(prod.price           ?? "") || 0;
        const wholesaleP   = parseFloat(prod.wholesalePrice  ?? "") || 0;
        const retailProfit = retailP > 0 && costP > 0 ? retailP - costP : null;
        const wsProfit     = wholesaleP > 0 && costP > 0 ? wholesaleP - costP : null;
        const margin       = costP > 0 && retailP > 0 ? ((retailP - costP) / retailP * 100) : null;

        // Stock for this product
        const stockEntries = getStock().filter(s =>
          s.productName.trim().toLowerCase() === prod.name.trim().toLowerCase() ||
          (prod.sku && s.sku && s.sku.trim().toLowerCase() === prod.sku.trim().toLowerCase())
        );
        const totalStock = stockEntries.reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);

        // Ledger entries — purchases
        type LedgerEntry = {
          date: string; type: "purchase" | "sale"; ref: string; party: string;
          qty: number; unitPrice: number; total: number;
        };
        const ledger: LedgerEntry[] = [];

        getPurchaseOrders().forEach(po => {
          po.items.forEach(item => {
            if (item.productName.trim().toLowerCase() !== prod.name.trim().toLowerCase()) return;
            ledger.push({
              date: po.orderDate || po.createdAt?.slice(0, 10) || "",
              type: "purchase", ref: po.poNumber, party: po.supplier,
              qty: parseFloat(item.qty) || 0,
              unitPrice: parseFloat(item.unitPrice) || 0,
              total: (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0),
            });
          });
        });

        getInvoices().forEach(inv => {
          if ((inv.invoiceType ?? "sale") !== "sale") return;
          inv.items.forEach(item => {
            const nameMatch = item.productName?.trim().toLowerCase() === prod.name.trim().toLowerCase();
            const skuMatch  = prod.sku && item.sku && item.sku.trim().toLowerCase() === prod.sku.trim().toLowerCase();
            if (!nameMatch && !skuMatch) return;
            const qty  = parseFloat(item.qty) || 0;
            const up   = parseFloat(item.unitPrice) || 0;
            ledger.push({
              date: inv.invoiceDate || inv.createdAt?.slice(0, 10) || "",
              type: "sale", ref: inv.invoiceNumber, party: inv.customer,
              qty, unitPrice: up,
              total: qty * up * (1 - (parseFloat(item.discount ?? "0") / 100)),
            });
          });
        });

        ledger.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
        const totalSoldQty      = ledger.filter(e => e.type === "sale").reduce((s, e) => s + e.qty, 0);
        const totalPurchasedQty = ledger.filter(e => e.type === "purchase").reduce((s, e) => s + e.qty, 0);
        const totalRevenue      = ledger.filter(e => e.type === "sale").reduce((s, e) => s + e.total, 0);

        return (
          <Sheet open={!!viewProdId} onOpenChange={o => { if (!o) setViewProdId(null); }}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col gap-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{prod.name} — Product Details</SheetTitle>
              </SheetHeader>
              {/* Header */}
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 px-6 py-5 text-white shrink-0">
                <div className="flex items-start gap-4">
                  {prod.thumbnail ? (
                    <img src={prod.thumbnail} alt={prod.name}
                      className="w-16 h-16 rounded-xl object-cover border-2 border-white/30 shrink-0 shadow-lg" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                      <Package size={28} className="text-white/60" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold leading-tight truncate">{prod.name}</h2>
                    {prod.sku && <p className="text-indigo-200 text-[12px] font-mono mt-0.5">SKU: {prod.sku}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${prod.status === "Active" ? "bg-emerald-400/30 text-emerald-100" : prod.status === "Inactive" ? "bg-amber-400/30 text-amber-100" : "bg-white/20 text-white/80"}`}>
                        {prod.status}
                      </span>
                      {prod.condition && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white/90">{prod.condition}</span>
                      )}
                      {prod.brand && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/10 text-white/80">{prod.brand}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Price Cards */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Pricing</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Purchase Price",    value: purchaseP,   icon: <ShoppingCart size={14} />, isProfit: false, sub: null },
                      { label: "Cost Price",        value: costP,       icon: <Boxes size={14} />,        isProfit: false, sub: null },
                      { label: "Retail Price",      value: retailP,     icon: <ReceiptText size={14} />,  isProfit: false, sub: null },
                      { label: "Retail Profit",     value: retailProfit, icon: retailProfit !== null && retailProfit > 0 ? <TrendingUp size={14} /> : retailProfit !== null && retailProfit < 0 ? <TrendingDown size={14} /> : <Minus size={14} />, isProfit: true, sub: margin !== null ? `${margin.toFixed(1)}% margin` : null },
                      { label: "Wholesale Price",   value: wholesaleP,  icon: <ShoppingCart size={14} />, isProfit: false, sub: null },
                      { label: "Wholesale Profit",  value: wsProfit,    icon: wsProfit !== null && wsProfit > 0 ? <TrendingUp size={14} /> : wsProfit !== null && wsProfit < 0 ? <TrendingDown size={14} /> : <Minus size={14} />, isProfit: true, sub: null },
                    ].map(card => (
                      <div key={card.label} className="bg-muted/40 rounded-xl p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                          {card.icon} {card.label}
                        </div>
                        <p className={`text-[15px] font-bold ${card.isProfit ? (card.value === null ? "text-muted-foreground" : (card.value as number) > 0 ? "text-emerald-600 dark:text-emerald-400" : (card.value as number) < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground") : ""}`}>
                          {card.value === null || (card.value as number) === 0 && !card.isProfit ? "—" : card.value !== null ? `${sym}${(card.value as number).toFixed(dp)}` : "—"}
                        </p>
                        {card.sub && <p className="text-[10px] text-muted-foreground">{card.sub}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Details */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Details</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {[
                      { label: "Category",  value: prod.category },
                      { label: "Unit",      value: prod.unit },
                      { label: "Brand",     value: prod.brand },
                      { label: "Condition", value: prod.condition },
                      { label: "Created",   value: prod.createdAt ? format(new Date(prod.createdAt), "d MMM yyyy") : "—" },
                      { label: "Updated",   value: prod.updatedAt ? format(new Date(prod.updatedAt), "d MMM yyyy") : "—" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
                        <p className="font-medium text-[13px]">{value || "—"}</p>
                      </div>
                    ))}
                    {prod.description && (
                      <div className="col-span-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Description</p>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">{prod.description}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stock Summary */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Stock</h3>
                    <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${totalStock > 0 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
                      {totalStock} {prod.unit || "units"} total
                    </span>
                  </div>
                  {stockEntries.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground italic">No stock entries found for this product.</p>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="bg-muted/50">
                            {["Store / Location", "Type", "Qty", "Min Level"].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stockEntries.map((s, i) => (
                            <tr key={s.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                              <td className="px-3 py-2 font-medium">{s.store || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">{s.stockType}</td>
                              <td className="px-3 py-2 font-semibold">{s.quantity} {s.unit}</td>
                              <td className="px-3 py-2 text-muted-foreground">{parseFloat(s.minLevel) > 0 ? s.minLevel : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Ledger */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Product Ledger</h3>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span><span className="font-bold text-blue-600 dark:text-blue-400">{totalPurchasedQty}</span> purchased</span>
                      <span><span className="font-bold text-emerald-600 dark:text-emerald-400">{totalSoldQty}</span> sold</span>
                      <span><span className="font-bold text-foreground">{sym}{totalRevenue.toFixed(dp)}</span> revenue</span>
                    </div>
                  </div>
                  {ledger.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground italic">No purchase or sale records found for this product.</p>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="bg-muted/50">
                            {["Date", "Type", "Reference", "Party", "Qty", `Unit (${sym})`, `Total (${sym})`].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.map((e, i) => (
                            <tr key={i} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                              <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                                {e.date ? format(new Date(e.date), "d MMM yy") : "—"}
                              </td>
                              <td className="px-3 py-2">
                                {e.type === "purchase" ? (
                                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                                    <TrendingDown size={11} /> Purchase IN
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                    <TrendingUp size={11} /> Sale OUT
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono font-medium text-[11px]">{e.ref}</td>
                              <td className="px-3 py-2 max-w-[120px] truncate text-muted-foreground" title={e.party}>{e.party || "—"}</td>
                              <td className="px-3 py-2 font-semibold text-right">{e.qty}</td>
                              <td className="px-3 py-2 text-right">{e.unitPrice.toFixed(dp)}</td>
                              <td className="px-3 py-2 font-semibold text-right">{e.total.toFixed(dp)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/40 border-t-2">
                            <td colSpan={4} className="px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase">Totals</td>
                            <td className="px-3 py-2 font-bold text-right text-[12px]">{totalPurchasedQty - totalSoldQty}</td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2 font-bold text-right text-[12px]">{sym}{(ledger.reduce((s, e) => s + e.total, 0)).toFixed(dp)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        );
      })()}

      {/* ── Barcode / QR camera scanner ───────────────────────────────────────── */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleProductScan}
        title="Scan Product Barcode / QR"
        hint="Point the camera at a barcode or QR code to find the product"
      />
    </div>
  );
}
