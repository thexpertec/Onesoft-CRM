import { useState, useEffect, useRef, useCallback, CSSProperties } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Save, RotateCcw, Pencil, Bold, Italic,
  CaseSensitive, X, MousePointer2, Palette,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getSettings, saveSettings,
  InvoiceLabels, DEFAULT_INVOICE_LABELS, getInvoiceLabels,
  AppSettings, LabelStyle, getInvoiceLabelStyles,
} from "@/lib/store";

// ─── Types ────────────────────────────────────────────────────────────────────
type LabelStyles = Record<string, LabelStyle>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cssProp(ls?: LabelStyle): CSSProperties {
  if (!ls) return {};
  return {
    color:          ls.color      ?? undefined,
    fontSize:       ls.fontSize   ? `${ls.fontSize}pt`  : undefined,
    fontWeight:     ls.fontWeight ?? undefined,
    fontStyle:      ls.fontStyle  ?? undefined,
    textTransform:  ls.textTransform === "none" ? undefined : (ls.textTransform ?? undefined),
  };
}

// ─── Human-readable names for each label key ──────────────────────────────────
const LABEL_NAMES: Partial<Record<keyof InvoiceLabels, string>> = {
  invoiceTitle:         "Invoice Title (header)",
  purchaseInvoiceTitle: "Purchase Invoice Title",
  footerNote:           "Footer Note",
  billTo:               "Bill To",
  invoiceDateLabel:     "Invoice Date label",
  dueDateLabel:         "Due Date label",
  paymentViaLabel:      "Payment Via label",
  itemsSectionTitle:    "Items Section Title",
  colNum:               "Column — #",
  colDescription:       "Column — Description",
  colUnit:              "Column — Unit",
  colQty:               "Column — Qty",
  colUnitPrice:         "Column — Unit Price",
  colDisc:              "Column — Discount",
  colTotal:             "Column — Total",
  subtotalLabel:        "Subtotal",
  vatLabel:             "VAT / Tax",
  deliveryLabel:        "Delivery",
  otherChargesLabel:    "Other Charges",
  totalLabel:           "Total (grand)",
  amountPaidLabel:      "Amount Paid",
  balanceDueLabel:      "Balance Due",
  previousBalanceLabel: "Previous Balance",
  newBalanceLabel:      "New Balance",
  fullyPaidLabel:       "Fully Paid",
  termsSectionTitle:    "Terms & Notes Title",
  paymentTermsTitle:    "Payment Terms",
  additionalNotesTitle: "Additional Notes",
  agreementTitle:       "Agreement",
  paymentHistoryTitle:  "Payment History Title",
  bankDetailsTitle:     "Bank Details Title",
};

// ─── Colour palette ───────────────────────────────────────────────────────────
const PALETTE = [
  "#0f2447","#1e3a5f","#1e40af","#2563eb","#3b82f6","#60a5fa",
  "#0891b2","#0f766e","#15803d","#65a30d","#ca8a04","#d97706",
  "#ea580c","#dc2626","#9333ea","#db2777","#374151","#6b7280",
  "#94a3b8","#cbd5e1","#e2e8f0","#f8fafc","#ffffff","#000000",
];

const FONT_SIZES = [7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24];

// ─── Inline-editable label ────────────────────────────────────────────────────
function EditLabel({
  labelKey, value, onChange, labelStyle, selectedKey, onSelect, className = "",
}: {
  labelKey:   keyof InvoiceLabels;
  value:      string;
  onChange:   (k: keyof InvoiceLabels, v: string) => void;
  labelStyle?: LabelStyle;
  selectedKey: string | null;
  onSelect:   (k: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastValue = useRef(value);
  const isSelected = selectedKey === labelKey;

  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.textContent = value;
      lastValue.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (ref.current) ref.current.textContent = value;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      title={LABEL_NAMES[labelKey] ?? labelKey}
      style={cssProp(labelStyle)}
      onClick={e => { e.stopPropagation(); onSelect(labelKey); }}
      onFocus={() => onSelect(labelKey)}
      onBlur={e => {
        const text = e.currentTarget.textContent?.trim() || "";
        lastValue.current = text;
        onChange(labelKey, text);
      }}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLSpanElement).blur(); }
        if (e.key === "Escape") { (e.currentTarget as HTMLSpanElement).blur(); }
      }}
      className={`outline-none cursor-text rounded px-0.5 transition-all ${
        isSelected
          ? "ring-2 ring-blue-500 bg-blue-50/70 dark:bg-blue-950/40"
          : "hover:ring-1 hover:ring-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
      } ${className}`}
    />
  );
}

// ─── Colour picker with presets ───────────────────────────────────────────────
function ColourPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            style={{ background: c, boxShadow: value === c ? `0 0 0 2px #3b82f6` : undefined }}
            className="w-5 h-5 rounded cursor-pointer flex-shrink-0 border border-black/10 transition-transform hover:scale-110"
            title={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-gray-200 dark:border-zinc-600 p-0.5"
        />
        <input
          type="text"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          spellCheck={false}
          className="flex-1 text-xs font-mono border border-gray-200 dark:border-zinc-700 rounded px-2 py-1.5 bg-white dark:bg-zinc-800 dark:text-zinc-200"
        />
        {value && (
          <button onClick={() => onChange("")} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────
function PropertiesPanel({
  selectedKey, labels, labelStyles, onTextChange, onStyleChange, onClearStyle, onDeselect,
}: {
  selectedKey:  keyof InvoiceLabels;
  labels:       InvoiceLabels;
  labelStyles:  LabelStyles;
  onTextChange: (k: keyof InvoiceLabels, v: string) => void;
  onStyleChange: (k: string, prop: keyof LabelStyle, val: LabelStyle[keyof LabelStyle] | undefined) => void;
  onClearStyle: (k: string) => void;
  onDeselect:   () => void;
}) {
  const style = labelStyles[selectedKey] ?? {};
  const name  = LABEL_NAMES[selectedKey] ?? String(selectedKey);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Editing Label</p>
          <p className="text-sm font-bold leading-tight truncate max-w-[180px]">{name}</p>
        </div>
        <button onClick={onDeselect} className="p-1 rounded hover:bg-blue-700 transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Text content */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider block mb-1.5">
            Label Text
          </label>
          <input
            type="text"
            value={labels[selectedKey] ?? ""}
            onChange={e => onTextChange(selectedKey, e.target.value)}
            className="w-full text-sm border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Colour */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Palette size={11} /> Text Colour
          </label>
          <ColourPicker
            value={style.color ?? ""}
            onChange={v => onStyleChange(selectedKey, "color", v || undefined)}
          />
        </div>

        {/* Font size */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <CaseSensitive size={12} /> Font Size
          </label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              min={6} max={36}
              value={style.fontSize ?? ""}
              onChange={e => {
                const n = parseInt(e.target.value);
                onStyleChange(selectedKey, "fontSize", isNaN(n) ? undefined : n);
              }}
              placeholder="auto"
              className="w-20 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 dark:text-zinc-200 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400 dark:text-zinc-500">pt</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {FONT_SIZES.map(s => (
              <button
                key={s}
                onClick={() => onStyleChange(selectedKey, "fontSize", style.fontSize === s ? undefined : s)}
                className={`text-[10px] px-1.5 py-0.5 rounded border font-mono transition-colors ${
                  style.fontSize === s
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Weight / Italic / Transform */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2 block">
            Style Overrides
          </label>
          <div className="flex flex-wrap gap-2">
            {/* Bold variants */}
            {(["600","bold","800","900"] as const).map(w => (
              <button
                key={w}
                onClick={() => onStyleChange(selectedKey, "fontWeight", style.fontWeight === w ? undefined : w)}
                style={{ fontWeight: w }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  style.fontWeight === w
                    ? "bg-gray-800 text-white dark:bg-zinc-200 dark:text-zinc-900 border-gray-800 dark:border-zinc-200"
                    : "border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:border-gray-400"
                }`}
              >
                {w === "bold" ? "Bold" : w === "600" ? "Semi" : w === "800" ? "Extra" : "Black"}
              </button>
            ))}
            {/* Normal / reset weight */}
            {style.fontWeight && (
              <button
                onClick={() => onStyleChange(selectedKey, "fontWeight", undefined)}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-red-400 hover:text-red-500 transition-colors"
              >
                Normal
              </button>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            {/* Italic */}
            <button
              onClick={() => onStyleChange(selectedKey, "fontStyle", style.fontStyle === "italic" ? undefined : "italic")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded border transition-colors italic ${
                style.fontStyle === "italic"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:border-blue-400"
              }`}
            >
              <Italic size={11} /> Italic
            </button>
            {/* UPPERCASE */}
            <button
              onClick={() => onStyleChange(selectedKey, "textTransform",
                style.textTransform === "uppercase" ? "none" : "uppercase")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded border transition-colors ${
                style.textTransform === "uppercase"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:border-blue-400"
              }`}
            >
              AA UPPER
            </button>
            {/* lowercase */}
            <button
              onClick={() => onStyleChange(selectedKey, "textTransform",
                style.textTransform === "lowercase" ? "none" : "lowercase")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded border transition-colors ${
                style.textTransform === "lowercase"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:border-blue-400"
              }`}
            >
              aa lower
            </button>
          </div>
        </div>

        {/* Clear / Reset style for this label */}
        <button
          onClick={() => onClearStyle(selectedKey)}
          className="w-full text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 border border-red-200 dark:border-red-900 rounded-lg py-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          Reset Style for This Label
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InvoiceTemplatePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [labels,      setLabels]      = useState<InvoiceLabels>(() => getInvoiceLabels());
  const [labelStyles, setLabelStyles] = useState<LabelStyles>(() => getInvoiceLabelStyles());
  const [dirty,       setDirty]       = useState(false);
  const [company]                     = useState<AppSettings>(() => getSettings());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const markDirty = () => setDirty(true);

  const update = useCallback((key: keyof InvoiceLabels, value: string) => {
    setLabels(prev => prev[key] === value ? prev : { ...prev, [key]: value });
    markDirty();
  }, []);

  const updateStyle = useCallback((key: string, prop: keyof LabelStyle, val: LabelStyle[keyof LabelStyle] | undefined) => {
    setLabelStyles(prev => {
      const cur = prev[key] ?? {};
      const next = { ...cur, [prop]: val };
      // Clean up undefined/none values
      if (val === undefined || val === "none") delete (next as Record<string, unknown>)[prop];
      return { ...prev, [key]: next };
    });
    markDirty();
  }, []);

  const clearStyle = useCallback((key: string) => {
    setLabelStyles(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    markDirty();
  }, []);

  const handleSave = () => {
    const settings = getSettings();
    saveSettings({ ...settings, invoiceLabels: labels, invoiceLabelStyles: labelStyles });
    setDirty(false);
    toast({ title: "Template saved", description: "Labels and styles updated on all invoices." });
  };

  const handleReset = () => {
    setLabels({ ...DEFAULT_INVOICE_LABELS });
    setLabelStyles({});
    setDirty(true);
    toast({ title: "Reset to defaults", description: "Click Save to apply." });
  };

  const handleDeselect = () => setSelectedKey(null);

  // Sample data
  const sym = company.defaultCurrency === "GBP" ? "£" : "PKR ";

  // Helper: renders an EditLabel in the preview
  const lbl = (key: keyof InvoiceLabels) => (
    <EditLabel
      labelKey={key}
      value={labels[key]}
      onChange={update}
      labelStyle={labelStyles[key]}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
    />
  );

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-zinc-950" onClick={handleDeselect}>
      {/* ── Toolbar ── */}
      <div className="sticky top-0 z-30 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/settings")}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900 dark:text-zinc-100">Invoice Label Editor</h1>
            <p className="text-xs text-gray-500 dark:text-zinc-400 flex items-center gap-1">
              <MousePointer2 size={10} />
              Click any <span className="bg-yellow-100 dark:bg-yellow-900/40 rounded px-1 text-yellow-800 dark:text-yellow-300 font-medium">highlighted</span> label to select · edit text or styling in the panel →
            </p>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <RotateCcw size={13} /> Reset All
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shadow-sm ${
              dirty ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-700 cursor-default"
            }`}
          >
            <Save size={13} /> {dirty ? "Save *" : "Saved"}
          </button>
        </div>
      </div>

      {/* ── Main: invoice + properties panel ── */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-5 items-start" onClick={e => e.stopPropagation()}>

        {/* Invoice Preview */}
        <div className="flex-1 min-w-0">
          <div className="bg-white dark:bg-zinc-950 shadow-xl rounded-2xl overflow-hidden text-[13px] leading-snug text-gray-800 dark:text-zinc-200 font-sans border border-gray-200 dark:border-zinc-700">

            {/* Header */}
            <div className="bg-[#0f2447] text-white px-8 py-5 flex items-start justify-between">
              <div>
                <div className="text-xl font-extrabold tracking-tight">{company.companyName || "Your Company"}</div>
                <div className="text-xs text-slate-400 mt-1">{company.companyTagline || ""}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-extrabold tracking-widest text-slate-300 uppercase">
                  {lbl("invoiceTitle")}
                </div>
                <div className="text-xs text-blue-300 mt-1">INV-202604-001</div>
              </div>
            </div>

            {/* Bill To + Meta strip */}
            <div className="flex gap-0 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex-1 px-8 py-5 border-r border-gray-100 dark:border-zinc-800">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2">
                  {lbl("billTo")}
                </div>
                <div className="font-bold text-lg text-gray-900 dark:text-zinc-100">Abdul</div>
                <div className="text-gray-500 dark:text-zinc-400 mt-0.5 text-xs">+92 333 1234567</div>
                <div className="text-gray-500 dark:text-zinc-400 text-xs">123 Main Road, Lahore</div>
                <div className="text-gray-500 dark:text-zinc-400 text-xs">Lahore</div>
                <div className="text-xs text-gray-600 dark:text-zinc-400 mt-0.5">
                  <strong>Sales Officer:</strong> Abdul Qayyum
                </div>
              </div>
              <div className="px-8 py-5 min-w-[220px] space-y-2">
                {([
                  ["invoiceDateLabel", "05 Apr 2026"],
                  ["dueDateLabel",     "05 May 2026"],
                  ["paymentViaLabel",  "Bank Transfer"],
                ] as [keyof InvoiceLabels, string][]).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center gap-4">
                    <span className="text-gray-400 dark:text-zinc-500 text-xs">{lbl(key)}</span>
                    <span className="font-semibold text-xs text-gray-800 dark:text-zinc-200">{val}</span>
                  </div>
                ))}
                <div className="mt-2 inline-block border border-gray-300 dark:border-zinc-600 rounded px-3 py-0.5 text-xs font-bold text-gray-500 dark:text-zinc-400">DRAFT</div>
              </div>
            </div>

            {/* Items */}
            <div className="px-8 pt-6 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-[#0f2447] rounded-full" />
                <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                  {lbl("itemsSectionTitle")}
                </span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-800 dark:bg-zinc-900 text-white">
                    {([
                      ["colNum",         "w-8  text-center"],
                      ["colDescription", "text-left px-3"],
                      ["colUnit",        "text-right px-2 w-14"],
                      ["colQty",         "text-right px-2 w-12"],
                      ["colUnitPrice",   "text-right px-2 w-20"],
                      ["colDisc",        "text-right px-2 w-12"],
                      ["colTotal",       "text-right px-2 w-20"],
                    ] as [keyof InvoiceLabels, string][]).map(([key, cls]) => (
                      <th key={key} className={`py-2 font-semibold uppercase tracking-wide ${cls}`}>
                        {lbl(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 dark:border-zinc-800">
                    <td className="py-2.5 text-center text-gray-400">1</td>
                    <td className="py-2.5 px-3 font-medium">Sample Product</td>
                    <td className="py-2.5 px-2 text-right text-gray-500">pcs</td>
                    <td className="py-2.5 px-2 text-right">2</td>
                    <td className="py-2.5 px-2 text-right">{sym}500.00</td>
                    <td className="py-2.5 px-2 text-right text-gray-400">—</td>
                    <td className="py-2.5 px-2 text-right font-semibold">{sym}1,000.00</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-8 pb-6 pt-4 flex justify-end">
              <div className="w-56 space-y-0.5 text-xs">
                {([
                  ["subtotalLabel",   `${sym}1,000.00`, "text-gray-500", false],
                  ["vatLabel",        `${sym}200.00`,   "text-gray-500", false],
                  ["deliveryLabel",   `${sym}50.00`,    "text-gray-500", false],
                  ["otherChargesLabel",`${sym}30.00`,   "text-gray-500", false],
                ] as [keyof InvoiceLabels, string, string, boolean][]).map(([key, val, cls]) => (
                  <div key={key} className={`flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 ${cls}`}>
                    <span>{lbl(key)}</span><span>{val}</span>
                  </div>
                ))}
                <div className="bg-[#0f2447] text-white flex justify-between items-center px-3 py-2 rounded-md mt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{lbl("totalLabel")}</span>
                  <span className="text-base font-black">{sym}1,280.00</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 text-gray-500 mt-1">
                  <span>{lbl("amountPaidLabel")}</span><span className="text-emerald-600">−{sym}0.00</span>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 flex justify-between items-center px-3 py-2 rounded-md font-bold text-amber-800 dark:text-amber-300">
                  <span>{lbl("balanceDueLabel")}</span>
                  <span>{sym}1,280.00</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 text-gray-500 mt-1">
                  <span>{lbl("previousBalanceLabel")}</span><span>{sym}5,000.00</span>
                </div>
                <div className="bg-slate-800 dark:bg-zinc-900 text-white flex justify-between items-center px-3 py-2 rounded-md border-t-2 border-double border-slate-500">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{lbl("newBalanceLabel")}</span>
                  <span className="text-sm font-black">{sym}6,280.00</span>
                </div>
              </div>
            </div>

            {/* Terms & sections */}
            <div className="border-t border-gray-100 dark:border-zinc-800 px-8 py-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-[#0f2447] rounded-full" />
                <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                  {lbl("termsSectionTitle")}
                </span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
              </div>
              {(["paymentTermsTitle","additionalNotesTitle","agreementTitle"] as const).map(key => (
                <div key={key} className="flex items-center gap-2 ml-3">
                  <div className="w-0.5 h-3.5 bg-blue-300 dark:bg-blue-700 rounded-full" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-zinc-400">
                    {lbl(key)}
                  </span>
                </div>
              ))}
              {(["paymentHistoryTitle","bankDetailsTitle"] as const).map(key => (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#0f2447] rounded-full" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                    {lbl(key)}
                  </span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="bg-[#0f2447] text-center px-8 py-3 text-[10px] text-slate-400">
              {lbl("footerNote")}
            </div>
          </div>

          {/* Bottom save bar */}
          {dirty && (
            <div className="mt-4 flex items-center justify-between bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700 rounded-xl px-5 py-3">
              <span className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">You have unsaved changes.</span>
              <div className="flex gap-2">
                <button onClick={handleReset} className="px-3 py-1.5 rounded-lg text-sm text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors">
                  Reset
                </button>
                <button onClick={handleSave} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm">
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Properties Panel (right) ── */}
        <div className="w-72 flex-shrink-0 sticky top-[61px] space-y-3">
          {selectedKey ? (
            <PropertiesPanel
              selectedKey={selectedKey as keyof InvoiceLabels}
              labels={labels}
              labelStyles={labelStyles}
              onTextChange={update}
              onStyleChange={updateStyle}
              onClearStyle={clearStyle}
              onDeselect={handleDeselect}
            />
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-700 p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mx-auto">
                <MousePointer2 size={18} className="text-gray-400 dark:text-zinc-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Select a Label</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5 leading-relaxed">
                  Click any yellow-highlighted label in the invoice preview to edit its text, colour, font size, and style.
                </p>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-4 text-xs text-gray-500 dark:text-zinc-400 space-y-2">
            <p className="font-bold text-gray-700 dark:text-zinc-300 text-[11px] uppercase tracking-wider">How it works</p>
            <p><span className="inline-block bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded px-1 font-medium">Yellow</span> — hover to see editable labels</p>
            <p><span className="inline-block bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded px-1 font-medium">Blue ring</span> — currently selected label</p>
            <p>Changes apply to <strong className="text-gray-700 dark:text-zinc-300">all printed invoices</strong> instantly after saving.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
