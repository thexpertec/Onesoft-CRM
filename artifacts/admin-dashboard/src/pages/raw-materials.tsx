import { useState, useCallback, useMemo } from "react";
import { FlaskConical, Eye, Trash2, Plus, Minus, Package, RefreshCw, History, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRawMaterials, useUnits } from "@/hooks/use-data";
import { getEntityLedger, LEDGER_TX_LABELS } from "@/lib/store";
import { useAuth } from "@/contexts/auth-context";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_BG } from "@/components/editable-cell";

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef[] = [
  { field: "rmCode",       label: "Code",       minW: 90,  type: "text"   },
  { field: "name",         label: "Name",       minW: 180, type: "text"   },
  { field: "unit",         label: "Unit",       minW: 80,  type: "text"   },
  { field: "currentStock", label: "Stock Qty",  minW: 100, type: "number" },
  { field: "costPerUnit",  label: "Cost/Unit",  minW: 100, type: "number" },
  { field: "notes",        label: "Notes",      minW: 200, type: "text"   },
];
const TOTAL_MIN_W = COLS.reduce((s, c) => s + c.minW, 0) + 48 + 80;

type RM = ReturnType<typeof import("@/hooks/use-data").useRawMaterials>["rms"][0];

const blankRow = (): Partial<RM> => ({
  name: "", unit: "", currentStock: "0", costPerUnit: "0", notes: "",
});

export default function RawMaterialsPage() {
  const { rms, add, edit, remove } = useRawMaterials();
  const { units } = useUnits();
  const { isStaff, staffPermissions } = useAuth();
  const { toast } = useToast();
  const sym = getSettingsCurrencySymbol();

  const canEdit = !isStaff || staffPermissions.manufacturing !== "view";

  // Unit column — dropdown sourced from Settings → Units. Falls back to free
  // text only when no units are defined yet, so legacy installs keep working.
  const unitOptions = useMemo(
    () => Array.from(new Set(units.map(u => (u.symbol || u.name || "").trim()).filter(Boolean))),
    [units],
  );
  const cols: ColDef[] = useMemo(
    () => COLS.map(c =>
      c.field === "unit" && unitOptions.length > 0
        ? { ...c, type: "select", options: unitOptions }
        : c,
    ),
    [unitOptions],
  );

  // ── New row state ─────────────────────────────────────────────────────────
  const [newRow,    setNewRow]    = useState<Partial<RM> | null>(null);
  const [activeKey, setActiveKey] = useState<string>("");

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [ledgerId, setLedgerId]   = useState<string | null>(null);

  // ── Detail / Adjust sheet ─────────────────────────────────────────────────
  const [viewId,      setViewId]      = useState<string | null>(null);
  const viewRM = viewId ? rms.find(r => r.id === viewId) ?? null : null;

  // ── Commit new row ────────────────────────────────────────────────────────
  const commitNew = useCallback(() => {
    if (!newRow?.name?.trim()) { setNewRow(null); return; }
    add({
      name:         newRow.name?.trim() || "",
      unit:         newRow.unit?.trim() || "",
      currentStock: newRow.currentStock || "0",
      costPerUnit:  newRow.costPerUnit  || "0",
      notes:        newRow.notes        || "",
    });
    setNewRow(null);
    toast({ title: "Raw material added" });
  }, [newRow, add, toast]);

  const lbl = "text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 block";

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FlaskConical size={20} className="text-emerald-600" /> Raw Materials
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track raw material stock used in manufacturing</p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setNewRow(blankRow())}>
            <Plus size={14} /> Add Raw Material
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Materials", value: rms.length, icon: FlaskConical, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Total Stock Value", value: `${sym}${rms.reduce((s, r) => s + (parseFloat(r.currentStock)||0)*(parseFloat(r.costPerUnit)||0), 0).toFixed(2)}`, icon: Package, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30" },
          { label: "Low Stock (< 10)", value: rms.filter(r => (parseFloat(r.currentStock)||0) < 10).length, icon: RefreshCw, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Out of Stock", value: rms.filter(r => (parseFloat(r.currentStock)||0) <= 0).length, icon: Minus, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
        ].map(c => (
          <div key={c.label} className={`rounded-lg border p-3 flex items-center gap-3 ${c.bg}`}>
            <c.icon size={18} className={c.color} />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
              <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <ExcelGridShell cols={cols} totalMinW={TOTAL_MIN_W} tableId="raw-materials">
        {rms.map((rm, rowIdx) => (
          <tr key={rm.id} style={{ height: CELL_H }}>
            <td className="border-r border-border text-center text-[11px] text-muted-foreground select-none" style={{ width: 48, minWidth: 48 }}>
              {rowIdx + 1}
            </td>
            {cols.map(col => {
              const k = `${rm.id}-${col.field}`;
              const val = col.field === "rmCode" ? rm.rmCode : String((rm as Record<string, unknown>)[col.field] ?? "");
              return (
                <td key={col.field} style={{ minWidth: col.minW }} className="border-r border-border p-0 relative">
                  <EditableCell
                    value={val}
                    col={col}
                    active={activeKey === k}
                    canEdit={canEdit && col.field !== "rmCode" && col.field !== "currentStock"}
                    onActivate={() => setActiveKey(k)}
                    onCommit={v => { edit(rm.id, { [col.field]: v }); setActiveKey(""); }}
                    onCancel={() => setActiveKey("")}
                    onTab={() => {
                      const ci = cols.indexOf(col);
                      const next = ci < cols.length - 1 ? cols[ci + 1] : null;
                      setActiveKey(next ? `${rm.id}-${next.field}` : "");
                    }}
                    onEnter={() => setActiveKey("")}
                  />
                </td>
              );
            })}
            <td className="text-center" style={{ width: 80, minWidth: 80 }}>
              <div className="flex items-center justify-center gap-1">
                <button onClick={() => setViewId(rm.id)}
                  className="p-1 rounded hover:bg-teal-100 dark:hover:bg-teal-900/30 text-teal-600 transition-colors" title="View Details">
                  <Eye size={13} />
                </button>
                <button onClick={() => setLedgerId(rm.id)}
                  className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-500 transition-colors" title="Stock History">
                  <History size={13} />
                </button>
                {canEdit && (
                  <button onClick={() => setDeleteId(rm.id)}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors" title="Delete">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}

        {/* New row */}
        {newRow && (
          <tr style={{ height: CELL_H, background: NEW_ROW_BG }}>
            <td className="border-r border-border text-center text-[11px] text-muted-foreground select-none" style={{ width: 48, minWidth: 48 }}>*</td>
            {cols.map(col => {
              const k = `new-${col.field}`;
              return (
                <td key={col.field} style={{ minWidth: col.minW }} className="border-r border-border p-0 relative">
                  <EditableCell
                    value={col.field === "rmCode" ? "Auto" : col.field === "currentStock" ? "0" : String((newRow as Record<string, unknown>)[col.field] ?? "")}
                    col={col}
                    active={activeKey === k}
                    canEdit={col.field !== "rmCode" && col.field !== "currentStock"}
                    onActivate={() => setActiveKey(k)}
                    onCommit={v => { setNewRow(r => ({ ...r, [col.field]: v })); setActiveKey(""); }}
                    onCancel={() => { setActiveKey(""); if (col.field === cols[0].field) setNewRow(null); }}
                    onTab={() => {
                      const ci = cols.indexOf(col);
                      const next = ci < cols.length - 1 ? cols[ci + 1] : null;
                      if (next) setActiveKey(`new-${next.field}`); else commitNew();
                    }}
                    onEnter={() => commitNew()}
                  />
                </td>
              );
            })}
            <td className="text-center" style={{ width: 80, minWidth: 80 }}>
              <button onClick={commitNew} className="text-[11px] text-emerald-600 font-semibold px-2 hover:underline">Save</button>
            </td>
          </tr>
        )}
      </ExcelGridShell>

      {/* Detail / Adjust Sheet */}
      <Sheet open={!!viewId} onOpenChange={o => { if (!o) setViewId(null); }}>
        <SheetContent side="right" className="w-full sm:w-[440px] overflow-y-auto">
          {viewRM && (
            <>
              <SheetHeader className="pb-4">
                <div className="h-20 rounded-xl flex items-center gap-4 px-5"
                  style={{ background: "linear-gradient(135deg,#059669,#0d9488)" }}>
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <FlaskConical size={20} className="text-white" />
                  </div>
                  <div>
                    <SheetTitle className="text-white text-base font-bold">{viewRM.name}</SheetTitle>
                    <div className="text-white/70 text-[11px]">{viewRM.rmCode}</div>
                  </div>
                </div>
              </SheetHeader>

              {/* Info cards */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { label: "Current Stock", value: `${parseFloat(viewRM.currentStock||"0").toFixed(2)} ${viewRM.unit}`, color: "text-emerald-600" },
                  { label: "Cost / Unit",   value: `${sym}${parseFloat(viewRM.costPerUnit||"0").toFixed(2)}`,          color: "text-teal-600"   },
                  { label: "Total Value",   value: `${sym}${((parseFloat(viewRM.currentStock)||0)*(parseFloat(viewRM.costPerUnit)||0)).toFixed(2)}`, color: "text-blue-600" },
                  { label: "Unit",          value: viewRM.unit || "—",                                                color: "text-muted-foreground" },
                ].map(c => (
                  <div key={c.label} className="rounded-lg border p-3 bg-muted/30">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{c.label}</div>
                    <div className={`text-sm font-bold ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Notes */}
              {viewRM.notes && (
                <div className="mb-5 p-3 rounded-lg border bg-muted/20 text-[13px] text-muted-foreground">
                  {viewRM.notes}
                </div>
              )}

              {/* Stock is read-only here — only Purchase Orders update stock levels */}
              <div className="border rounded-xl p-4 bg-muted/30 text-[12px] text-muted-foreground flex items-start gap-2">
                <Lock size={13} className="mt-0.5 shrink-0 text-amber-500" />
                <span>Stock quantity is controlled by Purchase Orders only. Receive a PO to add stock for this material.</span>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── RM Stock Ledger History Dialog ── */}
      {(() => {
        const ledgerRM = ledgerId ? rms.find(r => r.id === ledgerId) ?? null : null;
        const entries = ledgerId ? getEntityLedger(ledgerId).slice().reverse() : [];
        const rmTotalIn  = entries.filter(e => e.qtyChange > 0).reduce((s, e) => s + e.qtyChange, 0);
        const rmTotalOut = entries.filter(e => e.qtyChange < 0).reduce((s, e) => s + Math.abs(e.qtyChange), 0);
        const rmNet      = rmTotalIn - rmTotalOut;
        return (
          <Dialog open={!!ledgerId} onOpenChange={o => { if (!o) setLedgerId(null); }}>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 overflow-hidden">
              <DialogHeader className="px-6 py-4 border-b shrink-0 space-y-2">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <History size={16} className="text-blue-600" />
                  Stock History — {ledgerRM?.name || "—"}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">({ledgerRM?.unit})</span>
                </DialogTitle>
                {entries.length > 0 && (
                  <div className="flex items-center gap-4 text-[12px]">
                    <span><span className="font-bold text-emerald-600">+{rmTotalIn}</span> <span className="text-muted-foreground">received in</span></span>
                    <span><span className="font-bold text-red-500">−{rmTotalOut}</span> <span className="text-muted-foreground">consumed/out</span></span>
                    <span className={`font-bold ${rmNet >= 0 ? "text-blue-600" : "text-red-600"}`}>{rmNet >= 0 ? "+" : ""}{rmNet} <span className="font-normal text-muted-foreground">net</span></span>
                  </div>
                )}
              </DialogHeader>
              <div className="flex-1 overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground text-sm">No stock movements recorded yet for this raw material.</div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                      <tr>
                        {["Date", "Type", "Reference", "Change", "Before", "After", "Notes"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => {
                        const isIn = e.qtyChange > 0;
                        return (
                          <tr key={e.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{e.date}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isIn ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                                {LEDGER_TX_LABELS[e.txType]}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-blue-600 dark:text-blue-400">{e.reference || "—"}</td>
                            <td className={`px-3 py-2 font-bold tabular-nums ${isIn ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {isIn ? "+" : ""}{e.qtyChange} {e.unit}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.qtyBefore}</td>
                            <td className="px-3 py-2 tabular-nums font-semibold">{e.qtyAfter}</td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{e.notes || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 border-t-2">
                        <td colSpan={2} className="px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Net Movement</td>
                        <td className="px-3 py-2"></td>
                        <td className={`px-3 py-2 font-bold tabular-nums text-[12px] ${rmNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {rmNet >= 0 ? "+" : ""}{rmNet} {ledgerRM?.unit}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground tabular-nums">{entries[entries.length - 1]?.qtyBefore ?? "—"}</td>
                        <td className="px-3 py-2 font-bold tabular-nums text-[12px]">{entries[0]?.qtyAfter ?? "—"}</td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Raw Material?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this raw material and cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => { if (deleteId) { remove(deleteId); setDeleteId(null); toast({ title: "Raw material deleted" }); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
