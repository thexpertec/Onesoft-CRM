import type { Product } from "@/types/product";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiBase(): string {
  const host = window.location.host;
  const proto = window.location.protocol;
  return `${proto}//${host}${BASE.replace(/\/tenant-store.*/, "")}/api`;
}

// ─── CMS Types ────────────────────────────────────────────────────────────────
export type StoreCmsTrustBadge = { icon: string; title: string; desc: string };

export type HeroSlide = {
  badge: string;
  headline1: string;
  headline2: string;
  subtitle: string;
  btn1Text: string;
  btn1Url: string;
  btn2Text: string;
  btn2Url: string;
};

export type StoreCms = {
  brand: {
    logoUrl: string;
    logoBase64?: string;
    faviconBase64?: string;
    storeName: string;
    tagline: string;
    description: string;
  };
  contact: {
    address: string;
    phone: string;
    email: string;
  };
  social: {
    twitter: string;
    instagram: string;
    facebook: string;
    youtube: string;
    linkedin: string;
    tiktok: string;
  };
  header: {
    announcementEnabled: boolean;
    announcementText: string;
    announcementLink: string;
    announcementBg: "blue" | "emerald" | "amber" | "red" | "purple" | "slate";
  };
  breadcrumbs: {
    enabled: boolean;
    separator: string;
  };
  hero: {
    badge: string; headline1: string; headline2: string; subtitle: string;
    btn1Text: string; btn2Text: string;
    stat1Value: string; stat1Label: string;
    stat2Value: string; stat2Label: string;
    stat3Value: string; stat3Label: string;
  };
  heroSlides: HeroSlide[];
  promoBanner: {
    enabled: boolean; label: string; headline: string; subtitle: string; btnText: string;
  };
  trustBadges: StoreCmsTrustBadge[];
  featuredSection:    { title: string; subtitle: string };
  newArrivalsSection: { title: string; subtitle: string };
  seo: { title: string; description: string; keywords: string };
  shop: { showStockBadge: boolean; allowBackorder: boolean };
};

export const CMS_DEFAULTS: StoreCms = {
  brand: {
    logoUrl: "",
    storeName: "",
    tagline: "Premium Tech, Delivered Fast",
    description: "Your one-stop destination for the latest in technology. Premium products, competitive prices, fast delivery.",
  },
  contact: {
    address: "Hull, United Kingdom & Islamabad, Pakistan",
    phone: "+44 1234 567890",
    email: "hello@onesoft.com",
  },
  social: { twitter: "", instagram: "", facebook: "", youtube: "", linkedin: "", tiktok: "" },
  header: {
    announcementEnabled: false,
    announcementText: "Free delivery on all orders this week!",
    announcementLink: "/shop",
    announcementBg: "blue",
  },
  breadcrumbs: { enabled: true, separator: "/" },
  hero: {
    badge: "New Arrivals Every Week",
    headline1: "Premium Tech,", headline2: "Delivered Fast",
    subtitle: "Discover the latest smartphones, laptops, audio gear, and accessories. Handpicked for quality, priced for value.",
    btn1Text: "Shop All Products", btn2Text: "New Arrivals",
    stat1Value: "500+", stat1Label: "Products",
    stat2Value: "Free",  stat2Label: "UK Delivery",
    stat3Value: "24/7",  stat3Label: "Support",
  },
  heroSlides: [
    {
      badge: "New Arrivals Every Week",
      headline1: "Premium Tech,", headline2: "Delivered Fast",
      subtitle: "Discover the latest smartphones, laptops, audio gear, and accessories. Handpicked for quality, priced for value.",
      btn1Text: "Shop All Products", btn1Url: "/shop",
      btn2Text: "New Arrivals",      btn2Url: "/shop?sort=newest",
    },
    {
      badge: "Professional Repair Service",
      headline1: "We keep your tech", headline2: "running perfectly",
      subtitle: "From device repairs to network setup — trusted by hundreds of customers across Hull, the UK, and Pakistan.",
      btn1Text: "Book a Repair", btn1Url: "/services",
      btn2Text: "Browse Products", btn2Url: "/shop",
    },
    {
      badge: "Best Prices Guaranteed",
      headline1: "Unbeatable Deals,", headline2: "Every Single Day",
      subtitle: "Top brands at the lowest prices. Free UK delivery on all orders with no minimum spend required.",
      btn1Text: "View Deals", btn1Url: "/shop",
      btn2Text: "Learn More",   btn2Url: "/about",
    },
  ],
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
  shop: { showStockBadge: true, allowBackorder: false },
};

// ─── API helpers ──────────────────────────────────────────────────────────────
export async function fetchProducts(tenantId?: string | null): Promise<Product[]> {
  const ns = tenantId ? encodeURIComponent(`t:${tenantId}`) : "global";
  const key = "admin-products";
  try {
    const res = await fetch(`${apiBase()}/kv/${ns}/${key}`);
    if (!res.ok) return [];
    const data = await res.json() as { value: Product[] };
    const arr = Array.isArray(data.value) ? data.value : [];
    return arr.filter((p) => p.status !== "Inactive" && p.showOnWeb !== false);
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
    const data = await res.json() as { value?: Partial<StoreCms> };
    if (!data.value) return CMS_DEFAULTS;
    const v = data.value;
    return {
      ...CMS_DEFAULTS, ...v,
      brand:              { ...CMS_DEFAULTS.brand,              ...(v.brand ?? {}) },
      contact:            { ...CMS_DEFAULTS.contact,            ...(v.contact ?? {}) },
      social:             { ...CMS_DEFAULTS.social,             ...(v.social ?? {}) },
      header:             { ...CMS_DEFAULTS.header,             ...(v.header ?? {}) },
      breadcrumbs:        { ...CMS_DEFAULTS.breadcrumbs,        ...(v.breadcrumbs ?? {}) },
      hero:               { ...CMS_DEFAULTS.hero,               ...(v.hero ?? {}) },
      heroSlides:         v.heroSlides ?? CMS_DEFAULTS.heroSlides,
      promoBanner:        { ...CMS_DEFAULTS.promoBanner,        ...(v.promoBanner ?? {}) },
      trustBadges:        v.trustBadges ?? CMS_DEFAULTS.trustBadges,
      featuredSection:    { ...CMS_DEFAULTS.featuredSection,    ...(v.featuredSection ?? {}) },
      newArrivalsSection: { ...CMS_DEFAULTS.newArrivalsSection, ...(v.newArrivalsSection ?? {}) },
      seo:                { ...CMS_DEFAULTS.seo,                ...(v.seo ?? {}) },
      shop:               { ...CMS_DEFAULTS.shop,               ...(v.shop ?? {}) },
    };
  } catch {
    return CMS_DEFAULTS;
  }
}
