import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ShoppingBag, CheckCircle, Clock, TrendingUp, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { fetchSales, calcSaleTotal, type Sale } from "@/lib/api";
import { fmt, fmtDate } from "@/lib/utils";
import { Layout } from "@/components/layout";
import { StatusBadge, DeliveryBadge } from "@/components/badges";

export default function DashboardPage() {
  const { session, settings } = useAuth();
  const [sales, setSales]     = useState<Sale[]>([]);
  const [busy, setBusy]       = useState(true);

  const sym = settings.currencySymbol || "£";
  const dp  = parseInt(settings.decimalPlaces ?? "2") || 2;

  useEffect(() => {
    if (!session) return;
    fetchSales(session.tenantId)
      .then(all => {
        const mine = all.filter(s =>
          (s as Record<string, unknown>).portalCustomerId === session.customer.id ||
          s.customer === session.customer.name
        );
        setSales(mine);
      })
      .finally(() => setBusy(false));
  }, [session]);

  const totalOrders   = sales.length;
  const completedCount = sales.filter(s => s.status === "Completed").length;
  const pendingCount  = sales.filter(s => ["Draft","Confirmed"].includes(s.status)).length;
  const totalSpent    = sales.filter(s => s.status === "Completed")
    .reduce((sum, s) => sum + calcSaleTotal(s.items, s.taxRate, s.deliveryCharges, s.invoiceDiscount, s.invoiceDiscountType), 0);

  const recent = [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <Layout>
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-gray-900">
          Hello, {session?.customer.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-[14px] text-gray-500 mt-0.5">Here's an overview of your account.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total Orders"
          value={String(totalOrders)}
          icon={<ShoppingBag size={17} className="text-blue-600" />}
          bg="bg-blue-50"
          loading={busy}
        />
        <StatCard
          label="Completed"
          value={String(completedCount)}
          icon={<CheckCircle size={17} className="text-emerald-600" />}
          bg="bg-emerald-50"
          loading={busy}
        />
        <StatCard
          label="Pending"
          value={String(pendingCount)}
          icon={<Clock size={17} className="text-amber-600" />}
          bg="bg-amber-50"
          loading={busy}
        />
        <StatCard
          label="Total Spent"
          value={fmt(totalSpent, sym, dp)}
          icon={<TrendingUp size={17} className="text-violet-600" />}
          bg="bg-violet-50"
          loading={busy}
        />
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Recent Orders</h2>
          <Link href="/orders">
            <span className="text-[13px] text-blue-600 hover:underline cursor-pointer flex items-center gap-0.5">
              View all <ChevronRight size={14} />
            </span>
          </Link>
        </div>

        {busy ? (
          <div className="px-5 py-8 text-center text-[14px] text-gray-400">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <ShoppingBag size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-[14px] text-gray-500">No orders yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recent.map(sale => {
              const total = calcSaleTotal(sale.items, sale.taxRate, sale.deliveryCharges, sale.invoiceDiscount, sale.invoiceDiscountType);
              return (
                <Link key={sale.id} href={`/orders/${sale.id}`}>
                  <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-gray-900">{sale.saleNumber}</p>
                      <p className="text-[12px] text-gray-400 mt-0.5">{fmtDate(sale.saleDate)} · {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={sale.status} />
                      <span className="text-[13.5px] font-semibold text-gray-900 tabular-nums min-w-[72px] text-right">
                        {fmt(total, sym, dp)}
                      </span>
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
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

function StatCard({ label, value, icon, bg, loading }: {
  label: string; value: string; icon: React.ReactNode; bg: string; loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      {loading ? (
        <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mb-1" />
      ) : (
        <p className="text-[19px] font-bold text-gray-900 tabular-nums">{value}</p>
      )}
      <p className="text-[12px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
