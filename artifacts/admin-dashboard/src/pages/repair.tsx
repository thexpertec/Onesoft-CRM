import { useState, useEffect, useCallback } from "react";
import {
  Wrench, RefreshCw, Trash2, CheckCircle2, Clock, AlertCircle,
  Phone, User, CalendarDays, Tag, ChevronDown, Loader2, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = "/api/kv/global/repair-bookings";

type BookingStatus = "New" | "In Progress" | "Resolved";

interface RepairBooking {
  id: string;
  name: string;
  phone: string;
  service: string;
  tenantId: string;
  createdAt: string;
  status: BookingStatus;
  notes?: string;
}

const STATUS_CYCLE: Record<BookingStatus, BookingStatus> = {
  "New": "In Progress",
  "In Progress": "Resolved",
  "Resolved": "New",
};

const STATUS_COLOR: Record<BookingStatus, string> = {
  "New":         "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  "In Progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  "Resolved":    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
};

const STATUS_ICON: Record<BookingStatus, React.ElementType> = {
  "New":         AlertCircle,
  "In Progress": Clock,
  "Resolved":    CheckCircle2,
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function RepairPage() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [bookings, setBookings] = useState<RepairBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | BookingStatus>("All");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      const data = await res.json() as { value: RepairBooking[] };
      const arr = Array.isArray(data.value) ? data.value : [];
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

  async function cycleStatus(id: string) {
    setSaving(id);
    try {
      const updated = bookings.map(b =>
        b.id === id ? { ...b, status: STATUS_CYCLE[b.status] } : b
      );
      await saveAll(updated);
      toast({ title: "Status updated" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function updateNotes(id: string, notes: string) {
    const updated = bookings.map(b => b.id === id ? { ...b, notes } : b);
    await saveAll(updated);
  }

  async function confirmDelete(id: string) {
    setSaving(id);
    try {
      const updated = bookings.filter(b => b.id !== id);
      await saveAll(updated);
      setDeleteId(null);
      toast({ title: "Booking deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    const matchSearch = !q || b.name.toLowerCase().includes(q) || b.phone.includes(q) || b.service.toLowerCase().includes(q) || (b.tenantId || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    New: bookings.filter(b => b.status === "New").length,
    "In Progress": bookings.filter(b => b.status === "In Progress").length,
    Resolved: bookings.filter(b => b.status === "Resolved").length,
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Wrench size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Repair Bookings</h1>
            <p className="text-xs text-muted-foreground">{bookings.length} total {bookings.length === 1 ? "query" : "queries"} received</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 text-xs">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(["New", "In Progress", "Resolved"] as const).map(s => {
          const Icon = STATUS_ICON[s];
          return (
            <button key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "All" : s)}
              className={`rounded-xl border p-3 text-left transition-all ${statusFilter === s ? STATUS_COLOR[s] + " ring-2 ring-current/30" : "bg-white dark:bg-card border-border hover:border-blue-300 dark:hover:border-blue-700"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{s}</span>
                <Icon size={13} className="text-muted-foreground" />
              </div>
              <div className="text-2xl font-extrabold text-foreground tabular-nums">{counts[s]}</div>
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
            placeholder="Search name, phone, service…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="All">All statuses</option>
          <option value="New">New</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
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
          <p className="font-medium text-sm">{search || statusFilter !== "All" ? "No bookings match your filters." : "No repair bookings yet."}</p>
          <p className="text-xs mt-1 opacity-70">Bookings submitted from the store will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-white dark:bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 dark:bg-muted/30 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium"><User size={11} className="inline mr-1" />Customer</th>
                <th className="px-4 py-3 text-left font-medium"><Phone size={11} className="inline mr-1" />Phone</th>
                <th className="px-4 py-3 text-left font-medium"><Tag size={11} className="inline mr-1" />Service</th>
                <th className="px-4 py-3 text-left font-medium"><CalendarDays size={11} className="inline mr-1" />Received</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Notes</th>
                {isAuthenticated && <th className="px-4 py-3 text-center font-medium w-16">Del</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b, i) => {
                const Icon = STATUS_ICON[b.status];
                return (
                  <tr key={b.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors group">
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{b.phone}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800 font-medium">
                        <Wrench size={10} /> {b.service}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(b.createdAt)}</td>
                    <td className="px-4 py-3">
                      {isAuthenticated ? (
                        <button
                          onClick={() => cycleStatus(b.id)}
                          disabled={saving === b.id}
                          title="Click to advance status"
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium transition-all hover:brightness-95 active:scale-95 disabled:opacity-60 ${STATUS_COLOR[b.status]}`}
                        >
                          {saving === b.id ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
                          {b.status}
                          <ChevronDown size={10} className="opacity-50" />
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium ${STATUS_COLOR[b.status]}`}>
                          <Icon size={11} /> {b.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isAuthenticated ? (
                        <input
                          type="text"
                          defaultValue={b.notes || ""}
                          onBlur={e => { const v = e.target.value.trim(); if (v !== (b.notes || "")) updateNotes(b.id, v); }}
                          placeholder="Add note…"
                          className="w-full min-w-28 text-xs px-2 py-1 rounded border border-transparent hover:border-border focus:border-blue-400 bg-transparent focus:bg-white dark:focus:bg-slate-800 outline-none transition-all placeholder:text-muted-foreground/40"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{b.notes || "—"}</span>
                      )}
                    </td>
                    {isAuthenticated && (
                      <td className="px-4 py-3 text-center">
                        {deleteId === b.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => confirmDelete(b.id)} disabled={saving === b.id}
                              className="text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-1.5 py-0.5 rounded transition-colors">
                              {saving === b.id ? <Loader2 size={10} className="animate-spin" /> : "Yes"}
                            </button>
                            <button onClick={() => setDeleteId(null)}
                              className="text-[10px] font-semibold text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted/30 px-1.5 py-0.5 rounded transition-colors">
                              No
                            </button>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
