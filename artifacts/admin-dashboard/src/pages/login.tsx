import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Lock, Eye, EyeOff, ShieldCheck, Users2,
  FlaskConical, CheckCircle2, Sparkles, ChevronRight,
} from "lucide-react";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";
import { getTenants, Tenant } from "@/lib/store";
import { isTenantDataSeeded } from "@/lib/demo-seed";

type LoginType = "admin" | "staff";

const FEATURES = [
  "CRM & Lead Management",
  "Inventory & Stock Control",
  "Sales, POS & Invoicing",
  "HRM & Payroll",
  "Manufacturing & BOM",
  "Accounting & Journal Entry",
];

const CARD_GRADIENTS = [
  "from-violet-600 to-indigo-600",
  "from-teal-500 to-emerald-600",
  "from-orange-500 to-amber-500",
  "from-pink-600 to-rose-600",
  "from-blue-500 to-cyan-600",
];

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [loginType,    setLoginType]    = useState<LoginType>("admin");
  const [username,     setUsername]     = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [demoTenants,  setDemoTenants]  = useState<Tenant[]>([]);
  const [featureTick,  setFeatureTick]  = useState(0);

  useEffect(() => {
    setDemoTenants(getTenants().filter(t => t.isDemo && isTenantDataSeeded(t.id)));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setFeatureTick(n => (n + 1) % FEATURES.length), 2800);
    return () => clearInterval(id);
  }, []);

  if (isAuthenticated) {
    const params = new URLSearchParams(window.location.search);
    navigate(params.get("from") || "/", { replace: true });
    return null;
  }

  const doLogin = async (u: string, p: string) => {
    setError(""); setLoading(true);
    try {
      const ok = await login(u, p);
      if (ok) {
        const params = new URLSearchParams(window.location.search);
        navigate(params.get("from") || "/", { replace: true });
      } else {
        setError(loginType === "staff"
          ? "Invalid staff credentials, or login is not enabled for this account."
          : "Invalid username or password.");
      }
    } finally { setLoading(false); }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); doLogin(username.trim(), password); };
  const switchType   = (t: LoginType) => { setLoginType(t); setUsername(""); setPassword(""); setError(""); };

  return (
    <div className="h-screen w-screen flex overflow-hidden">

      {/* ── LEFT — Demo Showcase ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col overflow-hidden relative"
        style={{ background: "linear-gradient(145deg,#0f172a 0%,#1e1b4b 40%,#0c1445 70%,#0f172a 100%)" }}
      >
        {/* Subtle bg blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-28 -left-28 w-80 h-80 rounded-full bg-violet-700/20 blur-3xl" />
          <div className="absolute top-1/2 -right-20 w-72 h-72 rounded-full bg-indigo-600/15 blur-3xl" />
          <div className="absolute -bottom-20 left-1/3 w-64 h-64 rounded-full bg-blue-800/20 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "48px 48px" }} />
        </div>

        {/* Content — fixed padding, no scroll */}
        <div className="relative flex flex-col h-full px-10 py-8 xl:px-14 xl:py-10">

          {/* Logo */}
          <img src={logoUrl} alt="Onesoft" className="h-7 w-auto brightness-0 invert opacity-90 mb-8 self-start" />

          {/* Badge + headline */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 mb-4">
              <Sparkles size={10} className="text-violet-300" />
              <span className="text-[10px] font-bold text-violet-300 uppercase tracking-widest">Live Demo Environment</span>
            </div>
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
              Explore Onesoft<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
                in full detail
              </span>
            </h2>
            <p className="text-white/55 text-[13px] leading-relaxed mt-3 max-w-xs">
              Click any demo branch below to instantly sign in and explore a fully seeded, real-world company — no setup required.
            </p>
          </div>

          {/* Animated feature ticker */}
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 mb-5">
            <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
            <span className="text-[12px] text-white/70 font-medium flex-1">{FEATURES[featureTick]}</span>
            <div className="flex gap-1 flex-shrink-0">
              {FEATURES.map((_, i) => (
                <div key={i} className={`w-1 h-1 rounded-full transition-colors duration-300 ${i === featureTick ? "bg-violet-400" : "bg-white/20"}`} />
              ))}
            </div>
          </div>

          {/* Demo tenant cards — or empty state */}
          <div className="flex-1 flex flex-col min-h-0">
            {demoTenants.length > 0 ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2.5">
                  Active Demo Branches
                </p>
                <div className="space-y-2 overflow-y-auto flex-1 pr-1"
                     style={{ scrollbarWidth: "none" }}>
                  {demoTenants.map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => doLogin(t.adminUsername, t.adminPassword)}
                      disabled={loading}
                      className="group w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 px-4 py-3 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]} flex items-center justify-center flex-shrink-0`}>
                          <FlaskConical size={13} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">{t.name}</p>
                          <p className="text-[11px] text-white/45">
                            Login: <span className="text-white/65 font-mono">{t.adminUsername}</span>
                            {t.plan && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 text-[10px] capitalize">{t.plan}</span>}
                          </p>
                        </div>
                        <ChevronRight size={13} className="text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-white/25 text-center mt-3">
                  Demo data resets automatically — explore freely.
                </p>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                  <FlaskConical size={20} className="text-white/25" />
                </div>
                <p className="text-white/35 text-[13px] font-medium">No demos available yet</p>
                <p className="text-white/20 text-[12px] mt-1 max-w-[220px] leading-relaxed">
                  Enable a demo branch in Tenants settings to let visitors explore.
                </p>
              </div>
            )}
          </div>

          {/* Bottom module row */}
          <div className="mt-6 pt-5 border-t border-white/10 flex-shrink-0">
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
              {["Analytics","Inventory","Sales & POS","Documents","HRM","Accounts"].map(m => (
                <span key={m} className="text-[10px] text-white/30 font-medium">· {m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT — Login Form ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-background overflow-hidden px-6 sm:px-10">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-6">
            <img src={logoUrl} alt="Onesoft" className="h-8 w-auto mx-auto dark:brightness-0 dark:invert" />
          </div>

          {/* Heading */}
          <div className="mb-5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-foreground">Sign in</h1>
            <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">Access your Onesoft dashboard</p>
          </div>

          {/* Type tabs */}
          <div className="flex rounded-xl border border-gray-200 dark:border-border overflow-hidden mb-4 bg-white dark:bg-card shadow-sm">
            {(["admin","staff"] as LoginType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => switchType(t)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold transition-colors ${
                  loginType === t
                    ? t === "admin" ? "bg-blue-600 text-white" : "bg-teal-600 text-white"
                    : "text-gray-500 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted"
                }`}
              >
                {t === "admin" ? <ShieldCheck size={14} /> : <Users2 size={14} />}
                {t === "admin" ? "Admin" : "Staff"}
              </button>
            ))}
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-card border border-gray-100 dark:border-border rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">

            {/* Role badge */}
            <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-[12px] font-medium ${
              loginType === "admin"
                ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900"
                : "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-900"
            }`}>
              {loginType === "admin" ? <ShieldCheck size={13} /> : <Users2 size={13} />}
              {loginType === "admin" ? "Logging in as Administrator" : "Logging in as Staff Member"}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-gray-700 dark:text-foreground" htmlFor="username">Username</label>
                <Input
                  id="username" type="text" autoComplete="username"
                  value={username} onChange={e => setUsername(e.target.value)}
                  placeholder={loginType === "admin" ? "admin" : "your.username"}
                  className="h-10 text-sm" data-testid="input-username" required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-gray-700 dark:text-foreground" htmlFor="password">Password</label>
                <div className="relative">
                  <Input
                    id="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" className="h-10 text-sm pr-10"
                    data-testid="input-password" required
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-muted-foreground dark:hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900">
                  <p className="text-[12px] text-red-600 dark:text-red-400 font-medium" data-testid="login-error">{error}</p>
                </div>
              )}

              <Button type="submit"
                className={`w-full h-10 mt-1 font-semibold ${loginType === "staff" ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}`}
                disabled={loading} data-testid="btn-login">
                <Lock className="mr-2 h-3.5 w-3.5" />
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </div>

          {/* Mobile demo quick links */}
          {demoTenants.length > 0 && (
            <div className="lg:hidden mt-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold text-center mb-2">Or try a live demo</p>
              {demoTenants.map((t, i) => (
                <button key={t.id} type="button" onClick={() => doLogin(t.adminUsername, t.adminPassword)} disabled={loading}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors">
                  <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]} flex items-center justify-center flex-shrink-0`}>
                    <FlaskConical size={11} className="text-white" />
                  </div>
                  <span className="text-[12px] font-medium text-violet-700 dark:text-violet-300 flex-1 text-left truncate">{t.name}</span>
                  <ChevronRight size={12} className="text-violet-400" />
                </button>
              ))}
            </div>
          )}

          <p className="text-center text-[11px] text-gray-400 dark:text-muted-foreground mt-4">
            Onesoft Admin Portal &mdash; Authorised access only
          </p>
        </div>
      </div>

    </div>
  );
}
