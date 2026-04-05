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
  // If it looks like HTML (starts with a tag), output it directly
  if (t.startsWith("<")) return t;
  // Otherwise treat as plain text — escape and convert newlines
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
    Draft:     "#6b7280",
    Sent:      "#3b82f6",
    Paid:      "#10b981",
    Partial:   "#f59e0b",
    Overdue:   "#ef4444",
    Cancelled: "#9ca3af",
  };
  const statusColor = statusColors[inv.status] ?? "#6b7280";

  // ── Item rows ───────────────────────────────────────────────────────────────
  const itemRows = inv.items
    .map((item, i) => {
      const lt = lineTotal(item);
      const disc = parseFloat(item.discount) || 0;
      return `
        <tr>
          <td class="td-center" style="color:#6b7280">${i + 1}</td>
          <td>
            <div class="item-name">${esc(item.productName || "—")}</div>
            ${item.sku ? `<div class="item-sku">SKU: ${esc(item.sku)}</div>` : ""}
            ${item.notes ? `<div class="item-sku">${esc(item.notes)}</div>` : ""}
          </td>
          <td class="td-right">${esc(item.unit)}</td>
          <td class="td-right">${parseFloat(item.qty) || 0}</td>
          <td class="td-right">${fmt(parseFloat(item.unitPrice) || 0)}</td>
          <td class="td-right">${disc > 0 ? disc.toFixed(1) + "%" : "—"}</td>
          <td class="td-right fw-600">${fmt(lt)}</td>
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

  // ── Seller address block ─────────────────────────────────────────────────────
  const sellerLines: string[] = [];
  if (settings.addressHull)      sellerLines.push(esc(settings.addressHull));
  if (settings.addressIslamabad) sellerLines.push(esc(settings.addressIslamabad));
  if (settings.phoneHull)        sellerLines.push(`Tel: ${esc(settings.phoneHull)}`);
  if (settings.phoneIslamabad)   sellerLines.push(`Tel (PK): ${esc(settings.phoneIslamabad)}`);
  if (settings.emailHull)        sellerLines.push(`Email: ${esc(settings.emailHull)}`);
  if (settings.website)          sellerLines.push(`Web: ${esc(settings.website)}`);
  if (settings.vatNumber)        sellerLines.push(`VAT No: ${esc(settings.vatNumber)}`);
  if (settings.companyRegistration) sellerLines.push(`Reg No: ${esc(settings.companyRegistration)}`);

  // ── Buyer address block ─────────────────────────────────────────────────────
  const buyerLines: string[] = [];
  if (inv.customerId)   buyerLines.push(`ID: ${esc(inv.customerId)}`);
  if (inv.buyerAddress) buyerLines.push(nl2br(inv.buyerAddress));
  if (inv.buyerPhone)   buyerLines.push(`Tel: ${esc(inv.buyerPhone)}`);
  if (inv.buyerEmail)   buyerLines.push(`Email: ${esc(inv.buyerEmail)}`);

  // ── Bank details ─────────────────────────────────────────────────────────────
  const bankText = inv.bankDetails || settings.bankDetails;

  // ── Footer social/legal ─────────────────────────────────────────────────────
  const footerParts: string[] = [];
  if (settings.companyRegistration) footerParts.push(`Company Registration: ${esc(settings.companyRegistration)}`);
  if (settings.vatNumber)           footerParts.push(`VAT No: ${esc(settings.vatNumber)}`);
  if (settings.website)             footerParts.push(`${esc(settings.website)}`);
  if (settings.socialLinks) {
    settings.socialLinks.split("\n").filter(Boolean).forEach(l => footerParts.push(esc(l.trim())));
  }
  const invFooter = inv.notes ? "" : ""; // notes shown in body; footer from settings
  const settingsFooter = settings.invoiceFooter;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(inv.invoiceTitle || "Invoice")} ${esc(inv.invoiceNumber)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 22mm 20mm 22mm 20mm; }
  @media print { html, body { width: 210mm; } }

  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    font-size: 9.5pt;
    color: #1a1a2e;
    background: #fff;
    line-height: 1.5;
  }

  /* ── SECTION SPACING ────────────────────────────── */
  .section { margin-bottom: 18pt; }

  /* ── HEADER ─────────────────────────────────────── */
  .inv-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 14pt;
    border-bottom: 3px solid #1e3a5f;
    margin-bottom: 18pt;
  }
  .inv-header-left { flex: 1; }
  .logo { max-height: 64px; max-width: 180px; object-fit: contain; }
  .logo-text { font-size: 22pt; font-weight: 700; color: #1e3a5f; letter-spacing: -0.5px; }
  .company-tagline { font-size: 8.5pt; color: #6b7280; margin-top: 3pt; }
  .company-detail { font-size: 8.5pt; color: #4b5563; margin-top: 1.5pt; }

  .inv-header-right { text-align: right; flex-shrink: 0; }
  .inv-title { font-size: 24pt; font-weight: 800; color: #1e3a5f; letter-spacing: 1.5px; text-transform: uppercase; }
  .inv-meta { margin-top: 10pt; }
  .inv-meta-row { display: flex; justify-content: flex-end; gap: 6pt; font-size: 9pt; margin-bottom: 3pt; }
  .inv-meta-label { color: #6b7280; }
  .inv-meta-value { font-weight: 600; min-width: 90pt; text-align: right; }
  .status-badge {
    display: inline-block;
    padding: 3pt 10pt;
    border-radius: 20pt;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-top: 8pt;
    border: 1.5px solid ${statusColor};
    color: ${statusColor};
  }

  /* ── BILL FROM / BILL TO ────────────────────────── */
  .parties-row { display: flex; gap: 14pt; }
  .parties-row .party { flex: 1; margin-bottom: 0; }
  .party {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 4px solid #1e3a5f;
    border-radius: 0 6pt 6pt 0;
    padding: 10pt 14pt;
    margin-bottom: 10pt;
  }
  .party:last-child { margin-bottom: 0; }
  .party-label {
    font-size: 7.5pt;
    font-weight: 700;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 5pt;
    padding-bottom: 4pt;
    border-bottom: 1px solid #e2e8f0;
  }
  .party-name { font-size: 11.5pt; font-weight: 700; color: #1a1a2e; margin-bottom: 4pt; }
  .party-line { font-size: 8.5pt; color: #4b5563; margin-bottom: 2pt; }

  /* ── BANK DETAILS ───────────────────────────────── */
  .bank-box {
    width: 100%;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-left: 4px solid #3b82f6;
    border-radius: 0 6pt 6pt 0;
    padding: 10pt 14pt;
    font-size: 8.5pt;
    color: #1e3a5f;
    margin-bottom: 18pt;
  }
  .bank-box-label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 5pt; color: #1d4ed8; }

  /* ── SECTION TITLE ──────────────────────────────── */
  .section-title {
    font-size: 11pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #fff;
    background: #1e3a5f;
    padding: 6pt 12pt;
    border-radius: 4pt;
    margin-bottom: 12pt;
  }

  /* ── ITEMS TABLE ────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; }
  thead th {
    background: #1e3a5f;
    color: #fff;
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 7pt 9pt;
    text-align: left;
  }
  thead th.td-right { text-align: right; }
  thead th.td-center { text-align: center; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 7pt 9pt; vertical-align: top; }
  .td-right { text-align: right; }
  .td-center { text-align: center; }
  .fw-600 { font-weight: 600; }
  .item-name { font-weight: 600; font-size: 9pt; }
  .item-sku { font-size: 7.5pt; color: #9ca3af; margin-top: 1.5pt; }

  /* ── TOTALS BLOCK ───────────────────────────────── */
  .totals-wrapper { display: flex; justify-content: flex-end; margin-top: 6pt; margin-bottom: 0; }
  .totals-table { width: 240pt; }
  .totals-row { display: flex; justify-content: space-between; padding: 4pt 0; font-size: 9pt; border-bottom: 1px solid #f1f5f9; }
  .totals-row:last-child { border-bottom: none; }
  .totals-label { color: #6b7280; }
  .totals-value { font-weight: 600; text-align: right; }
  .totals-total {
    background: #1e3a5f;
    color: #fff;
    padding: 7pt 10pt;
    border-radius: 4pt;
    margin-top: 5pt;
    display: flex;
    justify-content: space-between;
    font-size: 12pt;
    font-weight: 700;
  }
  .totals-balance {
    background: #fef3c7;
    border: 1px solid #fcd34d;
    color: #92400e;
    padding: 5pt 10pt;
    border-radius: 4pt;
    margin-top: 5pt;
    display: flex;
    justify-content: space-between;
    font-size: 9.5pt;
    font-weight: 700;
  }

  /* ── PAYMENT HISTORY ────────────────────────────── */
  .hist-table thead th { background: #374151; }
  .hist-table tbody tr:nth-child(even) { background: #f9fafb; }
  .hist-total-row { background: #f0fdf4 !important; font-weight: 700; }

  /* ── TERMS / NOTES (single-column stacked) ──────── */
  .notes-stack { margin-bottom: 0; }
  .notes-box { margin-bottom: 12pt; }
  .notes-box:last-child { margin-bottom: 0; }
  .notes-label { font-size: 9.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #1e3a5f; margin-bottom: 6pt; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 3pt; }
  .notes-text {
    font-size: 9pt;
    color: #374151;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-left: 4px solid #94a3b8;
    border-radius: 0 6pt 6pt 0;
    padding: 9pt 12pt;
    line-height: 1.6;
  }
  .notes-text p { margin: 0 0 5pt; }
  .notes-text p:last-child { margin-bottom: 0; }
  .notes-text ul, .notes-text ol { margin: 0 0 5pt; padding-left: 16pt; }
  .notes-text li { margin-bottom: 2.5pt; }
  .notes-text h1, .notes-text h2, .notes-text h3 { font-size: 10pt; font-weight: 700; margin: 5pt 0 3pt; color: #1e3a5f; }
  .notes-text strong { font-weight: 700; }
  .notes-text em { font-style: italic; }
  .notes-text blockquote { border-left: 2pt solid #cbd5e1; margin: 5pt 0; padding-left: 8pt; color: #6b7280; }

  /* ── FOOTER ─────────────────────────────────────── */
  .inv-footer {
    border-top: 2px solid #e5e7eb;
    margin-top: 20pt;
    padding-top: 10pt;
    font-size: 8pt;
    color: #6b7280;
    text-align: center;
    line-height: 1.7;
  }
  .inv-footer strong { color: #374151; }

  .page-break { page-break-before: always; }
</style>
</head>
<body>

<!-- ═══════════════════ HEADER ═══════════════════ -->
<div class="inv-header">
  <div class="inv-header-left">
    ${logoHtml}
    ${settings.companyTagline ? `<div class="company-tagline">${esc(settings.companyTagline)}</div>` : ""}
    <div style="margin-top:8pt;">
      ${sellerLines.map(l => `<div class="party-line">${l}</div>`).join("")}
    </div>
  </div>
  <div class="inv-header-right">
    <div class="inv-title">${esc(inv.invoiceTitle || "Invoice")}</div>
    <div class="inv-meta">
      <div class="inv-meta-row">
        <span class="inv-meta-label">Invoice No:</span>
        <span class="inv-meta-value" style="color:#1e3a5f;font-size:10pt;">${esc(inv.invoiceNumber)}</span>
      </div>
      <div class="inv-meta-row">
        <span class="inv-meta-label">Invoice Date:</span>
        <span class="inv-meta-value">${fmtDate(inv.invoiceDate)}</span>
      </div>
      <div class="inv-meta-row">
        <span class="inv-meta-label">Due Date:</span>
        <span class="inv-meta-value" style="${inv.status === "Overdue" ? "color:#ef4444" : ""}">${fmtDate(inv.dueDate)}</span>
      </div>
      ${inv.paymentMethod ? `
      <div class="inv-meta-row">
        <span class="inv-meta-label">Payment:</span>
        <span class="inv-meta-value">${esc(inv.paymentMethod)}</span>
      </div>` : ""}
    </div>
    <div><span class="status-badge">${esc(inv.status)}</span></div>
  </div>
</div>

<!-- ═══════════════════ FROM / TO ═══════════════════ -->
<div class="section parties-row">
  <div class="party">
    <div class="party-label">Bill From</div>
    <div class="party-name">${esc(settings.companyName)}</div>
    ${sellerLines.map(l => `<div class="party-line">${l}</div>`).join("")}
  </div>
  <div class="party">
    <div class="party-label">Bill To</div>
    <div class="party-name">${esc(inv.customer || "—")}</div>
    ${buyerLines.map(l => `<div class="party-line">${l}</div>`).join("")}
  </div>
</div>

${bankText ? `
<!-- ═══════════════════ BANK DETAILS ═══════════════════ -->
<div class="bank-box">
  <div class="bank-box-label">Payment / Bank Details</div>
  <div style="white-space:pre-line;">${nl2br(bankText)}</div>
</div>
` : ""}

<!-- ═══════════════════ ITEMS ═══════════════════ -->
<div class="section-title">Items &amp; Services</div>
<table>
  <thead>
    <tr>
      <th class="td-center" style="width:24pt">#</th>
      <th>Description</th>
      <th class="td-right" style="width:36pt">Unit</th>
      <th class="td-right" style="width:32pt">Qty</th>
      <th class="td-right" style="width:56pt">Unit Price</th>
      <th class="td-right" style="width:36pt">Disc</th>
      <th class="td-right" style="width:60pt">Total</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<!-- ═══════════════════ TOTALS ═══════════════════ -->
<div class="totals-wrapper">
  <div class="totals-table">
    <div class="totals-row">
      <span class="totals-label">Subtotal</span>
      <span class="totals-value">${fmt(subtotal)}</span>
    </div>
    ${discountAmt > 0 ? `
    <div class="totals-row">
      <span class="totals-label">Discount</span>
      <span class="totals-value" style="color:#ef4444">− ${fmt(discountAmt)}</span>
    </div>` : ""}
    ${discountAmt > 0 ? `
    <div class="totals-row">
      <span class="totals-label">After Discount</span>
      <span class="totals-value">${fmt(afterDisc)}</span>
    </div>` : ""}
    ${parseFloat(inv.taxRate) > 0 ? `
    <div class="totals-row">
      <span class="totals-label">Tax / VAT (${esc(inv.taxRate)}%)</span>
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
      <span>TOTAL</span>
      <span>${fmt(total)}</span>
    </div>
    ${paid > 0 ? `
    <div class="totals-row" style="margin-top:4pt;">
      <span class="totals-label">Amount Paid</span>
      <span class="totals-value" style="color:#10b981">− ${fmt(paid)}</span>
    </div>` : ""}
    ${balance > 0 ? `
    <div class="totals-balance">
      <span>BALANCE DUE</span>
      <span>${fmt(balance)}</span>
    </div>` : ""}
    ${paid >= total && total > 0 ? `
    <div style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:4pt 10pt;border-radius:4pt;margin-top:4pt;text-align:center;font-size:8pt;font-weight:700;">
      ✓ FULLY PAID${inv.paidAt ? " — " + new Date(inv.paidAt).toLocaleDateString("en-GB") : ""}
    </div>` : ""}
  </div>
</div>

${(inv.paymentHistory ?? []).length > 0 ? `
<!-- ═══════════════════ PAYMENT HISTORY ═══════════════════ -->
<div class="section-title">Payment History</div>
<table class="hist-table">
  <thead>
    <tr>
      <th style="width:80pt">Date</th>
      <th style="width:70pt">Method</th>
      <th>Note</th>
      <th class="td-right" style="width:60pt">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${histRows}
    <tr class="hist-total-row">
      <td colspan="3" class="td-right" style="font-weight:700;">Total Received</td>
      <td class="td-right fw-600" style="color:#166534;">${fmt(histTotal)}</td>
    </tr>
  </tbody>
</table>
<div style="margin-bottom:12pt;"></div>
` : ""}

<!-- ═══════════════════ TERMS & NOTES ═══════════════════ -->
${(() => {
  // Prefer new invoiceDocs; fall back to legacy fields for old invoices
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
<div class="section">
  <div class="section-title">Terms &amp; Notes</div>
  <div class="notes-stack">
    ${docsToRender.map(d => `
    <div class="notes-box">
      <div class="notes-label">${esc(d.title)}</div>
      <div class="notes-text">${renderContent(d.content)}</div>
    </div>`).join("")}
  </div>
</div>`;
})()}

<!-- ═══════════════════ FOOTER ═══════════════════ -->
<div class="inv-footer">
  <!-- Company identity -->
  <div style="margin-bottom:5pt;">
    ${settings.logoBase64
      ? `<img src="${esc(settings.logoBase64)}" alt="Logo" style="max-height:28pt;max-width:90pt;object-fit:contain;vertical-align:middle;margin-right:6pt;"/>`
      : ""}
    <strong>${esc(settings.companyName)}</strong>
    ${settings.companyTagline ? `&nbsp;·&nbsp; ${esc(settings.companyTagline)}` : ""}
  </div>
  <!-- Contact line -->
  ${(settings.phoneHull || settings.phoneIslamabad || settings.emailHull || settings.emailIslamabad || settings.website) ? `
  <div style="margin-bottom:4pt;">
    ${settings.phoneHull        ? `<span>${esc(settings.phoneHull)} (UK)</span>` : ""}
    ${settings.phoneIslamabad   ? `<span>${settings.phoneHull ? " &nbsp;·&nbsp; " : ""}${esc(settings.phoneIslamabad)} (PK)</span>` : ""}
    ${settings.emailHull        ? `<span>&nbsp;·&nbsp; ${esc(settings.emailHull)}</span>` : ""}
    ${settings.emailIslamabad   ? `<span>&nbsp;·&nbsp; ${esc(settings.emailIslamabad)}</span>` : ""}
    ${settings.website          ? `<span>&nbsp;·&nbsp; ${esc(settings.website)}</span>` : ""}
  </div>` : ""}
  <!-- Address line -->
  ${(settings.addressHull || settings.addressIslamabad) ? `
  <div style="margin-bottom:4pt;">
    ${settings.addressHull      ? `<span>${esc(settings.addressHull)}</span>` : ""}
    ${settings.addressIslamabad ? `<span>${settings.addressHull ? " &nbsp;·&nbsp; " : ""}${esc(settings.addressIslamabad)}</span>` : ""}
  </div>` : ""}
  <!-- Registration / VAT / social -->
  ${footerParts.length > 0 ? `<div style="margin-bottom:4pt;">${footerParts.join(" &nbsp;·&nbsp; ")}</div>` : ""}
  <!-- Custom invoice footer text -->
  ${settingsFooter ? `<div style="margin-bottom:4pt;">${nl2br(settingsFooter)}</div>` : ""}
  <div style="margin-top:6pt;font-size:7pt;color:#d1d5db;">This is a computer-generated document. No signature required.</div>
</div>

</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
