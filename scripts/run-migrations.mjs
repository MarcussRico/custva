import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.example" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const migrationsDir = path.resolve("infra/db/migrations");
const files = (await fs.readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new Client({ connectionString: databaseUrl });
await client.connect();

for (const file of files) {
  const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
  await client.query(sql);
  // eslint-disable-next-line no-console
  console.log(`Applied migration: ${file}`);
}

await client.end();
