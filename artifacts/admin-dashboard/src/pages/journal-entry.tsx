import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, Save, BookOpen, CheckCircle, XCircle, ChevronDown, ChevronUp,
  Search, FileText, AlertTriangle, RotateCcw, Eye, EyeOff, Pencil, ShieldAlert,
} from "lucide-react";
import { useAccounts } from "@/hooks/use-data";
import { useJournalEntries } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { Account, JournalEntry, purgeOrphanedVoucherJEs } from "@/lib/store";
import { getSettingsDecimalPlaces } from "@/lib/currencies";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const dp = getSettingsDecimalPlaces();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextRef(entries: { reference: string }[]): string {
  const nums = entries
    .map(e => parseInt(e.reference.replace(/\D/g, ""), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `JE-${String(next).padStart(4, "0")}`;
}

function fmt(n: number): string {
  if (n === 0) return "";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildTrail(accounts: Account[], ledger: Account): string {
  const chain: string[] = [ledger.head];
  let cur = ledger.parentId ? accounts.find(a => a.id === ledger.parentId) : null;
  while (cur) {
    chain.push(cur.name);
    cur = cur.parentId ? accounts.find(a => a.id === cur!.parentId) : null;
  }
  return chain.join(" › ");
}

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  ledgerId: string;
  narration: string;
  debit: string;
  credit: string;
};

function emptyRow(): Row {
  return { id: crypto.randomUUID(), ledgerId: "", narration: "", debit: "", credit: "" };
}

// ─── Ledger Dropdown (viewport-fixed via portal) ─────────────────────────────
// Renders into document.body so it is never clipped by overflow:auto containers
// and never buried under sticky table headers.

function LedgerDropdown({
  accounts,
  value,
  anchor,
  onChange,
  onClose,
}: {
  accounts: Account[];
  value: string;
  anchor: DOMRect;
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ]       = useState("");
  const inputRef        = useRef<HTMLInputElement>(null);
  const panelRef        = useRef<HTMLDivElement>(null);
  const PANEL_HEIGHT    = 340; // max panel height (px)
  const PANEL_WIDTH     = 300;

  const ledgers = useMemo(
    () => accounts.filter(a => a.accountType === "Ledger" && a.isActive),
    [accounts],
  );

  const filtered = useMemo(() => {
    if (!q) return ledgers;
    const lq = q.toLowerCase();
    return ledgers.filter(
      a => a.name.toLowerCase().includes(lq) || a.code.toLowerCase().includes(lq),
    );
  }, [ledgers, q]);

  // Auto-focus search on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on outside mousedown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Decide open direction and compute fixed coords
  const spaceBelow = window.innerHeight - anchor.bottom;
  const openUp     = spaceBelow < PANEL_HEIGHT && anchor.top > PANEL_HEIGHT;

  // Clamp left so panel doesn't overflow viewport right edge
  const rawLeft = anchor.left;
  const left    = Math.min(rawLeft, window.innerWidth - PANEL_WIDTH - 8);

  const posStyle: React.CSSProperties = openUp
    ? { position: "fixed", left, bottom: window.innerHeight - anchor.top + 4, width: Math.max(anchor.width, PANEL_WIDTH), zIndex: 9999 }
    : { position: "fixed", left, top: anchor.bottom + 4, width: Math.max(anchor.width, PANEL_WIDTH), zIndex: 9999 };

  return createPortal(
    <div
      ref={panelRef}
      style={posStyle}
      className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-2xl overflow-hidden"
    >
      <div className="p-2 border-b border-gray-100 dark:border-zinc-800">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search ledger…"
            className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-none bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-gray-400">No ledgers found</div>
        ) : (
          filtered.map(a => {
            const trail      = buildTrail(accounts, a);
            const isSelected = a.id === value;
            return (
              <button
                key={a.id}
                onMouseDown={e => { e.preventDefault(); onChange(a.id); onClose(); }}
                className={`w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
              >
                <div className={`text-[12px] font-semibold ${isSelected ? "text-blue-600" : "text-gray-900 dark:text-gray-100"}`}>
                  <span className="font-mono text-[10px] text-gray-400 mr-1.5">{a.code}</span>
                  {a.name}
                </div>
                {trail && (
                  <div className="text-[10px] text-gray-400 dark:text-zinc-500 opacity-70 mt-0.5 truncate">
                    {trail}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JournalEntryPage() {
  const { accounts } = useAccounts();
  const { entries, addEntry, editEntry, removeEntry, refresh: refreshEntries } = useJournalEntries();
  const { toast } = useToast();
  const dp = getSettingsDecimalPlaces();

  const ledgers = useMemo(() => accounts.filter(a => a.accountType === "Ledger" && a.isActive), [accounts]);

  // ── Form collapsed state (collapsed by default) ───────────────────────────
  const [formOpen, setFormOpen] = useState(false);

  // ── Entry header state ────────────────────────────────────────────────────
  const [date, setDate]        = useState(today);
  const [reference, setRef]    = useState(() => nextRef([]));
  const [description, setDesc] = useState("");

  // ── Rows ──────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, emptyRow));

  // ── Active cell & ledger dropdown ─────────────────────────────────────────
  const [openLedger,    setOpenLedger]    = useState<string | null>(null); // rowId
  const [dropdownAnchor, setDropdownAnchor] = useState<DOMRect | null>(null);

  // ── Editing existing entry ────────────────────────────────────────────────
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const loadEntryForEdit = useCallback((entry: JournalEntry) => {
    setEditingEntryId(entry.id);
    setDate(entry.date);
    setRef(entry.reference);
    setDesc(entry.description);
    setRows(
      entry.lines.length > 0
        ? entry.lines.map(l => ({
            id: crypto.randomUUID(),
            ledgerId: l.ledgerId,
            narration: l.narration,
            debit:  l.debit  > 0 ? String(l.debit)  : "",
            credit: l.credit > 0 ? String(l.credit) : "",
          }))
        : Array.from({ length: 10 }, emptyRow),
    );
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Saved entries panel ───────────────────────────────────────────────────
  const rawSearch = useSearch();
  const [showSaved, setShowSaved] = useState(true);
  const [listSearch, setListSearch] = useState(() => new URLSearchParams(rawSearch).get("q") || "");
  const [viewEntry, setViewEntry] = useState<string | null>(null);
  const [deleteJeId, setDeleteJeId] = useState<string | null>(null);

  // Auto-open from URL param: ?open=<journalEntryId>  (from ledger / transaction-history)
  useEffect(() => {
    const openId = new URLSearchParams(rawSearch).get("open");
    if (!openId) return;
    const entry = entries.find(e => e.id === openId);
    if (entry) loadEntryForEdit(entry);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fix Data: purge orphaned voucher JEs ─────────────────────────────────
  const handleFixData = useCallback(() => {
    const removed = purgeOrphanedVoucherJEs();
    refreshEntries();                          // repaint list immediately
    if (removed === 0) {
      toast({ title: "No orphans found", description: "All journal entries are linked to valid vouchers.", duration: 3000 });
    } else {
      toast({ title: `Fixed: removed ${removed} orphaned JE${removed > 1 ? "s" : ""}`, description: "Journal entries for deleted vouchers have been cleaned up and saved.", duration: 4000 });
    }
  }, [toast, refreshEntries]);

  // Reset reference when entries change
  useEffect(() => {
    setRef(nextRef(entries));
  }, [entries]);


  // ── Row helpers ───────────────────────────────────────────────────────────
  const setRow = useCallback(<K extends keyof Row>(id: string, key: K, val: Row[K]) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [key]: val } : r));
  }, []);

  const setDebit = useCallback((id: string, val: string) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, debit: val, credit: val ? "" : r.credit } : r));
  }, []);

  const setCredit = useCallback((id: string, val: string) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, credit: val, debit: val ? "" : r.debit } : r));
  }, []);

  const addRow = () => setRows(rs => [...rs, emptyRow()]);

  const removeRow = (id: string) => {
    if (rows.length <= 2) {
      setRows(rs => rs.map(r => r.id === id ? emptyRow() : r));
    } else {
      setRows(rs => rs.filter(r => r.id !== id));
    }
  };

  const clearAll = () => {
    setEditingEntryId(null);
    setDate(today());
    setRef(nextRef(entries));
    setDesc("");
    setRows(Array.from({ length: 10 }, emptyRow));
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalDr   = rows.reduce((s, r) => s + (parseFloat(r.debit)  || 0), 0);
  const totalCr   = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
  const diff      = Math.abs(totalDr - totalCr);
  const balanced  = diff < 0.005 && (totalDr > 0 || totalCr > 0);
  const hasLines  = rows.some(r => r.ledgerId && (parseFloat(r.debit) || parseFloat(r.credit)));

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback((status: "draft" | "posted") => {
    const validLines = rows.filter(r => r.ledgerId && (parseFloat(r.debit) > 0 || parseFloat(r.credit) > 0));
    if (validLines.length < 2) {
      toast({ title: "At least 2 ledger entries required", variant: "destructive" }); return;
    }
    if (!balanced && status === "posted") {
      toast({ title: `Entry is unbalanced — difference: ${diff.toFixed(dp)}`, variant: "destructive" }); return;
    }
    const lines = validLines.map(r => ({
      id: crypto.randomUUID(),
      ledgerId: r.ledgerId,
      narration: r.narration,
      debit:  parseFloat(r.debit)  || 0,
      credit: parseFloat(r.credit) || 0,
    }));
    const payload = { date, reference, description, lines, status, totalDebit: totalDr, totalCredit: totalCr, isBalanced: balanced };
    if (editingEntryId) {
      editEntry(editingEntryId, payload);
      toast({ title: status === "posted" ? "Entry updated & posted" : "Draft updated" });
    } else {
      addEntry(payload);
      toast({ title: status === "posted" ? "Journal entry posted" : "Saved as draft" });
    }
    clearAll();
  }, [rows, date, reference, description, balanced, totalDr, totalCr, addEntry, editEntry, editingEntryId, toast, diff]);

  // ── Ledger lookup ─────────────────────────────────────────────────────────
  const ledgerById = useCallback((id: string) => accounts.find(a => a.id === id), [accounts]);

  // ── View entry ────────────────────────────────────────────────────────────
  const viewing = viewEntry ? entries.find(e => e.id === viewEntry) : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <BookOpen size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">Journal Entry</h1>
              <p className="text-[11px] text-gray-400">Double-entry bookkeeping</p>
            </div>
          </div>
          <button
            onClick={() => setShowSaved(s => !s)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {showSaved ? <EyeOff size={13} /> : <Eye size={13} />}
            {showSaved ? "Hide" : "Show"} saved ({entries.length})
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* ── Entry form card ─────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">

          {/* Collapsible header — always visible */}
          <button
            type="button"
            onClick={() => setFormOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-zinc-800/60 transition-colors text-left"
          >
            <div className="flex items-center gap-2.5">
              <Plus size={14} className={`transition-transform ${formOpen ? "rotate-45" : ""} text-blue-600`} />
              <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
                {editingEntryId
                  ? `Editing: ${entries.find(e => e.id === editingEntryId)?.reference ?? "entry"}`
                  : "New Journal Entry"}
              </span>
              {!formOpen && (
                <span className="text-[11px] text-muted-foreground font-normal">
                  — click to expand
                </span>
              )}
            </div>
            {formOpen
              ? <ChevronUp size={14} className="text-gray-400 shrink-0" />
              : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
          </button>

          {/* Editing mode banner — only shown when expanded */}
          {formOpen && editingEntryId && (() => {
            const orig = entries.find(e => e.id === editingEntryId);
            return (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-t border-b border-amber-200 dark:border-amber-800">
                <Pencil size={12} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  Editing: {orig?.reference ?? "entry"}
                </span>
                <span className="text-[11px] text-amber-600 dark:text-amber-500 opacity-70">
                  — make changes and click Update Draft or Update &amp; Post
                </span>
                <button
                  onClick={clearAll}
                  className="ml-auto text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 flex items-center gap-1"
                >
                  <XCircle size={11} /> Cancel
                </button>
              </div>
            );
          })()}

          {/* Collapsible body */}
          {formOpen && (<>

          {/* Entry metadata row */}
          <div className="grid grid-cols-3 gap-0 border-b border-gray-100 dark:border-zinc-800">
            <div className="px-4 py-3 border-r border-gray-100 dark:border-zinc-800">
              <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full text-[13px] font-semibold text-gray-900 dark:text-gray-100 bg-transparent outline-none focus:ring-0 border-0 p-0"
              />
            </div>
            <div className="px-4 py-3 border-r border-gray-100 dark:border-zinc-800">
              <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reference #</label>
              <input
                value={reference}
                onChange={e => setRef(e.target.value)}
                className="w-full text-[13px] font-mono font-semibold text-blue-600 bg-transparent outline-none focus:ring-0 border-0 p-0"
              />
            </div>
            <div className="px-4 py-3">
              <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description / Narration</label>
              <input
                value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="Overall journal description…"
                className="w-full text-[13px] text-gray-900 dark:text-gray-100 bg-transparent outline-none focus:ring-0 border-0 p-0 placeholder-gray-300 dark:placeholder-zinc-600"
              />
            </div>
          </div>

          {/* ── Excel grid ──────────────────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 720 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700">
                  <th className="w-9 px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">#</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider" style={{ minWidth: 260 }}>Account / Ledger</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Narration</th>
                  <th className="w-32 px-3 py-2.5 text-right text-[10px] font-bold text-blue-500 uppercase tracking-wider">Dr.</th>
                  <th className="w-32 px-3 py-2.5 text-right text-[10px] font-bold text-orange-500 uppercase tracking-wider">Cr.</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const ledger = row.ledgerId ? ledgerById(row.ledgerId) : null;
                  const trail  = ledger ? buildTrail(accounts, ledger) : null;
                  const isOpen = openLedger === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-100 dark:border-zinc-800 group ${idx % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"} hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors`}
                    >
                      {/* # */}
                      <td className="px-3 py-1 text-[11px] text-gray-400 font-mono align-top pt-3">{idx + 1}</td>

                      {/* Ledger */}
                      <td className="px-2 py-1 align-top">
                        <button
                          onClick={(e) => {
                            if (isOpen) { setOpenLedger(null); setDropdownAnchor(null); return; }
                            setDropdownAnchor(e.currentTarget.getBoundingClientRect());
                            setOpenLedger(row.id);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                            isOpen
                              ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                              : "border-transparent hover:border-gray-200 dark:hover:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800"
                          }`}
                        >
                          {ledger ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-gray-400">{ledger.code}</span>
                                <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">{ledger.name}</span>
                                <ChevronDown size={11} className="ml-auto text-gray-400 flex-shrink-0" />
                              </div>
                              {trail && (
                                <div className="text-[9px] text-gray-400 dark:text-zinc-500 opacity-60 blur-[0.3px] truncate mt-0.5">
                                  {trail}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] text-gray-300 dark:text-zinc-600">Select ledger account…</span>
                              <ChevronDown size={11} className="ml-auto text-gray-300 flex-shrink-0" />
                            </div>
                          )}
                        </button>
                        {isOpen && dropdownAnchor && (
                          <LedgerDropdown
                            accounts={accounts}
                            value={row.ledgerId}
                            anchor={dropdownAnchor}
                            onChange={id => setRow(row.id, "ledgerId", id)}
                            onClose={() => { setOpenLedger(null); setDropdownAnchor(null); }}
                          />
                        )}
                      </td>

                      {/* Narration */}
                      <td className="px-2 py-1 align-top">
                        <input
                          value={row.narration}
                          onChange={e => setRow(row.id, "narration", e.target.value)}
                          placeholder="Line narration…"
                          className="w-full px-2.5 py-2 rounded-none text-[12px] text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-zinc-600 bg-transparent hover:bg-white dark:hover:bg-zinc-800 border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:bg-blue-50/30 dark:focus:bg-blue-950/10 outline-none transition-colors"
                        />
                      </td>

                      {/* Dr. */}
                      <td className="px-2 py-1 align-top">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.debit}
                          onChange={e => setDebit(row.id, e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-2 rounded-none text-[12px] font-mono text-right text-blue-700 dark:text-blue-400 placeholder-gray-200 dark:placeholder-zinc-700 bg-transparent hover:bg-blue-50/40 dark:hover:bg-blue-950/10 border border-transparent hover:border-blue-200 dark:hover:border-blue-900 focus:border-blue-400 focus:bg-blue-50/50 outline-none transition-colors"
                        />
                      </td>

                      {/* Cr. */}
                      <td className="px-2 py-1 align-top">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.credit}
                          onChange={e => setCredit(row.id, e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-2 rounded-none text-[12px] font-mono text-right text-orange-600 dark:text-orange-400 placeholder-gray-200 dark:placeholder-zinc-700 bg-transparent hover:bg-orange-50/40 dark:hover:bg-orange-950/10 border border-transparent hover:border-orange-200 dark:hover:border-orange-900 focus:border-orange-400 focus:bg-orange-50/50 outline-none transition-colors"
                        />
                      </td>

                      {/* Delete row */}
                      <td className="pr-2 align-top pt-2">
                        <button
                          onClick={() => removeRow(row.id)}
                          className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* ── Totals footer ─────────────────────────────────────────── */}
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/40">
                  <td />
                  <td className="px-3 py-2.5">
                    <button
                      onClick={addRow}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                    >
                      <Plus size={12} /> Add Row
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Totals</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-[13px] font-bold font-mono ${totalDr > 0 ? "text-blue-700 dark:text-blue-400" : "text-gray-300"}`}>
                      {totalDr > 0 ? fmt(totalDr) : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-[13px] font-bold font-mono ${totalCr > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-300"}`}>
                      {totalCr > 0 ? fmt(totalCr) : "—"}
                    </span>
                  </td>
                  <td />
                </tr>

              </tfoot>
            </table>
          </div>

          {/* ── Action bar (full-width, outside the scroll area) ──────────── */}
          <div className={`flex items-center justify-between px-4 py-2.5 border-t ${
            balanced
              ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20"
              : hasLines
              ? "border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/20"
              : "border-gray-100 dark:border-zinc-800 bg-gray-50/30 dark:bg-zinc-800/20"
          }`}>
            {/* Status indicator */}
            <div>
              {balanced ? (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle size={13} />
                  <span className="text-[11px] font-bold">Entry is balanced — Dr equals Cr</span>
                </div>
              ) : hasLines ? (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle size={13} />
                  <span className="text-[11px] font-bold">Unbalanced — difference: {fmt(diff)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-400 dark:text-zinc-500">
                  <FileText size={13} />
                  <span className="text-[11px]">Enter amounts above to start</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-zinc-800 hover:border-gray-300 transition-colors whitespace-nowrap"
              >
                <RotateCcw size={11} />
                {editingEntryId ? "Cancel Edit" : "Reset"}
              </button>
              <button
                onClick={() => handleSave("draft")}
                disabled={!hasLines}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg border border-gray-300 dark:border-zinc-600 text-[12px] font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Save size={11} />
                {editingEntryId ? "Update Draft" : "Save Draft"}
              </button>
              <button
                onClick={() => handleSave("posted")}
                disabled={!balanced}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-[12px] font-bold transition-colors disabled:cursor-not-allowed whitespace-nowrap shadow-sm"
              >
                <CheckCircle size={11} />
                {editingEntryId ? "Update & Post" : "Post Entry"}
              </button>
            </div>
          </div>
          </>)}
        </div>

        {/* ── Saved Entries ────────────────────────────────────────────────── */}
        {showSaved && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/40">
              <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider shrink-0">
                Saved Entries <span className="font-normal text-gray-400 normal-case">({entries.length})</span>
              </h2>
              <div className="relative flex-1 max-w-xs">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  placeholder="Search ref, description…"
                  className="w-full pl-7 pr-7 py-1.5 text-[12px] border border-gray-200 dark:border-zinc-700 rounded-none bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {listSearch && <button onClick={() => setListSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><span className="text-[10px]">✕</span></button>}
              </div>
              <button
                onClick={handleFixData}
                title="Remove journal entries that were left behind by deleted vouchers (fixes Balance Sheet / COA totals)"
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-amber-200 dark:border-amber-700 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-800/30 transition-colors whitespace-nowrap shrink-0"
              >
                <ShieldAlert size={12} />
                Fix Data
              </button>
            </div>

            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300 dark:text-zinc-600">
                <BookOpen size={36} className="mb-3 opacity-40" />
                <p className="text-[13px] font-medium">No journal entries yet</p>
                <p className="text-[11px] mt-1 opacity-60">Post or save a draft to see it here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-zinc-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-2 text-left">Ref</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-right">Total Dr.</th>
                      <th className="px-4 py-2 text-right">Total Cr.</th>
                      <th className="px-4 py-2 text-center">Status</th>
                      <th className="px-4 py-2 text-center">Balanced</th>
                      <th className="w-20 px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...entries].reverse().filter(e => !listSearch || [e.reference, e.description].some(v => v?.toLowerCase().includes(listSearch.toLowerCase()))).map((e, ei) => (
                      <React.Fragment key={e.id}>
                        <tr
                          className={`border-b border-gray-100 dark:border-zinc-800 group cursor-pointer transition-colors ${
                            viewEntry === e.id ? "bg-blue-50 dark:bg-blue-950/20" : ei % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"
                          } hover:bg-blue-50/40 dark:hover:bg-blue-950/10`}
                          onClick={() => setViewEntry(viewEntry === e.id ? null : e.id)}
                        >
                          <td className="px-4 py-2.5 font-mono text-[11px] font-bold text-blue-600">{e.reference}</td>
                          <td className="px-4 py-2.5 text-[12px] text-gray-600 dark:text-gray-300">{e.date}</td>
                          <td className="px-4 py-2.5 text-[12px] text-gray-700 dark:text-gray-200 max-w-[200px] truncate">{e.description || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-blue-700 dark:text-blue-400">{fmt(e.totalDebit)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-orange-600 dark:text-orange-400">{fmt(e.totalCredit)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              e.status === "posted"
                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                            }`}>
                              {e.status === "posted" ? "Posted" : "Draft"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {e.isBalanced
                              ? <CheckCircle size={13} className="text-emerald-500 mx-auto" />
                              : <XCircle    size={13} className="text-red-400    mx-auto" />}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                title="View lines"
                                onClick={ev => { ev.stopPropagation(); setViewEntry(viewEntry === e.id ? null : e.id); }}
                                className="p-1.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                              >
                                <Eye size={12} />
                              </button>
                              <button
                                title="Edit entry"
                                onClick={ev => { ev.stopPropagation(); loadEntryForEdit(e); }}
                                className={`p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors ${
                                  editingEntryId === e.id
                                    ? "text-amber-600 bg-amber-50 dark:bg-amber-950/20"
                                    : "text-gray-400 hover:text-amber-500"
                                }`}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                title="Delete entry"
                                onClick={ev => { ev.stopPropagation(); setDeleteJeId(e.id); }}
                                className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded lines view ───────────────────────────── */}
                        {viewEntry === e.id && (
                          <tr key={`${e.id}-detail`}>
                            <td colSpan={8} className="px-0 py-0">
                              <div className="mx-4 mb-3 mt-1 rounded-lg border border-blue-200 dark:border-blue-900 overflow-hidden">
                                <table className="w-full border-collapse">
                                  <thead>
                                    <tr className="bg-blue-50 dark:bg-blue-950/30 text-[9px] font-bold text-blue-500 uppercase tracking-wider">
                                      <th className="px-3 py-1.5 text-left">Ledger</th>
                                      <th className="px-3 py-1.5 text-left">Narration</th>
                                      <th className="px-3 py-1.5 text-right w-28">Dr.</th>
                                      <th className="px-3 py-1.5 text-right w-28">Cr.</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {e.lines.map(l => {
                                      const ledger = ledgerById(l.ledgerId);
                                      const trail  = ledger ? buildTrail(accounts, ledger) : null;
                                      return (
                                        <tr key={l.id} className="border-t border-blue-100 dark:border-blue-900/50">
                                          <td className="px-3 py-2">
                                            {ledger ? (
                                              <>
                                                <div className="flex items-center gap-1.5">
                                                  <span className="font-mono text-[10px] text-gray-400">{ledger.code}</span>
                                                  <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-200">{ledger.name}</span>
                                                </div>
                                                {trail && (
                                                  <div className="text-[9px] text-gray-400 opacity-60 blur-[0.3px] truncate mt-0.5">{trail}</div>
                                                )}
                                              </>
                                            ) : (
                                              <span className="text-[11px] text-gray-400 italic">Unknown ledger</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">{l.narration || "—"}</td>
                                          <td className="px-3 py-2 text-right font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                                            {l.debit > 0 ? fmt(l.debit) : ""}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                                            {l.credit > 0 ? fmt(l.credit) : ""}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                                      <td colSpan={2} className="px-3 py-1.5 text-[10px] font-bold text-gray-400 text-right">Totals</td>
                                      <td className="px-3 py-1.5 text-right font-mono text-[11px] font-bold text-blue-700 dark:text-blue-400">{fmt(e.totalDebit)}</td>
                                      <td className="px-3 py-1.5 text-right font-mono text-[11px] font-bold text-orange-600 dark:text-orange-400">{fmt(e.totalCredit)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delete JE confirm ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteJeId} onOpenChange={o => !o && setDeleteJeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete journal entry?</AlertDialogTitle>
            <AlertDialogDescription>This journal entry will be permanently removed. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!deleteJeId) return;
                removeEntry(deleteJeId);
                if (viewEntry === deleteJeId) setViewEntry(null);
                if (editingEntryId === deleteJeId) clearAll();
                setDeleteJeId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
