import { Link, useLocation } from "wouter";
import { ShoppingBag, LayoutDashboard, User, LogOut, Menu, X, Coins, Store } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", href: "/",         icon: LayoutDashboard },
  { label: "Orders",    href: "/orders",   icon: ShoppingBag },
  { label: "Club Card", href: "/clubcard", icon: Coins },
  { label: "Profile",   href: "/profile",  icon: User },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { session, settings, logout } = useAuth();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const storeName = settings.storeName || "Customer Portal";
  const initials = session?.customer.name
    ? session.customer.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="min-h-screen bg-[#f7f8fa] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <ShoppingBag size={15} className="text-white" />
            </div>
            <span className="font-semibold text-[15px] text-gray-900 tracking-tight truncate max-w-[160px]">
              {storeName}
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <span className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13.5px] font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}>
                    <Icon size={14} />
                    {label}
                  </span>
                </Link>
              );
            })}
            {session?.tenantId && (
              <a
                href={`/tenant-store/${encodeURIComponent(session.tenantId)}/shop`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13.5px] font-medium transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                <Store size={14} />
                Shop
              </a>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                {initials}
              </div>
              <span className="text-[13px] text-gray-700 hidden md:block max-w-[120px] truncate">
                {session?.customer.name}
              </span>
            </div>
            <button
              onClick={logout}
              className="hidden sm:flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="sm:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="sm:hidden border-t border-gray-100 bg-white px-4 pb-3 pt-2 space-y-1">
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <span
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-[14px] font-medium cursor-pointer",
                      active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <Icon size={15} />
                    {label}
                  </span>
                </Link>
              );
            })}
            {session?.tenantId && (
              <a
                href={`/tenant-store/${encodeURIComponent(session.tenantId)}/shop`}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-[14px] font-medium text-gray-600 hover:bg-gray-50"
              >
                <Store size={15} />
                Shop
              </a>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-[14px] text-gray-500 hover:text-gray-800 w-full rounded-md hover:bg-gray-50"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
