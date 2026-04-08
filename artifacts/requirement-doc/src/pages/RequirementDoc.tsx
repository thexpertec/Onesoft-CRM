import { useState, useEffect, useRef, useMemo } from "react";
import onesoftLogo from "@assets/Onesoft_Logo_1775302706939.png";
import {
  BarChart3, Users, ShoppingCart, FileText, Package,
  Shield, Zap, Globe, Phone, Mail, ArrowRight, CheckCircle2,
  TrendingUp, Receipt, BookOpen, Building2, Search, X,
  MessageSquare, Layers, BrainCircuit, ClipboardList, Headphones,
  Wallet, Bot, Megaphone, Calendar, Truck,
} from "lucide-react";

// ── Data ─────────────────────────────────────────────────────────────────────

const SOLUTIONS = [
  { id: "crm",        title: "CRM",                 category: "CRM & Sales",    icon: Users,          desc: "Track leads, customers, pipeline & deal stages.",                tags: ["leads","sales","customers","pipeline","deals"] },
  { id: "erp",        title: "ERP",                 category: "Finance & Ops",  icon: Building2,      desc: "Full enterprise resource planning — one system for everything.",   tags: ["erp","enterprise","operations","resource"] },
  { id: "whatsapp",   title: "WhatsApp Automation",  category: "Automation",     icon: MessageSquare,  desc: "Send messages, campaigns, and workflows via WhatsApp.",            tags: ["whatsapp","messaging","automation","chat"] },
  { id: "ecommerce",  title: "E-Commerce",           category: "CRM & Sales",    icon: ShoppingCart,   desc: "Online storefront with order management and payments.",            tags: ["ecommerce","shop","orders","online","store"] },
  { id: "payroll",    title: "Payroll",              category: "HR & People",    icon: Wallet,         desc: "Automated payroll, salary slips, and staff payments.",             tags: ["payroll","salary","hr","employees","wages"] },
  { id: "analytics",  title: "Analytics",            category: "Finance & Ops",  icon: BarChart3,      desc: "Live dashboards, KPIs and business performance reports.",          tags: ["analytics","reports","dashboard","kpi"] },
  { id: "chatbot",    title: "Chatbot",              category: "Automation",     icon: Bot,            desc: "AI-powered chatbot for customer support and lead capture.",        tags: ["chatbot","ai","bot","support","chat"] },
  { id: "invoicing",  title: "Invoicing",            category: "Finance & Ops",  icon: Receipt,        desc: "Professional invoices with branding, terms, and one-click print.", tags: ["invoice","billing","payments","finance"] },
  { id: "booking",    title: "Booking System",       category: "Automation",     icon: Calendar,       desc: "Online appointment and resource booking with confirmations.",      tags: ["booking","appointments","scheduling","calendar"] },
  { id: "helpdesk",   title: "Help Desk",            category: "HR & People",    icon: Headphones,     desc: "Ticket management, SLAs, and customer support workflows.",         tags: ["helpdesk","tickets","support","service"] },
  { id: "marketing",  title: "Marketing Automation", category: "Automation",     icon: Megaphone,      desc: "Email, SMS, and social campaigns with tracking and segmentation.",  tags: ["marketing","email","campaigns","automation"] },
  { id: "hrm",        title: "HR Management",        category: "HR & People",    icon: ClipboardList,  desc: "Staff records, leaves, appraisals, and onboarding.",               tags: ["hr","staff","hrm","employees","leave"] },
  { id: "inventory",  title: "Inventory & Stock",    category: "Finance & Ops",  icon: Package,        desc: "Real-time stock, low-stock alerts, and supplier orders.",          tags: ["stock","inventory","warehouse","goods"] },
  { id: "documents",  title: "Documents",            category: "CRM & Sales",    icon: FileText,       desc: "Create, sign, and share proposals, contracts, and legal docs.",    tags: ["documents","contracts","proposals","legal"] },
  { id: "accounting", title: "Accounting",           category: "Finance & Ops",  icon: BookOpen,       desc: "Double-entry bookkeeping, COA, journals, and balance sheet.",      tags: ["accounting","finance","bookkeeping","coa"] },
  { id: "ai",         title: "AI Assistant",         category: "Automation",     icon: BrainCircuit,   desc: "GPT-powered assistant for insights, drafts, and recommendations.",  tags: ["ai","gpt","assistant","intelligence"] },
  { id: "pos",        title: "POS / Sales",          category: "CRM & Sales",    icon: TrendingUp,     desc: "Point-of-sale with cash, card, and live stock deduction.",          tags: ["pos","sales","point of sale","retail","till"] },
  { id: "logistics",  title: "Logistics & Delivery", category: "Finance & Ops",  icon: Truck,          desc: "Manage deliveries, routes, and shipment tracking.",                tags: ["logistics","delivery","shipping","tracking"] },
  { id: "roleaccess", title: "Role-Based Access",    category: "HR & People",    icon: Shield,         desc: "Superadmin, admin, and staff roles with module permissions.",       tags: ["roles","access","permissions","security","admin"] },
  { id: "webplatform",title: "Web Platform",         category: "Finance & Ops",  icon: Globe,          desc: "100% browser-based — no installs, runs on any device.",            tags: ["web","browser","cloud","platform","saas"] },
  { id: "modules",    title: "Multi-Module Suite",   category: "Finance & Ops",  icon: Layers,         desc: "28+ integrated modules — CRM, HRM, Finance, Sales and more.",      tags: ["modules","suite","all in one","integrated"] },
];

const CATEGORIES = [
  { label: "All Solutions",  desc: `${SOLUTIONS.length} business software tools`,   filter: null,            icon: Layers        },
  { label: "CRM & Sales",    desc: "Manage leads & customers",                       filter: "CRM & Sales",   icon: Users         },
  { label: "Automation",     desc: "WhatsApp, workflows & more",                     filter: "Automation",    icon: Zap           },
  { label: "HR & People",    desc: "Payroll, ATS & performance",                     filter: "HR & People",   icon: ClipboardList },
  { label: "Finance & Ops",  desc: "ERP, billing & inventory",                       filter: "Finance & Ops", icon: BarChart3     },
  { label: "Contact Us",     desc: "Speak to our team",                              filter: "contact",       icon: Phone         },
];

const POPULAR = [
  "CRM", "ERP", "WhatsApp Automation", "E-Commerce", "Payroll",
  "Analytics", "Chatbot", "Invoicing", "Booking System", "Help Desk", "Marketing Automation",
];

// Solutions used in original FEATURES grid (keep existing UI)
const FEATURES = [
  { icon: Users,      title: "CRM & Leads",               desc: "Track every customer, lead, and interaction in one place. Never lose a deal again.",                                  color: "bg-blue-50 text-blue-600"   },
  { icon: ShoppingCart,title: "Sales & POS",              desc: "Full point-of-sale with live stock deduction, receipts, and payment tracking.",                                         color: "bg-emerald-50 text-emerald-600" },
  { icon: Package,    title: "Stock & Inventory",          desc: "Real-time stock levels, low-stock alerts, and supplier purchase orders.",                                               color: "bg-violet-50 text-violet-600" },
  { icon: Receipt,    title: "Invoicing",                  desc: "Professional invoices with custom branding, payment terms, and one-click print.",                                       color: "bg-amber-50 text-amber-600" },
  { icon: FileText,   title: "Documents",                  desc: "Create, manage, and share legal documents, proposals, and contracts securely.",                                          color: "bg-rose-50 text-rose-600"   },
  { icon: BarChart3,  title: "Reports & Analytics",        desc: "Live dashboards showing revenue, sales trends, and business performance at a glance.",                                   color: "bg-cyan-50 text-cyan-600"   },
  { icon: BookOpen,   title: "Double-Entry Accounting",    desc: "Full chart of accounts with double-entry bookkeeping — debits, credits, and financial accuracy built in.",              color: "bg-indigo-50 text-indigo-600" },
  { icon: Shield,     title: "Role-Based Access",          desc: "Superadmin, admin, and tenant roles with granular module-level permissions.",                                            color: "bg-orange-50 text-orange-600" },
];

const STATS = [
  { value: "28+",   label: "Business Tools"  },
  { value: "100%",  label: "Browser-Based"   },
  { value: "Multi", label: "Tenant Ready"    },
  { value: "24/7",  label: "Always On"       },
];

// ── Search Modal ──────────────────────────────────────────────────────────────

function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = SOLUTIONS;
    if (activeCategory && activeCategory !== "contact") {
      list = list.filter(s => s.category === activeCategory);
    }
    if (!q) return activeCategory ? list : [];
    return list.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q) ||
      s.tags.some(t => t.includes(q))
    );
  }, [query, activeCategory]);

  const handlePopular = (term: string) => {
    setQuery(term);
    setActiveCategory(null);
  };

  const handleCategory = (cat: typeof CATEGORIES[0]) => {
    if (cat.filter === "contact") {
      window.location.href = "mailto:info@onesoft.org.uk";
      return;
    }
    setActiveCategory(prev => prev === cat.filter ? null : cat.filter);
    setQuery("");
  };

  const handleSolution = (sol: typeof SOLUTIONS[0]) => {
    window.location.href = `mailto:info@onesoft.org.uk?subject=Interested in ${encodeURIComponent(sol.title)}&body=Hi Onesoft team,%0A%0AI'm interested in learning more about ${encodeURIComponent(sol.title)}.%0A%0APlease get in touch.`;
    onClose();
  };

  const showResults = results.length > 0;
  const showDefault = !showResults;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      style={{ backgroundColor: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveCategory(null); }}
            placeholder="Search solutions, services, topics..."
            className="flex-1 text-[15px] text-gray-800 placeholder:text-gray-400 outline-none bg-transparent"
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">

          {/* Results */}
          {showResults && (
            <div className="px-4 py-3 space-y-1">
              {results.map(sol => {
                const Icon = sol.icon;
                return (
                  <button
                    key={sol.id}
                    onClick={() => handleSolution(sol)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800">{sol.title}</p>
                      <p className="text-[12px] text-gray-400 leading-snug truncate">{sol.desc}</p>
                    </div>
                    <span className="text-[10px] font-medium text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded ml-auto shrink-0 self-center">{sol.category}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Default: popular + categories */}
          {showDefault && (
            <div className="px-5 py-4 space-y-6">

              {/* Popular searches */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Popular Searches</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {POPULAR.map(term => (
                    <button
                      key={term}
                      onClick={() => handlePopular(term)}
                      className="text-[12px] text-gray-600 border border-gray-200 rounded-full px-3 py-1 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* Browse categories */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <Layers className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Browse Categories</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const isActive = activeCategory === cat.filter && cat.filter !== "contact";
                    return (
                      <button
                        key={cat.label}
                        onClick={() => handleCategory(cat)}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                          isActive
                            ? "border-blue-400 bg-blue-50"
                            : "border-gray-100 hover:border-blue-200 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? "text-blue-600" : "text-blue-500"}`} />
                        <div className="min-w-0">
                          <p className={`text-[13px] font-semibold leading-tight ${isActive ? "text-blue-700" : "text-blue-600"}`}>{cat.label}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{cat.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category results (when a category is active but no text query) */}
              {activeCategory && activeCategory !== "contact" && results.length === 0 && (
                <div className="text-center py-4 text-gray-400 text-sm">No solutions in this category yet</div>
              )}
            </div>
          )}

          {/* No results */}
          {query.trim() && results.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-gray-500 text-[13px]">No results for "<span className="font-semibold">{query}</span>"</p>
              <a
                href={`mailto:info@onesoft.org.uk?subject=Enquiry: ${encodeURIComponent(query)}`}
                className="inline-flex items-center gap-1.5 mt-3 text-blue-600 text-[13px] font-medium hover:underline"
              >
                <Mail className="w-3.5 h-3.5" /> Ask our team about this
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">Press <kbd className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-mono">Esc</kbd> to close</p>
          <a href="mailto:info@onesoft.org.uk" className="text-[11px] text-blue-500 hover:underline flex items-center gap-1">
            <Mail className="w-3 h-3" /> Contact our team
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <img src={onesoftLogo} alt="OneSoft" className="h-8 w-auto shrink-0" />

          {/* Search bar (desktop) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex flex-1 max-w-xs items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-400 transition-colors"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Search solutions…</span>
            <kbd className="bg-white border border-gray-200 rounded text-[10px] px-1.5 py-0.5 text-gray-400 font-mono shrink-0">⌘K</kbd>
          </button>

          <nav className="hidden md:flex items-center gap-6 text-[14px] text-gray-500 font-medium shrink-0">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#why" className="hover:text-gray-900 transition-colors">Why OneSoft</a>
            <a href="mailto:info@onesoft.org.uk" className="hover:text-gray-900 transition-colors">Contact</a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="md:hidden p-2 text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
            <a
              href="/admin-dashboard/"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              Sign In <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
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

          {/* Hero search bar */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 rounded-xl px-5 py-3.5 text-white/70 hover:text-white/90 text-[14px] mx-auto mb-8 transition-all max-w-md w-full"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Search CRM, ERP, Payroll…</span>
            <kbd className="bg-white/10 rounded text-[11px] px-2 py-0.5 text-white/50 font-mono shrink-0">⌘K</kbd>
          </button>

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
                  "Double-entry accounting built right in",
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
                { icon: TrendingUp, label: "Revenue Tracking",      color: "bg-blue-600"    },
                { icon: Users,      label: "Customer Management",   color: "bg-violet-600"  },
                { icon: Building2,  label: "Multi-Branch Support",  color: "bg-emerald-600" },
                { icon: Globe,      label: "Web-Based Platform",    color: "bg-amber-500"   },
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
            <button
              onClick={() => setSearchOpen(true)}
              className="mt-6 inline-flex items-center gap-2 text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all"
            >
              <Search size={13} /> Browse all {SOLUTIONS.length} solutions
            </button>
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

      {/* ── Search Modal ─────────────────────────────────────────────────────── */}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}

    </div>
  );
}
