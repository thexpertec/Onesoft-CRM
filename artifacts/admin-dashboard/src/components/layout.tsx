import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, FileText, Moon, Sun, Menu, X,
  LogIn, LogOut, Lock, ShieldCheck, Shield, UserCheck, Package, Truck,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/contexts/auth-context";
import { useState, useEffect } from "react";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";

const BASE_NAV = [
  { href: "/",          label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads",     label: "Leads",     icon: Users },
  { href: "/customers", label: "Customers", icon: UserCheck },
  { href: "/products",  label: "Products",  icon: Package },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/documents", label: "Documents", icon: FileText },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { isAuthenticated, isSuperAdmin, currentUser, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location]);

  const navItems = isSuperAdmin
    ? [...BASE_NAV, { href: "/users", label: "Users", icon: Shield }]
    : BASE_NAV;

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col">

      {/* ── Top navbar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white dark:bg-card border-b border-gray-100 dark:border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-[1600px] mx-auto px-5 md:px-8 h-[58px] flex items-center gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            <img src={logoUrl} alt="Onesoft" className="h-7 dark:brightness-0 dark:invert" />
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-gray-300 dark:text-muted-foreground select-none">
              Admin
            </span>
          </Link>

          {/* Divider */}
          <div className="hidden md:block h-5 w-px bg-gray-100 dark:bg-border flex-shrink-0" />

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto">
            {navItems.map(item => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all duration-150 ${
                    isActive
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                      : "text-gray-500 hover:text-gray-800 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted/40"
                  }`}
                >
                  <item.icon
                    size={14}
                    className={isActive ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-muted-foreground"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              data-testid="toggle-theme"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {isAuthenticated ? (
              <>
                {/* User pill */}
                <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-muted border border-gray-100 dark:border-border">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isSuperAdmin ? "bg-purple-100 dark:bg-purple-900" : "bg-blue-100 dark:bg-blue-900"}`}>
                    {isSuperAdmin
                      ? <ShieldCheck size={11} className="text-purple-600 dark:text-purple-400" />
                      : <Lock size={11} className="text-blue-600 dark:text-blue-400" />}
                  </div>
                  <span className="text-[12px] font-medium text-gray-700 dark:text-foreground leading-none">
                    {currentUser?.fullName || currentUser?.username}
                  </span>
                  {isSuperAdmin && (
                    <span className="text-[9px] font-bold bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 px-1 rounded">
                      SA
                    </span>
                  )}
                </div>
                {/* Sign out */}
                <button
                  onClick={logout}
                  data-testid="btn-logout"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-800 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
                >
                  <LogOut size={13} />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <Link href="/login">
                <button
                  data-testid="btn-go-login"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                >
                  <LogIn size={13} />
                  Login
                </button>
              </Link>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-border bg-white dark:bg-card px-4 pb-3 pt-2 space-y-0.5">
            {navItems.map(item => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
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
            {isAuthenticated && (
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:text-muted-foreground dark:hover:bg-muted transition-colors"
              >
                <LogOut size={16} />
                Sign out
              </button>
            )}
          </div>
        )}
      </header>

      {/* ── Read-only banner ─────────────────────────────────────────────────── */}
      {!isAuthenticated && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40 px-5 md:px-8 py-2">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 text-[12px] text-amber-700 dark:text-amber-400">
            <span className="flex items-center gap-1.5">
              <Lock size={11} className="flex-shrink-0" />
              Viewing in <strong>read-only mode</strong>. Login to create, edit, or delete records.
            </span>
            <Link href="/login">
              <button
                data-testid="btn-login-banner"
                className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 underline hover:no-underline"
              >
                Login
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-5 md:px-8 py-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
