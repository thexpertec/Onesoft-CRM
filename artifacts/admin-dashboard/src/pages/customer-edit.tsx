import { useState, useMemo, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useCustomers, useCities, useAreas } from "@/hooks/use-data";
import { CustomerStatus, Address, isAddressEmpty, formatAddress, getCustomer, customerLedgerHasEntries, getProducts } from "@/lib/store";
import AddressFields, { EMPTY_ADDRESS } from "@/components/address-fields";
import { CURRENCIES } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { Save, ArrowLeft, UserCog, Lock, Search, X, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, ComboOption } from "@/components/combobox";
import { Copy } from "lucide-react";

const CUSTOMER_STATUSES: CustomerStatus[] = ["Active", "Inactive", "Churned"];

const Divider = ({ label, orange }: { label: string; orange?: boolean }) => (
  <div className="flex items-center gap-3 pt-1">
    <div className={`h-px flex-1 ${orange ? "bg-orange-200 dark:bg-orange-800/40" : "bg-border"}`} />
    <span className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${orange ? "text-orange-500 dark:text-orange-400" : "text-muted-foreground"}`}>{label}</span>
    <div className={`h-px flex-1 ${orange ? "bg-orange-200 dark:bg-orange-800/40" : "bg-border"}`} />
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[12px] font-semibold text-foreground">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
  </div>
);

export default function CustomerEditPage() {
  const [, nav] = useLocation();
  const params = useParams<{ id: string }>();
  const { customers, editCustomer } = useCustomers();
  const { cities } = useCities();
  const { areas }  = useAreas();
  const { toast } = useToast();

  const cityComboOpts = useMemo<ComboOption[]>(() => cities.map(c => ({ value: c.name, label: c.name })), [cities]);
  const areaComboOpts = useMemo<ComboOption[]>(() => areas.map(a => ({ value: a.name, label: a.name })), [areas]);

  const customer    = useMemo(() => getCustomer(params.id), [params.id, customers]);
  const roleIsLocked = useMemo(() => customerLedgerHasEntries(customer?.ledgerAccountId), [customer]);

  const allProducts = useMemo(() => getProducts().filter(p => p.status !== "Inactive").sort((a, b) => a.name.localeCompare(b.name)), []);

  const [form, setForm] = useState({
    name: "", company: "", email: "", phone: "", industry: "",
    city: "", area: "", status: "Active" as CustomerStatus,
    customerRole: "Buyer" as "Buyer" | "Supplier",
    customerSince: new Date().toISOString().split("T")[0],
    totalValue: "", currency: "GBP", openingBalance: "", notes: "", tags: "",
  });
  const set = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  const [billing,  setBilling]  = useState<Address>({ ...EMPTY_ADDRESS });
  const [shipping, setShipping] = useState<Address>({ ...EMPTY_ADDRESS });
  const [sameAddr, setSameAddr] = useState(true);
  const [loaded,   setLoaded]   = useState(false);

  const [supplierProducts, setSupplierProducts] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    return allProducts.filter(p =>
      !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q)
    );
  }, [allProducts, productSearch]);

  const toggleProduct = (id: string) =>
    setSupplierProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Pre-fill form when customer data is available
  useEffect(() => {
    if (!customer || loaded) return;
    setForm({
      name:          customer.name        ?? "",
      company:       customer.company     ?? "",
      email:         customer.email       ?? "",
      phone:         customer.phone       ?? "",
      industry:      customer.industry    ?? "",
      city:          customer.city        ?? "",
      area:          customer.area        ?? "",
      status:       (customer.status      ?? "Active") as CustomerStatus,
      customerRole: (customer.customerRole ?? "Buyer") as "Buyer" | "Supplier",
      customerSince: customer.customerSince ?? new Date().toISOString().split("T")[0],
      totalValue:    customer.totalValue  ?? "",
      currency:      customer.currency    ?? "GBP",
      openingBalance: customer.openingBalance != null ? String(customer.openingBalance) : "",
      notes:         customer.notes       ?? "",
      tags:         (customer.tags ?? []).join(";"),
    });

    setSupplierProducts(customer.supplierProducts ?? []);

    const bill = customer.billingAddressDetails  ?? { ...EMPTY_ADDRESS };
    const ship = customer.shippingAddressDetails ?? { ...EMPTY_ADDRESS };
    setBilling(bill);
    setShipping(ship);

    // Mark "same" if shipping wasn't explicitly set or is identical to billing
    const billingStr  = formatAddress(bill);
    const shippingStr = formatAddress(ship);
    setSameAddr(!billingStr || billingStr === shippingStr);
    setLoaded(true);
  }, [customer, loaded]);

  if (!customer) {
    return (
      <div className="max-w-4xl mx-auto pt-20 text-center text-muted-foreground">
        <p className="text-lg font-medium">Customer not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => nav("/customers")}>
          <ArrowLeft size={15} className="mr-1.5" /> Back to Customers
        </Button>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }

    const billingDetails  = isAddressEmpty(billing)  ? undefined : billing;
    const shippingDetails = sameAddr
      ? billingDetails
      : (isAddressEmpty(shipping) ? billingDetails : shipping);

    try {
      editCustomer(customer.id, {
        name:            form.name.trim(),
        company:         form.company.trim(),
        email:           form.email.trim(),
        phone:           form.phone.trim(),
        industry:        form.industry.trim(),
        city:            form.city.trim(),
        area:            form.area.trim() || undefined,
        status:          form.status,
        customerSince:   form.customerSince || new Date().toISOString().split("T")[0],
        totalValue:      form.totalValue.trim(),
        currency:        form.currency.trim() || "GBP",
        openingBalance:  form.openingBalance ? parseFloat(form.openingBalance) : undefined,
        notes:           form.notes.trim(),
        customerRole:    form.customerRole,
        supplierProducts: form.customerRole === "Supplier" && supplierProducts.length > 0 ? supplierProducts : undefined,
        tags:            form.tags ? form.tags.split(";").map(t => t.trim()).filter(Boolean) : [],
        billingAddressDetails:  billingDetails,
        shippingAddressDetails: shippingDetails,
        billingAddress:  formatAddress(billingDetails)  || undefined,
        shippingAddress: formatAddress(shippingDetails) || undefined,
      });
    } catch (err) {
      toast({
        title: "Could not update customer",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
        duration: 8000,
      });
      return;
    }
    toast({ title: "Customer updated", description: `${form.name.trim()} has been saved.` });
    nav("/customers");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav("/customers")} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> Back to Customers
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className={`flex items-center gap-4 px-6 py-5 bg-gradient-to-r ${form.customerRole === "Supplier" ? "from-orange-500 to-amber-500" : "from-blue-600 to-indigo-600"}`}>
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <UserCog size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-white leading-snug">
              Edit {form.customerRole === "Supplier" ? "Supplier" : "Customer"}
            </h1>
            <p className={`text-[12px] truncate mt-0.5 ${form.customerRole === "Supplier" ? "text-orange-100" : "text-blue-100"}`}>{form.name || customer.name}</p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          <Field label="Customer Name *">
            <Input autoFocus placeholder="e.g. Jane Smith" value={form.name}
              onChange={e => set("name", e.target.value)} className="h-10 text-[15px] font-medium" />
          </Field>

          <Divider label="Contact & Identity" />

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Field label="Company">
              <Input placeholder="e.g. Acme Ltd" value={form.company}
                onChange={e => set("company", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="jane@acme.com" value={form.email}
                onChange={e => set("email", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Phone">
              <Input type="tel" placeholder="+44 7700 900000" value={form.phone}
                onChange={e => set("phone", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Industry">
              <Input placeholder="e.g. Technology" value={form.industry}
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

          <Divider label="Customer Type & Status" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] font-semibold text-foreground">Customer Type</p>
                {roleIsLocked && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    <Lock size={10} /> Locked — account entries exist
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                {(["Buyer", "Supplier"] as const).map(r => (
                  <button key={r} type="button"
                    disabled={roleIsLocked}
                    onClick={() => !roleIsLocked && setForm(p => ({ ...p, customerRole: r }))}
                    title={roleIsLocked ? "Cannot change type: journal entries exist for this customer's account" : undefined}
                    className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all border ${
                      roleIsLocked
                        ? form.customerRole === r
                          ? r === "Buyer"
                            ? "bg-emerald-600/50 border-emerald-600/50 text-white cursor-not-allowed"
                            : "bg-orange-500/50 border-orange-500/50 text-white cursor-not-allowed"
                          : "bg-muted border-border text-muted-foreground/50 cursor-not-allowed"
                        : form.customerRole === r
                          ? r === "Buyer"
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                            : "bg-orange-500 border-orange-500 text-white shadow-sm"
                          : "bg-background border-border text-muted-foreground hover:border-gray-400 hover:text-foreground"
                    }`}>{r}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
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
          </div>

          <Divider label="Financials" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Customer Since">
              <Input type="date" value={form.customerSince}
                onChange={e => set("customerSince", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Total Value" hint="Lifetime spend">
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
            <Field label="Opening Balance" hint="Dr balance (receivable)">
              <Input type="number" step="0.01" placeholder="0.00" value={form.openingBalance}
                onChange={e => set("openingBalance", e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>

          {/* ── Supplied Products (Supplier only) ───────────────────────── */}
          {form.customerRole === "Supplier" && (
            <>
              <Divider label="Supplied Products" orange />

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] text-muted-foreground leading-snug max-w-lg">
                    Select products this supplier provides. In a purchase invoice, only these products will appear in the item dropdown when this supplier is selected.
                    {allProducts.length === 0 && (
                      <span className="block text-amber-600 dark:text-amber-400 mt-1">No products found — add products first from the Inventory page.</span>
                    )}
                  </p>
                  {supplierProducts.length > 0 && (
                    <button type="button" onClick={() => setSupplierProducts([])}
                      className="shrink-0 text-[11px] text-rose-500 hover:text-rose-600 font-medium underline-offset-2 hover:underline">
                      Clear all
                    </button>
                  )}
                </div>

                {supplierProducts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {supplierProducts.map(pid => {
                      const p = allProducts.find(x => x.id === pid);
                      if (!p) return null;
                      return (
                        <span key={pid} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                          {p.name}
                          <button type="button" onClick={() => toggleProduct(pid)} className="ml-0.5 hover:text-rose-600">
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {allProducts.length > 0 && (
                  <div className="rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50/30 dark:bg-orange-950/10 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-orange-200 dark:border-orange-800/40">
                      <Search size={13} className="text-orange-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="Search products…"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground"
                      />
                      {productSearch && (
                        <button type="button" onClick={() => setProductSearch("")} className="text-muted-foreground hover:text-foreground">
                          <X size={12} />
                        </button>
                      )}
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {supplierProducts.length > 0 ? `${supplierProducts.length} selected` : ""}
                      </span>
                    </div>

                    {filteredProducts.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
                        <PackageSearch size={16} /> No products match "{productSearch}"
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto divide-y divide-orange-100 dark:divide-orange-900/30">
                        {filteredProducts.map(p => {
                          const checked = supplierProducts.includes(p.id);
                          return (
                            <label key={p.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${checked ? "bg-orange-100/60 dark:bg-orange-900/20" : "hover:bg-orange-50 dark:hover:bg-orange-950/10"}`}>
                              <Checkbox checked={checked} onCheckedChange={() => toggleProduct(p.id)}
                                className="border-orange-300 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-foreground truncate">{p.name}</p>
                                {(p.sku || p.brand || p.category) && (
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {[p.sku, p.brand, p.category].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center justify-between px-3 py-2 border-t border-orange-200 dark:border-orange-800/40">
                      <button type="button"
                        onClick={() => setSupplierProducts(allProducts.map(p => p.id))}
                        className="text-[11px] text-orange-600 dark:text-orange-400 hover:underline font-medium">
                        Select all ({allProducts.length})
                      </button>
                      <span className="text-[11px] text-muted-foreground">
                        {filteredProducts.length} of {allProducts.length} shown
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Billing Address ──────────────────────────────────────── */}
          <Divider label="Billing Address" />

          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <AddressFields value={billing} onChange={setBilling} idPrefix="edit-cust-billing" />
          </div>

          {/* ── Shipping Address ─────────────────────────────────────── */}
          <Divider label="Shipping Address" />

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
              <Checkbox
                checked={sameAddr}
                onCheckedChange={v => setSameAddr(!!v)}
                id="edit-cust-same-addr"
              />
              <span className="text-[13px] text-muted-foreground flex items-center gap-1.5">
                <Copy size={12} />
                Shipping address same as billing
              </span>
            </label>

            {!sameAddr && (
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <AddressFields value={shipping} onChange={setShipping} idPrefix="edit-cust-shipping" />
              </div>
            )}
          </div>

          <Divider label="Tags & Notes" />

          <div className="grid grid-cols-6 gap-4">
            <Field label="Tags" hint="Semicolon-separated">
              <Input placeholder="VIP;Retail" value={form.tags}
                onChange={e => set("tags", e.target.value)} className="h-9 text-sm" />
            </Field>
            <div className="col-span-5 space-y-1">
              <label className="text-[12px] font-semibold text-foreground">Notes</label>
              <textarea rows={3} placeholder="Optional customer notes…"
                value={form.notes} onChange={e => set("notes", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={() => nav("/customers")} className="h-10 px-6 text-[13px]">Cancel</Button>
          <Button onClick={handleSubmit}
            className={`flex-1 h-10 font-semibold text-[13px] text-white border-0 shadow-sm gap-2 bg-gradient-to-r ${
              form.customerRole === "Supplier"
                ? "from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                : "from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            }`}>
            <Save size={15} /> Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
