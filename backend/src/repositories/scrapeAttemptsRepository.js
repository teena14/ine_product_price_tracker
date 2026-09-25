import { supabase } from '../config/supabase.js';

/**
 * Repository for scrape_attempts table.
 * All database access for scrape history goes through here.
 *
 * IMPORTANT: scrape_attempts is append-only.
 * We never UPDATE rows — only INSERT.
 * A failed attempt never overwrites a successful one.
 */

/**
 * Save a scrape attempt (success or failure).
 * Always inserts a new row — never updates existing data.
 *
 * @param {{
 *   tracked_product_id: string,
 *   run_id: string,
 *   price: number | null,
 *   stock: number | null,
 *   outcome: 'success' | 'failed',
 *   error_code: string | null,
 *   error_message: string | null,
 *   attempt_number: number,
 *   duration_ms: number | null
 * }} attempt
 * @returns {Promise<ScrapeAttempt>}
 */
export async function saveScrapeAttempt(attempt) {
  const { data, error } = await supabase
    .from('scrape_attempts')
    .insert({
      tracked_product_id: attempt.tracked_product_id,
      run_id: attempt.run_id,
      price: attempt.price ?? null,
      stock: attempt.stock ?? null,
      outcome: attempt.outcome,
      error_code: attempt.error_code ?? null,
      error_message: attempt.error_message ?? null,
      attempt_number: attempt.attempt_number,
      duration_ms: attempt.duration_ms ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`DB error saving scrape attempt: ${error.message}`);
  }

  return data;
}

/**
 * Get the full scrape history for a tracked product, newest first.
 * Includes both successful and failed attempts.
 *
 * @param {string} trackedProductId
 * @param {{ limit?: number }} [options]
 * @returns {Promise<ScrapeAttempt[]>}
 */
export async function getScrapeHistory(trackedProductId, options = {}) {
  let query = supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .order('timestamp', { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`DB error fetching scrape history for ${trackedProductId}: ${error.message}`);
  }

  return data;
}

/**
 * Get the most recent scrape attempt for a tracked product.
 * Used to display latest status on the dashboard.
 *
 * @param {string} trackedProductId
 * @returns {Promise<ScrapeAttempt | null>}
 */
export async function getLatestScrapeAttempt(trackedProductId) {
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`DB error fetching latest scrape for ${trackedProductId}: ${error.message}`);
  }

  return data; // null if no attempts yet
}

/**
 * Get the most recent SUCCESSFUL scrape attempt for a tracked product.
 * Used for determining the last known good price/stock.
 *
 * @param {string} trackedProductId
 * @returns {Promise<ScrapeAttempt | null>}
 */
export async function getLatestSuccessfulScrapeAttempt(trackedProductId) {
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .eq('outcome', 'success')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`DB error fetching latest success for ${trackedProductId}: ${error.message}`);
  }

  return data;
}

/**
 * Get all scrape attempts for a tracked product for CSV export.
 * Returns oldest first so the CSV reads chronologically.
 *
 * @param {string} trackedProductId
 * @returns {Promise<ScrapeAttempt[]>}
 */
export async function getAllScrapeAttemptsForExport(trackedProductId) {
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .order('timestamp', { ascending: true });

  if (error) {
    throw new Error(`DB error fetching export data for ${trackedProductId}: ${error.message}`);
  }

  return data;
}
