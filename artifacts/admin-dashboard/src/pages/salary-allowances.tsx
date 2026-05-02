import { useState, useMemo } from "react";
import { TrendingUp, Pencil, Trash2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSalaryAllowanceCategories } from "@/hooks/use-data";
import { getAccounts, SalaryAllowanceCategory } from "@/lib/store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useAccounts() {
  return useMemo(() => {
    return getAccounts()
      .filter(a => a.isActive !== false)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, []);
}

const EMPTY = { accountGroupId: "", accountGroupName: "", name: "" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalaryAllowancesPage() {
  const accounts                           = useAccounts();
  const { cats, add, edit, remove }        = useSalaryAllowanceCategories();
  const { toast }                          = useToast();

  const [form, setForm]       = useState<typeof EMPTY>(EMPTY);
  const [editId, setEditId]   = useState<string | null>(null);
  const [deleteId, setDelete] = useState<string | null>(null);
  const [search, setSearch]   = useState("");

  const filtered = useMemo(
    () => cats.filter(c =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.accountGroupName.toLowerCase().includes(search.toLowerCase())
    ),
    [cats, search]
  );

  function resetForm() {
    setForm(EMPTY);
    setEditId(null);
  }

  function onSelectAccount(id: string) {
    const acc = accounts.find(a => a.id === id);
    setForm(f => ({
      ...f,
      accountGroupId:   id,
      accountGroupName: acc ? `${acc.code} | ${acc.name}` : id,
    }));
  }

  function handleSubmit() {
    if (!form.accountGroupId) {
      toast({ title: "Account group is required", variant: "destructive" });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "Allowance name is required", variant: "destructive" });
      return;
    }
    if (editId) {
      edit(editId, { ...form, name: form.name.trim() });
      toast({ title: "Allowance updated" });
    } else {
      add({ ...form, name: form.name.trim() });
      toast({ title: "Allowance category added" });
    }
    resetForm();
  }

  function openEdit(cat: SalaryAllowanceCategory) {
    setEditId(cat.id);
    setForm({
      accountGroupId:   cat.accountGroupId,
      accountGroupName: cat.accountGroupName,
      name:             cat.name,
    });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-background shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-500" />
            Salary Allowances
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define allowance categories linked to chart-of-accounts groups
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

          {/* ── Left: Form ──────────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/40">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Pencil size={14} className="text-emerald-500" />
                {editId ? "Edit Allowance" : "Add Allowance"}
              </h2>
              {editId && (
                <button
                  onClick={resetForm}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Cancel edit"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {/* Account Group */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium after:content-['*'] after:ml-0.5 after:text-destructive">
                  Select Account Group
                </label>
                <Select value={form.accountGroupId} onValueChange={onSelectAccount}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select Group" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {accounts.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No accounts — add in Chart of Accounts
                      </SelectItem>
                    ) : (
                      accounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} | {a.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Allowance name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium after:content-['*'] after:ml-0.5 after:text-destructive">
                  Allowance
                </label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  placeholder="e.g. House Rent, Transport Allowance"
                  className="h-10"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleSubmit}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <Plus size={14} />
                  {editId ? "Update" : "Add Allowance"}
                </Button>
                {editId && (
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: List ─────────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/40">
              <h2 className="font-semibold text-sm">Category List</h2>
              <div className="relative w-48">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <TrendingUp size={28} className="text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  {cats.length === 0 ? "No allowance categories yet" : "No results for your search"}
                </p>
                {cats.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Use the form to add your first allowance category.
                  </p>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide w-10">Sl</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Account Group</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wide font-semibold text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cat, idx) => (
                    <tr
                      key={cat.id}
                      className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${editId === cat.id ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}
                    >
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">{cat.name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                        {cat.accountGroupName}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(cat)}
                            className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => setDelete(cat.id)}
                            className="p-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete allowance category?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The category will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) { remove(deleteId); setDelete(null); if (editId === deleteId) resetForm(); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
