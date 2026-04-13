import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useSuppliers, useCities, useAreas } from "@/hooks/use-data";
import { SupplierStatus } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowLeft, Building2, Star as StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboOption } from "@/components/combobox";

const SUPPLIER_STATUSES: SupplierStatus[] = ["Active", "Inactive", "Blacklisted"];
const SUPPLIER_CATEGORIES = [
  "Software & Technology","Hardware & Equipment","Consulting & Advisory",
  "Marketing & Design","Legal & Compliance","Finance & Accounting",
  "HR & Recruitment","Logistics & Delivery","Office Supplies","Other",
];

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

export default function SupplierNewPage() {
  const [, nav] = useLocation();
  const { suppliers, addSupplier } = useSuppliers();
  const { cities } = useCities();
  const { areas }  = useAreas();
  const { toast } = useToast();

  const cityComboOpts = useMemo<ComboOption[]>(() => cities.map(c => ({ value: c.name, label: c.name })), [cities]);
  const areaComboOpts = useMemo<ComboOption[]>(() => areas.map(a => ({ value: a.name, label: a.name })), [areas]);

  const existingEmails = useMemo(() => new Set(suppliers.map(s => s.email?.toLowerCase()).filter(Boolean)), [suppliers]);
  const existingPhones = useMemo(() => new Set(suppliers.map(s => s.phone?.replace(/\D/g, "")).filter(p => p && p.length >= 7)), [suppliers]);

  const BLANK = () => ({
    company: "", contactPerson: "", email: "", phone: "",
    category: SUPPLIER_CATEGORIES[0], city: "", area: "", country: "",
    status: "Active" as SupplierStatus, rating: 0,
    currency: "GBP", openingBalance: "", notes: "", tags: "",
  });
  const [form, setForm] = useState(BLANK());
  const set = (key: string, value: string | number) => setForm(p => ({ ...p, [key]: value }));

  const handleSubmit = () => {
    if (!form.company.trim()) { toast({ title: "Company name is required", variant: "destructive" }); return; }
    const emailLower = form.email?.toLowerCase();
    const normPhone  = form.phone?.replace(/\D/g, "");
    if (emailLower && existingEmails.has(emailLower)) {
      toast({ title: "Duplicate email", description: `"${form.email}" already exists.`, variant: "destructive" }); return;
    }
    if (normPhone && normPhone.length >= 7 && existingPhones.has(normPhone)) {
      toast({ title: "Duplicate phone", description: `"${form.phone}" already exists.`, variant: "destructive" }); return;
    }
    addSupplier({
      company: form.company.trim(), contactPerson: form.contactPerson.trim(),
      email: form.email.trim(), phone: form.phone.trim(),
      category: form.category || SUPPLIER_CATEGORIES[0],
      city: form.city.trim(), area: form.area.trim() || undefined,
      country: form.country.trim(), status: form.status,
      rating: form.rating, currency: form.currency.trim() || "GBP",
      openingBalance: form.openingBalance ? parseFloat(form.openingBalance) : undefined,
      notes: form.notes.trim(),
      tags: form.tags ? form.tags.split(";").map(t => t.trim()).filter(Boolean) : [],
    });
    toast({ title: "Supplier added", description: `${form.company.trim()} has been added.` });
    nav("/suppliers");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav("/suppliers")} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> Back to Suppliers
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-6 py-5 bg-gradient-to-r from-orange-500 to-amber-500">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-white leading-snug">Add New Supplier</h1>
            <p className="text-[12px] text-orange-100 truncate mt-0.5">
              {form.company.trim() ? form.company : "Company required · all other fields optional"}
            </p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          <Field label="Company Name *">
            <Input autoFocus placeholder="e.g. TechVision Ltd" value={form.company}
              onChange={e => set("company", e.target.value)} className="h-10 text-[15px] font-medium" />
          </Field>

          <Divider label="Contact & Location" />

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Field label="Contact Person">
              <Input placeholder="e.g. Ali Khan" value={form.contactPerson}
                onChange={e => set("contactPerson", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="ali@company.com" value={form.email}
                onChange={e => set("email", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Phone">
              <Input type="tel" placeholder="+92 300 1234567" value={form.phone}
                onChange={e => set("phone", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Category">
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPLIER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="City">
              <Combobox value={form.city} onChange={v => set("city", v)}
                options={cityComboOpts} placeholder="City…"
                inputClassName="h-9 text-sm w-full border rounded-md px-3" />
            </Field>
            <Field label="Area / Region">
              <Combobox value={form.area} onChange={v => set("area", v)}
                options={areaComboOpts} placeholder="Area…"
                inputClassName="h-9 text-sm w-full border rounded-md px-3" />
            </Field>
          </div>

          <Divider label="Status & Location" />

          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 space-y-1.5">
              <label className="text-[12px] font-semibold text-foreground">Status</label>
              <div className="flex gap-3">
                {SUPPLIER_STATUSES.map(s => (
                  <button key={s} type="button" onClick={() => set("status", s)}
                    className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all border ${
                      form.status === s
                        ? s === "Active"      ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                        : s === "Inactive"    ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                        :                       "bg-red-600 border-red-600 text-white shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:border-gray-400 hover:text-foreground"
                    }`}>{s}</button>
                ))}
              </div>
            </div>
            <Field label="Country">
              <Input placeholder="e.g. Pakistan" value={form.country}
                onChange={e => set("country", e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>

          <Divider label="Financials & Rating" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Rating" hint="Click to set · click again to clear">
              <div className="h-9 flex items-center gap-2 px-2 border border-input rounded-md bg-background">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button"
                    onClick={() => set("rating", n === form.rating ? 0 : n)}
                    className="focus:outline-none hover:scale-125 transition-transform">
                    <StarIcon size={18}
                      className={n <= form.rating ? "fill-amber-400 text-amber-400" : "fill-transparent text-gray-300 dark:text-gray-600"} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Currency" hint="ISO code e.g. GBP, USD">
              <Input placeholder="GBP" value={form.currency}
                onChange={e => set("currency", e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Opening Balance" hint="Cr balance (payable)">
              <Input type="number" step="0.01" placeholder="0.00" value={form.openingBalance}
                onChange={e => set("openingBalance", e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Tags" hint="Semicolon-separated">
              <Input placeholder="IT;Hardware" value={form.tags}
                onChange={e => set("tags", e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>

          <Divider label="Notes" />

          <textarea rows={3} placeholder="Optional supplier notes, payment terms, delivery preferences…"
            value={form.notes} onChange={e => set("notes", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={() => nav("/suppliers")} className="h-10 px-6 text-[13px]">Cancel</Button>
          <Button onClick={handleSubmit}
            className="flex-1 h-10 font-semibold text-[13px] bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white border-0 shadow-sm gap-2">
            <Plus size={15} /> Add Supplier
          </Button>
        </div>
      </div>
    </div>
  );
}
