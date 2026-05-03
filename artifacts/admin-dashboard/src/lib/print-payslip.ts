import type { SalarySlip, AppSettings } from "./store";

const _esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function getCurrencySymbol(currency: string): string {
  try {
    return (0)
      .toLocaleString("en", { style: "currency", currency: currency || "GBP", minimumFractionDigits: 0 })
      .replace(/[\d,. ]/g, "").trim();
  } catch { return "£"; }
}

function fmtMoney(n: number, sym: string): string {
  return `${sym}${(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return "—"; }
}

function periodLabel(period: string): string {
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  const [yr, mo] = period.split("-");
  return `${months[parseInt(mo) - 1] ?? "?"} ${yr ?? ""}`;
}

function statusBadge(status: string): string {
  const map: Record<string, { bg: string; color: string }> = {
    Draft:    { bg: "#fef3c7", color: "#92400e" },
    Approved: { bg: "#dbeafe", color: "#1e40af" },
    Paid:     { bg: "#d1fae5", color: "#065f46" },
  };
  const s = map[status] ?? { bg: "#f1f5f9", color: "#475569" };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:9.5pt;font-weight:700;background:${s.bg};color:${s.color};">${_esc(status)}</span>`;
}

export function buildPayslipHtml(slip: SalarySlip, settings: AppSettings): string {
  const sym            = getCurrencySymbol(settings.currency || "GBP");
  const fmt            = (n: number) => fmtMoney(n, sym);
  const totalDeductions = slip.deductions.reduce((s, d) => s + (d.amount || 0), 0);

  const companyName    = _esc(settings.companyName || "Company");
  const address        = _esc(settings.addressHull || settings.addressIslamabad || "");
  const phone          = _esc(settings.phoneHull   || settings.phoneIslamabad   || "");
  const email          = _esc(settings.emailHull   || "");
  const website        = _esc(settings.website     || "");
  const vatNo          = settings.vatNumber ? `VAT Reg: ${_esc(settings.vatNumber)}` : "";
  const companyReg     = settings.companyRegistration ? `Reg No: ${_esc(settings.companyRegistration)}` : "";

  const logoHtml = settings.logoBase64
    ? `<img src="${_esc(settings.logoBase64)}" alt="Logo" style="max-height:56px;max-width:180px;object-fit:contain;display:block;">`
    : `<div style="font-size:20pt;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1;">${companyName}</div>`;

  const companyContactLines = [address, phone, email, website, vatNo, companyReg].filter(Boolean);

  // ── Earnings rows ──────────────────────────────────────────────────────────
  const earningsRows = [
    { label: "Basic Salary", amount: slip.basicSalary, bold: false },
    ...slip.allowances.map(a => ({ label: a.label || "Allowance", amount: a.amount, bold: false })),
  ];

  const earningsTbody = earningsRows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"};">
      <td style="padding:7pt 10pt;color:#374151;font-size:10pt;">${_esc(r.label)}</td>
      <td style="padding:7pt 10pt;text-align:right;font-size:10pt;${r.bold ? "font-weight:700;" : ""}color:#1e293b;">${fmt(r.amount)}</td>
    </tr>
  `).join("");

  // ── Deductions rows ────────────────────────────────────────────────────────
  const deductionsTbody = slip.deductions.length > 0
    ? slip.deductions.map((d, i) => `
      <tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"};">
        <td style="padding:7pt 10pt;color:#374151;font-size:10pt;">${_esc(d.label || "Deduction")}</td>
        <td style="padding:7pt 10pt;text-align:right;color:#dc2626;font-size:10pt;">${fmt(d.amount)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="2" style="padding:10pt;text-align:center;color:#9ca3af;font-size:9.5pt;font-style:italic;">No deductions</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Pay Slip — ${_esc(periodLabel(slip.period))} — ${_esc(slip.staffName)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 10pt;
    color: #1e293b;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Header band ── */
  .header-band {
    background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%);
    padding: 18pt 20pt 14pt 20pt;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-radius: 6px 6px 0 0;
  }
  .header-company-contact {
    text-align: right;
    color: rgba(255,255,255,0.75);
    font-size: 8.5pt;
    line-height: 1.7;
  }
  .slip-title-band {
    background: #e0e7ff;
    border-left: 4px solid #1e40af;
    padding: 8pt 20pt;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .slip-title-band .title {
    font-size: 16pt;
    font-weight: 800;
    color: #1e3a5f;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .slip-title-band .period {
    font-size: 11pt;
    font-weight: 600;
    color: #1e40af;
  }

  /* ── Employee info grid ── */
  .emp-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-top: none;
  }
  .emp-cell {
    padding: 7pt 14pt;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    gap: 6pt;
    align-items: baseline;
  }
  .emp-cell:nth-child(odd)  { border-right: 1px solid #e2e8f0; }
  .emp-cell .lbl { color: #64748b; font-size: 8.5pt; min-width: 72pt; }
  .emp-cell .val { font-weight: 600; font-size: 10pt; color: #0f172a; }

  /* ── Section headings ── */
  .section-head {
    padding: 7pt 10pt 6pt 12pt;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    border-radius: 0;
    border-left: 4px solid;
    margin-top: 12pt;
  }
  .section-head.earn  { background:#f0fdf4; color:#065f46; border-color:#10b981; }
  .section-head.deduct { background:#fff5f5; color:#991b1b; border-color:#ef4444; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; }
  table thead th {
    background: #f1f5f9;
    padding: 6pt 10pt;
    font-size: 8.5pt;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #e2e8f0;
  }
  table thead th:last-child { text-align: right; }
  table tfoot td {
    padding: 7pt 10pt;
    font-weight: 700;
    font-size: 10pt;
    border-top: 2px solid #e2e8f0;
  }
  table tfoot td:last-child { text-align: right; }
  .earn-tfoot  { color: #065f46; background: #f0fdf4; }
  .deduct-tfoot { color: #991b1b; background: #fff5f5; }

  /* ── Summary box ── */
  .summary-box {
    margin-top: 14pt;
    border: 1.5px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7pt 16pt;
    border-bottom: 1px solid #e2e8f0;
    font-size: 10pt;
  }
  .summary-row:last-child { border-bottom: none; }
  .summary-row.gross { background: #f0fdf4; }
  .summary-row.deduct { background: #fff5f5; }
  .summary-row.net {
    background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%);
    padding: 11pt 16pt;
  }
  .summary-row.net .lbl { color: #fff; font-size: 12pt; font-weight: 700; }
  .summary-row.net .val { color: #fff; font-size: 16pt; font-weight: 800; }
  .summary-row .lbl { color: #374151; font-weight: 500; }
  .summary-row .val { font-weight: 700; }
  .summary-row.gross .val { color: #065f46; }
  .summary-row.deduct .val { color: #991b1b; }

  /* ── Signature section ── */
  .sig-section {
    margin-top: 28pt;
    display: flex;
    justify-content: space-between;
    gap: 24pt;
  }
  .sig-box { flex: 1; text-align: center; }
  .sig-line {
    border-top: 1.5px solid #64748b;
    margin-bottom: 5pt;
    width: 100%;
  }
  .sig-label { font-size: 9pt; color: #475569; }
  .sig-title { font-size: 8pt; color: #94a3b8; margin-top: 2pt; }

  /* ── Footer ── */
  .footer {
    margin-top: 18pt;
    border-top: 1px solid #e2e8f0;
    padding-top: 8pt;
    font-size: 8pt;
    color: #94a3b8;
    text-align: center;
    line-height: 1.6;
  }

  /* ── Notes ── */
  .notes-box {
    margin-top: 12pt;
    background: #fefce8;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 8pt 12pt;
    font-size: 9pt;
    color: #78350f;
  }

  /* ── Print action bar (hidden when printing) ── */
  .print-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #1e293b;
    padding: 10pt 18pt;
    display: flex;
    gap: 10pt;
    justify-content: flex-end;
    align-items: center;
    z-index: 999;
    box-shadow: 0 -2px 12px rgba(0,0,0,0.3);
  }
  .btn-print {
    background: #3b82f6; color: #fff; border: none;
    padding: 8pt 22pt; border-radius: 6px;
    font-size: 11pt; font-weight: 600; cursor: pointer;
  }
  .btn-print:hover { background: #2563eb; }
  .btn-close {
    background: transparent; color: #94a3b8; border: 1px solid #475569;
    padding: 8pt 18pt; border-radius: 6px;
    font-size: 11pt; cursor: pointer;
  }
  .doc-wrapper { max-width: 720px; margin: 0 auto; padding-bottom: 64pt; }

  @media print {
    .print-bar { display: none !important; }
    .doc-wrapper { padding-bottom: 0; }
    body { margin: 0; }
  }
</style>
</head>
<body>
<div class="doc-wrapper">

  <!-- Header band -->
  <div class="header-band">
    <div>${logoHtml}</div>
    <div class="header-company-contact">
      ${companyContactLines.map(l => `<div>${l}</div>`).join("")}
    </div>
  </div>

  <!-- Title band -->
  <div class="slip-title-band">
    <span class="title">Pay Slip</span>
    <span class="period">${_esc(periodLabel(slip.period))}</span>
  </div>

  <!-- Employee details -->
  <div class="emp-grid">
    <div class="emp-cell"><span class="lbl">Employee</span><span class="val">${_esc(slip.staffName)}</span></div>
    <div class="emp-cell"><span class="lbl">Department</span><span class="val">${_esc(slip.department || "—")}</span></div>
    <div class="emp-cell"><span class="lbl">Designation</span><span class="val">${_esc(slip.designation || "—")}</span></div>
    <div class="emp-cell"><span class="lbl">Salary Type</span><span class="val">${_esc(slip.salaryType)}</span></div>
    <div class="emp-cell"><span class="lbl">Paid On</span><span class="val">${slip.paidAt ? fmtDate(slip.paidAt) : "—"}</span></div>
    <div class="emp-cell"><span class="lbl">Status</span><span class="val">${statusBadge(slip.status)}</span></div>
    ${slip.paymentMethod ? `<div class="emp-cell" style="grid-column:1/-1;"><span class="lbl">Payment Method</span><span class="val">${_esc(slip.paymentMethod)}</span></div>` : ""}
  </div>

  <!-- Earnings -->
  <div class="section-head earn">Earnings</div>
  <table>
    <thead><tr><th style="text-align:left;">Description</th><th>Amount</th></tr></thead>
    <tbody>${earningsTbody}</tbody>
    <tfoot class="earn-tfoot">
      <tr><td>Gross Salary</td><td style="text-align:right;">${fmt(slip.grossSalary)}</td></tr>
    </tfoot>
  </table>

  <!-- Deductions -->
  <div class="section-head deduct">Deductions</div>
  <table>
    <thead><tr><th style="text-align:left;">Description</th><th>Amount</th></tr></thead>
    <tbody>${deductionsTbody}</tbody>
    ${slip.deductions.length > 0 ? `
    <tfoot class="deduct-tfoot">
      <tr><td>Total Deductions</td><td style="text-align:right;">${fmt(totalDeductions)}</td></tr>
    </tfoot>` : ""}
  </table>

  <!-- Summary -->
  <div class="summary-box">
    <div class="summary-row gross">
      <span class="lbl">Gross Salary</span>
      <span class="val">${fmt(slip.grossSalary)}</span>
    </div>
    ${slip.deductions.length > 0 ? `
    <div class="summary-row deduct">
      <span class="lbl">Total Deductions</span>
      <span class="val">− ${fmt(totalDeductions)}</span>
    </div>` : ""}
    <div class="summary-row net">
      <span class="lbl">Net Salary</span>
      <span class="val">${fmt(slip.netSalary)}</span>
    </div>
  </div>

  <!-- Notes -->
  ${slip.notes ? `<div class="notes-box"><strong>Note:</strong> ${_esc(slip.notes)}</div>` : ""}

  <!-- Signatures -->
  <div class="sig-section">
    <div class="sig-box">
      <div style="height:32pt;"></div>
      <div class="sig-line"></div>
      <div class="sig-label">Employee Signature</div>
      <div class="sig-title">${_esc(slip.staffName)}</div>
    </div>
    <div class="sig-box">
      <div style="height:32pt;"></div>
      <div class="sig-line"></div>
      <div class="sig-label">Authorised By</div>
      <div class="sig-title">${companyName}</div>
    </div>
    <div class="sig-box">
      <div style="height:32pt;"></div>
      <div class="sig-line"></div>
      <div class="sig-label">HR Department</div>
      <div class="sig-title">Date: _______________</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    This is a computer-generated payslip and does not require a handwritten signature.
    ${vatNo ? `<br>${vatNo}` : ""}${companyReg ? `&nbsp;·&nbsp;${companyReg}` : ""}
  </div>

</div>

<!-- Print bar -->
<div class="print-bar">
  <button class="btn-close" onclick="window.close()">Close</button>
  <button class="btn-print" onclick="window.print()">🖨&nbsp; Print / Save PDF</button>
</div>

<script>
  setTimeout(function() { window.print(); }, 500);
</script>

</body>
</html>`;
}
