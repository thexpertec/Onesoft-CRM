import { Link } from "wouter";
import { useStore } from "@/contexts/store-context";

const C = {
  navy:    "#0a1628",
  navy2:   "#0f2040",
  accent:  "#ff6b00",
  accent2: "#ffb300",
  muted:   "#afc3e0",
  bg:      "#f4f6fa",
};

const STATS = [
  { value: "997+",   label: "Products in stock" },
  { value: "5,000+", label: "Happy customers"   },
  { value: "10+",    label: "Years experience"  },
  { value: "2",      label: "Global locations"  },
];

const VALUES = [
  { emoji: "🏆", title: "Quality First",     desc: "Every product is sourced from trusted suppliers. We never compromise on quality to cut costs.", color: "#ff6b00" },
  { emoji: "❤️",  title: "Customer Care",    desc: "Real people, real support. We go the extra mile to resolve every issue for every customer.", color: "#f43f5e" },
  { emoji: "💰", title: "Fair Pricing",      desc: "Competitive prices, no hidden costs. What you see is what you pay — always.", color: "#22c55e" },
  { emoji: "🌍", title: "Global Reach",      desc: "Operating from Hull, UK and Islamabad, Pakistan — we serve customers worldwide.", color: "#00b4d8" },
  { emoji: "📈", title: "Always Improving",  desc: "We constantly update our range and services to keep up with the latest tech trends.", color: "#ffb300" },
  { emoji: "🤝", title: "Community Focused", desc: "Proudly serving local communities in Hull and Islamabad, building lasting relationships.", color: "#a855f7" },
];

const TEAM = [
  { initials: "AK", name: "Ahmad Khan",    role: "Co-Founder & CEO",        bio: "Leading the vision for Onesoft since 2014 from Islamabad." },
  { initials: "SK", name: "Sarah Khan",    role: "Operations Manager",       bio: "Keeping Hull operations running smoothly day in, day out." },
  { initials: "MR", name: "Mohammed Raza", role: "Lead Technician",          bio: "Expert in device repair with 8+ years hands-on experience." },
  { initials: "ZA", name: "Zara Ahmed",    role: "Customer Experience Lead", bio: "Ensuring every customer leaves happy, every single time." },
];

export function MarketplaceAboutPage() {
  const { storeName, cms } = useStore();

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", background: C.bg }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 60%, #1a3a5c 100%)`,
        padding: "72px 24px 80px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,107,0,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,180,216,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 700, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,107,0,0.15)", border: "1px solid rgba(255,107,0,0.3)",
            borderRadius: 20, padding: "6px 16px", marginBottom: 20,
          }}>
            <span style={{ color: C.accent, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Our Story</span>
          </div>
          <h1 style={{ color: "#fff", fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, fontFamily: "'Barlow Condensed','Barlow',sans-serif", lineHeight: 1.1, margin: "0 0 16px" }}>
            We're {storeName || "Onesoft"} —<br />
            <span style={{ background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Tech Experts You Can Trust
            </span>
          </h1>
          <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.7, margin: 0 }}>
            Born in Hull, UK in 2014. From a single repair bench to a full-service tech retailer operating across two countries — our story is built on trust, quality, and relentless customer focus.
          </p>
        </div>
      </div>

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e3e8f0" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {STATS.map(s => (
            <div key={s.label} style={{ padding: "28px 16px", textAlign: "center", borderRight: "1px solid #eef0f4" }}>
              <div style={{ fontSize: "clamp(28px,4vw,40px)", fontWeight: 900, fontFamily: "'Barlow Condensed','Barlow',sans-serif", color: C.navy, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#8a9bb5", marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Our story ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Who We Are</div>
            <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 900, color: C.navy, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: "0 0 20px", lineHeight: 1.2 }}>
              From Garage Repairs<br />to Global Retail
            </h2>
            <p style={{ color: "#5a6a80", fontSize: 14, lineHeight: 1.75, margin: "0 0 16px" }}>
              {storeName || "Onesoft"} started in 2014 as a one-man phone repair workshop in Hull, East Yorkshire. What began as helping friends and neighbours fix broken screens quickly grew into a fully stocked tech retailer serving thousands of customers every year.
            </p>
            <p style={{ color: "#5a6a80", fontSize: 14, lineHeight: 1.75, margin: "0 0 24px" }}>
              Today we operate from two locations — Hull in the UK and Islamabad in Pakistan — offering everything from the latest smartphones and laptops to expert repair services, network setup and warranty protection.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/shop" style={{ background: `linear-gradient(135deg, ${C.accent}, #ff8c00)`, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 800, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                🛒 Shop Now
              </Link>
              <Link href="/contact" style={{ background: "#fff", color: C.navy, border: `1.5px solid #dde3ee`, borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                📞 Get in Touch
              </Link>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              { label: "Hull, UK",            sub: "Founded here in 2014",    color: "#ff6b00", emoji: "🇬🇧" },
              { label: "Islamabad, PK",        sub: "Expanded in 2019",        color: "#00b4d8", emoji: "🇵🇰" },
              { label: "10+ Years",            sub: "Serving our community",   color: "#ffb300", emoji: "⭐" },
              { label: "5,000+ Customers",     sub: "And counting daily",      color: "#22c55e", emoji: "🤝" },
            ].map(c => (
              <div key={c.label} style={{
                background: "#fff", borderRadius: 16, padding: "24px 20px",
                boxShadow: "0 4px 20px rgba(10,22,40,0.07)", border: "1px solid #e8ecf3",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{c.emoji}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.navy, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 12, color: "#8a9bb5" }}>{c.sub}</div>
                <div style={{ width: 32, height: 3, borderRadius: 2, background: c.color, margin: "10px auto 0" }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Values ────────────────────────────────────────────────────────── */}
      <div style={{ background: C.navy, padding: "64px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>What Drives Us</div>
            <h2 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 900, color: "#fff", fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: 0 }}>Our Values</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {VALUES.map(v => (
              <div key={v.title} style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: 24,
              }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{v.emoji}</div>
                <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 16, margin: "0 0 8px" }}>{v.title}</h3>
                <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.65, margin: 0 }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Team ──────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>The People Behind It</div>
          <h2 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 900, color: C.navy, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: 0 }}>Meet Our Team</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
          {TEAM.map((m, i) => {
            const colors = [C.accent, "#00b4d8", "#ffb300", "#a855f7"];
            return (
              <div key={m.name} style={{
                background: "#fff", borderRadius: 16, padding: "28px 20px",
                boxShadow: "0 4px 20px rgba(10,22,40,0.07)", border: "1px solid #e8ecf3",
                textAlign: "center",
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: colors[i % colors.length],
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 22, fontWeight: 900, color: "#fff",
                  fontFamily: "'Barlow Condensed','Barlow',sans-serif",
                  boxShadow: `0 4px 16px ${colors[i % colors.length]}40`,
                }}>
                  {m.initials}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginBottom: 4 }}>{m.name}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>{m.role}</div>
                <p style={{ fontSize: 12, color: "#8a9bb5", lineHeight: 1.6, margin: 0 }}>{m.bio}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${C.accent} 0%, #ff8c00 50%, ${C.accent2} 100%)`, padding: "56px 24px", textAlign: "center" }}>
        <h2 style={{ color: "#fff", fontSize: "clamp(22px,4vw,36px)", fontWeight: 900, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: "0 0 12px" }}>
          Want to Work With Us or Stock Our Range?
        </h2>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, margin: "0 0 28px" }}>
          Trade enquiries, partnerships and wholesale orders welcome. Drop us a message.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/contact" style={{ background: "#fff", color: C.accent, borderRadius: 10, padding: "14px 28px", fontSize: 15, fontWeight: 800, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            📞 Contact Us
          </Link>
          <Link href="/shop" style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 10, padding: "14px 28px", fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            🛒 Shop Now →
          </Link>
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap');`}</style>
    </div>
  );
}
