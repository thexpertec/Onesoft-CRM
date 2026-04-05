import { getSettings } from "@/lib/store";

export const CURRENCIES = [
  { code: "GBP", symbol: "£",   label: "GBP — British Pound (£)" },
  { code: "USD", symbol: "$",   label: "USD — US Dollar ($)" },
  { code: "EUR", symbol: "€",   label: "EUR — Euro (€)" },
  { code: "PKR", symbol: "₨",   label: "PKR — Pakistani Rupee (₨)" },
  { code: "AED", symbol: "د.إ", label: "AED — UAE Dirham" },
  { code: "SAR", symbol: "SR",  label: "SAR — Saudi Riyal (SR)" },
  { code: "INR", symbol: "₹",   label: "INR — Indian Rupee (₹)" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function getCurrency(code?: string) {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];
}

export function formatAmount(n: number, currencyCode: string = "GBP"): string {
  if (n === 0) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    const sym = getCurrency(currencyCode).symbol;
    return `${sym}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function formatCurrencyString(str?: string, currencyCode: string = "GBP"): string | null {
  if (!str || str.trim() === "") return null;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return str;
  return formatAmount(n, currencyCode);
}

export function getSettingsCurrencyCode(): string {
  try { return getSettings().currency || "GBP"; }
  catch { return "GBP"; }
}

export function getSettingsCurrencySymbol(): string {
  return getCurrency(getSettingsCurrencyCode()).symbol;
}

export function fmtMoney(n: number): string {
  return formatAmount(n, getSettingsCurrencyCode());
}

export function fmtMoneyCompact(n: number): string {
  const sym = getSettingsCurrencySymbol();
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${sym}${(n / 1_000).toFixed(1)}k`;
  return `${sym}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
