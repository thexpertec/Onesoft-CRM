import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(val: string | number | undefined, currency = "£"): string {
  const n = parseFloat(String(val ?? "0"));
  if (isNaN(n)) return `${currency}0.00`;
  return `${currency}${n.toFixed(2)}`;
}

/** Returns websitePrice when set and > 0, otherwise falls back to price. */
export function getDisplayPrice(product: { price: string; websitePrice?: string }): string {
  if (product.websitePrice && parseFloat(product.websitePrice) > 0) return product.websitePrice;
  return product.price || "0";
}

/**
 * Returns the effective price for a customer:
 * - If logged in and the product has a valid clubcardPrice lower than the display price, return clubcardPrice.
 * - Otherwise return getDisplayPrice.
 */
export function getEffectivePrice(
  product: { price: string; websitePrice?: string; clubcardPrice?: string },
  isLoggedIn: boolean,
): string {
  const base = getDisplayPrice(product);
  if (isLoggedIn && product.clubcardPrice) {
    const club = parseFloat(product.clubcardPrice);
    const disp = parseFloat(base);
    if (!isNaN(club) && club > 0 && club < disp) return product.clubcardPrice;
  }
  return base;
}

export function getStockQty(openingStock?: string): number {
  const n = parseFloat(openingStock ?? "0");
  return isNaN(n) ? 0 : Math.max(0, n);
}

export function stockLabel(qty: number, alertQty?: string): "in" | "low" | "out" {
  if (qty <= 0) return "out";
  const alert = parseFloat(alertQty ?? "5");
  if (!isNaN(alert) && qty <= alert) return "low";
  return "in";
}
