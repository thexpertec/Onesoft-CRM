import { useState, useMemo, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useAccounts, useJournalEntries } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { Account, getSettings, reconcileAccountingData, SYS_ACCS, getInvoices, getSales, getSaleReturns, getPurchaseReturns, getRPVouchers, getJournalEntries } from "@/lib/store";
import {
  BookOpen, Printer, FileDown, Search, ChevronDown, RefreshCw,
  TrendingUp, TrendingDown, BarChart3, Calendar,
  ArrowDownCircle, ArrowUpCircle, ExternalLink,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }
function monthStart(): string {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number, sym: string): string {
  return `${sym} ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtN(n: number): string {
  return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isDebitNormal(head: string): boolean {
  return head === "Assets" || head === "Expense";
}

function balanceLabel(balance: number, debitNormal: boolean): string {
  if (balance === 0) return "—";
  // Running balance is always stored as (sum of debits) - (sum of credits).
  // Debit-normal  (Assets, Expense):        positive running = DR  ✓, negative = CR
  // Credit-normal (Liabilities, Revenue, Equity): negative running = CR ✓, positive = DR
  if (debitNormal) return balance > 0 ? "DR" : "CR";
  return balance < 0 ? "CR" : "DR";
}

function absBalance(balance: number, debitNormal: boolean): number {
  return debitNormal ? balance : -balance;
}

// ─── Account Selector (searchable dropdown) ───────────────────────────────────

function AccountSelector({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const ledgers = useMemo(
    () => accounts.filter(a => a.accountType === "Ledger" && a.isActive)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [accounts],
  );

  const filtered = useMemo(() => {
    if (!q) return ledgers;
    const lq = q.toLowerCase();
    return ledgers.filter(a =>
      a.name.toLowerCase().includes(lq) || a.code.toLowerCase().includes(lq),
    );
  }, [ledgers, q]);

  const selected = accounts.find(a => a.id === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQ(""); }}
        className="flex items-center justify-between gap-2 h-9 px-3 rounded-lg border border-input bg-background text-sm w-full min-w-[260px] hover:border-ring transition-colors"
      >
        <span className={selected ? "text-foreground font-medium" : "text-muted-foreground"}>
          {selected ? `${selected.code} — ${selected.name}` : "Select account…"}
        </span>
        <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-[340px] bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search account name or code…"
                className="w-full h-8 pl-7 pr-3 text-sm bg-muted/40 rounded-lg border border-transparent focus:outline-none focus:border-ring"
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No accounts found</div>
            )}
            {filtered.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.id); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-accent transition-colors text-sm
                  ${a.id === value ? "bg-primary/8 text-primary font-semibold" : "text-foreground"}`}
              >
                <span className="truncate">{a.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-muted-foreground font-mono">{a.code}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.head}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}

// ─── Ledger Table Row ─────────────────────────────────────────────────────────

type LedgerRow = {
  date: string;
  reference: string;
  description: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
  isDebitNormal: boolean;
};

/**
 * Resolve which app page originated a ledger entry and return the URL to open
 * for viewing / editing it directly (not a filtered list).
 *
 * Strategy: use the REFERENCE PREFIX as the primary routing key (not the
 * description text), so every sub-entry of a transaction (e.g. "AR transit
 * cleared", "VAT leg", "COGS leg") routes back to the same source document.
 *
 * Reference patterns:
 *   AUTO-SAL-YYYYMM-NNN  →  POS Sale (try first) or Sale Invoice
 *   AUTO-PO-YYYYMM-NNN   →  Purchase Invoice
 *   AUTO-SR-YYYYMM-NNN   →  Sale Return
 *   AUTO-PR-YYYYMM-NNN   →  Purchase Return
 *   RV-NNNNNN            →  Receipt Voucher
 *   PV-NNNNNN            →  Payment Voucher
 *   SLIP-*               →  Salary Slip
 *   JE-YYYYMM-NNN        →  Manual Journal Entry
 */
type SourceResult = { url: string; title: string; found: boolean };

function resolveSourceUrl(reference: string, _description: string): SourceResult {
  const srcRef = reference.startsWith("AUTO-") ? reference.slice(5) : reference;

  // ── AUTO-SAL-* → POS sale or sale invoice ──────────────────────────────────
  if (reference.startsWith("AUTO-SAL-") || srcRef.startsWith("SAL-")) {
    const sale = getSales().find(s => s.saleNumber === srcRef);
    if (sale) return { url: `/sales?open=${sale.id}`, title: `Open POS Sale: ${srcRef}`, found: true };
    const inv = getInvoices().find(i => i.invoiceNumber === srcRef);
    if (inv) return { url: `/invoices/${inv.id}`, title: `Open Sale Invoice: ${srcRef}`, found: true };
    return { url: `/sales?q=${encodeURIComponent(srcRef)}`, title: `Sale not found: ${srcRef}`, found: false };
  }

  // ── AUTO-INV-* → sale invoice ───────────────────────────────────────────────
  if (reference.startsWith("AUTO-INV-") || srcRef.startsWith("INV-")) {
    const inv = getInvoices().find(i => i.invoiceNumber === srcRef);
    if (inv) return { url: `/invoices/${inv.id}`, title: `Open Invoice: ${srcRef}`, found: true };
    return { url: `/invoices?q=${encodeURIComponent(srcRef)}`, title: `Invoice not found: ${srcRef}`, found: false };
  }

  // ── AUTO-PO-* → purchase invoice ───────────────────────────────────────────
  if (reference.startsWith("AUTO-PO-") || srcRef.startsWith("PO-")) {
    const inv = getInvoices().find(i => i.invoiceNumber === srcRef);
    if (inv) return { url: `/invoices/${inv.id}`, title: `Open Purchase Invoice: ${srcRef}`, found: true };
    return { url: `/invoices?type=purchase&q=${encodeURIComponent(srcRef)}`, title: `Purchase invoice not found: ${srcRef}`, found: false };
  }

  // ── AUTO-SR-* → sale return ────────────────────────────────────────────────
  if (reference.startsWith("AUTO-SR-") || srcRef.startsWith("SR-")) {
    const sr = getSaleReturns().find(r => r.returnNumber === srcRef);
    if (sr) return { url: `/returns?open=${sr.id}`, title: `Open Sale Return: ${srcRef}`, found: true };
    return { url: `/returns?q=${encodeURIComponent(srcRef)}`, title: `Sale return not found: ${srcRef}`, found: false };
  }

  // ── AUTO-PR-* → purchase return ────────────────────────────────────────────
  if (reference.startsWith("AUTO-PR-") || srcRef.startsWith("PR-")) {
    const pr = getPurchaseReturns().find(r => r.returnNumber === srcRef);
    if (pr) return { url: `/returns?tab=purchase&open=${pr.id}`, title: `Open Purchase Return: ${srcRef}`, found: true };
    return { url: `/returns?tab=purchase&q=${encodeURIComponent(srcRef)}`, title: `Purchase return not found: ${srcRef}`, found: false };
  }

  // ── RV-* / PV-* → receipt / payment voucher ───────────────────────────────
  if (reference.startsWith("RV-") || reference.startsWith("PV-")) {
    const v = getRPVouchers().find(v => v.voucherNumber === reference);
    if (v) return { url: `/receipt-payment?open=${v.id}`, title: `Open ${reference.startsWith("RV-") ? "Receipt" : "Payment"} Voucher: ${reference}`, found: true };
    return { url: `/receipt-payment?q=${encodeURIComponent(reference)}`, title: `Voucher not found: ${reference}`, found: false };
  }

  // ── SLIP-* → salary ────────────────────────────────────────────────────────
  if (reference.startsWith("SLIP-") || srcRef.startsWith("SLIP-")) {
    return { url: `/salary`, title: `Open Salary Slip: ${srcRef}`, found: true };
  }

  // ── Default: manual journal entry ──────────────────────────────────────────
  const je = getJournalEntries().find(j => j.reference === reference);
  if (je) return { url: `/journal-entry?open=${je.id}`, title: `Open Journal Entry: ${reference}`, found: true };
  return { url: `/journal-entry?q=${encodeURIComponent(reference)}`, title: `Journal entry not found: ${reference}`, found: false };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LedgerReportPage() {
  const { accounts, refresh: refreshAccounts } = useAccounts();
  const { entries,  refresh: refreshEntries  } = useJournalEntries();
  const { toast } = useToast();
  const sym = useMemo(() => getSettingsCurrencySymbol(), []);
  const [, navigate] = useLocation();

  const rawSearch = useSearch();
  const [accountId, setAccountId] = useState(() => new URLSearchParams(rawSearch).get("account") || "");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [statusFilter, setStatusFilter] = useState<"all" | "posted" | "draft">("posted");
  const [reconciling, setReconciling] = useState(false);
  const [dateOrder, setDateOrder] = useState<"asc" | "desc">("asc");

  const printRef = useRef<HTMLDivElement>(null);

  function shiftPeriod(dir: 1 | -1) {
    const d1 = new Date(from);
    const d2 = new Date(to);
    const days = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
    const shift = dir * days;
    d1.setDate(d1.getDate() + shift);
    d2.setDate(d2.getDate() + shift);
    setFrom(d1.toISOString().slice(0, 10));
    setTo(d2.toISOString().slice(0, 10));
  }

  function handleReconcile() {
    setReconciling(true);
    try {
      const result = reconcileAccountingData();
      refreshAccounts();
      refreshEntries();
      const added = result.accountsAdded;
      toast({
        title: "Reconciliation complete",
        description: added > 0
          ? `${added} system account${added !== 1 ? "s" : ""} added and accounting mappings verified.`
          : "Chart of Accounts is up to date — no changes needed.",
      });
    } finally {
      setReconciling(false);
    }
  }

  // Selected account
  const account = useMemo(() => accounts.find(a => a.id === accountId) ?? null, [accounts, accountId]);
  const debitNormal = account ? isDebitNormal(account.head) : true;

  // Payable / Receivable classification
  const isPayable    = account ? (
    (account.subType?.toLowerCase().includes("payable"))  ||
    account.head === "Liabilities"
  ) : false;
  const isReceivable = account ? (
    (account.subType?.toLowerCase().includes("receivable"))
  ) : false;

  // All posted entries that touch this account, across all time
  const allRelevant = useMemo(() => {
    if (!accountId) return [];
    return entries.filter(e => {
      const statusOk =
        statusFilter === "all" ? true :
        statusFilter === "posted" ? e.status === "posted" :
        e.status === "draft";
      return statusOk && e.lines.some(l => l.ledgerId === accountId);
    });
  }, [entries, accountId, statusFilter]);

  // Opening balance: sum of all relevant entries strictly BEFORE from date
  const openingBalance = useMemo(() => {
    let bal = 0;
    allRelevant
      .filter(e => e.date < from)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(e => {
        e.lines.filter(l => l.ledgerId === accountId).forEach(l => {
          bal += l.debit - l.credit;
        });
      });
    return bal;
  }, [allRelevant, from, accountId]);

  // In-range rows
  const rows = useMemo((): LedgerRow[] => {
    const inRange = allRelevant
      .filter(e => e.date >= from && e.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));

    let running = openingBalance;
    const result: LedgerRow[] = [];

    for (const e of inRange) {
      for (const l of e.lines.filter(line => line.ledgerId === accountId)) {
        running += l.debit - l.credit;
        result.push({
          date: e.date,
          reference: e.reference,
          description: e.description,
          narration: l.narration,
          debit: l.debit,
          credit: l.credit,
          balance: running,
          isDebitNormal: debitNormal,
        });
      }
    }

    return result;
  }, [allRelevant, from, to, openingBalance, accountId, debitNormal]);

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

  // ── Professional Print / PDF ────────────────────────────────────────────────

  function handlePrint() {
    if (!account) return;
    const s = getSettings();
    const generatedAt = new Date().toLocaleString();

    // ── helper to format balance for print ──
    const pLabel = (bal: number): string => {
      if (bal === 0) return "—";
      return debitNormal ? (bal > 0 ? "DR" : "CR") : (bal < 0 ? "CR" : "DR");
    };
    const pAbs = (bal: number): string =>
      Math.abs(bal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pNum = (n: number): string =>
      n === 0 ? "" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Build rows HTML
    let rowsHtml = "";

    // Opening row
    const obLabel = pLabel(openingBalance);
    rowsHtml += `
      <tr class="special-row">
        <td>${from}</td>
        <td></td>
        <td><span class="tag tag-bf">B/F</span> <strong>Opening Balance</strong></td>
        <td class="num">${openingBalance > 0 ? pNum(openingBalance) : ""}</td>
        <td class="num">${openingBalance < 0 ? pAbs(openingBalance) : ""}</td>
        <td class="num">
          ${openingBalance === 0 ? "—" : `${pAbs(openingBalance)} <span class="bal-badge ${obLabel === "DR" ? "badge-dr" : "badge-cr"}">${obLabel}</span>`}
        </td>
      </tr>`;

    // Transaction rows
    if (rows.length === 0) {
      rowsHtml += `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px">No transactions in selected period</td></tr>`;
    }
    rows.forEach((r, i) => {
      const bLabel = pLabel(r.balance);
      rowsHtml += `
        <tr class="${i % 2 === 1 ? "alt-row" : ""}">
          <td>${r.date}</td>
          <td><span class="ref">${r.reference}</span></td>
          <td>
            <div class="desc">${r.description}</div>
            ${r.narration && r.narration !== r.description ? `<div class="narr">${r.narration}</div>` : ""}
          </td>
          <td class="num dr-amt">${r.debit > 0 ? pNum(r.debit) : "—"}</td>
          <td class="num cr-amt">${r.credit > 0 ? pNum(r.credit) : "—"}</td>
          <td class="num">
            ${r.balance === 0 ? "—" : `${pAbs(r.balance)} <span class="bal-badge ${bLabel === "DR" ? "badge-dr" : "badge-cr"}">${bLabel}</span>`}
          </td>
        </tr>`;
    });

    // Totals row
    if (rows.length > 0) {
      rowsHtml += `
        <tr class="total-row">
          <td colspan="3"><strong>Period Totals</strong></td>
          <td class="num dr-amt"><strong>${pNum(totalDebit)}</strong></td>
          <td class="num cr-amt"><strong>${pNum(totalCredit)}</strong></td>
          <td></td>
        </tr>`;
    }

    // Closing row
    const cbLabel = pLabel(closingBalance);
    rowsHtml += `
      <tr class="closing-row">
        <td>${to}</td>
        <td></td>
        <td><span class="tag tag-cf">C/F</span> <strong>Closing Balance</strong></td>
        <td class="num">${closingBalance > 0 ? pNum(closingBalance) : ""}</td>
        <td class="num">${closingBalance < 0 ? pAbs(closingBalance) : ""}</td>
        <td class="num">
          ${closingBalance === 0 ? "—" : `${pAbs(closingBalance)} <span class="bal-badge ${cbLabel === "DR" ? "badge-dr" : "badge-cr"}">${cbLabel}</span>`}
        </td>
      </tr>`;

    // Company info parts
    const addrParts  = [s.addressHull, s.addressIslamabad].filter(Boolean).join(" & ");
    const phoneParts = [s.phoneHull,   s.phoneIslamabad  ].filter(Boolean).join(" / ");
    const locationLine = [addrParts, phoneParts].filter(Boolean).join(" | ");

    // Summary cards (after table)
    const obAbs = Math.abs(debitNormal ? openingBalance : -openingBalance);
    const cbAbs = Math.abs(debitNormal ? closingBalance : -closingBalance);
    const summaryHtml = `
      <div class="summary-section">
        <div class="summary-title">Summary</div>
        <div class="summary-grid">
          <div class="s-card">
            <div class="s-label">Opening Balance</div>
            <div class="s-value">${sym} ${obAbs.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
              ${openingBalance !== 0 ? `<span class="bal-badge ${obLabel === "DR" ? "badge-dr" : "badge-cr"}">${obLabel}</span>` : ""}
            </div>
          </div>
          <div class="s-card s-card-dr">
            <div class="s-label">Total Debits</div>
            <div class="s-value s-dr">${sym} ${totalDebit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          </div>
          <div class="s-card s-card-cr">
            <div class="s-label">Total Credits</div>
            <div class="s-value s-cr">${sym} ${totalCredit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          </div>
          <div class="s-card s-card-close">
            <div class="s-label">Closing Balance</div>
            <div class="s-value">${sym} ${cbAbs.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
              ${closingBalance !== 0 ? `<span class="bal-badge ${cbLabel === "DR" ? "badge-dr" : "badge-cr"}">${cbLabel}</span>` : ""}
            </div>
          </div>
        </div>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <title>Ledger Report – ${account.name}</title>
  <style>
    @page { size: A4; margin: 14mm 15mm 18mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }

    /* ── Company Header ── */
    .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 12px; border-bottom: 2.5px solid #059669; margin-bottom: 14px; }
    .company { font-size: 18px; font-weight: 800; color: #059669; letter-spacing: -0.5px; }
    .company-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 15px; font-weight: 700; color: #111; }
    .doc-title .period { font-size: 10px; color: #6b7280; margin-top: 4px; }
    .doc-title .printed { font-size: 9px; color: #9ca3af; margin-top: 2px; }

    /* ── Account & Period Info ── */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .info-block { padding: 9px 12px; }
    .info-block:not(:last-child) { border-right: 1px solid #e5e7eb; }
    .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; margin-bottom: 3px; }
    .info-value { font-size: 12px; font-weight: 700; color: #111; }
    .info-sub   { font-size: 10px; color: #6b7280; margin-top: 1px; }
    .badge-head { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 9px; font-weight: 700; background: #dbeafe; color: #1e40af; }
    .badge-normal-dr { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 9px; font-weight: 700; background: #d1fae5; color: #065f46; }
    .badge-normal-cr { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 9px; font-weight: 700; background: #fee2e2; color: #991b1b; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 4px; }
    thead tr { background: #1e3a8a; color: #fff; }
    thead th { padding: 8px 10px; text-align: left; font-size: 9.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }
    thead th.num { text-align: right; }
    tbody td { padding: 6.5px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .alt-row td { background: #f9fafb; }
    .special-row td, .closing-row td { background: #eef2ff !important; font-weight: 600; }
    .closing-row td { border-top: 2px solid #1e3a8a; }
    .total-row td { background: #f0fdf4 !important; border-top: 2px solid #bbf7d0; border-bottom: 2px solid #bbf7d0; font-weight: 700; }
    .ref { color: #1e3a8a; font-family: 'Courier New', monospace; font-weight: 700; font-size: 10.5px; }
    .desc { font-size: 11px; color: #111; }
    .narr { font-size: 9.5px; color: #6b7280; margin-top: 1px; }
    .dr-amt { color: #065f46; font-weight: 600; }
    .cr-amt { color: #991b1b; font-weight: 600; }
    .tag { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 800; letter-spacing: 0.3px; margin-right: 4px; }
    .tag-bf { background: #e5e7eb; color: #4b5563; }
    .tag-cf { background: #dbeafe; color: #1e40af; }
    .bal-badge { display: inline-block; padding: 0px 5px; border-radius: 3px; font-size: 8.5px; font-weight: 800; letter-spacing: 0.3px; margin-left: 3px; }
    .badge-dr { background: #d1fae5; color: #065f46; }
    .badge-cr { background: #fee2e2; color: #991b1b; }

    /* ── Summary Section ── */
    .summary-section { margin-top: 16px; }
    .summary-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .s-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
    .s-card-dr { border-color: #bbf7d0; background: #f0fdf4; }
    .s-card-cr { border-color: #fecaca; background: #fff5f5; }
    .s-card-close { border-color: #bfdbfe; background: #eff6ff; }
    .s-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px; }
    .s-value { font-size: 14px; font-weight: 800; color: #111; }
    .s-dr { color: #065f46; }
    .s-cr { color: #991b1b; }

    /* ── Footer ── */
    .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; }
    .print-bar { display: flex; justify-content: center; gap: 12px; padding: 14px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
    .btn { padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: #1e3a8a; color: white; }
    .btn-secondary { background: white; color: #374151; border: 1px solid #d1d5db; }
    @media print {
      .print-bar { display: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- Print toolbar (hidden on actual print) -->
  <div class="print-bar">
    <button class="btn btn-primary" onclick="window.print()">🖨 Print / Save as PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
  </div>

  <div style="padding: 16px 18px;">

    <!-- Header -->
    <div class="header">
      <div>
        <div class="company">${s.companyName || "Onesoft"}</div>
        <div class="company-sub">${locationLine}</div>
      </div>
      <div class="doc-title">
        <h1>Ledger Report</h1>
        <div class="period">Period: ${from} — ${to}</div>
        <div class="printed">Printed: ${generatedAt}</div>
      </div>
    </div>

    <!-- Account & Period Info -->
    <div class="info-grid">
      <div class="info-block">
        <div class="info-label">Account</div>
        <div class="info-value">${account.name}</div>
        <div class="info-sub">Code: <strong>${account.code}</strong></div>
      </div>
      <div class="info-block">
        <div class="info-label">Classification</div>
        <div class="info-value">
          <span class="badge-head">${account.head}</span>&nbsp;
          <span class="${debitNormal ? "badge-normal-dr" : "badge-normal-cr"}">${debitNormal ? "Debit Normal" : "Credit Normal"}</span>
        </div>
        <div class="info-sub">${account.subType || account.accountType}</div>
      </div>
      <div class="info-block">
        <div class="info-label">Report Period</div>
        <div class="info-value">${from} &rarr; ${to}</div>
        <div class="info-sub">Status: <strong>${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}</strong> &nbsp;&middot;&nbsp; ${rows.length} transaction${rows.length !== 1 ? "s" : ""}</div>
      </div>
    </div>

    <!-- Ledger Table -->
    <table>
      <thead>
        <tr>
          <th style="width:110px">Date</th>
          <th style="width:160px">Ref #</th>
          <th>Description / Narration</th>
          <th class="num" style="width:110px">Debit (${sym})</th>
          <th class="num" style="width:110px">Credit (${sym})</th>
          <th class="num" style="width:130px">Balance (${sym})</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Summary after table -->
    ${summaryHtml}

    <!-- Footer -->
    <div class="footer">
      <span>${s.companyName || "Onesoft"} &nbsp;&middot;&nbsp; Ledger Report &nbsp;&middot;&nbsp; ${account.name} (${account.code})</span>
      <span>All amounts in ${sym} &nbsp;&middot;&nbsp; Running balance: positive = DR (debit-normal), negative = CR (credit-normal)</span>
    </div>

  </div>
</body></html>`;

    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen size={15} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-foreground leading-tight">Ledger Report</h1>
            <p className="text-[11px] text-muted-foreground">Account statement with running balance</p>
          </div>
        </div>

        {/* Account selector */}
        <AccountSelector accounts={accounts} value={accountId} onChange={setAccountId} />

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Calendar size={14} className="text-muted-foreground" />
          <button
            type="button"
            onClick={() => shiftPeriod(-1)}
            title="Previous period"
            className="h-9 w-8 flex items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
          >
            <ChevronLeft size={15} />
          </button>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-9 text-sm w-[140px]" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-9 text-sm w-[140px]" />
          <button
            type="button"
            onClick={() => shiftPeriod(1)}
            title="Next period"
            className="h-9 w-8 flex items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Status filter */}
        <div className="flex rounded-lg border border-input overflow-hidden text-sm">
          {(["posted", "all", "draft"] as const).map(s => (
            <button key={s} type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 h-9 capitalize transition-colors
                ${statusFilter === s
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={handleReconcile}
            disabled={reconciling}
            title="Reconcile COA — reseed system accounts and verify accounting mappings"
            className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/20"
          >
            <RefreshCw size={14} className={reconciling ? "animate-spin" : ""} />
            Reconcile
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!accountId}>
            <Printer size={14} className="mr-1.5" /> Print
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={!accountId}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            <FileDown size={14} className="mr-1.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* ── No account selected placeholder ─────────────────────────────────── */}
      {!accountId && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <BookOpen size={28} className="opacity-40" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Select an Account</p>
            <p className="text-sm mt-1">Choose a ledger account above to generate its statement</p>
          </div>
        </div>
      )}

      {/* ── Report ──────────────────────────────────────────────────────────── */}
      {accountId && account && (
        <div className="flex-1 overflow-auto px-6 py-5">

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: "Opening Balance",
                value: fmt(Math.abs(absBalance(openingBalance, debitNormal)), sym),
                side: openingBalance === 0 ? "" : balanceLabel(openingBalance, debitNormal),
                icon: BarChart3,
                color: "bg-slate-50 dark:bg-slate-900/40",
                iconColor: "text-slate-500",
              },
              {
                label: "Total Debits",
                value: fmt(totalDebit, sym),
                side: totalDebit > 0 ? "DR" : "",
                icon: TrendingUp,
                color: "bg-emerald-50 dark:bg-emerald-950/20",
                iconColor: "text-emerald-600",
              },
              {
                label: "Total Credits",
                value: fmt(totalCredit, sym),
                side: totalCredit > 0 ? "CR" : "",
                icon: TrendingDown,
                color: "bg-rose-50 dark:bg-rose-950/20",
                iconColor: "text-rose-600",
              },
              {
                label: "Closing Balance",
                value: fmt(Math.abs(absBalance(closingBalance, debitNormal)), sym),
                side: closingBalance === 0 ? "" : balanceLabel(closingBalance, debitNormal),
                icon: BookOpen,
                color: "bg-primary/5",
                iconColor: "text-primary",
              },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border border-border p-4 ${c.color}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <c.icon size={14} className={c.iconColor} />
                  <span className="text-[11px] text-muted-foreground font-medium">{c.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-bold text-foreground">{c.value}</span>
                  {c.side && (
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded
                      ${c.side === "DR" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"}`}
                    >{c.side}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Printable content */}
          <div ref={printRef}>

            {/* Print-only header */}
            <div className="hidden print:block mb-4">
              <h1 className="text-xl font-bold">Ledger Report</h1>
              <p>{account.code} — {account.name} &nbsp;|&nbsp; {account.head}</p>
              <p>Period: {from} to {to} &nbsp;|&nbsp; Status: {statusFilter}</p>
            </div>

            {/* Account info bar */}
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-muted/30 border border-border">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-medium">Account</span>
                <span className="text-sm font-bold text-foreground">{account.name}</span>
                <span className="text-[11px] font-mono text-muted-foreground">{account.code}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{account.head}</span>
                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{account.subType ?? account.accountType}</span>
                <span className={`px-2 py-0.5 rounded-full font-semibold
                  ${debitNormal ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"}`}
                >{debitNormal ? "Debit Normal" : "Credit Normal"}</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {/* Pay / Receive — open full PV/SV form pre-filled with this account */}
                {isPayable && (
                  <button
                    onClick={() => {
                      const outstanding = Math.abs(absBalance(closingBalance, debitNormal));
                      const p = new URLSearchParams({
                        type:        "payment",
                        accountId:   accountId,
                        accountName: account?.name ?? "",
                        partyName:   account?.name ?? "",
                        amount:      outstanding.toFixed(2),
                      });
                      navigate(`/receipt-payment?${p.toString()}`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold shadow-sm transition-colors print:hidden"
                    title={closingBalance === 0 ? "Create a payment voucher for this account" : `Pay outstanding balance ${sym} ${Math.abs(absBalance(closingBalance, debitNormal)).toFixed(2)}`}
                  >
                    <ArrowDownCircle size={13}/> Pay
                  </button>
                )}
                {isReceivable && (
                  <button
                    onClick={() => {
                      const outstanding = Math.abs(absBalance(closingBalance, debitNormal));
                      const p = new URLSearchParams({
                        type:        "receipt",
                        accountId:   accountId,
                        accountName: account?.name ?? "",
                        partyName:   account?.name ?? "",
                        amount:      outstanding.toFixed(2),
                      });
                      navigate(`/receipt-payment?${p.toString()}`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-sm transition-colors print:hidden"
                    title={closingBalance === 0 ? "Create a receipt voucher for this account" : `Receive outstanding balance ${sym} ${Math.abs(absBalance(closingBalance, debitNormal)).toFixed(2)}`}
                  >
                    <ArrowUpCircle size={13}/> Receive
                  </button>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {from} → {to} &nbsp;·&nbsp; {rows.length} transactions
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">
                      <button
                        type="button"
                        onClick={() => setDateOrder(o => o === "asc" ? "desc" : "asc")}
                        className="flex items-center gap-1 group/sort hover:text-foreground transition-colors"
                        title={dateOrder === "asc" ? "Showing oldest first — click for newest first" : "Showing newest first — click for oldest first"}
                      >
                        Date
                        <span className="flex flex-col -space-y-0.5">
                          <ArrowUp size={9} className={dateOrder === "asc" ? "text-primary" : "text-muted-foreground/40 group-hover/sort:text-muted-foreground"} />
                          <ArrowDown size={9} className={dateOrder === "desc" ? "text-primary" : "text-muted-foreground/40 group-hover/sort:text-muted-foreground"} />
                        </span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[175px]">Ref #</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Description / Narration</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">Debit</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[120px]">Credit</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-[140px]">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening Balance row */}
                  <tr className="bg-slate-50/80 dark:bg-slate-900/30 border-b border-dashed border-border">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">{from}</td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">B/F</span>
                        <span className="text-[12px] font-semibold text-foreground">Opening Balance</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {openingBalance > 0 ? fmtN(openingBalance) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {openingBalance < 0 ? fmtN(Math.abs(openingBalance)) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <BalanceCell balance={openingBalance} debitNormal={debitNormal} />
                    </td>
                  </tr>

                  {/* Transaction rows */}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No transactions found for this account in the selected period
                      </td>
                    </tr>
                  )}
                  {(dateOrder === "desc" ? [...rows].reverse() : rows).map((row, i) => (
                    <tr key={i}
                      className={`border-b border-border/60 transition-colors hover:bg-muted/30 group
                        ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground font-medium whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const { url, title, found } = resolveSourceUrl(row.reference, row.description);
                          const handleOpen = () => {
                            if (!found) {
                              toast({
                                title: "Source document not found",
                                description: `${row.reference} — the original record may have been deleted or not yet synced.`,
                                variant: "destructive",
                                duration: 5000,
                              });
                              return;
                            }
                            navigate(url);
                          };
                          const handleOpenTab = () => {
                            if (!found) {
                              toast({
                                title: "Source document not found",
                                description: `${row.reference} — the original record may have been deleted or not yet synced.`,
                                variant: "destructive",
                                duration: 5000,
                              });
                              return;
                            }
                            window.open(`/admin-dashboard${url}`, "_blank");
                          };
                          return (
                            <div className="flex items-center gap-1.5">
                              <button
                                title={found ? title : `⚠ Source not found: ${row.reference}`}
                                onClick={handleOpen}
                                className={`text-[12px] font-mono font-semibold hover:underline cursor-pointer text-left ${
                                  found ? "text-primary" : "text-amber-500 line-through decoration-amber-400"
                                }`}
                              >
                                {row.reference}
                              </button>
                              {!found && (
                                <span title="Source document not found — record may have been deleted" className="text-amber-500 flex-shrink-0">
                                  ⚠
                                </span>
                              )}
                              {found && (
                                <button
                                  title={`Open in new tab: ${row.reference}`}
                                  onClick={handleOpenTab}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary flex-shrink-0"
                                >
                                  <ExternalLink size={11} />
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-[13px] font-medium text-foreground leading-tight">{row.description}</div>
                        {row.narration && row.narration !== row.description && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">{row.narration}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {row.debit > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[13px]">
                            {fmtN(row.debit)}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {row.credit > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold text-[13px]">
                            {fmtN(row.credit)}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <BalanceCell balance={row.balance} debitNormal={debitNormal} />
                      </td>
                    </tr>
                  ))}

                  {/* Totals row */}
                  {rows.length > 0 && (
                    <tr className="bg-primary/5 border-t-2 border-primary/20">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <span className="text-[12px] font-bold text-foreground">Period Totals</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[13px] tabular-nums">
                          {fmtN(totalDebit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-rose-600 dark:text-rose-400 font-bold text-[13px] tabular-nums">
                          {fmtN(totalCredit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" />
                    </tr>
                  )}

                  {/* Closing balance row */}
                  <tr className="bg-primary/8 dark:bg-primary/10 border-t border-primary/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground font-medium">{to}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary">C/F</span>
                        <span className="text-[12px] font-bold text-foreground">Closing Balance</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {closingBalance > 0 ? fmtN(closingBalance) : ""}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {closingBalance < 0 ? fmtN(Math.abs(closingBalance)) : ""}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <BalanceCell balance={closingBalance} debitNormal={debitNormal} large />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              All amounts in {sym} &nbsp;·&nbsp; Positive balance = DR for debit-normal accounts (Assets, Expense), CR for credit-normal
            </p>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Balance Cell ─────────────────────────────────────────────────────────────

function BalanceCell({
  balance,
  debitNormal,
  large = false,
}: {
  balance: number;
  debitNormal: boolean;
  large?: boolean;
}) {
  const label = balanceLabel(balance, debitNormal);
  const abs   = Math.abs(balance);
  const isDR  = label === "DR";
  const isCR  = label === "CR";

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className={`tabular-nums ${large ? "text-[14px] font-bold" : "text-[13px] font-semibold"} text-foreground`}>
        {abs === 0 ? "—" : abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      {abs > 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
          ${isDR ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                 : isCR ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" : ""}`}
        >{label}</span>
      )}
    </div>
  );
}
