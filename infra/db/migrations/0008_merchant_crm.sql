-- Customer profile extensions
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(6),
  ADD COLUMN IF NOT EXISTS age SMALLINT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_customers_merchant_pincode
  ON customers (merchant_id, pincode);

CREATE INDEX IF NOT EXISTS idx_customers_merchant_age
  ON customers (merchant_id, age);

-- Visit history (one row per shop visit / add-customer action)
CREATE TABLE IF NOT EXISTS customer_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  billing_amount NUMERIC(12, 2) NOT NULL,
  visit_at TIMESTAMPTZ NOT NULL,
  age_at_visit SMALLINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_visits_merchant_visit_at
  ON customer_visits (merchant_id, visit_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_visits_customer_visit_at
  ON customer_visits (customer_id, visit_at DESC);

-- Campaign audience configuration
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS audience_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_include_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS manual_exclude_ids UUID[] NOT NULL DEFAULT '{}';

-- Snapshot of resolved audience at send/schedule time
CREATE TABLE IF NOT EXISTS campaign_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  mobile VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_audiences_campaign
  ON campaign_audiences (campaign_id);

-- Pre-aggregated daily metrics for analytics at scale
CREATE TABLE IF NOT EXISTS daily_merchant_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  new_customers INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(14, 2) NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  messages_delivered INTEGER NOT NULL DEFAULT 0,
  messages_read INTEGER NOT NULL DEFAULT 0,
  active_customers INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_merchant_date
  ON daily_merchant_metrics (merchant_id, metric_date DESC);

-- Per-merchant WhatsApp send quotas
CREATE TABLE IF NOT EXISTS merchant_send_quotas (
  merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  daily_cap INTEGER NOT NULL DEFAULT 500,
  sent_today INTEGER NOT NULL DEFAULT 0,
  quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform-wide daily send counter (single row)
CREATE TABLE IF NOT EXISTS platform_send_quota (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_cap INTEGER NOT NULL DEFAULT 100000,
  sent_today INTEGER NOT NULL DEFAULT 0,
  quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_send_quota (id, daily_cap, sent_today, quota_date)
VALUES (1, 100000, 0, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;
