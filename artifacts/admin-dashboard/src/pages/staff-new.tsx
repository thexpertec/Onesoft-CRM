import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useStaff, useStaffRoles } from "@/hooks/use-data";
import { StaffStatus, getDepartments, getDesignations } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Users2, Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, ComboOption } from "@/components/combobox";
import { format } from "date-fns";


const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 pt-1">
    <div className="h-px flex-1 bg-border" />
    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">{label}</span>
    <div className="h-px flex-1 bg-border" />
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[12px] font-semibold text-foreground">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
  </div>
);

export default function StaffNewPage() {
  const [, nav] = useLocation();
  const { addStaff } = useStaff();
  const { roles } = useStaffRoles();
  const { toast } = useToast();
  const roleNames   = useMemo(() => roles.map(r => r.name), [roles]);
  const allDepts    = useMemo(() => getDepartments().filter(d => d.isActive), []);
  const allDesigs   = useMemo(() => getDesignations().filter(d => d.isActive), []);
  const deptComboOpts  = useMemo<ComboOption[]>(() => allDepts.map(d => ({ value: d.name,  label: d.name,  sub: d.headOf || undefined })), [allDepts]);
  const desigComboOpts = useMemo<ComboOption[]>(() => allDesigs.map(d => ({ value: d.title, label: d.title, sub: d.department || undefined })), [allDesigs]);
  const roleComboOpts  = useMemo<ComboOption[]>(() => roleNames.map(r => ({ value: r, label: r })), [roleNames]);

  const BLANK = () => ({
    name: "", department: "", designation: "", role: "",
    status: "Active" as StaffStatus,
    email: "", phone: "",
    joinDate: format(new Date(), "yyyy-MM-dd"),
    openingBalance: "", notes: "",
    salaryType: "Monthly" as "Monthly" | "Hourly" | "Daily" | "Commission",
    basicSalary: "", allowances: "", deductions: "",
    bankName: "", accountNumber: "",
  });

  const [form, setForm] = useState(BLANK());
  const set = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  // ── Smart designation filter: only show designations for the selected department ──
  const desigOptsForDept = useMemo<ComboOption[]>(() => {
    if (!form.department) return desigComboOpts;
    const filtered = allDesigs.filter(d => d.department === form.department).map(d => ({ value: d.title, label: d.title }));
    return filtered.length > 0 ? filtered : desigComboOpts;
  }, [form.department, allDesigs, desigComboOpts]);

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Full name is required", variant: "destructive" }); return;
    }
    if (!form.department.trim()) {
      toast({ title: "Department is required", variant: "destructive" }); return;
    }
    if (!form.designation.trim()) {
      toast({ title: "Designation is required", variant: "destructive" }); return;
    }
    if (!form.role.trim()) {
      toast({ title: "Role is required", variant: "destructive" }); return;
    }
    if (!form.phone.trim()) {
      toast({ title: "Phone number is required", variant: "destructive" }); return;
    }
    addStaff({
      name:           form.name.trim(),
      department:     form.department.trim(),
      designation:    form.designation.trim(),
      role:           form.role.trim(),
      status:         form.status,
      email:          form.email.trim(),
      phone:          form.phone.trim(),
      joinDate:       form.joinDate || format(new Date(), "yyyy-MM-dd"),
      openingBalance: form.openingBalance ? parseFloat(form.openingBalance) : undefined,
      notes:          form.notes.trim(),
      salaryType:     form.salaryType,
      basicSalary:    form.basicSalary    ? parseFloat(form.basicSalary)    : undefined,
      allowances:     form.allowances     ? parseFloat(form.allowances)     : undefined,
      deductions:     form.deductions     ? parseFloat(form.deductions)     : undefined,
      bankName:       form.bankName.trim()       || undefined,
      accountNumber:  form.accountNumber.trim()  || undefined,
    });
    toast({ title: "Staff member added", description: `${form.name.trim()} has been added.` });
    nav("/staff");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-10">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav("/staff")} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> Back to Staff
        </Button>
      </div>

      {/* Card */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">

        {/* Gradient card header */}
        <div className="flex items-center gap-4 px-6 py-5 bg-gradient-to-r from-rose-600 to-pink-600">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Users2 size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-white leading-snug">Add Staff Member</h1>
            <p className="text-[12px] text-rose-100 truncate mt-0.5">
              {form.name.trim()
                ? `${form.name}${form.designation ? " · " + form.designation : ""}${form.department ? " · " + form.department : ""}`
                : "Name required · all other fields optional"}
            </p>
          </div>
        </div>

        {/* Form body */}
        <div className="px-6 py-6 space-y-5">

          {/* ── Name (full width) ── */}
          <Field label="Full Name *">
            <Input autoFocus placeholder="e.g. Sarah Khan" value={form.name}
              onChange={e => set("name", e.target.value)}
              className="h-10 text-[15px] font-medium" />
          </Field>

          <Divider label="Identity & Contact" />

          {/* ── 6-col: Dept | Designation | Role | Email | Phone | Join Date ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Field label="Department *">
              <Combobox value={form.department} onChange={v => set("department", v)}
                options={deptComboOpts} placeholder="Select or type…"
                inputClassName="h-9 text-sm w-full border rounded-md px-3" />
            </Field>
            <Field label="Designation *">
              <Combobox value={form.designation} onChange={v => set("designation", v)}
                options={desigOptsForDept} placeholder="Select or type…"
                inputClassName="h-9 text-sm w-full border rounded-md px-3" />
            </Field>
            <Field label="Role *">
              <Combobox value={form.role} onChange={v => set("role", v)}
                options={roleComboOpts} placeholder="Select or type…"
                inputClassName="h-9 text-sm w-full border rounded-md px-3" />
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="staff@company.com" value={form.email}
                onChange={e => set("email", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Phone *">
              <Input type="tel" placeholder="+44 7700 900000" value={form.phone}
                onChange={e => set("phone", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Join Date">
              <Input type="date" value={form.joinDate}
                onChange={e => set("joinDate", e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>

          <Divider label="Status" />

          {/* ── Status pills ── */}
          <div className="flex gap-3">
            {(["Active", "On Leave", "Terminated"] as const).map(s => (
              <button key={s} type="button" onClick={() => set("status", s)}
                className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all border ${
                  form.status === s
                    ? s === "Active"    ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                    : s === "On Leave" ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                    :                    "bg-red-600 border-red-600 text-white shadow-sm"
                    : "bg-background border-border text-muted-foreground hover:border-gray-400 hover:text-foreground"
                }`}>{s}</button>
            ))}
          </div>

          <Divider label="Banking & Opening Balance" />

          {/* ── Bank Name | Account | Opening Balance ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Bank Name">
              <Input placeholder="e.g. Barclays, HBL" value={form.bankName}
                onChange={e => set("bankName", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Account Number / IBAN">
              <Input placeholder="Account number or IBAN" value={form.accountNumber}
                onChange={e => set("accountNumber", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Opening Balance" hint="Salary advance / balance owed at setup">
              <Input type="number" step="0.01" placeholder="0.00"
                value={form.openingBalance} onChange={e => set("openingBalance", e.target.value)}
                className="h-9 text-sm tabular-nums" />
            </Field>
          </div>

          <Divider label="Notes" />

          {/* ── Notes ── */}
          <textarea rows={3}
            placeholder="Optional notes about this staff member — skills, assigned projects, emergency contact, performance notes…"
            value={form.notes} onChange={e => set("notes", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={() => nav("/staff")} className="h-10 px-6 text-[13px]">
            Cancel
          </Button>
          <Button onClick={handleSubmit}
            className="flex-1 h-10 font-semibold text-[13px] bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white border-0 shadow-sm gap-2">
            <Plus size={15} /> Add Staff Member
          </Button>
        </div>
      </div>
    </div>
  );
}
