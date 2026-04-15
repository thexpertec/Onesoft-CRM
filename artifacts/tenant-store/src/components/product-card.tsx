import { useState } from "react";
import { Link } from "wouter";
import { ShoppingCart, Heart, Star, Eye } from "lucide-react";
import type { Product } from "@/types/product";
import { useCart } from "@/lib/cart";
import { cn, formatPrice, getStockQty, stockLabel } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const { addItem } = useCart();
  const [wishlist, setWishlist] = useState(false);
  const [adding, setAdding] = useState(false);

  const qty = getStockQty(product.openingStock);
  const stock = stockLabel(qty, product.stockAlertQty);

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAdding(true);
    addItem(product, 1);
    setTimeout(() => setAdding(false), 800);
  }

  return (
    <div className={cn(
      "group relative bg-white dark:bg-slate-800/50 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-700/50",
      "hover:border-blue-200 dark:hover:border-blue-800/50 hover:shadow-lg hover:shadow-blue-500/5",
      "transition-all duration-300",
      className
    )}>
      {/* Image */}
      <Link href={`/product/${product.id}`} className="block relative overflow-hidden bg-gray-50 dark:bg-slate-800">
        <div className="aspect-square flex items-center justify-center p-6 relative">
          {product.thumbnail ? (
            <img
              src={product.thumbnail}
              alt={product.name}
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-slate-300 dark:text-slate-600">
                <div className="w-16 h-16 mx-auto mb-2 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                </div>
                <p className="text-xs font-medium">{product.category ?? "Product"}</p>
              </div>
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {stock === "out" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
              Out of Stock
            </span>
          )}
          {stock === "low" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
              Low Stock
            </span>
          )}
          {product.brand && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
              {product.brand}
            </span>
          )}
        </div>

        {/* Quick actions */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWishlist(!wishlist); }}
            className={cn(
              "w-8 h-8 rounded-full shadow-sm flex items-center justify-center transition-all",
              wishlist
                ? "bg-red-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-red-500"
            )}
            aria-label="Wishlist"
          >
            <Heart size={13} className={wishlist ? "fill-white" : ""} />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.assign(`/tenant-store/product/${product.id}`); }}
            className="w-8 h-8 rounded-full shadow-sm bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 flex items-center justify-center transition-colors"
            aria-label="Quick view"
          >
            <Eye size={13} />
          </button>
        </div>
      </Link>

      {/* Info */}
      <div className="p-4">
        {/* Category & Rating */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide">
            {product.category ?? "General"}
          </span>
          <div className="flex items-center gap-0.5">
            {[1,2,3,4,5].map(s => (
              <Star key={s} size={9} className={s <= 4 ? "text-amber-400 fill-amber-400" : "text-gray-200 dark:text-slate-700 fill-gray-200 dark:fill-slate-700"} />
            ))}
          </div>
        </div>

        {/* Name */}
        <Link href={`/product/${product.id}`}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-3">
            {product.name}
          </h3>
        </Link>

        {/* Price + Cart */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-white">
              {formatPrice(product.price)}
            </div>
            {product.wholesalePrice && parseFloat(product.wholesalePrice) > 0 && parseFloat(product.wholesalePrice) !== parseFloat(product.price) && (
              <div className="text-xs text-slate-400 line-through">{formatPrice(product.wholesalePrice)}</div>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={stock === "out" || adding}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              stock === "out"
                ? "bg-gray-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                : adding
                  ? "bg-green-500 text-white scale-95"
                  : "bg-blue-600 hover:bg-blue-700 text-white active:scale-95"
            )}
          >
            <ShoppingCart size={12} />
            {adding ? "Added!" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
