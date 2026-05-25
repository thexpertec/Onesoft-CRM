import app from "./app";
import { logger } from "./lib/logger";
import { initSchema } from "./lib/schema-init";
import { migrateRepairBookings } from "./lib/migrate-repair-bookings";
import { assertApiKeyEnvOrExit } from "./middleware/require-api-key";

// Fail-closed: refuse to start without the shared secret. Protected per-record
// routes would otherwise be anonymous.
assertApiKeyEnvOrExit();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Ensure all DB tables exist AND the one-shot repair-bookings partitioning has
// completed before we accept any traffic. Awaiting both is required for
// correctness: if `app.listen` ran in parallel with the migration, a
// concurrent `POST /api/storefront/repair-booking` could write into a
// per-tenant key that the migration is about to overwrite with the
// pre-migration array — silently losing the just-submitted booking.
// Architect-flagged, May 2026.
async function bootstrap(): Promise<void> {
  try {
    await initSchema();
  } catch (err) {
    logger.error({ err }, "[schema-init] failed — continuing anyway");
  }
  try {
    await migrateRepairBookings();
  } catch (err) {
    logger.error({ err }, "[migrate-repair-bookings] failed — continuing anyway");
  }
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

void bootstrap();
