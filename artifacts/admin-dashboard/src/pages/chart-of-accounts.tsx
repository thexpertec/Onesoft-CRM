import { useState, useMemo, useCallback } from "react";
import { Account, AccountHead, ACCOUNT_HEADS, HEAD_SUB_TYPES } from "@/lib/store";
import { useAccounts } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Plus, Search, X, Trash2, Save, Pencil,
  CheckCircle, XCircle, ChevronDown, ChevronRight,
  CornerDownRight, GitBranch,
} from "lucide-react";
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

/** Recursively build a flat ordered list with depth info, respecting collapsed state. */
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

/** All descendant IDs of a given account (BFS). */
function getDescendantIds(accounts: Account[], id: string): Set<string> {
  const result = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    accounts.filter(a => a.parentId === cur).forEach(c => { result.add(c.id); queue.push(c.id); });
  }
  return result;
}

type ParentOption = { id: string; label: string; depth: number };

/** Build ordered list of valid parent options for the form dropdown. */
function buildParentOptions(
  accounts: Account[],
  head: AccountHead,
  excludeIds: Set<string>,
  parentId: string | null = null,
  depth: number = 0,
): ParentOption[] {
  const children = accounts
    .filter(a => a.head === head && (a.parentId ?? null) === parentId && !excludeIds.has(a.id))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const result: ParentOption[] = [];
  for (const acc of children) {
    result.push({ id: acc.id, label: `${acc.code} — ${acc.name}`, depth });
    result.push(...buildParentOptions(accounts, head, excludeIds, acc.id, depth + 1));
  }
  return result;
}

/** Get the full path of an account as breadcrumb string. */
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

// ─── Form ─────────────────────────────────────────────────────────────────────
type FormState = Omit<Account, "id" | "createdAt" | "updatedAt">;

const blankForm = (head: AccountHead = "Assets", parentId: string | null = null): FormState => ({
  code: "", name: "", head, subType: HEAD_SUB_TYPES[head][0], description: "", parentId, isActive: true,
});

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ChartOfAccountsPage() {
  const { accounts, addAccount, editAccount, removeAccount } = useAccounts();
  const { toast } = useToast();

  const [activeHead,    setActiveHead]    = useState<"All" | AccountHead>("All");
  const [search,        setSearch]        = useState("");
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState<FormState>(blankForm());
  const [nodeCollapsed, setNodeCollapsed] = useState<Record<string, boolean>>({});
  const [headCollapsed, setHeadCollapsed] = useState<Record<string, boolean>>({});

  // ── Counts ───────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: accounts.length };
    ACCOUNT_HEADS.forEach(h => { c[h] = accounts.filter(a => a.head === h).length; });
    return c;
  }, [accounts]);

  // ── Search (flat, unordered) ──────────────────────────────────────────────────
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

  // ── Parent options for form ───────────────────────────────────────────────────
  const parentOptions = useMemo(() => {
    const excluded = new Set<string>(editingId ? [editingId, ...getDescendantIds(accounts, editingId)] : []);
    return buildParentOptions(accounts, form.head, excluded);
  }, [accounts, form.head, editingId]);

  // ── Form helpers ──────────────────────────────────────────────────────────────
  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const resolveDefaultHead = (): AccountHead =>
    activeHead !== "All" ? activeHead as AccountHead : "Assets";

  const openNew = (head?: AccountHead, parentId?: string | null) => {
    setEditingId(null);
    setForm(blankForm(head ?? resolveDefaultHead(), parentId ?? null));
    setShowForm(true);
  };

  const openAddChild = (parent: Account) => {
    setEditingId(null);
    setForm(blankForm(parent.head, parent.id));
    setShowForm(true);
    setNodeCollapsed(p => ({ ...p, [parent.id]: false }));
  };

  const openEdit = (acc: Account) => {
    setEditingId(acc.id);
    setForm({
      code: acc.code, name: acc.name, head: acc.head,
      subType: acc.subType, description: acc.description,
      parentId: acc.parentId ?? null, isActive: acc.isActive,
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const handleHeadChange = (h: AccountHead) => {
    setForm(f => ({ ...f, head: h, subType: HEAD_SUB_TYPES[h][0], parentId: null }));
  };

  const handleSave = useCallback(() => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Code and Name are required", variant: "destructive" }); return;
    }
    const dup = accounts.find(a => a.code.trim() === form.code.trim() && a.id !== editingId);
    if (dup) { toast({ title: `Code "${form.code}" already in use`, variant: "destructive" }); return; }
    if (editingId) { editAccount(editingId, form); toast({ title: "Account updated" }); }
    else           { addAccount(form);              toast({ title: "Account added" }); }
    closeForm();
  }, [form, editingId, accounts, editAccount, addAccount, toast]);

  const toggleNode = (id: string) =>
    setNodeCollapsed(p => ({ ...p, [id]: !p[id] }));
  const toggleHead = (h: string) =>
    setHeadCollapsed(p => ({ ...p, [h]: !p[h] }));

  const hasChildren = (id: string) => accounts.some(a => (a.parentId ?? null) === id);
  const accountToDelete = accounts.find(a => a.id === deleteId);
  const parentAccountName = form.parentId ? accounts.find(a => a.id === form.parentId)?.name : null;

  // ── Row renderer ─────────────────────────────────────────────────────────────
  const INDENT_W = 22;

  const renderRow = (acc: FlatRow, ri: number) => {
    const s = HEAD_STYLE[acc.head];
    const isCollapsed = nodeCollapsed[acc.id];
    return (
      <div
        key={acc.id}
        className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 group transition-colors min-h-[40px] ${
          !acc.isActive ? "opacity-40" : ri % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"
        } hover:bg-blue-50/30 dark:hover:bg-blue-950/10`}
      >
        {/* ── Indent + toggle ── */}
        <div
          className="flex items-center flex-shrink-0 pl-3"
          style={{ width: 44 + acc.depth * INDENT_W }}
        >
          {/* tree connector for children */}
          {acc.depth > 0 && (
            <div
              className="flex-shrink-0 flex items-center"
              style={{ width: acc.depth * INDENT_W }}
            >
              {Array.from({ length: acc.depth }).map((_, di) => (
                <span
                  key={di}
                  className={`flex-shrink-0 ${di === acc.depth - 1 ? "text-gray-400 dark:text-zinc-500" : "text-transparent"}`}
                  style={{ width: INDENT_W, fontSize: 13, fontFamily: "monospace", lineHeight: 1 }}
                >
                  {di === acc.depth - 1 ? "└" : "│"}
                </span>
              ))}
            </div>
          )}
          {/* expand/collapse or leaf dot */}
          <div className="w-5 flex-shrink-0 flex justify-center">
            {acc.hasChildren ? (
              <button
                onClick={() => toggleNode(acc.id)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                title={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed
                  ? <ChevronRight size={12} className="text-gray-500" />
                  : <ChevronDown  size={12} className="text-gray-500" />
                }
              </button>
            ) : (
              <span className="text-gray-300 dark:text-zinc-600 text-[14px] leading-none select-none">·</span>
            )}
          </div>
        </div>

        {/* ── Row number ── */}
        <div className="w-7 flex-shrink-0 text-[11px] text-gray-400 font-mono">{ri + 1}</div>

        {/* ── Code ── */}
        <div className={`w-20 flex-shrink-0 font-mono text-[12px] font-bold ${s.text} pr-2`}>{acc.code}</div>

        {/* ── Name ── */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 pr-3">
          <span className={`text-[13px] font-semibold truncate ${!acc.isActive ? "line-through text-gray-400" : "text-gray-900 dark:text-gray-100"}`}>
            {acc.name}
          </span>
          {acc.hasChildren && (
            <span className={`flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${s.bg} ${s.text} ${s.border}`}>
              <GitBranch size={8} /> parent
            </span>
          )}
        </div>

        {/* ── Sub-type ── */}
        <div className="w-36 flex-shrink-0 pr-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${s.bg} ${s.text} ${s.border}`}>
            {acc.subType}
          </span>
        </div>

        {/* ── Description ── */}
        <div className="w-48 flex-shrink-0 text-[12px] text-gray-500 dark:text-gray-400 truncate pr-3">
          {acc.description || "—"}
        </div>

        {/* ── Status toggle ── */}
        <div className="w-20 flex-shrink-0 flex justify-center">
          <button
            onClick={() => { editAccount(acc.id, { isActive: !acc.isActive }); toast({ title: acc.isActive ? "Deactivated" : "Activated" }); }}
            title={acc.isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
              acc.isActive
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
            }`}
          >
            {acc.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
            {acc.isActive ? "Active" : "Off"}
          </button>
        </div>

        {/* ── Actions ── */}
        <div className="w-24 flex-shrink-0 flex items-center justify-end gap-0.5 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => openAddChild(acc)}
            className="p-1.5 rounded-md text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
            title="Add child account"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={() => openEdit(acc)}
            className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            title="Edit account"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => {
              if (hasChildren(acc.id)) {
                toast({ title: "Cannot delete — has child accounts", description: "Remove or reassign children first.", variant: "destructive" });
              } else {
                setDeleteId(acc.id);
              }
            }}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Delete account"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
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
                {accounts.length} account{accounts.length !== 1 ? "s" : ""} · parent-child hierarchy across 5 heads
              </p>
            </div>
          </div>
          <button
            onClick={() => openNew()}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold shadow-md shadow-blue-200 dark:shadow-none transition-colors"
          >
            <Plus size={15} /> New Account
          </button>
        </div>

        {/* ─── 5 Head Summary Cards ─── */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {ACCOUNT_HEADS.map(h => {
            const s = HEAD_STYLE[h];
            const cnt = counts[h] ?? 0;
            const active = activeHead === h;
            return (
              <button
                key={h}
                onClick={() => setActiveHead(active ? "All" : h)}
                className={`rounded-xl px-3 py-3 border text-left transition-all ${
                  active
                    ? `${s.bg} ${s.border} ring-2 ring-offset-1 ${s.text} ring-current`
                    : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800"
                }`}
              >
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

        {/* ─── Filter Tabs + Search ─── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setActiveHead("All")}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                activeHead === "All" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`}
            >
              All ({counts.All})
            </button>
            {ACCOUNT_HEADS.map(h => {
              const s = HEAD_STYLE[h];
              const active = activeHead === h;
              return (
                <button
                  key={h}
                  onClick={() => setActiveHead(active ? "All" : h)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                    active ? `${s.badgeBg} text-white` : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {h === "Revenue / Income" ? "Revenue" : h} ({counts[h] ?? 0})
                </button>
              );
            })}
          </div>
          <div className="relative ml-auto w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search code, name, type…"
              className="w-full pl-8 pr-8 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Add / Edit Form ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              {form.parentId
                ? <><CornerDownRight size={14} className="text-emerald-500 flex-shrink-0" /> Add Child Account</>
                : editingId ? <><Pencil size={13} className="text-blue-500" /> Edit Account</> : <><Plus size={13} className="text-blue-500" /> New Account</>
              }
              {parentAccountName && (
                <span className="text-[12px] font-normal text-gray-500 ml-1">
                  under <span className="font-semibold text-gray-700 dark:text-gray-300">{parentAccountName}</span>
                </span>
              )}
            </h2>
            <button onClick={closeForm} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X size={16} />
            </button>
          </div>

          {/* Row 1: Code, Name, Head, Type */}
          <div className="grid grid-cols-[80px_2fr_1fr_1fr] gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Code *</label>
              <input
                value={form.code} onChange={e => setF("code", e.target.value)}
                placeholder="e.g. 1001"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Account Name *</label>
              <input
                value={form.name} onChange={e => setF("name", e.target.value)}
                placeholder="e.g. Fixed Assets"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Head *</label>
              <select
                value={form.head} onChange={e => handleHeadChange(e.target.value as AccountHead)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {ACCOUNT_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Type</label>
              <select
                value={form.subType} onChange={e => setF("subType", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {HEAD_SUB_TYPES[form.head].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Parent, Description, Buttons */}
          <div className="flex gap-3">
            <div className="w-72 flex-shrink-0">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Parent Account</label>
              <select
                value={form.parentId ?? ""}
                onChange={e => setF("parentId", e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">— No parent (root level) —</option>
                {parentOptions.map(o => (
                  <option key={o.id} value={o.id}>
                    {"\u00a0\u00a0".repeat(o.depth)}{o.depth > 0 ? "↳ " : ""}{o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Description</label>
              <input
                value={form.description} onChange={e => setF("description", e.target.value)}
                placeholder="Brief description of this account…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-end gap-2 flex-shrink-0">
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold transition-colors"
              >
                <Save size={13} /> {editingId ? "Update" : "Add"}
              </button>
              <button
                onClick={closeForm}
                className="h-9 px-4 rounded-lg border border-gray-200 dark:border-zinc-700 text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Table ───────────────────────────────────────────────────────────── */}
      <div className="px-6 py-5">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">

          {/* Column header bar */}
          <div className="flex items-center pl-3 pr-3 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <div className="w-12 flex-shrink-0">Tree</div>
            <div className="w-7 flex-shrink-0">#</div>
            <div className="w-20 flex-shrink-0">Code</div>
            <div className="flex-1">Account Name</div>
            <div className="w-36 flex-shrink-0">Type</div>
            <div className="w-48 flex-shrink-0">Description</div>
            <div className="w-20 flex-shrink-0 text-center">Status</div>
            <div className="w-24 flex-shrink-0" />
          </div>

          {/* ── Search results (flat list, no tree) ── */}
          {isSearching ? (
            searchResults && searchResults.length > 0 ? (
              <>
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} — tree view disabled during search
                </div>
                {searchResults.map((acc, ri) => {
                  const fRow: FlatRow = { ...acc, parentId: acc.parentId ?? null, depth: 0, hasChildren: hasChildren(acc.id) };
                  return (
                    <div key={acc.id} className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 group transition-colors min-h-[40px] ${!acc.isActive ? "opacity-40" : ri % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"} hover:bg-blue-50/30 dark:hover:bg-blue-950/10`}>
                      <div className="w-12 flex-shrink-0 pl-3">
                        <span className="text-[10px] font-mono text-gray-400">{HEAD_STYLE[acc.head].dot.replace("bg-", "").slice(0, 4)}</span>
                      </div>
                      <div className="w-7 flex-shrink-0 text-[11px] text-gray-400 font-mono">{ri + 1}</div>
                      <div className={`w-20 flex-shrink-0 font-mono text-[12px] font-bold ${HEAD_STYLE[acc.head].text} pr-2`}>{acc.code}</div>
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-[11px] text-gray-400 truncate">{getPath(accounts, acc)}</div>
                        <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{acc.name}</div>
                      </div>
                      <div className="w-36 flex-shrink-0 pr-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${HEAD_STYLE[acc.head].bg} ${HEAD_STYLE[acc.head].text} ${HEAD_STYLE[acc.head].border}`}>{acc.subType}</span>
                      </div>
                      <div className="w-48 flex-shrink-0 text-[12px] text-gray-500 dark:text-gray-400 truncate pr-3">{acc.description || "—"}</div>
                      <div className="w-20 flex-shrink-0 flex justify-center">
                        <button onClick={() => { editAccount(acc.id, { isActive: !acc.isActive }); toast({ title: acc.isActive ? "Deactivated" : "Activated" }); }}
                          className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${acc.isActive ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200" : "bg-gray-100 dark:bg-zinc-800 text-gray-400 hover:bg-gray-200"}`}>
                          {acc.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
                          {acc.isActive ? "Active" : "Off"}
                        </button>
                      </div>
                      <div className="w-24 flex-shrink-0 flex items-center justify-end gap-0.5 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openAddChild(acc)} className="p-1.5 rounded-md text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" title="Add child"><Plus size={13} /></button>
                        <button onClick={() => openEdit(acc)} className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30" title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => { if (hasChildren(acc.id)) { toast({ title: "Cannot delete — has children", variant: "destructive" }); } else { setDeleteId(acc.id); } }} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="text-center py-20 text-gray-400 text-[13px]">No accounts match your search.</div>
            )
          ) : (
            // ── Tree view grouped by head ──
            ACCOUNT_HEADS
              .filter(h => activeHead === "All" || h === activeHead)
              .map(head => {
                const s = HEAD_STYLE[head];
                const headAccounts = accounts
                  .filter(a => a.head === head)
                  .map(a => ({ ...a, parentId: a.parentId ?? null }));
                const flatRows = buildFlatRows(headAccounts, null, 0, nodeCollapsed);
                const isHCollapsed = headCollapsed[head];
                return (
                  <div key={head}>
                    {/* ── Head section header ── */}
                    <div className={`flex items-center gap-2 px-4 py-2 border-b ${s.border} ${s.bg}`}>
                      <button
                        onClick={() => toggleHead(head)}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                        <span className={`text-[11px] font-bold uppercase tracking-wider flex-1 text-left ${s.text}`}>{head}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${s.badgeBg}`}>{headAccounts.length}</span>
                        {isHCollapsed
                          ? <ChevronRight size={13} className={s.text} />
                          : <ChevronDown  size={13} className={s.text} />
                        }
                      </button>
                      {/* Quick add root account for this head */}
                      <button
                        onClick={() => openNew(head, null)}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${s.border} ${s.bg} ${s.text} hover:opacity-80 transition-opacity flex-shrink-0`}
                        title={`Add root account under ${head}`}
                      >
                        <Plus size={10} /> Add
                      </button>
                    </div>

                    {/* ── Tree rows ── */}
                    {!isHCollapsed && (
                      flatRows.length === 0 ? (
                        <div className="px-12 py-4 text-[12px] text-gray-400 italic border-b border-gray-100 dark:border-zinc-800">
                          No accounts yet. Click "+ Add" to create the first one.
                        </div>
                      ) : flatRows.map((row, ri) => renderRow(row, ri))
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* ─── Delete Confirm Dialog ────────────────────────────────────────────── */}
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
