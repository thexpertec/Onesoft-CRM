import { kvPut, kvGetAll } from "./api";

export type LeadStatus = "New" | "Contacted" | "Qualified" | "Proposal Sent" | "Won" | "Lost";

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
  try {
    const leadsRaw = localStorage.getItem(LEADS_KEY);
    if (leadsRaw) {
      const leads: Lead[] = JSON.parse(leadsRaw);
      const filtered = leads.filter((l) => !DEMO_LEAD_IDS.includes(l.id));
      if (filtered.length !== leads.length) localStorage.setItem(LEADS_KEY, JSON.stringify(filtered));
    }
    const docsRaw = localStorage.getItem(DOCS_KEY);
    if (docsRaw) {
      const docs: RequirementDoc[] = JSON.parse(docsRaw);
      const filtered = docs.filter((d) => !DEMO_DOC_IDS.includes(d.id));
      if (filtered.length !== docs.length) localStorage.setItem(DOCS_KEY, JSON.stringify(filtered));
    }
  } catch { /* ignore */ }
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
    try { existing = JSON.parse(localStorage.getItem(key) || "[]"); } catch { existing = []; }
    const newEntry: ActivityEntry = {
      ...entry,
      id: crypto.randomUUID(),
      user: _activityUser,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify([newEntry, ...existing].slice(0, MAX_ACTIVITY)));
  } catch { /* ignore */ }
}

export function getActivities(): ActivityEntry[] {
  try {
    return JSON.parse(localStorage.getItem(tenantKey(ACTIVITY_KEY)) || "[]");
  } catch { return []; }
}

export function clearActivities(): void {
  try { localStorage.removeItem(tenantKey(ACTIVITY_KEY)); } catch { /* ignore */ }
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Fire-and-forget write to the PostgreSQL KV store.
 * storageKey is the raw localStorage key (may include "t:{id}:" prefix).
 */
function _apiWrite(storageKey: string, value: unknown): void {
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
  kvPut(ns, key, value).catch(() => {/* silently ignore network errors */});
}

/** Tenant-namespaced read (all business data). */
function getStored<T>(key: string): T[] {
  try {
    const item = localStorage.getItem(tenantKey(key));
    if (item) {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error(`Error reading ${tenantKey(key)} from localStorage`, e);
  }
  return [];
}

/** Tenant-namespaced write — also persists to PostgreSQL. */
function setStored<T>(key: string, data: T[]) {
  const sk = tenantKey(key);
  localStorage.setItem(sk, JSON.stringify(data));
  _apiWrite(sk, data);
  // Notify same-tab listeners (browser storage event only fires in other tabs)
  try { window.dispatchEvent(new StorageEvent("storage", { key: sk, storageArea: localStorage })); } catch { /* noop in non-browser env */ }
}

/** Platform-level read (always unprefixed — for users & tenants registry). */
function getGlobal<T>(key: string): T[] {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { }
  return [];
}

/** Platform-level write — also persists to PostgreSQL. */
function setGlobal<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
  _apiWrite(key, data);
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
/** Force-push all localStorage docs to the API server (rescue docs created before sync existed). */
export const syncDocsToApi = (): void => {
  const docs = getDocs();
  if (docs.length > 0) _apiWrite(tenantKey(DOCS_KEY), docs);
};

// ─── Customers API ────────────────────────────────────────────────────────────
export type CustomerStatus = "Active" | "Inactive" | "Churned";

export type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  city: string;
  status: CustomerStatus;
  source: "from_lead" | "direct";
  leadId?: string;
  customerSince: string;
  totalValue: string;
  currency: string;
  notes: string;
  tags: string[];
  ledgerAccountId?: string;  // auto-created subsidiary ledger under Accounts Receivable
  createdAt: string;
  updatedAt: string;
};

const CUSTOMERS_KEY = "admin-customers";

export const getCustomers = (): Customer[] => getStored<Customer>(CUSTOMERS_KEY);
export const getCustomer = (id: string): Customer | undefined => getCustomers().find(c => c.id === id);

export const createCustomer = (data: Omit<Customer, "id" | "createdAt" | "updatedAt">): Customer => {
  const ledgerAccountId = data.ledgerAccountId || createSubsidiaryLedger({
    parentId:   SYS_ACCS.AR_GROUP,
    parentCode: "1100",
    name:       data.name + (data.company ? ` (${data.company})` : ""),
    head:       "Assets",
    subType:    "Receivable",
    description: `Receivable account for customer: ${data.name}`,
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
  return newCustomer;
};

export const updateCustomer = (id: string, updates: Partial<Omit<Customer, "id" | "createdAt">>): Customer => {
  const customers = getCustomers();
  const index = customers.findIndex(c => c.id === id);
  if (index === -1) throw new Error("Customer not found");
  customers[index] = { ...customers[index], ...updates, updatedAt: new Date().toISOString() };
  setStored(CUSTOMERS_KEY, customers);
  const detail = updates.status ? `Status → ${updates.status}` : undefined;
  addActivity({ action: updates.status ? "status_changed" : "updated", entity: "Customer", entityName: customers[index].name, detail });
  return customers[index];
};

export const deleteCustomer = (id: string): void => {
  const customer = getCustomers().find(c => c.id === id);
  setStored(CUSTOMERS_KEY, getCustomers().filter(c => c.id !== id));
  addActivity({ action: "deleted", entity: "Customer", entityName: customer?.name || id });
};

export const convertLeadToCustomer = (lead: Lead): Customer => {
  const customer = createCustomer({
    name: lead.name,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    industry: lead.industry,
    city: lead.city,
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

// ─── Suppliers API ────────────────────────────────────────────────────────────
export type SupplierStatus = "Active" | "Inactive" | "Blacklisted";

export type Supplier = {
  id: string;
  company: string;
  contactPerson: string;
  email: string;
  phone: string;
  category: string;
  city: string;
  country: string;
  status: SupplierStatus;
  rating: number;
  currency: string;
  notes: string;
  tags: string[];
  ledgerAccountId?: string;  // auto-created subsidiary ledger under Accounts Payable
  createdAt: string;
  updatedAt: string;
};

const SUPPLIERS_KEY = "admin-suppliers";

export const getSuppliers = (): Supplier[] => getStored<Supplier>(SUPPLIERS_KEY);

export const createSupplier = (data: Omit<Supplier, "id" | "createdAt" | "updatedAt">): Supplier => {
  const ledgerAccountId = data.ledgerAccountId || createSubsidiaryLedger({
    parentId:    SYS_ACCS.AP_GROUP,
    parentCode:  "2100",
    name:        data.company + (data.contactPerson ? ` (${data.contactPerson})` : ""),
    head:        "Liabilities",
    subType:     "Payable",
    description: `Payable account for supplier: ${data.company}`,
  });
  const item: Supplier = {
    ...data,
    ledgerAccountId,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(SUPPLIERS_KEY, [...getSuppliers(), item]);
  addActivity({ action: "created", entity: "Supplier", entityName: item.company, detail: item.contactPerson || undefined });
  return item;
};

export const updateSupplier = (id: string, updates: Partial<Omit<Supplier, "id" | "createdAt">>): Supplier => {
  const items = getSuppliers();
  const i = items.findIndex(s => s.id === id);
  if (i === -1) throw new Error("Supplier not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(SUPPLIERS_KEY, items);
  addActivity({ action: "updated", entity: "Supplier", entityName: items[i].company });
  return items[i];
};

export const deleteSupplier = (id: string): void => {
  const item = getSuppliers().find(s => s.id === id);
  setStored(SUPPLIERS_KEY, getSuppliers().filter(s => s.id !== id));
  addActivity({ action: "deleted", entity: "Supplier", entityName: item?.company || id });
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
  createdAt: string;
  updatedAt: string;
};

const SHAREHOLDERS_KEY = "admin-shareholders";

export const getShareholders = (): Shareholder[] => getStored<Shareholder>(SHAREHOLDERS_KEY);

export const createShareholder = (data: Omit<Shareholder, "id" | "createdAt" | "updatedAt">): Shareholder => {
  const item: Shareholder = {
    ...data,
    id: crypto.randomUUID(),
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
  setStored(PRODUCT_CATEGORIES_KEY, getProductCategories().filter(c => c.id !== id));
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
  | "crm_leads" | "crm_customers" | "crm_suppliers"
  | "products" | "stock" | "purchases"
  | "sales" | "invoices" | "sales_agents"
  | "documents"
  | "hrm_staff" | "hrm_roles"
  | "media"
  | "settings";

export type ModuleDef = {
  id:    ModuleId;
  label: string;
  desc:  string;
  group: string;
  href:  string;
};

export const MODULE_DEFINITIONS: ModuleDef[] = [
  // CRM
  { id: "crm_leads",     label: "Leads",          desc: "Lead pipeline & prospecting",    group: "CRM",      href: "/leads"     },
  { id: "crm_customers", label: "Customers",       desc: "Customer records & history",     group: "CRM",      href: "/customers" },
  { id: "crm_suppliers", label: "Suppliers",       desc: "Supplier contacts & details",    group: "CRM",      href: "/suppliers" },
  // Products & Inventory
  { id: "products",      label: "Products",        desc: "Catalogue, brands, categories",  group: "Products", href: "/products"  },
  { id: "stock",         label: "Stock",           desc: "Inventory & stock holds",        group: "Products", href: "/stock"     },
  { id: "purchases",     label: "Purchases",       desc: "Purchase orders from suppliers", group: "Products", href: "/purchases" },
  // Sales
  { id: "sales",         label: "Sales & POS",     desc: "Sales, invoices & POS terminal", group: "Sales",    href: "/sales"        },
  { id: "invoices",      label: "Invoices",         desc: "Invoice management & tracking",  group: "Sales",    href: "/invoices"     },
  { id: "sales_agents",  label: "Sales Agents",     desc: "Agent management & commissions", group: "Sales",    href: "/sales-agents" },
  // Documents
  { id: "documents",     label: "Documents",       desc: "Requirement & client docs",      group: "Other",    href: "/documents" },
  // HRM
  { id: "hrm_staff",     label: "Staff",           desc: "Employee records & departments", group: "HRM",      href: "/staff"     },
  { id: "hrm_roles",     label: "Roles",           desc: "Permission roles",               group: "HRM",      href: "/roles"     },
  // Other
  { id: "media",         label: "Media Library",   desc: "File & image management",        group: "Other",    href: "/media"     },
  { id: "settings",      label: "Settings",        desc: "Company profile & app config",   group: "Other",    href: "/settings"  },
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

export const getModuleGroups = (): ModuleGroup[] => {
  try {
    const raw = localStorage.getItem(MODULE_GROUPS_KEY);
    return raw ? JSON.parse(raw) : [];
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
  localStorage.setItem(MODULE_GROUPS_KEY, JSON.stringify(updated));
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
  localStorage.setItem(MODULE_GROUPS_KEY, JSON.stringify(groups));
  _apiWrite(MODULE_GROUPS_KEY, groups);
  return groups[idx];
};

export const deleteModuleGroup = (id: string): void => {
  const updated = getModuleGroups().filter(g => g.id !== id);
  localStorage.setItem(MODULE_GROUPS_KEY, JSON.stringify(updated));
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

export const deleteTenant = (id: string): void => {
  setGlobal(TENANTS_KEY, getTenants().filter(t => t.id !== id));
};

/** Returns estimated record counts for a tenant (reads all namespaced keys). */
export const getTenantStats = (tenantId: string): Record<string, number> => {
  const keys: string[] = [
    "admin-leads", "admin-customers", "admin-suppliers", "admin-products",
    "admin-sales", "admin-purchase-orders", "admin-stock", "admin-hrm-staff",
  ];
  const result: Record<string, number> = {};
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(`t:${tenantId}:${k}`);
      const arr = raw ? JSON.parse(raw) : [];
      result[k] = Array.isArray(arr) ? arr.length : 0;
    } catch { result[k] = 0; }
  }
  return result;
};

// ─── Admin Users API ──────────────────────────────────────────────────────────
export type UserRole = "superadmin" | "admin" | "staff";

export type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  password: string;
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
  return getAdminUsers().find(u => u.id === id);
};

export const createAdminUser = (user: Omit<AdminUser, "id" | "createdAt" | "updatedAt">): AdminUser => {
  const newUser: AdminUser = {
    ...user,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setGlobal(USERS_KEY, [...getAdminUsers(), newUser]);
  return newUser;
};

export const updateAdminUser = (id: string, updates: Partial<Omit<AdminUser, "id" | "createdAt">>): AdminUser => {
  const users = getAdminUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) throw new Error("User not found");
  users[index] = { ...users[index], ...updates, updatedAt: new Date().toISOString() };
  setGlobal(USERS_KEY, users);
  return users[index];
};

export const deleteAdminUser = (id: string): void => {
  setGlobal(USERS_KEY, getAdminUsers().filter(u => u.id !== id));
};

// ─── Team Members API (for New Document "Prepared By") ───────────────────────
const TEAM_KEY = "admin-team-members";
const DEFAULT_TEAM = ["Ali Raza", "Umar Farooq", "Hassan Sheikh", "Bilal Ahmed", "Zainab Mirza", "Sara Qureshi"];

export const getTeamMembers = (): string[] => {
  try {
    const raw = localStorage.getItem(tenantKey(TEAM_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const sk = tenantKey(TEAM_KEY);
  localStorage.setItem(sk, JSON.stringify(DEFAULT_TEAM));
  _apiWrite(sk, DEFAULT_TEAM);
  return DEFAULT_TEAM;
};

// ─── Products (catalogue) API ─────────────────────────────────────────────────
export type ProductStatus    = "Active" | "Inactive" | "Draft";
export type ProductCondition = "New" | "Used" | "Fresh" | "Refurbished" | "Damaged";

export type Product = {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  unit: string;
  purchasePrice?: string;    // Purchase price (from supplier)
  costPrice?: string;        // Cost price per unit (internal cost including overheads)
  price: string;             // Sale price per unit
  description: string;
  status: ProductStatus;
  condition?: ProductCondition; // Physical condition of the product
  thumbnail?: string;
  images?: string[];
  createdAt: string;
  updatedAt: string;
};

const PRODUCTS_KEY = "admin-products";

export const getProducts = (): Product[] => getStored<Product>(PRODUCTS_KEY);

// ── SKU uniqueness helper ──────────────────────────────────────────────────
const skuConflict = (sku: string, excludeId?: string): string | null => {
  if (!sku.trim()) return null;
  const match = getProducts().find(
    p => p.sku.trim().toLowerCase() === sku.trim().toLowerCase() && p.id !== excludeId
  );
  return match ? match.name : null;
};

export const createProduct = (data: Omit<Product, "id" | "createdAt" | "updatedAt">): Product => {
  if (data.sku?.trim()) {
    const conflict = skuConflict(data.sku);
    if (conflict) throw new Error(`SKU "${data.sku}" is already used by "${conflict}".`);
  }
  const item: Product = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(PRODUCTS_KEY, [...getProducts(), item]);
  addActivity({ action: "created", entity: "Product", entityName: item.name, detail: item.sku ? `SKU: ${item.sku}` : undefined });
  return item;
};

export const updateProduct = (id: string, updates: Partial<Omit<Product, "id" | "createdAt">>): Product => {
  const items = getProducts();
  const i = items.findIndex(p => p.id === id);
  if (i === -1) throw new Error("Product not found");
  if (updates.sku?.trim()) {
    const conflict = skuConflict(updates.sku, id);
    if (conflict) throw new Error(`SKU "${updates.sku}" is already used by "${conflict}".`);
  }
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(PRODUCTS_KEY, items);
  addActivity({ action: "updated", entity: "Product", entityName: items[i].name });
  return items[i];
};

export const deleteProduct = (id: string): void => {
  const item = getProducts().find(p => p.id === id);
  setStored(PRODUCTS_KEY, getProducts().filter(p => p.id !== id));
  addActivity({ action: "deleted", entity: "Product", entityName: item?.name || id });
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

// ─── Attributes API ───────────────────────────────────────────────────────────
export type AttributeType = "text" | "number" | "boolean" | "select";

export type Attribute = {
  id: string;
  name: string;
  type: AttributeType;
  values: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

const ATTRIBUTES_KEY = "admin-attributes";

export const getAttributes = (): Attribute[] => getStored<Attribute>(ATTRIBUTES_KEY);

export const createAttribute = (data: Omit<Attribute, "id" | "createdAt" | "updatedAt">): Attribute => {
  const item: Attribute = {
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
  productId?:  string;   // linked Product id
  rmId?:       string;   // linked RawMaterial id
  productName: string;
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
      let pi = item.productId ? allProducts.findIndex(p => p.id === item.productId) : -1;
      if (pi === -1) pi = allProducts.findIndex(p => p.name.toLowerCase().trim() === item.productName.toLowerCase().trim());
      const product = pi >= 0 ? allProducts[pi] : undefined;

      // Auto-update purchasePrice from PO line unit price (user can still override manually)
      if (pi >= 0 && item.unitPrice && parseFloat(item.unitPrice) > 0) {
        allProducts[pi] = { ...allProducts[pi], purchasePrice: item.unitPrice, updatedAt: new Date().toISOString() };
      }

      const sku = product?.sku || item.productName.toLowerCase().replace(/\s+/g, "-");

      // Consolidate: find existing Available stock entry in Warehouse for this SKU
      const allStocks = getStock();
      const si = allStocks.findIndex(s => s.sku === sku && s.store === "Warehouse" && s.stockType === "For Sale");
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
        // Create new stock entry
        const newStock = createStockItem({
          productName:  item.productName,
          sku,
          store:        "Warehouse",
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
    const je = autoPostPurchaseJE({
      poNumber:  order.poNumber,
      supplier:  order.supplier || "Supplier",
      date:      today,
      total:     poTotal,
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
export const SALE_STATUSES  = ["Draft", "Completed", "On Credit", "Refunded", "Cancelled"] as const;
export type SaleStatus = typeof SALE_STATUSES[number];

export const SALE_PAYMENTS  = ["Cash", "Card", "Bank Transfer", "Cheque", "Credit"] as const;
export type SalePayment = typeof SALE_PAYMENTS[number];

export const ITEM_STATUSES = ["Reserved", "Delivered", "Pending"] as const;
export type ItemStatus = typeof ITEM_STATUSES[number];

export type SaleItem = {
  id: string;
  productName: string; // locked — sourced from Products master
  sku: string;         // locked — sourced from Products master
  qty: string;
  unit: string;
  unitPrice: string;
  discount: string;    // percentage 0-100
  notes: string;
  itemStatus: ItemStatus; // per-line delivery status
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
  createdAt: string;
  updatedAt: string;
};

const SALES_KEY = "admin-sales";

const nextSaleNumber = (): string => {
  const existing = getStored<Sale>(SALES_KEY);
  const d = new Date();
  const prefix = `SAL-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const max = existing
    .filter(s => s.saleNumber.startsWith(prefix))
    .map(s => parseInt(s.saleNumber.split("-").pop() ?? "0") || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
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

export const createStockItem = (data: Omit<StockItem, "id" | "createdAt" | "updatedAt">): StockItem => {
  const item: StockItem = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  setStored(STOCK_KEY, [...getStock(), item]);
  return item;
};

export const updateStockItem = (id: string, updates: Partial<Omit<StockItem, "id" | "createdAt">>): StockItem => {
  const items = getStock();
  const i = items.findIndex(s => s.id === id);
  if (i === -1) throw new Error("Stock item not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(STOCK_KEY, items);
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
  | "manual-adjustment";

export const LEDGER_TX_LABELS: Record<LedgerTxType, string> = {
  "purchase-receipt": "Purchase Receipt",
  "sale":             "Sale",
  "sale-refund":      "Sale Refund",
  "mfg-input":        "Mfg. Consumed",
  "mfg-output":       "Mfg. Produced",
  "manual-adjustment":"Manual Adjustment",
};

export type StockLedgerEntry = {
  id:          string;
  entityType:  "product" | "raw-material";
  entityId:    string;      // StockItem.id or RawMaterial.id
  entityName:  string;
  date:        string;      // YYYY-MM-DD
  txType:      LedgerTxType;
  reference:   string;      // PO-001, SALE-001, MO-001
  qtyBefore:   number;
  qtyChange:   number;      // positive = IN, negative = OUT
  qtyAfter:    number;
  unit:        string;
  notes:       string;
  createdAt:   string;
};

const LEDGER_KEY = "admin-stock-ledger";

export const getStockLedger     = (): StockLedgerEntry[] => getStored<StockLedgerEntry>(LEDGER_KEY);
export const getEntityLedger    = (entityId: string) => getStockLedger().filter(e => e.entityId === entityId);
export const clearEntityLedger  = (entityId: string) => setStored(LEDGER_KEY, getStockLedger().filter(e => e.entityId !== entityId));

function batchLedger(entries: Omit<StockLedgerEntry, "id" | "createdAt">[]) {
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const full: StockLedgerEntry[] = entries.map(e => ({ ...e, id: crypto.randomUUID(), createdAt: now }));
  setStored(LEDGER_KEY, [...getStockLedger(), ...full]);
}

export const addManualLedgerEntry = (entry: Omit<StockLedgerEntry, "id" | "createdAt">) => {
  batchLedger([entry]);
};

// ─── Stock Mutations (with Ledger) ────────────────────────────────────────────
export const deductStockForSale = (saleItems: SaleItem[], reference = ""): void => {
  const stocks = getStock();
  const today  = new Date().toISOString().slice(0, 10);
  const ledger: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  saleItems.forEach(item => {
    if (!item.sku) return;
    let remaining = parseFloat(item.qty) || 0;
    for (let i = 0; i < stocks.length && remaining > 0; i++) {
      if (stocks[i].sku !== item.sku) continue;
      const current = Math.max(0, parseFloat(stocks[i].quantity) || 0);
      const deduct  = Math.min(current, remaining);
      stocks[i] = { ...stocks[i], quantity: String(current - deduct), updatedAt: new Date().toISOString() };
      remaining -= deduct;
      if (deduct > 0) ledger.push({
        entityType: "product", entityId: stocks[i].id, entityName: stocks[i].productName,
        date: today, txType: "sale", reference,
        qtyBefore: current, qtyChange: -deduct, qtyAfter: current - deduct,
        unit: stocks[i].unit, notes: reference ? `Sale ${reference}` : "Sale",
      });
    }
  });

  setStored(STOCK_KEY, stocks);
  batchLedger(ledger);
};

export const restoreStockForSale = (saleItems: SaleItem[], reference = ""): void => {
  const stocks = getStock();
  const today  = new Date().toISOString().slice(0, 10);
  const ledger: Omit<StockLedgerEntry, "id" | "createdAt">[] = [];

  saleItems.forEach(item => {
    if (!item.sku) return;
    const qty = parseFloat(item.qty) || 0;
    const i = stocks.findIndex(s => s.sku === item.sku);
    if (i >= 0) {
      const current = Math.max(0, parseFloat(stocks[i].quantity) || 0);
      stocks[i] = { ...stocks[i], quantity: String(current + qty), updatedAt: new Date().toISOString() };
      if (qty > 0) ledger.push({
        entityType: "product", entityId: stocks[i].id, entityName: stocks[i].productName,
        date: today, txType: "sale-refund", reference,
        qtyBefore: current, qtyChange: qty, qtyAfter: current + qty,
        unit: stocks[i].unit, notes: reference ? `Refund ${reference}` : "Sale Refund",
      });
    }
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
  buyerPhone:        string;
  buyerEmail:        string;
  // Status & payment
  status:            InvoiceStatus;
  paymentMethod:     SalePayment;
  paymentTerms:      string;    // e.g. "Net 30", "Due on receipt"
  bankDetails:       string;    // bank account details for payment
  amountPaid:        string;
  paidAt:            string;    // ISO timestamp; "" if unpaid
  paymentHistory:    PaymentRecord[];
  // Items & pricing
  items:             SaleItem[];
  taxRate:           string;    // percentage string e.g. "20"
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
  createdAt:         string;
  updatedAt:         string;
};

const INVOICES_KEY = "admin-invoices";

const nextInvoiceNumber = (type: "sale" | "purchase" = "sale"): string => {
  const existing = getStored<Invoice>(INVOICES_KEY);
  const d = new Date();
  const base = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = type === "purchase" ? `PINV-${base}` : `INV-${base}`;
  const max = existing
    .filter(inv => inv.invoiceNumber.startsWith(prefix))
    .map(inv => parseInt(inv.invoiceNumber.split("-").pop() ?? "0") || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
};

export const getInvoices = (): Invoice[] => getStored<Invoice>(INVOICES_KEY);

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
  region:         string;   // territory / area they cover
  commissionRate: string;   // percentage e.g. "5"
  targetAmount:   string;   // monthly sales target (in base currency)
  status:           SalesAgentStatus;
  joinDate:         string;   // YYYY-MM-DD
  notes:            string;
  ledgerAccountId?: string;  // auto-created subsidiary ledger under Sales Commission
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
  return rm;
};

export const updateRawMaterial = (id: string, updates: Partial<Omit<RawMaterial, "id" | "createdAt">>): RawMaterial => {
  const rms = getRawMaterials();
  const i = rms.findIndex(r => r.id === id);
  if (i === -1) throw new Error("Raw material not found");
  rms[i] = { ...rms[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(RM_KEY, rms);
  addActivity({ action: "updated", entity: "RawMaterial", entityName: rms[i].name });
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

export type AppSettings = {
  companyName:          string;
  companyTagline:       string;
  logoBase64:           string;
  emailHull:            string;
  emailIslamabad:       string;
  phoneHull:            string;
  phoneIslamabad:       string;
  addressHull:          string;
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
  bankDetails:          string;   // bank name, account no, sort code, IBAN, etc.
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
};

export const DEFAULT_SETTINGS: AppSettings = {
  companyName:          "Onesoft",
  companyTagline:       "Software & IT Solutions",
  logoBase64:           "",
  emailHull:            "",
  emailIslamabad:       "",
  phoneHull:            "",
  phoneIslamabad:       "",
  addressHull:          "Hull, UK",
  addressIslamabad:     "Islamabad, Pakistan",
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
  companyRegistration:  "",
  socialLinks:          "",
  invoiceTerms:         "Payment is due within 30 days of the invoice date.",
  invoiceFooter:        "",
  accSalesRevenue:      "",
  accCash:              "",
  accBank:              "",
  accReceivable:        "",
  accVatPayable:        "",
  accCogs:              "",
  accInventory:         "",
  accPurchasePayable:   "",
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(tenantKey(SETTINGS_KEY));
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
      return merged;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: AppSettings): void {
  const sk = tenantKey(SETTINGS_KEY);
  localStorage.setItem(sk, JSON.stringify(s));
  _apiWrite(sk, s);
}

// All localStorage keys for export/import/reset
export const ALL_STORE_KEYS = [
  "admin-leads", "admin-req-docs", "admin-customers", "admin-suppliers",
  "admin-products", "admin-product-categories", "admin-brands", "admin-attributes",
  "admin-units", "admin-purchase-orders", "admin-stock", "admin-sales", "admin-invoices",
  "admin-hrm-staff", "admin-hrm-roles", "admin-users", "admin-team-members",
  "admin-settings", "admin-journal-entries", "admin-stock-ledger",
] as const;

export type StoreKey = typeof ALL_STORE_KEYS[number];

export const MODULE_KEYS: Record<string, StoreKey[]> = {
  CRM:                  ["admin-leads", "admin-customers", "admin-suppliers"],
  Products:             ["admin-products", "admin-product-categories", "admin-brands", "admin-attributes", "admin-units"],
  Stock:                ["admin-stock"],
  Purchases:            ["admin-purchase-orders"],
  Sales:                ["admin-sales", "admin-invoices"],
  Documents:            ["admin-req-docs"],
  HRM:                  ["admin-hrm-staff", "admin-hrm-roles"],
  Users:                ["admin-users"],
  "Stock Ledger History": ["admin-stock-ledger"],
};

/**
 * Resets the accounting ledger to zero:
 *  1. Deletes all journal entries.
 *  2. Resets every COA account's opening balance to 0.
 * The Chart of Accounts structure (accounts, groups) is preserved.
 */
export function clearAccountingLedger(): void {
  // 1 — wipe journal entries
  const jeKey = tenantKey(JE_KEY);
  localStorage.removeItem(jeKey);
  _apiWrite(jeKey, []);

  // 2 — reset opening balances to 0 on all COA accounts
  const coaKey = tenantKey(COA_KEY);
  const accounts = getAccounts().map(a => ({ ...a, openingBalance: 0 }));
  localStorage.setItem(coaKey, JSON.stringify(accounts));
  _apiWrite(coaKey, accounts);
}

export const addTeamMember = (name: string): string[] => {
  const current = getTeamMembers();
  if (current.includes(name)) return current;
  const updated = [...current, name];
  const sk = tenantKey(TEAM_KEY);
  localStorage.setItem(sk, JSON.stringify(updated));
  _apiWrite(sk, updated);
  return updated;
};

export const removeTeamMember = (name: string): string[] => {
  const updated = getTeamMembers().filter(m => m !== name);
  const sk = tenantKey(TEAM_KEY);
  localStorage.setItem(sk, JSON.stringify(updated));
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
  AP_GROUP:           "sys-2100",   // Accounts Payable GROUP (2110) — parent for per-supplier ledgers
  AP_TRADE:           "sys-2101",   // Trade Payables LEDGER (2111)
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
  // Equity
  EQUITY_GROUP:       "sys-5000",   // Capital & Equity root (5000)
  OWNERS_CAPITAL:     "sys-5100",   // Owner's Capital / Share Capital (5100)
  RETAINED_EARN:      "sys-5200",   // Retained Earnings (5200)
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
  { id: SYS_ACCS.CASH,               code: "1110", name: "Cash in Hand",               head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.CURRENT_ASSETS,      subType: "Cash",             description: "Physical cash on premises" },
  { id: SYS_ACCS.BANK,               code: "1120", name: "Bank Account",               head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.CURRENT_ASSETS,      subType: "Bank",             description: "Business bank account" },
  { id: SYS_ACCS.AR_GROUP,           code: "1130", name: "Accounts Receivable",        head: "Assets",           accountType: "Group",  parentId: SYS_ACCS.CURRENT_ASSETS,      subType: "Receivable",       description: "Amounts owed by customers & buyers" },
  { id: SYS_ACCS.AR_TRADE,           code: "1131", name: "Trade Receivables",          head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.AR_GROUP,            subType: "Receivable",       description: "General trade receivables ledger" },
  { id: SYS_ACCS.INVENTORY,          code: "1140", name: "Inventory / Stock",          head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.CURRENT_ASSETS,      subType: "Inventory",        description: "Stock & inventory value" },
  // Non-Current Assets
  { id: SYS_ACCS.NON_CURRENT_ASSETS, code: "1200", name: "Non-Current Assets",         head: "Assets",           accountType: "Group",  parentId: SYS_ACCS.ASSETS_ROOT,         subType: "Non-Current Asset", description: "Assets held for long-term use (over 12 months)" },
  { id: SYS_ACCS.PPE,                code: "1210", name: "Property, Plant & Equipment",head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.NON_CURRENT_ASSETS,  subType: "Fixed Asset",      description: "Tangible long-term assets — land, buildings, machinery" },
  { id: SYS_ACCS.ACCUM_DEPR,         code: "1220", name: "Accumulated Depreciation",   head: "Assets",           accountType: "Ledger", parentId: SYS_ACCS.NON_CURRENT_ASSETS,  subType: "Contra Asset",     description: "Cumulative depreciation on fixed assets (credit balance)" },

  // ─────────────────────────────────────────────────────────────────────────────
  // LIABILITIES  (IAS 1 — Current / Non-Current split)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.LIAB_ROOT,          code: "2000", name: "Liabilities",               head: "Liabilities",      accountType: "Group",  parentId: null,                         subType: "Liability",        description: "All obligations of the business" },
  // Current Liabilities
  { id: SYS_ACCS.CURRENT_LIAB,       code: "2100", name: "Current Liabilities",        head: "Liabilities",      accountType: "Group",  parentId: SYS_ACCS.LIAB_ROOT,           subType: "Current Liability", description: "Obligations due within 12 months" },
  { id: SYS_ACCS.AP_GROUP,           code: "2110", name: "Accounts Payable",           head: "Liabilities",      accountType: "Group",  parentId: SYS_ACCS.CURRENT_LIAB,        subType: "Payable",          description: "Amounts owed to suppliers" },
  { id: SYS_ACCS.AP_TRADE,           code: "2111", name: "Trade Payables",             head: "Liabilities",      accountType: "Ledger", parentId: SYS_ACCS.AP_GROUP,            subType: "Payable",          description: "General trade payables ledger" },
  { id: SYS_ACCS.VAT_PAYABLE,        code: "2120", name: "VAT Payable",                head: "Liabilities",      accountType: "Ledger", parentId: SYS_ACCS.CURRENT_LIAB,        subType: "Tax Payable",      description: "VAT / tax collected and owed to HMRC" },
  { id: SYS_ACCS.ACCRUED_EXP,        code: "2130", name: "Accrued Expenses",           head: "Liabilities",      accountType: "Ledger", parentId: SYS_ACCS.CURRENT_LIAB,        subType: "Accrued",          description: "Expenses incurred but not yet paid" },
  // Non-Current Liabilities
  { id: SYS_ACCS.NON_CURRENT_LIAB,   code: "2200", name: "Non-Current Liabilities",    head: "Liabilities",      accountType: "Group",  parentId: SYS_ACCS.LIAB_ROOT,           subType: "Non-Current Liability", description: "Obligations due after 12 months" },
  { id: SYS_ACCS.LT_LOANS,           code: "2210", name: "Long-term Loans",            head: "Liabilities",      accountType: "Ledger", parentId: SYS_ACCS.NON_CURRENT_LIAB,    subType: "Loan",             description: "Bank loans and borrowings due after 12 months" },

  // ─────────────────────────────────────────────────────────────────────────────
  // REVENUE / INCOME  (codes 3xxx — same as original system)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.REVENUE_GROUP,      code: "3000", name: "Revenue",                    head: "Revenue / Income", accountType: "Group",  parentId: null,                         subType: "Revenue",          description: "Income from business operations" },
  { id: SYS_ACCS.SALES_REVENUE,      code: "3100", name: "Sales Revenue",              head: "Revenue / Income", accountType: "Ledger", parentId: SYS_ACCS.REVENUE_GROUP,       subType: "Sales",            description: "Revenue from product and service sales" },
  { id: SYS_ACCS.OTHER_INCOME,       code: "3200", name: "Other Income",               head: "Revenue / Income", accountType: "Ledger", parentId: SYS_ACCS.REVENUE_GROUP,       subType: "Other Income",     description: "Miscellaneous or non-operating income" },

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPENSES  (codes 4xxx — same as original system)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.EXPENSES_GROUP,     code: "4000", name: "Operating Expenses",         head: "Expense",          accountType: "Group",  parentId: null,                         subType: "Expense",          description: "Day-to-day business expenditure" },
  { id: SYS_ACCS.COGS,               code: "4100", name: "Cost of Goods Sold",         head: "Expense",          accountType: "Ledger", parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "COGS",             description: "Direct cost of goods or services sold" },
  { id: SYS_ACCS.SALARY_GROUP,       code: "4200", name: "Salary & Wages",             head: "Expense",          accountType: "Group",  parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "Payroll",          description: "Employee salaries and wages" },
  { id: SYS_ACCS.COMMISSION_GROUP,   code: "4300", name: "Sales Commission",           head: "Expense",          accountType: "Group",  parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "Commission",       description: "Commission paid to sales agents" },
  { id: SYS_ACCS.OFFICE_EXP,         code: "4400", name: "Office & Admin Expenses",    head: "Expense",          accountType: "Ledger", parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "Admin",            description: "Office supplies, rent, admin costs" },
  { id: SYS_ACCS.UTILITIES,          code: "4500", name: "Utility Bills",              head: "Expense",          accountType: "Ledger", parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "Utilities",        description: "Electricity, gas, water, internet" },
  { id: SYS_ACCS.PURCHASE_EXP,       code: "4600", name: "Purchases",                  head: "Expense",          accountType: "Ledger", parentId: SYS_ACCS.EXPENSES_GROUP,      subType: "Purchases",        description: "Goods purchased for resale or use" },

  // ─────────────────────────────────────────────────────────────────────────────
  // EQUITY  (codes 5xxx — same as original system)
  // ─────────────────────────────────────────────────────────────────────────────
  { id: SYS_ACCS.EQUITY_GROUP,       code: "5000", name: "Capital & Equity",           head: "Equity",           accountType: "Group",  parentId: null,                         subType: "Equity",           description: "Owner's equity in the business" },
  { id: SYS_ACCS.OWNERS_CAPITAL,     code: "5100", name: "Owner's Capital",            head: "Equity",           accountType: "Ledger", parentId: SYS_ACCS.EQUITY_GROUP,        subType: "Capital",          description: "Funds invested by owners / shareholders" },
  { id: SYS_ACCS.RETAINED_EARN,      code: "5200", name: "Retained Earnings",          head: "Equity",           accountType: "Ledger", parentId: SYS_ACCS.EQUITY_GROUP,        subType: "Retained",         description: "Accumulated profits retained in the business" },
];

/**
 * Seeds system (default) accounts into the COA if they don't already exist,
 * then auto-populates the accounting settings mappings if not yet configured.
 * Safe to call multiple times — existing accounts/settings are never overwritten.
 */
export function seedDefaultCoaAccounts(): void {
  const existing = (() => {
    try {
      const raw = localStorage.getItem(tenantKey(COA_KEY));
      return raw ? (JSON.parse(raw) as Account[]) : [];
    } catch { return []; }
  })();

  const existingIds = new Set(existing.map(a => a.id));
  const now = new Date().toISOString();
  const toAdd: Account[] = [];

  for (const def of SYSTEM_ACCOUNTS) {
    if (existingIds.has(def.id)) continue;   // already seeded
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

  // ── Migration: restructure existing accounts to IFRS-compliant hierarchy ────
  // Detect old structure: sys-1000 (Current Assets) still has parentId = null
  const needsMigration = existing.some(a => a.id === SYS_ACCS.CURRENT_ASSETS && a.parentId === null);
  const migrations: Array<{ id: string; updates: Partial<Account> }> = needsMigration ? [
    // Assets: wire Current Assets under the new Assets root
    { id: SYS_ACCS.CURRENT_ASSETS, updates: { parentId: SYS_ACCS.ASSETS_ROOT, code: "1100" } },
    { id: SYS_ACCS.AR_GROUP,       updates: { code: "1130" } },
    { id: SYS_ACCS.AR_TRADE,       updates: { code: "1131" } },
    { id: SYS_ACCS.CASH,           updates: { code: "1110" } },
    { id: SYS_ACCS.BANK,           updates: { code: "1120" } },
    { id: SYS_ACCS.INVENTORY,      updates: { code: "1140" } },
    // Liabilities: wire Current Liabilities under the new Liabilities root
    { id: SYS_ACCS.CURRENT_LIAB,   updates: { parentId: SYS_ACCS.LIAB_ROOT, code: "2100" } },
    { id: SYS_ACCS.AP_GROUP,       updates: { code: "2110" } },
    { id: SYS_ACCS.AP_TRADE,       updates: { code: "2111" } },
    { id: SYS_ACCS.VAT_PAYABLE,    updates: { code: "2120" } },
  ] : [];

  let workingAccounts = [...existing, ...toAdd];

  if (migrations.length > 0) {
    workingAccounts = workingAccounts.map(acc => {
      const m = migrations.find(mg => mg.id === acc.id);
      return m ? { ...acc, ...m.updates, updatedAt: new Date().toISOString() } : acc;
    });
  }

  if (toAdd.length > 0 || migrations.length > 0) {
    const sk = tenantKey(COA_KEY);
    localStorage.setItem(sk, JSON.stringify(workingAccounts));
    _apiWrite(sk, workingAccounts);
  }

  // ── Auto-populate accounting settings (only fills missing mappings) ────────
  const s = getSettings();
  const mappingUpdates: Partial<AppSettings> = {};
  if (!s.accSalesRevenue) mappingUpdates.accSalesRevenue = SYS_ACCS.SALES_REVENUE;
  if (!s.accCash)         mappingUpdates.accCash         = SYS_ACCS.CASH;
  if (!s.accBank)         mappingUpdates.accBank         = SYS_ACCS.BANK;
  if (!s.accReceivable)   mappingUpdates.accReceivable   = SYS_ACCS.AR_TRADE;    // Ledger, not Group
  if (!s.accVatPayable)   mappingUpdates.accVatPayable   = SYS_ACCS.VAT_PAYABLE;
  if (!s.accCogs)              mappingUpdates.accCogs             = SYS_ACCS.COGS;
  if (!s.accInventory)         mappingUpdates.accInventory        = SYS_ACCS.INVENTORY;
  if (!s.accPurchasePayable)   mappingUpdates.accPurchasePayable  = SYS_ACCS.AP_TRADE;
  if (Object.keys(mappingUpdates).length > 0) {
    saveSettings({ ...s, ...mappingUpdates });
  }
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
      const raw = localStorage.getItem(tenantKey(COA_KEY));
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
  localStorage.setItem(sk, JSON.stringify(updated));
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
    const raw = localStorage.getItem(tenantKey(COA_KEY));
    if (raw) {
      const parsed: Account[] = JSON.parse(raw);
      // One-time migration: wipe legacy seed accounts, keep any user-added ones
      const userAccounts = parsed.filter(a => !LEGACY_SEED_IDS.has(a.id));
      if (userAccounts.length !== parsed.length) {
        localStorage.setItem(tenantKey(COA_KEY), JSON.stringify(userAccounts));
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
  localStorage.setItem(sk, JSON.stringify([]));
  _apiWrite(sk, []);
  return [];
}

function _saveAccounts(accounts: Account[]): void {
  const sk = tenantKey(COA_KEY);
  localStorage.setItem(sk, JSON.stringify(accounts));
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
    const raw = localStorage.getItem(tenantKey(JE_KEY));
    if (raw) return JSON.parse(raw) as JournalEntry[];
  } catch { /* ignore */ }
  return [];
}

function _saveJournalEntries(entries: JournalEntry[]): void {
  const sk = tenantKey(JE_KEY);
  localStorage.setItem(sk, JSON.stringify(entries));
  _apiWrite(sk, entries);
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
  _saveJournalEntries(getJournalEntries().filter(e => e.id !== id));
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
}): JournalEntry | null {
  const s = getSettings();

  // Must have a revenue account at minimum
  if (!s.accSalesRevenue) return null;

  // Determine the debit-side account
  const isCredit = params.paymentMethod === "Credit";
  const isCash   = params.paymentMethod === "Cash";
  let debitAccId: string;
  if (isCredit) {
    if (!s.accReceivable) return null;
    debitAccId = s.accReceivable;
  } else if (isCash) {
    if (!s.accCash) return null;
    debitAccId = s.accCash;
  } else {
    // Card, Bank Transfer, Cheque
    if (!s.accBank) return null;
    debitAccId = s.accBank;
  }

  const narration = `${params.source} – ${params.reference} – ${params.customer}`;

  // ── Revenue / Cash side ──────────────────────────────────────────────────
  const lines: JournalEntryLine[] = [
    {
      id: crypto.randomUUID(),
      ledgerId:  debitAccId,
      narration,
      debit:  params.grandTotal,
      credit: 0,
    },
    {
      id: crypto.randomUUID(),
      ledgerId:  s.accSalesRevenue,
      narration: `Revenue – ${params.reference}`,
      debit:  0,
      credit: params.subtotal,
    },
  ];

  // VAT line (only when a VAT payable account is configured and tax > 0)
  if (params.taxAmount > 0 && s.accVatPayable) {
    lines.push({
      id: crypto.randomUUID(),
      ledgerId:  s.accVatPayable,
      narration: `VAT – ${params.reference}`,
      debit:  0,
      credit: params.taxAmount,
    });
  }

  // ── COGS / Inventory side ────────────────────────────────────────────────
  // DR Cost of Goods Sold / CR Inventory — only when both accounts are
  // configured and there is a non-zero cost to recognise.
  const costTotal = params.costTotal ?? 0;
  if (costTotal > 0 && s.accCogs && s.accInventory) {
    lines.push({
      id: crypto.randomUUID(),
      ledgerId:  s.accCogs,
      narration: `COGS – ${params.reference}`,
      debit:  costTotal,
      credit: 0,
    });
    lines.push({
      id: crypto.randomUUID(),
      ledgerId:  s.accInventory,
      narration: `Inventory reduction – ${params.reference}`,
      debit:  0,
      credit: costTotal,
    });
  }

  const totalDebit  = parseFloat((params.grandTotal + costTotal).toFixed(2));
  const totalCredit = parseFloat((params.grandTotal + costTotal).toFixed(2));

  return createJournalEntry({
    date:        params.date,
    reference:   `AUTO-${params.reference}`,
    description: `${params.source} Sale: ${params.reference} – ${params.customer}`,
    lines,
    status:      "posted",
    totalDebit,
    totalCredit,
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
  poNumber: string;
  supplier: string;
  date:     string;   // YYYY-MM-DD
  total:    number;
}): JournalEntry | null {
  if (params.total <= 0) return null;
  const s = getSettings();
  if (!s.accInventory || !s.accPurchasePayable) return null;

  const narration = `Purchase Receipt – ${params.poNumber} – ${params.supplier}`;
  const lines: JournalEntryLine[] = [
    {
      id:        crypto.randomUUID(),
      ledgerId:  s.accInventory,
      narration: `Stock received – ${params.poNumber}`,
      debit:     params.total,
      credit:    0,
    },
    {
      id:        crypto.randomUUID(),
      ledgerId:  s.accPurchasePayable,
      narration,
      debit:     0,
      credit:    params.total,
    },
  ];

  return createJournalEntry({
    date:        params.date,
    reference:   `AUTO-${params.poNumber}`,
    description: `Purchase Receipt: ${params.poNumber} – ${params.supplier}`,
    lines,
    status:      "posted",
    totalDebit:  params.total,
    totalCredit: params.total,
    isBalanced:  true,
  });
}

// ─── Server sync ──────────────────────────────────────────────────────────────

/**
 * On login, fetch all stored data for the given namespace from PostgreSQL
 * and hydrate localStorage so the rest of the app works as normal.
 *
 * Called by auth-context after a successful login.
 */
export async function syncAllFromServer(tenantId: string | null): Promise<void> {
  try {
    // Always sync global data (users, tenants, module groups)
    const globalData = await kvGetAll("global");
    if (globalData) {
      for (const [key, value] of Object.entries(globalData)) {
        if (value !== undefined && value !== null) {
          localStorage.setItem(key, JSON.stringify(value));
        }
      }

      // ── One-time migration: push any global localStorage keys that are
      //    missing from the DB (created before PostgreSQL integration was added).
      for (let i = 0; i < localStorage.length; i++) {
        const lsKey = localStorage.key(i);
        if (!lsKey) continue;
        // Only global keys (no tenant prefix, starts with "admin-")
        if (lsKey.startsWith("t:") || !lsKey.startsWith("admin-")) continue;
        if (lsKey in globalData) continue; // already in DB, skip
        try {
          const raw = localStorage.getItem(lsKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            // Fire-and-forget migration write to DB
            kvPut("global", lsKey, parsed).catch(() => {});
          }
        } catch { /* ignore malformed entries */ }
      }
    }

    // Sync tenant-scoped data when a tenant is active
    if (tenantId) {
      const ns = `t:${tenantId}`;
      const tenantData = await kvGetAll(ns);
      if (tenantData) {
        for (const [key, value] of Object.entries(tenantData)) {
          if (value !== undefined && value !== null) {
            localStorage.setItem(`t:${tenantId}:${key}`, JSON.stringify(value));
          }
        }
      }
    }
  } catch {
    // Network unavailable — localStorage data (if any) will be used as fallback
  }
}
