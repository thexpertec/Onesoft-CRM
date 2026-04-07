import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useInvestmentPlans, useProducts, useProductCategories } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { InvestmentPlan, InvestmentType } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Plus, Trash2, X, Save, TrendingUp,
  Lock, ArrowUpCircle, ArrowDownCircle, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_BG } from "@/components/editable-cell";

type EditableField =
  | "title"
  | "investmentOn"
  | "product"
  | "business"
  | "specificProductGroups"
  | "timeDuration"
  | "lockForSpecificTime"
  | "profitMarginWithLoss"
  | "profitMarginWithoutLoss"
  | "maxProfit"
  | "maxLoss";

const INVESTMENT_TYPES: InvestmentType[] = ["Product", "Business", "Product Groups"];
const LOCK_OPTIONS = ["Yes", "No"];

const INVESTMENT_TYPE_COLORS: Record<string, string> = {
  Product:          "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  Business:         "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "Product Groups": "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
};

const BLANK = (): Record<EditableField, string> => ({
  title: "",
  investmentOn: "Product",
  product: "",
  business: "",
  specificProductGroups: "",
  timeDuration: "",
  lockForSpecificTime: "No",
  profitMarginWithLoss: "",
  profitMarginWithoutLoss: "",
  maxProfit: "",
  maxLoss: "",
});

const COLS: ColDef[] = [
  { field: "title",                   label: "Plan Title",          minW: 200, type: "text"   },
  { field: "investmentOn",            label: "Investment On",       minW: 160, type: "select",
    options: INVESTMENT_TYPES, optionColors: INVESTMENT_TYPE_COLORS },
  { field: "product",                 label: "Product",             minW: 160, type: "text"   },
  { field: "business",                label: "Business",            minW: 160, type: "text"   },
  { field: "specificProductGroups",   label: "Product Groups",      minW: 170, type: "text"   },
  { field: "timeDuration",            label: "Duration",            minW: 130, type: "text"   },
  { field: "lockForSpecificTime",     label: "Locked Period",       minW: 130, type: "select",
    options: LOCK_OPTIONS },
  { field: "profitMarginWithLoss",    label: "Margin w/ Loss (%)",  minW: 160, type: "text"   },
  { field: "profitMarginWithoutLoss", label: "Margin w/o Loss (%)", minW: 170, type: "text"   },
  { field: "maxProfit",               label: "Max Profit",          minW: 130, type: "text"   },
  { field: "maxLoss",                 label: "Max Loss",            minW: 130, type: "text"   },
];

const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

const EXAMPLE_PLANS: Array<Omit<InvestmentPlan, "id" | "createdAt" | "updatedAt">> = [
  {
    title: "Smartphone Launch Plan",
    investmentOn: "Product",
    product: "Samsung Galaxy S25",
    business: "",
    specificProductGroups: "",
    timeDuration: "12 Months",
    lockForSpecificTime: "Yes",
    profitMarginWithLoss: "18",
    profitMarginWithoutLoss: "25",
    maxProfit: "50000",
    maxLoss: "10000",
  },
  {
    title: "Tech Startup Growth Plan",
    investmentOn: "Business",
    product: "",
    business: "Onesoft Technologies",
    specificProductGroups: "",
    timeDuration: "24 Months",
    lockForSpecificTime: "Yes",
    profitMarginWithLoss: "22",
    profitMarginWithoutLoss: "35",
    maxProfit: "200000",
    maxLoss: "30000",
  },
  {
    title: "Smart Devices Portfolio",
    investmentOn: "Product Groups",
    product: "",
    business: "",
    specificProductGroups: "Smart Devices",
    timeDuration: "18 Months",
    lockForSpecificTime: "No",
    profitMarginWithLoss: "15",
    profitMarginWithoutLoss: "28",
    maxProfit: "120000",
    maxLoss: "20000",
  },
];

const NEW_ROW_ID = "__new__";

// ─── Contextual select cell (dropdown from a list) ───────────────────────────
function ContextSelect({
  value, options, placeholder, active, canEdit,
  onActivate, onCommit, onCancel, onTab,
}: {
  value: string;
  options: string[];
  placeholder: string;
  active: boolean;
  canEdit: boolean;
  onActivate: () => void;
  onCommit: (v: string) => void;
  onCancel: () => void;
  onTab: (shift: boolean) => void;
}) {
  if (!canEdit) {
    return (
      <div className="w-full h-full flex items-center px-3">
        <span className="truncate text-[13px]">{value || <span className="text-muted-foreground/40">—</span>}</span>
      </div>
    );
  }
  if (active) {
    return (
      <select
        autoFocus
        value={value}
        onChange={e => onCommit(e.target.value)}
        onBlur={() => onCancel()}
        onKeyDown={e => {
          if (e.key === "Tab")    { e.preventDefault(); onTab(e.shiftKey); }
          if (e.key === "Escape") { onCancel(); }
          if (e.key === "Enter")  { onCommit((e.target as HTMLSelectElement).value); }
        }}
        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-white dark:bg-card border-0 outline-none dark:text-foreground cursor-pointer"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <div
      className="w-full h-full flex items-center justify-between px-3 cursor-pointer group/sel"
      onClick={onActivate}
    >
      <span className={`truncate text-[13px] ${!value ? "text-muted-foreground/40" : ""}`}>
        {value || `Select ${placeholder}`}
      </span>
      <ChevronDown size={11} className="text-muted-foreground/50 flex-shrink-0 opacity-0 group-hover/sel:opacity-100" />
    </div>
  );
}

// ─── Dimmed / locked cell (not applicable for this investmentOn type) ─────────
function DimmedCell() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <span className="text-gray-200 dark:text-gray-700 text-[18px] select-none">—</span>
    </div>
  );
}

// ─── Which sub-field is active for a given investmentOn? ─────────────────────
function activeFieldFor(investmentOn: string): string {
  if (investmentOn === "Product")        return "product";
  if (investmentOn === "Business")       return "business";
  if (investmentOn === "Product Groups") return "specificProductGroups";
  return "";
}

export default function InvestmentPlansPage() {
  const { plans, addPlan, editPlan, removePlan } = useInvestmentPlans();
  const { products }    = useProducts();
  const { categories }  = useProductCategories();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const productOptions  = useMemo(() => [...new Set(products.map(p => p.name).filter(Boolean))].sort(), [products]);
  const categoryOptions = useMemo(() => [...new Set(categories.map(c => c.name).filter(Boolean))].sort(), [categories]);

  const [search,        setSearch]        = useState("");
  const [filterType,    setFilterType]    = useState<"All" | InvestmentType>("All");
  const [activeCell,    setActiveCell]    = useState<{ id: string; col: number } | null>(null);
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [newRow,        setNewRow]        = useState<Record<EditableField, string> | null>(null);
  const [newRowActive,  setNewRowActive]  = useState<number | null>(null);
  const [exampleLoaded, setExampleLoaded] = useState(false);

  const loadExamples = () => {
    // Remove all existing plans first, then add fresh examples
    const currentIds = plans.map(p => p.id);
    currentIds.forEach(id => removePlan(id));
    EXAMPLE_PLANS.forEach(p => addPlan(p));
    setExampleLoaded(true);
    toast({ title: "3 example plans loaded", description: "Smartphone, Tech Startup, Smart Devices." });
  };

  const filtered = useMemo(() => plans
    .filter(p => filterType === "All" || p.investmentOn === filterType)
    .filter(p => !search || [p.title, p.investmentOn, p.product, p.business, p.specificProductGroups, p.timeDuration]
      .some(v => v?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  [plans, search, filterType]);

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const p = plans.find(pl => pl.id === id);
    if (!p) { setActiveCell(null); return; }
    const patch: Partial<InvestmentPlan> = { [field]: value };
    // When investmentOn changes, clear the three sub-fields
    if (field === "investmentOn") {
      patch.product               = "";
      patch.business              = "";
      patch.specificProductGroups = "";
    }
    editPlan(id, patch);
    // After switching investmentOn, auto-activate the relevant context cell
    if (field === "investmentOn") {
      const contextField = activeFieldFor(value);
      const ci = COLS.findIndex(c => c.field === contextField);
      toast({ title: "Saved" });
      if (ci >= 0) {
        setTimeout(() => setActiveCell({ id, col: ci }), 30);
        return;
      }
    }
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [plans, editPlan, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(p => p.id)];
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    setActiveCell({ id: rows[nr], col: nc });
  }, [filtered]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = filtered.map(p => p.id);
    const ri = rows.indexOf(id);
    if (ri + 1 < rows.length) setActiveCell({ id: rows[ri + 1], col });
  }, [filtered]);

  const navigateNewRow = (ci: number, shift: boolean) => {
    let nc = ci + (shift ? -1 : 1);
    if (nc >= COLS.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  // After changing investmentOn in the new row: clear the three context fields
  // and jump focus to the relevant context field.
  const handleNewRowInvestmentChange = (v: string) => {
    const contextField = activeFieldFor(v);
    const ci = COLS.findIndex(c => c.field === contextField);
    setNewRow(r => r ? {
      ...r,
      investmentOn:          v,
      product:               "",
      business:              "",
      specificProductGroups: "",
    } : r);
    // Jump to the relevant context column (or next generic column if not found)
    setNewRowActive(ci >= 0 ? ci : 3);
  };

  const commitNewRow = () => {
    if (!newRow?.title.trim()) {
      toast({ title: "Plan title is required", variant: "destructive" });
      setNewRowActive(0);
      return;
    }
    addPlan({
      title:                  newRow.title,
      investmentOn:           (newRow.investmentOn as InvestmentType) || "Product",
      product:                newRow.product,
      business:               newRow.business,
      specificProductGroups:  newRow.specificProductGroups,
      timeDuration:           newRow.timeDuration,
      lockForSpecificTime:    newRow.lockForSpecificTime as "Yes" | "No",
      profitMarginWithLoss:   newRow.profitMarginWithLoss,
      profitMarginWithoutLoss: newRow.profitMarginWithoutLoss,
      maxProfit:              newRow.maxProfit,
      maxLoss:                newRow.maxLoss,
    });
    toast({ title: "Investment plan created", description: `"${newRow.title}" added.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const p = plans.find(pl => pl.id === deleteId);
    removePlan(deleteId);
    toast({ title: "Plan deleted", description: `"${p?.title}" removed.` });
    setDeleteId(null);
  };

  const pills = [
    { label: "All",            filter: "All",            count: plans.length,                                              color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                   ring: "ring-gray-400" },
    { label: "Product",        filter: "Product",        count: plans.filter(p => p.investmentOn === "Product").length,        color: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",               ring: "ring-blue-500" },
    { label: "Business",       filter: "Business",       count: plans.filter(p => p.investmentOn === "Business").length,       color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",   ring: "ring-emerald-500" },
    { label: "Product Groups", filter: "Product Groups", count: plans.filter(p => p.investmentOn === "Product Groups").length, color: "bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300",       ring: "ring-violet-500" },
  ] as const;

  // ── Contextual options for a given investmentOn and field ──────────────────
  const contextOptions = (investmentOn: string, field: string) => {
    if (field === "product"               && investmentOn === "Product")        return productOptions;
    if (field === "specificProductGroups" && investmentOn === "Product Groups") return categoryOptions;
    return null; // text or dimmed
  };

  // ── Is this field relevant for the chosen investmentOn? ───────────────────
  const isContextField = (field: string) =>
    field === "product" || field === "business" || field === "specificProductGroups";

  const isRelevantField = (field: string, investmentOn: string) =>
    activeFieldFor(investmentOn) === field;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp size={22} className="text-emerald-500" /> Investment Plans
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Enter to save · Esc to cancel</p>
        </div>
        {isAuthenticated && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={loadExamples} className="gap-1.5 h-8 text-[13px] border-dashed" data-testid="btn-load-examples">
              {plans.length > 0 ? "Reset Examples" : "Load Examples"}
            </Button>
            <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5 h-8 text-[13px]" data-testid="btn-add-plan">
              <Plus size={14} /> Add Plan
            </Button>
          </div>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {pills.map(k => {
          const isActive = filterType === k.filter;
          return (
            <button key={k.filter} onClick={() => setFilterType(k.filter as typeof filterType)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${k.color} ${isActive ? `ring-2 ${k.ring}` : "opacity-80 hover:opacity-100"}`}>
              {k.label}: <span className="font-bold">{k.count}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search plans…" className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {search && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-[12px]" onClick={() => setSearch("")}>
            <X size={12} /> Clear
          </Button>
        )}
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {plans.length}</div>
      </div>

      {/* Grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* ── New row ──────────────────────────────────────────────────── */}
          {isAuthenticated && newRow && (() => {
            const investOn = newRow.investmentOn || "Product";
            return (
              <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
                <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: `${CELL_H}px` }}>★</td>
                {COLS.map((c, ci) => {
                  const isA   = newRowActive === ci;
                  const val   = newRow[c.field as EditableField] ?? "";
                  const opts  = contextOptions(investOn, c.field);
                  const dimmed = isContextField(c.field) && !isRelevantField(c.field, investOn);

                  return (
                    <td key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${
                        dimmed
                          ? "bg-gray-50/60 dark:bg-muted/20"
                          : isA
                            ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10"
                            : "hover:bg-amber-50 dark:hover:bg-amber-950/40"
                      }`}
                      style={{ height: `${CELL_H}px` }}>

                      {dimmed ? (
                        <DimmedCell />
                      ) : isA && (c.type === "select" || opts) ? (
                        /* Select / contextual dropdown */
                        <select autoFocus value={val}
                          onChange={e => {
                            const v = e.target.value;
                            if (c.field === "investmentOn") {
                              handleNewRowInvestmentChange(v);
                            } else {
                              setNewRow(r => r ? { ...r, [c.field]: v } : r);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === "Tab")    { e.preventDefault(); navigateNewRow(ci, e.shiftKey); }
                            if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); }
                          }}
                          className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground">
                          {!c.options && opts && <option value="">Select…</option>}
                          {(c.options || opts || []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : isA ? (
                        /* Text input */
                        <input autoFocus type="text" value={val} placeholder={c.label}
                          onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                          onKeyDown={e => {
                            if (e.key === "Tab")   { e.preventDefault(); navigateNewRow(ci, e.shiftKey); }
                            if (e.key === "Enter")  { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); }
                            if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); }
                          }}
                          className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300"
                        />
                      ) : opts ? (
                        /* Inactive contextual dropdown */
                        <div className="w-full h-full flex items-center justify-between px-3 cursor-pointer" onClick={() => setNewRowActive(ci)}>
                          <span className={`truncate text-[13px] ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || `Select…`}</span>
                          <ChevronDown size={11} className="text-muted-foreground/40 flex-shrink-0" />
                        </div>
                      ) : (
                        /* Inactive text cell */
                        <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                          <span className={`truncate text-[13px] ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
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
            );
          })()}

          {/* ── Existing rows ─────────────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
                {search || filterType !== "All"
                  ? "No plans match your current filter."
                  : (
                    <div className="flex flex-col items-center gap-2">
                      <TrendingUp size={32} className="text-muted-foreground/30" />
                      <span>No investment plans yet. Click <strong>Add Plan</strong> or <strong>Load Examples</strong> to get started.</span>
                    </div>
                  )}
              </td>
            </tr>
          ) : filtered.map((plan, ri) => {
            const isRowActive  = activeCell?.id === plan.id;
            const investOn     = plan.investmentOn || "Product";

            return (
              <tr key={plan.id} data-testid={`row-plan-${plan.id}`}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>

                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>

                {COLS.map((c, ci) => {
                  const isA      = activeCell?.id === plan.id && activeCell.col === ci;
                  const rawVal   = String((plan as unknown as Record<string, string>)[c.field] ?? "");
                  const opts     = contextOptions(investOn, c.field);
                  const dimmed   = isContextField(c.field) && !isRelevantField(c.field, investOn);

                  const isLockCol   = c.field === "lockForSpecificTime";
                  const isProfitCol = c.field === "profitMarginWithLoss" || c.field === "profitMarginWithoutLoss" || c.field === "maxProfit";
                  const isLossCol   = c.field === "maxLoss";

                  return (
                    <td key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${
                        dimmed
                          ? "bg-gray-50/40 dark:bg-muted/10"
                          : isA
                            ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10"
                            : isAuthenticated
                              ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                              : ""
                      }`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !dimmed && !isA && isAuthenticated && setActiveCell({ id: plan.id, col: ci })}>

                      {/* Dimmed cell */}
                      {dimmed ? (
                        <DimmedCell />

                      /* Lock column display */
                      ) : !isA && isLockCol ? (
                        <div className="w-full h-full flex items-center px-3 gap-1.5">
                          <Lock size={11} className={rawVal === "Yes" ? "text-amber-500" : "text-gray-300"} />
                          <span className={`text-[12px] ${rawVal === "Yes" ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>{rawVal}</span>
                        </div>

                      /* Profit columns display */
                      ) : !isA && isProfitCol && rawVal ? (
                        <div className="w-full h-full flex items-center px-3 gap-1">
                          <ArrowUpCircle size={11} className="text-emerald-500 flex-shrink-0" />
                          <span className="text-[12px] text-emerald-700 dark:text-emerald-400 font-medium truncate">{rawVal}{c.field !== "maxProfit" ? "%" : ""}</span>
                        </div>

                      /* Loss column display */
                      ) : !isA && isLossCol && rawVal ? (
                        <div className="w-full h-full flex items-center px-3 gap-1">
                          <ArrowDownCircle size={11} className="text-red-400 flex-shrink-0" />
                          <span className="text-[12px] text-red-600 dark:text-red-400 font-medium truncate">{rawVal}</span>
                        </div>

                      /* Contextual dropdown (Product / Product Groups) */
                      ) : opts ? (
                        <ContextSelect
                          value={rawVal}
                          options={opts}
                          placeholder={c.label}
                          active={isA}
                          canEdit={isAuthenticated}
                          onActivate={() => setActiveCell({ id: plan.id, col: ci })}
                          onCommit={v => commitCell(plan.id, c.field as EditableField, v)}
                          onCancel={() => setActiveCell(null)}
                          onTab={sh => navigateCell(plan.id, ci, sh)}
                        />

                      /* Default editable / display cell */
                      ) : (
                        <EditableCell
                          value={rawVal} col={c} active={isA} canEdit={isAuthenticated}
                          onActivate={() => setActiveCell({ id: plan.id, col: ci })}
                          onCommit={v => commitCell(plan.id, c.field as EditableField, v)}
                          onCancel={() => setActiveCell(null)}
                          onTab={sh => navigateCell(plan.id, ci, sh)}
                          onEnter={() => moveCellDown(plan.id, ci)}
                        />
                      )}
                    </td>
                  );
                })}

                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px`, width: 56 }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 h-full px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isAuthenticated && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete"
                        onClick={() => setDeleteId(plan.id)} data-testid={`btn-delete-plan-${plan.id}`}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </ExcelGridShell>
      </div>

      {/* Summary cards */}
      {plans.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {[
            { label: "Total Plans",    value: plans.length,                                               icon: TrendingUp,    color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Locked Periods", value: plans.filter(p => p.lockForSpecificTime === "Yes").length,  icon: Lock,          color: "text-amber-500",   bg: "bg-amber-50 dark:bg-amber-950/30" },
            { label: "Avg Max Profit", value: (() => { const v = plans.map(p => parseFloat(p.maxProfit) || 0); return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length).toLocaleString() : "—"; })(), icon: ArrowUpCircle,   color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Avg Max Loss",   value: (() => { const v = plans.map(p => parseFloat(p.maxLoss)   || 0); return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length).toLocaleString() : "—"; })(), icon: ArrowDownCircle, color: "text-red-500",     bg: "bg-red-50 dark:bg-red-950/30" },
          ].map(card => (
            <div key={card.label} className={`rounded-lg p-3.5 ${card.bg} flex items-center gap-3`}>
              <card.icon size={20} className={`${card.color} flex-shrink-0`} />
              <div>
                <p className="text-[11px] text-muted-foreground">{card.label}</p>
                <p className="text-lg font-bold">{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Investment Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{plans.find(p => p.id === deleteId)?.title}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
