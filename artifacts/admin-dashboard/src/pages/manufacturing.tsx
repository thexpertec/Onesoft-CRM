import { useState, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import {
  Factory, Eye, Trash2, Plus, CheckCircle2, XCircle, FlaskConical,
  Package, DollarSign, AlertTriangle, ChevronRight, BookOpen, BookMarked,
  ChevronDown, ChevronUp, Scale, CheckCircle, AlertCircle, ArrowRight, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useManufacturingOrders, useRawMaterials, useRecipes } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import {
  getProducts, MFG_STATUSES, MfgInput, MfgOutput, ProductionCost, ManufacturingOrder,
  RawMaterial, getSettings, MfgRecipe,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { ExcelGridShell, ColDef, CELL_H } from "@/components/editable-cell";

const dp = getSettingsDecimalPlaces();

// ── Print / PDF generator ─────────────────────────────────────────────────────
function printMfgOrder(order: ManufacturingOrder, rms: RawMaterial[], sym: string, decPlaces: number) {
  const s = getSettings();
  const rmCost   = order.inputs.reduce((sum, inp) => {
    const rm = rms.find(r => r.id === inp.rmId);
    return sum + (parseFloat(rm?.costPerUnit || "0") * (parseFloat(inp.qtyUsed) || 0));
  }, 0);
  const prodCost = (order.productionCosts || []).reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
  const total    = rmCost + prodCost;
  const outputs  = order.outputs || [];
  const [mainOut, ...byProds] = outputs;
  const mainQty  = parseFloat(mainOut?.qty || "0") || 0;
  const bpFixed  = byProds.reduce((sum, bp) => {
    const mc = parseFloat(bp.manualCost || ""); const q = parseFloat(bp.qty) || 0;
    return isNaN(mc) ? sum : sum + mc * q;
  }, 0);
  const mainCost    = total - bpFixed;
  const mainPerUnit = mainQty > 0 ? mainCost / mainQty : 0;
  const totalOutQty = outputs.reduce((s, o) => s + (parseFloat(o.qty) || 0), 0);
  const f = (v: number) => `${sym}${v.toFixed(decPlaces)}`;
  let orderDateFmt = order.orderDate;
  try { orderDateFmt = format(new Date(order.orderDate), "d MMMM yyyy"); } catch { /* */ }
  const now = new Date();
  const printDate = format(now, "d MMMM yyyy");
  const printTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const statusClass = order.status === "Completed" ? "completed" : order.status === "In Progress" ? "in-progress" : "draft";

  const rmRows = order.inputs.filter(i => i.rmName?.trim()).map((inp, i) => {
    const rm = rms.find(r => r.id === inp.rmId);
    const rate = parseFloat(rm?.costPerUnit || "0");
    const lc   = rate * (parseFloat(inp.qtyUsed) || 0);
    return `<tr class="${i % 2 ? "alt" : ""}">
      <td class="num">${i + 1}</td><td class="bold">${inp.rmName}</td>
      <td class="r bold green">${inp.qtyUsed}</td><td class="muted">${inp.unit || "—"}</td>
      <td class="r muted">${rate > 0 ? f(rate) : "—"}</td>
      <td class="r bold">${lc > 0 ? f(lc) : "—"}</td></tr>`;
  }).join("");

  const costRows = (order.productionCosts || []).filter(c => c.description?.trim()).map((c, i) =>
    `<tr class="${i % 2 ? "alt" : ""}">
      <td class="num">${i + 1}</td><td>${c.description}</td>
      <td class="r bold violet">${f(parseFloat(c.amount || "0"))}</td></tr>`
  ).join("");

  const outRows = [
    mainOut ? `<tr>
      <td class="bold">${mainOut.productName || "Main Product"}</td>
      <td><span class="tag main">MAIN</span></td>
      <td class="r bold orange">${mainOut.qty}</td><td class="muted">${mainOut.unit || "—"}</td>
      <td class="r bold orange">${f(mainCost)}</td>
      <td class="r bold orange">${sym}${mainPerUnit.toFixed(3)}</td></tr>` : "",
    ...byProds.map((bp, i) => {
      const hasM = bp.manualCost !== undefined && bp.manualCost !== "";
      const mc   = parseFloat(bp.manualCost || "0");
      const q    = parseFloat(bp.qty) || 0;
      const alloc = hasM ? mc * q : 0;
      return `<tr class="${i % 2 ? "alt" : ""}">
        <td>${bp.productName || "By-product"}</td>
        <td><span class="tag ${hasM ? "fixed" : "absorbed"}">${hasM ? "FIXED" : "ABSORBED"}</span></td>
        <td class="r bold muted">${bp.qty}</td><td class="muted">${bp.unit || "—"}</td>
        <td class="r">${hasM ? f(alloc) : `<em class="muted">absorbed</em>`}</td>
        <td class="r">${hasM ? `${sym}${mc.toFixed(3)}` : "—"}</td></tr>`;
    }),
  ].join("");

  const tInLeft = order.inputs.filter(i => i.rmName?.trim()).map(inp => {
    const rm = rms.find(r => r.id === inp.rmId);
    const lc = (parseFloat(rm?.costPerUnit || "0")) * (parseFloat(inp.qtyUsed) || 0);
    return `<div class="tr indent"><span>${inp.rmName}</span><span class="ta green">${f(lc)}</span></div>`;
  }).join("");

  const tCostLeft = (order.productionCosts || []).filter(c => c.description?.trim()).map(c =>
    `<div class="tr indent"><span>${c.description}</span><span class="ta violet">${f(parseFloat(c.amount || "0"))}</span></div>`
  ).join("");

  // Build tOutRight as plain string (no nested template literals)
  let tOutRight = "";
  if (mainOut && mainQty > 0) {
    tOutRight += '<p class="t-sub orange">Main Product</p>';
    tOutRight += `<div class="tr indent"><span>${mainOut.productName || "Main"} \u00d7 ${mainQty}</span><span class="ta orange">${f(mainCost)}</span></div>`;
    tOutRight += `<div style="font-size:7.5pt;color:#ea580c;padding-left:10pt;margin-bottom:3pt;">${sym}${mainPerUnit.toFixed(3)}/unit</div>`;
  }
  byProds.filter(bp => bp.productName?.trim()).forEach((bp, i) => {
    if (i === 0) tOutRight += '<p class="t-sub" style="margin-top:7pt;">By-products</p>';
    const hasM  = bp.manualCost !== undefined && bp.manualCost !== "";
    const mc    = parseFloat(bp.manualCost || "0");
    const q     = parseFloat(bp.qty) || 0;
    const alloc = hasM ? mc * q : 0;
    tOutRight += `<div class="tr indent"><span>${bp.productName} \u00d7 ${bp.qty}</span><span class="ta" style="color:${hasM ? "#374151" : "#9ca3af"};">${hasM ? f(alloc) : "absorbed"}</span></div>`;
    tOutRight += `<div style="font-size:7.5pt;color:${hasM ? "#10b981" : "#9ca3af"};padding-left:10pt;margin-bottom:3pt;font-style:${hasM ? "normal" : "italic"};">${hasM ? (sym + mc.toFixed(3) + "/unit \u00b7 FIXED") : "Cost absorbed by main product"}</div>`;
  });

  // Pre-build reconciliation production-cost block
  let reconProdBlock = "";
  if ((order.productionCosts || []).filter(c => c.description?.trim()).length > 0) {
    reconProdBlock = '<p class="t-sub" style="color:#7c3aed;margin-top:8pt;">Production Costs</p>';
    reconProdBlock += tCostLeft;
    reconProdBlock += `<div class="tr sub"><span style="color:#7c3aed;">Prod. Subtotal</span><span class="ta violet">${f(prodCost)}</span></div>`;
  }

  // Pre-build optional sections
  const hasWaste = order.wasteQty && order.wasteQty !== "0" && order.wasteQty !== "";
  const sectionN = (n: number) => hasWaste ? n : n - (n > 4 ? 1 : 0);
  let wasteSection = "";
  if (hasWaste) {
    wasteSection = '<div class="sec"><div class="sh a">5 \u00b7 Waste / Loss Recorded</div>';
    wasteSection += '<div style="border:1pt solid #e2e8f0;border-radius:0 0 5pt 5pt;padding:7pt 9pt;background:#fffbeb;">';
    wasteSection += `<strong>${order.wasteQty} ${order.wasteUnit || ""}</strong>`;
    if (order.wasteNotes) wasteSection += `<br><span style="color:#64748b;font-size:8.5pt;">${order.wasteNotes}</span>`;
    wasteSection += '</div></div>';
  }
  const batchNotesContent = order.notes || '<em style="color:#9ca3af;">No notes recorded.</em>';
  const batchNotesSection = `<div class="sec"><div class="sh sl">${sectionN(6)} \u00b7 Batch Notes</div><div class="nb">${batchNotesContent}</div></div>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Manufacturing Order — ${order.orderNumber}</title>
<style>
@page{size:A4;margin:16mm 15mm 18mm 15mm}
*,*::before,*::after{box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:9.5pt;color:#111;background:#fff;margin:0}
/* ── Header ── */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:9pt;border-bottom:2pt solid #ea580c;margin-bottom:12pt}
.co h1{margin:0 0 2pt;font-size:15pt;font-weight:700;color:#ea580c}
.co .tl{font-size:7.5pt;color:#777;margin:0 0 3pt}
.co .addr{font-size:7.5pt;color:#555;line-height:1.5}
.di{text-align:right}
.di .dt{font-size:12pt;font-weight:700;color:#111;margin-bottom:3pt}
.di .on{font-size:10pt;font-weight:700;color:#ea580c}
.di .dm{font-size:7.5pt;color:#666;line-height:1.6}
.badge{display:inline-block;padding:1.5pt 6pt;border-radius:99pt;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.4pt}
.draft{background:#f1f5f9;color:#475569}
.in-progress{background:#fffbeb;color:#b45309;border:1pt solid #fcd34d}
.completed{background:#f0fdf4;color:#166534;border:1pt solid #86efac}
/* ── Pill strip ── */
.pills{display:flex;gap:7pt;margin-bottom:12pt}
.pill{flex:1;background:#f8fafc;border:1pt solid #e2e8f0;border-radius:5pt;padding:5pt 9pt}
.pill .pl{font-size:6.5pt;text-transform:uppercase;letter-spacing:.6pt;color:#94a3b8;font-weight:700;margin-bottom:1pt}
.pill .pv{font-size:11pt;font-weight:700;color:#111}
.pill.rm .pv{color:#059669}.pill.pc .pv{color:#7c3aed}.pill.tc .pv{color:#ea580c}
/* ── Section ── */
.sec{margin-bottom:13pt;page-break-inside:avoid}
.sh{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.6pt;color:#fff;padding:4.5pt 9pt;border-radius:4pt 4pt 0 0}
.sh.g{background:#059669}.sh.v{background:#7c3aed}.sh.o{background:#ea580c}
.sh.sl{background:#475569}.sh.e{background:#10b981}.sh.a{background:#b45309}
/* ── Tables ── */
.tw{border:1pt solid #e2e8f0;border-radius:0 0 5pt 5pt;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:8.5pt}
th{background:#f8fafc;padding:4.5pt 7pt;text-align:left;font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.4pt;color:#64748b;border-bottom:1pt solid #e2e8f0}
th.r{text-align:right}
td{padding:4.5pt 7pt;border-bottom:.5pt solid #f1f5f9;vertical-align:top}
td.r{text-align:right}td.bold{font-weight:700}td.num{color:#9ca3af;width:18pt}
td.muted{color:#64748b}td.green{color:#059669}td.violet{color:#7c3aed}td.orange{color:#ea580c}
tr.alt{background:#f9fafb}tr:last-child td{border-bottom:none}
tfoot td{background:#f8fafc;font-weight:700;border-top:1.5pt solid #e2e8f0}
.tag{display:inline-block;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.3pt;padding:1pt 4.5pt;border-radius:3pt}
.tag.main{background:#fff7ed;color:#c2410c}.tag.fixed{background:#d1fae5;color:#065f46}.tag.absorbed{background:#f1f5f9;color:#64748b}
/* ── T-account ── */
.tac{display:flex;border:1pt solid #e2e8f0;border-radius:0 0 5pt 5pt;overflow:hidden}
.tc{flex:1;padding:7pt 9pt}.tc:first-child{border-right:1pt solid #e2e8f0}
.tch{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.6pt;color:#94a3b8;margin-bottom:5pt;padding-bottom:3pt;border-bottom:1pt solid #e2e8f0}
.t-sub{font-size:7.5pt;font-weight:700;color:#555;margin:5pt 0 2pt}
.t-sub.orange{color:#ea580c}
.tr{display:flex;justify-content:space-between;font-size:8.5pt;margin-bottom:2.5pt}
.tr.indent{padding-left:9pt;color:#555}
.tr.sub{border-top:.5pt solid #e2e8f0;padding-top:2.5pt;font-weight:700;margin-top:1pt}
.tr.tot{background:#f1f5f9;border-radius:3pt;padding:3.5pt 6pt;font-weight:700;margin-top:5pt;font-size:9.5pt}
.ta{font-variant-numeric:tabular-nums;white-space:nowrap}.ta.green{color:#059669}.ta.violet{color:#7c3aed}.ta.orange{color:#ea580c}
.bal{display:flex;justify-content:space-between;align-items:center;padding:5pt 9pt;font-size:8.5pt;font-weight:700}
.bal.ok{background:#f0fdf4;color:#166534;border-top:1pt solid #bbf7d0}
/* ── Notes / sig ── */
.nb{border:1pt solid #e2e8f0;border-radius:0 0 5pt 5pt;padding:7pt 9pt;font-size:8.5pt;color:#444;line-height:1.6;background:#fafafa;min-height:22pt}
.sigs{display:flex;gap:10pt;margin-top:18pt}
.sig{flex:1;padding-top:20pt;border-top:1pt solid #333;text-align:center}
.sig .sl{font-size:7.5pt;color:#555}
.sig .sn{font-size:7pt;color:#999;margin-top:1pt}
.ft{margin-top:12pt;padding-top:5pt;border-top:.5pt solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#9ca3af}
@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<!-- HEADER -->
<div class="hdr">
  <div class="co">
    ${s.logoBase64 ? `<img src="${s.logoBase64}" alt="logo" style="height:32pt;margin-bottom:3pt;display:block;"/>` : ""}
    <h1>${s.companyName || "Onesoft"}</h1>
    ${s.companyTagline ? `<p class="tl">${s.companyTagline}</p>` : ""}
    <div class="addr">${s.addressHull ? s.addressHull.replace(/\n/g," · ") : ""}${s.phoneHull ? ` · Tel: ${s.phoneHull}` : ""}${s.emailHull ? `<br>${s.emailHull}` : ""}${s.vatNumber ? ` · VAT: ${s.vatNumber}` : ""}${s.companyRegistration ? ` · Reg: ${s.companyRegistration}` : ""}</div>
  </div>
  <div class="di">
    <div class="dt">Manufacturing Production Order</div>
    <div class="on">${order.orderNumber}</div>
    <div class="dm">
      Date: <strong>${orderDateFmt}</strong><br>
      Status: <span class="badge ${statusClass}">${order.status}</span><br>
      <span style="color:#bbb;">Printed: ${printDate} at ${printTime}</span>
    </div>
  </div>
</div>

<!-- COST SUMMARY PILLS -->
<div class="pills">
  <div class="pill rm"><div class="pl">Raw Material Cost</div><div class="pv">${f(rmCost)}</div></div>
  <div class="pill pc"><div class="pl">Production Costs</div><div class="pv">${f(prodCost)}</div></div>
  <div class="pill tc"><div class="pl">Total Batch Cost</div><div class="pv">${f(total)}</div></div>
  <div class="pill"><div class="pl">Total Output Qty</div><div class="pv">${totalOutQty} units</div></div>
</div>

<!-- 1. RAW MATERIALS -->
<div class="sec">
  <div class="sh g">1 · Raw Materials Consumed</div>
  <div class="tw"><table>
    <thead><tr><th></th><th>Material / Ingredient</th><th class="r">Qty Used</th><th>Unit</th><th class="r">Rate</th><th class="r">Line Cost</th></tr></thead>
    <tbody>${rmRows}</tbody>
    <tfoot><tr><td colspan="5" class="r" style="font-size:7pt;color:#64748b;">Total Raw Material Cost</td><td class="r green" style="font-size:10pt;">${f(rmCost)}</td></tr></tfoot>
  </table></div>
</div>

<!-- 2. PRODUCTION COSTS -->
<div class="sec">
  <div class="sh v">2 · Production Costs</div>
  <div class="tw">${(order.productionCosts || []).filter(c => c.description?.trim()).length === 0
    ? `<div style="padding:9pt;color:#9ca3af;font-style:italic;">No additional production costs recorded.</div>`
    : `<table><thead><tr><th></th><th>Description</th><th class="r">Amount</th></tr></thead>
       <tbody>${costRows}</tbody>
       <tfoot><tr><td colspan="2" class="r" style="font-size:7pt;color:#64748b;">Subtotal</td><td class="r violet" style="font-size:10pt;">${f(prodCost)}</td></tr></tfoot>
       </table>`}
  </div>
</div>

<!-- 3. OUTPUT PRODUCTS -->
<div class="sec">
  <div class="sh o">3 · Output Products</div>
  <div class="tw"><table>
    <thead><tr><th>Product</th><th>Type</th><th class="r">Qty</th><th>Unit</th><th class="r">Allocated Cost</th><th class="r">Cost / Unit</th></tr></thead>
    <tbody>${outRows}</tbody>
    <tfoot><tr><td colspan="4" class="r" style="font-size:7pt;color:#64748b;">Total Allocated</td><td class="r orange" style="font-size:10pt;">${f(total)}</td><td></td></tr></tfoot>
  </table></div>
</div>

<!-- 4. COST RECONCILIATION -->
<div class="sec">
  <div class="sh e">4 · Cost Reconciliation — Manufacturing Account</div>
  <div class="tac">
    <div class="tc">
      <div class="tch">Costs In — Debits</div>
      <p class="t-sub" style="color:#059669;">Raw Materials</p>
      ${tInLeft}
      <div class="tr sub"><span style="color:#059669;">RM Subtotal</span><span class="ta green">${f(rmCost)}</span></div>
      ${reconProdBlock}
      <div class="tr tot"><span>Total In</span><span class="ta orange">${f(total)}</span></div>
    </div>
    <div class="tc">
      <div class="tch">Costs Out &#x2014; Credits</div>
      ${tOutRight}
      <div class="tr tot"><span>Total Out</span><span class="ta orange">${f(total)}</span></div>
    </div>
  </div>
  <div class="bal ok">
    <span>&#x2713; Fully Reconciled &#x2014; Cost In = Cost Out</span>
    <span>Variance: ${sym}0.00</span>
  </div>
</div>

${wasteSection}

${batchNotesSection}

<!-- SIGNATURES -->
<div class="sigs">
  <div class="sig"><div class="sl">Prepared By</div><div class="sn">Name &amp; Signature</div></div>
  <div class="sig"><div class="sl">Checked By</div><div class="sn">Name &amp; Signature</div></div>
  <div class="sig"><div class="sl">Approved By</div><div class="sn">Name &amp; Signature</div></div>
  <div class="sig"><div class="sl">Date</div><div class="sn">&nbsp;</div></div>
</div>

<!-- FOOTER -->
<div class="ft">
  <span>${s.companyName || "Onesoft"}${s.addressHull ? " · " + s.addressHull.split("\n")[0] : ""}${s.vatNumber ? " · VAT: " + s.vatNumber : ""}</span>
  <span>${order.orderNumber} · Page 1</span>
</div>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=750");
  if (!win) { alert("Please allow pop-ups to print manufacturing orders."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

// ── Recipe Print / PDF generator ─────────────────────────────────────────────
function printRecipe(recipe: MfgRecipe, rms: RawMaterial[], sym: string, decPlaces: number) {
  const s = getSettings();
  const outputs   = recipe.outputs || [];
  const [mainOut, ...byProds] = outputs;
  const f = (v: number) => `${sym}${v.toFixed(decPlaces)}`;

  // Compute base costs from RM rates × qty
  const rmCost   = recipe.inputs.reduce((sum, inp) => {
    const rm = rms.find(r => r.id === inp.rmId);
    return sum + (parseFloat(rm?.costPerUnit || "0") * (parseFloat(inp.qtyUsed) || 0));
  }, 0);
  const prodCost = (recipe.productionCosts || []).reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
  const total    = rmCost + prodCost;
  const mainQty  = parseFloat(mainOut?.qty || "0") || 0;
  const bpFixed  = byProds.reduce((sum, bp) => {
    const mc = parseFloat(bp.manualCost || ""); const q = parseFloat(bp.qty) || 0;
    return isNaN(mc) ? sum : sum + mc * q;
  }, 0);
  const mainCost    = total - bpFixed;
  const mainPerUnit = mainQty > 0 ? mainCost / mainQty : 0;
  const totalOutQty = outputs.reduce((t, o) => t + (parseFloat(o.qty) || 0), 0);

  let createdFmt = recipe.createdAt;
  try { createdFmt = format(new Date(recipe.createdAt), "d MMMM yyyy"); } catch { /* */ }
  const now = new Date();
  const printDate = format(now, "d MMMM yyyy");
  const printTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const rmRows = recipe.inputs.filter(i => i.rmName?.trim()).map((inp, i) => {
    const rm = rms.find(r => r.id === inp.rmId);
    const rate = parseFloat(rm?.costPerUnit || "0");
    const lc   = rate * (parseFloat(inp.qtyUsed) || 0);
    return `<tr class="${i % 2 ? "alt" : ""}">
      <td class="num">${i + 1}</td><td class="bold">${inp.rmName}</td>
      <td class="r bold green">${inp.qtyUsed}</td><td class="muted">${inp.unit || "—"}</td>
      <td class="r muted">${rate > 0 ? f(rate) : "—"}</td>
      <td class="r bold">${lc > 0 ? f(lc) : "—"}</td></tr>`;
  }).join("");

  const costRows = (recipe.productionCosts || []).filter(c => c.description?.trim()).map((c, i) =>
    `<tr class="${i % 2 ? "alt" : ""}">
      <td class="num">${i + 1}</td><td>${c.description}</td>
      <td class="r bold violet">${f(parseFloat(c.amount || "0"))}</td></tr>`
  ).join("");

  const outRows = [
    mainOut ? `<tr>
      <td class="bold">${mainOut.productName || "Main Product"}</td>
      <td><span class="tag main">MAIN</span></td>
      <td class="r bold orange">${mainOut.qty}</td><td class="muted">${mainOut.unit || "—"}</td>
      <td class="r bold orange">${total > 0 ? f(mainCost) : "—"}</td>
      <td class="r bold orange">${total > 0 && mainPerUnit > 0 ? `${sym}${mainPerUnit.toFixed(3)}` : "—"}</td></tr>` : "",
    ...byProds.map((bp, i) => {
      const hasM = bp.manualCost !== undefined && bp.manualCost !== "";
      const mc   = parseFloat(bp.manualCost || "0");
      const q    = parseFloat(bp.qty) || 0;
      const alloc = hasM ? mc * q : 0;
      return `<tr class="${i % 2 ? "alt" : ""}">
        <td>${bp.productName || "By-product"}</td>
        <td><span class="tag ${hasM ? "fixed" : "absorbed"}">${hasM ? "FIXED" : "ABSORBED"}</span></td>
        <td class="r bold muted">${bp.qty}</td><td class="muted">${bp.unit || "—"}</td>
        <td class="r">${hasM ? f(alloc) : `<em class="muted">absorbed by main</em>`}</td>
        <td class="r">${hasM ? `${sym}${mc.toFixed(3)}` : "—"}</td></tr>`;
    }),
  ].join("");

  const tInLeft = recipe.inputs.filter(i => i.rmName?.trim()).map(inp => {
    const rm = rms.find(r => r.id === inp.rmId);
    const lc = (parseFloat(rm?.costPerUnit || "0")) * (parseFloat(inp.qtyUsed) || 0);
    return `<div class="tr indent"><span>${inp.rmName}</span><span class="ta green">${f(lc)}</span></div>`;
  }).join("");

  const tCostLeft = (recipe.productionCosts || []).filter(c => c.description?.trim()).map(c =>
    `<div class="tr indent"><span>${c.description}</span><span class="ta violet">${f(parseFloat(c.amount || "0"))}</span></div>`
  ).join("");

  // Build tOutRight without nested template literals
  let tOutRight = "";
  if (mainOut && mainQty > 0) {
    tOutRight += '<p class="t-sub orange">Main Product</p>';
    tOutRight += `<div class="tr indent"><span>${mainOut.productName || "Main"} \u00d7 ${mainQty}</span><span class="ta orange">${total > 0 ? f(mainCost) : "\u2014"}</span></div>`;
    if (total > 0) {
      tOutRight += `<div style="font-size:7.5pt;color:#ea580c;padding-left:10pt;margin-bottom:3pt;">${sym}${mainPerUnit.toFixed(3)}/unit (base)</div>`;
    }
  }
  const visibleBPs = byProds.filter(bp => bp.productName?.trim());
  if (visibleBPs.length > 0) {
    tOutRight += '<p class="t-sub" style="margin-top:7pt;">By-products</p>';
    visibleBPs.forEach(bp => {
      const hasM  = bp.manualCost !== undefined && bp.manualCost !== "";
      const mc    = parseFloat(bp.manualCost || "0");
      const q     = parseFloat(bp.qty) || 0;
      const alloc = hasM ? mc * q : 0;
      tOutRight += `<div class="tr indent"><span>${bp.productName} \u00d7 ${bp.qty}</span><span class="ta" style="color:${hasM ? "#374151" : "#9ca3af"};">${hasM ? f(alloc) : "absorbed"}</span></div>`;
      tOutRight += `<div style="font-size:7.5pt;color:${hasM ? "#10b981" : "#9ca3af"};padding-left:10pt;margin-bottom:3pt;font-style:${hasM ? "normal" : "italic"};">${hasM ? (sym + mc.toFixed(3) + "/unit \u00b7 FIXED") : "Cost absorbed by main product"}</div>`;
    });
  }

  // Pre-build reconciliation section to avoid nested template literals
  let reconSection = "";
  if (total > 0) {
    let prodCostBlock = "";
    if ((recipe.productionCosts || []).filter(c => c.description?.trim()).length > 0) {
      prodCostBlock = '<p class="t-sub" style="color:#7c3aed;margin-top:8pt;">Production Costs</p>';
      prodCostBlock += tCostLeft;
      prodCostBlock += `<div class="tr sub"><span style="color:#7c3aed;">Prod. Subtotal</span><span class="ta violet">${f(prodCost)}</span></div>`;
    }
    const tInFallback = tInLeft || '<div class="tr indent"><span style="color:#9ca3af;font-style:italic;">None</span></div>';
    reconSection = [
      '<div class="sec">',
      '  <div class="sh e">4 \u00b7 Base Cost Reconciliation \u2014 Manufacturing Account</div>',
      '  <div class="tac">',
      '    <div class="tc">',
      '      <div class="tch">Costs In \u2014 Debits</div>',
      '      <p class="t-sub" style="color:#059669;">Raw Materials</p>',
      '      ' + tInFallback,
      `      <div class="tr sub"><span style="color:#059669;">RM Subtotal</span><span class="ta green">${f(rmCost)}</span></div>`,
      '      ' + prodCostBlock,
      `      <div class="tr tot"><span>Total In</span><span class="ta orange">${f(total)}</span></div>`,
      '    </div>',
      '    <div class="tc">',
      '      <div class="tch">Costs Out \u2014 Credits</div>',
      '      ' + tOutRight,
      `      <div class="tr tot"><span>Total Out</span><span class="ta orange">${f(total)}</span></div>`,
      '    </div>',
      '  </div>',
      `  <div class="bal ok"><span>\u2713 Fully Reconciled \u2014 Cost In = Cost Out (base quantities)</span><span>Variance: ${sym}0.00</span></div>`,
      '</div>',
    ].join("\n");
  }

  // Pre-build notes section
  const notesSectionNum = total > 0 ? 5 : 4;
  const notesContent    = recipe.notes || '<em style="color:#9ca3af;">No notes recorded.</em>';
  const notesSection    = `<div class="sec"><div class="sh sl">${notesSectionNum} \u00b7 Recipe Notes</div><div class="nb">${notesContent}</div></div>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Recipe — ${recipe.name}</title>
<style>
@page{size:A4;margin:16mm 15mm 18mm 15mm}
*,*::before,*::after{box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:9.5pt;color:#111;background:#fff;margin:0}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:9pt;border-bottom:2pt solid #7c3aed;margin-bottom:12pt}
.co h1{margin:0 0 2pt;font-size:15pt;font-weight:700;color:#7c3aed}
.co .tl{font-size:7.5pt;color:#777;margin:0 0 3pt}
.co .addr{font-size:7.5pt;color:#555;line-height:1.5}
.di{text-align:right}
.di .dt{font-size:12pt;font-weight:700;color:#111;margin-bottom:3pt}
.di .rn{font-size:11pt;font-weight:700;color:#7c3aed}
.di .dm{font-size:7.5pt;color:#666;line-height:1.6}
.rbadge{display:inline-block;padding:1.5pt 7pt;border-radius:99pt;font-size:7.5pt;font-weight:700;background:#f3f0ff;color:#6d28d9;border:1pt solid #c4b5fd;letter-spacing:.3pt}
.pills{display:flex;gap:7pt;margin-bottom:12pt}
.pill{flex:1;background:#f8fafc;border:1pt solid #e2e8f0;border-radius:5pt;padding:5pt 9pt}
.pill .pl{font-size:6.5pt;text-transform:uppercase;letter-spacing:.6pt;color:#94a3b8;font-weight:700;margin-bottom:1pt}
.pill .pv{font-size:11pt;font-weight:700;color:#111}
.pill.rm .pv{color:#059669}.pill.pc .pv{color:#7c3aed}.pill.tc .pv{color:#ea580c}
/* notice banner */
.notice{background:#f5f3ff;border:1pt solid #c4b5fd;border-radius:5pt;padding:6pt 10pt;margin-bottom:12pt;font-size:8pt;color:#5b21b6;display:flex;align-items:center;gap:6pt}
.sec{margin-bottom:13pt;page-break-inside:avoid}
.sh{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.6pt;color:#fff;padding:4.5pt 9pt;border-radius:4pt 4pt 0 0}
.sh.g{background:#059669}.sh.v{background:#7c3aed}.sh.o{background:#ea580c}
.sh.sl{background:#475569}.sh.e{background:#10b981}
.tw{border:1pt solid #e2e8f0;border-radius:0 0 5pt 5pt;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:8.5pt}
th{background:#f8fafc;padding:4.5pt 7pt;text-align:left;font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.4pt;color:#64748b;border-bottom:1pt solid #e2e8f0}
th.r{text-align:right}
td{padding:4.5pt 7pt;border-bottom:.5pt solid #f1f5f9;vertical-align:top}
td.r{text-align:right}td.bold{font-weight:700}td.num{color:#9ca3af;width:18pt}
td.muted{color:#64748b}td.green{color:#059669}td.violet{color:#7c3aed}td.orange{color:#ea580c}
tr.alt{background:#f9fafb}tr:last-child td{border-bottom:none}
tfoot td{background:#f8fafc;font-weight:700;border-top:1.5pt solid #e2e8f0}
.tag{display:inline-block;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.3pt;padding:1pt 4.5pt;border-radius:3pt}
.tag.main{background:#fff7ed;color:#c2410c}.tag.fixed{background:#d1fae5;color:#065f46}.tag.absorbed{background:#f1f5f9;color:#64748b}
.tac{display:flex;border:1pt solid #e2e8f0;border-radius:0 0 5pt 5pt;overflow:hidden}
.tc{flex:1;padding:7pt 9pt}.tc:first-child{border-right:1pt solid #e2e8f0}
.tch{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.6pt;color:#94a3b8;margin-bottom:5pt;padding-bottom:3pt;border-bottom:1pt solid #e2e8f0}
.t-sub{font-size:7.5pt;font-weight:700;color:#555;margin:5pt 0 2pt}
.t-sub.orange{color:#ea580c}
.tr{display:flex;justify-content:space-between;font-size:8.5pt;margin-bottom:2.5pt}
.tr.indent{padding-left:9pt;color:#555}
.tr.sub{border-top:.5pt solid #e2e8f0;padding-top:2.5pt;font-weight:700;margin-top:1pt}
.tr.tot{background:#f1f5f9;border-radius:3pt;padding:3.5pt 6pt;font-weight:700;margin-top:5pt;font-size:9.5pt}
.ta{font-variant-numeric:tabular-nums;white-space:nowrap}.ta.green{color:#059669}.ta.violet{color:#7c3aed}.ta.orange{color:#ea580c}
.bal{display:flex;justify-content:space-between;align-items:center;padding:5pt 9pt;font-size:8.5pt;font-weight:700}
.bal.ok{background:#f0fdf4;color:#166534;border-top:1pt solid #bbf7d0}
.nb{border:1pt solid #e2e8f0;border-radius:0 0 5pt 5pt;padding:7pt 9pt;font-size:8.5pt;color:#444;line-height:1.6;background:#fafafa;min-height:22pt}
.sigs{display:flex;gap:10pt;margin-top:18pt}
.sig{flex:1;padding-top:20pt;border-top:1pt solid #333;text-align:center}
.sig .sl{font-size:7.5pt;color:#555}
.sig .sn{font-size:7pt;color:#999;margin-top:1pt}
.ft{margin-top:12pt;padding-top:5pt;border-top:.5pt solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#9ca3af}
@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

<!-- HEADER -->
<div class="hdr">
  <div class="co">
    ${s.logoBase64 ? `<img src="${s.logoBase64}" alt="logo" style="height:32pt;margin-bottom:3pt;display:block;"/>` : ""}
    <h1>${s.companyName || "Onesoft"}</h1>
    ${s.companyTagline ? `<p class="tl">${s.companyTagline}</p>` : ""}
    <div class="addr">${s.addressHull ? s.addressHull.replace(/\n/g," · ") : ""}${s.phoneHull ? ` · Tel: ${s.phoneHull}` : ""}${s.emailHull ? `<br>${s.emailHull}` : ""}${s.vatNumber ? ` · VAT: ${s.vatNumber}` : ""}${s.companyRegistration ? ` · Reg: ${s.companyRegistration}` : ""}</div>
  </div>
  <div class="di">
    <div class="dt">Manufacturing Recipe</div>
    <div class="rn">${recipe.name}</div>
    <div class="dm">
      <span class="rbadge">RECIPE TEMPLATE</span><br>
      Created: <strong>${createdFmt}</strong><br>
      <span style="color:#bbb;">Printed: ${printDate} at ${printTime}</span>
    </div>
  </div>
</div>

<!-- NOTICE BANNER -->
<div class="notice">
  ★ This is a <strong>recipe template</strong>. Costs shown are estimates based on current raw material rates and base quantities. Actual batch costs will vary with production scale.
</div>

<!-- COST SUMMARY PILLS -->
<div class="pills">
  <div class="pill rm"><div class="pl">Base RM Cost</div><div class="pv">${total > 0 ? f(rmCost) : "—"}</div></div>
  <div class="pill pc"><div class="pl">Base Prod. Costs</div><div class="pv">${prodCost > 0 ? f(prodCost) : "—"}</div></div>
  <div class="pill tc"><div class="pl">Base Batch Cost</div><div class="pv">${total > 0 ? f(total) : "—"}</div></div>
  <div class="pill"><div class="pl">Base Output Qty</div><div class="pv">${totalOutQty > 0 ? `${totalOutQty} units` : "—"}</div></div>
</div>

<!-- 1. RAW MATERIALS / INGREDIENTS -->
<div class="sec">
  <div class="sh g">1 · Raw Materials / Ingredients</div>
  <div class="tw"><table>
    <thead><tr><th></th><th>Material / Ingredient</th><th class="r">Base Qty</th><th>Unit</th><th class="r">Current Rate</th><th class="r">Est. Cost</th></tr></thead>
    <tbody>${rmRows || `<tr><td colspan="6" style="padding:9pt;color:#9ca3af;font-style:italic;">No raw materials defined.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="5" class="r" style="font-size:7pt;color:#64748b;">Total Estimated RM Cost</td><td class="r green" style="font-size:10pt;">${total > 0 ? f(rmCost) : "—"}</td></tr></tfoot>
  </table></div>
</div>

<!-- 2. PRODUCTION COSTS -->
<div class="sec">
  <div class="sh v">2 · Production Costs</div>
  <div class="tw">${(recipe.productionCosts || []).filter(c => c.description?.trim()).length === 0
    ? `<div style="padding:9pt;color:#9ca3af;font-style:italic;">No additional production costs defined.</div>`
    : `<table><thead><tr><th></th><th>Description</th><th class="r">Base Amount</th></tr></thead>
       <tbody>${costRows}</tbody>
       <tfoot><tr><td colspan="2" class="r" style="font-size:7pt;color:#64748b;">Subtotal</td><td class="r violet" style="font-size:10pt;">${f(prodCost)}</td></tr></tfoot>
       </table>`}
  </div>
</div>

<!-- 3. OUTPUT PRODUCTS -->
<div class="sec">
  <div class="sh o">3 · Output Products</div>
  <div class="tw"><table>
    <thead><tr><th>Product</th><th>Type</th><th class="r">Base Qty</th><th>Unit</th><th class="r">Est. Allocated Cost</th><th class="r">Est. Cost / Unit</th></tr></thead>
    <tbody>${outRows || `<tr><td colspan="6" style="padding:9pt;color:#9ca3af;font-style:italic;">No output products defined.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="4" class="r" style="font-size:7pt;color:#64748b;">Total Est. Allocated</td><td class="r orange" style="font-size:10pt;">${total > 0 ? f(total) : "—"}</td><td></td></tr></tfoot>
  </table></div>
</div>

${reconSection}

${notesSection}

<!-- SIGNATURES -->
<div class="sigs">
  <div class="sig"><div class="sl">Reviewed By</div><div class="sn">Name &amp; Signature</div></div>
  <div class="sig"><div class="sl">Checked By</div><div class="sn">Name &amp; Signature</div></div>
  <div class="sig"><div class="sl">Approved By</div><div class="sn">Name &amp; Signature</div></div>
  <div class="sig"><div class="sl">Date</div><div class="sn">&nbsp;</div></div>
</div>

<!-- FOOTER -->
<div class="ft">
  <span>${s.companyName || "Onesoft"}${s.addressHull ? " · " + s.addressHull.split("\n")[0] : ""}${s.vatNumber ? " · VAT: " + s.vatNumber : ""}</span>
  <span>Recipe Template · ${recipe.name} · Page 1</span>
</div>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=750");
  if (!win) { alert("Please allow pop-ups to print recipes."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

// ── Grid columns ──────────────────────────────────────────────────────────────
const COLS: ColDef[] = [
  { field: "orderNumber", label: "Order #",   minW: 100, type: "text" },
  { field: "orderDate",   label: "Date",      minW: 110, type: "date" },
  { field: "status",      label: "Status",    minW: 120, type: "select", options: [...MFG_STATUSES] },
  { field: "_inputs",     label: "Inputs",    minW: 80,  type: "text" },
  { field: "_outputs",    label: "Outputs",   minW: 80,  type: "text" },
  { field: "_cost",       label: "Total Cost",minW: 110, type: "text" },
  { field: "notes",       label: "Notes",     minW: 200, type: "text" },
];
const TOTAL_MIN_W = COLS.reduce((s, c) => s + c.minW, 0) + 48 + 100;

const STATUS_BADGE: Record<string, string> = {
  "Draft":       "bg-muted text-muted-foreground",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  "Completed":   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  "Cancelled":   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

// ── Blank helpers ─────────────────────────────────────────────────────────────
const blankInput   = (): MfgInput       => ({ id: crypto.randomUUID(), rmId: "", rmName: "", unit: "", qtyUsed: "" });
const blankOutput  = (): MfgOutput      => ({ id: crypto.randomUUID(), productId: "", productName: "", qty: "", unit: "" });
const blankCost    = (): ProductionCost => ({ id: crypto.randomUUID(), description: "", amount: "" });

// ── Cost calculation ──────────────────────────────────────────────────────────
function calcRMCost(inputs: MfgInput[], rmList: { id: string; costPerUnit: string }[]): number {
  return inputs.reduce((sum, inp) => {
    const rm = rmList.find(r => r.id === inp.rmId);
    const cost = parseFloat(rm?.costPerUnit || "0");
    const qty  = parseFloat(inp.qtyUsed    || "0");
    return sum + cost * qty;
  }, 0);
}
function calcProdCost(costs: ProductionCost[]): number {
  return costs.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
}

// ── Recipe base (for auto-scaling) ────────────────────────────────────────────
type RecipeBase = {
  recipeName:      string;
  inputs:          { id: string; qty: number }[];     // base qty per raw-material row
  mainOutputQty:   number;                             // base qty of main product
  byProducts:      { id: string; qty: number }[];     // base qty per by-product row
  productionCosts: { id: string; amount: number }[];  // base amount per production cost row
};

// ── Form state type ───────────────────────────────────────────────────────────
type NewOrderForm = {
  orderDate:       string;
  status:          string;
  inputs:          MfgInput[];
  mainOutput:      MfgOutput;        // primary / main product (exactly one)
  byProducts:      MfgOutput[];      // optional secondary / co-products
  productionCosts: ProductionCost[];
  wasteQty:        string;
  wasteUnit:       string;
  wasteNotes:      string;
  notes:           string;
  recipeBase:      RecipeBase | null;
};

function defaultForm(): NewOrderForm {
  return {
    orderDate:       format(new Date(), "yyyy-MM-dd"),
    status:          "Draft",
    inputs:          [blankInput()],
    mainOutput:      blankOutput(),
    byProducts:      [],
    productionCosts: [],
    wasteQty:        "",
    wasteUnit:       "",
    wasteNotes:      "",
    notes:           "",
    recipeBase:      null,
  };
}

// ── Scale a numeric qty string to N decimal places, strip trailing zeros ──────
function scaleQty(baseQty: number, ratio: number): string {
  const v = baseQty * ratio;
  if (v === 0) return "0";
  const s = v.toFixed(6).replace(/\.?0+$/, "");
  return s;
}

// ── Detail tabs ───────────────────────────────────────────────────────────────
type Tab = "inputs" | "outputs" | "costs" | "waste";

export default function ManufacturingPage() {
  const { orders, add, remove, complete }     = useManufacturingOrders();
  const { rms }                               = useRawMaterials();
  const { recipes, add: addRecipe, remove: removeRecipe } = useRecipes();
  const { isStaff, staffPermissions }         = useAuth();
  const { toast }                             = useToast();
  const sym                                   = getSettingsCurrencySymbol();
  const dp                                    = getSettingsDecimalPlaces();
  const products                              = getProducts();
  const canEdit = !isStaff || staffPermissions.manufacturing !== "view";

  // ── New order sheet ───────────────────────────────────────────────────────
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm]       = useState<NewOrderForm>(defaultForm);

  const setF = (patch: Partial<NewOrderForm>) => setForm(f => ({ ...f, ...patch }));

  // inputs — manually editing qty clears recipeBase (disables auto-scaling)
  const addInput    = () => setF({ inputs: [...form.inputs, blankInput()] });
  const removeInput = (id: string) => setF({ inputs: form.inputs.filter(i => i.id !== id) });
  const updInput    = (id: string, p: Partial<MfgInput>) =>
    setForm(f => ({
      ...f,
      inputs: f.inputs.map(i => i.id === id ? { ...i, ...p } : i),
      // user overriding a qty manually disables auto-scaling for that field
      recipeBase: "qtyUsed" in p ? null : f.recipeBase,
    }));

  // main output — changing qty auto-scales ALL linked fields when recipe is loaded
  const updMainOutput = (p: Partial<MfgOutput>) =>
    setForm(f => {
      const newMain = { ...f.mainOutput, ...p };
      let newInputs       = f.inputs;
      let newByProducts   = f.byProducts;
      let newProdCosts    = f.productionCosts;
      if (f.recipeBase && f.recipeBase.mainOutputQty > 0 && "qty" in p) {
        const newQty = parseFloat(newMain.qty) || 0;
        if (newQty > 0) {
          const ratio = newQty / f.recipeBase.mainOutputQty;
          // scale raw materials
          newInputs = f.inputs.map(inp => {
            const base = f.recipeBase!.inputs.find(b => b.id === inp.id);
            return base ? { ...inp, qtyUsed: scaleQty(base.qty, ratio) } : inp;
          });
          // scale by-product quantities
          newByProducts = f.byProducts.map(bp => {
            const base = f.recipeBase!.byProducts.find(b => b.id === bp.id);
            return base ? { ...bp, qty: scaleQty(base.qty, ratio) } : bp;
          });
          // scale production cost amounts
          newProdCosts = f.productionCosts.map(c => {
            const base = f.recipeBase!.productionCosts.find(b => b.id === c.id);
            return base ? { ...c, amount: scaleQty(base.amount, ratio) } : c;
          });
        }
      }
      return { ...f, mainOutput: newMain, inputs: newInputs, byProducts: newByProducts, productionCosts: newProdCosts };
    });

  // by-products — manually editing qty disables auto-scaling (same as raw materials)
  const addByProduct    = () => setF({ byProducts: [...form.byProducts, blankOutput()] });
  const removeByProduct = (id: string) => setF({ byProducts: form.byProducts.filter(o => o.id !== id) });
  const updByProduct    = (id: string, p: Partial<MfgOutput>) =>
    setForm(f => ({
      ...f,
      byProducts: f.byProducts.map(o => o.id === id ? { ...o, ...p } : o),
      recipeBase: "qty" in p ? null : f.recipeBase,
    }));

  // production costs
  const addCost    = () => setF({ productionCosts: [...form.productionCosts, blankCost()] });
  const removeCost = (id: string) => setF({ productionCosts: form.productionCosts.filter(c => c.id !== id) });
  const updCost    = (id: string, p: Partial<ProductionCost>) =>
    setForm(f => ({
      ...f,
      productionCosts: f.productionCosts.map(c => c.id === id ? { ...c, ...p } : c),
      // manually editing an amount disables auto-scaling for costs
      recipeBase: "amount" in p ? null : f.recipeBase,
    }));

  // ── Cost summary (live) ───────────────────────────────────────────────────
  const rmCost    = useMemo(() => calcRMCost(form.inputs, rms), [form.inputs, rms]);
  const prodCost  = useMemo(() => calcProdCost(form.productionCosts), [form.productionCosts]);
  const totalCost = rmCost + prodCost;
  const mainQty   = parseFloat(form.mainOutput.qty) || 0;
  const byQty     = form.byProducts.reduce((s, o) => s + (parseFloat(o.qty) || 0), 0);
  const totalOutQty = mainQty + byQty;

  // By-products with a manual cost/unit carve out their share from the total;
  // the remainder is allocated entirely to the main product.
  const byProductsFixedCost = form.byProducts.reduce((s, bp) => {
    const mc = parseFloat(bp.manualCost || "");
    const q  = parseFloat(bp.qty) || 0;
    return isNaN(mc) ? s : s + mc * q;
  }, 0);
  const mainProductCost = totalCost - byProductsFixedCost;
  const mainCostPerUnit = mainQty > 0 ? mainProductCost / mainQty : 0;

  // Reconciliation — total allocated to all outputs must equal total batch cost
  const totalCostOut = mainProductCost + byProductsFixedCost;   // = totalCost by design
  const variance     = totalCost - totalCostOut;
  const balanced     = Math.abs(variance) < 0.005;              // float-safe tolerance

  // Active scale ratio — null when no recipe is loaded or base qty is 0
  const scaleRatio = (form.recipeBase && form.recipeBase.mainOutputQty > 0 && mainQty > 0)
    ? mainQty / form.recipeBase.mainOutputQty
    : null;

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!form.mainOutput.productName.trim() || mainQty <= 0) {
      toast({ title: "Select a main product and enter a quantity", variant: "destructive" }); return;
    }
    const validByProducts = form.byProducts.filter(o => o.productName.trim() && (parseFloat(o.qty) || 0) > 0);
    add({
      orderDate:       form.orderDate,
      status:          form.status as ManufacturingOrder["status"],
      inputs:          form.inputs.filter(i => i.rmName.trim()),
      outputs:         [form.mainOutput, ...validByProducts],
      productionCosts: form.productionCosts.filter(c => c.description.trim()),
      wasteQty:        form.wasteQty,
      wasteUnit:       form.wasteUnit,
      wasteNotes:      form.wasteNotes,
      notes:           form.notes,
    });
    toast({ title: "Manufacturing order created" });
    setNewOpen(false);
    setForm(defaultForm());
  }, [form, mainQty, add, toast]);

  // ── Recipe states ─────────────────────────────────────────────────────────
  const [recipesOpen,    setRecipesOpen]    = useState(false);
  const [saveRecipeOpen, setSaveRecipeOpen] = useState(false);
  const [recipeName,     setRecipeName]     = useState("");
  const [loadDropOpen,   setLoadDropOpen]   = useState(false);
  const [deleteRecipeId, setDeleteRecipeId] = useState<string | null>(null);
  const loadDropRef = useRef<HTMLDivElement>(null);

  // ── Detail sheet ──────────────────────────────────────────────────────────
  const [viewId,   setViewId]   = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("inputs");
  const viewOrder = viewId ? orders.find(o => o.id === viewId) ?? null : null;

  const handleComplete = useCallback((id: string) => {
    try {
      complete(id);
      toast({ title: "Order completed — raw materials deducted, products added to stock" });
      setViewId(null);
    } catch (e: unknown) { toast({ title: (e as Error).message, variant: "destructive" }); }
  }, [complete, toast]);

  // ── Order cost helpers for grid/detail ───────────────────────────────────
  const orderTotalCost = (o: ManufacturingOrder) =>
    calcRMCost(o.inputs, rms) + calcProdCost(o.productionCosts || []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = {
    total:      orders.length,
    draft:      orders.filter(o => o.status === "Draft").length,
    inProgress: orders.filter(o => o.status === "In Progress").length,
    completed:  orders.filter(o => o.status === "Completed").length,
  };

  const lbl = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block";

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Factory size={20} className="text-orange-600" /> Manufacturing Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Convert raw materials into finished products</p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
            onClick={() => { setForm(defaultForm()); setNewOpen(true); }}>
            <Plus size={14} /> New Order
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Orders",  value: stats.total,      color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30"   },
          { label: "Draft",         value: stats.draft,      color: "text-muted-foreground", bg: "bg-muted/40"                    },
          { label: "In Progress",   value: stats.inProgress, color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/30"      },
          { label: "Completed",     value: stats.completed,  color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-950/30"},
        ].map(c => (
          <div key={c.label} className={`rounded-lg border p-3 ${c.bg}`}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <ExcelGridShell cols={COLS} totalMinW={TOTAL_MIN_W} tableId="manufacturing">
        {orders.map((order, rowIdx) => {
          const tCost = orderTotalCost(order);
          const cells: Record<string, string> = {
            orderNumber: order.orderNumber,
            orderDate:   order.orderDate ? (() => { try { return format(new Date(order.orderDate), "d MMM yyyy"); } catch { return order.orderDate; } })() : "—",
            status:      order.status,
            _inputs:     `${order.inputs.length} mat.`,
            _outputs:    `${(order.outputs || []).length} prod.`,
            _cost:       tCost > 0 ? `${sym}${tCost.toFixed(dp)}` : "—",
            notes:       order.notes || "—",
          };
          return (
            <tr key={order.id} style={{ height: CELL_H }}>
              <td className="border-r border-border text-center text-[11px] text-muted-foreground select-none" style={{ width: 48, minWidth: 48 }}>{rowIdx + 1}</td>
              {COLS.map(col => (
                <td key={col.field} style={{ minWidth: col.minW }} className="border-r border-border p-0">
                  {col.field === "status" ? (
                    <div className="px-2 flex items-center h-full">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${STATUS_BADGE[cells[col.field]] || "bg-muted text-muted-foreground"}`}>{cells[col.field]}</span>
                    </div>
                  ) : (
                    <div className="px-2 text-[13px] truncate h-full flex items-center">{cells[col.field]}</div>
                  )}
                </td>
              ))}
              <td className="text-center" style={{ width: 100, minWidth: 100 }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => { setViewId(order.id); setActiveTab("inputs"); }}
                    className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600" title="View">
                    <Eye size={13} />
                  </button>
                  {canEdit && (order.status === "Draft" || order.status === "In Progress") && (
                    <button onClick={() => handleComplete(order.id)}
                      className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600" title="Complete">
                      <CheckCircle2 size={13} />
                    </button>
                  )}
                  {canEdit && (order.status === "Draft" || order.status === "Cancelled") && (
                    <button onClick={() => setDeleteId(order.id)}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
        {orders.length === 0 && (
          <tr style={{ height: CELL_H }}>
            <td colSpan={COLS.length + 2} className="text-center text-[13px] text-muted-foreground py-8 italic">
              No manufacturing orders yet. Click "New Order" to get started.
            </td>
          </tr>
        )}
      </ExcelGridShell>

      {/* ════ Recipes Panel ═════════════════════════════════════════════════════ */}
      <div className="border rounded-xl overflow-hidden">
        <button
          onClick={() => setRecipesOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-violet-50 dark:bg-violet-950/20 hover:bg-violet-100 dark:hover:bg-violet-950/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <BookMarked size={16} className="text-violet-600" />
            <span className="text-[14px] font-bold text-violet-700 dark:text-violet-300">
              Production Recipes
            </span>
            <span className="text-[11px] bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-semibold">
              {recipes.length}
            </span>
          </div>
          {recipesOpen ? <ChevronUp size={16} className="text-violet-500" /> : <ChevronDown size={16} className="text-violet-500" />}
        </button>

        {recipesOpen && (
          <div className="p-4">
            {recipes.length === 0 ? (
              <div className="text-center py-8 text-[13px] text-muted-foreground italic">
                No recipes saved yet. Create a manufacturing order and click "Save as Recipe" to save a template.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recipes.map(r => (
                  <div key={r.id} className="border rounded-xl p-4 space-y-2.5 bg-white dark:bg-zinc-900 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                          <BookMarked size={14} className="text-violet-600" />
                        </div>
                        <span className="text-[13px] font-bold leading-tight">{r.name}</span>
                      </div>
                      {canEdit && (
                        <button onClick={() => setDeleteRecipeId(r.id)} className="text-red-400 hover:text-red-600 p-0.5 shrink-0">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-[11px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                        {r.inputs.length} input{r.inputs.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[11px] bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-full">
                        {r.outputs.length} output{r.outputs.length !== 1 ? "s" : ""}
                      </span>
                      {r.productionCosts.length > 0 && (
                        <span className="text-[11px] bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full">
                          {r.productionCosts.length} cost{r.productionCosts.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {r.notes && <p className="text-[11px] text-muted-foreground truncate">{r.notes}</p>}
                    <div className="flex gap-1.5 mt-1">
                      {/* Print recipe — always visible */}
                      <Button size="sm" variant="outline"
                        className="flex-1 h-8 text-[12px] gap-1 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/30"
                        onClick={() => printRecipe(r, rms, sym, dp)}>
                        <Printer size={12} /> Print
                      </Button>
                      {canEdit && (
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-[12px] gap-1"
                          onClick={() => {
                            const newInputs   = r.inputs.map(x => ({ ...x, id: crypto.randomUUID() }));
                            const [firstOut, ...restOuts] = r.outputs;
                            const mainOut     = firstOut ? { ...firstOut, id: crypto.randomUUID() } : blankOutput();
                            const baseMainQty = parseFloat(mainOut.qty) || 0;
                            const newBPs      = restOuts.map(o => ({ ...o, id: crypto.randomUUID() }));
                            const newCosts    = r.productionCosts.map(c => ({ ...c, id: crypto.randomUUID() }));
                            setF({
                              inputs:          newInputs,
                              mainOutput:      mainOut,
                              byProducts:      newBPs,
                              productionCosts: newCosts,
                              notes:           r.notes,
                              recipeBase: {
                                recipeName:      r.name,
                                mainOutputQty:   baseMainQty,
                                inputs:          newInputs.map((inp, idx) => ({ id: inp.id, qty: parseFloat(r.inputs[idx]?.qtyUsed || "0") || 0 })),
                                byProducts:      newBPs.map((bp, idx)  => ({ id: bp.id,  qty: parseFloat(restOuts[idx]?.qty || "0") || 0 })),
                                productionCosts: newCosts.map((c, idx)  => ({ id: c.id,   amount: parseFloat(r.productionCosts[idx]?.amount || "0") || 0 })),
                              },
                            });
                            setNewOpen(true);
                            toast({ title: `Recipe "${r.name}" loaded — change main product qty to auto-scale everything` });
                          }}>
                          <BookOpen size={12} /> Use Recipe
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════ New Order Bottom Sheet ════════════════════════════════════════════ */}
      <Sheet open={newOpen} onOpenChange={o => { if (!o) setNewOpen(false); }}>
        <SheetContent side="bottom" className="h-[94vh] rounded-t-2xl p-0 flex flex-col overflow-hidden">

          {/* Gradient header */}
          <div className="flex-none" style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)" }}>
            <div className="flex items-center justify-between px-6 py-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Factory size={18} className="text-white" />
                </div>
                <SheetTitle className="text-white text-lg font-bold">New Manufacturing Order</SheetTitle>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-white/15 rounded-lg px-3 py-1.5">
                  <span className="text-white/70 text-[11px] uppercase tracking-wide font-semibold">Date</span>
                  <Input type="date" value={form.orderDate}
                    onChange={e => setF({ orderDate: e.target.value })}
                    className="h-7 w-36 text-[13px] bg-white/20 border-0 text-white [color-scheme:dark] focus-visible:ring-0" />
                </div>
                <div className="flex items-center gap-2 bg-white/15 rounded-lg px-3 py-1.5">
                  <span className="text-white/70 text-[11px] uppercase tracking-wide font-semibold">Status</span>
                  <Select value={form.status} onValueChange={v => setF({ status: v })}>
                    <SelectTrigger className="h-7 w-32 text-[13px] bg-white/20 border-0 text-white focus:ring-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Draft", "In Progress"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* ── Load Recipe dropdown ── */}
                {recipes.length > 0 && (
                  <div className="relative" ref={loadDropRef}>
                    <Button variant="outline" size="sm"
                      className="bg-white/20 border-white/30 text-white hover:bg-white/30 gap-1.5"
                      onClick={() => setLoadDropOpen(o => !o)}>
                      <BookOpen size={13} /> Load Recipe <ChevronDown size={11} />
                    </Button>
                    {loadDropOpen && (
                      <div className="absolute right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl min-w-[220px] overflow-hidden">
                        {recipes.map((r, i) => (
                          <button key={r.id} onMouseDown={() => {
                            const newInputs   = r.inputs.map(x => ({ ...x, id: crypto.randomUUID() }));
                            const [firstOut, ...restOuts] = r.outputs;
                            const mainOut     = firstOut ? { ...firstOut, id: crypto.randomUUID() } : blankOutput();
                            const baseMainQty = parseFloat(mainOut.qty) || 0;
                            const newBPs      = restOuts.map(x => ({ ...x, id: crypto.randomUUID() }));
                            const newCosts    = r.productionCosts.map(x => ({ ...x, id: crypto.randomUUID() }));
                            setF({
                              inputs:          newInputs,
                              mainOutput:      mainOut,
                              byProducts:      newBPs,
                              productionCosts: newCosts,
                              notes:           r.notes,
                              recipeBase: {
                                recipeName:      r.name,
                                mainOutputQty:   baseMainQty,
                                inputs:          newInputs.map((inp, idx) => ({ id: inp.id, qty: parseFloat(r.inputs[idx]?.qtyUsed || "0") || 0 })),
                                byProducts:      newBPs.map((bp, idx)  => ({ id: bp.id,  qty: parseFloat(restOuts[idx]?.qty || "0") || 0 })),
                                productionCosts: newCosts.map((c, idx)  => ({ id: c.id,   amount: parseFloat(r.productionCosts[idx]?.amount || "0") || 0 })),
                              },
                            });
                            setLoadDropOpen(false);
                            toast({ title: `Recipe "${r.name}" loaded — change main product qty to auto-scale everything` });
                          }}
                          className={`w-full text-left px-4 py-2.5 text-[13px] hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors ${i > 0 ? "border-t border-gray-100 dark:border-zinc-800" : ""}`}>
                            <div className="font-semibold text-gray-800 dark:text-gray-100">{r.name}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {r.inputs.length} input{r.inputs.length !== 1 ? "s" : ""} · {r.outputs.length} output{r.outputs.length !== 1 ? "s" : ""}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                  onClick={() => setNewOpen(false)}>Cancel</Button>
                <Button size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30 gap-1.5"
                  variant="outline"
                  onClick={() => { setRecipeName(""); setSaveRecipeOpen(true); }}>
                  <BookMarked size={13} /> Save as Recipe
                </Button>
                <Button size="sm" className="bg-white text-orange-600 hover:bg-white/90 font-bold" onClick={handleSave}>
                  Create Order
                </Button>
              </div>
            </div>
          </div>

          {/* Two-column body */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 min-h-full divide-y lg:divide-y-0 lg:divide-x divide-border">

              {/* ── LEFT: Raw Materials + Waste ── */}
              <div className="p-6 flex flex-col gap-5 overflow-y-auto">

                {/* Raw Materials header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FlaskConical size={16} className="text-emerald-600" />
                      <h2 className="text-[15px] font-bold">Raw Materials</h2>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5 ml-6">Ingredients consumed in this batch</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 text-[13px] h-9 px-4" onClick={addInput}>
                    <Plus size={13} /> Add Row
                  </Button>
                </div>

                {/* Auto-scaling indicator */}
                {form.recipeBase && (
                  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                    <div className="flex items-center gap-2 text-[12px] text-violet-700 dark:text-violet-300 flex-wrap">
                      <BookMarked size={13} />
                      <span className="font-semibold">Auto-scaling active</span>
                      <span className="text-violet-500 dark:text-violet-400">
                        · <em>{form.recipeBase.recipeName}</em> · base: {form.recipeBase.mainOutputQty} units
                        {form.recipeBase.byProducts.length > 0 && ` · ${form.recipeBase.byProducts.length} by-product(s)`}
                        {form.recipeBase.productionCosts.length > 0 && ` · ${form.recipeBase.productionCosts.length} cost(s)`}
                      </span>
                    </div>
                    <button
                      onClick={() => setF({ recipeBase: null })}
                      className="text-[11px] text-violet-500 hover:text-violet-700 underline shrink-0"
                    >
                      Disable
                    </button>
                  </div>
                )}

                {/* Inputs table */}
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-emerald-50 dark:bg-emerald-950/20">
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 border-b">Raw Material</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 border-b" style={{width:90}}>Unit</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 border-b" style={{width:110}}>Qty Used</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 border-b" style={{width:100}}>Line Cost</th>
                        <th className="border-b" style={{width:36}} />
                      </tr>
                    </thead>
                    <tbody>
                      {form.inputs.map((inp, idx) => {
                        const rm = rms.find(r => r.id === inp.rmId);
                        const lineCost = (parseFloat(rm?.costPerUnit || "0") * (parseFloat(inp.qtyUsed) || 0));
                        return (
                          <tr key={inp.id} className={`border-b last:border-0 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                            <td className="px-3 py-2">
                              {rms.length > 0 ? (
                                <Select value={inp.rmId || ""} onValueChange={v => {
                                  const r = rms.find(x => x.id === v);
                                  if (r) updInput(inp.id, { rmId: r.id, rmName: r.name, unit: r.unit });
                                }}>
                                  <SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="Select material…" /></SelectTrigger>
                                  <SelectContent>
                                    {rms.map(r => (
                                      <SelectItem key={r.id} value={r.id}>
                                        <span className="font-medium">{r.name}</span>
                                        <span className="text-muted-foreground ml-2 text-[11px]">{r.rmCode} · Stock: {r.currentStock} {r.unit}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input value={inp.rmName} onChange={e => updInput(inp.id, { rmName: e.target.value })}
                                  placeholder="Material name" className="h-10 text-[13px]" />
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <Input value={inp.unit} onChange={e => updInput(inp.id, { unit: e.target.value })}
                                placeholder="kg" className="h-10 text-[13px]" />
                            </td>
                            <td className="px-2 py-2">
                              <Input type="number" min="0" value={inp.qtyUsed}
                                onChange={e => updInput(inp.id, { qtyUsed: e.target.value })}
                                placeholder="0" className="h-10 text-[13px]" />
                            </td>
                            <td className="px-3 py-2 text-right text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              {lineCost > 0 ? `${sym}${lineCost.toFixed(dp)}` : "—"}
                            </td>
                            <td className="px-1 py-2 text-center">
                              {form.inputs.length > 1 && (
                                <button onClick={() => removeInput(inp.id)} className="text-red-400 hover:text-red-600 p-1">
                                  <XCircle size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50/60 dark:bg-emerald-950/10 border-t-2">
                        <td colSpan={3} className="px-4 py-2.5 text-[12px] text-muted-foreground">
                          {form.inputs.filter(i => i.rmName).length} material(s) selected
                        </td>
                        <td className="px-3 py-2.5 text-right text-[13px] font-bold text-emerald-700 dark:text-emerald-400">
                          {sym}{rmCost.toFixed(dp)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Production Costs */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <DollarSign size={16} className="text-violet-600" />
                        <h2 className="text-[15px] font-bold">Production Costs</h2>
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5 ml-6">Labour, utilities, machine hire…</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 text-[13px] h-9 px-4" onClick={addCost}>
                      <Plus size={13} /> Add
                    </Button>
                  </div>

                  {form.productionCosts.length === 0 ? (
                    <div className="border-2 border-dashed rounded-xl p-5 text-center text-[13px] text-muted-foreground">
                      No additional costs yet — click "Add" to record labour, electricity, packaging, etc.
                    </div>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-violet-50 dark:bg-violet-950/20">
                            <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400 border-b">Description</th>
                            <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400 border-b" style={{width:140}}>Amount</th>
                            <th className="border-b" style={{width:36}} />
                          </tr>
                        </thead>
                        <tbody>
                          {form.productionCosts.map((c, idx) => (
                            <tr key={c.id} className={`border-b last:border-0 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                              <td className="px-3 py-2">
                                <Input value={c.description} onChange={e => updCost(c.id, { description: e.target.value })}
                                  placeholder="e.g. Labour, Electricity, Packaging…" className="h-10 text-[13px]" />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex flex-col gap-0.5">
                                  <Input type="number" min="0" value={c.amount}
                                    onChange={e => updCost(c.id, { amount: e.target.value })}
                                    placeholder="0.00" className="h-10 text-[13px] text-right" />
                                  {scaleRatio !== null && scaleRatio !== 1 && (
                                    <span className="text-[9px] font-semibold text-violet-600 dark:text-violet-400 text-right">
                                      ×{scaleRatio.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-1 py-2 text-center">
                                <button onClick={() => removeCost(c.id)} className="text-red-400 hover:text-red-600 p-1">
                                  <XCircle size={15} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-violet-50/60 dark:bg-violet-950/10 border-t-2">
                            <td className="px-4 py-2.5 text-[12px] text-muted-foreground font-semibold">Subtotal</td>
                            <td className="px-3 py-2.5 text-right text-[13px] font-bold text-violet-700 dark:text-violet-400">
                              {sym}{prodCost.toFixed(dp)}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* Batch Notes */}
                <div>
                  <Label className={lbl}>Batch Notes (optional)</Label>
                  <Textarea value={form.notes} onChange={e => setF({ notes: e.target.value })}
                    rows={3} placeholder="Batch reference, special instructions, QC notes…" className="text-[13px] resize-none" />
                </div>
              </div>

              {/* ── RIGHT: Outputs + Production Costs + Summary ── */}
              <div className="p-6 flex flex-col gap-5 overflow-y-auto">

                {/* Output Products header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package size={16} className="text-orange-600" />
                      <h2 className="text-[15px] font-bold">Output Products</h2>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5 ml-6">One main product + optional by-products</p>
                  </div>
                </div>

                {/* ── Main Product ── */}
                <div className="border-2 border-orange-200 dark:border-orange-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-200 dark:border-orange-800">
                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">Main Product</span>
                    {form.recipeBase && (
                      <span className="ml-auto text-[10px] text-violet-500 italic">← change qty to auto-scale materials</span>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_110px_90px_100px] gap-0 divide-x divide-border">
                    {/* Product selector */}
                    <div className="px-3 py-2">
                      {products.length > 0 ? (
                        <Select value={form.mainOutput.productId || ""} onValueChange={v => {
                          const p = products.find(x => x.id === v);
                          if (p) updMainOutput({ productId: p.id, productName: p.name, unit: p.unit });
                          else   updMainOutput({ productId: v });
                        }}>
                          <SelectTrigger className="h-10 text-[13px] border-0 shadow-none focus:ring-0 px-0"><SelectValue placeholder="Select main product…" /></SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className="font-medium">{p.name}</span>
                                <span className="text-muted-foreground ml-2 text-[11px]">{p.sku}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={form.mainOutput.productName} onChange={e => updMainOutput({ productName: e.target.value })}
                          placeholder="Product name" className="h-10 text-[13px]" />
                      )}
                    </div>
                    {/* Qty */}
                    <div className="px-2 py-2">
                      <div className="flex flex-col gap-0.5">
                        <Input type="number" min="0" value={form.mainOutput.qty}
                          onChange={e => updMainOutput({ qty: e.target.value })}
                          placeholder="0" className="h-10 text-[13px]" />
                        {form.recipeBase && form.recipeBase.mainOutputQty > 0 && mainQty > 0 && mainQty !== form.recipeBase.mainOutputQty && (
                          <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 text-center">
                            ×{(mainQty / form.recipeBase.mainOutputQty).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Unit */}
                    <div className="px-2 py-2">
                      <Input value={form.mainOutput.unit} onChange={e => updMainOutput({ unit: e.target.value })}
                        placeholder="pcs" className="h-10 text-[13px]" />
                    </div>
                    {/* Cost/unit — uses remaining cost after by-product manual costs are carved out */}
                    <div className="px-3 py-2 flex flex-col items-end justify-center gap-0.5">
                      <span className="text-[13px] font-bold text-orange-700 dark:text-orange-400 whitespace-nowrap">
                        {mainQty > 0 && mainProductCost > 0
                          ? `${sym}${mainCostPerUnit.toFixed(3)}`
                          : "—"}
                      </span>
                      {byProductsFixedCost > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          −{sym}{byProductsFixedCost.toFixed(dp)} saved
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_110px_90px_100px] divide-x divide-border border-t border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-950/10">
                    <div className="px-4 py-1.5 text-[11px] text-orange-600 dark:text-orange-400 font-semibold">Product</div>
                    <div className="px-3 py-1.5 text-[11px] text-orange-600 dark:text-orange-400 font-semibold">Qty</div>
                    <div className="px-3 py-1.5 text-[11px] text-orange-600 dark:text-orange-400 font-semibold">Unit</div>
                    <div className="px-3 py-1.5 text-[11px] text-right text-orange-600 dark:text-orange-400 font-semibold">Cost/Unit</div>
                  </div>
                </div>

                {/* ── By-products ── */}
                <div className="border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        By-products / Co-products
                      </span>
                      {form.byProducts.length > 0 && (
                        <span className="text-[10px] bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full font-semibold">
                          {form.byProducts.length}
                        </span>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="gap-1 text-[12px] h-7 px-2 text-muted-foreground" onClick={addByProduct}>
                      <Plus size={12} /> Add By-product
                    </Button>
                  </div>

                  {form.byProducts.length === 0 ? (
                    <div className="px-4 py-4 text-center text-[12px] text-muted-foreground italic">
                      No by-products — click "Add By-product" to record secondary outputs (scrap, offcuts, co-products…)
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/20 border-b">
                          <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Product</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground" style={{width:100}}>Qty</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground" style={{width:85}}>Unit</th>
                          <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground" style={{width:100}}>Cost/Unit</th>
                          <th style={{width:34}} />
                        </tr>
                      </thead>
                      <tbody>
                        {form.byProducts.map((bp, idx) => {
                          const hasManual = bp.manualCost !== undefined && bp.manualCost !== "";
                          return (
                            <tr key={bp.id} className={`border-b last:border-0 ${idx % 2 !== 0 ? "bg-muted/10" : ""}`}>
                              <td className="px-3 py-1.5">
                                {products.length > 0 ? (
                                  <Select value={bp.productId || ""} onValueChange={v => {
                                    const p = products.find(x => x.id === v);
                                    if (p) updByProduct(bp.id, { productId: p.id, productName: p.name, unit: p.unit });
                                    else   updByProduct(bp.id, { productId: v });
                                  }}>
                                    <SelectTrigger className="h-9 text-[12px]"><SelectValue placeholder="Select product…" /></SelectTrigger>
                                    <SelectContent>
                                      {products.map(p => (
                                        <SelectItem key={p.id} value={p.id}>
                                          <span className="font-medium">{p.name}</span>
                                          <span className="text-muted-foreground ml-2 text-[11px]">{p.sku}</span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input value={bp.productName} onChange={e => updByProduct(bp.id, { productName: e.target.value })}
                                    placeholder="Product name" className="h-9 text-[12px]" />
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex flex-col gap-0.5">
                                  <Input type="number" min="0" value={bp.qty}
                                    onChange={e => updByProduct(bp.id, { qty: e.target.value })}
                                    placeholder="0" className="h-9 text-[12px]" />
                                  {scaleRatio !== null && scaleRatio !== 1 && (
                                    <span className="text-[9px] font-semibold text-violet-600 dark:text-violet-400 text-center">
                                      ×{scaleRatio.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-1.5">
                                <Input value={bp.unit} onChange={e => updByProduct(bp.id, { unit: e.target.value })}
                                  placeholder="pcs" className="h-9 text-[12px]" />
                              </td>
                              {/* Editable Cost/Unit — fills in a fixed value that is carved out of total cost */}
                              <td className="px-2 py-1.5">
                                <div className="flex flex-col gap-0.5">
                                  <div className={`relative flex items-center rounded border text-[12px] h-9 ${hasManual ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20" : "border-input bg-background"}`}>
                                    <span className="pl-2 text-muted-foreground select-none">{sym}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={bp.manualCost ?? ""}
                                      onChange={e => updByProduct(bp.id, { manualCost: e.target.value === "" ? undefined : e.target.value })}
                                      placeholder="auto"
                                      className="flex-1 bg-transparent outline-none px-1 py-1 text-[12px] w-0 min-w-0 font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    {hasManual && (
                                      <button
                                        title="Clear — revert to auto"
                                        onClick={() => updByProduct(bp.id, { manualCost: undefined })}
                                        className="pr-1.5 text-emerald-600 hover:text-red-500 transition-colors"
                                      >
                                        <XCircle size={12} />
                                      </button>
                                    )}
                                  </div>
                                  {hasManual && (
                                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold text-center">FIXED · carves out of total</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-1 py-1.5 text-center">
                                <button onClick={() => removeByProduct(bp.id)} className="text-red-400 hover:text-red-600 p-1">
                                  <XCircle size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/20 border-t">
                          <td className="px-4 py-2 text-[11px] text-muted-foreground">{form.byProducts.length} by-product(s)</td>
                          <td className="px-3 py-2 text-[12px] font-bold text-muted-foreground">{byQty > 0 ? byQty : "—"}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                {/* Cost Summary Card */}
                <div className="rounded-xl border-2 border-orange-200 dark:border-orange-800 overflow-hidden">
                  <div className="px-5 py-3" style={{ background: "linear-gradient(135deg,#ea580c18,#f59e0b18)" }}>
                    <h3 className="text-[13px] font-bold text-orange-700 dark:text-orange-400">Cost Summary</h3>
                  </div>
                  <div className="p-5 space-y-3">
                    {/* Cost sources */}
                    {[
                      { label: "Raw Material Cost", value: rmCost,   color: "text-emerald-700 dark:text-emerald-400" },
                      { label: "Production Costs",  value: prodCost, color: "text-violet-700 dark:text-violet-400"  },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between items-center text-[13px]">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className={`font-semibold ${r.color}`}>{sym}{r.value.toFixed(dp)}</span>
                      </div>
                    ))}
                    <div className="border-t pt-3 flex justify-between items-center">
                      <span className="text-[14px] font-bold">Total Batch Cost</span>
                      <span className="text-[17px] font-bold text-orange-600">{sym}{totalCost.toFixed(dp)}</span>
                    </div>

                    {/* Allocation breakdown */}
                    {totalCost > 0 && (mainQty > 0 || form.byProducts.length > 0) && (
                      <div className="space-y-2 pt-1">
                        {/* Main product allocation */}
                        {mainQty > 0 && (
                          <div className="flex justify-between items-center text-[12px] bg-orange-50 dark:bg-orange-950/20 rounded-lg px-3 py-2">
                            <span className="text-orange-700 dark:text-orange-400 font-semibold truncate max-w-[55%]">
                              {form.mainOutput.productName || "Main Product"}
                              <span className="ml-1 font-normal text-muted-foreground">({mainQty} {form.mainOutput.unit || "units"})</span>
                            </span>
                            <div className="text-right">
                              <div className="font-bold text-orange-600">{sym}{mainProductCost.toFixed(dp)}</div>
                              {mainQty > 0 && <div className="text-[10px] text-orange-500">{sym}{mainCostPerUnit.toFixed(3)}/unit</div>}
                            </div>
                          </div>
                        )}
                        {/* By-product fixed costs */}
                        {form.byProducts.filter(bp => bp.manualCost && bp.manualCost !== "").map(bp => {
                          const mc = parseFloat(bp.manualCost || "0");
                          const q  = parseFloat(bp.qty) || 0;
                          return (
                            <div key={bp.id} className="flex justify-between items-center text-[12px] bg-muted/20 rounded-lg px-3 py-2">
                              <span className="text-muted-foreground font-medium truncate max-w-[55%]">
                                {bp.productName || "By-product"}
                                <span className="ml-1 text-[10px] text-emerald-600 font-semibold">FIXED</span>
                              </span>
                              <div className="text-right">
                                <div className="font-semibold text-foreground">{sym}{(mc * q).toFixed(dp)}</div>
                                <div className="text-[10px] text-muted-foreground">{sym}{mc.toFixed(3)}/unit</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Cost Reconciliation (Manufacturing Account) ── */}
                {totalCost > 0 && (
                  <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: balanced ? "#10b98130" : "#ef444430" }}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ background: balanced ? "linear-gradient(135deg,#10b98110,#059f7710)" : "linear-gradient(135deg,#ef444410,#dc262610)" }}>
                      <div className="flex items-center gap-2">
                        <Scale size={14} className={balanced ? "text-emerald-600" : "text-red-600"} />
                        <h3 className="text-[13px] font-bold" style={{ color: balanced ? "#059669" : "#dc2626" }}>
                          Cost Reconciliation
                        </h3>
                        <span className="text-[10px] text-muted-foreground">(Manufacturing Account)</span>
                      </div>
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${balanced ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" : "bg-red-100 text-red-700"}`}>
                        {balanced ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                        {balanced ? "Balanced" : "Unreconciled"}
                      </div>
                    </div>

                    {/* T-Account grid */}
                    <div className="grid grid-cols-2 divide-x text-[12px]">

                      {/* ── LEFT: Costs In (Debits) ── */}
                      <div className="p-3 space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Costs In — Debits</p>

                        {/* RM lines */}
                        <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5">Raw Materials</p>
                        {form.inputs.filter(i => i.rmName.trim()).map(inp => {
                          const rm = rms.find(r => r.id === inp.rmId);
                          const lc = (parseFloat(rm?.costPerUnit || "0") * (parseFloat(inp.qtyUsed) || 0));
                          return (
                            <div key={inp.id} className="flex justify-between items-center text-[11px] pl-2">
                              <span className="text-muted-foreground truncate max-w-[55%]">{inp.rmName}</span>
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">{sym}{lc.toFixed(dp)}</span>
                            </div>
                          );
                        })}
                        <div className="flex justify-between items-center text-[11px] border-t border-emerald-200 dark:border-emerald-900 pt-0.5 mt-0.5">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">RM Subtotal</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{sym}{rmCost.toFixed(dp)}</span>
                        </div>

                        {/* Production cost lines */}
                        {form.productionCosts.filter(c => c.description.trim()).length > 0 && (
                          <>
                            <div className="pt-2" />
                            <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-400 mb-0.5">Production Costs</p>
                            {form.productionCosts.filter(c => c.description.trim()).map(c => (
                              <div key={c.id} className="flex justify-between items-center text-[11px] pl-2">
                                <span className="text-muted-foreground truncate max-w-[55%]">{c.description}</span>
                                <span className="text-violet-700 dark:text-violet-400 font-medium tabular-nums">{sym}{(parseFloat(c.amount) || 0).toFixed(dp)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between items-center text-[11px] border-t border-violet-200 dark:border-violet-900 pt-0.5 mt-0.5">
                              <span className="font-semibold text-violet-700 dark:text-violet-400">Prod Subtotal</span>
                              <span className="font-bold text-violet-700 dark:text-violet-400 tabular-nums">{sym}{prodCost.toFixed(dp)}</span>
                            </div>
                          </>
                        )}

                        {/* Total In */}
                        <div className="flex justify-between items-center text-[12px] rounded-lg px-2 py-1.5 mt-2 bg-slate-100 dark:bg-slate-800">
                          <span className="font-bold">Total In</span>
                          <span className="font-bold text-orange-600 tabular-nums">{sym}{totalCost.toFixed(dp)}</span>
                        </div>
                      </div>

                      {/* ── RIGHT: Costs Out (Credits) ── */}
                      <div className="p-3 space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Costs Out — Credits</p>

                        {/* Main product */}
                        {mainQty > 0 && (
                          <>
                            <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-400 mb-0.5">Main Product</p>
                            <div className="flex justify-between items-center text-[11px] pl-2">
                              <span className="text-orange-700 dark:text-orange-400 font-semibold truncate max-w-[55%]">
                                {form.mainOutput.productName || "Main"} ×{mainQty}
                              </span>
                              <span className="text-orange-700 dark:text-orange-400 font-bold tabular-nums">{sym}{mainProductCost.toFixed(dp)}</span>
                            </div>
                            <div className="text-[10px] text-orange-500 pl-3 pb-0.5">{sym}{mainCostPerUnit.toFixed(3)}/unit</div>
                          </>
                        )}

                        {/* By-products */}
                        {form.byProducts.filter(bp => bp.productName.trim()).length > 0 && (
                          <>
                            <div className="pt-1" />
                            <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">By-products</p>
                            {form.byProducts.filter(bp => bp.productName.trim()).map(bp => {
                              const hasManual = bp.manualCost !== undefined && bp.manualCost !== "";
                              const bpQty = parseFloat(bp.qty) || 0;
                              const mc    = parseFloat(bp.manualCost || "0");
                              const alloc = hasManual ? mc * bpQty : 0;
                              return (
                                <div key={bp.id} className="pl-2">
                                  <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-muted-foreground font-medium truncate max-w-[55%]">
                                      {bp.productName} ×{bp.qty}
                                    </span>
                                    <span className={`tabular-nums font-medium ${hasManual ? "text-foreground" : "text-muted-foreground italic"}`}>
                                      {hasManual ? `${sym}${alloc.toFixed(dp)}` : "—"}
                                    </span>
                                  </div>
                                  {hasManual
                                    ? <div className="text-[9px] text-emerald-600 dark:text-emerald-400">{sym}{mc.toFixed(3)}/unit · FIXED</div>
                                    : <div className="text-[9px] text-muted-foreground italic">absorbed by main product</div>
                                  }
                                </div>
                              );
                            })}
                          </>
                        )}

                        {/* Total Out */}
                        <div className="flex justify-between items-center text-[12px] rounded-lg px-2 py-1.5 mt-2 bg-slate-100 dark:bg-slate-800">
                          <span className="font-bold">Total Out</span>
                          <span className="font-bold text-orange-600 tabular-nums">{sym}{totalCostOut.toFixed(dp)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Balance row */}
                    <div className={`px-4 py-2.5 border-t flex items-center justify-between ${balanced ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                      <div className="flex items-center gap-2">
                        {balanced
                          ? <CheckCircle size={14} className="text-emerald-600" />
                          : <AlertCircle size={14} className="text-red-600" />}
                        <span className={`text-[12px] font-bold ${balanced ? "text-emerald-700 dark:text-emerald-400" : "text-red-700"}`}>
                          {balanced ? "Fully Reconciled — Cost In = Cost Out" : "Unreconciled — Check allocations"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ArrowRight size={12} className="text-muted-foreground" />
                        <span className={`text-[13px] font-bold tabular-nums ${balanced ? "text-emerald-600" : "text-red-600"}`}>
                          {sym}{Math.abs(variance).toFixed(dp)} variance
                        </span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ════ Detail Sheet (bottom, full-width) ═══════════════════════════════ */}
      <Sheet open={!!viewId} onOpenChange={o => { if (!o) setViewId(null); }}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-2xl p-0 flex flex-col overflow-hidden">
          {viewOrder && (() => {
            const vRMCost   = calcRMCost(viewOrder.inputs, rms);
            const vProdCost = calcProdCost(viewOrder.productionCosts || []);
            const vTotal    = vRMCost + vProdCost;
            const vOutQty   = (viewOrder.outputs || []).reduce((s, o) => s + (parseFloat(o.qty) || 0), 0);

            return (
              <>
                {/* ── Gradient header ── */}
                <div className="flex-none" style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)" }}>
                  <div className="flex items-center justify-between gap-4 px-6 py-4 flex-wrap">
                    {/* Left: icon + title + badges */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                        <Factory size={20} className="text-white" />
                      </div>
                      <div>
                        <SheetTitle className="text-white text-lg font-bold leading-tight">{viewOrder.orderNumber}</SheetTitle>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[viewOrder.status] || "bg-white/20 text-white"}`}>{viewOrder.status}</span>
                          <span className="text-white/70 text-[12px]">
                            {viewOrder.orderDate ? (() => { try { return format(new Date(viewOrder.orderDate), "d MMM yyyy"); } catch { return viewOrder.orderDate; } })() : "—"}
                          </span>
                          {viewOrder.notes && <span className="text-white/50 text-[11px] italic truncate max-w-[260px]">{viewOrder.notes}</span>}
                        </div>
                      </div>
                    </div>
                    {/* Right: cost pills + action */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {[
                        { label: "RM Cost",    val: vRMCost,   color: "bg-white/15" },
                        { label: "Prod. Cost", val: vProdCost, color: "bg-white/15" },
                        { label: "Total",      val: vTotal,    color: "bg-white/25 ring-1 ring-white/30" },
                      ].map(p => (
                        <div key={p.label} className={`${p.color} rounded-xl px-3 py-1.5 text-white`}>
                          <div className="text-[9px] uppercase tracking-widest text-white/60 font-semibold">{p.label}</div>
                          <div className="text-[13px] font-bold">{sym}{p.val.toFixed(dp)}</div>
                        </div>
                      ))}
                      {/* Print / PDF button — always visible */}
                      <Button
                        variant="outline"
                        className="bg-white/15 hover:bg-white/25 text-white border-white/30 font-semibold gap-1.5 h-10 px-4 text-[13px] shadow"
                        onClick={() => printMfgOrder(viewOrder, rms, sym, dp)}
                      >
                        <Printer size={15} /> Print / PDF
                      </Button>
                      {canEdit && (viewOrder.status === "Draft" || viewOrder.status === "In Progress") && (
                        <Button className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold gap-1.5 h-10 px-4 text-[13px] shadow-lg"
                          onClick={() => handleComplete(viewOrder.id)}>
                          <CheckCircle2 size={15} /> Complete Order
                        </Button>
                      )}
                      {viewOrder.status === "Completed" && (
                        <span className="flex items-center gap-1.5 bg-emerald-500/30 border border-emerald-400/40 text-white rounded-xl px-3 py-1.5 text-[12px] font-semibold">
                          <CheckCircle2 size={13} /> Completed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Two-column body ── */}
                <div className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-1 lg:grid-cols-2 min-h-full divide-y lg:divide-y-0 lg:divide-x divide-border">

                    {/* LEFT: Inputs + Waste */}
                    <div className="p-6 flex flex-col gap-6">

                      {/* Raw Materials Consumed */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <FlaskConical size={15} className="text-emerald-600" />
                          <h2 className="text-[13px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Raw Materials Consumed</h2>
                          <span className="ml-auto text-[11px] text-muted-foreground">{viewOrder.inputs.length} material(s)</span>
                        </div>
                        <div className="rounded-xl border overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="bg-emerald-50 dark:bg-emerald-950/20 border-b">
                                {["Material", "Qty Used", "Unit", "Line Cost"].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {viewOrder.inputs.map((inp, i) => {
                                const rm = rms.find(r => r.id === inp.rmId);
                                const lc = (parseFloat(rm?.costPerUnit || "0")) * (parseFloat(inp.qtyUsed) || 0);
                                return (
                                  <tr key={inp.id} className={`border-b last:border-0 ${i % 2 !== 0 ? "bg-muted/20" : ""}`}>
                                    <td className="px-3 py-2.5 font-medium">{inp.rmName || "—"}</td>
                                    <td className="px-3 py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">{inp.qtyUsed}</td>
                                    <td className="px-3 py-2.5 text-muted-foreground">{inp.unit || "—"}</td>
                                    <td className="px-3 py-2.5 text-right font-semibold">{lc > 0 ? `${sym}${lc.toFixed(dp)}` : "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-emerald-50/60 dark:bg-emerald-950/10 border-t-2 border-emerald-200 dark:border-emerald-800">
                                <td colSpan={3} className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground uppercase">Total RM Cost</td>
                                <td className="px-3 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400">{sym}{vRMCost.toFixed(dp)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* Waste */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={15} className="text-amber-600" />
                          <h2 className="text-[13px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Waste / Loss</h2>
                        </div>
                        {(!viewOrder.wasteQty || viewOrder.wasteQty === "0" || viewOrder.wasteQty === "") ? (
                          <p className="text-[13px] text-muted-foreground italic px-1">No waste recorded for this order.</p>
                        ) : (
                          <div className="rounded-xl border p-4 bg-amber-50/60 dark:bg-amber-950/10 space-y-3">
                            <div className="flex gap-4">
                              <div className="bg-white dark:bg-card rounded-lg border px-4 py-3 flex-1">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Waste Qty</div>
                                <div className="text-xl font-bold text-amber-600">{viewOrder.wasteQty} <span className="text-base font-medium">{viewOrder.wasteUnit}</span></div>
                              </div>
                            </div>
                            {viewOrder.wasteNotes && (
                              <div className="text-[13px] text-muted-foreground bg-white dark:bg-card rounded-lg border p-3">{viewOrder.wasteNotes}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT: Outputs + Cost Breakdown */}
                    <div className="p-6 flex flex-col gap-6">

                      {/* Products Produced */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <Package size={15} className="text-orange-600" />
                          <h2 className="text-[13px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-400">Products Produced</h2>
                          <span className="ml-auto text-[11px] text-muted-foreground">{(viewOrder.outputs||[]).length} output(s)</span>
                        </div>
                        <div className="rounded-xl border overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="bg-orange-50 dark:bg-orange-950/20 border-b">
                                {["Product", "Qty", "Unit", "Est. Cost", "Cost/Unit"].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(viewOrder.outputs || []).map((out, i) => {
                                const qty = parseFloat(out.qty) || 0;
                                const share = vOutQty > 0 ? qty / vOutQty : 0;
                                const estCost = vTotal * share;
                                const unitCost = qty > 0 ? estCost / qty : 0;
                                return (
                                  <tr key={out.id} className={`border-b last:border-0 ${i % 2 !== 0 ? "bg-muted/20" : ""}`}>
                                    <td className="px-3 py-2.5 font-medium">{out.productName || "—"}</td>
                                    <td className="px-3 py-2.5 font-semibold text-orange-700 dark:text-orange-400">{out.qty}</td>
                                    <td className="px-3 py-2.5 text-muted-foreground">{out.unit || "—"}</td>
                                    <td className="px-3 py-2.5 text-right">{estCost > 0 ? `${sym}${estCost.toFixed(dp)}` : "—"}</td>
                                    <td className="px-3 py-2.5 text-right font-bold text-orange-700 dark:text-orange-400">{unitCost > 0 ? `${sym}${unitCost.toFixed(3)}` : "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-orange-50/60 dark:bg-orange-950/10 border-t-2 border-orange-200 dark:border-orange-800">
                                <td colSpan={3} className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground uppercase">Grand Total</td>
                                <td className="px-3 py-2.5 text-right font-bold text-orange-600">{sym}{vTotal.toFixed(dp)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-orange-600">{vOutQty > 0 ? `${sym}${(vTotal/vOutQty).toFixed(3)}/unit` : "—"}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        {viewOrder.status === "Completed" && (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-[12px] text-emerald-700 dark:text-emerald-400 font-medium">
                            <CheckCircle2 size={13} /> All products have been added to stock.
                          </div>
                        )}
                      </div>

                      {/* Production Costs + Full Breakdown */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-600"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                          <h2 className="text-[13px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-400">Production Costs</h2>
                          <span className="ml-auto text-[11px] text-muted-foreground">{(viewOrder.productionCosts||[]).length} item(s)</span>
                        </div>
                        {(viewOrder.productionCosts || []).length > 0 ? (
                          <div className="rounded-xl border overflow-hidden">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="bg-violet-50 dark:bg-violet-950/20 border-b">
                                  {["Description", "Amount"].map(h => (
                                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(viewOrder.productionCosts || []).map((c, i) => (
                                  <tr key={c.id} className={`border-b last:border-0 ${i % 2 !== 0 ? "bg-muted/20" : ""}`}>
                                    <td className="px-3 py-2.5">{c.description}</td>
                                    <td className="px-3 py-2.5 text-right font-semibold text-violet-700 dark:text-violet-400">{sym}{parseFloat(c.amount || "0").toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-violet-50/60 dark:bg-violet-950/10 border-t-2 border-violet-200 dark:border-violet-800">
                                  <td className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground uppercase">Total</td>
                                  <td className="px-3 py-2.5 text-right font-bold text-violet-700 dark:text-violet-400">{sym}{vProdCost.toFixed(dp)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ) : (
                          <p className="text-[13px] text-muted-foreground italic px-1">No additional production costs recorded.</p>
                        )}

                        {/* Full cost breakdown card */}
                        <div className="rounded-xl border p-4 space-y-2.5 bg-muted/20">
                          <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Full Cost Breakdown</h4>
                          <div className="space-y-2">
                            {[
                              { label: "Raw Materials", val: vRMCost,   c: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
                              { label: "Production",    val: vProdCost, c: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950/20"  },
                            ].map(r => (
                              <div key={r.label} className={`flex justify-between items-center rounded-lg px-3 py-2 ${r.bg}`}>
                                <span className="text-[13px] text-muted-foreground">{r.label}</span>
                                <span className={`text-[13px] font-bold ${r.c}`}>{sym}{r.val.toFixed(dp)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between items-center rounded-lg px-3 py-2.5 bg-orange-100 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                              <span className="text-[14px] font-bold">Total Cost</span>
                              <span className="text-[15px] font-bold text-orange-600">{sym}{vTotal.toFixed(dp)}</span>
                            </div>
                            {vOutQty > 0 && vTotal > 0 && (
                              <div className="flex justify-between items-center px-3 py-1.5">
                                <span className="text-[12px] text-muted-foreground">Avg. Cost / Unit</span>
                                <span className="text-[13px] font-bold text-orange-600">{sym}{(vTotal / vOutQty).toFixed(3)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ════ Save as Recipe dialog ══════════════════════════════════════════════ */}
      <AlertDialog open={saveRecipeOpen} onOpenChange={o => { if (!o) setSaveRecipeOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <BookMarked size={16} className="text-violet-600" /> Save as Recipe
            </AlertDialogTitle>
            <AlertDialogDescription>
              Give this combination of inputs, outputs, and costs a name so you can reuse it as a template for future orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-0 py-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Recipe Name</Label>
            <Input
              autoFocus
              value={recipeName}
              onChange={e => setRecipeName(e.target.value)}
              placeholder="e.g. Standard Batch, Product A Formula…"
              className="text-[13px]"
              onKeyDown={e => {
                if (e.key === "Enter" && recipeName.trim()) {
                  addRecipe({
                    name: recipeName.trim(),
                    inputs: form.inputs.filter(i => i.rmName.trim()),
                    outputs: [
                      form.mainOutput,
                      ...form.byProducts.filter(o => o.productName.trim()),
                    ],
                    productionCosts: form.productionCosts.filter(c => c.description.trim()),
                    notes: form.notes,
                  });
                  toast({ title: `Recipe "${recipeName.trim()}" saved` });
                  setSaveRecipeOpen(false);
                }
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={!recipeName.trim()}
              onClick={() => {
                if (!recipeName.trim()) return;
                addRecipe({
                  name: recipeName.trim(),
                  inputs: form.inputs.filter(i => i.rmName.trim()),
                  outputs: [
                    form.mainOutput,
                    ...form.byProducts.filter(o => o.productName.trim()),
                  ],
                  productionCosts: form.productionCosts.filter(c => c.description.trim()),
                  notes: form.notes,
                });
                toast({ title: `Recipe "${recipeName.trim()}" saved` });
                setSaveRecipeOpen(false);
              }}>
              Save Recipe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════ Delete Recipe confirm ══════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteRecipeId} onOpenChange={o => { if (!o) setDeleteRecipeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              This recipe template will be permanently deleted. Existing manufacturing orders are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => {
                if (deleteRecipeId) {
                  removeRecipe(deleteRecipeId);
                  setDeleteRecipeId(null);
                  toast({ title: "Recipe deleted" });
                }
              }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Manufacturing Order?</AlertDialogTitle>
            <AlertDialogDescription>Only Draft or Cancelled orders can be deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => { if (deleteId) { remove(deleteId); setDeleteId(null); toast({ title: "Order deleted" }); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
