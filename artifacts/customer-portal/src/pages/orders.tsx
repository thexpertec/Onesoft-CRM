import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ShoppingBag, ChevronRight, Search } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { fetchSales, calcSaleTotal, type Sale } from "@/lib/api";
import { fmt, fmtDate } from "@/lib/utils";
import { Layout } from "@/components/layout";
import { StatusBadge, DeliveryBadge } from "@/components/badges";

export default function OrdersPage() {
  const { session, settings } = useAuth();
  const [sales, setSales]     = useState<Sale[]>([]);
  const [busy, setBusy]       = useState(true);
  const [query, setQuery]     = useState("");

  const sym = settings.currencySymbol || "£";
  const dp  = parseInt(settings.decimalPlaces ?? "2") || 2;

  useEffect(() => {
    if (!session) return;
    fetchSales(session.tenantId)
      .then(all => setSales(all.filter(s => s.customer === session.customer.name)))
      .finally(() => setBusy(false));
  }, [session]);

  const sorted = [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const filtered = query.trim()
    ? sorted.filter(s =>
        s.saleNumber.toLowerCase().includes(query.toLowerCase()) ||
        (s.status || "").toLowerCase().includes(query.toLowerCase()) ||
        (s.deliveryStatus || "").toLowerCase().includes(query.toLowerCase())
      )
    : sorted;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">My Orders</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">{sales.length} order{sales.length !== 1 ? "s" : ""} total</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by order number or status…"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-[13.5px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {busy ? (
          <div className="p-8 text-center text-[14px] text-gray-400">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <ShoppingBag size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-[14px] text-gray-500 font-medium">
              {query ? "No orders match your search." : "No orders yet."}
            </p>
            {!query && session?.tenantId && (
              <a
                href={`/tenant-store/${encodeURIComponent(session.tenantId)}/shop`}
                className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold rounded-xl transition-colors"
              >
                <ShoppingBag size={15} />
                Start Shopping
              </a>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Header row */}
            <div className="hidden sm:grid grid-cols-[1fr_110px_110px_90px_32px] gap-4 px-5 py-2.5 text-[12px] font-semibold text-gray-400 uppercase tracking-wide">
              <span>Order</span>
              <span>Status</span>
              <span>Delivery</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            {filtered.map(sale => {
              const total = calcSaleTotal(sale.items, sale.taxRate, sale.deliveryCharges, sale.invoiceDiscount, sale.invoiceDiscountType);
              return (
                <Link key={sale.id} href={`/orders/${sale.id}`}>
                  <div className="grid sm:grid-cols-[1fr_110px_110px_90px_32px] gap-2 sm:gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors items-center">
                    <div>
                      <p className="text-[13.5px] font-semibold text-gray-900">{sale.saleNumber}</p>
                      <p className="text-[12px] text-gray-400 mt-0.5">{fmtDate(sale.saleDate)} · {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex sm:block items-center gap-2">
                      <StatusBadge status={sale.status} />
                    </div>
                    <div>
                      <DeliveryBadge status={sale.deliveryStatus} />
                      {!sale.deliveryStatus && <span className="text-[12px] text-gray-300">—</span>}
                    </div>
                    <p className="text-[13.5px] font-semibold text-gray-900 tabular-nums sm:text-right">
                      {fmt(total, sym, dp)}
                    </p>
                    <ChevronRight size={14} className="text-gray-300 hidden sm:block justify-self-end" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
