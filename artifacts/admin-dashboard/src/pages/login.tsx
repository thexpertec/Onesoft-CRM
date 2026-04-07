import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff, ShieldCheck, Users2 } from "lucide-react";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";

type LoginType = "admin" | "staff";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [loginType,    setLoginType]    = useState<LoginType>("admin");
  const [username,     setUsername]     = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  if (isAuthenticated) {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from") || "/";
    navigate(from, { replace: true });
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
        const from = params.get("from") || "/";
        navigate(from, { replace: true });
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
    setLoginType(t);
    setUsername("");
    setPassword("");
    setError("");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo + heading */}
        <div className="text-center mb-8">
          <img src={logoUrl} alt="Onesoft" className="h-10 w-auto mx-auto mb-5 dark:brightness-0 dark:invert" />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-foreground">
            Admin Portal
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1.5">
            Sign in to access the dashboard
          </p>
        </div>

        {/* Login type selector */}
        <div className="flex rounded-xl border border-gray-200 dark:border-border overflow-hidden mb-4 bg-white dark:bg-card shadow-sm">
          <button
            type="button"
            onClick={() => switchType("admin")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold transition-colors ${
              loginType === "admin"
                ? "bg-blue-600 text-white"
                : "text-gray-500 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted"
            }`}
          >
            <ShieldCheck size={14} />
            Admin
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
            <Users2 size={14} />
            Staff
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
                  onClick={() => setShowPassword((v) => !v)}
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
                loginType === "staff"
                  ? "bg-teal-600 hover:bg-teal-700 text-white"
                  : ""
              }`}
              disabled={loading}
              data-testid="btn-login"
            >
              <Lock className="mr-2 h-3.5 w-3.5" />
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-muted-foreground mt-6">
          Onesoft Admin Portal &mdash; Authorised access only
        </p>
      </div>
    </div>
  );
}
