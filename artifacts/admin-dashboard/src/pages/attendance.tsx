import { useState, useMemo, useCallback } from "react";
import { useStaff } from "@/hooks/use-data";
import { useAttendance } from "@/hooks/use-data";
import {
  AttendanceStatus, ATTENDANCE_STATUSES, AttendanceRecord,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
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
};

const STATUS_SHORT: Record<AttendanceStatus, string> = {
  Present: "P", Absent: "A", Late: "L", "Half Day": "H", Leave: "V",
};

const CYCLE: AttendanceStatus[] = ["Present", "Absent", "Late", "Half Day", "Leave"];
function nextStatus(s: AttendanceStatus | undefined): AttendanceStatus {
  if (!s) return "Present";
  const i = CYCLE.indexOf(s);
  return CYCLE[(i + 1) % CYCLE.length];
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3 shadow-sm">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

// ─── Status badge (small) ────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: AttendanceStatus }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type ViewMode = "daily" | "monthly";

export default function AttendancePage() {
  const { staff: allStaff } = useStaff();
  const { records, upsert, bulkUpsert } = useAttendance();

  const [viewMode, setViewMode]     = useState<ViewMode>("daily");
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedMonth, setSelectedMonth] = useState(today().slice(0, 7));

  // bulk draft — local state before save
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [draftCheckIn, setDraftCheckIn]   = useState<Record<string, string>>({});
  const [draftCheckOut, setDraftCheckOut] = useState<Record<string, string>>({});
  const [draftNotes, setDraftNotes]       = useState<Record<string, string>>({});

  // filters for monthly table
  const [filterStaff,  setFilterStaff]  = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // active (non-terminated) staff
  const activeStaff = useMemo(
    () => allStaff.filter(s => s.status !== "Terminated"),
    [allStaff],
  );

  // lookup records for selected date
  const dateRecords = useMemo(
    () => records.filter(r => r.date === selectedDate),
    [records, selectedDate],
  );

  const recordByStaff = useMemo(() => {
    const m: Record<string, AttendanceRecord> = {};
    dateRecords.forEach(r => { m[r.staffId] = r; });
    return m;
  }, [dateRecords]);

  // initialise draft from saved records when date changes
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

  // KPIs for selected date
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

  // monthly view data
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

  // ── filtered monthly staff ──
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <CalendarCheck2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Attendance Management</h1>
            <p className="text-sm text-muted-foreground">Track & manage daily staff attendance</p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode("daily")}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === "daily" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Daily Bulk
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === "monthly" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Monthly Report
            </button>
          </div>
        </div>
      </div>

      {/* ── DAILY VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === "daily" && (
        <>
          {/* Date navigator */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="p-1.5 rounded border hover:bg-muted"
              onClick={() => {
                const d = new Date(selectedDate); d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().slice(0, 10)); setDraft({});
              }}
            ><ChevronLeft className="h-4 w-4" /></button>

            <Input
              type="date"
              value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); setDraft({}); }}
              className="w-44"
            />

            <button
              className="p-1.5 rounded border hover:bg-muted"
              onClick={() => {
                const d = new Date(selectedDate); d.setDate(d.getDate() + 1);
                setSelectedDate(d.toISOString().slice(0, 10)); setDraft({});
              }}
            ><ChevronRight className="h-4 w-4" /></button>

            <span className="text-sm text-muted-foreground">{fmtDate(selectedDate)}</span>

            <div className="flex-1" />

            <Button variant="outline" size="sm" onClick={initDraft}>
              <RefreshCw className="h-4 w-4 mr-1" /> Load Saved
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={Users}       label="Total Staff"  value={kpis.total}    color="bg-slate-100   text-slate-700   dark:bg-slate-800   dark:text-slate-300" />
            <KpiCard icon={UserCheck}   label="Present"      value={kpis.present}  color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" />
            <KpiCard icon={UserX}       label="Absent"       value={kpis.absent}   color="bg-red-100     text-red-700     dark:bg-red-900/40     dark:text-red-400" />
            <KpiCard icon={AlarmClock}  label="Late"         value={kpis.late}     color="bg-amber-100   text-amber-700   dark:bg-amber-900/40   dark:text-amber-400" />
            <KpiCard icon={Clock}       label="Half Day"     value={kpis.halfDay}  color="bg-blue-100    text-blue-700    dark:bg-blue-900/40    dark:text-blue-400" />
            <KpiCard icon={CalendarCheck2} label="Unmarked"  value={kpis.unmarked} color="bg-gray-100    text-gray-700    dark:bg-gray-800        dark:text-gray-400" />
          </div>

          {/* Quick mark all + save all */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground mr-1">Mark all as:</span>
            {ATTENDANCE_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => markAll(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all hover:opacity-80 ${STATUS_COLORS[s]}`}
              >{s}</button>
            ))}
            <div className="flex-1" />
            <Button onClick={saveBulk} disabled={Object.keys(draft).length === 0}>
              <Save className="h-4 w-4 mr-1.5" /> Save All
            </Button>
          </div>

          {/* Bulk grid */}
          {activeStaff.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
              No active staff members found. Add staff in the Staff module first.
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Check-In</TableHead>
                    <TableHead className="w-[100px]">Check-Out</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[80px] text-right">Save</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeStaff.map(s => {
                    const saved = recordByStaff[s.id];
                    const cur   = draft[s.id];
                    return (
                      <TableRow key={s.id} className={cur ? "" : "opacity-70"}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.department || "—"}</TableCell>

                        {/* Status cycle buttons */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {ATTENDANCE_STATUSES.map(st => (
                              <button
                                key={st}
                                onClick={() => setDraft(prev => ({ ...prev, [s.id]: st }))}
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all
                                  ${cur === st
                                    ? `${STATUS_COLORS[st]} ring-2 ring-offset-1 ring-current`
                                    : "border-border bg-muted/40 hover:bg-muted text-muted-foreground"
                                  }`}
                              >{st}</button>
                            ))}
                            {!cur && saved && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (saved: <StatusBadge status={saved.status} />)
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Input
                            type="time"
                            value={draftCheckIn[s.id] ?? ""}
                            onChange={e => setDraftCheckIn(prev => ({ ...prev, [s.id]: e.target.value }))}
                            className="h-7 text-xs w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="time"
                            value={draftCheckOut[s.id] ?? ""}
                            onChange={e => setDraftCheckOut(prev => ({ ...prev, [s.id]: e.target.value }))}
                            className="h-7 text-xs w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={draftNotes[s.id] ?? ""}
                            onChange={e => setDraftNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                            placeholder="Optional note"
                            className="h-7 text-xs"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveOne(s.id, s.name, s.department)}
                            disabled={!draft[s.id]}
                            className="h-7 px-2 text-xs"
                          >
                            <Save className="h-3 w-3" />
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

      {/* ── MONTHLY VIEW ───────────────────────────────────────────────────── */}
      {viewMode === "monthly" && (
        <>
          {/* Month navigator + filters */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="p-1.5 rounded border hover:bg-muted"
              onClick={() => {
                const [y, m] = selectedMonth.split("-").map(Number);
                const d = new Date(y, m - 2, 1);
                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
            ><ChevronLeft className="h-4 w-4" /></button>

            <Input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-44"
            />

            <button
              className="p-1.5 rounded border hover:bg-muted"
              onClick={() => {
                const [y, m] = selectedMonth.split("-").map(Number);
                const d = new Date(y, m, 1);
                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
            ><ChevronRight className="h-4 w-4" /></button>

            <span className="text-sm font-medium">{monthLabel(selectedMonth)}</span>

            <div className="flex-1" />

            {/* Staff filter */}
            <Select value={filterStaff} onValueChange={setFilterStaff}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {activeStaff.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ATTENDANCE_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={exportMonthlyCSV}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 text-xs">
            {ATTENDANCE_STATUSES.map(s => (
              <span key={s} className={`rounded-full border px-2.5 py-0.5 font-medium ${STATUS_COLORS[s]}`}>
                {STATUS_SHORT[s]} — {s}
              </span>
            ))}
            <span className="rounded-full border px-2.5 py-0.5 text-muted-foreground">— Unmarked</span>
          </div>

          {/* Monthly calendar table */}
          <div className="rounded-xl border bg-card shadow-sm overflow-auto">
            <table className="text-xs min-w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 bg-card z-10 p-2 text-left font-semibold min-w-[140px] border-r">
                    Name
                  </th>
                  <th className="sticky left-[140px] bg-card z-10 p-2 text-left font-semibold min-w-[110px] border-r">
                    Department
                  </th>
                  {Array.from({ length: monthDays }, (_, i) => {
                    const day = i + 1;
                    const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
                    const dow = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" });
                    const isWeekend = ["Sat", "Sun"].includes(dow);
                    return (
                      <th key={i} className={`p-1 text-center font-medium min-w-[36px] ${isWeekend ? "bg-muted/40" : ""}`}>
                        <div>{day}</div>
                        <div className="text-muted-foreground font-normal">{dow.slice(0, 1)}</div>
                      </th>
                    );
                  })}
                  <th className="p-2 text-center min-w-[44px] bg-card border-l font-semibold">P</th>
                  <th className="p-2 text-center min-w-[44px] bg-card font-semibold">A</th>
                  <th className="p-2 text-center min-w-[44px] bg-card font-semibold">L</th>
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
                      <td className="sticky left-0 bg-card z-10 p-2 font-medium border-r truncate max-w-[140px]">
                        {s.name}
                      </td>
                      <td className="sticky left-[140px] bg-card z-10 p-2 text-muted-foreground border-r truncate max-w-[110px]">
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
                            className={`p-1 text-center align-middle ${isWeekend ? "bg-muted/40" : ""}`}
                          >
                            {rec ? (
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${STATUS_COLORS[rec.status]}`}>
                                {STATUS_SHORT[rec.status]}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-semibold text-emerald-700 dark:text-emerald-400 border-l">{count.P}</td>
                      <td className="p-2 text-center font-semibold text-red-700 dark:text-red-400">{count.A}</td>
                      <td className="p-2 text-center font-semibold text-amber-700 dark:text-amber-400">{count.L}</td>
                    </tr>
                  );
                })}
                {filteredMonthlyStaff.length === 0 && (
                  <tr>
                    <td colSpan={monthDays + 5} className="text-center py-8 text-muted-foreground">
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
                <KpiCard icon={UserCheck}    label="Present"    value={p}   color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" />
                <KpiCard icon={UserX}        label="Absent"     value={a}   color="bg-red-100     text-red-700     dark:bg-red-900/40     dark:text-red-400" />
                <KpiCard icon={AlarmClock}   label="Late"       value={l}   color="bg-amber-100   text-amber-700   dark:bg-amber-900/40   dark:text-amber-400" />
                <KpiCard icon={Clock}        label="Half Day"   value={h}   color="bg-blue-100    text-blue-700    dark:bg-blue-900/40    dark:text-blue-400" />
                <KpiCard icon={CalendarCheck2} label="Leave"    value={v}   color="bg-purple-100  text-purple-700  dark:bg-purple-900/40  dark:text-purple-400" />
                <div className="rounded-xl border bg-card p-4 flex items-center gap-3 shadow-sm">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Attendance Rate</p>
                    <p className="text-2xl font-bold">{pct}%</p>
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
