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
  /** Single AppSettings blob per tenant: 1 = present, 0 = missing. */
  settings: number;
}

export interface MigrationStatus {
  tenantId: string;
  db: MigrationCounts;
  kv: MigrationCounts;
}

export interface PlatformCounts {
  adminUsers:   number;
  tenants:      number;
  moduleGroups: number;
}

export interface PlatformMigrationStatus {
  db: PlatformCounts;
  kv: PlatformCounts;
}

export interface PlatformMigrationSection {
  found:    number;
  inserted: number;
  updated:  number;
  skipped:  number;
  errors:   string[];
}

export interface PlatformMigrationResult {
  dryRun:       boolean;
  adminUsers:   PlatformMigrationSection;
  tenants:      PlatformMigrationSection;
  moduleGroups: PlatformMigrationSection;
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
  settings:          MigrationSection;
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

export async function getPlatformStatus(): Promise<PlatformMigrationStatus> {
  const res = await fetch(`${BASE}/platform/status`);
  if (!res.ok) throw new Error(`Platform status check failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<PlatformMigrationStatus>;
}

export async function runPlatformMigration(dryRun = false): Promise<PlatformMigrationResult> {
  const url = dryRun ? `${BASE}/platform/dry-run` : `${BASE}/platform`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Platform migration failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<PlatformMigrationResult>;
}
