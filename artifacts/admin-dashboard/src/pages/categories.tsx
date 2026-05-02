import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useProductCategories } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { ProductCategory } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Tag, Plus, FolderOpen, Search, Trash2, ChevronRight, ChevronDown,
  Save, X, Package, Pencil, GitBranch, FileText, FolderTree, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PRESET_COLORS } from "@/components/editable-cell";

const MAX_DEPTH = 3;          // Categories → Sub → Sub-sub
const INDENT_W  = 22;
const ROW_H     = 40;
const BLANK_RE  = /[\s\u00A0\u200B-\u200F\u2028-\u202F\uFEFF]+/g;

type FlatRow = ProductCategory & { depth: number; hasChildren: boolean };

// Draft rows used inside the dialog
type DraftRow = {
  uid: string;          // local-only stable key (existing id OR `new-N`)
  id?: string;          // present if persisted
  name: string;
  description: string;
  color: string;
  _deleted?: boolean;
};

function isBlankName(s: string): boolean {
  return s.replace(BLANK_RE, "").length === 0;
}

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

function getDepth(cats: ProductCategory[], id: string): number {
  let d = 0; let cur = cats.find(c => c.id === id);
  while (cur?.parentId) { d++; cur = cats.find(c => c.id === cur!.parentId); if (d > 10) break; }
  return d;
}

function getPath(cats: ProductCategory[], id: string | null): string {
  if (!id) return "Top level";
  const parts: string[] = [];
  let cur = cats.find(c => c.id === id);
  while (cur) {
    parts.unshift(cur.name || "(unnamed)");
    cur = cur.parentId ? cats.find(c => c.id === cur!.parentId) : undefined;
  }
  return parts.join(" › ");
}

export default function CategoriesPage() {
  const { categories, addCategory, editCategory, removeCategory } = useProductCategories();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search,        setSearch]        = useState("");
  const [collapsedIds,  setCollapsedIds]  = useState<Set<string>>(new Set());

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [dlgOpen,         setDlgOpen]         = useState(false);
  const [dlgParentId,     setDlgParentId]     = useState<string | null>(null);
  const [dlgRows,         setDlgRows]         = useState<DraftRow[]>([]);
  const [colorPickerUid,  setColorPickerUid]  = useState<string | null>(null);

  // Delete-from-tree confirmation
  const [deleteId,         setDeleteId]         = useState<string | null>(null);
  const [deleteName,       setDeleteName]       = useState("");
  const [deleteDescCount,  setDeleteDescCount]  = useState(0);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getAllDescendantIds = useCallback((id: string): string[] => {
    const direct = categories.filter(c => c.parentId === id);
    return direct.flatMap(d => [d.id, ...getAllDescendantIds(d.id)]);
  }, [categories]);

  // ── Search filter w/ ancestor preservation ─────────────────────────────────
  const q = search.trim().toLowerCase();
  const matchedIds = useMemo(() => {
    if (!q) return null;
    const direct = new Set(
      categories
        .filter(c => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q))
        .map(c => c.id),
    );
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

  useEffect(() => {
    if (!matchedIds) return;
    setCollapsedIds(prev => {
      const next = new Set(prev);
      matchedIds.forEach(id => next.delete(id));
      return next;
    });
  }, [matchedIds]);

  const flatRows = useMemo(() => {
    const all = buildFlatRows(categories, null, 0, collapsedIds);
    return matchedIds ? all.filter(r => matchedIds.has(r.id)) : all;
  }, [categories, collapsedIds, matchedIds]);

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const levelLabel = (cat: ProductCategory): string => {
      const d = getDepth(categories, cat.id);
      return d === 0 ? "Category" : d === 1 ? "Sub-category" : "Sub-sub-category";
    };
    const rows = buildFlatRows(categories, null, 0, new Set()).map(row => ({
      level:       levelLabel(row),
      name:        row.name,
      path:        getPath(categories, row.id),
      description: row.description || "",
      color:       row.color || "",
      parent:      row.parentId ? (categories.find(c => c.id === row.parentId)?.name || "") : "",
      created:     format(new Date(row.createdAt), "yyyy-MM-dd"),
    }));
    const headers = ["Level", "Name", "Full Path", "Description", "Color", "Parent", "Created"];
    const lines   = rows.map(r =>
      [r.level, r.name, r.path, r.description, r.color, r.parent, r.created]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv  = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `categories-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${rows.length} categories exported to CSV.` });
  }, [categories, toast]);

  // ── Open the dialog at a particular target ─────────────────────────────────
  // Rules:
  //   • clicked row at level 1 (depth 0) or 2 (depth 1) → show ITS children
  //   • clicked row at level 3 (depth 2) → show its SIBLINGS (other sub-subs of same parent)
  //   • opening at "root" → show top-level categories
  //   • opening with `addEmpty=true` → also append a fresh blank row at the end
  const openDialog = useCallback(
    (targetId: string | null, addEmpty = false) => {
      let parentId: string | null = targetId;
      if (targetId) {
        const cat = categories.find(c => c.id === targetId);
        if (cat) {
          const d = getDepth(categories, cat.id);
          // If the user clicked the deepest level, edit its siblings (under its parent)
          parentId = d >= MAX_DEPTH - 1 ? (cat.parentId ?? null) : cat.id;
        }
      }
      const children = categories
        .filter(c => (c.parentId ?? null) === parentId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const rows: DraftRow[] = children.map(c => ({
        uid: c.id, id: c.id,
        name: c.name, description: c.description || "", color: c.color || "#3b82f6",
      }));
      if (addEmpty || rows.length === 0) {
        rows.push({ uid: `new-${Date.now()}`, name: "", description: "", color: "#3b82f6" });
      }
      setDlgParentId(parentId);
      setDlgRows(rows);
      setColorPickerUid(null);
      setDlgOpen(true);
    },
    [categories],
  );

  // ── Available parent options for the parent selector ──────────────────────
  // Children of the selected parent live at depth = parentDepth + 1.
  // We must NOT allow choosing a parent that would force children to depth >= MAX_DEPTH.
  // Therefore parents allowed: depth 0 (children at 1) and depth 1 (children at 2). Depth 2 not allowed.
  const parentOptions = useMemo(() => {
    type Opt = { id: string | null; label: string; depth: number };
    const opts: Opt[] = [{ id: null, label: "— Top level (no parent) —", depth: -1 }];
    function walk(pid: string | null, d: number) {
      categories
        .filter(c => (c.parentId ?? null) === pid)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .forEach(c => {
          if (d < MAX_DEPTH - 1) {
            opts.push({ id: c.id, label: `${"  ".repeat(d)}${d > 0 ? "↳ " : ""}${c.name || "(unnamed)"}`, depth: d });
          }
          walk(c.id, d + 1);
        });
    }
    walk(null, 0);
    return opts;
  }, [categories]);

  // ── Switching parent in dialog reloads draft rows for that parent ─────────
  const handleParentChange = (newParentId: string | null) => {
    if (newParentId === dlgParentId) return;
    const dirty = dlgRows.some(r =>
      (!r.id && r.name.trim()) ||
      (r.id && (() => {
        const orig = categories.find(c => c.id === r.id);
        if (!orig) return false;
        return r._deleted || orig.name !== r.name || (orig.description || "") !== r.description || (orig.color || "#3b82f6") !== r.color;
      })()),
    );
    if (dirty && !confirm("Discard unsaved changes and switch to this parent?")) return;
    const children = categories
      .filter(c => (c.parentId ?? null) === newParentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const rows: DraftRow[] = children.map(c => ({
      uid: c.id, id: c.id, name: c.name, description: c.description || "", color: c.color || "#3b82f6",
    }));
    if (rows.length === 0) {
      rows.push({ uid: `new-${Date.now()}`, name: "", description: "", color: "#3b82f6" });
    }
    setDlgParentId(newParentId);
    setDlgRows(rows);
    setColorPickerUid(null);
  };

  // ── Draft row mutators ─────────────────────────────────────────────────────
  const updateRow = (uid: string, patch: Partial<DraftRow>) =>
    setDlgRows(rs => rs.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  const addRow = () =>
    setDlgRows(rs => [...rs, { uid: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "", description: "", color: "#3b82f6" }]);

  const removeRow = (uid: string) =>
    setDlgRows(rs => {
      const r = rs.find(x => x.uid === uid);
      if (!r) return rs;
      // New rows: just drop. Existing rows: mark deleted (will cascade descendants on save).
      if (!r.id) return rs.filter(x => x.uid !== uid);
      return rs.map(x => (x.uid === uid ? { ...x, _deleted: !x._deleted } : x));
    });

  const childCountOfPersisted = (id: string) => categories.filter(c => c.parentId === id).length;

  // ── Save: diff & commit all changes ────────────────────────────────────────
  const saveDialog = () => {
    let added = 0, edited = 0, deleted = 0, skippedBlank = 0;

    for (const r of dlgRows) {
      if (r.id) {
        // Existing row
        if (r._deleted) {
          getAllDescendantIds(r.id).forEach(d => removeCategory(d));
          removeCategory(r.id);
          deleted++;
          continue;
        }
        const orig = categories.find(c => c.id === r.id);
        if (!orig) continue;
        const trimmed = r.name.trim();
        if (isBlankName(trimmed)) {
          skippedBlank++;
          continue; // Don't allow saving an empty name onto an existing row
        }
        const changes: Partial<ProductCategory> = {};
        if (orig.name !== trimmed) changes.name = trimmed;
        if ((orig.description || "") !== r.description) changes.description = r.description;
        if ((orig.color || "#3b82f6") !== r.color) changes.color = r.color;
        if ((orig.parentId ?? null) !== dlgParentId) changes.parentId = dlgParentId;
        if (Object.keys(changes).length > 0) {
          editCategory(r.id, changes);
          edited++;
        }
      } else {
        // New row — only add if it has a name
        const trimmed = r.name.trim();
        if (isBlankName(trimmed)) {
          skippedBlank++;
          continue;
        }
        addCategory({
          name: trimmed,
          description: r.description,
          color: r.color || "#3b82f6",
          parentId: dlgParentId,
        });
        added++;
      }
    }

    const parts: string[] = [];
    if (added)        parts.push(`${added} added`);
    if (edited)       parts.push(`${edited} updated`);
    if (deleted)      parts.push(`${deleted} deleted`);
    if (skippedBlank) parts.push(`${skippedBlank} blank skipped`);
    toast({
      title: parts.length ? "Changes saved" : "No changes",
      description: parts.join(" · ") || "Nothing to save.",
      variant: skippedBlank && !added && !edited && !deleted ? "destructive" : "default",
    });
    if (added || edited || deleted) {
      // Make sure the parent we just edited under is expanded so user sees the result
      if (dlgParentId) {
        setCollapsedIds(prev => {
          const next = new Set(prev);
          let cur = categories.find(c => c.id === dlgParentId);
          while (cur) { next.delete(cur.id); cur = cur.parentId ? categories.find(c => c.id === cur!.parentId) : undefined; }
          return next;
        });
      }
      setDlgOpen(false);
    }
  };

  // ── Delete confirmation (from tree row trash icon) ─────────────────────────
  const requestDelete = (id: string) => {
    const cat = categories.find(c => c.id === id);
    setDeleteId(id);
    setDeleteName(cat?.name || "(unnamed)");
    setDeleteDescCount(getAllDescendantIds(id).length);
  };
  const handleDelete = () => {
    if (!deleteId) return;
    if (deleteDescCount > 0) getAllDescendantIds(deleteId).forEach(d => removeCategory(d));
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

  // ── Counts ────────────────────────────────────────────────────────────────
  const topLevelCount = categories.filter(c => !c.parentId).length;
  const subCount      = categories.filter(c => {
    const p = c.parentId ? categories.find(x => x.id === c.parentId) : null;
    return p && !p.parentId;
  }).length;
  const subSubCount   = categories.filter(c => {
    const p = c.parentId ? categories.find(x => x.id === c.parentId) : null;
    return p && p.parentId;
  }).length;

  // ── Tree indent renderer (└ │ guides) ─────────────────────────────────────
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

  // ── Render a tree row (read-only; click name to open dialog) ──────────────
  const renderRow = (row: FlatRow, ri: number) => {
    const isCollapsed = collapsedIds.has(row.id);
    const canAddChild = row.depth < MAX_DEPTH - 1;
    const parent = row.parentId ? categories.find(c => c.id === row.parentId) : null;
    const blank = isBlankName(row.name);

    return (
      <div
        key={row.id}
        data-testid={`row-category-${row.id}`}
        className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 group transition-colors min-h-[${ROW_H}px] ${
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

        {/* Colour dot */}
        <div className="w-12 flex-shrink-0 flex items-center pl-2">
          <span className="w-3 h-3 rounded-full ring-1 ring-black/10 flex-shrink-0" style={{ backgroundColor: row.color || "#3b82f6" }} />
        </div>

        {/* Name (clickable → opens dialog) */}
        <button
          type="button"
          onClick={() => openDialog(row.id)}
          className="flex-1 min-w-0 flex items-center gap-2 pr-3 text-left"
          style={{ height: ROW_H }}
          title="Click to manage this category"
          data-testid={`btn-open-${row.id}`}
        >
          <span className={`px-2 truncate text-[13px] ${blank ? "text-red-500/80 italic font-medium" : "text-foreground hover:text-blue-600 dark:hover:text-blue-400"}`}>
            {blank ? "(unnamed — click to edit)" : row.name}
          </span>
          {row.hasChildren ? (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
              <GitBranch size={8} /> Group
            </span>
          ) : (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 border border-gray-200 dark:border-zinc-700">
              <FileText size={8} /> Leaf
            </span>
          )}
        </button>

        {/* Description (read-only) */}
        <div className="w-72 flex-shrink-0 pr-2 text-[13px] text-muted-foreground truncate" style={{ height: ROW_H, lineHeight: `${ROW_H}px` }}>
          {row.description ? <span className="px-2">{row.description}</span> : <span className="px-2 text-muted-foreground/40">—</span>}
        </div>

        {/* Parent */}
        <div className="w-52 flex-shrink-0 pr-2">
          {parent ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full ring-1 ring-black/10 flex-shrink-0" style={{ backgroundColor: parent.color || "#3b82f6" }} />
              <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 truncate">{parent.name || "(unnamed)"}</span>
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
              title={row.depth === 0 ? "Add sub-categories" : "Add sub-sub-categories"}
              onClick={() => openDialog(row.id, /* addEmpty */ true)}
              data-testid={`btn-add-child-${row.id}`}
            >
              <Plus size={13} />
            </button>
          )}
          {can("Edit Categories") && (
            <button
              className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              title="Edit"
              onClick={() => openDialog(row.id)}
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

  void isAuthenticated;

  // ── Dialog title context ──────────────────────────────────────────────────
  const dlgPath = getPath(categories, dlgParentId);
  const dlgChildLabel = dlgParentId === null
    ? "top-level categories"
    : (() => {
        const d = getDepth(categories, dlgParentId);
        return d === 0 ? "sub-categories" : "sub-sub-categories";
      })();

  // Orphan cleanup
  const orphans = categories.filter(c => isBlankName(c.name));

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Categories</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Click any category name to open its sub-categories · Three-level tree (Categories → Sub → Sub-sub)
          </p>
        </div>
        {can("Add Categories") && (
          <Button size="sm" onClick={() => openDialog(null, true)} className="gap-1.5" data-testid="btn-add-category">
            <Plus size={14} /> Add Categories
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
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search categories..." className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-[12px]"
          onClick={exportCsv}
          disabled={categories.length === 0}
          data-testid="btn-export-categories"
        >
          <Download size={12} /> Export CSV
        </Button>
        {orphans.length > 0 && can("Delete Categories") && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-[12px] text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={() => {
              orphans.forEach(o => {
                getAllDescendantIds(o.id).forEach(d => removeCategory(d));
                removeCategory(o.id);
              });
              toast({ title: "Cleaned up", description: `Removed ${orphans.length} unnamed ${orphans.length === 1 ? "row" : "rows"}.` });
            }}
            data-testid="btn-cleanup-unnamed"
          >
            <Trash2 size={12} /> Cleanup {orphans.length} unnamed
          </Button>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">
          {flatRows.length} of {categories.length}
        </div>
      </div>

      {/* Tree */}
      <div className="rounded-md border border-border overflow-hidden bg-card">
        {/* Header row */}
        <div className="flex items-center bg-gray-50 dark:bg-muted/40 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minHeight: 32 }}>
          <div className="flex-shrink-0 pl-3" style={{ width: 44 }}>Tree</div>
          <div className="w-8 flex-shrink-0">#</div>
          <div className="w-12 flex-shrink-0 pl-2">Col</div>
          <div className="flex-1 min-w-0 pr-3 pl-2">Category Name</div>
          <div className="w-72 flex-shrink-0 pr-2 pl-2">Description</div>
          <div className="w-52 flex-shrink-0 pr-2">Parent</div>
          <div className="w-24 flex-shrink-0 pr-2">Created</div>
          <div className="w-32 flex-shrink-0 text-right pr-3">Actions</div>
        </div>

        {/* Empty state */}
        {flatRows.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {search ? "No categories match your search." : "No categories yet. Click Add Categories to get started."}
          </div>
        )}

        {/* Rows */}
        {flatRows.map((row, idx) => renderRow(row, idx))}

        {/* Bottom add button */}
        {can("Add Categories") && categories.length > 0 && (
          <button
            onClick={() => openDialog(null, true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors border-t border-border"
            data-testid="btn-add-row"
          >
            <Plus size={13} /> Add categories
          </button>
        )}
      </div>

      {/* ─── Bulk-edit dialog ───────────────────────────────────────────────── */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderTree size={18} className="text-primary" />
              Manage {dlgChildLabel}
            </DialogTitle>
            <DialogDescription>
              You're editing the {dlgChildLabel} of <span className="font-semibold text-foreground">{dlgPath}</span>. Add as many rows as you need, then save.
            </DialogDescription>
          </DialogHeader>

          {/* Parent selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Parent category</label>
            <Select value={dlgParentId ?? "__root__"} onValueChange={v => handleParentChange(v === "__root__" ? null : v)}>
              <SelectTrigger className="h-9 text-[13px]" data-testid="dlg-parent-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parentOptions.map(o => (
                  <SelectItem key={o.id ?? "__root__"} value={o.id ?? "__root__"}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Pick a parent (or "Top level") — all rows below will be saved as direct children of it.
            </p>
          </div>

          {/* Rows */}
          <div className="border border-border rounded-md overflow-hidden max-h-[55vh] overflow-y-auto">
            <div className="flex items-center bg-gray-50 dark:bg-muted/40 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
              <div className="w-8 flex-shrink-0 text-center">#</div>
              <div className="w-10 flex-shrink-0 text-center">Col</div>
              <div className="flex-1 min-w-0 px-2">Name *</div>
              <div className="flex-1 min-w-0 px-2">Description</div>
              <div className="w-9 flex-shrink-0" />
            </div>

            {dlgRows.length === 0 && (
              <div className="text-center py-6 text-[12px] text-muted-foreground">No rows. Click "+ Add row" to begin.</div>
            )}

            {dlgRows.map((r, ri) => {
              const isExisting = !!r.id;
              const childCount = isExisting ? childCountOfPersisted(r.id!) : 0;
              const isPickerOpen = colorPickerUid === r.uid;
              return (
                <div
                  key={r.uid}
                  className={`flex items-start gap-1 px-2 py-1.5 border-b border-border last:border-0 ${
                    r._deleted ? "bg-red-50/60 dark:bg-red-950/20 opacity-60" :
                    !isExisting ? "bg-amber-50/40 dark:bg-amber-950/10" : ""
                  }`}
                >
                  <div className="w-8 flex-shrink-0 text-center text-[11px] text-muted-foreground font-mono pt-2">
                    {isExisting ? ri + 1 : "new"}
                  </div>

                  {/* Colour swatch (popover) */}
                  <div className="w-10 flex-shrink-0 pt-1.5 relative">
                    <button
                      type="button"
                      onClick={() => setColorPickerUid(isPickerOpen ? null : r.uid)}
                      className="w-6 h-6 rounded-full ring-2 ring-black/10 hover:ring-blue-400 transition-all mx-auto block"
                      style={{ backgroundColor: r.color }}
                      title="Change colour"
                    />
                    {isPickerOpen && (
                      <div className="absolute z-50 left-0 top-9 bg-popover border border-border rounded-md shadow-lg p-2 flex gap-1 flex-wrap w-44">
                        {PRESET_COLORS.map(pc => (
                          <button
                            key={pc.hex}
                            type="button"
                            title={pc.label}
                            onClick={() => { updateRow(r.uid, { color: pc.hex }); setColorPickerUid(null); }}
                            className={`w-5 h-5 rounded-full border-2 transition-all ${r.color === pc.hex ? "border-gray-700 dark:border-gray-300 scale-110" : "border-transparent hover:border-gray-400"}`}
                            style={{ backgroundColor: pc.hex }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0 px-1">
                    <Input
                      value={r.name}
                      onChange={e => updateRow(r.uid, { name: e.target.value })}
                      placeholder={isExisting ? "Name (required)" : "New category name"}
                      className={`h-8 text-[13px] ${r._deleted ? "line-through" : ""}`}
                      disabled={r._deleted}
                      data-testid={`dlg-row-name-${ri}`}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          // Tab to next row's name OR add new row
                          if (ri === dlgRows.length - 1) addRow();
                          else (document.querySelector(`[data-testid='dlg-row-name-${ri + 1}']`) as HTMLInputElement | null)?.focus();
                        }
                      }}
                    />
                    {isExisting && childCount > 0 && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 px-1">
                        {childCount} sub-{childCount === 1 ? "category" : "categories"} {r._deleted && "will be deleted"}
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div className="flex-1 min-w-0 px-1">
                    <Input
                      value={r.description}
                      onChange={e => updateRow(r.uid, { description: e.target.value })}
                      placeholder="Description (optional)"
                      className="h-8 text-[13px]"
                      disabled={r._deleted}
                    />
                  </div>

                  {/* Delete / undo */}
                  <div className="w-9 flex-shrink-0 flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => removeRow(r.uid)}
                      className={`p-1.5 rounded-md transition-colors ${
                        r._deleted ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" : "text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                      }`}
                      title={r._deleted ? "Restore" : "Delete row"}
                    >
                      {r._deleted ? <Save size={13} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add another row */}
            <button
              type="button"
              onClick={addRow}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[12px] text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors border-t border-border"
              data-testid="dlg-add-row"
            >
              <Plus size={13} /> Add another row
            </button>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDlgOpen(false)} className="gap-1"><X size={14} /> Cancel</Button>
            <Button onClick={saveDialog} className="gap-1" data-testid="dlg-save"><Save size={14} /> Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm (from tree row trash icon) */}
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
