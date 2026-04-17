import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText, Save, Info, Eye, Link2, RefreshCw,
  Building2, AlignLeft, AlignCenter, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { getSettings, saveSettings, AppSettings } from "@/lib/store";

// ─── Helper: HTML-escape ──────────────────────────────────────────────────────
const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nl2br = (s: string) => esc(s).replace(/\n/g, "<br/>");

// ─── Build header preview HTML ────────────────────────────────────────────────
function buildHeaderHtml(s: AppSettings, note: string): string {
  const logoHtml = s.logoBase64
    ? `<img src="${s.logoBase64}" alt="Logo" style="max-height:44px;max-width:140px;object-fit:contain;filter:brightness(0) invert(1);">`
    : `<span style="font-size:18pt;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1;">${esc(s.companyName || "Company Name")}</span>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 16px; }
  .inv-header {
    background: linear-gradient(135deg, #0f2447 0%, #1a3a6b 100%);
    color: #e2e8f0;
    padding: 16pt 24pt;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 6px;
  }
  .logo-text { font-size: 18pt; font-weight: 800; color: #fff; letter-spacing: -0.5px; line-height: 1; }
  .tagline { font-size: 8pt; color: #94a3b8; margin-top: 3pt; }
  .header-note { font-size: 7.5pt; color: #cbd5e1; margin-top: 4pt; font-style: italic; line-height: 1.5; }
  .inv-title { font-size: 20pt; font-weight: 700; color: #fff; letter-spacing: 1pt; text-align: right; }
  .inv-number { font-size: 10pt; color: #93c5fd; margin-top: 4pt; text-align: right; }
  .placeholder { color: #94a3b8; }
</style>
</head><body>
<div class="inv-header">
  <div style="display:flex;align-items:center;gap:12pt;">
    <div>
      ${logoHtml}
      ${s.companyTagline ? `<div class="tagline">${esc(s.companyTagline)}</div>` : ""}
      ${note ? `<div class="header-note">${nl2br(note)}</div>` : ""}
    </div>
  </div>
  <div>
    <div class="inv-title">INVOICE</div>
    <div class="inv-number placeholder">INV-0001</div>
  </div>
</div>
</body></html>`;
}

// ─── Build footer preview HTML ────────────────────────────────────────────────
function buildFooterHtml(
  s: AppSettings,
  showContact: boolean,
  customText: string,
  legalNote: string,
): string {
  const parts: string[] = [];
  if (showContact) {
    if (s.addressHull)         parts.push(esc(s.addressHull));
    if (s.addressIslamabad)    parts.push(esc(s.addressIslamabad));
    if (s.phoneHull)           parts.push(`Tel: ${esc(s.phoneHull)}`);
    if (s.emailHull)           parts.push(esc(s.emailHull));
    if (s.website)             parts.push(esc(s.website));
    if (s.vatNumber)           parts.push(`VAT No: ${esc(s.vatNumber)}`);
    if (s.companyRegistration) parts.push(`Reg: ${esc(s.companyRegistration)}`);
  }

  const noContactData =
    showContact &&
    !s.addressHull && !s.addressIslamabad && !s.phoneHull &&
    !s.emailHull && !s.website && !s.vatNumber && !s.companyRegistration;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 16px; }
  .inv-footer {
    background: #0f2447;
    color: #94a3b8;
    padding: 12pt 24pt;
    font-size: 7.5pt;
    line-height: 1.7;
    text-align: center;
    border-radius: 6px;
  }
  .co-name  { font-size: 9.5pt; font-weight: 700; color: #e2e8f0; margin-bottom: 3pt; }
  .co-line  { color: #64748b; margin-bottom: 1.5pt; }
  .co-legal { font-size: 7pt; color: #334155; margin-top: 6pt; padding-top: 5pt; border-top: 1px solid #1e3a5f; }
  .muted    { color: #334155; font-style: italic; font-size: 7pt; }
</style>
</head><body>
<div class="inv-footer">
  <div class="co-name">
    ${esc(s.companyName || "Company Name")}${s.companyTagline ? ` — ${esc(s.companyTagline)}` : ""}
  </div>
  ${parts.length > 0
    ? `<div class="co-line">${parts.join(" &nbsp;·&nbsp; ")}</div>`
    : noContactData
      ? `<div class="muted">(Add address / phone / email in Company Profile to show contact info here)</div>`
      : ""}
  ${customText ? `<div class="co-line">${nl2br(customText)}</div>` : ""}
  ${legalNote ? `<div class="co-legal">${nl2br(legalNote)}</div>` : ""}
</div>
</body></html>`;
}

// ─── Iframe preview ───────────────────────────────────────────────────────────
function HtmlPreview({ html, height = 120 }: { html: string; height?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcdoc = html;
  }, [html]);
  return (
    <iframe
      ref={ref}
      title="preview"
      scrolling="no"
      style={{ width: "100%", height, border: "none", borderRadius: 6, display: "block" }}
      sandbox="allow-same-origin"
    />
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[13px] font-medium text-gray-700 dark:text-gray-300">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

// ─── InfoBadge: shows a read-only value coming from Company Profile ───────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1 px-3 rounded-md bg-gray-50 dark:bg-muted/30 border border-dashed border-gray-200 dark:border-border">
      <span className="text-[11px] text-muted-foreground min-w-[80px]">{label}</span>
      <span className="text-[12px] font-medium text-gray-700 dark:text-gray-200 flex-1 truncate">
        {value || <span className="text-muted-foreground italic">—</span>}
      </span>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ title, desc, icon: Icon, badge, children }: {
  title: string; desc: string; icon: React.ElementType; badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 dark:bg-muted/20 border-b border-gray-100 dark:border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-gray-800 dark:text-foreground">{title}</h3>
            {badge && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{badge}</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PrintTemplatesPage() {
  const { toast } = useToast();
  const [, nav] = useLocation();

  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  // Local editable fields
  const [headerNote,      setHeaderNote]      = useState(settings.printHeaderNote      ?? "");
  const [footerCustom,    setFooterCustom]    = useState(settings.invoiceFooter        ?? "");
  const [footerLegalNote, setFooterLegalNote] = useState(
    settings.printFooterLegalNote ??
    "This is a computer-generated document. No handwritten signature is required."
  );
  const [showContact,     setShowContact]     = useState(settings.printFooterShowContact !== false);
  const [saved,           setSaved]           = useState(false);

  // Re-read settings when they change externally
  useEffect(() => {
    const handler = () => {
      const s = getSettings();
      setSettings(s);
    };
    window.addEventListener("admin-settings-changed", handler);
    return () => window.removeEventListener("admin-settings-changed", handler);
  }, []);

  const handleSave = useCallback(() => {
    const updated: AppSettings = {
      ...settings,
      printHeaderNote:        headerNote,
      invoiceFooter:          footerCustom,
      printFooterLegalNote:   footerLegalNote,
      printFooterShowContact: showContact,
    };
    saveSettings(updated);
    setSettings(updated);
    setSaved(true);
    toast({ title: "Print templates saved", description: "Changes will appear on all future printed documents." });
    setTimeout(() => setSaved(false), 2500);
  }, [settings, headerNote, footerCustom, footerLegalNote, showContact, toast]);

  // Live preview HTML — updates instantly as user types
  const headerHtml = buildHeaderHtml(settings, headerNote);
  const footerHtml = buildFooterHtml(settings, showContact, footerCustom, footerLegalNote);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Print Templates</h1>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Design the header and footer that appear on all printed documents (invoices, purchase orders, etc.).
            Live preview updates as you type.
          </p>
        </div>
        <Button onClick={handleSave} className="shrink-0 gap-1.5" size="sm">
          {saved ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saved</> : <><Save className="w-3.5 h-3.5" />Save Templates</>}
        </Button>
      </div>

      {/* ── Source notice ── */}
      <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 px-4 py-3 text-[12px] text-blue-700 dark:text-blue-300">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Company name, logo, tagline, and contact details are pulled from{" "}
          <button
            onClick={() => nav("/settings")}
            className="font-semibold underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
          >
            Settings → Company Profile
          </button>
          . Edit them there to update what appears in the header and footer.
        </span>
      </div>

      {/* ══ HEADER TEMPLATE ══════════════════════════════════════════════════════ */}
      <SectionCard
        title="Header Template"
        desc="Appears at the top of every printed document — shows logo, company name, and document title."
        icon={AlignCenter}
        badge="Top of page"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left: form */}
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                From Company Profile (read-only)
              </p>
              <div className="space-y-1.5">
                <InfoRow
                  label="Company"
                  value={settings.logoBase64 ? "Logo uploaded ✓" : settings.companyName}
                />
                <InfoRow label="Tagline"  value={settings.companyTagline} />
              </div>
              <button
                onClick={() => nav("/settings")}
                className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <Link2 className="w-3 h-3" /> Edit in Company Profile
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <Separator />

            <Field
              label="Header Note (optional)"
              hint="Small italic text shown below the company name/tagline in the header band. Use for a slogan, branch name, or any extra info."
            >
              <Textarea
                value={headerNote}
                onChange={e => setHeaderNote(e.target.value)}
                placeholder="e.g. Authorised dealer · Registered in England & Wales"
                rows={3}
                className="text-[13px] resize-none"
              />
            </Field>
          </div>

          {/* Right: live preview */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Eye className="w-3 h-3" /> Live Preview
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-border overflow-hidden bg-gray-100 dark:bg-muted/20 p-2">
              <HtmlPreview html={headerHtml} height={110} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              The right side shows the document title &amp; number (e.g. <em>INVOICE / INV-0001</em>), filled automatically per document.
            </p>
          </div>

        </div>
      </SectionCard>

      {/* ══ FOOTER TEMPLATE ══════════════════════════════════════════════════════ */}
      <SectionCard
        title="Footer Template"
        desc="Appears at the bottom of every printed document — company contact strip, custom message, and legal note."
        icon={AlignLeft}
        badge="Bottom of page"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left: form */}
          <div className="space-y-4">

            {/* Contact toggle */}
            <div className="flex items-start gap-3 rounded-lg border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/20 px-4 py-3">
              <Switch
                checked={showContact}
                onCheckedChange={setShowContact}
                id="show-contact"
              />
              <div className="flex-1 min-w-0">
                <Label htmlFor="show-contact" className="text-[13px] font-medium cursor-pointer">
                  Show company contact info
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Displays addresses, phone, email, website, VAT number and company registration in the footer band.
                </p>
                {showContact && (
                  <div className="mt-2 space-y-1">
                    {[
                      ["Address (Hull)",      settings.addressHull],
                      ["Address (Islamabad)", settings.addressIslamabad],
                      ["Phone",              settings.phoneHull],
                      ["Email",              settings.emailHull],
                      ["Website",            settings.website],
                      ["VAT No",             settings.vatNumber],
                      ["Company Reg",        settings.companyRegistration],
                    ].filter(([, v]) => v).map(([label, val]) => (
                      <div key={label as string} className="flex gap-2 text-[11px]">
                        <span className="text-muted-foreground min-w-[90px]">{label}:</span>
                        <span className="text-gray-700 dark:text-gray-300 truncate">{val}</span>
                      </div>
                    ))}
                    {!settings.addressHull && !settings.phoneHull && !settings.emailHull && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                        No contact details found — add them in Company Profile.
                      </p>
                    )}
                    <button
                      onClick={() => nav("/settings")}
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                    >
                      <Link2 className="w-3 h-3" /> Edit in Company Profile
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <Field
              label="Custom Footer Text"
              hint="Shown below the contact line — e.g. payment terms, thank-you message, or promotional note."
            >
              <Textarea
                value={footerCustom}
                onChange={e => setFooterCustom(e.target.value)}
                placeholder="e.g. Thank you for your business! Payment due within 30 days."
                rows={3}
                className="text-[13px] resize-none"
              />
            </Field>

            <Field
              label="Legal Note"
              hint="Small text at the very bottom of the footer. Clear this field to hide it completely."
            >
              <Textarea
                value={footerLegalNote}
                onChange={e => setFooterLegalNote(e.target.value)}
                placeholder="e.g. This is a computer-generated document. No handwritten signature is required."
                rows={2}
                className="text-[13px] resize-none"
              />
            </Field>

          </div>

          {/* Right: live preview */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Eye className="w-3 h-3" /> Live Preview
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-border overflow-hidden bg-gray-100 dark:bg-muted/20 p-2">
              <HtmlPreview html={footerHtml} height={140} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              The footer appears on every page of the printed document.
            </p>
          </div>

        </div>
      </SectionCard>

      {/* ── Full-page preview note ── */}
      <div className="flex items-start gap-2.5 rounded-lg bg-gray-50 dark:bg-muted/20 border border-gray-100 dark:border-border px-4 py-3 text-[12px] text-muted-foreground">
        <Building2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <span>
          To preview a full document with these templates applied, open any invoice and click{" "}
          <strong>Print / Download PDF</strong>.{" "}
          <button onClick={() => nav("/invoices")} className="text-primary hover:underline font-medium">
            Go to Invoices →
          </button>
        </span>
      </div>

      {/* ── Bottom save ── */}
      <div className="flex justify-end pb-4">
        <Button onClick={handleSave} className="gap-1.5">
          {saved ? <><RefreshCw className="w-4 h-4 animate-spin" />Saved</> : <><Save className="w-4 h-4" />Save Templates</>}
        </Button>
      </div>

    </div>
  );
}
