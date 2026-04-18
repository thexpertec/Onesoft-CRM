import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Building2, DollarSign, ShoppingBag, Database, Scale, BookOpen,
  Save, Upload, Download, Trash2, RefreshCw,
  Globe, Mail, Phone, MapPin, Image as ImageIcon,
  AlertTriangle, Check, ChevronRight, X, Eye, EyeOff,
  FilePlus2, FileText, Star, ChevronDown, MoreVertical, Info, RotateCcw,
  PanelRight, Maximize2, LayoutTemplate, GripVertical, RotateCw, Link2, Printer, Pencil, ExternalLink,
  Plus, CreditCard,
} from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";
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
import { useAccounts } from "@/hooks/use-data";
import {
  AppSettings, LegalDocument, BankAccount, getSettings, saveSettings, ALL_STORE_KEYS,
  clearAccountingLedger, clearAllStoredModules,
} from "@/lib/store";
import { CRM_FORM_MODE_KEYS } from "@/components/form-wrapper";
import { CURRENCIES } from "@/lib/currencies";
import {
  QUICK_ACTIONS_REGISTRY, DEFAULT_QUICK_ACTIONS,
  LEFT_ACTIONS_REGISTRY, DEFAULT_LEFT_QUICK_ACTIONS,
  QuickActionItem, QuickActionDef,
} from "@/lib/quick-actions";

// ─── Tab ids ──────────────────────────────────────────────────────────────────
type TabId = "company" | "financial" | "pos" | "accounting" | "legal" | "data" | "interface" | "print" | "invoice_labels";

const FORM_MODE_OPTS: { value: "dialog" | "sheet"; label: string; icon: React.ElementType }[] = [
  { value: "dialog", label: "Form",       icon: Maximize2  },
  { value: "sheet",  label: "Side Panel", icon: PanelRight },
];

const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "company",    label: "Company Profile",   icon: Building2,      desc: "Name, logo & office contacts"         },
  { id: "financial",  label: "Financial",          icon: DollarSign,     desc: "Currency, VAT & fiscal year"          },
  { id: "pos",        label: "POS & Sales",        icon: ShoppingBag,    desc: "Receipt, payment & tax defaults"      },
  { id: "accounting", label: "Accounting Links",   icon: BookOpen,       desc: "Map COA accounts to POS & Invoices"   },
  { id: "interface",  label: "Interface",          icon: LayoutTemplate, desc: "Sidebar shortcuts & quick actions"    },
  { id: "print",          label: "Print Templates",    icon: FileText, desc: "Header & footer for printed docs"     },
  { id: "invoice_labels", label: "Invoice Labels",     icon: Pencil,   desc: "Customise text labels on invoices"    },
  { id: "legal",          label: "Legal Documents",    icon: Scale,    desc: "Terms, conditions & privacy policy"   },
  { id: "data",       label: "Data Management",    icon: Database,       desc: "Backup, import & reset"               },
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

// ─── Accounting Ledger reset row ──────────────────────────────────────────────
function LedgerResetRow({ onReset }: { onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/10 px-4 py-3 flex items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">Reset All Ledger Balances to Zero</p>
        </div>
        <p className="text-[12px] text-amber-700/80 dark:text-amber-400/70 leading-relaxed">
          Deletes every journal entry and sets all account opening balances to 0.00.
          The Chart of Accounts (accounts and groups) will be kept intact — only the values are cleared.
        </p>
      </div>
      <button
        onClick={() => setConfirm(true)}
        className="flex-shrink-0 flex items-center gap-1.5 text-[12px] font-medium text-amber-700 hover:text-red-700 dark:text-amber-300 dark:hover:text-red-400 px-3 py-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 border border-amber-300 hover:border-red-300 dark:border-amber-700 dark:hover:border-red-700 transition-colors"
      >
        <RotateCcw size={13} />
        Reset to Zero
      </button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle size={18} /> Reset Accounting Ledger to Zero?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>This will permanently:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Delete <strong>all journal entries</strong> (POS, invoices, purchases, and manual)</li>
                  <li>Set <strong>all account opening balances to £0</strong></li>
                </ul>
                <p className="font-medium text-foreground">The Chart of Accounts structure is preserved. This cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { setConfirm(false); onReset(); }}
            >
              Yes, Reset All Ledger Values to Zero
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Legal starter templates ──────────────────────────────────────────────────
function nowDate() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const LEGAL_TEMPLATES: { label: string; content: string }[] = [
  {
    label: "Terms & Conditions",
    content: `<h1>Terms and Conditions</h1>
<p>Last updated: ${nowDate()}</p>
<h2>1. Introduction</h2>
<p>These Terms and Conditions ("Terms") govern your use of our products and services ("Services") provided by Onesoft ("we", "us", or "our"), registered in England and Wales. By using our Services, you agree to be bound by these Terms.</p>
<h2>2. Services</h2>
<p>We provide software development, IT consultancy, and related services. The specific scope, deliverables, and fees for each engagement shall be set out in a separate Statement of Work or Service Agreement signed by both parties.</p>
<h2>3. Payment Terms</h2>
<p>Invoices are due within 30 days of the invoice date unless otherwise agreed in writing. Late payments may attract interest at 8% per annum above the Bank of England base rate, pursuant to the Late Payment of Commercial Debts (Interest) Act 1998.</p>
<h2>4. Intellectual Property</h2>
<p>All intellectual property rights in deliverables created by us shall remain our property until full payment has been received, at which point ownership shall transfer to the client as specified in the relevant agreement.</p>
<h2>5. Confidentiality</h2>
<p>Both parties agree to keep confidential all non-public information received from the other party and to use it only for the purposes of fulfilling obligations under these Terms.</p>
<h2>6. Limitation of Liability</h2>
<p>Our total liability to you for any loss or damage arising under or in connection with these Terms shall not exceed the total fees paid by you in the 3 months preceding the relevant claim.</p>
<h2>7. Governing Law</h2>
<p>These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>
<h2>8. Contact</h2>
<p>For any queries regarding these Terms, please contact us at our Hull, UK office.</p>`,
  },
  {
    label: "Privacy Policy",
    content: `<h1>Privacy Policy</h1>
<p>Last updated: ${nowDate()}</p>
<h2>1. Who We Are</h2>
<p>Onesoft ("we", "us", "our") is a software and IT solutions company operating from Hull, UK and Islamabad, Pakistan. We are committed to protecting your personal data in accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</p>
<h2>2. Data We Collect</h2>
<p>We may collect and process the following categories of personal data: name and contact details, company information, correspondence and communication records, payment and billing information, and data provided through our software systems.</p>
<h2>3. How We Use Your Data</h2>
<p>We use your personal data to: deliver our agreed services, process invoices and payments, communicate with you about your account, comply with legal obligations, and improve our services.</p>
<h2>4. Legal Basis</h2>
<p>We process your personal data on the basis of: contract performance, legitimate business interests, legal compliance, and where applicable, your explicit consent.</p>
<h2>5. Data Retention</h2>
<p>We retain personal data only for as long as necessary to fulfil the purposes for which it was collected, or as required by applicable law. Financial records are typically retained for 7 years.</p>
<h2>6. Your Rights</h2>
<p>Under UK GDPR, you have the right to: access your personal data, correct inaccurate data, request erasure ("right to be forgotten"), object to processing, and data portability. To exercise these rights, please contact us in writing.</p>
<h2>7. Transfers Outside the UK</h2>
<p>Where we transfer data to our Islamabad office, we ensure appropriate safeguards are in place in accordance with UK GDPR Chapter V requirements.</p>
<h2>8. Contact</h2>
<p>For data protection queries, please contact our Data Controller at our Hull, UK office.</p>`,
  },
  {
    label: "Non-Disclosure Agreement (NDA)",
    content: `<h1>Non-Disclosure Agreement</h1>
<p>Last updated: ${nowDate()}</p>
<p>This Non-Disclosure Agreement ("Agreement") is entered into between Onesoft ("Disclosing Party") and the recipient ("Receiving Party").</p>
<h2>1. Confidential Information</h2>
<p>"Confidential Information" means any non-public information disclosed by the Disclosing Party, whether in writing, orally, or by inspection of tangible objects, that is designated as "Confidential" or that reasonably should be understood to be confidential given the nature of the information and circumstances of disclosure.</p>
<h2>2. Obligations</h2>
<p>The Receiving Party agrees to: (a) hold all Confidential Information in strict confidence; (b) not disclose Confidential Information to any third party without prior written consent; (c) use the Confidential Information only for the purpose of evaluating or engaging in a potential business relationship.</p>
<h2>3. Exclusions</h2>
<p>These obligations do not apply to information that: (a) was publicly known at the time of disclosure; (b) becomes publicly known through no breach of this Agreement; (c) was received from a third party without restriction; or (d) is required to be disclosed by law or court order.</p>
<h2>4. Duration</h2>
<p>This Agreement shall remain in effect for a period of two (2) years from the date of signing, unless otherwise agreed in writing by both parties.</p>
<h2>5. Governing Law</h2>
<p>This Agreement is governed by the laws of England and Wales.</p>`,
  },
  {
    label: "Service Agreement",
    content: `<h1>Service Agreement</h1>
<p>Last updated: ${nowDate()}</p>
<p>This Service Agreement ("Agreement") is made between Onesoft ("Service Provider") and the client named in the associated Statement of Work ("Client").</p>
<h2>1. Services</h2>
<p>The Service Provider agrees to deliver the services described in the agreed Statement of Work. Specific deliverables, timelines, and acceptance criteria shall be set out therein.</p>
<h2>2. Fees and Payment</h2>
<p>The Client agrees to pay the fees set out in the Statement of Work. All invoices are due within 30 days of the invoice date. Overdue invoices may attract late payment interest in accordance with the Late Payment of Commercial Debts (Interest) Act 1998.</p>
<h2>3. Client Responsibilities</h2>
<p>The Client agrees to provide timely access to systems, information, and personnel as reasonably required for the Service Provider to perform the services.</p>
<h2>4. Warranties</h2>
<p>The Service Provider warrants that services will be performed with reasonable skill and care in accordance with industry standards.</p>
<h2>5. Limitation of Liability</h2>
<p>The total liability of the Service Provider shall not exceed the total fees paid under this Agreement in the 3 months preceding the relevant claim.</p>
<h2>6. Termination</h2>
<p>Either party may terminate this Agreement with 30 days written notice. In the event of material breach, either party may terminate immediately upon written notice.</p>
<h2>7. Governing Law</h2>
<p>This Agreement is governed by the laws of England and Wales.</p>`,
  },
];

// ─── LegalTab ─────────────────────────────────────────────────────────────────
function nanoid8() {
  return Math.random().toString(36).slice(2, 10);
}

function wordCount(html: string) {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

function LegalTab({
  form,
  set,
}: {
  form: AppSettings;
  set: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => void;
}) {
  const { toast } = useToast();
  const docs: LegalDocument[] = form.legalDocuments ?? [];

  const [activeId,     setActiveId]     = useState<string | null>(docs[0]?.id ?? null);
  const [preview,      setPreview]      = useState(false);
  const [tplOpen,      setTplOpen]      = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const tplRef = useRef<HTMLDivElement>(null);

  // Close template dropdown on outside click
  useEffect(() => {
    if (!tplOpen) return;
    function onDown(e: MouseEvent) {
      if (tplRef.current && !tplRef.current.contains(e.target as Node)) setTplOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [tplOpen]);

  const activeDoc = docs.find(d => d.id === activeId) ?? null;

  // ── helpers ──────────────────────────────────────────────────────────────────
  function updateDocs(next: LegalDocument[]) {
    set("legalDocuments", next);
  }

  function patchDoc(id: string, patch: Partial<LegalDocument>) {
    updateDocs(docs.map(d => d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d));
  }

  function addDoc() {
    const id  = nanoid8();
    const now = new Date().toISOString();
    const doc: LegalDocument = {
      id, title: "Untitled Document", content: "", isTemplate: false,
      createdAt: now, updatedAt: now,
    };
    updateDocs([...docs, doc]);
    setActiveId(id);
    setPreview(false);
  }

  function deleteDoc(id: string) {
    const next = docs.filter(d => d.id !== id);
    updateDocs(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
    setDeleteTarget(null);
    toast({ title: "Document deleted" });
  }

  function applyTemplate(tpl: { label: string; content: string }) {
    if (!activeDoc) return;
    patchDoc(activeDoc.id, { content: tpl.content });
    setTplOpen(false);
    toast({ title: `Template loaded: ${tpl.label}` });
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <SectionHeader
        title="Legal Documents"
        desc="Create and manage any number of custom documents — Terms, Privacy Policies, NDAs, Service Agreements, and more. Mark any document as a template to reuse it."
      />

      {/* ── Main layout: sidebar + editor ── */}
      <div className="flex gap-0 border border-gray-200 dark:border-border rounded-xl overflow-hidden min-h-[600px]">

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <div className="w-56 shrink-0 flex flex-col border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-zinc-900/50">
          {/* Add button */}
          <div className="p-3 border-b border-gray-200 dark:border-border">
            <button
              onClick={addDoc}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-100 dark:border-blue-800/40 transition-colors"
            >
              <FilePlus2 size={13} />
              New Document
            </button>
          </div>

          {/* Doc list */}
          <div className="flex-1 overflow-y-auto py-1">
            {docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-300 dark:text-zinc-600 px-4 text-center">
                <FileText size={24} strokeWidth={1} />
                <span className="text-[11px]">No documents yet. Click "New Document" to get started.</span>
              </div>
            ) : (
              docs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => { setActiveId(doc.id); setPreview(false); }}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors border-l-2 ${
                    doc.id === activeId
                      ? "border-blue-500 bg-white dark:bg-zinc-800/60 text-gray-900 dark:text-foreground"
                      : "border-transparent hover:bg-white/70 dark:hover:bg-zinc-800/30 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  <FileText size={13} className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium leading-snug truncate">{doc.title || "Untitled"}</div>
                    {doc.isTemplate && (
                      <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                        <Star size={9} fill="currentColor" /> Template
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Editor panel ─────────────────────────────────────── */}
        {activeDoc ? (
          <div className="flex-1 flex flex-col min-w-0">

            {/* Doc title bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-border bg-white dark:bg-card">
              <input
                value={activeDoc.title}
                onChange={e => patchDoc(activeDoc.id, { title: e.target.value })}
                placeholder="Document title…"
                className="flex-1 text-[15px] font-semibold bg-transparent border-0 outline-none text-gray-800 dark:text-foreground placeholder:text-gray-300 dark:placeholder:text-zinc-600 focus:ring-0"
              />
              {/* Template toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0 select-none">
                <input
                  type="checkbox"
                  checked={activeDoc.isTemplate}
                  onChange={e => patchDoc(activeDoc.id, { isTemplate: e.target.checked })}
                  className="sr-only"
                />
                <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                  activeDoc.isTemplate
                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700"
                    : "text-gray-400 dark:text-gray-500 border-gray-200 dark:border-zinc-700 hover:border-gray-300"
                }`}>
                  <Star size={10} fill={activeDoc.isTemplate ? "currentColor" : "none"} />
                  {activeDoc.isTemplate ? "Template" : "Mark as template"}
                </span>
              </label>
            </div>

            {/* Toolbar row */}
            <div className="flex items-center justify-between gap-2 px-5 py-2 bg-gray-50/50 dark:bg-zinc-900/30 border-b border-gray-100 dark:border-border">
              <div className="flex items-center gap-1.5">
                {activeDoc.content ? (
                  <span className="text-[11px] text-muted-foreground bg-gray-100 dark:bg-muted px-2 py-0.5 rounded-md">
                    ~{wordCount(activeDoc.content)} words
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground italic">Empty document</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-[12px]"
                  onClick={() => setPreview(p => !p)}
                >
                  {preview ? <EyeOff size={12} /> : <Eye size={12} />}
                  {preview ? "Edit" : "Preview"}
                </Button>

                {/* Load Template dropdown */}
                <div className="relative" ref={tplRef}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-[12px] border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    onClick={() => setTplOpen(o => !o)}
                  >
                    <Scale size={12} /> Load Template <ChevronDown size={10} />
                  </Button>
                  {tplOpen && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-52 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-lg overflow-hidden">
                      {LEGAL_TEMPLATES.map(tpl => (
                        <button
                          key={tpl.label}
                          onClick={() => applyTemplate(tpl)}
                          className="w-full text-left px-4 py-2.5 text-[12px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-muted transition-colors"
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-[12px] text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => setDeleteTarget(activeDoc.id)}
                >
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
            </div>

            {/* Editor / Preview */}
            <div className="flex-1 overflow-auto">
              {preview ? (
                <div
                  className="p-8 prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: activeDoc.content || "<p class='text-gray-400 italic'>Nothing written yet. Switch to Edit mode to start writing.</p>",
                  }}
                />
              ) : (
                <RichTextEditor
                  key={activeDoc.id}
                  value={activeDoc.content}
                  onChange={val => patchDoc(activeDoc.id, { content: val })}
                  placeholder="Start writing your document… or use Load Template to insert a starter draft."
                />
              )}
            </div>

            {/* Footer strip */}
            <div className="px-5 py-2 border-t border-gray-100 dark:border-border bg-gray-50/50 dark:bg-zinc-900/30 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Last updated: {new Date(activeDoc.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>Remember to click <strong>Save Changes</strong> after editing</span>
            </div>
          </div>
        ) : (
          /* Empty state — no doc selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-300 dark:text-zinc-600">
            <Scale size={48} strokeWidth={0.8} />
            <div className="text-center space-y-1">
              <p className="text-[14px] font-semibold text-gray-400 dark:text-zinc-500">No document selected</p>
              <p className="text-[12px]">Click "New Document" in the sidebar to create one,<br />or select an existing document from the list.</p>
            </div>
            <button
              onClick={addDoc}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 border border-blue-100 dark:border-blue-800/40 transition-colors"
            >
              <FilePlus2 size={14} /> Create your first document
            </button>
          </div>
        )}
      </div>

      {/* ── Delete confirm dialog ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{docs.find(d => d.id === deleteTarget)?.title || "This document"}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deleteTarget && deleteDoc(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Print template preview helpers ──────────────────────────────────────────
const _esc  = (s: string) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const _nl2br = (s: string) => _esc(s).replace(/\n/g,"<br/>");

function buildPrintHeaderHtml(s: AppSettings, note: string): string {
  const logo = s.logoBase64
    ? `<img src="${s.logoBase64}" alt="Logo" style="max-height:44px;max-width:140px;object-fit:contain;filter:brightness(0) invert(1);">`
    : `<span style="font-size:18pt;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1;">${_esc(s.companyName||"Company Name")}</span>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;padding:12px;}
    .hdr{background:linear-gradient(135deg,#0f2447 0%,#1a3a6b 100%);color:#e2e8f0;padding:14pt 20pt;display:flex;justify-content:space-between;align-items:center;border-radius:6px;}
    .tag{font-size:8pt;color:#94a3b8;margin-top:3pt;}
    .note{font-size:7.5pt;color:#cbd5e1;margin-top:4pt;font-style:italic;}
    .ttl{font-size:18pt;font-weight:700;color:#fff;letter-spacing:1pt;text-align:right;}
    .num{font-size:9pt;color:#93c5fd;margin-top:4pt;text-align:right;}
  </style></head><body>
  <div class="hdr">
    <div>${logo}${s.companyTagline?`<div class="tag">${_esc(s.companyTagline)}</div>`:""}${note?`<div class="note">${_nl2br(note)}</div>`:""}</div>
    <div><div class="ttl">INVOICE</div><div class="num">INV-0001</div></div>
  </div></body></html>`;
}

function buildPrintFooterHtml(s: AppSettings, showContact: boolean, customText: string, legalNote: string): string {
  const parts: string[] = [];
  if (showContact) {
    if (s.addressHull)         parts.push(_esc(s.addressHull));
    if (s.addressIslamabad)    parts.push(_esc(s.addressIslamabad));
    if (s.phoneHull)           parts.push(`Tel: ${_esc(s.phoneHull)}`);
    if (s.emailHull)           parts.push(_esc(s.emailHull));
    if (s.website)             parts.push(_esc(s.website));
    if (s.vatNumber)           parts.push(`VAT No: ${_esc(s.vatNumber)}`);
    if (s.companyRegistration) parts.push(`Reg: ${_esc(s.companyRegistration)}`);
  }
  const noData = showContact && parts.length === 0;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;padding:12px;}
    .ftr{background:#0f2447;color:#94a3b8;padding:10pt 20pt;font-size:7.5pt;line-height:1.7;text-align:center;border-radius:6px;}
    .fn{font-size:9.5pt;font-weight:700;color:#e2e8f0;margin-bottom:3pt;}
    .fl{color:#64748b;margin-bottom:1.5pt;}
    .fg{font-size:7pt;color:#334155;margin-top:6pt;padding-top:5pt;border-top:1px solid #1e3a5f;}
    .mt{color:#334155;font-style:italic;font-size:7pt;}
  </style></head><body>
  <div class="ftr">
    <div class="fn">${_esc(s.companyName||"Company")}${s.companyTagline?` — ${_esc(s.companyTagline)}`:""}</div>
    ${parts.length>0?`<div class="fl">${parts.join(" &nbsp;·&nbsp; ")}</div>`:noData?`<div class="mt">(Add address/phone/email in Company Profile)</div>`:""}
    ${customText?`<div class="fl">${_nl2br(customText)}</div>`:""}
    ${legalNote?`<div class="fg">${_nl2br(legalNote)}</div>`:""}
  </div></body></html>`;
}

function PrintPreviewFrame({ html, height = 120 }: { html: string; height?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcdoc = html; }, [html]);
  return (
    <iframe ref={ref} title="preview" scrolling="no" sandbox="allow-same-origin"
      style={{ width:"100%", height, border:"none", borderRadius:6, display:"block" }} />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { isSuperAdmin, currentTenant } = useAuth();
  const { toast } = useToast();
  const { accounts } = useAccounts();
  const [, navigate] = useLocation();

  // Ledger accounts only (for accounting mappings)
  const ledgerAccounts = accounts.filter(a => a.accountType === "Ledger" && a.isActive !== false);

  const [tab, setTab]         = useState<TabId>("company");
  const [form, setForm]       = useState<AppSettings>(() => getSettings());
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [nukeOpen, setNukeOpen] = useState(false);

  const logoInputRef  = useRef<HTMLInputElement>(null);
  const importRef     = useRef<HTMLInputElement>(null);

  // Re-read settings on mount so any backfill that ran after the lazy initializer is applied
  useEffect(() => {
    setForm(getSettings());
  }, []);

  const set = useCallback(<K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true);
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────────
  function handleSave() {
    setSaving(true);
    // When crmFormMode changes, clear all per-module overrides so the new default takes effect
    const prev = getSettings();
    if (prev.crmFormMode !== form.crmFormMode) {
      CRM_FORM_MODE_KEYS.forEach(k => localStorage.removeItem(k));
    }
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
            try { localStorage.setItem(k, JSON.stringify(data[k])); } catch { /* quota — server import still succeeded */ }
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

  // ── Nuke all ────────────────────────────────────────────────────────────────
  function nukeAll() {
    clearAllStoredModules();
    const scope = currentTenant ? currentTenant.name : "your account";
    toast({ title: "All data cleared", description: `Every record has been wiped for ${scope}. Reload to start fresh.`, variant: "destructive" });
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
            disabled={!dirty || saving || tab === "data" || tab === "invoice_labels"}
            className={`gap-2 h-9 px-4 text-[13px] ${tab === "legal" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
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

                {/* ── UI Preferences ─────────────────────────────────────────── */}
                <SectionHeader title="UI Preferences" desc="Control how forms open across CRM and HRM modules." />
                <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-semibold text-gray-800 dark:text-foreground">CRM / HRM Add-Form style</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Choose how the "Add" form opens in Customers, Sales Agents, Staff and Products.
                      </p>
                    </div>
                    <div className="flex rounded-lg border border-gray-200 dark:border-border overflow-hidden shrink-0">
                      {FORM_MODE_OPTS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => set("crmFormMode", opt.value)}
                          className={`flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold transition-all ${
                            form.crmFormMode === opt.value
                              ? "bg-blue-600 text-white"
                              : "bg-white dark:bg-card text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted/40"
                          }`}
                        >
                          <opt.icon size={13} />
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
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

                  <Field label="Decimal Places" hint="Number of decimal places shown on all prices, totals and amounts across the system.">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {([0, 1, 2, 3, 4] as const).map(dp => {
                        const label = dp === 0 ? "None" : "." + "0".repeat(dp);
                        const active = (form.decimalPlaces ?? 2) === dp;
                        return (
                          <button
                            key={dp}
                            type="button"
                            onClick={() => set("decimalPlaces", dp)}
                            className={`h-9 px-3 rounded-lg border-2 text-[13px] font-semibold font-mono transition-all ${
                              active
                                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                                : "border-border text-muted-foreground hover:border-indigo-300 dark:hover:border-indigo-700"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                      <span className="text-[11px] text-muted-foreground ml-1">
                        Preview: {(1234.5678).toFixed(form.decimalPlaces ?? 2)}
                      </span>
                    </div>
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

                <SectionHeader title="Reference Prefixes" desc="Prefix and digit format for all auto-generated reference numbers." />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Sale / Invoice Prefix">
                    <Input value={form.salePrefix} onChange={e => set("salePrefix", e.target.value)}
                      className="h-9 text-[13px] font-mono" placeholder="SAL-" />
                  </Field>
                  <Field label="Purchase Order Prefix">
                    <Input value={form.purchasePrefix} onChange={e => set("purchasePrefix", e.target.value)}
                      className="h-9 text-[13px] font-mono" placeholder="PO-" />
                  </Field>
                </div>

                <Field label="Sequence Digits" hint="How many digits the auto-incrementing number is padded to.">
                  <div className="flex items-center gap-2 flex-wrap">
                    {[3, 4, 5, 6].map(d => {
                      const active = (form.referenceDigits ?? 4) === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => set("referenceDigits", d)}
                          className={`h-9 px-3 rounded-lg border-2 text-[13px] font-semibold font-mono transition-all ${
                            active
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                              : "border-border text-muted-foreground hover:border-indigo-300 dark:hover:border-indigo-700"
                          }`}
                        >
                          {d} digits
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-6 text-[12px] text-muted-foreground font-mono">
                    <span>
                      Sale preview:{" "}
                      <strong className="text-foreground">
                        {(form.salePrefix || "SAL-").replace(/[-_\s]+$/, "")}-202506-{String(1).padStart(form.referenceDigits ?? 4, "0")}
                      </strong>
                    </span>
                    <span>
                      PO preview:{" "}
                      <strong className="text-foreground">
                        {(form.purchasePrefix || "PO-").replace(/[-_\s]+$/, "")}-202506-{String(1).padStart(form.referenceDigits ?? 4, "0")}
                      </strong>
                    </span>
                  </div>
                </Field>
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

                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-muted/30 rounded-lg border border-gray-100 dark:border-border">
                  <div>
                    <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">Show Profit on POS Line Items</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Display a green profit amount below each line subtotal (requires cost price on product)</p>
                  </div>
                  <Switch
                    checked={form.showPosProfit !== false}
                    onCheckedChange={v => set("showPosProfit", v)}
                  />
                </div>

                <div className={`flex items-center justify-between py-3 px-4 rounded-lg border transition-colors ${
                  form.allowNegativeStock
                    ? "bg-gray-50 dark:bg-muted/30 border-gray-100 dark:border-border"
                    : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                }`}>
                  <div>
                    <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">Allow Selling on Zero / Negative Stock</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {form.allowNegativeStock
                        ? "Products can be sold even when no stock is available (overselling allowed)"
                        : "POS will block adding a product to cart when its stock quantity is 0 or below"}
                    </p>
                  </div>
                  <Switch
                    checked={form.allowNegativeStock}
                    onCheckedChange={v => set("allowNegativeStock", v)}
                  />
                </div>

                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-muted/30 rounded-lg border border-gray-100 dark:border-border">
                  <div>
                    <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">Default Discount Type</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Discount mode applied to each new line item when added in POS
                    </p>
                  </div>
                  <div className="flex rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden text-[12px] font-semibold shrink-0">
                    <button
                      type="button"
                      onClick={() => set("posDiscountType", "pct")}
                      className={`px-4 py-1.5 transition-colors ${
                        form.posDiscountType !== "amt"
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700"
                      }`}
                    >
                      % Percentage
                    </button>
                    <button
                      type="button"
                      onClick={() => set("posDiscountType", "amt")}
                      className={`px-4 py-1.5 transition-colors border-l border-gray-200 dark:border-zinc-700 ${
                        form.posDiscountType === "amt"
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700"
                      }`}
                    >
                      Flat Amount
                    </button>
                  </div>
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

                  {/* ── Invoice Settings ── */}
                  <div className="col-span-2 pt-4 border-t border-gray-100 dark:border-zinc-800">
                    <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100 mb-4">Invoice Defaults</h3>
                    <div className="grid gap-4">
                      {/* ── Bank Accounts Manager ── */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <label className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">Bank / Payment Accounts</label>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Accounts selectable per invoice. Tick "Default" to pre-select on new invoices.</p>
                          </div>
                          <Button size="sm" variant="outline" type="button"
                            onClick={() => set("bankAccounts", [
                              ...(form.bankAccounts ?? []),
                              { id: crypto.randomUUID(), name: "", details: "", isDefault: false }
                            ])}
                            className="text-[12px] h-8 gap-1.5">
                            <Plus className="w-3.5 h-3.5" /> Add Account
                          </Button>
                        </div>
                        {(form.bankAccounts ?? []).length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-xl text-center">
                            <CreditCard className="w-8 h-8 text-gray-300 dark:text-zinc-600 mb-2" />
                            <p className="text-[12px] text-gray-400 dark:text-gray-500">No bank accounts yet. Click "Add Account" to add your first one.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {(form.bankAccounts ?? []).map((acc, idx) => (
                              <div key={acc.id} className="bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 space-y-2">
                                    <Input
                                      value={acc.name}
                                      onChange={e => set("bankAccounts", (form.bankAccounts ?? []).map((a, i) => i === idx ? { ...a, name: e.target.value } : a))}
                                      className="text-[13px] font-semibold"
                                      placeholder="Account name (e.g. Barclays UK, IBAN EUR)" />
                                    <Textarea
                                      value={acc.details}
                                      onChange={e => set("bankAccounts", (form.bankAccounts ?? []).map((a, i) => i === idx ? { ...a, details: e.target.value } : a))}
                                      className="text-[12px] resize-none font-mono" rows={4}
                                      placeholder={"Account Name: Onesoft Ltd\nAccount No: 12345678\nSort Code: 40-47-84\nIBAN: GB29 NWBK 6016 1331 9268 19\nSwift/BIC: BARCGB22"} />
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        id={`bank-default-${acc.id}`}
                                        checked={!!acc.isDefault}
                                        onChange={e => set("bankAccounts", (form.bankAccounts ?? []).map((a, i) => i === idx ? { ...a, isDefault: e.target.checked } : a))}
                                        className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" />
                                      <label htmlFor={`bank-default-${acc.id}`} className="text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                                        Pre-select on new invoices
                                      </label>
                                    </div>
                                  </div>
                                  <button type="button"
                                    onClick={() => set("bankAccounts", (form.bankAccounts ?? []).filter((_, i) => i !== idx))}
                                    className="mt-1 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Legacy single bank details field (hidden but kept for backward compat) */}
                      <input type="hidden" value={form.bankDetails} readOnly />
                      <Field label="Company Registration Number" hint="E.g. Companies House number (UK). Shown in invoice footer.">
                        <Input
                          value={form.companyRegistration}
                          onChange={e => set("companyRegistration", e.target.value)}
                          className="text-[13px]"
                          placeholder="e.g. 12345678" />
                      </Field>
                      <Field label="Social Links" hint="One per line. Shown in invoice footer.">
                        <Textarea
                          value={form.socialLinks}
                          onChange={e => set("socialLinks", e.target.value)}
                          className="text-[13px] resize-none" rows={3}
                          placeholder={"linkedin.com/company/onesoft\ntwitter.com/onesoft"} />
                      </Field>
                      <Field label="Default Payment Terms" hint="Pre-fills the Payment Terms field on every new invoice.">
                        <Input
                          value={form.invoiceTerms}
                          onChange={e => set("invoiceTerms", e.target.value)}
                          className="text-[13px]"
                          placeholder="Payment is due within 30 days of the invoice date." />
                      </Field>
                      <Field label="Invoice Footer Text" hint="Custom text shown at the bottom of every printed invoice.">
                        <Textarea
                          value={form.invoiceFooter}
                          onChange={e => set("invoiceFooter", e.target.value)}
                          className="text-[13px] resize-none" rows={2}
                          placeholder="E-&OE. All prices are subject to VAT." />
                      </Field>
                    </div>
                  </div>
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

            {/* ══ Accounting Links ═════════════════════════════════════════════ */}
            {tab === "accounting" && (
              <div className="space-y-6">
                <SectionHeader
                  title="Accounting Mappings"
                  desc="Link your Chart of Accounts to POS sales and invoices. When a sale is completed or an invoice is paid, a balanced journal entry is automatically posted to these accounts."
                />

                {/* Info banner */}
                <div className="flex gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4">
                  <Info size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-[12px] text-blue-800 dark:text-blue-200 space-y-1">
                    <p className="font-semibold">How auto-journaling works</p>
                    <p>Every completed POS sale or paid invoice automatically creates a posted journal entry:</p>
                    <p className="mt-1 font-mono bg-blue-100 dark:bg-blue-900/40 rounded px-2 py-1 text-[11px]">
                      DR  Cash / Bank / Receivable  =  Grand Total<br/>
                      CR  Sales Revenue              =  Subtotal (excl. VAT)<br/>
                      CR  VAT Payable  (if set)      =  VAT Amount
                    </p>
                    <p className="text-[11px] opacity-80">Only accounts of type <strong>Ledger</strong> appear in these selectors. If an account is not yet in your COA, create it first in Chart of Accounts.</p>
                  </div>
                </div>

                {ledgerAccounts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                    No ledger accounts found. Please create ledger accounts in the Chart of Accounts first.
                  </div>
                ) : (
                  <div className="space-y-5">

                    {/* Sales Revenue */}
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">CR</span>
                        <span className="text-[13px] font-semibold text-foreground">Sales Revenue Account</span>
                        <span className="text-[11px] text-muted-foreground">— credited on every sale (Revenue / Income head)</span>
                      </div>
                      <Select
                        value={form.accSalesRevenue || "__none__"}
                        onValueChange={v => set("accSalesRevenue", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Select revenue account…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-[13px] text-muted-foreground">— None (disable auto-journaling) —</SelectItem>
                          {ledgerAccounts
                            .filter(a => a.head === "Revenue / Income")
                            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-[13px]">
                                {a.code} — {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cash Account */}
                    <div className="rounded-xl border border-blue-200 dark:border-blue-800 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[11px] font-bold">DR</span>
                        <span className="text-[13px] font-semibold text-foreground">Cash Account</span>
                        <span className="text-[11px] text-muted-foreground">— debited for Cash payment method (Assets head)</span>
                      </div>
                      <Select
                        value={form.accCash || "__none__"}
                        onValueChange={v => set("accCash", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Select cash account…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-[13px] text-muted-foreground">— None —</SelectItem>
                          {ledgerAccounts
                            .filter(a => a.head === "Assets")
                            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-[13px]">
                                {a.code} — {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Bank / Card Account */}
                    <div className="rounded-xl border border-violet-200 dark:border-violet-800 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-[11px] font-bold">DR</span>
                        <span className="text-[13px] font-semibold text-foreground">Bank / Card Account</span>
                        <span className="text-[11px] text-muted-foreground">— debited for Card, Bank Transfer & Cheque (Assets head)</span>
                      </div>
                      <Select
                        value={form.accBank || "__none__"}
                        onValueChange={v => set("accBank", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Select bank account…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-[13px] text-muted-foreground">— None —</SelectItem>
                          {ledgerAccounts
                            .filter(a => a.head === "Assets")
                            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-[13px]">
                                {a.code} — {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Accounts Receivable */}
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-[11px] font-bold">DR</span>
                        <span className="text-[13px] font-semibold text-foreground">Accounts Receivable</span>
                        <span className="text-[11px] text-muted-foreground">— debited for Credit / On-Credit sales (Assets head)</span>
                      </div>
                      <Select
                        value={form.accReceivable || "__none__"}
                        onValueChange={v => set("accReceivable", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Select receivable account…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-[13px] text-muted-foreground">— None —</SelectItem>
                          {ledgerAccounts
                            .filter(a => a.head === "Assets")
                            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-[13px]">
                                {a.code} — {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* VAT Payable (optional) */}
                    <div className="rounded-xl border border-rose-200 dark:border-rose-800 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 text-[11px] font-bold">CR</span>
                        <span className="text-[13px] font-semibold text-foreground">VAT Payable Account <span className="text-muted-foreground font-normal">(optional)</span></span>
                        <span className="text-[11px] text-muted-foreground">— credited with VAT collected when tax &gt; 0 (Liabilities head)</span>
                      </div>
                      <Select
                        value={form.accVatPayable || "__none__"}
                        onValueChange={v => set("accVatPayable", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Select VAT payable account… (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-[13px] text-muted-foreground">— None (VAT not separately tracked) —</SelectItem>
                          {ledgerAccounts
                            .filter(a => a.head === "Liabilities")
                            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-[13px]">
                                {a.code} — {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* ── COGS Account ── */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 text-[11px] font-bold">DR</span>
                        <span className="text-[13px] font-semibold text-foreground">Cost of Goods Sold Account <span className="text-muted-foreground font-normal">(optional)</span></span>
                        <span className="text-[11px] text-muted-foreground">— debited with product cost on every sale (Expense head)</span>
                      </div>
                      <Select
                        value={form.accCogs || "__none__"}
                        onValueChange={v => set("accCogs", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Select COGS account… (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-[13px] text-muted-foreground">— None (COGS not tracked) —</SelectItem>
                          {ledgerAccounts
                            .filter(a => a.head === "Expense")
                            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-[13px]">
                                {a.code} — {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* ── Inventory Account ── */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 text-[11px] font-bold">CR</span>
                        <span className="text-[13px] font-semibold text-foreground">Inventory / Stock Account <span className="text-muted-foreground font-normal">(optional)</span></span>
                        <span className="text-[11px] text-muted-foreground">— credited to reduce stock value when goods are sold (Assets head)</span>
                      </div>
                      <Select
                        value={form.accInventory || "__none__"}
                        onValueChange={v => set("accInventory", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Select inventory account… (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-[13px] text-muted-foreground">— None (inventory not tracked in accounts) —</SelectItem>
                          {ledgerAccounts
                            .filter(a => a.head === "Assets")
                            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-[13px]">
                                {a.code} — {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* ── Purchase Payable Account ── */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 text-[11px] font-bold">CR</span>
                        <span className="text-[13px] font-semibold text-foreground">Purchase Payable Account <span className="text-muted-foreground font-normal">(optional)</span></span>
                        <span className="text-[11px] text-muted-foreground">— credited when a Purchase Order is received (Liabilities head)</span>
                      </div>
                      <Select
                        value={form.accPurchasePayable || "__none__"}
                        onValueChange={v => set("accPurchasePayable", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Select accounts payable account… (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-[13px] text-muted-foreground">— None (purchases not tracked in accounts) —</SelectItem>
                          {ledgerAccounts
                            .filter(a => a.head === "Liabilities")
                            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-[13px]">
                                {a.code} — {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                  </div>
                )}
              </div>
            )}

            {/* ══ Interface / Sidebar Quick Actions ════════════════════════════ */}
            {tab === "interface" && (
              <div className="space-y-10">

                {/* ── Font Sizes ───────────────────────────────────────────── */}
                <div>
                  <SectionHeader
                    title="Font Sizes"
                    desc="Control text size for each UI element category. Changes apply immediately across the dashboard."
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {([
                      { key: "fontHeadRow" as const, label: "Header Row",  desc: "Column headers in tables & grids",    min: 8, max: 20, def: 12 },
                      { key: "fontDataRow" as const, label: "Data Row",    desc: "Data cells in tables & grids",        min: 8, max: 20, def: 13 },
                      { key: "fontButton"  as const, label: "Button",      desc: "Text inside all buttons",             min: 8, max: 20, def: 13 },
                      { key: "fontTag"     as const, label: "Tag / Badge",  desc: "Status pills, count badges & tags",   min: 7, max: 18, def: 11 },
                      { key: "fontFilter"  as const, label: "Filter Bar",   desc: "Toolbar, filter & search bar text",   min: 8, max: 20, def: 12 },
                    ] as const).map(({ key, label, desc, min, max, def }) => {
                      const val = (form[key] as number | undefined) ?? def;
                      return (
                        <div key={key} className="rounded-xl border border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/40 p-4 flex flex-col gap-3">
                          <div>
                            <p className="text-[13px] font-semibold text-gray-800 dark:text-foreground leading-tight">{label}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={val <= min}
                              onClick={() => set(key, Math.max(min, val - 1) as AppSettings[typeof key])}
                              className="w-8 h-8 rounded-lg border border-gray-200 dark:border-zinc-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-[15px] transition-colors select-none"
                            >−</button>
                            <div className="flex-1 text-center">
                              <span className="text-[17px] font-bold font-mono text-gray-900 dark:text-gray-100">{val}</span>
                              <span className="text-[11px] text-gray-400 ml-0.5">px</span>
                            </div>
                            <button
                              type="button"
                              disabled={val >= max}
                              onClick={() => set(key, Math.min(max, val + 1) as AppSettings[typeof key])}
                              className="w-8 h-8 rounded-lg border border-gray-200 dark:border-zinc-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-[15px] transition-colors select-none"
                            >+</button>
                          </div>
                          <div className="h-8 flex items-center justify-center rounded-lg bg-white dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-800">
                            <span style={{ fontSize: `${val}px` }} className="text-gray-600 dark:text-gray-300 select-none">Sample text {val}px</span>
                          </div>
                          {val !== def && (
                            <button
                              type="button"
                              onClick={() => set(key, def as AppSettings[typeof key])}
                              className="text-[11px] text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 text-center transition-colors"
                            >Reset to default ({def}px)</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-gray-100 dark:border-border" />

                {/* Left sidebar */}
                <QuickActionsTab
                  title="Left Sidebar Quick Actions"
                  desc="Drag to reorder. Toggle the eye icon to show or hide each shortcut. Saved per tenant."
                  registry={LEFT_ACTIONS_REGISTRY}
                  defaultItems={DEFAULT_LEFT_QUICK_ACTIONS}
                  value={form.quickActionsLeft ?? DEFAULT_LEFT_QUICK_ACTIONS}
                  onChange={v => set("quickActionsLeft", v)}
                  onSave={() => {
                    saveSettings({ ...form, quickActionsLeft: form.quickActionsLeft ?? DEFAULT_LEFT_QUICK_ACTIONS });
                    setDirty(false);
                    setSaving(false);
                    toast({ title: "Left sidebar saved", description: "Changes will apply immediately on next page load." });
                  }}
                />
                <div className="border-t border-gray-100 dark:border-border" />
                {/* Right sidebar */}
                <QuickActionsTab
                  title="Right Sidebar Quick Actions"
                  desc="Drag to reorder. Toggle the eye icon to show or hide each shortcut. Saved per tenant."
                  registry={QUICK_ACTIONS_REGISTRY}
                  defaultItems={DEFAULT_QUICK_ACTIONS}
                  value={form.quickActionsRight ?? DEFAULT_QUICK_ACTIONS}
                  onChange={v => set("quickActionsRight", v)}
                  onSave={() => {
                    saveSettings({ ...form, quickActionsRight: form.quickActionsRight ?? DEFAULT_QUICK_ACTIONS });
                    setDirty(false);
                    setSaving(false);
                    toast({ title: "Right sidebar saved", description: "Changes will apply immediately on next page load." });
                  }}
                />
              </div>
            )}

            {/* ══ Print Templates ══════════════════════════════════════════════ */}
            {tab === "print" && (
              <div className="space-y-8">
                <SectionHeader
                  title="Print Templates"
                  desc="Customise the header and footer that appear on all printed documents — invoices, purchase orders, and more. Live preview updates as you type."
                />

                {/* ── Info notice ── */}
                <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 px-4 py-3 text-[12px] text-blue-700 dark:text-blue-300">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  <span>
                    Company name, logo, tagline and contact details come from the{" "}
                    <button onClick={() => setTab("company")} className="font-semibold underline underline-offset-2 hover:text-blue-900">
                      Company Profile
                    </button>{" "}tab. Edit them there to update what appears here.
                  </span>
                </div>

                {/* ── Header Template ── */}
                <div className="rounded-xl border border-gray-200 dark:border-border overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-50 dark:bg-muted/20 border-b border-gray-100 dark:border-border">
                    <Printer size={15} className="text-primary" />
                    <div>
                      <p className="text-[13px] font-semibold text-gray-800 dark:text-foreground">Header Template</p>
                      <p className="text-[11px] text-muted-foreground">Top banner of every printed document — logo, company name, document title</p>
                    </div>
                    <span className="ml-auto text-[10px] font-medium bg-gray-200 dark:bg-muted text-gray-600 dark:text-gray-400 rounded px-1.5 py-0.5">Top of page</span>
                  </div>
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: form */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">From Company Profile</p>
                        <div className="space-y-1.5">
                          {[
                            ["Logo / Name", form.logoBase64 ? "Logo uploaded ✓" : form.companyName],
                            ["Tagline",     form.companyTagline],
                          ].map(([lbl, val]) => (
                            <div key={lbl as string} className="flex items-center gap-2 py-1 px-3 rounded-md bg-gray-50 dark:bg-muted/30 border border-dashed border-gray-200 dark:border-border">
                              <span className="text-[11px] text-muted-foreground min-w-[70px]">{lbl}</span>
                              <span className="text-[12px] font-medium text-gray-700 dark:text-gray-200 flex-1 truncate">
                                {val || <em className="text-muted-foreground">—</em>}
                              </span>
                            </div>
                          ))}
                          <button onClick={() => setTab("company")} className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">
                            <Link2 size={11} /> Edit in Company Profile <ChevronRight size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="border-t border-gray-100 dark:border-border pt-4">
                        <Field
                          label="Header Note (optional)"
                          hint="Small italic text shown below the company name/tagline. Use for a slogan, branch name, or extra info."
                        >
                          <Textarea
                            value={form.printHeaderNote ?? ""}
                            onChange={e => set("printHeaderNote", e.target.value)}
                            placeholder="e.g. Authorised dealer · Registered in England & Wales"
                            rows={2}
                            className="text-[13px] resize-none"
                          />
                        </Field>
                      </div>
                    </div>
                    {/* Right: preview */}
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <Eye size={11} /> Live Preview
                      </p>
                      <div className="rounded-lg border border-gray-200 dark:border-border overflow-hidden bg-gray-100 dark:bg-muted/20 p-2">
                        <PrintPreviewFrame html={buildPrintHeaderHtml(form, form.printHeaderNote ?? "")} height={108} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Right side shows document title/number — filled automatically per document.</p>
                    </div>
                  </div>
                </div>

                {/* ── Footer Template ── */}
                <div className="rounded-xl border border-gray-200 dark:border-border overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-50 dark:bg-muted/20 border-b border-gray-100 dark:border-border">
                    <Printer size={15} className="text-primary" />
                    <div>
                      <p className="text-[13px] font-semibold text-gray-800 dark:text-foreground">Footer Template</p>
                      <p className="text-[11px] text-muted-foreground">Bottom band — company contact strip, custom message, and legal note</p>
                    </div>
                    <span className="ml-auto text-[10px] font-medium bg-gray-200 dark:bg-muted text-gray-600 dark:text-gray-400 rounded px-1.5 py-0.5">Bottom of page</span>
                  </div>
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: form */}
                    <div className="space-y-4">
                      {/* Contact toggle */}
                      <div className="flex items-start gap-3 rounded-lg border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/20 px-4 py-3">
                        <Switch
                          checked={form.printFooterShowContact !== false}
                          onCheckedChange={v => set("printFooterShowContact", v)}
                          id="pf-contact"
                        />
                        <div className="flex-1 min-w-0">
                          <Label htmlFor="pf-contact" className="text-[13px] font-medium cursor-pointer">Show company contact info</Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Displays addresses, phone, email, website, VAT number &amp; company registration in the footer.
                          </p>
                          {form.printFooterShowContact !== false && (
                            <div className="mt-2 space-y-0.5">
                              {[
                                ["Address (Hull)",      form.addressHull],
                                ["Address (Islamabad)", form.addressIslamabad],
                                ["Phone",              form.phoneHull],
                                ["Email",              form.emailHull],
                                ["Website",            form.website],
                                ["VAT No",             form.vatNumber],
                                ["Company Reg",        form.companyRegistration],
                              ].filter(([, v]) => v).map(([l, v]) => (
                                <div key={l as string} className="flex gap-2 text-[11px]">
                                  <span className="text-muted-foreground min-w-[90px]">{l}:</span>
                                  <span className="text-gray-700 dark:text-gray-300 truncate">{v}</span>
                                </div>
                              ))}
                              {!form.addressHull && !form.phoneHull && !form.emailHull && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">No contact details yet — add them in Company Profile.</p>
                              )}
                              <button onClick={() => setTab("company")} className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">
                                <Link2 size={11} /> Edit in Company Profile <ChevronRight size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <Field label="Custom Footer Text" hint="e.g. payment terms, thank-you message, or promotional note — shown below contact info.">
                        <Textarea
                          value={form.invoiceFooter ?? ""}
                          onChange={e => set("invoiceFooter", e.target.value)}
                          placeholder="e.g. Thank you for your business! Payment due within 30 days."
                          rows={2}
                          className="text-[13px] resize-none"
                        />
                      </Field>
                      <Field label="Legal Note" hint="Fine-print shown at the very bottom of the footer. Clear this field to hide it.">
                        <Textarea
                          value={form.printFooterLegalNote ?? "This is a computer-generated document. No handwritten signature is required."}
                          onChange={e => set("printFooterLegalNote", e.target.value)}
                          placeholder="e.g. This is a computer-generated document…"
                          rows={2}
                          className="text-[13px] resize-none"
                        />
                      </Field>
                    </div>
                    {/* Right: preview */}
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <Eye size={11} /> Live Preview
                      </p>
                      <div className="rounded-lg border border-gray-200 dark:border-border overflow-hidden bg-gray-100 dark:bg-muted/20 p-2">
                        <PrintPreviewFrame
                          html={buildPrintFooterHtml(
                            form,
                            form.printFooterShowContact !== false,
                            form.invoiceFooter ?? "",
                            form.printFooterLegalNote ?? "This is a computer-generated document. No handwritten signature is required.",
                          )}
                          height={140}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">This footer appears on every page of the printed document.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ Invoice Labels ═══════════════════════════════════════════════ */}
            {tab === "invoice_labels" && (
              <div className="space-y-8">
                <SectionHeader
                  title="Invoice Labels"
                  desc="Customise the text labels that appear on printed sale and purchase invoices — column headers, totals, section titles, and more."
                />
                <div className="flex flex-col items-center justify-center gap-6 py-12 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/40">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                      <Pencil size={26} className="text-blue-500 dark:text-blue-400" />
                    </div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Visual Label Editor</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                      Click any label on the live invoice preview to rename it. Changes apply to all printed invoices instantly.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("/invoice-template")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm"
                  >
                    <ExternalLink size={15} /> Open Invoice Label Editor
                  </button>
                </div>
              </div>
            )}

            {/* ══ Legal Documents ══════════════════════════════════════════════ */}
            {tab === "legal" && (
              <LegalTab form={form} set={set} />
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
                    Backup includes: leads, customers, products, stock, purchases, sales, documents, HRM staff, roles, users, and settings.
                  </p>
                </div>

                {/* Accounting Ledger Reset */}
                {isSuperAdmin && (
                  <div>
                    <SectionHeader
                      title="Reset Accounting Ledger"
                      desc="Reset all account balances to zero. Journal entries are deleted and all opening balances are set to 0. The Chart of Accounts structure is preserved."
                    />
                    <LedgerResetRow onReset={() => {
                      clearAccountingLedger();
                      toast({ title: "Accounting ledger reset to zero", description: "All journal entries deleted and opening balances set to 0." });
                    }} />
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
          {!dirty && saving === false && tab !== "data" && tab !== "interface" && (
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

// ─── QuickActionsTab ──────────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  Purchasing:    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  Sales:         "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  Invoicing:     "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  Accounting:    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  CRM:           "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  Inventory:     "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  Manufacturing: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  HRM:           "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  Catalogue:     "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  Settings:      "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

const SIDEBAR_PREVIEW_COLORS: Record<string, string> = {
  indigo: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40",
  green:  "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40",
  emerald:"text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
  teal:   "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40",
  red:    "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40",
  blue:   "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40",
  purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40",
  amber:  "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
  sky:    "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40",
  violet: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40",
  slate:  "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40",
  cyan:   "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40",
  orange: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40",
  pink:   "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40",
};

function QuickActionsTab({
  title, desc, registry, defaultItems, value, onChange, onSave,
}: {
  title: string;
  desc: string;
  registry: QuickActionDef[];
  defaultItems: QuickActionItem[];
  value: QuickActionItem[];
  onChange: (v: QuickActionItem[]) => void;
  onSave: () => void;
}) {
  // Ensure every registered action exists in the list (add new ones at the end, hidden)
  const [items, setItems] = useState<QuickActionItem[]>(() => {
    const existing = new Map(value.map(i => [i.id, i]));
    const merged: QuickActionItem[] = [
      ...value.filter(i => registry.some(r => r.id === i.id)),
      ...registry
        .filter(r => !existing.has(r.id))
        .map(r => ({ id: r.id, visible: false })),
    ];
    return merged;
  });

  const [dragId,    setDragId]    = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [saved,     setSaved]     = useState(false);

  const visibleCount = items.filter(i => i.visible).length;

  const toggleVisible = (id: string) => {
    const next = items.map(i => i.id === id ? { ...i, visible: !i.visible } : i);
    setItems(next);
    onChange(next);
    setSaved(false);
  };

  const resetDefaults = () => {
    setItems(defaultItems);
    onChange(defaultItems);
    setSaved(false);
  };

  const handleSave = () => {
    onSave();
    setSaved(true);
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver  = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); };
  const handleDragEnd   = () => { setDragId(null); setDragOverId(null); };
  const handleDrop      = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const from = items.findIndex(i => i.id === dragId);
    const to   = items.findIndex(i => i.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    onChange(next);
    setSaved(false);
    setDragId(null);
    setDragOverId(null);
  };

  // ── Mini preview sidebar ───────────────────────────────────────────────────
  const previewItems = items
    .filter(i => i.visible)
    .map(i => registry.find(r => r.id === i.id))
    .filter(Boolean) as QuickActionDef[];

  return (
    <div className="space-y-6">
      <SectionHeader title={title} desc={desc} />

      <div className="flex gap-5 items-start">

        {/* ── Drag-and-drop list ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] text-muted-foreground">
              {visibleCount} of {items.length} shortcuts visible
            </p>
            <button
              type="button"
              onClick={resetDefaults}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              title="Reset to built-in defaults"
            >
              <RotateCw size={12} />
              Reset defaults
            </button>
          </div>

          {items.map(item => {
            const def = registry.find(r => r.id === item.id);
            if (!def) return null;
            const Icon = def.icon;
            const isDragging = dragId === item.id;
            const isOver     = dragOverId === item.id;
            const previewColor = SIDEBAR_PREVIEW_COLORS[def.color] ?? SIDEBAR_PREVIEW_COLORS.blue;

            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={e => handleDragOver(e, item.id)}
                onDragEnd={handleDragEnd}
                onDrop={() => handleDrop(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-grab select-none
                  ${isDragging ? "opacity-40 scale-95 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30" : ""}
                  ${isOver && !isDragging ? "border-blue-400 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/20 scale-[1.01]" : ""}
                  ${!isDragging && !isOver ? "border-gray-200 dark:border-border bg-white dark:bg-card hover:border-gray-300 dark:hover:border-zinc-600" : ""}
                  ${!item.visible ? "opacity-60" : ""}
                `}
              >
                {/* Drag handle */}
                <GripVertical size={15} className="text-gray-300 dark:text-zinc-600 shrink-0 cursor-grab" />

                {/* Icon pill */}
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${previewColor}`}>
                  <Icon size={14} />
                </span>

                {/* Label + group */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-[13px] font-medium text-gray-800 dark:text-foreground truncate">{def.titleFull}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${GROUP_COLORS[def.group] ?? "bg-gray-100 text-gray-600"}`}>
                    {def.group}
                  </span>
                </div>

                {/* Short label preview */}
                <span className="text-[11px] text-muted-foreground font-mono shrink-0 hidden sm:block">{def.label}</span>

                {/* Visibility toggle */}
                <button
                  type="button"
                  onClick={() => toggleVisible(item.id)}
                  title={item.visible ? "Click to hide" : "Click to show"}
                  className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                    ${item.visible
                      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                      : "bg-gray-100 dark:bg-muted text-gray-400 dark:text-zinc-600 hover:bg-gray-200 dark:hover:bg-muted/60"
                    }`}
                >
                  {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Mini live preview ────────────────────────────────────────────────── */}
        <div className="shrink-0 hidden lg:block">
          <p className="text-[11px] text-muted-foreground mb-2 text-center font-medium uppercase tracking-wide">Preview</p>
          <div className="w-[54px] rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden py-2 flex flex-col min-h-[300px]">
            {previewItems.length === 0 ? (
              <p className="text-[9px] text-muted-foreground text-center px-1 pt-4 leading-tight">No items visible</p>
            ) : (() => {
              const rows: React.ReactNode[] = [];
              let prevGroup = "";
              previewItems.forEach((def, idx) => {
                if (idx > 0 && def.group !== prevGroup) {
                  rows.push(<div key={`d${idx}`} className="mx-2 my-1 h-px bg-gray-100 dark:bg-border" />);
                }
                prevGroup = def.group;
                const Icon = def.icon;
                const previewColor = SIDEBAR_PREVIEW_COLORS[def.color] ?? "";
                rows.push(
                  <div key={def.id} className={`flex flex-col items-center justify-center py-2 px-1 gap-0.5 mx-1 rounded-lg ${previewColor}`}>
                    <Icon size={14} />
                    <span className="text-[8px] font-medium text-center leading-tight truncate w-full text-center">{def.label}</span>
                  </div>
                );
              });
              return rows;
            })()}
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">{visibleCount} shortcuts</p>
        </div>
      </div>

      {/* ── Save button ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-border">
        <Button
          onClick={handleSave}
          className="gap-2 h-9 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Save size={14} />
          Save Sidebar Layout
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
            <Check size={13} />
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}
