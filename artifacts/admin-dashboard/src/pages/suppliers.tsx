import { useState, useMemo, useEffect } from "react";
import { useSuppliers } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Supplier, SupplierStatus } from "@/lib/store";
import { CURRENCIES } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  Truck, Plus, Search, Edit, Trash2, Star, Building2, MapPin,
  Phone, Mail, Tag, Filter, Globe, Users, BadgeCheck, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// ─── Constants ─────────────────────────────────────────────────────────────────
const SUPPLIER_STATUSES: SupplierStatus[] = ["Active", "Inactive", "Blacklisted"];

const SUPPLIER_CATEGORIES = [
  "Software & Technology",
  "Hardware & Equipment",
  "Consulting & Advisory",
  "Marketing & Design",
  "Legal & Compliance",
  "Finance & Accounting",
  "HR & Recruitment",
  "Logistics & Delivery",
  "Office Supplies",
  "Other",
];

const STATUS_STYLES: Record<SupplierStatus, string> = {
  Active:      "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  Inactive:    "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  Blacklisted: "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400",
};

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-pink-500",  "bg-cyan-500",  "bg-orange-500",  "bg-teal-500",
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "??";
}
function avatarColor(name: string) {
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function StatusBadge({ status }: { status: SupplierStatus }) {
  const icon = status === "Blacklisted" ? <ShieldAlert size={10} /> : status === "Active" ? <BadgeCheck size={10} /> : null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
      {icon}{status}
    </span>
  );
}

function StarRating({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(n === value ? 0 : n)}
          onMouseEnter={() => !readonly && setHovered(n)}
          onMouseLeave={() => !readonly && setHovered(0)}
          className={`transition-colors ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110"}`}
        >
          <Star
            size={readonly ? 14 : 18}
            className={`transition-colors ${
              n <= (hovered || value)
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
      {!readonly && value > 0 && <span className="text-xs text-muted-foreground ml-1 self-center">{value}/5</span>}
    </div>
  );
}

// ─── Zod schema ────────────────────────────────────────────────────────────────
const supplierSchema = z.object({
  company:       z.string().min(2, "Company name is required"),
  contactPerson: z.string().optional(),
  email:         z.union([z.string().email("Invalid email"), z.literal("")]),
  phone:         z.string().optional(),
  category:      z.string().min(1, "Category is required"),
  city:          z.string().optional(),
  country:       z.string().optional(),
  status:        z.enum(["Active", "Inactive", "Blacklisted"]),
  rating:        z.number().min(0).max(5),
  currency:      z.string(),
  notes:         z.string().optional(),
  tags:          z.string().optional(),
});
type SupplierFormValues = z.infer<typeof supplierSchema>;

// ─── Supplier Form ─────────────────────────────────────────────────────────────
function SupplierForm({
  form,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<SupplierFormValues>>;
  onSubmit: (d: SupplierFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="company" render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name *</FormLabel>
              <FormControl><Input placeholder="Acme Supplies Ltd" data-testid="input-supplier-company" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="contactPerson" render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Person</FormLabel>
              <FormControl><Input placeholder="John Smith" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl><Input type="email" placeholder="contact@supplier.com" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl><Input placeholder="+44 7700 000000" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem>
              <FormLabel>Category *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger data-testid="select-supplier-category"><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                <SelectContent>
                  {SUPPLIER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {SUPPLIER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="city" render={({ field }) => (
            <FormItem>
              <FormLabel>City</FormLabel>
              <FormControl><Input placeholder="London" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="country" render={({ field }) => (
            <FormItem>
              <FormLabel>Country</FormLabel>
              <FormControl><Input placeholder="United Kingdom" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="currency" render={({ field }) => (
            <FormItem>
              <FormLabel>Currency</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code} {c.symbol}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="rating" render={({ field }) => (
            <FormItem>
              <FormLabel>Rating</FormLabel>
              <FormControl>
                <div className="pt-1">
                  <StarRating value={field.value} onChange={field.onChange} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="tags" render={({ field }) => (
          <FormItem>
            <FormLabel>Tags <span className="text-muted-foreground text-xs">(comma-separated)</span></FormLabel>
            <FormControl><Input placeholder="preferred, UK, certified" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl><Textarea rows={3} className="resize-none" placeholder="Terms, lead times, payment details..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" data-testid="btn-submit-supplier">{submitLabel}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const { suppliers, addSupplier, editSupplier, removeSupplier } = useSuppliers();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [catFilter,    setCatFilter]    = useState<string>("All");

  const [addOpen,      setAddOpen]      = useState(false);
  const [editOpen,     setEditOpen]     = useState(false);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [editTarget,   setEditTarget]   = useState<Supplier | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalSuppliers  = suppliers.length;
  const activeCount     = suppliers.filter(s => s.status === "Active").length;
  const blacklisted     = suppliers.filter(s => s.status === "Blacklisted").length;
  const avgRating       = useMemo(() => {
    const rated = suppliers.filter(s => s.rating > 0);
    if (!rated.length) return 0;
    return rated.reduce((a, s) => a + s.rating, 0) / rated.length;
  }, [suppliers]);

  const uniqueCategories = useMemo(
    () => [...new Set(suppliers.map(s => s.category).filter(Boolean))].sort(),
    [suppliers]
  );

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return suppliers.filter(s => {
      const q = search.toLowerCase();
      const matchQ = !q || [s.company, s.contactPerson, s.category, s.city, s.country]
        .some(v => v?.toLowerCase().includes(q));
      const matchS = statusFilter === "All" || s.status === statusFilter;
      const matchC = catFilter === "All" || s.category === catFilter;
      return matchQ && matchS && matchC;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [suppliers, search, statusFilter, catFilter]);

  // ── Default form values ────────────────────────────────────────────────────
  const defaultValues: SupplierFormValues = {
    company: "", contactPerson: "", email: "", phone: "",
    category: "", city: "", country: "", status: "Active",
    rating: 0, currency: "GBP", notes: "", tags: "",
  };

  // ── Add form ─────────────────────────────────────────────────────────────────
  const addForm = useForm<SupplierFormValues>({ resolver: zodResolver(supplierSchema), defaultValues });

  const handleAdd = (data: SupplierFormValues) => {
    addSupplier({
      company:       data.company,
      contactPerson: data.contactPerson ?? "",
      email:         data.email ?? "",
      phone:         data.phone ?? "",
      category:      data.category,
      city:          data.city ?? "",
      country:       data.country ?? "",
      status:        data.status,
      rating:        data.rating,
      currency:      data.currency,
      notes:         data.notes ?? "",
      tags:          data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
    toast({ title: "Supplier added", description: `${data.company} has been added.` });
    addForm.reset(defaultValues);
    setAddOpen(false);
  };

  // ── Edit form ─────────────────────────────────────────────────────────────────
  const editForm = useForm<SupplierFormValues>({ resolver: zodResolver(supplierSchema), defaultValues });

  useEffect(() => {
    if (editTarget) {
      editForm.reset({
        company:       editTarget.company,
        contactPerson: editTarget.contactPerson,
        email:         editTarget.email,
        phone:         editTarget.phone,
        category:      editTarget.category,
        city:          editTarget.city,
        country:       editTarget.country,
        status:        editTarget.status,
        rating:        editTarget.rating,
        currency:      editTarget.currency,
        notes:         editTarget.notes,
        tags:          editTarget.tags?.join(", ") ?? "",
      });
    }
  }, [editTarget]);

  const handleEdit = (data: SupplierFormValues) => {
    if (!editTarget) return;
    editSupplier(editTarget.id, {
      company:       data.company,
      contactPerson: data.contactPerson ?? "",
      email:         data.email ?? "",
      phone:         data.phone ?? "",
      category:      data.category,
      city:          data.city ?? "",
      country:       data.country ?? "",
      status:        data.status,
      rating:        data.rating,
      currency:      data.currency,
      notes:         data.notes ?? "",
      tags:          data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
    toast({ title: "Supplier updated", description: `${data.company} has been saved.` });
    if (viewSupplier?.id === editTarget.id) setViewSupplier(prev => prev ? { ...prev, ...data, tags: data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [] } : null);
    setEditOpen(false);
    setEditTarget(null);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!deleteId) return;
    const s = suppliers.find(x => x.id === deleteId);
    removeSupplier(deleteId);
    if (viewSupplier?.id === deleteId) setViewSupplier(null);
    toast({ title: "Supplier removed", description: `${s?.company} has been deleted.` });
    setDeleteId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" /> Suppliers
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage your supplier relationships and track performance.
          </p>
        </div>
        {isAuthenticated && (
          <Button onClick={() => setAddOpen(true)} className="gap-1.5 self-start sm:self-auto" data-testid="btn-add-supplier">
            <Plus size={15} /> Add Supplier
          </Button>
        )}
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Suppliers", value: totalSuppliers,
            icon: Truck, color: "border-l-blue-500",
            sub: `${uniqueCategories.length} categor${uniqueCategories.length === 1 ? "y" : "ies"}`,
          },
          {
            label: "Active", value: activeCount,
            icon: BadgeCheck, color: "border-l-emerald-500",
            sub: `${suppliers.filter(s => s.status === "Inactive").length} inactive`,
          },
          {
            label: "Blacklisted", value: blacklisted,
            icon: ShieldAlert, color: "border-l-red-400",
            sub: "Blocked from use",
          },
          {
            label: "Avg. Rating",
            value: avgRating > 0 ? avgRating.toFixed(1) + " / 5" : "—",
            icon: Star, color: "border-l-amber-500",
            sub: `${suppliers.filter(s => s.rating > 0).length} rated`,
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

      {/* ── Filters ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-suppliers"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {SUPPLIER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <Filter size={13} className="mr-1 text-muted-foreground" />
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Categories</SelectItem>
            {SUPPLIER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left font-semibold text-muted-foreground px-4 py-3">Supplier</th>
              <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden md:table-cell">Category</th>
              <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden lg:table-cell">Location</th>
              <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden sm:table-cell">Status</th>
              <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden lg:table-cell">Rating</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Truck className="w-10 h-10 opacity-20" />
                    <p className="text-sm">
                      {search || statusFilter !== "All" || catFilter !== "All"
                        ? "No suppliers match your filters."
                        : isAuthenticated ? "No suppliers yet. Add your first one." : "No suppliers yet."}
                    </p>
                    {isAuthenticated && !search && statusFilter === "All" && catFilter === "All" && (
                      <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1"><Plus size={13} /> Add Supplier</Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : filtered.map((s, i) => (
              <tr
                key={s.id}
                className={`border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                onClick={() => setViewSupplier(s)}
                data-testid={`row-supplier-${s.id}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full ${avatarColor(s.company)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                      {initials(s.company)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{s.company}</p>
                      {s.contactPerson && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <Users size={10} className="flex-shrink-0" />{s.contactPerson}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-sm hidden md:table-cell">{s.category || "—"}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {(s.city || s.country) ? (
                    <span className="flex items-center gap-1 text-muted-foreground text-sm">
                      <MapPin size={11} className="flex-shrink-0" />
                      {[s.city, s.country].filter(Boolean).join(", ")}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {s.rating > 0 ? <StarRating value={s.rating} readonly /> : <span className="text-muted-foreground text-xs">Unrated</span>}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  {isAuthenticated && (
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => { setEditTarget(s); setEditOpen(true); }}>
                        <Edit size={13} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Delete" onClick={() => setDeleteId(s.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {filtered.length} of {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* ── Detail Sheet ───────────────────────────────────────────────────────── */}
      <Sheet open={!!viewSupplier} onOpenChange={o => { if (!o) setViewSupplier(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Supplier Details</SheetTitle>
          </SheetHeader>
          {viewSupplier && (
            <div className="space-y-6">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full ${avatarColor(viewSupplier.company)} flex items-center justify-center text-white text-xl font-bold flex-shrink-0`}>
                  {initials(viewSupplier.company)}
                </div>
                <div>
                  <h3 className="text-lg font-bold">{viewSupplier.company}</h3>
                  {viewSupplier.contactPerson && (
                    <p className="text-sm text-muted-foreground">{viewSupplier.contactPerson}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusBadge status={viewSupplier.status} />
                    {viewSupplier.rating > 0 && <StarRating value={viewSupplier.rating} readonly />}
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {viewSupplier.email && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium flex items-center gap-1"><Mail size={10} /> Email</p>
                    <a href={`mailto:${viewSupplier.email}`} className="text-primary hover:underline break-all">{viewSupplier.email}</a>
                  </div>
                )}
                {viewSupplier.phone && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium flex items-center gap-1"><Phone size={10} /> Phone</p>
                    <a href={`tel:${viewSupplier.phone}`} className="text-primary hover:underline">{viewSupplier.phone}</a>
                  </div>
                )}
                {viewSupplier.category && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Category</p>
                    <p>{viewSupplier.category}</p>
                  </div>
                )}
                {(viewSupplier.city || viewSupplier.country) && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium flex items-center gap-1"><Globe size={10} /> Location</p>
                    <p>{[viewSupplier.city, viewSupplier.country].filter(Boolean).join(", ")}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Currency</p>
                  <p>{viewSupplier.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Added</p>
                  <p>{format(new Date(viewSupplier.createdAt), "d MMM yyyy")}</p>
                </div>
              </div>

              {/* Tags */}
              {viewSupplier.tags?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium flex items-center gap-1"><Tag size={10} /> Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {viewSupplier.tags.map(t => (
                      <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {viewSupplier.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">Notes</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{viewSupplier.notes}</p>
                </div>
              )}

              {/* Actions */}
              {isAuthenticated && (
                <div className="pt-4 border-t flex gap-2">
                  <Button className="flex-1" onClick={() => { setEditTarget(viewSupplier); setEditOpen(true); }}>
                    <Edit size={14} className="mr-2" /> Edit
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => setDeleteId(viewSupplier.id)}>
                    <Trash2 size={14} className="mr-2" /> Delete
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Add Dialog ──────────────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) addForm.reset(defaultValues); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck size={18} /> Add New Supplier</DialogTitle>
            <DialogDescription>Record a new supplier for your business.</DialogDescription>
          </DialogHeader>
          <SupplierForm form={addForm} onSubmit={handleAdd} onCancel={() => setAddOpen(false)} submitLabel="Add Supplier" />
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ──────────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit size={18} /> Edit Supplier</DialogTitle>
            <DialogDescription>Update this supplier's information.</DialogDescription>
          </DialogHeader>
          <SupplierForm form={editForm} onSubmit={handleEdit} onCancel={() => { setEditOpen(false); setEditTarget(null); }} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ──────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The supplier record will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete-supplier"
            >
              Delete Supplier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
