/** ─────────────────────────────────────────────────────────────────────────────
 *  DEMO SEED — Premier Furnishings Ltd.
 *  Writes realistic demo data directly to localStorage under the tenant prefix.
 *  Safe to run multiple times (idempotent — clears old demo data first).
 * ──────────────────────────────────────────────────────────────────────────── */

export const DEMO_TENANT_ID   = "demo-premier-2024";
export const DEMO_TENANT_SLUG = "premier-demo";
const PFX = `t:${DEMO_TENANT_ID}:`;

// ── helpers ──────────────────────────────────────────────────────────────────
const iso  = (daysAgo = 0): string => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString();
};
const ymd  = (daysAgo = 0): string => iso(daysAgo).slice(0, 10);
const put  = (baseKey: string, data: unknown) =>
  localStorage.setItem(`${PFX}${baseKey}`, JSON.stringify(data));
const gput = (key: string, data: unknown) =>
  localStorage.setItem(key, JSON.stringify(data));

// ── public helpers ────────────────────────────────────────────────────────────
export function isDemoSeeded(): boolean {
  try {
    const t: { id: string }[] = JSON.parse(localStorage.getItem("admin-tenants") || "[]");
    return t.some(x => x.id === DEMO_TENANT_ID);
  } catch { return false; }
}

export function clearDemoTenant(): void {
  try {
    const t: { id: string }[] = JSON.parse(localStorage.getItem("admin-tenants") || "[]");
    gput("admin-tenants", t.filter(x => x.id !== DEMO_TENANT_ID));
  } catch { /* ignore */ }
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PFX)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

// ─────────────────────────────────────────────────────────────────────────────
export function seedDemoTenant(): string {
  clearDemoTenant();

  // ── 1. TENANT ──────────────────────────────────────────────────────────────
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
  try {
    const existing: { id: string }[] = JSON.parse(localStorage.getItem("admin-tenants") || "[]");
    gput("admin-tenants", [...existing.filter(x => x.id !== DEMO_TENANT_ID), tenant]);
  } catch { gput("admin-tenants", [tenant]); }

  // ── 2. SETTINGS ────────────────────────────────────────────────────────────
  put("admin-settings", {
    companyName: "Premier Furnishings Ltd.",
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
    { id: "dp-stk-012", productName: "Executive Office Chair",     sku: "EXC-CHAIR-001", store: "Showroom",      stockType: "Not For Sale",   quantity: "3",   minLevel: "0",  unit: "pcs", holdCustomer: "Horizon Office Supplies", holdReason: "Reserved for order fulfilment April", notes: "Reserved — do not sell.", createdAt: iso(10), updatedAt: iso(2) },
    { id: "dp-stk-013", productName: "Height Adjustable Desk",     sku: "HGT-DESK-002",  store: "Boardroom",     stockType: "Business Asset", quantity: "4",   minLevel: "0",  unit: "pcs", holdCustomer: "", holdReason: "", notes: "Used in company boardroom. Not for sale.", createdAt: iso(40), updatedAt: iso(40) },
  ]);

  // ── 12. SUPPLIERS ──────────────────────────────────────────────────────────
  put("admin-suppliers", [
    { id: "dp-sup-001", company: "Yorkshire Timber Co.",   contactPerson: "Robert Hughes",   email: "r.hughes@yorktimber.co.uk",    phone: "+44 1904 331 200", category: "Timber & Wood",      city: "York",       country: "United Kingdom", status: "Active",      rating: 5, currency: "GBP", notes: "Primary timber supplier. 30-day payment terms.",         tags: ["preferred", "FSC"],     createdAt: iso(88), updatedAt: iso(5)  },
    { id: "dp-sup-002", company: "SteelForm UK Ltd.",      contactPerson: "Patricia Nash",   email: "p.nash@steelformuk.co.uk",     phone: "+44 1482 741 900", category: "Metal & Steel",      city: "Hull",       country: "United Kingdom", status: "Active",      rating: 4, currency: "GBP", notes: "Local steel supplier. Fast turnaround. 14-day terms.",   tags: ["local"],                createdAt: iso(88), updatedAt: iso(5)  },
    { id: "dp-sup-003", company: "FabriCo Upholstery",    contactPerson: "Naomi Clarke",    email: "naomi@fabricoupholstery.co.uk", phone: "+44 161 499 2200", category: "Fabric & Foam",      city: "Manchester", country: "United Kingdom", status: "Active",      rating: 4, currency: "GBP", notes: "BS7177 certified foam and commercial fabrics.",           tags: ["certified"],            createdAt: iso(85), updatedAt: iso(8)  },
    { id: "dp-sup-004", company: "Nordic Wood Imports",   contactPerson: "Lars Eriksson",   email: "lars@nordicwood.se",           phone: "+46 31 770 4400",  category: "Timber & Wood",      city: "Gothenburg", country: "Sweden",          status: "Active",      rating: 5, currency: "GBP", notes: "Scandinavian pine and birch. 45-day credit terms.",       tags: ["international", "FSC"], createdAt: iso(80), updatedAt: iso(12) },
    { id: "dp-sup-005", company: "FastFix Industrial",    contactPerson: "Gary Watts",      email: "gary.watts@fastfix.co.uk",     phone: "+44 113 498 7700", category: "Fasteners & Hardware", city: "Leeds",     country: "United Kingdom", status: "Active",      rating: 3, currency: "GBP", notes: "Screws, bolts, hinges and fixings. Pay-on-delivery.",     tags: [],                       createdAt: iso(78), updatedAt: iso(15) },
    { id: "dp-sup-006", company: "Glide Castors Ltd.",    contactPerson: "Wendy Poole",     email: "wendy@glidecastors.co.uk",     phone: "+44 121 600 1100", category: "Components",         city: "Birmingham", country: "United Kingdom", status: "Inactive",    rating: 2, currency: "GBP", notes: "Previous supplier. Replaced due to quality issues.",      tags: [],                       createdAt: iso(200), updatedAt: iso(60) },
  ]);

  // ── 13. CUSTOMERS ──────────────────────────────────────────────────────────
  put("admin-customers", [
    { id: "dp-cus-001", name: "John Matthews",     company: "Horizon Office Supplies",      email: "j.matthews@horizonoffice.co.uk",  phone: "+44 113 200 3300", industry: "Office Supplies",    city: "Leeds",       status: "Active",   source: "direct",    customerSince: ymd(180), totalValue: "28650.00", currency: "GBP", notes: "Key account. Net 30 payment terms. Repeat buyer.",   tags: ["key-account", "repeat"], createdAt: iso(180), updatedAt: iso(3)  },
    { id: "dp-cus-002", name: "Amanda Pearce",     company: "Greenfield Hotels Group",      email: "a.pearce@greenfieldhotels.co.uk",  phone: "+44 1482 500 700", industry: "Hospitality",        city: "Hull",        status: "Active",   source: "direct",    customerSince: ymd(150), totalValue: "54200.00", currency: "GBP", notes: "6 hotels across Yorkshire. Bulk orders quarterly.",   tags: ["key-account", "hospitality"], createdAt: iso(150), updatedAt: iso(5)  },
    { id: "dp-cus-003", name: "Richard Owen",      company: "Sheffield Business Park",      email: "r.owen@sheffieldbp.co.uk",         phone: "+44 114 330 5500", industry: "Commercial Property", city: "Sheffield",   status: "Active",   source: "from_lead", customerSince: ymd(120), totalValue: "18900.00", currency: "GBP", notes: "New fit-out every tenant change. Good credit history.", tags: ["commercial"],           createdAt: iso(120), updatedAt: iso(7)  },
    { id: "dp-cus-004", name: "Karen Bhatt",       company: "TechNova Solutions",           email: "k.bhatt@technova.co.uk",           phone: "+44 113 450 9900", industry: "Technology",         city: "Leeds",       status: "Active",   source: "direct",    customerSince: ymd(90),  totalValue: "12400.00", currency: "GBP", notes: "Growing tech company. Office expansion planned.",       tags: ["growth"],               createdAt: iso(90),  updatedAt: iso(10) },
    { id: "dp-cus-005", name: "Daniel Sutton",     company: "Bradford City Council",        email: "d.sutton@bradford.gov.uk",         phone: "+44 1274 431 000", industry: "Public Sector",      city: "Bradford",    status: "Active",   source: "from_lead", customerSince: ymd(200), totalValue: "67300.00", currency: "GBP", notes: "Government account — purchase orders required.",        tags: ["public-sector", "key-account"], createdAt: iso(200), updatedAt: iso(2)  },
    { id: "dp-cus-006", name: "Prof. Carol Webb",  company: "Leeds Metropolitan University", email: "c.webb@leedsmet.ac.uk",            phone: "+44 113 812 0000", industry: "Education",          city: "Leeds",       status: "Active",   source: "direct",    customerSince: ymd(240), totalValue: "89500.00", currency: "GBP", notes: "Annual framework agreement. Tender required >£25k.",    tags: ["education", "key-account"],    createdAt: iso(240), updatedAt: iso(1)  },
    { id: "dp-cus-007", name: "Lisa Donovan",      company: "Northern Healthcare Trust",    email: "l.donovan@northernhct.nhs.uk",     phone: "+44 1482 875 875", industry: "Healthcare",         city: "Hull",        status: "Active",   source: "from_lead", customerSince: ymd(60),  totalValue: "9800.00",  currency: "GBP", notes: "NHS procurement. Payment within 90 days via BACS.",    tags: ["healthcare", "nhs"],    createdAt: iso(60),  updatedAt: iso(15) },
    { id: "dp-cus-008", name: "Steve Chapman",     company: "Humber Retail Ltd.",           email: "s.chapman@humberretail.co.uk",     phone: "+44 1482 330 450", industry: "Retail",             city: "Hull",        status: "Inactive", source: "direct",    customerSince: ymd(300), totalValue: "5200.00",  currency: "GBP", notes: "Account dormant — last order 10 months ago.",           tags: [],                       createdAt: iso(300), updatedAt: iso(90) },
  ]);

  // ── 14. LEADS ──────────────────────────────────────────────────────────────
  put("admin-leads", [
    { id: "dp-lead-001", name: "Thomas Hardy",    company: "Harrogate Properties",  email: "t.hardy@harrogateproperties.co.uk", phone: "+44 1423 556 900", industry: "Real Estate",       city: "Harrogate",    country: "UK", website: "", status: "Won",          source: "Referral",    notes: "Converted to customer — Horizon referral. Office refurb project.", isRelevant: true,  dealValue: 22000, assignedTo: "Sarah Mitchell", createdAt: iso(95), updatedAt: iso(20) },
    { id: "dp-lead-002", name: "Maria Gonzalez",  company: "Docklands Hotel",       email: "m.gonzalez@docklandshotel.co.uk",  phone: "+44 1482 407 200", industry: "Hospitality",       city: "Hull",         country: "UK", website: "", status: "Qualified",    source: "Cold Call",   notes: "Needs 80 bedroom sets + lobby furniture. Site visit booked for April 22.", isRelevant: true, dealValue: 48000, assignedTo: "James Thornton", nextReminder: ymd(-3), reminderNote: "Follow up after site visit", createdAt: iso(40), updatedAt: iso(5) },
    { id: "dp-lead-003", name: "Alan Briggs",     company: "North Sea Logistics",   email: "a.briggs@northsealogistics.co.uk", phone: "+44 1472 700 100", industry: "Logistics",         city: "Grimsby",      country: "UK", website: "", status: "Contacted",    source: "LinkedIn",    notes: "Wants to furnish new head office 3,000 sqft. Budget TBC.", isRelevant: true, dealValue: 30000, assignedTo: "Emma Whitfield", nextReminder: ymd(-5), reminderNote: "Send catalogue", createdAt: iso(30), updatedAt: iso(8) },
    { id: "dp-lead-004", name: "Sophie Williams", company: "YorkTech Solutions",    email: "s.williams@yorktech.co.uk",        phone: "+44 1904 880 200", industry: "Technology",        city: "York",         country: "UK", website: "", status: "New",          source: "Website",     notes: "Enquired about standing desks and ergonomic chairs. Needs quote.", isRelevant: true, dealValue: 8500, createdAt: iso(5), updatedAt: iso(5) },
    { id: "dp-lead-005", name: "Peter Sullivan",  company: "Midland Insurance PLC", email: "p.sullivan@midlandinsurance.co.uk", phone: "+44 121 880 4400", industry: "Financial Services", city: "Birmingham",  country: "UK", website: "", status: "Proposal Sent", source: "Trade Show", notes: "Met at Offices 2024 expo. Proposal sent for 200 office chairs.", isRelevant: true, dealValue: 55000, assignedTo: "Sarah Mitchell", nextReminder: ymd(-7), reminderNote: "Awaiting response to proposal", createdAt: iso(25), updatedAt: iso(7) },
    { id: "dp-lead-006", name: "Fiona Patel",     company: "EduFirst Academy",      email: "f.patel@edufirst.ac.uk",           phone: "+44 1132 440 600", industry: "Education",         city: "Leeds",        country: "UK", website: "", status: "Qualified",    source: "Referral",    notes: "Referred by Leeds Met Uni. New academy needs staffroom + reception.", isRelevant: true, dealValue: 18000, assignedTo: "Emma Whitfield", createdAt: iso(18), updatedAt: iso(4) },
    { id: "dp-lead-007", name: "Craig Lawson",    company: "Velocity Motors",       email: "c.lawson@velocitymotors.co.uk",    phone: "+44 1904 560 800", industry: "Automotive",        city: "York",         country: "UK", website: "", status: "New",          source: "Cold Call",   notes: "Showroom refurb. Interested in sofas and display tables.", isRelevant: false, dealValue: 6000, createdAt: iso(3), updatedAt: iso(3) },
    { id: "dp-lead-008", name: "Helen Chang",     company: "Sheffield Health Spa",  email: "h.chang@sheffieldhealthspa.co.uk", phone: "+44 114 270 0900", industry: "Wellness",          city: "Sheffield",    country: "UK", website: "", status: "Lost",         source: "Website",     notes: "Went with competitor — cheaper flat-pack range. Price sensitivity high.", isRelevant: false, dealValue: 4500, createdAt: iso(60), updatedAt: iso(30) },
    { id: "dp-lead-009", name: "James Porter",    company: "ClearWater Hotels",     email: "j.porter@clearwaterhotels.co.uk",  phone: "+44 1482 960 100", industry: "Hospitality",       city: "Hull",         country: "UK", website: "", status: "Contacted",    source: "LinkedIn",    notes: "Chain of 4 budget hotels. Wants durable, easy-clean furniture.", isRelevant: true, dealValue: 35000, assignedTo: "James Thornton", createdAt: iso(15), updatedAt: iso(6) },
    { id: "dp-lead-010", name: "Diana Moore",     company: "PrimeSpace Office Co.", email: "d.moore@primespace.co.uk",         phone: "+44 207 400 8800", industry: "Commercial Property", city: "London",      country: "UK", website: "", status: "Proposal Sent", source: "Referral",  notes: "Manages serviced offices — ongoing requirement 2× per year.", isRelevant: true, dealValue: 40000, assignedTo: "Sarah Mitchell", nextReminder: ymd(-2), reminderNote: "Decision expected this week", createdAt: iso(12), updatedAt: iso(2) },
  ]);

  // ── 15. PURCHASE ORDERS ────────────────────────────────────────────────────
  put("admin-purchase-orders", [
    {
      id: "dp-po-001", poNumber: "PO-202501-001", supplier: "Yorkshire Timber Co.", orderDate: ymd(75), deliveryDate: ymd(60), status: "Received", notes: "Q1 timber stock replenishment. Grade A oak boards.",
      items: [
        { id: "dp-poi-001", itemType: "raw-material", rmId: "dp-rm-001", productName: "Oak Timber Board", qty: "200", unit: "m²",    unitPrice: "12.50", notes: "FSC certified" },
        { id: "dp-poi-002", itemType: "raw-material", rmId: "dp-rm-006", productName: "MDF Board",         qty: "100", unit: "sheet", unitPrice: "9.75",  notes: "18mm MR grade" },
      ], createdAt: iso(75), updatedAt: iso(60),
    },
    {
      id: "dp-po-002", poNumber: "PO-202502-002", supplier: "SteelForm UK Ltd.", orderDate: ymd(55), deliveryDate: ymd(42), status: "Received", notes: "Steel tubing and chair base components for Q2 production.",
      items: [
        { id: "dp-poi-003", itemType: "raw-material", rmId: "dp-rm-002", productName: "Steel Tubing",     qty: "250", unit: "m",   unitPrice: "4.80",  notes: "25mm diameter" },
        { id: "dp-poi-004", itemType: "raw-material", rmId: "dp-rm-007", productName: "Chrome Chair Base", qty: "80",  unit: "pcs", unitPrice: "14.90", notes: "5-star 65cm" },
        { id: "dp-poi-005", itemType: "raw-material", rmId: "dp-rm-008", productName: "Gas Lift Cylinder", qty: "80",  unit: "pcs", unitPrice: "7.20",  notes: "Class 4 150mm" },
      ], createdAt: iso(55), updatedAt: iso(42),
    },
    {
      id: "dp-po-003", poNumber: "PO-202502-003", supplier: "FabriCo Upholstery", orderDate: ymd(35), deliveryDate: ymd(21), status: "Received", notes: "Fabric and foam for seating production run.",
      items: [
        { id: "dp-poi-006", itemType: "raw-material", rmId: "dp-rm-003", productName: "High-Density Foam",  qty: "120", unit: "m²", unitPrice: "8.20", notes: "BS7177 fire rated" },
        { id: "dp-poi-007", itemType: "raw-material", rmId: "dp-rm-004", productName: "Upholstery Fabric",  qty: "300", unit: "m",  unitPrice: "6.50", notes: "Commercial grade grey" },
      ], createdAt: iso(35), updatedAt: iso(21),
    },
    {
      id: "dp-po-004", poNumber: "PO-202503-004", supplier: "Nordic Wood Imports", orderDate: ymd(18), deliveryDate: ymd(-10), status: "Sent", notes: "Scandinavian pine for new product range. ETA next month.",
      items: [
        { id: "dp-poi-008", itemType: "raw-material", rmId: "dp-rm-001", productName: "Oak Timber Board", qty: "300", unit: "m²",    unitPrice: "12.50", notes: "FSC Nordic certified" },
        { id: "dp-poi-009", itemType: "raw-material", rmId: "dp-rm-006", productName: "MDF Board",         qty: "80",  unit: "sheet", unitPrice: "9.75",  notes: "" },
      ], createdAt: iso(18), updatedAt: iso(18),
    },
    {
      id: "dp-po-005", poNumber: "PO-202504-005", supplier: "FastFix Industrial", orderDate: ymd(5), deliveryDate: ymd(-7), status: "Draft", notes: "Screws and fixings replenishment.",
      items: [
        { id: "dp-poi-010", itemType: "raw-material", rmId: "dp-rm-005", productName: "Stainless Screws (box)", qty: "50", unit: "box", unitPrice: "3.40", notes: "M6 wood screws" },
      ], createdAt: iso(5), updatedAt: iso(5),
    },
  ]);

  // ── 16. SALES ──────────────────────────────────────────────────────────────
  put("admin-sales", [
    {
      id: "dp-sal-001", saleNumber: "SAL-202502-001", saleDate: ymd(55), customer: "Horizon Office Supplies", status: "Completed", paymentMethod: "Bank Transfer", stockDeducted: true,
      amountPaid: "1699.95", paidAt: iso(52), agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      taxRate: "20", notes: "Initial order — executive chairs for new Leeds office.",
      items: [
        { id: "dp-sali-001", productName: "Executive Office Chair",  sku: "EXC-CHAIR-001", qty: "5", unit: "pcs", unitPrice: "299.99", discount: "0",  notes: "", itemStatus: "Delivered" },
        { id: "dp-sali-002", productName: "Ergonomic Meeting Chair", sku: "MTG-CHR-010",   qty: "2", unit: "pcs", unitPrice: "199.99", discount: "0",  notes: "", itemStatus: "Delivered" },
      ], createdAt: iso(55), updatedAt: iso(52),
    },
    {
      id: "dp-sal-002", saleNumber: "SAL-202502-002", saleDate: ymd(45), customer: "Greenfield Hotels Group", status: "On Credit", paymentMethod: "Bank Transfer", stockDeducted: true,
      amountPaid: "6000.00", paidAt: iso(40), agentId: "dp-sa-002", agentName: "James Thornton",
      taxRate: "20", notes: "Phase 1 of hotel lobby refurb. Balance due 60 days.",
      items: [
        { id: "dp-sali-003", productName: "L-Shape Corner Sofa",     sku: "COR-SOF-007",   qty: "3",  unit: "pcs", unitPrice: "1199.00", discount: "5",  notes: "Volume discount", itemStatus: "Delivered" },
        { id: "dp-sali-004", productName: "Solid Oak Coffee Table",   sku: "OAK-COF-004",   qty: "6",  unit: "pcs", unitPrice: "189.00",  discount: "5",  notes: "Volume discount", itemStatus: "Delivered" },
        { id: "dp-sali-005", productName: "Ergonomic Meeting Chair",  sku: "MTG-CHR-010",   qty: "10", unit: "pcs", unitPrice: "199.99",  discount: "10", notes: "Lobby chairs",    itemStatus: "Delivered" },
      ], createdAt: iso(45), updatedAt: iso(40),
    },
    {
      id: "dp-sal-003", saleNumber: "SAL-202503-003", saleDate: ymd(35), customer: "TechNova Solutions", status: "Completed", paymentMethod: "Card", stockDeducted: true,
      amountPaid: "1349.97", paidAt: iso(35), agentId: "dp-sa-003", agentName: "Emma Whitfield",
      taxRate: "20", notes: "Remote-work desk setup for 3 home offices.",
      items: [
        { id: "dp-sali-006", productName: "Height Adjustable Desk",  sku: "HGT-DESK-002",  qty: "3", unit: "pcs", unitPrice: "449.99", discount: "0", notes: "", itemStatus: "Delivered" },
      ], createdAt: iso(35), updatedAt: iso(35),
    },
    {
      id: "dp-sal-004", saleNumber: "SAL-202503-004", saleDate: ymd(28), customer: "Bradford City Council", status: "On Credit", paymentMethod: "Bank Transfer", stockDeducted: true,
      amountPaid: "0.00", paidAt: "", agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      taxRate: "20", notes: "Council office bedroom suites — payment on PO. 90-day terms.",
      items: [
        { id: "dp-sali-007", productName: "3-Door Oak Wardrobe",        sku: "OAK-WRD-003",   qty: "4", unit: "pcs", unitPrice: "699.00",  discount: "8",  notes: "Council discount", itemStatus: "Delivered" },
        { id: "dp-sali-008", productName: "Bedside Cabinet (2-Drawer)", sku: "BDS-CAB-008",   qty: "8", unit: "pcs", unitPrice: "129.00",  discount: "8",  notes: "Council discount", itemStatus: "Delivered" },
      ], createdAt: iso(28), updatedAt: iso(28),
    },
    {
      id: "dp-sal-005", saleNumber: "SAL-202503-005", saleDate: ymd(20), customer: "Leeds Metropolitan University", status: "Completed", paymentMethod: "Bank Transfer", stockDeducted: true,
      amountPaid: "5094.00", paidAt: iso(18), agentId: "dp-sa-003", agentName: "Emma Whitfield",
      taxRate: "20", notes: "Student common room refurb — dining sets.",
      items: [
        { id: "dp-sali-009", productName: "6-Seat Dining Table Set", sku: "DIN-SET-006", qty: "6", unit: "set", unitPrice: "849.00", discount: "0", notes: "Framework agreement price", itemStatus: "Delivered" },
      ], createdAt: iso(20), updatedAt: iso(18),
    },
    {
      id: "dp-sal-006", saleNumber: "SAL-202504-006", saleDate: ymd(12), customer: "Northern Healthcare Trust", status: "Draft", paymentMethod: "Bank Transfer", stockDeducted: false,
      amountPaid: "0.00", paidAt: "", agentId: "dp-sa-002", agentName: "James Thornton",
      taxRate: "0", notes: "NHS bulk order — awaiting purchase order from trust.",
      items: [
        { id: "dp-sali-010", productName: "Executive Office Chair",  sku: "EXC-CHAIR-001", qty: "15", unit: "pcs", unitPrice: "299.99", discount: "12", notes: "NHS approved supplier rate", itemStatus: "Pending" },
        { id: "dp-sali-011", productName: "4-Drawer Filing Cabinet", sku: "FIL-CAB-009",   qty: "8",  unit: "pcs", unitPrice: "279.00", discount: "12", notes: "", itemStatus: "Pending" },
      ], createdAt: iso(12), updatedAt: iso(12),
    },
    {
      id: "dp-sal-007", saleNumber: "SAL-202504-007", saleDate: ymd(7), customer: "Humber Retail Ltd.", status: "Completed", paymentMethod: "Cash", stockDeducted: true,
      amountPaid: "1113.00", paidAt: iso(7), agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      taxRate: "20", notes: "Clearance pricing on older lines. Cash sale.",
      items: [
        { id: "dp-sali-012", productName: "Solid Oak Coffee Table", sku: "OAK-COF-004", qty: "4", unit: "pcs", unitPrice: "189.00", discount: "10", notes: "Clearance",   itemStatus: "Delivered" },
        { id: "dp-sali-013", productName: "5-Shelf Bookcase",       sku: "BCK-5SH-005", qty: "3", unit: "pcs", unitPrice: "149.99", discount: "10", notes: "Clearance",   itemStatus: "Delivered" },
      ], createdAt: iso(7), updatedAt: iso(7),
    },
    {
      id: "dp-sal-008", saleNumber: "SAL-202504-008", saleDate: ymd(3), customer: "Sheffield Business Park", status: "On Credit", paymentMethod: "Bank Transfer", stockDeducted: true,
      amountPaid: "500.00", paidAt: iso(3), agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      taxRate: "20", notes: "Office refurb phase 2. Part payment received.",
      items: [
        { id: "dp-sali-014", productName: "4-Drawer Filing Cabinet",    sku: "FIL-CAB-009",  qty: "5", unit: "pcs", unitPrice: "279.00", discount: "0", notes: "", itemStatus: "Delivered" },
        { id: "dp-sali-015", productName: "Executive Office Chair",     sku: "EXC-CHAIR-001", qty: "4", unit: "pcs", unitPrice: "299.99", discount: "0", notes: "", itemStatus: "Delivered" },
        { id: "dp-sali-016", productName: "Standing Desk Converter",    sku: "STD-CNV-011",  qty: "4", unit: "pcs", unitPrice: "179.00", discount: "0", notes: "", itemStatus: "Pending"   },
      ], createdAt: iso(3), updatedAt: iso(3),
    },
  ]);

  // ── 17. INVOICES ───────────────────────────────────────────────────────────
  put("admin-invoices", [
    {
      id: "dp-inv-001", invoiceNumber: "INV-202502-001", invoiceTitle: "Tax Invoice", invoiceType: "sale", invoiceDate: ymd(52), dueDate: ymd(22),
      customer: "Horizon Office Supplies", customerId: "dp-cus-001", buyerAddress: "22 Commerce Street, Leeds, LS1 4HJ", buyerPhone: "+44 113 200 3300", buyerEmail: "j.matthews@horizonoffice.co.uk",
      status: "Paid", paymentMethod: "Bank Transfer", paymentTerms: "Net 30", bankDetails: "Barclays — Sort: 20-44-33 / Acc: 58971024",
      amountPaid: "2039.94", paidAt: iso(38), paymentHistory: [{ id: "ph-001", date: ymd(38), amount: "2039.94", method: "Bank Transfer", note: "Payment received in full" }],
      taxRate: "20", shippingFee: "0", handlingFee: "0", shippingMethod: "Own Delivery",
      agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      notes: "Full payment received. VAT invoice for records.", agreement: "", invoiceFooter: "Thank you for your business!", stockDeducted: true,
      items: [
        { id: "dp-ii-001", productName: "Executive Office Chair",  sku: "EXC-CHAIR-001", qty: "5", unit: "pcs", unitPrice: "299.99", discount: "0",  notes: "", itemStatus: "Delivered" },
        { id: "dp-ii-002", productName: "Ergonomic Meeting Chair", sku: "MTG-CHR-010",   qty: "2", unit: "pcs", unitPrice: "199.99", discount: "0",  notes: "", itemStatus: "Delivered" },
      ], createdAt: iso(52), updatedAt: iso(38),
    },
    {
      id: "dp-inv-002", invoiceNumber: "INV-202502-002", invoiceTitle: "Tax Invoice", invoiceType: "sale", invoiceDate: ymd(42), dueDate: ymd(2),
      customer: "Greenfield Hotels Group", customerId: "dp-cus-002", buyerAddress: "Riverside House, Marina Way, Hull, HU1 1RA", buyerPhone: "+44 1482 500 700", buyerEmail: "a.pearce@greenfieldhotels.co.uk",
      status: "Partial", paymentMethod: "Bank Transfer", paymentTerms: "60 Days",
      bankDetails: "Barclays — Sort: 20-44-33 / Acc: 58971024",
      amountPaid: "6000.00", paidAt: iso(35), paymentHistory: [{ id: "ph-002", date: ymd(35), amount: "6000.00", method: "Bank Transfer", note: "Part payment received" }],
      taxRate: "20", shippingFee: "150.00", handlingFee: "0", shippingMethod: "Own Delivery",
      agentId: "dp-sa-002", agentName: "James Thornton",
      notes: "Balance outstanding £5,012.30. Payment chase sent 5 April.", agreement: "", invoiceFooter: "Thank you for choosing Premier Furnishings!", stockDeducted: true,
      items: [
        { id: "dp-ii-003", productName: "L-Shape Corner Sofa",    sku: "COR-SOF-007",  qty: "3",  unit: "pcs", unitPrice: "1199.00", discount: "5",  notes: "Volume discount",  itemStatus: "Delivered" },
        { id: "dp-ii-004", productName: "Solid Oak Coffee Table",  sku: "OAK-COF-004",  qty: "6",  unit: "pcs", unitPrice: "189.00",  discount: "5",  notes: "Volume discount",  itemStatus: "Delivered" },
        { id: "dp-ii-005", productName: "Ergonomic Meeting Chair", sku: "MTG-CHR-010",  qty: "10", unit: "pcs", unitPrice: "199.99",  discount: "10", notes: "Lobby seating",    itemStatus: "Delivered" },
      ], createdAt: iso(42), updatedAt: iso(35),
    },
    {
      id: "dp-inv-003", invoiceNumber: "INV-202503-003", invoiceTitle: "Invoice", invoiceType: "sale", invoiceDate: ymd(33), dueDate: ymd(3),
      customer: "TechNova Solutions", customerId: "dp-cus-004", buyerAddress: "TechNova House, Whitehall Road, Leeds, LS12 1BE", buyerPhone: "+44 113 450 9900", buyerEmail: "k.bhatt@technova.co.uk",
      status: "Paid", paymentMethod: "Card", paymentTerms: "Due on Receipt",
      bankDetails: "Barclays — Sort: 20-44-33 / Acc: 58971024",
      amountPaid: "1619.97", paidAt: iso(33), paymentHistory: [{ id: "ph-003", date: ymd(33), amount: "1619.97", method: "Card", note: "Card payment at delivery" }],
      taxRate: "20", shippingFee: "50.00", handlingFee: "0", shippingMethod: "Courier",
      agentId: "dp-sa-003", agentName: "Emma Whitfield",
      notes: "Paid in full on delivery.", agreement: "", invoiceFooter: "", stockDeducted: true,
      items: [
        { id: "dp-ii-006", productName: "Height Adjustable Desk", sku: "HGT-DESK-002", qty: "3", unit: "pcs", unitPrice: "449.99", discount: "0", notes: "", itemStatus: "Delivered" },
      ], createdAt: iso(33), updatedAt: iso(33),
    },
    {
      id: "dp-inv-004", invoiceNumber: "INV-202503-004", invoiceTitle: "Tax Invoice", invoiceType: "sale", invoiceDate: ymd(26), dueDate: ymd(-64),
      customer: "Bradford City Council", customerId: "dp-cus-005", buyerAddress: "City Hall, Centenary Square, Bradford, BD1 1HY", buyerPhone: "+44 1274 431 000", buyerEmail: "d.sutton@bradford.gov.uk",
      status: "Overdue", paymentMethod: "Bank Transfer", paymentTerms: "90 Days",
      bankDetails: "Barclays — Sort: 20-44-33 / Acc: 58971024",
      amountPaid: "0.00", paidAt: "", paymentHistory: [],
      taxRate: "20", shippingFee: "200.00", handlingFee: "0", shippingMethod: "Own Delivery",
      agentId: "dp-sa-001", agentName: "Sarah Mitchell",
      notes: "Payment overdue. Escalated to finance for follow-up. PO reference: BCC-2024-7834.", agreement: "", invoiceFooter: "", stockDeducted: true,
      items: [
        { id: "dp-ii-007", productName: "3-Door Oak Wardrobe",        sku: "OAK-WRD-003",  qty: "4", unit: "pcs", unitPrice: "699.00",  discount: "8", notes: "Council pricing", itemStatus: "Delivered" },
        { id: "dp-ii-008", productName: "Bedside Cabinet (2-Drawer)", sku: "BDS-CAB-008",  qty: "8", unit: "pcs", unitPrice: "129.00",  discount: "8", notes: "Council pricing", itemStatus: "Delivered" },
      ], createdAt: iso(26), updatedAt: iso(10),
    },
    {
      id: "dp-inv-005", invoiceNumber: "INV-202504-005", invoiceTitle: "Tax Invoice", invoiceType: "sale", invoiceDate: ymd(18), dueDate: ymd(12),
      customer: "Leeds Metropolitan University", customerId: "dp-cus-006", buyerAddress: "Headingley Campus, Leeds, LS6 3QS", buyerPhone: "+44 113 812 0000", buyerEmail: "c.webb@leedsmet.ac.uk",
      status: "Sent", paymentMethod: "Bank Transfer", paymentTerms: "Net 30",
      bankDetails: "Barclays — Sort: 20-44-33 / Acc: 58971024",
      amountPaid: "0.00", paidAt: "", paymentHistory: [],
      taxRate: "20", shippingFee: "0", handlingFee: "0", shippingMethod: "Own Delivery",
      agentId: "dp-sa-003", agentName: "Emma Whitfield",
      notes: "Awaiting payment. Framework agreement FY2024.", agreement: "", invoiceFooter: "", stockDeducted: true,
      items: [
        { id: "dp-ii-009", productName: "6-Seat Dining Table Set", sku: "DIN-SET-006", qty: "6", unit: "set", unitPrice: "849.00", discount: "0", notes: "Framework price", itemStatus: "Delivered" },
      ], createdAt: iso(18), updatedAt: iso(18),
    },
  ]);

  // ── 18. MANUFACTURING ORDERS ───────────────────────────────────────────────
  put("admin-manufacturing-orders", [
    {
      id: "dp-mo-001", orderNumber: "MO-2024-001", orderDate: ymd(65), status: "Completed",
      notes: "Q1 batch — executive office chairs. All chairs QC passed.",
      inputs: [
        { id: "dp-mi-001", rmId: "dp-rm-002", rmName: "Steel Tubing",           unit: "m",   qtyUsed: "120" },
        { id: "dp-mi-002", rmId: "dp-rm-003", rmName: "High-Density Foam",      unit: "m²",  qtyUsed: "60"  },
        { id: "dp-mi-003", rmId: "dp-rm-004", rmName: "Upholstery Fabric",      unit: "m",   qtyUsed: "90"  },
        { id: "dp-mi-004", rmId: "dp-rm-007", rmName: "Chrome Chair Base",      unit: "pcs", qtyUsed: "50"  },
        { id: "dp-mi-005", rmId: "dp-rm-008", rmName: "Gas Lift Cylinder",      unit: "pcs", qtyUsed: "50"  },
      ],
      outputs: [
        { id: "dp-mo-out-001", productId: "dp-prod-001", productName: "Executive Office Chair", qty: "50", unit: "pcs" },
      ],
      productionCosts: [
        { id: "dp-pc-001", description: "Labour — workshop staff (5 days)",    amount: "2800" },
        { id: "dp-pc-002", description: "Machine depreciation & electricity",  amount: "450"  },
        { id: "dp-pc-003", description: "Quality control & testing",           amount: "200"  },
      ],
      wasteQty: "8", wasteUnit: "pcs", wasteNotes: "8 units rejected at QC — foam defects. Scrapped.",
      createdAt: iso(65), updatedAt: iso(45),
    },
    {
      id: "dp-mo-002", orderNumber: "MO-2024-002", orderDate: ymd(30), status: "In Progress",
      notes: "Height adjustable desks — 20 units. Steel frames welded, awaiting oak tops.",
      inputs: [
        { id: "dp-mi-006", rmId: "dp-rm-001", rmName: "Oak Timber Board", unit: "m²",  qtyUsed: "45" },
        { id: "dp-mi-007", rmId: "dp-rm-002", rmName: "Steel Tubing",     unit: "m",   qtyUsed: "80" },
        { id: "dp-mi-008", rmId: "dp-rm-005", rmName: "Stainless Screws (box)", unit: "box", qtyUsed: "8" },
        { id: "dp-mi-009", rmId: "dp-rm-006", rmName: "MDF Board",        unit: "sheet", qtyUsed: "20" },
      ],
      outputs: [
        { id: "dp-mo-out-002", productId: "dp-prod-002", productName: "Height Adjustable Desk", qty: "20", unit: "pcs" },
      ],
      productionCosts: [
        { id: "dp-pc-004", description: "Labour — 4 joiners × 3 days",        amount: "2100" },
        { id: "dp-pc-005", description: "Welding & finishing equipment",        amount: "380"  },
      ],
      wasteQty: "0", wasteUnit: "", wasteNotes: "",
      createdAt: iso(30), updatedAt: iso(10),
    },
    {
      id: "dp-mo-003", orderNumber: "MO-2024-003", orderDate: ymd(8), status: "Draft",
      notes: "Planned production run — solid oak coffee tables for Q2 stock build.",
      inputs: [
        { id: "dp-mi-010", rmId: "dp-rm-001", rmName: "Oak Timber Board", unit: "m²",    qtyUsed: "90"  },
        { id: "dp-mi-011", rmId: "dp-rm-005", rmName: "Stainless Screws (box)", unit: "box", qtyUsed: "15" },
        { id: "dp-mi-012", rmId: "dp-rm-006", rmName: "MDF Board",         unit: "sheet", qtyUsed: "30"  },
      ],
      outputs: [
        { id: "dp-mo-out-003", productId: "dp-prod-004", productName: "Solid Oak Coffee Table", qty: "30", unit: "pcs" },
      ],
      productionCosts: [
        { id: "dp-pc-006", description: "Labour — workshop (2 joiners × 5 days)", amount: "1800" },
        { id: "dp-pc-007", description: "Finishing materials (varnish, sandpaper)", amount: "220" },
      ],
      wasteQty: "0", wasteUnit: "", wasteNotes: "",
      createdAt: iso(8), updatedAt: iso(8),
    },
  ]);

  // ── 19. CHART OF ACCOUNTS ─────────────────────────────────────────────────
  const coaNow = iso(0);
  put("admin-chart-of-accounts", [
    // Assets — Groups
    { id: "dp-coa-a",   code: "1000", name: "Assets",              head: "Assets",           subType: "Current Asset",     description: "All company assets",                       parentId: null,       accountType: "Group",  openingBalance: 0,         paymentType: null,    isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-a1",  code: "1100", name: "Cash & Bank",         head: "Assets",           subType: "Current Asset",     description: "Cash in hand and bank balances",            parentId: "dp-coa-a", accountType: "Ledger", openingBalance: 42850.00,  paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-a2",  code: "1200", name: "Accounts Receivable", head: "Assets",           subType: "Current Asset",     description: "Amounts owed by customers",                 parentId: "dp-coa-a", accountType: "Ledger", openingBalance: 0,         paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-a3",  code: "1300", name: "Inventory",           head: "Assets",           subType: "Current Asset",     description: "Stock on hand — finished goods",            parentId: "dp-coa-a", accountType: "Ledger", openingBalance: 38200.00,  paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-a4",  code: "1400", name: "Raw Material Stock",  head: "Assets",           subType: "Current Asset",     description: "Raw materials and components in store",     parentId: "dp-coa-a", accountType: "Ledger", openingBalance: 14750.00,  paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-a5",  code: "1500", name: "Plant & Equipment",   head: "Assets",           subType: "Fixed Asset",       description: "Machinery, tools and workshop equipment",   parentId: "dp-coa-a", accountType: "Ledger", openingBalance: 125000.00, paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-a6",  code: "1600", name: "Showroom Fixtures",   head: "Assets",           subType: "Fixed Asset",       description: "Showroom fittings and display furniture",   parentId: "dp-coa-a", accountType: "Ledger", openingBalance: 18500.00,  paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    // Liabilities
    { id: "dp-coa-l",   code: "2000", name: "Liabilities",         head: "Liabilities",      subType: "Current Liability", description: "All company liabilities",                   parentId: null,       accountType: "Group",  openingBalance: 0,         paymentType: null,    isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-l1",  code: "2100", name: "Accounts Payable",    head: "Liabilities",      subType: "Current Liability", description: "Amounts owed to suppliers",                 parentId: "dp-coa-l", accountType: "Ledger", openingBalance: 9800.00,   paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-l2",  code: "2200", name: "VAT Payable",         head: "Liabilities",      subType: "Current Liability", description: "VAT collected less VAT reclaimable",        parentId: "dp-coa-l", accountType: "Ledger", openingBalance: 3200.00,   paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-l3",  code: "2300", name: "Bank Loan",           head: "Liabilities",      subType: "Long-term Liability", description: "5-year term loan — Barclays Business",  parentId: "dp-coa-l", accountType: "Ledger", openingBalance: 75000.00,  paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-l4",  code: "2400", name: "Accrued Salaries",    head: "Liabilities",      subType: "Current Liability", description: "Salaries earned but not yet paid",          parentId: "dp-coa-l", accountType: "Ledger", openingBalance: 5400.00,   paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    // Revenue
    { id: "dp-coa-r",   code: "4000", name: "Revenue",             head: "Revenue / Income", subType: "Operating Revenue", description: "Income from operations",                    parentId: null,       accountType: "Group",  openingBalance: 0,         paymentType: null,    isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-r1",  code: "4100", name: "Product Sales",       head: "Revenue / Income", subType: "Operating Revenue", description: "Revenue from furniture and product sales",  parentId: "dp-coa-r", accountType: "Ledger", openingBalance: 0,         paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-r2",  code: "4200", name: "Delivery Income",     head: "Revenue / Income", subType: "Operating Revenue", description: "Revenue from delivery and installation charges", parentId: "dp-coa-r", accountType: "Ledger", openingBalance: 0,   paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-r3",  code: "4900", name: "Other Income",        head: "Revenue / Income", subType: "Other Income",      description: "Miscellaneous income",                     parentId: "dp-coa-r", accountType: "Ledger", openingBalance: 0,         paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    // Expenses
    { id: "dp-coa-e",   code: "5000", name: "Expenses",            head: "Expense",          subType: "Cost of Goods Sold", description: "All business expenses",                   parentId: null,       accountType: "Group",  openingBalance: 0,         paymentType: null,    isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-e1",  code: "5100", name: "Cost of Goods Sold",  head: "Expense",          subType: "Cost of Goods Sold", description: "Direct cost of products sold",            parentId: "dp-coa-e", accountType: "Ledger", openingBalance: 0,         paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-e2",  code: "5200", name: "Salaries & Wages",    head: "Expense",          subType: "Operating Expense", description: "Staff salaries, wages and NI contributions", parentId: "dp-coa-e", accountType: "Ledger", openingBalance: 0,       paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-e3",  code: "5300", name: "Rent & Premises",     head: "Expense",          subType: "Operating Expense", description: "Workshop, showroom and office rent",        parentId: "dp-coa-e", accountType: "Ledger", openingBalance: 0,         paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-e4",  code: "5400", name: "Utilities",           head: "Expense",          subType: "Operating Expense", description: "Electricity, gas and water for premises",   parentId: "dp-coa-e", accountType: "Ledger", openingBalance: 0,         paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-e5",  code: "5500", name: "Marketing & Advertising", head: "Expense",      subType: "Operating Expense", description: "Trade shows, digital ads and catalogues",   parentId: "dp-coa-e", accountType: "Ledger", openingBalance: 0,         paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-e6",  code: "5600", name: "Vehicle & Delivery",  head: "Expense",          subType: "Operating Expense", description: "Delivery vehicle costs and fuel",           parentId: "dp-coa-e", accountType: "Ledger", openingBalance: 0,         paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-e7",  code: "5700", name: "Bank Charges & Interest", head: "Expense",      subType: "Other Expense",     description: "Bank fees, loan interest",                  parentId: "dp-coa-e", accountType: "Ledger", openingBalance: 0,         paymentType: "Debit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    // Equity
    { id: "dp-coa-q",   code: "3000", name: "Equity",              head: "Equity",           subType: "Owner's Equity",    description: "Owners' capital and retained earnings",    parentId: null,       accountType: "Group",  openingBalance: 0,         paymentType: null,    isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-q1",  code: "3100", name: "Share Capital",       head: "Equity",           subType: "Owner's Equity",    description: "Capital invested by shareholders",          parentId: "dp-coa-q", accountType: "Ledger", openingBalance: 150000.00, paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
    { id: "dp-coa-q2",  code: "3200", name: "Retained Earnings",   head: "Equity",           subType: "Retained Earnings", description: "Cumulative profits retained in business",   parentId: "dp-coa-q", accountType: "Ledger", openingBalance: 6500.00,   paymentType: "Credit", isActive: true, createdAt: coaNow, updatedAt: coaNow },
  ]);

  // ── 20. JOURNAL ENTRIES ────────────────────────────────────────────────────
  put("admin-journal-entries", [
    {
      id: "dp-je-001", date: ymd(80), reference: "JE-2024-001", description: "Opening balance — cash, inventory and capital", status: "posted",
      lines: [
        { id: "dp-jel-001", ledgerId: "dp-coa-a1", narration: "Opening cash & bank balance",  debit: 42850,   credit: 0       },
        { id: "dp-jel-002", ledgerId: "dp-coa-a3", narration: "Opening inventory value",       debit: 38200,   credit: 0       },
        { id: "dp-jel-003", ledgerId: "dp-coa-a4", narration: "Opening raw material stock",    debit: 14750,   credit: 0       },
        { id: "dp-jel-004", ledgerId: "dp-coa-q1", narration: "Share capital injected",        debit: 0,       credit: 150000  },
        { id: "dp-jel-005", ledgerId: "dp-coa-l3", narration: "Opening bank loan balance",     debit: 0,       credit: 75000   },
        { id: "dp-jel-006", ledgerId: "dp-coa-q2", narration: "Opening retained earnings",     debit: 0,       credit: 6500    },
        { id: "dp-jel-007", ledgerId: "dp-coa-a5", narration: "Plant & equipment value",       debit: 125000,  credit: 0       },
        { id: "dp-jel-008", ledgerId: "dp-coa-a6", narration: "Showroom fixtures value",       debit: 18500,   credit: 0       },
        { id: "dp-jel-009", ledgerId: "dp-coa-l1", narration: "Opening accounts payable",      debit: 0,       credit: 9800    },
        { id: "dp-jel-010", ledgerId: "dp-coa-l2", narration: "Opening VAT liability",         debit: 0,       credit: 3200    },
      ],
      totalDebit: 239300, totalCredit: 244500, isBalanced: false,
      createdAt: iso(80), updatedAt: iso(80),
    },
    {
      id: "dp-je-002", date: ymd(38), reference: "JE-2024-002", description: "Payment received — Horizon Office Supplies INV-202502-001", status: "posted",
      lines: [
        { id: "dp-jel-011", ledgerId: "dp-coa-a1", narration: "Bank receipt — Horizon Office Supplies",     debit: 2039.94, credit: 0       },
        { id: "dp-jel-012", ledgerId: "dp-coa-a2", narration: "Accounts receivable cleared — Horizon",      debit: 0,       credit: 1699.95 },
        { id: "dp-jel-013", ledgerId: "dp-coa-l2", narration: "VAT on sales — Horizon INV-202502-001",      debit: 0,       credit: 339.99  },
      ],
      totalDebit: 2039.94, totalCredit: 2039.94, isBalanced: true,
      createdAt: iso(38), updatedAt: iso(38),
    },
    {
      id: "dp-je-003", date: ymd(58), reference: "JE-2024-003", description: "Payment to Yorkshire Timber Co. — PO-202501-001", status: "posted",
      lines: [
        { id: "dp-jel-014", ledgerId: "dp-coa-l1", narration: "Purchase payable cleared — Yorkshire Timber", debit: 2925,    credit: 0    },
        { id: "dp-jel-015", ledgerId: "dp-coa-a1", narration: "Bank payment — Yorkshire Timber Co.",         debit: 0,       credit: 2925 },
      ],
      totalDebit: 2925, totalCredit: 2925, isBalanced: true,
      createdAt: iso(58), updatedAt: iso(58),
    },
    {
      id: "dp-je-004", date: ymd(30), reference: "JE-2024-004", description: "Monthly payroll — March 2024", status: "posted",
      lines: [
        { id: "dp-jel-016", ledgerId: "dp-coa-e2", narration: "Gross salaries — March",         debit: 22400, credit: 0     },
        { id: "dp-jel-017", ledgerId: "dp-coa-l4", narration: "Accrued salaries liability",     debit: 5400,  credit: 0     },
        { id: "dp-jel-018", ledgerId: "dp-coa-a1", narration: "Bank payment — payroll BACS",    debit: 0,     credit: 27800 },
      ],
      totalDebit: 27800, totalCredit: 27800, isBalanced: true,
      createdAt: iso(30), updatedAt: iso(30),
    },
    {
      id: "dp-je-005", date: ymd(15), reference: "JE-2024-005", description: "Quarterly VAT payment to HMRC", status: "posted",
      lines: [
        { id: "dp-jel-019", ledgerId: "dp-coa-l2", narration: "VAT liability cleared — Q4 return", debit: 4850, credit: 0    },
        { id: "dp-jel-020", ledgerId: "dp-coa-a1", narration: "Bank payment — HMRC VAT",           debit: 0,    credit: 4850 },
      ],
      totalDebit: 4850, totalCredit: 4850, isBalanced: true,
      createdAt: iso(15), updatedAt: iso(15),
    },
    {
      id: "dp-je-006", date: ymd(5), reference: "JE-2024-006", description: "Monthly premises rent — April 2024", status: "draft",
      lines: [
        { id: "dp-jel-021", ledgerId: "dp-coa-e3", narration: "Rent — workshop + showroom April", debit: 8500, credit: 0    },
        { id: "dp-jel-022", ledgerId: "dp-coa-a1", narration: "Bank payment — April rent",         debit: 0,    credit: 8500 },
      ],
      totalDebit: 8500, totalCredit: 8500, isBalanced: true,
      createdAt: iso(5), updatedAt: iso(5),
    },
  ]);

  // ── 21. ACTIVITY LOG ───────────────────────────────────────────────────────
  put("admin-activity-log", [
    { id: "dp-act-001", action: "created",      entity: "Sale",          entityName: "SAL-202502-001", detail: "Customer: Horizon Office Supplies",        user: "Lucy Hargreaves",  timestamp: iso(55) },
    { id: "dp-act-002", action: "completed",    entity: "Sale",          entityName: "SAL-202502-001", detail: "Completed · Bank Transfer",                user: "Rachel Foster",    timestamp: iso(52) },
    { id: "dp-act-003", action: "created",      entity: "Purchase Order", entityName: "PO-202502-002", detail: "SteelForm UK Ltd.",                        user: "Ahmed Malik",      timestamp: iso(55) },
    { id: "dp-act-004", action: "status_changed", entity: "Purchase Order", entityName: "PO-202502-002", detail: "Received — stock updated",               user: "Ahmed Malik",      timestamp: iso(42) },
    { id: "dp-act-005", action: "created",      entity: "Sale",          entityName: "SAL-202502-002", detail: "Customer: Greenfield Hotels Group",         user: "James Thornton",   timestamp: iso(45) },
    { id: "dp-act-006", action: "created",      entity: "Invoice",       entityName: "INV-202502-002", detail: "",                                          user: "Rachel Foster",    timestamp: iso(42) },
    { id: "dp-act-007", action: "created",      entity: "Sale",          entityName: "SAL-202503-003", detail: "Customer: TechNova Solutions",              user: "Emma Whitfield",   timestamp: iso(35) },
    { id: "dp-act-008", action: "completed",    entity: "Sale",          entityName: "SAL-202503-003", detail: "Completed · Card",                          user: "Emma Whitfield",   timestamp: iso(35) },
    { id: "dp-act-009", action: "updated",      entity: "ManufacturingOrder", entityName: "MO-2024-001", detail: "Status → Completed",                   user: "David Clarke",     timestamp: iso(45) },
    { id: "dp-act-010", action: "created",      entity: "Lead",          entityName: "Maria Gonzalez", detail: "Docklands Hotel — Cold Call",              user: "James Thornton",   timestamp: iso(40) },
    { id: "dp-act-011", action: "status_changed", entity: "Lead",        entityName: "Maria Gonzalez", detail: "Status → Qualified",                       user: "James Thornton",   timestamp: iso(30) },
    { id: "dp-act-012", action: "created",      entity: "Sale",          entityName: "SAL-202504-006", detail: "Customer: Northern Healthcare Trust",       user: "James Thornton",   timestamp: iso(12) },
    { id: "dp-act-013", action: "created",      entity: "Lead",          entityName: "Sophie Williams", detail: "YorkTech Solutions — Website",            user: "Emma Whitfield",   timestamp: iso(5)  },
    { id: "dp-act-014", action: "status_changed", entity: "Invoice",     entityName: "INV-202503-004", detail: "Status → Overdue",                         user: "Rachel Foster",    timestamp: iso(10) },
    { id: "dp-act-015", action: "created",      entity: "Sale",          entityName: "SAL-202504-008", detail: "Customer: Sheffield Business Park",         user: "Sarah Mitchell",   timestamp: iso(3)  },
  ]);

  // ── 22. TEAM MEMBERS ───────────────────────────────────────────────────────
  put("admin-team-members", [
    "David Clarke", "Lucy Hargreaves", "Ahmed Malik", "Rachel Foster",
    "Tom Blackwood", "Sophie Barker", "Marcus Webb", "Claire Hughes",
  ]);

  return DEMO_TENANT_ID;
}
