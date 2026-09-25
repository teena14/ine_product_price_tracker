import { supabase } from '../config/supabase.js';
import { errors } from '../utils/errors.js';

/**
 * Repository for tracked_products table.
 * All database access for tracked products goes through here.
 * No business logic — just clean CRUD operations.
 */

/**
 * Create a new tracked product entry.
 * Throws DUPLICATE_TRACKING (409) if the same product+option is already active.
 *
 * @param {{ product_id, product_url, product_name, option_id, option_name }} data
 * @returns {Promise<TrackedProduct>}
 */
export async function createTrackedProduct(data) {
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
    // Postgres unique constraint violation code
    if (error.code === '23505') {
      throw errors.duplicateTracking();
    }
    throw new Error(`DB error creating tracked product: ${error.message}`);
  }

  return row;
}

/**
 * List all active tracked products.
 * Used by the scraper to know what to scrape.
 *
 * @returns {Promise<TrackedProduct[]>}
 */
export async function listActiveTrackedProducts() {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`DB error listing tracked products: ${error.message}`);
  }

  return data;
}

/**
 * List all tracked products (active and inactive) for the dashboard.
 *
 * @returns {Promise<TrackedProduct[]>}
 */
export async function listAllTrackedProducts() {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`DB error listing all tracked products: ${error.message}`);
  }

  return data;
}

/**
 * Get a single tracked product by ID.
 * Throws TRACKED_PRODUCT_NOT_FOUND (404) if not found.
 *
 * @param {string} id
 * @returns {Promise<TrackedProduct>}
 */
export async function getTrackedProductById(id) {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw errors.trackedProductNotFound(id);
    }
    throw new Error(`DB error fetching tracked product ${id}: ${error.message}`);
  }

  return data;
}

/**
 * Deactivate a tracked product (soft delete).
 * Does not physically delete the row or its history.
 *
 * @param {string} id
 * @returns {Promise<TrackedProduct>}
 */
export async function deactivateTrackedProduct(id) {
  const { data, error } = await supabase
    .from('tracked_products')
    .update({ active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw errors.trackedProductNotFound(id);
    }
    throw new Error(`DB error deactivating tracked product ${id}: ${error.message}`);
  }

  return data;
}
