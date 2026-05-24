import { useState } from "react";
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

const OFFICES = [
  {
    flag: "🇬🇧", city: "Hull, UK",
    address: "Hull, East Yorkshire, UK",
    phone: "+44 (0) 1482 000 000",
    email: "hull@onesoft.org.uk",
    hours: "Mon–Sat: 9:00am – 6:00pm",
    color: C.accent,
  },
  {
    flag: "🇵🇰", city: "Islamabad, PK",
    address: "Islamabad, Punjab, Pakistan",
    phone: "+92 51 000 0000",
    email: "pk@onesoft.org.uk",
    hours: "Mon–Sat: 10:00am – 7:00pm (PKT)",
    color: "#00b4d8",
  },
];

const FAQS = [
  { q: "What's your returns policy?",      a: "We offer a 30-day return policy on all products. Items must be unused and in original packaging. Contact us to initiate a return." },
  { q: "How long does delivery take?",      a: "Standard UK delivery takes 3–5 business days. Express delivery is 1–2 business days. Free collection is available from our Hull store." },
  { q: "Do you offer bulk / trade pricing?",a: "Yes! We offer discounted pricing for trade customers and bulk orders. Contact our sales team for a custom quote." },
  { q: "Can I track my order?",             a: "Yes. Once dispatched you'll receive a tracking number via email. Use it on our courier's website to track delivery." },
  { q: "Do you repair all device brands?",  a: "We repair most major brands including Apple, Samsung, Huawei, OnePlus, and many more. Contact us if you're unsure." },
];

export function MarketplaceContactPage() {
  const { storeName, cms } = useStore();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); setSent(true); }, 1200);
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
        <div style={{ position: "relative", maxWidth: 640, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,107,0,0.15)", border: "1px solid rgba(255,107,0,0.3)",
            borderRadius: 20, padding: "6px 16px", marginBottom: 20,
          }}>
            <span style={{ color: C.accent, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Get In Touch</span>
          </div>
          <h1 style={{ color: "#fff", fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, fontFamily: "'Barlow Condensed','Barlow',sans-serif", lineHeight: 1.1, margin: "0 0 16px" }}>
            We'd Love to<br />
            <span style={{ background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Hear From You
            </span>
          </h1>
          <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.7, margin: 0 }}>
            Whether you have a question about an order, need a repair quote, or just want to say hello — our team is here to help.
          </p>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 40, alignItems: "start" }}>

          {/* Left: offices + quick links */}
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: C.navy, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: "0 0 24px" }}>Our Locations</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {OFFICES.map(o => (
                <div key={o.city} style={{
                  background: "#fff", borderRadius: 16, padding: 24,
                  boxShadow: "0 4px 20px rgba(10,22,40,0.07)", border: "1px solid #e8ecf3",
                  borderTop: `4px solid ${o.color}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <span style={{ fontSize: 24 }}>{o.flag}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>{o.city}</span>
                  </div>
                  {[
                    { icon: "📍", val: o.address },
                    { icon: "📞", val: o.phone,  href: `tel:${o.phone.replace(/\s/g,"")}` },
                    { icon: "✉️",  val: o.email,  href: `mailto:${o.email}` },
                    { icon: "⏰", val: o.hours  },
                  ].map(row => (
                    <div key={row.icon} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{row.icon}</span>
                      {row.href ? (
                        <a href={row.href} style={{ fontSize: 13, color: o.color, textDecoration: "none", fontWeight: 600 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none"; }}>
                          {row.val}
                        </a>
                      ) : (
                        <span style={{ fontSize: 13, color: "#5a6a80" }}>{row.val}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 24, marginTop: 20, boxShadow: "0 4px 20px rgba(10,22,40,0.07)", border: "1px solid #e8ecf3" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginBottom: 16 }}>Quick Links</div>
              {[
                { label: "Browse all products", href: "/shop",     emoji: "🛒" },
                { label: "View our services",   href: "/services", emoji: "🔧" },
                { label: "Go to checkout",      href: "/checkout", emoji: "💳" },
              ].map(l => (
                <Link key={l.href} href={l.href} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                  borderBottom: "1px solid #f0f4f8", color: C.navy, textDecoration: "none",
                  fontSize: 13, fontWeight: 600,
                  transition: "color .15s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.accent; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.navy; }}
                >
                  <span>{l.emoji}</span>
                  {l.label}
                  <span style={{ marginLeft: "auto", color: C.accent, fontSize: 16 }}>›</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Right: contact form */}
          <div style={{ background: "#fff", borderRadius: 20, padding: 36, boxShadow: "0 8px 40px rgba(10,22,40,0.10)", border: "1px solid #e8ecf3" }}>
            {sent ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 20 }}>✅</div>
                <h3 style={{ color: C.navy, fontWeight: 900, fontSize: 24, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: "0 0 12px" }}>Message Sent!</h3>
                <p style={{ color: "#5a6a80", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                  Thanks for reaching out! We'll get back to you within 24 hours.
                </p>
                <button onClick={() => { setSent(false); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}
                  style={{ background: `linear-gradient(135deg, ${C.accent}, #ff8c00)`, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  Send Another
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 28 }}>
                  <h2 style={{ color: C.navy, fontWeight: 900, fontSize: 24, fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: "0 0 6px" }}>Send Us a Message</h2>
                  <p style={{ color: "#8a9bb5", fontSize: 13, margin: 0 }}>We typically reply within a few hours.</p>
                </div>
                <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {[
                      { key: "name",  label: "Your Name",    type: "text",  required: true  },
                      { key: "email", label: "Email Address", type: "email", required: true  },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#5a6a80", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{f.label} *</label>
                        <input
                          type={f.type} required={f.required}
                          value={(form as Record<string,string>)[f.key]}
                          onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ width: "100%", border: "1.5px solid #dde3ee", borderRadius: 9, padding: "10px 14px", fontSize: 14, color: C.navy, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = C.accent; }}
                          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#dde3ee"; }}
                        />
                      </div>
                    ))}
                  </div>
                  {[
                    { key: "phone",   label: "Phone (optional)", type: "tel",  required: false },
                    { key: "subject", label: "Subject",           type: "text", required: true  },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#5a6a80", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{f.label}{f.required ? " *" : ""}</label>
                      <input
                        type={f.type} required={f.required}
                        value={(form as Record<string,string>)[f.key]}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: "100%", border: "1.5px solid #dde3ee", borderRadius: 9, padding: "10px 14px", fontSize: 14, color: C.navy, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                        onFocus={e => { (e.target as HTMLInputElement).style.borderColor = C.accent; }}
                        onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#dde3ee"; }}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#5a6a80", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>Message *</label>
                    <textarea
                      required
                      rows={5}
                      value={form.message}
                      onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                      placeholder="Tell us how we can help…"
                      style={{ width: "100%", border: "1.5px solid #dde3ee", borderRadius: 9, padding: "10px 14px", fontSize: 14, color: C.navy, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
                      onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = C.accent; }}
                      onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = "#dde3ee"; }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{ background: `linear-gradient(135deg, ${C.accent}, #ff8c00)`, color: "#fff", border: "none", borderRadius: 10, padding: "15px", fontSize: 15, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, boxShadow: `0 4px 20px rgba(255,107,0,0.35)` }}>
                    {loading ? "Sending…" : "📨 Send Message"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <div style={{ background: C.navy, padding: "64px 24px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Got Questions?</div>
            <h2 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 900, color: "#fff", fontFamily: "'Barlow Condensed','Barlow',sans-serif", margin: 0 }}>Frequently Asked Questions</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FAQS.map((f, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, overflow: "hidden",
              }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", background: "none", border: "none", cursor: "pointer",
                    color: "#fff", fontSize: 14, fontWeight: 700, textAlign: "left", gap: 12, fontFamily: "inherit",
                  }}>
                  {f.q}
                  <span style={{ flexShrink: 0, color: C.accent, fontSize: 18, fontWeight: 900, transition: "transform .2s", transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)" }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: "0 20px 16px", color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap');`}</style>
    </div>
  );
}
