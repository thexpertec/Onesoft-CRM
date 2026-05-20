import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import {
  Plus, Search, Printer, Trash2, Edit3, Check, X,
  Building2, ArrowLeft, FileText, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHalls, useBookings, useCustomers } from "@/hooks/use-data";
import {
  Booking, BookingMenuItem, BookingExtraService, BookingSlot, BookingStatus,
  computeBookingTotals, findBookingConflict, getSettings,
} from "@/lib/store";

// ─── small utils ──────────────────────────────────────────────────────────────
const fmt = (n: number, cur = "AED") =>
  `${cur} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const SLOTS: BookingSlot[] = ["Lunch", "Dinner", "Full Day"];
const EVENT_TYPES = ["Wedding", "Engagement", "Birthday", "Corporate", "Conference", "Anniversary", "Other"];
const MENU_CATEGORIES = ["Starter", "Soup", "Main Course", "Side", "Dessert", "Beverage"];
const STATUS_COLOR: Record<BookingStatus, string> = {
  Draft:     "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  Confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

// ═══════════════════════════════════════════════════════════════════════════
// LIST PAGE  /booking-invoice
// ═══════════════════════════════════════════════════════════════════════════
export default function BookingInvoiceListPage() {
  const [, navigate] = useLocation();
  const { bookings, remove } = useBookings();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "All">("All");
  const settings = getSettings();
  const cur = (settings as any)?.currency || "AED";

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return bookings
      .filter(b => statusFilter === "All" || b.status === statusFilter)
      .filter(b => !term ||
        b.bookingNumber.toLowerCase().includes(term) ||
        b.customerName.toLowerCase().includes(term) ||
        b.customerPhone.toLowerCase().includes(term) ||
        b.hallName.toLowerCase().includes(term)
      )
      .sort((a, b) => (b.eventDate || "").localeCompare(a.eventDate || ""));
  }, [bookings, q, statusFilter]);

  const stats = useMemo(() => {
    const totals = { count: bookings.length, revenue: 0, advances: 0, balance: 0, upcoming: 0 };
    const today = new Date().toISOString().slice(0, 10);
    for (const b of bookings) {
      if (b.status === "Cancelled") continue;
      const t = computeBookingTotals(b);
      totals.revenue  += t.grandTotal;
      totals.advances += t.advance;
      totals.balance  += t.balanceDue;
      if (b.eventDate >= today && b.status === "Confirmed") totals.upcoming += 1;
    }
    return totals;
  }, [bookings]);

  const onDelete = (id: string, num: string) => {
    if (!confirm(`Delete booking ${num}? This cannot be undone.`)) return;
    try { remove(id); toast({ title: "Booking deleted" }); }
    catch (e: any) { toast({ title: "Cannot delete", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-purple-600" /> Booking Invoice
          </h1>
          <p className="text-sm text-muted-foreground">Event hall bookings — full package invoicing.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/halls")}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
            data-testid="btn-manage-halls"
          >
            <Building2 className="w-4 h-4" /> Manage Halls
          </button>
          <button
            onClick={() => navigate("/booking-invoice/new")}
            className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
            data-testid="btn-new-booking"
          >
            <Plus className="w-4 h-4" /> New Booking
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Bookings"   value={String(stats.count)}        />
        <StatCard label="Upcoming Events"  value={String(stats.upcoming)}     accent="text-purple-600" />
        <StatCard label="Total Revenue"    value={fmt(stats.revenue, cur)}    accent="text-emerald-600" />
        <StatCard label="Advances Received"value={fmt(stats.advances, cur)}   accent="text-blue-600" />
        <StatCard label="Balance Due"      value={fmt(stats.balance, cur)}    accent="text-amber-600" />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search booking #, customer, phone, hall…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm"
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-1">
          {(["All", "Draft", "Confirmed", "Completed", "Cancelled"] as const).map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${
                statusFilter === s
                  ? "bg-purple-600 text-white border-purple-600"
                  : "border-input bg-background hover:bg-accent"
              }`}
              data-testid={`filter-${s.toLowerCase()}`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <Th>Booking #</Th>
              <Th>Event Date</Th>
              <Th>Slot</Th>
              <Th>Customer</Th>
              <Th>Hall</Th>
              <Th>Pax</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Advance</Th>
              <Th className="text-right">Balance</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} className="p-10 text-center text-muted-foreground">
                No bookings yet. Click <span className="font-medium">New Booking</span> to create your first one.
              </td></tr>
            ) : filtered.map(b => {
              const t = computeBookingTotals(b);
              return (
                <tr key={b.id} className="border-t hover:bg-muted/30 transition" data-testid={`row-${b.bookingNumber}`}>
                  <Td>
                    <button onClick={() => navigate(`/booking-invoice/${b.id}`)}
                      className="font-medium text-purple-600 hover:underline">
                      {b.bookingNumber}
                    </button>
                  </Td>
                  <Td>{b.eventDate || "—"}</Td>
                  <Td>{b.eventSlot}</Td>
                  <Td>
                    <div className="font-medium">{b.customerName}</div>
                    <div className="text-xs text-muted-foreground">{b.customerPhone}</div>
                  </Td>
                  <Td>{b.hallName}</Td>
                  <Td>{b.pax}</Td>
                  <Td className="text-right tabular-nums">{fmt(t.grandTotal, cur)}</Td>
                  <Td className="text-right tabular-nums text-emerald-600">{fmt(t.advance, cur)}</Td>
                  <Td className="text-right tabular-nums text-amber-600">{fmt(t.balanceDue, cur)}</Td>
                  <Td><span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLOR[b.status]}`}>{b.status}</span></Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-1">
                      <IconBtn title="Print" onClick={() => navigate(`/booking-invoice/${b.id}/print`)}><Printer className="w-4 h-4" /></IconBtn>
                      <IconBtn title="Edit"  onClick={() => navigate(`/booking-invoice/${b.id}`)}><Edit3 className="w-4 h-4" /></IconBtn>
                      <IconBtn title="Delete" onClick={() => onDelete(b.id, b.bookingNumber)}><Trash2 className="w-4 h-4 text-rose-500" /></IconBtn>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${accent || ""}`}>{value}</div>
    </div>
  );
}
function Th({ children, className = "" }: any)  { return <th className={`px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground ${className}`}>{children}</th>; }
function Td({ children, className = "" }: any)  { return <td className={`px-3 py-2 ${className}`}>{children}</td>; }
function IconBtn({ children, title, onClick }: any) {
  return <button title={title} onClick={onClick} className="p-1.5 rounded hover:bg-muted">{children}</button>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM PAGE  /booking-invoice/new  &  /booking-invoice/:id
// ═══════════════════════════════════════════════════════════════════════════
function blankBooking(): Omit<Booking, "id" | "bookingNumber" | "createdAt" | "updatedAt"> {
  return {
    customerName: "", customerPhone: "", customerAddress: "",
    hallId: "", hallName: "",
    eventDate: new Date().toISOString().slice(0, 10),
    eventSlot: "Dinner",
    eventType: "Wedding",
    pax: 100,
    perPlateRate: 0,
    menuItems: [],
    hallRent: 0,
    decorCharges: 0,
    extraServices: [],
    discount: 0,
    taxPercent: 0,
    advancePaid: 0,
    advanceMethod: "Cash",
    status: "Draft",
    notes: "",
  };
}

export function BookingInvoiceFormPage() {
  const [, navigate] = useLocation();
  const [matchEdit, paramsEdit] = useRoute<{ id: string }>("/booking-invoice/:id");
  const id = matchEdit ? paramsEdit?.id : undefined;
  const isNew = !id || id === "new";

  const { halls } = useHalls();
  const { customers } = useCustomers();
  const { bookings, add, edit, confirm } = useBookings();
  const { toast } = useToast();

  const existing = useMemo(() => isNew ? undefined : bookings.find(b => b.id === id), [bookings, id, isNew]);
  const [draft, setDraft] = useState(() => existing ? { ...existing } : blankBooking() as any);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);

  useEffect(() => { if (existing) setDraft({ ...existing }); }, [existing?.id]);

  // Preselect default hall rent when hall changes
  useEffect(() => {
    if (!draft.hallId) return;
    const h = halls.find(x => x.id === draft.hallId);
    if (h && draft.hallName !== h.name) {
      setDraft((d: any) => ({ ...d, hallName: h.name, hallRent: d.hallRent || h.baseRent }));
    }
  }, [draft.hallId, halls]);

  const settings = getSettings();
  const cur = (settings as any)?.currency || "AED";
  const totals = computeBookingTotals(draft);

  const conflict = useMemo(() => {
    if (!draft.hallId || !draft.eventDate) return undefined;
    return findBookingConflict(draft.hallId, draft.eventDate, draft.eventSlot, existing?.id);
  }, [draft.hallId, draft.eventDate, draft.eventSlot, existing?.id]);

  const customerMatches = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers.slice(0, 8);
    return customers
      .filter(c => c.name.toLowerCase().includes(term) || (c.phone || "").toLowerCase().includes(term))
      .slice(0, 8);
  }, [customers, customerSearch]);

  const onSelectCustomer = (c: any) => {
    setDraft((d: any) => ({
      ...d, customerId: c.id, customerName: c.name,
      customerPhone: c.phone || "", customerAddress: c.address || "",
    }));
    setCustomerSearch(c.name);
    setShowCustomerDrop(false);
  };

  const setField = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));
  const setNum   = (k: string, v: string) => setField(k, v === "" ? 0 : Number(v));

  const addMenuItem  = () => setField("menuItems", [...(draft.menuItems || []), { id: uid(), category: "Main Course", name: "" }]);
  const updMenuItem  = (i: number, u: Partial<BookingMenuItem>) => setField("menuItems",
    draft.menuItems.map((m: BookingMenuItem, idx: number) => idx === i ? { ...m, ...u } : m));
  const rmMenuItem   = (i: number) => setField("menuItems", draft.menuItems.filter((_: any, idx: number) => idx !== i));
  const addExtra     = () => setField("extraServices", [...(draft.extraServices || []), { id: uid(), name: "", amount: 0 }]);
  const updExtra     = (i: number, u: Partial<BookingExtraService>) => setField("extraServices",
    draft.extraServices.map((x: BookingExtraService, idx: number) => idx === i ? { ...x, ...u } : x));
  const rmExtra      = (i: number) => setField("extraServices", draft.extraServices.filter((_: any, idx: number) => idx !== i));

  // Base validation — required fields only. Used for Save Draft so tentative
  // bookings can still be persisted while a date conflict exists.
  const validate = () => {
    if (!draft.customerName.trim()) return "Customer name is required";
    if (!draft.customerPhone.trim()) return "Customer phone is required";
    if (!draft.hallId) return "Select a hall";
    if (!draft.eventDate) return "Pick an event date";
    if (!draft.pax || draft.pax < 1) return "Number of guests must be at least 1";
    return null;
  };

  // Stricter validation — adds the double-booking guard. Only Save & Confirm
  // (which posts a JE) should be blocked by a conflict, not Save Draft.
  const validateForConfirm = () => {
    const base = validate();
    if (base) return base;
    if (conflict) return `Hall is already booked by ${conflict.customerName} (${conflict.bookingNumber})`;
    return null;
  };

  const save = (): string | undefined => {
    const err = validate();
    if (err) { toast({ title: "Cannot save", description: err, variant: "destructive" }); return; }
    if (isNew) {
      const b = add({ ...draft });
      toast({ title: "Booking saved", description: b.bookingNumber });
      navigate(`/booking-invoice/${b.id}`);
      return b.id;
    } else {
      edit(id!, draft);
      toast({ title: "Booking updated" });
      return id;
    }
  };

  const saveAndConfirm = () => {
    const err = validateForConfirm();
    if (err) { toast({ title: "Cannot confirm", description: err, variant: "destructive" }); return; }
    let bid = id;
    if (isNew) {
      const b = add({ ...draft });
      bid = b.id;
    } else {
      edit(id!, draft);
    }
    try {
      const out = confirm(bid!);
      toast({ title: "Booking confirmed", description: `${out.bookingNumber} — JE posted to ledgers.` });
      navigate(`/booking-invoice/${bid}`);
    } catch (e: any) {
      toast({ title: "Cannot confirm", description: e.message, variant: "destructive" });
    }
  };

  const locked = existing?.status === "Confirmed" || existing?.status === "Completed";

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/booking-invoice")} className="p-2 rounded hover:bg-muted" data-testid="btn-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">
              {isNew ? "New Booking Invoice" : `Edit Booking ${existing?.bookingNumber ?? ""}`}
            </h1>
            {existing && <div className="text-xs"><span className={`px-2 py-0.5 rounded-full ${STATUS_COLOR[existing.status]}`}>{existing.status}</span></div>}
          </div>
        </div>
        <div className="flex gap-2">
          {!locked && (
            <>
              <button onClick={save}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
                data-testid="btn-save"
              ><FileText className="w-4 h-4" /> Save Draft</button>
              <button onClick={saveAndConfirm}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
                data-testid="btn-confirm"
              ><CheckCircle2 className="w-4 h-4" /> Save & Confirm</button>
            </>
          )}
          {existing && (
            <button onClick={() => navigate(`/booking-invoice/${id}/print`)}
              className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
              data-testid="btn-print"
            ><Printer className="w-4 h-4" /> Print Invoice</button>
          )}
        </div>
      </div>

      {conflict && (
        <div className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-3 text-sm">
          <strong>Double-booking blocked:</strong> Hall <strong>{conflict.hallName}</strong> is already confirmed on{" "}
          <strong>{conflict.eventDate}</strong> ({conflict.eventSlot}) for <strong>{conflict.customerName}</strong> — booking {conflict.bookingNumber}.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT: form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer */}
          <Section title="Customer">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
              <div className="relative">
                <Label>Customer Name *</Label>
                <input
                  value={draft.customerName}
                  onChange={e => { setField("customerName", e.target.value); setCustomerSearch(e.target.value); setShowCustomerDrop(true); }}
                  onFocus={() => setShowCustomerDrop(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDrop(false), 150)}
                  placeholder="Type to search existing customer…"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  disabled={locked} data-testid="input-customer-name"
                />
                {showCustomerDrop && customerMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow-lg">
                    {customerMatches.map(c => (
                      <button key={c.id} type="button"
                        onMouseDown={() => onSelectCustomer(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Field label="Phone *" value={draft.customerPhone} onChange={v => setField("customerPhone", v)} disabled={locked} testid="input-customer-phone" />
              <Field label="Address" value={draft.customerAddress || ""} onChange={v => setField("customerAddress", v)} disabled={locked} className="md:col-span-2" testid="input-customer-address" />
            </div>
          </Section>

          {/* Event */}
          <Section title="Event Details">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Hall / Venue *</Label>
                <select value={draft.hallId}
                  onChange={e => setField("hallId", e.target.value)}
                  disabled={locked}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  data-testid="select-hall"
                >
                  <option value="">— Select hall —</option>
                  {halls.filter(h => h.isActive).map(h => (
                    <option key={h.id} value={h.id}>{h.name} (cap. {h.capacity})</option>
                  ))}
                </select>
                {halls.length === 0 && (
                  <div className="text-xs text-amber-600 mt-1">
                    No halls yet. <button type="button" onClick={() => navigate("/halls")} className="underline">Add a hall</button>.
                  </div>
                )}
              </div>
              <Field label="Event Date *" type="date" value={draft.eventDate} onChange={v => setField("eventDate", v)} disabled={locked} testid="input-event-date" />
              <div>
                <Label>Slot *</Label>
                <select value={draft.eventSlot}
                  onChange={e => setField("eventSlot", e.target.value as BookingSlot)}
                  disabled={locked}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  data-testid="select-slot"
                >
                  {SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Event Type</Label>
                <select value={draft.eventType || ""}
                  onChange={e => setField("eventType", e.target.value)}
                  disabled={locked}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  data-testid="select-event-type"
                >
                  {EVENT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <NumField label="Guests (Pax) *" value={draft.pax} onChange={v => setNum("pax", v)} disabled={locked} testid="input-pax" />
              <NumField label={`Per-Plate Rate (${cur})`} value={draft.perPlateRate} onChange={v => setNum("perPlateRate", v)} disabled={locked} testid="input-rate" />
            </div>
          </Section>

          {/* Menu */}
          <Section title="Menu Items" right={
            <button type="button" onClick={addMenuItem} disabled={locked}
              className="inline-flex items-center gap-1 text-sm text-purple-600 hover:underline"
              data-testid="btn-add-menu"
            ><Plus className="w-4 h-4" /> Add item</button>
          }>
            {(!draft.menuItems || draft.menuItems.length === 0) ? (
              <p className="text-sm text-muted-foreground italic">No menu items added.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-1 w-44">Category</th>
                    <th className="py-1">Item Name</th>
                    <th className="py-1 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.menuItems.map((m: BookingMenuItem, i: number) => (
                    <tr key={m.id} className="border-t">
                      <td className="py-1.5 pr-2">
                        <select value={m.category} onChange={e => updMenuItem(i, { category: e.target.value })}
                          disabled={locked}
                          className="w-full px-2 py-1 rounded border border-input bg-background text-sm">
                          {MENU_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={m.name} onChange={e => updMenuItem(i, { name: e.target.value })}
                          disabled={locked} placeholder="e.g. Chicken Biryani"
                          className="w-full px-2 py-1 rounded border border-input bg-background text-sm" />
                      </td>
                      <td className="py-1.5">
                        {!locked && <IconBtn title="Remove" onClick={() => rmMenuItem(i)}><Trash2 className="w-4 h-4 text-rose-500" /></IconBtn>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Charges */}
          <Section title="Hall, Decor & Extras">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <NumField label={`Hall Rent (${cur})`} value={draft.hallRent} onChange={v => setNum("hallRent", v)} disabled={locked} testid="input-hallrent" />
              <NumField label={`Decor / Stage (${cur})`} value={draft.decorCharges} onChange={v => setNum("decorCharges", v)} disabled={locked} testid="input-decor" />
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <Label>Extra Services</Label>
                <button type="button" onClick={addExtra} disabled={locked}
                  className="inline-flex items-center gap-1 text-sm text-purple-600 hover:underline"
                  data-testid="btn-add-extra"
                ><Plus className="w-4 h-4" /> Add service</button>
              </div>
              {(!draft.extraServices || draft.extraServices.length === 0) ? (
                <p className="text-sm text-muted-foreground italic">No extra services.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {draft.extraServices.map((x: BookingExtraService, i: number) => (
                      <tr key={x.id} className="border-t">
                        <td className="py-1.5 pr-2">
                          <input value={x.name} onChange={e => updExtra(i, { name: e.target.value })}
                            disabled={locked} placeholder="DJ / Photographer / Valet / Generator"
                            className="w-full px-2 py-1 rounded border border-input bg-background text-sm" />
                        </td>
                        <td className="py-1.5 pr-2 w-44">
                          <input type="number" value={x.amount} onChange={e => updExtra(i, { amount: Number(e.target.value) || 0 })}
                            disabled={locked} placeholder="0.00"
                            className="w-full px-2 py-1 rounded border border-input bg-background text-sm text-right" />
                        </td>
                        <td className="py-1.5 w-12">
                          {!locked && <IconBtn title="Remove" onClick={() => rmExtra(i)}><Trash2 className="w-4 h-4 text-rose-500" /></IconBtn>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Section>

          {/* Notes */}
          <Section title="Notes / Special Instructions">
            <textarea value={draft.notes || ""} onChange={e => setField("notes", e.target.value)}
              disabled={locked} rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              placeholder="Anything to remember about this event…"
              data-testid="input-notes"
            />
          </Section>
        </div>

        {/* RIGHT: totals */}
        <div className="space-y-5">
          <Section title="Totals & Payment">
            <div className="space-y-2 text-sm">
              <Row label="Food Total"     value={fmt(totals.foodTotal, cur)} sub={`${draft.pax} × ${fmt(draft.perPlateRate, cur)}`} />
              <Row label="Hall Rent"      value={fmt(draft.hallRent, cur)} />
              <Row label="Decor / Stage"  value={fmt(draft.decorCharges, cur)} />
              <Row label="Extras"         value={fmt(totals.extrasTotal, cur)} />
              <div className="border-t pt-2" />
              <Row label="Subtotal" value={fmt(totals.subtotal, cur)} bold />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <NumField label={`Discount (${cur})`} value={draft.discount} onChange={v => setNum("discount", v)} disabled={locked} testid="input-discount" />
              <NumField label="Tax %" value={draft.taxPercent} onChange={v => setNum("taxPercent", v)} disabled={locked} testid="input-tax" />
            </div>
            <div className="space-y-2 text-sm mt-3">
              <Row label={`Tax (${draft.taxPercent}%)`} value={fmt(totals.tax, cur)} />
              <div className="border-t pt-2" />
              <Row label="Grand Total"  value={fmt(totals.grandTotal, cur)} bold accent="text-purple-700" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <NumField label={`Advance Paid (${cur})`} value={draft.advancePaid} onChange={v => setNum("advancePaid", v)} disabled={locked} testid="input-advance" />
              <div>
                <Label>Method</Label>
                <select value={draft.advanceMethod || "Cash"}
                  onChange={e => setField("advanceMethod", e.target.value)}
                  disabled={locked}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm">
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Card</option>
                  <option>Cheque</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 text-sm mt-3">
              <Row label="Advance" value={fmt(totals.advance, cur)} accent="text-emerald-600" />
              <Row label="Balance Due" value={fmt(totals.balanceDue, cur)} bold accent="text-amber-600" />
            </div>
          </Section>

          {existing?.jeId && (
            <Section title="Accounting">
              <div className="text-sm text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5" />
                <div>
                  Journal entry posted to ledgers.
                  <button onClick={() => navigate(`/journal-entry?id=${existing.jeId}`)} className="block text-xs text-blue-600 underline mt-1">
                    View JE
                  </button>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}
function Label({ children }: any) { return <label className="block text-xs font-medium mb-1 text-muted-foreground">{children}</label>; }
function Field({ label, value, onChange, type = "text", className = "", disabled, testid }: { label: string; value: string; onChange: (v: string) => void; type?: string; className?: string; disabled?: boolean; testid?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
        data-testid={testid}
      />
    </div>
  );
}
function NumField({ label, value, onChange, disabled, testid }: { label: string; value: number | string; onChange: (v: string) => void; disabled?: boolean; testid?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-right tabular-nums"
        data-testid={testid}
      />
    </div>
  );
}
function Row({ label, value, sub, bold, accent }: any) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <div className={bold ? "font-semibold" : ""}>{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className={`tabular-nums ${bold ? "font-semibold" : ""} ${accent || ""}`}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRINT VIEW  /booking-invoice/:id/print
// ═══════════════════════════════════════════════════════════════════════════
export function BookingInvoicePrintPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ id: string }>("/booking-invoice/:id/print");
  const id = params?.id;
  const { bookings } = useBookings();
  const { halls } = useHalls();
  const b = bookings.find(x => x.id === id);
  const settings = getSettings();
  const cur = (settings as any)?.currency || "AED";
  const company = (settings as any)?.company || {};
  const hall = halls.find(h => h.id === b?.hallId);
  const printed = useRef(false);

  useEffect(() => {
    if (b && !printed.current) {
      printed.current = true;
      // Auto-trigger print dialog after layout settles
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [b]);

  if (!b) return <div className="p-10 text-center text-muted-foreground">Booking not found.</div>;
  const t = computeBookingTotals(b);
  const menuByCat = (b.menuItems || []).reduce<Record<string, string[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m.name);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* toolbar — hidden when printing */}
      <div className="print:hidden bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-2 flex justify-between items-center">
          <button onClick={() => navigate(`/booking-invoice/${id}`)} className="inline-flex items-center gap-1 text-sm hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to booking
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-purple-600 text-white px-3 py-1.5 rounded text-sm">
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-sm print:shadow-none p-10 my-6 print:my-0 print:p-8 text-[13px] text-gray-800 leading-snug">
        {/* Header */}
        <div className="flex justify-between items-start border-b pb-5 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-purple-700">{company.name || "Your Event Hall"}</h1>
            {company.address && <div className="text-sm text-gray-600 mt-1 whitespace-pre-line">{company.address}</div>}
            {company.phone && <div className="text-sm text-gray-600">Phone: {company.phone}</div>}
            {company.email && <div className="text-sm text-gray-600">{company.email}</div>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-gray-800">BOOKING INVOICE</div>
            <div className="text-sm mt-1"><span className="text-gray-500">Booking #</span> <strong>{b.bookingNumber}</strong></div>
            <div className="text-sm"><span className="text-gray-500">Issue Date:</span> {new Date(b.createdAt).toLocaleDateString()}</div>
            <div className="text-sm"><span className="text-gray-500">Event Date:</span> <strong>{b.eventDate}</strong> ({b.eventSlot})</div>
            <div className="mt-2"><span className={`inline-block px-2 py-0.5 text-xs rounded-full ${STATUS_COLOR[b.status]}`}>{b.status}</span></div>
          </div>
        </div>

        {/* Client + Event */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <div className="text-xs uppercase text-gray-500 tracking-wide mb-1">Billed To</div>
            <div className="font-semibold text-base">{b.customerName}</div>
            <div className="text-sm text-gray-600">{b.customerPhone}</div>
            {b.customerAddress && <div className="text-sm text-gray-600 whitespace-pre-line">{b.customerAddress}</div>}
          </div>
          <div>
            <div className="text-xs uppercase text-gray-500 tracking-wide mb-1">Event Details</div>
            <div className="text-sm"><strong>{b.eventType}</strong> · {b.pax} guests</div>
            <div className="text-sm">Venue: <strong>{b.hallName}</strong>{hall?.capacity && <span className="text-gray-500"> (capacity {hall.capacity})</span>}</div>
            <div className="text-sm">Date / Slot: <strong>{b.eventDate}</strong> — {b.eventSlot}</div>
          </div>
        </div>

        {/* Menu */}
        {Object.keys(menuByCat).length > 0 && (
          <div className="mb-6">
            <div className="text-xs uppercase text-gray-500 tracking-wide mb-2">Menu</div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 border rounded p-3 bg-gray-50">
              {Object.entries(menuByCat).map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold text-purple-700 uppercase">{cat}</div>
                  <ul className="text-sm">
                    {items.map((n, i) => <li key={i}>• {n}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charges table */}
        <table className="w-full text-sm mb-6 border-collapse">
          <thead>
            <tr className="bg-purple-700 text-white">
              <th className="text-left  px-3 py-2 font-semibold">Description</th>
              <th className="text-right px-3 py-2 font-semibold">Qty</th>
              <th className="text-right px-3 py-2 font-semibold">Rate</th>
              <th className="text-right px-3 py-2 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="px-3 py-2">Catering ({b.eventType} package)</td>
              <td className="px-3 py-2 text-right">{b.pax}</td>
              <td className="px-3 py-2 text-right">{fmt(b.perPlateRate, cur)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(t.foodTotal, cur)}</td>
            </tr>
            {b.hallRent > 0 && (
              <tr className="border-b">
                <td className="px-3 py-2">Hall Rent — {b.hallName} ({b.eventSlot})</td>
                <td className="px-3 py-2 text-right">1</td>
                <td className="px-3 py-2 text-right">{fmt(b.hallRent, cur)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(b.hallRent, cur)}</td>
              </tr>
            )}
            {b.decorCharges > 0 && (
              <tr className="border-b">
                <td className="px-3 py-2">Decor & Stage Setup</td>
                <td className="px-3 py-2 text-right">1</td>
                <td className="px-3 py-2 text-right">{fmt(b.decorCharges, cur)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(b.decorCharges, cur)}</td>
              </tr>
            )}
            {(b.extraServices || []).map(x => (
              <tr key={x.id} className="border-b">
                <td className="px-3 py-2">{x.name || "Extra service"}</td>
                <td className="px-3 py-2 text-right">1</td>
                <td className="px-3 py-2 text-right">{fmt(x.amount, cur)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(x.amount, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <table className="text-sm min-w-[300px]">
            <tbody>
              <tr><td className="py-1 text-gray-600">Subtotal</td><td className="py-1 text-right tabular-nums">{fmt(t.subtotal, cur)}</td></tr>
              {t.discount > 0 && <tr><td className="py-1 text-gray-600">Discount</td><td className="py-1 text-right tabular-nums text-rose-600">− {fmt(t.discount, cur)}</td></tr>}
              {b.taxPercent > 0 && <tr><td className="py-1 text-gray-600">Tax ({b.taxPercent}%)</td><td className="py-1 text-right tabular-nums">{fmt(t.tax, cur)}</td></tr>}
              <tr className="border-t border-gray-300">
                <td className="py-2 font-semibold text-base">Grand Total</td>
                <td className="py-2 text-right tabular-nums font-semibold text-base text-purple-700">{fmt(t.grandTotal, cur)}</td>
              </tr>
              {t.advance > 0 && (
                <tr><td className="py-1 text-gray-600">Advance Paid {b.advanceMethod ? `(${b.advanceMethod})` : ""}</td>
                    <td className="py-1 text-right tabular-nums text-emerald-700">− {fmt(t.advance, cur)}</td></tr>
              )}
              <tr className="border-t border-gray-300">
                <td className="py-2 font-semibold">Balance Due (on event day)</td>
                <td className="py-2 text-right tabular-nums font-semibold text-amber-700">{fmt(t.balanceDue, cur)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {b.notes && (
          <div className="mb-6">
            <div className="text-xs uppercase text-gray-500 tracking-wide mb-1">Notes</div>
            <p className="text-sm whitespace-pre-line">{b.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t pt-4 mt-8 text-xs text-gray-500 text-center">
          Thank you for choosing {company.name || "us"} for your special event.
          Balance to be settled on the event day. Cancellations & refunds as per agreed terms.
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HALLS MASTER  /halls
// ═══════════════════════════════════════════════════════════════════════════
export function HallsPage() {
  const { halls, add, edit, remove } = useHalls();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const settings = getSettings();
  const cur = (settings as any)?.currency || "AED";
  const [draft, setDraft] = useState({ name: "", capacity: 100, baseRent: 0, description: "", isActive: true });

  const onAdd = () => {
    if (!draft.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    add({ ...draft });
    setDraft({ name: "", capacity: 100, baseRent: 0, description: "", isActive: true });
    toast({ title: "Hall added" });
  };

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/booking-invoice")} className="p-2 rounded hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-purple-600" /> Halls / Venues
            </h1>
            <p className="text-sm text-muted-foreground">Master data for your event halls.</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Add new hall</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Field label="Name *" value={draft.name} onChange={(v: string) => setDraft({ ...draft, name: v })} />
          <NumField label="Capacity (pax)" value={draft.capacity} onChange={(v: string) => setDraft({ ...draft, capacity: Number(v) || 0 })} />
          <NumField label={`Base Rent (${cur})`} value={draft.baseRent} onChange={(v: string) => setDraft({ ...draft, baseRent: Number(v) || 0 })} />
          <Field label="Description" value={draft.description} onChange={(v: string) => setDraft({ ...draft, description: v })} />
          <div className="flex items-end">
            <button onClick={onAdd}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700">
              <Plus className="w-4 h-4" /> Add Hall
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <Th>Name</Th><Th>Capacity</Th><Th className="text-right">Base Rent</Th><Th>Description</Th><Th>Active</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {halls.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No halls yet.</td></tr>
            ) : halls.map(h => (
              <HallRow key={h.id} hall={h} cur={cur} onEdit={(u: any) => edit(h.id, u)} onRemove={() => {
                if (!confirm(`Delete hall ${h.name}?`)) return;
                remove(h.id); toast({ title: "Hall deleted" });
              }} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HallRow({ hall, cur, onEdit, onRemove }: any) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState(hall);
  useEffect(() => setD(hall), [hall]);
  const save = () => { onEdit(d); setEditing(false); };

  if (editing) {
    return (
      <tr className="border-t bg-purple-50/30 dark:bg-purple-950/10">
        <Td><input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} className="w-full px-2 py-1 rounded border bg-background" /></Td>
        <Td><input type="number" value={d.capacity} onChange={e => setD({ ...d, capacity: Number(e.target.value) || 0 })} className="w-24 px-2 py-1 rounded border bg-background" /></Td>
        <Td className="text-right"><input type="number" value={d.baseRent} onChange={e => setD({ ...d, baseRent: Number(e.target.value) || 0 })} className="w-32 px-2 py-1 rounded border bg-background text-right" /></Td>
        <Td><input value={d.description || ""} onChange={e => setD({ ...d, description: e.target.value })} className="w-full px-2 py-1 rounded border bg-background" /></Td>
        <Td><input type="checkbox" checked={d.isActive} onChange={e => setD({ ...d, isActive: e.target.checked })} /></Td>
        <Td>
          <div className="inline-flex gap-1">
            <IconBtn title="Save" onClick={save}><Check className="w-4 h-4 text-emerald-600" /></IconBtn>
            <IconBtn title="Cancel" onClick={() => { setD(hall); setEditing(false); }}><X className="w-4 h-4" /></IconBtn>
          </div>
        </Td>
      </tr>
    );
  }
  return (
    <tr className="border-t hover:bg-muted/30">
      <Td className="font-medium">{hall.name}</Td>
      <Td>{hall.capacity}</Td>
      <Td className="text-right tabular-nums">{fmt(hall.baseRent, cur)}</Td>
      <Td>{hall.description}</Td>
      <Td>{hall.isActive ? <span className="text-emerald-600">●</span> : <span className="text-rose-600">○</span>}</Td>
      <Td>
        <div className="inline-flex gap-1">
          <IconBtn title="Edit" onClick={() => setEditing(true)}><Edit3 className="w-4 h-4" /></IconBtn>
          <IconBtn title="Delete" onClick={onRemove}><Trash2 className="w-4 h-4 text-rose-500" /></IconBtn>
        </div>
      </Td>
    </tr>
  );
}
