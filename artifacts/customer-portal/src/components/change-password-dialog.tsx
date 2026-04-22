import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { fetchPortalAccounts, savePortalAccounts } from "@/lib/api";
import { hashPassword } from "@/lib/auth";

type Props = { open: boolean; onClose: () => void };

export function ChangePasswordDialog({ open, onClose }: Props) {
  const { session } = useAuth();

  const [current, setCurrent]         = useState("");
  const [next, setNext]               = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState("");
  const [done, setDone]               = useState(false);

  function reset() {
    setCurrent(""); setNext(""); setConfirm(""); setError("");
    setShowCurrent(false); setShowNext(false); setShowConfirm(false);
    setDone(false);
  }

  function close() { reset(); onClose(); }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!session) return;

    if (!current) { setError("Please enter your current password."); return; }
    if (next.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setError("New passwords don't match."); return; }
    if (next === current) { setError("New password must be different from current password."); return; }

    setBusy(true);
    try {
      const { tenantId, customer } = session;
      const email = (customer as { email?: string }).email ?? "";
      const normalizedEmail = email.toLowerCase().trim();

      const accounts = await fetchPortalAccounts(tenantId);
      const account  = accounts.find(a => a.email.toLowerCase().trim() === normalizedEmail);

      if (!account) { setError("Account not found. Please contact support."); return; }

      // Verify current password
      const currentHash = await hashPassword(current);
      if (account.passwordHash !== currentHash) {
        setError("Current password is incorrect.");
        return;
      }

      // Save new password
      const newHash    = await hashPassword(next);
      const updated    = accounts.map(a =>
        a.email.toLowerCase().trim() === normalizedEmail
          ? { ...a, passwordHash: newHash }
          : a
      );
      await savePortalAccounts(tenantId, updated);

      setDone(true);
      setTimeout(() => close(), 1800);
    } catch {
      setError("Failed to update password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[370px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <KeyRound size={15} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-gray-900">Change Password</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{session?.customer.name}</p>
          </div>
          <button
            onClick={close}
            className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-[18px] leading-none"
          >×</button>
        </div>

        {/* Body */}
        {done ? (
          <div className="flex flex-col items-center py-8 gap-3 px-5">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={22} className="text-emerald-500" />
            </div>
            <p className="text-[14px] font-semibold text-gray-800">Password updated!</p>
            <p className="text-[12px] text-gray-400 text-center">Your password has been changed successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

            {/* Current password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={current}
                  onChange={e => { setCurrent(e.target.value); setError(""); }}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  className="w-full h-9 px-3 pr-9 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <button type="button" onClick={() => setShowCurrent(v => !v)} tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">New Password</label>
              <div className="relative">
                <input
                  type={showNext ? "text" : "password"}
                  value={next}
                  onChange={e => { setNext(e.target.value); setError(""); }}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className="w-full h-9 px-3 pr-9 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <button type="button" onClick={() => setShowNext(v => !v)} tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showNext ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {next && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i <= strengthScore ? strengthColor : "bg-gray-200"}`} />
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
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(""); }}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className={`w-full h-9 px-3 pr-9 text-[13px] border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                    confirm && confirm !== next
                      ? "border-red-300 focus:ring-red-400"
                      : confirm && confirm === next
                      ? "border-emerald-300 focus:ring-emerald-400"
                      : "border-gray-200 focus:ring-blue-500 focus:border-blue-500"
                  }`}
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
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
              <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                <p className="text-[12px] text-red-600">{error}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="flex-1 h-9 text-[13px] font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !current || !next || !confirm || next !== confirm}
                className="flex-1 h-9 text-[13px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {busy
                  ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  : <><KeyRound size={13} /> Update</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
