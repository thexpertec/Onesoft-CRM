import { useState, useMemo, useEffect } from "react";
import { useCustomers, useLeads } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Customer, CustomerStatus, Lead, convertLeadToCustomer, getCustomers } from "@/lib/store";
import { CURRENCIES, formatAmount } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  UserCheck, Plus, Search, MoreHorizontal, Edit, Trash2, Eye, ArrowRight,
  Building2, MapPin, Phone, Mail, Tag, TrendingUp, Users, Star, RefreshCw,
  BadgeCheck, Handshake, ChevronRight, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

// ─── Types & constants ─────────────────────────────────────────────────────────
const CUSTOMER_STATUSES: CustomerStatus[] = ["Active", "Inactive", "Churned"];

const STATUS_STYLES: Record<CustomerStatus, string> = {
  Active:   "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  Inactive: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  Churned:  "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
};

const TABS = ["All Customers", "Convert from Leads"] as const;
type Tab = (typeof TABS)[number];

// ─── Zod schema ───────────────────────────────────────────────────────────────
const customerSchema = z.object({
  name:          z.string().min(2, "Name is required"),
  company:       z.string().min(1, "Company is required"),
  email:         z.union([z.string().email("Invalid email"), z.literal("")]),
  phone:         z.string().optional(),
  industry:      z.string().optional(),
  city:          z.string().optional(),
  status:        z.enum(["Active", "Inactive", "Churned"]),
  customerSince: z.string().optional(),
  totalValue:    z.string().optional(),
  currency:      z.string(),
  notes:         z.string().optional(),
  tags:          z.string().optional(),
});
type CustomerFormValues = z.infer<typeof customerSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function StatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-pink-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
];
function avatarColor(name: string) {
  const sum = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// ─── Customer Form (shared for add + edit) ────────────────────────────────────
function CustomerForm({
  form,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<CustomerFormValues>>;
  onSubmit: (data: CustomerFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem><FormLabel>Full Name *</FormLabel><FormControl><Input placeholder="Jane Smith" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="company" render={({ field }) => (
            <FormItem><FormLabel>Company *</FormLabel><FormControl><Input placeholder="Acme Ltd" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="jane@acme.com" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="+44 7700 000000" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="industry" render={({ field }) => (
            <FormItem><FormLabel>Industry</FormLabel><FormControl><Input placeholder="Technology" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="city" render={({ field }) => (
            <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="London" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {CUSTOMER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="customerSince" render={({ field }) => (
            <FormItem><FormLabel>Customer Since</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="totalValue" render={({ field }) => (
            <FormItem><FormLabel>Total Value</FormLabel><FormControl><Input placeholder="50000" data-testid="input-total-value" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="currency" render={({ field }) => (
            <FormItem>
              <FormLabel>Currency</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger data-testid="select-currency"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code} {c.symbol}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="tags" render={({ field }) => (
          <FormItem><FormLabel>Tags <span className="text-muted-foreground text-xs">(comma-separated)</span></FormLabel><FormControl><Input placeholder="enterprise, UK, priority" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={3} className="resize-none" placeholder="Any notes about this customer..." {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit">{submitLabel}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { customers, addCustomer, editCustomer, removeCustomer, refresh } = useCustomers();
  const { leads } = useLeads();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("All Customers");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const [addOpen,      setAddOpen]      = useState(false);
  const [editOpen,     setEditOpen]     = useState(false);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [editTarget,   setEditTarget]   = useState<Customer | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalCustomers  = customers.length;
  const activeCount     = customers.filter(c => c.status === "Active").length;
  const totalRevenue    = customers.reduce((acc, c) => {
    const n = parseFloat(c.totalValue?.replace(/[^0-9.]/g, "") || "0");
    return acc + (isNaN(n) ? 0 : n);
  }, 0);

  // ── Won leads not yet converted ──────────────────────────────────────────────
  const convertedLeadIds = useMemo(() => new Set(customers.map(c => c.leadId).filter(Boolean)), [customers]);
  const eligibleLeads = useMemo(
    () => leads.filter(l => l.status === "Won" && !convertedLeadIds.has(l.id)),
    [leads, convertedLeadIds]
  );

  // ── Filtered customers ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return customers
      .filter(c => {
        const q = search.toLowerCase();
        const matchQ = !q || [c.name, c.company, c.industry, c.city].some(v => v?.toLowerCase().includes(q));
        const matchS = statusFilter === "All" || c.status === statusFilter;
        return matchQ && matchS;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [customers, search, statusFilter]);

  // ── Add form ────────────────────────────────────────────────────────────────
  const addForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "", company: "", email: "", phone: "", industry: "", city: "",
      status: "Active", customerSince: new Date().toISOString().split("T")[0],
      totalValue: "", currency: "GBP", notes: "", tags: "",
    },
  });

  const handleAdd = (data: CustomerFormValues) => {
    addCustomer({
      ...data,
      email: data.email ?? "",
      phone: data.phone ?? "",
      industry: data.industry ?? "",
      city: data.city ?? "",
      customerSince: data.customerSince ?? "",
      totalValue: data.totalValue ?? "",
      notes: data.notes ?? "",
      tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      source: "direct",
    });
    toast({ title: "Customer added", description: `${data.name} has been added as a customer.` });
    addForm.reset();
    setAddOpen(false);
  };

  // ── Edit form ────────────────────────────────────────────────────────────────
  const editForm = useForm<CustomerFormValues>({ resolver: zodResolver(customerSchema) });

  useEffect(() => {
    if (editTarget) {
      editForm.reset({
        name: editTarget.name,
        company: editTarget.company,
        email: editTarget.email,
        phone: editTarget.phone,
        industry: editTarget.industry,
        city: editTarget.city,
        status: editTarget.status,
        customerSince: editTarget.customerSince,
        totalValue: editTarget.totalValue,
        currency: editTarget.currency,
        notes: editTarget.notes,
        tags: editTarget.tags?.join(", ") ?? "",
      });
    }
  }, [editTarget]);

  const handleEdit = (data: CustomerFormValues) => {
    if (!editTarget) return;
    editCustomer(editTarget.id, {
      ...data,
      email: data.email ?? "",
      phone: data.phone ?? "",
      industry: data.industry ?? "",
      city: data.city ?? "",
      customerSince: data.customerSince ?? "",
      totalValue: data.totalValue ?? "",
      notes: data.notes ?? "",
      tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
    toast({ title: "Customer updated", description: `${data.name}'s details have been saved.` });
    if (viewCustomer?.id === editTarget.id) {
      setViewCustomer({ ...viewCustomer, ...data, tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [] });
    }
    setEditOpen(false);
    setEditTarget(null);
  };

  // ── Convert lead ─────────────────────────────────────────────────────────────
  const handleConvert = (lead: Lead) => {
    convertLeadToCustomer(lead);
    refresh();
    toast({
      title: "Lead converted",
      description: `${lead.name} has been added to your customer base.`,
    });
    setActiveTab("All Customers");
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!deleteId) return;
    removeCustomer(deleteId);
    if (viewCustomer?.id === deleteId) setViewCustomer(null);
    toast({ title: "Customer removed", description: "The customer record has been deleted." });
    setDeleteId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-primary" /> Customers
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage your customer accounts and track their value.
          </p>
        </div>
        {isAuthenticated && (
          <div className="flex gap-2">
            {eligibleLeads.length > 0 && (
              <Button variant="outline" onClick={() => setActiveTab("Convert from Leads")} className="gap-1.5 text-sm">
                <RefreshCw size={14} />
                {eligibleLeads.length} lead{eligibleLeads.length !== 1 ? "s" : ""} to convert
              </Button>
            )}
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus size={15} /> Add Customer
            </Button>
          </div>
        )}
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Customers", value: totalCustomers, icon: Users, color: "border-l-blue-500", sub: `${eligibleLeads.length} leads ready to convert` },
          { label: "Active",          value: activeCount,     icon: BadgeCheck, color: "border-l-emerald-500", sub: `${customers.filter(c => c.status === "Inactive").length} inactive` },
          { label: "Churned",         value: customers.filter(c => c.status === "Churned").length, icon: TrendingUp, color: "border-l-red-400", sub: "Lost customers" },
          {
            label: "Total Revenue",
            value: totalRevenue > 0
              ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(totalRevenue)
              : "—",
            icon: Star,
            color: "border-l-amber-500",
            sub: "Sum of customer values",
          },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <Card key={label} className={`border-l-4 ${color}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold mt-1">{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div className="rounded-lg p-2 bg-muted/50">
                  <Icon size={16} className="text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab
                ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
            {tab === "Convert from Leads" && eligibleLeads.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                {eligibleLeads.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: All Customers ─────────────────────────────────────────────── */}
      {activeTab === "All Customers" && (
        <div className="space-y-4">
          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                {CUSTOMER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left font-semibold text-muted-foreground px-4 py-3">Customer</th>
                  <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden md:table-cell">Industry</th>
                  <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden sm:table-cell">Status</th>
                  <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden lg:table-cell">Since</th>
                  <th className="text-right font-semibold text-muted-foreground px-4 py-3 hidden sm:table-cell">Value</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <UserCheck className="w-10 h-10 opacity-20" />
                        <p className="text-sm">
                          {search || statusFilter !== "All"
                            ? "No customers match your filters."
                            : isAuthenticated
                              ? "No customers yet. Add one or convert a won lead."
                              : "No customers yet."}
                        </p>
                        {isAuthenticated && !search && statusFilter === "All" && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1"><Plus size={13} /> Add Customer</Button>
                            {eligibleLeads.length > 0 && (
                              <Button size="sm" variant="outline" onClick={() => setActiveTab("Convert from Leads")} className="gap-1">
                                <RefreshCw size={13} /> Convert Leads
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : filtered.map((c, i) => {
                  const formattedValue = c.totalValue
                    ? formatAmount(parseFloat(c.totalValue.replace(/[^0-9.]/g, "") || "0"), c.currency || "GBP")
                    : "—";
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                      onClick={() => setViewCustomer(c)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${avatarColor(c.name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            {initials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium flex items-center gap-1.5">
                              {c.name}
                              {c.source === "from_lead" && (
                                <span title="Converted from lead" className="text-emerald-500"><Handshake size={11} /></span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <Building2 size={10} className="flex-shrink-0" />
                              {c.company}
                              {c.city && <><MapPin size={10} className="flex-shrink-0 ml-1" />{c.city}</>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm hidden md:table-cell">{c.industry || "—"}</td>
                      <td className="px-4 py-3 hidden sm:table-cell"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {c.customerSince ? format(new Date(c.customerSince), "d MMM yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-sm tabular-nums hidden sm:table-cell">
                        {formattedValue === "—" ? <span className="text-muted-foreground">—</span> : formattedValue}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {isAuthenticated && (
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => { setEditTarget(c); setEditOpen(true); }}>
                              <Edit size={13} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Delete" onClick={() => setDeleteId(c.id)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">{filtered.length} of {customers.length} customer{customers.length !== 1 ? "s" : ""}</p>
          )}
        </div>
      )}

      {/* ── Tab: Convert from Leads ────────────────────────────────────────── */}
      {activeTab === "Convert from Leads" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These are leads marked as <strong>Won</strong> that haven't been converted to customers yet. Click <strong>Convert</strong> to add them to your customer base.
          </p>

          {eligibleLeads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Handshake className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">All won leads have been converted.</p>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("All Customers")}>View All Customers</Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left font-semibold text-muted-foreground px-4 py-3">Lead</th>
                    <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden sm:table-cell">Industry</th>
                    <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden md:table-cell">Source</th>
                    <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden lg:table-cell">Won On</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {eligibleLeads.map((lead, i) => (
                    <tr key={lead.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${avatarColor(lead.name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            {initials(lead.name)}
                          </div>
                          <div>
                            <div className="font-medium">{lead.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Building2 size={10} />{lead.company}
                              {lead.city && <><MapPin size={10} className="ml-1" />{lead.city}</>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{lead.industry || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{lead.source || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {format(new Date(lead.updatedAt), "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isAuthenticated ? (
                          <Button size="sm" variant="outline" onClick={() => handleConvert(lead)} className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950">
                            <UserCheck size={13} /> Convert
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Login to convert</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Customer Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet open={!!viewCustomer} onOpenChange={open => { if (!open) setViewCustomer(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">Customer Details</SheetTitle>
          </SheetHeader>
          {viewCustomer && (
            <div className="space-y-6">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full ${avatarColor(viewCustomer.name)} flex items-center justify-center text-white text-xl font-bold`}>
                  {initials(viewCustomer.name)}
                </div>
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    {viewCustomer.name}
                    {viewCustomer.source === "from_lead" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                        <Handshake size={9} /> From Lead
                      </span>
                    )}
                  </h3>
                  <p className="text-muted-foreground text-sm">{viewCustomer.company}</p>
                  <div className="mt-1"><StatusBadge status={viewCustomer.status} /></div>
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {viewCustomer.email && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Email</p>
                    <a href={`mailto:${viewCustomer.email}`} className="text-primary hover:underline break-all">{viewCustomer.email}</a>
                  </div>
                )}
                {viewCustomer.phone && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Phone</p>
                    <a href={`tel:${viewCustomer.phone}`} className="text-primary hover:underline">{viewCustomer.phone}</a>
                  </div>
                )}
                {viewCustomer.city && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">City</p>
                    <p>{viewCustomer.city}</p>
                  </div>
                )}
                {viewCustomer.industry && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Industry</p>
                    <p>{viewCustomer.industry}</p>
                  </div>
                )}
                {viewCustomer.customerSince && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Customer Since</p>
                    <p>{format(new Date(viewCustomer.customerSince), "d MMMM yyyy")}</p>
                  </div>
                )}
                {viewCustomer.totalValue && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Total Value</p>
                    <p className="text-lg font-bold text-primary">
                      {formatAmount(parseFloat(viewCustomer.totalValue.replace(/[^0-9.]/g, "") || "0"), viewCustomer.currency || "GBP")}
                    </p>
                  </div>
                )}
              </div>

              {/* Tags */}
              {viewCustomer.tags?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium flex items-center gap-1"><Tag size={10} /> Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {viewCustomer.tags.map(t => (
                      <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {viewCustomer.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">Notes</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{viewCustomer.notes}</p>
                </div>
              )}

              {/* Actions */}
              {isAuthenticated && (
                <div className="pt-4 border-t flex gap-2">
                  <Button className="flex-1" onClick={() => { setEditTarget(viewCustomer); setEditOpen(true); }}>
                    <Edit size={14} className="mr-2" /> Edit
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => setDeleteId(viewCustomer.id)}>
                    <Trash2 size={14} className="mr-2" /> Delete
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Add Dialog ─────────────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) addForm.reset(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus size={18} /> Add New Customer</DialogTitle>
            <DialogDescription>Create a new customer record directly.</DialogDescription>
          </DialogHeader>
          <CustomerForm form={addForm} onSubmit={handleAdd} onCancel={() => setAddOpen(false)} submitLabel="Add Customer" />
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit size={18} /> Edit Customer</DialogTitle>
            <DialogDescription>Update this customer's information.</DialogDescription>
          </DialogHeader>
          <CustomerForm form={editForm} onSubmit={handleEdit} onCancel={() => { setEditOpen(false); setEditTarget(null); }} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The customer record will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
