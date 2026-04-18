import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Product } from "@/types/product";
import { fetchProducts, fetchStoreConfig, fetchStoreCms, CMS_DEFAULTS } from "@/lib/api";
import type { StoreCms } from "@/lib/api";

interface StoreContextType {
  products: Product[];
  loading: boolean;
  error: string | null;
  tenantId: string | null;
  storeName: string;
  categories: string[];
  cms: StoreCms;
  refresh: () => void;
}

const StoreContext = createContext<StoreContextType>({
  products: [], loading: true, error: null,
  tenantId: null, storeName: "TechZone", categories: [],
  cms: CMS_DEFAULTS,
  refresh: () => {},
});

// tenantId is now passed as a prop (extracted from the URL path by App.tsx)
export function StoreProvider({
  children,
  tenantId,
}: {
  children: React.ReactNode;
  tenantId: string | null;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [adminStoreName, setAdminStoreName] = useState("TechZone");
  const [cms, setCms] = useState<StoreCms>(CMS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prods, cfg, cmsData] = await Promise.all([
        fetchProducts(tenantId),
        fetchStoreConfig(tenantId),
        fetchStoreCms(),
      ]);
      setProducts(prods);
      if (cfg?.companyName) setAdminStoreName(cfg.companyName as string);
      setCms(cmsData);
    } catch {
      setError("Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const categories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort();

  // CMS brand.storeName overrides admin setting if set
  const storeName = (cms.brand.storeName?.trim()) || adminStoreName;

  // Apply favicon from CMS if provided
  useEffect(() => {
    const fav = cms.brand.faviconBase64;
    if (!fav) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = fav;
  }, [cms.brand.faviconBase64]);

  return (
    <StoreContext.Provider value={{ products, loading, error, tenantId, storeName, categories, cms, refresh: load }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() { return useContext(StoreContext); }
