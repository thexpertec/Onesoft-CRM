import { useState } from "react";
import { Link } from "wouter";
import {
  Wrench, Smartphone, Monitor, Wifi, ShieldCheck, Truck,
  RefreshCw, HeadphonesIcon, ChevronRight, ArrowRight,
  Star, Clock, BadgeCheck, X, CheckCircle2, Loader2, CalendarCheck,
} from "lucide-react";
import { apiBase } from "@/lib/api";

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

const SERVICE_TITLES = SERVICES.map(s => s.title);

const PROCESS = [
  { step: "01", title: "Get in touch", desc: "Call, email, or visit us in Hull. Describe your issue or requirement and we'll advise the best solution." },
  { step: "02", title: "Diagnosis & quote", desc: "We assess the device or requirement and provide a transparent, no-obligation quote before any work begins." },
  { step: "03", title: "We get to work", desc: "Our technicians carry out the service using quality parts and proven methods. You're kept updated throughout." },
  { step: "04", title: "Collect or receive", desc: "Collect from store or have your repaired/serviced device delivered back to you anywhere in the UK." },
];

interface BookingForm {
  name: string;
  phone: string;
  service: string;
  deviceIssue: string;
}

async function submitBooking(form: BookingForm): Promise<void> {
  const api = apiBase();
  const tenantId = new URLSearchParams(window.location.search).get("tenant") || "global";

  const getRes = await fetch(`${api}/kv/global/repair-bookings`);
  const getData = await getRes.json() as { value: unknown };
  const existing = Array.isArray(getData.value) ? getData.value : [];

  const newBooking = {
    id: crypto.randomUUID(),
    name: form.name.trim(),
    phone: form.phone.trim(),
    service: form.service,
    deviceIssue: form.deviceIssue.trim(),
    tenantId,
    createdAt: new Date().toISOString(),
    status: "New",
  };

  await fetch(`${api}/kv/global/repair-bookings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: [...existing, newBooking] }),
  });
}

export function ServicesPage() {
  const [bookingService, setBookingService] = useState<string | null>(null);
  const [form, setForm] = useState<BookingForm>({ name: "", phone: "", service: "", deviceIssue: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function openBooking(serviceTitle: string) {
    setForm({ name: "", phone: "", service: serviceTitle });
    setSubmitted(false);
    setBookingService(serviceTitle);
  }

  function closeBooking() {
    setBookingService(null);
    setSubmitted(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.service) return;
    setSubmitting(true);
    try {
      await submitBooking(form);
      setSubmitted(true);
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
            <button
              onClick={() => openBooking(SERVICE_TITLES[0])}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-sm transition-colors"
            >
              Book a Service <ChevronRight size={15} />
            </button>
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
                className="group bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col"
              >
                <div className={`inline-flex w-12 h-12 rounded-xl items-center justify-center bg-gradient-to-br ${svc.color} mb-4 shadow-sm`}>
                  <Icon size={22} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2">{svc.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">{svc.desc}</p>
                <ul className="space-y-1.5 mb-5 flex-1">
                  {svc.items.map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => openBooking(svc.title)}
                  className="w-full mt-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
                >
                  <CalendarCheck size={14} /> Book for this service
                </button>
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
        <button
          onClick={() => openBooking(SERVICE_TITLES[0])}
          className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm shadow-blue-200 dark:shadow-blue-900/30"
        >
          Book a Service <ChevronRight size={15} />
        </button>
      </section>

      {/* Booking dialog */}
      {bookingService !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeBooking} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-slate-700 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <CalendarCheck size={17} className="text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base leading-tight">Book a service</h2>
                  <p className="text-xs text-slate-500">We'll get back to you shortly</p>
                </div>
              </div>
              <button onClick={closeBooking} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                <X size={18} />
              </button>
            </div>

            {submitted ? (
              <div className="px-6 py-10 text-center overflow-y-auto">
                <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
                <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-2">Booking received!</h3>
                <p className="text-slate-500 text-sm mb-6">Thanks, {form.name}. Our team will be in touch on <span className="font-medium text-slate-700 dark:text-slate-300">{form.phone}</span> to confirm your appointment.</p>
                <button onClick={closeBooking} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Your name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. John Smith"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Phone number <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="e.g. 07700 900123"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">What service is required? <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={form.service}
                    onChange={e => setForm(f => ({ ...f, service: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  >
                    <option value="" disabled>Select a service…</option>
                    {SERVICE_TITLES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">What is the issue with your device?</label>
                  <textarea
                    rows={3}
                    value={form.deviceIssue}
                    onChange={e => setForm(f => ({ ...f, deviceIssue: e.target.value }))}
                    placeholder="e.g. Cracked screen, won't turn on, battery draining fast…"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 resize-none"
                  />
                </div>
                <div className="pt-1 pb-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    {submitting ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><CalendarCheck size={15} /> Confirm Booking</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
