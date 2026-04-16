import { useState, useMemo, useRef } from "react";
import { useDepartments, useDesignations, useStaff } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Designation } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Users2, Plus, X, Save, Trash2, FileText, CheckCircle2,
  ChevronRight, LayoutGrid, Tag, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ExcelGridShell, ColDef, CELL_H, NEW_ROW_BG } from "@/components/editable-cell";

// ─── Common ──────────────────────────────────────────────────────────────────
const CELL_INPUT = "w-full h-full bg-transparent border-0 outline-none px-3 text-[12px] leading-none";

// ─── Departments ──────────────────────────────────────────────────────────────
const DEPT_COLS: ColDef[] = [
  { field: "name",        label: "Department Name",  minW: 200, type: "text" },
  { field: "description", label: "Description",      minW: 260, type: "text" },
  { field: "headOf",      label: "Head of Dept.",    minW: 180, type: "text" },
  { field: "_staff",      label: "Staff",            minW: 80,  type: "readonly" },
  { field: "_desig",      label: "Designations",     minW: 110, type: "readonly" },
];
const DEPT_TOTAL_W = DEPT_COLS.reduce((a, c) => a + c.minW, 0);

type DeptEdit = { name: string; description: string; headOf: string };
const DEPT_BLANK = (): DeptEdit => ({ name: "", description: "", headOf: "" });

// ─── Designations ─────────────────────────────────────────────────────────────
const DESIG_COLS: ColDef[] = [
  { field: "title",       label: "Designation / Title", minW: 220, type: "text" },
  { field: "department",  label: "Department",          minW: 180, type: "text" },
  { field: "_jd",         label: "Job Description",     minW: 280, type: "readonly" },
  { field: "_staff",      label: "Staff",               minW: 80,  type: "readonly" },
];
const DESIG_TOTAL_W = DESIG_COLS.reduce((a, c) => a + c.minW, 0);

type DesigEdit = { title: string; department: string };
const DESIG_BLANK = (): DesigEdit => ({ title: "", department: "" });

// ─── JD Dialog ────────────────────────────────────────────────────────────────
function JdDialog({ desig, onClose, onSave }: { desig: Designation; onClose: () => void; onSave: (jd: string) => void }) {
  const [jd, setJd] = useState(desig.jobDescription || "");
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[min(98vw,720px)] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <FileText size={16} className="text-violet-500" />
            Job Description — <span className="font-bold">{desig.title}</span>
            {desig.department && <span className="text-muted-foreground font-normal">· {desig.department}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="px-1 py-2">
          <textarea
            rows={14}
            value={jd}
            onChange={e => setJd(e.target.value)}
            placeholder="Enter the full job description, responsibilities, qualifications, and requirements…"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">{jd.length} characters</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-9">Cancel</Button>
          <Button onClick={() => { onSave(jd); onClose(); }}
            className="h-9 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white border-0 gap-1.5">
            <Save size={14} /> Save JD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline text cell ─────────────────────────────────────────────────────────
function InlineInput({ value, onChange, onSave, onEscape, autoFocus }: {
  value: string; onChange: (v: string) => void; onSave: () => void; onEscape: () => void; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      autoFocus={autoFocus}
      className={CELL_INPUT}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); onSave(); }
        if (e.key === "Escape") { e.preventDefault(); onEscape(); }
      }}
      style={{ height: CELL_H }}
    />
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function HrmOrgPage() {
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const { departments, addDepartment, editDepartment, removeDepartment } = useDepartments();
  const { designations, addDesignation, editDesignation, removeDesignation } = useDesignations();
  const { staff } = useStaff();

  // ── Active tab ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"departments" | "designations">("departments");

  // ─────────────────────── DEPARTMENTS STATE ───────────────────────────────
  type DeptActiveCell = { id: string; field: "name" | "description" | "headOf" } | null;
  const [deptActiveCell, setDeptActiveCell]   = useState<DeptActiveCell>(null);
  const [deptEditData, setDeptEditData]       = useState<DeptEdit>(DEPT_BLANK());
  const [deptNewRow,  setDeptNewRow]          = useState<DeptEdit | null>(null);
  const [deptDeleteId, setDeptDeleteId]       = useState<string | null>(null);

  const startDeptCellEdit = (id: string, field: "name" | "description" | "headOf", currentVal: string) => {
    const dept = departments.find(d => d.id === id);
    if (!dept) return;
    setDeptActiveCell({ id, field });
    setDeptEditData({ name: dept.name, description: dept.description, headOf: dept.headOf || "" });
  };

  const commitDeptCell = (id: string) => {
    if (!deptEditData.name.trim()) { toast({ title: "Department name is required", variant: "destructive" }); return; }
    editDepartment(id, { name: deptEditData.name.trim(), description: deptEditData.description.trim(), headOf: deptEditData.headOf.trim() });
    setDeptActiveCell(null);
  };

  const saveDeptNew = () => {
    if (!deptNewRow?.name.trim()) { toast({ title: "Department name is required", variant: "destructive" }); return; }
    addDepartment({ name: deptNewRow.name.trim(), description: deptNewRow.description.trim(), headOf: deptNewRow.headOf.trim(), isActive: true });
    toast({ title: "Department added", description: deptNewRow.name.trim() });
    setDeptNewRow(null);
  };

  // ─── Dept computed counts ─────────────────────────────────────────────────
  const deptStaffCount = useMemo(() => {
    const m: Record<string, number> = {};
    staff.forEach(s => { if (s.department) m[s.department] = (m[s.department] || 0) + 1; });
    return m;
  }, [staff]);
  const deptDesigCount = useMemo(() => {
    const m: Record<string, number> = {};
    designations.forEach(d => { if (d.department) m[d.department] = (m[d.department] || 0) + 1; });
    return m;
  }, [designations]);

  // ─────────────────────── DESIGNATIONS STATE ──────────────────────────────
  type DesigActiveCell = { id: string; field: "title" | "department" } | null;
  const [desigActiveCell, setDesigActiveCell] = useState<DesigActiveCell>(null);
  const [desigEditData, setDesigEditData]     = useState<DesigEdit>(DESIG_BLANK());
  const [desigNewRow, setDesigNewRow]         = useState<DesigEdit | null>(null);
  const [desigDeleteId, setDesigDeleteId]     = useState<string | null>(null);
  const [jdDesig, setJdDesig]                 = useState<Designation | null>(null);

  const startDesigCellEdit = (id: string, field: "title" | "department") => {
    const d = designations.find(x => x.id === id);
    if (!d) return;
    setDesigActiveCell({ id, field });
    setDesigEditData({ title: d.title, department: d.department || "" });
  };

  const commitDesigCell = (id: string) => {
    if (!desigEditData.title.trim()) { toast({ title: "Designation title is required", variant: "destructive" }); return; }
    editDesignation(id, { title: desigEditData.title.trim(), department: desigEditData.department.trim() });
    setDesigActiveCell(null);
  };

  const saveDesigNew = () => {
    if (!desigNewRow?.title.trim()) { toast({ title: "Designation title is required", variant: "destructive" }); return; }
    addDesignation({ title: desigNewRow.title.trim(), department: desigNewRow.department.trim(), jobDescription: "", isActive: true });
    toast({ title: "Designation added", description: desigNewRow.title.trim() });
    setDesigNewRow(null);
  };

  // ─── Desig computed ──────────────────────────────────────────────────────
  const desigStaffCount = useMemo(() => {
    const m: Record<string, number> = {};
    staff.forEach(s => { if (s.designation) m[s.designation] = (m[s.designation] || 0) + 1; });
    return m;
  }, [staff]);

  const deptNames = useMemo(() => departments.map(d => d.name).sort(), [departments]);

  // ─── Tab pills ───────────────────────────────────────────────────────────
  const tabs = [
    { id: "departments" as const, label: "Departments", icon: Building2, count: departments.length, color: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400" },
    { id: "designations" as const, label: "Designations", icon: Tag, count: designations.length, color: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border bg-card shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0 shadow-sm">
          <Layers size={17} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold text-foreground leading-tight">Departments &amp; Designations</h1>
          <p className="text-[12px] text-muted-foreground leading-tight">Org structure, job titles and job descriptions</p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg border border-border p-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === t.id
                  ? "bg-white dark:bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon size={12} />
              {t.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.color}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {can("Add Staff") && (
          <Button size="sm" className={`gap-1.5 text-[12px] ${
            activeTab === "departments"
              ? "bg-rose-600 hover:bg-rose-700"
              : "bg-violet-600 hover:bg-violet-700"
          } text-white`}
            onClick={() => {
              if (activeTab === "departments") setDeptNewRow(DEPT_BLANK());
              else setDesigNewRow(DESIG_BLANK());
            }}
            data-testid={activeTab === "departments" ? "btn-add-department" : "btn-add-designation"}
          >
            <Plus size={13} />
            Add {activeTab === "departments" ? "Department" : "Designation"}
          </Button>
        )}
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* ── DEPARTMENTS TAB ──────────────────────────────────────────────── */}
        {activeTab === "departments" && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Building2, count: departments.length, label: "Total Departments", color: "rose" },
                { icon: Users2,    count: staff.length,        label: "Total Staff",       color: "blue" },
                { icon: Tag,       count: designations.length, label: "Designations",      color: "violet" },
              ].map(c => (
                <div key={c.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-${c.color}-100 dark:bg-${c.color}-950/50 flex items-center justify-center`}>
                    <c.icon size={18} className={`text-${c.color}-600 dark:text-${c.color}-400`} />
                  </div>
                  <div>
                    <p className="text-[22px] font-bold text-foreground leading-none">{c.count}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Grid */}
            <ExcelGridShell cols={DEPT_COLS} totalMinW={DEPT_TOTAL_W} tableId="hrm-departments">
              {departments.map((dept, rowIdx) => {
                const isEditing = deptActiveCell?.id === dept.id;
                const rowBg = isEditing ? "bg-rose-50/60 dark:bg-rose-950/20" : rowIdx % 2 !== 0 ? "bg-muted/20" : "";
                return (
                  <tr key={dept.id} className={`${rowBg} group border-b border-gray-100 dark:border-border`}>
                    <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-muted-foreground select-none" style={{ height: CELL_H }}>
                      {rowIdx + 1}
                    </td>

                    {DEPT_COLS.map(col => {
                      if (col.field === "_staff") return (
                        <td key={col.field} className="border-r border-gray-100 dark:border-border px-3 text-[12px] text-muted-foreground" style={{ height: CELL_H }}>
                          <span className="inline-flex items-center gap-1"><Users2 size={11} className="text-blue-500" />{deptStaffCount[dept.name] || 0}</span>
                        </td>
                      );
                      if (col.field === "_desig") return (
                        <td key={col.field} className="border-r border-gray-100 dark:border-border px-3 text-[12px] text-muted-foreground" style={{ height: CELL_H }}>
                          <span className="inline-flex items-center gap-1"><Tag size={11} className="text-violet-500" />{deptDesigCount[dept.name] || 0}</span>
                        </td>
                      );
                      const field = col.field as "name" | "description" | "headOf";
                      const isActive = isEditing && deptActiveCell?.field === field;
                      const val = isEditing ? deptEditData[field] : ((dept as Record<string, string>)[field] || "");
                      return (
                        <td key={col.field}
                          className={`border-r border-gray-100 dark:border-border p-0 ${isActive ? "ring-2 ring-inset ring-blue-500 z-10" : ""}`}
                          style={{ height: CELL_H }}
                          onDoubleClick={() => can("Edit Staff") && startDeptCellEdit(dept.id, field, val)}>
                          {isActive ? (
                            <InlineInput
                              value={deptEditData[field]}
                              onChange={v => setDeptEditData(p => ({ ...p, [field]: v }))}
                              onSave={() => commitDeptCell(dept.id)}
                              onEscape={() => setDeptActiveCell(null)}
                              autoFocus
                            />
                          ) : (
                            <span className="flex items-center h-full px-3 text-[12px] truncate">
                              {val || <span className="text-muted-foreground/40">—</span>}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-2" style={{ height: CELL_H }}>
                      {can("Edit Staff") && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEditing ? (
                            <>
                              <button onClick={() => commitDeptCell(dept.id)} className="w-6 h-6 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" title="Save"><Save size={12} /></button>
                              <button onClick={() => setDeptActiveCell(null)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted" title="Cancel"><X size={12} /></button>
                            </>
                          ) : (
                            <button onClick={() => setDeptDeleteId(dept.id)} className="w-6 h-6 rounded flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete"><Trash2 size={12} /></button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* New row */}
              {deptNewRow && (
                <tr className={`${NEW_ROW_BG} border-b border-gray-100 dark:border-border`}>
                  <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-emerald-600 font-bold select-none" style={{ height: CELL_H }}>+</td>
                  {DEPT_COLS.map((col, ci) => {
                    if (col.type === "readonly") return <td key={col.field} className="border-r border-gray-100 dark:border-border" style={{ height: CELL_H }} />;
                    const field = col.field as "name" | "description" | "headOf";
                    return (
                      <td key={col.field} className="border-r border-gray-100 dark:border-border p-0 ring-2 ring-inset ring-emerald-400" style={{ height: CELL_H }}>
                        <InlineInput
                          value={deptNewRow[field]}
                          onChange={v => setDeptNewRow(p => ({ ...p!, [field]: v }))}
                          onSave={saveDeptNew}
                          onEscape={() => setDeptNewRow(null)}
                          autoFocus={ci === 0}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2" style={{ height: CELL_H }}>
                    <div className="flex items-center gap-1">
                      <button onClick={saveDeptNew} className="w-6 h-6 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"><Save size={12} /></button>
                      <button onClick={() => setDeptNewRow(null)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted"><X size={12} /></button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Add row footer */}
              {can("Add Staff") && !deptNewRow && (
                <tr><td colSpan={DEPT_COLS.length + 2}>
                  <button onClick={() => setDeptNewRow(DEPT_BLANK())}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition-colors">
                    <Plus size={13} /> Add department
                  </button>
                </td></tr>
              )}
            </ExcelGridShell>

            {departments.length === 0 && !deptNewRow && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center mb-4">
                  <Building2 size={26} className="text-rose-500" />
                </div>
                <p className="text-[14px] font-semibold text-foreground">No departments yet</p>
                <p className="text-[12px] text-muted-foreground mt-1">Add departments to organise your staff</p>
                <Button size="sm" className="mt-4 gap-1.5 bg-rose-600 hover:bg-rose-700 text-white" onClick={() => setDeptNewRow(DEPT_BLANK())}>
                  <Plus size={13} /> Add First Department
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── DESIGNATIONS TAB ─────────────────────────────────────────────── */}
        {activeTab === "designations" && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Tag,          count: designations.length,                                        label: "Designations", color: "violet" },
                { icon: FileText,     count: designations.filter(d => d.jobDescription?.trim()).length,   label: "With JD",      color: "emerald" },
                { icon: CheckCircle2, count: designations.filter(d => !d.jobDescription?.trim()).length,  label: "JD Pending",   color: "amber" },
              ].map(c => (
                <div key={c.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-${c.color}-100 dark:bg-${c.color}-950/50 flex items-center justify-center`}>
                    <c.icon size={18} className={`text-${c.color}-600 dark:text-${c.color}-400`} />
                  </div>
                  <div>
                    <p className="text-[22px] font-bold text-foreground leading-none">{c.count}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Grid */}
            <ExcelGridShell cols={DESIG_COLS} totalMinW={DESIG_TOTAL_W} tableId="hrm-designations">
              {designations.map((d, rowIdx) => {
                const isEditing = desigActiveCell?.id === d.id;
                const rowBg = isEditing ? "bg-violet-50/60 dark:bg-violet-950/20" : rowIdx % 2 !== 0 ? "bg-muted/20" : "";
                return (
                  <tr key={d.id} className={`${rowBg} group border-b border-gray-100 dark:border-border`}>
                    <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-muted-foreground select-none" style={{ height: CELL_H }}>
                      {rowIdx + 1}
                    </td>

                    {DESIG_COLS.map(col => {
                      if (col.field === "_jd") return (
                        <td key={col.field} className="border-r border-gray-100 dark:border-border px-3" style={{ height: CELL_H }}>
                          <div className="flex items-center gap-2 h-full">
                            {d.jobDescription?.trim() ? (
                              <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">{d.jobDescription.slice(0, 55)}{d.jobDescription.length > 55 ? "…" : ""}</span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/40 italic">No JD yet</span>
                            )}
                            {can("Edit Staff") && (
                              <button onClick={() => setJdDesig(d)}
                                className="ml-auto flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200 shrink-0 px-2 py-0.5 rounded hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors">
                                <FileText size={11} />
                                {d.jobDescription?.trim() ? "Edit JD" : "Add JD"}
                                <ChevronRight size={10} />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                      if (col.field === "_staff") return (
                        <td key={col.field} className="border-r border-gray-100 dark:border-border px-3 text-[12px] text-muted-foreground" style={{ height: CELL_H }}>
                          <span className="inline-flex items-center gap-1"><Users2 size={11} className="text-blue-500" />{desigStaffCount[d.title] || 0}</span>
                        </td>
                      );

                      const field = col.field as "title" | "department";
                      const isActive = isEditing && desigActiveCell?.field === field;
                      const val = isEditing ? desigEditData[field] : ((d as Record<string, string>)[field] || "");

                      // Department cell — select when editing
                      if (field === "department" && isActive) return (
                        <td key={col.field} className="border-r border-gray-100 dark:border-border p-0 ring-2 ring-inset ring-blue-500 z-10" style={{ height: CELL_H }}>
                          <Select
                            value={desigEditData.department || "__none__"}
                            onValueChange={v => {
                              const val = v === "__none__" ? "" : v;
                              setDesigEditData(p => ({ ...p, department: val }));
                            }}
                          >
                            <SelectTrigger className="h-full border-0 rounded-none text-[12px] focus:ring-0 bg-transparent">
                              <SelectValue placeholder="Select department…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— No department —</SelectItem>
                              {deptNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      );

                      return (
                        <td key={col.field}
                          className={`border-r border-gray-100 dark:border-border p-0 ${isActive ? "ring-2 ring-inset ring-blue-500 z-10" : ""}`}
                          style={{ height: CELL_H }}
                          onDoubleClick={() => can("Edit Staff") && startDesigCellEdit(d.id, field)}>
                          {isActive ? (
                            <InlineInput
                              value={desigEditData[field]}
                              onChange={v => setDesigEditData(p => ({ ...p, [field]: v }))}
                              onSave={() => commitDesigCell(d.id)}
                              onEscape={() => setDesigActiveCell(null)}
                              autoFocus
                            />
                          ) : (
                            <span className="flex items-center h-full px-3 text-[12px] truncate">
                              {val || <span className="text-muted-foreground/40">—</span>}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-2" style={{ height: CELL_H }}>
                      {can("Edit Staff") && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEditing ? (
                            <>
                              <button onClick={() => commitDesigCell(d.id)} className="w-6 h-6 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" title="Save"><Save size={12} /></button>
                              <button onClick={() => setDesigActiveCell(null)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted" title="Cancel"><X size={12} /></button>
                            </>
                          ) : (
                            <button onClick={() => setDesigDeleteId(d.id)} className="w-6 h-6 rounded flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete"><Trash2 size={12} /></button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* New row */}
              {desigNewRow && (
                <tr className={`${NEW_ROW_BG} border-b border-gray-100 dark:border-border`}>
                  <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-emerald-600 font-bold select-none" style={{ height: CELL_H }}>+</td>
                  {DESIG_COLS.map((col, ci) => {
                    if (col.type === "readonly") return <td key={col.field} className="border-r border-gray-100 dark:border-border" style={{ height: CELL_H }} />;
                    const field = col.field as "title" | "department";

                    if (field === "department" && deptNames.length > 0) return (
                      <td key={col.field} className="border-r border-gray-100 dark:border-border p-0 ring-2 ring-inset ring-emerald-400" style={{ height: CELL_H }}>
                        <Select
                          value={desigNewRow.department || "__none__"}
                          onValueChange={v => setDesigNewRow(p => ({ ...p!, department: v === "__none__" ? "" : v }))}
                        >
                          <SelectTrigger className="h-full border-0 rounded-none text-[12px] focus:ring-0 bg-transparent">
                            <SelectValue placeholder="Department…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— No department —</SelectItem>
                            {deptNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    );

                    return (
                      <td key={col.field} className="border-r border-gray-100 dark:border-border p-0 ring-2 ring-inset ring-emerald-400" style={{ height: CELL_H }}>
                        <InlineInput
                          value={desigNewRow[field]}
                          onChange={v => setDesigNewRow(p => ({ ...p!, [field]: v }))}
                          onSave={saveDesigNew}
                          onEscape={() => setDesigNewRow(null)}
                          autoFocus={ci === 0}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2" style={{ height: CELL_H }}>
                    <div className="flex items-center gap-1">
                      <button onClick={saveDesigNew} className="w-6 h-6 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"><Save size={12} /></button>
                      <button onClick={() => setDesigNewRow(null)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted"><X size={12} /></button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Add row footer */}
              {can("Add Staff") && !desigNewRow && (
                <tr><td colSpan={DESIG_COLS.length + 2}>
                  <button onClick={() => setDesigNewRow(DESIG_BLANK())}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-colors">
                    <Plus size={13} /> Add designation
                  </button>
                </td></tr>
              )}
            </ExcelGridShell>

            {designations.length === 0 && !desigNewRow && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center mb-4">
                  <Tag size={26} className="text-violet-500" />
                </div>
                <p className="text-[14px] font-semibold text-foreground">No designations yet</p>
                <p className="text-[12px] text-muted-foreground mt-1">Add job titles and their descriptions</p>
                <Button size="sm" className="mt-4 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => setDesigNewRow(DESIG_BLANK())}>
                  <Plus size={13} /> Add First Designation
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── JD Dialog ────────────────────────────────────────────────────────── */}
      {jdDesig && (
        <JdDialog
          desig={jdDesig}
          onClose={() => setJdDesig(null)}
          onSave={jd => {
            editDesignation(jdDesig.id, { jobDescription: jd });
            toast({ title: "Job description saved", description: jdDesig.title });
          }}
        />
      )}

      {/* ── Delete Department dialog ─────────────────────────────────────────── */}
      <AlertDialog open={!!deptDeleteId} onOpenChange={o => { if (!o) setDeptDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const dept = departments.find(d => d.id === deptDeleteId);
                const sc = deptStaffCount[dept?.name || ""] || 0;
                return sc > 0
                  ? `${sc} staff member(s) use this department. Deleting it won't affect existing staff records but the department will no longer appear in dropdowns.`
                  : "This action cannot be undone.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { if (deptDeleteId) { removeDepartment(deptDeleteId); setDeptDeleteId(null); toast({ title: "Department deleted" }); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Designation dialog ─────────────────────────────────────────── */}
      <AlertDialog open={!!desigDeleteId} onOpenChange={o => { if (!o) setDesigDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Designation?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const desig = designations.find(d => d.id === desigDeleteId);
                const sc = desigStaffCount[desig?.title || ""] || 0;
                return sc > 0
                  ? `${sc} staff member(s) hold this designation. It will remain on existing staff records but won't appear in dropdowns.`
                  : "This action cannot be undone.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { if (desigDeleteId) { removeDesignation(desigDeleteId); setDesigDeleteId(null); toast({ title: "Designation deleted" }); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
