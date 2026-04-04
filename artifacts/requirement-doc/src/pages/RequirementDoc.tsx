import { useState } from "react";
import { Calendar, ChevronDown, Building2, User, Globe, Phone, Mail, Briefcase, Target, Layers, Clock, DollarSign, Wrench, FileText, CheckSquare, Tag, MapPin, PenLine } from "lucide-react";
import onesoftLogo from "@assets/Onesoft_Logo_1775302706939.png";
import RichTextEditor from "@/components/RichTextEditor";

const TEAM_MEMBERS = [
  "Alice Johnson",
  "Bob Martinez",
  "Clara Chen",
  "David Kim",
  "Emma Patel",
  "Frank Nguyen",
];

const CLIENTS = [
  {
    name: "TechNova Solutions",
    contact: "+1 (415) 555-0182",
    email: "contact@technovasolutions.com",
    company: "TechNova Solutions Inc.",
    industry: "Software & Technology",
    website: "www.technovasolutions.com",
  },
  {
    name: "GreenPath Retail",
    contact: "+1 (212) 555-0347",
    email: "hello@greenpathretail.com",
    company: "GreenPath Retail LLC",
    industry: "E-commerce & Retail",
    website: "www.greenpathretail.com",
  },
  {
    name: "HealthFirst Clinics",
    contact: "+1 (312) 555-0293",
    email: "info@healthfirstclinics.com",
    company: "HealthFirst Medical Group",
    industry: "Healthcare & Wellness",
    website: "www.healthfirstclinics.com",
  },
  {
    name: "FinEdge Capital",
    contact: "+1 (646) 555-0418",
    email: "team@finedgecapital.com",
    company: "FinEdge Capital Partners",
    industry: "Financial Services",
    website: "www.finedgecapital.com",
  },
];

const BUSINESS_TYPES = ["B2B", "B2C", "B2B2C", "SaaS", "Marketplace", "Non-profit", "Government", "Other"];

const KEY_FEATURES_OPTIONS = [
  "Lead Management",
  "Customer CRM",
  "Payment Processing",
  "Analytics & Reporting",
  "User Roles & Permissions",
  "Email Notifications",
  "SMS Notifications",
  "Inventory Management",
  "Document Management",
  "API Integrations",
  "Mobile App",
  "Multi-language Support",
  "Audit Logs",
  "Custom Dashboards",
  "Real-time Chat",
  "Workflow Automation",
];

const HOSTING_OPTIONS = ["Cloud (AWS / Azure / GCP)", "On-premise", "Hybrid", "Managed Hosting", "Not Decided"];
const MAINTENANCE_OPTIONS = ["3 months", "6 months", "1 year", "2 years", "Ongoing"];
const PAYMENT_STRUCTURES = ["Fixed Price", "Hourly Rate", "Payment Milestones", "Retainer", "Time & Material"];

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
        <Icon className="w-4.5 h-4.5 text-primary" size={18} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
      {label}
      {required && <span className="text-primary ml-1">*</span>}
    </label>
  );
}

function TextInput({ placeholder, value, onChange, rows }: { placeholder?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  if (rows) {
    return (
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
    />
  );
}

function SelectInput({ options, value, onChange, placeholder }: { options: string[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-9"
      >
        <option value="" disabled>{placeholder || "Select an option"}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-9"
      />
      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function ReadOnlyField({ value, placeholder }: { value: string; placeholder?: string }) {
  return (
    <div className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/40 text-sm min-h-[42px]">
      {value ? (
        <span className="text-foreground">{value}</span>
      ) : (
        <span className="text-muted-foreground/50 italic">{placeholder || "Auto-populated"}</span>
      )}
    </div>
  );
}

function MultiSelectFeatures({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = KEY_FEATURES_OPTIONS.filter(
    (f) => f.toLowerCase().includes(search.toLowerCase()) && !selected.includes(f)
  );

  const toggle = (feature: string) => {
    if (selected.includes(feature)) {
      onChange(selected.filter((f) => f !== feature));
    } else {
      onChange([...selected, feature]);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-border bg-background flex flex-wrap gap-1.5 cursor-text focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all"
        onClick={() => setOpen(true)}
      >
        {selected.map((f) => (
          <span
            key={f}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
          >
            {f}
            <button
              onClick={(e) => { e.stopPropagation(); toggle(f); }}
              className="text-primary/60 hover:text-primary ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
        {selected.length === 0 && !open && (
          <span className="text-muted-foreground/60 text-sm italic">Search and select features...</span>
        )}
        {open && (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Type to search..."
            className="flex-1 min-w-24 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground/60"
          />
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto z-10 relative">
          {filtered.map((f) => (
            <button
              key={f}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { toggle(f); setSearch(""); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
            >
              <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormField({ children, label, required, hint }: { children: React.ReactNode; label: string; required?: boolean; hint?: string }) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-border/60 my-8" />;
}

export default function RequirementDoc() {
  const today = new Date().toISOString().split("T")[0];

  const [docTitle, setDocTitle] = useState("");
  const [docDate, setDocDate] = useState(today);
  const [preparedBy, setPreparedBy] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [keyProducts, setKeyProducts] = useState("");
  const [businessGoals, setBusinessGoals] = useState("");
  const [keyChallenges, setKeyChallenges] = useState("");
  const [currentSystems, setCurrentSystems] = useState("");
  const [purpose, setPurpose] = useState("");
  const [keyFeatures, setKeyFeatures] = useState<string[]>([]);
  const [integrations, setIntegrations] = useState("");
  const [techStack, setTechStack] = useState("");
  const [hosting, setHosting] = useState("");
  const [security, setSecurity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [milestones, setMilestones] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [budget, setBudget] = useState("");
  const [paymentStructure, setPaymentStructure] = useState("");
  const [additionalCosts, setAdditionalCosts] = useState("");
  const [postLaunch, setPostLaunch] = useState("");
  const [maintenance, setMaintenance] = useState("");
  const [versionHistory, setVersionHistory] = useState("");
  const [detailedNotes, setDetailedNotes] = useState("");

  const client = CLIENTS.find((c) => c.name === selectedClient);

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Site Header */}
      <header className="bg-white border-b border-border sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <img src={onesoftLogo} alt="Onesoft" className="h-8 w-auto object-contain" />
          <div className="hidden sm:flex items-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              Hull, UK &middot; Islamabad, Pakistan
            </span>
            <a href="tel:+447984273482" className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <Phone className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              +44 7984 273482
            </a>
            <a href="https://www.onesoft.org.uk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <Globe className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              onesoft.org.uk
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">

        {/* Document Header */}
        <div className="mb-10 pb-8 border-b border-border">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Customer Requirement Collection</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            {docTitle || <span className="text-muted-foreground/50 italic font-normal">Untitled Document</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fill in all required fields to generate a complete software requirements document for your client.
          </p>
        </div>

        {/* Section 1: Document Information */}
        <section>
          <SectionHeader icon={FileText} title="1. Document Information" subtitle="Basic details about this requirement document" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FormField label="Document Title" required hint="e.g. Software Requirements for Acme Corp">
                <TextInput value={docTitle} onChange={setDocTitle} placeholder="Enter document title..." />
              </FormField>
            </div>
            <FormField label="Date" required>
              <DateInput value={docDate} onChange={setDocDate} />
            </FormField>
            <FormField label="Prepared By" required hint="Select the team member preparing this document">
              <SelectInput options={TEAM_MEMBERS} value={preparedBy} onChange={setPreparedBy} placeholder="Select team member" />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Client Name" required hint="Select from existing leads/customers or add new">
                <SelectInput
                  options={CLIENTS.map((c) => c.name)}
                  value={selectedClient}
                  onChange={setSelectedClient}
                  placeholder="Select or add client"
                />
              </FormField>
            </div>

            <FormField label="Contact Info" hint="Auto-populated from client record">
              <ReadOnlyField
                value={client ? `${client.contact} · ${client.email}` : ""}
                placeholder="Select a client to auto-populate"
              />
            </FormField>
            <FormField label="Company Name" hint="Auto-populated from client record">
              <ReadOnlyField value={client?.company ?? ""} placeholder="Select a client to auto-populate" />
            </FormField>
            <FormField label="Industry" hint="Auto-populated from client record">
              <ReadOnlyField value={client?.industry ?? ""} placeholder="Select a client to auto-populate" />
            </FormField>
            <FormField label="Website" hint="Auto-populated from client record">
              <ReadOnlyField value={client?.website ?? ""} placeholder="Select a client to auto-populate" />
            </FormField>
          </div>
        </section>

        <SectionDivider />

        {/* Section 2: Business Information */}
        <section>
          <SectionHeader icon={Briefcase} title="2. Business Information" subtitle="Understanding the client's business context and goals" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField label="Business Type" required>
              <SelectInput options={BUSINESS_TYPES} value={businessType} onChange={setBusinessType} placeholder="Select business type" />
            </FormField>
            <FormField label="Target Audience" required hint="Age group, profession, and geographical location">
              <TextInput value={targetAudience} onChange={setTargetAudience} placeholder="e.g. Professionals aged 25-45 in North America..." />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Key Products / Services" required hint="Main products or services offered by the client">
                <TextInput value={keyProducts} onChange={setKeyProducts} placeholder="e.g. SaaS platform, consulting services, retail products..." />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Business Goals" required hint="Primary goals the client aims to achieve">
                <TextInput value={businessGoals} onChange={setBusinessGoals} rows={3} placeholder="e.g. Increase monthly active users by 30%, streamline operations..." />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Key Challenges" hint="Major problems or challenges the client currently faces">
                <TextInput value={keyChallenges} onChange={setKeyChallenges} rows={3} placeholder="e.g. Manual processes, customer acquisition, data silos..." />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Current Software or Systems Used" hint="CRM, ERP, inventory tools, or other existing platforms">
                <TextInput value={currentSystems} onChange={setCurrentSystems} placeholder="e.g. Salesforce CRM, QuickBooks, legacy inventory system..." />
              </FormField>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Section 3: Software Requirements */}
        <section>
          <SectionHeader icon={Layers} title="3. Software Requirements" subtitle="Core functionality and feature specifications" />
          <div className="space-y-5">
            <FormField label="Purpose" required hint="The main problem this software will solve or functionality it will provide">
              <TextInput value={purpose} onChange={setPurpose} rows={3} placeholder="Describe the primary purpose of the software solution..." />
            </FormField>
            <FormField label="Key Features" required hint="Select all features required. You can search and add custom features.">
              <MultiSelectFeatures selected={keyFeatures} onChange={setKeyFeatures} />
            </FormField>

            {/* Summary Card */}
            {(purpose || keyFeatures.length > 0) && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">Client Requirements Summary</span>
                </div>
                {purpose && (
                  <div className="mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purpose</span>
                    <p className="text-sm text-foreground mt-1">{purpose}</p>
                  </div>
                )}
                {keyFeatures.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Selected Features ({keyFeatures.length})</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {keyFeatures.map((f) => (
                        <span key={f} className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-medium">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <SectionDivider />

        {/* Section 3.5: Detailed Requirements Notes */}
        <section>
          <SectionHeader
            icon={PenLine}
            title="Detailed Requirements Notes"
            subtitle="Use this space to document any additional client requirements, discussions, or specifications in detail"
          />
          <RichTextEditor
            value={detailedNotes}
            onChange={setDetailedNotes}
            placeholder="Document detailed client requirements, meeting notes, feature specifications, user stories, or any additional context here. Supports rich formatting — headings, lists, bold, links, and more."
          />
        </section>

        <SectionDivider />

        {/* Section 4: Technical Requirements */}
        <section>
          <SectionHeader icon={Wrench} title="4. Technical Requirements" subtitle="Technology stack, integrations, and infrastructure" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FormField label="Third-Party Integrations" hint="Payment gateways, CRMs, email marketing tools, etc.">
                <TextInput value={integrations} onChange={setIntegrations} placeholder="e.g. Stripe, Mailchimp, Salesforce, Twilio..." />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Technology Stack" hint="Preferred frontend, backend, database, and API technologies">
                <TextInput value={techStack} onChange={setTechStack} placeholder="e.g. Frontend: React, Backend: Node.js, Database: PostgreSQL..." />
              </FormField>
            </div>
            <FormField label="Hosting Requirements" required>
              <SelectInput options={HOSTING_OPTIONS} value={hosting} onChange={setHosting} placeholder="Select hosting type" />
            </FormField>
            <FormField label="Security Requirements" hint="Data encryption, MFA, access controls, compliance needs">
              <TextInput value={security} onChange={setSecurity} placeholder="e.g. AES-256 encryption, MFA, GDPR compliance..." />
            </FormField>
          </div>
        </section>

        <SectionDivider />

        {/* Section 5: Project Timeline */}
        <section>
          <SectionHeader icon={Clock} title="5. Project Timeline" subtitle="Milestones, start date, and expected delivery" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField label="Start Date" required>
              <DateInput value={startDate} onChange={setStartDate} />
            </FormField>
            <FormField label="Expected Delivery Date" required>
              <DateInput value={deliveryDate} onChange={setDeliveryDate} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Milestones" hint="Key phases and their expected completion dates">
                <TextInput
                  value={milestones}
                  onChange={setMilestones}
                  rows={4}
                  placeholder="e.g.&#10;Week 1-2: Requirements & Design&#10;Week 3-6: Development Phase&#10;Week 7: Testing & QA&#10;Week 8: Deployment & Launch"
                />
              </FormField>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Section 6: Budget */}
        <section>
          <SectionHeader icon={DollarSign} title="6. Budget" subtitle="Estimated costs and payment arrangements" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField label="Estimated Budget Range" required hint="Provide a min-max range (e.g. $10,000 – $25,000)">
              <TextInput value={budget} onChange={setBudget} placeholder="e.g. $10,000 – $25,000" />
            </FormField>
            <FormField label="Payment Structure" required>
              <SelectInput options={PAYMENT_STRUCTURES} value={paymentStructure} onChange={setPaymentStructure} placeholder="Select payment structure" />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Additional Costs" hint="Hosting fees, licenses, third-party service costs, etc.">
                <TextInput value={additionalCosts} onChange={setAdditionalCosts} placeholder="e.g. $50/mo hosting, $200/yr software license..." />
              </FormField>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Section 7: Support & Maintenance */}
        <section>
          <SectionHeader icon={Target} title="7. Support & Maintenance" subtitle="Post-launch support and ongoing maintenance plans" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FormField label="Post-Launch Support" hint="Bug fixes, updates, improvements after go-live">
                <TextInput
                  value={postLaunch}
                  onChange={setPostLaunch}
                  rows={3}
                  placeholder="e.g. 30-day bug fix warranty, monthly feature updates, dedicated support channel..."
                />
              </FormField>
            </div>
            <FormField label="Maintenance Duration" required>
              <SelectInput options={MAINTENANCE_OPTIONS} value={maintenance} onChange={setMaintenance} placeholder="Select duration" />
            </FormField>
          </div>
        </section>

        <SectionDivider />

        {/* Footer */}
        <section>
          <div className="rounded-xl bg-muted/50 border border-border p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded bg-muted-foreground/10 flex items-center justify-center">
                <FileText className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Document Footer</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <FormField label="Version History" hint="e.g. Version 1.0 – Apr 04, 2026 – Initial Draft">
                  <TextInput value={versionHistory} onChange={setVersionHistory} placeholder="Version 1.0 – [Date] – Initial Draft" />
                </FormField>
              </div>
              <FormField label="Prepared By (Auto)" hint="Populated from document header">
                <ReadOnlyField value={preparedBy} placeholder="Set in document header" />
              </FormField>
              <FormField label="Document Date" hint="Auto-populated from header">
                <ReadOnlyField value={docDate} />
              </FormField>
            </div>
          </div>
        </section>

        {/* Bottom padding */}
        <div className="h-10" />
      </div>

      {/* Site Footer */}
      <footer className="border-t border-border bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
            {/* Logo & tagline */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <img src={onesoftLogo} alt="Onesoft" className="h-7 w-auto object-contain" />
              <p className="text-xs text-muted-foreground">Crafting smart software solutions.</p>
            </div>

            {/* Contact details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 text-xs text-muted-foreground">
              <a href="tel:+447984273482" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Phone className="w-3 h-3 text-primary flex-shrink-0" />
                +44 7984 273482 (UK)
              </a>
              <a href="tel:+923334199233" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Phone className="w-3 h-3 text-primary flex-shrink-0" />
                +92 333 4199233 (PK)
              </a>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                Hull, United Kingdom
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                Islamabad, Pakistan
              </span>
              <a
                href="https://www.onesoft.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-primary transition-colors sm:col-span-2"
              >
                <Globe className="w-3 h-3 text-primary flex-shrink-0" />
                www.onesoft.org.uk
              </a>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground/60">
            <span>© {new Date().getFullYear()} Onesoft. All rights reserved.</span>
            <span>Customer Requirement Collection Document</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
