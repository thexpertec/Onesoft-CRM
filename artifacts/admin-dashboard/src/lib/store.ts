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

const INITIAL_LEADS: Lead[] = [
  {
    id: "l-1",
    name: "Sarah Jenkins",
    company: "Hull Logistics Ltd",
    email: "s.jenkins@hulllogistics.co.uk",
    phone: "01482 123456",
    industry: "Logistics",
    city: "Hull",
    status: "New",
    source: "Website",
    notes: "Looking for a custom transport management system.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "l-2",
    name: "David Smith",
    company: "Smith & Co Accounting",
    email: "david@smithco.co.uk",
    phone: "07700 900123",
    industry: "Finance",
    city: "London",
    status: "Contacted",
    source: "Referral",
    notes: "Needs a secure client portal.",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "l-3",
    name: "Aisha Khan",
    company: "Crescent Retail",
    email: "akhan@crescentretail.pk",
    phone: "+92 300 1234567",
    industry: "Retail",
    city: "Islamabad",
    status: "Qualified",
    source: "LinkedIn",
    notes: "E-commerce platform rebuild required.",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  }
];

const INITIAL_DOCS: RequirementDoc[] = [
  {
    id: "d-1",
    title: "Transport Management System Requirements",
    clientName: "Sarah Jenkins",
    company: "Hull Logistics Ltd",
    email: "s.jenkins@hulllogistics.co.uk",
    phone: "01482 123456",
    industry: "Logistics",
    city: "Hull",
    status: "Draft",
    softwareType: "Web App",
    budget: "£25,000 - £50,000",
    startDate: "2024-03-01",
    deliveryDate: "2024-09-01",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: {}
  }
];

function getStored<T>(key: string, initial: T[]): T[] {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error(`Error reading ${key} from localStorage`, e);
  }
  localStorage.setItem(key, JSON.stringify(initial));
  return initial;
}

function setStored<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// Leads API
export const getLeads = (): Lead[] => getStored(LEADS_KEY, INITIAL_LEADS);
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
  
  const updatedLead = {
    ...leads[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  leads[index] = updatedLead;
  setStored(LEADS_KEY, leads);
  return updatedLead;
};
export const deleteLead = (id: string): void => {
  setStored(LEADS_KEY, getLeads().filter(l => l.id !== id));
};

// Docs API
export const getDocs = (): RequirementDoc[] => getStored(DOCS_KEY, INITIAL_DOCS);
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
  
  const updatedDoc = {
    ...docs[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  docs[index] = updatedDoc;
  setStored(DOCS_KEY, docs);
  return updatedDoc;
};
export const deleteDoc = (id: string): void => {
  setStored(DOCS_KEY, getDocs().filter(d => d.id !== id));
};
