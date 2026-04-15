import { useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowRight, Cpu, Laptop, Smartphone, Headphones,
  Gamepad2, Tablet, Cable, Camera, Tv, Watch, ShieldCheck, Truck, RotateCcw, HeadphonesIcon
} from "lucide-react";
import { useStore } from "@/contexts/store-context";
import { ProductCard } from "@/components/product-card";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  default: Cpu,
  Laptops: Laptop,
  Laptop: Laptop,
  Smartphones: Smartphone,
  Smartphone: Smartphone,
  Phones: Smartphone,
  Phone: Smartphone,
  Audio: Headphones,
  Headphones: Headphones,
  Gaming: Gamepad2,
  Tablets: Tablet,
  Tablet: Tablet,
  Cables: Cable,
  Accessories: Cable,
  Cameras: Camera,
  Camera: Camera,
  "TV & Home": Tv,
  TV: Tv,
  Wearables: Watch,
  Smartwatch: Watch,
};

export function HomePage() {
  const { products, loading, categories } = useStore();

  const featured = useMemo(() => products.slice(0, 8), [products]);
  const newArrivals = useMemo(() => [...products].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 4), [products]);

  const displayCats = categories.length > 0 ? categories.slice(0, 8) : [
    "Smartphones", "Laptops", "Tablets", "Gaming", "Audio", "Cameras", "Accessories", "Wearables"
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(99,102,241,0.4) 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              New Arrivals Every Week
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight tracking-tight">
              Premium Tech,{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                Delivered Fast
              </span>
            </h1>
            <p className="text-slate-400 text-lg max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              Discover the latest smartphones, laptops, audio gear, and accessories. Handpicked for quality, priced for value.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                href="/shop"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all hover:shadow-lg hover:shadow-blue-600/30 active:scale-95"
              >
                Shop All Products
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/shop?sort=newest"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-white/20 text-white hover:bg-white/10 rounded-xl font-semibold text-sm transition-all"
              >
                New Arrivals
              </Link>
            </div>
            <div className="flex items-center gap-8 mt-10 justify-center lg:justify-start">
              {[
                { value: products.length > 0 ? `${products.length}+` : "500+", label: "Products" },
                { value: "Free", label: "UK Delivery" },
                { value: "24/7", label: "Support" },
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
                    <div
                      key={i}
                      className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-blue-400 hover:bg-blue-600/20 transition-all duration-300"
                    >
                      <Icon size={20} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Strip */}
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
              <Link
                key={cat}
                href={`/category/${encodeURIComponent(cat)}`}
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

      {/* Featured Products */}
      <section className="py-8 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Featured Products</h2>
            <p className="text-sm text-slate-500 mt-0.5">Handpicked for quality and value</p>
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

      {/* Promo Banner */}
      <section className="py-8 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 p-8 sm:p-12">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="absolute top-1/2 right-12 -translate-y-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="text-sm font-semibold text-blue-200 mb-2 uppercase tracking-wide">Limited Time Offer</div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">Free Delivery on<br />All Orders Today</h3>
              <p className="text-blue-200 text-sm">No minimum spend. Available across the UK & internationally.</p>
            </div>
            <Link
              href="/shop"
              className="shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg"
            >
              Shop Now
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* New Arrivals */}
      {newArrivals.length > 0 && (
        <section className="py-8 px-4 sm:px-6 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">New Arrivals</h2>
              <p className="text-sm text-slate-500 mt-0.5">Just landed in our store</p>
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

      {/* Trust Badges */}
      <section className="py-12 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Truck, title: "Free UK Delivery", desc: "On all orders, every day" },
            { icon: ShieldCheck, title: "2-Year Warranty", desc: "All products covered" },
            { icon: RotateCcw, title: "30-Day Returns", desc: "Hassle-free returns" },
            { icon: HeadphonesIcon, title: "24/7 Support", desc: "Always here to help" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 p-5 rounded-2xl bg-white dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                <Icon size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
