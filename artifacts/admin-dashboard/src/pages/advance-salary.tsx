import { useState, useMemo, useCallback } from "react";
import { format, parseISO } from "date-fns";
import {
  Banknote, Plus, Pencil, Trash2, CheckCircle2, XCircle, Clock,
  Search, DollarSign, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useAdvanceSalaries, useStaff, usePaymentAccounts } from "@/hooks/use-data";
import { AdvanceSalary, AdvanceSalaryStatus } from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

function fmt(n: number, sym: string) {
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CFG: Record<AdvanceSalaryStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  Pending:  { label: "Pending",  color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-900/30",   icon: Clock         },
  Approved: { label: "Approved", color: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-50 dark:bg-blue-900/30",     icon: CheckCircle2  },
  Rejected: { label: "Rejected", color: "text-red-700 dark:text-red-300",       bg: "bg-red-50 dark:bg-red-900/30",       icon: XCircle       },
  Paid:     { label: "Paid",     color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/30", icon: DollarSign  },
};

type FormData = {
  staffId:          string;
  amount:           string;
  deductMonth:      string;
  payVia:           "Cash" | "Bank";
  paymentAccountId: string;
  notes:            string;
};

const BLANK: FormData = {
  staffId: "", amount: "", deductMonth: currentMonthStr(),
  payVia: "Cash", paymentAccountId: "", notes: "",
};

function AdvanceSalaryForm({
  initial,
  title,
  onSave,
  onClose,
}: {
  initial?: Partial<FormData>;
  title: string;
  onSave: (d: FormData) => void;
  onClose: () => void;
}) {
  const { staff } = useStaff();
  const { accounts } = usePaymentAccounts();
  const [form, setForm] = useState<FormData>({ ...BLANK, ...initial });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const bankAccounts = accounts.filter(a => a.paymentMethod !== "Cash");
  const mOpts = useMemo(() => monthOptions(), []);

  function set(k: keyof FormData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  }

  function validate() {
    const errs: typeof errors = {};
    if (!form.staffId)      errs.staffId     = "Required";
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = "Enter a valid amount";
    if (!form.deductMonth)  errs.deductMonth = "Required";
    return errs;
  }

  function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  const activeStaff = staff.filter(s => s.status === "Active");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Record an advance salary payment for a staff member.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {/* Staff */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Staff Member <span className="text-destructive">*</span></label>
            <Select value={form.staffId} onValueChange={v => set("staffId", v)}>
              <SelectTrigger className={`h-8 text-[13px] ${errors.staffId ? "border-destructive" : ""}`}>
                <SelectValue placeholder="Select staff…" />
              </SelectTrigger>
              <SelectContent>
                {activeStaff.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.designation ? <span className="text-muted-foreground ml-1.5 text-[11px]">({s.designation})</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.staffId && <p className="text-[11px] text-destructive mt-0.5">{errors.staffId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Amount */}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Amount <span className="text-destructive">*</span></label>
              <Input
                type="number" min="0" step="0.01"
                className={`h-8 text-[13px] ${errors.amount ? "border-destructive" : ""}`}
                placeholder="0.00"
                value={form.amount}
                onChange={e => set("amount", e.target.value)}
              />
              {errors.amount && <p className="text-[11px] text-destructive mt-0.5">{errors.amount}</p>}
            </div>

            {/* Deduct Month */}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Deduct Month <span className="text-destructive">*</span></label>
              <Select value={form.deductMonth} onValueChange={v => set("deductMonth", v)}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Pay Via */}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Pay Via</label>
              <Select value={form.payVia} onValueChange={v => { set("payVia", v as "Cash" | "Bank"); if (v === "Cash") set("paymentAccountId", ""); }}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bank Account (only if Bank) */}
            {form.payVia === "Bank" && (
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Bank Account</label>
                <Select value={form.paymentAccountId} onValueChange={v => set("paymentAccountId", v)}>
                  <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.accountTitle}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Notes</label>
            <textarea
              rows={2}
              className="w-full border rounded-md px-3 py-2 text-[13px] bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional notes…"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Pay Now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdvanceSalaryPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  const { records, add, edit, remove } = useAdvanceSalaries();
  const { staff } = useStaff();
  const sym = getSettingsCurrencySymbol();

  const [deductMonthFilter, setDeductMonthFilter] = useState("__all__");
  const [statusFilter,      setStatusFilter]      = useState("__all__");
  const [search,            setSearch]            = useState("");

  const [addOpen,    setAddOpen]    = useState(false);
  const [editTarget, setEditTarget] = useState<AdvanceSalary | null>(null);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);

  const mOpts = useMemo(() => monthOptions(), []);

  const filtered = useMemo(() => {
    let rows = records;
    if (deductMonthFilter !== "__all__") rows = rows.filter(r => r.deductMonth === deductMonthFilter);
    if (statusFilter      !== "__all__") rows = rows.filter(r => r.status      === statusFilter);
    if (search.trim())                   rows = rows.filter(r =>
      r.staffName.toLowerCase().includes(search.toLowerCase()) ||
      r.staffRole.toLowerCase().includes(search.toLowerCase())
    );
    return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [records, deductMonthFilter, statusFilter, search]);

  const kpi = useMemo(() => ({
    total:    records.length,
    pending:  records.filter(r => r.status === "Pending").length,
    approved: records.filter(r => r.status === "Approved").length,
    paid:     records.filter(r => r.status === "Paid").length,
    totalAmt: records.reduce((s, r) => s + r.amount, 0),
  }), [records]);

  const handleSave = useCallback((form: { staffId: string; amount: string; deductMonth: string; payVia: "Cash" | "Bank"; paymentAccountId: string; notes: string }) => {
    const s = staff.find(x => x.id === form.staffId);
    const data = {
      staffId:          form.staffId,
      staffName:        s?.name ?? "",
      staffRole:        s?.designation ?? s?.department ?? "",
      amount:           parseFloat(form.amount) || 0,
      deductMonth:      form.deductMonth,
      payVia:           form.payVia,
      paymentAccountId: form.paymentAccountId || undefined,
      notes:            form.notes || undefined,
      status:           "Pending" as AdvanceSalaryStatus,
      appliedOn:        new Date().toISOString(),
    };
    if (editTarget) {
      edit(editTarget.id, { ...data, status: editTarget.status });
      setEditTarget(null);
      toast({ title: "Updated", description: `Advance salary for ${data.staffName} updated.` });
    } else {
      add(data);
      setAddOpen(false);
      toast({ title: "Added", description: `Advance salary for ${data.staffName} added.` });
    }
  }, [staff, editTarget, add, edit, toast]);

  function handleStatusChange(id: string, status: AdvanceSalaryStatus) {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    edit(id, { status });
    toast({ title: `Status: ${status}`, description: `${rec.staffName}'s advance salary marked as ${status}.` });
  }

  const statusPill = (s: AdvanceSalaryStatus) => {
    const cfg = STATUS_CFG[s];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
        <cfg.icon size={10} />
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Banknote size={22} className="text-primary" /> Advance Salary
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage staff advance salary requests & payments</p>
        </div>
        {can("write") && (
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 h-8">
            <Plus size={13} /> Add Advance Salary
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Requests", value: kpi.total,    icon: CreditCard,   color: "text-indigo-600 dark:text-indigo-400",   bg: "bg-indigo-50 dark:bg-indigo-950/30",   isMoney: false },
          { label: "Pending",        value: kpi.pending,  icon: Clock,        color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-950/30",     isMoney: false },
          { label: "Approved",       value: kpi.approved, icon: CheckCircle2, color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-50 dark:bg-blue-950/30",       isMoney: false },
          { label: "Total Amount",   value: kpi.totalAmt, icon: Banknote,     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", isMoney: true  },
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

      {/* Filters */}
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
        <Select value={deductMonthFilter} onValueChange={setDeductMonthFilter}>
          <SelectTrigger className="h-8 w-40 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Months</SelectItem>
            {mOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-32 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
            <SelectItem value="Paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[12px] text-muted-foreground ml-auto">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Applicant</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Staff Role</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Deduct Month</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Amount</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Pay Via</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Applied On</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Status</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted-foreground">
                    <Banknote size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No advance salary records</p>
                    <p className="text-[12px] mt-1">Click "Add Advance Salary" to create a new record.</p>
                  </td>
                </tr>
              ) : filtered.map((rec, idx) => {
                const [yr, mo] = rec.deductMonth.split("-");
                const monthLabel = `${MONTHS[parseInt(mo) - 1]} ${yr}`;
                return (
                  <tr key={rec.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                          {rec.staffName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{rec.staffName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{rec.staffRole || "—"}</td>
                    <td className="px-3 py-2.5">{monthLabel}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-primary">{fmt(rec.amount, sym)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-[12px]">
                        {rec.payVia === "Cash" ? <DollarSign size={11} className="text-emerald-600" /> : <CreditCard size={11} className="text-blue-600" />}
                        {rec.payVia}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {format(parseISO(rec.appliedOn), "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-2.5 text-center">{statusPill(rec.status)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Status transitions */}
                        {rec.status === "Pending" && can("write") && (
                          <>
                            <button
                              title="Approve"
                              onClick={() => handleStatusChange(rec.id, "Approved")}
                              className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-muted-foreground hover:text-blue-600"
                            >
                              <CheckCircle2 size={13} />
                            </button>
                            <button
                              title="Reject"
                              onClick={() => handleStatusChange(rec.id, "Rejected")}
                              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-muted-foreground hover:text-red-600"
                            >
                              <XCircle size={13} />
                            </button>
                          </>
                        )}
                        {rec.status === "Approved" && can("write") && (
                          <button
                            title="Mark Paid"
                            onClick={() => handleStatusChange(rec.id, "Paid")}
                            className="p-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors text-muted-foreground hover:text-emerald-600"
                          >
                            <DollarSign size={13} />
                          </button>
                        )}
                        {/* Edit */}
                        {rec.status !== "Paid" && can("write") && (
                          <button
                            title="Edit"
                            onClick={() => setEditTarget(rec)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {/* Delete */}
                        {can("delete") && (
                          <button
                            title="Delete"
                            onClick={() => setDeleteId(rec.id)}
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
          </table>
        </div>
      </div>

      {/* Add Dialog */}
      {addOpen && (
        <AdvanceSalaryForm
          title="Add Advance Salary"
          onSave={handleSave}
          onClose={() => setAddOpen(false)}
        />
      )}

      {/* Edit Dialog */}
      {editTarget && (
        <AdvanceSalaryForm
          title="Edit Advance Salary"
          initial={{
            staffId:          editTarget.staffId,
            amount:           String(editTarget.amount),
            deductMonth:      editTarget.deductMonth,
            payVia:           editTarget.payVia,
            paymentAccountId: editTarget.paymentAccountId ?? "",
            notes:            editTarget.notes ?? "",
          }}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Advance Salary Record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) { remove(deleteId); setDeleteId(null); toast({ title: "Deleted" }); }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
