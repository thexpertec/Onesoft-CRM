import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, ShoppingCart, Heart, Share2, Star,
  Check, Truck, ShieldCheck, RotateCcw, Minus, Plus, ChevronRight, CreditCard, BadgeCheck, AlertCircle
} from "lucide-react";
import { useStore } from "@/contexts/store-context";
import { useCart } from "@/lib/cart";
import { ProductCard, getProductTheme } from "@/components/product-card";
import { formatPrice, getStockQty, stockLabel, cn, isBogo } from "@/lib/utils";
import { useCustomerSession } from "@/hooks/use-customer-session";
import type { ProductVariant } from "@/types/product";

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { products, cms, storeTheme } = useStore();
  const { addItem } = useCart();
  const { isLoggedIn } = useCustomerSession();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [wishlist, setWishlist] = useState(false);
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});

  const mp = storeTheme === "marketplace";

  const product = useMemo(() => products.find(p => p.id === id), [products, id]);
  const related = useMemo(() =>
    products.filter(p => p.id !== id && p.category === product?.category).slice(0, 4),
    [products, id, product]
  );

  const hasVariants = Boolean(product?.productAttributes?.length && product?.variants?.length);

  const attrValueMap = useMemo<Record<string, string[]>>(() => {
    if (!product?.productAttributes || !product?.variants) return {};
    const map: Record<string, string[]> = {};
    for (const name of product.productAttributes) {
      const vals = [...new Set(product.variants.map(v => v.attributes[name]).filter(Boolean))];
      if (vals.length) map[name] = vals;
    }
    return map;
  }, [product]);

  const allAttrsSelected = useMemo(() => {
    if (!hasVariants) return true;
    return Object.keys(attrValueMap).every(name => Boolean(selectedAttrs[name]));
  }, [hasVariants, attrValueMap, selectedAttrs]);

  const selectedVariant = useMemo<ProductVariant | undefined>(() => {
    if (!allAttrsSelected || !product?.variants) return undefined;
    return product.variants.find(v =>
      Object.entries(selectedAttrs).every(([k, val]) => v.attributes[k] === val)
    );
  }, [allAttrsSelected, product?.variants, selectedAttrs]);

  const selectAttrValue = (attrName: string, value: string) => {
    setSelectedAttrs(prev => ({ ...prev, [attrName]: prev[attrName] === value ? "" : value }));
  };

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
        <Link
          href="/shop"
          className={cn(
            "inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-medium text-sm transition-colors",
            mp ? "bg-orange-500 hover:bg-orange-600" : "bg-blue-600 hover:bg-blue-700"
          )}
        >
          <ArrowLeft size={14} /> Back to Shop
        </Link>
      </div>
    );
  }

  const stockQty = getStockQty(product.openingStock);
  const stock = stockLabel(stockQty, product.stockAlertQty);
  const isOutOfStock = stock === "out";
  const cartDisabled = isOutOfStock && !cms.shop.allowBackorder;
  const theme = getProductTheme(product);
  const ThemeIcon = theme.Icon;
  const displayImage = selectedVariant?.image || product.thumbnail || undefined;
  const hasImage = Boolean(displayImage);

  const bogoActive = isBogo(product ?? {}, isLoggedIn);

  function handleAdd() {
    if (!product || cartDisabled) return;
    if (hasVariants && !allAttrsSelected) return;
    const cartQty = bogoActive ? qty * 2 : qty;
    addItem(product, cartQty, selectedVariant);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      {cms.breadcrumbs.enabled && (() => {
        const sep = <span className="opacity-50">{cms.breadcrumbs.separator}</span>;
        const linkCls = cn("transition-colors", mp ? "hover:text-orange-600" : "hover:text-blue-600");
        return (
          <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-6">
            <Link href="/home" className={linkCls}>Home</Link>
            {sep}
            <Link href="/shop" className={linkCls}>Shop</Link>
            {product.category && (<>{sep}<Link href={`/category/${encodeURIComponent(product.category)}`} className={linkCls}>{product.category}</Link></>)}
            {sep}
            <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[200px]">{product.name}</span>
          </nav>
        );
      })()}

      <div className="grid lg:grid-cols-2 gap-10 mb-16">
        {/* Image */}
        <div>
          <div className={cn(
            "aspect-square rounded-3xl overflow-hidden relative",
            hasImage
              ? "bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 p-10"
              : `bg-gradient-to-br ${theme.gradient}`
          )}>
            {hasImage ? (
              <>
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-br to-transparent",
                  mp ? "from-orange-50/50 dark:from-orange-950/20" : "from-blue-50/50 dark:from-blue-950/20"
                )} />
                <img
                  src={displayImage}
                  alt={product.name}
                  className="relative w-full h-full object-contain"
                />
              </>
            ) : (
              <>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10" />
                  <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-white/10" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-white/5" />
                  <div className="absolute top-1/4 right-1/4 w-24 h-24 rounded-full bg-white/5" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/10 to-white/0" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
                  <div className={cn("rounded-3xl p-7 backdrop-blur-sm shadow-xl", theme.iconBg)}>
                    <ThemeIcon size={72} className="text-white drop-shadow-lg" strokeWidth={1.2} />
                  </div>
                  <p className={cn("text-sm font-bold tracking-widest uppercase", theme.accent)}>
                    {product.subcategory
                      ? `${product.category} › ${product.subcategory}`
                      : (product.category ?? "Product")}
                  </p>
                </div>
                <div className={cn("absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r", theme.gradient, "opacity-60")} />
              </>
            )}

            {/* Stock badges */}
            {cms.shop.showStockBadge && isOutOfStock && (
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-bold shadow-lg">
                Out of Stock
              </div>
            )}
            {cms.shop.showStockBadge && stock === "low" && !isOutOfStock && (
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold shadow-lg">
                Only {stockQty} left!
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            {product.brand && (
              <span className={cn(
                "text-xs font-semibold px-2.5 py-1 rounded-full border",
                mp
                  ? "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/50"
                  : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50"
              )}>
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

          {(() => {
            const baseDisplayPrice = product.websitePrice && parseFloat(product.websitePrice) > 0
              ? product.websitePrice
              : product.price;
            const variantOverride = selectedVariant?.price && parseFloat(selectedVariant.price) > 0
              ? selectedVariant.price : null;
            const displayPrice = variantOverride ?? baseDisplayPrice;
            const wasPrice = !variantOverride && product.websitePriceWas && parseFloat(product.websitePriceWas) > 0
              ? product.websitePriceWas
              : null;
            const clubPrice = product.clubcardPrice && parseFloat(product.clubcardPrice) > 0
              ? product.clubcardPrice
              : null;
            const clubSaving = clubPrice
              ? (parseFloat(displayPrice) - parseFloat(clubPrice)).toFixed(2)
              : null;

            return (
              <div className="mb-6 pb-6 border-b border-gray-100 dark:border-slate-800 space-y-3">
                {/* ── Price row ── */}
                {clubPrice && isLoggedIn ? (
                  <div>
                    <p className="text-sm text-slate-400 dark:text-slate-500 line-through tabular-nums">
                      {formatPrice(displayPrice)}
                    </p>
                    <div className="flex items-baseline gap-3 mt-0.5">
                      <span className={cn(
                        "text-3xl font-bold tabular-nums",
                        mp ? "text-orange-700 dark:text-orange-300" : "text-blue-700 dark:text-blue-300"
                      )}>
                        {formatPrice(clubPrice)}
                      </span>
                      {clubSaving && parseFloat(clubSaving) > 0 && (
                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          You save {formatPrice(clubSaving)}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end gap-3">
                    <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatPrice(displayPrice)}
                    </div>
                    {wasPrice && (
                      <div className="text-lg text-slate-400 line-through mb-0.5 tabular-nums">
                        {formatPrice(wasPrice)}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Clubcard BOGO block ── */}
                {product.clubcardBogo && (
                  bogoActive ? (
                    <div className="rounded-xl bg-teal-500 px-4 py-3 flex items-center gap-3">
                      <BadgeCheck size={18} className="text-white shrink-0" />
                      <div>
                        <p className="text-white font-bold text-[14px]">Buy 1 Get 1 Free — Clubcard Offer</p>
                        <p className="text-teal-100 text-[11px]">
                          Adding {qty} gives you {qty * 2} items — the 2nd item is free for Clubcard members.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 p-3.5">
                      <div className="flex items-center gap-2 mb-1">
                        <BadgeCheck size={14} className="text-teal-600 dark:text-teal-400" />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400">
                          Clubcard Offer: Buy 1 Get 1 Free
                        </span>
                      </div>
                      <p className="text-sm text-teal-700 dark:text-teal-300 font-medium">
                        Sign in with your Clubcard to get every 2nd item free on this product.
                      </p>
                      <Link href="/clubcard">
                        <button className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 transition-colors">
                          <BadgeCheck size={11} />
                          Get a Clubcard
                          <ChevronRight size={11} />
                        </button>
                      </Link>
                    </div>
                  )
                )}

                {/* ── Clubcard price block (only when no BOGO) ── */}
                {!product.clubcardBogo && clubPrice && (
                  isLoggedIn ? (
                    <div className="rounded-xl bg-emerald-500 px-4 py-3 flex items-center gap-3">
                      <BadgeCheck size={18} className="text-white shrink-0" />
                      <div>
                        <p className="text-white font-bold text-[14px]">
                          {clubSaving && parseFloat(clubSaving) > 0
                            ? `Saved ${formatPrice(clubSaving)} | Clubcard`
                            : "Clubcard Price Applied"}
                        </p>
                        <Link href="/clubcard">
                          <span className="text-emerald-100 text-[11px] hover:underline cursor-pointer">
                            View your Clubcard →
                          </span>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3.5">
                      <div className="flex items-center gap-2 mb-1">
                        <CreditCard size={14} className="text-red-500 dark:text-red-400" />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-red-500 dark:text-red-400">
                          Clubcard Price Available
                        </span>
                      </div>
                      <p className="text-sm text-red-600 dark:text-red-300 font-medium">
                        {clubSaving && parseFloat(clubSaving) > 0
                          ? `Save ${formatPrice(clubSaving)} — sign in to unlock your Clubcard price`
                          : "Sign in to see your exclusive Clubcard price"}
                      </p>
                      <Link href="/clubcard">
                        <button className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-red-500 dark:text-red-400 hover:text-red-600 transition-colors">
                          <CreditCard size={11} />
                          Get a Clubcard
                          <ChevronRight size={11} />
                        </button>
                      </Link>
                    </div>
                  )
                )}
              </div>
            );
          })()}

          {product.description && (
            <div className="mb-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* ── Variant attribute capsule selectors ── */}
          {hasVariants && Object.keys(attrValueMap).length > 0 && (
            <div className="mb-6 space-y-4">
              {Object.entries(attrValueMap).map(([attrName, values]) => (
                <div key={attrName}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{attrName}</span>
                    {selectedAttrs[attrName] && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{selectedAttrs[attrName]}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {values.map(value => {
                      const isSelected = selectedAttrs[attrName] === value;
                      const isAvailable = product.variants?.some(v =>
                        v.attributes[attrName] === value &&
                        Object.entries(selectedAttrs)
                          .filter(([k]) => k !== attrName)
                          .every(([k, sv]) => !sv || v.attributes[k] === sv)
                      ) ?? true;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => selectAttrValue(attrName, value)}
                          disabled={!isAvailable}
                          className={cn(
                            "px-4 py-1.5 rounded-full text-sm font-medium border-2 transition-all duration-150",
                            isSelected
                              ? mp
                                ? "border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/20"
                                : "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20"
                              : isAvailable
                                ? mp
                                  ? "border-gray-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-orange-400 dark:hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 bg-white dark:bg-slate-800"
                                  : "border-gray-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-slate-800"
                                : "border-gray-100 dark:border-slate-700 text-slate-300 dark:text-slate-600 bg-gray-50 dark:bg-slate-800/50 cursor-not-allowed line-through"
                          )}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Variant price & selection status */}
              {allAttrsSelected && selectedVariant ? (
                <div className={cn(
                  "flex items-center gap-2 p-3 rounded-xl border",
                  mp
                    ? "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900"
                    : "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900"
                )}>
                  <Check size={14} className={cn("shrink-0", mp ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400")} />
                  <div className="flex-1">
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {Object.entries(selectedAttrs).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </span>
                  </div>
                  {selectedVariant.price && parseFloat(selectedVariant.price) > 0 && (
                    <span className={cn(
                      "text-base font-bold tabular-nums",
                      mp ? "text-orange-700 dark:text-orange-300" : "text-blue-700 dark:text-blue-300"
                    )}>
                      {formatPrice(selectedVariant.price)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900">
                  <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm text-amber-700 dark:text-amber-300">
                    Please select {Object.keys(attrValueMap).filter(n => !selectedAttrs[n]).join(" and ")} to continue
                  </span>
                </div>
              )}
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
              disabled={cartDisabled || (hasVariants && !allAttrsSelected)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all",
                cartDisabled || (hasVariants && !allAttrsSelected)
                  ? "bg-gray-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                  : added
                    ? "bg-green-500 text-white"
                    : mp
                      ? "bg-orange-500 hover:bg-orange-600 text-white active:scale-[0.98] shadow-lg shadow-orange-500/20"
                      : "bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98] shadow-lg shadow-blue-600/20"
              )}
            >
              {added ? <Check size={16} /> : <ShoppingCart size={16} />}
              {added
                ? "Added to Cart!"
                : cartDisabled
                  ? "Out of Stock"
                  : hasVariants && !allAttrsSelected
                    ? "Select Options"
                    : "Add to Cart"}
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
              className={cn(
                "w-12 h-12 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-center transition-all",
                mp
                  ? "text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-200 dark:hover:border-orange-800/50"
                  : "text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-800/50"
              )}
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
                <Icon size={16} className={cn("mb-1.5", mp ? "text-orange-500 dark:text-orange-400" : "text-blue-600 dark:text-blue-400")} />
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
            <Link
              href={`/category/${encodeURIComponent(product.category ?? "")}`}
              className={cn(
                "text-sm hover:underline flex items-center gap-1 font-medium",
                mp ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400"
              )}
            >
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
