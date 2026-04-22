import { useMemo, useState } from "react";
import {
  TrendingUp, ShoppingCart, Users, Package, Layers, ClipboardList,
  Building2, BarChart3, RefreshCw, Globe,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  getActiveTenantId, setActiveTenant,
  getTenants,
  getSales,
  getCustomers,
  getProducts,
  getStock,
  getPurchaseOrders,
  getSettings,
} from "@/lib/store";

// ─── helper: read any store data while temporarily pointing to a given tenant ──
function readForTenant<T>(tenantId: string, reader: () => T): T {
  const orig = getActiveTenantId();
  setActiveTenant(tenantId);
  try { return reader(); }
  finally { setActiveTenant(orig); }
}

// ─── per-tenant stat bag ───────────────────────────────────────────────────────
type TenantStats = {
  tenantId:        string;
  tenantName:      string;
  currency:        string;
  revenue:         number;
  salesCount:      number;
  customersCount:  number;
  productsCount:   number;
  stockQty:        number;
  purchasesCount:  number;
  purchaseValue:   number;
};

function computeStats(tenantId: string, tenantName: string): TenantStats {
  return readForTenant(tenantId, () => {
    const settings = getSettings();
    const currency  = settings.currency || "USD";

    const sales     = getSales();
    const completed = sales.filter(s => s.status === "Completed");
    const revenue   = completed.reduce((sum, s) => {
      const items     = s.items ?? [];
      const subtotal  = items.reduce((t, i) => t + (parseFloat(i.unitPrice) || 0) * (parseFloat(i.qty) || 0), 0);
      const taxAmt    = subtotal * (parseFloat(s.taxRate ?? "0") || 0) / 100;
      const delivery  = parseFloat(s.deliveryCharges ?? "0") || 0;
      return sum + subtotal + taxAmt + delivery;
    }, 0);

    const customers      = getCustomers();
    const products       = getProducts();
    const stock          = getStock();
    const stockQty       = stock.reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);
    const purchases      = getPurchaseOrders();
    const purchaseValue  = purchases.reduce((sum, po) => {
      const poTotal = (po.items ?? []).reduce((t, i) =>
        t + (parseFloat(i.unitPrice) || 0) * (parseFloat(i.qty) || 0), 0);
      return sum + poTotal;
    }, 0);

    return {
      tenantId,
      tenantName,
      currency,
      revenue,
      salesCount:     completed.length,
      customersCount: customers.length,
      productsCount:  products.length,
      stockQty,
      purchasesCount: purchases.length,
      purchaseValue,
    };
  });
}

// ─── currency symbol helper ────────────────────────────────────────────────────
const SYM: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", AED: "AED ", SAR: "SAR ", PKR: "Rs ",
  INR: "₹", MYR: "RM ", NGN: "₦", BDT: "৳",
};
function sym(c: string) { return SYM[c] ?? (c + " "); }
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtMoney(amount: number, currency: string) {
  return sym(currency) + fmtNum(amount);
}

// ─── Card component ────────────────────────────────────────────────────────────
type MetricCardProps = {
  label:    string;
  value:    string;
  sub?:     string;
  icon:     React.ReactNode;
  color:    string;   // tailwind bg class for icon wrapper
  textColor: string;  // tailwind text class for value
};

function MetricCard({ label, value, sub, icon, color, textColor }: MetricCardProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">{label}</p>
        <p className={`text-[22px] font-extrabold leading-none ${textColor} dark:text-white`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { currentUser, assignedTenants } = useAuth();
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  // Load tenant metadata
  const allTenants = useMemo(() => getTenants(), [refreshKey]);
  const myTenants  = useMemo(
    () => allTenants.filter(t => assignedTenants.includes(t.id)),
    [allTenants, assignedTenants],
  );

  // Compute stats for each assigned tenant
  const allStats: TenantStats[] = useMemo(
    () => myTenants.map(t => computeStats(t.id, t.name)),
    [myTenants, refreshKey],
  );

  // Aggregate or single-tenant stats
  const displayed: TenantStats | null = useMemo(() => {
    if (allStats.length === 0) return null;
    if (selectedTenant !== "all") {
      return allStats.find(s => s.tenantId === selectedTenant) ?? null;
    }
    // Aggregate
    const first = allStats[0];
    return {
      tenantId:       "all",
      tenantName:     "All Tenants",
      currency:       first.currency,
      revenue:        allStats.reduce((s, t) => s + t.revenue, 0),
      salesCount:     allStats.reduce((s, t) => s + t.salesCount, 0),
      customersCount: allStats.reduce((s, t) => s + t.customersCount, 0),
      productsCount:  allStats.reduce((s, t) => s + t.productsCount, 0),
      stockQty:       allStats.reduce((s, t) => s + t.stockQty, 0),
      purchasesCount: allStats.reduce((s, t) => s + t.purchasesCount, 0),
      purchaseValue:  allStats.reduce((s, t) => s + t.purchaseValue, 0),
    };
  }, [allStats, selectedTenant]);

  const firstName = (currentUser?.fullName || currentUser?.username || "Manager").split(" ")[0];
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (myTenants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
          <Building2 size={28} className="text-indigo-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">No tenants assigned yet</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
          Ask your superadmin to assign tenants to your account so your dashboard can display data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-gray-400 dark:text-gray-500">{greeting},</p>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white leading-tight">{firstName}</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
            <Globe size={11} /> Managing {myTenants.length} tenant{myTenants.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── Tenant selector tabs ── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedTenant("all")}
          className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-all ${
            selectedTenant === "all"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
          }`}
        >
          All Tenants
        </button>
        {myTenants.map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedTenant(t.id)}
            className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-1.5 ${
              selectedTenant === t.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
            }`}
          >
            <Building2 size={12} />
            {t.name}
          </button>
        ))}
      </div>

      {/* ── Metric cards ── */}
      {displayed && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-4">
            <MetricCard
              label="Total Revenue"
              value={fmtMoney(displayed.revenue, displayed.currency)}
              sub={`${displayed.salesCount} completed sale${displayed.salesCount !== 1 ? "s" : ""}`}
              icon={<TrendingUp size={20} className="text-emerald-600" />}
              color="bg-emerald-50 dark:bg-emerald-950/40"
              textColor="text-emerald-700"
            />
            <MetricCard
              label="Total Sales"
              value={displayed.salesCount.toLocaleString()}
              sub="Completed transactions"
              icon={<ShoppingCart size={20} className="text-blue-600" />}
              color="bg-blue-50 dark:bg-blue-950/40"
              textColor="text-blue-700"
            />
            <MetricCard
              label="Customers"
              value={displayed.customersCount.toLocaleString()}
              sub="Registered in CRM"
              icon={<Users size={20} className="text-violet-600" />}
              color="bg-violet-50 dark:bg-violet-950/40"
              textColor="text-violet-700"
            />
            <MetricCard
              label="Products"
              value={displayed.productsCount.toLocaleString()}
              sub="In product catalogue"
              icon={<Package size={20} className="text-amber-600" />}
              color="bg-amber-50 dark:bg-amber-950/40"
              textColor="text-amber-700"
            />
            <MetricCard
              label="Stock Items"
              value={fmtNum(displayed.stockQty)}
              sub="Total units in inventory"
              icon={<Layers size={20} className="text-cyan-600" />}
              color="bg-cyan-50 dark:bg-cyan-950/40"
              textColor="text-cyan-700"
            />
            <MetricCard
              label="Purchase Orders"
              value={displayed.purchasesCount.toLocaleString()}
              sub={`${fmtMoney(displayed.purchaseValue, displayed.currency)} total value`}
              icon={<ClipboardList size={20} className="text-rose-600" />}
              color="bg-rose-50 dark:bg-rose-950/40"
              textColor="text-rose-700"
            />
          </div>

          {/* ── Per-tenant breakdown table (only when "All" is selected and there are 2+ tenants) ── */}
          {selectedTenant === "all" && allStats.length > 1 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={15} className="text-gray-400" />
                <h2 className="text-[13px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Per-Tenant Breakdown</h2>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-100 dark:border-zinc-800">
                        <th className="text-left px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 w-40">Tenant</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Revenue</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Sales</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Customers</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Products</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Stock Qty</th>
                        <th className="text-right px-5 py-3 font-semibold text-gray-500 dark:text-gray-400">Purchase Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allStats.map((s, i) => (
                        <tr
                          key={s.tenantId}
                          className={`border-b border-gray-50 dark:border-zinc-800/50 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-zinc-800/20"}`}
                          onClick={() => setSelectedTenant(s.tenantId)}
                        >
                          <td className="px-5 py-3 font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                              <Building2 size={11} className="text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="truncate max-w-[130px]">{s.tenantName}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoney(s.revenue, s.currency)}</td>
                          <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{s.salesCount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{s.customersCount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{s.productsCount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmtNum(s.stockQty)}</td>
                          <td className="px-5 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{fmtMoney(s.purchaseValue, s.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-zinc-800/60 border-t border-gray-100 dark:border-zinc-700 font-bold">
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-200">Total</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-700 dark:text-emerald-400">{fmtMoney(displayed.revenue, displayed.currency)}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{displayed.salesCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{displayed.customersCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{displayed.productsCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{fmtNum(displayed.stockQty)}</td>
                        <td className="px-5 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{fmtMoney(displayed.purchaseValue, displayed.currency)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
