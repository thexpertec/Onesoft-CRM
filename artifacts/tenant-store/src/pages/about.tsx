import { Link } from "wouter";
import {
  MapPin, Users, Award, Zap, Heart, Globe, ArrowRight,
  ChevronRight, Target, TrendingUp, ShieldCheck,
} from "lucide-react";

const STATS = [
  { value: "997+",   label: "Products in stock" },
  { value: "5,000+", label: "Happy customers" },
  { value: "10+",    label: "Years experience" },
  { value: "2",      label: "Global locations" },
];

const VALUES = [
  {
    icon: ShieldCheck,
    title: "Quality first",
    desc: "Every product we sell is sourced from trusted suppliers. We never compromise on quality to cut costs.",
    color: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
  },
  {
    icon: Heart,
    title: "Customer care",
    desc: "Real people, real support. We answer calls, reply to emails, and go the extra mile to resolve every issue.",
    color: "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400",
  },
  {
    icon: Target,
    title: "Fair pricing",
    desc: "Competitive prices without hidden costs. What you see is what you pay — always.",
    color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: Globe,
    title: "Global reach",
    desc: "Operating from Hull, UK and Islamabad, Pakistan — we serve customers across the UK and internationally.",
    color: "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400",
  },
  {
    icon: TrendingUp,
    title: "Always improving",
    desc: "We constantly update our product range and services to keep up with the latest tech trends and customer needs.",
    color: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
  },
  {
    icon: Users,
    title: "Community focused",
    desc: "Proudly serving the local communities in Hull and Islamabad, building lasting relationships with our customers.",
    color: "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400",
  },
];

const TEAM = [
  { name: "Management Team",  role: "Hull, United Kingdom",   initials: "UK", bg: "from-blue-500 to-indigo-600" },
  { name: "Operations Team",  role: "Islamabad, Pakistan",    initials: "PK", bg: "from-emerald-500 to-teal-600" },
  { name: "Technical Team",   role: "Repair & IT Services",   initials: "IT", bg: "from-violet-500 to-purple-600" },
  { name: "Customer Support", role: "Available Mon–Sat",      initials: "CS", bg: "from-rose-500 to-pink-600" },
];

export function AboutPage() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white py-20 px-4">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-indigo-600/15 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium mb-6 text-white/80">
            <Zap size={14} className="text-blue-400" /> Onesoft — Tech you can trust
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-5 tracking-tight leading-tight">
            Connecting people with<br />
            <span className="text-blue-400">great technology</span>
          </h1>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto leading-relaxed">
            Founded in Hull, UK with a global team, Onesoft is your trusted source for tech products,
            accessories, and expert repair services — delivered with care.
          </p>
        </div>
      </section>

      {/* Stats */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map(s => (
            <div key={s.label}>
              <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mb-1">{s.value}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Story */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">Our story</h2>
            <div className="space-y-4 text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
              <p>
                Onesoft started as a small tech accessories retailer in Hull, UK, driven by a simple belief:
                everyone deserves access to quality technology at honest prices.
              </p>
              <p>
                Over the years, we grew our product range from mobile phone accessories to a comprehensive
                catalogue covering gadgets, screen protection, audio equipment, networking gear, and much more.
                We also expanded our services to include device repair, unlocking, IT setup, and trade supply.
              </p>
              <p>
                With a second base in Islamabad, Pakistan, we now serve customers across two continents —
                maintaining the same commitment to quality, transparency, and customer satisfaction that
                has been our foundation from day one.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-4">
              <Link href="/shop"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
              >
                Browse Our Products <ArrowRight size={14} />
              </Link>
              <Link href="/contact"
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl font-semibold text-sm transition-colors"
              >
                Get in Touch
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6 text-white aspect-square flex flex-col justify-between">
              <MapPin size={28} className="opacity-80" />
              <div>
                <p className="text-2xl font-extrabold">Hull</p>
                <p className="text-sm opacity-70">United Kingdom</p>
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white aspect-square flex flex-col justify-between mt-6">
              <MapPin size={28} className="opacity-80" />
              <div>
                <p className="text-2xl font-extrabold">Islamabad</p>
                <p className="text-sm opacity-70">Pakistan</p>
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-6 text-white aspect-square flex flex-col justify-between -mt-6">
              <Award size={28} className="opacity-80" />
              <div>
                <p className="text-2xl font-extrabold">10+</p>
                <p className="text-sm opacity-70">Years in business</p>
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-6 text-white aspect-square flex flex-col justify-between">
              <Users size={28} className="opacity-80" />
              <div>
                <p className="text-2xl font-extrabold">5,000+</p>
                <p className="text-sm opacity-70">Satisfied customers</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-gray-50 dark:bg-slate-900/50 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3">What drives us</h2>
            <p className="text-slate-500 max-w-xl mx-auto">The values that guide every product we sell and every service we deliver.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VALUES.map(v => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 hover:shadow-md transition-all">
                  <div className={`inline-flex w-10 h-10 rounded-xl items-center justify-center mb-4 ${v.color}`}>
                    <Icon size={18} />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-2">{v.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{v.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3">Our teams</h2>
          <p className="text-slate-500">Dedicated professionals across two countries, working together for you.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TEAM.map(t => (
            <div key={t.name} className="text-center group">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${t.bg} flex items-center justify-center mx-auto mb-3 shadow-sm group-hover:shadow-md transition-shadow text-white font-bold text-lg`}>
                {t.initials}
              </div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">{t.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{t.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 py-14 px-4 text-white text-center">
        <h2 className="text-2xl font-extrabold mb-3">Become part of our story</h2>
        <p className="text-blue-100 mb-6 max-w-md mx-auto">Shop with us today and experience the Onesoft difference — quality products, honest prices, and genuine care.</p>
        <Link href="/shop"
          className="inline-flex items-center gap-2 px-8 py-3 bg-white text-blue-600 hover:bg-blue-50 rounded-xl font-bold text-sm transition-colors shadow-sm"
        >
          Shop Now <ChevronRight size={15} />
        </Link>
      </section>
    </div>
  );
}
