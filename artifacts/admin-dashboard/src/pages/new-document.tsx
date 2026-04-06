import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  FileText, Briefcase, DollarSign, Clock, Target,
  ChevronDown, Calendar, Check, Save, PenLine, Tag, CheckSquare,
  ArrowLeft, Lock, Plus, X, Trash2, LayoutTemplate,
} from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";
import { useDocs, useLeads } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { getTeamMembers, addTeamMember, getDoc, RequirementDoc } from "@/lib/store";
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

const MAINTENANCE_OPTIONS = ["3 months", "6 months", "1 year", "2 years", "Ongoing"];
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
  const filtered = options.filter((f) => f.toLowerCase().includes(search.toLowerCase()) && !selected.includes(f));
  const toggle = (feature: string) => {
    onChange(selected.includes(feature) ? selected.filter((f) => f !== feature) : [...selected, feature]);
  };
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
            placeholder="Type to search..."
            className="flex-1 min-w-24 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground/60"
          />
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto z-10 relative">
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

function FormField({ children, label, required, hint }: { children: React.ReactNode; label: string; required?: boolean; hint?: React.ReactNode }) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SaveButton({ sectionKey, saved, onSave }: { sectionKey: string; saved: boolean; onSave: () => void }) {
  return (
    <div className="flex justify-end mt-6 pt-4 border-t border-border">
      <button type="button" onClick={onSave}
        className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
          saved ? "bg-green-50 text-green-700 border border-green-200 shadow-none" : "bg-primary text-white hover:bg-primary/90 shadow-sm"
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
  const { isAuthenticated } = useAuth();

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
  const removeLineItem = (id: string) => setLineItems(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const updateLineItem = (id: string, field: keyof LineItem, value: string) =>
    setLineItems(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const lineItemTotals = lineItems.map(r => {
    const totalCost = (parseFloat(r.qty) || 0) * (parseFloat(r.perUnit) || 0);
    const discount  = parseFloat(r.discount) || 0;
    return { totalCost, subTotal: Math.max(0, totalCost - discount) };
  });
  const lineItemsGrandTotal = lineItemTotals.reduce((s, r) => s + r.subTotal, 0);
  const [currency, setCurrency] = useState("GBP");
  const [postLaunch, setPostLaunch] = useState("");
  const [maintenance, setMaintenance] = useState("");
  const [versionHistory, setVersionHistory] = useState("");
  const [detailedNotes, setDetailedNotes] = useState("");

  // Editable s35 header
  const [detailedNotesTitle, setDetailedNotesTitle] = useState("Detailed Requirements Notes");
  const [detailedNotesSubtitle, setDetailedNotesSubtitle] = useState("Use this space to document any additional client requirements, discussions, or specifications in detail");

  // Custom sections
  type CustomSection = { id: string; title: string; subtitle: string; content: string };
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const addCustomSection = () => setCustomSections(prev => [...prev, { id: Date.now().toString(), title: "Custom Section", subtitle: "", content: "" }]);
  const removeCustomSection = (id: string) => setCustomSections(prev => prev.filter(s => s.id !== id));
  const updateCustomSection = (id: string, field: keyof CustomSection, value: string) =>
    setCustomSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));

  // Template picker (page-level)
  const [templateOpen, setTemplateOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (templateRef.current && !templateRef.current.contains(e.target as Node)) setTemplateOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Notes section template picker
  const [notesTemplateOpen, setNotesTemplateOpen] = useState(false);
  const notesTemplateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (notesTemplateRef.current && !notesTemplateRef.current.contains(e.target as Node)) setNotesTemplateOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const loadNotesFromTemplate = (doc: RequirementDoc) => {
    const s35 = ((doc.sections ?? {}) as Record<string, unknown>).s35 as Record<string, unknown> | undefined ?? {};
    if (s35.detailedNotes)         setDetailedNotes(s35.detailedNotes as string);
    if (s35.detailedNotesTitle)    setDetailedNotesTitle(s35.detailedNotesTitle as string);
    if (s35.detailedNotesSubtitle) setDetailedNotesSubtitle(s35.detailedNotesSubtitle as string);
    setNotesTemplateOpen(false);
  };

  const client = leads.find((l) => l.name === selectedClient);

  // Per-section save (draft)
  const [savedSections, setSavedSections] = useState<Record<string, boolean>>({});
  const markSaved = useCallback((key: string) => {
    setSavedSections((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSavedSections((prev) => ({ ...prev, [key]: false })), 2000);
  }, []);

  const persist = (key: string, data: object) => {
    const existing = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...existing, [key]: data }));
  };

  const saveS1  = () => { persist("s1",  { docTitle, docDate, preparedBy, selectedClient }); markSaved("s1"); };
  const saveS2  = () => { persist("s2",  { businessType, targetAudience, keyProducts, businessGoals, keyChallenges, currentSystems }); markSaved("s2"); };
  const saveS35 = () => { persist("s35", { detailedNotes, detailedNotesTitle, detailedNotesSubtitle }); markSaved("s35"); };
  const saveCustomSection = (id: string) => {
    const sec = customSections.find(s => s.id === id);
    if (!sec) return;
    const existing = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    const currentCustom: CustomSection[] = existing.sCustom?.sections ?? [];
    const idx = currentCustom.findIndex((s: CustomSection) => s.id === id);
    if (idx >= 0) currentCustom[idx] = sec; else currentCustom.push(sec);
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...existing, sCustom: { sections: currentCustom } }));
    markSaved(`sc_${id}`);
  };
  const saveS5  = () => { persist("s5",  { paymentStructure, additionalCosts, currency, lineItems }); markSaved("s5"); };
  const saveS6  = () => { persist("s6",  { startDate, deliveryDate, milestones }); markSaved("s6"); };
  const saveS7  = () => { persist("s7",  { postLaunch, maintenance }); markSaved("s7"); };

  // Load data on mount — edit mode loads from the saved document, new mode from draft
  useEffect(() => {
    const loadSections = (d: Record<string, unknown>) => {
      const s1 = (d.s1 ?? {}) as Record<string, unknown>;
      const s2 = (d.s2 ?? {}) as Record<string, unknown>;
      const s35 = (d.s35 ?? {}) as Record<string, unknown>;
      const s5 = (d.s5 ?? {}) as Record<string, unknown>;
      const s6 = (d.s6 ?? {}) as Record<string, unknown>;
      const s7 = (d.s7 ?? {}) as Record<string, unknown>;
      if (s1.docTitle)       setDocTitle(s1.docTitle as string);
      if (s1.docDate)        setDocDate(s1.docDate as string);
      if (s1.preparedBy)     setPreparedBy(s1.preparedBy as string);
      if (s1.selectedClient) setSelectedClient(s1.selectedClient as string);
      if (s2.businessType)   setBusinessType(s2.businessType as string);
      if (s2.targetAudience) setTargetAudience(s2.targetAudience as string);
      if (s2.keyProducts)    setKeyProducts(s2.keyProducts as string[]);
      if (s2.businessGoals)  setBusinessGoals(s2.businessGoals as string);
      if (s2.keyChallenges)  setKeyChallenges(s2.keyChallenges as string);
      if (s2.currentSystems) setCurrentSystems(s2.currentSystems as string);
      if (s35.detailedNotes)        setDetailedNotes(s35.detailedNotes as string);
      if (s35.detailedNotesTitle)   setDetailedNotesTitle(s35.detailedNotesTitle as string);
      if (s35.detailedNotesSubtitle) setDetailedNotesSubtitle(s35.detailedNotesSubtitle as string);
      const sCustom = (d.sCustom ?? {}) as Record<string, unknown>;
      if (Array.isArray(sCustom.sections)) setCustomSections(sCustom.sections as CustomSection[]);
      if (s5.paymentStructure) setPaymentStructure(s5.paymentStructure as string);
      if (s5.additionalCosts)  setAdditionalCosts(s5.additionalCosts as string);
      if (s5.currency)         setCurrency(s5.currency as string);
      if (Array.isArray(s5.lineItems)) setLineItems(s5.lineItems as LineItem[]);
      if (s6.startDate)      setStartDate(s6.startDate as string);
      if (s6.deliveryDate)   setDeliveryDate(s6.deliveryDate as string);
      if (s6.milestones)     setMilestones(s6.milestones as typeof milestones);
      if (s7.postLaunch)     setPostLaunch(s7.postLaunch as string);
      if (s7.maintenance)    setMaintenance(s7.maintenance as string);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const s5 = (d.s5 ?? {}) as Record<string, unknown>;
    const s6 = (d.s6 ?? {}) as Record<string, unknown>;
    const s7 = (d.s7 ?? {}) as Record<string, unknown>;
    if (s1.docDate)        setDocDate(s1.docDate as string);
    if (s1.preparedBy)     setPreparedBy(s1.preparedBy as string);
    if (s2.businessType)   setBusinessType(s2.businessType as string);
    if (s2.targetAudience) setTargetAudience(s2.targetAudience as string);
    if (s2.keyProducts)    setKeyProducts(s2.keyProducts as string[]);
    if (s2.businessGoals)  setBusinessGoals(s2.businessGoals as string);
    if (s2.keyChallenges)  setKeyChallenges(s2.keyChallenges as string);
    if (s2.currentSystems) setCurrentSystems(s2.currentSystems as string);
    if (s35.detailedNotes)         setDetailedNotes(s35.detailedNotes as string);
    if (s35.detailedNotesTitle)    setDetailedNotesTitle(s35.detailedNotesTitle as string);
    if (s35.detailedNotesSubtitle) setDetailedNotesSubtitle(s35.detailedNotesSubtitle as string);
    if (Array.isArray(sCustom.sections)) setCustomSections(sCustom.sections as CustomSection[]);
    if (s5.paymentStructure) setPaymentStructure(s5.paymentStructure as string);
    if (s5.additionalCosts)  setAdditionalCosts(s5.additionalCosts as string);
    if (s5.currency)         setCurrency(s5.currency as string);
    if (Array.isArray(s5.lineItems)) setLineItems(s5.lineItems as LineItem[]);
    if (s6.startDate)      setStartDate(s6.startDate as string);
    if (s6.deliveryDate)   setDeliveryDate(s6.deliveryDate as string);
    if (s6.milestones)     setMilestones(s6.milestones as typeof milestones);
    if (s7.postLaunch)     setPostLaunch(s7.postLaunch as string);
    if (s7.maintenance)    setMaintenance(s7.maintenance as string);
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
      s1:  { docTitle, docDate, preparedBy, selectedClient },
      s2:  { businessType, targetAudience, keyProducts, businessGoals, keyChallenges, currentSystems },
      s35: { detailedNotes, detailedNotesTitle, detailedNotesSubtitle },
      sCustom: { sections: customSections },
      s5:  { paymentStructure, additionalCosts, currency, lineItems },
      s6:  { startDate, deliveryDate, milestones },
      s7:  { postLaunch, maintenance },
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

  if (!isAuthenticated) {
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
    <div className="max-w-4xl mx-auto py-6 px-2 sm:px-4">

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

        {/* Save / Cancel actions */}
        <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            type="button"
            onClick={handleSaveDocument}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 shadow-sm transition-all duration-200 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : isEditMode ? "Update Document" : "Save Document"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/documents")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all duration-200"
          >
            Cancel
          </button>
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        </div>
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
            <PreparedByField value={preparedBy} onChange={setPreparedBy} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Client Name" required hint={leads.length === 0 ? "Add leads first to select a client" : "Select from your existing leads"}>
              {leads.length === 0 ? (
                <div className="w-full px-3 py-2.5 rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground italic">
                  No leads yet — add leads first to link a client
                </div>
              ) : (
                <SelectInput
                  options={leads.map((l) => l.name)}
                  value={selectedClient}
                  onChange={handleSelectClient}
                  placeholder="Select client from leads"
                />
              )}
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
                {clientInfoOpen ? "Hide" : "Show"} Client Details
              </button>
              {clientInfoOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                  <FormField label="Phone"><ReadOnlyField value={client.phone} placeholder="—" /></FormField>
                  <FormField label="Email"><ReadOnlyField value={client.email} placeholder="—" /></FormField>
                  <FormField label="Company Name"><ReadOnlyField value={client.company} placeholder="—" /></FormField>
                  <FormField label="Industry"><ReadOnlyField value={client.industry} placeholder="—" /></FormField>
                  <FormField label="City"><ReadOnlyField value={client.city} placeholder="—" /></FormField>
                  <FormField label="Status"><ReadOnlyField value={client.status} placeholder="—" /></FormField>
                  {client.notes && (
                    <div className="sm:col-span-2">
                      <FormField label="Lead Notes"><ReadOnlyField value={client.notes} placeholder="—" /></FormField>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <SaveButton sectionKey="s1" saved={!!savedSections.s1} onSave={saveS1} />
      </section>

      <SectionDivider />

      {/* Section 2: Business Information */}
      <section>
        <SectionHeader icon={Briefcase} title="2. Business Information" subtitle="Understanding the client's business context and goals" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField label="Business Type" required hint="Selecting a type refines the Key Products / Services list below">
            <SelectInput options={BUSINESS_TYPES} value={businessType} onChange={handleBusinessTypeChange} placeholder="Select business type" />
          </FormField>
          <FormField label="Target Audience" hint="Age group, profession, and geographical location">
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
            <FormField label="Business Goals" hint="Primary goals the client aims to achieve">
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
        <SaveButton sectionKey="s2" saved={!!savedSections.s2} onSave={saveS2} />
      </section>

      <SectionDivider />

      {/* Section 3.5: Detailed Requirements Notes (editable header) */}
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

          {/* Per-section template loader */}
          {docs.length > 0 && (
            <div className="relative flex-shrink-0" ref={notesTemplateRef}>
              <button
                type="button"
                onClick={() => setNotesTemplateOpen(o => !o)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md px-2.5 py-1.5 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors whitespace-nowrap"
              >
                <LayoutTemplate size={12} />
                Load template
                <ChevronDown size={12} className={`transition-transform ${notesTemplateOpen ? "rotate-180" : ""}`} />
              </button>
              {notesTemplateOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 min-w-[240px] max-h-56 overflow-y-auto bg-background border border-border rounded-lg shadow-lg">
                  <div className="px-3 py-2 border-b border-border/60">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Load notes from document</p>
                  </div>
                  {docs.map(doc => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => loadNotesFromTemplate(doc)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors border-b border-border/30 last:border-0 flex flex-col gap-0.5"
                    >
                      <span className="font-medium truncate">{doc.title || "Untitled"}</span>
                      {doc.clientName && <span className="text-xs text-muted-foreground truncate">{doc.clientName}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <RichTextEditor
          value={detailedNotes}
          onChange={setDetailedNotes}
          placeholder="Document detailed client requirements, meeting notes, feature specifications, user stories, or any additional context here. Supports rich formatting — headings, lists, bold, links, and more."
        />
        <SaveButton sectionKey="s35" saved={!!savedSections.s35} onSave={saveS35} />
      </section>

      <SectionDivider />

      {/* Custom sections */}
      {customSections.map(sec => (
        <section key={sec.id}>
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
          <SaveButton sectionKey={`sc_${sec.id}`} saved={!!savedSections[`sc_${sec.id}`]} onSave={() => saveCustomSection(sec.id)} />
          <SectionDivider />
        </section>
      ))}

      {/* Add custom section button */}
      <div className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={addCustomSection}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary border border-dashed border-primary/40 rounded-lg px-4 py-2.5 hover:bg-primary/5 transition-colors w-full justify-center"
        >
          <Plus size={15} />
          Add custom section
        </button>
      </div>

      <SectionDivider />

      {/* Section 5: Budget & Costing */}
      <section>
        <SectionHeader icon={DollarSign} title="5. Budget & Costing" subtitle="Estimated costs and payment arrangements — linked to milestone payments" />
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
          <FormField label="Actual Cost" hint="Numeric value (e.g. 90000) — the currency above will be applied automatically">
            <TextInput value={additionalCosts} onChange={setAdditionalCosts} placeholder="e.g. 90000" />
          </FormField>

          {/* Line Items Table */}
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

            {/* Table header */}
            {/* col: Item/Service | Short Desc | Qty | Per Unit | Total Cost | Discount | Sub Total | × */}
            <div className="hidden sm:grid grid-cols-[2fr_2fr_55px_80px_90px_80px_90px_32px] gap-2 mb-1.5 px-1">
              {["Item / Service","Short Description","Qty","Per Unit","Total Cost","Discount","Sub Total",""].map(h => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</span>
              ))}
            </div>

            <div className="space-y-2">
              {lineItems.map((row, idx) => {
                const { totalCost, subTotal } = lineItemTotals[idx];
                return (
                  <div key={row.id} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_55px_80px_90px_80px_90px_32px] gap-2 items-center bg-muted/30 rounded-lg p-2 sm:p-1.5 sm:bg-transparent sm:rounded-none sm:border-b sm:border-border/40">
                    <input
                      value={row.item}
                      onChange={e => updateLineItem(row.id, "item", e.target.value)}
                      placeholder="e.g. Web Design"
                      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      value={row.description}
                      onChange={e => updateLineItem(row.id, "description", e.target.value)}
                      placeholder="Brief description…"
                      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="number"
                      min="0"
                      value={row.qty}
                      onChange={e => updateLineItem(row.id, "qty", e.target.value)}
                      placeholder="1"
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.perUnit}
                      onChange={e => updateLineItem(row.id, "perUnit", e.target.value)}
                      placeholder="0.00"
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {/* Total Cost = Qty × Per Unit (read-only) */}
                    <div className="h-8 flex items-center justify-end px-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-sm font-medium text-blue-700 dark:text-blue-300 tabular-nums">
                      {totalCost > 0 ? formatCurrency(totalCost) : <span className="text-muted-foreground/50">—</span>}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.discount}
                      onChange={e => updateLineItem(row.id, "discount", e.target.value)}
                      placeholder="0.00"
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {/* Sub Total = Total Cost − Discount (read-only) */}
                    <div className="h-8 flex items-center justify-end px-2 rounded-md bg-muted/60 text-sm font-semibold text-foreground tabular-nums">
                      {subTotal > 0 ? formatCurrency(subTotal) : <span className="text-muted-foreground/50">—</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLineItem(row.id)}
                      disabled={lineItems.length === 1}
                      className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Totals row */}
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

            {/* Alignment row: Items Grand Total vs Milestone Total vs Remaining */}
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
        <SaveButton sectionKey="s5" saved={!!savedSections.s5} onSave={saveS5} />
      </section>

      <SectionDivider />

      {/* Section 6: Project Timeline */}
      <section>
        <SectionHeader icon={Clock} title="6. Project Timeline" subtitle="Milestones, start date, and expected delivery" />
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
                          type="number"
                          min="0"
                          step="0.01"
                          value={m.payment}
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
        <SaveButton sectionKey="s6" saved={!!savedSections.s6} onSave={saveS6} />
      </section>

      <SectionDivider />

      {/* Section 7: Support & Maintenance */}
      <section>
        <SectionHeader icon={Target} title="7. Support & Maintenance" subtitle="Post-launch support and ongoing maintenance plans" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <FormField label="Post-Launch Support" hint="Bug fixes, updates, improvements after go-live">
              <TextInput value={postLaunch} onChange={setPostLaunch} rows={3} placeholder="e.g. 30-day bug fix warranty, monthly feature updates, dedicated support channel..." />
            </FormField>
          </div>
          <FormField label="Maintenance Duration" required>
            <SelectInput options={MAINTENANCE_OPTIONS} value={maintenance} onChange={setMaintenance} placeholder="Select duration" />
          </FormField>
        </div>
        <SaveButton sectionKey="s7" saved={!!savedSections.s7} onSave={saveS7} />
      </section>

      <SectionDivider />

      {/* Document Footer */}
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

      {/* Bottom CTA */}
      <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <button
          type="button"
          onClick={handleSaveDocument}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 shadow-sm transition-all duration-200 disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : isEditMode ? "Update Document" : "Save Document"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/documents")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all duration-200"
        >
          Cancel
        </button>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>

      <div className="h-10" />
    </div>
  );
}
