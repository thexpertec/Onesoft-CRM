import React, { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { useSearch } from "wouter";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, Save, CheckCircle, Search, FileText, ArrowDownCircle,
  ArrowUpCircle, X, Pencil, ChevronDown, Eye, AlertTriangle, CreditCard,
  User, Phone, Building2, Hash,
} from "lucide-react";
import { FormModeToggle, useFormMode } from "@/components/form-wrapper";
import { useRPVouchers, useAccounts } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { RPVoucher, RPVoucherLine, Account, getInvoices, Invoice } from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

function fmtAmt(n: number, sym: string): string {
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildTrail(accounts: Account[], acc: Account): string {
  const chain: string[] = [];
  let cur: Account | undefined = acc;
  while (cur) {
    chain.unshift(cur.name);
    cur = cur.parentId ? accounts.find(a => a.id === cur!.parentId) : undefined;
  }
  return chain.join(" › ");
}

/**
 * Returns true when `acc` or any of its ancestors is a "Cash & Bank" group.
 * Matches by name (case-insensitive) so it works regardless of COA code scheme.
 */
function isUnderCashBank(accounts: Account[], acc: Account): boolean {
  let cur: Account | undefined = acc;
  while (cur) {
    const n = (cur.name || "").toLowerCase();
    if (n.includes("cash") && n.includes("bank")) return true;
    cur = cur.parentId ? accounts.find(a => a.id === cur!.parentId) : undefined;
  }
  return false;
}

// ─── Account Dropdown (portal-based to avoid clipping) ───────────────────────

// ─── Invoice Search Dropdown ──────────────────────────────────────────────────

interface InvoiceSearchDropdownProps {
  value: string | null;
  onChange: (inv: Invoice) => void;
  disabled?: boolean;
  invoiceTypeFilter?: "sale" | "purchase";
}

function InvoiceSearchDropdown({ value, onChange, disabled, invoiceTypeFilter = "sale" }: InvoiceSearchDropdownProps) {
  const [open, setOpen]   = useState(false);
  const [q, setQ]         = useState("");
  const trigRef           = useRef<HTMLButtonElement>(null);
  const listRef           = useRef<HTMLDivElement>(null);
  const [pos, setPos]     = useState({ top: 0, left: 0, width: 0 });

  const invoices = useMemo(() => {
    const all = getInvoices().filter(inv => {
      const isPurchase = inv.invoiceType === "purchase";
      if (invoiceTypeFilter === "purchase" ? !isPurchase : isPurchase) return false;
      return inv.status !== "paid" && inv.status !== "cancelled";
    });
    const sq = q.toLowerCase().trim();
    if (!sq) return all;
    return all.filter(inv =>
      inv.invoiceNumber.toLowerCase().includes(sq) ||
      inv.customer.toLowerCase().includes(sq) ||
      (inv.salesOfficer || "").toLowerCase().includes(sq)
    );
  }, [q, invoiceTypeFilter]);

  const selected = value ? getInvoices().find(i => i.id === value) : null;

  const openDropdown = () => {
    if (!trigRef.current || disabled) return;
    const r = trigRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX, width: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!trigRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const STATUS_COLOR: Record<string, string> = {
    draft:    "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400",
    sent:     "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    overdue:  "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    partial:  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  };

  return (
    <>
      <button
        ref={trigRef} type="button"
        onClick={open ? () => setOpen(false) : openDropdown}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-[7px] text-sm ring-offset-background hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? `${selected.invoiceNumber} — ${selected.customer}` : invoiceTypeFilter === "purchase" ? "Search purchase invoice by number…" : "Search invoice by number…"}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {value && !disabled && (
            <span onClick={e => { e.stopPropagation(); onChange({ id: "" } as any); }}
              className="text-muted-foreground hover:text-destructive p-0.5">
              <X className="h-3 w-3" />
            </span>
          )}
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </button>

      {open && createPortal(
        <div
          ref={listRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="rounded-md border border-input bg-popover shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/60">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus className="flex-1 text-sm bg-transparent outline-none"
                placeholder="Invoice number, customer…" value={q}
                onChange={e => setQ(e.target.value)}
              />
              {q && <button onClick={() => setQ("")}><X className="h-3 w-3 text-muted-foreground" /></button>}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {invoices.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {q ? "No invoices match" : invoiceTypeFilter === "purchase" ? "No purchase invoices found" : "No receivable invoices found"}
              </div>
            ) : invoices.map(inv => {
              const outstanding = (() => {
                const total = inv.items.reduce((s, it) => {
                  const qty = parseFloat(it.qty) || 0, price = parseFloat(it.unitPrice) || 0;
                  const disc = parseFloat(it.discount) || 0;
                  const sub = qty * price - (it.discountMode === "pct" ? qty * price * disc / 100 : disc);
                  return s + sub;
                }, 0);
                const tax = total * (parseFloat(inv.taxRate) || 0) / 100;
                const grand = total + tax + (parseFloat(inv.shippingFee) || 0) + (parseFloat(inv.handlingFee) || 0);
                const paid = parseFloat(inv.amountPaid) || 0;
                return grand - paid;
              })();
              return (
                <button key={inv.id} type="button"
                  onClick={() => { onChange(inv); setOpen(false); setQ(""); }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-accent/60 transition-colors border-b border-border/40 last:border-0 ${inv.id === value ? "bg-primary/10" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{inv.invoiceNumber}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[inv.status] ?? STATUS_COLOR.draft}`}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-between">
                    <span>{inv.customer}{inv.salesOfficer ? ` · ${inv.salesOfficer}` : ""}</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">Due: {outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Account Dropdown (portal-based to avoid clipping) ───────────────────────

interface AccDropdownProps {
  accounts: Account[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  filterCashBank?: boolean;
  filterCurrentAssets?: boolean;
  filterCashBankOnly?: boolean;
  excludeIds?: string[];
}

function AccDropdown({ accounts, value, onChange, placeholder = "Select account…", filterCashBank = false, filterCurrentAssets = false, filterCashBankOnly = false, excludeIds = [] }: AccDropdownProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState("");
  const trigRef         = useRef<HTMLButtonElement>(null);
  const listRef         = useRef<HTMLDivElement>(null);
  const [pos, setPos]   = useState({ top: 0, left: 0, width: 0 });

  const ledgers = useMemo(() => {
    let base = accounts.filter(a => a.accountType === "Ledger" && a.isActive !== false);
    if (filterCashBankOnly) {
      // Restrict to ledgers whose parent chain includes a "Cash & Bank" group account.
      base = base.filter(a => isUnderCashBank(accounts, a));
    } else if (filterCashBank) {
      base = base.filter(a => isUnderCashBank(accounts, a));
    } else if (filterCurrentAssets) {
      base = base.filter(a =>
        a.head === "Assets" && !a.subType?.toLowerCase().includes("fixed")
      );
    }
    // exclude already-used accounts (but always keep the currently selected one visible)
    if (excludeIds.length > 0) {
      base = base.filter(a => a.id === value || !excludeIds.includes(a.id));
    }
    const sq = q.toLowerCase().trim();
    if (sq) base = base.filter(a =>
      a.name.toLowerCase().includes(sq) ||
      (a.code || "").toLowerCase().includes(sq)
    );
    return base;
  }, [accounts, q, filterCashBank, filterCashBankOnly, filterCurrentAssets, excludeIds, value]);

  const selected = accounts.find(a => a.id === value);

  const openDropdown = useCallback(() => {
    if (!trigRef.current) return;
    const r = trigRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX, width: r.width });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!trigRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <>
      <button
        ref={trigRef} type="button"
        onClick={open ? () => setOpen(false) : openDropdown}
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-[7px] text-sm ring-offset-background hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? `${selected.code ? selected.code + " · " : ""}${selected.name}` : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
      </button>

      {open && createPortal(
        <div
          ref={listRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="rounded-md border border-input bg-popover shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/60">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus className="flex-1 text-sm bg-transparent outline-none"
                placeholder="Search…" value={q} onChange={e => setQ(e.target.value)}
              />
              {q && <button onClick={() => setQ("")}><X className="h-3 w-3 text-muted-foreground" /></button>}
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {ledgers.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No accounts found</div>
            ) : ledgers.map(a => (
              <button
                key={a.id} type="button"
                onClick={() => { onChange(a.id, a.name); setOpen(false); setQ(""); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/60 transition-colors ${a.id === value ? "bg-primary/10 text-primary font-medium" : ""}`}
              >
                <div className="font-medium">{a.code ? `${a.code} · ` : ""}{a.name}</div>
                <div className="text-[11px] text-muted-foreground">{buildTrail(accounts, a)}</div>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Line row ─────────────────────────────────────────────────────────────────

type LineRow = {
  id: string;
  accountId: string;
  accountName: string;
  description: string;
  amount: string;
};

function emptyLine(): LineRow {
  return { id: crypto.randomUUID(), accountId: "", accountName: "", description: "", amount: "" };
}

// ─── Voucher Form Dialog ───────────────────────────────────────────────────────

interface VoucherFormProps {
  accounts: Account[];
  initial: Partial<RPVoucher> | null;
  defaultType: "receipt" | "payment";
  onClose: () => void;
  onSave: (data: Omit<RPVoucher, "id" | "voucherNumber" | "createdAt" | "updatedAt">, post: boolean) => void;
  onPost: (id: string) => void;
  onDelete: (id: string) => void;
  sym: string;
}

function VoucherForm({ accounts, initial, defaultType, onClose, onSave, onPost, onDelete, sym }: VoucherFormProps) {
  const isEdit   = !!initial?.id;
  const isPosted = initial?.status === "posted";
  const [formLayoutMode, toggleFormLayoutMode] = useFormMode("rp-form-mode");

  const [vtype,   setVtype]   = useState<"receipt" | "payment">(initial?.voucherType ?? defaultType);
  const [date,    setDate]    = useState(initial?.date ?? todayStr());
  const [party,   setParty]   = useState(initial?.partyName ?? "");
  const [cbId,    setCbId]    = useState(initial?.cashBankAccountId ?? "");
  const [cbName,  setCbName]  = useState(initial?.cashBankAccountName ?? "");
  const [ref,     setRef]     = useState(initial?.reference ?? "");
  const [narr,    setNarr]    = useState(initial?.narration ?? "");
  const [lines,   setLines]   = useState<LineRow[]>(() =>
    initial?.lines?.length
      ? initial.lines.map(l => ({ id: l.id, accountId: l.accountId, accountName: l.accountName, description: l.description, amount: String(l.amount) }))
      : [emptyLine()]
  );
  const [linkedInvId, setLinkedInvId] = useState<string | null>(initial?.linkedInvoiceId ?? null);
  const linkedInv = linkedInvId ? getInvoices().find(i => i.id === linkedInvId) ?? null : null;

  const invBalance = useMemo(() => {
    if (!linkedInv) return null;
    const subtotal = (linkedInv.items || []).reduce((s, it) => {
      const qty   = parseFloat(it.qty) || 0;
      const price = parseFloat(it.unitPrice) || 0;
      const disc  = parseFloat(it.discount) || 0;
      const line  = qty * price - (it.discountMode === "pct" ? qty * price * disc / 100 : disc);
      return s + line;
    }, 0);
    const tax   = subtotal * (parseFloat(linkedInv.taxRate) || 0) / 100;
    const grand = subtotal + tax + (parseFloat(linkedInv.shippingFee) || 0) + (parseFloat(linkedInv.handlingFee) || 0);
    const paid  = parseFloat(linkedInv.amountPaid) || 0;
    return Math.max(0, grand - paid);
  }, [linkedInv]);

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const setLine = (id: string, patch: Partial<LineRow>) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));

  const removeLine = (id: string) =>
    setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);

  const buildPayload = (): Omit<RPVoucher, "id" | "voucherNumber" | "createdAt" | "updatedAt"> => ({
    voucherType: vtype,
    date,
    partyName: party,
    cashBankAccountId: cbId,
    cashBankAccountName: cbName,
    reference: ref,
    narration: narr,
    linkedInvoiceId: linkedInvId ?? undefined,
    lines: lines.filter(l => l.accountId && parseFloat(l.amount) > 0).map(l => ({
      id: l.id,
      accountId: l.accountId,
      accountName: l.accountName,
      description: l.description,
      amount: parseFloat(l.amount) || 0,
    })),
    totalAmount: total,
    status: "draft",
  });

  const overBalance = invBalance !== null && total > invBalance + 0.001;

  const validate = (): string | null => {
    if (!date) return "Date is required.";
    const validLines = lines.filter(l => l.accountId && parseFloat(l.amount) > 0);
    if (validLines.length === 0) return "At least one line with an account and amount is required.";
    if (overBalance)
      return `Total (${fmtAmt(total, sym)}) exceeds invoice balance (${fmtAmt(invBalance!, sym)}).`;
    return null;
  };

  const handleSave = (post: boolean) => {
    const err = validate();
    if (err) { alert(err); return; }
    onSave(buildPayload(), post);
  };

  const typeColor = vtype === "receipt" ? "bg-emerald-600" : "bg-rose-600";
  const typeBg    = vtype === "receipt" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-rose-50 dark:bg-rose-950/30";

  const isSheet = formLayoutMode === "sheet";

  return (
    <div className={isSheet
      ? "fixed inset-0 z-50 flex items-end justify-end bg-black/40 backdrop-blur-sm"
      : "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    }>
      <div className={isSheet
        ? "bg-background shadow-2xl w-full max-w-xl h-full flex flex-col overflow-hidden"
        : "bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
      }>

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 ${typeBg} border-b border-border shrink-0`}>
          <div className="flex items-center gap-3">
            {vtype === "receipt"
              ? <ArrowDownCircle className="h-5 w-5 text-emerald-600" />
              : <ArrowUpCircle className="h-5 w-5 text-rose-600" />}
            <div>
              <h2 className="font-semibold text-base">
                {isEdit ? (initial?.voucherNumber ?? "Edit Voucher") : (vtype === "receipt" ? "New Receipt Voucher" : "New Payment Voucher")}
              </h2>
              {isPosted && <span className="text-[11px] text-emerald-600 font-medium">Posted to Journal</span>}
            </div>
          </div>
          <FormModeToggle mode={formLayoutMode} onToggle={toggleFormLayoutMode} onClose={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Type toggle (only for new vouchers) */}
          {!isEdit && (
            <div className="flex gap-2">
              {(["receipt", "payment"] as const).map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setVtype(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${vtype === t ? `${typeColor} text-white border-transparent` : "border-border text-muted-foreground hover:bg-accent/40"}`}
                >
                  {t === "receipt" ? "Receipt (Money In)" : "Payment (Money Out)"}
                </button>
              ))}
            </div>
          )}

          {/* ── Invoice Link (Receipt = sale invoices, Payment = purchase invoices) ── */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                {vtype === "receipt"
                  ? <>Link to Invoice <span className="text-[10px] normal-case font-normal opacity-70">(receivable invoices only)</span></>
                  : <>Link to Invoice (Purchase) <span className="text-[10px] normal-case font-normal opacity-70">(purchase / supplier invoices)</span></>}
              </label>
              <InvoiceSearchDropdown
                value={linkedInvId}
                disabled={isPosted}
                invoiceTypeFilter={vtype === "payment" ? "purchase" : "sale"}
                onChange={inv => {
                  if (!inv?.id) { setLinkedInvId(null); return; }
                  setLinkedInvId(inv.id);
                  if (inv.customer && !party) setParty(inv.customer);
                }}
              />
            </div>
            {linkedInv && (
              <div className={`rounded-lg border px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 ${
                vtype === "payment"
                  ? "border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/20"
                  : "border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20"
              }`}>
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Invoice No.</p>
                    <p className="text-[13px] font-semibold text-foreground">{linkedInv.invoiceNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{vtype === "payment" ? "Supplier" : "Payer Name"}</p>
                    <p className="text-[13px] font-semibold text-foreground">{linkedInv.customer || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone</p>
                    <p className="text-[13px] font-semibold text-foreground">{linkedInv.buyerPhone || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{vtype === "payment" ? "Due Date" : "Company"}</p>
                    <p className="text-[13px] font-semibold text-foreground">
                      {vtype === "payment" ? (linkedInv.dueDate || "—") : (linkedInv.salesOfficer || "—")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Core fields — Date + Balance Due / Due Payable */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Date *</label>
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
                disabled={isPosted}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            {invBalance !== null && (
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  {vtype === "payment" ? "Due Payable" : "Invoice Balance Due"}
                </label>
                <div className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  overBalance
                    ? "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                    : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                }`}>
                  {fmtAmt(invBalance, sym)}
                  {overBalance && <span className="ml-2 text-[11px] font-normal">⚠ Total exceeds balance</span>}
                </div>
              </div>
            )}
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                {vtype === "receipt" ? "Collection Account Lines" : "Payment Account Lines"}
                <span className="ml-1 text-[10px] normal-case font-normal opacity-60">— Cash &amp; Bank only</span>
              </label>
              {!isPosted && (
                <button type="button" onClick={() => setLines(p => [...p, emptyLine()])}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add Line
                </button>
              )}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-widest">
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2">Account</th>
                    <th className="text-left px-3 py-2 w-48">Description</th>
                    <th className="text-right px-3 py-2 w-32">Amount ({sym})</th>
                    {!isPosted && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground text-center text-xs">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        {isPosted
                          ? <span className="px-1">{l.accountName || "—"}</span>
                          : <AccDropdown
                              accounts={accounts}
                              value={l.accountId}
                              onChange={(id, name) => setLine(l.id, { accountId: id, accountName: name })}
                              placeholder="Account…"
                              filterCashBankOnly
                              excludeIds={lines.filter(r => r.id !== l.id && r.accountId).map(r => r.accountId)}
                            />}
                      </td>
                      <td className="px-2 py-1.5">
                        {isPosted
                          ? <span className="px-1">{l.description || "—"}</span>
                          : <input type="text" value={l.description} onChange={e => setLine(l.id, { description: e.target.value })}
                              placeholder="Ref. / Cheque"
                              className="w-full rounded border border-transparent hover:border-input focus:border-ring focus:ring-1 focus:ring-ring px-2 py-1 text-sm bg-transparent outline-none" />}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {isPosted
                          ? <span className="px-1">{fmtAmt(parseFloat(l.amount) || 0, sym)}</span>
                          : <input type="number" min="0" step="0.01" value={l.amount}
                              onChange={e => setLine(l.id, { amount: e.target.value })}
                              className="w-full rounded border border-transparent hover:border-input focus:border-ring focus:ring-1 focus:ring-ring px-2 py-1 text-sm bg-transparent outline-none text-right" />}
                      </td>
                      {!isPosted && (
                        <td className="px-1 py-1.5 text-center">
                          <button type="button" onClick={() => removeLine(l.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={isPosted ? 3 : 3} className="px-3 py-2 text-right font-semibold text-sm">Total</td>
                    <td className="px-3 py-2 text-right font-bold text-base">{fmtAmt(total, sym)}</td>
                    {!isPosted && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Narration */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Narration</label>
            <textarea
              value={narr} onChange={e => setNarr(e.target.value)} rows={2}
              disabled={isPosted}
              placeholder="General remarks about this voucher…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-60"
            />
          </div>

          {/* JE info for posted */}
          {isPosted && initial?.journalEntryId && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm text-emerald-700 dark:text-emerald-300">
                Journal Entry posted — ref: <strong>{initial.voucherNumber}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {isEdit && !isPosted && (
              <button type="button" onClick={() => onDelete(initial!.id!)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-destructive text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent/40 transition-colors">
              {isPosted ? "Close" : "Cancel"}
            </button>
            {!isPosted && (
              <>
                <button type="button" onClick={() => handleSave(false)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-muted border border-border hover:bg-muted/80 transition-colors font-medium">
                  <Save className="h-4 w-4" /> Save Draft
                </button>
                <button type="button" onClick={() => handleSave(true)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-white font-medium transition-colors ${typeColor} hover:opacity-90`}>
                  <CheckCircle className="h-4 w-4" /> Post to Journal
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReceiptPaymentPage() {
  const { vouchers, add, edit, remove, post, refresh } = useRPVouchers();
  const { accounts } = useAccounts();
  const { toast }    = useToast();
  const sym          = getSettingsCurrencySymbol();
  const searchStr    = useSearch();

  const [typeFilter,   setTypeFilter]   = useState<"all" | "receipt" | "payment">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "posted">("all");
  const [search,       setSearch]       = useState("");
  const [formOpen,     setFormOpen]     = useState(false);
  const [editVoucher,  setEditVoucher]  = useState<RPVoucher | null>(null);
  const [prefillData,  setPrefillData]  = useState<Partial<RPVoucher> | null>(null);
  const [newType,      setNewType]      = useState<"receipt" | "payment">("receipt");
  const [deleteId,     setDeleteId]     = useState<string | null>(null);

  // ── Auto-open form when arriving from an invoice's "Collect Payment" button ─
  useLayoutEffect(() => {
    if (!searchStr) return;
    const p = new URLSearchParams(searchStr);
    const invoiceId     = p.get("invoiceId");
    const invoiceNumber = p.get("invoiceNumber");
    const customer      = p.get("customer");
    const amount        = p.get("amount");
    const type          = (p.get("type") === "payment" ? "payment" : "receipt") as "receipt" | "payment";
    // Customer-only deep link — open blank receipt pre-filled with customer name
    if (!invoiceId || !invoiceNumber) {
      if (customer) {
        setNewType(type);
        setEditVoucher(null);
        setPrefillData({ voucherType: type, partyName: customer });
        setFormOpen(true);
      }
      return;
    }
    const prefill: Partial<RPVoucher> = {
      voucherType:        type,
      partyName:          customer ?? "",
      linkedInvoiceId:    invoiceId,
      narration:          `Payment for invoice ${invoiceNumber}`,
      lines: [{
        id:          crypto.randomUUID(),
        accountId:   "",
        accountName: "",
        description: invoiceNumber,
        amount:      parseFloat(amount ?? "0") || 0,
      }],
    };
    setNewType(type);
    setEditVoucher(null);
    setPrefillData(prefill);
    setFormOpen(true);
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = [...vouchers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (typeFilter !== "all")   list = list.filter(v => v.voucherType === typeFilter);
    if (statusFilter !== "all") list = list.filter(v => v.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.voucherNumber.toLowerCase().includes(q) ||
        v.partyName.toLowerCase().includes(q) ||
        v.cashBankAccountName.toLowerCase().includes(q) ||
        v.narration.toLowerCase().includes(q)
      );
    }
    return list;
  }, [vouchers, typeFilter, statusFilter, search]);

  const totalReceipts = useMemo(() =>
    vouchers.filter(v => v.voucherType === "receipt" && v.status === "posted").reduce((s, v) => s + v.totalAmount, 0), [vouchers]);
  const totalPayments = useMemo(() =>
    vouchers.filter(v => v.voucherType === "payment" && v.status === "posted").reduce((s, v) => s + v.totalAmount, 0), [vouchers]);
  const netCash = totalReceipts - totalPayments;

  const openNew = (type: "receipt" | "payment") => {
    setNewType(type); setEditVoucher(null); setFormOpen(true);
  };

  const openEdit = (v: RPVoucher) => {
    setEditVoucher(v); setFormOpen(true);
  };

  const handleSave = (data: Omit<RPVoucher, "id" | "voucherNumber" | "createdAt" | "updatedAt">, doPost: boolean) => {
    try {
      if (editVoucher) {
        const updated = edit(editVoucher.id, { ...data });
        if (doPost) {
          post(updated.id);
          toast({ title: "Voucher posted", description: `${updated.voucherNumber} posted to Journal Entries.` });
        } else {
          toast({ title: "Voucher saved", description: `${updated.voucherNumber} saved as draft.` });
        }
      } else {
        const created = add(data);
        if (doPost) {
          post(created.id);
          toast({ title: "Voucher posted", description: `${created.voucherNumber} posted to Journal Entries.` });
        } else {
          toast({ title: "Voucher saved", description: `${created.voucherNumber} saved as draft.` });
        }
      }
      setFormOpen(false);
      setEditVoucher(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handlePost = (id: string) => {
    try {
      const je = post(id);
      toast({ title: "Posted", description: `Voucher posted to Journal Entries.` });
      setFormOpen(false);
      setEditVoucher(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    remove(deleteId);
    toast({ title: "Deleted", description: "Voucher deleted." });
    setDeleteId(null);
    setFormOpen(false);
    setEditVoucher(null);
  };

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Receipt &amp; Payment</h1>
          <p className="text-sm text-muted-foreground">Record cash/bank receipts and payments linked to the Chart of Accounts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openNew("receipt")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
            <ArrowDownCircle className="h-4 w-4" /> New Receipt
          </button>
          <button
            onClick={() => openNew("payment")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors">
            <ArrowUpCircle className="h-4 w-4" /> New Payment
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-1">Total Receipts</div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{fmtAmt(totalReceipts, sym)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Posted vouchers only</div>
        </div>
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3">
          <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-widest mb-1">Total Payments</div>
          <div className="text-xl font-bold text-rose-700 dark:text-rose-300">{fmtAmt(totalPayments, sym)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Posted vouchers only</div>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${netCash >= 0 ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30" : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-widest mb-1 ${netCash >= 0 ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"}`}>Net Cash Flow</div>
          <div className={`text-xl font-bold ${netCash >= 0 ? "text-blue-700 dark:text-blue-300" : "text-amber-700 dark:text-amber-300"}`}>{fmtAmt(Math.abs(netCash), sym)}{netCash < 0 ? " (net out)" : ""}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Receipts minus payments</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(["all", "receipt", "payment"] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 font-medium transition-colors ${typeFilter === t ? "bg-primary text-white" : "hover:bg-accent/40 text-muted-foreground"}`}>
              {t === "all" ? "All" : t === "receipt" ? "Receipts" : "Payments"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(["all", "draft", "posted"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 font-medium capitalize transition-colors ${statusFilter === s ? "bg-primary text-white" : "hover:bg-accent/40 text-muted-foreground"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input className="flex-1 text-sm bg-transparent outline-none" placeholder="Search vouchers…"
              value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch("")}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-widest">
              <th className="text-left px-4 py-3">Voucher #</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Party</th>
              <th className="text-left px-4 py-3">Cash / Bank</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16 text-muted-foreground">
                  <CreditCard className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <div className="font-medium">No vouchers found</div>
                  <div className="text-xs mt-1">Create a new Receipt or Payment voucher to get started</div>
                </td>
              </tr>
            ) : filtered.map(v => (
              <tr key={v.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-xs">{v.voucherNumber}</td>
                <td className="px-4 py-3 text-muted-foreground">{v.date}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${v.voucherType === "receipt" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"}`}>
                    {v.voucherType === "receipt" ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                    {v.voucherType === "receipt" ? "Receipt" : "Payment"}
                  </span>
                </td>
                <td className="px-4 py-3">{v.partyName || <span className="text-muted-foreground text-xs">—</span>}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{v.cashBankAccountName}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmtAmt(v.totalAmount, sym)}</td>
                <td className="px-4 py-3 text-center">
                  {v.status === "posted"
                    ? <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">Posted</span>
                    : <span className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">Draft</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {v.status === "draft" && (
                      <button onClick={() => handlePost(v.id)}
                        title="Post to Journal"
                        className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 transition-colors">
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => openEdit(v)}
                      title={v.status === "draft" ? "Edit" : "View"}
                      className="p-1.5 rounded hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors">
                      {v.status === "draft" ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {v.status === "draft" && (
                      <button onClick={() => setDeleteId(v.id)}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Count */}
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">{filtered.length} voucher{filtered.length !== 1 ? "s" : ""}</p>
      )}

      {/* Form Dialog */}
      {formOpen && (
        <VoucherForm
          accounts={accounts}
          initial={editVoucher ?? prefillData}
          defaultType={newType}
          sym={sym}
          onClose={() => { setFormOpen(false); setEditVoucher(null); setPrefillData(null); }}
          onSave={handleSave}
          onPost={handlePost}
          onDelete={handleDelete}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              This draft voucher will be permanently deleted. Posted vouchers cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
