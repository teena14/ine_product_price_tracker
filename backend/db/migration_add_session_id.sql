-- Migration: add session_id to tracked_products
-- Run this in Supabase SQL Editor if the table was already created without session_id.
-- Safe to run multiple times.

-- Add session_id column (allow NULL temporarily so existing rows don't break)
ALTER TABLE tracked_products
  ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Backfill any existing rows with a placeholder session (cleanup from dev testing)
UPDATE tracked_products
  SET session_id = 'legacy-dev-session'
  WHERE session_id IS NULL;

-- Enforce NOT NULL now that all rows have a value
ALTER TABLE tracked_products
  ALTER COLUMN session_id SET NOT NULL;

-- Drop old unique index (product_id + option_id only) if it exists
DROP INDEX IF EXISTS uq_tracked_products_active;

-- Create new unique index scoped per session
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_products_active
  ON tracked_products (session_id, product_id, option_id)
  WHERE active = TRUE;

-- Add index for session-scoped queries
CREATE INDEX IF NOT EXISTS idx_tracked_products_session_id
  ON tracked_products (session_id);
