import type { PoolClient } from "pg";
import { query } from "./db.js";

export interface TemplateRow {
  id: string;
  merchant_id: string | null;
  name: string;
  category: string;
  body: string;
  header_text: string | null;
  footer_text: string | null;
  buttons: unknown;
  language_code: string;
  cta_link: string | null;
  is_global: boolean;
  approval_status: string;
  version: number;
  source_template_id: string | null;
  source_version: number | null;
  is_locally_modified: boolean;
  archived_at: string | null;
  is_starter_pack: boolean;
  visit_group: string | null;
  lifecycle_day: string | null;
  header_image_url: string | null;
}

export function mapTemplateRow(row: TemplateRow) {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    category: row.category,
    body: row.body,
    headerText: row.header_text,
    footerText: row.footer_text,
    buttons: row.buttons ?? [],
    languageCode: row.language_code,
    ctaLink: row.cta_link,
    isGlobal: row.is_global,
    approvalStatus: row.approval_status,
    version: row.version,
    sourceTemplateId: row.source_template_id,
    sourceVersion: row.source_version,
    isLocallyModified: row.is_locally_modified,
    archivedAt: row.archived_at,
    isStarterPack: row.is_starter_pack,
    visitGroup: row.visit_group,
    lifecycleDay: row.lifecycle_day,
    headerImageUrl: row.header_image_url
  };
}

export async function getGlobalTemplate(id: string) {
  const result = await query<TemplateRow>(
    `SELECT * FROM templates
     WHERE id = $1 AND is_global = TRUE AND archived_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function forkTemplateToMerchant(
  client: PoolClient,
  global: TemplateRow,
  merchantId: string
) {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM templates
     WHERE merchant_id = $1 AND source_template_id = $2 AND archived_at IS NULL
     LIMIT 1`,
    [merchantId, global.id]
  );
  if (existing.rowCount) {
    return { skipped: true, templateId: existing.rows[0].id };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO templates (
       merchant_id, name, category, body, header_text, footer_text, buttons,
       language_code, cta_link, header_image_url, visit_group, lifecycle_day,
       is_global, approval_status, version,
       source_template_id, source_version, is_locally_modified, is_starter_pack
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE,$13,1,$14,$15,FALSE,$16)
     RETURNING id`,
    [
      merchantId,
      global.name,
      global.category,
      global.body,
      global.header_text,
      global.footer_text,
      JSON.stringify(global.buttons ?? []),
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

  return { skipped: false, templateId: inserted.rows[0].id };
}

export async function assignStarterPackToMerchant(client: PoolClient, merchantId: string) {
  const globals = await client.query<TemplateRow>(
    `SELECT * FROM templates
     WHERE is_global = TRUE AND is_starter_pack = TRUE AND archived_at IS NULL`
  );

  const assigned: string[] = [];
  const skipped: string[] = [];

  for (const global of globals.rows) {
    const result = await forkTemplateToMerchant(client, global, merchantId);
    if (result.skipped) skipped.push(result.templateId);
    else assigned.push(result.templateId);
  }

  return { assigned, skipped, total: globals.rowCount ?? 0 };
}

export async function pushGlobalUpdatesToMerchant(
  client: PoolClient,
  global: TemplateRow,
  merchantId: string,
  force: boolean
) {
  const copy = await client.query<TemplateRow>(
    `SELECT * FROM templates
     WHERE merchant_id = $1 AND source_template_id = $2 AND archived_at IS NULL
     LIMIT 1`,
    [merchantId, global.id]
  );
  if (!copy.rowCount) {
    return { updated: false, reason: "no_copy" as const };
  }

  const merchantCopy = copy.rows[0];
  if (merchantCopy.is_locally_modified && !force) {
    return { updated: false, reason: "locally_modified" as const };
  }

  await client.query(
    `UPDATE templates SET
       name = $1, body = $2, header_text = $3, footer_text = $4, buttons = $5,
       language_code = $6, cta_link = $7, header_image_url = $8, visit_group = $9,
       lifecycle_day = $10, approval_status = $11,
       source_version = $12, is_locally_modified = FALSE, updated_at = NOW()
     WHERE id = $13`,
    [
      global.name,
      global.body,
      global.header_text,
      global.footer_text,
      JSON.stringify(global.buttons ?? []),
      global.language_code,
      global.cta_link,
      global.header_image_url,
      global.visit_group,
      global.lifecycle_day,
      global.approval_status,
      global.version,
      merchantCopy.id
    ]
  );

  return { updated: true, templateId: merchantCopy.id };
}
