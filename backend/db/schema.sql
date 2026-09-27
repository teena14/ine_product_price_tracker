-- ============================================================
-- INE Product Price Tracker — Final Production Schema
-- Includes all original tables + Feature 1/3/4 additions.
-- Run in the Supabase SQL editor on a clean database.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- tracked_products: shared dashboard intent to track product + option
-- ============================================================
CREATE TABLE IF NOT EXISTS tracked_products (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id                TEXT        NOT NULL,
  product_url               TEXT        NOT NULL,
  product_name              TEXT        NOT NULL,
  option_id                 TEXT        NOT NULL,
  option_name               TEXT        NOT NULL,
  active                    BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Denormalised cache columns (updated after each scrape)
  last_price                NUMERIC(12, 4),
  last_stock                INTEGER,
  last_scraped_at           TIMESTAMPTZ,

  -- Feature 3: Change detection
  ui_manifest_hash          TEXT,
  layout_changed_at         TIMESTAMPTZ,

  -- Feature 4: Configurable scrape frequency
  -- NULL  → use the global cron schedule
  -- >= 5  → check this product every N minutes
  scrape_frequency_minutes  INTEGER
    CHECK (scrape_frequency_minutes IS NULL OR scrape_frequency_minutes >= 5),
  next_scrape_at            TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business constraint: one active tracking record per product + option.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_products_active
  ON tracked_products (product_id, option_id)
  WHERE active = TRUE;

-- Supports the trusted scraper's "WHERE active ORDER BY created_at ASC" query.
CREATE INDEX IF NOT EXISTS idx_tracked_products_active_created_at
  ON tracked_products (created_at ASC)
  WHERE active = TRUE;

-- ============================================================
-- scrape_attempts: immutable, append-only record of every attempt
-- ============================================================
CREATE TABLE IF NOT EXISTS scrape_attempts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_product_id  UUID        NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  run_id              TEXT        NOT NULL,
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price               NUMERIC(12, 4),
  stock               INTEGER,
  outcome             TEXT        NOT NULL,
  error_code          TEXT,
  error_message       TEXT,
  attempt_number      INTEGER     NOT NULL,
  duration_ms         INTEGER,

  -- Prevents duplicate inserts for the same run + product + attempt number.
  CONSTRAINT uq_scrape_attempts_run_tracked_product_attempt
    UNIQUE (run_id, tracked_product_id, attempt_number),

  CONSTRAINT scrape_attempts_outcome_check
    CHECK (outcome IN ('success', 'retried', 'failed')),
  CONSTRAINT scrape_attempts_stock_check
    CHECK (stock IS NULL OR stock >= 0),
  CONSTRAINT scrape_attempts_attempt_number_check
    CHECK (attempt_number > 0),
  CONSTRAINT scrape_attempts_duration_check
    CHECK (duration_ms IS NULL OR duration_ms >= 0),

  -- Success rows must have price + stock and no error fields.
  -- Failure rows must have error fields and no price/stock.
  CONSTRAINT scrape_attempts_outcome_data_check
    CHECK (
      (
        outcome = 'success'
        AND price IS NOT NULL
        AND price > 0
        AND stock IS NOT NULL
        AND error_code IS NULL
        AND error_message IS NULL
      )
      OR
      (
        outcome IN ('retried', 'failed')
        AND price IS NULL
        AND stock IS NULL
        AND NULLIF(BTRIM(error_code), '') IS NOT NULL
        AND NULLIF(BTRIM(error_message), '') IS NOT NULL
      )
    )
);

-- Serves history, latest-attempt, and export queries by tracked product.
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_tracked_product_scraped_at
  ON scrape_attempts (tracked_product_id, scraped_at DESC);

-- ============================================================
-- product_alerts: Feature 1 — in-app price/stock/layout alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS product_alerts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_product_id  UUID        NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,

  -- 'price_drop' | 'back_in_stock' | 'out_of_stock' | 'layout_changed'
  alert_type          TEXT        NOT NULL,
  message             TEXT        NOT NULL,
  old_value           TEXT,        -- previous price / stock (stored as text)
  new_value           TEXT,        -- new price / stock
  read_at             TIMESTAMPTZ, -- NULL = unread

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT product_alerts_type_check
    CHECK (alert_type IN ('price_drop', 'back_in_stock', 'out_of_stock', 'layout_changed'))
);

-- Fast per-product alert lists and newest-first ordering.
CREATE INDEX IF NOT EXISTS idx_product_alerts_tracked_product_created_at
  ON product_alerts (tracked_product_id, created_at DESC);

-- Fast unread-count queries (partial index, only unread rows).
CREATE INDEX IF NOT EXISTS idx_product_alerts_unread
  ON product_alerts (read_at)
  WHERE read_at IS NULL;

-- ============================================================
-- tracked_products.updated_at maintenance trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tracked_products_updated_at ON tracked_products;
CREATE TRIGGER trg_tracked_products_updated_at
  BEFORE UPDATE ON tracked_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Access control
-- ============================================================
-- The Express backend uses a Supabase service-role client which bypasses RLS.
-- Direct browser roles are denied table access; only the backend API is public.
ALTER TABLE tracked_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_attempts  DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_alerts   DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE tracked_products, scrape_attempts, product_alerts
  FROM anon, authenticated;

GRANT ALL ON TABLE tracked_products, scrape_attempts, product_alerts
  TO service_role;
