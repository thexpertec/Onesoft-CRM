import { useMemo, useEffect, useState } from "react";
import { Link } from "wouter";
import { useStore } from "@/contexts/store-context";
import { MarketplaceProductCard } from "./product-card";
import {
  Laptop, Smartphone, Headphones, Gamepad2, Tablet, Camera, Watch, Cpu,
  Cable, Battery, Plug, Speaker, Mouse, Printer, ShoppingBag, Wrench, Tv, Package,
} from "lucide-react";

const C = {
  navy: "#0a1628", navy2: "#0f2040", accent: "#ff6b00", accent2: "#ffb300",
  teal: "#00b4d8", text: "#1a2540", sub: "#5a6a85", muted: "#8a9bb5",
  border: "#e3e8f0", off: "#f4f6fa", white: "#ffffff",
};

const CAT_ICONS: Record<string, React.ElementType> = {
  default: Cpu, Laptops: Laptop, Laptop, Computers: Laptop,
  Smartphones: Smartphone, Phones: Smartphone, "Mobile Smart Phones": Smartphone,
  Audio: Headphones, Headphones, Speakers: Speaker,
  Gaming: Gamepad2, Consoles: Gamepad2,
  Tablets: Tablet, Tablet,
  Cameras: Camera, Camera,
  "TV & Home": Tv, TV: Tv, Televisions: Tv,
  Wearables: Watch, Watches: Watch, Smartwatch: Watch,
  Accessories: ShoppingBag, "Mobile Accessories": ShoppingBag,
  Cables: Cable, Cable, Chargers: Plug, Batteries: Battery,
  Mouse, Keyboards: Cpu, Printers: Printer,
  Repair: Wrench, Services: Wrench,
};

const TICKER_ITEMS = [
  "🔥 Today's Flash Deal — Up to 50% Off",
  "📱 New Smartphones Just Arrived",
  "💻 Laptop Clearance — Limited Stock",
  "🎧 Premium Audio — Best Prices",
  "🚚 Free Shipping on Orders Over £35",
  "🔒 Buyer Protection on All Orders",
  "⚡ Flash Sale Ending Soon",
  "🎮 Gaming Gear — Massive Discounts",
];

const BANNER_CARDS = [
  { emoji: "📱", title: "Mobile Mega Sale",   desc: "Top smartphones up to 55% off",     bg: "linear-gradient(135deg, #0d3b66, #1d6fa4)" },
  { emoji: "🎧", title: "Audio & Gadgets",    desc: "Premium sound from £19.99",          bg: "linear-gradient(135deg, #1a0533, #6a0572)" },
  { emoji: "🏠", title: "Home & Accessories", desc: "Everything you need under one roof", bg: "linear-gradient(135deg, #004d40, #00897b)" },
];

function useCountdown(targetMs: number) {
  const [left, setLeft] = useState(targetMs);
  useEffect(() => {
    const id = setInterval(() => setLeft(v => Math.max(0, v - 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return { h, m, s };
}

function CountdownBox({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ background: C.accent, borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 52 }}>
      <div style={{ fontFamily: "'Barlow Condensed','Barlow',sans-serif", fontSize: 24, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
        {String(n).padStart(2, "0")}
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: ".5px" }}>
        {label}
      </div>
    </div>
  );
}

export function MarketplaceHomePage() {
  const { products, loading, categories, cms } = useStore();
  const countdown = useCountdown(8 * 3600 * 1000 + 43 * 60 * 1000 + 17 * 1000);

  const featured    = useMemo(() => products.filter(p => p.status === "Active").slice(0, 10), [products]);
  const newArrivals = useMemo(() => [...products].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 5), [products]);
  const flashSale   = useMemo(() => products.slice(0, 5), [products]);

  const displayCats = useMemo(() => {
    const raw = categories.length > 0 ? categories : [
      "Smartphones", "Laptops", "Tablets", "Gaming", "Audio", "Cameras", "Accessories", "Wearables",
    ];
    const mains = [...new Set(raw.map(c => c.includes(" > ") ? c.split(" > ")[0].trim() : c))].sort();
    return mains.slice(0, 10);
  }, [categories]);

  const heroSideCards = displayCats.slice(0, 2).map((cat, i) => {
    const Icon = CAT_ICONS[cat] ?? CAT_ICONS.default;
    const bgs = ["linear-gradient(135deg,#1a1a2e,#e94560)", "linear-gradient(135deg,#0d3b66,#00b4d8)"];
    const emojis = ["📱", "💻", "🎧", "🎮", "📷", "⌚", "🔌", "🏠"];
    return { cat, Icon, bg: bgs[i % 2], emoji: emojis[i % emojis.length] };
  });

  const { hero } = cms;

  function secTitle(icon: string, text: string) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 5, height: 28, background: C.accent, borderRadius: 3, flexShrink: 0 }} />
        <span style={{
          fontFamily: "'Barlow Condensed','Barlow',sans-serif",
          fontSize: 24, fontWeight: 800, color: C.text,
        }}>
          {icon} {text}
        </span>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", background: C.off, minHeight: "100vh" }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1400, margin: "20px auto 0", padding: "0 24px" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, height: 320,
        }}
          className="mp-hero-grid"
        >
          {/* Main banner */}
          <div style={{
            borderRadius: 16, overflow: "hidden", position: "relative",
            background: "linear-gradient(135deg, #0a1628 0%, #0f3460 50%, #16213e 100%)",
            display: "flex", alignItems: "center", padding: 40,
            boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          }}>
            <div style={{
              position: "absolute", right: -30, top: -60, width: 420, height: 420,
              background: "radial-gradient(circle, rgba(255,107,0,0.18) 0%, transparent 70%)",
              borderRadius: "50%", pointerEvents: "none",
            }} />
            <div style={{ position: "absolute", right: 60, bottom: -10, fontSize: 160, opacity: 0.1, transform: "rotate(-15deg)", pointerEvents: "none" }}>🛒</div>
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{
                background: C.accent, color: "#fff", display: "inline-block",
                padding: "4px 14px", borderRadius: 20, fontSize: 11,
                fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12,
              }}>
                🔥 {hero.badge || "Limited Time Offer"}
              </div>
              <h1 style={{
                fontFamily: "'Barlow Condensed','Barlow',sans-serif",
                fontSize: 46, fontWeight: 900, color: "#fff", lineHeight: 1, marginBottom: 10,
              }}>
                {hero.headline1 || "Shop More,"}<br />
                Pay <span style={{ color: C.accent2 }}>{hero.headline2 || "Less."}</span>
              </h1>
              <p style={{ color: "#afc3e0", fontSize: 15, marginBottom: 22, maxWidth: 360 }}>
                {hero.subtitle || "Discover great products at unbeatable prices. All in one place."}
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <Link href="/shop" style={{
                  background: `linear-gradient(135deg, ${C.accent}, #ff8c00)`,
                  color: "#fff", border: "none", padding: "12px 26px",
                  borderRadius: 8, fontWeight: 700, fontSize: 15,
                  textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
                  boxShadow: "0 4px 20px rgba(255,107,0,0.4)",
                }}>
                  🛍️ {hero.btn1Text || "Shop Now"}
                </Link>
                <Link href="/shop?sort=newest" style={{
                  background: "transparent", color: "#fff",
                  border: "2px solid rgba(255,255,255,0.3)",
                  padding: "12px 26px", borderRadius: 8, fontWeight: 700, fontSize: 15,
                  textDecoration: "none", display: "inline-flex", alignItems: "center",
                }}>
                  {hero.btn2Text || "View All Deals"} →
                </Link>
              </div>
            </div>
          </div>

          {/* Side cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {heroSideCards.length >= 2 ? heroSideCards.map(card => (
              <Link key={card.cat} href={`/shop?cat=${encodeURIComponent(card.cat)}`} style={{
                flex: 1, borderRadius: 16, overflow: "hidden", position: "relative",
                display: "flex", alignItems: "flex-end", padding: 20,
                textDecoration: "none",
                background: card.bg,
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                transition: "transform .2s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1.01)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1)"; }}
              >
                <div style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", fontSize: 58, opacity: 0.9 }}>
                  {card.emoji}
                </div>
                <div>
                  <h3 style={{ fontFamily: "'Barlow Condensed','Barlow',sans-serif", fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>{card.cat}</h3>
                  <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: 0 }}>Shop the collection</p>
                </div>
              </Link>
            )) : (
              <>
                <Link href="/shop" style={{ flex: 1, borderRadius: 16, background: "linear-gradient(135deg,#1a1a2e,#e94560)", display: "flex", alignItems: "flex-end", padding: 20, textDecoration: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                  <div style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", fontSize: 58 }}>📱</div>
                  <div><h3 style={{ fontFamily: "'Barlow Condensed','Barlow',sans-serif", fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>Mobiles & Gadgets</h3><p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: 0 }}>Up to 55% off today</p></div>
                </Link>
                <Link href="/shop" style={{ flex: 1, borderRadius: 16, background: "linear-gradient(135deg,#0d3b66,#00b4d8)", display: "flex", alignItems: "flex-end", padding: 20, textDecoration: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                  <div><h3 style={{ fontFamily: "'Barlow Condensed','Barlow',sans-serif", fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>Laptops & PCs</h3><p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: 0 }}>Best deals of the week</p></div>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Deals Ticker ─────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
        padding: "10px 0", marginTop: 20, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", gap: 60, whiteSpace: "nowrap",
          animation: "mpTicker 28s linear infinite", width: "max-content",
        }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <div key={i} style={{ fontWeight: 700, fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: "rgba(0,0,0,0.2)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>DEAL</span>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ── Categories ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1400, margin: "28px auto 0", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          {secTitle("🗂️", "Shop by Category")}
          <Link href="/shop" style={{
            color: C.accent, fontWeight: 700, fontSize: 13, textDecoration: "none",
            border: `2px solid ${C.accent}`, borderRadius: 6, padding: "5px 14px",
          }}>
            All Categories →
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 12 }}>
          {displayCats.map(cat => {
            const Icon = CAT_ICONS[cat] ?? CAT_ICONS.default;
            return (
              <Link key={cat} href={`/shop?cat=${encodeURIComponent(cat)}`} style={{
                background: "#fff", borderRadius: 14, padding: "16px 10px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                textDecoration: "none", color: C.text,
                border: `2px solid ${C.border}`, transition: "all .2s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer",
              }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.borderColor = C.accent;
                  el.style.boxShadow = "0 6px 24px rgba(255,107,0,0.15)";
                  el.style.transform = "translateY(-3px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.borderColor = C.border;
                  el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
                  el.style.transform = "translateY(0)";
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fff8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={20} color={C.accent} strokeWidth={1.8} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, textAlign: "center", color: C.sub, textTransform: "uppercase", letterSpacing: ".3px" }}>
                  {cat.length > 12 ? cat.split(" ")[0] : cat}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Flash Sale ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1400, margin: "32px auto 0", padding: "0 24px" }}>
        <div style={{
          background: `linear-gradient(135deg, ${C.navy}, ${C.navy2})`,
          borderRadius: "14px 14px 0 0", padding: "16px 24px",
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ fontFamily: "'Barlow Condensed','Barlow',sans-serif", fontSize: 28, fontWeight: 900, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
            ⚡ Flash <span style={{ color: C.accent2 }}>Sale</span>
          </div>
          <span style={{ color: "#afc3e0", fontSize: 14 }}>Ends in:</span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
            <CountdownBox n={countdown.h} label="HRS" />
            <span style={{ color: "#fff", fontSize: 22, fontWeight: 900, alignSelf: "center" }}>:</span>
            <CountdownBox n={countdown.m} label="MIN" />
            <span style={{ color: "#fff", fontSize: 22, fontWeight: 900, alignSelf: "center" }}>:</span>
            <CountdownBox n={countdown.s} label="SEC" />
          </div>
        </div>
        <div style={{
          background: "#fff", border: `2px solid ${C.border}`, borderTop: 0,
          borderRadius: "0 0 14px 14px", padding: 20,
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14,
        }}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ borderRadius: 14, background: C.off, aspectRatio: "3/4", animation: "pulse 1.5s ease-in-out infinite" }} />
            ))
          ) : flashSale.length === 0 ? (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 32, color: C.muted, fontSize: 14 }}>
              <Package size={36} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
              Products coming soon
            </div>
          ) : (
            flashSale.map(p => <MarketplaceProductCard key={p.id} product={p} />)
          )}
        </div>
      </div>

      {/* ── Banner Strip ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1400, margin: "28px auto 0", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="mp-banner-strip">
          {BANNER_CARDS.map(card => (
            <Link key={card.title} href="/shop" style={{
              borderRadius: 16, padding: "26px 24px",
              display: "flex", alignItems: "center", gap: 18,
              position: "relative", overflow: "hidden",
              background: card.bg, textDecoration: "none",
              transition: "opacity .2s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = ".9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
            >
              <span style={{ fontSize: 48, flexShrink: 0 }}>{card.emoji}</span>
              <div>
                <h3 style={{ fontFamily: "'Barlow Condensed','Barlow',sans-serif", fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{card.title}</h3>
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: 12 }}>{card.desc}</p>
                <button style={{
                  background: "rgba(255,255,255,0.2)", color: "#fff",
                  border: "2px solid rgba(255,255,255,0.5)",
                  padding: "7px 16px", borderRadius: 7, fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  Shop Now
                </button>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Best Sellers ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1400, margin: "32px auto 0", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          {secTitle("🏆", "Best Sellers")}
          <Link href="/shop?sort=popular" style={{ color: C.accent, fontWeight: 700, fontSize: 13, textDecoration: "none", border: `2px solid ${C.accent}`, borderRadius: 6, padding: "5px 14px" }}>
            See All →
          </Link>
        </div>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ borderRadius: 14, background: "#e8edf2", aspectRatio: "3/4", animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: C.muted }}>
            <Package size={48} style={{ margin: "0 auto 12px", display: "block", opacity: 0.25 }} />
            <p style={{ fontWeight: 600 }}>No products yet</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Products will appear here once added to the store.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            {featured.map(p => <MarketplaceProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>

      {/* ── Trust Badges ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1400, margin: "32px auto 0", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }} className="mp-trust-grid">
          {[
            { icon: "🚚", title: "Free Fast Shipping",  desc: "On all orders over £35. Same-day dispatch available." },
            { icon: "🔒", title: "Secure Payments",     desc: "256-bit SSL encryption. Your data is always safe." },
            { icon: "↩️", title: "Easy Returns",        desc: "30-day returns, no questions asked." },
            { icon: "🛡️", title: "Buyer Protection",    desc: "Full purchase protection on every order." },
          ].map(badge => (
            <div key={badge.title} style={{
              background: "#fff", borderRadius: 14, padding: "22px 18px",
              display: "flex", alignItems: "center", gap: 14,
              border: `2px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 34 }}>{badge.icon}</span>
              <div>
                <h4 style={{ fontWeight: 800, fontSize: 14, color: C.text, marginBottom: 3 }}>{badge.title}</h4>
                <p style={{ fontSize: 12, color: C.muted }}>{badge.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── New Arrivals ─────────────────────────────────────────────── */}
      {newArrivals.length > 0 && (
        <div style={{ maxWidth: 1400, margin: "32px auto 0", padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            {secTitle("✨", "New Arrivals")}
            <Link href="/shop?sort=newest" style={{ color: C.accent, fontWeight: 700, fontSize: 13, textDecoration: "none", border: `2px solid ${C.accent}`, borderRadius: 6, padding: "5px 14px" }}>
              View All →
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            {newArrivals.map(p => <MarketplaceProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}

      <div style={{ height: 48 }} />

      {/* Animations */}
      <style>{`
        @keyframes mpTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
        @media (max-width: 900px) {
          .mp-hero-grid { grid-template-columns: 1fr !important; height: auto !important; }
          .mp-banner-strip { grid-template-columns: 1fr !important; }
          .mp-trust-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .mp-trust-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
