import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useShareholders } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Shareholder } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Trash2, X, Save, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EditableCell, ExcelGridShell, ColDef, CELL_H, NEW_ROW_BG } from "@/components/editable-cell";

type EditableField = "shareholderId" | "name" | "email" | "phone" | "city" | "address";

const BLANK = (): Record<EditableField, string> => ({
  shareholderId: "", name: "", email: "", phone: "", city: "", address: "",
});

const COLS: ColDef[] = [
  { field: "shareholderId", label: "Shareholder ID", minW: 150, type: "text"  },
  { field: "name",          label: "Full Name",       minW: 200, type: "text"  },
  { field: "email",         label: "Email",           minW: 200, type: "email" },
  { field: "phone",         label: "Phone",           minW: 150, type: "tel"   },
  { field: "city",          label: "City",            minW: 140, type: "text"  },
  { field: "address",       label: "Address",         minW: 280, type: "text"  },
];

const TOTAL_W = COLS.reduce((a, c) => a + c.minW, 0);

const CSV_HEADERS = ["shareholderId", "name", "email", "phone", "city", "address"] as const;

function downloadTemplate() {
  const sample = [
    ["SH-001", "Ahmed Raza",   "ahmed.raza@example.com",    "+92 300 1234567", "Islamabad", "House 12, Street 4, F-8, Islamabad"],
    ["SH-002", "Sarah Khalid", "sarah.khalid@example.com",  "+44 7700 111222", "Hull",      "42 Victoria Street, Hull, HU1 2PZ"],
  ];
  const rows = [
    CSV_HEADERS.join(","),
    ...sample.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "shareholders-import-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

type ImportRow = Record<EditableField, string> & { _rowNum: number; _error?: string };

function parseCSV(text: string): ImportRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };

  const headerRow = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_]/g, ""));
  const colMap = {} as Record<EditableField, number>;
  const ALIASES: Record<EditableField, string[]> = {
    shareholderId: ["shareholderid", "id", "shid", "shareholder_id"],
    name:          ["name", "fullname", "shareholdername"],
    email:         ["email", "emailaddress"],
    phone:         ["phone", "phonenumber", "mobile", "contact"],
    city:          ["city", "town"],
    address:       ["address", "fulladdress", "streetaddress"],
  };
  (Object.keys(ALIASES) as EditableField[]).forEach(f => {
    const idx = headerRow.findIndex(h => ALIASES[f].includes(h));
    colMap[f] = idx;
  });

  return lines.slice(1).map((line, i) => {
    const cells = parseLine(line);
    const row: ImportRow = { _rowNum: i + 2, shareholderId: "", name: "", email: "", phone: "", city: "", address: "" };
    (Object.keys(colMap) as EditableField[]).forEach(f => {
      const ci = colMap[f];
      row[f] = ci >= 0 && cells[ci] !== undefined ? cells[ci] : "";
    });
    if (!row.name.trim()) row._error = "Name is required";
    return row;
  });
}

const NEW_ROW_ID = "__new__";

export default function ShareholdersPage() {
  const { shareholders, addShareholder, editShareholder, removeShareholder } = useShareholders();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [activeCell,   setActiveCell]   = useState<{ id: string; col: number } | null>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [newRow,       setNewRow]       = useState<Record<EditableField, string> | null>(null);
  const [newRowActive, setNewRowActive] = useState<number | null>(null);

  const [importOpen,  setImportOpen]  = useState(false);
  const [importRows,  setImportRows]  = useState<ImportRow[]>([]);
  const [importing,   setImporting]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setImportRows(parseCSV(ev.target?.result as string));
      setImportOpen(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmImport = () => {
    setImporting(true);
    const valid = importRows.filter(r => !r._error);
    let dupes = 0;
    valid.forEach(r => {
      const emailNorm = r.email.toLowerCase().trim();
      const phoneNorm = r.phone.replace(/\D/g, "");
      const isDupe = shareholders.some(s => {
        if (emailNorm && s.email.toLowerCase() === emailNorm) return true;
        if (phoneNorm.length >= 7 && s.phone.replace(/\D/g, "") === phoneNorm) return true;
        return false;
      });
      if (isDupe) { dupes++; return; }
      addShareholder({ shareholderId: r.shareholderId, name: r.name, email: r.email, phone: r.phone, city: r.city, address: r.address });
    });
    const imported = valid.length - dupes;
    toast({
      title: `${imported} shareholder${imported !== 1 ? "s" : ""} imported`,
      description: [
        importRows.length > valid.length ? `${importRows.length - valid.length} row(s) had errors.` : "",
        dupes > 0 ? `${dupes} duplicate(s) skipped.` : "",
      ].filter(Boolean).join(" ") || undefined,
    });
    setImportOpen(false); setImportRows([]); setImporting(false);
  };

  const filtered = useMemo(() => shareholders
    .filter(s => !search || [s.shareholderId, s.name, s.email, s.phone, s.city, s.address]
      .some(v => v?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  [shareholders, search]);

  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const commitCell = useCallback((id: string, field: EditableField, value: string) => {
    const s = shareholders.find(sh => sh.id === id);
    if (!s || (s as unknown as Record<string, string>)[field] === value) { setActiveCell(null); return; }
    editShareholder(id, { [field]: value } as Partial<Shareholder>);
    setActiveCell(null);
    toast({ title: "Saved" });
  }, [shareholders, editShareholder, toast]);

  const navigateCell = useCallback((id: string, col: number, shift: boolean) => {
    const rows = [NEW_ROW_ID, ...filtered.map(s => s.id)];
    const ri = rows.indexOf(id);
    let nc = col + (shift ? -1 : 1), nr = ri;
    if (nc >= COLS.length) { nc = 0; nr++; }
    if (nc < 0) { nc = COLS.length - 1; nr--; }
    if (nr < 0 || nr >= rows.length) { setActiveCell(null); return; }
    setActiveCell({ id: rows[nr], col: nc });
  }, [filtered]);

  const moveCellDown = useCallback((id: string, col: number) => {
    const rows = filtered.map(s => s.id);
    const ri = rows.indexOf(id);
    if (ri + 1 < rows.length) setActiveCell({ id: rows[ri + 1], col });
  }, [filtered]);

  const navigateNewRow = (ci: number, shift: boolean) => {
    let nc = ci + (shift ? -1 : 1);
    if (nc >= COLS.length) { commitNewRow(); return; }
    if (nc < 0) { setNewRowActive(null); return; }
    setNewRowActive(nc);
  };

  const commitNewRow = () => {
    if (!newRow?.name.trim()) {
      toast({ title: "Full name is required", variant: "destructive" });
      setNewRowActive(1);
      return;
    }
    const emailNorm = newRow.email.toLowerCase().trim();
    const phoneNorm = newRow.phone.replace(/\D/g, "");
    const dupe = shareholders.find(s => {
      if (emailNorm && s.email.toLowerCase() === emailNorm) return true;
      if (phoneNorm.length >= 7 && s.phone.replace(/\D/g, "") === phoneNorm) return true;
      return false;
    });
    if (dupe) {
      toast({
        title: `Duplicate shareholder`,
        description: `A shareholder with the same ${emailNorm && dupe.email.toLowerCase() === emailNorm ? "email" : "phone"} already exists.`,
        variant: "destructive",
      });
      return;
    }
    addShareholder({ shareholderId: newRow.shareholderId, name: newRow.name, email: newRow.email, phone: newRow.phone, city: newRow.city, address: newRow.address });
    toast({ title: "Shareholder added", description: `"${newRow.name}" created.` });
    setNewRow(null); setNewRowActive(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const s = shareholders.find(sh => sh.id === deleteId);
    removeShareholder(deleteId);
    toast({ title: "Deleted", description: `"${s?.name}" removed.` });
    setDeleteId(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shareholders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Click any cell to edit · Tab to move · Enter to save · Esc to cancel</p>
        </div>
        {isAuthenticated && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1.5 h-8 text-[13px]" title="Download CSV template">
              <Download size={13} /> Template
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5 h-8 text-[13px]">
              <Upload size={13} /> Import CSV
            </Button>
            <Button size="sm" onClick={() => { setNewRow(BLANK()); setNewRowActive(0); }} className="gap-1.5 h-8 text-[13px]" data-testid="btn-add-shareholder">
              <Plus size={14} /> Add Shareholder
            </Button>
          </div>
        )}
      </div>

      {/* KPI pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[12px] font-medium">
          Total: <span className="font-bold">{shareholders.length}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search shareholders…"
            className="pl-8 h-8 text-[13px]"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-[12px]" onClick={() => setSearch("")}>
            <X size={12} /> Clear
          </Button>
        )}
        {isAuthenticated && newRow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">1 unsaved row</span>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={() => { setNewRow(null); setNewRowActive(null); }}><X size={12} /> Cancel</Button>
            <Button size="sm" className="h-8 gap-1 text-[12px]" onClick={commitNewRow}><Save size={12} /> Save Row</Button>
          </div>
        )}
        <div className="text-[12px] text-muted-foreground self-center ml-auto">{filtered.length} of {shareholders.length}</div>
      </div>

      {/* Grid */}
      <div ref={tableRef}>
        <ExcelGridShell cols={COLS} totalMinW={TOTAL_W}>

          {/* New row */}
          {isAuthenticated && newRow && (
            <tr className={`border-b border-gray-100 dark:border-border ${NEW_ROW_BG}`}>
              <td className="border-r border-gray-200 dark:border-border text-center text-[11px] text-amber-400 font-bold" style={{ height: `${CELL_H}px` }}>★</td>
              {COLS.map((c, ci) => {
                const isA = newRowActive === ci;
                const val = newRow[c.field as EditableField] ?? "";
                return (
                  <td key={c.field} className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : "hover:bg-amber-50 dark:hover:bg-amber-950/40"}`} style={{ height: `${CELL_H}px` }}>
                    {isA ? (
                      <input autoFocus type={c.type === "email" ? "email" : c.type === "tel" ? "tel" : "text"}
                        value={val} placeholder={c.label}
                        onChange={e => setNewRow(r => r ? { ...r, [c.field]: e.target.value } : r)}
                        onKeyDown={e => {
                          if (e.key === "Tab") { e.preventDefault(); navigateNewRow(ci, e.shiftKey); }
                          if (e.key === "Enter") { e.preventDefault(); ci === COLS.length - 1 ? commitNewRow() : navigateNewRow(ci, false); }
                          if (e.key === "Escape") { setNewRow(null); setNewRowActive(null); }
                        }}
                        className="absolute inset-0 w-full h-full px-3 text-[13px] bg-transparent border-0 outline-none dark:text-foreground placeholder:text-gray-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center px-3 cursor-text" onClick={() => setNewRowActive(ci)}>
                        <span className={`truncate ${!val ? "text-gray-300" : "text-gray-700 dark:text-foreground"}`}>{val || c.label}</span>
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="text-center sticky right-0 bg-amber-50/60 dark:bg-amber-950/20 border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px` }}>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={commitNewRow} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Save"><Save size={13} /></button>
                  <button onClick={() => { setNewRow(null); setNewRowActive(null); }} className="p-1 rounded text-red-400 hover:bg-red-50" title="Cancel"><X size={13} /></button>
                </div>
              </td>
            </tr>
          )}

          {/* Existing rows */}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={COLS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
                {search
                  ? "No shareholders match your search."
                  : <span>No shareholders yet. Click <strong>Add Shareholder</strong> to get started.</span>}
              </td>
            </tr>
          ) : filtered.map((s, ri) => {
            const isRowActive = activeCell?.id === s.id;
            return (
              <tr key={s.id} data-testid={`row-shareholder-${s.id}`}
                className={`border-b border-gray-100 dark:border-border transition-colors group ${isRowActive ? "bg-blue-50/30 dark:bg-blue-950/10" : ri % 2 === 0 ? "bg-white dark:bg-card" : "bg-gray-50/50 dark:bg-muted/10"} hover:bg-blue-50/20 dark:hover:bg-blue-950/10`}>
                <td className="border-r border-gray-100 dark:border-border text-center text-[11px] text-gray-300 dark:text-muted-foreground/50 font-mono select-none" style={{ height: `${CELL_H}px` }}>{ri + 1}</td>
                {COLS.map((c, ci) => {
                  const isA = activeCell?.id === s.id && activeCell.col === ci;
                  const rawVal = String((s as unknown as Record<string, string>)[c.field] ?? "");
                  return (
                    <td key={c.field}
                      className={`border-r border-gray-100 dark:border-border relative p-0 ${isA ? "ring-2 ring-inset ring-blue-500 bg-white dark:bg-card z-10" : isAuthenticated ? "hover:bg-blue-50/40 dark:hover:bg-blue-950/20" : ""}`}
                      style={{ height: `${CELL_H}px` }}
                      onClick={() => !isA && isAuthenticated && setActiveCell({ id: s.id, col: ci })}>
                      <EditableCell
                        value={rawVal} col={c} active={isA} canEdit={isAuthenticated}
                        onActivate={() => setActiveCell({ id: s.id, col: ci })}
                        onCommit={v => commitCell(s.id, c.field as EditableField, v)}
                        onCancel={() => setActiveCell(null)}
                        onTab={sh => navigateCell(s.id, ci, sh)}
                        onEnter={() => moveCellDown(s.id, ci)}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-0 bg-inherit border-l border-gray-100 dark:border-border" style={{ height: `${CELL_H}px`, width: 56 }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5 h-full px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isAuthenticated && (
                      <button className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete"
                        onClick={() => setDeleteId(s.id)} data-testid={`btn-delete-shareholder-${s.id}`}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </ExcelGridShell>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shareholder</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{shareholders.find(s => s.id === deleteId)?.name}</strong> from the system. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-500" /> Import Shareholders
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-3">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span>{importRows.length} row(s) found</span>
              <span>·</span>
              <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} />{importRows.filter(r => !r._error).length} valid</span>
              {importRows.some(r => r._error) && (
                <span className="text-red-500 flex items-center gap-1"><AlertCircle size={12} />{importRows.filter(r => r._error).length} errors</span>
              )}
            </div>
            <div className="rounded border overflow-auto max-h-[45vh]">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">#</th>
                    {CSV_HEADERS.map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>)}
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map(row => (
                    <tr key={row._rowNum} className={`border-t ${row._error ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                      <td className="px-3 py-1.5 text-muted-foreground">{row._rowNum}</td>
                      {CSV_HEADERS.map(h => <td key={h} className="px-3 py-1.5 truncate max-w-[160px]">{row[h as EditableField]}</td>)}
                      <td className="px-3 py-1.5">
                        {row._error
                          ? <span className="text-red-500 flex items-center gap-1"><AlertCircle size={11} />{row._error}</span>
                          : <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} />OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="pt-3 border-t">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button disabled={importing || importRows.filter(r => !r._error).length === 0} onClick={confirmImport}>
              Import {importRows.filter(r => !r._error).length} Shareholders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
