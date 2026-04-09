import { useState, useCallback } from "react";
import { format } from "date-fns";
import { Factory, Eye, Trash2, Plus, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useManufacturingOrders, useRawMaterials } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { getProducts } from "@/lib/store";
import { MFG_STATUSES, MfgInput, ManufacturingOrder } from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { ExcelGridShell, ColDef, CELL_H } from "@/components/editable-cell";

// ── Columns ───────────────────────────────────────────────────────────────────
const COLS: ColDef[] = [
  { field: "orderNumber",       label: "Order #",  minW: 100, type: "text"   },
  { field: "orderDate",         label: "Date",     minW: 110, type: "date"   },
  { field: "status",            label: "Status",   minW: 110, type: "select", options: [...MFG_STATUSES] },
  { field: "outputProductName", label: "Output Product", minW: 180, type: "text" },
  { field: "outputQty",         label: "Output Qty",     minW: 90,  type: "number" },
  { field: "outputUnit",        label: "Unit",           minW: 80,  type: "text" },
  { field: "notes",             label: "Notes",          minW: 180, type: "text" },
];
const TOTAL_MIN_W = COLS.reduce((s, c) => s + c.minW, 0) + 48 + 100;

function blankInput(): MfgInput {
  return { id: crypto.randomUUID(), rmId: "", rmName: "", unit: "", qtyUsed: "" };
}

const STATUS_BADGE: Record<string, string> = {
  "Draft":       "bg-muted text-muted-foreground",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  "Completed":   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  "Cancelled":   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

// ── New Order Form state ───────────────────────────────────────────────────────
type NewOrderForm = {
  orderDate:         string;
  status:            string;
  inputs:            MfgInput[];
  outputProductId:   string;
  outputProductName: string;
  outputQty:         string;
  outputUnit:        string;
  notes:             string;
};

export default function ManufacturingPage() {
  const { orders, add, remove, complete } = useManufacturingOrders();
  const { rms }                           = useRawMaterials();
  const { isStaff, staffPermissions }     = useAuth();
  const { toast }                         = useToast();
  const sym = getSettingsCurrencySymbol();

  const canEdit = !isStaff || staffPermissions.manufacturing !== "view";

  const products = getProducts();

  // ── New Order sheet ───────────────────────────────────────────────────────
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState<NewOrderForm>(() => ({
    orderDate: format(new Date(), "yyyy-MM-dd"),
    status: "Draft",
    inputs: [blankInput()],
    outputProductId: "",
    outputProductName: "",
    outputQty: "",
    outputUnit: "",
    notes: "",
  }));

  const resetForm = () => setForm({
    orderDate: format(new Date(), "yyyy-MM-dd"),
    status: "Draft",
    inputs: [blankInput()],
    outputProductId: "", outputProductName: "", outputQty: "", outputUnit: "", notes: "",
  });

  const addInput = () => setForm(f => ({ ...f, inputs: [...f.inputs, blankInput()] }));
  const removeInput = (id: string) => setForm(f => ({ ...f, inputs: f.inputs.filter(i => i.id !== id) }));
  const updateInput = (id: string, patch: Partial<MfgInput>) =>
    setForm(f => ({ ...f, inputs: f.inputs.map(i => i.id === id ? { ...i, ...patch } : i) }));

  const handleSave = useCallback(() => {
    if (!form.outputProductName.trim()) {
      toast({ title: "Please enter an output product name", variant: "destructive" }); return;
    }
    if (!form.outputQty || parseFloat(form.outputQty) <= 0) {
      toast({ title: "Please enter a valid output quantity", variant: "destructive" }); return;
    }
    add({
      orderDate:         form.orderDate,
      status:            form.status as ManufacturingOrder["status"],
      inputs:            form.inputs.filter(i => i.rmName.trim()),
      outputProductId:   form.outputProductId,
      outputProductName: form.outputProductName.trim(),
      outputQty:         form.outputQty,
      outputUnit:        form.outputUnit,
      notes:             form.notes,
    });
    toast({ title: "Manufacturing order created" });
    setNewOpen(false);
    resetForm();
  }, [form, add, toast]);

  // ── Detail sheet ──────────────────────────────────────────────────────────
  const [viewId,    setViewId]    = useState<string | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const viewOrder = viewId ? orders.find(o => o.id === viewId) ?? null : null;

  const handleComplete = useCallback((id: string) => {
    try {
      complete(id);
      toast({ title: "Order completed — raw materials deducted, stock updated" });
      setViewId(null);
    } catch (e: unknown) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  }, [complete, toast]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = {
    total:      orders.length,
    draft:      orders.filter(o => o.status === "Draft").length,
    inProgress: orders.filter(o => o.status === "In Progress").length,
    completed:  orders.filter(o => o.status === "Completed").length,
  };

  const lbl = "text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block";

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
            onClick={() => { resetForm(); setNewOpen(true); }}>
            <Plus size={14} /> New Order
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Orders",  value: stats.total,      color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30"   },
          { label: "Draft",         value: stats.draft,      color: "text-muted-foreground", bg: "bg-muted/40"                     },
          { label: "In Progress",   value: stats.inProgress, color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/30"       },
          { label: "Completed",     value: stats.completed,  color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-950/30" },
        ].map(c => (
          <div key={c.label} className={`rounded-lg border p-3 ${c.bg}`}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <ExcelGridShell cols={COLS} totalMinW={TOTAL_MIN_W} tableId="manufacturing">
        {orders.map((order, rowIdx) => (
          <tr key={order.id} style={{ height: CELL_H }}>
            <td className="border-r border-border text-center text-[11px] text-muted-foreground select-none" style={{ width: 48, minWidth: 48 }}>
              {rowIdx + 1}
            </td>
            {COLS.map(col => {
              const raw = (order as Record<string, unknown>)[col.field];
              const val = col.field === "orderDate" && raw
                ? (() => { try { return format(new Date(raw as string), "d MMM yyyy"); } catch { return String(raw); } })()
                : col.field === "status"
                ? raw as string
                : String(raw ?? "");
              return (
                <td key={col.field} style={{ minWidth: col.minW }} className="border-r border-border p-0">
                  {col.field === "status" ? (
                    <div className="px-2 py-1 flex items-center h-full">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${STATUS_BADGE[val] || "bg-muted text-muted-foreground"}`}>{val}</span>
                    </div>
                  ) : (
                    <div className="px-2 py-1 text-[13px] truncate h-full flex items-center">{val || "—"}</div>
                  )}
                </td>
              );
            })}
            <td className="text-center" style={{ width: 100, minWidth: 100 }}>
              <div className="flex items-center justify-center gap-1">
                <button onClick={() => setViewId(order.id)}
                  className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 transition-colors" title="View Details">
                  <Eye size={13} />
                </button>
                {canEdit && (order.status === "Draft" || order.status === "In Progress") && (
                  <button onClick={() => handleComplete(order.id)}
                    className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 transition-colors" title="Mark Complete">
                    <CheckCircle2 size={13} />
                  </button>
                )}
                {canEdit && (order.status === "Draft" || order.status === "Cancelled") && (
                  <button onClick={() => setDeleteId(order.id)}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors" title="Delete">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
        {orders.length === 0 && (
          <tr style={{ height: CELL_H }}>
            <td colSpan={COLS.length + 2} className="text-center text-[13px] text-muted-foreground py-8 italic">
              No manufacturing orders yet. Click "New Order" to get started.
            </td>
          </tr>
        )}
      </ExcelGridShell>

      {/* ── New Order Sheet ───────────────────────────────────────────────────── */}
      <Sheet open={newOpen} onOpenChange={o => { if (!o) setNewOpen(false); }}>
        <SheetContent side="right" className="w-full sm:w-[520px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <div className="h-16 rounded-xl flex items-center gap-4 px-5"
              style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)" }}>
              <Factory size={20} className="text-white" />
              <SheetTitle className="text-white text-base font-bold">New Manufacturing Order</SheetTitle>
            </div>
          </SheetHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={lbl}>Order Date</Label>
                <Input type="date" value={form.orderDate}
                  onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} className="text-[13px]" />
              </div>
              <div>
                <Label className={lbl}>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Draft", "In Progress"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Raw Material Inputs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className={lbl}>Raw Materials (Inputs)</Label>
                <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={addInput}>
                  <Plus size={10} /> Add Row
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-muted/50">
                      {["Raw Material", "Unit", "Qty Used", ""].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.inputs.map(inp => (
                      <tr key={inp.id} className="border-b last:border-0">
                        <td className="px-1 py-1">
                          {rms.length > 0 ? (
                            <Select value={inp.rmId || ""} onValueChange={v => {
                              const rm = rms.find(r => r.id === v);
                              if (rm) updateInput(inp.id, { rmId: rm.id, rmName: rm.name, unit: rm.unit });
                            }}>
                              <SelectTrigger className="h-7 text-[12px] border-0 focus:ring-0"><SelectValue placeholder="Select RM" /></SelectTrigger>
                              <SelectContent>
                                {rms.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.rmCode}) — Stock: {r.currentStock} {r.unit}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input placeholder="Raw material name" value={inp.rmName}
                              onChange={e => updateInput(inp.id, { rmName: e.target.value })}
                              className="h-7 text-[12px] border-0" />
                          )}
                        </td>
                        <td className="px-1 py-1 w-20">
                          <Input value={inp.unit} onChange={e => updateInput(inp.id, { unit: e.target.value })}
                            placeholder="unit" className="h-7 text-[12px] border-0" />
                        </td>
                        <td className="px-1 py-1 w-24">
                          <Input type="number" min="0" value={inp.qtyUsed} onChange={e => updateInput(inp.id, { qtyUsed: e.target.value })}
                            placeholder="0" className="h-7 text-[12px] border-0" />
                        </td>
                        <td className="px-1 py-1 w-8">
                          {form.inputs.length > 1 && (
                            <button onClick={() => removeInput(inp.id)} className="text-red-400 hover:text-red-600">
                              <XCircle size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Output */}
            <div className="border rounded-xl p-3 space-y-3 bg-orange-50/50 dark:bg-orange-950/10">
              <Label className={lbl + " text-orange-700 dark:text-orange-400"}>Output (Finished Product)</Label>
              <div>
                <Label className={lbl}>Product</Label>
                {products.length > 0 ? (
                  <Select value={form.outputProductId || ""} onValueChange={v => {
                    const p = products.find(p => p.id === v);
                    if (p) setForm(f => ({ ...f, outputProductId: p.id, outputProductName: p.name, outputUnit: p.unit }));
                    else    setForm(f => ({ ...f, outputProductId: v,   outputProductName: "" }));
                  }}>
                    <SelectTrigger className="text-[13px]"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.outputProductName}
                    onChange={e => setForm(f => ({ ...f, outputProductName: e.target.value }))}
                    placeholder="Product name" className="text-[13px]" />
                )}
              </div>
              {products.length > 0 && form.outputProductId && !form.outputProductName && (
                <div>
                  <Label className={lbl}>Product Name</Label>
                  <Input value={form.outputProductName}
                    onChange={e => setForm(f => ({ ...f, outputProductName: e.target.value }))}
                    placeholder="Product name" className="text-[13px]" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className={lbl}>Output Quantity</Label>
                  <Input type="number" min="0" value={form.outputQty}
                    onChange={e => setForm(f => ({ ...f, outputQty: e.target.value }))}
                    placeholder="0" className="text-[13px]" />
                </div>
                <div>
                  <Label className={lbl}>Unit</Label>
                  <Input value={form.outputUnit}
                    onChange={e => setForm(f => ({ ...f, outputUnit: e.target.value }))}
                    placeholder="pcs, kg, box..." className="text-[13px]" />
                </div>
              </div>
            </div>

            <div>
              <Label className={lbl}>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Optional notes..." className="text-[13px]" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button className="flex-1 bg-orange-600 hover:bg-orange-700 text-white" onClick={handleSave}>
                Create Order
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Detail Sheet ──────────────────────────────────────────────────────── */}
      <Sheet open={!!viewId} onOpenChange={o => { if (!o) setViewId(null); }}>
        <SheetContent side="right" className="w-full sm:w-[520px] overflow-y-auto">
          {viewOrder && (
            <>
              <SheetHeader className="pb-4">
                <div className="h-20 rounded-xl flex items-center gap-4 px-5"
                  style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)" }}>
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Factory size={20} className="text-white" />
                  </div>
                  <div>
                    <SheetTitle className="text-white text-base font-bold">{viewOrder.orderNumber}</SheetTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_BADGE[viewOrder.status] || "bg-white/20 text-white"}`}>
                        {viewOrder.status}
                      </span>
                      <span className="text-white/70 text-[11px]">
                        {viewOrder.orderDate ? (() => { try { return format(new Date(viewOrder.orderDate), "d MMM yyyy"); } catch { return viewOrder.orderDate; } })() : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              {/* Action buttons */}
              {canEdit && (viewOrder.status === "Draft" || viewOrder.status === "In Progress") && (
                <div className="flex gap-2 mb-4">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-[13px]"
                    onClick={() => handleComplete(viewOrder.id)}>
                    <CheckCircle2 size={14} /> Complete Order
                  </Button>
                </div>
              )}

              {/* Inputs table */}
              <div className="mb-4">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Raw Materials Consumed ({viewOrder.inputs.length})
                </h3>
                {viewOrder.inputs.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground italic">No raw material inputs recorded.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-muted/50">
                          {["Raw Material", "Unit", "Qty Used"].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {viewOrder.inputs.map((inp, i) => (
                          <tr key={inp.id} className={`border-b last:border-0 ${i % 2 !== 0 ? "bg-muted/20" : ""}`}>
                            <td className="px-3 py-2 font-medium">{inp.rmName || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{inp.unit || "—"}</td>
                            <td className="px-3 py-2 font-semibold">{inp.qtyUsed || "0"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Output */}
              <div className="rounded-xl border p-4 bg-orange-50/50 dark:bg-orange-950/10 mb-4">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400 mb-3">
                  Output Product
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Product",  value: viewOrder.outputProductName || "—" },
                    { label: "Quantity", value: `${viewOrder.outputQty || "0"} ${viewOrder.outputUnit || ""}` },
                  ].map(c => (
                    <div key={c.label} className="bg-white dark:bg-card rounded-lg border p-2.5">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">{c.label}</div>
                      <div className="text-[13px] font-semibold">{c.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {viewOrder.notes && (
                <div className="rounded-lg border p-3 bg-muted/20 text-[13px] text-muted-foreground">
                  {viewOrder.notes}
                </div>
              )}

              {viewOrder.status === "Completed" && (
                <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-[12px] text-emerald-700 dark:text-emerald-400 font-medium">
                  ✓ Completed — raw materials deducted and output added to product stock.
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Manufacturing Order?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this order. Only Draft or Cancelled orders can be deleted.</AlertDialogDescription>
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
