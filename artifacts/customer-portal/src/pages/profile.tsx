import { User, Mail, Phone, MapPin, Calendar, Tag, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { fmtDate } from "@/lib/utils";
import { Layout } from "@/components/layout";

export default function ProfilePage() {
  const { session } = useAuth();
  const c = session?.customer;

  if (!c) return null;

  const initials = c.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-gray-900">My Profile</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Your account information.</p>
      </div>

      <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
        {/* Avatar card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center sm:w-[200px]">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white text-[22px] font-bold flex items-center justify-center mx-auto mb-3">
            {initials}
          </div>
          <p className="text-[15px] font-semibold text-gray-900">{c.name}</p>
          {c.company && <p className="text-[13px] text-gray-500 mt-0.5">{c.company}</p>}
          <span className={`inline-flex mt-2 items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border ${
            c.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : c.status === "Inactive" ? "bg-gray-100 text-gray-600 border-gray-200"
            : "bg-red-50 text-red-600 border-red-200"
          }`}>
            {c.status}
          </span>
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <Field icon={<User size={14} />}      label="Full name"       value={c.name} />
          <Field icon={<Building2 size={14} />} label="Company"        value={c.company || "—"} />
          <Field icon={<Mail size={14} />}      label="Email"          value={c.email || "—"} />
          <Field icon={<Phone size={14} />}     label="Phone"          value={c.phone || "—"} />
          <Field icon={<MapPin size={14} />}    label="City"           value={[c.city, c.area].filter(Boolean).join(", ") || "—"} />
          <Field icon={<Calendar size={14} />}  label="Customer since" value={fmtDate(c.customerSince)} />
          {c.customerType && (
            <Field icon={<Tag size={14} />}     label="Account type"   value={c.customerType} />
          )}
          {c.tags && c.tags.length > 0 && (
            <div className="flex items-start gap-3 px-5 py-3.5">
              <span className="text-gray-400 mt-0.5 shrink-0"><Tag size={14} /></span>
              <div>
                <p className="text-[12px] text-gray-400 mb-1">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.tags.map(tag => (
                    <span key={tag} className="bg-gray-100 text-gray-600 text-[12px] px-2 py-0.5 rounded-full border border-gray-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {c.notes && (
            <div className="px-5 py-3.5">
              <p className="text-[12px] text-gray-400 mb-1">Notes</p>
              <p className="text-[13.5px] text-gray-700">{c.notes}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-gray-400">{label}</p>
        <p className="text-[13.5px] text-gray-900 mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}
