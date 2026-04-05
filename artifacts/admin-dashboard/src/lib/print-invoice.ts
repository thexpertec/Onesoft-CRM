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
  try {
    return (0)
      .toLocaleString("en", { style: "currency", currency: code, minimumFractionDigits: 0 })
      .replace(/[\d,. ]/g, "")
      .trim();
  } catch { return code + " "; }
}

function fmtShort(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateOnly(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Right-pad `left` and right-pad `right` so total = `width` chars */
function lr(left: string, right: string, width = 32): string {
  const gap = Math.max(1, width - left.length - right.length);
  return esc(left) + " ".repeat(gap) + esc(right);
}

/** Centre a string in `width` chars */
function centre(text: string, width = 32): string {
  const t = String(text ?? "");
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return " ".repeat(pad) + esc(t);
}

const W = 32;          // character width of the receipt
const SEP  = "─".repeat(W);
const DSEP = "═".repeat(W);

export function printSaleInvoice(sale: Sale, settings: AppSettings): void {
  const sym = currencySymbol(settings.currency || "GBP");
  const fmt = (n: number) => `${sym}${n.toFixed(2)}`;

  const subtotal    = sale.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
  const discountAmt = sale.items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0, p = parseFloat(i.unitPrice) || 0, d = parseFloat(i.discount) || 0;
    return s + q * p * (d / 100);
  }, 0);
  const afterDiscount = subtotal - discountAmt;
  const taxRate = parseFloat(sale.taxRate) || 0;
  const taxAmt  = afterDiscount * taxRate / 100;
  const total   = afterDiscount + taxAmt;
  const paid    = parseFloat(sale.amountPaid) || 0;
  const change  = Math.max(0, paid - total);
  const balance = Math.max(0, total - paid);

  const address = settings.addressHull || settings.addressIslamabad || "";
  const phone   = settings.phoneHull   || settings.phoneIslamabad   || "";
  const email   = settings.emailHull   || settings.emailIslamabad   || "";

  const isFullyPaid = paid >= total - 0.005 && total > 0;
  const isPartial   = paid > 0 && !isFullyPaid;

  const printedAt = fmtShort(new Date().toISOString());

  // Build item lines
  const itemLines = sale.items.map((item, idx) => {
    const lt    = lineTotal(item);
    const q     = parseFloat(item.qty)       || 0;
    const p     = parseFloat(item.unitPrice) || 0;
    const disc  = parseFloat(item.discount)  || 0;
    const status = item.itemStatus || "Reserved";

    // Name line (truncate to fit)
    const namePrefix = `${idx + 1}. `;
    const maxNameLen = W - namePrefix.length;
    const name = (item.productName || "—").slice(0, maxNameLen);

    // Price line: "  2 x £10.00 -10%     £20.00"
    const discStr  = disc > 0 ? ` -${disc}%` : "";
    const qtyPrice = `  ${q}x${sym}${p.toFixed(2)}${discStr}`;
    const totalStr = fmt(lt);
    const priceLine = lr(qtyPrice, totalStr, W);

    // Status line
    const statusLine = `  [${status}]${item.unit ? "  " + item.unit : ""}`;

    return `<div class="item-block">
  <div><span class="item-idx">${esc(namePrefix)}</span><strong>${esc(name)}</strong></div>
  <div class="item-price">${priceLine}</div>
  <div class="item-status">${esc(statusLine)}</div>
</div>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Receipt ${esc(sale.saleNumber)}</title>
<style>
  /* ── Reset ── */
  *{box-sizing:border-box;margin:0;padding:0}

  /* ── Base: monospace, 80mm thermal width ── */
  body{
    font-family:'Courier New',Courier,monospace;
    font-size:12pt;
    color:#000;
    background:#fff;
    width:76mm;
    margin:0 auto;
    padding:3mm 0;
    line-height:1.45;
  }

  /* ── Sections ── */
  .receipt{ width:100%; }

  /* ── Header ── */
  .hdr{ text-align:center; padding-bottom:4px; }
  .hdr img{ max-width:48mm; height:auto; display:block; margin:0 auto 6px; }
  .hdr .co{ font-size:14pt; font-weight:bold; letter-spacing:1px; }
  .hdr .tag{ font-size:9pt; }
  .hdr .contact{ font-size:8.5pt; margin-top:4px; line-height:1.6; }

  /* ── Separator lines ── */
  .sep { letter-spacing:0; font-size:11pt; color:#000; display:block; margin:4px 0; }

  /* ── Receipt meta ── */
  .meta{ font-size:9.5pt; margin:4px 0; }
  .meta .row{ display:flex; justify-content:space-between; }
  .meta .lbl{ color:#333; }
  .meta .val{ font-weight:bold; }

  /* ── Customer / payment row ── */
  .info{ font-size:9.5pt; margin:3px 0; }

  /* ── Items ── */
  .items{ margin:4px 0; font-size:9.5pt; }
  .item-block{ margin:5px 0; }
  .item-idx{ color:#333; }
  .item-price{ letter-spacing:0; white-space:pre; font-size:9pt; }
  .item-status{ font-size:8pt; color:#444; }

  /* ── Totals ── */
  .totals{ font-size:10pt; margin:4px 0; }
  .totals .row{ display:flex; justify-content:space-between; padding:1px 0; }
  .totals .lbl{ }
  .totals .val{ font-weight:bold; font-family:'Courier New',monospace; }
  .totals .disc .lbl, .totals .disc .val{ }
  .grand-row{ margin-top:4px; padding-top:4px; }
  .grand-row .lbl{ font-size:13pt; font-weight:bold; }
  .grand-row .val{ font-size:13pt; font-weight:bold; }
  .paid-row .lbl, .paid-row .val{ font-size:10.5pt; }
  .change-row .lbl, .change-row .val{ font-size:10.5pt; }
  .bal-row .lbl, .bal-row .val{ font-size:10.5pt; }

  /* ── Payment status banner ── */
  .status-banner{
    text-align:center;
    font-size:11pt;
    font-weight:bold;
    letter-spacing:2px;
    padding:4px 0;
  }

  /* ── Footer ── */
  .ftr{ text-align:center; font-size:8.5pt; margin:4px 0; line-height:1.7; }
  .ftr .msg{ font-size:10pt; font-weight:bold; margin-bottom:4px; }
  .ftr .printed{ font-size:7.5pt; color:#555; margin-top:4px; }

  /* ── On-screen wrapper (hides on print) ── */
  .screen-wrap{
    max-width:400px;
    margin:24px auto;
    background:#fff;
    border:1px solid #ccc;
    border-radius:4px;
    padding:12px 16px;
    box-shadow:0 2px 16px rgba(0,0,0,.12);
  }

  /* ── Print controls (hidden when printing) ── */
  .print-bar{
    display:flex; gap:10px; justify-content:center;
    margin-top:16px; padding-top:14px;
    border-top:1px dashed #bbb;
  }
  .btn-print{
    padding:9px 28px; font-size:13px; font-weight:700;
    background:#111; color:#fff; border:none;
    border-radius:6px; cursor:pointer;
    font-family:-apple-system,'Segoe UI',sans-serif;
    display:flex; align-items:center; gap:7px;
  }
  .btn-close{
    padding:9px 20px; font-size:13px; font-weight:600;
    background:#f3f4f6; color:#374151;
    border:1px solid #d1d5db; border-radius:6px; cursor:pointer;
    font-family:-apple-system,'Segoe UI',sans-serif;
  }
  .btn-print:hover{ background:#333; }
  .btn-close:hover{ background:#e5e7eb; }

  /* ── Print-only overrides ── */
  @media print{
    body{ margin:0; padding:0; width:76mm; }
    .screen-wrap{ border:none; box-shadow:none; padding:0; margin:0; border-radius:0; }
    .print-bar{ display:none !important; }
  }

  /* ── Thermal @page rule ── */
  @page{
    size:80mm auto;
    margin:3mm 2mm;
  }
</style>
</head>
<body>
<div class="screen-wrap">
<div class="receipt">

  <!-- ══ HEADER ══ -->
  <div class="hdr">
    ${settings.logoBase64 ? `<img src="${settings.logoBase64}" alt="Logo"/>` : ""}
    <div class="co">${esc(settings.companyName || "Company")}</div>
    ${settings.companyTagline ? `<div class="tag">${esc(settings.companyTagline)}</div>` : ""}
    <div class="contact">
      ${address ? `<div>${esc(address)}</div>` : ""}
      ${phone   ? `<div>Tel: ${esc(phone)}</div>` : ""}
      ${email   ? `<div>${esc(email)}</div>` : ""}
      ${settings.website ? `<div>${esc(settings.website)}</div>` : ""}
    </div>
  </div>

  ${settings.receiptHeader ? `<div class="sep">${esc(SEP)}</div><div style="text-align:center;font-size:8.5pt;font-style:italic;">${esc(settings.receiptHeader)}</div>` : ""}

  <div class="sep">${esc(DSEP)}</div>

  <!-- ══ INVOICE META ══ -->
  <div style="text-align:center;font-weight:bold;font-size:11pt;letter-spacing:2px;">RECEIPT</div>
  <div class="meta">
    <div class="row"><span class="lbl">Invoice #</span><span class="val">${esc(sale.saleNumber)}</span></div>
    <div class="row"><span class="lbl">Date</span><span class="val">${fmtDateOnly(sale.saleDate ? sale.saleDate + "T00:00:00" : sale.createdAt)}</span></div>
    <div class="row"><span class="lbl">Created</span><span class="val">${fmtShort(sale.createdAt)}</span></div>
    ${sale.paidAt ? `<div class="row"><span class="lbl">Paid at</span><span class="val">${fmtShort(sale.paidAt)}</span></div>` : ""}
    ${settings.vatNumber ? `<div class="row"><span class="lbl">VAT Reg</span><span class="val">${esc(settings.vatNumber)}</span></div>` : ""}
  </div>

  <div class="sep">${esc(SEP)}</div>

  <!-- ══ CUSTOMER / PAYMENT ══ -->
  <div class="info">
    <div><strong>Customer:</strong> ${esc(sale.customer || "Walk-in Customer")}</div>
    <div><strong>Payment :</strong> ${esc(sale.paymentMethod)}</div>
    ${sale.notes ? `<div><strong>Notes   :</strong> ${esc(sale.notes)}</div>` : ""}
  </div>

  <div class="sep">${esc(SEP)}</div>

  <!-- ══ ITEMS ══ -->
  <div class="items">
    ${itemLines}
  </div>

  <div class="sep">${esc(SEP)}</div>

  <!-- ══ TOTALS ══ -->
  <div class="totals">
    <div class="row"><span class="lbl">Subtotal</span><span class="val">${fmt(subtotal)}</span></div>
    ${discountAmt > 0 ? `<div class="row disc"><span class="lbl">Discount</span><span class="val">-${fmt(discountAmt)}</span></div>` : ""}
    ${taxRate > 0     ? `<div class="row"><span class="lbl">Tax (${taxRate}%)</span><span class="val">${fmt(taxAmt)}</span></div>` : ""}
  </div>

  <div class="sep">${esc(DSEP)}</div>

  <div class="totals">
    <div class="row grand-row"><span class="lbl">TOTAL</span><span class="val">${fmt(total)}</span></div>
  </div>

  <div class="sep">${esc(DSEP)}</div>

  <div class="totals">
    ${paid > 0        ? `<div class="row paid-row"><span class="lbl">Paid</span><span class="val">${fmt(paid)}</span></div>` : ""}
    ${change  > 0.005 ? `<div class="row change-row"><span class="lbl">Change</span><span class="val">${fmt(change)}</span></div>`  : ""}
    ${balance > 0.005 ? `<div class="row bal-row"><span class="lbl">Balance Due</span><span class="val">${fmt(balance)}</span></div>` : ""}
  </div>

  <div class="sep">${esc(DSEP)}</div>

  <!-- ══ PAYMENT STATUS BANNER ══ -->
  <div class="status-banner">
    ${isFullyPaid
      ? `*** FULLY PAID ***`
      : isPartial
        ? `*** PARTIAL PAYMENT ***`
        : `*** UNPAID ***`}
  </div>

  <div class="sep">${esc(DSEP)}</div>

  <!-- ══ FOOTER ══ -->
  <div class="ftr">
    <div class="msg">${esc(settings.receiptFooter || "Thank you for your business!")}</div>
    ${settings.vatNumber ? `<div>VAT: ${esc(settings.vatNumber)}</div>` : ""}
    ${settings.website   ? `<div>${esc(settings.website)}</div>` : ""}
    ${email              ? `<div>${esc(email)}</div>` : ""}
    ${phone              ? `<div>${esc(phone)}</div>` : ""}
    <div class="printed">Printed: ${printedAt}</div>
  </div>

  <div class="sep">${esc(SEP)}</div>

</div><!-- /receipt -->

<!-- ══ PRINT CONTROLS (screen only) ══ -->
<div class="print-bar">
  <button class="btn-print" onclick="window.print()">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Print Receipt
  </button>
  <button class="btn-close" onclick="window.close()">✕ Close</button>
</div>

</div><!-- /screen-wrap -->

<script>
  window.addEventListener("load", function() {
    setTimeout(function() { window.print(); }, 400);
  });
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=460,height=680,scrollbars=yes,resizable=yes");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  }
}
