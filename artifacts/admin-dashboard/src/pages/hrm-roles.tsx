import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStaffRoles, useStaff } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { StaffRole } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Plus, X, Save, Trash2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG, PRESET_COLORS } from "@/components/editable-cell";

// ─── 4-level permissions catalog ─────────────────────────────────────────────
type PermAction = "view" | "add" | "edit" | "delete";
type PermModule = { label: string; prefix: string; actions: PermAction[] };
type PermGroup  = { group: string; modules: PermModule[] };

const PERMISSION_GROUPS: PermGroup[] = [
  {
    group: "Dashboard",
    modules: [
      { label: "Dashboard",   prefix: "Dashboard",   actions: ["view"] },
    ],
  },
  {
    group: "CRM",
    modules: [
      { label: "Leads",     prefix: "Leads",     actions: ["view","add","edit","delete"] },
      { label: "Customers", prefix: "Customers", actions: ["view","add","edit","delete"] },
      { label: "Suppliers", prefix: "Suppliers", actions: ["view","add","edit","delete"] },
    ],
  },
  {
    group: "Sales",
    modules: [
      { label: "Sales / POS",   prefix: "Sales",        actions: ["view","add","edit","delete"] },
      { label: "Invoices",      prefix: "Invoices",     actions: ["view","add","edit","delete"] },
      { label: "Sale Returns",  prefix: "Sale Returns", actions: ["view","add","delete"] },
      { label: "Sales Agents",  prefix: "Agents",       actions: ["view","add","edit","delete"] },
    ],
  },
  {
    group: "Purchases",
    modules: [
      { label: "Purchases", prefix: "Purchases", actions: ["view","add","edit","delete"] },
    ],
  },
  {
    group: "Products",
    modules: [
      { label: "Products",   prefix: "Products",   actions: ["view","add","edit","delete"] },
      { label: "Brands",     prefix: "Brands",     actions: ["view","add","edit","delete"] },
      { label: "Categories", prefix: "Categories", actions: ["view","add","edit","delete"] },
      { label: "Attributes", prefix: "Attributes", actions: ["view","add","edit","delete"] },
      { label: "Units",      prefix: "Units",      actions: ["view","add","edit","delete"] },
    ],
  },
  {
    group: "Stock & Manufacturing",
    modules: [
      { label: "Stock / Inventory", prefix: "Stock",         actions: ["view","edit"] },
      { label: "Raw Materials",     prefix: "Raw Materials", actions: ["view","add","edit","delete"] },
      { label: "Manufacturing",     prefix: "Manufacturing", actions: ["view","add","edit","delete"] },
    ],
  },
  {
    group: "Repair",
    modules: [
      { label: "Repairs", prefix: "Repairs", actions: ["view","add","edit","delete"] },
    ],
  },
  {
    group: "Accounting",
    modules: [
      { label: "Chart of Accounts",      prefix: "Chart of Accounts", actions: ["view","add","edit","delete"] },
      { label: "Journal Entries",        prefix: "Journal",            actions: ["view","add","edit","delete"] },
      { label: "Receipts & Payments",    prefix: "Receipts",           actions: ["view","add","edit","delete"] },
      { label: "Financial Reports",      prefix: "Fin Reports",        actions: ["view"] },
    ],
  },
  {
    group: "HRM",
    modules: [
      { label: "Staff", prefix: "Staff", actions: ["view","add","edit","delete"] },
      { label: "Roles", prefix: "Roles", actions: ["view","add","edit","delete"] },
    ],
  },
  {
    group: "Documents & Media",
    modules: [
      { label: "Documents",    prefix: "Documents", actions: ["view","add","edit","delete"] },
      { label: "Media Library",prefix: "Media",     actions: ["view","add","delete"] },
    ],
  },
  {
    group: "System",
    modules: [
      { label: "Settings", prefix: "Settings", actions: ["view","edit"] },
    ],
  },
];

function permKey(prefix: string, action: PermAction): string {
  return `${action.charAt(0).toUpperCase()}${action.slice(1)} ${prefix}`;
}

function allPermsForGroup(group: PermGroup): string[] {
  return group.modules.flatMap(m => m.actions.map(a => permKey(m.prefix, a)));
}

type EditableField = "color" | "name" | "description";
const BLANK = (): Record<EditableField, string> => ({ color: PRESET_COLORS[0].hex, name: "", description: "" });

const COLS: ColDef[] = [
  { field: "color",       label: "Colour",      minW: 130, type: "color" },
  { field: "name",        label: "Role Name",   minW: 200, type: "text"  },
  { field: "description", label: "Description", minW: 260, type: "text"  },
  { field: "_permCount",  label: "Permissions", minW: 140, type: "readonly" },
  { field: "_staffCount", label: "Staff",       minW: 80,  type: "readonly" },
];
const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

// ─── Permissions dialog — 4-level table grid ─────────────────────────────────
const ACTIONS: PermAction[] = ["view","add","edit","delete"];
const ACTION_LABELS: Record<PermAction,string> = { view:"View", add:"Add", edit:"Edit", delete:"Delete" };
const ACTION_COLORS: Record<PermAction,string> = {
  view:   "text-blue-600 dark:text-blue-400",
  add:    "text-emerald-600 dark:text-emerald-400",
  edit:   "text-amber-600 dark:text-amber-400",
  delete: "text-red-600 dark:text-red-400",
};
const ACTION_ACCENT: Record<PermAction,string> = {
  view:   "accent-blue-600",
  add:    "accent-emerald-600",
  edit:   "accent-amber-600",
  delete: "accent-red-600",
};

function PermissionsDialog({
  role, onClose, onSave,
}: { role: StaffRole; onClose: () => void; onSave: (permissions: string) => void }) {
  const initial = useMemo(
    () => new Set(role.permissions.split(",").map(s => s.trim()).filter(Boolean)),
    [role.permissions]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));

  const toggle = (key: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleGroup = (g: PermGroup) => {
    const all = allPermsForGroup(g);
    const allOn = all.every(k => selected.has(k));
    setSelected(prev => {
      const n = new Set(prev);
      allOn ? all.forEach(k => n.delete(k)) : all.forEach(k => n.add(k));
      return n;
    });
  };

  const toggleCol = (action: PermAction) => {
    const keys = PERMISSION_GROUPS.flatMap(g =>
      g.modules.filter(m => m.actions.includes(action)).map(m => permKey(m.prefix, action))
    );
    const allOn = keys.every(k => selected.has(k));
    setSelected(prev => {
      const n = new Set(prev);
      allOn ? keys.forEach(k => n.delete(k)) : keys.forEach(k => n.add(k));
      return n;
    });
  };

  const handleSave = () => { onSave([...selected].join(", ")); onClose(); };

  const totalPerms = PERMISSION_GROUPS.flatMap(g => allPermsForGroup(g)).length;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 gap-0">
        {/* ── Header ── */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: role.color }} />
            Permissions — {role.name || "New Role"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Table ── */}
        <div className="overflow-y-auto flex-1 px-2 py-2">
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            {/* sticky column headers */}
            <thead>
              <tr className="sticky top-0 z-10 bg-white dark:bg-card">
                <th className="text-left pl-3 py-2 font-semibold text-muted-foreground w-48">Feature</th>
                {ACTIONS.map(a => (
                  <th key={a} className="text-center py-2 w-20">
                    <button
                      onClick={() => toggleCol(a)}
                      className={`font-semibold hover:underline ${ACTION_COLORS[a]}`}
                      title={`Toggle all ${ACTION_LABELS[a]}`}
                    >
                      {ACTION_LABELS[a]}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map(g => {
                const gPerms = allPermsForGroup(g);
                const gAllOn = gPerms.every(k => selected.has(k));
                const gSomeOn = gPerms.some(k => selected.has(k));
                return [
                  /* Group header row */
                  <tr key={`hdr-${g.group}`} className="bg-gray-50 dark:bg-muted/20">
                    <td colSpan={5} className="pl-3 py-1.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={gAllOn}
                          ref={el => { if (el) el.indeterminate = !gAllOn && gSomeOn; }}
                          onChange={() => toggleGroup(g)}
                          className="accent-blue-600 w-3.5 h-3.5"
                        />
                        <span className="font-semibold text-[11px] uppercase tracking-widest text-gray-600 dark:text-gray-300">
                          {g.group}
                        </span>
                      </label>
                    </td>
                  </tr>,
                  /* Module rows */
                  ...g.modules.map(m => (
                    <tr key={`${g.group}-${m.prefix}`} className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors">
                      <td className="pl-6 pr-2 py-1 text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-border/40">{m.label}</td>
                      {ACTIONS.map(a => {
                        const has = m.actions.includes(a);
                        const key = permKey(m.prefix, a);
                        return (
                          <td key={a} className="text-center py-1 border-b border-gray-100 dark:border-border/40">
                            {has ? (
                              <input
                                type="checkbox"
                                checked={selected.has(key)}
                                onChange={() => toggle(key)}
                                className={`${ACTION_ACCENT[a]} w-3.5 h-3.5 cursor-pointer`}
                              />
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-[10px]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            {selected.size} / {totalPerms} permissions selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} className="gap-1.5"><Save size={13} /> Save Permissions</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HrmRolesPage() {
  const { roles, addRole, editRole, removeRole } = useStaffRoles();
  const { staff } = useStaff();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [permRoleId,   setPermRoleId]   = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // staff count per role
  const staffByRole = useMemo(() => {
    const m: Record<string, number> = {};
    staff.forEach(s => { m[s.role] = (m[s.role] ?? 0) + 1; });
    return m;
  }, [staff]);

  // rows augmented with computed cols
  const rows = useMemo(() => roles.map(r => ({
    ...r,
    _permCount: r.permissions.split(",").filter(s => s.trim()).length + " perms",
    _staffCount: String(staffByRole[r.name] ?? 0),
  })), [roles, staffByRole]);

  // ── cell commit ──
  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const r = roles.find(x => x.id === id);
    if (!r || (r as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editRole(id, { [field]: value });
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [roles, editRole, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const visibleCols = COLS.filter(c => c.type !== "readonly");
    const rowIds = rows.map(r => r.id);
    const ri = rowIds.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    const maxEditCol = visibleCols.length - 1;
    if (nc > maxEditCol) { nc = 0; nr++; }
    if (nc < 0) { nc = maxEditCol; nr--; }
    if (nr < 0 || nr >= rowIds.length) { setActiveCell(null); return; }
    setActiveCell({ id: rowIds[nr], col: nc });
  }, [rows]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rowIds = rows.map(r => r.id);
    const ri = rowIds.indexOf(id);
    if (ri + 1 >= rowIds.length) { setActiveCell(null); return; }
    setActiveCell({ id: rowIds[ri + 1], col });
  }, [rows]);

  const navigateNewRow = (col: number, shift: boolean) => {
    const nc = col + (shift ? -1 : 1);
    const editableCols = COLS.filter(c => c.type !== "readonly");
    if (nc >= editableCols.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow?.name.trim()) { toast({ title: "Role name is required", variant: "destructive" }); setNewRowActive(1); return; }
    addRole({ color: newRow.color, name: newRow.name, description: newRow.description, permissions: "" });
    toast({ title: "Role created", description: `"${newRow.name}" added.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const r = roles.find(x => x.id === deleteId);
    removeRole(deleteId);
    toast({ title: "Role deleted", description: `"${r?.name}" removed.` });
    setDeleteId(null);
  };

  const handleSavePermissions = (id: string, permissions: string) => {
    editRole(id, { permissions });
    toast({ title: "Permissions saved" });
  };

  const editableCols = COLS.filter(c => c.type !== "readonly");

  const permRole = roles.find(r => r.id === permRoleId) ?? null;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound size={22} className="text-zinc-500" /> Roles & Permissions
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Define roles and configure which permissions each role carries</p>
        </div>
        {can("Add Roles") && (
          <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5" disabled={!!newRow}>
            <Plus size={14} /> New Role
          </Button>
        )}
      </div>

      {/* Hint if no roles */}
      {roles.length === 0 && !newRow && (
        <div className="rounded-lg border border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 px-4 py-3 text-[13px] text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <KeyRound size={14} />
          Create roles here, then assign them to Staff members. Click <strong>New Role</strong> to begin.
        </div>
      )}

      {/* Stats */}
      {roles.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-[12px] font-semibold text-gray-700 dark:text-gray-300">
            Total roles: {roles.length}
          </div>
          {roles.map(r => (
            <div key={r.id} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium"
              style={{ background: r.color + "22", color: r.color, border: `1.5px solid ${r.color}44` }}>
              <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
              {r.name}: {staffByRole[r.name] ?? 0}
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>
          {/* New row */}
          {can("Add Roles") && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: CELL_H }}>★</td>
              {COLS.map((c, ci) => {
                const editIdx = editableCols.indexOf(c);
                const isA = newRowActive === editIdx && editIdx !== -1;
                const isReadonly = c.type === "readonly";
                const val = isReadonly ? "" : newRow[c.field as EditableField] ?? "";
                if (isReadonly) return (
                  <td key={c.field} className="border-r border-gray-100 dark:border-border p-0" style={{ height: CELL_H }}>
                    <div className="w-full h-full flex items-center justify-center text-[12px] text-gray-300">—</div>
                  </td>
                );
                return (
                  <td key={c.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                    style={{ height: CELL_H }}>
                    {isA && c.type === "color" ? (
                      <div className="absolute inset-0 flex items-center px-3 gap-2">
                        <span className="text-[12px] text-muted-foreground">Colour:</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {PRESET_COLORS.map(col => (
                            <button key={col.hex} onClick={() => { setNewRow(r => r ? { ...r, color: col.hex } : r); setNewRowActive(1); }}
                              className={`w-5 h-5 rounded-full border-2 ${val === col.hex ? "border-gray-700" : "border-transparent hover:border-gray-400"}`}
                              style={{ background: col.hex }} />
                          ))}
                        </div>
                      </div>
                    ) : isA ? (
                      <input autoFocus type="text" value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(editIdx, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); editIdx === editableCols.length - 1 ? commitNewRow() : navigateNewRow(editIdx, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(editIdx)}>
                        {c.field === "color" ? (
                          <span className="w-4 h-4 rounded-full" style={{ background: val || "#94a3b8" }} />
                        ) : (
                          <span className={`truncate text-[13px] ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: CELL_H }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Save"><Save size={13} /></button>
                  <button onClick={() => { setNewRow(null); setNewRowActive(null); }} className="p-1 rounded text-red-400 hover:bg-red-50" title="Cancel"><X size={13} /></button>
                </div>
              </td>
            </tr>
          )}

          {/* Existing rows */}
          {rows.length === 0 ? (
            <tr><td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
              No roles yet. Click New Role to create one.
            </td></tr>
          ) : rows.map((row, ri) => {
            const role = roles.find(r => r.id === row.id)!;
            const isRowActive = activeCell?.id === row.id;
            return (
              <tr key={row.id}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: CELL_H }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const editIdx = editableCols.findIndex(x => x.field === c.field);
                  const isA = activeCell?.id === row.id && activeCell.col === editIdx && editIdx !== -1;
                  const rawVal = String((row as unknown as Record<string, string>)[c.field] ?? "");
                  const canEdit = can("Edit Roles") && c.type !== "readonly";

                  // permissions count cell — clickable to open permissions dialog
                  if (c.field === "_permCount") return (
                    <td key={c.field} className="border-r border-gray-100 dark:border-border p-0" style={{ height: CELL_H }}>
                      <div className="w-full h-full flex items-center px-3 gap-2">
                        <span className="text-[12px] text-gray-600 dark:text-gray-400">{rawVal}</span>
                        {can("Edit Roles") && (
                          <button onClick={() => setPermRoleId(row.id)}
                            className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors opacity-0 group-hover:opacity-100"
                            title="Edit permissions">
                            <Settings2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  );

                  if (c.field === "_staffCount") return (
                    <td key={c.field} className="border-r border-gray-100 dark:border-border p-0 text-center" style={{ height: CELL_H }}>
                      <span className="text-[13px] text-gray-600 dark:text-gray-400">{rawVal}</span>
                    </td>
                  );

                  return (
                    <td key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : canEdit ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: CELL_H }}
                      onClick={() => !isA && canEdit && setActiveCell({ id: row.id, col: editIdx })}>
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={canEdit}
                        onActivate={() => setActiveCell({ id: row.id, col: editIdx })}
                        onCommit={v => commitCell(row.id, c.field as EditableField, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={s => navigateCell(row.id, editIdx, s)}
                        onEnter={() => moveCellDown(row.id, editIdx)}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: CELL_H }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {can("Edit Roles") && (
                      <button className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        title="Edit permissions" onClick={() => setPermRoleId(row.id)}>
                        <Settings2 size={13} />
                      </button>
                    )}
                    {can("Delete Roles") && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Delete role" onClick={() => setDeleteId(row.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Add row */}
          {can("Add Roles") && !newRow && (
            <tr><td colSpan={COLS.length + 2}>
              <button onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                <Plus size={13} /> Add role
              </button>
            </td></tr>
          )}
        </ExcelGridShell>
      </div>

      {/* Permissions dialog */}
      {permRole && (
        <PermissionsDialog
          role={permRole}
          onClose={() => setPermRoleId(null)}
          onSave={p => handleSavePermissions(permRole.id, p)}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              "{roles.find(r => r.id === deleteId)?.name}" will be permanently deleted. Staff assigned this role will retain the role name but it will be unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
