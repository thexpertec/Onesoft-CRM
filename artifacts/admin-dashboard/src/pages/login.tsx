import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff } from "lucide-react";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        setError("Invalid username or password.");
      }
    } finally {
      setLoading(false);
    }
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

        {/* Card */}
        <div className="bg-white dark:bg-card border border-gray-100 dark:border-border rounded-2xl p-7 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
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
                placeholder="admin"
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
              className="w-full h-10 mt-1 font-semibold"
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
