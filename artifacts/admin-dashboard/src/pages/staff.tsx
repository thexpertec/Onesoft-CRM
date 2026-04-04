import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStaff, useStaffRoles } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Staff, StaffStatus } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Users2, Plus, Search, X, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTS: StaffStatus[] = ["Active", "On Leave", "Terminated"];
const STATUS_BG: Record<StaffStatus, string> = {
  "Active":     "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "On Leave":   "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  "Terminated": "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
};

const DEPT_SUGGESTIONS = ["Management","Sales","Marketing","Development","Design","Finance","HR","Operations","Customer Support","Legal","IT","Procurement"];
const DESIG_SUGGESTIONS = ["CEO","CTO","CFO","COO","Manager","Senior Developer","Developer","Designer","Sales Executive","HR Executive","Accountant","Analyst","Team Lead","Intern","Director","Associate"];

type EditableField = "name" | "department" | "designation" | "role" | "status" | "email" | "phone" | "joinDate" | "notes";
const BLANK = (): Record<EditableField, string> => ({
  name: "", department: "", designation: "", role: "", status: "Active",
  email: "", phone: "", joinDate: new Date().toISOString().slice(0, 10), notes: "",
});

const COLS: ColDef[] = [
  { field: "name",        label: "Full Name",    minW: 180, type: "text"   },
  { field: "department",  label: "Department",   minW: 150, type: "text"   },
  { field: "designation", label: "Designation",  minW: 150, type: "text"   },
  { field: "role",        label: "Role",         minW: 130, type: "text"   },
  { field: "status",      label: "Status",       minW: 120, type: "select", options: STATUS_OPTS as unknown as string[] },
  { field: "email",       label: "Email",        minW: 185, type: "email"  },
  { field: "phone",       label: "Phone",        minW: 130, type: "tel"    },
  { field: "joinDate",    label: "Join Date",    minW: 120, type: "date"   },
];
const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

// ─── Component ────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const { staff, addStaff, editStaff, removeStaff } = useStaff();
  const { roles } = useStaffRoles();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const roleNames = useMemo(() => roles.map(r => r.name), [roles]);

  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [deptFilter,   setDeptFilter]   = useState<string>("All");
  const [search,       setSearch]       = useState("");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── unique departments for filter pills ──
  const departments = useMemo(() => {
    const depts = [...new Set(staff.map(s => s.department).filter(Boolean))].sort();
    return depts;
  }, [staff]);

  const filtered = useMemo(() => {
    let rows = [...staff];
    if (statusFilter !== "All") rows = rows.filter(s => s.status === statusFilter);
    if (deptFilter  !== "All") rows = rows.filter(s => s.department === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.designation.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q),
      );
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [staff, statusFilter, deptFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: staff.length };
    STATUS_OPTS.forEach(s => { c[s] = staff.filter(m => m.status === s).length; });
    return c;
  }, [staff]);

  // ── cell commit ──
  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const s = staff.find(m => m.id === id);
    if (!s || (s as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editStaff(id, { [field]: value } as Partial<Staff>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [staff, editStaff, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = newRow ? [NEW_ROW_ID, ...filtered.map(s => s.id)] : filtered.map(s => s.id);
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(nc); }
    else setActiveCell({ id: nid, col: nc });
  }, [filtered, newRow]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = filtered.map(s => s.id);
    const ri = rows.indexOf(id);
    if (ri + 1 >= rows.length) { setActiveCell(null); return; }
    setActiveCell({ id: rows[ri + 1], col });
  }, [filtered]);

  const navigateNewRow = (col: number, shift: boolean) => {
    const nc = col + (shift ? -1 : 1);
    if (nc >= COLS.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow?.name.trim()) { toast({ title: "Full name is required", variant: "destructive" }); setNewRowActive(0); return; }
    addStaff({ ...newRow, status: newRow.status as StaffStatus });
    toast({ title: "Staff member added", description: `"${newRow.name}" added.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const s = staff.find(m => m.id === deleteId);
    removeStaff(deleteId);
    toast({ title: "Staff member removed", description: `"${s?.name}" removed.` });
    setDeleteId(null);
  };

  // ── pills ──
  const statusPills = [
    { label: "Total",      filter: "All",        color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300", ring: "ring-gray-400" },
    { label: "Active",     filter: "Active",      color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-500" },
    { label: "On Leave",   filter: "On Leave",   color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300", ring: "ring-amber-400" },
    { label: "Terminated", filter: "Terminated", color: "bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400", ring: "ring-red-500" },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* datalists */}
      <datalist id="dept-list">{DEPT_SUGGESTIONS.map(d => <option key={d} value={d} />)}</datalist>
      <datalist id="desig-list">{DESIG_SUGGESTIONS.map(d => <option key={d} value={d} />)}</datalist>
      <datalist id="role-list">{roleNames.map(r => <option key={r} value={r} />)}</datalist>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users2 size={22} className="text-zinc-500" /> Staff
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · organised by department & designation</p>
        </div>
        {isAuthenticated && (
          <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5" disabled={!!newRow}>
            <Plus size={14} /> Add Staff
          </Button>
        )}
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {statusPills.map(p => {
          const isActive = statusFilter === p.filter;
          return (
            <button key={p.label} aria-pressed={isActive}
              onClick={() => setStatusFilter(prev => prev === p.filter && p.filter !== "All" ? "All" : p.filter)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] ${p.color} ${isActive ? `ring-2 ring-offset-1 ${p.ring} shadow-sm font-bold` : "ring-0 opacity-80 hover:opacity-100"}`}>
              {p.label}: <span>{counts[p.filter] ?? 0}</span>
              {isActive && p.filter !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
            </button>
          );
        })}

        {/* Dept filter pills */}
        {departments.length > 0 && (
          <>
            <span className="text-xs text-zinc-400 ml-2 mr-0.5">Dept:</span>
            {departments.map(dept => {
              const isA = deptFilter === dept;
              return (
                <button key={dept} aria-pressed={isA}
                  onClick={() => setDeptFilter(prev => prev === dept ? "All" : dept)}
                  className={`text-xs font-medium rounded-full px-2.5 py-1 transition-all ${isA ? "bg-blue-600 text-white ring-2 ring-blue-400" : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100"}`}>
                  {dept}{isA && " ×"}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search name, dept, role…" className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {staff.length}</div>
      </div>

      {/* Grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>
          {/* New row */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: CELL_H }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field as EditableField] ?? "";
                return (
                  <td key={c.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                    style={{ height: CELL_H }}>
                    {isA && c.type === "select" ? (
                      <select autoFocus value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground">
                        {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : isA && c.type === "date" ? (
                      <input autoFocus type="date" value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground" />
                    ) : isA ? (
                      <input autoFocus type={c.type === "email" ? "email" : c.type === "tel" ? "tel" : "text"} value={val} placeholder={c.label}
                        list={c.field === "department" ? "dept-list" : c.field === "designation" ? "desig-list" : c.field === "role" ? "role-list" : undefined}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                        {c.field === "status" && val ? (
                          <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${STATUS_BG[val as StaffStatus] ?? ""}`}>{val}</span>
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
          {filtered.length === 0 ? (
            <tr><td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
              {search || statusFilter !== "All" || deptFilter !== "All"
                ? "No staff match your filters."
                : "No staff yet. Click Add Staff to get started."}
            </td></tr>
          ) : filtered.map((member, ri) => {
            const isRowActive = activeCell?.id === member.id;
            return (
              <tr key={member.id}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: CELL_H }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === member.id && activeCell.col === ci;
                  const rawVal = String((member as unknown as Record<string, string>)[c.field] ?? "");
                  const canEdit = isAuthenticated;
                  return (
                    <td key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : canEdit ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: CELL_H }}
                      onClick={() => !isA && canEdit && setActiveCell({ id: member.id, col: ci })}>
                      {c.field === "status" ? (
                        isA ? (
                          <div className="absolute inset-0 flex items-center gap-1 px-2 bg-white dark:bg-card z-20">
                            {STATUS_OPTS.map(s => (
                              <button key={s} data-testid={`status-opt-${s.replace(/ /g, "-")}`}
                                onClick={() => commitCell(member.id, "status", s)}
                                onKeyDown={e => { if (e.key === "Escape") setActiveCell(null); }}
                                className={`text-[11px] font-medium rounded px-2 py-0.5 whitespace-nowrap ${STATUS_BG[s]} ${rawVal === s ? "ring-2 ring-offset-1 ring-gray-400 opacity-100" : "opacity-60 hover:opacity-100"}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center px-3 cursor-pointer">
                            <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${STATUS_BG[rawVal as StaffStatus] ?? ""}`}>{rawVal}</span>
                          </div>
                        )
                      ) : (
                        <EditableCell
                          value={rawVal} col={c} active={isA} canEdit={canEdit}
                          onActivate={() => setActiveCell({ id: member.id, col: ci })}
                          onCommit={v => commitCell(member.id, c.field as EditableField, v)}
                          onCancel={() => setActiveCell(null)}
                          onTab={s => navigateCell(member.id, ci, s)}
                          onEnter={() => moveCellDown(member.id, ci)}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: CELL_H }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isAuthenticated && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Remove"
                        onClick={() => setDeleteId(member.id)}>
                        <Trash2 size={13} />
                      </button>
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
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                data-testid="btn-add-staff-row">
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
            <AlertDialogTitle>Remove staff member?</AlertDialogTitle>
            <AlertDialogDescription>
              "{staff.find(s => s.id === deleteId)?.name}" will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
