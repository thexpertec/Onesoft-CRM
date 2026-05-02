import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  FileText, Plus, Clock, CheckCircle2, XCircle, DollarSign, CreditCard, Banknote,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useAdvanceSalaries, useStaff } from "@/hooks/use-data";
import { AdvanceSalaryStatus } from "@/lib/store";
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
  amount:      string;
  deductMonth: string;
  payVia:      "Cash" | "Bank";
  notes:       string;
};

const BLANK: FormData = {
  amount: "", deductMonth: currentMonthStr(), payVia: "Cash", notes: "",
};

function ApplicationForm({
  title,
  onSave,
  onClose,
}: {
  title: string;
  onSave: (d: FormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormData>(BLANK);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const mOpts = useMemo(() => monthOptions(), []);

  function set(k: keyof FormData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  }

  function handleSave() {
    const errs: typeof errors = {};
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = "Enter a valid amount";
    if (!form.deductMonth) errs.deductMonth = "Required";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Submit a new advance salary request.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Deduct Month <span className="text-destructive">*</span></label>
            <Select value={form.deductMonth} onValueChange={v => set("deductMonth", v)}>
              <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {mOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Pay Via</label>
            <Select value={form.payVia} onValueChange={v => set("payVia", v as "Cash" | "Bank")}>
              <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Reason / Notes</label>
            <textarea
              rows={2}
              className="w-full border rounded-md px-3 py-2 text-[13px] bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Reason for advance salary request…"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Submit Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MyApplicationPage() {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const { records, add } = useAdvanceSalaries();
  const { staff } = useStaff();
  const sym = getSettingsCurrencySymbol();

  const [deductMonthFilter, setDeductMonthFilter] = useState("__all__");
  const [search,            setSearch]            = useState("");
  const [addOpen,           setAddOpen]           = useState(false);

  const mOpts = useMemo(() => monthOptions(), []);

  const currentStaff = useMemo(() =>
    staff.find(s => s.name?.toLowerCase() === (currentUser?.username ?? "").toLowerCase()) ?? null,
    [staff, currentUser]
  );

  const myRecords = useMemo(() => {
    let rows = currentStaff
      ? records.filter(r => r.staffId === currentStaff.id)
      : records;
    if (deductMonthFilter !== "__all__") rows = rows.filter(r => r.deductMonth === deductMonthFilter);
    if (search.trim()) rows = rows.filter(r =>
      r.staffName.toLowerCase().includes(search.toLowerCase())
    );
    return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [records, currentStaff, deductMonthFilter, search]);

  function handleApply(form: { amount: string; deductMonth: string; payVia: "Cash" | "Bank"; notes: string }) {
    const s = currentStaff;
    add({
      staffId:     s?.id ?? "self",
      staffName:   s?.name ?? currentUser?.fullName ?? currentUser?.username ?? "Me",
      staffRole:   s?.designation ?? s?.department ?? "",
      amount:      parseFloat(form.amount) || 0,
      deductMonth: form.deductMonth,
      payVia:      form.payVia,
      status:      "Pending",
      appliedOn:   new Date().toISOString(),
      notes:       form.notes || undefined,
    });
    setAddOpen(false);
    toast({ title: "Request Submitted", description: "Your advance salary request has been submitted for approval." });
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
            <FileText size={22} className="text-primary" /> My Applications
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Your advance salary requests</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 h-8">
          <Plus size={13} /> Apply for Advance
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-7 h-8 w-44 text-[13px]"
            placeholder="Search…"
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
        <span className="text-[12px] text-muted-foreground ml-auto">
          {myRecords.length} application{myRecords.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Deduct Month</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Amount</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Pay Via</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Applied On</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Created At</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {myRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-muted-foreground">
                    <FileText size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No applications yet</p>
                    <p className="text-[12px] mt-1">Click "Apply for Advance" to submit a request.</p>
                  </td>
                </tr>
              ) : myRecords.map((rec, idx) => {
                const [yr, mo] = rec.deductMonth.split("-");
                const monthLabel = `${MONTHS[parseInt(mo) - 1]} ${yr}`;
                return (
                  <tr key={rec.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-medium">{monthLabel}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-primary">{fmt(rec.amount, sym)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-[12px]">
                        {rec.payVia === "Cash" ? <DollarSign size={11} className="text-emerald-600" /> : <CreditCard size={11} className="text-blue-600" />}
                        {rec.payVia}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{format(parseISO(rec.appliedOn), "dd MMM yyyy")}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{format(parseISO(rec.createdAt), "dd MMM yyyy")}</td>
                    <td className="px-3 py-2.5 text-center">{statusPill(rec.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <ApplicationForm
          title="Apply for Advance Salary"
          onSave={handleApply}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
