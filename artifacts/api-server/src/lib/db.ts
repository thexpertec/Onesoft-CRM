import pg from "pg";

const { Pool } = pg;

// NEON_DATABASE_URL takes priority — used when connecting to an external Neon
// database instead of the Replit-managed one.
const dbUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!dbUrl) {
  throw new Error("DATABASE_URL (or NEON_DATABASE_URL) environment variable is required");
}

const needsSsl = dbUrl.includes("neon.tech") || dbUrl.includes("sslmode=require") || process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle DB client", err);
});

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}
