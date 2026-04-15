import { useState, useEffect } from "react";
import { Globe, Save, RotateCcw, Eye, ExternalLink, Info, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
export type StoreCmsTrustBadge = {
  icon: string;
  title: string;
  desc: string;
};

export type StoreCms = {
  hero: {
    badge: string;
    headline1: string;
    headline2: string;
    subtitle: string;
    btn1Text: string;
    btn2Text: string;
    stat1Value: string; stat1Label: string;
    stat2Value: string; stat2Label: string;
    stat3Value: string; stat3Label: string;
  };
  promoBanner: {
    enabled: boolean;
    label: string;
    headline: string;
    subtitle: string;
    btnText: string;
  };
  trustBadges: StoreCmsTrustBadge[];
  featuredSection: { title: string; subtitle: string };
  newArrivalsSection: { title: string; subtitle: string };
  seo: { title: string; description: string; keywords: string };
};

export const CMS_DEFAULTS: StoreCms = {
  hero: {
    badge: "New Arrivals Every Week",
    headline1: "Premium Tech,",
    headline2: "Delivered Fast",
    subtitle: "Discover the latest smartphones, laptops, audio gear, and accessories. Handpicked for quality, priced for value.",
    btn1Text: "Shop All Products",
    btn2Text: "New Arrivals",
    stat1Value: "500+", stat1Label: "Products",
    stat2Value: "Free",  stat2Label: "UK Delivery",
    stat3Value: "24/7",  stat3Label: "Support",
  },
  promoBanner: {
    enabled: true,
    label: "Limited Time Offer",
    headline: "Free Delivery on All Orders Today",
    subtitle: "No minimum spend. Available across the UK & internationally.",
    btnText: "Shop Now",
  },
  trustBadges: [
    { icon: "Truck",          title: "Free UK Delivery", desc: "On all orders, every day"  },
    { icon: "ShieldCheck",    title: "2-Year Warranty",  desc: "All products covered"       },
    { icon: "RotateCcw",      title: "30-Day Returns",   desc: "Hassle-free returns"        },
    { icon: "HeadphonesIcon", title: "24/7 Support",     desc: "Always here to help"        },
  ],
  featuredSection:    { title: "Featured Products", subtitle: "Handpicked for quality and value" },
  newArrivalsSection: { title: "New Arrivals",      subtitle: "Just landed in our store"        },
  seo: { title: "Onesoft Tech Store", description: "Premium tech products delivered fast across the UK.", keywords: "tech, smartphones, laptops, accessories" },
};

// ─── KV helpers ───────────────────────────────────────────────────────────────
const CMS_KEY = "website-cms";
const API_BASE = "/api/kv/global";

async function loadCms(): Promise<StoreCms> {
  try {
    const r = await fetch(`${API_BASE}/${CMS_KEY}`);
    if (!r.ok) return CMS_DEFAULTS;
    const d = await r.json() as { value?: StoreCms };
    if (!d.value) return CMS_DEFAULTS;
    return { ...CMS_DEFAULTS, ...d.value,
      hero:               { ...CMS_DEFAULTS.hero,               ...(d.value.hero ?? {}) },
      promoBanner:        { ...CMS_DEFAULTS.promoBanner,        ...(d.value.promoBanner ?? {}) },
      trustBadges:        d.value.trustBadges ?? CMS_DEFAULTS.trustBadges,
      featuredSection:    { ...CMS_DEFAULTS.featuredSection,    ...(d.value.featuredSection ?? {}) },
      newArrivalsSection: { ...CMS_DEFAULTS.newArrivalsSection, ...(d.value.newArrivalsSection ?? {}) },
      seo:                { ...CMS_DEFAULTS.seo,                ...(d.value.seo ?? {}) },
    };
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WebsiteCmsPage() {
  const { toast } = useToast();
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
      toast({ title: "CMS saved", description: "Store homepage content has been updated." });
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Globe size={22} className="text-blue-600" />
            Website CMS
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Control the content displayed on your tenant store homepage</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/tenant-store/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors border border-gray-200 dark:border-zinc-700"
          >
            <Eye size={13} /> Preview Store <ExternalLink size={11} />
          </a>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors border border-gray-200 dark:border-zinc-700"
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
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

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <Section title="Hero Section" icon={<Globe size={16} />}>
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
            {([
              ["stat1Value", "stat1Label"],
              ["stat2Value", "stat2Label"],
              ["stat3Value", "stat3Label"],
            ] as const).map(([vk, lk], i) => (
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
      </Section>

      {/* ── PROMO BANNER ─────────────────────────────────────────────────── */}
      <Section title="Promo Banner" icon={<Globe size={16} />}>
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cms.promoBanner.enabled}
              onChange={e => patch("promoBanner", { enabled: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
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
      <Section title="Trust Badges (4 icons)" icon={<Globe size={16} />}>
        <p className="text-[12px] text-gray-400 dark:text-zinc-500 mb-3">
          Icon names: Truck, ShieldCheck, RotateCcw, HeadphonesIcon, Zap, Star, Heart, Package, Globe
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
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xl shadow-blue-600/30 transition-colors"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save & Publish"}
          </button>
        </div>
      )}
    </div>
  );
}
