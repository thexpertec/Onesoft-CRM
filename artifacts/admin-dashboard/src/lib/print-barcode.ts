/**
 * Barcode label printer
 * Renders barcodes to canvas → PNG data URL (more reliable than SVG in popup windows).
 */
import JsBarcode from "jsbarcode";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type BarcodePrintItem = {
  name: string;
  localName?: string;
  barcode: string;
  sku?: string;
  price?: string;
  priceWas?: string;
  brand?: string;
  qty?: number;
};

/** Render barcode to a canvas and return a PNG data URL */
function makeBarcodeDataUrl(code: string): string {
  if (!code?.trim()) return "";
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, code.trim(), {
      format: "AUTO",
      width: 2,
      height: 56,
      displayValue: false,
      margin: 6,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

export function printBarcodeLabels(items: BarcodePrintItem[], labelsPerRow = 3, currencySymbol = "") {
  const labels: string[] = [];

  for (const item of items) {
    const qty = Math.max(1, item.qty ?? 1);
    const barcodePng = makeBarcodeDataUrl(item.barcode);
    const sym = esc(currencySymbol);

    // Price display: was / now
    const hasNow = item.price && item.price !== "" && parseFloat(item.price) > 0;
    const hasWas = item.priceWas && item.priceWas !== "" && parseFloat(item.priceWas) > 0;
    let priceHtml = "";
    if (hasNow && hasWas) {
      priceHtml = `
        <div class="price-row">
          <span class="price-was">${sym}${esc(item.priceWas!)}</span>
          <span class="price-now">${sym}${esc(item.price!)}</span>
        </div>`;
    } else if (hasNow) {
      priceHtml = `<div class="price-single">${sym}${esc(item.price!)}</div>`;
    }

    for (let i = 0; i < qty; i++) {
      labels.push(`
        <div class="label">
          <div class="prod-name">${esc(item.name)}</div>
          ${item.localName ? `<div class="local-name">${esc(item.localName)}</div>` : ""}
          ${item.brand ? `<div class="prod-brand">${esc(item.brand)}</div>` : ""}
          ${barcodePng ? `<img class="barcode-img" src="${barcodePng}" alt="${esc(item.barcode)}" />` : ""}
          <div class="barcode-num">${esc(item.barcode)}</div>
          ${item.sku ? `<div class="prod-sku">SKU: ${esc(item.sku)}</div>` : ""}
          ${priceHtml}
        </div>`);
    }
  }

  const labelW = Math.floor(100 / labelsPerRow);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barcode Labels</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
    .grid { display: flex; flex-wrap: wrap; }
    .label {
      width: ${labelW}%;
      padding: 6pt 5pt 5pt;
      border: 0.5pt dashed #bbb;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .prod-name  { font-size: 9pt; font-weight: 700; line-height: 1.25; margin-bottom: 1pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .local-name { font-size: 7.5pt; color: #555; margin-bottom: 1pt; direction: rtl; }
    .prod-brand { font-size: 6.5pt; color: #888; margin-bottom: 2pt; text-transform: uppercase; letter-spacing: .04em; }
    .barcode-img { max-width: 100%; display: block; margin: 2pt auto 0; }
    .barcode-num { font-size: 7pt; font-family: "Courier New", monospace; color: #333; margin-top: 1pt; letter-spacing: .05em; }
    .prod-sku   { font-size: 6pt; color: #999; margin-top: 1pt; }
    .price-row  { display: flex; align-items: baseline; justify-content: center; gap: 5pt; margin-top: 4pt; }
    .price-was  { font-size: 8pt; color: #999; text-decoration: line-through; }
    .price-now  { font-size: 12pt; font-weight: 800; color: #111; }
    .price-single { font-size: 12pt; font-weight: 800; color: #111; margin-top: 4pt; }
    @media print {
      body { margin: 0; }
      @page { margin: 8mm; }
    }
  </style>
</head>
<body>
  <div class="grid">
    ${labels.join("\n")}
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 200);
    });
  <\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups to print barcodes.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
