import type { Sale, SaleItem, AppSettings } from "./store";

const esc = (s: string): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const lineTotal = (item: SaleItem): number => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  const d = parseFloat(item.discount) || 0;
  return q * p * (1 - d / 100);
};

function currencySymbol(code: string): string {
  try { return (0).toLocaleString("en", { style: "currency", currency: code, minimumFractionDigits: 0 }).replace(/[\d,. ]/g, "").trim(); }
  catch { return code + " "; }
}

function fmtDate(iso: string, dateOnly = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  if (dateOnly) return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function printSaleInvoice(sale: Sale, settings: AppSettings): void {
  const sym  = currencySymbol(settings.currency || "GBP");
  const fmt  = (n: number) => `${sym}${n.toFixed(2)}`;

  const subtotal    = sale.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
  const discountAmt = sale.items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0, p = parseFloat(i.unitPrice) || 0, d = parseFloat(i.discount) || 0;
    return s + q * p * (d / 100);
  }, 0);
  const afterDiscount = subtotal - discountAmt;
  const taxRate  = parseFloat(sale.taxRate) || 0;
  const taxAmt   = afterDiscount * taxRate / 100;
  const total    = afterDiscount + taxAmt;
  const paid     = parseFloat(sale.amountPaid) || 0;
  const change   = Math.max(0, paid - total);
  const balance  = Math.max(0, total - paid);

  const address = settings.addressHull || settings.addressIslamabad || "";
  const phone   = settings.phoneHull  || settings.phoneIslamabad  || "";
  const email   = settings.emailHull  || settings.emailIslamabad  || "";

  const isFullyPaid  = paid >= total - 0.005 && total > 0;
  const isPartial    = paid > 0 && !isFullyPaid;

  const itemRows = sale.items.map((item, idx) => {
    const lt   = lineTotal(item);
    const disc = parseFloat(item.discount) || 0;
    const status = item.itemStatus || "Reserved";
    const statusColor = status === "Delivered" ? "#15803d" : status === "Reserved" ? "#1d4ed8" : "#92400e";
    return `
      <tr>
        <td style="color:#aaa;font-size:11px;padding:9px 8px;vertical-align:top;border-bottom:1px solid #f0f0f0;">${idx + 1}</td>
        <td style="padding:9px 8px;vertical-align:top;border-bottom:1px solid #f0f0f0;">
          <div style="font-size:13px;font-weight:600;color:#111;">${esc(item.productName || "—")}</div>
          ${disc > 0 ? `<div style="font-size:11px;color:#16a34a;margin-top:2px;">Discount: ${disc}%</div>` : ""}
          <span style="display:inline-block;margin-top:3px;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;border:1px solid;color:${statusColor};border-color:${statusColor}40;background:${statusColor}10;">${esc(status)}</span>
        </td>
        <td style="text-align:center;padding:9px 8px;vertical-align:top;border-bottom:1px solid #f0f0f0;font-weight:600;">${esc(item.qty)}</td>
        <td style="text-align:center;padding:9px 8px;vertical-align:top;border-bottom:1px solid #f0f0f0;color:#666;font-size:11px;">${esc(item.unit || "")}</td>
        <td style="text-align:right;padding:9px 8px;vertical-align:top;border-bottom:1px solid #f0f0f0;font-family:monospace;">${fmt(parseFloat(item.unitPrice) || 0)}</td>
        <td style="text-align:right;padding:9px 8px;vertical-align:top;border-bottom:1px solid #f0f0f0;font-family:monospace;font-weight:700;">${fmt(lt)}</td>
      </tr>`;
  }).join("");

  const printedAt = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${esc(sale.saleNumber)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#f8f9fa;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .wrap{max-width:820px;margin:24px auto;background:#fff;box-shadow:0 2px 20px rgba(0,0,0,.10);border-radius:12px;overflow:hidden}
    /* ── header band ── */
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding:36px 40px 28px;background:#fff;border-bottom:3px solid #111}
    .co-name{font-size:22px;font-weight:900;color:#111;letter-spacing:-.5px;line-height:1.1}
    .co-tagline{font-size:11px;color:#666;margin-top:3px}
    .co-contact{font-size:11px;color:#555;margin-top:10px;line-height:1.8}
    .logo{height:54px;width:auto;object-fit:contain;display:block;margin-bottom:10px}
    .inv-title{font-size:36px;font-weight:900;letter-spacing:3px;color:#111;text-align:right;text-transform:uppercase}
    .inv-meta{margin-top:12px;display:flex;flex-direction:column;gap:4px;align-items:flex-end}
    .inv-meta .r{display:flex;gap:16px;align-items:baseline}
    .inv-meta .lbl{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.6px;min-width:64px;text-align:right}
    .inv-meta .val{font-size:12px;font-weight:800;color:#111;font-family:'Courier New',monospace}
    /* ── receipt header text ── */
    .receipt-hdr{background:#f8f9fa;text-align:center;font-size:12px;color:#555;padding:11px 40px;font-style:italic;border-bottom:1px dashed #ddd}
    /* ── bill-to / payment method bar ── */
    .bill-bar{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e5e7eb}
    .bill-block{padding:18px 40px}
    .bill-block+.bill-block{border-left:1px solid #e5e7eb}
    .bill-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px}
    .bill-value{font-size:15px;font-weight:800;color:#111}
    .bill-sub{font-size:11px;color:#666;margin-top:3px}
    /* ── items ── */
    .items-wrap{padding:0 40px}
    table.items{width:100%;border-collapse:collapse;margin:20px 0}
    table.items thead th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;padding:10px 8px;border-bottom:2px solid #111;text-align:left}
    table.items thead th.r{text-align:right}
    table.items thead th.c{text-align:center}
    /* ── status pill ── */
    .status-bar{display:flex;justify-content:center;padding:12px 40px 4px}
    .spill{display:inline-flex;align-items:center;gap:6px;padding:6px 22px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase}
    .spill.paid{background:#dcfce7;color:#15803d;border:1.5px solid #86efac}
    .spill.partial{background:#fef9c3;color:#854d0e;border:1.5px solid #fde047}
    .spill.unpaid{background:#fee2e2;color:#991b1b;border:1.5px solid #fca5a5}
    /* ── totals ── */
    .totals-wrap{display:flex;justify-content:flex-end;padding:8px 40px 28px}
    .totals{width:300px;border-top:2px solid #111;padding-top:14px}
    .tot-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
    .tot-row .tl{color:#555}
    .tot-row .tv{font-family:'Courier New',monospace;font-weight:700}
    .tot-row.disc .tl,.tot-row.disc .tv{color:#16a34a}
    .tot-row.grand{border-top:2px solid #111;margin-top:8px;padding-top:10px}
    .tot-row.grand .tl,.tot-row.grand .tv{font-size:20px;font-weight:900;color:#111}
    .tot-row.paid-r .tl,.tot-row.paid-r .tv{color:#1d4ed8;font-size:14px}
    .tot-row.change-r .tl,.tot-row.change-r .tv{color:#16a34a;font-size:13px}
    .tot-row.bal-r .tl,.tot-row.bal-r .tv{color:#dc2626;font-size:14px}
    /* ── footer ── */
    .footer{background:#f8f9fa;border-top:1px dashed #ddd;padding:24px 40px;text-align:center}
    .footer-msg{font-size:15px;font-weight:700;color:#111;margin-bottom:10px}
    .footer-meta{font-size:10px;color:#888;line-height:2}
    .footer-meta span{display:inline-block;margin:0 10px}
    .footer-print{margin-top:8px;font-size:10px;color:#bbb;font-style:italic}
    /* ── print controls (hidden on print) ── */
    .print-bar{display:flex;gap:12px;justify-content:center;padding:20px;background:#f3f4f6;border-top:1px solid #e5e7eb}
    .btn-print{padding:10px 32px;font-size:14px;font-weight:700;background:#111;color:#fff;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px}
    .btn-close{padding:10px 24px;font-size:14px;font-weight:600;background:#fff;color:#374151;border:1.5px solid #d1d5db;border-radius:8px;cursor:pointer}
    .btn-print:hover{background:#333}
    .btn-close:hover{background:#f9fafb}
    @media print{
      body{background:#fff}
      .wrap{box-shadow:none;border-radius:0;margin:0;max-width:100%}
      .print-bar{display:none}
    }
    @page{size:A4;margin:10mm 12mm}
  </style>
</head>
<body>
<div class="wrap">

  <!-- ═══════════════════════════ HEADER ═══════════════════════════ -->
  <div class="header">
    <div>
      ${settings.logoBase64 ? `<img class="logo" src="${settings.logoBase64}" alt="Logo"/>` : ""}
      <div class="co-name">${esc(settings.companyName || "Company")}</div>
      ${settings.companyTagline ? `<div class="co-tagline">${esc(settings.companyTagline)}</div>` : ""}
      <div class="co-contact">
        ${address  ? `<div>${esc(address)}</div>`         : ""}
        ${phone    ? `<div>Tel: ${esc(phone)}</div>`      : ""}
        ${email    ? `<div>${esc(email)}</div>`            : ""}
        ${settings.website ? `<div>${esc(settings.website)}</div>` : ""}
      </div>
    </div>
    <div>
      <div class="inv-title">Invoice</div>
      <div class="inv-meta">
        <div class="r"><span class="lbl">Invoice #</span><span class="val">${esc(sale.saleNumber)}</span></div>
        <div class="r"><span class="lbl">Date</span><span class="val">${fmtDate(sale.saleDate ? sale.saleDate + "T00:00:00" : sale.createdAt, true)}</span></div>
        <div class="r"><span class="lbl">Created</span><span class="val">${fmtDate(sale.createdAt)}</span></div>
        ${sale.paidAt ? `<div class="r"><span class="lbl">Paid at</span><span class="val" style="color:#15803d">${fmtDate(sale.paidAt)}</span></div>` : ""}
        ${settings.vatNumber ? `<div class="r"><span class="lbl">VAT Reg</span><span class="val">${esc(settings.vatNumber)}</span></div>` : ""}
      </div>
    </div>
  </div>

  ${settings.receiptHeader ? `<div class="receipt-hdr">${esc(settings.receiptHeader)}</div>` : ""}

  <!-- ═══════════════════════════ BILL-TO BAR ═══════════════════════════ -->
  <div class="bill-bar">
    <div class="bill-block">
      <div class="bill-label">Billed To</div>
      <div class="bill-value">${esc(sale.customer || "Walk-in Customer")}</div>
    </div>
    <div class="bill-block">
      <div class="bill-label">Payment Method</div>
      <div class="bill-value">${esc(sale.paymentMethod)}</div>
      ${sale.notes ? `<div class="bill-sub">${esc(sale.notes)}</div>` : ""}
    </div>
  </div>

  <!-- ═══════════════════════════ ITEMS ═══════════════════════════ -->
  <div class="items-wrap">
    <table class="items">
      <thead>
        <tr>
          <th style="width:28px">#</th>
          <th>Description</th>
          <th class="c" style="width:52px">Qty</th>
          <th class="c" style="width:52px">Unit</th>
          <th class="r" style="width:96px">Unit Price</th>
          <th class="r" style="width:96px">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <!-- ═══════════════════════════ STATUS PILL ═══════════════════════════ -->
  <div class="status-bar">
    ${isFullyPaid
      ? `<span class="spill paid">✓ Fully Paid</span>`
      : isPartial
        ? `<span class="spill partial">⏳ Partial Payment</span>`
        : `<span class="spill unpaid">⚠ Unpaid</span>`}
  </div>

  <!-- ═══════════════════════════ TOTALS ═══════════════════════════ -->
  <div class="totals-wrap">
    <div class="totals">
      <div class="tot-row"><span class="tl">Subtotal</span><span class="tv">${fmt(subtotal)}</span></div>
      ${discountAmt > 0 ? `<div class="tot-row disc"><span class="tl">Discount</span><span class="tv">−${fmt(discountAmt)}</span></div>` : ""}
      ${taxRate > 0 ? `<div class="tot-row"><span class="tl">Tax (${taxRate}%)</span><span class="tv">${fmt(taxAmt)}</span></div>` : ""}
      <div class="tot-row grand"><span class="tl">Total</span><span class="tv">${fmt(total)}</span></div>
      ${paid > 0 ? `<div class="tot-row paid-r"><span class="tl">Amount Paid</span><span class="tv">${fmt(paid)}</span></div>` : ""}
      ${change  > 0.005 ? `<div class="tot-row change-r"><span class="tl">Change</span><span class="tv">${fmt(change)}</span></div>`  : ""}
      ${balance > 0.005 ? `<div class="tot-row bal-r"><span class="tl">Balance Due</span><span class="tv">${fmt(balance)}</span></div>` : ""}
    </div>
  </div>

  <!-- ═══════════════════════════ FOOTER ═══════════════════════════ -->
  <div class="footer">
    <div class="footer-msg">${esc(settings.receiptFooter || "Thank you for your business!")}</div>
    <div class="footer-meta">
      ${settings.vatNumber ? `<span>VAT Reg: ${esc(settings.vatNumber)}</span>` : ""}
      ${settings.website   ? `<span>${esc(settings.website)}</span>`             : ""}
      ${email              ? `<span>${esc(email)}</span>`                         : ""}
      ${phone              ? `<span>${esc(phone)}</span>`                         : ""}
    </div>
    <div class="footer-print">Printed: ${printedAt}</div>
  </div>

  <!-- ═══════════════════════════ PRINT CONTROLS ═══════════════════════════ -->
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Print Invoice
    </button>
    <button class="btn-close" onclick="window.close()">✕ Close</button>
  </div>

</div>
<script>
  window.addEventListener("load", function() {
    setTimeout(function() { window.print(); }, 400);
  });
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=960,height=780,scrollbars=yes");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  }
}
