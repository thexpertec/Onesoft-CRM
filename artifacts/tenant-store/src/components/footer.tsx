import { Link } from "wouter";
import { Zap, Mail, Phone, MapPin, Twitter, Instagram, Facebook, Youtube } from "lucide-react";
import { useStore } from "@/contexts/store-context";

export function Footer() {
  const { storeName, categories } = useStore();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-400 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Zap size={16} className="text-white fill-white" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">{storeName}</span>
            </Link>
            <p className="text-sm leading-relaxed">
              Your one-stop destination for the latest in technology. Premium products, competitive prices, fast delivery.
            </p>
            <div className="flex items-center gap-3 pt-1">
              {[Twitter, Instagram, Facebook, Youtube].map((Icon, i) => (
                <button
                  key={i}
                  className="w-8 h-8 rounded-md bg-slate-800 flex items-center justify-center text-slate-500 hover:text-white hover:bg-blue-600 transition-all"
                  aria-label="Social link"
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4 tracking-wide uppercase">Categories</h4>
            <ul className="space-y-2.5">
              {(categories.length > 0 ? categories.slice(0, 6) : [
                "Smartphones", "Laptops", "Tablets", "Gaming", "Audio", "Accessories"
              ]).map(cat => (
                <li key={cat}>
                  <Link
                    href={`/category/${encodeURIComponent(cat)}`}
                    className="text-sm hover:text-white transition-colors"
                  >
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
                { label: "Track Order", href: "#" },
                { label: "Returns", href: "#" },
              ].map(link => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4 tracking-wide uppercase">Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5 text-sm">
                <MapPin size={14} className="mt-0.5 shrink-0 text-blue-500" />
                <span>Hull, United Kingdom<br />& Islamabad, Pakistan</span>
              </li>
              <li className="flex items-center gap-2.5 text-sm">
                <Phone size={14} className="shrink-0 text-blue-500" />
                <span>+44 1234 567890</span>
              </li>
              <li className="flex items-center gap-2.5 text-sm">
                <Mail size={14} className="shrink-0 text-blue-500" />
                <span>hello@{storeName.toLowerCase()}.com</span>
              </li>
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
