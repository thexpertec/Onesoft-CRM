import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { Wrench, CheckCircle2, Clock, AlertCircle, FlaskConical, FileText, Package, Settings2, Truck, Phone, MessageSquare, Calendar, MapPin, ExternalLink } from "lucide-react";

interface RepairBooking {
  id: string;
  name: string;
  service: string;
  deviceIssue?: string;
  status: string;
  priority?: string;
  estimatedDate?: string;
  publicNote?: string;
  createdAt: string;
  tenantId?: string;
}

interface ShopSettings {
  companyName?: string;
  phoneHull?: string;
  phoneIslamabad?: string;
  emailHull?: string;
  emailIslamabad?: string;
  addressHull?: string;
  addressIslamabad?: string;
  website?: string;
  logoBase64?: string;
  receiptFooter?: string;
}

const STATUSES = [
  { key: "New",            label: "Received",   icon: AlertCircle,  color: "#3b82f6" },
  { key: "Diagnosing",     label: "Diagnosing",  icon: FlaskConical, color: "#8b5cf6" },
  { key: "Quoted",         label: "Quoted",      icon: FileText,     color: "#6366f1" },
  { key: "Awaiting Parts", label: "Parts",       icon: Package,      color: "#f97316" },
  { key: "In Repair",      label: "Repairing",   icon: Settings2,    color: "#f59e0b" },
  { key: "Ready",          label: "Ready",       icon: Truck,        color: "#14b8a6" },
  { key: "Completed",      label: "Completed",   icon: CheckCircle2, color: "#10b981" },
];

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "Urgent": { bg: "#fef2f2", text: "#dc2626", label: "Urgent" },
  "High":   { bg: "#fff7ed", text: "#ea580c", label: "High"   },
  "Normal": { bg: "#eff6ff", text: "#2563eb", label: "Normal" },
  "Low":    { bg: "#f9fafb", text: "#6b7280", label: "Low"    },
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function RepairTrackPage() {
  const search = useSearch();
  const id = new URLSearchParams(search).get("id");

  const [booking, setBooking]   = useState<RepairBooking | null>(null);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No repair job ID provided.");
      setLoading(false);
      return;
    }
    fetch(`/api/public/repair/${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(data => {
        if (data.booking) {
          setBooking(data.booking as RepairBooking);
          const tid = data.booking.tenantId;
          if (tid) {
            fetch(`/api/kv/t:${encodeURIComponent(tid)}/admin-settings`)
              .then(r => r.json())
              .then(s => { if (s?.value) setSettings(s.value as ShopSettings); })
              .catch(() => {});
          }
        } else {
          setError("Repair job not found. Please check your job card.");
        }
      })
      .catch(() => setError("Could not load repair job. Please try again."))
      .finally(() => setLoading(false));
  }, [id]);

  const currentIdx = booking ? STATUSES.findIndex(s => s.key === booking.status) : -1;
  const phone = settings?.phoneHull || settings?.phoneIslamabad || "";
  const address = settings?.addressHull || settings?.addressIslamabad || "";
  const companyName = settings?.companyName || "Repair Shop";
  const pr = PRIORITY_COLORS[booking?.priority ?? "Normal"] ?? PRIORITY_COLORS["Normal"];
  const statusMeta = booking ? STATUSES[currentIdx] ?? STATUSES[0] : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Wrench size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">
                {settings?.companyName ?? "Repair Tracking"}
              </p>
              <p className="text-slate-400 text-xs">Repair job status</p>
            </div>
          </div>
          {settings?.logoBase64 && (
            <img src={settings.logoBase64} alt="Logo" className="h-9 w-auto rounded" />
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <p className="text-slate-400 text-sm">Loading your repair status…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-950/40 border border-red-800 rounded-2xl p-6 text-center">
            <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
            <p className="text-red-300 font-semibold mb-1">Job not found</p>
            <p className="text-red-400/70 text-sm">{error}</p>
          </div>
        )}

        {/* Booking data */}
        {!loading && booking && (
          <>
            {/* Status banner */}
            {statusMeta && (
              <div className="rounded-2xl p-5 text-white" style={{ background: statusMeta.color }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-white/80 text-xs font-semibold uppercase tracking-wider">Current Status</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20">
                    Step {currentIdx + 1} of {STATUSES.length}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 mt-1">
                  <statusMeta.icon size={26} className="flex-shrink-0" />
                  <p className="text-2xl font-black">{booking.status}</p>
                </div>
                {booking.estimatedDate && (
                  <p className="text-white/80 text-xs mt-2 flex items-center gap-1">
                    <Calendar size={11} />
                    Est. completion: <strong className="text-white">{formatDate(booking.estimatedDate)}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Pipeline */}
            <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Repair Progress</p>
              <div className="flex items-start gap-1">
                {STATUSES.map((s, i) => {
                  const done    = i <  currentIdx;
                  const active  = i === currentIdx;
                  const pending = i >  currentIdx;
                  return (
                    <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          background: done || active ? s.color : "#334155",
                          boxShadow: active ? `0 0 0 3px ${s.color}40` : undefined,
                        }}
                      >
                        {done ? (
                          <CheckCircle2 size={13} className="text-white" />
                        ) : (
                          <s.icon size={12} className={active ? "text-white" : "text-slate-500"} />
                        )}
                      </div>
                      <p
                        className="text-center leading-tight"
                        style={{
                          fontSize: "8px",
                          fontWeight: active ? 700 : 400,
                          color: pending ? "#64748b" : "#e2e8f0",
                        }}
                      >
                        {s.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Public note */}
            {booking.publicNote && (
              <div className="bg-amber-950/40 border border-amber-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare size={14} className="text-amber-400" />
                  <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Update from the shop</p>
                </div>
                <p className="text-amber-100 text-sm leading-relaxed">{booking.publicNote}</p>
              </div>
            )}

            {/* Job details */}
            <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Job Details</p>
              </div>
              <div className="divide-y divide-slate-700/40">
                {[
                  { label: "Job Reference",  value: booking.id.slice(0, 8).toUpperCase(), mono: true },
                  { label: "Your Name",      value: booking.name },
                  { label: "Service",        value: booking.service },
                  { label: "Received",       value: formatDateTime(booking.createdAt) },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="text-slate-400 text-sm">{label}</span>
                    <span className={`text-slate-100 text-sm font-semibold text-right ${mono ? "font-mono" : ""}`}>{value}</span>
                  </div>
                ))}
                {booking.priority && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-slate-400 text-sm">Priority</span>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: pr.bg, color: pr.text }}>
                      {pr.label}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Issue description */}
            {booking.deviceIssue && (
              <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 p-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Issue Reported</p>
                <p className="text-slate-200 text-sm leading-relaxed">{booking.deviceIssue}</p>
              </div>
            )}

            {/* Contact shop */}
            {(phone || address) && (
              <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 p-4 space-y-3">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{companyName}</p>
                {phone && (
                  <a
                    href={`tel:${phone.replace(/\s+/g, "")}`}
                    className="flex items-center gap-3 p-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-colors"
                  >
                    <Phone size={18} className="text-white flex-shrink-0" />
                    <div>
                      <p className="text-white font-bold text-sm">Call Us</p>
                      <p className="text-blue-200 text-xs">{phone}</p>
                    </div>
                    <ExternalLink size={14} className="text-blue-200 ml-auto" />
                  </a>
                )}
                {phone && (
                  <a
                    href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white" className="flex-shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.553 4.118 1.522 5.853L0 24l6.293-1.499A11.96 11.96 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.004-1.366l-.359-.213-3.733.889.906-3.616-.234-.373A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
                    </svg>
                    <div>
                      <p className="text-white font-bold text-sm">WhatsApp Us</p>
                      <p className="text-emerald-200 text-xs">{phone}</p>
                    </div>
                    <ExternalLink size={14} className="text-emerald-200 ml-auto" />
                  </a>
                )}
                {address && (
                  <div className="flex items-start gap-3 px-1">
                    <MapPin size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <p className="text-slate-300 text-sm">{address}</p>
                  </div>
                )}
              </div>
            )}

            <p className="text-center text-slate-600 text-xs pb-4">
              Powered by Onesoft ERP · {settings?.website ?? ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
