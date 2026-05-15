import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  Wallet, Users, DollarSign, CheckCircle2, Clock, Plus, Trash2,
  Pencil, Printer, Download, BadgeCheck, X, ChevronsUpDown, Search,
  ChevronDown, TrendingUp, AlertCircle, FileSpreadsheet, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useSalarySlips, useStaff, usePaymentAccounts, useSalaryTemplates } from "@/hooks/use-data";
import {
  SalarySlip, SalarySlipItem, SalarySlipStatus,
  getSettings, postSalaryPaymentJE, postSalaryApprovalJE, getPaymentAccounts,
  deleteJournalEntry,
} from "@/lib/store";
import { buildPayslipHtml } from "@/lib/print-payslip";
import { getSettingsCurrencySymbol } from "@/lib/currencies";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function currentPeriod(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function periodString(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodLabel(period: string): string {
  const [yr, mo] = period.split("-");
  return `${MONTHS[parseInt(mo) - 1]} ${yr}`;
}

function fmt(n: number, sym: string) {
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CONFIG: Record<SalarySlipStatus, { label: string; color: string; bg: string }> = {
  Draft:    { label: "Draft",    color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-900/30"   },
  Approved: { label: "Approved", color: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-50 dark:bg-blue-900/30"     },
  Paid:     { label: "Paid",     color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
};

// ─── Editable allowance / deduction list ─────────────────────────────────────
function ItemList({
  label, items, onChange, accent,
}: {
  label: string;
  items: SalarySlipItem[];
  onChange: (items: SalarySlipItem[]) => void;
  accent: "emerald" | "red";
}) {
  const add = () => onChange([...items, { label: "", amount: 0 }]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof SalarySlipItem, value: string | number) => {
    const next = items.map((it, idx) => idx === i ? { ...it, [field]: value } : it);
    onChange(next);
  };
  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const accentCls = accent === "emerald"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-[12px] font-semibold uppercase tracking-wide ${accentCls}`}>{label}</span>
        <span className={`text-[11px] font-medium ${accentCls}`}>Total: {total.toLocaleString()}</span>
      </div>
      {items.length === 0 && (
        <p className="text-[11px] text-muted-foreground py-1">No items — click + to add</p>
      )}
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            className="flex-1 h-8 text-[12px]"
            placeholder="Label (e.g. Transport)"
            value={it.label}
            onChange={e => update(i, "label", e.target.value)}
          />
          <Input
            className="w-28 h-8 text-[12px]"
            type="number"
            min="0"
            placeholder="Amount"
            value={it.amount === 0 ? "" : it.amount}
            onChange={e => update(i, "amount", parseFloat(e.target.value) || 0)}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className={`flex items-center gap-1 text-[11px] ${accentCls} hover:opacity-80 transition-opacity`}
      >
        <Plus size={11} /> Add {label.slice(0, -1)}
      </button>
    </div>
  );
}

// ─── Print Payslip ────────────────────────────────────────────────────────────
function openPayslipWindow(slip: SalarySlip) {
  const settings = getSettings();
  const html = buildPayslipHtml(slip, settings);
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SalaryPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  const { slips, add: addSlip, edit: editSlip, remove: removeSlip } = useSalarySlips();
  const { staff } = useStaff();
  const { accounts: paymentAccounts } = usePaymentAccounts();
  const { templates: salaryTemplates } = useSalaryTemplates();
  const sym = getSettingsCurrencySymbol();

  // ── Period state ───────────────────────────────────────────────────────────
  const { month: cm, year: cy } = currentPeriod();
  const [selMonth, setSelMonth] = useState(cm);
  const [selYear,  setSelYear]  = useState(cy);
  const period = periodString(selMonth, selYear);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<"All" | SalarySlipStatus>("All");
  const [deptFilter,   setDeptFilter]   = useState("All");
  const [search,       setSearch]       = useState("");

  // ── Dialogs ────────────────────────────────────────────────────────────────
  const [editSlipId,    setEditSlipId]    = useState<string | null>(null);
  const [paySlipId,     setPaySlipId]     = useState<string | null>(null);
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [generateOpen,          setGenerateOpen]          = useState(false);
  const [generateStaffOpen,     setGenerateStaffOpen]     = useState(false);
  const [revertId,              setRevertId]              = useState<string | null>(null);

  // ── Slip for editing ───────────────────────────────────────────────────────
  const editTarget = useMemo(() => slips.find(s => s.id === editSlipId) ?? null, [slips, editSlipId]);
  const payTarget  = useMemo(() => slips.find(s => s.id === paySlipId)  ?? null, [slips, paySlipId]);

  // ── Period slips ──────────────────────────────────────────────────────────
  const periodSlips = useMemo(() => slips.filter(s => s.period === period), [slips, period]);

  // ── Filtered slips ────────────────────────────────────────────────────────
  const departments = useMemo(() => [...new Set(periodSlips.map(s => s.department).filter(Boolean))].sort(), [periodSlips]);
  const filtered = useMemo(() => {
    let rows = periodSlips;
    if (statusFilter !== "All") rows = rows.filter(s => s.status === statusFilter);
    if (deptFilter   !== "All") rows = rows.filter(s => s.department === deptFilter);
    if (search.trim())          rows = rows.filter(s => s.staffName.toLowerCase().includes(search.toLowerCase()));
    return rows;
  }, [periodSlips, statusFilter, deptFilter, search]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalPayroll  = periodSlips.reduce((s, x) => s + x.netSalary,   0);
    const paidAmt       = periodSlips.filter(x => x.status === "Paid").reduce((s, x) => s + x.netSalary, 0);
    const pendingAmt    = periodSlips.filter(x => x.status !== "Paid").reduce((s, x) => s + x.netSalary, 0);
    const paidCount     = periodSlips.filter(x => x.status === "Paid").length;
    return { totalPayroll, paidAmt, pendingAmt, paidCount, headcount: periodSlips.length };
  }, [periodSlips]);

  // ── Generate payroll ──────────────────────────────────────────────────────
  const handleGeneratePayroll = useCallback(() => {
    const activeStaff = staff.filter(s => s.status === "Active");
    const existingIds = new Set(periodSlips.map(s => s.staffId));
    let created = 0;
    for (const s of activeStaff) {
      if (existingIds.has(s.id)) continue;
      // Resolve salary template: staff-specific → designation match → role match → fallback to Staff record
      const tmpl =
        salaryTemplates.find(t => t.staffId === s.id) ??
        salaryTemplates.find(t => t.designation === s.designation) ??
        salaryTemplates.find(t => t.designation === s.role) ??
        null;
      const basic = tmpl ? tmpl.basicSalary : (s.basicSalary ?? 0);
      const allowances: SalarySlipItem[] = tmpl
        ? tmpl.allowances.map(a => ({ label: a.type, amount: a.amount }))
        : (s.allowances && s.allowances > 0 ? [{ label: "Allowances", amount: s.allowances }] : []);
      const deductions: SalarySlipItem[] = tmpl
        ? tmpl.deductions.map(d => ({ label: d.type, amount: d.amount }))
        : (s.deductions && s.deductions > 0 ? [{ label: "Deductions", amount: s.deductions }] : []);
      addSlip({
        staffId:     s.id,
        staffName:   s.name,
        department:  s.department,
        designation: s.designation,
        period,
        salaryType:  s.salaryType ?? "Monthly",
        basicSalary: basic,
        allowances,
        deductions,
        status: "Draft",
        notes:  "",
      });
      created++;
    }
    setGenerateOpen(false);
    if (created === 0) {
      toast({ title: "No new slips", description: "All active staff already have slips for this period." });
    } else {
      toast({ title: `${created} slip${created > 1 ? "s" : ""} generated`, description: `Payroll for ${periodLabel(period)} created as Draft.` });
    }
  }, [staff, periodSlips, period, addSlip, toast]);

  // ── CSV Export ────────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    const header = ["Staff Name","Department","Designation","Period","Salary Type","Basic","Allowances","Deductions","Gross","Net","Status"];
    const rows = filtered.map(s => [
      s.staffName, s.department, s.designation, periodLabel(s.period),
      s.salaryType,
      s.basicSalary,
      s.allowances.reduce((t, a) => t + a.amount, 0),
      s.deductions.reduce((t, d) => t + d.amount, 0),
      s.grossSalary,
      s.netSalary,
      s.status,
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `salary-${period}.csv`;
    a.click();
    toast({ title: "Exported", description: `${filtered.length} slip(s) exported.` });
  }, [filtered, period, toast]);

  // ── Status colour ─────────────────────────────────────────────────────────
  const statusPill = (s: SalarySlipStatus) => {
    const cfg = STATUS_CONFIG[s];
    return (
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
        {cfg.label}
      </span>
    );
  };

  const years = Array.from({ length: 5 }, (_, i) => cy - 2 + i);

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet size={22} className="text-primary" /> Salary Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Payroll, salary slips & journal posting</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <Select value={String(selMonth)} onValueChange={v => setSelMonth(parseInt(v))}>
            <SelectTrigger className="w-36 h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selYear)} onValueChange={v => setSelYear(parseInt(v))}>
            <SelectTrigger className="w-24 h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-1.5 h-8">
            <Download size={13} /> Export
          </Button>
          <Button size="sm" variant="outline" onClick={() => setGenerateStaffOpen(true)} className="gap-1.5 h-8">
            <Plus size={13} /> Generate for Staff
          </Button>
          <Button size="sm" onClick={() => setGenerateOpen(true)} className="gap-1.5 h-8">
            <FileSpreadsheet size={13} /> Generate Payroll
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Total Staff",
            value: kpi.headcount,
            icon: Users,
            color: "text-indigo-600 dark:text-indigo-400",
            bg:    "bg-indigo-50 dark:bg-indigo-950/30",
            isMoney: false,
          },
          {
            label: "Total Payroll",
            value: kpi.totalPayroll,
            icon: DollarSign,
            color: "text-blue-600 dark:text-blue-400",
            bg:    "bg-blue-50 dark:bg-blue-950/30",
            isMoney: true,
          },
          {
            label: "Paid",
            value: kpi.paidAmt,
            icon: CheckCircle2,
            color: "text-emerald-600 dark:text-emerald-400",
            bg:    "bg-emerald-50 dark:bg-emerald-950/30",
            isMoney: true,
          },
          {
            label: "Pending",
            value: kpi.pendingAmt,
            icon: Clock,
            color: "text-amber-600 dark:text-amber-400",
            bg:    "bg-amber-50 dark:bg-amber-950/30",
            isMoney: true,
          },
        ].map(k => (
          <div key={k.label} className={`rounded-xl ${k.bg} p-4 flex items-center gap-3`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${k.bg}`}>
              <k.icon size={18} className={k.color} />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">{k.label}</p>
              <p className={`text-lg font-bold leading-tight ${k.color}`}>
                {k.isMoney ? fmt(k.value as number, sym) : k.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-7 h-8 w-44 text-[13px]"
            placeholder="Search staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-8 w-32 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Paid">Paid</SelectItem>
          </SelectContent>
        </Select>

        {departments.length > 0 && (
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 w-40 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Depts</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <span className="text-[12px] text-muted-foreground ml-auto">
          {filtered.length} of {periodSlips.length} slips
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Staff Name</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Month</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Department</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Basic</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Allowances</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Deductions</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Gross</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Net</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Status</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-muted-foreground">
                    <Wallet size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No payslips for {periodLabel(period)}</p>
                    <p className="text-[12px] mt-1">Click "Generate Payroll" to create slips for all active staff.</p>
                  </td>
                </tr>
              ) : filtered.map((slip, idx) => {
                const allowTotal = slip.allowances.reduce((s, a) => s + a.amount, 0);
                const dedTotal   = slip.deductions.reduce((s, d) => s + d.amount, 0);
                return (
                  <tr key={slip.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-medium">
                      <div>{slip.staffName}</div>
                      <div className="text-[11px] text-muted-foreground">{slip.designation}</div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{periodLabel(slip.period)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{slip.department || "—"}</td>
                    <td className="px-3 py-2.5 text-right">{fmt(slip.basicSalary, sym)}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                      {allowTotal > 0 ? `+${fmt(allowTotal, sym)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-600 dark:text-red-400">
                      {dedTotal > 0 ? `-${fmt(dedTotal, sym)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{fmt(slip.grossSalary, sym)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-primary">{fmt(slip.netSalary, sym)}</td>
                    <td className="px-3 py-2.5 text-center">{statusPill(slip.status)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        {slip.status !== "Paid" && (
                          <button
                            title="Edit"
                            onClick={() => setEditSlipId(slip.id)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {/* Approve */}
                        {slip.status === "Draft" && (
                          <button
                            title="Approve"
                            onClick={async () => {
                              let accrualJournalEntryId: string | undefined;
                              try {
                                // postSalaryApprovalJE is async: it awaits the COA server
                                // write before creating the JE, preventing "Unknown ledger"
                                // caused by the tab closing between the two writes.
                                const result = await postSalaryApprovalJE(slip);
                                accrualJournalEntryId = result.je.id;
                                // Persist the staffPayableLedgerId on the slip so the
                                // payment JE knows which per-employee account to debit.
                                editSlip(slip.id, { staffPayableLedgerId: result.staffPayableLedgerId });
                              } catch (err) {
                                console.error("Salary accrual JE failed:", err);
                              }
                              editSlip(slip.id, { status: "Approved", accrualJournalEntryId });
                              toast({ title: "Approved", description: `${slip.staffName}'s slip approved and salary payable recorded.` });
                            }}
                            className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-muted-foreground hover:text-blue-600"
                          >
                            <BadgeCheck size={13} />
                          </button>
                        )}
                        {/* Pay */}
                        {slip.status !== "Paid" && (
                          <button
                            title="Pay Salary"
                            onClick={() => setPaySlipId(slip.id)}
                            className="p-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors text-muted-foreground hover:text-emerald-600"
                          >
                            <DollarSign size={13} />
                          </button>
                        )}
                        {/* Revert to Draft */}
                        {(slip.status === "Paid" || slip.status === "Approved") && (
                          <button
                            title="Revert to Draft"
                            onClick={() => setRevertId(slip.id)}
                            className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors text-muted-foreground hover:text-amber-600"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                        {/* Print */}
                        <button
                          title="Print Slip"
                          onClick={() => openPayslipWindow(slip)}
                          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Printer size={13} />
                        </button>
                        {/* Delete */}
                        {slip.status !== "Paid" && (
                          <button
                            title="Delete"
                            onClick={() => setDeleteId(slip.id)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-muted-foreground hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t bg-muted/30">
                <tr className="text-[12px] font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-muted-foreground">
                    {filtered.length} slip{filtered.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {fmt(filtered.reduce((s, x) => s + x.basicSalary, 0), sym)}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                    {fmt(filtered.reduce((s, x) => s + x.allowances.reduce((t, a) => t + a.amount, 0), 0), sym)}
                  </td>
                  <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">
                    {fmt(filtered.reduce((s, x) => s + x.deductions.reduce((t, d) => t + d.amount, 0), 0), sym)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {fmt(filtered.reduce((s, x) => s + x.grossSalary, 0), sym)}
                  </td>
                  <td className="px-3 py-2 text-right text-primary">
                    {fmt(filtered.reduce((s, x) => s + x.netSalary, 0), sym)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Generate for Staff Dialog ────────────────────────────────────────── */}
      {generateStaffOpen && (
        <GenerateForStaffDialog
          period={period}
          staff={staff}
          periodSlips={periodSlips}
          salaryTemplates={salaryTemplates}
          paymentAccounts={paymentAccounts}
          onSave={(data) => {
            try {
              addSlip(data);
              setGenerateStaffOpen(false);
              toast({ title: "Slip Generated", description: `Salary slip for ${data.staffName} (${periodLabel(period)}) created.` });
            } catch (err) {
              toast({ title: "Duplicate Slip", description: (err as Error).message, variant: "destructive" });
            }
          }}
          onClose={() => setGenerateStaffOpen(false)}
        />
      )}

      {/* ── Generate Payroll Dialog ──────────────────────────────────────────── */}
      <AlertDialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Payroll — {periodLabel(period)}</AlertDialogTitle>
            <AlertDialogDescription>
              This will create <strong>Draft</strong> salary slips for all active staff
              who do not already have a slip for <strong>{periodLabel(period)}</strong>.
              Existing slips will not be affected.
              <br /><br />
              Active staff without a slip: <strong>
                {staff.filter(s => s.status === "Active" && !periodSlips.some(p => p.staffId === s.id)).length}
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGeneratePayroll}>Generate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Slip Dialog ─────────────────────────────────────────────────── */}
      {editTarget && (
        <EditSlipDialog
          slip={editTarget}
          onSave={(updates) => {
            editSlip(editTarget.id, updates);
            setEditSlipId(null);
            toast({ title: "Saved", description: `${editTarget.staffName}'s slip updated.` });
          }}
          onClose={() => setEditSlipId(null)}
        />
      )}

      {/* ── Pay Dialog ───────────────────────────────────────────────────────── */}
      {payTarget && (
        <PayDialog
          slip={payTarget}
          paymentAccounts={paymentAccounts}
          sym={sym}
          onPay={(accountId, ledgerId, date) => {
            const account = paymentAccounts.find(a => a.id === accountId);
            let jeId: string | undefined;
            try {
              const je = postSalaryPaymentJE(payTarget, ledgerId, date);
              jeId = je.id;
            } catch (err) {
              console.error("JE posting failed:", err);
            }
            editSlip(payTarget.id, {
              status: "Paid",
              paymentAccountId: accountId,
              paymentMethod: (account?.paymentMethod as "Cash" | "Bank Transfer" | "Wallet") ?? "Cash",
              paidAt: new Date().toISOString(),
              journalEntryId: jeId,
            });
            setPaySlipId(null);
            toast({
              title: "Salary Paid",
              description: `${payTarget.staffName}'s salary marked as paid.`,
            });
          }}
          onClose={() => setPaySlipId(null)}
        />
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Salary Slip?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this salary slip. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) { removeSlip(deleteId); setDeleteId(null); toast({ title: "Deleted" }); }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Revert to Draft Confirm ──────────────────────────────────────────── */}
      <AlertDialog open={!!revertId} onOpenChange={() => setRevertId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw size={16} className="text-amber-500" /> Revert to Draft?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will reset the slip back to <strong>Draft</strong>, delete its linked
              journal entries (payment JE and accrual JE if present), and clear all payment fields.
              The slip can then be re-approved and re-paid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => {
                if (revertId) {
                  const slip = slips.find(s => s.id === revertId);
                  // Delete payment JE first (so its own salary-slip reversion hook doesn't fire
                  // and overwrite accrualJournalEntryId before we delete that too)
                  if (slip?.journalEntryId) {
                    try { deleteJournalEntry(slip.journalEntryId); } catch { /* already gone */ }
                  }
                  if (slip?.accrualJournalEntryId) {
                    try { deleteJournalEntry(slip.accrualJournalEntryId); } catch { /* already gone */ }
                  }
                  // Force the slip to Draft regardless of what the deleteJournalEntry hook set
                  editSlip(revertId, {
                    status:                "Draft",
                    paidAt:                undefined,
                    journalEntryId:        undefined,
                    accrualJournalEntryId: undefined,
                    paymentAccountId:      undefined,
                    paymentMethod:         undefined,
                  });
                  setRevertId(null);
                  toast({
                    title: "Reverted to Draft",
                    description: `${slip?.staffName ?? "Slip"}'s slip and journal entries have been removed.`,
                  });
                }
              }}
            >
              <RotateCcw size={13} className="mr-1.5" /> Revert to Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Edit Slip Dialog ─────────────────────────────────────────────────────────
function EditSlipDialog({
  slip,
  onSave,
  onClose,
}: {
  slip: SalarySlip;
  onSave: (updates: Partial<Omit<SalarySlip, "id" | "createdAt">>) => void;
  onClose: () => void;
}) {
  const [basic,      setBasic]      = useState(slip.basicSalary);
  const [allowances, setAllowances] = useState<SalarySlipItem[]>(slip.allowances);
  const [deductions, setDeductions] = useState<SalarySlipItem[]>(slip.deductions);
  const [notes,      setNotes]      = useState(slip.notes ?? "");
  const [salaryType, setSalaryType] = useState(slip.salaryType);

  const grossSalary = basic + allowances.reduce((s, a) => s + (a.amount || 0), 0);
  const netSalary   = grossSalary - deductions.reduce((s, d) => s + (d.amount || 0), 0);
  const sym = getSettingsCurrencySymbol();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Salary Slip — {slip.staffName}</DialogTitle>
          <DialogDescription>{periodLabel(slip.period)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Salary Type</label>
              <Select value={salaryType} onValueChange={v => setSalaryType(v as typeof salaryType)}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                  <SelectItem value="Hourly">Hourly</SelectItem>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Commission">Commission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Basic Salary</label>
              <Input
                type="number"
                min="0"
                className="h-8 text-[13px]"
                value={basic === 0 ? "" : basic}
                onChange={e => setBasic(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Allowances */}
          <ItemList label="Allowances" items={allowances} onChange={setAllowances} accent="emerald" />

          {/* Deductions */}
          <ItemList label="Deductions" items={deductions} onChange={setDeductions} accent="red" />

          {/* Summary */}
          <div className="rounded-lg border p-3 space-y-1.5 text-[13px] bg-muted/20">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Basic</span>
              <span>{sym}{basic.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>+ Allowances</span>
              <span>+{sym}{allowances.reduce((s, a) => s + (a.amount || 0), 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>− Deductions</span>
              <span>-{sym}{deductions.reduce((s, d) => s + (d.amount || 0), 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1.5 text-primary">
              <span>Net Salary</span>
              <span>{sym}{netSalary.toLocaleString()}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Notes</label>
            <textarea
              rows={2}
              className="w-full border rounded-md px-3 py-2 text-[13px] bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ basicSalary: basic, allowances, deductions, salaryType, notes })}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pay Dialog ───────────────────────────────────────────────────────────────
function PayDialog({
  slip,
  paymentAccounts,
  sym,
  onPay,
  onClose,
}: {
  slip: SalarySlip;
  paymentAccounts: ReturnType<typeof getPaymentAccounts>;
  sym: string;
  onPay: (accountId: string, ledgerId: string, date: string) => void;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [accountId, setAccountId] = useState(paymentAccounts[0]?.id ?? "");
  const [date,      setDate]      = useState(today);

  const account = paymentAccounts.find(a => a.id === accountId);

  const handlePay = () => {
    if (!accountId) return;
    const ledgerId = account?.ledgerAccountId ?? "";
    if (!ledgerId) return;
    onPay(accountId, ledgerId, date);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-600" /> Pay Salary
          </DialogTitle>
          <DialogDescription>{slip.staffName} — {periodLabel(slip.period)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Net amount highlight */}
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
            <p className="text-[11px] text-muted-foreground">Net Amount to Pay</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {sym}{slip.netSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Payment account */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Payment Account</label>
            {paymentAccounts.length === 0 ? (
              <p className="text-[12px] text-destructive">No payment accounts configured. Add one in Payment Accounts.</p>
            ) : (
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.accountTitle} ({a.paymentMethod})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Payment Date</label>
            <Input type="date" className="h-9 text-[13px]" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* JE info — always posted, no opt-out */}
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 px-3 py-2 text-[12px] text-blue-700 dark:text-blue-300">
            A journal entry will be posted automatically:<br />
            <span className="font-mono">
              Dr {slip.accrualJournalEntryId ? `${slip.staffName} - Payable Account` : "Salary Expense"} → Cr {account?.accountTitle ?? "Payment Account"}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handlePay}
            disabled={!accountId || paymentAccounts.length === 0}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 size={14} /> Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Generate for Staff Dialog (template-based) ───────────────────────────────
type GenStaffData = Omit<SalarySlip, "id" | "grossSalary" | "netSalary" | "createdAt" | "updatedAt">;

function GenerateForStaffDialog({
  period,
  staff,
  periodSlips,
  salaryTemplates,
  paymentAccounts,
  onSave,
  onClose,
}: {
  period: string;
  staff: ReturnType<typeof useStaff>["staff"];
  periodSlips: SalarySlip[];
  salaryTemplates: ReturnType<typeof useSalaryTemplates>["templates"];
  paymentAccounts: ReturnType<typeof usePaymentAccounts>["accounts"];
  onSave: (data: GenStaffData) => void;
  onClose: () => void;
}) {
  const sym = getSettingsCurrencySymbol();

  const activeStaffWithoutSlip = useMemo(() => {
    const existingIds = new Set(periodSlips.map(s => s.staffId));
    return staff.filter(s => s.status === "Active" && !existingIds.has(s.id));
  }, [staff, periodSlips]);

  const [selectedStaffId, setSelectedStaffId] = useState(activeStaffWithoutSlip[0]?.id ?? "");
  const [basic,           setBasic]           = useState(0);
  const [allowances,      setAllowances]      = useState<SalarySlipItem[]>([]);
  const [deductions,      setDeductions]      = useState<SalarySlipItem[]>([]);
  const [notes,           setNotes]           = useState("");

  const selectedStaff = useMemo(
    () => staff.find(s => s.id === selectedStaffId) ?? null,
    [staff, selectedStaffId]
  );

  const matchingTemplate = useMemo(() => {
    if (!selectedStaff) return null;
    return (
      salaryTemplates.find(t => t.staffId === selectedStaff.id) ??
      salaryTemplates.find(t => t.designation === selectedStaff.designation) ??
      salaryTemplates.find(t => t.designation === selectedStaff.role) ??
      null
    );
  }, [selectedStaff, salaryTemplates]);

  useEffect(() => {
    if (!selectedStaff) { setBasic(0); setAllowances([]); setDeductions([]); return; }
    if (matchingTemplate) {
      setBasic(matchingTemplate.basicSalary);
      setAllowances(matchingTemplate.allowances.map(a => ({ label: a.type, amount: a.amount })));
      setDeductions(matchingTemplate.deductions.map(d => ({ label: d.type, amount: d.amount })));
    } else {
      setBasic(selectedStaff.basicSalary ?? 0);
      const allow = selectedStaff.allowances ?? 0;
      const deduct = selectedStaff.deductions ?? 0;
      setAllowances(allow > 0 ? [{ label: "Allowances", amount: allow }] : []);
      setDeductions(deduct > 0 ? [{ label: "Deductions", amount: deduct }] : []);
    }
  }, [selectedStaff, matchingTemplate]);

  const grossSalary = basic + allowances.reduce((s, a) => s + (a.amount || 0), 0);
  const netSalary   = grossSalary - deductions.reduce((s, d) => s + (d.amount || 0), 0);

  function handleSave() {
    if (!selectedStaff) return;
    onSave({
      staffId:     selectedStaff.id,
      staffName:   selectedStaff.name,
      department:  selectedStaff.department ?? "",
      designation: selectedStaff.designation ?? "",
      period,
      salaryType:  selectedStaff.salaryType ?? "Monthly",
      basicSalary: basic,
      allowances,
      deductions,
      status:      "Draft",
      notes,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus size={15} className="text-primary" /> Generate Salary Slip — {periodLabel(period)}
          </DialogTitle>
          <DialogDescription>Generate a single staff salary slip, pre-filled from their salary template.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Staff selector */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Staff Member</label>
            {activeStaffWithoutSlip.length === 0 ? (
              <p className="text-[13px] text-muted-foreground rounded-lg border p-3 bg-muted/30">
                All active staff already have slips for {periodLabel(period)}.
              </p>
            ) : (
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="Select staff…" /></SelectTrigger>
                <SelectContent>
                  {activeStaffWithoutSlip.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.designation && <span className="text-muted-foreground ml-1.5 text-[11px]">({s.designation})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {matchingTemplate && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 size={11} /> Pre-filled from salary template ({matchingTemplate.designation})
              </p>
            )}
          </div>

          {/* Basic Salary */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Basic Salary</label>
            <Input
              type="number" min="0"
              className="h-8 text-[13px]"
              value={basic === 0 ? "" : basic}
              onChange={e => setBasic(parseFloat(e.target.value) || 0)}
            />
          </div>

          {/* Allowances */}
          <ItemList label="Allowances" items={allowances} onChange={setAllowances} accent="emerald" />

          {/* Deductions */}
          <ItemList label="Deductions" items={deductions} onChange={setDeductions} accent="red" />

          {/* Summary */}
          <div className="rounded-lg border p-3 space-y-1.5 text-[13px] bg-muted/20">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Basic Salary</span>
              <span>{sym}{basic.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>+ Allowances</span>
              <span>+{sym}{allowances.reduce((s, a) => s + (a.amount || 0), 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>− Deductions</span>
              <span>-{sym}{deductions.reduce((s, d) => s + (d.amount || 0), 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1.5 text-primary">
              <span>Net Salary</span>
              <span>{sym}{netSalary.toLocaleString()}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Notes</label>
            <textarea
              rows={2}
              className="w-full border rounded-md px-3 py-2 text-[13px] bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!selectedStaffId || activeStaffWithoutSlip.length === 0}
            className="gap-1.5"
          >
            <FileSpreadsheet size={13} /> Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
