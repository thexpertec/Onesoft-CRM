import { useState, useCallback } from "react";

export type BarcodeLookupResult = {
  name: string;
  brand: string;
  category: string;
  description?: string;
};

type LookupState = {
  loading: boolean;
  found: boolean | null;
  result: BarcodeLookupResult | null;
  error: string | null;
};

export function useBarcodeLookup() {
  const [state, setState] = useState<LookupState>({
    loading: false, found: null, result: null, error: null,
  });

  const lookup = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    setState({ loading: true, found: null, result: null, error: null });
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) throw new Error("Network error");
      const data = await res.json() as {
        status: number;
        product?: {
          product_name?: string;
          product_name_en?: string;
          brands?: string;
          categories?: string;
          ingredients_text?: string;
        };
      };

      if (data.status === 1 && data.product) {
        const p = data.product;
        const name     = (p.product_name_en || p.product_name || "").trim();
        const brand    = (p.brands || "").split(",")[0].trim();
        const rawCat   = (p.categories || "").split(",").pop()?.trim() ?? "";
        const category = rawCat.replace(/^(en:|fr:|de:)/i, "").trim();
        const result: BarcodeLookupResult = { name, brand, category };
        if (p.ingredients_text) result.description = p.ingredients_text.slice(0, 200);
        setState({ loading: false, found: true, result, error: null });
        return result;
      } else {
        setState({ loading: false, found: false, result: null, error: null });
        return null;
      }
    } catch {
      setState({ loading: false, found: false, result: null, error: "Lookup failed" });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, found: null, result: null, error: null });
  }, []);

  return { ...state, lookup, reset };
}
