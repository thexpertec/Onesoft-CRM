import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  JobPosting, JobApplicant, InterviewSchedule,
  JobStatus, JobType, ApplicantStage, InterviewStatus,
  getJobPostings, createJobPosting, updateJobPosting, deleteJobPosting,
  getJobApplicants, createJobApplicant, updateJobApplicant, deleteJobApplicant,
  getInterviewSchedules, upsertInterviewSchedule, updateInterviewSchedule,
  getAdminUsers,
} from "@/lib/store";
import {
  Briefcase, Plus, X, Save, Trash2, ChevronRight,
  Users, Calendar, Clock, Link2, Mail, Search,
  MapPin, Building2, ChevronDown, CheckCircle2,
  Edit2, Eye, RefreshCw, Ban, AlignLeft,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return s; } };
const initials = (name: string) => name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
const avatarColor = (name: string) => {
  const colors = ["bg-violet-100 text-violet-700","bg-blue-100 text-blue-700","bg-emerald-100 text-emerald-700","bg-amber-100 text-amber-700","bg-rose-100 text-rose-700","bg-indigo-100 text-indigo-700","bg-teal-100 text-teal-700"];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
};

// ─── Status badges ────────────────────────────────────────────────────────────
const JOB_STATUS_STYLE: Record<JobStatus, string> = {
  open:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  draft:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  closed: "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400",
};
const STAGE_STYLE: Record<ApplicantStage, string> = {
  applied:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  screening: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  interview: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  offer:     "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  hired:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};
const INTERVIEW_STATUS_STYLE: Record<InterviewStatus, string> = {
  scheduled:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "no-show":   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  rescheduled: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

// ─── Blank factories ──────────────────────────────────────────────────────────
const blankJob = (): Omit<JobPosting, "id" | "createdAt" | "updatedAt"> => ({
  title: "", department: "", location: "", type: "full-time",
  status: "open", description: "", requirements: "", salary: "",
});
const blankApplicant = (jobId: string): Omit<JobApplicant, "id" | "createdAt" | "updatedAt"> => ({
  jobId, fullName: "", email: "", phone: "", experience: "", education: "",
  match: 0, stage: "applied", appliedAt: today(),
});

// ─── Job Form Dialog ──────────────────────────────────────────────────────────
function JobFormDialog({ initial, onClose, onSave }: {
  initial: Partial<JobPosting> | null;
  onClose: () => void;
  onSave: (data: Omit<JobPosting, "id" | "createdAt" | "updatedAt">) => void;
}) {
  const [form, setForm] = useState<Omit<JobPosting, "id" | "createdAt" | "updatedAt">>(
    initial ? { ...blankJob(), ...initial } : blankJob()
  );
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.title.trim() && form.department.trim();
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[min(98vw,640px)] max-w-none max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Briefcase size={16} className="text-violet-500" />
            {initial?.id ? "Edit Job Posting" : "New Job Posting"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Job Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              placeholder="e.g. Social Media Marketing Manager" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Department *</label>
            <input value={form.department} onChange={e => set("department", e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              placeholder="e.g. Marketing" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Location</label>
            <input value={form.location} onChange={e => set("location", e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              placeholder="e.g. Hull, UK / Remote" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Job Type</label>
            <Select value={form.type} onValueChange={v => set("type", v as JobType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["full-time","part-time","contract","internship"] as JobType[]).map(t => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Status</label>
            <Select value={form.status} onValueChange={v => set("status", v as JobStatus)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Salary Range</label>
            <input value={form.salary ?? ""} onChange={e => set("salary", e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              placeholder="e.g. £30,000–£40,000 / year" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Job Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              placeholder="Role summary, responsibilities…" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Requirements</label>
            <textarea value={form.requirements} onChange={e => set("requirements", e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              placeholder="Skills, experience, qualifications…" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800">Cancel</button>
          <button disabled={!valid} onClick={() => valid && onSave(form)}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
            <Save size={14}/>{initial?.id ? "Save Changes" : "Create Job"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Applicant Form Dialog ────────────────────────────────────────────────────
function ApplicantFormDialog({ jobId, initial, onClose, onSave }: {
  jobId: string; initial: JobApplicant | null;
  onClose: () => void; onSave: (data: Omit<JobApplicant, "id" | "createdAt" | "updatedAt">) => void;
}) {
  const [form, setForm] = useState<Omit<JobApplicant, "id" | "createdAt" | "updatedAt">>(
    initial ? { ...initial } : blankApplicant(jobId)
  );
  const set = (k: keyof typeof form, v: string | number) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.fullName.trim() && form.email.trim();
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[min(98vw,540px)] max-w-none max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Users size={16} className="text-blue-500"/>
            {initial ? "Edit Applicant" : "Add Applicant"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Full Name *</label>
            <input value={form.fullName} onChange={e => set("fullName", e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Candidate full name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Email *</label>
            <input value={form.email} onChange={e => set("email", e.target.value)} type="email"
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="email@example.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Phone</label>
            <input value={form.phone ?? ""} onChange={e => set("phone", e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="+44 …" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Experience</label>
            <input value={form.experience} onChange={e => set("experience", e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. 4y" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Education</label>
            <input value={form.education} onChange={e => set("education", e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Master's Degree" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Match %</label>
            <input value={form.match} onChange={e => set("match", parseInt(e.target.value)||0)} type="number" min={0} max={100}
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Stage</label>
            <Select value={form.stage} onValueChange={v => set("stage", v as ApplicantStage)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["applied","screening","interview","offer","hired","rejected"] as ApplicantStage[]).map(s => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Applied Date</label>
            <input value={form.appliedAt} onChange={e => set("appliedAt", e.target.value)} type="date"
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1">Notes</label>
            <textarea value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800">Cancel</button>
          <button disabled={!valid} onClick={() => valid && onSave(form)}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
            <Save size={14}/>{initial ? "Save" : "Add Applicant"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Interview Row (inline editable) ─────────────────────────────────────────
function InterviewRow({ applicant, schedule, interviewers, jobTitle, onSave, onSendEmail }: {
  applicant: JobApplicant;
  schedule: InterviewSchedule | undefined;
  interviewers: { id: string; fullName: string; email: string }[];
  jobTitle: string;
  onSave: (data: Omit<InterviewSchedule, "id" | "createdAt" | "updatedAt">) => void;
  onSendEmail: (applicant: JobApplicant, schedule: InterviewSchedule) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{
    date: string; time: string; link: string;
    status: InterviewStatus; interviewerId: string; notes: string;
  }>({
    date: schedule?.date ?? "",
    time: schedule?.time ?? "",
    link: schedule?.link ?? "",
    status: schedule?.status ?? "scheduled",
    interviewerId: schedule?.interviewerId ?? "",
    notes: schedule?.notes ?? "",
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.date || !form.time || !form.interviewerId) return;
    onSave({
      jobId: applicant.jobId,
      applicantId: applicant.id,
      interviewerId: form.interviewerId,
      date: form.date,
      time: form.time,
      link: form.link,
      status: form.status,
      notes: form.notes,
      emailSent: schedule?.emailSent ?? false,
    });
    setEditing(false);
  };

  const interviewer = interviewers.find(u => u.id === form.interviewerId);
  const canSendEmail = !!schedule && !!schedule.date && !!schedule.interviewerId;

  return (
    <tr className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors group">
      {/* Candidate */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${avatarColor(applicant.fullName)}`}>
            {initials(applicant.fullName)}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-gray-800 dark:text-zinc-100">{applicant.fullName}</div>
            <div className="text-[11px] text-gray-400">{applicant.email}</div>
          </div>
        </div>
      </td>

      {/* Date */}
      <td className="px-3 py-2 min-w-[130px]">
        {editing ? (
          <input type="date" value={form.date} onChange={e => set("date", e.target.value)}
            className="w-full h-8 px-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
        ) : (
          <span className="text-[12px] text-gray-700 dark:text-zinc-300">{form.date ? fmtDate(form.date) : <span className="text-gray-300 dark:text-zinc-600">—</span>}</span>
        )}
      </td>

      {/* Time */}
      <td className="px-3 py-2 min-w-[100px]">
        {editing ? (
          <input type="time" value={form.time} onChange={e => set("time", e.target.value)}
            className="w-full h-8 px-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
        ) : (
          <span className="text-[12px] text-gray-700 dark:text-zinc-300">{form.time || <span className="text-gray-300 dark:text-zinc-600">—</span>}</span>
        )}
      </td>

      {/* Link */}
      <td className="px-3 py-2 min-w-[180px]">
        {editing ? (
          <input type="url" value={form.link} onChange={e => set("link", e.target.value)}
            className="w-full h-8 px-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="https://meet.google.com/…" />
        ) : form.link ? (
          <a href={form.link} target="_blank" rel="noopener noreferrer"
            className="text-[12px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 max-w-[160px] truncate">
            <Link2 size={11}/>{form.link}
          </a>
        ) : <span className="text-gray-300 dark:text-zinc-600 text-[12px]">—</span>}
      </td>

      {/* Status */}
      <td className="px-3 py-2 min-w-[130px]">
        {editing ? (
          <Select value={form.status} onValueChange={v => set("status", v as InterviewStatus)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["scheduled","completed","cancelled","no-show","rescheduled"] as InterviewStatus[]).map(s => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : form.date ? (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${INTERVIEW_STATUS_STYLE[form.status]}`}>
            {form.status.charAt(0).toUpperCase()+form.status.slice(1)}
          </span>
        ) : <span className="text-gray-300 dark:text-zinc-600 text-[12px]">—</span>}
      </td>

      {/* Interviewer */}
      <td className="px-3 py-2 min-w-[160px]">
        {editing ? (
          <Select value={form.interviewerId} onValueChange={v => set("interviewerId", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select interviewer…" /></SelectTrigger>
            <SelectContent>
              {interviewers.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : interviewer ? (
          <span className="text-[12px] text-gray-700 dark:text-zinc-300">{interviewer.fullName}</span>
        ) : <span className="text-gray-300 dark:text-zinc-600 text-[12px]">—</span>}
      </td>

      {/* Actions */}
      <td className="px-3 py-2 min-w-[150px]">
        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <button onClick={handleSave}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors">
                <Save size={11}/> Save
              </button>
              <button onClick={() => { setEditing(false); setForm({ date: schedule?.date ?? "", time: schedule?.time ?? "", link: schedule?.link ?? "", status: schedule?.status ?? "scheduled", interviewerId: schedule?.interviewerId ?? "", notes: schedule?.notes ?? "" }); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                <X size={11}/> Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100">
                <Edit2 size={11}/> {schedule ? "Edit" : "Schedule"}
              </button>
              {canSendEmail && (
                <button onClick={() => onSendEmail(applicant, schedule!)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    schedule?.emailSent
                      ? "border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}>
                  <Mail size={11}/>{schedule?.emailSent ? "Resend" : "Send Email"}
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Job Detail ───────────────────────────────────────────────────────────────
type Tab = "overview" | "applicants" | "interviews";

function JobDetail({ job, onClose, onEdit, onDelete }: {
  job: JobPosting;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("applicants");
  const [applicants, setApplicants] = useState<JobApplicant[]>(() => getJobApplicants(job.id));
  const [interviews, setInterviews] = useState<InterviewSchedule[]>(() => getInterviewSchedules(job.id));
  const [applicantForm, setApplicantForm] = useState<{ open: boolean; target: JobApplicant | null }>({ open: false, target: null });
  const [deleteApplicantId, setDeleteApplicantId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<ApplicantStage | "All">("All");
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);

  const interviewers = useMemo(() => getAdminUsers(), []);

  const refresh = () => {
    setApplicants(getJobApplicants(job.id));
    setInterviews(getInterviewSchedules(job.id));
  };

  const filteredApplicants = useMemo(() =>
    applicants.filter(a => {
      const matchSearch = !search || a.fullName.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase());
      const matchStage = stageFilter === "All" || a.stage === stageFilter;
      return matchSearch && matchStage;
    }),
    [applicants, search, stageFilter]
  );

  const handleSaveApplicant = (data: Omit<JobApplicant, "id" | "createdAt" | "updatedAt">) => {
    if (applicantForm.target) {
      updateJobApplicant(applicantForm.target.id, data);
      toast({ title: "Applicant updated" });
    } else {
      createJobApplicant(data);
      toast({ title: "Applicant added" });
    }
    refresh();
    setApplicantForm({ open: false, target: null });
  };

  const handleDeleteApplicant = (id: string) => {
    deleteJobApplicant(id);
    toast({ title: "Applicant removed", variant: "destructive" });
    refresh();
    setDeleteApplicantId(null);
  };

  const handleStageChange = (applicantId: string, stage: ApplicantStage) => {
    updateJobApplicant(applicantId, { stage });
    refresh();
  };

  const handleSaveInterview = (applicantId: string, data: Omit<InterviewSchedule, "id" | "createdAt" | "updatedAt">) => {
    upsertInterviewSchedule(applicantId, data);
    toast({ title: "Interview scheduled", description: `${data.date} at ${data.time}` });
    refresh();
  };

  const handleSendEmail = (applicant: JobApplicant, schedule: InterviewSchedule) => {
    const interviewer = interviewers.find(u => u.id === schedule.interviewerId);
    const subject = encodeURIComponent(`Interview Invitation — ${job.title} at Onesoft`);
    const body = encodeURIComponent(
      `Dear ${applicant.fullName},\n\n` +
      `We are pleased to invite you for an interview for the position of ${job.title} at Onesoft.\n\n` +
      `📅 Date: ${fmtDate(schedule.date)}\n` +
      `🕐 Time: ${schedule.time}\n` +
      `🔗 Interview Link: ${schedule.link || "To be shared"}\n` +
      `👤 Interviewer: ${interviewer?.fullName ?? "TBC"}\n\n` +
      `Please confirm your availability by replying to this email.\n\n` +
      `Best regards,\nOnesoft HR Team`
    );
    window.open(`mailto:${applicant.email}?subject=${subject}&body=${body}`);
    // Mark email as sent
    const existing = interviews.find(i => i.applicantId === applicant.id);
    if (existing) {
      updateInterviewSchedule(existing.id, { emailSent: true });
      refresh();
    }
    toast({ title: "Email client opened", description: `Interview details ready to send to ${applicant.fullName}` });
  };

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "applicants", label: `Applicants (${applicants.length})` },
    { key: "interviews", label: "Interview Schedule" },
  ] as const;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-gray-200 dark:border-zinc-800">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <button onClick={onClose} className="mt-0.5 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 transition-colors">
              <ChevronRight size={16} className="rotate-180"/>
            </button>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-[17px] font-bold text-gray-900 dark:text-zinc-50">{job.title}</h2>
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${JOB_STATUS_STYLE[job.status]}`}>
                  {job.status.charAt(0).toUpperCase()+job.status.slice(1)}
                </span>
              </div>
              <p className="text-[12px] text-gray-400 mt-0.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><Building2 size={11}/>{job.department}</span>
                {job.location && <span className="flex items-center gap-1"><MapPin size={11}/>{job.location}</span>}
                <span className="capitalize">{job.type}</span>
                {job.salary && <span>{job.salary}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
              <Edit2 size={12}/> Edit
            </button>
            <button onClick={() => setDeleteJobOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 size={12}/> Delete
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as Tab)}
              className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
                tab === t.key
                  ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                  : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="p-6 max-w-2xl space-y-5">
            {job.description && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlignLeft size={12}/>Description</h3>
                <p className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{job.description}</p>
              </div>
            )}
            {job.requirements && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CheckCircle2 size={12}/>Requirements</h3>
                <p className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{job.requirements}</p>
              </div>
            )}
            {!job.description && !job.requirements && (
              <p className="text-sm text-gray-400 dark:text-zinc-500 italic">No overview details added yet. Click Edit to add description and requirements.</p>
            )}
          </div>
        )}

        {/* ── Applicants ── */}
        {tab === "applicants" && (
          <div className="p-0">
            {/* Toolbar */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 dark:border-zinc-800 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidates…"
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <Select value={stageFilter} onValueChange={v => setStageFilter(v as ApplicantStage | "All")}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Stages</SelectItem>
                  {(["applied","screening","interview","offer","hired","rejected"] as ApplicantStage[]).map(s => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button onClick={() => setApplicantForm({ open: true, target: null })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
                <Plus size={12}/> Add Applicant
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-zinc-800">
                    {["CANDIDATE","MATCH","EXPERIENCE","EDUCATION","STAGE","APPLIED","ROUND","RATING","DECISION",""].map((h,i) => (
                      <th key={i} className="px-4 py-2.5 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tracking-wider text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredApplicants.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-zinc-500">No applicants found</td></tr>
                  )}
                  {filteredApplicants.map(a => (
                    <tr key={a.id} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50/60 dark:hover:bg-zinc-800/40 transition-colors group">
                      {/* Candidate */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${avatarColor(a.fullName)}`}>
                            {initials(a.fullName)}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-gray-800 dark:text-zinc-100">{a.fullName}</div>
                            <div className="text-[11px] text-gray-400">{a.email}</div>
                          </div>
                        </div>
                      </td>
                      {/* Match */}
                      <td className="px-4 py-3">
                        <span className={`text-[13px] font-bold ${a.match >= 80 ? "text-emerald-600" : a.match >= 50 ? "text-amber-500" : "text-gray-500"}`}>
                          {a.match}%
                        </span>
                      </td>
                      {/* Experience */}
                      <td className="px-4 py-3 text-[13px] text-gray-700 dark:text-zinc-300 whitespace-nowrap">{a.experience || "—"}</td>
                      {/* Education */}
                      <td className="px-4 py-3 text-[12px] text-gray-600 dark:text-zinc-400 max-w-[140px]">{a.education || "—"}</td>
                      {/* Stage */}
                      <td className="px-4 py-3">
                        <Select value={a.stage} onValueChange={v => handleStageChange(a.id, v as ApplicantStage)}>
                          <SelectTrigger className="h-7 w-[120px] text-[11px] font-semibold border-gray-200 dark:border-zinc-700">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${STAGE_STYLE[a.stage]}`}>
                              {a.stage.charAt(0).toUpperCase()+a.stage.slice(1)}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {(["applied","screening","interview","offer","hired","rejected"] as ApplicantStage[]).map(s => (
                              <SelectItem key={s} value={s}>
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold ${STAGE_STYLE[s]}`}>{s.charAt(0).toUpperCase()+s.slice(1)}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      {/* Applied */}
                      <td className="px-4 py-3 text-[12px] text-gray-500 dark:text-zinc-400 whitespace-nowrap">{fmtDate(a.appliedAt)}</td>
                      {/* Round */}
                      <td className="px-4 py-3 text-[12px] text-gray-400">
                        <input value={a.round ?? ""} onChange={e => { updateJobApplicant(a.id, { round: e.target.value }); refresh(); }}
                          className="w-14 h-6 px-2 rounded border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 bg-transparent text-center focus:outline-none focus:border-blue-400 text-xs" placeholder="—" />
                      </td>
                      {/* Rating */}
                      <td className="px-4 py-3 text-[12px] text-gray-400">
                        <input type="number" min={1} max={10} value={a.rating ?? ""} onChange={e => { updateJobApplicant(a.id, { rating: parseInt(e.target.value)||undefined }); refresh(); }}
                          className="w-12 h-6 px-2 rounded border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 bg-transparent text-center focus:outline-none focus:border-blue-400 text-xs" placeholder="—" />
                      </td>
                      {/* Decision */}
                      <td className="px-4 py-3 text-[12px] text-gray-400">
                        <input value={a.decision ?? ""} onChange={e => { updateJobApplicant(a.id, { decision: e.target.value }); refresh(); }}
                          className="w-20 h-6 px-2 rounded border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 bg-transparent focus:outline-none focus:border-blue-400 text-xs" placeholder="—" />
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setApplicantForm({ open: true, target: a })}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 size={12}/></button>
                          <button onClick={() => setDeleteApplicantId(a.id)}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={12}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Interview Schedule ── */}
        {tab === "interviews" && (
          <div className="p-0">
            {/* Header info bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-violet-50/60 dark:bg-violet-950/20">
              <div className="flex items-center gap-2 text-[12px] text-gray-600 dark:text-zinc-400">
                <Calendar size={13} className="text-violet-500"/>
                <span>Schedule interviews for each applicant. Click <strong>Schedule</strong> on a row, fill in details, and <strong>Send Email</strong> to notify the candidate.</span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-zinc-800">
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tracking-wider text-left">CANDIDATE</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tracking-wider text-left">INTERVIEW DATE</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tracking-wider text-left">TIME</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tracking-wider text-left">INTERVIEW LINK</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tracking-wider text-left">STATUS</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tracking-wider text-left">INTERVIEWER</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tracking-wider text-left">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {applicants.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-zinc-500">
                      No applicants yet. Add applicants in the Applicants tab first.
                    </td></tr>
                  )}
                  {applicants.map(a => (
                    <InterviewRow key={a.id}
                      applicant={a}
                      schedule={interviews.find(i => i.applicantId === a.id)}
                      interviewers={interviewers}
                      jobTitle={job.title}
                      onSave={data => handleSaveInterview(a.id, data)}
                      onSendEmail={handleSendEmail}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {applicantForm.open && (
        <ApplicantFormDialog jobId={job.id} initial={applicantForm.target}
          onClose={() => setApplicantForm({ open: false, target: null })}
          onSave={handleSaveApplicant} />
      )}
      {deleteApplicantId && (
        <AlertDialog open onOpenChange={v => !v && setDeleteApplicantId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove applicant?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently remove the applicant and any scheduled interview.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDeleteApplicant(deleteApplicantId)} className="bg-red-500 hover:bg-red-600">Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <AlertDialog open={deleteJobOpen} onOpenChange={v => !v && setDeleteJobOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job posting?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the job posting and all associated applicants and interviews. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-red-500 hover:bg-red-600">Delete Job</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RecruitmentPage() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobPosting[]>(() => getJobPostings());
  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [jobForm, setJobForm] = useState<{ open: boolean; target: Partial<JobPosting> | null }>({ open: false, target: null });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "All">("All");

  const refresh = () => {
    const fresh = getJobPostings();
    setJobs(fresh);
    if (selected) setSelected(fresh.find(j => j.id === selected.id) ?? null);
  };

  const filtered = useMemo(() =>
    jobs.filter(j => {
      const matchSearch = !search || j.title.toLowerCase().includes(search.toLowerCase()) || j.department.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "All" || j.status === statusFilter;
      return matchSearch && matchStatus;
    }),
    [jobs, search, statusFilter]
  );

  const handleSaveJob = (data: Omit<JobPosting, "id" | "createdAt" | "updatedAt">) => {
    if (jobForm.target?.id) {
      const updated = updateJobPosting(jobForm.target.id, data);
      toast({ title: "Job updated" });
      refresh();
      setSelected(updated);
    } else {
      const created = createJobPosting(data);
      toast({ title: "Job posting created" });
      refresh();
      setSelected(created);
    }
    setJobForm({ open: false, target: null });
  };

  const handleDeleteJob = () => {
    if (!selected) return;
    deleteJobPosting(selected.id);
    toast({ title: "Job posting deleted", variant: "destructive" });
    setSelected(null);
    refresh();
  };

  const statCounts = useMemo(() => ({
    open:   jobs.filter(j => j.status === "open").length,
    draft:  jobs.filter(j => j.status === "draft").length,
    closed: jobs.filter(j => j.status === "closed").length,
    total:  jobs.length,
  }), [jobs]);

  return (
    <div className="flex h-full min-h-0 bg-gray-50 dark:bg-zinc-950">
      {/* ── Left Sidebar: Jobs list ── */}
      <div className={`flex flex-col border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all ${selected ? "hidden md:flex md:w-[300px] lg:w-[340px]" : "flex w-full md:w-[300px] lg:w-[340px]"}`}>
        {/* Sidebar header */}
        <div className="px-4 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[16px] font-bold text-gray-900 dark:text-zinc-50 flex items-center gap-2">
              <Briefcase size={17} className="text-violet-500"/> Recruitment
            </h1>
            <button onClick={() => setJobForm({ open: true, target: null })}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors">
              <Plus size={13}/> New Job
            </button>
          </div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "Open", count: statCounts.open, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Draft", count: statCounts.draft, color: "text-amber-500" },
              { label: "Closed", count: statCounts.closed, color: "text-gray-400" },
            ].map(s => (
              <div key={s.label} className="text-center p-2 rounded-lg bg-gray-50 dark:bg-zinc-800">
                <div className={`text-[17px] font-black ${s.color}`}>{s.count}</div>
                <div className="text-[10px] text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
          {/* Search */}
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs…"
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          {/* Status filter */}
          <div className="flex gap-1.5">
            {(["All","open","draft","closed"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                  statusFilter === s
                    ? "bg-violet-600 text-white"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                }`}>
                {s.charAt(0).toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400 dark:text-zinc-500">
              <Briefcase size={28} className="opacity-40"/>
              <p className="text-sm">{jobs.length === 0 ? "No job postings yet" : "No jobs match your filter"}</p>
              {jobs.length === 0 && (
                <button onClick={() => setJobForm({ open: true, target: null })}
                  className="flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors">
                  <Plus size={12}/> Create First Job
                </button>
              )}
            </div>
          )}
          {filtered.map(j => {
            const appCount = getJobApplicants(j.id).length;
            const isActive = selected?.id === j.id;
            return (
              <button key={j.id} onClick={() => setSelected(j)}
                className={`w-full text-left px-4 py-3.5 border-b border-gray-100 dark:border-zinc-800 transition-colors ${
                  isActive ? "bg-violet-50 dark:bg-violet-950/30 border-l-2 border-l-violet-500" : "hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-800 dark:text-zinc-100 truncate">{j.title}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                      <span className="flex items-center gap-0.5"><Building2 size={10}/>{j.department}</span>
                      {j.location && <span className="flex items-center gap-0.5"><MapPin size={10}/>{j.location}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${JOB_STATUS_STYLE[j.status]}`}>
                        {j.status.charAt(0).toUpperCase()+j.status.slice(1)}
                      </span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Users size={10}/>{appCount} applicant{appCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 dark:text-zinc-600 flex-shrink-0 mt-1"/>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: Job Detail ── */}
      {selected ? (
        <JobDetail key={selected.id} job={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setJobForm({ open: true, target: selected })}
          onDelete={handleDeleteJob} />
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-gray-300 dark:text-zinc-700">
          <div className="text-center space-y-3">
            <Briefcase size={48} className="mx-auto opacity-30"/>
            <p className="text-sm font-medium">Select a job to view details</p>
            <button onClick={() => setJobForm({ open: true, target: null })}
              className="flex items-center gap-1.5 mx-auto px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors">
              <Plus size={14}/> Post a New Job
            </button>
          </div>
        </div>
      )}

      {/* Job form dialog */}
      {jobForm.open && (
        <JobFormDialog initial={jobForm.target}
          onClose={() => setJobForm({ open: false, target: null })}
          onSave={handleSaveJob} />
      )}
    </div>
  );
}
