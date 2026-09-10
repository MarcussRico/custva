import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.example" });
}

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

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

const applied = await client.query(
  `SELECT filename FROM schema_migrations`
);
const appliedSet = new Set(applied.rows.map((r) => r.filename));

// Bootstrap existing databases that already have schema but no tracking rows
if (appliedSet.size === 0) {
  const tables = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'merchants'
     ) AS exists`
  );
  if (tables.rows[0]?.exists) {
    for (const file of files) {
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [
        file
      ]);
      appliedSet.add(file);
      console.log(`Bootstrapped migration tracking: ${file}`);
    }
  }
}

for (const file of files) {
  if (appliedSet.has(file)) {
    console.log(`Skip migration (already applied): ${file}`);
    continue;
  }

  const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
    await client.query("COMMIT");
    console.log(`Applied migration: ${file}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

await client.end();
