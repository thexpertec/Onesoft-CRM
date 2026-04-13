import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useSalesAgents, useCities, useAreas } from "@/hooks/use-data";
import { SalesAgent } from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowLeft, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, ComboOption } from "@/components/combobox";

const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 pt-1">
    <div className="h-px flex-1 bg-border" />
    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">{label}</span>
    <div className="h-px flex-1 bg-border" />
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[12px] font-semibold text-foreground">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
  </div>
);

export default function AgentNewPage() {
  const [, nav] = useLocation();
  const { addAgent } = useSalesAgents();
  const { cities } = useCities();
  const { areas }  = useAreas();
  const { toast } = useToast();
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();

  const cityComboOpts = useMemo<ComboOption[]>(() => cities.map(c => ({ value: c.name, label: c.name })), [cities]);
  const areaComboOpts = useMemo<ComboOption[]>(() => areas.map(a => ({ value: a.name, label: a.name })), [areas]);

  const BLANK = () => ({
    name: "", email: "", phone: "",
    city: "", area: "", region: "",
    commissionRate: "", targetAmount: "",
    status: "Active" as SalesAgent["status"],
    joinDate: format(new Date(), "yyyy-MM-dd"),
    openingBalance: "", notes: "",
  });
  const [form, setForm] = useState(BLANK());
  const set = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  const handleSubmit = () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    addAgent({
      name:           form.name.trim(),
      email:          form.email.trim(),
      phone:          form.phone.trim(),
      city:           form.city.trim() || undefined,
      area:           form.area.trim() || undefined,
      region:         form.region.trim(),
      commissionRate: form.commissionRate.trim(),
      targetAmount:   form.targetAmount.trim(),
      status:         form.status,
      joinDate:       form.joinDate || format(new Date(), "yyyy-MM-dd"),
      openingBalance: form.openingBalance ? parseFloat(form.openingBalance) : undefined,
      notes:          form.notes.trim(),
    });
    toast({ title: "Agent added", description: `${form.name.trim()} has been added.` });
    nav("/sales-agents");
  };

  const commissionPreview = (() => {
    const rate   = parseFloat(form.commissionRate);
    const target = parseFloat(form.targetAmount);
    if (!isNaN(rate) && rate > 0 && !isNaN(target) && target > 0)
      return `${sym}${(target * rate / 100).toFixed(dp)}/mo`;
    return null;
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav("/sales-agents")} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> Back to Sales Agents
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-6 py-5 bg-gradient-to-r from-violet-600 to-purple-600">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Users2 size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-white leading-snug">Add Sales Agent</h1>
            <p className="text-[12px] text-violet-100 truncate mt-0.5">
              {form.name.trim() ? form.name : "Name required · all other fields optional"}
            </p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          <Field label="Full Name *">
            <Input autoFocus placeholder="e.g. James Wilson" value={form.name}
              onChange={e => set("name", e.target.value)} className="h-10 text-[15px] font-medium" />
          </Field>

          <Divider label="Contact & Territory" />

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Field label="Email">
              <Input type="email" placeholder="agent@example.com" value={form.email}
                onChange={e => set("email", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Phone">
              <Input type="tel" placeholder="+44 7700 900000" value={form.phone}
                onChange={e => set("phone", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Join Date">
              <Input type="date" value={form.joinDate}
                onChange={e => set("joinDate", e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="City">
              <Combobox value={form.city} onChange={v => set("city", v)}
                options={cityComboOpts} placeholder="City…"
                inputClassName="h-9 text-sm w-full border rounded-md px-3" />
            </Field>
            <Field label="Area / Region">
              <Combobox value={form.area} onChange={v => set("area", v)}
                options={areaComboOpts} placeholder="Area…"
                inputClassName="h-9 text-sm w-full border rounded-md px-3" />
            </Field>
            <Field label="Territory">
              <Input placeholder="e.g. North England" value={form.region}
                onChange={e => set("region", e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>

          <Divider label="Status" />

          <div className="flex gap-3">
            {(["Active", "Inactive"] as const).map(s => (
              <button key={s} type="button" onClick={() => set("status", s)}
                className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all border ${
                  form.status === s
                    ? s === "Active" ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                    :                  "bg-amber-500 border-amber-500 text-white shadow-sm"
                    : "bg-background border-border text-muted-foreground hover:border-gray-400 hover:text-foreground"
                }`}>{s}</button>
            ))}
          </div>

          <Divider label="Targets & Commission" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-foreground">Commission %</label>
                {commissionPreview && (
                  <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400">{commissionPreview}</span>
                )}
              </div>
              <div className="relative">
                <Input type="number" step="0.1" min="0" max="100" placeholder="0"
                  value={form.commissionRate} onChange={e => set("commissionRate", e.target.value)}
                  className="h-9 text-sm pr-7 tabular-nums" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground pointer-events-none">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">% of each sale</p>
            </div>
            <Field label={`Monthly Target (${sym})`} hint="Sales goal per month">
              <Input type="number" step="0.01" min="0" placeholder="0.00"
                value={form.targetAmount} onChange={e => set("targetAmount", e.target.value)}
                className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label={`Opening Balance (${sym})`} hint="Commission owed at setup">
              <Input type="number" step="0.01" placeholder="0.00"
                value={form.openingBalance} onChange={e => set("openingBalance", e.target.value)}
                className="h-9 text-sm tabular-nums" />
            </Field>
          </div>

          <Divider label="Notes" />

          <textarea rows={3} placeholder="Optional notes about this agent, specialisations, assigned accounts…"
            value={form.notes} onChange={e => set("notes", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={() => nav("/sales-agents")} className="h-10 px-6 text-[13px]">Cancel</Button>
          <Button onClick={handleSubmit}
            className="flex-1 h-10 font-semibold text-[13px] bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white border-0 shadow-sm gap-2">
            <Plus size={15} /> Add Agent
          </Button>
        </div>
      </div>
    </div>
  );
}
