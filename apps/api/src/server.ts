import express from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { env } from "./config.js";
import "./types.js";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./modules/auth/routes.js";
import { customersRouter } from "./modules/customers/routes.js";
import { campaignsRouter } from "./modules/campaigns/routes.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { merchantsRouter } from "./modules/merchants/routes.js";
import { adminRouter } from "./modules/admin/routes.js";
import { templatesRouter } from "./modules/templates/routes.js";
import { webhookRouter } from "./modules/webhooks/routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use((_req, res, next) => {
  res.locals.requestId = randomUUID();
  next();
});

app.get("/health/live", (_req, res) => res.status(200).json({ ok: true }));
app.get("/health/ready", (_req, res) => res.status(200).json({ ok: true }));

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/webhooks", webhookRouter);
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
