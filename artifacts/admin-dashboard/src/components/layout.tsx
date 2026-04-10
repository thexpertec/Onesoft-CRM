import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, FileText, Moon, Sun, Menu, X,
  LogOut, Shield, UserCheck, Package, Truck,
  Bell, Plus, Search, ChevronDown, UserPlus, FilePlus, Tag,
  ArrowRight, Bookmark, SlidersHorizontal, Ruler, FolderOpen, Layers,
  ShoppingCart, Users2, KeyRound, Building2, Boxes, Lock, Receipt,
  Package2, Image as ImageIcon, Settings, Globe, BookOpen,
  PlusCircle, Pencil, Trash2, CheckCircle2, RefreshCw, ArrowLeftRight, Trash,
  Landmark, TrendingUp, ClipboardList, Calculator, Factory, FlaskConical, Wallet,
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
  getLeads, getCustomers, getSuppliers, getDocs, getProducts, getStaff,
  getPurchaseOrders, getSales, getModuleGroupById, ModuleId,
  getActivities, clearActivities, ActivityEntry, ActivityAction,
} from "@/lib/store";
import { useDemoReset } from "@/hooks/use-demo-reset";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";

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
  key: string;
  href?: string;
  label: string;
  icon: React.ElementType;
  items?: SubItem[] | null;
  mega?: boolean;
};

// ─── CRM mega-menu columns ────────────────────────────────────────────────────
const CRM_COLUMNS = [
  {
    href:  "/leads",
    label: "Leads",
    icon:  Users,
    color: "text-blue-500",
    bg:    "bg-blue-50 dark:bg-blue-950/40",
    desc:  "Pipeline & prospecting",
    links: [
      { label: "All Leads",  href: "/leads", icon: Users },
      { label: "Add Lead",   href: "/leads", icon: UserPlus },
    ],
  },
  {
    href:  "/customers",
    label: "Customers",
    icon:  UserCheck,
    color: "text-emerald-500",
    bg:    "bg-emerald-50 dark:bg-emerald-950/40",
    desc:  "Client management",
    links: [
      { label: "All Customers",     href: "/customers", icon: UserCheck },
      { label: "Add Customer",      href: "/customers", icon: UserPlus },
      { label: "Convert from Lead", href: "/customers", icon: ArrowRight },
    ],
  },
  {
    href:  "/suppliers",
    label: "Suppliers",
    icon:  Truck,
    color: "text-violet-500",
    bg:    "bg-violet-50 dark:bg-violet-950/40",
    desc:  "Vendor relationships",
    links: [
      { label: "All Suppliers", href: "/suppliers", icon: Truck },
      { label: "Add Supplier",  href: "/suppliers", icon: UserPlus },
    ],
  },
];

// ─── Other nav items ──────────────────────────────────────────────────────────
const OTHER_NAV: NavItem[] = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard, items: null },
  {
    key: "crm", label: "CRM", icon: Users, mega: true,
    items: null,
  },
  {
    key: "products", label: "Products", icon: Package,
    items: [
      { label: "Products",        href: "/products",        icon: Package,           desc: "Product catalogue"    },
      { label: "Product Groups",  href: "/product-groups",  icon: Layers,            desc: "Menus & bundles"      },
      { label: "Brands",          href: "/brands",          icon: Bookmark,          desc: "Brand management"     },
      { label: "Categories",      href: "/categories",      icon: FolderOpen,        desc: "Product grouping"     },
      { label: "Attributes",      href: "/attributes",      icon: SlidersHorizontal, desc: "Product properties"   },
      { label: "Units",           href: "/units",           icon: Ruler,             desc: "Measurement units"    },
      { label: "Media Library", href: "/media",       icon: ImageIcon,         desc: "Product images"       },
      { label: "Stock",         divider: true },
      { label: "All Stock",     href: "/stock",       icon: Boxes,             desc: "Product quantities & levels"   },
      { label: "Stock Holds",   href: "/stock/holds", icon: Lock,              desc: "Reserved (Not For Sale) items" },
    ],
  },
  {
    key: "sales", label: "Sales", icon: Receipt,
    items: [
      { label: "All Sales",     href: "/sales",         icon: Receipt,      desc: "Sales & POS terminal"          },
      { label: "New Sale",      href: "/sales/new",     icon: Plus,         desc: "Open POS terminal"             },
      { label: "Invoices",      href: "/invoices",      icon: FileText,     desc: "Invoice management"            },
      { label: "Calc Invoice",  href: "/calc-invoice",   icon: Calculator,   desc: "Calculation-based invoicing"   },
      { label: "Sales Agents",  href: "/sales-agents",   icon: Users2,        desc: "Agent management & commissions" },
      { label: "Purchases",     divider: true },
      { label: "All Purchase Orders", href: "/purchases", icon: ShoppingCart, desc: "Supplier procurement" },
    ],
  },
  {
    key: "documents", href: "/documents", label: "Documents", icon: FileText,
    items: [
      { label: "All Documents", href: "/documents",     icon: FileText },
      { label: "New Document",  href: "/documents/new", icon: FilePlus },
    ],
  },
  {
    key: "accounts", label: "Accounts", icon: BookOpen,
    items: [
      { label: "Chart of Accounts", href: "/chart-of-accounts", icon: BookOpen,      desc: "Account hierarchy & ledgers"   },
      { label: "Journal Entry",     href: "/journal-entry",     icon: ClipboardList, desc: "Double-entry bookkeeping"       },
      { label: "Balance Sheet",     href: "/balance-sheet",     icon: LayoutDashboard, desc: "Assets, Liabilities & Equity" },
    ],
  },
  {
    key: "manufacturing", label: "Manufacturing", icon: Factory,
    items: [
      { label: "Workflow Guide",  href: "/production-guide", icon: ArrowRight,   desc: "Step-by-step production help" },
      { label: "Raw Materials",   href: "/raw-materials",    icon: FlaskConical, desc: "Track raw material stock"     },
      { label: "Mfg. Orders",     href: "/manufacturing",    icon: Factory,      desc: "Production & batch orders"    },
    ],
  },
  {
    key: "investments", label: "Investments", icon: TrendingUp,
    items: [
      { label: "Shareholders",     href: "/shareholders",    icon: Landmark,   desc: "Equity & ownership"             },
      { label: "Investment Plans", href: "/investment-plans", icon: TrendingUp, desc: "Define & manage investment plans" },
    ],
  },
  { key: "settings", href: "/settings",           label: "Settings", icon: Settings, items: null },
];

const CRM_ROUTES         = ["/leads", "/customers", "/suppliers"];
const PRODUCTS_ROUTES    = ["/products", "/brands", "/categories", "/product-groups", "/attributes", "/units", "/media", "/stock"];
const SALES_ROUTES       = ["/sales", "/invoices", "/purchases", "/calc-invoice", "/sales-agents"];
const HRM_ROUTES            = ["/staff", "/roles", "/users"];
const MANUFACTURING_ROUTES  = ["/raw-materials", "/manufacturing", "/production-guide"];
const INVESTMENTS_ROUTES    = ["/investment-plans", "/shareholders"];
const ACCOUNTS_ROUTES    = ["/chart-of-accounts", "/journal-entry", "/balance-sheet"];

const QUICK_ADD: SubItem[] = [
  { label: "New Lead",           href: "/leads",         icon: UserPlus    },
  { label: "New Customer",       href: "/customers",     icon: UserCheck   },
  { label: "New Supplier",       href: "/suppliers",     icon: Truck       },
  { label: "Add Stock Item",     href: "/stock",         icon: Boxes       },
  { label: "New Purchase Order", href: "/purchases",     icon: ShoppingCart},
  { label: "New Sale",           href: "/sales/new",     icon: Receipt     },
  { label: "New Document",       href: "/documents/new", icon: FilePlus    },
];

// ─── Layout ───────────────────────────────────────────────────────────────────
export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { theme, setTheme } = useTheme();
  const { isSuperAdmin, isStaff, staffPermissions, currentUser, logout, currentTenant, currentTenantId, switchTenant } = useAuth();
  useDemoReset();

  const [mobileOpen,       setMobileOpen]       = useState(false);
  const [searchOpen,       setSearchOpen]       = useState(false);
  const [searchQuery,      setSearchQuery]      = useState("");
  const [crmOpen,          setCrmOpen]          = useState(false);
  const [activityOpen,     setActivityOpen]     = useState(false);
  const [unreadCount,      setUnreadCount]      = useState(0);

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
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      setUnreadCount(0);
    }
  };

  const crmRef = useRef<HTMLDivElement>(null);

  // Close mega menu on outside click
  useEffect(() => {
    if (!crmOpen) return;
    const handler = (e: MouseEvent) => {
      if (crmRef.current && !crmRef.current.contains(e.target as Node)) {
        setCrmOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [crmOpen]);

  // Close on route change
  useEffect(() => { setCrmOpen(false); setMobileOpen(false); }, [location]);

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

  /** Map from moduleId → HRM permission strings required (any one is sufficient). */
  const STAFF_MODULE_PERMS: Partial<Record<ModuleId, string[]>> = {
    crm_leads:     ["View Leads",     "Manage Leads"],
    crm_customers: ["View Customers", "Manage Customers"],
    crm_suppliers: ["View Suppliers", "Manage Suppliers"],
    products:      ["View Products",  "Manage Products"],
    stock:         ["View Products",  "Manage Products"],
    purchases:     ["View Purchases", "Manage Purchases"],
    sales:         ["View Sales",     "Manage Sales"],
    invoices:      ["View Sales",     "Manage Sales"],
    documents:     ["View Documents", "Manage Documents"],
    hrm_staff:     ["View Staff",     "Manage Staff"],
    hrm_roles:     ["View Roles",     "Manage Roles"],
    settings:      ["Manage Settings"],
    media:         ["View Products",  "Manage Products"],
  };

  const isModuleAllowed = (moduleId: ModuleId): boolean => {
    // Staff: check their HRM role permissions
    if (isStaff) {
      if (moduleId === "crm_leads" || moduleId === "crm_customers" || moduleId === "crm_suppliers" ||
          moduleId === "products" || moduleId === "stock" || moduleId === "purchases" ||
          moduleId === "sales" || moduleId === "invoices" || moduleId === "documents" ||
          moduleId === "hrm_staff" || moduleId === "hrm_roles" || moduleId === "media" || moduleId === "settings") {
        const required = STAFF_MODULE_PERMS[moduleId] ?? [];
        return required.some(p => staffPermissions.has(p));
      }
      // Dashboard is always allowed for staff
      return true;
    }
    if (isSuperAdmin && !currentTenantId) return true; // superadmin in own context
    if (!currentTenant?.moduleGroupId) return true;    // no restriction group assigned → full access
    const group = getModuleGroupById(currentTenant.moduleGroupId);
    if (!group) return false; // group assigned but not found → deny (safer default)
    return group.modules.includes(moduleId);
  };

  const allowedCrmColumns = CRM_COLUMNS.filter(col =>
    col.href === "/leads"     ? isModuleAllowed("crm_leads")     :
    col.href === "/customers" ? isModuleAllowed("crm_customers") :
    col.href === "/suppliers" ? isModuleAllowed("crm_suppliers") : true
  );

  const hrmItems: SubItem[] = [
    ...(isModuleAllowed("hrm_staff") ? [{ label: "Staff", href: "/staff", icon: Users2,   desc: "Employees by dept & designation" }] : []),
    ...(isModuleAllowed("hrm_roles") ? [{ label: "Roles", href: "/roles", icon: KeyRound, desc: "Permission roles"                }] : []),
    ...(!isStaff && isSuperAdmin && !currentTenantId ? [
      { label: "Admin Accounts", href: "/users",        icon: Shield,          desc: "System users"          },
      { label: "Tenants",        href: "/tenants",       icon: Globe,           desc: "Client organisations"  },
      { label: "Module Groups",  href: "/module-groups", icon: LayoutDashboard, desc: "Feature access groups" },
    ] : []),
  ];

  const HRM_NAV: NavItem = { key: "hrm", label: "HRM", icon: Building2, items: hrmItems };

  // Filter top-level nav by module access (maintains original order)
  const navItems: NavItem[] = [
    ...OTHER_NAV.filter(item => {
      switch (item.key) {
        case "crm":       return allowedCrmColumns.length > 0;
        case "products":  return isModuleAllowed("products");
        case "stock":     return isModuleAllowed("stock");
        case "purchases": return isModuleAllowed("purchases");
        case "sales":     return isModuleAllowed("sales") || isModuleAllowed("invoices");
        case "documents": return isModuleAllowed("documents");
        case "accounts":  return true; // Chart of Accounts — always visible, standalone
        case "settings":  return isModuleAllowed("settings");
        default:          return true; // dashboard always shown
      }
    }),
    ...(hrmItems.length > 0 ? [HRM_NAV] : []),
  ];

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const userInitials = (currentUser?.fullName || currentUser?.username || "?")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  const isCrmActive         = CRM_ROUTES.some(r         => location === r || location.startsWith(r));
  const isProductsActive    = PRODUCTS_ROUTES.some(r    => location === r || location.startsWith(r));
  const isSalesActive       = SALES_ROUTES.some(r       => location === r || location.startsWith(r));
  const isHrmActive         = HRM_ROUTES.some(r         => location === r || location.startsWith(r));
  const isManufacturingActive = MANUFACTURING_ROUTES.some(r => location === r || location.startsWith(r));
  const isInvestmentsActive   = INVESTMENTS_ROUTES.some(r  => location === r || location.startsWith(r));
  const isAccountsActive      = ACCOUNTS_ROUTES.some(r     => location === r || location.startsWith(r));

  // Search
  const q = searchQuery.toLowerCase();
  const hasQuery = q.length >= 2;
  const searchResults = hasQuery ? {
    leads:     getLeads().filter(l =>
      l.name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)).slice(0, 4),
    customers: getCustomers().filter(c =>
      c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)).slice(0, 4),
    suppliers: getSuppliers().filter(s =>
      s.company?.toLowerCase().includes(q) || s.contactPerson?.toLowerCase().includes(q)).slice(0, 4),
    products:  getProducts().filter(p =>
      p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)).slice(0, 4),
    staff:     getStaff().filter(s =>
      s.name?.toLowerCase().includes(q) || s.department?.toLowerCase().includes(q) || s.designation?.toLowerCase().includes(q)).slice(0, 4),
    purchases: getPurchaseOrders().filter(p =>
      p.poNumber?.toLowerCase().includes(q) || p.supplier?.toLowerCase().includes(q) || p.notes?.toLowerCase().includes(q)).slice(0, 4),
    sales:     getSales().filter(s =>
      s.saleNumber?.toLowerCase().includes(q) || s.customer?.toLowerCase().includes(q) || s.notes?.toLowerCase().includes(q)).slice(0, 4),
    docs:      getDocs().filter(d =>
      d.title?.toLowerCase().includes(q) || d.clientName?.toLowerCase().includes(q)).slice(0, 4),
  } : null;

  const hasResults = searchResults &&
    (searchResults.leads.length + searchResults.customers.length +
     searchResults.suppliers.length + searchResults.products.length +
     searchResults.staff.length + searchResults.purchases.length +
     searchResults.sales.length + searchResults.docs.length) > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col">

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

            {/* Quick Add */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[12px] font-semibold transition-colors shadow-sm">
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
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${isSuperAdmin ? "bg-purple-500" : isStaff ? "bg-teal-500" : "bg-blue-500"}`}>
                    {userInitials}
                  </div>
                  <div className="hidden sm:block text-left min-w-0">
                    <p className="text-[12px] font-semibold text-gray-800 dark:text-foreground leading-tight truncate max-w-[100px]">
                      {currentUser?.fullName || currentUser?.username}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-muted-foreground leading-tight">
                      {isSuperAdmin ? "Super Admin" : isStaff ? "Staff Member" : "Admin"}
                    </p>
                  </div>
                  <ChevronDown size={11} className="text-gray-400 hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-3 border-b border-border flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0 ${isSuperAdmin ? "bg-purple-500" : isStaff ? "bg-teal-500" : "bg-blue-500"}`}>
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
                        : isStaff
                        ? "bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300"
                        : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                    }`}>
                      {isSuperAdmin ? "Super Admin" : isStaff ? "Staff" : "Admin"}
                    </span>
                    {isStaff && staffPermissions.size > 0 && (
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

            {/* Mobile hamburger */}
            <button
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(v => !v)}>
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            ROW 2 — Navigation with mega menu (desktop)
        ═══════════════════════════════════════════════════════════════ */}
        <div className="hidden md:block border-t border-gray-100 dark:border-border bg-white dark:bg-card">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 flex items-stretch h-[38px] gap-0">

            {navItems.map(item => {
              const isActive =
                item.key === "crm"         ? isCrmActive :
                item.key === "products"    ? isProductsActive :
                item.key === "sales"       ? isSalesActive :
                item.key === "hrm"           ? isHrmActive :
                item.key === "manufacturing" ? isManufacturingActive :
                item.key === "investments"   ? isInvestmentsActive :
                item.key === "accounts"      ? isAccountsActive :
                location === item.href || (item.href && item.href !== "/" && location.startsWith(item.href));

              const baseClass = `flex items-center gap-1 px-2.5 h-full text-[12px] font-medium whitespace-nowrap border-b-2 transition-all duration-150 ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted/40"
              }`;

              // ── CRM mega menu trigger ──────────────────────────────────────
              if (item.key === "crm") {
                return (
                  <div key="crm" ref={crmRef} className="relative flex items-stretch">
                    <button
                      data-testid="nav-crm"
                      onClick={() => setCrmOpen(v => !v)}
                      className={baseClass + " group"}
                    >
                      {item.label}
                      <ChevronDown
                        size={10}
                        className={`text-gray-400 transition-transform duration-200 ${crmOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* ── Mega menu panel ──────────────────────────────────── */}
                    {crmOpen && (
                      <div className="absolute top-full left-0 z-50 mt-0 bg-white dark:bg-card border border-gray-100 dark:border-border rounded-b-xl shadow-xl overflow-hidden"
                        style={{ minWidth: "580px" }}>

                        {/* Column grid */}
                        <div className="grid divide-x divide-gray-100 dark:divide-border" style={{ gridTemplateColumns: `repeat(${allowedCrmColumns.length || 1}, minmax(0, 1fr))` }}>
                          {allowedCrmColumns.map(col => (
                            <div key={col.href} className="p-5">
                              {/* Column header */}
                              <div className="flex items-center gap-2.5 mb-1">
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

                              {/* Links */}
                              <div className="mt-3 space-y-0.5">
                                {col.links.map(link => (
                                  <Link
                                    key={link.label}
                                    href={link.href}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted transition-colors"
                                  >
                                    <link.icon size={12} className="text-gray-400 flex-shrink-0" />
                                    {link.label}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Footer bar */}
                        <div className="px-5 py-2.5 bg-gray-50 dark:bg-muted/40 border-t border-gray-100 dark:border-border flex items-center justify-between">
                          <span className="text-[11px] text-gray-400 dark:text-muted-foreground">
                            Manage all your CRM records in one place
                          </span>
                          <Link
                            href="/leads"
                            className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
                          >
                            View pipeline <ArrowRight size={11} />
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
                  <DropdownMenuContent align="start" sideOffset={0} className="w-52">
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
                            {sub.label}
                          </Link>
                        </DropdownMenuItem>
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-border bg-white dark:bg-card px-4 pb-4 pt-2">
            <div className="space-y-0.5">
              {/* Dashboard */}
              <Link href="/"
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  location === "/" ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>

              {/* CRM group */}
              {allowedCrmColumns.length > 0 && <div className="pt-1 pb-0.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 mb-1">CRM</p>
                {allowedCrmColumns.map(col => (
                  <Link key={col.href} href={col.href}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      location.startsWith(col.href) ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>
                    <col.icon size={16} /> {col.label}
                  </Link>
                ))}
              </div>}

              {/* Products & Stock group */}
              {(isModuleAllowed("products") || isModuleAllowed("stock")) && <div className="pt-1 pb-0.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 mb-1">Products & Stock</p>
                {[
                  ...(isModuleAllowed("products") ? [
                    { href: "/products",        label: "Products",       icon: Package           },
                    { href: "/product-groups",  label: "Product Groups",  icon: Layers            },
                    { href: "/brands",          label: "Brands",          icon: Bookmark          },
                    { href: "/categories",      label: "Categories",      icon: FolderOpen        },
                    { href: "/attributes",      label: "Attributes",      icon: SlidersHorizontal },
                    { href: "/units",           label: "Units",           icon: Ruler             },
                  ] : []),
                  ...(isModuleAllowed("stock") ? [
                    { href: "/stock",       label: "All Stock",   icon: Boxes },
                    { href: "/stock/holds", label: "Stock Holds", icon: Lock  },
                  ] : []),
                ].map(item => (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      location.startsWith(item.href) ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>
                    <item.icon size={16} /> {item.label}
                  </Link>
                ))}
              </div>}

              {/* Sales & Purchases group */}
              {(isModuleAllowed("sales") || isModuleAllowed("invoices") || isModuleAllowed("purchases")) && <div className="pt-1 pb-0.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 mb-1">Sales & Purchases</p>
                {[
                  ...(isModuleAllowed("sales") ? [
                    { href: "/sales",     label: "All Sales",  icon: Receipt  },
                    { href: "/sales/new", label: "New Sale",   icon: Plus     },
                  ] : []),
                  ...((isModuleAllowed("sales") || isModuleAllowed("invoices")) ? [
                    { href: "/invoices",      label: "Invoices",      icon: FileText   },
                    { href: "/calc-invoice",  label: "Calc Invoice",  icon: Calculator },
                  ] : []),
                  ...((isModuleAllowed("sales") || isModuleAllowed("sales_agents")) ? [
                    { href: "/sales-agents",  label: "Sales Agents",  icon: Users2     },
                  ] : []),
                  ...(isModuleAllowed("purchases") ? [
                    { href: "/purchases", label: "Purchases",  icon: ShoppingCart },
                  ] : []),
                ].map(item => (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      location.startsWith(item.href) ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>
                    <item.icon size={16} /> {item.label}
                  </Link>
                ))}
              </div>}

              {/* Documents */}
              {isModuleAllowed("documents") && <Link href="/documents"
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  location.startsWith("/documents") ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>
                <FileText size={16} /> Documents
              </Link>}

              {/* HRM group — uses same hrmItems computed above */}
              {hrmItems.length > 0 && <div className="pt-1 pb-0.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 mb-1">HRM</p>
                {hrmItems.map(item => (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      location.startsWith(item.href) ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>
                    <item.icon size={16} /> {item.label}
                  </Link>
                ))}
              </div>}
            </div>

            <div className="pt-2 mt-2 border-t border-gray-100">
              <button onClick={logout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Global search dialog ─────────────────────────────────────────────── */}
      <Dialog open={searchOpen} onOpenChange={v => { setSearchOpen(v); if (!v) setSearchQuery(""); }}>
        <DialogContent className="p-0 max-w-[520px] overflow-hidden gap-0">
          <Command shouldFilter={false} className="rounded-xl">
            <div className="flex items-center border-b border-border px-3">
              <Search size={15} className="text-muted-foreground mr-2 flex-shrink-0" />
              <CommandInput
                placeholder="Search leads, customers, suppliers, documents..."
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
              {hasQuery && searchResults?.suppliers.length ? (
                <CommandGroup heading="Suppliers">
                  {searchResults.suppliers.map(s => (
                    <CommandItem key={s.id} className="text-[13px] gap-2 cursor-pointer"
                      onSelect={() => { navigate("/suppliers"); setSearchOpen(false); setSearchQuery(""); }}>
                      <Truck size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{s.company}</span>
                      {s.contactPerson && <span className="text-muted-foreground text-[11px]">· {s.contactPerson}</span>}
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
              {hasQuery && searchResults?.purchases.length ? (
                <CommandGroup heading="Purchase Orders">
                  {searchResults.purchases.map(p => (
                    <CommandItem key={p.id} className="text-[13px] gap-2 cursor-pointer"
                      onSelect={() => { navigate("/purchases"); setSearchOpen(false); setSearchQuery(""); }}>
                      <ShoppingCart size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{p.poNumber}</span>
                      {p.supplier && <span className="text-muted-foreground text-[11px]">· {p.supplier}</span>}
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

        {/* ═══ LEFT SIDEBAR — people & products ══════════════════════════════ */}
        <nav className="hidden md:flex flex-col w-[54px] shrink-0 bg-white dark:bg-card border-r border-gray-100 dark:border-border overflow-y-auto py-2 scrollbar-none">

          {/* CRM */}
          <SidebarLink href="/leads"       icon={Users}      label="Leads"     active={location.startsWith("/leads")}       navigate={navigate} titleFull="Leads" />
          <SidebarLink href="/customers"   icon={UserCheck}  label="Customers" active={location.startsWith("/customers")}   navigate={navigate} titleFull="Customers" />
          <SidebarLink href="/suppliers"   icon={Truck}      label="Suppliers" active={location.startsWith("/suppliers")}   navigate={navigate} titleFull="Suppliers" />
          <SidebarLink href="/sales-agents"icon={Users2}     label="Agents"    active={location.startsWith("/sales-agents")}navigate={navigate} titleFull="Sales Agents" />

          <SidebarDivider />

          {/* HRM */}
          <SidebarLink href="/staff"       icon={Building2}  label="Staff"     active={location.startsWith("/staff")}       navigate={navigate} titleFull="Staff / HRM" />

          <SidebarDivider />

          {/* Products & stock */}
          <SidebarLink href="/products"    icon={Package}    label="Products"  active={location.startsWith("/products")}    navigate={navigate} titleFull="Products" />
          <SidebarLink href="/stock"       icon={Boxes}      label="Stock"     active={location.startsWith("/stock")}       navigate={navigate} titleFull="Stock" />
          <SidebarLink href="/raw-materials" icon={FlaskConical} label="Raw Mtl." active={location.startsWith("/raw-materials")} navigate={navigate} titleFull="Raw Materials" />

          <SidebarDivider />

          {/* Manufacturing */}
          <SidebarLink href="/manufacturing" icon={Factory} label="Mfg." active={location.startsWith("/manufacturing") || location.startsWith("/production-guide")} navigate={navigate} titleFull="Manufacturing" />
        </nav>

        {/* ═══ CENTER CONTENT ════════════════════════════════════════════════ */}
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto bg-gray-50 dark:bg-background">

          {/* Active-tenant banner */}
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

          <main className="flex-1">
            <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-6 md:py-8">
              {children}
            </div>
          </main>
        </div>

        {/* ═══ RIGHT SIDEBAR — quick-add shortcuts ═══════════════════════════ */}
        <nav className="hidden md:flex flex-col w-[54px] shrink-0 bg-white dark:bg-card border-l border-gray-100 dark:border-border overflow-y-auto py-2 scrollbar-none">
          {/* Purchases */}
          <SidebarLink href="/purchases"    icon={ShoppingCart} label="Purchase" active={location.startsWith("/purchases")}    navigate={navigate} titleFull="Purchase Orders" />

          <SidebarDivider />

          {/* Sales */}
          <SidebarLink href="/sales"        icon={Receipt}     label="Sales"     active={location.startsWith("/sales")}        navigate={navigate} titleFull="Sales / POS" />

          <SidebarDivider />

          {/* Invoicing */}
          <SidebarLink href="/invoices"     icon={FileText}    label="Invoice"   active={location.startsWith("/invoices")}     navigate={navigate} titleFull="Invoices" />
          <SidebarLink href="/calc-invoice" icon={Calculator}  label="Calc Inv." active={location.startsWith("/calc-invoice")} navigate={navigate} titleFull="Calc Invoice" />

          <SidebarDivider />

          {/* Accounting */}
          <SidebarLink href="/journal-entry?mode=expense" icon={Wallet}       label="Expense"  active={false}                                   navigate={navigate} titleFull="Record Expense" />
          <SidebarLink href="/journal-entry"              icon={ClipboardList}label="Journal"  active={location.startsWith("/journal-entry")}   navigate={navigate} titleFull="Journal Entry" />
        </nav>

      </div>
    </div>
  );
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────
function SidebarDivider() {
  return <div className="mx-3 my-1 h-px bg-gray-100 dark:bg-border shrink-0" />;
}

function SidebarLink({
  href, icon: Icon, label, active, navigate, titleFull,
}: {
  href: string; icon: React.ElementType; label: string;
  active: boolean; navigate: (to: string) => void; titleFull?: string;
}) {
  return (
    <button
      title={titleFull || label}
      onClick={() => navigate(href)}
      className={`flex flex-col items-center justify-center w-full py-2 px-1 gap-0.5 transition-colors shrink-0 group
        ${active
          ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
          : "text-gray-400 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted/40 hover:text-gray-700 dark:hover:text-foreground"
        }`}
    >
      <Icon size={15} />
      <span className="text-[8.5px] font-medium leading-none truncate w-full text-center px-0.5 mt-0.5">{label}</span>
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
