import { useState, useEffect, useCallback } from "react";
import {
  Wrench, RefreshCw, Trash2, CheckCircle2, Clock, AlertCircle,
  Phone, User, CalendarDays, Tag, Loader2, Search, ChevronDown,
  ChevronUp, MessageSquare, FlaskConical, FileText, Package,
  Settings2, TruckIcon, Flag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";

const API = "/api/kv/global/repair-bookings";

type BookingStatus =
  | "New"
  | "Diagnosing"
  | "Quoted"
  | "Awaiting Parts"
  | "In Repair"
  | "Ready"
  | "Completed";

type Priority = "Low" | "Normal" | "High" | "Urgent";

interface RepairBooking {
  id: string;
  name: string;
  phone: string;
  service: string;
  deviceIssue?: string;
  tenantId: string;
  createdAt: string;
  status: BookingStatus;
  priority?: Priority;
  estimatedDate?: string;
  notes?: string;
}

const STATUS_ORDER: BookingStatus[] = [
  "New", "Diagnosing", "Quoted", "Awaiting Parts", "In Repair", "Ready", "Completed",
];

const STATUS_META: Record<BookingStatus, { color: string; dot: string; icon: React.ElementType; label: string }> = {
  "New":            { color: "bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300   border-blue-200   dark:border-blue-800",   dot: "bg-blue-500",   icon: AlertCircle,  label: "New"            },
  "Diagnosing":     { color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800", dot: "bg-violet-500", icon: FlaskConical, label: "Diagnosing"     },
  "Quoted":         { color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800", dot: "bg-indigo-500", icon: FileText,     label: "Quoted"         },
  "Awaiting Parts": { color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800", dot: "bg-orange-500", icon: Package,      label: "Awaiting Parts" },
  "In Repair":      { color: "bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300  border-amber-200  dark:border-amber-800",  dot: "bg-amber-500",  icon: Settings2,    label: "In Repair"      },
  "Ready":          { color: "bg-teal-100   text-teal-700   dark:bg-teal-900/40   dark:text-teal-300   border-teal-200   dark:border-teal-800",   dot: "bg-teal-500",   icon: TruckIcon,    label: "Ready"          },
  "Completed":      { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500", icon: CheckCircle2, label: "Completed" },
};

const PRIORITY_META: Record<Priority, { color: string; dot: string }> = {
  "Low":    { color: "text-gray-500   bg-gray-100   dark:bg-gray-800   border-gray-200   dark:border-gray-700",   dot: "bg-gray-400"   },
  "Normal": { color: "text-blue-600   bg-blue-50    dark:bg-blue-950/40 border-blue-200  dark:border-blue-800",   dot: "bg-blue-500"   },
  "High":   { color: "text-orange-600 bg-orange-50  dark:bg-orange-950/40 border-orange-200 dark:border-orange-800", dot: "bg-orange-500" },
  "Urgent": { color: "text-red-600    bg-red-50     dark:bg-red-950/40  border-red-200   dark:border-red-800",    dot: "bg-red-500"    },
};

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

export default function RepairPage() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [bookings, setBookings]       = useState<RepairBooking[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | BookingStatus>("All");
  const [priorityFilter, setPriorityFilter] = useState<"All" | Priority>("All");
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [expanded, setExpanded]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(API);
      const data = await res.json() as { value: RepairBooking[] };
      const arr  = Array.isArray(data.value) ? data.value : [];
      setBookings(arr.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch {
      toast({ title: "Failed to load bookings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function saveAll(updated: RepairBooking[]) {
    await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: updated }),
    });
    setBookings(updated.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async function updateField<K extends keyof RepairBooking>(id: string, key: K, val: RepairBooking[K]) {
    setSaving(id);
    try {
      const updated = bookings.map(b => b.id === id ? { ...b, [key]: val } : b);
      await saveAll(updated);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function confirmDelete(id: string) {
    setSaving(id);
    try {
      await saveAll(bookings.filter(b => b.id !== id));
      setDeleteId(null);
      if (expanded === id) setExpanded(null);
      toast({ title: "Booking deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setSaving(null);
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
    return matchSearch && matchStatus && matchPriority;
  });

  const stageCounts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = bookings.filter(b => b.status === s).length;
    return acc;
  }, {} as Record<BookingStatus, number>);

  const openCount   = bookings.filter(b => ["New", "Diagnosing", "Quoted"].includes(b.status)).length;
  const activeCount = bookings.filter(b => ["Awaiting Parts", "In Repair"].includes(b.status)).length;
  const doneCount   = bookings.filter(b => ["Ready", "Completed"].includes(b.status)).length;

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
              {bookings.length} total {bookings.length === 1 ? "query" : "queries"} · {openCount} open · {activeCount} active · {doneCount} done
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 text-xs">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

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
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin" /> Loading bookings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Wrench size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium text-sm">{search || statusFilter !== "All" || priorityFilter !== "All" ? "No bookings match your filters." : "No repair bookings yet."}</p>
          <p className="text-xs mt-1 opacity-70">Bookings submitted from the store will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-white dark:bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50 dark:bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-3 py-3 text-left font-medium w-8">#</th>
                  <th className="px-3 py-3 text-left font-medium"><User size={11} className="inline mr-1" />Customer</th>
                  <th className="px-3 py-3 text-left font-medium"><Phone size={11} className="inline mr-1" />Phone</th>
                  <th className="px-3 py-3 text-left font-medium"><Tag size={11} className="inline mr-1" />Service</th>
                  <th className="px-3 py-3 text-left font-medium"><MessageSquare size={11} className="inline mr-1" />Issue</th>
                  <th className="px-3 py-3 text-left font-medium"><CalendarDays size={11} className="inline mr-1" />Received</th>
                  <th className="px-3 py-3 text-left font-medium">Stage</th>
                  <th className="px-3 py-3 text-left font-medium"><Flag size={11} className="inline mr-1" />Priority</th>
                  {isAuthenticated && <th className="px-3 py-3 text-center font-medium w-16">Del</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((b, i) => {
                  const sm   = STATUS_META[b.status];
                  const Icon = sm.icon;
                  const isOpen = expanded === b.id;
                  const pm   = b.priority ? PRIORITY_META[b.priority] : null;

                  return (
                    <>
                      <tr key={b.id}
                        onClick={() => setExpanded(isOpen ? null : b.id)}
                        className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors group cursor-pointer">
                        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-foreground text-sm">{b.name}</div>
                          {b.tenantId && <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate max-w-28">{b.tenantId}</div>}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{b.phone}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800 font-medium whitespace-nowrap">
                            <Wrench size={9} /> {b.service}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-40">
                          {b.deviceIssue ? (
                            <span className="text-xs text-foreground/80 line-clamp-2 leading-snug">{b.deviceIssue}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 italic">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(b.createdAt)}</td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isAuthenticated ? (
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
                          {isAuthenticated ? (
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
                        {isAuthenticated && (
                          <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
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
                          <td colSpan={isAuthenticated ? 9 : 8} className="px-4 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                              {/* Device issue */}
                              <div className="sm:col-span-1 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  <MessageSquare size={11} /> Device Issue
                                </div>
                                <p className="text-sm text-foreground bg-white dark:bg-slate-800 rounded-lg px-3 py-2.5 border border-border min-h-[60px] leading-relaxed">
                                  {b.deviceIssue || <span className="text-muted-foreground italic text-xs">Not provided</span>}
                                </p>
                              </div>

                              {/* Technician notes */}
                              <div className="sm:col-span-1 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  <FileText size={11} /> Technician Notes
                                </div>
                                {isAuthenticated ? (
                                  <textarea
                                    rows={3}
                                    defaultValue={b.notes || ""}
                                    onBlur={e => {
                                      const v = e.target.value.trim();
                                      if (v !== (b.notes || "")) updateField(b.id, "notes", v);
                                    }}
                                    placeholder="Add technician notes…"
                                    className="w-full text-sm px-3 py-2.5 rounded-lg border border-border bg-white dark:bg-slate-800 text-foreground outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-muted-foreground/40 resize-none leading-relaxed"
                                  />
                                ) : (
                                  <p className="text-sm text-foreground bg-white dark:bg-slate-800 rounded-lg px-3 py-2.5 border border-border min-h-[60px] leading-relaxed">
                                    {b.notes || <span className="text-muted-foreground italic text-xs">No notes</span>}
                                  </p>
                                )}
                              </div>

                              {/* Meta panel */}
                              <div className="sm:col-span-1 space-y-3">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  <Clock size={11} /> Details
                                </div>
                                <div className="space-y-2 text-xs">
                                  <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-border">
                                    <span className="text-muted-foreground font-medium">Booking ID</span>
                                    <span className="font-mono text-[10px] text-foreground/70 truncate max-w-28">{b.id.slice(0, 8)}…</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-border">
                                    <span className="text-muted-foreground font-medium">Received</span>
                                    <span className="text-foreground">{formatDate(b.createdAt)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-border">
                                    <span className="text-muted-foreground font-medium">Est. Completion</span>
                                    {isAuthenticated ? (
                                      <input
                                        type="date"
                                        defaultValue={b.estimatedDate || ""}
                                        onBlur={e => {
                                          const v = e.target.value;
                                          if (v !== (b.estimatedDate || "")) updateField(b.id, "estimatedDate", v);
                                        }}
                                        className="text-xs bg-transparent text-foreground outline-none focus:ring-1 focus:ring-blue-400 rounded border border-border px-1.5 py-0.5"
                                      />
                                    ) : (
                                      <span className="text-foreground">{b.estimatedDate ? formatDateShort(b.estimatedDate) : <span className="italic text-muted-foreground">Not set</span>}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-border">
                                    <span className="text-muted-foreground font-medium">Store</span>
                                    <span className="text-foreground truncate max-w-28">{b.tenantId || "—"}</span>
                                  </div>
                                </div>

                                {/* Stage progress bar */}
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pipeline Stage</div>
                                  <div className="flex items-center gap-0.5">
                                    {STATUS_ORDER.map((s, idx) => {
                                      const currentIdx = STATUS_ORDER.indexOf(b.status);
                                      const filled = idx <= currentIdx;
                                      const sm2 = STATUS_META[s];
                                      return (
                                        <div key={s} title={s}
                                          className={`flex-1 h-1.5 rounded-full transition-all ${filled ? sm2.dot : "bg-gray-200 dark:bg-gray-700"}`} />
                                      );
                                    })}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    Step {STATUS_ORDER.indexOf(b.status) + 1} of {STATUS_ORDER.length} — <span className="font-semibold text-foreground">{b.status}</span>
                                  </div>
                                </div>
                              </div>

                            </div>

                            <button
                              onClick={() => setExpanded(null)}
                              className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <ChevronUp size={12} /> Collapse
                            </button>
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
    </div>
  );
}
