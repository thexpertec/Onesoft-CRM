/**
 * Full A4 professional invoice print
 * Covers: header, seller info, buyer info, items table,
 * subtotal/discount/tax/shipping/handling/total,
 * payment history, payment terms, notes, footer.
 */
import { Invoice, PaymentRecord, AppSettings } from "./store";

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nl2br = (s: string) =>
  esc(s).replace(/\n/g, "<br/>");

/** Render rich-text HTML or plain text safely for the print template */
const renderContent = (s: string) => {
  const t = s.trim();
  if (t.startsWith("<")) return t;
  return nl2br(t);
};

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function getCurrencySymbol(currency: string): string {
  try {
    return (0)
      .toLocaleString("en", { style: "currency", currency: currency || "GBP", minimumFractionDigits: 0 })
      .replace(/[\d,. ]/g, "")
      .trim();
  } catch {
    return "£";
  }
}

function fmtMoney(n: number, sym: string): string {
  return `${sym}${n.toFixed(2)}`;
}

function lineTotal(item: { qty: string; unitPrice: string; discount: string }): number {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  const d = parseFloat(item.discount) || 0;
  return q * p * (1 - d / 100);
}

export function printFullInvoice(inv: Invoice, settings: AppSettings): void {
  const sym = getCurrencySymbol(settings.currency);
  const fmt = (n: number) => fmtMoney(n, sym);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subtotal    = inv.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
  const discountAmt = inv.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0) * ((parseFloat(i.discount) || 0) / 100), 0);
  const afterDisc   = subtotal - discountAmt;
  const taxAmt      = afterDisc * (parseFloat(inv.taxRate) || 0) / 100;
  const shipping    = parseFloat(inv.shippingFee) || 0;
  const handling    = parseFloat(inv.handlingFee) || 0;
  const total       = afterDisc + taxAmt + shipping + handling;
  const paid        = parseFloat(inv.amountPaid) || 0;
  const balance     = Math.max(0, total - paid);

  // ── Payment history total ───────────────────────────────────────────────────
  const histTotal = (inv.paymentHistory ?? []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  // ── Status badge colour ─────────────────────────────────────────────────────
  const statusColors: Record<string, string> = {
    Draft:     "#64748b",
    Sent:      "#3b82f6",
    Paid:      "#10b981",
    Partial:   "#f59e0b",
    Overdue:   "#ef4444",
    Cancelled: "#9ca3af",
  };
  const statusColor = statusColors[inv.status] ?? "#64748b";
  const statusBg: Record<string, string> = {
    Draft:     "#f1f5f9",
    Sent:      "#eff6ff",
    Paid:      "#f0fdf4",
    Partial:   "#fffbeb",
    Overdue:   "#fef2f2",
    Cancelled: "#f9fafb",
  };
  const statusBgColor = statusBg[inv.status] ?? "#f1f5f9";

  // ── Item rows ───────────────────────────────────────────────────────────────
  const itemRows = inv.items
    .map((item, i) => {
      const lt = lineTotal(item);
      const disc = parseFloat(item.discount) || 0;
      return `
        <tr class="${i % 2 === 1 ? "row-alt" : ""}">
          <td class="td-center num-col">${i + 1}</td>
          <td>
            <div class="item-name">${esc(item.productName || "—")}</div>
            ${item.sku ? `<div class="item-meta">SKU: ${esc(item.sku)}</div>` : ""}
            ${item.notes ? `<div class="item-meta">${esc(item.notes)}</div>` : ""}
          </td>
          <td class="td-right">${esc(item.unit)}</td>
          <td class="td-right">${parseFloat(item.qty) || 0}</td>
          <td class="td-right">${fmt(parseFloat(item.unitPrice) || 0)}</td>
          <td class="td-right disc-col">${disc > 0 ? `<span class="disc-badge">${disc.toFixed(1)}%</span>` : "—"}</td>
          <td class="td-right total-col">${fmt(lt)}</td>
        </tr>`;
    })
    .join("");

  // ── Payment history rows ────────────────────────────────────────────────────
  const histRows = (inv.paymentHistory ?? [])
    .map(r => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>${esc(r.method)}</td>
        <td>${esc(r.note)}</td>
        <td class="td-right fw-600">${fmt(parseFloat(r.amount) || 0)}</td>
      </tr>`)
    .join("");

  // ── Logo ────────────────────────────────────────────────────────────────────
  const logoHtml = settings.logoBase64
    ? `<img src="${esc(settings.logoBase64)}" alt="Logo" class="logo"/>`
    : `<div class="logo-text">${esc(settings.companyName)}</div>`;

  // ── Seller address lines ─────────────────────────────────────────────────────
  const sellerLines: string[] = [];
  if (settings.addressHull)         sellerLines.push(esc(settings.addressHull));
  if (settings.addressIslamabad)    sellerLines.push(esc(settings.addressIslamabad));
  if (settings.phoneHull)           sellerLines.push(`Tel: ${esc(settings.phoneHull)}`);
  if (settings.phoneIslamabad)      sellerLines.push(`Tel (PK): ${esc(settings.phoneIslamabad)}`);
  if (settings.emailHull)           sellerLines.push(esc(settings.emailHull));
  if (settings.website)             sellerLines.push(esc(settings.website));
  if (settings.vatNumber)           sellerLines.push(`VAT No: ${esc(settings.vatNumber)}`);
  if (settings.companyRegistration) sellerLines.push(`Reg: ${esc(settings.companyRegistration)}`);

  // ── Buyer address lines ─────────────────────────────────────────────────────
  const buyerLines: string[] = [];
  if (inv.customerId)   buyerLines.push(`Ref: ${esc(inv.customerId)}`);
  if (inv.buyerAddress) buyerLines.push(nl2br(inv.buyerAddress));
  if (inv.buyerPhone)   buyerLines.push(`Tel: ${esc(inv.buyerPhone)}`);
  if (inv.buyerEmail)   buyerLines.push(esc(inv.buyerEmail));

  // ── Bank details ─────────────────────────────────────────────────────────────
  const bankText = inv.bankDetails || settings.bankDetails;

  // ── Footer parts ─────────────────────────────────────────────────────────────
  const footerParts: string[] = [];
  if (settings.companyRegistration) footerParts.push(`Reg No: ${esc(settings.companyRegistration)}`);
  if (settings.vatNumber)           footerParts.push(`VAT No: ${esc(settings.vatNumber)}`);
  if (settings.website)             footerParts.push(esc(settings.website));
  if (settings.socialLinks) {
    settings.socialLinks.split("\n").filter(Boolean).forEach(l => footerParts.push(esc(l.trim())));
  }
  const settingsFooter = settings.invoiceFooter;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(inv.invoiceTitle || "Invoice")} ${esc(inv.invoiceNumber)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 0; }
  @media print { html, body { width: 210mm; } }

  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    font-size: 9.5pt;
    color: #1e293b;
    background: #fff;
    line-height: 1.55;
  }

  /* ── PAGE WRAPPER ────────────────────────────────── */
  .page { padding: 0; }

  /* ── HEADER BAND ─────────────────────────────────── */
  .inv-header {
    background: #0f2447;
    color: #fff;
    padding: 22pt 24pt 18pt;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20pt;
  }
  .inv-header-left { flex: 1; min-width: 0; }
  .logo { max-height: 56px; max-width: 160px; object-fit: contain; filter: brightness(0) invert(1); }
  .logo-text { font-size: 20pt; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
  .company-sub { margin-top: 6pt; }
  .company-sub-line { font-size: 8pt; color: #94a3b8; margin-top: 1pt; line-height: 1.4; }

  .inv-header-right { text-align: right; flex-shrink: 0; }
  .inv-title {
    font-size: 26pt;
    font-weight: 900;
    color: #fff;
    letter-spacing: 2px;
    text-transform: uppercase;
    line-height: 1;
  }
  .inv-number {
    font-size: 11pt;
    font-weight: 700;
    color: #60a5fa;
    margin-top: 4pt;
    letter-spacing: 0.5px;
  }
  .inv-meta { margin-top: 10pt; }
  .inv-meta-row { display: flex; justify-content: flex-end; gap: 8pt; font-size: 8.5pt; margin-bottom: 3pt; }
  .inv-meta-label { color: #94a3b8; }
  .inv-meta-value { font-weight: 600; color: #e2e8f0; min-width: 80pt; text-align: right; }
  .status-badge {
    display: inline-block;
    padding: 4pt 12pt;
    border-radius: 20pt;
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-top: 10pt;
    background: ${statusBgColor};
    color: ${statusColor};
    border: 1.5px solid ${statusColor};
  }

  /* ── BODY CONTENT ────────────────────────────────── */
  .body-content { padding: 18pt 24pt 20pt; }
  .section { margin-bottom: 18pt; }

  /* ── BILL FROM / BILL TO ─────────────────────────── */
  .parties-row { display: flex; gap: 12pt; margin-bottom: 18pt; }
  .party {
    flex: 1;
    border: 1.5px solid #e2e8f0;
    border-radius: 6pt;
    overflow: hidden;
  }
  .party-header {
    background: #0f2447;
    color: #94a3b8;
    font-size: 7pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 5pt 12pt;
  }
  .party-body { padding: 10pt 12pt; }
  .party-name { font-size: 12pt; font-weight: 800; color: #0f172a; margin-bottom: 5pt; }
  .party-line { font-size: 8.5pt; color: #475569; margin-bottom: 2pt; line-height: 1.4; }

  /* ── BANK DETAILS ───────────────────────────────── */
  .bank-box {
    background: #f0f7ff;
    border: 1.5px solid #bfdbfe;
    border-radius: 6pt;
    padding: 10pt 14pt;
    font-size: 8.5pt;
    color: #1e3a5f;
    margin-bottom: 18pt;
    display: flex;
    gap: 10pt;
    align-items: flex-start;
  }
  .bank-icon {
    font-size: 16pt;
    line-height: 1;
    color: #3b82f6;
    flex-shrink: 0;
  }
  .bank-box-label { font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4pt; color: #1d4ed8; }

  /* ── SECTION HEADING ────────────────────────────── */
  .section-heading {
    display: flex;
    align-items: center;
    gap: 8pt;
    margin-bottom: 10pt;
  }
  .section-heading-bar {
    width: 4pt;
    height: 16pt;
    background: #0f2447;
    border-radius: 2pt;
    flex-shrink: 0;
  }
  .section-heading-text {
    font-size: 10pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #0f2447;
  }
  .section-heading-rule {
    flex: 1;
    height: 1.5px;
    background: #e2e8f0;
  }

  /* ── ITEMS TABLE ────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; }
  thead tr {
    background: #0f2447;
  }
  thead th {
    color: #94a3b8;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 8pt 10pt;
    text-align: left;
  }
  thead th.td-right { text-align: right; }
  thead th.td-center { text-align: center; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr.row-alt { background: #f8fafc; }
  tbody td { padding: 8pt 10pt; vertical-align: top; font-size: 9pt; }
  .num-col { width: 22pt; color: #94a3b8; font-size: 8pt; }
  .disc-col { width: 38pt; }
  .total-col { width: 64pt; font-weight: 700; color: #0f172a; }
  .td-right { text-align: right; }
  .td-center { text-align: center; }
  .fw-600 { font-weight: 600; }
  .item-name { font-weight: 700; font-size: 9.5pt; color: #0f172a; }
  .item-meta { font-size: 7.5pt; color: #94a3b8; margin-top: 2pt; }
  .disc-badge {
    display: inline-block;
    background: #fef3c7;
    color: #92400e;
    font-size: 7pt;
    font-weight: 700;
    padding: 1pt 4pt;
    border-radius: 3pt;
  }
  tbody tr:last-child { border-bottom: 2px solid #e2e8f0; }

  /* ── TOTALS BLOCK ───────────────────────────────── */
  .totals-wrapper { display: flex; justify-content: flex-end; margin-top: 8pt; margin-bottom: 0; }
  .totals-table { width: 220pt; }
  .totals-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4pt 8pt;
    font-size: 9pt;
    border-bottom: 1px solid #f1f5f9;
  }
  .totals-row:last-child { border-bottom: none; }
  .totals-label { color: #64748b; }
  .totals-value { font-weight: 600; color: #1e293b; }
  .totals-subtotal-row { background: #f8fafc; border-radius: 3pt 3pt 0 0; }
  .totals-total {
    background: #0f2447;
    color: #fff;
    padding: 9pt 12pt;
    border-radius: 5pt;
    margin-top: 6pt;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12pt;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .totals-total-label { font-size: 9pt; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
  .totals-total-amount { font-size: 14pt; font-weight: 900; color: #fff; }
  .totals-balance {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    border: 1.5px solid #fbbf24;
    color: #78350f;
    padding: 7pt 12pt;
    border-radius: 5pt;
    margin-top: 5pt;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10pt;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .fully-paid {
    background: #f0fdf4;
    border: 1.5px solid #86efac;
    color: #166534;
    padding: 7pt 12pt;
    border-radius: 5pt;
    margin-top: 5pt;
    text-align: center;
    font-size: 9pt;
    font-weight: 800;
    letter-spacing: 0.5px;
  }

  /* ── PAYMENT HISTORY ────────────────────────────── */
  .hist-table thead tr { background: #334155; }
  .hist-table tbody tr.row-alt { background: #f8fafc; }
  .hist-total-row { background: #f0fdf4 !important; }
  .hist-total-row td { font-weight: 700; color: #166534; }

  /* ── TERMS / NOTES ──────────────────────────────── */
  .notes-stack { }
  .notes-box { margin-bottom: 14pt; }
  .notes-box:last-child { margin-bottom: 0; }
  .notes-label {
    font-size: 8.5pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #0f2447;
    margin-bottom: 6pt;
    padding-left: 8pt;
    border-left: 3pt solid #0f2447;
  }
  .notes-text {
    font-size: 9pt;
    color: #374151;
    background: #f8fafc;
    border: 1.5px solid #e5e7eb;
    border-radius: 5pt;
    padding: 10pt 14pt;
    line-height: 1.65;
  }
  .notes-text p { margin: 0 0 5pt; }
  .notes-text p:last-child { margin-bottom: 0; }
  .notes-text ul, .notes-text ol { margin: 0 0 5pt; padding-left: 16pt; }
  .notes-text li { margin-bottom: 2.5pt; }
  .notes-text h1, .notes-text h2, .notes-text h3 { font-size: 10pt; font-weight: 700; margin: 5pt 0 3pt; color: #0f2447; }
  .notes-text strong { font-weight: 700; }
  .notes-text em { font-style: italic; }
  .notes-text blockquote { border-left: 2pt solid #cbd5e1; margin: 5pt 0; padding-left: 8pt; color: #6b7280; }

  /* ── FOOTER BAND ────────────────────────────────── */
  .inv-footer {
    background: #0f2447;
    color: #94a3b8;
    padding: 14pt 24pt;
    margin-top: 20pt;
    font-size: 8pt;
    line-height: 1.7;
    text-align: center;
  }
  .inv-footer-company { font-size: 10pt; font-weight: 700; color: #e2e8f0; margin-bottom: 4pt; }
  .inv-footer-line { color: #64748b; margin-bottom: 2pt; }
  .inv-footer-legal { font-size: 7pt; color: #334155; margin-top: 6pt; padding-top: 6pt; border-top: 1px solid #1e3a5f; }

  .page-break { page-break-before: always; }
</style>
</head>
<body>
<div class="page">

<!-- ════════════════════ HEADER BAND ════════════════════ -->
<div class="inv-header">
  <div class="inv-header-left">
    ${logoHtml}
    ${settings.companyTagline ? `<div class="company-sub-line" style="margin-top:6pt;font-size:8.5pt;color:#cbd5e1;">${esc(settings.companyTagline)}</div>` : ""}
    <div class="company-sub">
      ${sellerLines.map(l => `<div class="company-sub-line">${l}</div>`).join("")}
    </div>
  </div>
  <div class="inv-header-right">
    <div class="inv-title">${esc(inv.invoiceTitle || "Invoice")}</div>
    <div class="inv-number">${esc(inv.invoiceNumber)}</div>
    <div class="inv-meta">
      <div class="inv-meta-row">
        <span class="inv-meta-label">Invoice Date</span>
        <span class="inv-meta-value">${fmtDate(inv.invoiceDate)}</span>
      </div>
      <div class="inv-meta-row">
        <span class="inv-meta-label">Due Date</span>
        <span class="inv-meta-value" style="${inv.status === "Overdue" ? "color:#fca5a5" : ""}">${fmtDate(inv.dueDate)}</span>
      </div>
      ${inv.paymentMethod ? `
      <div class="inv-meta-row">
        <span class="inv-meta-label">Payment Via</span>
        <span class="inv-meta-value">${esc(inv.paymentMethod)}</span>
      </div>` : ""}
    </div>
    <div><span class="status-badge">${esc(inv.status)}</span></div>
  </div>
</div>

<!-- ════════════════════ BODY ════════════════════ -->
<div class="body-content">

<!-- BILL FROM / BILL TO -->
<div class="parties-row">
  <div class="party">
    <div class="party-header">Bill From</div>
    <div class="party-body">
      <div class="party-name">${esc(settings.companyName)}</div>
      ${sellerLines.map(l => `<div class="party-line">${l}</div>`).join("")}
    </div>
  </div>
  <div class="party">
    <div class="party-header">Bill To</div>
    <div class="party-body">
      <div class="party-name">${esc(inv.customer || "—")}</div>
      ${buyerLines.map(l => `<div class="party-line">${l}</div>`).join("")}
    </div>
  </div>
</div>

${bankText ? `
<!-- BANK DETAILS -->
<div class="bank-box">
  <div class="bank-icon">🏦</div>
  <div>
    <div class="bank-box-label">Bank / Payment Details</div>
    <div style="white-space:pre-line;font-size:8.5pt;color:#1e3a5f;">${nl2br(bankText)}</div>
  </div>
</div>
` : ""}

<!-- ITEMS & SERVICES -->
<div class="section">
  <div class="section-heading">
    <div class="section-heading-bar"></div>
    <div class="section-heading-text">Items &amp; Services</div>
    <div class="section-heading-rule"></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="td-center num-col">#</th>
        <th>Description</th>
        <th class="td-right" style="width:36pt">Unit</th>
        <th class="td-right" style="width:32pt">Qty</th>
        <th class="td-right" style="width:58pt">Unit Price</th>
        <th class="td-right disc-col">Disc</th>
        <th class="td-right total-col">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- TOTALS -->
  <div class="totals-wrapper">
    <div class="totals-table">
      <div class="totals-row totals-subtotal-row">
        <span class="totals-label">Subtotal</span>
        <span class="totals-value">${fmt(subtotal)}</span>
      </div>
      ${discountAmt > 0 ? `
      <div class="totals-row">
        <span class="totals-label">Discount</span>
        <span class="totals-value" style="color:#ef4444">−${fmt(discountAmt)}</span>
      </div>
      <div class="totals-row">
        <span class="totals-label">After Discount</span>
        <span class="totals-value">${fmt(afterDisc)}</span>
      </div>` : ""}
      ${parseFloat(inv.taxRate) > 0 ? `
      <div class="totals-row">
        <span class="totals-label">VAT / Tax (${esc(inv.taxRate)}%)</span>
        <span class="totals-value">${fmt(taxAmt)}</span>
      </div>` : ""}
      ${shipping > 0 ? `
      <div class="totals-row">
        <span class="totals-label">Shipping${inv.shippingMethod ? ` (${esc(inv.shippingMethod)})` : ""}</span>
        <span class="totals-value">${fmt(shipping)}</span>
      </div>` : ""}
      ${handling > 0 ? `
      <div class="totals-row">
        <span class="totals-label">Handling</span>
        <span class="totals-value">${fmt(handling)}</span>
      </div>` : ""}
      <div class="totals-total">
        <span class="totals-total-label">Total</span>
        <span class="totals-total-amount">${fmt(total)}</span>
      </div>
      ${paid > 0 ? `
      <div class="totals-row" style="margin-top:4pt;">
        <span class="totals-label">Amount Paid</span>
        <span class="totals-value" style="color:#10b981">−${fmt(paid)}</span>
      </div>` : ""}
      ${balance > 0 ? `
      <div class="totals-balance">
        <span>Balance Due</span>
        <span>${fmt(balance)}</span>
      </div>` : ""}
      ${paid >= total && total > 0 ? `
      <div class="fully-paid">✓ &nbsp; Fully Paid${inv.paidAt ? " — " + new Date(inv.paidAt).toLocaleDateString("en-GB", {day:"2-digit",month:"long",year:"numeric"}) : ""}</div>` : ""}
    </div>
  </div>
</div>

${(inv.paymentHistory ?? []).length > 0 ? `
<!-- PAYMENT HISTORY -->
<div class="section">
  <div class="section-heading">
    <div class="section-heading-bar"></div>
    <div class="section-heading-text">Payment History</div>
    <div class="section-heading-rule"></div>
  </div>
  <table class="hist-table">
    <thead>
      <tr>
        <th style="width:84pt">Date</th>
        <th style="width:74pt">Method</th>
        <th>Note</th>
        <th class="td-right" style="width:64pt">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${histRows}
      <tr class="hist-total-row">
        <td colspan="3" class="td-right">Total Received</td>
        <td class="td-right">${fmt(histTotal)}</td>
      </tr>
    </tbody>
  </table>
</div>
` : ""}

${(() => {
  const docsToRender: Array<{title: string; content: string}> = [];
  if (inv.invoiceDocs?.length) {
    inv.invoiceDocs.forEach(d => { if (d.content) docsToRender.push(d); });
  } else {
    if (inv.paymentTerms || settings.invoiceTerms) docsToRender.push({ title: "Payment Terms",    content: inv.paymentTerms || settings.invoiceTerms });
    if (inv.agreement)    docsToRender.push({ title: "Agreement",        content: inv.agreement    });
    if (inv.notes)        docsToRender.push({ title: "Additional Notes", content: inv.notes        });
  }
  if (!docsToRender.length) return "";
  return `
<!-- TERMS & NOTES -->
<div class="section">
  <div class="section-heading">
    <div class="section-heading-bar"></div>
    <div class="section-heading-text">Terms &amp; Notes</div>
    <div class="section-heading-rule"></div>
  </div>
  <div class="notes-stack">
    ${docsToRender.map(d => `
    <div class="notes-box">
      <div class="notes-label">${esc(d.title)}</div>
      <div class="notes-text">${renderContent(d.content)}</div>
    </div>`).join("")}
  </div>
</div>`;
})()}

</div><!-- /body-content -->

<!-- ════════════════════ FOOTER BAND ════════════════════ -->
<div class="inv-footer">
  <div class="inv-footer-company">
    ${settings.companyName}${settings.companyTagline ? ` — ${settings.companyTagline}` : ""}
  </div>
  ${(settings.phoneHull || settings.phoneIslamabad || settings.emailHull || settings.emailIslamabad || settings.website) ? `
  <div class="inv-footer-line">
    ${[
      settings.phoneHull        ? `${esc(settings.phoneHull)} (UK)` : "",
      settings.phoneIslamabad   ? `${esc(settings.phoneIslamabad)} (PK)` : "",
      settings.emailHull        ? esc(settings.emailHull) : "",
      settings.emailIslamabad   ? esc(settings.emailIslamabad) : "",
      settings.website          ? esc(settings.website) : "",
    ].filter(Boolean).join(" &nbsp;·&nbsp; ")}
  </div>` : ""}
  ${(settings.addressHull || settings.addressIslamabad) ? `
  <div class="inv-footer-line">
    ${[settings.addressHull, settings.addressIslamabad].filter(Boolean).map(a => esc(a!)).join(" &nbsp;·&nbsp; ")}
  </div>` : ""}
  ${footerParts.length > 0 ? `<div class="inv-footer-line">${footerParts.join(" &nbsp;·&nbsp; ")}</div>` : ""}
  ${settingsFooter ? `<div class="inv-footer-line">${nl2br(settingsFooter)}</div>` : ""}
  <div class="inv-footer-legal">This is a computer-generated document. No handwritten signature is required.</div>
</div>

</div><!-- /page -->
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) { alert("Pop-up blocked — please allow pop-ups for this site."); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.addEventListener("load", () => { win.focus(); win.print(); });
}
