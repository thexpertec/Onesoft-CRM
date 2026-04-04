import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSuppliers } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Supplier, SupplierStatus } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Truck, Plus, Search, Trash2, Eye, X, Save, Star as StarIcon, BadgeCheck, ShieldAlert, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";

// ─── Constants ─────────────────────────────────────────────────────────────────
const SUPPLIER_STATUSES: SupplierStatus[] = ["Active", "Inactive", "Blacklisted"];
const STATUS_COLORS: Record<string, string> = {
  Active:      "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  Inactive:    "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  Blacklisted: "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400",
};
const SUPPLIER_CATEGORIES = [
  "Software & Technology","Hardware & Equipment","Consulting & Advisory",
  "Marketing & Design","Legal & Compliance","Finance & Accounting",
  "HR & Recruitment","Logistics & Delivery","Office Supplies","Other",
];

// ─── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef[] = [
  { field: "company",       label: "Company",      minW: 150, type: "text"   },
  { field: "contactPerson", label: "Contact",      minW: 140, type: "text"   },
  { field: "email",         label: "Email",        minW: 180, type: "email"  },
  { field: "phone",         label: "Phone",        minW: 120, type: "tel"    },
  { field: "category",     label: "Category",     minW: 160, type: "select", options: SUPPLIER_CATEGORIES },
  { field: "city",          label: "City",         minW: 110, type: "text"   },
  { field: "country",       label: "Country",      minW: 110, type: "text"   },
  { field: "status",        label: "Status",       minW: 130, type: "select", options: SUPPLIER_STATUSES, optionColors: STATUS_COLORS },
  { field: "rating",        label: "Rating",       minW: 120, type: "stars"  },
  { field: "notes",         label: "Notes",        minW: 180, type: "text"   },
];
const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

type EditableField = "company" | "contactPerson" | "email" | "phone" | "category" | "city" | "country" | "status" | "rating" | "notes";

const BLANK = (): Record<EditableField, string> => ({
  company: "", contactPerson: "", email: "", phone: "",
  category: SUPPLIER_CATEGORIES[0], city: "", country: "",
  status: "Active", rating: "0", notes: "",
});

// ─── Star display helper ──────────────────────────────────────────────────────
function Stars({ n }: { n: number }) {
  if (!n) return <span className="text-[12px] text-gray-300 dark:text-muted-foreground/30">—</span>;
  return (
    <span className="flex gap-0.5">{[1,2,3,4,5].map(i => (
      <StarIcon key={i} size={12} className={i <= n ? "fill-amber-400 text-amber-400" : "fill-transparent text-gray-200 dark:text-gray-600"} />
    ))}</span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const { suppliers, addSupplier, editSupplier, removeSupplier } = useSuppliers();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [catFilter,    setCatFilter]    = useState("All");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [viewSupp,     setViewSupp]     = useState<Supplier | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);

  // KPIs
  const activeCount  = suppliers.filter(s => s.status === "Active").length;
  const blacklisted  = suppliers.filter(s => s.status === "Blacklisted").length;
  const avgRating    = useMemo(() => {
    const rated = suppliers.filter(s => s.rating > 0);
    return rated.length ? (rated.reduce((a, s) => a + s.rating, 0) / rated.length).toFixed(1) : "—";
  }, [suppliers]);

  const filtered = useMemo(() =>
    suppliers.filter(s => {
      const q = search.toLowerCase();
      const mQ = !q || [s.company, s.contactPerson, s.category, s.city, s.country].some(v => v?.toLowerCase().includes(q));
      const mS = statusFilter === "All" || s.status === statusFilter;
      const mC = catFilter === "All" || s.category === catFilter;
      return mQ && mS && mC;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [suppliers, search, statusFilter, catFilter]
  );

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Commit cell — rating is numeric
  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const s = suppliers.find(x => x.id === id);
    if (!s) { setActiveCell(null); return; }
    const update: Partial<Supplier> = field === "rating"
      ? { rating: parseInt(value) || 0 }
      : { [field]: value };
    editSupplier(id, update);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [suppliers, editSupplier, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(s => s.id)];
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(nc); }
    else { setActiveCell({ id: nid, col: nc }); setNewRowActive(null); }
  }, [filtered]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = [NEW_ROW_ID, ...filtered.map(s => s.id)];
    const ri = rows.indexOf(id);
    const nr = ri + 1;
    if (nr >= rows.length) { setActiveCell(null); return; }
    const nid = rows[nr];
    if (nid === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(col); }
    else { setActiveCell({ id: nid, col }); setNewRowActive(null); }
  }, [filtered]);

  const navigateNewRow = (col: number, shift: boolean) => {
    const nc = col + (shift ? -1 : 1);
    if (nc >= COLS.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow?.company.trim()) { toast({ title: "Company is required", variant: "destructive" }); setNewRowActive(0); return; }
    addSupplier({
      company: newRow.company, contactPerson: newRow.contactPerson, email: newRow.email,
      phone: newRow.phone, category: newRow.category || SUPPLIER_CATEGORIES[0],
      city: newRow.city, country: newRow.country, status: newRow.status as SupplierStatus,
      rating: parseInt(newRow.rating) || 0, currency: "GBP", notes: newRow.notes, tags: [],
    });
    toast({ title: "Supplier added", description: `${newRow.company} added.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const s = suppliers.find(x => x.id === deleteId);
    removeSupplier(deleteId);
    if (viewSupp?.id === deleteId) setViewSupp(null);
    toast({ title: "Supplier removed", description: `${s?.company} deleted.` });
    setDeleteId(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Enter to save · Esc to cancel</p>
        </div>
        {isAuthenticated && (
          <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5" data-testid="btn-add-supplier">
            <Plus size={14} /> Add Supplier
          </Button>
        )}
      </div>

      {/* KPI filter pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Total",       value: suppliers.length,                                         filter: "All",         color: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground",                 activeRing: "ring-gray-400 dark:ring-gray-500",    clickable: true  },
          { label: "Active",      value: activeCount,                                               filter: "Active",      color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",           activeRing: "ring-emerald-500 dark:ring-emerald-400", clickable: true  },
          { label: "Inactive",    value: suppliers.filter(s => s.status === "Inactive").length,     filter: "Inactive",    color: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",                 activeRing: "ring-amber-400 dark:ring-amber-500",  clickable: true  },
          { label: "Blacklisted", value: blacklisted,                                               filter: "Blacklisted", color: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400",                         activeRing: "ring-red-400 dark:ring-red-500",      clickable: true  },
          { label: "Avg Rating",  value: avgRating,                                                 filter: null,          color: "bg-yellow-50 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-500",              activeRing: "",                                    clickable: false },
        ].map(k => {
          const isActive = k.clickable && statusFilter === k.filter;
          if (!k.clickable) {
            return (
              <div key={k.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold select-none ${k.color}`}>
                {k.label}: <span>{k.value}</span>
              </div>
            );
          }
          return (
            <button
              key={k.label}
              aria-pressed={isActive}
              onClick={() => setStatusFilter(prev => prev === k.filter! && k.filter !== "All" ? "All" : k.filter!)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] hover:shadow-sm ${k.color} ${isActive ? `ring-2 ring-offset-1 ${k.activeRing} shadow-sm font-bold` : "ring-0 opacity-80 hover:opacity-100"}`}
              title={isActive && k.filter !== "All" ? "Click to clear filter" : `Filter by ${k.label}`}
            >
              {k.label}: <span>{k.value}</span>
              {isActive && k.filter !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search suppliers..." className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-suppliers" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {SUPPLIER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-48 h-8 text-[13px]"><Filter size={12} className="mr-1 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Categories</SelectItem>
            {SUPPLIER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {suppliers.length}</div>
      </div>

      {/* Excel grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* New row */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: `${CELL_H}px` }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field as EditableField];
                return (
                  <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`} style={{ height: `${CELL_H}px` }}>
                    {isA && c.type === "select" ? (
                      <select autoFocus value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-2 text-[13px] bg-white dark:bg-card border-0 outline-none">
                        {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : isA && c.type === "stars" ? (
                      <div className="w-full h-full flex items-center px-2 gap-0.5">
                        {[1,2,3,4,5].map(n => {
                          const num = parseInt(val) || 0;
                          return (
                            <button key={n} type="button"
                              onClick={() => setNewRow(r => r ? { ...r, rating: String(n === num ? 0 : n) } : r)}
                              className="focus:outline-none hover:scale-110 transition-transform">
                              <StarIcon size={15} className={n <= num ? "fill-amber-400 text-amber-400" : "fill-transparent text-gray-300"} />
                            </button>
                          );
                        })}
                      </div>
                    ) : isA ? (
                      <input autoFocus type={c.type} value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                        {c.field === "status" ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[newRow.status]}`}>{newRow.status}</span>
                        ) : c.field === "rating" ? (
                          <Stars n={parseInt(val) || 0} />
                        ) : (
                          <span className={`truncate ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px` }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Save"><Save size={13} /></button>
                  <button onClick={() => { setNewRow(null); setNewRowActive(null); }} className="p-1 rounded text-red-400 hover:bg-red-50" title="Cancel"><X size={13} /></button>
                </div>
              </td>
            </tr>
          )}

          {/* Existing rows */}
          {filtered.length === 0 ? (
            <tr><td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
              {search || statusFilter !== "All" || catFilter !== "All" ? "No suppliers match your filters." : "No suppliers yet. Click Add Supplier to get started."}
            </td></tr>
          ) : filtered.map((supp, ri) => {
            const isRowActive = activeCell?.id === supp.id;
            return (
              <tr key={supp.id} data-testid={`row-supplier-${supp.id}`}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === supp.id && activeCell.col === ci;
                  const rawVal = c.field === "rating" ? String(supp.rating) : String((supp as unknown as Record<string, string>)[c.field] ?? "");
                  return (
                    <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-blue-50/40 dark:hover:bg-blue-950/20"}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && isAuthenticated && setActiveCell({ id: supp.id, col: ci })}>
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={isAuthenticated}
                        onActivate={() => setActiveCell({ id: supp.id, col: ci })}
                        onCommit={v => commitCell(supp.id, c.field as EditableField, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={s => navigateCell(supp.id, ci, s)}
                        onEnter={() => moveCellDown(supp.id, ci)}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: `${CELL_H}px` }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors" title="View" onClick={() => setViewSupp(supp)}><Eye size={13} /></button>
                    <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete" onClick={() => setDeleteId(supp.id)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Add row */}
          {isAuthenticated && !newRow && (
            <tr><td colSpan={COLS.length + 2}>
              <button onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                <Plus size={13} /> Add row
              </button>
            </td></tr>
          )}
        </ExcelGridShell>
      </div>

      {/* Detail sheet */}
      <Sheet open={!!viewSupp} onOpenChange={o => { if (!o) setViewSupp(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6"><SheetTitle>Supplier Details</SheetTitle></SheetHeader>
          {viewSupp && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xl font-bold">{viewSupp.company}</h3>
                {viewSupp.contactPerson && <p className="text-muted-foreground">{viewSupp.contactPerson}</p>}
                <span className={`inline-flex mt-2 px-2.5 py-1 rounded-full text-[12px] font-semibold ${STATUS_COLORS[viewSupp.status]}`}>{viewSupp.status}</span>
                {viewSupp.rating > 0 && <div className="flex gap-0.5 mt-2">{[1,2,3,4,5].map(n => <StarIcon key={n} size={14} className={n <= viewSupp.rating ? "fill-amber-400 text-amber-400" : "fill-transparent text-gray-200"} />)}</div>}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: "Email",    value: viewSupp.email,    link: `mailto:${viewSupp.email}` },
                  { label: "Phone",    value: viewSupp.phone,    link: `tel:${viewSupp.phone}` },
                  { label: "Category", value: viewSupp.category },
                  { label: "City",     value: viewSupp.city },
                  { label: "Country",  value: viewSupp.country },
                  { label: "Added",    value: format(new Date(viewSupp.createdAt), "d MMM yyyy") },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{item.label}</p>
                    {(item as { link?: string }).link && item.value
                      ? <a href={(item as { link?: string }).link} className="text-primary hover:underline">{item.value}</a>
                      : <span>{item.value || "—"}</span>}
                  </div>
                ))}
              </div>
              {viewSupp.notes && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{viewSupp.notes}</p>
                </div>
              )}
              {isAuthenticated && (
                <div className="pt-4 border-t">
                  <Button variant="destructive" className="w-full gap-2" onClick={() => { setDeleteId(viewSupp.id); setViewSupp(null); }}>
                    <Trash2 size={14} /> Delete Supplier
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this supplier?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete-supplier">Delete Supplier</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
