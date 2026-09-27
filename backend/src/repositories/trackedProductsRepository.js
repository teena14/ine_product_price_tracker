import { getSupabaseClient } from '../config/supabase.js';
import { errors } from '../utils/errors.js';

/**
 * Repository for the shared tracked_products dashboard.
 * All browser users intentionally see the same tracker state. Public writes
 * are additive only; destructive maintenance has no public route.
 */

function databaseError(operation, cause) {
  return new Error(`Database error while ${operation}`, { cause });
}

function throwNotFoundOrDatabaseError(error, operation, id) {
  if (error.code === 'PGRST116') {
    throw errors.trackedProductNotFound(id);
  }
  throw databaseError(operation, error);
}

/**
 * Create one globally shared active tracking entry.
 */
export async function createTrackedProduct(data) {
  const supabase = getSupabaseClient();
  const { data: row, error } = await supabase
    .from('tracked_products')
    .insert({
      product_id: data.product_id,
      product_url: data.product_url,
      product_name: data.product_name,
      option_id: data.option_id,
      option_name: data.option_name,
      active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw errors.duplicateTracking();
    }
    throw databaseError('creating a tracked product', error);
  }

  return row;
}

/**
 * Public dashboard list. Inactive records remain in the database for history
 * and can be reactivated, but are not scheduled or displayed here.
 */
export async function listTrackedProducts() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw databaseError('listing tracked products', error);
  }

  return data;
}

/**
 * Export includes historical data for every tracked product, including any
 * inactive records that are intentionally hidden from the main list.
 */
export async function listAllTrackedProductsForExport() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw databaseError('listing tracked products for export', error);
  }

  return data;
}

/**
 * Trusted scraper query. Kept separate to make its oldest-first execution
 * order explicit even though the global dashboard is intentionally public.
 */
export async function listAllActiveTrackedProducts() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw databaseError('listing all active tracked products', error);
  }

  return data;
}

export async function getTrackedProductById(id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('tracked_products').select('*').eq('id', id).single();

  if (error) {
    throwNotFoundOrDatabaseError(error, 'fetching a tracked product', id);
  }

  return data;
}

/**
 * Updates the denormalized cache columns on tracked_products after each scrape
 * attempt so the dashboard list can display the latest price and stock without
 * an extra join. Called unconditionally after every attempt so that
 * last_scraped_at always reflects the most recent check, even on failures.
 *
 * On a successful scrape:  last_price + last_stock are updated.
 * On a failed scrape:      only last_scraped_at is updated (price/stock keep
 *                          their previous values so users still see the last
 *                          known good price while it remains reliable).
 */
export async function updateTrackedProductLastScrape(id, { price, stock, scrapedAt }) {
  const supabase = getSupabaseClient();

  const patch = { last_scraped_at: scrapedAt ?? new Date().toISOString() };

  // Only overwrite price/stock on a successful scrape (both must be present)
  if (price !== null && price !== undefined && stock !== null && stock !== undefined) {
    patch.last_price = price;
    patch.last_stock = stock;
  }

  const { data, error } = await supabase
    .from('tracked_products')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw databaseError('updating last scrape cache on tracked product', error);
  }

  return data;
}
