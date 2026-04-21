import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useProductCategories } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { ProductCategory } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Tag, Plus, FolderOpen, Search, Trash2, ChevronRight, ChevronDown,
  Save, X, Package, Pencil, GitBranch, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PRESET_COLORS } from "@/components/editable-cell";

const MAX_DEPTH = 3;          // Categories → Sub → Sub-sub
const INDENT_W  = 22;
const ROW_H     = 40;

type EditableField = "color" | "name" | "description";
type FlatRow = ProductCategory & { depth: number; hasChildren: boolean };

const BLANK = (parentId?: string): Record<EditableField, string> & { parentId?: string } =>
  ({ color: "#3b82f6", name: "", description: "", parentId });

// ── Build a flat depth-tagged list from the recursive tree ─────────────────────
function buildFlatRows(
  cats: ProductCategory[],
  parentId: string | null,
  depth: number,
  collapsed: Set<string>,
): FlatRow[] {
  const children = cats
    .filter(c => (c.parentId ?? null) === parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const out: FlatRow[] = [];
  for (const c of children) {
    const hasChildren = cats.some(x => x.parentId === c.id);
    out.push({ ...c, depth, hasChildren });
    if (hasChildren && !collapsed.has(c.id)) {
      out.push(...buildFlatRows(cats, c.id, depth + 1, collapsed));
    }
  }
  return out;
}

// ── Inline editable cell ───────────────────────────────────────────────────────
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
      <div className="w-full h-full flex items-center" onClick={canEdit ? onActivate : undefined}>
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
            <span className="w-3 h-3 rounded-full ring-1 ring-black/10 flex-shrink-0" style={{ backgroundColor: value || "#3b82f6" }} />
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
          className="absolute inset-0 w-full h-full px-2 text-[13px] bg-transparent border-0 outline-none ring-2 ring-inset ring-blue-500 rounded-sm dark:text-foreground placeholder:text-gray-300" />
      ) : (
        <span className={`px-2 truncate text-[13px] ${value ? "text-foreground" : "text-muted-foreground/40"}`}>{value || placeholder}</span>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const { categories, addCategory, editCategory, removeCategory } = useProductCategories();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search,        setSearch]        = useState("");
  const [collapsedIds,  setCollapsedIds]  = useState<Set<string>>(new Set());
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [deleteName,    setDeleteName]    = useState("");
  const [deleteDescCount, setDeleteDescCount] = useState(0);

  // Inline new row
  type NewRow = Record<EditableField, string> & { parentId?: string };
  const [newRow,      setNewRow]      = useState<NewRow | null>(null);
  const [newRowField, setNewRowField] = useState<EditableField>("name");

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

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getAllDescendantIds = useCallback((id: string): string[] => {
    const direct = categories.filter(c => c.parentId === id);
    return direct.flatMap(d => [d.id, ...getAllDescendantIds(d.id)]);
  }, [categories]);

  // ── Filter (search) ──────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const matchedIds = useMemo(() => {
    if (!q) return null;
    const direct = new Set(
      categories
        .filter(c => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q))
        .map(c => c.id),
    );
    // Include all ancestors of matched ones so they remain visible in the tree
    const out = new Set(direct);
    direct.forEach(id => {
      let cur = categories.find(c => c.id === id);
      while (cur?.parentId) {
        out.add(cur.parentId);
        cur = categories.find(c => c.id === cur!.parentId);
      }
    });
    return out;
  }, [q, categories]);

  // Auto-expand ancestors of matches when searching
  useEffect(() => {
    if (!matchedIds) return;
    setCollapsedIds(prev => {
      const next = new Set(prev);
      matchedIds.forEach(id => next.delete(id));
      return next;
    });
  }, [matchedIds]);

  // ── Flat tree rows ───────────────────────────────────────────────────────────
  const flatRows = useMemo(() => {
    const all = buildFlatRows(categories, null, 0, collapsedIds);
    if (!matchedIds) return all;
    return all.filter(r => matchedIds.has(r.id));
  }, [categories, collapsedIds, matchedIds]);

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

  const editKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") { setEditCell(null); }
    if (e.key === "Tab") { e.preventDefault(); commitEdit(); }
  };

  // ── New row ──────────────────────────────────────────────────────────────────
  const startNewRoot = () => {
    setNewRow(BLANK());
    setNewRowField("name");
    setEditCell(null);
  };

  const startNewChild = (parentId: string) => {
    setNewRow(BLANK(parentId));
    setNewRowField("name");
    setEditCell(null);
    // Expand ancestor chain so the new inline row is visible
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.delete(parentId);
      let cur = categories.find(c => c.id === parentId);
      while (cur?.parentId) {
        next.delete(cur.parentId);
        cur = categories.find(c => c.id === cur!.parentId);
      }
      return next;
    });
  };

  const commitNewRow = () => {
    if (!newRow?.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      setNewRowField("name");
      return;
    }
    addCategory({
      name: newRow.name,
      description: newRow.description,
      color: newRow.color || "#3b82f6",
      parentId: newRow.parentId || null,
    });
    let level = 1;
    if (newRow.parentId) {
      const p = categories.find(c => c.id === newRow.parentId);
      level = p?.parentId ? 3 : 2;
    }
    const label = level === 1 ? "Category" : level === 2 ? "Sub-category" : "Sub-sub-category";
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
    setDeleteId(id);
    setDeleteName(cat?.name || "");
    setDeleteDescCount(getAllDescendantIds(id).length);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    if (deleteDescCount > 0) {
      getAllDescendantIds(deleteId).forEach(d => removeCategory(d));
    }
    removeCategory(deleteId);
    toast({ title: "Deleted", description: `"${deleteName}" removed.` });
    setDeleteId(null);
  };

  const toggleCollapse = (id: string) =>
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Counts ────────────────────────────────────────────────────────────────────
  const topLevelCount = categories.filter(c => !c.parentId).length;
  const subCount      = categories.filter(c => {
    const p = c.parentId ? categories.find(x => x.id === c.parentId) : null;
    return p && !p.parentId;
  }).length;
  const subSubCount   = categories.filter(c => {
    const p = c.parentId ? categories.find(x => x.id === c.parentId) : null;
    return p && p.parentId;
  }).length;

  // ── Tree indent renderer (└ │ guides) ─────────────────────────────────────────
  const renderIndent = (depth: number) => (
    <div className="flex items-center flex-shrink-0" style={{ width: depth * INDENT_W }}>
      {Array.from({ length: depth }).map((_, di) => (
        <span
          key={di}
          className={`flex-shrink-0 font-mono ${di === depth - 1 ? "text-gray-400 dark:text-zinc-500" : "text-transparent"}`}
          style={{ width: INDENT_W, fontSize: 13, lineHeight: 1 }}
        >
          {di === depth - 1 ? "└" : "│"}
        </span>
      ))}
    </div>
  );

  // ── Render a single tree row ─────────────────────────────────────────────────
  const renderRow = (row: FlatRow, ri: number) => {
    const isRowActive = editCell?.id === row.id;
    const isCollapsed = collapsedIds.has(row.id);
    const levelLabel  = row.depth === 0 ? "Category" : row.depth === 1 ? "Sub-category" : "Sub-sub-category";
    const canAddChild = row.depth < MAX_DEPTH - 1;
    const parent = row.parentId ? categories.find(c => c.id === row.parentId) : null;

    return (
      <div
        key={row.id}
        data-testid={`row-category-${row.id}`}
        className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 group transition-colors min-h-[${ROW_H}px] ${
          isRowActive ? "bg-blue-50/40 dark:bg-blue-950/20" :
          ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/40 dark:bg-zinc-800/10"
        } hover:bg-blue-50/30 dark:hover:bg-blue-950/15`}
        style={{ minHeight: ROW_H }}
      >
        {/* Tree indent + chevron toggle */}
        <div className="flex items-center flex-shrink-0 pl-3" style={{ width: 44 + row.depth * INDENT_W }}>
          {row.depth > 0 && renderIndent(row.depth)}
          <div className="w-5 flex-shrink-0 flex justify-center">
            {row.hasChildren ? (
              <button
                onClick={() => toggleCollapse(row.id)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                title={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed
                  ? <ChevronRight size={12} className="text-gray-500" />
                  : <ChevronDown  size={12} className="text-gray-500" />}
              </button>
            ) : (
              <span className="text-gray-300 dark:text-zinc-600 text-[14px] select-none">·</span>
            )}
          </div>
        </div>

        {/* Row # */}
        <div className="w-8 flex-shrink-0 text-[11px] text-gray-400 font-mono">{ri + 1}</div>

        {/* Colour cell (inline-editable) */}
        <div className={`w-12 flex-shrink-0 ${isRowActive && editCell?.field === "color" ? "ring-2 ring-inset ring-blue-500 rounded-sm" : ""}`} style={{ height: ROW_H }}>
          <InlineCell
            value={editCell?.id === row.id && editCell?.field === "color" ? editVal : row.color}
            field="color"
            active={editCell?.id === row.id && editCell?.field === "color"}
            canEdit={can("Edit Categories")}
            onActivate={() => activateEdit(row.id, "color")}
            onChange={v => {
              editCategory(row.id, { color: v });
              setEditCell(null);
            }}
            onKeyDown={editKeyDown}
          />
        </div>

        {/* Name cell + group/leaf badge */}
        <div className="flex-1 min-w-0 flex items-center gap-2 pr-3" style={{ height: ROW_H }}>
          <div className={`flex-1 min-w-0 ${editCell?.id === row.id && editCell?.field === "name" ? "" : ""}`}>
            <InlineCell
              value={editCell?.id === row.id && editCell?.field === "name" ? editVal : row.name}
              field="name"
              active={editCell?.id === row.id && editCell?.field === "name"}
              placeholder={`${levelLabel} name`}
              canEdit={can("Edit Categories")}
              onActivate={() => activateEdit(row.id, "name")}
              onChange={v => setEditVal(v)}
              onKeyDown={editKeyDown}
            />
          </div>
          {row.hasChildren ? (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
              <GitBranch size={8} /> Group
            </span>
          ) : (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 border border-gray-200 dark:border-zinc-700">
              <FileText size={8} /> Leaf
            </span>
          )}
        </div>

        {/* Description cell */}
        <div className="w-72 flex-shrink-0 pr-2" style={{ height: ROW_H }}>
          <InlineCell
            value={editCell?.id === row.id && editCell?.field === "description" ? editVal : (row.description || "")}
            field="description"
            active={editCell?.id === row.id && editCell?.field === "description"}
            placeholder="Description (optional)"
            canEdit={can("Edit Categories")}
            onActivate={() => activateEdit(row.id, "description")}
            onChange={v => setEditVal(v)}
            onKeyDown={editKeyDown}
          />
        </div>

        {/* Parent column */}
        <div className="w-52 flex-shrink-0 pr-2">
          {parent ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full ring-1 ring-black/10 flex-shrink-0" style={{ backgroundColor: parent.color || "#3b82f6" }} />
              <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 truncate">{parent.name}</span>
            </div>
          ) : (
            <span className="text-[11px] text-gray-300 dark:text-zinc-600">—</span>
          )}
        </div>

        {/* Created */}
        <div className="w-24 flex-shrink-0 pr-2 text-[11px] text-muted-foreground">
          {format(new Date(row.createdAt), "d MMM yyyy")}
        </div>

        {/* Actions (hover) */}
        <div className="w-32 flex-shrink-0 flex items-center justify-end gap-0.5 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            title="View products in this category"
            onClick={() => navigate(`/products?category=${encodeURIComponent(row.name)}`)}
          >
            <Package size={13} />
          </button>
          {canAddChild && can("Add Categories") && (
            <button
              className="p-1.5 rounded-md text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              title={row.depth === 0 ? "Add sub-category" : "Add sub-sub-category"}
              onClick={() => startNewChild(row.id)}
              data-testid={`btn-add-child-${row.id}`}
            >
              <Plus size={13} />
            </button>
          )}
          {can("Edit Categories") && (
            <button
              className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              title="Edit name"
              onClick={() => activateEdit(row.id, "name")}
            >
              <Pencil size={13} />
            </button>
          )}
          {can("Delete Categories") && (
            <button
              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              title="Delete"
              onClick={() => requestDelete(row.id)}
              data-testid={`btn-delete-category-${row.id}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Render the inline new-row (placed at correct depth in flat list) ─────────
  const renderNewRow = () => {
    if (!newRow) return null;
    const depth   = newRow.parentId
      ? (() => {
          const p = categories.find(c => c.id === newRow.parentId);
          return p?.parentId ? 2 : 1;
        })()
      : 0;
    const levelLabel = depth === 0 ? "Category" : depth === 1 ? "Sub-category" : "Sub-sub-category";

    return (
      <div className="flex items-center border-b border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 group" style={{ minHeight: ROW_H }}>
        {/* Indent + new-row marker */}
        <div className="flex items-center flex-shrink-0 pl-3" style={{ width: 44 + depth * INDENT_W }}>
          {depth > 0 && renderIndent(depth)}
          <div className="w-5 flex-shrink-0 flex justify-center text-amber-500 font-bold text-[12px]">★</div>
        </div>

        {/* Row # placeholder */}
        <div className="w-8 flex-shrink-0 text-[11px] text-amber-500 font-mono">new</div>

        {/* Colour picker */}
        <div className="w-12 flex-shrink-0 px-1" style={{ height: ROW_H }}>
          <InlineCell
            value={newRow.color}
            field="color"
            active={newRowField === "color"}
            canEdit={true}
            onActivate={() => setNewRowField("color")}
            onChange={v => setNewRow(r => r ? { ...r, color: v } : r)}
            onKeyDown={newRowKeyDown}
          />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0 pr-3" style={{ height: ROW_H }}>
          <InlineCell
            value={newRow.name}
            field="name"
            active={newRowField === "name"}
            placeholder={`${levelLabel} name`}
            canEdit={true}
            onActivate={() => setNewRowField("name")}
            onChange={v => setNewRow(r => r ? { ...r, name: v } : r)}
            onKeyDown={newRowKeyDown}
          />
        </div>

        {/* Description */}
        <div className="w-72 flex-shrink-0 pr-2" style={{ height: ROW_H }}>
          <InlineCell
            value={newRow.description}
            field="description"
            active={newRowField === "description"}
            placeholder="Description (optional)"
            canEdit={true}
            onActivate={() => setNewRowField("description")}
            onChange={v => setNewRow(r => r ? { ...r, description: v } : r)}
            onKeyDown={newRowKeyDown}
          />
        </div>

        {/* Parent column */}
        <div className="w-52 flex-shrink-0 pr-2">
          {newRow.parentId ? (() => {
            const p = categories.find(c => c.id === newRow.parentId);
            return p ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full ring-1 ring-black/10 flex-shrink-0" style={{ backgroundColor: p.color || "#3b82f6" }} />
                <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 truncate">{p.name}</span>
              </div>
            ) : null;
          })() : (
            <span className="text-[11px] text-gray-300 dark:text-zinc-600">— root —</span>
          )}
        </div>

        {/* Created placeholder */}
        <div className="w-24 flex-shrink-0 pr-2 text-[11px] text-muted-foreground">—</div>

        {/* Save / cancel */}
        <div className="w-32 flex-shrink-0 flex items-center justify-end gap-0.5 pr-3">
          <button onClick={commitNewRow} className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Save"><Save size={14} /></button>
          <button onClick={() => setNewRow(null)} className="p-1.5 rounded-md text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" title="Cancel"><X size={14} /></button>
        </div>
      </div>
    );
  };

  // ── Build the rendered list, splicing the new-row in at the right position ──
  const renderedList = useMemo(() => {
    const items: { kind: "row"; row: FlatRow } [] | { kind: "row"; row: FlatRow } | { kind: "new" } | unknown[] = [];
    const out: ({ kind: "row"; row: FlatRow } | { kind: "new" })[] = [];
    flatRows.forEach(r => {
      out.push({ kind: "row", row: r });
      // If the new-row is a child of THIS row, insert it directly after, after this row's existing children block in the flat list.
      // Implementation: if newRow.parentId === r.id and r is the LAST row of its subtree section, insert here.
    });
    // Insert new-row at the correct logical spot:
    if (newRow) {
      if (!newRow.parentId) {
        out.push({ kind: "new" });
      } else {
        // Find the index AFTER the last descendant of parentId in flatRows
        const parentIdx = flatRows.findIndex(r => r.id === newRow.parentId);
        if (parentIdx === -1) {
          out.push({ kind: "new" });
        } else {
          // The descendant block continues while subsequent rows have depth > parent.depth
          const parentDepth = flatRows[parentIdx].depth;
          let insertAfter = parentIdx;
          for (let i = parentIdx + 1; i < flatRows.length; i++) {
            if (flatRows[i].depth > parentDepth) insertAfter = i;
            else break;
          }
          // Insert in the `out` array at the matching position (out has same indexing as flatRows since we didn't insert anything else)
          out.splice(insertAfter + 1, 0, { kind: "new" });
        }
      }
    }
    void items;
    return out;
  }, [flatRows, newRow]);

  void isAuthenticated;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Categories</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Click any cell to edit · Three-level tree: Categories → Sub-categories → Sub-sub-categories
          </p>
        </div>
        {can("Add Categories") && (
          <Button size="sm" onClick={startNewRoot} className="gap-1.5" data-testid="btn-add-category">
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
          <GitBranch size={13} className="text-muted-foreground" />
          {subCount} sub-{subCount === 1 ? "category" : "categories"}
        </span>
        <span className="flex items-center gap-1.5">
          <GitBranch size={13} className="text-muted-foreground/70" />
          {subSubCount} sub-sub-{subSubCount === 1 ? "category" : "categories"}
        </span>
        <span className="flex items-center gap-1.5"><Tag size={13} /> Organise products into a three-level tree</span>
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
        <div className="text-[12px] text-muted-foreground self-center ml-auto">
          {flatRows.length} of {categories.length}
        </div>
      </div>

      {/* Tree */}
      <div ref={tableRef} className="rounded-md border border-border overflow-hidden bg-card">
        {/* Header row */}
        <div className="flex items-center bg-gray-50 dark:bg-muted/40 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minHeight: 32 }}>
          <div className="flex-shrink-0 pl-3" style={{ width: 44 }}>Tree</div>
          <div className="w-8 flex-shrink-0">#</div>
          <div className="w-12 flex-shrink-0">Col</div>
          <div className="flex-1 min-w-0 pr-3">Category Name</div>
          <div className="w-72 flex-shrink-0 pr-2">Description</div>
          <div className="w-52 flex-shrink-0 pr-2">Parent</div>
          <div className="w-24 flex-shrink-0 pr-2">Created</div>
          <div className="w-32 flex-shrink-0 text-right pr-3">Actions</div>
        </div>

        {/* Empty state */}
        {flatRows.length === 0 && !newRow && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {search ? "No categories match your search." : "No categories yet. Click Add Category to get started."}
          </div>
        )}

        {/* Rows */}
        {renderedList.map((item, idx) =>
          item.kind === "row" ? renderRow(item.row, idx) : <div key={`new-${idx}`}>{renderNewRow()}</div>,
        )}

        {/* Bottom add button */}
        {can("Add Categories") && !newRow && categories.length > 0 && (
          <button
            onClick={startNewRoot}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors border-t border-border"
            data-testid="btn-add-row"
          >
            <Plus size={13} /> Add category
          </button>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDescCount > 0
                ? `This will permanently delete "${deleteName}" and ${deleteDescCount} descendant ${deleteDescCount === 1 ? "category" : "categories"}. This cannot be undone.`
                : `This will permanently remove "${deleteName}". This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete-category">
              {deleteDescCount > 0 ? `Delete All (${deleteDescCount + 1})` : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
