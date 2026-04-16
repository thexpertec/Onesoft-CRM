import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  FileText, Briefcase, DollarSign, Clock,
  ChevronDown, Calendar, Check, Save, PenLine, Tag, CheckSquare,
  ArrowLeft, Lock, Plus, X, Trash2, LayoutTemplate, Image as ImageIcon, GripVertical,
  Eye, EyeOff,
} from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";
import { useDocs, useLeads, useCustomers } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { getTeamMembers, addTeamMember, getDoc, RequirementDoc, Lead, Customer, LegalDocument, getSettings } from "@/lib/store";
import { CURRENCIES, formatAmount } from "@/lib/currencies";

const BUSINESS_TYPES = ["Services", "Products", "E-commerce", "Healthcare", "Education", "Finance & Fintech", "Real Estate", "Logistics", "Media & Entertainment", "Non-profit / Charity", "Other"];

const PRODUCTS_BY_TYPE: Record<string, string[]> = {
  Services: ["Consulting", "IT Support", "Managed Services", "Marketing & Advertising", "HR & Recruitment", "Training & Development", "Legal Services", "Accounting & Bookkeeping", "Cleaning & Facilities", "Security Services", "Event Management", "Translation & Localisation"],
  Products: ["Physical Goods", "Manufactured Products", "Consumer Electronics", "Clothing & Apparel", "Food & Beverage", "Health & Beauty", "Home & Garden", "Industrial Equipment", "Office Supplies", "Sports & Outdoor", "Toys & Games", "Vehicle Parts"],
  "E-commerce": ["Online Retail Store", "Marketplace Platform", "Subscription Box Service", "Digital Downloads", "Print on Demand", "Dropshipping", "Wholesale / B2B Portal", "Auction Platform", "Rental Marketplace", "Booking & Reservation System"],
  Healthcare: ["Patient Management System", "Appointment Booking", "Telemedicine Platform", "Electronic Health Records (EHR)", "Medical Billing", "Pharmacy Management", "Lab Results Portal", "Care Home Management", "Mental Health Platform", "Wearable Health Integration"],
  Education: ["Learning Management System (LMS)", "Student Portal", "Online Course Platform", "Tutoring Marketplace", "School Management System", "Assessment & Exam Platform", "E-library", "CPD / Professional Development", "Gamified Learning App", "Parent-Teacher Communication"],
  "Finance & Fintech": ["Payment Gateway", "Digital Wallet", "Open Banking Integration", "Loan & Credit Platform", "Insurance Portal", "Investment Dashboard", "Accounting Software", "Expense Management", "Financial Reporting", "Crypto / Blockchain"],
  "Real Estate": ["Property Listings Portal", "Lettings Management", "Property CRM", "Tenant Portal", "Maintenance Request System", "Virtual Property Tours", "Conveyancing Platform", "Commercial Property Management", "Short-let / Airbnb Management"],
  Logistics: ["Fleet Management", "Route Optimisation", "Delivery Tracking", "Warehouse Management", "Order Fulfilment", "Last-Mile Delivery", "Freight & Shipping Portal", "Inventory Control", "Returns Management", "Cold Chain Monitoring"],
  "Media & Entertainment": ["Streaming Platform", "Podcast Platform", "News & Publishing Portal", "Event Ticketing", "Digital Agency CMS", "Social Media Management", "Video Production Tools", "Music / Audio Platform", "E-book / Digital Publishing", "Advertising & Campaign Management"],
};

const COMBINED_OPTIONS = Array.from(new Set([...PRODUCTS_BY_TYPE.Services, ...PRODUCTS_BY_TYPE.Products]));

function getProductOptions(businessType: string): string[] {
  if (PRODUCTS_BY_TYPE[businessType]) return PRODUCTS_BY_TYPE[businessType];
  return COMBINED_OPTIONS;
}

const KEY_FEATURES_OPTIONS = [
  "Lead Management", "Customer CRM", "Payment Processing", "Analytics & Reporting", "User Roles & Permissions",
  "Email Notifications", "SMS Notifications", "Inventory Management", "Document Management", "API Integrations",
  "Mobile App", "Multi-language Support", "Audit Logs", "Custom Dashboards", "Real-time Chat", "Workflow Automation",
];

const PAYMENT_STRUCTURES = ["Fixed Price", "Hourly Rate", "Payment Milestones", "Retainer", "Time & Material"];


// ─── UI Components ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
        <Icon className="text-primary" size={18} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function EditableSectionHeader({
  icon: Icon, title, onTitleChange, subtitle, onSubtitleChange,
}: {
  icon: React.ElementType; title: string; onTitleChange: (v: string) => void;
  subtitle: string; onSubtitleChange: (v: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
        <Icon className="text-primary" size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="Section title…"
          className="block w-full text-base font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary/50 focus:outline-none pb-0.5 transition-colors"
        />
        <input
          value={subtitle}
          onChange={e => onSubtitleChange(e.target.value)}
          placeholder="Section description…"
          className="block w-full text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border/60 focus:border-primary/30 focus:outline-none mt-1 pb-0.5 transition-colors"
        />
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
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
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

function MultiSelectFeatures({
  selected, onChange, options = KEY_FEATURES_OPTIONS, placeholder = "Search and select...",
}: {
  selected: string[]; onChange: (v: string[]) => void; options?: string[]; placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const trimmed = search.trim();
  const filtered = options.filter((f) => f.toLowerCase().includes(search.toLowerCase()) && !selected.includes(f));
  const canCreate = trimmed.length > 0 && !selected.includes(trimmed) && !options.some(o => o.toLowerCase() === trimmed.toLowerCase());
  const toggle = (feature: string) => {
    onChange(selected.includes(feature) ? selected.filter((f) => f !== feature) : [...selected, feature]);
  };
  const addCustom = () => {
    if (!trimmed) return;
    onChange([...selected, trimmed]);
    setSearch("");
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canCreate) { e.preventDefault(); addCustom(); }
  };
  const showDropdown = open && (filtered.length > 0 || canCreate);
  return (
    <div className="space-y-2">
      <div
        className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-border bg-background flex flex-wrap gap-1.5 cursor-text focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all"
        onClick={() => setOpen(true)}
      >
        {selected.map((f) => (
          <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
            {f}
            <button onClick={(e) => { e.stopPropagation(); toggle(f); }} className="text-primary/60 hover:text-primary ml-0.5">×</button>
          </span>
        ))}
        {selected.length === 0 && !open && <span className="text-muted-foreground/60 text-sm italic">{placeholder}</span>}
        {open && (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder="Type to search or add custom..."
            className="flex-1 min-w-24 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground/60"
          />
        )}
      </div>
      {showDropdown && (
        <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden max-h-56 overflow-y-auto z-10 relative">
          {canCreate && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addCustom()}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center gap-2 border-b border-border/50"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-primary text-white text-[10px] font-bold flex-shrink-0">+</span>
              Add &ldquo;{trimmed}&rdquo;
            </button>
          )}
          {filtered.map((f) => (
            <button key={f} onMouseDown={(e) => e.preventDefault()} onClick={() => { toggle(f); setSearch(""); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />{f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormField({ children, label, required, hint, templateAction }: { children: React.ReactNode; label: string; required?: boolean; hint?: React.ReactNode; templateAction?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}{required && <span className="text-primary ml-1">*</span>}
        </label>
        {templateAction}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

// Self-contained per-field template picker — always visible, shows all docs that have content for this field
function FieldTplPicker({ docs, extract, onSelect }: {
  docs: RequirementDoc[];
  extract: (d: RequirementDoc) => string | undefined;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const available = docs.filter(d => { const v = extract(d); return v && v.trim() && v !== "<p></p>"; });
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-primary/70 hover:text-primary bg-primary/5 hover:bg-primary/10 border border-primary/15 hover:border-primary/30 transition-colors"
        title="Load this field from a saved document"
      >
        <LayoutTemplate size={10} /> Templates
        <ChevronDown size={9} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-60 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Load from saved document</p>
          </div>
          {available.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">No saved documents have content for this field yet.</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Save a document first to use it as a template here.</p>
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto">
              {available.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => { onSelect(extract(d)!); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors flex items-center gap-2 border-b border-border/30 last:border-0"
                >
                  <FileText size={11} className="text-muted-foreground flex-shrink-0" />
                  <span className="truncate text-foreground">{d.title || d.clientName || "Untitled"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Custom searchable dropdown showing leads + customers with colored tags
function ClientPicker({ leads, customers, value, onChange }: {
  leads: Lead[];
  customers: Customer[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  type Entry = { name: string; kind: "lead" | "customer"; sub: string };
  const all: Entry[] = [
    ...leads.map(l => ({ name: l.name, kind: "lead" as const, sub: l.company || l.status })),
    ...customers.map(c => ({ name: c.name, kind: "customer" as const, sub: c.company || c.status })),
  ];
  const filtered = search
    ? all.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.sub.toLowerCase().includes(search.toLowerCase()))
    : all;

  const isEmpty = leads.length === 0 && customers.length === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { if (!isEmpty) setOpen(o => !o); }}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
          isEmpty ? "border-dashed border-border bg-muted/30 text-muted-foreground cursor-not-allowed" :
          "border-border bg-background text-foreground hover:border-primary/40 cursor-pointer"
        } ${open ? "border-primary ring-2 ring-primary/20" : ""}`}
        disabled={isEmpty}
      >
        <span className={value ? "text-foreground font-medium" : "text-muted-foreground/60"}>
          {value || (isEmpty ? "No leads or clients yet — add them first" : "Select client or lead…")}
        </span>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or company…"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          {/* Legend */}
          <div className="px-3 py-1.5 bg-muted/30 border-b border-border flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" /> Lead
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" /> Client
            </span>
          </div>
          {/* List */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches found</div>
            ) : (
              filtered.map(entry => (
                <button
                  key={`${entry.kind}-${entry.name}`}
                  type="button"
                  onClick={() => { onChange(entry.name); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/60 transition-colors border-b border-border/30 last:border-0 ${value === entry.name ? "bg-primary/5" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
                    {entry.sub && <p className="text-xs text-muted-foreground truncate">{entry.sub}</p>}
                  </div>
                  <span className={`flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                    entry.kind === "lead"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  }`}>
                    {entry.kind === "lead" ? "Lead" : "Client"}
                  </span>
                </button>
              ))
            )}
          </div>
          {/* Clear selection */}
          {value && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                className="w-full text-xs text-muted-foreground hover:text-destructive text-center py-1 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// "Load template" button for RichTextEditor sections — sources from Settings → Legal Documents (marked isTemplate)
function RichTextTplPicker({ onChange }: { onChange: (html: string) => void }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<LegalDocument[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Refresh templates every time the dropdown is opened
  useEffect(() => {
    if (open) {
      const settings = getSettings();
      setTemplates((settings.legalDocuments ?? []).filter((d: LegalDocument) => d.isTemplate));
    }
  }, [open]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Strip HTML tags to produce a plain-text preview snippet
  const plainText = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md px-2.5 py-1.5 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors whitespace-nowrap"
      >
        <LayoutTemplate size={12} />
        Load template
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 min-w-[260px] max-h-64 overflow-hidden bg-background border border-border rounded-lg shadow-lg flex flex-col">
          <div className="px-3 py-2 border-b border-border/60 flex-shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Load from saved templates</p>
          </div>
          <div className="overflow-y-auto flex-1">
            {templates.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <LayoutTemplate size={18} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No templates yet</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Go to Settings → Legal Documents and mark a document as a template</p>
              </div>
            ) : (
              templates.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => { onChange(tpl.content); setOpen(false); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors border-b border-border/30 last:border-0 flex flex-col gap-0.5"
                >
                  <span className="text-sm font-medium text-foreground truncate">{tpl.title || "Untitled"}</span>
                  {tpl.content && (
                    <span className="text-xs text-muted-foreground truncate">
                      {plainText(tpl.content).slice(0, 70)}{plainText(tpl.content).length > 70 ? "…" : ""}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Image attachment strip for RichTextEditor sections ─────────────────────
function ImageAttachment({ images, onAdd, onRemove }: {
  images: string[];
  onAdd: (dataUrl: string) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        if (ev.target?.result) onAdd(ev.target.result as string);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  return (
    <div className="mt-3 space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((src, i) => (
            <div key={i} className="relative" style={{ width: "50%" }}>
              <img
                src={src}
                alt={`Attachment ${i + 1}`}
                className="w-full h-auto rounded-lg border border-border block"
                style={{ display: "block" }}
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                title="Remove image"
                className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors shadow"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-dashed border-border rounded-md px-3 py-1.5 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors"
      >
        <ImageIcon size={13} />
        Attach Image
      </button>
    </div>
  );
}

function SaveButton({ sectionKey, saved, dirty, onSave }: { sectionKey: string; saved: boolean; dirty?: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
      {dirty && !saved ? (
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <span className="inline-flex w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Unsaved changes
        </span>
      ) : <span />}
      <button type="button" onClick={onSave}
        className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
          saved
            ? "bg-green-50 text-green-700 border border-green-200 shadow-none"
            : dirty
              ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
              : "bg-primary text-white hover:bg-primary/90 shadow-sm"
        }`}>
        {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? "Saved!" : "Update"}
      </button>
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-border/60 my-8" />;
}

function PreparedByField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [members, setMembers] = useState<string[]>(() => getTeamMembers());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const updated = addTeamMember(trimmed);
    setMembers(updated);
    onChange(trimmed);
    setNewName("");
    setAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
    if (e.key === "Escape") { setAdding(false); setNewName(""); }
  };

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  return (
    <div className="space-y-2">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-9"
          >
            <option value="" disabled>Select team member</option>
            {members.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          title="Add new team member"
          className="flex-shrink-0 h-[42px] w-[42px] flex items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
        >
          {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
      {adding && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter full name..."
            className="flex-1 px-3 py-2 rounded-lg border border-primary/40 bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-all"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function NewDocument() {
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditMode = !!params.id;
  const DRAFT_KEY = isEditMode ? `admin-edit-doc-draft-${params.id}` : "admin-new-doc-draft";

  const { docs, addDoc, editDoc } = useDocs();
  const { leads } = useLeads();
  const { customers } = useCustomers();
  const { isAuthenticated, can } = useAuth();

  const today = new Date().toISOString().split("T")[0];

  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docDate, setDocDate] = useState(today);
  const [preparedBy, setPreparedBy] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const handleSelectClient = (name: string) => { setSelectedClient(name); if (name) setClientInfoOpen(true); };
  const [businessType, setBusinessType] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [keyProducts, setKeyProducts] = useState<string[]>([]);
  const handleBusinessTypeChange = (type: string) => {
    setBusinessType(type);
    const newOptions = getProductOptions(type);
    setKeyProducts((prev) => prev.filter((p) => newOptions.includes(p)));
  };
  const [businessGoals, setBusinessGoals] = useState("");
  const [keyChallenges, setKeyChallenges] = useState("");
  const [currentSystems, setCurrentSystems] = useState("");
  const [startDate, setStartDate] = useState("");
  const [milestones, setMilestones] = useState<{ id: string; title: string; date: string; payment: string; paymentStatus: string; taskStatus: string; }[]>([
    { id: "1", title: "", date: "", payment: "", paymentStatus: "", taskStatus: "" },
  ]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const addMilestone = () => setMilestones((prev) => [...prev, { id: Date.now().toString(), title: "", date: "", payment: "", paymentStatus: "", taskStatus: "" }]);
  const removeMilestone = (id: string) => setMilestones((prev) => prev.filter((m) => m.id !== id));
  const updateMilestone = (id: string, field: "title" | "date" | "payment" | "paymentStatus" | "taskStatus", value: string) =>
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));

  const [paymentStructure, setPaymentStructure] = useState("");
  const [additionalCosts, setAdditionalCosts] = useState("");

  type LineItem = { id: string; item: string; description: string; qty: string; perUnit: string; discount: string };
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", item: "", description: "", qty: "1", perUnit: "", discount: "0" },
  ]);
  const addLineItem = () => setLineItems(prev => [...prev, { id: Date.now().toString(), item: "", description: "", qty: "1", perUnit: "", discount: "0" }]);
  const removeLineItem = (id: string) => setLineItems(prev => prev.filter(r => r.id !== id));
  const updateLineItem = (id: string, field: keyof LineItem, value: string) =>
    setLineItems(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const lineItemTotals = lineItems.map(r => {
    const totalCost = (parseFloat(r.qty) || 0) * (parseFloat(r.perUnit) || 0);
    const discount  = parseFloat(r.discount) || 0;
    return { totalCost, subTotal: Math.max(0, totalCost - discount) };
  });
  const lineItemsGrandTotal = lineItemTotals.reduce((s, r) => s + r.subTotal, 0);
  const [currency, setCurrency] = useState("GBP");
  const [s5PublicVisible, setS5PublicVisible] = useState(true);
  const [s6PublicVisible, setS6PublicVisible] = useState(true);
  const [versionHistory, setVersionHistory] = useState("");
  const [detailedNotes, setDetailedNotes] = useState("");

  // Editable s35 header
  const [detailedNotesTitle, setDetailedNotesTitle] = useState("Detailed Requirements Notes");
  const [detailedNotesSubtitle, setDetailedNotesSubtitle] = useState("Use this space to document any additional client requirements, discussions, or specifications in detail");

  // Detailed notes images (s35 section)
  const [detailedNotesImages, setDetailedNotesImages] = useState<string[]>([]);
  const addDetailedNotesImage    = (url: string) => setDetailedNotesImages(prev => [...prev, url]);
  const removeDetailedNotesImage = (i: number)   => setDetailedNotesImages(prev => prev.filter((_, idx) => idx !== i));

  // Custom sections
  type CustomSection = { id: string; title: string; subtitle: string; content: string; images?: string[] };
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const updateCustomSection = (id: string, field: keyof CustomSection, value: string) =>
    setCustomSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  const addCustomSectionImage = (id: string, url: string) =>
    setCustomSections(prev => prev.map(s => s.id === id ? { ...s, images: [...(s.images ?? []), url] } : s));
  const removeCustomSectionImage = (id: string, i: number) =>
    setCustomSections(prev => prev.map(s => s.id === id ? { ...s, images: (s.images ?? []).filter((_, idx) => idx !== i) } : s));

  // Second set of custom sections — after financial sections
  const [customSections2, setCustomSections2] = useState<CustomSection[]>([]);
  const updateCustomSection2 = (id: string, field: keyof CustomSection, value: string) =>
    setCustomSections2(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  const addCustomSection2Image = (id: string, url: string) =>
    setCustomSections2(prev => prev.map(s => s.id === id ? { ...s, images: [...(s.images ?? []), url] } : s));
  const removeCustomSection2Image = (id: string, i: number) =>
    setCustomSections2(prev => prev.map(s => s.id === id ? { ...s, images: (s.images ?? []).filter((_, idx) => idx !== i) } : s));

  // ─── Section order (drag-and-drop) ──────────────────────────────────────────
  const DEFAULT_SECTION_ORDER = ["s2", "s35", "s5", "s6"];
  const [sectionOrder, setSectionOrder] = useState<string[]>(DEFAULT_SECTION_ORDER);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const addCustomSection = () => {
    const newId = Date.now().toString();
    setCustomSections(prev => [...prev, { id: newId, title: "Custom Section", subtitle: "", content: "", images: [] }]);
    setSectionOrder(prev => {
      const s5Idx = prev.indexOf("s5");
      const key = `sc:${newId}`;
      if (s5Idx >= 0) { const n = [...prev]; n.splice(s5Idx, 0, key); return n; }
      return [...prev, key];
    });
  };
  const removeCustomSection = (id: string) => {
    setCustomSections(prev => prev.filter(s => s.id !== id));
    setSectionOrder(prev => prev.filter(k => k !== `sc:${id}`));
  };

  const addCustomSection2 = () => {
    const newId = Date.now().toString();
    setCustomSections2(prev => [...prev, { id: newId, title: "Custom Section", subtitle: "", content: "", images: [] }]);
    setSectionOrder(prev => [...prev, `sc2:${newId}`]);
  };
  const removeCustomSection2 = (id: string) => {
    setCustomSections2(prev => prev.filter(s => s.id !== id));
    setSectionOrder(prev => prev.filter(k => k !== `sc2:${id}`));
  };

  // Template picker (page-level)
  const [templateOpen, setTemplateOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (templateRef.current && !templateRef.current.contains(e.target as Node)) setTemplateOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Unified lookup — works for both leads and customers
  const clientEntry = selectedClient
    ? (leads.find(l => l.name === selectedClient) ?? customers.find(c => c.name === selectedClient) ?? null)
    : null;
  const client = clientEntry; // kept for backward-compat references below

  // Per-section save (draft)
  const [savedSections, setSavedSections] = useState<Record<string, boolean>>({});
  const markSaved = useCallback((key: string) => {
    setSavedSections((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSavedSections((prev) => ({ ...prev, [key]: false })), 2000);
  }, []);

  // Dirty (unsaved) section tracking
  const initRef = useRef(false); // flips true after initial data load settles
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({});
  const markDirty = useCallback((key: string) => {
    if (!initRef.current) return;
    setDirtySections(prev => ({ ...prev, [key]: true }));
  }, []);
  const markClean = useCallback((key: string) => {
    setDirtySections(prev => ({ ...prev, [key]: false }));
  }, []);
  const dirtyCount = Object.values(dirtySections).filter(Boolean).length;

  const persist = (key: string, data: object) => {
    const existing = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...existing, [key]: data }));
  };

  const saveS1  = () => { persist("s1",  { docTitle, docDate, preparedBy, selectedClient, versionHistory }); markSaved("s1");  markClean("s1"); };
  const saveS2  = () => { persist("s2",  { businessType, targetAudience, keyProducts, businessGoals, keyChallenges, currentSystems }); markSaved("s2");  markClean("s2"); };
  const saveS35 = () => { persist("s35", { detailedNotes, detailedNotesTitle, detailedNotesSubtitle, detailedNotesImages }); markSaved("s35"); markClean("s35"); };
  const saveCustomSection = (id: string) => {
    const sec = customSections.find(s => s.id === id);
    if (!sec) return;
    const existing = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    const currentCustom: CustomSection[] = existing.sCustom?.sections ?? [];
    const idx = currentCustom.findIndex((s: CustomSection) => s.id === id);
    if (idx >= 0) currentCustom[idx] = sec; else currentCustom.push(sec);
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...existing, sCustom: { sections: currentCustom } }));
    markSaved(`sc_${id}`); markClean(`sc_${id}`);
  };
  const saveCustomSection2 = (id: string) => {
    const sec = customSections2.find(s => s.id === id);
    if (!sec) return;
    const existing = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    const currentCustom: CustomSection[] = existing.sCustom2?.sections ?? [];
    const idx = currentCustom.findIndex((s: CustomSection) => s.id === id);
    if (idx >= 0) currentCustom[idx] = sec; else currentCustom.push(sec);
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...existing, sCustom2: { sections: currentCustom } }));
    markSaved(`sc2_${id}`); markClean(`sc2_${id}`);
  };
  const saveS5  = () => { persist("s5",  { paymentStructure, additionalCosts, currency, lineItems, publicVisible: s5PublicVisible }); markSaved("s5"); markClean("s5"); };
  const saveS6  = () => { persist("s6",  { startDate, deliveryDate, milestones, publicVisible: s6PublicVisible }); markSaved("s6"); markClean("s6"); };

  // ─── Drag-and-drop handlers ──────────────────────────────────────────────────
  const handleDragStart = (id: string, e: React.DragEvent) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (id: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) setDragOverId(id);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverId(null);
  };
  const handleDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    setSectionOrder(prev => {
      const next = [...prev];
      const from = next.indexOf(dragId!);
      const to   = next.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      next.splice(from, 1);
      next.splice(to, 0, dragId!);
      return next;
    });
    setDragId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  // ─── Section label helper ────────────────────────────────────────────────────
  const getSectionLabel = (id: string): { label: string; icon: React.ElementType } => {
    if (id === 's2')  return { label: 'Business Information', icon: Briefcase };
    if (id === 's35') return { label: detailedNotesTitle || 'Detailed Notes', icon: FileText };
    if (id === 's5')  return { label: 'Budget & Costing', icon: DollarSign };
    if (id === 's6')  return { label: 'Project Timeline', icon: Clock };
    if (id.startsWith('sc:')) {
      const sec = customSections.find((s: CustomSection) => s.id === id.slice(3));
      return { label: sec?.title || 'Custom Section', icon: PenLine };
    }
    if (id.startsWith('sc2:')) {
      const sec = customSections2.find((s: CustomSection) => s.id === id.slice(4));
      return { label: sec?.title || 'Custom Section', icon: PenLine };
    }
    return { label: id, icon: FileText };
  };

  // ─── Active section tracker (IntersectionObserver) ────────────────────────
  useEffect(() => {
    const ids = ['s1', ...sectionOrder, 'footer'];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id.replace('section-', ''));
            break;
          }
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );
    ids.forEach(id => {
      const el = document.getElementById(`section-${id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionOrder]);

  // Load data on mount — edit mode loads from the saved document, new mode from draft
  useEffect(() => {
    const loadSections = (d: Record<string, unknown>) => {
      const s1 = (d.s1 ?? {}) as Record<string, unknown>;
      const s2 = (d.s2 ?? {}) as Record<string, unknown>;
      const s35 = (d.s35 ?? {}) as Record<string, unknown>;
      const s5 = (d.s5 ?? {}) as Record<string, unknown>;
      const s6 = (d.s6 ?? {}) as Record<string, unknown>;
      if (s1.docTitle)       setDocTitle(s1.docTitle as string);
      if (s1.docDate)        setDocDate(s1.docDate as string);
      if (s1.preparedBy)     setPreparedBy(s1.preparedBy as string);
      if (s1.selectedClient) setSelectedClient(s1.selectedClient as string);
      if (s1.versionHistory) setVersionHistory(s1.versionHistory as string);
      if (s2.businessType)   setBusinessType(s2.businessType as string);
      if (s2.targetAudience) setTargetAudience(s2.targetAudience as string);
      if (s2.keyProducts)    setKeyProducts(s2.keyProducts as string[]);
      if (s2.businessGoals)  setBusinessGoals(s2.businessGoals as string);
      if (s2.keyChallenges)  setKeyChallenges(s2.keyChallenges as string);
      if (s2.currentSystems) setCurrentSystems(s2.currentSystems as string);
      if (s35.detailedNotes)        setDetailedNotes(s35.detailedNotes as string);
      if (s35.detailedNotesTitle)   setDetailedNotesTitle(s35.detailedNotesTitle as string);
      if (s35.detailedNotesSubtitle) setDetailedNotesSubtitle(s35.detailedNotesSubtitle as string);
      if (Array.isArray(s35.detailedNotesImages)) setDetailedNotesImages(s35.detailedNotesImages as string[]);
      const sCustom = (d.sCustom ?? {}) as Record<string, unknown>;
      if (Array.isArray(sCustom.sections)) setCustomSections(sCustom.sections as CustomSection[]);
      const sCustom2 = (d.sCustom2 ?? {}) as Record<string, unknown>;
      if (Array.isArray(sCustom2.sections)) setCustomSections2(sCustom2.sections as CustomSection[]);
      if (s5.paymentStructure) setPaymentStructure(s5.paymentStructure as string);
      if (s5.additionalCosts)  setAdditionalCosts(s5.additionalCosts as string);
      if (s5.currency)         setCurrency(s5.currency as string);
      if (Array.isArray(s5.lineItems)) setLineItems(s5.lineItems as LineItem[]);
      if (s5.publicVisible === false) setS5PublicVisible(false);
      if (s6.startDate)      setStartDate(s6.startDate as string);
      if (s6.deliveryDate)   setDeliveryDate(s6.deliveryDate as string);
      if (s6.milestones)     setMilestones(s6.milestones as typeof milestones);
      if (s6.publicVisible === false) setS6PublicVisible(false);
      // Restore section order (or reconstruct from custom section IDs for older docs)
      if (Array.isArray(d.sectionOrder)) {
        setSectionOrder(d.sectionOrder as string[]);
      } else {
        // Older docs: build order from default + any custom sections that exist
        const sc1Keys = Array.isArray(sCustom.sections)
          ? (sCustom.sections as CustomSection[]).map((s: CustomSection) => `sc:${s.id}`)
          : [];
        const sc2Keys = Array.isArray(sCustom2.sections)
          ? (sCustom2.sections as CustomSection[]).map((s: CustomSection) => `sc2:${s.id}`)
          : [];
        setSectionOrder(["s2", "s35", ...sc1Keys, "s5", "s6", ...sc2Keys]);
      }
    };

    try {
      if (isEditMode && params.id) {
        // Edit mode: load from the saved document
        const existingDoc = getDoc(params.id);
        if (!existingDoc) { navigate("/documents"); return; }
        setDocTitle(existingDoc.title || "");
        const sections = (existingDoc.sections ?? {}) as Record<string, unknown>;
        loadSections(sections);
        // Also check for unsaved draft edits on top
        const draftRaw = localStorage.getItem(DRAFT_KEY);
        if (draftRaw) loadSections(JSON.parse(draftRaw));
      } else {
        // New mode: load from draft
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        loadSections(JSON.parse(raw));
      }
    } catch { /* ignore */ }
    // Let React flush all the state setters above before we start tracking edits
    setTimeout(() => { initRef.current = true; }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track which sections have unsaved edits
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { markDirty("s1");  }, [docTitle, docDate, preparedBy, selectedClient, versionHistory]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { markDirty("s2");  }, [businessType, targetAudience, keyProducts, businessGoals, keyChallenges, currentSystems]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { markDirty("s35"); }, [detailedNotes, detailedNotesTitle, detailedNotesSubtitle, detailedNotesImages]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { markDirty("s5");  }, [paymentStructure, additionalCosts, currency, lineItems, s5PublicVisible]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { markDirty("s6");  }, [startDate, deliveryDate, milestones, s6PublicVisible]);

  const milestonesTotal = milestones.reduce((sum, m) => sum + (parseFloat(m.payment.replace(/[^0-9.]/g, "")) || 0), 0);
  const formatCurrency = (n: number) => formatAmount(n, currency);

  // Template loader — copies all sections from a saved document into the current form
  const loadTemplate = (doc: RequirementDoc) => {
    setTemplateOpen(false);
    const d = (doc.sections ?? {}) as Record<string, unknown>;
    const s1 = (d.s1 ?? {}) as Record<string, unknown>;
    const s2 = (d.s2 ?? {}) as Record<string, unknown>;
    const s35 = (d.s35 ?? {}) as Record<string, unknown>;
    const sCustom = (d.sCustom ?? {}) as Record<string, unknown>;
    const sCustom2 = (d.sCustom2 ?? {}) as Record<string, unknown>;
    const s5 = (d.s5 ?? {}) as Record<string, unknown>;
    const s6 = (d.s6 ?? {}) as Record<string, unknown>;
    if (s1.docDate)        setDocDate(s1.docDate as string);
    if (s1.preparedBy)     setPreparedBy(s1.preparedBy as string);
    if (s1.versionHistory) setVersionHistory(s1.versionHistory as string);
    if (s2.businessType)   setBusinessType(s2.businessType as string);
    if (s2.targetAudience) setTargetAudience(s2.targetAudience as string);
    if (s2.keyProducts)    setKeyProducts(s2.keyProducts as string[]);
    if (s2.businessGoals)  setBusinessGoals(s2.businessGoals as string);
    if (s2.keyChallenges)  setKeyChallenges(s2.keyChallenges as string);
    if (s2.currentSystems) setCurrentSystems(s2.currentSystems as string);
    if (s35.detailedNotes)         setDetailedNotes(s35.detailedNotes as string);
    if (s35.detailedNotesTitle)    setDetailedNotesTitle(s35.detailedNotesTitle as string);
    if (s35.detailedNotesSubtitle) setDetailedNotesSubtitle(s35.detailedNotesSubtitle as string);
    if (Array.isArray(s35.detailedNotesImages)) setDetailedNotesImages(s35.detailedNotesImages as string[]);
    if (Array.isArray(sCustom.sections))  setCustomSections(sCustom.sections as CustomSection[]);
    if (Array.isArray(sCustom2.sections)) setCustomSections2(sCustom2.sections as CustomSection[]);
    if (s5.paymentStructure) setPaymentStructure(s5.paymentStructure as string);
    if (s5.additionalCosts)  setAdditionalCosts(s5.additionalCosts as string);
    if (s5.currency)         setCurrency(s5.currency as string);
    if (Array.isArray(s5.lineItems)) setLineItems(s5.lineItems as LineItem[]);
    if (s5.publicVisible === false) setS5PublicVisible(false); else setS5PublicVisible(true);
    if (s6.startDate)      setStartDate(s6.startDate as string);
    if (s6.deliveryDate)   setDeliveryDate(s6.deliveryDate as string);
    if (s6.milestones)     setMilestones(s6.milestones as typeof milestones);
    if (s6.publicVisible === false) setS6PublicVisible(false); else setS6PublicVisible(true);
  };

  // Save Document → addDoc → navigate to /documents
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSaveDocument = () => {
    if (!docTitle.trim() && !selectedClient) {
      setSaveError("Please enter a document title or select a client before saving.");
      return;
    }
    setSaveError("");
    setSaving(true);

    // Always build sections from current in-memory state (reflects user's latest input)
    const sections = {
      s1:  { docTitle, docDate, preparedBy, selectedClient, versionHistory },
      s2:  { businessType, targetAudience, keyProducts, businessGoals, keyChallenges, currentSystems },
      s35: { detailedNotes, detailedNotesTitle, detailedNotesSubtitle, detailedNotesImages },
      sCustom:  { sections: customSections },
      s5:  { paymentStructure, additionalCosts, currency, lineItems, publicVisible: s5PublicVisible },
      s6:  { startDate, deliveryDate, milestones, publicVisible: s6PublicVisible },
      sCustom2: { sections: customSections2 },
      sectionOrder,
    };

    const docPayload = {
      title: docTitle.trim() || (selectedClient ? `${selectedClient} - Requirements` : "Untitled Document"),
      clientName: selectedClient || "",
      company: client?.company || selectedClient || "",
      email: client?.email || "",
      phone: client?.phone || "",
      industry: client?.industry || "",
      city: client?.city || "",
      softwareType: keyProducts[0] || "",
      budget: paymentStructure || "",
      startDate: startDate || "",
      deliveryDate: deliveryDate || "",
      sections,
    };

    if (isEditMode && params.id) {
      editDoc(params.id, docPayload);
    } else {
      addDoc({ ...docPayload, status: "Draft" });
    }

    localStorage.removeItem(DRAFT_KEY);
    navigate("/documents");
  };

  if (!can("Add Documents")) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-2 sm:px-4">
        <div className="flex flex-col items-center justify-center py-24 text-center gap-5">
          <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Lock className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Admin Access Required</h2>
            <p className="text-sm text-muted-foreground max-w-sm">You need to be signed in as an admin to create requirement documents.</p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            Login to Continue
          </button>
          <button
            onClick={() => navigate("/documents")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Documents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start min-h-full">

      {/* ── Section Navigator Sidebar ─────────────────────────────────────── */}
      <aside className="hidden xl:flex flex-col flex-shrink-0 w-52 sticky top-0 max-h-screen overflow-y-auto border-r border-border/50 bg-background/95 backdrop-blur-sm z-10">
        <div className="px-3 py-3 border-b border-border/50 flex-shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sections</span>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {/* Static: Document Info */}
          <button
            type="button"
            onClick={() => document.getElementById('section-s1')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left ${activeSection === 's1' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
          >
            <FileText size={12} className="flex-shrink-0" />
            <span className="truncate">Document Information</span>
          </button>

          {/* Reorderable sections */}
          {sectionOrder.map(sid => {
            const { label, icon: SideIcon } = getSectionLabel(sid);
            const isSbDragging = dragId === sid;
            const isSbDragOver = dragOverId === sid && dragId !== sid;
            return (
              <div
                key={sid}
                draggable
                onDragStart={e => { e.stopPropagation(); handleDragStart(sid, e); }}
                onDragEnd={handleDragEnd}
                onDragOver={e => { e.stopPropagation(); handleDragOver(sid, e); }}
                onDragLeave={handleDragLeave}
                onDrop={e => { e.stopPropagation(); handleDrop(sid, e); }}
                onClick={() => document.getElementById(`section-${sid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                title={`Click to scroll · Drag to reorder`}
                className={`group/sb flex items-center gap-2 px-3 py-2 text-xs cursor-grab active:cursor-grabbing transition-colors select-none ${
                  isSbDragging ? 'opacity-40' : ''
                } ${isSbDragOver ? 'bg-primary/15 text-primary border-l-2 border-primary' : ''} ${
                  activeSection === sid && !isSbDragOver ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary' : ''
                } ${!isSbDragOver && activeSection !== sid ? 'text-muted-foreground hover:bg-muted/60 hover:text-foreground' : ''}`}
              >
                <GripVertical size={11} className="flex-shrink-0 opacity-0 group-hover/sb:opacity-50 transition-opacity" />
                <SideIcon size={12} className="flex-shrink-0" />
                <span className="truncate">{label}</span>
              </div>
            );
          })}

          {/* Static: Footer */}
          <button
            type="button"
            onClick={() => document.getElementById('section-footer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left ${activeSection === 'footer' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
          >
            <FileText size={12} className="flex-shrink-0" />
            <span className="truncate">Document Footer</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 max-w-4xl mx-auto py-6 px-2 sm:px-4 pb-28">

      {/* Page header */}
      <div className="mb-8 pb-6 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => navigate("/documents")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Documents
          </button>
        </div>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            {isEditMode ? "Edit Requirement Document" : "New Requirement Document"}
          </span>
        </div>

        <input
          type="text"
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          placeholder="Untitled Document"
          className="w-full text-2xl sm:text-3xl font-bold text-foreground mb-2 bg-transparent border-0 border-b-2 border-transparent focus:border-primary/30 focus:outline-none placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:italic transition-colors pb-0.5"
        />
        <p className="text-sm text-muted-foreground">
          Fill in the sections below and click <strong>Save Document</strong> when ready. Use the <strong>Update</strong> buttons per section to save draft progress.
        </p>

        {/* Template loader */}
        {!isEditMode && docs.length > 0 && (
          <div className="relative mt-3" ref={templateRef}>
            <button
              type="button"
              onClick={() => setTemplateOpen(o => !o)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5 hover:bg-primary/5 transition-colors"
            >
              <LayoutTemplate size={13} />
              Load from template
              <ChevronDown size={13} className={`transition-transform ${templateOpen ? "rotate-180" : ""}`} />
            </button>
            {templateOpen && (
              <div className="absolute z-50 top-full mt-1 left-0 min-w-[260px] max-h-60 overflow-y-auto bg-background border border-border rounded-lg shadow-lg">
                {docs.map(doc => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => loadTemplate(doc)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0 truncate"
                  >
                    {doc.title || doc.clientName || "Untitled Document"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Section 1: Document Information */}
      <section id="section-s1">
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
            <PreparedByField value={preparedBy} onChange={setPreparedBy} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField
              label="Client Name"
              required
              hint={
                leads.length === 0 && customers.length === 0
                  ? "Add leads or clients first to link them here"
                  : `${leads.length} lead${leads.length !== 1 ? "s" : ""} · ${customers.length} client${customers.length !== 1 ? "s" : ""} available`
              }
            >
              <ClientPicker
                leads={leads}
                customers={customers}
                value={selectedClient}
                onChange={handleSelectClient}
              />
            </FormField>
          </div>

          {selectedClient && client && (
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => setClientInfoOpen((o) => !o)}
                className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wide hover:text-primary/80 transition-colors mb-3"
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${clientInfoOpen ? "rotate-180" : ""}`} />
                {clientInfoOpen ? "Hide" : "Show"} Details
                {/* Type badge */}
                {'notes' in client ? (
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Lead</span>
                ) : (
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Client</span>
                )}
              </button>
              {clientInfoOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                  <FormField label="Phone"><ReadOnlyField value={client.phone} placeholder="—" /></FormField>
                  <FormField label="Email"><ReadOnlyField value={client.email} placeholder="—" /></FormField>
                  <FormField label="Company Name"><ReadOnlyField value={client.company} placeholder="—" /></FormField>
                  <FormField label="Industry"><ReadOnlyField value={client.industry} placeholder="—" /></FormField>
                  <FormField label="City"><ReadOnlyField value={client.city} placeholder="—" /></FormField>
                  <FormField label="Status"><ReadOnlyField value={client.status} placeholder="—" /></FormField>
                  {'notes' in client && (client as Lead).notes && (
                    <div className="sm:col-span-2">
                      <FormField label="Notes"><ReadOnlyField value={(client as Lead).notes} placeholder="—" /></FormField>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <SaveButton sectionKey="s1" saved={!!savedSections.s1} dirty={!!dirtySections.s1} onSave={saveS1} />
      </section>

      <SectionDivider />

      {/* ── Reorderable sections — grab the handle to drag & reorder ─────────── */}
      {sectionOrder.map(sectionId => {
        const isDragging = dragId === sectionId;
        const isDragOver = dragOverId === sectionId && dragId !== sectionId;
        let content: React.ReactNode = null;

        if (sectionId === "s2") content = (
          <section>
            <SectionHeader icon={Briefcase} title="2. Business Information" subtitle="Understanding the client's business context and goals" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Business Type" required hint="Selecting a type refines the Key Products / Services list below">
                <SelectInput options={BUSINESS_TYPES} value={businessType} onChange={handleBusinessTypeChange} placeholder="Select business type" />
              </FormField>
              <FormField label="Target Audience" hint="Age group, profession, and geographical location"
                templateAction={<FieldTplPicker docs={docs} extract={d => (((d.sections ?? {}) as Record<string,Record<string,unknown>>).s2?.targetAudience as string)} onSelect={setTargetAudience} />}>
                <TextInput value={targetAudience} onChange={setTargetAudience} placeholder="e.g. Professionals aged 25-45 in North America..." />
              </FormField>
              <div className="sm:col-span-2">
                <FormField
                  label="Key Products / Services"
                  required
                  hint={businessType ? `Showing options relevant to "${businessType}" — search or select multiple` : "Select a Business Type above to see relevant options, or search freely"}
                >
                  <MultiSelectFeatures
                    selected={keyProducts}
                    onChange={setKeyProducts}
                    options={businessType ? getProductOptions(businessType) : COMBINED_OPTIONS}
                    placeholder={businessType ? `Search ${businessType} products / services...` : "Select a business type first, or search all options..."}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Business Goals" hint="Primary goals the client aims to achieve"
                  templateAction={<FieldTplPicker docs={docs} extract={d => (((d.sections ?? {}) as Record<string,Record<string,unknown>>).s2?.businessGoals as string)} onSelect={setBusinessGoals} />}>
                  <TextInput value={businessGoals} onChange={setBusinessGoals} rows={3} placeholder="e.g. Increase monthly active users by 30%, streamline operations..." />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Key Challenges" hint="Major problems or challenges the client currently faces"
                  templateAction={<FieldTplPicker docs={docs} extract={d => (((d.sections ?? {}) as Record<string,Record<string,unknown>>).s2?.keyChallenges as string)} onSelect={setKeyChallenges} />}>
                  <TextInput value={keyChallenges} onChange={setKeyChallenges} rows={3} placeholder="e.g. Manual processes, customer acquisition, data silos..." />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Current Software or Systems Used" hint="CRM, ERP, inventory tools, or other existing platforms"
                  templateAction={<FieldTplPicker docs={docs} extract={d => (((d.sections ?? {}) as Record<string,Record<string,unknown>>).s2?.currentSystems as string)} onSelect={setCurrentSystems} />}>
                  <TextInput value={currentSystems} onChange={setCurrentSystems} placeholder="e.g. Salesforce CRM, QuickBooks, legacy inventory system..." />
                </FormField>
              </div>
            </div>
            <SaveButton sectionKey="s2" saved={!!savedSections.s2} dirty={!!dirtySections.s2} onSave={saveS2} />
          </section>
        );

        else if (sectionId === "s35") content = (
          <section>
            <div className="flex items-start justify-between gap-3 mb-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                    <PenLine className="text-primary" size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      value={detailedNotesTitle}
                      onChange={e => setDetailedNotesTitle(e.target.value)}
                      placeholder="Section title…"
                      className="block w-full text-base font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary/50 focus:outline-none pb-0.5 transition-colors"
                    />
                    <input
                      value={detailedNotesSubtitle}
                      onChange={e => setDetailedNotesSubtitle(e.target.value)}
                      placeholder="Section description…"
                      className="block w-full text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border/60 focus:border-primary/30 focus:outline-none mt-1 pb-0.5 transition-colors"
                    />
                  </div>
                </div>
              </div>
              <RichTextTplPicker onChange={setDetailedNotes} />
            </div>
            <RichTextEditor
              value={detailedNotes}
              onChange={setDetailedNotes}
              placeholder="Document detailed client requirements, meeting notes, feature specifications, user stories, or any additional context here. Supports rich formatting — headings, lists, bold, links, and more."
            />
            <ImageAttachment
              images={detailedNotesImages}
              onAdd={addDetailedNotesImage}
              onRemove={removeDetailedNotesImage}
            />
            <SaveButton sectionKey="s35" saved={!!savedSections.s35} dirty={!!dirtySections.s35} onSave={saveS35} />
          </section>
        );

        else if (sectionId.startsWith("sc:")) {
          const secId = sectionId.slice(3);
          const sec = customSections.find(s => s.id === secId);
          if (sec) content = (
            <section>
              <div className="flex items-start gap-2 mb-0">
                <div className="flex-1">
                  <EditableSectionHeader
                    icon={FileText}
                    title={sec.title}
                    onTitleChange={v => updateCustomSection(sec.id, "title", v)}
                    subtitle={sec.subtitle}
                    onSubtitleChange={v => updateCustomSection(sec.id, "subtitle", v)}
                  />
                </div>
                <RichTextTplPicker onChange={v => updateCustomSection(sec.id, "content", v)} />
                <button
                  type="button"
                  onClick={() => removeCustomSection(sec.id)}
                  className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                  title="Remove this section"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <RichTextEditor
                value={sec.content}
                onChange={v => updateCustomSection(sec.id, "content", v)}
                placeholder="Write the content for this section…"
              />
              <ImageAttachment
                images={sec.images ?? []}
                onAdd={url => addCustomSectionImage(sec.id, url)}
                onRemove={i => removeCustomSectionImage(sec.id, i)}
              />
              <SaveButton sectionKey={`sc_${sec.id}`} saved={!!savedSections[`sc_${sec.id}`]} dirty={!!dirtySections[`sc_${sec.id}`]} onSave={() => saveCustomSection(sec.id)} />
            </section>
          );
        }

        else if (sectionId === "s5") content = (
          <section>
            <div className="flex items-start justify-between mb-6 gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                  <DollarSign className="text-primary" size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">5. Budget &amp; Costing</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Estimated costs and payment arrangements — linked to milestone payments</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setS5PublicVisible(v => !v)}
                title={s5PublicVisible ? "Visible in public view — click to hide" : "Hidden in public view — click to show"}
                className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors mt-1 ${
                  s5PublicVisible
                    ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {s5PublicVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                {s5PublicVisible ? "Public" : "Hidden"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <FormField label="Currency" required>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Payment Structure" required>
                <SelectInput options={PAYMENT_STRUCTURES} value={paymentStructure} onChange={setPaymentStructure} placeholder="Select payment structure" />
              </FormField>
              <FormField label="Actual Cost" hint="Numeric value (e.g. 90000) — the currency above will be applied automatically"
                templateAction={<FieldTplPicker docs={docs} extract={d => (((d.sections ?? {}) as Record<string,Record<string,unknown>>).s5?.additionalCosts as string)} onSelect={setAdditionalCosts} />}>
                <TextInput value={additionalCosts} onChange={setAdditionalCosts} placeholder="e.g. 90000" />
              </FormField>

              <div className="sm:col-span-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Items / Services</span>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md px-2.5 py-1 hover:bg-primary/5 transition-colors"
                  >
                    <Plus size={12} /> Add Item
                  </button>
                </div>
                <div className="hidden sm:grid grid-cols-[2fr_55px_80px_90px_80px_90px_32px] gap-2 mb-1 px-1">
                  {["Item / Service","Qty","Per Unit","Total","Discount","Sub Total",""].map(h => (
                    <span key={h} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</span>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {lineItems.map((row, idx) => {
                    const { totalCost, subTotal } = lineItemTotals[idx];
                    return (
                      <div key={row.id} className="border border-border/50 rounded-lg overflow-hidden bg-background">
                        <div className="grid grid-cols-1 sm:grid-cols-[2fr_55px_80px_90px_80px_90px_32px] gap-2 items-center px-2 py-1.5">
                          <input
                            value={row.item}
                            onChange={e => updateLineItem(row.id, "item", e.target.value)}
                            placeholder="e.g. Web Design"
                            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <input
                            type="number" min="0" value={row.qty}
                            onChange={e => updateLineItem(row.id, "qty", e.target.value)}
                            placeholder="1"
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <input
                            type="number" min="0" step="0.01" value={row.perUnit}
                            onChange={e => updateLineItem(row.id, "perUnit", e.target.value)}
                            placeholder="0.00"
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <div className="h-8 flex items-center justify-end px-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-sm font-medium text-blue-700 dark:text-blue-300 tabular-nums">
                            {totalCost > 0 ? formatCurrency(totalCost) : <span className="text-muted-foreground/40">—</span>}
                          </div>
                          <input
                            type="number" min="0" step="0.01" value={row.discount}
                            onChange={e => updateLineItem(row.id, "discount", e.target.value)}
                            placeholder="0.00"
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <div className="h-8 flex items-center justify-end px-2 rounded-md bg-muted/60 text-sm font-semibold text-foreground tabular-nums">
                            {subTotal > 0 ? formatCurrency(subTotal) : <span className="text-muted-foreground/40">—</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLineItem(row.id)}
                            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="px-2 pb-2 border-t border-border/30 pt-1.5 bg-muted/20">
                          <input
                            value={row.description}
                            onChange={e => updateLineItem(row.id, "description", e.target.value)}
                            placeholder="Description…"
                            className="h-7 w-full rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-col sm:flex-row sm:justify-end gap-1.5 px-1">
                  {lineItems.some(r => parseFloat(r.perUnit) > 0) && (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">Total (ex. discount):</span>
                      <span className="font-medium tabular-nums">{formatCurrency(lineItemTotals.reduce((s, r) => s + r.totalCost, 0))}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm sm:ml-6 border-t sm:border-t-0 sm:border-l border-border/60 pt-1.5 sm:pt-0 sm:pl-6">
                    <span className="font-semibold text-foreground">Grand Total:</span>
                    <span className="text-base font-bold text-primary tabular-nums">{formatCurrency(lineItemsGrandTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-3 rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">Budget Breakdown</span>
                  <span className="ml-auto text-xs text-muted-foreground">Linked to milestone payments below</span>
                </div>
                {lineItemsGrandTotal > 0 && (
                  <div className="grid grid-cols-3 gap-3 pb-3 border-b border-primary/15">
                    <div className="text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Items Grand Total</p>
                      <p className="text-base font-bold text-primary tabular-nums">{formatCurrency(lineItemsGrandTotal)}</p>
                    </div>
                    <div className="text-center border-x border-primary/15">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Milestones Total</p>
                      <p className={`text-base font-bold tabular-nums ${milestonesTotal > lineItemsGrandTotal ? "text-destructive" : "text-foreground"}`}>
                        {formatCurrency(milestonesTotal)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Remaining</p>
                      <p className={`text-base font-bold tabular-nums ${lineItemsGrandTotal - milestonesTotal < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                        {formatCurrency(Math.max(0, lineItemsGrandTotal - milestonesTotal))}
                      </p>
                    </div>
                  </div>
                )}
                {milestones.some((m) => m.payment.trim() !== "") ? (
                  <div className="space-y-1.5">
                    {milestones.filter((m) => m.payment.trim() !== "").map((m, i) => {
                      const amt = parseFloat(m.payment.replace(/[£$€,\s]/g, "")) || 0;
                      return (
                        <div key={m.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="inline-flex w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold items-center justify-center flex-shrink-0">{i + 1}</span>
                            {m.title || `Milestone ${i + 1}`}
                          </span>
                          <span className="font-medium text-foreground tabular-nums">{formatCurrency(amt)}</span>
                        </div>
                      );
                    })}
                    <div className="border-t border-primary/20 pt-2 mt-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">Total Milestone Budget</span>
                      <span className="text-base font-bold text-primary tabular-nums">{formatCurrency(milestonesTotal)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No milestone payments entered yet. Add milestones with payment amounts in the Timeline section below — they will appear here automatically.</p>
                )}
              </div>
            </div>
            <SaveButton sectionKey="s5" saved={!!savedSections.s5} dirty={!!dirtySections.s5} onSave={saveS5} />
          </section>
        );

        else if (sectionId === "s6") content = (
          <section>
            <div className="flex items-start justify-between mb-6 gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                  <Clock className="text-primary" size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">6. Project Timeline</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Milestones, start date, and expected delivery</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setS6PublicVisible(v => !v)}
                title={s6PublicVisible ? "Visible in public view — click to hide" : "Hidden in public view — click to show"}
                className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors mt-1 ${
                  s6PublicVisible
                    ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {s6PublicVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                {s6PublicVisible ? "Public" : "Hidden"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Start Date" required>
                <DateInput value={startDate} onChange={setStartDate} />
              </FormField>
              <FormField label="Expected Delivery Date" required>
                <DateInput value={deliveryDate} onChange={setDeliveryDate} />
              </FormField>
              <div className="sm:col-span-2">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <FieldLabel label="Milestones" />
                    <button type="button" onClick={addMilestone}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors">
                      <span className="text-base leading-none">+</span>Add Milestone
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {milestones.map((m, index) => (
                      <div key={m.id} className="rounded-xl border border-border bg-background overflow-hidden">
                        <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-semibold text-primary">{index + 1}</span>
                          </div>
                          <input
                            type="text"
                            value={m.title}
                            onChange={(e) => updateMilestone(m.id, "title", e.target.value)}
                            placeholder={`e.g. Week ${index + 1}: Design & Planning`}
                            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                          />
                          <button type="button" onClick={() => removeMilestone(m.id)} disabled={milestones.length === 1}
                            title="Remove milestone"
                            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                            </svg>
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 pb-3">
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 ml-0.5">Due Date</p>
                            <input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, "date", e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                          </div>
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 ml-0.5">
                              Payment
                              {lineItemsGrandTotal > 0 && (
                                <span className="ml-1 text-muted-foreground/60 normal-case">
                                  (max {formatCurrency(Math.max(0, lineItemsGrandTotal - milestones.filter(x => x.id !== m.id).reduce((s, x) => s + (parseFloat(x.payment.replace(/[^0-9.]/g, "")) || 0), 0)))})
                                </span>
                              )}
                            </p>
                            <input
                              type="number" min="0" step="0.01" value={m.payment}
                              onChange={(e) => {
                                const otherTotal = milestones.filter(x => x.id !== m.id).reduce((s, x) => s + (parseFloat(x.payment.replace(/[^0-9.]/g, "")) || 0), 0);
                                const maxVal = lineItemsGrandTotal > 0 ? Math.max(0, lineItemsGrandTotal - otherTotal) : Infinity;
                                const raw = parseFloat(e.target.value) || 0;
                                updateMilestone(m.id, "payment", String(Math.min(raw, maxVal)));
                              }}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 rounded-lg border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${milestonesTotal > lineItemsGrandTotal && lineItemsGrandTotal > 0 ? "border-destructive" : "border-border"}`}
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 ml-0.5">Payment Status</p>
                            <div className="relative">
                              <select value={m.paymentStatus} onChange={(e) => updateMilestone(m.id, "paymentStatus", e.target.value)}
                                className="w-full appearance-none px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-7"
                                style={{ color: m.paymentStatus === "Paid" ? "#16a34a" : m.paymentStatus === "Overdue" ? "#dc2626" : m.paymentStatus === "Partial" ? "#d97706" : undefined }}>
                                <option value="">— Select —</option>
                                <option value="Pending">Pending</option>
                                <option value="Partial">Partial</option>
                                <option value="Paid">Paid</option>
                                <option value="Overdue">Overdue</option>
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 ml-0.5">Task Status</p>
                            <div className="relative">
                              <select value={m.taskStatus} onChange={(e) => updateMilestone(m.id, "taskStatus", e.target.value)}
                                className="w-full appearance-none px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-7"
                                style={{ color: m.taskStatus === "Completed" ? "#16a34a" : m.taskStatus === "Cancelled" ? "#dc2626" : m.taskStatus === "In Progress" ? "#2563eb" : m.taskStatus === "On Hold" ? "#d97706" : undefined }}>
                                <option value="">— Select —</option>
                                <option value="Not Started">Not Started</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="On Hold">On Hold</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {milestonesTotal > 0 && (
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-4 py-2.5">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total across {milestones.filter((m) => m.payment.trim() !== "").length} milestone{milestones.filter((m) => m.payment.trim() !== "").length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-sm font-bold text-primary tabular-nums">{formatCurrency(milestonesTotal)}</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">Key phases and their expected completion dates — payments auto-update the Budget section above</p>
                </div>
              </div>
            </div>
            <SaveButton sectionKey="s6" saved={!!savedSections.s6} dirty={!!dirtySections.s6} onSave={saveS6} />
          </section>
        );

        else if (sectionId.startsWith("sc2:")) {
          const secId = sectionId.slice(4);
          const sec = customSections2.find(s => s.id === secId);
          if (sec) content = (
            <section>
              <div className="flex items-start gap-2 mb-0">
                <div className="flex-1">
                  <EditableSectionHeader
                    icon={FileText}
                    title={sec.title}
                    onTitleChange={v => updateCustomSection2(sec.id, "title", v)}
                    subtitle={sec.subtitle}
                    onSubtitleChange={v => updateCustomSection2(sec.id, "subtitle", v)}
                  />
                </div>
                <RichTextTplPicker onChange={v => updateCustomSection2(sec.id, "content", v)} />
                <button
                  type="button"
                  onClick={() => removeCustomSection2(sec.id)}
                  className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                  title="Remove this section"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <RichTextEditor
                value={sec.content}
                onChange={v => updateCustomSection2(sec.id, "content", v)}
                placeholder="Write the content for this section…"
              />
              <ImageAttachment
                images={sec.images ?? []}
                onAdd={url => addCustomSection2Image(sec.id, url)}
                onRemove={i => removeCustomSection2Image(sec.id, i)}
              />
              <SaveButton sectionKey={`sc2_${sec.id}`} saved={!!savedSections[`sc2_${sec.id}`]} dirty={!!dirtySections[`sc2_${sec.id}`]} onSave={() => saveCustomSection2(sec.id)} />
            </section>
          );
        }

        if (!content) return null;
        return (
          <div
            key={sectionId}
            id={`section-${sectionId}`}
            onDragOver={e => handleDragOver(sectionId, e)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(sectionId, e)}
            className={`group relative transition-all duration-150 ${isDragging ? "opacity-40" : ""} ${isDragOver ? "ring-2 ring-primary/40 ring-offset-1 rounded-xl bg-primary/[0.02]" : ""}`}
          >
            {/* Drag handle — visible on hover */}
            <div
              draggable
              onDragStart={e => handleDragStart(sectionId, e)}
              onDragEnd={handleDragEnd}
              className="flex items-center justify-center gap-1.5 h-7 mb-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/60 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity select-none"
              title="Drag to reorder this section"
            >
              <GripVertical size={14} />
              <span className="text-[11px] font-medium uppercase tracking-wide">drag to reorder</span>
              <GripVertical size={14} />
            </div>
            {content}
            <SectionDivider />
          </div>
        );
      })}

      {/* Add custom section buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5 py-2">
        <button
          type="button"
          onClick={addCustomSection}
          className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-primary border border-dashed border-primary/40 rounded-lg px-4 py-2.5 hover:bg-primary/5 transition-colors"
        >
          <Plus size={15} />
          Add custom section
        </button>
        <button
          type="button"
          onClick={addCustomSection2}
          className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground border border-dashed border-border rounded-lg px-4 py-2.5 hover:bg-muted/60 hover:text-foreground transition-colors"
        >
          <Plus size={15} />
          Add custom section (alt)
        </button>
      </div>

      <SectionDivider />

            {/* Document Footer */}
      <section id="section-footer">
        <div className="rounded-xl bg-muted/50 border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-6 h-6 rounded bg-muted-foreground/10 flex items-center justify-center">
              <FileText className="w-3 h-3 text-muted-foreground" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Document Footer</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FormField label="Version History" hint="e.g. Version 1.0 – Apr 04, 2026 – Initial Draft"
                templateAction={<FieldTplPicker docs={docs} extract={d => (((d.sections ?? {}) as Record<string,Record<string,unknown>>).s1?.versionHistory as string)} onSelect={setVersionHistory} />}>
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

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="max-w-[1600px] mx-auto px-5 md:px-8 py-3 flex items-center justify-between gap-4">
          {/* Left: unsaved sections indicator */}
          <div className="flex items-center gap-3">
            {dirtyCount > 0 ? (
              <span className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
                {dirtyCount} section{dirtyCount !== 1 ? "s" : ""} with unsaved changes
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/60">All sections up to date</span>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2.5">
            {saveError && <p className="text-sm text-destructive hidden sm:block">{saveError}</p>}
            <button
              type="button"
              onClick={() => navigate("/documents")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveDocument}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 shadow-sm transition-all duration-200 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : isEditMode ? "Update Document" : "Save Document"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
