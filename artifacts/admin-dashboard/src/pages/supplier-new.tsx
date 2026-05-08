import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useCustomers, useCities, useAreas } from "@/hooks/use-data";
import { CustomerStatus, Address, isAddressEmpty, formatAddress } from "@/lib/store";
import AddressFields, { EMPTY_ADDRESS } from "@/components/address-fields";
import { CURRENCIES } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowLeft, Truck, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, ComboOption } from "@/components/combobox";

const CUSTOMER_STATUSES: CustomerStatus[] = ["Active", "Inactive", "Churned"];

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
  const { customers, addCustomer } = useCustomers();
  const { cities } = useCities();
  const { areas }  = useAreas();
  const { toast } = useToast();

  const cityComboOpts = useMemo<ComboOption[]>(() => cities.map(c => ({ value: c.name, label: c.name })), [cities]);
  const areaComboOpts = useMemo<ComboOption[]>(() => areas.map(a => ({ value: a.name, label: a.name })), [areas]);

  const existingEmails = useMemo(() => new Set(customers.map(c => c.email?.toLowerCase()).filter(Boolean)), [customers]);
  const existingPhones = useMemo(() => new Set(customers.map(c => c.phone?.replace(/\D/g, "")).filter(p => p && p.length >= 7)), [customers]);

  const BLANK = () => ({
    name: "", company: "", email: "", phone: "", industry: "",
    city: "", area: "", status: "Active" as CustomerStatus,
    supplierSince: new Date().toISOString().split("T")[0],
    totalValue: "", currency: "GBP", openingBalance: "", notes: "", tags: "",
  });
  const [form, setForm] = useState(BLANK());
  const set = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  const [billing,  setBilling]  = useState<Address>({ ...EMPTY_ADDRESS });
  const [shipping, setShipping] = useState<Address>({ ...EMPTY_ADDRESS });
  const [sameAddr, setSameAddr] = useState(true);

  const handleSubmit = () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    const emailLower = form.email?.toLowerCase();
    const normPhone  = form.phone?.replace(/\D/g, "");
    if (emailLower && existingEmails.has(emailLower)) {
      toast({ title: "Duplicate email", description: `"${form.email}" already exists.`, variant: "destructive" }); return;
    }
    if (normPhone && normPhone.length >= 7 && existingPhones.has(normPhone)) {
      toast({ title: "Duplicate phone", description: `"${form.phone}" already exists.`, variant: "destructive" }); return;
    }

    const billingDetails  = isAddressEmpty(billing)  ? undefined : billing;
    const shippingDetails = sameAddr
      ? billingDetails
      : (isAddressEmpty(shipping) ? billingDetails : shipping);

    addCustomer({
      name: form.name.trim(), company: form.company.trim(),
      email: form.email.trim(), phone: form.phone.trim(),
      industry: form.industry.trim(), city: form.city.trim(),
      area: form.area.trim() || undefined, status: form.status,
      customerSince: form.supplierSince || new Date().toISOString().split("T")[0],
      totalValue: form.totalValue.trim(),
      currency: form.currency.trim() || "GBP",
      openingBalance: form.openingBalance ? parseFloat(form.openingBalance) : undefined,
      notes: form.notes.trim(), source: "direct",
      customerType: "Regular Customer",
      customerRole: "Supplier",
      tags: form.tags ? form.tags.split(";").map(t => t.trim()).filter(Boolean) : [],
      billingAddressDetails:  billingDetails,
      shippingAddressDetails: shippingDetails,
      billingAddress:  formatAddress(billingDetails)  || undefined,
      shippingAddress: formatAddress(shippingDetails) || undefined,
    });
    toast({ title: "Supplier added", description: `${form.name.trim()} has been added.` });
    nav("/customers?type=Suppliers");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav("/customers?type=Suppliers")} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> Back to Suppliers
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-6 py-5 bg-gradient-to-r from-orange-500 to-amber-500">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Truck size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-white leading-snug">Add New Supplier</h1>
            <p className="text-[12px] text-orange-100 truncate mt-0.5">
              {form.name.trim() ? form.name : "Name required · all other fields optional"}
            </p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          <Field label="Supplier Name *">
            <Input autoFocus placeholder="e.g. Acme Supplies Ltd" value={form.name}
              onChange={e => set("name", e.target.value)} className="h-10 text-[15px] font-medium" />
          </Field>

          <Divider label="Contact & Identity" />

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Field label="Company">
              <Input placeholder="e.g. Acme Ltd" value={form.company}
                onChange={e => set("company", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="supplier@acme.com" value={form.email}
                onChange={e => set("email", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Phone">
              <Input type="tel" placeholder="+44 7700 900000" value={form.phone}
                onChange={e => set("phone", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Industry">
              <Input placeholder="e.g. Manufacturing" value={form.industry}
                onChange={e => set("industry", e.target.value)} className="h-9 text-sm" />
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

          <Divider label="Status" />

          <div className="space-y-1.5 max-w-xs">
            <p className="text-[12px] font-semibold text-foreground">Status</p>
            <div className="flex gap-3">
              {CUSTOMER_STATUSES.map(s => (
                <button key={s} type="button" onClick={() => set("status", s)}
                  className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all border ${
                    form.status === s
                      ? s === "Active"   ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                      : s === "Inactive" ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                      :                   "bg-red-500 border-red-500 text-white shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:border-gray-400 hover:text-foreground"
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          <Divider label="Financials" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Supplier Since">
              <Input type="date" value={form.supplierSince}
                onChange={e => set("supplierSince", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Total Value" hint="Lifetime purchases">
              <Input type="number" min="0" placeholder="0.00" value={form.totalValue}
                onChange={e => set("totalValue", e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Currency">
              <Select value={form.currency} onValueChange={v => set("currency", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Opening Balance" hint="Cr balance (payable)">
              <Input type="number" step="0.01" placeholder="0.00" value={form.openingBalance}
                onChange={e => set("openingBalance", e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>

          <Divider label="Billing Address" />

          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <AddressFields
              value={billing}
              onChange={setBilling}
              idPrefix="new-sup-billing"
            />
          </div>

          <Divider label="Shipping / Delivery Address" />

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
              <Checkbox
                checked={sameAddr}
                onCheckedChange={v => setSameAddr(!!v)}
                id="new-sup-same-addr"
              />
              <span className="text-[13px] text-muted-foreground flex items-center gap-1.5">
                <Copy size={12} />
                Delivery address same as billing
              </span>
            </label>

            {!sameAddr && (
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <AddressFields
                  value={shipping}
                  onChange={setShipping}
                  idPrefix="new-sup-shipping"
                />
              </div>
            )}
          </div>

          <Divider label="Tags & Notes" />

          <div className="grid grid-cols-6 gap-4">
            <Field label="Tags" hint="Semicolon-separated">
              <Input placeholder="Preferred;Local" value={form.tags}
                onChange={e => set("tags", e.target.value)} className="h-9 text-sm" />
            </Field>
            <div className="col-span-5 space-y-1">
              <label className="text-[12px] font-semibold text-foreground">Notes</label>
              <textarea rows={3} placeholder="Optional supplier notes…"
                value={form.notes} onChange={e => set("notes", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={() => nav("/customers?type=Suppliers")} className="h-10 px-6 text-[13px]">Cancel</Button>
          <Button onClick={handleSubmit}
            className="flex-1 h-10 font-semibold text-[13px] bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white border-0 shadow-sm gap-2">
            <Plus size={15} /> Add Supplier
          </Button>
        </div>
      </div>
    </div>
  );
}
