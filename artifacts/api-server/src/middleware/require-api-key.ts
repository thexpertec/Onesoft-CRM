import type { Request, Response, NextFunction } from "express";

/**
 * Shared-secret gate for protected API routes.
 *
 * The expected value lives in the `KV_API_SECRET` env var and must match the
 * `X-Api-Key` header on every incoming request. This is **not** real
 * authentication — the same secret is shipped to the admin-dashboard browser
 * bundle as `VITE_KV_API_SECRET`, so anyone who can load the admin app can
 * extract it. The gate is meaningful only against:
 *   - casual port-scans and bot traffic
 *   - other tenants of the same Replit deployment
 *   - cross-origin attempts that bypass CORS via a non-browser client
 *
 * Real per-user authentication (server-issued sessions, server-derived
 * tenantId) is a separate epic. Until then, treat every per-record route as
 * "anyone with the bundle can reach it" — defence in depth, not defence.
 *
 * Routes that must remain anonymous (`/api/kv` for the public storefronts,
 * `/api/health`, `/api/public/*`, `/api/auth/verify-tenant`) are mounted
 * **before** this middleware in `routes/index.ts` and bypass it entirely.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env["KV_API_SECRET"];
  if (!expected) {
    // Should never happen: `assertApiKeyEnvOrExit()` runs at startup.
    res.status(500).json({ error: "Server misconfigured: KV_API_SECRET unset" });
    return;
  }
  const provided = req.headers["x-api-key"];
  if (provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * Startup guard. Call from the entry point before `app.listen`. Logs and
 * exits the process if `KV_API_SECRET` is missing — fail-closed, never
 * fail-open. The previous design fell open without the env var, which meant
 * every per-record route was effectively anonymous in any environment that
 * forgot to set the secret.
 */
export function assertApiKeyEnvOrExit(): void {
  if (!process.env["KV_API_SECRET"]) {
    console.error(
      "FATAL: KV_API_SECRET is required but not set. " +
      "Refusing to start — protected API routes would be anonymous. " +
      "Set the env var via Replit Secrets and restart.",
    );
    process.exit(1);
  }
}
