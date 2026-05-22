export interface MigrationCounts {
  accounts: number;
  journalEntries: number;
  customers: number;
  products: number;
  brands: number;
  productCategories: number;
  units: number;
  attributes: number;
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
