import { Client } from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.example" });
dotenv.config({ path: "apps/web-admin/.env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run seed.");
}

const adminMerchantId =
  process.env.CUSTVA_PLATFORM_MERCHANT_ID || "00000000-0000-0000-0000-000000000001";
const client = new Client({ connectionString: databaseUrl });
await client.connect();

await client.query(
  `INSERT INTO merchants (id, name, business_name, email, status, item_categories)
   VALUES ($1, 'Custva Platform', 'Custva Platform', 'platform@custva.local', 'active', '["cafe"]'::jsonb)
   ON CONFLICT (email) DO NOTHING`,
  [adminMerchantId]
);

const adminEmail = process.env.ADMIN_EMAIL || "admin@custva.local";
const adminPassword =
  process.env.ADMIN_PASSWORD ||
  process.env.CUSTVA_PLATFORM_ADMIN_PASSWORD ||
  "Admin@123";
const adminHash = await bcrypt.hash(adminPassword, 10);
await client.query(
  `INSERT INTO users (merchant_id, full_name, email, password_hash, role, is_active)
   VALUES ($1, 'Custva Platform Admin', $2, $3, 'platform_admin', true)
   ON CONFLICT (merchant_id, email)
   DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'platform_admin', is_active = true`,
  [adminMerchantId, adminEmail, adminHash]
);

console.log(`Platform admin seed complete: ${adminEmail}`);
console.log("Lifecycle templates are seeded via migration 0010. Run: node scripts/seed-lifecycle-templates.mjs");

await client.end();
