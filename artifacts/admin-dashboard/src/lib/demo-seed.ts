/** ─────────────────────────────────────────────────────────────────────────────
 *  DEMO SEED — Premier Furnishings Ltd.
 *  Persists demo data directly to the PostgreSQL KV store.
 *  Safe to run multiple times (idempotent — clears old demo data first).
 * ──────────────────────────────────────────────────────────────────────────── */

import { kvPut, kvGet, kvDeleteNamespace } from "./api";
import { isTenantCached } from "./store";
import { productsApi, staffApi, staffRolesApi } from "./record-api";

/**
 * Keys that are bridged in `kv.ts` MIGRATED_KEY_TO_TABLE — direct KV writes
 * for these keys are invisible to readers (the bridge sources them from the
 * relational table). The demo seeder routes them through the per-record REST
 * endpoint instead.
 *
 * Keep this list in sync with MIGRATED_KEY_TO_TABLE in kv.ts (frontend-side
 * keys only). Listed by entity so future batches just add a line.
 */
const BRIDGED_KEY_TO_REST: Record<string, { create: (tid: string, body: unknown) => Promise<unknown> }> = {
  "admin-products":  { create: (tid, body) => productsApi.create(tid, body as Parameters<typeof productsApi.create>[1]) },
  "admin-hrm-staff": { create: (tid, body) => staffApi.create(tid, body as Parameters<typeof staffApi.create>[1]) },
  "admin-hrm-roles": { create: (tid, body) => staffRolesApi.create(tid, body as Parameters<typeof staffRolesApi.create>[1]) },
};

export const DEMO_TENANT_ID   = "demo-premier-2024";
export const DEMO_TENANT_SLUG = "premier-demo";

// ── helpers ──────────────────────────────────────────────────────────────────
const iso  = (daysAgo = 0): string => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString();
};
const ymd  = (daysAgo = 0): string => iso(daysAgo).slice(0, 10);

// Fixed date strings keyed by month offset from "today" (May 2026)
const D = {
  feb01:  "2026-02-01", feb10:  "2026-02-10", feb28:  "2026-02-28",
  mar01:  "2026-03-01", mar05:  "2026-03-05", mar10:  "2026-03-10",
  mar15:  "2026-03-15", mar20:  "2026-03-20", mar28:  "2026-03-28",
  apr01:  "2026-04-01", apr05:  "2026-04-05", apr10:  "2026-04-10",
  apr15:  "2026-04-15", apr20:  "2026-04-20", apr28:  "2026-04-28",
  may01:  "2026-05-01", may02:  "2026-05-02", may05:  "2026-05-05",
  may08:  "2026-05-08", may10:  "2026-05-10",
};

/** Returns a `put(baseKey, data)` scoped to a specific tenant — writes to DB. */
function makePut(tenantId: string) {
  const ns = `t:${tenantId}`;
  return (baseKey: string, data: unknown) => {
    const bridged = BRIDGED_KEY_TO_REST[baseKey];
    if (bridged && Array.isArray(data)) {
      // Bridged key: route every row through the per-record REST endpoint so
      // the relational table is populated. Tolerate 409 on idempotent reseed.
      for (const row of data as unknown[]) {
        bridged.create(tenantId, row).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (/HTTP 409/i.test(msg)) return;
          console.warn(`[demo-seed] ${baseKey} create failed:`, msg);
        });
      }
      return;
    }
    kvPut(ns, baseKey, data).catch(() => { /* silently ignore network errors */ });
  };
}

// ── public helpers ────────────────────────────────────────────────────────────
export function isDemoSeeded(): boolean {
  try {
    return getTenants().some(x => x.id === DEMO_TENANT_ID);
  } catch { return false; }
}

export function clearDemoTenant(): void {
  clearTenantData(DEMO_TENANT_ID);
}

/** Remove ALL data belonging to a given tenant from the DB namespace. */
export function clearTenantData(tenantId: string): void {
  kvDeleteNamespace(`t:${tenantId}`).catch(() => { /* silently ignore */ });
}

/** Returns true when the in-memory cache already holds data for the given tenant. */
export function isTenantDataSeeded(tenantId: string): boolean {
  return isTenantCached(tenantId);
}

/** Alias kept for backward compat */
export { isTenantDataSeeded as checkTenantSeeded };

// ─────────────────────────────────────────────────────────────────────────────
/** Creates the "Premier Furnishings" demo tenant and loads all demo data into it. */
export async function seedDemoTenant(): Promise<string> {
  clearDemoTenant();
  const tenant = {
    id: DEMO_TENANT_ID,
    name: "Premier Furnishings Ltd.",
    slug: DEMO_TENANT_SLUG,
    adminUsername: "premier",
    adminPassword: "Premier@2024",
    contactEmail: "admin@premierfurnishings.co.uk",
    status: "active",
    plan: "professional",
    createdAt: iso(90),
    updatedAt: iso(0),
  };
  // Always fetch the authoritative tenant list from the server — never rely on
  // a potentially stale in-memory copy that could silently drop tenants added
  // in another session since the last sync.
  const freshRaw = await kvGet("global", "admin-tenants");
  const existing: unknown[] = Array.isArray(freshRaw) ? freshRaw : [];
  await kvPut("global", "admin-tenants", [...existing.filter((x: unknown) => (x as { id?: string }).id !== DEMO_TENANT_ID), tenant]);
  seedDataIntoTenant(DEMO_TENANT_ID, "Premier Furnishings Ltd.");
  return DEMO_TENANT_ID;
}

// ─────────────────────────────────────────────────────────────────────────────
/** Load full demo data into ANY existing tenant without touching its tenant record. */
export function seedDataIntoTenant(tenantId: string, companyName = "Premier Furnishings Ltd."): void {
  clearTenantData(tenantId);
  const put = makePut(tenantId);

  // ── 1. SETTINGS ────────────────────────────────────────────────────────────
  put("admin-settings", {
    companyName,
    companyTagline: "Quality Furniture for Every Space",
    logoBase64: "",
    emailHull: "info@premierfurnishings.co.uk",
    emailIslamabad: "",
    phoneHull: "+44 1482 556 789",
    phoneIslamabad: "",
    addressHull: "14 Commerce Way, Hessle Road, Hull, HU1 2PQ, United Kingdom",
    addressIslamabad: "",
    website: "www.premierfurnishings.co.uk",
    currency: "GBP",
    vatRate: "20",
    vatNumber: "GB 123 4567 89",
    fiscalYearStart: "April",
    salePrefix: "SAL-",
    purchasePrefix: "PO-",
    defaultPaymentMethod: "Bank Transfer",
    receiptHeader: "Premier Furnishings Ltd. — VAT No: GB 123 4567 89",
    receiptFooter: "Thank you for choosing Premier Furnishings. E&OE.",
    taxOnPOS: true,
    termsAndConditions: "Payment is due within 30 days of invoice. Goods remain the property of Premier Furnishings Ltd. until payment is received in full.",
    privacyPolicy: "",
    legalDocuments: [],
    bankDetails: "Barclays Bank plc\nAccount Name: Premier Furnishings Ltd.\nSort Code: 20-44-33\nAccount No: 58971024\nIBAN: GB29 BARC 2044 3358 9710 24",
    companyRegistration: "Companies House No: 08345217",
    socialLinks: "",
    invoiceTerms: "Payment due within 30 days of invoice date. Late payments subject to 2% monthly interest.",
    invoiceFooter: "Premier Furnishings Ltd. | Registered in England & Wales No. 08345217 | VAT GB 123 4567 89",
    referenceDigits: 4,
    showInvoiceUnitConversion: false,
  });

  // ── 2. HRM ROLES ───────────────────────────────────────────────────────────
  put("admin-hrm-roles", [
    { id: "dp-role-001", color: "#3B82F6", name: "Production Team",  description: "Workshop and manufacturing floor staff", permissions: "manufacturing,stock,raw-materials", createdAt: iso(85), updatedAt: iso(85) },
    { id: "dp-role-002", color: "#10B981", name: "Sales Team",       description: "Customer-facing sales and account management", permissions: "sales,customers,leads,invoices", createdAt: iso(85), updatedAt: iso(85) },
    { id: "dp-role-003", color: "#8B5CF6", name: "Management",       description: "Directors and senior management with full access", permissions: "all", createdAt: iso(85), updatedAt: iso(85) },
    { id: "dp-role-004", color: "#F59E0B", name: "Finance",          description: "Accounts and finance team", permissions: "invoices,journal-entry,chart-of-accounts,purchases", createdAt: iso(85), updatedAt: iso(85) },
    { id: "dp-role-005", color: "#EF4444", name: "Warehouse",        description: "Stock receiving, dispatch and warehouse operations", permissions: "stock,purchases,raw-materials", createdAt: iso(85), updatedAt: iso(85) },
  ]);

  // ── 3. STAFF ───────────────────────────────────────────────────────────────
  put("admin-hrm-staff", [
    { id: "dp-stf-001", name: "David Clarke",    department: "Production", designation: "Production Manager",    role: "Management",      status: "Active",    email: "d.clarke@premierfurnishings.co.uk",    phone: "+44 7700 100001", joinDate: ymd(730), notes: "15 years in furniture manufacturing.", username: "d.clarke",    password: "David@2024",    loginEnabled: true,  createdAt: iso(730), updatedAt: iso(0)  },
    { id: "dp-stf-002", name: "Lucy Hargreaves", department: "Sales",      designation: "Sales Manager",          role: "Sales Team",      status: "Active",    email: "l.hargreaves@premierfurnishings.co.uk", phone: "+44 7700 100002", joinDate: ymd(548), notes: "Manages key accounts across Yorkshire.", username: "l.hargreaves", password: "Lucy@2024",     loginEnabled: true,  createdAt: iso(548), updatedAt: iso(0)  },
    { id: "dp-stf-003", name: "Ahmed Malik",     department: "Warehouse",  designation: "Warehouse Supervisor",   role: "Warehouse",       status: "Active",    email: "a.malik@premierfurnishings.co.uk",     phone: "+44 7700 100003", joinDate: ymd(400), notes: "Oversees goods-in and dispatch.", username: "a.malik",     password: "Ahmed@2024",    loginEnabled: true,  createdAt: iso(400), updatedAt: iso(0)  },
    { id: "dp-stf-004", name: "Rachel Foster",   department: "Finance",    designation: "Accountant",             role: "Finance",         status: "Active",    email: "r.foster@premierfurnishings.co.uk",    phone: "+44 7700 100004", joinDate: ymd(365), notes: "CIMA qualified. Handles VAT returns.", username: "r.foster",    password: "Rachel@2024",   loginEnabled: true,  createdAt: iso(365), updatedAt: iso(0)  },
    { id: "dp-stf-005", name: "Tom Blackwood",   department: "HR",         designation: "HR Manager",             role: "Management",      status: "Active",    email: "t.blackwood@premierfurnishings.co.uk", phone: "+44 7700 100005", joinDate: ymd(300), notes: "Manages recruitment and staff welfare.", username: "t.blackwood", password: "Tom@2024",      loginEnabled: false, createdAt: iso(300), updatedAt: iso(0)  },
    { id: "dp-stf-006", name: "Sophie Barker",   department: "Production", designation: "Senior Joiner",          role: "Production Team", status: "Active",    email: "s.barker@premierfurnishings.co.uk",    phone: "+44 7700 100006", joinDate: ymd(260), notes: "Specialist in oak and hardwood joinery.", createdAt: iso(260), updatedAt: iso(0) },
    { id: "dp-stf-007", name: "Marcus Webb",     department: "Sales",      designation: "Account Executive",      role: "Sales Team",      status: "On Leave",  email: "m.webb@premierfurnishings.co.uk",      phone: "+44 7700 100007", joinDate: ymd(200), notes: "On paternity leave until end of month.", createdAt: iso(200), updatedAt: iso(14) },
    { id: "dp-stf-008", name: "Claire Hughes",   department: "Finance",    designation: "Finance Assistant",      role: "Finance",         status: "Active",    email: "c.hughes@premierfurnishings.co.uk",    phone: "+44 7700 100008", joinDate: ymd(180), notes: "Handles purchase ledger and expenses.", createdAt: iso(180), updatedAt: iso(0) },
  ]);

  // ── 4. SALES AGENTS ────────────────────────────────────────────────────────
  put("admin-sales-agents", [
    { id: "dp-sa-001", agentCode: "SA-001", name: "Sarah Mitchell",  email: "sarah.mitchell@agents.co.uk",  phone: "+44 7911 200001", region: "Yorkshire & Humber",   commissionRate: "5",   targetAmount: "45000", status: "Active",   joinDate: ymd(400), notes: "Top performer Q1 2024.",              createdAt: iso(400), updatedAt: iso(0) },
    { id: "dp-sa-002", agentCode: "SA-002", name: "James Thornton",  email: "james.thornton@agents.co.uk",  phone: "+44 7911 200002", region: "North East England",    commissionRate: "4",   targetAmount: "38000", status: "Active",   joinDate: ymd(350), notes: "Covers Durham, Newcastle, Sunderland.", createdAt: iso(350), updatedAt: iso(0) },
    { id: "dp-sa-003", agentCode: "SA-003", name: "Emma Whitfield",  email: "emma.whitfield@agents.co.uk",  phone: "+44 7911 200003", region: "Online & National",     commissionRate: "3.5", targetAmount: "30000", status: "Active",   joinDate: ymd(200), notes: "Manages B2B online orders.",           createdAt: iso(200), updatedAt: iso(0) },
    { id: "dp-sa-004", agentCode: "SA-004", name: "Ranjit Dhaliwal", email: "ranjit.dhaliwal@agents.co.uk", phone: "+44 7911 200004", region: "West Yorkshire",        commissionRate: "4.5", targetAmount: "42000", status: "Inactive", joinDate: ymd(500), notes: "Temporarily suspended — review pending.", createdAt: iso(500), updatedAt: iso(30) },
  ]);

  // ── 5. BRANDS ──────────────────────────────────────────────────────────────
  put("admin-brands", [
    { id: "dp-br-001", name: "Premier Classic", color: "#78350F", website: "www.premierfurnishings.co.uk/classic",    description: "Traditional hardwood furniture crafted in Hull",     status: "Active", createdAt: iso(80), updatedAt: iso(0) },
    { id: "dp-br-002", name: "ModernLine",      color: "#1D4ED8", website: "www.premierfurnishings.co.uk/modernline", description: "Contemporary minimalist office and dining furniture", status: "Active", createdAt: iso(80), updatedAt: iso(0) },
    { id: "dp-br-003", name: "ErgoPlus",        color: "#059669", website: "www.premierfurnishings.co.uk/ergoplus",   description: "Ergonomic seating solutions for workplace wellbeing", status: "Active", createdAt: iso(80), updatedAt: iso(0) },
  ]);

  // ── 6. PRODUCT CATEGORIES ──────────────────────────────────────────────────
  put("admin-product-categories", [
    { id: "dp-cat-001", name: "Seating",         description: "Chairs, sofas and seating solutions",     color: "#F59E0B", createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-cat-002", name: "Tables & Desks",  description: "Dining tables, coffee tables and desks",  color: "#3B82F6", createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-cat-003", name: "Storage",         description: "Wardrobes, bookcases and filing cabinets", color: "#8B5CF6", createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-cat-004", name: "Bedroom",         description: "Bedroom furniture and accessories",        color: "#EC4899", createdAt: iso(78), updatedAt: iso(0) },
  ]);

  // ── 7. UNITS ───────────────────────────────────────────────────────────────
  put("admin-units", [
    { id: "dp-unit-001", name: "Piece",        symbol: "pcs", description: "Individual item",           createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-002", name: "Set",          symbol: "set", description: "A matched set of items",    createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-003", name: "Metre",        symbol: "m",   description: "Linear metre",              createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-004", name: "Square Metre", symbol: "m²",  description: "Area in square metres",     createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-005", name: "Kilogram",     symbol: "kg",  description: "Weight in kilograms",       createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-006", name: "Box",          symbol: "box", description: "Box / carton of items",     createdAt: iso(78), updatedAt: iso(0) },
  ]);

  // ── 8. PRODUCTS ────────────────────────────────────────────────────────────
  put("admin-products", [
    { id: "dp-prod-001", name: "Executive Office Chair",     sku: "EXC-CHAIR-001", brand: "ErgoPlus",        category: "Seating",        unit: "pcs", purchasePrice: "149.00", costPrice: "165.00", price: "299.99", description: "Fully adjustable executive chair with lumbar support, mesh back and padded armrests.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(5)  },
    { id: "dp-prod-002", name: "Height Adjustable Desk",     sku: "HGT-DESK-002",  brand: "ModernLine",      category: "Tables & Desks", unit: "pcs", purchasePrice: "220.00", costPrice: "240.00", price: "449.99", description: "Electric sit-stand desk with memory settings, cable management tray and oak top.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(5)  },
    { id: "dp-prod-003", name: "3-Door Oak Wardrobe",        sku: "OAK-WRD-003",   brand: "Premier Classic", category: "Bedroom",        unit: "pcs", purchasePrice: "380.00", costPrice: "420.00", price: "699.00", description: "Solid oak 3-door wardrobe with hanging rail, two shelves and soft-close doors.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(3)  },
    { id: "dp-prod-004", name: "Solid Oak Coffee Table",     sku: "OAK-COF-004",   brand: "Premier Classic", category: "Tables & Desks", unit: "pcs", purchasePrice: "95.00",  costPrice: "108.00", price: "189.00", description: "Hand-crafted solid oak coffee table with lower shelf and satin finish.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(2)  },
    { id: "dp-prod-005", name: "5-Shelf Bookcase",           sku: "BCK-5SH-005",   brand: "Premier Classic", category: "Storage",        unit: "pcs", purchasePrice: "72.00",  costPrice: "84.00",  price: "149.99", description: "Tall 5-shelf open bookcase in natural oak veneer. Adjustable shelves.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(2)  },
    { id: "dp-prod-006", name: "6-Seat Dining Table Set",    sku: "DIN-SET-006",   brand: "ModernLine",      category: "Tables & Desks", unit: "set", purchasePrice: "450.00", costPrice: "495.00", price: "849.00", description: "Extending dining table with 6 upholstered chairs in a modern Scandi style.", status: "Active", condition: "New", createdAt: iso(70), updatedAt: iso(1)  },
    { id: "dp-prod-007", name: "L-Shape Corner Sofa",        sku: "COR-SOF-007",   brand: "ErgoPlus",        category: "Seating",        unit: "pcs", purchasePrice: "620.00", costPrice: "680.00", price: "1199.00", description: "Large L-shaped corner sofa in premium grey fabric with chaise and storage ottoman.", status: "Active", condition: "New", createdAt: iso(70), updatedAt: iso(1)  },
    { id: "dp-prod-008", name: "Bedside Cabinet (2-Drawer)", sku: "BDS-CAB-008",   brand: "Premier Classic", category: "Bedroom",        unit: "pcs", purchasePrice: "62.00",  costPrice: "74.00",  price: "129.00", description: "Solid oak 2-drawer bedside cabinet with soft-close drawers and brass handles.", status: "Active", condition: "New", createdAt: iso(70), updatedAt: iso(0)  },
    { id: "dp-prod-009", name: "4-Drawer Filing Cabinet",    sku: "FIL-CAB-009",   brand: "ModernLine",      category: "Storage",        unit: "pcs", purchasePrice: "138.00", costPrice: "155.00", price: "279.00", description: "Steel 4-drawer lateral filing cabinet with anti-tilt lock and label holders.", status: "Active", condition: "New", createdAt: iso(70), updatedAt: iso(0)  },
    { id: "dp-prod-010", name: "Ergonomic Meeting Chair",    sku: "MTG-CHR-010",   brand: "ErgoPlus",        category: "Seating",        unit: "pcs", purchasePrice: "95.00",  costPrice: "108.00", price: "199.99", description: "Stackable meeting room chair with upholstered seat and chrome legs.", status: "Active", condition: "New", createdAt: iso(65), updatedAt: iso(0)  },
    { id: "dp-prod-011", name: "Standing Desk Converter",    sku: "STD-CNV-011",   brand: "ModernLine",      category: "Tables & Desks", unit: "pcs", purchasePrice: "88.00",  costPrice: "99.00",  price: "179.00", description: "Desktop riser for converting any desk to a standing workstation. Dual-monitor support.", status: "Active", condition: "New", createdAt: iso(60), updatedAt: iso(0)  },
    { id: "dp-prod-012", name: "Wooden Display Shelving",    sku: "WDS-SHF-012",   brand: "Premier Classic", category: "Storage",        unit: "pcs", purchasePrice: "55.00",  costPrice: "64.00",  price: "119.00", description: "Wall-mounted floating display shelf in solid oak. 120cm wide.", status: "Draft",  condition: "New", createdAt: iso(55), updatedAt: iso(10) },
  ]);

  // ── 9. RAW MATERIALS ───────────────────────────────────────────────────────
  put("admin-raw-materials", [
    { id: "dp-rm-001", rmCode: "RM-001", name: "Oak Timber Board",       unit: "m²",    currentStock: "448", costPerUnit: "12.50", notes: "Grade A solid oak from sustainably managed forests (FSC certified).",  createdAt: iso(85), updatedAt: iso(5)  },
    { id: "dp-rm-002", rmCode: "RM-002", name: "Steel Tubing",           unit: "m",     currentStock: "374", costPerUnit: "4.80",  notes: "25mm diameter cold-rolled steel tubing for chair and desk frames.",    createdAt: iso(85), updatedAt: iso(5)  },
    { id: "dp-rm-003", rmCode: "RM-003", name: "High-Density Foam",      unit: "m²",    currentStock: "207", costPerUnit: "8.20",  notes: "40kg/m³ HD foam for seating cushions. BS7177 fire resistant.",         createdAt: iso(85), updatedAt: iso(8)  },
    { id: "dp-rm-004", rmCode: "RM-004", name: "Upholstery Fabric",      unit: "m",     currentStock: "518", costPerUnit: "6.50",  notes: "Commercial-grade woven fabric, Martindale 100,000 rubs.",             createdAt: iso(85), updatedAt: iso(8)  },
    { id: "dp-rm-005", rmCode: "RM-005", name: "Stainless Screws (box)", unit: "box",   currentStock: "93",  costPerUnit: "3.40",  notes: "Box of 100 M6 stainless steel wood screws. Corrosion resistant.",      createdAt: iso(80), updatedAt: iso(10) },
    { id: "dp-rm-006", rmCode: "RM-006", name: "MDF Board",              unit: "sheet", currentStock: "178", costPerUnit: "9.75",  notes: "18mm moisture-resistant MDF 2440×1220mm sheets.",                     createdAt: iso(80), updatedAt: iso(10) },
    { id: "dp-rm-007", rmCode: "RM-007", name: "Chrome Chair Base",      unit: "pcs",   currentStock: "140", costPerUnit: "14.90", notes: "5-star chrome base 65cm for office chairs. Max load 150kg.",           createdAt: iso(78), updatedAt: iso(12) },
    { id: "dp-rm-008", rmCode: "RM-008", name: "Gas Lift Cylinder",      unit: "pcs",   currentStock: "125", costPerUnit: "7.20",  notes: "Class 4 gas cylinder 150mm stroke. Tested to 1 million cycles.",       createdAt: iso(78), updatedAt: iso(12) },
  ]);

  // ── 10. SALARY ALLOWANCE / DEDUCTION CATEGORIES ────────────────────────────
  put("admin-hrm-salary-allowance-cats", [
    { id: "dp-alw-001", name: "House Rent Allowance", accountGroupId: "", accountGroupName: "Salary Expense", createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-alw-002", name: "Transport Allowance",  accountGroupId: "", accountGroupName: "Salary Expense", createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-alw-003", name: "Medical Allowance",    accountGroupId: "", accountGroupName: "Salary Expense", createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-alw-004", name: "Performance Bonus",    accountGroupId: "", accountGroupName: "Salary Expense", createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-alw-005", name: "Overtime Allowance",   accountGroupId: "", accountGroupName: "Salary Expense", createdAt: iso(85), updatedAt: iso(0) },
  ]);
  put("admin-hrm-salary-deduction-cats", [
    { id: "dp-ded-001", name: "Income Tax",            accountGroupId: "", accountGroupName: "Tax Payable",    type: "Tax",   createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-ded-002", name: "National Insurance",    accountGroupId: "", accountGroupName: "Tax Payable",    type: "Tax",   createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-ded-003", name: "Pension Contribution",  accountGroupId: "", accountGroupName: "Liability",      type: "Asset", createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-ded-004", name: "Loan Repayment",        accountGroupId: "", accountGroupName: "Liability",      type: "Asset", createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-ded-005", name: "Absence Deduction",     accountGroupId: "", accountGroupName: "Salary Expense", type: "Other", createdAt: iso(85), updatedAt: iso(0) },
  ]);

  // ── 11. STOCK ──────────────────────────────────────────────────────────────
  put("admin-stock", [
    { id: "dp-stk-001", productName: "Executive Office Chair",     sku: "EXC-CHAIR-001", store: "Warehouse", stockType: "For Sale", quantity: "84",  minLevel: "20", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Main warehouse — Bay 3A",           createdAt: iso(60), updatedAt: iso(2)  },
    { id: "dp-stk-002", productName: "Height Adjustable Desk",     sku: "HGT-DESK-002",  store: "Warehouse", stockType: "For Sale", quantity: "32",  minLevel: "10", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Warehouse — Bay 1B. Flat-pack.",    createdAt: iso(58), updatedAt: iso(3)  },
    { id: "dp-stk-003", productName: "3-Door Oak Wardrobe",        sku: "OAK-WRD-003",   store: "Warehouse", stockType: "For Sale", quantity: "18",  minLevel: "5",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Flat-pack. Bay 2A.",               createdAt: iso(55), updatedAt: iso(4)  },
    { id: "dp-stk-004", productName: "Solid Oak Coffee Table",     sku: "OAK-COF-004",   store: "Showroom",  stockType: "For Sale", quantity: "41",  minLevel: "8",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Showroom display + stock room.",    createdAt: iso(55), updatedAt: iso(5)  },
    { id: "dp-stk-005", productName: "5-Shelf Bookcase",           sku: "BCK-5SH-005",   store: "Warehouse", stockType: "For Sale", quantity: "56",  minLevel: "10", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 4C. Assembled.",               createdAt: iso(50), updatedAt: iso(5)  },
    { id: "dp-stk-006", productName: "6-Seat Dining Table Set",    sku: "DIN-SET-006",   store: "Showroom",  stockType: "For Sale", quantity: "9",   minLevel: "3",  unit: "set", holdCustomer: "", holdReason: "", notes: "3 on display; 6 in stock room.",    createdAt: iso(50), updatedAt: iso(6)  },
    { id: "dp-stk-007", productName: "L-Shape Corner Sofa",        sku: "COR-SOF-007",   store: "Showroom",  stockType: "For Sale", quantity: "7",   minLevel: "2",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "1 display model; 6 in storage.",    createdAt: iso(48), updatedAt: iso(7)  },
    { id: "dp-stk-008", productName: "Bedside Cabinet (2-Drawer)", sku: "BDS-CAB-008",   store: "Warehouse", stockType: "For Sale", quantity: "63",  minLevel: "15", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 4A.",                           createdAt: iso(48), updatedAt: iso(7)  },
    { id: "dp-stk-009", productName: "4-Drawer Filing Cabinet",    sku: "FIL-CAB-009",   store: "Warehouse", stockType: "For Sale", quantity: "27",  minLevel: "8",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 2B. Steel — handle with care.", createdAt: iso(45), updatedAt: iso(8)  },
    { id: "dp-stk-010", productName: "Ergonomic Meeting Chair",    sku: "MTG-CHR-010",   store: "Warehouse", stockType: "For Sale", quantity: "105", minLevel: "25", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 3B. Stackable — 10 per pallet.", createdAt: iso(45), updatedAt: iso(8)  },
    { id: "dp-stk-011", productName: "Standing Desk Converter",    sku: "STD-CNV-011",   store: "Warehouse", stockType: "For Sale", quantity: "38",  minLevel: "10", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 1C.",                           createdAt: iso(42), updatedAt: iso(9)  },
    { id: "dp-stk-012", productName: "Wooden Display Shelving",    sku: "WDS-SHF-012",   store: "Warehouse", stockType: "For Sale", quantity: "22",  minLevel: "5",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 5A. Unassembled.",             createdAt: iso(40), updatedAt: iso(10) },
  ]);

  // ── 12. CUSTOMERS ──────────────────────────────────────────────────────────
  // Walk-in system customer (must have stable ID sys-walkin-customer)
  put("admin-customers", [
    { id: "sys-walkin-customer",  name: "Walk-in Customer",         company: "",                       email: "",                                       phone: "",               industry: "Retail",        city: "Hull",       status: "Active",   source: "direct", customerType: "POS Customer",  customerSince: ymd(365), totalValue: "0",        currency: "GBP", notes: "Default walk-in POS customer. Do not delete.", tags: [], ledgerAccountId: "sys-walkin-ar",   createdAt: iso(365), updatedAt: iso(0)  },
    { id: "dp-cust-001",          name: "Horizon Hotels Ltd",        company: "Horizon Hotels Ltd",     email: "procurement@horizonhotels.co.uk",        phone: "+44 113 400 1100", industry: "Hospitality",   city: "Leeds",      status: "Active",   source: "from_lead", customerType: "Regular Customer", customerSince: ymd(180), totalValue: "3499.85", currency: "GBP", notes: "Key account. Volume orders for hotel furnishing projects.", tags: ["B2B","Hotel","VIP"], ledgerAccountId: "dp-acc-cust001", createdAt: iso(180), updatedAt: iso(2) },
    { id: "dp-cust-002",          name: "City Office Solutions",     company: "City Office Solutions",  email: "orders@cityofficesolutions.co.uk",       phone: "+44 113 555 2200", industry: "Office Supplies", city: "Leeds",    status: "Active",   source: "from_lead", customerType: "Regular Customer", customerSince: ymd(150), totalValue: "2399.94", currency: "GBP", notes: "Supplies office furniture to SMEs across West Yorkshire.", tags: ["B2B","Office"], ledgerAccountId: "dp-acc-cust002", createdAt: iso(150), updatedAt: iso(5) },
    { id: "dp-cust-003",          name: "Maple Grove Interiors",     company: "Maple Grove Interiors",  email: "hello@maplegroveinteriors.co.uk",        phone: "+44 1904 330 788", industry: "Interior Design", city: "York",     status: "Active",   source: "direct",    customerType: "Regular Customer", customerSince: ymd(120), totalValue: "1847.97", currency: "GBP", notes: "Interior design studio — residential and commercial.", tags: ["B2B","Design"], ledgerAccountId: "dp-acc-cust003", createdAt: iso(120), updatedAt: iso(10) },
    { id: "dp-cust-004",          name: "Northern Estates Ltd",      company: "Northern Estates Ltd",   email: "facilities@northernestates.co.uk",       phone: "+44 114 300 9900", industry: "Property",       city: "Sheffield", status: "Active",   source: "direct",    customerType: "Regular Customer", customerSince: ymd(90),  totalValue: "0",       currency: "GBP", notes: "Property management company. Furnishes rental properties.", tags: ["B2B","Property"], createdAt: iso(90), updatedAt: iso(0) },
    { id: "dp-cust-005",          name: "James Patterson",           company: "",                       email: "james.patterson@gmail.com",              phone: "+44 7712 334 556", industry: "",               city: "Hull",       status: "Active",   source: "direct",    customerType: "POS Customer",     customerSince: ymd(60),  totalValue: "0",       currency: "GBP", notes: "Repeat walk-in customer. Interested in bedroom furniture.", tags: [], createdAt: iso(60), updatedAt: iso(0) },
    // Suppliers (customerRole: "Supplier")
    { id: "dp-sup-001",           name: "Yorkshire Timber Co.",      company: "Yorkshire Timber Co.",   email: "sales@yorkshiretimber.co.uk",            phone: "+44 1482 440 200", industry: "Timber",         city: "Hull",       status: "Active",   source: "direct",    customerRole: "Supplier",         customerSince: ymd(400), totalValue: "0",       currency: "GBP", notes: "Primary oak and hardwood supplier. FSC certified.", tags: ["Supplier","Timber"], ledgerAccountId: "dp-acc-sup001", supplierProducts: ["dp-prod-003","dp-prod-004","dp-prod-005"], createdAt: iso(400), updatedAt: iso(5) },
    { id: "dp-sup-002",           name: "Sheffield Steel Supplies",  company: "Sheffield Steel Supplies", email: "orders@sheffieldsteel.co.uk",          phone: "+44 114 220 8800", industry: "Steel",          city: "Sheffield",  status: "Active",   source: "direct",    customerRole: "Supplier",         customerSince: ymd(380), totalValue: "0",       currency: "GBP", notes: "Steel tubing and metal components.", tags: ["Supplier","Steel"], ledgerAccountId: "dp-acc-sup002", createdAt: iso(380), updatedAt: iso(8) },
    { id: "dp-sup-003",           name: "FurniParts Direct Ltd",     company: "FurniParts Direct Ltd",  email: "trade@furniparts.co.uk",                 phone: "+44 121 330 4400", industry: "Components",     city: "Birmingham", status: "Active",   source: "direct",    customerRole: "Supplier",         customerSince: ymd(300), totalValue: "0",       currency: "GBP", notes: "Chrome bases, gas cylinders and castors.", tags: ["Supplier","Components"], createdAt: iso(300), updatedAt: iso(20) },
  ]);

  // ── 13. LEADS ──────────────────────────────────────────────────────────────
  put("admin-leads", [
    { id: "dp-lead-001", name: "Oliver Greenwood",   company: "Greenwood Hospitality Group", email: "o.greenwood@ghg.co.uk",        phone: "+44 7890 111 222", industry: "Hospitality",    city: "Manchester", status: "Qualified",  source: "Referral",         notes: "Looking to furnish 3 new hotel lobbies. High-value opportunity.", dealValue: 28000, temperature: "Hot",  assignedTo: "Lucy Hargreaves", nextFollowUp: ymd(-2), isRelevant: true, createdAt: iso(45), updatedAt: iso(5)  },
    { id: "dp-lead-002", name: "Priya Nair",         company: "Nair & Associates",           email: "priya@nairassociates.co.uk",   phone: "+44 7911 333 444", industry: "Legal",          city: "London",     status: "Contacted",  source: "Website",          notes: "Refurnishing 2 floors of office space. Interested in ergonomic chairs and sit-stand desks.", dealValue: 15500, temperature: "Warm", assignedTo: "Sarah Mitchell",  nextFollowUp: ymd(-5), isRelevant: true, createdAt: iso(30), updatedAt: iso(8)  },
    { id: "dp-lead-003", name: "Ben Ashworth",       company: "Ashworth Developments",       email: "ben@ashworthdev.co.uk",        phone: "+44 7700 555 666", industry: "Property",       city: "Leeds",      status: "New",        source: "Trade Show",       notes: "Property developer — show homes project for 12 units.", dealValue: 22000, temperature: "Warm", assignedTo: "James Thornton",  nextFollowUp: ymd(-8), isRelevant: true, createdAt: iso(20), updatedAt: iso(3)  },
    { id: "dp-lead-004", name: "Claire Beaumont",    company: "Beaumont Care Homes",         email: "c.beaumont@beaumont.care",     phone: "+44 7800 777 888", industry: "Healthcare",     city: "York",       status: "Proposal",   source: "Cold Call",        notes: "Care home chain looking for bedroom furniture for 8 homes. Needs fire-rated materials.", dealValue: 41000, temperature: "Hot",  assignedTo: "Lucy Hargreaves", nextFollowUp: ymd(-1), isRelevant: true, createdAt: iso(15), updatedAt: iso(2)  },
    { id: "dp-lead-005", name: "Marcus Reid",        company: "",                            email: "marcus.reid@outlook.com",      phone: "+44 7900 999 000", industry: "",               city: "Hull",       status: "Contacted",  source: "Walk-in",          notes: "Individual customer — renovating home office. Interested in desk and ergonomic chair.", dealValue: 800, temperature: "Warm",   assignedTo: "Marcus Webb",     nextFollowUp: ymd(-10), isRelevant: true, createdAt: iso(10), updatedAt: iso(4) },
    { id: "dp-lead-006", name: "Diane Ashby",        company: "Ashby Education Trust",       email: "d.ashby@ashbyedu.co.uk",       phone: "+44 7710 100 200", industry: "Education",      city: "Hull",       status: "Lost",       source: "Email Campaign",   notes: "School trust — classroom and staff room furniture. Lost to competitor on price.", dealValue: 9800, temperature: "Cold",   assignedTo: "Emma Whitfield",  nextFollowUp: "",      isRelevant: false, createdAt: iso(60), updatedAt: iso(25) },
  ]);

  // ── 14. PAYMENT ACCOUNTS ───────────────────────────────────────────────────
  put("admin-payment-accounts", [
    { id: "sys-pa-cash",  accountTitle: "Cash in Hand",              bankName: "Cash",         paymentMethod: "Cash",          iban: "",                description: "Physical cash on premises",              isActive: true, ledgerAccountId: "sys-1200",      createdAt: iso(90), updatedAt: iso(0) },
    { id: "dp-pa-bank1",  accountTitle: "Barclays Business Account", bankName: "Barclays",     paymentMethod: "Bank Transfer", iban: "GB29 BARC 2044 3358 9710 24", description: "Main business current account. Sort: 20-44-33, Acc: 58971024.", isActive: true, ledgerAccountId: "dp-acc-bank1", createdAt: iso(85), updatedAt: iso(0) },
  ]);

  // ── 15. CHART OF ACCOUNTS (user-defined additions to system defaults) ──────
  // System accounts (sys-*) are auto-created by reconcileAccountingData() on startup.
  // Here we add user-defined sub-ledgers and expense accounts.
  put("admin-chart-of-accounts", [
    // ── Cash & Bank sub-ledgers ──
    { id: "dp-acc-bank1",    code: "1112", name: "Barclays Business Account", head: "Assets",           accountType: "Ledger", parentId: "sys-1150",  subType: "Bank",       description: "Barclays Bank plc — Sort 20-44-33, Acc 58971024", openingBalance: 10000, paymentType: null,     isActive: true, createdAt: iso(85), updatedAt: iso(0) },
    // ── Accounts Receivable sub-ledgers (per customer) ──
    { id: "dp-acc-cust001",  code: "1130-001", name: "Horizon Hotels Ltd",     head: "Assets",           accountType: "Ledger", parentId: "sys-1100",  subType: "Receivable", description: "Accounts receivable — Horizon Hotels Ltd",          openingBalance: 0,     paymentType: null,     isActive: true, createdAt: iso(180), updatedAt: iso(0) },
    { id: "dp-acc-cust002",  code: "1130-002", name: "City Office Solutions",  head: "Assets",           accountType: "Ledger", parentId: "sys-1100",  subType: "Receivable", description: "Accounts receivable — City Office Solutions",       openingBalance: 0,     paymentType: null,     isActive: true, createdAt: iso(150), updatedAt: iso(0) },
    { id: "dp-acc-cust003",  code: "1130-003", name: "Maple Grove Interiors",  head: "Assets",           accountType: "Ledger", parentId: "sys-1100",  subType: "Receivable", description: "Accounts receivable — Maple Grove Interiors",       openingBalance: 0,     paymentType: null,     isActive: true, createdAt: iso(120), updatedAt: iso(0) },
    // ── Accounts Payable sub-ledgers (per supplier) ──
    { id: "dp-acc-sup001",   code: "2111-001", name: "Yorkshire Timber Co.",   head: "Liabilities",      accountType: "Ledger", parentId: "sys-2101",  subType: "Payable",    description: "Accounts payable — Yorkshire Timber Co.",           openingBalance: 0,     paymentType: null,     isActive: true, createdAt: iso(400), updatedAt: iso(0) },
    { id: "dp-acc-sup002",   code: "2111-002", name: "Sheffield Steel Supplies", head: "Liabilities",    accountType: "Ledger", parentId: "sys-2101",  subType: "Payable",    description: "Accounts payable — Sheffield Steel Supplies",       openingBalance: 0,     paymentType: null,     isActive: true, createdAt: iso(380), updatedAt: iso(0) },
    // ── Expense ledgers ──
    { id: "dp-acc-rent",     code: "4410", name: "Office & Premises Rent",     head: "Expense",          accountType: "Ledger", parentId: "sys-4000",  subType: "Rent",       description: "Monthly rent for Commerce Way premises",            openingBalance: 0,     paymentType: null,     isActive: true, createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-acc-util",     code: "4510", name: "Electricity & Gas",          head: "Expense",          accountType: "Ledger", parentId: "sys-4000",  subType: "Utility",    description: "Electricity and gas bills for warehouse and showroom", openingBalance: 0,   paymentType: null,     isActive: true, createdAt: iso(85), updatedAt: iso(0) },
    { id: "dp-acc-sal-exp",  code: "4210", name: "Staff Salaries",             head: "Expense",          accountType: "Ledger", parentId: "sys-4200",  subType: "Payroll",    description: "Gross salary payments to all staff",               openingBalance: 0,     paymentType: null,     isActive: true, createdAt: iso(85), updatedAt: iso(0) },
  ]);

  // ── 16. POS SALES (orderType: "POS") ─────────────────────────────────────
  put("admin-sales", [
    {
      id: "dp-sal-001", saleNumber: "SAL-202603-0001", saleDate: D.mar05, customer: "Walk-in Customer",
      status: "Completed", paymentMethod: "Cash", notes: "Walk-in — cash sale", taxRate: "20", amountPaid: "1199.00", paidAt: iso(66),
      stockDeducted: true, orderType: "POS", saleMode: "Retail", jeId: "dp-je-sal001",
      items: [{ id: "si-s1-1", productName: "L-Shape Corner Sofa", sku: "COR-SOF-007", qty: "1", unit: "pcs", unitPrice: "1199.00", discount: "0", notes: "", itemStatus: "Delivered", costPrice: "680.00" }],
      deliveryStatus: "Delivered", createdAt: iso(66), updatedAt: iso(66),
    },
    {
      id: "dp-sal-002", saleNumber: "SAL-202603-0002", saleDate: D.mar15, customer: "Walk-in Customer",
      status: "Completed", paymentMethod: "Cash", notes: "", taxRate: "20", amountPaid: "399.98", paidAt: iso(56),
      stockDeducted: true, orderType: "POS", saleMode: "Retail", jeId: "dp-je-sal002",
      items: [{ id: "si-s2-1", productName: "Ergonomic Meeting Chair", sku: "MTG-CHR-010", qty: "2", unit: "pcs", unitPrice: "199.99", discount: "0", notes: "", itemStatus: "Delivered", costPrice: "108.00" }],
      deliveryStatus: "Delivered", createdAt: iso(56), updatedAt: iso(56),
    },
    {
      id: "dp-sal-003", saleNumber: "SAL-202604-0001", saleDate: D.apr05, customer: "Walk-in Customer",
      status: "Completed", paymentMethod: "Card", notes: "", taxRate: "20", amountPaid: "488.99", paidAt: iso(36),
      stockDeducted: true, orderType: "POS", saleMode: "Retail", jeId: "dp-je-sal003",
      items: [
        { id: "si-s3-1", productName: "Executive Office Chair",  sku: "EXC-CHAIR-001", qty: "1", unit: "pcs", unitPrice: "299.99", discount: "0", notes: "", itemStatus: "Delivered", costPrice: "165.00" },
        { id: "si-s3-2", productName: "Solid Oak Coffee Table",  sku: "OAK-COF-004",   qty: "1", unit: "pcs", unitPrice: "189.00", discount: "0", notes: "", itemStatus: "Delivered", costPrice: "108.00" },
      ],
      deliveryStatus: "Delivered", createdAt: iso(36), updatedAt: iso(36),
    },
    {
      id: "dp-sal-004", saleNumber: "SAL-202604-0002", saleDate: D.apr15, customer: "Walk-in Customer",
      status: "Completed", paymentMethod: "Cash", notes: "", taxRate: "20", amountPaid: "387.00", paidAt: iso(26),
      stockDeducted: true, orderType: "POS", saleMode: "Retail", jeId: "dp-je-sal004",
      items: [{ id: "si-s4-1", productName: "Bedside Cabinet (2-Drawer)", sku: "BDS-CAB-008", qty: "3", unit: "pcs", unitPrice: "129.00", discount: "0", notes: "", itemStatus: "Delivered", costPrice: "74.00" }],
      deliveryStatus: "Delivered", createdAt: iso(26), updatedAt: iso(26),
    },
    {
      id: "dp-sal-005", saleNumber: "SAL-202605-0001", saleDate: D.may02, customer: "Walk-in Customer",
      status: "Completed", paymentMethod: "Bank Transfer", notes: "Customer paid via BACS", taxRate: "20", amountPaid: "449.99", paidAt: iso(9),
      stockDeducted: true, orderType: "POS", saleMode: "Retail", jeId: "dp-je-sal005",
      items: [{ id: "si-s5-1", productName: "Height Adjustable Desk", sku: "HGT-DESK-002", qty: "1", unit: "pcs", unitPrice: "449.99", discount: "0", notes: "", itemStatus: "Delivered", costPrice: "240.00" }],
      deliveryStatus: "Delivered", createdAt: iso(9), updatedAt: iso(9),
    },
    {
      id: "dp-sal-006", saleNumber: "SAL-202605-0002", saleDate: D.may05, customer: "Walk-in Customer",
      status: "Completed", paymentMethod: "Cash", notes: "", taxRate: "20", amountPaid: "558.00", paidAt: iso(6),
      stockDeducted: true, orderType: "POS", saleMode: "Retail", jeId: "dp-je-sal006",
      items: [{ id: "si-s6-1", productName: "4-Drawer Filing Cabinet", sku: "FIL-CAB-009", qty: "2", unit: "pcs", unitPrice: "279.00", discount: "0", notes: "", itemStatus: "Delivered", costPrice: "155.00" }],
      deliveryStatus: "Delivered", createdAt: iso(6), updatedAt: iso(6),
    },
    // Pending POS sale (open ticket)
    {
      id: "dp-sal-007", saleNumber: "SAL-202605-0003", saleDate: D.may08, customer: "Walk-in Customer",
      status: "Pending", paymentMethod: "Cash", notes: "Customer collecting tomorrow", taxRate: "20", amountPaid: "0", paidAt: "",
      stockDeducted: false, orderType: "POS", saleMode: "Retail",
      items: [{ id: "si-s7-1", productName: "5-Shelf Bookcase", sku: "BCK-5SH-005", qty: "2", unit: "pcs", unitPrice: "149.99", discount: "0", notes: "", itemStatus: "Pending", costPrice: "84.00" }],
      deliveryStatus: "Pending", createdAt: iso(3), updatedAt: iso(3),
    },
  ]);

  // ── 17. SALE INVOICES (orderType: "Invoice") ───────────────────────────────
  put("admin-invoices", [
    // INV-202603-0001 — Horizon Hotels (PAID)
    {
      id: "dp-inv-001", invoiceNumber: "INV-202603-0001", invoiceTitle: "Tax Invoice", invoiceType: "sale",
      invoiceDate: D.mar10, dueDate: D.apr10,
      customer: "Horizon Hotels Ltd", customerId: "dp-cust-001",
      buyerAddress: "Horizon Hotels Ltd, 45 Park Row, Leeds, LS1 5HD", buyerTown: "Leeds",
      buyerPhone: "+44 113 400 1100", buyerEmail: "procurement@horizonhotels.co.uk",
      salesOfficer: "Lucy Hargreaves", agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      status: "Paid", saleStatus: "Delivered",
      paymentMethod: "Bank Transfer", paymentTerms: "Net 30", bankDetails: "Barclays Bank — Sort: 20-44-33",
      bankAccountIds: ["dp-pa-bank1"], amountPaid: "1999.90", paidAt: iso(52),
      paymentHistory: [{ id: "ph-1", date: D.mar28, amount: 1999.90, method: "Bank Transfer", reference: "RV-000001", notes: "Full payment received" }],
      items: [{ id: "ii-1-1", productName: "Ergonomic Meeting Chair", sku: "MTG-CHR-010", qty: "10", unit: "pcs", unitPrice: "199.99", discount: "0", notes: "Ref: Hotel conference rooms", itemStatus: "Delivered", costPrice: "108.00" }],
      taxRate: "20", shippingFee: "0", handlingFee: "0", shippingMethod: "Own Transport",
      notes: "10 meeting chairs for conference rooms — Horizon Leeds Central", agreement: "", invoiceFooter: "Premier Furnishings Ltd. | VAT GB 123 4567 89",
      stockDeducted: true, jeId: "dp-je-inv001", jeUsesAR: true,
      createdAt: iso(61), updatedAt: iso(52),
    },
    // INV-202604-0001 — City Office Solutions (PARTIAL)
    {
      id: "dp-inv-002", invoiceNumber: "INV-202604-0001", invoiceTitle: "Tax Invoice", invoiceType: "sale",
      invoiceDate: D.apr10, dueDate: D.may10,
      customer: "City Office Solutions", customerId: "dp-cust-002",
      buyerAddress: "City Office Solutions, 78 Albion Street, Leeds, LS2 8SL", buyerTown: "Leeds",
      buyerPhone: "+44 113 555 2200", buyerEmail: "orders@cityofficesolutions.co.uk",
      salesOfficer: "Lucy Hargreaves", agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      status: "Partial", saleStatus: "Processing",
      paymentMethod: "Bank Transfer", paymentTerms: "Net 30", bankDetails: "Barclays Bank — Sort: 20-44-33",
      bankAccountIds: ["dp-pa-bank1"], amountPaid: "1000.00", paidAt: iso(20),
      paymentHistory: [{ id: "ph-2", date: D.apr20, amount: 1000.00, method: "Bank Transfer", reference: "RV-000003", notes: "Partial payment — balance on delivery" }],
      items: [
        { id: "ii-2-1", productName: "Height Adjustable Desk",  sku: "HGT-DESK-002",  qty: "4", unit: "pcs", unitPrice: "449.99", discount: "5", notes: "Office fit-out — 4 executive desks", itemStatus: "Processing", costPrice: "240.00" },
        { id: "ii-2-2", productName: "Executive Office Chair",  sku: "EXC-CHAIR-001", qty: "4", unit: "pcs", unitPrice: "299.99", discount: "5", notes: "Matching executive chairs",          itemStatus: "Processing", costPrice: "165.00" },
      ],
      taxRate: "20", shippingFee: "0", handlingFee: "0", shippingMethod: "Own Transport",
      notes: "Office refurbishment Phase 1. Balance due on delivery.", agreement: "", invoiceFooter: "Premier Furnishings Ltd. | VAT GB 123 4567 89",
      stockDeducted: false, jeId: "dp-je-inv002", jeUsesAR: true,
      createdAt: iso(31), updatedAt: iso(20),
    },
    // INV-202604-0002 — Maple Grove Interiors (UNPAID)
    {
      id: "dp-inv-003", invoiceNumber: "INV-202604-0002", invoiceTitle: "Tax Invoice", invoiceType: "sale",
      invoiceDate: D.apr20, dueDate: D.may20,
      customer: "Maple Grove Interiors", customerId: "dp-cust-003",
      buyerAddress: "Maple Grove Interiors, 12 Stonegate, York, YO1 8ZW", buyerTown: "York",
      buyerPhone: "+44 1904 330 788", buyerEmail: "hello@maplegroveinteriors.co.uk",
      salesOfficer: "Lucy Hargreaves",
      status: "Unpaid", saleStatus: "Pending",
      paymentMethod: "Bank Transfer", paymentTerms: "Net 30", bankDetails: "Barclays Bank — Sort: 20-44-33",
      bankAccountIds: ["dp-pa-bank1"], amountPaid: "0", paidAt: "",
      paymentHistory: [],
      items: [
        { id: "ii-3-1", productName: "3-Door Oak Wardrobe",  sku: "OAK-WRD-003", qty: "2", unit: "pcs", unitPrice: "699.00", discount: "0", notes: "Master bedroom wardrobes", itemStatus: "Pending", costPrice: "420.00" },
        { id: "ii-3-2", productName: "5-Shelf Bookcase",     sku: "BCK-5SH-005", qty: "3", unit: "pcs", unitPrice: "149.99", discount: "0", notes: "Living room bookcases",    itemStatus: "Pending", costPrice: "84.00"  },
      ],
      taxRate: "20", shippingFee: "0", handlingFee: "0", shippingMethod: "Courier",
      notes: "Residential project — 4 Elm Drive, York. Deliver to site, ground floor only.", agreement: "", invoiceFooter: "Premier Furnishings Ltd. | VAT GB 123 4567 89",
      stockDeducted: false, jeId: "dp-je-inv003", jeUsesAR: true,
      createdAt: iso(21), updatedAt: iso(21),
    },
    // INV-202605-0001 — Horizon Hotels (PAID)
    {
      id: "dp-inv-004", invoiceNumber: "INV-202605-0001", invoiceTitle: "Tax Invoice", invoiceType: "sale",
      invoiceDate: D.may01, dueDate: D.may31,
      customer: "Horizon Hotels Ltd", customerId: "dp-cust-001",
      buyerAddress: "Horizon Hotels Ltd, 45 Park Row, Leeds, LS1 5HD", buyerTown: "Leeds",
      buyerPhone: "+44 113 400 1100", buyerEmail: "procurement@horizonhotels.co.uk",
      salesOfficer: "Lucy Hargreaves", agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      status: "Paid", saleStatus: "Delivered",
      paymentMethod: "Bank Transfer", paymentTerms: "Net 30", bankDetails: "Barclays Bank — Sort: 20-44-33",
      bankAccountIds: ["dp-pa-bank1"], amountPaid: "1499.95", paidAt: iso(5),
      paymentHistory: [{ id: "ph-3", date: D.may05, amount: 1499.95, method: "Bank Transfer", reference: "RV-000002", notes: "Full payment by BACS" }],
      items: [{ id: "ii-4-1", productName: "Executive Office Chair", sku: "EXC-CHAIR-001", qty: "5", unit: "pcs", unitPrice: "299.99", discount: "0", notes: "Hotel reception and offices", itemStatus: "Delivered", costPrice: "165.00" }],
      taxRate: "20", shippingFee: "0", handlingFee: "0", shippingMethod: "Own Transport",
      notes: "5 executive chairs for hotel reception and management offices.", agreement: "", invoiceFooter: "Premier Furnishings Ltd. | VAT GB 123 4567 89",
      stockDeducted: true, jeId: "dp-je-inv004", jeUsesAR: true,
      createdAt: iso(10), updatedAt: iso(5),
    },
    // PINV-202603-0001 — Yorkshire Timber (PURCHASE, PAID)
    {
      id: "dp-pinv-001", invoiceNumber: "PO-202603-0001", invoiceTitle: "Purchase Invoice", invoiceType: "purchase",
      invoiceDate: D.mar01, dueDate: D.mar31,
      customer: "Yorkshire Timber Co.", customerId: "dp-sup-001",
      buyerAddress: "", buyerTown: "Hull", buyerPhone: "", buyerEmail: "",
      salesOfficer: "Ahmed Malik",
      status: "Paid", saleStatus: "Received",
      paymentMethod: "Bank Transfer", paymentTerms: "Net 30", bankDetails: "",
      bankAccountIds: ["dp-pa-bank1"], amountPaid: "750.00", paidAt: iso(68),
      paymentHistory: [{ id: "ph-4", date: D.mar20, amount: 750.00, method: "Bank Transfer", reference: "PV-000001", notes: "Paid in full" }],
      items: [{ id: "pi-1-1", productName: "Oak Timber Board", sku: "RM-001", qty: "50", unit: "m²", unitPrice: "12.50", discount: "0", notes: "Grade A FSC oak", itemStatus: "Delivered", costPrice: "" }],
      taxRate: "20", shippingFee: "0", handlingFee: "0", shippingMethod: "Supplier Delivery",
      notes: "50m² Grade A solid oak timber. Delivered to warehouse Bay 7.", agreement: "", invoiceFooter: "",
      stockReceived: true, stockDeducted: false, jeId: "dp-je-pinv001", jeUsesAR: false,
      createdAt: iso(70), updatedAt: iso(68),
    },
    // PINV-202604-0001 — Sheffield Steel (PURCHASE, PAID)
    {
      id: "dp-pinv-002", invoiceNumber: "PO-202604-0001", invoiceTitle: "Purchase Invoice", invoiceType: "purchase",
      invoiceDate: D.apr01, dueDate: D.apr30,
      customer: "Sheffield Steel Supplies", customerId: "dp-sup-002",
      buyerAddress: "", buyerTown: "Sheffield", buyerPhone: "", buyerEmail: "",
      salesOfficer: "Ahmed Malik",
      status: "Paid", saleStatus: "Received",
      paymentMethod: "Bank Transfer", paymentTerms: "Net 30", bankDetails: "",
      bankAccountIds: ["dp-pa-bank1"], amountPaid: "576.00", paidAt: iso(38),
      paymentHistory: [{ id: "ph-5", date: D.apr15, amount: 576.00, method: "Bank Transfer", reference: "PV-000002", notes: "Paid in full" }],
      items: [{ id: "pi-2-1", productName: "Steel Tubing", sku: "RM-002", qty: "100", unit: "m", unitPrice: "4.80", discount: "0", notes: "25mm cold-rolled", itemStatus: "Delivered", costPrice: "" }],
      taxRate: "20", shippingFee: "0", handlingFee: "0", shippingMethod: "Supplier Delivery",
      notes: "100m 25mm diameter cold-rolled steel tubing. Received warehouse Bay 2.", agreement: "", invoiceFooter: "",
      stockReceived: true, stockDeducted: false, jeId: "dp-je-pinv002", jeUsesAR: false,
      createdAt: iso(40), updatedAt: iso(38),
    },
  ]);

  // ── 18. PURCHASE ORDERS ────────────────────────────────────────────────────
  put("admin-purchase-orders", [
    {
      id: "dp-po-001", poNumber: "PO-202603-001", supplier: "Yorkshire Timber Co.", orderDate: D.mar01, deliveryDate: D.mar10,
      status: "Received", notes: "Urgent — stock running low on oak.",
      items: [{ id: "poi-1-1", productName: "Oak Timber Board", sku: "RM-001", qty: "50", unit: "m²", unitPrice: "12.50", notes: "Grade A FSC" }],
      jeId: "dp-je-pinv001", createdAt: iso(70), updatedAt: iso(68),
    },
    {
      id: "dp-po-002", poNumber: "PO-202604-001", supplier: "Sheffield Steel Supplies", orderDate: D.apr01, deliveryDate: D.apr10,
      status: "Received", notes: "Quarterly steel order.",
      items: [{ id: "poi-2-1", productName: "Steel Tubing", sku: "RM-002", qty: "100", unit: "m", unitPrice: "4.80", notes: "25mm cold-rolled" }],
      jeId: "dp-je-pinv002", createdAt: iso(40), updatedAt: iso(38),
    },
    {
      id: "dp-po-003", poNumber: "PO-202605-001", supplier: "FurniParts Direct Ltd", orderDate: D.may01, deliveryDate: D.may15,
      status: "Confirmed", notes: "Chrome bases and gas cylinders for Q2 production.",
      items: [
        { id: "poi-3-1", productName: "Chrome Chair Base", sku: "RM-007", qty: "60",  unit: "pcs", unitPrice: "14.90", notes: "5-star 65cm" },
        { id: "poi-3-2", productName: "Gas Lift Cylinder", sku: "RM-008", qty: "60",  unit: "pcs", unitPrice: "7.20",  notes: "Class 4, 150mm" },
      ],
      createdAt: iso(10), updatedAt: iso(10),
    },
  ]);

  // ── 19. SALE RETURNS ───────────────────────────────────────────────────────
  put("admin-sale-returns", [
    {
      id: "dp-sr-001", returnNumber: "SR-202604-001",
      originalSaleNumber: "SAL-202603-0002", originalSaleId: "dp-sal-002",
      date: D.apr05, customer: "Walk-in Customer",
      refundMethod: "Cash",
      items: [{ id: "sri-1-1", productName: "Ergonomic Meeting Chair", sku: "MTG-CHR-010", unit: "pcs", qty: "1", unitPrice: "199.99", discount: "0", costPrice: "108.00" }],
      subtotal: 166.66, taxAmount: 33.33, grandTotal: 199.99,
      reason: "Customer changed mind — wrong colour", notes: "Item returned in original packaging. Restocked.",
      status: "posted", jeId: "dp-je-sr001",
      createdAt: iso(36), updatedAt: iso(36),
    },
    {
      id: "dp-sr-002", returnNumber: "SR-202605-001",
      originalSaleNumber: "SAL-202604-0002", originalSaleId: "dp-sal-004",
      date: D.may02, customer: "Walk-in Customer",
      refundMethod: "Cash",
      items: [{ id: "sri-2-1", productName: "Bedside Cabinet (2-Drawer)", sku: "BDS-CAB-008", unit: "pcs", qty: "1", unitPrice: "129.00", discount: "0", costPrice: "74.00" }],
      subtotal: 107.50, taxAmount: 21.50, grandTotal: 129.00,
      reason: "Damaged drawer — manufacturing defect", notes: "Replacement sent. Defective unit returned to supplier.",
      status: "posted", jeId: "dp-je-sr002",
      createdAt: iso(9), updatedAt: iso(9),
    },
  ]);

  // ── 20. JOURNAL ENTRIES ────────────────────────────────────────────────────
  // Key: sys-walkin-ar = Walk-in Customer AR (1130-000), sys-1200 = Cash, dp-acc-bank1 = Barclays,
  //      sys-3101 = General Sales Revenue, sys-2200 = VAT Payable, sys-4100 = COGS, sys-4600 = Purchases,
  //      sys-5100 = Owner's Capital, dp-acc-rent = Rent Expense, dp-acc-util = Utilities
  put("admin-journal-entries", [
    // ── Capital injection (Feb 2026) ──────────────────────────────────────────
    {
      id: "dp-je-capital", date: D.feb01, reference: "JE-202602-0001", description: "Owner capital injection — business start-up",
      status: "posted", totalDebit: 10000, totalCredit: 10000, isBalanced: true,
      lines: [
        { id: "jl-cap-1", ledgerId: "dp-acc-bank1", narration: "Capital injection — Barclays account",   debit: 10000, credit: 0 },
        { id: "jl-cap-2", ledgerId: "sys-5100",      narration: "Owner capital introduced",              debit: 0,     credit: 10000 },
      ],
      createdAt: iso(99), updatedAt: iso(99),
    },
    // ── POS Sale JEs (AUTO-SAL-*) ─────────────────────────────────────────────
    // SAL-202603-0001 — Corner Sofa £1199.00 (Net £999.17, VAT £199.83)
    {
      id: "dp-je-sal001", date: D.mar05, reference: "AUTO-SAL-202603-0001", description: "POS Sale: SAL-202603-0001 – Walk-in",
      status: "posted", totalDebit: 2398.00, totalCredit: 2398.00, isBalanced: true,
      lines: [
        { id: "jl-s1-1", ledgerId: "sys-walkin-ar", narration: "POS Sale: SAL-202603-0001 – Walk-in",         debit: 1199.00, credit: 0      },
        { id: "jl-s1-2", ledgerId: "sys-3101",       narration: "Sales Revenue: SAL-202603-0001",              debit: 0,       credit: 999.17 },
        { id: "jl-s1-3", ledgerId: "sys-2200",       narration: "VAT 20%: SAL-202603-0001",                   debit: 0,       credit: 199.83 },
        { id: "jl-s1-4", ledgerId: "sys-1200",       narration: "Cash received: SAL-202603-0001 – Walk-in",   debit: 1199.00, credit: 0      },
        { id: "jl-s1-5", ledgerId: "sys-walkin-ar",  narration: "AR transit cleared – SAL-202603-0001 – Walk-in", debit: 0, credit: 1199.00 },
      ],
      createdAt: iso(66), updatedAt: iso(66),
    },
    // SAL-202603-0002 — 2x Meeting Chair £399.98 (Net £333.32, VAT £66.66)
    {
      id: "dp-je-sal002", date: D.mar15, reference: "AUTO-SAL-202603-0002", description: "POS Sale: SAL-202603-0002 – Walk-in",
      status: "posted", totalDebit: 799.96, totalCredit: 799.96, isBalanced: true,
      lines: [
        { id: "jl-s2-1", ledgerId: "sys-walkin-ar", narration: "POS Sale: SAL-202603-0002 – Walk-in",         debit: 399.98, credit: 0      },
        { id: "jl-s2-2", ledgerId: "sys-3101",       narration: "Sales Revenue: SAL-202603-0002",              debit: 0,      credit: 333.32 },
        { id: "jl-s2-3", ledgerId: "sys-2200",       narration: "VAT 20%: SAL-202603-0002",                   debit: 0,      credit: 66.66  },
        { id: "jl-s2-4", ledgerId: "sys-1200",       narration: "Cash received: SAL-202603-0002 – Walk-in",   debit: 399.98, credit: 0      },
        { id: "jl-s2-5", ledgerId: "sys-walkin-ar",  narration: "AR transit cleared – SAL-202603-0002 – Walk-in", debit: 0, credit: 399.98 },
      ],
      createdAt: iso(56), updatedAt: iso(56),
    },
    // SAL-202604-0001 — Chair + Coffee Table £488.99 (Net £407.49, VAT £81.50)
    {
      id: "dp-je-sal003", date: D.apr05, reference: "AUTO-SAL-202604-0001", description: "POS Sale: SAL-202604-0001 – Walk-in",
      status: "posted", totalDebit: 977.98, totalCredit: 977.98, isBalanced: true,
      lines: [
        { id: "jl-s3-1", ledgerId: "sys-walkin-ar", narration: "POS Sale: SAL-202604-0001 – Walk-in",         debit: 488.99, credit: 0      },
        { id: "jl-s3-2", ledgerId: "sys-3101",       narration: "Sales Revenue: SAL-202604-0001",              debit: 0,      credit: 407.49 },
        { id: "jl-s3-3", ledgerId: "sys-2200",       narration: "VAT 20%: SAL-202604-0001",                   debit: 0,      credit: 81.50  },
        { id: "jl-s3-4", ledgerId: "sys-1200",       narration: "Cash received: SAL-202604-0001 – Walk-in",   debit: 488.99, credit: 0      },
        { id: "jl-s3-5", ledgerId: "sys-walkin-ar",  narration: "AR transit cleared – SAL-202604-0001 – Walk-in", debit: 0, credit: 488.99 },
      ],
      createdAt: iso(36), updatedAt: iso(36),
    },
    // SAL-202604-0002 — 3x Bedside Cabinet £387.00 (Net £322.50, VAT £64.50)
    {
      id: "dp-je-sal004", date: D.apr15, reference: "AUTO-SAL-202604-0002", description: "POS Sale: SAL-202604-0002 – Walk-in",
      status: "posted", totalDebit: 774.00, totalCredit: 774.00, isBalanced: true,
      lines: [
        { id: "jl-s4-1", ledgerId: "sys-walkin-ar", narration: "POS Sale: SAL-202604-0002 – Walk-in",         debit: 387.00, credit: 0      },
        { id: "jl-s4-2", ledgerId: "sys-3101",       narration: "Sales Revenue: SAL-202604-0002",              debit: 0,      credit: 322.50 },
        { id: "jl-s4-3", ledgerId: "sys-2200",       narration: "VAT 20%: SAL-202604-0002",                   debit: 0,      credit: 64.50  },
        { id: "jl-s4-4", ledgerId: "sys-1200",       narration: "Cash received: SAL-202604-0002 – Walk-in",   debit: 387.00, credit: 0      },
        { id: "jl-s4-5", ledgerId: "sys-walkin-ar",  narration: "AR transit cleared – SAL-202604-0002 – Walk-in", debit: 0, credit: 387.00 },
      ],
      createdAt: iso(26), updatedAt: iso(26),
    },
    // SAL-202605-0001 — Height Desk £449.99 (Net £374.99, VAT £75.00)
    {
      id: "dp-je-sal005", date: D.may02, reference: "AUTO-SAL-202605-0001", description: "POS Sale: SAL-202605-0001 – Walk-in",
      status: "posted", totalDebit: 899.98, totalCredit: 899.98, isBalanced: true,
      lines: [
        { id: "jl-s5-1", ledgerId: "sys-walkin-ar", narration: "POS Sale: SAL-202605-0001 – Walk-in",                debit: 449.99, credit: 0      },
        { id: "jl-s5-2", ledgerId: "sys-3101",       narration: "Sales Revenue: SAL-202605-0001",                     debit: 0,      credit: 374.99 },
        { id: "jl-s5-3", ledgerId: "sys-2200",       narration: "VAT 20%: SAL-202605-0001",                          debit: 0,      credit: 75.00  },
        { id: "jl-s5-4", ledgerId: "dp-acc-bank1",   narration: "BACS received: SAL-202605-0001 – Walk-in",          debit: 449.99, credit: 0      },
        { id: "jl-s5-5", ledgerId: "sys-walkin-ar",  narration: "AR transit cleared – SAL-202605-0001 – Walk-in",    debit: 0,      credit: 449.99 },
      ],
      createdAt: iso(9), updatedAt: iso(9),
    },
    // SAL-202605-0002 — 2x Filing Cabinet £558.00 (Net £465.00, VAT £93.00)
    {
      id: "dp-je-sal006", date: D.may05, reference: "AUTO-SAL-202605-0002", description: "POS Sale: SAL-202605-0002 – Walk-in",
      status: "posted", totalDebit: 1116.00, totalCredit: 1116.00, isBalanced: true,
      lines: [
        { id: "jl-s6-1", ledgerId: "sys-walkin-ar", narration: "POS Sale: SAL-202605-0002 – Walk-in",         debit: 558.00, credit: 0      },
        { id: "jl-s6-2", ledgerId: "sys-3101",       narration: "Sales Revenue: SAL-202605-0002",              debit: 0,      credit: 465.00 },
        { id: "jl-s6-3", ledgerId: "sys-2200",       narration: "VAT 20%: SAL-202605-0002",                   debit: 0,      credit: 93.00  },
        { id: "jl-s6-4", ledgerId: "sys-1200",       narration: "Cash received: SAL-202605-0002 – Walk-in",   debit: 558.00, credit: 0      },
        { id: "jl-s6-5", ledgerId: "sys-walkin-ar",  narration: "AR transit cleared – SAL-202605-0002 – Walk-in", debit: 0, credit: 558.00 },
      ],
      createdAt: iso(6), updatedAt: iso(6),
    },
    // ── Sale Invoice JEs (AUTO-INV-*) ─────────────────────────────────────────
    // INV-202603-0001 — Horizon Hotels £1999.90 (Net £1666.58, VAT £333.32)
    {
      id: "dp-je-inv001", date: D.mar10, reference: "AUTO-INV-202603-0001", description: "Invoice Sale: INV-202603-0001 – Horizon Hotels Ltd",
      status: "posted", totalDebit: 1999.90, totalCredit: 1999.90, isBalanced: true,
      lines: [
        { id: "jl-i1-1", ledgerId: "dp-acc-cust001", narration: "Invoice Sale: INV-202603-0001 – Horizon Hotels Ltd", debit: 1999.90, credit: 0       },
        { id: "jl-i1-2", ledgerId: "sys-3101",        narration: "Sales Revenue: INV-202603-0001",                     debit: 0,       credit: 1666.58 },
        { id: "jl-i1-3", ledgerId: "sys-2200",        narration: "VAT 20%: INV-202603-0001",                          debit: 0,       credit: 333.32  },
      ],
      createdAt: iso(61), updatedAt: iso(61),
    },
    // INV-202604-0001 — City Office £2399.94 (Net £1999.95, VAT £399.99)
    {
      id: "dp-je-inv002", date: D.apr10, reference: "AUTO-INV-202604-0001", description: "Invoice Sale: INV-202604-0001 – City Office Solutions",
      status: "posted", totalDebit: 2399.94, totalCredit: 2399.94, isBalanced: true,
      lines: [
        { id: "jl-i2-1", ledgerId: "dp-acc-cust002", narration: "Invoice Sale: INV-202604-0001 – City Office Solutions", debit: 2399.94, credit: 0       },
        { id: "jl-i2-2", ledgerId: "sys-3101",        narration: "Sales Revenue: INV-202604-0001",                       debit: 0,       credit: 1999.95 },
        { id: "jl-i2-3", ledgerId: "sys-2200",        narration: "VAT 20%: INV-202604-0001",                            debit: 0,       credit: 399.99  },
      ],
      createdAt: iso(31), updatedAt: iso(31),
    },
    // INV-202604-0002 — Maple Grove £1847.97 (Net £1539.98, VAT £307.99)
    {
      id: "dp-je-inv003", date: D.apr20, reference: "AUTO-INV-202604-0002", description: "Invoice Sale: INV-202604-0002 – Maple Grove Interiors",
      status: "posted", totalDebit: 1847.97, totalCredit: 1847.97, isBalanced: true,
      lines: [
        { id: "jl-i3-1", ledgerId: "dp-acc-cust003", narration: "Invoice Sale: INV-202604-0002 – Maple Grove Interiors", debit: 1847.97, credit: 0       },
        { id: "jl-i3-2", ledgerId: "sys-3101",        narration: "Sales Revenue: INV-202604-0002",                       debit: 0,       credit: 1539.98 },
        { id: "jl-i3-3", ledgerId: "sys-2200",        narration: "VAT 20%: INV-202604-0002",                            debit: 0,       credit: 307.99  },
      ],
      createdAt: iso(21), updatedAt: iso(21),
    },
    // INV-202605-0001 — Horizon Hotels £1499.95 (Net £1249.96, VAT £249.99)
    {
      id: "dp-je-inv004", date: D.may01, reference: "AUTO-INV-202605-0001", description: "Invoice Sale: INV-202605-0001 – Horizon Hotels Ltd",
      status: "posted", totalDebit: 1499.95, totalCredit: 1499.95, isBalanced: true,
      lines: [
        { id: "jl-i4-1", ledgerId: "dp-acc-cust001", narration: "Invoice Sale: INV-202605-0001 – Horizon Hotels Ltd", debit: 1499.95, credit: 0       },
        { id: "jl-i4-2", ledgerId: "sys-3101",        narration: "Sales Revenue: INV-202605-0001",                    debit: 0,       credit: 1249.96 },
        { id: "jl-i4-3", ledgerId: "sys-2200",        narration: "VAT 20%: INV-202605-0001",                         debit: 0,       credit: 249.99  },
      ],
      createdAt: iso(10), updatedAt: iso(10),
    },
    // ── Purchase Invoice JEs (AUTO-PO-*) ──────────────────────────────────────
    // PO-202603-0001 — Yorkshire Timber £750.00 (Net £625.00, VAT £125.00)
    {
      id: "dp-je-pinv001", date: D.mar01, reference: "AUTO-PO-202603-0001", description: "Purchase Receipt: PO-202603-0001 – Yorkshire Timber Co.",
      status: "posted", totalDebit: 750.00, totalCredit: 750.00, isBalanced: true,
      lines: [
        { id: "jl-p1-1", ledgerId: "sys-4600",       narration: "Purchases: PO-202603-0001 – Oak Timber Board", debit: 625.00, credit: 0      },
        { id: "jl-p1-2", ledgerId: "sys-2200",        narration: "VAT Input: PO-202603-0001",                    debit: 125.00, credit: 0      },
        { id: "jl-p1-3", ledgerId: "dp-acc-sup001",   narration: "Yorkshire Timber Co. – PO-202603-0001",        debit: 0,      credit: 750.00 },
      ],
      createdAt: iso(70), updatedAt: iso(70),
    },
    // PO-202604-0001 — Sheffield Steel £576.00 (Net £480.00, VAT £96.00)
    {
      id: "dp-je-pinv002", date: D.apr01, reference: "AUTO-PO-202604-0001", description: "Purchase Receipt: PO-202604-0001 – Sheffield Steel Supplies",
      status: "posted", totalDebit: 576.00, totalCredit: 576.00, isBalanced: true,
      lines: [
        { id: "jl-p2-1", ledgerId: "sys-4600",       narration: "Purchases: PO-202604-0001 – Steel Tubing", debit: 480.00, credit: 0      },
        { id: "jl-p2-2", ledgerId: "sys-2200",        narration: "VAT Input: PO-202604-0001",                debit: 96.00,  credit: 0      },
        { id: "jl-p2-3", ledgerId: "dp-acc-sup002",   narration: "Sheffield Steel – PO-202604-0001",         debit: 0,      credit: 576.00 },
      ],
      createdAt: iso(40), updatedAt: iso(40),
    },
    // ── Receipt / Payment Voucher JEs (RV-* / PV-*) ───────────────────────────
    // RV-000001 — Horizon Hotels receipt for INV-202603-0001 £1999.90
    {
      id: "dp-je-rv001", date: D.mar28, reference: "RV-000001", description: "Receipt: RV-000001 – Horizon Hotels Ltd",
      status: "posted", totalDebit: 1999.90, totalCredit: 1999.90, isBalanced: true,
      lines: [
        { id: "jl-rv1-1", ledgerId: "dp-acc-bank1",   narration: "Bank receipt – Horizon Hotels Ltd – INV-202603-0001", debit: 1999.90, credit: 0       },
        { id: "jl-rv1-2", ledgerId: "dp-acc-cust001",  narration: "INV-202603-0001 cleared",                            debit: 0,       credit: 1999.90 },
      ],
      createdAt: iso(53), updatedAt: iso(53),
    },
    // RV-000002 — Horizon Hotels receipt for INV-202605-0001 £1499.95
    {
      id: "dp-je-rv002", date: D.may05, reference: "RV-000002", description: "Receipt: RV-000002 – Horizon Hotels Ltd",
      status: "posted", totalDebit: 1499.95, totalCredit: 1499.95, isBalanced: true,
      lines: [
        { id: "jl-rv2-1", ledgerId: "dp-acc-bank1",   narration: "Bank receipt – Horizon Hotels Ltd – INV-202605-0001", debit: 1499.95, credit: 0       },
        { id: "jl-rv2-2", ledgerId: "dp-acc-cust001",  narration: "INV-202605-0001 cleared",                            debit: 0,       credit: 1499.95 },
      ],
      createdAt: iso(6), updatedAt: iso(6),
    },
    // RV-000003 — City Office partial receipt £1000.00
    {
      id: "dp-je-rv003", date: D.apr20, reference: "RV-000003", description: "Receipt: RV-000003 – City Office Solutions (partial)",
      status: "posted", totalDebit: 1000.00, totalCredit: 1000.00, isBalanced: true,
      lines: [
        { id: "jl-rv3-1", ledgerId: "dp-acc-bank1",   narration: "Bank receipt – City Office Solutions – INV-202604-0001 (partial)", debit: 1000.00, credit: 0       },
        { id: "jl-rv3-2", ledgerId: "dp-acc-cust002",  narration: "INV-202604-0001 partial payment",                                  debit: 0,       credit: 1000.00 },
      ],
      createdAt: iso(21), updatedAt: iso(21),
    },
    // PV-000001 — Yorkshire Timber payment £750.00
    {
      id: "dp-je-pv001", date: D.mar20, reference: "PV-000001", description: "Payment: PV-000001 – Yorkshire Timber Co.",
      status: "posted", totalDebit: 750.00, totalCredit: 750.00, isBalanced: true,
      lines: [
        { id: "jl-pv1-1", ledgerId: "dp-acc-sup001",  narration: "PO-202603-0001 settled",                  debit: 750.00, credit: 0      },
        { id: "jl-pv1-2", ledgerId: "dp-acc-bank1",   narration: "Bank payment – Yorkshire Timber Co.",     debit: 0,      credit: 750.00 },
      ],
      createdAt: iso(61), updatedAt: iso(61),
    },
    // PV-000002 — Sheffield Steel payment £576.00
    {
      id: "dp-je-pv002", date: D.apr15, reference: "PV-000002", description: "Payment: PV-000002 – Sheffield Steel Supplies",
      status: "posted", totalDebit: 576.00, totalCredit: 576.00, isBalanced: true,
      lines: [
        { id: "jl-pv2-1", ledgerId: "dp-acc-sup002",  narration: "PO-202604-0001 settled",                  debit: 576.00, credit: 0      },
        { id: "jl-pv2-2", ledgerId: "dp-acc-bank1",   narration: "Bank payment – Sheffield Steel Supplies", debit: 0,      credit: 576.00 },
      ],
      createdAt: iso(26), updatedAt: iso(26),
    },
    // ── Sale Return JEs ───────────────────────────────────────────────────────
    // SR-202604-001 — 1x Meeting Chair return £199.99
    {
      id: "dp-je-sr001", date: D.apr05, reference: "AUTO-SR-202604-001", description: "Sale Return: SR-202604-001 – Walk-in Customer",
      status: "posted", totalDebit: 199.99, totalCredit: 199.99, isBalanced: true,
      lines: [
        { id: "jl-sr1-1", ledgerId: "sys-3101",      narration: "Revenue reversal: SR-202604-001",  debit: 166.66, credit: 0      },
        { id: "jl-sr1-2", ledgerId: "sys-2200",      narration: "VAT reversal: SR-202604-001",      debit: 33.33,  credit: 0      },
        { id: "jl-sr1-3", ledgerId: "sys-1200",      narration: "Cash refund: SR-202604-001",       debit: 0,      credit: 199.99 },
      ],
      createdAt: iso(36), updatedAt: iso(36),
    },
    // SR-202605-001 — 1x Bedside Cabinet return £129.00
    {
      id: "dp-je-sr002", date: D.may02, reference: "AUTO-SR-202605-001", description: "Sale Return: SR-202605-001 – Walk-in Customer",
      status: "posted", totalDebit: 129.00, totalCredit: 129.00, isBalanced: true,
      lines: [
        { id: "jl-sr2-1", ledgerId: "sys-3101",      narration: "Revenue reversal: SR-202605-001",  debit: 107.50, credit: 0      },
        { id: "jl-sr2-2", ledgerId: "sys-2200",      narration: "VAT reversal: SR-202605-001",      debit: 21.50,  credit: 0      },
        { id: "jl-sr2-3", ledgerId: "sys-1200",      narration: "Cash refund: SR-202605-001",       debit: 0,      credit: 129.00 },
      ],
      createdAt: iso(9), updatedAt: iso(9),
    },
    // ── Manual Journal Entries ─────────────────────────────────────────────────
    // Rent March £2,500
    {
      id: "dp-je-rent-mar", date: D.mar01, reference: "JE-202603-0001", description: "Office rent — March 2026",
      status: "posted", totalDebit: 2500, totalCredit: 2500, isBalanced: true,
      lines: [
        { id: "jl-rm-1", ledgerId: "dp-acc-rent",   narration: "Rent: Commerce Way, Hull — March 2026", debit: 2500, credit: 0    },
        { id: "jl-rm-2", ledgerId: "dp-acc-bank1",  narration: "Barclays payment — rent March",         debit: 0,    credit: 2500 },
      ],
      createdAt: iso(70), updatedAt: iso(70),
    },
    // Rent April £2,500
    {
      id: "dp-je-rent-apr", date: D.apr01, reference: "JE-202604-0001", description: "Office rent — April 2026",
      status: "posted", totalDebit: 2500, totalCredit: 2500, isBalanced: true,
      lines: [
        { id: "jl-ra-1", ledgerId: "dp-acc-rent",   narration: "Rent: Commerce Way, Hull — April 2026", debit: 2500, credit: 0    },
        { id: "jl-ra-2", ledgerId: "dp-acc-bank1",  narration: "Barclays payment — rent April",         debit: 0,    credit: 2500 },
      ],
      createdAt: iso(40), updatedAt: iso(40),
    },
    // Rent May £2,500
    {
      id: "dp-je-rent-may", date: D.may01, reference: "JE-202605-0001", description: "Office rent — May 2026",
      status: "posted", totalDebit: 2500, totalCredit: 2500, isBalanced: true,
      lines: [
        { id: "jl-rma-1", ledgerId: "dp-acc-rent",   narration: "Rent: Commerce Way, Hull — May 2026", debit: 2500, credit: 0    },
        { id: "jl-rma-2", ledgerId: "dp-acc-bank1",  narration: "Barclays payment — rent May",         debit: 0,    credit: 2500 },
      ],
      createdAt: iso(10), updatedAt: iso(10),
    },
    // Electricity & Gas April £380
    {
      id: "dp-je-util-apr", date: D.apr28, reference: "JE-202604-0002", description: "Electricity & Gas — April 2026",
      status: "posted", totalDebit: 380, totalCredit: 380, isBalanced: true,
      lines: [
        { id: "jl-ua-1", ledgerId: "dp-acc-util",   narration: "E.ON Energy — April 2026",   debit: 380, credit: 0   },
        { id: "jl-ua-2", ledgerId: "dp-acc-bank1",  narration: "Barclays direct debit",      debit: 0,   credit: 380 },
      ],
      createdAt: iso(13), updatedAt: iso(13),
    },
    // Salary March — all staff
    {
      id: "dp-je-sal-mar", date: D.mar28, reference: "JE-202603-0002", description: "Staff salaries — March 2026 payroll",
      status: "posted", totalDebit: 15080, totalCredit: 15080, isBalanced: true,
      lines: [
        { id: "jl-sm-1", ledgerId: "dp-acc-sal-exp", narration: "Gross payroll — March 2026 (8 staff)", debit: 15080, credit: 0     },
        { id: "jl-sm-2", ledgerId: "dp-acc-bank1",   narration: "Net salaries paid — March 2026",        debit: 0,     credit: 11200 },
        { id: "jl-sm-3", ledgerId: "sys-2200",        narration: "PAYE & NI payable — March 2026",        debit: 0,     credit: 3880  },
      ],
      createdAt: iso(53), updatedAt: iso(53),
    },
    // Salary April — all staff
    {
      id: "dp-je-sal-apr", date: D.apr28, reference: "JE-202604-0003", description: "Staff salaries — April 2026 payroll",
      status: "posted", totalDebit: 15080, totalCredit: 15080, isBalanced: true,
      lines: [
        { id: "jl-sa-1", ledgerId: "dp-acc-sal-exp", narration: "Gross payroll — April 2026 (8 staff)", debit: 15080, credit: 0     },
        { id: "jl-sa-2", ledgerId: "dp-acc-bank1",   narration: "Net salaries paid — April 2026",        debit: 0,     credit: 11200 },
        { id: "jl-sa-3", ledgerId: "sys-2200",        narration: "PAYE & NI payable — April 2026",        debit: 0,     credit: 3880  },
      ],
      createdAt: iso(13), updatedAt: iso(13),
    },
  ]);

  // ── 21. RECEIPT / PAYMENT VOUCHERS ────────────────────────────────────────
  put("admin-rp-vouchers", [
    // RV-000001 — Horizon Hotels, INV-202603-0001 full payment
    {
      id: "dp-rv-001", voucherNumber: "RV-000001", voucherType: "receipt",
      date: D.mar28, partyName: "Horizon Hotels Ltd",
      cashBankAccountId: "dp-acc-bank1", cashBankAccountName: "Barclays Business Account",
      reference: "BACS-HH-MAR28", totalAmount: 1999.90,
      narration: "Full payment for INV-202603-0001 — 10x Ergonomic Meeting Chairs",
      status: "posted", journalEntryId: "dp-je-rv001", linkedInvoiceId: "dp-inv-001",
      lines: [
        { id: "rvl-1-1", accountId: "dp-acc-cust001", accountName: "Horizon Hotels Ltd", description: "INV-202603-0001 – full payment", amount: 1999.90 },
      ],
      createdAt: iso(53), updatedAt: iso(53),
    },
    // RV-000002 — Horizon Hotels, INV-202605-0001 full payment
    {
      id: "dp-rv-002", voucherNumber: "RV-000002", voucherType: "receipt",
      date: D.may05, partyName: "Horizon Hotels Ltd",
      cashBankAccountId: "dp-acc-bank1", cashBankAccountName: "Barclays Business Account",
      reference: "BACS-HH-MAY05", totalAmount: 1499.95,
      narration: "Full payment for INV-202605-0001 — 5x Executive Office Chairs",
      status: "posted", journalEntryId: "dp-je-rv002", linkedInvoiceId: "dp-inv-004",
      lines: [
        { id: "rvl-2-1", accountId: "dp-acc-cust001", accountName: "Horizon Hotels Ltd", description: "INV-202605-0001 – full payment", amount: 1499.95 },
      ],
      createdAt: iso(6), updatedAt: iso(6),
    },
    // RV-000003 — City Office Solutions, partial receipt £1000
    {
      id: "dp-rv-003", voucherNumber: "RV-000003", voucherType: "receipt",
      date: D.apr20, partyName: "City Office Solutions",
      cashBankAccountId: "dp-acc-bank1", cashBankAccountName: "Barclays Business Account",
      reference: "BACS-COS-APR20", totalAmount: 1000.00,
      narration: "Partial payment against INV-202604-0001 — balance outstanding",
      status: "posted", journalEntryId: "dp-je-rv003", linkedInvoiceId: "dp-inv-002",
      lines: [
        { id: "rvl-3-1", accountId: "dp-acc-cust002", accountName: "City Office Solutions", description: "INV-202604-0001 – partial £1,000", amount: 1000.00 },
      ],
      createdAt: iso(21), updatedAt: iso(21),
    },
    // PV-000001 — Yorkshire Timber payment
    {
      id: "dp-pv-001", voucherNumber: "PV-000001", voucherType: "payment",
      date: D.mar20, partyName: "Yorkshire Timber Co.",
      cashBankAccountId: "dp-acc-bank1", cashBankAccountName: "Barclays Business Account",
      reference: "BACS-YT-MAR20", totalAmount: 750.00,
      narration: "Full payment for PO-202603-0001 — 50m² Oak Timber",
      status: "posted", journalEntryId: "dp-je-pv001",
      lines: [
        { id: "pvl-1-1", accountId: "dp-acc-sup001", accountName: "Yorkshire Timber Co.", description: "PO-202603-0001 – settled in full", amount: 750.00 },
      ],
      createdAt: iso(61), updatedAt: iso(61),
    },
    // PV-000002 — Sheffield Steel payment
    {
      id: "dp-pv-002", voucherNumber: "PV-000002", voucherType: "payment",
      date: D.apr15, partyName: "Sheffield Steel Supplies",
      cashBankAccountId: "dp-acc-bank1", cashBankAccountName: "Barclays Business Account",
      reference: "BACS-SS-APR15", totalAmount: 576.00,
      narration: "Full payment for PO-202604-0001 — 100m Steel Tubing",
      status: "posted", journalEntryId: "dp-je-pv002",
      lines: [
        { id: "pvl-2-1", accountId: "dp-acc-sup002", accountName: "Sheffield Steel Supplies", description: "PO-202604-0001 – settled in full", amount: 576.00 },
      ],
      createdAt: iso(26), updatedAt: iso(26),
    },
  ]);

  // ── 22. SALARY SLIPS ───────────────────────────────────────────────────────
  put("admin-hrm-salary-slips", [
    // March 2026
    { id: "dp-ss-001", staffId: "dp-stf-001", staffName: "David Clarke",    department: "Production", designation: "Production Manager",    period: "2026-03", salaryType: "Monthly", basicSalary: 3800, grossSalary: 4350, netSalary: 3120, status: "Paid", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", paidAt: iso(53), journalEntryId: "dp-je-sal-mar", allowances: [{ name: "House Rent Allowance", amount: 400 }, { name: "Transport Allowance", amount: 150 }], deductions: [{ name: "Income Tax", amount: 800 }, { name: "National Insurance", amount: 430 }], notes: "March 2026", createdAt: iso(53), updatedAt: iso(53) },
    { id: "dp-ss-002", staffId: "dp-stf-002", staffName: "Lucy Hargreaves", department: "Sales",      designation: "Sales Manager",          period: "2026-03", salaryType: "Monthly", basicSalary: 3200, grossSalary: 3670, netSalary: 2690, status: "Paid", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", paidAt: iso(53), journalEntryId: "dp-je-sal-mar", allowances: [{ name: "House Rent Allowance", amount: 350 }, { name: "Transport Allowance", amount: 120 }], deductions: [{ name: "Income Tax", amount: 620 }, { name: "National Insurance", amount: 360 }], notes: "March 2026", createdAt: iso(53), updatedAt: iso(53) },
    { id: "dp-ss-003", staffId: "dp-stf-003", staffName: "Ahmed Malik",     department: "Warehouse",  designation: "Warehouse Supervisor",   period: "2026-03", salaryType: "Monthly", basicSalary: 2600, grossSalary: 2980, netSalary: 2200, status: "Paid", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", paidAt: iso(53), journalEntryId: "dp-je-sal-mar", allowances: [{ name: "Transport Allowance", amount: 200 }, { name: "Overtime Allowance", amount: 180 }],      deductions: [{ name: "Income Tax", amount: 480 }, { name: "National Insurance", amount: 300 }], notes: "March 2026", createdAt: iso(53), updatedAt: iso(53) },
    { id: "dp-ss-004", staffId: "dp-stf-004", staffName: "Rachel Foster",   department: "Finance",    designation: "Accountant",             period: "2026-03", salaryType: "Monthly", basicSalary: 3500, grossSalary: 4010, netSalary: 2895, status: "Paid", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", paidAt: iso(53), journalEntryId: "dp-je-sal-mar", allowances: [{ name: "House Rent Allowance", amount: 380 }, { name: "Transport Allowance", amount: 130 }], deductions: [{ name: "Income Tax", amount: 720 }, { name: "National Insurance", amount: 395 }], notes: "March 2026", createdAt: iso(53), updatedAt: iso(53) },
    // April 2026
    { id: "dp-ss-005", staffId: "dp-stf-001", staffName: "David Clarke",    department: "Production", designation: "Production Manager",    period: "2026-04", salaryType: "Monthly", basicSalary: 3800, grossSalary: 4350, netSalary: 3120, status: "Paid", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", paidAt: iso(13), journalEntryId: "dp-je-sal-apr", allowances: [{ name: "House Rent Allowance", amount: 400 }, { name: "Transport Allowance", amount: 150 }], deductions: [{ name: "Income Tax", amount: 800 }, { name: "National Insurance", amount: 430 }], notes: "April 2026", createdAt: iso(13), updatedAt: iso(13) },
    { id: "dp-ss-006", staffId: "dp-stf-002", staffName: "Lucy Hargreaves", department: "Sales",      designation: "Sales Manager",          period: "2026-04", salaryType: "Monthly", basicSalary: 3200, grossSalary: 3670, netSalary: 2690, status: "Paid", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", paidAt: iso(13), journalEntryId: "dp-je-sal-apr", allowances: [{ name: "House Rent Allowance", amount: 350 }, { name: "Transport Allowance", amount: 120 }], deductions: [{ name: "Income Tax", amount: 620 }, { name: "National Insurance", amount: 360 }], notes: "April 2026", createdAt: iso(13), updatedAt: iso(13) },
    { id: "dp-ss-007", staffId: "dp-stf-003", staffName: "Ahmed Malik",     department: "Warehouse",  designation: "Warehouse Supervisor",   period: "2026-04", salaryType: "Monthly", basicSalary: 2600, grossSalary: 2980, netSalary: 2200, status: "Paid", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", paidAt: iso(13), journalEntryId: "dp-je-sal-apr", allowances: [{ name: "Transport Allowance", amount: 200 }, { name: "Overtime Allowance", amount: 180 }],      deductions: [{ name: "Income Tax", amount: 480 }, { name: "National Insurance", amount: 300 }], notes: "April 2026", createdAt: iso(13), updatedAt: iso(13) },
    { id: "dp-ss-008", staffId: "dp-stf-004", staffName: "Rachel Foster",   department: "Finance",    designation: "Accountant",             period: "2026-04", salaryType: "Monthly", basicSalary: 3500, grossSalary: 4010, netSalary: 2895, status: "Paid", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", paidAt: iso(13), journalEntryId: "dp-je-sal-apr", allowances: [{ name: "House Rent Allowance", amount: 380 }, { name: "Transport Allowance", amount: 130 }], deductions: [{ name: "Income Tax", amount: 720 }, { name: "National Insurance", amount: 395 }], notes: "April 2026", createdAt: iso(13), updatedAt: iso(13) },
    // May 2026 (current month — draft)
    { id: "dp-ss-009", staffId: "dp-stf-001", staffName: "David Clarke",    department: "Production", designation: "Production Manager",    period: "2026-05", salaryType: "Monthly", basicSalary: 3800, grossSalary: 4350, netSalary: 3120, status: "Draft", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", allowances: [{ name: "House Rent Allowance", amount: 400 }, { name: "Transport Allowance", amount: 150 }], deductions: [{ name: "Income Tax", amount: 800 }, { name: "National Insurance", amount: 430 }], notes: "May 2026 — pending approval", createdAt: iso(2), updatedAt: iso(2) },
    { id: "dp-ss-010", staffId: "dp-stf-002", staffName: "Lucy Hargreaves", department: "Sales",      designation: "Sales Manager",          period: "2026-05", salaryType: "Monthly", basicSalary: 3200, grossSalary: 3670, netSalary: 2690, status: "Draft", paymentMethod: "Bank Transfer", paymentAccountId: "dp-pa-bank1", allowances: [{ name: "House Rent Allowance", amount: 350 }, { name: "Transport Allowance", amount: 120 }], deductions: [{ name: "Income Tax", amount: 620 }, { name: "National Insurance", amount: 360 }], notes: "May 2026 — pending approval", createdAt: iso(2), updatedAt: iso(2) },
  ]);
}
