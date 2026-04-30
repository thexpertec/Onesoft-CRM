import { useState, useRef, useEffect } from "react";
import { Star } from "lucide-react";
import { Combobox, ComboOption } from "@/components/combobox";

// ─── Preset colours (shared with products page) ────────────────────────────────
export const PRESET_COLORS = [
  { hex: "#3b82f6", label: "Blue"    },
  { hex: "#6366f1", label: "Indigo"  },
  { hex: "#8b5cf6", label: "Violet"  },
  { hex: "#ec4899", label: "Pink"    },
  { hex: "#f43f5e", label: "Rose"    },
  { hex: "#ef4444", label: "Red"     },
  { hex: "#f97316", label: "Orange"  },
  { hex: "#f59e0b", label: "Amber"   },
  { hex: "#10b981", label: "Emerald" },
  { hex: "#14b8a6", label: "Teal"    },
  { hex: "#06b6d4", label: "Cyan"    },
  { hex: "#64748b", label: "Slate"   },
];

// ─── Column definition ────────────────────────────────────────────────────────
export interface ColDef {
  field: string;
  label: string;
  minW: number;
  type: "text" | "email" | "tel" | "number" | "date" | "select" | "stars" | "color" | "readonly";
  options?: string[];
  optionColors?: Record<string, string>; // tailwind classes per option value
}

// ─── Shared constants ─────────────────────────────────────────────────────────
export const CELL_H = 36;

// ─── EditableCell ─────────────────────────────────────────────────────────────
export function EditableCell({
  value,
  col,
  active,
  canEdit,
  onActivate,
  onCommit,
  onCancel,
  onTab,
  onEnter,
  suggestions,
  wrapText,
}: {
  value: string;
  col: ColDef;
  active: boolean;
  canEdit: boolean;
  onActivate: () => void;
  onCommit: (v: string) => void;
  onCancel: () => void;
  onTab: (shift: boolean) => void;
  onEnter: () => void;
  suggestions?: ComboOption[];
  wrapText?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef  = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (active) {
      setDraft(value);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
        selectRef.current?.focus();
      }, 0);
    }
  }, [active]);

  const commit = (v?: string) => onCommit(v ?? draft);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    else if (e.key === "Enter") { e.preventDefault(); commit(); onEnter(); }
    else if (e.key === "Tab") { e.preventDefault(); commit(); onTab(e.shiftKey); }
  };

  // ── Readonly ─────────────────────────────────────────────────────────────
  if (col.type === "readonly") {
    return (
      <div className={`w-full flex px-3 text-[12px] text-muted-foreground select-none ${wrapText ? "py-2 items-start break-words" : "h-full items-center truncate"}`}>
        {value}
      </div>
    );
  }

  // ── Active edit ───────────────────────────────────────────────────────────
  if (active && canEdit) {
    if (col.type === "select") {
      return (
        <div className="relative w-full h-full">
          <select
            ref={selectRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); commit(e.target.value); }}
            onBlur={() => commit()}
            onKeyDown={handleKey}
            className="absolute inset-0 w-full h-full px-2 text-[13px] bg-white dark:bg-card border-0 outline-none cursor-pointer"
          >
            {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }

    if (col.type === "stars") {
      const num = parseInt(draft) || 0;
      return (
        <div className="w-full h-full flex items-center px-2 gap-0.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => { const v = n === num ? "0" : String(n); setDraft(v); commit(v); }}
              className="focus:outline-none hover:scale-110 transition-transform"
            >
              <Star size={15} className={n <= num ? "fill-amber-400 text-amber-400" : "fill-transparent text-gray-300 dark:text-gray-600"} />
            </button>
          ))}
        </div>
      );
    }

    if (col.type === "color") {
      return (
        <div className="w-full h-full flex items-center px-2 gap-1 flex-wrap overflow-hidden">
          {PRESET_COLORS.map(c => (
            <button
              key={c.hex}
              type="button"
              title={c.label}
              onClick={() => { setDraft(c.hex); commit(c.hex); }}
              className={`w-4 h-4 rounded-full border-2 transition-all hover:scale-110 ${draft === c.hex ? "border-gray-700 dark:border-gray-300 scale-110" : "border-transparent"}`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      );
    }

    if (suggestions && suggestions.length > 0 && (col.type === "text" || col.type === "email" || col.type === "tel")) {
      return (
        <div className="absolute inset-0 flex items-center">
          <Combobox
            value={draft}
            onChange={v => setDraft(v)}
            onSelect={opt => { setDraft(opt.value); commit(opt.value); }}
            options={suggestions}
            autoFocus
            className="w-full h-full"
            inputClassName="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground"
            onBlur={() => commit()}
            onKeyDown={e => {
              if (e.key === "Escape") { e.preventDefault(); onCancel(); }
              else if (e.key === "Enter") { e.preventDefault(); commit(); onEnter(); }
              else if (e.key === "Tab") { e.preventDefault(); commit(); onTab(e.shiftKey); }
            }}
          />
        </div>
      );
    }
    return (
      <input
        ref={inputRef}
        type={col.type === "text" ? "text" : col.type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={handleKey}
        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground"
        style={{ boxSizing: "border-box" }}
      />
    );
  }

  // ── Display ───────────────────────────────────────────────────────────────
  const clickProps = canEdit
    ? { onClick: onActivate, className: "cursor-text" }
    : { className: "cursor-default" };

  if (col.type === "select" && col.optionColors) {
    return (
      <div {...clickProps} className={`w-full h-full flex items-center px-3 ${clickProps.className}`}>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${col.optionColors[value] || "bg-gray-100 text-gray-600"}`}>
          {value || "—"}
        </span>
      </div>
    );
  }

  if (col.type === "stars") {
    const num = parseInt(value) || 0;
    return (
      <div {...clickProps} className={`w-full h-full flex items-center px-3 gap-0.5 ${clickProps.className}`}>
        {num === 0
          ? <span className="text-[12px] text-gray-300 dark:text-muted-foreground/30">—</span>
          : [1, 2, 3, 4, 5].map(n => (
              <Star key={n} size={12} className={n <= num ? "fill-amber-400 text-amber-400" : "fill-transparent text-gray-200 dark:text-gray-600"} />
            ))}
      </div>
    );
  }

  if (col.type === "color") {
    return (
      <div {...clickProps} className={`w-full h-full flex items-center px-3 gap-2 ${clickProps.className}`}>
        {value
          ? <><span className="w-4 h-4 rounded-full flex-shrink-0 ring-1 ring-black/10" style={{ backgroundColor: value }} />
             <span className="text-[12px] text-muted-foreground truncate">{PRESET_COLORS.find(c => c.hex === value)?.label ?? value}</span></>
          : <span className="text-[13px] text-gray-300">—</span>}
      </div>
    );
  }

  if (wrapText) {
    return (
      <div
        {...clickProps}
        className={`w-full flex items-start px-3 py-2 text-[13px] ${clickProps.className}`}
      >
        <span className={`break-words min-w-0 w-full leading-snug ${!value ? "text-gray-300 dark:text-muted-foreground/30" : "text-gray-700 dark:text-foreground"}`}>
          {value || (canEdit ? "—" : "")}
        </span>
      </div>
    );
  }

  return (
    <div {...clickProps} className={`w-full h-full flex items-center px-3 text-[13px] overflow-hidden ${clickProps.className}`}>
      <span className={`truncate ${!value ? "text-gray-300 dark:text-muted-foreground/30" : "text-gray-700 dark:text-foreground"}`}>
        {value || (canEdit ? "—" : "")}
      </span>
    </div>
  );
}

// ─── Grid shell — sticky header + scrollable body + resizable columns ─────────
export function ExcelGridShell({
  cols,
  totalMinW,
  tableId,
  children,
  extraLeadingCol,
  extraAfterNumberCol,
}: {
  cols: ColDef[];
  totalMinW: number;
  tableId?: string;
  children: React.ReactNode;
  extraLeadingCol?: { width: number; header?: React.ReactNode };
  extraAfterNumberCol?: { width: number; header?: React.ReactNode };
}) {
  const storageKey = tableId ? `onesoft-col-widths:${tableId}` : null;

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const stored: Record<string, number> = storageKey
      ? (() => { try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}"); } catch { return {}; } })()
      : {};
    const result: Record<string, number> = {};
    cols.forEach(c => { result[c.field] = stored[c.field] ?? c.minW; });
    return result;
  });

  const widthsRef = useRef(widths);
  useEffect(() => { widthsRef.current = widths; }, [widths]);

  const startResize = (e: React.MouseEvent, field: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthsRef.current[field] ?? 80;

    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(40, startW + (ev.clientX - startX));
      setWidths(prev => ({ ...prev, [field]: newW }));
    };

    const onUp = () => {
      if (storageKey) try { sessionStorage.setItem(storageKey, JSON.stringify(widthsRef.current)); } catch { /* quota */ }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const dynamicTotal = cols.reduce((s, c) => s + (widths[c.field] ?? c.minW), 0);

  return (
    <div
      className="rounded-xl border border-gray-200 dark:border-border overflow-auto bg-white dark:bg-card shadow-sm"
      style={{ maxHeight: "calc(100vh - 290px)" }}
    >
      <table
        className="border-collapse text-[13px] w-full"
        style={{ tableLayout: "fixed", minWidth: `${Math.max(totalMinW, dynamicTotal) + 48 + 90 + (extraLeadingCol?.width ?? 0) + (extraAfterNumberCol?.width ?? 0)}px` }}
      >
        <colgroup>
          {extraLeadingCol && <col style={{ width: `${extraLeadingCol.width}px` }} />}
          <col style={{ width: "48px" }} />
          {extraAfterNumberCol && <col style={{ width: `${extraAfterNumberCol.width}px` }} />}
          {cols.map(c => <col key={c.field} style={{ width: `${widths[c.field] ?? c.minW}px` }} />)}
          <col style={{ width: "90px" }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr>
            {extraLeadingCol && (
              <th className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 py-2 select-none" style={{ width: `${extraLeadingCol.width}px` }}>
                {extraLeadingCol.header ?? null}
              </th>
            )}
            <th className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-400 text-center py-2 select-none">#</th>
            {extraAfterNumberCol && (
              <th className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-400 text-center py-2 select-none" style={{ width: `${extraAfterNumberCol.width}px` }}>
                {extraAfterNumberCol.header ?? null}
              </th>
            )}
            {cols.map(c => (
              <th
                key={c.field}
                className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-left px-3 py-2 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide whitespace-nowrap select-none relative group"
              >
                <span className="pr-1">{c.label}</span>
                {/* resize handle */}
                <div
                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-20 flex items-center justify-end"
                  onMouseDown={e => startResize(e, c.field)}
                  title="Drag to resize"
                >
                  <div className="w-[3px] h-4 rounded-full bg-gray-300 dark:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </th>
            ))}
            <th className="border-b border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-400 text-center py-2 select-none sticky right-0">Actions</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ─── New-row amber highlight ──────────────────────────────────────────────────
export const NEW_ROW_BG = "bg-amber-50/60 dark:bg-amber-950/20";
export const NEW_ROW_ID = "__new__";
