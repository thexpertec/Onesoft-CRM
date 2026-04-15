import { useState } from "react";
import {
  MapPin, Phone, Mail, Clock, Send, MessageSquare,
  CheckCircle2, ChevronRight, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const OFFICES = [
  {
    city: "Hull",
    country: "United Kingdom",
    flag: "🇬🇧",
    address: "Hull, East Yorkshire, UK",
    phone: "+44 (0) 1482 000 000",
    email: "hull@onesoft.org.uk",
    hours: "Mon–Sat: 9:00am – 6:00pm",
    gradient: "from-blue-500 to-indigo-600",
  },
  {
    city: "Islamabad",
    country: "Pakistan",
    flag: "🇵🇰",
    address: "Islamabad, Punjab, Pakistan",
    phone: "+92 51 000 0000",
    email: "pk@onesoft.org.uk",
    hours: "Mon–Sat: 10:00am – 7:00pm (PKT)",
    gradient: "from-emerald-500 to-teal-600",
  },
];

const FAQS = [
  {
    q: "What's your returns policy?",
    a: "We offer a 30-day return policy on all products. Items must be unused and in original packaging. Contact us to initiate a return.",
  },
  {
    q: "How long does delivery take?",
    a: "Standard UK delivery takes 3–5 business days. Express delivery is 1–2 business days. Free collection is available from our Hull store.",
  },
  {
    q: "Do you offer bulk / trade pricing?",
    a: "Yes! We offer discounted pricing for trade customers and bulk orders. Contact our sales team for a custom quote.",
  },
  {
    q: "Can I track my order?",
    a: "Yes. Once your order is dispatched you'll receive a tracking number via email. Use it on our courier's website to track delivery.",
  },
  {
    q: "Do you repair all device brands?",
    a: "We repair most major brands including Apple, Samsung, Huawei, Xiaomi, and more. Contact us with your device details for a quote.",
  },
];

const inputCls = "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all";

export function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: undefined }));
  }

  function validate() {
    const e: Partial<typeof form> = {};
    if (!form.name.trim())    e.name    = "Required";
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = "Valid email required";
    if (!form.message.trim()) e.message = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSending(true);
    // Simulate submit (no backend email sending configured yet)
    await new Promise(r => setTimeout(r, 1200));
    setSending(false);
    setSent(true);
  }

  return (
    <div className="animate-in fade-in duration-300">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white py-16 px-4">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-80 h-80 rounded-full bg-indigo-600/15 blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium mb-5 text-white/80">
            <MessageSquare size={14} /> We'd love to hear from you
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 tracking-tight">
            Get in <span className="text-blue-400">touch</span>
          </h1>
          <p className="text-slate-300 text-base max-w-xl mx-auto">
            Questions, orders, repairs, or trade enquiries — our team is ready to help.
          </p>
        </div>
      </section>

      {/* Office cards */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid sm:grid-cols-2 gap-6 mb-14">
          {OFFICES.map(o => (
            <div key={o.city} className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 overflow-hidden hover:shadow-lg transition-all">
              <div className={`bg-gradient-to-r ${o.gradient} px-6 py-5 flex items-center gap-3`}>
                <span className="text-3xl">{o.flag}</span>
                <div>
                  <p className="font-extrabold text-white text-lg">{o.city}</p>
                  <p className="text-white/70 text-xs">{o.country}</p>
                </div>
              </div>
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <MapPin size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <span>{o.address}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <Phone size={15} className="text-slate-400 flex-shrink-0" />
                  <a href={`tel:${o.phone}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{o.phone}</a>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <Mail size={15} className="text-slate-400 flex-shrink-0" />
                  <a href={`mailto:${o.email}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{o.email}</a>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <Clock size={15} className="text-slate-400 flex-shrink-0" />
                  <span>{o.hours}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contact form + FAQ */}
        <div className="grid lg:grid-cols-[1fr_380px] gap-10">
          {/* Form */}
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-6">Send us a message</h2>

            {sent ? (
              <div className="flex flex-col items-center text-center py-12 bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700">
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} className="text-emerald-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Message sent!</h3>
                <p className="text-slate-500 text-sm max-w-xs">
                  Thank you, {form.name.split(" ")[0]}. We'll get back to you at <strong>{form.email}</strong> as soon as possible.
                </p>
                <button
                  onClick={() => { setSent(false); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}
                  className="mt-6 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input value={form.name} onChange={e => set("name", e.target.value)}
                      placeholder="Your name" className={cn(inputCls, errors.name && "border-red-400 focus:border-red-400")} />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                      Phone (optional)
                    </label>
                    <input value={form.phone} onChange={e => set("phone", e.target.value)}
                      placeholder="+44 7700 000000" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                    placeholder="you@example.com" className={cn(inputCls, errors.email && "border-red-400 focus:border-red-400")} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Subject</label>
                  <input value={form.subject} onChange={e => set("subject", e.target.value)}
                    placeholder="How can we help?" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Message <span className="text-red-500">*</span>
                  </label>
                  <textarea value={form.message} onChange={e => set("message", e.target.value)}
                    placeholder="Tell us what you need..." rows={5}
                    className={cn(inputCls, "resize-none", errors.message && "border-red-400 focus:border-red-400")} />
                  {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message}</p>}
                </div>
                <button
                  type="submit" disabled={sending}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {sending ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send Message</>}
                </button>
              </form>
            )}
          </div>

          {/* FAQ */}
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-6">FAQs</h2>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <div key={i} className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="text-sm font-semibold text-slate-800 dark:text-white pr-3">{faq.q}</span>
                    <ChevronRight
                      size={15}
                      className={cn("text-slate-400 flex-shrink-0 transition-transform duration-200", openFaq === i && "rotate-90")}
                    />
                  </button>
                  {openFaq === i && (
                    <div className="px-5 pb-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed border-t border-gray-100 dark:border-slate-700 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div className="mt-6 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/40 p-5">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">Quick links</p>
              <div className="space-y-2">
                {[
                  { label: "Browse all products", href: "/shop" },
                  { label: "View our services",   href: "/services" },
                  { label: "Go to checkout",       href: "/checkout" },
                ].map(l => (
                  <a key={l.href} href={l.href}
                    className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors"
                  >
                    <ChevronRight size={13} /> {l.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
