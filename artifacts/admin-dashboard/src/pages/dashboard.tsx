import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useLeads, useDocs, useCustomers } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { getAdminUsers } from "@/lib/store";
import { CURRENCIES } from "@/lib/currencies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import {
  Users, FileText, TrendingUp, PoundSterling, Plus, ArrowRight,
  Target, CheckCircle2, Clock, Building2, MapPin, Layers, UserPlus, UserCheck,
} from "lucide-react";

const quickCustomerSchema = z.object({
  name:    z.string().min(2, "Name is required"),
  company: z.string().min(1, "Company is required"),
  email:   z.union([z.string().email("Invalid email"), z.literal("")]),
  phone:   z.string().optional(),
  status:  z.enum(["Active", "Inactive", "Churned"]),
  currency: z.string(),
  totalValue: z.string().optional(),
  notes:   z.string().optional(),
});
type QuickCustomerValues = z.infer<typeof quickCustomerSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatGBP(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true });
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}

// Lead status colours
const LEAD_STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  New:             { bg: "bg-blue-500",   text: "text-blue-600 dark:text-blue-400",   label: "New" },
  Contacted:       { bg: "bg-amber-400",  text: "text-amber-600 dark:text-amber-400", label: "Contacted" },
  Qualified:       { bg: "bg-cyan-500",   text: "text-cyan-600 dark:text-cyan-400",   label: "Qualified" },
  "Proposal Sent": { bg: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", label: "Proposal Sent" },
  Won:             { bg: "bg-emerald-500",text: "text-emerald-600 dark:text-emerald-400", label: "Won" },
  Lost:            { bg: "bg-red-400",    text: "text-red-600 dark:text-red-400",     label: "Lost" },
};

const DOC_STATUS_META: Record<string, { color: string; label: string; badge: string }> = {
  Draft:          { color: "#94a3b8", label: "Draft",        badge: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" },
  "Under Review": { color: "#f59e0b", label: "Under Review", badge: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300" },
  Approved:       { color: "#10b981", label: "Approved",     badge: "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300" },
  Archived:       { color: "#cbd5e1", label: "Archived",     badge: "bg-slate-100 dark:bg-slate-800 text-slate-400" },
};

const LEAD_STATUS_ORDER = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"] as const;

// ─── Mini SVG Donut ──────────────────────────────────────────────────────────
function DonutChart({ segments }: { segments: { color: string; value: number }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <svg viewBox="0 0 36 36" className="w-full h-full">
        <circle cx="18" cy="18" r="13" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/30" />
      </svg>
    );
  }
  const r = 13;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
      {segments.map((s, i) => {
        const pct = s.value / total;
        const dash = pct * circ;
        const gap  = circ - dash;
        const el = (
          <circle
            key={i}
            cx="18" cy="18" r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="5"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, accent, testId,
}: { icon: React.ElementType; label: string; value: string | number; sub?: React.ReactNode; accent: string; testId?: string }) {
  return (
    <Card className={`relative overflow-hidden border-l-4 ${accent}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1.5 text-foreground" data-testid={testId}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
          </div>
          <div className="rounded-xl p-2.5 bg-muted/50 flex-shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Lead status badge ────────────────────────────────────────────────────────
function LeadBadge({ status }: { status: string }) {
  const m = LEAD_STATUS_META[status];
  const cls = {
    New:             "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
    Contacted:       "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
    Qualified:       "bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300",
    "Proposal Sent": "bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300",
    Won:             "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    Lost:            "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300",
  }[status] || "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{m?.label ?? status}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { leads } = useLeads();
  const { docs }  = useDocs();
  const { addCustomer } = useCustomers();
  const { currentUser, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  const quickCustomerForm = useForm<QuickCustomerValues>({
    resolver: zodResolver(quickCustomerSchema),
    defaultValues: {
      name: "", company: "", email: "", phone: "",
      status: "Active", currency: "GBP", totalValue: "", notes: "",
    },
  });

  const handleQuickAddCustomer = (data: QuickCustomerValues) => {
    addCustomer({
      name:          data.name,
      company:       data.company,
      email:         data.email ?? "",
      phone:         data.phone ?? "",
      industry:      "",
      city:          "",
      status:        data.status,
      source:        "direct",
      customerSince: new Date().toISOString().split("T")[0],
      totalValue:    data.totalValue ?? "",
      currency:      data.currency,
      notes:         data.notes ?? "",
      tags:          [],
    });
    toast({ title: "Customer added", description: `${data.name} has been added as a customer.` });
    quickCustomerForm.reset();
    setAddCustomerOpen(false);
  };

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalLeads    = leads.length;
  const wonLeads      = leads.filter(l => l.status === "Won").length;
  const lostLeads     = leads.filter(l => l.status === "Lost").length;
  const activeLeads   = leads.filter(l => !["Won","Lost"].includes(l.status)).length;
  const winRate       = totalLeads ? Math.round((wonLeads / totalLeads) * 100) : 0;
  const totalDocs     = docs.length;
  const approvedDocs  = docs.filter(d => d.status === "Approved").length;
  const pendingDocs   = docs.filter(d => d.status === "Under Review").length;

  const pipelineValue = useMemo(() => docs.reduce((acc, doc) => {
    const sections = (doc.sections ?? {}) as Record<string, Record<string, unknown>>;
    const s5 = (sections.s5 ?? {}) as Record<string, unknown>;
    const additionalCosts = s5.additionalCosts as string | undefined;
    if (additionalCosts) {
      const val = parseFloat(additionalCosts.replace(/[^0-9.]/g, ""));
      if (!isNaN(val)) return acc + val;
    }
    return acc;
  }, 0), [docs]);

  // ── Lead pipeline breakdown ────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    LEAD_STATUS_ORDER.forEach(s => { map[s] = 0; });
    leads.forEach(l => { if (map[l.status] !== undefined) map[l.status]++; });
    return map;
  }, [leads]);

  // ── Lead source breakdown ──────────────────────────────────────────────────
  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      const s = l.source || "Unknown";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [leads]);

  // ── Industry breakdown ─────────────────────────────────────────────────────
  const industryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      const s = l.industry || "Other";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [leads]);

  // ── Doc status for donut ───────────────────────────────────────────────────
  const docStatusCounts = useMemo(() => {
    const map: Record<string, number> = { Draft: 0, "Under Review": 0, Approved: 0, Archived: 0 };
    docs.forEach(d => { if (map[d.status] !== undefined) map[d.status]++; });
    return map;
  }, [docs]);

  const donutSegments = Object.entries(docStatusCounts).map(([k, v]) => ({
    color: DOC_STATUS_META[k]?.color ?? "#ccc",
    value: v,
  }));

  // ── Recent ─────────────────────────────────────────────────────────────────
  const recentLeads = useMemo(() =>
    [...leads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  , [leads]);

  const recentDocs = useMemo(() =>
    [...docs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  , [docs]);

  // ── Greeting ──────────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = currentUser?.fullName?.split(" ")[0] || currentUser?.username || "there";

  const adminUsers = useMemo(() => getAdminUsers(), []);

  return (
    <div className="space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Welcome header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isAuthenticated ? `${greeting}, ${displayName} 👋` : "Onesoft Dashboard"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {format(new Date(), "EEEE, d MMMM yyyy")} &middot; Here's your business overview.
          </p>
        </div>
        {isAuthenticated && (
          <div className="flex gap-2 flex-wrap">
            <Link href="/leads">
              <Button size="sm" variant="outline" className="gap-1.5"><UserPlus size={14} /> Add Lead</Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setAddCustomerOpen(true)}
              data-testid="btn-quick-add-customer"
            >
              <UserCheck size={14} /> Add Customer
            </Button>
            <Link href="/documents/new">
              <Button size="sm" className="gap-1.5"><Plus size={14} /> New Document</Button>
            </Link>
          </div>
        )}
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Total Leads"
          value={totalLeads}
          sub={totalLeads > 0 ? <>{activeLeads} active · {lostLeads} lost</> : "No leads yet"}
          accent="border-l-blue-500"
          testId="stat-total-leads"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Deals Won"
          value={wonLeads}
          sub={<>Win rate: <strong>{winRate}%</strong></>}
          accent="border-l-emerald-500"
          testId="stat-conversion-rate"
        />
        <KpiCard
          icon={FileText}
          label="Req. Documents"
          value={totalDocs}
          sub={totalDocs > 0 ? <>{approvedDocs} approved · {pendingDocs} under review</> : "No documents yet"}
          accent="border-l-violet-500"
          testId="stat-total-docs"
        />
        <KpiCard
          icon={PoundSterling}
          label="Est. Pipeline"
          value={formatGBP(pipelineValue)}
          sub="Based on document budgets"
          accent="border-l-amber-500"
          testId="stat-pipeline-value"
        />
      </div>

      {/* ── Pipeline + Doc status + Team ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Lead Pipeline */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers size={16} className="text-muted-foreground" /> Lead Pipeline
              </CardTitle>
              <Link href="/leads">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">
                  View all <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalLeads === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                No leads yet. <Link href="/leads"><span className="text-primary underline cursor-pointer">Add your first lead</span></Link>
              </div>
            ) : (
              <>
                {/* Stacked bar */}
                <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                  {LEAD_STATUS_ORDER.map(s => {
                    const count = statusCounts[s] || 0;
                    const pct = totalLeads ? (count / totalLeads) * 100 : 0;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={s}
                        className={`${LEAD_STATUS_META[s].bg} transition-all`}
                        style={{ width: `${pct}%` }}
                        title={`${s}: ${count}`}
                      />
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {LEAD_STATUS_ORDER.map(s => {
                    const count = statusCounts[s] || 0;
                    const pct = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
                    return (
                      <div key={s} className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${LEAD_STATUS_META[s].bg}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{s}</p>
                          <p className="text-[11px] text-muted-foreground">{count} · {pct}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Document Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Target size={16} className="text-muted-foreground" /> Documents
              </CardTitle>
              <Link href="/documents">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">
                  View all <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {totalDocs === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                No documents yet.
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 flex-shrink-0">
                  <DonutChart segments={donutSegments} />
                </div>
                <div className="space-y-2 flex-1 min-w-0">
                  {Object.entries(docStatusCounts).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOC_STATUS_META[k]?.color }} />
                        <span className="text-xs truncate">{DOC_STATUS_META[k]?.label ?? k}</span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Insights row ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

        {/* Lead Source breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp size={16} className="text-muted-foreground" /> Leads by Source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sourceCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : sourceCounts.map(([src, cnt]) => {
              const pct = totalLeads ? Math.round((cnt / totalLeads) * 100) : 0;
              return (
                <div key={src} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium truncate">{src}</span>
                    <span className="text-muted-foreground ml-2">{cnt} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Industry breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building2 size={16} className="text-muted-foreground" /> Leads by Industry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {industryCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : industryCounts.map(([ind, cnt]) => {
              const pct = totalLeads ? Math.round((cnt / totalLeads) * 100) : 0;
              return (
                <div key={ind} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium truncate">{ind}</span>
                    <span className="text-muted-foreground ml-2">{cnt} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Team / Sys info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock size={16} className="text-muted-foreground" /> System Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Admin Users", value: adminUsers.length, icon: Users },
              { label: "Total Leads", value: totalLeads, icon: TrendingUp },
              { label: "Documents", value: totalDocs, icon: FileText },
              { label: "Win Rate", value: `${winRate}%`, icon: Target },
              { label: "Pipeline", value: formatGBP(pipelineValue), icon: PoundSterling },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon size={13} />
                  <span>{label}</span>
                </div>
                <span className="text-sm font-semibold">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent activity ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Recent Leads */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Leads</CardTitle>
              <Link href="/leads">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">
                  All leads <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentLeads.length === 0 ? (
              <div className="px-6 pb-6 text-center py-8 text-sm text-muted-foreground border-t border-dashed">
                No leads yet.{" "}
                {isAuthenticated && (
                  <Link href="/leads"><span className="text-primary underline cursor-pointer">Add one</span></Link>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentLeads.map(lead => (
                  <li key={lead.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 font-bold text-blue-600 dark:text-blue-400 text-sm">
                      {lead.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Building2 size={10} />{lead.company}
                        {lead.city && <><MapPin size={10} className="ml-1" />{lead.city}</>}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <LeadBadge status={lead.status} />
                      <span className="text-[10px] text-muted-foreground">{relativeDate(lead.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Documents */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Documents</CardTitle>
              <Link href="/documents">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">
                  All documents <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentDocs.length === 0 ? (
              <div className="px-6 pb-6 text-center py-8 text-sm text-muted-foreground border-t border-dashed">
                No documents yet.{" "}
                {isAuthenticated && (
                  <Link href="/documents/new"><span className="text-primary underline cursor-pointer">Create one</span></Link>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentDocs.map(doc => {
                  const meta = DOC_STATUS_META[doc.status] ?? DOC_STATUS_META["Draft"];
                  return (
                    <li key={doc.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                        <FileText size={14} className="text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title || "Untitled Document"}</p>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <Users size={10} />{doc.clientName}
                          {doc.company && <><Building2 size={10} className="ml-1" />{doc.company}</>}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{relativeDate(doc.createdAt)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Add Customer dialog ────────────────────────────────────────────── */}
      <Dialog open={addCustomerOpen} onOpenChange={v => { setAddCustomerOpen(v); if (!v) quickCustomerForm.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck size={18} /> Add New Customer
            </DialogTitle>
            <DialogDescription>Quickly add a customer. More details can be filled in on the Customers page.</DialogDescription>
          </DialogHeader>
          <Form {...quickCustomerForm}>
            <form onSubmit={quickCustomerForm.handleSubmit(handleQuickAddCustomer)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={quickCustomerForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl><Input placeholder="Jane Smith" data-testid="input-customer-name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={quickCustomerForm.control} name="company" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company *</FormLabel>
                    <FormControl><Input placeholder="Acme Ltd" data-testid="input-customer-company" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={quickCustomerForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="jane@acme.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={quickCustomerForm.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="+44 7700 000000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={quickCustomerForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="Churned">Churned</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={quickCustomerForm.control} name="currency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code} {c.symbol}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={quickCustomerForm.control} name="totalValue" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Value</FormLabel>
                  <FormControl><Input placeholder="e.g. 50000" data-testid="input-customer-value" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={quickCustomerForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={2} className="resize-none" placeholder="Any initial notes..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="btn-save-quick-customer">Add Customer</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
