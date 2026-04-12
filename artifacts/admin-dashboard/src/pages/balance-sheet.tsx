import React, { useState, useMemo, useCallback } from "react";
import { Account, AccountHead, ACCOUNT_HEADS, reconcileAccountingData } from "@/lib/store";
import { useAccounts, useJournalEntries } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp,
  CheckCircle, AlertTriangle, Minus, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Constants ────────────────────────────────────────────────────────────────

const BS_HEADS: AccountHead[] = ["Assets", "Liabilities", "Equity"];

const HEAD_BASE_CODE: Record<AccountHead, string> = {
  "Assets":           "1",
  "Liabilities":      "2",
  "Revenue / Income": "3",
  "Expense":          "4",
  "Equity":           "5",
};

const HEAD_STYLE: Record<AccountHead, {
  bg: string; text: string; border: string; badgeBg: string; dot: string; subtotalBg: string;
}> = {
  "Assets":           { bg: "bg-blue-50 dark:bg-blue-950/20",       text: "text-blue-700 dark:text-blue-300",       border: "border-blue-200 dark:border-blue-800",       badgeBg: "bg-blue-600",    dot: "bg-blue-500",    subtotalBg: "bg-blue-50/60 dark:bg-blue-950/10"    },
  "Liabilities":      { bg: "bg-rose-50 dark:bg-rose-950/20",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200 dark:border-rose-800",       badgeBg: "bg-rose-600",    dot: "bg-rose-500",    subtotalBg: "bg-rose-50/60 dark:bg-rose-950/10"    },
  "Revenue / Income": { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", badgeBg: "bg-emerald-600", dot: "bg-emerald-500", subtotalBg: "bg-emerald-50/60 dark:bg-emerald-950/10" },
  "Expense":          { bg: "bg-orange-50 dark:bg-orange-950/20",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200 dark:border-orange-800",   badgeBg: "bg-orange-600",  dot: "bg-orange-500",  subtotalBg: "bg-orange-50/60 dark:bg-orange-950/10"  },
  "Equity":           { bg: "bg-violet-50 dark:bg-violet-950/20",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-200 dark:border-violet-800",   badgeBg: "bg-violet-600",  dot: "bg-violet-500",  subtotalBg: "bg-violet-50/60 dark:bg-violet-950/10"  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** JE movement map: ledgerId → total posted debits & credits */
type JeMap = Record<string, { dr: number; cr: number }>;

/**
 * Each account head's NORMAL balance side — determines the direction
 * of the accounting equation regardless of the ledger's individual
 * `paymentType` field (which may not be set correctly for older accounts).
 *
 * Assets / Expense   → Debit-normal  (Dr increases, Cr decreases)
 * Liabilities / Revenue / Equity → Credit-normal (Cr increases, Dr decreases)
 *
 * Using head (not paymentType) guarantees Assets = Liabilities + Equity
 * because every balanced JE has ΣDr = ΣCr.
 */
const HEAD_NORMAL: Record<AccountHead, "Debit" | "Credit"> = {
  "Assets":           "Debit",
  "Liabilities":      "Credit",
  "Revenue / Income": "Credit",
  "Expense":          "Debit",
  "Equity":           "Credit",
};

/**
 * Compute a ledger account's running balance:
 *   openingBalance  +  JE movements in the head's normal direction
 */
function ledgerBalance(account: Account, jeMap: JeMap): number {
  const opening = account.openingBalance ?? 0;
  const je = jeMap[account.id] ?? { dr: 0, cr: 0 };
  return HEAD_NORMAL[account.head] === "Debit"
    ? opening + je.dr - je.cr
    : opening + je.cr - je.dr;
}

/** Recursively sum all Ledger descendant balances for a given node. */
function subtreeBalance(accounts: Account[], nodeId: string, jeMap: JeMap): number {
  const node = accounts.find(a => a.id === nodeId);
  if (!node) return 0;
  if (node.accountType === "Ledger") return ledgerBalance(node, jeMap);
  return accounts
    .filter(a => (a.parentId ?? null) === nodeId)
    .reduce((sum, child) => sum + subtreeBalance(accounts, child.id, jeMap), 0);
}

/** Flat tree row for rendering */
type TreeRow = {
  account: Account;
  depth: number;
  hasChildren: boolean;
  balance: number; // subtree total for groups; own balance for ledgers
};

function buildTree(
  accounts: Account[],
  headAccounts: Account[],
  parentId: string | null,
  depth: number,
  collapsed: Record<string, boolean>,
  jeMap: JeMap,
): TreeRow[] {
  const children = headAccounts
    .filter(a => (a.parentId ?? null) === parentId)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const rows: TreeRow[] = [];
  for (const acc of children) {
    const hasChildren = headAccounts.some(a => (a.parentId ?? null) === acc.id);
    const balance = acc.accountType === "Ledger"
      ? ledgerBalance(acc, jeMap)
      : subtreeBalance(accounts, acc.id, jeMap);
    rows.push({ account: acc, depth, hasChildren, balance });
    if (hasChildren && !collapsed[acc.id]) {
      rows.push(...buildTree(accounts, headAccounts, acc.id, depth + 1, collapsed, jeMap));
    }
  }
  return rows;
}

// ─── Balance row component ────────────────────────────────────────────────────

function BalanceRow({
  row,
  s,
  collapsed,
  onToggle,
}: {
  row: TreeRow;
  s: typeof HEAD_STYLE[AccountHead];
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const { account: acc, depth, hasChildren, balance } = row;
  const isLedger = acc.accountType === "Ledger";
  const pt = acc.paymentType ?? "Debit";
  const isCollapsed = collapsed[acc.id];

  // indent: 16px per depth level beyond 0
  const indentPx = depth * 20;

  return (
    <div
      className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 min-h-[36px] transition-colors ${
        isLedger
          ? "hover:bg-gray-50/60 dark:hover:bg-zinc-800/20"
          : `cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-950/10`
      } ${!acc.isActive ? "opacity-40" : ""}`}
      onClick={() => hasChildren && onToggle(acc.id)}
    >
      {/* Tree indent + toggle */}
      <div className="flex-shrink-0 flex items-center" style={{ width: 32 + indentPx }}>
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); onToggle(acc.id); }}
            className="ml-auto mr-1 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-400 transition-colors"
          >
            {isCollapsed
              ? <ChevronRight size={12} />
              : <ChevronDown  size={12} />}
          </button>
        ) : (
          <div className="ml-auto mr-1 w-[14px] flex items-center justify-center">
            <Minus size={8} className="text-gray-200 dark:text-zinc-700" />
          </div>
        )}
      </div>

      {/* Code */}
      <div className={`w-24 flex-shrink-0 font-mono text-[11px] font-bold pr-2 ${s.text} ${isLedger ? "opacity-70" : ""}`}>
        {acc.code}
      </div>

      {/* Name + type badge */}
      <div className="flex-1 min-w-0 flex items-center gap-2 pr-4">
        <span className={`truncate ${
          isLedger
            ? "text-[12px] italic text-gray-600 dark:text-gray-400"
            : depth === 0
            ? "text-[13px] font-bold text-gray-800 dark:text-gray-100"
            : "text-[12px] font-semibold text-gray-800 dark:text-gray-100"
        }`}>
          {acc.name}
        </span>
        {isLedger && (
          <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
            pt === "Debit"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
              : "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
          }`}>
            {pt === "Debit" ? "Dr" : "Cr"}
          </span>
        )}
      </div>

      {/* Balance amount */}
      <div className="w-44 flex-shrink-0 text-right pr-4">
        {balance !== 0 ? (
          <span className={`font-mono text-[12px] font-semibold ${
            isLedger ? "text-gray-700 dark:text-gray-300" : `font-bold ${s.text}`
          }`}>
            {fmt(balance)}
          </span>
        ) : (
          <span className="text-[12px] font-mono text-gray-300 dark:text-zinc-700">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const { accounts, refresh: refreshAccounts } = useAccounts();
  const { entries,  refresh: refreshEntries  } = useJournalEntries();
  const { toast } = useToast();

  const [collapsed, setCollapsed]         = useState<Record<string, boolean>>({});
  const [headCollapsed, setHeadCollapsed] = useState<Record<string, boolean>>({});
  const [reconciling, setReconciling]     = useState(false);

  const handleReconcile = useCallback(() => {
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
  }, [refreshAccounts, refreshEntries, toast]);

  const toggle      = useCallback((id: string) => setCollapsed(p => ({ ...p, [id]: !p[id] })), []);
  const toggleHead  = useCallback((h: string)  => setHeadCollapsed(p => ({ ...p, [h]: !p[h] })), []);

  // Expand / collapse all nodes
  const expandAll = useCallback(() => {
    setCollapsed({});
    setHeadCollapsed({});
  }, []);

  const collapseAll = useCallback(() => {
    const allIds: Record<string, boolean> = {};
    accounts.filter(a => a.accountType === "Group").forEach(a => { allIds[a.id] = true; });
    setCollapsed(allIds);
    const heads: Record<string, boolean> = {};
    BS_HEADS.forEach(h => { heads[h] = true; });
    setHeadCollapsed(heads);
  }, [accounts]);

  /** Pre-compute: for every ledger, sum posted JE debits & credits */
  const jeMap = useMemo<JeMap>(() => {
    const map: JeMap = {};
    for (const entry of entries) {
      if (entry.status !== "posted") continue;
      for (const line of entry.lines) {
        if (!map[line.ledgerId]) map[line.ledgerId] = { dr: 0, cr: 0 };
        map[line.ledgerId].dr += line.debit  ?? 0;
        map[line.ledgerId].cr += line.credit ?? 0;
      }
    }
    return map;
  }, [entries]);

  // Head-level subtotals (includes JE movements)
  const headTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const head of BS_HEADS) {
      const headAccounts = accounts.filter(a => a.head === head);
      const roots = headAccounts.filter(a => !a.parentId);
      result[head] = roots.reduce((s, r) => s + subtreeBalance(accounts, r.id, jeMap), 0);
    }
    return result;
  }, [accounts, jeMap]);

  const totalAssets      = headTotals["Assets"]      ?? 0;
  const totalLiabilities = headTotals["Liabilities"] ?? 0;
  const totalEquity      = headTotals["Equity"]      ?? 0;
  const totalLiabEquity  = totalLiabilities + totalEquity;
  const isBalanced       = Math.abs(totalAssets - totalLiabEquity) < 0.005;

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <LayoutDashboard size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">Balance Sheet</h1>
              <p className="text-[11px] text-gray-400">As of {today}</p>
            </div>
          </div>

          {/* Balance check pill */}
          <div className="flex items-center gap-3">
            {isBalanced ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                <CheckCircle size={12} />
                <span className="text-[11px] font-bold">Balanced</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
                <AlertTriangle size={12} />
                <span className="text-[11px] font-bold">Unbalanced</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={expandAll}
                title="Expand all"
                className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ChevronsDown size={13} /> Expand all
              </button>
              <button
                onClick={collapseAll}
                title="Collapse all"
                className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ChevronsUp size={13} /> Collapse all
              </button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReconcile}
                disabled={reconciling}
                title="Reconcile COA — reseed system accounts and verify accounting mappings"
                className="ml-1 gap-1.5 h-7 px-2.5 text-[11px] border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/20"
              >
                <RefreshCw size={12} className={reconciling ? "animate-spin" : ""} />
                Reconcile
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">

        {/* ── Summary cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {(["Assets", "Liabilities", "Equity"] as AccountHead[]).map(head => {
            const s = HEAD_STYLE[head];
            const total = headTotals[head] ?? 0;
            return (
              <div key={head} className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>{head}</span>
                </div>
                <div className={`text-[20px] font-bold font-mono ${s.text}`}>
                  {fmt(total)}
                </div>
                <div className={`text-[10px] mt-0.5 ${s.text} opacity-60`}>Opening balance total</div>
              </div>
            );
          })}
        </div>

        {/* ── Tree table ──────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">

          {/* Column headers */}
          <div className="flex items-center pl-2 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <div className="w-8 flex-shrink-0" />
            <div className="w-24 flex-shrink-0">Code</div>
            <div className="flex-1">Account Name</div>
            <div className="w-44 text-right">Balance</div>
          </div>

          {/* Heads */}
          {BS_HEADS.map(head => {
            const s = HEAD_STYLE[head];
            const headAccounts = accounts
              .filter(a => a.head === head)
              .map(a => ({ ...a, parentId: a.parentId ?? null }));
            const rows = buildTree(accounts, headAccounts, null, 0, collapsed, jeMap);
            const headTotal = headTotals[head] ?? 0;
            const isHCollapsed = headCollapsed[head];

            return (
              <div key={head}>
                {/* Head section header */}
                <div
                  className={`flex items-center gap-2 px-4 py-2.5 border-b ${s.border} ${s.bg} cursor-pointer select-none`}
                  onClick={() => toggleHead(head)}
                >
                  <button
                    onClick={e => { e.stopPropagation(); toggleHead(head); }}
                    className={`p-0.5 rounded ${s.text} hover:opacity-70`}
                  >
                    {isHCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <span className={`font-mono text-[12px] font-extrabold opacity-60 ${s.text}`}>
                    {HEAD_BASE_CODE[head]}
                  </span>
                  <span className={`text-[12px] font-bold uppercase tracking-wider flex-1 ${s.text}`}>{head}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${s.badgeBg}`}>
                    {headAccounts.length} acct{headAccounts.length !== 1 ? "s" : ""}
                  </span>
                  {/* Head total */}
                  <span className={`font-mono text-[13px] font-bold ml-4 min-w-[100px] text-right ${s.text}`}>
                    {fmt(headTotal)}
                  </span>
                </div>

                {/* Tree rows */}
                {!isHCollapsed && (
                  rows.length === 0 ? (
                    <div className="px-10 py-4 text-[12px] text-gray-400 italic border-b border-gray-100 dark:border-zinc-800">
                      No accounts yet. Add accounts in Chart of Accounts.
                    </div>
                  ) : (
                    <>
                      {rows.map(row => (
                        <BalanceRow
                          key={row.account.id}
                          row={row}
                          s={s}
                          collapsed={collapsed}
                          onToggle={toggle}
                        />
                      ))}

                      {/* Head subtotal row */}
                      <div className={`flex items-center px-4 py-2 border-t ${s.border} ${s.subtotalBg}`}>
                        <div className="w-8 flex-shrink-0" />
                        <div className="w-24 flex-shrink-0" />
                        <div className={`flex-1 text-[11px] font-bold uppercase tracking-wide ${s.text}`}>
                          Total {head}
                        </div>
                        <div className={`w-44 text-right pr-4 font-mono text-[13px] font-bold ${s.text}`}>
                          {fmt(headTotal)}
                        </div>
                      </div>
                    </>
                  )
                )}
              </div>
            );
          })}

          {/* ── Grand balance footer ─────────────────────────────────────────── */}
          <div className="border-t-2 border-gray-200 dark:border-zinc-700">

            {/* Assets row */}
            <div className="flex items-center px-4 py-2.5 border-b border-gray-100 dark:border-zinc-800 bg-blue-50/50 dark:bg-blue-950/10">
              <div className="flex-1 text-[12px] font-bold text-blue-700 dark:text-blue-400">Total Assets</div>
              <div className="w-44 text-right pr-4 font-mono text-[14px] font-bold text-blue-700 dark:text-blue-400">
                {fmt(totalAssets)}
              </div>
            </div>

            {/* Liabilities + Equity row */}
            <div className="flex items-center px-4 py-2.5 border-b border-gray-100 dark:border-zinc-800 bg-violet-50/50 dark:bg-violet-950/10">
              <div className="flex-1 text-[12px] font-bold text-violet-700 dark:text-violet-400">Total Liabilities + Equity</div>
              <div className="w-44 text-right pr-4 font-mono text-[14px] font-bold text-violet-700 dark:text-violet-400">
                {fmt(totalLiabEquity)}
              </div>
            </div>

            {/* Balance check */}
            <div className={`flex items-center px-4 py-3 ${
              isBalanced
                ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                : "bg-red-50/70 dark:bg-red-950/20"
            }`}>
              {isBalanced ? (
                <>
                  <CheckCircle size={14} className="text-emerald-600 dark:text-emerald-400 mr-2 flex-shrink-0" />
                  <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-400 flex-1">
                    Balance Sheet is balanced — Assets = Liabilities + Equity
                  </span>
                  <span className="font-mono text-[14px] font-bold text-emerald-700 dark:text-emerald-400 w-44 text-right pr-4">
                    {fmt(totalAssets)}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle size={14} className="text-red-600 dark:text-red-400 mr-2 flex-shrink-0" />
                  <span className="text-[12px] font-bold text-red-600 dark:text-red-400 flex-1">
                    Unbalanced — difference: {fmt(Math.abs(totalAssets - totalLiabEquity))}
                  </span>
                  <span className="font-mono text-[14px] font-bold text-red-600 dark:text-red-400 w-44 text-right pr-4">
                    {fmt(Math.abs(totalAssets - totalLiabEquity))}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
