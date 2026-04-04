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
