import type { Product } from "@/types/product";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiBase(): string {
  const host = window.location.host;
  const proto = window.location.protocol;
  return `${proto}//${host}${BASE.replace(/\/tenant-store.*/, "")}/api`;
}

export async function fetchProducts(tenantId?: string | null): Promise<Product[]> {
  const ns = tenantId ? encodeURIComponent(`t:${tenantId}`) : "global";
  const key = "admin-products";
  try {
    const res = await fetch(`${apiBase()}/kv/${ns}/${key}`);
    if (!res.ok) return [];
    const data = await res.json() as { value: Product[] };
    const arr = Array.isArray(data.value) ? data.value : [];
    // Show all products except those explicitly set to Inactive
    return arr.filter((p) => p.status !== "Inactive");
  } catch {
    return [];
  }
}

export async function fetchStoreConfig(tenantId?: string | null): Promise<Record<string, string>> {
  const ns = tenantId ? encodeURIComponent(`t:${tenantId}`) : "global";
  const key = "admin-settings";
  try {
    const res = await fetch(`${apiBase()}/kv/${ns}/${key}`);
    if (!res.ok) return {};
    const data = await res.json() as { value: Record<string, string> };
    return data.value ?? {};
  } catch {
    return {};
  }
}
