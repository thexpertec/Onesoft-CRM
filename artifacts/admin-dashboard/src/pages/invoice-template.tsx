import { useState, useEffect, useRef, useCallback, CSSProperties } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Save, RotateCcw, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getSettings, saveSettings,
  InvoiceLabels, DEFAULT_INVOICE_LABELS, getInvoiceLabels,
} from "@/lib/store";

// ─── Inline-editable label ────────────────────────────────────────────────────
function EditLabel({
  labelKey, value, onChange, className = "", style = {},
}: {
  labelKey: keyof InvoiceLabels;
  value: string;
  onChange: (k: keyof InvoiceLabels, v: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastValue = useRef(value);

  // Keep DOM in sync with value only when it differs from last known value
  // (e.g. after a reset) without overwriting while user is typing
  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.textContent = value;
      lastValue.current = value;
    }
  }, [value]);

  // Set initial value on mount
  useEffect(() => {
    if (ref.current) ref.current.textContent = value;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      title="Click to edit this label"
      style={style}
      onBlur={e => {
        const text = e.currentTarget.textContent?.trim() || "";
        lastValue.current = text;
        onChange(labelKey, text);
      }}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLSpanElement).blur(); } }}
      className={`outline-none cursor-text rounded px-0.5 transition-all
        hover:bg-yellow-100 dark:hover:bg-yellow-900/30 hover:ring-1 hover:ring-yellow-400
        focus:bg-yellow-100 dark:focus:bg-yellow-900/30 focus:ring-1 focus:ring-yellow-500
        ${className}`}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InvoiceTemplatePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [labels, setLabels] = useState<InvoiceLabels>(() => getInvoiceLabels());
  const [dirty, setDirty] = useState(false);

  const update = useCallback((key: keyof InvoiceLabels, value: string) => {
    setLabels(prev => {
      if (prev[key] === value) return prev;
      setDirty(true);
      return { ...prev, [key]: value };
    });
  }, []);

  const handleSave = () => {
    const settings = getSettings();
    saveSettings({ ...settings, invoiceLabels: labels });
    setDirty(false);
    toast({ title: "Template saved", description: "Your invoice labels have been updated." });
  };

  const handleReset = () => {
    setLabels({ ...DEFAULT_INVOICE_LABELS });
    setDirty(true);
    toast({ title: "Reset to defaults", description: "Click Save to apply." });
  };

  // Sample data for the preview
  const sym = "PKR ";

  const lbl = (key: keyof InvoiceLabels) => (
    <EditLabel labelKey={key} value={labels[key]} onChange={update} />
  );

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-zinc-900">
      {/* ── Toolbar ── */}
      <div className="sticky top-0 z-30 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/print-templates")}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900 dark:text-zinc-100">Invoice Template Labels</h1>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              <Pencil size={10} className="inline mr-1" />
              Click any <span className="bg-yellow-100 dark:bg-yellow-900/40 rounded px-1 text-yellow-800 dark:text-yellow-300 font-medium">yellow-highlighted</span> label below to edit it. Press Enter or click away to confirm.
            </p>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shadow-sm ${dirty ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-700 cursor-default"}`}
          >
            <Save size={13} /> Save{dirty ? " *" : "d"}
          </button>
        </div>
      </div>

      {/* ── Invoice Preview ── */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-zinc-950 shadow-xl rounded-2xl overflow-hidden text-[13px] leading-snug text-gray-800 dark:text-zinc-200 font-sans border border-gray-200 dark:border-zinc-700">

          {/* Header */}
          <div className="bg-[#0f2447] text-white px-8 py-5 flex items-start justify-between">
            <div>
              <div className="text-xl font-extrabold tracking-tight">Onesoft</div>
              <div className="text-xs text-slate-400 mt-1">Software & IT Solutions</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold tracking-widest text-slate-300 uppercase">TAX INVOICE</div>
              <div className="text-xs text-blue-300 mt-1">INV-202604-001</div>
            </div>
          </div>

          {/* Bill To + Meta strip */}
          <div className="flex gap-0 border-b border-gray-100 dark:border-zinc-800">
            {/* Bill To */}
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
            {/* Meta strip */}
            <div className="px-8 py-5 min-w-[220px] space-y-2">
              {[
                ["invoiceDateLabel", "05 Apr 2026"],
                ["dueDateLabel",     "05 May 2026"],
                ["paymentViaLabel",  "Bank Transfer"],
              ].map(([key, val]) => (
                <div key={key} className="flex justify-between items-center gap-4">
                  <span className="text-gray-400 dark:text-zinc-500 text-xs">{lbl(key as keyof InvoiceLabels)}</span>
                  <span className="font-semibold text-xs text-gray-800 dark:text-zinc-200">{val}</span>
                </div>
              ))}
              <div className="mt-2 inline-block border border-gray-300 dark:border-zinc-600 rounded px-3 py-0.5 text-xs font-bold text-gray-500 dark:text-zinc-400">DRAFT</div>
            </div>
          </div>

          {/* Items & Services */}
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
                  {[
                    ["colNum",         "w-8  text-center", ""],
                    ["colDescription", "text-left px-3",   ""],
                    ["colUnit",        "text-right px-2",  "w-14"],
                    ["colQty",         "text-right px-2",  "w-12"],
                    ["colUnitPrice",   "text-right px-2",  "w-20"],
                    ["colDisc",        "text-right px-2",  "w-12"],
                    ["colTotal",       "text-right px-2",  "w-20"],
                  ].map(([key, cls]) => (
                    <th key={key} className={`py-2 font-semibold uppercase tracking-wide ${cls}`}>
                      {lbl(key as keyof InvoiceLabels)}
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
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 text-gray-500">
                <span>{lbl("subtotalLabel")}</span><span>{sym}1,000.00</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 text-gray-500">
                <span>{lbl("vatLabel")} (20%)</span><span>{sym}200.00</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 text-gray-500">
                <span>{lbl("deliveryLabel")}</span><span>{sym}50.00</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 text-gray-500">
                <span>{lbl("otherChargesLabel")}</span><span>{sym}30.00</span>
              </div>
              {/* Total */}
              <div className="bg-[#0f2447] text-white flex justify-between items-center px-3 py-2 rounded-md mt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {lbl("totalLabel")}
                </span>
                <span className="text-base font-black">{sym}1,280.00</span>
              </div>
              {/* Amount Paid */}
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 text-gray-500 mt-1">
                <span>{lbl("amountPaidLabel")}</span><span className="text-emerald-600">−{sym}0.00</span>
              </div>
              {/* Balance Due */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 flex justify-between items-center px-3 py-2 rounded-md font-bold text-amber-800 dark:text-amber-300">
                <span>{lbl("balanceDueLabel")}</span>
                <span>{sym}1,280.00</span>
              </div>
              {/* Previous Balance */}
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-zinc-800 text-gray-500 mt-1">
                <span>{lbl("previousBalanceLabel")}</span><span>{sym}5,000.00</span>
              </div>
              {/* New Balance */}
              <div className="bg-slate-800 dark:bg-zinc-900 text-white flex justify-between items-center px-3 py-2 rounded-md border-t-2 border-double border-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {lbl("newBalanceLabel")}
                </span>
                <span className="text-sm font-black">{sym}6,280.00</span>
              </div>
            </div>
          </div>

          {/* Terms & Notes headings */}
          <div className="border-t border-gray-100 dark:border-zinc-800 px-8 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#0f2447] rounded-full" />
              <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                {lbl("termsSectionTitle")}
              </span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
            </div>
            {(["paymentTermsTitle", "additionalNotesTitle", "agreementTitle"] as const).map(key => (
              <div key={key} className="flex items-center gap-2 ml-3">
                <div className="w-0.5 h-3.5 bg-blue-300 dark:bg-blue-700 rounded-full" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-zinc-400">
                  {lbl(key)}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#0f2447] rounded-full" />
              <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                {lbl("paymentHistoryTitle")}
              </span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#0f2447] rounded-full" />
              <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-zinc-300">
                {lbl("bankDetailsTitle")}
              </span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
            </div>
          </div>

          {/* Footer hint */}
          <div className="bg-gray-50 dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 px-8 py-3 text-[10px] text-gray-400 dark:text-zinc-600 text-center">
            Footer · contact info · legal note (controlled from Print Templates settings)
          </div>
        </div>

        {/* Bottom save bar */}
        {dirty && (
          <div className="mt-4 flex items-center justify-between bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700 rounded-xl px-5 py-3">
            <span className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">You have unsaved label changes.</span>
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
    </div>
  );
}
