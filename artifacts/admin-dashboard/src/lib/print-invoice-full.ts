/**
 * Full A4 professional invoice print
 * Layout: compact header → Bill To only → items → totals →
 *         payment history → bank details table → terms → footer
 */
import {
  Invoice, AppSettings, getCustomerPreviousBalance, LabelStyle,
  getInvoiceLabels, getInvoiceLabelStyles,
  getPurchaseInvoiceLabels, getPurchaseInvoiceLabelStyles,
} from "./store";

// Convert a LabelStyle to an inline CSS string for use in HTML attributes
function toInlineCSS(s?: LabelStyle): string {
  if (!s) return "";
  const parts: string[] = [];
  if (s.color)         parts.push(`color:${s.color}`);
  if (s.fontSize)      parts.push(`font-size:${s.fontSize}pt`);
  if (s.fontWeight)    parts.push(`font-weight:${s.fontWeight}`);
  if (s.fontStyle)     parts.push(`font-style:${s.fontStyle}`);
  if (s.textTransform && s.textTransform !== "none") parts.push(`text-transform:${s.textTransform}`);
  return parts.join(";");
}

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nl2br = (s: string) => esc(s).replace(/\n/g, "<br/>");

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

function fmtDateShort(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function getCurrencySymbol(currency: string): string {
  try {
    return (0)
      .toLocaleString("en", { style: "currency", currency: currency || "GBP", minimumFractionDigits: 0 })
      .replace(/[\d,. ]/g, "").trim();
  } catch { return "£"; }
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

// ── Parse bank details text into structured rows ──────────────────────────────
// Each blank-line-separated block = one bank account
interface BankEntry {
  name:    string;
  acName:  string;
  acNo:    string;
  sort:    string;
  iban:    string;
  swift:   string;
  extra:   string[];
}

function parseBankDetails(text: string): BankEntry[] {
  if (!text?.trim()) return [];
  const blocks = text.split(/\n{2,}|\r\n{2,}|---+/).map(b => b.trim()).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    const entry: BankEntry = { name:"", acName:"", acNo:"", sort:"", iban:"", swift:"", extra:[] };
    const getVal = (line: string) => line.split(/:\s*(.+)/)[1]?.trim() ?? "";
    lines.forEach((l, i) => {
      const ll = l.toLowerCase();
      if (i === 0 && !ll.includes(":"))         { entry.name   = l; }
      else if (ll.startsWith("bank"))            { entry.name   = entry.name || getVal(l) || l; }
      else if (ll.includes("account name"))      { entry.acName = getVal(l); }
      else if (ll.includes("account no") ||
               ll.includes("account number") ||
               ll.includes("acc no"))            { entry.acNo   = getVal(l); }
      else if (ll.includes("sort code") ||
               ll.includes("sort"))              { entry.sort   = getVal(l); }
      else if (ll.startsWith("iban"))            { entry.iban   = getVal(l); }
      else if (ll.startsWith("swift") ||
               ll.startsWith("bic"))             { entry.swift  = getVal(l); }
      else                                       { entry.extra.push(l); }
    });
    return entry;
  });
}

export function printFullInvoice(inv: Invoice, settings: AppSettings): void {
  const sym = getCurrencySymbol(settings.currency);
  const fmt = (n: number) => fmtMoney(n, sym);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subtotal    = inv.items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.unitPrice)||0), 0);
  const discountAmt = inv.items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.unitPrice)||0) * ((parseFloat(i.discount)||0)/100), 0);
  const afterDisc   = subtotal - discountAmt;
  const taxAmt      = afterDisc * (parseFloat(inv.taxRate)||0) / 100;
  const shipping    = parseFloat(inv.shippingFee) || 0;
  const handling    = parseFloat(inv.handlingFee) || 0;
  const total       = afterDisc + taxAmt + shipping + handling;
  const paid        = parseFloat(inv.amountPaid) || 0;
  const balance     = Math.max(0, total - paid);
  const histTotal   = (inv.paymentHistory ?? []).reduce((s, r) => s + (parseFloat(r.amount)||0), 0);

  // ── Invoice type ─────────────────────────────────────────────────────────
  const isSale = !inv.invoiceType || inv.invoiceType === "sale";

  // ── Invoice labels (user-customisable, separate sets per type) ───────────
  const L  = isSale ? getInvoiceLabels()         : getPurchaseInvoiceLabels();
  const LS = isSale ? getInvoiceLabelStyles()     : getPurchaseInvoiceLabelStyles();
  // Helper: wrap label text with inline style if custom style exists
  const sl = (key: string, text: string, extra?: string): string => {
    const css = toInlineCSS(LS[key]);
    const s = [css, extra].filter(Boolean).join(";");
    return s ? `<span style="${s}">${esc(text)}</span>` : esc(text);
  };

  // ── Previous / New balance (sale invoices only) ──────────────────────────
  const prevBalance = isSale ? getCustomerPreviousBalance(inv.customer, inv.id) : 0;
  const newBalance  = prevBalance + total;

  // ── Status colours ──────────────────────────────────────────────────────────
  const statusColors: Record<string, string> = {
    Draft:"#64748b", Sent:"#3b82f6", Paid:"#10b981",
    Partial:"#f59e0b", Overdue:"#ef4444", Cancelled:"#9ca3af",
  };
  const statusBg: Record<string, string> = {
    Draft:"#f1f5f9", Sent:"#eff6ff", Paid:"#f0fdf4",
    Partial:"#fffbeb", Overdue:"#fef2f2", Cancelled:"#f9fafb",
  };
  const statusColor   = statusColors[inv.status] ?? "#64748b";
  const statusBgColor = statusBg[inv.status] ?? "#f1f5f9";

  // ── Logo ────────────────────────────────────────────────────────────────────
  const logoHtml = settings.logoBase64
    ? `<img src="${esc(settings.logoBase64)}" alt="Logo" class="logo"/>`
    : `<span class="logo-text">${esc(settings.companyName)}</span>`;

  // ── Buyer lines ─────────────────────────────────────────────────────────────
  const buyerLines: string[] = [];
  if (inv.buyerPhone)    buyerLines.push(esc(inv.buyerPhone));
  if (inv.buyerAddress)  buyerLines.push(nl2br(inv.buyerAddress));
  if (inv.buyerTown)     buyerLines.push(esc(inv.buyerTown));
  if (inv.agentName)     buyerLines.push(`<strong>Sales Officer:</strong> ${esc(inv.agentName)}`);

  // ── Seller compact footer lines ──────────────────────────────────────────────
  const footerInfoParts: string[] = [];
  const showContact = settings.printFooterShowContact !== false; // default true
  if (showContact) {
    if (settings.addressHull)         footerInfoParts.push(esc(settings.addressHull));
    if (settings.addressIslamabad)    footerInfoParts.push(esc(settings.addressIslamabad));
    if (settings.phoneHull)           footerInfoParts.push(`Tel: ${esc(settings.phoneHull)}`);
    if (settings.emailHull)           footerInfoParts.push(esc(settings.emailHull));
    if (settings.website)             footerInfoParts.push(esc(settings.website));
    if (settings.vatNumber)           footerInfoParts.push(`VAT No: ${esc(settings.vatNumber)}`);
    if (settings.companyRegistration) footerInfoParts.push(`Reg: ${esc(settings.companyRegistration)}`);
  }
  const footerLegal    = settings.invoiceFooter;
  const footerLegalNote = settings.printFooterLegalNote
    ?? "This is a computer-generated document. No handwritten signature is required.";

  // ── RTL flag ────────────────────────────────────────────────────────────────
  const rtl = settings.invoiceColsRTL ?? false;

  // ── Resolve product display name at print time ───────────────────────────────
  // If the setting is "localName" and the item carries a localName, use it;
  // otherwise fall back to productName (handles both old and new invoices).
  const useLocalName = (settings.invoiceProductNameField ?? "name") === "localName";
  const resolveItemName = (item: { productName: string; localName?: string }): string =>
    useLocalName && item.localName?.trim() ? item.localName.trim() : item.productName || "—";

  // ── Item rows ───────────────────────────────────────────────────────────────
  const itemRows = inv.items.map((item, i) => {
    const lt   = lineTotal(item);
    const disc = parseFloat(item.discount) || 0;
    const displayName = resolveItemName(item);
    const descCell = `
          <div class="item-name">${esc(displayName)}</div>
          ${item.sku   ? `<div class="item-meta">SKU: ${esc(item.sku)}</div>` : ""}
          ${item.notes ? `<div class="item-meta">${esc(item.notes)}</div>` : ""}`;
    const discCell = disc > 0 ? `<span class="disc-badge">${disc.toFixed(1)}%</span>` : "—";
    const altClass = i % 2 === 1 ? "row-alt" : "";
    if (rtl) {
      return `
      <tr class="${altClass}">
        <td class="td-left total-col">${fmt(lt)}</td>
        <td class="td-left disc-col">${discCell}</td>
        <td class="td-left">${fmt(parseFloat(item.unitPrice)||0)}</td>
        <td class="td-left">${parseFloat(item.qty)||0}</td>
        <td class="td-left">${esc(item.unit)}</td>
        <td class="td-right">${descCell}</td>
        <td class="td-center num-col">${i + 1}</td>
      </tr>`;
    }
    return `
      <tr class="${altClass}">
        <td class="td-center num-col">${i + 1}</td>
        <td>${descCell}</td>
        <td class="td-right">${esc(item.unit)}</td>
        <td class="td-right">${parseFloat(item.qty)||0}</td>
        <td class="td-right">${fmt(parseFloat(item.unitPrice)||0)}</td>
        <td class="td-right disc-col">${discCell}</td>
        <td class="td-right total-col">${fmt(lt)}</td>
      </tr>`;
  }).join("");

  // ── Payment history rows ─────────────────────────────────────────────────────
  const histRows = (inv.paymentHistory ?? []).map(r => `
    <tr>
      <td>${fmtDateShort(r.date)}</td>
      <td>${esc(r.method)}</td>
      <td>${esc(r.note)}</td>
      <td class="td-right fw-600">${fmt(parseFloat(r.amount)||0)}</td>
    </tr>`).join("");

  // ── Bank details table ───────────────────────────────────────────────────────
  const bankText  = inv.bankDetails || settings.bankDetails || "";
  const bankEntries = parseBankDetails(bankText);

  // Figure out which columns to show
  const showAcName = bankEntries.some(b => b.acName);
  const showAcNo   = bankEntries.some(b => b.acNo);
  const showSort   = bankEntries.some(b => b.sort);
  const showIban   = bankEntries.some(b => b.iban);
  const showSwift  = bankEntries.some(b => b.swift);

  const bankTableHtml = bankEntries.length > 0 ? (() => {
    const heads = [
      `<th style="min-width:90pt">Bank</th>`,
      showAcName ? `<th>Account Name</th>` : "",
      showAcNo   ? `<th style="min-width:72pt">Account No.</th>` : "",
      showSort   ? `<th style="min-width:52pt">Sort Code</th>` : "",
      showIban   ? `<th>IBAN</th>` : "",
      showSwift  ? `<th style="min-width:52pt">SWIFT/BIC</th>` : "",
    ].filter(Boolean).join("");

    const rows = bankEntries.map((b, i) => {
      const cells = [
        `<td class="bank-cell-name">${esc(b.name || `Bank ${i+1}`)}</td>`,
        showAcName ? `<td>${esc(b.acName)}</td>` : "",
        showAcNo   ? `<td class="mono">${esc(b.acNo)}</td>` : "",
        showSort   ? `<td class="mono">${esc(b.sort)}</td>` : "",
        showIban   ? `<td class="mono small-text">${esc(b.iban)}</td>` : "",
        showSwift  ? `<td class="mono">${esc(b.swift)}</td>` : "",
      ].filter(Boolean).join("");
      return `<tr class="${i % 2 === 1 ? "row-alt" : ""}">${cells}</tr>`;
    }).join("");

    return `
<div class="section">
  <div class="section-heading">
    <div class="section-heading-bar"></div>
    <div class="section-heading-text">Bank / Payment Details</div>
    <div class="section-heading-rule"></div>
  </div>
  <table class="bank-table">
    <thead><tr>${heads}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  })() : bankText ? `
<div class="section">
  <div class="section-heading">
    <div class="section-heading-bar"></div>
    <div class="section-heading-text">Bank / Payment Details</div>
    <div class="section-heading-rule"></div>
  </div>
  <div class="bank-plain">${nl2br(bankText)}</div>
</div>` : "";

  // ── Terms & notes block ──────────────────────────────────────────────────────
  const docsToRender: Array<{title: string; content: string}> = [];
  if (inv.invoiceDocs?.length) {
    inv.invoiceDocs.forEach(d => { if (d.content) docsToRender.push(d); });
  } else {
    if (inv.paymentTerms || settings.invoiceTerms) docsToRender.push({ title:"Payment Terms", content: inv.paymentTerms || settings.invoiceTerms });
    if (inv.agreement) docsToRender.push({ title:"Agreement", content: inv.agreement });
    if (inv.notes)     docsToRender.push({ title:"Additional Notes", content: inv.notes });
  }

  // ────────────────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="${rtl ? "ur" : "en"}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8"/>
<title>${esc(inv.invoiceTitle || "Invoice")} ${esc(inv.invoiceNumber)}</title>
<style>
  *, *::before, *::after {
    box-sizing: border-box; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    html, body { width: 210mm; }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }

  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    font-size: 9.5pt;
    color: #1e293b;
    background: #fff;
    line-height: 1.5;
  }

  /* ── HEADER — compact single band ──────────────────────────────────────── */
  .inv-header {
    background: #0f2447;
    color: #fff;
    padding: 16pt 24pt;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20pt;
  }
  .inv-header-left { display: flex; align-items: center; gap: 12pt; }
  .logo { max-height: 44px; max-width: 140px; object-fit: contain; filter: brightness(0) invert(1); }
  .logo-text { font-size: 18pt; font-weight: 800; color: #fff; letter-spacing: -0.5px; line-height: 1; }
  .company-tagline { font-size: 8pt; color: #94a3b8; margin-top: 3pt; }

  .inv-header-right { text-align: right; flex-shrink: 0; }
  .inv-title { font-size: 22pt; font-weight: 900; color: #fff; letter-spacing: 2px; text-transform: uppercase; line-height: 1; }
  .inv-number { font-size: 10pt; font-weight: 700; color: #60a5fa; margin-top: 3pt; letter-spacing: 0.5px; }

  /* ── SUBHEADER: Bill To + meta strip ──────────────────────────────────── */
  .subheader {
    display: flex;
    gap: 0;
    border-bottom: 2px solid #e2e8f0;
  }
  .bill-to-box {
    flex: 1;
    padding: 12pt 16pt 12pt 24pt;
    border-right: 1.5px solid #e2e8f0;
  }
  .bill-to-label {
    font-size: 7pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #94a3b8;
    margin-bottom: 5pt;
  }
  .bill-to-name { font-size: 13pt; font-weight: 800; color: #0f172a; margin-bottom: 4pt; line-height: 1.2; }
  .bill-to-line { font-size: 8.5pt; color: #475569; margin-bottom: 2pt; line-height: 1.4; }
  .buyer-ref { background: #f1f5f9; color: #475569; font-size: 7.5pt; font-weight: 600;
               padding: 1pt 5pt; border-radius: 3pt; }

  .meta-strip {
    width: 180pt;
    flex-shrink: 0;
    padding: 12pt 24pt 12pt 16pt;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5pt;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8pt;
    font-size: 8.5pt;
  }
  .meta-label { color: #94a3b8; white-space: nowrap; }
  .meta-value { font-weight: 700; color: #1e293b; text-align: right; }
  .meta-value.overdue { color: #ef4444; }
  .status-badge {
    align-self: flex-end;
    margin-top: 4pt;
    display: inline-block;
    padding: 3pt 10pt;
    border-radius: 20pt;
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    background: ${statusBgColor};
    color: ${statusColor};
    border: 1.5px solid ${statusColor};
  }

  /* ── BODY ───────────────────────────────────────────────────────────────── */
  .body-content { padding: 16pt 24pt 20pt; }
  .section { margin-bottom: 18pt; }

  /* ── SECTION HEADING ───────────────────────────────────────────────────── */
  .section-heading { display: flex; align-items: center; gap: 8pt; margin-bottom: 10pt; }
  .section-heading-bar { width: 4pt; height: 14pt; background: #0f2447; border-radius: 2pt; flex-shrink: 0; }
  .section-heading-text { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #0f2447; }
  .section-heading-rule { flex: 1; height: 1.5px; background: #e2e8f0; }

  /* ── ITEMS TABLE ───────────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #0f2447; }
  thead th { color: #94a3b8; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 7pt 10pt; text-align: left; }
  thead th.td-right  { text-align: right; }
  thead th.td-center { text-align: center; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr.row-alt { background: #f8fafc; }
  tbody td { padding: 7pt 10pt; vertical-align: top; font-size: 9pt; }
  tbody tr:last-child { border-bottom: 2px solid #e2e8f0; }
  .num-col   { width: 22pt; color: #94a3b8; font-size: 8pt; }
  .disc-col  { width: 38pt; }
  .total-col { width: 64pt; font-weight: 700; color: #0f172a; }
  .td-right  { text-align: right; }
  .td-left   { text-align: left; }
  .td-center { text-align: center; }
  .fw-600    { font-weight: 600; }
  .item-name { font-weight: 700; font-size: 9.5pt; color: #0f172a; }
  .item-meta { font-size: 7.5pt; color: #94a3b8; margin-top: 2pt; }
  .disc-badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 7pt; font-weight: 700; padding: 1pt 4pt; border-radius: 3pt; }

  /* ── TOTALS BLOCK ──────────────────────────────────────────────────────── */
  .totals-wrapper { display: flex; justify-content: ${rtl ? "flex-start" : "flex-end"}; margin-top: 8pt; }
  .totals-table { width: 220pt; }
  .totals-row { display: flex; justify-content: space-between; align-items: center; padding: 4pt 8pt; font-size: 9pt; border-bottom: 1px solid #f1f5f9; }
  .totals-row:last-child { border-bottom: none; }
  .totals-label { color: #64748b; }
  .totals-value { font-weight: 600; color: #1e293b; }
  .totals-subtotal-row { background: #f8fafc; border-radius: 3pt 3pt 0 0; }
  .totals-total { background: #0f2447; color: #fff; padding: 8pt 12pt; border-radius: 5pt; margin-top: 6pt; display: flex; justify-content: space-between; align-items: center; }
  .totals-total-label { font-size: 9pt; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
  .totals-total-amount { font-size: 14pt; font-weight: 900; color: #fff; }
  .totals-balance { background: linear-gradient(135deg,#fef3c7,#fde68a); border: 1.5px solid #fbbf24; color: #78350f; padding: 7pt 12pt; border-radius: 5pt; margin-top: 5pt; display: flex; justify-content: space-between; align-items: center; font-size: 10pt; font-weight: 800; }
  .totals-prev-bal { display: flex; justify-content: space-between; align-items: center; padding: 5pt 12pt; font-size: 9pt; color: #475569; border-bottom: 1px solid #e2e8f0; margin-top: 4pt; }
  .totals-new-bal  { background: #1e293b; color: #fff; padding: 8pt 12pt; border-radius: 5pt; margin-top: 4pt; display: flex; justify-content: space-between; align-items: center; border-top: 3px double #94a3b8; }
  .totals-new-bal-label { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; }
  .totals-new-bal-amount { font-size: 13pt; font-weight: 900; color: #fff; }
  .fully-paid { background: #f0fdf4; border: 1.5px solid #86efac; color: #166534; padding: 7pt 12pt; border-radius: 5pt; margin-top: 5pt; text-align: center; font-size: 9pt; font-weight: 800; }

  /* ── PAYMENT HISTORY TABLE ─────────────────────────────────────────────── */
  .hist-table thead tr { background: #334155; }
  .hist-table tbody tr.row-alt { background: #f8fafc; }
  .hist-total-row { background: #f0fdf4 !important; }
  .hist-total-row td { font-weight: 700; color: #166534; }

  /* ── BANK DETAILS TABLE ────────────────────────────────────────────────── */
  .bank-table thead tr { background: #1e3a5f; }
  .bank-table thead th { color: #93c5fd; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 7pt 10pt; text-align: left; }
  .bank-table tbody td { padding: 7pt 10pt; font-size: 9pt; vertical-align: middle; }
  .bank-cell-name { font-weight: 700; color: #1e3a8a; }
  .mono { font-family: 'Courier New', monospace; font-size: 8.5pt; color: #1e293b; letter-spacing: 0.3px; }
  .small-text { font-size: 8pt; }
  .bank-plain { font-size: 8.5pt; color: #1e3a5f; white-space: pre-line; background: #f0f7ff; border: 1.5px solid #bfdbfe; border-radius: 5pt; padding: 10pt 14pt; }

  /* ── TERMS / NOTES ─────────────────────────────────────────────────────── */
  .notes-box { margin-bottom: 14pt; }
  .notes-box:last-child { margin-bottom: 0; }
  .notes-label { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #0f2447; margin-bottom: 6pt; padding-left: 8pt; border-left: 3pt solid #0f2447; }
  .notes-text { font-size: 9pt; color: #374151; background: #f8fafc; border: 1.5px solid #e5e7eb; border-radius: 5pt; padding: 10pt 14pt; line-height: 1.65; }
  .notes-text p { margin: 0 0 5pt; }
  .notes-text p:last-child { margin-bottom: 0; }
  .notes-text ul, .notes-text ol { margin: 0 0 5pt; padding-left: 16pt; }
  .notes-text li { margin-bottom: 2.5pt; }
  .notes-text h1, .notes-text h2, .notes-text h3 { font-size: 10pt; font-weight: 700; margin: 5pt 0 3pt; color: #0f2447; }
  .notes-text strong { font-weight: 700; }
  .notes-text em { font-style: italic; }
  .notes-text blockquote { border-left: 2pt solid #cbd5e1; margin: 5pt 0; padding-left: 8pt; color: #6b7280; }

  /* ── FOOTER BAND ───────────────────────────────────────────────────────── */
  .inv-footer { background: #0f2447; color: #94a3b8; padding: 12pt 24pt; margin-top: 20pt; font-size: 7.5pt; line-height: 1.7; text-align: center; }
  .inv-footer-company { font-size: 9.5pt; font-weight: 700; color: #e2e8f0; margin-bottom: 3pt; }
  .inv-footer-line { color: #64748b; margin-bottom: 1.5pt; }
  .inv-footer-legal { font-size: 7pt; color: #334155; margin-top: 6pt; padding-top: 5pt; border-top: 1px solid #1e3a5f; }
</style>
</head>
<body>
<div class="page">

<!-- ══════════════════ COMPACT HEADER ══════════════════ -->
<div class="inv-header">
  <div class="inv-header-left">
    <div>
      ${logoHtml}
      ${settings.companyTagline ? `<div class="company-tagline">${esc(settings.companyTagline)}</div>` : ""}
      ${settings.printHeaderNote ? `<div style="font-size:7.5pt;color:#cbd5e1;margin-top:4pt;font-style:italic;">${nl2br(settings.printHeaderNote)}</div>` : ""}
    </div>
  </div>
  <div class="inv-header-right">
    <div class="inv-title">${sl("invoiceTitle", L.invoiceTitle || inv.invoiceTitle || "Invoice")}</div>
    <div class="inv-number">${esc(inv.invoiceNumber)}</div>
  </div>
</div>

<!-- ══════════════════ BILL TO + META STRIP ══════════════════ -->
<div class="subheader">
  <div class="bill-to-box">
    <div class="bill-to-label">${sl("billTo", L.billTo)}</div>
    <div class="bill-to-name">${esc(inv.customer || "—")}</div>
    ${buyerLines.map(l => `<div class="bill-to-line">${l}</div>`).join("")}
  </div>
  <div class="meta-strip">
    <div class="meta-row">
      <span class="meta-label">${sl("invoiceDateLabel", L.invoiceDateLabel)}</span>
      <span class="meta-value">${fmtDateShort(inv.invoiceDate)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">${sl("dueDateLabel", L.dueDateLabel)}</span>
      <span class="meta-value${inv.status === "Overdue" ? " overdue" : ""}">${fmtDateShort(inv.dueDate)}</span>
    </div>
    ${inv.paymentMethod ? `
    <div class="meta-row">
      <span class="meta-label">${sl("paymentViaLabel", L.paymentViaLabel)}</span>
      <span class="meta-value">${esc(inv.paymentMethod)}</span>
    </div>` : ""}
    <span class="status-badge">${esc(inv.status)}</span>
  </div>
</div>

<!-- ══════════════════ BODY ══════════════════ -->
<div class="body-content">

<!-- ITEMS & SERVICES -->
<div class="section">
  <div class="section-heading">
    <div class="section-heading-bar"></div>
    <div class="section-heading-text">${sl("itemsSectionTitle", L.itemsSectionTitle)}</div>
    <div class="section-heading-rule"></div>
  </div>
  <table>
    <thead>
      <tr>
        ${rtl ? `
        <th class="td-left total-col">${sl("colTotal", L.colTotal)}</th>
        <th class="td-left disc-col">${sl("colDisc", L.colDisc)}</th>
        <th class="td-left" style="width:60pt">${sl("colUnitPrice", L.colUnitPrice)}</th>
        <th class="td-left" style="width:32pt">${sl("colQty", L.colQty)}</th>
        <th class="td-left" style="width:36pt">${sl("colUnit", L.colUnit)}</th>
        <th class="td-right">${sl("colDescription", L.colDescription)}</th>
        <th class="td-center num-col">${sl("colNum", L.colNum)}</th>
        ` : `
        <th class="td-center num-col">${sl("colNum", L.colNum)}</th>
        <th>${sl("colDescription", L.colDescription)}</th>
        <th class="td-right" style="width:36pt">${sl("colUnit", L.colUnit)}</th>
        <th class="td-right" style="width:32pt">${sl("colQty", L.colQty)}</th>
        <th class="td-right" style="width:60pt">${sl("colUnitPrice", L.colUnitPrice)}</th>
        <th class="td-right disc-col">${sl("colDisc", L.colDisc)}</th>
        <th class="td-right total-col">${sl("colTotal", L.colTotal)}</th>
        `}
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- TOTALS -->
  <div class="totals-wrapper">
    <div class="totals-table">
      <div class="totals-row totals-subtotal-row">
        <span class="totals-label">${sl("subtotalLabel", L.subtotalLabel)}</span>
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
        <span class="totals-label">${sl("vatLabel", L.vatLabel)} (${esc(inv.taxRate)}%)</span>
        <span class="totals-value">${fmt(taxAmt)}</span>
      </div>` : ""}
      ${shipping > 0 ? `
      <div class="totals-row">
        <span class="totals-label">${sl("deliveryLabel", L.deliveryLabel)}${inv.shippingMethod ? ` (${esc(inv.shippingMethod)})` : ""}</span>
        <span class="totals-value">${fmt(shipping)}</span>
      </div>` : ""}
      ${handling > 0 ? `
      <div class="totals-row">
        <span class="totals-label">${sl("otherChargesLabel", L.otherChargesLabel)}</span>
        <span class="totals-value">${fmt(handling)}</span>
      </div>` : ""}
      <div class="totals-total">
        <span class="totals-total-label">${sl("totalLabel", L.totalLabel)}</span>
        <span class="totals-total-amount">${fmt(total)}</span>
      </div>
      ${paid > 0 ? `
      <div class="totals-row" style="margin-top:4pt;">
        <span class="totals-label">${sl("amountPaidLabel", L.amountPaidLabel)}</span>
        <span class="totals-value" style="color:#10b981">−${fmt(paid)}</span>
      </div>` : ""}
      ${balance > 0 ? `
      <div class="totals-balance">
        <span>${sl("balanceDueLabel", L.balanceDueLabel)}</span>
        <span>${fmt(balance)}</span>
      </div>` : ""}
      ${paid >= total && total > 0 ? `
      <div class="fully-paid">✓ &nbsp; ${sl("fullyPaidLabel", L.fullyPaidLabel)}${inv.paidAt ? " — " + fmtDate(inv.paidAt) : ""}</div>` : ""}
      ${isSale ? `
      <div class="totals-prev-bal">
        <span>${sl("previousBalanceLabel", L.previousBalanceLabel)}</span>
        <span>${fmt(prevBalance)}</span>
      </div>
      <div class="totals-new-bal">
        <span class="totals-new-bal-label">${sl("newBalanceLabel", L.newBalanceLabel)}</span>
        <span class="totals-new-bal-amount">${fmt(newBalance)}</span>
      </div>` : ""}
    </div>
  </div>
</div>

${(inv.paymentHistory ?? []).length > 0 ? `
<!-- PAYMENT HISTORY -->
<div class="section">
  <div class="section-heading">
    <div class="section-heading-bar"></div>
    <div class="section-heading-text">${sl("paymentHistoryTitle", L.paymentHistoryTitle)}</div>
    <div class="section-heading-rule"></div>
  </div>
  <table class="hist-table">
    <thead>
      <tr>
        <th style="width:80pt">Date</th>
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

${bankTableHtml}

${docsToRender.length > 0 ? `
<!-- TERMS & NOTES -->
<div class="section">
  <div class="section-heading">
    <div class="section-heading-bar"></div>
    <div class="section-heading-text">${sl("termsSectionTitle", L.termsSectionTitle)}</div>
    <div class="section-heading-rule"></div>
  </div>
  <div class="notes-stack">
    ${docsToRender.map(d => `
    <div class="notes-box">
      <div class="notes-label">${esc(d.title)}</div>
      <div class="notes-text">${renderContent(d.content)}</div>
    </div>`).join("")}
  </div>
</div>` : ""}

</div><!-- /body-content -->

<!-- ══════════════════ FOOTER ══════════════════ -->
<div class="inv-footer">
  <div class="inv-footer-company">
    ${esc(settings.companyName)}${settings.companyTagline ? ` — ${esc(settings.companyTagline)}` : ""}
  </div>
  ${footerInfoParts.length > 0 ? `<div class="inv-footer-line">${footerInfoParts.join(" &nbsp;·&nbsp; ")}</div>` : ""}
  ${footerLegal ? `<div class="inv-footer-line">${nl2br(footerLegal)}</div>` : ""}
  ${L.footerNote ? `<div class="inv-footer-line" style="font-style:italic;">${esc(L.footerNote)}</div>` : ""}
  ${footerLegalNote ? `<div class="inv-footer-legal">${nl2br(footerLegalNote)}</div>` : ""}
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
