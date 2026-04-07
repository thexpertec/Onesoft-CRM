import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useShareholders, useInvestmentPlans, useProducts, useProductCategories } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Shareholder, InvestmentPlan, InvestmentType, ProductItem, getSettings } from "@/lib/store";
import { getCurrency } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Plus, Trash2, X, Save, Upload, Download, FileSpreadsheet,
  CheckCircle2, AlertCircle, TrendingUp, Lock, ArrowUpCircle, ArrowDownCircle,
  ClipboardList, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_BG } from "@/components/editable-cell";
import RichTextEditor from "@/components/RichTextEditor";

// ─── Shareholders table ───────────────────────────────────────────────────────
type EditableField = "shareholderId" | "name" | "email" | "phone" | "city" | "address";

const BLANK = (): Record<EditableField, string> => ({
  shareholderId: "", name: "", email: "", phone: "", city: "", address: "",
});

const COLS: ColDef[] = [
  { field: "shareholderId", label: "Shareholder ID", minW: 150, type: "text"  },
  { field: "name",          label: "Full Name",       minW: 200, type: "text"  },
  { field: "email",         label: "Email",           minW: 200, type: "email" },
  { field: "phone",         label: "Phone",           minW: 150, type: "tel"   },
  { field: "city",          label: "City",            minW: 140, type: "text"  },
  { field: "address",       label: "Address",         minW: 280, type: "text"  },
];

const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);
const CSV_HEADERS = ["shareholderId", "name", "email", "phone", "city", "address"] as const;

function downloadTemplate() {
  const sample = [
    ["SH-001", "Ahmed Raza",   "ahmed.raza@example.com",   "+92 300 1234567", "Islamabad", "House 12, Street 4, F-8, Islamabad"],
    ["SH-002", "Sarah Khalid", "sarah.khalid@example.com", "+44 7700 111222", "Hull",      "42 Victoria Street, Hull, HU1 2PZ"],
  ];
  const rows = [CSV_HEADERS.join(","), ...sample.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "shareholders-import-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

type ImportRow = Record<EditableField, string> & { _rowNum: number; _error?: string };

function parseCSV(text: string): ImportRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };
  const headerRow = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_]/g, ""));
  const colMap = {} as Record<EditableField, number>;
  const ALIASES: Record<EditableField, string[]> = {
    shareholderId: ["shareholderid","id","shid","shareholder_id"],
    name:          ["name","fullname","shareholdername"],
    email:         ["email","emailaddress"],
    phone:         ["phone","phonenumber","mobile","contact"],
    city:          ["city","town"],
    address:       ["address","fulladdress","streetaddress"],
  };
  (Object.keys(ALIASES) as EditableField[]).forEach(f => {
    colMap[f] = headerRow.findIndex(h => ALIASES[f].includes(h));
  });
  return lines.slice(1).map((line, i) => {
    const cells = parseLine(line);
    const row: ImportRow = { _rowNum: i+2, shareholderId:"", name:"", email:"", phone:"", city:"", address:"" };
    (Object.keys(colMap) as EditableField[]).forEach(f => {
      const ci = colMap[f];
      row[f] = ci >= 0 && cells[ci] !== undefined ? cells[ci] : "";
    });
    if (!row.name.trim()) row._error = "Name is required";
    return row;
  });
}

// ─── Share Plan helpers ───────────────────────────────────────────────────────
const INVESTMENT_TYPES: InvestmentType[] = ["Product", "Business", "Product Groups"];
const LOCK_OPTIONS = ["Yes", "No"];

const INVESTMENT_TYPE_COLORS: Record<string, string> = {
  Product:          "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  Business:         "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  "Product Groups": "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
};

function activeContextField(investmentOn: string): string {
  if (investmentOn === "Product")        return "product";
  if (investmentOn === "Business")       return "business";
  if (investmentOn === "Product Groups") return "specificProductGroups";
  return "";
}

const BLANK_PRODUCT_ITEM = (): ProductItem => ({ productName: "", units: "", investedAmount: "" });

type PlanForm = {
  title: string; investmentOn: string; product: string; business: string;
  specificProductGroups: string; timeDuration: string; lockForSpecificTime: string;
  profitMarginWithLoss: string; profitMarginWithoutLoss: string;
  maxProfit: string; maxLoss: string;
  productItems: ProductItem[];
  investmentAmount: string; unitsInvested: string;
  descriptions: string[];
};

const BLANK_PLAN = (): PlanForm => ({
  title: "", investmentOn: "Product", product: "", business: "",
  specificProductGroups: "", timeDuration: "", lockForSpecificTime: "No",
  profitMarginWithLoss: "", profitMarginWithoutLoss: "", maxProfit: "", maxLoss: "",
  productItems: [BLANK_PRODUCT_ITEM()],
  investmentAmount: "", unitsInvested: "",
  descriptions: [""],
});

// ─── Print / PDF helper ───────────────────────────────────────────────────────
function generateSharePlanHTML(shareholder: Shareholder, plans: InvestmentPlan[], currSym: string = "£"): string {
  const fmt = (n: string | undefined) => n ? Number(n).toLocaleString() : "—";
  const fmtP = (n: string | undefined) => n ? `${currSym}${Number(n).toLocaleString()}` : "—";
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const planCards = plans.map(plan => {
    const hasItems  = plan.productItems && plan.productItems.length > 0;
    const totalU    = hasItems ? plan.productItems!.reduce((s, r) => s + (parseFloat(r.units) || 0), 0) : null;
    const totalA    = hasItems ? plan.productItems!.reduce((s, r) => s + (parseFloat(r.investedAmount) || 0), 0) : null;

    const productSection = hasItems
      ? `<table class="prod-table">
          <thead><tr><th class="left">Product</th><th class="right">Units</th><th class="right">Invested (${currSym})</th></tr></thead>
          <tbody>
            ${plan.productItems!.map(item => `
              <tr>
                <td>${item.productName}</td>
                <td class="right">${fmt(item.units)}</td>
                <td class="right">${item.investedAmount ? fmtP(item.investedAmount) : "—"}</td>
              </tr>`).join("")}
            ${plan.productItems!.length > 1 ? `
              <tr class="total-row">
                <td><strong>Total</strong></td>
                <td class="right blue"><strong>${totalU?.toLocaleString()}</strong></td>
                <td class="right green"><strong>${currSym}${totalA?.toLocaleString()}</strong></td>
              </tr>` : ""}
          </tbody>
        </table>`
      : (plan.product || plan.business || plan.specificProductGroups
          ? `<p class="detail">${plan.product || plan.business || plan.specificProductGroups}</p>`
          : "");

    const metrics = [
      plan.timeDuration        ? `<span class="chip">Duration: ${plan.timeDuration}</span>` : "",
      plan.lockForSpecificTime === "Yes" ? `<span class="chip locked">🔒 Locked</span>` : "",
      plan.maxProfit           ? `<span class="chip profit">Max Profit: ${currSym}${fmt(plan.maxProfit)}</span>` : "",
      plan.maxLoss             ? `<span class="chip loss">Max Loss: ${currSym}${fmt(plan.maxLoss)}</span>` : "",
      plan.profitMarginWithLoss    ? `<span class="chip">Margin w/ Loss: ${plan.profitMarginWithLoss}%</span>` : "",
      plan.profitMarginWithoutLoss ? `<span class="chip">Margin w/o Loss: ${plan.profitMarginWithoutLoss}%</span>` : "",
    ].filter(Boolean).join(" ");

    const extraAmounts = !hasItems && (plan.investmentAmount || plan.unitsInvested)
      ? `<div class="extra-row">
          ${plan.unitsInvested ? `<span class="chip blue">${fmt(plan.unitsInvested)} units</span>` : ""}
          ${plan.investmentAmount ? `<span class="chip blue">Invested: ${fmtP(plan.investmentAmount)}</span>` : ""}
        </div>` : "";

    const allDescs = plan.descriptions && plan.descriptions.length > 0
      ? plan.descriptions
      : plan.description ? [plan.description] : [];
    const descSection = allDescs.length > 0
      ? allDescs.map((d, i) => `
          <div class="desc-block ${i > 0 ? "desc-extra" : ""}">
            ${allDescs.length > 1 ? `<p class="desc-label">Note ${i + 1}</p>` : ""}
            <div class="desc-html">${d}</div>
          </div>`).join("")
      : `<p class="desc muted">No Description</p>`;

    return `
      <div class="plan-card">
        <div class="plan-header">
          <span class="plan-title">${plan.title}</span>
          <span class="badge type-${plan.investmentOn.replace(" ", "-").toLowerCase()}">${plan.investmentOn}</span>
          ${plan.lockForSpecificTime === "Yes" ? `<span class="badge locked-badge">🔒 Locked</span>` : ""}
        </div>
        ${productSection}
        ${extraAmounts}
        ${metrics ? `<div class="chips">${metrics}</div>` : ""}
        ${descSection}
      </div>`;
  }).join("");

  const emptyMsg = plans.length === 0
    ? `<p style="color:#9ca3af;text-align:center;padding:32px 0;">No share plans linked to this shareholder.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Share Plans – ${shareholder.name}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px 40px; max-width: 800px; margin: 0 auto; }

    /* Header */
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 20px; font-weight: 700; color: #10b981; letter-spacing: -0.5px; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .doc-meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.6; }

    /* Shareholder */
    .sh-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
    .sh-name { font-size: 17px; font-weight: 700; color: #111; }
    .sh-meta { display: flex; gap: 20px; margin-top: 6px; flex-wrap: wrap; }
    .sh-meta span { font-size: 12px; color: #6b7280; }
    .sh-meta strong { color: #374151; }

    /* Section heading */
    .section-heading { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 12px; }

    /* Plan card */
    .plan-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; page-break-inside: avoid; }
    .plan-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .plan-title { font-size: 14px; font-weight: 700; color: #111; }

    /* Badges */
    .badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
    .type-product { background: #dbeafe; color: #1d4ed8; }
    .type-business { background: #d1fae5; color: #065f46; }
    .type-product-groups { background: #ede9fe; color: #5b21b6; }
    .locked-badge { background: #fef3c7; color: #92400e; }

    /* Product table */
    .prod-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
    .prod-table thead tr { background: #f3f4f6; }
    .prod-table th, .prod-table td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    .prod-table .right { text-align: right; }
    .prod-table .left { text-align: left; }
    .total-row { background: #f9fafb; border-top: 2px solid #d1d5db !important; }
    .total-row td { border-bottom: none; }
    .blue { color: #2563eb; }
    .green { color: #059669; }

    /* Chips */
    .chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
    .chip { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
    .chip.locked { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .chip.profit { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
    .chip.loss { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
    .chip.blue { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }

    /* Extra row */
    .extra-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }

    /* Description */
    .detail { font-size: 12px; color: #6b7280; margin: 4px 0 8px; }
    .desc { font-size: 12px; color: #6b7280; font-style: italic; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f3f4f6; }
    .desc.muted { color: #9ca3af; }
    .desc-block { margin-top: 10px; padding-top: 8px; border-top: 1px solid #f3f4f6; }
    .desc-extra { margin-top: 6px; }
    .desc-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 4px; }
    .desc-html { font-size: 12px; color: #374151; line-height: 1.6; }
    .desc-html p { margin: 0 0 6px; }
    .desc-html strong { font-weight: 600; }
    .desc-html em { font-style: italic; }
    .desc-html ul, .desc-html ol { padding-left: 18px; margin: 4px 0; }
    .desc-html li { margin: 2px 0; }
    .desc-html h1 { font-size: 16px; font-weight: 700; margin: 8px 0 4px; }
    .desc-html h2 { font-size: 14px; font-weight: 700; margin: 6px 0 4px; }
    .desc-html h3 { font-size: 13px; font-weight: 600; margin: 5px 0 3px; }
    .desc-html blockquote { border-left: 3px solid #d1d5db; padding-left: 10px; color: #6b7280; margin: 6px 0; }
    .desc-html code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 11px; font-family: monospace; }
    .desc-html mark { background: #fef08a; padding: 0 2px; }

    /* Footer */
    .doc-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }

    @media print {
      body { padding: 20px 24px; }
      .no-print { display: none !important; }
      .plan-card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Print button (hidden in print) -->
  <div class="no-print" style="display:flex;justify-content:flex-end;margin-bottom:16px;gap:8px;">
    <button onclick="window.print()" style="cursor:pointer;padding:7px 18px;background:#10b981;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;">🖨 Print / Save PDF</button>
    <button onclick="window.close()" style="cursor:pointer;padding:7px 14px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">Close</button>
  </div>

  <!-- Document header -->
  <div class="doc-header">
    <div>
      <div class="brand">Onesoft</div>
      <div class="brand-sub">Hull, UK &amp; Islamabad, Pakistan</div>
    </div>
    <div class="doc-meta">
      <div><strong>Share Plan Report</strong></div>
      <div>Generated: ${date}</div>
      <div>${plans.length} Plan${plans.length !== 1 ? "s" : ""} Linked</div>
    </div>
  </div>

  <!-- Shareholder info -->
  <div class="sh-block">
    <div class="sh-name">${shareholder.name}</div>
    <div class="sh-meta">
      ${shareholder.shareholderId ? `<span>ID: <strong>${shareholder.shareholderId}</strong></span>` : ""}
      ${shareholder.email   ? `<span>Email: <strong>${shareholder.email}</strong></span>` : ""}
      ${shareholder.phone   ? `<span>Phone: <strong>${shareholder.phone}</strong></span>` : ""}
      ${shareholder.city    ? `<span>City: <strong>${shareholder.city}</strong></span>` : ""}
    </div>
    ${shareholder.address ? `<p style="font-size:12px;color:#6b7280;margin-top:6px;">Address: <strong style="color:#374151;">${shareholder.address}</strong></p>` : ""}
  </div>

  <!-- Plans -->
  <div class="section-heading">${plans.length} Linked Plan${plans.length !== 1 ? "s" : ""}</div>
  ${planCards}
  ${emptyMsg}

  <!-- Footer -->
  <div class="doc-footer">
    <span>Onesoft Admin Dashboard</span>
    <span>Confidential – For Internal Use Only</span>
  </div>

  <script>
    // Auto-open print dialog after a short delay so the page renders first
    window.addEventListener("load", function() {
      setTimeout(function() { window.print(); }, 600);
    });
  </script>
</body>
</html>`;
}

// ─── Share Plans Dialog ───────────────────────────────────────────────────────
function SharePlansDialog({
  shareholder, open, onClose,
  plans, onAddPlan, onDeletePlan,
  productOptions, categoryOptions,
}: {
  shareholder: Shareholder | null;
  open: boolean;
  onClose: () => void;
  plans: InvestmentPlan[];
  onAddPlan: (data: Omit<InvestmentPlan, "id"|"createdAt"|"updatedAt">) => void;
  onDeletePlan: (id: string) => void;
  productOptions: string[];
  categoryOptions: string[];
}) {
  const currSym = getCurrency(getSettings().currency).symbol;

  const [form,    setForm]    = useState<PlanForm>(BLANK_PLAN());
  const [adding,  setAdding]  = useState(false);
  const [delId,   setDelId]   = useState<string | null>(null);

  useEffect(() => { if (open) { setForm(BLANK_PLAN()); setAdding(false); } }, [open, shareholder?.id]);

  const handlePrint = () => {
    if (!shareholder) return;
    const myPlans = plans.filter(p => p.shareholderId === shareholder.id);
    const html    = generateSharePlanHTML(shareholder, myPlans, currSym);
    const win     = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  if (!shareholder) return null;

  const myPlans = plans.filter(p => p.shareholderId === shareholder.id);

  const handleInvestOnChange = (v: string) => {
    setForm(f => ({
      ...f, investmentOn: v, product: "", business: "", specificProductGroups: "",
      productItems: [BLANK_PRODUCT_ITEM()],
    }));
  };

  const updateProductItem = (idx: number, field: keyof ProductItem, value: string) => {
    setForm(f => {
      const items = f.productItems.map((r, i) => i === idx ? { ...r, [field]: value } : r);
      return { ...f, productItems: items };
    });
  };

  const addProductRow = () => setForm(f => ({ ...f, productItems: [...f.productItems, BLANK_PRODUCT_ITEM()] }));

  const removeProductRow = (idx: number) => setForm(f => ({
    ...f, productItems: f.productItems.length > 1 ? f.productItems.filter((_, i) => i !== idx) : [BLANK_PRODUCT_ITEM()],
  }));

  const updateDescription = (idx: number, val: string) =>
    setForm(f => ({ ...f, descriptions: f.descriptions.map((d, i) => i === idx ? val : d) }));
  const addDescription    = () => setForm(f => ({ ...f, descriptions: [...f.descriptions, ""] }));
  const removeDescription = (idx: number) => setForm(f => ({
    ...f, descriptions: f.descriptions.length > 1 ? f.descriptions.filter((_, i) => i !== idx) : [""],
  }));

  const isProductMode = form.investmentOn === "Product";
  const filledItems   = form.productItems.filter(r => r.productName);
  const totalUnits    = form.productItems.reduce((s, r) => s + (parseFloat(r.units) || 0), 0);
  const totalAmount   = form.productItems.reduce((s, r) => s + (parseFloat(r.investedAmount) || 0), 0);

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const filledDescriptions = form.descriptions.filter(d => d && d.replace(/<[^>]*>/g, "").trim());
    onAddPlan({
      title: form.title,
      shareholderId: shareholder.id,
      investmentOn:            form.investmentOn as InvestmentType,
      product:                 isProductMode ? filledItems.map(r => r.productName).join(", ") : form.product,
      business:                form.business,
      specificProductGroups:   form.specificProductGroups,
      timeDuration:            form.timeDuration,
      lockForSpecificTime:     (form.lockForSpecificTime || "No") as "Yes"|"No",
      profitMarginWithLoss:    form.profitMarginWithLoss,
      profitMarginWithoutLoss: form.profitMarginWithoutLoss,
      maxProfit:               form.maxProfit,
      maxLoss:                 form.maxLoss,
      productItems:            isProductMode && filledItems.length > 0 ? filledItems : undefined,
      investmentAmount:        isProductMode ? (totalAmount > 0 ? String(totalAmount) : undefined) : (form.investmentAmount || undefined),
      unitsInvested:           isProductMode ? (totalUnits  > 0 ? String(totalUnits)  : undefined) : (form.unitsInvested    || undefined),
      descriptions:            filledDescriptions.length > 0 ? filledDescriptions : undefined,
      description:             filledDescriptions[0] || undefined,
    });
    setForm(BLANK_PLAN());
    setAdding(false);
  };


  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <TrendingUp size={17} className="text-emerald-500" />
              Share Plans
              <span className="text-muted-foreground font-normal">— {shareholder.name}</span>
            </DialogTitle>
            {shareholder.shareholderId && (
              <p className="text-[12px] text-muted-foreground mt-0.5">ID: {shareholder.shareholderId}</p>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Existing plans */}
            {myPlans.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {myPlans.length} Linked Plan{myPlans.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-2">
                  {myPlans.map(plan => (
                    <div key={plan.id} className="rounded-lg border bg-muted/20 px-4 py-3 flex items-start gap-3 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold truncate">{plan.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${INVESTMENT_TYPE_COLORS[plan.investmentOn]}`}>
                            {plan.investmentOn}
                          </span>
                          {plan.lockForSpecificTime === "Yes" && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                              <Lock size={9} /> Locked
                            </span>
                          )}
                        </div>
                        {/* Product items breakdown */}
                        {plan.productItems && plan.productItems.length > 0 ? (
                          <div className="mt-2 rounded-md border border-gray-100 dark:border-border overflow-hidden">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="bg-gray-50 dark:bg-muted/30">
                                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">Product</th>
                                  <th className="text-right px-2 py-1 font-medium text-muted-foreground">Units</th>
                                  <th className="text-right px-2 py-1 font-medium text-muted-foreground">Invested ({currSym})</th>
                                </tr>
                              </thead>
                              <tbody>
                                {plan.productItems.map((item, i) => (
                                  <tr key={i} className="border-t border-gray-100 dark:border-border">
                                    <td className="px-2 py-1">{item.productName}</td>
                                    <td className="px-2 py-1 text-right text-muted-foreground">{item.units ? Number(item.units).toLocaleString() : "—"}</td>
                                    <td className="px-2 py-1 text-right text-muted-foreground">{item.investedAmount ? `${currSym}${Number(item.investedAmount).toLocaleString()}` : "—"}</td>
                                  </tr>
                                ))}
                                {/* Totals row */}
                                {plan.productItems.length > 1 && (
                                  <tr className="border-t-2 border-gray-200 dark:border-border bg-gray-50/80 dark:bg-muted/20 font-semibold">
                                    <td className="px-2 py-1 text-[11px] text-muted-foreground uppercase tracking-wide">Total</td>
                                    <td className="px-2 py-1 text-right text-blue-600 dark:text-blue-400">
                                      {plan.productItems.reduce((s, r) => s + (parseFloat(r.units) || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-2 py-1 text-right text-emerald-600 dark:text-emerald-400">
                                      {currSym}{plan.productItems.reduce((s, r) => s + (parseFloat(r.investedAmount) || 0), 0).toLocaleString()}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                            {(plan.product || plan.business || plan.specificProductGroups) && (
                              <span className="text-[12px] text-muted-foreground truncate">
                                {plan.product || plan.business || plan.specificProductGroups}
                              </span>
                            )}
                            {plan.unitsInvested && (
                              <span className="text-[12px] text-muted-foreground font-medium">
                                {Number(plan.unitsInvested).toLocaleString()} units
                              </span>
                            )}
                            {plan.investmentAmount && (
                              <span className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 font-medium">
                                {currSym}{Number(plan.investmentAmount).toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          {plan.timeDuration && (
                            <span className="text-[12px] text-muted-foreground">{plan.timeDuration}</span>
                          )}
                          {plan.maxProfit && (
                            <span className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                              <ArrowUpCircle size={11} /> {currSym}{Number(plan.maxProfit).toLocaleString()}
                            </span>
                          )}
                          {plan.maxLoss && (
                            <span className="flex items-center gap-1 text-[12px] text-red-500 dark:text-red-400">
                              <ArrowDownCircle size={11} /> {currSym}{Number(plan.maxLoss).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {(plan.profitMarginWithLoss || plan.profitMarginWithoutLoss) && (
                          <div className="flex gap-4 mt-1 text-[11px] text-muted-foreground">
                            {plan.profitMarginWithLoss && <span>Margin w/ Loss: <strong>{plan.profitMarginWithLoss}%</strong></span>}
                            {plan.profitMarginWithoutLoss && <span>Margin w/o Loss: <strong>{plan.profitMarginWithoutLoss}%</strong></span>}
                          </div>
                        )}
                        {/* Descriptions (rich text) */}
                        {(() => {
                          const descs = plan.descriptions && plan.descriptions.length > 0
                            ? plan.descriptions
                            : plan.description ? [plan.description] : [];
                          if (descs.length === 0) return (
                            <p className="mt-1.5 text-[12px] text-muted-foreground italic border-t pt-1.5">No Description</p>
                          );
                          return descs.map((d, i) => (
                            <div key={i} className="mt-1.5 text-[12px] text-muted-foreground border-t pt-1.5 leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                              dangerouslySetInnerHTML={{ __html: d }} />
                          ));
                        })()}
                      </div>
                      <button
                        onClick={() => setDelId(plan.id)}
                        className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                        title="Delete plan">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {myPlans.length === 0 && !adding && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <ClipboardList size={32} className="text-muted-foreground/30" />
                <p className="text-sm">No share plans yet for this shareholder.</p>
              </div>
            )}

            {/* Add Plan form */}
            {adding ? (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">New Share Plan</p>

                {/* Row 1: Title + Investment On */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[12px]">Plan Title <span className="text-red-400">*</span></Label>
                    <Input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
                      placeholder="e.g. Annual Growth Plan" className="h-8 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">Investment On</Label>
                    <select value={form.investmentOn} onChange={e => handleInvestOnChange(e.target.value)}
                      className="w-full h-8 px-3 text-[13px] rounded-md border border-input bg-background dark:text-foreground">
                      {INVESTMENT_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>

                {/* Contextual section — Product mode: multi-row table; others: single field */}
                {isProductMode ? (
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Products</Label>
                    {/* Column headers */}
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 90px 110px 28px" }}>
                      <span className="text-[11px] text-muted-foreground px-1">Product Name</span>
                      <span className="text-[11px] text-muted-foreground px-1">Units</span>
                      <span className="text-[11px] text-muted-foreground px-1">Invested ({currSym})</span>
                      <span />
                    </div>
                    {/* Product rows */}
                    {form.productItems.map((row, idx) => (
                      <div key={idx} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: "1fr 90px 110px 28px" }}>
                        <select
                          value={row.productName}
                          onChange={e => updateProductItem(idx, "productName", e.target.value)}
                          className="h-8 px-2 text-[13px] rounded-md border border-input bg-background dark:text-foreground w-full">
                          <option value="">Select…</option>
                          {productOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <Input value={row.units}
                          onChange={e => updateProductItem(idx, "units", e.target.value)}
                          placeholder="0" type="number" className="h-8 text-[13px]" />
                        <Input value={row.investedAmount}
                          onChange={e => updateProductItem(idx, "investedAmount", e.target.value)}
                          placeholder="0" type="number" className="h-8 text-[13px]" />
                        <button onClick={() => removeProductRow(idx)}
                          className="h-8 w-7 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    {/* Totals row */}
                    {form.productItems.length > 0 && (totalUnits > 0 || totalAmount > 0) && (
                      <div className="grid gap-1.5 items-center border-t pt-1.5 mt-0.5" style={{ gridTemplateColumns: "1fr 90px 110px 28px" }}>
                        <span className="text-[11px] font-semibold text-muted-foreground px-1">Total</span>
                        <span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 px-1">
                          {totalUnits > 0 ? totalUnits.toLocaleString() : "—"}
                        </span>
                        <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400 px-1">
                          {totalAmount > 0 ? `${currSym}${totalAmount.toLocaleString()}` : "—"}
                        </span>
                        <span />
                      </div>
                    )}
                    {/* Add row */}
                    <button onClick={addProductRow}
                      className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 hover:underline mt-0.5">
                      <Plus size={11} /> Add Product
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {/* Business text */}
                    <div className={`space-y-1 ${form.investmentOn !== "Business" ? "opacity-40 pointer-events-none" : ""}`}>
                      <Label className="text-[12px] flex items-center gap-1">
                        Business
                        {form.investmentOn !== "Business" && <span className="text-[10px] text-muted-foreground">(n/a)</span>}
                      </Label>
                      <Input value={form.business} onChange={e => setForm(f => ({...f, business: e.target.value}))}
                        placeholder="Business name" disabled={form.investmentOn !== "Business"}
                        className="h-8 text-[13px]" />
                    </div>
                    {/* Product Groups dropdown */}
                    <div className={`space-y-1 ${form.investmentOn !== "Product Groups" ? "opacity-40 pointer-events-none" : ""}`}>
                      <Label className="text-[12px] flex items-center gap-1">
                        Product Groups
                        {form.investmentOn !== "Product Groups" && <span className="text-[10px] text-muted-foreground">(n/a)</span>}
                      </Label>
                      {form.investmentOn === "Product Groups" ? (
                        <select value={form.specificProductGroups} onChange={e => setForm(f => ({...f, specificProductGroups: e.target.value}))}
                          className="w-full h-8 px-3 text-[13px] rounded-md border border-input bg-background dark:text-foreground">
                          <option value="">Select group…</option>
                          {categoryOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <Input value="" disabled placeholder="—" className="h-8 text-[13px] bg-muted/50" />
                      )}
                    </div>
                  </div>
                )}

                {/* Duration (always) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[12px]">Duration</Label>
                    <Input value={form.timeDuration} onChange={e => setForm(f => ({...f, timeDuration: e.target.value}))}
                      placeholder="e.g. 12 Months" className="h-8 text-[13px]" />
                  </div>
                  {/* Investment Amount + Units for non-Product modes */}
                  {!isProductMode && (
                    <div className="space-y-1">
                      <Label className="text-[12px]">Investment Amount ({currSym})</Label>
                      <Input value={form.investmentAmount} onChange={e => setForm(f => ({...f, investmentAmount: e.target.value}))}
                        placeholder="25000" type="number" className="h-8 text-[13px]" />
                    </div>
                  )}
                </div>

                {!isProductMode && (
                  <div className="space-y-1">
                    <Label className="text-[12px]">No. of Units Invested</Label>
                    <Input value={form.unitsInvested} onChange={e => setForm(f => ({...f, unitsInvested: e.target.value}))}
                      placeholder="100" type="number" className="h-8 text-[13px]" />
                  </div>
                )}

                {/* Locked Period + Margins */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[12px]">Locked Period</Label>
                    <select value={form.lockForSpecificTime} onChange={e => setForm(f => ({...f, lockForSpecificTime: e.target.value}))}
                      className="w-full h-8 px-3 text-[13px] rounded-md border border-input bg-background dark:text-foreground">
                      {LOCK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">Margin w/ Loss (%)</Label>
                    <Input value={form.profitMarginWithLoss} onChange={e => setForm(f => ({...f, profitMarginWithLoss: e.target.value}))}
                      placeholder="18" type="number" className="h-8 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px]">Margin w/o Loss (%)</Label>
                    <Input value={form.profitMarginWithoutLoss} onChange={e => setForm(f => ({...f, profitMarginWithoutLoss: e.target.value}))}
                      placeholder="25" type="number" className="h-8 text-[13px]" />
                  </div>
                </div>

                {/* Max Profit + Max Loss */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[12px] flex items-center gap-1">
                      <ArrowUpCircle size={11} className="text-emerald-500" /> Max Profit
                    </Label>
                    <Input value={form.maxProfit} onChange={e => setForm(f => ({...f, maxProfit: e.target.value}))}
                      placeholder="50000" type="number" className="h-8 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px] flex items-center gap-1">
                      <ArrowDownCircle size={11} className="text-red-400" /> Max Loss
                    </Label>
                    <Input value={form.maxLoss} onChange={e => setForm(f => ({...f, maxLoss: e.target.value}))}
                      placeholder="10000" type="number" className="h-8 text-[13px]" />
                  </div>
                </div>

                {/* Descriptions — multiple rich text editors */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[12px]">Descriptions</Label>
                    <button onClick={addDescription}
                      className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 hover:underline">
                      <Plus size={11} /> Add Note
                    </button>
                  </div>
                  {form.descriptions.map((desc, idx) => (
                    <div key={idx} className="space-y-1">
                      {form.descriptions.length > 1 && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground font-medium">Note {idx + 1}</span>
                          <button onClick={() => removeDescription(idx)}
                            className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 hover:underline">
                            <X size={10} /> Remove
                          </button>
                        </div>
                      )}
                      <RichTextEditor
                        value={desc}
                        onChange={v => updateDescription(idx, v)}
                        placeholder="Add notes about this share plan…"
                        minHeight="90px"
                      />
                    </div>
                  ))}
                </div>

                {/* Form actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="h-8 gap-1.5 text-[13px]" onClick={handleSubmit} disabled={!form.title.trim()}>
                    <Save size={13} /> Save Plan
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-[13px]" onClick={() => { setForm(BLANK_PLAN()); setAdding(false); }}>
                    <X size={13} /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-[13px] border-dashed w-full"
                onClick={() => setAdding(true)}>
                <Plus size={13} /> Add Share Plan
              </Button>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 gap-1.5 text-[13px] text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
              <Printer size={13} /> Preview &amp; Print
            </Button>
            <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-[13px]">Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete plan confirmation */}
      <AlertDialog open={!!delId} onOpenChange={open => !open && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Share Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{plans.find(p => p.id === delId)?.title}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (delId) { onDeletePlan(delId); setDelId(null); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const NEW_ROW_ID = "__new__";

export default function ShareholdersPage() {
  const { shareholders, addShareholder, editShareholder, removeShareholder } = useShareholders();
  const { plans, addPlan, removePlan } = useInvestmentPlans();
  const { products }   = useProducts();
  const { categories } = useProductCategories();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const productOptions  = useMemo(() => [...new Set(products.map(p => p.name).filter(Boolean))].sort(), [products]);
  const categoryOptions = useMemo(() => [...new Set(categories.map(c => c.name).filter(Boolean))].sort(), [categories]);

  const [search,       setSearch]       = useState("");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);
  const [planModalId,  setPlanModalId]  = useState<string | null>(null);  // shareholder ID

  const [importOpen,  setImportOpen]  = useState(false);
  const [importRows,  setImportRows]  = useState<ImportRow[]>([]);
  const [importing,   setImporting]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setImportRows(parseCSV(ev.target?.result as string)); setImportOpen(true); };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmImport = () => {
    setImporting(true);
    const valid = importRows.filter(r => !r._error);
    let dupes = 0;
    valid.forEach(r => {
      const emailNorm = r.email.toLowerCase().trim();
      const phoneNorm = r.phone.replace(/\D/g, "");
      const isDupe = shareholders.some(s => {
        if (emailNorm && s.email.toLowerCase() === emailNorm) return true;
        if (phoneNorm.length >= 7 && s.phone.replace(/\D/g, "") === phoneNorm) return true;
        return false;
      });
      if (isDupe) { dupes++; return; }
      addShareholder({ shareholderId: r.shareholderId, name: r.name, email: r.email, phone: r.phone, city: r.city, address: r.address });
    });
    const imported = valid.length - dupes;
    toast({
      title: `${imported} shareholder${imported !== 1 ? "s" : ""} imported`,
      description: [
        importRows.length > valid.length ? `${importRows.length - valid.length} row(s) had errors.` : "",
        dupes > 0 ? `${dupes} duplicate(s) skipped.` : "",
      ].filter(Boolean).join(" ") || undefined,
    });
    setImportOpen(false); setImportRows([]); setImporting(false);
  };

  const filtered = useMemo(() => shareholders
    .filter(s => !search || [s.shareholderId, s.name, s.email, s.phone, s.city, s.address]
      .some(v => v?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  [shareholders, search]);

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const s = shareholders.find(sh => sh.id === id);
    if (!s || (s as unknown as Record<string,string>)[field] === value) { setActiveCell(null); return; }
    editShareholder(id, { [field]: value } as Partial<Shareholder>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [shareholders, editShareholder, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(s => s.id)];
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    setActiveCell({ id: rows[nr], col: nc });
  }, [filtered]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = filtered.map(s => s.id);
    const ri = rows.indexOf(id);
    if (ri + 1 < rows.length) setActiveCell({ id: rows[ri+1], col });
  }, [filtered]);

  const navigateNewRow = (ci: number, shift: boolean) => {
    let nc = ci + (shift ? -1 : 1);
    if (nc >= COLS.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow?.name.trim()) { toast({ title: "Full name is required", variant: "destructive" }); setNewRowActive(1); return; }
    const emailNorm = newRow.email.toLowerCase().trim();
    const phoneNorm = newRow.phone.replace(/\D/g, "");
    const dupe = shareholders.find(s => {
      if (emailNorm && s.email.toLowerCase() === emailNorm) return true;
      if (phoneNorm.length >= 7 && s.phone.replace(/\D/g, "") === phoneNorm) return true;
      return false;
    });
    if (dupe) {
      toast({
        title: "Duplicate shareholder",
        description: `A shareholder with the same ${emailNorm && dupe.email.toLowerCase() === emailNorm ? "email" : "phone"} already exists.`,
        variant: "destructive",
      });
      return;
    }
    addShareholder({ shareholderId: newRow.shareholderId, name: newRow.name, email: newRow.email, phone: newRow.phone, city: newRow.city, address: newRow.address });
    toast({ title: "Shareholder added", description: `"${newRow.name}" created.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const s = shareholders.find(sh => sh.id === deleteId);
    removeShareholder(deleteId);
    toast({ title: "Deleted", description: `"${s?.name}" removed.` });
    setDeleteId(null);
  };

  const handleAddPlan = (data: Omit<InvestmentPlan, "id"|"createdAt"|"updatedAt">) => {
    addPlan(data);
    toast({ title: "Share plan saved", description: `"${data.title}" linked to shareholder.` });
  };

  const handleDeletePlan = (id: string) => {
    const p = plans.find(pl => pl.id === id);
    removePlan(id);
    toast({ title: "Plan removed", description: `"${p?.title}" deleted.` });
  };

  const planModalShareholder = shareholders.find(s => s.id === planModalId) ?? null;

  // plan count per shareholder
  const planCount = useMemo(() => {
    const map: Record<string, number> = {};
    plans.forEach(p => { if (p.shareholderId) map[p.shareholderId] = (map[p.shareholderId] || 0) + 1; });
    return map;
  }, [plans]);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shareholders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Enter to save · Esc to cancel</p>
        </div>
        {isAuthenticated && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1.5 h-8 text-[13px]" title="Download CSV template">
              <Download size={13} /> Template
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5 h-8 text-[13px]">
              <Upload size={13} /> Import CSV
            </Button>
            <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5 h-8 text-[13px]" data-testid="btn-add-shareholder">
              <Plus size={14} /> Add Shareholder
            </Button>
          </div>
        )}
      </div>

      {/* KPI pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[12px] font-medium">
          Total: <span className="font-bold">{shareholders.length}</span>
        </div>
        {plans.filter(p => p.shareholderId).length > 0 && (
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[12px] font-medium flex items-center gap-1.5">
            <TrendingUp size={11} /> Share Plans: <span className="font-bold">{plans.filter(p => p.shareholderId).length}</span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search shareholders…" className="pl-8 h-8 text-[13px]" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        {search && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-[12px]" onClick={() => setSearch("")}>
            <X size={12} /> Clear
          </Button>
        )}
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {shareholders.length}</div>
      </div>

      {/* Grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* New row */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: `${CELL_H}px` }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field as EditableField] ?? "";
                return (
                  <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`} style={{ height: `${CELL_H}px` }}>
                    {isA ? (
                      <input autoFocus type={c.type === "email" ? "email" : c.type === "tel" ? "tel" : "text"}
                        value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => {
                          if (e.key === "Tab")   { e.preventDefault(); navigateNewRow(ci, e.shiftKey); }
                          if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); }
                          if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); }
                        }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                        <span className={`truncate ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                      </div>
                    )}
                  </td>
                );
              })}
              {/* New row actions */}
              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px`, width: 80 }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Save"><Save size={13} /></button>
                  <button onClick={() => { setNewRow(null); setNewRowActive(null); }} className="p-1 rounded text-red-400 hover:bg-red-50" title="Cancel"><X size={13} /></button>
                </div>
              </td>
            </tr>
          )}

          {/* Existing rows */}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
                {search
                  ? "No shareholders match your search."
                  : <span>No shareholders yet. Click <strong>Add Shareholder</strong> to get started.</span>}
              </td>
            </tr>
          ) : filtered.map((s, ri) => {
            const isRowActive = activeCell?.id === s.id;
            const count = planCount[s.id] || 0;
            return (
              <tr key={s.id} data-testid={`row-shareholder-${s.id}`}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === s.id && activeCell.col === ci;
                  const rawVal = String((s as unknown as Record<string,string>)[c.field] ?? "");
                  return (
                    <td key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : isAuthenticated ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && isAuthenticated && setActiveCell({ id: s.id, col: ci })}>
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={isAuthenticated}
                        onActivate={() => setActiveCell({ id: s.id, col: ci })}
                        onCommit={v => commitCell(s.id, c.field as EditableField, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={sh => navigateCell(s.id, ci, sh)}
                        onEnter={() => moveCellDown(s.id, ci)}
                      />
                    </td>
                  );
                })}
                {/* Actions column */}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px`, width: 80 }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 h-full px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Share Plan button */}
                    {isAuthenticated && (
                      <button
                        className="relative p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                        title="Share Plans"
                        data-testid={`btn-share-plan-${s.id}`}
                        onClick={() => setPlanModalId(s.id)}>
                        <TrendingUp size={13} />
                        {count > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-3.5 h-3.5 text-[8px] font-bold bg-emerald-500 text-white rounded-full leading-none">
                            {count > 9 ? "9+" : count}
                          </span>
                        )}
                      </button>
                    )}
                    {/* Delete button */}
                    {isAuthenticated && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete"
                        onClick={() => setDeleteId(s.id)} data-testid={`btn-delete-shareholder-${s.id}`}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </ExcelGridShell>
      </div>

      {/* Delete shareholder confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shareholder</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{shareholders.find(s => s.id === deleteId)?.name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-500" /> Import Shareholders
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-3">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span>{importRows.length} row(s) found</span>
              <span>·</span>
              <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} />{importRows.filter(r => !r._error).length} valid</span>
              {importRows.some(r => r._error) && (
                <span className="text-red-500 flex items-center gap-1"><AlertCircle size={12} />{importRows.filter(r => r._error).length} errors</span>
              )}
            </div>
            <div className="rounded border overflow-auto max-h-[45vh]">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">#</th>
                    {CSV_HEADERS.map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>)}
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map(row => (
                    <tr key={row._rowNum} className={`border-t ${row._error ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                      <td className="px-3 py-1.5 text-muted-foreground">{row._rowNum}</td>
                      {CSV_HEADERS.map(h => <td key={h} className="px-3 py-1.5 truncate max-w-[160px]">{row[h as EditableField]}</td>)}
                      <td className="px-3 py-1.5">
                        {row._error
                          ? <span className="text-red-500 flex items-center gap-1"><AlertCircle size={11} />{row._error}</span>
                          : <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} />OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pt-3 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button disabled={importing || importRows.filter(r => !r._error).length === 0} onClick={confirmImport}>
              Import {importRows.filter(r => !r._error).length} Shareholders
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Plans modal */}
      <SharePlansDialog
        shareholder={planModalShareholder}
        open={!!planModalId}
        onClose={() => setPlanModalId(null)}
        plans={plans}
        onAddPlan={handleAddPlan}
        onDeletePlan={handleDeletePlan}
        productOptions={productOptions}
        categoryOptions={categoryOptions}
      />
    </div>
  );
}
