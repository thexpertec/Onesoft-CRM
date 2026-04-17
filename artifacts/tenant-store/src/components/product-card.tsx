import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Heart, Star, Eye, Smartphone, Monitor, Shield, Headphones, Cable, Package, Cpu, Tablet, Camera, Battery, Wifi, Watch, CreditCard } from "lucide-react";
import type { Product } from "@/types/product";
import { useCart } from "@/lib/cart";
import { useStore } from "@/contexts/store-context";
import { cn, formatPrice, getStockQty, stockLabel } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
  className?: string;
}

const CATEGORY_THEMES: Record<string, { gradient: string; iconBg: string; accent: string; Icon: React.ElementType }> = {
  accessories:            { gradient: "from-violet-500 via-purple-500 to-indigo-600",   iconBg: "bg-white/20", accent: "text-violet-100", Icon: Cable },
  gadgets:                { gradient: "from-sky-500 via-blue-500 to-cyan-600",           iconBg: "bg-white/20", accent: "text-sky-100",    Icon: Cpu },
  "screen protection":    { gradient: "from-emerald-400 via-teal-500 to-green-600",      iconBg: "bg-white/20", accent: "text-emerald-100",Icon: Shield },
  "screen / device protection": { gradient: "from-emerald-400 via-teal-500 to-green-600", iconBg: "bg-white/20", accent: "text-emerald-100", Icon: Shield },
  phones:                 { gradient: "from-rose-500 via-pink-500 to-fuchsia-600",       iconBg: "bg-white/20", accent: "text-rose-100",   Icon: Smartphone },
  mobile:                 { gradient: "from-rose-500 via-pink-500 to-fuchsia-600",       iconBg: "bg-white/20", accent: "text-rose-100",   Icon: Smartphone },
  audio:                  { gradient: "from-orange-500 via-amber-500 to-yellow-500",     iconBg: "bg-white/20", accent: "text-orange-100", Icon: Headphones },
  headphones:             { gradient: "from-orange-500 via-amber-500 to-yellow-500",     iconBg: "bg-white/20", accent: "text-orange-100", Icon: Headphones },
  tablets:                { gradient: "from-cyan-500 via-teal-500 to-sky-600",           iconBg: "bg-white/20", accent: "text-cyan-100",   Icon: Tablet },
  cameras:                { gradient: "from-slate-600 via-gray-700 to-zinc-800",         iconBg: "bg-white/20", accent: "text-slate-100",  Icon: Camera },
  chargers:               { gradient: "from-lime-500 via-green-500 to-emerald-600",      iconBg: "bg-white/20", accent: "text-lime-100",   Icon: Battery },
  networking:             { gradient: "from-blue-600 via-indigo-600 to-violet-700",      iconBg: "bg-white/20", accent: "text-blue-100",   Icon: Wifi },
  watches:                { gradient: "from-amber-600 via-orange-600 to-red-600",        iconBg: "bg-white/20", accent: "text-amber-100",  Icon: Watch },
  monitors:               { gradient: "from-indigo-500 via-blue-600 to-cyan-700",        iconBg: "bg-white/20", accent: "text-indigo-100", Icon: Monitor },
};

const FALLBACK_GRADIENTS = [
  { gradient: "from-violet-500 via-purple-600 to-indigo-700",   Icon: Package },
  { gradient: "from-sky-500 via-blue-600 to-indigo-700",         Icon: Package },
  { gradient: "from-rose-500 via-pink-600 to-fuchsia-700",       Icon: Package },
  { gradient: "from-emerald-500 via-teal-600 to-cyan-700",       Icon: Package },
  { gradient: "from-amber-500 via-orange-600 to-red-700",        Icon: Package },
];

export function getProductTheme(product: Product) {
  const cat = (product.category ?? "").toLowerCase().trim();
  if (cat && CATEGORY_THEMES[cat]) return { ...CATEGORY_THEMES[cat] };
  // Deterministic fallback based on product name hash
  const hash = [...(product.name ?? "x")].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const fb = FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
  return { gradient: fb.gradient, iconBg: "bg-white/20", accent: "text-white/80", Icon: fb.Icon };
}

export function ProductCard({ product, className }: ProductCardProps) {
  const { addItem } = useCart();
  const { cms } = useStore();
  const [, navigate] = useLocation();
  const [wishlist, setWishlist] = useState(false);
  const [adding, setAdding] = useState(false);

  const qty = getStockQty(product.openingStock);
  const stock = stockLabel(qty, product.stockAlertQty);
  const isOutOfStock = stock === "out";
  const theme = getProductTheme(product);
  const { Icon } = theme;

  const hasImage = Boolean(product.thumbnail);
  const cartDisabled = isOutOfStock && !cms.shop.allowBackorder;

  // Pre-compute price variants for use throughout the card
  const displayPrice = product.websitePrice && parseFloat(product.websitePrice) > 0
    ? product.websitePrice
    : product.price;
  const wasPrice = product.websitePriceWas && parseFloat(product.websitePriceWas) > 0
    ? product.websitePriceWas
    : null;
  const clubPrice = product.clubcardPrice && parseFloat(product.clubcardPrice) > 0
    ? product.clubcardPrice
    : null;
  const clubSaving = clubPrice ? parseFloat(displayPrice) - parseFloat(clubPrice) : 0;

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (cartDisabled) return;
    setAdding(true);
    addItem(product, 1);
    setTimeout(() => setAdding(false), 800);
  }

  return (
    <div className={cn(
      "group relative bg-white dark:bg-slate-800/50 rounded-2xl overflow-hidden",
      "border border-gray-100 dark:border-slate-700/50 shadow-sm",
      "hover:shadow-xl hover:shadow-black/10 hover:-translate-y-1",
      "transition-all duration-300",
      className
    )}>
      {/* Image / Placeholder */}
      <Link href={`/product/${product.id}`} className="block relative overflow-hidden">
        <div className={cn(
          "aspect-square relative",
          hasImage
            ? "bg-gray-50 dark:bg-slate-800"
            : `bg-gradient-to-br ${theme.gradient}`
        )}>
          {hasImage ? (
            <img
              src={product.thumbnail}
              alt={product.name}
              className="w-full h-full object-contain p-6 transition-transform duration-500 group-hover:scale-105"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6">
              {/* Decorative circles */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/10" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-white/5" />
              </div>
              {/* Icon */}
              <div className={cn("relative z-10 rounded-2xl p-4 backdrop-blur-sm", theme.iconBg)}>
                <Icon size={36} className="text-white drop-shadow-sm" strokeWidth={1.5} />
              </div>
              {/* Category label */}
              <p className={cn("relative z-10 text-xs font-bold tracking-widest uppercase", theme.accent)}>
                {product.category ?? "Product"}
              </p>
            </div>
          )}

          {/* Shimmer overlay on hover */}
          {!hasImage && (
            <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          )}
        </div>

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {cms.shop.showStockBadge && isOutOfStock && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 shadow-sm">
              Out of Stock
            </span>
          )}
          {cms.shop.showStockBadge && stock === "low" && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 shadow-sm">
              Low Stock
            </span>
          )}
          {product.brand && (
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border border-white/60 shadow-sm backdrop-blur-sm">
              {product.brand}
            </span>
          )}
          {product.clubcardPrice && parseFloat(product.clubcardPrice) > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-md">
              <CreditCard size={9} />
              Clubcard
            </span>
          )}
        </div>

        {/* Quick actions */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWishlist(!wishlist); }}
            className={cn(
              "w-8 h-8 rounded-full shadow-md flex items-center justify-center transition-all",
              wishlist
                ? "bg-red-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-500 hover:text-red-500"
            )}
            aria-label="Wishlist"
          >
            <Heart size={13} className={wishlist ? "fill-white" : ""} />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/product/${product.id}`); }}
            className="w-8 h-8 rounded-full shadow-md bg-white dark:bg-slate-800 text-slate-500 hover:text-blue-600 flex items-center justify-center transition-colors"
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
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
            {product.category ?? "General"}
          </span>
          <div className="flex items-center gap-0.5">
            {[1,2,3,4,5].map(s => (
              <Star key={s} size={9} className={s <= 4 ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"} />
            ))}
          </div>
        </div>

        {/* Name */}
        <Link href={`/product/${product.id}`}>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-3">
            {product.name}
          </h3>
        </Link>

        {/* Price + Cart */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className={cn(
              "text-base font-extrabold tabular-nums",
              clubPrice ? "text-slate-400 dark:text-slate-500 line-through text-sm" : "text-slate-900 dark:text-white"
            )}>
              {formatPrice(displayPrice)}
            </div>
            {wasPrice && !clubPrice && (
              <div className="text-xs text-slate-400 line-through">{formatPrice(wasPrice)}</div>
            )}
            {clubPrice && (
              <div className="flex items-center gap-1 mt-0.5">
                <CreditCard size={10} className="text-blue-600 shrink-0" />
                <span className="text-[13px] font-extrabold text-blue-600 tabular-nums">{formatPrice(clubPrice)}</span>
                {clubSaving > 0 && (
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-700 rounded px-1 py-0.5 ml-0.5">
                    Save {formatPrice(clubSaving.toFixed(2))}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={cartDisabled || adding}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm",
              cartDisabled
                ? "bg-gray-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                : adding
                  ? "bg-green-500 text-white scale-95 shadow-green-200"
                  : "bg-blue-600 hover:bg-blue-700 text-white active:scale-95 shadow-blue-200 dark:shadow-blue-900/30"
            )}
          >
            <ShoppingCart size={12} />
            {adding ? "Added!" : "Add"}
          </button>
        </div>
      </div>

      {/* Full-width Clubcard button — only when clubcard price is set */}
      {clubPrice && (
        <Link href={`/product/${product.id}`} className="block">
          <div className="mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-lg border border-red-400 dark:border-red-500 px-3 py-2 text-[11.5px] font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer">
            <CreditCard size={12} className="shrink-0" />
            <span>
              {clubSaving > 0 ? `Save ${formatPrice(clubSaving.toFixed(2))} with Clubcard` : "View Clubcard Price"}
            </span>
          </div>
        </Link>
      )}

      {/* Bottom accent bar — uses the category colour */}
      {!hasImage && (
        <div className={cn("h-0.5 w-full bg-gradient-to-r", theme.gradient, "opacity-70")} />
      )}
    </div>
  );
}
