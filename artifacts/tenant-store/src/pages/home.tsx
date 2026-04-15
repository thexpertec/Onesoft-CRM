import { useMemo, useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowRight, Cpu, Laptop, Smartphone, Headphones,
  Gamepad2, Tablet, Cable, Camera, Tv, Watch,
  ShieldCheck, Truck, RotateCcw, HeadphonesIcon, Zap, Star, Heart, Package, Globe,
  Battery, Plug, Speaker, Mouse, Printer, MonitorSmartphone, Wrench, ShoppingBag,
} from "lucide-react";
import { useStore } from "@/contexts/store-context";
import { ProductCard } from "@/components/product-card";

// ─── Icon map (used by trust badges configured via CMS) ───────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Truck, ShieldCheck, RotateCcw, HeadphonesIcon, Zap, Star, Heart, Package, Globe,
  Laptop, Smartphone, Headphones, Gamepad2, Tablet, Cable, Camera, Tv, Watch, Cpu,
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  default: Cpu,
  // Laptops / Computers
  Laptops: Laptop, Laptop, "Laptops & Computers": Laptop, Computers: Laptop,
  // Phones
  Smartphones: Smartphone, Smartphone, Phones: Smartphone, Phone: Smartphone,
  "Mobile Smart Phones": Smartphone, "Mobile & Smart Phones": Smartphone,
  // Audio
  Audio: Headphones, Headphones, "Audio & Headphones": Headphones,
  Speakers: Speaker, Speaker,
  // Gaming
  Gaming: Gamepad2, Consoles: Gamepad2,
  // Tablets
  Tablets: Tablet, Tablet,
  // Cables & Charging
  Cables: Cable, Cable, "Cables & Adapters": Cable, Adapters: Cable,
  "Chargers & Docks": Plug, Chargers: Plug, Docks: Plug,
  // Batteries
  Batteries: Battery, Battery,
  // Cameras
  Cameras: Camera, Camera,
  // TVs
  "TV & Home": Tv, TV: Tv, Televisions: Tv,
  // Wearables / Watches
  Wearables: Watch, Smartwatch: Watch, Watches: Watch,
  // Accessories
  Accessories: ShoppingBag, "Mobile Accessories": ShoppingBag,
  // Peripherals
  Mouse, Mice: Mouse, Keyboards: Cpu, Printers: Printer, Printer,
  // Repair / Services
  Repair: Wrench, Services: Wrench,
  // General
  MonitorSmartphone,
};

export function HomePage() {
  const { products, loading, categories, cms } = useStore();

  const featured = useMemo(() => products.slice(0, 8), [products]);
  const newArrivals = useMemo(() => [...products].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 4), [products]);

  const displayCats = useMemo(() => {
    const raw = categories.length > 0 ? categories : [
      "Smartphones", "Laptops", "Tablets", "Gaming", "Audio & Headphones", "Cameras", "Accessories", "Wearables",
    ];
    const mains = [...new Set(raw.map(c => c.includes(" > ") ? c.split(" > ")[0].trim() : c))].sort();
    return mains.slice(0, 8);
  }, [categories]);

  // ── Apply SEO meta tags ───────────────────────────────────────────────────
  useEffect(() => {
    if (cms.seo.title)       document.title = cms.seo.title;
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
      el.content = content;
    };
    if (cms.seo.description) setMeta("description", cms.seo.description);
    if (cms.seo.keywords)    setMeta("keywords",    cms.seo.keywords);
  }, [cms.seo]);

  const { hero, promoBanner, trustBadges, featuredSection, newArrivalsSection } = cms;

  const heroStat1Value = products.length > 0 ? `${products.length}+` : hero.stat1Value;

  return (
    <div className="min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950">
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(99,102,241,0.4) 1px, transparent 0)", backgroundSize: "40px 40px" }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1 text-center lg:text-left">
            {hero.badge && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                {hero.badge}
              </div>
            )}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight tracking-tight">
              {hero.headline1}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                {hero.headline2}
              </span>
            </h1>
            <p className="text-slate-400 text-lg max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              {hero.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link href="/shop" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all hover:shadow-lg hover:shadow-blue-600/30 active:scale-95">
                {hero.btn1Text}
                <ArrowRight size={15} />
              </Link>
              <Link href="/shop?sort=newest" className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-white/20 text-white hover:bg-white/10 rounded-xl font-semibold text-sm transition-all">
                {hero.btn2Text}
              </Link>
            </div>
            <div className="flex items-center gap-8 mt-10 justify-center lg:justify-start">
              {[
                { value: heroStat1Value,  label: hero.stat1Label },
                { value: hero.stat2Value, label: hero.stat2Label },
                { value: hero.stat3Value, label: hero.stat3Label },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <div className="text-xl font-bold text-white">{stat.value}</div>
                  <div className="text-xs text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:flex flex-1 items-center justify-center">
            <div className="relative w-80 h-80">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-purple-600/30 rounded-3xl blur-2xl" />
              <div className="relative w-full h-full rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-center justify-center">
                <div className="grid grid-cols-2 gap-4 p-8">
                  {[Smartphone, Laptop, Headphones, Gamepad2, Camera, Watch, Tablet, Tv].map((Icon, i) => (
                    <div key={i} className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-blue-400 hover:bg-blue-600/20 transition-all duration-300">
                      <Icon size={20} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Category Strip ───────────────────────────────────────────────── */}
      <section className="py-12 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Shop by Category</h2>
          <Link href="/shop" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium">
            All <ArrowRight size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {displayCats.map(cat => {
            const Icon = CATEGORY_ICONS[cat] ?? CATEGORY_ICONS.default;
            return (
              <Link key={cat} href={`/shop?cat=${encodeURIComponent(cat)}`}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 hover:border-blue-200 dark:hover:border-blue-800/50 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 flex items-center justify-center transition-colors">
                  <Icon size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-center leading-tight">
                  {cat}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Featured Products ────────────────────────────────────────────── */}
      <section className="py-8 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{featuredSection.title}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{featuredSection.subtitle}</p>
          </div>
          <Link href="/shop" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium">
            See all <ArrowRight size={13} />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse aspect-[3/4]" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Cpu size={48} className="mx-auto mb-4 opacity-30" />
            <p className="font-medium">No products available yet</p>
            <p className="text-sm mt-1">Products will appear here once added to the store</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featured.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* ── Promo Banner ─────────────────────────────────────────────────── */}
      {promoBanner.enabled && (
        <section className="py-8 px-4 sm:px-6 max-w-7xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 p-8 sm:p-12">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
            <div className="absolute top-1/2 right-12 -translate-y-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                {promoBanner.label && (
                  <div className="text-sm font-semibold text-blue-200 mb-2 uppercase tracking-wide">{promoBanner.label}</div>
                )}
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">{promoBanner.headline}</h3>
                <p className="text-blue-200 text-sm">{promoBanner.subtitle}</p>
              </div>
              <Link href="/shop" className="shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg">
                {promoBanner.btnText}
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Repair Services Banner ───────────────────────────────────────── */}
      <section className="py-4 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-8 sm:p-12">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
          <div className="absolute top-1/2 right-12 -translate-y-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-24 w-40 h-40 bg-fuchsia-400/20 rounded-full blur-2xl" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="text-sm font-semibold text-purple-200 mb-2 uppercase tracking-wide flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                Professional Repair Service
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">We Fix What Others Can't</h3>
              <p className="text-purple-200 text-sm">Phones, laptops, tablets &amp; more — fast turnaround, genuine parts, warranty included.</p>
            </div>
            <Link href="/services" className="shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-600 rounded-xl font-bold text-sm hover:bg-purple-50 transition-colors shadow-lg">
              Book a Repair
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── New Arrivals ─────────────────────────────────────────────────── */}
      {newArrivals.length > 0 && (
        <section className="py-8 px-4 sm:px-6 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{newArrivalsSection.title}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{newArrivalsSection.subtitle}</p>
            </div>
            <Link href="/shop?sort=newest" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {newArrivals.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* ── Trust Badges ─────────────────────────────────────────────────── */}
      <section className="py-12 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {trustBadges.map((badge) => {
            const Icon = ICON_MAP[badge.icon] ?? Truck;
            return (
              <div key={badge.title} className="flex items-start gap-3 p-5 rounded-2xl bg-white dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{badge.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{badge.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
