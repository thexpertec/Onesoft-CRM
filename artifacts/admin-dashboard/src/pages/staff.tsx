import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useStaff, useStaffRoles } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Staff, StaffStatus, getDepartments, getDesignations } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Users2, Plus, Search, X, Save, Trash2, KeyRound, Eye, EyeOff, ShieldCheck, ShieldOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";
import { Combobox, ComboOption } from "@/components/combobox";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTS: StaffStatus[] = ["Active", "On Leave", "Terminated"];
const STATUS_BG: Record<StaffStatus, string> = {
  "Active":     "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "On Leave":   "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  "Terminated": "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
};


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
  const [, nav] = useLocation();
  const { staff, addStaff, editStaff, removeStaff } = useStaff();
  const { roles } = useStaffRoles();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const roleNames   = useMemo(() => roles.map(r => r.name), [roles]);
  const allDepts    = useMemo(() => getDepartments().filter(d => d.isActive), []);
  const allDesigs   = useMemo(() => getDesignations().filter(d => d.isActive), []);

  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [deptFilter,   setDeptFilter]   = useState<string>("All");
  const [search,       setSearch]       = useState("");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [loginTarget,  setLoginTarget]  = useState<Staff | null>(null);
  const [loginForm,    setLoginForm]    = useState({ enabled: false, username: "", password: "" });
  const [showLoginPwd, setShowLoginPwd] = useState(false);
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

  // ── Combobox options ──
  const deptComboOpts  = useMemo<ComboOption[]>(() => allDepts.map(d => ({ value: d.name,  label: d.name,  sub: d.headOf || undefined })), [allDepts]);
  const desigComboOpts = useMemo<ComboOption[]>(() => allDesigs.map(d => ({ value: d.title, label: d.title, sub: d.department || undefined })), [allDesigs]);
  const roleComboOpts  = useMemo<ComboOption[]>(() => roleNames.map(r => ({ value: r, label: r })), [roleNames]);

  // ── Smart designation filter: only show designations for selected department ──
  const desigOptsForDept = useCallback((dept: string): ComboOption[] => {
    if (!dept) return desigComboOpts;
    const filtered = allDesigs.filter(d => d.department === dept).map(d => ({ value: d.title, label: d.title }));
    return filtered.length > 0 ? filtered : desigComboOpts;
  }, [allDesigs, desigComboOpts]);

  const filtered = useMemo(() => {
    let rows = [...staff];
    if (statusFilter !== "All") rows = rows.filter(s => s.status === statusFilter);
    if (deptFilter  !== "All") rows = rows.filter(s => s.department === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        [s.name, s.email, s.phone, s.department, s.designation, s.role, s.status].some(v => v?.toLowerCase().includes(q)),
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

  const isDefaultDirector = (member: Staff) => member.username === "director";

  const handleDelete = () => {
    if (!deleteId) return;
    const s = staff.find(m => m.id === deleteId);
    if (s && isDefaultDirector(s)) {
      toast({ title: "Cannot delete default user", description: "The Director account is a system default and cannot be removed.", variant: "destructive" });
      setDeleteId(null);
      return;
    }
    removeStaff(deleteId);
    toast({ title: "Staff member removed", description: `"${s?.name}" removed.` });
    setDeleteId(null);
  };

  const openLoginDialog = (member: Staff) => {
    setLoginTarget(member);
    setLoginForm({
      enabled:  member.loginEnabled ?? false,
      username: member.username ?? member.name.toLowerCase().replace(/\s+/g, "."),
      password: member.password ?? "",
    });
    setShowLoginPwd(false);
  };

  const saveLoginAccess = () => {
    if (!loginTarget) return;
    if (loginForm.enabled) {
      if (!loginForm.username.trim()) {
        toast({ title: "Username is required", variant: "destructive" }); return;
      }
      if (loginForm.password.length < 6) {
        toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return;
      }
      // Check uniqueness — no two staff with same username
      const conflict = staff.find(
        s => s.id !== loginTarget.id &&
             s.loginEnabled &&
             s.username?.toLowerCase() === loginForm.username.trim().toLowerCase()
      );
      if (conflict) {
        toast({ title: `Username "${loginForm.username.trim()}" is already taken`, variant: "destructive" }); return;
      }
    }
    editStaff(loginTarget.id, {
      loginEnabled: loginForm.enabled,
      username:     loginForm.enabled ? loginForm.username.trim() : undefined,
      password:     loginForm.enabled ? loginForm.password : undefined,
    });
    toast({
      title: loginForm.enabled ? "Login access enabled" : "Login access disabled",
      description: loginForm.enabled
        ? `${loginTarget.name} can now log in as "${loginForm.username.trim()}"`
        : `${loginTarget.name} can no longer log in`,
    });
    setLoginTarget(null);
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
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users2 size={22} className="text-zinc-500" /> Staff
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · organised by department & designation</p>
        </div>
        {can("Add Staff") && (
          <Button size="sm" onClick={() => nav("/staff/new")} className="gap-1.5">
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
        {can("Add Staff") && newRow && (
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
          {can("Add Staff") && newRow && (
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
                    ) : isA && (c.field === "department" || c.field === "designation" || c.field === "role") ? (
                      <div className="absolute inset-0 flex items-center">
                        <Combobox autoFocus value={val}
                          onChange={v => setNewRow(r => r ? { ...r, [c.field]: v } : r)}
                          options={c.field === "department" ? deptComboOpts : c.field === "designation" ? desigOptsForDept(newRow?.department ?? "") : roleComboOpts}
                          placeholder={c.label}
                          className="w-full h-full"
                          inputClassName="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300"
                          onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        />
                      </div>
                    ) : isA ? (
                      <input autoFocus type={c.type === "email" ? "email" : c.type === "tel" ? "tel" : "text"} value={val} placeholder={c.label}
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
                  const canEdit = can("Edit Staff");
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
                          suggestions={
                            c.field === "department"  ? deptComboOpts :
                            c.field === "designation" ? desigOptsForDept(member.department ?? "") :
                            c.field === "role"        ? roleComboOpts :
                            undefined
                          }
                        />
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: CELL_H }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {can("Edit Staff") && (
                      <button
                        title="Edit staff member"
                        onClick={() => nav(`/staff/${member.id}/edit`)}
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                        <Pencil size={13} />
                      </button>
                    )}
                    {can("Edit Staff") && (
                      <button
                        title={member.loginEnabled ? "Login access enabled — click to edit" : "Set login access"}
                        onClick={() => openLoginDialog(member)}
                        className={`p-1 rounded transition-colors ${
                          member.loginEnabled
                            ? "text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                            : "text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                        }`}>
                        <KeyRound size={13} />
                      </button>
                    )}
                    {can("Delete Staff") && !isDefaultDirector(member) && (
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
          {can("Add Staff") && (
            <tr><td colSpan={COLS.length + 2}>
              <button onClick={() => nav("/staff/new")}
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

      {/* Login Access dialog */}
      <Dialog open={!!loginTarget} onOpenChange={v => !v && setLoginTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <KeyRound size={16} className="text-teal-600" />
              Login Access — {loginTarget?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Role badge */}
            {loginTarget?.role && (
              <div className="text-[12px] text-gray-500 dark:text-muted-foreground">
                Role: <span className="font-semibold text-gray-700 dark:text-foreground">{loginTarget.role}</span>
                {loginTarget.designation && (
                  <> &nbsp;·&nbsp; {loginTarget.designation}</>
                )}
              </div>
            )}

            {/* Enable toggle */}
            <div className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              loginForm.enabled
                ? "bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800"
                : "bg-gray-50 dark:bg-zinc-800/30 border-gray-200 dark:border-zinc-700"
            }`}>
              <div className="flex items-center gap-2">
                {loginForm.enabled
                  ? <ShieldCheck size={15} className="text-teal-600 dark:text-teal-400" />
                  : <ShieldOff   size={15} className="text-gray-400" />}
                <span className={`text-[13px] font-semibold ${loginForm.enabled ? "text-teal-700 dark:text-teal-400" : "text-gray-500 dark:text-muted-foreground"}`}>
                  {loginForm.enabled ? "Login enabled" : "Login disabled"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLoginForm(f => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  loginForm.enabled ? "bg-teal-500" : "bg-gray-300 dark:bg-zinc-600"
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  loginForm.enabled ? "translate-x-4" : "translate-x-1"
                }`} />
              </button>
            </div>

            {/* Credentials (only shown when enabled) */}
            {loginForm.enabled && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-gray-600 dark:text-muted-foreground uppercase tracking-wide">Username</label>
                  <Input
                    value={loginForm.username}
                    onChange={e => setLoginForm(f => ({ ...f, username: e.target.value.replace(/\s+/g, ".").toLowerCase() }))}
                    placeholder="firstname.lastname"
                    className="h-9 text-[13px] font-mono"
                  />
                  <p className="text-[11px] text-gray-400">Used to log in. Lowercase letters and dots only.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-gray-600 dark:text-muted-foreground uppercase tracking-wide">Password</label>
                  <div className="relative">
                    <Input
                      type={showLoginPwd ? "text" : "password"}
                      value={loginForm.password}
                      onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Minimum 6 characters"
                      className="h-9 text-[13px] pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-foreground transition-colors"
                    >
                      {showLoginPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {loginForm.password && loginForm.password.length < 6 && (
                    <p className="text-[11px] text-red-500">Password must be at least 6 characters</p>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900">
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    This staff member will be able to log in at the Admin Portal using the <strong>Staff</strong> tab.
                    Their dashboard access will be limited to their assigned role: <strong>{loginTarget?.role || "—"}</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setLoginTarget(null)}>Cancel</Button>
            <Button
              size="sm"
              onClick={saveLoginAccess}
              className={loginForm.enabled ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}
            >
              <KeyRound size={13} className="mr-1.5" />
              Save Access Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
