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
import { RPVoucher, RPVoucherLine, Account, getInvoices, Invoice, SYS_ACCS, getSettings, getAccounts, findSubLedgerForParty, getCustomers, Customer } from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

/**
 * Purchase invoices are tax-exclusive in the UI (effectiveTaxRate = 0).
 * The stored `inv.taxRate` field may still hold the global VAT rate.
 * Always use this helper so we don't double-apply tax on purchases.
 */
function invTaxRate(inv: Invoice): number {
  return inv.invoiceType === "purchase" ? 0 : (parseFloat(inv.taxRate) || 0);
}

/** Recompute the gross total of an invoice, respecting purchase tax exclusion. */
function invGrandTotal(inv: Invoice): number {
  const sub = (inv.items || []).reduce((s, it) => {
    const qty   = parseFloat(it.qty) || 0;
    const price = parseFloat(it.unitPrice) || 0;
    const disc  = parseFloat(it.discount) || 0;
    const line  = qty * price - (it.discountMode === "pct" ? qty * price * disc / 100 : disc);
    return s + line;
  }, 0);
  const tax = sub * invTaxRate(inv) / 100;
  return sub + tax + (parseFloat(inv.shippingFee) || 0) + (parseFloat(inv.handlingFee) || 0);
}

/** Outstanding balance = grand total – amount already paid. */
function invOutstanding(inv: Invoice): number {
  return Math.max(0, invGrandTotal(inv) - (parseFloat(inv.amountPaid) || 0));
}

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
              const outstanding = invOutstanding(inv);
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

// ─── Party (Buyer / Supplier) Searchable Dropdown ────────────────────────────

interface PartyDropdownProps {
  contacts: Customer[];
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}

function PartyDropdown({ contacts, value, onChange, placeholder = "Select…" }: PartyDropdownProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState("");
  const trigRef         = useRef<HTMLButtonElement>(null);
  const listRef         = useRef<HTMLDivElement>(null);
  const [pos, setPos]   = useState({ top: 0, left: 0, width: 0 });

  const filtered = useMemo(() => {
    const sq = q.toLowerCase().trim();
    if (!sq) return contacts;
    return contacts.filter(c =>
      (c.name || "").toLowerCase().includes(sq) ||
      (c.company || "").toLowerCase().includes(sq) ||
      (c.email || "").toLowerCase().includes(sq)
    );
  }, [contacts, q]);

  const selected = contacts.find(c => c.name === value);
  const displayLabel = selected
    ? `${selected.name}${selected.company ? ` (${selected.company})` : ""}`
    : "";

  const openDropdown = () => {
    if (!trigRef.current) return;
    const r = trigRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX, width: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!trigRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node))
        setOpen(false);
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
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value ? displayLabel : placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {value && (
            <span onMouseDown={e => { e.stopPropagation(); onChange(""); setOpen(false); }}
              className="text-muted-foreground hover:text-destructive p-0.5">
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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
                placeholder="Search by name, company…" value={q}
                onChange={e => setQ(e.target.value)}
              />
              {q && <button onClick={() => setQ("")}><X className="h-3 w-3 text-muted-foreground" /></button>}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No contacts found</div>
            ) : filtered.map(c => {
              const label = `${c.name}${c.company ? ` (${c.company})` : ""}`;
              return (
                <button key={c.id} type="button"
                  onClick={() => { onChange(c.name); setOpen(false); setQ(""); }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-accent/60 transition-colors border-b border-border/40 last:border-0 ${c.name === value ? "bg-primary/10 text-primary font-medium" : ""}`}
                >
                  <div className="font-medium text-foreground">{label}</div>
                  {(c.email || c.customerRole) && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-2">
                      {c.email && <span>{c.email}</span>}
                      {c.customerRole && <span className="capitalize opacity-70">{c.customerRole}</span>}
                    </div>
                  )}
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
    return invOutstanding(linkedInv);
  }, [linkedInv]);

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  // ── Payment-mode (new payment voucher only) ─────────────────────────────────
  const isNewPayment  = vtype === "payment" && !isEdit;
  // ── Receipt-mode (new receipt voucher only) ──────────────────────────────────
  const isNewReceipt  = vtype === "receipt"  && !isEdit;

  // ─── Payment state ───────────────────────────────────────────────────────────
  const [supplierName, setSupplierName] = useState<string>(initial?.partyName ?? "");
  const [payBankLines, setPayBankLines] = useState<LineRow[]>(() =>
    initial?.bankLines?.length
      ? initial.bankLines.map(l => ({ id: l.id, accountId: l.accountId, accountName: l.accountName, description: l.description, amount: String(l.amount) }))
      : [emptyLine()]
  );

  // Show ALL CRM contacts — a contact might be tagged as Buyer in CRM but still used as a supplier
  const suppliers = useMemo<Customer[]>(() => getCustomers(), []);

  // Supplier's advance credit balance (from prior overpayments)
  const supplierAdvanceCredit = useMemo(() => {
    if (!supplierName) return 0;
    const contact = suppliers.find(s => s.name.toLowerCase() === supplierName.toLowerCase());
    return contact?.advanceCredit || 0;
  }, [suppliers, supplierName]);

  // All purchase invoices for this supplier, sorted by invoice number (oldest first)
  const supplierInvoices = useMemo<Invoice[]>(() => {
    if (!isNewPayment || !supplierName) return [];
    return getInvoices()
      .filter(inv =>
        inv.invoiceType === "purchase" &&
        (inv.customer ?? "").toLowerCase() === supplierName.toLowerCase()
      )
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true }));
  }, [supplierName, isNewPayment]);

  // All supplier invoices → AP lines (no selection needed, always all)
  const computedApLines = useMemo<LineRow[]>(() => {
    if (!isNewPayment) return [];
    const settings  = getSettings();
    const groupApId = settings.accPurchasePayable || SYS_ACCS.AP_TRADE;
    return supplierInvoices.map(inv => {
      const apAccId = findSubLedgerForParty(inv.customer ?? "", SYS_ACCS.AP_TRADE) || groupApId;
      const apAcc   = accounts.find(a => a.id === apAccId);
      const outstanding = invOutstanding(inv);
      return {
        id:          inv.id,
        accountId:   apAccId,
        accountName: apAcc?.name ?? "Trade Payables",
        description: inv.invoiceNumber,
        amount:      outstanding.toFixed(2),
      };
    });
  }, [supplierInvoices, accounts, isNewPayment]);

  const totalDue  = computedApLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const bankTotal = payBankLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const payExcess = bankTotal > totalDue + 0.001 ? bankTotal - totalDue : 0;

  // Sequential allocation: pay invoices in invoice-number order (oldest first)
  const sequentialApLines = useMemo<LineRow[]>(() => {
    if (!isNewPayment || bankTotal === 0) return computedApLines;
    let remaining = bankTotal;
    return computedApLines.map(l => {
      const outstanding = parseFloat(l.amount) || 0;
      const paying = Math.min(outstanding, remaining);
      remaining = Math.max(0, remaining - paying);
      return { ...l, amount: paying.toFixed(2) };
    });
  }, [computedApLines, bankTotal, isNewPayment]);

  // ─── Receipt state (mirrors payment state with buyer / AR) ───────────────────
  const [buyerName,    setBuyerName]    = useState<string>(initial?.partyName ?? "");
  const [recvBankLines,setRecvBankLines] = useState<LineRow[]>(() =>
    initial?.bankLines?.length
      ? initial.bankLines.map(l => ({ id: l.id, accountId: l.accountId, accountName: l.accountName, description: l.description, amount: String(l.amount) }))
      : [emptyLine()]
  );

  // Show ALL CRM contacts — a contact might be tagged as Supplier but also receive payments
  const buyers = useMemo<Customer[]>(() => getCustomers(), []);

  // Buyer's advance credit balance (from prior overpayments)
  const buyerAdvanceCredit = useMemo(() => {
    if (!buyerName) return 0;
    const contact = buyers.find(b => b.name.toLowerCase() === buyerName.toLowerCase());
    return contact?.advanceCredit || 0;
  }, [buyers, buyerName]);

  // All sale invoices for the selected buyer, sorted by invoice number (oldest first)
  const buyerInvoices = useMemo<Invoice[]>(() => {
    if (!isNewReceipt || !buyerName) return [];
    return getInvoices()
      .filter(inv =>
        inv.invoiceType !== "purchase" &&
        inv.status !== "Cancelled" &&
        (inv.customer ?? "").toLowerCase() === buyerName.toLowerCase()
      )
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true }));
  }, [buyerName, isNewReceipt]);

  // All buyer invoices → AR lines (no selection needed, always all)
  const computedArLines = useMemo<LineRow[]>(() => {
    if (!isNewReceipt) return [];
    const settings  = getSettings();
    const groupArId = settings.accReceivable || SYS_ACCS.AR_GROUP;
    return buyerInvoices.map(inv => {
      const arAccId  = findSubLedgerForParty(inv.customer ?? "", SYS_ACCS.AR_GROUP) || groupArId;
      const arAcc    = accounts.find(a => a.id === arAccId);
      const outstanding = invOutstanding(inv);
      return {
        id:          inv.id,
        accountId:   arAccId,
        accountName: arAcc?.name ?? "Trade Receivables",
        description: inv.invoiceNumber,
        amount:      outstanding.toFixed(2),
      };
    });
  }, [buyerInvoices, accounts, isNewReceipt]);

  const totalReceivable = computedArLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const recvBankTotal   = recvBankLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const recvExcess      = recvBankTotal > totalReceivable + 0.001 ? recvBankTotal - totalReceivable : 0;

  // Sequential allocation: receive against invoices in invoice-number order (oldest first)
  const sequentialArLines = useMemo<LineRow[]>(() => {
    if (!isNewReceipt || recvBankTotal === 0) return computedArLines;
    let remaining = recvBankTotal;
    return computedArLines.map(l => {
      const outstanding = parseFloat(l.amount) || 0;
      const receiving   = Math.min(outstanding, remaining);
      remaining = Math.max(0, remaining - receiving);
      return { ...l, amount: receiving.toFixed(2) };
    });
  }, [computedArLines, recvBankTotal, isNewReceipt]);

  const setLine = (id: string, patch: Partial<LineRow>) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));

  const removeLine = (id: string) =>
    setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);

  const buildPayload = (): Omit<RPVoucher, "id" | "voucherNumber" | "createdAt" | "updatedAt"> => {
    if (isNewPayment) {
      const validBank = payBankLines.filter(l => l.accountId && parseFloat(l.amount) > 0);
      // Lines for each invoice (sequential allocation, zero-amount lines excluded from JE)
      const invLines: Array<{ id: string; accountId: string; accountName: string; description: string; amount: number; invoiceId?: string }> =
        sequentialApLines
          .filter(l => parseFloat(l.amount) > 0)
          .map(l => ({
            id: l.id, accountId: l.accountId, accountName: l.accountName,
            description: l.description, amount: parseFloat(l.amount) || 0,
            invoiceId: l.id,   // l.id == inv.id in computedApLines
          }));
      // If bank total > invoices outstanding (including no-invoice case), append an advance credit line
      if (payExcess > 0.001) {
        const settings  = getSettings();
        const groupApId = settings.accPurchasePayable || SYS_ACCS.AP_TRADE;
        const apAccId   = computedApLines[0]?.accountId ?? (findSubLedgerForParty(supplierName, SYS_ACCS.AP_TRADE) || groupApId);
        const apAccName = computedApLines[0]?.accountName ?? (accounts.find(a => a.id === apAccId)?.name ?? "Trade Payables");
        invLines.push({
          id: crypto.randomUUID(), accountId: apAccId, accountName: apAccName,
          description: `Advance Payment — ${supplierName}`,
          amount: parseFloat(payExcess.toFixed(2)),
          invoiceId: undefined,
        });
      }
      return {
        voucherType:         "payment",
        date,
        partyName:           supplierName,
        cashBankAccountId:   validBank[0]?.accountId   ?? "",
        cashBankAccountName: validBank[0]?.accountName ?? "",
        reference:           ref,
        narration:           narr || `Payment to ${supplierName}`,
        linkedInvoiceId:     undefined,
        lines:               invLines,
        bankLines:           validBank.map(l => ({
          id: l.id, accountId: l.accountId, accountName: l.accountName,
          description: l.description, amount: parseFloat(l.amount) || 0,
        })),
        linkedInvoiceIds: supplierInvoices.map(i => i.id),
        totalAmount:      bankTotal,
        status:           "draft",
      };
    }
    if (isNewReceipt) {
      const validBank = recvBankLines.filter(l => l.accountId && parseFloat(l.amount) > 0);
      // Lines for each invoice (sequential allocation, zero-amount excluded from JE)
      const invLines: Array<{ id: string; accountId: string; accountName: string; description: string; amount: number; invoiceId?: string }> =
        sequentialArLines
          .filter(l => parseFloat(l.amount) > 0)
          .map(l => ({
            id: l.id, accountId: l.accountId, accountName: l.accountName,
            description: l.description, amount: parseFloat(l.amount) || 0,
            invoiceId: l.id,   // l.id == inv.id in computedArLines
          }));
      // If received > invoices outstanding (including no-invoice case), append an advance receipt line
      if (recvExcess > 0.001) {
        const settings  = getSettings();
        const groupArId = settings.accReceivable || SYS_ACCS.AR_GROUP;
        const arAccId   = computedArLines[0]?.accountId ?? (findSubLedgerForParty(buyerName, SYS_ACCS.AR_GROUP) || groupArId);
        const arAccName = computedArLines[0]?.accountName ?? (accounts.find(a => a.id === arAccId)?.name ?? "Trade Receivables");
        invLines.push({
          id: crypto.randomUUID(), accountId: arAccId, accountName: arAccName,
          description: `Advance Receipt — ${buyerName}`,
          amount: parseFloat(recvExcess.toFixed(2)),
          invoiceId: undefined,
        });
      }
      return {
        voucherType:         "receipt",
        date,
        partyName:           buyerName,
        cashBankAccountId:   validBank[0]?.accountId   ?? "",
        cashBankAccountName: validBank[0]?.accountName ?? "",
        reference:           ref,
        narration:           narr || `Receipt from ${buyerName}`,
        linkedInvoiceId:     undefined,
        lines:               invLines,
        bankLines:           validBank.map(l => ({
          id: l.id, accountId: l.accountId, accountName: l.accountName,
          description: l.description, amount: parseFloat(l.amount) || 0,
        })),
        linkedInvoiceIds: buyerInvoices.map(i => i.id),
        totalAmount:      recvBankTotal,
        status:           "draft",
      };
    }
    return {
      voucherType: vtype,
      date,
      partyName: party,
      cashBankAccountId: cbId,
      cashBankAccountName: cbName,
      reference: ref,
      narration: narr,
      linkedInvoiceId: linkedInvId ?? undefined,
      lines: lines.filter(l => l.accountId && parseFloat(l.amount) > 0).map(l => ({
        id: l.id, accountId: l.accountId, accountName: l.accountName,
        description: l.description, amount: parseFloat(l.amount) || 0,
      })),
      totalAmount: total,
      status: "draft",
    };
  };

  const overBalance = invBalance !== null && total > invBalance + 0.001;

  const validate = (): string | null => {
    if (!date) return "Date is required.";
    if (isNewPayment) {
      if (!supplierName) return "Please select a supplier.";
      const validBank = payBankLines.filter(l => l.accountId && parseFloat(l.amount) > 0);
      if (validBank.length === 0) return "Please add at least one bank / cash payment line.";
      return null;
    }
    if (isNewReceipt) {
      if (!buyerName) return "Please select a buyer.";
      const validBank = recvBankLines.filter(l => l.accountId && parseFloat(l.amount) > 0);
      if (validBank.length === 0) return "Please add at least one bank / cash account to receive payment into.";
      return null;
    }
    if (!cbId) return `${vtype === "receipt" ? "Received Into" : "Paid From"} (Cash / Bank) account is required.`;
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

          {/* ══════════════════════════════════════════════════════════════════
               NEW PAYMENT FLOW  (new payment vouchers only)
          ══════════════════════════════════════════════════════════════════ */}
          {isNewPayment && (
            <>
              {/* 1 — Supplier selector */}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  Supplier *
                </label>
                <PartyDropdown
                  contacts={suppliers}
                  value={supplierName}
                  onChange={setSupplierName}
                  placeholder="— Select supplier —"
                />
              </div>

              {/* 2 — Date + balance summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Date *</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                      Total Outstanding{supplierInvoices.length > 0 ? ` (${supplierInvoices.length} invoice${supplierInvoices.length !== 1 ? "s" : ""})` : ""}
                    </label>
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm font-bold text-amber-700 dark:text-amber-300">
                      {fmtAmt(totalDue, sym)}
                    </div>
                  </div>
                  {supplierAdvanceCredit > 0.001 && (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">Advance credit on account</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">{fmtAmt(supplierAdvanceCredit, sym)}</span>
                    </div>
                  )}
                  {bankTotal > 0 && (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">You're paying</span>
                      <span className="font-semibold text-foreground">{fmtAmt(bankTotal, sym)}</span>
                    </div>
                  )}
                  {bankTotal > 0 && totalDue > bankTotal + 0.001 && (
                    <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-blue-700 dark:text-blue-300 font-medium">Still outstanding after payment</span>
                      <span className="font-bold text-blue-700 dark:text-blue-300">{fmtAmt(totalDue - bankTotal, sym)}</span>
                    </div>
                  )}
                  {payExcess > 0.001 && (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">Advance credit will be added</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">{fmtAmt(payExcess, sym)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3 — AP debit lines (read-only, auto-generated) */}
              {computedApLines.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Paid For — Payables (Debit Side, Auto-Generated)
                    </label>
                    {bankTotal > 0 && bankTotal < totalDue - 0.001 && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                        Partial — oldest invoices paid first
                      </span>
                    )}
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-widest">
                          <th className="text-left px-3 py-2 w-8">#</th>
                          <th className="text-left px-3 py-2">AP Account</th>
                          <th className="text-left px-3 py-2 w-32">Invoice</th>
                          <th className="text-right px-3 py-2 w-28">Outstanding</th>
                          <th className="text-right px-3 py-2 w-28">Paying Now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {computedApLines.map((l, idx) => {
                          const sequential  = sequentialApLines[idx];
                          const outstanding = parseFloat(l.amount) || 0;
                          const payingNow   = parseFloat(sequential?.amount ?? l.amount) || 0;
                          const isPartial   = Math.abs(payingNow - outstanding) > 0.001;
                          return (
                            <tr key={l.id} className="border-t border-border bg-muted/10">
                              <td className="px-3 py-2 text-muted-foreground text-center text-xs">{idx + 1}</td>
                              <td className="px-3 py-2 text-foreground/80">{l.accountName}</td>
                              <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{l.description}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground text-xs">{fmtAmt(outstanding, sym)}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${isPartial ? "text-blue-600 dark:text-blue-400" : ""}`}>
                                {fmtAmt(payingNow, sym)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td colSpan={3} className="px-3 py-2 text-right font-semibold text-sm">Total</td>
                          <td className="px-3 py-2 text-right text-muted-foreground font-semibold text-sm">{fmtAmt(totalDue, sym)}</td>
                          <td className={`px-3 py-2 text-right font-bold text-sm ${payExcess > 0.001 ? "text-emerald-600 dark:text-emerald-400" : bankTotal > 0 && bankTotal < totalDue - 0.001 ? "text-blue-600 dark:text-blue-400" : ""}`}>
                            {fmtAmt(bankTotal || 0, sym)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 4 — Multi-bank payment lines (credit side) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Paid Via — Bank / Cash Accounts (Credit Side)
                  </label>
                  <button type="button" onClick={() => setPayBankLines(p => [...p, emptyLine()])}
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Add Bank
                  </button>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-widest">
                        <th className="text-left px-3 py-2 w-8">#</th>
                        <th className="text-left px-3 py-2">Cash / Bank Account *</th>
                        <th className="text-left px-3 py-2 w-40">Reference / Cheque</th>
                        <th className="text-right px-3 py-2 w-32">Amount ({sym})</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {payBankLines.map((l, idx) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="px-3 py-2 text-muted-foreground text-center text-xs">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <AccDropdown
                              accounts={accounts}
                              value={l.accountId}
                              onChange={(id, name) => setPayBankLines(prev => prev.map(r => r.id === l.id ? { ...r, accountId: id, accountName: name } : r))}
                              placeholder="Select Cash / Bank account…"
                              filterCashBank
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={l.description}
                              onChange={e => setPayBankLines(prev => prev.map(r => r.id === l.id ? { ...r, description: e.target.value } : r))}
                              placeholder="Cheque #, IBAN, ref…"
                              className="w-full rounded border border-transparent hover:border-input focus:border-ring focus:ring-1 focus:ring-ring px-2 py-1 text-sm bg-transparent outline-none" />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input type="number" min="0" step="0.01" value={l.amount}
                              onChange={e => setPayBankLines(prev => prev.map(r => r.id === l.id ? { ...r, amount: e.target.value } : r))}
                              className="w-full rounded border border-transparent hover:border-input focus:border-ring focus:ring-1 focus:ring-ring px-2 py-1 text-sm bg-transparent outline-none text-right" />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button type="button"
                              onClick={() => setPayBankLines(prev => prev.length > 1 ? prev.filter(r => r.id !== l.id) : prev)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td colSpan={3} className="px-3 py-2 text-right font-semibold text-sm">Bank Total</td>
                        <td className={`px-3 py-2 text-right font-bold ${payExcess > 0.001 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                          {fmtAmt(bankTotal, sym)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
               NEW RECEIPT FLOW  (new receipt vouchers only — mirrors payment)
          ══════════════════════════════════════════════════════════════════ */}
          {isNewReceipt && (
            <>
              {/* 1 — Buyer selector */}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  Buyer *
                </label>
                <PartyDropdown
                  contacts={buyers}
                  value={buyerName}
                  onChange={setBuyerName}
                  placeholder="— Select buyer —"
                />
              </div>

              {/* 2 — Date + balance summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Date *</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                      Total Outstanding{buyerInvoices.length > 0 ? ` (${buyerInvoices.length} invoice${buyerInvoices.length !== 1 ? "s" : ""})` : ""}
                    </label>
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm font-bold text-amber-700 dark:text-amber-300">
                      {fmtAmt(totalReceivable, sym)}
                    </div>
                  </div>
                  {buyerAdvanceCredit > 0.001 && (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">Advance credit on account</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">{fmtAmt(buyerAdvanceCredit, sym)}</span>
                    </div>
                  )}
                  {recvBankTotal > 0 && (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">You're receiving</span>
                      <span className="font-semibold text-foreground">{fmtAmt(recvBankTotal, sym)}</span>
                    </div>
                  )}
                  {recvBankTotal > 0 && totalReceivable > recvBankTotal + 0.001 && (
                    <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-blue-700 dark:text-blue-300 font-medium">Still outstanding after receipt</span>
                      <span className="font-bold text-blue-700 dark:text-blue-300">{fmtAmt(totalReceivable - recvBankTotal, sym)}</span>
                    </div>
                  )}
                  {recvExcess > 0.001 && (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">Advance credit will be added</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">{fmtAmt(recvExcess, sym)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3 — AR credit lines (read-only, auto-generated) */}
              {computedArLines.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Clearing — Receivables (Credit Side, Auto-Generated)
                    </label>
                    {recvBankTotal > 0 && recvBankTotal < totalReceivable - 0.001 && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                        Partial — oldest invoices cleared first
                      </span>
                    )}
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-widest">
                          <th className="text-left px-3 py-2 w-8">#</th>
                          <th className="text-left px-3 py-2">AR Account</th>
                          <th className="text-left px-3 py-2 w-32">Invoice</th>
                          <th className="text-right px-3 py-2 w-28">Outstanding</th>
                          <th className="text-right px-3 py-2 w-28">Receiving Now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {computedArLines.map((l, idx) => {
                          const sequential   = sequentialArLines[idx];
                          const outstanding  = parseFloat(l.amount) || 0;
                          const receivingNow = parseFloat(sequential?.amount ?? l.amount) || 0;
                          const isPartial    = Math.abs(receivingNow - outstanding) > 0.001;
                          return (
                            <tr key={l.id} className="border-t border-border bg-muted/10">
                              <td className="px-3 py-2 text-muted-foreground text-center text-xs">{idx + 1}</td>
                              <td className="px-3 py-2 text-foreground/80">{l.accountName}</td>
                              <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{l.description}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground text-xs">{fmtAmt(outstanding, sym)}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${isPartial ? "text-blue-600 dark:text-blue-400" : ""}`}>
                                {fmtAmt(receivingNow, sym)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td colSpan={3} className="px-3 py-2 text-right font-semibold text-sm">Total</td>
                          <td className="px-3 py-2 text-right text-muted-foreground font-semibold text-sm">{fmtAmt(totalReceivable, sym)}</td>
                          <td className={`px-3 py-2 text-right font-bold text-sm ${recvExcess > 0.001 ? "text-emerald-600 dark:text-emerald-400" : recvBankTotal > 0 && recvBankTotal < totalReceivable - 0.001 ? "text-blue-600 dark:text-blue-400" : ""}`}>
                            {fmtAmt(recvBankTotal || 0, sym)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 4 — Multi-bank receive lines (debit side) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Received Into — Bank / Cash Accounts (Debit Side)
                  </label>
                  <button type="button" onClick={() => setRecvBankLines(p => [...p, emptyLine()])}
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Add Bank
                  </button>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-widest">
                        <th className="text-left px-3 py-2 w-8">#</th>
                        <th className="text-left px-3 py-2">Cash / Bank Account *</th>
                        <th className="text-left px-3 py-2 w-40">Reference / Cheque</th>
                        <th className="text-right px-3 py-2 w-32">Amount ({sym})</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {recvBankLines.map((l, idx) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="px-3 py-2 text-muted-foreground text-center text-xs">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <AccDropdown
                              accounts={accounts}
                              value={l.accountId}
                              onChange={(id, name) => setRecvBankLines(prev => prev.map(r => r.id === l.id ? { ...r, accountId: id, accountName: name } : r))}
                              placeholder="Select Cash / Bank account…"
                              filterCashBank
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="text" value={l.description}
                              onChange={e => setRecvBankLines(prev => prev.map(r => r.id === l.id ? { ...r, description: e.target.value } : r))}
                              placeholder="Cheque #, IBAN, ref…"
                              className="w-full rounded border border-transparent hover:border-input focus:border-ring focus:ring-1 focus:ring-ring px-2 py-1 text-sm bg-transparent outline-none" />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input type="number" min="0" step="0.01" value={l.amount}
                              onChange={e => setRecvBankLines(prev => prev.map(r => r.id === l.id ? { ...r, amount: e.target.value } : r))}
                              className="w-full rounded border border-transparent hover:border-input focus:border-ring focus:ring-1 focus:ring-ring px-2 py-1 text-sm bg-transparent outline-none text-right" />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button type="button"
                              onClick={() => setRecvBankLines(prev => prev.length > 1 ? prev.filter(r => r.id !== l.id) : prev)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td colSpan={3} className="px-3 py-2 text-right font-semibold text-sm">Bank Total</td>
                        <td className={`px-3 py-2 text-right font-bold ${recvExcess > 0.001 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                          {fmtAmt(recvBankTotal, sym)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
               EDIT FLOW  (existing vouchers being edited / viewed)
          ══════════════════════════════════════════════════════════════════ */}
          {!isNewPayment && !isNewReceipt && (
            <>
              {/* Invoice link */}
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
                      const settings = getSettings();
                      const groupArId = settings.accReceivable || SYS_ACCS.AR_GROUP;
                      const arAccId   = (vtype === "receipt" && inv.customer)
                        ? (findSubLedgerForParty(inv.customer, SYS_ACCS.AR_GROUP) || groupArId)
                        : groupArId;
                      const groupApId = settings.accPurchasePayable || SYS_ACCS.AP_TRADE;
                      const apAccId   = (vtype === "payment" && inv.customer)
                        ? (findSubLedgerForParty(inv.customer, SYS_ACCS.AP_TRADE) || groupApId)
                        : groupApId;
                      const targetId = vtype === "receipt" ? arAccId : apAccId;
                      if (targetId) {
                        const acct = accounts.find(a => a.id === targetId);
                        if (acct) {
                          const outstanding = invOutstanding(inv);
                          setLines([{
                            id: crypto.randomUUID(), accountId: acct.id, accountName: acct.name,
                            description: inv.invoiceNumber,
                            amount: outstanding > 0 ? String(outstanding.toFixed(2)) : "",
                          }]);
                        }
                      }
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

              {/* Date + balance */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Date *</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    disabled={isPosted}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
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

              {/* Cash / Bank Account selector */}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  {vtype === "receipt" ? "Received Into (Cash / Bank Account) *" : "Paid From (Cash / Bank Account) *"}
                </label>
                {isPosted
                  ? <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">{cbName || "—"}</div>
                  : <AccDropdown accounts={accounts} value={cbId}
                      onChange={(id, name) => { setCbId(id); setCbName(name); }}
                      placeholder="Select Cash / Bank account…" filterCashBank />
                }
              </div>

              {/* Lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                    {vtype === "receipt"
                      ? "Clearing Against — Receivables / Revenue (Credit Side)"
                      : "Paid For — Payables / Expenses (Debit Side)"}
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
                              : <AccDropdown accounts={accounts} value={l.accountId}
                                  onChange={(id, name) => setLine(l.id, { accountId: id, accountName: name })}
                                  placeholder={vtype === "receipt" ? "AR / Revenue account…" : "AP / Expense account…"}
                                  excludeIds={lines.filter(r => r.id !== l.id && r.accountId).map(r => r.accountId)} />}
                          </td>
                          <td className="px-2 py-1.5">
                            {isPosted
                              ? <span className="px-1">{l.description || "—"}</span>
                              : <input type="text" value={l.description}
                                  onChange={e => setLine(l.id, { description: e.target.value })}
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
                        <td colSpan={3} className="px-3 py-2 text-right font-semibold text-sm">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-base">{fmtAmt(total, sym)}</td>
                        {!isPosted && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

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
            {isEdit && (
              <button type="button" onClick={() => onDelete(initial!.id!)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  isPosted
                    ? "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    : "border-destructive text-destructive hover:bg-destructive/10"
                }`}
                title={isPosted ? "Deletes JE & reverses invoice payments" : "Delete draft voucher"}>
                <Trash2 className="h-4 w-4" />
                {isPosted ? "Delete & Reverse" : "Delete"}
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

  // ── Auto-open form when arriving from an invoice or ledger ──────────────────
  useLayoutEffect(() => {
    if (!searchStr) return;
    const p = new URLSearchParams(searchStr);
    const invoiceId     = p.get("invoiceId");
    const invoiceNumber = p.get("invoiceNumber");
    const customer      = p.get("customer");
    const amount        = p.get("amount");
    const type          = (p.get("type") === "payment" ? "payment" : "receipt") as "receipt" | "payment";
    // Ledger deep-link — accountId + accountName passed directly (no invoice)
    const srcAccountId   = p.get("accountId");
    const srcAccountName = p.get("accountName");
    const partyName      = p.get("partyName") || customer || "";

    const allAccounts = getAccounts();
    const settings    = getSettings();

    // ── Helper: resolve the correct AR or AP ledger account ─────────────────
    function resolveAccount(forParty: string, forType: "receipt" | "payment"): { id: string; name: string } {
      if (forType === "receipt") {
        const groupId = settings.accReceivable || SYS_ACCS.AR_GROUP;
        const specId  = forParty ? findSubLedgerForParty(forParty, SYS_ACCS.AR_GROUP) : null;
        const id      = specId ?? groupId;
        return { id, name: allAccounts.find(a => a.id === id)?.name ?? "" };
      } else {
        const groupId = settings.accPurchasePayable || SYS_ACCS.AP_TRADE;
        const specId  = forParty ? findSubLedgerForParty(forParty, SYS_ACCS.AP_TRADE) : null;
        const id      = specId ?? groupId;
        return { id, name: allAccounts.find(a => a.id === id)?.name ?? "" };
      }
    }

    // ── Case 1: Ledger deep-link (accountId present, no invoiceId) ───────────
    if (srcAccountId && !invoiceId) {
      const acct = { id: srcAccountId, name: srcAccountName ?? allAccounts.find(a => a.id === srcAccountId)?.name ?? "" };
      const prefill: Partial<RPVoucher> = {
        voucherType: type,
        partyName,
        lines: [{
          id: crypto.randomUUID(),
          accountId:   acct.id,
          accountName: acct.name,
          description: partyName ? `${type === "receipt" ? "Receipt from" : "Payment to"} ${partyName}` : "",
          amount:      parseFloat(amount ?? "0") || 0,
        }],
      };
      setNewType(type);
      setEditVoucher(null);
      setPrefillData(prefill);
      setFormOpen(true);
      return;
    }

    // ── Case 2: Customer-only deep link (no invoice, no account) ────────────
    if (!invoiceId || !invoiceNumber) {
      if (partyName || customer) {
        setNewType(type);
        setEditVoucher(null);
        setPrefillData({ voucherType: type, partyName: partyName || customer || "" });
        setFormOpen(true);
      }
      return;
    }

    // ── Case 3: Invoice deep-link — resolve account + outstanding balance ────
    const acct = resolveAccount(customer ?? "", type);

    // Compute outstanding balance directly from invoice data
    const inv = getInvoices().find(i => i.id === invoiceId);
    let outstanding = parseFloat(amount ?? "0") || 0;
    if (inv) {
      outstanding = parseFloat(invOutstanding(inv).toFixed(2));
    }

    const prefill: Partial<RPVoucher> = {
      voucherType:     type,
      partyName:       customer ?? "",
      linkedInvoiceId: invoiceId,
      narration:       `${type === "receipt" ? "Receipt for invoice" : "Payment for invoice"} ${invoiceNumber}`,
      lines: [{
        id:          crypto.randomUUID(),
        accountId:   acct.id,
        accountName: acct.name,
        description: invoiceNumber,
        amount:      outstanding,
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
                    <button onClick={() => setDeleteId(v.id)}
                      title={v.status === "posted" ? "Delete (reverses JE & invoice payments)" : "Delete"}
                      className={`p-1.5 rounded transition-colors ${
                        v.status === "posted"
                          ? "hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                          : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      }`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
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
      {(() => {
        const delV = deleteId ? vouchers.find(v => v.id === deleteId) : null;
        const isPostedDel = delV?.status === "posted";
        return (
          <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  {isPostedDel && <AlertTriangle className="h-5 w-5 text-red-500" />}
                  Delete {isPostedDel ? "Posted" : "Draft"} Voucher?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>
                      <strong>{delV?.voucherNumber}</strong> will be permanently deleted. This cannot be undone.
                    </p>
                    {isPostedDel && (
                      <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300 space-y-1">
                        <p className="font-semibold">This posted voucher will also:</p>
                        <ul className="list-disc list-inside space-y-0.5 text-xs">
                          <li>Delete its linked Journal Entry from the COA &amp; Balance Sheet</li>
                          <li>Reverse any invoice payments it recorded</li>
                          <li>Update linked invoice statuses (Paid → Partial / Unpaid)</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>
                  {isPostedDel ? "Yes, Delete & Reverse" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </div>
  );
}
