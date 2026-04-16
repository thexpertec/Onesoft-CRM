import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { ChevronLeft, Package, Truck, CreditCard, FileText } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { fetchSales, calcLineTotal, calcSaleTotal, type Sale } from "@/lib/api";
import { fmt, fmtDate } from "@/lib/utils";
import { Layout } from "@/components/layout";
import { StatusBadge, DeliveryBadge } from "@/components/badges";

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
        const found = all.find(s => s.id === params.id && s.customer === session.customer.name);
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
  const taxRate  = parseFloat(sale.taxRate) || 0;
  const taxAmt   = subtotal * (taxRate / 100);
  const delivery = parseFloat(sale.deliveryCharges ?? "0") || 0;
  const invDisc  = parseFloat(sale.invoiceDiscount ?? "0") || 0;
  let afterInvDisc = subtotal;
  if (invDisc > 0) {
    afterInvDisc = sale.invoiceDiscountType === "pct"
      ? subtotal * (1 - invDisc / 100)
      : Math.max(0, subtotal - invDisc);
  }
  const grand = afterInvDisc * (1 + taxRate / 100) + delivery;
  const paid  = parseFloat(sale.amountPaid) || 0;
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
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-bold text-gray-900">{sale.saleNumber}</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">{fmtDate(sale.saleDate)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={sale.status} />
          {sale.deliveryStatus && <DeliveryBadge status={sale.deliveryStatus} />}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Package size={15} className="text-gray-400" />
              <h2 className="text-[14px] font-semibold text-gray-900">Order Items</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {sale.items.map((item, idx) => {
                const lineTotal = calcLineTotal(item);
                const qty = parseFloat(item.qty) || 1;
                const price = parseFloat(item.price) || 0;
                const disc = parseFloat(item.discount) || 0;
                return (
                  <div key={item.id ?? idx} className="flex items-start gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0 text-[13px] font-bold text-gray-400">
                      {String(idx + 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-gray-900">{item.productName}</p>
                      {item.sku && <p className="text-[12px] text-gray-400">SKU: {item.sku}</p>}
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        {fmt(price, sym, dp)} × {qty}{item.unit ? ` ${item.unit}` : ""}
                        {disc > 0 && (
                          <span className="ml-1.5 text-red-500">
                            −{item.discountType === "pct" ? `${disc}%` : fmt(disc, sym, dp)}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-[13.5px] font-semibold text-gray-900 tabular-nums shrink-0">{fmt(lineTotal, sym, dp)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
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

        {/* Side: totals + payment + delivery */}
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
              {balance > 0.005 && <Row label="Balance due" value={fmt(balance, sym, dp)} valueClass="text-red-600 font-semibold" />}
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
