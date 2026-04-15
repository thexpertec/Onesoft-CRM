import type { Product } from "@/types/product";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiBase(): string {
  const host = window.location.host;
  const proto = window.location.protocol;
  return `${proto}//${host}${BASE.replace(/\/tenant-store.*/, "")}/api`;
}

export type StoreCmsTrustBadge = { icon: string; title: string; desc: string };
export type StoreCms = {
  hero: {
    badge: string; headline1: string; headline2: string; subtitle: string;
    btn1Text: string; btn2Text: string;
    stat1Value: string; stat1Label: string;
    stat2Value: string; stat2Label: string;
    stat3Value: string; stat3Label: string;
  };
  promoBanner: { enabled: boolean; label: string; headline: string; subtitle: string; btnText: string };
  trustBadges: StoreCmsTrustBadge[];
  featuredSection: { title: string; subtitle: string };
  newArrivalsSection: { title: string; subtitle: string };
  seo: { title: string; description: string; keywords: string };
};

export const CMS_DEFAULTS: StoreCms = {
  hero: {
    badge: "New Arrivals Every Week",
    headline1: "Premium Tech,", headline2: "Delivered Fast",
    subtitle: "Discover the latest smartphones, laptops, audio gear, and accessories. Handpicked for quality, priced for value.",
    btn1Text: "Shop All Products", btn2Text: "New Arrivals",
    stat1Value: "500+", stat1Label: "Products",
    stat2Value: "Free",  stat2Label: "UK Delivery",
    stat3Value: "24/7",  stat3Label: "Support",
  },
  promoBanner: {
    enabled: true, label: "Limited Time Offer",
    headline: "Free Delivery on All Orders Today",
    subtitle: "No minimum spend. Available across the UK & internationally.",
    btnText: "Shop Now",
  },
  trustBadges: [
    { icon: "Truck",          title: "Free UK Delivery", desc: "On all orders, every day" },
    { icon: "ShieldCheck",    title: "2-Year Warranty",  desc: "All products covered"      },
    { icon: "RotateCcw",      title: "30-Day Returns",   desc: "Hassle-free returns"       },
    { icon: "HeadphonesIcon", title: "24/7 Support",     desc: "Always here to help"       },
  ],
  featuredSection:    { title: "Featured Products", subtitle: "Handpicked for quality and value" },
  newArrivalsSection: { title: "New Arrivals",      subtitle: "Just landed in our store"        },
  seo: { title: "Onesoft Tech Store", description: "Premium tech products delivered fast across the UK.", keywords: "tech, smartphones, laptops, accessories" },
};

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

export async function fetchStoreCms(): Promise<StoreCms> {
  try {
    const res = await fetch(`${apiBase()}/kv/global/website-cms`);
    if (!res.ok) return CMS_DEFAULTS;
    const data = await res.json() as { value?: StoreCms };
    if (!data.value) return CMS_DEFAULTS;
    return {
      ...CMS_DEFAULTS,
      ...data.value,
      hero:               { ...CMS_DEFAULTS.hero,               ...(data.value.hero ?? {}) },
      promoBanner:        { ...CMS_DEFAULTS.promoBanner,        ...(data.value.promoBanner ?? {}) },
      trustBadges:        data.value.trustBadges ?? CMS_DEFAULTS.trustBadges,
      featuredSection:    { ...CMS_DEFAULTS.featuredSection,    ...(data.value.featuredSection ?? {}) },
      newArrivalsSection: { ...CMS_DEFAULTS.newArrivalsSection, ...(data.value.newArrivalsSection ?? {}) },
      seo:                { ...CMS_DEFAULTS.seo,                ...(data.value.seo ?? {}) },
    };
  } catch {
    return CMS_DEFAULTS;
  }
}
