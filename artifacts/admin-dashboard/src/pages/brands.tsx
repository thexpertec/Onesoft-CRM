import { useState, useRef, useEffect, useCallback } from "react";
import { useBrands } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Brand } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Bookmark, Plus, Search, X, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG, PRESET_COLORS } from "@/components/editable-cell";

const COLS: ColDef[] = [
  { field: "color",       label: "Colour",      minW: 130, type: "color"   },
  { field: "name",        label: "Brand Name",  minW: 200, type: "text"    },
  { field: "website",     label: "Website",     minW: 200, type: "text"    },
  { field: "description", label: "Description", minW: 300, type: "text"    },
  { field: "status",      label: "Status",      minW: 120, type: "select",
    options: ["Active", "Inactive"],
    optionColors: {
      Active:   "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
      Inactive: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    }
  },
  { field: "createdAt",   label: "Created",     minW: 110, type: "readonly" },
];
const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

type EditableField = "color" | "name" | "website" | "description" | "status";

const BLANK = (): Record<EditableField, string> => ({
  color: "#3b82f6", name: "", website: "", description: "", status: "Active",
});

export default function BrandsPage() {
  const { brands, addBrand, editBrand, removeBrand } = useBrands();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);

  const filtered = brands
    .filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.website?.toLowerCase().includes(search.toLowerCase()))
    .filter(b => statusFilter === "All" || b.status === statusFilter)
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
    const brand = brands.find(b => b.id === id);
    if (!brand || (brand as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editBrand(id, { [field]: value } as Partial<Brand>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [brands, editBrand, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(b => b.id)];
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(nc); }
    else { setActiveCell({ id: nid, col: nc }); setNewRowActive(null); }
  }, [filtered]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = [NEW_ROW_ID, ...filtered.map(b => b.id)];
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
    if (!newRow?.name.trim()) { toast({ title: "Brand name is required", variant: "destructive" }); setNewRowActive(1); return; }
    addBrand({ name: newRow.name, color: newRow.color || "#3b82f6", website: newRow.website, description: newRow.description, status: (newRow.status as Brand["status"]) || "Active" });
    toast({ title: "Brand added", description: `"${newRow.name}" created.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const brand = brands.find(b => b.id === deleteId);
    removeBrand(deleteId);
    toast({ title: "Brand deleted", description: `"${brand?.name}" removed.` });
    setDeleteId(null);
  };

  const pills = [
    { label: "Total",    value: brands.length,                                    filter: "All",      color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                        activeRing: "ring-gray-400 dark:ring-gray-500"    },
    { label: "Active",   value: brands.filter(b => b.status === "Active").length,   filter: "Active",   color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",          activeRing: "ring-emerald-500 dark:ring-emerald-400" },
    { label: "Inactive", value: brands.filter(b => b.status === "Inactive").length, filter: "Inactive", color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",                  activeRing: "ring-amber-400 dark:ring-amber-500"  },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brands</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Enter to save · Esc to cancel</p>
        </div>
        {can("Add Brands") && (
          <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(1); }} className="gap-1.5" data-testid="btn-add-brand">
            <Plus size={14} /> Add Brand
          </Button>
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
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
          <Bookmark size={11} /> {brands.length} {brands.length === 1 ? "brand" : "brands"} total
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search brands..." className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {can("Add Brands") && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {brands.length}</div>
      </div>

      {/* Excel grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* New row */}
          {can("Add Brands") && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: `${CELL_H}px` }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = c.type === "readonly" ? "" : newRow[c.field as EditableField];
                if (c.type === "readonly") {
                  return (
                    <td key={c.field} className="border-r border-gray-100 dark:border-border relative p-0" style={{ height: `${CELL_H}px` }}>
                      <div className="w-full h-full flex items-center px-3 text-[12px] text-muted-foreground">—</div>
                    </td>
                  );
                }
                return (
                  <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`} style={{ height: `${CELL_H}px` }}>
                    {isA && c.type === "color" ? (
                      <div className="w-full h-full flex items-center px-2 gap-1 flex-wrap overflow-hidden">
                        {PRESET_COLORS.map(pc => (
                          <button key={pc.hex} type="button" title={pc.label}
                            onClick={() => { setNewRow(r => r ? { ...r, color: pc.hex } : r); navigateNewRow(ci, false); }}
                            className={`w-4 h-4 rounded-full border-2 transition-all ${newRow.color === pc.hex ? "border-gray-700 dark:border-gray-300 scale-110" : "border-transparent"}`}
                            style={{ backgroundColor: pc.hex }} />
                        ))}
                      </div>
                    ) : isA && c.type === "select" ? (
                      <select autoFocus value={val}
                        onChange={e => { setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r); }}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground">
                        {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : isA ? (
                      <input autoFocus type="text" value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 2 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                        {c.field === "color" ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full ring-1 ring-black/10 flex-shrink-0" style={{ backgroundColor: newRow.color }} />
                            <span className="text-[12px] text-muted-foreground">{PRESET_COLORS.find(p => p.hex === newRow.color)?.label ?? newRow.color}</span>
                          </span>
                        ) : (
                          <span className={`truncate ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                        )}
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
              {search ? "No brands match your search." : "No brands yet. Click Add Brand to get started."}
            </td></tr>
          ) : filtered.map((brand, ri) => {
            const isRowActive = activeCell?.id === brand.id;
            return (
              <tr key={brand.id} data-testid={`row-brand-${brand.id}`}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === brand.id && activeCell.col === ci;
                  const rawVal = c.field === "createdAt"
                    ? format(new Date(brand.createdAt), "d MMM yyyy")
                    : String((brand as unknown as Record<string, string>)[c.field] ?? "");
                  const canEditCol = c.type !== "readonly";
                  return (
                    <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : canEditCol && can("Edit Brands") ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && can("Edit Brands") && canEditCol && setActiveCell({ id: brand.id, col: ci })}>
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={can("Edit Brands") && canEditCol}
                        onActivate={() => setActiveCell({ id: brand.id, col: ci })}
                        onCommit={v => commitCell(brand.id, c.field as EditableField, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={s => navigateCell(brand.id, ci, s)}
                        onEnter={() => moveCellDown(brand.id, ci)}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: `${CELL_H}px` }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {can("Delete Brands") && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete"
                        onClick={() => setDeleteId(brand.id)} data-testid={`btn-delete-brand-${brand.id}`}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Add row */}
          {can("Add Brands") && !newRow && (
            <tr><td colSpan={COLS.length + 2}>
              <button onClick={() => { setNewRow(BLANK()); setNewRowActive(1); }}
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
            <AlertDialogTitle>Delete this brand?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the brand and cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete-brand">Delete Brand</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
