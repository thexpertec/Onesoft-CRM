import { Link } from "wouter";
import { useStore } from "@/contexts/store-context";

const C = { navy: "#0a1628", accent: "#ff6b00", accent2: "#ffb300", muted: "#afc3e0", dim: "#4a6080", border: "rgba(255,255,255,0.07)" };

const SOCIAL_EMOJIS: Record<string, string> = {
  twitter: "𝕏", instagram: "📸", facebook: "📘", youtube: "▶️", linkedin: "💼", tiktok: "🎵",
};

export function MarketplaceFooter() {
  const { storeName, categories, cms, tenantId } = useStore();
  const year = new Date().getFullYear();
  const { brand, contact, social } = cms;
  const activeSocials = (Object.keys(social) as (keyof typeof social)[]).filter(k => social[k].trim());

  const catLinks = (categories.length > 0 ? categories.slice(0, 8) : [
    "Mobiles", "Laptops", "Audio", "Gaming", "Accessories", "Wearables", "Cameras", "Home",
  ]);

  return (
    <footer style={{ background: C.navy, marginTop: 48, paddingTop: 48, fontFamily: "'Barlow', sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 40 }}>

          {/* Brand + Newsletter */}
          <div>
            <Link href="/home" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: 18, color: "#fff",
              }}>
                {storeName.charAt(0).toUpperCase() || "S"}
              </div>
              <div>
                <div style={{ fontFamily: "'Barlow Condensed', 'Barlow', sans-serif", fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                  {storeName || "Store"}
                </div>
                {brand.tagline && (
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: "1.5px", textTransform: "uppercase", marginTop: 2 }}>
                    {brand.tagline}
                  </div>
                )}
              </div>
            </Link>

            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, maxWidth: 260, marginBottom: 16 }}>
              {brand.description || "Your one-stop destination for great products at unbeatable prices."}
            </p>

            {activeSocials.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                {activeSocials.map(network => (
                  <a key={network} href={social[network]} target="_blank" rel="noopener noreferrer"
                    style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: "rgba(255,255,255,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, textDecoration: "none", transition: "background .2s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = C.accent; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)"; }}
                    aria-label={network}
                  >
                    {SOCIAL_EMOJIS[network] ?? "🔗"}
                  </a>
                ))}
              </div>
            )}

            {/* Newsletter */}
            <div style={{
              background: "rgba(255,255,255,0.05)", borderRadius: 12,
              padding: 20,
            }}>
              <div style={{ color: "#fff", fontWeight: 800, marginBottom: 6, fontSize: 14 }}>Get Exclusive Deals</div>
              <p style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Subscribe for flash sale alerts & discount codes</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email" placeholder="your@email.com"
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8, padding: "9px 12px", color: "#fff",
                    fontFamily: "inherit", fontSize: 13, outline: "none",
                  }}
                />
                <button style={{
                  background: C.accent, border: "none", color: "#fff",
                  padding: "9px 16px", borderRadius: 8, fontWeight: 700,
                  fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                }}>
                  Subscribe
                </button>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h4 style={{ color: "#fff", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 16 }}>
              Categories
            </h4>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {catLinks.map(cat => (
                <li key={cat}>
                  <Link href={`/shop?cat=${encodeURIComponent(cat)}`}
                    style={{ color: C.muted, textDecoration: "none", fontSize: 13, transition: "color .2s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.accent2; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.muted; }}>
                    {cat}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Store links */}
          <div>
            <h4 style={{ color: "#fff", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 16 }}>
              Store
            </h4>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                { label: "All Products",   href: "/shop" },
                { label: "New Arrivals",   href: "/shop?sort=newest" },
                { label: "Best Sellers",   href: "/shop?sort=popular" },
                { label: "Deals & Offers", href: "/shop?sort=price_asc" },
                { label: "My Account",     href: `/customer-portal/?t=${encodeURIComponent(tenantId ?? "")}`, external: true },
                { label: "Sign In",        href: `/customer-portal/?t=${encodeURIComponent(tenantId ?? "")}&tab=signin`, external: true },
              ].map(link => (
                <li key={link.label}>
                  {link.external ? (
                    <a href={link.href}
                      style={{ color: C.muted, textDecoration: "none", fontSize: 13 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.accent2; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.muted; }}>
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href}
                      style={{ color: C.muted, textDecoration: "none", fontSize: 13 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.accent2; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.muted; }}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 style={{ color: "#fff", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 16 }}>
              Help
            </h4>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                { label: "About Us",       href: "/about" },
                { label: "Contact Us",     href: "/contact" },
                { label: "Track Order",    href: `/customer-portal/?t=${encodeURIComponent(tenantId ?? "")}`, external: true },
                { label: "Returns",        href: "/contact" },
                { label: "Repair Services", href: "/services" },
                { label: "Privacy Policy", href: "#" },
              ].map(link => (
                <li key={link.label}>
                  {link.external ? (
                    <a href={link.href}
                      style={{ color: C.muted, textDecoration: "none", fontSize: 13 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.accent2; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.muted; }}>
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href}
                      style={{ color: C.muted, textDecoration: "none", fontSize: 13 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.accent2; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.muted; }}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>

            {/* Contact info */}
            {(contact.phone || contact.email) && (
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {contact.phone && (
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`}
                    style={{ color: C.muted, textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    📞 {contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`}
                    style={{ color: C.muted, textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 6, wordBreak: "break-all" }}>
                    ✉️ {contact.email}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "18px 24px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <p style={{ color: C.dim, fontSize: 12 }}>
            © {year} {storeName}. All rights reserved. Powered by Onesoft.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: C.dim, fontSize: 12, marginRight: 4 }}>We Accept:</span>
            {["VISA", "MC", "AMEX", "PayPal", "Apple Pay"].map(m => (
              <span key={m} style={{
                background: "rgba(255,255,255,0.08)", borderRadius: 6,
                padding: "3px 8px", fontSize: 10, fontWeight: 700, color: C.muted,
              }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
