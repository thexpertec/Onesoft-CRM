import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ShoppingBag, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export default function LoginPage() {
  const { login, loading, error, session } = useAuth();
  const [, navigate] = useLocation();

  const [tenantId, setTenantId] = useState("");
  const [email, setEmail]       = useState("");
  const [phone, setPhone]       = useState("");
  const [showPhone, setShowPhone] = useState(false);

  useEffect(() => {
    if (session) { navigate("/"); return; }
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t") || params.get("tenant") || "";
    if (t) setTenantId(t);
  }, [session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await login(tenantId, email, phone);
    if (ok) navigate("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f4ff] to-[#f7f8fa] flex items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <ShoppingBag size={24} className="text-white" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Sign in to your account</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your details to access your orders and invoices.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Store ID</label>
              <input
                type="text"
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
                placeholder="e.g. demo-premier-2024"
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-400"
              />
              <p className="text-[11.5px] text-gray-400 mt-1">Your store will give you this ID.</p>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Phone number</label>
              <div className="relative">
                <input
                  type={showPhone ? "text" : "password"}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Your registered phone"
                  required
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPhone(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPhone ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-[11.5px] text-gray-400 mt-1">Used as your identity verification.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-[13px] text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-gray-400 mt-6">
          Don't have an account? Contact your store to get registered.
        </p>
      </div>
    </div>
  );
}
