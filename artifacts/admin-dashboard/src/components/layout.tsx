import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, FileText, Moon, Sun, Menu, LogIn, LogOut, Lock, ShieldCheck, Shield, UserCheck } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";

const BASE_NAV = [
  { href: "/",          label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads",     label: "Leads",     icon: Users },
  { href: "/customers", label: "Customers", icon: UserCheck },
  { href: "/documents", label: "Documents", icon: FileText },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { isAuthenticated, isSuperAdmin, currentUser, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => { setIsMobileOpen(false); }, [location]);

  const navItems = isSuperAdmin
    ? [...BASE_NAV, { href: "/users", label: "Users", icon: Shield }]
    : BASE_NAV;

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
        <img src={logoUrl} alt="Onesoft Logo" className="h-8 mr-2 brightness-0 invert" />
        <span className="font-semibold text-lg tracking-tight">Admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className={`mr-3 flex-shrink-0 h-5 w-5 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        {isAuthenticated ? (
          <>
            {/* Signed-in user info */}
            <div className="flex items-start gap-2.5 px-3 py-2 rounded-md bg-sidebar-accent/30">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                {isSuperAdmin ? (
                  <ShieldCheck size={13} className="text-purple-400" />
                ) : (
                  <Lock size={13} className="text-green-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">
                  {currentUser?.fullName || currentUser?.username}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50 truncate">
                  {isSuperAdmin ? "Super Admin" : "Admin"}
                  {currentUser?.email ? ` · ${currentUser.email}` : ""}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              onClick={logout}
              data-testid="btn-logout"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign Out
            </Button>
          </>
        ) : (
          <Link href="/login">
            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              data-testid="btn-go-login"
            >
              <LogIn className="mr-3 h-5 w-5" />
              Admin Login
            </Button>
          </Link>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          onClick={toggleTheme}
          data-testid="toggle-theme"
        >
          {theme === "dark" ? <Sun className="mr-3 h-5 w-5" /> : <Moon className="mr-3 h-5 w-5" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <SidebarContent />
      </div>

      {/* Mobile Header & Sidebar */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="md:hidden flex h-16 items-center justify-between bg-sidebar px-4 border-b border-sidebar-border">
          <div className="flex items-center text-sidebar-foreground">
            <img src={logoUrl} alt="Onesoft Logo" className="h-8 mr-2 brightness-0 invert" />
            <span className="font-semibold">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            {!isAuthenticated && (
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent text-xs">
                  <LogIn className="h-4 w-4 mr-1" /> Login
                </Button>
              </Link>
            )}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar border-r-sidebar-border">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Read-only banner */}
        {!isAuthenticated && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between gap-3 text-sm text-amber-800 dark:text-amber-300">
            <span className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 flex-shrink-0" />
              <span>You are viewing in <strong>read-only mode</strong>. Login to create, edit, or delete records.</span>
            </span>
            <Link href="/login">
              <Button size="sm" variant="outline" className="border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900 h-7 text-xs flex-shrink-0" data-testid="btn-login-banner">
                Login
              </Button>
            </Link>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
