import { useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import {
  Factory, Eye, Trash2, Plus, CheckCircle2, XCircle, FlaskConical,
  Package, DollarSign, AlertTriangle, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useManufacturingOrders, useRawMaterials } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import {
  getProducts, MFG_STATUSES, MfgInput, MfgOutput, ProductionCost, ManufacturingOrder,
} from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { ExcelGridShell, ColDef, CELL_H } from "@/components/editable-cell";

// ── Grid columns ──────────────────────────────────────────────────────────────
const COLS: ColDef[] = [
  { field: "orderNumber", label: "Order #",   minW: 100, type: "text" },
  { field: "orderDate",   label: "Date",      minW: 110, type: "date" },
  { field: "status",      label: "Status",    minW: 120, type: "select", options: [...MFG_STATUSES] },
  { field: "_inputs",     label: "Inputs",    minW: 80,  type: "text" },
  { field: "_outputs",    label: "Outputs",   minW: 80,  type: "text" },
  { field: "_cost",       label: "Total Cost",minW: 110, type: "text" },
  { field: "notes",       label: "Notes",     minW: 200, type: "text" },
];
const TOTAL_MIN_W = COLS.reduce((s, c) => s + c.minW, 0) + 48 + 100;

const STATUS_BADGE: Record<string, string> = {
  "Draft":       "bg-muted text-muted-foreground",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  "Completed":   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  "Cancelled":   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

// ── Blank helpers ─────────────────────────────────────────────────────────────
const blankInput   = (): MfgInput       => ({ id: crypto.randomUUID(), rmId: "", rmName: "", unit: "", qtyUsed: "" });
const blankOutput  = (): MfgOutput      => ({ id: crypto.randomUUID(), productId: "", productName: "", qty: "", unit: "" });
const blankCost    = (): ProductionCost => ({ id: crypto.randomUUID(), description: "", amount: "" });

// ── Cost calculation ──────────────────────────────────────────────────────────
function calcRMCost(inputs: MfgInput[], rmList: { id: string; costPerUnit: string }[]): number {
  return inputs.reduce((sum, inp) => {
    const rm = rmList.find(r => r.id === inp.rmId);
    const cost = parseFloat(rm?.costPerUnit || "0");
    const qty  = parseFloat(inp.qtyUsed    || "0");
    return sum + cost * qty;
  }, 0);
}
function calcProdCost(costs: ProductionCost[]): number {
  return costs.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
}

// ── Form state type ───────────────────────────────────────────────────────────
type NewOrderForm = {
  orderDate:       string;
  status:          string;
  inputs:          MfgInput[];
  outputs:         MfgOutput[];
  productionCosts: ProductionCost[];
  wasteQty:        string;
  wasteUnit:       string;
  wasteNotes:      string;
  notes:           string;
};

function defaultForm(): NewOrderForm {
  return {
    orderDate:       format(new Date(), "yyyy-MM-dd"),
    status:          "Draft",
    inputs:          [blankInput()],
    outputs:         [blankOutput()],
    productionCosts: [],
    wasteQty:        "",
    wasteUnit:       "",
    wasteNotes:      "",
    notes:           "",
  };
}

// ── Detail tabs ───────────────────────────────────────────────────────────────
type Tab = "inputs" | "outputs" | "costs" | "waste";

export default function ManufacturingPage() {
  const { orders, add, remove, complete }     = useManufacturingOrders();
  const { rms }                               = useRawMaterials();
  const { isStaff, staffPermissions }         = useAuth();
  const { toast }                             = useToast();
  const sym                                   = getSettingsCurrencySymbol();
  const products                              = getProducts();
  const canEdit = !isStaff || staffPermissions.manufacturing !== "view";

  // ── New order sheet ───────────────────────────────────────────────────────
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm]       = useState<NewOrderForm>(defaultForm);

  const setF = (patch: Partial<NewOrderForm>) => setForm(f => ({ ...f, ...patch }));

  // inputs
  const addInput    = () => setF({ inputs: [...form.inputs, blankInput()] });
  const removeInput = (id: string) => setF({ inputs: form.inputs.filter(i => i.id !== id) });
  const updInput    = (id: string, p: Partial<MfgInput>) =>
    setF({ inputs: form.inputs.map(i => i.id === id ? { ...i, ...p } : i) });

  // outputs
  const addOutput    = () => setF({ outputs: [...form.outputs, blankOutput()] });
  const removeOutput = (id: string) => setF({ outputs: form.outputs.filter(o => o.id !== id) });
  const updOutput    = (id: string, p: Partial<MfgOutput>) =>
    setF({ outputs: form.outputs.map(o => o.id === id ? { ...o, ...p } : o) });

  // production costs
  const addCost    = () => setF({ productionCosts: [...form.productionCosts, blankCost()] });
  const removeCost = (id: string) => setF({ productionCosts: form.productionCosts.filter(c => c.id !== id) });
  const updCost    = (id: string, p: Partial<ProductionCost>) =>
    setF({ productionCosts: form.productionCosts.map(c => c.id === id ? { ...c, ...p } : c) });

  // ── Cost summary (live) ───────────────────────────────────────────────────
  const rmCost      = useMemo(() => calcRMCost(form.inputs, rms), [form.inputs, rms]);
  const prodCost    = useMemo(() => calcProdCost(form.productionCosts), [form.productionCosts]);
  const totalCost   = rmCost + prodCost;
  const totalOutQty = form.outputs.reduce((s, o) => s + (parseFloat(o.qty) || 0), 0);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const validOutputs = form.outputs.filter(o => o.productName.trim() && (parseFloat(o.qty) || 0) > 0);
    if (validOutputs.length === 0) {
      toast({ title: "Add at least one output product with a quantity", variant: "destructive" }); return;
    }
    add({
      orderDate:       form.orderDate,
      status:          form.status as ManufacturingOrder["status"],
      inputs:          form.inputs.filter(i => i.rmName.trim()),
      outputs:         validOutputs,
      productionCosts: form.productionCosts.filter(c => c.description.trim()),
      wasteQty:        form.wasteQty,
      wasteUnit:       form.wasteUnit,
      wasteNotes:      form.wasteNotes,
      notes:           form.notes,
    });
    toast({ title: "Manufacturing order created" });
    setNewOpen(false);
    setForm(defaultForm());
  }, [form, add, toast]);

  // ── Detail sheet ──────────────────────────────────────────────────────────
  const [viewId,   setViewId]   = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("inputs");
  const viewOrder = viewId ? orders.find(o => o.id === viewId) ?? null : null;

  const handleComplete = useCallback((id: string) => {
    try {
      complete(id);
      toast({ title: "Order completed — raw materials deducted, products added to stock" });
      setViewId(null);
    } catch (e: unknown) { toast({ title: (e as Error).message, variant: "destructive" }); }
  }, [complete, toast]);

  // ── Order cost helpers for grid/detail ───────────────────────────────────
  const orderTotalCost = (o: ManufacturingOrder) =>
    calcRMCost(o.inputs, rms) + calcProdCost(o.productionCosts || []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = {
    total:      orders.length,
    draft:      orders.filter(o => o.status === "Draft").length,
    inProgress: orders.filter(o => o.status === "In Progress").length,
    completed:  orders.filter(o => o.status === "Completed").length,
  };

  const lbl = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 block";

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Factory size={20} className="text-orange-600" /> Manufacturing Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Convert raw materials into finished products</p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
            onClick={() => { setForm(defaultForm()); setNewOpen(true); }}>
            <Plus size={14} /> New Order
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Orders",  value: stats.total,      color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30"   },
          { label: "Draft",         value: stats.draft,      color: "text-muted-foreground", bg: "bg-muted/40"                    },
          { label: "In Progress",   value: stats.inProgress, color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/30"      },
          { label: "Completed",     value: stats.completed,  color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-950/30"},
        ].map(c => (
          <div key={c.label} className={`rounded-lg border p-3 ${c.bg}`}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <ExcelGridShell cols={COLS} totalMinW={TOTAL_MIN_W} tableId="manufacturing">
        {orders.map((order, rowIdx) => {
          const tCost = orderTotalCost(order);
          const cells: Record<string, string> = {
            orderNumber: order.orderNumber,
            orderDate:   order.orderDate ? (() => { try { return format(new Date(order.orderDate), "d MMM yyyy"); } catch { return order.orderDate; } })() : "—",
            status:      order.status,
            _inputs:     `${order.inputs.length} mat.`,
            _outputs:    `${(order.outputs || []).length} prod.`,
            _cost:       tCost > 0 ? `${sym}${tCost.toFixed(2)}` : "—",
            notes:       order.notes || "—",
          };
          return (
            <tr key={order.id} style={{ height: CELL_H }}>
              <td className="border-r border-border text-center text-[11px] text-muted-foreground select-none" style={{ width: 48, minWidth: 48 }}>{rowIdx + 1}</td>
              {COLS.map(col => (
                <td key={col.field} style={{ minWidth: col.minW }} className="border-r border-border p-0">
                  {col.field === "status" ? (
                    <div className="px-2 flex items-center h-full">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${STATUS_BADGE[cells[col.field]] || "bg-muted text-muted-foreground"}`}>{cells[col.field]}</span>
                    </div>
                  ) : (
                    <div className="px-2 text-[13px] truncate h-full flex items-center">{cells[col.field]}</div>
                  )}
                </td>
              ))}
              <td className="text-center" style={{ width: 100, minWidth: 100 }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => { setViewId(order.id); setActiveTab("inputs"); }}
                    className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600" title="View">
                    <Eye size={13} />
                  </button>
                  {canEdit && (order.status === "Draft" || order.status === "In Progress") && (
                    <button onClick={() => handleComplete(order.id)}
                      className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600" title="Complete">
                      <CheckCircle2 size={13} />
                    </button>
                  )}
                  {canEdit && (order.status === "Draft" || order.status === "Cancelled") && (
                    <button onClick={() => setDeleteId(order.id)}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
        {orders.length === 0 && (
          <tr style={{ height: CELL_H }}>
            <td colSpan={COLS.length + 2} className="text-center text-[13px] text-muted-foreground py-8 italic">
              No manufacturing orders yet. Click "New Order" to get started.
            </td>
          </tr>
        )}
      </ExcelGridShell>

      {/* ════ New Order Bottom Sheet ════════════════════════════════════════════ */}
      <Sheet open={newOpen} onOpenChange={o => { if (!o) setNewOpen(false); }}>
        <SheetContent side="bottom" className="h-[94vh] rounded-t-2xl p-0 flex flex-col overflow-hidden">

          {/* Gradient header */}
          <div className="flex-none" style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)" }}>
            <div className="flex items-center justify-between px-6 py-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Factory size={18} className="text-white" />
                </div>
                <SheetTitle className="text-white text-lg font-bold">New Manufacturing Order</SheetTitle>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-white/15 rounded-lg px-3 py-1.5">
                  <span className="text-white/70 text-[11px] uppercase tracking-wide font-semibold">Date</span>
                  <Input type="date" value={form.orderDate}
                    onChange={e => setF({ orderDate: e.target.value })}
                    className="h-7 w-36 text-[13px] bg-white/20 border-0 text-white [color-scheme:dark] focus-visible:ring-0" />
                </div>
                <div className="flex items-center gap-2 bg-white/15 rounded-lg px-3 py-1.5">
                  <span className="text-white/70 text-[11px] uppercase tracking-wide font-semibold">Status</span>
                  <Select value={form.status} onValueChange={v => setF({ status: v })}>
                    <SelectTrigger className="h-7 w-32 text-[13px] bg-white/20 border-0 text-white focus:ring-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Draft", "In Progress"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                  onClick={() => setNewOpen(false)}>Cancel</Button>
                <Button size="sm" className="bg-white text-orange-600 hover:bg-white/90 font-bold" onClick={handleSave}>
                  Create Order
                </Button>
              </div>
            </div>
          </div>

          {/* Three-column body */}
          <div className="flex-1 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-3 h-full divide-y lg:divide-y-0 lg:divide-x divide-border overflow-y-auto lg:overflow-hidden">

              {/* ── Column 1: Raw Material Inputs ── */}
              <div className="p-5 flex flex-col gap-3 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FlaskConical size={15} className="text-emerald-600" />
                      <h2 className="text-[13px] font-bold">Raw Materials</h2>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 ml-5">Ingredients consumed</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 text-[12px] h-7" onClick={addInput}>
                    <Plus size={11} /> Add
                  </Button>
                </div>

                <div className="border rounded-xl overflow-hidden flex-1">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-emerald-50 dark:bg-emerald-950/20">
                        <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 border-b">Material</th>
                        <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 border-b w-24">Unit</th>
                        <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 border-b w-24">Qty Used</th>
                        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 border-b w-20 text-right">Cost</th>
                        <th className="w-8 border-b" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.inputs.map((inp, idx) => {
                        const rm = rms.find(r => r.id === inp.rmId);
                        const lineCost = (parseFloat(rm?.costPerUnit || "0") * (parseFloat(inp.qtyUsed) || 0));
                        return (
                          <tr key={inp.id} className={`border-b last:border-0 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                            <td className="px-2 py-1.5">
                              {rms.length > 0 ? (
                                <Select value={inp.rmId || ""} onValueChange={v => {
                                  const r = rms.find(x => x.id === v);
                                  if (r) updInput(inp.id, { rmId: r.id, rmName: r.name, unit: r.unit });
                                }}>
                                  <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Select…" /></SelectTrigger>
                                  <SelectContent>
                                    {rms.map(r => (
                                      <SelectItem key={r.id} value={r.id}>
                                        <span className="font-medium">{r.name}</span>
                                        <span className="text-muted-foreground ml-1.5 text-[11px]">({r.rmCode}) {r.currentStock} {r.unit}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input value={inp.rmName} onChange={e => updInput(inp.id, { rmName: e.target.value })}
                                  placeholder="Material name" className="h-8 text-[12px]" />
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <Input value={inp.unit} onChange={e => updInput(inp.id, { unit: e.target.value })}
                                placeholder="kg" className="h-8 text-[12px]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input type="number" min="0" value={inp.qtyUsed}
                                onChange={e => updInput(inp.id, { qtyUsed: e.target.value })}
                                placeholder="0" className="h-8 text-[12px]" />
                            </td>
                            <td className="px-2 py-1.5 text-right text-[11px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              {lineCost > 0 ? `${sym}${lineCost.toFixed(2)}` : "—"}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              {form.inputs.length > 1 && (
                                <button onClick={() => removeInput(inp.id)} className="text-red-400 hover:text-red-600 p-0.5">
                                  <XCircle size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50/60 dark:bg-emerald-950/10">
                        <td colSpan={3} className="px-3 py-2 text-[11px] text-muted-foreground">
                          {form.inputs.filter(i => i.rmName).length} material(s)
                        </td>
                        <td className="px-2 py-2 text-right text-[12px] font-bold text-emerald-700 dark:text-emerald-400">
                          {sym}{rmCost.toFixed(2)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Waste */}
                <div className="border rounded-xl p-3 space-y-2 bg-amber-50/50 dark:bg-amber-950/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={13} className="text-amber-600" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">Waste / Loss</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className={lbl}>Waste Qty</Label>
                      <Input type="number" min="0" value={form.wasteQty}
                        onChange={e => setF({ wasteQty: e.target.value })} placeholder="0" className="h-8 text-[12px]" />
                    </div>
                    <div>
                      <Label className={lbl}>Unit</Label>
                      <Input value={form.wasteUnit}
                        onChange={e => setF({ wasteUnit: e.target.value })} placeholder="kg, L…" className="h-8 text-[12px]" />
                    </div>
                  </div>
                  <div>
                    <Label className={lbl}>Waste Notes</Label>
                    <Input value={form.wasteNotes} onChange={e => setF({ wasteNotes: e.target.value })}
                      placeholder="Trimming, spoilage, evaporation…" className="h-8 text-[12px]" />
                  </div>
                </div>
              </div>

              {/* ── Column 2: Multiple Outputs ── */}
              <div className="p-5 flex flex-col gap-3 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package size={15} className="text-orange-600" />
                      <h2 className="text-[13px] font-bold">Output Products</h2>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 ml-5">Products produced from this batch</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 text-[12px] h-7" onClick={addOutput}>
                    <Plus size={11} /> Add
                  </Button>
                </div>

                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-orange-50 dark:bg-orange-950/20">
                        <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400 border-b">Product</th>
                        <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400 border-b w-24">Qty</th>
                        <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400 border-b w-24">Unit</th>
                        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400 border-b w-24 text-right">Cost/Unit</th>
                        <th className="w-8 border-b" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.outputs.map((out, idx) => {
                        const outQty  = parseFloat(out.qty) || 0;
                        const share   = totalOutQty > 0 ? outQty / totalOutQty : 0;
                        const outCost = totalCost * share;
                        const unitCost = outQty > 0 ? outCost / outQty : 0;
                        return (
                          <tr key={out.id} className={`border-b last:border-0 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                            <td className="px-2 py-1.5">
                              {products.length > 0 ? (
                                <Select value={out.productId || ""} onValueChange={v => {
                                  const p = products.find(x => x.id === v);
                                  if (p) updOutput(out.id, { productId: p.id, productName: p.name, unit: p.unit });
                                  else   updOutput(out.id, { productId: v });
                                }}>
                                  <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Select product…" /></SelectTrigger>
                                  <SelectContent>
                                    {products.map(p => (
                                      <SelectItem key={p.id} value={p.id}>
                                        <span className="font-medium">{p.name}</span>
                                        <span className="text-muted-foreground ml-1.5 text-[11px]">{p.sku}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input value={out.productName} onChange={e => updOutput(out.id, { productName: e.target.value })}
                                  placeholder="Product name" className="h-8 text-[12px]" />
                              )}
                              {out.productName && products.find(p => p.id === out.productId) === undefined && out.productId && (
                                <Input value={out.productName} onChange={e => updOutput(out.id, { productName: e.target.value })}
                                  placeholder="Name" className="h-7 text-[11px] mt-1" />
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <Input type="number" min="0" value={out.qty}
                                onChange={e => updOutput(out.id, { qty: e.target.value })}
                                placeholder="0" className="h-8 text-[12px]" />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input value={out.unit} onChange={e => updOutput(out.id, { unit: e.target.value })}
                                placeholder="pcs, kg…" className="h-8 text-[12px]" />
                            </td>
                            <td className="px-2 py-1.5 text-right text-[11px] font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap">
                              {unitCost > 0 ? `${sym}${unitCost.toFixed(3)}` : "—"}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              {form.outputs.length > 1 && (
                                <button onClick={() => removeOutput(out.id)} className="text-red-400 hover:text-red-600 p-0.5">
                                  <XCircle size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-orange-50/60 dark:bg-orange-950/10">
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">
                          {form.outputs.filter(o => o.productName).length} product(s)
                        </td>
                        <td className="px-2 py-2 text-[12px] font-bold text-orange-700 dark:text-orange-400">
                          {totalOutQty > 0 ? totalOutQty : "—"}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Notes */}
                <div>
                  <Label className={lbl}>Batch Notes</Label>
                  <Textarea value={form.notes} onChange={e => setF({ notes: e.target.value })}
                    rows={3} placeholder="Batch reference, special instructions, QC notes…" className="text-[12px] resize-none" />
                </div>
              </div>

              {/* ── Column 3: Production Costs + Summary ── */}
              <div className="p-5 flex flex-col gap-4 overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <DollarSign size={15} className="text-violet-600" />
                        <h2 className="text-[13px] font-bold">Production Costs</h2>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 ml-5">Labour, utilities, machine hire…</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1 text-[12px] h-7" onClick={addCost}>
                      <Plus size={11} /> Add
                    </Button>
                  </div>

                  {form.productionCosts.length === 0 ? (
                    <div className="border-2 border-dashed rounded-xl p-4 text-center text-[12px] text-muted-foreground">
                      No additional costs yet.<br />Click "Add" to record labour, electricity, etc.
                    </div>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-violet-50 dark:bg-violet-950/20">
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400 border-b">Description</th>
                            <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400 border-b w-28">Amount</th>
                            <th className="w-8 border-b" />
                          </tr>
                        </thead>
                        <tbody>
                          {form.productionCosts.map((c, idx) => (
                            <tr key={c.id} className={`border-b last:border-0 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                              <td className="px-2 py-1.5">
                                <Input value={c.description} onChange={e => updCost(c.id, { description: e.target.value })}
                                  placeholder="e.g. Labour, Electricity…" className="h-8 text-[12px]" />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input type="number" min="0" value={c.amount}
                                  onChange={e => updCost(c.id, { amount: e.target.value })}
                                  placeholder="0.00" className="h-8 text-[12px] text-right" />
                              </td>
                              <td className="px-1 py-1.5 text-center">
                                <button onClick={() => removeCost(c.id)} className="text-red-400 hover:text-red-600 p-0.5">
                                  <XCircle size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-violet-50/60 dark:bg-violet-950/10">
                            <td className="px-3 py-2 text-[11px] text-muted-foreground">Subtotal</td>
                            <td className="px-2 py-2 text-right text-[12px] font-bold text-violet-700 dark:text-violet-400">
                              {sym}{prodCost.toFixed(2)}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* Cost Summary Card */}
                <div className="rounded-xl border-2 border-orange-200 dark:border-orange-800 overflow-hidden">
                  <div className="px-4 py-3" style={{ background: "linear-gradient(135deg,#ea580c20,#f59e0b20)" }}>
                    <h3 className="text-[12px] font-bold text-orange-700 dark:text-orange-400">Cost Summary</h3>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {[
                      { label: "Raw Material Cost",  value: rmCost,   color: "text-emerald-700 dark:text-emerald-400" },
                      { label: "Production Costs",   value: prodCost, color: "text-violet-700 dark:text-violet-400"  },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between items-center text-[13px]">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className={`font-semibold ${r.color}`}>{sym}{r.value.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t pt-2 flex justify-between items-center">
                      <span className="text-[13px] font-bold">Total Cost</span>
                      <span className="text-[15px] font-bold text-orange-600">{sym}{totalCost.toFixed(2)}</span>
                    </div>
                    {totalOutQty > 0 && totalCost > 0 && (
                      <div className="flex justify-between items-center text-[12px] bg-orange-50 dark:bg-orange-950/20 rounded-lg px-3 py-2 mt-1">
                        <span className="text-muted-foreground">Avg. Cost / Unit</span>
                        <span className="font-bold text-orange-600">{sym}{(totalCost / totalOutQty).toFixed(3)}</span>
                      </div>
                    )}
                    {(parseFloat(form.wasteQty) || 0) > 0 && (
                      <div className="flex justify-between items-center text-[12px] bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">
                        <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle size={11} /> Waste
                        </span>
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          {form.wasteQty} {form.wasteUnit}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ════ Detail Sheet ═══════════════════════════════════════════════════════ */}
      <Sheet open={!!viewId} onOpenChange={o => { if (!o) setViewId(null); }}>
        <SheetContent side="right" className="w-full sm:w-[580px] overflow-y-auto p-0 flex flex-col">
          {viewOrder && (() => {
            const vRMCost   = calcRMCost(viewOrder.inputs, rms);
            const vProdCost = calcProdCost(viewOrder.productionCosts || []);
            const vTotal    = vRMCost + vProdCost;
            const vOutQty   = (viewOrder.outputs || []).reduce((s, o) => s + (parseFloat(o.qty) || 0), 0);

            return (
              <>
                {/* Header */}
                <div className="flex-none" style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)" }}>
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                        <Factory size={18} className="text-white" />
                      </div>
                      <div>
                        <SheetTitle className="text-white text-base font-bold">{viewOrder.orderNumber}</SheetTitle>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_BADGE[viewOrder.status] || "bg-white/20 text-white"}`}>{viewOrder.status}</span>
                          <span className="text-white/70 text-[11px]">
                            {viewOrder.orderDate ? (() => { try { return format(new Date(viewOrder.orderDate), "d MMM yyyy"); } catch { return viewOrder.orderDate; } })() : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Cost pills */}
                    <div className="flex gap-2 flex-wrap mt-2">
                      {[
                        { label: "RM Cost", val: `${sym}${vRMCost.toFixed(2)}` },
                        { label: "Prod. Cost", val: `${sym}${vProdCost.toFixed(2)}` },
                        { label: "Total", val: `${sym}${vTotal.toFixed(2)}` },
                      ].map(p => (
                        <div key={p.label} className="bg-white/15 rounded-lg px-2.5 py-1 text-white text-[11px]">
                          <span className="opacity-70">{p.label}: </span><span className="font-bold">{p.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tab bar */}
                  <div className="flex border-t border-white/20">
                    {([
                      ["inputs",  `Inputs (${viewOrder.inputs.length})`],
                      ["outputs", `Outputs (${(viewOrder.outputs||[]).length})`],
                      ["costs",   `Costs (${(viewOrder.productionCosts||[]).length})`],
                      ["waste",   "Waste"],
                    ] as [Tab, string][]).map(([t, label]) => (
                      <button key={t} onClick={() => setActiveTab(t)}
                        className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${
                          activeTab === t ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80 hover:bg-white/10"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action bar */}
                {canEdit && (viewOrder.status === "Draft" || viewOrder.status === "In Progress") && (
                  <div className="flex-none px-5 py-3 border-b bg-muted/30">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-[13px]"
                      onClick={() => handleComplete(viewOrder.id)}>
                      <CheckCircle2 size={14} /> Complete Order — Deduct Materials & Add to Stock
                    </Button>
                  </div>
                )}

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-5">

                  {/* Inputs tab */}
                  {activeTab === "inputs" && (
                    <div className="space-y-3">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Raw Materials Consumed</h3>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="bg-emerald-50 dark:bg-emerald-950/20">
                              {["Material", "Unit", "Qty Used", "Line Cost"].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 border-b">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {viewOrder.inputs.map((inp, i) => {
                              const rm = rms.find(r => r.id === inp.rmId);
                              const lc = (parseFloat(rm?.costPerUnit || "0")) * (parseFloat(inp.qtyUsed) || 0);
                              return (
                                <tr key={inp.id} className={`border-b last:border-0 ${i % 2 !== 0 ? "bg-muted/20" : ""}`}>
                                  <td className="px-3 py-2 font-medium">{inp.rmName || "—"}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{inp.unit || "—"}</td>
                                  <td className="px-3 py-2 font-semibold">{inp.qtyUsed}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                                    {lc > 0 ? `${sym}${lc.toFixed(2)}` : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-emerald-50/60 dark:bg-emerald-950/10 border-t-2">
                              <td colSpan={3} className="px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase">Total RM Cost</td>
                              <td className="px-3 py-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{sym}{vRMCost.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Outputs tab */}
                  {activeTab === "outputs" && (
                    <div className="space-y-3">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Products Produced</h3>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="bg-orange-50 dark:bg-orange-950/20">
                              {["Product", "Qty", "Unit", "Est. Cost", "Cost/Unit"].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase text-orange-700 dark:text-orange-400 border-b">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(viewOrder.outputs || []).map((out, i) => {
                              const qty = parseFloat(out.qty) || 0;
                              const share = vOutQty > 0 ? qty / vOutQty : 0;
                              const estCost = vTotal * share;
                              const unitCost = qty > 0 ? estCost / qty : 0;
                              return (
                                <tr key={out.id} className={`border-b last:border-0 ${i % 2 !== 0 ? "bg-muted/20" : ""}`}>
                                  <td className="px-3 py-2 font-medium">{out.productName || "—"}</td>
                                  <td className="px-3 py-2 font-semibold">{out.qty}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{out.unit || "—"}</td>
                                  <td className="px-3 py-2 text-right text-orange-700 dark:text-orange-400">{estCost > 0 ? `${sym}${estCost.toFixed(2)}` : "—"}</td>
                                  <td className="px-3 py-2 text-right font-bold text-orange-700 dark:text-orange-400">{unitCost > 0 ? `${sym}${unitCost.toFixed(3)}` : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-orange-50/60 dark:bg-orange-950/10 border-t-2">
                              <td colSpan={3} className="px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase">Grand Total</td>
                              <td className="px-3 py-2 text-right font-bold text-orange-600">{sym}{vTotal.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-bold text-orange-600">
                                {vOutQty > 0 ? `${sym}${(vTotal / vOutQty).toFixed(3)}/unit` : "—"}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {viewOrder.status === "Completed" && (
                        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-[12px] text-emerald-700 dark:text-emerald-400 font-medium">
                          ✓ All products have been added to stock.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Costs tab */}
                  {activeTab === "costs" && (
                    <div className="space-y-3">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Production Costs</h3>
                      {(viewOrder.productionCosts || []).length === 0 ? (
                        <p className="text-[13px] text-muted-foreground italic">No additional production costs recorded.</p>
                      ) : (
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="bg-violet-50 dark:bg-violet-950/20">
                                {["Description", "Amount"].map(h => (
                                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase text-violet-700 dark:text-violet-400 border-b">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(viewOrder.productionCosts || []).map((c, i) => (
                                <tr key={c.id} className={`border-b last:border-0 ${i % 2 !== 0 ? "bg-muted/20" : ""}`}>
                                  <td className="px-3 py-2">{c.description}</td>
                                  <td className="px-3 py-2 text-right font-semibold">{sym}{parseFloat(c.amount || "0").toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-violet-50/60 dark:bg-violet-950/10 border-t-2">
                                <td className="px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase">Total</td>
                                <td className="px-3 py-2 text-right font-bold text-violet-700 dark:text-violet-400">{sym}{vProdCost.toFixed(2)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                      {/* Cost breakdown */}
                      <div className="rounded-xl border p-4 space-y-2">
                        <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Full Cost Breakdown</h4>
                        {[
                          { label: "Raw Materials", val: vRMCost,   c: "text-emerald-600" },
                          { label: "Production",    val: vProdCost, c: "text-violet-600"  },
                        ].map(r => (
                          <div key={r.label} className="flex justify-between text-[13px]">
                            <span className="text-muted-foreground">{r.label}</span>
                            <span className={`font-semibold ${r.c}`}>{sym}{r.val.toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="border-t pt-2 flex justify-between text-[14px] font-bold">
                          <span>Total Cost</span>
                          <span className="text-orange-600">{sym}{vTotal.toFixed(2)}</span>
                        </div>
                        {vOutQty > 0 && vTotal > 0 && (
                          <div className="flex justify-between text-[12px] bg-orange-50 dark:bg-orange-950/20 rounded-lg px-3 py-2">
                            <span className="text-muted-foreground">Avg. Cost / Unit</span>
                            <span className="font-bold text-orange-600">{sym}{(vTotal / vOutQty).toFixed(3)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Waste tab */}
                  {activeTab === "waste" && (
                    <div className="space-y-3">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Waste & Loss</h3>
                      {(!viewOrder.wasteQty || viewOrder.wasteQty === "0" || viewOrder.wasteQty === "") ? (
                        <p className="text-[13px] text-muted-foreground italic">No waste recorded for this order.</p>
                      ) : (
                        <div className="rounded-xl border p-4 bg-amber-50/50 dark:bg-amber-950/10 space-y-3">
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-600" />
                            <span className="text-[13px] font-bold text-amber-700 dark:text-amber-400">Waste Recorded</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white dark:bg-card rounded-lg border p-3">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Waste Qty</div>
                              <div className="text-lg font-bold text-amber-600">{viewOrder.wasteQty} {viewOrder.wasteUnit}</div>
                            </div>
                          </div>
                          {viewOrder.wasteNotes && (
                            <div className="text-[13px] text-muted-foreground bg-white dark:bg-card rounded-lg border p-3">
                              {viewOrder.wasteNotes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {viewOrder.notes && (
                  <div className="flex-none px-5 pb-4">
                    <div className="rounded-lg border p-3 bg-muted/20 text-[12px] text-muted-foreground">{viewOrder.notes}</div>
                  </div>
                )}
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Manufacturing Order?</AlertDialogTitle>
            <AlertDialogDescription>Only Draft or Cancelled orders can be deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => { if (deleteId) { remove(deleteId); setDeleteId(null); toast({ title: "Order deleted" }); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
