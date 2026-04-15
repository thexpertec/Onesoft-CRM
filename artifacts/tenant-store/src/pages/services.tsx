import { Link } from "wouter";
import {
  Wrench, Smartphone, Monitor, Wifi, ShieldCheck, Truck,
  RefreshCw, HeadphonesIcon, ChevronRight, ArrowRight,
  Star, Clock, BadgeCheck,
} from "lucide-react";

const SERVICES = [
  {
    icon: Wrench,
    title: "Device Repair",
    desc: "Professional repair services for smartphones, tablets, laptops, and other devices. Fast turnaround, genuine parts.",
    color: "from-blue-500 to-indigo-600",
    items: ["Screen replacement", "Battery replacement", "Water damage recovery", "Software troubleshooting"],
  },
  {
    icon: Smartphone,
    title: "Phone Unlocking",
    desc: "Factory unlocking for all major network carriers. Supports all brands and models — quick and guaranteed.",
    color: "from-violet-500 to-purple-600",
    items: ["Network unlocking", "iCloud unlock assistance", "IMEI cleaning", "All major carriers"],
  },
  {
    icon: Wifi,
    title: "Network & IT Setup",
    desc: "Home and business networking setup, configuration, and troubleshooting. Fast broadband, Wi-Fi extenders, and more.",
    color: "from-sky-500 to-cyan-600",
    items: ["Broadband setup", "Wi-Fi configuration", "Network security", "Smart home devices"],
  },
  {
    icon: Monitor,
    title: "PC & Laptop Services",
    desc: "Upgrades, clean installations, virus removal, and performance optimisation for Windows and macOS systems.",
    color: "from-emerald-500 to-teal-600",
    items: ["RAM & SSD upgrades", "OS reinstallation", "Virus & malware removal", "Data recovery"],
  },
  {
    icon: ShieldCheck,
    title: "Warranty & Protection",
    desc: "Extended warranty plans and screen protection fitting. We ensure your devices stay covered and protected.",
    color: "from-orange-500 to-amber-500",
    items: ["Extended warranty", "Screen protector fitting", "Case recommendations", "Accidental damage cover"],
  },
  {
    icon: Truck,
    title: "Delivery & Collection",
    desc: "Free click & collect from our Hull store, or UK-wide delivery. Same-day dispatch on orders before 2pm.",
    color: "from-rose-500 to-pink-600",
    items: ["Free in-store collection", "Next-day UK delivery", "Tracked shipping", "Bulk / trade orders"],
  },
];

const PROCESS = [
  { step: "01", title: "Get in touch", desc: "Call, email, or visit us in Hull. Describe your issue or requirement and we'll advise the best solution." },
  { step: "02", title: "Diagnosis & quote", desc: "We assess the device or requirement and provide a transparent, no-obligation quote before any work begins." },
  { step: "03", title: "We get to work", desc: "Our technicians carry out the service using quality parts and proven methods. You're kept updated throughout." },
  { step: "04", title: "Collect or receive", desc: "Collect from store or have your repaired/serviced device delivered back to you anywhere in the UK." },
];

export function ServicesPage() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white py-20 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-4 py-1.5 text-sm text-blue-300 font-medium mb-6">
            <BadgeCheck size={14} /> Professional Tech Services
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 tracking-tight">
            We keep your tech<br />
            <span className="text-blue-400">running perfectly</span>
          </h1>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto mb-8">
            From device repairs to network setup — trusted by hundreds of customers across Hull, the UK, and Pakistan.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-sm transition-colors"
            >
              Book a Service <ChevronRight size={15} />
            </Link>
            <Link href="/shop"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-semibold text-sm transition-colors"
            >
              Browse Products <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-center gap-8 flex-wrap text-sm">
          {[
            { icon: Star,       text: "4.9★ rated service" },
            { icon: Clock,      text: "Same-day repairs available" },
            { icon: BadgeCheck, text: "Genuine parts guaranteed" },
            { icon: RefreshCw,  text: "90-day repair warranty" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Icon size={15} className="text-blue-500" /> {text}
            </div>
          ))}
        </div>
      </div>

      {/* Services grid */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3">What we offer</h2>
          <p className="text-slate-500 max-w-xl mx-auto">Expert tech services carried out by qualified professionals. Fast, transparent, and fairly priced.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map(svc => {
            const Icon = svc.icon;
            return (
              <div key={svc.title}
                className="group bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className={`inline-flex w-12 h-12 rounded-xl items-center justify-center bg-gradient-to-br ${svc.color} mb-4 shadow-sm`}>
                  <Icon size={22} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2">{svc.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">{svc.desc}</p>
                <ul className="space-y-1.5">
                  {svc.items.map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Process */}
      <section className="bg-gray-50 dark:bg-slate-900/50 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3">How it works</h2>
            <p className="text-slate-500">Simple, transparent process from start to finish.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROCESS.map((p, i) => (
              <div key={p.step} className="relative">
                {i < PROCESS.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-[calc(100%-12px)] w-6 h-0.5 bg-blue-200 dark:bg-blue-900 z-10" />
                )}
                <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
                  <div className="text-3xl font-extrabold text-blue-100 dark:text-blue-900/60 mb-3">{p.step}</div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-2">{p.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <HeadphonesIcon size={36} className="text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-3">Ready to get started?</h2>
        <p className="text-slate-500 mb-6">Contact our team today — we'll advise on the best solution and give you a free, no-obligation quote.</p>
        <Link href="/contact"
          className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm shadow-blue-200 dark:shadow-blue-900/30"
        >
          Get in Touch <ChevronRight size={15} />
        </Link>
      </section>
    </div>
  );
}
