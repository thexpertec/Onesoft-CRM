import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

// Compress all responses — dramatically reduces transfer size for large JSON
// payloads (e.g. product thumbnails stored as base64 compress 8-10×).
app.use(compression());

// Disable Express's default ETag generation so GET responses always return 200
// (not 304 Not Modified). The Replit deployment proxy caches responses and can
// return 304 to fresh clients that never stored an ETag, preventing the
// in-memory store from populating on first load.
app.set("etag", false);

// Belt-and-suspenders: tell every caching layer not to store responses.
// Individual GET routes that want browser caching override this header inside
// their own handler (route handlers run after middleware, so the last setter wins).
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS — explicit allowlist instead of reflecting any origin.
//
// Reads `ALLOWED_ORIGINS` (comma-separated absolute URLs) from the env. In a
// Replit workspace where the env var isn't set we fall back to the dev domain
// (`REPLIT_DEV_DOMAIN`) so the in-iframe preview keeps working. Same-origin
// requests (no `Origin` header — curl, server-to-server, healthchecks) are
// always allowed.
//
// `credentials: false` is intentional: every protected route is gated by the
// `X-Api-Key` header, not by cookies, so allowing credentials would only
// widen the surface without buying anything.
const ALLOWED_ORIGINS: string[] = (() => {
  const fromEnv = process.env["ALLOWED_ORIGINS"];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.split(",").map(s => s.trim()).filter(Boolean);
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  return devDomain ? [`https://${devDomain}`] : [];
})();

app.use(
  cors({
    origin: (origin, cb) => {
      // No Origin header — server-to-server, curl, healthchecks. Allow.
      if (!origin) { cb(null, true); return; }
      if (ALLOWED_ORIGINS.includes(origin)) { cb(null, true); return; }
      // Replit deployment domains (`*.replit.app` for prod, `*.replit.dev`
      // for workspace previews). Useful when the env var isn't yet set.
      try {
        const u = new URL(origin);
        if (u.hostname.endsWith(".replit.app") || u.hostname.endsWith(".replit.dev")) {
          cb(null, true);
          return;
        }
      } catch { /* fall through to deny */ }
      cb(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: false,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

export default app;
