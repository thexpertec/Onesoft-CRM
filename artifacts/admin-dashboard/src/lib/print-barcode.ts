/**
 * Barcode label printer
 *
 * Architecture: the popup window renders its own barcodes.
 * SVG placeholder elements carry `data-barcode` attributes; an inline script
 * in the popup calls JsBarcode (loaded from CDN) on each SVG after load.
 * This is far more reliable than pre-serialising SVG in the host window
 * (cross-window SVG namespace issues) or using canvas (browser security
 * restrictions on cross-origin data URLs in popups).
 *
 * Label layout — 5 lines matching reference:
 *   1. Product name
 *   2. Local name (if any, RTL-aware)
 *   3. Barcode bars
 *   4. Barcode number
 *   5. Price
 */

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

export function printBarcodeLabels(items: BarcodePrintItem[], labelsPerRow = 3, currencySymbol = "") {
  const labels: string[] = [];

  for (const item of items) {
    const qty = Math.max(1, item.qty ?? 1);
    const sym = esc(currencySymbol);

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
          ${item.localName?.trim() ? `<div class="local-name">${esc(item.localName)}</div>` : ""}
          <div class="barcode-wrap">
            ${item.barcode?.trim()
              ? `<svg class="barcode-svg" data-barcode="${esc(item.barcode.trim())}"></svg>`
              : `<div class="barcode-missing">No barcode</div>`}
          </div>
          <div class="barcode-num">${esc(item.barcode ?? "")}</div>
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
  <!--
    JsBarcode is loaded from CDN so the popup can render barcodes in its own
    document context — avoiding cross-window SVG namespace issues entirely.
    Primary: jsDelivr (fast, global CDN). Fallback: unpkg.
  -->
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js"
          onerror="var s=document.createElement('script');s.src='https://unpkg.com/jsbarcode@3.12.3/dist/JsBarcode.all.min.js';document.head.appendChild(s);"></script>
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

    /* Line 1 – product name */
    .prod-name {
      font-size: 9pt;
      font-weight: 700;
      line-height: 1.25;
      margin-bottom: 1pt;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: uppercase;
    }

    /* Line 2 – local name */
    .local-name {
      font-size: 8pt;
      color: #444;
      margin-bottom: 2pt;
      unicode-bidi: plaintext;
      direction: rtl;
      line-height: 1.3;
    }

    /* Line 3 – barcode bars */
    .barcode-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 2pt 0 0;
      min-height: 20pt;
    }
    .barcode-svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .barcode-missing {
      font-size: 7pt;
      color: #c00;
      padding: 4pt 0;
    }

    /* Line 4 – barcode number */
    .barcode-num {
      font-size: 7.5pt;
      font-family: "Courier New", monospace;
      color: #222;
      letter-spacing: .06em;
      margin-top: 1pt;
    }

    /* Line 5 – price */
    .price-row {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 5pt;
      margin-top: 4pt;
    }
    .price-was    { font-size: 8pt; color: #999; text-decoration: line-through; }
    .price-now    { font-size: 13pt; font-weight: 800; color: #111; }
    .price-single { font-size: 13pt; font-weight: 800; color: #111; margin-top: 4pt; }

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
    function renderBarcode(svg, val) {
      // Try formats in order: CODE128 handles any printable string reliably.
      // EAN13 / EAN8 / UPC are tried if CODE128 fails (unlikely).
      var formats = ["CODE128", "EAN13", "EAN8", "UPCA", "CODE39"];
      for (var i = 0; i < formats.length; i++) {
        try {
          JsBarcode(svg, val, {
            format: formats[i],
            width: 2.2,
            height: 60,
            displayValue: false,
            margin: 4,
            background: "#ffffff",
            lineColor: "#000000"
          });
          return true; // success
        } catch (e) {
          // try next format
        }
      }
      return false; // all formats failed
    }

    function renderAndPrint() {
      if (typeof JsBarcode === "undefined") {
        // CDN not loaded yet — retry in 200 ms
        setTimeout(renderAndPrint, 200);
        return;
      }
      document.querySelectorAll("svg.barcode-svg[data-barcode]").forEach(function(svg) {
        var val = svg.getAttribute("data-barcode");
        if (!val) return;
        var ok = renderBarcode(svg, val);
        if (!ok) {
          var wrap = svg.parentElement;
          if (wrap) {
            var err = document.createElement("div");
            err.className = "barcode-missing";
            err.textContent = "\u26A0 Cannot encode: " + val;
            wrap.replaceChild(err, svg);
          }
        }
      });
      setTimeout(function() { window.print(); }, 250);
    }

    window.addEventListener("load", renderAndPrint);
  <\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Pop-up blocked — please allow pop-ups for this site to print barcodes.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
