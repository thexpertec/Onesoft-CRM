import onesoftLogo from "@assets/Onesoft_Logo_1775302706939.png";
import {
  BarChart3, Users, ShoppingCart, FileText, Package,
  Shield, Zap, Globe, Phone, Mail, ArrowRight, CheckCircle2,
  TrendingUp, Receipt, Layers, Building2,
} from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    title: "CRM & Leads",
    desc: "Track every customer, lead, and interaction in one place. Never lose a deal again.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: ShoppingCart,
    title: "Sales & POS",
    desc: "Full point-of-sale with live stock deduction, receipts, and payment tracking.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: Package,
    title: "Stock & Inventory",
    desc: "Real-time stock levels, low-stock alerts, and supplier purchase orders.",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: Receipt,
    title: "Invoicing",
    desc: "Professional invoices with custom branding, payment terms, and one-click print.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: FileText,
    title: "Documents",
    desc: "Create, manage, and share legal documents, proposals, and contracts securely.",
    color: "bg-rose-50 text-rose-600",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    desc: "Live dashboards showing revenue, sales trends, and business performance at a glance.",
    color: "bg-cyan-50 text-cyan-600",
  },
  {
    icon: Layers,
    title: "Multi-Tenant",
    desc: "Manage multiple businesses from one platform with fully isolated data per client.",
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    desc: "Superadmin, admin, and tenant roles with granular module-level permissions.",
    color: "bg-orange-50 text-orange-600",
  },
];

const STATS = [
  { value: "12+", label: "Core Modules" },
  { value: "100%", label: "Browser-Based" },
  { value: "Multi", label: "Tenant Ready" },
  { value: "24/7", label: "Always On" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <img src={onesoftLogo} alt="OneSoft" className="h-8 w-auto" />
          <nav className="hidden md:flex items-center gap-6 text-[14px] text-gray-500 font-medium">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#why" className="hover:text-gray-900 transition-colors">Why OneSoft</a>
            <a href="mailto:info@onesoft.org.uk" className="hover:text-gray-900 transition-colors">Contact</a>
          </nav>
          <a
            href="/admin-dashboard/"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            Sign In <ArrowRight size={14} />
          </a>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
        {/* subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-36 text-center">
          <span className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[12px] font-semibold px-3 py-1 rounded-full mb-6">
            <Zap size={12} /> The All-in-One Business Platform
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
            The Strongest CRM<br />
            <span className="text-blue-400">Built for Modern Business</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            OneSoft combines CRM, Sales, Inventory, Invoicing, HR and more into one powerful platform.
            Run your entire business from a single dashboard — no subscriptions, no limits.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/admin-dashboard/"
              className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-bold px-7 py-3.5 rounded-xl text-[15px] transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-400/40 hover:scale-[1.02]"
            >
              Access Your Dashboard <ArrowRight size={16} />
            </a>
            <a
              href="mailto:info@onesoft.org.uk"
              className="inline-flex items-center gap-2 border border-white/20 hover:border-white/40 text-white/80 hover:text-white font-semibold px-7 py-3.5 rounded-xl text-[15px] transition-all"
            >
              <Mail size={15} /> Get in Touch
            </a>
          </div>
        </div>

        {/* wave divider */}
        <div className="relative h-16 overflow-hidden">
          <svg viewBox="0 0 1440 64" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0,32 C360,64 1080,0 1440,32 L1440,64 L0,64 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map(s => (
            <div key={s.label}>
              <div className="text-3xl font-black text-blue-600 mb-1">{s.value}</div>
              <div className="text-[13px] text-gray-500 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why OneSoft ──────────────────────────────────────────────────────── */}
      <section id="why" className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-blue-600 font-bold text-[12px] uppercase tracking-widest mb-3">Why Choose OneSoft</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-6 leading-tight">
                Everything your business needs,<br />nothing it doesn't
              </h2>
              <p className="text-gray-600 text-[16px] leading-relaxed mb-8">
                Most CRM tools are overpriced, overcomplicated, or built only for sales teams.
                OneSoft was designed from the ground up for small and mid-size businesses that
                need a complete operational platform — not just a contact list.
              </p>
              <ul className="space-y-3">
                {[
                  "Single login for your entire operation",
                  "Fully isolated data per business tenant",
                  "Works in any browser — no app install needed",
                  "Built by Onesoft, Hull UK & Islamabad Pakistan",
                ].map(pt => (
                  <li key={pt} className="flex items-start gap-3 text-[14px] text-gray-700">
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: TrendingUp, label: "Revenue Tracking", color: "bg-blue-600" },
                { icon: Users,      label: "Customer Management", color: "bg-violet-600" },
                { icon: Building2,  label: "Multi-Branch Support", color: "bg-emerald-600" },
                { icon: Globe,      label: "Web-Based Platform", color: "bg-amber-500" },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-3">
                  <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <p className="text-[13px] font-semibold text-gray-800 leading-tight">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid ────────────────────────────────────────────────────── */}
      <section id="features" className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-blue-600 font-bold text-[12px] uppercase tracking-widest mb-3">Platform Modules</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
              One platform. Every tool you need.
            </h2>
            <p className="text-gray-500 text-[16px] max-w-xl mx-auto">
              From your first lead to your last invoice — OneSoft handles it all.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="group bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md hover:border-blue-100 transition-all"
              >
                <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-4`}>
                  <Icon size={18} />
                </div>
                <h3 className="text-[14px] font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Ready to take control?</h2>
          <p className="text-blue-100 text-[16px] mb-8 leading-relaxed">
            Log in to your OneSoft dashboard and manage your entire business from one place.
          </p>
          <a
            href="/admin-dashboard/"
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-xl text-[15px] hover:bg-blue-50 transition-all shadow-lg"
          >
            Go to Dashboard <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
            <div className="flex flex-col items-center md:items-start gap-3">
              <img src={onesoftLogo} alt="OneSoft" className="h-7 w-auto brightness-0 invert opacity-80" />
              <p className="text-[13px] text-slate-500 max-w-xs text-center md:text-left">
                Software &amp; IT Solutions — Hull, UK &amp; Islamabad, Pakistan
              </p>
            </div>
            <div className="flex flex-col items-center md:items-end gap-3 text-[13px]">
              <a href="mailto:info@onesoft.org.uk" className="flex items-center gap-2 hover:text-white transition-colors">
                <Mail size={14} /> info@onesoft.org.uk
              </a>
              <a href="tel:+447984273482" className="flex items-center gap-2 hover:text-white transition-colors">
                <Phone size={14} /> +44 7984 273482
              </a>
              <a href="https://onesoft.org.uk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
                <Globe size={14} /> onesoft.org.uk
              </a>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-8 text-center text-[12px] text-slate-600">
            © {new Date().getFullYear()} Onesoft. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
}
