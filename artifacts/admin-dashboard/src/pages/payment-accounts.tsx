import { useState, useMemo, useRef, useEffect } from "react";
import {
  CreditCard, Plus, Search, Pencil, Trash2, X, Check,
  Banknote, Building2, Smartphone, Globe, ChevronLeft, ChevronRight,
  ToggleLeft, ToggleRight, AlertTriangle,
} from "lucide-react";
import { usePaymentAccounts } from "@/hooks/use-data";
import { PaymentAccount, PaymentMethodType, PAYMENT_METHODS } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 15;

const METHOD_ICON: Record<PaymentMethodType, React.ElementType> = {
  "Cash":             Banknote,
  "Bank Transfer":    Building2,
  "Cheque":           CreditCard,
  "Card":             CreditCard,
  "IBAN / Wire":      Globe,
  "Mobile Money":     Smartphone,
  "Online Transfer":  Globe,
  "Other":            CreditCard,
};

const METHOD_COLOR: Record<PaymentMethodType, string> = {
  "Cash":             "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  "Bank Transfer":    "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  "Cheque":           "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  "Card":             "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300",
  "IBAN / Wire":      "bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300",
  "Mobile Money":     "bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300",
  "Online Transfer":  "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300",
  "Other":            "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400",
};

// ─── Blank form ───────────────────────────────────────────────────────────────
const blank = (): Omit<PaymentAccount, "id" | "createdAt" | "updatedAt"> => ({
  accountTitle:  "",
  paymentMethod: "Bank Transfer",
  iban:          "",
  description:   "",
  isActive:      true,
});

// ─── Form dialog ──────────────────────────────────────────────────────────────
interface FormDialogProps {
  open: boolean;
  initial: Omit<PaymentAccount, "id" | "createdAt" | "updatedAt"> | null;
  onClose: () => void;
  onSave:  (data: Omit<PaymentAccount, "id" | "createdAt" | "updatedAt">) => void;
}

function FormDialog({ open, initial, onClose, onSave }: FormDialogProps) {
  const [form, setForm] = useState(initial ?? blank());
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(initial ?? blank());
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [open, initial]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountTitle.trim()) return;
    onSave(form);
  };

  const isEdit = !!initial;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            {isEdit ? "Edit Payment Account" : "Create Payment Account"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Account Title */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Account Title <span className="text-red-500">*</span>
            </label>
            <Input
              ref={titleRef}
              value={form.accountTitle}
              onChange={e => set("accountTitle", e.target.value)}
              placeholder="e.g. MCB Main Account, Petty Cash"
              className="text-[13px]"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map(m => {
                const Icon = METHOD_ICON[m];
                const active = form.paymentMethod === m;
                return (
                  <button
                    key={m} type="button"
                    onClick={() => set("paymentMethod", m)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                      active
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-gray-300 hover:border-blue-400"
                    }`}
                  >
                    <Icon className="w-3 h-3" />{m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* IBAN / Account Number */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              IBAN / Account Number
            </label>
            <Input
              value={form.iban}
              onChange={e => set("iban", e.target.value)}
              placeholder="e.g. GB29 NWBK 6016 1331 9268 19  or  12345678"
              className="text-[13px] font-mono"
            />
          </div>

          {/* Description / Address */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Description / Address
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Bank branch, sort code, BIC/Swift, notes, or address…"
              className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">Active</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Inactive accounts are hidden from payment selectors</p>
            </div>
            <button
              type="button"
              onClick={() => set("isActive", !form.isActive)}
              className="transition-colors"
            >
              {form.isActive
                ? <ToggleRight className="w-8 h-8 text-blue-600" />
                : <ToggleLeft  className="w-8 h-8 text-gray-400" />
              }
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
            <Button type="button" variant="outline" onClick={onClose} className="text-[13px]">Cancel</Button>
            <Button
              type="submit"
              disabled={!form.accountTitle.trim()}
              className="text-[13px] gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {isEdit ? "Save Changes" : "Create Account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PaymentAccountsPage() {
  const { accounts, add, edit, remove } = usePaymentAccounts();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [page,         setPage]         = useState(1);
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [editing,      setEditing]      = useState<PaymentAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentAccount | null>(null);
  const [activeTab,    setActiveTab]    = useState<"all" | "active" | "inactive">("all");

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return accounts
      .filter(a => {
        if (activeTab === "active"   && !a.isActive) return false;
        if (activeTab === "inactive" && a.isActive)  return false;
        if (!q) return true;
        return (
          a.accountTitle.toLowerCase().includes(q)  ||
          a.paymentMethod.toLowerCase().includes(q) ||
          a.iban.toLowerCase().includes(q)          ||
          a.description.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [accounts, search, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, activeTab]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSave = (data: Omit<PaymentAccount, "id" | "createdAt" | "updatedAt">) => {
    if (editing) {
      edit(editing.id, data);
      toast({ title: "Account updated", description: data.accountTitle });
    } else {
      add(data);
      toast({ title: "Account created", description: data.accountTitle });
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    remove(deleteTarget.id);
    toast({ title: "Account deleted", description: deleteTarget.accountTitle });
    setDeleteTarget(null);
  };

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit   = (a: PaymentAccount) => { setEditing(a); setDialogOpen(true); };

  const activeCount   = accounts.filter(a =>  a.isActive).length;
  const inactiveCount = accounts.filter(a => !a.isActive).length;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="text-blue-600" size={22} />
            Payment Accounts
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage bank accounts, cash funds and payment methods used across invoices and transactions
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 shrink-0">
          <Plus size={15} /> Create Account
        </Button>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Accounts", value: accounts.length,  color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/30",    border: "border-blue-100 dark:border-blue-900" },
          { label: "Active",         value: activeCount,       color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-100 dark:border-emerald-900" },
          { label: "Inactive",       value: inactiveCount,     color: "text-gray-500",   bg: "bg-gray-50 dark:bg-zinc-800/60",    border: "border-gray-100 dark:border-zinc-700" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl px-4 py-3`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tab filters */}
        <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-1 gap-0.5">
          {(["all", "active", "inactive"] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold capitalize transition-all ${
                activeTab === t
                  ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search accounts…"
            className="pl-8 h-9 text-[13px]"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        <span className="ml-auto text-[12px] text-gray-400 dark:text-gray-500">
          {filtered.length} {filtered.length === 1 ? "account" : "accounts"}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[44px_1fr_160px_180px_1fr_120px_88px] gap-0 px-4 py-3 bg-gray-800 dark:bg-zinc-950 border-b border-gray-700 dark:border-zinc-700">
          {["SL", "Account Title", "Payment Method", "IBAN / Account No.", "Description", "Date", "Action"].map((h, i) => (
            <span key={h} className={`text-[10px] font-bold text-gray-300 uppercase tracking-wider ${i >= 2 ? "pl-2" : ""} ${i === 6 ? "text-center" : ""}`}>
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {pageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mb-3">
              <CreditCard className="w-7 h-7 text-blue-300 dark:text-blue-600" />
            </div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">
              {search ? "No accounts match your search" : "No payment accounts yet"}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {search ? "Try a different keyword" : 'Click "Create Account" to add your first one'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {pageRows.map((acc, idx) => {
              const Icon = METHOD_ICON[acc.paymentMethod];
              const date = new Date(acc.createdAt).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
              const serial = (page - 1) * PAGE_SIZE + idx + 1;

              return (
                <div key={acc.id}
                  className="grid grid-cols-[44px_1fr_160px_180px_1fr_120px_88px] gap-0 px-4 py-3 items-center hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors group">

                  {/* SL */}
                  <span className="text-[12px] font-bold text-gray-400 dark:text-zinc-500">{serial}</span>

                  {/* Account Title + status dot */}
                  <div className="pr-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${acc.isActive ? "bg-emerald-500" : "bg-gray-300 dark:bg-zinc-600"}`} />
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{acc.accountTitle}</span>
                    </div>
                    {!acc.isActive && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 pl-3.5">Inactive</span>
                    )}
                  </div>

                  {/* Payment Method badge */}
                  <div className="pl-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold ${METHOD_COLOR[acc.paymentMethod]}`}>
                      <Icon className="w-3 h-3" />{acc.paymentMethod}
                    </span>
                  </div>

                  {/* IBAN / Account No */}
                  <div className="pl-2 min-w-0">
                    {acc.iban ? (
                      <span className="text-[12px] font-mono text-gray-700 dark:text-gray-300 truncate block">{acc.iban}</span>
                    ) : (
                      <span className="text-[12px] text-gray-300 dark:text-zinc-600 italic">—</span>
                    )}
                  </div>

                  {/* Description */}
                  <div className="pl-2 min-w-0">
                    {acc.description ? (
                      <span className="text-[12px] text-gray-500 dark:text-gray-400 truncate block" title={acc.description}>
                        {acc.description}
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300 dark:text-zinc-600 italic">—</span>
                    )}
                  </div>

                  {/* Date */}
                  <span className="pl-2 text-[12px] text-gray-500 dark:text-gray-400">{date}</span>

                  {/* Actions */}
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => openEdit(acc)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(acc)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/30">
            <span className="text-[12px] text-gray-400">
              Page {page} of {totalPages} &nbsp;·&nbsp; {filtered.length} records
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce<(number | "…")[]>((acc, n, i, arr) => {
                  if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "…"
                    ? <span key={`e${i}`} className="px-1 text-gray-400 text-[12px]">…</span>
                    : <button
                        key={n}
                        onClick={() => setPage(n as number)}
                        className={`w-7 h-7 rounded-lg text-[12px] font-semibold transition-colors ${
                          page === n
                            ? "bg-blue-600 text-white"
                            : "border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700"
                        }`}
                      >{n}</button>
                )
              }
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Form dialog ─────────────────────────────────────────────────── */}
      <FormDialog
        open={dialogOpen}
        initial={editing ? {
          accountTitle:  editing.accountTitle,
          paymentMethod: editing.paymentMethod,
          iban:          editing.iban,
          description:   editing.description,
          isActive:      editing.isActive,
        } : null}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSave={handleSave}
      />

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Delete Payment Account
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteTarget?.accountTitle}"</strong>?
              This cannot be undone. Any invoices referencing this account will retain their existing payment details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
              onClick={handleDelete}
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
