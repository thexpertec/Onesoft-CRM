#!/usr/bin/env node
import pg from "/home/runner/workspace/artifacts/api-server/node_modules/pg/lib/index.js";

const { Pool } = pg;
const url = process.env.ONESOFTERP_DB ?? process.env.DATABASE_URL;
if (!url) {
  console.error("FAIL: no ONESOFTERP_DB / DATABASE_URL env var");
  process.exit(2);
}

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

const t0 = Date.now();
try {
  const r = await pool.query(
    "SELECT current_database() AS db, current_user AS usr, version() AS ver, NOW() AS now"
  );
  const r2 = await pool.query("SELECT COUNT(*)::int AS n FROM kv_store");
  const ms = Date.now() - t0;
  const row = r.rows[0];
  console.log(
    `[${new Date().toISOString()}] OK  db=${row.db} user=${row.usr} kv_rows=${r2.rows[0].n} rtt=${ms}ms`
  );
  console.log(`  server time: ${row.now.toISOString()}`);
  console.log(`  ${row.ver.split(",")[0]}`);
  process.exit(0);
} catch (err) {
  const ms = Date.now() - t0;
  console.error(
    `[${new Date().toISOString()}] FAIL rtt=${ms}ms code=${err.code ?? "?"} ${err.message}`
  );
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
