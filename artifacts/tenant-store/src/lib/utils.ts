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
