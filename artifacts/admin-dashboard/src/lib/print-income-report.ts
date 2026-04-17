/**
 * Professional A4 Income / Revenue Report printer.
 * Opens a new window with clean, print-ready HTML — no screen chrome captured.
 */
import type { AppSettings } from "./store";

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getCurrencySymbol(currency: string): string {
  try {
    return (0)
      .toLocaleString("en", { style: "currency", currency: currency || "GBP", minimumFractionDigits: 0 })
      .replace(/[\d,. ]/g, "")
      .trim() || "£";
  } catch { return "£"; }
}

function money(n: number, sym: string): string {
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Public types ──────────────────────────────────────────────────────────────

export type PrintIncomeLine = {
  jeId:        string;
  jeRef:       string;
  jeDate:      string;
  jeDesc:      string;
  narration:   string;
  accountId:   string;
  accountName: string;
  accountCode: string;
  amount:      number;
};

export type PrintIncomeSource = {
  accountId:   string;
  accountName: string;
  accountCode: string;
  total:       number;
  count:       number;
  lines:       PrintIncomeLine[];
};

export type PrintIncomeParams = {
  settings:    AppSettings;
  from:        string;
  to:          string;
  sources:     PrintIncomeSource[];
  allLines:    PrintIncomeLine[];
  grandTotal:  number;
  avgPerEntry: number;
  topSource:   PrintIncomeSource | null;
  /** Filtered totals for the transactions section */
  filteredLines:  PrintIncomeLine[];
  filteredTotal:  number;
  srcFilterName?: string;   // human-readable label for active filter
  searchQuery?:   string;
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function printIncomeReport(params: PrintIncomeParams): void {
  const {
    settings, from, to, sources, allLines,
    grandTotal, avgPerEntry, topSource,
    filteredLines, filteredTotal,
    srcFilterName, searchQuery,
  } = params;

  const sym  = getCurrencySymbol(settings.currency);
  const now  = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const isFiltered = !!srcFilterName || !!searchQuery;
  const transLabel = isFiltered ? "Filtered Transactions" : "All Transactions";

  // ── Location line ───────────────────────────────────────────────────────────
  const addrParts  = [settings.addressHull, settings.addressIslamabad].filter(Boolean).join(" & ");
  const phoneParts = [settings.phoneHull,   settings.phoneIslamabad  ].filter(Boolean).join(" / ");
  const locationLine = [addrParts, phoneParts].filter(Boolean).join(" | ");

  // ── Source breakdown rows ───────────────────────────────────────────────────
  const sourceRows = sources.map(src => {
    const pct = grandTotal > 0 ? (src.total / grandTotal) * 100 : 0;
    // Sub-lines
    const subRows = src.lines.map(ln => `
      <tr class="sub-row">
        <td class="ind date">${esc(fmtDate(ln.jeDate))}</td>
        <td class="ref">${esc(ln.jeRef)}</td>
        <td class="desc">${esc(ln.jeDesc || "—")}</td>
        <td class="nar">${esc(ln.narration || "—")}</td>
        <td class="amt green">${money(ln.amount, sym)}</td>
      </tr>`).join("");
    return `
      <tr class="src-row">
        <td colspan="2">
          <span class="acc-badge">${esc(src.accountCode)}</span>
          <strong>${esc(src.accountName)}</strong>
        </td>
        <td class="center">${src.count}</td>
        <td class="amt green">${money(src.total, sym)}</td>
        <td class="pct">${pct.toFixed(1)}%</td>
      </tr>
      ${subRows}
      <tr class="src-subtotal">
        <td colspan="4" class="sub-label">Subtotal — ${esc(src.accountName)}</td>
        <td class="amt green">${money(src.total, sym)}</td>
      </tr>`;
  }).join("");

  // ── Transaction rows ────────────────────────────────────────────────────────
  const txnRows = filteredLines.map(ln => `
    <tr class="txn-row">
      <td class="date">${esc(fmtDate(ln.jeDate))}</td>
      <td class="ref">${esc(ln.jeRef || "—")}</td>
      <td class="desc">${esc(ln.jeDesc || "—")}</td>
      <td><span class="acc-badge">${esc(ln.accountCode)}</span> ${esc(ln.accountName)}</td>
      <td class="nar">${esc(ln.narration || "—")}</td>
      <td class="amt green">${money(ln.amount, sym)}</td>
    </tr>`).join("");

  // ── Active filter note ──────────────────────────────────────────────────────
  const filterNote = isFiltered
    ? `<p class="filter-note">
         Filters active:
         ${srcFilterName ? `<span class="tag">${esc(srcFilterName)}</span>` : ""}
         ${searchQuery   ? `<span class="tag">Search: "${esc(searchQuery)}"</span>` : ""}
       </p>`
    : "";

  // ── Full HTML document ──────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Income Report — ${esc(settings.companyName || "Onesoft")} — ${esc(from)} to ${esc(to)}</title>
<style>
  /* ── Reset ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 13px; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    color: #111827;
    background: #fff;
    padding: 0;
  }

  /* ── Print bar (hidden on print) ── */
  .print-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 24px;
    background: #f0fdf4; border-bottom: 1px solid #bbf7d0;
    gap: 12px;
  }
  .print-bar-title { font-size: 13px; color: #15803d; font-weight: 600; }
  .print-bar button {
    padding: 7px 18px; border-radius: 7px; border: none; cursor: pointer;
    font-size: 13px; font-weight: 600;
  }
  .btn-print { background: #10b981; color: #fff; }
  .btn-print:hover { background: #059669; }
  .btn-close { background: #e5e7eb; color: #374151; }
  .btn-close:hover { background: #d1d5db; }
  @media print { .print-bar { display: none !important; } }

  /* ── Page wrapper ── */
  .page {
    max-width: 210mm;
    margin: 0 auto;
    padding: 16mm 14mm 14mm;
  }
  @media print {
    html, body { margin: 0; padding: 0; }
    .page { max-width: 100%; padding: 10mm 12mm; }
    @page { size: A4 portrait; margin: 10mm; }
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Company header ── */
  .header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding-bottom: 12px; border-bottom: 2.5px solid #059669; margin-bottom: 20px;
  }
  .company { font-size: 18px; font-weight: 800; color: #059669; letter-spacing: -0.5px; }
  .company-sub  { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 15px; font-weight: 700; color: #111; }
  .doc-title .period { font-size: 10px; color: #6b7280; margin-top: 4px; }
  .doc-title .printed { font-size: 9px; color: #9ca3af; margin-top: 2px; }

  /* ── KPI grid ── */
  .kpi-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    margin-bottom: 20px;
  }
  .kpi {
    border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px;
    background: #f9fafb;
  }
  .kpi-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase;
               letter-spacing: .05em; color: #6b7280; }
  .kpi-value { font-size: 17px; font-weight: 800; color: #10b981; margin: 3px 0; }
  .kpi-sub   { font-size: 9.5px; color: #9ca3af; }

  /* ── Section heading ── */
  .section-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px;
    background: #f0fdf4; border: 1px solid #bbf7d0;
    border-bottom: none; border-radius: 8px 8px 0 0;
    font-size: 12px; font-weight: 700; color: #065f46;
  }
  .section-head span { font-size: 10.5px; font-weight: 500; color: #6b7280; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th {
    background: #f9fafb; text-align: left; padding: 7px 10px;
    font-size: 9.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .05em; color: #6b7280; border-bottom: 1px solid #e5e7eb;
  }
  th.right, td.right, td.amt, td.pct, td.center { text-align: right; }
  td.center { text-align: center; }
  td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }

  /* Source breakdown rows */
  .src-row  { background: #fff; }
  .src-row td { border-bottom: 1px solid #e5e7eb; padding: 8px 10px; font-size: 12px; }
  .sub-row  { background: #f9fafb; }
  .sub-row td { font-size: 10.5px; color: #374151; padding: 4px 10px; }
  .sub-row td.ind { padding-left: 28px; color: #6b7280; font-family: "Courier New", monospace; }
  .sub-row td.ref { color: #111827; font-weight: 500; }
  .sub-row td.nar, td.desc { color: #6b7280; font-size: 10px; }
  .src-subtotal td { background: #ecfdf5; font-size: 11px; font-weight: 700;
                     color: #065f46; border-top: 1px solid #bbf7d0;
                     border-bottom: 2px solid #bbf7d0; padding: 5px 10px; }
  .src-subtotal td.sub-label { color: #065f46; }

  /* Transaction rows */
  .txn-row td { font-size: 11px; }
  .txn-row td.date { font-family: "Courier New", monospace; font-size: 10.5px; color: #6b7280; white-space: nowrap; }
  .txn-row td.ref  { font-weight: 600; white-space: nowrap; }
  .txn-row td.desc { color: #6b7280; max-width: 120px; overflow: hidden; }
  .txn-row td.nar  { color: #6b7280; font-size: 10px; max-width: 100px; }

  /* Common */
  .acc-badge {
    display: inline-block; padding: 1px 5px; border-radius: 4px;
    background: #d1fae5; color: #065f46; font-size: 9.5px;
    font-weight: 700; font-family: "Courier New", monospace;
    margin-right: 3px;
  }
  .green { color: #059669; font-weight: 700; }
  .pct   { font-size: 10px; color: #6b7280; font-weight: 600; }
  .amt   { font-family: "Courier New", monospace; white-space: nowrap; }

  /* Grand total rows */
  .grand-row td {
    background: #ecfdf5; border-top: 2.5px solid #10b981;
    padding: 9px 10px; font-size: 13px; font-weight: 800;
    color: #065f46;
  }
  .grand-row td.amt { font-size: 15px; color: #059669; }

  /* Table wrapper */
  .table-wrap { border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; overflow: hidden; margin-bottom: 20px; }

  /* Filter note */
  .filter-note {
    font-size: 10px; color: #6b7280; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }
  .tag { background: #dbeafe; color: #1d4ed8; padding: 2px 7px; border-radius: 4px;
         font-size: 9.5px; font-weight: 600; }

  /* Footer */
  .footer {
    margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9.5px; color: #9ca3af;
  }
</style>
</head>
<body>

<!-- Print Bar -->
<div class="print-bar">
  <span class="print-bar-title">📊 Income / Revenue Report — ${esc(settings.companyName || "Onesoft")}</span>
  <div style="display:flex;gap:8px;">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Close</button>
  </div>
</div>

<div class="page">

  <!-- ── Company Header ──────────────────────────────────────── -->
  <div class="header">
    <div>
      <div class="company">${esc(settings.companyName || "Onesoft")}</div>
      <div class="company-sub">${esc(locationLine)}</div>
    </div>
    <div class="doc-title">
      <h1>Income / Revenue Report</h1>
      <div class="period">Period: ${esc(fmtDate(from))} — ${esc(fmtDate(to))}</div>
      <div class="printed">Printed: ${esc(now)}</div>
    </div>
  </div>

  <!-- ── KPI Summary ──────────────────────────────────────────── -->
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Total Revenue</div>
      <div class="kpi-value">${money(grandTotal, sym)}</div>
      <div class="kpi-sub">${esc(fmtDate(from))} → ${esc(fmtDate(to))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Transactions</div>
      <div class="kpi-value">${allLines.length}</div>
      <div class="kpi-sub">${esc(String(allLines.length))} income line(s)</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Income Sources</div>
      <div class="kpi-value">${sources.length}</div>
      <div class="kpi-sub">Revenue accounts active</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Avg per Transaction</div>
      <div class="kpi-value">${money(avgPerEntry, sym)}</div>
      <div class="kpi-sub">${topSource ? `Top: ${esc(topSource.accountName)}` : "—"}</div>
    </div>
  </div>

  <!-- ── Breakdown by Income Source ──────────────────────────── -->
  <div class="section-head">
    <span>📊 Breakdown by Income Source</span>
    <span>${sources.length} source${sources.length !== 1 ? "s" : ""}</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th colspan="2">Account</th>
          <th class="center">Transactions</th>
          <th class="right">Amount</th>
          <th class="right">Share</th>
        </tr>
      </thead>
      <tbody>
        ${sourceRows || `<tr><td colspan="5" style="text-align:center;padding:16px;color:#9ca3af;">No revenue transactions in this period</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="3"><strong>🏦 Total Revenue</strong></td>
          <td class="amt green">${money(grandTotal, sym)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── All / Filtered Transactions ─────────────────────────── -->
  <div class="section-head">
    <span>📄 ${esc(transLabel)}</span>
    <span class="green">${money(filteredTotal, sym)}</span>
  </div>
  ${filterNote}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Reference</th>
          <th>Description</th>
          <th>Source</th>
          <th>Narration</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${txnRows || `<tr><td colspan="6" style="text-align:center;padding:16px;color:#9ca3af;">No transactions match the current filters</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="5"><strong>${isFiltered ? "Filtered Total" : "Grand Total"}</strong></td>
          <td class="amt green">${money(filteredTotal, sym)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- ── Footer ───────────────────────────────────────────────── -->
  <div class="footer">
    <span>${esc(settings.companyName || "Onesoft")} — Income / Revenue Report</span>
    <span>Generated by Onesoft Admin Dashboard · ${esc(now)}</span>
  </div>

</div><!-- /page -->

<script>
  // Auto-trigger browser print dialog after a short delay so styles render
  // (only when opened as a popup, not when viewing manually)
  if (window.opener || window.name === "onesoft-print") {
    setTimeout(() => window.print(), 600);
  }
</script>
</body>
</html>`;

  const win = window.open("", "onesoft-print", "width=900,height=700,scrollbars=yes,resizable=yes");
  if (!win) {
    alert("Please allow pop-ups for this site to use the print feature.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
