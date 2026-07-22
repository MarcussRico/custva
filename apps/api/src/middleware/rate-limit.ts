import { rateLimit } from "express-rate-limit";

/** Login / register / refresh abuse control */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many auth attempts. Try again later."
    }
  }
});
