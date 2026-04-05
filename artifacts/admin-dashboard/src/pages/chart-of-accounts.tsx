import { useState, useMemo, useCallback } from "react";
import { Account, AccountHead, ACCOUNT_HEADS, HEAD_SUB_TYPES } from "@/lib/store";
import { useAccounts } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Plus, Search, X, Trash2, Save, Pencil,
  CheckCircle, XCircle, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Head visual config ───────────────────────────────────────────────────────
const HEAD_STYLE: Record<AccountHead, {
  bg: string; text: string; border: string; badgeBg: string; dot: string; headerBg: string;
}> = {
  "Assets":           { bg: "bg-blue-50 dark:bg-blue-950/20",    text: "text-blue-700 dark:text-blue-300",    border: "border-blue-200 dark:border-blue-800",    badgeBg: "bg-blue-600",    dot: "bg-blue-500",    headerBg: "bg-blue-600"   },
  "Liabilities":      { bg: "bg-rose-50 dark:bg-rose-950/20",    text: "text-rose-700 dark:text-rose-300",    border: "border-rose-200 dark:border-rose-800",    badgeBg: "bg-rose-600",    dot: "bg-rose-500",    headerBg: "bg-rose-600"   },
  "Revenue / Income": { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", badgeBg: "bg-emerald-600", dot: "bg-emerald-500", headerBg: "bg-emerald-600" },
  "Expense":          { bg: "bg-orange-50 dark:bg-orange-950/20", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800", badgeBg: "bg-orange-600",  dot: "bg-orange-500",  headerBg: "bg-orange-600" },
  "Equity":           { bg: "bg-violet-50 dark:bg-violet-950/20", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800", badgeBg: "bg-violet-600",  dot: "bg-violet-500",  headerBg: "bg-violet-600" },
};

type FormState = Omit<Account, "id" | "createdAt" | "updatedAt">;

const blankForm = (): FormState => ({
  code: "", name: "", head: "Assets", subType: "Current Asset", description: "", isActive: true,
});

export default function ChartOfAccountsPage() {
  const { accounts, addAccount, editAccount, removeAccount } = useAccounts();
  const { toast } = useToast();

  const [activeHead, setActiveHead]   = useState<"All" | AccountHead>("All");
  const [search,     setSearch]       = useState("");
  const [deleteId,   setDeleteId]     = useState<string | null>(null);
  const [editingId,  setEditingId]    = useState<string | null>(null);
  const [showForm,   setShowForm]     = useState(false);
  const [form,       setForm]         = useState<FormState>(blankForm());
  const [collapsed,  setCollapsed]    = useState<Record<string, boolean>>({});

  // ── Derived ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...accounts];
    if (activeHead !== "All") rows = rows.filter(a => a.head === activeHead);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(a =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.subType.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
      );
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, activeHead, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: accounts.length };
    ACCOUNT_HEADS.forEach(h => { c[h] = accounts.filter(a => a.head === h).length; });
    return c;
  }, [accounts]);

  const grouped = useMemo(() => {
    const heads = activeHead === "All" ? ACCOUNT_HEADS : [activeHead as AccountHead];
    return heads.map(head => ({
      head,
      items: filtered.filter(a => a.head === head),
    }));
  }, [filtered, activeHead]);

  // ── Form helpers ──────────────────────────────────────────────────────────────
  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditingId(null);
    setForm(blankForm());
    setShowForm(true);
  };

  const openEdit = (acc: Account) => {
    setEditingId(acc.id);
    setForm({ code: acc.code, name: acc.name, head: acc.head, subType: acc.subType, description: acc.description, isActive: acc.isActive });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const handleSave = useCallback(() => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Code and Name are required", variant: "destructive" }); return;
    }
    const dup = accounts.find(a => a.code.trim() === form.code.trim() && a.id !== editingId);
    if (dup) { toast({ title: `Code "${form.code}" is already in use`, variant: "destructive" }); return; }

    if (editingId) { editAccount(editingId, form); toast({ title: "Account updated" }); }
    else           { addAccount(form);              toast({ title: "Account added"   }); }
    closeForm();
  }, [form, editingId, accounts, editAccount, addAccount, toast]);

  const handleHeadChange = (h: AccountHead) => {
    setF("head",    h);
    setF("subType", HEAD_SUB_TYPES[h][0]);
  };

  const toggleCollapse = (head: string) =>
    setCollapsed(p => ({ ...p, [head]: !p[head] }));

  const accountToDelete = accounts.find(a => a.id === deleteId);

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
                {accounts.length} account{accounts.length !== 1 ? "s" : ""} across 5 heads
              </p>
            </div>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold shadow-md shadow-blue-200 dark:shadow-none transition-colors"
          >
            <Plus size={15} /> New Account
          </button>
        </div>

        {/* ─── 5 Head Summary Cards ─── */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {ACCOUNT_HEADS.map(h => {
            const s   = HEAD_STYLE[h];
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
                  <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${active ? s.text : "text-gray-500 dark:text-gray-400"}`}>
                    {h === "Revenue / Income" ? "Revenue / Income" : h}
                  </span>
                </div>
                <div className={`text-[26px] font-bold leading-none ${active ? s.text : "text-gray-900 dark:text-gray-100"}`}>
                  {cnt}
                </div>
                <div className={`text-[10px] mt-1 ${active ? s.text : "text-gray-400"}`}>
                  account{cnt !== 1 ? "s" : ""}
                </div>
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
          <div className="relative ml-auto w-60">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search code or name…"
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
            <h2 className="text-[14px] font-bold text-gray-900 dark:text-gray-100">
              {editingId ? "Edit Account" : "Add New Account"}
            </h2>
            <button onClick={closeForm} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-[90px_2fr_1fr_1fr] gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Code *</label>
              <input
                value={form.code} onChange={e => setF("code", e.target.value)}
                placeholder="1001"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Account Name *</label>
              <input
                value={form.name} onChange={e => setF("name", e.target.value)}
                placeholder="e.g. Cash in Hand"
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
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Description</label>
              <input
                value={form.description} onChange={e => setF("description", e.target.value)}
                placeholder="Brief description of this account…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-end gap-2">
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
        {filtered.length === 0 && search ? (
          <div className="text-center py-24 text-gray-400">No accounts match your search.</div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
            {/* Column headers */}
            <div className="grid grid-cols-[52px_90px_1fr_170px_1fr_90px_72px] gap-0 px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700">
              {["#", "Code", "Account Name", "Type", "Description", "Status", ""].map((h, i) => (
                <div key={i} className={`text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i >= 5 ? "text-center" : ""}`}>{h}</div>
              ))}
            </div>

            {/* Grouped sections */}
            {grouped.map(({ head, items }) => {
              const s = HEAD_STYLE[head];
              const isCollapsed = collapsed[head];
              return (
                <div key={head}>
                  {/* ── Head separator row ── */}
                  <button
                    onClick={() => toggleCollapse(head)}
                    className={`w-full flex items-center gap-3 px-4 py-2 border-b ${s.border} ${s.bg} transition-colors hover:opacity-90`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                    <span className={`text-[11px] font-bold uppercase tracking-wider flex-1 text-left ${s.text}`}>{head}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${s.badgeBg}`}>{items.length}</span>
                    {isCollapsed
                      ? <ChevronRight size={13} className={s.text} />
                      : <ChevronDown  size={13} className={s.text} />
                    }
                  </button>

                  {/* ── Account rows ── */}
                  {!isCollapsed && (
                    items.length === 0 ? (
                      <div className="px-14 py-3 text-[12px] text-gray-400 italic border-b border-gray-100 dark:border-zinc-800">
                        No accounts under {head} yet. Click "New Account" to add one.
                      </div>
                    ) : items.map((acc, ri) => (
                      <div
                        key={acc.id}
                        className={`grid grid-cols-[52px_90px_1fr_170px_1fr_90px_72px] gap-0 px-4 py-2.5 border-b border-gray-100 dark:border-zinc-800 last:border-0 items-center group transition-colors ${
                          !acc.isActive
                            ? "opacity-40 bg-gray-50/50 dark:bg-zinc-800/10"
                            : ri % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"
                        } hover:bg-blue-50/30 dark:hover:bg-blue-950/10`}
                      >
                        {/* # */}
                        <div className="text-[11px] text-gray-400 font-mono">{ri + 1}</div>

                        {/* Code */}
                        <div className={`font-mono text-[13px] font-bold ${s.text}`}>{acc.code}</div>

                        {/* Name */}
                        <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate pr-3">{acc.name}</div>

                        {/* Sub-type badge */}
                        <div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${s.bg} ${s.text} ${s.border}`}>
                            {acc.subType}
                          </span>
                        </div>

                        {/* Description */}
                        <div className="text-[12px] text-gray-500 dark:text-gray-400 truncate pr-3">{acc.description || "—"}</div>

                        {/* Status toggle */}
                        <div className="flex justify-center">
                          <button
                            onClick={() => { editAccount(acc.id, { isActive: !acc.isActive }); toast({ title: acc.isActive ? "Account deactivated" : "Account activated" }); }}
                            title={acc.isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                              acc.isActive
                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                                : "bg-gray-100 dark:bg-zinc-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                            }`}
                          >
                            {acc.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            {acc.isActive ? "Active" : "Inactive"}
                          </button>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(acc)}
                            className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteId(acc.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
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
