import React from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { CallOutcome } from "@/lib/store";
import { format, parseISO } from "date-fns";

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface DayStatPdf {
  date: string;
  leadsCreated: number;
  total: number;
  byOutcome: Record<CallOutcome, number>;
  callDetails: {
    leadName: string; leadCompany: string; agent: string;
    log: { outcome: CallOutcome; duration?: string; notes: string };
  }[];
}

export interface AgentStatPdf {
  agent: string;
  total: number;
  byOutcome: Record<CallOutcome, number>;
}

export interface CountRowPdf { label: string; count: number }

export interface LeadsReportPdfProps {
  dayStats:          DayStatPdf[];
  agentStats:        AgentStatPdf[];
  grandTotal:        number;
  totalAnswered:     number;
  answerRate:        number;
  totalLeadsCreated: number;
  todayCalls:        number;
  agentFilter:       string;
  rangeLabel:        string;
  generatedAt:       string;
  companyName?:      string;
  totalLeads:        number;
  tempStats:         { Hot: number; Warm: number; Cold: number; Unset: number };
  relevanceStats:    { yes: number; no: number; unset: number; total: number };
  statusStats:       CountRowPdf[];
  sourceStats:       CountRowPdf[];
}

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  primary:  "#2563eb", secondary: "#64748b",
  success:  "#16a34a", warning: "#d97706", danger: "#dc2626",
  bg:       "#f8fafc", border: "#e2e8f0",
  text:     "#0f172a", muted: "#64748b", white: "#ffffff",
  rowAlt:   "#f1f5f9", accent: "#eff6ff",
  hot: "#ef4444", warm: "#f59e0b", cold: "#3b82f6",
  indigo: "#6366f1",
};

const OUTCOMES: CallOutcome[] = ["Answered", "No Answer", "Voicemail", "Busy", "Scheduled Callback"];

const STATUS_HEX: Record<string, string> = {
  New: "#3b82f6", Contacted: "#6366f1", "Meeting Scheduled": "#0ea5e9",
  "Demo Completed": "#06b6d4", Qualified: "#14b8a6", "Proposal Sent": "#f59e0b",
  Negotiation: "#f97316", Won: "#22c55e", Lost: "#ef4444",
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica", backgroundColor: C.white,
    paddingTop: 30, paddingBottom: 40, paddingHorizontal: 32,
    fontSize: 9, color: C.text,
  },
  // Header
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 18, paddingBottom: 12,
    borderBottomWidth: 2, borderBottomColor: C.primary,
  },
  brandName:   { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.primary, letterSpacing: 0.4 },
  reportTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.text, marginTop: 3 },
  reportSub:   { fontSize: 8,  color: C.muted, marginTop: 2 },
  metaLine:    { fontSize: 7.5, color: C.muted, marginBottom: 2 },
  metaVal:     { fontFamily: "Helvetica-Bold", color: C.text },
  // KPI
  kpiRow:   { flexDirection: "row", gap: 8, marginBottom: 14 },
  kpiCard:  { flex: 1, backgroundColor: C.bg, borderRadius: 6, padding: 9, borderWidth: 1, borderColor: C.border },
  kpiLabel: { fontSize: 7, color: C.muted, marginBottom: 2, textTransform: "uppercase" },
  kpiVal:   { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.primary },
  kpiSub:   { fontSize: 7, color: C.muted, marginTop: 1 },
  // Analytics 2×2 grid
  analyticsGrid:    { flexDirection: "row", gap: 8, marginBottom: 14 },
  analyticsCard:    { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, overflow: "hidden" },
  analyticsHead:    { backgroundColor: C.primary, paddingVertical: 5, paddingHorizontal: 8 },
  analyticsTitle:   { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.white, textTransform: "uppercase", letterSpacing: 0.3 },
  analyticsBody:    { padding: 8, gap: 5 },
  barRowLabel:      { fontSize: 7.5, color: C.text, flex: 1 },
  barRowCount:      { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.text, width: 30, textAlign: "right" },
  barRowPct:        { fontSize: 7, color: C.muted, width: 28, textAlign: "right" },
  barBg:            { height: 4, backgroundColor: "#e2e8f0", borderRadius: 2, marginTop: 2 },
  barFill:          { height: 4, borderRadius: 2 },
  barRowWrap:       { marginBottom: 4 },
  barRowTop:        { flexDirection: "row", alignItems: "center" },
  divider:          { borderTopWidth: 0.5, borderTopColor: C.border, marginVertical: 4 },
  // Tables
  table:   { width: "100%", marginBottom: 14 },
  secTitle: {
    fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.text, marginBottom: 5,
    textTransform: "uppercase", letterSpacing: 0.4,
    paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  thead:   { flexDirection: "row", backgroundColor: C.primary, borderRadius: 4 },
  th:      { fontFamily: "Helvetica-Bold", color: C.white, fontSize: 7.5, paddingVertical: 5, paddingHorizontal: 3, textAlign: "center" },
  thL:     { textAlign: "left" },
  tr:      { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  trAlt:   { backgroundColor: C.rowAlt },
  trToday: { backgroundColor: C.accent },
  trTotal: { flexDirection: "row", backgroundColor: C.accent, borderTopWidth: 1.5, borderTopColor: C.primary },
  td:      { fontSize: 8, paddingVertical: 4, paddingHorizontal: 3, textAlign: "center", color: C.text },
  tdL:     { textAlign: "left" },
  tdB:     { fontFamily: "Helvetica-Bold" },
  tdG:     { color: C.success, fontFamily: "Helvetica-Bold" },
  tdM:     { color: C.muted },
  tdP:     { color: C.primary, fontFamily: "Helvetica-Bold" },
  tdW:     { color: C.warning },
  // Detail sub-rows
  detail:     { marginBottom: 1, backgroundColor: "#f8fafc", borderRadius: 3, padding: 4, borderLeftWidth: 2, borderLeftColor: C.primary, marginTop: 2 },
  detailText: { fontSize: 7.5, color: C.muted },
  detailBold: { fontFamily: "Helvetica-Bold", color: C.text },
  // Footer
  footer: {
    position: "absolute", bottom: 18, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: C.border, paddingTop: 5,
  },
  footerText: { fontSize: 7, color: C.muted },
});

// ─── Column widths ────────────────────────────────────────────────────────────
const AW = { name: "22%", total: "10%", out: "11%", rate: "10%" };
const DW = { date: "17%", leads: "9%", total: "9%", out: "10%", rate: "8%" };

function pct(n: number, d: number) { return d ? `${Math.round((n / d) * 100)}%` : "—"; }
function fmtD(iso: string) { try { return format(parseISO(iso), "EEE, dd MMM yyyy"); } catch { return iso; } }

// ─── Reusable bar row ─────────────────────────────────────────────────────────
function PdfBarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const p = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={s.barRowWrap}>
      <View style={s.barRowTop}>
        <Text style={s.barRowLabel}>{label}</Text>
        <Text style={s.barRowCount}>{count}</Text>
        <Text style={s.barRowPct}>{p}%</Text>
      </View>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${p}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Main document ────────────────────────────────────────────────────────────
export function LeadsReportDocument({
  dayStats, agentStats, grandTotal, totalAnswered, answerRate,
  totalLeadsCreated, todayCalls, agentFilter, rangeLabel, generatedAt,
  companyName = "Onesoft", totalLeads,
  tempStats, relevanceStats, statusStats, sourceStats,
}: LeadsReportPdfProps) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Document title="Leads Report" author={companyName} creator={companyName}>
      <Page size="A4" orientation="landscape" style={s.page} wrap>

        {/* ── Header ── */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.brandName}>{companyName}</Text>
            <Text style={s.reportTitle}>Leads Report</Text>
            <Text style={s.reportSub}>
              {agentFilter !== "all" ? `Agent: ${agentFilter}  ·  ` : ""}{rangeLabel}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.metaLine}>Generated: <Text style={s.metaVal}>{generatedAt}</Text></Text>
            <Text style={s.metaLine}>Total calls: <Text style={s.metaVal}>{grandTotal}</Text></Text>
            <Text style={s.metaLine}>Answer rate: <Text style={s.metaVal}>{answerRate}%</Text></Text>
          </View>
        </View>

        {/* ── Call KPIs ── */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Total Calls</Text>
            <Text style={s.kpiVal}>{grandTotal}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Today's Calls</Text>
            <Text style={s.kpiVal}>{todayCalls}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Answered</Text>
            <Text style={[s.kpiVal, { color: C.success }]}>{totalAnswered}</Text>
            <Text style={s.kpiSub}>{answerRate}% answer rate</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Leads in System</Text>
            <Text style={[s.kpiVal, { color: "#7c3aed" }]}>{totalLeads}</Text>
          </View>
        </View>

        {/* ── Analytics 2x2 ── */}
        <View style={s.analyticsGrid}>

          {/* Temperature */}
          <View style={s.analyticsCard}>
            <View style={s.analyticsHead}>
              <Text style={s.analyticsTitle}>TEMPERATURE  ({totalLeads} leads)</Text>
            </View>
            <View style={s.analyticsBody}>
              <PdfBarRow label="Hot"   count={tempStats.Hot}   total={totalLeads} color={C.hot}  />
              <PdfBarRow label="Warm"  count={tempStats.Warm}  total={totalLeads} color={C.warm} />
              <PdfBarRow label="Cold"  count={tempStats.Cold}  total={totalLeads} color={C.cold} />
              <PdfBarRow label="Unset" count={tempStats.Unset} total={totalLeads} color="#9ca3af" />
            </View>
          </View>

          {/* Relevance */}
          <View style={s.analyticsCard}>
            <View style={s.analyticsHead}>
              <Text style={s.analyticsTitle}>RELEVANCE  ({totalLeads} leads)</Text>
            </View>
            <View style={s.analyticsBody}>
              <PdfBarRow label="Relevant"     count={relevanceStats.yes}   total={totalLeads} color={C.success} />
              <PdfBarRow label="Not Relevant" count={relevanceStats.no}    total={totalLeads} color={C.danger}  />
              <PdfBarRow label="Not Set"      count={relevanceStats.unset} total={totalLeads} color="#9ca3af"   />
              <View style={s.divider} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 7.5, color: C.muted }}>Relevance rate</Text>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold",
                  color: relevanceStats.yes / Math.max(totalLeads, 1) >= 0.5 ? C.success : C.warning }}>
                  {pct(relevanceStats.yes, totalLeads)}
                </Text>
              </View>
            </View>
          </View>

          {/* Pipeline Status */}
          <View style={s.analyticsCard}>
            <View style={s.analyticsHead}>
              <Text style={s.analyticsTitle}>PIPELINE STATUS  ({totalLeads} leads)</Text>
            </View>
            <View style={s.analyticsBody}>
              {statusStats.slice(0, 8).map(({ label, count }) => (
                <PdfBarRow key={label} label={label} count={count} total={totalLeads} color={STATUS_HEX[label] ?? C.primary} />
              ))}
            </View>
          </View>

          {/* Source */}
          <View style={s.analyticsCard}>
            <View style={s.analyticsHead}>
              <Text style={s.analyticsTitle}>LEAD SOURCE  ({totalLeads} leads)</Text>
            </View>
            <View style={s.analyticsBody}>
              {sourceStats.slice(0, 8).map(({ label, count }) => (
                <PdfBarRow key={label} label={label} count={count} total={totalLeads} color={C.indigo} />
              ))}
            </View>
          </View>
        </View>

        {/* ── Agent Performance ── */}
        {agentStats.length > 0 && (
          <View style={s.table}>
            <Text style={s.secTitle}>Agent Performance — Calls</Text>
            <View style={s.thead}>
              <Text style={[s.th, s.thL, { width: AW.name }]}>Agent</Text>
              <Text style={[s.th, { width: AW.total }]}>Total</Text>
              {OUTCOMES.map(o => (
                <Text key={o} style={[s.th, { width: AW.out }]}>
                  {o === "Scheduled Callback" ? "Callback" : o === "No Answer" ? "No Ans" : o}
                </Text>
              ))}
              <Text style={[s.th, { width: AW.rate }]}>Ans%</Text>
            </View>
            {agentStats.map((a, i) => (
              <View key={a.agent} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]}>
                <Text style={[s.td, s.tdL, s.tdB, { width: AW.name }]}>{a.agent}</Text>
                <Text style={[s.td, s.tdB, { width: AW.total }]}>{a.total}</Text>
                {OUTCOMES.map(o => (
                  <Text key={o} style={[s.td, { width: AW.out }, o === "Answered" && a.byOutcome[o] > 0 ? s.tdG : s.tdM]}>
                    {a.byOutcome[o] || "—"}
                  </Text>
                ))}
                <Text style={[s.td, { width: AW.rate },
                  a.byOutcome.Answered / Math.max(a.total, 1) >= 0.5 ? s.tdG : s.tdW]}>
                  {pct(a.byOutcome.Answered, a.total)}
                </Text>
              </View>
            ))}
            <View style={s.trTotal}>
              <Text style={[s.td, s.tdL, s.tdB, { width: AW.name }]}>TOTAL ({agentStats.length} agents)</Text>
              <Text style={[s.td, s.tdB, s.tdP, { width: AW.total }]}>{grandTotal}</Text>
              {OUTCOMES.map(o => (
                <Text key={o} style={[s.td, s.tdB, { width: AW.out }]}>
                  {agentStats.reduce((sum, a) => sum + a.byOutcome[o], 0) || "—"}
                </Text>
              ))}
              <Text style={[s.td, s.tdB, s.tdG, { width: AW.rate }]}>{pct(totalAnswered, grandTotal)}</Text>
            </View>
          </View>
        )}

        {/* ── Daily Breakdown ── */}
        <View style={s.table}>
          <Text style={s.secTitle}>Daily Breakdown ({dayStats.length} days with activity)</Text>
          <View style={s.thead}>
            <Text style={[s.th, s.thL, { width: DW.date }]}>Date</Text>
            <Text style={[s.th, { width: DW.leads }]}>Leads In</Text>
            <Text style={[s.th, { width: DW.total }]}>Calls</Text>
            {OUTCOMES.map(o => (
              <Text key={o} style={[s.th, { width: DW.out }]}>
                {o === "Scheduled Callback" ? "Callback" : o === "No Answer" ? "No Ans" : o}
              </Text>
            ))}
            <Text style={[s.th, { width: DW.rate }]}>Ans%</Text>
          </View>
          {dayStats.map((d, i) => (
            <View key={d.date} wrap={false}>
              <View style={[s.tr, i % 2 === 1 ? s.trAlt : {}, d.date === today ? s.trToday : {}]}>
                <Text style={[s.td, s.tdL, s.tdB, { width: DW.date }]}>
                  {d.date === today ? "TODAY  " : ""}{fmtD(d.date)}
                </Text>
                <Text style={[s.td, { width: DW.leads },
                  d.leadsCreated > 0 ? { color: "#7c3aed", fontFamily: "Helvetica-Bold" } : s.tdM]}>
                  {d.leadsCreated || "—"}
                </Text>
                <Text style={[s.td, s.tdB, { width: DW.total }]}>{d.total || "—"}</Text>
                {OUTCOMES.map(o => (
                  <Text key={o} style={[s.td, { width: DW.out },
                    o === "Answered" && d.byOutcome[o] > 0 ? s.tdG : d.byOutcome[o] > 0 ? {} : s.tdM]}>
                    {d.byOutcome[o] || "—"}
                  </Text>
                ))}
                <Text style={[s.td, { width: DW.rate },
                  d.total > 0 ? d.byOutcome.Answered / d.total >= 0.5 ? s.tdG : s.tdW : s.tdM]}>
                  {d.total > 0 ? pct(d.byOutcome.Answered, d.total) : "—"}
                </Text>
              </View>
              {d.callDetails.map((c, ci) => (
                <View key={ci} style={s.detail}>
                  <Text style={s.detailText}>
                    <Text style={s.detailBold}>{c.log.outcome}</Text>
                    {"   "}
                    <Text style={s.detailBold}>{c.leadName}</Text>
                    {c.leadCompany ? `  ·  ${c.leadCompany}` : ""}
                    {c.log.duration ? `  ·  ${c.log.duration}` : ""}
                    {agentFilter === "all" ? `  ·  ${c.agent}` : ""}
                    {c.log.notes ? `\n${c.log.notes}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          ))}
          {dayStats.length > 1 && (
            <View style={s.trTotal}>
              <Text style={[s.td, s.tdL, s.tdB, { width: DW.date }]}>TOTALS ({dayStats.length} days)</Text>
              <Text style={[s.td, { color: "#7c3aed", fontFamily: "Helvetica-Bold" }, { width: DW.leads }]}>
                {dayStats.reduce((sum, d) => sum + d.leadsCreated, 0)}
              </Text>
              <Text style={[s.td, s.tdB, s.tdP, { width: DW.total }]}>{grandTotal}</Text>
              {OUTCOMES.map(o => (
                <Text key={o} style={[s.td, s.tdB, { width: DW.out }]}>
                  {dayStats.reduce((sum, d) => sum + d.byOutcome[o], 0) || "—"}
                </Text>
              ))}
              <Text style={[s.td, s.tdB, s.tdG, { width: DW.rate }]}>{pct(totalAnswered, grandTotal)}</Text>
            </View>
          )}
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {companyName}  ·  Leads Report  ·  {rangeLabel}
            {agentFilter !== "all" ? `  ·  Agent: ${agentFilter}` : ""}
          </Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ─── Trigger: renders PDF and downloads directly ─────────────────────────────
export async function generateLeadsReportPdf(props: LeadsReportPdfProps): Promise<void> {
  const blob     = await pdf(<LeadsReportDocument {...props} />).toBlob();
  const url      = URL.createObjectURL(blob);
  const filename = `leads-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  const a        = document.createElement("a");
  a.href         = url;
  a.download     = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
