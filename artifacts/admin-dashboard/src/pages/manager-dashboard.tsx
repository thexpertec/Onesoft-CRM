import { useEffect, useMemo, useState } from "react";
import { format, subDays, isSameDay, parseISO, isValid } from "date-fns";
import {
  TrendingUp, ShoppingCart, Users, Package, Layers, ClipboardList,
  Building2, BarChart3, RefreshCw, Globe, Loader2, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus, Clock, Receipt, Star,
} from "lucide-react";
import {
  AreaChart, Area, BarChart as ReBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
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
  syncAllFromServer,
  type Sale,
} from "@/lib/store";

// ─── helper: read any store data while temporarily pointing to a given tenant ──
function readForTenant<T>(tenantId: string, reader: () => T): T {
  const orig = getActiveTenantId();
  setActiveTenant(tenantId);
  try { return reader(); }
  finally { setActiveTenant(orig); }
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

// sale grand total (matches sales.tsx formula)
function saleTotal(s: Sale): number {
  const items    = s.items ?? [];
  const subtotal = items.reduce((t, i) => t + (parseFloat(i.unitPrice) || 0) * (parseFloat(i.qty) || 0), 0);
  const taxAmt   = subtotal * (parseFloat(s.taxRate ?? "0") || 0) / 100;
  const delivery = parseFloat(s.deliveryCharges ?? "0") || 0;
  return subtotal + taxAmt + delivery;
}

// ─── per-tenant stat bag ───────────────────────────────────────────────────────
type DayPoint   = { date: string; label: string; revenue: number; sales: number };
type StatusItem = { status: string; count: number; color: string };
type RecentSale = { id: string; saleNumber: string; customer: string; total: number; status: string; date: string; tenantName: string; tenantId: string };
type TopProduct = { name: string; revenue: number; qty: number };
type LowStock   = { name: string; qty: number; min: number; sku: string; tenantName: string; tenantId: string };

type TenantStats = {
  tenantId:        string;
  tenantName:      string;
  currency:        string;
  revenue:         number;
  revenueLastMonth: number;
  salesCount:      number;
  salesLastMonth:  number;
  customersCount:  number;
  productsCount:   number;
  stockQty:        number;
  purchasesCount:  number;
  purchaseValue:   number;
  daily30:         DayPoint[];
  salesByStatus:   StatusItem[];
  recentSales:     RecentSale[];
  topProducts:     TopProduct[];
  lowStock:        LowStock[];
};

const STATUS_COLORS: Record<string, string> = {
  "Completed":  "#10b981",
  "On Credit":  "#f59e0b",
  "Pending":    "#3b82f6",
  "Cancelled":  "#ef4444",
  "Refunded":   "#8b5cf6",
  "Processing": "#06b6d4",
};

function computeStats(tenantId: string, tenantName: string): TenantStats {
  return readForTenant(tenantId, () => {
    const settings   = getSettings();
    const currency   = settings.currency || "USD";
    const sales      = getSales();
    const now        = new Date();
    const thisMonth  = now.getMonth();
    const thisYear   = now.getFullYear();
    const lastMonth  = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastYear   = thisMonth === 0 ? thisYear - 1 : thisYear;

    const completed  = sales.filter(s => s.status === "Completed");

    // Revenue helpers
    function calcRevenue(list: Sale[]) {
      return list.reduce((sum, s) => sum + saleTotal(s), 0);
    }

    const completedThis  = completed.filter(s => {
      const d = parseISO(s.saleDate);
      return isValid(d) && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const completedLast  = completed.filter(s => {
      const d = parseISO(s.saleDate);
      return isValid(d) && d.getMonth() === lastMonth && d.getFullYear() === lastYear;
    });
    const salesThis  = sales.filter(s => {
      const d = parseISO(s.saleDate);
      return isValid(d) && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const salesLast  = sales.filter(s => {
      const d = parseISO(s.saleDate);
      return isValid(d) && d.getMonth() === lastMonth && d.getFullYear() === lastYear;
    });

    // Last 30 days daily revenue
    const daily30: DayPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = subDays(now, i);
      const daySales = completed.filter(s => {
        const d = parseISO(s.saleDate);
        return isValid(d) && isSameDay(d, day);
      });
      daily30.push({
        date:    day.toISOString().split("T")[0],
        label:   format(day, "d MMM"),
        revenue: calcRevenue(daySales),
        sales:   daySales.length,
      });
    }

    // Sales by status
    const statusMap: Record<string, number> = {};
    for (const s of sales) {
      statusMap[s.status] = (statusMap[s.status] ?? 0) + 1;
    }
    const salesByStatus: StatusItem[] = Object.entries(statusMap)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count, color: STATUS_COLORS[status] ?? "#6b7280" }));

    // Recent sales (last 8, any status)
    const recentSales: RecentSale[] = [...sales]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
      .map(s => ({
        id: s.id,
        saleNumber: s.saleNumber,
        customer: s.customer || s.onlineCustomer || "—",
        total: saleTotal(s),
        status: s.status,
        date: s.saleDate,
        tenantName,
        tenantId,
      }));

    // Top 5 products by revenue (from sale items)
    const productRevMap: Record<string, { revenue: number; qty: number }> = {};
    for (const s of completed) {
      for (const item of (s.items ?? [])) {
        const name = item.productName || "Unknown";
        const rev  = (parseFloat(item.unitPrice) || 0) * (parseFloat(item.qty) || 0);
        const qty  = parseFloat(item.qty) || 0;
        if (!productRevMap[name]) productRevMap[name] = { revenue: 0, qty: 0 };
        productRevMap[name].revenue += rev;
        productRevMap[name].qty     += qty;
      }
    }
    const topProducts: TopProduct[] = Object.entries(productRevMap)
      .map(([name, v]) => ({ name, revenue: v.revenue, qty: v.qty }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Low stock (qty <= minLevel, minLevel > 0)
    const stock = getStock();
    const lowStock: LowStock[] = stock
      .filter(s => {
        const qty = parseFloat(s.quantity) || 0;
        const min = parseFloat(s.minLevel) || 0;
        return min > 0 && qty <= min;
      })
      .map(s => ({
        name: s.productName,
        qty:  parseFloat(s.quantity) || 0,
        min:  parseFloat(s.minLevel) || 0,
        sku:  s.sku || "",
        tenantName,
        tenantId,
      }))
      .slice(0, 10);

    const customers = getCustomers();
    const products  = getProducts();
    const stockQty  = stock.reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);
    const purchases = getPurchaseOrders();
    const purchaseValue = purchases.reduce((sum, po) => {
      const poTotal = (po.items ?? []).reduce((t, i) =>
        t + (parseFloat(i.unitPrice) || 0) * (parseFloat(i.qty) || 0), 0);
      return sum + poTotal;
    }, 0);

    return {
      tenantId, tenantName, currency,
      revenue:          calcRevenue(completed),
      revenueLastMonth: calcRevenue(completedLast),
      salesCount:       completed.length,
      salesLastMonth:   salesLast.length,
      customersCount:   customers.length,
      productsCount:    products.length,
      stockQty,
      purchasesCount:   purchases.length,
      purchaseValue,
      daily30, salesByStatus, recentSales, topProducts, lowStock,
    };
  });
}

// ─── growth badge ──────────────────────────────────────────────────────────────
function GrowthBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
      <ArrowUpRight size={10} /> New
    </span>
  );
  const pct = ((current - previous) / previous) * 100;
  const up  = pct >= 0;
  const Icon = pct === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
      pct === 0
        ? "bg-gray-50 dark:bg-zinc-800 text-gray-400"
        : up
        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
        : "bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400"
    }`}>
      <Icon size={10} />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
type MetricCardProps = {
  label: string; value: string; sub?: string; badge?: React.ReactNode;
  icon: React.ReactNode; color: string; textColor: string;
};
function MetricCard({ label, value, sub, badge, icon, color, textColor }: MetricCardProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
          {badge}
        </div>
        <p className={`text-[22px] font-extrabold leading-none ${textColor} dark:text-white`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTip({ active, payload, label, currency }: { active?: boolean; payload?: { value: number }[]; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 rounded-xl shadow-lg px-3 py-2 text-[12px]">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-gray-500 dark:text-gray-400">{sym(currency)}{fmtNum(p.value)}</p>
      ))}
    </div>
  );
}

// ─── Tenant color palette ──────────────────────────────────────────────────────
const TENANT_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"];

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { currentUser, assignedTenants } = useAuth();
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(true);

  const allTenants = useMemo(() => getTenants(), [refreshKey, syncing]);
  const myTenants  = useMemo(
    () => allTenants.filter(t => assignedTenants.includes(t.id)),
    [allTenants, assignedTenants],
  );

  // Fetch all assigned tenant data from server
  useEffect(() => {
    if (assignedTenants.length === 0) { setSyncing(false); return; }
    setSyncing(true);
    Promise.all(assignedTenants.map(id => syncAllFromServer(id)))
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [assignedTenants.join(","), refreshKey]);

  // Compute per-tenant stats after sync
  const allStats: TenantStats[] = useMemo(
    () => syncing ? [] : myTenants.map(t => computeStats(t.id, t.name)),
    [myTenants, refreshKey, syncing],
  );

  // Active stats (aggregate or single tenant)
  const displayed: TenantStats | null = useMemo(() => {
    if (allStats.length === 0) return null;
    if (selectedTenant !== "all") {
      return allStats.find(s => s.tenantId === selectedTenant) ?? null;
    }
    const first = allStats[0];

    // Merge daily30 across all tenants
    const mergedDaily: DayPoint[] = (first.daily30 ?? []).map((d, i) => ({
      date:    d.date,
      label:   d.label,
      revenue: allStats.reduce((s, t) => s + (t.daily30[i]?.revenue ?? 0), 0),
      sales:   allStats.reduce((s, t) => s + (t.daily30[i]?.sales   ?? 0), 0),
    }));

    // Merge salesByStatus
    const statusMap: Record<string, StatusItem> = {};
    for (const t of allStats) {
      for (const s of t.salesByStatus) {
        if (!statusMap[s.status]) statusMap[s.status] = { status: s.status, count: 0, color: s.color };
        statusMap[s.status].count += s.count;
      }
    }

    // Merge recent sales (latest 8 across all tenants)
    const mergedRecent = allStats
      .flatMap(t => t.recentSales)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);

    // Merge top products
    const prodMap: Record<string, TopProduct> = {};
    for (const t of allStats) {
      for (const p of t.topProducts) {
        if (!prodMap[p.name]) prodMap[p.name] = { name: p.name, revenue: 0, qty: 0 };
        prodMap[p.name].revenue += p.revenue;
        prodMap[p.name].qty     += p.qty;
      }
    }
    const mergedTopProducts = Object.values(prodMap)
      .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // Merge low stock
    const mergedLowStock = allStats.flatMap(t => t.lowStock)
      .sort((a, b) => (a.qty - a.min) - (b.qty - b.min)).slice(0, 10);

    return {
      tenantId:         "all",
      tenantName:       "All Tenants",
      currency:         first.currency,
      revenue:          allStats.reduce((s, t) => s + t.revenue, 0),
      revenueLastMonth: allStats.reduce((s, t) => s + t.revenueLastMonth, 0),
      salesCount:       allStats.reduce((s, t) => s + t.salesCount, 0),
      salesLastMonth:   allStats.reduce((s, t) => s + t.salesLastMonth, 0),
      customersCount:   allStats.reduce((s, t) => s + t.customersCount, 0),
      productsCount:    allStats.reduce((s, t) => s + t.productsCount, 0),
      stockQty:         allStats.reduce((s, t) => s + t.stockQty, 0),
      purchasesCount:   allStats.reduce((s, t) => s + t.purchasesCount, 0),
      purchaseValue:    allStats.reduce((s, t) => s + t.purchaseValue, 0),
      daily30:          mergedDaily,
      salesByStatus:    Object.values(statusMap).sort((a, b) => b.count - a.count),
      recentSales:      mergedRecent,
      topProducts:      mergedTopProducts,
      lowStock:         mergedLowStock,
    };
  }, [allStats, selectedTenant]);

  // Data for tenant comparison bar chart
  const tenantBarData = useMemo(() =>
    allStats.map((s, i) => ({
      name:     s.tenantName.length > 12 ? s.tenantName.slice(0, 12) + "…" : s.tenantName,
      fullName: s.tenantName,
      revenue:  s.revenue,
      sales:    s.salesCount,
      customers: s.customersCount,
      color:    TENANT_COLORS[i % TENANT_COLORS.length],
    })),
    [allStats],
  );

  const firstName = (currentUser?.fullName || currentUser?.username || "Manager").split(" ")[0];
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const totalRevenue = displayed?.revenue ?? 0;

  if (!syncing && myTenants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
          <Building2 size={28} className="text-indigo-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">No businesses assigned yet</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
          Ask your superadmin to assign businesses to your account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-gray-400 dark:text-gray-500">{greeting},</p>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white leading-tight">{firstName}</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
            <Globe size={11} /> Managing {myTenants.length} business{myTenants.length !== 1 ? "es" : ""}
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={syncing}
          className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing
            ? <><Loader2 size={13} className="animate-spin" /> Loading…</>
            : <><RefreshCw size={13} /> Refresh</>}
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
        >All Businesses</button>
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
            <Building2 size={12} />{t.name}
          </button>
        ))}
      </div>

      {/* ── Loading skeleton ── */}
      {syncing && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 flex items-start gap-4 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-2.5 bg-gray-100 dark:bg-zinc-800 rounded animate-pulse w-3/4" />
                  <div className="h-6 bg-gray-100 dark:bg-zinc-800 rounded animate-pulse w-1/2" />
                  <div className="h-2 bg-gray-100 dark:bg-zinc-800 rounded animate-pulse w-full" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-64 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 animate-pulse" />
        </div>
      )}

      {!syncing && displayed && (<>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Total Revenue"
            value={fmtMoney(displayed.revenue, displayed.currency)}
            sub={`${displayed.salesCount} completed sale${displayed.salesCount !== 1 ? "s" : ""}`}
            badge={<GrowthBadge current={displayed.revenue} previous={displayed.revenueLastMonth} />}
            icon={<TrendingUp size={20} className="text-emerald-600" />}
            color="bg-emerald-50 dark:bg-emerald-950/40" textColor="text-emerald-700"
          />
          <MetricCard
            label="Total Sales"
            value={displayed.salesCount.toLocaleString()}
            sub="Completed transactions"
            badge={<GrowthBadge current={displayed.salesCount} previous={displayed.salesLastMonth} />}
            icon={<ShoppingCart size={20} className="text-blue-600" />}
            color="bg-blue-50 dark:bg-blue-950/40" textColor="text-blue-700"
          />
          <MetricCard
            label="Customers"
            value={displayed.customersCount.toLocaleString()}
            sub="Registered in CRM"
            icon={<Users size={20} className="text-violet-600" />}
            color="bg-violet-50 dark:bg-violet-950/40" textColor="text-violet-700"
          />
          <MetricCard
            label="Products"
            value={displayed.productsCount.toLocaleString()}
            sub="In product catalogue"
            icon={<Package size={20} className="text-amber-600" />}
            color="bg-amber-50 dark:bg-amber-950/40" textColor="text-amber-700"
          />
          <MetricCard
            label="Stock Items"
            value={fmtNum(displayed.stockQty)}
            sub="Total units in inventory"
            icon={<Layers size={20} className="text-cyan-600" />}
            color="bg-cyan-50 dark:bg-cyan-950/40" textColor="text-cyan-700"
          />
          <MetricCard
            label="Purchase Orders"
            value={displayed.purchasesCount.toLocaleString()}
            sub={`${fmtMoney(displayed.purchaseValue, displayed.currency)} total value`}
            icon={<ClipboardList size={20} className="text-rose-600" />}
            color="bg-rose-50 dark:bg-rose-950/40" textColor="text-rose-700"
          />
        </div>

        {/* ── Revenue trend + Sales status ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Revenue trend area chart */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[13px] font-bold text-gray-800 dark:text-white">Revenue Trend</h2>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">Last 30 days</p>
              </div>
              <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400">
                {fmtMoney(totalRevenue, displayed.currency)}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={displayed.daily30} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="mgRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" strokeOpacity={0.6} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={5} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                  tickFormatter={v => sym(displayed.currency) + fmtNum(v)} />
                <ReTooltip content={(p) => <ChartTip active={p.active} payload={p.payload as { value: number }[]} label={p.label} currency={displayed.currency} />} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2}
                  fill="url(#mgRevGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Sales status breakdown */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 shadow-sm">
            <h2 className="text-[13px] font-bold text-gray-800 dark:text-white mb-1">Sales Status</h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4">
              {displayed.salesByStatus.reduce((s, x) => s + x.count, 0)} total orders
            </p>
            <div className="space-y-3">
              {displayed.salesByStatus.length === 0 && (
                <p className="text-[12px] text-gray-400 dark:text-gray-500 py-6 text-center">No sales yet</p>
              )}
              {displayed.salesByStatus.map(s => {
                const total = displayed.salesByStatus.reduce((acc, x) => acc + x.count, 0);
                const pct   = total > 0 ? (s.count / total) * 100 : 0;
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        {s.status}
                      </span>
                      <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200">{s.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: s.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Tenant comparison (only for All Tenants with 2+ tenants) ── */}
        {selectedTenant === "all" && allStats.length >= 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Revenue by tenant bar chart */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 shadow-sm">
              <h2 className="text-[13px] font-bold text-gray-800 dark:text-white mb-1">Revenue by Business</h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4">Completed sales</p>
              <ResponsiveContainer width="100%" height={160}>
                <ReBarChart data={tenantBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" strokeOpacity={0.6} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                    tickFormatter={v => sym(displayed.currency) + fmtNum(v)} />
                  <ReTooltip
                    formatter={(v: number) => [fmtMoney(v, displayed.currency), "Revenue"]}
                    contentStyle={{ fontSize: 12, borderRadius: 10 }}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {tenantBarData.map((d, i) => (
                      <Cell key={i} fill={d.color} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </ReBarChart>
              </ResponsiveContainer>
            </div>

            {/* Customers & Sales by tenant */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 shadow-sm">
              <h2 className="text-[13px] font-bold text-gray-800 dark:text-white mb-1">Customers vs Sales</h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4">Per business</p>
              <ResponsiveContainer width="100%" height={160}>
                <ReBarChart data={tenantBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" strokeOpacity={0.6} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="customers" name="Customers" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} fillOpacity={0.85} />
                  <Bar dataKey="sales"     name="Sales"     fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} fillOpacity={0.85} />
                </ReBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Top Products + Low Stock ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Top products by revenue */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Star size={14} className="text-amber-500" />
              <h2 className="text-[13px] font-bold text-gray-800 dark:text-white">Top Products by Revenue</h2>
            </div>
            {displayed.topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-300 dark:text-zinc-700 gap-2">
                <Package size={24} strokeWidth={1.5} />
                <p className="text-[12px] text-gray-400 dark:text-gray-500">No completed sales yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayed.topProducts.map((p, i) => {
                  const maxRev = displayed.topProducts[0].revenue;
                  const pct    = maxRev > 0 ? (p.revenue / maxRev) * 100 : 0;
                  return (
                    <div key={p.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${
                            i === 0 ? "bg-amber-400" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-700" : "bg-gray-300"
                          }`}>{i + 1}</span>
                          <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{p.name}</span>
                        </div>
                        <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                          {fmtMoney(p.revenue, displayed.currency)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{fmtNum(p.qty)} units sold</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Low stock alerts */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={14} className={displayed.lowStock.length > 0 ? "text-red-500" : "text-gray-400"} />
              <h2 className="text-[13px] font-bold text-gray-800 dark:text-white">
                Low Stock Alerts
                {displayed.lowStock.length > 0 && (
                  <span className="ml-2 text-[10px] font-bold bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                    {displayed.lowStock.length}
                  </span>
                )}
              </h2>
            </div>
            {displayed.lowStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-300 dark:text-zinc-700 gap-2">
                <Layers size={24} strokeWidth={1.5} />
                <p className="text-[12px] text-emerald-500 dark:text-emerald-400 font-medium">All stock levels are healthy</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {displayed.lowStock.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                    <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                      <AlertTriangle size={14} className="text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {item.qty} left · Min {item.min}
                        {selectedTenant === "all" && <span className="ml-1 text-indigo-500">· {item.tenantName}</span>}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-red-600 dark:text-red-400 shrink-0">{item.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Recent transactions ── */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-5 pb-3">
            <Clock size={14} className="text-gray-400" />
            <h2 className="text-[13px] font-bold text-gray-800 dark:text-white">Recent Transactions</h2>
          </div>
          {displayed.recentSales.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-gray-300 dark:text-zinc-700">
              <Receipt size={24} strokeWidth={1.5} />
              <p className="text-[12px] text-gray-400 dark:text-gray-500">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800/60 border-y border-gray-100 dark:border-zinc-800">
                    <th className="text-left px-5 py-2.5 font-semibold text-gray-500 dark:text-gray-400">Ref</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400">Customer</th>
                    {selectedTenant === "all" && (
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400">Business</th>
                    )}
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400">Status</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400">Amount</th>
                    <th className="text-right px-5 py-2.5 font-semibold text-gray-500 dark:text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.recentSales.map((s, i) => (
                    <tr key={s.id}
                      className={`border-b border-gray-50 dark:border-zinc-800/50 ${i % 2 === 0 ? "" : "bg-gray-50/30 dark:bg-zinc-800/10"}`}
                    >
                      <td className="px-5 py-3 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">{s.saleNumber}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[140px] truncate">{s.customer}</td>
                      {selectedTenant === "all" && (
                        <td className="px-4 py-3">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-medium">{s.tenantName}</span>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{
                          background: (STATUS_COLORS[s.status] ?? "#6b7280") + "22",
                          color: STATUS_COLORS[s.status] ?? "#6b7280",
                        }}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800 dark:text-gray-100">
                        {fmtMoney(s.total, displayed.currency)}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-400 dark:text-gray-500 text-[11px]">
                        {s.date ? format(parseISO(s.date), "d MMM yyyy") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Per-tenant breakdown table (2+ tenants, All view) ── */}
        {selectedTenant === "all" && allStats.length >= 2 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={15} className="text-gray-400" />
              <h2 className="text-[13px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Per-Business Summary</h2>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-100 dark:border-zinc-800">
                      <th className="text-left px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 w-40">Business</th>
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
                        <td className="px-5 py-3 font-semibold text-gray-800 dark:text-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: TENANT_COLORS[i % TENANT_COLORS.length] + "22" }}>
                              <Building2 size={11} style={{ color: TENANT_COLORS[i % TENANT_COLORS.length] }} />
                            </div>
                            <span className="truncate max-w-[130px]">{s.tenantName}</span>
                          </div>
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

      </>)}
    </div>
  );
}
