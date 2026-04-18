import { useState, useEffect, useRef } from "react";
import {
  Globe, Save, RotateCcw, Eye, ExternalLink, Info, ChevronDown, ChevronUp,
  Image as ImageIcon, Phone, Share2, LayoutTemplate, Navigation,
  Star, Megaphone, Plus, Trash2, Layers, ShoppingBag, Upload, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

// ─── Types ────────────────────────────────────────────────────────────────────
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
    logoBase64: "",
    faviconBase64: "",
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

// ─── KV helpers ───────────────────────────────────────────────────────────────
const CMS_KEY = "website-cms";
const API_BASE = "/api/kv/global";

function mergeCms(saved: Partial<StoreCms>): StoreCms {
  return {
    ...CMS_DEFAULTS, ...saved,
    brand:              { ...CMS_DEFAULTS.brand,              ...(saved.brand ?? {}) },
    contact:            { ...CMS_DEFAULTS.contact,            ...(saved.contact ?? {}) },
    social:             { ...CMS_DEFAULTS.social,             ...(saved.social ?? {}) },
    header:             { ...CMS_DEFAULTS.header,             ...(saved.header ?? {}) },
    breadcrumbs:        { ...CMS_DEFAULTS.breadcrumbs,        ...(saved.breadcrumbs ?? {}) },
    hero:               { ...CMS_DEFAULTS.hero,               ...(saved.hero ?? {}) },
    heroSlides:         saved.heroSlides ?? CMS_DEFAULTS.heroSlides,
    promoBanner:        { ...CMS_DEFAULTS.promoBanner,        ...(saved.promoBanner ?? {}) },
    trustBadges:        saved.trustBadges ?? CMS_DEFAULTS.trustBadges,
    featuredSection:    { ...CMS_DEFAULTS.featuredSection,    ...(saved.featuredSection ?? {}) },
    newArrivalsSection: { ...CMS_DEFAULTS.newArrivalsSection, ...(saved.newArrivalsSection ?? {}) },
    seo:                { ...CMS_DEFAULTS.seo,                ...(saved.seo ?? {}) },
    shop:               { ...CMS_DEFAULTS.shop,               ...(saved.shop ?? {}) },
  };
}

async function loadCms(): Promise<StoreCms> {
  try {
    const r = await fetch(`${API_BASE}/${CMS_KEY}`);
    if (!r.ok) return CMS_DEFAULTS;
    const d = await r.json() as { value?: Partial<StoreCms> };
    if (!d.value) return CMS_DEFAULTS;
    return mergeCms(d.value);
  } catch { return CMS_DEFAULTS; }
}

async function saveCms(cms: StoreCms): Promise<void> {
  const r = await fetch(`${API_BASE}/${CMS_KEY}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: cms }),
  });
  if (!r.ok) throw new Error("Failed to save CMS");
}

// ─── Reusable sub-components ──────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-blue-600 dark:text-blue-400">{icon}</span>
          <span className="text-[14px] font-semibold text-gray-800 dark:text-gray-100">{title}</span>
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-100 dark:border-zinc-800 pt-4">{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 dark:text-zinc-500 -mt-1">{hint}</p>}
      {children}
    </div>
  );
}

const inp = "w-full px-3 py-2 text-[13px] border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition placeholder:text-gray-300 dark:placeholder:text-zinc-600";

const ANNOUNCEMENT_COLORS: { value: StoreCms["header"]["announcementBg"]; label: string; cls: string }[] = [
  { value: "blue",    label: "Blue",    cls: "bg-blue-600"   },
  { value: "emerald", label: "Green",   cls: "bg-emerald-600"},
  { value: "amber",   label: "Amber",   cls: "bg-amber-500"  },
  { value: "red",     label: "Red",     cls: "bg-red-600"    },
  { value: "purple",  label: "Purple",  cls: "bg-purple-600" },
  { value: "slate",   label: "Dark",    cls: "bg-slate-800"  },
];

// ─── Brand & Identity section with upload ─────────────────────────────────────
function BrandSection({
  cms, patch, inp,
}: {
  cms: StoreCms;
  patch: <K extends keyof StoreCms>(section: K, updates: Partial<StoreCms[K]>) => void;
  inp: string;
}) {
  const logoInputRef    = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File, onDone: (b64: string) => void) => {
    const reader = new FileReader();
    reader.onload = e => { if (e.target?.result) onDone(e.target.result as string); };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file, b64 => patch("brand", { logoBase64: b64, logoUrl: "" }));
    e.target.value = "";
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file, b64 => patch("brand", { faviconBase64: b64 }));
    e.target.value = "";
  };

  const logoSrc = cms.brand.logoBase64 || cms.brand.logoUrl || "";

  return (
    <Section title="Brand & Identity" icon={<ImageIcon size={16} />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Logo upload */}
        <div className="flex flex-col gap-2">
          <label className="text-[12px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Website Logo
          </label>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 -mt-1">
            Upload a PNG/SVG/JPEG for the store header and footer.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            >
              <Upload size={13} /> Upload Logo
            </button>
            {logoSrc && (
              <button
                type="button"
                onClick={() => patch("brand", { logoBase64: "", logoUrl: "" })}
                className="flex items-center gap-1 px-2.5 py-2 text-[12px] rounded-lg border border-red-200 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Remove logo"
              >
                <X size={12} /> Remove
              </button>
            )}
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          {/* URL fallback (only shown when no upload) */}
          {!cms.brand.logoBase64 && (
            <input
              className={inp}
              value={cms.brand.logoUrl}
              onChange={e => patch("brand", { logoUrl: e.target.value })}
              placeholder="…or paste image URL (https://…)"
            />
          )}
          {/* Preview */}
          {logoSrc && (
            <div className="p-3 bg-gray-900 rounded-xl border border-gray-200 dark:border-zinc-700 flex items-center gap-3 mt-1">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Preview</span>
              <img src={logoSrc} alt="Logo" className="h-9 object-contain max-w-[160px]"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
        </div>

        {/* Favicon upload */}
        <div className="flex flex-col gap-2">
          <label className="text-[12px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Favicon
          </label>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 -mt-1">
            ICO, PNG or SVG — shown in the browser tab. Ideally 32×32 or 64×64 px.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => faviconInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            >
              <Upload size={13} /> Upload Favicon
            </button>
            {cms.brand.faviconBase64 && (
              <button
                type="button"
                onClick={() => patch("brand", { faviconBase64: "" })}
                className="flex items-center gap-1 px-2.5 py-2 text-[12px] rounded-lg border border-red-200 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Remove favicon"
              >
                <X size={12} /> Remove
              </button>
            )}
          </div>
          <input ref={faviconInputRef} type="file" accept="image/*,.ico" className="hidden" onChange={handleFaviconUpload} />
          {/* Preview */}
          {cms.brand.faviconBase64 ? (
            <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-gray-100 dark:border-zinc-700 flex items-center gap-3 mt-1">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Preview</span>
              <img src={cms.brand.faviconBase64} alt="Favicon" className="h-8 w-8 object-contain rounded"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-[11px] text-gray-500 dark:text-zinc-400">Favicon uploaded ✓</span>
            </div>
          ) : (
            <div className="mt-1 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-dashed border-gray-200 dark:border-zinc-700 text-[11px] text-gray-400 dark:text-zinc-500">
              No favicon uploaded — browser will use default.
            </div>
          )}
        </div>

        {/* Store Name */}
        <Field label="Store Name Override" hint="Overrides the name from admin settings. Leave blank to use admin setting.">
          <input className={inp} value={cms.brand.storeName} onChange={e => patch("brand", { storeName: e.target.value })} placeholder="TechZone" />
        </Field>

        {/* Tagline */}
        <Field label="Tagline" hint="Short line shown beside/below the logo in the footer">
          <input className={inp} value={cms.brand.tagline} onChange={e => patch("brand", { tagline: e.target.value })} placeholder="Premium Tech, Delivered Fast" />
        </Field>

        {/* Footer Description — spans full width */}
        <div className="md:col-span-2">
          <Field label="Footer Description" hint="Paragraph shown under logo in the footer">
            <textarea className={inp + " resize-none h-20"} value={cms.brand.description} onChange={e => patch("brand", { description: e.target.value })} />
          </Field>
        </div>

      </div>
    </Section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WebsiteCmsPage() {
  const { toast } = useToast();
  const { currentTenantId } = useAuth();
  const [cms, setCms] = useState<StoreCms>(CMS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadCms().then(d => { setCms(d); setLoading(false); });
  }, []);

  function patch<K extends keyof StoreCms>(section: K, updates: Partial<StoreCms[K]>) {
    setCms(prev => ({ ...prev, [section]: { ...(prev[section] as object), ...(updates as object) } }));
    setDirty(true);
  }

  function patchBadge(i: number, field: keyof StoreCmsTrustBadge, val: string) {
    setCms(prev => {
      const badges = prev.trustBadges.map((b, idx) => idx === i ? { ...b, [field]: val } : b);
      return { ...prev, trustBadges: badges };
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveCms(cms);
      setDirty(false);
      toast({ title: "CMS saved", description: "Store content has been updated." });
    } catch {
      toast({ title: "Save failed", description: "Could not save CMS content.", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleReset() {
    setCms(CMS_DEFAULTS);
    setDirty(true);
    toast({ title: "Reset to defaults", description: "Save to apply the defaults to your store." });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center space-y-2">
          <Globe size={32} className="mx-auto opacity-30 animate-pulse" />
          <p className="text-sm">Loading CMS…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Globe size={22} className="text-blue-600" />
            Website CMS
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Control content displayed on your tenant store</p>
        </div>
        <div className="flex items-center gap-2">
          {currentTenantId ? (
            <a
              href={`/tenant-store/${encodeURIComponent(currentTenantId)}/home`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors border border-gray-200 dark:border-zinc-700"
              title={`Open store: /tenant-store/${currentTenantId}/home`}
            >
              <Eye size={13} />
              Preview Tenant Store
              <ExternalLink size={11} />
            </a>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 cursor-not-allowed opacity-60"
              title="Log in as a specific tenant to preview their store"
            >
              <Eye size={13} />
              Preview Store
              <ExternalLink size={11} />
            </span>
          )}
          <button onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors border border-gray-200 dark:border-zinc-700">
            <RotateCcw size={13} /> Reset
          </button>
          <button onClick={handleSave} disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
            <Save size={13} /> {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {dirty && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-[12px] text-amber-700 dark:text-amber-400 font-medium">
          <Info size={13} />
          You have unsaved changes — click Save Changes to publish to the store.
        </div>
      )}

      {/* ── BRAND & IDENTITY ─────────────────────────────────────────────── */}
      <BrandSection cms={cms} patch={patch} inp={inp} />

      {/* ── CONTACT INFO ─────────────────────────────────────────────────── */}
      <Section title="Contact Information" icon={<Phone size={16} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Address" hint="Shown in footer and contact page">
            <textarea className={inp + " resize-none h-16"} value={cms.contact.address} onChange={e => patch("contact", { address: e.target.value })} placeholder="Hull, United Kingdom & Islamabad, Pakistan" />
          </Field>
          <div className="space-y-4">
            <Field label="Phone Number">
              <input className={inp} value={cms.contact.phone} onChange={e => patch("contact", { phone: e.target.value })} placeholder="+44 1234 567890" />
            </Field>
            <Field label="Email Address">
              <input className={inp} value={cms.contact.email} onChange={e => patch("contact", { email: e.target.value })} placeholder="hello@onesoft.com" type="email" />
            </Field>
          </div>
        </div>
      </Section>

      {/* ── SOCIAL LINKS ─────────────────────────────────────────────────── */}
      <Section title="Social Media Links" icon={<Share2 size={16} />}>
        <p className="text-[12px] text-gray-400 dark:text-zinc-500 mb-4">Enter full URLs (e.g. https://twitter.com/yourhandle). Leave blank to hide the icon.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {(["twitter", "instagram", "facebook", "youtube", "linkedin", "tiktok"] as const).map(network => (
            <Field key={network} label={network.charAt(0).toUpperCase() + network.slice(1)}>
              <input className={inp} value={cms.social[network]} onChange={e => patch("social", { [network]: e.target.value } as Partial<StoreCms["social"]>)} placeholder={`https://${network}.com/…`} />
            </Field>
          ))}
        </div>
      </Section>

      {/* ── HEADER / ANNOUNCEMENT BAR ────────────────────────────────────── */}
      <Section title="Header & Announcement Bar" icon={<Megaphone size={16} />}>
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cms.header.announcementEnabled}
              onChange={e => patch("header", { announcementEnabled: e.target.checked })}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Show announcement bar at top of store</span>
          </label>
        </div>
        <div className={`space-y-4 ${!cms.header.announcementEnabled ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Announcement Text">
              <input className={inp} value={cms.header.announcementText} onChange={e => patch("header", { announcementText: e.target.value })} placeholder="Free delivery on all orders this week!" />
            </Field>
            <Field label="Link URL" hint="Optional — clicking the bar navigates here">
              <input className={inp} value={cms.header.announcementLink} onChange={e => patch("header", { announcementLink: e.target.value })} placeholder="/shop" />
            </Field>
          </div>
          <Field label="Background Colour">
            <div className="flex items-center gap-2 flex-wrap">
              {ANNOUNCEMENT_COLORS.map(c => (
                <button key={c.value} onClick={() => patch("header", { announcementBg: c.value })}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all border-2 ${c.cls} ${cms.header.announcementBg === c.value ? "border-gray-800 dark:border-white scale-105" : "border-transparent opacity-70 hover:opacity-100"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* ── BREADCRUMBS ──────────────────────────────────────────────────── */}
      <Section title="Breadcrumbs" icon={<Navigation size={16} />}>
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cms.breadcrumbs.enabled}
              onChange={e => patch("breadcrumbs", { enabled: e.target.checked })}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Show breadcrumbs on product & category pages</span>
          </label>
        </div>
        <div className={`${!cms.breadcrumbs.enabled ? "opacity-40 pointer-events-none" : ""}`}>
          <Field label="Separator" hint="Character shown between breadcrumb items">
            <div className="flex items-center gap-2">
              {["/", ">", "→", "·", "\\"].map(sep => (
                <button key={sep} onClick={() => patch("breadcrumbs", { separator: sep })}
                  className={`w-10 h-9 rounded-lg text-[15px] font-bold border-2 transition-all ${cms.breadcrumbs.separator === sep ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" : "border-gray-200 dark:border-zinc-700 text-gray-500 hover:border-gray-400"}`}>
                  {sep}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <Section title="Hero Section" icon={<LayoutTemplate size={16} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Badge Text" hint="Small pill above the headline">
            <input className={inp} value={cms.hero.badge} onChange={e => patch("hero", { badge: e.target.value })} placeholder="New Arrivals Every Week" />
          </Field>
          <Field label="Headline Line 1">
            <input className={inp} value={cms.hero.headline1} onChange={e => patch("hero", { headline1: e.target.value })} placeholder="Premium Tech," />
          </Field>
          <Field label="Headline Line 2 (gradient)" hint="Rendered in blue gradient">
            <input className={inp} value={cms.hero.headline2} onChange={e => patch("hero", { headline2: e.target.value })} placeholder="Delivered Fast" />
          </Field>
          <Field label="Subtitle">
            <textarea className={inp + " resize-none h-20"} value={cms.hero.subtitle} onChange={e => patch("hero", { subtitle: e.target.value })} />
          </Field>
          <Field label="Primary Button Text">
            <input className={inp} value={cms.hero.btn1Text} onChange={e => patch("hero", { btn1Text: e.target.value })} placeholder="Shop All Products" />
          </Field>
          <Field label="Secondary Button Text">
            <input className={inp} value={cms.hero.btn2Text} onChange={e => patch("hero", { btn2Text: e.target.value })} placeholder="New Arrivals" />
          </Field>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
          <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Hero Stats (3 badges)</p>
          <div className="grid grid-cols-3 gap-3">
            {([ ["stat1Value", "stat1Label"], ["stat2Value", "stat2Label"], ["stat3Value", "stat3Label"] ] as const).map(([vk, lk], i) => (
              <div key={i} className="space-y-2 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-gray-100 dark:border-zinc-700">
                <Field label={`Stat ${i + 1} Value`}>
                  <input className={inp} value={(cms.hero as Record<string, string>)[vk]} onChange={e => patch("hero", { [vk]: e.target.value } as Partial<StoreCms["hero"]>)} placeholder="500+" />
                </Field>
                <Field label="Label">
                  <input className={inp} value={(cms.hero as Record<string, string>)[lk]} onChange={e => patch("hero", { [lk]: e.target.value } as Partial<StoreCms["hero"]>)} placeholder="Products" />
                </Field>
              </div>
            ))}
          </div>
        </div>

        {/* ── Hero Slider Slides ─────────────────────────────────────────── */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-indigo-500" />
              <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Hero Slider Slides ({cms.heroSlides.length})
              </p>
            </div>
            <button
              onClick={() => setCms(prev => ({
                ...prev,
                heroSlides: [...prev.heroSlides, {
                  badge: "New Slide", headline1: "Headline", headline2: "Line Two",
                  subtitle: "Subtitle text here.", btn1Text: "Shop Now", btn1Url: "/shop",
                  btn2Text: "Learn More", btn2Url: "/about",
                }],
              }))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-lg text-[12px] font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
            >
              <Plus size={13} /> Add Slide
            </button>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 mb-4">
            These slides cycle automatically every 5.5 s on the storefront hero. The stats row (above) is shared across all slides.
          </p>
          <div className="space-y-4">
            {cms.heroSlides.map((slide, i) => (
              <div key={i} className="p-4 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-600/15 border border-indigo-600/30 flex items-center justify-center text-[10px]">{i + 1}</span>
                    Slide {i + 1}
                  </span>
                  {cms.heroSlides.length > 1 && (
                    <button
                      onClick={() => setCms(prev => ({ ...prev, heroSlides: prev.heroSlides.filter((_, j) => j !== i) }))}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                      title="Remove slide"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Badge">
                    <input className={inp} value={slide.badge}
                      onChange={e => setCms(prev => { const s = [...prev.heroSlides]; s[i] = { ...s[i], badge: e.target.value }; return { ...prev, heroSlides: s }; })}
                      placeholder="New Arrivals Every Week" />
                  </Field>
                  <Field label="Headline Line 1">
                    <input className={inp} value={slide.headline1}
                      onChange={e => setCms(prev => { const s = [...prev.heroSlides]; s[i] = { ...s[i], headline1: e.target.value }; return { ...prev, heroSlides: s }; })}
                      placeholder="Premium Tech," />
                  </Field>
                  <Field label="Headline Line 2 (gradient)">
                    <input className={inp} value={slide.headline2}
                      onChange={e => setCms(prev => { const s = [...prev.heroSlides]; s[i] = { ...s[i], headline2: e.target.value }; return { ...prev, heroSlides: s }; })}
                      placeholder="Delivered Fast" />
                  </Field>
                  <Field label="Subtitle">
                    <input className={inp} value={slide.subtitle}
                      onChange={e => setCms(prev => { const s = [...prev.heroSlides]; s[i] = { ...s[i], subtitle: e.target.value }; return { ...prev, heroSlides: s }; })}
                      placeholder="Short description…" />
                  </Field>
                  <Field label="Button 1 Text">
                    <input className={inp} value={slide.btn1Text}
                      onChange={e => setCms(prev => { const s = [...prev.heroSlides]; s[i] = { ...s[i], btn1Text: e.target.value }; return { ...prev, heroSlides: s }; })}
                      placeholder="Shop All Products" />
                  </Field>
                  <Field label="Button 1 URL">
                    <input className={inp} value={slide.btn1Url}
                      onChange={e => setCms(prev => { const s = [...prev.heroSlides]; s[i] = { ...s[i], btn1Url: e.target.value }; return { ...prev, heroSlides: s }; })}
                      placeholder="/shop" />
                  </Field>
                  <Field label="Button 2 Text">
                    <input className={inp} value={slide.btn2Text}
                      onChange={e => setCms(prev => { const s = [...prev.heroSlides]; s[i] = { ...s[i], btn2Text: e.target.value }; return { ...prev, heroSlides: s }; })}
                      placeholder="New Arrivals" />
                  </Field>
                  <Field label="Button 2 URL">
                    <input className={inp} value={slide.btn2Url}
                      onChange={e => setCms(prev => { const s = [...prev.heroSlides]; s[i] = { ...s[i], btn2Url: e.target.value }; return { ...prev, heroSlides: s }; })}
                      placeholder="/shop?sort=newest" />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── PROMO BANNER ─────────────────────────────────────────────────── */}
      <Section title="Promo Banner" icon={<Star size={16} />}>
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cms.promoBanner.enabled}
              onChange={e => patch("promoBanner", { enabled: e.target.checked })}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Show promo banner on homepage</span>
          </label>
        </div>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!cms.promoBanner.enabled ? "opacity-40 pointer-events-none" : ""}`}>
          <Field label="Label" hint="Small uppercase text above headline">
            <input className={inp} value={cms.promoBanner.label} onChange={e => patch("promoBanner", { label: e.target.value })} placeholder="Limited Time Offer" />
          </Field>
          <Field label="Button Text">
            <input className={inp} value={cms.promoBanner.btnText} onChange={e => patch("promoBanner", { btnText: e.target.value })} placeholder="Shop Now" />
          </Field>
          <Field label="Headline">
            <input className={inp} value={cms.promoBanner.headline} onChange={e => patch("promoBanner", { headline: e.target.value })} placeholder="Free Delivery on All Orders Today" />
          </Field>
          <Field label="Subtitle">
            <input className={inp} value={cms.promoBanner.subtitle} onChange={e => patch("promoBanner", { subtitle: e.target.value })} placeholder="No minimum spend..." />
          </Field>
        </div>
      </Section>

      {/* ── TRUST BADGES ─────────────────────────────────────────────────── */}
      <Section title="Trust Badges" icon={<Globe size={16} />}>
        <p className="text-[12px] text-gray-400 dark:text-zinc-500 mb-3">
          Icon names: Truck · ShieldCheck · RotateCcw · HeadphonesIcon · Zap · Star · Heart · Package · Globe
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cms.trustBadges.map((badge, i) => (
            <div key={i} className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-gray-100 dark:border-zinc-700 space-y-2">
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Badge {i + 1}</p>
              <Field label="Icon">
                <input className={inp} value={badge.icon} onChange={e => patchBadge(i, "icon", e.target.value)} placeholder="Truck" />
              </Field>
              <Field label="Title">
                <input className={inp} value={badge.title} onChange={e => patchBadge(i, "title", e.target.value)} placeholder="Free UK Delivery" />
              </Field>
              <Field label="Description">
                <input className={inp} value={badge.desc} onChange={e => patchBadge(i, "desc", e.target.value)} placeholder="On all orders, every day" />
              </Field>
            </div>
          ))}
        </div>
      </Section>

      {/* ── SECTION LABELS ───────────────────────────────────────────────── */}
      <Section title="Product Section Labels" icon={<Globe size={16} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[12px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Featured Products</p>
            <Field label="Title">
              <input className={inp} value={cms.featuredSection.title} onChange={e => patch("featuredSection", { title: e.target.value })} placeholder="Featured Products" />
            </Field>
            <Field label="Subtitle">
              <input className={inp} value={cms.featuredSection.subtitle} onChange={e => patch("featuredSection", { subtitle: e.target.value })} placeholder="Handpicked for quality and value" />
            </Field>
          </div>
          <div className="space-y-3">
            <p className="text-[12px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">New Arrivals</p>
            <Field label="Title">
              <input className={inp} value={cms.newArrivalsSection.title} onChange={e => patch("newArrivalsSection", { title: e.target.value })} placeholder="New Arrivals" />
            </Field>
            <Field label="Subtitle">
              <input className={inp} value={cms.newArrivalsSection.subtitle} onChange={e => patch("newArrivalsSection", { subtitle: e.target.value })} placeholder="Just landed in our store" />
            </Field>
          </div>
        </div>
      </Section>

      {/* ── SHOP SETTINGS ────────────────────────────────────────────────── */}
      <Section title="Shop Settings" icon={<ShoppingBag size={16} />} defaultOpen={false}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 dark:border-zinc-800">
            <div>
              <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Show Stock Badge on Product Images</p>
              <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">
                Display "Out of Stock" and "Low Stock" labels on product cards and the product detail page.
              </p>
            </div>
            <button
              type="button"
              onClick={() => patch("shop", { showStockBadge: !cms.shop.showStockBadge })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                cms.shop.showStockBadge ? "bg-blue-600" : "bg-gray-200 dark:bg-zinc-700"
              }`}
              aria-pressed={cms.shop.showStockBadge}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  cms.shop.showStockBadge ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Allow Orders on Out-of-Stock Products</p>
              <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">
                When enabled, customers can add out-of-stock items to cart (backorder). When disabled, the Add to Cart button is greyed out.
              </p>
            </div>
            <button
              type="button"
              onClick={() => patch("shop", { allowBackorder: !cms.shop.allowBackorder })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                cms.shop.allowBackorder ? "bg-blue-600" : "bg-gray-200 dark:bg-zinc-700"
              }`}
              aria-pressed={cms.shop.allowBackorder}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  cms.shop.allowBackorder ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </Section>

      {/* ── SEO ──────────────────────────────────────────────────────────── */}
      <Section title="SEO & Meta Tags" icon={<Globe size={16} />} defaultOpen={false}>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Page Title" hint="Shown in browser tab and search results">
            <input className={inp} value={cms.seo.title} onChange={e => patch("seo", { title: e.target.value })} placeholder="Onesoft Tech Store" />
          </Field>
          <Field label="Meta Description" hint="150–160 characters for best SEO">
            <textarea className={inp + " resize-none h-20"} value={cms.seo.description} onChange={e => patch("seo", { description: e.target.value })} />
          </Field>
          <Field label="Keywords" hint="Comma-separated keywords">
            <input className={inp} value={cms.seo.keywords} onChange={e => patch("seo", { keywords: e.target.value })} placeholder="tech, smartphones, laptops" />
          </Field>
        </div>
      </Section>

      {/* Bottom save bar */}
      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xl shadow-blue-600/30 transition-colors">
            <Save size={15} /> {saving ? "Saving…" : "Save & Publish"}
          </button>
        </div>
      )}
    </div>
  );
}
