import { kvPut, kvGetAll, kvGet, kvDeleteNamespace } from "./api";

export type LeadStatus = "New" | "Contacted" | "Meeting Scheduled" | "Demo Completed" | "Qualified" | "Proposal Sent" | "Negotiation" | "Won" | "Lost";

export type CallOutcome = "Answered" | "No Answer" | "Voicemail" | "Busy" | "Scheduled Callback";

export type CallLog = {
  id: string;
  date: string;
  duration?: string;
  outcome: CallOutcome;
  notes: string;
  createdAt: string;
};

export type Lead = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  city: string;
  country?: string;
  website?: string;
  status: LeadStatus;
  source: string;
  notes: string;
  isRelevant?: boolean;
  nextReminder?: string;
  reminderNote?: string;
  dealValue?: number;
  assignedTo?: string;
  temperature?: "Hot" | "Warm" | "Cold";
  nextFollowUp?: string;
  callLogs?: CallLog[];
  createdAt: string;
  updatedAt: string;
};

export type DocStatus = "Draft" | "Under Review" | "Approved" | "Archived";

export type RequirementDoc = {
  id: string;
  title: string;
  clientName: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  city: string;
  status: DocStatus;
  softwareType: string;
  budget: string;
  startDate: string;
  deliveryDate: string;
  createdAt: string;
  updatedAt: string;
  sections?: Record<string, unknown>;
};

const LEADS_KEY = "admin-leads";
const DOCS_KEY = "admin-req-docs";

// ─── One-time migration: remove seeded demo items ────────────────────────────
const DEMO_LEAD_IDS = ["l-1", "l-2", "l-3"];
const DEMO_DOC_IDS  = ["d-1"];

function clearDemoData() {
  // Demo-data cleanup now runs via server sync; localStorage path removed.
}
clearDemoData();

// ─── Multi-tenant storage namespace ───────────────────────────────────────────
let _activeTenantId: string | null = null;

export function setActiveTenant(id: string | null): void {
  _activeTenantId = id;
}

export function getActiveTenantId(): string | null {
  return _activeTenantId;
}

/** Prefix a key with the active tenant ID (null = superadmin = no prefix). */
function tenantKey(baseKey: string): string {
  if (_activeTenantId === null) return baseKey;
  return `t:${_activeTenantId}:${baseKey}`;
}

// ─── Activity Log ─────────────────────────────────────────────────────────────
export type ActivityAction =
  | "created" | "updated" | "deleted"
  | "converted" | "completed" | "status_changed";

export type ActivityEntry = {
  id: string;
  action: ActivityAction;
  entity: string;       // e.g. "Lead", "Customer", "Sale"
  entityName: string;   // e.g. lead.name, sale.saleNumber
  detail?: string;      // optional extra info
  user: string;
  timestamp: string;
};

const ACTIVITY_KEY = "admin-activity-log";
const MAX_ACTIVITY = 300;
let _activityUser = "System";

export function setActivityUser(name: string): void {
  _activityUser = name || "System";
}

export function addActivity(entry: Omit<ActivityEntry, "id" | "user" | "timestamp">): void {
  try {
    const key = tenantKey(ACTIVITY_KEY);
    let existing: ActivityEntry[] = [];
    try { existing = JSON.parse(_lsGet(key) || "[]"); } catch { existing = []; }
    const newEntry: ActivityEntry = {
      ...entry,
      id: crypto.randomUUID(),
      user: _activityUser,
      timestamp: new Date().toISOString(),
    };
    _lsSet(key, [newEntry, ...existing].slice(0, MAX_ACTIVITY));
  } catch { /* ignore */ }
}

export function getActivities(): ActivityEntry[] {
  try {
    return JSON.parse(_lsGet(tenantKey(ACTIVITY_KEY)) || "[]");
  } catch { return []; }
}

export function clearActivities(): void {
  _lsRemove(tenantKey(ACTIVITY_KEY));
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
//
// Architecture:
// _memRaw (in-memory Map) — PRIMARY fast store, no quota, lives for the tab session.
// PostgreSQL KV (via API server) — DURABLE persistent store, source of truth.
//
// Data flow: login → syncAllFromServer → _memRaw populated from DB.
// All mutations write to _memRaw immediately and fire _apiWrite to persist to DB.
// No localStorage is used for business data.

/** Raw JSON cache — no browser quota limit, survives within the tab session. */
const _memRaw = new Map<string, string>();

/** Returns true when the in-memory cache holds at least one key for the given tenant namespace. */
export function isTenantCached(tenantId: string): boolean {
  const prefix = `t:${tenantId}:`;
  for (const k of _memRaw.keys()) {
    if (k.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Tracks every in-flight _apiWrite promise by storageKey (most recent write
 * wins). syncAllFromServer drains this before fetching from the server so it
 * never reads stale data and resurrects records the user just deleted.
 */
const _pendingWrites = new Map<string, Promise<void>>();

/** Read from in-memory cache. Returns null if not yet synced from server. */
function _lsGet(storageKey: string): string | null {
  return _memRaw.get(storageKey) ?? null;
}

/** Write to in-memory cache only. Server persistence is handled by _apiWrite. */
function _lsSet(storageKey: string, data: unknown): void {
  _memRaw.set(storageKey, JSON.stringify(data));
}

/** Cache write: updates in-memory so the rest of the app sees the change immediately. */
function _lsCache(storageKey: string, data: unknown): void {
  _memRaw.set(storageKey, JSON.stringify(data));
}

/** Remove from in-memory cache. */
function _lsRemove(storageKey: string): void {
  _memRaw.delete(storageKey);
}

/**
 * Fire-and-forget write to the PostgreSQL KV store via the API server.
 * storageKey may include "t:{id}:" tenant prefix.
 *
 * Returns a Promise so callers that need durable confirmation (e.g. tenant
 * delete) can `await` it; legacy callers that don't await retain the original
 * fire-and-forget behaviour because errors are still caught here.
 */
function _apiWrite(storageKey: string, value: unknown): Promise<void> {
  let ns: string;
  let key: string;
  const tenantMatch = storageKey.match(/^t:([^:]+):(.+)$/);
  if (tenantMatch) {
    ns = `t:${tenantMatch[1]}`;
    key = tenantMatch[2];
  } else {
    ns = "global";
    key = storageKey;
  }
  const p: Promise<void> = kvPut(ns, key, value).catch((err) => {
    console.error(`[kv] server write FAILED for ${ns}/${key}:`, err instanceof Error ? err.message : err);
    throw err;
  }).finally(() => {
    // De-register once settled (only if this is still the latest promise for the key)
    if (_pendingWrites.get(storageKey) === p) _pendingWrites.delete(storageKey);
  });
  // Register — newer writes for the same key replace older ones; the Map always
  // holds the most-recent promise so syncAllFromServer awaits the freshest write.
  _pendingWrites.set(storageKey, p);
  return p;
}

/** Tenant-namespaced read (all business data). */
function getStored<T>(key: string): T[] {
  const raw = _lsGet(tenantKey(key));
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch { }
  }
  return [];
}

/** Tenant-namespaced write: memory + server. */
function setStored<T>(key: string, data: T[]) {
  const sk = tenantKey(key);
  _lsCache(sk, data);   // update _memRaw immediately so rest of app sees the change
  _apiWrite(sk, data);  // persist to server (tracked by _pendingWrites)
}

/** Platform-level read (always unprefixed — for users & tenants registry). */
function getGlobal<T>(key: string): T[] {
  const raw = _lsGet(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch { }
  }
  return [];
}

/** Platform-level write — also persists to PostgreSQL. */
function setGlobal<T>(key: string, data: T[]) {
  _lsCache(key, data);  // write to _memRaw immediately
  // Fire-and-forget; awaitable variant available via setGlobalAsync below
  _apiWrite(key, data).catch(() => { /* error already logged */ });
}

/** Awaitable platform-level write. Resolves only after the server confirms. */
async function setGlobalAsync<T>(key: string, data: T[]): Promise<void> {
  _lsCache(key, data);
  await _apiWrite(key, data);
}

// ─── Leads API ────────────────────────────────────────────────────────────────
export const getLeads = (): Lead[] => getStored<Lead>(LEADS_KEY);
export const getLead = (id: string): Lead | undefined => getLeads().find(l => l.id === id);
export const createLead = (lead: Omit<Lead, "id" | "createdAt" | "updatedAt">): Lead => {
  const newLead: Lead = {
    isRelevant: true,
    callLogs: [],
    ...lead,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(LEADS_KEY, [...getLeads(), newLead]);
  addActivity({ action: "created", entity: "Lead", entityName: newLead.name, detail: newLead.company || undefined });
  return newLead;
};
export const updateLead = (id: string, updates: Partial<Omit<Lead, "id" | "createdAt" | "updatedAt">>): Lead => {
  const leads = getLeads();
  const index = leads.findIndex(l => l.id === id);
  if (index === -1) throw new Error("Lead not found");
  const updatedLead = { ...leads[index], ...updates, updatedAt: new Date().toISOString() };
  leads[index] = updatedLead;
  setStored(LEADS_KEY, leads);
  const detail = updates.status ? `Status → ${updates.status}` : undefined;
  addActivity({ action: updates.status ? "status_changed" : "updated", entity: "Lead", entityName: updatedLead.name, detail });
  return updatedLead;
};
export const deleteLead = (id: string): void => {
  const lead = getLeads().find(l => l.id === id);
  setStored(LEADS_KEY, getLeads().filter(l => l.id !== id));
  addActivity({ action: "deleted", entity: "Lead", entityName: lead?.name || id });
};

// ─── Docs API ─────────────────────────────────────────────────────────────────
export const getDocs = (): RequirementDoc[] => getStored<RequirementDoc>(DOCS_KEY);
export const getDoc = (id: string): RequirementDoc | undefined => getDocs().find(d => d.id === id);
export const createDoc = (doc: Omit<RequirementDoc, "id" | "createdAt" | "updatedAt">): RequirementDoc => {
  const newDoc: RequirementDoc = {
    ...doc,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(DOCS_KEY, [...getDocs(), newDoc]);
  return newDoc;
};
export const updateDoc = (id: string, updates: Partial<Omit<RequirementDoc, "id" | "createdAt" | "updatedAt">>): RequirementDoc => {
  const docs = getDocs();
  const index = docs.findIndex(d => d.id === id);
  if (index === -1) throw new Error("Document not found");
  const updatedDoc = { ...docs[index], ...updates, updatedAt: new Date().toISOString() };
  docs[index] = updatedDoc;
  setStored(DOCS_KEY, docs);
  return updatedDoc;
};
export const deleteDoc = (id: string): void => {
  setStored(DOCS_KEY, getDocs().filter(d => d.id !== id));
};
/** Force-push in-memory docs to the API server (manual repair / recovery tool). */
export const syncDocsToApi = (): void => {
  const docs = getDocs();
  if (docs.length > 0) _apiWrite(tenantKey(DOCS_KEY), docs);
};

// ─── Cities & Areas API ───────────────────────────────────────────────────────
export type City = {
  id: string;
  name: string;
  country: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const CITIES_KEY = "admin-cities";

export const getCities = (): City[] => getStored<City>(CITIES_KEY);

export const createCity = (data: Omit<City, "id" | "createdAt" | "updatedAt">): City => {
  const item: City = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(CITIES_KEY, [...getCities(), item]);
  return item;
};

export const updateCity = (id: string, updates: Partial<Omit<City, "id" | "createdAt">>): City => {
  const items = getCities();
  const i = items.findIndex(c => c.id === id);
  if (i === -1) throw new Error("City not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(CITIES_KEY, items);
  return items[i];
};

export const deleteCity = (id: string): void => {
  setStored(CITIES_KEY, getCities().filter(c => c.id !== id));
  setStored(AREAS_KEY, getAreas().filter(a => a.cityId !== id));
};

export type Area = {
  id: string;
  name: string;
  cityId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const AREAS_KEY = "admin-areas";

export const getAreas = (): Area[] => getStored<Area>(AREAS_KEY);

export const createArea = (data: Omit<Area, "id" | "createdAt" | "updatedAt">): Area => {
  const item: Area = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(AREAS_KEY, [...getAreas(), item]);
  return item;
};

export const updateArea = (id: string, updates: Partial<Omit<Area, "id" | "createdAt">>): Area => {
  const items = getAreas();
  const i = items.findIndex(a => a.id === id);
  if (i === -1) throw new Error("Area not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(AREAS_KEY, items);
  return items[i];
};

export const deleteArea = (id: string): void => {
  setStored(AREAS_KEY, getAreas().filter(a => a.id !== id));
};

// ─── Payment Accounts ─────────────────────────────────────────────────────────
export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Wallet"] as const;
export type PaymentMethodType = typeof PAYMENT_METHODS[number];

export type PaymentAccount = {
  id:              string;
  accountTitle:    string;
  bankName:        string;   // bank / wallet provider name
  paymentMethod:   PaymentMethodType;
  iban:            string;   // account number, IBAN, or account ref
  description:     string;  // notes / address
  isActive:        boolean;
  ledgerAccountId?: string; // linked COA Ledger account under CB_GROUP (assigned on create)
  createdAt:       string;
  updatedAt:       string;
};

const PAYMENT_ACCOUNTS_KEY = "admin-payment-accounts";

/** Stable ID for the built-in default Cash in Hand account — cannot be deleted or edited. */
export const SYS_PA_CASH = "sys-pa-cash";

export const getPaymentAccounts = (): PaymentAccount[] => getStored<PaymentAccount>(PAYMENT_ACCOUNTS_KEY);

/** Ensure the Cash & Bank Accounts group (sys-1150) exists in COA, create it if missing. */
function _ensureCBGroup(): void {
  const accounts = getAccounts();
  if (accounts.some(a => a.id === SYS_ACCS.CB_GROUP)) return;
  // Group missing — insert it, also ensure CURRENT_ASSETS exists as parent
  const now = new Date().toISOString();
  const toAdd: Account[] = [];
  if (!accounts.some(a => a.id === SYS_ACCS.CURRENT_ASSETS)) {
    toAdd.push({ id: SYS_ACCS.CURRENT_ASSETS, code: "1100", name: "Current Assets", head: "Assets", accountType: "Group", parentId: SYS_ACCS.ASSETS_ROOT, subType: "Current Asset", description: "Assets expected to be realised within 12 months", openingBalance: 0, paymentType: null, isActive: true, createdAt: now, updatedAt: now });
  }
  toAdd.push({ id: SYS_ACCS.CB_GROUP, code: "1110", name: "Cash & Bank Accounts", head: "Assets", accountType: "Group", parentId: SYS_ACCS.CURRENT_ASSETS, subType: "Current Asset", description: "All cash, bank and wallet payment accounts", openingBalance: 0, paymentType: null, isActive: true, createdAt: now, updatedAt: now });
  _saveAccounts([...accounts, ...toAdd]);
}

/** Build the COA Ledger name and subType from a payment account. */
function _coaNameFromPA(pa: Pick<PaymentAccount, "accountTitle" | "bankName" | "paymentMethod">): { name: string; subType: string } {
  const name    = pa.bankName ? `${pa.accountTitle} (${pa.bankName})` : pa.accountTitle;
  const subType = pa.paymentMethod === "Cash" ? "Cash" : pa.paymentMethod === "Wallet" ? "Wallet" : "Bank";
  return { name, subType };
}

export const createPaymentAccount = (data: Omit<PaymentAccount, "id" | "createdAt" | "updatedAt">): PaymentAccount => {
  _ensureCBGroup();
  const now   = new Date().toISOString();
  const { name, subType } = _coaNameFromPA(data);
  // Create the matching COA Ledger account under CB_GROUP
  const coaAcc = createAccount({
    code:           "",
    name,
    head:           "Assets",
    subType,
    description:    data.description || `Payment account — ${data.paymentMethod}`,
    parentId:       SYS_ACCS.CB_GROUP,
    accountType:    "Ledger",
    openingBalance: 0,
    paymentType:    "Debit",
    isActive:       data.isActive,
  });
  const item: PaymentAccount = {
    ...data,
    id:              crypto.randomUUID(),
    ledgerAccountId: coaAcc.id,
    createdAt:       now,
    updatedAt:       now,
  };
  setStored(PAYMENT_ACCOUNTS_KEY, [...getPaymentAccounts(), item]);
  return item;
};

export const updatePaymentAccount = (id: string, updates: Partial<Omit<PaymentAccount, "id" | "createdAt">>): PaymentAccount => {
  const items = getPaymentAccounts();
  const i = items.findIndex(a => a.id === id);
  if (i === -1) throw new Error("Payment account not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(PAYMENT_ACCOUNTS_KEY, items);
  // Sync changes to linked COA account
  const pa = items[i];
  if (pa.ledgerAccountId) {
    const { name, subType } = _coaNameFromPA(pa);
    try {
      updateAccount(pa.ledgerAccountId, { name, subType, isActive: pa.isActive, description: pa.description || `Payment account — ${pa.paymentMethod}` });
    } catch { /* COA account may not exist on old records */ }
  }
  return pa;
};

export const deletePaymentAccount = (id: string): void => {
  const pa = getPaymentAccounts().find(a => a.id === id);
  setStored(PAYMENT_ACCOUNTS_KEY, getPaymentAccounts().filter(a => a.id !== id));
  // Remove the linked COA ledger (soft-fail if it has JE transactions)
  if (pa?.ledgerAccountId) {
    try { deleteAccount(pa.ledgerAccountId); } catch { /* has posted JEs — deactivate instead */ }
    try { updateAccount(pa.ledgerAccountId, { isActive: false }); } catch { /* ignore */ }
  }
};

// ─── Customers API ────────────────────────────────────────────────────────────
export type CustomerStatus = "Active" | "Inactive" | "Churned";

/** Structured postal address used for billing / shipping. Every field is
 *  optional so partial data is allowed. Use {@link formatAddress} to render. */
export type Address = {
  country?: string;
  state?: string;       // state / province
  city?: string;
  area?: string;        // area / region / suburb
  line?: string;        // complete street address (building, street, etc.)
  postalCode?: string;  // postal code / ZIP
};

/** Returns true if every field is empty / undefined. */
export function isAddressEmpty(a?: Address): boolean {
  if (!a) return true;
  return !(a.country || a.state || a.city || a.area || a.line || a.postalCode);
}

/** Joins an Address into a single human-readable line for legacy display. */
export function formatAddress(a?: Address): string {
  if (!a) return "";
  return [a.line, a.area, a.city, a.state, a.postalCode, a.country]
    .map(s => s?.trim())
    .filter(Boolean)
    .join(", ");
}

export type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  city: string;
  area?: string;   // managed area/region
  billingAddress?: string;   // legacy joined display string (auto-derived from billingAddressDetails)
  shippingAddress?: string;  // legacy joined display string (auto-derived from shippingAddressDetails)
  billingAddressDetails?:  Address;  // structured billing address
  shippingAddressDetails?: Address;  // structured shipping address (may equal billing)
  status: CustomerStatus;
  source: "from_lead" | "direct";
  customerType?: "POS Customer" | "Regular Customer";
  customerRole?: "Buyer" | "Supplier";
  leadId?: string;
  customerSince: string;
  totalValue: string;
  currency: string;
  openingBalance?: number;   // Dr = positive (we owe them nothing, they owe us), Cr = negative
  advanceCredit?: number;    // Overpayment credit balance — deducted from next outstanding
  notes: string;
  tags: string[];
  ledgerAccountId?: string;  // auto-created subsidiary ledger under Accounts Receivable
  createdAt: string;
  updatedAt: string;
};

const CUSTOMERS_KEY = "admin-customers";

export const getCustomers = (): Customer[] => getStored<Customer>(CUSTOMERS_KEY);
export const getCustomer = (id: string): Customer | undefined => getCustomers().find(c => c.id === id);

/** Reference tag used to identify auto-generated opening-balance JEs. */
const _OB_REF_PREFIX = "OB-";

/**
 * Post (or update) a "brought-forward" opening-balance journal entry for a
 * customer/supplier ledger account.  Calling with amount=0 deletes any
 * existing OB entry.  Safe to call multiple times — only one OB entry per
 * ledger account is kept.
 */
function _upsertOpeningBalanceJE(
  ledgerAccountId: string,
  isSupplier: boolean,
  amount: number,          // positive = Dr receivable / Cr payable (normal sign)
  date: string,
  entityName: string,
): void {
  const ref = `${_OB_REF_PREFIX}${ledgerAccountId}`;
  const existing = getJournalEntries().find(e => e.reference === ref);

  if (amount === 0) {
    if (existing) deleteJournalEntry(existing.id);
    return;
  }

  const absAmt = Math.abs(amount);
  // For a buyer:    Dr customer ledger (receivable),  Cr Opening Balances equity
  // For a supplier: Dr Opening Balances equity,        Cr supplier ledger (payable)
  const lines: JournalEntryLine[] = isSupplier
    ? [
        { id: crypto.randomUUID(), ledgerId: SYS_ACCS.OPENING_BAL_EQUITY, narration: `Opening balance — ${entityName}`, debit: absAmt, credit: 0 },
        { id: crypto.randomUUID(), ledgerId: ledgerAccountId,              narration: `Opening balance — ${entityName}`, debit: 0,      credit: absAmt },
      ]
    : [
        { id: crypto.randomUUID(), ledgerId: ledgerAccountId,              narration: `Opening balance — ${entityName}`, debit: absAmt, credit: 0 },
        { id: crypto.randomUUID(), ledgerId: SYS_ACCS.OPENING_BAL_EQUITY, narration: `Opening balance — ${entityName}`, debit: 0,      credit: absAmt },
      ];

  const jeData = {
    date,
    reference: ref,
    description: `Opening Balance — ${entityName}`,
    lines,
    status: "posted" as const,
    totalDebit:  absAmt,
    totalCredit: absAmt,
    isBalanced:  true,
  };

  if (existing) {
    updateJournalEntry(existing.id, jeData);
  } else {
    createJournalEntry(jeData);
  }
}

export const createCustomer = (data: Omit<Customer, "id" | "createdAt" | "updatedAt">): Customer => {
  const role        = data.customerRole ?? "Buyer";
  const isSupplier  = role === "Supplier";
  const displayName = data.name + (data.company ? ` (${data.company})` : "");
  const ledgerAccountId = data.ledgerAccountId || createSubsidiaryLedger({
    parentId:    isSupplier ? SYS_ACCS.AP_TRADE : SYS_ACCS.AR_GROUP,
    parentCode:  isSupplier ? "2111"             : "1130",
    name:        displayName,
    head:        isSupplier ? "Liabilities"      : "Assets",
    subType:     isSupplier ? "Payable"          : "Receivable",
    description: isSupplier
      ? `Payable account for supplier: ${data.name}`
      : `Receivable account for customer: ${data.name}`,
  });
  const newCustomer: Customer = {
    ...data,
    ledgerAccountId,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(CUSTOMERS_KEY, [...getCustomers(), newCustomer]);
  addActivity({ action: "created", entity: "Customer", entityName: newCustomer.name, detail: newCustomer.company || undefined });

  // Post opening balance JE if one was provided
  if (newCustomer.openingBalance && newCustomer.openingBalance !== 0) {
    const obDate = newCustomer.customerSince
      ? newCustomer.customerSince
      : new Date().toISOString().slice(0, 10);
    _upsertOpeningBalanceJE(ledgerAccountId, isSupplier, newCustomer.openingBalance, obDate, displayName);
  }

  return newCustomer;
};

export const updateCustomer = (id: string, updates: Partial<Omit<Customer, "id" | "createdAt">>): Customer => {
  const customers = getCustomers();
  const index = customers.findIndex(c => c.id === id);
  if (index === -1) throw new Error("Customer not found");
  const existing = customers[index];

  // ── Sync the linked COA ledger ──────────────────────────────────────────────
  if (existing.ledgerAccountId) {
    const newRole    = updates.customerRole ?? existing.customerRole ?? "Buyer";
    const oldRole    = existing.customerRole ?? "Buyer";
    const roleChanged = newRole !== oldRole;

    const newName    = (updates.name    ?? existing.name    ?? "").trim();
    const newCompany = (updates.company ?? existing.company ?? "").trim();
    const displayName = newName + (newCompany ? ` (${newCompany})` : "");

    const allAccounts = _coaAccounts();
    const accIdx      = allAccounts.findIndex(a => a.id === existing.ledgerAccountId);
    if (accIdx !== -1) {
      const isSupplier = newRole === "Supplier";
      const updated: Partial<Account> = {
        name:    displayName,
        updatedAt: new Date().toISOString(),
      };
      if (roleChanged) {
        // Only move the ledger if no JE entries reference it
        const hasEntries = getJournalEntries().some(je =>
          je.lines.some(l => l.ledgerId === existing.ledgerAccountId),
        );
        if (!hasEntries) {
          updated.parentId = isSupplier ? SYS_ACCS.AP_TRADE : SYS_ACCS.AR_GROUP;
          updated.head     = isSupplier ? "Liabilities"      : "Assets";
          updated.subType  = isSupplier ? "Payable"          : "Receivable";
          updated.description = isSupplier
            ? `Payable account for supplier: ${newName}`
            : `Receivable account for customer: ${newName}`;
        } else {
          // Block the role change silently — entries exist
          delete updates.customerRole;
        }
      }
      allAccounts[accIdx] = { ...allAccounts[accIdx], ...updated };
      _saveCoaAccounts(allAccounts);
    }
  }

  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  customers[index] = updated;
  setStored(CUSTOMERS_KEY, customers);
  const detail = updates.status ? `Status → ${updates.status}` : undefined;
  addActivity({ action: updates.status ? "status_changed" : "updated", entity: "Customer", entityName: updated.name, detail });

  // Sync opening balance JE if it changed
  if ("openingBalance" in updates && updated.ledgerAccountId) {
    const newOB = updated.openingBalance ?? 0;
    const isSupplier = (updated.customerRole ?? "Buyer") === "Supplier";
    const displayName = updated.name + (updated.company ? ` (${updated.company})` : "");
    const obDate = updated.customerSince
      ? updated.customerSince
      : updated.createdAt.slice(0, 10);
    _upsertOpeningBalanceJE(updated.ledgerAccountId, isSupplier, newOB, obDate, displayName);
  }

  return updated;
};

/**
 * Returns true if any posted journal entry references this customer's sub-ledger.
 * Used to lock the Buyer/Supplier toggle in the edit form.
 */
export function customerLedgerHasEntries(ledgerAccountId: string | undefined): boolean {
  if (!ledgerAccountId) return false;
  return getJournalEntries().some(je =>
    je.lines.some(l => l.ledgerId === ledgerAccountId),
  );
}

export const deleteCustomer = (id: string): void => {
  const customer = getCustomers().find(c => c.id === id);
  setStored(CUSTOMERS_KEY, getCustomers().filter(c => c.id !== id));
  // Remove the linked COA ledger (soft-fail if it has posted journal entries)
  if (customer?.ledgerAccountId) {
    try { deleteAccount(customer.ledgerAccountId); } catch { /* has JEs — deactivate instead */ }
    try { updateAccount(customer.ledgerAccountId, { isActive: false }); } catch { /* ignore */ }
  }
  addActivity({ action: "deleted", entity: "Customer", entityName: customer?.name || id });
};

export const convertLeadToCustomer = (
  lead: Lead,
  extras?: { billingAddress?: Address; shippingAddress?: Address },
): Customer => {
  const billingDetails  = isAddressEmpty(extras?.billingAddress)  ? undefined : extras!.billingAddress;
  const shippingDetails = isAddressEmpty(extras?.shippingAddress) ? billingDetails : extras!.shippingAddress;
  const billingStr  = formatAddress(billingDetails)  || undefined;
  const shippingStr = formatAddress(shippingDetails) || billingStr;
  const customer = createCustomer({
    name: lead.name,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    industry: lead.industry,
    city: lead.city,
    billingAddress:         billingStr,
    shippingAddress:        shippingStr,
    billingAddressDetails:  billingDetails,
    shippingAddressDetails: shippingDetails,
    status: "Active",
    source: "from_lead",
    leadId: lead.id,
    customerSince: new Date().toISOString().split("T")[0],
    totalValue: "",
    currency: "GBP",
    notes: lead.notes || "",
    tags: [],
  });
  addActivity({ action: "converted", entity: "Lead", entityName: lead.name, detail: "Converted to Customer" });
  return customer;
};

// ─── Shareholders API ─────────────────────────────────────────────────────────
export type Shareholder = {
  id: string;
  shareholderId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  ledgerAccountId?: string;  // auto-created subsidiary ledger under Owner's Capital
  createdAt: string;
  updatedAt: string;
};

const SHAREHOLDERS_KEY = "admin-shareholders";

export const getShareholders = (): Shareholder[] => getStored<Shareholder>(SHAREHOLDERS_KEY);

export const createShareholder = (data: Omit<Shareholder, "id" | "createdAt" | "updatedAt">): Shareholder => {
  const ledgerAccountId = data.ledgerAccountId || createSubsidiaryLedger({
    parentId:    SYS_ACCS.OWNERS_CAPITAL,
    parentCode:  "5100",
    name:        data.name,
    head:        "Equity",
    subType:     "Capital",
    description: `Capital account for ${data.name}`,
  });
  const item: Shareholder = {
    ...data,
    id: crypto.randomUUID(),
    ledgerAccountId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(SHAREHOLDERS_KEY, [...getShareholders(), item]);
  addActivity({ action: "created", entity: "Shareholder", entityName: item.name, detail: item.shareholderId || undefined });
  return item;
};

export const updateShareholder = (id: string, updates: Partial<Omit<Shareholder, "id" | "createdAt">>): Shareholder => {
  const items = getShareholders();
  const i = items.findIndex(s => s.id === id);
  if (i === -1) throw new Error("Shareholder not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(SHAREHOLDERS_KEY, items);
  // Sync COA ledger name if the shareholder's name changed
  if (updates.name && items[i].ledgerAccountId) {
    const accounts = (() => {
      try { return JSON.parse(_lsGet(tenantKey(COA_KEY)) || "[]") as Account[]; }
      catch { return [] as Account[]; }
    })();
    const idx = accounts.findIndex(a => a.id === items[i].ledgerAccountId);
    if (idx !== -1) {
      accounts[idx] = { ...accounts[idx], name: updates.name, updatedAt: new Date().toISOString() };
      const sk = tenantKey(COA_KEY);
      _lsSet(sk, accounts);
      _apiWrite(sk, accounts);
    }
  }
  addActivity({ action: "updated", entity: "Shareholder", entityName: items[i].name });
  return items[i];
};

export const deleteShareholder = (id: string): void => {
  const item = getShareholders().find(s => s.id === id);
  setStored(SHAREHOLDERS_KEY, getShareholders().filter(s => s.id !== id));
  addActivity({ action: "deleted", entity: "Shareholder", entityName: item?.name || id });
};

// ─── Investment Plans API ─────────────────────────────────────────────────────
export type InvestmentType = "Product" | "Business" | "Product Groups";

export type ProductItem = {
  productName: string;
  units: string;
  investedAmount: string;
};

export type InvestmentPlan = {
  id: string;
  title: string;
  shareholderId?: string;
  investmentOn: InvestmentType;
  product: string;
  business: string;
  specificProductGroups: string;
  timeDuration: string;
  lockForSpecificTime: "Yes" | "No";
  profitMarginWithLoss: string;
  profitMarginWithoutLoss: string;
  maxProfit: string;
  maxLoss: string;
  productItems?: ProductItem[];
  investmentAmount?: string;
  unitsInvested?: string;
  description?: string;
  descriptions?: string[];
  createdAt: string;
  updatedAt: string;
};

const INVESTMENT_PLANS_KEY = "admin-investment-plans";

export const getInvestmentPlans = (): InvestmentPlan[] => getStored<InvestmentPlan>(INVESTMENT_PLANS_KEY);

export const createInvestmentPlan = (data: Omit<InvestmentPlan, "id" | "createdAt" | "updatedAt">): InvestmentPlan => {
  const item: InvestmentPlan = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(INVESTMENT_PLANS_KEY, [...getInvestmentPlans(), item]);
  addActivity({ action: "created", entity: "InvestmentPlan", entityName: item.title, detail: item.investmentOn });
  return item;
};

export const updateInvestmentPlan = (id: string, updates: Partial<Omit<InvestmentPlan, "id" | "createdAt">>): InvestmentPlan => {
  const items = getInvestmentPlans();
  const i = items.findIndex(p => p.id === id);
  if (i === -1) throw new Error("Investment plan not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(INVESTMENT_PLANS_KEY, items);
  addActivity({ action: "updated", entity: "InvestmentPlan", entityName: items[i].title });
  return items[i];
};

export const deleteInvestmentPlan = (id: string): void => {
  const item = getInvestmentPlans().find(p => p.id === id);
  setStored(INVESTMENT_PLANS_KEY, getInvestmentPlans().filter(p => p.id !== id));
  addActivity({ action: "deleted", entity: "InvestmentPlan", entityName: item?.title || id });
};

// ─── Product Categories API ───────────────────────────────────────────────────
export type ProductCategory = {
  id: string;
  name: string;
  description: string;
  color: string;
  parentId?: string | null; // null / undefined = top-level category
  createdAt: string;
  updatedAt: string;
};

const PRODUCT_CATEGORIES_KEY = "admin-product-categories";

export const getProductCategories = (): ProductCategory[] => getStored<ProductCategory>(PRODUCT_CATEGORIES_KEY);

export const createProductCategory = (data: Omit<ProductCategory, "id" | "createdAt" | "updatedAt">): ProductCategory => {
  const item: ProductCategory = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(PRODUCT_CATEGORIES_KEY, [...getProductCategories(), item]);
  return item;
};

export const updateProductCategory = (id: string, updates: Partial<Omit<ProductCategory, "id" | "createdAt">>): ProductCategory => {
  const items = getProductCategories();
  const i = items.findIndex(c => c.id === id);
  if (i === -1) throw new Error("Category not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(PRODUCT_CATEGORIES_KEY, items);
  return items[i];
};

export const deleteProductCategory = (id: string): void => {
  const cat = getProductCategories().find(c => c.id === id);
  setStored(PRODUCT_CATEGORIES_KEY, getProductCategories().filter(c => c.id !== id));
  // Clear the deleted category from any products still referencing it,
  // so products don't silently hold a dangling category ID.
  if (cat) {
    const affected = getProducts().filter(p => p.category === cat.name);
    if (affected.length > 0) {
      setStored(PRODUCTS_KEY, getProducts().map(p =>
        p.category === cat.name ? { ...p, category: "", updatedAt: new Date().toISOString() } : p
      ));
    }
  }
};

// ─── Product Groups / Menus ───────────────────────────────────────────────────
export type ProductGroupItem = {
  productId: string;
  quantity: number;
  note?: string;
};

export type ProductGroup = {
  id: string;
  name: string;
  description?: string;
  color: string;
  items: ProductGroupItem[];
  createdAt: string;
  updatedAt: string;
};

const PRODUCT_GROUPS_KEY = "admin-product-groups";

export const getProductGroups = (): ProductGroup[] => getStored<ProductGroup>(PRODUCT_GROUPS_KEY);

export const createProductGroup = (data: Omit<ProductGroup, "id" | "createdAt" | "updatedAt">): ProductGroup => {
  const item: ProductGroup = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(PRODUCT_GROUPS_KEY, [...getProductGroups(), item]);
  return item;
};

export const updateProductGroup = (id: string, updates: Partial<Omit<ProductGroup, "id" | "createdAt">>): ProductGroup => {
  const items = getProductGroups();
  const i = items.findIndex(g => g.id === id);
  if (i === -1) throw new Error("Group not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(PRODUCT_GROUPS_KEY, items);
  return items[i];
};

export const deleteProductGroup = (id: string): void => {
  setStored(PRODUCT_GROUPS_KEY, getProductGroups().filter(g => g.id !== id));
};

// ─── Module Definitions (platform-level feature catalogue) ───────────────────
export type ModuleId =
  // CRM
  | "crm_leads" | "crm_customers"
  // Products & Inventory
  | "products" | "categories" | "brands" | "product_groups" | "attributes" | "units"
  | "stock" | "raw_materials"
  // Purchases
  | "purchases"
  // Sales
  | "sales" | "invoices" | "sale_return" | "calc_invoice"
  | "sales_agents" | "agent_performance" | "areas"
  // HRM
  | "hrm_staff" | "hrm_roles" | "hrm_org" | "hrm_recruitment"
  // Products organisation
  | "products_departments"
  // Accounting
  | "accounting_coa" | "accounting_journal" | "accounting_balance"
  | "accounting_ledger" | "accounting_pls" | "accounting_trial" | "accounting_trial6"
  | "accounting_income" | "accounting_expense" | "accounting_receipts"
  | "shareholders" | "investment_plans"
  // Manufacturing
  | "manufacturing" | "production_guide"
  // Website / CMS
  | "website_cms"
  // Repairs
  | "repair"
  // Other
  | "documents" | "media" | "users" | "settings";

export type ModuleDef = {
  id:    ModuleId;
  label: string;
  desc:  string;
  group: string;
  href:  string;
};

export const MODULE_DEFINITIONS: ModuleDef[] = [
  // ── CRM ───────────────────────────────────────────────────────────────────
  { id: "crm_leads",      label: "Leads",              desc: "Lead pipeline & prospecting",       group: "CRM",           href: "/leads"             },
  { id: "crm_customers",  label: "Customers",           desc: "Customer records & history",        group: "CRM",           href: "/customers"         },

  // ── Products & Inventory ───────────────────────────────────────────────────
  { id: "products",       label: "Products",            desc: "Product catalogue management",      group: "Products",      href: "/products"          },
  { id: "categories",     label: "Categories",          desc: "Product categories & sub-tree",     group: "Products",      href: "/categories"        },
  { id: "brands",         label: "Brands",              desc: "Brand management",                  group: "Products",      href: "/brands"            },
  { id: "product_groups", label: "Product Groups",      desc: "Group products into bundles",       group: "Products",      href: "/product-groups"    },
  { id: "attributes",     label: "Attributes",          desc: "Custom product attributes",         group: "Products",      href: "/attributes"        },
  { id: "units",               label: "Units of Measure",    desc: "Weight, volume & size units",       group: "Products",      href: "/units"                  },
  { id: "products_departments",label: "Product Departments", desc: "Departments for product classification", group: "Products",  href: "/product-departments"   },
  { id: "stock",          label: "Stock & Inventory",   desc: "Inventory levels & stock holds",    group: "Products",      href: "/stock-ledger"      },
  { id: "raw_materials",  label: "Raw Materials",       desc: "Raw material inventory & tracking", group: "Products",      href: "/raw-materials"     },
  { id: "purchases",      label: "Purchases",           desc: "Purchase orders from suppliers",    group: "Products",      href: "/purchases"         },

  // ── Sales ─────────────────────────────────────────────────────────────────
  { id: "sales",             label: "Sales & POS",       desc: "Sales orders & point-of-sale terminal", group: "Sales", href: "/sales"             },
  { id: "invoices",          label: "Invoices",           desc: "Invoice creation & tracking",           group: "Sales", href: "/invoices"          },
  { id: "sale_return",       label: "Sale Returns",       desc: "Customer return management",            group: "Sales", href: "/sale-return"       },
  { id: "calc_invoice",      label: "Invoice Calculator", desc: "Quick invoice estimate tool",           group: "Sales", href: "/calc-invoice"      },
  { id: "sales_agents",      label: "Sales Agents",       desc: "Agent accounts & commission tracking",  group: "Sales", href: "/sales-agents"      },
  { id: "agent_performance", label: "Agent Performance",  desc: "Sales performance analytics & reports", group: "Sales", href: "/agent-performance" },
  { id: "areas",             label: "Delivery Areas",     desc: "Regional delivery zones & coverage",    group: "Sales", href: "/areas"             },

  // ── HRM ───────────────────────────────────────────────────────────────────
  { id: "hrm_staff",       label: "Staff",                       desc: "Employee records & departments",    group: "HRM", href: "/staff"         },
  { id: "hrm_roles",       label: "Roles",                       desc: "Permission roles & access control", group: "HRM", href: "/roles"         },
  { id: "hrm_org",         label: "Departments & Designations",  desc: "Org chart & job descriptions",      group: "HRM", href: "/hrm-org"       },
  { id: "hrm_recruitment", label: "Recruitment",                 desc: "Job postings, applicants & interviews", group: "HRM", href: "/recruitment" },

  // ── Accounting ────────────────────────────────────────────────────────────
  { id: "accounting_coa",      label: "Chart of Accounts",  desc: "Account structure & COA",           group: "Accounting",    href: "/chart-of-accounts" },
  { id: "accounting_journal",  label: "Journal Entry",      desc: "Manual journal posting & ledger",   group: "Accounting",    href: "/journal-entry"     },
  { id: "accounting_balance",  label: "Balance Sheet",      desc: "Assets, liabilities & equity",      group: "Accounting",    href: "/balance-sheet"     },
  { id: "accounting_ledger",   label: "Ledger Report",      desc: "Account-by-account ledger detail",  group: "Accounting",    href: "/ledger-report"     },
  { id: "accounting_pls",      label: "P&L Statement",      desc: "Profit & loss report",              group: "Accounting",    href: "/pls-report"        },
  { id: "accounting_trial",    label: "Trial Balance",      desc: "Trial balance by date range",       group: "Accounting",    href: "/trial-balance"     },
  { id: "accounting_trial6",   label: "6-Col Trial Balance",desc: "6-column trial balance report",      group: "Accounting",    href: "/trial-balance-6col"},
  { id: "accounting_income",   label: "Income Report",      desc: "Revenue breakdown & analysis",      group: "Accounting",    href: "/income-report"     },
  { id: "accounting_expense",  label: "Expense Report",     desc: "Expense breakdown & analysis",      group: "Accounting",    href: "/expense-report"    },
  { id: "accounting_receipts", label: "Receipts & Payments",desc: "Cash receipts & payments log",      group: "Accounting",    href: "/receipt-payment"   },
  { id: "shareholders",        label: "Shareholders",       desc: "Investor & shareholder records",    group: "Accounting",    href: "/shareholders"      },
  { id: "investment_plans",    label: "Investment Plans",   desc: "Investment tracking & plans",       group: "Accounting",    href: "/investment-plans"  },

  // ── Manufacturing ─────────────────────────────────────────────────────────
  { id: "manufacturing",    label: "Manufacturing",       desc: "Production orders & job tracking",  group: "Manufacturing", href: "/manufacturing"   },
  { id: "production_guide", label: "Production Guide",    desc: "Manufacturing guides & BOMs",       group: "Manufacturing", href: "/production-guide"},

  // ── Website / CMS ─────────────────────────────────────────────────────────
  { id: "website_cms", label: "Website CMS", desc: "Store & website content management", group: "Website", href: "/website-cms" },

  // ── Repairs ───────────────────────────────────────────────────────────────
  { id: "repair", label: "Repair Services", desc: "Repair job tracking & management", group: "Repairs", href: "/repair" },

  // ── Other ─────────────────────────────────────────────────────────────────
  { id: "documents", label: "Documents",     desc: "Requirement & client documents",  group: "Other",  href: "/documents" },
  { id: "media",     label: "Media Library", desc: "File & image management",         group: "Other",  href: "/media"     },
  { id: "users",     label: "Users",         desc: "User accounts & access control",  group: "Other",  href: "/users"     },
  { id: "settings",  label: "Settings",      desc: "Company profile & app config",    group: "Other",  href: "/settings"  },
];

export const ALL_MODULE_IDS: ModuleId[] = MODULE_DEFINITIONS.map(m => m.id);

// ─── Module Groups API (platform-level, always global/unprefixed) ──────────────
export type ModuleGroup = {
  id:          string;
  name:        string;
  description: string;
  modules:     ModuleId[];
  createdAt:   string;
  updatedAt:   string;
};

const MODULE_GROUPS_KEY = "admin-module-groups";

/** IDs that must always be present in a group when any module from the same
 *  category is already present.  Add new module IDs here whenever a module
 *  is added to MODULES_LIST so that existing groups auto-include them. */
const MODULE_GROUP_PEERS: Record<string, string[]> = {
  accounting_trial6:    ["accounting_trial", "accounting_coa", "accounting_journal",
                         "accounting_balance", "accounting_ledger", "accounting_pls",
                         "accounting_income", "accounting_expense", "accounting_receipts"],
  products_departments: ["products", "categories", "brands", "attributes", "units", "product_groups"],
};

export const getModuleGroups = (): ModuleGroup[] => {
  try {
    const raw = _lsGet(MODULE_GROUPS_KEY);
    if (!raw) return [];
    const groups: ModuleGroup[] = JSON.parse(raw);

    // Self-healing: add any new module IDs to groups that already have a
    // peer module from the same category.
    let dirty = false;
    for (const group of groups) {
      for (const [newId, peers] of Object.entries(MODULE_GROUP_PEERS)) {
        if (!group.modules.includes(newId as ModuleId) &&
            peers.some(p => group.modules.includes(p as ModuleId))) {
          group.modules = [...group.modules, newId as ModuleId];
          dirty = true;
        }
      }
    }
    if (dirty) {
      _lsSet(MODULE_GROUPS_KEY, groups);
      _apiWrite(MODULE_GROUPS_KEY, groups);
    }
    return groups;
  } catch { return []; }
};

export const getModuleGroupById = (id: string): ModuleGroup | undefined =>
  getModuleGroups().find(g => g.id === id);

export const createModuleGroup = (
  data: Omit<ModuleGroup, "id" | "createdAt" | "updatedAt">
): ModuleGroup => {
  const now = new Date().toISOString();
  const group: ModuleGroup = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  const updated = [...getModuleGroups(), group];
  _lsSet(MODULE_GROUPS_KEY, updated);
  _apiWrite(MODULE_GROUPS_KEY, updated);
  return group;
};

export const updateModuleGroup = (
  id: string,
  updates: Partial<Omit<ModuleGroup, "id" | "createdAt">>
): ModuleGroup => {
  const groups = getModuleGroups();
  const idx = groups.findIndex(g => g.id === id);
  if (idx === -1) throw new Error("Module group not found");
  groups[idx] = { ...groups[idx], ...updates, updatedAt: new Date().toISOString() };
  _lsSet(MODULE_GROUPS_KEY, groups);
  _apiWrite(MODULE_GROUPS_KEY, groups);
  return groups[idx];
};

export const deleteModuleGroup = (id: string): void => {
  const updated = getModuleGroups().filter(g => g.id !== id);
  _lsSet(MODULE_GROUPS_KEY, updated);
  _apiWrite(MODULE_GROUPS_KEY, updated);
};

// ─── Tenants API (platform-level, always global/unprefixed) ───────────────────
export type TenantStatus = "active" | "trial" | "suspended";
export type TenantPlan   = "starter" | "professional" | "enterprise";

export type Tenant = {
  id:             string;
  name:           string;
  slug:           string;
  adminUsername:  string;
  adminPassword:  string;
  contactEmail:   string;
  status:         TenantStatus;
  plan:           TenantPlan;
  moduleGroupId?:      string;
  isDemo?:             boolean;
  demoResetInterval?:  number;  // minutes; 0 / undefined = never
  demoLastReset?:      string;  // ISO timestamp of last seed
  createdAt:           string;
  updatedAt:           string;
};

const TENANTS_KEY = "admin-tenants";

export const tenantToAdminUser = (t: Tenant): AdminUser => ({
  id:        `tenant:${t.id}`,
  username:  t.adminUsername,
  fullName:  `${t.name} Admin`,
  email:     t.contactEmail,
  role:      "admin" as UserRole,
  password:  t.adminPassword,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

export const getTenants = (): Tenant[] => getGlobal<Tenant>(TENANTS_KEY);

export const getTenantById = (id: string): Tenant | undefined =>
  getTenants().find(t => t.id === id);

export const getTenantBySlug = (slug: string): Tenant | undefined =>
  getTenants().find(t => t.slug.toLowerCase() === slug.toLowerCase());

export const getTenantByCredentials = (username: string, password: string): Tenant | undefined =>
  getTenants().find(
    t => t.adminUsername.toLowerCase() === username.toLowerCase() && t.adminPassword === password
  );

export const createTenant = (data: Omit<Tenant, "id" | "createdAt" | "updatedAt">): Tenant => {
  const now = new Date().toISOString();
  const tenant: Tenant = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  setGlobal(TENANTS_KEY, [...getTenants(), tenant]);
  // Seed the new tenant's COA from the system template (runs after module init is complete)
  try { seedTenantCOA(tenant.id); } catch (e) { console.warn("[COA seed] failed:", e); }
  return tenant;
};

/** Awaitable variant: resolves only after the server has stored the new list.
 *  Use this from UI flows where the user must see a confirmation/error toast. */
export const createTenantAsync = async (
  data: Omit<Tenant, "id" | "createdAt" | "updatedAt">,
): Promise<Tenant> => {
  const now = new Date().toISOString();
  const tenant: Tenant = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await setGlobalAsync(TENANTS_KEY, [...getTenants(), tenant]);
  try { seedTenantCOA(tenant.id); } catch (e) { console.warn("[COA seed] failed:", e); }
  return tenant;
};

export const updateTenant = (id: string, updates: Partial<Omit<Tenant, "id" | "createdAt">>): Tenant => {
  const tenants = getTenants();
  const idx = tenants.findIndex(t => t.id === id);
  if (idx === -1) throw new Error("Tenant not found");
  tenants[idx] = { ...tenants[idx], ...updates, updatedAt: new Date().toISOString() };
  setGlobal(TENANTS_KEY, tenants);
  return tenants[idx];
};

export const updateTenantAsync = async (
  id: string,
  updates: Partial<Omit<Tenant, "id" | "createdAt">>,
): Promise<Tenant> => {
  const tenants = getTenants();
  const idx = tenants.findIndex(t => t.id === id);
  if (idx === -1) throw new Error("Tenant not found");
  tenants[idx] = { ...tenants[idx], ...updates, updatedAt: new Date().toISOString() };
  await setGlobalAsync(TENANTS_KEY, tenants);
  return tenants[idx];
};

export const deleteTenant = (id: string): void => {
  setGlobal(TENANTS_KEY, getTenants().filter(t => t.id !== id));
  // Best-effort namespace purge — fire-and-forget is acceptable here because
  // the tenant record itself is already gone from the authoritative list.
  kvDeleteNamespace(`t:${id}`).catch(() => {});
};

/** Awaitable variant of deleteTenant. Resolves only after the server confirms
 *  both the tenant list update AND the full namespace purge are persisted. */
export const deleteTenantAsync = async (id: string): Promise<void> => {
  await setGlobalAsync(TENANTS_KEY, getTenants().filter(t => t.id !== id));
  // Purge every key stored under this tenant's namespace from the database.
  // This is the authoritative cleanup — the namespace delete is atomic on the server.
  await kvDeleteNamespace(`t:${id}`);
  // Also evict all in-memory cache entries for this tenant so stale data
  // never bleeds into a subsequent session within the same browser tab.
  for (const k of [..._memRaw.keys()]) {
    if (k.startsWith(`t:${id}:`)) _memRaw.delete(k);
  }
};

/** Returns estimated record counts for a tenant (reads all namespaced keys). */
export const getTenantStats = (tenantId: string): Record<string, number> => {
  const keys: string[] = [
    "admin-leads", "admin-customers", "admin-products",
    "admin-sales", "admin-purchase-orders", "admin-stock", "admin-hrm-staff",
  ];
  const result: Record<string, number> = {};
  for (const k of keys) {
    try {
      const raw = _lsGet(`t:${tenantId}:${k}`);
      const arr = raw ? JSON.parse(raw) : [];
      result[k] = Array.isArray(arr) ? arr.length : 0;
    } catch { result[k] = 0; }
  }
  return result;
};

// ─── Admin Users API ──────────────────────────────────────────────────────────
export type UserRole = "superadmin" | "admin" | "manager" | "staff" | "sales_agent";

export type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  password: string;
  assignedTenants?: string[];   // for "manager" role: tenant IDs this user can view
  createdAt: string;
  updatedAt: string;
};

const USERS_KEY = "admin-users";

function ensureDefaultSuperadmin() {
  try {
    const existing: AdminUser[] = getGlobal<AdminUser>(USERS_KEY);
    const hasSuper = existing.some(u => u.id === "u-superadmin");
    if (!hasSuper) {
      const superadmin: AdminUser = {
        id: "u-superadmin",
        username: "admin",
        fullName: "Super Admin",
        email: "admin@onesoft.com",
        role: "superadmin",
        password: "Onesoft@2024",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setGlobal(USERS_KEY, [superadmin, ...existing.filter(u => u.id !== "u-superadmin")]);
    }
  } catch { /* ignore */ }
}
ensureDefaultSuperadmin();

// Platform users (always global/unprefixed)
export const getAdminUsers = (): AdminUser[] => {
  ensureDefaultSuperadmin();
  return getGlobal<AdminUser>(USERS_KEY);
};

export const getAdminUserByUsername = (username: string): AdminUser | undefined =>
  getAdminUsers().find(u => u.username.toLowerCase() === username.toLowerCase());

export const getAdminUserById = (id: string): AdminUser | undefined => {
  if (id.startsWith("tenant:")) {
    const tenantId = id.slice(7);
    const tenant = getTenantById(tenantId);
    return tenant ? tenantToAdminUser(tenant) : undefined;
  }
  if (id.startsWith("staff:")) {
    const staffId = id.slice(6);
    const s = getStaff().find(x => x.id === staffId);
    return s ? staffToAdminUser(s) : undefined;
  }
  if (id.startsWith("agent:")) {
    const agentId = id.slice(6);
    const a = getSalesAgents().find(x => x.id === agentId);
    return a ? agentToAdminUser(a) : undefined;
  }
  return getAdminUsers().find(u => u.id === id);
};

export const createAdminUser = (user: Omit<AdminUser, "id" | "createdAt" | "updatedAt">): AdminUser => {
  const newUser: AdminUser = {
    ...user,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const updated = [...getAdminUsers(), newUser];
  // Update in-memory cache immediately so the rest of the app sees the new
  // user; then persist to server via setGlobalAsync for durability.
  _lsCache(USERS_KEY, updated);
  setGlobalAsync(USERS_KEY, updated).catch(err =>
    console.error("[users] Failed to persist new user to server:", err)
  );
  return newUser;
};

export const createAdminUserAsync = async (user: Omit<AdminUser, "id" | "createdAt" | "updatedAt">): Promise<AdminUser> => {
  const newUser: AdminUser = {
    ...user,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const updated = [...getAdminUsers(), newUser];
  _lsCache(USERS_KEY, updated);
  await setGlobalAsync(USERS_KEY, updated);
  return newUser;
};

export const updateAdminUser = (id: string, updates: Partial<Omit<AdminUser, "id" | "createdAt">>): AdminUser => {
  const users = getAdminUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) throw new Error("User not found");
  users[index] = { ...users[index], ...updates, updatedAt: new Date().toISOString() };
  _lsCache(USERS_KEY, users);
  setGlobalAsync(USERS_KEY, users).catch(err =>
    console.error("[users] Failed to persist user update to server:", err)
  );
  return users[index];
};

export const deleteAdminUser = (id: string): void => {
  const updated = getAdminUsers().filter(u => u.id !== id);
  _lsCache(USERS_KEY, updated);
  setGlobalAsync(USERS_KEY, updated).catch(err =>
    console.error("[users] Failed to persist user deletion to server:", err)
  );
};

// ─── Team Members API (for New Document "Prepared By") ───────────────────────
const TEAM_KEY = "admin-team-members";
const DEFAULT_TEAM = ["Ali Raza", "Umar Farooq", "Hassan Sheikh", "Bilal Ahmed", "Zainab Mirza", "Sara Qureshi"];

export const getTeamMembers = (): string[] => {
  try {
    const raw = _lsGet(tenantKey(TEAM_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const sk = tenantKey(TEAM_KEY);
  _lsSet(sk, DEFAULT_TEAM);
  _apiWrite(sk, DEFAULT_TEAM);
  return DEFAULT_TEAM;
};

// ─── Products (catalogue) API ─────────────────────────────────────────────────
export type ProductStatus    = "Active" | "Inactive" | "Draft";
export type ProductCondition = "New" | "Used" | "Fresh" | "Refurbished" | "Damaged";

export type ProductVariant = {
  id: string;
  attributes: Record<string, string>; // e.g. { "Color": "Red" }
  price: string;
  purchasePrice?: string;
  image?: string;
  sku?: string;
  barcode?: string;
  stock?: string;
  condition?: string;
  clubcardPrice?: string;
  showOnWeb?: boolean;
  // Optional per-variant overrides for product-level fields
  localName?: string;
  model?: string;
  brand?: string;
  category?: string;
  department?: string;
  unit?: string;
  costPrice?: string;
  wholesalePrice?: string;
  websitePrice?: string;
  websitePriceWas?: string;
  status?: string;
  description?: string;
};

export type Product = {
  id: string;
  name: string;
  localName?: string;        // Local / alternate name of the product (optional)
  model?: string;            // Model number or variant identifier
  sku: string;
  barcode?: string;          // Barcode / QR code value for scanning
  brand: string;
  category: string;
  subcategory?: string;      // Subcategory within the product category
  subSubcategory?: string;   // Sub-sub-category (3rd level under subcategory)
  department?: string;       // Department this product belongs to (optional)
  unit: string;
  purchasePrice?: string;    // Purchase price (from supplier)
  costPrice?: string;        // Cost price per unit (internal cost including overheads)
  price: string;             // Retail sale price per unit
  wholesalePrice?: string;   // Wholesale price per unit
  commissionPct?: string;    // Sales agent commission percentage on this product
  openingStock?: string;     // Initial stock quantity when product is created
  stockAlertValue?: string;  // Low-stock alert threshold (triggers alert when stock falls below)
  description: string;
  status: ProductStatus;
  condition?: ProductCondition; // Physical condition of the product
  thumbnail?: string;
  images?: string[];
  showOnWeb?: boolean;       // Whether the product is visible on the tenant store website
  websitePrice?: string;     // Current/sale price shown on the website
  websitePriceWas?: string;  // Original "was" price shown crossed out on the website
  clubcardPrice?: string;    // Exclusive Clubcard member price
  clubcardBogo?: boolean;    // Clubcard Option 2: Buy 1 Get 1 Free
  productAttributes?: string[];  // attribute names assigned to this product
  variants?: ProductVariant[];   // per-variant price/stock combinations
  createdAt: string;
  updatedAt: string;
};

// ─── Media Library ────────────────────────────────────────────────────────────
export type MediaLibraryItem = {
  id:        string;
  src:       string;    // base64 data URL or external URL
  name:      string;
  createdAt: number;
};

const MEDIA_LIBRARY_KEY = "admin-media-library";

export const getMediaLibraryItems = (): MediaLibraryItem[] =>
  getStored<MediaLibraryItem>(MEDIA_LIBRARY_KEY);

export function addMediaLibraryItem(item: MediaLibraryItem): void {
  setStored(MEDIA_LIBRARY_KEY, [...getMediaLibraryItems(), item]);
}

export function deleteMediaLibraryItem(id: string): void {
  setStored(MEDIA_LIBRARY_KEY, getMediaLibraryItems().filter(i => i.id !== id));
}

// ─── Products (catalogue) ─────────────────────────────────────────────────────
const PRODUCTS_KEY = "admin-products";

export const getProducts = (): Product[] => getStored<Product>(PRODUCTS_KEY);

/**
 * Force-write all in-memory products to PostgreSQL.
 * Throws on failure so the caller can surface the error.
 */
export async function syncProductsToStore(tenantId?: string | null): Promise<number> {
  const products = getProducts();
  if (products.length === 0) return 0;
  const ns = tenantId ? `t:${tenantId}` : "global";

  // Inject live stock qty into each product's openingStock field so the
  // tenant-store always shows current available stock rather than the static
  // value that was entered when the product was first created.
  const liveStock = getStock();
  const productsWithStock = products.map(p => {
    const liveQty = getProductStockQty(p, liveStock);
    if (liveQty === null) return p;                       // no stock records — keep original
    return { ...p, openingStock: String(liveQty) };
  });

  // Use a direct fetch that throws on error instead of the fire-and-forget helper
  const url = `/api/kv/${encodeURIComponent(ns)}/${encodeURIComponent(PRODUCTS_KEY)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: productsWithStock }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`Server returned ${res.status}: ${text}`);
  }
  return productsWithStock.length;
}

// ── SKU uniqueness helper ──────────────────────────────────────────────────
/**
 * Returns the name of the product (or "ProductName (variant)") that already
 * owns this SKU, or null if it is available.
 *
 * @param sku            - SKU to check.
 * @param excludeProductId - Skip this product's own main-SKU (used when updating a product's main SKU).
 * @param excludeVariantId - Skip this specific variant (used when updating a variant's SKU).
 */
const skuConflict = (sku: string, excludeProductId?: string, excludeVariantId?: string): string | null => {
  if (!sku.trim()) return null;
  const skuLower = sku.trim().toLowerCase();
  for (const p of getProducts()) {
    // Check main product SKU (skip the product whose own main SKU we're updating)
    if (p.id !== excludeProductId && p.sku.trim().toLowerCase() === skuLower) {
      return p.name;
    }
    // Check every variant in every product
    for (const v of (p.variants ?? [])) {
      if (v.id === excludeVariantId) continue;        // skip the variant being edited
      if (v.sku?.trim().toLowerCase() === skuLower) {
        return `${p.name} — variant`;
      }
    }
  }
  return null;
};

// ── COA ledger sync for per-product Sales Revenue & Purchase accounts ─────────
function _coaAccounts(): Account[] {
  const raw = _lsGet(tenantKey(COA_KEY));
  return raw ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : [];
}
function _saveCoaAccounts(accounts: Account[]): void {
  const sk = tenantKey(COA_KEY);
  _lsSet(sk, accounts);
  _apiWrite(sk, accounts);
}

/** Stable URL-safe slug from a category name. */
function _catSlug(category: string): string {
  return (category || "uncategorised")
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "uncategorised";
}

/**
 * Upsert a single category-level COA ledger.
 * All products sharing the same category share the same ledger.
 */
function _upsertCategoryLedger(
  category: string,
  ledgerId: string,
  parentSysId: string,
  baseCode: number,
  label: string,
  head: AccountHead,
  subType: string,
): void {
  const accounts = _coaAccounts();
  const displayName = category.trim() || "Uncategorised";
  const name = `${displayName} | ${label}`;
  const idx = accounts.findIndex(a => a.id === ledgerId);
  const now = new Date().toISOString();
  if (idx === -1) {
    const siblings = accounts.filter(a => a.parentId === parentSysId);
    const nextCode = siblings.reduce((max, a) => {
      const n = parseInt(a.code ?? "0", 10); return n > max ? n : max;
    }, baseCode) + 1;
    accounts.push({
      id: ledgerId, code: String(nextCode), name,
      head, accountType: "Ledger", parentId: parentSysId, subType,
      description: `${label} account for the ${displayName} category`,
      openingBalance: 0, paymentType: null, isActive: true,
      createdAt: now, updatedAt: now,
    });
    _saveCoaAccounts(accounts);
  } else if (accounts[idx].name !== name) {
    accounts[idx] = {
      ...accounts[idx], name,
      description: `${label} account for the ${displayName} category`,
      updatedAt: now,
    };
    _saveCoaAccounts(accounts);
  }
}

/**
 * Sync the three category-level ledgers for a product:
 *   Category | Revenue   → under Sales Revenue (3100)
 *   Category | Purchase  → under Purchases (4600)
 *   Category | Inventory → under Inventory / Stock (1140)
 */
function _syncProductLedgers(product: Product): void {
  const cat  = product.category?.trim() || "Uncategorised";
  const slug = _catSlug(cat);
  _upsertCategoryLedger(cat, `sr-cat-${slug}`,  SYS_ACCS.SALES_REVENUE, 3100, "Revenue",   "Revenue / Income", "Sales");
  _upsertCategoryLedger(cat, `pur-cat-${slug}`, SYS_ACCS.PURCHASE_EXP,  4600, "Purchase",  "Expense",          "Purchases");
  _upsertCategoryLedger(cat, `inv-cat-${slug}`, SYS_ACCS.INVENTORY,     1140, "Inventory", "Assets",           "Inventory");
}

/**
 * Category-based ledgers are shared across all products in a category.
 * We do NOT remove them when a single product is deleted — the category
 * ledger may still be referenced by other products.
 * Orphan cleanup is handled by initTenantCOA if no products use the category.
 */
function _removeProductLedgers(_productId: string): void {
  // intentional no-op: category ledgers outlive individual products
}

/** Generate a random EAN-13 barcode (12 random digits + check digit). */
export function generateEan13(): string {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const check  = (10 - (digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
  return [...digits, check].join("");
}

/**
 * Generate a unique product SKU.
 * Format: {3-4 LETTER PREFIX}-{4 RANDOM DIGITS}  e.g. "APPL-4827", "MILK-0312"
 * Prefix is derived from the product name (letters only, uppercased, max 4 chars).
 * Retries up to 20 times to avoid collisions; appends timestamp suffix as last resort.
 */
export function generateProductSku(name: string): string {
  const existing = new Set(
    getProducts().flatMap(p => [
      p.sku?.trim().toUpperCase(),
      ...(p.variants ?? []).map(v => v.sku?.trim().toUpperCase()),
    ]).filter(Boolean)
  );

  // Build prefix: up to 4 uppercase letters from the name
  const letters = (name || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  const prefix  = letters.slice(0, 4) || "PRD";

  const rand4 = () => String(Math.floor(Math.random() * 10000)).padStart(4, "0");

  for (let attempt = 0; attempt < 20; attempt++) {
    const sku = `${prefix}-${rand4()}`;
    if (!existing.has(sku)) return sku;
  }
  // Absolute fallback — timestamp suffix guarantees uniqueness
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/**
 * One-time migration: scan all stored products and assign an auto-generated SKU
 * to any product (or variant) that has an empty / missing SKU.
 * Safe to call multiple times — only writes if changes were actually needed.
 */
export function backfillMissingSKUs(): void {
  // ── Step 1: ensure every product (and variant) has a SKU ─────────────────
  const products = getProducts();
  let prodChanged = false;
  for (const p of products) {
    if (!p.sku?.trim()) {
      p.sku = generateProductSku(p.name);
      prodChanged = true;
    }
    if (p.variants?.length) {
      for (const v of p.variants) {
        if (!v.sku?.trim()) {
          v.sku = generateProductSku(`${p.name} ${Object.values(v.attributes ?? {}).join(" ")}`);
          prodChanged = true;
        }
      }
    }
  }
  if (prodChanged) setStored(PRODUCTS_KEY, products);

  // ── Step 2: backfill SKU on any stock records that still have none ────────
  // Now that every product has a SKU we can match stock records by productName
  // and stamp the correct SKU on them, making all deductions SKU-only from here on.
  const stocks = getStock();
  let stockChanged = false;
  const nameToProd = new Map<string, typeof products[number]>();
  for (const p of products) {
    if (p.name?.trim()) nameToProd.set(p.name.trim().toLowerCase(), p);
  }
  for (const s of stocks) {
    if (!s.sku?.trim() && s.productName?.trim()) {
      const prod = nameToProd.get(s.productName.trim().toLowerCase());
      if (prod?.sku?.trim()) {
        s.sku = prod.sku.trim();
        stockChanged = true;
      } else if (!prod) {
        // No matching product — generate a stable SKU from the product name so
        // this stock record is still addressable by SKU going forward.
        s.sku = generateProductSku(s.productName);
        stockChanged = true;
      }
    }
  }
  if (stockChanged) setStored(STOCK_KEY, stocks);
}

/**
 * One-time migration: for every customer/supplier that has a non-zero
 * openingBalance stored on their record but no corresponding journal entry,
 * post the opening-balance JE automatically.
 * Safe to call multiple times — skips any customer whose OB JE already exists.
 */
export function backfillOpeningBalanceJEs(): void {
  const customers = getCustomers();
  for (const c of customers) {
    if (!c.openingBalance || c.openingBalance === 0) continue;
    if (!c.ledgerAccountId) continue;
    const ref = `${_OB_REF_PREFIX}${c.ledgerAccountId}`;
    const alreadyExists = getJournalEntries().some(e => e.reference === ref);
    if (alreadyExists) continue;
    const isSupplier = (c.customerRole ?? "Buyer") === "Supplier";
    const displayName = c.name + (c.company ? ` (${c.company})` : "");
    const obDate = c.customerSince ?? c.createdAt.slice(0, 10);
    _upsertOpeningBalanceJE(c.ledgerAccountId, isSupplier, c.openingBalance, obDate, displayName);
  }
}

/**
 * One-time migration: find completed POS sales that have an outstanding balance
 * (amountPaid < grandTotal) but whose journal entry debits a Cash/Bank account
 * instead of the customer's AR sub-ledger.  Re-routes the debit to AR.
 * Safe to call multiple times — skips sales whose JE already debits an AR account.
 */
export function backfillPOSCreditSaleJEs(): void {
  const customers = getCustomers();
  const allProducts = getProducts();

  // ── Helper: compute grand total from a sale (mirrors saleTotalFull in sales.tsx) ──
  const _lineTotal = (item: SaleItem): number => {
    const q = parseFloat(item.qty) || 0, p = parseFloat(item.unitPrice) || 0;
    if (item.bogoApplied) return Math.ceil(q / 2) * p;
    const d = parseFloat(item.discount) || 0;
    if (item.discountType === "amt") return Math.max(0, q * p - d);
    return q * p * (1 - d / 100);
  };
  const _grandTotal = (sale: Sale): { subtotal: number; taxAmt: number; grandTotal: number; costTotal: number } => {
    const items = sale.items ?? [];
    const sub = items.reduce((s, i) => s + _lineTotal(i), 0);
    const invDiscVal = parseFloat(sale.invoiceDiscount || "0") || 0;
    const afterDisc = invDiscVal <= 0 ? sub
      : sale.invoiceDiscountType === "amt" ? Math.max(0, sub - invDiscVal)
      : sub * (1 - invDiscVal / 100);
    const taxPct = (parseFloat(sale.taxRate || "0") || 0) / 100;
    const taxAmt = parseFloat((afterDisc * taxPct).toFixed(2));
    const delivery = parseFloat(sale.deliveryCharges || "0") || 0;
    const costTotal = items.reduce((s, i) => {
      const prod = findProductForItem(i, allProducts);
      return s + effectiveItemCost(i, prod) * (parseFloat(i.qty) || 0);
    }, 0);
    return {
      subtotal:  parseFloat(afterDisc.toFixed(2)),
      taxAmt,
      grandTotal: parseFloat((afterDisc + taxAmt + delivery).toFixed(2)),
      costTotal:  parseFloat(costTotal.toFixed(2)),
    };
  };

  // ── Part A: Create JEs for completed/credit sales that have none ─────────
  for (const sale of getSales()) {
    if (sale.status !== "Completed" && sale.status !== "On Credit") continue;
    if (sale.jeId) continue; // already linked — handled in Part B

    const items = sale.items ?? [];
    if (items.length === 0) continue;

    const { subtotal, taxAmt, grandTotal, costTotal } = _grandTotal(sale);
    if (!(grandTotal > 0.005)) continue;

    const amountPaid = parseFloat(sale.amountPaid || "0") || 0;
    const je = autoPostSaleJE({
      source:        "POS",
      reference:     sale.saleNumber || "",
      customer:      sale.customer || "Walk-in",
      date:          sale.saleDate || new Date().toISOString().slice(0, 10),
      paymentMethod: (sale.paymentMethod as SalePayment) || "Cash",
      subtotal,
      taxAmount:     taxAmt,
      grandTotal,
      costTotal,
      amountPaid,
    });
    if (je) {
      updateSale(sale.id, { jeId: je.id });
    }
  }

  // ── Part B: Re-route existing JEs that debit Cash/Bank for credit sales ──
  // (These were correctly created but the debit side points at Cash/Bank
  //  instead of the customer's AR/AP sub-ledger.)
  const cbIds = new Set(getCashBankLedgers().map(a => a.id));
  const contactLedgerIds = new Set(
    getAccounts()
      .filter(a => a.accountType === "Ledger" && (a.subType === "Receivable" || a.subType === "Payable"))
      .map(a => a.id)
  );
  contactLedgerIds.add(SYS_ACCS.AR_TRADE);

  // Re-read after Part A mutations so we see the freshly-linked jeIds
  const freshEntries = getJournalEntries();

  for (const sale of getSales()) {
    if (sale.status !== "Completed") continue;
    if (!sale.jeId) continue;

    const paid = parseFloat(sale.amountPaid || "0") || 0;
    const je = freshEntries.find(e => e.id === sale.jeId);
    if (!je) continue;

    const grandTotal = je.totalDebit ?? 0;
    if (!(grandTotal > 0.005)) continue;
    if (paid >= grandTotal - 0.005) continue; // fully paid — Cash debit is correct

    const debitLineIdx = je.lines.findIndex(l => l.debit > 0);
    if (debitLineIdx === -1) continue;
    const debitLine = je.lines[debitLineIdx];

    if (contactLedgerIds.has(debitLine.ledgerId)) continue; // already AR/AP — correct
    if (!cbIds.has(debitLine.ledgerId)) continue;           // unexpected structure — leave alone

    const customerName = sale.customer || "";
    const customerRec = customers.find(c =>
      c.name === customerName || (c.name + (c.company ? ` (${c.company})` : "")) === customerName
    );
    const arLedgerId = customerRec?.ledgerAccountId
      || findSubLedgerForParty(customerName, SYS_ACCS.AR_GROUP)
      || SYS_ACCS.AR_TRADE;

    const updatedLines = [...je.lines];
    updatedLines[debitLineIdx] = { ...debitLine, ledgerId: arLedgerId };
    updateJournalEntry(je.id, { lines: updatedLines });
  }
}

export const createProduct = (data: Omit<Product, "id" | "createdAt" | "updatedAt">): Product => {
  // Auto-generate SKU if not provided — SKU is required on every product
  const sku = data.sku?.trim() || generateProductSku(data.name);
  if (sku !== data.sku?.trim()) {
    data = { ...data, sku };
  }
  if (data.sku?.trim()) {
    const conflict = skuConflict(data.sku);
    if (conflict) throw new Error(`SKU "${data.sku}" is already used by "${conflict}".`);
  }
  // Auto-generate SKU for any variants that are missing one
  if (data.variants?.length) {
    data = {
      ...data,
      variants: data.variants.map(v =>
        v.sku?.trim() ? v : { ...v, sku: generateProductSku(`${data.name} ${Object.values(v.attributes ?? {}).join(" ")}`) }
      ),
    };
  }
  const item: Product = {
    ...data,
    barcode: data.barcode?.trim() || generateEan13(),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(PRODUCTS_KEY, [...getProducts(), item]);
  addActivity({ action: "created", entity: "Product", entityName: item.name, detail: item.sku ? `SKU: ${item.sku}` : undefined });
  _syncProductLedgers(item);
  return item;
};

export const updateProduct = (id: string, updates: Partial<Omit<Product, "id" | "createdAt">>): Product => {
  const items = getProducts();
  const i = items.findIndex(p => p.id === id);
  if (i === -1) throw new Error("Product not found");
  // Auto-generate SKU if neither the update nor the existing record has one
  if (!updates.sku?.trim() && !items[i].sku?.trim()) {
    updates = { ...updates, sku: generateProductSku(updates.name ?? items[i].name) };
  }
  // Validate main product SKU uniqueness
  if (updates.sku?.trim()) {
    const conflict = skuConflict(updates.sku, id);
    if (conflict) throw new Error(`SKU "${updates.sku}" is already used by "${conflict}".`);
  }
  // Auto-generate SKU for any variants that are missing one, then validate uniqueness.
  // Skipping unchanged SKUs prevents false "duplicate" errors when editing other
  // variant fields while a product already has any pre-existing shared SKUs.
  if (updates.variants) {
    const productName = updates.name ?? items[i].name;
    updates = {
      ...updates,
      variants: updates.variants.map(v =>
        v.sku?.trim() ? v : { ...v, sku: generateProductSku(`${productName} ${Object.values(v.attributes ?? {}).join(" ")}`) }
      ),
    };
    const storedVariantSkus = new Map(
      (items[i].variants ?? []).map(v => [v.id, (v.sku ?? "").trim().toLowerCase()])
    );
    for (const v of updates.variants) {
      if (!v.sku?.trim()) continue;
      const newSkuLower = v.sku.trim().toLowerCase();
      const storedSku   = storedVariantSkus.get(v.id) ?? "";
      if (newSkuLower === storedSku) continue;      // SKU unchanged — skip uniqueness check
      const conflict = skuConflict(v.sku, id, v.id);
      if (conflict) throw new Error(`Variant SKU "${v.sku}" is already used by "${conflict}".`);
    }
  }
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(PRODUCTS_KEY, items);
  addActivity({ action: "updated", entity: "Product", entityName: items[i].name });
  _syncProductLedgers(items[i]);
  return items[i];
};

export const deleteProduct = (id: string): void => {
  const item = getProducts().find(p => p.id === id);
  setStored(PRODUCTS_KEY, getProducts().filter(p => p.id !== id));
  addActivity({ action: "deleted", entity: "Product", entityName: item?.name || id });
  _removeProductLedgers(id);
  // Clean up orphaned stock items and ledger entries for this product's SKUs.
  // StockItem links to a product by SKU, not by product ID.
  if (item) {
    const skus = new Set<string>();
    if (item.sku?.trim()) skus.add(item.sku.trim().toLowerCase());
    item.variants?.forEach(v => { if (v.sku?.trim()) skus.add(v.sku.trim().toLowerCase()); });
    if (skus.size > 0) {
      setStored(STOCK_KEY, getStock().filter(s => !skus.has(s.sku?.trim().toLowerCase())));
      setStored(LEDGER_KEY, getStockLedger().filter(e => !skus.has(e.entityId?.trim().toLowerCase())));
    }
  }
};

export const reorderProducts = (orderedIds: string[]): void => {
  const all = getProducts();
  const map = new Map(all.map(p => [p.id, p]));
  const reordered = orderedIds.map(id => map.get(id)).filter(Boolean) as Product[];
  const leftover  = all.filter(p => !orderedIds.includes(p.id));
  setStored(PRODUCTS_KEY, [...reordered, ...leftover]);
};

/**
 * Bulk import helper — does ONE in-memory read + ONE write for the entire
 * batch instead of N individual read→append→write cycles.
 */
export const bulkImportProducts = async (
  toCreate: Omit<Product, "id" | "createdAt" | "updatedAt">[],
  toUpdate: { id: string; data: Partial<Omit<Product, "id" | "createdAt">> }[],
): Promise<{ created: Product[]; updated: Product[] }> => {
  const existing = getProducts();
  const idxMap   = new Map(existing.map((p, i) => [p.id, i]));
  const now      = new Date().toISOString();
  const today    = now.slice(0, 10);

  // Apply updates in-place
  const updated: Product[] = [];
  for (const { id, data } of toUpdate) {
    const idx = idxMap.get(id);
    if (idx !== undefined) {
      existing[idx] = { ...existing[idx], ...data, updatedAt: now };
      updated.push(existing[idx]);
    }
  }

  // Build new product records — auto-generate SKU if not provided
  const created: Product[] = toCreate.map(data => {
    const sku = data.sku?.trim() || generateProductSku(data.name);
    const variants = data.variants?.map(v =>
      v.sku?.trim() ? v : { ...v, sku: generateProductSku(`${data.name} ${Object.values(v.attributes ?? {}).join(" ")}`) }
    );
    return {
      ...data,
      sku,
      ...(variants ? { variants } : {}),
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
  });

  // Single bulk write (existing already has updates applied)
  const finalList = [...existing, ...created];
  console.info(`[bulkImport] products: ${existing.length} existing + ${created.length} new = ${finalList.length} total`);

  // Write to memory immediately (so UI can update); server write follows via _apiWrite.
  const _lsSetLocal = (storageKey: string, value: unknown) => {
    _memRaw.set(storageKey, JSON.stringify(value));
  };

  // Helper: resolve namespace + key for kvPut from a storageKey
  const _resolveNsKey = (sk: string): [string, string] => {
    const m = sk.match(/^t:([^:]+):(.+)$/);
    return m ? [`t:${m[1]}`, m[2]] : ["global", sk];
  };

  const productsSk = tenantKey(PRODUCTS_KEY);
  _lsSetLocal(productsSk, finalList);

  // ── Create opening-balance stock entries for new AND updated products ──
  // For updates: only create a stock item if openingStock > 0 and none exists yet.
  // This makes re-imports "fill in" missing stock without overwriting manually
  // adjusted quantities.
  const currentStock = getStock();
  const newStockItems: StockItem[] = [];
  const ledgerEntries: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  // Build a unified list of product records to check for stock: new + updated
  type StockCandidate = { id: string; name: string; sku?: string; unit?: string;
    openingStock?: string; stockAlertQty?: string };
  const candidates: StockCandidate[] = [
    ...created,
    // For updates, merge the original product with the incoming data so we have
    // the latest name/sku/openingStock.
    ...toUpdate.map(({ id, data }) => {
      const orig = existing.find(p => p.id === id) || {} as Product;
      return { ...orig, ...data, id } as StockCandidate;
    }),
  ];

  for (const prod of candidates) {
    const qty = parseFloat((prod as StockCandidate & { openingStock?: string }).openingStock || "0");
    if (!qty || qty <= 0) continue;

    // If product has a SKU use it; otherwise leave blank so the stockBySkuMap
    // falls back to productName-based lookup (matches getProductStock logic).
    const sku = prod.sku?.trim() || "";

    // Only create a stock item if none already exists for this product in Warehouse/For Sale.
    // This prevents double-counting on re-import while still filling in missing entries.
    const alreadyExists = [...currentStock, ...newStockItems].some(s =>
      s.store === "Warehouse" && s.stockType === "For Sale" &&
      (sku
        ? s.sku?.trim() === sku
        : s.productName.trim().toLowerCase() === prod.name.trim().toLowerCase()),
    );
    if (alreadyExists) continue;

    const item: StockItem = {
      id:           crypto.randomUUID(),
      productName:  prod.name,
      sku,
      store:        "Warehouse",
      stockType:    "For Sale",
      quantity:     String(qty),
      minLevel:     prod.stockAlertQty || "0",
      unit:         prod.unit || "",
      holdCustomer: "",
      holdReason:   "",
      notes:        "Opening balance — imported",
      createdAt:    now,
      updatedAt:    now,
    };
    newStockItems.push(item);
    ledgerEntries.push({
      entityType: "product",
      entityId:   item.id,
      entityName: item.productName,
      date:       today,
      txType:     "opening-balance",
      reference:  "IMPORT",
      qtyBefore:  0,
      qtyChange:  qty,
      qtyAfter:   qty,
      unit:       item.unit,
      notes:      "Opening balance — imported",
    });
  }

  console.info(`[bulkImport] stock: ${newStockItems.length} new items created (${candidates.length} candidates checked, ${currentStock.length} existing)`);

  const finalStock = newStockItems.length > 0 ? [...currentStock, ...newStockItems] : currentStock;
  const stockSk = tenantKey(STOCK_KEY);
  let finalLedger: StockLedgerEntry[] | null = null;

  if (newStockItems.length > 0) {
    _lsSetLocal(stockSk, finalStock);
    const existingLedger = getStockLedger();
    const fullEntries: StockLedgerEntry[] = ledgerEntries.map(e => ({
      ...e,
      id:        crypto.randomUUID(),
      createdAt: now,
    }));
    finalLedger = [...existingLedger, ...fullEntries];
    const ledgerSk = tenantKey(LEDGER_KEY);
    _lsSetLocal(ledgerSk, finalLedger);
  }

  // ── Await PostgreSQL writes so data survives page refresh ──────────────────
  const [productsNs, productsKey] = _resolveNsKey(productsSk);
  const writes: Promise<void>[] = [kvPut(productsNs, productsKey, finalList)];

  if (newStockItems.length > 0) {
    const [stockNs, stockKey] = _resolveNsKey(stockSk);
    writes.push(kvPut(stockNs, stockKey, finalStock));
    if (finalLedger) {
      const ledgerSk = tenantKey(LEDGER_KEY);
      const [ledgerNs, ledgerKey] = _resolveNsKey(ledgerSk);
      writes.push(kvPut(ledgerNs, ledgerKey, finalLedger));
    }
  }

  try {
    await Promise.all(writes);
    console.info(`[bulkImport] ✓ ${writes.length} key(s) persisted to server`);
  } catch (err) {
    console.warn("[bulkImport] ✗ server write failed — data only in memory:", err);
  }

  return { created, updated };
};

// ─── Brands API ───────────────────────────────────────────────────────────────
export type BrandStatus = "Active" | "Inactive";

export type Brand = {
  id: string;
  color: string;
  name: string;
  website: string;
  description: string;
  status: BrandStatus;
  createdAt: string;
  updatedAt: string;
};

const BRANDS_KEY = "admin-brands";

export const getBrands = (): Brand[] => getStored<Brand>(BRANDS_KEY);

export const createBrand = (data: Omit<Brand, "id" | "createdAt" | "updatedAt">): Brand => {
  const item: Brand = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(BRANDS_KEY, [...getBrands(), item]);
  return item;
};

export const updateBrand = (id: string, updates: Partial<Omit<Brand, "id" | "createdAt">>): Brand => {
  const items = getBrands();
  const i = items.findIndex(b => b.id === id);
  if (i === -1) throw new Error("Brand not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(BRANDS_KEY, items);
  return items[i];
};

export const deleteBrand = (id: string): void => {
  setStored(BRANDS_KEY, getBrands().filter(b => b.id !== id));
};

// ─── Product Departments API ──────────────────────────────────────────────────

export type ProductDepartmentStatus = "Active" | "Inactive";

export type ProductDepartment = {
  id:          string;
  name:        string;
  description: string;
  status:      ProductDepartmentStatus;
  createdAt:   string;
  updatedAt:   string;
};

const PRODUCT_DEPTS_KEY = "admin-product-departments";

export const getProductDepartments = (): ProductDepartment[] => getStored<ProductDepartment>(PRODUCT_DEPTS_KEY);

export const createProductDepartment = (data: Omit<ProductDepartment, "id" | "createdAt" | "updatedAt">): ProductDepartment => {
  const item: ProductDepartment = {
    ...data,
    id:        crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(PRODUCT_DEPTS_KEY, [...getProductDepartments(), item]);
  return item;
};

export const updateProductDepartment = (id: string, updates: Partial<Omit<ProductDepartment, "id" | "createdAt">>): ProductDepartment => {
  const items = getProductDepartments();
  const i = items.findIndex(d => d.id === id);
  if (i === -1) throw new Error("Product department not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(PRODUCT_DEPTS_KEY, items);
  return items[i];
};

export const deleteProductDepartment = (id: string): void => {
  setStored(PRODUCT_DEPTS_KEY, getProductDepartments().filter(d => d.id !== id));
};

// ─── Attributes API ───────────────────────────────────────────────────────────
export type AttributeType = "text" | "number" | "boolean" | "select";

export type Attribute = {
  id: string;
  name: string;
  type: AttributeType;
  values: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const ATTRIBUTES_KEY = "admin-attributes";

export const getAttributes = (): Attribute[] => getStored<Attribute>(ATTRIBUTES_KEY);

export const createAttribute = (data: Omit<Attribute, "id" | "createdAt" | "updatedAt" | "active"> & { active?: boolean }): Attribute => {
  const item: Attribute = {
    active: true,
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(ATTRIBUTES_KEY, [...getAttributes(), item]);
  return item;
};

export const updateAttribute = (id: string, updates: Partial<Omit<Attribute, "id" | "createdAt">>): Attribute => {
  const items = getAttributes();
  const i = items.findIndex(a => a.id === id);
  if (i === -1) throw new Error("Attribute not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(ATTRIBUTES_KEY, items);
  return items[i];
};

export const deleteAttribute = (id: string): void => {
  setStored(ATTRIBUTES_KEY, getAttributes().filter(a => a.id !== id));
};

// ─── Units API ────────────────────────────────────────────────────────────────
export type Unit = {
  id: string;
  name: string;
  symbol: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

const UNITS_KEY = "admin-units";

export const getUnits = (): Unit[] => getStored<Unit>(UNITS_KEY);

export const createUnit = (data: Omit<Unit, "id" | "createdAt" | "updatedAt">): Unit => {
  const item: Unit = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(UNITS_KEY, [...getUnits(), item]);
  return item;
};

export const updateUnit = (id: string, updates: Partial<Omit<Unit, "id" | "createdAt">>): Unit => {
  const items = getUnits();
  const i = items.findIndex(u => u.id === id);
  if (i === -1) throw new Error("Unit not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(UNITS_KEY, items);
  return items[i];
};

export const deleteUnit = (id: string): void => {
  setStored(UNITS_KEY, getUnits().filter(u => u.id !== id));
};

// ─── Purchase Orders API ──────────────────────────────────────────────────────
export type PurchaseOrderStatus = "Draft" | "Sent" | "Confirmed" | "Received" | "Cancelled";

export type PurchaseOrderItem = {
  id:          string;
  itemType?:   "product" | "raw-material";  // defaults to "product"
  rmId?:       string;   // linked RawMaterial id
  productName: string;
  sku?:        string;   // THE canonical identifier — matches Product/variant SKU
  qty:         string;
  unit:        string;
  unitPrice:   string;
  notes:       string;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplier: string;
  orderDate: string;
  deliveryDate: string;
  status: PurchaseOrderStatus;
  notes: string;
  items: PurchaseOrderItem[];
  jeId?: string;          // auto-posted journal entry ID (set on receipt, prevents duplicates)
  createdAt: string;
  updatedAt: string;
};

const PURCHASE_ORDERS_KEY = "admin-purchase-orders";

export const getPurchaseOrders = (): PurchaseOrder[] => getStored<PurchaseOrder>(PURCHASE_ORDERS_KEY);

function generatePoNumber(): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const all = getPurchaseOrders();
  const seq = String(all.filter(p => p.poNumber.startsWith(`PO-${ym}-`)).length + 1).padStart(3, "0");
  return `PO-${ym}-${seq}`;
}

export const createPurchaseOrder = (
  data: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt" | "updatedAt">,
): PurchaseOrder => {
  const item: PurchaseOrder = {
    ...data,
    id: crypto.randomUUID(),
    poNumber: generatePoNumber(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(PURCHASE_ORDERS_KEY, [...getPurchaseOrders(), item]);
  addActivity({ action: "created", entity: "Purchase Order", entityName: item.poNumber, detail: item.supplier || undefined });
  return item;
};

export const updatePurchaseOrder = (
  id: string,
  updates: Partial<Omit<PurchaseOrder, "id" | "createdAt">>,
): PurchaseOrder => {
  const items = getPurchaseOrders();
  const i = items.findIndex(p => p.id === id);
  if (i === -1) throw new Error("Purchase order not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(PURCHASE_ORDERS_KEY, items);
  const detail = (updates as Record<string, unknown>).status ? `Status → ${(updates as Record<string, unknown>).status}` : undefined;
  addActivity({ action: detail ? "status_changed" : "updated", entity: "Purchase Order", entityName: items[i].poNumber, detail });
  return items[i];
};

export const deletePurchaseOrder = (id: string): void => {
  const item = getPurchaseOrders().find(p => p.id === id);
  setStored(PURCHASE_ORDERS_KEY, getPurchaseOrders().filter(p => p.id !== id));
  addActivity({ action: "deleted", entity: "Purchase Order", entityName: item?.poNumber || id });
};

export const receivePurchaseOrder = (id: string): PurchaseOrder => {
  const pos = getPurchaseOrders();
  const i = pos.findIndex(p => p.id === id);
  if (i === -1) throw new Error("Purchase order not found");
  const order = pos[i];
  if (order.status === "Received")  throw new Error("Order is already received");
  if (order.status === "Cancelled") throw new Error("Cannot receive a cancelled order");

  const rms        = getRawMaterials();
  const allProducts = getProducts();
  const today       = new Date().toISOString().slice(0, 10);
  const ledger: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  order.items.forEach(item => {
    const qty = parseFloat(item.qty) || 0;
    if (qty <= 0 || !item.productName.trim()) return;

    if (item.itemType === "raw-material") {
      // ── Route to Raw Material stock ────────────────────────────────────────
      // Try rmId first, fall back to name match if ID not found (handles RM recreations)
      let ri = item.rmId ? rms.findIndex(r => r.id === item.rmId) : -1;
      if (ri === -1) {
        ri = rms.findIndex(r => r.name.toLowerCase().trim() === item.productName.toLowerCase().trim());
      }

      if (ri >= 0) {
        // RM exists — add to current stock, optionally update cost
        const current = parseFloat(rms[ri].currentStock || "0");
        const newCost = item.unitPrice ? item.unitPrice : rms[ri].costPerUnit;
        rms[ri] = { ...rms[ri], currentStock: String(current + qty), costPerUnit: newCost, updatedAt: new Date().toISOString() };
        ledger.push({
          entityType: "raw-material", entityId: rms[ri].id, entityName: rms[ri].name,
          date: today, txType: "purchase-receipt", reference: order.poNumber,
          qtyBefore: current, qtyChange: qty, qtyAfter: current + qty,
          unit: rms[ri].unit, notes: `Received via ${order.poNumber} · Supplier: ${order.supplier}`,
        });
      } else {
        // RM not pre-registered — auto-create it from the PO line
        const newRm: RawMaterial = {
          id: crypto.randomUUID(),
          rmCode: nextRMCode(),
          name: item.productName.trim(),
          unit: item.unit || "pcs",
          currentStock: String(qty),
          costPerUnit: item.unitPrice || "0",
          notes: `Auto-created on receipt of ${order.poNumber}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        rms.push(newRm);
        ledger.push({
          entityType: "raw-material", entityId: newRm.id, entityName: newRm.name,
          date: today, txType: "purchase-receipt", reference: order.poNumber,
          qtyBefore: 0, qtyChange: qty, qtyAfter: qty,
          unit: newRm.unit, notes: `Auto-created & received via ${order.poNumber} · Supplier: ${order.supplier}`,
        });
      }
    } else {
      // ── Route to Product / StockItem ────────────────────────────────────────
      // SKU is the canonical identifier — try SKU first, fall back to name
      let pi = item.sku ? allProducts.findIndex(p => p.sku?.toLowerCase() === item.sku.toLowerCase()) : -1;
      if (pi === -1) pi = allProducts.findIndex(p => p.name.toLowerCase().trim() === item.productName.toLowerCase().trim());
      const product = pi >= 0 ? allProducts[pi] : undefined;

      // Auto-update purchasePrice from PO line unit price (user can still override manually)
      if (pi >= 0 && item.unitPrice && parseFloat(item.unitPrice) > 0) {
        allProducts[pi] = { ...allProducts[pi], purchasePrice: item.unitPrice, updatedAt: new Date().toISOString() };
      }

      const sku = product?.sku || item.productName.toLowerCase().replace(/\s+/g, "-");

      // Consolidate: find existing For-Sale stock entry in any Warehouse location for this SKU
      // Searches "Warehouse A" first, then legacy "Warehouse" for backward-compat
      const allStocks = getStock();
      const RECEIVE_STORE = "Warehouse A";
      let si = allStocks.findIndex(s => s.sku === sku && s.store === RECEIVE_STORE && s.stockType === "For Sale");
      if (si === -1) si = allStocks.findIndex(s => s.sku === sku && s.store === "Warehouse" && s.stockType === "For Sale");
      let stockId: string;
      if (si >= 0) {
        // Add to existing batch
        const prev = parseFloat(allStocks[si].quantity) || 0;
        const next = prev + qty;
        allStocks[si] = { ...allStocks[si], quantity: String(next), notes: `Last received via ${order.poNumber}`, updatedAt: new Date().toISOString() };
        setStored(STOCK_KEY, allStocks);
        stockId = allStocks[si].id;
        ledger.push({
          entityType: "product", entityId: stockId, entityName: allStocks[si].productName,
          date: today, txType: "purchase-receipt", reference: order.poNumber,
          qtyBefore: prev, qtyChange: qty, qtyAfter: next,
          unit: allStocks[si].unit, notes: `Received via ${order.poNumber} · Supplier: ${order.supplier}`,
        });
      } else {
        // Create new stock entry under the standard receiving warehouse
        const newStock = createStockItem({
          productName:  item.productName,
          sku,
          store:        RECEIVE_STORE,
          stockType:    "For Sale",
          quantity:     item.qty,
          minLevel:     "0",
          unit:         item.unit || product?.unit || "",
          holdCustomer: "",
          holdReason:   "",
          notes:        `Received via ${order.poNumber}`,
        });
        stockId = newStock.id;
        ledger.push({
          entityType: "product", entityId: stockId, entityName: newStock.productName,
          date: today, txType: "purchase-receipt", reference: order.poNumber,
          qtyBefore: 0, qtyChange: qty, qtyAfter: qty,
          unit: newStock.unit, notes: `Received via ${order.poNumber} · Supplier: ${order.supplier}`,
        });
      }
    }
  });

  setStored(PRODUCTS_KEY, allProducts);
  setStored(RM_KEY, rms);
  batchLedger(ledger);

  // ── Auto-post purchase journal entry ─────────────────────────────────────
  // Only post if not already posted (jeId guard prevents duplicates)
  if (!order.jeId) {
    const inventoryTotal = order.items
      .filter(it => it.itemType !== "raw-material")
      .reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0), 0);
    const rmTotal = order.items
      .filter(it => it.itemType === "raw-material")
      .reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0), 0);
    const poTotal = inventoryTotal + rmTotal;
    // Look up the supplier's exact ledger account from CRM (works even if
    // the contact was created under AR instead of AP)
    const _suppNameLow = (order.supplier || "").toLowerCase();
    const _crm = getCustomers();
    const _suppContact = _crm.find(c =>
      (c.name || "").toLowerCase() === _suppNameLow ||
      (c.name + (c.company ? ` (${c.company})` : "")).toLowerCase() === _suppNameLow
    );
    const je = autoPostPurchaseJE({
      poNumber:         order.poNumber,
      supplier:         order.supplier || "Supplier",
      date:             today,
      total:            poTotal,
      supplierLedgerId: _suppContact?.ledgerAccountId,
    });
    pos[i] = { ...pos[i], status: "Received", jeId: je?.id, updatedAt: new Date().toISOString() };
  } else {
    pos[i] = { ...pos[i], status: "Received", updatedAt: new Date().toISOString() };
  }

  setStored(PURCHASE_ORDERS_KEY, pos);
  addActivity({ action: "status_changed", entity: "Purchase Order", entityName: order.poNumber, detail: "Received — stock & accounts updated" });
  return pos[i];
};

// ─── Sales / POS ─────────────────────────────────────────────────────────────
export const SALE_STATUSES  = ["Pending", "Draft", "Completed", "On Credit", "Refunded", "Cancelled"] as const;
export type SaleStatus = typeof SALE_STATUSES[number];

export const SALE_PAYMENTS  = ["Cash", "Card", "Bank Transfer", "Cheque", "Credit"] as const;
/** SalePayment is intentionally `string` so POS can store dynamic COA account names/IDs.
 *  Legacy values ("Cash", "Card", "Bank Transfer", "Cheque", "Credit") are still valid. */
export type SalePayment = string;

export const ITEM_STATUSES = ["Reserved", "Delivered", "Pending"] as const;
export type ItemStatus = typeof ITEM_STATUSES[number];

export type SaleItem = {
  id: string;
  productName: string;       // locked — sourced from Products master (primary / English name)
  localName?: string;        // locked — sourced from Products master (local / Urdu / Arabic name)
  sku: string;               // THE canonical identifier — unique across products AND variants
  qty: string;
  unit: string;
  unitPrice: string;
  discount: string;          // value — interpreted as % or flat amount depending on discountType
  discountType?: "pct" | "amt"; // "pct" = percentage (default), "amt" = flat amount
  notes: string;
  itemStatus: ItemStatus;    // per-line delivery status
  bogoApplied?: boolean;     // Clubcard Buy-1-Get-1-Free applied; every 2nd unit is free
  variantLabel?: string;     // display label of the selected variant (e.g. "3500mAh") — UI only
  costPrice?: string;        // cost price per unit locked at sale time — used for COGS JE entries
};

export type Sale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  customer: string;
  status: SaleStatus;
  paymentMethod: SalePayment;
  notes: string;
  items: SaleItem[];
  taxRate: string;       // VAT / tax percentage, e.g. "20"
  amountPaid: string;    // amount actually received at payment
  paidAt: string;        // ISO timestamp of payment confirmation; "" if unpaid
  stockDeducted: boolean; // true after stock has been deducted for this sale
  jeId?:        string;   // journal entry ID auto-created on completion (prevents duplicates)
  agentId?:     string;   // linked SalesAgent.id
  agentName?:   string;   // denormalised agent name
  saleMode?:         "Retail" | "Wholesale" | "Clubcard";
  deliveryStatus?:   "Pending" | "Processing" | "Shipped" | "Delivered";
  deliveryCharges?:  string;
  invoiceDiscount?:  string;
  invoiceDiscountType?: "pct" | "amt";
  orderType?:        "POS" | "Invoice" | "Online";
  onlineCustomer?:   string; // full name + contact for online orders
  createdAt: string;
  updatedAt: string;
};

const SALES_KEY = "admin-sales";

const nextSaleNumber = (): string => {
  const existing = getStored<Sale>(SALES_KEY);
  const settings = getSettings();
  const refDigits = settings.referenceDigits || 4;
  const customPrefix = (settings.salePrefix || "SAL-").replace(/[-_\s]+$/, "");
  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const fullPrefix = `${customPrefix}-${datePart}`;
  const max = existing
    .filter(s => s.saleNumber.startsWith(fullPrefix))
    .map(s => parseInt(s.saleNumber.split("-").pop() ?? "0") || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${fullPrefix}-${String(max + 1).padStart(refDigits, "0")}`;
};

export const getSales = (): Sale[] => getStored<Sale>(SALES_KEY);

export const createSale = (data: Omit<Sale, "id" | "saleNumber" | "createdAt" | "updatedAt">): Sale => {
  const sale: Sale = { ...data, id: crypto.randomUUID(), saleNumber: nextSaleNumber(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(SALES_KEY, [...getSales(), sale]);
  addActivity({ action: "created", entity: "Sale", entityName: sale.saleNumber, detail: sale.customer ? `Customer: ${sale.customer}` : undefined });
  return sale;
};

export const updateSale = (id: string, updates: Partial<Omit<Sale, "id" | "saleNumber" | "createdAt">>): Sale => {
  const all = getSales();
  const i = all.findIndex(s => s.id === id);
  if (i === -1) throw new Error("Sale not found");
  all[i] = { ...all[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(SALES_KEY, all);
  const detail = updates.status
    ? updates.status === "Completed"
      ? `Completed · ${updates.paymentMethod || all[i].paymentMethod}`
      : `Status → ${updates.status}`
    : undefined;
  addActivity({ action: updates.status === "Completed" ? "completed" : updates.status ? "status_changed" : "updated", entity: "Sale", entityName: all[i].saleNumber, detail });
  return all[i];
};

export const deleteSale = (id: string): void => {
  const sale = getSales().find(s => s.id === id);
  setStored(SALES_KEY, getSales().filter(s => s.id !== id));
  addActivity({ action: "deleted", entity: "Sale", entityName: sale?.saleNumber || id });
};

/** Pull any online orders saved by the tenant store and merge them into admin-sales. Returns count of new records imported. */
export async function importOnlineSalesFromKv(ns = "global"): Promise<number> {
  try {
    const raw = await kvGet(ns, "online-orders");
    if (!Array.isArray(raw)) return 0;
    const existing = getSales();
    const existingIds = new Set(existing.map(s => s.id));
    const newOnes = (raw as Sale[]).filter(o => o && o.id && !existingIds.has(o.id));
    if (!newOnes.length) return 0;
    setStored(SALES_KEY, [...existing, ...newOnes]);
    return newOnes.length;
  } catch { return 0; }
}

// ─── Sale Returns ─────────────────────────────────────────────────────────────
export const SR_KEY = "admin-sale-returns";

export type SaleReturnItem = {
  id:          string;
  productName: string;
  sku:         string;
  unit:        string;
  qty:         string;
  unitPrice:   string;
  discount:    string;
  costPrice?:  string;
};

export type SaleReturnStatus = "draft" | "posted";

export type SaleReturn = {
  id:                 string;
  returnNumber:       string;       // SR-202604-001
  originalSaleNumber: string;       // SAL-202604-001
  originalSaleId:     string;
  date:               string;       // YYYY-MM-DD
  customer:           string;
  refundMethod:       SalePayment;
  items:              SaleReturnItem[];
  subtotal:           number;
  taxAmount:          number;
  grandTotal:         number;
  reason:             string;
  notes:              string;
  status:             SaleReturnStatus;
  jeId?:              string;
  createdAt:          string;
  updatedAt:          string;
};

const nextSaleReturnNumber = (): string => {
  const existing = getStored<SaleReturn>(SR_KEY);
  const ym = new Date().toISOString().slice(0, 7).replace("-", "");
  const prefix = `SR-${ym}-`;
  const nums = existing
    .filter(r => r.returnNumber.startsWith(prefix))
    .map(r => parseInt(r.returnNumber.slice(prefix.length)) || 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
};

export const getSaleReturns = (): SaleReturn[] => getStored<SaleReturn>(SR_KEY);

export const createSaleReturn = (data: Omit<SaleReturn, "id" | "returnNumber" | "createdAt" | "updatedAt">): SaleReturn => {
  const sr: SaleReturn = {
    ...data,
    id:           crypto.randomUUID(),
    returnNumber: nextSaleReturnNumber(),
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };
  setStored(SR_KEY, [...getSaleReturns(), sr]);
  addActivity({ action: "created", entity: "Sale Return", entityName: sr.returnNumber });
  return sr;
};

export const updateSaleReturn = (id: string, updates: Partial<Omit<SaleReturn, "id" | "returnNumber" | "createdAt">>): SaleReturn => {
  const all = getSaleReturns();
  const i = all.findIndex(r => r.id === id);
  if (i === -1) throw new Error("Sale Return not found");
  all[i] = { ...all[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(SR_KEY, all);
  return all[i];
};

export const deleteSaleReturn = (id: string): void => {
  const sr = getSaleReturns().find(r => r.id === id);
  setStored(SR_KEY, getSaleReturns().filter(r => r.id !== id));
  addActivity({ action: "deleted", entity: "Sale Return", entityName: sr?.returnNumber || id });
};

// ─── Purchase Returns ─────────────────────────────────────────────────────────

export type PurchaseReturnItem = {
  id:          string;
  productName: string;
  sku:         string;
  unit:        string;
  qty:         string;
  unitPrice:   string;
  discount:    string;
};

export type PurchaseReturnStatus = "draft" | "posted";

export type PurchaseReturn = {
  id:                    string;
  returnNumber:          string;
  originalInvoiceNumber: string;
  originalInvoiceId:     string;
  date:                  string;
  supplier:              string;
  refundMethod:          string;
  items:                 PurchaseReturnItem[];
  subtotal:              number;
  taxAmount:             number;
  grandTotal:            number;
  reason:                string;
  notes:                 string;
  status:                PurchaseReturnStatus;
  jeId?:                 string;
  createdAt:             string;
  updatedAt:             string;
};

const PR_KEY = "admin-purchase-returns";

const nextPurchaseReturnNumber = (): string => {
  const existing = getStored<PurchaseReturn>(PR_KEY);
  const d = new Date();
  const base = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PR-${base}`;
  const max = existing
    .filter(r => r.returnNumber.startsWith(prefix))
    .map(r => parseInt(r.returnNumber.split("-").pop() ?? "0") || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
};

export const getPurchaseReturns = (): PurchaseReturn[] => getStored<PurchaseReturn>(PR_KEY);

export const createPurchaseReturn = (
  data: Omit<PurchaseReturn, "id" | "returnNumber" | "createdAt" | "updatedAt">
): PurchaseReturn => {
  const pr: PurchaseReturn = {
    ...data,
    id:           crypto.randomUUID(),
    returnNumber: nextPurchaseReturnNumber(),
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };
  setStored(PR_KEY, [...getPurchaseReturns(), pr]);
  addActivity({ action: "created", entity: "Purchase Return", entityName: pr.returnNumber });
  return pr;
};

export const updatePurchaseReturn = (
  id: string,
  updates: Partial<Omit<PurchaseReturn, "id" | "returnNumber" | "createdAt">>
): PurchaseReturn => {
  const all = getPurchaseReturns();
  const i = all.findIndex(r => r.id === id);
  if (i === -1) throw new Error("Purchase Return not found");
  all[i] = { ...all[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(PR_KEY, all);
  return all[i];
};

export const deletePurchaseReturn = (id: string): void => {
  const pr = getPurchaseReturns().find(r => r.id === id);
  setStored(PR_KEY, getPurchaseReturns().filter(r => r.id !== id));
  addActivity({ action: "deleted", entity: "Purchase Return", entityName: pr?.returnNumber || id });
};

/**
 * Posts a Sale Return JE that perfectly mirrors `autoPostSaleJE` (reversed).
 *
 * Original sale posts (per category):
 *   DR  Cash/Bank/AR (per-customer)    = grandTotal
 *     CR  sr-cat-{cat} / General Sales Revenue = subtotal
 *     CR  VAT Payable                          = taxAmount
 *   DR  COGS                                   = costTotal
 *     CR  inv-cat-{cat} / General Inventory    = costTotal
 *
 * Sale return reverses every leg with matching ledger resolution so balances
 * on per-category and per-customer sub-ledgers are properly restored.
 */
export function autoPostSaleReturnJE(params: {
  returnNumber:  string;
  originalRef:   string;
  customer:      string;
  date:          string;
  refundMethod:  SalePayment;
  subtotal:      number;     // net of tax
  taxAmount:     number;     // VAT being refunded
  grandTotal:    number;     // subtotal + taxAmount
  costTotal?:    number;     // total cost of goods being returned
  /** Per-category breakdown — drives per-category Revenue and Inventory reversal lines */
  categoryLines?: Array<{ category: string; subtotal: number; costTotal: number }>;
}): JournalEntry | null {
  const s = getSettings();

  // ── Credit side: who gets refunded? ──────────────────────────────────────
  // Mirror of autoPostSaleJE's debit-side logic:
  //   - "Credit" refund → CR per-customer AR sub-ledger (reverses the original AR debit)
  //   - "Cash" / Card / Bank Transfer / Cheque → CR the matching Cash & Bank ledger
  //     (resolved via COA name/id first, then settings fallback).
  const _allAccounts = getAccounts();
  const _resolvePayMethodLedger = (method: string): string | null => {
    const byId = _allAccounts.find(a => a.id === method && a.accountType === "Ledger" && a.isActive !== false);
    if (byId) return byId.id;
    const nameLower = method.toLowerCase();
    const cbLedgers = getCashBankLedgers();
    const byName = cbLedgers.find(a => a.name.toLowerCase() === nameLower);
    if (byName) return byName.id;
    return null;
  };

  const isCredit = params.refundMethod === "Credit";
  let creditAccId: string | null;
  if (isCredit) {
    // Per-customer AR sub-ledger if it exists, else Trade Receivables, else system AR
    creditAccId = findSubLedgerForParty(params.customer, SYS_ACCS.AR_GROUP)
               || resolveToLedger(s.accReceivable)
               || SYS_ACCS.AR_TRADE;
  } else {
    const dynLedger = _resolvePayMethodLedger(params.refundMethod);
    if (dynLedger) {
      creditAccId = dynLedger;
    } else if (params.refundMethod === "Cash") {
      creditAccId = resolveToLedger(s.accCash) || SYS_ACCS.CASH;
    } else {
      creditAccId = resolveToLedger(s.accBank) || resolveToLedger(s.accCash) || SYS_ACCS.CASH;
    }
  }
  if (!creditAccId) return null;

  // ── Resolved fallback IDs — always valid Ledger targets ─────────────────
  const _generalRevId = resolveToLedger(s.accSalesRevenue) ?? SYS_ACCS.GENERAL_SALES_REV;
  const _generalInvId = resolveToLedger(s.accInventory)    ?? SYS_ACCS.GENERAL_INVENTORY;
  const _cogsId       = resolveToLedger(s.accCogs)         ?? SYS_ACCS.COGS;
  const _vatId        = resolveToLedger(s.accVatPayable)   ?? s.accVatPayable ?? null;

  const narration = `Sale Return ${params.returnNumber} – ${params.customer} (orig: ${params.originalRef})`;
  const catLines  = params.categoryLines ?? [];
  const costTotal = params.costTotal ?? 0;

  // ── Credit refund (mirrors original sale's debit) ────────────────────────
  const lines: JournalEntryLine[] = [
    { id: crypto.randomUUID(), ledgerId: creditAccId, narration, debit: 0, credit: params.grandTotal },
  ];

  // ── Revenue reversal (DR) — per-category where possible ─────────────────
  if (catLines.length > 0) {
    for (const cl of catLines) {
      if (cl.subtotal <= 0) continue;
      const slug = (cl.category || "uncategorised").trim().toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorised";
      const catRevId  = `sr-cat-${slug}`;
      const revLedger = _allAccounts.some(a => a.id === catRevId && a.accountType === "Ledger")
                          ? catRevId
                          : _generalRevId;
      lines.push({ id: crypto.randomUUID(), ledgerId: revLedger,
        narration: `Revenue reversal – ${params.returnNumber} – ${cl.category}`,
        debit: cl.subtotal, credit: 0 });
    }
  } else {
    // No breakdown — reverse the full subtotal against general revenue
    if (params.subtotal > 0) {
      lines.push({ id: crypto.randomUUID(), ledgerId: _generalRevId,
        narration: `Revenue reversal – ${params.returnNumber}`,
        debit: params.subtotal, credit: 0 });
    }
  }

  // ── VAT reversal (DR) ────────────────────────────────────────────────────
  if (params.taxAmount > 0 && _vatId) {
    lines.push({ id: crypto.randomUUID(), ledgerId: _vatId,
      narration: `VAT reversal – ${params.returnNumber}`,
      debit: params.taxAmount, credit: 0 });
  }

  // ── COGS reversal (CR) + Inventory restore (DR) — per-category ───────────
  if (catLines.length > 0) {
    for (const cl of catLines) {
      if (cl.costTotal <= 0) continue;
      const slug = (cl.category || "uncategorised").trim().toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorised";
      const catInvId  = `inv-cat-${slug}`;
      const invLedger = _allAccounts.some(a => a.id === catInvId && a.accountType === "Ledger")
                          ? catInvId
                          : _generalInvId;
      lines.push({ id: crypto.randomUUID(), ledgerId: invLedger,
        narration: `Inventory restore – ${params.returnNumber} – ${cl.category}`,
        debit: cl.costTotal, credit: 0 });
      lines.push({ id: crypto.randomUUID(), ledgerId: _cogsId,
        narration: `COGS reversal – ${params.returnNumber} – ${cl.category}`,
        debit: 0, credit: cl.costTotal });
    }
  } else if (costTotal > 0) {
    lines.push({ id: crypto.randomUUID(), ledgerId: _generalInvId,
      narration: `Inventory restore – ${params.returnNumber}`,
      debit: costTotal, credit: 0 });
    lines.push({ id: crypto.randomUUID(), ledgerId: _cogsId,
      narration: `COGS reversal – ${params.returnNumber}`,
      debit: 0, credit: costTotal });
  }

  const totalDebit  = parseFloat(lines.reduce((s, l) => s + l.debit,  0).toFixed(2));
  const totalCredit = parseFloat(lines.reduce((s, l) => s + l.credit, 0).toFixed(2));

  return createJournalEntry({
    date:        params.date,
    reference:   `AUTO-${params.returnNumber}`,
    description: `Sale Return: ${params.returnNumber} – ${params.customer}`,
    lines,
    status:      "posted",
    totalDebit,
    totalCredit,
    isBalanced:  Math.abs(totalDebit - totalCredit) < 0.02,
  });
}

// ─── Stock Tracking ───────────────────────────────────────────────────────────
export const STOCK_TYPES = ["For Sale", "Not For Sale", "Business Asset"] as const;
export type StockType = typeof STOCK_TYPES[number];

export type StockItem = {
  id: string;
  productName: string;
  sku: string;
  store: string;
  stockType: StockType;
  quantity: string;   // stored as string for grid compat
  minLevel: string;   // alert threshold; "0" = no alert
  unit: string;
  holdCustomer: string; // name of customer holding this stock (Not For Sale only)
  holdReason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const STOCK_KEY = "admin-stock";

export const getStock = (): StockItem[] => getStored<StockItem>(STOCK_KEY);

/**
 * Return total available quantity for a product across ALL of its stock records.
 * For products with variants, this sums both the parent product's SKU stock and
 * every variant's own SKU stock so that the product list and POS grid stay in sync
 * regardless of whether stock was received under a parent or variant SKU.
 *
 * @param prod  Full Product object (needs sku + optional variants array)
 * @param all   Optional pre-fetched stock array (avoids re-reading storage)
 * @returns     Total qty, or null if there are no stock records at all for this product
 */
export function getProductStockQty(prod: Product, all?: StockItem[]): number | null {
  const stocks = all ?? getStock();
  const skus = new Set<string>();
  if (prod.sku?.trim()) skus.add(prod.sku.trim().toLowerCase());
  prod.variants?.forEach(v => { if (v.sku?.trim()) skus.add(v.sku.trim().toLowerCase()); });
  if (skus.size === 0) return null;

  let total = 0;
  let found = false;
  for (const s of stocks) {
    const ssku = s.sku?.trim().toLowerCase();
    if (ssku && skus.has(ssku)) {
      total += Math.max(0, parseFloat(s.quantity) || 0);
      found = true;
    }
  }
  return found ? total : null;
}

export const createStockItem = (data: Omit<StockItem, "id" | "createdAt" | "updatedAt">): StockItem => {
  const item: StockItem = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(STOCK_KEY, [...getStock(), item]);
  // Record opening-balance ledger entry if initial qty > 0
  const initQty = parseFloat(item.quantity) || 0;
  if (initQty > 0) {
    batchLedger([{
      entityType: "product", entityId: item.id, entityName: item.productName,
      date:      new Date().toISOString().slice(0, 10),
      txType:    "opening-balance",
      reference: "MANUAL",
      qtyBefore: 0, qtyChange: initQty, qtyAfter: initQty,
      unit:      item.unit,
      notes:     `Opening balance — ${item.store}`,
    }]);
  }
  return item;
};

export const updateStockItem = (id: string, updates: Partial<Omit<StockItem, "id" | "createdAt">>): StockItem => {
  const items = getStock();
  const i = items.findIndex(s => s.id === id);
  if (i === -1) throw new Error("Stock item not found");
  const prev = items[i];
  items[i] = { ...prev, ...updates, updatedAt: new Date().toISOString() };
  setStored(STOCK_KEY, items);
  // Record a manual-adjustment ledger entry whenever quantity changes
  if ("quantity" in updates && updates.quantity !== undefined) {
    const before = parseFloat(prev.quantity) || 0;
    const after  = parseFloat(updates.quantity) || 0;
    const delta  = after - before;
    if (delta !== 0) {
      batchLedger([{
        entityType: "product", entityId: id, entityName: items[i].productName,
        date:      new Date().toISOString().slice(0, 10),
        txType:    "manual-adjustment",
        reference: "MANUAL",
        qtyBefore: before, qtyChange: delta, qtyAfter: after,
        unit:      items[i].unit,
        notes:     `Manual quantity adjustment — ${items[i].store}`,
      }]);
    }
  }
  return items[i];
};

export const deleteStockItem = (id: string): void => {
  setStored(STOCK_KEY, getStock().filter(s => s.id !== id));
};

// ─── Stock Ledger ─────────────────────────────────────────────────────────────
export type LedgerTxType =
  | "purchase-receipt"
  | "sale"
  | "sale-refund"
  | "mfg-input"
  | "mfg-output"
  | "manual-adjustment"
  | "opening-balance";

export const LEDGER_TX_LABELS: Record<LedgerTxType, string> = {
  "purchase-receipt": "Purchase Receipt",
  "sale":             "Sale",
  "sale-refund":      "Sale Refund",
  "mfg-input":        "Mfg. Consumed",
  "mfg-output":       "Mfg. Produced",
  "manual-adjustment":"Manual Adjustment",
  "opening-balance":  "Opening Balance",
};

export type StockLedgerEntry = {
  id:          string;
  entityType:  "product" | "raw-material";
  entityId:    string;      // StockItem.id or RawMaterial.id
  entityName:  string;
  date:        string;      // YYYY-MM-DD
  txType:      LedgerTxType;
  sourceType?: string;      // "Invoiced" | "POS" | "Online" | "Purchase" | "Opening Balance" | …
  reference:   string;      // PO-001, SALE-001, MO-001
  qtyBefore:   number;
  qtyChange:   number;      // positive = IN, negative = OUT
  qtyAfter:    number;
  unit:        string;
  notes:       string;
  createdAt:   string;
};

const LEDGER_KEY = "admin-stock-ledger";

export const getStockLedger        = (): StockLedgerEntry[] => getStored<StockLedgerEntry>(LEDGER_KEY);
export const getEntityLedger       = (entityId: string) => getStockLedger().filter(e => e.entityId === entityId);
export const clearEntityLedger     = (entityId: string) => setStored(LEDGER_KEY, getStockLedger().filter(e => e.entityId !== entityId));
export const deleteStockLedgerEntry = (entryId: string) => setStored(LEDGER_KEY, getStockLedger().filter(e => e.id !== entryId));

/**
 * Remove duplicate purchase-receipt ledger entries that share the same
 * (entityId, reference) pair — keeping only the chronologically first one.
 * After pruning, rebuilds qtyBefore/qtyAfter for affected entities and
 * corrects the actual stock-item quantity to match the deduplicated ledger.
 */
export function deduplicatePurchaseReceipts(): { removedEntries: number; fixedItems: number } {
  const allEntries = getStockLedger();

  // Chronological sort (date primary, createdAt secondary)
  const sorted = [...allEntries].sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  );

  const seenPurchaseKeys = new Set<string>();
  const keptIds           = new Set<string>();
  const affectedEntityIds = new Set<string>();

  for (const entry of sorted) {
    if (entry.txType === "purchase-receipt") {
      const key = `${entry.entityId}::${entry.reference}`;
      if (seenPurchaseKeys.has(key)) {
        affectedEntityIds.add(entry.entityId);
        continue; // skip duplicate
      }
      seenPurchaseKeys.add(key);
    }
    keptIds.add(entry.id);
  }

  const removedCount = allEntries.length - keptIds.size;
  if (removedCount === 0) return { removedEntries: 0, fixedItems: 0 };

  // Filter to kept entries then rebuild balances for affected entities
  const kept = allEntries.filter(e => keptIds.has(e.id));

  const rebuiltMap = new Map<string, StockLedgerEntry[]>();

  for (const entityId of affectedEntityIds) {
    const entityEntries = kept
      .filter(e => e.entityId === entityId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

    // Use the first entry's qtyBefore as the true opening seed
    let running = entityEntries.length > 0 ? entityEntries[0].qtyBefore : 0;
    const rebuilt = entityEntries.map(e => {
      const before = running;
      const after  = running + e.qtyChange;
      running = after;
      return { ...e, qtyBefore: before, qtyAfter: after };
    });
    rebuiltMap.set(entityId, rebuilt);
  }

  const finalEntries: StockLedgerEntry[] = [
    ...kept.filter(e => !affectedEntityIds.has(e.entityId)),
    ...[...rebuiltMap.values()].flat(),
  ];

  setStored(LEDGER_KEY, finalEntries);

  // Correct actual stock quantities to match the deduplicated ledger
  const stocks = getStock();
  let fixedItems = 0;

  for (const entityId of affectedEntityIds) {
    const idx = stocks.findIndex(s => s.id === entityId);
    if (idx < 0) continue;
    const entityEntries = (rebuiltMap.get(entityId) ?? [])
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const correctQty = entityEntries.length > 0 ? entityEntries[entityEntries.length - 1].qtyAfter : 0;
    stocks[idx] = { ...stocks[idx], quantity: String(correctQty), updatedAt: new Date().toISOString() };
    fixedItems++;
  }

  setStored(STOCK_KEY, stocks);

  return { removedEntries: removedCount, fixedItems };
}

/**
 * Remove duplicate sale ledger entries that share the same
 * (entityId, reference) pair — keeping only the chronologically first one.
 * After pruning, rebuilds qtyBefore/qtyAfter for affected entities and
 * corrects the actual stock-item quantity to match the deduplicated ledger.
 */
export function deduplicateSaleEntries(): { removedEntries: number; fixedItems: number } {
  const allEntries = getStockLedger();

  // Chronological sort (date primary, createdAt secondary)
  const sorted = [...allEntries].sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  );

  const seenSaleKeys      = new Set<string>();
  const keptIds           = new Set<string>();
  const affectedEntityIds = new Set<string>();

  for (const entry of sorted) {
    if (entry.txType === "sale") {
      const key = `${entry.entityId}::${entry.reference}`;
      if (seenSaleKeys.has(key)) {
        affectedEntityIds.add(entry.entityId);
        continue; // skip duplicate
      }
      seenSaleKeys.add(key);
    }
    keptIds.add(entry.id);
  }

  const removedCount = allEntries.length - keptIds.size;
  if (removedCount === 0) return { removedEntries: 0, fixedItems: 0 };

  // Filter to kept entries then rebuild balances for affected entities
  const kept = allEntries.filter(e => keptIds.has(e.id));

  const rebuiltMap = new Map<string, StockLedgerEntry[]>();

  for (const entityId of affectedEntityIds) {
    const entityEntries = kept
      .filter(e => e.entityId === entityId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

    // Use the first entry's qtyBefore as the true opening seed
    let running = entityEntries.length > 0 ? entityEntries[0].qtyBefore : 0;
    const rebuilt = entityEntries.map(e => {
      const before = running;
      const after  = running + e.qtyChange;
      running = after;
      return { ...e, qtyBefore: before, qtyAfter: after };
    });
    rebuiltMap.set(entityId, rebuilt);
  }

  const finalEntries: StockLedgerEntry[] = [
    ...kept.filter(e => !affectedEntityIds.has(e.entityId)),
    ...[...rebuiltMap.values()].flat(),
  ];

  setStored(LEDGER_KEY, finalEntries);

  // Correct actual stock quantities to match the deduplicated ledger
  const stocks = getStock();
  let fixedItems = 0;

  for (const entityId of affectedEntityIds) {
    const idx = stocks.findIndex(s => s.id === entityId);
    if (idx < 0) continue;
    const entityEntries = (rebuiltMap.get(entityId) ?? [])
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const correctQty = entityEntries.length > 0 ? entityEntries[entityEntries.length - 1].qtyAfter : 0;
    stocks[idx] = { ...stocks[idx], quantity: String(correctQty), updatedAt: new Date().toISOString() };
    fixedItems++;
  }

  setStored(STOCK_KEY, stocks);

  return { removedEntries: removedCount, fixedItems };
}

function batchLedger(entries: Omit<StockLedgerEntry, "id" | "createdAt">[]) {
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const full: StockLedgerEntry[] = entries.map(e => ({ ...e, id: crypto.randomUUID(), createdAt: now }));
  setStored(LEDGER_KEY, [...getStockLedger(), ...full]);
}

export const addManualLedgerEntry = (entry: Omit<StockLedgerEntry, "id" | "createdAt">) => {
  batchLedger([entry]);
};

/**
 * Reconcile a single stock item: if the ledger's closing balance does not
 * match the stock item's actual quantity, insert a correction entry.
 * Returns true if a correction was written, false if already in sync.
 */
export function reconcileStockItem(stockId: string): boolean {
  const item = getStock().find(s => s.id === stockId);
  if (!item) return false;

  const actualQty = parseFloat(item.quantity) || 0;

  // Compute ledger closing for this item (all-time)
  const entries = getStockLedger()
    .filter(e => e.entityId === stockId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const ledgerQty = entries.length === 0 ? 0 : entries[entries.length - 1].qtyAfter;
  const diff = actualQty - ledgerQty;

  if (Math.abs(diff) < 0.001) return false; // already in sync

  const today = new Date().toISOString().slice(0, 10);
  batchLedger([{
    entityType: "product",
    entityId:   stockId,
    entityName: item.productName,
    date:       today,
    txType:     entries.length === 0 ? "opening-balance" : "manual-adjustment",
    reference:  "RECONCILE",
    qtyBefore:  ledgerQty,
    qtyChange:  diff,
    qtyAfter:   actualQty,
    unit:       item.unit,
    notes:      entries.length === 0
      ? `Opening balance (reconciliation) — ${item.store}`
      : `Stock reconciliation — ledger was ${ledgerQty}, actual stock ${actualQty}`,
  }]);
  return true;
}

/**
 * Reconcile ALL stock items in one pass. Returns the count of items that
 * had a correction entry written.
 */
export function reconcileAllStock(): number {
  const stocks = getStock();
  let fixed = 0;
  for (const s of stocks) {
    if (reconcileStockItem(s.id)) fixed++;
  }
  return fixed;
}

// ─── Stock Mutations (with Ledger) ────────────────────────────────────────────
/** Deduct qty from stock records that match `sku`, recording ledger entries. Returns remaining undeducted qty. */
function _deductFromStockBySku(
  sku: string,
  qty: number,
  stocks: StockItem[],
  ledger: Omit<StockLedgerEntry, "id" | "createdAt">[],
  today: string,
  reference: string,
  sourceType: string | undefined,
): number {
  const skuLower = sku.trim().toLowerCase();
  let remaining = qty;
  for (let i = 0; i < stocks.length && remaining > 0; i++) {
    if ((stocks[i].sku?.trim() || "").toLowerCase() !== skuLower) continue;
    const current = Math.max(0, parseFloat(stocks[i].quantity) || 0);
    const deduct  = Math.min(current, remaining);
    stocks[i] = { ...stocks[i], quantity: String(current - deduct), updatedAt: new Date().toISOString() };
    remaining -= deduct;
    if (deduct > 0) ledger.push({
      entityType: "product", entityId: stocks[i].id, entityName: stocks[i].productName,
      date: today, txType: "sale", sourceType, reference,
      qtyBefore: current, qtyChange: -deduct, qtyAfter: current - deduct,
      unit: stocks[i].unit, notes: reference ? `Sale ${reference}` : "Sale",
    });
  }
  return remaining;
}

/** Deduct qty from stock records that match productName (last-resort fallback). Returns remaining undeducted qty. */
function _deductFromStockByName(
  productName: string,
  qty: number,
  stocks: StockItem[],
  ledger: Omit<StockLedgerEntry, "id" | "createdAt">[],
  today: string,
  reference: string,
  sourceType: string | undefined,
): number {
  const nameLower = productName.trim().toLowerCase();
  let remaining = qty;
  for (let i = 0; i < stocks.length && remaining > 0; i++) {
    if ((stocks[i].productName?.trim() || "").toLowerCase() !== nameLower) continue;
    const current = Math.max(0, parseFloat(stocks[i].quantity) || 0);
    const deduct  = Math.min(current, remaining);
    stocks[i] = { ...stocks[i], quantity: String(current - deduct), updatedAt: new Date().toISOString() };
    remaining -= deduct;
    if (deduct > 0) ledger.push({
      entityType: "product", entityId: stocks[i].id, entityName: stocks[i].productName,
      date: today, txType: "sale", sourceType, reference,
      qtyBefore: current, qtyChange: -deduct, qtyAfter: current - deduct,
      unit: stocks[i].unit, notes: reference ? `Sale ${reference}` : "Sale",
    });
  }
  return remaining;
}

export const deductStockForSale = (saleItems: SaleItem[], reference = "", sourceType?: string): void => {
  // ── Invoice-level duplicate guard ─────────────────────────────────────────
  // Check once at the invoice level: if ANY sale ledger entry for this reference
  // already exists we've already processed it. Bail out entirely to prevent
  // double-deduction. This replaces the old per-entity guard which incorrectly
  // blocked later line items that shared the same parent stock record as an
  // earlier line item (common with multi-variant sales).
  if (reference) {
    const existing = getStockLedger();
    if (existing.some(e => e.reference === reference && e.txType === "sale")) return;
  }

  const stocks = getStock();
  const today  = new Date().toISOString().slice(0, 10);
  const ledger: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  // Lazy variant-SKU → parent-product-SKU cache (for variant fallback deduction)
  let _variantParentCache: Map<string, string> | null = null;
  const ensureCache = () => {
    if (!_variantParentCache) {
      _variantParentCache = new Map();
      getProducts().forEach(p => {
        p.variants?.forEach(v => {
          if (v.sku && p.sku) _variantParentCache!.set(v.sku.toLowerCase(), p.sku);
        });
      });
    }
  };
  const parentSkuFor = (item: SaleItem): string | null => {
    if (!item.sku) return null;
    ensureCache();
    return _variantParentCache!.get(item.sku.trim().toLowerCase()) ?? null;
  };

  saleItems.forEach(item => {
    const qty = parseFloat(item.qty) || 0;
    if (qty <= 0) return;

    // SKU is the canonical identifier — item.sku may be a variant SKU or product SKU.
    const effectiveSku = item.sku || "";

    let remaining = qty;

    // Step 1 — Deduct from stock keyed by the item's own SKU (variant or product)
    if (effectiveSku) {
      remaining = _deductFromStockBySku(effectiveSku, remaining, stocks, ledger, today, reference, sourceType);
    }

    // Step 2 — Variant fallback: stock may have been received under the PARENT
    // product's SKU rather than the individual variant SKU (happens when purchase
    // invoices use only the parent product, not per-variant lines).
    if (remaining > 0 && effectiveSku) {
      const parentSku = parentSkuFor(item);
      if (parentSku && parentSku.toLowerCase() !== effectiveSku.trim().toLowerCase()) {
        remaining = _deductFromStockBySku(parentSku, remaining, stocks, ledger, today, reference, sourceType);
      }
    }

    // (Name-based fallback removed: every stock record now has a SKU after
    // backfillMissingSKUs() runs on login. SKU-only matching is authoritative.)
  });

  setStored(STOCK_KEY, stocks);
  batchLedger(ledger);
};

export const restoreStockForSale = (saleItems: SaleItem[], reference = ""): void => {
  const stocks   = getStock();
  const allProds = getProducts();
  const today    = new Date().toISOString().slice(0, 10);
  const ledger: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  /** Restore qty back into a specific stock record, with ledger entry. */
  const restoreInto = (idx: number, qty: number) => {
    const current = Math.max(0, parseFloat(stocks[idx].quantity) || 0);
    stocks[idx] = { ...stocks[idx], quantity: String(current + qty), updatedAt: new Date().toISOString() };
    if (qty > 0) ledger.push({
      entityType: "product", entityId: stocks[idx].id, entityName: stocks[idx].productName,
      date: today, txType: "sale-refund", reference,
      qtyBefore: current, qtyChange: qty, qtyAfter: current + qty,
      unit: stocks[idx].unit, notes: reference ? `Refund ${reference}` : "Sale Refund",
    });
  };

  saleItems.forEach(item => {
    const qty = parseFloat(item.qty) || 0;
    if (qty <= 0) return;

    // SKU is the canonical identifier — item.sku may be a variant SKU or product SKU.
    const effectiveSku = item.sku || "";

    // Step 1 — Restore to stock record keyed by item's own SKU (case-insensitive, trimmed)
    const effSkuLower = effectiveSku.trim().toLowerCase();
    let found = effectiveSku ? stocks.findIndex(s => (s.sku?.trim() || "").toLowerCase() === effSkuLower) : -1;
    if (found >= 0) { restoreInto(found, qty); return; }

    // Step 2 — Variant fallback: stock may be under parent product's SKU
    if (effectiveSku) {
      const parentProd = allProds.find(p => p.variants?.some(v => v.sku?.toLowerCase() === effSkuLower));
      if (parentProd?.sku && parentProd.sku.toLowerCase() !== effSkuLower) {
        const parentSkuLower = parentProd.sku.trim().toLowerCase();
        found = stocks.findIndex(s => (s.sku?.trim() || "").toLowerCase() === parentSkuLower);
        if (found >= 0) { restoreInto(found, qty); return; }
      }
    }

    // (Name-based fallback removed: every stock record now has a SKU after
    // backfillMissingSKUs() runs on login. SKU-only matching is authoritative.)
  });

  setStored(STOCK_KEY, stocks);
  batchLedger(ledger);
};

/** Add stock when a purchase invoice is paid / partially paid. Creates a new
 *  stock record for the SKU if one doesn't already exist. */
export const receiveStockForPurchase = (items: SaleItem[], reference = "", sourceType?: string): void => {
  const stocks    = getStock();
  const allProds  = getProducts();
  const today     = new Date().toISOString().slice(0, 10);
  const ledger: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  // Duplicate guard: build a set of entityIds already recorded for this reference
  const existing = reference ? getStockLedger() : [];
  const alreadyReceived = (entityId: string) =>
    reference && existing.some(e => e.entityId === entityId && e.reference === reference && e.txType === "purchase-receipt");

  items.forEach(item => {
    const qty = parseFloat(item.qty) || 0;
    if (qty <= 0) return;

    // Resolve effective SKU — SKU is the canonical identifier.
    // Priority: item.sku → canonical product SKU by SKU match → by name match.
    let effectiveSku = item.sku || "";
    let canonicalProd: typeof allProds[number] | undefined;
    if (effectiveSku) {
      canonicalProd = allProds.find(p => p.sku?.toLowerCase() === effectiveSku.toLowerCase());
    }
    if (!canonicalProd && item.productName) {
      canonicalProd = allProds.find(p => p.name?.toLowerCase() === item.productName.toLowerCase());
    }
    // Always prefer the canonical product's SKU so stock + POS stay in sync
    if (!effectiveSku && canonicalProd?.sku) effectiveSku = canonicalProd.sku;
    // Use canonical product name for storage (prevents duplicate records from name-casing variations)
    const canonicalName = canonicalProd?.name || item.productName;

    // Every stock record must have a SKU — generate one if we still don't have one
    if (!effectiveSku && canonicalName) {
      effectiveSku = generateProductSku(canonicalName);
    }
    if (!effectiveSku && !canonicalName) return; // nothing to identify the item

    const skuLower = effectiveSku.trim().toLowerCase();

    // SKU-only lookup — name-based fallback removed; backfillMissingSKUs() ensures
    // all existing stock records have a SKU before purchases are received.
    let i = stocks.findIndex(s => (s.sku?.trim() || "").toLowerCase() === skuLower && s.stockType === "For Sale");
    if (i < 0) i = stocks.findIndex(s => (s.sku?.trim() || "").toLowerCase() === skuLower);

    if (i >= 0) {
      if (alreadyReceived(stocks[i].id)) return; // duplicate guard — skip
      const current = Math.max(0, parseFloat(stocks[i].quantity) || 0);
      // Backfill SKU on existing stock record if it was missing (enables future POS lookups by SKU)
      const skuPatch = !stocks[i].sku && effectiveSku ? { sku: effectiveSku } : {};
      stocks[i] = { ...stocks[i], ...skuPatch, quantity: String(current + qty), updatedAt: new Date().toISOString() };
      ledger.push({
        entityType: "product", entityId: stocks[i].id, entityName: stocks[i].productName,
        date: today, txType: "purchase-receipt", sourceType, reference,
        qtyBefore: current, qtyChange: qty, qtyAfter: current + qty,
        unit: stocks[i].unit, notes: reference ? `Purchase ${reference}` : "Purchase Receipt",
      });
    } else {
      // No stock record yet — create one using the canonical product name & SKU
      const newItem: StockItem = {
        id:           crypto.randomUUID(),
        productName:  canonicalName || effectiveSku,
        sku:          effectiveSku,
        store:        "Warehouse",
        stockType:    "For Sale",
        quantity:     String(qty),
        minLevel:     "0",
        unit:         item.unit || "pcs",
        holdCustomer: "",
        holdReason:   "",
        notes:        `Auto-created from purchase ${reference}`,
        createdAt:    new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
      };
      stocks.push(newItem);
      ledger.push({
        entityType: "product", entityId: newItem.id, entityName: newItem.productName,
        date: today, txType: "purchase-receipt", sourceType, reference,
        qtyBefore: 0, qtyChange: qty, qtyAfter: qty,
        unit: newItem.unit, notes: reference ? `Purchase ${reference}` : "Purchase Receipt",
      });
    }
  });

  setStored(STOCK_KEY, stocks);
  batchLedger(ledger);
};

/** Reverse a purchase receipt — removes the stock that was added when the
 *  invoice was paid (e.g. when reverted to Draft or Cancelled). */
export const reverseStockForPurchase = (items: SaleItem[], reference = ""): void => {
  const stocks   = getStock();
  const allProds = getProducts();
  const today    = new Date().toISOString().slice(0, 10);
  const ledger: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  items.forEach(item => {
    const qty = parseFloat(item.qty) || 0;
    if (qty <= 0) return;

    // Resolve effective SKU — SKU is the canonical identifier
    const effectiveSku = item.sku || "";

    // Mirror the same lookup priority used when receiving
    let i = effectiveSku
      ? stocks.findIndex(s => s.sku === effectiveSku && s.stockType === "For Sale")
      : -1;
    if (i < 0 && effectiveSku) i = stocks.findIndex(s => s.sku === effectiveSku);
    if (i < 0 && item.productName) {
      i = stocks.findIndex(s => s.productName === item.productName && s.stockType === "For Sale");
      if (i < 0) i = stocks.findIndex(s => s.productName === item.productName);
    }
    if (i < 0) return;
    const current = Math.max(0, parseFloat(stocks[i].quantity) || 0);
    const deduct  = Math.min(current, qty);
    stocks[i] = { ...stocks[i], quantity: String(current - deduct), updatedAt: new Date().toISOString() };
    if (deduct > 0) ledger.push({
      entityType: "product", entityId: stocks[i].id, entityName: stocks[i].productName,
      date: today, txType: "purchase-receipt", reference,
      qtyBefore: current, qtyChange: -deduct, qtyAfter: current - deduct,
      unit: stocks[i].unit, notes: reference ? `Purchase Reversal ${reference}` : "Purchase Reversal",
    });
  });

  setStored(STOCK_KEY, stocks);
  batchLedger(ledger);
};

// ─── Invoices (standalone, separate from POS Sales) ──────────────────────────
export const INVOICE_STATUSES  = ["Draft", "Sent", "Paid", "Partial", "Overdue", "Cancelled"] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

export const INVOICE_TITLES = ["Invoice", "Tax Invoice", "Proforma Invoice", "Credit Note", "Debit Note"] as const;
export type InvoiceTitle = typeof INVOICE_TITLES[number];

export type PaymentRecord = {
  id:     string;
  date:   string;   // YYYY-MM-DD
  amount: string;
  method: string;
  note:   string;
};

export interface InvoiceDoc {
  id:      string;
  title:   string;
  content: string;
}

export type Invoice = {
  id:                string;
  invoiceNumber:     string;
  invoiceTitle:      string;    // "Invoice" | "Tax Invoice" | etc.
  invoiceType?:      "sale" | "purchase";  // "sale" (default) | "purchase"
  invoiceDate:       string;    // YYYY-MM-DD
  dueDate:           string;    // YYYY-MM-DD
  // Party info (customer for sale invoices, supplier for purchase invoices)
  customer:          string;
  customerId:        string;
  buyerAddress:      string;
  buyerTown:         string;
  buyerPhone:        string;
  buyerEmail:        string;
  salesOfficer:      string;
  // Status & payment
  status:            InvoiceStatus;
  saleStatus?:       string;        // fulfilment status: Pending, Processing, Dispatched, etc.
  stockReceived?:    boolean;       // true once items have been pushed to stock (purchase invoices)
  paymentMethod:     SalePayment;
  paymentTerms:      string;    // e.g. "Net 30", "Due on receipt"
  bankDetails:       string;    // bank account details for payment (legacy freetext)
  bankAccountIds?:   string[];  // IDs of selected bank accounts from settings
  amountPaid:        string;
  paidAt:            string;    // ISO timestamp; "" if unpaid
  paymentHistory:    PaymentRecord[];
  // Items & pricing
  items:             SaleItem[];
  taxRate:           string;    // percentage string e.g. "20"
  pricingMode?:      "wholesale" | "retail";  // sale invoice pricing tier
  shippingFee:       string;
  handlingFee:       string;
  shippingMethod:    string;
  // Agent
  agentId?:          string;    // linked SalesAgent.id
  agentName?:        string;    // denormalised agent name
  // Extra
  notes:             string;    // legacy — use invoiceDocs
  agreement:         string;    // legacy — use invoiceDocs
  invoiceFooter:     string;    // footer text printed at bottom of invoice
  invoiceDocs?:      InvoiceDoc[];  // dynamic document blocks (replaces paymentTerms/notes/agreement)
  stockDeducted:     boolean;
  jeId?:             string;   // journal entry ID auto-created on payment (prevents duplicates)
  jeUsesAR?:         boolean;  // true when the accrual JE debited AR (so a cash receipt JE is needed on payment)
  createdAt:         string;
  updatedAt:         string;
};

const INVOICES_KEY = "admin-invoices";

const nextInvoiceNumber = (type: "sale" | "purchase" = "sale"): string => {
  const existing = getStored<Invoice>(INVOICES_KEY);
  const settings = getSettings();
  const refDigits = settings.referenceDigits || 4;
  const d = new Date();
  const base = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const defaultPre = type === "purchase" ? "PINV" : "INV";
  const customPre = type === "purchase"
    ? (settings.purchasePrefix || "PO-").replace(/[-_\s]+$/, "")
    : defaultPre;
  const prefix = `${customPre}-${base}`;
  const max = existing
    .filter(inv => inv.invoiceNumber.startsWith(prefix))
    .map(inv => parseInt(inv.invoiceNumber.split("-").pop() ?? "0") || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}-${String(max + 1).padStart(refDigits, "0")}`;
};

export const getInvoices = (): Invoice[] => getStored<Invoice>(INVOICES_KEY);

/**
 * Returns the total outstanding receivable balance for a customer
 * across all their sale invoices EXCLUDING the given invoice id.
 * Used to compute "Previous Balance" on invoice prints.
 */
export function getCustomerPreviousBalance(customerName: string, excludeInvoiceId: string): number {
  if (!customerName) return 0;
  let balance = 0;
  for (const inv of getInvoices()) {
    if (inv.customer !== customerName) continue;
    if (inv.id === excludeInvoiceId) continue;
    if (inv.invoiceType === "purchase") continue;
    if (inv.status === "Cancelled") continue;
    const sub   = inv.items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.unitPrice)||0), 0);
    const disc  = inv.items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.unitPrice)||0) * ((parseFloat(i.discount)||0)/100), 0);
    const after = sub - disc;
    const tax   = after * (parseFloat(inv.taxRate)||0) / 100;
    const ship  = parseFloat(inv.shippingFee) || 0;
    const hand  = parseFloat(inv.handlingFee) || 0;
    const total = after + tax + ship + hand;
    const paid  = parseFloat(inv.amountPaid) || 0;
    balance += Math.max(0, total - paid);
  }
  return balance;
}

export const createInvoice = (data: Omit<Invoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt">): Invoice => {
  const inv: Invoice = {
    ...data,
    id: crypto.randomUUID(),
    invoiceNumber: nextInvoiceNumber(data.invoiceType),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(INVOICES_KEY, [...getInvoices(), inv]);
  return inv;
};

export const updateInvoice = (id: string, updates: Partial<Omit<Invoice, "id" | "invoiceNumber" | "createdAt">>): Invoice => {
  const all = getInvoices();
  const i = all.findIndex(inv => inv.id === id);
  if (i === -1) throw new Error("Invoice not found");
  all[i] = { ...all[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(INVOICES_KEY, all);
  return all[i];
};

export const deleteInvoice = (id: string): void => {
  // Cascade: delete every voucher (and its JE) linked to this invoice.
  const linked = getRPVouchers().filter(v =>
    v.linkedInvoiceId === id ||
    (v.linkedInvoiceIds ?? []).includes(id) ||
    v.lines.some(l => l.invoiceId === id)
  );
  // Collect all JE IDs to remove in one pass, then write JEs once.
  // (Avoids N sequential _apiWrite calls that could race each other.)
  const jeIdsToRemove = new Set(
    linked.map(v => v.journalEntryId).filter((jid): jid is string => !!jid)
  );
  if (jeIdsToRemove.size > 0) {
    _saveJournalEntries(getJournalEntries().filter(e => !jeIdsToRemove.has(e.id)));
  }
  _saveRPVouchers(getRPVouchers().filter(v => !linked.find(l => l.id === v.id)));
  setStored(INVOICES_KEY, getInvoices().filter(inv => inv.id !== id));
};

// ─── Sales Agents ─────────────────────────────────────────────────────────────
export type SalesAgentStatus = "Active" | "Inactive";

export type SalesAgent = {
  id:             string;
  agentCode:      string;   // unique, e.g. SA-001
  name:           string;
  email:          string;
  phone:          string;
  region:         string;   // territory / area they cover (free text, legacy)
  city?:          string;   // managed city
  area?:          string;   // managed area/region
  commissionRate: string;   // percentage e.g. "5"
  targetAmount:   string;   // monthly sales target (in base currency)
  status:           SalesAgentStatus;
  joinDate:         string;   // YYYY-MM-DD
  notes:            string;
  openingBalance?:  number;  // commission balance owed to agent at setup
  ledgerAccountId?: string;  // auto-created subsidiary ledger under Sales Commission
  // Portal login
  username?:      string;
  password?:      string;
  loginEnabled?:  boolean;
  createdAt:        string;
  updatedAt:        string;
};

const SALES_AGENTS_KEY = "admin-sales-agents";

export const getSalesAgents = (): SalesAgent[] => getStored<SalesAgent>(SALES_AGENTS_KEY);
export const getSalesAgent  = (id: string): SalesAgent | undefined => getSalesAgents().find(a => a.id === id);

const nextAgentCode = (): string => {
  const all = getSalesAgents();
  const nums = all.map(a => {
    const m = a.agentCode.match(/(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  });
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `SA-${String(next).padStart(3, "0")}`;
};

export const createSalesAgent = (data: Omit<SalesAgent, "id" | "agentCode" | "createdAt" | "updatedAt">): SalesAgent => {
  const ledgerAccountId = data.ledgerAccountId || createSubsidiaryLedger({
    parentId:    SYS_ACCS.COMMISSION_GROUP,
    parentCode:  "4300",
    name:        data.name,
    head:        "Expense",
    subType:     "Commission",
    description: `Commission ledger for sales agent: ${data.name}`,
  });
  const agent: SalesAgent = {
    ...data,
    ledgerAccountId,
    id:        crypto.randomUUID(),
    agentCode: nextAgentCode(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(SALES_AGENTS_KEY, [...getSalesAgents(), agent]);
  addActivity({ action: "created", entity: "SalesAgent", entityName: agent.name, detail: agent.agentCode });
  return agent;
};

export const updateSalesAgent = (id: string, updates: Partial<Omit<SalesAgent, "id" | "createdAt">>): SalesAgent => {
  const agents = getSalesAgents();
  const idx = agents.findIndex(a => a.id === id);
  if (idx === -1) throw new Error("Sales agent not found");
  agents[idx] = { ...agents[idx], ...updates, updatedAt: new Date().toISOString() };
  setStored(SALES_AGENTS_KEY, agents);
  addActivity({ action: "updated", entity: "SalesAgent", entityName: agents[idx].name });
  return agents[idx];
};

export const deleteSalesAgent = (id: string): void => {
  const agent = getSalesAgents().find(a => a.id === id);
  setStored(SALES_AGENTS_KEY, getSalesAgents().filter(a => a.id !== id));
  addActivity({ action: "deleted", entity: "SalesAgent", entityName: agent?.name || id });
};

/** Find a sales agent by portal login credentials (only if loginEnabled). */
export const getAgentByCredentials = (username: string, password: string): SalesAgent | undefined =>
  getSalesAgents().find(
    a => a.loginEnabled === true &&
         a.status === "Active" &&
         a.username?.toLowerCase() === username.toLowerCase() &&
         a.password === password
  );

/** Map a SalesAgent record to the AdminUser shape for the auth context. */
export const agentToAdminUser = (a: SalesAgent): AdminUser => ({
  id:        `agent:${a.id}`,
  username:  a.username ?? a.name.toLowerCase().replace(/\s+/g, "."),
  fullName:  a.name,
  email:     a.email ?? "",
  role:      "sales_agent",
  password:  a.password ?? "",
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

// ─── Raw Materials ────────────────────────────────────────────────────────────
const RM_KEY = "admin-raw-materials";

export type RawMaterial = {
  id:           string;
  rmCode:       string;   // RM-001 auto-generated
  name:         string;
  unit:         string;   // kg, litre, piece, etc.
  currentStock: string;   // numeric string
  costPerUnit:  string;   // numeric string
  notes:        string;
  createdAt:    string;
  updatedAt:    string;
};

export const getRawMaterials = (): RawMaterial[] => getStored<RawMaterial>(RM_KEY);

function nextRMCode(): string {
  const codes = getRawMaterials().map(r => r.rmCode).filter(c => /^RM-\d+$/.test(c));
  const max = codes.reduce((m, c) => Math.max(m, parseInt(c.replace("RM-", ""))), 0);
  return `RM-${String(max + 1).padStart(3, "0")}`;
}

export const createRawMaterial = (data: Omit<RawMaterial, "id" | "rmCode" | "createdAt" | "updatedAt">): RawMaterial => {
  const rm: RawMaterial = { ...data, id: crypto.randomUUID(), rmCode: nextRMCode(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(RM_KEY, [...getRawMaterials(), rm]);
  addActivity({ action: "created", entity: "RawMaterial", entityName: rm.name });
  // Record opening-balance ledger entry if initial stock > 0
  const initQty = parseFloat(rm.currentStock) || 0;
  if (initQty > 0) {
    batchLedger([{
      entityType: "raw-material", entityId: rm.id, entityName: rm.name,
      date:      new Date().toISOString().slice(0, 10),
      txType:    "opening-balance",
      reference: "MANUAL",
      qtyBefore: 0, qtyChange: initQty, qtyAfter: initQty,
      unit:      rm.unit,
      notes:     "Opening balance",
    }]);
  }
  return rm;
};

export const updateRawMaterial = (id: string, updates: Partial<Omit<RawMaterial, "id" | "createdAt">>): RawMaterial => {
  const rms = getRawMaterials();
  const i = rms.findIndex(r => r.id === id);
  if (i === -1) throw new Error("Raw material not found");
  const prev = rms[i];
  rms[i] = { ...prev, ...updates, updatedAt: new Date().toISOString() };
  setStored(RM_KEY, rms);
  addActivity({ action: "updated", entity: "RawMaterial", entityName: rms[i].name });
  // Record a manual-adjustment ledger entry whenever currentStock changes
  if ("currentStock" in updates && updates.currentStock !== undefined) {
    const before = parseFloat(prev.currentStock) || 0;
    const after  = parseFloat(updates.currentStock) || 0;
    const delta  = after - before;
    if (delta !== 0) {
      batchLedger([{
        entityType: "raw-material", entityId: id, entityName: rms[i].name,
        date:      new Date().toISOString().slice(0, 10),
        txType:    "manual-adjustment",
        reference: "MANUAL",
        qtyBefore: before, qtyChange: delta, qtyAfter: after,
        unit:      rms[i].unit,
        notes:     "Manual stock adjustment",
      }]);
    }
  }
  return rms[i];
};

export const deleteRawMaterial = (id: string): void => {
  const rm = getRawMaterials().find(r => r.id === id);
  setStored(RM_KEY, getRawMaterials().filter(r => r.id !== id));
  addActivity({ action: "deleted", entity: "RawMaterial", entityName: rm?.name || id });
};

// ─── Manufacturing Orders ─────────────────────────────────────────────────────
const MFG_KEY = "admin-manufacturing-orders";

export const MFG_STATUSES = ["Draft", "In Progress", "Completed", "Cancelled"] as const;
export type MfgStatus = typeof MFG_STATUSES[number];

export type MfgInput = {
  id:      string;
  rmId:    string;
  rmName:  string;
  unit:    string;
  qtyUsed: string;
};

export type MfgOutput = {
  id:          string;
  productId:   string;
  productName: string;
  qty:         string;
  unit:        string;
  manualCost?: string;  // by-product: manually entered cost/unit (overrides proportional share)
};

export type ProductionCost = {
  id:          string;
  description: string;  // Labour, Electricity, Machine hire, etc.
  amount:      string;  // numeric string
};

export type ManufacturingOrder = {
  id:                string;
  orderNumber:       string;
  orderDate:         string;
  status:            MfgStatus;
  inputs:            MfgInput[];
  // Multi-output support (new)
  outputs:           MfgOutput[];
  // Production costs (new)
  productionCosts:   ProductionCost[];
  // Waste tracking (new)
  wasteQty:          string;
  wasteUnit:         string;
  wasteNotes:        string;
  notes:             string;
  createdAt:         string;
  updatedAt:         string;
};

export const getManufacturingOrders = (): ManufacturingOrder[] => getStored<ManufacturingOrder>(MFG_KEY);

function nextMOCode(): string {
  const codes = getManufacturingOrders().map(o => o.orderNumber).filter(c => /^MO-\d+$/.test(c));
  const max = codes.reduce((m, c) => Math.max(m, parseInt(c.replace("MO-", ""))), 0);
  return `MO-${String(max + 1).padStart(3, "0")}`;
}

export const createManufacturingOrder = (data: Omit<ManufacturingOrder, "id" | "orderNumber" | "createdAt" | "updatedAt">): ManufacturingOrder => {
  const order: ManufacturingOrder = { ...data, id: crypto.randomUUID(), orderNumber: nextMOCode(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(MFG_KEY, [...getManufacturingOrders(), order]);
  addActivity({ action: "created", entity: "ManufacturingOrder", entityName: order.orderNumber });
  return order;
};

export const updateManufacturingOrder = (id: string, updates: Partial<Omit<ManufacturingOrder, "id" | "createdAt">>): ManufacturingOrder => {
  const orders = getManufacturingOrders();
  const i = orders.findIndex(o => o.id === id);
  if (i === -1) throw new Error("Manufacturing order not found");
  orders[i] = { ...orders[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(MFG_KEY, orders);
  addActivity({ action: "updated", entity: "ManufacturingOrder", entityName: orders[i].orderNumber });
  return orders[i];
};

export const deleteManufacturingOrder = (id: string): void => {
  const o = getManufacturingOrders().find(o => o.id === id);
  setStored(MFG_KEY, getManufacturingOrders().filter(o => o.id !== id));
  addActivity({ action: "deleted", entity: "ManufacturingOrder", entityName: o?.orderNumber || id });
};

export const completeManufacturingOrder = (id: string): ManufacturingOrder => {
  const orders = getManufacturingOrders();
  const i = orders.findIndex(o => o.id === id);
  if (i === -1) throw new Error("Manufacturing order not found");
  const order = orders[i];
  if (order.status === "Completed") throw new Error("Order already completed");

  // Deduct raw materials + record ledger
  const rms    = getRawMaterials();
  const today  = new Date().toISOString().slice(0, 10);
  const ledger: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  order.inputs.forEach(inp => {
    const ri = rms.findIndex(r => r.id === inp.rmId);
    if (ri >= 0) {
      const current = Math.max(0, parseFloat(rms[ri].currentStock) || 0);
      const deduct  = Math.min(current, parseFloat(inp.qtyUsed) || 0);
      rms[ri] = { ...rms[ri], currentStock: String(current - deduct), updatedAt: new Date().toISOString() };
      if (deduct > 0) ledger.push({
        entityType: "raw-material", entityId: rms[ri].id, entityName: rms[ri].name,
        date: today, txType: "mfg-input", reference: order.orderNumber,
        qtyBefore: current, qtyChange: -deduct, qtyAfter: current - deduct,
        unit: rms[ri].unit, notes: `Consumed by ${order.orderNumber}`,
      });
    }
  });
  setStored(RM_KEY, rms);

  // Calculate total production cost (RM inputs + extra production costs)
  const rmInputCost = order.inputs.reduce((sum, inp) => {
    const rm = rms.find(r => r.id === inp.rmId);
    return sum + (parseFloat(inp.qtyUsed) || 0) * (parseFloat(rm?.costPerUnit || "0") || 0);
  }, 0);
  const extraCost = (order.productionCosts || []).reduce((sum, pc) => sum + (parseFloat(pc.amount) || 0), 0);
  const totalCost = rmInputCost + extraCost;

  // Add outputs to product stock (multi-output support) + record ledger
  const allProducts = getProducts();
  const effectiveOutputs: MfgOutput[] = (order.outputs && order.outputs.length > 0) ? order.outputs : [];
  const totalOutputQty = effectiveOutputs.reduce((sum, out) => sum + (parseFloat(out.qty) || 0), 0);

  effectiveOutputs.forEach(out => {
    const qty = parseFloat(out.qty) || 0;
    if (!out.productName || qty <= 0) return;

    let pi = out.productId ? allProducts.findIndex(p => p.id === out.productId) : -1;
    if (pi === -1) pi = allProducts.findIndex(p => p.name.toLowerCase().trim() === out.productName.toLowerCase().trim());
    const product = pi >= 0 ? allProducts[pi] : undefined;

    // Auto-update costPrice based on actual production cost (user can still override manually)
    if (pi >= 0 && totalCost > 0 && totalOutputQty > 0) {
      const unitCost = (totalCost / totalOutputQty).toFixed(2);
      allProducts[pi] = { ...allProducts[pi], costPrice: unitCost, updatedAt: new Date().toISOString() };
    }

    const newStock = createStockItem({
      productName:  out.productName,
      sku:          product?.sku || out.productName.toLowerCase().replace(/\s+/g, "-"),
      store:        "Manufacturing",
      stockType:    "For Sale",
      quantity:     out.qty,
      minLevel:     "0",
      unit:         out.unit || product?.unit || "",
      holdCustomer: "",
      holdReason:   "",
      notes:        `Produced by ${order.orderNumber}`,
    });
    ledger.push({
      entityType: "product", entityId: newStock.id, entityName: newStock.productName,
      date: today, txType: "mfg-output", reference: order.orderNumber,
      qtyBefore: 0, qtyChange: qty, qtyAfter: qty,
      unit: newStock.unit, notes: `Produced by ${order.orderNumber}`,
    });
  });

  setStored(PRODUCTS_KEY, allProducts);
  batchLedger(ledger);

  orders[i] = { ...orders[i], status: "Completed", updatedAt: new Date().toISOString() };
  setStored(MFG_KEY, orders);
  addActivity({ action: "updated", entity: "ManufacturingOrder", entityName: order.orderNumber });
  return orders[i];
};

// ─── Manufacturing Recipes ────────────────────────────────────────────────────
const MFG_RECIPE_KEY = "admin-manufacturing-recipes";

export type MfgRecipe = {
  id:              string;
  name:            string;
  inputs:          MfgInput[];
  outputs:         MfgOutput[];
  productionCosts: ProductionCost[];
  notes:           string;
  createdAt:       string;
};

export const getRecipes = (): MfgRecipe[] => getStored<MfgRecipe>(MFG_RECIPE_KEY);

export const createRecipe = (data: Omit<MfgRecipe, "id" | "createdAt">): MfgRecipe => {
  const recipe: MfgRecipe = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  setStored(MFG_RECIPE_KEY, [...getRecipes(), recipe]);
  return recipe;
};

export const deleteRecipe = (id: string): void => {
  setStored(MFG_RECIPE_KEY, getRecipes().filter(r => r.id !== id));
};

// ─── HRM — Staff ─────────────────────────────────────────────────────────────
export type StaffStatus = "Active" | "On Leave" | "Terminated";

export type Staff = {
  id: string;
  name: string;
  department: string;
  designation: string;
  role: string;
  status: StaffStatus;
  email: string;
  phone: string;
  joinDate: string;
  notes: string;
  openingBalance?: number;   // salary advance / balance owed at setup
  // ── Salary details ──
  salaryType?:   "Monthly" | "Hourly" | "Daily" | "Commission";
  basicSalary?:  number;    // base pay amount
  allowances?:   number;    // total allowances (transport, housing, etc.)
  deductions?:   number;    // total deductions (tax, provident fund, etc.)
  bankName?:     string;    // bank name for payroll
  accountNumber?: string;   // bank account / IBAN
  // Login credentials (optional — set by admin)
  username?: string;
  password?: string;
  loginEnabled?: boolean;
  ledgerAccountId?: string;  // auto-created subsidiary ledger under Salary & Wages
  createdAt: string;
  updatedAt: string;
};

const STAFF_KEY = "admin-hrm-staff";

export const getStaff = (): Staff[] => getStored<Staff>(STAFF_KEY);

export const createStaff = (data: Omit<Staff, "id" | "createdAt" | "updatedAt">): Staff => {
  const ledgerAccountId = data.ledgerAccountId || createSubsidiaryLedger({
    parentId:    SYS_ACCS.SALARY_GROUP,
    parentCode:  "4200",
    name:        data.name + (data.designation ? ` — ${data.designation}` : ""),
    head:        "Expense",
    subType:     "Payroll",
    description: `Salary ledger for staff member: ${data.name}`,
  });
  const item: Staff = { ...data, ledgerAccountId, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(STAFF_KEY, [...getStaff(), item]);
  return item;
};

export const updateStaff = (id: string, updates: Partial<Omit<Staff, "id" | "createdAt">>): Staff => {
  const items = getStaff();
  const i = items.findIndex(s => s.id === id);
  if (i === -1) throw new Error("Staff not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(STAFF_KEY, items);
  return items[i];
};

export const deleteStaff = (id: string): void => {
  setStored(STAFF_KEY, getStaff().filter(s => s.id !== id));
};

/** Find a staff member by login credentials (only if loginEnabled). */
export const getStaffByCredentials = (username: string, password: string): Staff | undefined =>
  getStaff().find(
    s => s.loginEnabled === true &&
         s.username?.toLowerCase() === username.toLowerCase() &&
         s.password === password
  );

/** Map a Staff record to the AdminUser shape for the auth context. */
export const staffToAdminUser = (s: Staff): AdminUser => ({
  id:        s.id,
  username:  s.username ?? s.name.toLowerCase().replace(/\s+/g, "."),
  fullName:  s.name,
  email:     s.email ?? "",
  role:      "staff",
  password:  s.password ?? "",
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

// ─── HRM — Roles ─────────────────────────────────────────────────────────────
export type StaffRole = {
  id: string;
  color: string;
  name: string;
  description: string;
  permissions: string; // comma-separated permission keys
  createdAt: string;
  updatedAt: string;
};

const HRM_ROLES_KEY = "admin-hrm-roles";

export const getStaffRoles = (): StaffRole[] => getStored<StaffRole>(HRM_ROLES_KEY);

export const createStaffRole = (data: Omit<StaffRole, "id" | "createdAt" | "updatedAt">): StaffRole => {
  const item: StaffRole = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(HRM_ROLES_KEY, [...getStaffRoles(), item]);
  return item;
};

export const updateStaffRole = (id: string, updates: Partial<Omit<StaffRole, "id" | "createdAt">>): StaffRole => {
  const items = getStaffRoles();
  const i = items.findIndex(r => r.id === id);
  if (i === -1) throw new Error("Role not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(HRM_ROLES_KEY, items);
  return items[i];
};

export const deleteStaffRole = (id: string): void => {
  setStored(HRM_ROLES_KEY, getStaffRoles().filter(r => r.id !== id));
};

// ─── HRM — Departments ────────────────────────────────────────────────────────
export type Department = {
  id: string;
  name: string;
  description: string;
  headOf: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const HRM_DEPT_KEY = "admin-hrm-departments";

export const getDepartments = (): Department[] => getStored<Department>(HRM_DEPT_KEY);

export const createDepartment = (data: Omit<Department, "id" | "createdAt" | "updatedAt">): Department => {
  const item: Department = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(HRM_DEPT_KEY, [...getDepartments(), item]);
  return item;
};

export const updateDepartment = (id: string, updates: Partial<Omit<Department, "id" | "createdAt">>): Department => {
  const items = getDepartments();
  const i = items.findIndex(r => r.id === id);
  if (i === -1) throw new Error("Department not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(HRM_DEPT_KEY, items);
  return items[i];
};

export const deleteDepartment = (id: string): void => {
  setStored(HRM_DEPT_KEY, getDepartments().filter(r => r.id !== id));
};

// ─── HRM — Designations ───────────────────────────────────────────────────────
export type Designation = {
  id: string;
  title: string;
  department: string;
  jobDescription: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const HRM_DESIG_KEY = "admin-hrm-designations";

export const getDesignations = (): Designation[] => getStored<Designation>(HRM_DESIG_KEY);

export const createDesignation = (data: Omit<Designation, "id" | "createdAt" | "updatedAt">): Designation => {
  const item: Designation = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(HRM_DESIG_KEY, [...getDesignations(), item]);
  return item;
};

export const updateDesignation = (id: string, updates: Partial<Omit<Designation, "id" | "createdAt">>): Designation => {
  const items = getDesignations();
  const i = items.findIndex(r => r.id === id);
  if (i === -1) throw new Error("Designation not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(HRM_DESIG_KEY, items);
  return items[i];
};

export const deleteDesignation = (id: string): void => {
  setStored(HRM_DESIG_KEY, getDesignations().filter(r => r.id !== id));
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const SETTINGS_KEY = "admin-settings";

export type LegalDocument = {
  id:         string;
  title:      string;
  content:    string;
  isTemplate: boolean;
  createdAt:  string;
  updatedAt:  string;
};

export type BankAccount = {
  id:       string;
  name:     string;   // e.g. "Barclays Bank plc"
  details:  string;   // multiline: account no, sort code, IBAN, etc.
  isDefault?: boolean;
};

export type AppSettings = {
  companyName:          string;
  companyTagline:       string;
  logoBase64:           string;
  officeName1:          string;
  emailHull:            string;
  emailIslamabad:       string;
  phoneHull:            string;
  phoneIslamabad:       string;
  addressHull:          string;
  officeName2:          string;
  addressIslamabad:     string;
  website:              string;
  currency:             string;
  vatRate:              string;
  vatNumber:            string;
  fiscalYearStart:      string;
  salePrefix:           string;
  purchasePrefix:       string;
  defaultPaymentMethod: string;
  receiptHeader:        string;
  receiptFooter:        string;
  taxOnPOS:             boolean;
  termsAndConditions:   string;
  privacyPolicy:        string;
  legalDocuments:       LegalDocument[];
  // Invoice-related company info
  bankDetails:          string;   // legacy single freetext block
  bankAccounts?:        BankAccount[]; // structured list of payment/bank accounts
  companyRegistration:  string;   // registered company number
  socialLinks:          string;   // social media links (one per line)
  invoiceTerms:         string;   // default payment terms text
  invoiceFooter:        string;   // default invoice footer text
  // ── Accounting mappings (COA account IDs for auto-journaling) ──
  accSalesRevenue:      string;   // CR when a sale is completed
  accCash:              string;   // DR for Cash payments
  accBank:              string;   // DR for Card / Bank Transfer / Cheque payments
  accReceivable:        string;   // DR for Credit / On-Credit sales
  accVatPayable:        string;   // CR for VAT collected (optional)
  accCogs:              string;   // DR for Cost of Goods Sold (optional)
  accInventory:         string;   // CR for Inventory reduced on sale (optional)
  accPurchasePayable:   string;   // CR for Accounts Payable on purchase receipt (optional)
  // ── Inventory behaviour ──
  allowNegativeStock:   boolean;  // if false, POS blocks selling when stock qty <= 0
  // ── POS discount behaviour ──
  posDiscountType:      "pct" | "amt";  // default discount mode for new POS line items
  // ── Number formatting ──
  decimalPlaces:        0 | 1 | 2 | 3 | 4;  // decimal places for all monetary/numeric display
  // ── Reference number padding ──
  referenceDigits:      number;  // how many digits to pad the sequence number (e.g. 4 → SAL-0001, 5 → SAL-00001)
  // ── POS display ──
  showPosProfit:        boolean; // show green profit amount under each line subtotal in POS
  posProductView:       "image" | "list"; // POS catalogue layout: image grid (4-col) or text list (2-col)
  // ── CRM / HRM form display ──
  crmFormMode:          "dialog" | "sheet"; // default open mode for all CRM/HRM add-forms
  // ── Right sidebar quick-action customisation ──
  quickActionsRight?: { id: string; visible: boolean }[]; // ordered list, undefined = use built-in defaults
  // ── Left sidebar quick-action customisation ──
  quickActionsLeft?:  { id: string; visible: boolean }[]; // ordered list, undefined = use built-in defaults
  // ── Font sizes (px) ──
  fontHeadRow?:    number;   // table/grid column header font size (default 12)
  fontDataRow?:    number;   // table/grid data row font size (default 13)
  fontButton?:     number;   // button text font size (default 13)
  fontTag?:        number;   // badge/tag/pill font size (default 11)
  fontFilter?:     number;   // filter bar / toolbar text font size (default 12)
  // ── Print template ──
  printHeaderNote?:          string;   // extra text/note shown in the invoice header band
  printFooterLegalNote?:     string;   // small legal note at the bottom of the footer
  printFooterShowContact?:   boolean;  // show company contact info line in footer (default: true)
  // ── Invoice items table direction ──
  invoiceColsRTL?:           boolean;  // reverse items table column order (RTL layout for Arabic/Urdu invoices)
  // ── Invoice product name field ──
  invoiceProductNameField?:  "name" | "localName"; // which product name field to use in invoice line items
  // ── Invoice label customisation ──
  invoiceLabels?:             Partial<InvoiceLabels>;
  invoiceLabelStyles?:        Record<string, LabelStyle>;
  purchaseInvoiceLabels?:     Partial<InvoiceLabels>;
  purchaseInvoiceLabelStyles?: Record<string, LabelStyle>;
};

export interface LabelStyle {
  color?:         string;             // CSS hex colour e.g. "#1e40af"
  fontSize?:      number;             // pt, e.g. 9
  fontWeight?:    "normal" | "600" | "bold" | "800" | "900";
  fontStyle?:     "normal" | "italic";
  textTransform?: "none" | "uppercase" | "lowercase";
}

export interface InvoiceLabels {
  // Document title (header right)
  invoiceTitle:         string;    // e.g. "TAX INVOICE", "SALES INVOICE"
  purchaseInvoiceTitle: string;    // e.g. "PURCHASE ORDER", "BILL"
  // Footer note
  footerNote:           string;    // short line at bottom of the invoice
  // Header / meta
  billTo:               string;
  invoiceDateLabel:     string;
  dueDateLabel:         string;
  paymentViaLabel:      string;
  // Items table
  itemsSectionTitle:    string;
  colNum:               string;
  colDescription:       string;
  colUnit:              string;
  colQty:               string;
  colUnitPrice:         string;
  colDisc:              string;
  colTotal:             string;
  // Totals
  subtotalLabel:        string;
  vatLabel:             string;
  deliveryLabel:        string;
  otherChargesLabel:    string;
  totalLabel:           string;
  amountPaidLabel:      string;
  balanceDueLabel:      string;
  previousBalanceLabel: string;
  newBalanceLabel:      string;
  fullyPaidLabel:       string;
  // Sections
  termsSectionTitle:    string;
  paymentTermsTitle:    string;
  additionalNotesTitle: string;
  agreementTitle:       string;
  // Payment history
  paymentHistoryTitle:  string;
  bankDetailsTitle:     string;
}

export const DEFAULT_INVOICE_LABELS: InvoiceLabels = {
  invoiceTitle:         "TAX INVOICE",
  purchaseInvoiceTitle: "PURCHASE ORDER",
  footerNote:           "Thank you for your business.",
  billTo:               "Bill To",
  invoiceDateLabel:     "Invoice Date",
  dueDateLabel:         "Due Date",
  paymentViaLabel:      "Payment Via",
  itemsSectionTitle:    "Items & Services",
  colNum:               "#",
  colDescription:       "Description",
  colUnit:              "Unit",
  colQty:               "Qty",
  colUnitPrice:         "Unit Price",
  colDisc:              "Disc",
  colTotal:             "Total",
  subtotalLabel:        "Subtotal",
  vatLabel:             "VAT / Tax",
  deliveryLabel:        "Delivery",
  otherChargesLabel:    "Other Charges",
  totalLabel:           "Total",
  amountPaidLabel:      "Amount Paid",
  balanceDueLabel:      "Balance Due",
  previousBalanceLabel: "Previous Balance",
  newBalanceLabel:      "New Balance",
  fullyPaidLabel:       "Fully Paid",
  termsSectionTitle:    "Terms & Notes",
  paymentTermsTitle:    "Payment Terms",
  additionalNotesTitle: "Additional Notes",
  agreementTitle:       "Agreement",
  paymentHistoryTitle:  "Payment History",
  bankDetailsTitle:     "Bank Details",
};

export function getInvoiceLabels(): InvoiceLabels {
  const saved = getSettings().invoiceLabels ?? {};
  return { ...DEFAULT_INVOICE_LABELS, ...saved };
}

export function getInvoiceLabelStyles(): Record<string, LabelStyle> {
  return getSettings().invoiceLabelStyles ?? {};
}

export const DEFAULT_PURCHASE_INVOICE_LABELS: InvoiceLabels = {
  ...DEFAULT_INVOICE_LABELS,
  invoiceTitle:         "PURCHASE ORDER",
  purchaseInvoiceTitle: "PURCHASE ORDER",
  billTo:               "Supplier",
  footerNote:           "Thank you for your order.",
};

export function getPurchaseInvoiceLabels(): InvoiceLabels {
  const saved = getSettings().purchaseInvoiceLabels ?? {};
  return { ...DEFAULT_PURCHASE_INVOICE_LABELS, ...saved };
}

export function getPurchaseInvoiceLabelStyles(): Record<string, LabelStyle> {
  return getSettings().purchaseInvoiceLabelStyles ?? {};
}

export const DEFAULT_SETTINGS: AppSettings = {
  companyName:          "Onesoft",
  companyTagline:       "Software & IT Solutions",
  logoBase64:           "",
  officeName1:          "",
  emailHull:            "",
  emailIslamabad:       "",
  phoneHull:            "",
  phoneIslamabad:       "",
  addressHull:          "",
  officeName2:          "",
  addressIslamabad:     "",
  website:              "",
  currency:             "GBP",
  vatRate:              "20",
  vatNumber:            "",
  fiscalYearStart:      "January",
  salePrefix:           "SAL-",
  purchasePrefix:       "PO-",
  defaultPaymentMethod: "Cash",
  receiptHeader:        "",
  receiptFooter:        "Thank you for your business!",
  taxOnPOS:             true,
  termsAndConditions:   "",
  privacyPolicy:        "",
  legalDocuments:       [],
  bankDetails:          "",
  bankAccounts:         [],
  companyRegistration:  "",
  socialLinks:          "",
  invoiceTerms:         "Payment is due within 30 days of the invoice date.",
  invoiceFooter:        "",
  accSalesRevenue:      "sys-3100",
  accCash:              "sys-1200",
  accBank:              "",
  accReceivable:        "sys-1101",
  accVatPayable:        "sys-2200",
  accCogs:              "sys-4100",
  accInventory:         "sys-1300",
  accPurchasePayable:   "",
  allowNegativeStock:   true,
  posDiscountType:      "pct",
  decimalPlaces:        2,
  referenceDigits:      4,
  showPosProfit:        true,
  posProductView:       "image",
  crmFormMode:          "dialog",
  fontHeadRow:          12,
  fontDataRow:          13,
  fontButton:           13,
  fontTag:              11,
  fontFilter:           12,
  printHeaderNote:          "",
  printFooterLegalNote:     "This is a computer-generated document. No handwritten signature is required.",
  printFooterShowContact:   true,
  invoiceColsRTL:           false,
  invoiceProductNameField:  "name",
};

export function getSettings(): AppSettings {
  try {
    const raw = _lsGet(tenantKey(SETTINGS_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged: AppSettings = { ...DEFAULT_SETTINGS, ...parsed };
      // Migrate old termsAndConditions / privacyPolicy into legalDocuments if needed
      if (!Array.isArray(merged.legalDocuments)) merged.legalDocuments = [];
      const hasTerms   = merged.legalDocuments.some(d => d.id === "__terms__");
      const hasPrivacy = merged.legalDocuments.some(d => d.id === "__privacy__");
      const now = new Date().toISOString();
      if (!hasTerms && merged.termsAndConditions) {
        merged.legalDocuments.unshift({
          id: "__terms__", title: "Terms & Conditions",
          content: merged.termsAndConditions, isTemplate: false,
          createdAt: now, updatedAt: now,
        });
      }
      if (!hasPrivacy && merged.privacyPolicy) {
        merged.legalDocuments.push({
          id: "__privacy__", title: "Privacy Policy",
          content: merged.privacyPolicy, isTemplate: false,
          createdAt: now, updatedAt: now,
        });
      }
      // ── Backfill empty accounting mappings with system defaults ──────────────
      // Handles existing saved settings that have "" from before system defaults existed.
      if (!merged.accSalesRevenue) merged.accSalesRevenue = SYS_ACCS.SALES_REVENUE;
      if (!merged.accCash)         merged.accCash         = SYS_ACCS.CASH;
      if (!merged.accReceivable)   merged.accReceivable   = SYS_ACCS.AR_GROUP;
      if (!merged.accVatPayable)   merged.accVatPayable   = SYS_ACCS.VAT_PAYABLE;
      if (!merged.accCogs)         merged.accCogs         = SYS_ACCS.COGS;
      if (!merged.accInventory)    merged.accInventory    = SYS_ACCS.INVENTORY;
      return merged;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

/** Returns the display name for a product as it should appear in invoice line items. */
export function getInvoiceProductName(p: Pick<Product, "name" | "localName">): string {
  const field = getSettings().invoiceProductNameField ?? "name";
  if (field === "localName") return p.localName?.trim() || p.name;
  return p.name;
}

/**
 * Find the parent product for a sale/invoice line item.
 * SKU is the canonical identifier. Tries direct product SKU first, then variant SKU,
 * then falls back to name for legacy records.
 */
export function findProductForItem(it: SaleItem, prods: Product[]): Product | undefined {
  if (it.sku) {
    // Direct product SKU match
    const byProductSku = prods.find(p => p.sku === it.sku);
    if (byProductSku) return byProductSku;
    // Variant SKU match — item.sku may be a variant's own SKU; return the parent product
    const byVariantSku = prods.find(p => p.variants?.some(v => v.sku === it.sku));
    if (byVariantSku) return byVariantSku;
  }
  // Fallback: name match (for legacy records with no SKU)
  return prods.find(p => p.name === it.productName);
}

/**
 * Resolve the unit cost for a sale line item, respecting variant-level costPrice.
 * Uses item.sku to identify the exact variant sold (SKU is the canonical identifier).
 * Falls back to parent product costPrice if no variant match or variant has no cost.
 */
export function effectiveItemCost(it: SaleItem, prod: Product | undefined): number {
  // 1. Use cost price locked at sale time (most reliable — not affected by product edits/deletions)
  if (it.costPrice !== undefined && it.costPrice !== "") {
    const lockedCost = parseFloat(it.costPrice);
    if (!isNaN(lockedCost)) return lockedCost;
  }
  // 2. Fall back to live product lookup (legacy items without locked cost price)
  if (prod?.variants?.length && it.sku) {
    const variant = prod.variants.find(v => v.sku === it.sku);
    if (variant) {
      const vCost = parseFloat(variant.costPrice ?? "");
      if (!isNaN(vCost) && vCost > 0) return vCost;
    }
  }
  return parseFloat(prod?.costPrice ?? "0") || 0;
}

export function saveSettings(s: AppSettings): void {
  const sk = tenantKey(SETTINGS_KEY);
  _lsSet(sk, s);
  _apiWrite(sk, s);
  window.dispatchEvent(new CustomEvent("admin-settings-changed"));
}

export function getBankAccounts(): BankAccount[] {
  return getSettings().bankAccounts ?? [];
}

// All localStorage keys for export/import/reset
export const ALL_STORE_KEYS = [
  "admin-leads", "admin-req-docs", "admin-customers",
  "admin-products", "admin-product-categories", "admin-brands", "admin-attributes",
  "admin-units", "admin-purchase-orders", "admin-stock", "admin-sales", "admin-invoices",
  "admin-sale-returns", "admin-hrm-staff", "admin-hrm-roles", "admin-hrm-departments", "admin-hrm-designations", "admin-users", "admin-team-members",
  "admin-settings", "admin-journal-entries", "admin-stock-ledger", "admin-payment-accounts",
] as const;

export type StoreKey = typeof ALL_STORE_KEYS[number];

export const MODULE_KEYS: Record<string, StoreKey[]> = {
  CRM:                  ["admin-leads", "admin-customers"],
  Products:             ["admin-products", "admin-product-categories", "admin-brands", "admin-attributes", "admin-units"],
  Stock:                ["admin-stock"],
  Purchases:            ["admin-purchase-orders"],
  Sales:                ["admin-sales", "admin-invoices", "admin-sale-returns"],
  Documents:            ["admin-req-docs"],
  HRM:                  ["admin-hrm-staff", "admin-hrm-roles", "admin-hrm-departments", "admin-hrm-designations"],
  Users:                ["admin-users"],
  "Stock Ledger History": ["admin-stock-ledger"],
};

/**
 * Clears one or more module keys for the CURRENT tenant (or superadmin if no
 * tenant is active).  Removes from localStorage AND pushes [] to the server so
 * data does not reappear on the next page load.
 */
export function clearStoredModule(keys: readonly string[]): void {
  keys.forEach(k => {
    const sk = tenantKey(k);
    _lsSet(sk, []);
    _apiWrite(sk, []);
  });
}

/**
 * Clears ALL module keys for the current tenant/superadmin — used by "Nuke all" in Settings.
 */
export function clearAllStoredModules(): void {
  clearStoredModule(ALL_STORE_KEYS);
}

/**
 * Returns Chart of Accounts for a specific tenant (or active tenant if omitted).
 * Reads from in-memory cache — never from localStorage.
 */
export function getChartOfAccountsForTenant(tenantId?: string): Account[] {
  const key = tenantId ? `t:${tenantId}:${COA_KEY}` : tenantKey(COA_KEY);
  try { return JSON.parse(_lsGet(key) || "[]") as Account[]; }
  catch { return []; }
}

/**
 * Reads all module data from in-memory cache (populated from server on sync).
 * Use this for backup/export — never read from localStorage directly.
 */
export function getStoredModuleSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  ALL_STORE_KEYS.forEach(k => {
    const raw = _lsGet(tenantKey(k));
    if (raw) {
      try { snapshot[k] = JSON.parse(raw); } catch { /* skip malformed */ }
    }
  });
  return snapshot;
}

/**
 * Restores a module snapshot to memory + server.
 * Use this for backup restore — never write to localStorage directly.
 * Returns the number of modules restored.
 */
export function restoreStoredModuleSnapshot(data: Record<string, unknown>): number {
  let count = 0;
  ALL_STORE_KEYS.forEach(k => {
    if (k in data && Array.isArray(data[k])) {
      const sk = tenantKey(k);
      _lsSet(sk, data[k]);
      _apiWrite(sk, data[k]);
      count++;
    }
  });
  // Notify all data hooks that data changed
  try { window.dispatchEvent(new CustomEvent("onesoft:data-synced")); } catch { /* SSR guard */ }
  return count;
}

/**
 * Resets the accounting ledger to zero:
 *  1. Deletes all journal entries.
 *  2. Resets every COA account's opening balance to 0.
 * The Chart of Accounts structure (accounts, groups) is preserved.
 */
export function clearAccountingLedger(): void {
  // 1 — wipe journal entries
  const jeKey = tenantKey(JE_KEY);
  _lsRemove(jeKey);
  _apiWrite(jeKey, []);

  // 2 — reset opening balances to 0 on all COA accounts
  const coaKey = tenantKey(COA_KEY);
  const accounts = getAccounts().map(a => ({ ...a, openingBalance: 0 }));
  _lsSet(coaKey, accounts);
  _apiWrite(coaKey, accounts);
}

export const addTeamMember = (name: string): string[] => {
  const current = getTeamMembers();
  if (current.includes(name)) return current;
  const updated = [...current, name];
  const sk = tenantKey(TEAM_KEY);
  _lsSet(sk, updated);
  _apiWrite(sk, updated);
  return updated;
};

export const removeTeamMember = (name: string): string[] => {
  const updated = getTeamMembers().filter(m => m !== name);
  const sk = tenantKey(TEAM_KEY);
  _lsSet(sk, updated);
  _apiWrite(sk, updated);
  return updated;
};

// ─── Chart of Accounts ────────────────────────────────────────────────────────
export type AccountHead = "Assets" | "Liabilities" | "Revenue / Income" | "Expense" | "Equity";
export const ACCOUNT_HEADS: AccountHead[] = ["Assets", "Liabilities", "Revenue / Income", "Expense", "Equity"];

export const HEAD_SUB_TYPES: Record<AccountHead, string[]> = {
  "Assets":           ["Current Asset", "Fixed Asset", "Other Asset"],
  "Liabilities":      ["Current Liability", "Long-term Liability", "Other Liability"],
  "Revenue / Income": ["Operating Revenue", "Other Income"],
  "Expense":          ["Cost of Goods Sold", "Operating Expense", "Other Expense"],
  "Equity":           ["Owner's Equity", "Retained Earnings"],
};

export type AccountKind = "Group" | "Ledger";

export type Account = {
  id: string;
  code: string;
  name: string;
  head: AccountHead;
  subType: string;
  description: string;
  parentId: string | null;
  accountType: AccountKind;
  openingBalance: number;
  paymentType: "Debit" | "Credit" | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const COA_KEY = "admin-chart-of-accounts";

// ─── System / Default account stable IDs ──────────────────────────────────────
// These IDs are pre-defined (not UUIDs) so they are stable across sessions and
// can be referenced directly for accounting mappings and subsidiary ledgers.
export const SYS_ACCS = {
  // Assets — root + sub-groups
  ASSETS_ROOT:        "sys-1000r",  // root Assets group (1000)
  CURRENT_ASSETS:     "sys-1000",   // Current Assets group (1100) — child of ASSETS_ROOT
  CB_GROUP:           "sys-1150",   // Cash & Bank Accounts GROUP (1150) — parent for payment accounts
  AR_GROUP:           "sys-1100",   // Accounts Receivable GROUP (1130) — parent for per-customer ledgers
  AR_TRADE:           "sys-1101",   // Trade Receivables LEDGER (1131)
  CASH:               "sys-1200",   // Cash in Hand (1110)
  BANK:               "sys-1210",   // Bank Account (1120)
  INVENTORY:          "sys-1300",   // Inventory / Stock (1140)
  NON_CURRENT_ASSETS: "sys-1200g",  // Non-Current Assets group (1200) — child of ASSETS_ROOT
  PPE:                "sys-1210g",  // Property, Plant & Equipment (1210)
  ACCUM_DEPR:         "sys-1220g",  // Accumulated Depreciation (1220, contra asset)
  // Liabilities — root + sub-groups
  LIAB_ROOT:          "sys-2000r",  // root Liabilities group (2000)
  CURRENT_LIAB:       "sys-2000",   // Current Liabilities group (2100) — child of LIAB_ROOT
  AP_GROUP:           "sys-2100",   // Accounts Payable GROUP (2110)
  AP_TRADE:           "sys-2101",   // Trade Payables GROUP (2111) — parent for per-supplier ledgers
  AP_GENERAL:         "sys-2102",   // General Accounts Payable LEDGER (2112) — fallback for JE posting
  VAT_PAYABLE:        "sys-2200",   // VAT / Tax Payable (2120)
  ACCRUED_EXP:        "sys-2130",   // Accrued Expenses (2130)
  NON_CURRENT_LIAB:   "sys-2200g",  // Non-Current Liabilities group (2200) — child of LIAB_ROOT
  LT_LOANS:           "sys-2210",   // Long-term Loans / Borrowings (2210)
  // Revenue / Income
  REVENUE_GROUP:      "sys-3000",   // Revenue root (3000)
  SALES_REVENUE:      "sys-3100",   // Main sales revenue ledger (3100)
  OTHER_INCOME:       "sys-3200",   // Other income (3200)
  // Expense
  EXPENSES_GROUP:     "sys-4000",   // Operating Expenses root (4000)
  COGS:               "sys-4100",   // Cost of Goods Sold (4100)
  SALARY_GROUP:       "sys-4200",   // Salary & Wages GROUP (4200)
  COMMISSION_GROUP:   "sys-4300",   // Sales Commission GROUP (4300)
  OFFICE_EXP:         "sys-4400",   // Office & Administration (4400)
  UTILITIES:          "sys-4500",   // Utility Bills (4500)
  PURCHASE_EXP:       "sys-4600",   // Purchases (4600)
  // Fallback "General" Ledgers — always-postable catch-alls when no category ledger exists
  GENERAL_SALES_REV:  "sys-3101",   // General Sales Revenue LEDGER (3101) — parent: SALES_REVENUE
  GENERAL_INVENTORY:  "sys-1141",   // General Inventory LEDGER (1141)      — parent: INVENTORY
  // Equity
  EQUITY_GROUP:       "sys-5000",   // Capital & Equity root (5000)
  OWNERS_CAPITAL:     "sys-5100",   // Owner's Capital / Share Capital (5100)
  RETAINED_EARN:      "sys-5200",   // Retained Earnings (5200)
  OPENING_BAL_EQUITY: "sys-5300",   // Opening Balances Equity (5300) — contra account for OB journal entries
} as const;

type SysAccDef = {
  id: string; code: string; name: string;
  head: AccountHead; accountType: AccountKind;
  parentId: string | null; subType: string; description: string;
};

const SYSTEM_ACCOUNTS: SysAccDef[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ASSETS  (IAS 1 — Current / Non-Current split)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.ASSETS_ROOT,        code: "1000", name: "Assets",                    head: "Assets",           accountType: "Group",  parentId: null,                         subType: "Asset",            description: "All assets of the business" },
  // Current Assets
  { id: SYS_ACCS.CURRENT_ASSETS,     code: "1100", name: "Current Assets",             head: "Assets",           accountType: "Group",  parentId: SYS_ACCS.ASSETS_ROOT,         subType: "Current Asset",    description: "Assets expected to be realised within 12 months" },
  { id: SYS_ACCS.CB_GROUP,           code: "1110", name: "Cash & Bank Accounts",       head: "Assets",           accountType: "Group",  parentId: SYS_ACCS.CURRENT_ASSETS,      subType: "Current Asset",    description: "All cash, bank and wallet payment accounts" },
  { id: SYS_ACCS.CASH,               code: "1111", name: "Cash",                       head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.CB_GROUP,            subType: "Cash",             description: "Default cash account — physical cash on premises" },
  { id: SYS_ACCS.AR_GROUP,           code: "1130", name: "Accounts Receivable",        head: "Assets",           accountType: "Group",  parentId: SYS_ACCS.CURRENT_ASSETS,      subType: "Receivable",       description: "Amounts owed by customers & buyers" },
  { id: SYS_ACCS.AR_TRADE,           code: "1131", name: "Trade Receivables",          head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.AR_GROUP,            subType: "Receivable",       description: "Aggregate receivable for credit customers without individual ledgers", openingBalance: 0, paymentType: null, isActive: true } as unknown as SysAccDef,
  { id: SYS_ACCS.INVENTORY,          code: "1140", name: "Inventory / Stock",          head: "Assets",           accountType: "Group",  parentId: SYS_ACCS.CURRENT_ASSETS,      subType: "Inventory",        description: "Stock & inventory value — subsidiary ledgers per product/category" },
  { id: SYS_ACCS.GENERAL_INVENTORY, code: "1141", name: "General Inventory",          head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.INVENTORY,           subType: "Inventory",        description: "Catch-all inventory ledger — used when no per-category inventory ledger exists" },
  // Non-Current Assets
  { id: SYS_ACCS.NON_CURRENT_ASSETS, code: "1200", name: "Non-Current Assets",         head: "Assets",           accountType: "Group",  parentId: SYS_ACCS.ASSETS_ROOT,         subType: "Non-Current Asset", description: "Assets held for long-term use (over 12 months)" },

  // ─────────────────────────────────────────────────────────────────────────────
  // LIABILITIES  (IAS 1 — Current / Non-Current split)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.LIAB_ROOT,          code: "2000", name: "Liabilities",               head: "Liabilities",      accountType: "Group",  parentId: null,                         subType: "Liability",        description: "All obligations of the business" },
  // Current Liabilities
  { id: SYS_ACCS.CURRENT_LIAB,       code: "2100", name: "Current Liabilities",        head: "Liabilities",      accountType: "Group",  parentId: SYS_ACCS.LIAB_ROOT,           subType: "Current Liability", description: "Obligations due within 12 months" },
  { id: SYS_ACCS.AP_GROUP,           code: "2110", name: "Accounts Payable",           head: "Liabilities",      accountType: "Group",  parentId: SYS_ACCS.CURRENT_LIAB,        subType: "Payable",          description: "Amounts owed to suppliers" },
  { id: SYS_ACCS.AP_TRADE,           code: "2111", name: "Trade Payables",             head: "Liabilities",      accountType: "Group",  parentId: SYS_ACCS.AP_GROUP,            subType: "Payable",          description: "Trade payables — subsidiary ledgers per supplier" },
  { id: SYS_ACCS.AP_GENERAL,         code: "2112", name: "General Accounts Payable",   head: "Liabilities",      accountType: "Ledger", parentId: SYS_ACCS.AP_GROUP,            subType: "Payable",          description: "Aggregate payable for suppliers without individual ledgers", openingBalance: 0, paymentType: null, isActive: true } as unknown as SysAccDef,
  { id: SYS_ACCS.VAT_PAYABLE,        code: "2120", name: "VAT Payable",                head: "Liabilities",      accountType: "Ledger", parentId: SYS_ACCS.CURRENT_LIAB,        subType: "Tax Payable",      description: "VAT / tax collected and owed to HMRC" },
  { id: SYS_ACCS.ACCRUED_EXP,        code: "2130", name: "Accrued Expenses",           head: "Liabilities",      accountType: "Group",  parentId: SYS_ACCS.CURRENT_LIAB,        subType: "Accrued",          description: "Expenses incurred but not yet paid — subsidiary ledgers per expense type" },
  // Non-Current Liabilities
  { id: SYS_ACCS.NON_CURRENT_LIAB,   code: "2200", name: "Non-Current Liabilities",    head: "Liabilities",      accountType: "Group",  parentId: SYS_ACCS.LIAB_ROOT,           subType: "Non-Current Liability", description: "Obligations due after 12 months" },

  // ─────────────────────────────────────────────────────────────────────────────
  // REVENUE / INCOME  (codes 3xxx — same as original system)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.REVENUE_GROUP,      code: "3000", name: "Revenue",                    head: "Revenue / Income", accountType: "Group",  parentId: null,                         subType: "Revenue",          description: "Income from business operations" },
  { id: SYS_ACCS.SALES_REVENUE,      code: "3100", name: "Sales Revenue",              head: "Revenue / Income", accountType: "Group",  parentId: SYS_ACCS.REVENUE_GROUP,       subType: "Sales",            description: "Revenue from product and service sales — subsidiary ledgers per product" },
  { id: SYS_ACCS.GENERAL_SALES_REV, code: "3101", name: "General Sales Revenue",      head: "Revenue / Income", accountType: "Ledger", parentId: SYS_ACCS.SALES_REVENUE,       subType: "Sales",            description: "Catch-all revenue ledger — used when no per-category revenue ledger exists" },
  { id: SYS_ACCS.OTHER_INCOME,       code: "3200", name: "Other Income",               head: "Revenue / Income", accountType: "Group",  parentId: SYS_ACCS.REVENUE_GROUP,       subType: "Other Income",     description: "Miscellaneous or non-operating income — subsidiary ledgers per income type" },

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPENSES  (codes 4xxx — same as original system)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.EXPENSES_GROUP,     code: "4000", name: "Operating Expenses",         head: "Expense",          accountType: "Group",  parentId: null,                         subType: "Expense",          description: "Day-to-day business expenditure" },
  { id: SYS_ACCS.COGS,               code: "4100", name: "Cost of Goods Sold",         head: "Expense",          accountType: "Ledger", parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "COGS",             description: "Direct cost of goods or services sold" },
  { id: SYS_ACCS.SALARY_GROUP,       code: "4200", name: "Salary & Wages",             head: "Expense",          accountType: "Group",  parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "Payroll",          description: "Employee salaries and wages" },
  { id: SYS_ACCS.COMMISSION_GROUP,   code: "4300", name: "Sales Commission",           head: "Expense",          accountType: "Group",  parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "Commission",       description: "Commission paid to sales agents" },
  { id: SYS_ACCS.PURCHASE_EXP,       code: "4600", name: "Purchases",                  head: "Expense",          accountType: "Group",  parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "Purchases",        description: "Goods purchased for resale or use — subsidiary ledgers per product" },

  // ─────────────────────────────────────────────────────────────────────────────
  // EQUITY  (codes 5xxx — same as original system)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.EQUITY_GROUP,       code: "5000", name: "Capital & Equity",           head: "Equity",           accountType: "Group",  parentId: null,                         subType: "Equity",           description: "Owner's equity in the business" },
  { id: SYS_ACCS.OWNERS_CAPITAL,     code: "5100", name: "Owner's Capital",            head: "Equity",           accountType: "Group",  parentId: SYS_ACCS.EQUITY_GROUP,        subType: "Capital",          description: "Funds invested by owners / shareholders (subsidiary ledgers per owner)" },
  { id: SYS_ACCS.RETAINED_EARN,      code: "5200", name: "Retained Earnings",          head: "Equity",           accountType: "Ledger", parentId: SYS_ACCS.EQUITY_GROUP,        subType: "Retained",         description: "Accumulated profits retained in the business" },
  { id: SYS_ACCS.OPENING_BAL_EQUITY, code: "5300", name: "Opening Balances",           head: "Equity",           accountType: "Ledger", parentId: SYS_ACCS.EQUITY_GROUP,        subType: "Opening Balance",  description: "Contra account used for customer/supplier/staff opening balance journal entries" },
];

// ── COA one-time migration tracking ──────────────────────────────────────────
// Each structural migration is stamped here after it completes, keyed per
// tenant. Once recorded, the migration never re-runs regardless of how many
// times the app starts or how many logins occur.
// Dynamic/data-driven maintenance (category ledger sync, backfills, etc.) is
// intentionally NOT tracked here — those always run so they stay current.
const COA_MIGRATIONS_KEY = "coa:migrations";

function _getCoaMigrations(): Set<string> {
  try {
    const raw = _lsGet(tenantKey(COA_MIGRATIONS_KEY));
    if (!raw) return new Set<string>();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set<string>(arr as string[]) : new Set<string>();
  } catch { return new Set<string>(); }
}

function _saveCoaMigrations(done: Set<string>): void {
  const sk = tenantKey(COA_MIGRATIONS_KEY);
  _lsSet(sk, [...done]);
  _apiWrite(sk, [...done]);
}

/**
 * Seeds system (default) accounts into the COA if they don't already exist,
 * applies one-time structural migrations, then keeps dynamic ledgers in sync.
 *
 * Call pattern:
 *  - Initial account seeding: ALWAYS runs — idempotent (skips existing IDs).
 *    Ensures new SYSTEM_ACCOUNTS entries added in future code releases are
 *    automatically picked up by every tenant.
 *  - Structural migrations (m02–m09): each runs EXACTLY ONCE per tenant,
 *    tracked in COA_MIGRATIONS_KEY. Safe to call on every login/startup.
 *  - Dynamic maintenance (category/contact ledger sync, backfills, settings):
 *    ALWAYS runs — these react to live product/customer data changes and are
 *    already idempotent (skip work when nothing has changed).
 */
export function seedDefaultCoaAccounts(): void {
  const done = _getCoaMigrations();
  let migrationsChanged = false;

  const existing = (() => {
    try {
      const raw = _lsGet(tenantKey(COA_KEY));
      return raw ? (JSON.parse(raw) as Account[]) : [];
    } catch { return []; }
  })();

  const existingIds = new Set(existing.map(a => a.id));
  const now = new Date().toISOString();

  // ── Always: add any missing system accounts ──────────────────────────────────
  // Runs every call but skips accounts that already exist. This ensures new
  // SYSTEM_ACCOUNTS entries in future releases reach all existing tenants.
  const toAdd: Account[] = [];
  for (const def of SYSTEM_ACCOUNTS) {
    if (existingIds.has(def.id)) continue;
    toAdd.push({
      id:             def.id,
      code:           def.code,
      name:           def.name,
      head:           def.head,
      accountType:    def.accountType,
      parentId:       def.parentId,
      subType:        def.subType,
      description:    def.description,
      openingBalance: 0,
      paymentType:    null,
      isActive:       true,
      createdAt:      now,
      updatedAt:      now,
    });
  }

  let workingAccounts = [...existing, ...toAdd];
  let staticChanged = toAdd.length > 0;

  // ── m02: IFRS-compliant hierarchy restructure ────────────────────────────────
  // Detect old structure: CURRENT_ASSETS still has parentId = null.
  if (!done.has("m02")) {
    const needsMigration = workingAccounts.some(a => a.id === SYS_ACCS.CURRENT_ASSETS && a.parentId === null);
    if (needsMigration) {
      const m02: Array<{ id: string; updates: Partial<Account> }> = [
        { id: SYS_ACCS.CURRENT_ASSETS, updates: { parentId: SYS_ACCS.ASSETS_ROOT, code: "1100" } },
        { id: SYS_ACCS.AR_GROUP,       updates: { code: "1130" } },
        { id: SYS_ACCS.CASH,           updates: { code: "1110" } },
        { id: SYS_ACCS.INVENTORY,      updates: { code: "1140" } },
        { id: SYS_ACCS.CURRENT_LIAB,   updates: { parentId: SYS_ACCS.LIAB_ROOT, code: "2100" } },
        { id: SYS_ACCS.AP_GROUP,       updates: { code: "2110" } },
        { id: SYS_ACCS.AP_TRADE,       updates: { code: "2111" } },
        { id: SYS_ACCS.VAT_PAYABLE,    updates: { code: "2120" } },
      ];
      workingAccounts = workingAccounts.map(acc => {
        const mg = m02.find(x => x.id === acc.id);
        return mg ? { ...acc, ...mg.updates, updatedAt: now } : acc;
      });
      staticChanged = true;
    }
    done.add("m02"); migrationsChanged = true;
  }

  // ── m03: Rename Cash account "Cash in Hand" → "Cash" ────────────────────────
  if (!done.has("m03")) {
    const idx = workingAccounts.findIndex(a => a.id === SYS_ACCS.CASH && a.name === "Cash in Hand");
    if (idx !== -1) {
      workingAccounts[idx] = { ...workingAccounts[idx], name: "Cash", description: "Default cash account — physical cash on premises", updatedAt: now };
      staticChanged = true;
    }
    done.add("m03"); migrationsChanged = true;
  }

  // ── m04: Re-parent Cash from CURRENT_ASSETS → CB_GROUP ──────────────────────
  if (!done.has("m04")) {
    const idx = workingAccounts.findIndex(a => a.id === SYS_ACCS.CASH && a.parentId === SYS_ACCS.CURRENT_ASSETS);
    if (idx !== -1) {
      workingAccounts[idx] = { ...workingAccounts[idx], parentId: SYS_ACCS.CB_GROUP, code: "1111", updatedAt: now };
      staticChanged = true;
    }
    done.add("m04"); migrationsChanged = true;
  }

  // ── m05: Remove default-seeded accounts now managed directly by the tenant ───
  if (!done.has("m05")) {
    const REMOVED_DEFAULTS = new Set<string>([
      SYS_ACCS.BANK,       // added via Payment Accounts instead
      SYS_ACCS.PPE,        // tenant-created
      SYS_ACCS.ACCUM_DEPR, // tenant-created
      SYS_ACCS.LT_LOANS,   // tenant-created as needed
      SYS_ACCS.OFFICE_EXP, // tenant-created as needed
      SYS_ACCS.UTILITIES,  // tenant-created as needed
    ]);
    const before = workingAccounts.length;
    workingAccounts = workingAccounts.filter(a => !REMOVED_DEFAULTS.has(a.id));
    if (workingAccounts.length !== before) staticChanged = true;
    done.add("m05"); migrationsChanged = true;
  }

  // ── m06: Migrate account types Ledger → Group (7 accounts) ──────────────────
  if (!done.has("m06")) {
    const typeChanges: Array<{ id: string; description: string }> = [
      { id: SYS_ACCS.OWNERS_CAPITAL, description: "Funds invested by owners / shareholders (subsidiary ledgers per owner)" },
      { id: SYS_ACCS.AP_TRADE,       description: "Trade payables — subsidiary ledgers per supplier" },
      { id: SYS_ACCS.INVENTORY,      description: "Stock & inventory value — subsidiary ledgers per product/category" },
      { id: SYS_ACCS.ACCRUED_EXP,    description: "Expenses incurred but not yet paid — subsidiary ledgers per expense type" },
      { id: SYS_ACCS.SALES_REVENUE,  description: "Revenue from product and service sales — subsidiary ledgers per product" },
      { id: SYS_ACCS.OTHER_INCOME,   description: "Miscellaneous or non-operating income — subsidiary ledgers per income type" },
      { id: SYS_ACCS.PURCHASE_EXP,   description: "Goods purchased for resale or use — subsidiary ledgers per product" },
    ];
    let anyChanged = false;
    for (const tc of typeChanges) {
      const idx = workingAccounts.findIndex(a => a.id === tc.id && a.accountType === "Ledger");
      if (idx !== -1) {
        workingAccounts[idx] = { ...workingAccounts[idx], accountType: "Group", description: tc.description, updatedAt: now };
        anyChanged = true;
      }
    }
    if (anyChanged) staticChanged = true;
    done.add("m06"); migrationsChanged = true;
  }

  // ── m07: Seed default Cash payment account ───────────────────────────────────
  if (!done.has("m07")) {
    const existingPAs = getStored<{ id: string }>(PAYMENT_ACCOUNTS_KEY);
    if (!existingPAs.some(p => p.id === SYS_PA_CASH)) {
      const nowPA = new Date().toISOString();
      const defaultCash: PaymentAccount = {
        id:              SYS_PA_CASH,
        accountTitle:    "Cash",
        bankName:        "",
        paymentMethod:   "Cash",
        iban:            "",
        description:     "Default cash account — physical cash on premises",
        isActive:        true,
        ledgerAccountId: SYS_ACCS.CASH,
        createdAt:       nowPA,
        updatedAt:       nowPA,
      };
      setStored(PAYMENT_ACCOUNTS_KEY, [defaultCash, ...existingPAs]);
    }
    done.add("m07"); migrationsChanged = true;
  }

  // ── m08: Rename Cash payment account "Cash in Hand" → "Cash" ─────────────────
  if (!done.has("m08")) {
    const cashPA = getStored<PaymentAccount>(PAYMENT_ACCOUNTS_KEY).find(p => p.id === SYS_PA_CASH);
    if (cashPA && cashPA.accountTitle === "Cash in Hand") {
      const patched = getStored<PaymentAccount>(PAYMENT_ACCOUNTS_KEY).map(p =>
        p.id === SYS_PA_CASH
          ? { ...p, accountTitle: "Cash", description: "Default cash account — physical cash on premises", updatedAt: new Date().toISOString() }
          : p
      );
      setStored(PAYMENT_ACCOUNTS_KEY, patched);
    }
    done.add("m08"); migrationsChanged = true;
  }

  // ── m09: Remove legacy per-product ledgers ───────────────────────────────────
  // sr-prod-*, pur-prod-*, inv-prod-* superseded by per-category ledgers.
  if (!done.has("m09")) {
    const LEGACY_PROD_PREFIXES = ["sr-prod-", "pur-prod-", "inv-prod-"];
    const before = workingAccounts.length;
    workingAccounts = workingAccounts.filter(
      a => !LEGACY_PROD_PREFIXES.some(pfx => a.id.startsWith(pfx))
    );
    const removed = before - workingAccounts.length;
    if (removed > 0) {
      console.info(`[COA] m09: removed ${removed} legacy per-product ledger(s)`);
      staticChanged = true;
    }
    done.add("m09"); migrationsChanged = true;
  }

  // ── Persist static migration results ────────────────────────────────────────
  if (staticChanged) {
    const sk = tenantKey(COA_KEY);
    _lsSet(sk, workingAccounts);
    _apiWrite(sk, workingAccounts);
  }
  if (migrationsChanged) {
    _saveCoaMigrations(done);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DYNAMIC MAINTENANCE — always runs, reacts to live product/customer data.
  // Safe to run every login: each block is idempotent and skips work when the
  // data is already up-to-date.
  // ════════════════════════════════════════════════════════════════════════════

  // Re-read after the static saves so dynamic work sees the latest COA state.
  const latestAccounts = getAccounts();
  const existingWorkingIds = new Set(latestAccounts.map(a => a.id));
  let dynamicAccounts = [...latestAccounts];
  let dynamicChanged = false;

  // ── Sync per-category COA ledgers ────────────────────────────────────────────
  // Each unique product category gets three shared ledgers:
  //   Category | Revenue   → Sales Revenue (3100)
  //   Category | Purchase  → Purchases (4600)
  //   Category | Inventory → Inventory / Stock (1140)
  const products = getProducts();

  // Collect unique categories from all products
  const uniqueCategories = [...new Set(products.map(p => p.category?.trim() || "Uncategorised"))];

  const srChildren  = dynamicAccounts.filter(a => a.parentId === SYS_ACCS.SALES_REVENUE);
  const purChildren = dynamicAccounts.filter(a => a.parentId === SYS_ACCS.PURCHASE_EXP);
  const invChildren = dynamicAccounts.filter(a => a.parentId === SYS_ACCS.INVENTORY);

  let nextSrCode  = srChildren.reduce((max, a)  => { const n = parseInt(a.code ?? "0", 10); return n > max ? n : max; }, 3100) + 1;
  let nextPurCode = purChildren.reduce((max, a) => { const n = parseInt(a.code ?? "0", 10); return n > max ? n : max; }, 4600) + 1;
  let nextInvCode = invChildren.reduce((max, a) => { const n = parseInt(a.code ?? "0", 10); return n > max ? n : max; }, 1140) + 1;

  for (const cat of uniqueCategories) {
    const slug   = _catSlug(cat);
    const srId   = `sr-cat-${slug}`;
    const purId  = `pur-cat-${slug}`;
    const invId  = `inv-cat-${slug}`;

    if (!existingWorkingIds.has(srId)) {
      dynamicAccounts.push({
        id: srId, code: String(nextSrCode++), name: `${cat} | Revenue`,
        head: "Revenue / Income", accountType: "Ledger",
        parentId: SYS_ACCS.SALES_REVENUE, subType: "Sales",
        description: `Revenue account for the ${cat} category`,
        openingBalance: 0, paymentType: null, isActive: true, createdAt: now, updatedAt: now,
      });
      dynamicChanged = true;
    }

    if (!existingWorkingIds.has(purId)) {
      dynamicAccounts.push({
        id: purId, code: String(nextPurCode++), name: `${cat} | Purchase`,
        head: "Expense", accountType: "Ledger",
        parentId: SYS_ACCS.PURCHASE_EXP, subType: "Purchases",
        description: `Purchase account for the ${cat} category`,
        openingBalance: 0, paymentType: null, isActive: true, createdAt: now, updatedAt: now,
      });
      dynamicChanged = true;
    }

    if (!existingWorkingIds.has(invId)) {
      dynamicAccounts.push({
        id: invId, code: String(nextInvCode++), name: `${cat} | Inventory`,
        head: "Assets", accountType: "Ledger",
        parentId: SYS_ACCS.INVENTORY, subType: "Inventory",
        description: `Inventory account for the ${cat} category`,
        openingBalance: 0, paymentType: null, isActive: true, createdAt: now, updatedAt: now,
      });
      dynamicChanged = true;
    }
  }

  // ── Orphaned category ledger cleanup ──────────────────────────────────────
  // Remove sr-cat-*, pur-cat-*, inv-cat-* entries whose category no longer
  // exists in any product.
  // NOTE: sys-3101 (General Sales Revenue) and sys-1141 (General Inventory) are
  //       NOT prefixed with these patterns and are always preserved.
  const activeCatSlugs = new Set(uniqueCategories.map(c => _catSlug(c)));
  const CAT_PREFIXES = ["sr-cat-", "pur-cat-", "inv-cat-"];
  const PROTECTED_IDS = new Set<string>([SYS_ACCS.GENERAL_SALES_REV, SYS_ACCS.GENERAL_INVENTORY]);
  const beforeCatClean = dynamicAccounts.length;
  dynamicAccounts = dynamicAccounts.filter(a => {
    if (PROTECTED_IDS.has(a.id)) return true;
    const pfx = CAT_PREFIXES.find(p => a.id.startsWith(p));
    if (!pfx) return true;
    const slug = a.id.slice(pfx.length);
    return activeCatSlugs.has(slug);
  });
  const orphansRemoved = beforeCatClean - dynamicAccounts.length;
  if (orphansRemoved > 0) {
    console.info(`[COA] Removed ${orphansRemoved} orphaned category ledger(s) — no products use those categories`);
    dynamicChanged = true;
  }

  // ── Orphaned contact & commission ledger cleanup ─────────────────────────────
  // Ledger accounts under AP_TRADE, AR_GROUP, or COMMISSION_GROUP are auto-created
  // per-contact (customer/supplier) or per-agent. If the referenced entity no longer
  // exists in THIS tenant, remove the orphaned ledger.
  // This also heals contamination: if accounts from another tenant's data made it
  // into this tenant's COA via a seeding bug, they'll be cleaned up here because
  // the agents/customers they reference don't exist in this tenant.
  const allCustomers = getStored<{ ledgerAccountId?: string }>(CUSTOMERS_KEY);
  const contactLedgerIds = new Set(allCustomers.map(c => c.ledgerAccountId).filter(Boolean) as string[]);

  const allAgents = getStored<{ ledgerAccountId?: string }>(SALES_AGENTS_KEY);
  const agentLedgerIds = new Set(allAgents.map(a => a.ledgerAccountId).filter(Boolean) as string[]);

  const CONTACT_PARENT_IDS = new Set<string>([SYS_ACCS.AP_TRADE, SYS_ACCS.AR_GROUP]);
  const beforeContactClean = dynamicAccounts.length;
  dynamicAccounts = dynamicAccounts.filter(a => {
    if (a.accountType !== "Ledger") return true;
    const parentId = a.parentId || "";
    // Contact (AR/AP) ledgers — keep only if a customer/supplier still references it
    if (CONTACT_PARENT_IDS.has(parentId)) return contactLedgerIds.has(a.id);
    // Commission ledgers — keep only if a sales agent in THIS tenant still references it
    if (parentId === SYS_ACCS.COMMISSION_GROUP) return agentLedgerIds.has(a.id);
    return true;
  });
  const contactOrphansRemoved = beforeContactClean - dynamicAccounts.length;
  if (contactOrphansRemoved > 0) {
    console.info(`[COA] Removed ${contactOrphansRemoved} orphaned contact/commission ledger(s)`);
    dynamicChanged = true;
  }

  if (dynamicChanged) {
    const sk = tenantKey(COA_KEY);
    _lsSet(sk, dynamicAccounts);
    _apiWrite(sk, dynamicAccounts);
  }

  // ── Always: backfill customer AR subsidiary ledgers ──────────────────────────
  const customers = getStored<{ id: string; name: string; company?: string; ledgerAccountId?: string }>(CUSTOMERS_KEY);
  let customersUpdated = false;
  const customersPatched = customers.map(c => {
    if (c.ledgerAccountId) return c;
    const lid = createSubsidiaryLedger({
      parentId:    SYS_ACCS.AR_GROUP,
      parentCode:  "1130",
      name:        c.name + (c.company ? ` (${c.company})` : ""),
      head:        "Assets",
      subType:     "Receivable",
      description: `Accounts receivable ledger for ${c.name}`,
    });
    customersUpdated = true;
    return { ...c, ledgerAccountId: lid };
  });
  if (customersUpdated) {
    setStored(CUSTOMERS_KEY, customersPatched);
  }

  // ── Always: backfill COA ledgers for payment accounts missing one ────────────
  const allPAs = getStored<PaymentAccount>(PAYMENT_ACCOUNTS_KEY);
  const existingCoaIds = new Set(getAccounts().map(a => a.id));
  const needsBackfill = allPAs.some(
    pa => pa.id !== SYS_PA_CASH && (!pa.ledgerAccountId || !existingCoaIds.has(pa.ledgerAccountId))
  );
  if (needsBackfill) _ensureCBGroup();
  let paUpdated = false;
  const pAsPatched = allPAs.map(pa => {
    // Skip only when the PA already has a ledgerAccountId AND that COA account actually exists
    if (pa.ledgerAccountId && existingCoaIds.has(pa.ledgerAccountId)) return pa;
    if (pa.id === SYS_PA_CASH) return pa;      // default cash uses sys-1200 directly, already set above
    const { name, subType } = _coaNameFromPA(pa);
    const lid = createAccount({
      code:           "",
      name,
      head:           "Assets",
      subType,
      description:    pa.description || `Payment account — ${pa.paymentMethod}`,
      parentId:       SYS_ACCS.CB_GROUP,
      accountType:    "Ledger",
      openingBalance: 0,
      paymentType:    "Debit",
      isActive:       pa.isActive,
    }).id;
    paUpdated = true;
    return { ...pa, ledgerAccountId: lid };
  });
  if (paUpdated) {
    setStored(PAYMENT_ACCOUNTS_KEY, pAsPatched);
  }

  // Shareholders → Owner's Capital Group
  const shareholders = getStored<{ id: string; name: string; ledgerAccountId?: string }>(SHAREHOLDERS_KEY);
  let shareholdersUpdated = false;
  const shareholdersPatched = shareholders.map(sh => {
    if (sh.ledgerAccountId) return sh;
    const lid = createSubsidiaryLedger({
      parentId:    SYS_ACCS.OWNERS_CAPITAL,
      parentCode:  "5100",
      name:        sh.name,
      head:        "Equity",
      subType:     "Capital",
      description: `Capital account for ${sh.name}`,
    });
    shareholdersUpdated = true;
    return { ...sh, ledgerAccountId: lid };
  });
  if (shareholdersUpdated) {
    setStored(SHAREHOLDERS_KEY, shareholdersPatched);
  }

  // NOTE: Automatic "opening-balance" backfill was removed.
  // Stock ledger entries are created only by real transactions (PO receipts, sales, etc.)
  // or via addManualLedgerEntry(). Automatic backfill caused double-counting when the
  // stock qty was set but the corresponding ledger entry had not yet been synced to the server.

  // ── Auto-populate accounting settings (only fills missing mappings) ────────
  const s = getSettings();
  const mappingUpdates: Partial<AppSettings> = {};
  if (!s.accSalesRevenue) mappingUpdates.accSalesRevenue = SYS_ACCS.SALES_REVENUE;
  if (!s.accCash)         mappingUpdates.accCash         = SYS_ACCS.CASH;
  if (!s.accReceivable)   mappingUpdates.accReceivable   = SYS_ACCS.AR_GROUP;
  if (!s.accVatPayable)   mappingUpdates.accVatPayable   = SYS_ACCS.VAT_PAYABLE;
  if (!s.accCogs)         mappingUpdates.accCogs         = SYS_ACCS.COGS;
  if (!s.accInventory)    mappingUpdates.accInventory    = SYS_ACCS.INVENTORY;
  // sys-1210 "Bank Account" removed — clear accBank if it still points to it
  if (s.accBank === SYS_ACCS.BANK) mappingUpdates.accBank = "";
  // sys-1101 "Trade Receivables" removed — redirect accReceivable to AR_GROUP
  if (s.accReceivable === SYS_ACCS.AR_TRADE) {
    mappingUpdates.accReceivable = SYS_ACCS.AR_GROUP;
  }
  // AP_TRADE is now a Group — clear accPurchasePayable if it still points to it
  // (the JE now uses supplier-specific subsidiary ledgers directly)
  if (s.accPurchasePayable === SYS_ACCS.AP_TRADE) {
    mappingUpdates.accPurchasePayable = "";
  }
  if (Object.keys(mappingUpdates).length > 0) {
    saveSettings({ ...s, ...mappingUpdates });
  }
}

/**
 * Reconcile the Chart of Accounts and accounting settings to ensure all system
 * accounts are present, hierarchy is correct, and settings mappings are wired.
 * Returns a summary of what was fixed for display in the UI.
 */
export function reconcileAccountingData(): {
  accountsBefore: number;
  accountsAfter:  number;
  accountsAdded:  number;
  settingsWired:  boolean;
} {
  const before  = getAccounts().length;
  const sBefore = getSettings();
  const hadMissingMappings =
    !sBefore.accSalesRevenue || !sBefore.accCash || !sBefore.accBank ||
    !sBefore.accReceivable   || !sBefore.accVatPayable;

  seedDefaultCoaAccounts();

  const after = getAccounts().length;
  return {
    accountsBefore: before,
    accountsAfter:  after,
    accountsAdded:  Math.max(0, after - before),
    settingsWired:  hadMissingMappings,
  };
}

/**
 * Seed a brand-new tenant's Chart of Accounts from the superadmin (system) template.
 *
 * Strategy:
 *   1. Read the superadmin's COA — it is stored under the un-prefixed key (no tenant namespace)
 *      and represents the canonical system-wide account structure.
 *   2. If the superadmin has no COA yet, fall back to seeding from the built-in SYSTEM_ACCOUNTS.
 *   3. Write the accounts to the new tenant's namespace with opening balances reset to 0
 *      (new tenant starts clean — no inherited balances).
 *   4. Does NOT overwrite if the tenant already has accounts (idempotent).
 */
export function seedTenantCOA(tenantId: string): void {
  const tenantCoaKey = `t:${tenantId}:${COA_KEY}`;

  // Guard: don't overwrite if the tenant already has accounts
  try {
    const existing = _lsGet(tenantCoaKey);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed) && parsed.length > 0) return;
    }
  } catch { /* continue */ }

  // Read the superadmin's COA (no prefix = system-level key)
  let templateAccounts: Account[] = [];
  try {
    const raw = _lsGet(COA_KEY);
    templateAccounts = raw ? (JSON.parse(raw) as Account[]) : [];
  } catch { templateAccounts = []; }

  if (templateAccounts.length === 0) {
    // Superadmin hasn't built a COA yet — seed from built-in system defaults
    // Temporarily switch context so seedDefaultCoaAccounts writes to the new tenant
    const prev = _activeTenantId;
    _activeTenantId = tenantId;
    try { seedDefaultCoaAccounts(); } finally { _activeTenantId = prev; }
    return;
  }

  // Strip party-specific subsidiary ledger accounts before copying.
  // Shareholder capital (5100-NNN), customer AR (1130-NNN) and supplier AP (2111-NNN)
  // sub-ledgers belong to the originating tenant and must never be carried over.
  const partyParentIds = new Set([
    SYS_ACCS.AR_GROUP,       // sys-1100  — customer receivable sub-ledgers
    SYS_ACCS.AP_TRADE,       // sys-2101  — supplier payable sub-ledgers
    SYS_ACCS.OWNERS_CAPITAL, // sys-5100  — shareholder capital sub-ledgers
  ]);
  const filteredTemplate = templateAccounts.filter(
    a => !(a.accountType === "Ledger" && a.parentId && partyParentIds.has(a.parentId)),
  );

  // Copy the template: preserve IDs and hierarchy, but zero-out opening balances
  const now = new Date().toISOString();
  const tenantAccounts: Account[] = filteredTemplate.map(a => ({
    ...a,
    openingBalance: 0,   // new tenant starts with clean balances
    createdAt: now,
    updatedAt: now,
  }));

  _lsSet(tenantCoaKey, tenantAccounts);
  _apiWrite(tenantCoaKey, tenantAccounts);
}

/**
 * Generates the next sequential sub-code for subsidiary ledgers under a parent.
 * Only counts children that already use the "{parentCode}-NNN" pattern so that
 * fixed-code system accounts (e.g. 1101 under parent 1100) do not skew the numbering.
 * E.g.  parent code "1100" → subsidiary codes "1100-001", "1100-002", …
 */
function nextSubCode(parentCode: string, existing: Account[], parentId: string): string {
  const prefix = `${parentCode}-`;
  const children = existing.filter(a => a.parentId === parentId && a.code.startsWith(prefix));
  const max = children
    .map(a => parseInt(a.code.slice(prefix.length)) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/**
 * Creates a subsidiary Ledger account under a system parent group.
 * Returns the new account ID. Safe to call during entity creation.
 */
function createSubsidiaryLedger(params: {
  parentId: string; parentCode: string;
  name: string; head: AccountHead; subType: string; description: string;
}): string {
  const existing = (() => {
    try {
      const raw = _lsGet(tenantKey(COA_KEY));
      return raw ? (JSON.parse(raw) as Account[]) : [];
    } catch { return []; }
  })();
  const code = nextSubCode(params.parentCode, existing, params.parentId);
  const now = new Date().toISOString();
  const account: Account = {
    id:             crypto.randomUUID(),
    code,
    name:           params.name,
    head:           params.head,
    accountType:    "Ledger",
    parentId:       params.parentId,
    subType:        params.subType,
    description:    params.description,
    openingBalance: 0,
    paymentType:    null,
    isActive:       true,
    createdAt:      now,
    updatedAt:      now,
  };
  const updated = [...existing, account];
  const sk = tenantKey(COA_KEY);
  _lsSet(sk, updated);
  _apiWrite(sk, updated);
  return account.id;
}

// IDs of the original seed accounts — used to wipe them on first load after this change
const LEGACY_SEED_IDS = new Set([
  "coa-1001","coa-1002","coa-1003","coa-1010","coa-1020","coa-1030",
  "coa-1100","coa-1101","coa-1102",
  "coa-2001","coa-2010","coa-2020","coa-2030","coa-2100","coa-2101",
  "coa-3001","coa-3002","coa-3010","coa-3020",
  "coa-4001","coa-4010","coa-4020","coa-4030","coa-4040","coa-4050",
  "coa-4060","coa-4070","coa-4080","coa-4090","coa-4100",
  "coa-5001","coa-5002","coa-5003",
]);

export function getAccounts(): Account[] {
  try {
    const raw = _lsGet(tenantKey(COA_KEY));
    if (raw) {
      const parsed: Account[] = JSON.parse(raw);
      // One-time migration: wipe legacy seed accounts, keep any user-added ones
      const userAccounts = parsed.filter(a => !LEGACY_SEED_IDS.has(a.id));
      if (userAccounts.length !== parsed.length) {
        _lsSet(tenantKey(COA_KEY), userAccounts);
        return userAccounts;
      }
      // Normalise fields added after initial release
      return parsed.map(a => ({
        ...a,
        parentId: a.parentId ?? null,
        accountType: a.accountType ?? "Group",
        openingBalance: a.openingBalance ?? 0,
        paymentType: a.paymentType ?? null,
      }));
    }
  } catch { /* ignore */ }
  // Fresh install — start with empty chart
  const sk = tenantKey(COA_KEY);
  _lsSet(sk, []);
  _apiWrite(sk, []);
  return [];
}

function _saveAccounts(accounts: Account[]): void {
  const sk = tenantKey(COA_KEY);
  _lsCache(sk, accounts);
  _apiWrite(sk, accounts);
}

export function createAccount(data: Omit<Account, "id" | "createdAt" | "updatedAt">): Account {
  const account: Account = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  _saveAccounts([...getAccounts(), account]);
  return account;
}

export function updateAccount(id: string, updates: Partial<Omit<Account, "id" | "createdAt">>): Account {
  const accounts = getAccounts().map(a => a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a);
  _saveAccounts(accounts);
  return accounts.find(a => a.id === id)!;
}

export function deleteAccount(id: string): void {
  const all = getAccounts();

  // Guard 1 — has child accounts
  if (all.some(a => a.parentId === id)) {
    throw new Error("This account has child accounts. Remove or reassign them first.");
  }

  // Guard 2 — has journal entry lines posted to it
  const entries = getJournalEntries();
  if (entries.some(je => je.lines.some(l => l.ledgerId === id))) {
    throw new Error("This account has journal entries posted to it and cannot be deleted.");
  }

  _saveAccounts(all.filter(a => a.id !== id));
}

// ─── Journal Entry ────────────────────────────────────────────────────────────

export type JournalEntryLine = {
  id: string;
  ledgerId: string;
  narration: string;
  debit: number;
  credit: number;
};

export type JournalEntry = {
  id: string;
  date: string;
  reference: string;
  description: string;
  lines: JournalEntryLine[];
  status: "draft" | "posted";
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  createdAt: string;
  updatedAt: string;
};

const JE_KEY = "admin-journal-entries";

export function getJournalEntries(): JournalEntry[] {
  try {
    const raw = _lsGet(tenantKey(JE_KEY));
    if (raw) return JSON.parse(raw) as JournalEntry[];
  } catch { /* ignore */ }
  return [];
}

function _saveJournalEntries(entries: JournalEntry[]): void {
  // setStored: updates _memRaw immediately + fires _apiWrite to persist to server.
  setStored(JE_KEY, entries);
}

export function createJournalEntry(data: Omit<JournalEntry, "id" | "createdAt" | "updatedAt">): JournalEntry {
  const entry: JournalEntry = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  _saveJournalEntries([...getJournalEntries(), entry]);
  return entry;
}

export function updateJournalEntry(id: string, updates: Partial<Omit<JournalEntry, "id" | "createdAt">>): JournalEntry {
  const entries = getJournalEntries().map(e => e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e);
  _saveJournalEntries(entries);
  return entries.find(e => e.id === id)!;
}

export function deleteJournalEntry(id: string): void {
  // Find any voucher that references this JE and reset it back to draft
  const linked = getRPVouchers().find(v => v.journalEntryId === id);
  if (linked && linked.status === "posted") {
    // Reverse invoice payment before unposting
    if (linked.linkedInvoiceId) {
      _reverseInvoicePayment(linked.linkedInvoiceId, linked.totalAmount, linked.voucherNumber);
    }
    if (linked.linkedInvoiceIds?.length) {
      for (const line of linked.lines) {
        if (line.invoiceId) {
          _reverseInvoicePayment(line.invoiceId, line.amount, linked.voucherNumber);
        }
      }
    }
    // Reset voucher to draft
    _saveRPVouchers(getRPVouchers().map(v =>
      v.id === linked.id
        ? { ...v, status: "draft", journalEntryId: undefined, updatedAt: new Date().toISOString() }
        : v
    ));
  }
  _saveJournalEntries(getJournalEntries().filter(e => e.id !== id));
}

// ─── Sub-ledger lookup ────────────────────────────────────────────────────────

/**
 * Searches the Chart of Accounts for a per-party (customer / supplier) sub-ledger
 * that is a direct child of the given parent group and whose name contains the
 * party name (case-insensitive, partial match).
 *
 * This is used so that individual AR/AP ledgers (e.g. "1130-004 — Karen Bhatt")
 * are used in JEs instead of the blanket group account, keeping subsidiary
 * ledgers correctly populated.
 *
 * Returns the ledger account id, or null when no specific ledger is found.
 */
/**
 * Resolves a COA account ID to a postable Ledger account.
 * If the account is already a Ledger, returns its ID unchanged.
 * If it's a Group, returns the first active direct-child Ledger.
 * Returns null when no postable Ledger can be found.
 */
export function resolveToLedger(accountId: string | undefined): string | null {
  if (!accountId) return null;
  const accounts = getAccounts();
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) return null;
  if (acc.accountType === "Ledger") return acc.id;
  const child = accounts.find(
    a => a.parentId === accountId && a.accountType === "Ledger" && (a.isActive !== false),
  );
  return child?.id ?? null;
}

/** Returns all active Ledger accounts that live under the Cash & Bank Accounts group (CB_GROUP).
 *  These are the accounts shown as payment-method tiles on the POS payment modal. */
export function getCashBankLedgers(): Account[] {
  const accounts = getAccounts();
  // Collect all descendant IDs of CB_GROUP (handles nested groups)
  const cbDescendants = new Set<string>();
  const addDescendants = (parentId: string) => {
    for (const a of accounts) {
      if (a.parentId === parentId && !cbDescendants.has(a.id)) {
        cbDescendants.add(a.id);
        addDescendants(a.id);
      }
    }
  };
  addDescendants(SYS_ACCS.CB_GROUP);
  // Also include direct children of CB_GROUP and direct parent (self)
  cbDescendants.add(SYS_ACCS.CB_GROUP);
  return accounts.filter(a =>
    a.accountType === "Ledger" &&
    a.isActive !== false &&
    (cbDescendants.has(a.id) || a.parentId === SYS_ACCS.CB_GROUP)
  );
}

export function findSubLedgerForParty(partyName: string, parentGroupId: string): string | null {
  if (!partyName) return null;
  const lower = partyName.toLowerCase();

  // ── 1. CRM-first lookup ──────────────────────────────────────────────────
  // Find the contact by exact name (or "Name (Company)" format) and use
  // their assigned ledgerAccountId — this works regardless of which COA
  // group the account sits under (AR, AP, or even a custom group).
  const contacts = getCustomers();
  const contact = contacts.find(c =>
    (c.name || "").toLowerCase() === lower ||
    (c.name + (c.company ? ` (${c.company})` : "")).toLowerCase() === lower
  );
  if (contact?.ledgerAccountId) {
    const all = getAccounts();
    const acct = all.find(
      a => a.id === contact.ledgerAccountId &&
           a.accountType === "Ledger" &&
           a.isActive !== false
    );
    if (acct) return acct.id;
  }

  // ── 2. Name-based fallback (original behaviour) ──────────────────────────
  // Search within the specified parent group for an account whose name
  // contains the party name. Kept as safety net for system/demo accounts
  // that don't have a CRM contact record.
  const all = getAccounts();
  const match = all.find(
    a => a.accountType === "Ledger"
      && a.isActive
      && a.parentId === parentGroupId
      && a.name.toLowerCase().includes(lower),
  );
  return match?.id ?? null;
}

// ─── Auto-journal for Sales, Invoices & Purchases ─────────────────────────────

/**
 * Automatically creates a posted, balanced Journal Entry when a POS sale
 * or Invoice is completed / paid.
 *
 * Accounting equation per transaction:
 *   DR  Cash / Bank / Accounts-Receivable   = subtotal + taxAmount
 *   CR  Sales Revenue                        = subtotal
 *   CR  VAT Payable  (if tax > 0)            = taxAmount
 *
 * Returns the created JournalEntry, or null when account mappings are not
 * configured (silently skipped — the sale still completes normally).
 */
export function autoPostSaleJE(params: {
  source:        "POS" | "Invoice";
  reference:     string;    // e.g. "SAL-202504-001" or "INV-202504-003"
  customer:      string;
  date:          string;    // YYYY-MM-DD
  paymentMethod: SalePayment;
  subtotal:      number;    // net of tax
  taxAmount:     number;    // VAT / tax collected
  grandTotal:    number;    // subtotal + taxAmount
  costTotal?:    number;    // total cost of goods sold (for COGS/Inventory entry)
  /** When provided, an outstanding balance (grandTotal − amountPaid > 0) routes the debit to AR
   *  instead of Cash/Bank, so a cash-receipt JE can be posted separately when payment arrives.
   *  Leave undefined for POS/cash sales where payment is collected immediately. */
  amountPaid?:   number;
  /** Per-category breakdown — drives per-category Revenue and Inventory JE lines */
  categoryLines?: Array<{ category: string; subtotal: number; costTotal: number }>;
}): JournalEntry & { usesAR: boolean } | null {
  const s = getSettings();

  // ── Debit side: AR / Cash / Bank ─────────────────────────────────────────
  // Rule:
  //   Invoice source   → always DR Accounts Receivable (accrual basis).
  //                       Cash/Bank is only debited via a separate cash-receipt JE when
  //                       payment actually arrives.
  //   POS source       → payment is collected on the spot, so DR Cash/Bank directly.
  //   "Credit" method  → always AR (explicit credit sale regardless of source).
  //   Outstanding bal  → AR whenever amountPaid < grandTotal (payment not yet received).
  const isCredit      = params.paymentMethod === "Credit";
  const outstanding   = params.amountPaid !== undefined
                        ? params.grandTotal - params.amountPaid
                        : 0;
  const isOutstanding = outstanding > 0.005; // > half-cent to avoid float noise
  // Invoice-source JEs are always accrual (AR debit) unless it's a POS sale paid in full
  const useAR         = params.source === "Invoice"
                        ? true                         // invoices always go through AR
                        : isCredit || isOutstanding;   // POS: only AR when credit / outstanding

  // ── Resolve the payment-method debit account ─────────────────────────────
  // Priority:
  //   1. If payment method is a COA account ID that resolves to a Ledger → use it directly
  //   2. If payment method matches a COA account name → use that account's ID
  //   3. Legacy: "Cash" → configured cash account, "Card"/"Bank Transfer"/"Cheque" → bank account
  const _allAccounts  = getAccounts();
  const _resolvePayMethodLedger = (method: string): string | null => {
    // Try direct ID lookup
    const byId = _allAccounts.find(a => a.id === method && a.accountType === "Ledger" && a.isActive !== false);
    if (byId) return byId.id;
    // Try name lookup (case-insensitive) within Cash & Bank group descendants
    const nameLower = method.toLowerCase();
    const cbLedgers = getCashBankLedgers();
    const byName = cbLedgers.find(a => a.name.toLowerCase() === nameLower);
    if (byName) return byName.id;
    return null;
  };

  let debitAccId: string | null;
  if (useAR) {
    // Prefer per-customer AR sub-ledger; fall back to Trade Receivables ledger
    debitAccId = findSubLedgerForParty(params.customer, SYS_ACCS.AR_GROUP)
              || resolveToLedger(s.accReceivable)
              || SYS_ACCS.AR_TRADE;
  } else {
    // Try to resolve payment method as a COA Cash & Bank ledger (new dynamic approach)
    const dynLedger = _resolvePayMethodLedger(params.paymentMethod);
    if (dynLedger) {
      debitAccId = dynLedger;
    } else if (params.paymentMethod === "Cash") {
      debitAccId = resolveToLedger(s.accCash) || SYS_ACCS.CASH;
    } else {
      // Card / Bank Transfer / Cheque / unknown — use configured bank or fall back to Cash
      debitAccId = resolveToLedger(s.accBank) || resolveToLedger(s.accCash) || SYS_ACCS.CASH;
    }
  }
  if (!debitAccId) return null;

  const narration = `${params.source} – ${params.reference} – ${params.customer}`;

  const lines: JournalEntryLine[] = [
    { id: crypto.randomUUID(), ledgerId: debitAccId, narration, debit: params.grandTotal, credit: 0 },
  ];

  // ── Revenue lines — per-category ledgers where possible ──────────────────
  const catLines = params.categoryLines ?? [];
  const allAccounts = getAccounts();

  // ── Resolved fallback IDs — always valid Ledger targets ─────────────────
  const _generalRevId  = resolveToLedger(s.accSalesRevenue) ?? SYS_ACCS.GENERAL_SALES_REV;
  const _generalInvId  = resolveToLedger(s.accInventory)    ?? SYS_ACCS.GENERAL_INVENTORY;
  const _cogsId        = resolveToLedger(s.accCogs)         ?? SYS_ACCS.COGS;
  const _vatId         = resolveToLedger(s.accVatPayable)   ?? s.accVatPayable ?? null;

  if (catLines.length > 0) {
    for (const cl of catLines) {
      if (cl.subtotal <= 0) continue;
      const slug      = (cl.category || "uncategorised").trim().toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorised";
      const catRevId  = `sr-cat-${slug}`;
      // Use per-category ledger if it exists; otherwise fall back to General Sales Revenue
      const revLedger = allAccounts.some(a => a.id === catRevId && a.accountType === "Ledger")
                          ? catRevId
                          : _generalRevId;
      lines.push({ id: crypto.randomUUID(), ledgerId: revLedger,
        narration: `Revenue – ${params.reference} – ${cl.category}`, debit: 0, credit: cl.subtotal });
    }
  } else {
    // No breakdown — post total to first postable Revenue ledger
    lines.push({ id: crypto.randomUUID(), ledgerId: _generalRevId,
      narration: `Revenue – ${params.reference}`, debit: 0, credit: params.subtotal });
  }

  // VAT
  if (params.taxAmount > 0 && _vatId) {
    lines.push({ id: crypto.randomUUID(), ledgerId: _vatId,
      narration: `VAT – ${params.reference}`, debit: 0, credit: params.taxAmount });
  }

  // ── COGS / Inventory — per-category ledgers where possible ───────────────
  if (catLines.length > 0) {
    for (const cl of catLines) {
      if (cl.costTotal <= 0) continue;
      const slug      = (cl.category || "uncategorised").trim().toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorised";
      const catInvId  = `inv-cat-${slug}`;
      // Use per-category inventory ledger if it exists; otherwise fall back to General Inventory
      const invLedger = allAccounts.some(a => a.id === catInvId && a.accountType === "Ledger")
                          ? catInvId
                          : _generalInvId;
      lines.push({ id: crypto.randomUUID(), ledgerId: _cogsId,
        narration: `COGS – ${params.reference} – ${cl.category}`, debit: cl.costTotal, credit: 0 });
      lines.push({ id: crypto.randomUUID(), ledgerId: invLedger,
        narration: `Inventory reduction – ${params.reference}`, debit: 0, credit: cl.costTotal });
    }
  } else {
    const costTotal = params.costTotal ?? 0;
    if (costTotal > 0) {
      lines.push({ id: crypto.randomUUID(), ledgerId: _cogsId,
        narration: `COGS – ${params.reference}`, debit: costTotal, credit: 0 });
      lines.push({ id: crypto.randomUUID(), ledgerId: _generalInvId,
        narration: `Inventory reduction – ${params.reference}`, debit: 0, credit: costTotal });
    }
  }

  const totalDebit  = parseFloat(lines.reduce((s, l) => s + l.debit,  0).toFixed(2));
  const totalCredit = parseFloat(lines.reduce((s, l) => s + l.credit, 0).toFixed(2));

  const je = createJournalEntry({
    date:        params.date,
    reference:   `AUTO-${params.reference}`,
    description: `${params.source} Sale: ${params.reference} – ${params.customer}`,
    lines,
    status:      "posted",
    totalDebit,
    totalCredit,
    isBalanced:  Math.abs(totalDebit - totalCredit) < 0.02,
  });
  if (!je) return null;
  return Object.assign(je, { usesAR: useAR });
}

/**
 * Posts a cash/bank receipt JE when a credit-sale is subsequently paid.
 * Works for both buyer (AR) and supplier (AP) sub-ledgers — the contact's
 * own ledger is resolved via CRM lookup regardless of COA position.
 *   DR  Cash / Bank               = amount received
 *   CR  Contact's sub-ledger      = amount received  (reverses the accrual)
 */
export function autoPostCashReceiptJE(params: {
  reference:     string;
  customer:      string;
  date:          string;
  amount:        number;
  paymentMethod: SalePayment;
}): JournalEntry | null {
  if (params.amount <= 0) return null;
  const s = getSettings();

  // Cash/bank debit account
  const isCash  = params.paymentMethod === "Cash";
  const cashId  = isCash
    ? (resolveToLedger(s.accCash) || SYS_ACCS.CASH)
    : (resolveToLedger(s.accBank) || resolveToLedger(s.accCash) || SYS_ACCS.CASH);

  // Contact's sub-ledger — CRM-first lookup returns their ledgerAccountId regardless of
  // whether it sits under AR (Receivable) or AP (Payable) in the COA
  const contactLedgerId = findSubLedgerForParty(params.customer, SYS_ACCS.AR_GROUP)
                       || resolveToLedger(s.accReceivable)
                       || SYS_ACCS.AR_TRADE;

  if (!cashId || !contactLedgerId) return null;

  const narration = `Receipt – ${params.reference} – ${params.customer}`;
  const lines: JournalEntryLine[] = [
    { id: crypto.randomUUID(), ledgerId: cashId,          narration, debit: params.amount,  credit: 0 },
    { id: crypto.randomUUID(), ledgerId: contactLedgerId, narration, debit: 0, credit: params.amount },
  ];

  return createJournalEntry({
    date:        params.date,
    reference:   `RCPT-${params.reference}`,
    description: `Cash Receipt: ${params.reference} – ${params.customer}`,
    lines,
    status:      "posted",
    totalDebit:  params.amount,
    totalCredit: params.amount,
    isBalanced:  true,
  });
}

/**
 * Auto-posts a journal entry when a Purchase Order is received.
 *   DR Inventory / Stock  = PO total value
 *   CR Accounts Payable   = PO total value
 * Returns null if required COA accounts are not yet configured in Settings.
 */
export function autoPostPurchaseJE(params: {
  poNumber:          string;
  supplier:          string;
  date:              string;   // YYYY-MM-DD
  total:             number;
  supplierLedgerId?: string;   // specific supplier's subsidiary ledger (preferred)
  /** Per-category breakdown — drives per-category Inventory JE lines */
  categoryLines?: Array<{ category: string; total: number }>;
}): JournalEntry | null {
  if (params.total <= 0) return null;
  const s = getSettings();

  // ── Credit side: AP ───────────────────────────────────────────────────────
  // Prefer supplier-specific ledger, then find sub-ledger by name, then AP_TRADE.
  // Also search AR_GROUP as a fallback — covers contacts that were set up as
  // customers (AR ledger under 1130) but are also used as purchase suppliers.
  const apId = params.supplierLedgerId
    || findSubLedgerForParty(params.supplier, SYS_ACCS.AP_GROUP)
    || findSubLedgerForParty(params.supplier, SYS_ACCS.AP_TRADE)
    || findSubLedgerForParty(params.supplier, SYS_ACCS.AR_GROUP)
    || resolveToLedger(s.accPurchasePayable)
    || resolveToLedger(SYS_ACCS.AP_TRADE)
    || SYS_ACCS.AP_GENERAL;
  if (!apId) return null;

  const allAccounts  = getAccounts();
  const catLines     = params.categoryLines ?? [];
  // Always-valid fallback inventory ledger — prevents silent line omissions
  const _genInvId    = resolveToLedger(s.accInventory) ?? SYS_ACCS.GENERAL_INVENTORY;

  const lines: JournalEntryLine[] = [];

  // ── Debit side: Inventory — per-category ledgers where possible ───────────
  if (catLines.length > 0) {
    for (const cl of catLines) {
      if (cl.total <= 0) continue;
      const slug      = (cl.category || "uncategorised").trim().toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorised";
      const catInvId  = `inv-cat-${slug}`;
      // Use per-category ledger if it exists; otherwise fall back to General Inventory
      const invLedger = allAccounts.some(a => a.id === catInvId && a.accountType === "Ledger")
                          ? catInvId
                          : _genInvId;
      lines.push({ id: crypto.randomUUID(), ledgerId: invLedger,
        narration: `Stock received – ${params.poNumber} – ${cl.category}`,
        debit: cl.total, credit: 0 });
    }
  } else {
    lines.push({ id: crypto.randomUUID(), ledgerId: _genInvId,
      narration: `Stock received – ${params.poNumber}`, debit: params.total, credit: 0 });
  }

  // AP credit line
  lines.push({ id: crypto.randomUUID(), ledgerId: apId,
    narration: `Purchase Receipt – ${params.poNumber} – ${params.supplier}`,
    debit: 0, credit: params.total });

  const totalDebit  = parseFloat(lines.reduce((s, l) => s + l.debit,  0).toFixed(2));
  const totalCredit = parseFloat(lines.reduce((s, l) => s + l.credit, 0).toFixed(2));

  return createJournalEntry({
    date:        params.date,
    reference:   `AUTO-${params.poNumber}`,
    description: `Purchase Receipt: ${params.poNumber} – ${params.supplier}`,
    lines,
    status:      "posted",
    totalDebit,
    totalCredit,
    isBalanced:  Math.abs(totalDebit - totalCredit) < 0.02,
  });
}

// ─── Server sync ──────────────────────────────────────────────────────────────

/**
 * On login, fetch all stored data for the given namespace from PostgreSQL
 * and hydrate the in-memory cache (_memRaw) so the rest of the app works as normal.
 *
 * Called by auth-context after a successful login.
 */

// ─── Receipt & Payment Vouchers ───────────────────────────────────────────────

export interface RPVoucherLine {
  id: string;
  accountId: string;
  accountName: string;
  description: string;
  amount: number;
  /** For multi-invoice payment AP lines — the invoice ID this line clears */
  invoiceId?: string;
}

export interface RPVoucher {
  id: string;
  voucherNumber: string;       // RV-000001 | PV-000001
  voucherType: "receipt" | "payment";
  date: string;
  partyName: string;
  cashBankAccountId: string;   // ID of Cash or Bank ledger account (primary / first bank)
  cashBankAccountName: string;
  reference: string;           // cheque #, transfer ref, etc.
  lines: RPVoucherLine[];
  /** Payment vouchers only: multiple bank/cash accounts on the credit side. */
  bankLines?: RPVoucherLine[];
  totalAmount: number;
  narration: string;
  status: "draft" | "posted";
  journalEntryId?: string;
  linkedInvoiceId?: string;    // single invoice linked on receipt vouchers
  /** Multi-invoice payment — IDs of every invoice cleared by this payment voucher */
  linkedInvoiceIds?: string[];
  createdAt: string;
  updatedAt: string;
}

const RPV_KEY = "admin-rp-vouchers";

export function getRPVouchers(): RPVoucher[] {
  return getStored<RPVoucher>(RPV_KEY);
}

function _saveRPVouchers(data: RPVoucher[]): void {
  const sk = tenantKey(RPV_KEY);
  _lsCache(sk, data);
  _apiWrite(sk, data);
}

function nextRPVoucherNumber(type: "receipt" | "payment"): string {
  const prefix = type === "receipt" ? "RV" : "PV";
  const existing = getRPVouchers()
    .filter(v => v.voucherType === type)
    .map(v => parseInt(v.voucherNumber.replace(/\D/g, ""), 10))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}-${String(next).padStart(6, "0")}`;
}

export function createRPVoucher(
  data: Omit<RPVoucher, "id" | "voucherNumber" | "createdAt" | "updatedAt">
): RPVoucher {
  const v: RPVoucher = {
    ...data,
    id: crypto.randomUUID(),
    voucherNumber: nextRPVoucherNumber(data.voucherType),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  _saveRPVouchers([...getRPVouchers(), v]);
  return v;
}

export function updateRPVoucher(
  id: string,
  updates: Partial<Omit<RPVoucher, "id" | "createdAt">>
): RPVoucher {
  const all = getRPVouchers().map(v =>
    v.id === id ? { ...v, ...updates, updatedAt: new Date().toISOString() } : v
  );
  _saveRPVouchers(all);
  return all.find(v => v.id === id)!;
}

/**
 * Remove the contribution of a voucher from an invoice's payment history and
 * recalculate its status.  Call this BEFORE deleting a posted voucher.
 */
function _reverseInvoicePayment(invoiceId: string, amount: number, voucherNumber: string): void {
  const inv = getInvoices().find(i => i.id === invoiceId);
  if (!inv) return;
  const filtered = (inv.paymentHistory ?? []).filter(r =>
    !(r.note?.includes(voucherNumber) && Math.abs((parseFloat(r.amount) || 0) - amount) < 0.01)
  );
  const newPaid = filtered.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const subtotal = (inv.items || []).reduce((s, it) => {
    const qty   = parseFloat(it.qty) || 0;
    const price = parseFloat(it.unitPrice) || 0;
    const disc  = parseFloat(it.discount) || 0;
    return s + (qty * price - (it.discountType === "pct" ? qty * price * disc / 100 : disc));
  }, 0);
  const tax   = subtotal * (parseFloat(inv.taxRate) || 0) / 100;
  const grand = subtotal + tax + (parseFloat(inv.shippingFee) || 0) + (parseFloat(inv.handlingFee) || 0);
  const newStatus: InvoiceStatus =
    newPaid >= grand - 0.01 ? "Paid" :
    newPaid > 0             ? "Partial" :
    "Unpaid";
  updateInvoice(invoiceId, {
    amountPaid:     String(newPaid),
    status:         newStatus,
    paymentHistory: filtered,
    paidAt:         newStatus === "Paid" ? inv.paidAt : "",
  });
}

export function deleteRPVoucher(id: string): void {
  const v = getRPVouchers().find(r => r.id === id);
  if (!v) return;

  // 1. Delete linked Journal Entry
  if (v.journalEntryId) {
    _saveJournalEntries(getJournalEntries().filter(e => e.id !== v.journalEntryId));
  }

  // 2. Reverse invoice payment(s) if this voucher was posted
  if (v.status === "posted") {
    // Single-invoice link (receipt vouchers + legacy payment)
    if (v.linkedInvoiceId) {
      _reverseInvoicePayment(v.linkedInvoiceId, v.totalAmount, v.voucherNumber);
    }
    // Multi-invoice payment — each AP line knows its invoice
    if (v.linkedInvoiceIds?.length) {
      for (const line of v.lines) {
        if (line.invoiceId) {
          _reverseInvoicePayment(line.invoiceId, line.amount, v.voucherNumber);
        }
      }
    }
    // Reverse any advance credit that was stored when posting (runs for both multi-invoice and no-invoice)
    if (v.partyName && Array.isArray(v.linkedInvoiceIds)) {
      const bankLinesTotal = (v.bankLines || []).reduce((s, l) => s + l.amount, 0);
      const invoiceApplied = v.lines.reduce((s, l) => s + (l.invoiceId ? l.amount : 0), 0);
      const excess = bankLinesTotal - invoiceApplied;
      if (excess > 0.01) {
        const contact = getCustomers().find(c =>
          c.name.toLowerCase() === v.partyName!.toLowerCase()
        );
        if (contact) {
          updateCustomer(contact.id, {
            advanceCredit: Math.max(0, (contact.advanceCredit || 0) - excess),
          });
        }
      }
    }
  }

  // 3. Remove the voucher
  _saveRPVouchers(getRPVouchers().filter(r => r.id !== id));
}

/**
 * Creates a posted, balanced JE for the voucher:
 *   Receipt  → DR Cash/Bank,      CR each line account
 *   Payment  → DR each line acct, CR Cash/Bank
 */
export function postRPVoucherJE(id: string): JournalEntry {
  const v = getRPVouchers().find(v => v.id === id);
  if (!v) throw new Error("Voucher not found");
  if (v.status === "posted") throw new Error("Already posted");

  // Both payment AND new-flow receipt vouchers store bank accounts in bankLines
  const hasMultiBank = (v.bankLines && v.bankLines.length > 0) ?? false;
  if (!hasMultiBank && !v.cashBankAccountId) {
    throw new Error("Cash / Bank account is required. Please edit the voucher and select one before posting.");
  }

  const linesTotal = v.lines.reduce((s, l) => s + l.amount, 0);

  const lines: JournalEntryLine[] = [];
  const partyRef = `${v.partyName || "Party"}${v.reference ? " | " + v.reference : ""}`;

  if (v.voucherType === "receipt") {
    // ── Receipt ──────────────────────────────────────────────────────────────
    // DR  Bank / Cash accounts (money coming in) — multi-bank or single
    // CR  each line — AR accounts (one per invoice, auto-generated)
    if (hasMultiBank) {
      // New multi-bank receipt flow
      for (const bl of v.bankLines!) {
        lines.push({
          id: crypto.randomUUID(), ledgerId: bl.accountId,
          narration: bl.description || `Receipt — ${partyRef}`,
          debit: bl.amount, credit: 0,
        });
      }
    } else {
      // Legacy / simple receipt — single cash/bank account
      lines.push({
        id: crypto.randomUUID(), ledgerId: v.cashBankAccountId!,
        narration: `Receipt — ${partyRef}`,
        debit: linesTotal, credit: 0,
      });
    }
    for (const l of v.lines) {
      lines.push({
        id: crypto.randomUUID(), ledgerId: l.accountId,
        narration: l.description || v.narration || v.voucherNumber,
        debit: 0, credit: l.amount,
      });
    }
  } else {
    // ── Payment ───────────────────────────────────────────────────────────────
    // DR  each line — AP / Expense accounts (one per invoice)
    // CR  bank lines (multiple) or single cash/bank account
    for (const l of v.lines) {
      lines.push({
        id: crypto.randomUUID(), ledgerId: l.accountId,
        narration: l.description || v.narration || v.voucherNumber,
        debit: l.amount, credit: 0,
      });
    }
    if (hasMultiBank) {
      // Multi-bank payment — credit each bank account separately
      for (const bl of v.bankLines!) {
        lines.push({
          id: crypto.randomUUID(), ledgerId: bl.accountId,
          narration: bl.description || `Payment — ${partyRef}`,
          debit: 0, credit: bl.amount,
        });
      }
    } else {
      // Legacy / simple payment — single cash/bank account
      lines.push({
        id: crypto.randomUUID(), ledgerId: v.cashBankAccountId!,
        narration: `Payment — ${partyRef}`,
        debit: 0, credit: linesTotal,
      });
    }
  }

  const je = createJournalEntry({
    date: v.date,
    reference: v.voucherNumber,
    description: `${v.voucherType === "receipt" ? "Receipt" : "Payment"} Voucher — ${v.partyName || "Party"}`,
    lines,
    status: "posted",
    totalDebit:  lines.reduce((s, l) => s + l.debit,  0),
    totalCredit: lines.reduce((s, l) => s + l.credit, 0),
    isBalanced:  true,
  });

  updateRPVoucher(id, { status: "posted", journalEntryId: je.id, totalAmount: linesTotal });

  // ── Helper: apply payment to one invoice ──────────────────────────────────
  function _applyInvoicePayment(invoiceId: string, amount: number): void {
    const inv = getInvoices().find(i => i.id === invoiceId);
    if (!inv) return;
    const newPaid = (parseFloat(inv.amountPaid) || 0) + amount;
    const subtotal = (inv.items || []).reduce((s, it) => {
      const qty   = parseFloat(it.qty) || 0;
      const price = parseFloat(it.unitPrice) || 0;
      const disc  = parseFloat(it.discount) || 0;
      return s + (qty * price - (it.discountType === "pct" ? qty * price * disc / 100 : disc));
    }, 0);
    const tax   = subtotal * (parseFloat(inv.taxRate) || 0) / 100;
    const grand = subtotal + tax + (parseFloat(inv.shippingFee) || 0) + (parseFloat(inv.handlingFee) || 0);
    const newStatus: InvoiceStatus =
      newPaid >= grand - 0.01 ? "Paid" :
      newPaid > 0             ? "Partial" :
      inv.status;
    const record: PaymentRecord = {
      id:     crypto.randomUUID(),
      date:   v.date,
      amount: String(amount),
      method: v.voucherType === "receipt" ? "Receipt Voucher" : "Payment Voucher",
      note:   `${v.voucherNumber}${v.narration ? " — " + v.narration : ""}`,
    };
    updateInvoice(inv.id, {
      amountPaid:     String(newPaid),
      status:         newStatus,
      paymentHistory: [...(inv.paymentHistory || []), record],
      paidAt:         newStatus === "Paid" ? new Date().toISOString() : inv.paidAt,
    });
  }

  // ── Update linked invoice balance ─────────────────────────────────────────
  // Single-invoice link (legacy simple receipt / payment)
  if (v.linkedInvoiceId) {
    _applyInvoicePayment(v.linkedInvoiceId, linesTotal);
  }

  // Multi-invoice payment — apply each AP line's amount to its invoice
  if (v.linkedInvoiceIds?.length) {
    for (const line of v.lines) {
      if (line.invoiceId) {
        _applyInvoicePayment(line.invoiceId, line.amount);
      }
    }
  }

  // Track advance credit when bank total exceeds invoices paid.
  // Runs for both multi-invoice and no-invoice (advance-only) receipts/payments.
  if (v.partyName && Array.isArray(v.linkedInvoiceIds)) {
    const bankLinesTotal = (v.bankLines || []).reduce((s, l) => s + l.amount, 0);
    const invoiceApplied = v.lines.reduce((s, l) => s + (l.invoiceId ? l.amount : 0), 0);
    const excess = bankLinesTotal - invoiceApplied;
    if (excess > 0.01) {
      const contact = getCustomers().find(c =>
        c.name.toLowerCase() === v.partyName!.toLowerCase()
      );
      if (contact) {
        updateCustomer(contact.id, { advanceCredit: (contact.advanceCredit || 0) + excess });
      }
    }
  }

  return je;
}

/**
 * After the DB sync, deduplicate a stored array by a key function.
 * Keeps the entry with the EARLIEST createdAt per key group.
 * Returns the clean array (same reference if no changes).
 */
function _dedupeByKey<T extends { createdAt?: string }>(
  items: T[],
  keyFn: (item: T) => string,
): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const k = keyFn(item);
    if (!k) continue;
    const ex = seen.get(k);
    if (!ex) {
      seen.set(k, item);
    } else {
      // Keep the earlier one (original entry, not the import duplicate)
      const exDate = ex.createdAt ? new Date(ex.createdAt).getTime() : Infinity;
      const itDate = item.createdAt ? new Date(item.createdAt).getTime() : Infinity;
      if (itDate < exDate) seen.set(k, item);
    }
  }
  return seen.size < items.length ? Array.from(seen.values()) : items;
}

// (self-heal constants removed — no localStorage means no pre-sync snapshot needed)

/**
 * Removes Journal Entries whose reference matches a receipt/payment voucher
 * number (RV-XXXXXX / PV-XXXXXX) but whose voucher no longer exists.
 * These "orphans" are created when a voucher was deleted by old code that
 * didn't cascade-delete the linked JE.
 *
 * @param tenantId  Active tenant ID (null = skip; no tenant-scoped data yet)
 * @param writeToDB Whether to persist the cleaned list to the server immediately.
 *                  Pass true for manual/on-demand calls, false for the silent
 *                  auto-heal that runs inside syncAllFromServer (which already
 *                  has the fresh server data in memory).
 * @returns Number of orphaned JEs removed.
 */
function _purgeOrphanedVoucherJEs(tenantId: string, writeToDB: boolean): number {
  const allJEs     = getJournalEntries();
  const voucherNos = new Set(getRPVouchers().map(v => v.voucherNumber));

  const VOUCHER_REF_RE = /^(RV|PV)-\d+$/;
  const orphans = allJEs.filter(je =>
    VOUCHER_REF_RE.test((je.reference ?? "").trim()) &&
    !voucherNos.has((je.reference ?? "").trim())
  );

  if (orphans.length === 0) return 0;

  const clean = allJEs.filter(je => !orphans.find(o => o.id === je.id));
  const sk    = tenantKey(JE_KEY);
  _lsSet(sk, clean);   // update in-memory immediately
  if (writeToDB) {
    _apiWrite(sk, clean).catch(err =>
      console.error("[purge] Failed to persist orphan-JE cleanup:", err)
    );
  }
  console.info(`[purge] Removed ${orphans.length} orphaned voucher JE(s):`,
    orphans.map(j => j.reference).join(", "));
  return orphans.length;
}

/** Public API so the UI can trigger a manual clean-up with visible feedback. */
export function purgeOrphanedVoucherJEs(): number {
  const tenantId = getActiveTenantId();
  if (!tenantId) return 0;
  return _purgeOrphanedVoucherJEs(tenantId, true /* write to DB */);
}

/**
 * Pull all data from the PostgreSQL KV store into the in-memory cache.
 * The server is the single source of truth — no localStorage involved.
 *
 * Flow:
 *  1. Drain any pending in-flight writes so the server holds the freshest state.
 *  2. Fetch global keys (users, tenants) → write into _memRaw.
 *  3. If a tenant is active, fetch tenant-scoped keys → write into _memRaw.
 *  4. Run lightweight data-quality passes (orphan-JE purge, dedup).
 *  5. Fire "onesoft:data-synced" so all hooks re-render with fresh data.
 */
export async function syncAllFromServer(tenantId: string | null): Promise<void> {
  try {
    // Step 1 — Drain pending writes so we read the server's freshest state.
    if (_pendingWrites.size > 0) {
      await Promise.allSettled([..._pendingWrites.values()]);
    }

    // Step 2 — Global data (users, tenants, module groups, platform config).
    const globalData = await kvGetAll("global");
    if (globalData) {
      for (const [key, value] of Object.entries(globalData)) {
        if (value !== undefined && value !== null) {
          _lsCache(key, value);
        }
      }
    }

    // Step 3 — Tenant-scoped data.
    if (tenantId) {
      const ns = `t:${tenantId}`;
      const tenantData = await kvGetAll(ns);
      if (tenantData) {
        for (const [key, value] of Object.entries(tenantData)) {
          if (value !== undefined && value !== null) {
            _lsCache(`t:${tenantId}:${key}`, value);
          }
        }
      }

      // Step 4a — Remove orphaned voucher Journal Entries.
      _purgeOrphanedVoucherJEs(tenantId, true);
    }

    // Step 4b — Deduplicate products and stock items.
    const prodsKey = tenantId ? `t:${tenantId}:${PRODUCTS_KEY}` : PRODUCTS_KEY;
    const prodsRaw = _memRaw.get(prodsKey);
    if (prodsRaw) {
      try {
        const prods = JSON.parse(prodsRaw) as Product[];
        if (Array.isArray(prods)) {
          const clean = _dedupeByKey(prods, p => ((p as Product).name || "").trim().toLowerCase());
          if (clean !== prods) {
            console.info(`[sync] Auto-dedup products: ${prods.length} → ${clean.length}`);
            _lsCache(prodsKey, clean);
            kvPut(tenantId ? `t:${tenantId}` : "global", PRODUCTS_KEY, clean).catch(() => {});
          }
        }
      } catch { /* malformed */ }
    }

    const stockKey = tenantId ? `t:${tenantId}:${STOCK_KEY}` : STOCK_KEY;
    const stockRaw = _memRaw.get(stockKey);
    if (stockRaw) {
      try {
        const items = JSON.parse(stockRaw) as StockItem[];
        if (Array.isArray(items)) {
          const clean = _dedupeByKey(items, s => [
            ((s as StockItem).productName || "").trim().toLowerCase(),
            ((s as StockItem).sku || "").trim().toLowerCase(),
            ((s as StockItem).store || ""),
            ((s as StockItem).stockType || ""),
          ].join("|"));
          if (clean !== items) {
            console.info(`[sync] Auto-dedup stock: ${items.length} → ${clean.length}`);
            _lsCache(stockKey, clean);
            kvPut(tenantId ? `t:${tenantId}` : "global", STOCK_KEY, clean).catch(() => {});
          }
        }
      } catch { /* malformed */ }
    }
  } catch {
    // Network unavailable — in-memory cache from previous writes is used as fallback.
  }

  // Step 5 — Notify all data hooks so they re-render with the fresh server data.
  try {
    window.dispatchEvent(new CustomEvent("onesoft:data-synced"));
  } catch { /* SSR guard */ }
}

// ─── Recruitment — Job Postings ───────────────────────────────────────────────
export type JobStatus = "open" | "closed" | "draft";
export type JobType   = "full-time" | "part-time" | "contract" | "internship";

export type JobPosting = {
  id:           string;
  title:        string;
  department:   string;
  location:     string;
  type:         JobType;
  status:       JobStatus;
  description:  string;
  requirements: string;
  salary?:      string;
  createdAt:    string;
  updatedAt:    string;
};

const JOBS_KEY = "admin-hrm-jobs";
export const getJobPostings   = (): JobPosting[] => getStored<JobPosting>(JOBS_KEY);
export const createJobPosting = (data: Omit<JobPosting, "id" | "createdAt" | "updatedAt">): JobPosting => {
  const item: JobPosting = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(JOBS_KEY, [...getJobPostings(), item]);
  return item;
};
export const updateJobPosting = (id: string, updates: Partial<Omit<JobPosting, "id" | "createdAt">>): JobPosting => {
  const items = getJobPostings();
  const i = items.findIndex(x => x.id === id);
  if (i === -1) throw new Error("Job not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(JOBS_KEY, items);
  return items[i];
};
export const deleteJobPosting = (id: string): void => {
  setStored(JOBS_KEY, getJobPostings().filter(x => x.id !== id));
};

// ─── Recruitment — Job Applicants ─────────────────────────────────────────────
export type ApplicantStage = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";

export type JobApplicant = {
  id:          string;
  jobId:       string;
  fullName:    string;
  email:       string;
  phone?:      string;
  experience:  string;   // e.g. "4y"
  education:   string;   // e.g. "Master's Degree"
  match:       number;   // 0–100
  stage:       ApplicantStage;
  round?:      string;
  rating?:     number;
  decision?:   string;
  resumeUrl?:  string;
  notes?:      string;
  appliedAt:   string;
  createdAt:   string;
  updatedAt:   string;
};

const APPLICANTS_KEY = "admin-hrm-applicants";
export const getJobApplicants   = (jobId?: string): JobApplicant[] => {
  const all = getStored<JobApplicant>(APPLICANTS_KEY);
  return jobId ? all.filter(a => a.jobId === jobId) : all;
};
export const createJobApplicant = (data: Omit<JobApplicant, "id" | "createdAt" | "updatedAt">): JobApplicant => {
  const item: JobApplicant = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(APPLICANTS_KEY, [...getJobApplicants(), item]);
  return item;
};
export const updateJobApplicant = (id: string, updates: Partial<Omit<JobApplicant, "id" | "createdAt">>): JobApplicant => {
  const items = getJobApplicants();
  const i = items.findIndex(x => x.id === id);
  if (i === -1) throw new Error("Applicant not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(APPLICANTS_KEY, items);
  return items[i];
};
export const deleteJobApplicant = (id: string): void => {
  setStored(APPLICANTS_KEY, getJobApplicants().filter(x => x.id !== id));
};

// ─── Recruitment — Interview Schedules ────────────────────────────────────────
export type InterviewStatus = "scheduled" | "completed" | "cancelled" | "no-show" | "rescheduled";

export type InterviewSchedule = {
  id:            string;
  jobId:         string;
  applicantId:   string;
  interviewerId: string;   // AdminUser.id
  date:          string;   // YYYY-MM-DD
  time:          string;   // HH:mm
  link:          string;   // video call link
  status:        InterviewStatus;
  notes?:        string;
  emailSent?:    boolean;
  createdAt:     string;
  updatedAt:     string;
};

const INTERVIEWS_KEY = "admin-hrm-interviews";
export const getInterviewSchedules   = (jobId?: string): InterviewSchedule[] => {
  const all = getStored<InterviewSchedule>(INTERVIEWS_KEY);
  return jobId ? all.filter(i => i.jobId === jobId) : all;
};
export const getInterviewByApplicant = (applicantId: string): InterviewSchedule | undefined =>
  getStored<InterviewSchedule>(INTERVIEWS_KEY).find(i => i.applicantId === applicantId);
export const createInterviewSchedule = (data: Omit<InterviewSchedule, "id" | "createdAt" | "updatedAt">): InterviewSchedule => {
  const item: InterviewSchedule = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(INTERVIEWS_KEY, [...getInterviewSchedules(), item]);
  return item;
};
export const upsertInterviewSchedule = (applicantId: string, data: Omit<InterviewSchedule, "id" | "createdAt" | "updatedAt">): InterviewSchedule => {
  const existing = getInterviewByApplicant(applicantId);
  if (existing) {
    const all = getStored<InterviewSchedule>(INTERVIEWS_KEY);
    const i = all.findIndex(x => x.id === existing.id);
    all[i] = { ...all[i], ...data, updatedAt: new Date().toISOString() };
    setStored(INTERVIEWS_KEY, all);
    return all[i];
  }
  return createInterviewSchedule(data);
};
export const updateInterviewSchedule = (id: string, updates: Partial<Omit<InterviewSchedule, "id" | "createdAt">>): InterviewSchedule => {
  const items = getStored<InterviewSchedule>(INTERVIEWS_KEY);
  const i = items.findIndex(x => x.id === id);
  if (i === -1) throw new Error("Interview not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(INTERVIEWS_KEY, items);
  return items[i];
};
export const deleteInterviewSchedule = (id: string): void => {
  setStored(INTERVIEWS_KEY, getStored<InterviewSchedule>(INTERVIEWS_KEY).filter(x => x.id !== id));
};
