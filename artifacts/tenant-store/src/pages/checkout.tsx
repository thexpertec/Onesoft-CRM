import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ShoppingBag, ChevronRight, ChevronLeft, CheckCircle2,
  Truck, Banknote, CreditCard, MapPin, User, Mail,
  Phone, Building2, Loader2, Shield, Lock, UserCheck,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { useStore } from "@/contexts/store-context";
import { SESSION_KEY, type StoredSession } from "@/hooks/use-customer-session";
import { cn, formatPrice, getDisplayPrice, getEffectivePrice } from "@/lib/utils";

/* ─── Types ───────────────────────────────────────────────────────────── */
interface CustomerForm {
  firstName:   string;
  lastName:    string;
  email:       string;
  phone:       string;
  company:     string;
  address1:    string;
  address2:    string;
  city:        string;
  postcode:    string;
  country:     string;
  notes:       string;
}

type PaymentMethod = "cod" | "bank" | "card";
type Step = "info" | "payment" | "confirm";

const BLANK: CustomerForm = {
  firstName: "", lastName: "", email: "", phone: "",
  company: "", address1: "", city: "", postcode: "",
  country: "United Kingdom", address2: "", notes: "",
};

const COUNTRIES = [
  "United Kingdom", "Pakistan", "United States", "Canada",
  "Australia", "Germany", "France", "Italy", "Spain", "Other",
];

const SHIPPING_OPTIONS = [
  { id: "standard", label: "Standard Delivery", detail: "3–5 business days", price: 4.99 },
  { id: "express",  label: "Express Delivery",  detail: "1–2 business days", price: 9.99 },
  { id: "pickup",   label: "Free Collection",   detail: "Collect from Hull, UK", price: 0 },
];

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function apiBase(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base.replace(/\/tenant-store.*/, "")}/api`;
}

async function saveOrder(order: Record<string, unknown>, tenantId: string | null): Promise<void> {
  const ns = tenantId ? encodeURIComponent(`t:${tenantId}`) : "global";
  let existing: unknown[] = [];
  try {
    const r = await fetch(`${apiBase()}/kv/${ns}/store-orders`);
    if (r.ok) {
      const d = await r.json() as { value: unknown[] };
      if (Array.isArray(d.value)) existing = d.value;
    }
  } catch { /* ignore */ }
  existing.push(order);
  await fetch(`${apiBase()}/kv/${ns}/store-orders`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: existing }),
  });
}

async function saveToAdminSales(saleRecord: Record<string, unknown>, tenantId: string | null): Promise<void> {
  const id = saleRecord.id as string;

  // 1. Append to global online-orders list so the admin sales page can import it
  try {
    let existing: unknown[] = [];
    const r = await fetch(`${apiBase()}/kv/global/online-orders`);
    if (r.ok) {
      const d = await r.json() as { value: unknown[] };
      if (Array.isArray(d.value)) existing = d.value;
    }
    if (!existing.some((e) => (e as Record<string, unknown>).id === id)) {
      existing.push(saleRecord);
    }
    await fetch(`${apiBase()}/kv/global/online-orders`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: existing }),
    });
  } catch { /* non-fatal */ }

  // 2. Also write directly into the tenant's admin-sales so the customer portal can read it immediately
  if (tenantId) {
    try {
      const ns = encodeURIComponent(`t:${tenantId}`);
      let existing: unknown[] = [];
      const r = await fetch(`${apiBase()}/kv/${ns}/admin-sales`);
      if (r.ok) {
        const d = await r.json() as { value: unknown[] };
        if (Array.isArray(d.value)) existing = d.value;
      }
      if (!existing.some((e) => (e as Record<string, unknown>).id === id)) {
        existing.push(saleRecord);
      }
      await fetch(`${apiBase()}/kv/${ns}/admin-sales`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: existing }),
      });
    } catch { /* non-fatal */ }
  }
}

/* ─── Sub-components ─────────────────────────────────────────────────── */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all";

interface PortalProfile {
  phone?: string; address?: string; city?: string; state?: string; postalCode?: string;
}

/* ─── Main Component ─────────────────────────────────────────────────── */
export function CheckoutPage() {
  const { items: rawItems, totalPrice, totalItems, clearCart } = useCart();
  const { tenantId, products: storeProducts } = useStore();

  /* Merge cart snapshots with live product data so clubcardPrice is always fresh */
  const items = rawItems.map(i => {
    const live = storeProducts.find(p => p.id === i.product.id);
    return live ? { ...i, product: live } : i;
  });

  /* ── Session state — managed locally so inline sign-in can update it immediately ── */
  const [portalSession, setPortalSession] = useState<StoredSession | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch { return null; }
  });

  /* Clubcard membership = any logged-in portal session */
  const isLoggedIn = !!portalSession;

  /* Sync when user returns to tab or signs in from another tab */
  useEffect(() => {
    function syncFromStorage() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        setPortalSession(raw ? (JSON.parse(raw) as StoredSession) : null);
      } catch { setPortalSession(null); }
    }
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("focus", syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
    };
  }, []);

  const [step,    setStep]    = useState<Step>("info");
  const [form,    setForm]    = useState<CustomerForm>(BLANK);
  const [errors,  setErrors]  = useState<Partial<CustomerForm>>({});
  const [shipping, setShipping] = useState(SHIPPING_OPTIONS[0]);
  const [payment,  setPayment]  = useState<PaymentMethod>("cod");
  const [placing,  setPlacing]  = useState(false);
  const [orderId,  setOrderId]  = useState<string>("");

  /* ── Inline sign-in state ────────────────────────────────────────────── */
  const [showInlineLogin, setShowInlineLogin] = useState(false);
  const [loginEmail,      setLoginEmail]      = useState("");
  const [loginPassword,   setLoginPassword]   = useState("");
  const [loginLoading,    setLoginLoading]    = useState(false);
  const [loginError,      setLoginError]      = useState("");

  /* ── SHA-256 helper — works in all secure contexts (HTTPS + localhost) ── */
  async function sha256hex(text: string): Promise<string> {
    const encoded = new TextEncoder().encode(text);
    const buf = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ── Build the API base URL regardless of which path the app is served at */
  function getApiBase(): string {
    const { origin } = window.location;
    // Strip anything from /tenant-store onwards so we always reach the root /api
    const base = import.meta.env.BASE_URL ?? "/tenant-store/";
    const prefix = base.replace(/\/tenant-store.*/, "");   // "" in most deployments
    return `${origin}${prefix}/api`;
  }

  /* ── Inline sign-in handler ──────────────────────────────────────────── */
  async function handleInlineSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) { setLoginError("Store not identified. Please refresh the page."); return; }
    setLoginLoading(true);
    setLoginError("");

    const apiBase = getApiBase();
    const ns = encodeURIComponent(`t:${tenantId}`);
    const email = loginEmail.trim().toLowerCase();

    // Step 1 — fetch portal accounts
    let accounts: Array<{ email: string; passwordHash: string; customerId: string; name: string; createdAt: string }> = [];
    try {
      const r = await fetch(`${apiBase}/kv/${ns}/portal-accounts`);
      if (r.ok) {
        const json = await r.json();
        if (Array.isArray(json?.value)) accounts = json.value;
      } else {
        setLoginError("Could not reach the server. Please try again.");
        setLoginLoading(false);
        return;
      }
    } catch {
      setLoginError("Network error. Please check your connection and try again.");
      setLoginLoading(false);
      return;
    }

    // Step 2 — hash password
    let hash = "";
    try {
      hash = await sha256hex(loginPassword);
    } catch {
      setLoginError("Your browser does not support secure login. Please use an up-to-date browser.");
      setLoginLoading(false);
      return;
    }

    // Step 3 — find matching account
    const account = accounts.find(
      a => a.email.trim().toLowerCase() === email && a.passwordHash === hash
    );
    if (!account) {
      setLoginError("Incorrect email or password.");
      setLoginLoading(false);
      return;
    }

    // Step 4 — fetch customers (non-fatal)
    let customers: Array<{ id: string; name: string; email: string; phone?: string; city?: string }> = [];
    try {
      const r = await fetch(`${apiBase}/kv/${ns}/admin-customers`);
      if (r.ok) {
        const json = await r.json();
        if (Array.isArray(json?.value)) customers = json.value;
      }
    } catch { /* proceed with stub */ }

    // Step 5 — build session and store
    const customer = customers.find(c => c.id === account.customerId) ?? {
      id: account.customerId,
      name: account.name || email.split("@")[0],
      email: account.email,
      phone: "", city: "",
    };
    const sessionData: StoredSession = { tenantId, customer, loginAt: new Date().toISOString() };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    } catch { /* storage restricted — session stays in memory only */ }
    setPortalSession(sessionData);
    setShowInlineLogin(false);
    setLoginEmail("");
    setLoginPassword("");
    setLoginLoading(false);
  }

  /* ── Auto-prefill form whenever session is detected / changes ──────── */
  useEffect(() => {
    if (!portalSession) return;
    const c = portalSession.customer;
    const parts     = (c.name || "").trim().split(" ");
    const firstName = parts[0] ?? "";
    const lastName  = parts.slice(1).join(" ");
    setForm(f => ({
      ...f,
      firstName: firstName || f.firstName,
      lastName:  lastName  || f.lastName,
      email:     c.email   || f.email,
      phone:     c.phone   || f.phone,
      city:      c.city    || f.city,
    }));
    // Also pull saved address from portal profile store
    const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "").replace(/\/tenant-store.*/, "")}/api`;
    const ns   = encodeURIComponent(`t:${portalSession.tenantId || tenantId || ""}`);
    fetch(`${base}/kv/${ns}/portal-profile-${c.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { value: PortalProfile } | null) => {
        if (!d?.value) return;
        const p = d.value;
        setForm(f => ({
          ...f,
          phone:    p.phone      || f.phone,
          address1: p.address    || f.address1,
          address2: (p as Record<string, string>).address2 || f.address2,
          city:     p.city       || f.city,
          postcode: p.postalCode || f.postcode,
          country:  (p as Record<string, string>).country  || f.country,
        }));
      })
      .catch(() => { /* non-fatal */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalSession?.customer?.id]);

  /* Redirect to shop if cart is empty */
  if (items.length === 0 && step !== "confirm") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
          <ShoppingBag size={32} className="text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Your cart is empty</h2>
        <p className="text-slate-500 text-sm">Add some products before checking out.</p>
        <Link href="/shop" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
          Browse Products
        </Link>
      </div>
    );
  }

  /* Recalculate subtotal using effective (clubcard) prices when logged in */
  const subtotal = items.reduce(
    (s, i) => s + parseFloat(getEffectivePrice(i.product, isLoggedIn)) * i.quantity,
    0,
  );

  /* Total clubcard saving vs regular display price */
  const clubSaving = isLoggedIn
    ? items.reduce((s, i) => {
        const disp = parseFloat(getDisplayPrice(i.product));
        const eff  = parseFloat(getEffectivePrice(i.product, isLoggedIn));
        return s + (disp - eff) * i.quantity;
      }, 0)
    : 0;
  const taxRate  = 0.20; // 20% VAT
  const tax      = subtotal * taxRate;
  const total    = subtotal + tax + shipping.price;

  /* Validation */
  function validate(): boolean {
    const e: Partial<CustomerForm> = {};
    /* Name fields are only required when NOT logged in (logged-in name comes from session) */
    if (!isLoggedIn) {
      if (!form.firstName.trim()) e.firstName = "Required";
      if (!form.lastName.trim())  e.lastName  = "Required";
      if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = "Valid email required";
    }
    if (!form.phone.trim())    e.phone    = "Required";
    if (!form.address1.trim()) e.address1 = "Required";
    if (!form.city.trim())     e.city     = "Required";
    if (!form.postcode.trim()) e.postcode = "Required";
    setErrors(e);
    /* Scroll to top of step so errors are visible */
    if (Object.keys(e).length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    return Object.keys(e).length === 0;
  }

  function set(field: keyof CustomerForm, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }));
  }

  async function placeOrder() {
    setPlacing(true);
    const id = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const order = {
      id,
      createdAt: now,
      customer: form,
      items: items.map(i => ({
        productId: i.product.id,
        name: i.product.name,
        sku: i.product.sku,
        price: getEffectivePrice(i.product, isLoggedIn),
        quantity: i.quantity,
        lineTotal: (parseFloat(getEffectivePrice(i.product, isLoggedIn)) * i.quantity).toFixed(2),
      })),
      shipping: { option: shipping.id, label: shipping.label, cost: shipping.price },
      payment: payment,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      status: "pending",
    };

    // Build a Sale-compatible record for the admin sales list
    /* Use the session name as the canonical customer name when logged in */
    const customerName = isLoggedIn && portalSession?.customer?.name
      ? portalSession.customer.name
      : `${form.firstName} ${form.lastName}`.trim();
    const paymentMethod = payment === "bank" ? "Bank Transfer" : "Cash";
    const adminSaleRecord = {
      id,
      saleNumber: id,
      saleDate: now.slice(0, 10),
      customer: customerName,
      portalCustomerId: portalSession?.customer?.id ?? null,
      status: "Completed",
      paymentMethod,
      notes: form.notes ? form.notes : `Online order · ${form.address1}, ${form.city} ${form.postcode}`,
      items: items.map(i => ({
        id: crypto.randomUUID(),
        productName: i.product.name,
        sku: i.product.sku || "",
        qty: String(i.quantity),
        unit: "pcs",
        unitPrice: (i.product.websitePrice && parseFloat(i.product.websitePrice) > 0
          ? i.product.websitePrice
          : (i.product.price || "0")),
        discount: "0",
        discountType: "pct",
        notes: "",
        itemStatus: "Pending",
      })),
      taxRate: "0",
      amountPaid: "0",
      paidAt: "",
      stockDeducted: false,
      orderType: "Online",
      onlineCustomer: `${customerName} · ${form.email} · ${form.phone}`,
      deliveryStatus: "Pending",
      deliveryCharges: String(shipping.price),
      invoiceDiscount: "0",
      invoiceDiscountType: "pct",
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveOrder(order, tenantId);
    } catch { /* non-fatal */ }
    try {
      await saveToAdminSales(adminSaleRecord, tenantId);
    } catch { /* non-fatal */ }

    /* Save the customer's phone + address to their portal profile for next time */
    if (isLoggedIn && portalSession && tenantId) {
      try {
        const ns = encodeURIComponent(`t:${tenantId}`);
        const cid = portalSession.customer.id;
        const profilePayload = {
          phone:      form.phone,
          address:    form.address1,
          address2:   form.address2,
          city:       form.city,
          state:      "",
          postalCode: form.postcode,
          country:    form.country,
        };
        await fetch(`${apiBase()}/kv/${ns}/portal-profile-${cid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: profilePayload }),
        });
        /* Also patch the phone into the in-memory session so the "Signed in" card shows it */
        const updated: StoredSession = {
          ...portalSession,
          customer: { ...portalSession.customer, phone: form.phone },
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
        setPortalSession(updated);
      } catch { /* non-fatal */ }
    }
    setOrderId(id);
    clearCart();
    setStep("confirm");
    setPlacing(false);
  }

  /* ── Step: Info ─────────────────────────────────────────────────────── */
  function InfoStep() {
    const signUpUrl  = tenantId
      ? `/customer-portal/?t=${encodeURIComponent(tenantId)}&tab=signup`
      : `/customer-portal/?tab=signup`;

    /* Calculate total potential Clubcard saving across all cart items */
    const clubcardSaving = items.reduce((sum, { product, quantity }) => {
      const display = parseFloat(getDisplayPrice(product));
      const club    = parseFloat(product.clubcardPrice ?? "");
      if (!isNaN(club) && club > 0 && club < display) {
        return sum + (display - club) * quantity;
      }
      return sum;
    }, 0);

    const accent = clubcardSaving > 0 ? "green" : "blue";

    const bannerSubtitle = clubcardSaving > 0
      ? `Sign in and save ${formatPrice(clubcardSaving)} on this order with your Clubcard.`
      : "Sign in to auto-fill your details and unlock Clubcard prices.";

    return (
      <div className="space-y-6">

        {/* ── Sign-in banner (guests only) ─────────────────────────────── */}
        {!isLoggedIn && (
          <div className={`rounded-2xl border overflow-hidden ${
            accent === "green"
              ? "border-green-200 dark:border-green-800"
              : "border-blue-200 dark:border-blue-800"
          }`}>
            {/* Banner header row */}
            <div className={`p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between ${
              accent === "green"
                ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40"
                : "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40"
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  accent === "green" ? "bg-green-100 dark:bg-green-900" : "bg-blue-100 dark:bg-blue-900"
                }`}>
                  <User size={16} className={accent === "green" ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Already have an account?</p>
                  <p className={`text-xs mt-0.5 ${
                    accent === "green" ? "text-green-700 dark:text-green-400 font-medium" : "text-slate-500 dark:text-slate-400"
                  }`}>{bannerSubtitle}</p>
                </div>
              </div>
              {!showInlineLogin && (
                <div className="flex items-center gap-2 shrink-0">
                  <a href={signUpUrl}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-colors bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700">
                    Sign Up
                  </a>
                  <button type="button"
                    onClick={() => { setShowInlineLogin(true); setLoginError(""); }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-colors shadow-sm ${
                      accent === "green" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                    }`}>
                    <UserCheck size={14} /> Sign In
                  </button>
                </div>
              )}
            </div>

            {/* Inline sign-in form (shown when Sign In is clicked) */}
            {showInlineLogin && (
              <form onSubmit={handleInlineSignIn}
                className="px-4 pb-4 pt-3 bg-white dark:bg-slate-800/90 space-y-3 border-t border-gray-100 dark:border-slate-700">
                {loginError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{loginError}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email</label>
                    <input type="email" required autoFocus value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      placeholder="you@example.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Password</label>
                    <input type="password" required value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="••••••••" className={inputCls} />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button type="button"
                    onClick={() => { setShowInlineLogin(false); setLoginError(""); setLoginEmail(""); setLoginPassword(""); }}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
                    Cancel
                  </button>
                  <div className="flex items-center gap-3">
                    <a href={signUpUrl} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      No account? Sign up
                    </a>
                    <button type="submit" disabled={loginLoading}
                      className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-60 ${
                        accent === "green" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                      }`}>
                      {loginLoading ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                      {loginLoading ? "Signing in…" : "Sign In"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Contact — summary card when logged in, full form otherwise */}
        {isLoggedIn ? (
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck size={16} className="text-blue-500" /> Signed in as {portalSession.customer.name}
              </h3>
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/60 px-2.5 py-1 rounded-full">
                Club Card Member
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                <Mail size={13} className="text-blue-400 shrink-0" />
                <span className="truncate">{form.email}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                <Phone size={13} className="text-blue-400 shrink-0" />
                {portalSession?.customer?.phone ? (
                  <span>{form.phone}</span>
                ) : (
                  <Field label="">
                    <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                      placeholder="+44 7700 000000" className={cn(inputCls, "py-1.5 text-xs", errors.phone && "border-red-400")} />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                  </Field>
                )}
              </div>
            </div>
            {!form.phone && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 flex items-center gap-1.5">
                <Phone size={11} /> Please add a phone number to continue.
              </p>
            )}
          </div>
        ) : (
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
            <User size={16} className="text-blue-500" /> Contact Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First Name" required>
              <input value={form.firstName} onChange={e => set("firstName", e.target.value)}
                placeholder="John" className={cn(inputCls, errors.firstName && "border-red-400 focus:border-red-400 focus:ring-red-300/50")} />
              {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
            </Field>
            <Field label="Last Name" required>
              <input value={form.lastName} onChange={e => set("lastName", e.target.value)}
                placeholder="Smith" className={cn(inputCls, errors.lastName && "border-red-400 focus:border-red-400 focus:ring-red-300/50")} />
              {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
            </Field>
            <Field label="Email Address" required>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                  placeholder="john@example.com" className={cn(inputCls, "pl-9", errors.email && "border-red-400 focus:border-red-400 focus:ring-red-300/50")} />
              </div>
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </Field>
            <Field label="Phone Number" required>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                  placeholder="+44 7700 000000" className={cn(inputCls, "pl-9", errors.phone && "border-red-400 focus:border-red-400 focus:ring-red-300/50")} />
              </div>
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </Field>
            <Field label="Company (optional)">
              <div className="relative">
                <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input value={form.company} onChange={e => set("company", e.target.value)}
                  placeholder="Acme Ltd" className={cn(inputCls, "pl-9")} />
              </div>
            </Field>
          </div>
        </div>
        )}

        {/* Shipping address */}
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
            <MapPin size={16} className="text-blue-500" /> Shipping Address
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <Field label="Address Line 1" required>
              <input value={form.address1} onChange={e => set("address1", e.target.value)}
                placeholder="123 High Street" className={cn(inputCls, errors.address1 && "border-red-400 focus:border-red-400 focus:ring-red-300/50")} />
              {errors.address1 && <p className="text-red-500 text-xs mt-1">{errors.address1}</p>}
            </Field>
            <Field label="Address Line 2 (optional)">
              <input value={form.address2} onChange={e => set("address2", e.target.value)}
                placeholder="Flat, suite, or unit" className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City / Town" required>
                <input value={form.city} onChange={e => set("city", e.target.value)}
                  placeholder="Hull" className={cn(inputCls, errors.city && "border-red-400 focus:border-red-400 focus:ring-red-300/50")} />
                {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
              </Field>
              <Field label="Postcode / ZIP" required>
                <input value={form.postcode} onChange={e => set("postcode", e.target.value)}
                  placeholder="HU1 1AA" className={cn(inputCls, errors.postcode && "border-red-400 focus:border-red-400 focus:ring-red-300/50")} />
                {errors.postcode && <p className="text-red-500 text-xs mt-1">{errors.postcode}</p>}
              </Field>
            </div>
            <Field label="Country">
              <select value={form.country} onChange={e => set("country", e.target.value)} className={inputCls}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Delivery option */}
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
            <Truck size={16} className="text-blue-500" /> Delivery Method
          </h3>
          <div className="space-y-3">
            {SHIPPING_OPTIONS.map(opt => (
              <label key={opt.id} className={cn(
                "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                shipping.id === opt.id
                  ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-gray-100 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"
              )}>
                <input type="radio" name="shipping" value={opt.id} checked={shipping.id === opt.id}
                  onChange={() => setShipping(opt)} className="sr-only" />
                <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                  shipping.id === opt.id ? "border-blue-500" : "border-gray-300 dark:border-slate-600"
                )}>
                  {shipping.id === opt.id && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{opt.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{opt.detail}</p>
                </div>
                <span className={cn("font-bold text-sm", opt.price === 0 ? "text-green-600" : "text-slate-900 dark:text-white")}>
                  {opt.price === 0 ? "FREE" : formatPrice(opt.price)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Order notes */}
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
          <Field label="Order Notes (optional)">
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3}
              placeholder="Any special instructions or requests..."
              className={cn(inputCls, "resize-none")} />
          </Field>
        </div>

        <button
          onClick={() => { if (validate()) setStep("payment"); }}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm shadow-blue-200 dark:shadow-blue-900/30"
        >
          Continue to Payment <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  /* ── Step: Payment ──────────────────────────────────────────────────── */
  function PaymentStep() {
    const METHODS: { id: PaymentMethod; icon: React.ElementType; label: string; desc: string; badge?: string }[] = [
      { id: "cod",  icon: Banknote,    label: "Cash on Delivery",  desc: "Pay in cash when your order arrives" },
      { id: "bank", icon: Building2,   label: "Bank Transfer",     desc: "Pay via BACS / Faster Payments" },
      { id: "card", icon: CreditCard,  label: "Card Payment",      desc: "Secure online card payment", badge: "Coming soon" },
    ];

    return (
      <div className="space-y-6">
        <button onClick={() => setStep("info")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ChevronLeft size={15} /> Back to delivery info
        </button>

        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
            <Lock size={16} className="text-blue-500" /> Payment Method
          </h3>
          <div className="space-y-3">
            {METHODS.map(m => {
              const Icon = m.icon;
              const disabled = m.id === "card";
              return (
                <label key={m.id} className={cn(
                  "flex items-center gap-4 p-4 rounded-xl border-2 transition-all",
                  disabled
                    ? "opacity-50 cursor-not-allowed border-gray-100 dark:border-slate-800"
                    : cn("cursor-pointer", payment === m.id
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                        : "border-gray-100 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600")
                )}>
                  <input type="radio" name="payment" value={m.id} checked={payment === m.id}
                    disabled={disabled} onChange={() => !disabled && setPayment(m.id)} className="sr-only" />
                  <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    payment === m.id && !disabled ? "border-blue-500" : "border-gray-300 dark:border-slate-600"
                  )}>
                    {payment === m.id && !disabled && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  <Icon size={18} className={cn("flex-shrink-0", payment === m.id && !disabled ? "text-blue-500" : "text-slate-400")} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{m.label}</p>
                      {m.badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{m.badge}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{m.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Bank details panel */}
          {payment === "bank" && (
            <div className="mt-5 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-sm space-y-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-3">Bank Transfer Details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <span className="text-slate-500">Account Name</span>    <span className="font-medium text-slate-900 dark:text-white">Onesoft Ltd</span>
                <span className="text-slate-500">Sort Code</span>       <span className="font-medium text-slate-900 dark:text-white font-mono">00-00-00</span>
                <span className="text-slate-500">Account Number</span>  <span className="font-medium text-slate-900 dark:text-white font-mono">00000000</span>
                <span className="text-slate-500">Reference</span>       <span className="font-medium text-slate-900 dark:text-white">Your order number</span>
              </div>
              <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                Your order will be dispatched once payment is confirmed.
              </p>
            </div>
          )}
        </div>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 py-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Shield size={13} className="text-green-500" /> SSL Secured
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Lock size={13} className="text-green-500" /> Encrypted
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Truck size={13} className="text-blue-500" /> Free Returns
          </div>
        </div>

        <button
          onClick={placeOrder}
          disabled={placing}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30"
        >
          {placing ? <><Loader2 size={16} className="animate-spin" /> Placing Order…</> : <>Place Order · {formatPrice(total)}</>}
        </button>
      </div>
    );
  }

  /* ── Step: Confirmation ─────────────────────────────────────────────── */
  function ConfirmStep() {
    return (
      <div className="flex flex-col items-center text-center py-10 px-4">
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
            <CheckCircle2 size={44} className="text-emerald-500" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
            <ShoppingBag size={14} className="text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">Order Placed!</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-1">Thank you, <span className="font-semibold text-slate-700 dark:text-slate-200">{form.firstName}</span>.</p>
        <p className="text-sm text-slate-400 mb-6">A confirmation will be sent to <span className="font-medium">{form.email}</span>.</p>

        <div className="w-full max-w-xs bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-700 p-5 mb-8 text-left">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Order Reference</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{orderId}</span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Items</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{totalItems}</span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Paid</span>
            <span className="text-sm font-bold text-emerald-600">{formatPrice(total)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white capitalize">
              {payment === "cod" ? "Cash on Delivery" : payment === "bank" ? "Bank Transfer" : "Card"}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <Link href="/"
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm text-center transition-colors"
          >
            Back to Home
          </Link>
          <Link href="/shop"
            className="flex-1 py-3 border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl font-semibold text-sm text-center transition-colors"
          >
            Shop More
          </Link>
        </div>
      </div>
    );
  }

  /* ── Order Summary sidebar ─────────────────────────────────────────── */
  function OrderSummary() {
    return (
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
            Order Summary
          </h3>
          <span className="text-xs text-slate-400">{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
        </div>
        {/* Items */}
        <div className="px-5 py-4 space-y-4 max-h-72 overflow-y-auto">
          {items.map(item => (
            <div key={item.product.id} className="flex gap-3 items-start">
              <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-100 dark:border-slate-600">
                {item.product.thumbnail
                  ? <img src={item.product.thumbnail} alt={item.product.name} className="w-full h-full object-contain p-1" />
                  : <ShoppingBag size={16} className="text-slate-300 dark:text-slate-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-white line-clamp-2 leading-snug">
                  {item.product.name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Qty: {item.quantity}</p>
              </div>
              <div className="shrink-0 text-right">
                {(() => {
                  const eff  = parseFloat(getEffectivePrice(item.product, isLoggedIn));
                  const disp = parseFloat(getDisplayPrice(item.product));
                  const saved = disp - eff;
                  return (
                    <>
                      {saved > 0 && (
                        <p className="text-[10px] text-slate-400 line-through leading-none mb-0.5">
                          {formatPrice(disp * item.quantity)}
                        </p>
                      )}
                      <span className={cn("text-xs font-bold", saved > 0 ? "text-green-600 dark:text-green-400" : "text-slate-900 dark:text-white")}>
                        {formatPrice(eff * item.quantity)}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
        {/* Totals */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-medium text-slate-900 dark:text-white">{formatPrice(subtotal)}</span>
          </div>
          {clubSaving > 0 && (
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-medium">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                Clubcard Saving
              </span>
              <span className="font-semibold text-green-600 dark:text-green-400">-{formatPrice(clubSaving)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Shipping</span>
            <span className={cn("font-medium", shipping.price === 0 ? "text-green-600" : "text-slate-900 dark:text-white")}>
              {shipping.price === 0 ? "FREE" : formatPrice(shipping.price)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">VAT (20%)</span>
            <span className="font-medium text-slate-900 dark:text-white">{formatPrice(tax)}</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100 dark:border-slate-700">
            <span className="text-slate-900 dark:text-white">Total</span>
            <span className="text-blue-600 dark:text-blue-400 text-lg">{formatPrice(total)}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Progress bar ─────────────────────────────────────────────────── */
  const STEPS: { id: Step; label: string }[] = [
    { id: "info",    label: "Delivery" },
    { id: "payment", label: "Payment" },
    { id: "confirm", label: "Confirmed" },
  ];
  const stepIdx = STEPS.findIndex(s => s.id === step);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-8">
        <Link href="/" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Home</Link>
        <ChevronRight size={12} />
        <Link href="/shop" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Shop</Link>
        <ChevronRight size={12} />
        <span className="text-slate-700 dark:text-slate-200 font-medium">Checkout</span>
      </div>

      {/* Progress */}
      {step !== "confirm" && (
        <div className="flex items-center gap-0 mb-10 max-w-sm">
          {STEPS.filter(s => s.id !== "confirm").map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  i < stepIdx  ? "bg-blue-600 text-white" :
                  i === stepIdx ? "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40" :
                  "bg-gray-100 dark:bg-slate-800 text-slate-400"
                )}>
                  {i < stepIdx ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                <span className={cn("text-xs font-medium whitespace-nowrap", i === stepIdx ? "text-blue-600 dark:text-blue-400" : "text-slate-400")}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.filter(s => s.id !== "confirm").length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-2 -mt-5 transition-all", i < stepIdx ? "bg-blue-500" : "bg-gray-200 dark:bg-slate-700")} />
              )}
            </div>
          ))}
        </div>
      )}

      <div className={cn("grid gap-8", step === "confirm" ? "" : "lg:grid-cols-[1fr_380px]")}>
        {/* Main form area */}
        <div>
          {step === "info"    && InfoStep()}
          {step === "payment" && PaymentStep()}
          {step === "confirm" && ConfirmStep()}
        </div>

        {/* Order summary (hidden on confirm) */}
        {step !== "confirm" && (
          <div className="lg:sticky lg:top-24 lg:self-start">
            <OrderSummary />
          </div>
        )}
      </div>
    </div>
  );
}
