import { useState, useMemo } from "react";
import {
  getProducts, getStock, getProductCategories, getBrands,
  getProductDepartments, getSettings, getProductStockQty,
  type Product, type ProductVariant, type StockItem,
} from "@/lib/store";
import { fmtMoney, getSettingsCurrencySymbol } from "@/lib/currencies";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Package, Search, Download, FileText, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, Layers, Tag, BarChart3, Boxes,
  TrendingUp, X, Filter, Loader2,
} from "lucide-react";
import {
  Document, Page as PdfPage, Text as PdfText, View as PdfView,
  StyleSheet as PdfStyleSheet, pdf as pdfRender,
} from "@react-pdf/renderer";

// ─── helpers ──────────────────────────────────────────────────────────────────

function variantLabel(v: ProductVariant): string {
  const attrs = Object.entries(v.attributes ?? {})
    .filter(([, val]) => Boolean(val))
    .map(([key, val]) => `${key}: ${val}`);
  return attrs.length ? attrs.join(" · ") : (v.sku ?? "Variant");
}

function stockForSku(sku: string, allStock: StockItem[]): number {
  if (!sku?.trim()) return 0;
  const key = sku.trim().toLowerCase();
  return allStock
    .filter(s => s.sku?.trim().toLowerCase() === key)
    .reduce((sum, s) => sum + Math.max(0, parseFloat(s.quantity) || 0), 0);
}

function stockBadge(qty: number, min: number) {
  if (qty === 0)        return { label: "Out of Stock", cls: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300" };
  if (min > 0 && qty <= min) return { label: "Low Stock",    cls: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" };
  return                       { label: "In Stock",      cls: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300" };
}

function statusBadge(status: string) {
  if (status === "Active")   return "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300";
  if (status === "Inactive") return "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400";
  return "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300";
}

const fmtQty = (n: number, unit?: string) =>
  `${n % 1 === 0 ? n : n.toFixed(2)}${unit ? " " + unit : ""}`;

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(rows: CsvRow[]) {
  const headers = [
    "Category","Subcategory","Product Name","SKU","Barcode","Brand","Department",
    "Unit","Sale Price","Purchase Price","Cost Price","Stock Qty","Min Level",
    "Stock Status","Product Status","Variant Attrs","Variant SKU","Variant Price",
    "Variant Stock",
  ];
  const escape = (v: string | number | undefined) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map(r => [
      r.category, r.subcategory, r.name, r.sku, r.barcode, r.brand, r.department,
      r.unit, r.price, r.purchasePrice, r.costPrice, r.stockQty, r.minLevel,
      r.stockStatus, r.productStatus, r.variantAttrs, r.variantSku, r.variantPrice,
      r.variantStock,
    ].map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "product-stock-report.csv"; a.click();
  URL.revokeObjectURL(url);
}

type CsvRow = {
  category: string; subcategory: string; name: string; sku: string; barcode: string;
  brand: string; department: string; unit: string; price: string; purchasePrice: string;
  costPrice: string; stockQty: number; minLevel: number; stockStatus: string;
  productStatus: string; variantAttrs: string; variantSku: string; variantPrice: string;
  variantStock: number;
};

// ─── PDF document ──────────────────────────────────────────────────────────────

const PC = {
  blue:    "#3B82F6", indigo:  "#6366F1", violet:  "#8B5CF6",
  emerald: "#10B981", amber:   "#F59E0B", red:     "#EF4444",
  teal:    "#14B8A6", gray:    "#6B7280", border:  "#E5E7EB",
  text:    "#111827", muted:   "#6B7280", bg:      "#F9FAFB",
  white:   "#FFFFFF",
};

const COL = {
  num: 22, product: 148, category: 92, brand: 80,
  salePrice: 54, buyPrice: 54, stockQty: 50, minLevel: 42,
  variants: 38, stockSt: 64, productSt: 52,
};

const PS = PdfStyleSheet.create({
  page:        { fontFamily: "Helvetica", fontSize: 7.5, backgroundColor: PC.white, paddingTop: 28, paddingBottom: 36, paddingHorizontal: 28 },
  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: PC.blue },
  hTitle:      { fontSize: 15, fontFamily: "Helvetica-Bold", color: PC.text },
  hSub:        { fontSize: 7.5, color: PC.muted, marginTop: 2 },
  hMeta:       { fontSize: 6.5, color: PC.muted, textAlign: "right" },
  kpiRow:      { flexDirection: "row", marginBottom: 12 },
  kpiBox:      { flex: 1, borderRadius: 4, padding: 6, borderWidth: 1, borderColor: PC.border, backgroundColor: PC.bg, marginRight: 4 },
  kpiVal:      { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  kpiLbl:      { fontSize: 6, color: PC.muted, textTransform: "uppercase" },
  kpiSub:      { fontSize: 5.5, color: "#9CA3AF", marginTop: 1 },
  catHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F1F5F9", paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: PC.border, borderLeftWidth: 3, borderLeftColor: PC.indigo },
  catTitle:    { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: PC.text },
  catBadge:    { backgroundColor: "#EEF2FF", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1.5 },
  catBadgeTxt: { fontSize: 6, color: "#4F46E5", fontFamily: "Helvetica-Bold" },
  catMeta:     { fontSize: 6.5, color: PC.muted },
  tHead:       { flexDirection: "row", backgroundColor: "#F3F4F6", borderBottomWidth: 1, borderBottomColor: "#D1D5DB", paddingVertical: 4 },
  tRow:        { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: PC.border, minHeight: 20, alignItems: "center" },
  tRowAlt:     { backgroundColor: "#FAFAFA" },
  tRowVar:     { backgroundColor: "#EFF6FF" },
  tFoot:       { flexDirection: "row", backgroundColor: "#F3F4F6", borderTopWidth: 1, borderTopColor: "#D1D5DB", paddingVertical: 4 },
  th:          { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#4B5563", textTransform: "uppercase" },
  td:          { fontSize: 7.5, color: PC.text },
  tdB:         { fontSize: 7.5, color: PC.text, fontFamily: "Helvetica-Bold" },
  tdM:         { fontSize: 6.5, color: PC.muted },
  badge:       { borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1.5 },
  footer:      { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: "#D1D5DB", paddingTop: 4 },
  footTxt:     { fontSize: 6, color: "#9CA3AF" },
  grand:       { flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 5, padding: 10, marginTop: 10, borderWidth: 1, borderColor: PC.border },
  grandItem:   { flex: 1 },
  grandLbl:    { fontSize: 6, color: PC.muted, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  grandVal:    { fontSize: 12, fontFamily: "Helvetica-Bold", color: PC.text, marginTop: 2 },
});

type KpiData = { total: number; totalVariants: number; lowStock: number; outOfStock: number; inStock: number; uniqueCats: number; stockValue: number };

function pdfStockBadge(label: string): { bg: string; color: string } {
  if (label === "Out of Stock") return { bg: "#FEE2E2", color: "#DC2626" };
  if (label === "Low Stock")    return { bg: "#FEF3C7", color: "#D97706" };
  return                               { bg: "#D1FAE5", color: "#059669" };
}
function pdfStatusBadge(status: string): { bg: string; color: string } {
  if (status === "Active")   return { bg: "#D1FAE5", color: "#059669" };
  if (status === "Inactive") return { bg: "#F3F4F6", color: "#6B7280" };
  return                            { bg: "#FEF3C7", color: "#D97706" };
}

function StockReportPDFDoc({
  data, kpi, sym, grouped,
}: {
  data: EnrichedProduct[];
  kpi: KpiData;
  sym: string;
  grouped: [string, EnrichedProduct[]][];
}) {
  const ts = new Date().toLocaleString();
  const fmtV = (n: number) =>
    n >= 1_000_000 ? sym + (n / 1_000_000).toFixed(2) + "M"
    : n >= 1000    ? sym + (n / 1000).toFixed(2) + "K"
    : sym + n.toFixed(2);

  const totalStock    = data.reduce((s, e) => s + e.totalStock, 0);
  const totalVariants = data.reduce((s, e) => s + (e.product.variants?.length ?? 0), 0);

  const kpiItems = [
    { label: "Products",     value: String(kpi.total),        color: PC.blue    },
    { label: "Variants",     value: String(kpi.totalVariants),color: PC.indigo  },
    { label: "Categories",   value: String(kpi.uniqueCats),   color: PC.violet  },
    { label: "In Stock",     value: String(kpi.inStock),      color: PC.emerald },
    { label: "Low Stock",    value: String(kpi.lowStock),     color: PC.amber   },
    { label: "Out of Stock", value: String(kpi.outOfStock),   color: PC.red     },
    { label: "Stock Value",  value: fmtV(kpi.stockValue), sub: "est. at purchase price", color: PC.teal },
  ];

  return (
    <Document title="Product Stock Report" author="Onesoft ERP">
      <PdfPage size="A4" orientation="landscape" style={PS.page}>

        {/* ── Header (repeats every page) ────────────────────────────────── */}
        <PdfView style={PS.header} fixed>
          <PdfView>
            <PdfText style={PS.hTitle}>Product Stock Report</PdfText>
            <PdfText style={PS.hSub}>Products, variants, categorisation and live stock summary</PdfText>
          </PdfView>
          <PdfView>
            <PdfText style={PS.hMeta}>Generated: {ts}</PdfText>
            <PdfText style={[PS.hMeta, { marginTop: 1 }]}>{data.length} product{data.length !== 1 ? "s" : ""} shown</PdfText>
          </PdfView>
        </PdfView>

        {/* ── KPI summary ────────────────────────────────────────────────── */}
        <PdfView style={PS.kpiRow}>
          {kpiItems.map(k => (
            <PdfView key={k.label} style={[PS.kpiBox, { borderTopWidth: 2.5, borderTopColor: k.color }]}>
              <PdfText style={[PS.kpiVal, { color: k.color }]}>{k.value}</PdfText>
              <PdfText style={PS.kpiLbl}>{k.label}</PdfText>
              {k.sub && <PdfText style={PS.kpiSub}>{k.sub}</PdfText>}
            </PdfView>
          ))}
        </PdfView>

        {/* ── Products grouped by category ───────────────────────────────── */}
        {grouped.map(([cat, items]) => {
          const catStock = items.reduce((s, e) => s + e.totalStock, 0);
          const catLow   = items.filter(e => e.minLevel > 0 && e.totalStock > 0 && e.totalStock <= e.minLevel).length;
          const catOut   = items.filter(e => e.totalStock === 0).length;
          const catVal   = items.reduce((s, e) => {
            if ((e.product.variants?.length ?? 0) > 0)
              return s + e.variantStocks.reduce((vs, vs2) => vs + vs2.qty * (parseFloat(vs2.variant.purchasePrice || vs2.variant.price || "0") || 0), 0);
            return s + e.totalStock * (parseFloat(e.product.purchasePrice || e.product.costPrice || e.product.price || "0") || 0);
          }, 0);
          const catVars = items.reduce((s, e) => s + (e.product.variants?.length ?? 0), 0);
          const colSpanLeft = COL.num + COL.product + COL.category + COL.brand + COL.salePrice + COL.buyPrice;

          return (
            <PdfView key={cat} style={{ marginBottom: 10 }}>

              {/* Cat header + table header kept together */}
              <PdfView wrap={false}>
                <PdfView style={PS.catHeader}>
                  <PdfView style={{ flexDirection: "row", alignItems: "center" }}>
                    <PdfText style={[PS.catTitle, { marginRight: 6 }]}>{cat}</PdfText>
                    <PdfView style={PS.catBadge}>
                      <PdfText style={PS.catBadgeTxt}>{items.length} product{items.length !== 1 ? "s" : ""}</PdfText>
                    </PdfView>
                  </PdfView>
                  <PdfView style={{ flexDirection: "row", alignItems: "center" }}>
                    <PdfText style={[PS.catMeta, { marginRight: 10 }]}>Stock: {catStock.toLocaleString()}</PdfText>
                    {catLow > 0 && <PdfText style={[PS.catMeta, { color: PC.amber, fontFamily: "Helvetica-Bold", marginRight: 8 }]}>{catLow} low</PdfText>}
                    {catOut > 0 && <PdfText style={[PS.catMeta, { color: PC.red,   fontFamily: "Helvetica-Bold", marginRight: 8 }]}>{catOut} out</PdfText>}
                    <PdfText style={[PS.catMeta, { color: PC.teal }]}>Est. {catVal >= 1000 ? sym + (catVal / 1000).toFixed(1) + "K" : sym + catVal.toFixed(2)}</PdfText>
                  </PdfView>
                </PdfView>

                {/* Table header */}
                <PdfView style={PS.tHead}>
                  {[
                    { label: "#",            w: COL.num,       align: "center" },
                    { label: "Product / SKU",w: COL.product,   align: "left"   },
                    { label: "Category",     w: COL.category,  align: "left"   },
                    { label: "Brand / Dept", w: COL.brand,     align: "left"   },
                    { label: "Sale Price",   w: COL.salePrice, align: "right"  },
                    { label: "Buy Price",    w: COL.buyPrice,  align: "right"  },
                    { label: "Stock",        w: COL.stockQty,  align: "right"  },
                    { label: "Min",          w: COL.minLevel,  align: "right"  },
                    { label: "Var.",         w: COL.variants,  align: "center" },
                    { label: "Stock Status", w: COL.stockSt,   align: "left"   },
                    { label: "Status",       w: COL.productSt, align: "left"   },
                  ].map(col => (
                    <PdfView key={col.label} style={{ width: col.w, paddingHorizontal: 4 }}>
                      <PdfText style={[PS.th, { textAlign: col.align as "left" | "right" | "center" }]}>{col.label}</PdfText>
                    </PdfView>
                  ))}
                </PdfView>
              </PdfView>

              {/* Rows */}
              {items.map((ep, ri) => {
                const p   = ep.product;
                const bdg = stockBadge(ep.totalStock, ep.minLevel);
                const sb  = pdfStockBadge(bdg.label);
                const stb = pdfStatusBadge(p.status);
                const hasV = (p.variants?.length ?? 0) > 0;
                const rowStyle = ri % 2 === 1 ? [PS.tRow, PS.tRowAlt] : [PS.tRow];
                return (
                  <PdfView key={p.id}>
                    <PdfView style={rowStyle}>
                      <PdfView style={{ width: COL.num, paddingHorizontal: 4, alignItems: "center" }}>
                        <PdfText style={PS.tdM}>{ri + 1}</PdfText>
                      </PdfView>
                      <PdfView style={{ width: COL.product, paddingHorizontal: 4 }}>
                        <PdfText style={PS.tdB}>{p.name.length > 28 ? p.name.slice(0, 27) + "…" : p.name}</PdfText>
                        {p.sku   && <PdfText style={PS.tdM}>{p.sku}</PdfText>}
                        {p.barcode && <PdfText style={PS.tdM}>BC: {p.barcode}</PdfText>}
                      </PdfView>
                      <PdfView style={{ width: COL.category, paddingHorizontal: 4 }}>
                        <PdfText style={PS.td}>{(p.category || "—").slice(0, 18)}</PdfText>
                        {p.subcategory && <PdfText style={PS.tdM}>{p.subcategory.slice(0, 18)}</PdfText>}
                      </PdfView>
                      <PdfView style={{ width: COL.brand, paddingHorizontal: 4 }}>
                        <PdfText style={PS.td}>{(p.brand || "—").slice(0, 14)}</PdfText>
                        {p.department && <PdfText style={PS.tdM}>{p.department.slice(0, 14)}</PdfText>}
                      </PdfView>
                      <PdfView style={{ width: COL.salePrice, paddingHorizontal: 4, alignItems: "flex-end" }}>
                        <PdfText style={PS.tdB}>{sym}{parseFloat(p.price || "0").toFixed(2)}</PdfText>
                      </PdfView>
                      <PdfView style={{ width: COL.buyPrice, paddingHorizontal: 4, alignItems: "flex-end" }}>
                        <PdfText style={PS.td}>{p.purchasePrice ? sym + parseFloat(p.purchasePrice).toFixed(2) : "—"}</PdfText>
                      </PdfView>
                      <PdfView style={{ width: COL.stockQty, paddingHorizontal: 4, alignItems: "flex-end" }}>
                        <PdfText style={PS.tdB}>{fmtQty(ep.totalStock, p.unit)}</PdfText>
                      </PdfView>
                      <PdfView style={{ width: COL.minLevel, paddingHorizontal: 4, alignItems: "flex-end" }}>
                        <PdfText style={PS.tdM}>{ep.minLevel > 0 ? fmtQty(ep.minLevel) : "—"}</PdfText>
                      </PdfView>
                      <PdfView style={{ width: COL.variants, paddingHorizontal: 4, alignItems: "center" }}>
                        <PdfText style={hasV ? { fontSize: 7.5, color: PC.blue, fontFamily: "Helvetica-Bold" } : PS.tdM}>
                          {hasV ? String(p.variants!.length) : "—"}
                        </PdfText>
                      </PdfView>
                      <PdfView style={{ width: COL.stockSt, paddingHorizontal: 4 }}>
                        <PdfView style={[PS.badge, { backgroundColor: sb.bg }]}>
                          <PdfText style={{ fontSize: 6.5, color: sb.color }}>{bdg.label}</PdfText>
                        </PdfView>
                      </PdfView>
                      <PdfView style={{ width: COL.productSt, paddingHorizontal: 4 }}>
                        <PdfView style={[PS.badge, { backgroundColor: stb.bg }]}>
                          <PdfText style={{ fontSize: 6.5, color: stb.color }}>{p.status}</PdfText>
                        </PdfView>
                      </PdfView>
                    </PdfView>

                    {/* Variant rows */}
                    {hasV && ep.variantStocks.map(({ variant: v, qty }) => {
                      const vb  = pdfStockBadge(stockBadge(qty, 0).label);
                      const vsb = pdfStatusBadge(v.status || p.status);
                      return (
                        <PdfView key={v.id} style={[PS.tRow, PS.tRowVar]}>
                          <PdfView style={{ width: COL.num, paddingHorizontal: 4 }} />
                          <PdfView style={{ width: COL.product, paddingHorizontal: 4, paddingLeft: 16 }}>
                            <PdfText style={{ fontSize: 7, color: "#1D4ED8" }}>↳ {(v.sku ? `SKU: ${v.sku}` : variantLabel(v)).slice(0, 26)}</PdfText>
                            {v.sku && <PdfText style={{ fontSize: 6, color: "#3B82F6" }}>{variantLabel(v).slice(0, 26)}</PdfText>}
                          </PdfView>
                          <PdfView style={{ width: COL.category, paddingHorizontal: 4 }}>
                            <PdfText style={PS.tdM}>—</PdfText>
                          </PdfView>
                          <PdfView style={{ width: COL.brand, paddingHorizontal: 4 }}>
                            <PdfText style={PS.tdM}>{(v.brand || p.brand || "—").slice(0, 14)}</PdfText>
                          </PdfView>
                          <PdfView style={{ width: COL.salePrice, paddingHorizontal: 4, alignItems: "flex-end" }}>
                            <PdfText style={PS.td}>{sym}{parseFloat(v.price || "0").toFixed(2)}</PdfText>
                          </PdfView>
                          <PdfView style={{ width: COL.buyPrice, paddingHorizontal: 4, alignItems: "flex-end" }}>
                            <PdfText style={PS.td}>{v.purchasePrice ? sym + parseFloat(v.purchasePrice).toFixed(2) : "—"}</PdfText>
                          </PdfView>
                          <PdfView style={{ width: COL.stockQty, paddingHorizontal: 4, alignItems: "flex-end" }}>
                            <PdfText style={PS.tdB}>{fmtQty(qty, v.unit || p.unit)}</PdfText>
                          </PdfView>
                          <PdfView style={{ width: COL.minLevel, paddingHorizontal: 4, alignItems: "flex-end" }}>
                            <PdfText style={PS.tdM}>—</PdfText>
                          </PdfView>
                          <PdfView style={{ width: COL.variants, paddingHorizontal: 4 }} />
                          <PdfView style={{ width: COL.stockSt, paddingHorizontal: 4 }}>
                            <PdfView style={[PS.badge, { backgroundColor: vb.bg }]}>
                              <PdfText style={{ fontSize: 6.5, color: vb.color }}>{stockBadge(qty, 0).label}</PdfText>
                            </PdfView>
                          </PdfView>
                          <PdfView style={{ width: COL.productSt, paddingHorizontal: 4 }}>
                            <PdfView style={[PS.badge, { backgroundColor: vsb.bg }]}>
                              <PdfText style={{ fontSize: 6.5, color: vsb.color }}>{v.status || p.status}</PdfText>
                            </PdfView>
                          </PdfView>
                        </PdfView>
                      );
                    })}
                  </PdfView>
                );
              })}

              {/* Category subtotal row */}
              <PdfView style={PS.tFoot}>
                <PdfView style={{ width: colSpanLeft, paddingHorizontal: 4, alignItems: "flex-end" }}>
                  <PdfText style={PS.th}>Category totals →</PdfText>
                </PdfView>
                <PdfView style={{ width: COL.stockQty, paddingHorizontal: 4, alignItems: "flex-end" }}>
                  <PdfText style={[PS.th, { color: PC.text }]}>{catStock.toLocaleString()}</PdfText>
                </PdfView>
                <PdfView style={{ width: COL.minLevel, paddingHorizontal: 4 }} />
                <PdfView style={{ width: COL.variants, paddingHorizontal: 4, alignItems: "center" }}>
                  <PdfText style={[PS.th, { color: PC.blue }]}>{catVars > 0 ? String(catVars) : "—"}</PdfText>
                </PdfView>
                <PdfView style={{ width: COL.stockSt + COL.productSt, paddingHorizontal: 4 }}>
                  <PdfText style={[PS.th, { color: PC.teal }]}>
                    Est. {catVal >= 1000 ? sym + (catVal / 1000).toFixed(1) + "K" : sym + catVal.toFixed(2)}
                  </PdfText>
                </PdfView>
              </PdfView>
            </PdfView>
          );
        })}

        {/* ── Grand total ────────────────────────────────────────────────── */}
        <PdfView style={PS.grand}>
          {[
            { label: "Total Products",     value: String(data.length),    color: PC.blue    },
            { label: "Total Variants",     value: String(totalVariants),  color: PC.indigo  },
            { label: "Total Stock Units",  value: totalStock.toLocaleString(), color: PC.text },
            { label: "Est. Stock Value",   value: fmtV(kpi.stockValue),   color: PC.teal    },
            { label: "Low Stock Items",    value: String(kpi.lowStock),   color: PC.amber   },
            { label: "Out of Stock Items", value: String(kpi.outOfStock), color: PC.red     },
          ].map(item => (
            <PdfView key={item.label} style={PS.grandItem}>
              <PdfText style={PS.grandLbl}>{item.label}</PdfText>
              <PdfText style={[PS.grandVal, { color: item.color }]}>{item.value}</PdfText>
            </PdfView>
          ))}
        </PdfView>

        {/* ── Footer (repeats every page) ────────────────────────────────── */}
        <PdfView style={PS.footer} fixed>
          <PdfText style={PS.footTxt}>Onesoft ERP · Product Stock Report · {ts}</PdfText>
          <PdfText style={PS.footTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </PdfView>

      </PdfPage>
    </Document>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string;
  accent: {
    bar: string;       // top accent bar colour
    iconBg: string;    // icon container bg
    iconColor: string; // icon colour class
    valueCls: string;  // value text colour
  };
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-white dark:bg-card shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col">
      {/* coloured top accent bar */}
      <div className={`h-1 w-full ${accent.bar}`} />
      <div className="flex flex-col gap-3 px-4 pt-3 pb-4 flex-1">
        {/* icon */}
        <div className={`w-9 h-9 rounded-xl ${accent.iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={16} className={accent.iconColor} />
        </div>
        {/* value */}
        <div className="min-w-0">
          <p className={`text-[26px] font-black tabular-nums leading-none tracking-tight ${accent.valueCls}`}>{value}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

type EnrichedProduct = {
  product: Product;
  totalStock: number;
  minLevel: number;
  variantStocks: { variant: ProductVariant; qty: number }[];
};

function ProductRow({
  ep, sym, expanded, onToggle,
}: {
  ep: EnrichedProduct; sym: string; expanded: boolean; onToggle: () => void;
}) {
  const { product: p, totalStock, minLevel, variantStocks } = ep;
  const hasVariants = (p.variants?.length ?? 0) > 0;
  const badge = stockBadge(totalStock, minLevel);

  return (
    <>
      {/* ── Product row ── */}
      <tr
        className={`border-b border-border hover:bg-muted/30 transition-colors ${hasVariants ? "cursor-pointer" : ""}`}
        onClick={hasVariants ? onToggle : undefined}
      >
        {/* Expand toggle */}
        <td className="w-8 px-2 py-2.5 text-center">
          {hasVariants ? (
            <span className="text-muted-foreground">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : null}
        </td>
        {/* Name + SKU */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {p.thumbnail ? (
              <img src={p.thumbnail} alt={p.name} className="w-8 h-8 rounded object-cover shrink-0 border border-border" />
            ) : (
              <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                <Package size={13} className="text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate max-w-[200px]">{p.name}</p>
              {p.localName && <p className="text-[11px] text-muted-foreground truncate">{p.localName}</p>}
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{p.sku || "—"}</p>
            </div>
          </div>
        </td>
        {/* Category / Sub */}
        <td className="px-3 py-2.5 text-[12px] text-foreground">
          <span className="font-medium">{p.category || "—"}</span>
          {p.subcategory && <span className="text-muted-foreground"> / {p.subcategory}</span>}
          {p.subSubcategory && <span className="text-muted-foreground"> / {p.subSubcategory}</span>}
        </td>
        {/* Brand / Dept */}
        <td className="px-3 py-2.5 text-[12px] text-foreground">
          {p.brand || "—"}
          {p.department && <span className="block text-[10px] text-muted-foreground">{p.department}</span>}
        </td>
        {/* Prices */}
        <td className="px-3 py-2.5 text-right text-[12px]">
          <span className="font-semibold text-foreground">{sym}{parseFloat(p.price || "0").toFixed(2)}</span>
          {p.purchasePrice && (
            <span className="block text-[10px] text-muted-foreground">Buy: {sym}{parseFloat(p.purchasePrice).toFixed(2)}</span>
          )}
        </td>
        {/* Stock qty */}
        <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums text-foreground">
          {hasVariants ? (
            <span>{fmtQty(totalStock, p.unit)}</span>
          ) : (
            <span>{fmtQty(totalStock, p.unit)}</span>
          )}
          {minLevel > 0 && (
            <span className="block text-[10px] font-normal text-muted-foreground">min: {fmtQty(minLevel)}</span>
          )}
        </td>
        {/* Variants count */}
        <td className="px-3 py-2.5 text-center text-[12px] text-muted-foreground">
          {hasVariants ? (
            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
              <Layers size={11} />{p.variants!.length}
            </span>
          ) : "—"}
        </td>
        {/* Stock badge */}
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.label}
          </span>
        </td>
        {/* Status */}
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge(p.status)}`}>
            {p.status}
          </span>
        </td>
      </tr>

      {/* ── Variant rows (expanded) ── */}
      {expanded && hasVariants && variantStocks.map(({ variant: v, qty }) => {
        const vMin = parseFloat(v.stock || "0") || 0; // use variant stock field as min guide — 0 = no separate min
        const vBadge = stockBadge(qty, 0);
        return (
          <tr key={v.id} className="border-b border-border/50 bg-muted/20 dark:bg-muted/10">
            <td className="px-2" />
            <td className="px-3 py-2 pl-14">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-foreground">{variantLabel(v)}</p>
                {v.sku && <p className="text-[10px] text-muted-foreground font-mono">{v.sku}</p>}
                {v.barcode && <p className="text-[10px] text-muted-foreground">Barcode: {v.barcode}</p>}
              </div>
            </td>
            <td className="px-3 py-2 text-[11px] text-muted-foreground italic">
              {v.category || p.category || "—"}
            </td>
            <td className="px-3 py-2 text-[11px] text-muted-foreground">
              {v.brand || p.brand || "—"}
            </td>
            <td className="px-3 py-2 text-right text-[12px]">
              <span className="font-semibold text-foreground">{sym}{parseFloat(v.price || "0").toFixed(2)}</span>
              {v.purchasePrice && (
                <span className="block text-[10px] text-muted-foreground">Buy: {sym}{parseFloat(v.purchasePrice).toFixed(2)}</span>
              )}
            </td>
            <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-foreground">
              {fmtQty(qty, v.unit || p.unit)}
            </td>
            <td className="px-3 py-2 text-center text-[11px] text-muted-foreground">—</td>
            <td className="px-3 py-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${vBadge.cls}`}>
                {vBadge.label}
              </span>
            </td>
            <td className="px-3 py-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge(v.status || p.status)}`}>
                {v.status || p.status}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function ProductStockReportPage() {
  const [search,       setSearch]       = useState("");
  const [filterCat,    setFilterCat]    = useState("all");
  const [filterBrand,  setFilterBrand]  = useState("all");
  const [filterDept,   setFilterDept]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStock,  setFilterStock]  = useState("all"); // all | low | out | ok
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());

  // ── raw data (read once) ─────────────────────────────────────────────────
  const allProducts   = useMemo(() => getProducts(), []);
  const allStock      = useMemo(() => getStock(), []);
  const allCategories = useMemo(() => getProductCategories(), []);
  const allBrands     = useMemo(() => getBrands().map(b => b.name), []);
  const allDepts      = useMemo(() => getProductDepartments().map(d => d.name), []);
  const sym           = useMemo(() => getSettingsCurrencySymbol(), []);

  // ── enrich products with stock ───────────────────────────────────────────
  const enriched: EnrichedProduct[] = useMemo(() => {
    return allProducts.map(p => {
      const hasVariants = (p.variants?.length ?? 0) > 0;
      if (hasVariants) {
        const variantStocks = (p.variants ?? []).map(v => ({
          variant: v,
          qty: stockForSku(v.sku ?? "", allStock),
        }));
        const totalStock = variantStocks.reduce((s, vs) => s + vs.qty, 0);
        // Lowest min-level among variants (or product's own alert value)
        const minLevel = parseFloat(p.stockAlertValue || "0") || 0;
        return { product: p, totalStock, minLevel, variantStocks };
      } else {
        const totalStock = stockForSku(p.sku, allStock);
        const minLevel   = parseFloat(p.stockAlertValue || "0") || 0;
        return { product: p, totalStock, minLevel, variantStocks: [] };
      }
    });
  }, [allProducts, allStock]);

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalVariants  = enriched.reduce((s, e) => s + (e.product.variants?.length ?? 0), 0);
    const lowStock       = enriched.filter(e => e.minLevel > 0 && e.totalStock > 0 && e.totalStock <= e.minLevel).length;
    const outOfStock     = enriched.filter(e => e.totalStock === 0).length;
    const inStock        = enriched.filter(e => e.totalStock > 0 && !(e.minLevel > 0 && e.totalStock <= e.minLevel)).length;
    const uniqueCats     = new Set(enriched.map(e => e.product.category).filter(Boolean)).size;
    const stockValue     = enriched.reduce((s, e) => {
      if ((e.product.variants?.length ?? 0) > 0) {
        return s + e.variantStocks.reduce((vs, vstock) => {
          const vp = parseFloat(vstock.variant.purchasePrice || vstock.variant.price || "0") || 0;
          return vs + vstock.qty * vp;
        }, 0);
      }
      const cp = parseFloat(e.product.purchasePrice || e.product.costPrice || e.product.price || "0") || 0;
      return s + e.totalStock * cp;
    }, 0);
    return { total: enriched.length, totalVariants, lowStock, outOfStock, inStock, uniqueCats, stockValue };
  }, [enriched]);

  // ── filter & search ──────────────────────────────────────────────────────
  const filtered: EnrichedProduct[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(e => {
      const p = e.product;
      if (filterCat    !== "all" && p.category !== filterCat)    return false;
      if (filterBrand  !== "all" && p.brand    !== filterBrand)  return false;
      if (filterDept   !== "all" && p.department !== filterDept) return false;
      if (filterStatus !== "all" && p.status   !== filterStatus) return false;
      if (filterStock === "low") {
        if (!(e.minLevel > 0 && e.totalStock > 0 && e.totalStock <= e.minLevel)) return false;
      } else if (filterStock === "out") {
        if (e.totalStock !== 0) return false;
      } else if (filterStock === "ok") {
        if (e.totalStock === 0 || (e.minLevel > 0 && e.totalStock <= e.minLevel)) return false;
      }
      if (q) {
        const inName    = p.name.toLowerCase().includes(q);
        const inSku     = (p.sku || "").toLowerCase().includes(q);
        const inBarcode = (p.barcode || "").toLowerCase().includes(q);
        const inBrand   = (p.brand || "").toLowerCase().includes(q);
        const inCat     = (p.category || "").toLowerCase().includes(q);
        const inVariant = (p.variants ?? []).some(v =>
          (v.sku || "").toLowerCase().includes(q) ||
          Object.values(v.attributes ?? {}).some(a => a.toLowerCase().includes(q))
        );
        if (!inName && !inSku && !inBarcode && !inBrand && !inCat && !inVariant) return false;
      }
      return true;
    });
  }, [enriched, search, filterCat, filterBrand, filterDept, filterStatus, filterStock]);

  // ── group by category ────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedProduct[]>();
    for (const ep of filtered) {
      const cat = ep.product.category || "Uncategorised";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(ep);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // ── expand/collapse helpers ──────────────────────────────────────────────
  const toggleProduct = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll   = () => setExpanded(new Set(filtered.filter(e => e.product.variants?.length).map(e => e.product.id)));
  const collapseAll = () => setExpanded(new Set());

  // ── CSV export ───────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows: CsvRow[] = [];
    for (const ep of filtered) {
      const p = ep.product;
      // Parent row
      rows.push({
        category: p.category || "", subcategory: p.subcategory || "",
        name: p.name, sku: p.sku, barcode: p.barcode || "",
        brand: p.brand || "", department: p.department || "", unit: p.unit || "",
        price: p.price, purchasePrice: p.purchasePrice || "", costPrice: p.costPrice || "",
        stockQty: ep.totalStock, minLevel: ep.minLevel,
        stockStatus: stockBadge(ep.totalStock, ep.minLevel).label,
        productStatus: p.status,
        variantAttrs: "", variantSku: "", variantPrice: "", variantStock: 0,
      });
      // Variant rows
      for (const { variant: v, qty } of ep.variantStocks) {
        rows.push({
          category: p.category || "", subcategory: p.subcategory || "",
          name: p.name, sku: p.sku, barcode: p.barcode || "",
          brand: v.brand || p.brand || "", department: v.department || p.department || "",
          unit: v.unit || p.unit || "",
          price: p.price, purchasePrice: p.purchasePrice || "", costPrice: p.costPrice || "",
          stockQty: ep.totalStock, minLevel: ep.minLevel,
          stockStatus: stockBadge(ep.totalStock, ep.minLevel).label,
          productStatus: p.status,
          variantAttrs: variantLabel(v), variantSku: v.sku || "", variantPrice: v.price,
          variantStock: qty,
        });
      }
    }
    exportCSV(rows);
  };

  const [pdfLoading, setPdfLoading] = useState(false);
  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const blob = await pdfRender(
        <StockReportPDFDoc data={filtered} kpi={kpi} sym={sym} grouped={grouped} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `product-stock-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  };

  const hasFilters = search || filterCat !== "all" || filterBrand !== "all" || filterDept !== "all" || filterStatus !== "all" || filterStock !== "all";
  const clearFilters = () => {
    setSearch(""); setFilterCat("all"); setFilterBrand("all");
    setFilterDept("all"); setFilterStatus("all"); setFilterStock("all");
  };

  // ── unique filter options ────────────────────────────────────────────────
  const catOptions   = useMemo(() => [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort(), [allProducts]);
  const brandOptions = useMemo(() => allBrands.length ? allBrands : [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort(), [allBrands, allProducts]);
  const deptOptions  = useMemo(() => allDepts.length  ? allDepts  : [...new Set(allProducts.map(p => p.department).filter(Boolean))].sort(), [allDepts, allProducts]);

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
            <BarChart3 size={22} className="text-blue-500" /> Product Stock Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Products, variants, categorisation and live stock summary
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={pdfLoading} className="gap-1.5">
            {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            {pdfLoading ? "Generating…" : "Export PDF"}
          </Button>
        </div>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard
          icon={Package} label="Products" value={kpi.total}
          accent={{ bar: "bg-blue-500", iconBg: "bg-blue-50 dark:bg-blue-950/60", iconColor: "text-blue-600 dark:text-blue-400", valueCls: "text-blue-700 dark:text-blue-300" }}
        />
        <KpiCard
          icon={Layers} label="Variants" value={kpi.totalVariants}
          accent={{ bar: "bg-indigo-500", iconBg: "bg-indigo-50 dark:bg-indigo-950/60", iconColor: "text-indigo-600 dark:text-indigo-400", valueCls: "text-indigo-700 dark:text-indigo-300" }}
        />
        <KpiCard
          icon={Tag} label="Categories" value={kpi.uniqueCats}
          accent={{ bar: "bg-violet-500", iconBg: "bg-violet-50 dark:bg-violet-950/60", iconColor: "text-violet-600 dark:text-violet-400", valueCls: "text-violet-700 dark:text-violet-300" }}
        />
        <KpiCard
          icon={CheckCircle2} label="In Stock" value={kpi.inStock}
          accent={{ bar: "bg-emerald-500", iconBg: "bg-emerald-50 dark:bg-emerald-950/60", iconColor: "text-emerald-600 dark:text-emerald-400", valueCls: "text-emerald-700 dark:text-emerald-300" }}
        />
        <KpiCard
          icon={AlertTriangle} label="Low Stock" value={kpi.lowStock}
          accent={{ bar: "bg-amber-500", iconBg: "bg-amber-50 dark:bg-amber-950/60", iconColor: "text-amber-600 dark:text-amber-400", valueCls: "text-amber-700 dark:text-amber-300" }}
        />
        <KpiCard
          icon={Boxes} label="Out of Stock" value={kpi.outOfStock}
          accent={{ bar: "bg-red-500", iconBg: "bg-red-50 dark:bg-red-950/60", iconColor: "text-red-600 dark:text-red-400", valueCls: "text-red-700 dark:text-red-300" }}
        />
        <KpiCard
          icon={TrendingUp} label="Stock Value"
          value={`${sym}${kpi.stockValue >= 1_000_000 ? (kpi.stockValue / 1_000_000).toFixed(1) + "M" : kpi.stockValue >= 1000 ? (kpi.stockValue / 1000).toFixed(1) + "K" : kpi.stockValue.toFixed(0)}`}
          sub="est. at purchase price"
          accent={{ bar: "bg-teal-500", iconBg: "bg-teal-50 dark:bg-teal-950/60", iconColor: "text-teal-600 dark:text-teal-400", valueCls: "text-teal-700 dark:text-teal-300" }}
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center print:hidden">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, SKU, barcode…"
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {catOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterBrand} onValueChange={setFilterBrand}>
          <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="Brand" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {brandOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {deptOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStock} onValueChange={setFilterStock}>
          <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue placeholder="Stock Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="ok">In Stock</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="out">Out of Stock</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground h-9">
            <X size={13} /> Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}   className="text-xs h-9 gap-1"><ChevronDown size={13} /> Expand All</Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs h-9 gap-1"><ChevronRight size={13} /> Collapse All</Button>
        </div>
      </div>

      {/* ── Results count ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground print:hidden">
        <Filter size={11} />
        Showing {filtered.length} of {allProducts.length} products
        {grouped.length > 0 && ` across ${grouped.length} categor${grouped.length === 1 ? "y" : "ies"}`}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] border border-dashed rounded-xl text-muted-foreground gap-2">
          <Package size={28} className="opacity-30" />
          <p className="text-sm">No products match the current filters.</p>
          {hasFilters && <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, items]) => {
            const catObj     = allCategories.find(c => c.name === cat);
            const catStock   = items.reduce((s, e) => s + e.totalStock, 0);
            const catLow     = items.filter(e => e.minLevel > 0 && e.totalStock > 0 && e.totalStock <= e.minLevel).length;
            const catOut     = items.filter(e => e.totalStock === 0).length;
            const catValue   = items.reduce((s, e) => {
              if ((e.product.variants?.length ?? 0) > 0) {
                return s + e.variantStocks.reduce((vs, vstock) => {
                  const vp = parseFloat(vstock.variant.purchasePrice || vstock.variant.price || "0") || 0;
                  return vs + vstock.qty * vp;
                }, 0);
              }
              const cp = parseFloat(e.product.purchasePrice || e.product.costPrice || e.product.price || "0") || 0;
              return s + e.totalStock * cp;
            }, 0);

            return (
              <div key={cat} className="rounded-xl border border-border overflow-hidden shadow-sm">
                {/* Category header */}
                <div className="flex items-center justify-between gap-4 px-4 py-3 bg-muted/40 dark:bg-muted/20 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: catObj?.color || "#6366f1" }}
                    />
                    <span className="font-bold text-[14px] text-foreground">{cat}</span>
                    <Badge variant="secondary" className="text-[10px] h-5">{items.length} product{items.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="hidden sm:inline">Total stock: <strong className="text-foreground">{catStock.toLocaleString()}</strong></span>
                    {catLow > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold">{catLow} low</span>}
                    {catOut > 0 && <span className="text-red-600 dark:text-red-400 font-semibold">{catOut} out</span>}
                    <span className="hidden md:inline text-teal-600 dark:text-teal-400 font-semibold">
                      {sym}{catValue >= 1000 ? (catValue / 1000).toFixed(1) + "K" : catValue.toFixed(0)} value
                    </span>
                  </div>
                </div>

                {/* Products table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[820px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 dark:bg-muted/10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="w-8 px-2 py-2" />
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Category / Sub</th>
                        <th className="px-3 py-2">Brand / Dept</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-right">Stock Qty</th>
                        <th className="px-3 py-2 text-center">Variants</th>
                        <th className="px-3 py-2">Stock Status</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(ep => (
                        <ProductRow
                          key={ep.product.id}
                          ep={ep}
                          sym={sym}
                          expanded={expanded.has(ep.product.id)}
                          onToggle={() => toggleProduct(ep.product.id)}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/20 dark:bg-muted/10 text-[11px] font-semibold text-muted-foreground">
                        <td colSpan={5} className="px-3 py-2 text-right">Category totals →</td>
                        <td className="px-3 py-2 text-right font-bold text-foreground tabular-nums">
                          {catStock.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-center text-foreground font-bold">
                          {items.reduce((s, e) => s + (e.product.variants?.length ?? 0), 0) || "—"}
                        </td>
                        <td colSpan={2} className="px-3 py-2">
                          <span className="text-teal-600 dark:text-teal-400">
                            Est. {sym}{catValue >= 1000 ? (catValue / 1000).toFixed(1) + "K" : catValue.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Grand total footer ──────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 px-5 py-4 flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wide">Total Products</span>
            <p className="text-[20px] font-extrabold text-foreground">{filtered.length}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wide">Total Variants</span>
            <p className="text-[20px] font-extrabold text-foreground">
              {filtered.reduce((s, e) => s + (e.product.variants?.length ?? 0), 0)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wide">Total Stock Units</span>
            <p className="text-[20px] font-extrabold text-foreground">
              {filtered.reduce((s, e) => s + e.totalStock, 0).toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wide">Est. Stock Value</span>
            <p className="text-[20px] font-extrabold text-teal-600 dark:text-teal-400">
              {sym}{kpi.stockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wide">Low / Out of Stock</span>
            <p className="text-[20px] font-extrabold">
              <span className="text-amber-600">{filtered.filter(e => e.minLevel > 0 && e.totalStock > 0 && e.totalStock <= e.minLevel).length}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-red-600">{filtered.filter(e => e.totalStock === 0).length}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
