import {
  useState, useMemo, useRef, useEffect, useCallback,
} from "react";
import { useLeads, useCustomers } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Lead, LeadStatus, convertLeadToCustomer, getCustomers } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Search, Plus, Trash2, UserCheck, ChevronDown, X, Save,
  MoreHorizontal, Eye, Upload, Download,
  FileSpreadsheet, AlertTriangle, CheckCircle2, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// ─── Column definitions ────────────────────────────────────────────────────────
type EditableField = keyof Pick<Lead, "name" | "company" | "email" | "phone" | "industry" | "city" | "status" | "source" | "notes">;

const LEAD_STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];

const STATUS_STYLES: Record<LeadStatus, string> = {
  New:           "bg-blue-100  dark:bg-blue-900  text-blue-700  dark:text-blue-300",
  Contacted:     "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
  Qualified:     "bg-cyan-100  dark:bg-cyan-900  text-cyan-700  dark:text-cyan-300",
  "Proposal Sent":"bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  Won:           "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  Lost:          "bg-red-100   dark:bg-red-900   text-red-600   dark:text-red-400",
};

const COLS: { field: EditableField; label: string; minW: number; type: "text" | "email" | "tel" | "select" }[] = [
  { field: "name",     label: "Name",     minW: 150, type: "text"   },
  { field: "company",  label: "Company",  minW: 140, type: "text"   },
  { field: "email",    label: "Email",    minW: 190, type: "email"  },
  { field: "phone",    label: "Phone",    minW: 130, type: "tel"    },
  { field: "industry", label: "Industry", minW: 120, type: "text"   },
  { field: "city",     label: "City",     minW: 110, type: "text"   },
  { field: "status",   label: "Status",   minW: 140, type: "select" },
  { field: "source",   label: "Source",   minW: 110, type: "text"   },
  { field: "notes",    label: "Notes",    minW: 200, type: "text"   },
];

// ─── Blank new-lead template ───────────────────────────────────────────────────
const BLANK_ROW = (): Record<EditableField, string> => ({
  name: "", company: "", email: "", phone: "",
  industry: "", city: "", status: "New", source: "", notes: "",
});

// ─── CSV Template ─────────────────────────────────────────────────────────────
const CSV_HEADERS = ["name", "company", "email", "phone", "industry", "city", "status", "source", "notes"] as const;

const CSV_TEMPLATE_ROWS = [
  ["Jane Smith",   "Acme Ltd",     "jane@acme.com",    "+44 7700 111222", "Technology",   "Hull",       "New",       "Website",  "Interested in ERP solution"],
  ["John Doe",     "Beta Corp",    "john@betacorp.com","",               "Manufacturing", "Leeds",      "Contacted", "Referral", "Follow up next week"],
  ["Sara Ahmed",   "Delta Systems","sara@delta.pk",    "+92 300 1234567", "IT Services",  "Islamabad",  "Qualified", "Cold Call","Requested proposal"],
];

function downloadTemplate() {
  const rows = [
    CSV_HEADERS.join(","),
    ...CSV_TEMPLATE_ROWS.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "leads-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
type ParsedRow = Record<string, string>;

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length === 0) return { headers: [], rows: [] };

  // Parse a single CSV line handling quoted fields
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === "," && !inQuote) {
        result.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseLine(line);
    const row: ParsedRow = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

// Map a parsed CSV row → lead fields (flexible header matching)
const FIELD_ALIASES: Record<EditableField, string[]> = {
  name:     ["name", "full name", "fullname", "lead name", "contact name", "first name"],
  company:  ["company", "company name", "organisation", "organization", "business"],
  email:    ["email", "email address", "e-mail"],
  phone:    ["phone", "phone number", "mobile", "tel", "telephone"],
  industry: ["industry", "sector", "vertical"],
  city:     ["city", "location", "town"],
  status:   ["status", "lead status", "stage"],
  source:   ["source", "lead source", "channel", "origin"],
  notes:    ["notes", "note", "comments", "comment", "description"],
};

function mapRow(row: ParsedRow): Record<EditableField, string> {
  const result = BLANK_ROW();
  (Object.keys(FIELD_ALIASES) as EditableField[]).forEach(field => {
    for (const alias of FIELD_ALIASES[field]) {
      if (row[alias] !== undefined) { result[field] = row[alias]; break; }
    }
  });
  // Validate & normalise status
  const validStatuses: string[] = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];
  const rawStatus = result.status.trim();
  const matchedStatus = validStatuses.find(s => s.toLowerCase() === rawStatus.toLowerCase());
  result.status = matchedStatus ?? "New";
  return result;
}

type ImportRow = {
  mapped:  Record<EditableField, string>;
  error?:  string;   // null = valid
  isDupe?: boolean;  // email or phone matches existing
};

// ─── EditableCell ──────────────────────────────────────────────────────────────
function EditableCell({
  value,
  col,
  active,
  canEdit,
  onActivate,
  onCommit,
  onCancel,
  onTab,
  onEnter,
}: {
  value: string;
  col: (typeof COLS)[number];
  active: boolean;
  canEdit: boolean;
  onActivate: () => void;
  onCommit: (v: string) => void;
  onCancel: () => void;
  onTab: (shift: boolean) => void;
  onEnter: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (active) {
      setDraft(value);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
        selectRef.current?.focus();
      }, 0);
    }
  }, [active]);

  const commit = () => onCommit(draft);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    else if (e.key === "Enter") { e.preventDefault(); commit(); onEnter(); }
    else if (e.key === "Tab") { e.preventDefault(); commit(); onTab(e.shiftKey); }
  };

  // ── Active edit mode ──────────────────────────────────────────────────────
  if (active && canEdit) {
    if (col.type === "select") {
      return (
        <div className="relative w-full h-full">
          <select
            ref={selectRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); onCommit(e.target.value); }}
            onBlur={commit}
            onKeyDown={handleKey}
            className="absolute inset-0 w-full h-full px-2 text-[13px] font-medium bg-white dark:bg-card border-0 outline-none cursor-pointer"
          >
            {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      );
    }
    return (
      <input
        ref={inputRef}
        type={col.type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground"
        style={{ boxSizing: "border-box" }}
      />
    );
  }

  // ── Display mode ──────────────────────────────────────────────────────────
  return (
    <div
      className={`w-full h-full flex items-center px-3 text-[13px] overflow-hidden ${canEdit ? "cursor-text" : "cursor-default"}`}
      onClick={canEdit ? onActivate : undefined}
    >
      {col.field === "status" ? (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLES[value as LeadStatus] || ""}`}>
          {value}
        </span>
      ) : (
        <span className={`truncate text-gray-700 dark:text-foreground ${!value ? "text-gray-300 dark:text-muted-foreground/30" : ""}`}>
          {value || (canEdit ? "—" : "")}
        </span>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Leads() {
  const { leads, addLead, editLead, removeLead } = useLeads();
  const { refresh: refreshCustomers } = useCustomers();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const convertedLeadIds = useMemo(
    () => new Set(getCustomers().map(c => c.leadId).filter(Boolean)),
    [leads]
  );

  // ── Import state ─────────────────────────────────────────────────────────
  const [importOpen,    setImportOpen]    = useState(false);
  const [importRows,    setImportRows]    = useState<ImportRow[]>([]);
  const [skipDupes,     setSkipDupes]     = useState(true);
  const [importing,     setImporting]     = useState(false);
  const [dragOver,      setDragOver]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingEmails = useMemo(() => new Set(leads.map(l => l.email?.toLowerCase()).filter(Boolean)), [leads]);
  const existingPhones = useMemo(() => new Set(leads.map(l => l.phone?.replace(/\D/g, "")).filter(p => p && p.length >= 7)), [leads]);

  function processFile(file: File) {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast({ title: "Invalid file type", description: "Please upload a .csv file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0 || rows.length === 0) {
        toast({ title: "Empty file", description: "The CSV file has no data rows.", variant: "destructive" });
        return;
      }
      const parsed: ImportRow[] = rows.map(raw => {
        const mapped = mapRow(raw);
        let error: string | undefined;
        if (!mapped.name.trim()) error = "Name is required";
        const normPhone = mapped.phone?.replace(/\D/g, "");
        const isDupe = !!(
          (mapped.email && existingEmails.has(mapped.email.toLowerCase())) ||
          (normPhone && normPhone.length >= 7 && existingPhones.has(normPhone))
        );
        return { mapped, error, isDupe };
      });
      setImportRows(parsed);
      setImportOpen(true);
    };
    reader.readAsText(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function confirmImport() {
    setImporting(true);
    const toImport = importRows.filter(r => !r.error && !(skipDupes && r.isDupe));
    let count = 0;
    toImport.forEach(r => {
      addLead({
        name: r.mapped.name, company: r.mapped.company, email: r.mapped.email,
        phone: r.mapped.phone, industry: r.mapped.industry, city: r.mapped.city,
        status: (r.mapped.status as LeadStatus) || "New",
        source: r.mapped.source, notes: r.mapped.notes,
      });
      count++;
    });
    setTimeout(() => {
      setImporting(false);
      setImportOpen(false);
      setImportRows([]);
      toast({ title: `${count} leads imported`, description: count > 0 ? `Successfully added ${count} lead${count !== 1 ? "s" : ""}.` : "No leads were imported." });
    }, 200);
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = useMemo(() =>
    leads.filter(l => {
      const q = search.toLowerCase();
      const mQ = !q || [l.name, l.company, l.email, l.phone, l.industry, l.city, l.status, l.source, l.notes]
        .some(v => v?.toLowerCase().includes(q));
      const mS = statusFilter === "All" || l.status === statusFilter;
      return mQ && mS;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [leads, search, statusFilter]
  );

  // ── Inline editing state ──────────────────────────────────────────────────
  const [activeCell, setActiveCell] = useState<{ id: string; col: number } | null>(null);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [viewLead,   setViewLead]   = useState<Lead | null>(null);

  // ── New row state ─────────────────────────────────────────────────────────
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null); // active col in new row

  const NEW_ROW_ID = "__new__";

  const activateCell = useCallback((id: string, col: number) => {
    setActiveCell({ id, col });
    setNewRowActive(null);
  }, []);

  const activateNewRowCell = (col: number) => {
    setActiveCell(null);
    setNewRowActive(col);
  };

  // Commit a cell edit for an existing lead
  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    if ((lead as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editLead(id, { [field]: value } as Partial<Lead>);
    setActiveCell(null);
    toast({ title: "Saved", description: `${field.charAt(0).toUpperCase() + field.slice(1)} updated.` });
  }, [leads, editLead, toast]);

  // Move to next/prev cell (Tab navigation)
  const navigateCell = useCallback((id: string, colIdx: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(l => l.id)];
    const rowIdx = rows.indexOf(id);
    const totalCols = COLS.length;

    let nextRow = rowIdx;
    let nextCol = colIdx + (shift ? -1 : 1);

    if (nextCol >= totalCols) { nextCol = 0; nextRow++; }
    if (nextCol < 0)          { nextCol = totalCols - 1; nextRow--; }

    if (nextRow < 0 || nextRow >= rows.length) { setActiveCell(null); setNewRowActive(null); return; }

    const nextId = rows[nextRow];
    if (nextId === NEW_ROW_ID) {
      setActiveCell(null); setNewRowActive(nextCol);
    } else {
      setActiveCell({ id: nextId, col: nextCol }); setNewRowActive(null);
    }
  }, [filtered]);

  // Move to cell below (Enter key)
  const moveCellDown = useCallback((id: string, colIdx: number) => {
    const rows = [NEW_ROW_ID, ...filtered.map(l => l.id)];
    const rowIdx = rows.indexOf(id);
    const nextRow = rowIdx + 1;
    if (nextRow >= rows.length) { setActiveCell(null); return; }
    const nextId = rows[nextRow];
    if (nextId === NEW_ROW_ID) {
      setActiveCell(null); setNewRowActive(colIdx);
    } else {
      setActiveCell({ id: nextId, col: colIdx }); setNewRowActive(null);
    }
  }, [filtered]);

  // New-row navigation
  const navigateNewRow = (colIdx: number, shift: boolean) => {
    let nextCol = colIdx + (shift ? -1 : 1);
    if (nextCol >= COLS.length) { commitNewRow(); return; }
    if (nextCol < 0) { setNewRowActive(null); return; }
    setNewRowActive(nextCol);
  };

  // Commit new row on Enter of last col or explicit save
  const commitNewRow = () => {
    if (!newRow || !newRow.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      setNewRowActive(0);
      return;
    }
    const emailLower = newRow.email?.toLowerCase();
    const normPhone = newRow.phone?.replace(/\D/g, "");
    if (emailLower && existingEmails.has(emailLower)) {
      toast({ title: "Duplicate lead", description: `Email "${newRow.email}" already exists.`, variant: "destructive" });
      return;
    }
    if (normPhone && normPhone.length >= 7 && existingPhones.has(normPhone)) {
      toast({ title: "Duplicate lead", description: `Phone "${newRow.phone}" already exists.`, variant: "destructive" });
      return;
    }
    addLead({
      name: newRow.name, company: newRow.company, email: newRow.email,
      phone: newRow.phone, industry: newRow.industry, city: newRow.city,
      status: (newRow.status as LeadStatus) || "New",
      source: newRow.source, notes: newRow.notes,
    });
    toast({ title: "Lead added", description: `${newRow.name} has been added.` });
    setNewRow(null);
    setNewRowActive(null);
  };

  const cancelNewRow = () => { setNewRow(null); setNewRowActive(null); };

  // Start a new row
  const startNewRow = () => {
    setNewRow(BLANK_ROW());
    setNewRowActive(0);
    setActiveCell(null);
  };

  // Delete lead
  const handleDelete = () => {
    if (!deleteId) return;
    const l = leads.find(x => x.id === deleteId);
    removeLead(deleteId);
    toast({ title: "Lead deleted", description: `${l?.name} has been removed.` });
    setDeleteId(null);
  };

  // Convert to customer
  const handleConvert = (lead: Lead) => {
    convertLeadToCustomer(lead);
    refreshCustomers();
    toast({ title: "Lead converted", description: `${lead.name} added as a customer.` });
  };

  // Close active cell on outside click
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setActiveCell(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── KPI summary ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total: leads.length,
    won:   leads.filter(l => l.status === "Won").length,
    new:   leads.filter(l => l.status === "New").length,
    qualified: leads.filter(l => l.status === "Qualified").length,
  }), [leads]);

  const CELL_H = 36; // px

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Leads
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Click any cell to edit · Tab to move · Enter to save · Esc to cancel
          </p>
        </div>
        {isAuthenticated && (
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm" variant="outline"
              className="gap-1.5 flex-shrink-0 text-[13px]"
              onClick={downloadTemplate}
              title="Download import template CSV"
            >
              <Download size={14} /> Template
            </Button>
            <Button
              size="sm" variant="outline"
              className="gap-1.5 flex-shrink-0 text-[13px]"
              onClick={() => { setImportRows([]); setImportOpen(true); }}
              data-testid="btn-import-leads"
            >
              <Upload size={14} /> Import CSV
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileInput} />
            <Button size="sm" onClick={startNewRow} className="gap-1.5 flex-shrink-0" data-testid="btn-add-lead">
              <Plus size={14} /> Add Lead
            </Button>
          </div>
        )}
      </div>

      {/* ── KPI pills ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Total",    value: kpis.total,     color: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground" },
          { label: "New",      value: kpis.new,       color: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400" },
          { label: "Qualified",value: kpis.qualified,  color: "bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400" },
          { label: "Won",      value: kpis.won,       color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400" },
        ].map(k => (
          <div key={k.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold ${k.color}`}>
            {k.label}: <span>{k.value}</span>
          </div>
        ))}
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            className="pl-8 h-8 text-[13px]"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-leads"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-[13px]" data-testid="select-filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={cancelNewRow}>
              <X size={12} /> Cancel
            </Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}>
              <Save size={12} /> Save Row
            </Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">
          {filtered.length} of {leads.length} leads
        </div>
      </div>

      {/* ── Excel-like Grid ──────────────────────────────────────────────────── */}
      <div
        ref={tableRef}
        className="rounded-xl border border-gray-200 dark:border-border overflow-auto bg-white dark:bg-card shadow-sm"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        <table className="border-collapse text-[13px] w-full" style={{ tableLayout: "fixed", minWidth: `${COLS.reduce((a, c) => a + c.minW, 0) + 80 + 100}px` }}>

          {/* Colgroup */}
          <colgroup>
            <col style={{ width: "48px" }} />
            {COLS.map(c => <col key={c.field} style={{ width: `${c.minW}px` }} />)}
            <col style={{ width: "80px" }} />
          </colgroup>

          {/* ── Sticky header ────────────────────────────────────────────── */}
          <thead className="sticky top-0 z-10">
            <tr>
              {/* Row # */}
              <th className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-400 text-center py-2 select-none">
                #
              </th>
              {COLS.map(c => (
                <th
                  key={c.field}
                  className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-left px-3 py-2 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide whitespace-nowrap select-none"
                >
                  {c.label}
                </th>
              ))}
              {/* Actions header */}
              <th className="border-b border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-400 text-center py-2 select-none sticky right-0">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ── New row (if adding) ────────────────────────────────────── */}
            {isAuthenticated && newRow && (
              <tr className="bg-amber-50/60 dark:bg-amber-950/20 border-b border-gray-100 dark:border-border">
                <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold select-none" style={{ height: `${CELL_H}px` }}>
                  ★
                </td>
                {COLS.map((c, ci) => {
                  const isActive = newRowActive === ci;
                  return (
                    <td
                      key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${isActive ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                      style={{ height: `${CELL_H}px` }}
                    >
                      {isActive && c.type === "select" ? (
                        <select
                          autoFocus
                          value={newRow[c.field]}
                          onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                          onKeyDown={e => {
                            if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); }
                            if (e.key === "Enter") { e.preventDefault(); navigateNewRow(ci, false); }
                            if (e.key === "Escape") cancelNewRow();
                          }}
                          className="absolute inset-0 w-full h-full px-2 text-[13px] bg-white dark:bg-card border-0 outline-none"
                        >
                          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : isActive ? (
                        <input
                          autoFocus
                          type={c.type}
                          value={newRow[c.field]}
                          placeholder={c.label}
                          onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                          onKeyDown={e => {
                            if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); }
                            if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); }
                            if (e.key === "Escape") cancelNewRow();
                          }}
                          className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center px-3 cursor-text"
                          onClick={() => activateNewRowCell(ci)}
                        >
                          {c.field === "status" ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[newRow.status as LeadStatus]}`}>
                              {newRow.status}
                            </span>
                          ) : (
                            <span className={`truncate ${!newRow[c.field] ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>
                              {newRow[c.field] || c.label}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px` }}>
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Save"><Save size={13} /></button>
                    <button onClick={cancelNewRow} className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" title="Cancel"><X size={13} /></button>
                  </div>
                </td>
              </tr>
            )}

            {/* ── Existing rows ─────────────────────────────────────────── */}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
                  {search || statusFilter !== "All"
                    ? "No leads match your filters."
                    : isAuthenticated
                      ? <span>No leads yet. Click <strong>Add Lead</strong> or press <kbd className="border rounded px-1 text-xs">+</kbd> to start.</span>
                      : "No leads yet."
                  }
                </td>
              </tr>
            ) : filtered.map((lead, rowIdx) => {
              const isRowActive = activeCell?.id === lead.id;
              return (
                <tr
                  key={lead.id}
                  data-testid={`row-lead-${lead.id}`}
                  className={`border-b border-gray-100 dark:border-border transition-colors group ${
                    isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : rowIdx % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"
                  } hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}
                >
                  {/* Row number */}
                  <td
                    className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 select-none font-mono"
                    style={{ height: `${CELL_H}px` }}
                  >
                    {rowIdx + 1}
                  </td>

                  {/* Editable columns */}
                  {COLS.map((c, ci) => {
                    const isActive = activeCell?.id === lead.id && activeCell.col === ci;
                    return (
                      <td
                        key={c.field}
                        className={`border-r border-gray-100 dark:border-border relative p-0 ${
                          isActive
                            ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10"
                            : "hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
                        }`}
                        style={{ height: `${CELL_H}px` }}
                        onClick={() => !isActive && isAuthenticated && activateCell(lead.id, ci)}
                      >
                        <EditableCell
                          value={String((lead as Record<string, string>)[c.field] ?? "")}
                          col={c}
                          active={isActive}
                          canEdit={isAuthenticated}
                          onActivate={() => activateCell(lead.id, ci)}
                          onCommit={v => commitCell(lead.id, c.field, v)}
                          onCancel={() => setActiveCell(null)}
                          onTab={shift => navigateCell(lead.id, ci, shift)}
                          onEnter={() => moveCellDown(lead.id, ci)}
                        />
                      </td>
                    );
                  })}

                  {/* Actions column */}
                  <td
                    className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center"
                    style={{ height: `${CELL_H}px` }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        title="View details"
                        onClick={() => setViewLead(lead)}
                      >
                        <Eye size={13} />
                      </button>
                      {isAuthenticated && lead.status === "Won" && !convertedLeadIds.has(lead.id) && (
                        <button
                          className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                          title="Convert to customer"
                          onClick={() => handleConvert(lead)}
                        >
                          <UserCheck size={13} />
                        </button>
                      )}
                      {isAuthenticated && (
                        <button
                          className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Delete"
                          onClick={() => setDeleteId(lead.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* ── Add row trigger ───────────────────────────────────────── */}
            {isAuthenticated && !newRow && (
              <tr>
                <td colSpan={COLS.length + 2}>
                  <button
                    onClick={startNewRow}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                    data-testid="btn-add-row"
                  >
                    <Plus size={13} />
                    Add row
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Lead detail sheet ─────────────────────────────────────────────────── */}
      <Sheet open={!!viewLead} onOpenChange={o => { if (!o) setViewLead(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Lead Details</SheetTitle>
          </SheetHeader>
          {viewLead && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xl font-bold">{viewLead.name}</h3>
                <p className="text-muted-foreground">{viewLead.company}</p>
                <span className={`inline-flex items-center mt-2 px-2.5 py-1 rounded-full text-[12px] font-semibold ${STATUS_STYLES[viewLead.status]}`}>
                  {viewLead.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: "Email",    value: viewLead.email,    link: `mailto:${viewLead.email}` },
                  { label: "Phone",    value: viewLead.phone,    link: `tel:${viewLead.phone}` },
                  { label: "Industry", value: viewLead.industry },
                  { label: "City",     value: viewLead.city },
                  { label: "Source",   value: viewLead.source },
                  { label: "Added",    value: format(new Date(viewLead.createdAt), "d MMM yyyy") },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{item.label}</p>
                    {item.link && item.value
                      ? <a href={item.link} className="text-primary hover:underline">{item.value}</a>
                      : <span>{item.value || "—"}</span>}
                  </div>
                ))}
              </div>
              {viewLead.notes && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{viewLead.notes}</p>
                </div>
              )}
              {isAuthenticated && viewLead.status === "Won" && !convertedLeadIds.has(viewLead.id) && (
                <div className="pt-4 border-t">
                  <Button
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => { handleConvert(viewLead); setViewLead(null); }}
                  >
                    <UserCheck size={14} /> Convert to Customer
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete"
            >
              Delete Lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Import CSV Dialog ──────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={o => { if (!o) { setImportOpen(false); setImportRows([]); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-[17px]">
              <FileSpreadsheet size={18} className="text-blue-600" /> Import Leads from CSV
            </DialogTitle>
          </DialogHeader>

          {/* ── Drop zone (shown when no rows parsed yet) ── */}
          {importRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div
                className={`w-full max-w-md border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 transition-colors cursor-pointer ${
                  dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-gray-200 dark:border-border hover:border-blue-400 dark:hover:border-blue-600"
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <FileSpreadsheet size={32} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-gray-700 dark:text-foreground">Drop your CSV here</p>
                  <p className="text-[13px] text-muted-foreground mt-1">or click to browse · .csv files only</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Upload size={13} /> Choose File
                </Button>
              </div>

              {/* Template hint */}
              <div className="mt-6 flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800/40 rounded-xl p-4 max-w-md">
                <Info size={15} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-medium text-blue-700 dark:text-blue-300">Don't have a CSV yet?</p>
                  <p className="text-[12px] text-blue-600/80 dark:text-blue-400/70 mt-0.5">
                    Download our template with the correct column headers and 3 example rows.
                  </p>
                  <button
                    className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    onClick={e => { e.stopPropagation(); downloadTemplate(); }}
                  >
                    <Download size={12} /> Download Template CSV
                  </button>
                </div>
              </div>

              {/* Column reference */}
              <div className="mt-4 max-w-md w-full">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Expected columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {CSV_HEADERS.map(h => (
                    <span key={h} className="font-mono text-[11px] bg-gray-100 dark:bg-muted px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">
                      {h}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">Column order doesn't matter — headers are matched by name. Only <strong>name</strong> is required.</p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Stats bar ── */}
              {(() => {
                const valid   = importRows.filter(r => !r.error).length;
                const invalid = importRows.filter(r => !!r.error).length;
                const dupes   = importRows.filter(r => !r.error && r.isDupe).length;
                const willImport = importRows.filter(r => !r.error && !(skipDupes && r.isDupe)).length;
                return (
                  <div className="shrink-0 px-6 py-3 bg-gray-50 dark:bg-muted/20 border-b border-border flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="text-[12px] text-muted-foreground">{importRows.length} total rows</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-500" />
                      <span className="text-[12px] text-emerald-700 dark:text-emerald-400">{valid} valid</span>
                    </div>
                    {invalid > 0 && (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-red-500" />
                        <span className="text-[12px] text-red-600 dark:text-red-400">{invalid} invalid (will skip)</span>
                      </div>
                    )}
                    {dupes > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Info size={13} className="text-amber-500" />
                        <span className="text-[12px] text-amber-600 dark:text-amber-400">{dupes} possible duplicate{dupes !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {dupes > 0 && (
                        <div className="flex items-center gap-2">
                          <Switch id="skip-dupes" checked={skipDupes} onCheckedChange={setSkipDupes} />
                          <Label htmlFor="skip-dupes" className="text-[12px] cursor-pointer">Skip duplicates</Label>
                        </div>
                      )}
                      <span className="text-[12px] font-semibold text-blue-600 dark:text-blue-400">
                        → {willImport} will be imported
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* ── Preview table ── */}
              <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-muted/30 sticky top-0 z-10">
                      <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border w-8 text-center">#</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border">Status</th>
                      {(["name","company","email","phone","industry","city","status","source"] as EditableField[]).map(f => (
                        <th key={f} className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border capitalize">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {importRows.map((row, i) => {
                      const willSkip = !!row.error || (skipDupes && !!row.isDupe);
                      return (
                        <tr key={i} className={`${willSkip ? "opacity-40 bg-red-50/30 dark:bg-red-950/10" : i % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"}`}>
                          <td className="px-3 py-1.5 text-center text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {row.error ? (
                              <span className="flex items-center gap-1 text-red-600 text-[11px]">
                                <AlertTriangle size={11} /> {row.error}
                              </span>
                            ) : skipDupes && row.isDupe ? (
                              <span className="flex items-center gap-1 text-amber-600 text-[11px]">
                                <Info size={11} /> Duplicate
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-emerald-600 text-[11px]">
                                <CheckCircle2 size={11} /> Ready
                              </span>
                            )}
                          </td>
                          {(["name","company","email","phone","industry","city","status","source"] as EditableField[]).map(f => (
                            <td key={f} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[140px]">
                              {f === "status" ? (
                                row.mapped[f] ? (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[row.mapped[f] as LeadStatus] || "bg-muted text-muted-foreground"}`}>
                                    {row.mapped[f]}
                                  </span>
                                ) : "—"
                              ) : (
                                row.mapped[f] || <span className="text-gray-300">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Footer ── */}
              <DialogFooter className="px-6 py-4 border-t border-border shrink-0 bg-white dark:bg-card">
                <Button
                  variant="outline"
                  onClick={() => { setImportOpen(false); setImportRows([]); }}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => { setImportRows([]); }}
                >
                  <Upload size={13} /> Choose different file
                </Button>
                <Button
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={importing || importRows.filter(r => !r.error && !(skipDupes && r.isDupe)).length === 0}
                  onClick={confirmImport}
                  data-testid="btn-confirm-import"
                >
                  {importing
                    ? "Importing…"
                    : `Import ${importRows.filter(r => !r.error && !(skipDupes && r.isDupe)).length} Lead${importRows.filter(r => !r.error && !(skipDupes && r.isDupe)).length !== 1 ? "s" : ""}`
                  }
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
