import { useState, useEffect, useCallback } from "react";
import { User, Mail, Phone, MapPin, Lock, Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";
import { fetchPortalProfile, savePortalProfile, type PortalProfile } from "@/lib/api";

export default function ProfilePage() {
  const { session, tenantId, changePassword } = useAuth();
  const c = session?.customer;

  // ── Contact info form ────────────────────────────────────────────────────
  const [profile, setProfile] = useState<PortalProfile>({});
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Password form ────────────────────────────────────────────────────────
  const [currPass, setCurrPass]   = useState("");
  const [newPass, setNewPass]     = useState("");
  const [confPass, setConfPass]   = useState("");
  const [passMsg, setPassMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [passSaving, setPassSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!tenantId || !c) return;
    setProfileLoading(true);
    try {
      const p = await fetchPortalProfile(tenantId, c.id);
      setProfile({
        phone:      p.phone      ?? c.phone ?? "",
        address:    p.address    ?? "",
        city:       p.city       ?? c.city  ?? "",
        state:      p.state      ?? "",
        postalCode: p.postalCode ?? "",
      });
    } finally {
      setProfileLoading(false);
    }
  }, [tenantId, c]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !c) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await savePortalProfile(tenantId, c.id, profile);
      setProfileMsg({ ok: true, text: "Contact information saved." });
    } catch {
      setProfileMsg({ ok: false, text: "Failed to save. Please try again." });
    } finally {
      setProfileSaving(false);
      setTimeout(() => setProfileMsg(null), 4000);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPass.length < 8) { setPassMsg({ ok: false, text: "New password must be at least 8 characters." }); return; }
    if (newPass !== confPass) { setPassMsg({ ok: false, text: "Passwords do not match." }); return; }
    setPassSaving(true);
    setPassMsg(null);
    const res = await changePassword(currPass, newPass);
    setPassSaving(false);
    if (res.ok) {
      setPassMsg({ ok: true, text: "Password changed successfully." });
      setCurrPass(""); setNewPass(""); setConfPass("");
    } else {
      setPassMsg({ ok: false, text: res.error ?? "Failed to change password." });
    }
    setTimeout(() => setPassMsg(null), 5000);
  }

  if (!c) return null;

  const initials = c.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-[20px] font-bold text-gray-900">My Profile</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Manage your contact details and password.</p>
      </div>

      <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
        {/* Avatar card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center sm:w-[200px]">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white text-[22px] font-bold flex items-center justify-center mx-auto mb-3">
            {initials}
          </div>
          <p className="text-[15px] font-semibold text-gray-900">{c.name}</p>
          {c.company && <p className="text-[12.5px] text-gray-500 mt-0.5">{c.company}</p>}
          <span className={`inline-flex mt-2 items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border ${
            c.status === "Active"   ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : c.status === "Inactive" ? "bg-gray-100 text-gray-600 border-gray-200"
            : "bg-red-50 text-red-600 border-red-200"
          }`}>
            {c.status}
          </span>
          <p className="text-[11px] text-gray-400 mt-3 break-all">{c.email}</p>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* ── Contact info ─────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <User size={15} className="text-blue-600" />
              <h2 className="text-[14px] font-semibold text-gray-900">Contact Information</h2>
            </div>

            {profileLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (
              <form onSubmit={handleSaveProfile} className="p-5 space-y-4">
                {/* Row: Phone + Email */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 mb-1.5">
                      <Phone size={12} /> Phone
                    </label>
                    <input
                      type="tel"
                      value={profile.phone ?? ""}
                      onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+44 1234 567890"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 mb-1.5">
                      <Mail size={12} /> Email
                    </label>
                    <input
                      type="email"
                      value={c.email}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13.5px] bg-gray-50 text-gray-500 cursor-not-allowed"
                      title="Email address cannot be changed"
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 mb-1.5">
                    <MapPin size={12} /> Street Address
                  </label>
                  <input
                    type="text"
                    value={profile.address ?? ""}
                    onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                    placeholder="123 Main Street, Apt 4B"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Row: City + State + Postal */}
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium text-gray-500 mb-1.5">City</label>
                    <input
                      type="text"
                      value={profile.city ?? ""}
                      onChange={e => setProfile(p => ({ ...p, city: e.target.value }))}
                      placeholder="Hull"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-gray-500 mb-1.5">State / County</label>
                    <input
                      type="text"
                      value={profile.state ?? ""}
                      onChange={e => setProfile(p => ({ ...p, state: e.target.value }))}
                      placeholder="East Yorkshire"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-gray-500 mb-1.5">Postal Code</label>
                    <input
                      type="text"
                      value={profile.postalCode ?? ""}
                      onChange={e => setProfile(p => ({ ...p, postalCode: e.target.value }))}
                      placeholder="HU1 1AA"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Feedback */}
                {profileMsg && (
                  <div className={`flex items-center gap-2 text-[13px] rounded-lg px-3 py-2 ${
                    profileMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {profileMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {profileMsg.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[13.5px] font-semibold rounded-lg transition-colors"
                  >
                    {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {profileSaving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ── Change password ───────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Lock size={15} className="text-blue-600" />
              <h2 className="text-[14px] font-semibold text-gray-900">Change Password</h2>
            </div>

            <form onSubmit={handleChangePassword} className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-500 mb-1.5">Current Password</label>
                <input
                  type="password"
                  value={currPass}
                  onChange={e => setCurrPass(e.target.value)}
                  placeholder="Enter current password"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-gray-500 mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-gray-500 mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    value={confPass}
                    onChange={e => setConfPass(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {passMsg && (
                <div className={`flex items-center gap-2 text-[13px] rounded-lg px-3 py-2 ${
                  passMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                             : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {passMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {passMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={passSaving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[13.5px] font-semibold rounded-lg transition-colors"
                >
                  {passSaving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  {passSaving ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </Layout>
  );
}
