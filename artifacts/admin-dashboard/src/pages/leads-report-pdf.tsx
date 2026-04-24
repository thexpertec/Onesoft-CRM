import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Font, pdf,
} from "@react-pdf/renderer";
import { CallOutcome } from "@/lib/store";
import { format, parseISO } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────
export interface DayStatPdf {
  date: string;
  leadsCreated: number;
  total: number;
  byOutcome: Record<CallOutcome, number>;
  callDetails: {
    leadName: string;
    leadCompany: string;
    agent: string;
    log: { outcome: CallOutcome; duration?: string; notes: string };
  }[];
}

export interface AgentStatPdf {
  agent: string;
  total: number;
  byOutcome: Record<CallOutcome, number>;
}

export interface LeadsReportPdfProps {
  dayStats: DayStatPdf[];
  agentStats: AgentStatPdf[];
  grandTotal: number;
  totalAnswered: number;
  answerRate: number;
  totalLeadsCreated: number;
  todayCalls: number;
  agentFilter: string;
  rangeLabel: string;
  generatedAt: string;
  companyName?: string;
}

const OUTCOMES: CallOutcome[] = [
  "Answered", "No Answer", "Voicemail", "Busy", "Scheduled Callback",
];

// ─── Styles ────────────────────────────────────────────────────────────────
const C = {
  primary:   "#2563eb",
  secondary: "#64748b",
  success:   "#16a34a",
  warning:   "#d97706",
  danger:    "#dc2626",
  bg:        "#f8fafc",
  border:    "#e2e8f0",
  text:      "#0f172a",
  muted:     "#64748b",
  white:     "#ffffff",
  rowAlt:    "#f1f5f9",
  accent:    "#eff6ff",
};

const s = StyleSheet.create({
  page: {
    fontFamily:      "Helvetica",
    backgroundColor: C.white,
    paddingTop:      32,
    paddingBottom:   40,
    paddingHorizontal: 36,
    fontSize:        9,
    color:           C.text,
  },

  /* Header */
  header: {
    flexDirection:   "row",
    justifyContent:  "space-between",
    alignItems:      "flex-start",
    marginBottom:    20,
    paddingBottom:   14,
    borderBottomWidth: 2,
    borderBottomColor: C.primary,
  },
  headerLeft: { flexDirection: "column" },
  brandName: {
    fontSize: 18, fontFamily: "Helvetica-Bold",
    color: C.primary, letterSpacing: 0.5,
  },
  reportTitle: {
    fontSize: 11, fontFamily: "Helvetica-Bold",
    color: C.text, marginTop: 3,
  },
  reportSub: { fontSize: 8, color: C.muted, marginTop: 2 },
  headerRight: { flexDirection: "column", alignItems: "flex-end" },
  metaLine: { fontSize: 7.5, color: C.muted, marginBottom: 2 },
  metaValue: { fontFamily: "Helvetica-Bold", color: C.text },

  /* KPI row */
  kpiRow: {
    flexDirection: "row", gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1, backgroundColor: C.bg,
    borderRadius: 6, padding: 10,
    borderWidth: 1, borderColor: C.border,
  },
  kpiLabel: { fontSize: 7, color: C.muted, marginBottom: 3, textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.primary },
  kpiSub:   { fontSize: 7, color: C.muted, marginTop: 2 },

  /* Section headers */
  sectionTitle: {
    fontSize: 9, fontFamily: "Helvetica-Bold",
    color: C.text, marginBottom: 6,
    textTransform: "uppercase", letterSpacing: 0.4,
    paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },

  /* Table */
  table:     { width: "100%", marginBottom: 16 },
  thead:     { flexDirection: "row", backgroundColor: C.primary, borderRadius: 4 },
  th: {
    fontFamily: "Helvetica-Bold", color: C.white,
    fontSize: 7.5, paddingVertical: 5, paddingHorizontal: 4,
    textAlign: "center",
  },
  thLeft:  { textAlign: "left" },
  tr:      { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  trAlt:   { backgroundColor: C.rowAlt },
  trTotal: { flexDirection: "row", backgroundColor: C.accent, borderTopWidth: 1.5, borderTopColor: C.primary },
  td: {
    fontSize: 8, paddingVertical: 4.5,
    paddingHorizontal: 4, textAlign: "center",
    color: C.text,
  },
  tdLeft:  { textAlign: "left" },
  tdBold:  { fontFamily: "Helvetica-Bold" },
  tdGreen: { color: C.success, fontFamily: "Helvetica-Bold" },
  tdMuted: { color: C.muted },
  tdPrimary: { color: C.primary, fontFamily: "Helvetica-Bold" },

  /* Detail sub-rows */
  detail: {
    marginLeft: 0, marginBottom: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 3, padding: 5,
    borderLeftWidth: 2, borderLeftColor: C.primary,
    marginTop: 2,
  },
  detailText: { fontSize: 7.5, color: C.muted },
  detailBold: { fontFamily: "Helvetica-Bold", color: C.text },

  /* Footer */
  footer: {
    position: "absolute", bottom: 20, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: C.border,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: C.muted },
  pageNum: {
    fontSize: 7, color: C.muted,
    render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
      `Page ${pageNumber} of ${totalPages}`,
  },
});

// ─── Column widths — Agent table ──────────────────────────────────────────
const AW = { name: "22%", total: "10%", outcome: "12%", rate: "10%" };
// ─── Column widths — Day table ────────────────────────────────────────────
const DW = { date: "18%", leads: "9%", total: "10%", outcome: "11%", rate: "8%" };

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function fmtDate(iso: string) {
  try { return format(parseISO(iso), "EEE, dd MMM yyyy"); }
  catch { return iso; }
}

// ─── Document ──────────────────────────────────────────────────────────────
export function LeadsReportDocument({
  dayStats, agentStats, grandTotal, totalAnswered, answerRate,
  totalLeadsCreated, todayCalls, agentFilter, rangeLabel,
  generatedAt, companyName = "Onesoft",
}: LeadsReportPdfProps) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Document title="Leads Report" author={companyName} creator={companyName}>
      <Page size="A4" orientation="landscape" style={s.page} wrap>

        {/* ── Header ── */}
        <View style={s.header} fixed>
          <View style={s.headerLeft}>
            <Text style={s.brandName}>{companyName}</Text>
            <Text style={s.reportTitle}>Leads Report</Text>
            <Text style={s.reportSub}>
              {agentFilter !== "all" ? `Agent: ${agentFilter}  ·  ` : ""}{rangeLabel}
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.metaLine}>
              Generated: <Text style={s.metaValue}>{generatedAt}</Text>
            </Text>
            <Text style={s.metaLine}>
              Total calls: <Text style={s.metaValue}>{grandTotal.toLocaleString()}</Text>
            </Text>
            <Text style={s.metaLine}>
              Answer rate: <Text style={s.metaValue}>{answerRate}%</Text>
            </Text>
          </View>
        </View>

        {/* ── KPIs ── */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Total Calls</Text>
            <Text style={s.kpiValue}>{grandTotal}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Today's Calls</Text>
            <Text style={s.kpiValue}>{todayCalls}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Answered</Text>
            <Text style={[s.kpiValue, { color: C.success }]}>{totalAnswered}</Text>
            <Text style={s.kpiSub}>{answerRate}% answer rate</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Leads Created</Text>
            <Text style={[s.kpiValue, { color: "#7c3aed" }]}>{totalLeadsCreated}</Text>
          </View>
        </View>

        {/* ── Agent Performance ── */}
        {agentStats.length > 0 && (
          <View style={s.table}>
            <Text style={s.sectionTitle}>Agent Performance</Text>
            {/* Head */}
            <View style={s.thead}>
              <Text style={[s.th, s.thLeft, { width: AW.name }]}>Agent</Text>
              <Text style={[s.th, { width: AW.total }]}>Total</Text>
              {OUTCOMES.map(o => (
                <Text key={o} style={[s.th, { width: AW.outcome }]}>{
                  o === "Scheduled Callback" ? "Callback" : o
                }</Text>
              ))}
              <Text style={[s.th, { width: AW.rate }]}>Ans%</Text>
            </View>
            {/* Rows */}
            {agentStats.map((a, i) => (
              <View key={a.agent} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]}>
                <Text style={[s.td, s.tdLeft, s.tdBold, { width: AW.name }]}>{a.agent}</Text>
                <Text style={[s.td, s.tdBold, { width: AW.total }]}>{a.total}</Text>
                {OUTCOMES.map(o => (
                  <Text key={o} style={[s.td, { width: AW.outcome },
                    o === "Answered" && a.byOutcome[o] > 0 ? s.tdGreen : s.tdMuted]}>
                    {a.byOutcome[o] || "—"}
                  </Text>
                ))}
                <Text style={[s.td, { width: AW.rate },
                  a.byOutcome.Answered / a.total >= 0.5 ? s.tdGreen : { color: C.warning }]}>
                  {pct(a.byOutcome.Answered, a.total)}
                </Text>
              </View>
            ))}
            {/* Totals */}
            <View style={s.trTotal}>
              <Text style={[s.td, s.tdLeft, s.tdBold, { width: AW.name }]}>
                TOTAL ({agentStats.length} agents)
              </Text>
              <Text style={[s.td, s.tdBold, s.tdPrimary, { width: AW.total }]}>{grandTotal}</Text>
              {OUTCOMES.map(o => (
                <Text key={o} style={[s.td, s.tdBold, { width: AW.outcome }]}>
                  {agentStats.reduce((s, a) => s + a.byOutcome[o], 0) || "—"}
                </Text>
              ))}
              <Text style={[s.td, s.tdBold, s.tdGreen, { width: AW.rate }]}>
                {pct(totalAnswered, grandTotal)}
              </Text>
            </View>
          </View>
        )}

        {/* ── Daily Breakdown ── */}
        <View style={s.table}>
          <Text style={s.sectionTitle}>Daily Breakdown ({dayStats.length} days with activity)</Text>
          {/* Head */}
          <View style={s.thead}>
            <Text style={[s.th, s.thLeft, { width: DW.date }]}>Date</Text>
            <Text style={[s.th, { width: DW.leads }]}>Leads In</Text>
            <Text style={[s.th, { width: DW.total }]}>Total Calls</Text>
            {OUTCOMES.map(o => (
              <Text key={o} style={[s.th, { width: DW.outcome }]}>
                {o === "Scheduled Callback" ? "Callback" : o === "No Answer" ? "No Ans" : o}
              </Text>
            ))}
            <Text style={[s.th, { width: DW.rate }]}>Ans%</Text>
          </View>
          {/* Rows */}
          {dayStats.map((d, i) => (
            <View key={d.date} wrap={false}>
              <View style={[s.tr, i % 2 === 1 ? s.trAlt : {},
                d.date === today ? { backgroundColor: "#eff6ff" } : {}]}>
                <Text style={[s.td, s.tdLeft, s.tdBold, { width: DW.date }]}>
                  {d.date === today ? "TODAY  " : ""}{fmtDate(d.date)}
                </Text>
                <Text style={[s.td, { width: DW.leads },
                  d.leadsCreated > 0 ? { color: "#7c3aed", fontFamily: "Helvetica-Bold" } : s.tdMuted]}>
                  {d.leadsCreated || "—"}
                </Text>
                <Text style={[s.td, s.tdBold, { width: DW.total }]}>{d.total || "—"}</Text>
                {OUTCOMES.map(o => (
                  <Text key={o} style={[s.td, { width: DW.outcome },
                    o === "Answered" && d.byOutcome[o] > 0 ? s.tdGreen :
                    d.byOutcome[o] > 0 ? {} : s.tdMuted]}>
                    {d.byOutcome[o] || "—"}
                  </Text>
                ))}
                <Text style={[s.td, { width: DW.rate },
                  d.total > 0
                    ? d.byOutcome.Answered / d.total >= 0.5
                      ? s.tdGreen : { color: C.warning }
                    : s.tdMuted]}>
                  {d.total > 0 ? pct(d.byOutcome.Answered, d.total) : "—"}
                </Text>
              </View>

              {/* Call details sub-rows */}
              {d.callDetails.length > 0 && d.callDetails.map((c, ci) => (
                <View key={ci} style={s.detail}>
                  <Text style={s.detailText}>
                    <Text style={s.detailBold}>{c.log.outcome}</Text>
                    {"  "}
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

          {/* Totals footer */}
          {dayStats.length > 1 && (
            <View style={s.trTotal}>
              <Text style={[s.td, s.tdLeft, s.tdBold, { width: DW.date }]}>
                TOTALS ({dayStats.length} days)
              </Text>
              <Text style={[s.td, { color: "#7c3aed", fontFamily: "Helvetica-Bold" }, { width: DW.leads }]}>
                {dayStats.reduce((s, d) => s + d.leadsCreated, 0)}
              </Text>
              <Text style={[s.td, s.tdBold, s.tdPrimary, { width: DW.total }]}>{grandTotal}</Text>
              {OUTCOMES.map(o => (
                <Text key={o} style={[s.td, s.tdBold, { width: DW.outcome }]}>
                  {dayStats.reduce((s, d) => s + d.byOutcome[o], 0) || "—"}
                </Text>
              ))}
              <Text style={[s.td, s.tdBold, s.tdGreen, { width: DW.rate }]}>
                {pct(totalAnswered, grandTotal)}
              </Text>
            </View>
          )}
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {companyName}  ·  Leads Report  ·  {rangeLabel}
            {agentFilter !== "all" ? `  ·  Agent: ${agentFilter}` : ""}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// ─── Trigger PDF generation & open in new tab ────────────────────────────
export async function generateLeadsReportPdf(props: LeadsReportPdfProps): Promise<void> {
  const blob = await pdf(<LeadsReportDocument {...props} />).toBlob();
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  // Clean up object URL after the new tab has opened
  if (win) {
    win.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
  }
}
