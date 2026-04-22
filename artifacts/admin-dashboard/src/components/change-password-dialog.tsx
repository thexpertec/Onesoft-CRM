import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  getAdminUsers, updateAdminUser,
  getStaff, updateStaff,
  getSalesAgents, updateSalesAgent,
  getTenants, updateTenant,
} from "@/lib/store";

type Props = { open: boolean; onClose: () => void };

export function ChangePasswordDialog({ open, onClose }: Props) {
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const [current, setCurrent]       = useState("");
  const [next, setNext]             = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState("");
  const [done, setDone]             = useState(false);

  function reset() {
    setCurrent(""); setNext(""); setConfirm(""); setError("");
    setShowCurrent(false); setShowNext(false); setShowConfirm(false);
    setDone(false);
  }

  function close() { reset(); onClose(); }

  function getStoredPassword(): string {
    if (!currentUser) return "";
    const role = currentUser.role;
    if (role === "superadmin" || role === "manager") {
      return getAdminUsers().find(u => u.id === currentUser.id)?.password ?? "";
    }
    if (role === "admin") {
      return getTenants().find(t => t.id === currentUser.id)?.adminPassword ?? "";
    }
    if (role === "staff") {
      return getStaff().find(s => s.id === currentUser.id)?.password ?? "";
    }
    if (role === "sales_agent") {
      return getSalesAgents().find(a => a.id === currentUser.id)?.password ?? "";
    }
    return "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!currentUser) return;

    if (!current) { setError("Please enter your current password."); return; }
    if (next.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setError("New passwords don't match."); return; }
    if (next === current) { setError("New password must be different from current password."); return; }

    const stored = getStoredPassword();
    if (!stored || current !== stored) {
      setError("Current password is incorrect.");
      return;
    }

    setBusy(true);
    try {
      const role = currentUser.role;
      if (role === "superadmin" || role === "manager") {
        updateAdminUser(currentUser.id, { password: next });
      } else if (role === "admin") {
        updateTenant(currentUser.id, { adminPassword: next });
      } else if (role === "staff") {
        updateStaff(currentUser.id, { password: next });
      } else if (role === "sales_agent") {
        updateSalesAgent(currentUser.id, { password: next });
      }
      setDone(true);
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      setTimeout(() => close(), 1800);
    } catch {
      setError("Failed to update password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const strengthScore = (() => {
    if (!next) return 0;
    let s = 0;
    if (next.length >= 8) s++;
    if (/[A-Z]/.test(next)) s++;
    if (/[0-9]/.test(next)) s++;
    if (/[^A-Za-z0-9]/.test(next)) s++;
    return s;
  })();
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strengthScore];
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-blue-400", "bg-emerald-500"][strengthScore];

  return (
    <Dialog open={open} onOpenChange={v => !v && close()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center">
              <KeyRound size={14} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            Change Password
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Logged in as <span className="font-semibold text-gray-700 dark:text-gray-300">{currentUser?.fullName || currentUser?.username}</span>
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle2 size={22} className="text-emerald-500" />
            </div>
            <p className="text-[13px] font-semibold text-gray-800 dark:text-white">Password updated!</p>
            <p className="text-[12px] text-gray-400 dark:text-gray-500">Your password has been changed successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">

            {/* Current password */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                Current Password
              </label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={current}
                  onChange={e => { setCurrent(e.target.value); setError(""); }}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  className="pr-9 text-[13px] h-9"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                New Password
              </label>
              <div className="relative">
                <Input
                  type={showNext ? "text" : "password"}
                  value={next}
                  onChange={e => { setNext(e.target.value); setError(""); }}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className="pr-9 text-[13px] h-9"
                />
                <button
                  type="button"
                  onClick={() => setShowNext(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showNext ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {/* Strength bar */}
              {next && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i <= strengthScore ? strengthColor : "bg-gray-200 dark:bg-zinc-700"}`} />
                    ))}
                  </div>
                  <p className={`text-[10px] font-medium ${strengthScore <= 1 ? "text-red-500" : strengthScore === 2 ? "text-amber-500" : strengthScore === 3 ? "text-blue-500" : "text-emerald-500"}`}>
                    {strengthLabel}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                Confirm New Password
              </label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(""); }}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className={`pr-9 text-[13px] h-9 ${confirm && confirm !== next ? "border-red-400 focus-visible:ring-red-400" : confirm && confirm === next ? "border-emerald-400 focus-visible:ring-emerald-400" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {confirm && next && confirm !== next && (
                <p className="text-[11px] text-red-500">Passwords don't match</p>
              )}
              {confirm && next && confirm === next && (
                <p className="text-[11px] text-emerald-500 flex items-center gap-1"><CheckCircle2 size={11} /> Passwords match</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40">
                <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={close} disabled={busy} className="text-[13px]">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busy || !current || !next || !confirm || next !== confirm}
                className="text-[13px] gap-1.5"
              >
                {busy
                  ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  : <><KeyRound size={13} /> Update Password</>}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
