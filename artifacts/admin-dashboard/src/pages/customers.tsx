import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useCustomers, useLeads } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Customer, CustomerStatus, Lead, convertLeadToCustomer } from "@/lib/store";
import { CURRENCIES, formatAmount } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Search, Trash2, Eye, RefreshCw, X, Save, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_ID, NEW_ROW_BG } from "@/components/editable-cell";

// ─── Column definitions ────────────────────────────────────────────────────────
const CUSTOMER_STATUSES: CustomerStatus[] = ["Active", "Inactive", "Churned"];
const STATUS_COLORS: Record<string, string> = {
  Active:   "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  Inactive: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  Churned:  "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
};

const COLS: ColDef[] = [
  { field: "name",          label: "Name",          minW: 150, type: "text"  },
  { field: "company",       label: "Company",       minW: 140, type: "text"  },
  { field: "email",         label: "Email",         minW: 190, type: "email" },
  { field: "phone",         label: "Phone",         minW: 120, type: "tel"   },
  { field: "industry",      label: "Industry",      minW: 120, type: "text"  },
  { field: "city",          label: "City",          minW: 110, type: "text"  },
  { field: "status",        label: "Status",        minW: 130, type: "select", options: CUSTOMER_STATUSES, optionColors: STATUS_COLORS },
  { field: "customerSince", label: "Since",         minW: 120, type: "date"  },
  { field: "totalValue",    label: "Value",         minW: 110, type: "text"  },
  { field: "notes",         label: "Notes",         minW: 180, type: "text"  },
];
const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

type EditableField = "name" | "company" | "email" | "phone" | "industry" | "city" | "status" | "customerSince" | "totalValue" | "notes";

const BLANK = (): Record<EditableField, string> => ({
  name: "", company: "", email: "", phone: "", industry: "", city: "",
  status: "Active", customerSince: new Date().toISOString().split("T")[0], totalValue: "", notes: "",
});

const TABS = ["All Customers", "Convert from Leads"] as const;
type Tab = typeof TABS[number];

export default function CustomersPage() {
  const { customers, addCustomer, editCustomer, removeCustomer, refresh } = useCustomers();
  const { leads } = useLeads();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [activeTab,    setActiveTab]    = useState<Tab>("All Customers");
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [viewCust,     setViewCust]     = useState<Customer | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);

  // KPIs
  const totalRevenue = useMemo(() => customers.reduce((a, c) => {
    const n = parseFloat(c.totalValue?.replace(/[^0-9.]/g, "") || "0");
    return a + (isNaN(n) ? 0 : n);
  }, 0), [customers]);

  const convertedIds = useMemo(() => new Set(customers.map(c => c.leadId).filter(Boolean)), [customers]);
  const eligibleLeads = useMemo(() => leads.filter(l => l.status === "Won" && !convertedIds.has(l.id)), [leads, convertedIds]);

  const filtered = useMemo(() =>
    customers.filter(c => {
      const q = search.toLowerCase();
      const mQ = !q || [c.name, c.company, c.industry, c.city].some(v => v?.toLowerCase().includes(q));
      const mS = statusFilter === "All" || c.status === statusFilter;
      return mQ && mS;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [customers, search, statusFilter]
  );

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const c = customers.find(x => x.id === id);
    if (!c || (c as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editCustomer(id, { [field]: value } as Partial<Customer>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [customers, editCustomer, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(c => c.id)];
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
    const rows = [NEW_ROW_ID, ...filtered.map(c => c.id)];
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
    if (!newRow?.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); setNewRowActive(0); return; }
    addCustomer({
      name: newRow.name, company: newRow.company, email: newRow.email, phone: newRow.phone,
      industry: newRow.industry, city: newRow.city, status: newRow.status as CustomerStatus,
      customerSince: newRow.customerSince, totalValue: newRow.totalValue, notes: newRow.notes,
      currency: "GBP", tags: [], source: "direct",
    });
    toast({ title: "Customer added", description: `${newRow.name} added.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const c = customers.find(x => x.id === deleteId);
    removeCustomer(deleteId);
    if (viewCust?.id === deleteId) setViewCust(null);
    toast({ title: "Customer removed", description: `${c?.name} deleted.` });
    setDeleteId(null);
  };

  const handleConvert = (lead: Lead) => {
    convertLeadToCustomer(lead);
    refresh();
    toast({ title: "Lead converted", description: `${lead.name} added as customer.` });
    setActiveTab("All Customers");
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Enter to save · Esc to cancel</p>
        </div>
        {isAuthenticated && (
          <div className="flex gap-2">
            {eligibleLeads.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setActiveTab("Convert from Leads")} className="gap-1.5">
                <RefreshCw size={13} />{eligibleLeads.length} to convert
              </Button>
            )}
            <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5" data-testid="btn-add-customer">
              <Plus size={14} /> Add Customer
            </Button>
          </div>
        )}
      </div>

      {/* KPI filter pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Total",    value: customers.length,                                      filter: "All",      color: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground",               activeRing: "ring-gray-400 dark:ring-gray-500"   },
          { label: "Active",   value: customers.filter(c => c.status === "Active").length,   filter: "Active",   color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",           activeRing: "ring-emerald-500 dark:ring-emerald-400" },
          { label: "Inactive", value: customers.filter(c => c.status === "Inactive").length, filter: "Inactive", color: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",                 activeRing: "ring-amber-400 dark:ring-amber-500"   },
          { label: "Churned",  value: customers.filter(c => c.status === "Churned").length,  filter: "Churned",  color: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400",                         activeRing: "ring-red-400 dark:ring-red-500"     },
        ].map(k => {
          const isActive = statusFilter === k.filter;
          return (
            <button
              key={k.label}
              aria-pressed={isActive}
              onClick={() => setStatusFilter(prev => prev === k.filter && k.filter !== "All" ? "All" : k.filter)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] hover:shadow-sm ${k.color} ${isActive ? `ring-2 ring-offset-1 ${k.activeRing} shadow-sm font-bold` : "ring-0 opacity-80 hover:opacity-100"}`}
              title={isActive && k.filter !== "All" ? "Click to clear filter" : `Filter by ${k.label}`}
            >
              {k.label}: <span>{k.value}</span>
              {isActive && k.filter !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
            </button>
          );
        })}
        {totalRevenue > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 select-none">
            Revenue: {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(totalRevenue)}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === tab ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {tab}
            {tab === "Convert from Leads" && eligibleLeads.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">{eligibleLeads.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── All Customers tab ─────────────────────────────────────────────────── */}
      {activeTab === "All Customers" && (
        <>
          {/* Toolbar */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search customers..." className="pl-8 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                {CUSTOMER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {isAuthenticated && newRow && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
                <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
              </div>
            )}
            <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {customers.length}</div>
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
                    return (
                      <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`} style={{ height: `${CELL_H}px` }}>
                        {isA && c.type === "select" ? (
                          <select autoFocus value={newRow[c.field as EditableField]} onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                            onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                            className="absolute inset-0 w-full h-full px-2 text-[13px] bg-white dark:bg-card border-0 outline-none">
                            {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : isA ? (
                          <input autoFocus type={c.type} value={newRow[c.field as EditableField]} placeholder={c.label}
                            onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                            onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); } if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); } if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); } }}
                            className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                        ) : (
                          <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                            {c.field === "status" ? (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[newRow.status]}`}>{newRow.status}</span>
                            ) : (
                              <span className={`truncate ${!newRow[c.field as EditableField] ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{newRow[c.field as EditableField] || c.label}</span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px` }}>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Save"><Save size={13} /></button>
                      <button onClick={() => { setNewRow(null); setNewRowActive(null); }} className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" title="Cancel"><X size={13} /></button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Existing rows */}
              {filtered.length === 0 ? (
                <tr><td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
                  {search || statusFilter !== "All" ? "No customers match your filters." : "No customers yet. Click Add Customer to get started."}
                </td></tr>
              ) : filtered.map((cust, ri) => {
                const isRowActive = activeCell?.id === cust.id;
                return (
                  <tr key={cust.id} data-testid={`row-customer-${cust.id}`}
                    className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                    <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                    {COLS.map((c, ci) => {
                      const isA = activeCell?.id === cust.id && activeCell.col === ci;
                      return (
                        <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-blue-50/40 dark:hover:bg-blue-950/20"}`}
                          style={{ height: `${CELL_H}px` }}
                          onClick={() => !isA && isAuthenticated && setActiveCell({ id: cust.id, col: ci })}>
                          <EditableCell
                            value={String((cust as unknown as Record<string, string>)[c.field] ?? "")}
                            col={c} active={isA} canEdit={isAuthenticated}
                            onActivate={() => setActiveCell({ id: cust.id, col: ci })}
                            onCommit={v => commitCell(cust.id, c.field as EditableField, v)}
                            onCancel={() => setActiveCell(null)}
                            onTab={s => navigateCell(cust.id, ci, s)}
                            onEnter={() => moveCellDown(cust.id, ci)}
                          />
                        </td>
                      );
                    })}
                    <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={{ height: `${CELL_H}px` }} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors" title="View" onClick={() => setViewCust(cust)}><Eye size={13} /></button>
                        <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete" onClick={() => setDeleteId(cust.id)}><Trash2 size={13} /></button>
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
        </>
      )}

      {/* ── Convert from Leads tab ─────────────────────────────────────────────── */}
      {activeTab === "Convert from Leads" && (
        <div className="rounded-xl border border-gray-200 dark:border-border overflow-hidden bg-white dark:bg-card shadow-sm">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide">Company</th>
                <th className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide">Email</th>
                <th className="border-b border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-center py-2.5 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide w-28">Action</th>
              </tr>
            </thead>
            <tbody>
              {eligibleLeads.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-14 text-muted-foreground text-sm">
                  No won leads available to convert. Mark a lead as "Won" to convert it here.
                </td></tr>
              ) : eligibleLeads.map((l, i) => (
                <tr key={l.id} className={`border-b border-gray-100 dark:border-border ${i % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"}`}>
                  <td className="px-4 py-2.5 font-medium">{l.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{l.company}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{l.email || "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px] text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={() => handleConvert(l)}>
                      <ArrowRight size={12} /> Convert
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail sheet */}
      <Sheet open={!!viewCust} onOpenChange={o => { if (!o) setViewCust(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6"><SheetTitle>Customer Details</SheetTitle></SheetHeader>
          {viewCust && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xl font-bold">{viewCust.name}</h3>
                <p className="text-muted-foreground">{viewCust.company}</p>
                <span className={`inline-flex mt-2 px-2.5 py-1 rounded-full text-[12px] font-semibold ${STATUS_COLORS[viewCust.status]}`}>{viewCust.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: "Email",    value: viewCust.email,    link: `mailto:${viewCust.email}` },
                  { label: "Phone",    value: viewCust.phone,    link: `tel:${viewCust.phone}` },
                  { label: "Industry", value: viewCust.industry },
                  { label: "City",     value: viewCust.city },
                  { label: "Since",    value: viewCust.customerSince ? format(new Date(viewCust.customerSince), "d MMM yyyy") : "—" },
                  { label: "Value",    value: viewCust.totalValue ? formatAmount(parseFloat(viewCust.totalValue || "0"), viewCust.currency || "GBP") : "—" },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{item.label}</p>
                    {(item as { link?: string }).link && item.value
                      ? <a href={(item as { link?: string }).link} className="text-primary hover:underline">{item.value}</a>
                      : <span>{item.value || "—"}</span>}
                  </div>
                ))}
              </div>
              {viewCust.tags?.length ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Tags</p>
                  <div className="flex flex-wrap gap-1">{viewCust.tags.map(t => <span key={t} className="px-2 py-0.5 bg-muted rounded-full text-[11px]">{t}</span>)}</div>
                </div>
              ) : null}
              {viewCust.notes && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{viewCust.notes}</p>
                </div>
              )}
              {isAuthenticated && (
                <div className="pt-4 border-t">
                  <Button variant="destructive" className="w-full gap-2" onClick={() => { setDeleteId(viewCust.id); setViewCust(null); }}>
                    <Trash2 size={14} /> Delete Customer
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
            <AlertDialogTitle>Delete this customer?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete">Delete Customer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
