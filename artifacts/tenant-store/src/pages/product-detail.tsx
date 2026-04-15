import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, ShoppingCart, Heart, Share2, Star,
  Check, Truck, ShieldCheck, RotateCcw, Minus, Plus
} from "lucide-react";
import { useStore } from "@/contexts/store-context";
import { useCart } from "@/lib/cart";
import { ProductCard } from "@/components/product-card";
import { formatPrice, getStockQty, stockLabel, cn } from "@/lib/utils";

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { products, cms } = useStore();
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [wishlist, setWishlist] = useState(false);

  const product = useMemo(() => products.find(p => p.id === id), [products, id]);
  const related = useMemo(() =>
    products.filter(p => p.id !== id && p.category === product?.category).slice(0, 4),
    [products, id, product]
  );

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="text-slate-300 dark:text-slate-600 mb-4">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Product not found</h2>
        <p className="text-slate-400 mb-6 text-sm">This product may have been removed or is unavailable.</p>
        <Link href="/shop" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors">
          <ArrowLeft size={14} /> Back to Shop
        </Link>
      </div>
    );
  }

  const stockQty = getStockQty(product.openingStock);
  const stock = stockLabel(stockQty, product.stockAlertQty);
  const isOutOfStock = stock === "out";

  function handleAdd() {
    if (isOutOfStock) return;
    addItem(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      {cms.breadcrumbs.enabled && (() => {
        const sep = <span className="opacity-50">{cms.breadcrumbs.separator}</span>;
        return (
          <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-6">
            <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
            {sep}
            <Link href="/shop" className="hover:text-blue-600 transition-colors">Shop</Link>
            {product.category && (<>{sep}<Link href={`/category/${encodeURIComponent(product.category)}`} className="hover:text-blue-600 transition-colors">{product.category}</Link></>)}
            {sep}
            <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[200px]">{product.name}</span>
          </nav>
        );
      })()}

      <div className="grid lg:grid-cols-2 gap-10 mb-16">
        {/* Image */}
        <div>
          <div className="aspect-square rounded-3xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 flex items-center justify-center p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/20" />
            {product.thumbnail ? (
              <img
                src={product.thumbnail}
                alt={product.name}
                className="relative w-full h-full object-contain"
              />
            ) : (
              <div className="relative flex flex-col items-center gap-4 text-slate-300 dark:text-slate-600">
                <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                <p className="text-sm font-medium">{product.category ?? "Product"}</p>
              </div>
            )}

            {isOutOfStock && (
              <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 text-xs font-bold">
                Out of Stock
              </div>
            )}
            {stock === "low" && !isOutOfStock && (
              <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 text-xs font-bold">
                Only {stockQty} left!
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            {product.brand && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                {product.brand}
              </span>
            )}
            {product.category && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {product.category}
                {product.subcategory ? ` / ${product.subcategory}` : ""}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3 leading-snug">
            {product.name}
          </h1>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={14} className={s <= 4 ? "text-amber-400 fill-amber-400" : "text-gray-200 dark:text-slate-700 fill-gray-200 dark:fill-slate-700"} />
              ))}
            </div>
            <span className="text-xs text-slate-400">(4.0) · 24 reviews</span>
          </div>

          <div className="flex items-end gap-3 mb-6 pb-6 border-b border-gray-100 dark:border-slate-800">
            {(() => {
              const displayPrice = product.websitePrice && parseFloat(product.websitePrice) > 0
                ? product.websitePrice
                : product.price;
              const wasPrice = product.websitePriceWas && parseFloat(product.websitePriceWas) > 0
                ? product.websitePriceWas
                : null;
              return (
                <>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">
                    {formatPrice(displayPrice)}
                  </div>
                  {wasPrice && (
                    <div className="text-lg text-slate-400 line-through mb-0.5">
                      {formatPrice(wasPrice)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {product.description && (
            <div className="mb-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{product.description}</p>
            </div>
          )}

          {(product.sku || product.barcode) && (
            <div className="flex items-center gap-4 text-xs text-slate-400 mb-6">
              {product.sku && <span>SKU: <span className="font-mono text-slate-600 dark:text-slate-300">{product.sku}</span></span>}
              {product.barcode && <span>Barcode: <span className="font-mono text-slate-600 dark:text-slate-300">{product.barcode}</span></span>}
            </div>
          )}

          <div className="flex items-center gap-2 mb-6">
            <div className={cn(
              "w-2 h-2 rounded-full",
              stock === "in" ? "bg-green-500" : stock === "low" ? "bg-amber-500" : "bg-red-500"
            )} />
            <span className={cn(
              "text-sm font-medium",
              stock === "in" ? "text-green-600 dark:text-green-400" :
              stock === "low" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
            )}>
              {stock === "in" ? "In Stock" : stock === "low" ? `Low Stock — ${stockQty} remaining` : "Out of Stock"}
            </span>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="px-3 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Minus size={14} />
              </button>
              <span className="px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white min-w-[48px] text-center border-x border-gray-200 dark:border-slate-700">
                {qty}
              </span>
              <button
                onClick={() => setQty(q => q + 1)}
                className="px-3 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>

            <button
              onClick={handleAdd}
              disabled={isOutOfStock}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all",
                isOutOfStock
                  ? "bg-gray-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                  : added
                    ? "bg-green-500 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98] shadow-lg shadow-blue-600/20"
              )}
            >
              {added ? <Check size={16} /> : <ShoppingCart size={16} />}
              {added ? "Added to Cart!" : isOutOfStock ? "Out of Stock" : "Add to Cart"}
            </button>

            <button
              onClick={() => setWishlist(!wishlist)}
              className={cn(
                "w-12 h-12 rounded-xl border flex items-center justify-center transition-all",
                wishlist
                  ? "border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/40 text-red-500"
                  : "border-gray-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800/50"
              )}
              aria-label="Wishlist"
            >
              <Heart size={16} className={wishlist ? "fill-red-500" : ""} />
            </button>

            <button
              className="w-12 h-12 rounded-xl border border-gray-200 dark:border-slate-700 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-800/50 flex items-center justify-center transition-all"
              aria-label="Share"
            >
              <Share2 size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Truck, label: "Free Delivery", sub: "UK & Int'l" },
              { icon: ShieldCheck, label: "2-Year Warranty", sub: "Covered" },
              { icon: RotateCcw, label: "30-Day Returns", sub: "Hassle-free" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex flex-col items-center text-center p-3 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50">
                <Icon size={16} className="text-blue-600 dark:text-blue-400 mb-1.5" />
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</div>
                <div className="text-[10px] text-slate-400">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Related Products</h2>
            <Link href={`/category/${encodeURIComponent(product.category ?? "")}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium">
              View all <ChevronRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {related.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}
