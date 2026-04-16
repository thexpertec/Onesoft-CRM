import React, {
  useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect,
} from "react";
import { useLeads, useCustomers, useSalesAgents } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import {
  Lead, LeadStatus, CallLog, CallOutcome,
  convertLeadToCustomer, getCustomers,
} from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, isToday, isTomorrow, differenceInDays } from "date-fns";
import {
  Search, Plus, Trash2, UserCheck, X, Save,
  Eye, Upload, Download, FileSpreadsheet, AlertTriangle,
  CheckCircle2, Info, Phone, Bell, BellOff, Star, StarOff,
  Clock, PhoneCall, PhoneOff, PhoneMissed, MessageSquare,
  ChevronRight, ChevronUp, Pencil, Globe, MapPin, Briefcase, DollarSign,
  User, Check, UserCircle2, Filter, ChevronDown, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────
type EditableField = keyof Pick<Lead, "name" | "company" | "email" | "phone" | "industry" | "city" | "status" | "source" | "notes" | "assignedTo" | "temperature" | "nextFollowUp">;

const LEAD_STATUSES: LeadStatus[] = ["New", "Contacted", "Meeting Scheduled", "Demo Completed", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];
const PIPELINE_STAGES: LeadStatus[] = ["New", "Contacted", "Meeting Scheduled", "Demo Completed", "Qualified", "Proposal Sent", "Negotiation", "Won"];

const CALL_OUTCOMES: CallOutcome[] = ["Answered", "No Answer", "Voicemail", "Busy", "Scheduled Callback"];

const STATUS_STYLES: Record<LeadStatus, string> = {
  New:                  "bg-blue-100   dark:bg-blue-900   text-blue-700   dark:text-blue-300",
  Contacted:            "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
  "Meeting Scheduled":  "bg-sky-100    dark:bg-sky-900    text-sky-700    dark:text-sky-300",
  "Demo Completed":     "bg-cyan-100   dark:bg-cyan-900   text-cyan-700   dark:text-cyan-300",
  Qualified:            "bg-teal-100   dark:bg-teal-900   text-teal-700   dark:text-teal-300",
  "Proposal Sent":      "bg-amber-100  dark:bg-amber-900  text-amber-700  dark:text-amber-300",
  Negotiation:          "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300",
  Won:                  "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  Lost:                 "bg-red-100    dark:bg-red-900    text-red-600    dark:text-red-400",
};

const OUTCOME_ICON: Record<CallOutcome, React.ElementType> = {
  Answered:            PhoneCall,
  "No Answer":         PhoneOff,
  Voicemail:           MessageSquare,
  Busy:                PhoneMissed,
  "Scheduled Callback": Clock,
};

const OUTCOME_COLOR: Record<CallOutcome, string> = {
  Answered:            "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  "No Answer":         "text-gray-500 bg-gray-100 dark:bg-muted",
  Voicemail:           "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  Busy:                "text-red-500 bg-red-50 dark:bg-red-950/30",
  "Scheduled Callback":"text-blue-600 bg-blue-50 dark:bg-blue-950/40",
};

// ─── Column definitions ────────────────────────────────────────────────────────
const TEMP_COLORS: Record<string, string> = {
  Hot:  "text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40",
  Warm: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40",
  Cold: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40",
};
const TEMP_DOT: Record<string, string> = { Hot: "🔴", Warm: "🟡", Cold: "🔵" };

const COLS: { field: EditableField; label: string; minW: number; type: "text" | "email" | "tel" | "select" | "agent-select" | "temp-select" | "date" }[] = [
  { field: "name",        label: "Name",        minW: 160, type: "text"         },
  { field: "phone",       label: "Phone",       minW: 130, type: "tel"          },
  { field: "industry",    label: "Industry",    minW: 120, type: "text"         },
  { field: "temperature", label: "Temp",        minW: 90,  type: "temp-select"  },
  { field: "nextFollowUp",label: "Follow-up",   minW: 110, type: "date"         },
  { field: "status",      label: "Status",      minW: 140, type: "select"       },
  { field: "assignedTo",  label: "Assigned To", minW: 140, type: "agent-select" },
];

const BLANK_ROW = (): Record<EditableField, string> => ({
  name: "", company: "", email: "", phone: "",
  industry: "", city: "", status: "New", source: "", notes: "", assignedTo: "",
  temperature: "", nextFollowUp: "",
});

// ─── CSV ─────────────────────────────────────────────────────────────────────
const CSV_HEADERS = ["name", "company", "email", "phone", "industry", "city", "status", "source", "notes"] as const;
const CSV_TEMPLATE_ROWS = [
  ["Jane Smith",  "Acme Ltd",     "jane@acme.com",    "+44 7700 111222", "Technology",    "Hull",      "New",       "Website",  "Interested in ERP solution"],
  ["John Doe",    "Beta Corp",    "john@betacorp.com","",                "Manufacturing", "Leeds",      "Contacted", "Referral", "Follow up next week"],
  ["Sara Ahmed",  "Delta Systems","sara@delta.pk",    "+92 300 1234567", "IT Services",   "Islamabad",  "Qualified", "Cold Call","Requested proposal"],
];

function downloadTemplate() {
  const rows = [CSV_HEADERS.join(","), ...CSV_TEMPLATE_ROWS.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a    = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "leads-import-template.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}

type ParsedRow = Record<string, string>;
function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (!lines.length) return { headers: [], rows: [] };
  function parseLine(line: string) {
    const result: string[] = []; let cur = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuote && line[i+1]==='"') { cur+='"'; i++; } else inQuote=!inQuote; }
      else if (ch==="," && !inQuote) { result.push(cur.trim()); cur=""; }
      else cur+=ch;
    }
    result.push(cur.trim()); return result;
  }
  const headers = parseLine(lines[0]).map(h=>h.toLowerCase().trim());
  const rows: ParsedRow[] = [];
  for (let i=1; i<lines.length; i++) {
    const line=lines[i].trim(); if(!line) continue;
    const cells=parseLine(line); const row:ParsedRow={};
    headers.forEach((h,idx)=>{row[h]=cells[idx]??"";}); rows.push(row);
  }
  return { headers, rows };
}
const FIELD_ALIASES: Record<EditableField, string[]> = {
  name:["name","full name","fullname","lead name","contact name","first name"],
  company:["company","company name","organisation","organization","business"],
  email:["email","email address","e-mail"],phone:["phone","phone number","mobile","tel","telephone"],
  industry:["industry","sector","vertical"],city:["city","location","town"],
  status:["status","lead status","stage"],source:["source","lead source","channel","origin"],
  notes:["notes","note","comments","comment","description"],
  temperature:["temperature","temp","heat","lead temp","lead temperature"],
  nextFollowUp:["next follow-up","followup","follow up","next contact","next call"],
};
function mapRow(row: ParsedRow): Record<EditableField, string> {
  const result = BLANK_ROW();
  (Object.keys(FIELD_ALIASES) as EditableField[]).forEach(field => {
    for (const alias of FIELD_ALIASES[field]) { if (row[alias]!==undefined) { result[field]=row[alias]; break; } }
  });
  const validStatuses=["New","Contacted","Meeting Scheduled","Demo Completed","Qualified","Proposal Sent","Negotiation","Won","Lost"];
  const rawStatus=result.status.trim();
  result.status=validStatuses.find(s=>s.toLowerCase()===rawStatus.toLowerCase())??"New";
  return result;
}
type ImportRow = { mapped: Record<EditableField, string>; error?: string; isDupe?: boolean; };

// ─── Reminder helpers ──────────────────────────────────────────────────────────
function reminderLabel(iso?: string): { label: string; urgent: boolean; color: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const urgent = isPast(d) || isToday(d);
  if (isPast(d) && !isToday(d)) return { label: "Overdue", urgent: true, color: "text-red-600 bg-red-50 dark:bg-red-950/40" };
  if (isToday(d)) return { label: "Today",   urgent: true, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40" };
  if (isTomorrow(d)) return { label: "Tomorrow", urgent: false, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" };
  const days = differenceInDays(d, new Date());
  return { label: `In ${days}d`, urgent: false, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" };
}

// ─── EditableCell ──────────────────────────────────────────────────────────────
function EditableCell({ value, col, active, canEdit, onActivate, onCommit, onCancel, onTab, onEnter, wrapText }: {
  value: string; col: (typeof COLS)[number]; active: boolean; canEdit: boolean;
  onActivate: () => void; onCommit: (v: string) => void; onCancel: () => void;
  onTab: (shift: boolean) => void; onEnter: () => void; wrapText?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef  = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (active) { setDraft(value); setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); selectRef.current?.focus(); }, 0); }
  }, [active]);
  const commit = () => onCommit(draft);
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key==="Escape") { e.preventDefault(); onCancel(); }
    else if (e.key==="Enter") { e.preventDefault(); commit(); onEnter(); }
    else if (e.key==="Tab")   { e.preventDefault(); commit(); onTab(e.shiftKey); }
  };
  if (active && canEdit) {
    if (col.type==="select") return (
      <div className="relative w-full h-full">
        <select ref={selectRef} value={draft} onChange={e=>{setDraft(e.target.value); onCommit(e.target.value);}}
          onBlur={commit} onKeyDown={handleKey}
          className="absolute inset-0 w-full h-full px-2 text-[13px] font-medium bg-white dark:bg-card border-0 outline-none cursor-pointer">
          {LEAD_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    );
    if (col.type==="temp-select") return (
      <div className="relative w-full h-full">
        <select ref={selectRef} value={draft} onChange={e=>{setDraft(e.target.value); onCommit(e.target.value);}}
          onBlur={commit} onKeyDown={handleKey}
          className="absolute inset-0 w-full h-full px-2 text-[13px] font-medium bg-white dark:bg-card border-0 outline-none cursor-pointer">
          <option value="">— None —</option>
          {["Hot","Warm","Cold"].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    );
    return <input ref={inputRef} type={col.type === "temp-select" ? "text" : col.type} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={handleKey}
      className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground" style={{boxSizing:"border-box"}} />;
  }
  const cellBase = `w-full flex items-center px-3 text-[13px] overflow-hidden ${canEdit?"cursor-text":"cursor-default"}`;
  const wrapBase = `w-full flex items-start px-3 py-2 text-[13px] ${canEdit?"cursor-text":"cursor-default"}`;

  if (col.field==="status") return (
    <div className={wrapText ? wrapBase : `${cellBase} h-full`} onClick={canEdit?onActivate:undefined}>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLES[value as LeadStatus]||""}`}>{value}</span>
    </div>
  );
  if (col.field==="temperature" && value) return (
    <div className={wrapText ? wrapBase : `${cellBase} h-full`} onClick={canEdit?onActivate:undefined}>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${TEMP_COLORS[value]||""}`}><span>{TEMP_DOT[value]}</span>{value}</span>
    </div>
  );
  if (col.field==="nextFollowUp" && value) {
    const d = new Date(value);
    const past = d < new Date() && value !== format(new Date(),"yyyy-MM-dd");
    return (
      <div className={wrapText ? wrapBase : `${cellBase} h-full`} onClick={canEdit?onActivate:undefined}>
        <span className={`text-[12px] font-medium ${past?"text-red-500":"text-foreground"}`}>{format(d,"dd MMM yy")}</span>
      </div>
    );
  }
  return (
    <div className={wrapText ? wrapBase : `${cellBase} h-full`} onClick={canEdit?onActivate:undefined}>
      <span className={`${wrapText?"break-words min-w-0 w-full leading-snug":"truncate"} ${!value?"text-gray-300 dark:text-muted-foreground/30":"text-gray-700 dark:text-foreground"}`}>
        {value||(canEdit?"—":"")}
      </span>
    </div>
  );
}

// ─── LeadDetailSheet ──────────────────────────────────────────────────────────
function LeadDetailSheet({
  lead, onClose, onSave, onDelete, onConvert, canEdit, isConverted, agents,
}: {
  lead: Lead; onClose: () => void; onSave: (id: string, updates: Partial<Lead>) => void;
  onDelete: (id: string) => void; onConvert: (lead: Lead) => void;
  canEdit: boolean; isConverted: boolean;
  agents: Array<{ id: string; name: string; agentCode: string }>;
}) {
  const [tab, setTab]       = useState<"overview" | "calls" | "reminder">("overview");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);

  // ── Call log state ─────────────────────────────────────────────────────────
  const [deleteLogId, setDeleteLogId] = useState<string | null>(null);
  const [newCallOpen, setNewCallOpen] = useState(false);
  const [callDate, setCallDate]       = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [callTime, setCallTime]       = useState(() => format(new Date(), "HH:mm"));
  const [callDuration, setCallDuration] = useState("");
  const [callOutcome, setCallOutcome] = useState<CallOutcome>("Answered");
  const [callNotes, setCallNotes]     = useState("");

  // ── Reminder state ─────────────────────────────────────────────────────────
  const [editingReminder, setEditingReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState(lead.nextReminder ? format(new Date(lead.nextReminder), "yyyy-MM-dd") : "");
  const [reminderTime, setReminderTime] = useState(lead.nextReminder ? format(new Date(lead.nextReminder), "HH:mm") : "09:00");
  const [reminderNote, setReminderNote] = useState(lead.reminderNote || "");

  // ── Sync fields when lead changes ────────────────────────────────────────
  useEffect(() => {
    setEditing({
      name:       lead.name,
      company:    lead.company,
      email:      lead.email,
      phone:      lead.phone,
      industry:   lead.industry,
      city:       lead.city,
      country:    lead.country || "",
      website:    lead.website || "",
      source:     lead.source,
      dealValue:  lead.dealValue?.toString() || "",
      assignedTo: lead.assignedTo || "",
      notes:      lead.notes,
    });
    setReminderDate(lead.nextReminder ? format(new Date(lead.nextReminder), "yyyy-MM-dd") : "");
    setReminderTime(lead.nextReminder ? format(new Date(lead.nextReminder), "HH:mm") : "09:00");
    setReminderNote(lead.reminderNote || "");
  }, [lead]);

  const callLogs = (lead.callLogs || []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const reminderInfo = reminderLabel(lead.nextReminder);

  const saveEdits = () => {
    onSave(lead.id, {
      name:       editing.name,
      company:    editing.company,
      email:      editing.email,
      phone:      editing.phone,
      industry:   editing.industry,
      city:       editing.city,
      country:    editing.country,
      website:    editing.website,
      source:     editing.source,
      dealValue:  editing.dealValue ? Number(editing.dealValue) : undefined,
      assignedTo: editing.assignedTo,
      notes:      editing.notes,
    });
    setIsEditing(false);
  };

  const saveCallLog = () => {
    if (!callNotes.trim() && callOutcome === "Answered") return;
    const dt = callDate && callTime ? new Date(`${callDate}T${callTime}:00`) : new Date();
    const newLog: CallLog = {
      id:       crypto.randomUUID(),
      date:     dt.toISOString(),
      duration: callDuration || undefined,
      outcome:  callOutcome,
      notes:    callNotes,
      createdAt: new Date().toISOString(),
    };
    onSave(lead.id, { callLogs: [newLog, ...(lead.callLogs || [])] });
    setNewCallOpen(false);
    setCallNotes(""); setCallDuration(""); setCallOutcome("Answered");
    setCallDate(format(new Date(), "yyyy-MM-dd")); setCallTime(format(new Date(), "HH:mm"));
  };

  const deleteCallLog = (logId: string) => {
    onSave(lead.id, { callLogs: (lead.callLogs || []).filter(l => l.id !== logId) });
  };

  const saveReminder = () => {
    if (!reminderDate) { onSave(lead.id, { nextReminder: undefined, reminderNote: "" }); }
    else {
      const dt = new Date(`${reminderDate}T${reminderTime}:00`);
      onSave(lead.id, { nextReminder: dt.toISOString(), reminderNote: reminderNote });
    }
    setEditingReminder(false);
  };

  const clearReminder = () => {
    onSave(lead.id, { nextReminder: undefined, reminderNote: "" });
    setReminderDate(""); setReminderNote(""); setEditingReminder(false);
  };

  const toggleRelevance = () => {
    onSave(lead.id, { isRelevant: !(lead.isRelevant ?? true) });
  };

  const daysInPipeline = differenceInDays(new Date(), new Date(lead.createdAt));
  const pipelineIdx    = PIPELINE_STAGES.indexOf(lead.status);
  const isLost         = lead.status === "Lost";

  const field = (key: string) => (
    isEditing
      ? key === "notes"
        ? <Textarea value={editing[key] || ""} onChange={e => setEditing(p => ({...p, [key]: e.target.value}))}
            className="text-sm min-h-[80px]" />
        : <Input value={editing[key] || ""} onChange={e => setEditing(p => ({...p, [key]: e.target.value}))}
            className="h-8 text-sm" />
      : <span className="text-sm text-foreground">{(key === "dealValue" && lead.dealValue) ? `£${lead.dealValue.toLocaleString()}` : (lead as Record<string, unknown>)[key]?.toString() || editing[key] || "—"}</span>
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="p-5 border-b border-border bg-gradient-to-br from-muted/30 to-background">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
            {lead.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold truncate">{lead.name}</h2>
              {/* Relevance badge */}
              <button onClick={canEdit ? toggleRelevance : undefined}
                title={lead.isRelevant !== false ? "Mark as Irrelevant" : "Mark as Relevant"}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                  lead.isRelevant !== false
                    ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200"
                    : "bg-gray-100 dark:bg-muted text-gray-500 hover:bg-gray-200"
                } ${canEdit ? "cursor-pointer" : "cursor-default"}`}>
                {lead.isRelevant !== false ? <Star size={9} className="fill-current" /> : <StarOff size={9} />}
                {lead.isRelevant !== false ? "Relevant" : "Irrelevant"}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">{lead.company || "—"}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[lead.status]}`}>
                {lead.status}
              </span>
              {reminderInfo && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${reminderInfo.color}`}>
                  <Bell size={9} /> {reminderInfo.label}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">{daysInPipeline}d in pipeline</span>
            </div>
          </div>
          {/* Actions */}
          <div className="flex gap-1.5 flex-shrink-0">
            {canEdit && !isEditing && (
              <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Edit">
                <Pencil size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Pipeline stepper */}
        {!isLost && (
          <div className="mt-4">
            <div className="flex items-center gap-0">
              {PIPELINE_STAGES.map((stage, idx) => {
                const done    = pipelineIdx >= idx;
                const current = pipelineIdx === idx;
                const isLast  = idx === PIPELINE_STAGES.length - 1;
                return (
                  <div key={stage} className="flex items-center flex-1 min-w-0">
                    <button
                      onClick={() => canEdit && onSave(lead.id, { status: stage })}
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all ${
                        done ? "bg-primary border-primary text-white" : "border-border text-muted-foreground hover:border-primary/50"
                      } ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                      title={stage}
                    >
                      {done ? <Check size={10} /> : idx + 1}
                    </button>
                    {!isLast && (
                      <div className={`flex-1 h-0.5 mx-0.5 ${idx < pipelineIdx ? "bg-primary" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-0 mt-1">
              {PIPELINE_STAGES.map((stage, idx) => {
                const isLast = idx === PIPELINE_STAGES.length - 1;
                return (
                  <div key={stage} className={`flex-1 min-w-0 text-[9px] text-muted-foreground ${isLast ? "text-right" : idx === 0 ? "text-left" : "text-center"}`}>
                    {stage}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isLost && (
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-[12px] font-medium">
            This lead is marked as Lost.
            {canEdit && <button onClick={() => onSave(lead.id, { status: "Contacted" })} className="ml-2 underline hover:no-underline">Reopen</button>}
          </div>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border">
        {[
          { key: "overview", label: "Overview", icon: User },
          { key: "calls",    label: `Calls (${callLogs.length})`, icon: Phone },
          { key: "reminder", label: "Reminder", icon: Bell },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium border-b-2 transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── OVERVIEW tab ─────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="p-5 space-y-5">
            {/* Save/cancel edit */}
            {isEditing && (
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdits} className="gap-1.5 h-8 text-[12px]"><Save size={12} /> Save Changes</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="h-8 text-[12px]"><X size={12} /> Cancel</Button>
              </div>
            )}

            {/* Status selector (quick change) */}
            {canEdit && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Pipeline Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.map(s => (
                    <button key={s} onClick={() => onSave(lead.id, { status: s })}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                        lead.status === s ? STATUS_STYLES[s] + " border-current" : "border-border text-muted-foreground hover:border-primary/50"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Contact info */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contact Information</p>
              <div className="space-y-2.5">
                {[
                  { key: "name",     label: "Full Name",  Icon: User     },
                  { key: "company",  label: "Company",    Icon: Briefcase },
                  { key: "email",    label: "Email",      Icon: MessageSquare },
                  { key: "phone",    label: "Phone",      Icon: Phone    },
                  { key: "industry", label: "Industry",   Icon: Briefcase },
                  { key: "city",     label: "City",       Icon: MapPin   },
                  { key: "country",  label: "Country",    Icon: Globe    },
                  { key: "website",  label: "Website",    Icon: Globe    },
                  { key: "source",   label: "Source",     Icon: ChevronRight },
                ].map(({ key, label, Icon }) => (
                  <div key={key} className="flex items-start gap-3">
                    <Icon size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      {isEditing
                        ? <Input value={editing[key] || ""} onChange={e => setEditing(p => ({...p, [key]: e.target.value}))} className="h-7 text-[13px] mt-0.5" />
                        : key === "email" && (lead as Record<string,unknown>)[key]
                          ? <a href={`mailto:${lead.email}`} className="text-sm text-primary hover:underline truncate block">{lead.email}</a>
                          : key === "phone" && lead.phone
                            ? <a href={`tel:${lead.phone}`} className="text-sm text-primary hover:underline">{lead.phone}</a>
                            : key === "website" && lead.website
                              ? <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block">{lead.website}</a>
                              : <span className="text-sm text-foreground">{(lead as Record<string,unknown>)[key]?.toString() || editing[key] || "—"}</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Deal info */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Deal Information</p>
              <div className="space-y-2.5">
                {/* Deal value */}
                <div className="flex items-start gap-3">
                  <DollarSign size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground">Deal Value (£)</p>
                    {isEditing
                      ? <Input type="number" value={editing.dealValue || ""} onChange={e => setEditing(p => ({...p, dealValue: e.target.value}))} className="h-7 text-[13px] mt-0.5" />
                      : lead.dealValue
                        ? <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">£{lead.dealValue.toLocaleString()}</span>
                        : <span className="text-sm text-muted-foreground">—</span>
                    }
                  </div>
                </div>
                {/* Assigned Sales Agent */}
                <div className="flex items-start gap-3">
                  <UserCircle2 size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground">Assigned Sales Agent</p>
                    {isEditing ? (
                      <select
                        value={editing.assignedTo || "__none__"}
                        onChange={e => setEditing(p => ({...p, assignedTo: e.target.value === "__none__" ? "" : e.target.value}))}
                        className="mt-0.5 w-full h-7 rounded-md border border-input bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="__none__">— Unassigned —</option>
                        {agents.map(a => <option key={a.id} value={a.name}>{a.name} ({a.agentCode})</option>)}
                      </select>
                    ) : lead.assignedTo ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[9px] font-bold flex-shrink-0">
                          {lead.assignedTo.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-foreground">{lead.assignedTo}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                        {canEdit && (
                          <button onClick={() => setIsEditing(true)} className="text-[11px] text-primary hover:underline">Assign</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Notes</p>
              {isEditing
                ? <Textarea value={editing.notes || ""} onChange={e => setEditing(p => ({...p, notes: e.target.value}))} className="text-sm min-h-[80px]" placeholder="Add notes about this lead…" />
                : lead.notes
                  ? <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{lead.notes}</p>
                  : <p className="text-sm text-muted-foreground italic">No notes. {canEdit && <button onClick={() => setIsEditing(true)} className="underline hover:no-underline">Add one</button>}</p>
              }
            </div>

            {/* Added date */}
            <p className="text-[11px] text-muted-foreground">Added {format(new Date(lead.createdAt), "d MMM yyyy 'at' HH:mm")}</p>

            {/* Footer actions */}
            {canEdit && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {lead.status === "Won" && !isConverted && (
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-[12px]"
                    onClick={() => { onConvert(lead); onClose(); }}>
                    <UserCheck size={12} /> Convert to Customer
                  </Button>
                )}
                <Button size="sm" variant="destructive" className="gap-1.5 text-[12px]"
                  onClick={() => { onDelete(lead.id); onClose(); }}>
                  <Trash2 size={12} /> Delete Lead
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── CALLS tab ────────────────────────────────────────────────── */}
        {tab === "calls" && (
          <div className="p-5 space-y-4">
            {canEdit && (
              <Button size="sm" className="gap-1.5 w-full text-[13px]" onClick={() => setNewCallOpen(true)}>
                <PhoneCall size={13} /> Log a Call
              </Button>
            )}

            {/* New call form */}
            {newCallOpen && (
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-3">
                <p className="text-[12px] font-semibold text-foreground">New Call Log</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Date</Label>
                    <Input type="date" value={callDate} onChange={e=>setCallDate(e.target.value)} className="h-8 text-[13px] mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[11px]">Time</Label>
                    <Input type="time" value={callTime} onChange={e=>setCallTime(e.target.value)} className="h-8 text-[13px] mt-0.5" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Outcome</Label>
                    <select value={callOutcome} onChange={e=>setCallOutcome(e.target.value as CallOutcome)}
                      className="mt-0.5 w-full h-8 rounded-md border border-input bg-background px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring">
                      {CALL_OUTCOMES.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Duration</Label>
                    <Input placeholder="e.g. 5 min" value={callDuration} onChange={e=>setCallDuration(e.target.value)} className="h-8 text-[13px] mt-0.5" />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Notes</Label>
                  <Textarea value={callNotes} onChange={e=>setCallNotes(e.target.value)} placeholder="What was discussed?" className="mt-0.5 min-h-[60px] text-[13px]" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveCallLog} className="gap-1 text-[12px] h-7"><Save size={11} /> Save Log</Button>
                  <Button size="sm" variant="outline" onClick={() => setNewCallOpen(false)} className="h-7 text-[12px]"><X size={11} /> Cancel</Button>
                </div>
              </div>
            )}

            {/* Call logs list */}
            {callLogs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Phone size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No call logs yet.</p>
                {canEdit && <p className="text-[12px] mt-1">Click "Log a Call" to record your first call.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {callLogs.map(log => {
                  const OutIcon = OUTCOME_ICON[log.outcome];
                  return (
                    <div key={log.id} className="border border-border rounded-xl p-3.5 bg-card">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${OUTCOME_COLOR[log.outcome]}`}>
                          <OutIcon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold">{log.outcome}</span>
                            {log.duration && <span className="text-[11px] text-muted-foreground">· {log.duration}</span>}
                            <span className="text-[11px] text-muted-foreground ml-auto">{format(new Date(log.date), "d MMM yyyy, HH:mm")}</span>
                          </div>
                          {log.notes && <p className="text-[13px] text-foreground mt-1 whitespace-pre-wrap">{log.notes}</p>}
                        </div>
                        {canEdit && (
                          <button onClick={() => setDeleteLogId(log.id)} className="text-muted-foreground/40 hover:text-red-500 transition-colors flex-shrink-0" title="Delete log">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── REMINDER tab ─────────────────────────────────────────────── */}
        {tab === "reminder" && (
          <div className="p-5 space-y-4">
            {/* Current reminder */}
            {lead.nextReminder && !editingReminder && (
              <div className={`border rounded-xl p-4 ${reminderInfo?.urgent ? "border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20" : "border-border bg-muted/20"}`}>
                <div className="flex items-start gap-3">
                  <Bell size={18} className={reminderInfo?.urgent ? "text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" : "text-primary mt-0.5 flex-shrink-0"} />
                  <div className="flex-1">
                    <p className={`text-[13px] font-semibold ${reminderInfo?.urgent ? "text-orange-700 dark:text-orange-400" : "text-foreground"}`}>
                      {reminderInfo?.label || format(new Date(lead.nextReminder), "d MMM yyyy")}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{format(new Date(lead.nextReminder), "EEEE, d MMMM yyyy 'at' HH:mm")}</p>
                    {lead.reminderNote && <p className="text-[13px] mt-1.5 text-foreground whitespace-pre-wrap">{lead.reminderNote}</p>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => setEditingReminder(true)} className="gap-1 h-7 text-[12px]"><Pencil size={11} /> Edit</Button>
                    <Button size="sm" variant="outline" onClick={clearReminder} className="gap-1 h-7 text-[12px] text-red-600 border-red-200 hover:bg-red-50"><BellOff size={11} /> Clear</Button>
                  </div>
                )}
              </div>
            )}

            {/* No reminder set */}
            {!lead.nextReminder && !editingReminder && (
              <div className="text-center py-10">
                <BellOff size={28} className="mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No reminder set for this lead.</p>
                {canEdit && (
                  <Button size="sm" className="mt-3 gap-1.5 text-[12px]" onClick={() => setEditingReminder(true)}>
                    <Bell size={12} /> Set Reminder
                  </Button>
                )}
              </div>
            )}

            {/* Reminder form */}
            {editingReminder && canEdit && (
              <div className="border border-border rounded-xl p-4 bg-muted/10 space-y-3">
                <p className="text-[12px] font-semibold text-foreground">Set Reminder</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Date</Label>
                    <Input type="date" value={reminderDate} onChange={e=>setReminderDate(e.target.value)} className="h-8 text-[13px] mt-0.5"
                      min={format(new Date(), "yyyy-MM-dd")} />
                  </div>
                  <div>
                    <Label className="text-[11px]">Time</Label>
                    <Input type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)} className="h-8 text-[13px] mt-0.5" />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Note (optional)</Label>
                  <Textarea value={reminderNote} onChange={e=>setReminderNote(e.target.value)}
                    placeholder="e.g. Follow up on proposal, check budget status…" className="mt-0.5 min-h-[60px] text-[13px]" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveReminder} className="gap-1 text-[12px] h-7"><Bell size={11} /> Set Reminder</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingReminder(false)} className="h-7 text-[12px]"><X size={11} /> Cancel</Button>
                  {lead.nextReminder && (
                    <Button size="sm" variant="outline" onClick={clearReminder} className="h-7 text-[12px] text-red-600 border-red-200 hover:bg-red-50 ml-auto"><BellOff size={11} /> Clear</Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delete call log confirm ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteLogId} onOpenChange={o => !o && setDeleteLogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete call log?</AlertDialogTitle>
            <AlertDialogDescription>This call log entry will be permanently removed. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (deleteLogId) { deleteCallLog(deleteLogId); setDeleteLogId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Leads() {
  const { leads, addLead, editLead, removeLead } = useLeads();
  const { refresh: refreshCustomers } = useCustomers();
  const { agents: salesAgents } = useSalesAgents();
  const { isAuthenticated, isSalesAgent, currentUser } = useAuth();
  const { toast } = useToast();

  const convertedLeadIds = useMemo(
    () => new Set(getCustomers().map(c => c.leadId).filter(Boolean)),
    [leads]
  );

  // ── Import state ───────────────────────────────────────────────────────────
  const [importOpen,  setImportOpen]  = useState(false);
  const [importRows,  setImportRows]  = useState<ImportRow[]>([]);
  const [skipDupes,   setSkipDupes]   = useState(true);
  const [importing,   setImporting]   = useState(false);
  const [dragOver,    setDragOver]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingEmails = useMemo(() => new Set(leads.map(l => l.email?.toLowerCase()).filter(Boolean)), [leads]);
  const existingPhones = useMemo(() => new Set(leads.map(l => l.phone?.replace(/\D/g,"")).filter(p => p && p.length >= 7)), [leads]);

  function processFile(file: File) {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast({ title: "Invalid file type", description: "Please upload a .csv file.", variant: "destructive" }); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (!headers.length || !rows.length) {
        toast({ title: "Empty file", description: "The CSV file has no data rows.", variant: "destructive" }); return;
      }
      setImportRows(rows.map(raw => {
        const mapped = mapRow(raw);
        let error: string|undefined;
        if (!mapped.name.trim()) error = "Name is required";
        const normPhone = mapped.phone?.replace(/\D/g,"");
        const isDupe = !!(
          (mapped.email && existingEmails.has(mapped.email.toLowerCase())) ||
          (normPhone && normPhone.length >= 7 && existingPhones.has(normPhone))
        );
        return { mapped, error, isDupe };
      }));
      setImportOpen(true);
    };
    reader.readAsText(file);
  }

  function confirmImport() {
    setImporting(true);
    const toImport = importRows.filter(r => !r.error && !(skipDupes && r.isDupe));
    toImport.forEach(r => addLead({
      name: r.mapped.name, company: r.mapped.company, email: r.mapped.email,
      phone: r.mapped.phone, industry: r.mapped.industry, city: r.mapped.city,
      status: (r.mapped.status as LeadStatus) || "New",
      source: r.mapped.source, notes: r.mapped.notes,
      isRelevant: true, callLogs: [],
    }));
    const count = toImport.length;
    setTimeout(() => {
      setImporting(false); setImportOpen(false); setImportRows([]);
      toast({ title: `${count} leads imported`, description: count > 0 ? `Successfully added ${count} lead${count!==1?"s":""}.` : "No leads were imported." });
    }, 200);
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,          setSearch]          = useState("");
  const [statusFilter,    setStatusFilter]    = useState("All");
  const [relevanceFilter, setRelevanceFilter] = useState("All");
  const [agentFilter,     setAgentFilter]     = useState("All");
  const [sourceFilter,    setSourceFilter]    = useState("All");
  const [industryFilter,  setIndustryFilter]  = useState("All");

  const uniqueSources    = useMemo(() => Array.from(new Set(leads.map(l => l.source).filter(Boolean))).sort(), [leads]);
  const uniqueIndustries = useMemo(() => Array.from(new Set(leads.map(l => l.industry).filter(Boolean))).sort(), [leads]);

  // When a sales agent is logged in, only show leads assigned to them
  const agentName = isSalesAgent ? (currentUser?.fullName ?? "") : "";

  const filtered = useMemo(() =>
    leads.filter(l => {
      // Sales agent sees only their own assigned leads
      if (isSalesAgent && agentName) {
        if (!l.assignedTo || l.assignedTo.toLowerCase() !== agentName.toLowerCase()) return false;
      }
      const q   = search.toLowerCase();
      const mQ  = !q || [l.name, l.company, l.email, l.phone, l.industry, l.city, l.status, l.source, l.notes, l.assignedTo].some(v => v?.toLowerCase().includes(q));
      const mS  = statusFilter    === "All" || l.status    === statusFilter;
      const mR  = relevanceFilter === "All" || (relevanceFilter === "Relevant" ? l.isRelevant !== false : l.isRelevant === false);
      const mA  = agentFilter     === "All" || (agentFilter === "__unassigned__" ? !l.assignedTo : l.assignedTo === agentFilter);
      const mSrc = sourceFilter   === "All" || l.source   === sourceFilter;
      const mI  = industryFilter  === "All" || l.industry  === industryFilter;
      return mQ && mS && mR && mA && mSrc && mI;
    }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [leads, search, statusFilter, relevanceFilter, agentFilter, sourceFilter, industryFilter, isSalesAgent, agentName]
  );

  const hasActiveFilters = statusFilter !== "All" || relevanceFilter !== "All" || agentFilter !== "All" || sourceFilter !== "All" || industryFilter !== "All" || !!search;
  const clearAllFilters  = () => { setSearch(""); setStatusFilter("All"); setRelevanceFilter("All"); setAgentFilter("All"); setSourceFilter("All"); setIndustryFilter("All"); };

  // ── Inline editing state ──────────────────────────────────────────────────
  const [activeCell, setActiveCell] = useState<{ id: string; col: number } | null>(null);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [viewLead,   setViewLead]   = useState<Lead | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  // Sync viewLead when underlying leads array updates
  useEffect(() => {
    if (viewLead) {
      const updated = leads.find(l => l.id === viewLead.id);
      if (updated) setViewLead(updated);
    }
  }, [leads]);

  // ── New row state ─────────────────────────────────────────────────────────
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);
  const NEW_ROW_ID = "__new__";

  const activateCell     = useCallback((id: string, col: number) => { setActiveCell({ id, col }); setNewRowActive(null); }, []);
  const activateNewRowCell = (col: number) => { setActiveCell(null); setNewRowActive(col); };

  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    if ((lead as Record<string,string>)[field] === value) { setActiveCell(null); return; }
    editLead(id, { [field]: value } as Partial<Lead>);
    setActiveCell(null);
    toast({ title: "Saved", description: `${field.charAt(0).toUpperCase()+field.slice(1)} updated.` });
  }, [leads, editLead, toast]);

  const navigateCell = useCallback((id: string, colIdx: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(l => l.id)];
    const rowIdx = rows.indexOf(id);
    let nextRow = rowIdx, nextCol = colIdx + (shift ? -1 : 1);
    if (nextCol >= COLS.length) { nextCol=0; nextRow++; }
    if (nextCol < 0)            { nextCol=COLS.length-1; nextRow--; }
    if (nextRow < 0 || nextRow >= rows.length) { setActiveCell(null); setNewRowActive(null); return; }
    const nextId = rows[nextRow];
    if (nextId === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(nextCol); }
    else { setActiveCell({ id: nextId, col: nextCol }); setNewRowActive(null); }
  }, [filtered]);

  const moveCellDown = useCallback((id: string, colIdx: number) => {
    const rows = [NEW_ROW_ID, ...filtered.map(l => l.id)];
    const nextRow = rows.indexOf(id) + 1;
    if (nextRow >= rows.length) { setActiveCell(null); return; }
    const nextId = rows[nextRow];
    if (nextId === NEW_ROW_ID) { setActiveCell(null); setNewRowActive(colIdx); }
    else { setActiveCell({ id: nextId, col: colIdx }); setNewRowActive(null); }
  }, [filtered]);

  const navigateNewRow = (colIdx: number, shift: boolean) => {
    let nextCol = colIdx + (shift ? -1 : 1);
    if (nextCol >= COLS.length) { commitNewRow(); return; }
    if (nextCol < 0) { setNewRowActive(null); return; }
    setNewRowActive(nextCol);
  };

  const commitNewRow = () => {
    if (!newRow || !newRow.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" }); setNewRowActive(0); return;
    }
    const emailLower = newRow.email?.toLowerCase();
    const normPhone  = newRow.phone?.replace(/\D/g,"");
    if (emailLower && existingEmails.has(emailLower)) {
      toast({ title: "Duplicate lead", description: `Email "${newRow.email}" already exists.`, variant: "destructive" }); return;
    }
    if (normPhone && normPhone.length >= 7 && existingPhones.has(normPhone)) {
      toast({ title: "Duplicate lead", description: `Phone "${newRow.phone}" already exists.`, variant: "destructive" }); return;
    }
    addLead({ name: newRow.name, company: newRow.company, email: newRow.email, phone: newRow.phone,
      industry: newRow.industry, city: newRow.city, status: (newRow.status as LeadStatus)||"New",
      source: newRow.source, notes: newRow.notes, isRelevant: true, callLogs: [],
      ...(newRow.temperature ? { temperature: newRow.temperature as "Hot"|"Warm"|"Cold" } : {}),
      ...(newRow.nextFollowUp ? { nextFollowUp: newRow.nextFollowUp } : {}),
    });
    toast({ title: "Lead added", description: `${newRow.name} has been added.` });
    setNewRow(null); setNewRowActive(null);
  };

  const cancelNewRow = () => { setNewRow(null); setNewRowActive(null); };
  const startNewRow  = () => { setNewRow(BLANK_ROW()); setNewRowActive(0); setActiveCell(null); };

  const handleDelete = () => {
    if (!deleteId) return;
    const l = leads.find(x => x.id === deleteId);
    removeLead(deleteId);
    toast({ title: "Lead deleted", description: `${l?.name} has been removed.` });
    setDeleteId(null);
  };

  const handleConvert = (lead: Lead) => {
    convertLeadToCustomer(lead); refreshCustomers();
    toast({ title: "Lead converted", description: `${lead.name} added as a customer.` });
  };

  const handleSaveLead = (id: string, updates: Partial<Lead>) => {
    editLead(id, updates);
    toast({ title: "Updated", description: "Lead updated successfully." });
  };

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total:       leads.length,
    won:         leads.filter(l => l.status==="Won").length,
    new:         leads.filter(l => l.status==="New").length,
    qualified:   leads.filter(l => l.status==="Qualified").length,
    inProgress:  leads.filter(l => ["Meeting Scheduled","Demo Completed","Negotiation"].includes(l.status)).length,
    upcoming:    leads.filter(l => l.nextReminder && !isPast(new Date(l.nextReminder))).length,
    overdue:     leads.filter(l => l.nextReminder && isPast(new Date(l.nextReminder)) && !isToday(new Date(l.nextReminder))).length,
  }), [leads]);

  const CELL_H = 38;

  // ── Wrap text ─────────────────────────────────────────────────────────────
  const [wrapText, setWrapText] = useState<boolean>(() => {
    try { return localStorage.getItem("leads-wrap-text") === "true"; } catch { return false; }
  });
  const toggleWrap = () => setWrapText(v => {
    const next = !v;
    try { localStorage.setItem("leads-wrap-text", String(next)); } catch {}
    return next;
  });

  // ── Column widths (resizable) ─────────────────────────────────────────────
  const COL_WIDTHS_KEY = "onesoft-col-widths:leads";
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const stored: Record<string, number> = (() => {
      try { return JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) ?? "{}"); } catch { return {}; }
    })();
    const result: Record<string, number> = {};
    COLS.forEach(c => { result[c.field] = stored[c.field] ?? c.minW; });
    return result;
  });
  const colWidthsRef = useRef(colWidths);
  useLayoutEffect(() => { colWidthsRef.current = colWidths; }, [colWidths]);
  const startResize = useCallback((e: React.MouseEvent, field: string) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidthsRef.current[field] ?? 80;
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(50, startW + (ev.clientX - startX));
      setColWidths(prev => ({ ...prev, [field]: newW }));
    };
    const onUp = () => {
      try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidthsRef.current)); } catch {}
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isSalesAgent ? "My Leads" : "Leads"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isSalesAgent
              ? `Showing leads assigned to you (${currentUser?.fullName})`
              : "Click any cell to edit · Tab to move · Enter to save · Esc to cancel"}
          </p>
        </div>
        {isAuthenticated && !isSalesAgent && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0 text-[13px]" onClick={downloadTemplate} title="Download import template CSV">
              <Download size={14} /> Template
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0 text-[13px]" onClick={() => { setImportRows([]); setImportOpen(true); }}>
              <Upload size={14} /> Import CSV
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f=e.target.files?.[0]; if(f)processFile(f); e.target.value=""; }} />
            <Button size="sm" onClick={startNewRow} className="gap-1.5 flex-shrink-0" data-testid="btn-add-lead">
              <Plus size={14} /> Add Lead
            </Button>
          </div>
        )}
      </div>

      {/* ── Sales Agent Banner ─────────────────────────────────────────────── */}
      {isSalesAgent && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800">
          <UserCircle2 size={15} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
          <span className="text-[13px] text-violet-700 dark:text-violet-300 font-medium">
            You are viewing your assigned leads only. Contact your administrator to assign more leads to you.
          </span>
          <span className="ml-auto text-[12px] font-bold text-violet-500 dark:text-violet-400 flex-shrink-0">
            {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── KPI pills ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Total",       value: kpis.total,      color: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground",              filter: () => { setStatusFilter("All"); setRelevanceFilter("All"); } },
          { label: "New",         value: kpis.new,        color: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",                   filter: () => setStatusFilter("New") },
          { label: "In Progress", value: kpis.inProgress, color: "bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400",                       filter: () => setStatusFilter("Meeting Scheduled") },
          { label: "Qualified",   value: kpis.qualified,  color: "bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400",                   filter: () => setStatusFilter("Qualified") },
          { label: "Won",         value: kpis.won,        color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",        filter: () => setStatusFilter("Won") },
          ...(kpis.overdue > 0 ? [{ label: `${kpis.overdue} Overdue`, value: null, color: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 cursor-pointer", filter: () => {} }] : []),
          ...(kpis.upcoming > 0 ? [{ label: `${kpis.upcoming} Reminders`, value: null, color: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 cursor-pointer", filter: () => {} }] : []),
        ].map(k => (
          <button key={k.label} onClick={k.filter}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-opacity hover:opacity-80 ${k.color}`}>
            {k.label}{k.value !== null && <span>: {k.value}</span>}
          </button>
        ))}
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Row 1: Search + Status + Relevance + actions */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search leads..." className="pl-8 h-8 text-[13px]" value={search} onChange={e=>setSearch(e.target.value)} data-testid="input-search-leads" />
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
          <Select value={relevanceFilter} onValueChange={setRelevanceFilter}>
            <SelectTrigger className="w-32 h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Leads</SelectItem>
              <SelectItem value="Relevant">Relevant</SelectItem>
              <SelectItem value="Irrelevant">Irrelevant</SelectItem>
            </SelectContent>
          </Select>
          {/* Agent filter */}
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-40 h-8 text-[13px]">
              <UserCircle2 size={12} className="mr-1 text-muted-foreground shrink-0" />
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Agents</SelectItem>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {salesAgents.filter(a => a.status === "Active").map(a => (
                <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Source filter */}
          {uniqueSources.length > 0 && (
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-36 h-8 text-[13px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Sources</SelectItem>
                {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* Industry filter */}
          {uniqueIndustries.length > 0 && (
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-36 h-8 text-[13px]">
                <SelectValue placeholder="All Industries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Industries</SelectItem>
                {uniqueIndustries.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border">
              <X size={11} /> Clear
            </button>
          )}
          {/* Wrap toggle */}
          <button
            onClick={toggleWrap}
            title={wrapText ? "Disable text wrap" : "Enable text wrap"}
            className={`h-8 px-2.5 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition-all shrink-0 ${
              wrapText
                ? "border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                : "border-gray-200 dark:border-border bg-white dark:bg-card text-muted-foreground hover:border-gray-300"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M3 12h15a3 3 0 0 1 0 6H3"/>
              <polyline points="9 15 6 18 9 21"/>
              <line x1="3" y1="18" x2="6" y2="18"/>
            </svg>
            Wrap
          </button>
          {isAuthenticated && newRow && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={cancelNewRow}><X size={12}/> Cancel</Button>
              <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12}/> Save Row</Button>
            </div>
          )}
          <div className="text-[12px] text-muted-foreground self-center ml-auto whitespace-nowrap">
            {filtered.length} of {leads.length} leads
            {hasActiveFilters && <span className="ml-1 text-primary font-medium">· filtered</span>}
          </div>
        </div>
      </div>

      {/* ── Excel-like Grid ───────────────────────────────────────────────────── */}
      <div ref={tableRef} className="rounded-xl border border-gray-200 dark:border-border overflow-auto bg-white dark:bg-card shadow-sm"
        style={{ maxHeight: "calc(100vh - 300px)" }}>
        <table className="border-collapse text-[13px] w-full" style={{ tableLayout:"fixed", minWidth:`${COLS.reduce((a,c)=>a+(colWidths[c.field]??c.minW),0)+56+100}px` }}>
          <colgroup>
            <col style={{ width:"56px" }} />
            {COLS.map(c => <col key={c.field} style={{ width:`${colWidths[c.field]??c.minW}px` }} />)}
            <col style={{ width:"100px" }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-400 text-center py-2 select-none">#</th>
              {COLS.map(c => (
                <th key={c.field} className="border-b border-r border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-left px-3 py-2 text-[11px] font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-wide whitespace-nowrap select-none relative group">
                  <span className="pr-2">{c.label}</span>
                  {/* Resize handle */}
                  <div
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-20 flex items-center justify-end"
                    onMouseDown={e => startResize(e, c.field)}
                    title="Drag to resize column"
                  >
                    <div className="w-[3px] h-4 rounded-full bg-gray-300 dark:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </th>
              ))}
              <th className="border-b border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/60 text-[11px] font-bold text-gray-400 text-center py-2 select-none sticky right-0">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {/* New row */}
            {isAuthenticated && newRow && (
              <tr className="bg-amber-50/60 dark:bg-amber-950/20 border-b border-gray-100 dark:border-border">
                <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold select-none" style={wrapText?{minHeight:`${CELL_H}px`}:{height:`${CELL_H}px`}}>★</td>
                {COLS.map((c, ci) => {
                  const isActive = newRowActive === ci;
                  return (
                    <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isActive?"ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10":"hover:bg-amber-50 dark:hover:bg-amber-950/40"}`} style={wrapText?{minHeight:`${CELL_H}px`}:{height:`${CELL_H}px`}}>
                      {isActive && c.type==="select" ? (
                        <select autoFocus value={newRow[c.field]} onChange={e=>setNewRow(r=>r?{...r,[c.field]:e.target.value}:r)}
                          onKeyDown={e=>{if(e.key==="Tab"){e.preventDefault();navigateNewRow(ci,e.shiftKey);}if(e.key==="Enter"){e.preventDefault();navigateNewRow(ci,false);}if(e.key==="Escape")cancelNewRow();}}
                          className="absolute inset-0 w-full h-full px-2 text-[13px] bg-white dark:bg-card border-0 outline-none">
                          {LEAD_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : isActive && c.type==="temp-select" ? (
                        <select autoFocus value={newRow[c.field]||""} onChange={e=>setNewRow(r=>r?{...r,[c.field]:e.target.value}:r)}
                          onKeyDown={e=>{if(e.key==="Tab"){e.preventDefault();navigateNewRow(ci,e.shiftKey);}if(e.key==="Enter"){e.preventDefault();navigateNewRow(ci,false);}if(e.key==="Escape")cancelNewRow();}}
                          className="absolute inset-0 w-full h-full px-2 text-[13px] bg-white dark:bg-card border-0 outline-none">
                          <option value="">— None —</option>
                          {["Hot","Warm","Cold"].map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : isActive && c.type==="agent-select" ? (
                        <select autoFocus value={newRow[c.field]||""} onChange={e=>setNewRow(r=>r?{...r,[c.field]:e.target.value}:r)}
                          onKeyDown={e=>{if(e.key==="Tab"){e.preventDefault();navigateNewRow(ci,e.shiftKey);}if(e.key==="Enter"){e.preventDefault();ci===COLS.length-1?commitNewRow():navigateNewRow(ci,false);}if(e.key==="Escape")cancelNewRow();}}
                          className="absolute inset-0 w-full h-full px-2 text-[13px] bg-white dark:bg-card border-0 outline-none">
                          <option value="">— Unassigned —</option>
                          {salesAgents.filter(a=>a.status==="Active").map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                        </select>
                      ) : isActive ? (
                        <input autoFocus type={c.type} value={newRow[c.field]} placeholder={c.label}
                          onChange={e=>setNewRow(r=>r?{...r,[c.field]:e.target.value}:r)}
                          onKeyDown={e=>{if(e.key==="Tab"){e.preventDefault();navigateNewRow(ci,e.shiftKey);}if(e.key==="Enter"){e.preventDefault();ci===COLS.length-1?commitNewRow():navigateNewRow(ci,false);}if(e.key==="Escape")cancelNewRow();}}
                          className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300" />
                      ) : (
                        <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => activateNewRowCell(ci)}>
                          {c.field==="status"
                            ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[newRow.status as LeadStatus]}`}>{newRow.status}</span>
                            : c.field==="temperature" && newRow[c.field]
                              ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${TEMP_COLORS[newRow[c.field]]||""}`}><span>{TEMP_DOT[newRow[c.field]]}</span>{newRow[c.field]}</span>
                              : c.field==="nextFollowUp" && newRow[c.field]
                                ? <span className="text-[12px] font-medium text-foreground">{format(new Date(newRow[c.field]),"dd MMM yy")}</span>
                                : c.type==="agent-select" && newRow[c.field]
                                  ? <span className="inline-flex items-center gap-1.5 text-[12px]"><UserCircle2 size={11} className="text-primary/60"/>{newRow[c.field]}</span>
                                  : <span className={`truncate ${!newRow[c.field]?"text-gray-300":"text-gray-700 dark:text-foreground"}`}>{newRow[c.field]||c.label}</span>
                          }
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{height:`${CELL_H}px`}}>
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Save"><Save size={13}/></button>
                    <button onClick={cancelNewRow}  className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" title="Cancel"><X size={13}/></button>
                  </div>
                </td>
              </tr>
            )}

            {/* Existing rows */}
            {filtered.length === 0 ? (
              <tr><td colSpan={COLS.length+2} className="text-center py-16 text-muted-foreground text-sm">
                {hasActiveFilters ? (
                  <span>No leads match your filters. <button className="text-primary underline" onClick={clearAllFilters}>Clear filters</button></span>
                ) : isAuthenticated
                  ? <span>No leads yet. Click <strong>Add Lead</strong> to start.</span> : "No leads yet."}
              </td></tr>
            ) : filtered.map((lead, rowIdx) => {
              const isRowActive  = activeCell?.id === lead.id;
              const remInfo      = reminderLabel(lead.nextReminder);
              const isExpanded   = expandedLeadId === lead.id;
              const lastCallLog  = (lead.callLogs || []).slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
              return (
                <React.Fragment key={lead.id}>
                <tr data-testid={`row-lead-${lead.id}`}
                  className={`border-b border-gray-100 dark:border-border transition-colors group ${isExpanded?"border-b-0":""}  ${isRowActive?"bg-blue-50/30 dark:bg-blue-950/10":rowIdx%2===0?"bg-white dark:bg-card":"bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10 ${lead.isRelevant===false?"opacity-60":""}`}>
                  {/* Row number + indicators */}
                  <td className="border-r border-gray-100 dark:border-border text-center select-none font-mono" style={wrapText?{minHeight:`${CELL_H}px`}:{height:`${CELL_H}px`}}>
                    <div className="flex flex-col items-center justify-center gap-0.5">
                      <span className="text-[10px] text-gray-300 dark:text-muted-foreground/50">{rowIdx+1}</span>
                      <div className="flex gap-0.5">
                        {lead.isRelevant === false && <span title="Irrelevant"><StarOff size={8} className="text-gray-300" /></span>}
                        {remInfo?.urgent && <span title={`Reminder: ${remInfo.label}`}><Bell size={8} className="text-orange-400" /></span>}
                        {remInfo && !remInfo.urgent && <span title={`Reminder: ${remInfo.label}`}><Bell size={8} className="text-blue-400" /></span>}
                      </div>
                    </div>
                  </td>

                  {/* Editable columns */}
                  {COLS.map((c, ci) => {
                    const isActive = activeCell?.id===lead.id && activeCell.col===ci;
                    const rawVal = String((lead as Record<string,unknown>)[c.field] ?? "");
                    return (
                      <td key={c.field}
                        className={`border-r border-gray-100 dark:border-border relative p-0 ${isActive?"ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10":"hover:bg-blue-50/40 dark:hover:bg-blue-950/20"}`}
                        style={wrapText?{minHeight:`${CELL_H}px`}:{height:`${CELL_H}px`}} onClick={() => !isActive && isAuthenticated && activateCell(lead.id, ci)}>
                        {c.type === "agent-select" ? (
                          isActive && isAuthenticated ? (
                            <select autoFocus value={rawVal}
                              onChange={e=>{ commitCell(lead.id, c.field, e.target.value); setActiveCell(null); }}
                              onKeyDown={e=>{if(e.key==="Escape")setActiveCell(null);if(e.key==="Tab"){e.preventDefault();navigateCell(lead.id,ci,e.shiftKey);}}}
                              onBlur={()=>setActiveCell(null)}
                              className="absolute inset-0 w-full h-full px-2 text-[13px] bg-white dark:bg-card border-0 outline-none">
                              <option value="">— Unassigned —</option>
                              {salesAgents.filter(a=>a.status==="Active").map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                            </select>
                          ) : (
                            <div className={`w-full flex items-center px-3 gap-1.5 cursor-default ${wrapText?"py-2 min-h-[38px]":"h-full"}`}>
                              {rawVal
                                ? <><div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[8px] font-bold flex-shrink-0">{rawVal.charAt(0).toUpperCase()}</div><span className="truncate text-[12px] text-foreground">{rawVal}</span></>
                                : <span className="text-[11px] text-muted-foreground/50 italic">—</span>
                              }
                            </div>
                          )
                        ) : (
                          <EditableCell
                            value={rawVal}
                            col={c} active={isActive} canEdit={isAuthenticated}
                            onActivate={()=>activateCell(lead.id,ci)}
                            onCommit={v=>commitCell(lead.id,c.field,v)}
                            onCancel={()=>setActiveCell(null)}
                            onTab={shift=>navigateCell(lead.id,ci,shift)}
                            onEnter={()=>moveCellDown(lead.id,ci)}
                            wrapText={wrapText}
                          />
                        )}
                      </td>
                    );
                  })}

                  {/* Actions */}
                  <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border text-center" style={wrapText?{minHeight:`${CELL_H}px`}:{height:`${CELL_H}px`}} onClick={e=>e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Expand/collapse details */}
                      <button
                        className={`p-1 rounded transition-colors ${isExpanded?"text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40":"text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"}`}
                        title={isExpanded ? "Collapse details" : "Expand details"}
                        onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)}>
                        <Layers size={13}/>
                      </button>
                      <button className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors" title="Full details sheet" onClick={() => setViewLead(lead)}>
                        <Eye size={13}/>
                      </button>
                      <button
                        className={`p-1 rounded transition-colors ${lead.isRelevant===false?"text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40":"text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"}`}
                        title={lead.isRelevant===false?"Mark Relevant":"Mark Irrelevant"}
                        onClick={() => isAuthenticated && editLead(lead.id, { isRelevant: !(lead.isRelevant??true) })}>
                        {lead.isRelevant===false ? <StarOff size={13}/> : <Star size={13}/>}
                      </button>
                      <button
                        className={`p-1 rounded transition-colors ${lead.nextReminder?"text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40":"text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"}`}
                        title="Set Reminder"
                        onClick={() => { setViewLead(lead); }}>
                        <Bell size={13}/>
                      </button>
                      {isAuthenticated && lead.status==="Won" && !convertedLeadIds.has(lead.id) && (
                        <button className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors" title="Convert to customer" onClick={() => handleConvert(lead)}>
                          <UserCheck size={13}/>
                        </button>
                      )}
                      {isAuthenticated && (
                        <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete" onClick={() => setDeleteId(lead.id)}>
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* ── Collapsed detail row ───────────────────────────────── */}
                {isExpanded && (
                  <tr className={`border-b border-gray-200 dark:border-border ${rowIdx%2===0?"bg-white dark:bg-card":"bg-gray-50/50 dark:bg-muted/10"}`}>
                    <td colSpan={COLS.length + 2} className="px-0 pb-0">
                      <div className="mx-3 mb-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/10 overflow-hidden">
                        {/* Detail grid — 4 columns */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-indigo-100 dark:divide-indigo-900/40">

                          {/* Company */}
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 dark:text-indigo-500 mb-1 flex items-center gap-1">
                              <Briefcase size={9}/> Company
                            </p>
                            <p className="text-[13px] text-foreground font-medium truncate">{lead.company || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                          </div>

                          {/* Email */}
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 dark:text-indigo-500 mb-1 flex items-center gap-1">
                              <MessageSquare size={9}/> Email
                            </p>
                            {lead.email
                              ? <a href={`mailto:${lead.email}`} className="text-[13px] text-primary hover:underline truncate block">{lead.email}</a>
                              : <p className="text-muted-foreground/40 italic text-[13px] font-normal">—</p>}
                          </div>

                          {/* City */}
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 dark:text-indigo-500 mb-1 flex items-center gap-1">
                              <MapPin size={9}/> City
                            </p>
                            <p className="text-[13px] text-foreground font-medium truncate">{lead.city || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                          </div>

                          {/* Source */}
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 dark:text-indigo-500 mb-1 flex items-center gap-1">
                              <ChevronRight size={9}/> Source
                            </p>
                            <p className="text-[13px] text-foreground font-medium truncate">{lead.source || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                          </div>

                          {/* Last Contact */}
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 dark:text-indigo-500 mb-1 flex items-center gap-1">
                              <Clock size={9}/> Last Contact
                            </p>
                            <p className="text-[13px] text-foreground font-medium">
                              {lastCallLog
                                ? format(new Date(lastCallLog.date), "dd MMM yyyy, HH:mm")
                                : <span className="text-muted-foreground/40 italic font-normal">No contact logged</span>}
                            </p>
                          </div>

                          {/* Last Response */}
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 dark:text-indigo-500 mb-1 flex items-center gap-1">
                              <PhoneCall size={9}/> Response
                            </p>
                            {lastCallLog ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${OUTCOME_COLOR[lastCallLog.outcome]}`}>
                                  {lastCallLog.outcome}
                                </span>
                                {lastCallLog.notes && <span className="text-[12px] text-muted-foreground truncate">{lastCallLog.notes}</span>}
                              </div>
                            ) : (
                              <p className="text-muted-foreground/40 italic text-[13px]">—</p>
                            )}
                          </div>

                          {/* Notes — spans 2 cols so the row is full */}
                          <div className="px-4 py-3 md:col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 dark:text-indigo-500 mb-1 flex items-center gap-1">
                              <MessageSquare size={9}/> Notes
                            </p>
                            <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">{lead.notes || <span className="text-muted-foreground/40 italic">—</span>}</p>
                          </div>

                        </div>

                        {/* Collapse button */}
                        <div className="border-t border-indigo-100 dark:border-indigo-900/40 px-4 py-2 flex items-center justify-end">
                          <button
                            onClick={() => setExpandedLeadId(null)}
                            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors font-medium">
                            <ChevronUp size={11}/> Collapse
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}

            {/* Add row trigger */}
            {isAuthenticated && !newRow && (
              <tr>
                <td colSpan={COLS.length+2}>
                  <button onClick={startNewRow} className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors" data-testid="btn-add-row">
                    <Plus size={13}/> Add row
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Lead detail sheet ─────────────────────────────────────────────────── */}
      <Sheet open={!!viewLead} onOpenChange={o => { if (!o) setViewLead(null); }}>
        <SheetContent className="sm:max-w-lg p-0 flex flex-col overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Lead Details</SheetTitle>
          </SheetHeader>
          {viewLead && (
            <LeadDetailSheet
              lead={viewLead}
              onClose={() => setViewLead(null)}
              onSave={handleSaveLead}
              onDelete={id => { setDeleteId(id); }}
              onConvert={handleConvert}
              canEdit={isAuthenticated}
              isConverted={convertedLeadIds.has(viewLead.id)}
              agents={salesAgents.map(a => ({ id: a.id, name: a.name, agentCode: a.agentCode }))}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Delete confirm ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete">
              Delete Lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Import CSV Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={o => { if(!o) { setImportOpen(false); setImportRows([]); }}}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-[17px]">
              <FileSpreadsheet size={18} className="text-blue-600" /> Import Leads from CSV
            </DialogTitle>
          </DialogHeader>

          {importRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className={`w-full max-w-md border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 transition-colors cursor-pointer ${
                dragOver?"border-blue-500 bg-blue-50 dark:bg-blue-950/30":"border-gray-200 dark:border-border hover:border-blue-400 dark:hover:border-blue-600"}`}
                onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
                onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files?.[0];if(f)processFile(f);}}
                onClick={()=>fileInputRef.current?.click()}>
                <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <FileSpreadsheet size={32} className="text-blue-600 dark:text-blue-400"/>
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-gray-700 dark:text-foreground">Drop your CSV here</p>
                  <p className="text-[13px] text-muted-foreground mt-1">or click to browse · .csv files only</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5"><Upload size={13}/> Choose File</Button>
              </div>
              <div className="mt-6 flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800/40 rounded-xl p-4 max-w-md">
                <Info size={15} className="text-blue-500 mt-0.5 shrink-0"/>
                <div>
                  <p className="text-[13px] font-medium text-blue-700 dark:text-blue-300">Don't have a CSV yet?</p>
                  <p className="text-[12px] text-blue-600/80 dark:text-blue-400/70 mt-0.5">Download our template with the correct column headers and 3 example rows.</p>
                  <button className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    onClick={e=>{e.stopPropagation();downloadTemplate();}}>
                    <Download size={12}/> Download Template CSV
                  </button>
                </div>
              </div>
              <div className="mt-4 max-w-md w-full">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Expected columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {CSV_HEADERS.map(h=><span key={h} className="font-mono text-[11px] bg-gray-100 dark:bg-muted px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">{h}</span>)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">Column order doesn't matter — headers are matched by name. Only <strong>name</strong> is required.</p>
              </div>
            </div>
          ) : (
            <>
              {(() => {
                const valid=importRows.filter(r=>!r.error).length;
                const invalid=importRows.filter(r=>!!r.error).length;
                const dupes=importRows.filter(r=>!r.error&&r.isDupe).length;
                const willImport=importRows.filter(r=>!r.error&&!(skipDupes&&r.isDupe)).length;
                return (
                  <div className="shrink-0 px-6 py-3 bg-gray-50 dark:bg-muted/20 border-b border-border flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400"/><span className="text-[12px] text-muted-foreground">{importRows.length} total rows</span></div>
                    <div className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-500"/><span className="text-[12px] text-emerald-700 dark:text-emerald-400">{valid} valid</span></div>
                    {invalid>0&&<div className="flex items-center gap-1.5"><AlertTriangle size={13} className="text-red-500"/><span className="text-[12px] text-red-600 dark:text-red-400">{invalid} invalid</span></div>}
                    {dupes>0&&<div className="flex items-center gap-1.5"><Info size={13} className="text-amber-500"/><span className="text-[12px] text-amber-700 dark:text-amber-400">{dupes} duplicate{dupes!==1?"s":""}</span></div>}
                    <div className="ml-auto flex items-center gap-2">
                      {dupes>0&&(
                        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer">
                          <input type="checkbox" checked={skipDupes} onChange={e=>setSkipDupes(e.target.checked)} className="rounded"/>
                          Skip duplicates
                        </label>
                      )}
                      <span className="text-[12px] font-semibold text-foreground">Will import: {willImport}</span>
                    </div>
                  </div>
                );
              })()}
              <div className="flex-1 overflow-auto px-6 py-3">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-3 text-muted-foreground font-semibold w-6">#</th>
                      {CSV_HEADERS.map(h=><th key={h} className="text-left py-2 pr-3 text-muted-foreground font-semibold capitalize">{h}</th>)}
                      <th className="text-left py-2 text-muted-foreground font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row,i)=>(
                      <tr key={i} className={`border-b border-border/50 ${row.error?"bg-red-50/50 dark:bg-red-950/10":row.isDupe?"bg-amber-50/50 dark:bg-amber-950/10":""}`}>
                        <td className="py-1.5 pr-3 text-muted-foreground">{i+1}</td>
                        {CSV_HEADERS.map(h=><td key={h} className="py-1.5 pr-3 truncate max-w-[100px]" title={row.mapped[h as keyof typeof row.mapped]}>{row.mapped[h as keyof typeof row.mapped]||<span className="text-muted-foreground/40">—</span>}</td>)}
                        <td className="py-1.5">
                          {row.error ? <span className="flex items-center gap-1 text-red-600"><AlertTriangle size={11}/>{row.error}</span>
                            : row.isDupe ? <span className="flex items-center gap-1 text-amber-600"><Info size={11}/>{skipDupes?"Skip":"Import"}</span>
                            : <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11}/>Import</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
                <Button variant="outline" onClick={()=>{setImportOpen(false);setImportRows([]);}}>Cancel</Button>
                <Button onClick={confirmImport} disabled={importing||importRows.filter(r=>!r.error&&!(skipDupes&&r.isDupe)).length===0}>
                  {importing?"Importing…":`Import ${importRows.filter(r=>!r.error&&!(skipDupes&&r.isDupe)).length} Lead${importRows.filter(r=>!r.error&&!(skipDupes&&r.isDupe)).length!==1?"s":""}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
