import { useState, useMemo } from "react";
import {
  getRawMaterials,
  type ManufacturingOrder, type MfgStatus, MFG_STATUSES,
} from "@/lib/store";
import { useRawMaterials, useProducts, useStock, useManufacturingOrders } from "@/hooks/use-data";
import { fmtMoney } from "@/lib/currencies";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Factory, Search, Download, ChevronDown, ChevronRight,
  Package, Boxes, Coins, Layers, FileText, Calendar, X,
} from "lucide-react";

type RmRow = { rmId: string; rmName: string; unit: string; qty: number; rate: number; lineCost: number };
type OutRow = { productId: string; productName: string; qty: number; unit: string; manualCost?: number };
type CostRow = { description: string; amount: number };

type Row = {
  order: ManufacturingOrder;
  rmRows: RmRow[];
  outRows: OutRow[];
  costRows: CostRow[];
  rmTotal: number;
  prodTotal: number;
  batchTotal: number;
  totalOutQty: number;
  costPerUnit: number;
};

function buildRow(order: ManufacturingOrder, rms: ReturnType<typeof getRawMaterials>): Row {
  const rmRows: RmRow[] = (order.inputs || []).map(inp => {
    const rm = rms.find(r => r.id === inp.rmId);
    const qty = parseFloat(inp.qtyUsed) || 0;
    const rate = parseFloat(rm?.costPerUnit || "0") || 0;
    return { rmId: inp.rmId, rmName: inp.rmName || rm?.name || "—", unit: inp.unit || rm?.unit || "", qty, rate, lineCost: qty * rate };
  });
  const outRows: OutRow[] = (order.outputs || []).map(o => ({
    productId: o.productId, productName: o.productName, qty: parseFloat(o.qty) || 0,
    unit: o.unit || "", manualCost: o.manualCost ? parseFloat(o.manualCost) : undefined,
  }));
  const costRows: CostRow[] = (order.productionCosts || []).map(c => ({
    description: c.description, amount: parseFloat(c.amount) || 0,
  }));
  const rmTotal = rmRows.reduce((s, r) => s + r.lineCost, 0);
  const prodTotal = costRows.reduce((s, c) => s + c.amount, 0);
  const batchTotal = rmTotal + prodTotal;
  const totalOutQty = outRows.reduce((s, o) => s + o.qty, 0);
  const costPerUnit = totalOutQty > 0 ? batchTotal / totalOutQty : 0;
  return { order, rmRows, outRows, costRows, rmTotal, prodTotal, batchTotal, totalOutQty, costPerUnit };
}

const statusColor = (s: MfgStatus): string => {
  switch (s) {
    case "Completed":   return "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300";
    case "In Progress": return "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300";
    case "Cancelled":   return "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300";
    default:            return "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400";
  }
};

function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV(rows: Row[]) {
  const headers = [
    "Date","Session ID","Status","Product","Units Produced","Unit","Cost Per Unit",
    "Raw Material","RM Qty Used","RM Unit","RM Rate","RM Line Cost",
    "Production Cost Item","Production Cost Amount",
    "Total RM Cost","Total Production Cost","Total Batch Cost","Notes",
  ];
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    const dateStr = r.order.orderDate || "";
    const id = r.order.orderNumber;
    const status = r.order.status;
    const notes = r.order.notes || "";
    const maxLen = Math.max(1, r.rmRows.length, r.outRows.length, r.costRows.length);
    for (let i = 0; i < maxLen; i++) {
      const out = r.outRows[i];
      const rm = r.rmRows[i];
      const pc = r.costRows[i];
      lines.push([
        i === 0 ? dateStr : "",
        i === 0 ? id : "",
        i === 0 ? status : "",
        out?.productName ?? "",
        out ? String(out.qty) : "",
        out?.unit ?? "",
        out ? r.costPerUnit.toFixed(2) : "",
        rm?.rmName ?? "",
        rm ? String(rm.qty) : "",
        rm?.unit ?? "",
        rm ? rm.rate.toFixed(2) : "",
        rm ? rm.lineCost.toFixed(2) : "",
        pc?.description ?? "",
        pc ? pc.amount.toFixed(2) : "",
        i === 0 ? r.rmTotal.toFixed(2) : "",
        i === 0 ? r.prodTotal.toFixed(2) : "",
        i === 0 ? r.batchTotal.toFixed(2) : "",
        i === 0 ? notes : "",
      ].map(csvEscape).join(","));
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `production-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProductionReportPage() {
  const { rms } = useRawMaterials();
  const { products } = useProducts();
  const { stock } = useStock();
  const { orders } = useManufacturingOrders();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | MfgStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) for (const out of o.outputs || []) if (out.productName) set.add(out.productName);
    return Array.from(set).sort();
  }, [orders]);

  const allRows = useMemo(() => orders.map(o => buildRow(o, rms)), [orders, rms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(r => {
      if (status !== "all" && r.order.status !== status) return false;
      if (from && r.order.orderDate < from) return false;
      if (to && r.order.orderDate > to) return false;
      if (productFilter !== "all" && !r.outRows.some(o => o.productName === productFilter)) return false;
      if (q) {
        const hay = `${r.order.orderNumber} ${r.outRows.map(o => o.productName).join(" ")} ${r.rmRows.map(rm => rm.rmName).join(" ")} ${r.order.notes || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, search, status, from, to, productFilter]);

  const totals = useMemo(() => {
    const sessions = filtered.length;
    const completed = filtered.filter(r => r.order.status === "Completed").length;
    const rmTotal = filtered.reduce((s, r) => s + r.rmTotal, 0);
    const prodTotal = filtered.reduce((s, r) => s + r.prodTotal, 0);
    const batchTotal = filtered.reduce((s, r) => s + r.batchTotal, 0);
    const unitsProduced = filtered.reduce((s, r) => s + r.totalOutQty, 0);
    return { sessions, completed, rmTotal, prodTotal, batchTotal, unitsProduced };
  }, [filtered]);

  const perProductSummary = useMemo(() => {
    const map = new Map<string, { qty: number; cost: number }>();
    for (const r of filtered) {
      const cpu = r.costPerUnit;
      for (const out of r.outRows) {
        const cur = map.get(out.productName) || { qty: 0, cost: 0 };
        cur.qty += out.qty;
        cur.cost += out.qty * cpu;
        map.set(out.productName, cur);
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, qty: v.qty, cost: v.cost, avgCostPerUnit: v.qty > 0 ? v.cost / v.qty : 0 }))
      .sort((a, b) => b.cost - a.cost);
  }, [filtered]);

  const inventoryUpdates = useMemo(() => {
    const fgMap = new Map<string, { qty: number; unit: string; currentStock: number }>();
    const rmUsedMap = new Map<string, { qty: number; unit: string; currentStock: number }>();
    for (const r of filtered) {
      if (r.order.status !== "Completed") continue;
      for (const out of r.outRows) {
        const cur = fgMap.get(out.productName) || { qty: 0, unit: out.unit, currentStock: 0 };
        cur.qty += out.qty;
        if (!cur.unit) cur.unit = out.unit;
        fgMap.set(out.productName, cur);
      }
      for (const rmR of r.rmRows) {
        const cur = rmUsedMap.get(rmR.rmName) || { qty: 0, unit: rmR.unit, currentStock: 0 };
        cur.qty += rmR.qty;
        if (!cur.unit) cur.unit = rmR.unit;
        rmUsedMap.set(rmR.rmName, cur);
      }
    }
    for (const [name, v] of fgMap) {
      const skuLower = name.toLowerCase();
      const total = stock
        .filter(s => (s.productName || "").toLowerCase() === skuLower)
        .reduce((s, x) => s + (parseFloat(x.quantity) || 0), 0);
      v.currentStock = total;
    }
    for (const [name, v] of rmUsedMap) {
      const rm = rms.find(r => r.name === name);
      v.currentStock = parseFloat(rm?.currentStock || "0") || 0;
    }
    return {
      finishedGoods: Array.from(fgMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty),
      rawMaterials: Array.from(rmUsedMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty),
    };
  }, [filtered, stock, rms]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const clearFilters = () => { setSearch(""); setStatus("all"); setFrom(""); setTo(""); setProductFilter("all"); };
  const hasFilters = search || status !== "all" || from || to || productFilter !== "all";

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Factory className="text-indigo-600" size={24}/>
            Production Cost Report
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Detailed cost breakdown by manufacturing session — RM consumption, production overhead, batch cost & per-unit cost
          </p>
        </div>
        <Button onClick={() => exportCSV(filtered)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
          <Download size={14}/> Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Layers size={11}/> Sessions
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totals.sessions}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{totals.completed} completed</div>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Boxes size={11}/> Units Produced
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totals.unitsProduced.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <Package size={11}/> RM Cost
          </div>
          <div className="text-xl font-bold text-amber-900 dark:text-amber-100 mt-1">{fmtMoney(totals.rmTotal)}</div>
        </div>
        <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            <Coins size={11}/> Production Cost
          </div>
          <div className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">{fmtMoney(totals.prodTotal)}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-3 col-span-2 md:col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <FileText size={11}/> Total Batch Cost
          </div>
          <div className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mt-1">{fmtMoney(totals.batchTotal)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search MO#, product, raw material, notes..."
              className="pl-8 h-9 text-xs"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as "all" | MfgStatus)}>
            <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Status"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {MFG_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Product"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {productOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-gray-400"/>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-[140px] text-xs"/>
            <span className="text-xs text-gray-400">to</span>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-[140px] text-xs"/>
          </div>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 gap-1 text-xs">
              <X size={12}/> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Detailed sessions table */}
      <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/30">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">
            Production Sessions ({filtered.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-zinc-950/50 border-b border-gray-200 dark:border-zinc-800">
              <tr className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="w-8 px-3 py-2"></th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Session ID</th>
                <th className="text-left px-3 py-2">Product(s)</th>
                <th className="text-right px-3 py-2">Units</th>
                <th className="text-right px-3 py-2">RM Cost</th>
                <th className="text-right px-3 py-2">Prod. Cost</th>
                <th className="text-right px-3 py-2">Total Batch</th>
                <th className="text-right px-3 py-2">Cost / Unit</th>
                <th className="text-center px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500 dark:text-gray-400">No production sessions match your filters.</td></tr>
              )}
              {filtered.map(r => {
                const open = expanded.has(r.order.id);
                return (
                  <>
                    <tr key={r.order.id} className="border-b border-gray-100 dark:border-zinc-800/60 hover:bg-gray-50 dark:hover:bg-zinc-950/40 cursor-pointer" onClick={() => toggle(r.order.id)}>
                      <td className="px-3 py-2.5 text-gray-400">{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{r.order.orderDate || "—"}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.order.orderNumber}</td>
                      <td className="px-3 py-2.5 text-gray-900 dark:text-gray-100">
                        {r.outRows.length === 0 ? <span className="text-gray-400">—</span> :
                          r.outRows.map(o => o.productName).join(", ")}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">{r.totalOutQty.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700 dark:text-amber-300">{fmtMoney(r.rmTotal)}</td>
                      <td className="px-3 py-2.5 text-right text-blue-700 dark:text-blue-300">{fmtMoney(r.prodTotal)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-300">{fmtMoney(r.batchTotal)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-gray-100">{r.costPerUnit > 0 ? fmtMoney(r.costPerUnit) : "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge className={`${statusColor(r.order.status)} font-bold text-[10px]`}>{r.order.status}</Badge>
                      </td>
                    </tr>
                    {open && (
                      <tr key={r.order.id + "-detail"} className="bg-gray-50/60 dark:bg-zinc-950/40 border-b border-gray-200 dark:border-zinc-800">
                        <td colSpan={10} className="px-6 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* RM used */}
                            <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-white dark:bg-zinc-900 overflow-hidden">
                              <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wide">Raw Materials Used</div>
                              <table className="w-full text-[11px]">
                                <thead className="text-[9px] uppercase text-gray-500">
                                  <tr><th className="text-left px-2 py-1">Material</th><th className="text-right px-2 py-1">Qty</th><th className="text-right px-2 py-1">Rate</th><th className="text-right px-2 py-1">Line Cost</th></tr>
                                </thead>
                                <tbody>
                                  {r.rmRows.length === 0 && <tr><td colSpan={4} className="text-center py-2 text-gray-400">No raw materials</td></tr>}
                                  {r.rmRows.map((rm, i) => (
                                    <tr key={i} className="border-t border-gray-100 dark:border-zinc-800">
                                      <td className="px-2 py-1 text-gray-800 dark:text-gray-200">{rm.rmName}</td>
                                      <td className="px-2 py-1 text-right">{rm.qty.toFixed(2)} {rm.unit}</td>
                                      <td className="px-2 py-1 text-right">{fmtMoney(rm.rate)}</td>
                                      <td className="px-2 py-1 text-right font-semibold text-amber-700 dark:text-amber-300">{fmtMoney(rm.lineCost)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20">
                                    <td colSpan={3} className="px-2 py-1.5 text-right text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300">Total RM</td>
                                    <td className="px-2 py-1.5 text-right font-bold text-amber-800 dark:text-amber-300">{fmtMoney(r.rmTotal)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                            {/* Production costs */}
                            <div className="rounded-md border border-blue-200 dark:border-blue-900/40 bg-white dark:bg-zinc-900 overflow-hidden">
                              <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wide">Production Costs</div>
                              <table className="w-full text-[11px]">
                                <thead className="text-[9px] uppercase text-gray-500">
                                  <tr><th className="text-left px-2 py-1">Description</th><th className="text-right px-2 py-1">Amount</th></tr>
                                </thead>
                                <tbody>
                                  {r.costRows.length === 0 && <tr><td colSpan={2} className="text-center py-2 text-gray-400">No production costs</td></tr>}
                                  {r.costRows.map((c, i) => (
                                    <tr key={i} className="border-t border-gray-100 dark:border-zinc-800">
                                      <td className="px-2 py-1 text-gray-800 dark:text-gray-200">{c.description}</td>
                                      <td className="px-2 py-1 text-right font-semibold text-blue-700 dark:text-blue-300">{fmtMoney(c.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20">
                                    <td className="px-2 py-1.5 text-right text-[10px] font-bold uppercase text-blue-800 dark:text-blue-300">Total Prod.</td>
                                    <td className="px-2 py-1.5 text-right font-bold text-blue-800 dark:text-blue-300">{fmtMoney(r.prodTotal)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                            {/* Outputs + inventory */}
                            <div className="rounded-md border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-zinc-900 overflow-hidden">
                              <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wide">Finished Output</div>
                              <table className="w-full text-[11px]">
                                <thead className="text-[9px] uppercase text-gray-500">
                                  <tr><th className="text-left px-2 py-1">Product</th><th className="text-right px-2 py-1">Qty</th><th className="text-right px-2 py-1">Cost/Unit</th></tr>
                                </thead>
                                <tbody>
                                  {r.outRows.length === 0 && <tr><td colSpan={3} className="text-center py-2 text-gray-400">No outputs</td></tr>}
                                  {r.outRows.map((o, i) => (
                                    <tr key={i} className="border-t border-gray-100 dark:border-zinc-800">
                                      <td className="px-2 py-1 text-gray-800 dark:text-gray-200">{o.productName}</td>
                                      <td className="px-2 py-1 text-right">{o.qty.toFixed(2)} {o.unit}</td>
                                      <td className="px-2 py-1 text-right font-semibold text-emerald-700 dark:text-emerald-300">{fmtMoney(o.manualCost ?? r.costPerUnit)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                                    <td colSpan={2} className="px-2 py-1.5 text-right text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">Total Batch Cost</td>
                                    <td className="px-2 py-1.5 text-right font-bold text-emerald-800 dark:text-emerald-300">{fmtMoney(r.batchTotal)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                          {(r.order.notes || r.order.wasteQty) && (
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                              {r.order.notes && (
                                <div className="rounded-md border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
                                  <div className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 mb-1">Notes</div>
                                  <div className="text-gray-700 dark:text-gray-300">{r.order.notes}</div>
                                </div>
                              )}
                              {(parseFloat(r.order.wasteQty || "0") > 0) && (
                                <div className="rounded-md border border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/10 px-3 py-2">
                                  <div className="text-[10px] font-bold uppercase text-red-600 dark:text-red-400 mb-1">Waste Recorded</div>
                                  <div className="text-gray-700 dark:text-gray-300">
                                    {r.order.wasteQty} {r.order.wasteUnit}{r.order.wasteNotes ? ` — ${r.order.wasteNotes}` : ""}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-product summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/30">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">Cost Per Unit — By Product</h2>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-zinc-950/50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">Product</th>
                <th className="text-right px-3 py-2">Qty Produced</th>
                <th className="text-right px-3 py-2">Total Cost</th>
                <th className="text-right px-3 py-2">Avg Cost / Unit</th>
              </tr>
            </thead>
            <tbody>
              {perProductSummary.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-gray-400">No data</td></tr>}
              {perProductSummary.map((p, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-zinc-800/60">
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{p.name}</td>
                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{p.qty.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-300">{fmtMoney(p.cost)}</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100">{fmtMoney(p.avgCostPerUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Inventory updates */}
        <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/30">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">Inventory Impact (Completed sessions only)</h2>
          </div>
          <div className="p-3 space-y-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">Raw Materials Consumed</div>
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase text-gray-500">
                  <tr><th className="text-left py-1">Material</th><th className="text-right py-1">Used</th><th className="text-right py-1">Current Stock</th></tr>
                </thead>
                <tbody>
                  {inventoryUpdates.rawMaterials.length === 0 && <tr><td colSpan={3} className="text-center py-2 text-gray-400">None</td></tr>}
                  {inventoryUpdates.rawMaterials.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-zinc-800">
                      <td className="py-1 text-gray-800 dark:text-gray-200">{r.name}</td>
                      <td className="py-1 text-right text-red-600 dark:text-red-400">−{r.qty.toFixed(2)} {r.unit}</td>
                      <td className="py-1 text-right text-gray-700 dark:text-gray-300">{r.currentStock.toFixed(2)} {r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">Finished Goods Added</div>
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase text-gray-500">
                  <tr><th className="text-left py-1">Product</th><th className="text-right py-1">Added</th><th className="text-right py-1">Current Stock</th></tr>
                </thead>
                <tbody>
                  {inventoryUpdates.finishedGoods.length === 0 && <tr><td colSpan={3} className="text-center py-2 text-gray-400">None</td></tr>}
                  {inventoryUpdates.finishedGoods.map((p, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-zinc-800">
                      <td className="py-1 text-gray-800 dark:text-gray-200">{p.name}</td>
                      <td className="py-1 text-right text-emerald-600 dark:text-emerald-400">+{p.qty.toFixed(2)} {p.unit}</td>
                      <td className="py-1 text-right text-gray-700 dark:text-gray-300">{p.currentStock.toFixed(2)} {p.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
