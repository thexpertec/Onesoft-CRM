import { useState, useMemo } from "react";
import {
  Plus, Trash2, Pencil, ArrowLeft, FileText,
  ChevronRight, Save, ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSalaryTemplates, useStaff } from "@/hooks/use-data";
import { getDesignations, getSettings, SalaryTemplate, SalaryTemplateItem } from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWANCE_TYPES = [
  "Transport Allowance",
  "Housing Allowance",
  "Medical Allowance",
  "Food Allowance",
  "Mobile Allowance",
  "Internet Allowance",
  "Performance Bonus",
  "Other",
];

const DEDUCTION_TYPES = [
  "Income Tax",
  "Provident Fund",
  "Loan Repayment",
  "Advance Recovery",
  "Insurance",
  "Other",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  designation:            string;
  staffId:                string;
  basicSalary:            string;
  overtimeRatePerHour:    string;
  perLeaveDeduction:      string;
  perShortLeaveDeduction: string;
  allowances:             SalaryTemplateItem[];
  deductions:             SalaryTemplateItem[];
};

const EMPTY_FORM: FormState = {
  designation:            "",
  staffId:                "__all__",
  basicSalary:            "",
  overtimeRatePerHour:    "",
  perLeaveDeduction:      "",
  perShortLeaveDeduction: "",
  allowances:             [],
  deductions:             [],
};

function newItem(): SalaryTemplateItem {
  return { id: crypto.randomUUID(), type: "", amount: 0 };
}

function fmt(n: number, sym: string) {
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Dynamic line-item row ─────────────────────────────────────────────────────

function LineRow({
  item, types, sym, onChange, onRemove,
}: {
  item:     SalaryTemplateItem;
  types:    string[];
  sym:      string;
  onChange: (id: string, field: "type" | "amount", val: string | number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={item.type}
        onValueChange={v => onChange(item.id, "type", v)}
      >
        <SelectTrigger className="flex-1 h-9 text-sm">
          <SelectValue placeholder="Select type" />
        </SelectTrigger>
        <SelectContent>
          {types.map(t => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative w-36 shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {sym}
        </span>
        <Input
          type="number"
          min={0}
          value={item.amount || ""}
          onChange={e => onChange(item.id, "amount", parseFloat(e.target.value) || 0)}
          className="pl-8 h-9 text-sm"
          placeholder="0.00"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── Summary row ─────────────────────────────────────────────────────────────

function SummaryRow({
  label, value, bold,
}: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 px-4 ${bold ? "bg-muted/60 rounded-lg" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? "font-bold text-base" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SalaryTemplatePage() {
  const [view,     setView]     = useState<"list" | "form">("list");
  const [editId,   setEditId]   = useState<string | null>(null);
  const [form,     setForm]     = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { templates, add, edit: editTemplate, remove } = useSalaryTemplates();
  const { staff: allStaff }                             = useStaff();
  const { toast }                                       = useToast();

  const settings = getSettings();
  const sym      = getSettingsCurrencySymbol(settings);
  const designations = getDesignations();

  // Filter staff by selected designation
  const filteredStaff = useMemo(() => {
    const active = allStaff.filter(s => s.status !== "Terminated");
    if (!form.designation) return active;
    return active.filter(s => s.designation === form.designation);
  }, [allStaff, form.designation]);

  // Live calculations
  const basicNum        = parseFloat(form.basicSalary)            || 0;
  const totalAllowances = form.allowances.reduce((s, a) => s + (a.amount || 0), 0);
  const totalDeductions = form.deductions.reduce((s, d) => s + (d.amount || 0), 0);
  const netSalary       = basicNum + totalAllowances - totalDeductions;

  // ── Navigation ─────────────────────────────────────────────────────────────

  function openNew() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setView("form");
  }

  function openEdit(t: SalaryTemplate) {
    setEditId(t.id);
    setForm({
      designation:            t.designation,
      staffId:                t.staffId || "__all__",
      basicSalary:            t.basicSalary           ? String(t.basicSalary)           : "",
      overtimeRatePerHour:    t.overtimeRatePerHour   ? String(t.overtimeRatePerHour)   : "",
      perLeaveDeduction:      t.perLeaveDeduction     ? String(t.perLeaveDeduction)     : "",
      perShortLeaveDeduction: t.perShortLeaveDeduction ? String(t.perShortLeaveDeduction) : "",
      allowances:             t.allowances ?? [],
      deductions:             t.deductions ?? [],
    });
    setView("form");
  }

  function backToList() {
    setView("list");
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  function handleSave(andBack: boolean) {
    if (!form.designation) {
      toast({ title: "Role / designation is required", variant: "destructive" });
      return;
    }
    if (!form.basicSalary || isNaN(parseFloat(form.basicSalary))) {
      toast({ title: "Basic salary is required", variant: "destructive" });
      return;
    }

    const payload = {
      designation:            form.designation,
      staffId:                form.staffId === "__all__" ? "" : form.staffId,
      basicSalary:            parseFloat(form.basicSalary)            || 0,
      overtimeRatePerHour:    parseFloat(form.overtimeRatePerHour)    || 0,
      perLeaveDeduction:      parseFloat(form.perLeaveDeduction)      || 0,
      perShortLeaveDeduction: parseFloat(form.perShortLeaveDeduction) || 0,
      allowances:             form.allowances.filter(a => a.type),
      deductions:             form.deductions.filter(d => d.type),
    };

    if (editId) {
      editTemplate(editId, payload);
      toast({ title: "Template updated successfully" });
    } else {
      add(payload);
      toast({ title: "Salary template created" });
    }

    if (andBack) {
      backToList();
    } else if (!editId) {
      setForm(EMPTY_FORM);
    }
  }

  // ── Line-item helpers ──────────────────────────────────────────────────────

  function updateAllowance(id: string, field: "type" | "amount", val: string | number) {
    setForm(f => ({
      ...f,
      allowances: f.allowances.map(a => a.id === id ? { ...a, [field]: val } : a),
    }));
  }

  function updateDeduction(id: string, field: "type" | "amount", val: string | number) {
    setForm(f => ({
      ...f,
      deductions: f.deductions.map(d => d.id === id ? { ...d, [field]: val } : d),
    }));
  }

  // ── List view ──────────────────────────────────────────────────────────────

  if (view === "list") {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Page header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-background shrink-0">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <FileText size={20} className="text-violet-500" />
              Salary Templates
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Define role-based salary structures with allowances and deductions
            </p>
          </div>
          <Button onClick={openNew} className="gap-1.5">
            <Plus size={15} /> New Template
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
                <ListOrdered size={24} className="text-violet-500" />
              </div>
              <div>
                <p className="font-semibold text-foreground">No salary templates yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create templates to standardise pay structures across roles.
                </p>
              </div>
              <Button variant="outline" onClick={openNew} className="gap-1.5 mt-1">
                <Plus size={14} /> Create first template
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border">
                      <th className="text-center px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide w-10">Sr.</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Staff Id</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Staff Name</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Role</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Basic Salary</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Allowances</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Deduction</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Net Salary</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Overtime Rate</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Leave Rate</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">SL Rate</th>
                      <th className="px-3 py-3 text-right text-xs uppercase tracking-wide font-semibold text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t, idx) => {
                      const staffMember = allStaff.find(s => s.id === t.staffId);
                      const ta = t.allowances.reduce((s, a) => s + a.amount, 0);
                      const td = t.deductions.reduce((s, d) => s + d.amount, 0);
                      const ns = t.basicSalary + ta - td;
                      const staffIdDisplay = staffMember
                        ? staffMember.id.slice(0, 3).toUpperCase() + "-" + staffMember.id.slice(3, 11).toUpperCase()
                        : "—";
                      return (
                        <tr
                          key={t.id}
                          className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                        >
                          <td className="px-3 py-3 text-center text-muted-foreground tabular-nums">{idx + 1}</td>
                          <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{staffIdDisplay}</td>
                          <td className="px-3 py-3 font-medium">
                            {staffMember
                              ? staffMember.name
                              : <span className="italic text-xs text-muted-foreground">All staff in role</span>
                            }
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                              {t.designation || <span className="text-muted-foreground italic">Any role</span>}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(t.basicSalary, sym)}</td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                            +{fmt(ta, sym)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-red-500 dark:text-red-400">
                            -{fmt(td, sym)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">
                            {fmt(ns, sym)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                            {t.overtimeRatePerHour > 0 ? fmt(t.overtimeRatePerHour, sym) : <span className="text-xs">0</span>}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                            {t.perLeaveDeduction > 0 ? fmt(t.perLeaveDeduction, sym) : <span className="text-xs">0</span>}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                            {t.perShortLeaveDeduction > 0 ? fmt(t.perShortLeaveDeduction, sym) : <span className="text-xs">0</span>}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEdit(t)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title="Edit"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteId(t.id)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete salary template?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The template will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (deleteId) { remove(deleteId); setDeleteId(null); } }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── Form view ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Form header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background shrink-0">
        <button
          onClick={backToList}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span
            className="hover:text-foreground cursor-pointer transition-colors"
            onClick={backToList}
          >
            Salary Templates
          </span>
          <ChevronRight size={14} />
          <span className="text-foreground font-medium">
            {editId ? "Edit Template" : "New Template"}
          </span>
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-5">

          {/* ── Section 1: Basic info ───────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Template Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium after:content-['*'] after:ml-0.5 after:text-destructive">
                  Role / Designation
                </label>
                <Select
                  value={form.designation}
                  onValueChange={v =>
                    setForm(f => ({ ...f, designation: v, staffId: "__all__" }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select role…" />
                  </SelectTrigger>
                  <SelectContent>
                    {designations.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No designations — add in HRM Org
                      </SelectItem>
                    ) : (
                      designations
                        .filter(d => d.isActive)
                        .map(d => (
                          <SelectItem key={d.id} value={d.title}>{d.title}</SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Staff */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Staff Member
                  <span className="ml-1.5 text-xs text-muted-foreground font-normal">(optional — leave blank to apply to entire role)</span>
                </label>
                <Select
                  value={form.staffId}
                  onValueChange={v => setForm(f => ({ ...f, staffId: v }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="All staff in role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All staff in role</SelectItem>
                    {filteredStaff.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                    {filteredStaff.length === 0 && form.designation && (
                      <SelectItem value="__none" disabled>
                        No active staff for this role
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Basic salary */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium after:content-['*'] after:ml-0.5 after:text-destructive">
                  Basic Salary
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    {sym}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={form.basicSalary}
                    onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))}
                    className="pl-9 h-10"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Overtime rate */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Overtime Rate
                  <span className="ml-1.5 text-xs text-muted-foreground font-normal">per hour</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    {sym}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={form.overtimeRatePerHour}
                    onChange={e => setForm(f => ({ ...f, overtimeRatePerHour: e.target.value }))}
                    className="pl-9 h-10"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Allowances + Deductions ─────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Allowances */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                  Allowances
                </h2>
                {form.allowances.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {form.allowances.length} item{form.allowances.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {form.allowances.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-1">No allowances added yet.</p>
              )}

              <div className="space-y-2">
                {form.allowances.map(a => (
                  <LineRow
                    key={a.id}
                    item={a}
                    types={ALLOWANCE_TYPES}
                    sym={sym}
                    onChange={updateAllowance}
                    onRemove={id => setForm(f => ({ ...f, allowances: f.allowances.filter(x => x.id !== id) }))}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 self-start mt-1 border-dashed"
                onClick={() => setForm(f => ({ ...f, allowances: [...f.allowances, newItem()] }))}
              >
                <Plus size={13} /> Add Row
              </Button>

              {form.allowances.length > 0 && (
                <div className="mt-auto pt-3 border-t border-border flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Allowances</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                    +{fmt(totalAllowances, sym)}
                  </span>
                </div>
              )}
            </div>

            {/* Deductions */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide">
                  Deductions
                </h2>
                {form.deductions.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {form.deductions.length} item{form.deductions.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Per-leave deductions */}
              <div className="grid grid-cols-2 gap-3 pb-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Per Leave Deduction
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      {sym}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={form.perLeaveDeduction}
                      onChange={e => setForm(f => ({ ...f, perLeaveDeduction: e.target.value }))}
                      className="pl-8 h-9 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Per Short Leave
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      {sym}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={form.perShortLeaveDeduction}
                      onChange={e => setForm(f => ({ ...f, perShortLeaveDeduction: e.target.value }))}
                      className="pl-8 h-9 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-dashed border-border pt-1" />

              {form.deductions.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-1">No fixed deductions added yet.</p>
              )}

              <div className="space-y-2">
                {form.deductions.map(d => (
                  <LineRow
                    key={d.id}
                    item={d}
                    types={DEDUCTION_TYPES}
                    sym={sym}
                    onChange={updateDeduction}
                    onRemove={id => setForm(f => ({ ...f, deductions: f.deductions.filter(x => x.id !== id) }))}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 self-start mt-1 border-dashed"
                onClick={() => setForm(f => ({ ...f, deductions: [...f.deductions, newItem()] }))}
              >
                <Plus size={13} /> Add Row
              </Button>

              {form.deductions.length > 0 && (
                <div className="mt-auto pt-3 border-t border-border flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Deductions</span>
                  <span className="font-semibold text-red-500 dark:text-red-400 font-mono">
                    -{fmt(totalDeductions, sym)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 3: Salary summary ────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/40">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Salary Summary
              </h2>
            </div>
            <div className="divide-y divide-border">
              <SummaryRow label="Basic Salary"     value={fmt(basicNum,        sym)} />
              <SummaryRow label="Total Allowances" value={`+${fmt(totalAllowances, sym)}`} />
              <SummaryRow label="Total Deductions" value={`-${fmt(totalDeductions, sym)}`} />
              <SummaryRow label="Net Salary"       value={fmt(netSalary, sym)} bold />
            </div>
          </div>

          {/* spacer so footer doesn't cover content */}
          <div className="h-6" />
        </div>
      </div>

      {/* ── Sticky footer ────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-background px-6 py-3.5 flex items-center justify-between gap-3">
        <Button variant="outline" onClick={backToList} className="gap-1.5">
          <ArrowLeft size={14} /> Cancel
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave(true)}
            className="gap-1.5"
          >
            <Save size={14} /> Save &amp; Back to List
          </Button>
          <Button
            onClick={() => handleSave(false)}
            className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Save size={14} /> Save
          </Button>
        </div>
      </div>
    </div>
  );
}
