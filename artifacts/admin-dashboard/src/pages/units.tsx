import { useState, useRef, useEffect, useCallback } from "react";
import { useUnits } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Unit } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Ruler, Plus, Search, X, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";

const COLS: ColDef[] = [
  { field: "name",        label: "Unit Name",   minW: 200, type: "text"     },
  { field: "symbol",      label: "Symbol",      minW: 120, type: "text"     },
  { field: "description", label: "Description", minW: 380, type: "text"     },
  { field: "createdAt",   label: "Created",     minW: 110, type: "readonly" },
];
const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

type EditableField = "name" | "symbol" | "description";

const BLANK = (): Record<EditableField, string> => ({ name: "", symbol: "", description: "" });

export default function UnitsPage() {
  const { units, addUnit, editUnit, removeUnit } = useUnits();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);

  const filtered = units
    .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.symbol.toLowerCase().includes(search.toLowerCase()))
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
    const unit = units.find(u => u.id === id);
    if (!unit || (unit as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editUnit(id, { [field]: value } as Partial<Unit>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [units, editUnit, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(u => u.id)];
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
    const rows = [NEW_ROW_ID, ...filtered.map(u => u.id)];
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
    if (!newRow?.name.trim()) { toast({ title: "Unit name is required", variant: "destructive" }); setNewRowActive(0); return; }
    addUnit({ name: newRow.name, symbol: newRow.symbol, description: newRow.description });
    toast({ title: "Unit added", description: `"${newRow.name}" created.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const unit = units.find(u => u.id === deleteId);
    removeUnit(deleteId);
    toast({ title: "Unit deleted", description: `"${unit?.name}" removed.` });
    setDeleteId(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Units of Measurement</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Define measurement units (kg, pcs, m²) used across your product catalogue</p>
        </div>
        {can("Add Units") && (
          <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5" data-testid="btn-add-unit">
            <Plus size={14} /> Add Unit
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground border-b border-border pb-3">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Ruler size={15} className="text-primary" />
          {units.length} {units.length === 1 ? "unit" : "units"} defined
        </span>
        {units.length > 0 && (
          <span className="text-[12px]">
            e.g. {units.slice(0, 4).map(u => u.symbol || u.name).join(", ")}{units.length > 4 ? "…" : ""}
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search units..." className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {can("Add Units") && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {units.length}</div>
      </div>

      {/* Excel grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* New row */}
          {can("Add Units") && newRow && (
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
                    {isA ? (
                      <input autoFocus type="text" value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 2 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
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
              {search ? "No units match your search." : "No units yet. Add kg, pcs, m², litres — whatever your products are measured in."}
            </td></tr>
          ) : filtered.map((unit, ri) => {
            const isRowActive = activeCell?.id === unit.id;
            return (
              <tr key={unit.id} data-testid={`row-unit-${unit.id}`}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === unit.id && activeCell.col === ci;
                  const rawVal = c.field === "createdAt"
                    ? format(new Date(unit.createdAt), "d MMM yyyy")
                    : String((unit as unknown as Record<string, string>)[c.field] ?? "");
                  const canEditCol = c.type !== "readonly";
                  return (
                    <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : canEditCol && can("Edit Units") ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && can("Edit Units") && canEditCol && setActiveCell({ id: unit.id, col: ci })}>
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={can("Edit Units") && canEditCol}
                        onActivate={() => setActiveCell({ id: unit.id, col: ci })}
                        onCommit={v => commitCell(unit.id, c.field as EditableField, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={s => navigateCell(unit.id, ci, s)}
                        onEnter={() => moveCellDown(unit.id, ci)}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: `${CELL_H}px` }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {can("Delete Units") && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete"
                        onClick={() => setDeleteId(unit.id)} data-testid={`btn-delete-unit-${unit.id}`}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Add row */}
          {can("Add Units") && !newRow && (
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
            <AlertDialogTitle>Delete this unit?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the unit and cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete-unit">Delete Unit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
