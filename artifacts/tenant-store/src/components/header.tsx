import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Search, Menu, X, Zap, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useStore } from "@/contexts/store-context";
import { cn } from "@/lib/utils";

const ANNOUNCEMENT_BG: Record<string, string> = {
  blue:    "bg-blue-600 text-white",
  emerald: "bg-emerald-600 text-white",
  amber:   "bg-amber-500 text-white",
  red:     "bg-red-600 text-white",
  purple:  "bg-purple-600 text-white",
  slate:   "bg-slate-800 text-white",
};

export function Header() {
  const { totalItems, openCart } = useCart();
  const { storeName, categories, cms, tenantId } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [location, navigate] = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { header: hdr, brand } = cms;
  const hasAnnouncement = hdr.announcementEnabled && hdr.announcementText.trim();
  const announcementBgCls = ANNOUNCEMENT_BG[hdr.announcementBg] ?? ANNOUNCEMENT_BG.blue;
  const spacerH = hasAnnouncement ? "h-[100px]" : "h-16";

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50);
  }, [searchOpen]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/shop?q=${encodeURIComponent(query.trim())}`);
    setSearchOpen(false);
  }

  const navLinks = [
    { label: "Home",     href: "/home"     },
    { label: "Shop",     href: "/shop"     },
    { label: "Services", href: "/services" },
    { label: "About Us", href: "/about"    },
    { label: "Contact",  href: "/contact"  },
  ];

  return (
    <>
      {/* ── Announcement Bar ────────────────────────────────────────────── */}
      {hasAnnouncement && (
        hdr.announcementLink ? (
          <Link href={hdr.announcementLink}
            className={cn("fixed top-0 left-0 right-0 z-[55] flex items-center justify-center gap-2 h-9 text-[12px] font-semibold text-center px-4 transition-colors hover:opacity-90", announcementBgCls)}>
            {hdr.announcementText}
          </Link>
        ) : (
          <div className={cn("fixed top-0 left-0 right-0 z-[55] flex items-center justify-center gap-2 h-9 text-[12px] font-semibold text-center px-4", announcementBgCls)}>
            {hdr.announcementText}
          </div>
        )
      )}

      {/* ── Main Header ─────────────────────────────────────────────────── */}
      <header className={cn(
        "fixed left-0 right-0 z-50 transition-all duration-200",
        hasAnnouncement ? "top-9" : "top-0",
        scrolled
          ? "bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm dark:bg-slate-900/95 dark:border-slate-800"
          : "bg-white border-b border-gray-100 dark:bg-slate-900 dark:border-slate-800/50"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/home" className="flex items-center gap-2 shrink-0">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={storeName} className="h-8 w-auto object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Zap size={16} className="text-white fill-white" />
                </div>
              )}
              <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {storeName}
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map(link => {
                const isActive = location === link.href ||
                  (link.href === "/home" && (location === "/" || location === ""));
                return (
                  <Link key={link.href} href={link.href}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40"
                        : "text-slate-600 hover:text-slate-900 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
                    )}>
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button onClick={() => setSearchOpen(true)}
                className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                aria-label="Search">
                <Search size={18} />
              </button>

              {/* My Account — desktop */}
              {tenantId && (
                <a
                  href={`/customer-portal/?t=${encodeURIComponent(tenantId)}`}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                  aria-label="My Account"
                >
                  <User size={16} />
                  <span>My Account</span>
                </a>
              )}

              <button onClick={openCart}
                className="relative p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                aria-label="Cart">
                <ShoppingCart size={18} />
                {totalItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {totalItems > 9 ? "9+" : totalItems}
                  </span>
                )}
              </button>
              <button className="md:hidden p-2 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 px-4 py-3 space-y-1">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                {link.label}
              </Link>
            ))}
            {tenantId && (
              <a
                href={`/customer-portal/?t=${encodeURIComponent(tenantId)}`}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                <User size={15} />
                My Account
              </a>
            )}
          </div>
        )}
      </header>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <form onSubmit={handleSearch}
            className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-slate-700">
            <div className="flex items-center px-4">
              <Search size={18} className="text-gray-400 shrink-0" />
              <input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search products, brands, categories..."
                className="flex-1 px-3 py-4 text-slate-900 dark:text-white bg-transparent outline-none text-sm placeholder:text-gray-400" />
              <button type="button" onClick={() => setSearchOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={16} />
              </button>
            </div>
            {query && (
              <div className="border-t border-gray-100 dark:border-slate-800 px-4 py-2">
                <button type="submit" className="w-full text-left text-sm text-blue-600 dark:text-blue-400 py-2 hover:underline">
                  Search for "<span className="font-medium">{query}</span>"
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Spacer */}
      <div className={spacerH} />
    </>
  );
}
