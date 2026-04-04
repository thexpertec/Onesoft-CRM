import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, FileText, Moon, Sun, Menu, X,
  LogOut, Lock, ShieldCheck, Shield, UserCheck, Package, Truck,
  Bell, Plus, Search, ChevronDown, UserPlus, FilePlus, Tag,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/contexts/auth-context";
import { getLeads, getCustomers, getSuppliers, getDocs } from "@/lib/store";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";

// ─── Nav config ───────────────────────────────────────────────────────────────
type SubItem = { label: string; href: string; icon: React.ElementType };
type NavItem = { href: string; label: string; icon: React.ElementType; items: SubItem[] | null };

const BASE_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, items: null },
  {
    href: "/leads", label: "Leads", icon: Users,
    items: [
      { label: "All Leads",   href: "/leads", icon: Users },
      { label: "Add Lead",    href: "/leads", icon: UserPlus },
    ],
  },
  {
    href: "/customers", label: "Customers", icon: UserCheck,
    items: [
      { label: "All Customers",    href: "/customers", icon: UserCheck },
      { label: "Add Customer",     href: "/customers", icon: UserPlus },
    ],
  },
  {
    href: "/products", label: "Products", icon: Package,
    items: [
      { label: "All Products",        href: "/products", icon: Package },
      { label: "Manage Categories",   href: "/products", icon: Tag },
    ],
  },
  {
    href: "/suppliers", label: "Suppliers", icon: Truck,
    items: [
      { label: "All Suppliers",  href: "/suppliers", icon: Truck },
      { label: "Add Supplier",   href: "/suppliers", icon: UserPlus },
    ],
  },
  {
    href: "/documents", label: "Documents", icon: FileText,
    items: [
      { label: "All Documents",  href: "/documents",     icon: FileText },
      { label: "New Document",   href: "/documents/new", icon: FilePlus },
    ],
  },
];

const USERS_NAV: NavItem = {
  href: "/users", label: "Users", icon: Shield,
  items: [{ label: "All Users", href: "/users", icon: Shield }],
};

const QUICK_ADD: SubItem[] = [
  { label: "New Lead",       href: "/leads",         icon: UserPlus },
  { label: "New Customer",   href: "/customers",     icon: UserCheck },
  { label: "New Supplier",   href: "/suppliers",     icon: Truck },
  { label: "New Document",   href: "/documents/new", icon: FilePlus },
];

// ─── Layout ───────────────────────────────────────────────────────────────────
export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { theme, setTheme } = useTheme();
  const { isSuperAdmin, currentUser, logout } = useAuth();
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { setMobileOpen(false); }, [location]);

  // Ctrl+K / ⌘K shortcut
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

  const navItems = isSuperAdmin ? [...BASE_NAV, USERS_NAV] : BASE_NAV;
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const userInitials = (currentUser?.fullName || currentUser?.username || "?")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  // Live search results (min 2 chars)
  const q = searchQuery.toLowerCase();
  const hasQuery = q.length >= 2;
  const searchResults = hasQuery ? {
    leads:     getLeads().filter(l =>
      l.name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)
    ).slice(0, 5),
    customers: getCustomers().filter(c =>
      c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)
    ).slice(0, 5),
    suppliers: getSuppliers().filter(s =>
      s.company?.toLowerCase().includes(q) || s.contactPerson?.toLowerCase().includes(q)
    ).slice(0, 5),
    docs: getDocs().filter(d =>
      d.title?.toLowerCase().includes(q) || d.clientName?.toLowerCase().includes(q)
    ).slice(0, 5),
  } : null;

  const hasResults = searchResults &&
    (searchResults.leads.length + searchResults.customers.length +
     searchResults.suppliers.length + searchResults.docs.length) > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col">

      {/* ═══════════════════════════════════════════════════════════════════════
          ROW 1 — Brand · Search · Actions
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 bg-white dark:bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)]">

        <div className="max-w-[1600px] mx-auto px-5 md:px-8 h-[60px] flex items-center gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <img src={logoUrl} alt="Onesoft" className="h-7 dark:brightness-0 dark:invert" />
          </Link>

          <div className="hidden md:block h-5 w-px bg-gray-100 dark:bg-border mx-1 flex-shrink-0" />

          {/* Search bar */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex-1 max-w-md flex items-center gap-2 h-9 px-3 rounded-lg bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border text-left text-[13px] text-gray-400 dark:text-muted-foreground hover:border-blue-300 dark:hover:border-blue-700 hover:bg-white dark:hover:bg-muted transition-colors group"
            data-testid="btn-open-search"
          >
            <Search size={14} className="flex-shrink-0 text-gray-400 group-hover:text-blue-400 transition-colors" />
            <span className="flex-1">Search anything...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] border border-gray-200 dark:border-border px-1.5 py-0.5 rounded bg-white dark:bg-card text-gray-300 font-mono">
              ⌘K
            </kbd>
          </button>

          {/* ── Right actions ── */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">

            {/* Theme */}
            <button
              onClick={toggleTheme}
              data-testid="toggle-theme"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Notifications */}
            <button
              title="Notifications"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors relative"
            >
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-card" />
            </button>

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
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Create New
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {QUICK_ADD.map(item => (
                  <DropdownMenuItem
                    key={item.label}
                    className="gap-2 cursor-pointer text-[13px]"
                    onClick={() => navigate(item.href)}
                  >
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
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${isSuperAdmin ? "bg-purple-500" : "bg-blue-500"}`}>
                    {userInitials}
                  </div>
                  <div className="hidden sm:block text-left min-w-0">
                    <p className="text-[12px] font-semibold text-gray-800 dark:text-foreground leading-tight truncate max-w-[100px]">
                      {currentUser?.fullName || currentUser?.username}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-muted-foreground leading-tight">
                      {isSuperAdmin ? "Super Admin" : "Admin"}
                    </p>
                  </div>
                  <ChevronDown size={11} className="text-gray-400 hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-3 border-b border-border flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0 ${isSuperAdmin ? "bg-purple-500" : "bg-blue-500"}`}>
                    {userInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{currentUser?.fullName || currentUser?.username}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {currentUser?.email || (isSuperAdmin ? "superadmin@onesoft.com" : "admin@onesoft.com")}
                    </p>
                    <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSuperAdmin ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300" : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"}`}>
                      {isSuperAdmin ? "Super Admin" : "Admin"}
                    </span>
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
                  <DropdownMenuItem
                    onClick={logout}
                    data-testid="btn-logout"
                    className="gap-2 cursor-pointer text-[13px] text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                  >
                    <LogOut size={13} />
                    Sign Out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile hamburger */}
            <button
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            ROW 2 — Navigation bar with dropdowns (desktop)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="hidden md:block border-t border-gray-100 dark:border-border bg-white dark:bg-card">
          <div className="max-w-[1600px] mx-auto px-5 md:px-8 flex items-stretch h-[40px] gap-0">
            {navItems.map(item => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));

              const linkClass = `flex items-center gap-1.5 px-3.5 h-full text-[13px] font-medium whitespace-nowrap border-b-2 transition-all duration-150 ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted/40"
              }`;

              if (!item.items) {
                return (
                  <Link key={item.href} href={item.href} data-testid={`nav-${item.label.toLowerCase()}`} className={linkClass}>
                    <item.icon size={13} className={isActive ? "text-blue-500" : "text-gray-400"} />
                    {item.label}
                  </Link>
                );
              }

              return (
                <DropdownMenu key={item.href}>
                  <DropdownMenuTrigger asChild>
                    <button data-testid={`nav-${item.label.toLowerCase()}`} className={linkClass + " group"}>
                      <item.icon size={13} className={isActive ? "text-blue-500" : "text-gray-400"} />
                      {item.label}
                      <ChevronDown size={11} className="ml-0.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={0} className="w-48 rounded-t-none">
                    {item.items.map((sub, idx) => (
                      <DropdownMenuItem key={idx} asChild>
                        <Link href={sub.href} className="flex items-center gap-2 cursor-pointer text-[13px]">
                          <sub.icon size={13} className="text-muted-foreground" />
                          {sub.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-border bg-white dark:bg-card px-4 pb-4 pt-2 space-y-0.5">
            {navItems.map(item => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                      : "text-gray-500 hover:text-gray-900 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted"
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
            <div className="pt-2 border-t border-gray-100 dark:border-border mt-2">
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <LogOut size={16} />
                Sign Out
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
                className="h-12 text-[13px] border-0 outline-none ring-0 shadow-none focus:ring-0 flex-1 bg-transparent"
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
                <CommandEmpty className="py-10 text-[13px]">
                  No results for &ldquo;{searchQuery}&rdquo;
                </CommandEmpty>
              )}
              {hasQuery && searchResults && searchResults.leads.length > 0 && (
                <CommandGroup heading="Leads">
                  {searchResults.leads.map(l => (
                    <CommandItem key={l.id} className="text-[13px] gap-2 cursor-pointer" onSelect={() => { navigate("/leads"); setSearchOpen(false); setSearchQuery(""); }}>
                      <Users size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{l.name}</span>
                      {l.company && <span className="text-muted-foreground text-[11px]">· {l.company}</span>}
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        l.status === "Won" ? "bg-emerald-100 text-emerald-700" : l.status === "Lost" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                      }`}>{l.status}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {hasQuery && searchResults && searchResults.customers.length > 0 && (
                <CommandGroup heading="Customers">
                  {searchResults.customers.map(c => (
                    <CommandItem key={c.id} className="text-[13px] gap-2 cursor-pointer" onSelect={() => { navigate("/customers"); setSearchOpen(false); setSearchQuery(""); }}>
                      <UserCheck size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{c.name}</span>
                      {c.company && <span className="text-muted-foreground text-[11px]">· {c.company}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {hasQuery && searchResults && searchResults.suppliers.length > 0 && (
                <CommandGroup heading="Suppliers">
                  {searchResults.suppliers.map(s => (
                    <CommandItem key={s.id} className="text-[13px] gap-2 cursor-pointer" onSelect={() => { navigate("/suppliers"); setSearchOpen(false); setSearchQuery(""); }}>
                      <Truck size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{s.company}</span>
                      {s.contactPerson && <span className="text-muted-foreground text-[11px]">· {s.contactPerson}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {hasQuery && searchResults && searchResults.docs.length > 0 && (
                <CommandGroup heading="Documents">
                  {searchResults.docs.map(d => (
                    <CommandItem key={d.id} className="text-[13px] gap-2 cursor-pointer" onSelect={() => { navigate(`/documents/${d.id}`); setSearchOpen(false); setSearchQuery(""); }}>
                      <FileText size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{d.title || d.clientName || "Untitled"}</span>
                      {d.company && <span className="text-muted-foreground text-[11px]">· {d.company}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-5 md:px-8 py-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
