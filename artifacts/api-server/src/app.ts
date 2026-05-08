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

// Default: no caching for write endpoints and everything else.
// Individual GET routes that benefit from caching set their own header.
app.use((_req, res, next) => {
  if (_req.method !== "GET") res.setHeader("Cache-Control", "no-store");
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

// Allow requests from the dashboard (same origin in production, cross-origin in dev)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

export default app;
