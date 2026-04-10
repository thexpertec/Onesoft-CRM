import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Lock, Eye, EyeOff, ShieldCheck, Users2,
  FlaskConical, ArrowRight, BarChart3, Package,
  ShoppingCart, FileText, Users, Building2, CheckCircle2,
  Sparkles, ChevronRight,
} from "lucide-react";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";
import { getTenants, Tenant } from "@/lib/store";
import { isTenantDataSeeded } from "@/lib/demo-seed";

type LoginType = "admin" | "staff";

const MODULE_ICONS = [BarChart3, Package, ShoppingCart, FileText, Users, Building2];

const FEATURES = [
  "CRM & Lead Management",
  "Inventory & Stock Control",
  "Sales, POS & Invoicing",
  "HRM & Payroll",
  "Manufacturing & BOM",
  "Accounting & Journal",
];

function DemoCard({
  tenant,
  index,
  onLogin,
}: {
  tenant: Tenant;
  index: number;
  onLogin: (u: string, p: string) => void;
}) {
  const gradients = [
    "from-violet-600 to-indigo-600",
    "from-teal-600 to-emerald-600",
    "from-orange-500 to-amber-500",
    "from-pink-600 to-rose-600",
    "from-blue-600 to-cyan-600",
  ];
  const grad = gradients[index % gradients.length];

  return (
    <button
      type="button"
      onClick={() => onLogin(tenant.adminUsername, tenant.adminPassword)}
      className="group w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-sm p-4 transition-all hover:border-white/20 hover:shadow-lg hover:shadow-black/20"
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
          <FlaskConical size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-white truncate">{tenant.name}</p>
            <ChevronRight size={13} className="flex-shrink-0 text-white/40 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-[11px] text-white/50 mt-0.5">
            Login: <span className="text-white/70 font-mono">{tenant.adminUsername}</span>
          </p>
          {tenant.plan && (
            <span className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded-full bg-white/10 text-white/60 text-[10px] font-medium capitalize">
              {tenant.plan}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

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
    const all = getTenants();
    setDemoTenants(all.filter(t => t.isDemo && isTenantDataSeeded(t.id)));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await login(username.trim(), password);
      if (ok) {
        const params = new URLSearchParams(window.location.search);
        navigate(params.get("from") || "/", { replace: true });
      } else {
        setError(
          loginType === "staff"
            ? "Invalid staff credentials, or login is not enabled for this account."
            : "Invalid username or password."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const switchType = (t: LoginType) => {
    setLoginType(t); setUsername(""); setPassword(""); setError("");
  };

  const quickDemoLogin = async (u: string, p: string) => {
    setError("");
    setLoading(true);
    try {
      const ok = await login(u, p);
      if (ok) {
        const params = new URLSearchParams(window.location.search);
        navigate(params.get("from") || "/", { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── LEFT — Demo Showcase ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col overflow-hidden"
           style={{ background: "linear-gradient(145deg, #0f172a 0%, #1e1b4b 40%, #0c1445 70%, #0f172a 100%)" }}>

        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-violet-700/20 blur-3xl" />
          <div className="absolute top-1/2 -right-24 w-80 h-80 rounded-full bg-indigo-600/15 blur-3xl" />
          <div className="absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-blue-800/20 blur-3xl" />
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.03]"
               style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "48px 48px" }} />
        </div>

        <div className="relative flex flex-col h-full p-10 xl:p-14">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <img src={logoUrl} alt="Onesoft" className="h-8 w-auto brightness-0 invert opacity-90" />
          </div>

          {/* Hero copy */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/20 border border-violet-400/30 mb-5">
              <Sparkles size={11} className="text-violet-300" />
              <span className="text-[11px] font-semibold text-violet-300 uppercase tracking-wider">Live Demo Environment</span>
            </div>

            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
              Explore Onesoft<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
                in full detail
              </span>
            </h2>

            <p className="text-white/60 text-[14px] leading-relaxed max-w-sm">
              Click any demo branch below to instantly sign in and explore a fully seeded,
              real-world company — no setup required.
            </p>
          </div>

          {/* Animated feature ticker */}
          <div className="flex items-center gap-2.5 mb-8 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
            <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
            <span className="text-[12px] text-white/70 font-medium transition-all">
              {FEATURES[featureTick]}
            </span>
            <div className="ml-auto flex gap-1">
              {FEATURES.map((_, i) => (
                <div key={i} className={`w-1 h-1 rounded-full transition-colors ${i === featureTick ? "bg-violet-400" : "bg-white/20"}`} />
              ))}
            </div>
          </div>

          {/* Demo tenant cards */}
          {demoTenants.length > 0 ? (
            <div className="space-y-2.5 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">
                Active Demo Branches
              </p>
              {demoTenants.map((t, i) => (
                <DemoCard key={t.id} tenant={t} index={i} onLogin={quickDemoLogin} />
              ))}
              <p className="text-[11px] text-white/30 mt-4 text-center">
                Demo data resets automatically — feel free to explore freely.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <FlaskConical size={22} className="text-white/30" />
              </div>
              <p className="text-white/40 text-[13px] font-medium mb-1">No demos available yet</p>
              <p className="text-white/25 text-[12px] leading-relaxed max-w-xs">
                Ask your administrator to enable a demo branch so visitors can explore the system.
              </p>
            </div>
          )}

          {/* Feature icon row */}
          <div className="mt-10 pt-8 border-t border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold mb-4">Everything your business needs</p>
            <div className="grid grid-cols-3 gap-2">
              {MODULE_ICONS.map((Icon, i) => (
                <div key={i} className="flex items-center gap-2 text-white/40 text-[11px]">
                  <Icon size={12} className="text-white/30" />
                  {["Analytics","Inventory","POS","Documents","HRM","Accounts"][i]}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── RIGHT — Login Form ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-background p-6 sm:p-10">
        <div className="w-full max-w-sm">

          {/* Logo (mobile only) */}
          <div className="lg:hidden text-center mb-8">
            <img src={logoUrl} alt="Onesoft" className="h-9 w-auto mx-auto mb-4 dark:brightness-0 dark:invert" />
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-foreground">
              Sign in
            </h1>
            <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
              Access your Onesoft dashboard
            </p>
          </div>

          {/* Login type selector */}
          <div className="flex rounded-xl border border-gray-200 dark:border-border overflow-hidden mb-5 bg-white dark:bg-card shadow-sm">
            <button
              type="button"
              onClick={() => switchType("admin")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold transition-colors ${
                loginType === "admin"
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted"
              }`}
            >
              <ShieldCheck size={14} />Admin
            </button>
            <button
              type="button"
              onClick={() => switchType("staff")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold transition-colors ${
                loginType === "staff"
                  ? "bg-teal-600 text-white"
                  : "text-gray-500 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted"
              }`}
            >
              <Users2 size={14} />Staff
            </button>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-card border border-gray-100 dark:border-border rounded-2xl p-7 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">

            {/* Role badge */}
            <div className={`flex items-center gap-2 mb-5 px-3 py-2 rounded-lg text-[12px] font-medium ${
              loginType === "admin"
                ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900"
                : "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-900"
            }`}>
              {loginType === "admin" ? <ShieldCheck size={13} /> : <Users2 size={13} />}
              {loginType === "admin"
                ? "Logging in as Administrator"
                : "Logging in as Staff Member — access is based on your assigned role"}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-gray-700 dark:text-foreground" htmlFor="username">
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={loginType === "admin" ? "admin" : "your.username"}
                  className="h-10 text-sm"
                  data-testid="input-username"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-gray-700 dark:text-foreground" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 text-sm pr-10"
                    data-testid="input-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-muted-foreground dark:hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900">
                  <p className="text-[12px] text-red-600 dark:text-red-400 font-medium" data-testid="login-error">
                    {error}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className={`w-full h-10 mt-1 font-semibold ${
                  loginType === "staff" ? "bg-teal-600 hover:bg-teal-700 text-white" : ""
                }`}
                disabled={loading}
                data-testid="btn-login"
              >
                <Lock className="mr-2 h-3.5 w-3.5" />
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </div>

          {/* Mobile demo quick links */}
          {demoTenants.length > 0 && (
            <div className="lg:hidden mt-6">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-3 text-center">
                Or try a live demo
              </p>
              <div className="space-y-2">
                {demoTenants.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => quickDemoLogin(t.adminUsername, t.adminPassword)}
                    disabled={loading}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[13px] font-medium transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <FlaskConical size={13} />
                      {t.name}
                    </span>
                    <ArrowRight size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-gray-400 dark:text-muted-foreground mt-6">
            Onesoft Admin Portal &mdash; Authorised access only
          </p>
        </div>
      </div>

    </div>
  );
}
