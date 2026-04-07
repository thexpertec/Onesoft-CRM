import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Save, BookOpen, CheckCircle, XCircle, ChevronDown,
  Search, FileText, AlertTriangle, RotateCcw, Eye, EyeOff, Pencil,
} from "lucide-react";
import { useAccounts } from "@/hooks/use-data";
import { useJournalEntries } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { Account, JournalEntry } from "@/lib/store";

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

// ─── Ledger Dropdown ─────────────────────────────────────────────────────────

function LedgerDropdown({
  accounts,
  value,
  onChange,
  onClose,
  openUp,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
  openUp: boolean;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className={`absolute z-50 ${openUp ? "bottom-full mb-1" : "top-full mt-1"} left-0 w-80 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-2xl overflow-hidden`}>
      <div className="p-2 border-b border-gray-100 dark:border-zinc-800">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search ledger…"
            className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-gray-400">No ledgers found</div>
        ) : (
          filtered.map(a => {
            const trail = buildTrail(accounts, a);
            const isSelected = a.id === value;
            return (
              <button
                key={a.id}
                onClick={() => { onChange(a.id); onClose(); }}
                className={`w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
              >
                <div className={`text-[12px] font-semibold ${isSelected ? "text-blue-600" : "text-gray-900 dark:text-gray-100"}`}>
                  <span className="font-mono text-[10px] text-gray-400 mr-1.5">{a.code}</span>
                  {a.name}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-zinc-500 blur-[0.4px] opacity-70 mt-0.5 truncate">
                  {trail}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JournalEntryPage() {
  const { accounts } = useAccounts();
  const { entries, addEntry, editEntry, removeEntry } = useJournalEntries();
  const { toast } = useToast();

  const ledgers = useMemo(() => accounts.filter(a => a.accountType === "Ledger" && a.isActive), [accounts]);

  // ── Entry header state ────────────────────────────────────────────────────
  const [date, setDate]        = useState(today);
  const [reference, setRef]    = useState(() => nextRef([]));
  const [description, setDesc] = useState("");

  // ── Rows ──────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, emptyRow));

  // ── Active cell & ledger dropdown ─────────────────────────────────────────
  const [openLedger, setOpenLedger]   = useState<string | null>(null); // rowId
  const [ledgerOpenUp, setOpenUp]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        : [emptyRow(), emptyRow()],
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Saved entries panel ───────────────────────────────────────────────────
  const [showSaved, setShowSaved] = useState(true);
  const [viewEntry, setViewEntry] = useState<string | null>(null);

  // Reset reference when entries change
  useEffect(() => {
    setRef(nextRef(entries));
  }, [entries]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenLedger(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    setRows([emptyRow(), emptyRow()]);
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
      toast({ title: `Entry is unbalanced — difference: ${diff.toFixed(2)}`, variant: "destructive" }); return;
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

          {/* Editing mode banner */}
          {editingEntryId && (() => {
            const orig = entries.find(e => e.id === editingEntryId);
            return (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
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
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700">
                  <th className="w-9 px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider" style={{ minWidth: 260 }}>Ledger</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Narration</th>
                  <th className="w-32 px-3 py-2 text-right text-[10px] font-bold text-blue-500 uppercase tracking-wider">Dr.</th>
                  <th className="w-32 px-3 py-2 text-right text-[10px] font-bold text-orange-500 uppercase tracking-wider">Cr.</th>
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
                      <td className="px-2 py-1 align-top relative" ref={isOpen ? dropdownRef : undefined}>
                        <button
                          onClick={(e) => {
                            if (isOpen) { setOpenLedger(null); return; }
                            const rect = e.currentTarget.getBoundingClientRect();
                            setOpenUp(window.innerHeight - rect.bottom < 300);
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
                        {isOpen && (
                          <LedgerDropdown
                            accounts={accounts}
                            value={row.ledgerId}
                            onChange={id => setRow(row.id, "ledgerId", id)}
                            onClose={() => setOpenLedger(null)}
                            openUp={ledgerOpenUp}
                          />
                        )}
                      </td>

                      {/* Narration */}
                      <td className="px-2 py-1 align-top">
                        <input
                          value={row.narration}
                          onChange={e => setRow(row.id, "narration", e.target.value)}
                          placeholder="Line narration…"
                          className="w-full px-2.5 py-2 rounded-lg text-[12px] text-gray-700 dark:text-gray-300 placeholder-gray-300 dark:placeholder-zinc-600 bg-transparent hover:bg-white dark:hover:bg-zinc-800 border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 focus:border-blue-400 focus:bg-blue-50/30 dark:focus:bg-blue-950/10 outline-none transition-colors"
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
                          className="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono text-right text-blue-700 dark:text-blue-400 placeholder-gray-200 dark:placeholder-zinc-700 bg-transparent hover:bg-blue-50/40 dark:hover:bg-blue-950/10 border border-transparent hover:border-blue-200 dark:hover:border-blue-900 focus:border-blue-400 focus:bg-blue-50/50 outline-none transition-colors"
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
                          className="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono text-right text-orange-600 dark:text-orange-400 placeholder-gray-200 dark:placeholder-zinc-700 bg-transparent hover:bg-orange-50/40 dark:hover:bg-orange-950/10 border border-transparent hover:border-orange-200 dark:hover:border-orange-900 focus:border-orange-400 focus:bg-orange-50/50 outline-none transition-colors"
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
        </div>

        {/* ── Saved Entries ────────────────────────────────────────────────── */}
        {showSaved && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/40">
              <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Saved Entries <span className="font-normal text-gray-400 normal-case">({entries.length})</span>
              </h2>
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
                    {[...entries].reverse().map((e, ei) => (
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
                                onClick={ev => { ev.stopPropagation(); removeEntry(e.id); if (viewEntry === e.id) setViewEntry(null); if (editingEntryId === e.id) clearAll(); }}
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
    </div>
  );
}
