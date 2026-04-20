import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Product, CartItem, ProductVariant } from "@/types/product";
import { getDisplayPrice } from "@/lib/utils";

function cartItemKey(productId: string, variantId?: string): string {
  return `${productId}::${variantId ?? ""}`;
}

function getItemPrice(item: CartItem): number {
  if (item.selectedVariant?.price && parseFloat(item.selectedVariant.price) > 0) {
    return parseFloat(item.selectedVariant.price);
  }
  return parseFloat(getDisplayPrice(item.product)) || 0;
}

interface CartContextType {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  addItem: (product: Product, qty?: number, variant?: ProductVariant) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQty: (productId: string, qty: number, variantId?: string) => void;
  clearCart: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextType>({
  items: [], totalItems: 0, totalPrice: 0,
  addItem: () => {}, removeItem: () => {}, updateQty: () => {}, clearCart: () => {},
  isOpen: false, openCart: () => {}, closeCart: () => {},
});

const CART_KEY = "onesoft-store-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch { return []; }
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  const addItem = useCallback((product: Product, qty = 1, variant?: ProductVariant) => {
    setItems(prev => {
      const key = cartItemKey(product.id, variant?.id);
      const existing = prev.find(i => cartItemKey(i.product.id, i.selectedVariant?.id) === key);
      if (existing) {
        return prev.map(i =>
          cartItemKey(i.product.id, i.selectedVariant?.id) === key
            ? { ...i, quantity: i.quantity + qty }
            : i
        );
      }
      return [...prev, { product, quantity: qty, selectedVariant: variant }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((productId: string, variantId?: string) => {
    const key = cartItemKey(productId, variantId);
    setItems(prev => prev.filter(i => cartItemKey(i.product.id, i.selectedVariant?.id) !== key));
  }, []);

  const updateQty = useCallback((productId: string, qty: number, variantId?: string) => {
    if (qty <= 0) { removeItem(productId, variantId); return; }
    const key = cartItemKey(productId, variantId);
    setItems(prev => prev.map(i =>
      cartItemKey(i.product.id, i.selectedVariant?.id) === key ? { ...i, quantity: qty } : i
    ));
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, totalItems, totalPrice,
      addItem, removeItem, updateQty, clearCart,
      isOpen, openCart: () => setIsOpen(true), closeCart: () => setIsOpen(false),
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() { return useContext(CartContext); }
