import React, { useState, useMemo } from "react";
import { useLeads, useSalesAgents } from "@/hooks/use-data";
import { CallLog, CallOutcome, LeadStatus } from "@/lib/store";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import {
  PhoneCall, PhoneOff, MessageSquare, PhoneMissed, Clock,
  ChevronDown, ChevronRight, BarChart3, Users, Calendar,
  Filter, Download, FileDown, Loader2, Flame, Star, Layers, Globe2,
  CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { generateLeadsReportPdf } from "./leads-report-pdf";

// ─── Constants ──────────────────────────────────────────────────────────────
type Range = "today" | "yesterday" | "7" | "14" | "30" | "90" | "custom";

const OUTCOMES: CallOutcome[] = ["Answered", "No Answer", "Voicemail", "Busy", "Scheduled Callback"];
const OUTCOME_META: Record<CallOutcome, { icon: React.ElementType; color: string; short: string }> = {
  Answered:             { icon: PhoneCall,     color: "text-emerald-600", short: "Ans"  },
  "No Answer":          { icon: PhoneOff,      color: "text-gray-500",    short: "N/A"  },
  Voicemail:            { icon: MessageSquare, color: "text-amber-600",   short: "VM"   },
  Busy:                 { icon: PhoneMissed,   color: "text-red-500",     short: "Busy" },
  "Scheduled Callback": { icon: Clock,         color: "text-blue-600",    short: "CB"   },
};

const TEMP_META: Record<string, { color: string; bar: string; dot: string }> = {
  Hot:   { color: "text-red-600",   bar: "bg-red-500",   dot: "🔴" },
  Warm:  { color: "text-amber-600", bar: "bg-amber-500", dot: "🟡" },
  Cold:  { color: "text-blue-600",  bar: "bg-blue-500",  dot: "🔵" },
  Unset: { color: "text-gray-400",  bar: "bg-gray-300",  dot: "⚪" },
};

const STATUS_COLOR: Record<string, string> = {
  New:                 "bg-blue-500",
  Contacted:           "bg-indigo-500",
  "Meeting Scheduled": "bg-sky-500",
  "Demo Completed":    "bg-cyan-500",
  Qualified:           "bg-teal-500",
  "Proposal Sent":     "bg-amber-500",
  Negotiation:         "bg-orange-500",
  Won:                 "bg-emerald-500",
  Lost:                "bg-red-500",
};

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface DayStat {
  date: string;
  leadsCreated: number;
  total: number;
  byOutcome: Record<CallOutcome, number>;
  callDetails: { leadName: string; leadCompany: string; agent: string; log: CallLog }[];
}
interface AgentStat {
  agent: string;
  total: number;
  byOutcome: Record<CallOutcome, number>;
}
interface CountRow { label: string; count: number }

function emptyByOutcome(): Record<CallOutcome, number> {
  return { Answered: 0, "No Answer": 0, Voicemail: 0, Busy: 0, "Scheduled Callback": 0 };
}
function pct(n: number, total: number) {
  if (!total) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function LeadsReportPage() {
  const { leads } = useLeads();
  const { agents } = useSalesAgents();

  const [range, setRange]             = useState<Range>("30");
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [pdfLoading, setPdfLoading]   = useState(false);

  // ── Date window ────────────────────────────────────────────────────────────
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    if (range === "today")     return { fromDate: today,              toDate: endOfDay(now) };
    if (range === "yesterday") return { fromDate: startOfDay(subDays(today, 1)), toDate: endOfDay(subDays(today, 1)) };
    if (range === "custom") {
      return {
        fromDate: customFrom ? startOfDay(parseISO(customFrom)) : subDays(today, 30),
        toDate:   customTo   ? endOfDay(parseISO(customTo))     : endOfDay(now),
      };
    }
    return { fromDate: subDays(today, parseInt(range, 10)), toDate: endOfDay(now) };
  }, [range, customFrom, customTo]);

  // ── Agent-filtered leads (for all widgets) ─────────────────────────────────
  const filteredLeads = useMemo(() =>
    agentFilter === "all" ? leads : leads.filter(l => l.assignedTo === agentFilter),
  [leads, agentFilter]);

  // ── Agent list ─────────────────────────────────────────────────────────────
  const agentNames = useMemo(() => {
    const names = new Set(leads.map(l => l.assignedTo).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [leads]);

  // ── Day stats (date-range filtered) ───────────────────────────────────────
  const { dayStats, agentStats, grandTotal } = useMemo(() => {
    const dayMap = new Map<string, DayStat>();
    const agtMap = new Map<string, AgentStat>();
    let grandTotal = 0;

    let cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const key = format(cursor, "yyyy-MM-dd");
      dayMap.set(key, { date: key, leadsCreated: 0, total: 0, byOutcome: emptyByOutcome(), callDetails: [] });
      cursor = new Date(cursor.getTime() + 86_400_000);
    }

    for (const lead of filteredLeads) {
      const d = lead.createdAt.slice(0, 10);
      if (dayMap.has(d)) dayMap.get(d)!.leadsCreated++;
    }

    for (const lead of filteredLeads) {
      if (!lead.callLogs?.length) continue;
      const agent = lead.assignedTo || "Unassigned";
      for (const log of lead.callLogs) {
        const d = log.date.slice(0, 10);
        if (!dayMap.has(d)) continue;
        const ds = dayMap.get(d)!;
        ds.total++;
        ds.byOutcome[log.outcome] = (ds.byOutcome[log.outcome] || 0) + 1;
        ds.callDetails.push({ leadName: lead.name, leadCompany: lead.company || "", agent, log });
        grandTotal++;
        if (!agtMap.has(agent)) agtMap.set(agent, { agent, total: 0, byOutcome: emptyByOutcome() });
        const as = agtMap.get(agent)!;
        as.total++;
        as.byOutcome[log.outcome] = (as.byOutcome[log.outcome] || 0) + 1;
      }
    }

    const dayStats   = Array.from(dayMap.values()).filter(d => d.total > 0 || d.leadsCreated > 0).sort((a, b) => b.date.localeCompare(a.date));
    const agentStats = Array.from(agtMap.values()).sort((a, b) => b.total - a.total);
    return { dayStats, agentStats, grandTotal };
  }, [filteredLeads, fromDate, toDate]);

  // ── Analytics widgets (all filteredLeads — current state snapshot) ─────────
  const tempStats = useMemo(() => {
    const c = { Hot: 0, Warm: 0, Cold: 0, Unset: 0 };
    for (const l of filteredLeads) l.temperature ? c[l.temperature]++ : c.Unset++;
    return c;
  }, [filteredLeads]);

  const relevanceStats = useMemo(() => {
    let yes = 0, no = 0, unset = 0;
    for (const l of filteredLeads) {
      if (l.isRelevant === true) yes++;
      else if (l.isRelevant === false) no++;
      else unset++;
    }
    return { yes, no, unset, total: filteredLeads.length };
  }, [filteredLeads]);

  const statusStats: CountRow[] = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filteredLeads) m.set(l.status, (m.get(l.status) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  }, [filteredLeads]);

  const sourceStats: CountRow[] = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filteredLeads) {
      const src = l.source?.trim() || "Unknown";
      m.set(src, (m.get(src) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  }, [filteredLeads]);

  // ── Derived KPIs ───────────────────────────────────────────────────────────
  const today         = format(new Date(), "yyyy-MM-dd");
  const todayStat     = dayStats.find(d => d.date === today);
  const totalAnswered = agentStats.reduce((s, a) => s + a.byOutcome.Answered, 0);
  const answerRate    = grandTotal ? Math.round((totalAnswered / grandTotal) * 100) : 0;

  // ── Toggle expand ──────────────────────────────────────────────────────────
  const toggle = (date: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  // ── PDF ───────────────────────────────────────────────────────────────────
  const handlePrintPdf = async () => {
    setPdfLoading(true);
    try {
      const rangeLabel = range === "today" ? "Today"
        : range === "yesterday" ? "Yesterday"
        : range === "custom" ? `${customFrom || "—"} → ${customTo || "—"}`
        : `Last ${range} days`;
      await generateLeadsReportPdf({
        dayStats, agentStats, grandTotal, totalAnswered, answerRate,
        totalLeadsCreated: dayStats.reduce((s, d) => s + d.leadsCreated, 0),
        todayCalls: todayStat?.total ?? 0,
        agentFilter, rangeLabel,
        generatedAt: format(new Date(), "dd MMM yyyy, HH:mm"),
        tempStats,
        relevanceStats,
        statusStats,
        sourceStats,
        totalLeads: filteredLeads.length,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  // ── CSV ───────────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows = [
      ["Date", "Leads Created", "Total Calls", "Answered", "No Answer", "Voicemail", "Busy", "Callback"],
      ...dayStats.map(d => [d.date, d.leadsCreated, d.total, d.byOutcome.Answered, d.byOutcome["No Answer"], d.byOutcome.Voicemail, d.byOutcome.Busy, d.byOutcome["Scheduled Callback"]]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `leads-report-${today}.csv`;
    a.click();
  };

  const rangeLabel = range === "today" ? "Today"
    : range === "yesterday" ? "Yesterday"
    : range === "custom" ? `${customFrom || "—"} → ${customTo || "—"}`
    : `Last ${range} days`;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Leads Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daily call activity, lead analytics & pipeline breakdown
            {agentFilter !== "all" && <span className="ml-2 font-semibold text-primary">· {agentFilter}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={handlePrintPdf} disabled={pdfLoading} className="gap-1.5">
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {pdfLoading ? "Generating…" : "Print PDF"}
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-border bg-muted/30">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Agent</label>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All Agents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agentNames.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Period</label>
          <Select value={range} onValueChange={v => setRange(v as Range)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {range === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">From</label>
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 text-sm w-36" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">To</label>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 text-sm w-36" />
            </div>
          </>
        )}
      </div>

      {/* ── Call KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Total Calls"     value={grandTotal}                icon={PhoneCall} color="text-primary"      bg="bg-primary/10" />
        <KpiCard label="Today's Calls"   value={todayStat?.total ?? 0}     icon={Calendar}  color="text-sky-600"      bg="bg-sky-100 dark:bg-sky-950/40" />
        <KpiCard label="Answered"        value={totalAnswered}             icon={PhoneCall} color="text-emerald-600"  bg="bg-emerald-100 dark:bg-emerald-950/40" sub={`${answerRate}% rate`} />
        <KpiCard label="Leads in System" value={filteredLeads.length}      icon={Users}     color="text-violet-600"   bg="bg-violet-100 dark:bg-violet-950/40" />
      </div>

      {/* ── Analytics Widgets: Temperature · Relevance · Status · Source ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* Temperature */}
        <AnalyticsCard title="Temperature" icon={Flame} iconColor="text-red-500" total={filteredLeads.length}>
          {(["Hot", "Warm", "Cold", "Unset"] as const).map(t => (
            <BarRow
              key={t}
              label={<span>{TEMP_META[t].dot} {t}</span>}
              count={tempStats[t]}
              total={filteredLeads.length}
              barClass={TEMP_META[t].bar}
              textClass={TEMP_META[t].color}
            />
          ))}
        </AnalyticsCard>

        {/* Relevance */}
        <AnalyticsCard title="Relevance" icon={Star} iconColor="text-amber-500" total={filteredLeads.length}>
          <BarRow
            label={<span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Relevant</span>}
            count={relevanceStats.yes}
            total={filteredLeads.length}
            barClass="bg-emerald-500"
            textClass="text-emerald-600"
          />
          <BarRow
            label={<span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-500" /> Not Relevant</span>}
            count={relevanceStats.no}
            total={filteredLeads.length}
            barClass="bg-red-500"
            textClass="text-red-600"
          />
          <BarRow
            label={<span className="text-muted-foreground">⚪ Not Set</span>}
            count={relevanceStats.unset}
            total={filteredLeads.length}
            barClass="bg-gray-300"
            textClass="text-gray-400"
          />
          {/* Big relevance % badge */}
          {filteredLeads.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Relevance rate</span>
              <span className={`text-sm font-bold ${relevanceStats.yes / filteredLeads.length >= 0.5 ? "text-emerald-600" : "text-amber-600"}`}>
                {Math.round((relevanceStats.yes / filteredLeads.length) * 100)}%
              </span>
            </div>
          )}
        </AnalyticsCard>

        {/* Pipeline Status */}
        <AnalyticsCard title="Pipeline Status" icon={Layers} iconColor="text-sky-500" total={filteredLeads.length}>
          {statusStats.length === 0
            ? <p className="text-xs text-muted-foreground py-4 text-center">No leads</p>
            : statusStats.map(({ label, count }) => (
                <BarRow
                  key={label}
                  label={<span className="text-xs">{label}</span>}
                  count={count}
                  total={filteredLeads.length}
                  barClass={STATUS_COLOR[label] ?? "bg-primary"}
                  textClass="text-foreground"
                />
              ))
          }
        </AnalyticsCard>

        {/* Source */}
        <AnalyticsCard title="Lead Source" icon={Globe2} iconColor="text-indigo-500" total={filteredLeads.length}>
          {sourceStats.length === 0
            ? <p className="text-xs text-muted-foreground py-4 text-center">No leads</p>
            : sourceStats.map(({ label, count }) => (
                <BarRow
                  key={label}
                  label={<span className="text-xs">{label}</span>}
                  count={count}
                  total={filteredLeads.length}
                  barClass="bg-indigo-500"
                  textClass="text-foreground"
                />
              ))
          }
        </AnalyticsCard>
      </div>

      {/* ── Agent Performance ── */}
      {agentStats.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">Agent Performance</span>
            <span className="text-xs text-muted-foreground ml-1">{rangeLabel}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Agent</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Total</th>
                  {OUTCOMES.map(o => (
                    <th key={o} className="text-center px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">
                      <span className={OUTCOME_META[o].color}>{OUTCOME_META[o].short}</span>
                    </th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Ans%</th>
                </tr>
              </thead>
              <tbody>
                {agentStats.map((a, i) => (
                  <tr key={a.agent} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                          {a.agent.charAt(0).toUpperCase()}
                        </span>
                        {a.agent}
                      </div>
                    </td>
                    <td className="text-center px-3 py-2.5 font-semibold text-foreground">{a.total}</td>
                    {OUTCOMES.map(o => (
                      <td key={o} className="text-center px-3 py-2.5">
                        <span className={a.byOutcome[o] ? OUTCOME_META[o].color : "text-muted-foreground/40"}>
                          {a.byOutcome[o] || "—"}
                        </span>
                      </td>
                    ))}
                    <td className="text-center px-3 py-2.5 font-medium">
                      <span className={a.byOutcome.Answered / a.total >= 0.5 ? "text-emerald-600" : "text-amber-600"}>
                        {pct(a.byOutcome.Answered, a.total)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Day-by-Day Table ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm text-foreground">Daily Breakdown</span>
          <span className="ml-auto text-xs text-muted-foreground">Click a row to see call details</span>
        </div>

        {dayStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <PhoneCall className="h-8 w-8 opacity-30" />
            <p className="text-sm">No call activity in this period</p>
            <p className="text-xs">Log calls from the Leads page to see data here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="w-6 px-3 py-2.5"></th>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Date</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Leads In</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Total Calls</th>
                  {OUTCOMES.map(o => (
                    <th key={o} className="text-center px-3 py-2.5 font-semibold text-xs uppercase tracking-wide min-w-[70px]">
                      <div className="flex flex-col items-center gap-0.5">
                        {React.createElement(OUTCOME_META[o].icon, { className: `h-3.5 w-3.5 ${OUTCOME_META[o].color}` })}
                        <span className={`text-[10px] ${OUTCOME_META[o].color}`}>{OUTCOME_META[o].short}</span>
                      </div>
                    </th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Ans%</th>
                </tr>
              </thead>
              <tbody>
                {dayStats.map((d, i) => {
                  const isToday = d.date === today;
                  const isOpen  = expanded.has(d.date);
                  return (
                    <React.Fragment key={d.date}>
                      <tr
                        className={`border-b border-border cursor-pointer transition-colors
                          ${isToday ? "bg-primary/5 hover:bg-primary/10" : i % 2 === 0 ? "hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/30"}
                          ${isOpen ? "border-b-0" : ""}`}
                        onClick={() => toggle(d.date)}
                      >
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {isToday && <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">TODAY</span>}
                            <span>{format(parseISO(d.date), "EEE, dd MMM yyyy")}</span>
                          </div>
                        </td>
                        <td className="text-center px-3 py-2.5">
                          {d.leadsCreated > 0
                            ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-xs font-bold">{d.leadsCreated}</span>
                            : <span className="text-muted-foreground/40 text-xs">—</span>}
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <span className="font-bold text-foreground">{d.total || "—"}</span>
                        </td>
                        {OUTCOMES.map(o => (
                          <td key={o} className="text-center px-3 py-2.5">
                            {d.byOutcome[o]
                              ? <span className={`font-semibold ${OUTCOME_META[o].color}`}>{d.byOutcome[o]}</span>
                              : <span className="text-muted-foreground/30 text-xs">—</span>}
                          </td>
                        ))}
                        <td className="text-center px-3 py-2.5 font-medium text-xs">
                          {d.total > 0
                            ? <span className={d.byOutcome.Answered / d.total >= 0.5 ? "text-emerald-600" : "text-amber-600"}>{pct(d.byOutcome.Answered, d.total)}</span>
                            : "—"}
                        </td>
                      </tr>

                      {isOpen && d.callDetails.length > 0 && (
                        <tr className="border-b border-border">
                          <td colSpan={9} className="p-0">
                            <div className="bg-muted/20 border-t border-dashed border-border px-6 py-3">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                                Call Log — {format(parseISO(d.date), "dd MMM yyyy")}
                              </p>
                              <div className="space-y-1.5">
                                {d.callDetails.map((c, ci) => {
                                  const Meta = OUTCOME_META[c.log.outcome];
                                  return (
                                    <div key={ci} className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                                      <div className={`flex items-center gap-1 font-semibold min-w-[130px] ${Meta.color}`}>
                                        {React.createElement(Meta.icon, { className: "h-3.5 w-3.5 shrink-0" })}
                                        {c.log.outcome}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <span className="font-medium text-foreground">{c.leadName}</span>
                                        {c.leadCompany && <span className="text-muted-foreground ml-1.5">· {c.leadCompany}</span>}
                                        {c.log.notes && <p className="text-muted-foreground text-xs mt-0.5 truncate">{c.log.notes}</p>}
                                      </div>
                                      {c.log.duration && <span className="text-xs text-muted-foreground whitespace-nowrap">{c.log.duration}</span>}
                                      {agentFilter === "all" && (
                                        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">{c.agent}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {dayStats.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td className="px-3 py-2.5"></td>
                    <td className="px-4 py-2.5 font-bold text-foreground text-xs uppercase tracking-wide">Totals ({dayStats.length} days)</td>
                    <td className="text-center px-3 py-2.5 font-bold text-violet-700">{dayStats.reduce((s, d) => s + d.leadsCreated, 0)}</td>
                    <td className="text-center px-3 py-2.5 font-bold text-foreground">{grandTotal}</td>
                    {OUTCOMES.map(o => (
                      <td key={o} className={`text-center px-3 py-2.5 font-bold ${OUTCOME_META[o].color}`}>
                        {dayStats.reduce((s, d) => s + d.byOutcome[o], 0) || "—"}
                      </td>
                    ))}
                    <td className="text-center px-3 py-2.5 font-bold">
                      <span className={answerRate >= 50 ? "text-emerald-600" : "text-amber-600"}>{pct(totalAnswered, grandTotal)}</span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: number; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Analytics Card wrapper ────────────────────────────────────────────────────
function AnalyticsCard({ title, icon: Icon, iconColor, total, children }: {
  title: string; icon: React.ElementType; iconColor: string; total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="font-semibold text-sm text-foreground">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">{total} leads</span>
      </div>
      <div className="px-4 py-3 space-y-2.5">{children}</div>
    </div>
  );
}

// ─── Bar Row ──────────────────────────────────────────────────────────────────
function BarRow({ label, count, total, barClass, textClass }: {
  label: React.ReactNode; count: number; total: number; barClass: string; textClass: string;
}) {
  const pctNum = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium flex items-center gap-1 ${textClass}`}>{label}</span>
        <span className="text-xs font-bold text-foreground tabular-nums">
          {count} <span className="text-muted-foreground font-normal">({pctNum}%)</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pctNum}%` }} />
      </div>
    </div>
  );
}
