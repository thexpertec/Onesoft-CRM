import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Account, AccountHead, AccountKind, ACCOUNT_HEADS, HEAD_SUB_TYPES, getJournalEntries, getCustomers, getPaymentAccounts, getStaff, getShareholders } from "@/lib/store";
import { useAccounts } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Plus, Search, X, Trash2, Save, Pencil,
  CheckCircle, XCircle, ChevronDown, ChevronRight,
  GitBranch, FolderOpen, FileText,
  Upload, Download, AlertTriangle, Info, FileSpreadsheet, ChevronUp,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Head numbering (canonical account prefix per head) ──────────────────────
const HEAD_BASE_CODE: Record<AccountHead, string> = {
  "Assets":           "1",
  "Liabilities":      "2",
  "Revenue / Income": "3",
  "Expense":          "4",
  "Equity":           "5",
};

/** Default payment-type (normal balance side) for each account head. */
function headDefaultPaymentType(head: AccountHead): "Debit" | "Credit" {
  return (head === "Assets" || head === "Expense") ? "Debit" : "Credit";
}

// ─── Head visual config ───────────────────────────────────────────────────────
const HEAD_STYLE: Record<AccountHead, {
  bg: string; text: string; border: string; badgeBg: string; dot: string;
}> = {
  "Assets":           { bg: "bg-blue-50 dark:bg-blue-950/20",       text: "text-blue-700 dark:text-blue-300",       border: "border-blue-200 dark:border-blue-800",       badgeBg: "bg-blue-600",    dot: "bg-blue-500"    },
  "Liabilities":      { bg: "bg-rose-50 dark:bg-rose-950/20",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200 dark:border-rose-800",       badgeBg: "bg-rose-600",    dot: "bg-rose-500"    },
  "Revenue / Income": { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", badgeBg: "bg-emerald-600", dot: "bg-emerald-500" },
  "Expense":          { bg: "bg-orange-50 dark:bg-orange-950/20",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200 dark:border-orange-800",   badgeBg: "bg-orange-600",  dot: "bg-orange-500"  },
  "Equity":           { bg: "bg-violet-50 dark:bg-violet-950/20",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-200 dark:border-violet-800",   badgeBg: "bg-violet-600",  dot: "bg-violet-500"  },
};

// ─── Tree utilities ───────────────────────────────────────────────────────────
type FlatRow = Account & { depth: number; hasChildren: boolean };

function buildFlatRows(
  headAccounts: Account[],
  parentId: string | null,
  depth: number,
  collapsed: Record<string, boolean>,
): FlatRow[] {
  const children = headAccounts
    .filter(a => (a.parentId ?? null) === parentId)
    .sort((a, b) => {
      // Empty codes sort after non-empty codes so sys-1111 "Cash" always appears first
      if (!a.code && b.code) return 1;
      if (a.code && !b.code) return -1;
      if (!a.code && !b.code) return a.name.localeCompare(b.name);
      return a.code.localeCompare(b.code, undefined, { numeric: true });
    });
  const result: FlatRow[] = [];
  for (const acc of children) {
    const hasChildren = headAccounts.some(a => (a.parentId ?? null) === acc.id);
    result.push({ ...acc, depth, hasChildren });
    if (hasChildren && !collapsed[acc.id]) {
      result.push(...buildFlatRows(headAccounts, acc.id, depth + 1, collapsed));
    }
  }
  return result;
}

function getDescendantIds(accounts: Account[], id: string): Set<string> {
  const result = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    accounts.filter(a => a.parentId === cur).forEach(c => { result.add(c.id); queue.push(c.id); });
  }
  return result;
}

function getPath(accounts: Account[], acc: Account): string {
  const parts: string[] = [acc.name];
  let cur: Account | undefined = acc;
  let safety = 0;
  while (cur?.parentId && safety++ < 20) {
    const parent = accounts.find(a => a.id === cur!.parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    cur = parent;
  }
  return parts.join(" › ");
}

/** Suggest the next auto-code for a new child of `parent` (or root if null).
 *
 *  Numbering convention:
 *    Assets=1, Liabilities=2, Revenue/Income=3, Expense=4, Equity=5
 *    Root accounts under Assets  → 1.1, 1.2, 1.3 …
 *    Children of 1.1             → 1.1.1, 1.1.2 …
 *    Children of 1.1.1           → 1.1.1.1, 1.1.1.2 …
 */
function suggestCode(
  parent: Account | null,
  head: AccountHead,
  allAccounts: Account[],
  offset = 0,
): string {
  const base = HEAD_BASE_CODE[head];          // "1" | "2" | … | "5"

  if (!parent) {
    // Root-level accounts under this head get e.g. 1.1, 1.2, 1.3 …
    const roots = allAccounts.filter(a => a.head === head && !a.parentId);
    const nums  = roots
      .map(r => { const parts = r.code.split("."); return parseInt(parts[parts.length - 1], 10); })
      .filter(n => !isNaN(n));
    const maxN = nums.length > 0 ? Math.max(...nums) : 0;
    return `${base}.${maxN + offset + 1}`;
  }

  // Child accounts: append next sequential number to parent's code
  const siblings = allAccounts.filter(a => a.parentId === parent.id);
  const nums = siblings
    .map(s => { const p = s.code.split("."); return parseInt(p[p.length - 1], 10); })
    .filter(n => !isNaN(n));
  const maxN = nums.length > 0 ? Math.max(...nums) : 0;
  return `${parent.code}.${maxN + offset + 1}`;
}

// ─── Modal types ──────────────────────────────────────────────────────────────
type LedgerEntry = { _key: string; code: string; name: string; openingBalance: string; paymentType: "Debit" | "Credit"; subType: string };
type GroupEntry  = { _key: string; code: string; name: string; subType: string };

type ModalState = {
  open: boolean;
  head: AccountHead;         // selected head (may change)
  headLocked: boolean;       // true when triggered from a specific head/account
  parentId: string | null;   // selected parent account id (may change)
  accountType: AccountKind;
  groupEntries: GroupEntry[];
  ledgerEntries: LedgerEntry[];
};

const defaultModal = (
  parentId: string | null,
  head: AccountHead,
  headLocked: boolean,
  allAccounts: Account[],
): ModalState => {
  const parent = parentId ? (allAccounts.find(a => a.id === parentId) ?? null) : null;
  const code0 = suggestCode(parent, head, allAccounts);
  return {
    open: true,
    head,
    headLocked,
    parentId,
    accountType: "Group",
    groupEntries: [{
      _key: crypto.randomUUID(),
      code: code0,
      name: "",
      subType: HEAD_SUB_TYPES[head][0],
    }],
    ledgerEntries: [{
      _key: crypto.randomUUID(),
      code: code0,
      name: "",
      openingBalance: "0",
      paymentType: headDefaultPaymentType(head),
      subType: HEAD_SUB_TYPES[head][0],
    }],
  };
};

// ─── Edit form type ───────────────────────────────────────────────────────────
type EditForm = Omit<Account, "id" | "createdAt" | "updatedAt">;

// ─── Import types ─────────────────────────────────────────────────────────────
type ImportRow = {
  _line: number;
  code: string;
  name: string;
  head: string;
  type: string;
  subType: string;
  parentCode: string;
  openingBalance: string;
  description: string;
  errors: string[];
  warnings: string[];
};

// ─── CSV utilities ────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function parseImportCsv(raw: string): ImportRow[] {
  const lines = raw.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim().replace(/^\uFEFF/, ""); // strip BOM if present
    if (l === "" || l.startsWith("#") || /^sep=/i.test(l)) continue;
    headerIdx = i;
    break;
  }
  if (headerIdx === -1) return [];
  const headerCols = parseCsvLine(lines[headerIdx]).map(h => h.replace(/^\uFEFF/, "").replace(/^["']|["']$/g, "").toLowerCase().trim());
  const col = (row: string[], name: string) => {
    const idx = headerCols.indexOf(name);
    return idx >= 0 ? (row[idx] ?? "").replace(/^["']|["']$/g, "").trim() : "";
  };
  const rows: ImportRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === "" || l.startsWith("#")) continue;
    const cells = parseCsvLine(lines[i]);
    rows.push({
      _line: i + 1,
      code:          col(cells, "code"),
      name:          col(cells, "name"),
      head:          col(cells, "head"),
      type:          col(cells, "type"),
      subType:       col(cells, "subtype"),
      parentCode:    col(cells, "parentcode"),
      openingBalance: col(cells, "openingbalance") || "0",
      description:   col(cells, "description"),
      errors: [], warnings: [],
    });
  }
  return rows;
}

function validateImportRows(rows: ImportRow[], existing: Account[]): ImportRow[] {
  const existingCodes = new Set(existing.map(a => a.code));
  const existingLedgerNames = new Set(existing.filter(a => a.accountType === "Ledger").map(a => a.name.trim().toLowerCase()));
  const fileCodes = new Set<string>();
  const fileLedgerNames = new Set<string>();

  return rows.map(r => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!r.code) errors.push("Code is required");
    if (!r.name) errors.push("Name is required");

    const head = r.head as AccountHead;
    if (!ACCOUNT_HEADS.includes(head)) {
      errors.push(`Head "${r.head}" is invalid — must be one of: ${ACCOUNT_HEADS.join(" | ")}`);
    }

    if (r.type !== "Group" && r.type !== "Ledger") {
      errors.push(`Type "${r.type}" is invalid — must be Group or Ledger`);
    }

    if (r.code && fileCodes.has(r.code)) {
      errors.push(`Duplicate code "${r.code}" within the import file`);
    } else if (r.code && existingCodes.has(r.code)) {
      errors.push(`Code "${r.code}" already exists in the current chart of accounts`);
    }

    if (r.type === "Ledger" && r.name) {
      const nl = r.name.trim().toLowerCase();
      if (fileLedgerNames.has(nl)) {
        errors.push(`Duplicate ledger name "${r.name}" within the import file`);
      } else if (existingLedgerNames.has(nl)) {
        errors.push(`Ledger name "${r.name}" already exists in the current chart of accounts`);
      }
    }

    if (ACCOUNT_HEADS.includes(head) && r.subType) {
      const validSubs = HEAD_SUB_TYPES[head];
      if (!validSubs.includes(r.subType)) {
        errors.push(`SubType "${r.subType}" is invalid for head "${head}" — valid: ${validSubs.join(" | ")}`);
      }
    } else if (!r.subType) {
      errors.push("SubType is required");
    }

    if (r.parentCode) {
      const parentInFile = rows.find(pr => pr.code === r.parentCode);
      const parentInExisting = existing.find(a => a.code === r.parentCode);
      if (!parentInFile && !parentInExisting) {
        errors.push(`Parent code "${r.parentCode}" not found in file or existing accounts`);
      } else if (parentInFile && parentInFile.type === "Ledger") {
        errors.push(`Parent "${r.parentCode}" is a Ledger — Ledgers cannot have sub-accounts`);
      } else if (parentInExisting && parentInExisting.accountType === "Ledger") {
        errors.push(`Parent "${r.parentCode}" is a Ledger — Ledgers cannot have sub-accounts`);
      }
    }

    if (r.code) fileCodes.add(r.code);
    if (r.type === "Ledger" && r.name) fileLedgerNames.add(r.name.trim().toLowerCase());

    if (r.type === "Group" && r.openingBalance && r.openingBalance !== "0") {
      warnings.push("Opening balance is only used for Ledger accounts");
    }

    return { ...r, errors, warnings };
  });
}

function topoSortImportRows(rows: ImportRow[]): ImportRow[] {
  const byCode = new Map(rows.map(r => [r.code, r]));
  const visited = new Set<string>();
  const result: ImportRow[] = [];
  function visit(r: ImportRow) {
    if (visited.has(r.code)) return;
    if (r.parentCode && byCode.has(r.parentCode)) visit(byCode.get(r.parentCode)!);
    visited.add(r.code);
    result.push(r);
  }
  rows.forEach(r => visit(r));
  return result;
}

function downloadCoATemplate() {
  // All comment lines use plain ASCII only so Excel never garbles them
  const lines = [
    "# CHART OF ACCOUNTS - IMPORT TEMPLATE",
    "# ---------------------------------------------------------------------------",
    "# COLUMNS (case-insensitive headers - column order does not matter):",
    "#   code           | required | Account code  e.g. 1.1 or 1.1.1 (use head prefix: Assets=1, Liabilities=2, Revenue=3, Expense=4, Equity=5)",
    "#   name           | required | Account name",
    "#   head           | required | Assets | Liabilities | Revenue / Income | Expense | Equity",
    "#   type           | required | Group (can have children)  or  Ledger (leaf/final entry)",
    "#   subType        | required | Must be valid for the chosen head (see list below)",
    "#   parentCode     | optional | Leave blank for root accounts; enter parent code for sub-accounts",
    "#   openingBalance | optional | Number - Ledger accounts only; leave 0 or blank for Groups",
    "#   description    | optional | Free text notes",
    "#",
    "# VALID subType VALUES BY HEAD:",
    "#   Assets           : Current Asset | Fixed Asset | Other Asset",
    "#   Liabilities      : Current Liability | Long-term Liability | Other Liability",
    "#   Revenue / Income : Operating Revenue | Other Income",
    "#   Expense          : Cost of Goods Sold | Operating Expense | Other Expense",
    "#   Equity           : Owner's Equity | Retained Earnings",
    "#",
    "# RULES:",
    "#   1. Every account must have a unique code (no duplicates in file or existing data).",
    "#   2. Every Ledger account must have a unique name across the ENTIRE chart of accounts.",
    "#   3. A Ledger account cannot be a parent of any other account.",
    "#   4. parentCode must reference a code in this file OR already in your chart of accounts.",
    "#   5. Lines starting with # are comments and are ignored by the importer.",
    "#   6. You may delete the example rows below - the header row must remain.",
    "#",
    "# NUMBERING CONVENTION:",
    "#   Head prefix  :  Assets=1  Liabilities=2  Revenue / Income=3  Expense=4  Equity=5",
    "#   Root accounts → 1.1, 1.2, 1.3 …     (prefix.N)",
    "#   Sub-groups    → 1.1.1, 1.1.2 …       (parent.N)",
    "#   Ledgers       → 1.1.1.1, 1.1.1.2 …   (parent.N)",
    "# ---------------------------------------------------------------------------",
    "code,name,head,type,subType,parentCode,openingBalance,description",
    "1.1,Fixed Assets,Assets,Group,Fixed Asset,,0,Long-term tangible assets",
    "1.1.1,Machinery and Equipment,Assets,Group,Fixed Asset,1.1,0,",
    "1.1.1.1,CNC Machine - Islamabad,Assets,Ledger,Fixed Asset,1.1.1,50000,Purchased Jan 2024",
    "1.1.1.2,CNC Machine - Hull UK,Assets,Ledger,Fixed Asset,1.1.1,35000,",
    "1.1.2,Office Equipment,Assets,Group,Fixed Asset,1.1,0,",
    "1.1.2.1,Computers and Laptops,Assets,Ledger,Fixed Asset,1.1.2,15000,",
    "1.2,Current Assets,Assets,Group,Current Asset,,0,",
    "1.2.1,Bank and Cash,Assets,Group,Current Asset,1.2,0,",
    "1.2.1.1,Cash in Hand - Islamabad,Assets,Ledger,Current Asset,1.2.1,5000,",
    "1.2.1.2,Cash in Hand - Hull,Assets,Ledger,Current Asset,1.2.1,3000,",
    "1.2.1.3,HBL Business Account,Assets,Ledger,Current Asset,1.2.1,120000,",
    "2.1,Short-term Loans,Liabilities,Group,Current Liability,,0,",
    "2.1.1,Bank Overdraft - HBL,Liabilities,Ledger,Current Liability,2.1,0,",
    "2.2,Long-term Finance,Liabilities,Group,Long-term Liability,,0,",
    "3.1,Sales Revenue,Revenue / Income,Group,Operating Revenue,,0,",
    "3.1.1,Software License Sales,Revenue / Income,Ledger,Operating Revenue,3.1,0,",
    "3.1.2,Consulting and Services,Revenue / Income,Ledger,Operating Revenue,3.1,0,",
    "4.1,Operating Expenses,Expense,Group,Operating Expense,,0,",
    "4.1.1,Staff Salaries,Expense,Ledger,Operating Expense,4.1,0,",
    "4.1.2,Office Rent,Expense,Ledger,Operating Expense,4.1,0,",
    "5.1,Owner Capital,Equity,Group,Owner's Equity,,0,",
    "5.1.1,Share Capital,Equity,Ledger,Owner's Equity,5.1,0,",
  ];
  // UTF-8 BOM + "sep=," directive: BOM tells Excel the encoding is UTF-8,
  // and "sep=," overrides Excel's regional list-separator so commas always split columns.
  const csv = "\uFEFF" + "sep=,\r\n" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "onesoft-coa-import-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ChartOfAccountsPage() {
  const { accounts, addAccount, editAccount, removeAccount } = useAccounts();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [activeHead,    setActiveHead]    = useState<"All" | AccountHead>("All");
  const [search,        setSearch]        = useState("");
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [nodeCollapsed, setNodeCollapsed] = useState<Record<string, boolean>>({});
  const [headCollapsed, setHeadCollapsed] = useState<Record<string, boolean>>({});

  // ── Import state ──────────────────────────────────────────────────────────
  const [showImport,     setShowImport]    = useState(false);
  const [importRows,     setImportRows]    = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [instrExpanded,  setInstrExpanded]  = useState(true);

  // ── Create modal ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalState | null>(null);

  // ── Edit panel (inline) ───────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<EditForm | null>(null);
  const [showEdit,   setShowEdit]   = useState(false);

  // ── Counts ───────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = { All: accounts.length };
    ACCOUNT_HEADS.forEach(h => { c[h] = accounts.filter(a => a.head === h).length; });
    return c;
  }, [accounts]);

  // ── Search ───────────────────────────────────────────────────────────────────
  const isSearching = search.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) return null;
    const q = search.toLowerCase();
    return accounts
      .filter(a =>
        (activeHead === "All" || a.head === activeHead) &&
        (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
         a.subType.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      )
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, activeHead, search, isSearching]);

  // ── Open create modal ─────────────────────────────────────────────────────────
  const openCreate = useCallback((parent: Account | null, head: AccountHead) => {
    setShowEdit(false);
    setEditingId(null);
    // headLocked = true when triggered from a specific account row (head cannot change)
    setModal(defaultModal(parent?.id ?? null, head, parent !== null, accounts));
  }, [accounts]);

  // Change head inside modal (unlocked mode only) – resets parent & re-suggests code
  const handleModalHeadChange = useCallback((h: AccountHead) => {
    if (!modal) return;
    const pt = headDefaultPaymentType(h);
    setModal(m => m ? {
      ...m,
      head: h,
      parentId: null,
      groupEntries: m.groupEntries.map((e, i) => ({
        ...e,
        code: suggestCode(null, h, accounts, i),
        subType: HEAD_SUB_TYPES[h][0],
      })),
      ledgerEntries: m.ledgerEntries.map((e, i) => ({
        ...e,
        code: suggestCode(null, h, accounts, i),
        subType: HEAD_SUB_TYPES[h][0],
        paymentType: pt,
      })),
    } : m);
  }, [modal, accounts]);

  // Change parent inside modal – re-suggests code
  const handleModalParentChange = useCallback((parentId: string | null) => {
    if (!modal) return;
    const parent = parentId ? (accounts.find(a => a.id === parentId) ?? null) : null;
    setModal(m => m ? {
      ...m,
      parentId,
      groupEntries: m.groupEntries.map((e, i) => ({
        ...e,
        code: suggestCode(parent, modal.head, accounts, i),
      })),
      ledgerEntries: m.ledgerEntries.map((e, i) => ({
        ...e,
        code: suggestCode(parent, modal.head, accounts, i),
      })),
    } : m);
  }, [modal, accounts]);

  // ── Open edit inline ─────────────────────────────────────────────────────────
  const openEdit = (acc: Account) => {
    setModal(null);
    setEditingId(acc.id);
    setEditForm({
      code: acc.code, name: acc.name, head: acc.head, subType: acc.subType,
      description: acc.description, parentId: acc.parentId ?? null,
      accountType: acc.accountType ?? "Group",
      openingBalance: acc.openingBalance ?? 0,
      paymentType: acc.paymentType ?? (acc.accountType === "Ledger" ? "Debit" : null),
      isActive: acc.isActive,
    });
    setShowEdit(true);
  };

  const closeEdit = () => { setShowEdit(false); setEditingId(null); setEditForm(null); };

  const setEF = <K extends keyof EditForm>(k: K, v: EditForm[K]) =>
    setEditForm(f => f ? { ...f, [k]: v } : f);

  const handleEditSave = useCallback(() => {
    if (!editForm || !editingId) return;
    if (!editForm.code.trim() || !editForm.name.trim()) {
      toast({ title: "Code and Name are required", variant: "destructive" }); return;
    }
    const dup = accounts.find(a => a.code.trim() === editForm.code.trim() && a.id !== editingId);
    if (dup) { toast({ title: `Code "${editForm.code}" already in use`, variant: "destructive" }); return; }
    editAccount(editingId, editForm);
    toast({ title: "Account updated" });
    closeEdit();
  }, [editForm, editingId, accounts, editAccount, toast]);

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  const closeModal = () => setModal(null);

  const setModalType = (t: AccountKind) => {
    if (!modal) return;
    const parent = modal.parentId ? (accounts.find(a => a.id === modal.parentId) ?? null) : null;
    const head = modal.head;
    if (t === "Ledger") {
      setModal(m => m ? {
        ...m,
        accountType: "Ledger",
        ledgerEntries: [{
          _key: crypto.randomUUID(),
          code: suggestCode(parent, head, accounts),
          name: "",
          openingBalance: "0",
          paymentType: headDefaultPaymentType(head),
          subType: HEAD_SUB_TYPES[head][0],
        }],
      } : m);
    } else {
      setModal(m => m ? {
        ...m,
        accountType: "Group",
        groupEntries: [{
          _key: crypto.randomUUID(),
          code: suggestCode(parent, head, accounts),
          name: "",
          subType: HEAD_SUB_TYPES[head][0],
        }],
      } : m);
    }
  };

  // ── Group entry helpers ──────────────────────────────────────────────────────
  const addGroupEntry = () => {
    if (!modal) return;
    const idx = modal.groupEntries.length;
    const parent = modal.parentId ? (accounts.find(a => a.id === modal.parentId) ?? null) : null;
    setModal(m => m ? {
      ...m,
      groupEntries: [...m.groupEntries, {
        _key: crypto.randomUUID(),
        code: suggestCode(parent, modal.head, accounts, idx),
        name: "",
        subType: HEAD_SUB_TYPES[modal.head][0],
      }],
    } : m);
  };

  const removeGroupEntry = (key: string) =>
    setModal(m => m ? { ...m, groupEntries: m.groupEntries.filter(e => e._key !== key) } : m);

  const updateGroupEntry = (key: string, field: keyof Omit<GroupEntry, "_key">, value: string) =>
    setModal(m => m ? {
      ...m,
      groupEntries: m.groupEntries.map(e => e._key === key ? { ...e, [field]: value } : e),
    } : m);

  // ── Ledger entry helpers ─────────────────────────────────────────────────────
  const addLedgerEntry = () => {
    if (!modal) return;
    const idx = modal.ledgerEntries.length;
    const parent = modal.parentId ? (accounts.find(a => a.id === modal.parentId) ?? null) : null;
    setModal(m => m ? {
      ...m,
      ledgerEntries: [...m.ledgerEntries, {
        _key: crypto.randomUUID(),
        code: suggestCode(parent, modal.head, accounts, idx),
        name: "",
        openingBalance: "0",
        paymentType: headDefaultPaymentType(modal.head),
        subType: HEAD_SUB_TYPES[modal.head][0],
      }],
    } : m);
  };

  const removeLedgerEntry = (key: string) =>
    setModal(m => m ? { ...m, ledgerEntries: m.ledgerEntries.filter(e => e._key !== key) } : m);

  const updateLedgerEntry = (key: string, field: keyof Omit<LedgerEntry, "_key">, value: string) =>
    setModal(m => m ? {
      ...m,
      ledgerEntries: m.ledgerEntries.map(e => e._key === key ? { ...e, [field]: value } : e),
    } : m);

  const handleModalSave = useCallback(() => {
    if (!modal) return;
    const { parentId, head, accountType } = modal;

    if (accountType === "Group") {
      const entries = modal.groupEntries;
      if (entries.some(e => !e.name.trim() || !e.code.trim())) {
        toast({ title: "Each entry needs a Code and Name", variant: "destructive" }); return;
      }
      const codes = entries.map(e => e.code.trim());
      const allCodes = accounts.map(a => a.code);
      const dupCode = codes.find(c => allCodes.includes(c));
      if (dupCode) { toast({ title: `Code "${dupCode}" already in use`, variant: "destructive" }); return; }
      const dupWithin = codes.find((c, i) => codes.indexOf(c) !== i);
      if (dupWithin) { toast({ title: `Duplicate code "${dupWithin}" within entries`, variant: "destructive" }); return; }
      entries.forEach(e => {
        addAccount({
          code: e.code.trim(), name: e.name.trim(), head, subType: e.subType,
          description: "", parentId, accountType: "Group", openingBalance: 0, paymentType: null, isActive: true,
        });
      });
      toast({ title: `${entries.length} group${entries.length > 1 ? "s" : ""} created` });
      if (parentId) setNodeCollapsed(p => ({ ...p, [parentId]: false }));
    } else {
      // Ledger – can be multiple entries
      const entries = modal.ledgerEntries;
      if (entries.some(e => !e.name.trim() || !e.code.trim())) {
        toast({ title: "Each entry needs a Code and Name", variant: "destructive" }); return;
      }
      const codes = entries.map(e => e.code.trim());
      const names = entries.map(e => e.name.trim().toLowerCase());
      const allCodes = accounts.map(a => a.code);
      const dupCode = codes.find(c => allCodes.includes(c));
      if (dupCode) { toast({ title: `Code "${dupCode}" already in use`, variant: "destructive" }); return; }
      const dupWithin = codes.find((c, i) => codes.indexOf(c) !== i);
      if (dupWithin) { toast({ title: `Duplicate code "${dupWithin}" in entries`, variant: "destructive" }); return; }
      // No duplicate ledger names anywhere in the entire chart of accounts
      const existingLedgerNames = accounts
        .filter(a => a.accountType === "Ledger")
        .map(a => a.name.trim().toLowerCase());
      const dupName = names.find(n => existingLedgerNames.includes(n));
      if (dupName) { toast({ title: `Ledger name "${entries.find(e => e.name.trim().toLowerCase() === dupName)!.name}" already exists`, variant: "destructive" }); return; }
      const dupNameWithin = names.find((n, i) => names.indexOf(n) !== i);
      if (dupNameWithin) { toast({ title: `Duplicate ledger name within entries`, variant: "destructive" }); return; }

      entries.forEach(e => {
        addAccount({
          code: e.code.trim(), name: e.name.trim(), head, subType: e.subType,
          description: "", parentId, accountType: "Ledger",
          openingBalance: parseFloat(e.openingBalance) || 0,
          paymentType: e.paymentType ?? "Debit",
          isActive: true,
        });
      });
      toast({ title: `${entries.length} ledger${entries.length > 1 ? "s" : ""} created` });
      if (parentId) setNodeCollapsed(p => ({ ...p, [parentId]: false }));
    }
    closeModal();
  }, [modal, accounts, addAccount, toast]);

  // ── Import handlers ───────────────────────────────────────────────────────────
  const handleImportFile = (file: File) => {
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseImportCsv(text);
      const validated = validateImportRows(parsed, accounts);
      setImportRows(validated);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = useCallback(() => {
    const validRows = importRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) return;
    const sorted = topoSortImportRows(validRows);
    const codeToId = new Map(accounts.map(a => [a.code, a.id]));
    sorted.forEach(r => {
      const parentId = r.parentCode ? (codeToId.get(r.parentCode) ?? null) : null;
      const created = addAccount({
        code: r.code, name: r.name,
        head: r.head as AccountHead,
        subType: r.subType,
        description: r.description,
        parentId,
        accountType: r.type as AccountKind,
        openingBalance: r.type === "Ledger" ? (parseFloat(r.openingBalance) || 0) : 0,
        isActive: true,
      });
      codeToId.set(r.code, created.id);
    });
    toast({ title: `${sorted.length} account${sorted.length !== 1 ? "s" : ""} imported successfully` });
    setShowImport(false);
    setImportRows([]);
    setImportFileName("");
  }, [importRows, accounts, addAccount, toast]);

  // ── Delete ────────────────────────────────────────────────────────────────────
  const hasChildren = (id: string) => accounts.some(a => (a.parentId ?? null) === id);
  const accountToDelete = accounts.find(a => a.id === deleteId);

  /** Returns true for any account seeded by the system (cannot be deleted). */
  const isSystemAccount = (id: string) =>
    id.startsWith("sys-") || id.startsWith("sr-prod-") || id.startsWith("pur-prod-");

  const deleteBlockReason: string | null = useMemo(() => {
    if (!deleteId) return null;
    if (isSystemAccount(deleteId))
      return "This is a system account and is protected from deletion.";
    if (hasChildren(deleteId))
      return "This account has child accounts. Remove or reassign all children before deleting.";
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteId, accounts]);

  // Will this delete physically remove the row, or only deactivate it?
  // Mirrors the soft-delete logic in store.ts → deleteAccount: any reference
  // from a JE line, customer, supplier, payment account, staff (payroll or
  // payable), or shareholder triggers soft-delete.
  const willSoftDelete: boolean = useMemo(() => {
    if (!deleteId || deleteBlockReason) return false;
    const entries = getJournalEntries();
    if (entries.some(je => je.lines.some(l => l.ledgerId === deleteId))) return true;
    if (getCustomers().some(c => c.ledgerAccountId === deleteId)) return true;
    if (getPaymentAccounts().some(a => a.ledgerAccountId === deleteId)) return true;
    if (getStaff().some(s => s.ledgerAccountId === deleteId || s.staffPayableLedgerId === deleteId)) return true;
    if (getShareholders().some(s => s.ledgerAccountId === deleteId)) return true;
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteId, deleteBlockReason, accounts]);

  // ── Edit parent options ───────────────────────────────────────────────────────
  const editParentOptions = useMemo(() => {
    if (!editForm || !editingId) return [];
    const excluded = new Set([editingId, ...getDescendantIds(accounts, editingId)]);
    const opts: { id: string; label: string; depth: number }[] = [];
    function walk(parentId: string | null, depth: number) {
      accounts
        .filter(a => a.head === editForm!.head && (a.parentId ?? null) === parentId && !excluded.has(a.id) && (a.accountType ?? "Group") !== "Ledger")
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        .forEach(a => { opts.push({ id: a.id, label: `${a.code} — ${a.name}`, depth }); walk(a.id, depth + 1); });
    }
    walk(null, 0);
    return opts;
  }, [accounts, editForm, editingId]);

  // ── Row renderer ─────────────────────────────────────────────────────────────
  const INDENT_W = 22;

  const renderRow = (acc: FlatRow, ri: number) => {
    const s = HEAD_STYLE[acc.head];
    const isLedger = acc.accountType === "Ledger";
    return (
      <div
        key={acc.id}
        onClick={() => { if (!isLedger) openCreate(acc, acc.head); }}
        className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 group transition-colors min-h-[40px] ${
          isLedger ? "cursor-default" : "cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
        } ${!acc.isActive ? "opacity-40" : ri % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"}`}
      >
        {/* Tree indent + toggle */}
        <div className="flex items-center flex-shrink-0 pl-3" style={{ width: 44 + acc.depth * INDENT_W }}>
          {acc.depth > 0 && (
            <div className="flex items-center flex-shrink-0" style={{ width: acc.depth * INDENT_W }}>
              {Array.from({ length: acc.depth }).map((_, di) => (
                <span
                  key={di}
                  className={`flex-shrink-0 font-mono ${di === acc.depth - 1 ? "text-gray-400 dark:text-zinc-500" : "text-transparent"}`}
                  style={{ width: INDENT_W, fontSize: 13, lineHeight: 1 }}
                >
                  {di === acc.depth - 1 ? "└" : "│"}
                </span>
              ))}
            </div>
          )}
          <div className="w-5 flex-shrink-0 flex justify-center">
            {acc.hasChildren ? (
              <button
                onClick={e => { e.stopPropagation(); setNodeCollapsed(p => ({ ...p, [acc.id]: !p[acc.id] })); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                title={nodeCollapsed[acc.id] ? "Expand" : "Collapse"}
              >
                {nodeCollapsed[acc.id]
                  ? <ChevronRight size={12} className="text-gray-500" />
                  : <ChevronDown  size={12} className="text-gray-500" />
                }
              </button>
            ) : (
              <span className="text-gray-300 dark:text-zinc-600 text-[14px] select-none">·</span>
            )}
          </div>
        </div>

        {/* Row number */}
        <div className="w-7 flex-shrink-0 text-[11px] text-gray-400 font-mono">{ri + 1}</div>

        {/* Code */}
        <div className={`w-24 flex-shrink-0 font-mono text-[12px] font-bold ${s.text} pr-2`}>{acc.code}</div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 pr-3">
          <span className={isLedger ? "text-[12px] italic text-gray-600 dark:text-gray-400 truncate" : "text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate"}>
            {acc.name}
          </span>
          {isLedger ? (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 border border-gray-200 dark:border-zinc-700">
              <FileText size={8} /> Ledger
            </span>
          ) : (
            <span className={`flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${s.bg} ${s.text} ${s.border}`}>
              <GitBranch size={8} /> Group
            </span>
          )}
          {/* Auto-linked subsidiary ledger indicator */}
          {isLedger && /^[0-9]+-[0-9]{3}$/.test(acc.code) && (
            <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
              {acc.subType === "Receivable" ? "Customer"
                : acc.subType === "Payable" ? "Supplier"
                : acc.subType === "Capital" ? "Owner"
                : "Linked"}
            </span>
          )}
        </div>

        {/* Opening balance + Dr/Cr (ledgers only) */}
        <div className="w-36 flex-shrink-0 pr-2 flex items-center justify-end gap-1.5">
          {isLedger && (() => {
            const pt = acc.paymentType ?? "Debit";
            return (
              <>
                <span className="text-[12px] font-mono text-gray-700 dark:text-gray-300">
                  {acc.openingBalance !== 0 ? acc.openingBalance.toLocaleString() : "—"}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                  pt === "Debit"
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                }`}>
                  {pt === "Debit" ? "Dr" : "Cr"}
                </span>
              </>
            );
          })()}
        </div>

        {/* Parent account */}
        <div className="w-52 flex-shrink-0 pr-2">
          {(() => {
            const parent = acc.parentId ? accounts.find(a => a.id === acc.parentId) : null;
            return parent ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`font-mono text-[11px] font-extrabold flex-shrink-0 ${s.text}`}>{parent.code}</span>
                <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 truncate">{parent.name}</span>
              </div>
            ) : (
              <span className="text-[11px] text-gray-300 dark:text-zinc-600">—</span>
            );
          })()}
        </div>

        {/* Status */}
        <div className="w-20 flex-shrink-0 flex justify-center">
          <button
            onClick={e => { e.stopPropagation(); editAccount(acc.id, { isActive: !acc.isActive }); toast({ title: acc.isActive ? "Deactivated" : "Activated" }); }}
            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
              acc.isActive
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-200"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-400 hover:bg-gray-200"
            }`}
          >
            {acc.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
            {acc.isActive ? "Active" : "Off"}
          </button>
        </div>

        {/* Actions (hover) */}
        <div className="w-20 flex-shrink-0 flex items-center justify-end gap-0.5 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
          {acc.accountType === "Ledger" && (
            <button
              onClick={e => { e.stopPropagation(); navigate(`/ledger-report?account=${encodeURIComponent(acc.id)}`); }}
              className="p-1.5 rounded-md text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/30"
              title="View ledger report for this account"
            >
              <BookOpen size={13} />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); openEdit(acc); }}
            className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          {isSystemAccount(acc.id) ? (
            <span className="p-1.5 w-8 inline-flex items-center justify-center" title="System account — protected">
              <Trash2 size={13} className="text-gray-200 dark:text-zinc-700" />
            </span>
          ) : (
            <button
              onClick={e => {
                e.stopPropagation();
                if (hasChildren(acc.id)) {
                  toast({ title: "Cannot delete — has child accounts", description: "Remove children first.", variant: "destructive" });
                } else {
                  setDeleteId(acc.id);
                }
              }}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    );
  };


  // ── Render ────────────────────────────────────────────────────────────────────
  const headForCreate = activeHead !== "All" ? activeHead as AccountHead : "Assets";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">

      {/* ─── Page Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-200 dark:shadow-none">
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">Chart of Accounts</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {accounts.length === 0 ? "No accounts yet — use + Add or Import to get started" : `${accounts.length} account${accounts.length !== 1 ? "s" : ""} · click any Group row to add a sub-account`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowImport(true); setImportRows([]); setImportFileName(""); }}
              className="flex items-center gap-2 h-9 px-4 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 text-[13px] font-bold transition-colors"
            >
              <Upload size={15} /> Import
            </button>
            <button
              onClick={() => openCreate(null, headForCreate)}
              className="flex items-center gap-2 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold shadow-md transition-colors"
            >
              <Plus size={15} /> New Account
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {ACCOUNT_HEADS.map(h => {
            const s = HEAD_STYLE[h];
            const cnt = counts[h] ?? 0;
            const active = activeHead === h;
            return (
              <button key={h} onClick={() => setActiveHead(active ? "All" : h)}
                className={`rounded-xl px-3 py-3 border text-left transition-all ${active ? `${s.bg} ${s.border} ring-2 ring-offset-1 ${s.text} ring-current` : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800"}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${active ? s.text : "text-gray-500 dark:text-gray-400"}`}>{h}</span>
                </div>
                <div className={`text-[26px] font-bold leading-none ${active ? s.text : "text-gray-900 dark:text-gray-100"}`}>{cnt}</div>
                <div className={`text-[10px] mt-1 ${active ? s.text : "text-gray-400"}`}>account{cnt !== 1 ? "s" : ""}</div>
              </button>
            );
          })}
        </div>

        {/* Filter tabs + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => setActiveHead("All")}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${activeHead === "All" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"}`}>
              All ({counts.All})
            </button>
            {ACCOUNT_HEADS.map(h => {
              const s = HEAD_STYLE[h];
              const active = activeHead === h;
              return (
                <button key={h} onClick={() => setActiveHead(active ? "All" : h)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${active ? `${s.badgeBg} text-white` : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"}`}>
                  {h === "Revenue / Income" ? "Revenue" : h} ({counts[h] ?? 0})
                </button>
              );
            })}
          </div>
          <div className="relative ml-auto w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code, name, type…"
              className="w-full pl-8 pr-8 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
          </div>
        </div>
      </div>

      {/* ─── Edit Panel (inline) ─────────────────────────────────────────────── */}
      {showEdit && editForm && (
        <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Pencil size={13} className="text-blue-500" /> Edit Account
            </h2>
            <button onClick={closeEdit} className="p-1 rounded text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-[80px_2fr_1fr_1fr_1fr] gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Code *</label>
              <input value={editForm.code} onChange={e => setEF("code", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Account Name *</label>
              <input value={editForm.name} onChange={e => setEF("name", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Head *</label>
              <select value={editForm.head} onChange={e => setEF("head", e.target.value as AccountHead)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                {ACCOUNT_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Type</label>
              <select value={editForm.subType} onChange={e => setEF("subType", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                {HEAD_SUB_TYPES[editForm.head].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Kind</label>
              <select value={editForm.accountType ?? "Group"} onChange={e => setEF("accountType", e.target.value as AccountKind)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="Group">Group</option>
                <option value="Ledger">Ledger</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-72 flex-shrink-0">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Parent Account</label>
              <select value={editForm.parentId ?? ""}
                onChange={e => setEF("parentId", e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">— No parent (root) —</option>
                {editParentOptions.map(o => (
                  <option key={o.id} value={o.id}>{"\u00a0\u00a0".repeat(o.depth)}{o.depth > 0 ? "↳ " : ""}{o.label}</option>
                ))}
              </select>
            </div>
            {(editForm.accountType ?? "Group") === "Ledger" && (
              <>
                <div className="w-36 flex-shrink-0">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Opening Balance</label>
                  <input type="number" value={editForm.openingBalance ?? 0}
                    onChange={e => setEF("openingBalance", parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Payment Type</label>
                  <div className="flex rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden h-9">
                    <button type="button"
                      onClick={() => setEF("paymentType", "Debit")}
                      className={`flex-1 px-3 text-[12px] font-bold transition-colors ${(editForm.paymentType ?? "Debit") === "Debit" ? "bg-blue-600 text-white" : "bg-white dark:bg-zinc-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}>
                      Dr
                    </button>
                    <button type="button"
                      onClick={() => setEF("paymentType", "Credit")}
                      className={`flex-1 px-3 text-[12px] font-bold transition-colors border-l border-gray-200 dark:border-zinc-700 ${(editForm.paymentType ?? "Debit") === "Credit" ? "bg-orange-500 text-white" : "bg-white dark:bg-zinc-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}>
                      Cr
                    </button>
                  </div>
                </div>
              </>
            )}
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
              <input value={editForm.description} onChange={e => setEF("description", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="flex items-end gap-2 flex-shrink-0">
              <button onClick={handleEditSave}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold transition-colors">
                <Save size={13} /> Update
              </button>
              <button onClick={closeEdit}
                className="h-9 px-4 rounded-lg border border-gray-200 dark:border-zinc-700 text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Table ───────────────────────────────────────────────────────────── */}
      <div className="px-6 py-5">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
          {/* Header */}
          <div className="flex items-center pl-3 pr-3 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <div className="w-12 flex-shrink-0">Tree</div>
            <div className="w-7 flex-shrink-0">#</div>
            <div className="w-24 flex-shrink-0">Code</div>
            <div className="flex-1">Account Name</div>
            <div className="w-36 flex-shrink-0 text-right pr-2">Opening Bal. / Dr·Cr</div>
            <div className="w-52 flex-shrink-0">Parent Account</div>
            <div className="w-20 flex-shrink-0 text-center">Status</div>
            <div className="w-20 flex-shrink-0" />
          </div>

          {/* Search results */}
          {isSearching ? (
            searchResults && searchResults.length > 0 ? (
              <>
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} — tree view paused during search
                </div>
                {searchResults.map((acc, ri) => {
                  const s = HEAD_STYLE[acc.head];
                  const isLedger = acc.accountType === "Ledger";
                  return (
                    <div key={acc.id} onClick={() => { if (!isLedger) openCreate(acc, acc.head); }}
                      className={`flex items-center border-b border-gray-100 dark:border-zinc-800 last:border-0 group transition-colors min-h-[40px] ${isLedger ? "cursor-default" : "cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20"} ${!acc.isActive ? "opacity-40" : ri % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"}`}>
                      <div className="w-12 flex-shrink-0 pl-3" />
                      <div className="w-7 flex-shrink-0 text-[11px] text-gray-400 font-mono">{ri + 1}</div>
                      <div className={`w-24 flex-shrink-0 font-mono text-[12px] font-bold ${s.text} pr-2`}>{acc.code}</div>
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-[10px] text-gray-400 truncate">{getPath(accounts, acc)}</div>
                        <div className={`truncate ${isLedger ? "text-[12px] italic text-gray-600 dark:text-gray-400" : "text-[13px] font-semibold text-gray-900 dark:text-gray-100"}`}>{acc.name}</div>
                      </div>
                      <div className="w-36 flex-shrink-0 pr-2 flex items-center justify-end gap-1.5">
                        {isLedger && (() => {
                          const pt = acc.paymentType ?? "Debit";
                          return (
                            <>
                              <span className="text-[12px] font-mono text-gray-700 dark:text-gray-300">
                                {acc.openingBalance !== 0 ? acc.openingBalance.toLocaleString() : "—"}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                                pt === "Debit"
                                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                  : "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                              }`}>
                                {pt === "Debit" ? "Dr" : "Cr"}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      <div className="w-52 flex-shrink-0 pr-2">
                        {(() => {
                          const parent = acc.parentId ? accounts.find(a => a.id === acc.parentId) : null;
                          return parent ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`font-mono text-[11px] font-extrabold flex-shrink-0 ${s.text}`}>{parent.code}</span>
                              <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 truncate">{parent.name}</span>
                            </div>
                          ) : <span className="text-[11px] text-gray-300 dark:text-zinc-600">—</span>;
                        })()}
                      </div>
                      <div className="w-20 flex-shrink-0 flex justify-center">
                        <button onClick={e => { e.stopPropagation(); editAccount(acc.id, { isActive: !acc.isActive }); toast({ title: acc.isActive ? "Deactivated" : "Activated" }); }}
                          className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${acc.isActive ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-gray-100 dark:bg-zinc-800 text-gray-400"}`}>
                          {acc.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
                          {acc.isActive ? "Active" : "Off"}
                        </button>
                      </div>
                      <div className="w-20 flex-shrink-0 flex items-center justify-end gap-0.5 pr-3 opacity-0 group-hover:opacity-100">
                        {acc.accountType === "Ledger" && (
                          <button onClick={e => { e.stopPropagation(); navigate(`/ledger-report?account=${encodeURIComponent(acc.id)}`); }} className="p-1.5 rounded-md text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/30" title="View ledger"><BookOpen size={13} /></button>
                        )}
                        <button onClick={e => { e.stopPropagation(); openEdit(acc); }} className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50"><Pencil size={13} /></button>
                        {isSystemAccount(acc.id) ? (
                          <span className="p-1.5 w-8 inline-flex items-center justify-center" title="System account — protected">
                            <Trash2 size={13} className="text-gray-200 dark:text-zinc-700" />
                          </span>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); setDeleteId(acc.id); }} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="text-center py-20 text-gray-400 text-[13px]">No accounts match your search.</div>
            )
          ) : (
            ACCOUNT_HEADS
              .filter(h => activeHead === "All" || h === activeHead)
              .map(head => {
                const s = HEAD_STYLE[head];
                const headAccounts = accounts.filter(a => a.head === head).map(a => ({ ...a, parentId: a.parentId ?? null }));
                const flatRows = buildFlatRows(headAccounts, null, 0, nodeCollapsed);
                const isHCollapsed = headCollapsed[head];
                return (
                  <div key={head}>
                    <div className={`flex items-center gap-2 px-4 py-2 border-b ${s.border} ${s.bg}`}>
                      <button onClick={() => setHeadCollapsed(p => ({ ...p, [head]: !p[head] }))} className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                        <span className={`font-mono text-[12px] font-extrabold flex-shrink-0 ${s.text} opacity-60`}>{HEAD_BASE_CODE[head]}</span>
                        <span className={`text-[11px] font-bold uppercase tracking-wider flex-1 text-left ${s.text}`}>{head}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${s.badgeBg}`}>{headAccounts.length}</span>
                        {isHCollapsed ? <ChevronRight size={13} className={s.text} /> : <ChevronDown size={13} className={s.text} />}
                      </button>
                      <button
                        onClick={() => openCreate(null, head)}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${s.border} ${s.bg} ${s.text} hover:opacity-80 flex-shrink-0`}
                        title={`Add root account under ${head}`}
                      >
                        <Plus size={10} /> Add
                      </button>
                    </div>
                    {!isHCollapsed && (
                      flatRows.length === 0 ? (
                        <div className="px-12 py-4 text-[12px] text-gray-400 italic border-b border-gray-100 dark:border-zinc-800">
                          No accounts yet. Click "+ Add" above or click any existing account.
                        </div>
                      ) : flatRows.map((row, ri) => (
                        <div key={row.id}>
                          {renderRow(row, ri)}
                        </div>
                      ))
                    )}
                  </div>
                );
              })
          )}
        </div>

        {/* ─── Net Opening Balance Summary ────────────────────────────────────── */}
        {!isSearching && (
          <div className="mt-4 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-700 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <div className="flex-1">Net Opening Balance Summary</div>
              <div className="w-44 text-right text-blue-500">Total Dr.</div>
              <div className="w-44 text-right text-orange-500">Total Cr.</div>
            </div>

            {/* Per-head rows */}
            {ACCOUNT_HEADS.map(head => {
              const headLedgers = accounts.filter(a => a.head === head && a.accountType === "Ledger");
              if (headLedgers.length === 0) return null;
              const drTotal = headLedgers
                .filter(a => (a.paymentType ?? "Debit") === "Debit")
                .reduce((s, a) => s + (a.openingBalance ?? 0), 0);
              const crTotal = headLedgers
                .filter(a => (a.paymentType ?? "Debit") === "Credit")
                .reduce((s, a) => s + (a.openingBalance ?? 0), 0);
              const s = HEAD_STYLE[head];
              return (
                <div key={head} className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-zinc-800 last:border-0">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                    <span className={`font-mono text-[11px] font-extrabold flex-shrink-0 ${s.text} opacity-70`}>{HEAD_BASE_CODE[head]}</span>
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${s.text}`}>{head}</span>
                    <span className="text-[10px] text-gray-400 ml-1">({headLedgers.length} ledger{headLedgers.length !== 1 ? "s" : ""})</span>
                  </div>
                  <div className="w-44 text-right pr-1">
                    {drTotal > 0 ? (
                      <span className="text-[12px] font-mono font-semibold text-blue-700 dark:text-blue-400">
                        {drTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="ml-1.5 text-[9px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-md">Dr</span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300 dark:text-zinc-700">—</span>
                    )}
                  </div>
                  <div className="w-44 text-right pr-1">
                    {crTotal > 0 ? (
                      <span className="text-[12px] font-mono font-semibold text-orange-600 dark:text-orange-400">
                        {crTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="ml-1.5 text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-md">Cr</span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-300 dark:text-zinc-700">—</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Grand total row */}
            {(() => {
              const allLedgers = accounts.filter(a => a.accountType === "Ledger");
              const grandDr = allLedgers
                .filter(a => (a.paymentType ?? "Debit") === "Debit")
                .reduce((s, a) => s + (a.openingBalance ?? 0), 0);
              const grandCr = allLedgers
                .filter(a => (a.paymentType ?? "Debit") === "Credit")
                .reduce((s, a) => s + (a.openingBalance ?? 0), 0);
              const fmt2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return (
                <div className="flex items-center px-4 py-3 bg-gray-50 dark:bg-zinc-800/40 border-t-2 border-gray-200 dark:border-zinc-700">
                  <div className="flex-1 text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Grand Total</div>
                  <div className="w-44 text-right pr-1">
                    <span className="text-[13px] font-bold font-mono text-blue-700 dark:text-blue-400">
                      {fmt2(grandDr)}
                      <span className="ml-1.5 text-[9px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-md">Dr</span>
                    </span>
                  </div>
                  <div className="w-44 text-right pr-1">
                    <span className="text-[13px] font-bold font-mono text-orange-600 dark:text-orange-400">
                      {fmt2(grandCr)}
                      <span className="ml-1.5 text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-md">Cr</span>
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ─── Create Group / Ledger Modal ─────────────────────────────────────── */}
      <Dialog open={!!modal} onOpenChange={v => { if (!v) closeModal(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <FolderOpen size={16} className="text-blue-500" />
              Create Group / Ledger
            </DialogTitle>
          </DialogHeader>

          {modal && (
            <div className="space-y-4 pt-1">
              {/* Type selector */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Account Kind <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Group", "Ledger"] as AccountKind[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setModalType(t)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-[13px] font-bold transition-all ${
                        modal.accountType === t
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                          : "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                      }`}
                    >
                      {t === "Group"
                        ? <GitBranch size={16} className={modal.accountType === t ? "text-blue-500" : "text-gray-400"} />
                        : <FileText  size={16} className={modal.accountType === t ? "text-blue-500" : "text-gray-400"} />
                      }
                      <div className="text-left">
                        <div>{t}</div>
                        <div className={`text-[10px] font-normal ${modal.accountType === t ? "text-blue-500" : "text-gray-400"}`}>
                          {t === "Group" ? "Can have sub-accounts" : "Final ledger entry"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Head selector (shown when not locked to a specific head) */}
              {!modal.headLocked && (
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Account Head <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={modal.head}
                    onChange={e => handleModalHeadChange(e.target.value as AccountHead)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {ACCOUNT_HEADS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}

              {/* Parent account selector (dropdown) */}
              {(() => {
                // Build tree-ordered parent options for modal.head
                const opts: { id: string; label: string; depth: number }[] = [];
                function walkOpts(pid: string | null, depth: number) {
                  accounts
                    .filter(a => a.head === modal.head && (a.parentId ?? null) === pid && (a.accountType ?? "Group") !== "Ledger")
                    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                    .forEach(a => {
                      opts.push({ id: a.id, label: `${a.code} | ${a.name}`, depth });
                      walkOpts(a.id, depth + 1);
                    });
                }
                walkOpts(null, 0);
                return (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Select Account Group <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={modal.parentId ?? ""}
                      onChange={e => handleModalParentChange(e.target.value || null)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">— No parent (root level under {modal.head}) —</option>
                      {opts.map(o => (
                        <option key={o.id} value={o.id}>
                          {"\u00a0\u00a0\u00a0\u00a0".repeat(o.depth)}{o.depth > 0 ? "↳ " : ""}{o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {/* GROUP: multiple rows (like ledger entries) */}
              {modal.accountType === "Group" && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Group Entries <span className="text-red-500">*</span>
                  </label>
                  {modal.groupEntries.map((entry, idx) => (
                    <div key={entry._key} className="grid grid-cols-[100px_1fr] gap-2 items-end">
                      <div>
                        {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Code</label>}
                        <input
                          value={entry.code}
                          onChange={e => updateGroupEntry(entry._key, "code", e.target.value)}
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <div className="flex-1">
                          {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Group Name *</label>}
                          <input
                            value={entry.name}
                            onChange={e => updateGroupEntry(entry._key, "name", e.target.value)}
                            placeholder="e.g. Fixed Assets"
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        {modal.groupEntries.length > 1 && (
                          <button
                            onClick={() => removeGroupEntry(entry._key)}
                            className={`${idx === 0 ? "mt-5" : ""} p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0`}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addGroupEntry}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </div>
              )}

              {/* LEDGER: multiple entries */}
              {modal.accountType === "Ledger" && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Ledger Entries <span className="text-red-500">*</span>
                  </label>
                  {modal.ledgerEntries.map((entry, idx) => (
                    <div key={entry._key} className="grid grid-cols-[100px_1fr_110px_78px_1fr] gap-2 items-end">
                      <div>
                        {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Code</label>}
                        <input
                          value={entry.code}
                          onChange={e => updateLedgerEntry(entry._key, "code", e.target.value)}
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Ledger Name *</label>}
                        <input
                          value={entry.name}
                          onChange={e => updateLedgerEntry(entry._key, "name", e.target.value)}
                          placeholder="e.g. Cash in Hand"
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Opening Bal.</label>}
                        <input
                          type="number"
                          value={entry.openingBalance}
                          onChange={e => updateLedgerEntry(entry._key, "openingBalance", e.target.value)}
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] font-mono text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Dr / Cr</label>}
                        <div className="flex rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden h-[36px]">
                          <button type="button"
                            onClick={() => updateLedgerEntry(entry._key, "paymentType", "Debit")}
                            className={`flex-1 text-[11px] font-bold transition-colors ${entry.paymentType === "Debit" ? "bg-blue-600 text-white" : "bg-white dark:bg-zinc-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}>
                            Dr
                          </button>
                          <button type="button"
                            onClick={() => updateLedgerEntry(entry._key, "paymentType", "Credit")}
                            className={`flex-1 text-[11px] font-bold transition-colors border-l border-gray-200 dark:border-zinc-700 ${entry.paymentType === "Credit" ? "bg-orange-500 text-white" : "bg-white dark:bg-zinc-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-700"}`}>
                            Cr
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="flex-1">
                          {idx === 0 && <label className="block text-[10px] text-gray-400 mb-1">Ledger Type</label>}
                          <select
                            value={entry.subType}
                            onChange={e => updateLedgerEntry(entry._key, "subType", e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            {HEAD_SUB_TYPES[modal.head].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        {modal.ledgerEntries.length > 1 && (
                          <button
                            onClick={() => removeLedgerEntry(entry._key)}
                            className={`${idx === 0 ? "mt-5" : ""} p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0`}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addLedgerEntry}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                  >
                    <Plus size={14} /> Add More
                  </button>
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                <button onClick={closeModal}
                  className="h-9 px-5 rounded-lg border border-gray-200 dark:border-zinc-700 text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
                <button onClick={handleModalSave}
                  className="flex items-center gap-1.5 h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold transition-colors">
                  <Save size={13} /> Save
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Import Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={showImport} onOpenChange={v => { if (!v) { setShowImport(false); setImportRows([]); setImportFileName(""); } }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <FileSpreadsheet size={17} className="text-blue-500" />
              Import Chart of Accounts
              <span className="text-[11px] font-normal text-gray-400 ml-1">Upload a CSV file to bulk-add accounts</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {/* Instructions panel */}
            <div className="mx-6 mt-5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 overflow-hidden">
              <button
                onClick={() => setInstrExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2 text-[13px] font-bold text-blue-700 dark:text-blue-300">
                  <Info size={14} /> How to fill in the import file
                </div>
                {instrExpanded ? <ChevronUp size={14} className="text-blue-500" /> : <ChevronDown size={14} className="text-blue-500" />}
              </button>
              {instrExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-blue-200 dark:border-blue-800">
                  {/* Steps */}
                  <div className="grid grid-cols-2 gap-3 pt-3">
                    {[
                      { n: "1", title: "Download the template", body: 'Click "Download Template" below. Open it in Excel, Google Sheets, or any spreadsheet app.' },
                      { n: "2", title: "Keep the header row", body: 'The first non-comment row must be the header: code, name, head, type, subType, parentCode, openingBalance, description' },
                      { n: "3", title: "Add your accounts", body: "One row per account. Groups first, then their child accounts. Parent must appear above (or already in system)." },
                      { n: "4", title: "Fill required columns", body: "code, name, head, type, subType are mandatory. parentCode, openingBalance, description are optional." },
                      { n: "5", title: "Upload & review errors", body: "Upload your CSV — any validation errors will be highlighted in red. Fix them before importing." },
                      { n: "6", title: "Import valid rows", body: "Only error-free rows are imported. Rows with errors are skipped." },
                    ].map(s => (
                      <div key={s.n} className="flex gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{s.n}</div>
                        <div>
                          <div className="text-[12px] font-bold text-blue-800 dark:text-blue-200">{s.title}</div>
                          <div className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed">{s.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Column reference table */}
                  <div>
                    <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2">Column Reference</div>
                    <div className="rounded-lg overflow-hidden border border-blue-200 dark:border-blue-800 text-[11px]">
                      <div className="grid grid-cols-[90px_60px_1fr] bg-blue-600 text-white font-bold">
                        <div className="px-2.5 py-1.5">Column</div>
                        <div className="px-2.5 py-1.5">Required</div>
                        <div className="px-2.5 py-1.5">Valid values / Notes</div>
                      </div>
                      {[
                        ["code",          "Yes", "Unique code, e.g. 1 · 1.1 · 1.1.2 — no duplicates allowed"],
                        ["name",          "Yes", "Account name — Ledger names must be unique across entire chart"],
                        ["head",          "Yes", "Assets · Liabilities · Revenue / Income · Expense · Equity"],
                        ["type",          "Yes", "Group (can have children) · Ledger (leaf / final entry, no children)"],
                        ["subType",       "Yes", "Assets → Current Asset · Fixed Asset · Other Asset\nLiabilities → Current Liability · Long-term Liability · Other Liability\nRevenue / Income → Operating Revenue · Other Income\nExpense → Cost of Goods Sold · Operating Expense · Other Expense\nEquity → Owner's Equity · Retained Earnings"],
                        ["parentCode",    "No",  "Code of the parent account — leave blank for root-level accounts"],
                        ["openingBalance","No",  "Number — applies to Ledger accounts only; default 0"],
                        ["description",   "No",  "Free text description"],
                      ].map(([col, req, note], i) => (
                        <div key={col} className={`grid grid-cols-[90px_60px_1fr] ${i % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-blue-50/60 dark:bg-blue-950/10"}`}>
                          <div className="px-2.5 py-1.5 font-mono font-bold text-blue-700 dark:text-blue-400">{col}</div>
                          <div className={`px-2.5 py-1.5 font-bold ${req === "Yes" ? "text-red-600" : "text-gray-400"}`}>{req}</div>
                          <div className="px-2.5 py-1.5 text-gray-600 dark:text-gray-400 whitespace-pre-line leading-relaxed">{note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Download template + Upload */}
            <div className="mx-6 mt-4 flex gap-3">
              <button
                onClick={downloadCoATemplate}
                className="flex items-center gap-2 h-10 px-5 rounded-xl border-2 border-blue-500 text-blue-600 dark:text-blue-400 text-[13px] font-bold hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
              >
                <Download size={15} /> Download Template CSV
              </button>
              <label className="flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold cursor-pointer transition-colors">
                <Upload size={15} />
                {importFileName ? `Change file` : "Upload CSV"}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleImportFile(e.target.files[0]); e.target.value = ""; }}
                />
              </label>
              {importFileName && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-zinc-800 text-[12px] text-gray-600 dark:text-gray-300">
                  <FileSpreadsheet size={13} className="text-green-500" />
                  <span className="font-mono truncate max-w-[200px]">{importFileName}</span>
                  <button onClick={() => { setImportRows([]); setImportFileName(""); }} className="ml-1 text-gray-400 hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Drag & drop area (shown only when no file loaded) */}
            {!importFileName && (
              <div
                className="mx-6 mt-3 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-blue-300 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
              >
                <Upload size={28} className="opacity-40" />
                <div className="text-[13px] font-medium">Drag & drop your CSV file here</div>
                <div className="text-[11px]">or click "Upload CSV" above</div>
              </div>
            )}

            {/* Preview table */}
            {importRows.length > 0 && (() => {
              const errorCount   = importRows.filter(r => r.errors.length > 0).length;
              const warningCount = importRows.filter(r => r.errors.length === 0 && r.warnings.length > 0).length;
              const validCount   = importRows.filter(r => r.errors.length === 0).length;
              return (
                <div className="mx-6 mt-4 mb-4">
                  {/* Summary bar */}
                  <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700">
                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-600"><CheckCircle size={14} /> {validCount} valid</div>
                    {errorCount > 0 && <div className="flex items-center gap-1.5 text-[12px] font-bold text-red-600"><XCircle size={14} /> {errorCount} with errors</div>}
                    {warningCount > 0 && <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-500"><AlertTriangle size={14} /> {warningCount} with warnings</div>}
                    <div className="flex-1" />
                    <div className="text-[11px] text-gray-500">{importRows.length} row{importRows.length !== 1 ? "s" : ""} in file</div>
                  </div>

                  {/* Table */}
                  <div className="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-[11px]">
                        <thead className="bg-gray-50 dark:bg-zinc-800/60 sticky top-0">
                          <tr>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-10">Row</th>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-14">Status</th>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-16">Code</th>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-40">Name</th>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-28">Head</th>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-16">Type</th>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-28">SubType</th>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-16">Parent</th>
                            <th className="px-2 py-2 text-left font-bold text-gray-500 uppercase tracking-wider">Issues</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((r, ri) => {
                            const hasErr = r.errors.length > 0;
                            const hasWarn = r.warnings.length > 0;
                            return (
                              <tr key={ri} className={`border-t border-gray-100 dark:border-zinc-800 ${hasErr ? "bg-red-50/60 dark:bg-red-950/10" : hasWarn ? "bg-amber-50/40 dark:bg-amber-950/10" : ri % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-zinc-800/10"}`}>
                                <td className="px-2 py-1.5 text-gray-400 font-mono">{r._line}</td>
                                <td className="px-2 py-1.5">
                                  {hasErr
                                    ? <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-950/30 px-1.5 py-0.5 rounded-full"><XCircle size={9} /> Error</span>
                                    : hasWarn
                                      ? <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-full"><AlertTriangle size={9} /> Warn</span>
                                      : <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-full"><CheckCircle size={9} /> OK</span>
                                  }
                                </td>
                                <td className="px-2 py-1.5 font-mono font-bold text-blue-600 dark:text-blue-400">{r.code || <span className="text-red-400 italic">missing</span>}</td>
                                <td className="px-2 py-1.5 text-gray-800 dark:text-gray-200 max-w-[160px] truncate">{r.name || <span className="text-red-400 italic">missing</span>}</td>
                                <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{r.head}</td>
                                <td className="px-2 py-1.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${r.type === "Ledger" ? "bg-violet-100 dark:bg-violet-950/30 text-violet-600" : "bg-blue-100 dark:bg-blue-950/30 text-blue-600"}`}>{r.type || "—"}</span>
                                </td>
                                <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400 truncate max-w-[110px]">{r.subType || <span className="text-red-400 italic">missing</span>}</td>
                                <td className="px-2 py-1.5 font-mono text-gray-500">{r.parentCode || <span className="text-gray-300 dark:text-zinc-600">—</span>}</td>
                                <td className="px-2 py-1.5">
                                  {r.errors.map((e, i) => <div key={i} className="text-red-600 dark:text-red-400 leading-snug">{e}</div>)}
                                  {r.warnings.map((w, i) => <div key={i} className="text-amber-600 dark:text-amber-400 leading-snug">{w}</div>)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/40 flex-shrink-0">
            <button
              onClick={() => { setShowImport(false); setImportRows([]); setImportFileName(""); }}
              className="h-9 px-5 rounded-lg border border-gray-200 dark:border-zinc-700 text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            {importRows.length > 0 && (
              <button
                onClick={handleConfirmImport}
                disabled={importRows.filter(r => r.errors.length === 0).length === 0}
                className="flex items-center gap-2 h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-bold transition-colors"
              >
                <Upload size={14} />
                Import {importRows.filter(r => r.errors.length === 0).length} Valid Account{importRows.filter(r => r.errors.length === 0).length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{willSoftDelete ? "Deactivate Account?" : "Delete Account?"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <span className="font-semibold text-foreground">{accountToDelete?.code} — {accountToDelete?.name}</span>
                </p>
                {deleteBlockReason ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>{deleteBlockReason}</span>
                  </div>
                ) : willSoftDelete ? (
                  <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 px-3 py-2.5 text-sm text-blue-800 dark:text-blue-300">
                    <Info size={15} className="mt-0.5 shrink-0" />
                    <span>
                      This account has journal entries posted to it. It will be <strong>deactivated</strong> (hidden from pickers) but kept in the database so historical entries still resolve to a real account name. No data is lost.
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This account is not referenced anywhere and will be permanently removed.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deleteBlockReason}
              onClick={() => {
                if (!deleteId) return;
                try {
                  removeAccount(deleteId);
                  toast({ title: willSoftDelete ? "Account deactivated" : "Account deleted" });
                  setDeleteId(null);
                } catch (e: unknown) {
                  toast({ title: "Cannot delete account", description: (e as Error).message, variant: "destructive" });
                }
              }}
              className={`text-white disabled:opacity-50 disabled:cursor-not-allowed ${willSoftDelete ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              {willSoftDelete ? "Deactivate" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
