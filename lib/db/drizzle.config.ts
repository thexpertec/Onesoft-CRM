import { defineConfig } from "drizzle-kit";
import path from "path";

// Match the api-server's connection priority (see artifacts/api-server/src/lib/db.ts):
// ONESOFTERP_DB is the real production database; Replit overrides DATABASE_URL/NEON_*
// with its local dev DB, so we must consult ONESOFTERP_DB first.
const dbUrl = process.env.ONESOFTERP_DB ?? process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
