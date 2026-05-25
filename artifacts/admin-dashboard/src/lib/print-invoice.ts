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

export function buildSaleReceiptHtml(sale: Sale, settings: AppSettings): string {
  const sym = currencySymbol(settings.currency || "GBP");
  const fmt = (n: number) => `${sym}${n.toFixed(2)}`;

  const subtotal    = sale.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);
  const lineDiscAmt = sale.items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0, p = parseFloat(i.unitPrice) || 0, d = parseFloat(i.discount) || 0;
    return s + (i.discountType === "amt" ? Math.min(d, p) * q : q * p * d / 100);
  }, 0);
  const afterLineDisc  = subtotal - lineDiscAmt;
  const invDiscVal     = parseFloat(sale.invoiceDiscount || "0") || 0;
  const invDiscAmt     = sale.invoiceDiscountType === "amt"
    ? Math.min(invDiscVal, afterLineDisc) : afterLineDisc * invDiscVal / 100;
  const afterDiscount  = Math.max(0, afterLineDisc - invDiscAmt);
  const discountAmt    = lineDiscAmt + invDiscAmt;
  const taxRate = parseFloat(sale.taxRate) || 0;
  const taxAmt  = afterDiscount * taxRate / 100;
  const deliveryAmt = parseFloat(sale.deliveryCharges || "0") || 0;
  const total   = afterDiscount + taxAmt + deliveryAmt;
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
    ${deliveryAmt > 0 ? `<div class="row"><span class="lbl">Delivery</span><span class="val">+${fmt(deliveryAmt)}</span></div>` : ""}
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

  return html;
}

/**
 * Print a receipt using a hidden iframe (no popup needed — bypasses popup blockers).
 * Falls back to window.open if iframe printing fails.
 */
export function printReceiptHtml(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;z-index:-9999;top:-9999px;left:-9999px;width:460px;height:680px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  const iWin = iframe.contentWindow;
  if (!iWin) {
    document.body.removeChild(iframe);
    // Fallback
    const win = window.open("", "_blank", "width=460,height=680");
    if (win) { win.document.write(html); win.document.close(); }
    return;
  }

  iWin.document.open();
  iWin.document.write(html);
  iWin.document.close();

  const doPrint = () => {
    try {
      iWin.focus();
      iWin.print();
    } catch {
      // Fallback to popup if iframe print is blocked
      const win = window.open("", "_blank", "width=460,height=680");
      if (win) { win.document.write(html); win.document.close(); }
    }
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ok */ } }, 3000);
  };

  if (iWin.document.readyState === "complete") {
    setTimeout(doPrint, 300);
  } else {
    iframe.addEventListener("load", () => setTimeout(doPrint, 300), { once: true });
  }
}

export function printSaleInvoice(sale: Sale, settings: AppSettings): void {
  printReceiptHtml(buildSaleReceiptHtml(sale, settings));
}

// ─── Repair Job Card ──────────────────────────────────────────────────────────

interface RepairJobPart {
  productName: string;
  qty: number;
  unitPrice: number;
}
interface RepairJobLabour {
  description: string;
  hours?: number;
  rate: number;
  amount: number;
}
interface RepairJobData {
  id: string;
  name: string;
  phone: string;
  service: string;
  deviceIssue?: string;
  status: string;
  priority?: string;
  estimatedDate?: string;
  publicNote?: string;
  createdAt: string;
  parts?: RepairJobPart[];
  labour?: RepairJobLabour[];
  quotedTotal?: number;
}

const REPAIR_STATUSES = [
  "New", "Diagnosing", "Quoted", "Awaiting Parts", "In Repair", "Ready", "Completed",
];

const REPAIR_STATUS_COLORS: Record<string, string> = {
  "New":            "#3b82f6",
  "Diagnosing":     "#8b5cf6",
  "Quoted":         "#6366f1",
  "Awaiting Parts": "#f97316",
  "In Repair":      "#f59e0b",
  "Ready":          "#14b8a6",
  "Completed":      "#10b981",
};

function buildPipelineHtml(status: string): string {
  const currentIdx = REPAIR_STATUSES.indexOf(status);
  return REPAIR_STATUSES.map((s, i) => {
    const filled = i <= currentIdx;
    const color  = filled ? (REPAIR_STATUS_COLORS[s] ?? "#6b7280") : "#e5e7eb";
    const textCol = filled ? "#fff" : "#9ca3af";
    const label = s === "Awaiting Parts" ? "Parts" : s;
    return `<div style="flex:1;text-align:center;">
      <div style="width:22px;height:22px;border-radius:50%;background:${color};margin:0 auto 3px;display:flex;align-items:center;justify-content:center;">
        ${filled ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${textCol}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
      </div>
      <div style="font-size:7px;color:${filled ? "#111" : "#9ca3af"};line-height:1.2;font-weight:${filled ? "700" : "400"}">${esc(label)}</div>
    </div>`;
  }).join(`<div style="flex:0 0 auto;width:8px;height:2px;background:#e5e7eb;margin-top:10px;"></div>`);
}

export function buildRepairJobCardHtml(
  booking: RepairJobData,
  settings: AppSettings,
  qrDataUrl: string,
  trackingUrl: string,
): string {
  const companyName = settings.companyName || "Repair Shop";
  const address  = settings.addressHull || settings.addressIslamabad || "";
  const phone    = settings.phoneHull   || settings.phoneIslamabad   || "";
  const email    = settings.emailHull   || settings.emailIslamabad   || "";
  const website  = settings.website || "";

  const receivedFmt = fmtDateOnly(booking.createdAt);
  const estFmt = booking.estimatedDate
    ? fmtDateOnly(booking.estimatedDate + "T00:00:00")
    : "Not set";

  const shortId = booking.id.slice(0, 8).toUpperCase();
  const priorityColor: Record<string, string> = {
    "Urgent": "#dc2626", "High": "#ea580c", "Normal": "#2563eb", "Low": "#6b7280",
  };
  const prColor = priorityColor[booking.priority ?? "Normal"] ?? "#6b7280";
  const statusColor = REPAIR_STATUS_COLORS[booking.status] ?? "#6b7280";

  // ── Invoice details (Service Charges + Repair Parts) ───────────────────
  const sym       = currencySymbol(settings.currency || "GBP");
  const fmtMoney  = (n: number) => `${sym}${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
  const parts     = (booking.parts  ?? []).filter(p => p && p.productName);
  const labour    = (booking.labour ?? []).filter(l => l && l.description);
  const partsTotal  = parts.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unitPrice) || 0), 0);
  const labourTotal = labour.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const grandTotal  = partsTotal + labourTotal;
  const hasInvoice  = parts.length > 0 || labour.length > 0;

  const labourRows = labour.map(l => {
    const detail = l.hours && l.hours > 0
      ? `${esc(l.description)} <span style="color:#888;font-size:8pt;">(${l.hours}h × ${fmtMoney(l.rate)})</span>`
      : esc(l.description);
    return `<tr>
      <td style="padding:3px 4px;">${detail}</td>
      <td style="padding:3px 4px;text-align:right;white-space:nowrap;font-weight:600;">${fmtMoney(Number(l.amount) || 0)}</td>
    </tr>`;
  }).join("");

  const partsRows = parts.map(p => {
    const qtyNum    = Number(p.qty) || 0;
    const priceNum  = Number(p.unitPrice) || 0;
    const lineTotal = qtyNum * priceNum;
    return `<tr>
      <td style="padding:3px 4px;">${esc(p.productName)}</td>
      <td style="padding:3px 4px;text-align:center;white-space:nowrap;color:#666;">${qtyNum} × ${fmtMoney(priceNum)}</td>
      <td style="padding:3px 4px;text-align:right;white-space:nowrap;font-weight:600;">${fmtMoney(lineTotal)}</td>
    </tr>`;
  }).join("");

  const invoiceSectionHtml = hasInvoice ? `
  <hr class="divider"/>
  <div class="section">
    <div style="font-size:8pt;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Invoice Details</div>

    ${labour.length > 0 ? `
    <div style="margin-top:4px;">
      <div style="font-size:8.5pt;font-weight:700;color:#374151;margin-bottom:2px;">Service Charges</div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt;">
        <tbody>${labourRows}</tbody>
        <tfoot>
          <tr style="border-top:1px dashed #ccc;">
            <td style="padding:3px 4px;font-weight:700;color:#555;">Subtotal</td>
            <td style="padding:3px 4px;text-align:right;font-weight:700;">${fmtMoney(labourTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>` : ""}

    ${parts.length > 0 ? `
    <div style="margin-top:6px;">
      <div style="font-size:8.5pt;font-weight:700;color:#374151;margin-bottom:2px;">Repair Parts</div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt;">
        <tbody>${partsRows}</tbody>
        <tfoot>
          <tr style="border-top:1px dashed #ccc;">
            <td colspan="2" style="padding:3px 4px;font-weight:700;color:#555;">Subtotal</td>
            <td style="padding:3px 4px;text-align:right;font-weight:700;">${fmtMoney(partsTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>` : ""}

    <div style="margin-top:6px;padding:6px 8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:9.5pt;font-weight:800;color:#065f46;text-transform:uppercase;letter-spacing:.5px;">Total</span>
      <span style="font-size:12pt;font-weight:900;color:#065f46;">${fmtMoney(grandTotal)}</span>
    </div>
    ${booking.quotedTotal != null && Math.abs(booking.quotedTotal - grandTotal) > 0.01 ? `
    <div style="font-size:8pt;color:#888;text-align:right;margin-top:2px;">Originally quoted: ${fmtMoney(booking.quotedTotal)}</div>` : ""}
  </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Repair Job Card ${esc(shortId)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:-apple-system,'Segoe UI',Arial,sans-serif;
    font-size:11pt;
    color:#111;
    background:#fff;
    width:100mm;
    margin:0 auto;
    padding:4mm 0;
    line-height:1.5;
  }
  .card{width:100%;}
  .hdr{text-align:center;padding-bottom:6px;border-bottom:2px solid #111;margin-bottom:8px;}
  .hdr img{max-width:40mm;height:auto;display:block;margin:0 auto 5px;}
  .co{font-size:14pt;font-weight:800;letter-spacing:.5px;}
  .contact{font-size:8pt;color:#555;margin-top:3px;line-height:1.6;}
  .title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
  .job-title{font-size:13pt;font-weight:900;letter-spacing:2px;color:#111;}
  .job-ref{font-size:9pt;font-weight:700;color:#555;}
  .section{margin:6px 0;}
  .kv{display:flex;font-size:9.5pt;padding:2px 0;}
  .kv .lbl{color:#555;min-width:70px;font-weight:600;}
  .kv .val{font-weight:700;flex:1;}
  .divider{border:none;border-top:1px dashed #ccc;margin:6px 0;}
  .status-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:9pt;font-weight:700;color:#fff;background:${statusColor};}
  .priority-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:8.5pt;font-weight:700;color:#fff;background:${prColor};}
  .pipeline{display:flex;align-items:flex-start;margin:8px 0;padding:6px;background:#f9fafb;border-radius:8px;}
  .issue-box{background:#f9fafb;border-radius:6px;padding:6px 8px;font-size:9pt;margin:4px 0;min-height:30px;color:#333;}
  .public-note-box{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 8px;font-size:9pt;margin:4px 0;color:#92400e;}
  .qr-section{text-align:center;margin:8px 0;padding:8px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;}
  .qr-section img{width:110px;height:110px;display:block;margin:0 auto 5px;}
  .qr-label{font-size:8.5pt;color:#0369a1;font-weight:700;margin-bottom:3px;}
  .qr-url{font-size:7pt;color:#555;word-break:break-all;}
  .footer{text-align:center;font-size:8pt;color:#555;margin-top:8px;padding-top:6px;border-top:1px solid #eee;}
  .screen-wrap{max-width:480px;margin:24px auto;background:#fff;border:1px solid #ddd;border-radius:6px;padding:12px 16px;box-shadow:0 2px 16px rgba(0,0,0,.1);}
  .print-bar{display:flex;gap:10px;justify-content:center;margin-top:16px;padding-top:14px;border-top:1px dashed #bbb;}
  .btn-print{padding:9px 28px;font-size:13px;font-weight:700;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:7px;}
  .btn-close{padding:9px 20px;font-size:13px;font-weight:600;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;}
  .btn-print:hover{background:#333;}
  .btn-close:hover{background:#e5e7eb;}
  @media print{
    body{margin:0;padding:0;width:100mm;}
    .screen-wrap{border:none;box-shadow:none;padding:0;margin:0;border-radius:0;}
    .print-bar{display:none !important;}
  }
  @page{size:105mm auto;margin:4mm 3mm;}
</style>
</head>
<body>
<div class="screen-wrap">
<div class="card">

  <div class="hdr">
    ${settings.logoBase64 ? `<img src="${settings.logoBase64}" alt="Logo"/>` : ""}
    <div class="co">${esc(companyName)}</div>
    <div class="contact">
      ${address ? `<div>${esc(address)}</div>` : ""}
      ${phone   ? `<div>Tel: ${esc(phone)}</div>` : ""}
      ${email   ? `<div>${esc(email)}</div>` : ""}
    </div>
  </div>

  <div class="title-row">
    <div class="job-title">REPAIR JOB CARD</div>
    <div class="job-ref">#${esc(shortId)}</div>
  </div>

  <div class="section">
    <div class="kv"><span class="lbl">Customer</span><span class="val">${esc(booking.name)}</span></div>
    <div class="kv"><span class="lbl">Phone</span><span class="val">${esc(booking.phone)}</span></div>
    <div class="kv"><span class="lbl">Service</span><span class="val">${esc(booking.service)}</span></div>
    <div class="kv"><span class="lbl">Received</span><span class="val">${esc(receivedFmt)}</span></div>
    <div class="kv"><span class="lbl">Est. Done</span><span class="val">${esc(estFmt)}</span></div>
  </div>

  <hr class="divider"/>

  <div class="section">
    <div style="font-size:8pt;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Device Issue</div>
    <div class="issue-box">${esc(booking.deviceIssue || "Not provided")}</div>
  </div>

  ${booking.publicNote ? `
  <div class="section">
    <div style="font-size:8pt;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Update for Customer</div>
    <div class="public-note-box">${esc(booking.publicNote)}</div>
  </div>` : ""}

  <hr class="divider"/>

  <div class="section" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
    <span class="status-badge">${esc(booking.status)}</span>
    <span class="priority-badge">${esc(booking.priority ?? "Normal")}</span>
  </div>

  <div class="pipeline">
    ${buildPipelineHtml(booking.status)}
  </div>

  ${invoiceSectionHtml}

  <hr class="divider"/>

  <div class="qr-section">
    <div class="qr-label">📱 Scan to track your repair</div>
    <img src="${qrDataUrl}" alt="Tracking QR Code"/>
    <div class="qr-url">${esc(trackingUrl)}</div>
  </div>

  <div class="footer">
    ${esc(settings.receiptFooter || "Thank you for choosing us!")}
    ${website ? `<div>${esc(website)}</div>` : ""}
    ${phone ? `<div>Call us: ${esc(phone)}</div>` : ""}
    <div style="font-size:7pt;color:#888;margin-top:3px;">Printed: ${fmtShort(new Date().toISOString())}</div>
  </div>

</div>

<div class="print-bar">
  <button class="btn-print" onclick="window.print()">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Print Job Card
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
}
