import { useState, useRef, useEffect, useCallback } from "react";
import { useProductCategories } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { ProductCategory } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tag, Plus, FolderOpen, Search, Trash2, ChevronRight, ChevronDown, CornerDownRight, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PRESET_COLORS } from "@/components/editable-cell";

const CELL_H = 36;

type EditableField = "color" | "name" | "description";
const BLANK = (parentId?: string): Record<EditableField, string> & { parentId?: string } =>
  ({ color: "#3b82f6", name: "", description: "", parentId });

// ─── Inline editable cell ──────────────────────────────────────────────────────
function InlineCell({
  value, field, active, placeholder, onActivate, onChange, onKeyDown, canEdit,
}: {
  value: string; field: EditableField; active: boolean; placeholder?: string;
  onActivate: () => void; onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void; canEdit: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (active) inputRef.current?.focus(); }, [active]);

  if (field === "color") {
    return (
      <div className="w-full h-full flex items-center px-2" onClick={canEdit ? onActivate : undefined}>
        {active ? (
          <div className="flex items-center gap-1 flex-wrap" onKeyDown={onKeyDown} tabIndex={-1}>
            {PRESET_COLORS.map(pc => (
              <button key={pc.hex} type="button" title={pc.label}
                onClick={() => onChange(pc.hex)}
                className={`w-4 h-4 rounded-full border-2 transition-all flex-shrink-0 ${value === pc.hex ? "border-gray-700 dark:border-gray-300 scale-110" : "border-transparent hover:border-gray-400"}`}
                style={{ backgroundColor: pc.hex }} />
            ))}
          </div>
        ) : (
          <span className="flex items-center gap-2 cursor-pointer">
            <span className="w-4 h-4 rounded-full ring-1 ring-black/10 flex-shrink-0" style={{ backgroundColor: value || "#3b82f6" }} />
            <span className="text-[11px] text-muted-foreground">{PRESET_COLORS.find(p => p.hex === value)?.label ?? value}</span>
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="relative w-full h-full flex items-center" onClick={!active && canEdit ? onActivate : undefined}>
      {active ? (
        <input ref={inputRef} type="text" value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="absolute inset-0 w-full h-full px-3 text-[12px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
      ) : (
        <span className={`px-3 text-[12px] truncate ${value ? "text-foreground" : "text-muted-foreground/40"}`}>{value || placeholder}</span>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const { categories, addCategory, editCategory, removeCategory } = useProductCategories();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [expandedIds,  setExpandedIds]  = useState<Set<string>>(new Set());
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [deleteName,   setDeleteName]   = useState("");
  const [deleteHasSubs, setDeleteHasSubs] = useState(false);

  // Inline new row state — shared for parent & sub
  type NewRow = Record<EditableField, string> & { parentId?: string };
  const [newRow,       setNewRow]       = useState<NewRow | null>(null);
  const [newRowField,  setNewRowField]  = useState<EditableField>("name");

  // Inline edit for existing cells
  const [editCell, setEditCell] = useState<{ id: string; field: EditableField } | null>(null);
  const [editVal,  setEditVal]  = useState("");

  const tableRef   = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const node = e.target as Node;
      const inTable   = tableRef.current?.contains(node);
      const inToolbar = toolbarRef.current?.contains(node);
      if (!inTable && !inToolbar) {
        setEditCell(null);
        setNewRow(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const parents = categories
    .filter(c => !c.parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const getSubs = useCallback((parentId: string) =>
    categories.filter(c => c.parentId === parentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [categories]);

  // Filter: show parent if it or any of its subs match, or if search is empty
  const q = search.toLowerCase();
  const filteredParents = parents.filter(p => {
    if (!q) return true;
    if (p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)) return true;
    return getSubs(p.id).some(s => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
  });

  // Auto-expand parents that have matching subs when searching
  useEffect(() => {
    if (!q) return;
    const toExpand = new Set(expandedIds);
    parents.forEach(p => {
      const hasSub = getSubs(p.id).some(s => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
      if (hasSub) toExpand.add(p.id);
    });
    setExpandedIds(toExpand);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggleExpand = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Edit existing cell ───────────────────────────────────────────────────────
  const activateEdit = (id: string, field: EditableField) => {
    if (!can("Edit Categories")) return;
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    setEditCell({ id, field });
    setEditVal(String((cat as Record<string, unknown>)[field] ?? ""));
    setNewRow(null);
  };

  const commitEdit = useCallback(() => {
    if (!editCell) return;
    const cat = categories.find(c => c.id === editCell.id);
    if (!cat) { setEditCell(null); return; }
    const old = String((cat as Record<string, unknown>)[editCell.field] ?? "");
    if (old !== editVal) {
      editCategory(editCell.id, { [editCell.field]: editVal } as Partial<ProductCategory>);
      toast({ title: "Saved" });
    }
    setEditCell(null);
  }, [editCell, editVal, categories, editCategory, toast]);

  const editKeyDown = (e: React.KeyboardEvent, id: string, field: EditableField) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") { setEditCell(null); }
    if (e.key === "Tab") { e.preventDefault(); commitEdit(); }
    if (field === "color") return; // color changes immediately
  };

  // ── New row ──────────────────────────────────────────────────────────────────
  const startNewParent = () => {
    setNewRow(BLANK());
    setNewRowField("name");
    setEditCell(null);
  };

  const startNewSub = (parentId: string) => {
    setNewRow(BLANK(parentId));
    setNewRowField("name");
    setEditCell(null);
    setExpandedIds(prev => new Set([...prev, parentId]));
  };

  const commitNewRow = () => {
    if (!newRow?.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      setNewRowField("name");
      return;
    }
    addCategory({ name: newRow.name, description: newRow.description, color: newRow.color || "#3b82f6", parentId: newRow.parentId || null });
    const label = newRow.parentId ? "Sub-category" : "Category";
    toast({ title: `${label} added`, description: `"${newRow.name}" created.` });
    setNewRow(null);
  };

  const newRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commitNewRow(); }
    if (e.key === "Escape") { setNewRow(null); }
    if (e.key === "Tab") {
      e.preventDefault();
      const fields: EditableField[] = ["name", "description"];
      const idx = fields.indexOf(newRowField);
      if (idx < fields.length - 1) setNewRowField(fields[idx + 1]);
      else commitNewRow();
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const requestDelete = (id: string) => {
    const cat = categories.find(c => c.id === id);
    const hasSubs = getSubs(id).length > 0;
    setDeleteId(id);
    setDeleteName(cat?.name || "");
    setDeleteHasSubs(hasSubs);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    // If deleting a parent that has subs, delete subs too
    if (deleteHasSubs) {
      getSubs(deleteId).forEach(s => removeCategory(s.id));
    }
    removeCategory(deleteId);
    toast({ title: "Deleted", description: `"${deleteName}" removed.` });
    setDeleteId(null);
  };

  const topLevelCount = parents.length;
  const subCount = categories.filter(c => !!c.parentId).length;

  // ── Column widths ─────────────────────────────────────────────────────────────
  const COL = { idx: 40, color: 120, name: 210, desc: 340, subs: 100, created: 110, actions: 72 };
  const totalW = Object.values(COL).reduce((a, b) => a + b, 0);

  const thClass = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-gray-100 dark:border-border whitespace-nowrap";
  const tdBase  = "border-r border-gray-100 dark:border-border relative p-0";

  // ── Render a single editable row (parent or sub) ──────────────────────────────
  const renderCells = (cat: ProductCategory, isSubRow: boolean, rowIdx: string) => {
    const fields: EditableField[] = ["color", "name", "description"];
    return fields.map(field => {
      const isA = editCell?.id === cat.id && editCell?.field === field;
      const val = String((cat as Record<string, unknown>)[field] ?? "");
      return (
        <td key={field} className={`${tdBase} ${isA ? "ring-2 ring-inset ring-blue-500 z-10" : can("Edit Categories") ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer" : ""}`}
          style={{ height: CELL_H, width: field === "color" ? COL.color : field === "name" ? COL.name : COL.desc, minWidth: field === "color" ? COL.color : field === "name" ? COL.name : COL.desc }}>
          <InlineCell
            value={isA ? editVal : val}
            field={field}
            active={isA}
            placeholder={field === "name" ? (isSubRow ? "Sub-category name" : "Category name") : field === "description" ? "Description (optional)" : ""}
            canEdit={can("Edit Categories")}
            onActivate={() => activateEdit(cat.id, field)}
            onChange={v => {
              if (field === "color") {
                // Color changes save immediately
                editCategory(cat.id, { color: v });
                setEditCell(null);
              } else {
                setEditVal(v);
              }
            }}
            onKeyDown={e => editKeyDown(e, cat.id, field)}
          />
        </td>
      );
    });
  };

  // ── Render inline new-row cells ───────────────────────────────────────────────
  const renderNewRowCells = (isSubRow: boolean) => {
    const fields: EditableField[] = ["color", "name", "description"];
    return fields.map(field => {
      const isA = newRowField === field;
      const val = newRow ? newRow[field] : "";
      const colW = field === "color" ? COL.color : field === "name" ? COL.name : COL.desc;
      return (
        <td key={field} className={`${tdBase} ${isA ? "ring-2 ring-inset ring-blue-500 z-10" : "hover:bg-amber-50/60 dark:hover:bg-amber-950/20"}`}
          style={{ height: CELL_H, width: colW, minWidth: colW }}>
          <InlineCell
            value={val} field={field} active={isA}
            placeholder={field === "name" ? (isSubRow ? "Sub-category name" : "Category name") : field === "description" ? "Description (optional)" : ""}
            canEdit={true}
            onActivate={() => setNewRowField(field)}
            onChange={v => {
              if (field === "color") setNewRow(r => r ? { ...r, color: v } : r);
              else setNewRow(r => r ? { ...r, [field]: v } : r);
            }}
            onKeyDown={newRowKeyDown}
          />
        </td>
      );
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Categories</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Two-level hierarchy: Categories &amp; Sub-categories</p>
        </div>
        {can("Add Categories") && (
          <Button size="sm" onClick={startNewParent} className="gap-1.5" data-testid="btn-add-category">
            <Plus size={14} /> Add Category
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-5 text-sm text-muted-foreground border-b border-border pb-3 flex-wrap">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <FolderOpen size={15} className="text-primary" />
          {topLevelCount} {topLevelCount === 1 ? "category" : "categories"}
        </span>
        <span className="flex items-center gap-1.5">
          <CornerDownRight size={13} className="text-muted-foreground" />
          {subCount} sub-{subCount === 1 ? "category" : "categories"}
        </span>
        <span className="flex items-center gap-1.5"><Tag size={13} /> Organise products into two-level groups</span>
      </div>

      {/* Toolbar */}
      <div ref={toolbarRef} className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search categories..." className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {can("Add Categories") && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => setNewRow(null)}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filteredParents.length} of {topLevelCount}</div>
      </div>

      {/* Table */}
      <div ref={tableRef} className="rounded-md border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table style={{ minWidth: totalW, width: "100%", borderCollapse: "collapse" }}>
            <thead className="bg-gray-50 dark:bg-muted/40 border-b border-border">
              <tr>
                <th className={thClass} style={{ width: COL.idx }}>  </th>
                <th className={thClass} style={{ width: COL.color }}>Colour</th>
                <th className={thClass} style={{ width: COL.name }}>Name</th>
                <th className={thClass} style={{ width: COL.desc }}>Description</th>
                <th className={thClass} style={{ width: COL.subs }}>Sub-cats</th>
                <th className={thClass} style={{ width: COL.created }}>Created</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: COL.actions }}>Actions</th>
              </tr>
            </thead>
            <tbody>

              {/* New TOP-LEVEL row (no parentId) */}
              {can("Add Categories") && newRow && !newRow.parentId && (
                <tr className="border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20">
                  <td className="text-center text-[11px] text-amber-400 font-bold border-r border-gray-100 dark:border-border" style={{ height: CELL_H, width: COL.idx }}>★</td>
                  {renderNewRowCells(false)}
                  <td className={tdBase} style={{ height: CELL_H, width: COL.subs }}>
                    <div className="px-3 text-[11px] text-muted-foreground">—</div>
                  </td>
                  <td className={tdBase} style={{ height: CELL_H, width: COL.created }}>
                    <div className="px-3 text-[11px] text-muted-foreground">—</div>
                  </td>
                  <td style={{ height: CELL_H, width: COL.actions }}>
                    <div className="flex items-center justify-end gap-0.5 px-2">
                      <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Save"><Save size={13} /></button>
                      <button onClick={() => setNewRow(null)} className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" title="Cancel"><X size={13} /></button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Empty state */}
              {filteredParents.length === 0 && !newRow && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-muted-foreground text-sm">
                    {search ? "No categories match your search." : "No categories yet. Click Add Category to get started."}
                  </td>
                </tr>
              )}

              {/* Parent rows */}
              {filteredParents.map((parent, pi) => {
                const subs = getSubs(parent.id);
                const filteredSubs = q
                  ? subs.filter(s => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q))
                  : subs;
                const isExpanded = expandedIds.has(parent.id);
                const isRowActive = editCell?.id === parent.id;

                return [
                  /* ── Parent row ── */
                  <tr key={parent.id} data-testid={`row-category-${parent.id}`}
                    className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : pi % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/40 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>

                    {/* Row # + expand toggle */}
                    <td className="border-r border-gray-100 dark:border-border text-center select-none" style={{ height: CELL_H, width: COL.idx }}>
                      <button
                        className={`inline-flex items-center gap-0.5 text-[11px] font-mono transition-colors ${subs.length > 0 ? "text-primary hover:text-primary/80 cursor-pointer" : "text-gray-300 dark:text-muted-foreground/40 cursor-default"}`}
                        onClick={() => subs.length > 0 && toggleExpand(parent.id)}
                        title={subs.length > 0 ? (isExpanded ? "Collapse sub-categories" : "Expand sub-categories") : undefined}
                      >
                        {subs.length > 0
                          ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
                          : <span className="w-3" />}
                        {pi + 1}
                      </button>
                    </td>

                    {renderCells(parent, false, `p-${pi}`)}

                    {/* Sub-cat count */}
                    <td className={tdBase} style={{ height: CELL_H, width: COL.subs }}>
                      <div className="px-3">
                        {subs.length > 0 ? (
                          <button onClick={() => toggleExpand(parent.id)}
                            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors ${isExpanded ? "bg-primary/15 text-primary" : "bg-gray-100 dark:bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
                            {subs.length} sub
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </td>

                    {/* Created */}
                    <td className={tdBase} style={{ height: CELL_H, width: COL.created }}>
                      <div className="px-3 text-[11px] text-muted-foreground">{format(new Date(parent.createdAt), "d MMM yyyy")}</div>
                    </td>

                    {/* Actions */}
                    <td style={{ height: CELL_H, width: COL.actions }}>
                      <div className="flex items-center justify-end gap-0.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {can("Add Categories") && (
                          <button
                            className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                            title="Add sub-category"
                            onClick={() => startNewSub(parent.id)}
                          >
                            <Plus size={13} />
                          </button>
                        )}
                        {can("Delete Categories") && (
                          <button
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete category"
                            onClick={() => requestDelete(parent.id)}
                            data-testid={`btn-delete-category-${parent.id}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>,

                  /* ── Sub-category rows (when expanded) ── */
                  ...(isExpanded ? [
                    ...filteredSubs.map((sub, si) => {
                      const isSubActive = editCell?.id === sub.id;
                      return (
                        <tr key={sub.id} data-testid={`row-subcategory-${sub.id}`}
                          className={`border-b border-gray-100 dark:border-border transition-colors group ${isSubActive ? "bg-blue-50/30 dark:bg-blue-950/10" : "bg-blue-50/[0.04] dark:bg-blue-950/[0.06]"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>

                          {/* Indent indicator */}
                          <td className="border-r border-gray-100 dark:border-border text-center select-none" style={{ height: CELL_H, width: COL.idx }}>
                            <span className="flex items-center justify-center text-muted-foreground/40">
                              <CornerDownRight size={11} />
                            </span>
                          </td>

                          {renderCells(sub, true, `s-${pi}-${si}`)}

                          {/* No sub-count for subs */}
                          <td className={tdBase} style={{ height: CELL_H, width: COL.subs }}>
                            <div className="px-3 text-[11px] text-muted-foreground/40">—</div>
                          </td>

                          {/* Created */}
                          <td className={tdBase} style={{ height: CELL_H, width: COL.created }}>
                            <div className="px-3 text-[11px] text-muted-foreground">{format(new Date(sub.createdAt), "d MMM yyyy")}</div>
                          </td>

                          {/* Actions */}
                          <td style={{ height: CELL_H, width: COL.actions }}>
                            <div className="flex items-center justify-end gap-0.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {can("Delete Categories") && (
                                <button
                                  className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                  title="Delete sub-category"
                                  onClick={() => requestDelete(sub.id)}
                                  data-testid={`btn-delete-subcategory-${sub.id}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }),

                    /* Inline new sub-category row (when adding under THIS parent) */
                    ...(can("Add Categories") && newRow?.parentId === parent.id ? [
                      <tr key={`new-sub-${parent.id}`} className="border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20">
                        <td className="text-center text-[11px] text-amber-400 font-bold border-r border-gray-100 dark:border-border" style={{ height: CELL_H, width: COL.idx }}>
                          <CornerDownRight size={11} className="mx-auto text-amber-400" />
                        </td>
                        {renderNewRowCells(true)}
                        <td className={tdBase} style={{ height: CELL_H, width: COL.subs }}>
                          <div className="px-3 text-[11px] text-muted-foreground">—</div>
                        </td>
                        <td className={tdBase} style={{ height: CELL_H, width: COL.created }}>
                          <div className="px-3 text-[11px] text-muted-foreground">—</div>
                        </td>
                        <td style={{ height: CELL_H, width: COL.actions }}>
                          <div className="flex items-center justify-end gap-0.5 px-2">
                            <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Save"><Save size={13} /></button>
                            <button onClick={() => setNewRow(null)} className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" title="Cancel"><X size={13} /></button>
                          </div>
                        </td>
                      </tr>,
                    ] : []),

                    /* "Add sub-category" inline prompt when expanded and no active new row */
                    ...(can("Add Categories") && (!newRow || newRow.parentId !== parent.id) && isExpanded ? [
                      <tr key={`add-sub-btn-${parent.id}`}>
                        <td colSpan={7}>
                          <button onClick={() => startNewSub(parent.id)}
                            className="w-full flex items-center gap-2 pl-10 pr-4 py-1.5 text-[11px] text-muted-foreground/60 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                            <CornerDownRight size={11} />
                            <Plus size={10} /> Add sub-category under <span className="font-semibold ml-1">{parent.name}</span>
                          </button>
                        </td>
                      </tr>,
                    ] : []),
                  ] : []),
                ];
              })}

              {/* Bottom add row */}
              {can("Add Categories") && !newRow && (
                <tr>
                  <td colSpan={7}>
                    <button onClick={startNewParent}
                      className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                      data-testid="btn-add-row">
                      <Plus size={13} /> Add category
                    </button>
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteHasSubs
                ? `This will permanently delete "${deleteName}" and all its sub-categories. This cannot be undone.`
                : `This will permanently remove "${deleteName}". This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete-category">
              {deleteHasSubs ? "Delete All" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
