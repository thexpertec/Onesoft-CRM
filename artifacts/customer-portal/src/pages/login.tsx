import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ShoppingBag, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

type Tab = "signin" | "signup";

export default function LoginPage() {
  const { login, signup, loading, error, clearError, session, tenantId, settings } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab]               = useState<Tab>("signin");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [showConf, setShowConf]     = useState(false);
  const [localErr, setLocalErr]     = useState("");

  useEffect(() => { if (session) navigate("/"); }, [session, navigate]);

  function switchTab(t: Tab) {
    setTab(t);
    setLocalErr("");
    clearError();
    setPassword("");
    setConfirm("");
    setShowPass(false);
    setShowConf(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr("");
    clearError();

    if (tab === "signup") {
      if (password.length < 8) { setLocalErr("Password must be at least 8 characters."); return; }
      if (password !== confirm) { setLocalErr("Passwords do not match."); return; }
      await signup(email, password);
    } else {
      await login(email, password);
    }
  }

  const storeName = settings.storeName || "Customer Portal";
  const displayError = localErr || error;

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f0f4ff] to-[#f7f8fa] flex items-center justify-center px-4">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <h1 className="text-[17px] font-bold text-gray-900 mb-2">Invalid portal link</h1>
          <p className="text-[13.5px] text-gray-500">
            Please use the link provided by your store. The URL must include your store identifier.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f4ff] to-[#f7f8fa] flex items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-2">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <ShoppingBag size={24} className="text-white" />
          </div>
          <p className="text-[13.5px] font-medium text-gray-600">{storeName}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            {(["signin", "signup"] as Tab[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                className={`py-3.5 text-[14px] font-semibold transition-colors ${
                  tab === t
                    ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/30"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <div className="p-7">
            <p className="text-[13px] text-gray-500 mb-5">
              {tab === "signin"
                ? "Welcome back. Sign in to view your orders."
                : "Create your account to access your orders and invoices."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-400"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={tab === "signup" ? "At least 8 characters" : "Your password"}
                    required
                    autoComplete={tab === "signup" ? "new-password" : "current-password"}
                    className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password (sign-up only) */}
              {tab === "signup" && (
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Confirm password</label>
                  <div className="relative">
                    <input
                      type={showConf ? "text" : "password"}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      autoComplete="new-password"
                      className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConf(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              {displayError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-[13px] text-red-700 flex gap-2 items-start">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  {displayError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-1"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading
                  ? (tab === "signin" ? "Signing in…" : "Creating account…")
                  : (tab === "signin" ? "Sign In" : "Create Account")}
              </button>
            </form>

            <p className="text-center text-[12.5px] text-gray-400 mt-5">
              {tab === "signin" ? (
                <>Don't have an account?{" "}
                  <button onClick={() => switchTab("signup")} className="text-blue-600 hover:underline font-medium">Sign up</button>
                </>
              ) : (
                <>Already have an account?{" "}
                  <button onClick={() => switchTab("signin")} className="text-blue-600 hover:underline font-medium">Sign in</button>
                </>
              )}
            </p>
          </div>
        </div>

        {tab === "signup" && (
          <p className="text-center text-[11.5px] text-gray-400 mt-4 px-4">
            Create an account to track your orders and invoices.
          </p>
        )}
      </div>
    </div>
  );
}
