import { useState } from "react";
import { Link } from "wouter";
import { useStore } from "@/contexts/store-context";
import { apiBase } from "@/lib/api";

const C = {
  navy:    "#0a1628",
  navy2:   "#0f2040",
  navy3:   "#122040",
  accent:  "#ff6b00",
  accent2: "#ffb300",
  muted:   "#afc3e0",
  bg:      "#f4f6fa",
  border:  "rgba(255,255,255,0.08)",
};

const SERVICES = [
  {
    emoji: "🔧",
    title: "Device Repair",
    desc: "Professional repair for smartphones, tablets, laptops and more. Fast turnaround, genuine parts, quality guaranteed.",
    features: ["Screen replacement", "Battery replacement", "Water damage recovery", "Software troubleshooting"],
    accent: "#ff6b00",
  },
  {
    emoji: "📱",
    title: "Phone Unlocking",
    desc: "Factory unlocking for all major network carriers. Supports all brands and models — quick and guaranteed.",
    features: ["Network unlocking", "iCloud unlock assistance", "IMEI cleaning", "All major carriers"],
    accent: "#ffb300",
  },
  {
    emoji: "📡",
    title: "Network & IT Setup",
    desc: "Home and business networking setup, configuration, and troubleshooting. Fast broadband, Wi-Fi extenders, and more.",
    features: ["Broadband setup", "Wi-Fi configuration", "Network security", "Smart home devices"],
    accent: "#00b4d8",
  },
  {
    emoji: "💻",
    title: "PC & Laptop Services",
    desc: "Upgrades, clean installations, virus removal and performance optimisation for Windows and macOS systems.",
    features: ["RAM & SSD upgrades", "OS reinstallation", "Virus & malware removal", "Data recovery"],
    accent: "#22c55e",
  },
  {
    emoji: "🛡️",
    title: "Warranty & Protection",
    desc: "Extended warranty plans and screen protection fitting. Keep your devices covered and protected.",
    features: ["Extended warranty", "Screen protector fitting", "Case recommendations", "Accidental damage cover"],
    accent: "#a855f7",
  },
  {
    emoji: "🚚",
    title: "Delivery & Collection",
    desc: "Free click & collect from our Hull store, or UK-wide delivery. Same-day dispatch on orders before 2 pm.",
    features: ["Free UK delivery", "Same-day dispatch", "Click & collect", "International shipping"],
    accent: "#f43f5e",
  },
];

const PROCESS = [
  { n: "01", title: "Book Online",     desc: "Fill in our quick booking form or call us. We'll confirm within the hour." },
  { n: "02", title: "Drop Off / Post", desc: "Bring your device to our Hull store or send it via tracked post — we cover return shipping." },
  { n: "03", title: "We Fix It",       desc: "Our technicians diagnose and repair using genuine parts. Most repairs completed same day." },
  { n: "04", title: "Collect / Return",desc: "Pick up from store or get it shipped back to you, fully tested and working." },
];

const TRUST = [
  { emoji: "⭐", label: "4.9/5 Rating",       sub: "Over 1,200 reviews" },
  { emoji: "⚡", label: "Same-Day Repair",     sub: "Most devices done in hours" },
  { emoji: "🔒", label: "90-Day Guarantee",   sub: "On all repair work" },
  { emoji: "💯", label: "Genuine Parts Only", sub: "No aftermarket shortcuts" },
];

export function MarketplaceServicesPage() {
  const { storeName, cms, tenantId } = useStore();
  const [form, setForm] = useState({ name: "", phone: "", email: "", device: "", service: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const existing = await fetch(`${apiBase}/kv/t:${tenantId}/repair-bookings`).then(r => r.ok ? r.json() : { value: [] });
      const bookings = Array.isArray(existing?.value) ? existing.value : [];
      bookings.push({ ...form, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: "Pending" });
      await fetch(`${apiBase}/kv/t:${tenantId}/repair-bookings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: bookings }),
      });
      setSuccess(true);
      setTimeout(() => { setShowDialog(false); setSuccess(false); setForm({ name: "", phone: "", email: "", device: "", service: "", notes: "" }); }, 2800);
    } catch { /* silent */ } finally { setLoading(false); }
  }

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
            <span style={{ color: C.accent, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Professional Services</span>
          </div>
          <h1 style={{ color: "#fff", fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, fontFamily: "'Barlow Condensed','Barlow',sans-serif", lineHeight: 1.1, margin: "0 0 16px" }}>
            Expert Tech Services<br />
            <span style={{ background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              You Can Rely On
            </span>
          </h1>
          <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.7, margin: "0 0 32px" }}>
            From device repairs to network setup — we've been helping customers in Hull and Pakistan stay connected for over a decade.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setShowDialog(true)}
              style={{ background: `linear-gradient(135deg, ${C.accent}, #ff8c00)`, color: "#fff", border: "none", borderRadius: 10, padding: "14px 28px", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 20px rgba(255,107,0,0.4)` }}>
              📅 Book a Repair
            </button>
            <Link href="/shop" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "14px 28px", fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              🛒 Browse Products →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Trust strip ───────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e3e8f0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {TRUST.map(t => (
            <div key={t.label} style={{ padding: "18px 0", textAlign: "center", borderRight: "1px solid #eef0f4" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{t.emoji}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>{t.label}</div>
              <div style={{ fontSize: 12, color: "#8a9bb5", marginTop: 2 }}>{t.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Services grid ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>What We Do</div>
          <h2 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 900, color: C.navy, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: 0 }}>Our Services</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {SERVICES.map(s => (
            <div key={s.title} style={{
              background: "#fff", borderRadius: 16, padding: 28,
              boxShadow: "0 4px 24px rgba(10,22,40,0.08)", border: "1px solid #e8ecf3",
              transition: "transform .2s, box-shadow .2s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 40px rgba(10,22,40,0.14)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 24px rgba(10,22,40,0.08)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: s.accent + "18",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, flexShrink: 0,
                }}>
                  {s.emoji}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: C.navy, margin: 0 }}>{s.title}</h3>
              </div>
              <p style={{ fontSize: 13, color: "#5a6a80", lineHeight: 1.65, margin: "0 0 16px" }}>{s.desc}</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                {s.features.map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#3a4a5c" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.accent, flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <div style={{ background: C.navy, padding: "64px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Simple Process</div>
            <h2 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 900, color: "#fff", fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: 0 }}>How It Works</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
            {PROCESS.map((p, i) => (
              <div key={p.n} style={{ textAlign: "center", position: "relative" }}>
                {i < PROCESS.length - 1 && (
                  <div style={{ position: "absolute", top: 24, left: "60%", right: "-40%", height: 2, background: `linear-gradient(90deg, ${C.accent}40, transparent)`, display: "none" }} />
                )}
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${C.accent}, #ff8c00)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 18, fontWeight: 900, color: "#fff",
                  fontFamily: "'Barlow Condensed','Barlow',sans-serif",
                  boxShadow: `0 4px 20px rgba(255,107,0,0.4)`,
                }}>
                  {p.n}
                </div>
                <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 16, margin: "0 0 8px" }}>{p.title}</h3>
                <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${C.accent} 0%, #ff8c00 50%, ${C.accent2} 100%)`, padding: "56px 24px", textAlign: "center" }}>
        <h2 style={{ color: "#fff", fontSize: "clamp(22px,4vw,36px)", fontWeight: 900, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: "0 0 12px" }}>
          Ready to Get Started?
        </h2>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, margin: "0 0 28px" }}>
          Book a repair online or drop into our Hull store — we're here Monday to Saturday.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setShowDialog(true)}
            style={{ background: "#fff", color: C.accent, border: "none", borderRadius: 10, padding: "14px 28px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            📅 Book Now
          </button>
          <Link href="/contact" style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 10, padding: "14px 28px", fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            📞 Contact Us
          </Link>
        </div>
      </div>

      {/* ── Booking dialog ────────────────────────────────────────────────── */}
      {showDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.7)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowDialog(false); }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 520, boxShadow: "0 24px 80px rgba(0,0,0,0.3)", position: "relative" }}>
            <button onClick={() => setShowDialog(false)} style={{ position: "absolute", top: 16, right: 16, background: "#f4f6fa", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 18, cursor: "pointer", color: "#5a6a80" }}>✕</button>
            {success ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <h3 style={{ color: C.navy, fontWeight: 800, fontSize: 20, margin: "0 0 8px" }}>Booking Received!</h3>
                <p style={{ color: "#5a6a80", fontSize: 14 }}>We'll be in touch shortly to confirm your repair slot.</p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ color: C.navy, fontWeight: 900, fontSize: 22, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: "0 0 4px" }}>Book a Repair</h3>
                  <p style={{ color: "#8a9bb5", fontSize: 13, margin: 0 }}>We'll confirm your slot within the hour.</p>
                </div>
                <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { key: "name",    label: "Your Name",    type: "text",  required: true  },
                    { key: "phone",   label: "Phone Number", type: "tel",   required: true  },
                    { key: "email",   label: "Email Address",type: "email", required: false },
                    { key: "device",  label: "Device",       type: "text",  required: true  },
                    { key: "service", label: "Service Needed",type:"text",  required: true  },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#5a6a80", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 5 }}>{f.label}{f.required && " *"}</label>
                      <input
                        type={f.type}
                        required={f.required}
                        value={(form as Record<string,string>)[f.key]}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: "100%", border: "1.5px solid #dde3ee", borderRadius: 9, padding: "10px 14px", fontSize: 14, color: C.navy, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                        onFocus={e => { (e.target as HTMLInputElement).style.borderColor = C.accent; }}
                        onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#dde3ee"; }}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#5a6a80", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 5 }}>Notes (optional)</label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      rows={3}
                      style={{ width: "100%", border: "1.5px solid #dde3ee", borderRadius: 9, padding: "10px 14px", fontSize: 14, color: C.navy, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
                      onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = C.accent; }}
                      onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = "#dde3ee"; }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{ background: `linear-gradient(135deg, ${C.accent}, #ff8c00)`, color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                    {loading ? "Submitting…" : "📅 Confirm Booking"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap');`}</style>
    </div>
  );
}
