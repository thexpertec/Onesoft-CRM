/**
 * Barcode label printer
 * Generates SVG barcodes in-page using the bundled jsbarcode package,
 * then embeds them as inline SVG strings in a print window.
 * No CDN dependency — barcodes are always rendered correctly.
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
  brand?: string;
  qty?: number;
};

/** Generate an SVG barcode string using the bundled jsbarcode */
function makeSvgBarcode(code: string): string {
  if (!code?.trim()) return "";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  try {
    JsBarcode(svg, code.trim(), {
      format: "AUTO",
      width: 1.4,
      height: 44,
      displayValue: false,
      margin: 4,
      background: "#ffffff",
      lineColor: "#000000",
    });
    svg.setAttribute("xmlns", ns);
    svg.classList.add("barcode");
    return svg.outerHTML;
  } catch {
    return "";
  }
}

export function printBarcodeLabels(items: BarcodePrintItem[], labelsPerRow = 3, currencySymbol = "") {
  const labels: string[] = [];

  for (const item of items) {
    const qty = Math.max(1, item.qty ?? 1);
    const svgBarcode = makeSvgBarcode(item.barcode);
    for (let i = 0; i < qty; i++) {
      labels.push(`
        <div class="label">
          <div class="prod-name">${esc(item.name)}</div>
          ${item.localName ? `<div class="local-name">${esc(item.localName)}</div>` : ""}
          ${item.brand ? `<div class="prod-brand">${esc(item.brand)}</div>` : ""}
          ${svgBarcode}
          <div class="barcode-num">${esc(item.barcode)}</div>
          ${item.sku ? `<div class="prod-sku">SKU: ${esc(item.sku)}</div>` : ""}
          ${item.price && item.price !== "" && item.price !== "0"
            ? `<div class="prod-price">${esc(currencySymbol)}${esc(item.price)}</div>`
            : ""}
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
      padding: 6pt 4pt;
      border: 0.5pt dashed #bbb;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .prod-name  { font-size: 9pt;  font-weight: 700; line-height: 1.2; margin-bottom: 1pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .local-name { font-size: 8pt;  color: #555; margin-bottom: 1pt; direction: rtl; }
    .prod-brand { font-size: 7pt;  color: #777; margin-bottom: 2pt; text-transform: uppercase; letter-spacing: .04em; }
    .barcode    { max-width: 100%; display: block; margin: 0 auto; }
    .barcode-num{ font-size: 7pt;  font-family: "Courier New", monospace; color: #333; margin-top: 1pt; }
    .prod-sku   { font-size: 6.5pt; color: #888; margin-top: 1pt; }
    .prod-price { font-size: 11pt; font-weight: 800; color: #111; margin-top: 3pt; }
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
      setTimeout(function () { window.print(); }, 150);
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
