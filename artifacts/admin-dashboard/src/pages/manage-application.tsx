import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  ClipboardList, CheckCircle2, XCircle, Clock, DollarSign, CreditCard,
  Banknote, Search, AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useAdvanceSalaries } from "@/hooks/use-data";
import { AdvanceSalaryStatus } from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

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

export default function ManageApplicationPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  const { records, edit } = useAdvanceSalaries();
  const sym = getSettingsCurrencySymbol();

  const [deductMonthFilter, setDeductMonthFilter] = useState("__all__");
  const [statusFilter,      setStatusFilter]      = useState("Pending");
  const [search,            setSearch]            = useState("");

  const mOpts = useMemo(() => monthOptions(), []);

  const filtered = useMemo(() => {
    let rows = records;
    if (deductMonthFilter !== "__all__") rows = rows.filter(r => r.deductMonth === deductMonthFilter);
    if (statusFilter      !== "__all__") rows = rows.filter(r => r.status      === statusFilter);
    if (search.trim())                   rows = rows.filter(r =>
      r.staffName.toLowerCase().includes(search.toLowerCase()) ||
      r.staffRole.toLowerCase().includes(search.toLowerCase())
    );
    return [...rows].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
  }, [records, deductMonthFilter, statusFilter, search]);

  const pendingCount = useMemo(() => records.filter(r => r.status === "Pending").length, [records]);

  function handleStatusChange(id: string, status: AdvanceSalaryStatus) {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    edit(id, { status });
    const msg = status === "Approved" ? "Approved" : status === "Rejected" ? "Rejected" : "Paid";
    toast({ title: msg, description: `${rec.staffName}'s advance salary request has been ${msg.toLowerCase()}.` });
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
            <ClipboardList size={22} className="text-primary" /> Manage Applications
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Review & approve advance salary requests</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[12px] font-medium">
            <AlertCircle size={13} />
            {pendingCount} pending approval
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["Pending", "Approved", "Rejected", "Paid"] as AdvanceSalaryStatus[]).map(s => {
          const cfg = STATUS_CFG[s];
          const count = records.filter(r => r.status === s).length;
          const amt   = records.filter(r => r.status === s).reduce((x, r) => x + r.amount, 0);
          return (
            <div
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "__all__" : s)}
              className={`rounded-xl ${cfg.bg} p-4 cursor-pointer transition-all ring-2 ${statusFilter === s ? "ring-primary" : "ring-transparent"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <cfg.icon size={14} className={cfg.color} />
                <span className={`text-[12px] font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
              <p className={`text-xl font-bold ${cfg.color}`}>{count}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{fmt(amt, sym)}</p>
            </div>
          );
        })}
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
          {filtered.length} application{filtered.length !== 1 ? "s" : ""}
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
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Notes</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Status</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-[11px] uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-muted-foreground">
                    <ClipboardList size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No applications{statusFilter !== "__all__" ? ` with status "${statusFilter}"` : ""}</p>
                    <p className="text-[12px] mt-1">Click a status card above to filter or change the filter settings.</p>
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
                    <td className="px-3 py-2.5 text-muted-foreground">{format(parseISO(rec.appliedOn), "dd MMM yyyy")}</td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate" title={rec.notes}>{rec.notes || "—"}</td>
                    <td className="px-3 py-2.5 text-center">{statusPill(rec.status)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {rec.status === "Pending" && can("write") && (
                          <>
                            <button
                              title="Approve"
                              onClick={() => handleStatusChange(rec.id, "Approved")}
                              className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-muted-foreground hover:text-blue-600 flex items-center gap-1 text-[11px] font-medium"
                            >
                              <CheckCircle2 size={13} /> Approve
                            </button>
                            <button
                              title="Reject"
                              onClick={() => handleStatusChange(rec.id, "Rejected")}
                              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-muted-foreground hover:text-red-600 flex items-center gap-1 text-[11px] font-medium"
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          </>
                        )}
                        {rec.status === "Approved" && can("write") && (
                          <button
                            title="Mark Paid"
                            onClick={() => handleStatusChange(rec.id, "Paid")}
                            className="p-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors text-muted-foreground hover:text-emerald-600 flex items-center gap-1 text-[11px] font-medium"
                          >
                            <DollarSign size={13} /> Mark Paid
                          </button>
                        )}
                        {(rec.status === "Rejected" || rec.status === "Paid") && (
                          <span className="text-[11px] text-muted-foreground px-1.5">—</span>
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
    </div>
  );
}
