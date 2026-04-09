import { useMemo } from "react";
import { useLocation } from "wouter";
import { ShoppingCart, Truck, Factory, Boxes, ArrowRight, CheckCircle2, Clock, AlertCircle, FlaskConical, ChevronRight } from "lucide-react";
import { getPurchaseOrders, getRawMaterials, getManufacturingOrders, getStock } from "@/lib/store";
import { Button } from "@/components/ui/button";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useWorkflowData() {
  return useMemo(() => {
    const pos   = getPurchaseOrders();
    const rms   = getRawMaterials();
    const mfgs  = getManufacturingOrders();
    const stock = getStock();

    // POs that contain at least one raw-material line
    const rmPos          = pos.filter(p => p.items.some(i => (i as { itemType?: string }).itemType === "raw-material" || (i as any).code));
    const pendingRmPos   = rmPos.filter(p => p.status !== "Received" && p.status !== "Cancelled");
    const awaitingReceipt = rmPos.filter(p => p.status !== "Received" && p.status !== "Cancelled" && p.status !== "Draft");

    const rmsWithStock   = rms.filter(r => (r.currentStock ?? 0) > 0);
    const activeMfg      = mfgs.filter(o => o.status === "Draft" || o.status === "In Progress");
    const completedMfg   = mfgs.filter(o => o.status === "Completed");
    const totalStock     = stock.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

    return { pendingRmPos, awaitingReceipt, rms, rmsWithStock, activeMfg, completedMfg, stock, totalStock };
  }, []);
}

// ─── Step card ────────────────────────────────────────────────────────────────
interface StepCardProps {
  step:       number;
  icon:       React.ElementType;
  title:      string;
  desc:       string;
  tip:        string;
  color:      string;          // tailwind bg colour class for the icon blob
  textColor:  string;
  borderColor: string;
  stats:      { label: string; value: string | number; ok?: boolean }[];
  actions:    { label: string; href: string; primary?: boolean }[];
  isLast?:    boolean;
}

function StepCard({ step, icon: Icon, title, desc, tip, color, textColor, borderColor, stats, actions, isLast }: StepCardProps) {
  const [, navigate] = useLocation();

  return (
    <div className="relative flex-1 min-w-0">
      <div className={`h-full rounded-2xl border-2 ${borderColor} bg-white dark:bg-card shadow-sm flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className={`${color} px-5 pt-5 pb-4`}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/30 dark:bg-black/20 flex items-center justify-center shadow-sm">
              <Icon size={20} className={textColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-bold uppercase tracking-widest ${textColor} opacity-70 mb-0.5`}>Step {step}</div>
              <h3 className={`text-[15px] font-bold ${textColor} leading-tight`}>{title}</h3>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Description */}
          <p className="text-[13px] text-muted-foreground leading-relaxed">{desc}</p>

          {/* Live stats */}
          <div className="flex flex-wrap gap-2">
            {stats.map((s, i) => (
              <div key={i} className={`flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border font-medium
                ${s.ok === false ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
                  : s.ok === true  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted border-border text-muted-foreground"}`}>
                {s.ok === false ? <AlertCircle size={11} /> : s.ok === true ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                <span className="font-bold">{s.value}</span> {s.label}
              </div>
            ))}
          </div>

          {/* Tip */}
          <div className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mt-0.5 flex-shrink-0">Tip</span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{tip}</p>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {actions.map((a, i) => (
              <Button
                key={i}
                size="sm"
                variant={a.primary ? "default" : "outline"}
                className={`w-full text-[12px] justify-between group ${a.primary ? "" : "hover:bg-muted"}`}
                onClick={() => navigate(a.href)}
              >
                {a.label}
                <ChevronRight size={13} className="opacity-50 group-hover:opacity-100 transition-opacity" />
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Connector arrow */}
      {!isLast && (
        <div className="hidden xl:flex absolute top-1/2 -right-[22px] -translate-y-1/2 z-10 w-11 items-center justify-center">
          <ArrowRight size={22} className="text-muted-foreground/40" />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProductionGuidePage() {
  const d = useWorkflowData();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-8">

        {/* ── Page header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground mb-2">
            <Factory size={13} />
            <span>Manufacturing</span>
            <ChevronRight size={12} />
            <span className="text-foreground font-medium">Production Workflow</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1.5">Production Workflow</h1>
          <p className="text-[14px] text-muted-foreground max-w-xl">
            Follow these 4 steps to turn raw materials into finished products — from purchasing to manufacturing to stock.
          </p>
        </div>

        {/* ── Overview bar ── */}
        <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Raw Material Types",  value: d.rms.length,           sub: `${d.rmsWithStock.length} in stock`,     icon: FlaskConical, bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-400" },
            { label: "Pending PO Receipts", value: d.pendingRmPos.length,  sub: "orders awaiting receipt",              icon: Truck,        bg: "bg-blue-50 dark:bg-blue-950/20",   text: "text-blue-700 dark:text-blue-400"  },
            { label: "Active Mfg. Orders",  value: d.activeMfg.length,     sub: `${d.completedMfg.length} completed`,   icon: Factory,      bg: "bg-violet-50 dark:bg-violet-950/20", text: "text-violet-700 dark:text-violet-400" },
            { label: "Finished Stock (qty)",value: d.totalStock,           sub: `${d.stock.length} product lines`,       icon: Boxes,        bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-400" },
          ].map(({ label, value, sub, icon: Ic, bg, text }) => (
            <div key={label} className={`rounded-xl ${bg} border border-transparent px-4 py-3 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-lg bg-white/60 dark:bg-black/20 flex items-center justify-center flex-shrink-0`}>
                <Ic size={16} className={text} />
              </div>
              <div>
                <div className={`text-xl font-bold ${text}`}>{value}</div>
                <div className={`text-[11px] font-medium ${text} opacity-70`}>{label}</div>
                <div className="text-[10px] text-muted-foreground">{sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Step cards ── */}
        <div className="flex flex-col xl:flex-row gap-5 xl:gap-10">

          <StepCard
            step={1}
            icon={ShoppingCart}
            title="Buy Raw Materials"
            desc="Create a Purchase Order to buy the raw materials you need from your supplier. Add each material with its quantity and cost."
            tip="You can add multiple raw materials in a single Purchase Order. Choose your supplier, set quantities, and save the order."
            color="bg-amber-50 dark:bg-amber-950/30"
            textColor="text-amber-800 dark:text-amber-300"
            borderColor="border-amber-200 dark:border-amber-800"
            stats={[
              { label: "pending orders", value: d.pendingRmPos.length, ok: d.pendingRmPos.length === 0 },
            ]}
            actions={[
              { label: "Create Purchase Order", href: "/purchases", primary: true },
            ]}
          />

          <StepCard
            step={2}
            icon={Truck}
            title="Receive & Update Stock"
            desc='When your materials arrive, open the Purchase Order and click "Mark as Received — Update Stock". Raw material stock updates automatically.'
            tip="Stock only updates when you mark an order as received. Until then, the materials are not counted as available for manufacturing."
            color="bg-blue-50 dark:bg-blue-950/30"
            textColor="text-blue-800 dark:text-blue-300"
            borderColor="border-blue-200 dark:border-blue-800"
            stats={[
              { label: "types in stock", value: d.rmsWithStock.length, ok: d.rmsWithStock.length > 0 },
              { label: "awaiting receipt", value: d.awaitingReceipt.length, ok: d.awaitingReceipt.length === 0 },
            ]}
            actions={[
              { label: "View Purchase Orders", href: "/purchases", primary: true },
              { label: "Check Raw Material Stock", href: "/raw-materials" },
            ]}
          />

          <StepCard
            step={3}
            icon={Factory}
            title="Start Manufacturing"
            desc="Create a Manufacturing Order to use your raw materials and make finished products. Set quantities, expected outputs, and any waste."
            tip='Click "Complete Order" when production is done. The system will deduct the raw materials used and add finished products to your stock.'
            color="bg-violet-50 dark:bg-violet-950/30"
            textColor="text-violet-800 dark:text-violet-300"
            borderColor="border-violet-200 dark:border-violet-800"
            stats={[
              { label: "active orders", value: d.activeMfg.length, ok: d.activeMfg.length === 0 },
              { label: "completed", value: d.completedMfg.length, ok: d.completedMfg.length > 0 },
            ]}
            actions={[
              { label: "Create Manufacturing Order", href: "/manufacturing", primary: true },
              { label: "View All Orders", href: "/manufacturing" },
            ]}
          />

          <StepCard
            step={4}
            icon={Boxes}
            title="Products Ready to Sell"
            desc="Finished products are automatically added to your stock when a Manufacturing Order is completed. They're now ready to be sold."
            tip="Go to Sales to sell your products, or check Stock to see quantities. Products appear with a manufacturing reference for traceability."
            color="bg-emerald-50 dark:bg-emerald-950/30"
            textColor="text-emerald-800 dark:text-emerald-300"
            borderColor="border-emerald-200 dark:border-emerald-800"
            stats={[
              { label: "total stock (qty)", value: d.totalStock, ok: d.totalStock > 0 },
              { label: "product lines", value: d.stock.length },
            ]}
            actions={[
              { label: "View Stock", href: "/stock", primary: true },
              { label: "Make a Sale", href: "/sales/new" },
            ]}
            isLast
          />
        </div>

        {/* ── Quick reference table ── */}
        <div className="mt-10 rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/30">
            <h2 className="text-[14px] font-bold">Quick Reference</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">What happens at each step and where to find it</p>
          </div>
          <div className="divide-y">
            {[
              {
                step: "Step 1", name: "Create Purchase Order", where: "Sales & Purchases → Purchase Orders",
                what: "Enter supplier name, select raw materials, set quantities and unit costs. Save as Draft or send directly.",
                icon: ShoppingCart, text: "text-amber-600",
              },
              {
                step: "Step 2", name: "Mark Order as Received", where: "Sales & Purchases → Purchase Orders → Open order → Footer button",
                what: 'Click "Mark as Received — Update Stock" at the bottom of the order. Raw material stock updates instantly.',
                icon: Truck, text: "text-blue-600",
              },
              {
                step: "Step 3a", name: "Check Raw Material Stock", where: "Manufacturing → Raw Materials",
                what: "Verify you have enough stock before starting production. You can also manually adjust stock levels here.",
                icon: FlaskConical, text: "text-teal-600",
              },
              {
                step: "Step 3b", name: "Create Manufacturing Order", where: "Manufacturing → Mfg. Orders → New Order",
                what: "Select the raw materials to consume (inputs), set quantities, and define output products. Add any waste amounts.",
                icon: Factory, text: "text-violet-600",
              },
              {
                step: "Step 3c", name: "Complete the Order", where: "Manufacturing → Mfg. Orders → Open order → Complete Order",
                what: 'Click "Complete Order" in the order header. Raw materials are deducted; finished products are added to stock.',
                icon: CheckCircle2, text: "text-emerald-600",
              },
              {
                step: "Step 4", name: "Sell Your Products", where: "Sales & Purchases → New Sale / All Sales",
                what: "Your finished products now appear in the POS terminal. Add to a sale, generate an invoice, and track revenue.",
                icon: Boxes, text: "text-emerald-600",
              },
            ].map(({ step, name, where, what, icon: Ic, text }) => (
              <div key={step} className="px-6 py-4 flex items-start gap-4 hover:bg-muted/20 transition-colors">
                <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center`}>
                  <Ic size={15} className={text} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{step}</span>
                    <span className="text-[13px] font-semibold text-foreground">{name}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 mb-1">
                    <ChevronRight size={10} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">{where}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">{what}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
