import { useState, useMemo, useCallback } from "react";
import { format } from "date-fns";
import {
  Users2, Plus, Search, X, Save, Trash2, Eye, FileSpreadsheet,
  Phone, Mail, MapPin, TrendingUp, BadgeDollarSign, Target, FileText,
  Award, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSalesAgents, useCities, useAreas } from "@/hooks/use-data";
import { FormWrapper, FormModeToggle, useFormMode } from "@/components/form-wrapper";
import { Combobox, ComboOption } from "@/components/combobox";
import { useAuth } from "@/contexts/auth-context";
import { getInvoices, getSales, SalesAgent, Sale } from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { downloadExcel } from "@/lib/export-excel";
import { useToast } from "@/hooks/use-toast";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_BG } from "@/components/editable-cell";

const dp = getSettingsDecimalPlaces();

type EditableField = "name" | "email" | "phone" | "region" | "city" | "area" | "commissionRate" | "targetAmount" | "status" | "joinDate" | "notes";
type NewRow = Record<string, string>;

const BLANK: NewRow = {
  agentCode: "", name: "", email: "", phone: "", region: "", city: "", area: "",
  commissionRate: "", targetAmount: "", status: "Active",
  joinDate: format(new Date(), "yyyy-MM-dd"), notes: "",
};

// ── Invoice total helper ──────────────────────────────────────────────────────
function calcInvTotal(inv: ReturnType<typeof getInvoices>[0]): number {
  const itemsSum = inv.items.reduce((s, it) => {
    const qty  = parseFloat(it.qty)              || 0;
    const up   = parseFloat(it.unitPrice)        || 0;
    const disc = parseFloat(it.discount || "0")  / 100;
    return s + qty * up * (1 - disc);
  }, 0);
  const tax      = itemsSum * (parseFloat(inv.taxRate     || "0") / 100);
  const shipping = parseFloat(inv.shippingFee || "0");
  const handling = parseFloat(inv.handlingFee || "0");
  return itemsSum + tax + shipping + handling;
}

// ── POS Sale total helper ─────────────────────────────────────────────────────
function calcSaleTotal(sale: Sale): number {
  const itemsSum = sale.items.reduce((s, it) => {
    const qty  = parseFloat(it.qty)             || 0;
    const up   = parseFloat(it.unitPrice)       || 0;
    const disc = parseFloat(it.discount || "0") / 100;
    return s + qty * up * (1 - disc);
  }, 0);
  return itemsSum * (1 + (parseFloat(sale.taxRate || "0") / 100));
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SalesAgentsPage() {
  const { agents, addAgent, editAgent, removeAgent } = useSalesAgents();
  const { cities } = useCities();
  const { areas }  = useAreas();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();

  const cityOptions   = useMemo(() => cities.map(c => c.name), [cities]);
  const areaOptions   = useMemo(() => areas.map(a => a.name), [areas]);
  const cityComboOpts = useMemo<ComboOption[]>(() => cities.map(c => ({ value: c.name, label: c.name })), [cities]);
  const areaComboOpts = useMemo<ComboOption[]>(() => areas.map(a => ({ value: a.name, label: a.name })), [areas]);

  const COLS = useMemo<ColDef[]>(() => [
    { field: "agentCode",      label: "Code",           minW: 90,  type: "readonly" },
    { field: "name",           label: "Name",            minW: 160, type: "text"     },
    { field: "email",          label: "Email",           minW: 190, type: "email"    },
    { field: "phone",          label: "Phone",           minW: 130, type: "tel"      },
    { field: "city",           label: "City",            minW: 120, type: cityOptions.length ? "select" : "text", options: cityOptions },
    { field: "area",           label: "Area / Region",   minW: 130, type: areaOptions.length ? "select" : "text", options: areaOptions },
    { field: "region",         label: "Territory (free)",minW: 140, type: "text"     },
    { field: "commissionRate", label: "Commission %",    minW: 110, type: "text"     },
    { field: "targetAmount",   label: "Monthly Target",  minW: 130, type: "text"     },
    { field: "status",         label: "Status",          minW: 100, type: "select",  options: ["Active", "Inactive"] },
    { field: "joinDate",       label: "Join Date",       minW: 110, type: "date"     },
    { field: "notes",          label: "Notes",           minW: 200, type: "text"     },
  ], [cityOptions, areaOptions]);
  const TOTAL_W = useMemo(() => COLS.reduce((s, c) => s + c.minW, 0), [COLS]);

  const [search,       setSearch]       = useState("");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [newRow,       setNewRow]       = useState<NewRow | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [viewId,       setViewId]       = useState<string | null>(null);

  // ── Add Agent form (dialog / sheet) ─────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, toggleFormMode] = useFormMode("agents-form-mode");
  const BLANK_FORM = () => ({
    name: "", email: "", phone: "",
    city: "", area: "", region: "",
    commissionRate: "", targetAmount: "",
    status: "Active" as SalesAgent["status"],
    joinDate: format(new Date(), "yyyy-MM-dd"),
    openingBalance: "", notes: "",
  });
  const [formData, setFormData] = useState(BLANK_FORM());
  const setF = (key: string, value: string) => setFormData(p => ({ ...p, [key]: value }));

  const openAgentForm = () => { setFormData(BLANK_FORM()); setFormOpen(true); };

  const submitAgentForm = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" }); return;
    }
    addAgent({
      name:           formData.name.trim(),
      email:          formData.email.trim(),
      phone:          formData.phone.trim(),
      city:           formData.city.trim() || undefined,
      area:           formData.area.trim() || undefined,
      region:         formData.region.trim(),
      commissionRate: formData.commissionRate.trim(),
      targetAmount:   formData.targetAmount.trim(),
      status:         formData.status,
      joinDate:       formData.joinDate || format(new Date(), "yyyy-MM-dd"),
      openingBalance: formData.openingBalance ? parseFloat(formData.openingBalance) : undefined,
      notes:          formData.notes.trim(),
    });
    toast({ title: "Agent added", description: `${formData.name.trim()} has been added.` });
    setFormOpen(false);
  };

  // Editable columns (skip readonly agentCode at index 0)
  const editableCols = COLS.filter(c => c.type !== "readonly");

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return agents;
    return agents.filter(a =>
      [a.name, a.agentCode, a.email, a.phone, a.region, a.status].some(v => v?.toLowerCase().includes(q))
    );
  }, [agents, search]);

  // ── New-row navigation ────────────────────────────────────────────────────
  const navigateNewRow = (ci: number, shift: boolean) => {
    let next = shift ? ci - 1 : ci + 1;
    if (next < 0) next = editableCols.length - 1;
    if (next >= editableCols.length) { commitNewRow(); return; }
    setNewRowActive(next);
  };

  // ── Commit new row ────────────────────────────────────────────────────────
  const commitNewRow = useCallback(() => {
    if (!newRow || !newRow.name?.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    addAgent({
      name:           newRow.name.trim(),
      email:          newRow.email?.trim() || "",
      phone:          newRow.phone?.trim() || "",
      city:           newRow.city?.trim() || "",
      area:           newRow.area?.trim() || "",
      region:         newRow.region?.trim() || "",
      commissionRate: newRow.commissionRate?.trim() || "",
      targetAmount:   newRow.targetAmount?.trim() || "",
      status:         (newRow.status as SalesAgent["status"]) || "Active",
      joinDate:       newRow.joinDate || format(new Date(), "yyyy-MM-dd"),
      notes:          newRow.notes?.trim() || "",
    });
    setNewRow(null);
    setNewRowActive(null);
    toast({ title: "Sales agent added" });
  }, [newRow, addAgent, toast]);

  // ── Commit existing cell ──────────────────────────────────────────────────
  const commitCell = useCallback((agentId: string, field: string, value: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    if ((agent as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editAgent(agentId, { [field]: value } as Partial<SalesAgent>);
    setActiveCell(null);
  }, [agents, editAgent]);

  // ── Tab navigation for existing rows ─────────────────────────────────────
  const navigateCell = useCallback((id: string, ci: number, shift: boolean) => {
    const rows = filtered.map(a => a.id);
    const ri   = rows.indexOf(id);
    let nc = ci + (shift ? -1 : 1);
    let nr = ri;
    // skip readonly cols (agentCode at ci 0)
    if (nc < 0)            { nc = COLS.length - 1; nr--; }
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    setActiveCell({ id: rows[nr], col: nc });
  }, [filtered]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const confirmDelete = () => {
    if (!deleteId) return;
    const a = agents.find(a => a.id === deleteId);
    removeAgent(deleteId);
    setDeleteId(null);
    toast({ title: `${a?.name || "Agent"} deleted` });
  };

  // ── Excel export ──────────────────────────────────────────────────────────
  const handleExport = () => {
    downloadExcel(filtered.map(a => ({
      Code:             a.agentCode,
      Name:             a.name,
      Email:            a.email,
      Phone:            a.phone,
      "Region / Area":  a.region,
      "Commission %":   a.commissionRate,
      "Monthly Target": a.targetAmount ? `${sym}${a.targetAmount}` : "",
      Status:           a.status,
      "Join Date":      a.joinDate,
      Notes:            a.notes,
    })), "Sales-Agents");
  };

  // ── Detail sheet data ─────────────────────────────────────────────────────
  const viewAgent = viewId ? agents.find(a => a.id === viewId) ?? null : null;

  const agentInvoices = useMemo(() => {
    if (!viewAgent) return [];
    return getInvoices().filter(inv =>
      inv.agentId === viewAgent.id ||
      inv.agentName?.trim().toLowerCase() === viewAgent.name.trim().toLowerCase()
    ).sort((a, b) => (b.invoiceDate > a.invoiceDate ? 1 : -1));
  }, [viewAgent]);

  const agentSales = useMemo(() => {
    if (!viewAgent) return [];
    return getSales().filter(s =>
      s.agentId === viewAgent.id ||
      s.agentName?.trim().toLowerCase() === viewAgent.name.trim().toLowerCase()
    ).sort((a, b) => (b.saleDate > a.saleDate ? 1 : -1));
  }, [viewAgent]);

  const agentStats = useMemo(() => {
    const invTotal   = agentInvoices.reduce((s, inv) => s + calcInvTotal(inv), 0);
    const posTotal   = agentSales.reduce((s, sale) => s + calcSaleTotal(sale), 0);
    const totalSales = invTotal + posTotal;
    const rate       = parseFloat(viewAgent?.commissionRate || "0") / 100;
    const commission = totalSales * rate;
    const now        = new Date();
    const thisMonthInv = agentInvoices
      .filter(inv => { const d = new Date(inv.invoiceDate || inv.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
      .reduce((s, inv) => s + calcInvTotal(inv), 0);
    const thisMonthPos = agentSales
      .filter(s => { const d = new Date(s.saleDate || s.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
      .reduce((s, sale) => s + calcSaleTotal(sale), 0);
    const thisMonthTotal = thisMonthInv + thisMonthPos;
    const target = parseFloat(viewAgent?.targetAmount || "0");
    const totalCount = agentInvoices.length + agentSales.length;
    return { totalSales, commission, invoiceCount: totalCount, thisMonthTotal, target, rate };
  }, [agentInvoices, agentSales, viewAgent]);

  const initials = (name: string) =>
    name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background shrink-0 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
            <Users2 size={16} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-[16px] font-bold">Sales Agents</h1>
            <p className="text-[12px] text-muted-foreground">{agents.length} agent{agents.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAuthenticated && newRow && (
            <>
              <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}>
                <X size={12} /> Cancel
              </Button>
              <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}>
                <Save size={12} /> Save Row
              </Button>
            </>
          )}

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7 h-8 text-[12px] w-52" placeholder="Search agents…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={11} />
              </button>
            )}
          </div>

          <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={handleExport}>
            <FileSpreadsheet size={13} /> Export
          </Button>

          {isAuthenticated && (
            <div className="flex items-center gap-1">
              <Button size="sm" className="gap-1.5 text-[12px] bg-teal-600 hover:bg-teal-700 text-white"
                onClick={openAgentForm}>
                <Plus size={13} /> Add Agent
              </Button>
              <FormModeToggle mode={formMode} onToggle={toggleFormMode} />
            </div>
          )}
        </div>
      </div>

      {/* ── Excel grid ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-4">
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W} tableId="sales-agents">

          {/* New row */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold"
                style={{ height: `${CELL_H}px` }}>★</td>

              {COLS.map((col, ci) => {
                const isEditableCol = col.type !== "readonly";
                const editIdx = editableCols.indexOf(col);
                const isA = newRowActive === editIdx;
                const val = newRow[col.field] ?? "";

                if (!isEditableCol) {
                  return (
                    <td key={col.field} className="border-r border-gray-100 dark:border-border relative p-0"
                      style={{ height: `${CELL_H}px` }}>
                      <div className="w-full h-full flex items-center px-3 text-[12px] text-muted-foreground/50 font-mono select-none">
                        AUTO
                      </div>
                    </td>
                  );
                }

                return (
                  <td key={col.field}
                    className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                    style={{ height: `${CELL_H}px` }}>
                    {isA && col.type === "select" ? (
                      <select autoFocus value={val}
                        onChange={e => setNewRow(r => r ? { ...r, [col.field]: e.target.value } : r)}
                        onKeyDown={e => {
                          if (e.key === "Tab") { e.preventDefault(); navigateNewRow(editIdx, e.shiftKey); }
                          if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); }
                        }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground">
                        {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : isA ? (
                      <input autoFocus
                        type={col.type === "date" ? "date" : col.type === "email" ? "email" : col.type === "tel" ? "tel" : "text"}
                        value={val}
                        placeholder={col.label}
                        onChange={e => setNewRow(r => r ? { ...r, [col.field]: e.target.value } : r)}
                        onKeyDown={e => {
                          if (e.key === "Tab") { e.preventDefault(); navigateNewRow(editIdx, e.shiftKey); }
                          if (e.key === "Enter") { e.preventDefault(); editIdx === editableCols.length - 1 ? commitNewRow() : navigateNewRow(editIdx, false); }
                          if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); }
                        }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text"
                        onClick={() => setNewRowActive(editIdx)}>
                        <span className={`truncate ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>
                          {val || col.label}
                        </span>
                      </div>
                    )}
                  </td>
                );
              })}

              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border"
                style={{ height: `${CELL_H}px` }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" title="Save">
                    <Save size={13} />
                  </button>
                  <button onClick={() => { setNewRow(null); setNewRowActive(null); }} className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" title="Cancel">
                    <X size={13} />
                  </button>
                </div>
              </td>
            </tr>
          )}

          {/* Empty state */}
          {filtered.length === 0 && !newRow && (
            <tr>
              <td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
                {search
                  ? "No agents match your search."
                  : <span>No sales agents yet. Click <strong>Add Agent</strong> to get started.</span>}
              </td>
            </tr>
          )}

          {/* Data rows */}
          {filtered.map((agent, ri) => {
            const isRowActive = activeCell?.id === agent.id;
            return (
              <tr key={agent.id}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>

                {/* Row number */}
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none"
                  style={{ height: `${CELL_H}px` }}>{ri + 1}</td>

                {COLS.map((col, ci) => {
                  const isA = activeCell?.id === agent.id && activeCell.col === ci;
                  const raw = String((agent as unknown as Record<string, string>)[col.field] ?? "");

                  return (
                    <td key={col.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : isAuthenticated && col.type !== "readonly" ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && isAuthenticated && col.type !== "readonly" && setActiveCell({ id: agent.id, col: ci })}>
                      <EditableCell
                        value={raw}
                        col={col}
                        active={isA}
                        canEdit={isAuthenticated && col.type !== "readonly"}
                        onActivate={() => setActiveCell({ id: agent.id, col: ci })}
                        onCommit={v => commitCell(agent.id, col.field, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={shift => navigateCell(agent.id, ci, shift)}
                        onEnter={() => setActiveCell(null)}
                      />
                    </td>
                  );
                })}

                {/* Actions */}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center"
                  style={{ height: `${CELL_H}px` }}>
                  <div className="flex items-center justify-center gap-0.5 h-full px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setViewId(agent.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
                      title="View agent details">
                      <Eye size={13} />
                    </button>
                    {isAuthenticated && (
                      <button
                        onClick={() => setDeleteId(agent.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Delete agent">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {/* + Add row footer */}
          {isAuthenticated && (
            <tr>
              <td colSpan={COLS.length + 2} className="px-4 py-2 border-t border-dashed border-gray-200 dark:border-border">
                <button
                  onClick={openAgentForm}
                  className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-teal-600 transition-colors">
                  <Plus size={12} /> Add row
                </button>
              </td>
            </tr>
          )}
        </ExcelGridShell>
      </div>

      {/* ── Add Agent form ─────────────────────────────────────────────────── */}
      <FormWrapper
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        dialogClass="w-[min(98vw,920px)] max-w-none"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0 bg-gradient-to-r from-violet-600 to-purple-600">
          <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Plus size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-bold text-white leading-snug">Add Sales Agent</h2>
            <p className="text-[11px] text-violet-100 truncate">
              {formData.name.trim() ? formData.name : "Name required · all other fields optional"}
            </p>
          </div>
          <FormModeToggle mode={formMode} onToggle={toggleFormMode} onClose={() => setFormOpen(false)} />
        </div>

        {/* Body */}
        <div className={`px-5 py-4 space-y-3.5${formMode === "sheet" ? " flex-1 overflow-y-auto" : ""}`}>

          {/* ── Row A: Name (full) ── */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground">Full Name <span className="text-red-500">*</span></label>
            <Input autoFocus placeholder="e.g. James Wilson" value={formData.name}
              onChange={e => setF("name", e.target.value)} className="h-8 text-sm font-medium" />
          </div>

          {/* ── Row B: Email | Phone | Join Date | City | Area | Territory ── */}
          <div className="grid grid-cols-6 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Email</label>
              <Input type="email" placeholder="agent@example.com" value={formData.email}
                onChange={e => setF("email", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Phone</label>
              <Input type="tel" placeholder="+44 7700 900000" value={formData.phone}
                onChange={e => setF("phone", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Join Date</label>
              <Input type="date" value={formData.joinDate}
                onChange={e => setF("joinDate", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">City</label>
              <Combobox value={formData.city} onChange={v => setF("city", v)}
                options={cityComboOpts} placeholder="City…"
                inputClassName="h-8 text-sm w-full border rounded-md px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Area / Region</label>
              <Combobox value={formData.area} onChange={v => setF("area", v)}
                options={areaComboOpts} placeholder="Area…"
                inputClassName="h-8 text-sm w-full border rounded-md px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Territory</label>
              <Input placeholder="e.g. North England" value={formData.region}
                onChange={e => setF("region", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* ── Divider: Status ── */}
          <div className="flex items-center gap-3 pt-0.5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Status</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* ── Row C: Status pill toggles ── */}
          <div className="flex gap-2">
            {(["Active", "Inactive"] as const).map(s => (
              <button key={s} type="button" onClick={() => setF("status", s)}
                className={`flex-1 h-8 rounded-lg text-[12px] font-semibold transition-all border ${
                  formData.status === s
                    ? s === "Active" ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                    :                  "bg-amber-500 border-amber-500 text-white shadow-sm"
                    : "bg-background border-border text-muted-foreground hover:border-gray-400 hover:text-foreground"
                }`}>{s}</button>
            ))}
          </div>

          {/* ── Divider: Targets & Commission ── */}
          <div className="flex items-center gap-3 pt-0.5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Targets &amp; Commission</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* ── Row D: Commission % | Monthly Target | Opening Balance ── */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-foreground">Commission %</label>
                {(() => {
                  const rate = parseFloat(formData.commissionRate);
                  const target = parseFloat(formData.targetAmount);
                  if (!isNaN(rate) && rate > 0 && !isNaN(target) && target > 0)
                    return <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400">{sym}{(target * rate / 100).toFixed(dp)}/mo</span>;
                  return null;
                })()}
              </div>
              <div className="relative">
                <Input type="number" step="0.1" min="0" max="100" placeholder="0"
                  value={formData.commissionRate} onChange={e => setF("commissionRate", e.target.value)}
                  className="h-8 text-sm pr-7 tabular-nums" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground pointer-events-none">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">% of each sale</p>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Monthly Target ({sym})</label>
              <Input type="number" step="0.01" min="0" placeholder="0.00"
                value={formData.targetAmount} onChange={e => setF("targetAmount", e.target.value)}
                className="h-8 text-sm tabular-nums" />
              <p className="text-[10px] text-muted-foreground leading-tight">Sales goal per month</p>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Opening Balance ({sym})</label>
              <Input type="number" step="0.01" placeholder="0.00"
                value={formData.openingBalance} onChange={e => setF("openingBalance", e.target.value)}
                className="h-8 text-sm tabular-nums" />
              <p className="text-[10px] text-muted-foreground leading-tight">Commission owed at setup</p>
            </div>
          </div>

          {/* ── Divider: Notes ── */}
          <div className="flex items-center gap-3 pt-0.5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Notes</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* ── Row E: Notes (full) ── */}
          <textarea rows={2} placeholder="Optional notes about this agent, specialisations, assigned accounts…"
            value={formData.notes} onChange={e => setF("notes", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />

        </div>

        {/* Footer */}
        <div className={`flex gap-3 px-5 py-3 border-t border-border bg-muted/20${formMode === "sheet" ? " shrink-0" : ""}`}>
          <Button variant="outline" onClick={() => setFormOpen(false)} className="h-9 px-5 text-[13px]">Cancel</Button>
          <Button onClick={submitAgentForm}
            className="flex-1 h-9 font-semibold text-[13px] bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white border-0 shadow-sm gap-1.5">
            <Plus size={14} /> Add Agent
          </Button>
        </div>
      </FormWrapper>

      {/* ── Delete dialog ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sales Agent</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{agents.find(a => a.id === deleteId)?.name ?? "this agent"}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Agent Detail Sheet ────────────────────────────────────────────── */}
      <Sheet open={!!viewId} onOpenChange={o => { if (!o) setViewId(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col gap-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{viewAgent?.name} — Agent Details</SheetTitle>
          </SheetHeader>

          {viewAgent && (
            <>
              {/* Gradient header */}
              <div className="bg-gradient-to-br from-teal-600 to-teal-700 px-6 py-5 text-white shrink-0">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0 text-lg font-bold">
                    {initials(viewAgent.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold truncate">{viewAgent.name}</h2>
                    <p className="text-teal-200 text-[12px] font-mono mt-0.5">{viewAgent.agentCode}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${viewAgent.status === "Active" ? "bg-emerald-400/30 text-emerald-100" : "bg-white/20 text-white/70"}`}>
                        {viewAgent.status}
                      </span>
                      {(viewAgent.city || viewAgent.area) && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/10 text-white/80 flex items-center gap-1">
                          <MapPin size={9} /> {[viewAgent.city, viewAgent.area].filter(Boolean).join(" › ")}
                        </span>
                      )}
                      {viewAgent.region && !viewAgent.city && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/10 text-white/80 flex items-center gap-1">
                          <MapPin size={9} /> {viewAgent.region}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                {/* Contact */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Contact</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <Mail size={13} className="text-muted-foreground shrink-0" />
                      <span className="text-[13px] truncate">{viewAgent.email || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-muted-foreground shrink-0" />
                      <span className="text-[13px]">{viewAgent.phone || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={13} className="text-muted-foreground shrink-0" />
                      <span className="text-[13px]">
                        {viewAgent.joinDate ? (() => { try { return format(new Date(viewAgent.joinDate), "d MMM yyyy"); } catch { return viewAgent.joinDate; } })() : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Award size={13} className="text-muted-foreground shrink-0" />
                      <span className="text-[13px]">{viewAgent.commissionRate ? `${viewAgent.commissionRate}% commission` : "No rate set"}</span>
                    </div>
                  </div>
                  {viewAgent.notes && (
                    <p className="mt-3 text-[12px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 italic">{viewAgent.notes}</p>
                  )}
                </div>

                {/* Performance cards */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Performance</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        icon: <FileText size={15} />,
                        label: "Total Invoices",
                        value: agentStats.invoiceCount.toString(),
                        sub: "all time",
                        color: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
                      },
                      {
                        icon: <BadgeDollarSign size={15} />,
                        label: "Total Sales",
                        value: `${sym}${agentStats.totalSales.toFixed(dp)}`,
                        sub: "all time",
                        color: "bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400",
                      },
                      {
                        icon: <TrendingUp size={15} />,
                        label: "Commission Earned",
                        value: `${sym}${agentStats.commission.toFixed(dp)}`,
                        sub: agentStats.rate > 0 ? `${viewAgent.commissionRate}% of sales` : "No rate set",
                        color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
                      },
                      {
                        icon: <Target size={15} />,
                        label: "This Month",
                        value: `${sym}${agentStats.thisMonthTotal.toFixed(dp)}`,
                        sub: agentStats.target > 0
                          ? `${Math.round((agentStats.thisMonthTotal / agentStats.target) * 100)}% of ${sym}${agentStats.target.toLocaleString()} target`
                          : "No target set",
                        color: agentStats.target > 0 && agentStats.thisMonthTotal >= agentStats.target
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
                      },
                    ].map(card => (
                      <div key={card.label} className="bg-muted/40 rounded-xl p-3 space-y-1.5">
                        <div className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${card.color} rounded-md px-2 py-0.5`}>
                          {card.icon} {card.label}
                        </div>
                        <p className="text-[17px] font-bold">{card.value}</p>
                        <p className="text-[10px] text-muted-foreground">{card.sub}</p>
                      </div>
                    ))}
                  </div>

                  {agentStats.target > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Monthly Target Progress</span>
                        <span>{Math.min(100, Math.round((agentStats.thisMonthTotal / agentStats.target) * 100))}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${agentStats.thisMonthTotal >= agentStats.target ? "bg-emerald-500" : "bg-teal-500"}`}
                          style={{ width: `${Math.min(100, (agentStats.thisMonthTotal / agentStats.target) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Unified Sales Ledger */}
                {(() => {
                  type LedgerRow = { key: string; date: string; ref: string; type: "Invoice" | "POS Sale"; customer: string; amount: number; status: string };
                  const rows: LedgerRow[] = [
                    ...agentInvoices.map(inv => ({
                      key: inv.id, date: inv.invoiceDate || inv.createdAt, ref: inv.invoiceNumber,
                      type: "Invoice" as const, customer: inv.customer, amount: calcInvTotal(inv), status: inv.status,
                    })),
                    ...agentSales.map(s => ({
                      key: s.id, date: s.saleDate || s.createdAt, ref: s.saleNumber,
                      type: "POS Sale" as const, customer: s.customer, amount: calcSaleTotal(s), status: s.status,
                    })),
                  ].sort((a, b) => (b.date > a.date ? 1 : -1));

                  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

                  return (
                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                        Sales Ledger <span className="font-normal">({rows.length} {rows.length === 1 ? "entry" : "entries"})</span>
                      </h3>

                      {rows.length === 0 ? (
                        <p className="text-[13px] text-muted-foreground italic">No sales or invoices linked to this agent yet.</p>
                      ) : (
                        <div className="rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="bg-muted/50">
                                {["Date", "Reference", "Type", "Customer", "Amount", "Status"].map(h => (
                                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, i) => (
                                <tr key={row.key} className={`border-b last:border-0 ${i % 2 !== 0 ? "bg-muted/20" : ""}`}>
                                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                    {row.date ? (() => { try { return format(new Date(row.date), "d MMM yy"); } catch { return row.date; } })() : "—"}
                                  </td>
                                  <td className="px-3 py-2 font-mono font-medium text-[11px]">{row.ref}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      row.type === "Invoice" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                                             : "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400"
                                    }`}>{row.type}</span>
                                  </td>
                                  <td className="px-3 py-2 max-w-[100px] truncate" title={row.customer}>{row.customer || "—"}</td>
                                  <td className="px-3 py-2 font-semibold text-right">{sym}{row.amount.toFixed(dp)}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      row.status === "Paid"      || row.status === "Completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                                      row.status === "Partial"                                 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" :
                                      row.status === "Overdue"   || row.status === "Cancelled" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" :
                                      row.status === "Sent"      || row.status === "Refunded"  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                      "bg-muted text-muted-foreground"
                                    }`}>{row.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-muted/40 border-t-2">
                                <td colSpan={4} className="px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase">Grand Total</td>
                                <td className="px-3 py-2 font-bold text-right text-[12px]">{sym}{grandTotal.toFixed(dp)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
