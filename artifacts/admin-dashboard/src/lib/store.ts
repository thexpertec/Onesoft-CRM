export type LeadStatus = "New" | "Contacted" | "Qualified" | "Proposal Sent" | "Won" | "Lost";

export type Lead = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  city: string;
  status: LeadStatus;
  source: string;
  notes: string;
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

// ─── Storage helpers ──────────────────────────────────────────────────────────
function getStored<T>(key: string): T[] {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error(`Error reading ${key} from localStorage`, e);
  }
  return [];
}

function setStored<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Leads API ────────────────────────────────────────────────────────────────
export const getLeads = (): Lead[] => getStored<Lead>(LEADS_KEY);
export const getLead = (id: string): Lead | undefined => getLeads().find(l => l.id === id);
export const createLead = (lead: Omit<Lead, "id" | "createdAt" | "updatedAt">): Lead => {
  const newLead: Lead = {
    ...lead,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(LEADS_KEY, [...getLeads(), newLead]);
  return newLead;
};
export const updateLead = (id: string, updates: Partial<Omit<Lead, "id" | "createdAt" | "updatedAt">>): Lead => {
  const leads = getLeads();
  const index = leads.findIndex(l => l.id === id);
  if (index === -1) throw new Error("Lead not found");
  const updatedLead = { ...leads[index], ...updates, updatedAt: new Date().toISOString() };
  leads[index] = updatedLead;
  setStored(LEADS_KEY, leads);
  return updatedLead;
};
export const deleteLead = (id: string): void => {
  setStored(LEADS_KEY, getLeads().filter(l => l.id !== id));
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
  createdAt: string;
  updatedAt: string;
};

const CUSTOMERS_KEY = "admin-customers";

export const getCustomers = (): Customer[] => getStored<Customer>(CUSTOMERS_KEY);
export const getCustomer = (id: string): Customer | undefined => getCustomers().find(c => c.id === id);

export const createCustomer = (data: Omit<Customer, "id" | "createdAt" | "updatedAt">): Customer => {
  const newCustomer: Customer = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(CUSTOMERS_KEY, [...getCustomers(), newCustomer]);
  return newCustomer;
};

export const updateCustomer = (id: string, updates: Partial<Omit<Customer, "id" | "createdAt">>): Customer => {
  const customers = getCustomers();
  const index = customers.findIndex(c => c.id === id);
  if (index === -1) throw new Error("Customer not found");
  customers[index] = { ...customers[index], ...updates, updatedAt: new Date().toISOString() };
  setStored(CUSTOMERS_KEY, customers);
  return customers[index];
};

export const deleteCustomer = (id: string): void => {
  setStored(CUSTOMERS_KEY, getCustomers().filter(c => c.id !== id));
};

export const convertLeadToCustomer = (lead: Lead): Customer => {
  return createCustomer({
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
  createdAt: string;
  updatedAt: string;
};

const SUPPLIERS_KEY = "admin-suppliers";

export const getSuppliers = (): Supplier[] => getStored<Supplier>(SUPPLIERS_KEY);

export const createSupplier = (data: Omit<Supplier, "id" | "createdAt" | "updatedAt">): Supplier => {
  const item: Supplier = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(SUPPLIERS_KEY, [...getSuppliers(), item]);
  return item;
};

export const updateSupplier = (id: string, updates: Partial<Omit<Supplier, "id" | "createdAt">>): Supplier => {
  const items = getSuppliers();
  const i = items.findIndex(s => s.id === id);
  if (i === -1) throw new Error("Supplier not found");
  items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
  setStored(SUPPLIERS_KEY, items);
  return items[i];
};

export const deleteSupplier = (id: string): void => {
  setStored(SUPPLIERS_KEY, getSuppliers().filter(s => s.id !== id));
};

// ─── Product Categories API ───────────────────────────────────────────────────
export type ProductCategory = {
  id: string;
  name: string;
  description: string;
  color: string;
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

// ─── Admin Users API ──────────────────────────────────────────────────────────
export type UserRole = "superadmin" | "admin";

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
    const raw = localStorage.getItem(USERS_KEY);
    const existing: AdminUser[] = raw ? JSON.parse(raw) : [];
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
      localStorage.setItem(USERS_KEY, JSON.stringify([superadmin, ...existing.filter(u => u.id !== "u-superadmin")]));
    }
  } catch { /* ignore */ }
}
ensureDefaultSuperadmin();

export const getAdminUsers = (): AdminUser[] => {
  ensureDefaultSuperadmin();
  return getStored<AdminUser>(USERS_KEY);
};

export const getAdminUserByUsername = (username: string): AdminUser | undefined =>
  getAdminUsers().find(u => u.username.toLowerCase() === username.toLowerCase());

export const getAdminUserById = (id: string): AdminUser | undefined =>
  getAdminUsers().find(u => u.id === id);

export const createAdminUser = (user: Omit<AdminUser, "id" | "createdAt" | "updatedAt">): AdminUser => {
  const newUser: AdminUser = {
    ...user,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setStored(USERS_KEY, [...getAdminUsers(), newUser]);
  return newUser;
};

export const updateAdminUser = (id: string, updates: Partial<Omit<AdminUser, "id" | "createdAt">>): AdminUser => {
  const users = getAdminUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) throw new Error("User not found");
  users[index] = { ...users[index], ...updates, updatedAt: new Date().toISOString() };
  setStored(USERS_KEY, users);
  return users[index];
};

export const deleteAdminUser = (id: string): void => {
  setStored(USERS_KEY, getAdminUsers().filter(u => u.id !== id));
};

// ─── Team Members API (for New Document "Prepared By") ───────────────────────
const TEAM_KEY = "admin-team-members";
const DEFAULT_TEAM = ["Ali Raza", "Umar Farooq", "Hassan Sheikh", "Bilal Ahmed", "Zainab Mirza", "Sara Qureshi"];

export const getTeamMembers = (): string[] => {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  localStorage.setItem(TEAM_KEY, JSON.stringify(DEFAULT_TEAM));
  return DEFAULT_TEAM;
};

export const addTeamMember = (name: string): string[] => {
  const current = getTeamMembers();
  if (current.includes(name)) return current;
  const updated = [...current, name];
  localStorage.setItem(TEAM_KEY, JSON.stringify(updated));
  return updated;
};

export const removeTeamMember = (name: string): string[] => {
  const updated = getTeamMembers().filter(m => m !== name);
  localStorage.setItem(TEAM_KEY, JSON.stringify(updated));
  return updated;
};
