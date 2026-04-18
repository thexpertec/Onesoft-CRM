import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { ChevronLeft, Package, Truck, CreditCard, FileText, CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { fetchSales, calcLineTotal, type Sale } from "@/lib/api";
import { fmt, fmtDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Layout } from "@/components/layout";
import { StatusBadge, DeliveryBadge, PaymentBadge, derivePayStatus } from "@/components/badges";

/* ── Pipeline stage definition ─────────────────────────────────────────────── */
type StageStatus = "done" | "active" | "pending" | "cancelled";

interface PipelineStage {
  key: string;
  label: string;
  description: string;
  status: StageStatus;
}

function buildPipeline(sale: Sale): PipelineStage[] {
  const ds = sale.deliveryStatus ?? "Pending";
  const st = sale.status ?? "Completed";
  const isCancelled = st === "Cancelled" || st === "Refunded";
  const paid = parseFloat(sale.amountPaid ?? "0") || 0;

  const DELIVERY_RANK: Record<string, number> = {
    Pending: 0, Processing: 1, Shipped: 2, Delivered: 3,
  };
  const rank = DELIVERY_RANK[ds] ?? 0;

  const stage = (key: string, label: string, description: string, done: boolean, active: boolean): PipelineStage => ({
    key, label, description,
    status: isCancelled ? "cancelled" : done ? "done" : active ? "active" : "pending",
  });

  return [
    stage("placed",     "Order Placed",  `Placed on ${fmtDate(sale.saleDate)}`, true,         false),
    stage("confirmed",  "Confirmed",     st !== "Draft" ? "Order accepted" : "Awaiting confirmation",
                                          st !== "Draft" && !isCancelled, false),
    stage("processing", "Processing",    rank >= 1 ? "Being prepared for dispatch" : "Awaiting processing",
                                          rank >= 1, rank === 0 && !isCancelled && st !== "Draft"),
    stage("shipped",    "Shipped",       rank >= 2 ? "On the way to you" : "Not yet dispatched",
                                          rank >= 2, rank === 1),
    stage("delivered",  "Delivered",     rank >= 3 ? "Successfully delivered" : "Awaiting delivery",
                                          rank >= 3, rank === 2),
  ].map(s => isCancelled ? { ...s, status: s.key === "placed" ? "done" : "cancelled" } : s);
}

function StageIcon({ status, size = 20 }: { status: StageStatus; size?: number }) {
  if (status === "done")      return <CheckCircle2 size={size} className="text-emerald-500" />;
  if (status === "active")    return <Clock size={size} className="text-blue-500 animate-pulse" />;
  if (status === "cancelled") return <XCircle size={size} className="text-red-400" />;
  return <Circle size={size} className="text-gray-300" />;
}

function OrderPipeline({ sale }: { sale: Sale }) {
  const stages = buildPipeline(sale);
  const isCancelled = sale.status === "Cancelled" || sale.status === "Refunded";

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-5 mb-4">
      <h2 className="text-[14px] font-semibold text-gray-900 mb-5">Order Progress</h2>

      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-start">
        {stages.map((stage, idx) => (
          <div key={stage.key} className="flex-1 flex flex-col items-center relative">
            {/* Connector line before */}
            {idx > 0 && (
              <div className={cn(
                "absolute top-[10px] right-1/2 w-full h-[2px] -z-0",
                stages[idx - 1].status === "done" && stage.status !== "cancelled"
                  ? "bg-emerald-400"
                  : stage.status === "cancelled"
                    ? "bg-red-200"
                    : "bg-gray-200"
              )} />
            )}

            {/* Icon */}
            <div className="relative z-10 bg-white px-1">
              <StageIcon status={stage.status} size={22} />
            </div>

            {/* Label */}
            <p className={cn(
              "mt-2 text-[11.5px] font-semibold text-center leading-tight",
              stage.status === "done"      ? "text-emerald-700" :
              stage.status === "active"    ? "text-blue-700" :
              stage.status === "cancelled" ? "text-red-500" :
                                             "text-gray-400"
            )}>
              {stage.label}
            </p>

            {/* Description */}
            <p className="mt-0.5 text-[10.5px] text-center text-gray-400 leading-tight px-1 hidden lg:block">
              {stage.description}
            </p>
          </div>
        ))}
      </div>

      {/* Mobile: vertical list */}
      <div className="sm:hidden space-y-3">
        {stages.map((stage, idx) => (
          <div key={stage.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center shrink-0">
              <StageIcon status={stage.status} size={18} />
              {idx < stages.length - 1 && (
                <div className={cn(
                  "w-[2px] h-6 mt-1",
                  stage.status === "done" ? "bg-emerald-300" :
                  stage.status === "cancelled" ? "bg-red-200" : "bg-gray-200"
                )} />
              )}
            </div>
            <div className="pt-0.5">
              <p className={cn(
                "text-[12.5px] font-semibold",
                stage.status === "done"      ? "text-emerald-700" :
                stage.status === "active"    ? "text-blue-700" :
                stage.status === "cancelled" ? "text-red-500" :
                                               "text-gray-400"
              )}>
                {stage.label}
              </p>
              <p className="text-[11px] text-gray-400">{stage.description}</p>
            </div>
          </div>
        ))}
      </div>

      {isCancelled && (
        <p className="mt-4 text-center text-[12px] text-red-500 font-medium">
          This order has been {sale.status.toLowerCase()}.
        </p>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function OrderDetailPage() {
  const [, params] = useRoute("/orders/:id");
  const { session, settings } = useAuth();
  const [sale, setSale] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(true);

  const sym = settings.currencySymbol || "£";
  const dp  = parseInt(settings.decimalPlaces ?? "2") || 2;

  useEffect(() => {
    if (!session || !params?.id) return;
    fetchSales(session.tenantId)
      .then(all => {
        const found = all.find(s =>
          s.id === params.id &&
          ((s as Record<string, unknown>).portalCustomerId === session.customer.id ||
           s.customer === session.customer.name)
        );
        setSale(found ?? null);
      })
      .finally(() => setBusy(false));
  }, [session, params?.id]);

  if (busy) {
    return (
      <Layout>
        <div className="py-16 text-center text-[14px] text-gray-400">Loading order…</div>
      </Layout>
    );
  }

  if (!sale) {
    return (
      <Layout>
        <div className="py-16 text-center">
          <p className="text-[15px] text-gray-500 mb-4">Order not found.</p>
          <Link href="/orders">
            <span className="text-blue-600 text-[14px] hover:underline cursor-pointer">← Back to orders</span>
          </Link>
        </div>
      </Layout>
    );
  }

  const subtotal = sale.items.reduce((s, i) => s + calcLineTotal(i), 0);
  const taxRate  = parseFloat(sale.taxRate ?? "0") || 0;
  const taxAmt   = subtotal * (taxRate / 100);
  const delivery = parseFloat(sale.deliveryCharges ?? "0") || 0;
  const invDisc  = parseFloat(sale.invoiceDiscount ?? "0") || 0;
  let afterInvDisc = subtotal;
  if (invDisc > 0) {
    afterInvDisc = sale.invoiceDiscountType === "pct"
      ? subtotal * (1 - invDisc / 100)
      : Math.max(0, subtotal - invDisc);
  }
  const grand   = afterInvDisc * (1 + taxRate / 100) + delivery;
  const paid    = parseFloat(sale.amountPaid ?? "0") || 0;
  const balance = grand - paid;

  return (
    <Layout>
      {/* Back */}
      <Link href="/orders">
        <span className="inline-flex items-center gap-1.5 text-[13.5px] text-gray-500 hover:text-gray-900 cursor-pointer mb-5 transition-colors">
          <ChevronLeft size={15} />
          Back to orders
        </span>
      </Link>

      {/* Title row */}
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-bold text-gray-900">{sale.saleNumber}</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">{fmtDate(sale.saleDate)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={sale.status} />
          {sale.deliveryStatus && <DeliveryBadge status={sale.deliveryStatus} />}
          <PaymentBadge status={derivePayStatus(sale.amountPaid, grand)} />
        </div>
      </div>

      {/* Pipeline tracker */}
      <OrderPipeline sale={sale} />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: items + notes */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Package size={15} className="text-gray-400" />
              <h2 className="text-[14px] font-semibold text-gray-900">Order Items</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {sale.items.map((item, idx) => {
                const lineAmt = calcLineTotal(item);
                const qty  = parseFloat(item.qty) || 1;
                /* Support both unitPrice (admin/online) and price (legacy) */
                const unitP = parseFloat((item as Record<string, string>).unitPrice ?? item.price ?? "0") || 0;
                const disc  = parseFloat(item.discount) || 0;
                return (
                  <div key={item.id ?? idx} className="flex items-start gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0 text-[13px] font-bold text-gray-400">
                      {String(idx + 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-gray-900">{item.productName}</p>
                      {item.sku && <p className="text-[12px] text-gray-400">SKU: {item.sku}</p>}
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        {fmt(unitP, sym, dp)} × {qty}{item.unit ? ` ${item.unit}` : ""}
                        {disc > 0 && (
                          <span className="ml-1.5 text-red-500">
                            −{item.discountType === "pct" ? `${disc}%` : fmt(disc, sym, dp)}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-[13.5px] font-semibold text-gray-900 tabular-nums shrink-0">
                      {fmt(lineAmt, sym, dp)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {sale.notes && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} className="text-gray-400" />
                <h2 className="text-[14px] font-semibold text-gray-900">Notes</h2>
              </div>
              <p className="text-[13.5px] text-gray-600">{sale.notes}</p>
            </div>
          )}
        </div>

        {/* Right: summary + payment + delivery */}
        <div className="space-y-4">
          {/* Totals */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <h2 className="text-[14px] font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="space-y-2 text-[13.5px]">
              <Row label="Subtotal" value={fmt(subtotal, sym, dp)} />
              {invDisc > 0 && (
                <Row
                  label={`Discount${sale.invoiceDiscountType === "pct" ? ` (${invDisc}%)` : ""}`}
                  value={`−${fmt(subtotal - afterInvDisc, sym, dp)}`}
                  valueClass="text-red-600"
                />
              )}
              {taxRate > 0 && <Row label={`VAT (${taxRate}%)`} value={fmt(taxAmt, sym, dp)} />}
              {delivery > 0 && <Row label="Delivery" value={fmt(delivery, sym, dp)} />}
              <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-bold">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900 tabular-nums">{fmt(grand, sym, dp)}</span>
              </div>
              {paid > 0 && <Row label="Paid" value={fmt(paid, sym, dp)} valueClass="text-emerald-600" />}
              {balance > 0.005 && (
                <Row label="Balance due" value={fmt(balance, sym, dp)} valueClass="text-red-600 font-semibold" />
              )}
            </div>
          </div>

          {/* Payment */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={14} className="text-gray-400" />
              <h2 className="text-[14px] font-semibold text-gray-900">Payment</h2>
            </div>
            <Row label="Method" value={sale.paymentMethod || "—"} />
            {sale.paidAt && <Row label="Paid on" value={fmtDate(sale.paidAt)} />}
          </div>

          {/* Delivery */}
          {sale.deliveryStatus && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Truck size={14} className="text-gray-400" />
                <h2 className="text-[14px] font-semibold text-gray-900">Delivery</h2>
              </div>
              <DeliveryBadge status={sale.deliveryStatus} />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`tabular-nums text-gray-900 text-right ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}
