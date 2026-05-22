import { useState, useMemo, useRef } from "react";
import { useAccounts, useJournalEntries } from "@/hooks/use-data";
import { getCashBankLedgers, getJournalEntries, getSettings } from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { Printer, Calendar, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string      { return new Date().toISOString().slice(0, 10); }
function monthStart(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

const sym = getSettingsCurrencySymbol();
const dp  = getSettingsDecimalPlaces();

function fmt(n: number): string {
  if (n === 0) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ColId = string;

type SummaryRow = {
  head:    string;
  amounts: Record<ColId, number>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RpSummaryPage() {
  const { accounts } = useAccounts();
  const { entries }  = useJournalEntries();

  const [from, setFrom] = useState(monthStart);
  const [to,   setTo]   = useState(today);
  const [recSearch, setRecSearch] = useState("");
  const [paySearch, setPaySearch] = useState("");

  const printRef = useRef<HTMLDivElement>(null);

  // ── Cash & Bank columns ────────────────────────────────────────────────────
  const cbCols = useMemo(() => getCashBankLedgers(), [accounts]);
  const cbIds  = useMemo(() => new Set(cbCols.map(a => a.id)), [cbCols]);

  // ── Opening balance per column (openingBalance field + pre-period JE movements) ──
  const openingBalance = useMemo(() => {
    const ob: Record<ColId, number> = {};
    cbCols.forEach(a => { ob[a.id] = parseFloat(String(a.openingBalance || 0)) || 0; });

    // Add JE movements before the start date (normalise to YYYY-MM-DD)
    getJournalEntries().forEach(je => {
      if (je.status !== "posted") return;
      if (je.date.slice(0, 10) >= from) return;
      je.lines.forEach(l => {
        if (!cbIds.has(l.ledgerId)) return;
        ob[l.ledgerId] = (ob[l.ledgerId] ?? 0) + l.debit - l.credit;
      });
    });
    return ob;
  }, [cbCols, cbIds, from, entries]);

  // ── Account name lookup (id → name) ───────────────────────────────────────
  const acctName = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach(a => m.set(a.id, a.name));
    return m;
  }, [accounts]);

  // ── Receipt & Payment rows from JEs within date range ─────────────────────
  // One row per COUNTERPART ledger — never combined. For a JE with two
  // credit lines (e.g. "Owner 1" + "Owner 2") and one CB-debit line, two
  // receipt rows are produced, each carrying its own line amount. When a JE
  // touches multiple CB ledgers on the same side, each counterpart line's
  // amount is split across the CB columns proportionally to each CB line's
  // share of the total CB movement on that side.
  const { receiptRows, paymentRows } = useMemo(() => {
    const recMap = new Map<string, Record<ColId, number>>();
    const payMap = new Map<string, Record<ColId, number>>();

    // Normalise to YYYY-MM-DD so full ISO timestamps compare correctly
    const posted = entries.filter(je => {
      if (je.status !== "posted") return false;
      const d = je.date.slice(0, 10);
      return d >= from && d <= to;
    });

    const addRow = (
      map: Map<string, Record<ColId, number>>,
      head: string,
      colId: ColId,
      amount: number,
    ) => {
      if (amount === 0) return;
      if (!map.has(head)) map.set(head, {});
      const row = map.get(head)!;
      row[colId] = (row[colId] ?? 0) + amount;
    };

    posted.forEach(je => {
      const cbLines    = je.lines.filter(l =>  cbIds.has(l.ledgerId));
      const nonCbLines = je.lines.filter(l => !cbIds.has(l.ledgerId));

      // CB-debit side (cash IN) shares — proportions of each CB ledger
      const cbDebitLines  = cbLines.filter(l => l.debit  > 0);
      const cbCreditLines = cbLines.filter(l => l.credit > 0);
      const totalCbDebit  = cbDebitLines.reduce((s, l)  => s + l.debit,  0);
      const totalCbCredit = cbCreditLines.reduce((s, l) => s + l.credit, 0);

      // Receipts: each non-CB credit line becomes its own row. To keep the
      // report rows summing exactly to actual CB movement (so totals don't
      // overshoot when a JE mixes non-CB debits and credits, e.g. bank fees
      // netted off a customer receipt), each line's share of the total
      // non-CB credits is scaled to totalCbDebit, then split across the CB
      // debit ledgers proportionally to each CB line's share.
      const nonCbCreditLines = nonCbLines.filter(l => l.credit > 0);
      const sumNonCbCredit   = nonCbCreditLines.reduce((s, l) => s + l.credit, 0);
      if (totalCbDebit > 0 && sumNonCbCredit > 0) {
        nonCbCreditLines.forEach(line => {
          const head = acctName.get(line.ledgerId) || line.narration || je.description || je.reference;
          const lineCashShare = (line.credit / sumNonCbCredit) * totalCbDebit;
          cbDebitLines.forEach(cb => {
            const share = (lineCashShare * cb.debit) / totalCbDebit;
            addRow(recMap, head, cb.ledgerId, share);
          });
        });
      } else if (totalCbDebit > 0) {
        // CB-only receipt (no non-CB counterpart) — fall back to JE description
        const head = je.description || je.reference || "(unspecified)";
        cbDebitLines.forEach(cb => addRow(recMap, head, cb.ledgerId, cb.debit));
      }

      // Payments: symmetric — scale non-CB debit lines to actual totalCbCredit.
      const nonCbDebitLines = nonCbLines.filter(l => l.debit > 0);
      const sumNonCbDebit   = nonCbDebitLines.reduce((s, l) => s + l.debit, 0);
      if (totalCbCredit > 0 && sumNonCbDebit > 0) {
        nonCbDebitLines.forEach(line => {
          const head = acctName.get(line.ledgerId) || line.narration || je.description || je.reference;
          const lineCashShare = (line.debit / sumNonCbDebit) * totalCbCredit;
          cbCreditLines.forEach(cb => {
            const share = (lineCashShare * cb.credit) / totalCbCredit;
            addRow(payMap, head, cb.ledgerId, share);
          });
        });
      } else if (totalCbCredit > 0) {
        const head = je.description || je.reference || "(unspecified)";
        cbCreditLines.forEach(cb => addRow(payMap, head, cb.ledgerId, cb.credit));
      }
    });

    const toRows = (map: Map<string, Record<ColId, number>>): SummaryRow[] =>
      Array.from(map.entries()).map(([head, amounts]) => ({ head, amounts }));

    return { receiptRows: toRows(recMap), paymentRows: toRows(payMap) };
  }, [entries, accounts, acctName, cbIds, from, to]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  // Sum of receipt rows only (excludes Opening Balance) — used by Balance Check
  const recMovement = useMemo(() => {
    const t: Record<ColId, number> = {};
    cbCols.forEach(c => { t[c.id] = 0; });
    receiptRows.forEach(r => cbCols.forEach(c => { t[c.id] = (t[c.id] ?? 0) + (r.amounts[c.id] ?? 0); }));
    return t;
  }, [receiptRows, cbCols]);

  // Sum of payment rows only (excludes Closing Balance) — used by Balance Check
  const payMovement = useMemo(() => {
    const t: Record<ColId, number> = {};
    cbCols.forEach(c => { t[c.id] = 0; });
    paymentRows.forEach(r => cbCols.forEach(c => { t[c.id] = (t[c.id] ?? 0) + (r.amounts[c.id] ?? 0); }));
    return t;
  }, [paymentRows, cbCols]);

  const closingBalance = useMemo(() => {
    const cb: Record<ColId, number> = {};
    cbCols.forEach(c => {
      cb[c.id] = (openingBalance[c.id] ?? 0) + (recMovement[c.id] ?? 0) - (payMovement[c.id] ?? 0);
    });
    return cb;
  }, [openingBalance, recMovement, payMovement, cbCols]);

  // Traditional R&P account: BOTH sides must balance.
  //   Receipt Total = Opening Balance + Sum of receipts
  //   Payment Total = Sum of payments + Closing Balance
  // With these definitions, recTotals[c] === payTotals[c] for every column.
  const recTotals = useMemo(() => {
    const t: Record<ColId, number> = {};
    cbCols.forEach(c => { t[c.id] = (openingBalance[c.id] ?? 0) + (recMovement[c.id] ?? 0); });
    return t;
  }, [openingBalance, recMovement, cbCols]);

  const payTotals = useMemo(() => {
    const t: Record<ColId, number> = {};
    cbCols.forEach(c => { t[c.id] = (payMovement[c.id] ?? 0) + (closingBalance[c.id] ?? 0); });
    return t;
  }, [payMovement, closingBalance, cbCols]);

  const recSubTotal = useMemo(() => cbCols.reduce((s, c) => s + (recTotals[c.id] ?? 0), 0), [recTotals, cbCols]);
  const paySubTotal = useMemo(() => cbCols.reduce((s, c) => s + (payTotals[c.id] ?? 0), 0), [payTotals, cbCols]);

  // ── Filtered rows (search) ─────────────────────────────────────────────────
  const filteredRec = useMemo(() => {
    const q = recSearch.toLowerCase();
    if (!q) return receiptRows;
    return receiptRows.filter(r => r.head.toLowerCase().includes(q));
  }, [receiptRows, recSearch]);

  const filteredPay = useMemo(() => {
    const q = paySearch.toLowerCase();
    if (!q) return paymentRows;
    return paymentRows.filter(r => r.head.toLowerCase().includes(q));
  }, [paymentRows, paySearch]);

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const s           = getSettings();
    const generatedAt = new Date().toLocaleString();
    const addrParts   = [s.addressHull, s.addressIslamabad].filter(Boolean).join(" & ");
    const phoneParts  = [s.phoneHull,   s.phoneIslamabad  ].filter(Boolean).join(" / ");
    const locationLine = [addrParts, phoneParts].filter(Boolean).join(" | ");

    // ── Build column header cells ──────────────────────────────────────────
    const colHeaders = cbCols.map(c => `<th class="num">${c.name}</th>`).join("");

    // ── Opening / Closing row builders ────────────────────────────────────
    const buildSpecialRow = (label: string, balances: Record<ColId, number>, cls: string) => {
      const cells = cbCols.map(c => {
        const v = balances[c.id] ?? 0;
        const color = v < 0 ? "style=\"color:#991b1b\"" : "";
        return `<td class="num" ${color}>${v === 0 ? "0.00" : Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>`;
      }).join("");
      return `<tr class="${cls}"><td class="sl">—</td><td>${label}</td>${cells}</tr>`;
    };

    // ── Transaction row builder ───────────────────────────────────────────
    const buildRows = (rows: SummaryRow[], startIdx: number) =>
      rows.map((r, i) => {
        const cells = cbCols.map(c => {
          const v = r.amounts[c.id] ?? 0;
          return `<td class="num">${v > 0 ? v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}</td>`;
        }).join("");
        return `<tr class="${(i + startIdx) % 2 === 1 ? "alt-row" : ""}"><td class="sl">${i + 1}</td><td>${r.head}</td>${cells}</tr>`;
      }).join("");

    // ── Total row builder ─────────────────────────────────────────────────
    const buildTotalRow = (totals: Record<ColId, number>, label: string, cls: string) => {
      const cells = cbCols.map(c => {
        const v = totals[c.id] ?? 0;
        return `<td class="num"><strong>${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td>`;
      }).join("");
      return `<tr class="${cls}"><td colspan="2"><strong>${label}</strong></td>${cells}</tr>`;
    };

    // ── Subtotal row ──────────────────────────────────────────────────────
    const buildSubTotalRow = (subTotal: number, colorCls: string) =>
      `<tr class="subtotal-row">
        <td colspan="${2 + cbCols.length}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>Sub Total</span>
            <strong class="${colorCls}" style="font-size:14px;">${sym}${Math.abs(subTotal).toLocaleString(undefined,{minimumFractionDigits:dp,maximumFractionDigits:dp})}</strong>
          </div>
        </td>
      </tr>`;

    // ── Empty row ─────────────────────────────────────────────────────────
    const buildEmptyRow = (label: string, colCount: number) =>
      `<tr><td colspan="${2 + colCount}" style="text-align:center;color:#9ca3af;padding:20px 10px;font-size:10px;">${label}</td></tr>`;

    // ── Build table HTML (receipt side) ──────────────────────────────────
    const recTableHtml = `
      <table>
        <thead>
          <tr>
            <th class="sl-col">Sl</th>
            <th>Voucher Head</th>
            ${colHeaders}
          </tr>
        </thead>
        <tbody>
          ${buildSpecialRow("Opening Balance", openingBalance, "special-row")}
          ${receiptRows.length > 0 ? buildRows(receiptRows, 1) : buildEmptyRow("No receipt transactions found for this period", cbCols.length)}
        </tbody>
        <tfoot>
          ${buildTotalRow(recTotals, "Total", "total-row rec-total")}
          ${buildSubTotalRow(recSubTotal, "sub-rec")}
        </tfoot>
      </table>`;

    // ── Build table HTML (payment side) ──────────────────────────────────
    const payTableHtml = `
      <table>
        <thead>
          <tr>
            <th class="sl-col">Sl</th>
            <th>Voucher Head</th>
            ${colHeaders}
          </tr>
        </thead>
        <tbody>
          ${paymentRows.length > 0 ? buildRows(paymentRows, 0) : buildEmptyRow("No payment transactions found for this period", cbCols.length)}
          ${buildSpecialRow("Closing Balance", closingBalance, "closing-row")}
        </tbody>
        <tfoot>
          ${buildTotalRow(payTotals, "Total", "total-row pay-total")}
          ${buildSubTotalRow(paySubTotal, "sub-pay")}
        </tfoot>
      </table>`;

    // ── Balance check section ─────────────────────────────────────────────
    const balanceCards = cbCols.map(c => {
      const ob    = openingBalance[c.id] ?? 0;
      const rec   = recMovement[c.id] ?? 0;
      const pay   = payMovement[c.id] ?? 0;
      const close = closingBalance[c.id] ?? 0;
      const fv = (n: number) => Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:dp,maximumFractionDigits:dp});
      return `
        <div class="bal-card">
          <div class="bal-label">${c.name}</div>
          <div class="bal-value ${close < 0 ? "neg" : ""}">${sym}${fv(close)}</div>
          <div class="bal-sub">${sym}${fv(ob)} + ${sym}${fv(rec)} − ${sym}${fv(pay)}</div>
        </div>`;
    }).join("");

    const recMovTot   = cbCols.reduce((s, c) => s + (recMovement[c.id] ?? 0), 0);
    const payMovTot   = cbCols.reduce((s, c) => s + (payMovement[c.id] ?? 0), 0);
    const netCashFlow = recMovTot - payMovTot;
    const fv2 = (n: number) => Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:dp,maximumFractionDigits:dp});
    const balanceSectionHtml = `
      <div class="balance-section">
        <div class="bal-inner">
          <span class="bal-title">Balance Check</span>
          <div class="bal-cards">
            ${balanceCards}
            <div class="bal-card net-card">
              <div class="bal-label">Net Cash Flow</div>
              <div class="bal-value ${netCashFlow < 0 ? "neg" : "pos"}">
                ${netCashFlow >= 0 ? "+" : ""}${sym}${fv2(netCashFlow)}
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <title>Receipt &amp; Payment Summary – ${from} to ${to}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 14mm 16mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }

    /* ── Print toolbar ── */
    .print-bar { display: flex; justify-content: center; gap: 12px; padding: 14px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
    .btn { padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: #1e3a8a; color: white; }
    .btn-secondary { background: white; color: #374151; border: 1px solid #d1d5db; }
    @media print { .print-bar { display: none !important; } }

    /* ── Page wrapper ── */
    .page { padding: 0 2px; }

    /* ── Company Header ── */
    .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 10px; border-bottom: 2.5px solid #059669; margin-bottom: 12px; }
    .company { font-size: 18px; font-weight: 800; color: #059669; letter-spacing: -0.5px; }
    .company-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 15px; font-weight: 700; color: #111; }
    .doc-title .period { font-size: 10px; color: #6b7280; margin-top: 4px; }
    .doc-title .printed { font-size: 9px; color: #9ca3af; margin-top: 2px; }

    /* ── Two-column grid ── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .panel-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
    .panel-title.rec { color: #059669; }
    .panel-title.pay { color: #dc2626; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    thead tr { background: #1e3a8a; color: #fff; }
    thead th { padding: 7px 8px; text-align: left; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
    thead th.num { text-align: right; }
    thead th.sl-col { width: 28px; text-align: center; }
    tbody td { padding: 5.5px 8px; border-bottom: 1px solid #f0f0f0; }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.sl { text-align: center; color: #9ca3af; font-size: 10px; }
    .alt-row td { background: #f9fafb; }
    .special-row td { background: #eff6ff !important; font-weight: 600; color: #1e40af; }
    .closing-row td { background: #eff6ff !important; font-weight: 600; color: #1e40af; border-top: 2px solid #bfdbfe; }
    tfoot td { padding: 6px 8px; }
    tfoot td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td { border-top: 2px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    .rec-total td { background: #f0fdf4; color: #065f46; }
    .pay-total td { background: #fff5f5; color: #991b1b; }
    .subtotal-row td { padding: 5px 8px; font-weight: 700; font-size: 11px; }
    .rec-total ~ .subtotal-row td, .subtotal-row.rec-st td { background: #dcfce7; }
    .pay-total ~ .subtotal-row td, .subtotal-row.pay-st td { background: #fee2e2; }
    .sub-rec { color: #065f46; }
    .sub-pay { color: #991b1b; }

    /* ── Balance check ── */
    .balance-section { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; }
    .bal-inner { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .bal-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; white-space: nowrap; }
    .bal-cards { display: flex; gap: 20px; flex-wrap: wrap; }
    .bal-card { text-align: center; }
    .bal-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #6b7280; margin-bottom: 2px; }
    .bal-value { font-size: 13px; font-weight: 800; color: #111; }
    .bal-value.neg { color: #dc2626; }
    .bal-value.pos { color: #16a34a; }
    .bal-sub { font-size: 9px; color: #9ca3af; margin-top: 1px; }
    .net-card { border-left: 1px solid #e5e7eb; padding-left: 20px; }

    /* ── Footer ── */
    .footer { margin-top: 14px; padding-top: 7px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Toolbar (hidden on print) -->
  <div class="print-bar">
    <button class="btn btn-primary" onclick="window.print()">🖨 Print / Save as PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
  </div>

  <div class="page" style="padding:16px 18px;">

    <!-- Header -->
    <div class="header">
      <div>
        <div class="company">${s.companyName || "Onesoft"}</div>
        <div class="company-sub">${locationLine}</div>
      </div>
      <div class="doc-title">
        <h1>Receipt &amp; Payment Summary</h1>
        <div class="period">Period: ${from} &mdash; ${to}</div>
        <div class="printed">Printed: ${generatedAt}</div>
      </div>
    </div>

    <!-- Two-column report -->
    <div class="two-col">
      <div>
        <div class="panel-title rec">Receipt</div>
        ${recTableHtml}
      </div>
      <div>
        <div class="panel-title pay">Payment</div>
        ${payTableHtml}
      </div>
    </div>

    <!-- Balance Check -->
    ${balanceSectionHtml}

    <!-- Footer -->
    <div class="footer">
      <span>${s.companyName || "Onesoft"} &nbsp;&middot;&nbsp; Receipt &amp; Payment Summary &nbsp;&middot;&nbsp; ${from} to ${to}</span>
      <span>All amounts in ${sym} &nbsp;&middot;&nbsp; Generated: ${generatedAt}</span>
    </div>

  </div>
</body></html>`;

    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  // ── Panel renderer ─────────────────────────────────────────────────────────
  const renderPanel = (
    type: "receipt" | "payment",
    rows: SummaryRow[],
    search: string,
    setSearch: (v: string) => void,
    totals: Record<ColId, number>,
    subTotal: number,
  ) => {
    const isReceipt = type === "receipt";
    const color     = isReceipt ? "emerald" : "rose";
    const title     = isReceipt ? "Receipt" : "Payment";

    // Opening Balance row only on Receipt; Closing Balance row only on Payment
    const openRow = isReceipt ? (
      <tr className="bg-blue-50 dark:bg-blue-950/20 font-semibold text-[12px]">
        <td className="px-3 py-2 text-center text-muted-foreground">—</td>
        <td className="px-3 py-2 text-blue-700 dark:text-blue-400">Opening Balance</td>
        {cbCols.map(c => (
          <td key={c.id} className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-400">
            {fmt(openingBalance[c.id] ?? 0)}
          </td>
        ))}
      </tr>
    ) : null;

    const closeRow = !isReceipt ? (
      <tr className="bg-blue-50 dark:bg-blue-950/20 font-semibold text-[12px]">
        <td className="px-3 py-2 text-center text-muted-foreground">—</td>
        <td className="px-3 py-2 text-blue-700 dark:text-blue-400">Closing Balance</td>
        {cbCols.map(c => (
          <td key={c.id} className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-400">
            {fmt(closingBalance[c.id] ?? 0)}
          </td>
        ))}
      </tr>
    ) : null;

    return (
      <div className="flex flex-col gap-3 min-w-0">
        {/* Panel header */}
        <div className="flex items-center justify-between">
          <h2 className={`text-[15px] font-bold text-${color}-700 dark:text-${color}-400`}>{title}</h2>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 pl-7 text-xs w-40"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-8">Sl</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[150px]">Voucher Head</th>
                {cbCols.map(c => (
                  <th key={c.id} className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[90px]">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {openRow}
              {rows.map((row, i) => (
                <tr key={row.head} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                  <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{row.head}</td>
                  {cbCols.map(c => (
                    <td key={c.id} className="px-3 py-2 text-right tabular-nums text-foreground">
                      {(row.amounts[c.id] ?? 0) > 0 ? fmt(row.amounts[c.id]) : <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={2 + cbCols.length} className="px-3 py-8 text-center text-muted-foreground text-[11px]">
                    No {title.toLowerCase()} transactions found for this period
                  </td>
                </tr>
              )}
              {closeRow}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 border-${color}-200 dark:border-${color}-800 bg-${color}-50 dark:bg-${color}-950/20 font-bold text-[12px]`}>
                <td className="px-3 py-2.5" colSpan={2}>Total</td>
                {cbCols.map(c => (
                  <td key={c.id} className={`px-3 py-2.5 text-right tabular-nums text-${color}-700 dark:text-${color}-400`}>
                    {fmt(totals[c.id] ?? 0)}
                  </td>
                ))}
              </tr>
              <tr className={`bg-${color}-100/60 dark:bg-${color}-950/30 font-bold text-[12px]`}>
                <td className="px-3 py-2" colSpan={2 + cbCols.length}>
                  <div className="flex items-center justify-between">
                    <span className={`text-${color}-800 dark:text-${color}-300`}>Sub Total</span>
                    <span className={`font-black text-[14px] text-${color}-700 dark:text-${color}-400 tabular-nums`}>
                      {sym}{fmt(subTotal)}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-black tracking-tight text-foreground flex items-center gap-2">
            Receipt & Payment Summary
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Cash & Bank movements by voucher head — {from} to {to}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range */}
          <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-3 h-9">
            <Calendar size={13} className="text-muted-foreground shrink-0" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-transparent text-[12px] text-foreground outline-none w-[110px]" />
            <span className="text-muted-foreground text-[11px]">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-transparent text-[12px] text-foreground outline-none w-[110px]" />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5"
            onClick={() => { setFrom(monthStart()); setTo(today()); }}>
            <RefreshCw size={13} /> This Month
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 print:hidden" onClick={handlePrint}>
            <Printer size={13} /> Print
          </Button>
        </div>
      </div>

      {/* No columns warning */}
      {cbCols.length === 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
          No active Cash & Bank accounts found. Please configure them under Accounts → Cash & Bank Accounts.
        </div>
      )}

      {/* Two-panel report */}
      <div ref={printRef} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {renderPanel("receipt", filteredRec, recSearch, setRecSearch, recTotals, recSubTotal)}
        {renderPanel("payment", filteredPay, paySearch, setPaySearch, payTotals, paySubTotal)}
      </div>

      {/* Balance check */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 flex items-center justify-between flex-wrap gap-4">
        <span className="text-[12px] text-muted-foreground font-medium">Balance Check</span>
        <div className="flex items-center gap-6 flex-wrap">
          {cbCols.map(c => {
            const ob    = openingBalance[c.id] ?? 0;
            const rec   = recMovement[c.id] ?? 0;
            const pay   = payMovement[c.id] ?? 0;
            const close = closingBalance[c.id] ?? 0;
            return (
              <div key={c.id} className="text-center">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{c.name}</p>
                <p className="text-[13px] font-bold text-foreground tabular-nums mt-0.5">{sym}{fmt(close)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {sym}{fmt(ob)} + {sym}{fmt(rec)} − {sym}{fmt(pay)}
                </p>
              </div>
            );
          })}
          {(() => {
            const recMovTot = cbCols.reduce((s, c) => s + (recMovement[c.id] ?? 0), 0);
            const payMovTot = cbCols.reduce((s, c) => s + (payMovement[c.id] ?? 0), 0);
            const net = recMovTot - payMovTot;
            return (
              <div className="text-center border-l border-border pl-6">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Net Cash Flow</p>
                <p className={`text-[13px] font-bold tabular-nums mt-0.5 ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {net >= 0 ? "+" : ""}{sym}{fmt(net)}
                </p>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #root > * { display: none !important; }
          .print\\:hidden { display: none !important; }
          [data-rp-summary-print] { display: block !important; }
        }
      `}</style>
    </div>
  );
}
