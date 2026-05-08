import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Database, CheckCircle2, XCircle, ChevronDown, ChevronRight, Building2, Shield, Key, Clock, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = "/api/kv";

type NsSummary = { namespace: string; key_count: string; last_updated: string };
type Tenant    = { id: string; name: string; slug: string; plan?: string; status?: string; adminUsername?: string };
type AdminUser = { id: string; username: string; fullName?: string; role?: string; email?: string };

async function apiFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)  return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return iso;
  }
}

function JsonView({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(value, null, 2);
  const preview = json.slice(0, 120) + (json.length > 120 ? "…" : "");
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {open ? "Hide raw" : "Show raw JSON"}
      </button>
      {open && (
        <pre className="mt-1 text-[10px] bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg p-3 overflow-x-auto max-h-64 leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
          {preview !== json ? json : preview}
        </pre>
      )}
    </div>
  );
}

const PLAN_COLOR: Record<string, string> = {
  starter:    "bg-gray-100  text-gray-600  dark:bg-gray-800  dark:text-gray-300",
  basic:      "bg-blue-100  text-blue-700  dark:bg-blue-900  dark:text-blue-300",
  pro:        "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};
const STATUS_COLOR: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  trial:     "bg-amber-100   text-amber-700   dark:bg-amber-900   dark:text-amber-300",
  suspended: "bg-red-100     text-red-700     dark:bg-red-900     dark:text-red-300",
  inactive:  "bg-gray-100    text-gray-600    dark:bg-gray-800    dark:text-gray-300",
};

export default function DatabaseViewerPage() {
  const [loading,    setLoading]    = useState(true);
  const [connOk,     setConnOk]     = useState<boolean | null>(null);
  const [namespaces, setNamespaces] = useState<NsSummary[]>([]);
  const [tenants,    setTenants]    = useState<Tenant[]>([]);
  const [users,      setUsers]      = useState<AdminUser[]>([]);
  const [lastFetch,  setLastFetch]  = useState<Date | null>(null);
  const [nsOpen,     setNsOpen]     = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ns, global] = await Promise.all([
        apiFetch<NsSummary[]>(`${BASE}`),
        apiFetch<Record<string, unknown>>(`${BASE}/global`),
      ]);

      if (ns === null && global === null) {
        setConnOk(false);
        setNamespaces([]);
        setTenants([]);
        setUsers([]);
      } else {
        setConnOk(true);
        setNamespaces(ns ?? []);

        if (global) {
          const rawTenants = global["admin-tenants"];
          const rawUsers   = global["admin-users"];
          setTenants(Array.isArray(rawTenants) ? rawTenants as Tenant[] : []);
          setUsers(Array.isArray(rawUsers)   ? rawUsers   as AdminUser[] : []);
        }
      }
    } finally {
      setLoading(false);
      setLastFetch(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalKeys = namespaces.reduce((s, n) => s + Number(n.key_count), 0);
  const globalNs  = namespaces.find(n => n.namespace === "global");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
            <Database size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-gray-900 dark:text-foreground">Database</h1>
            <p className="text-[12px] text-muted-foreground">
              Live view of the KV store — reads directly from PostgreSQL
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock size={11} /> Fetched {timeAgo(lastFetch.toISOString())}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-9 gap-1.5 text-[13px]"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Connection banner */}
      {connOk === false && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-[13px]">
          <XCircle size={18} className="shrink-0" />
          <div>
            <span className="font-semibold">Cannot reach the API server.</span>{" "}
            Check that the API Server workflow is running and accessible at <code className="font-mono text-[11px]">/api/kv</code>.
          </div>
        </div>
      )}
      {connOk === true && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-[12px]">
          <CheckCircle2 size={14} className="shrink-0" />
          Connected to PostgreSQL — all reads live from the database (no cache)
        </div>
      )}

      {/* Stat row */}
      {connOk === true && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Namespaces",   value: namespaces.length,  color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Total Keys",   value: totalKeys,           color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950/30" },
            { label: "Tenants",      value: tenants.length,      color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Admin Users",  value: users.length,        color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/30" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-transparent`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tenants table */}
      {connOk === true && (
        <section className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 dark:border-border">
            <Building2 size={15} className="text-blue-500 shrink-0" />
            <span className="text-[13px] font-semibold text-gray-800 dark:text-foreground">
              Tenants
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground font-mono">
              global → admin-tenants ({tenants.length} records)
            </span>
          </div>

          {tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-300 dark:text-zinc-600">
              <Building2 size={36} strokeWidth={0.8} />
              <p className="text-[13px] text-gray-400 dark:text-zinc-500 font-medium">
                No tenants found in global → admin-tenants
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-muted/40">
                    {["#", "Name", "Slug", "Plan", "Status", "Admin User", "ID"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t, i) => (
                    <tr key={t.id} className="border-t border-gray-100 dark:border-border hover:bg-gray-50 dark:hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-muted-foreground font-mono">{i + 1}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800 dark:text-foreground">{t.name}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.slug}</td>
                      <td className="px-4 py-2.5">
                        {t.plan ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${PLAN_COLOR[t.plan] ?? PLAN_COLOR.basic}`}>
                            {t.plan}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {t.status ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${STATUS_COLOR[t.status] ?? STATUS_COLOR.inactive}`}>
                            {t.status}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.adminUsername ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground max-w-[120px] truncate" title={t.id}>{t.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Admin users table */}
      {connOk === true && (
        <section className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 dark:border-border">
            <Shield size={15} className="text-violet-500 shrink-0" />
            <span className="text-[13px] font-semibold text-gray-800 dark:text-foreground">
              Admin Users
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground font-mono">
              global → admin-users ({users.length} records)
            </span>
          </div>
          {users.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-gray-400 dark:text-zinc-500">No admin users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-muted/40">
                    {["#", "Username", "Full Name", "Role", "Email", "ID"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className="border-t border-gray-100 dark:border-border hover:bg-gray-50 dark:hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-muted-foreground font-mono">{i + 1}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800 dark:text-foreground font-mono">{u.username}</td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-foreground">{u.fullName ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[10px] capitalize">{u.role ?? "—"}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{u.email ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{u.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Namespace browser */}
      {connOk === true && namespaces.length > 0 && (
        <section className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 dark:border-border">
            <Key size={15} className="text-amber-500 shrink-0" />
            <span className="text-[13px] font-semibold text-gray-800 dark:text-foreground">
              All Namespaces
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {namespaces.length} namespace{namespaces.length !== 1 ? "s" : ""} · {totalKeys} total keys
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-border">
            {namespaces.map(ns => (
              <NsRow
                key={ns.namespace}
                ns={ns}
                open={!!nsOpen[ns.namespace]}
                onToggle={() => setNsOpen(p => ({ ...p, [ns.namespace]: !p[ns.namespace] }))}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NsRow({ ns, open, onToggle }: { ns: NsSummary; open: boolean; onToggle: () => void }) {
  const [data,    setData]    = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || data !== null) return;
    setLoading(true);
    apiFetch<Record<string, unknown>>(`${BASE}/${encodeURIComponent(ns.namespace)}`)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [open, ns.namespace, data]);

  const keys = data ? Object.keys(data) : [];

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-muted/20 transition-colors"
      >
        {open ? <ChevronDown size={13} className="text-muted-foreground shrink-0" /> : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
        <span className="font-mono text-[12px] font-semibold text-gray-800 dark:text-foreground flex-1 truncate">
          {ns.namespace}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
          <Hash size={10} /> {ns.key_count} key{Number(ns.key_count) !== 1 ? "s" : ""}
        </span>
        {ns.last_updated && (
          <span className="ml-4 flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            <Clock size={9} /> {timeAgo(ns.last_updated)}
          </span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-4">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-[12px] text-muted-foreground">
              <RefreshCw size={12} className="animate-spin" /> Loading keys…
            </div>
          )}
          {!loading && data && keys.length === 0 && (
            <p className="text-[12px] text-muted-foreground py-2">Namespace is empty.</p>
          )}
          {!loading && data && keys.length > 0 && (
            <div className="space-y-3 mt-1">
              {keys.map(k => {
                const val = data[k];
                const isArr = Array.isArray(val);
                const isObj = val && typeof val === "object" && !isArr;
                const preview = isArr
                  ? `Array (${(val as unknown[]).length} items)`
                  : isObj
                  ? `Object (${Object.keys(val as object).length} keys)`
                  : String(val);
                return (
                  <div key={k} className="bg-gray-50 dark:bg-muted/30 rounded-lg px-3 py-2.5 border border-gray-100 dark:border-border">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-400">{k}</span>
                      <span className="text-[11px] text-muted-foreground">→</span>
                      <span className="text-[11px] text-gray-600 dark:text-gray-300">{preview}</span>
                    </div>
                    {(isArr || isObj) && <JsonView value={val} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
