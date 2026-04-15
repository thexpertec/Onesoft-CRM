import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useStore } from "@/contexts/store-context";
import { ProductCard } from "@/components/product-card";

export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { products, loading, cms } = useStore();
  const sep = cms.breadcrumbs.separator;

  const category = useMemo(() => {
    try { return decodeURIComponent(slug); } catch { return slug; }
  }, [slug]);

  const filtered = useMemo(() =>
    products.filter(p => p.category === category),
    [products, category]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {cms.breadcrumbs.enabled && (
        <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-6">
          <Link href="/home" className="hover:text-blue-600 transition-colors">Home</Link>
          <span className="opacity-50">{sep}</span>
          <Link href="/shop" className="hover:text-blue-600 transition-colors">Shop</Link>
          <span className="opacity-50">{sep}</span>
          <span className="text-slate-700 dark:text-slate-300 font-medium">{category}</span>
        </nav>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{category}</h1>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} product{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/shop"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <ArrowLeft size={14} /> All Products
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse aspect-[3/4]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">No products in this category</h3>
          <p className="text-sm text-slate-400 mb-6">Check back soon or browse other categories</p>
          <Link href="/shop" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors">
            <ArrowLeft size={14} /> Browse All Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
