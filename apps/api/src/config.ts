import dotenv from "dotenv";
import { z } from "zod";

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

dotenv.config({ path: "../../.env" });
dotenv.config({ path: "../../.env.local" });
if (!isProd) {
  dotenv.config({ path: "../../.env.example" });
}

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  JWT_ACCESS_SECRET: z.string().min(isProd ? 32 : 8),
  JWT_REFRESH_SECRET: z.string().min(isProd ? 32 : 8),
  REDIS_URL: z.string().url(),
  CORS_ORIGINS: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_ACCESS_TOKEN: z.string().optional(),
  WA_APP_SECRET: z.string().optional(),
  WA_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WA_MERCHANT_DAILY_CAP: z.coerce.number().default(500),
  WA_PLATFORM_DAILY_CAP: z.coerce.number().default(100000)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid API environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
  );
}

if (isProd) {
  if (!parsed.data.CORS_ORIGINS?.trim()) {
    throw new Error("CORS_ORIGINS is required in production (comma-separated origins)");
  }
  if (!parsed.data.WA_APP_SECRET?.trim()) {
    throw new Error("WA_APP_SECRET is required in production for webhook signature verification");
  }
}

export const env = parsed.data;
export const isProduction = isProd;
