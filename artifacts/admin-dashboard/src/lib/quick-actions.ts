import {
  ShoppingCart, CreditCard, Receipt, PlusCircle, Undo2, FileText,
  Calculator, Wallet, ClipboardList, TrendingUp, Landmark, Package,
  Users, PhoneCall, Truck, BarChart3, Tag, Factory, FileBarChart, BookOpen,
  UserCheck, Users2, Building2, KeyRound, Layers, FlaskConical, MapPin,
  Image as ImageIcon, Settings, FolderOpen, SlidersHorizontal, Ruler,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type QuickActionDef = {
  id:        string;
  label:     string;
  titleFull: string;
  href:      string;
  icon:      LucideIcon;
  color:     string;
  group:     string;
};

export type QuickActionItem = {
  id:      string;
  visible: boolean;
};

export const QUICK_ACTIONS_REGISTRY: QuickActionDef[] = [
  // ── Purchasing ───────────────────────────────────────────────────────────
  { id: "purchase-invoices",  label: "Purchase",  titleFull: "Purchase Invoices",    href: "/invoices?type=purchase",     icon: ShoppingCart,  color: "indigo",  group: "Purchasing" },
  { id: "receipts-payments",  label: "Receipts",  titleFull: "Receipts & Payments",  href: "/receipt-payment",            icon: CreditCard,    color: "green",   group: "Purchasing" },
  // ── Sales ────────────────────────────────────────────────────────────────
  { id: "sales",              label: "Sales",     titleFull: "Sales / POS",          href: "/sales",                      icon: Receipt,       color: "emerald", group: "Sales" },
  { id: "new-sale",           label: "New Sale",  titleFull: "New Sale (POS)",       href: "/sales/new",                  icon: PlusCircle,    color: "teal",    group: "Sales" },
  { id: "sale-return",        label: "Returns",   titleFull: "Sale Returns",         href: "/sale-return",                icon: Undo2,         color: "red",     group: "Sales" },
  // ── Invoicing ─────────────────────────────────────────────────────────────
  { id: "invoices",           label: "Invoices",  titleFull: "Invoices",             href: "/invoices",                   icon: FileText,      color: "blue",    group: "Invoicing" },
  { id: "calc-invoice",       label: "Calc Inv.", titleFull: "Calc Invoice",         href: "/calc-invoice",               icon: Calculator,    color: "purple",  group: "Invoicing" },
  // ── Accounting ────────────────────────────────────────────────────────────
  { id: "expense",            label: "Expense",   titleFull: "Record Expense",       href: "/journal-entry?mode=expense", icon: Wallet,        color: "amber",   group: "Accounting" },
  { id: "journal-entry",      label: "Journal",   titleFull: "Journal Entry",        href: "/journal-entry",              icon: ClipboardList, color: "teal",    group: "Accounting" },
  { id: "pls-report",         label: "P & L",     titleFull: "P&L Statement",        href: "/pls-report",                 icon: TrendingUp,    color: "sky",     group: "Accounting" },
  { id: "balance-sheet",      label: "Balance",   titleFull: "Balance Sheet",        href: "/balance-sheet",              icon: Landmark,      color: "violet",  group: "Accounting" },
  { id: "chart-of-accounts",  label: "Accounts",  titleFull: "Chart of Accounts",    href: "/chart-of-accounts",          icon: BookOpen,      color: "slate",   group: "Accounting" },
  { id: "income-report",      label: "Income",    titleFull: "Income Report",        href: "/income-report",              icon: FileBarChart,  color: "emerald", group: "Accounting" },
  // ── CRM ───────────────────────────────────────────────────────────────────
  { id: "leads",              label: "Leads",     titleFull: "Leads Pipeline",       href: "/leads",                      icon: PhoneCall,     color: "indigo",  group: "CRM" },
  { id: "customers",          label: "Customers", titleFull: "Customers",            href: "/customers",                  icon: Users,         color: "emerald", group: "CRM" },
  { id: "suppliers",          label: "Suppliers", titleFull: "Suppliers",            href: "/suppliers",                  icon: Truck,         color: "orange",  group: "CRM" },
  // ── Inventory ─────────────────────────────────────────────────────────────
  { id: "products",           label: "Products",  titleFull: "Products",             href: "/products",                   icon: Package,       color: "blue",    group: "Inventory" },
  { id: "stock-ledger",       label: "Stock",     titleFull: "Stock Ledger",         href: "/stock-ledger",               icon: BarChart3,     color: "cyan",    group: "Inventory" },
  { id: "categories",         label: "Categories",titleFull: "Product Categories",   href: "/categories",                 icon: Tag,           color: "pink",    group: "Inventory" },
  // ── Manufacturing ─────────────────────────────────────────────────────────
  { id: "manufacturing",      label: "Mfg.",      titleFull: "Manufacturing",        href: "/manufacturing",              icon: Factory,       color: "orange",  group: "Manufacturing" },
];

export const DEFAULT_QUICK_ACTIONS: QuickActionItem[] = [
  { id: "purchase-invoices",  visible: true  },
  { id: "receipts-payments",  visible: true  },
  { id: "sales",              visible: true  },
  { id: "new-sale",           visible: true  },
  { id: "sale-return",        visible: true  },
  { id: "invoices",           visible: true  },
  { id: "calc-invoice",       visible: true  },
  { id: "expense",            visible: true  },
  { id: "journal-entry",      visible: true  },
  { id: "pls-report",         visible: true  },
  { id: "balance-sheet",      visible: true  },
  { id: "chart-of-accounts",  visible: false },
  { id: "income-report",      visible: false },
  { id: "leads",              visible: false },
  { id: "customers",          visible: false },
  { id: "suppliers",          visible: false },
  { id: "products",           visible: false },
  { id: "stock-ledger",       visible: false },
  { id: "categories",         visible: false },
  { id: "manufacturing",      visible: false },
];

// ─── Left Sidebar Registry ────────────────────────────────────────────────────
export const LEFT_ACTIONS_REGISTRY: QuickActionDef[] = [
  // ── CRM ───────────────────────────────────────────────────────────────────
  { id: "l-leads",            label: "Leads",      titleFull: "Leads Pipeline",         href: "/leads",             icon: Users,           color: "violet",  group: "CRM"           },
  { id: "l-customers",        label: "Customers",  titleFull: "Customers",              href: "/customers",         icon: UserCheck,       color: "emerald", group: "CRM"           },
  { id: "l-suppliers",        label: "Suppliers",  titleFull: "Suppliers",              href: "/suppliers",         icon: Truck,           color: "amber",   group: "CRM"           },
  { id: "l-agents",           label: "Agents",     titleFull: "Sales Agents",           href: "/sales-agents",      icon: Users2,          color: "teal",    group: "CRM"           },
  { id: "l-agent-perf",       label: "Perf",       titleFull: "Agent Performance",      href: "/agent-performance", icon: BarChart3,       color: "violet",  group: "CRM"           },
  { id: "l-areas",            label: "Areas",      titleFull: "Areas & Regions",        href: "/areas",             icon: MapPin,          color: "lime",    group: "CRM"           },
  // ── HRM ───────────────────────────────────────────────────────────────────
  { id: "l-staff",            label: "Staff",      titleFull: "Staff / HRM",            href: "/staff",             icon: Building2,       color: "rose",    group: "HRM"           },
  { id: "l-roles",            label: "Roles",      titleFull: "HRM Roles",              href: "/roles",             icon: KeyRound,        color: "pink",    group: "HRM"           },
  { id: "l-hrm-org",          label: "Org",        titleFull: "Depts & Designations",   href: "/hrm-org",           icon: Layers,          color: "orange",  group: "HRM"           },
  // ── Catalogue ─────────────────────────────────────────────────────────────
  { id: "l-products",         label: "Products",   titleFull: "Products",               href: "/products",          icon: Package,         color: "blue",    group: "Catalogue"     },
  { id: "l-categories",       label: "Categories", titleFull: "Product Categories",     href: "/categories",        icon: FolderOpen,      color: "fuchsia", group: "Catalogue"     },
  { id: "l-brands",           label: "Brands",     titleFull: "Brands",                 href: "/brands",            icon: Tag,             color: "sky",     group: "Catalogue"     },
  { id: "l-attributes",       label: "Attributes", titleFull: "Product Attributes",     href: "/attributes",        icon: SlidersHorizontal, color: "purple", group: "Catalogue"   },
  { id: "l-units",            label: "Units",      titleFull: "Units of Measure",       href: "/units",             icon: Ruler,           color: "slate",   group: "Catalogue"     },
  { id: "l-media",            label: "Media",      titleFull: "Media Library",          href: "/media",             icon: ImageIcon,       color: "indigo",  group: "Catalogue"     },
  { id: "l-stock-ledger",     label: "Ledger",     titleFull: "Stock Ledger",           href: "/stock-ledger",      icon: BookOpen,        color: "indigo",  group: "Catalogue"     },
  { id: "l-raw-materials",    label: "Raw Mtl.",   titleFull: "Raw Materials",          href: "/raw-materials",     icon: FlaskConical,    color: "cyan",    group: "Catalogue"     },
  // ── Manufacturing ─────────────────────────────────────────────────────────
  { id: "l-manufacturing",    label: "Mfg.",       titleFull: "Manufacturing",          href: "/manufacturing",     icon: Factory,         color: "orange",  group: "Manufacturing" },
  { id: "l-prod-guide",       label: "Guide",      titleFull: "Production Guide",       href: "/production-guide",  icon: FileText,        color: "amber",   group: "Manufacturing" },
  // ── Settings ──────────────────────────────────────────────────────────────
  { id: "l-settings",         label: "Settings",   titleFull: "Settings",               href: "/settings",          icon: Settings,        color: "slate",   group: "Settings"      },
];

export const DEFAULT_LEFT_QUICK_ACTIONS: QuickActionItem[] = [
  { id: "l-leads",            visible: true  },
  { id: "l-customers",        visible: true  },
  { id: "l-suppliers",        visible: true  },
  { id: "l-agents",           visible: true  },
  { id: "l-agent-perf",       visible: true  },
  { id: "l-areas",            visible: true  },
  { id: "l-staff",            visible: true  },
  { id: "l-roles",            visible: true  },
  { id: "l-hrm-org",          visible: true  },
  { id: "l-products",         visible: true  },
  { id: "l-categories",       visible: true  },
  { id: "l-brands",           visible: false },
  { id: "l-attributes",       visible: false },
  { id: "l-units",            visible: false },
  { id: "l-media",            visible: false },
  { id: "l-stock-ledger",     visible: true  },
  { id: "l-raw-materials",    visible: true  },
  { id: "l-manufacturing",    visible: true  },
  { id: "l-prod-guide",       visible: false },
  { id: "l-settings",         visible: false },
];
