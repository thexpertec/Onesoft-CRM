import { useState, useMemo, useCallback, useEffect } from "react";
import { Account, AccountHead, AccountKind, ACCOUNT_HEADS, HEAD_SUB_TYPES } from "@/lib/store";
import { useAccounts } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Plus, Search, X, Trash2, Save, Pencil,
  CheckCircle, XCircle, ChevronDown, ChevronRight,
  GitBranch, FolderOpen, FileText,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Head visual config ───────────────────────────────────────────────────────
const HEAD_STYLE: Record<AccountHead, {
  bg: string; text: string; border: string; badgeBg: string; dot: string;
}> = {
  "Assets":           { bg: "bg-blue-50 dark:bg-blue-950/20",       text: "text-blue-700 dark:text-blue-300",       border: "border-blue-200 dark:border-blue-800",       badgeBg: "bg-blue-600",    dot: "bg-blue-500"    },
  "Liabilities":      { bg: "bg-rose-50 dark:bg-rose-950/20",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200 dark:border-rose-800",       badgeBg: "bg-rose-600",    dot: "bg-rose-500"    },
  "Revenue / Income": { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", badgeBg: "bg-emerald-600", dot: "bg-emerald-500" },
  "Expense":          { bg: "bg-orange-50 dark:bg-orange-950/20",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200 dark:border-orange-800",   badgeBg: "bg-orange-600",  dot: "bg-orange-500"  },
  "Equity":           { bg: "bg-violet-50 dark:bg-violet-950/20",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-200 dark:border-violet-800",   badgeBg: "bg-violet-600",  dot: "bg-violet-500"  },
};

// ─── Tree utilities ───────────────────────────────────────────────────────────
type FlatRow = Account & { depth: number; hasChildren: boolean };

function buildFlatRows(
  headAccounts: Account[],
  parentId: string | null,
  depth: number,
  collapsed: Record<string, boolean>,
): FlatRow[] {
  const children = headAccounts
    .filter(a => (a.parentId ?? null) === parentId)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const result: FlatRow[] = [];
  for (const acc of children) {
    const hasChildren = headAccounts.some(a => (a.parentId ?? null) === acc.id);
    result.push({ ...acc, depth, hasChildren });
    if (hasChildren && !collapsed[acc.id]) {
      result.push(...buildFlatRows(headAccounts, acc.id, depth + 1, collapsed));
    }
  }
  return result;
}

function getDescendantIds(accounts: Account[], id: string): Set<string> {
  const result = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    accounts.filter(a => a.parentId === cur).forEach(c => { result.add(c.id); queue.push(c.id); });
  }
  return result;
}

function getPath(accounts: Account[], acc: Account): string {
  const parts: string[] = [acc.name];
  let cur: Account | undefined = acc;
  let safety = 0;
  while (cur?.parentId && safety++ < 20) {
    const parent = accounts.find(a => a.id === cur!.parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    cur = parent;
  }
  return parts.join(" › ");
}

/** Suggest the next auto-code for a new child of `parent` (or root if null). */
function suggestCode(
  parent: Account | null,
  head: AccountHead,
  allAccounts: Account[],
  offset = 0,
): string {
  if (!parent) {
    const rootCount = allAccounts.filter(a => a.head === head && !a.parentId).length;
    return String(rootCount + offset + 1);
  }
  const siblings = allAccounts.filter(a => a.parentId === parent.id);
  const nums = siblings
    .map(s => { const p = s.code.split("."); return parseInt(p[p.length - 1]); })
    .filter(n => !isNaN(n));
  const maxN = nums.length > 0 ? Math.max(...nums) : 0;
  return `${parent.code}.${maxN + offset + 1}`;
}

// ─── Modal types ──────────────────────────────────────────────────────────────
type LedgerEntry = { _key: string; code: string; name: string; openingBalance: string; subType: string };

type ModalState = {
  open: boolean;
  head: AccountHead;         // selected head (may change)
  headLocked: boolean;       // true when triggered from a specific head/account
  parentId: string | null;   // selected parent account id (may change)
  accountType: AccountKind;
  groupCode: string;
  groupName: string;
  groupSubType: string;
  ledgerEntries: LedgerEntry[];
};

const defaultModal = (
  parentId: string | null,
  head: AccountHead,
  headLocked: boolean,
  allAccounts: Account[],
): ModalState => {
  const parent = parentId ? (allAccounts.find(a => a.id === parentId) ?? null) : null;
  const code0 = suggestCode(parent, head, allAccounts);
  return {
    open: true,
    head,
    headLocked,
    parentId,
    accountType: "Group",
    groupCode: code0,
    groupName: "",
    groupSubType: HEAD_SUB_TYPES[head][0],
    ledgerEntries: [{
      _key: crypto.randomUUID(),
      code: code0,
      name: "",
      openingBalance: "0",
      subType: HEAD_SUB_TYPES[head][0],
    }],
  };
};

// ─── Edit form type ───────────────────────────────────────────────────────────
type EditForm = Omit<Account, "id" | "createdAt" | "updatedAt">;

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ChartOfAccountsPage() {
  const { accounts, addAccount, editAccount, removeAccount } = useAccounts();
  const { toast } = useToast();

  const [activeHead,    setActiveHead]    = useState<"All" | AccountHead>("All");
  const [search,        setSearch]        = useState("");
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [nodeCollapsed, setNodeCollapsed] = useState<Record<string, boolean>>({});
  const [headCollapsed, setHeadCollapsed] = useState<Record<string, boolean>>({});

  // ── Create modal ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalState | null>(null);

  // ── Edit panel (inline) ───────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<EditForm | null>(null);
  const [showEdit,   setShowEdit]   = useState(false);

  // ── Counts ───────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: accounts.length };
    ACCOUNT_HEADS.forEach(h => { c[h] = accounts.filter(a => a.head === h).length; });
    return c;
  }, [accounts]);

  // ── Search ───────────────────────────────────────────────────────────────────
  const isSearching = search.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) return null;
    const q = search.toLowerCase();
    return accounts
      .filter(a =>
        (activeHead === "All" || a.head === activeHead) &&
        (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
         a.subType.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      )
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, activeHead, search, isSearching]);

  // ── Open create modal ─────────────────────────────────────────────────────────
  const openCreate = useCallback((parent: Account | null, head: AccountHead) => {
    setShowEdit(false);
    setEditingId(null);
    // headLocked = true when triggered from a specific account row (head cannot change)
    setModal(defaultModal(parent?.id ?? null, head, parent !== null, accounts));
  }, [accounts]);

  // Change head inside modal (unlocked mode only) – resets parent & re-suggests code
  const handleModalHeadChange = useCallback((h: AccountHead) => {
    if (!modal) return;
    const code0 = suggestCode(null, h, accounts);
    setModal(m => m ? {
      ...m,
      head: h,
      parentId: null,
      groupSubType: HEAD_SUB_TYPES[h][0],
      groupCode: code0,
      ledgerEntries: m.ledgerEntries.map((e, i) => ({
        ...e,
        code: suggestCode(null, h, accounts, i),
        subType: HEAD_SUB_TYPES[h][0],
      })),
    } : m);
  }, [modal, accounts]);

  // Change parent inside modal – re-suggests code
  const handleModalParentChange = useCallback((parentId: string | null) => {
    if (!modal) return;
    const parent = parentId ? (accounts.find(a => a.id === parentId) ?? null) : null;
    const code0 = suggestCode(parent, modal.head, accounts);
    setModal(m => m ? {
      ...m,
      parentId,
      groupCode: code0,
      ledgerEntries: m.ledgerEntries.map((e, i) => ({
        ...e,
        code: suggestCode(parent, modal.head, accounts, i),
      })),
    } : m);
  }, [modal, accounts]);

  // ── Open edit inline ─────────────────────────────────────────────────────────
  const openEdit = (acc: Account) => {
    setModal(null);
    setEditingId(acc.id);
    setEditForm({
      code: acc.code, name: acc.name, head: acc.head, subType: acc.subType,
      description: acc.description, parentId: acc.parentId ?? null,
      accountType: acc.accountType ?? "Group",
      openingBalance: acc.openingBalance ?? 0,
      isActive: acc.isActive,
    });
    setShowEdit(true);
  };

  const closeEdit = () => { setShowEdit(false); setEditingId(null); setEditForm(null); };

  const setEF = <K extends keyof EditForm>(k: K, v: EditForm[K]) =>
    setEditForm(f => f ? { ...f, [k]: v } : f);

  const handleEditSave = useCallback(() => {
    if (!editForm || !editingId) return;
    if (!editForm.code.trim() || !editForm.name.trim()) {
      toast({ title: "Code and Name are required", variant: "destructive" }); return;
    }
    const dup = accounts.find(a => a.code.trim() === editForm.code.trim() && a.id !== editingId);
    if (dup) { toast({ title: `Code "${editForm.code}" already in use`, variant: "destructive" }); return; }
    editAccount(editingId, editForm);
    toast({ title: "Account updated" });
    closeEdit();
  }, [editForm, editingId, accounts, editAccount, toast]);

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  const closeModal = () => setModal(null);

  const setModalType = (t: AccountKind) => {
    if (!modal) return;
    const parent = modal.parentId ? (accounts.find(a => a.id === modal.parentId) ?? null) : null;
    const head = modal.head;
    if (t === "Ledger") {
      setModal(m => m ? {
        ...m,
        accountType: "Ledger",
        ledgerEntries: [{
          _key: crypto.randomUUID(),
          code: suggestCode(parent, head, accounts),
          name: "",
          openingBalance: "0",
          subType: HEAD_SUB_TYPES[head][0],
        }],
      } : m);
    } else {
      setModal(m => m ? {
        ...m,
        accountType: "Group",
        groupCode: suggestCode(parent, head, accounts),
        groupName: "",
        groupSubType: HEAD_SUB_TYPES[head][0],
      } : m);
    }
  };

  const addLedgerEntry = () => {
    if (!modal) return;
    const idx = modal.ledgerEntries.length;
    const parent = modal.parentId ? (accounts.find(a => a.id === modal.parentId) ?? null) : null;
    setModal(m => m ? {
      ...m,
      ledgerEntries: [...m.ledgerEntries, {
        _key: crypto.randomUUID(),
        code: suggestCode(parent, modal.head, accounts, idx),
        name: "",
        openingBalance: "0",
        subType: HEAD_SUB_TYPES[modal.head][0],
      }],
    } : m);
  };

  const removeLedgerEntry = (key: string) =>
    setModal(m => m ? { ...m, ledgerEntries: m.ledgerEntries.filter(e => e._key !== key) } : m);

  const updateLedgerEntry = (key: string, field: keyof Omit<LedgerEntry, "_key">, value: string) =>
    setModal(m => m ? {
      ...m,
      ledgerEntries: m.ledgerEntries.map(e => e._key === key ? { ...e, [field]: value } : e),
    } : m);

  const handleModalSave = useCallback(() => {
    if (!modal) return;
    const { parentId, head, accountType } = modal;

    if (accountType === "Group") {
      const code = modal.groupCode.trim();
      const name = modal.groupName.trim();
      if (!code || !name) { toast({ title: "Code and Name are required", variant: "destructive" }); return; }
      const dup = accounts.find(a => a.code === code);
      if (dup) { toast({ title: `Code "${code}" already in use`, variant: "destructive" }); return; }
      addAccount({
        code, name, head, subType: modal.groupSubType,
        description: "", parentId, accountType: "Group", openingBalance: 0, isActive: true,
      });
      toast({ title: "Group account created" });
      if (parentId) setNodeCollapsed(p => ({ ...p, [parentId]: false }));
    } else {
      // Ledger – can be multiple entries
      const entries = modal.ledgerEntries;
      if (entries.some(e => !e.name.trim() || !e.code.trim())) {
        toast({ title: "Each entry needs a Code and Name", variant: "destructive" }); return;
      }
      const codes = entries.map(e => e.code.trim());
      const allCodes = accounts.map(a => a.code);
      const dupCode = codes.find(c => allCodes.includes(c));
      if (dupCode) { toast({ title: `Code "${dupCode}" already in use`, variant: "destructive" }); return; }
      const dupWithin = codes.find((c, i) => codes.indexOf(c) !== i);
      if (dupWithin) { toast({ title: `Duplicate code "${dupWithin}" in entries`, variant: "destructive" }); return; }

      entries.forEach(e => {
        addAccount({
          code: e.code.trim(), name: e.name.trim(), head, subType: e.subType,
          description: "", parentId, accountType: "Ledger",
          openingBalance: parseFloat(e.openingBalance) || 0, isActive: true,
        });
      });
      toast({ title: `${entries.length} ledger${entries.length > 1 ? "s" : ""} created` });
      if (parentId) setNodeCollapsed(p => ({ ...p, [parentId]: false }));
    }
    closeModal();
  }, [modal, accounts, addAccount, toast]);

  // ── Delete ────────────────────────────────────────────────────────────────────
  const hasChildren = (id: string) => accounts.some(a => (a.parentId ?? null) === id);
  const accountToDelete = accounts.find(a => a.id === deleteId);

  // ── Edit parent options ───────────────────────────────────────────────────────
  const editParentOptions = useMemo(() => {
    if (!editForm || !editingId) return [];
    const excluded = new Set([editingId, ...getDescendantIds(accounts, editingId)]);
    const opts: { id: string; label: string; depth: number }[] = [];
    function walk(parentId: string | null, depth: number) {
      accounts
        .filter(a => a.head === editForm!.head && (a.parentId ?? null) === parentId && !excluded.has(a.id))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        .forEach(a => { opts.push({ id: a.id, label: `${a.code} — ${a.name}`, depth }); walk(a.id, depth + 1); });
    }
    walk(null, 0);
    return opts;
  }, [accounts, editForm, editingId]);

  // ── Row renderer ─────────────────────────────────────────────────────────────
  const INDENT_W = 22;

  const renderRow = (acc: FlatRow, ri: number) => {
    const s = HEAD_STYLE[acc.head];
    const isLedger = acc.accountType === "Ledger";
    return (
      <div
        key={acc.id}
        onClick={() => openCreate(acc, acc.head)}
        className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 group transition-colors min-h-[40px] cursor-pointer ${
          !acc.isActive ? "opacity-40" : ri % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"
        } hover:bg-blue-50/50 dark:hover:bg-blue-950/20`}
      >
        {/* Tree indent + toggle */}
        <div className="flex items-center flex-shrink-0 pl-3" style={{ width: 44 + acc.depth * INDENT_W }}>
          {acc.depth > 0 && (
            <div className="flex items-center flex-shrink-0" style={{ width: acc.depth * INDENT_W }}>
              {Array.from({ length: acc.depth }).map((_, di) => (
                <span
                  key={di}
                  className={`flex-shrink-0 font-mono ${di === acc.depth - 1 ? "text-gray-400 dark:text-zinc-500" : "text-transparent"}`}
                  style={{ width: INDENT_W, fontSize: 13, lineHeight: 1 }}
                >
                  {di === acc.depth - 1 ? "└" : "│"}
                </span>
              ))}
            </div>
          )}
          <div className="w-5 flex-shrink-0 flex justify-center">
            {acc.hasChildren ? (
              <button
                onClick={e => { e.stopPropagation(); setNodeCollapsed(p => ({ ...p, [acc.id]: !p[acc.id] })); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                title={nodeCollapsed[acc.id] ? "Expand" : "Collapse"}
              >
                {nodeCollapsed[acc.id]
                  ? <ChevronRight size={12} className="text-gray-500" />
                  : <ChevronDown  size={12} className="text-gray-500" />
                }
              </button>
            ) : (
              <span className="text-gray-300 dark:text-zinc-600 text-[14px] select-none">·</span>
            )}
          </div>
        </div>

        {/* Row number */}
        <div className="w-7 flex-shrink-0 text-[11px] text-gray-400 font-mono">{ri + 1}</div>

        {/* Code */}
        <div className={`w-24 flex-shrink-0 font-mono text-[12px] font-bold ${s.text} pr-2`}>{acc.code}</div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 pr-3">
          <span className={isLedger ? "text-[12px] italic text-gray-600 dark:text-gray-400 truncate" : "text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate"}>
            {acc.name}
          </span>
          {isLedger ? (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 border border-gray-200 dark:border-zinc-700">
              <FileText size={8} /> Ledger
            </span>
          ) : acc.hasChildren ? (
            <span className={`flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${s.bg} ${s.text} ${s.border}`}>
              <GitBranch size={8} /> Group
            </span>
          ) : null}
        </div>

        {/* Opening balance (ledgers only) */}
        <div className="w-28 flex-shrink-0 pr-2 text-right">
          {isLedger && (
            <span className="text-[12px] font-mono text-gray-700 dark:text-gray-300">
              {acc.openingBalance !== 0 ? acc.openingBalance.toLocaleString() : "—"}
            </span>
          )}
        </div>

        {/* Sub-type */}
        <div className="w-36 flex-shrink-0 pr-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${s.bg} ${s.text} ${s.border}`}>
            {acc.subType}
          </span>
        </div>

        {/* Status */}
        <div className="w-20 flex-shrink-0 flex justify-center">
          <button
            onClick={e => { e.stopPropagation(); editAccount(acc.id, { isActive: !acc.isActive }); toast({ title: acc.isActive ? "Deactivated" : "Activated" }); }}
            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
              acc.isActive
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-200"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-400 hover:bg-gray-200"
            }`}
          >
            {acc.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
            {acc.isActive ? "Active" : "Off"}
          </button>
        </div>

        {/* Actions (hover) */}
        <div className="w-20 flex-shrink-0 flex items-center justify-end gap-0.5 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); openEdit(acc); }}
            className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              if (hasChildren(acc.id)) {
                toast({ title: "Cannot delete — has child accounts", description: "Remove children first.", variant: "destructive" });
              } else {
                setDeleteId(acc.id);
              }
            }}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const headForCreate = activeHead !== "All" ? activeHead as AccountHead : "Assets";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">

      {/* ─── Page Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-200 dark:shadow-none">
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">Chart of Accounts</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {accounts.length} accounts · click any row to add a sub-account
              </p>
            </div>
          </div>
          <button
            onClick={() => openCreate(null, headForCreate)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold shadow-md transition-colors"
          >
            <Plus size={15} /> New Account
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {ACCOUNT_HEADS.map(h => {
            const s = HEAD_STYLE[h];
            const cnt = counts[h] ?? 0;
            const active = activeHead === h;
            return (
              <button key={h} onClick={() => setActiveHead(active ? "All" : h)}
                className={`rounded-xl px-3 py-3 border text-left transition-all ${active ? `${s.bg} ${s.border} ring-2 ring-offset-1 ${s.text} ring-current` : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800"}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${active ? s.text : "text-gray-500 dark:text-gray-400"}`}>{h}</span>
                </div>
                <div className={`text-[26px] font-bold leading-none ${active ? s.text : "text-gray-900 dark:text-gray-100"}`}>{cnt}</div>
                <div className={`text-[10px] mt-1 ${active ? s.text : "text-gray-400"}`}>account{cnt !== 1 ? "s" : ""}</div>
              </button>
            );
          })}
        </div>

        {/* Filter tabs + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => setActiveHead("All")}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${activeHead === "All" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"}`}>
              All ({counts.All})
            </button>
            {ACCOUNT_HEADS.map(h => {
              const s = HEAD_STYLE[h];
              const active = activeHead === h;
              return (
                <button key={h} onClick={() => setActiveHead(active ? "All" : h)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${active ? `${s.badgeBg} text-white` : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"}`}>
                  {h === "Revenue / Income" ? "Revenue" : h} ({counts[h] ?? 0})
                </button>
              );
            })}
          </div>
          <div className="relative ml-auto w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code, name, type…"
              className="w-full pl-8 pr-8 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
          </div>
        </div>
      </div>

      {/* ─── Edit Panel (inline) ─────────────────────────────────────────────── */}
      {showEdit && editForm && (
        <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Pencil size={13} className="text-blue-500" /> Edit Account
            </h2>
            <button onClick={closeEdit} className="p-1 rounded text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-[80px_2fr_1fr_1fr_1fr] gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Code *</label>
              <input value={editForm.code} onChange={e => setEF("code", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Account Name *</label>
              <input value={editForm.name} onChange={e => setEF("name", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Head *</label>
              <select value={editForm.head} onChange={e => setEF("head", e.target.value as AccountHead)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                {ACCOUNT_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Type</label>
              <select value={editForm.subType} onChange={e => setEF("subType", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                {HEAD_SUB_TYPES[editForm.head].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Kind</label>
              <select value={editForm.accountType ?? "Group"} onChange={e => setEF("accountType", e.target.value as AccountKind)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="Group">Group</option>
                <option value="Ledger">Ledger</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-72 flex-shrink-0">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Parent Account</label>
              <select value={editForm.parentId ?? ""}
                onChange={e => setEF("parentId", e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">— No parent (root) —</option>
                {editParentOptions.map(o => (
                  <option key={o.id} value={o.id}>{"\u00a0\u00a0".repeat(o.depth)}{o.depth > 0 ? "↳ " : ""}{o.label}</option>
                ))}
              </select>
            </div>
            {(editForm.accountType ?? "Group") === "Ledger" && (
              <div className="w-40 flex-shrink-0">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Opening Balance</label>
                <input type="number" value={editForm.openingBalance ?? 0}
                  onChange={e => setEF("openingBalance", parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            )}
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
              <input value={editForm.description} onChange={e => setEF("description", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="flex items-end gap-2 flex-shrink-0">
              <button onClick={handleEditSave}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold transition-colors">
                <Save size={13} /> Update
              </button>
              <button onClick={closeEdit}
                className="h-9 px-4 rounded-lg border border-gray-200 dark:border-zinc-700 text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Table ───────────────────────────────────────────────────────────── */}
      <div className="px-6 py-5">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
          {/* Header */}
          <div className="flex items-center pl-3 pr-3 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <div className="w-12 flex-shrink-0">Tree</div>
            <div className="w-7 flex-shrink-0">#</div>
            <div className="w-24 flex-shrink-0">Code</div>
            <div className="flex-1">Account Name</div>
            <div className="w-28 flex-shrink-0 text-right pr-2">Opening Bal.</div>
            <div className="w-36 flex-shrink-0">Type</div>
            <div className="w-20 flex-shrink-0 text-center">Status</div>
            <div className="w-20 flex-shrink-0" />
          </div>

          {/* Search results */}
          {isSearching ? (
            searchResults && searchResults.length > 0 ? (
              <>
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} — tree view paused during search
                </div>
                {searchResults.map((acc, ri) => {
                  const s = HEAD_STYLE[acc.head];
                  const isLedger = acc.accountType === "Ledger";
                  return (
                    <div key={acc.id} onClick={() => openCreate(acc, acc.head)}
                      className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 group transition-colors min-h-[40px] cursor-pointer ${!acc.isActive ? "opacity-40" : ri % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"} hover:bg-blue-50/50 dark:hover:bg-blue-950/20`}>
                      <div className="w-12 flex-shrink-0 pl-3" />
                      <div className="w-7 flex-shrink-0 text-[11px] text-gray-400 font-mono">{ri + 1}</div>
                      <div className={`w-24 flex-shrink-0 font-mono text-[12px] font-bold ${s.text} pr-2`}>{acc.code}</div>
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-[10px] text-gray-400 truncate">{getPath(accounts, acc)}</div>
                        <div className={`truncate ${isLedger ? "text-[12px] italic text-gray-600 dark:text-gray-400" : "text-[13px] font-semibold text-gray-900 dark:text-gray-100"}`}>{acc.name}</div>
                      </div>
                      <div className="w-28 flex-shrink-0 pr-2 text-right">
                        {isLedger && acc.openingBalance !== 0 && <span className="text-[12px] font-mono text-gray-700 dark:text-gray-300">{acc.openingBalance.toLocaleString()}</span>}
                      </div>
                      <div className="w-36 flex-shrink-0 pr-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${s.bg} ${s.text} ${s.border}`}>{acc.subType}</span>
                      </div>
                      <div className="w-20 flex-shrink-0 flex justify-center">
                        <button onClick={e => { e.stopPropagation(); editAccount(acc.id, { isActive: !acc.isActive }); toast({ title: acc.isActive ? "Deactivated" : "Activated" }); }}
                          className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${acc.isActive ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-gray-100 dark:bg-zinc-800 text-gray-400"}`}>
                          {acc.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
                          {acc.isActive ? "Active" : "Off"}
                        </button>
                      </div>
                      <div className="w-20 flex-shrink-0 flex items-center justify-end gap-0.5 pr-3 opacity-0 group-hover:opacity-100">
                        <button onClick={e => { e.stopPropagation(); openEdit(acc); }} className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50"><Pencil size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); if (hasChildren(acc.id)) { toast({ title: "Cannot delete — has children", variant: "destructive" }); } else { setDeleteId(acc.id); } }} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="text-center py-20 text-gray-400 text-[13px]">No accounts match your search.</div>
            )
          ) : (
            ACCOUNT_HEADS
              .filter(h => activeHead === "All" || h === activeHead)
              .map(head => {
                const s = HEAD_STYLE[head];
                const headAccounts = accounts.filter(a => a.head === head).map(a => ({ ...a, parentId: a.parentId ?? null }));
                const flatRows = buildFlatRows(headAccounts, null, 0, nodeCollapsed);
                const isHCollapsed = headCollapsed[head];
                return (
                  <div key={head}>
                    <div className={`flex items-center gap-2 px-4 py-2 border-b ${s.border} ${s.bg}`}>
                      <button onClick={() => setHeadCollapsed(p => ({ ...p, [head]: !p[head] }))} className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                        <span className={`text-[11px] font-bold uppercase tracking-wider flex-1 text-left ${s.text}`}>{head}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${s.badgeBg}`}>{headAccounts.length}</span>
                        {isHCollapsed ? <ChevronRight size={13} className={s.text} /> : <ChevronDown size={13} className={s.text} />}
                      </button>
                      <button
                        onClick={() => openCreate(null, head)}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${s.border} ${s.bg} ${s.text} hover:opacity-80 flex-shrink-0`}
                        title={`Add root account under ${head}`}
                      >
                        <Plus size={10} /> Add
                      </button>
                    </div>
                    {!isHCollapsed && (
                      flatRows.length === 0 ? (
                        <div className="px-12 py-4 text-[12px] text-gray-400 italic border-b border-gray-100 dark:border-zinc-800">
                          No accounts yet. Click "+ Add" above or click any existing account.
                        </div>
                      ) : flatRows.map((row, ri) => renderRow(row, ri))
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* ─── Create Group / Ledger Modal ─────────────────────────────────────── */}
      <Dialog open={!!modal} onOpenChange={v => { if (!v) closeModal(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <FolderOpen size={16} className="text-blue-500" />
              Create Group / Ledger
            </DialogTitle>
          </DialogHeader>

          {modal && (
            <div className="space-y-4 pt-1">
              {/* Type selector */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Account Kind <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Group", "Ledger"] as AccountKind[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setModalType(t)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-[13px] font-bold transition-all ${
                        modal.accountType === t
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                          : "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                      }`}
                    >
                      {t === "Group"
                        ? <GitBranch size={16} className={modal.accountType === t ? "text-blue-500" : "text-gray-400"} />
                        : <FileText  size={16} className={modal.accountType === t ? "text-blue-500" : "text-gray-400"} />
                      }
                      <div className="text-left">
                        <div>{t}</div>
                        <div className={`text-[10px] font-normal ${modal.accountType === t ? "text-blue-500" : "text-gray-400"}`}>
                          {t === "Group" ? "Can have sub-accounts" : "Final ledger entry"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Head selector (shown when not locked to a specific head) */}
              {!modal.headLocked && (
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Account Head <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={modal.head}
                    onChange={e => handleModalHeadChange(e.target.value as AccountHead)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {ACCOUNT_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}

              {/* Parent account selector (dropdown) */}
              {(() => {
                // Build tree-ordered parent options for modal.head
                const opts: { id: string; label: string; depth: number }[] = [];
                function walkOpts(pid: string | null, depth: number) {
                  accounts
                    .filter(a => a.head === modal.head && (a.parentId ?? null) === pid)
                    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                    .forEach(a => {
                      opts.push({ id: a.id, label: `${a.code} | ${a.name}`, depth });
                      walkOpts(a.id, depth + 1);
                    });
                }
                walkOpts(null, 0);
                return (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Select Account Group <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={modal.parentId ?? ""}
                      onChange={e => handleModalParentChange(e.target.value || null)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">— No parent (root level under {modal.head}) —</option>
                      {opts.map(o => (
                        <option key={o.id} value={o.id}>
                          {"\u00a0\u00a0\u00a0\u00a0".repeat(o.depth)}{o.depth > 0 ? "↳ " : ""}{o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {/* GROUP: single code+name */}
              {modal.accountType === "Group" && (
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Code <span className="text-red-500">*</span></label>
                    <input
                      value={modal.groupCode}
                      onChange={e => setModal(m => m ? { ...m, groupCode: e.target.value } : m)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Group Name <span className="text-red-500">*</span></label>
                    <input
                      value={modal.groupName}
                      onChange={e => setModal(m => m ? { ...m, groupName: e.target.value } : m)}
                      placeholder="e.g. Fixed Assets"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* LEDGER: multiple entries */}
              {modal.accountType === "Ledger" && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Ledger Entries <span className="text-red-500">*</span>
                  </label>
                  {modal.ledgerEntries.map((entry, idx) => (
                    <div key={entry._key} className="grid grid-cols-[100px_1fr_110px_1fr] gap-2 items-end">
                      <div>
                        {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Code</label>}
                        <input
                          value={entry.code}
                          onChange={e => updateLedgerEntry(entry._key, "code", e.target.value)}
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Ledger Name *</label>}
                        <input
                          value={entry.name}
                          onChange={e => updateLedgerEntry(entry._key, "name", e.target.value)}
                          placeholder="e.g. Cash in Hand"
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Opening Balance</label>}
                        <input
                          type="number"
                          value={entry.openingBalance}
                          onChange={e => updateLedgerEntry(entry._key, "openingBalance", e.target.value)}
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <div className="flex-1">
                          {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Ledger Type</label>}
                          <select
                            value={entry.subType}
                            onChange={e => updateLedgerEntry(entry._key, "subType", e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            {HEAD_SUB_TYPES[modal.head].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        {modal.ledgerEntries.length > 1 && (
                          <button
                            onClick={() => removeLedgerEntry(entry._key)}
                            className={`${idx === 0 ? "mt-5" : ""} p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0`}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addLedgerEntry}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                  >
                    <Plus size={14} /> Add More
                  </button>
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button onClick={closeModal}
                  className="h-9 px-5 rounded-lg border border-gray-200 dark:border-zinc-700 text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
                <button onClick={handleModalSave}
                  className="flex items-center gap-1.5 h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold transition-colors">
                  <Save size={13} /> Save
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              "{accountToDelete?.code} — {accountToDelete?.name}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) { removeAccount(deleteId); toast({ title: "Account deleted" }); setDeleteId(null); } }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
