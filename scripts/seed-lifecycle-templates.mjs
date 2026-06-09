import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.example" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

const globals = await client.query(
  `SELECT * FROM templates
   WHERE is_global = TRUE AND is_starter_pack = TRUE AND archived_at IS NULL
     AND visit_group IS NOT NULL`
);

const platformId =
  process.env.CUSTVA_PLATFORM_MERCHANT_ID ?? "00000000-0000-0000-0000-000000000001";

const merchants = await client.query(`SELECT id FROM merchants WHERE id != $1`, [platformId]);

let forked = 0;
let skipped = 0;

for (const merchant of merchants.rows) {
  for (const global of globals.rows) {
    const existing = await client.query(
      `SELECT id FROM templates
       WHERE merchant_id = $1 AND source_template_id = $2 AND archived_at IS NULL`,
      [merchant.id, global.id]
    );
    if (existing.rowCount) {
      skipped++;
      continue;
    }
    const buttons =
      typeof global.buttons === "string"
        ? global.buttons
        : JSON.stringify(global.buttons ?? []);

    await client.query(
      `INSERT INTO templates (
         merchant_id, name, category, body, header_text, footer_text, buttons,
         language_code, cta_link, header_image_url, visit_group, lifecycle_day,
         is_global, approval_status, version, source_template_id, source_version,
         is_locally_modified, is_starter_pack
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,FALSE,$13,1,$14,$15,FALSE,$16)`,
      [
        merchant.id,
        global.name,
        global.category,
        global.body,
        global.header_text,
        global.footer_text,
        buttons,
        global.language_code,
        global.cta_link,
        global.header_image_url,
        global.visit_group,
        global.lifecycle_day,
        global.approval_status,
        global.id,
        global.version,
        global.is_starter_pack
      ]
    );
    forked++;
  }
}

await client.end();
console.log(`Lifecycle template fork complete: ${forked} created, ${skipped} skipped.`);
