import { useState, useMemo, useCallback } from "react";
import { useStaff } from "@/hooks/use-data";
import { useAttendance } from "@/hooks/use-data";
import {
  AttendanceStatus, ATTENDANCE_STATUSES, AttendanceRecord,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CalendarCheck2, Download, ChevronLeft, ChevronRight,
  Users, UserCheck, UserX, Clock, AlarmClock, RefreshCw, Save,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    month: "long", year: "numeric",
  });
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function ymFromDate(d: string) {
  return d.slice(0, 7);
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  Present:    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300",
  Absent:     "bg-red-100    text-red-800    border-red-300    dark:bg-red-900/40    dark:text-red-300",
  Late:       "bg-amber-100  text-amber-800  border-amber-300  dark:bg-amber-900/40  dark:text-amber-300",
  "Half Day": "bg-blue-100   text-blue-800   border-blue-300   dark:bg-blue-900/40   dark:text-blue-300",
  Leave:      "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300",
  Off:        "bg-slate-100  text-slate-700  border-slate-300  dark:bg-slate-800      dark:text-slate-300",
};

const STATUS_ACTIVE_COLORS: Record<AttendanceStatus, string> = {
  Present:    "bg-emerald-500 text-white border-emerald-500 shadow-emerald-200 shadow-md",
  Absent:     "bg-red-500    text-white border-red-500    shadow-red-200    shadow-md",
  Late:       "bg-amber-500  text-white border-amber-500  shadow-amber-200  shadow-md",
  "Half Day": "bg-blue-500   text-white border-blue-500   shadow-blue-200   shadow-md",
  Leave:      "bg-purple-500 text-white border-purple-500 shadow-purple-200 shadow-md",
  Off:        "bg-slate-500  text-white border-slate-500  shadow-slate-200  shadow-md",
};

const STATUS_SHORT: Record<AttendanceStatus, string> = {
  Present: "P", Absent: "A", Late: "L", "Half Day": "H", Leave: "V", Off: "O",
};

const CYCLE: AttendanceStatus[] = ["Present", "Absent", "Late", "Half Day", "Leave", "Off"];
function nextStatus(s: AttendanceStatus | undefined): AttendanceStatus {
  if (!s) return "Present";
  const i = CYCLE.indexOf(s);
  return CYCLE[(i + 1) % CYCLE.length];
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, iconBg, valueColor }: {
  icon: React.ElementType;
  label: string;
  value: number;
  iconBg: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card px-5 py-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`p-3 rounded-xl shrink-0 ${iconBg}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted-foreground leading-none mb-1.5">{label}</p>
        <p className={`text-4xl font-black leading-none tracking-tight ${valueColor ?? ""}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Status badge (small) ────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: AttendanceStatus }) {
  if (!status) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type ViewMode = "daily" | "monthly";

export default function AttendancePage() {
  const { staff: allStaff } = useStaff();
  const { records, upsert, bulkUpsert } = useAttendance();

  const [viewMode, setViewMode]         = useState<ViewMode>("daily");
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));

  const [draft, setDraft]               = useState<Record<string, AttendanceStatus>>({});
  const [draftCheckIn, setDraftCheckIn]   = useState<Record<string, string>>({});
  const [draftCheckOut, setDraftCheckOut] = useState<Record<string, string>>({});
  const [draftNotes, setDraftNotes]       = useState<Record<string, string>>({});

  const [filterStaff,  setFilterStaff]  = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const activeStaff = useMemo(
    () => allStaff.filter(s => s.status !== "Terminated"),
    [allStaff],
  );

  const dateRecords = useMemo(
    () => records.filter(r => r.date === selectedDate),
    [records, selectedDate],
  );

  const recordByStaff = useMemo(() => {
    const m: Record<string, AttendanceRecord> = {};
    dateRecords.forEach(r => { m[r.staffId] = r; });
    return m;
  }, [dateRecords]);

  const initDraft = useCallback(() => {
    const d: Record<string, AttendanceStatus> = {};
    const ci: Record<string, string> = {};
    const co: Record<string, string> = {};
    const n: Record<string, string> = {};
    activeStaff.forEach(s => {
      const r = recordByStaff[s.id];
      if (r) {
        d[s.id]  = r.status;
        ci[s.id] = r.checkIn  ?? "";
        co[s.id] = r.checkOut ?? "";
        n[s.id]  = r.notes    ?? "";
      }
    });
    setDraft(d);
    setDraftCheckIn(ci);
    setDraftCheckOut(co);
    setDraftNotes(n);
  }, [activeStaff, recordByStaff]);

  const kpis = useMemo(() => {
    const all = dateRecords;
    return {
      total:    activeStaff.length,
      present:  all.filter(r => r.status === "Present").length,
      absent:   all.filter(r => r.status === "Absent").length,
      late:     all.filter(r => r.status === "Late").length,
      halfDay:  all.filter(r => r.status === "Half Day").length,
      leave:    all.filter(r => r.status === "Leave").length,
      unmarked: activeStaff.length - all.length,
    };
  }, [dateRecords, activeStaff]);

  const monthDays = useMemo(() => daysInMonth(selectedMonth), [selectedMonth]);
  const monthRecords = useMemo(
    () => records.filter(r => ymFromDate(r.date) === selectedMonth),
    [records, selectedMonth],
  );

  function markAll(status: AttendanceStatus) {
    const next: Record<string, AttendanceStatus> = {};
    activeStaff.forEach(s => { next[s.id] = status; });
    setDraft(prev => ({ ...prev, ...next }));
  }

  function saveBulk() {
    const rows = activeStaff
      .filter(s => draft[s.id])
      .map(s => ({
        staffId:    s.id,
        staffName:  s.name,
        department: s.department,
        date:       selectedDate,
        status:     draft[s.id],
        checkIn:    draftCheckIn[s.id]  || undefined,
        checkOut:   draftCheckOut[s.id] || undefined,
        notes:      draftNotes[s.id]    || undefined,
      }));
    bulkUpsert(rows);
  }

  function saveOne(staffId: string, staffName: string, department: string) {
    if (!draft[staffId]) return;
    upsert({
      staffId, staffName, department,
      date:     selectedDate,
      status:   draft[staffId],
      checkIn:  draftCheckIn[staffId]  || undefined,
      checkOut: draftCheckOut[staffId] || undefined,
      notes:    draftNotes[staffId]    || undefined,
    });
  }

  function exportCSV() {
    const rows = activeStaff.map(s => {
      const r = recordByStaff[s.id];
      return [s.name, s.department, selectedDate, r?.status ?? "Unmarked", r?.checkIn ?? "", r?.checkOut ?? "", r?.notes ?? ""].join(",");
    });
    const csv = ["Name,Department,Date,Status,Check-In,Check-Out,Notes", ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `attendance-${selectedDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportMonthlyCSV() {
    const header = ["Name", "Department", ...Array.from({ length: monthDays }, (_, i) => `${i + 1}`)].join(",");
    const rows = activeStaff.map(s => {
      const days = Array.from({ length: monthDays }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        const date = `${selectedMonth}-${day}`;
        const r = monthRecords.find(x => x.staffId === s.id && x.date === date);
        return r ? STATUS_SHORT[r.status] : "";
      });
      return [s.name, s.department, ...days].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `attendance-${selectedMonth}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const filteredMonthlyStaff = useMemo(() => {
    let s = activeStaff;
    if (filterStaff !== "all") s = s.filter(x => x.id === filterStaff);
    if (filterStatus !== "all") {
      s = s.filter(x =>
        monthRecords.some(r => r.staffId === x.id && r.status === filterStatus)
      );
    }
    return s;
  }, [activeStaff, filterStaff, filterStatus, monthRecords]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-screen-2xl mx-auto">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/10">
            <CalendarCheck2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Attendance</h1>
            <p className="text-[14px] text-muted-foreground mt-0.5">Track & manage daily staff attendance</p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex rounded-xl border overflow-hidden shadow-sm">
          <button
            onClick={() => setViewMode("daily")}
            className={`px-5 py-2 text-[13px] font-semibold transition-colors ${
              viewMode === "daily"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground"
            }`}
          >
            Daily Bulk
          </button>
          <button
            onClick={() => setViewMode("monthly")}
            className={`px-5 py-2 text-[13px] font-semibold transition-colors ${
              viewMode === "monthly"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground"
            }`}
          >
            Monthly Report
          </button>
        </div>
      </div>

      {/* ══ DAILY VIEW ══════════════════════════════════════════════════════ */}
      {viewMode === "daily" && (
        <>
          {/* ── Date navigator bar ── */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-5 py-3 shadow-sm">
            <button
              className="p-2 rounded-xl border hover:bg-muted transition-colors"
              onClick={() => {
                const d = new Date(selectedDate); d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().slice(0, 10)); setDraft({});
              }}
            ><ChevronLeft className="h-5 w-5" /></button>

            <Input
              type="date"
              value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); setDraft({}); }}
              className="w-44 h-10 text-[15px] font-medium"
            />

            <button
              className="p-2 rounded-xl border hover:bg-muted transition-colors"
              onClick={() => {
                const d = new Date(selectedDate); d.setDate(d.getDate() + 1);
                setSelectedDate(d.toISOString().slice(0, 10)); setDraft({});
              }}
            ><ChevronRight className="h-5 w-5" /></button>

            <span className="text-[15px] font-semibold text-foreground">{fmtDate(selectedDate)}</span>

            <div className="flex-1" />

            <Button variant="outline" size="default" onClick={initDraft} className="gap-2 font-semibold">
              <RefreshCw className="h-4 w-4" /> Load Saved
            </Button>
            <Button variant="outline" size="default" onClick={exportCSV} className="gap-2 font-semibold">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>

          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={Users}        label="Total Staff" value={kpis.total}    iconBg="bg-slate-100   text-slate-600   dark:bg-slate-800   dark:text-slate-300" />
            <KpiCard icon={UserCheck}    label="Present"     value={kpis.present}  iconBg="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" valueColor="text-emerald-600 dark:text-emerald-400" />
            <KpiCard icon={UserX}        label="Absent"      value={kpis.absent}   iconBg="bg-red-100     text-red-600     dark:bg-red-900/40     dark:text-red-400"     valueColor="text-red-600 dark:text-red-400" />
            <KpiCard icon={AlarmClock}   label="Late"        value={kpis.late}     iconBg="bg-amber-100   text-amber-600   dark:bg-amber-900/40   dark:text-amber-400"   valueColor="text-amber-600 dark:text-amber-400" />
            <KpiCard icon={Clock}        label="Half Day"    value={kpis.halfDay}  iconBg="bg-blue-100    text-blue-600    dark:bg-blue-900/40    dark:text-blue-400"    valueColor="text-blue-600 dark:text-blue-400" />
            <KpiCard icon={CalendarCheck2} label="Unmarked"  value={kpis.unmarked} iconBg="bg-gray-100    text-gray-500    dark:bg-gray-800        dark:text-gray-400"   valueColor="text-gray-500 dark:text-gray-400" />
          </div>

          {/* ── Quick mark-all + Save All ── */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-5 py-3.5 shadow-sm">
            <span className="text-[14px] font-bold text-foreground mr-1">Mark all as:</span>
            {ATTENDANCE_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => markAll(s)}
                className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-all hover:scale-105 active:scale-95 ${STATUS_COLORS[s]}`}
              >{s}</button>
            ))}
            <div className="flex-1" />
            <Button
              size="default"
              onClick={saveBulk}
              disabled={Object.keys(draft).length === 0}
              className="gap-2 font-bold px-6 h-10 text-[14px]"
            >
              <Save className="h-4 w-4" /> Save All
            </Button>
          </div>

          {/* ── Staff table ── */}
          {activeStaff.length === 0 ? (
            <div className="rounded-2xl border bg-card p-16 text-center text-muted-foreground text-[15px]">
              No active staff members found. Add staff in the Staff module first.
            </div>
          ) : (
            <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[200px] text-[13px] font-bold text-foreground py-4">Name</TableHead>
                    <TableHead className="text-[13px] font-bold text-foreground">Department</TableHead>
                    <TableHead className="text-[13px] font-bold text-foreground">Status</TableHead>
                    <TableHead className="w-[120px] text-[13px] font-bold text-foreground">Check-In</TableHead>
                    <TableHead className="w-[120px] text-[13px] font-bold text-foreground">Check-Out</TableHead>
                    <TableHead className="text-[13px] font-bold text-foreground">Notes</TableHead>
                    <TableHead className="w-[80px] text-right text-[13px] font-bold text-foreground">Save</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeStaff.map(s => {
                    const saved = recordByStaff[s.id];
                    const cur   = draft[s.id];
                    return (
                      <TableRow key={s.id} className={`${cur ? "" : "opacity-60"} hover:opacity-100 transition-opacity`}>
                        <TableCell className="font-bold text-[14px] py-3.5">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground text-[13px] font-medium">{s.department || "—"}</TableCell>

                        {/* Status buttons */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            {ATTENDANCE_STATUSES.map(st => (
                              <button
                                key={st}
                                onClick={() => setDraft(prev => ({ ...prev, [s.id]: st }))}
                                className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-all hover:scale-105 active:scale-95
                                  ${cur === st
                                    ? STATUS_ACTIVE_COLORS[st]
                                    : "border-border bg-muted/40 hover:bg-muted text-muted-foreground"
                                  }`}
                              >{st}</button>
                            ))}
                            {!cur && saved && (
                              <span className="ml-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                                saved: <StatusBadge status={saved.status} />
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Input
                            type="time"
                            value={draftCheckIn[s.id] ?? ""}
                            onChange={e => setDraftCheckIn(prev => ({ ...prev, [s.id]: e.target.value }))}
                            className="h-9 text-[13px] w-28 font-medium"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="time"
                            value={draftCheckOut[s.id] ?? ""}
                            onChange={e => setDraftCheckOut(prev => ({ ...prev, [s.id]: e.target.value }))}
                            className="h-9 text-[13px] w-28 font-medium"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={draftNotes[s.id] ?? ""}
                            onChange={e => setDraftNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                            placeholder="Optional note"
                            className="h-9 text-[13px] font-medium"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={cur ? "default" : "outline"}
                            onClick={() => saveOne(s.id, s.name, s.department)}
                            disabled={!draft[s.id]}
                            className="h-9 px-3"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* ══ MONTHLY VIEW ════════════════════════════════════════════════════ */}
      {viewMode === "monthly" && (
        <>
          {/* Month navigator + filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-5 py-3 shadow-sm">
            <button
              className="p-2 rounded-xl border hover:bg-muted transition-colors"
              onClick={() => {
                const [y, m] = selectedMonth.split("-").map(Number);
                const d = new Date(y, m - 2, 1);
                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
            ><ChevronLeft className="h-5 w-5" /></button>

            <Input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-44 h-10 text-[15px] font-medium"
            />

            <button
              className="p-2 rounded-xl border hover:bg-muted transition-colors"
              onClick={() => {
                const [y, m] = selectedMonth.split("-").map(Number);
                const d = new Date(y, m, 1);
                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
            ><ChevronRight className="h-5 w-5" /></button>

            <span className="text-[16px] font-bold text-foreground">{monthLabel(selectedMonth)}</span>

            <div className="flex-1" />

            <Select value={filterStaff} onValueChange={setFilterStaff}>
              <SelectTrigger className="w-44 h-10 text-[13px] font-medium">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {activeStaff.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 h-10 text-[13px] font-medium">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ATTENDANCE_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="default" onClick={exportMonthlyCSV} className="gap-2 font-semibold">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {ATTENDANCE_STATUSES.map(s => (
              <span key={s} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${STATUS_COLORS[s]}`}>
                {STATUS_SHORT[s]} — {s}
              </span>
            ))}
            <span className="rounded-full border px-3 py-1 text-[12px] font-semibold text-muted-foreground">— Unmarked</span>
          </div>

          {/* Monthly calendar table */}
          <div className="rounded-2xl border bg-card shadow-sm overflow-auto">
            <table className="text-[13px] min-w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 bg-muted/40 z-10 px-4 py-3.5 text-left font-bold text-[13px] min-w-[150px] border-r">
                    Name
                  </th>
                  <th className="sticky left-[150px] bg-muted/40 z-10 px-4 py-3.5 text-left font-bold text-[13px] min-w-[120px] border-r">
                    Department
                  </th>
                  {Array.from({ length: monthDays }, (_, i) => {
                    const day = i + 1;
                    const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
                    const dow = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" });
                    const isWeekend = ["Sat", "Sun"].includes(dow);
                    return (
                      <th key={i} className={`px-1 py-2 text-center font-semibold min-w-[38px] ${isWeekend ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                        <div className="text-[13px]">{day}</div>
                        <div className="text-[11px] text-muted-foreground font-normal">{dow.slice(0, 1)}</div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-3.5 text-center min-w-[44px] bg-muted/40 border-l font-bold text-emerald-700 dark:text-emerald-400">P</th>
                  <th className="px-3 py-3.5 text-center min-w-[44px] bg-muted/40 font-bold text-red-700 dark:text-red-400">A</th>
                  <th className="px-3 py-3.5 text-center min-w-[44px] bg-muted/40 font-bold text-amber-700 dark:text-amber-400">L</th>
                </tr>
              </thead>
              <tbody>
                {filteredMonthlyStaff.map(s => {
                  const staffRecs = monthRecords.filter(r => r.staffId === s.id);
                  const count = {
                    P: staffRecs.filter(r => r.status === "Present").length,
                    A: staffRecs.filter(r => r.status === "Absent").length,
                    L: staffRecs.filter(r => r.status === "Late" || r.status === "Half Day" || r.status === "Leave").length,
                  };
                  return (
                    <tr key={s.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="sticky left-0 bg-card z-10 px-4 py-3 font-bold text-[13px] border-r truncate max-w-[150px]">
                        {s.name}
                      </td>
                      <td className="sticky left-[150px] bg-card z-10 px-4 py-3 text-[13px] text-muted-foreground font-medium border-r truncate max-w-[120px]">
                        {s.department || "—"}
                      </td>
                      {Array.from({ length: monthDays }, (_, i) => {
                        const day = i + 1;
                        const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
                        const dow = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" });
                        const isWeekend = ["Sat", "Sun"].includes(dow);
                        const rec = staffRecs.find(r => r.date === date);
                        return (
                          <td
                            key={i}
                            title={rec ? `${rec.status}${rec.checkIn ? ` | In: ${rec.checkIn}` : ""}${rec.notes ? ` | ${rec.notes}` : ""}` : "Unmarked"}
                            className={`px-1 py-2.5 text-center align-middle ${isWeekend ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                          >
                            {rec ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-black ${STATUS_COLORS[rec.status]}`}>
                                {STATUS_SHORT[rec.status]}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 text-lg">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center font-black text-[14px] text-emerald-700 dark:text-emerald-400 border-l">{count.P}</td>
                      <td className="px-3 py-3 text-center font-black text-[14px] text-red-700 dark:text-red-400">{count.A}</td>
                      <td className="px-3 py-3 text-center font-black text-[14px] text-amber-700 dark:text-amber-400">{count.L}</td>
                    </tr>
                  );
                })}
                {filteredMonthlyStaff.length === 0 && (
                  <tr>
                    <td colSpan={monthDays + 5} className="text-center py-12 text-[14px] text-muted-foreground">
                      No records found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Monthly summary KPIs */}
          {(() => {
            const p  = monthRecords.filter(r => r.status === "Present").length;
            const a  = monthRecords.filter(r => r.status === "Absent").length;
            const l  = monthRecords.filter(r => r.status === "Late").length;
            const h  = monthRecords.filter(r => r.status === "Half Day").length;
            const v  = monthRecords.filter(r => r.status === "Leave").length;
            const total = monthRecords.length;
            const pct = total > 0 ? Math.round((p / total) * 100) : 0;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard icon={UserCheck}    label="Present"         value={p}   iconBg="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" valueColor="text-emerald-600 dark:text-emerald-400" />
                <KpiCard icon={UserX}        label="Absent"          value={a}   iconBg="bg-red-100     text-red-600     dark:bg-red-900/40     dark:text-red-400"     valueColor="text-red-600 dark:text-red-400" />
                <KpiCard icon={AlarmClock}   label="Late"            value={l}   iconBg="bg-amber-100   text-amber-600   dark:bg-amber-900/40   dark:text-amber-400"   valueColor="text-amber-600 dark:text-amber-400" />
                <KpiCard icon={Clock}        label="Half Day"        value={h}   iconBg="bg-blue-100    text-blue-600    dark:bg-blue-900/40    dark:text-blue-400"    valueColor="text-blue-600 dark:text-blue-400" />
                <KpiCard icon={CalendarCheck2} label="Leave"         value={v}   iconBg="bg-purple-100  text-purple-600  dark:bg-purple-900/40  dark:text-purple-400"  valueColor="text-purple-600 dark:text-purple-400" />
                <div className="rounded-2xl border bg-card px-5 py-4 flex items-center gap-4 shadow-sm">
                  <div className="p-3 rounded-xl bg-primary/10 shrink-0">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-muted-foreground leading-none mb-1.5">Attendance Rate</p>
                    <p className="text-4xl font-black leading-none tracking-tight text-primary">{pct}%</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
