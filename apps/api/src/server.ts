/* Must be imported before any router is defined. Express 4 does not catch
   rejected promises from async handlers, and every route in this codebase is
   async — customers/routes.ts alone had 8 async handlers and no try/catch. A
   rejected query became an unhandled rejection: the request hung with no
   response, and on Node 20+ the process terminates. This patches Express's
   Layer.handle so the existing error middleware catches them. */
import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { env } from "./config.js";
import "./types.js";
import { requireAuth } from "./middleware/auth.js";
import { authRateLimiter } from "./middleware/rate-limit.js";
import { authRouter } from "./modules/auth/routes.js";
import { customersRouter } from "./modules/customers/routes.js";
import { campaignsRouter } from "./modules/campaigns/routes.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { merchantsRouter } from "./modules/merchants/routes.js";
import { adminRouter } from "./modules/admin/routes.js";
import { templatesRouter } from "./modules/templates/routes.js";
import { webhookRouter } from "./modules/webhooks/routes.js";
import { dataDeletionRouter } from "./modules/webhooks/data-deletion.js";
import { errorHandler } from "./middleware/error-handler.js";
import { dbPool } from "./lib/db.js";

const app = express();

const corsOrigins = (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true
  })
);

app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      // Preserve bytes for WhatsApp X-Hub-Signature-256 verification
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    }
  })
);

app.use((_req, res, next) => {
  res.locals.requestId = randomUUID();
  next();
});

app.get("/health/live", (_req, res) => res.status(200).json({ ok: true }));

app.get("/health/ready", async (_req, res) => {
  const checks: Record<string, "ok" | "fail"> = { postgres: "fail", redis: "fail" };
  try {
    await dbPool.query("SELECT 1");
    checks.postgres = "ok";
  } catch {
    checks.postgres = "fail";
  }

  let redis: Redis | null = null;
  try {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true
    });
    await redis.connect();
    const pong = await redis.ping();
    checks.redis = pong === "PONG" ? "ok" : "fail";
  } catch {
    checks.redis = "fail";
  } finally {
    if (redis) {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    }
  }

  const ok = checks.postgres === "ok" && checks.redis === "ok";
  return res.status(ok ? 200 : 503).json({ ok, checks });
});

app.use("/api/v1/auth", authRateLimiter, authRouter);
app.use("/api/v1/webhooks", webhookRouter);
/* Unauthenticated by design — Meta calls it, and the payload is verified by
   its own HMAC signature rather than by a bearer token. */
app.use("/api/v1/webhooks", dataDeletionRouter);
app.use("/api/v1/customers", requireAuth, customersRouter);
app.use("/api/v1/campaigns", requireAuth, campaignsRouter);
app.use("/api/v1/merchants", requireAuth, merchantsRouter);
app.use("/api/v1/templates", requireAuth, templatesRouter);
app.use("/api/v1/analytics", requireAuth, analyticsRouter);
app.use("/api/v1/admin", requireAuth, adminRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
