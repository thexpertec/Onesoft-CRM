import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, FileText, Moon, Sun, Menu, X,
  LogOut, Shield, UserCheck, Package,
  Bell, Plus, Search, ChevronDown, UserPlus, FilePlus, Tag,
  ArrowRight, Bookmark, SlidersHorizontal, Ruler, FolderOpen, Layers,
  ShoppingCart, ShoppingBag, Users2, KeyRound, Building2, Receipt,
  Package2, Image as ImageIcon, Settings, Globe, BookOpen,
  PlusCircle, Pencil, Trash2, CheckCircle2, RefreshCw, ArrowLeftRight, Trash,
  Landmark, TrendingUp, TrendingDown, ClipboardList, Calculator, Factory, FlaskConical, Wallet, FileBarChart, CreditCard, Undo2, Banknote,
  MapPin, BarChart3, Wrench, Scale, Briefcase, CalendarCheck2, Truck,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/contexts/auth-context";
import {
  getLeads, getCustomers, getDocs, getProducts, getStaff,
  getSales, getModuleGroupById, ModuleId,
  getActivities, clearActivities, ActivityEntry, ActivityAction,
  getSettings,
} from "@/lib/store";
import { getPresetById } from "@/lib/ui-presets";
import {
  QUICK_ACTIONS_REGISTRY, DEFAULT_QUICK_ACTIONS,
  LEFT_ACTIONS_REGISTRY, DEFAULT_LEFT_QUICK_ACTIONS,
} from "@/lib/quick-actions";
import { useDemoReset } from "@/hooks/use-demo-reset";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { LoginAsDialog } from "@/components/login-as-dialog";

// ─── HRM sub-tab helpers ─────────────────────────────────────────────────────

function HrmTab({ href, icon: Icon, label, active }: {
  href: string; icon: React.ElementType; label: string; active: boolean;
}) {
  return (
    <Link href={href} className={`flex items-center gap-1.5 px-3 h-full text-[11px] font-medium whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
      active
        ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
        : "border-transparent text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted/40"
    }`}>
      <Icon size={11} />
      {label}
    </Link>
  );
}

function HrmTabDivider() {
  return <div className="mx-2 h-4 w-px bg-gray-200 dark:bg-border self-center flex-shrink-0" />;
}

// ─── Activity Log helpers ─────────────────────────────────────────────────────
const LAST_SEEN_KEY = "onesoft-activity-last-seen";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const ACTION_META: Record<ActivityAction, { icon: React.ReactNode; color: string; label: string }> = {
  created:        { icon: <PlusCircle    size={13} />, color: "text-emerald-600 bg-emerald-50  dark:bg-emerald-950/50 dark:text-emerald-400", label: "Created"  },
  updated:        { icon: <Pencil        size={13} />, color: "text-blue-600    bg-blue-50     dark:bg-blue-950/50    dark:text-blue-400",    label: "Updated"  },
  deleted:        { icon: <Trash2        size={13} />, color: "text-red-600     bg-red-50      dark:bg-red-950/50     dark:text-red-400",     label: "Deleted"  },
  converted:      { icon: <ArrowLeftRight size={13}/>, color: "text-violet-600  bg-violet-50   dark:bg-violet-950/50  dark:text-violet-400",  label: "Converted"},
  completed:      { icon: <CheckCircle2  size={13} />, color: "text-teal-600    bg-teal-50     dark:bg-teal-950/50    dark:text-teal-400",    label: "Completed"},
  status_changed: { icon: <RefreshCw     size={13} />, color: "text-orange-600  bg-orange-50   dark:bg-orange-950/50  dark:text-orange-400",  label: "Status"   },
};

function ActivityLogPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    setEntries(getActivities());
  }, []);

  const handleClear = () => {
    clearActivities();
    setEntries([]);
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400 dark:text-zinc-500">
        <Bell size={32} strokeWidth={1.5} />
        <p className="text-[13px] font-medium">No activity yet</p>
        <p className="text-[11px]">Actions you take will appear here</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-gray-400 dark:text-zinc-500">{entries.length} entries</span>
        <button
          onClick={handleClear}
          className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors"
        >
          <Trash size={11} /> Clear all
        </button>
      </div>
      <div className="space-y-1.5 overflow-y-auto max-h-[420px] pr-1 -mr-1">
        {entries.map(entry => {
          const meta = ACTION_META[entry.action];
          return (
            <div key={entry.id} className="flex items-start gap-2.5 rounded-xl p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800/60 transition-colors group">
              <span className={`mt-0.5 flex-shrink-0 w-[26px] h-[26px] rounded-lg flex items-center justify-center ${meta.color}`}>
                {meta.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1 flex-wrap">
                  <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 leading-snug">{entry.entityName}</span>
                  <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium">{entry.entity}</span>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5 leading-snug">
                  <span className="font-medium">{meta.label}</span>
                  {entry.detail && <span className="text-gray-400 dark:text-zinc-500"> · {entry.detail}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-gray-400 dark:text-zinc-500">{entry.user}</span>
                  <span className="text-[9px] text-gray-300 dark:text-zinc-600">·</span>
                  <span className="text-[10px] text-gray-400 dark:text-zinc-500">{relativeTime(entry.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SubItem = { label: string; href?: string; icon?: React.ElementType; desc?: string; divider?: boolean };
type NavItem = {
  key: string; href?: string; label: string; icon: React.ElementType;
  items?: SubItem[] | null; isMega?: boolean;
};
type MegaLink   = { label: string; href: string; icon: React.ElementType; desc?: string; agentHide?: boolean };
type MegaColumn = {
  label: string; href: string; icon: React.ElementType;
  color: string; bg: string; desc: string;
  links: MegaLink[];
  agentHide?: boolean;   // hide the entire column for Sales Agents
};

// ─── CRM mega-menu columns ────────────────────────────────────────────────────
const CRM_COLUMNS: MegaColumn[] = [
  {
    href: "/leads", label: "Leads", icon: Users,
    color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40",
    desc: "Pipeline & prospecting",
    links: [
      { label: "All Leads",    href: "/leads",        icon: Users      },
      { label: "Add Lead",     href: "/leads",        icon: UserPlus   },
      { label: "Leads Report", href: "/leads-report", icon: BarChart3  },
    ],
  },
  {
    href: "/customers", label: "Customers", icon: UserCheck,
    color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40",
    desc: "Client management",
    links: [
      { label: "All Customers",     href: "/customers",        icon: UserCheck  },
      { label: "Add Customer",      href: "/customers/new",    icon: UserPlus   },
      { label: "Add Supplier",      href: "/suppliers/new",    icon: Truck      },
      { label: "Convert from Lead", href: "/customers",        icon: ArrowRight },
    ],
  },
  {
    href: "/areas", label: "Areas & Regions", icon: MapPin,
    color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/40",
    desc: "Cities & area master data",
    links: [
      { label: "Cities & Areas", href: "/areas", icon: MapPin },
    ],
  },
];

// ─── Trading mega-menu columns ────────────────────────────────────────────────
const SALES_COLUMNS: MegaColumn[] = [
  {
    label: "Point of Sale", href: "/sales", icon: Receipt,
    color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40",
    desc: "Transactions & POS",
    links: [
      { label: "All Sales", href: "/sales",     icon: Receipt, desc: "View all transactions" },
      { label: "New Sale",  href: "/sales/new", icon: Plus,    desc: "Open POS terminal"     },
    ],
  },
  {
    label: "Invoicing", href: "/invoices", icon: FileText,
    color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40",
    desc: "Bills & purchase orders",
    links: [
      { label: "Sales Invoices",    href: "/invoices",               icon: FileText,     desc: "Invoice management"          },
      { label: "Calc Invoice",      href: "/calc-invoice",           icon: Calculator,   desc: "Calculation-based invoicing", agentHide: true },
      { label: "Purchase Invoices", href: "/invoices?type=purchase", icon: ShoppingCart, desc: "Stock & vendor invoices",     agentHide: true },
    ],
  },
  {
    label: "Returns", href: "/returns", icon: Undo2,
    color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/40",
    desc: "Sale & purchase returns",
    agentHide: true,
    links: [
      { label: "Sale & Purchase Returns", href: "/returns", icon: Undo2, desc: "Sale & purchase returns" },
    ],
  },
];

// ─── Products mega-menu columns ───────────────────────────────────────────────
const PRODUCTS_COLUMNS: MegaColumn[] = [
  {
    label: "Catalogue", href: "/products", icon: Package,
    color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40",
    desc: "Products & bundles",
    links: [
      { label: "All Products",   href: "/products",       icon: Package, desc: "Full product catalogue" },
      { label: "Product Groups", href: "/product-groups", icon: Layers,  desc: "Menus & bundles"        },
    ],
  },
  {
    label: "Organisation", href: "/categories", icon: FolderOpen,
    color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40",
    desc: "Structure & classification",
    links: [
      { label: "Brands",       href: "/brands",               icon: Bookmark,          desc: "Brand management"        },
      { label: "Categories",   href: "/categories",           icon: FolderOpen,        desc: "Product grouping"        },
      { label: "Attributes",   href: "/attributes",           icon: SlidersHorizontal, desc: "Product properties"      },
      { label: "Units",        href: "/units",                icon: Ruler,             desc: "Measurement units"       },
      { label: "Departments",  href: "/product-departments",  icon: Layers,            desc: "Product department list" },
    ],
  },
  {
    label: "Assets & Stock", href: "/stock-ledger", icon: ImageIcon,
    color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40",
    desc: "Media & inventory",
    links: [
      { label: "Media Library", href: "/media",        icon: ImageIcon, desc: "Product images & files"       },
      { label: "Stock Ledger",  href: "/stock-ledger",        icon: BookOpen,    desc: "Movement history per product"          },
      { label: "Stock Report",  href: "/product-stock-report", icon: BarChart3,   desc: "Products, variants & stock summary"    },
    ],
  },
];

// ─── Accounts mega-menu columns ───────────────────────────────────────────────
const ACCOUNTS_COLUMNS: MegaColumn[] = [
  {
    label: "Books", href: "/chart-of-accounts", icon: BookOpen,
    color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40",
    desc: "Core accounting records",
    links: [
      { label: "Chart of Accounts",   href: "/chart-of-accounts",    icon: BookOpen,      desc: "Account hierarchy & ledgers"  },
      { label: "Journal Entry",       href: "/journal-entry",        icon: ClipboardList, desc: "Double-entry bookkeeping"     },
      { label: "Receipt & Payment",   href: "/receipt-payment",      icon: CreditCard,    desc: "Cash & bank transactions"     },
      { label: "R&P Summary",         href: "/rp-summary",           icon: CreditCard,    desc: "Cash & Bank summary by head"  },
      { label: "Transaction History", href: "/transaction-history",  icon: FileText,      desc: "All transactions in one view" },
      { label: "Cash & Bank Accounts", href: "/payment-accounts",   icon: CreditCard,    desc: "Bank & payment method setup"  },
    ],
  },
  {
    label: "Financial Statements", href: "/balance-sheet", icon: LayoutDashboard,
    color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40",
    desc: "Core financial reports",
    links: [
      { label: "Balance Sheet",  href: "/balance-sheet",  icon: LayoutDashboard, desc: "Assets, Liabilities & Equity" },
      { label: "P&L Statement", href: "/pls-report",     icon: TrendingUp,      desc: "Profit & Loss by period"     },
      { label: "Trial Balance",       href: "/trial-balance",     icon: Scale,           desc: "Trial balance by date range"    },
      { label: "6-Col Trial Balance", href: "/trial-balance-6col", icon: Scale,           desc: "6-column opening/movement/closing" },
      { label: "Ledger Report",       href: "/ledger-report",     icon: FileBarChart,    desc: "Account statement & balance"    },
    ],
  },
  {
    label: "Analysis", href: "/income-report", icon: TrendingUp,
    color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40",
    desc: "Revenue & cost insights",
    links: [
      { label: "Income Report",  href: "/income-report",  icon: TrendingUp,   desc: "Revenue by source & date"  },
      { label: "Expense Report", href: "/expense-report", icon: TrendingDown, desc: "Costs by category & date"  },
    ],
  },
];

// ─── Nav items (professional sequence) ───────────────────────────────────────
// Order: Dashboard → CRM → Purchase & Sale → Products → Manufacturing → Accounts → Documents → Investments → Settings
// HRM is appended dynamically based on permissions
const OTHER_NAV: NavItem[] = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard, items: null },
  { key: "crm",       label: "CRM",       icon: Users,    isMega: true },
  { key: "sales",     label: "Purchase & Sale",   icon: Receipt,  isMega: true },
  { key: "products",  label: "Products",  icon: Package,  isMega: true },
  {
    key: "manufacturing", label: "Manufacturing", icon: Factory,
    items: [
      { label: "Workflow Guide", href: "/production-guide", icon: ArrowRight,   desc: "Step-by-step production help" },
      { label: "Raw Materials",  href: "/raw-materials",    icon: FlaskConical, desc: "Track raw material stock"     },
      { label: "Mfg. Orders",   href: "/manufacturing",    icon: Factory,      desc: "Production & batch orders"    },
    ],
  },
  { key: "accounts", label: "Accounts", icon: BookOpen, isMega: true },
  {
    key: "documents", label: "Documents", icon: FileText,
    items: [
      { label: "All Documents", href: "/documents",     icon: FileText },
      { label: "New Document",  href: "/documents/new", icon: FilePlus },
    ],
  },
  {
    key: "investments", label: "Investments", icon: TrendingUp,
    items: [
      { label: "Shareholders",     href: "/shareholders",     icon: Landmark,   desc: "Equity & ownership"               },
      { label: "Investment Plans", href: "/investment-plans", icon: TrendingUp, desc: "Define & manage investment plans" },
    ],
  },
  {
    key: "website", label: "Website", icon: Globe,
    items: [
      { label: "Homepage CMS", href: "/website-cms", icon: Globe, desc: "Edit hero, banners, trust badges" },
    ],
  },
  {
    key: "repair", label: "Repair", icon: Wrench,
    items: [
      { label: "Repair Bookings", href: "/repair",        icon: Wrench,   desc: "Service queries from the store"          },
      { label: "Repair Report",   href: "/repair-report", icon: BarChart3, desc: "Analytics & full detail report"          },
    ],
  },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings, items: null },
];

const CRM_ROUTES           = ["/leads", "/customers"];
const PRODUCTS_ROUTES      = ["/products", "/brands", "/categories", "/product-groups", "/attributes", "/units", "/product-departments", "/media", "/stock-ledger", "/product-stock-report"];
const SALES_ROUTES         = ["/sales", "/invoices", "/calc-invoice", "/returns", "/purchase-return"];
const HRM_ROUTES           = ["/staff", "/roles", "/hrm-org", "/salary", "/salary-template", "/salary-allowances", "/salary-deductions", "/attendance", "/sales-agents", "/agent-performance", "/advance-salary", "/my-application", "/manage-application"];
const SALARY_TEMPLATE_ROUTES = ["/salary-template", "/salary-allowances", "/salary-deductions", "/advance-salary", "/my-application", "/manage-application"];
const ADMIN_ROUTES         = ["/users", "/tenants", "/module-groups", "/database"];
const MANUFACTURING_ROUTES = ["/raw-materials", "/manufacturing", "/production-guide"];
const INVESTMENTS_ROUTES   = ["/investment-plans", "/shareholders"];
const ACCOUNTS_ROUTES      = ["/chart-of-accounts", "/journal-entry", "/balance-sheet", "/ledger-report", "/pls-report", "/trial-balance", "/trial-balance-6col", "/receipt-payment", "/rp-summary", "/transaction-history", "/expense-report", "/income-report", "/payment-accounts"];
const REPAIR_ROUTES        = ["/repair", "/repair-report"];

const QUICK_ADD: SubItem[] = [
  { label: "New Lead",         href: "/leads",                  icon: UserPlus     },
  { label: "New Customer",     href: "/customers",              icon: UserCheck    },
  { label: "New Sale",         href: "/sales/new",              icon: Receipt      },
  { label: "Purchase Invoice", href: "/invoices?type=purchase", icon: ShoppingCart },
  { label: "New Document",     href: "/documents/new",          icon: FilePlus     },
  { label: "Journal Entry",    href: "/journal-entry",          icon: ClipboardList},
];

// ─── Layout ───────────────────────────────────────────────────────────────────
export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { theme, setTheme } = useTheme();
  const { isSuperAdmin, isManager, assignedTenants, isStaff, isSalesAgent, currentAgentId, staffPermissions, currentUser, logout, currentTenant, currentTenantId, switchTenant, exitImpersonation, isImpersonating } = useAuth();
  useDemoReset();

  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [laOpen,       setLaOpen]       = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [cpOpen,       setCpOpen]       = useState(false);
  const [openMega,     setOpenMega]     = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [unreadCount,  setUnreadCount]  = useState(0);

  // Compute unread count (entries newer than last-seen timestamp)
  const refreshUnread = useCallback(() => {
    const lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) || "0", 10);
    const count = getActivities().filter(e => new Date(e.timestamp).getTime() > lastSeen).length;
    setUnreadCount(count);
  }, []);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // Poll every 5 seconds so badge updates after actions
  useEffect(() => {
    const id = setInterval(refreshUnread, 5000);
    return () => clearInterval(id);
  }, [refreshUnread]);

  const handleActivityOpen = (open: boolean) => {
    setActivityOpen(open);
    if (open) {
      try { localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); } catch { /* quota */ }
      setUnreadCount(0);
    }
  };

  const megaRef = useRef<HTMLDivElement>(null);

  // Close any open mega menu on outside click
  useEffect(() => {
    if (!openMega) return;
    const handler = (e: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) {
        setOpenMega(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMega]);

  // ── Font-size + accent-colour injection ──────────────────────────────────
  useEffect(() => {
    function applyUIAppearance() {
      const s    = getSettings();
      const root = document.documentElement;

      // ── Accent colour from active preset ──────────────────────────────────
      const preset = s.uiPreset ? getPresetById(s.uiPreset) : null;

      // Pitch Black / Stark class toggling
      if (preset?.id === "pitch-black") {
        root.classList.add("pitch-black");
      } else {
        root.classList.remove("pitch-black");
      }
      if (preset?.id === "stark") {
        root.classList.add("stark");
      } else {
        root.classList.remove("stark");
      }

      if (preset) {
        const isDark  = root.classList.contains("dark");
        const primary = isDark ? preset.primaryDark : preset.primaryLight;
        root.style.setProperty("--primary",                    primary);
        root.style.setProperty("--ring",                       primary);
        root.style.setProperty("--sidebar-primary",            primary);
        root.style.setProperty("--sidebar-ring",               primary);
        root.style.setProperty("--chart-1",                    primary);
        root.style.setProperty("--primary-foreground",         "0 0% 100%");
        root.style.setProperty("--sidebar-primary-foreground", "0 0% 100%");
      } else {
        root.style.removeProperty("--primary");
        root.style.removeProperty("--ring");
        root.style.removeProperty("--sidebar-primary");
        root.style.removeProperty("--sidebar-ring");
        root.style.removeProperty("--chart-1");
        root.style.removeProperty("--primary-foreground");
        root.style.removeProperty("--sidebar-primary-foreground");
      }

      // ── Font sizes ────────────────────────────────────────────────────────
      const head   = s.fontHeadRow  ?? 12;
      const data   = s.fontDataRow  ?? 13;
      const btn    = s.fontButton   ?? 13;
      const tag    = s.fontTag      ?? 11;
      const filter = s.fontFilter   ?? 12;
      root.style.setProperty("--admin-font-head",   `${head}px`);
      root.style.setProperty("--admin-font-data",   `${data}px`);
      root.style.setProperty("--admin-font-btn",    `${btn}px`);
      root.style.setProperty("--admin-font-tag",    `${tag}px`);
      root.style.setProperty("--admin-font-filter", `${filter}px`);
      let styleEl = document.getElementById("admin-font-override") as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "admin-font-override";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = [
        `#admin-app table thead th,`,
        `#admin-app table thead td { font-size: var(--admin-font-head) !important; }`,
        `#admin-app table tbody td,`,
        `#admin-app table tbody th { font-size: var(--admin-font-data) !important; }`,
        `#admin-app .ht_master thead th { font-size: var(--admin-font-head) !important; }`,
        `#admin-app .ht_master tbody td { font-size: var(--admin-font-data) !important; }`,
        `#admin-app button { font-size: var(--admin-font-btn) !important; }`,
        `#admin-app .admin-tag { font-size: var(--admin-font-tag) !important; }`,
        `#admin-app .admin-filter, #admin-app .admin-filter * { font-size: var(--admin-font-filter) !important; }`,
      ].join("\n");
    }
    applyUIAppearance();
    window.addEventListener("admin-settings-changed", applyUIAppearance);
    return () => window.removeEventListener("admin-settings-changed", applyUIAppearance);
  }, []);

  // Close on route change
  useEffect(() => { setOpenMega(null); setMobileOpen(false); }, [location]);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Module access enforcement ────────────────────────────────────────────
  // When the superadmin is in "view as tenant" mode (currentTenantId set),
  // apply the tenant's module group restrictions — same view the tenant would have.
  // When superadmin is in their own context (no tenant), full access always.
  // When a staff member is logged in, use their HRM role permissions.

  /** Map from moduleId → HRM permission strings required (any one is sufficient).
   *  Includes both new 4-level keys and legacy "Manage X" keys for backward compat. */
  const STAFF_MODULE_PERMS: Partial<Record<ModuleId, string[]>> = {
    // CRM
    crm_leads:           ["View Leads",     "Add Leads",    "Edit Leads",    "Delete Leads",    "Manage Leads"],
    crm_customers:       ["View Customers", "Add Customers","Edit Customers","Delete Customers","Manage Customers"],
    // Products & Inventory
    products:            ["View Products",  "Add Products", "Edit Products", "Delete Products", "Manage Products"],
    categories:          ["View Categories","Add Categories","Edit Categories","Delete Categories","View Products","Manage Products"],
    brands:              ["View Brands",    "Add Brands",   "Edit Brands",   "Delete Brands",   "View Products","Manage Products"],
    product_groups:      ["View Products",  "Manage Products"],
    attributes:          ["View Attributes","Add Attributes","Edit Attributes","Delete Attributes","View Products","Manage Products"],
    units:               ["View Units",     "Add Units",    "Edit Units",    "Delete Units",    "View Products","Manage Products"],
    stock:               ["View Stock",     "Edit Stock",   "View Products", "Manage Products"],
    raw_materials:       ["View Raw Materials","Add Raw Materials","Edit Raw Materials","Delete Raw Materials","View Products","Manage Products"],
    purchases:           ["View Purchases", "Add Purchases","Edit Purchases","Delete Purchases","Manage Purchases"],
    // Sales
    sales:               ["View Sales",     "Add Sales",    "Edit Sales",    "Delete Sales",    "Manage Sales"],
    invoices:            ["View Invoices",  "Add Invoices", "Edit Invoices", "Delete Invoices", "View Sales","Manage Sales"],
    sale_return:         ["View Sale Returns","Add Sale Returns","Delete Sale Returns","View Sales","Manage Sales"],
    calc_invoice:        ["View Invoices",  "Add Invoices", "View Sales",   "Manage Sales"],
    sales_agents:        ["View Agents",    "Add Agents",   "Edit Agents",   "Delete Agents",   "View Sales","Manage Sales"],
    agent_performance:   ["View Agents",    "View Sales",   "Manage Sales"],
    areas:               ["View Sales",     "Manage Sales"],
    // HRM
    hrm_staff:           ["View Staff",     "Add Staff",    "Edit Staff",    "Delete Staff",    "Manage Staff"],
    hrm_roles:           ["View Roles",     "Add Roles",    "Edit Roles",    "Delete Roles",    "Manage Roles"],
    hrm_org:             ["View Staff",     "Add Staff",    "Edit Staff",    "Manage Staff"],
    hrm_salary:          ["View Staff",     "Manage Staff", "View Payroll",  "Manage Payroll"],
    hrm_attendance:      ["View Staff",     "Add Staff",    "Edit Staff",    "Manage Staff"],
    // Accounting
    accounting_coa:      ["View Chart of Accounts","Add Chart of Accounts","Edit Chart of Accounts","Delete Chart of Accounts","View Accounts","Manage Accounts"],
    accounting_journal:  ["View Journal",   "Add Journal",  "Edit Journal",  "Delete Journal",  "View Accounts","Manage Accounts"],
    accounting_balance:  ["View Fin Reports","View Accounts","Manage Accounts"],
    accounting_ledger:   ["View Accounts",  "Manage Accounts"],
    accounting_pls:      ["View Fin Reports","View Accounts","Manage Accounts"],
    accounting_trial:    ["View Fin Reports","View Accounts","Manage Accounts"],
    accounting_income:   ["View Fin Reports","View Accounts","Manage Accounts"],
    accounting_expense:  ["View Accounts",  "Manage Accounts"],
    accounting_receipts: ["View Receipts",  "Add Receipts", "Edit Receipts", "Delete Receipts", "View Accounts","Manage Accounts"],
    shareholders:        ["View Accounts",  "Manage Accounts"],
    investment_plans:    ["View Accounts",  "Manage Accounts"],
    // Manufacturing
    manufacturing:       ["View Manufacturing","Add Manufacturing","Edit Manufacturing","Delete Manufacturing","View Products","Manage Products"],
    production_guide:    ["View Manufacturing","Add Manufacturing","View Products","Manage Products"],
    // Website
    website_cms:         ["Edit Settings",  "Manage Settings"],
    // Repairs
    repair:              ["View Repairs",   "Add Repairs",  "Edit Repairs",  "Delete Repairs",  "View Sales","Manage Sales"],
    // Other
    documents:           ["View Documents", "Add Documents","Edit Documents","Delete Documents","Manage Documents"],
    media:               ["View Media",     "Add Media",    "Delete Media",  "View Products",   "Manage Products"],
    settings:            ["View Settings",  "Edit Settings","Manage Settings"],
  };

  /** Modules a Sales Agent can access (always, regardless of configured HRM role) */
  const AGENT_ALLOWED_MODULES: ModuleId[] = ["crm_leads", "crm_customers", "sales", "invoices", "calc_invoice", "documents"];

  const isModuleAllowed = (moduleId: ModuleId): boolean => {
    // Sales Agent: only their allowed modules
    if (isSalesAgent) {
      return AGENT_ALLOWED_MODULES.includes(moduleId);
    }
    // Staff: check their HRM role permissions via the perms map
    if (isStaff) {
      const required = STAFF_MODULE_PERMS[moduleId];
      if (required) return required.some(p => staffPermissions.has(p));
      // Module not in the perms map → always visible for staff (e.g. dashboard)
      return true;
    }
    if (isSuperAdmin && !currentTenantId) return true; // superadmin in own context
    if (!currentTenant?.moduleGroupId) return true;    // no restriction group assigned → full access
    const group = getModuleGroupById(currentTenant.moduleGroupId);
    if (!group) return false; // group assigned but not found → deny (safer default)
    return group.modules.includes(moduleId);
  };

  // ── Sidebar item → module mapping (used to role-filter both sidebars) ────────
  const LEFT_ITEM_MODULE: Partial<Record<string, ModuleId>> = {
    "l-leads":         "crm_leads",
    "l-customers":     "crm_customers",
    "l-agents":        "sales_agents",
    "l-agent-perf":    "agent_performance",
    "l-areas":         "areas",
    "l-staff":            "hrm_staff",
    "l-roles":            "hrm_roles",
    "l-hrm-org":          "hrm_org",
    "l-salary":            "hrm_salary",
    "l-salary-template":   "hrm_salary",
    "l-salary-allowances": "hrm_salary",
    "l-salary-deductions": "hrm_salary",
    "l-attendance":        "hrm_attendance",
    "l-products":      "products",
    "l-categories":    "products",
    "l-brands":        "products",
    "l-attributes":    "products",
    "l-units":         "products",
    "l-media":         "media",
    "l-stock-ledger":  "stock",
    "l-raw-materials": "manufacturing",
    "l-manufacturing": "manufacturing",
    "l-prod-guide":    "production_guide",
    "l-settings":      "settings",
  };
  const RIGHT_ITEM_MODULE: Partial<Record<string, ModuleId>> = {
    "purchase-invoices": "purchases",
    "receipts-payments": "accounting_receipts",
    "sales":             "sales",
    "new-sale":          "sales",
    "returns":           "sale_return",
    "purchase-return":   "purchases",
    "invoices":          "invoices",
    "calc-invoice":      "calc_invoice",
    "expense":           "accounting_journal",
    "journal-entry":     "accounting_journal",
    "pls-report":        "accounting_pls",
    "product-departments": "products_departments",
    "trial-balance":       "accounting_trial",
    "trial-balance-6col": "accounting_trial6",
    "balance-sheet":     "accounting_balance",
    "chart-of-accounts":  "accounting_coa",
    "income-report":      "accounting_income",
    "payment-accounts":   "accounting_receipts",
    "leads":             "crm_leads",
    "customers":         "crm_customers",
    "products":          "products",
    "stock-ledger":      "stock",
    "categories":        "products",
    "manufacturing":     "manufacturing",
  };

  const allowedCrmColumns = CRM_COLUMNS.filter(col =>
    col.href === "/leads"     ? isModuleAllowed("crm_leads")     :
    col.href === "/customers" ? isModuleAllowed("crm_customers") : true
  );

  const hrmItems: SubItem[] = [
    ...(isModuleAllowed("hrm_staff")       ? [{ label: "Staff",                href: "/staff",        icon: Users2,    desc: "Employees by dept & designation"     }] : []),
    ...(isModuleAllowed("hrm_roles")       ? [{ label: "Roles",                href: "/roles",        icon: KeyRound,  desc: "Permission roles"                     }] : []),
    ...(isModuleAllowed("hrm_org")         ? [{ label: "Depts & Designations", href: "/hrm-org",      icon: Building2, desc: "Departments, designations & JDs"      }] : []),
    ...(isModuleAllowed("hrm_salary")      ? [{ label: "Salary Management",  href: "/salary",            icon: Wallet,         desc: "Payroll, slips & JE posting"          }] : []),
    ...(isModuleAllowed("hrm_salary")      ? [{ label: "Salary Templates",   href: "/salary-template",   icon: FileText,       desc: "Templates, allowances, deductions & advances" }] : []),
    ...(isModuleAllowed("hrm_attendance")  ? [{ label: "Attendance",         href: "/attendance",        icon: CalendarCheck2, desc: "Daily & bulk attendance marking"      }] : []),
    { label: "Sales Agents",          href: "/sales-agents",      icon: Users2,    desc: "Manage agents & commissions"   },
    { label: "Agent Performance",     href: "/agent-performance", icon: BarChart3, desc: "Revenue, targets & commission" },
  ];

  // ── HRM mega-menu columns (dynamic, permission-gated) ─────────────────────
  const hrmPeopleLinks = [
    ...(isModuleAllowed("hrm_staff")       ? [{ label: "Staff",       href: "/staff",       icon: Users2,    desc: "Employee records & departments"      }] : []),
  ];
  const hrmStructureLinks = [
    ...(isModuleAllowed("hrm_roles") ? [{ label: "Roles",                href: "/roles",   icon: KeyRound,  desc: "Permission roles & access control"  }] : []),
    ...(isModuleAllowed("hrm_org")   ? [{ label: "Depts & Designations", href: "/hrm-org", icon: Building2, desc: "Org chart & job descriptions"        }] : []),
  ];
  const hrmPayrollLinks = [
    ...(isModuleAllowed("hrm_salary")     ? [{ label: "Salary Management",  href: "/salary",            icon: Wallet,         desc: "Payroll, slips & JE posting"           }] : []),
    ...(isModuleAllowed("hrm_salary")     ? [{ label: "Salary Templates",   href: "/salary-template",   icon: FileText,       desc: "Templates, allowances, deductions & advances" }] : []),
    ...(isModuleAllowed("hrm_attendance") ? [{ label: "Attendance",         href: "/attendance",        icon: CalendarCheck2, desc: "Daily & bulk attendance marking"       }] : []),
  ];
  const hrmSalesTeamLinks = [
    { label: "Sales Agents",      href: "/sales-agents",      icon: Users2,    desc: "Manage agents & commissions"   },
    { label: "Agent Performance", href: "/agent-performance", icon: BarChart3, desc: "Revenue, targets & commission" },
  ];
  const hrmMegaCols: MegaColumn[] = [
    ...(hrmPeopleLinks.length    > 0 ? [{ label: "People",            href: "/staff",        icon: Users2,    color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-950/40",       desc: "Staff management",     links: hrmPeopleLinks    }] : []),
    ...(hrmStructureLinks.length > 0 ? [{ label: "Structure",         href: "/roles",        icon: KeyRound,  color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", desc: "Roles & org chart",       links: hrmStructureLinks }] : []),
    ...(hrmPayrollLinks.length   > 0 ? [{ label: "Payroll & Attend.", href: "/salary",       icon: Wallet,    color: "text-violet-500",  bg: "bg-violet-50 dark:bg-violet-950/40",   desc: "Payroll & time tracking", links: hrmPayrollLinks   }] : []),
    ...(hrmSalesTeamLinks.length > 0 ? [{ label: "Sales Team",        href: "/sales-agents", icon: BarChart3, color: "text-amber-500",   bg: "bg-amber-50 dark:bg-amber-950/40",     desc: "Agents & performance",    links: hrmSalesTeamLinks }] : []),
  ];

  const HRM_NAV: NavItem = { key: "hrm", label: "HRM", icon: Building2, isMega: true };

  const isSuperAdminOwn = isSuperAdmin && !currentTenantId;
  const SUPERADMIN_NAV_KEYS = new Set(["dashboard", "accounts", "website", "settings"]);

  // Filter top-level nav by module access (maintains original order)
  const navItems: NavItem[] = [
    ...OTHER_NAV.filter(item => {
      if (isSuperAdminOwn) return SUPERADMIN_NAV_KEYS.has(item.key);
      switch (item.key) {
        case "crm":           return allowedCrmColumns.length > 0;
        case "products":      return isModuleAllowed("products");
        case "stock":         return isModuleAllowed("stock");
        case "sales":         return isModuleAllowed("sales") || isModuleAllowed("invoices");
        case "documents":     return isModuleAllowed("documents");
        case "accounts":      return (
          isModuleAllowed("accounting_coa") || isModuleAllowed("accounting_journal") ||
          isModuleAllowed("accounting_balance") || isModuleAllowed("accounting_ledger") ||
          isModuleAllowed("accounting_pls") || isModuleAllowed("accounting_trial") ||
          isModuleAllowed("accounting_trial6") || isModuleAllowed("accounting_income") ||
          isModuleAllowed("accounting_expense") || isModuleAllowed("accounting_receipts")
        );
        case "investments":   return isModuleAllowed("shareholders") || isModuleAllowed("investment_plans");
        case "manufacturing": return isModuleAllowed("manufacturing") || isModuleAllowed("production_guide") || isModuleAllowed("raw_materials");
        case "website":       return isModuleAllowed("website_cms");
        case "repair":        return isModuleAllowed("repair");
        case "settings":      return isModuleAllowed("settings");
        default:              return true; // dashboard always shown
      }
    }),
    ...(hrmItems.length > 0 && !isSuperAdminOwn ? [HRM_NAV] : []),
    ...(!isStaff && isSuperAdmin && !currentTenantId ? [{
      key: "sysadmin", label: "Admin", icon: Shield,
      items: [
        { label: "Admin Accounts", href: "/users",        icon: Shield,          desc: "System user accounts"  },
        { label: "Tenants",        href: "/tenants",       icon: Globe,           desc: "Client organisations"  },
        { label: "Module Groups",  href: "/module-groups", icon: LayoutDashboard, desc: "Feature access groups" },
        { label: "Database",       href: "/database",      icon: BookOpen,        desc: "Live KV store browser" },
      ] as SubItem[],
    }] : []),
  ];

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const userInitials = (currentUser?.fullName || currentUser?.username || "?")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  const isCrmActive           = CRM_ROUTES.some(r           => location === r || location.startsWith(r));
  const isProductsActive      = PRODUCTS_ROUTES.some(r      => location === r || location.startsWith(r));
  const isSalesActive         = SALES_ROUTES.some(r         => location === r || location.startsWith(r));
  const isHrmActive             = HRM_ROUTES.some(r             => location === r || location.startsWith(r));
  const isSalaryTemplateActive  = SALARY_TEMPLATE_ROUTES.some(r => location === r || location.startsWith(r));
  const isManufacturingActive = MANUFACTURING_ROUTES.some(r => location === r || location.startsWith(r));
  const isInvestmentsActive   = INVESTMENTS_ROUTES.some(r   => location === r || location.startsWith(r));
  const isAccountsActive      = ACCOUNTS_ROUTES.some(r      => location === r || location.startsWith(r));
  const isRepairActive        = REPAIR_ROUTES.some(r        => location === r || location.startsWith(r));
  const isAdminActive         = ADMIN_ROUTES.some(r         => location === r || location.startsWith(r));

  // Mega menu column configs keyed by nav item key
  const MEGA_CONFIGS: Record<string, { columns: MegaColumn[]; footerText: string; footerHref: string; footerLabel: string; rightAlign?: boolean }> = {
    crm: {
      columns: allowedCrmColumns,
      footerText: "Manage all your CRM records in one place",
      footerHref: "/leads", footerLabel: "View pipeline",
    },
    sales: {
      columns: SALES_COLUMNS,
      footerText: "Manage sales, purchases and invoicing",
      footerHref: "/sales", footerLabel: "View all trading",
    },
    products: {
      columns: PRODUCTS_COLUMNS,
      footerText: "Manage your full product catalogue and inventory",
      footerHref: "/products", footerLabel: "View catalogue",
    },
    accounts: {
      columns: ACCOUNTS_COLUMNS,
      footerText: "Double-entry bookkeeping & financial statements",
      footerHref: "/chart-of-accounts", footerLabel: "Open accounts",
    },
    hrm: {
      columns: hrmMegaCols,
      footerText: "Manage your entire workforce in one place",
      footerHref: "/staff", footerLabel: "View HRM",
      rightAlign: true,
    },
  };

  // Search
  const q = searchQuery.toLowerCase();
  const hasQuery = q.length >= 2;
  const searchResults = hasQuery ? {
    leads:     getLeads().filter(l =>
      l.name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)).slice(0, 4),
    customers: getCustomers().filter(c =>
      c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)).slice(0, 4),
    products:  getProducts().filter(p =>
      p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)).slice(0, 4),
    staff:     getStaff().filter(s =>
      s.name?.toLowerCase().includes(q) || s.department?.toLowerCase().includes(q) || s.designation?.toLowerCase().includes(q)).slice(0, 4),
    sales:     getSales().filter(s =>
      s.saleNumber?.toLowerCase().includes(q) || s.customer?.toLowerCase().includes(q) || s.notes?.toLowerCase().includes(q)).slice(0, 4),
    docs:      getDocs().filter(d =>
      d.title?.toLowerCase().includes(q) || d.clientName?.toLowerCase().includes(q)).slice(0, 4),
  } : null;

  const hasResults = searchResults &&
    (searchResults.leads.length + searchResults.customers.length +
     searchResults.products.length +
     searchResults.staff.length + searchResults.sales.length +
     searchResults.docs.length) > 0;

  return (
    <div id="admin-app" className="min-h-screen bg-gray-50 dark:bg-background flex flex-col">

      {/* ═══════════════════════════════════════════════════════════════
          ROW 1 — Brand · Search · Actions
      ═══════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 bg-white dark:bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="max-w-[1600px] mx-auto px-5 md:px-8 h-[60px] flex items-center gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <img src={logoUrl} alt="Onesoft" className="h-7 dark:brightness-0 dark:invert" />
          </Link>

          <div className="hidden md:block h-5 w-px bg-gray-100 dark:bg-border mx-1 flex-shrink-0" />

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex-1 max-w-md flex items-center gap-2 h-9 px-3 rounded-lg bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-left text-[13px] text-gray-400 dark:text-muted-foreground hover:border-blue-300 dark:hover:border-blue-700 hover:bg-white dark:hover:bg-muted transition-colors group"
            data-testid="btn-open-search"
          >
            <Search size={14} className="flex-shrink-0 text-gray-400 group-hover:text-blue-400 transition-colors" />
            <span className="flex-1">Search anything...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] border border-gray-200 dark:border-border px-1.5 py-0.5 rounded bg-white dark:bg-card text-gray-300 font-mono">⌘K</kbd>
          </button>

          {/* Right actions */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">

            {/* Theme */}
            <button onClick={toggleTheme} data-testid="toggle-theme"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Activity Log */}
            <Popover open={activityOpen} onOpenChange={handleActivityOpen}>
              <PopoverTrigger asChild>
                <button title="Activity Log"
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors relative">
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 ring-2 ring-white dark:ring-card flex items-center justify-center text-[9px] font-bold text-white leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] p-4" sideOffset={8}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[14px] font-bold text-gray-900 dark:text-gray-100">Activity Log</h3>
                    <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">All actions across CRM & modules</p>
                  </div>
                </div>
                <ActivityLogPanel onClose={() => setActivityOpen(false)} />
              </PopoverContent>
            </Popover>

            {/* Login as Business — manager only */}
            {isManager && !isImpersonating && (
              <button
                onClick={() => setLaOpen(true)}
                className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-[12px] font-semibold transition-colors shadow-sm"
              >
                <Building2 size={14} />
                Login as Business
              </button>
            )}

            {/* Exit impersonation — shown when manager is inside a business */}
            {isImpersonating && (
              <button
                onClick={exitImpersonation}
                className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-semibold transition-colors shadow-sm"
              >
                <ArrowLeftRight size={14} />
                Exit to Manager
              </button>
            )}

            {/* Quick Add */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`${isManager ? "hidden" : "hidden sm:flex"} items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[12px] font-semibold transition-colors shadow-sm`}>
                  <Plus size={14} />
                  Quick Add
                  <ChevronDown size={11} className="opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Create New</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {QUICK_ADD.map(item => (
                  <DropdownMenuItem key={item.label} className="gap-2 cursor-pointer text-[13px]" onClick={() => navigate(item.href)}>
                    <item.icon size={13} className="text-muted-foreground" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 h-9 pl-1.5 pr-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-muted transition-colors ml-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${isSuperAdmin ? "bg-purple-500" : isManager ? "bg-indigo-500" : isStaff ? "bg-teal-500" : isSalesAgent ? "bg-violet-500" : "bg-blue-500"}`}>
                    {userInitials}
                  </div>
                  <div className="hidden sm:block text-left min-w-0">
                    <p className="text-[12px] font-semibold text-gray-800 dark:text-foreground leading-tight truncate max-w-[100px]">
                      {currentUser?.fullName || currentUser?.username}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-muted-foreground leading-tight">
                      {isSuperAdmin ? "Super Admin" : isManager ? "Manager" : isStaff ? "Staff Member" : isSalesAgent ? "Sales Agent" : "Admin"}
                    </p>
                  </div>
                  <ChevronDown size={11} className="text-gray-400 hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-3 border-b border-border flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0 ${isSuperAdmin ? "bg-purple-500" : isManager ? "bg-indigo-500" : isStaff ? "bg-teal-500" : isSalesAgent ? "bg-violet-500" : "bg-blue-500"}`}>
                    {userInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{currentUser?.fullName || currentUser?.username}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {currentUser?.email || (isSuperAdmin ? "superadmin@onesoft.com" : "admin@onesoft.com")}
                    </p>
                    <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      isSuperAdmin
                        ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                        : isManager
                        ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                        : isStaff
                        ? "bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300"
                        : isSalesAgent
                        ? "bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300"
                        : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                    }`}>
                      {isSuperAdmin ? "Super Admin" : isManager ? "Manager" : isStaff ? "Staff" : isSalesAgent ? "Sales Agent" : "Admin"}
                    </span>
                    {(isStaff || isSalesAgent) && staffPermissions.size > 0 && (
                      <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                        {staffPermissions.size} permission{staffPermissions.size !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="py-1">
                  <DropdownMenuItem onClick={toggleTheme} className="gap-2 cursor-pointer text-[13px]">
                    {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCpOpen(true)} className="gap-2 cursor-pointer text-[13px]">
                    <KeyRound size={13} />
                    Change Password
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator />
                <div className="py-1">
                  <DropdownMenuItem onClick={logout} data-testid="btn-logout"
                    className="gap-2 cursor-pointer text-[13px] text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30">
                    <LogOut size={13} />
                    Sign Out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile hamburger — hidden for manager (no sidebar) */}
            {!isManager && (
              <button
                className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-muted transition-colors"
                onClick={() => setMobileOpen(v => !v)}>
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            ROW 2 — Navigation with mega menu (desktop)
        ═══════════════════════════════════════════════════════════════ */}
        {!isManager && (<div className="hidden md:block border-t border-gray-100 dark:border-border bg-white dark:bg-card">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 flex items-stretch h-[38px] gap-0">

            {navItems.map(item => {
              const isActive =
                item.key === "crm"           ? isCrmActive :
                item.key === "products"      ? isProductsActive :
                item.key === "sales"         ? isSalesActive :
                item.key === "hrm"           ? isHrmActive :
                item.key === "manufacturing" ? isManufacturingActive :
                item.key === "investments"   ? isInvestmentsActive :
                item.key === "accounts"      ? isAccountsActive :
                item.key === "repair"        ? isRepairActive :
                item.key === "sysadmin"      ? isAdminActive :
                location === item.href || (item.href && item.href !== "/" && location.startsWith(item.href));

              const isThisMegaOpen = openMega === item.key;

              const baseClass = `flex items-center gap-1 px-2.5 h-full text-[12px] font-medium whitespace-nowrap border-b-2 transition-all duration-150 ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted/40"
              }`;

              // ── Unified mega menu (CRM / Sales / Products / Accounts) ──────
              if (item.isMega) {
                const cfg = MEGA_CONFIGS[item.key];
                if (!cfg || cfg.columns.length === 0) return null;
                return (
                  <div
                    key={item.key}
                    ref={isThisMegaOpen ? megaRef : undefined}
                    className="relative flex items-stretch"
                  >
                    <button
                      data-testid={`nav-${item.key}`}
                      onClick={() => setOpenMega(isThisMegaOpen ? null : item.key)}
                      className={baseClass + " group"}
                    >
                      {item.label}
                      <ChevronDown
                        size={10}
                        className={`text-gray-400 transition-transform duration-200 ${isThisMegaOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isThisMegaOpen && (
                      <div
                        className={`absolute top-full z-50 mt-0 bg-white dark:bg-card border border-gray-100 dark:border-border rounded-b-xl shadow-xl overflow-hidden ${"rightAlign" in cfg && cfg.rightAlign ? "right-0" : "left-0"}`}
                        style={{ minWidth: `${cfg.columns.length * 210}px` }}
                      >
                        {/* Column grid */}
                        {(() => {
                          const visibleCols = isSalesAgent
                            ? cfg.columns.filter(col => !col.agentHide)
                            : cfg.columns;
                          return (
                        <div
                          className="grid divide-x divide-gray-100 dark:divide-border"
                          style={{ gridTemplateColumns: `repeat(${visibleCols.length}, minmax(0, 1fr))` }}
                        >
                          {visibleCols.map(col => (
                            <div key={col.label} className="p-5">
                              {/* Column header */}
                              <div className="flex items-center gap-2.5 mb-3">
                                <div className={`w-8 h-8 rounded-lg ${col.bg} flex items-center justify-center flex-shrink-0`}>
                                  <col.icon size={15} className={col.color} />
                                </div>
                                <div>
                                  <Link
                                    href={col.href}
                                    className="text-[13px] font-semibold text-gray-800 dark:text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                  >
                                    {col.label}
                                  </Link>
                                  <p className="text-[10px] text-gray-400 dark:text-muted-foreground">{col.desc}</p>
                                </div>
                              </div>
                              {/* Sub-links */}
                              <div className="space-y-0.5">
                                {(isSalesAgent ? col.links.filter(l => !l.agentHide) : col.links).map(link => (
                                  <Link
                                    key={link.label}
                                    href={link.href}
                                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-[12px] text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted transition-colors group/link"
                                  >
                                    <link.icon size={13} className={`${col.color} opacity-70 group-hover/link:opacity-100 flex-shrink-0`} />
                                    <div className="min-w-0">
                                      <div className="font-medium leading-tight">{link.label}</div>
                                      {link.desc && (
                                        <div className="text-[10px] text-gray-400 dark:text-zinc-600 leading-tight mt-0.5 truncate">{link.desc}</div>
                                      )}
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                          );
                        })()}
                        {/* Footer */}
                        <div className="px-5 py-2.5 bg-gray-50 dark:bg-muted/40 border-t border-gray-100 dark:border-border flex items-center justify-between">
                          <span className="text-[11px] text-gray-400 dark:text-muted-foreground">{cfg.footerText}</span>
                          <Link
                            href={cfg.footerHref}
                            className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
                          >
                            {cfg.footerLabel} <ArrowRight size={11} />
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // ── Plain link ─────────────────────────────────────────────────
              if (!item.items || item.items.length === 0) {
                return (
                  <Link key={item.key} href={item.href!}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                    className={baseClass}>
                    {item.label}
                  </Link>
                );
              }

              // ── Regular dropdown ───────────────────────────────────────────
              return (
                <DropdownMenu key={item.key}>
                  <DropdownMenuTrigger asChild>
                    <button data-testid={`nav-${item.label.toLowerCase()}`} className={baseClass + " group"}>
                      {item.label}
                      <ChevronDown size={10} className="text-gray-400 group-data-[state=open]:rotate-180 transition-transform" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={0} className="w-56">
                    {item.items.map((sub, idx) =>
                      sub.divider ? (
                        <div key={idx}>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-2 py-1">
                            {sub.label}
                          </DropdownMenuLabel>
                        </div>
                      ) : (
                        <DropdownMenuItem key={idx} asChild>
                          <Link href={sub.href!} className="flex items-center gap-2 cursor-pointer text-[13px]">
                            {sub.icon && <sub.icon size={13} className="text-muted-foreground" />}
                            <div className="min-w-0">
                              <div>{sub.label}</div>
                              {sub.desc && <div className="text-[10px] text-muted-foreground/60 truncate">{sub.desc}</div>}
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </div>
        </div>)}

        {/* ═══════════════════════════════════════════════════════════════
            ROW 3 — HRM contextual sub-tab strip
        ═══════════════════════════════════════════════════════════════ */}
        {isHrmActive && !isManager && !isSalaryTemplateActive && (
          <div className="hidden md:block border-t border-gray-100 dark:border-border bg-gray-50/40 dark:bg-muted/20">
            <div className="max-w-[1600px] mx-auto px-4 md:px-6 flex items-stretch h-[34px] overflow-x-auto" style={{ scrollbarWidth: "none" }}>

              {/* ── People ── */}
              {isModuleAllowed("hrm_staff") && (
                <HrmTab href="/staff" icon={Users2} label="Staff"
                  active={location === "/staff" || location.startsWith("/staff/")} />
              )}
              {/* ── Structure ── */}
              {(isModuleAllowed("hrm_roles") || isModuleAllowed("hrm_org")) && <HrmTabDivider />}
              {isModuleAllowed("hrm_roles") && (
                <HrmTab href="/roles" icon={KeyRound} label="Roles"
                  active={location === "/roles"} />
              )}
              {isModuleAllowed("hrm_org") && (
                <HrmTab href="/hrm-org" icon={Building2} label="Org & Designations"
                  active={location === "/hrm-org"} />
              )}

              {/* ── Payroll & Attendance ── */}
              {(isModuleAllowed("hrm_salary") || isModuleAllowed("hrm_attendance")) && <HrmTabDivider />}
              {isModuleAllowed("hrm_salary") && (
                <HrmTab href="/salary" icon={Wallet} label="Payroll"
                  active={location === "/salary"} />
              )}
              {isModuleAllowed("hrm_salary") && (
                <HrmTab href="/salary-template" icon={FileText} label="Salary Templates"
                  active={isSalaryTemplateActive} />
              )}
              {isModuleAllowed("hrm_attendance") && (
                <HrmTab href="/attendance" icon={CalendarCheck2} label="Attendance"
                  active={location === "/attendance"} />
              )}

              {/* ── Sales Team ── */}
              <HrmTabDivider />
              <HrmTab href="/sales-agents"      icon={Users2}    label="Sales Agents"
                active={location === "/sales-agents"} />
              <HrmTab href="/agent-performance" icon={BarChart3} label="Performance"
                active={location === "/agent-performance"} />

            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ROW 4 — Salary Templates contextual sub-tab strip
        ═══════════════════════════════════════════════════════════════ */}
        {isSalaryTemplateActive && !isManager && isModuleAllowed("hrm_salary") && (
          <div className="hidden md:block border-t border-blue-100 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/10">
            <div className="max-w-[1600px] mx-auto px-4 md:px-6 flex items-stretch h-[32px] overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <HrmTab href="/salary-template"   icon={FileText}       label="Templates"
                active={location === "/salary-template"}   />
              <HrmTabDivider />
              <HrmTab href="/salary-allowances" icon={TrendingUp}     label="Allowances"
                active={location === "/salary-allowances"} />
              <HrmTab href="/salary-deductions" icon={TrendingDown}   label="Deductions"
                active={location === "/salary-deductions"} />
              <HrmTabDivider />
              <HrmTab href="/advance-salary"    icon={Banknote}       label="Advance Salary"
                active={location === "/advance-salary"}    />
            </div>
          </div>
        )}

      </div>

      {/* ═══ MOBILE SLIDE-IN DRAWER (fixed overlay, replaces inline dropdown) ═══ */}
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setMobileOpen(false)}
      />
      {/* Drawer panel */}
      <div className={`md:hidden fixed inset-y-0 left-0 z-50 w-[78vw] max-w-[320px] bg-white dark:bg-zinc-900 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
            <img src={logoUrl} alt="Onesoft" className="h-6 dark:brightness-0 dark:invert" />
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* User pill */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0 ${isSuperAdmin ? "bg-purple-500" : isManager ? "bg-indigo-500" : isStaff ? "bg-teal-500" : isSalesAgent ? "bg-violet-500" : "bg-blue-500"}`}>
            {userInitials}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">{currentUser?.fullName || currentUser?.username}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{isSuperAdmin ? "Super Admin" : isManager ? "Manager" : isStaff ? "Staff Member" : isSalesAgent ? "Sales Agent" : "Admin"}</p>
          </div>
        </div>

        {/* Nav links — scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {/* Helper: nav link */}
          {(() => {
            const NavLink = ({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) => {
              const isActive = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[13px] font-medium transition-colors active:scale-[0.98] ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <Icon size={17} className="shrink-0" />
                  {label}
                </Link>
              );
            };
            const SectionLabel = ({ label }: { label: string }) => (
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-600 px-3 pt-3 pb-1">{label}</p>
            );
            return (
              <div className="space-y-0.5">
                <NavLink href="/" icon={LayoutDashboard} label="Dashboard" />

                {/* CRM */}
                {!isSuperAdminOwn && allowedCrmColumns.length > 0 && <>
                  <SectionLabel label="CRM" />
                  {allowedCrmColumns.map(col => <NavLink key={col.href} href={col.href} icon={col.icon} label={col.label} />)}
                </>}

                {/* Trading */}
                {!isSuperAdminOwn && (isModuleAllowed("sales") || isModuleAllowed("invoices")) && <>
                  <SectionLabel label="Purchase & Sale" />
                  {isModuleAllowed("sales") && <>
                    <NavLink href="/sales"       icon={Receipt} label="All Sales" />
                    <NavLink href="/sales/new"   icon={Plus}    label="New Sale" />
                  </>}
                  <NavLink href="/invoices"               icon={FileText}     label="Sales Invoices" />
                  <NavLink href="/invoices?type=purchase" icon={ShoppingCart} label="Purchase Invoices" />
                  <NavLink href="/returns"                icon={Undo2}        label="Returns" />
                  <NavLink href="/calc-invoice"           icon={Calculator}   label="Calc Invoice" />
                </>}

                {/* Products */}
                {!isSuperAdminOwn && isModuleAllowed("products") && <>
                  <SectionLabel label="Products" />
                  <NavLink href="/products"       icon={Package}           label="All Products" />
                  <NavLink href="/product-groups" icon={Layers}            label="Product Groups" />
                  <NavLink href="/brands"              icon={Bookmark} label="Brands" />
                  {isModuleAllowed("products_departments") && <NavLink href="/product-departments" icon={Layers} label="Departments" />}
                  <NavLink href="/categories"     icon={FolderOpen}        label="Categories" />
                  <NavLink href="/attributes"     icon={SlidersHorizontal} label="Attributes" />
                  <NavLink href="/units"          icon={Ruler}             label="Units" />
                  <NavLink href="/media"          icon={ImageIcon}         label="Media Library" />
                  <NavLink href="/stock-ledger"         icon={BookOpen}  label="Stock Ledger" />
                  <NavLink href="/product-stock-report" icon={BarChart3} label="Stock Report" />
                </>}

                {/* Manufacturing */}
                {!isSuperAdminOwn && isModuleAllowed("manufacturing") && <>
                  <SectionLabel label="Manufacturing" />
                  <NavLink href="/production-guide" icon={ArrowRight}    label="Workflow Guide" />
                  <NavLink href="/raw-materials"    icon={FlaskConical}  label="Raw Materials" />
                  <NavLink href="/manufacturing"    icon={Factory}       label="Mfg. Orders" />
                </>}

                {/* Accounts */}
                {(isModuleAllowed("accounting_coa") || isModuleAllowed("accounting_journal") ||
                  isModuleAllowed("accounting_balance") || isModuleAllowed("accounting_ledger") ||
                  isModuleAllowed("accounting_pls") || isModuleAllowed("accounting_trial") ||
                  isModuleAllowed("accounting_income") ||
                  isModuleAllowed("accounting_expense") || isModuleAllowed("accounting_receipts")) && <>
                  <SectionLabel label="Accounts" />
                  {isModuleAllowed("accounting_coa")      && <NavLink href="/chart-of-accounts" icon={BookOpen}        label="Chart of Accounts" />}
                  {isModuleAllowed("accounting_journal")  && <NavLink href="/journal-entry"     icon={ClipboardList}   label="Journal Entry" />}
                  {isModuleAllowed("accounting_receipts") && <NavLink href="/receipt-payment"       icon={CreditCard}      label="Receipt & Payment" />}
                  {isModuleAllowed("accounting_receipts") && <NavLink href="/transaction-history"  icon={FileText}        label="Transaction History" />}
                  {isModuleAllowed("accounting_balance")  && <NavLink href="/balance-sheet"        icon={LayoutDashboard} label="Balance Sheet" />}
                  {isModuleAllowed("accounting_pls")      && <NavLink href="/pls-report"        icon={TrendingUp}      label="P&L Statement" />}
                  {isModuleAllowed("accounting_trial")    && <NavLink href="/trial-balance"     icon={Scale}           label="Trial Balance" />}
                  {isModuleAllowed("accounting_trial6")   && <NavLink href="/trial-balance-6col" icon={Scale}           label="6-Col Trial Balance" />}
                  {isModuleAllowed("accounting_ledger")   && <NavLink href="/ledger-report"     icon={FileBarChart}    label="Ledger Report" />}
                  {isModuleAllowed("accounting_income")   && <NavLink href="/income-report"     icon={TrendingUp}      label="Income Report" />}
                  {isModuleAllowed("accounting_expense")  && <NavLink href="/expense-report"    icon={TrendingDown}    label="Expense Report" />}
                </>}

                {/* HRM */}
                {!isSuperAdminOwn && hrmItems.length > 0 && <>
                  <SectionLabel label="HRM" />
                  {hrmItems.map(item => <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />)}
                </>}

                {/* Documents */}
                {!isSuperAdminOwn && isModuleAllowed("documents") && <>
                  <SectionLabel label="Documents" />
                  <NavLink href="/documents"     icon={FileText} label="All Documents" />
                  <NavLink href="/documents/new" icon={FilePlus} label="New Document" />
                </>}

                {/* Investments */}
                {!isSuperAdminOwn && (isModuleAllowed("shareholders") || isModuleAllowed("investment_plans")) && <>
                  <SectionLabel label="Investments" />
                  {isModuleAllowed("shareholders")     && <NavLink href="/shareholders"     icon={Landmark}   label="Shareholders" />}
                  {isModuleAllowed("investment_plans") && <NavLink href="/investment-plans" icon={TrendingUp} label="Investment Plans" />}
                </>}

                {/* Settings / Admin */}
                {isModuleAllowed("settings") && <>
                  <SectionLabel label="Settings" />
                  <NavLink href="/settings"        icon={Settings}  label="Settings" />
                  <NavLink href="/print-templates"  icon={FileText}  label="Print Templates" />
                  <NavLink href="/invoice-template" icon={FileText}  label="Invoice Labels" />
                </>}
                {isSuperAdmin && !currentTenantId && <>
                  <SectionLabel label="Admin" />
                  <NavLink href="/users"     icon={KeyRound}     label="Admin Accounts" />
                  <NavLink href="/tenants"   icon={Building2}    label="Tenants" />
                  <NavLink href="/database"  icon={BookOpen}     label="Database" />
                </>}
              </div>
            );
          })()}
        </div>

        {/* Drawer footer */}
        <div className="shrink-0 border-t border-gray-100 dark:border-zinc-800 px-3 py-3 space-y-1">
          <button
            onClick={() => { toggleTheme(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {theme === "dark" ? <Sun size={16} className="shrink-0" /> : <Moon size={16} className="shrink-0" />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            onClick={() => { setMobileOpen(false); setCpOpen(true); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <KeyRound size={16} className="shrink-0" /> Change Password
          </button>
          <button
            onClick={() => { setMobileOpen(false); logout(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <LogOut size={16} className="shrink-0" /> Sign Out
          </button>
        </div>
      </div>

      {/* ═══ MOBILE BOTTOM TAB BAR ══════════════════════════════════════════════ */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-stretch h-[60px]">
          {[
            { href: "/",          label: "Home",      icon: LayoutDashboard, exact: true },
            { href: "/sales/new", label: "New Sale",  icon: Plus,            exact: false },
            { href: "/invoices",  label: "Invoices",  icon: FileText,        exact: false },
            { href: "/invoices?type=purchase", label: "Purchases", icon: ShoppingCart, exact: false },
          ].map(tab => {
            const isActive = tab.exact ? location === "/" : location.startsWith(tab.href.split("?")[0]);
            return (
              <button
                key={tab.href}
                onClick={() => { navigate(tab.href); setMobileOpen(false); }}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-gray-50 dark:active:bg-zinc-800 ${
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-zinc-500"
                }`}
              >
                <tab.icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[9.5px] font-medium leading-none">{tab.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-gray-50 dark:active:bg-zinc-800 ${
              mobileOpen ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-zinc-500"
            }`}
          >
            <Menu size={20} strokeWidth={mobileOpen ? 2.5 : 1.8} />
            <span className="text-[9.5px] font-medium leading-none">More</span>
          </button>
        </div>
      </div>

      {/* ── Global search dialog ─────────────────────────────────────────────── */}
      <Dialog open={searchOpen} onOpenChange={v => { setSearchOpen(v); if (!v) setSearchQuery(""); }}>
        <DialogContent className="p-0 max-w-[520px] overflow-hidden gap-0">
          <Command shouldFilter={false} className="rounded-xl">
            <div className="flex items-center border-b border-border px-3">
              <Search size={15} className="text-muted-foreground mr-2 flex-shrink-0" />
              <CommandInput
                placeholder="Search leads, customers, products, documents..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                className="h-12 text-[13px]"
              />
            </div>
            <CommandList className="max-h-80">
              {!hasQuery && (
                <div className="py-10 text-center text-[13px] text-muted-foreground">
                  <Search size={24} className="mx-auto mb-2 opacity-20" />
                  Type at least 2 characters to search
                </div>
              )}
              {hasQuery && !hasResults && (
                <CommandEmpty className="py-10 text-[13px]">No results for &ldquo;{searchQuery}&rdquo;</CommandEmpty>
              )}
              {hasQuery && searchResults?.leads.length ? (
                <CommandGroup heading="Leads">
                  {searchResults.leads.map(l => (
                    <CommandItem key={l.id} className="text-[13px] gap-2 cursor-pointer"
                      onSelect={() => { navigate("/leads"); setSearchOpen(false); setSearchQuery(""); }}>
                      <Users size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{l.name}</span>
                      {l.company && <span className="text-muted-foreground text-[11px]">· {l.company}</span>}
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        l.status === "Won" ? "bg-emerald-100 text-emerald-700" : l.status === "Lost" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                      }`}>{l.status}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {hasQuery && searchResults?.customers.length ? (
                <CommandGroup heading="Customers">
                  {searchResults.customers.map(c => (
                    <CommandItem key={c.id} className="text-[13px] gap-2 cursor-pointer"
                      onSelect={() => { navigate("/customers"); setSearchOpen(false); setSearchQuery(""); }}>
                      <UserCheck size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{c.name}</span>
                      {c.company && <span className="text-muted-foreground text-[11px]">· {c.company}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {hasQuery && searchResults?.products.length ? (
                <CommandGroup heading="Products">
                  {searchResults.products.map(p => (
                    <CommandItem key={p.id} className="text-[13px] gap-2 cursor-pointer"
                      onSelect={() => { navigate("/products"); setSearchOpen(false); setSearchQuery(""); }}>
                      <Package2 size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{p.name}</span>
                      {p.sku && <span className="text-muted-foreground text-[11px]">· {p.sku}</span>}
                      {p.status && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-zinc-100 text-zinc-500">{p.status}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {hasQuery && searchResults?.staff.length ? (
                <CommandGroup heading="Staff">
                  {searchResults.staff.map(s => (
                    <CommandItem key={s.id} className="text-[13px] gap-2 cursor-pointer"
                      onSelect={() => { navigate("/staff"); setSearchOpen(false); setSearchQuery(""); }}>
                      <Users2 size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{s.name}</span>
                      {s.designation && <span className="text-muted-foreground text-[11px]">· {s.designation}</span>}
                      {s.department && <span className="text-muted-foreground text-[11px]">, {s.department}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {hasQuery && searchResults?.sales.length ? (
                <CommandGroup heading="Sales">
                  {searchResults.sales.map(s => (
                    <CommandItem key={s.id} className="text-[13px] gap-2 cursor-pointer"
                      onSelect={() => { navigate("/sales"); setSearchOpen(false); setSearchQuery(""); }}>
                      <Receipt size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{s.saleNumber}</span>
                      {s.customer && <span className="text-muted-foreground text-[11px]">· {s.customer}</span>}
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${s.status === "Completed" ? "bg-emerald-100 text-emerald-700" : s.status === "On Credit" ? "bg-orange-100 text-orange-700" : s.status === "Refunded" ? "bg-amber-100 text-amber-700" : s.status === "Cancelled" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>{s.status}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {hasQuery && searchResults?.docs.length ? (
                <CommandGroup heading="Documents">
                  {searchResults.docs.map(d => (
                    <CommandItem key={d.id} className="text-[13px] gap-2 cursor-pointer"
                      onSelect={() => { navigate(`/documents/${d.id}`); setSearchOpen(false); setSearchQuery(""); }}>
                      <FileText size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{d.title || d.clientName || "Untitled"}</span>
                      {d.company && <span className="text-muted-foreground text-[11px]">· {d.company}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* ── Three-column body: left sidebar | content | right sidebar ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ═══ LEFT SIDEBAR — people & products (tenant-configurable) ══════════ */}
        {(() => {
          if (isManager) return null;
          const leftCfg = getSettings().quickActionsLeft ?? DEFAULT_LEFT_QUICK_ACTIONS;
          const leftVisible = leftCfg
            .filter(item => item.visible)
            .map(item => LEFT_ACTIONS_REGISTRY.find(r => r.id === item.id))
            .filter(Boolean)
            .filter(def => {
              const moduleId = LEFT_ITEM_MODULE[def!.id];
              return moduleId ? isModuleAllowed(moduleId) : true;
            }) as typeof LEFT_ACTIONS_REGISTRY;

          const leftRows: React.ReactNode[] = [];
          let leftPrevGroup = "";
          leftVisible.forEach((def, idx) => {
            if (idx > 0 && def.group !== leftPrevGroup) {
              leftRows.push(<SidebarDivider key={`ldiv-${idx}`} />);
            }
            leftPrevGroup = def.group;
            const hrefBase = def.href.split("?")[0];
            const isActive = location.startsWith(hrefBase);
            leftRows.push(
              <SidebarLink
                key={def.id}
                href={def.href}
                icon={def.icon}
                label={def.label}
                titleFull={def.titleFull}
                active={isActive}
                navigate={navigate}
                color={def.color as Parameters<typeof SidebarLink>[0]["color"]}
              />
            );
          });

          return (
            <nav className="hidden md:flex flex-col w-[54px] shrink-0 bg-white dark:bg-card border-r border-gray-100 dark:border-border overflow-y-auto py-2 scrollbar-none">
              {leftRows.length > 0 ? leftRows : (
                <div className="flex flex-col items-center justify-center flex-1 py-6 gap-1 text-gray-300 dark:text-zinc-700">
                  <Layers size={16} strokeWidth={1.5} />
                  <span className="text-[8px] text-center leading-tight px-1">Configure in Settings</span>
                </div>
              )}
            </nav>
          );
        })()}

        {/* ═══ CENTER CONTENT ════════════════════════════════════════════════ */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto bg-gray-50 dark:bg-background">

          {/* Active-tenant banner (superadmin) */}
          {isSuperAdmin && currentTenantId && currentTenant && (
            <div className="bg-amber-500 text-white px-5 py-2 flex items-center gap-3 shadow-sm flex-shrink-0">
              <Globe size={14} className="flex-shrink-0" />
              <span className="text-[13px] font-semibold flex-1">
                Viewing as: <span className="font-bold">{currentTenant.name}</span>
                <span className="ml-2 text-amber-100 font-normal text-[11px]">
                  — all data reads &amp; writes are scoped to this tenant
                </span>
              </span>
              <button
                onClick={() => switchTenant(null)}
                className="flex items-center gap-1.5 text-[12px] font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors"
              >
                <X size={12} /> Exit Tenant View
              </button>
            </div>
          )}

          {/* Impersonation banner (manager logged in as a business) */}
          {isImpersonating && currentTenant && (
            <div className="bg-indigo-600 text-white px-5 py-2 flex items-center gap-3 shadow-sm flex-shrink-0">
              <Building2 size={14} className="flex-shrink-0" />
              <span className="text-[13px] font-semibold flex-1">
                Logged in as: <span className="font-bold">{currentTenant.name}</span>
                <span className="ml-2 text-indigo-200 font-normal text-[11px]">
                  — {currentUser?.role === "admin" ? "Admin" : currentUser?.role === "staff" ? "Staff" : "Sales Agent"} view
                </span>
              </span>
              <button
                onClick={exitImpersonation}
                className="flex items-center gap-1.5 text-[12px] font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors"
              >
                <ArrowLeftRight size={12} /> Exit to Manager
              </button>
            </div>
          )}

          <main className="flex-1">
            <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-8">
              {children}
            </div>
          </main>
        </div>

        {/* ═══ RIGHT SIDEBAR — quick-add shortcuts (tenant-configurable) ══════ */}
        {(() => {
          if (isManager) return null;
          const cfg = getSettings().quickActionsRight ?? DEFAULT_QUICK_ACTIONS;
          const visible = cfg
            .filter(item => item.visible)
            .map(item => QUICK_ACTIONS_REGISTRY.find(r => r.id === item.id))
            .filter(Boolean)
            .filter(def => {
              const moduleId = RIGHT_ITEM_MODULE[def!.id];
              return moduleId ? isModuleAllowed(moduleId) : true;
            }) as typeof QUICK_ACTIONS_REGISTRY;

          const rows: React.ReactNode[] = [];
          let prevGroup = "";
          visible.forEach((def, idx) => {
            if (idx > 0 && def.group !== prevGroup) {
              rows.push(<SidebarDivider key={`div-${idx}`} />);
            }
            prevGroup = def.group;
            // Active heuristic: match href path prefix
            const hrefBase = def.href.split("?")[0];
            let isActive = false;
            if (def.id === "purchase-invoices") {
              isActive = location.startsWith("/invoices") && location.includes("type=purchase");
            } else if (def.id === "invoices") {
              isActive = location.startsWith("/invoices") && !location.includes("type=");
            } else if (def.id === "expense") {
              isActive = false;
            } else if (def.id === "new-sale") {
              isActive = false;
            } else {
              isActive = location.startsWith(hrefBase);
            }
            rows.push(
              <SidebarLink
                key={def.id}
                href={def.href}
                icon={def.icon}
                label={def.label}
                titleFull={def.titleFull}
                active={isActive}
                navigate={navigate}
                color={def.color as Parameters<typeof SidebarLink>[0]["color"]}
              />
            );
          });

          return (
            <nav className="hidden md:flex flex-col w-[54px] shrink-0 bg-white dark:bg-card border-l border-gray-100 dark:border-border overflow-y-auto py-2 scrollbar-none">
              {rows.length > 0 ? rows : (
                <p className="text-[9px] text-muted-foreground text-center px-1 pt-4 leading-tight">No shortcuts configured</p>
              )}
            </nav>
          );
        })()}

      </div>

      {/* Change Password Dialog */}
      <ChangePasswordDialog open={cpOpen} onClose={() => setCpOpen(false)} />

      {/* Login as Business Dialog (manager only) */}
      <LoginAsDialog open={laOpen} onClose={() => setLaOpen(false)} />
    </div>
  );
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────
function SidebarDivider() {
  return <div className="mx-3 my-1 h-px bg-gray-100 dark:bg-border shrink-0" />;
}

const SIDEBAR_COLORS: Record<string, { active: string; hover: string }> = {
  blue:    { active: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",         hover: "hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:text-blue-600 dark:hover:text-blue-400" },
  violet:  { active: "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400", hover: "hover:bg-violet-50 dark:hover:bg-violet-950/20 hover:text-violet-600 dark:hover:text-violet-400" },
  emerald: { active: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400", hover: "hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:text-emerald-600 dark:hover:text-emerald-400" },
  amber:   { active: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",     hover: "hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:text-amber-600 dark:hover:text-amber-400" },
  teal:    { active: "bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400",         hover: "hover:bg-teal-50 dark:hover:bg-teal-950/20 hover:text-teal-600 dark:hover:text-teal-400" },
  rose:    { active: "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400",         hover: "hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 dark:hover:text-rose-400" },
  indigo:  { active: "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400", hover: "hover:bg-indigo-50 dark:hover:bg-indigo-950/20 hover:text-indigo-600 dark:hover:text-indigo-400" },
  cyan:    { active: "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400",         hover: "hover:bg-cyan-50 dark:hover:bg-cyan-950/20 hover:text-cyan-600 dark:hover:text-cyan-400" },
  orange:  { active: "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400", hover: "hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-600 dark:hover:text-orange-400" },
  lime:    { active: "bg-lime-50 dark:bg-lime-950/30 text-lime-600 dark:text-lime-400",         hover: "hover:bg-lime-50 dark:hover:bg-lime-950/20 hover:text-lime-600 dark:hover:text-lime-400" },
  fuchsia: { active: "bg-fuchsia-50 dark:bg-fuchsia-950/30 text-fuchsia-600 dark:text-fuchsia-400", hover: "hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/20 hover:text-fuchsia-600 dark:hover:text-fuchsia-400" },
  green:   { active: "bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400",     hover: "hover:bg-green-50 dark:hover:bg-green-950/20 hover:text-green-600 dark:hover:text-green-400" },
  red:     { active: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400",             hover: "hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400" },
  purple:  { active: "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400", hover: "hover:bg-purple-50 dark:hover:bg-purple-950/20 hover:text-purple-600 dark:hover:text-purple-400" },
  sky:     { active: "bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400",             hover: "hover:bg-sky-50 dark:hover:bg-sky-950/20 hover:text-sky-600 dark:hover:text-sky-400" },
  pink:    { active: "bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400",         hover: "hover:bg-pink-50 dark:hover:bg-pink-950/20 hover:text-pink-600 dark:hover:text-pink-400" },
};

function SidebarLink({
  href, icon: Icon, label, active, navigate, titleFull, color = "blue",
}: {
  href: string; icon: React.ElementType; label: string;
  active: boolean; navigate: (to: string) => void; titleFull?: string;
  color?: keyof typeof SIDEBAR_COLORS;
}) {
  const cs = SIDEBAR_COLORS[color] ?? SIDEBAR_COLORS.blue;
  return (
    <button
      title={titleFull || label}
      onClick={() => navigate(href)}
      className={`flex flex-col items-center justify-center w-full py-2.5 px-1 gap-0.5 transition-all shrink-0
        ${active
          ? `${cs.active} font-semibold`
          : `text-gray-400 dark:text-muted-foreground ${cs.hover}`
        }`}
    >
      <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
      <span className="text-[8px] font-medium leading-none truncate w-full text-center px-0.5 mt-0.5">{label}</span>
    </button>
  );
}

function SidebarAction({
  icon: Icon, label, onClick, color, navigate: _nav,
}: {
  icon: React.ElementType; label: string;
  onClick: () => void; color?: string; navigate: (to: string) => void;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="flex flex-col items-center justify-center w-full py-2 px-1 gap-0.5 transition-colors shrink-0
        text-gray-400 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted/40 group"
    >
      <Icon size={15} className={`group-hover:${color || "text-blue-500"} transition-colors`} />
      <span className="text-[8.5px] font-medium leading-none truncate w-full text-center px-0.5 mt-0.5 group-hover:text-gray-600 dark:group-hover:text-foreground">{label}</span>
    </button>
  );
}
