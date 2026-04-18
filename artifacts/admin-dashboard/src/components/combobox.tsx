import { useState, useRef, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";

export interface ComboOption {
  value: string;
  label: string;
  sub?: string;
  tag?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  maxResults?: number;
  autoFocus?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
}

export function Combobox({
  value, onChange, onSelect, options, placeholder,
  className, inputClassName, maxResults = 10,
  autoFocus, onBlur, onKeyDown, disabled, id,
  "data-testid": testId,
}: ComboboxProps) {
  const [open, setOpen]               = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);

  const q = value.toLowerCase().trim();
  const filtered = q.length === 0
    ? options.slice(0, maxResults)
    : options
        .filter(o =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q) ||
          (o.sub?.toLowerCase().includes(q))
        )
        .slice(0, maxResults);

  useEffect(() => { setHighlighted(0); }, [value]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlighted] as HTMLLIElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  // Reposition dropdown when open
  useEffect(() => {
    if (!open || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropH = Math.min(224, filtered.length * 44);
    const above = spaceBelow < dropH + 8 && rect.top > dropH + 8;
    setDropdownStyle({
      position: "fixed",
      top:    above ? rect.top - dropH - 4 : rect.bottom + 4,
      left:   rect.left,
      width:  Math.max(rect.width, 240),
      zIndex: 9999,
    });
  }, [open, filtered.length]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const select = useCallback((opt: ComboOption) => {
    onChange(opt.value);
    onSelect?.(opt);
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
      if (!open) setOpen(true);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" && open && filtered[highlighted]) {
      e.preventDefault();
      select(filtered[highlighted]);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    onKeyDown?.(e);
  };

  const dropdown = open && filtered.length > 0
    ? ReactDOM.createPortal(
        <ul
          ref={listRef}
          role="listbox"
          style={dropdownStyle}
          className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-md shadow-xl overflow-y-auto max-h-56 text-sm"
        >
          {filtered.map((opt, i) => (
            <li
              key={`${opt.value}-${i}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => { e.preventDefault(); select(opt); }}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
                i === highlighted
                  ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                  : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[13px] truncate">{opt.label}</div>
                {opt.sub && (
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{opt.sub}</div>
                )}
              </div>
              {opt.tag && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 shrink-0 whitespace-nowrap mt-0.5">{opt.tag}</span>
              )}
            </li>
          ))}
        </ul>,
        document.body
      )
    : null;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        id={id}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        data-testid={testId}
        autoComplete="off"
        spellCheck={false}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => { setOpen(false); onBlur?.(); }, 160); }}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      {dropdown}
    </div>
  );
}
