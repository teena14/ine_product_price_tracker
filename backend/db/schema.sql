-- INE Product Price Tracker - final database schema for Supabase/PostgreSQL.
-- For an existing Phase 0-5 database, run migration_harden_scrape_attempts.sql
-- once in the Supabase SQL editor before deploying this application version.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- tracked_products: a shared dashboard's intent to track product + option
-- ============================================================
CREATE TABLE IF NOT EXISTS tracked_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      TEXT NOT NULL,
  product_url     TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  option_id       TEXT NOT NULL,
  option_name     TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business constraint, not merely a lookup optimization: one active shared
-- tracking record exists per product + option across the public dashboard.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_products_active
  ON tracked_products (product_id, option_id)
  WHERE active = TRUE;

-- Supports the trusted scraper's actual query:
-- WHERE active = TRUE ORDER BY created_at ASC.
CREATE INDEX IF NOT EXISTS idx_tracked_products_active_created_at
  ON tracked_products (created_at ASC)
  WHERE active = TRUE;

-- ============================================================
-- scrape_attempts: immutable, append-only record of every attempt
-- ============================================================
CREATE TABLE IF NOT EXISTS scrape_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_product_id  UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  run_id              TEXT NOT NULL,
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price               NUMERIC(12, 4),
  stock               INTEGER,
  outcome             TEXT NOT NULL,
  error_code          TEXT,
  error_message       TEXT,
  attempt_number      INTEGER NOT NULL,
  duration_ms         INTEGER,

  -- An attempt number is per tracked product and per run. A new scheduled run
  -- begins again at 1, while this uniqueness rule prevents duplicate inserts.
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
-- tracked_products.updated_at maintenance
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
-- Access control decision
-- ============================================================
-- The Express backend uses a Supabase service-role client, which bypasses RLS.
-- This is a deliberately shared public dashboard, not an ownership model.
-- Direct browser roles are denied table access; only the backend exposes the
-- intentionally public read/add API, while destructive routes are absent.
ALTER TABLE tracked_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_attempts DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tracked_products, scrape_attempts FROM anon, authenticated;
GRANT ALL ON TABLE tracked_products, scrape_attempts TO service_role;
