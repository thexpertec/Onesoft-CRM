import { useState, useEffect } from "react";
import { useProductCategories } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { ProductCategory } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  Package, Plus, Edit, Trash2, FolderOpen, Tag, Search, LayoutGrid, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

// ─── Preset colours ────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  { label: "Blue",    hex: "#3b82f6" },
  { label: "Indigo",  hex: "#6366f1" },
  { label: "Violet",  hex: "#8b5cf6" },
  { label: "Pink",    hex: "#ec4899" },
  { label: "Rose",    hex: "#f43f5e" },
  { label: "Red",     hex: "#ef4444" },
  { label: "Orange",  hex: "#f97316" },
  { label: "Amber",   hex: "#f59e0b" },
  { label: "Emerald", hex: "#10b981" },
  { label: "Teal",    hex: "#14b8a6" },
  { label: "Cyan",    hex: "#06b6d4" },
  { label: "Slate",   hex: "#64748b" },
];

// ─── Zod schema ───────────────────────────────────────────────────────────────
const categorySchema = z.object({
  name:        z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  color:       z.string().min(1, "Please choose a colour"),
});
type CategoryFormValues = z.infer<typeof categorySchema>;

// ─── Colour swatch picker ─────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {PRESET_COLORS.map(c => (
        <button
          key={c.hex}
          type="button"
          title={c.label}
          onClick={() => onChange(c.hex)}
          className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary ${
            value === c.hex ? "border-foreground scale-110" : "border-transparent"
          }`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  );
}

// ─── Category form (shared for add + edit) ────────────────────────────────────
function CategoryForm({
  form,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<CategoryFormValues>>;
  onSubmit: (data: CategoryFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Category Name *</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Web Development, Consulting" data-testid="input-category-name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                rows={2}
                placeholder="Brief description of what this category covers..."
                className="resize-none"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="color" render={({ field }) => (
          <FormItem>
            <FormLabel>Colour *</FormLabel>
            <FormControl>
              <ColorPicker value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
            {field.value && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: field.value }} />
                {PRESET_COLORS.find(c => c.hex === field.value)?.label ?? "Custom"} selected
              </p>
            )}
          </FormItem>
        )} />

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" data-testid="btn-submit-category">{submitLabel}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { categories, addCategory, editCategory, removeCategory } = useProductCategories();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [search,     setSearch]     = useState("");
  const [view,       setView]       = useState<"grid" | "list">("grid");
  const [addOpen,    setAddOpen]    = useState(false);
  const [editOpen,   setEditOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<ProductCategory | null>(null);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);

  const filtered = categories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // ── Add form ─────────────────────────────────────────────────────────────────
  const addForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", description: "", color: "#3b82f6" },
  });

  const handleAdd = (data: CategoryFormValues) => {
    addCategory({ name: data.name, description: data.description ?? "", color: data.color });
    toast({ title: "Category created", description: `"${data.name}" has been added.` });
    addForm.reset();
    setAddOpen(false);
  };

  // ── Edit form ─────────────────────────────────────────────────────────────────
  const editForm = useForm<CategoryFormValues>({ resolver: zodResolver(categorySchema) });

  useEffect(() => {
    if (editTarget) {
      editForm.reset({ name: editTarget.name, description: editTarget.description, color: editTarget.color });
    }
  }, [editTarget]);

  const handleEdit = (data: CategoryFormValues) => {
    if (!editTarget) return;
    editCategory(editTarget.id, { name: data.name, description: data.description ?? "", color: data.color });
    toast({ title: "Category updated", description: `"${data.name}" has been saved.` });
    setEditOpen(false);
    setEditTarget(null);
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!deleteId) return;
    const cat = categories.find(c => c.id === deleteId);
    removeCategory(deleteId);
    toast({ title: "Category deleted", description: `"${cat?.name}" has been removed.` });
    setDeleteId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" /> Products &amp; Services
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage your product and service catalogue.
          </p>
        </div>
        {isAuthenticated && (
          <Button onClick={() => setAddOpen(true)} className="gap-1.5 self-start sm:self-auto" data-testid="btn-add-category">
            <Plus size={15} /> Add Category
          </Button>
        )}
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground border-b border-border pb-4">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <FolderOpen size={15} className="text-primary" />
          {categories.length} {categories.length === 1 ? "category" : "categories"}
        </span>
        <span className="flex items-center gap-1.5">
          <Tag size={13} />
          Products coming soon
        </span>
      </div>

      {/* ── Section: Categories ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Categories</h2>
            <p className="text-xs text-muted-foreground">Organise your products and services into groups.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8 h-8 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* View toggle */}
            <div className="flex border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`p-1.5 transition-colors ${view === "grid" ? "bg-muted" : "hover:bg-muted/50"}`}
                title="Grid view"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-1.5 transition-colors ${view === "list" ? "bg-muted" : "hover:bg-muted/50"}`}
                title="List view"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <FolderOpen className="w-12 h-12 opacity-20" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                {search ? "No categories match your search." : "No categories yet."}
              </p>
              {!search && (
                <p className="text-xs">
                  {isAuthenticated
                    ? "Create your first category to start organising your products."
                    : "Login to create categories."}
                </p>
              )}
            </div>
            {isAuthenticated && !search && (
              <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1 mt-1">
                <Plus size={13} /> Add Category
              </Button>
            )}
          </div>
        )}

        {/* ── Grid view ────────────────────────────────────────────────────── */}
        {filtered.length > 0 && view === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(cat => (
              <Card
                key={cat.id}
                className="group relative overflow-hidden hover:shadow-md transition-shadow border border-border"
              >
                {/* Colour accent bar */}
                <div className="h-1.5 w-full" style={{ backgroundColor: cat.color }} />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: cat.color + "22" }}
                      >
                        <FolderOpen size={16} style={{ color: cat.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{cat.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Added {format(new Date(cat.createdAt), "d MMM yyyy")}
                        </p>
                      </div>
                    </div>
                    {isAuthenticated && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditTarget(cat); setEditOpen(true); }}
                          data-testid={`btn-edit-category-${cat.id}`}
                        >
                          <Edit size={13} />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(cat.id)}
                          data-testid={`btn-delete-category-${cat.id}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )}
                  </div>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
                      {cat.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── List view ────────────────────────────────────────────────────── */}
        {filtered.length > 0 && view === "list" && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left font-semibold text-muted-foreground px-4 py-3">Category</th>
                  <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden md:table-cell">Description</th>
                  <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden sm:table-cell">Created</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((cat, i) => (
                  <tr key={cat.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-medium">{cat.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      <span className="line-clamp-1">{cat.description || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                      {format(new Date(cat.createdAt), "d MMM yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      {isAuthenticated && (
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setEditTarget(cat); setEditOpen(true); }}
                          >
                            <Edit size={13} />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteId(cat.id)}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {filtered.length} of {categories.length} {categories.length === 1 ? "category" : "categories"}
          </p>
        )}
      </div>

      {/* ── Add Dialog ─────────────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) addForm.reset({ name: "", description: "", color: "#3b82f6" }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen size={18} /> New Category
            </DialogTitle>
            <DialogDescription>
              Define a category to organise your products and services.
            </DialogDescription>
          </DialogHeader>
          <CategoryForm form={addForm} onSubmit={handleAdd} onCancel={() => setAddOpen(false)} submitLabel="Create Category" />
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit size={18} /> Edit Category
            </DialogTitle>
            <DialogDescription>Update this category's name, description or colour.</DialogDescription>
          </DialogHeader>
          <CategoryForm form={editForm} onSubmit={handleEdit} onCancel={() => { setEditOpen(false); setEditTarget(null); }} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the category. Any products assigned to it will need to be re-categorised.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete-category"
            >
              Delete Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
