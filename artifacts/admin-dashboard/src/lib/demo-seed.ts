/** ─────────────────────────────────────────────────────────────────────────────
 *  DEMO SEED — Premier Furnishings Ltd.
 *  Persists demo data directly to the PostgreSQL KV store.
 *  Safe to run multiple times (idempotent — clears old demo data first).
 * ──────────────────────────────────────────────────────────────────────────── */

import { kvPut, kvDeleteNamespace } from "./api";
import { getTenants, isTenantCached } from "./store";

export const DEMO_TENANT_ID   = "demo-premier-2024";
export const DEMO_TENANT_SLUG = "premier-demo";

// ── helpers ──────────────────────────────────────────────────────────────────
const iso  = (daysAgo = 0): string => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString();
};
const ymd  = (daysAgo = 0): string => iso(daysAgo).slice(0, 10);

/** Returns a `put(baseKey, data)` scoped to a specific tenant — writes to DB. */
function makePut(tenantId: string) {
  const ns = `t:${tenantId}`;
  return (baseKey: string, data: unknown) => {
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
  // Write the tenant record to the global namespace
  const existing = getTenants();
  await kvPut("global", "admin-tenants", [...existing.filter(x => x.id !== DEMO_TENANT_ID), tenant]);
  seedDataIntoTenant(DEMO_TENANT_ID, "Premier Furnishings Ltd.");
  return DEMO_TENANT_ID;
}

// ─────────────────────────────────────────────────────────────────────────────
/** Load full demo data into ANY existing tenant without touching its tenant record. */
export function seedDataIntoTenant(tenantId: string, companyName = "Premier Furnishings Ltd."): void {
  clearTenantData(tenantId);
  const put = makePut(tenantId);

  // ── 2. SETTINGS ────────────────────────────────────────────────────────────
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
  });

  // ── 3. HRM ROLES ───────────────────────────────────────────────────────────
  put("admin-hrm-roles", [
    { id: "dp-role-001", color: "#3B82F6", name: "Production Team",  description: "Workshop and manufacturing floor staff", permissions: "manufacturing,stock,raw-materials", createdAt: iso(85), updatedAt: iso(85) },
    { id: "dp-role-002", color: "#10B981", name: "Sales Team",       description: "Customer-facing sales and account management", permissions: "sales,customers,leads,invoices", createdAt: iso(85), updatedAt: iso(85) },
    { id: "dp-role-003", color: "#8B5CF6", name: "Management",       description: "Directors and senior management with full access", permissions: "all", createdAt: iso(85), updatedAt: iso(85) },
    { id: "dp-role-004", color: "#F59E0B", name: "Finance",          description: "Accounts and finance team", permissions: "invoices,journal-entry,chart-of-accounts,purchases", createdAt: iso(85), updatedAt: iso(85) },
    { id: "dp-role-005", color: "#EF4444", name: "Warehouse",        description: "Stock receiving, dispatch and warehouse operations", permissions: "stock,purchases,raw-materials", createdAt: iso(85), updatedAt: iso(85) },
  ]);

  // ── 4. STAFF ───────────────────────────────────────────────────────────────
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

  // ── 5. SALES AGENTS ────────────────────────────────────────────────────────
  put("admin-sales-agents", [
    { id: "dp-sa-001", agentCode: "SA-001", name: "Sarah Mitchell",  email: "sarah.mitchell@agents.co.uk",  phone: "+44 7911 200001", region: "Yorkshire & Humber",   commissionRate: "5",   targetAmount: "45000", status: "Active",   joinDate: ymd(400), notes: "Top performer Q1 2024.",           createdAt: iso(400), updatedAt: iso(0) },
    { id: "dp-sa-002", agentCode: "SA-002", name: "James Thornton",  email: "james.thornton@agents.co.uk",  phone: "+44 7911 200002", region: "North East England",    commissionRate: "4",   targetAmount: "38000", status: "Active",   joinDate: ymd(350), notes: "Covers Durham, Newcastle, Sunderland.", createdAt: iso(350), updatedAt: iso(0) },
    { id: "dp-sa-003", agentCode: "SA-003", name: "Emma Whitfield",  email: "emma.whitfield@agents.co.uk",  phone: "+44 7911 200003", region: "Online & National",     commissionRate: "3.5", targetAmount: "30000", status: "Active",   joinDate: ymd(200), notes: "Manages B2B online orders.",        createdAt: iso(200), updatedAt: iso(0) },
    { id: "dp-sa-004", agentCode: "SA-004", name: "Ranjit Dhaliwal", email: "ranjit.dhaliwal@agents.co.uk", phone: "+44 7911 200004", region: "West Yorkshire",        commissionRate: "4.5", targetAmount: "42000", status: "Inactive", joinDate: ymd(500), notes: "Temporarily suspended — review pending.", createdAt: iso(500), updatedAt: iso(30) },
  ]);

  // ── 6. BRANDS ──────────────────────────────────────────────────────────────
  put("admin-brands", [
    { id: "dp-br-001", name: "Premier Classic", color: "#78350F", website: "www.premierfurnishings.co.uk/classic",  description: "Traditional hardwood furniture crafted in Hull",     status: "Active", createdAt: iso(80), updatedAt: iso(0) },
    { id: "dp-br-002", name: "ModernLine",      color: "#1D4ED8", website: "www.premierfurnishings.co.uk/modernline", description: "Contemporary minimalist office and dining furniture", status: "Active", createdAt: iso(80), updatedAt: iso(0) },
    { id: "dp-br-003", name: "ErgoPlus",        color: "#059669", website: "www.premierfurnishings.co.uk/ergoplus",   description: "Ergonomic seating solutions for workplace wellbeing",  status: "Active", createdAt: iso(80), updatedAt: iso(0) },
  ]);

  // ── 7. PRODUCT CATEGORIES ──────────────────────────────────────────────────
  put("admin-product-categories", [
    { id: "dp-cat-001", name: "Seating",         description: "Chairs, sofas and seating solutions",     color: "#F59E0B", createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-cat-002", name: "Tables & Desks",  description: "Dining tables, coffee tables and desks",  color: "#3B82F6", createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-cat-003", name: "Storage",         description: "Wardrobes, bookcases and filing cabinets", color: "#8B5CF6", createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-cat-004", name: "Bedroom",         description: "Bedroom furniture and accessories",        color: "#EC4899", createdAt: iso(78), updatedAt: iso(0) },
  ]);

  // ── 8. UNITS ───────────────────────────────────────────────────────────────
  put("admin-units", [
    { id: "dp-unit-001", name: "Piece",  symbol: "pcs", description: "Individual item",          createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-002", name: "Set",    symbol: "set", description: "A matched set of items",   createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-003", name: "Metre",  symbol: "m",   description: "Linear metre",             createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-004", name: "Square Metre", symbol: "m²", description: "Area in square metres", createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-005", name: "Kilogram",      symbol: "kg",  description: "Weight in kilograms",    createdAt: iso(78), updatedAt: iso(0) },
    { id: "dp-unit-006", name: "Box",    symbol: "box", description: "Box / carton of items",    createdAt: iso(78), updatedAt: iso(0) },
  ]);

  // ── 9. PRODUCTS ────────────────────────────────────────────────────────────
  put("admin-products", [
    { id: "dp-prod-001", name: "Executive Office Chair",     sku: "EXC-CHAIR-001", brand: "ErgoPlus",       category: "Seating",        unit: "pcs", purchasePrice: "149.00", costPrice: "165.00", price: "299.99", description: "Fully adjustable executive chair with lumbar support, mesh back and padded armrests.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(5)  },
    { id: "dp-prod-002", name: "Height Adjustable Desk",     sku: "HGT-DESK-002",  brand: "ModernLine",     category: "Tables & Desks", unit: "pcs", purchasePrice: "220.00", costPrice: "240.00", price: "449.99", description: "Electric sit-stand desk with memory settings, cable management tray and oak top.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(5)  },
    { id: "dp-prod-003", name: "3-Door Oak Wardrobe",        sku: "OAK-WRD-003",   brand: "Premier Classic", category: "Bedroom",        unit: "pcs", purchasePrice: "380.00", costPrice: "420.00", price: "699.00", description: "Solid oak 3-door wardrobe with hanging rail, two shelves and soft-close doors.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(3)  },
    { id: "dp-prod-004", name: "Solid Oak Coffee Table",     sku: "OAK-COF-004",   brand: "Premier Classic", category: "Tables & Desks", unit: "pcs", purchasePrice: "95.00",  costPrice: "108.00", price: "189.00", description: "Hand-crafted solid oak coffee table with lower shelf and satin finish.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(2)  },
    { id: "dp-prod-005", name: "5-Shelf Bookcase",           sku: "BCK-5SH-005",   brand: "Premier Classic", category: "Storage",        unit: "pcs", purchasePrice: "72.00",  costPrice: "84.00",  price: "149.99", description: "Tall 5-shelf open bookcase in natural oak veneer. Adjustable shelves.", status: "Active", condition: "New", createdAt: iso(75), updatedAt: iso(2)  },
    { id: "dp-prod-006", name: "6-Seat Dining Table Set",    sku: "DIN-SET-006",   brand: "ModernLine",     category: "Tables & Desks", unit: "set", purchasePrice: "450.00", costPrice: "495.00", price: "849.00", description: "Extending dining table with 6 upholstered chairs in a modern Scandi style.", status: "Active", condition: "New", createdAt: iso(70), updatedAt: iso(1)  },
    { id: "dp-prod-007", name: "L-Shape Corner Sofa",        sku: "COR-SOF-007",   brand: "ErgoPlus",       category: "Seating",        unit: "pcs", purchasePrice: "620.00", costPrice: "680.00", price: "1199.00", description: "Large L-shaped corner sofa in premium grey fabric with chaise and storage ottoman.", status: "Active", condition: "New", createdAt: iso(70), updatedAt: iso(1)  },
    { id: "dp-prod-008", name: "Bedside Cabinet (2-Drawer)", sku: "BDS-CAB-008",   brand: "Premier Classic", category: "Bedroom",        unit: "pcs", purchasePrice: "62.00",  costPrice: "74.00",  price: "129.00", description: "Solid oak 2-drawer bedside cabinet with soft-close drawers and brass handles.", status: "Active", condition: "New", createdAt: iso(70), updatedAt: iso(0)  },
    { id: "dp-prod-009", name: "4-Drawer Filing Cabinet",    sku: "FIL-CAB-009",   brand: "ModernLine",     category: "Storage",        unit: "pcs", purchasePrice: "138.00", costPrice: "155.00", price: "279.00", description: "Steel 4-drawer lateral filing cabinet with anti-tilt lock and label holders.", status: "Active", condition: "New", createdAt: iso(70), updatedAt: iso(0)  },
    { id: "dp-prod-010", name: "Ergonomic Meeting Chair",    sku: "MTG-CHR-010",   brand: "ErgoPlus",       category: "Seating",        unit: "pcs", purchasePrice: "95.00",  costPrice: "108.00", price: "199.99", description: "Stackable meeting room chair with upholstered seat and chrome legs.", status: "Active", condition: "New", createdAt: iso(65), updatedAt: iso(0)  },
    { id: "dp-prod-011", name: "Standing Desk Converter",    sku: "STD-CNV-011",   brand: "ModernLine",     category: "Tables & Desks", unit: "pcs", purchasePrice: "88.00",  costPrice: "99.00",  price: "179.00", description: "Desktop riser for converting any desk to a standing workstation. Dual-monitor support.", status: "Active", condition: "New", createdAt: iso(60), updatedAt: iso(0)  },
    { id: "dp-prod-012", name: "Wooden Display Shelving",    sku: "WDS-SHF-012",   brand: "Premier Classic", category: "Storage",        unit: "pcs", purchasePrice: "55.00",  costPrice: "64.00",  price: "119.00", description: "Wall-mounted floating display shelf in solid oak. 120cm wide.", status: "Draft", condition: "New", createdAt: iso(55), updatedAt: iso(10) },
  ]);

  // ── 10. RAW MATERIALS ──────────────────────────────────────────────────────
  put("admin-raw-materials", [
    { id: "dp-rm-001", rmCode: "RM-001", name: "Oak Timber Board",       unit: "m²",  currentStock: "448",  costPerUnit: "12.50", notes: "Grade A solid oak from sustainably managed forests (FSC certified).",    createdAt: iso(85), updatedAt: iso(5)  },
    { id: "dp-rm-002", rmCode: "RM-002", name: "Steel Tubing",           unit: "m",   currentStock: "374",  costPerUnit: "4.80",  notes: "25mm diameter cold-rolled steel tubing for chair and desk frames.",      createdAt: iso(85), updatedAt: iso(5)  },
    { id: "dp-rm-003", rmCode: "RM-003", name: "High-Density Foam",      unit: "m²",  currentStock: "207",  costPerUnit: "8.20",  notes: "40kg/m³ HD foam for seating cushions. BS7177 fire resistant.",          createdAt: iso(85), updatedAt: iso(8)  },
    { id: "dp-rm-004", rmCode: "RM-004", name: "Upholstery Fabric",      unit: "m",   currentStock: "518",  costPerUnit: "6.50",  notes: "Commercial-grade woven fabric, Martindale 100,000 rubs.",              createdAt: iso(85), updatedAt: iso(8)  },
    { id: "dp-rm-005", rmCode: "RM-005", name: "Stainless Screws (box)", unit: "box", currentStock: "93",   costPerUnit: "3.40",  notes: "Box of 100 M6 stainless steel wood screws. Corrosion resistant.",       createdAt: iso(80), updatedAt: iso(10) },
    { id: "dp-rm-006", rmCode: "RM-006", name: "MDF Board",              unit: "sheet", currentStock: "178", costPerUnit: "9.75", notes: "18mm moisture-resistant MDF 2440×1220mm sheets.",                       createdAt: iso(80), updatedAt: iso(10) },
    { id: "dp-rm-007", rmCode: "RM-007", name: "Chrome Chair Base",      unit: "pcs", currentStock: "140",  costPerUnit: "14.90", notes: "5-star chrome base 65cm for office chairs. Max load 150kg.",            createdAt: iso(78), updatedAt: iso(12) },
    { id: "dp-rm-008", rmCode: "RM-008", name: "Gas Lift Cylinder",      unit: "pcs", currentStock: "125",  costPerUnit: "7.20",  notes: "Class 4 gas cylinder 150mm stroke. Tested to 1 million cycles.",        createdAt: iso(78), updatedAt: iso(12) },
  ]);

  // ── 11. STOCK ──────────────────────────────────────────────────────────────
  put("admin-stock", [
    { id: "dp-stk-001", productName: "Executive Office Chair",     sku: "EXC-CHAIR-001", store: "Warehouse",     stockType: "For Sale",       quantity: "84",  minLevel: "20", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Main warehouse — Bay 3A",        createdAt: iso(60), updatedAt: iso(2)  },
    { id: "dp-stk-002", productName: "Height Adjustable Desk",     sku: "HGT-DESK-002",  store: "Warehouse",     stockType: "For Sale",       quantity: "32",  minLevel: "10", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Warehouse — Bay 1B. Flat-pack.", createdAt: iso(58), updatedAt: iso(3)  },
    { id: "dp-stk-003", productName: "3-Door Oak Wardrobe",        sku: "OAK-WRD-003",   store: "Warehouse",     stockType: "For Sale",       quantity: "18",  minLevel: "5",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Flat-pack. Bay 2A.",            createdAt: iso(55), updatedAt: iso(4)  },
    { id: "dp-stk-004", productName: "Solid Oak Coffee Table",     sku: "OAK-COF-004",   store: "Showroom",      stockType: "For Sale",       quantity: "41",  minLevel: "8",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Showroom display + stock room.", createdAt: iso(55), updatedAt: iso(5)  },
    { id: "dp-stk-005", productName: "5-Shelf Bookcase",           sku: "BCK-5SH-005",   store: "Warehouse",     stockType: "For Sale",       quantity: "56",  minLevel: "10", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 4C. Assembled.",            createdAt: iso(50), updatedAt: iso(5)  },
    { id: "dp-stk-006", productName: "6-Seat Dining Table Set",    sku: "DIN-SET-006",   store: "Showroom",      stockType: "For Sale",       quantity: "9",   minLevel: "3",  unit: "set", holdCustomer: "", holdReason: "", notes: "3 on display; 6 in stock room.", createdAt: iso(50), updatedAt: iso(6)  },
    { id: "dp-stk-007", productName: "L-Shape Corner Sofa",        sku: "COR-SOF-007",   store: "Showroom",      stockType: "For Sale",       quantity: "7",   minLevel: "2",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "1 display model; 6 in storage.", createdAt: iso(48), updatedAt: iso(7)  },
    { id: "dp-stk-008", productName: "Bedside Cabinet (2-Drawer)", sku: "BDS-CAB-008",   store: "Warehouse",     stockType: "For Sale",       quantity: "63",  minLevel: "15", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 4A.",                        createdAt: iso(48), updatedAt: iso(7)  },
    { id: "dp-stk-009", productName: "4-Drawer Filing Cabinet",    sku: "FIL-CAB-009",   store: "Warehouse",     stockType: "For Sale",       quantity: "27",  minLevel: "8",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 2B. Steel — handle with care.", createdAt: iso(45), updatedAt: iso(8)  },
    { id: "dp-stk-010", productName: "Ergonomic Meeting Chair",    sku: "MTG-CHR-010",   store: "Warehouse",     stockType: "For Sale",       quantity: "105", minLevel: "25", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 3B. Stackable — 10 per pallet.", createdAt: iso(45), updatedAt: iso(8)  },
    { id: "dp-stk-011", productName: "Standing Desk Converter",    sku: "STD-CNV-011",   store: "Warehouse",     stockType: "For Sale",       quantity: "38",  minLevel: "10", unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 1C.",                        createdAt: iso(42), updatedAt: iso(9)  },
    { id: "dp-stk-012", productName: "Wooden Display Shelving",    sku: "WDS-SHF-012",   store: "Warehouse",     stockType: "For Sale",       quantity: "22",  minLevel: "5",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Bay 5A. Unassembled.",          createdAt: iso(40), updatedAt: iso(10) },
  ]);
}
