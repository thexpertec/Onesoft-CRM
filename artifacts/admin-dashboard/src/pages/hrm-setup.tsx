import { useState, useMemo, useCallback, useRef } from "react";
import { useDepartments, useDesignations, useStaffRoles, useStaff } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  Layers3, Plus, Save, X, Trash2, Pencil, Search, Shield,
  ChevronDown, Users2, Check, Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PRESET_COLORS } from "@/components/editable-cell";

// ─── Permissions catalog ─────────────────────────────────────────────────────
type PermRow = { label: string; view?: string; add?: string; edit?: string; delete?: string; extras?: string[] };
type PermGroup = { group: string; rows: PermRow[] };

const PERM_GROUPS: PermGroup[] = [
  { group: "Dashboard", rows: [
    { label: "Dashboard", view: "Dashboard" },
  ]},
  { group: "CRM", rows: [
    { label: "Leads",     view: "View Leads",     add: "Add Leads",     edit: "Edit Leads",     delete: "Delete Leads"     },
    { label: "Customers", view: "View Customers", add: "Add Customers", edit: "Edit Customers", delete: "Delete Customers" },
    { label: "Suppliers", view: "View Suppliers", add: "Add Suppliers", edit: "Edit Suppliers", delete: "Delete Suppliers" },
  ]},
  { group: "Sales", rows: [
    { label: "Sales",    view: "View Sales",    add: "Add Sales",    edit: "Edit Sales",    delete: "Delete Sales"    },
    { label: "Invoices", view: "View Invoices", add: "Add Invoices", edit: "Edit Invoices", delete: "Delete Invoices" },
  ]},
  { group: "Purchases", rows: [
    { label: "Purchases", view: "View Purchases", add: "Add Purchases", edit: "Edit Purchases", delete: "Delete Purchases" },
  ]},
  { group: "Products & Stock", rows: [
    { label: "Products",      view: "View Products",      add: "Add Products",      edit: "Edit Products",      delete: "Delete Products" },
    { label: "Stock",         view: "View Stock",                                    edit: "Edit Stock"                                    },
    { label: "Manufacturing", view: "View Manufacturing", add: "Add Manufacturing", edit: "Edit Manufacturing"                            },
  ]},
  { group: "HRM", rows: [
    { label: "Staff",      view: "View Staff",      add: "Add Staff",      edit: "Edit Staff",      delete: "Delete Staff",   extras: ["Manage Staff"]      },
    { label: "Roles",      view: "View Roles",      add: "Add Roles",      edit: "Edit Roles",      delete: "Delete Roles",   extras: ["Manage Roles"]      },
    { label: "Payroll",    view: "View Payroll",                                                                               extras: ["Manage Payroll"]    },
    { label: "Attendance", view: "View Attendance",                                                                            extras: ["Manage Attendance"] },
  ]},
  { group: "Accounts", rows: [
    { label: "Accounts", view: "View Accounts", add: "Add Accounts", edit: "Edit Accounts", delete: "Delete Accounts" },
    { label: "Journal",  view: "View Journal",  add: "Add Journal"                                                    },
    { label: "Reports",  view: "View Reports"                                                                          },
  ]},
];

// Helpers for extras: auto-include Manage-style extras when any named perm in a row is active
const ALL_NAMED_IN_ROW = (row: PermRow) =>
  [row.view, row.add, row.edit, row.delete].filter(Boolean) as string[];

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
  isRepairTechnician: boolean;
};

type Draft = {
  color:       string;
  roleName:    string;
  deptName:    string;
  desigTitle:  string;
  description: string;
  headOf:      string;
  permissions: string;
  isRepairTechnician: boolean;
};

const BLANK = (): Draft => ({
  color: "#94a3b8", roleName: "", deptName: "", desigTitle: "",
  description: "", headOf: "", permissions: "", isRepairTechnician: false,
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
        isRepairTechnician: !!d.isRepairTechnician,
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
        isRepairTechnician: false,
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
        isRepairTechnician: false,
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
      isRepairTechnician: row.isRepairTechnician,
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
        title:             editDraft.desigTitle.trim() || row.desigTitle,
        jobDescription:    editDraft.description,
        department:        editDraft.deptName,
        isRepairTechnician: editDraft.isRepairTechnician,
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
        isRepairTechnician: newDraft.isRepairTechnician,
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
  const permList = (ps: string) => ps.split(",").map(x => x.trim()).filter(Boolean);

  const togglePerm = (p: string) => {
    setPermDraft(prev => {
      let list = permList(prev);
      const has = list.includes(p);
      if (has) {
        list = list.filter(x => x !== p);
      } else {
        list.push(p);
      }
      // sync extras: for each row that has this perm, add/remove extras
      for (const g of PERM_GROUPS) {
        for (const row of g.rows) {
          if (!row.extras?.length) continue;
          const named = ALL_NAMED_IN_ROW(row);
          const anyActive = named.some(n => list.includes(n));
          for (const ex of row.extras) {
            if (anyActive && !list.includes(ex)) list.push(ex);
            if (!anyActive) list = list.filter(x => x !== ex);
          }
        }
      }
      return list.join(", ");
    });
  };

  // Toggle all perms in a given action column (view/add/edit/delete)
  const toggleColumnAll = (col: "view" | "add" | "edit" | "delete") => {
    const colPerms = PERM_GROUPS.flatMap(g => g.rows.map(r => r[col]).filter(Boolean)) as string[];
    setPermDraft(prev => {
      let list = permList(prev);
      const allOn = colPerms.every(p => list.includes(p));
      if (allOn) {
        list = list.filter(p => !colPerms.includes(p));
      } else {
        colPerms.forEach(p => { if (!list.includes(p)) list.push(p); });
      }
      // sync extras
      for (const g of PERM_GROUPS) {
        for (const row of g.rows) {
          if (!row.extras?.length) continue;
          const named = ALL_NAMED_IN_ROW(row);
          const anyActive = named.some(n => list.includes(n));
          for (const ex of row.extras) {
            if (anyActive && !list.includes(ex)) list.push(ex);
            if (!anyActive) list = list.filter(x => x !== ex);
          }
        }
      }
      return list.join(", ");
    });
  };

  // Column header state: "all" | "some" | "none"
  const colState = (col: "view" | "add" | "edit" | "delete"): "all" | "some" | "none" => {
    const colPerms = PERM_GROUPS.flatMap(g => g.rows.map(r => r[col]).filter(Boolean)) as string[];
    const active = colPerms.filter(p => permList(permDraft).includes(p)).length;
    if (active === 0) return "none";
    if (active === colPerms.length) return "all";
    return "some";
  };

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers3 size={22} className="text-zinc-500" /> HRM Setup
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Click any cell to edit · organised by role &amp; department
          </p>
        </div>
      </div>

      {/* Stats pills — same style as Staff page */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { label: "Total",        count: rows.length,         filter: "all",         color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                                  ring: "ring-gray-400"   },
          { label: "Roles",        count: roles.length,        filter: "roles",        color: "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300",                         ring: "ring-indigo-500" },
          { label: "Departments",  count: departments.length,  filter: "departments",  color: "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300",                                 ring: "ring-rose-500"   },
          { label: "Designations", count: designations.length, filter: "designations", color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",                             ring: "ring-amber-400"  },
        ].map(p => (
          <button key={p.label}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${p.color} opacity-80 hover:opacity-100 hover:scale-[1.04]`}>
            {p.label}: <span>{p.count}</span>
          </button>
        ))}
      </div>

      {/* Toolbar — search + unsaved indicator + count */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
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
        {addingRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setAddingRow(false); setNewDraft(BLANK()); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={saveNew}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {rows.length}</div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full border-collapse min-w-[1100px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-border">
              <th className={`${TH} w-10 text-center`}>#</th>
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
            {/* ── Data rows ───────────────────────────────────────────────── */}
            {filtered.map((row, ri) => {
              const isEditing = editKey === row.key;
              const d  = isEditing ? editDraft! : null;
              const sf = staffForRow(row.deptName);
              const rowColor = isEditing ? (d?.color || row.color) : row.color;
              const showColorPicker = colorKey === row.key && isEditing;

              return (
                <tr key={row.key}
                  onClick={() => !isEditing && can("Edit Staff") && startEdit(row)}
                  className={`border-b border-gray-100 dark:border-border transition-colors group ${
                    isEditing
                      ? "bg-blue-50/50 dark:bg-blue-950/20"
                      : ri % 2 === 0
                        ? "bg-white dark:bg-card hover:bg-blue-50/20 dark:hover:bg-blue-950/10 cursor-pointer"
                        : "bg-gray-50/50 dark:bg-muted/10 hover:bg-blue-50/20 dark:hover:bg-blue-950/10 cursor-pointer"
                  }`}
                  style={{ height: isEditing ? "auto" : ROW_H }}>

                  {/* # */}
                  <td className={`${TD} w-10 text-center text-gray-300 dark:text-muted-foreground/50 font-mono select-none`} onClick={e => isEditing && e.stopPropagation()}>{ri + 1}</td>

                  {/* Color */}
                  <td className={`${TD} w-12`} onClick={e => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => { if (!isEditing && can("Edit Staff")) startEdit(row); if (isEditing) setColorKey(showColorPicker ? null : row.key); }}
                        className={`w-5 h-5 rounded-full border-2 border-white dark:border-border shadow-sm transition-transform ${isEditing ? "cursor-pointer hover:scale-110" : "cursor-pointer"}`}
                        style={{ background: rowColor }}
                        title={isEditing ? "Change color" : "Click row to edit"}
                      />
                      {showColorPicker && (
                        <div className="absolute z-30 top-7 left-0 bg-card border border-border rounded-xl shadow-xl p-3 w-52">
                          <div className="grid grid-cols-5 gap-2 mb-2">
                            {PRESET_COLORS.map(c => (
                              <button key={c.hex} onClick={() => applyColor(row.key, c.hex, false)}
                                className="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-700 shadow-sm hover:scale-110 transition-transform"
                                style={{ background: c.hex }}>
                                {c.hex === rowColor && <Check size={10} className="mx-auto text-white" />}
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
                          ? <><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} /><span className="text-[12px] font-semibold" style={{ color: row.color }}>{row.roleName}</span></>
                          : <span className="text-gray-300 dark:text-zinc-600">—</span>}
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
                      <span className="text-[13px] text-gray-700 dark:text-foreground">
                        {row.deptName || <span className="text-gray-300 dark:text-zinc-600">—</span>}
                      </span>
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
                        ? <span className="text-[13px] font-medium text-foreground">{row.desigTitle}</span>
                        : <span className="text-gray-300 dark:text-zinc-600">—</span>
                    )}
                  </td>

                  {/* Description */}
                  <td className={`${TD} min-w-[200px]`} style={{ paddingTop: 5, paddingBottom: 5 }}>
                    {isEditing ? (
                      <div className="space-y-1">
                        <input value={d!.description} placeholder="Job description…"
                          onChange={e => setEditDraft(dr => dr ? { ...dr, description: e.target.value } : dr)}
                          className={EDIT_INPUT} />
                        {row.rowType === "designation" && (
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 cursor-pointer select-none">
                            <input type="checkbox" checked={d!.isRepairTechnician}
                              onChange={e => setEditDraft(dr => dr ? { ...dr, isRepairTechnician: e.target.checked } : dr)}
                              className="h-3 w-3 accent-blue-600" />
                            <Wrench size={10} /> Repair Technician
                          </label>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate max-w-[190px] block text-[13px] text-muted-foreground">
                          {row.description || <span className="text-gray-300 dark:text-zinc-600">—</span>}
                        </span>
                        {row.rowType === "designation" && row.isRepairTechnician && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5 w-fit">
                            <Wrench size={9} /> Repair Technician
                          </span>
                        )}
                      </div>
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
                  <td className={`${TD} min-w-[160px]`} style={{ paddingTop: 5, paddingBottom: 5 }} onClick={e => e.stopPropagation()}>
                    <PermissionsCell
                      permissions={isEditing ? d!.permissions : row.permissions}
                      roleName={row.roleName}
                      roleId={row.roleId}
                      isEditing={isEditing}
                      onEdit={() => { if (!isEditing && can("Edit Staff")) startEdit(row); openPermModal(row); }}
                      permList={permList}
                    />
                  </td>

                  {/* Staff */}
                  <td className={`${TD} w-20`}>
                    {row.deptName ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-[12px]">
                        <Users2 size={11} />{sf.length}
                      </span>
                    ) : <span className="text-gray-300 dark:text-zinc-600">—</span>}
                  </td>

                  {/* Action */}
                  <td className="px-2 w-20 sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: isEditing ? "auto" : ROW_H }} onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1 py-1">
                        <button onClick={saveEdit}
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors" title="Save">
                          <Save size={13} />
                        </button>
                        <button onClick={() => { setEditKey(null); setEditDraft(null); setColorKey(null); }}
                          className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors" title="Cancel">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {can("Edit Staff") && (
                          <button onClick={() => startEdit(row)}
                            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors" title="Edit">
                            <Pencil size={13} />
                          </button>
                        )}
                        {can("Delete Staff") && (
                          <button onClick={() => setDeleteKey(row.key)}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* ── New row (bottom, same amber style as Staff page) ─────────── */}
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

            {/* Empty state */}
            {filtered.length === 0 && !addingRow && (
              <tr>
                <td colSpan={10} className="py-14 text-center">
                  <Layers3 size={28} className="mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-[13px] text-muted-foreground">
                    {search ? "No results matching your search" : "No setup data yet — click \"Add row\" below to begin"}
                  </p>
                </td>
              </tr>
            )}

            {/* ── Bottom "+ Add row" trigger (same as Staff page) ─────────── */}
            {can("Add Staff") && !addingRow && (
              <tr>
                <td colSpan={10}>
                  <button
                    onClick={() => { setAddingRow(true); setNewDraft(BLANK()); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                    <Plus size={13} /> Add row
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Permissions modal ─────────────────────────────────────────────── */}
      {permKey !== null && (() => {
        const active = new Set(permList(permDraft));
        const COL_KEYS = ["view","add","edit","delete"] as const;
        const COL_LABELS: Record<typeof COL_KEYS[number], string> = { view: "View", add: "Add", edit: "Edit", delete: "Delete" };
        const COL_COLORS: Record<typeof COL_KEYS[number], string> = {
          view:   "text-blue-600 dark:text-blue-400",
          add:    "text-emerald-600 dark:text-emerald-400",
          edit:   "text-amber-600 dark:text-amber-400",
          delete: "text-red-600 dark:text-red-400",
        };
        const COL_CHECK: Record<typeof COL_KEYS[number], string> = {
          view:   "accent-blue-600",
          add:    "accent-emerald-600",
          edit:   "accent-amber-500",
          delete: "accent-red-600",
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center">
                    <Shield size={15} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm leading-tight">Assign Permissions</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {active.size} permission{active.size !== 1 ? "s" : ""} selected
                    </p>
                  </div>
                </div>
                <button onClick={() => setPermKey(null)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <X size={14} />
                </button>
              </div>

              {/* Table */}
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm border-separate border-spacing-0">
                  {/* Sticky column header */}
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted/80 backdrop-blur-sm">
                      <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-2.5 w-[44%] border-b border-border">
                        Module
                      </th>
                      {COL_KEYS.map(col => {
                        const state = colState(col);
                        return (
                          <th key={col} className="text-center text-[11px] px-2 py-2.5 border-b border-border w-[14%]">
                            <button
                              onClick={() => toggleColumnAll(col)}
                              className="flex flex-col items-center gap-1 mx-auto group"
                              title={`Select all ${COL_LABELS[col]}`}
                            >
                              <span className={`font-semibold uppercase tracking-wide ${COL_COLORS[col]}`}>
                                {COL_LABELS[col]}
                              </span>
                              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                                ${state === "all"  ? "bg-indigo-600 border-indigo-600" :
                                  state === "some" ? "bg-indigo-200 border-indigo-400 dark:bg-indigo-900 dark:border-indigo-500" :
                                                     "border-border group-hover:border-indigo-400"}`}>
                                {state === "all"  && <Check size={9} className="text-white" strokeWidth={3} />}
                                {state === "some" && <span className="w-1.5 h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-300" />}
                              </span>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {PERM_GROUPS.map((group, gi) => (
                      <>
                        {/* Group header */}
                        <tr key={`g-${gi}`} className="bg-muted/30">
                          <td colSpan={5} className="px-4 py-1.5 border-b border-border/50">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              {group.group}
                            </span>
                          </td>
                        </tr>
                        {/* Module rows */}
                        {group.rows.map((row, ri) => (
                          <tr key={`${gi}-${ri}`}
                            className="hover:bg-muted/40 transition-colors border-b border-border/40 last:border-b-0">
                            <td className="px-4 py-2.5 font-medium text-[12px] text-foreground">
                              {row.label}
                              {row.extras && (
                                <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                                  +manage
                                </span>
                              )}
                            </td>
                            {COL_KEYS.map(col => {
                              const perm = row[col];
                              const checked = perm ? active.has(perm) : false;
                              return (
                                <td key={col} className="text-center px-2 py-2.5">
                                  {perm ? (
                                    <label className="inline-flex items-center justify-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => togglePerm(perm)}
                                        className={`w-[15px] h-[15px] rounded cursor-pointer ${COL_CHECK[col]}`}
                                      />
                                    </label>
                                  ) : (
                                    <span className="inline-block w-[15px] h-[15px] rounded border border-dashed border-border/50 opacity-30" />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center gap-3 px-6 py-3.5 border-t border-border shrink-0">
                <button
                  onClick={() => setPermDraft("")}
                  className="text-xs text-muted-foreground hover:text-red-500 transition-colors font-medium">
                  Clear all
                </button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPermKey(null)}>Cancel</Button>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => {
                    if (permKey === "__new__") {
                      setNewDraft(d => ({ ...d, permissions: permDraft }));
                      setPermKey(null);
                    } else {
                      savePermissions();
                    }
                  }}>
                    <Shield size={13} className="mr-1.5" /> Save Permissions
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                  <button key={c.hex} onClick={() => applyColor(c.hex)}
                    className="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-700 shadow-sm hover:scale-110 transition-transform"
                    style={{ background: c.hex }}>
                    {c.hex === draft.color && <Check size={10} className="mx-auto text-white" />}
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
        <div className="space-y-1">
          <input value={draft.description} placeholder="Description…" className={EDIT_INPUT}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
          {!!draft.desigTitle.trim() && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 cursor-pointer select-none">
              <input type="checkbox" checked={draft.isRepairTechnician}
                onChange={e => setDraft(d => ({ ...d, isRepairTechnician: e.target.checked }))}
                className="h-3 w-3 accent-blue-600" />
              <Wrench size={10} /> Repair Technician
            </label>
          )}
        </div>
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
