import { useState, useRef, useEffect, useCallback } from "react";
import { useAttributes } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Attribute } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { SlidersHorizontal, Plus, Search, X, Save, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";

const COLS: ColDef[] = [
  { field: "name",        label: "Attribute Name", minW: 200, type: "text"   },
  { field: "type",        label: "Type",           minW: 140, type: "select",
    options: ["text", "number", "boolean", "select"],
    optionColors: {
      text:    "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
      number:  "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300",
      boolean: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
      select:  "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
    }
  },
  { field: "values",      label: "Values",         minW: 280, type: "text"    },
  { field: "description", label: "Description",    minW: 300, type: "text"    },
  { field: "createdAt",   label: "Created",        minW: 110, type: "readonly" },
];
const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

type EditableField = "name" | "type" | "values" | "description";

const BLANK = (): Record<EditableField, string> => ({ name: "", type: "text", values: "", description: "" });

export default function AttributesPage() {
  const { attributes, addAttribute, editAttribute, removeAttribute } = useAttributes();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);

  const filtered = attributes
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.type.toLowerCase().includes(search.toLowerCase()))
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
    const attr = attributes.find(a => a.id === id);
    if (!attr || (attr as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editAttribute(id, { [field]: value } as Partial<Attribute>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [attributes, editAttribute, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(a => a.id)];
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
    const rows = [NEW_ROW_ID, ...filtered.map(a => a.id)];
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
    if (!newRow?.name.trim()) { toast({ title: "Attribute name is required", variant: "destructive" }); setNewRowActive(0); return; }
    addAttribute({ name: newRow.name, type: (newRow.type as Attribute["type"]) || "text", values: newRow.values, description: newRow.description });
    toast({ title: "Attribute added", description: `"${newRow.name}" created.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const attr = attributes.find(a => a.id === deleteId);
    removeAttribute(deleteId);
    toast({ title: "Attribute deleted", description: `"${attr?.name}" removed.` });
    setDeleteId(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Attributes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Define properties like Size, Colour, Material — use the <strong>Values</strong> column for comma-separated options (e.g. S, M, L, XL)</p>
        </div>
        {can("Add Attributes") && (
          <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5" data-testid="btn-add-attribute">
            <Plus size={14} /> Add Attribute
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground border-b border-border pb-3 flex-wrap">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <SlidersHorizontal size={15} className="text-primary" />
          {attributes.length} {attributes.length === 1 ? "attribute" : "attributes"} defined
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          <strong>{attributes.filter(a => a.active !== false).length}</strong> active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
          <strong>{attributes.filter(a => a.active === false).length}</strong> inactive
        </span>
        {["text", "number", "boolean", "select"].map(t => {
          const count = attributes.filter(a => a.type === t).length;
          if (count === 0) return null;
          return <span key={t} className="flex items-center gap-1">{t}: <strong>{count}</strong></span>;
        })}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search attributes..." className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {can("Add Attributes") && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {attributes.length}</div>
      </div>

      {/* Excel grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* New row */}
          {can("Add Attributes") && newRow && (
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
                    {isA && c.type === "select" ? (
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
              {search ? "No attributes match your search." : "No attributes yet. Click Add Attribute to define product properties like Size, Colour, or Material."}
            </td></tr>
          ) : filtered.map((attr, ri) => {
            const isRowActive = activeCell?.id === attr.id;
            const isEnabled = attr.active !== false;
            return (
              <tr key={attr.id} data-testid={`row-attribute-${attr.id}`}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${
                  isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10"
                  : !isEnabled ? "bg-gray-50 dark:bg-muted/5 opacity-60"
                  : ri % 2 === 0 ? "bg-white dark:bg-card"
                  : "bg-gray-50/50 dark:bg-muted/10"
                } hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === attr.id && activeCell.col === ci;
                  const rawVal = c.field === "createdAt"
                    ? format(new Date(attr.createdAt), "d MMM yyyy")
                    : String((attr as unknown as Record<string, string>)[c.field] ?? "");
                  const canEditCol = c.type !== "readonly";
                  return (
                    <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : canEditCol && can("Edit Attributes") ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && can("Edit Attributes") && canEditCol && setActiveCell({ id: attr.id, col: ci })}>
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={can("Edit Attributes") && canEditCol}
                        onActivate={() => setActiveCell({ id: attr.id, col: ci })}
                        onCommit={v => commitCell(attr.id, c.field as EditableField, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={s => navigateCell(attr.id, ci, s)}
                        onEnter={() => moveCellDown(attr.id, ci)}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center px-2" style={{ height: `${CELL_H}px`, minWidth: 100 }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1.5">
                    {/* Active/Inactive toggle — always visible */}
                    <button
                      onClick={() => editAttribute(attr.id, { active: !isEnabled })}
                      title={isEnabled ? "Click to deactivate" : "Click to activate"}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                        isEnabled
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700"
                      }`}>
                      {isEnabled
                        ? <><ToggleRight size={11} /> Active</>
                        : <><ToggleLeft size={11} /> Inactive</>
                      }
                    </button>
                    {/* Delete — hover only */}
                    {can("Delete Attributes") && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100" title="Delete"
                        onClick={() => setDeleteId(attr.id)} data-testid={`btn-delete-attribute-${attr.id}`}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Add row */}
          {can("Add Attributes") && !newRow && (
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
            <AlertDialogTitle>Delete this attribute?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the attribute and cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete-attribute">Delete Attribute</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
