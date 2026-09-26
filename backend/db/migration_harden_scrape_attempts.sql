-- Upgrade an existing Phase 0-5 database to the final shared-dashboard schema.
-- Run once in the Supabase SQL editor. It is safe to rerun after success.
-- It intentionally fails instead of rewriting dishonest historical attempts.

BEGIN;

-- Replace redundant timestamp + created_at with one unambiguous event time.
ALTER TABLE scrape_attempts ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scrape_attempts' AND column_name = 'timestamp'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scrape_attempts' AND column_name = 'created_at'
  ) THEN
    EXECUTE '
      UPDATE scrape_attempts
      SET scraped_at = COALESCE(scraped_at, timestamp, created_at, NOW())
      WHERE scraped_at IS NULL
    ';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scrape_attempts' AND column_name = 'timestamp'
  ) THEN
    EXECUTE '
      UPDATE scrape_attempts
      SET scraped_at = COALESCE(scraped_at, timestamp, NOW())
      WHERE scraped_at IS NULL
    ';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scrape_attempts' AND column_name = 'created_at'
  ) THEN
    EXECUTE '
      UPDATE scrape_attempts
      SET scraped_at = COALESCE(scraped_at, created_at, NOW())
      WHERE scraped_at IS NULL
    ';
  ELSE
    UPDATE scrape_attempts SET scraped_at = NOW() WHERE scraped_at IS NULL;
  END IF;
END;
$$;

ALTER TABLE scrape_attempts ALTER COLUMN scraped_at SET DEFAULT NOW();
ALTER TABLE scrape_attempts ALTER COLUMN scraped_at SET NOT NULL;
ALTER TABLE scrape_attempts DROP COLUMN IF EXISTS timestamp;
ALTER TABLE scrape_attempts DROP COLUMN IF EXISTS created_at;
ALTER TABLE scrape_attempts ALTER COLUMN attempt_number DROP DEFAULT;
ALTER TABLE scrape_attempts ALTER COLUMN attempt_number SET NOT NULL;

-- Remove prior versions of the checks so their final definitions below can be
-- applied safely on every run.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'scrape_attempts'::regclass
      AND conname IN (
        'scrape_attempts_outcome_check',
        'scrape_attempts_stock_check',
        'scrape_attempts_attempt_number_check',
        'scrape_attempts_duration_check',
        'scrape_attempts_outcome_data_check'
      )
  LOOP
    EXECUTE format('ALTER TABLE scrape_attempts DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE scrape_attempts
  ADD CONSTRAINT scrape_attempts_outcome_check
    CHECK (outcome IN ('success', 'retried', 'failed')),
  ADD CONSTRAINT scrape_attempts_stock_check
    CHECK (stock IS NULL OR stock >= 0),
  ADD CONSTRAINT scrape_attempts_attempt_number_check
    CHECK (attempt_number > 0),
  ADD CONSTRAINT scrape_attempts_duration_check
    CHECK (duration_ms IS NULL OR duration_ms >= 0),
  ADD CONSTRAINT scrape_attempts_outcome_data_check
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
    );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'scrape_attempts'::regclass
      AND conname = 'uq_scrape_attempts_run_tracked_product_attempt'
  ) THEN
    ALTER TABLE scrape_attempts
      ADD CONSTRAINT uq_scrape_attempts_run_tracked_product_attempt
      UNIQUE (run_id, tracked_product_id, attempt_number);
  END IF;
END;
$$;

-- The old run_id index was unused. The unique constraint above has run_id as
-- its leading column for the duplicate-insert rule; no standalone index is
-- warranted until a real run-filtered query exists.
DROP INDEX IF EXISTS idx_scrape_attempts_tracked_product;
DROP INDEX IF EXISTS idx_scrape_attempts_run_id;
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_tracked_product_scraped_at
  ON scrape_attempts (tracked_product_id, scraped_at DESC);

-- Move from anonymous-session rows to a single public tracker. Do not silently
-- delete or merge duplicate active rows from different historical sessions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT product_id, option_id
      FROM tracked_products
      WHERE active = TRUE
      GROUP BY product_id, option_id
      HAVING COUNT(*) > 1
    ) AS duplicate_active_rows
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate to global tracking while duplicate active product/options exist. Deactivate or merge those rows explicitly first.';
  END IF;
END;
$$;

DROP INDEX IF EXISTS uq_tracked_products_active;
DROP INDEX IF EXISTS idx_tracked_products_session_id;
DROP INDEX IF EXISTS idx_tracked_products_active;
DROP INDEX IF EXISTS idx_tracked_products_session_active_created_at;
ALTER TABLE tracked_products DROP COLUMN IF EXISTS session_id;

-- The same index enforces the global duplicate business rule and supports
-- public add requests that need to detect an existing active selection.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_products_active
  ON tracked_products (product_id, option_id)
  WHERE active = TRUE;

-- The public dashboard and trusted scraper both list all active rows; btree
-- supports either chronological scan direction on this single partial index.
CREATE INDEX IF NOT EXISTS idx_tracked_products_active_created_at
  ON tracked_products (created_at ASC)
  WHERE active = TRUE;

-- Service-role requests bypass RLS. Direct browser database access remains
-- denied; the Express API deliberately exposes only public read/add behavior.
ALTER TABLE tracked_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_attempts DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tracked_products, scrape_attempts FROM anon, authenticated;
GRANT ALL ON TABLE tracked_products, scrape_attempts TO service_role;

COMMIT;
