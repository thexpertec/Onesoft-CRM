import { Link } from "wouter";
import {
  Zap, Mail, Phone, MapPin,
  Twitter, Instagram, Facebook, Youtube, Linkedin,
} from "lucide-react";
import { useStore } from "@/contexts/store-context";

// TikTok doesn't have a lucide icon — use a simple SVG inline
function TikTokIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.36 6.36 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.74a4.85 4.85 0 0 1-1.01-.05z"/>
    </svg>
  );
}

const SOCIAL_ICONS: Record<string, React.ElementType | ((p: { size?: number }) => JSX.Element)> = {
  twitter:   Twitter,
  instagram: Instagram,
  facebook:  Facebook,
  youtube:   Youtube,
  linkedin:  Linkedin,
  tiktok:    TikTokIcon,
};

const SOCIAL_LABELS: Record<string, string> = {
  twitter: "Twitter / X", instagram: "Instagram", facebook: "Facebook",
  youtube: "YouTube", linkedin: "LinkedIn", tiktok: "TikTok",
};

export function Footer() {
  const { storeName, categories, cms, tenantId } = useStore();
  const year = new Date().getFullYear();

  const { brand, contact, social } = cms;

  const activeSocials = (Object.keys(social) as (keyof typeof social)[]).filter(k => social[k].trim());

  return (
    <footer className="bg-slate-900 text-slate-400 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          {/* Brand */}
          <div className="space-y-4">
            <Link href="/home" className="flex items-center gap-2">
              {(brand.logoBase64 || brand.logoUrl) ? (
                <img src={brand.logoBase64 || brand.logoUrl} alt={storeName} className="h-8 w-auto object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Zap size={16} className="text-white fill-white" />
                </div>
              )}
              <span className="text-lg font-bold text-white tracking-tight">{storeName}</span>
            </Link>
            {brand.tagline && (
              <p className="text-xs font-semibold text-blue-400 tracking-wide">{brand.tagline}</p>
            )}
            <p className="text-sm leading-relaxed">
              {brand.description}
            </p>
            {activeSocials.length > 0 && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {activeSocials.map(network => {
                  const Icon = SOCIAL_ICONS[network];
                  return (
                    <a key={network} href={social[network]} target="_blank" rel="noopener noreferrer"
                      aria-label={SOCIAL_LABELS[network]}
                      className="w-8 h-8 rounded-md bg-slate-800 flex items-center justify-center text-slate-500 hover:text-white hover:bg-blue-600 transition-all">
                      <Icon size={14} />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4 tracking-wide uppercase">Categories</h4>
            <ul className="space-y-2.5">
              {(categories.length > 0 ? categories.slice(0, 6) : [
                "Smartphones", "Laptops", "Tablets", "Gaming", "Audio", "Accessories"
              ]).map(cat => (
                <li key={cat}>
                  <Link href={`/category/${encodeURIComponent(cat)}`}
                    className="text-sm hover:text-white transition-colors">
                    {cat}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4 tracking-wide uppercase">Store</h4>
            <ul className="space-y-2.5">
              {[
                { label: "All Products", href: "/shop" },
                { label: "New Arrivals", href: "/shop?sort=newest" },
                { label: "Best Sellers", href: "/shop?sort=popular" },
                { label: "Deals & Offers", href: "/shop?sort=price_asc" },
              ].map(link => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
              {cms.brand && (
                <>
                  <li>
                    <a
                      href={`/customer-portal/?t=${encodeURIComponent(tenantId ?? "")}`}
                      className="text-sm hover:text-white transition-colors"
                    >
                      My Account
                    </a>
                  </li>
                  <li>
                    <a
                      href={`/customer-portal/?t=${encodeURIComponent(tenantId ?? "")}`}
                      className="text-sm hover:text-white transition-colors"
                    >
                      Sign Up / Sign In
                    </a>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4 tracking-wide uppercase">Contact</h4>
            <ul className="space-y-3">
              {contact.address && (
                <li className="flex items-start gap-2.5 text-sm">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-blue-500" />
                  <span style={{ whiteSpace: "pre-line" }}>{contact.address}</span>
                </li>
              )}
              {contact.phone && (
                <li className="flex items-center gap-2.5 text-sm">
                  <Phone size={14} className="shrink-0 text-blue-500" />
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="hover:text-white transition-colors">
                    {contact.phone}
                  </a>
                </li>
              )}
              {contact.email && (
                <li className="flex items-center gap-2.5 text-sm">
                  <Mail size={14} className="shrink-0 text-blue-500" />
                  <a href={`mailto:${contact.email}`} className="hover:text-white transition-colors break-all">
                    {contact.email}
                  </a>
                </li>
              )}
            </ul>
          </div>

        </div>

        <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p>&copy; {year} {storeName}. All rights reserved. Powered by Onesoft.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
