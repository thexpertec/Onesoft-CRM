import { X, ShoppingCart, Minus, Plus, Trash2, ArrowRight, User } from "lucide-react";
import { Link } from "wouter";
import { useCart } from "@/lib/cart";
import { useStore } from "@/contexts/store-context";
import { formatPrice, getDisplayPrice, getEffectivePrice, isBogo, getLineTotal } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useCustomerSession } from "@/hooks/use-customer-session";

export function CartDrawer() {
  const { items, totalItems, removeItem, updateQty, clearCart, isOpen, closeCart } = useCart();
  const { tenantId, products } = useStore();
  const { isLoggedIn } = useCustomerSession();

  /* Merge cart product snapshots with the latest live product data so
     clubcardPrice (and any other new fields) are always fresh */
  const freshItems = items.map(i => {
    const live = products.find(p => p.id === i.product.id);
    return live ? { ...i, product: live } : i;
  });

  /* Recalculate using effective (clubcard/BOGO) prices */
  const effectiveTotal = freshItems.reduce(
    (s, i) => s + getLineTotal(i.product, isLoggedIn, i.quantity),
    0,
  );

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={closeCart}
      />

      {/* Drawer */}
      <div className={cn(
        "fixed top-0 right-0 h-full w-full max-w-sm z-[71] bg-white dark:bg-slate-900 shadow-2xl flex flex-col",
        "transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900 dark:text-white text-base">
              Cart <span className="text-slate-400 font-normal text-sm">({totalItems})</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded"
              >
                Clear all
              </button>
            )}
            <button
              onClick={closeCart}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <ShoppingCart size={28} className="text-slate-300 dark:text-slate-600" />
              </div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Your cart is empty</h3>
              <p className="text-sm text-slate-400 mb-6">Add some products to get started</p>
              <Link
                href="/shop"
                onClick={closeCart}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Browse Products
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            freshItems.map(item => {
              const variantId = item.selectedVariant?.id;
              const variantAttrs = item.selectedVariant
                ? Object.entries(item.selectedVariant.attributes)
                : [];
              const variantPrice = item.selectedVariant?.price && parseFloat(item.selectedVariant.price) > 0
                ? item.selectedVariant.price : null;
              return (
              <div key={`${item.product.id}::${variantId ?? ""}`} className="flex gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-gray-200 dark:hover:border-slate-700 transition-colors">
                {/* Image */}
                <div className="w-16 h-16 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                  {item.product.thumbnail ? (
                    <img src={item.product.thumbnail} alt={item.product.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <div className="w-8 h-8 text-slate-300 dark:text-slate-600">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="100%" height="100%">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <path d="M8 21h8M12 17v4" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2 leading-snug mb-0.5">
                    {item.product.name}
                  </p>

                  {/* Variant attribute chips */}
                  {variantAttrs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {variantAttrs.map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                          <span className="opacity-60">{k}:</span> {v}
                        </span>
                      ))}
                    </div>
                  )}

                  {(() => {
                    const baseEff = getEffectivePrice(item.product, isLoggedIn);
                    const eff = variantPrice ?? baseEff;
                    const disp = getDisplayPrice(item.product);
                    const saved = parseFloat(disp) - parseFloat(eff);
                    const bogoOn = isBogo(item.product, isLoggedIn);
                    const freeQty = bogoOn ? Math.floor(item.quantity / 2) : 0;
                    return (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={cn("text-sm font-bold", bogoOn ? "text-teal-600 dark:text-teal-400" : saved > 0.001 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400")}>
                          {formatPrice(eff)}
                        </p>
                        {saved > 0.001 && !bogoOn && (
                          <p className="text-xs text-slate-400 line-through">{formatPrice(disp)}</p>
                        )}
                        {bogoOn && freeQty > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
                            {freeQty} FREE
                          </span>
                        )}
                        {bogoOn && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                            B1G1
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Qty controls */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity - 1, variantId)}
                        className="px-2 py-1 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="px-2 py-1 text-xs font-semibold text-slate-900 dark:text-white min-w-[28px] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity + 1, variantId)}
                        className="px-2 py-1 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item.product.id, variantId)}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 dark:border-slate-800 px-5 py-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Subtotal ({totalItems} items)</span>
              <span className="font-bold text-slate-900 dark:text-white text-base">{formatPrice(effectiveTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Shipping</span>
              <span className="text-green-600 dark:text-green-400 font-medium">Calculated at checkout</span>
            </div>
            <Link
              href="/checkout"
              onClick={closeCart}
              className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              Proceed to Checkout
              <ArrowRight size={15} />
            </Link>
            <button
              onClick={closeCart}
              className="w-full py-2.5 border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl text-sm font-medium transition-colors"
            >
              Continue Shopping
            </button>

            {/* Sign-in / account prompt */}
            {tenantId && (
              isLoggedIn ? (
                <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-green-600 dark:text-green-400 border-t border-gray-100 dark:border-slate-800 pt-3 mt-1 font-medium">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  Clubcard prices applied
                </div>
              ) : (
                <a
                  href={`/customer-portal/?t=${encodeURIComponent(tenantId)}`}
                  className="flex items-center justify-center gap-2 w-full py-2 text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors border-t border-gray-100 dark:border-slate-800 pt-3 mt-1"
                >
                  <User size={13} />
                  Sign in for Clubcard prices
                </a>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}
