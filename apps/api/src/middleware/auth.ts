import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { sendError } from "../lib/api-response.js";
import { env, isProduction } from "../config.js";

interface JwtPayload {
  sub: string;
  merchantId: string;
  role: "merchant_admin" | "merchant_staff" | "platform_admin";
}

/** Length-safe and non-short-circuiting, so a wrong id leaks nothing by timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  /* Dev-only bypass. Never enabled when NODE_ENV=production.
     
     Defect 11: this used to check only that CUSTVA_DEV_MERCHANT_ID was *set*,
     then trust whatever merchant id the caller put in the header. Setting the
     variable to any value turned `x-dev-merchant-id` into "log in as anyone" —
     on a shared staging box, one curl reads every merchant's customers.
     
     The header must now equal the configured value, compared in constant time.
     The bypass grants access to exactly one merchant: the one the operator
     configured. */
  if (!isProduction) {
    const devMerchantId = req.headers["x-dev-merchant-id"];
    const devRole = req.headers["x-dev-role"];
    const configured = process.env.CUSTVA_DEV_MERCHANT_ID;
    if (
      typeof devMerchantId === "string" &&
      configured &&
      constantTimeEquals(devMerchantId, configured)
    ) {
      req.auth = {
        userId: "dev-user",
        merchantId: configured,
        role:
          devRole === "platform_admin" || devRole === "merchant_staff"
            ? devRole
            : "merchant_admin"
      };
      return next();
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return sendError(req, res, "AUTH_FORBIDDEN", "Missing bearer token", 401);
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    req.auth = {
      userId: payload.sub,
      merchantId: payload.merchantId,
      role: payload.role
    };
    return next();
  } catch {
    return sendError(req, res, "AUTH_TOKEN_EXPIRED", "Invalid or expired token", 401);
  }
}

export function requireRole(
  roles: Array<"merchant_admin" | "merchant_staff" | "platform_admin">
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return sendError(req, res, "AUTH_FORBIDDEN", "Insufficient role", 403);
    }
    return next();
  };
}
