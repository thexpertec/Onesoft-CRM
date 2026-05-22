export interface MigrationCounts {
  accounts: number;
  journalEntries: number;
  customers: number;
  products: number;
  brands: number;
  productCategories: number;
  units: number;
  attributes: number;
  leads: number;
  departments: number;
  designations: number;
  cities: number;
  areas: number;
  requirementDocs: number;
  stockItems: number;
  stockLedger: number;
  purchaseOrders: number;
  sales: number;
  invoices: number;
  saleReturns: number;
  purchaseReturns: number;
  rpVouchers: number;
  staff: number;
}

export interface MigrationStatus {
  tenantId: string;
  db: MigrationCounts;
  kv: MigrationCounts;
}

export interface MigrationSection {
  found: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

export interface MigrationResult {
  tenantId: string;
  dryRun: boolean;
  accounts:          MigrationSection;
  journalEntries:    MigrationSection;
  customers:         MigrationSection;
  products:          MigrationSection;
  brands:            MigrationSection;
  productCategories: MigrationSection;
  units:             MigrationSection;
  attributes:        MigrationSection;
  leads:             MigrationSection;
  departments:       MigrationSection;
  designations:      MigrationSection;
  cities:            MigrationSection;
  areas:             MigrationSection;
  requirementDocs:   MigrationSection;
  stockItems:        MigrationSection;
  stockLedger:       MigrationSection;
  purchaseOrders:    MigrationSection;
  sales:             MigrationSection;
  invoices:          MigrationSection;
  saleReturns:       MigrationSection;
  purchaseReturns:   MigrationSection;
  rpVouchers:        MigrationSection;
  staff:             MigrationSection;
}

const BASE = "/api/migrate";

export async function getMigrationStatus(tenantId: string): Promise<MigrationStatus> {
  const res = await fetch(`${BASE}/tenant/${encodeURIComponent(tenantId)}/status`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<MigrationStatus>;
}

export async function runMigration(tenantId: string, dryRun = false): Promise<MigrationResult> {
  const url = dryRun
    ? `${BASE}/tenant/${encodeURIComponent(tenantId)}/dry-run`
    : `${BASE}/tenant/${encodeURIComponent(tenantId)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Migration failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<MigrationResult>;
}
