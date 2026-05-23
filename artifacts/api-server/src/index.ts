import app from "./app";
import { logger } from "./lib/logger";
import { initSchema } from "./lib/schema-init";
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

// Ensure all DB tables exist before accepting traffic.
initSchema().catch(err => {
  logger.error({ err }, "[schema-init] failed — continuing anyway");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
