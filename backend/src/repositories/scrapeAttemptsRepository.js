import { getSupabaseClient } from '../config/supabase.js';

const VALID_OUTCOMES = new Set(['success', 'retried', 'failed']);
const FAILURE_OUTCOMES = new Set(['retried', 'failed']);

function databaseError(operation, cause) {
  return new Error(`Database error while ${operation}`, { cause });
}

/**
 * Mirrors the database checks so a scraper programming mistake fails before an
 * insert. The database remains the final authority for all persisted rows.
 */
export function validateScrapeAttempt(attempt) {
  const isSuccess = attempt.outcome === 'success';
  const isFailure = FAILURE_OUTCOMES.has(attempt.outcome);
  const hasError =
    typeof attempt.error_code === 'string' &&
    attempt.error_code.trim().length > 0 &&
    typeof attempt.error_message === 'string' &&
    attempt.error_message.trim().length > 0;
  const hasAnyErrorField =
    (attempt.error_code !== null && attempt.error_code !== undefined) ||
    (attempt.error_message !== null && attempt.error_message !== undefined);
  const hasPrice = attempt.price !== null && attempt.price !== undefined;
  const hasStock = attempt.stock !== null && attempt.stock !== undefined;

  if (
    !VALID_OUTCOMES.has(attempt.outcome) ||
    typeof attempt.run_id !== 'string' ||
    attempt.run_id.trim().length === 0 ||
    !Number.isSafeInteger(attempt.attempt_number) ||
    attempt.attempt_number < 1 ||
    (attempt.duration_ms !== null && attempt.duration_ms !== undefined &&
      (!Number.isSafeInteger(attempt.duration_ms) || attempt.duration_ms < 0)) ||
    (isSuccess &&
      (attempt.price === null || attempt.price === undefined || attempt.stock === null || attempt.stock === undefined || hasAnyErrorField || !Number.isFinite(attempt.price) ||
        attempt.price <= 0 || !Number.isSafeInteger(attempt.stock) || attempt.stock < 0)) ||
    (isFailure && (hasPrice || hasStock || !hasError))
  ) {
    throw new Error('Invalid scrape attempt payload');
  }

  return attempt;
}

/**
 * Save one immutable scrape attempt. A retry is a separate row with outcome
 * `retried`; no previous attempt is ever updated to a later outcome.
 */
export async function saveScrapeAttempt(attempt) {
  validateScrapeAttempt(attempt);

  const supabase = getSupabaseClient();
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
    throw databaseError('saving a scrape attempt', error);
  }

  return data;
}

/**
 * This repository intentionally has no HTTP/auth knowledge. A future public
 * history route will first resolve the tracked product and then call this
 * query; Phase 8 will add that route and presentation.
 */
export async function getScrapeHistory(trackedProductId, options = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .order('scraped_at', { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw databaseError('fetching scrape history', error);
  }

  return data;
}

export async function getLatestScrapeAttempt(trackedProductId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw databaseError('fetching the latest scrape attempt', error);
  }

  return data;
}

export async function getLatestSuccessfulScrapeAttempt(trackedProductId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .eq('outcome', 'success')
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw databaseError('fetching the latest successful scrape attempt', error);
  }

  return data;
}

export async function getAllScrapeAttemptsForExport(trackedProductId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .order('scraped_at', { ascending: true });

  if (error) {
    throw databaseError('fetching scrape export data', error);
  }

  return data;
}
