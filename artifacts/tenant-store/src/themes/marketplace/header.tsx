import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, User, LogIn, LogOut, ChevronDown } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useStore } from "@/contexts/store-context";
import { useCustomerSession, signOutPortal } from "@/hooks/use-customer-session";

const C = {
  navy:    "#0a1628",
  navy2:   "#0f2040",
  accent:  "#ff6b00",
  accent2: "#ffb300",
  muted:   "#afc3e0",
  border:  "rgba(255,255,255,0.07)",
};

export function MarketplaceHeader() {
  const { totalItems, openCart }     = useCart();
  const { storeName, categories, cms, tenantId } = useStore();
  const { session }                  = useCustomerSession();
  const [mobileOpen,  setMobileOpen] = useState(false);
  const [query,       setQuery]      = useState("");
  const [accountOpen, setAccountOpen]= useState(false);
  const [, navigate]  = useLocation();
  const accountRef    = useRef<HTMLDivElement>(null);

  const firstName = session?.customer.name?.split(" ")[0] ?? "";

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/shop?q=${encodeURIComponent(query.trim())}`);
  }

  function signOut() { signOutPortal(); setAccountOpen(false); }

  const portalBase    = `/customer-portal/?t=${encodeURIComponent(tenantId ?? "")}`;
  const portalSignIn  = `${portalBase}&tab=signin`;

  const navCats = categories.slice(0, 10).length > 0 ? categories.slice(0, 10) : [
    "Mobiles", "Laptops", "Audio", "Gaming", "Accessories", "Wearables",
  ];

  const TOP_PERKS = ["Free Shipping on Orders £35+", "30-Day Returns", "Buyer Protection Guaranteed"];

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif" }}>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div style={{ background: C.navy, color: "#afc3e0", fontSize: 12, padding: "6px 0", position: "relative", zIndex: 60 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 20 }}>
            {TOP_PERKS.map(p => (
              <span key={p} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: C.accent, fontSize: 10 }}>✦</span> {p}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {session ? (
              <span style={{ color: C.muted, fontSize: 12 }}>Hi, {firstName} 👋</span>
            ) : (
              <>
                <a href={portalSignIn} style={{ color: C.muted, textDecoration: "none", marginLeft: 16, fontSize: 12 }}>Sign In</a>
                <a href={`${portalBase}&tab=signup`} style={{ color: C.muted, textDecoration: "none", marginLeft: 16, fontSize: 12 }}>Register</a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Main header ─────────────────────────────────────────────── */}
      <header style={{
        background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 100%)`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1400, margin: "0 auto", padding: "0 24px",
          display: "flex", alignItems: "center", gap: 16, height: 68,
        }}>
          {/* Logo */}
          <Link href="/home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
            {(cms.brand.logoBase64 || cms.brand.logoUrl) ? (
              <img src={cms.brand.logoBase64 || cms.brand.logoUrl} alt={storeName} style={{ height: 40, objectFit: "contain" }}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
                  fontWeight: 900, fontSize: 20, color: "#fff",
                  boxShadow: "0 4px 16px rgba(255,107,0,0.4)",
                }}>
                  {storeName.charAt(0).toUpperCase() || "S"}
                </div>
                <div>
                  <div style={{ fontFamily: "'Barlow Condensed', 'Barlow', sans-serif", fontSize: 24, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                    {storeName || "Store"}
                  </div>
                  {cms.brand.tagline && (
                    <div style={{ fontSize: 9, color: C.muted, letterSpacing: "1.5px", textTransform: "uppercase", marginTop: 2 }}>
                      {cms.brand.tagline}
                    </div>
                  )}
                </div>
              </>
            )}
          </Link>

          {/* Search */}
          <form onSubmit={handleSearch} style={{
            flex: 1, display: "flex", maxWidth: 640,
            background: "#fff", borderRadius: 10, overflow: "hidden",
            border: "2px solid transparent", boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
          }}>
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${storeName || "products"}…`}
              style={{
                flex: 1, border: "none", outline: "none",
                padding: "0 16px", fontSize: 14,
                fontFamily: "'Barlow', sans-serif", color: "#1a2540",
              }}
            />
            <button type="submit" style={{
              background: `linear-gradient(135deg, ${C.accent}, #ff8c00)`,
              border: "none", padding: "0 22px", color: "#fff",
              fontSize: 18, cursor: "pointer",
            }}>
              🔍
            </button>
          </form>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
            {/* Account */}
            {session ? (
              <div ref={accountRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setAccountOpen(v => !v)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "8px 12px", color: C.muted, background: "none", border: "none",
                    borderRadius: 8, cursor: "pointer", gap: 2, fontFamily: "inherit",
                    transition: "background .2s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}
                >
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                    {firstName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>
                    {firstName} <ChevronDown size={10} />
                  </div>
                </button>
                {accountOpen && (
                  <div style={{
                    position: "absolute", right: 0, top: "100%", marginTop: 6,
                    width: 200, background: "#fff", borderRadius: 12,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: "1px solid #e3e8f0",
                    zIndex: 100, overflow: "hidden",
                  }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f4f8" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2540" }}>{session.customer.name}</div>
                      <div style={{ fontSize: 11, color: "#8a9bb5" }}>{session.customer.email}</div>
                    </div>
                    <a href={portalBase} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", color: "#1a2540", textDecoration: "none", fontSize: 13 }}>
                      <User size={13} /> My Account
                    </a>
                    <a href={`${portalBase}#orders`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", color: "#1a2540", textDecoration: "none", fontSize: 13 }}>
                      <ShoppingCart size={13} /> My Orders
                    </a>
                    <div style={{ borderTop: "1px solid #f0f4f8" }}>
                      <button onClick={signOut} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", color: "#e53e3e", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                        <LogOut size={13} /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <a href={portalSignIn} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px", color: C.muted, textDecoration: "none", borderRadius: 8, gap: 2, transition: "background .2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "none"; (e.currentTarget as HTMLAnchorElement).style.color = C.muted; }}
              >
                <LogIn size={20} />
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>Account</span>
              </a>
            )}

            {/* Cart */}
            <button onClick={openCart} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "8px 12px", color: C.muted, background: "none", border: "none",
              borderRadius: 8, cursor: "pointer", gap: 2, position: "relative",
              fontFamily: "inherit",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}
            >
              <span style={{ fontSize: 20 }}>🛒</span>
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>Cart</span>
              {totalItems > 0 && (
                <div style={{
                  position: "absolute", top: 4, right: 8,
                  background: C.accent, color: "#fff", borderRadius: "50%",
                  width: 18, height: 18, fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {totalItems > 9 ? "9+" : totalItems}
                </div>
              )}
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{ display: "none", padding: "8px 10px", color: C.muted, background: "none", border: "none", cursor: "pointer", fontSize: 20 }}
              className="mp-mobile-toggle"
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {/* ── Nav strip ───────────────────────────────────────────────── */}
        <nav style={{
          background: C.navy2,
          borderTop: `1px solid ${C.border}`,
          overflowX: "auto",
        }}>
          <div style={{
            maxWidth: 1400, margin: "0 auto", padding: "0 24px",
            display: "flex", alignItems: "center", gap: 0,
            scrollbarWidth: "none",
          }}>
            <Link href="/shop" style={{
              background: C.accent, color: "#fff", padding: "10px 16px",
              fontWeight: 800, fontSize: 13, textDecoration: "none",
              display: "flex", alignItems: "center", gap: 6,
              whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: ".5px",
              flexShrink: 0,
            }}>
              ☰ All Products
            </Link>
            {[
              { label: "Today's Deals",  href: "/shop?sort=price_asc" },
              { label: "New Arrivals",   href: "/shop?sort=newest" },
              { label: "Best Sellers",   href: "/shop?sort=popular" },
              { label: "Services",       href: "/services" },
              { label: "About Us",       href: "/about" },
              { label: "Contact",        href: "/contact" },
              ...navCats.slice(0, 4).map(c => ({ label: c, href: `/shop?cat=${encodeURIComponent(c)}` })),
            ].map(link => (
              <Link key={link.label} href={link.href} style={{
                color: C.muted, textDecoration: "none", padding: "10px 14px",
                fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
                borderBottom: "3px solid transparent", display: "block",
                transition: "color .2s, border-color .2s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = C.accent2; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.muted; (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = "transparent"; }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      {/* ── Mobile menu ─────────────────────────────────────────────── */}
      {mobileOpen && (
        <div style={{
          background: C.navy, padding: "16px 24px",
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
          overflowY: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>{storeName}</span>
            <button onClick={() => setMobileOpen(false)} style={{ color: "#fff", background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>
          {["/home", "/shop", "/services", "/about", "/contact"].map(path => (
            <Link key={path} href={path} onClick={() => setMobileOpen(false)}
              style={{ display: "block", color: C.muted, textDecoration: "none", padding: "12px 0", fontSize: 16, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>
              {path.replace("/", "").replace("-", " ").replace(/^\w/, c => c.toUpperCase()) || "Home"}
            </Link>
          ))}
        </div>
      )}

      {/* Font injection for marketplace theme */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap');
        .mp-mobile-toggle { display: none !important; }
        @media (max-width: 768px) { .mp-mobile-toggle { display: flex !important; } }
      `}</style>
    </div>
  );
}
