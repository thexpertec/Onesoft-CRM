import { useState, useMemo, useCallback, useRef } from "react";
import { useDepartments, useDesignations, useStaffRoles, useStaff } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  Layers3, Plus, Save, X, Trash2, Pencil, Search, Shield,
  ChevronDown, Users2, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PRESET_COLORS } from "@/components/editable-cell";

// ─── Permissions catalog (shared with Roles page logic) ──────────────────────
const ALL_PERMISSIONS: string[] = [
  "Dashboard",
  "View Leads", "Add Leads", "Edit Leads", "Delete Leads",
  "View Customers", "Add Customers", "Edit Customers", "Delete Customers",
  "View Suppliers", "Add Suppliers", "Edit Suppliers", "Delete Suppliers",
  "View Sales", "Add Sales", "Edit Sales", "Delete Sales",
  "View Invoices", "Add Invoices", "Edit Invoices", "Delete Invoices",
  "View Purchases", "Add Purchases", "Edit Purchases", "Delete Purchases",
  "View Products", "Add Products", "Edit Products", "Delete Products",
  "View Stock", "Edit Stock",
  "View Manufacturing", "Add Manufacturing", "Edit Manufacturing",
  "View Staff", "Add Staff", "Edit Staff", "Delete Staff", "Manage Staff",
  "View Roles", "Add Roles", "Edit Roles", "Delete Roles", "Manage Roles",
  "View Payroll", "Manage Payroll",
  "View Attendance", "Manage Attendance",
  "View Accounts", "Add Accounts", "Edit Accounts", "Delete Accounts",
  "View Journal", "Add Journal",
  "View Reports",
];

const PERM_GROUPS: { label: string; perms: string[] }[] = [
  { label: "Dashboard", perms: ["Dashboard"] },
  { label: "CRM", perms: ["View Leads","Add Leads","Edit Leads","Delete Leads","View Customers","Add Customers","Edit Customers","Delete Customers","View Suppliers","Add Suppliers","Edit Suppliers","Delete Suppliers"] },
  { label: "Sales", perms: ["View Sales","Add Sales","Edit Sales","Delete Sales","View Invoices","Add Invoices","Edit Invoices","Delete Invoices"] },
  { label: "Purchases", perms: ["View Purchases","Add Purchases","Edit Purchases","Delete Purchases"] },
  { label: "Products & Stock", perms: ["View Products","Add Products","Edit Products","Delete Products","View Stock","Edit Stock","View Manufacturing","Add Manufacturing","Edit Manufacturing"] },
  { label: "HRM", perms: ["View Staff","Add Staff","Edit Staff","Delete Staff","Manage Staff","View Roles","Add Roles","Edit Roles","Delete Roles","Manage Roles","View Payroll","Manage Payroll","View Attendance","Manage Attendance"] },
  { label: "Accounts", perms: ["View Accounts","Add Accounts","Edit Accounts","Delete Accounts","View Journal","Add Journal","View Reports"] },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type RowType = "designation" | "department" | "role";

type SetupRow = {
  key:         string;
  rowType:     RowType;
  color:       string;
  roleName:    string;
  roleId?:     string;
  deptName:    string;
  deptId?:     string;
  desigTitle:  string;
  desigId?:    string;
  description: string;
  headOf:      string;
  permissions: string;
};

type Draft = {
  color:       string;
  roleName:    string;
  deptName:    string;
  desigTitle:  string;
  description: string;
  headOf:      string;
  permissions: string;
};

const BLANK = (): Draft => ({
  color: "#94a3b8", roleName: "", deptName: "", desigTitle: "",
  description: "", headOf: "", permissions: "",
});

// ─── Component ────────────────────────────────────────────────────────────────
export default function HrmSetupPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { roles,        addRole,        editRole,        removeRole        } = useStaffRoles();
  const { departments,  addDepartment,  editDepartment,  removeDepartment  } = useDepartments();
  const { designations, addDesignation, editDesignation, removeDesignation } = useDesignations();
  const { staff: allStaff } = useStaff();

  const [search,    setSearch]    = useState("");
  const [editKey,   setEditKey]   = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [newDraft,  setNewDraft]  = useState<Draft>(BLANK());
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [permKey,   setPermKey]   = useState<string | null>(null); // row key whose perms we're editing
  const [permDraft, setPermDraft] = useState<string>("");          // comma-sep draft for modal
  const [colorKey,  setColorKey]  = useState<string | null>(null); // inline color picker row

  // ── Derived rows ──────────────────────────────────────────────────────────
  const rows = useMemo<SetupRow[]>(() => {
    const result: SetupRow[] = [];
    const deptsWithDesig = new Set(designations.map(d => d.department).filter(Boolean));
    const rolesWithDepts  = new Set(departments.map(d => d.roleName).filter(Boolean));

    for (const d of designations) {
      const dept = departments.find(dep => dep.name === d.department);
      const role = roles.find(r => r.name === dept?.roleName);
      result.push({
        key:         "d-" + d.id,
        rowType:     "designation",
        color:       role?.color || "#94a3b8",
        roleName:    role?.name  || dept?.roleName || "",
        roleId:      role?.id,
        deptName:    dept?.name  || d.department || "",
        deptId:      dept?.id,
        desigTitle:  d.title,
        desigId:     d.id,
        description: d.jobDescription || "",
        headOf:      dept?.headOf || "",
        permissions: role?.permissions || "",
      });
    }
    for (const dept of departments) {
      if (deptsWithDesig.has(dept.name)) continue;
      const role = roles.find(r => r.name === dept.roleName);
      result.push({
        key:         "dep-" + dept.id,
        rowType:     "department",
        color:       role?.color || "#94a3b8",
        roleName:    role?.name  || dept.roleName || "",
        roleId:      role?.id,
        deptName:    dept.name,
        deptId:      dept.id,
        desigTitle:  "",
        desigId:     undefined,
        description: "",
        headOf:      dept.headOf || "",
        permissions: role?.permissions || "",
      });
    }
    for (const role of roles) {
      if (rolesWithDepts.has(role.name)) continue;
      result.push({
        key:         "r-" + role.id,
        rowType:     "role",
        color:       role.color || "#94a3b8",
        roleName:    role.name,
        roleId:      role.id,
        deptName:    "",
        deptId:      undefined,
        desigTitle:  "",
        desigId:     undefined,
        description: role.description || "",
        headOf:      "",
        permissions: role.permissions || "",
      });
    }
    return result;
  }, [designations, departments, roles]);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      [r.roleName, r.deptName, r.desigTitle, r.description].some(v => v?.toLowerCase().includes(q))
    );
  }, [rows, search]);

  // ── Staff counts per dept ─────────────────────────────────────────────────
  const deptStaff = useMemo(() => {
    const m: Record<string, typeof allStaff> = {};
    allStaff.forEach(s => {
      if (s.department && s.status !== "Terminated") {
        m[s.department] = m[s.department] || [];
        m[s.department].push(s);
      }
    });
    return m;
  }, [allStaff]);

  const staffForRow = useCallback((deptName: string) => deptStaff[deptName] || [], [deptStaff]);

  // ── Combobox option lists ──────────────────────────────────────────────────
  const roleNames  = useMemo(() => roles.map(r => r.name), [roles]);
  const deptNames  = useMemo(() => [...new Set(departments.map(d => d.name))].sort(), [departments]);
  const desigNames = useMemo(() => [...new Set(designations.map(d => d.title))].sort(), [designations]);

  // ── Start edit ────────────────────────────────────────────────────────────
  const startEdit = (row: SetupRow) => {
    setEditKey(row.key);
    setEditDraft({
      color: row.color, roleName: row.roleName, deptName: row.deptName,
      desigTitle: row.desigTitle, description: row.description,
      headOf: row.headOf, permissions: row.permissions,
    });
    setColorKey(null);
  };

  // ── Save edit ─────────────────────────────────────────────────────────────
  const saveEdit = useCallback(() => {
    if (!editKey || !editDraft) return;
    const row = rows.find(r => r.key === editKey);
    if (!row) return;

    // Persist Role changes (color + permissions)
    if (row.roleId && editDraft.roleName === row.roleName) {
      editRole(row.roleId, { color: editDraft.color, permissions: editDraft.permissions });
    } else if (editDraft.roleName) {
      const existing = roles.find(r => r.name === editDraft.roleName);
      if (existing) {
        editRole(existing.id, { color: editDraft.color, permissions: editDraft.permissions });
      }
    }

    // Persist Department changes (headOf + roleName reassignment)
    if (row.deptId) {
      editDepartment(row.deptId, {
        headOf:   editDraft.headOf,
        roleName: editDraft.roleName,
      });
    }

    // Persist Designation changes (title + description + dept reassignment)
    if (row.desigId) {
      editDesignation(row.desigId, {
        title:          editDraft.desigTitle.trim() || row.desigTitle,
        jobDescription: editDraft.description,
        department:     editDraft.deptName,
      });
    }

    setEditKey(null);
    setEditDraft(null);
    toast({ title: "Saved" });
  }, [editKey, editDraft, rows, roles, editRole, editDepartment, editDesignation, toast]);

  // ── Save new row ──────────────────────────────────────────────────────────
  const saveNew = useCallback(() => {
    if (!newDraft.desigTitle.trim() && !newDraft.deptName.trim() && !newDraft.roleName.trim()) {
      toast({ title: "Fill in at least one field", variant: "destructive" }); return;
    }

    // Find or create role
    if (newDraft.roleName.trim()) {
      const existingRole = roles.find(r => r.name === newDraft.roleName.trim());
      if (!existingRole) {
        addRole({ name: newDraft.roleName.trim(), color: newDraft.color, description: "", permissions: newDraft.permissions });
      } else if (newDraft.color !== existingRole.color || newDraft.permissions !== existingRole.permissions) {
        editRole(existingRole.id, { color: newDraft.color, permissions: newDraft.permissions });
      }
    }

    // Find or create department
    if (newDraft.deptName.trim()) {
      const existingDept = departments.find(d => d.name === newDraft.deptName.trim());
      if (!existingDept) {
        addDepartment({
          name: newDraft.deptName.trim(), roleName: newDraft.roleName.trim(),
          description: "", headOf: newDraft.headOf, isActive: true,
        });
      } else if (newDraft.roleName && existingDept.roleName !== newDraft.roleName.trim()) {
        editDepartment(existingDept.id, { roleName: newDraft.roleName.trim(), headOf: newDraft.headOf || existingDept.headOf });
      }
    }

    // Create designation
    if (newDraft.desigTitle.trim()) {
      addDesignation({
        title: newDraft.desigTitle.trim(), department: newDraft.deptName.trim(),
        jobDescription: newDraft.description, isActive: true,
      });
    }

    setAddingRow(false);
    setNewDraft(BLANK());
    toast({ title: "Row added" });
  }, [newDraft, roles, departments, addRole, editRole, addDepartment, editDepartment, addDesignation, toast]);

  // ── Delete row ────────────────────────────────────────────────────────────
  const confirmDelete = useCallback(() => {
    if (!deleteKey) return;
    const row = rows.find(r => r.key === deleteKey);
    if (!row) { setDeleteKey(null); return; }
    if (row.rowType === "designation" && row.desigId) {
      removeDesignation(row.desigId);
    } else if (row.rowType === "department" && row.deptId) {
      designations.filter(d => d.department === row.deptName).forEach(d => removeDesignation(d.id));
      removeDepartment(row.deptId);
    } else if (row.rowType === "role" && row.roleId) {
      const deptsOfRole = departments.filter(d => d.roleName === row.roleName);
      deptsOfRole.forEach(dept => {
        designations.filter(d => d.department === dept.name).forEach(d => removeDesignation(d.id));
        removeDepartment(dept.id);
      });
      removeRole(row.roleId);
    }
    setDeleteKey(null);
    toast({ title: "Deleted" });
  }, [deleteKey, rows, designations, departments, removeDesignation, removeDepartment, removeRole, toast]);

  // ── Permission modal helpers ───────────────────────────────────────────────
  const openPermModal = (row: SetupRow) => {
    setPermKey(row.key);
    setPermDraft(row.permissions);
  };
  const savePermissions = () => {
    if (!permKey) return;
    const row = rows.find(r => r.key === permKey);
    if (row?.roleId) editRole(row.roleId, { permissions: permDraft });
    if (editKey === permKey && editDraft) setEditDraft(d => d ? { ...d, permissions: permDraft } : d);
    setPermKey(null);
    toast({ title: "Permissions updated" });
  };
  const togglePerm = (p: string) => {
    const list = permDraft.split(",").map(x => x.trim()).filter(Boolean);
    const idx  = list.indexOf(p);
    if (idx === -1) list.push(p);
    else list.splice(idx, 1);
    setPermDraft(list.join(", "));
  };
  const permList = (ps: string) => ps.split(",").map(x => x.trim()).filter(Boolean);

  // ── Color picker helpers ─────────────────────────────────────────────────
  const applyColor = (key: string | null, color: string, isNew: boolean) => {
    if (isNew) { setNewDraft(d => ({ ...d, color })); }
    else if (editDraft) { setEditDraft(d => d ? { ...d, color } : d); }
    setColorKey(null);
  };

  // ── Delete target label ───────────────────────────────────────────────────
  const deleteRow = deleteKey ? rows.find(r => r.key === deleteKey) : null;
  const deleteLabel = deleteRow
    ? (deleteRow.desigTitle || deleteRow.deptName || deleteRow.roleName || "this entry")
    : "";

  // ─── Cell helpers ─────────────────────────────────────────────────────────
  const TD = "px-3 py-0 align-middle border-r border-gray-100 dark:border-border text-[12px]";
  const TH = "px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-gray-50 dark:bg-muted/40 border-r border-gray-200 dark:border-border";
  const ROW_H = 42;
  const EDIT_INPUT = "h-7 text-[12px] px-2 rounded border border-input bg-background focus:ring-1 focus:ring-blue-500 focus:outline-none w-full";

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers3 size={22} className="text-zinc-500" /> HRM Setup
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Roles → Departments → Designations — unified setup in one table
          </p>
        </div>
        {can("Add Staff") && !addingRow && (
          <Button size="sm" className="gap-1.5" onClick={() => { setAddingRow(true); setNewDraft(BLANK()); }}>
            <Plus size={14} /> Add Row
          </Button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search role, department, designation…"
          className="pl-8 h-8 text-[13px]"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Roles",        count: roles.length,        color: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-950/40" },
          { label: "Departments",  count: departments.length,  color: "text-rose-600",    bg: "bg-rose-50 dark:bg-rose-950/40" },
          { label: "Designations", count: designations.length, color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/40" },
          { label: "Total Rows",   count: rows.length,         color: "text-zinc-600",    bg: "bg-zinc-50 dark:bg-zinc-900/60" },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${s.bg} border border-transparent`}>
            <span className={`text-base font-bold ${s.color}`}>{s.count}</span>
            <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full border-collapse min-w-[1100px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-border">
              <th className={`${TH} w-10 text-center border-r`}>#</th>
              <th className={`${TH} w-12`}>Color</th>
              <th className={`${TH} min-w-[120px]`}>Role</th>
              <th className={`${TH} min-w-[140px]`}>Department</th>
              <th className={`${TH} min-w-[150px]`}>Designation</th>
              <th className={`${TH} min-w-[200px]`}>Description</th>
              <th className={`${TH} min-w-[150px]`}>Head of Dept</th>
              <th className={`${TH} min-w-[160px]`}>Permissions</th>
              <th className={`${TH} w-20`}>Staff</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-gray-50 dark:bg-muted/40 w-20">Action</th>
            </tr>
          </thead>
          <tbody>
            {/* ── New row ─────────────────────────────────────────────────── */}
            {addingRow && (
              <NewRow
                draft={newDraft}
                setDraft={setNewDraft}
                roleNames={roleNames}
                deptNames={deptNames}
                desigNames={desigNames}
                colorKey={colorKey}
                setColorKey={setColorKey}
                applyColor={(c) => applyColor(null, c, true)}
                staffForRow={staffForRow}
                onSave={saveNew}
                onCancel={() => { setAddingRow(false); setNewDraft(BLANK()); }}
                openPermModal={() => { setPermKey("__new__"); setPermDraft(newDraft.permissions); }}
                permList={permList}
                TD={TD}
                ROW_H={ROW_H}
                EDIT_INPUT={EDIT_INPUT}
              />
            )}

            {/* ── Data rows ───────────────────────────────────────────────── */}
            {filtered.map((row, ri) => {
              const isEditing = editKey === row.key;
              const d  = isEditing ? editDraft! : null;
              const sf = staffForRow(row.deptName);
              const rowColor = isEditing ? (d?.color || row.color) : row.color;
              const showColorPicker = colorKey === row.key && isEditing;

              return (
                <tr key={row.key}
                  className={`border-b border-gray-100 dark:border-border transition-colors ${isEditing ? "bg-blue-50/50 dark:bg-blue-950/20" : "hover:bg-muted/30"} group`}
                  style={{ height: isEditing ? "auto" : ROW_H }}>

                  {/* # */}
                  <td className={`${TD} w-10 text-center text-muted-foreground/60 font-mono`}>{ri + 1}</td>

                  {/* Color */}
                  <td className={`${TD} w-12`}>
                    <div className="relative">
                      <button
                        disabled={!isEditing}
                        onClick={() => isEditing && setColorKey(showColorPicker ? null : row.key)}
                        className={`w-5 h-5 rounded-full border-2 border-white dark:border-border shadow-sm transition-transform ${isEditing ? "cursor-pointer hover:scale-110" : ""}`}
                        style={{ background: rowColor }}
                        title={isEditing ? "Change color" : rowColor}
                      />
                      {showColorPicker && (
                        <div className="absolute z-30 top-7 left-0 bg-card border border-border rounded-xl shadow-xl p-3 w-52">
                          <div className="grid grid-cols-5 gap-2 mb-2">
                            {PRESET_COLORS.map(c => (
                              <button key={c} onClick={() => applyColor(row.key, c, false)}
                                className="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-700 shadow-sm hover:scale-110 transition-transform"
                                style={{ background: c }}>
                                {c === rowColor && <Check size={10} className="mx-auto text-white" />}
                              </button>
                            ))}
                          </div>
                          <input type="color" value={rowColor}
                            onChange={e => applyColor(row.key, e.target.value, false)}
                            className="w-full h-7 rounded cursor-pointer border border-input" />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Role */}
                  <td className={`${TD} min-w-[120px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
                    {isEditing ? (
                      <DataList id={`role-${row.key}`} value={d!.roleName} list={roleNames}
                        className={EDIT_INPUT}
                        onChange={v => setEditDraft(dr => dr ? { ...dr, roleName: v } : dr)}
                        placeholder="Role name…" />
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {row.roleName
                          ? <><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />{row.roleName}</>
                          : <span className="text-muted-foreground/40">—</span>}
                      </span>
                    )}
                  </td>

                  {/* Department */}
                  <td className={`${TD} min-w-[140px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
                    {isEditing ? (
                      <DataList id={`dept-${row.key}`} value={d!.deptName} list={deptNames}
                        className={EDIT_INPUT}
                        onChange={v => setEditDraft(dr => dr ? { ...dr, deptName: v } : dr)}
                        placeholder="Department…" />
                    ) : (
                      row.deptName || <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Designation */}
                  <td className={`${TD} min-w-[150px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
                    {isEditing ? (
                      <DataList id={`desig-${row.key}`} value={d!.desigTitle} list={desigNames}
                        className={EDIT_INPUT}
                        onChange={v => setEditDraft(dr => dr ? { ...dr, desigTitle: v } : dr)}
                        placeholder="Designation…" />
                    ) : (
                      row.desigTitle
                        ? <span className="font-medium text-foreground">{row.desigTitle}</span>
                        : <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Description */}
                  <td className={`${TD} min-w-[200px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
                    {isEditing ? (
                      <input value={d!.description} placeholder="Job description…"
                        onChange={e => setEditDraft(dr => dr ? { ...dr, description: e.target.value } : dr)}
                        className={EDIT_INPUT} />
                    ) : (
                      <span className="truncate max-w-[190px] block text-muted-foreground">
                        {row.description || <span className="text-muted-foreground/40">—</span>}
                      </span>
                    )}
                  </td>

                  {/* Head of Dept */}
                  <td className={`${TD} min-w-[150px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
                    <HeadOfDeptCell
                      deptName={isEditing ? d!.deptName : row.deptName}
                      headOf={isEditing ? d!.headOf : row.headOf}
                      staffInDept={sf}
                      isEditing={isEditing}
                      onChange={v => setEditDraft(dr => dr ? { ...dr, headOf: v } : dr)}
                      EDIT_INPUT={EDIT_INPUT}
                    />
                  </td>

                  {/* Permissions */}
                  <td className={`${TD} min-w-[160px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
                    <PermissionsCell
                      permissions={isEditing ? d!.permissions : row.permissions}
                      roleName={row.roleName}
                      roleId={row.roleId}
                      isEditing={isEditing}
                      onEdit={() => openPermModal(row)}
                      permList={permList}
                    />
                  </td>

                  {/* Staff */}
                  <td className={`${TD} w-20`}>
                    {row.deptName ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <Users2 size={11} />{sf.length}
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>

                  {/* Action */}
                  <td className="px-2 w-20" style={{ height: isEditing ? "auto" : ROW_H }}>
                    {isEditing ? (
                      <div className="flex items-center gap-1 py-1">
                        <button onClick={saveEdit}
                          className="w-7 h-7 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors" title="Save">
                          <Save size={13} />
                        </button>
                        <button onClick={() => { setEditKey(null); setEditDraft(null); setColorKey(null); }}
                          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors" title="Cancel">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {can("Edit Staff") && (
                          <button onClick={() => startEdit(row)}
                            className="w-7 h-7 rounded flex items-center justify-center text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors" title="Edit">
                            <Pencil size={12} />
                          </button>
                        )}
                        {can("Delete Staff") && (
                          <button onClick={() => setDeleteKey(row.key)}
                            className="w-7 h-7 rounded flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Empty state */}
            {filtered.length === 0 && !addingRow && (
              <tr>
                <td colSpan={10} className="py-14 text-center">
                  <Layers3 size={28} className="mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-[13px] text-muted-foreground">
                    {search ? "No results matching your search" : "No setup data yet — click \"Add Row\" to begin"}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Permissions modal ─────────────────────────────────────────────── */}
      {permKey !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
              <div className="flex items-center gap-2 font-semibold">
                <Shield size={16} className="text-indigo-500" /> Assign Permissions
              </div>
              <button onClick={() => setPermKey(null)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
              {PERM_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.perms.map(p => {
                      const active = permList(permDraft).includes(p);
                      return (
                        <button key={p} onClick={() => togglePerm(p)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-all ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-muted text-muted-foreground border-transparent hover:border-indigo-300"}`}>
                          {active && <Check size={9} className="inline mr-1" />}{p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center gap-3 px-5 py-3 border-t border-border">
              <button onClick={() => setPermDraft("")} className="text-xs text-muted-foreground hover:text-red-500 transition-colors">Clear all</button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPermKey(null)}>Cancel</Button>
                <Button size="sm" onClick={() => {
                  if (permKey === "__new__") {
                    setNewDraft(d => ({ ...d, permissions: permDraft }));
                    setPermKey(null);
                  } else {
                    savePermissions();
                  }
                }}>Save Permissions</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteKey} onOpenChange={o => { if (!o) setDeleteKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteLabel}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow?.rowType === "role"
                ? "This will remove the role, all its departments, and all their designations."
                : deleteRow?.rowType === "department"
                  ? "This will remove the department and all its designations."
                  : "This will remove the designation only."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DataList({ id, value, list, className, onChange, placeholder }: {
  id: string; value: string; list: string[]; className: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <>
      <input list={`dl-${id}`} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} className={className} />
      <datalist id={`dl-${id}`}>
        {list.map(o => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

function HeadOfDeptCell({ deptName, headOf, staffInDept, isEditing, onChange, EDIT_INPUT }: {
  deptName: string; headOf: string;
  staffInDept: { id: string; name: string }[];
  isEditing: boolean;
  onChange: (v: string) => void;
  EDIT_INPUT: string;
}) {
  if (!deptName) return <span className="text-muted-foreground/40 text-[12px]">—</span>;
  const n = staffInDept.length;
  if (n === 0) return <span className="text-muted-foreground/40 text-[12px]">—</span>;
  if (n === 1 && !isEditing) return <span className="text-[12px]">{staffInDept[0].name}</span>;
  if (!isEditing) {
    return (
      <span className="text-[12px]">{headOf || staffInDept[0]?.name || "—"}</span>
    );
  }
  return (
    <select value={headOf} onChange={e => onChange(e.target.value)}
      className={`${EDIT_INPUT} pr-6`}>
      <option value="">— select head —</option>
      {staffInDept.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
    </select>
  );
}

function PermissionsCell({ permissions, roleName, roleId, isEditing, onEdit, permList }: {
  permissions: string; roleName: string; roleId?: string;
  isEditing: boolean; onEdit: () => void;
  permList: (s: string) => string[];
}) {
  const list = permList(permissions);
  const visible = list.slice(0, 3);
  const extra   = list.length - 3;
  return (
    <button onClick={onEdit} disabled={!roleName && !roleId}
      className={`flex flex-wrap gap-1 min-h-[22px] w-full text-left ${roleName || roleId ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-40"}`}
      title={roleName ? `Click to edit permissions for ${roleName}` : "Assign a role first"}>
      {list.length === 0
        ? <span className="text-muted-foreground/40 text-[11px]">{roleName ? "No permissions" : "—"}</span>
        : <>
            {visible.map(p => (
              <span key={p} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {p}
              </span>
            ))}
            {extra > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                +{extra}
              </span>
            )}
          </>
      }
    </button>
  );
}

function NewRow({ draft, setDraft, roleNames, deptNames, desigNames, colorKey, setColorKey, applyColor,
  staffForRow, onSave, onCancel, openPermModal, permList, TD, ROW_H, EDIT_INPUT }: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  roleNames: string[]; deptNames: string[]; desigNames: string[];
  colorKey: string | null; setColorKey: (k: string | null) => void;
  applyColor: (c: string) => void;
  staffForRow: (d: string) => { id: string; name: string }[];
  onSave: () => void; onCancel: () => void;
  openPermModal: () => void;
  permList: (s: string) => string[];
  TD: string; ROW_H: number; EDIT_INPUT: string;
}) {
  const sf = staffForRow(draft.deptName);
  const showCP = colorKey === "__new__";
  return (
    <tr className="border-b border-gray-100 dark:border-border bg-emerald-50/40 dark:bg-emerald-950/10">
      <td className={`${TD} w-10 text-center text-emerald-500 font-bold text-[11px]`} style={{ height: ROW_H }}>★</td>

      {/* Color */}
      <td className={`${TD} w-12`} style={{ paddingTop: 5, paddingBottom: 5 }}>
        <div className="relative">
          <button onClick={() => setColorKey(showCP ? null : "__new__")}
            className="w-5 h-5 rounded-full border-2 border-white dark:border-border shadow-sm cursor-pointer hover:scale-110 transition-transform"
            style={{ background: draft.color }} />
          {showCP && (
            <div className="absolute z-30 top-7 left-0 bg-card border border-border rounded-xl shadow-xl p-3 w-52">
              <div className="grid grid-cols-5 gap-2 mb-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => applyColor(c)}
                    className="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-700 shadow-sm hover:scale-110 transition-transform"
                    style={{ background: c }}>
                    {c === draft.color && <Check size={10} className="mx-auto text-white" />}
                  </button>
                ))}
              </div>
              <input type="color" value={draft.color} onChange={e => applyColor(e.target.value)}
                className="w-full h-7 rounded cursor-pointer border border-input" />
            </div>
          )}
        </div>
      </td>

      {/* Role */}
      <td className={`${TD} min-w-[120px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
        <DataList id="new-role" value={draft.roleName} list={roleNames} className={EDIT_INPUT}
          onChange={v => setDraft(d => ({ ...d, roleName: v }))} placeholder="Role…" />
      </td>

      {/* Department */}
      <td className={`${TD} min-w-[140px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
        <DataList id="new-dept" value={draft.deptName} list={deptNames} className={EDIT_INPUT}
          onChange={v => setDraft(d => ({ ...d, deptName: v }))} placeholder="Department…" />
      </td>

      {/* Designation */}
      <td className={`${TD} min-w-[150px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
        <DataList id="new-desig" value={draft.desigTitle} list={desigNames} className={EDIT_INPUT}
          onChange={v => setDraft(d => ({ ...d, desigTitle: v }))} placeholder="Designation…" />
      </td>

      {/* Description */}
      <td className={`${TD} min-w-[200px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
        <input value={draft.description} placeholder="Description…" className={EDIT_INPUT}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
      </td>

      {/* Head of Dept */}
      <td className={`${TD} min-w-[150px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
        <HeadOfDeptCell deptName={draft.deptName} headOf={draft.headOf} staffInDept={sf}
          isEditing={true} onChange={v => setDraft(d => ({ ...d, headOf: v }))} EDIT_INPUT={EDIT_INPUT} />
      </td>

      {/* Permissions */}
      <td className={`${TD} min-w-[160px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
        <PermissionsCell permissions={draft.permissions} roleName={draft.roleName} isEditing={true}
          onEdit={openPermModal} permList={permList} />
      </td>

      {/* Staff */}
      <td className={`${TD} w-20`}>
        {draft.deptName ? (
          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-[12px]">
            <Users2 size={11} />{sf.length}
          </span>
        ) : <span className="text-muted-foreground/40 text-[12px]">—</span>}
      </td>

      {/* Action */}
      <td className="px-2 w-20" style={{ paddingTop: 5, paddingBottom: 5 }}>
        <div className="flex items-center gap-1">
          <button onClick={onSave}
            className="w-7 h-7 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors" title="Save">
            <Save size={13} />
          </button>
          <button onClick={onCancel}
            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors" title="Cancel">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}
