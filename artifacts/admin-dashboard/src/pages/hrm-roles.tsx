import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStaffRoles, useStaff } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { StaffRole } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Plus, X, Save, Trash2, Settings2, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG, PRESET_COLORS } from "@/components/editable-cell";

// ─── Permissions catalog ──────────────────────────────────────────────────────
const PERMISSION_GROUPS = [
  { group: "Dashboard",  perms: ["View Dashboard"] },
  { group: "CRM",        perms: ["View Leads", "Manage Leads", "View Customers", "Manage Customers", "View Suppliers", "Manage Suppliers"] },
  { group: "Products",   perms: ["View Products", "Manage Products", "View Brands", "Manage Brands", "View Categories", "Manage Categories", "View Attributes", "Manage Attributes"] },
  { group: "Purchases",  perms: ["View Purchases", "Manage Purchases"] },
  { group: "Documents",  perms: ["View Documents", "Manage Documents"] },
  { group: "HRM",        perms: ["View Staff", "Manage Staff", "View Roles", "Manage Roles"] },
  { group: "System",     perms: ["Manage Admin Accounts", "Manage Settings"] },
];

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

// ─── Permissions dialog ───────────────────────────────────────────────────────
function PermissionsDialog({
  role, onClose, onSave,
}: { role: StaffRole; onClose: () => void; onSave: (permissions: string) => void }) {
  const current = useMemo(() => new Set(role.permissions.split(",").map(s => s.trim()).filter(Boolean)), [role.permissions]);
  const [selected, setSelected] = useState<Set<string>>(new Set(current));

  const togglePerm = (p: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const toggleGroup = (perms: string[]) => {
    const allOn = perms.every(p => selected.has(p));
    setSelected(prev => {
      const n = new Set(prev);
      allOn ? perms.forEach(p => n.delete(p)) : perms.forEach(p => n.add(p));
      return n;
    });
  };

  const handleSave = () => {
    onSave([...selected].join(", "));
    onClose();
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: role.color }} />
            Permissions — {role.name || "New Role"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {PERMISSION_GROUPS.map(({ group, perms }) => {
            const allOn = perms.every(p => selected.has(p));
            const someOn = perms.some(p => selected.has(p));
            return (
              <div key={group} className="border rounded-lg p-3 bg-gray-50/60 dark:bg-muted/20">
                <button
                  className="flex items-center gap-2 w-full mb-2 group"
                  onClick={() => toggleGroup(perms)}>
                  {allOn ? (
                    <CheckSquare size={15} className="text-blue-600 flex-shrink-0" />
                  ) : someOn ? (
                    <div className="w-[15px] h-[15px] flex-shrink-0 border-2 border-blue-400 rounded-sm bg-blue-100 dark:bg-blue-900" />
                  ) : (
                    <Square size={15} className="text-gray-400 flex-shrink-0" />
                  )}
                  <span className="font-semibold text-[12px] text-gray-700 dark:text-gray-200 uppercase tracking-wide">{group}</span>
                </button>
                <div className="space-y-1.5 pl-1">
                  {perms.map(p => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer text-[12px] group/item">
                      <input type="checkbox" checked={selected.has(p)} onChange={() => togglePerm(p)}
                        className="accent-blue-600 w-3.5 h-3.5 rounded" />
                      <span className={`${selected.has(p) ? "text-gray-800 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"} group-hover/item:text-gray-800 dark:group-hover/item:text-gray-100 transition-colors`}>{p}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pt-1 text-xs text-muted-foreground">
          {selected.size} permission{selected.size !== 1 ? "s" : ""} selected
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="gap-1.5"><Save size={14} /> Save Permissions</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HrmRolesPage() {
  const { roles, addRole, editRole, removeRole } = useStaffRoles();
  const { staff } = useStaff();
  const { isAuthenticated } = useAuth();
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
        {isAuthenticated && (
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
          {isAuthenticated && newRow && (
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
                  const canEdit = isAuthenticated && c.type !== "readonly";

                  // permissions count cell — clickable to open permissions dialog
                  if (c.field === "_permCount") return (
                    <td key={c.field} className="border-r border-gray-100 dark:border-border p-0" style={{ height: CELL_H }}>
                      <div className="w-full h-full flex items-center px-3 gap-2">
                        <span className="text-[12px] text-gray-600 dark:text-gray-400">{rawVal}</span>
                        {isAuthenticated && (
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
                    {isAuthenticated && (
                      <>
                        <button className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                          title="Edit permissions" onClick={() => setPermRoleId(row.id)}>
                          <Settings2 size={13} />
                        </button>
                        <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Delete role" onClick={() => setDeleteId(row.id)}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Add row */}
          {isAuthenticated && !newRow && (
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
