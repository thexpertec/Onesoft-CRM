import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Product } from "@/types/product";
import { fetchProducts, fetchStoreConfig } from "@/lib/api";

interface StoreContextType {
  products: Product[];
  loading: boolean;
  error: string | null;
  tenantId: string | null;
  storeName: string;
  categories: string[];
  refresh: () => void;
}

const StoreContext = createContext<StoreContextType>({
  products: [], loading: true, error: null,
  tenantId: null, storeName: "TechZone", categories: [],
  refresh: () => {},
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get("tenant") ?? null;

  const [products, setProducts] = useState<Product[]>([]);
  const [storeName, setStoreName] = useState("TechZone");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prods, cfg] = await Promise.all([
        fetchProducts(tenantId),
        fetchStoreConfig(tenantId),
      ]);
      setProducts(prods);
      if (cfg?.companyName) setStoreName(cfg.companyName as string);
    } catch {
      setError("Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const categories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort();

  return (
    <StoreContext.Provider value={{ products, loading, error, tenantId, storeName, categories, refresh: load }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() { return useContext(StoreContext); }
