import { useState, useRef, useCallback } from "react";
import {
  Building2, DollarSign, ShoppingBag, Database,
  Save, Upload, Download, Trash2, RefreshCw,
  Globe, Mail, Phone, MapPin, Image as ImageIcon,
  AlertTriangle, Check, ChevronRight, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  AppSettings, getSettings, saveSettings, ALL_STORE_KEYS, MODULE_KEYS,
} from "@/lib/store";
import { CURRENCIES } from "@/lib/currencies";

// ─── Tab ids ──────────────────────────────────────────────────────────────────
type TabId = "company" | "financial" | "pos" | "data";

const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "company",   label: "Company Profile",  icon: Building2,   desc: "Name, logo & office contacts" },
  { id: "financial", label: "Financial",         icon: DollarSign,  desc: "Currency, VAT & fiscal year"  },
  { id: "pos",       label: "POS & Sales",       icon: ShoppingBag, desc: "Receipt, payment & tax defaults" },
  { id: "data",      label: "Data Management",   icon: Database,    desc: "Backup, import & reset"       },
];

const FISCAL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Credit", "Cheque", "Other"];

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[13px] font-medium text-gray-700 dark:text-gray-300">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="pb-3 mb-5 border-b border-gray-100 dark:border-border">
      <h3 className="text-[15px] font-semibold text-gray-800 dark:text-foreground">{title}</h3>
      {desc && <p className="text-[12px] text-muted-foreground mt-0.5">{desc}</p>}
    </div>
  );
}

// ─── Module reset row ─────────────────────────────────────────────────────────
function ModuleResetRow({
  module, onReset,
}: { module: string; onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between py-2.5 border-b border-gray-50 dark:border-border/50 last:border-0">
        <div>
          <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">{module}</p>
          <p className="text-[11px] text-muted-foreground">
            {MODULE_KEYS[module].join(", ")}
          </p>
        </div>
        <button
          onClick={() => setConfirm(true)}
          className="flex items-center gap-1 text-[12px] text-red-500 hover:text-red-700 px-2.5 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-800/40 transition-colors"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {module} data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all <strong>{module}</strong> records from this device. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { setConfirm(false); onReset(); }}
            >
              Yes, Clear {module}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const [tab, setTab]         = useState<TabId>("company");
  const [form, setForm]       = useState<AppSettings>(() => getSettings());
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [nukeOpen, setNukeOpen] = useState(false);

  const logoInputRef  = useRef<HTMLInputElement>(null);
  const importRef     = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true);
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────────
  function handleSave() {
    setSaving(true);
    saveSettings(form);
    setTimeout(() => {
      setSaving(false);
      setDirty(false);
      toast({ title: "Settings saved", description: "Your changes have been saved successfully." });
    }, 300);
  }

  // ── Logo upload ─────────────────────────────────────────────────────────────
  function handleLogoFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      set("logoBase64", e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  function handleExport() {
    const snapshot: Record<string, unknown> = {};
    ALL_STORE_KEYS.forEach(k => {
      const raw = localStorage.getItem(k);
      if (raw) {
        try { snapshot[k] = JSON.parse(raw); }
        catch { snapshot[k] = raw; }
      }
    });
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `onesoft-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Backup downloaded", description: "All data exported to JSON." });
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string);
        let count = 0;
        ALL_STORE_KEYS.forEach(k => {
          if (k in data) {
            localStorage.setItem(k, JSON.stringify(data[k]));
            count++;
          }
        });
        toast({ title: "Import complete", description: `${count} modules restored. Reload the page to see changes.` });
      } catch {
        toast({ title: "Import failed", description: "Invalid backup file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }

  // ── Module reset ────────────────────────────────────────────────────────────
  function clearModule(module: string) {
    MODULE_KEYS[module].forEach(k => localStorage.removeItem(k));
    toast({ title: `${module} cleared`, description: "All records removed from this device." });
  }

  // ── Nuke all ────────────────────────────────────────────────────────────────
  function nukeAll() {
    ALL_STORE_KEYS.forEach(k => localStorage.removeItem(k));
    toast({ title: "All data cleared", description: "Every record has been wiped. Reload to start fresh.", variant: "destructive" });
    setNukeOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-background">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-card border-b border-gray-100 dark:border-border px-6 py-4">
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          <div>
            <h1 className="text-[20px] font-bold text-gray-900 dark:text-foreground tracking-tight">Settings</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Manage company profile, preferences and data</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={!dirty || saving || tab === "data"}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 text-[13px]"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-screen-xl mx-auto flex gap-6 p-6">

        {/* Left sidebar nav */}
        <aside className="w-56 shrink-0">
          <nav className="flex flex-col gap-1">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group ${
                    active
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-muted"
                  }`}
                >
                  <Icon size={16} className={active ? "text-white" : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"} />
                  <div className="min-w-0">
                    <p className={`text-[13px] font-medium leading-tight ${active ? "text-white" : ""}`}>{t.label}</p>
                    <p className={`text-[11px] leading-tight mt-0.5 truncate ${active ? "text-blue-100" : "text-muted-foreground"}`}>{t.desc}</p>
                  </div>
                  {active && <ChevronRight size={14} className="ml-auto text-blue-200 shrink-0" />}
                </button>
              );
            })}
          </nav>

          {dirty && tab !== "data" && (
            <div className="mt-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2.5">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">Unsaved changes</p>
            </div>
          )}
        </aside>

        {/* Right content */}
        <main className="flex-1 min-w-0">
          <div className="bg-white dark:bg-card border border-gray-100 dark:border-border rounded-xl shadow-sm p-6">

            {/* ══ Company Profile ══════════════════════════════════════════════ */}
            {tab === "company" && (
              <div className="space-y-6">
                <SectionHeader title="Company Identity" desc="These details appear on invoices, receipts, and documents." />

                {/* Logo */}
                <div className="flex items-start gap-6">
                  <div
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 dark:border-border flex items-center justify-center bg-gray-50 dark:bg-muted/30 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors shrink-0"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {form.logoBase64 ? (
                      <img src={form.logoBase64} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-gray-400">
                        <ImageIcon size={24} />
                        <span className="text-[10px]">Logo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">Company Logo</p>
                    <p className="text-[11px] text-muted-foreground">PNG, JPG or SVG. Displayed in the dashboard header.</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5 text-[12px] h-8" onClick={() => logoInputRef.current?.click()}>
                        <Upload size={12} /> Upload
                      </Button>
                      {form.logoBase64 && (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-[12px] h-8 text-red-500 hover:text-red-700" onClick={() => set("logoBase64", "")}>
                          <X size={12} /> Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handleLogoFile(e.target.files[0])} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Company Name">
                    <Input value={form.companyName} onChange={e => set("companyName", e.target.value)}
                      className="h-9 text-[13px]" placeholder="Onesoft" />
                  </Field>
                  <Field label="Tagline / Description">
                    <Input value={form.companyTagline} onChange={e => set("companyTagline", e.target.value)}
                      className="h-9 text-[13px]" placeholder="Software & IT Solutions" />
                  </Field>
                  <Field label="Website" >
                    <div className="relative">
                      <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input value={form.website} onChange={e => set("website", e.target.value)}
                        className="h-9 text-[13px] pl-8" placeholder="https://onesoft.co.uk" />
                    </div>
                  </Field>
                </div>

                <SectionHeader title="Hull Office (UK)" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Phone">
                    <div className="relative">
                      <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input value={form.phoneHull} onChange={e => set("phoneHull", e.target.value)}
                        className="h-9 text-[13px] pl-8" placeholder="+44 1234 567890" />
                    </div>
                  </Field>
                  <Field label="Email">
                    <div className="relative">
                      <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input value={form.emailHull} onChange={e => set("emailHull", e.target.value)}
                        className="h-9 text-[13px] pl-8" placeholder="info@onesoft.co.uk" />
                    </div>
                  </Field>
                  <Field label="Address" >
                    <div className="relative">
                      <MapPin size={13} className="absolute left-3 top-3 text-gray-400" />
                      <Textarea value={form.addressHull} onChange={e => set("addressHull", e.target.value)}
                        className="text-[13px] pl-8 resize-none" rows={2} placeholder="Street, City, Postcode, UK" />
                    </div>
                  </Field>
                </div>

                <SectionHeader title="Islamabad Office (Pakistan)" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Phone">
                    <div className="relative">
                      <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input value={form.phoneIslamabad} onChange={e => set("phoneIslamabad", e.target.value)}
                        className="h-9 text-[13px] pl-8" placeholder="+92 51 1234567" />
                    </div>
                  </Field>
                  <Field label="Email">
                    <div className="relative">
                      <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input value={form.emailIslamabad} onChange={e => set("emailIslamabad", e.target.value)}
                        className="h-9 text-[13px] pl-8" placeholder="pk@onesoft.co.uk" />
                    </div>
                  </Field>
                  <Field label="Address">
                    <div className="relative">
                      <MapPin size={13} className="absolute left-3 top-3 text-gray-400" />
                      <Textarea value={form.addressIslamabad} onChange={e => set("addressIslamabad", e.target.value)}
                        className="text-[13px] pl-8 resize-none" rows={2} placeholder="Street, Sector, Islamabad, Pakistan" />
                    </div>
                  </Field>
                </div>
              </div>
            )}

            {/* ══ Financial ════════════════════════════════════════════════════ */}
            {tab === "financial" && (
              <div className="space-y-6">
                <SectionHeader title="Currency & Tax" desc="These settings affect how amounts are displayed and calculated." />

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Default Currency">
                    <Select value={form.currency} onValueChange={v => set("currency", v)}>
                      <SelectTrigger className="h-9 text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => (
                          <SelectItem key={c.code} value={c.code} className="text-[13px]">{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Default VAT / Tax Rate (%)" hint="Applied to new sales by default. Can be overridden per sale.">
                    <Input
                      type="number" min={0} max={100} step={0.5}
                      value={form.vatRate}
                      onChange={e => set("vatRate", e.target.value)}
                      className="h-9 text-[13px]" placeholder="20" />
                  </Field>

                  <Field label="VAT / Tax Registration Number" hint="Shown on invoices and receipts.">
                    <Input value={form.vatNumber} onChange={e => set("vatNumber", e.target.value)}
                      className="h-9 text-[13px]" placeholder="GB 123 4567 89" />
                  </Field>

                  <Field label="Fiscal Year Start">
                    <Select value={form.fiscalYearStart} onValueChange={v => set("fiscalYearStart", v)}>
                      <SelectTrigger className="h-9 text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FISCAL_MONTHS.map(m => (
                          <SelectItem key={m} value={m} className="text-[13px]">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <SectionHeader title="Reference Prefixes" desc="Prefix added to auto-generated reference numbers." />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Sale / Invoice Prefix" hint='e.g. "SAL-" produces SAL-0001'>
                    <Input value={form.salePrefix} onChange={e => set("salePrefix", e.target.value)}
                      className="h-9 text-[13px] font-mono" placeholder="SAL-" />
                  </Field>
                  <Field label="Purchase Order Prefix" hint='e.g. "PO-" produces PO-0001'>
                    <Input value={form.purchasePrefix} onChange={e => set("purchasePrefix", e.target.value)}
                      className="h-9 text-[13px] font-mono" placeholder="PO-" />
                  </Field>
                </div>
              </div>
            )}

            {/* ══ POS & Sales ══════════════════════════════════════════════════ */}
            {tab === "pos" && (
              <div className="space-y-6">
                <SectionHeader title="POS Defaults" desc="Default values used when opening the POS terminal." />

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Default Payment Method">
                    <Select value={form.defaultPaymentMethod} onValueChange={v => set("defaultPaymentMethod", v)}>
                      <SelectTrigger className="h-9 text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m} value={m} className="text-[13px]">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-muted/30 rounded-lg border border-gray-100 dark:border-border">
                  <div>
                    <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">Apply Tax on POS</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Automatically add the default tax rate to each POS sale</p>
                  </div>
                  <Switch
                    checked={form.taxOnPOS}
                    onCheckedChange={v => set("taxOnPOS", v)}
                  />
                </div>

                <SectionHeader title="Receipt Content" desc="Text printed at the top and bottom of receipts." />
                <div className="grid gap-4">
                  <Field label="Receipt Header" hint="Leave blank to use company name automatically.">
                    <Textarea
                      value={form.receiptHeader}
                      onChange={e => set("receiptHeader", e.target.value)}
                      className="text-[13px] resize-none" rows={3}
                      placeholder="Onesoft — Software & IT Solutions&#10;Hull, UK  |  Islamabad, Pakistan" />
                  </Field>
                  <Field label="Receipt Footer">
                    <Textarea
                      value={form.receiptFooter}
                      onChange={e => set("receiptFooter", e.target.value)}
                      className="text-[13px] resize-none" rows={3}
                      placeholder="Thank you for your business!" />
                  </Field>
                </div>

                {/* Preview */}
                <div>
                  <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 mb-2">Receipt Preview</p>
                  <div className="bg-white dark:bg-card border border-dashed border-gray-200 dark:border-border rounded-lg p-5 font-mono text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed max-w-sm">
                    <p className="text-center font-bold text-[13px]">{form.receiptHeader || form.companyName}</p>
                    {(form.phoneHull || form.emailHull) && (
                      <p className="text-center text-[10px] text-gray-400">{[form.phoneHull, form.emailHull].filter(Boolean).join("  |  ")}</p>
                    )}
                    <div className="border-t border-dashed border-gray-300 dark:border-gray-600 my-2" />
                    <p>Product A ×2 ........ £20.00</p>
                    <p>Product B ×1 ........ £15.50</p>
                    <div className="border-t border-dashed border-gray-300 dark:border-gray-600 my-2" />
                    {form.taxOnPOS && (
                      <p>VAT ({form.vatRate}%) .......... £{((35.50 * parseFloat(form.vatRate || "0")) / 100).toFixed(2)}</p>
                    )}
                    <p className="font-bold">TOTAL ................. £{(35.50 * (1 + parseFloat(form.vatRate || "0") / 100)).toFixed(2)}</p>
                    <div className="border-t border-dashed border-gray-300 dark:border-gray-600 my-2" />
                    <p className="text-center">{form.receiptFooter}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ══ Data Management ══════════════════════════════════════════════ */}
            {tab === "data" && (
              <div className="space-y-8">

                {/* Backup */}
                <div>
                  <SectionHeader title="Backup & Restore" desc="Export all data to a JSON file or restore from a previous backup." />
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={handleExport} variant="outline" className="gap-2 h-9 text-[13px]">
                      <Download size={14} />
                      Export Backup (.json)
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 h-9 text-[13px]"
                      onClick={() => importRef.current?.click()}
                    >
                      <Upload size={14} />
                      Import from Backup
                    </Button>
                    <input
                      ref={importRef} type="file" accept=".json" className="hidden"
                      onChange={e => e.target.files?.[0] && handleImportFile(e.target.files[0])}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Backup includes: leads, customers, suppliers, products, stock, purchases, sales, documents, HRM staff, roles, users, and settings.
                  </p>
                </div>

                {/* Per-module reset */}
                {isSuperAdmin && (
                  <div>
                    <SectionHeader
                      title="Clear Module Data"
                      desc="Permanently delete all records for a specific module. Use with caution."
                    />
                    <div className="rounded-lg border border-gray-100 dark:border-border bg-gray-50/50 dark:bg-muted/10 px-4">
                      {Object.keys(MODULE_KEYS).map(mod => (
                        <ModuleResetRow key={mod} module={mod} onReset={() => clearModule(mod)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Nuclear reset */}
                {isSuperAdmin && (
                  <div className="rounded-xl border-2 border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/10 p-5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[14px] font-semibold text-red-700 dark:text-red-400">Wipe All Data</h4>
                        <p className="text-[12px] text-red-600/80 dark:text-red-400/80 mt-1">
                          Permanently deletes every record across all modules — leads, customers, products, sales, purchases, staff, users, and settings. This cannot be undone.
                        </p>
                        <Button
                          variant="destructive"
                          className="mt-3 gap-2 h-9 text-[13px]"
                          onClick={() => setNukeOpen(true)}
                        >
                          <Trash2 size={14} />
                          Wipe All Data
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <AlertDialog open={nukeOpen} onOpenChange={setNukeOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle size={18} /> Wipe ALL data?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete <strong>every single record</strong> stored in this browser — customers, products, sales, staff, and more. This action <strong>cannot be undone</strong>.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel — Keep my data</AlertDialogCancel>
                      <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={nukeAll}>
                        Yes, wipe everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

              </div>
            )}

          </div>

          {/* Saved banner */}
          {!dirty && saving === false && tab !== "data" && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400 px-1">
              <Check size={13} />
              All changes saved
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
