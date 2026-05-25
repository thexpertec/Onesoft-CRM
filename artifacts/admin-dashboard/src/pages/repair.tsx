import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Wrench, RefreshCw, Trash2, CheckCircle2, Clock, AlertCircle,
  Phone, User, CalendarDays, Tag, Loader2, Search, ChevronDown,
  ChevronUp, MessageSquare, FlaskConical, FileText, Package,
  Settings2, TruckIcon, Flag, Plus, Globe, Store, X,
  BarChart3, TrendingUp, Printer, Link2, Eye, HardHat,
  Hammer, Receipt, Save,
} from "lucide-react";
import { Link } from "wouter";
import QRCode from "qrcode";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { getSettings, issueRepairParts, convertRepairToSale, type Product } from "@/lib/store";
import { useDesignations, useStaff, useCustomers, useProducts, useSales } from "@/hooks/use-data";
import { buildRepairJobCardHtml, printReceiptHtml } from "@/lib/print-invoice";
import { Combobox, type ComboOption } from "@/components/combobox";
import { SelectCombobox } from "@/components/select-combobox";
import { kvGet, kvPut } from "@/lib/api";

const BOOKINGS_KEY = "repair-bookings";

type BookingStatus =
  | "New"
  | "Diagnosing"
  | "Quoted"
  | "Awaiting Parts"
  | "In Repair"
  | "Ready"
  | "Completed"
  | "Cancelled";

type Priority = "Low" | "Normal" | "High" | "Urgent";
type RequestSource = "Online" | "Shop Visitor";

/** Spare part consumed during a repair. Stock is debited at issue time (PR2). */
export interface RepairPartLine {
  productId: string;
  /** Snapshot of product name at issue time (display survives product deletion). */
  productName: string;
  qty: number;
  /** Cost per unit at issue time — used for COGS posting (PR2). */
  unitCost: number;
  /** Sale price per unit shown to the customer on the invoice (PR3). */
  unitPrice: number;
  /** Where the part came from: existing stock or an ad-hoc purchase. */
  source?: "stock" | "purchase";
  /** Reference back to the stock-ledger entry once issued (PR2). */
  ledgerEntryId?: string;
}

/** Non-stock labour / service line — billed but doesn't move inventory. */
export interface RepairLabourLine {
  description: string;
  hours?: number;
  rate: number;
  amount: number;
}

interface RepairBooking {
  id: string;
  /** Resolved customer record id; absent for ad-hoc walk-ins. */
  customerId?: string;
  name: string;
  phone: string;
  email?: string;
  service: string;
  deviceIssue?: string;
  tenantId: string;
  createdAt: string;
  status: BookingStatus;
  priority?: Priority;
  estimatedDate?: string;
  notes?: string;
  publicNote?: string;
  source?: RequestSource;
  /** Assigned repair technician (staff id). */
  technicianId?: string;
  /** Snapshot of technician's name at assignment time (for display when staff record is missing). */
  technicianName?: string;
  /** Parts consumed on this job (populated in PR2). */
  parts?: RepairPartLine[];
  /** Labour / service lines (populated in PR2). */
  labour?: RepairLabourLine[];
  /** Quoted total presented to the customer (PR2). */
  quotedTotal?: number;
  /** ISO timestamp when the customer approved the quote (PR2). */
  approvedAt?: string;
  /** Linked sale invoice id once the job is converted (PR3, legacy — superseded by `saleId`). */
  invoiceId?: string;
  /** Linked Sale id once the job is converted via `convertRepairToSale`.
   *  Repair invoicing is kept separate (Print Job Card); the sale shows up
   *  in the All Sales list tagged "Repair" with the full booking total. */
  saleId?: string;
  /** JE ids posted by parts-issue movements — used by reverse-cascade on cancel (PR2). */
  partsIssueJeIds?: string[];
  /** Warranty window in days from completion (PR3+). */
  warrantyDays?: number;
}

const STATUS_ORDER: BookingStatus[] = [
  "New", "Diagnosing", "Quoted", "Awaiting Parts", "In Repair", "Ready", "Completed", "Cancelled",
];

const SERVICE_OPTIONS = [
  "Device Repair", "Phone Unlocking", "Network & IT Setup",
  "PC & Laptop Services", "Warranty & Protection", "Delivery & Collection", "Other",
];

const STATUS_META: Record<BookingStatus, { color: string; dot: string; icon: React.ElementType; label: string }> = {
  "New":            { color: "bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300   border-blue-200   dark:border-blue-800",   dot: "bg-blue-500",   icon: AlertCircle,  label: "New"            },
  "Diagnosing":     { color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800", dot: "bg-violet-500", icon: FlaskConical, label: "Diagnosing"     },
  "Quoted":         { color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800", dot: "bg-indigo-500", icon: FileText,     label: "Quoted"         },
  "Awaiting Parts": { color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800", dot: "bg-orange-500", icon: Package,      label: "Awaiting Parts" },
  "In Repair":      { color: "bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300  border-amber-200  dark:border-amber-800",  dot: "bg-amber-500",  icon: Settings2,    label: "In Repair"      },
  "Ready":          { color: "bg-teal-100   text-teal-700   dark:bg-teal-900/40   dark:text-teal-300   border-teal-200   dark:border-teal-800",   dot: "bg-teal-500",   icon: TruckIcon,    label: "Ready"          },
  "Completed":      { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500", icon: CheckCircle2, label: "Completed" },
  "Cancelled":      { color: "bg-rose-100    text-rose-700    dark:bg-rose-900/40    dark:text-rose-300    border-rose-200    dark:border-rose-800",    dot: "bg-rose-500",    icon: X,            label: "Cancelled"      },
};

const PRIORITY_META: Record<Priority, { color: string; dot: string }> = {
  "Low":    { color: "text-gray-500   bg-gray-100   dark:bg-gray-800   border-gray-200   dark:border-gray-700",   dot: "bg-gray-400"   },
  "Normal": { color: "text-blue-600   bg-blue-50    dark:bg-blue-950/40 border-blue-200  dark:border-blue-800",   dot: "bg-blue-500"   },
  "High":   { color: "text-orange-600 bg-orange-50  dark:bg-orange-950/40 border-orange-200 dark:border-orange-800", dot: "bg-orange-500" },
  "Urgent": { color: "text-red-600    bg-red-50     dark:bg-red-950/40  border-red-200   dark:border-red-800",    dot: "bg-red-500"    },
};

const SOURCE_META: Record<RequestSource, { icon: React.ElementType; color: string; label: string }> = {
  "Online":       { icon: Globe,  color: "text-sky-600   bg-sky-50   dark:bg-sky-950/40  border-sky-200   dark:border-sky-800",   label: "Online"       },
  "Shop Visitor": { icon: Store,  color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800", label: "Shop Visitor" },
};

const FIELD_CLS = "w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-muted-foreground/50";
const LABEL_CLS = "block text-xs font-semibold text-muted-foreground mb-1";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

const LEGACY_STATUS_MAP: Record<string, BookingStatus> = {
  "In Progress": "In Repair",
  "Resolved":    "Completed",
};

function normaliseBooking(b: RepairBooking): RepairBooking {
  const status: BookingStatus = STATUS_META[b.status]
    ? b.status
    : (LEGACY_STATUS_MAP[b.status] ?? "New");
  return { ...b, status };
}

const EMPTY_FORM = {
  customerId: "",
  name: "", phone: "", email: "", service: "Device Repair",
  deviceIssue: "", notes: "", publicNote: "", estimatedDate: "",
  status: "New" as BookingStatus,
  priority: "Normal" as Priority,
  source: "Shop Visitor" as RequestSource,
  technicianId: "",
};

export default function RepairPage() {
  const { toast } = useToast();
  const { isAuthenticated, currentTenantId, can } = useAuth();
  const [bookings, setBookings]         = useState<RepairBooking[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | BookingStatus>("All");
  const [priorityFilter, setPriorityFilter] = useState<"All" | Priority>("All");
  const [sourceFilter, setSourceFilter] = useState<"All" | RequestSource>("All");
  const [technicianFilter, setTechnicianFilter] = useState<string>("All");
  const { designations } = useDesignations();
  const { staff } = useStaff();
  const { customers, addCustomer } = useCustomers();
  const { products } = useProducts();
  // Used to detect if a previously-linked Sale was deleted — if so the
  // booking's stale `saleId` should NOT lock out re-conversion.
  const { sales: allSales } = useSales();
  const saleIdSet = useMemo(() => new Set(allSales.map(s => s.id)), [allSales]);

  /** Products sorted for the parts picker (active products only). */
  const productOptions = useMemo(
    () => products.filter(p => p.status !== "Inactive").slice().sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  /** ComboOption form for the searchable parts picker — label is the product
   *  name (what users type / read) and `sub` carries category + SKU so the
   *  dropdown shows the same context as the old "Name | SKU" line. */
  const productComboOptions = useMemo<ComboOption[]>(
    () => productOptions.map(p => ({
      value: p.id,
      label: p.name,
      sub:   [p.category, p.sku].filter(Boolean).join(" | "),
    })),
    [productOptions],
  );
  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  /** Customers sorted by name for the picker. */
  const customerOptions = useMemo(
    () => customers.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );
  /**
   * Name → all matching customers (lowercased+trimmed key).
   * Stored as an array so duplicate names don't silently shadow each other —
   * callers must check `.length === 1` before auto-resolving an id.
   */
  const customersByName = useMemo(() => {
    const m = new Map<string, typeof customers>();
    customers.forEach(c => {
      const k = c.name.trim().toLowerCase();
      if (!k) return;
      const list = m.get(k);
      if (list) list.push(c); else m.set(k, [c]);
    });
    return m;
  }, [customers]);
  /**
   * Resolve a customer from a free-text picker value.
   * - If the text is `"Name · Phone"` (the disambiguated datalist label shown when
   *   multiple customers share a name), match on the (name, phone) tuple so the
   *   user's specific pick is honoured.
   * - Otherwise match by name alone, but only when it's unambiguous (single hit).
   */
  const resolveUniqueCustomer = useCallback((raw: string) => {
    const sep = " · ";
    const idx = raw.lastIndexOf(sep);
    if (idx > 0) {
      const namePart  = raw.slice(0, idx).trim().toLowerCase();
      const phonePart = raw.slice(idx + sep.length).trim();
      const list = customersByName.get(namePart);
      if (list && phonePart) {
        const exact = list.filter(c => (c.phone || "").trim() === phonePart);
        if (exact.length === 1) return exact[0];
      }
    }
    const list = customersByName.get(raw.trim().toLowerCase());
    return list && list.length === 1 ? list[0] : undefined;
  }, [customersByName]);

  /** Active staff whose designation is flagged as Repair Technician in HRM Setup. */
  const technicians = useMemo(() => {
    const techTitles = new Set(
      designations.filter(d => d.isRepairTechnician).map(d => d.title.trim().toLowerCase()).filter(Boolean)
    );
    if (techTitles.size === 0) return [];
    return staff
      .filter(s => s.status === "Active" && techTitles.has((s.designation || "").trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [designations, staff]);
  const technicianById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; designation: string }>();
    technicians.forEach(t => m.set(t.id, { id: t.id, name: t.name, designation: t.designation }));
    return m;
  }, [technicians]);
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [addForm, setAddForm]           = useState({ ...EMPTY_FORM });
  const [addSaving, setAddSaving]       = useState(false);
  // Per-booking draft state: edits in the expanded detail panel accumulate here
  // and are only written to the API when the user explicitly clicks Save.
  // Keys are booking ids; values are partial patches to merge over the saved record.
  const [drafts, setDrafts]             = useState<Record<string, Partial<RepairBooking>>>({});
  const [draftSaving, setDraftSaving]   = useState<string | null>(null);

  // Repair bookings live under the per-tenant namespace `t:{tenantId}` keyed
  // by `repair-bookings` (May 2026 hardening — previously a single global key
  // leaked every tenant's bookings cross-tenant). When viewing as the platform
  // superadmin (no tenant context), we fall back to the legacy `global`
  // namespace so any not-yet-migrated rows remain visible until the one-shot
  // server-side migration runs on next API restart.
  const tenantNs = currentTenantId ? `t:${currentTenantId}` : "global";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await kvGet(tenantNs, BOOKINGS_KEY);
      const arr  = (Array.isArray(raw) ? (raw as RepairBooking[]) : []).map(normaliseBooking);
      setBookings(arr.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch {
      toast({ title: "Failed to load bookings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, tenantNs]);

  useEffect(() => { load(); }, [load]);

  /**
   * Latest in-memory bookings, mirrored synchronously alongside `setBookings`.
   * All mutators must read from this ref (not the closure's `bookings`) so they
   * always patch the freshest state — otherwise concurrent edits across rows
   * derive from stale baselines and the second PUT silently clobbers the first.
   */
  const bookingsRef = useRef<RepairBooking[]>([]);
  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);

  /**
   * Serialised write queue. Each enqueued mutator runs *after* the previous
   * save resolves, reads the latest `bookingsRef.current`, derives the patch,
   * updates ref + state synchronously, then awaits the PUT. This eliminates
   * the lost-update race where overlapping in-flight PUTs race to overwrite
   * the entire blob from stale baselines.
   */
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueSave = useCallback((mutator: (current: RepairBooking[]) => RepairBooking[]) => {
    const next = writeQueueRef.current.then(async () => {
      const updated = mutator(bookingsRef.current);
      bookingsRef.current = updated;
      setBookings(updated.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      await kvPut(tenantNs, BOOKINGS_KEY, updated);
    });
    // Keep the chain alive even if a save fails — caller handles the error.
    writeQueueRef.current = next.catch(() => undefined);
    return next;
  }, [tenantNs]);

  async function saveAll(updated: RepairBooking[]) {
    await enqueueSave(() => updated);
  }

  // ── Draft helpers ─────────────────────────────────────────────────────────
  const getDraft  = (id: string): Partial<RepairBooking> => drafts[id] ?? {};
  const hasDraft  = (id: string) => { const d = drafts[id]; return !!d && Object.keys(d).length > 0; };
  const patchDraft = (id: string, patch: Partial<RepairBooking>) =>
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  const clearDraft = (id: string) =>
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });

  /** Flush any pending draft edits for a booking to the API, then clear the
   *  draft. Called before consequential actions (Issue Parts, Approve, Convert
   *  to Sale) so those operations always see the latest editable values. */
  async function flushDraft(id: string): Promise<void> {
    const d = getDraft(id);
    if (!d || Object.keys(d).length === 0) return;
    await updateFields(id, d);
    clearDraft(id);
  }

  /** Explicit Save button handler for the expanded detail panel. */
  async function saveDraftForBooking(id: string) {
    if (!hasDraft(id)) return;
    setDraftSaving(id);
    try {
      const d = getDraft(id);
      await updateFields(id, d);
      clearDraft(id);
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setDraftSaving(null);
    }
  }

  async function printJobCard(booking: RepairBooking) {
    try {
      const settings     = getSettings();
      const trackingUrl  = `${window.location.origin}/tenant-store/repair-track?id=${booking.id}`;
      const qrDataUrl    = await QRCode.toDataURL(trackingUrl, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
      const html         = buildRepairJobCardHtml(booking, settings, qrDataUrl, trackingUrl);
      printReceiptHtml(html);
    } catch {
      toast({ title: "Could not generate job card", variant: "destructive" });
    }
  }

  async function copyTrackingLink(booking: RepairBooking) {
    const url = `${window.location.origin}/tenant-store/repair-track?id=${booking.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Tracking link copied!", description: "Share it with the customer." });
    } catch {
      toast({ title: "Link: " + url });
    }
  }

  async function updateField<K extends keyof RepairBooking>(id: string, key: K, val: RepairBooking[K]) {
    setSaving(id);
    try {
      await enqueueSave(current => current.map(b => b.id === id ? { ...b, [key]: val } : b));
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  /** Patch multiple fields on a booking in a single save.
   *
   *  The state update is applied SYNCHRONOUSLY here (not inside enqueueSave's
   *  microtask) so React batches `setSaving` + `setBookings` into a single
   *  render. Without this, fast typing in controlled inputs (Qty, Price,
   *  Description, Amount) loses characters: setSaving fires a render with
   *  STILL-STALE bookings, the controlled input's `value` prop snaps back to
   *  the previous value, and the keystroke the user just typed is wiped.
   *  enqueueSave still runs to serialise the network PUT against concurrent
   *  edits. */
  async function updateFields(id: string, patch: Partial<RepairBooking>) {
    const updated = bookingsRef.current.map(b => b.id === id ? { ...b, ...patch } : b);
    bookingsRef.current = updated;
    setBookings(updated.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setSaving(id);
    try {
      await enqueueSave(() => updated);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  /** Compute parts/labour subtotals + grand total for display. */
  function calcTotals(b: RepairBooking) {
    const partsSub  = (b.parts  || []).reduce((s, p) => s + p.qty * p.unitPrice, 0);
    const labourSub = (b.labour || []).reduce((s, l) => s + l.amount, 0);
    return { partsSub, labourSub, grand: partsSub + labourSub };
  }

  async function confirmDelete(id: string) {
    setSaving(id);
    try {
      await enqueueSave(current => current.filter(b => b.id !== id));
      setDeleteId(null);
      if (expanded === id) setExpanded(null);
      toast({ title: "Booking deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    // Combobox doesn't carry the native `required` attribute, so guard explicitly.
    if (!addForm.name.trim()) {
      toast({ title: "Customer name required", description: "Pick an existing customer or type a walk-in name.", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    try {
      const tech = addForm.technicianId ? technicianById.get(addForm.technicianId) : undefined;
      // Re-resolve customerId by name (handles case where user edited name after picking).
      // Prefer an explicit selection (`customerId` from the picker); fall back to a
      // by-name match only when it's unambiguous (single customer with that name).
      const matched = resolveUniqueCustomer(addForm.name);
      // If the typed name doesn't match any existing customer, create one
      // on the fly so the booking is linked to a real Customer record (enables
      // AR posting + invoicing). This honours the "new customer will be
      // created on save" pill shown in the modal.
      let createdCustomerId: string | undefined;
      let dedupedCustomerId: string | undefined;
      if (!addForm.customerId && !matched) {
        // Preflight dedupe: there's no server-side uniqueness on (name,phone)
        // yet, so block silent duplicates here. Normalization: case-insensitive
        // trimmed name + digits-only phone (strips spaces/dashes/parens/plus).
        // This catches obvious dupes like "abdul qayyum" + "923334199233" vs
        // "Abdul Qayyum" + "+92 333 4199233" but does NOT fold country-code
        // variants (e.g. UK 07700 900123 vs +447700900123 won't match) — that
        // would need locale-aware E.164 canonicalization the app doesn't ship.
        // Server-side (name, phone) uniqueness is the proper fix, tracked separately.
        const normName  = addForm.name.trim().toLowerCase();
        const normPhone = addForm.phone.trim().replace(/\D+/g, "");
        const dup = customers.find(c =>
          c.name.trim().toLowerCase() === normName &&
          (c.phone || "").replace(/\D+/g, "") === normPhone &&
          normPhone.length > 0
        );
        if (dup) {
          dedupedCustomerId = dup.id;
        } else {
          try {
            const created = await addCustomer({
              name: addForm.name.trim(),
              phone: addForm.phone.trim(),
              email: addForm.email.trim(),
              customerType: "POS Customer",
              customerRole: "Buyer",
              status: "Active",
              source: "direct",
            } as Parameters<typeof addCustomer>[0]);
            createdCustomerId = created.id;
          } catch {
            // Non-fatal: fall through and save the booking as an ad-hoc walk-in.
            toast({ title: "Customer not created", description: "Saved as ad-hoc walk-in instead.", variant: "destructive" });
          }
        }
      }
      const resolvedCustomerId = addForm.customerId || matched?.id || dedupedCustomerId || createdCustomerId || undefined;
      const newBooking: RepairBooking = {
        id: crypto.randomUUID(),
        customerId: resolvedCustomerId,
        name: addForm.name.trim(),
        phone: addForm.phone.trim(),
        email: addForm.email.trim() || undefined,
        service: addForm.service,
        deviceIssue: addForm.deviceIssue.trim() || undefined,
        tenantId: currentTenantId || "admin",
        createdAt: new Date().toISOString(),
        status: addForm.status,
        priority: addForm.priority,
        source: addForm.source,
        estimatedDate: addForm.estimatedDate || undefined,
        notes: addForm.notes.trim() || undefined,
        publicNote: addForm.publicNote.trim() || undefined,
        technicianId: tech?.id,
        technicianName: tech?.name,
      };
      await enqueueSave(current => [...current, newBooking]);
      setAddOpen(false);
      setAddForm({ ...EMPTY_FORM });
      toast({ title: "Repair request added" });
    } catch {
      toast({ title: "Failed to add request", variant: "destructive" });
    } finally {
      setAddSaving(false);
    }
  }

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      b.name.toLowerCase().includes(q) ||
      b.phone.includes(q) ||
      b.service.toLowerCase().includes(q) ||
      (b.deviceIssue || "").toLowerCase().includes(q) ||
      (b.tenantId || "").toLowerCase().includes(q);
    const matchStatus   = statusFilter   === "All" || b.status   === statusFilter;
    const matchPriority = priorityFilter === "All" || b.priority === priorityFilter;
    const matchSource   = sourceFilter   === "All" || (b.source ?? "Online") === sourceFilter;
    const matchTech =
      technicianFilter === "All" ||
      (technicianFilter === "__unassigned__" ? !b.technicianId : b.technicianId === technicianFilter);
    return matchSearch && matchStatus && matchPriority && matchSource && matchTech;
  });

  const stageCounts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = bookings.filter(b => b.status === s).length;
    return acc;
  }, {} as Record<BookingStatus, number>);

  const openCount   = bookings.filter(b => ["New", "Diagnosing", "Quoted"].includes(b.status)).length;
  const activeCount = bookings.filter(b => ["Awaiting Parts", "In Repair"].includes(b.status)).length;
  const doneCount   = bookings.filter(b => ["Ready", "Completed"].includes(b.status)).length;
  const onlineCount = bookings.filter(b => (b.source ?? "Online") === "Online").length;
  const walkInCount = bookings.filter(b => b.source === "Shop Visitor").length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Wrench size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Repair Bookings</h1>
            <p className="text-xs text-muted-foreground">
              {bookings.length} total · {openCount} open · {activeCount} active · {doneCount} done
              {" · "}<Globe size={10} className="inline" /> {onlineCount} online
              {" · "}<Store size={10} className="inline" /> {walkInCount} walk-in
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 text-xs">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
          <Link href="/repair-report">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30">
              <BarChart3 size={13} /> View Report
            </Button>
          </Link>
          {can("Add Repairs") && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white">
              <Plus size={13} /> Add Request
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPI cards */}
      {!loading && bookings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Jobs",   value: bookings.length,  icon: Wrench,        color: "bg-blue-600",    sub: "All time" },
            { label: "Open",         value: openCount,        icon: AlertCircle,   color: "bg-violet-500",  sub: "New · Diagnosing · Quoted" },
            { label: "Active",       value: activeCount,      icon: Settings2,     color: "bg-amber-500",   sub: "In-work" },
            { label: "Done",         value: doneCount,        icon: CheckCircle2,  color: "bg-emerald-500", sub: "Ready & Completed" },
            { label: "Online",       value: onlineCount,      icon: Globe,         color: "bg-sky-500",     sub: "Web bookings" },
            { label: "Walk-in",      value: walkInCount,      icon: Store,         color: "bg-indigo-500",  sub: "Shop visitors" },
          ].map(({ label, value, icon: Icon, color, sub }) => (
            <div key={label} className="bg-white dark:bg-card rounded-xl border border-border p-3.5 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight truncate">{label}</p>
                <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
                <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Priority summary row */}
      {!loading && bookings.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Priority:</span>
          {(["Urgent", "High", "Normal", "Low"] as const).map(p => {
            const count = bookings.filter(b => (b.priority ?? "Normal") === p).length;
            const cls = { Urgent:"bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800", High:"bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400", Normal:"bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400", Low:"bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400" }[p];
            return (
              <span key={p} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${cls}`}>
                <Flag size={9} /> {p}: <strong>{count}</strong>
              </span>
            );
          })}
          {(() => {
            const completionPct = bookings.length > 0 ? Math.round((bookings.filter(b => b.status === "Completed").length / bookings.length) * 100) : 0;
            return (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <TrendingUp size={10} /> Completion rate: {completionPct}%
              </span>
            );
          })()}
        </div>
      )}

      {/* Pipeline stages */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {STATUS_ORDER.map(s => {
          const m    = STATUS_META[s];
          const Icon = m.icon;
          const active = statusFilter === s;
          return (
            <button key={s}
              onClick={() => setStatusFilter(active ? "All" : s)}
              className={`rounded-xl border p-3 text-left transition-all ${active ? m.color + " ring-2 ring-current/20" : "bg-white dark:bg-card border-border hover:border-blue-300 dark:hover:border-blue-700"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <Icon size={13} className={active ? "opacity-80" : "text-muted-foreground"} />
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-black/10 dark:bg-white/10" : "bg-muted text-muted-foreground"}`}>
                  {stageCounts[s]}
                </span>
              </div>
              <div className="text-[11px] font-semibold leading-tight text-foreground truncate">{m.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, service, issue…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="All">All statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="All">All priorities</option>
          <option value="Low">Low</option>
          <option value="Normal">Normal</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as typeof sourceFilter)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="All">All sources</option>
          <option value="Online">Online</option>
          <option value="Shop Visitor">Shop Visitor</option>
        </select>
        <select value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="All">All technicians</option>
          <option value="__unassigned__">Unassigned</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin" /> Loading bookings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Wrench size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium text-sm">{search || statusFilter !== "All" || priorityFilter !== "All" || sourceFilter !== "All" ? "No bookings match your filters." : "No repair bookings yet."}</p>
          <p className="text-xs mt-1 opacity-70">
            {isAuthenticated ? <>Click <strong>Add Request</strong> to log a walk-in, or bookings from the store appear here automatically.</> : "Bookings submitted from the store will appear here."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-white dark:bg-card">
          <div className="w-full">
            <table className="w-full text-sm table-auto">
              <thead>
                <tr className="border-b border-border bg-gray-50 dark:bg-muted/30 text-[11px] text-muted-foreground">
                  <th className="px-1.5 py-2.5 text-left font-medium w-6">#</th>
                  <th className="px-1.5 py-2.5 text-left font-medium">Job ID</th>
                  <th className="px-1.5 py-2.5 text-left font-medium"><User size={10} className="inline mr-0.5" />Customer</th>
                  <th className="px-1.5 py-2.5 text-left font-medium"><Phone size={10} className="inline mr-0.5" />Phone</th>
                  <th className="px-1.5 py-2.5 text-left font-medium"><Tag size={10} className="inline mr-0.5" />Service</th>
                  <th className="px-1.5 py-2.5 text-left font-medium"><MessageSquare size={10} className="inline mr-0.5" />Issue</th>
                  <th className="px-1.5 py-2.5 text-left font-medium">Source</th>
                  <th className="px-1.5 py-2.5 text-left font-medium"><CalendarDays size={10} className="inline mr-0.5" />Received</th>
                  <th className="px-1.5 py-2.5 text-left font-medium">Stage</th>
                  <th className="px-1.5 py-2.5 text-left font-medium"><Flag size={10} className="inline mr-0.5" />Priority</th>
                  <th className="px-1.5 py-2.5 text-left font-medium"><HardHat size={10} className="inline mr-0.5" />Technician</th>
                  {can("Delete Repairs") && <th className="px-1.5 py-2.5 text-center font-medium w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((b, i) => {
                  const sm     = STATUS_META[b.status];
                  const Icon   = sm.icon;
                  const isOpen = expanded === b.id;
                  const pm     = b.priority ? PRIORITY_META[b.priority] : null;
                  const src    = b.source ?? "Online";
                  const srcMeta = SOURCE_META[src as RequestSource] ?? SOURCE_META["Online"];
                  const SrcIcon = srcMeta.icon;

                  return (
                    <>
                      <tr key={b.id}
                        onClick={() => setExpanded(isOpen ? null : b.id)}
                        className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors group cursor-pointer">
                        <td className="px-1.5 py-2.5 text-[11px] text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-1.5 py-2.5">
                          <span className="inline-flex items-center font-mono text-[10px] font-semibold tracking-tight px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            RJ-{b.id.slice(0, 8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-1.5 py-2.5 max-w-[140px]">
                          <div className="font-medium text-foreground text-xs truncate" title={b.name}>{b.name}</div>
                        </td>
                        <td className="px-1.5 py-2.5 text-muted-foreground font-mono text-[11px] whitespace-nowrap">{b.phone}</td>
                        <td className="px-1.5 py-2.5">
                          <span className="inline-flex items-center gap-0.5 text-[11px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-medium leading-tight">
                            <Wrench size={9} className="shrink-0" /> {b.service}
                          </span>
                        </td>
                        <td className="px-1.5 py-2.5 max-w-[160px]">
                          {b.deviceIssue ? (
                            <span className="text-[11px] text-foreground/80 line-clamp-2 leading-snug" title={b.deviceIssue}>{b.deviceIssue}</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/40 italic">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-2.5">
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border leading-tight ${srcMeta.color}`}>
                            <SrcIcon size={9} className="shrink-0" /> {src}
                          </span>
                        </td>
                        <td className="px-1.5 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap leading-tight">
                          <div>{formatDateShort(b.createdAt)}</div>
                          <div className="text-[10px] text-muted-foreground/60">{new Date(b.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
                        </td>
                        <td className="px-1.5 py-2.5" onClick={e => e.stopPropagation()}>
                          {can("Edit Repairs") ? (
                            <select
                              value={b.status}
                              onChange={e => updateField(b.id, "status", e.target.value as BookingStatus)}
                              disabled={saving === b.id}
                              className={`text-xs px-2 py-1 rounded-lg border font-medium outline-none focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer disabled:opacity-60 ${sm.color}`}
                            >
                              {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium ${sm.color}`}>
                              <Icon size={11} /> {b.status}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {can("Edit Repairs") ? (
                            <select
                              value={b.priority || "Normal"}
                              onChange={e => updateField(b.id, "priority", e.target.value as Priority)}
                              disabled={saving === b.id}
                              className={`text-xs px-2 py-1 rounded-lg border font-medium outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer disabled:opacity-60 ${pm ? pm.color : PRIORITY_META["Normal"].color}`}
                            >
                              <option value="Low">Low</option>
                              <option value="Normal">Normal</option>
                              <option value="High">High</option>
                              <option value="Urgent">Urgent</option>
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded-lg border font-medium ${pm ? pm.color : PRIORITY_META["Normal"].color}`}>
                              {b.priority || "Normal"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {can("Edit Repairs") ? (
                            <select
                              value={b.technicianId || ""}
                              onChange={async e => {
                                const id = e.target.value;
                                const tech = id ? technicianById.get(id) : undefined;
                                setSaving(b.id);
                                try {
                                  await enqueueSave(current => current.map(x =>
                                    x.id === b.id
                                      ? { ...x, technicianId: tech?.id, technicianName: tech?.name }
                                      : x));
                                } catch {
                                  toast({ title: "Failed to assign technician", variant: "destructive" });
                                } finally {
                                  setSaving(null);
                                }
                              }}
                              disabled={saving === b.id}
                              className="text-xs px-2 py-1 rounded-lg border border-border bg-background text-foreground font-medium outline-none focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer disabled:opacity-60 max-w-32"
                            >
                              <option value="">— Unassigned —</option>
                              {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              {/* Preserve stale assignment so the value renders even if the staff record is gone or no longer a technician */}
                              {b.technicianId && !technicianById.has(b.technicianId) && (
                                <option value={b.technicianId}>{b.technicianName || "(missing)"} (former)</option>
                              )}
                            </select>
                          ) : b.technicianId ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 whitespace-nowrap">
                              <HardHat size={10} />
                              {technicianById.get(b.technicianId)?.name || b.technicianName || "—"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50 italic">Unassigned</span>
                          )}
                        </td>
                        {can("Delete Repairs") && (
                          <td className="px-1.5 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            {deleteId === b.id ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => confirmDelete(b.id)} disabled={saving === b.id}
                                  className="text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-1.5 py-0.5 rounded transition-colors">
                                  {saving === b.id ? <Loader2 size={10} className="animate-spin" /> : "Yes"}
                                </button>
                                <button onClick={() => setDeleteId(null)}
                                  className="text-[10px] font-semibold text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted/30 px-1.5 py-0.5 rounded transition-colors">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteId(b.id)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>

                      {/* Expanded detail row */}
                      {isOpen && (
                        <tr key={b.id + "-detail"} className="bg-blue-50/40 dark:bg-blue-950/10 border-b border-blue-100 dark:border-blue-900/30">
                          <td colSpan={can("Delete Repairs") ? 12 : 11} className="px-3 py-2.5">
                            {/* Merge any unsaved draft edits into a view-only copy so the user
                                sees their changes immediately without hitting the API on every
                                keystroke. The Save button commits the draft. */}
                            {(() => { const bv = { ...b, ...getDraft(b.id) }; return (
                            <>{/* Top info grid — 4 cols on lg+: Issue | Notes | Customer Update | Compact Details + Pipeline.
                                Customer Update was previously its own full-width section below; consolidating it here
                                reclaims ~80px and keeps related context-setting fields visually together. */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">

                              {/* Device issue */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                  <MessageSquare size={10} /> Device Issue
                                </div>
                                <p className="text-xs text-foreground bg-white dark:bg-slate-800 rounded-md px-2 py-1.5 border border-border min-h-[52px] leading-snug">
                                  {b.deviceIssue || <span className="text-muted-foreground italic">Not provided</span>}
                                </p>
                              </div>

                              {/* Technician notes */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                  <FileText size={10} /> Technician Notes
                                </div>
                                {can("Edit Repairs") ? (
                                  <textarea
                                    rows={2}
                                    value={bv.notes || ""}
                                    onChange={e => patchDraft(b.id, { notes: e.target.value })}
                                    placeholder="Add technician notes…"
                                    className="w-full text-xs px-2 py-1.5 rounded-md border border-border bg-white dark:bg-slate-800 text-foreground outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40 resize-none leading-snug min-h-[52px]"
                                  />
                                ) : (
                                  <p className="text-xs text-foreground bg-white dark:bg-slate-800 rounded-md px-2 py-1.5 border border-border min-h-[52px] leading-snug">
                                    {b.notes || <span className="text-muted-foreground italic">No notes</span>}
                                  </p>
                                )}
                              </div>

                              {/* Customer Update (relocated from full-width section below) */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                                  <Eye size={10} /> Customer Update <span className="text-muted-foreground normal-case font-normal">· QR</span>
                                </div>
                                {can("Edit Repairs") ? (
                                  <textarea
                                    rows={2}
                                    value={bv.publicNote || ""}
                                    onChange={e => patchDraft(b.id, { publicNote: e.target.value })}
                                    placeholder="Public update (e.g. Screen ordered, ready Friday)…"
                                    className="w-full text-xs px-2 py-1.5 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 text-foreground outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-muted-foreground/40 resize-none leading-snug min-h-[52px]"
                                  />
                                ) : (
                                  <p className="text-xs text-foreground bg-amber-50/40 dark:bg-amber-950/20 rounded-md px-2 py-1.5 border border-amber-200 dark:border-amber-800 min-h-[52px] leading-snug">
                                    {b.publicNote || <span className="text-muted-foreground italic">No update</span>}
                                  </p>
                                )}
                              </div>

                              {/* Compact details + pipeline.
                                  Previously 5 stacked bordered boxes (~150px); now a single 2-col key:value
                                  grid inside one box (~70px) plus the pipeline bar. */}
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                  <Clock size={10} /> Details
                                </div>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] bg-white dark:bg-slate-800 rounded-md border border-border px-2 py-1.5">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-muted-foreground">Source</span>
                                    <span className={`inline-flex items-center gap-0.5 font-medium px-1 py-0 rounded border text-[10px] ${SOURCE_META[b.source ?? "Online"].color}`}>
                                      {b.source === "Shop Visitor" ? <Store size={9} /> : <Globe size={9} />}
                                      {b.source ?? "Online"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-muted-foreground">ID</span>
                                    <span className="font-mono text-[10px] text-foreground/70 truncate max-w-[64px]">{b.id.slice(0, 8)}…</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-muted-foreground">Received</span>
                                    <span className="text-foreground truncate">{formatDate(b.createdAt)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-muted-foreground">Est.</span>
                                    {can("Edit Repairs") ? (
                                      <input
                                        type="date"
                                        value={bv.estimatedDate || ""}
                                        onChange={e => patchDraft(b.id, { estimatedDate: e.target.value })}
                                        className="text-[10px] bg-transparent text-foreground outline-none focus:ring-1 focus:ring-blue-400 rounded border border-border px-1 py-0 w-[96px]"
                                      />
                                    ) : (
                                      <span className="text-foreground">{b.estimatedDate ? formatDateShort(b.estimatedDate) : <span className="italic text-muted-foreground">—</span>}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-1 col-span-2">
                                    <span className="text-muted-foreground">Store</span>
                                    <span className="text-foreground truncate">{b.tenantId || "—"}</span>
                                  </div>
                                </div>

                                {/* Pipeline progress — thinner bar, single line caption */}
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-0.5">
                                    {STATUS_ORDER.map((s, idx) => {
                                      const currentIdx = STATUS_ORDER.indexOf(b.status);
                                      const filled = idx <= currentIdx;
                                      const sm2 = STATUS_META[s];
                                      return (
                                        <div key={s} title={s}
                                          className={`flex-1 h-1 rounded-full transition-all ${filled ? sm2.dot : "bg-gray-200 dark:bg-gray-700"}`} />
                                      );
                                    })}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    Step {STATUS_ORDER.indexOf(b.status) + 1}/{STATUS_ORDER.length} · <span className="font-semibold text-foreground">{b.status}</span>
                                  </div>
                                </div>
                              </div>

                            </div>

                            {/* ─── Parts & Labour — quote builder ─────────────────────── */}
                            {(() => {
                              const totals  = calcTotals(bv);
                              const parts   = bv.parts  || [];
                              const labour  = bv.labour || [];
                              const ccy     = getSettings().currency || "AED";
                              const fmt     = (n: number) => `${ccy} ${n.toFixed(2)}`;
                              const canEdit = can("Edit Repairs");
                              const approved = !!bv.approvedAt;
                              // Once parts are issued the row becomes a locked audit record:
                              // quantities, costs, and the line set itself must not change,
                              // otherwise the stock-ledger / JE / booking would drift apart.
                              const alreadyIssued = (b.partsIssueJeIds ?? []).length > 0;
                              const partsEditable = canEdit && !alreadyIssued;
                              return (
                                <div className="mt-2.5 rounded-lg border border-border bg-white dark:bg-slate-900 overflow-hidden">
                                  <div className="px-3 py-1.5 border-b border-border bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide">
                                      <Receipt size={12} /> Parts & Repair Service
                                      {approved && (
                                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded normal-case">
                                          <CheckCircle2 size={9} /> Quote approved {b.approvedAt && `· ${formatDateShort(b.approvedAt)}`}
                                        </span>
                                      )}
                                    </div>
                                    {canEdit && (
                                      <button
                                        onClick={async () => {
                                          if (hasDraft(b.id)) await flushDraft(b.id);
                                          await updateFields(b.id, { approvedAt: approved ? undefined : new Date().toISOString() });
                                        }}
                                        disabled={saving === b.id || draftSaving === b.id || (!approved && parts.length === 0 && labour.length === 0)}
                                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${approved
                                          ? "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
                                          : "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"}`}
                                      >
                                        {approved ? "Withdraw approval" : "Mark quote approved"}
                                      </button>
                                    )}
                                  </div>

                                  {/* Parts + Labour laid out side-by-side at lg+ to reclaim vertical space
                                      when one or both sections are short. Stack vertically below lg. */}
                                  <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-border">
                                  {/* Parts table */}
                                  <div className="px-3 py-2 space-y-1.5">
                                    {(() => {
                                      const issuedJeIds   = b.partsIssueJeIds ?? [];
                                      const alreadyIssued = issuedJeIds.length > 0;
                                      const issueDisabled =
                                        saving === b.id ||
                                        alreadyIssued ||
                                        parts.length === 0 ||
                                        parts.some(p => !p.productId || p.qty <= 0);
                                      return (
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                            <Package size={10} /> Parts ({parts.length})
                                            {alreadyIssued && (
                                              <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded normal-case">
                                                <CheckCircle2 size={9} /> Issued · {issuedJeIds.length} JE{issuedJeIds.length === 1 ? "" : "s"}
                                              </span>
                                            )}
                                          </div>
                                          {canEdit && (
                                            <div className="flex items-center gap-1.5">
                                              {/*
                                                Issue Parts — PR2b explicit trigger.
                                                Decrements stock, records ledger rows tagged "Repair Parts Issue",
                                                posts a balanced DR COGS / CR Inventory JE, and locks each line's
                                                unitCost to the value used in the JE. After issuance the parts
                                                table becomes read-only (Add/Remove disabled, no re-issue) to
                                                preserve the audit trail; un-issuing is a future PR.
                                              */}
                                              <button
                                                onClick={async () => {
                                                  if (hasDraft(b.id)) await flushDraft(b.id);
                                                  setSaving(b.id);
                                                  try {
                                                    // Tag each line with its array index as a stable lineId so the
                                                    // helper can return per-line locked cost/ledger refs even when
                                                    // two part rows reference the same product (a productId-keyed
                                                    // map would collapse duplicates).
                                                    const eligible = parts
                                                      .map((p, i) => ({ p, i }))
                                                      .filter(({ p }) => p.productId && p.qty > 0)
                                                      .map(({ p, i }) => ({
                                                        lineId:      String(i),
                                                        productId:   p.productId,
                                                        productName: p.productName || "(unnamed)",
                                                        qty:         p.qty,
                                                        unitCost:    p.unitCost,
                                                      }));
                                                    if (eligible.length === 0) {
                                                      toast({ title: "Nothing to issue", description: "Add at least one part with a product and positive quantity.", variant: "destructive" });
                                                      return;
                                                    }
                                                    const result = issueRepairParts({
                                                      bookingId:    b.id,
                                                      displayRef:   b.id.slice(0, 8).toUpperCase(),
                                                      customerName: b.name,
                                                      date:         new Date().toISOString().slice(0, 10),
                                                      parts:        eligible,
                                                    });
                                                    // Merge locked cost + ledger ref back per LINE (not per product) so
                                                    // duplicate-product rows each get their own ledgerEntryId.
                                                    const byLine = new Map(result.lockedLines.map(l => [l.lineId, l]));
                                                    const lockedParts = parts.map((p, i) => {
                                                      const locked = byLine.get(String(i));
                                                      return locked
                                                        ? { ...p, unitCost: locked.unitCost, ledgerEntryId: locked.ledgerEntryId }
                                                        : p;
                                                    });
                                                    await enqueueSave(current => current.map(x =>
                                                      x.id === b.id
                                                        ? { ...x, parts: lockedParts, partsIssueJeIds: [...(x.partsIssueJeIds ?? []), result.jeId] }
                                                        : x));
                                                    toast({ title: "Parts issued", description: `Stock decremented and JE posted (${eligible.length} line${eligible.length === 1 ? "" : "s"}).` });
                                                  } catch (err) {
                                                    toast({ title: "Issue failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
                                                  } finally {
                                                    setSaving(null);
                                                  }
                                                }}
                                                disabled={issueDisabled}
                                                title={alreadyIssued
                                                  ? "Parts already issued — see the linked Journal Entry"
                                                  : parts.length === 0
                                                    ? "Add at least one part first"
                                                    : "Decrement stock and post COGS journal entry"}
                                                className="text-[11px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1 border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                              >
                                                <Package size={10} /> Issue parts
                                              </button>
                                              <button
                                                onClick={() => {
                                                  const next: typeof parts = [...parts, { productId: "", productName: "", qty: 1, unitCost: 0, unitPrice: 0, source: "stock" }];
                                                  patchDraft(b.id, { parts: next });
                                                }}
                                                disabled={alreadyIssued}
                                                title={alreadyIssued ? "Parts already issued — re-issuing not supported in this PR" : ""}
                                                className="text-[11px] font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-2 py-0.5 rounded inline-flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                <Plus size={10} /> Add part
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    {parts.length === 0 ? (
                                      <p className="text-[11px] text-muted-foreground/60 italic px-1 py-1.5">No parts added yet.</p>
                                    ) : (
                                      <div className="w-full">
                                        <table className="w-full text-xs table-fixed">
                                          <thead>
                                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                              <th className="text-left py-1.5 pr-1.5 font-medium">Product</th>
                                              <th className="text-right py-1.5 px-1 font-medium w-12">Qty</th>
                                              <th className="text-right py-1.5 px-1 font-medium w-16">Price</th>
                                              <th className="text-right py-1.5 px-1 font-medium w-16">Subtotal</th>
                                              {canEdit && <th className="w-6" />}
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-border/60">
                                            {parts.map((line, idx) => {
                                              const lineSub = line.qty * line.unitPrice;
                                              // After issuance the line set is immutable. Cost and qty fed into
                                              // the JE; mutating them now would silently break audit trail.
                                              // unitPrice (what the customer pays) is the only field that could
                                              // safely change post-issue, but we lock the whole row to keep the
                                              // mental model simple — adjust price via a separate invoice edit.
                                              const editableRow = partsEditable;
                                              const patchPart = (patch: Partial<typeof line>) => {
                                                const next = parts.map((p, i) => i === idx ? { ...p, ...patch } : p);
                                                patchDraft(b.id, { parts: next });
                                              };
                                              const onPickProduct = (pid: string) => {
                                                const p = productById.get(pid);
                                                if (!p) { patchPart({ productId: "", productName: "" }); return; }
                                                patchPart({
                                                  productId: p.id,
                                                  productName: p.name,
                                                  unitCost:  parseFloat(p.costPrice || p.purchasePrice || "0") || 0,
                                                  unitPrice: parseFloat(p.price || "0") || 0,
                                                });
                                              };
                                              return (
                                                <tr key={idx} className="align-middle">
                                                  <td className="py-1.5 pr-1.5 min-w-0">
                                                    {editableRow ? (
                                                      <SelectCombobox
                                                        value={line.productId}
                                                        onChange={onPickProduct}
                                                        // If the saved productId no longer exists in the catalogue
                                                        // (product was deleted), surface a placeholder option so the
                                                        // input doesn't render blank — matches old "(deleted)" hint.
                                                        options={
                                                          line.productId && !productById.has(line.productId)
                                                            ? [...productComboOptions, { value: line.productId, label: `${line.productName || "(missing)"} (deleted)` }]
                                                            : productComboOptions
                                                        }
                                                        placeholder="— Select product —"
                                                        disabled={saving === b.id}
                                                        inputClassName="w-full min-w-0 text-xs px-1.5 py-1 rounded border border-border bg-background text-foreground outline-none focus:ring-1 focus:ring-blue-400 truncate"
                                                        minDropdownWidth={360}
                                                      />
                                                    ) : (
                                                      <span className="text-foreground block truncate" title={line.productName}>{line.productName || "—"}</span>
                                                    )}
                                                  </td>
                                                  <td className="py-1.5 px-1 text-right">
                                                    {editableRow ? (
                                                      <input type="number" min="0" step="1" value={line.qty}
                                                        onChange={e => patchPart({ qty: parseInt(e.target.value) || 0 })}
                                                        className="w-full text-right text-xs px-1 py-1 rounded border border-border bg-background outline-none focus:ring-1 focus:ring-blue-400 tabular-nums" />
                                                    ) : <span className="tabular-nums">{line.qty}</span>}
                                                  </td>
                                                  <td className="py-1.5 px-1 text-right">
                                                    {editableRow ? (
                                                      <input type="number" min="0" step="0.01" value={line.unitPrice}
                                                        onChange={e => patchPart({ unitPrice: parseFloat(e.target.value) || 0 })}
                                                        className="w-full text-right text-xs px-1 py-1 rounded border border-border bg-background outline-none focus:ring-1 focus:ring-blue-400 tabular-nums" />
                                                    ) : <span className="tabular-nums">{line.unitPrice.toFixed(2)}</span>}
                                                  </td>
                                                  <td className="py-1.5 px-1 text-right font-semibold text-foreground tabular-nums">{lineSub.toFixed(2)}</td>
                                                  {canEdit && (
                                                    <td className="py-1.5 px-1 text-center">
                                                      {editableRow && (
                                                        <button
                                                          onClick={() => patchDraft(b.id, { parts: parts.filter((_, i) => i !== idx) })}
                                                          disabled={saving === b.id}
                                                          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 p-0.5 rounded transition-colors"
                                                          title="Remove part">
                                                          <X size={12} />
                                                        </button>
                                                      )}
                                                    </td>
                                                  )}
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>

                                  {/* Labour table — sibling of Parts inside the 2-col grid; no border-t at lg+ (the divide-x supplies the separator) */}
                                  <div className="px-3 py-2 border-t border-border lg:border-t-0 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                        <Hammer size={10} /> Repair Service ({labour.length})
                                      </div>
                                      {canEdit && (
                                        <button
                                          onClick={() => {
                                            const next: typeof labour = [...labour, { description: "", hours: 1, rate: 0, amount: 0 }];
                                            patchDraft(b.id, { labour: next });
                                          }}
                                          className="text-[11px] font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-2 py-0.5 rounded inline-flex items-center gap-1 transition-colors"
                                        >
                                          <Plus size={10} /> Add service
                                        </button>
                                      )}
                                    </div>
                                    {labour.length === 0 ? (
                                      <p className="text-[11px] text-muted-foreground/60 italic px-1 py-1.5">No repair service lines added yet.</p>
                                    ) : (
                                      <div className="w-full">
                                        <table className="w-full text-xs table-fixed">
                                          <thead>
                                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                              <th className="text-left py-1.5 pr-1.5 font-medium">Description</th>
                                              <th className="text-right py-1.5 px-1 font-medium w-20">Amount</th>
                                              {canEdit && <th className="w-6" />}
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-border/60">
                                            {labour.map((line, idx) => {
                                              const patchLab = (patch: Partial<typeof line>) => {
                                                const merged = { ...line, ...patch };
                                                // Keep amount in sync with hours×rate unless the user typed amount directly.
                                                if (("hours" in patch || "rate" in patch) && !("amount" in patch)) {
                                                  merged.amount = (merged.hours || 0) * (merged.rate || 0);
                                                }
                                                const next = labour.map((l, i) => i === idx ? merged : l);
                                                patchDraft(b.id, { labour: next });
                                              };
                                              return (
                                                <tr key={idx} className="align-middle">
                                                  <td className="py-1.5 pr-1.5 min-w-0">
                                                    {canEdit ? (
                                                      <input type="text" placeholder="e.g. Screen replacement"
                                                        value={line.description}
                                                        onChange={e => patchLab({ description: e.target.value })}
                                                        className="w-full min-w-0 text-xs px-1.5 py-1 rounded border border-border bg-background text-foreground outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40" />
                                                    ) : <span className="text-foreground block truncate" title={line.description}>{line.description || "—"}</span>}
                                                  </td>
                                                  <td className="py-1.5 px-1 text-right">
                                                    {canEdit ? (
                                                      <input type="number" min="0" step="0.01" value={line.amount}
                                                        onChange={e => patchLab({ amount: parseFloat(e.target.value) || 0 })}
                                                        className="w-full text-right text-xs px-1 py-1 rounded border border-border bg-background outline-none focus:ring-1 focus:ring-blue-400 tabular-nums font-semibold" />
                                                    ) : <span className="tabular-nums font-semibold">{line.amount.toFixed(2)}</span>}
                                                  </td>
                                                  {canEdit && (
                                                    <td className="py-1.5 px-1 text-center">
                                                      <button
                                                        onClick={() => patchDraft(b.id, { labour: labour.filter((_, i) => i !== idx) })}
                                                        disabled={saving === b.id}
                                                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 p-0.5 rounded transition-colors"
                                                        title="Remove service">
                                                        <X size={12} />
                                                      </button>
                                                    </td>
                                                  )}
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>

                                  </div>{/* /Parts+Labour 2-col grid */}

                                  {/* Totals + Quoted total */}
                                  <div className="px-3 py-2 border-t border-border bg-slate-50/60 dark:bg-slate-800/30 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                                    <div className="text-xs space-y-1">
                                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Parts subtotal</span><span className="tabular-nums">{fmt(totals.partsSub)}</span></div>
                                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Repair Service subtotal</span><span className="tabular-nums">{fmt(totals.labourSub)}</span></div>
                                      <div className="flex justify-between gap-4 pt-1 border-t border-border/60"><span className="font-semibold text-foreground">Computed total</span><span className="font-bold text-foreground tabular-nums">{fmt(totals.grand)}</span></div>
                                    </div>
                                    <div className="text-xs">
                                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Quoted total to customer</label>
                                      {canEdit ? (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-muted-foreground text-[11px] font-medium">{ccy}</span>
                                          <input type="number" min="0" step="0.01"
                                            value={bv.quotedTotal ?? ""}
                                            placeholder={totals.grand.toFixed(2)}
                                            disabled={saving === b.id}
                                            onChange={e => {
                                              const raw = e.target.value;
                                              const val = raw === "" ? undefined : (parseFloat(raw) || 0);
                                              patchDraft(b.id, { quotedTotal: val });
                                            }}
                                            className="flex-1 text-right text-sm px-2 py-1.5 rounded border border-border bg-background outline-none focus:ring-1 focus:ring-blue-400 tabular-nums font-semibold" />
                                          {bv.quotedTotal !== undefined && (
                                            <button
                                              onClick={() => patchDraft(b.id, { quotedTotal: undefined })}
                                              disabled={saving === b.id}
                                              className="text-[10px] text-muted-foreground hover:text-red-600 px-1 py-0.5 rounded transition-colors"
                                              title="Clear quoted total">
                                              <X size={12} />
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <p className="text-sm font-semibold tabular-nums">{bv.quotedTotal !== undefined ? fmt(bv.quotedTotal) : <span className="text-muted-foreground italic font-normal">Not quoted</span>}</p>
                                      )}
                                      {bv.quotedTotal !== undefined && Math.abs(bv.quotedTotal - totals.grand) > 0.005 && (
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                                          Quoted differs from computed by {fmt(Math.abs((bv.quotedTotal ?? 0) - totals.grand))}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Action bar — Customer Update was relocated to the top grid (4th column).
                                Compact button strip; Collapse pinned right. */}
                            <div className="mt-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => printJobCard(b)}
                                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                                  <Printer size={11} /> Print Job Card
                                </button>
                                <button
                                  onClick={() => copyTrackingLink(b)}
                                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border hover:bg-gray-100 dark:hover:bg-muted/30 text-foreground transition-colors">
                                  <Link2 size={11} /> Copy Tracking Link
                                </button>
                                {/*
                                  Convert approved repair booking to a customer Sale (tagged "Repair").
                                  Repair invoicing stays separate (Print Job Card); the sale shows in
                                  the All Sales list with a Repair badge and the full booking total.
                                  Gating rules (defence-in-depth — backend helper also throws):
                                    • Quote must be approved.
                                    • A real Customer record must be linked (customerId), so AR posts to a sub-ledger.
                                    • If parts exist, they must already be issued — otherwise the
                                      sale's costPrice="0" trick would silently swallow the COGS.
                                    • Idempotent — once saleId is set the button is replaced with a
                                      read-only "Sale created" badge linking to the sales page.
                                */}
                                {b.saleId && saleIdSet.has(b.saleId) ? (
                                  <Link href="/sales">
                                    <a className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 transition-colors">
                                      <Receipt size={11} /> Sale created · open
                                    </a>
                                  </Link>
                                ) : (() => {
                                  const partsCount    = (bv.parts ?? []).length;
                                  const partsIssued   = (bv.partsIssueJeIds ?? []).length > 0;
                                  const labourCount   = (bv.labour ?? []).length;
                                  const approved      = !!bv.approvedAt;
                                  const hasCustomerId = !!bv.customerId;
                                  const partsBlocker  = partsCount > 0 && !partsIssued;
                                  const nothingToBill = partsCount === 0 && labourCount === 0;
                                  const disabled =
                                    saving === b.id ||
                                    draftSaving === b.id ||
                                    !approved ||
                                    !hasCustomerId ||
                                    partsBlocker ||
                                    nothingToBill;
                                  const tip = !approved
                                    ? "Mark the quote approved first"
                                    : !hasCustomerId
                                      ? "Pick a customer on this booking first (Edit → Customer)"
                                      : partsBlocker
                                        ? "Issue parts first — the sale cannot post COGS for un-issued parts"
                                        : nothingToBill
                                          ? "Add at least one part or service line"
                                          : "Create a Sale (tagged Repair) for this booking";
                                  return can("Edit Repairs") && (
                                    <button
                                      onClick={async () => {
                                        if (hasDraft(b.id)) await flushDraft(b.id);
                                        setSaving(b.id);
                                        try {
                                          const sale = convertRepairToSale({
                                            bookingId:     b.id,
                                            customerId:    bv.customerId!,
                                            date:          new Date().toISOString().slice(0, 10),
                                            approved:      !!bv.approvedAt,
                                            partsCount:    (bv.parts ?? []).length,
                                            partsIssued:   (bv.partsIssueJeIds ?? []).length > 0,
                                            // Ignore stale saleId pointing to a deleted sale — allow re-conversion.
                                            currentSaleId: bv.saleId && saleIdSet.has(bv.saleId) ? bv.saleId : undefined,
                                            parts: (bv.parts ?? []).map(p => ({
                                              productName: p.productName || "(unnamed)",
                                              sku:         p.productId,
                                              qty:         p.qty,
                                              unitPrice:   p.unitPrice,
                                            })),
                                            labour: (bv.labour ?? []).map(l => ({
                                              description: l.description,
                                              amount:      l.amount,
                                            })),
                                          });
                                          await enqueueSave(current => current.map(x =>
                                            x.id === b.id ? { ...x, saleId: sale.id } : x));
                                          toast({
                                            title: "Sale created",
                                            description: `${sale.saleNumber} added to Sales (tagged Repair).`,
                                          });
                                        } catch (err) {
                                          toast({
                                            title: "Could not create sale",
                                            description: err instanceof Error ? err.message : String(err),
                                            variant: "destructive",
                                          });
                                        } finally {
                                          setSaving(null);
                                        }
                                      }}
                                      disabled={disabled}
                                      title={tip}
                                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <Receipt size={11} /> Convert to Sale
                                    </button>
                                  );
                                })()}
                                {can("Edit Repairs") && hasDraft(b.id) && (
                                  <button
                                    onClick={() => saveDraftForBooking(b.id)}
                                    disabled={draftSaving === b.id || saving === b.id}
                                    className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-60">
                                    {draftSaving === b.id
                                      ? <Loader2 size={11} className="animate-spin" />
                                      : <Save size={11} />}
                                    Save
                                  </button>
                                )}
                                <button
                                  onClick={() => setExpanded(null)}
                                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                  <ChevronUp size={12} /> Collapse
                                </button>
                              </div>
                            </div>
                            </>);})()}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2.5 border-t border-border bg-gray-50/60 dark:bg-muted/10 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ChevronDown size={11} />
            Click any row to expand details, notes, and pipeline progress
          </div>
        </div>
      )}

      {/* ─── Add Request Modal ─────────────────────────────────────────── */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-gray-200 dark:border-slate-700 max-h-[92vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
                  <Plus size={15} className="text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground text-base leading-tight">New Repair Request</h2>
                  <p className="text-xs text-muted-foreground">Log a walk-in or add an offline booking</p>
                </div>
              </div>
              <button onClick={() => setAddOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-muted-foreground transition-colors">
                <X size={17} />
              </button>
            </div>

            {/* Modal form — 2 columns: left = job details, right = customer + technician */}
            <form onSubmit={handleAdd} className="overflow-y-auto flex-1 px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">

                {/* ───── LEFT: Repair Job Details ───── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-border">
                    <Wrench size={13} className="text-blue-600" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Repair Job Details</h3>
                  </div>

                  {/* Source type toggle */}
                  <div>
                    <label className={LABEL_CLS}>Request type <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Online", "Shop Visitor"] as RequestSource[]).map(src => {
                        const m   = SOURCE_META[src];
                        const Ico = m.icon;
                        const sel = addForm.source === src;
                        return (
                          <button key={src} type="button"
                            onClick={() => setAddForm(f => ({ ...f, source: src }))}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${sel ? m.color + " ring-2 ring-current/20" : "border-border bg-background text-foreground hover:border-blue-300"}`}>
                            <Ico size={15} />
                            {src}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Service */}
                  <div>
                    <label className={LABEL_CLS}>Service required <span className="text-red-500">*</span></label>
                    <select required value={addForm.service}
                      onChange={e => setAddForm(f => ({ ...f, service: e.target.value }))}
                      className={FIELD_CLS}>
                      {SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Device issue */}
                  <div>
                    <label className={LABEL_CLS}>Device issue / description</label>
                    <textarea rows={3} placeholder="e.g. Cracked screen, won't turn on, battery draining fast…"
                      value={addForm.deviceIssue} onChange={e => setAddForm(f => ({ ...f, deviceIssue: e.target.value }))}
                      className={FIELD_CLS + " resize-none"} />
                  </div>

                  {/* Status + Priority */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL_CLS}>Initial stage</label>
                      <select value={addForm.status}
                        onChange={e => setAddForm(f => ({ ...f, status: e.target.value as BookingStatus }))}
                        className={FIELD_CLS}>
                        {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Priority</label>
                      <select value={addForm.priority}
                        onChange={e => setAddForm(f => ({ ...f, priority: e.target.value as Priority }))}
                        className={FIELD_CLS}>
                        <option value="Low">Low</option>
                        <option value="Normal">Normal</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  {/* Estimated date */}
                  <div>
                    <label className={LABEL_CLS}>Estimated completion date</label>
                    <input type="date" value={addForm.estimatedDate}
                      onChange={e => setAddForm(f => ({ ...f, estimatedDate: e.target.value }))}
                      className={FIELD_CLS} />
                  </div>

                  {/* Internal notes */}
                  <div>
                    <label className={LABEL_CLS}>Technician notes (internal)</label>
                    <textarea rows={2} placeholder="Initial diagnosis, quote, or instructions…"
                      value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                      className={FIELD_CLS + " resize-none"} />
                  </div>

                  {/* Customer-visible update */}
                  <div>
                    <label className={LABEL_CLS + " text-amber-600 dark:text-amber-400"}>
                      Customer update <span className="font-normal text-muted-foreground">(shown on tracking page)</span>
                    </label>
                    <textarea rows={2} placeholder="e.g. Screen replacement ordered, ready by Friday…"
                      value={addForm.publicNote} onChange={e => setAddForm(f => ({ ...f, publicNote: e.target.value }))}
                      className={FIELD_CLS + " resize-none border-amber-200 dark:border-amber-800 focus:ring-amber-400"} />
                  </div>
                </div>

                {/* ───── RIGHT: Customer & Technician ───── */}
                <div className="space-y-4 md:border-l md:border-border md:pl-6">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-border">
                    <User size={13} className="text-blue-600" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Customer & Technician</h3>
                  </div>

                  {/* Customer name */}
                  <div>
                    <label className={LABEL_CLS}>
                      Customer name <span className="text-red-500">*</span>
                      {addForm.customerId ? (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={10} /> linked
                        </span>
                      ) : addForm.name.trim() && !(customersByName.get(addForm.name.trim().toLowerCase())?.length) ? (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          <Plus size={9} /> new customer
                        </span>
                      ) : null}
                    </label>
                    {(() => {
                      const customerComboOpts: (ComboOption & { __id: string })[] = customerOptions.map(c => {
                        const collisions = customersByName.get(c.name.trim().toLowerCase());
                        const dup = !!(collisions && collisions.length > 1);
                        return {
                          value: c.name,
                          label: c.name,
                          sub: c.phone || "",
                          tag: dup && c.phone ? c.phone : undefined,
                          __id: c.id,
                        };
                      });
                      return (
                        <Combobox
                          value={addForm.name}
                          options={customerComboOpts}
                          placeholder="Search customers or type new walk-in…"
                          inputClassName={FIELD_CLS}
                          maxResults={50}
                          onChange={v => {
                            const match = resolveUniqueCustomer(v);
                            setAddForm(f => ({
                              ...f,
                              name: v,
                              customerId: match?.id || "",
                              phone: match && !f.phone.trim() ? match.phone : f.phone,
                              email: match && !f.email.trim() ? (match.email || f.email) : f.email,
                            }));
                          }}
                          onSelect={opt => {
                            const id = (opt as ComboOption & { __id?: string }).__id;
                            const picked = customerOptions.find(c => c.id === id);
                            if (!picked) return;
                            setAddForm(f => ({
                              ...f,
                              name: picked.name,
                              customerId: picked.id,
                              phone: !f.phone.trim() ? picked.phone : f.phone,
                              email: !f.email.trim() ? (picked.email || "") : f.email,
                            }));
                          }}
                        />
                      );
                    })()}
                    {addForm.name.trim() && !addForm.customerId && (() => {
                      const dupes = customersByName.get(addForm.name.trim().toLowerCase());
                      if (dupes && dupes.length > 1) {
                        return (
                          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                            {dupes.length} customers share this name — pick one from the dropdown that includes a phone number to link the record.
                          </p>
                        );
                      }
                      return (
                        <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                          A new customer record will be created on save. Or add one in <Link href="/customers" className="text-blue-600 hover:underline">Customers</Link> first to enable richer AR tracking.
                        </p>
                      );
                    })()}
                  </div>

                  {/* Mobile */}
                  <div>
                    <label className={LABEL_CLS}>Mobile number <span className="text-red-500">*</span></label>
                    <input required type="tel" placeholder="e.g. 07700 900123"
                      value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                      className={FIELD_CLS} />
                  </div>

                  {/* Email */}
                  <div>
                    <label className={LABEL_CLS}>Email <span className="font-normal text-muted-foreground">(optional)</span></label>
                    <input type="email" placeholder="customer@example.com"
                      value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                      className={FIELD_CLS} />
                  </div>

                  {/* Assigned technician */}
                  <div>
                    <label className={LABEL_CLS}>
                      <HardHat size={11} className="inline mr-1 -mt-0.5" />
                      Assigned technician
                    </label>
                    <select value={addForm.technicianId}
                      onChange={e => setAddForm(f => ({ ...f, technicianId: e.target.value }))}
                      className={FIELD_CLS}>
                      <option value="">— Unassigned —</option>
                      {technicians.map(t => (
                        <option key={t.id} value={t.id}>{t.name}{t.designation ? ` · ${t.designation}` : ""}</option>
                      ))}
                    </select>
                    {technicians.length === 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                        No technicians available. In <Link href="/hrm-setup" className="text-blue-600 hover:underline">HRM Setup</Link>, edit a designation and tick <strong>Repair Technician</strong> to make active staff selectable here.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-5 mt-5 border-t border-border">
                <button type="button" onClick={() => setAddOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border text-foreground hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={addSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors">
                  {addSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Plus size={14} /> Add Request</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
