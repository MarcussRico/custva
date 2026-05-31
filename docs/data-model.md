# Custva Data Model (PostgreSQL)

## Principles

- All merchant-owned records include `merchant_id`.
- Tenant isolation is enforced in both DB constraints and application query guards.
- Use UTC timestamps (`timestamptz`) for all time-based fields.
- Prefer additive schema evolution and forward-only migrations.

## Core entities

### merchants

- `id` (uuid, pk)
- `name` (text, not null)
- `business_name` (text, not null)
- `email` (citext, unique, not null)
- `status` (enum: `active`, `suspended`, `trial`)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### users

- `id` (uuid, pk)
- `merchant_id` (uuid, fk -> merchants.id)
- `full_name` (text, not null)
- `email` (citext, not null)
- `password_hash` (text, not null)
- `role` (enum: `merchant_admin`, `merchant_staff`, `platform_admin`)
- `is_active` (boolean, default true)
- `created_at`, `updated_at` (timestamptz)

Constraints:
- unique (`merchant_id`, `email`) for merchant-side users

### subscriptions

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `plan_code` (text)
- `status` (enum: `active`, `past_due`, `cancelled`, `trialing`)
- `billing_cycle` (enum: `monthly`, `yearly`)
- `starts_at`, `ends_at` (timestamptz)
- `created_at`, `updated_at` (timestamptz)

### customers

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `name` (text, not null)
- `mobile` (varchar(20), not null)
- `location` (text)
- `notes` (text)
- `total_spend` (numeric(12,2), default 0)
- `total_visits` (int, default 0)
- `last_visit` (timestamptz)
- `created_at`, `updated_at` (timestamptz)

Constraints and indexes:
- unique (`merchant_id`, `mobile`)
- index (`merchant_id`, `last_visit` desc)
- index (`merchant_id`, `total_spend` desc)
- index (`merchant_id`, `total_visits` desc)

### customer_visits

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `customer_id` (uuid, fk -> customers.id)
- `billing_amount` (numeric(12,2), not null)
- `visit_at` (timestamptz, not null)
- `source` (text, default `walk_in`)
- `created_at` (timestamptz)

Indexes:
- index (`merchant_id`, `visit_at` desc)
- index (`customer_id`, `visit_at` desc)

### customer_tags

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `customer_id` (uuid, fk)
- `tag` (text, not null)
- `created_at` (timestamptz)

Constraints:
- unique (`merchant_id`, `customer_id`, `tag`)

### templates

- `id` (uuid, pk)
- `merchant_id` (uuid, nullable for global templates)
- `name` (text, not null)
- `category` (text, not null)
- `language_code` (varchar(10), default `en`)
- `body` (text, not null)
- `cta_link` (text)
- `is_global` (boolean, default false)
- `approval_status` (enum: `draft`, `approved`, `rejected`)
- `created_at`, `updated_at` (timestamptz)

### campaigns

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `template_id` (uuid, fk -> templates.id)
- `campaign_name` (text, not null)
- `status` (enum: `draft`, `scheduled`, `sending`, `completed`, `failed`, `cancelled`)
- `scheduled_at` (timestamptz)
- `target_count` (int, default 0)
- `sent_count` (int, default 0)
- `delivered_count` (int, default 0)
- `failed_count` (int, default 0)
- `created_at`, `updated_at` (timestamptz)

Indexes:
- index (`merchant_id`, `status`, `scheduled_at`)

### campaign_audiences

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `campaign_id` (uuid, fk -> campaigns.id)
- `customer_id` (uuid, fk -> customers.id)
- `snapshot_payload` (jsonb, not null)
- `created_at` (timestamptz)

Constraints:
- unique (`campaign_id`, `customer_id`)

### messages

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `campaign_id` (uuid, fk)
- `customer_id` (uuid, fk)
- `provider` (text, not null)
- `provider_message_id` (text)
- `status` (enum: `queued`, `sent`, `delivered`, `read`, `failed`)
- `sent_at`, `delivered_at`, `opened_at` (timestamptz)
- `failure_reason` (text)
- `created_at`, `updated_at` (timestamptz)

Indexes:
- index (`merchant_id`, `status`)
- unique (`provider`, `provider_message_id`) where `provider_message_id` is not null

### message_events

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `message_id` (uuid, fk -> messages.id)
- `event_type` (enum: `sent`, `delivered`, `read`, `failed`, `unknown`)
- `provider_payload` (jsonb, not null)
- `event_at` (timestamptz, not null)
- `created_at` (timestamptz)

Indexes:
- index (`message_id`, `event_at` desc)

### daily_merchant_metrics

- `id` (uuid, pk)
- `merchant_id` (uuid, fk)
- `metric_date` (date, not null)
- `total_customers` (int, default 0)
- `repeat_customers` (int, default 0)
- `retention_rate` (numeric(5,2), default 0)
- `active_customers` (int, default 0)
- `inactive_customers` (int, default 0)
- `revenue_total` (numeric(12,2), default 0)
- `revenue_from_campaigns` (numeric(12,2), default 0)
- `campaign_conversions` (int, default 0)
- `created_at`, `updated_at` (timestamptz)

Constraints:
- unique (`merchant_id`, `metric_date`)

## Retention formula

`retention_rate = (repeat_customers / total_customers) * 100`

Where:
- `repeat_customers` are customers with at least 2 visits in the selected window.
- `total_customers` are customers with at least 1 visit in the selected window.

## Migration order (forward-only)

1. `merchants`, `users`, `subscriptions`
2. `customers`, `customer_visits`, `customer_tags`
3. `templates`, `campaigns`, `campaign_audiences`
4. `messages`, `message_events`
5. `daily_merchant_metrics`
6. indexes for heavy read paths + partial unique constraints
