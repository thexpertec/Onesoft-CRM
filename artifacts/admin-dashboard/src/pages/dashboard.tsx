import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useLeads, useDocs, useCustomers, useSales, useStock, useStaff, useProducts, usePurchaseOrders, useInvoices } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { getAdminUsers, getSettings } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isYesterday, formatDistanceToNow, startOfWeek, startOfMonth, subDays, isSameDay, subWeeks, addWeeks } from "date-fns";
import {
  Users, FileText, TrendingUp, PoundSterling, Plus, ArrowRight,
  Target, CheckCircle2, Building2, MapPin, Layers, UserPlus, UserCheck,
  ShoppingCart, Package, Boxes, Receipt, AlertTriangle, Users2,
  ArrowUpRight, ArrowDownRight, Truck, BarChart3, CreditCard,
  Banknote, Wifi, WifiOff, Tag, Shield, Settings, Clock,
} from "lucide-react";
import { CURRENCIES, fmtMoneyCompact, fmtMoney, getSettingsCurrencySymbol } from "@/lib/currencies";
import {
  AreaChart, Area, BarChart as ReBarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";

// ─── Types & helpers ──────────────────────────────────────────────────────────
const fmtCurrency = fmtMoneyCompact;
function relativeDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d))     return formatDistanceToNow(d, { addSuffix: true });
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}
function saleItemTotal(items: { qty: string; unitPrice: string; discount: string }[]) {
  return items.reduce((s, it) => {
    const qty = parseFloat(it.qty) || 0;
    const price = parseFloat(it.unitPrice) || 0;
    const disc  = parseFloat(it.discount) || 0;
    return s + qty * price * (1 - disc / 100);
  }, 0);
}

// ─── Lead status meta ─────────────────────────────────────────────────────────
const LEAD_STATUS_META: Record<string, { bg: string; dot: string }> = {
  New:                  { bg: "bg-blue-500",    dot: "bg-blue-500"    },
  Contacted:            { bg: "bg-indigo-400",  dot: "bg-indigo-400"  },
  "Meeting Scheduled":  { bg: "bg-sky-500",     dot: "bg-sky-500"     },
  "Demo Completed":     { bg: "bg-cyan-500",    dot: "bg-cyan-500"    },
  Qualified:            { bg: "bg-teal-500",    dot: "bg-teal-500"    },
  "Proposal Sent":      { bg: "bg-amber-400",   dot: "bg-amber-400"   },
  Negotiation:          { bg: "bg-orange-500",  dot: "bg-orange-500"  },
  Won:                  { bg: "bg-emerald-500", dot: "bg-emerald-500" },
  Lost:                 { bg: "bg-red-400",     dot: "bg-red-400"     },
};
const LEAD_STATUS_ORDER = ["New", "Contacted", "Meeting Scheduled", "Demo Completed", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"] as const;

const LEAD_BADGE: Record<string, string> = {
  New:                  "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
  Contacted:            "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
  "Meeting Scheduled":  "bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300",
  "Demo Completed":     "bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300",
  Qualified:            "bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300",
  "Proposal Sent":      "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  Negotiation:          "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300",
  Won:                  "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  Lost:                 "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300",
};

// ─── Quick-add customer schema ────────────────────────────────────────────────
const quickCustomerSchema = z.object({
  name:       z.string().min(2, "Name is required"),
  company:    z.string().min(1, "Company is required"),
  email:      z.union([z.string().email("Invalid email"), z.literal("")]),
  phone:      z.string().optional(),
  status:     z.enum(["Active", "Inactive", "Churned"]),
  currency:   z.string(),
  totalValue: z.string().optional(),
  notes:      z.string().optional(),
});
type QuickCustomerValues = z.infer<typeof quickCustomerSchema>;

// ─── Sub-components ───────────────────────────────────────────────────────────

// Gradient KPI card
function KpiCard({
  icon: Icon, label, value, sub, sub2, gradient, iconBg, delta, testId, href,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: React.ReactNode; sub2?: string;
  gradient: string; iconBg: string; delta?: { val: number; label: string };
  testId?: string;
  href?: string;
}) {
  const card = (
    <Card
      className={`relative overflow-hidden border-0 shadow-sm ${gradient} ${href ? "cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]" : ""}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
            <p className="text-[28px] font-bold mt-1 text-white leading-none" data-testid={testId}>{value}</p>
            {sub  && <p className="text-[11px] text-white/70 mt-1.5">{sub}</p>}
            {sub2 && <p className="text-[11px] text-white/60 mt-0.5">{sub2}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
        {delta !== undefined && (
          <div className="mt-3 flex items-center gap-1">
            {delta.val >= 0
              ? <ArrowUpRight size={13} className="text-white/80" />
              : <ArrowDownRight size={13} className="text-white/80" />}
            <span className="text-[11px] text-white/80">{Math.abs(delta.val)}% {delta.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

// Mini sparkline bar chart — last 7 days
function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[3px] h-14">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col justify-end">
          <div
            className={`rounded-t ${i === data.length - 1 ? "bg-blue-500" : "bg-blue-200 dark:bg-blue-800"}`}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            title={`${getSettingsCurrencySymbol()}${v.toFixed(0)}`}
          />
        </div>
      ))}
    </div>
  );
}

// Horizontal bar stat
function HBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium truncate">{label}</span>
        <span className="text-muted-foreground ml-2 tabular-nums">{count} · {pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Quick-access module tile
function QuickTile({
  href, icon: Icon, label, count, sub, color, testId,
}: {
  href: string; icon: React.ElementType; label: string;
  count: number | string; sub?: string; color: string; testId?: string;
}) {
  return (
    <Link href={href}>
      <div
        data-testid={testId}
        className="group flex flex-col gap-2 p-4 rounded-xl border border-gray-100 dark:border-border bg-white dark:bg-card hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-md transition-all cursor-pointer"
      >
        <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
          <Icon size={17} className="text-white" />
        </div>
        <div>
          <p className="text-[22px] font-bold text-gray-800 dark:text-foreground leading-none tabular-nums">{count}</p>
          <p className="text-[12px] font-medium text-gray-600 dark:text-gray-400 mt-0.5">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <ArrowRight size={13} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors self-end mt-auto" />
      </div>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { leads }             = useLeads();
  const { docs }              = useDocs();
  const { customers }         = useCustomers();
  const { sales }             = useSales();
  const { stock }             = useStock();
  const { staff }             = useStaff();
  const { products }          = useProducts();
  const { purchaseOrders }    = usePurchaseOrders();
  const { invoices }          = useInvoices();
  const { addCustomer }       = useCustomers();
  const { currentUser, isAuthenticated } = useAuth();
  const { toast }             = useToast();

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [dateRange, setDateRange]             = useState<"7d" | "30d" | "90d">("30d");

  const settings = useMemo(() => getSettings(), []);

  const quickCustomerForm = useForm<QuickCustomerValues>({
    resolver: zodResolver(quickCustomerSchema),
    defaultValues: { name: "", company: "", email: "", phone: "", status: "Active", currency: "GBP", totalValue: "", notes: "" },
  });

  const handleQuickAddCustomer = (data: QuickCustomerValues) => {
    addCustomer({
      name: data.name, company: data.company, email: data.email ?? "", phone: data.phone ?? "",
      industry: "", city: "", status: data.status, source: "direct",
      customerSince: new Date().toISOString().split("T")[0],
      totalValue: data.totalValue ?? "", currency: data.currency,
      notes: data.notes ?? "", tags: [],
    });
    toast({ title: "Customer added", description: `${data.name} has been added.` });
    quickCustomerForm.reset();
    setAddCustomerOpen(false);
  };

  // ── Date boundaries ────────────────────────────────────────────────────────
  const now        = new Date();
  const todayStr   = format(now, "yyyy-MM-dd");
  const weekStart  = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  // ── Sales analytics ────────────────────────────────────────────────────────
  const completedSales = useMemo(() =>
    sales.filter(s => s.status === "Completed" || s.status === "On Credit"),
  [sales]);

  const totalRevenue = useMemo(() =>
    completedSales.reduce((sum, s) => sum + saleItemTotal(s.items as { qty: string; unitPrice: string; discount: string }[]), 0),
  [completedSales]);

  const todayRevenue = useMemo(() =>
    completedSales
      .filter(s => s.saleDate === todayStr)
      .reduce((sum, s) => sum + saleItemTotal(s.items as { qty: string; unitPrice: string; discount: string }[]), 0),
  [completedSales, todayStr]);

  const weekRevenue = useMemo(() =>
    completedSales
      .filter(s => new Date(s.saleDate) >= weekStart)
      .reduce((sum, s) => sum + saleItemTotal(s.items as { qty: string; unitPrice: string; discount: string }[]), 0),
  [completedSales, weekStart]);

  const monthRevenue = useMemo(() =>
    completedSales
      .filter(s => new Date(s.saleDate) >= monthStart)
      .reduce((sum, s) => sum + saleItemTotal(s.items as { qty: string; unitPrice: string; discount: string }[]), 0),
  [completedSales, monthStart]);

  // Last 7 days sparkline
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i);
      const ds = format(d, "yyyy-MM-dd");
      return completedSales
        .filter(s => s.saleDate === ds)
        .reduce((sum, s) => sum + saleItemTotal(s.items as { qty: string; unitPrice: string; discount: string }[]), 0);
    });
  }, [completedSales]);

  const last7Labels = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => format(subDays(now, 6 - i), "EEE")),
  []);

  // Sales by payment method
  const paymentMethodBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    completedSales.forEach(s => {
      const m = s.paymentMethod || "Other";
      map[m] = (map[m] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [completedSales]);

  // Sales status breakdown (all)
  const salesStatusMap = useMemo(() => {
    const m: Record<string, number> = {};
    sales.forEach(s => { m[s.status] = (m[s.status] || 0) + 1; });
    return m;
  }, [sales]);

  // ── Lead analytics ─────────────────────────────────────────────────────────
  const totalLeads  = leads.length;
  const wonLeads    = leads.filter(l => l.status === "Won").length;
  const lostLeads   = leads.filter(l => l.status === "Lost").length;
  const activeLeads = leads.filter(l => !["Won", "Lost"].includes(l.status)).length;
  const winRate     = totalLeads ? Math.round((wonLeads / totalLeads) * 100) : 0;

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    LEAD_STATUS_ORDER.forEach(s => { map[s] = 0; });
    leads.forEach(l => { if (map[l.status] !== undefined) map[l.status]++; });
    return map;
  }, [leads]);

  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => { const s = l.source || "Unknown"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [leads]);

  // ── Stock analytics ────────────────────────────────────────────────────────
  const forSaleStock    = stock.filter(s => s.stockType === "For Sale");
  const lowStockItems   = forSaleStock.filter(s => {
    const qty = parseFloat(s.quantity) || 0;
    const min = parseFloat(s.minLevel) || 0;
    return min > 0 && qty <= min;
  });
  const outOfStock      = forSaleStock.filter(s => (parseFloat(s.quantity) || 0) === 0);

  // ── Purchases analytics ────────────────────────────────────────────────────
  const pendingPOs   = purchaseOrders.filter(p => ["Draft", "Sent", "Confirmed"].includes(p.status));
  const receivedPOs  = purchaseOrders.filter(p => p.status === "Received");

  // ── Customers analytics ────────────────────────────────────────────────────
  const activeCustomers = customers.filter(c => c.status === "Active").length;

  // ── Docs analytics ─────────────────────────────────────────────────────────
  const totalDocs    = docs.length;
  const approvedDocs = docs.filter(d => d.status === "Approved").length;
  const pendingDocs  = docs.filter(d => d.status === "Under Review").length;

  // ── Admin users ────────────────────────────────────────────────────────────
  const adminUsers = useMemo(() => getAdminUsers(), []);

  // ── Recents ────────────────────────────────────────────────────────────────
  const recentSales = useMemo(() =>
    [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6),
  [sales]);

  const recentLeads = useMemo(() =>
    [...leads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
  [leads]);

  const recentCustomers = useMemo(() =>
    [...customers].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4),
  [customers]);

  const recentPOs = useMemo(() =>
    [...purchaseOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4),
  [purchaseOrders]);

  // ── Date-range analytics ────────────────────────────────────────────────────
  const drDays = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;

  // Revenue trend — daily data for selected range (AreaChart)
  const revenueTrend = useMemo(() => {
    return Array.from({ length: drDays }, (_, i) => {
      const d  = subDays(now, drDays - 1 - i);
      const ds = format(d, "yyyy-MM-dd");
      const rev = completedSales
        .filter(s => s.saleDate === ds)
        .reduce((sum, s) => sum + saleItemTotal(s.items as { qty: string; unitPrice: string; discount: string }[]), 0);
      return {
        date: drDays > 30 ? format(d, "d MMM") : format(d, "d"),
        fullDate: format(d, "d MMM"),
        revenue: parseFloat(rev.toFixed(2)),
      };
    });
  }, [completedSales, drDays]);

  // Top products by revenue (bar chart / ranked list)
  const topProducts = useMemo(() => {
    const map: Record<string, number> = {};
    completedSales.forEach(s => {
      (s.items as { productName: string; qty: string; unitPrice: string; discount: string }[]).forEach(item => {
        const name  = item.productName || "Unknown";
        const total = (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0) * (1 - (parseFloat(item.discount) || 0) / 100);
        map[name] = (map[name] || 0) + total;
      });
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, revenue]) => ({ name: name.length > 20 ? name.slice(0, 18) + "…" : name, revenue: parseFloat(revenue.toFixed(2)) }));
  }, [completedSales]);

  // Invoice analytics
  const invoiceStats = useMemo(() => {
    const calc = (items: { qty: string; unitPrice: string; discount: string }[], taxRate: string, shippingFee: string, handlingFee: string) => {
      const sub = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0) * (1 - (parseFloat(it.discount) || 0) / 100), 0);
      return sub + sub * (parseFloat(taxRate) || 0) / 100 + (parseFloat(shippingFee) || 0) + (parseFloat(handlingFee) || 0);
    };
    let paid = 0, overdue = 0, pending = 0, draft = 0, partial = 0;
    invoices.forEach(inv => {
      const total = calc(inv.items as { qty: string; unitPrice: string; discount: string }[], inv.taxRate, inv.shippingFee, inv.handlingFee);
      if      (inv.status === "Paid")      paid    += total;
      else if (inv.status === "Overdue")   overdue += total;
      else if (inv.status === "Sent")      pending += total;
      else if (inv.status === "Partial")   partial += total;
      else if (inv.status === "Draft")     draft   += total;
    });
    const total = paid + overdue + pending + partial + draft;
    return { paid, overdue, pending, partial, draft, total, count: invoices.length };
  }, [invoices]);

  // Customer growth — weekly additions (last 8 weeks, LineChart)
  const customerGrowth = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const weekStart2 = subWeeks(now, 7 - i);
      const weekEnd2   = addWeeks(weekStart2, 1);
      const count = customers.filter(c => {
        const d = new Date(c.createdAt);
        return d >= weekStart2 && d < weekEnd2;
      }).length;
      return { week: format(weekStart2, "d MMM"), customers: count };
    });
  }, [customers]);

  // Sales funnel — conversion from leads to completed sales
  const salesFunnel = useMemo(() => {
    const contacted    = (statusCounts["Contacted"]           || 0) + (statusCounts["Meeting Scheduled"] || 0) + (statusCounts["Demo Completed"] || 0) + (statusCounts["Qualified"] || 0) + (statusCounts["Proposal Sent"] || 0) + (statusCounts["Negotiation"] || 0) + wonLeads;
    const meetingHeld  = (statusCounts["Demo Completed"]      || 0) + (statusCounts["Qualified"]         || 0) + (statusCounts["Proposal Sent"]  || 0) + (statusCounts["Negotiation"] || 0) + wonLeads;
    const inProposal   = (statusCounts["Proposal Sent"]       || 0) + (statusCounts["Negotiation"]       || 0) + wonLeads;
    const items = [
      { label: "Total Leads",     count: leads.length,          color: "#3b82f6" },
      { label: "Contacted",       count: contacted,             color: "#6366f1" },
      { label: "Demo / Meeting",  count: meetingHeld,           color: "#0891b2" },
      { label: "Proposal Sent",   count: inProposal,            color: "#f59e0b" },
      { label: "Won",             count: wonLeads,              color: "#10b981" },
      { label: "Sales Created",   count: sales.length,          color: "#8b5cf6" },
      { label: "Completed Sales", count: completedSales.length, color: "#6366f1" },
    ];
    const max = items[0]?.count || 1;
    return items.map(it => ({ ...it, pct: max ? Math.round((it.count / max) * 100) : 0 }));
  }, [leads, statusCounts, wonLeads, sales, completedSales]);

  // Revenue vs Purchases cost (last 30 days) — weekly comparison
  const revenueVsCost = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const wStart = subWeeks(now, 5 - i);
      const wEnd   = addWeeks(wStart, 1);
      const wStartStr = format(wStart, "yyyy-MM-dd");
      const wEndStr   = format(wEnd, "yyyy-MM-dd");
      const rev  = completedSales.filter(s => s.saleDate >= wStartStr && s.saleDate < wEndStr)
        .reduce((sum, s) => sum + saleItemTotal(s.items as { qty: string; unitPrice: string; discount: string }[]), 0);
      const cost = purchaseOrders.filter(p => p.status === "Received" && p.createdAt >= wStart.toISOString() && p.createdAt < wEnd.toISOString())
        .reduce((sum, po) => {
          const items = (po.items || []) as { qty: string; unitPrice: string; discount: string }[];
          return sum + items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0) * (1 - (parseFloat(it.discount) || 0) / 100), 0);
        }, 0);
      return { week: format(wStart, "d MMM"), revenue: parseFloat(rev.toFixed(2)), cost: parseFloat(cost.toFixed(2)) };
    });
  }, [completedSales, purchaseOrders]);

  // ── Greeting ───────────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = currentUser?.fullName?.split(" ")[0] || currentUser?.username || "there";

  const SALE_STATUS_COLOR: Record<string, string> = {
    Completed:  "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    "On Credit":"bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
    Draft:      "bg-gray-100 dark:bg-gray-800 text-gray-500",
    Refunded:   "bg-red-100 dark:bg-red-900/40 text-red-600",
    Cancelled:  "bg-red-50 dark:bg-red-900/20 text-red-400",
  };

  const PO_STATUS_COLOR: Record<string, string> = {
    Draft:      "bg-gray-100 dark:bg-gray-800 text-gray-500",
    Sent:       "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    Confirmed:  "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
    Received:   "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    Cancelled:  "bg-red-100 dark:bg-red-900/40 text-red-600",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ══ Greeting + Quick Actions ══════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isAuthenticated ? `${greeting}, ${displayName} 👋` : "Onesoft Dashboard"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {format(now, "EEEE, d MMMM yyyy")} &middot; Here's your business overview
          </p>
        </div>
        {isAuthenticated && (
          <div className="flex gap-2 flex-wrap">
            <Link href="/sales/new">
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"><Receipt size={14} /> New Sale</Button>
            </Link>
            <Link href="/leads">
              <Button size="sm" variant="outline" className="gap-1.5"><UserPlus size={14} /> Add Lead</Button>
            </Link>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddCustomerOpen(true)} data-testid="btn-quick-add-customer">
              <UserCheck size={14} /> Add Customer
            </Button>
            <Link href="/purchases">
              <Button size="sm" variant="outline" className="gap-1.5"><ShoppingCart size={14} /> Purchase Order</Button>
            </Link>
          </div>
        )}
      </div>

      {/* ══ KPI Cards ═════════════════════════════════════════════════════════ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={PoundSterling}
          label="Total Revenue"
          value={fmtCurrency(totalRevenue)}
          sub={`This month: ${fmtCurrency(monthRevenue)}`}
          sub2={`Today: ${fmtCurrency(todayRevenue)}`}
          gradient="bg-gradient-to-br from-blue-600 to-blue-500"
          iconBg="bg-blue-400/40"
          testId="stat-revenue"
          href="/sales"
        />
        <KpiCard
          icon={Receipt}
          label="Sales This Week"
          value={fmtCurrency(weekRevenue)}
          sub={`${completedSales.length} completed sale${completedSales.length !== 1 ? "s" : ""}`}
          sub2={`${salesStatusMap["On Credit"] || 0} on credit`}
          gradient="bg-gradient-to-br from-emerald-600 to-emerald-500"
          iconBg="bg-emerald-400/40"
          testId="stat-week-revenue"
          href="/sales"
        />
        <KpiCard
          icon={Users}
          label="Leads"
          value={totalLeads}
          sub={`${activeLeads} active · ${wonLeads} won`}
          sub2={`Win rate: ${winRate}%`}
          gradient="bg-gradient-to-br from-violet-600 to-violet-500"
          iconBg="bg-violet-400/40"
          testId="stat-total-leads"
          href="/leads"
        />
        <KpiCard
          icon={UserCheck}
          label="Customers"
          value={customers.length}
          sub={`${activeCustomers} active`}
          gradient="bg-gradient-to-br from-cyan-600 to-cyan-500"
          iconBg="bg-cyan-400/40"
          testId="stat-customers"
          href="/customers"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Low Stock"
          value={lowStockItems.length}
          sub={`${outOfStock.length} out of stock`}
          sub2={`${forSaleStock.length} total SKUs`}
          gradient={lowStockItems.length > 0 ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-gradient-to-br from-gray-500 to-gray-400"}
          iconBg="bg-white/20"
          testId="stat-low-stock"
          href="/stock-ledger"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Pending Orders"
          value={pendingPOs.length}
          sub={`${receivedPOs.length} received`}
          sub2={`${purchaseOrders.length} total POs`}
          gradient="bg-gradient-to-br from-rose-600 to-rose-500"
          iconBg="bg-rose-400/40"
          testId="stat-pending-pos"
          href="/purchases"
        />
        <KpiCard
          icon={Package}
          label="Products"
          value={products.length}
          sub={`${stock.length} stock items`}
          gradient="bg-gradient-to-br from-indigo-600 to-indigo-500"
          iconBg="bg-indigo-400/40"
          testId="stat-products"
          href="/products"
        />
        <KpiCard
          icon={Users2}
          label="Staff"
          value={staff.length}
          sub={`${staff.filter(s => s.status === "Active").length} active`}
          sub2={`${adminUsers.length} admin accounts`}
          gradient="bg-gradient-to-br from-teal-600 to-teal-500"
          iconBg="bg-teal-400/40"
          testId="stat-staff"
          href="/staff"
        />
      </div>

      {/* ══ Revenue Chart + Sales Breakdown ══════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Sparkline chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <BarChart3 size={16} className="text-muted-foreground" /> Revenue — Last 7 Days
              </CardTitle>
              <Link href="/sales">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                  All sales <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {completedSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm border border-dashed rounded-lg">
                No sales data yet. <Link href="/sales/new"><span className="text-primary underline ml-1 cursor-pointer">Create a sale</span></Link>
              </div>
            ) : (
              <>
                <MiniBarChart data={last7} />
                <div className="flex justify-between mt-1">
                  {last7Labels.map((l, i) => (
                    <span key={i} className="text-[10px] text-muted-foreground flex-1 text-center">{l}</span>
                  ))}
                </div>
                {/* Revenue summary row */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "Today",      value: todayRevenue  },
                    { label: "This Week",  value: weekRevenue   },
                    { label: "This Month", value: monthRevenue  },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 dark:bg-muted/30 rounded-lg p-3 text-center">
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="text-[15px] font-bold text-gray-800 dark:text-foreground tabular-nums">
                        {fmtCurrency(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sales breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
              <CreditCard size={16} className="text-muted-foreground" /> Sales Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* By status */}
            <div>
              <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">By Status</p>
              <div className="space-y-2">
                {["Completed", "On Credit", "Draft", "Refunded", "Cancelled"].map(st => (
                  (salesStatusMap[st] ?? 0) > 0 && (
                    <div key={st} className="flex items-center justify-between">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${SALE_STATUS_COLOR[st] || "bg-muted text-muted-foreground"}`}>{st}</span>
                      <span className="text-[12px] font-semibold tabular-nums">{salesStatusMap[st] || 0}</span>
                    </div>
                  )
                ))}
                {sales.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No sales yet</p>}
              </div>
            </div>
            {/* By payment method */}
            {paymentMethodBreakdown.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">By Payment</p>
                <div className="space-y-2">
                  {paymentMethodBreakdown.map(([m, cnt]) => (
                    <HBar key={m} label={m} count={cnt} total={completedSales.length} color="bg-blue-500" />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══ Quick Access Tiles ════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <QuickTile href="/leads"     icon={Users}        label="Leads"     count={leads.length}          sub={`${activeLeads} active`}  color="bg-blue-500"    testId="tile-leads" />
          <QuickTile href="/customers" icon={UserCheck}    label="Customers" count={customers.length}      sub={`${activeCustomers} active`} color="bg-cyan-500" testId="tile-customers" />
          <QuickTile href="/products"  icon={Package}      label="Products"  count={products.length}       color="bg-indigo-500" />
          <QuickTile href="/stock-ledger" icon={Boxes}        label="Stock"     count={stock.length}          sub={lowStockItems.length > 0 ? `${lowStockItems.length} low` : undefined} color={lowStockItems.length > 0 ? "bg-amber-500" : "bg-slate-500"} />
          <QuickTile href="/purchases" icon={ShoppingCart} label="Purchases" count={purchaseOrders.length} sub={`${pendingPOs.length} pending`} color="bg-rose-500" />
          <QuickTile href="/sales"     icon={Receipt}      label="Sales"     count={sales.length}          sub={`${completedSales.length} completed`} color="bg-emerald-500" testId="tile-sales" />
          <QuickTile href="/staff"     icon={Users2}       label="Staff"     count={staff.length}          color="bg-teal-500" />
          <QuickTile href="/documents" icon={FileText}     label="Docs"      count={docs.length}           sub={`${pendingDocs} pending`} color="bg-violet-500" />
        </div>
      </div>

      {/* ══ Analytics Header ══════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-muted-foreground" />
          <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">Analytics</h2>
        </div>
        <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
          {(["7d", "30d", "90d"] as const).map(r => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`text-[11px] font-medium px-3 py-1 rounded-md transition-all ${
                dateRange === r
                  ? "bg-white dark:bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "90 Days"}
            </button>
          ))}
        </div>
      </div>

      {/* ══ Revenue Trend Chart + Top Products ════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Revenue area chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-500" />
                Revenue Trend
                <span className="text-[11px] font-normal text-muted-foreground">({dateRange === "7d" ? "last 7 days" : dateRange === "30d" ? "last 30 days" : "last 90 days"})</span>
              </CardTitle>
              <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {fmtCurrency(revenueTrend.reduce((s, d) => s + d.revenue, 0))} total
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {revenueTrend.every(d => d.revenue === 0) ? (
              <div className="flex flex-col items-center justify-center h-36 text-muted-foreground text-sm border border-dashed rounded-lg">
                No revenue data for this period.
                <Link href="/sales/new"><span className="text-primary underline text-xs mt-1 cursor-pointer">Create a sale</span></Link>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={revenueTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={drDays > 30 ? 9 : drDays > 14 ? 4 : 0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtMoneyCompact(v)} />
                  <ReTooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [fmtMoney(value), "Revenue"]}
                    labelFormatter={(label: string, payload: { payload?: { fullDate?: string } }[]) => payload?.[0]?.payload?.fullDate || label}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revenueGrad)" dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top products by revenue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
              <Package size={16} className="text-indigo-500" /> Top Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-sm border border-dashed rounded-lg text-center">
                <Package size={20} className="mb-1 opacity-40" />
                No product sales data yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {topProducts.map((p, idx) => {
                  const maxRev = topProducts[0]?.revenue || 1;
                  const pct    = Math.round((p.revenue / maxRev) * 100);
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">#{idx + 1}</span>
                          <span className="text-[12px] font-medium truncate">{p.name}</span>
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums shrink-0 text-indigo-600 dark:text-indigo-400">{fmtCurrency(p.revenue)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══ Invoice Analytics + Customer Growth + Sales Funnel ════════════════ */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Invoice analytics */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <FileText size={16} className="text-violet-500" /> Invoice Analytics
              </CardTitle>
              <Link href="/invoices">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                  View <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {invoiceStats.count === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-sm border border-dashed rounded-lg text-center">
                <FileText size={20} className="mb-1 opacity-40" />
                No invoices yet.
              </div>
            ) : (
              <>
                {/* Stacked progress bar */}
                <div>
                  <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-3">
                    {invoiceStats.total > 0 && [
                      { val: invoiceStats.paid,    cls: "bg-emerald-500" },
                      { val: invoiceStats.partial, cls: "bg-amber-400"   },
                      { val: invoiceStats.pending, cls: "bg-blue-400"    },
                      { val: invoiceStats.overdue, cls: "bg-red-500"     },
                      { val: invoiceStats.draft,   cls: "bg-gray-300 dark:bg-gray-600" },
                    ].map((seg, i) => seg.val > 0 && (
                      <div
                        key={i}
                        className={`${seg.cls} transition-all`}
                        style={{ width: `${(seg.val / invoiceStats.total) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: "Paid",     val: invoiceStats.paid,    dot: "bg-emerald-500", cnt: invoices.filter(i => i.status === "Paid").length     },
                      { label: "Partial",  val: invoiceStats.partial,  dot: "bg-amber-400",   cnt: invoices.filter(i => i.status === "Partial").length   },
                      { label: "Pending",  val: invoiceStats.pending,  dot: "bg-blue-400",    cnt: invoices.filter(i => i.status === "Sent").length      },
                      { label: "Overdue",  val: invoiceStats.overdue,  dot: "bg-red-500",     cnt: invoices.filter(i => i.status === "Overdue").length   },
                      { label: "Draft",    val: invoiceStats.draft,    dot: "bg-gray-400",    cnt: invoices.filter(i => i.status === "Draft").length     },
                    ].filter(r => r.val > 0 || r.cnt > 0).map(row => (
                      <div key={row.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${row.dot}`} />
                          <span className="text-[12px] font-medium">{row.label}</span>
                          <span className="text-[10px] text-muted-foreground">({row.cnt})</span>
                        </div>
                        <span className="text-[12px] font-semibold tabular-nums">{fmtCurrency(row.val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-2 border-t border-border flex justify-between">
                  <span className="text-[11px] text-muted-foreground">{invoiceStats.count} invoices total</span>
                  <span className="text-[12px] font-bold tabular-nums">{fmtCurrency(invoiceStats.total)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Customer growth line chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
              <UserPlus size={16} className="text-cyan-500" /> Customer Growth
              <span className="text-[11px] font-normal text-muted-foreground">(8 weeks)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-sm border border-dashed rounded-lg text-center">
                <Users size={20} className="mb-1 opacity-40" />
                No customers yet.
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={customerGrowth} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="week" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ReTooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number) => [value, "New Customers"]}
                    />
                    <Line type="monotone" dataKey="customers" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: "#06b6d4" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="bg-cyan-50 dark:bg-cyan-950/30 rounded-lg p-2 text-center">
                    <p className="text-[11px] text-muted-foreground">Total</p>
                    <p className="text-[16px] font-bold text-cyan-700 dark:text-cyan-300 tabular-nums">{customers.length}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-2 text-center">
                    <p className="text-[11px] text-muted-foreground">Active</p>
                    <p className="text-[16px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{activeCustomers}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sales conversion funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
              <Target size={16} className="text-rose-500" /> Conversion Funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {leads.length === 0 && sales.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-sm border border-dashed rounded-lg text-center">
                <Target size={20} className="mb-1 opacity-40" />
                No data yet. Add leads and sales.
              </div>
            ) : (
              salesFunnel.map((stage, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium">{stage.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold tabular-nums">{stage.count}</span>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{stage.pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${stage.pct}%`, backgroundColor: stage.color }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══ Revenue vs Costs (weekly grouped bar) ═════════════════════════════ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
              <Banknote size={16} className="text-amber-500" /> Revenue vs Purchasing Cost
              <span className="text-[11px] font-normal text-muted-foreground">(last 6 weeks)</span>
            </CardTitle>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Revenue</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Cost</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {revenueVsCost.every(d => d.revenue === 0 && d.cost === 0) ? (
            <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm border border-dashed rounded-lg">
              No revenue or purchasing data for comparison yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <ReBarChart data={revenueVsCost} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtMoneyCompact(v)} />
                <ReTooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [fmtMoney(value), name === "revenue" ? "Revenue" : "Purchasing Cost"]}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey="cost"    fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </ReBarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ══ Pipeline + Purchases ══════════════════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Lead pipeline */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <Layers size={16} className="text-muted-foreground" /> Lead Pipeline
              </CardTitle>
              <Link href="/leads">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                  All leads <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalLeads === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                No leads yet. <Link href="/leads"><span className="text-primary underline cursor-pointer">Add your first lead</span></Link>
              </div>
            ) : (
              <>
                <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
                  {LEAD_STATUS_ORDER.map(s => {
                    const pct = totalLeads ? (statusCounts[s] / totalLeads) * 100 : 0;
                    if (pct === 0) return null;
                    return <div key={s} className={`${LEAD_STATUS_META[s].bg} transition-all`} style={{ width: `${pct}%` }} title={`${s}: ${statusCounts[s]}`} />;
                  })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {LEAD_STATUS_ORDER.map(s => {
                    const count = statusCounts[s] || 0;
                    const pct   = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
                    return (
                      <div key={s} className="flex items-center gap-2 bg-gray-50 dark:bg-muted/20 rounded-lg px-2.5 py-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${LEAD_STATUS_META[s].dot}`} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium truncate leading-tight">{s}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">{count} · {pct}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Lead source */}
                {sourceCounts.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">By Source</p>
                    <div className="space-y-2">
                      {sourceCounts.map(([src, cnt]) => (
                        <HBar key={src} label={src} count={cnt} total={totalLeads} color="bg-blue-500" />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Purchase Orders */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <Truck size={16} className="text-muted-foreground" /> Purchase Orders
              </CardTitle>
              <Link href="/purchases">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                  All POs <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {purchaseOrders.length === 0 ? (
              <div className="px-6 pb-6 text-center py-8 text-sm text-muted-foreground border-t border-dashed">
                No purchase orders yet. <Link href="/purchases"><span className="text-primary underline cursor-pointer">Create one</span></Link>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {recentPOs.map(po => (
                    <li key={po.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                        <ShoppingCart size={13} className="text-rose-600 dark:text-rose-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate font-mono">{po.poNumber}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{po.supplier || "No supplier"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PO_STATUS_COLOR[po.status] || "bg-muted text-muted-foreground"}`}>{po.status}</span>
                        <span className="text-[10px] text-muted-foreground">{relativeDate(po.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* PO status summary */}
                <div className="px-6 py-3 border-t border-border bg-gray-50/50 dark:bg-muted/10 grid grid-cols-4 gap-2">
                  {["Draft","Sent","Confirmed","Received"].map(st => (
                    <div key={st} className="text-center">
                      <p className="text-[15px] font-bold text-gray-800 dark:text-foreground tabular-nums">
                        {purchaseOrders.filter(p => p.status === st).length}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{st}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══ Activity Feeds ════════════════════════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Recent Sales */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <Receipt size={15} className="text-muted-foreground" /> Recent Sales
              </CardTitle>
              <Link href="/sales">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                  View all <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentSales.length === 0 ? (
              <div className="px-6 pb-6 text-center py-8 text-sm text-muted-foreground border-t border-dashed">
                No sales yet. <Link href="/sales/new"><span className="text-primary underline cursor-pointer">Open POS</span></Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentSales.map(sale => {
                  const total = saleItemTotal(sale.items as { qty: string; unitPrice: string; discount: string }[]);
                  return (
                    <li key={sale.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <Receipt size={12} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold truncate font-mono">{sale.saleNumber}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{sale.customer || "Walk-in"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[13px] font-bold text-gray-700 dark:text-foreground tabular-nums">{fmtMoney(total)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SALE_STATUS_COLOR[sale.status] || "bg-muted text-muted-foreground"}`}>{sale.status}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Leads */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <TrendingUp size={15} className="text-muted-foreground" /> Recent Leads
              </CardTitle>
              <Link href="/leads">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                  View all <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentLeads.length === 0 ? (
              <div className="px-6 pb-6 text-center py-8 text-sm text-muted-foreground border-t border-dashed">
                No leads yet. <Link href="/leads"><span className="text-primary underline cursor-pointer">Add one</span></Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentLeads.map(lead => (
                  <li key={lead.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 font-bold text-blue-600 dark:text-blue-400 text-[11px]">
                      {lead.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate">{lead.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <Building2 size={9} />{lead.company}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${LEAD_BADGE[lead.status] || "bg-muted text-muted-foreground"}`}>{lead.status}</span>
                      <span className="text-[10px] text-muted-foreground">{relativeDate(lead.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Low stock + Recent customers */}
        <div className="flex flex-col gap-4">

          {/* Low stock alerts */}
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                  <AlertTriangle size={15} className={lowStockItems.length > 0 ? "text-amber-500" : "text-muted-foreground"} /> Stock Alerts
                </CardTitle>
                <Link href="/stock-ledger">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                    Stock <ArrowRight size={12} />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {lowStockItems.length === 0 ? (
                <div className="px-4 pb-4 text-center py-5 text-[12px] text-muted-foreground border-t border-dashed flex flex-col items-center gap-1">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  All stock levels OK
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {lowStockItems.slice(0, 4).map(item => {
                    const qty = parseFloat(item.quantity) || 0;
                    const min = parseFloat(item.minLevel) || 0;
                    return (
                      <li key={item.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-amber-50/40 dark:hover:bg-amber-950/10 transition-colors">
                        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${qty === 0 ? "bg-red-100 dark:bg-red-900/40" : "bg-amber-100 dark:bg-amber-900/40"}`}>
                          <Boxes size={11} className={qty === 0 ? "text-red-500" : "text-amber-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.sku || "No SKU"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-[13px] font-bold tabular-nums ${qty === 0 ? "text-red-500" : "text-amber-500"}`}>{qty}</p>
                          <p className="text-[9px] text-muted-foreground">min {min}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recent customers */}
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                  <UserCheck size={15} className="text-muted-foreground" /> New Customers
                </CardTitle>
                <Link href="/customers">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                    All <ArrowRight size={12} />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentCustomers.length === 0 ? (
                <div className="px-4 pb-4 text-center py-5 text-[12px] text-muted-foreground border-t border-dashed">
                  No customers yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {recentCustomers.map(c => (
                    <li key={c.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-muted/30 transition-colors">
                      <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{c.company}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                        c.status === "Active"   ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
                        c.status === "Inactive" ? "bg-gray-100 dark:bg-gray-800 text-gray-500" :
                                                  "bg-red-100 dark:bg-red-900/40 text-red-600"
                      }`}>{c.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ══ System Summary Bar ════════════════════════════════════════════════ */}
      <Card className="border-gray-100 dark:border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-x-8 gap-y-3 items-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">System Overview</p>
            {[
              { icon: Users,        label: "Admin Users",   value: adminUsers.length      },
              { icon: Users2,       label: "Staff",         value: staff.length           },
              { icon: UserCheck,    label: "Customers",     value: customers.length       },
              { icon: Package,      label: "Products",      value: products.length        },
              { icon: Boxes,        label: "Stock Items",   value: stock.length           },
              { icon: Receipt,      label: "Total Sales",   value: sales.length           },
              { icon: ShoppingCart, label: "Purchase Orders", value: purchaseOrders.length },
              { icon: FileText,     label: "Documents",     value: docs.length            },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-1.5">
                <Icon size={12} className="text-muted-foreground" />
                <span className="text-[12px] text-muted-foreground">{label}:</span>
                <span className="text-[12px] font-semibold tabular-nums">{value}</span>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-muted-foreground">Local · No server</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══ Add Customer Dialog ═══════════════════════════════════════════════ */}
      <Dialog open={addCustomerOpen} onOpenChange={v => { setAddCustomerOpen(v); if (!v) quickCustomerForm.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCheck size={18} /> Add New Customer</DialogTitle>
            <DialogDescription>Quickly add a customer. More details can be filled in on the Customers page.</DialogDescription>
          </DialogHeader>
          <Form {...quickCustomerForm}>
            <form onSubmit={quickCustomerForm.handleSubmit(handleQuickAddCustomer)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={quickCustomerForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl><Input placeholder="Jane Smith" data-testid="input-customer-name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={quickCustomerForm.control} name="company" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company *</FormLabel>
                    <FormControl><Input placeholder="Acme Ltd" data-testid="input-customer-company" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={quickCustomerForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="jane@acme.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={quickCustomerForm.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="+44 7700 000000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={quickCustomerForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="Churned">Churned</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={quickCustomerForm.control} name="currency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.code} {c.symbol}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={quickCustomerForm.control} name="totalValue" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Value</FormLabel>
                  <FormControl><Input placeholder="e.g. 50000" data-testid="input-customer-value" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={quickCustomerForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={2} className="resize-none" placeholder="Any initial notes..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="btn-save-quick-customer">Add Customer</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
