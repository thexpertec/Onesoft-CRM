import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import { useProducts, useStock } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Product, getBrands, getProductCategories, getUnits, createBrand, createProductCategory, createUnit, bulkImportProducts } from "@/lib/store";
import { useKeyboardScanner } from "@/hooks/use-keyboard-scanner";
import BarcodeScanner from "@/components/barcode-scanner";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Package, Plus, Search, X, Save, Trash2, Link as LinkIcon, Camera, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronDown, RefreshCw, FileDown, Eye, ShoppingCart, ReceiptText, Boxes, TrendingUp, TrendingDown, Minus, GripVertical, Columns3, ScanLine, ArrowUpDown, ArrowUp, ArrowDown, SlidersHorizontal, BadgeAlert, Wallet, BarChart2, Tag, PackageX, PackageCheck } from "lucide-react";
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
// Canonical field order for both template download and import parsing
const CSV_HEADERS: EditableField[] = [
  "name", "localName", "sku", "barcode", "brand",
  "category", "subcategory", "unit",
  "purchasePrice", "costPrice", "price", "wholesalePrice",
  "openingStock", "stockAlertValue", "commissionPct",
  "status", "condition", "description",
];

// Human-readable header labels (same order as CSV_HEADERS)
const CSV_HEADER_LABELS: string[] = [
  "name", "localName", "sku", "barcode", "brand",
  "category", "subcategory", "unit",
  "purchasePrice", "costPrice", "retailPrice", "wholesalePrice",
  "openingStock", "stockAlertQty", "commissionPct",
  "status", "condition", "description",
];

// Alias map: each field can match multiple header spellings from user CSVs
const HEADER_ALIASES: Record<EditableField, string[]> = {
  name:            ["name", "productname", "itemname", "title"],
  localName:       ["localname", "localtitle", "arabicname", "urduname", "altname"],
  sku:             ["sku", "itemcode", "productcode", "code", "partno", "partnumber"],
  barcode:         ["barcode", "ean", "upc", "qrcode", "barcodenumber"],
  brand:           ["brand", "brandname", "manufacturer", "make"],
  category:        ["category", "categoryname", "cat", "group", "productgroup"],
  subcategory:     ["subcategory", "subcat", "subcategoryname", "sub", "subc", "subgroup"],
  unit:            ["unit", "uom", "unitofmeasure", "unitofmeasurement", "measure"],
  purchasePrice:   ["purchaseprice", "buyprice", "costofpurchase", "pp"],
  costPrice:       ["costprice", "cost", "cogs", "cp"],
  price:           ["price", "retailprice", "saleprice", "sellingprice", "sp", "rp"],
  wholesalePrice:  ["wholesaleprice", "wholesale", "tradeprice", "wp"],
  retailProfit:    ["retailprofit", "rprofit", "profitretail"],
  wholesaleProfit: ["wholesaleprofit", "wprofit", "profitwholesale"],
  openingStock:    ["openingstock", "openingqty", "initialstock", "stockqty", "qty", "quantity"],
  stockAlertValue: ["stockalertvalue", "stockalert", "stockalertqty", "alertqty", "reorderpoint", "minstock"],
  commissionPct:   ["commissionpct", "commission", "commissionrate", "agentcommission", "commpct"],
  status:          ["status", "state", "availability"],
  condition:       ["condition", "itemcondition", "productcondition"],
  description:     ["description", "desc", "notes", "details", "remarks"],
};

function downloadTemplate() {
  const sample: string[] = [
    "Onesoft CRM Software",  // name
    "",                       // localName
    "SKU-001",               // sku
    "",                       // barcode
    "Onesoft",               // brand
    "Software",              // category
    "CRM",                   // subcategory ← now included
    "Licence",               // unit
    "600.00",                // purchasePrice
    "750.00",                // costPrice
    "999.00",                // retailPrice
    "799.00",                // wholesalePrice
    "0",                     // openingStock
    "5",                     // stockAlertQty
    "",                      // commissionPct
    "Active",                // status
    "New",                   // condition
    "Cloud-based CRM solution", // description
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

  // Strip non-alpha chars from headers for flexible alias matching
  const headerRow = parseLine(lines[0]).map(h =>
    h.toLowerCase().replace(/\uFEFF/g, "").replace(/[^a-z0-9]/g, "")
  );

  // Build column index map using alias table
  const colMap: Partial<Record<EditableField, number>> = {};
  (Object.keys(HEADER_ALIASES) as EditableField[]).forEach(field => {
    const idx = headerRow.findIndex(h => HEADER_ALIASES[field].includes(h));
    if (idx !== -1) colMap[field] = idx;
  });

  // Blank row initializer covering ALL editable fields
  const blankRow = (): Omit<ImportRow, "_rowNum"> => ({
    name: "", localName: "", sku: "", barcode: "", brand: "",
    category: "", subcategory: "", unit: "",
    purchasePrice: "", costPrice: "", price: "", wholesalePrice: "",
    retailProfit: "", wholesaleProfit: "", commissionPct: "",
    openingStock: "", stockAlertValue: "",
    status: "Active", condition: "", description: "",
  });

  return lines.slice(1).map((line, i) => {
    const cells = parseLine(line);
    const row: ImportRow = { _rowNum: i + 2, ...blankRow() };
    (Object.keys(colMap) as EditableField[]).forEach(f => {
      const ci = colMap[f]!;
      row[f] = ci >= 0 && cells[ci] !== undefined ? cells[ci].trim() : "";
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
  const { products, addProduct, editProduct, removeProduct, reorderProds, refresh: refreshProducts } = useProducts();
  const { stock, refresh: refreshStock } = useStock();
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
  const [filterCategory,    setFilterCategory]    = useState("");
  const [filterSubcategory, setFilterSubcategory] = useState("");
  const [filterBrand,       setFilterBrand]       = useState("");
  const [filterCondition,   setFilterCondition]   = useState("");
  const [scannerOpen,    setScannerOpen]    = useState(false);
  const [activeCell,     setActiveCell]     = useState<{ id: string; col: number } | null>(null);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const [newRow,         setNewRow]         = useState<Record<EditableField, string> | null>(null);
  const [newRowActive,   setNewRowActive]   = useState<number | null>(null);
  const [imagesDialogId, setImagesDialogId] = useState<string | null>(null);
  const [viewProdId,    setViewProdId]    = useState<string | null>(null);

  const [showHelp,      setShowHelp]      = useState(false);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const [sortField, setSortField] = useState("name");
  const [sortDir,   setSortDir]   = useState<"asc" | "desc">("asc");

  // ── Advanced filters ───────────────────────────────────────────────────────
  const [filterStockStatus, setFilterStockStatus] = useState<"all" | "in-stock" | "low-stock" | "out-of-stock">("all");
  const [filterMinPrice,    setFilterMinPrice]    = useState("");
  const [filterMaxPrice,    setFilterMaxPrice]    = useState("");
  const [showAdvFilters,    setShowAdvFilters]    = useState(false);

  // ── Bulk selection ──────────────────────────────────────────────────────────
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

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
  const [importMode,       setImportMode]       = useState<"insert" | "upsert">("upsert");
  const [importing,        setImporting]        = useState(false);
  const [importProgress,   setImportProgress]   = useState<{
    total: number; done: number; created: number; updated: number; failed: number;
  } | null>(null);
  const [importedRowNums,  setImportedRowNums]  = useState<Set<number>>(new Set());
  const [importRowResults, setImportRowResults] = useState<Map<number, "created" | "updated">>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── SKU check: "insert" mode flags conflicts; "upsert" mode marks them for update ──
  const enrichWithSkuErrors = useCallback((rows: ImportRow[], mode: "insert" | "upsert"): ImportRow[] => {
    // Primary match: by SKU (trimmed, case-insensitive)
    const existingSkuMap = new Map(
      products.filter(p => p.sku?.trim()).map(p => [p.sku.trim().toLowerCase(), { name: p.name, id: p.id }])
    );
    // Fallback match: by name (trimmed, case-insensitive) — catches re-imports where
    // the same file was previously imported but SKUs weren't persisted correctly.
    const existingNameMap = new Map(
      products.map(p => [p.name.trim().toLowerCase(), { name: p.name, id: p.id }])
    );
    const seenSkuInFile  = new Map<string, number>();
    const seenNameInFile = new Map<string, number>();
    return rows.map(r => {
      if (r._error) return r;
      const skuKey  = r.sku.trim().toLowerCase();
      const nameKey = r.name.trim().toLowerCase();

      // 1. SKU match against existing products
      if (skuKey && existingSkuMap.has(skuKey)) {
        const existing = existingSkuMap.get(skuKey)!;
        if (mode === "upsert") return { ...r, _updateId: existing.id };
        return { ...r, _error: `SKU "${r.sku}" already used by "${existing.name}"` };
      }

      // 2. Name-based fallback match (only for upsert mode; insert mode should still error)
      if (mode === "upsert" && nameKey && existingNameMap.has(nameKey)) {
        const existing = existingNameMap.get(nameKey)!;
        return { ...r, _updateId: existing.id };
      }

      // 3. Duplicate-in-file check
      if (skuKey) {
        if (seenSkuInFile.has(skuKey))
          return { ...r, _error: `SKU "${r.sku}" duplicated in this file (first at row ${seenSkuInFile.get(skuKey)})` };
        seenSkuInFile.set(skuKey, r._rowNum);
      } else {
        if (seenNameInFile.has(nameKey))
          return { ...r, _error: `Name "${r.name}" duplicated in this file (first at row ${seenNameInFile.get(nameKey)})` };
        seenNameInFile.set(nameKey, r._rowNum);
      }

      return r;
    });
  }, [products]);

  // Derived rows re-evaluated whenever raw rows OR mode changes
  const importRows = useMemo(
    () => enrichWithSkuErrors(rawImportRows, importMode),
    [rawImportRows, importMode, enrichWithSkuErrors]
  );

  const resetImport = () => {
    setImportOpen(false);
    setRawImportRows([]);
    setImportMode("upsert");
    setImportProgress(null);
    setImportedRowNums(new Set());
    setImportRowResults(new Map());
  };

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

  // ── Sync brands / categories / subcategories / units from import rows ──────
  const syncReferenceDataFromImport = (validRows: typeof importRows) => {
    const trim = (s?: string) => (s ?? "").trim();

    // ── Brands ────────────────────────────────────────────────────────────────
    const existingBrands    = getBrands();
    const existingBrandSet  = new Set(existingBrands.map(b => b.name.toLowerCase().trim()));
    const newBrands         = [...new Set(validRows.map(r => trim(r.brand)).filter(Boolean))]
                               .filter(b => !existingBrandSet.has(b.toLowerCase()));
    for (const b of newBrands) {
      createBrand({ name: b, color: "#6366f1", website: "", description: "", status: "Active" });
    }

    // ── Top-level Categories ──────────────────────────────────────────────────
    const existingCats      = getProductCategories();
    const existingTopSet    = new Set(existingCats.filter(c => !c.parentId).map(c => c.name.toLowerCase().trim()));
    const newCatNames       = [...new Set(validRows.map(r => trim(r.category)).filter(Boolean))]
                               .filter(c => !existingTopSet.has(c.toLowerCase()));
    for (const c of newCatNames) {
      createProductCategory({ name: c, description: "", color: "#6366f1", parentId: null });
    }

    // ── Subcategories (re-read so we get freshly created categories too) ──────
    const allCats           = getProductCategories();
    const topNameToId       = new Map(allCats.filter(c => !c.parentId).map(c => [c.name.toLowerCase().trim(), c.id]));
    const existingSubByKey  = new Set(allCats.filter(c => c.parentId).map(c => `${c.parentId}||${c.name.toLowerCase().trim()}`));
    const subPairs = [...new Set(
      validRows.filter(r => trim(r.subcategory) && trim(r.category)).map(r => `${trim(r.category)}||${trim(r.subcategory)}`)
    )].map(s => { const [cat, sub] = s.split("||"); return { cat, sub }; });
    let subsAdded = 0;
    for (const { cat, sub } of subPairs) {
      const parentId = topNameToId.get(cat.toLowerCase());
      if (!parentId) continue;
      if (existingSubByKey.has(`${parentId}||${sub.toLowerCase()}`)) continue;
      createProductCategory({ name: sub, description: "", color: "#818cf8", parentId });
      subsAdded++;
    }

    // ── Units ─────────────────────────────────────────────────────────────────
    const existingUnits    = getUnits();
    const existingUnitSet  = new Set(existingUnits.map(u => u.name.toLowerCase().trim()));
    const newUnits         = [...new Set(validRows.map(r => trim(r.unit)).filter(Boolean))]
                               .filter(u => !existingUnitSet.has(u.toLowerCase()));
    for (const u of newUnits) {
      createUnit({ name: u, symbol: u.substring(0, 4).toUpperCase(), description: "" });
    }

    return {
      brands:     newBrands.length,
      categories: newCatNames.length,
      subcats:    subsAdded,
      units:      newUnits.length,
    };
  };

  const confirmImport = () => {
    // Snapshot importRows NOW, before any async re-renders change it
    const snapshot  = importRows;
    const valid     = snapshot.filter(r => !r._error);
    const invalid   = snapshot.filter(r => !!r._error);
    const total     = snapshot.length;

    // Diagnostic — helps identify stale-mode or stale-products issues
    console.info(
      `[import] mode=${importMode} total=${total} valid=${valid.length} invalid=${invalid.length}` +
      ` new=${valid.filter(r => !r._updateId).length} update=${valid.filter(r => !!r._updateId).length}`,
    );
    const BATCH     = 30;

    setImporting(true);
    setImportedRowNums(new Set());
    setImportRowResults(new Map());
    setImportProgress({ total, done: invalid.length, created: 0, updated: 0, failed: invalid.length });

    // Sync reference tables — runs synchronously, may fire storage events
    // but we already snapshotted importRows above so re-renders don't affect us
    let refSync: ReturnType<typeof syncReferenceDataFromImport>;
    try {
      refSync = syncReferenceDataFromImport(valid);
    } catch (e) {
      console.error("[import] syncReferenceDataFromImport failed:", e);
      refSync = { brands: 0, categories: 0, subcats: 0, units: 0 };
    }

    // ── Accumulate ALL rows in memory — NO localStorage writes per batch ──
    // We collect every row's payload here, then do ONE bulkImportProducts
    // call at the very end (single localStorage read + write). This prevents
    // the QuotaExceededError that occurs when writing 30 + 30 + 30 … times
    // with an ever-growing product list.
    type RowPayload = Omit<Product, "id" | "createdAt" | "updatedAt">;
    const allToCreate: { row: (typeof valid)[0]; payload: RowPayload }[] = [];
    const allToUpdate: { row: (typeof valid)[0]; id: string; payload: Partial<Omit<Product, "id" | "createdAt">> }[] = [];

    let batchIdx = 0;
    const batchRowResults   = new Map<number, "created" | "updated">();
    const batchImportedNums = new Set<number>();

    const processBatch = async () => {
      try {
        const slice = valid.slice(batchIdx * BATCH, (batchIdx + 1) * BATCH);

        // Classify rows — pure in-memory, no I/O
        for (const r of slice) {
          const payload: RowPayload = {
            name: r.name, sku: r.sku, brand: r.brand, category: r.category,
            subcategory: r.subcategory,
            unit: r.unit, purchasePrice: r.purchasePrice, costPrice: r.costPrice,
            price: r.price, wholesalePrice: r.wholesalePrice,
            barcode: r.barcode, localName: r.localName,
            openingStock: r.openingStock, stockAlertQty: r.stockAlertValue,
            commissionPct: r.commissionPct,
            status: (r.status as Product["status"]) || "Active",
            condition: (r.condition as Product["condition"]) || undefined,
            description: r.description,
          };
          if (r._updateId) allToUpdate.push({ row: r, id: r._updateId, payload });
          else             allToCreate.push({ row: r, payload });
        }

        // Track per-row UI state for this batch tick
        for (const r of slice) {
          const label = r._updateId ? "updated" : "created";
          batchRowResults.set(r._rowNum, label);
          batchImportedNums.add(r._rowNum);
        }

        batchIdx++;
        const done = Math.min(batchIdx * BATCH, valid.length) + invalid.length;
        const created = allToCreate.length;
        const updated = allToUpdate.length;
        setImportProgress({ total, done, created, updated, failed: invalid.length });
        setImportedRowNums(new Set(batchImportedNums));
        setImportRowResults(new Map(batchRowResults));

        if (batchIdx * BATCH < valid.length) {
          // More batches — keep ticking for UI progress
          setTimeout(processBatch, 0);
          return;
        }

        // ── Last batch: now do the ONE bulk write (await so DB write completes) ──
        try {
          await bulkImportProducts(
            allToCreate.map(t => t.payload),
            allToUpdate.map(t => ({ id: t.id, data: t.payload })),
          );
        } catch (writeErr) {
          console.error("[import] bulkImportProducts failed:", writeErr);
          toast({
            title: "Storage error",
            description:
              "Products were processed but could not be saved. " +
              "Check your connection and try again.",
            variant: "destructive",
          });
          setImporting(false);
          return;
        }

        const productParts: string[] = [];
        if (allToCreate.length > 0) productParts.push(`${allToCreate.length} created`);
        if (allToUpdate.length > 0) productParts.push(`${allToUpdate.length} updated`);
        if (invalid.length > 0)     productParts.push(`${invalid.length} skipped`);

        const refParts: string[] = [];
        if (refSync.brands     > 0) refParts.push(`${refSync.brands} brand${refSync.brands !== 1 ? "s" : ""}`);
        if (refSync.categories > 0) refParts.push(`${refSync.categories} categor${refSync.categories !== 1 ? "ies" : "y"}`);
        if (refSync.subcats    > 0) refParts.push(`${refSync.subcats} subcategor${refSync.subcats !== 1 ? "ies" : "y"}`);
        if (refSync.units      > 0) refParts.push(`${refSync.units} unit${refSync.units !== 1 ? "s" : ""}`);

        refreshProducts();
        refreshStock();
        toast({
          title: "Import complete — saved to server",
          description: [
            productParts.join(" · "),
            refParts.length > 0 ? `Also added: ${refParts.join(", ")}` : "",
          ].filter(Boolean).join("  •  "),
        });
        setTimeout(() => { resetImport(); setImporting(false); }, 800);

      } catch (batchErr) {
        console.error("[import] processBatch unexpected error:", batchErr);
        toast({
          title: "Import error",
          description: "An unexpected error stopped the import. Check browser console for details.",
          variant: "destructive",
        });
        setImporting(false);
      }
    };

    setTimeout(processBatch, 50);
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

  // ── Dropdown filter option lists ──────────────────────────────────────────
  const allCategories    = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort() as string[], [products]);
  const allSubcategories = useMemo(() => {
    const src = filterCategory ? products.filter(p => p.category === filterCategory) : products;
    return [...new Set(src.map(p => p.subcategory).filter(Boolean))].sort() as string[];
  }, [products, filterCategory]);
  const allBrands        = useMemo(() => [...new Set(products.map(p => p.brand).filter(Boolean))].sort() as string[], [products]);
  const allConditions    = useMemo(() => [...new Set(products.map(p => p.condition).filter(Boolean))].sort() as string[], [products]);

  const isFiltered = !!(search || statusFilter !== "All" || filterCategory || filterSubcategory || filterBrand || filterCondition || filterStockStatus !== "all" || filterMinPrice || filterMaxPrice);

  const applyStatusFilter = (p: Product): boolean => {
    switch (statusFilter) {
      case "All":          return true;
      case "Active":
      case "Inactive":
      case "Draft":        return p.status === statusFilter;
      case "no-price":     return !p.price || parseFloat(p.price) === 0;
      case "no-cost":      return !p.costPrice || parseFloat(p.costPrice) === 0;
      case "has-wholesale":return !!(p.wholesalePrice && parseFloat(p.wholesalePrice) > 0);
      case "no-wholesale": return !(p.wholesalePrice && parseFloat(p.wholesalePrice) > 0);
      case "no-category":  return !p.category;
      case "with-images":  return !!(p.images && p.images.length > 0);
      case "no-image":     return !(p.images && p.images.length > 0);
      case "no-sku":       return !p.sku?.trim();
      case "no-barcode":   return !p.barcode?.trim();
      case "loss-making":  { const cost = parseFloat(p.costPrice ?? "0") || 0; const price = parseFloat(p.price ?? "0") || 0; return price > 0 && cost > price; }
      case "out-of-stock": return (getProductStock(p) ?? 0) === 0;
      case "low-stock":    { const qty = getProductStock(p) ?? 0; const alert = parseFloat((p as Product & { stockAlertQty?: string }).stockAlertQty ?? "0") || 5; return qty > 0 && qty <= alert; }
      case "in-stock":     return (getProductStock(p) ?? 0) > 0;
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
    .filter(applyStatusFilter)
    .filter(p => !filterCategory    || p.category    === filterCategory)
    .filter(p => !filterSubcategory || p.subcategory === filterSubcategory)
    .filter(p => !filterBrand       || p.brand       === filterBrand)
    .filter(p => !filterCondition   || p.condition   === filterCondition)
    .filter(p => {
      if (filterStockStatus === "all") return true;
      const qty   = getProductStock(p) ?? 0;
      const alert = parseFloat((p as Product & { stockAlertQty?: string }).stockAlertQty ?? "0") || 5;
      if (filterStockStatus === "in-stock")     return qty > 0;
      if (filterStockStatus === "out-of-stock") return qty === 0;
      if (filterStockStatus === "low-stock")    return qty > 0 && qty <= alert;
      return true;
    })
    .filter(p => {
      const price = parseFloat(p.price ?? "0") || 0;
      if (filterMinPrice && price < parseFloat(filterMinPrice)) return false;
      if (filterMaxPrice && price > parseFloat(filterMaxPrice)) return false;
      return true;
    });

  // ── Sorted display rows ────────────────────────────────────────────────────
  const displayRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      switch (sortField) {
        case "name":         av = a.name?.toLowerCase() ?? ""; bv = b.name?.toLowerCase() ?? ""; break;
        case "sku":          av = a.sku?.toLowerCase() ?? "";  bv = b.sku?.toLowerCase() ?? "";  break;
        case "brand":        av = a.brand?.toLowerCase() ?? "";bv = b.brand?.toLowerCase() ?? "";break;
        case "category":     av = a.category?.toLowerCase() ?? ""; bv = b.category?.toLowerCase() ?? ""; break;
        case "price":        av = parseFloat(a.price ?? "0") || 0; bv = parseFloat(b.price ?? "0") || 0; break;
        case "costPrice":    av = parseFloat(a.costPrice ?? "0") || 0; bv = parseFloat(b.costPrice ?? "0") || 0; break;
        case "purchasePrice":av = parseFloat(a.purchasePrice ?? "0") || 0; bv = parseFloat(b.purchasePrice ?? "0") || 0; break;
        case "wholesalePrice":av = parseFloat(a.wholesalePrice ?? "0") || 0; bv = parseFloat(b.wholesalePrice ?? "0") || 0; break;
        case "margin":       {
          const ma = (() => { const c = parseFloat(a.costPrice ?? "0") || 0; const p2 = parseFloat(a.price ?? "0") || 0; return p2 > 0 ? ((p2 - c) / p2) * 100 : 0; })();
          const mb = (() => { const c = parseFloat(b.costPrice ?? "0") || 0; const p2 = parseFloat(b.price ?? "0") || 0; return p2 > 0 ? ((p2 - c) / p2) * 100 : 0; })();
          av = ma; bv = mb; break;
        }
        case "stock":        av = getProductStock(a) ?? -1; bv = getProductStock(b) ?? -1; break;
        case "status":       av = a.status?.toLowerCase() ?? ""; bv = b.status?.toLowerCase() ?? ""; break;
        default:             return 0;
      }
      if (typeof av === "string") {
        const cmp = av.localeCompare(bv as string);
        return sortDir === "asc" ? cmp : -cmp;
      }
      return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    });
  }, [filtered, sortField, sortDir]);

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let invValue = 0, retailValue = 0, marginSum = 0, marginCount = 0;
    let outOfStock = 0, lowStock = 0, inStock = 0;
    let noSku = 0, noBarcode = 0, lossMaking = 0, noWholesale = 0;

    for (const p of products) {
      const cost   = parseFloat(p.costPrice ?? "0") || 0;
      const price  = parseFloat(p.price ?? "0") || 0;
      const ws     = parseFloat(p.wholesalePrice ?? "0") || 0;
      const qty    = getProductStock(p) ?? 0;
      const alert  = parseFloat((p as Product & { stockAlertQty?: string }).stockAlertQty ?? "0") || 5;

      invValue    += cost * qty;
      retailValue += price * qty;

      if (price > 0) { marginSum += ((price - cost) / price) * 100; marginCount++; }
      if (qty === 0)                   outOfStock++;
      else if (qty > 0 && qty <= alert) lowStock++;
      else if (qty > alert)             inStock++;

      if (!p.sku?.trim())     noSku++;
      if (!p.barcode?.trim()) noBarcode++;
      if (price > 0 && cost > price) lossMaking++;
      if (!ws) noWholesale++;
    }
    return {
      invValue, retailValue,
      avgMargin: marginCount > 0 ? marginSum / marginCount : 0,
      unrealisedProfit: retailValue - invValue,
      outOfStock, lowStock, inStock, noSku, noBarcode, lossMaking, noWholesale,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, stockBySkuMap]);

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
    const ids = displayRows.map(p => p.id);
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
    const rows = [NEW_ROW_ID, ...displayRows.map(p => p.id)];
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= visibleCols.length) { nc = 0; nr++; }
    if (nc < 0) { nc = visibleCols.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(nc); }
    else { setActiveCell({ id: nid, col: nc }); setNewRowActive(null); }
  }, [displayRows, visibleCols.length]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = [NEW_ROW_ID, ...displayRows.map(p => p.id)];
    const ri = rows.indexOf(id);
    const nr = ri + 1;
    if (nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(col); }
    else { setActiveCell({ id: nid, col }); setNewRowActive(null); }
  }, [displayRows]);

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

  // ── Bulk selection helpers ──────────────────────────────────────────────────
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allFilteredSelected = displayRows.length > 0 && displayRows.every(p => selectedIds.has(p.id));
  const someFilteredSelected = displayRows.some(p => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        displayRows.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds(prev => new Set([...prev, ...displayRows.map(p => p.id)]));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    selectedIds.forEach(id => removeProduct(id));
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    toast({ title: `${count} product${count !== 1 ? "s" : ""} deleted`, description: "Selected products have been removed." });
  };

  const pills = [
    { label: "Total",         value: products.length,                                                                         filter: "All",           color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                           activeRing: "ring-gray-400 dark:ring-gray-500"        },
    { label: "Active",        value: products.filter(p => p.status === "Active").length,                                      filter: "Active",        color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",             activeRing: "ring-emerald-500 dark:ring-emerald-400"  },
    { label: "Inactive",      value: products.filter(p => p.status === "Inactive").length,                                    filter: "Inactive",      color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",                     activeRing: "ring-amber-400 dark:ring-amber-500"      },
    { label: "Draft",         value: products.filter(p => p.status === "Draft").length,                                       filter: "Draft",         color: "bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400",                        activeRing: "ring-gray-300 dark:ring-gray-600"        },
    { label: "In Stock",      value: stats.inStock,                                                                           filter: "in-stock",      color: "bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300",                      activeRing: "ring-green-500 dark:ring-green-400"      },
    { label: "Low Stock",     value: stats.lowStock,                                                                          filter: "low-stock",     color: "bg-yellow-50 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300",                  activeRing: "ring-yellow-400 dark:ring-yellow-500"    },
    { label: "Out of Stock",  value: stats.outOfStock,                                                                        filter: "out-of-stock",  color: "bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300",                            activeRing: "ring-red-500 dark:ring-red-400"          },
    { label: "No Price",      value: products.filter(p => !p.price || parseFloat(p.price) === 0).length,                     filter: "no-price",      color: "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300",                        activeRing: "ring-rose-400 dark:ring-rose-500"        },
    { label: "No Cost",       value: products.filter(p => !p.costPrice || parseFloat(p.costPrice) === 0).length,              filter: "no-cost",       color: "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300",                activeRing: "ring-orange-400 dark:ring-orange-500"    },
    { label: "Loss Making",   value: stats.lossMaking,                                                                        filter: "loss-making",   color: "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300",                           activeRing: "ring-red-600 dark:ring-red-400"          },
    { label: "No SKU",        value: stats.noSku,                                                                             filter: "no-sku",        color: "bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300",                 activeRing: "ring-violet-400 dark:ring-violet-500"    },
    { label: "No Barcode",    value: stats.noBarcode,                                                                         filter: "no-barcode",    color: "bg-fuchsia-50 dark:bg-fuchsia-950/50 text-fuchsia-700 dark:text-fuchsia-300",             activeRing: "ring-fuchsia-400 dark:ring-fuchsia-500"  },
    { label: "Has Wholesale", value: products.filter(p => !!(p.wholesalePrice && parseFloat(p.wholesalePrice) > 0)).length,  filter: "has-wholesale", color: "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300",                activeRing: "ring-purple-400 dark:ring-purple-500"    },
    { label: "No Wholesale",  value: stats.noWholesale,                                                                       filter: "no-wholesale",  color: "bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400",                     activeRing: "ring-slate-400 dark:ring-slate-500"      },
    { label: "No Category",   value: products.filter(p => !p.category).length,                                               filter: "no-category",   color: "bg-zinc-50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400",                        activeRing: "ring-zinc-400 dark:ring-zinc-500"        },
    { label: "With Images",   value: products.filter(p => !!(p.images && p.images.length > 0)).length,                       filter: "with-images",   color: "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300",                           activeRing: "ring-sky-400 dark:ring-sky-500"          },
    { label: "No Image",      value: products.filter(p => !(p.images && p.images.length > 0)).length,                        filter: "no-image",      color: "bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400",                        activeRing: "ring-gray-300 dark:ring-gray-600"        },
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
              downloadExcel("Products", "Products", displayRows, [
                { header: "#",               key: "id",            getValue: r => displayRows.indexOf(r) + 1, width: 5 },
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

      {/* ── Stats summary bar ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: <Wallet size={15} className="text-indigo-500" />,
            label: "Inventory Value",
            value: `${sym}${stats.invValue.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`,
            sub: "cost × stock qty",
            border: "border-indigo-200 dark:border-indigo-800",
            bg: "bg-indigo-50/60 dark:bg-indigo-950/30",
          },
          {
            icon: <Tag size={15} className="text-emerald-500" />,
            label: "Retail Value",
            value: `${sym}${stats.retailValue.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`,
            sub: "retail × stock qty",
            border: "border-emerald-200 dark:border-emerald-800",
            bg: "bg-emerald-50/60 dark:bg-emerald-950/30",
          },
          {
            icon: <BarChart2 size={15} className="text-blue-500" />,
            label: "Avg Margin",
            value: `${stats.avgMargin.toFixed(1)}%`,
            sub: products.length > 0 ? `across ${products.filter(p => parseFloat(p.price ?? "0") > 0).length} priced products` : "no products",
            border: "border-blue-200 dark:border-blue-800",
            bg: "bg-blue-50/60 dark:bg-blue-950/30",
          },
          {
            icon: stats.unrealisedProfit >= 0
              ? <TrendingUp size={15} className="text-green-500" />
              : <TrendingDown size={15} className="text-red-500" />,
            label: "Unrealised Profit",
            value: `${sym}${Math.abs(stats.unrealisedProfit).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`,
            sub: stats.unrealisedProfit >= 0 ? "retail − cost value" : "cost exceeds retail",
            border: stats.unrealisedProfit >= 0 ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800",
            bg:     stats.unrealisedProfit >= 0 ? "bg-green-50/60 dark:bg-green-950/30"    : "bg-red-50/60 dark:bg-red-950/30",
          },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3 flex items-start gap-3`}>
            <div className="mt-0.5 flex-shrink-0">{s.icon}</div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium truncate">{s.label}</p>
              <p className="text-[18px] font-bold tracking-tight leading-tight">{s.value}</p>
              <p className="text-[10px] text-muted-foreground/70 truncate">{s.sub}</p>
            </div>
          </div>
        ))}
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

        {/* ── Sort controls ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value)}
              className="h-8 pl-2.5 pr-7 rounded-l-lg border border-r-0 border-gray-200 dark:border-border bg-white dark:bg-card text-[12px] font-medium appearance-none cursor-pointer outline-none text-foreground hover:border-gray-300"
            >
              <option value="name">Sort: Name</option>
              <option value="sku">Sort: SKU</option>
              <option value="brand">Sort: Brand</option>
              <option value="category">Sort: Category</option>
              <option value="price">Sort: Price</option>
              <option value="costPrice">Sort: Cost</option>
              <option value="purchasePrice">Sort: Purchase</option>
              <option value="wholesalePrice">Sort: Wholesale</option>
              <option value="margin">Sort: Margin %</option>
              <option value="stock">Sort: Stock</option>
              <option value="status">Sort: Status</option>
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>
          <button
            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
            title={sortDir === "asc" ? "Ascending — click to reverse" : "Descending — click to reverse"}
            className="h-8 w-8 flex items-center justify-center rounded-r-lg border border-gray-200 dark:border-border bg-white dark:bg-card hover:bg-gray-50 dark:hover:bg-muted/40 transition-colors"
          >
            {sortDir === "asc" ? <ArrowUp size={13} className="text-indigo-500" /> : <ArrowDown size={13} className="text-indigo-500" />}
          </button>
        </div>

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowAdvFilters(v => !v)}
          className={`h-8 px-2.5 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition-all ${
            showAdvFilters || filterStockStatus !== "all" || filterMinPrice || filterMaxPrice
              ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300"
              : "border-gray-200 dark:border-border bg-white dark:bg-card text-muted-foreground hover:border-gray-300"
          }`}
          title="Toggle advanced filters"
        >
          <SlidersHorizontal size={13} />
          Filters
          {(filterStockStatus !== "all" || filterMinPrice || filterMaxPrice) && (
            <span className="ml-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {[filterStockStatus !== "all", !!filterMinPrice, !!filterMaxPrice].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* ── Dropdown Filters ──────────────────────────────────────── */}
        {(allCategories.length > 0 || allBrands.length > 0 || allConditions.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category */}
            {allCategories.length > 0 && (
              <div className="relative">
                <select
                  value={filterCategory}
                  onChange={e => { setFilterCategory(e.target.value); setFilterSubcategory(""); }}
                  className={`h-8 pl-2.5 pr-7 rounded-lg border text-[12px] font-medium appearance-none cursor-pointer transition-all outline-none
                    ${filterCategory
                      ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300"
                      : "border-gray-200 dark:border-border bg-white dark:bg-card text-muted-foreground hover:border-gray-300 dark:hover:border-muted-foreground/40"}`}
                >
                  <option value="">All Categories</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
            )}

            {/* Subcategory — only show when options exist */}
            {allSubcategories.length > 0 && (
              <div className="relative">
                <select
                  value={filterSubcategory}
                  onChange={e => setFilterSubcategory(e.target.value)}
                  className={`h-8 pl-2.5 pr-7 rounded-lg border text-[12px] font-medium appearance-none cursor-pointer transition-all outline-none
                    ${filterSubcategory
                      ? "border-violet-400 dark:border-violet-500 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300"
                      : "border-gray-200 dark:border-border bg-white dark:bg-card text-muted-foreground hover:border-gray-300 dark:hover:border-muted-foreground/40"}`}
                >
                  <option value="">All Subcategories</option>
                  {allSubcategories.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
            )}

            {/* Brand */}
            {allBrands.length > 0 && (
              <div className="relative">
                <select
                  value={filterBrand}
                  onChange={e => setFilterBrand(e.target.value)}
                  className={`h-8 pl-2.5 pr-7 rounded-lg border text-[12px] font-medium appearance-none cursor-pointer transition-all outline-none
                    ${filterBrand
                      ? "border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300"
                      : "border-gray-200 dark:border-border bg-white dark:bg-card text-muted-foreground hover:border-gray-300 dark:hover:border-muted-foreground/40"}`}
                >
                  <option value="">All Brands</option>
                  {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
            )}

            {/* Condition */}
            {allConditions.length > 0 && (
              <div className="relative">
                <select
                  value={filterCondition}
                  onChange={e => setFilterCondition(e.target.value)}
                  className={`h-8 pl-2.5 pr-7 rounded-lg border text-[12px] font-medium appearance-none cursor-pointer transition-all outline-none
                    ${filterCondition
                      ? "border-teal-400 dark:border-teal-500 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300"
                      : "border-gray-200 dark:border-border bg-white dark:bg-card text-muted-foreground hover:border-gray-300 dark:hover:border-muted-foreground/40"}`}
                >
                  <option value="">All Conditions</option>
                  {allConditions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
            )}

            {/* Clear all dropdown filters */}
            {(filterCategory || filterSubcategory || filterBrand || filterCondition) && (
              <button
                onClick={() => { setFilterCategory(""); setFilterSubcategory(""); setFilterBrand(""); setFilterCondition(""); }}
                className="h-8 px-2.5 rounded-lg text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1"
              >
                <X size={11} /> Clear filters
              </button>
            )}
          </div>
        )}

        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        {/* Bulk action bar */}
        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-[12px] font-medium text-foreground">{selectedIds.size} selected</span>
            {isAuthenticated && (
              <>
                <div className="relative">
                  <select
                    defaultValue=""
                    onChange={e => {
                      const newStatus = e.target.value as Product["status"];
                      if (!newStatus) return;
                      selectedIds.forEach(id => editProduct(id, { status: newStatus }));
                      toast({ title: `Set ${selectedIds.size} products to ${newStatus}` });
                      clearSelection();
                      (e.target as HTMLSelectElement).value = "";
                    }}
                    className="h-8 pl-2.5 pr-7 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card text-[12px] font-medium appearance-none cursor-pointer outline-none text-foreground hover:border-gray-300"
                  >
                    <option value="">Set Status…</option>
                    <option value="Active">→ Active</option>
                    <option value="Inactive">→ Inactive</option>
                    <option value="Draft">→ Draft</option>
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                </div>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => {
                  const rows = displayRows.filter(p => selectedIds.has(p.id));
                  downloadExcel("Products", "Selected Products", rows, [
                    { header: "#",            key: "id", getValue: (r: Product) => rows.indexOf(r) + 1, width: 5 },
                    { header: "Name",         key: "name",  width: 32 },
                    { header: "SKU",          key: "sku",   width: 18 },
                    { header: "Category",     key: "category", width: 20 },
                    { header: "Brand",        key: "brand", width: 16 },
                    { header: "Cost",         key: "costPrice", width: 14 },
                    { header: "Retail Price", key: "price", width: 14 },
                    { header: "Status",       key: "status", width: 12 },
                  ]);
                }}>
                  <FileDown size={12} /> Export
                </Button>
                <Button size="sm" variant="destructive" className="h-8 gap-1.5 text-[12px]" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 size={12} /> Delete {selectedIds.size}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-8 text-[12px] text-muted-foreground" onClick={clearSelection}>
              <X size={12} className="mr-1" /> Clear
            </Button>
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground self-center ml-auto">{displayRows.length} of {products.length}</div>
        )}
      </div>

      {/* ── Advanced filter panel ─────────────────────────────────────────────── */}
      {showAdvFilters && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20">
          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide flex items-center gap-1.5 mr-1">
            <SlidersHorizontal size={12} /> Advanced
          </span>

          {/* Stock status */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium">Stock:</span>
            {(["all","in-stock","low-stock","out-of-stock"] as const).map(v => (
              <button key={v}
                onClick={() => setFilterStockStatus(v)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  filterStockStatus === v
                    ? v === "all"          ? "bg-gray-600 text-white"
                    : v === "in-stock"     ? "bg-green-500 text-white"
                    : v === "low-stock"    ? "bg-yellow-500 text-white"
                                           : "bg-red-500 text-white"
                    : "bg-white dark:bg-card border border-gray-200 dark:border-border text-muted-foreground hover:border-gray-300"
                }`}
              >
                {v === "all" ? "All" : v === "in-stock" ? "In Stock" : v === "low-stock" ? "Low" : "Out"}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-indigo-200 dark:bg-indigo-800" />

          {/* Price range */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium">Price:</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{sym}</span>
              <input
                type="number" min="0" placeholder="Min"
                value={filterMinPrice}
                onChange={e => setFilterMinPrice(e.target.value)}
                className="h-7 w-20 pl-5 pr-2 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card text-[12px] outline-none focus:border-indigo-400"
              />
            </div>
            <span className="text-[11px] text-muted-foreground">—</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{sym}</span>
              <input
                type="number" min="0" placeholder="Max"
                value={filterMaxPrice}
                onChange={e => setFilterMaxPrice(e.target.value)}
                className="h-7 w-20 pl-5 pr-2 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card text-[12px] outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {(filterStockStatus !== "all" || filterMinPrice || filterMaxPrice) && (
            <button
              onClick={() => { setFilterStockStatus("all"); setFilterMinPrice(""); setFilterMaxPrice(""); }}
              className="ml-auto h-7 px-2.5 rounded-lg text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors flex items-center gap-1"
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Excel grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={visibleCols} totalMinW={TOTAL_W} tableId="products"
          extraLeadingCol={{
            width: 32,
            header: isAuthenticated ? (
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer"
                  checked={allFilteredSelected}
                  ref={el => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                  onChange={toggleSelectAll}
                  title={allFilteredSelected ? "Deselect all" : "Select all"}
                />
              </div>
            ) : undefined,
          }}
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
          {displayRows.length === 0 ? (
            <tr><td colSpan={visibleCols.length + 3} className="text-center py-16 text-muted-foreground text-sm">
              {search || statusFilter !== "All" || filterCategory || filterBrand || filterStockStatus !== "all" || filterMinPrice || filterMaxPrice
                ? "No products match your current filters."
                : <span>No products yet. Click <strong>Add Product</strong> to get started.</span>}
            </td></tr>
          ) : displayRows.map((prod, ri) => {
            const isRowActive = activeCell?.id === prod.id;
            const isDragging  = dragId === prod.id;
            const isDragOver  = dragOverId === prod.id;
            return (
              <tr key={prod.id} data-testid={`row-product-${prod.id}`}
                draggable={!isFiltered && isAuthenticated && selectedIds.size === 0}
                onDragStart={() => handleDragStart(prod.id)}
                onDragOver={e => handleDragOver(e, prod.id)}
                onDrop={() => handleDrop(prod.id)}
                onDragEnd={handleDragEnd}
                className={`border-b border-gray-100 dark:border-border transition-colors group select-none
                  ${selectedIds.has(prod.id) ? "bg-indigo-50/60 dark:bg-indigo-950/20" : ""}
                  ${isDragging  ? "opacity-40 bg-blue-50 dark:bg-blue-950/20" : ""}
                  ${isDragOver  ? "border-t-2 border-t-blue-500 bg-blue-50/50 dark:bg-blue-950/10" : ""}
                  ${!isDragging && !isDragOver && !selectedIds.has(prod.id) ? (isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10") : ""}
                  hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>

                {/* Checkbox / drag handle */}
                <td className="border-r border-gray-100 dark:border-border w-8 text-center select-none" style={{ height: `${CELL_H}px` }}
                  onClick={e => { e.stopPropagation(); if (isAuthenticated) toggleSelect(prod.id); }}>
                  {isAuthenticated ? (
                    <div className="flex items-center justify-center h-full">
                      {selectedIds.has(prod.id) || selectedIds.size > 0 ? (
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer"
                          checked={selectedIds.has(prod.id)}
                          onChange={() => toggleSelect(prod.id)}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <div className={`cursor-grab active:cursor-grabbing text-gray-300 dark:text-zinc-700 group-hover:text-gray-400 dark:group-hover:text-zinc-500 transition-colors ${isFiltered ? "opacity-0" : ""}`}>
                          <GripVertical size={13} />
                        </div>
                      )}
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

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} product{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all <strong>{selectedIds.size} selected product{selectedIds.size !== 1 ? "s" : ""}</strong> from your catalogue.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete {selectedIds.size} Product{selectedIds.size !== 1 ? "s" : ""}
            </AlertDialogAction>
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
              {rawImportRows.length > 0 && !importing && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground hidden sm:inline font-medium">Mode:</span>
                  <div className="flex items-center gap-1 rounded-lg p-0.5 bg-gray-100 dark:bg-muted/60 border border-gray-200 dark:border-border text-[11px]">
                    <button
                      onClick={() => setImportMode("insert")}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-all active:scale-95 flex items-center gap-1.5
                        ${importMode === "insert"
                          ? "bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-600"
                          : "text-gray-500 dark:text-muted-foreground hover:bg-white dark:hover:bg-card hover:text-gray-800"}`}
                    >
                      {importMode === "insert" && <CheckCircle2 size={11} className="shrink-0" />}
                      Insert new only
                    </button>
                    <button
                      onClick={() => setImportMode("upsert")}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-all active:scale-95 flex items-center gap-1.5
                        ${importMode === "upsert"
                          ? "bg-blue-500 text-white shadow-sm ring-1 ring-blue-600"
                          : "text-gray-500 dark:text-muted-foreground hover:bg-white dark:hover:bg-card hover:text-gray-800"}`}
                    >
                      {importMode === "upsert" && <CheckCircle2 size={11} className="shrink-0" />}
                      <RefreshCw size={10} className="shrink-0" />Update existing too
                    </button>
                  </div>
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
              <p className="text-[11px] text-muted-foreground border border-dashed rounded-lg px-4 py-2.5 bg-muted/30 leading-relaxed max-w-md text-center">
                Key columns: <code className="font-mono">name</code> (required) ·{" "}
                <code className="font-mono">sku</code> · <code className="font-mono">category</code> ·{" "}
                <code className="font-mono">subcategory</code> · <code className="font-mono">brand</code> ·{" "}
                <code className="font-mono">retailPrice</code> · <code className="font-mono">status</code><br />
                All other columns optional. Headers are flexible — alternative names accepted.
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

              {/* ── Smart banner: SKU conflict hint when in insert mode ───────── */}
              {(() => {
                const skuConflictCount = importRows.filter(r => r._error?.includes("already used")).length;
                if (importMode === "insert" && skuConflictCount > 0) {
                  return (
                    <div className="mx-6 mt-3 mb-1 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[12px]">
                      <AlertCircle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-amber-800 dark:text-amber-300">
                          {skuConflictCount} SKU{skuConflictCount !== 1 ? "s" : ""} already exist in your product catalogue
                        </p>
                        <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                          In <strong>Insert new only</strong> mode these rows are skipped. Switch to{" "}
                          <button
                            onClick={() => setImportMode("upsert")}
                            className="underline font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                          >
                            Update existing too
                          </button>{" "}
                          to update those products with the data from your file.
                        </p>
                      </div>
                    </div>
                  );
                }
                if (importMode === "upsert") {
                  const updateRows = importRows.filter(r => !r._error && !!r._updateId).length;
                  if (updateRows > 0) {
                    return (
                      <div className="mx-6 mt-3 mb-1 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[12px]">
                        <RefreshCw size={14} className="text-blue-500 shrink-0" />
                        <p className="text-blue-700 dark:text-blue-300">
                          <strong>{updateRows} existing product{updateRows !== 1 ? "s" : ""}</strong> will be updated with data from this file.{" "}
                          New fields not in the file are left unchanged.
                        </p>
                      </div>
                    );
                  }
                }
                return null;
              })()}

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
                    {importRows.map(row => {
                      const rowResult = importRowResults.get(row._rowNum);
                      let rowBg = "";
                      if (row._error)             rowBg = "bg-red-50/60 dark:bg-red-950/20";
                      else if (rowResult === "created") rowBg = "bg-emerald-50/70 dark:bg-emerald-950/20";
                      else if (rowResult === "updated") rowBg = "bg-indigo-50/70 dark:bg-indigo-950/20";
                      else if (row._updateId)     rowBg = "bg-blue-50/40 dark:bg-blue-950/10";
                      else                        rowBg = "hover:bg-muted/20";

                      let statusTag: React.ReactNode;
                      if (row._error) {
                        statusTag = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-semibold border border-red-200 dark:border-red-800">
                            <AlertCircle size={9} /> Failed
                          </span>
                        );
                      } else if (rowResult === "created") {
                        statusTag = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow-sm">
                            <CheckCircle2 size={9} /> Imported
                          </span>
                        );
                      } else if (rowResult === "updated") {
                        statusTag = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold shadow-sm">
                            <RefreshCw size={9} /> Updated
                          </span>
                        );
                      } else if (row._updateId) {
                        statusTag = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-semibold border border-blue-200 dark:border-blue-800">
                            <RefreshCw size={9} /> Will Update
                          </span>
                        );
                      } else {
                        statusTag = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 size={9} /> New Detected
                          </span>
                        );
                      }

                      return (
                        <tr key={row._rowNum} className={`border-b transition-colors duration-150 ${rowBg}`}>
                          <td className="border-r px-3 py-1.5 text-muted-foreground font-mono">{row._rowNum}</td>
                          {CSV_HEADERS.map(h => (
                            <td key={h} className="border-r px-3 py-1.5 max-w-[180px] truncate" title={row[h]}>
                              {row[h] || <span className="text-muted-foreground/40">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-1.5 whitespace-nowrap">{statusTag}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Fragment>
          )}

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex flex-col gap-3 sm:flex-col">
            {/* ── Real-time progress panel ─────────────────────────────── */}
            {importProgress && (
              <div className="w-full space-y-2">
                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-muted/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-200"
                    style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
                  />
                </div>
                {/* Counters */}
                <div className="flex items-center gap-4 text-[12px] flex-wrap">
                  <span className="text-muted-foreground font-medium">
                    {importProgress.done} / {importProgress.total}
                  </span>
                  {importProgress.created > 0 && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 size={12} /> {importProgress.created} created
                    </span>
                  )}
                  {importProgress.updated > 0 && (
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                      <RefreshCw size={12} className={importing ? "animate-spin" : ""} /> {importProgress.updated} updated
                    </span>
                  )}
                  {importProgress.failed > 0 && (
                    <span className="flex items-center gap-1 text-red-500 dark:text-red-400 font-semibold">
                      <AlertCircle size={12} /> {importProgress.failed} skipped
                    </span>
                  )}
                  {importing && importProgress.done < importProgress.total && (
                    <span className="text-muted-foreground ml-auto">
                      {importProgress.total - importProgress.done} remaining…
                    </span>
                  )}
                  {!importing && importProgress.done >= importProgress.total && (
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold ml-auto">
                      <CheckCircle2 size={12} /> Done!
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Normal footer row ─────────────────────────────────────── */}
            <div className="flex items-center gap-2 justify-between w-full">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={downloadTemplate} disabled={importing}>
                <Download size={13} /> Download Template
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={resetImport} disabled={importing}>Cancel</Button>
                {rawImportRows.length > 0 && (() => {
                  const validCount = importRows.filter(r => !r._error).length;
                  const newCount   = importRows.filter(r => !r._error && !r._updateId).length;
                  const updCount   = importRows.filter(r => !r._error && !!r._updateId).length;
                  const label = [newCount > 0 && `${newCount} new`, updCount > 0 && `${updCount} update`].filter(Boolean).join(" + ");
                  return (
                    <Button size="sm" className="gap-1.5 min-w-[140px]" disabled={importing || validCount === 0} onClick={confirmImport}>
                      {importing ? (
                        <><RefreshCw size={13} className="animate-spin" /> Importing…</>
                      ) : (
                        <><Upload size={13} /> Import {label || `${validCount} product${validCount !== 1 ? "s" : ""}`}</>
                      )}
                    </Button>
                  );
                })()}
                {rawImportRows.length === 0 && (
                  <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={13} /> Choose file…
                  </Button>
                )}
              </div>
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
