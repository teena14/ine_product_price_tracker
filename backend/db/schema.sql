-- INE Product Price Tracker — Database Schema
-- Run this in your Supabase SQL editor to create the required tables.
-- Safe to run multiple times (uses IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS).

-- ============================================================
-- TABLE: tracked_products
-- Represents a user's intent to track a specific product+option
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

-- Prevent duplicate active tracking of the same product+option combination.
-- A user can re-track the same product after deactivating it (active=false rows
-- are excluded from the index), but cannot have two simultaneous active entries.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_products_active
  ON tracked_products (product_id, option_id)
  WHERE active = TRUE;

-- Index for listing active products (used by the scraper every 2 hours)
CREATE INDEX IF NOT EXISTS idx_tracked_products_active
  ON tracked_products (active)
  WHERE active = TRUE;


-- ============================================================
-- TABLE: scrape_attempts
-- Immutable log of every scraping attempt (success or failure).
-- A failed attempt never overwrites a previous successful one.
-- ============================================================
CREATE TABLE IF NOT EXISTS scrape_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_product_id  UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  run_id              TEXT NOT NULL,           -- correlates all attempts in one scheduled run
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price               NUMERIC(12, 4),          -- NULL for failed attempts
  stock               INTEGER,                 -- NULL for failed attempts
  outcome             TEXT NOT NULL CHECK (outcome IN ('success', 'failed')),
  error_code          TEXT,                    -- e.g. SCRAPE_TIMEOUT, QUOTE_UNAVAILABLE
  error_message       TEXT,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  duration_ms         INTEGER,                 -- total duration of this attempt in ms
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching history of a specific tracked product (most recent first)
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_tracked_product
  ON scrape_attempts (tracked_product_id, timestamp DESC);

-- Index for fetching the latest attempt for each product (dashboard display)
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_run_id
  ON scrape_attempts (run_id);


-- ============================================================
-- TRIGGER: auto-update tracked_products.updated_at on row change
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
