import {
  ShoppingCart, CreditCard, Receipt, PlusCircle, Undo2, FileText,
  Calculator, Wallet, ClipboardList, TrendingUp, Landmark, Package,
  Users, PhoneCall, Truck, BarChart3, Tag, Factory, FileBarChart, BookOpen,
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
