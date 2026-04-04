import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { getDoc, RequirementDoc } from "@/lib/store";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";
import {
  FileText, MapPin, Phone, Globe, Mail, Printer,
  User, Building2, Calendar, Clock, DollarSign,
  Layers, Wrench, Target, CheckCircle2, Circle,
  ChevronRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  title: string;
  date: string;
  payment: string;
  paymentStatus: string;
  taskStatus: string;
}

type Sections = {
  s1?: { docTitle?: string; docDate?: string; preparedBy?: string; selectedClient?: string };
  s2?: { businessType?: string; targetAudience?: string; keyProducts?: string[]; businessGoals?: string; keyChallenges?: string; currentSystems?: string };
  s3?: { purpose?: string; keyFeatures?: string[] };
  s35?: { detailedNotes?: string };
  s4?: { integrations?: string[]; techStack?: string[]; hosting?: string; security?: string };
  s5?: { paymentStructure?: string; additionalCosts?: string };
  s6?: { startDate?: string; deliveryDate?: string; milestones?: Milestone[] };
  s7?: { postLaunch?: string; maintenance?: string };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(str?: string) {
  if (!str) return "—";
  try { return new Date(str).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return str; }
}

function formatCurrency(str?: string) {
  if (!str || str.trim() === "") return null;
  const n = parseFloat(str.replace(/[£$€,\s]/g, ""));
  if (isNaN(n)) return str;
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-blue-50 text-blue-700 border border-blue-200",
  "Under Review": "bg-amber-50 text-amber-700 border border-amber-200",
  Approved: "bg-green-50 text-green-700 border border-green-200",
  Archived: "bg-gray-100 text-gray-600 border border-gray-200",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  "Not Started": "text-gray-500",
  "In Progress": "text-blue-600",
  "Completed": "text-green-600",
  "On Hold": "text-amber-600",
  "Cancelled": "text-red-600",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  Paid: "bg-green-50 text-green-700 border border-green-200",
  Partial: "bg-amber-50 text-amber-700 border border-amber-200",
  Pending: "bg-gray-100 text-gray-600 border border-gray-200",
  Overdue: "bg-red-50 text-red-700 border border-red-200",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionBlock({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-muted/40 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="text-primary" size={15} />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function TagList({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return <span className="text-sm text-muted-foreground italic">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium border border-primary/15">
          {item}
        </span>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ShareDocument() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<RequirementDoc | null | "notfound">(null);

  useEffect(() => {
    if (!id) return;
    const found = getDoc(id);
    setDoc(found ?? "notfound");
  }, [id]);

  if (doc === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <p className="text-muted-foreground text-sm">Loading document…</p>
      </div>
    );
  }

  if (doc === "notfound") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-muted/30 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <FileText className="w-6 h-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Document Not Found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This document link may have expired or the document no longer exists. Please contact Onesoft for an updated link.
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <a href="mailto:info@onesoft.org.uk" className="flex items-center gap-1 hover:text-primary transition-colors">
            <Mail size={12} /> info@onesoft.org.uk
          </a>
          <a href="tel:+447984273482" className="flex items-center gap-1 hover:text-primary transition-colors">
            <Phone size={12} /> +44 7984 273482
          </a>
        </div>
      </div>
    );
  }

  const s = (doc.sections ?? {}) as Sections;
  const s1 = s.s1 ?? {};
  const s2 = s.s2 ?? {};
  const s3 = s.s3 ?? {};
  const s35 = s.s35 ?? {};
  const s4 = s.s4 ?? {};
  const s5 = s.s5 ?? {};
  const s6 = s.s6 ?? {};
  const s7 = s.s7 ?? {};

  const milestones: Milestone[] = s6.milestones ?? [];
  const milestonesTotal = milestones.reduce((sum, m) => sum + (parseFloat(m.payment?.replace(/[£$€,\s]/g, "") ?? "") || 0), 0);

  const statusClass = STATUS_COLORS[doc.status] ?? STATUS_COLORS.Draft;

  return (
    <div className="min-h-screen bg-muted/30 font-sans">

      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm print:shadow-none sticky top-0 z-20 print:static">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Onesoft" className="h-8 w-auto object-contain" />
            <div className="h-5 w-px bg-border hidden sm:block" />
            <span className="hidden sm:block text-xs text-muted-foreground font-medium">Software Requirement Document</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
              {doc.status}
            </span>
            <button
              onClick={() => window.print()}
              className="print:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Printer size={13} /> Print / Save PDF
            </button>
          </div>
        </div>
      </header>

      {/* Document content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Document Title + Meta */}
        <div className="rounded-xl border border-border bg-white px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary flex items-center justify-center hidden sm:flex">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">Customer Requirement Document</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-3">
                {doc.title}
              </h1>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {s1.preparedBy && (
                  <div className="flex items-center gap-1.5">
                    <User size={13} className="text-primary flex-shrink-0" />
                    Prepared by <span className="font-medium text-foreground ml-1">{s1.preparedBy}</span>
                  </div>
                )}
                {(s1.docDate || doc.createdAt) && (
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-primary flex-shrink-0" />
                    {formatDate(s1.docDate || doc.createdAt)}
                  </div>
                )}
                {doc.clientName && (
                  <div className="flex items-center gap-1.5">
                    <Building2 size={13} className="text-primary flex-shrink-0" />
                    {doc.company ? `${doc.clientName} · ${doc.company}` : doc.clientName}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Key stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Industry</p>
              <p className="text-sm font-medium text-foreground">{doc.industry || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Software Type</p>
              <p className="text-sm font-medium text-foreground">{doc.softwareType || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Start Date</p>
              <p className="text-sm font-medium text-foreground">{formatDate(doc.startDate)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Delivery Date</p>
              <p className="text-sm font-medium text-foreground">{formatDate(doc.deliveryDate)}</p>
            </div>
          </div>
        </div>

        {/* Two-column: Client info + contact */}
        {(doc.clientName || doc.company || doc.email || doc.phone) && (
          <SectionBlock icon={User} title="Client Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Client Name" value={doc.clientName} />
              <Field label="Company" value={doc.company} />
              <Field label="Email" value={doc.email ? <a href={`mailto:${doc.email}`} className="text-primary hover:underline">{doc.email}</a> : undefined} />
              <Field label="Phone" value={doc.phone ? <a href={`tel:${doc.phone}`} className="text-primary hover:underline">{doc.phone}</a> : undefined} />
              <Field label="Industry" value={doc.industry} />
              <Field label="City" value={doc.city} />
            </div>
          </SectionBlock>
        )}

        {/* Section 2: Business Information */}
        {(s2.businessType || s2.targetAudience || s2.businessGoals || s2.keyChallenges || s2.currentSystems || (s2.keyProducts?.length ?? 0) > 0) && (
          <SectionBlock icon={Building2} title="Business Information">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Business Type" value={s2.businessType} />
                <Field label="Target Audience" value={s2.targetAudience} />
              </div>
              {(s2.keyProducts?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Key Products / Services</p>
                  <TagList items={s2.keyProducts} />
                </div>
              )}
              {s2.businessGoals && <Field label="Business Goals" value={<p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{s2.businessGoals}</p>} />}
              {s2.keyChallenges && <Field label="Key Challenges" value={<p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{s2.keyChallenges}</p>} />}
              {s2.currentSystems && <Field label="Current Systems" value={s2.currentSystems} />}
            </div>
          </SectionBlock>
        )}

        {/* Section 3: Software Requirements */}
        {(s3.purpose || (s3.keyFeatures?.length ?? 0) > 0) && (
          <SectionBlock icon={Layers} title="Software Requirements">
            <div className="space-y-4">
              {s3.purpose && <Field label="Purpose" value={<p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{s3.purpose}</p>} />}
              {(s3.keyFeatures?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Key Features ({s3.keyFeatures!.length})</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {s3.keyFeatures!.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-foreground">
                        <CheckCircle2 size={13} className="text-primary flex-shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionBlock>
        )}

        {/* Section 3.5: Detailed Requirements Notes (rich text) */}
        {s35.detailedNotes && s35.detailedNotes !== "<p></p>" && (
          <SectionBlock icon={FileText} title="Detailed Requirements Notes">
            <div
              className="prose prose-sm max-w-none text-foreground
                prose-headings:font-semibold prose-headings:text-foreground
                prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground
                prose-ul:text-sm prose-ol:text-sm
                prose-li:text-foreground prose-li:leading-relaxed
                prose-strong:text-foreground prose-strong:font-semibold
                prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
                prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:text-xs
                prose-a:text-primary prose-a:underline
                prose-hr:border-border"
              dangerouslySetInnerHTML={{ __html: s35.detailedNotes }}
            />
          </SectionBlock>
        )}

        {/* Section 4: Technical Requirements */}
        {((s4.integrations?.length ?? 0) > 0 || (s4.techStack?.length ?? 0) > 0 || s4.hosting || s4.security) && (
          <SectionBlock icon={Wrench} title="Technical Requirements">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Hosting" value={s4.hosting} />
                <Field label="Security" value={s4.security} />
              </div>
              {(s4.integrations?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Third-Party Integrations</p>
                  <TagList items={s4.integrations} />
                </div>
              )}
              {(s4.techStack?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Technology Stack</p>
                  <TagList items={s4.techStack} />
                </div>
              )}
            </div>
          </SectionBlock>
        )}

        {/* Section 5 + 6: Budget & Timeline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* Budget */}
          {(s5.paymentStructure || s5.additionalCosts || milestonesTotal > 0) && (
            <SectionBlock icon={DollarSign} title="Budget & Costing">
              <div className="space-y-3">
                <Field label="Payment Structure" value={s5.paymentStructure} />
                {s5.additionalCosts && <Field label="Additional Costs" value={s5.additionalCosts} />}
                {milestonesTotal > 0 && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Budget</span>
                    <span className="text-base font-bold text-primary">
                      £{milestonesTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </SectionBlock>
          )}

          {/* Timeline */}
          {(s6.startDate || s6.deliveryDate) && (
            <SectionBlock icon={Clock} title="Project Timeline">
              <div className="space-y-3">
                <Field label="Start Date" value={formatDate(s6.startDate)} />
                <Field label="Delivery Date" value={formatDate(s6.deliveryDate)} />
                {s6.startDate && s6.deliveryDate && (() => {
                  try {
                    const days = Math.ceil((new Date(s6.deliveryDate).getTime() - new Date(s6.startDate).getTime()) / 86400000);
                    const weeks = Math.round(days / 7);
                    return <Field label="Duration" value={`${days} days (~${weeks} weeks)`} />;
                  } catch { return null; }
                })()}
              </div>
            </SectionBlock>
          )}
        </div>

        {/* Milestones table */}
        {milestones.length > 0 && milestones.some((m) => m.title || m.date || m.payment) && (
          <SectionBlock icon={Calendar} title="Project Milestones">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-8">#</th>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Milestone</th>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Due Date</th>
                    <th className="text-right py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Payment</th>
                    <th className="text-center py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Payment</th>
                    <th className="text-center py-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Task</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m, i) => (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-2">
                        <span className="inline-flex w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold items-center justify-center">{i + 1}</span>
                      </td>
                      <td className="py-2.5 px-2 font-medium text-foreground">
                        {m.title || <span className="text-muted-foreground italic">Milestone {i + 1}</span>}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground hidden sm:table-cell">
                        {m.date ? formatDate(m.date) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-foreground tabular-nums">
                        {formatCurrency(m.payment) ?? "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center hidden sm:table-cell">
                        {m.paymentStatus ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${PAYMENT_STATUS_COLORS[m.paymentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                            {m.paymentStatus}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center hidden md:table-cell">
                        <span className={`text-xs font-medium ${TASK_STATUS_COLORS[m.taskStatus] ?? "text-muted-foreground"}`}>
                          {m.taskStatus || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {milestonesTotal > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-primary/20">
                      <td colSpan={2} className="py-2.5 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</td>
                      <td className="hidden sm:table-cell" />
                      <td className="py-2.5 px-2 text-right text-base font-bold text-primary tabular-nums">
                        £{milestonesTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="hidden sm:table-cell" />
                      <td className="hidden md:table-cell" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </SectionBlock>
        )}

        {/* Section 7: Support & Maintenance */}
        {(s7.postLaunch || s7.maintenance) && (
          <SectionBlock icon={Target} title="Support & Maintenance">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {s7.postLaunch && <Field label="Post-Launch Support" value={<p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{s7.postLaunch}</p>} />}
              <Field label="Maintenance Duration" value={s7.maintenance} />
            </div>
          </SectionBlock>
        )}

        {/* Confirmation / signature strip */}
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-6 py-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Client Confirmation</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            Please review the requirements outlined in this document carefully. If everything looks correct, you may confirm your agreement below or contact us with any amendments before we proceed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Signature blocks */}
            {["Client Signature", "Onesoft Representative"].map((label) => (
              <div key={label}>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{label}</p>
                <div className="border-b-2 border-dashed border-border h-10 mb-2" />
                <div className="flex justify-between text-xs text-muted-foreground/70">
                  <span>Name: _______________</span>
                  <span>Date: _______________</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white mt-10 print:mt-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
            <div className="flex flex-col items-center sm:items-start gap-2">
              <img src={logoUrl} alt="Onesoft" className="h-6 w-auto object-contain" />
              <p className="text-xs text-muted-foreground">Crafting smart software solutions.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 text-xs text-muted-foreground">
              <a href="tel:+447984273482" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Phone className="w-3 h-3 text-primary flex-shrink-0" /> +44 7984 273482 (UK)
              </a>
              <a href="tel:+923334199233" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Phone className="w-3 h-3 text-primary flex-shrink-0" /> +92 333 4199233 (PK)
              </a>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary flex-shrink-0" /> Hull, United Kingdom
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary flex-shrink-0" /> Islamabad, Pakistan
              </span>
              <a href="mailto:info@onesoft.org.uk" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Mail className="w-3 h-3 text-primary flex-shrink-0" /> info@onesoft.org.uk
              </a>
              <a href="https://www.onesoft.org.uk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Globe className="w-3 h-3 text-primary flex-shrink-0" /> www.onesoft.org.uk
              </a>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground/60">
            <span>© {new Date().getFullYear()} Onesoft. All rights reserved.</span>
            <span className="flex items-center gap-1">
              <Circle size={6} className="fill-current" />
              Confidential — for client review only
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
