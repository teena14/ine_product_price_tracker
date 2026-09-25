import { supabase } from '../config/supabase.js';
import { errors } from '../utils/errors.js';

/**
 * Repository for tracked_products table.
 * All database access for tracked products goes through here.
 *
 * OWNERSHIP: Every user-facing query is scoped by session_id.
 * The scraper bypasses session_id scoping because it must process all active
 * products regardless of which session created them.
 */

/**
 * Create a new tracked product entry, owned by the given session.
 * Throws DUPLICATE_TRACKING (409) if the same session already actively tracks
 * the same product+option combination.
 *
 * @param {{
 *   product_id, product_url, product_name,
 *   option_id, option_name, session_id
 * }} data
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
      session_id: data.session_id,
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
 * List only the active tracked products belonging to a specific session.
 * Used for the user-facing dashboard.
 *
 * @param {string} sessionId
 * @returns {Promise<TrackedProduct[]>}
 */
export async function listTrackedProductsBySession(sessionId) {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`DB error listing tracked products for session: ${error.message}`);
  }

  return data;
}

/**
 * List ALL active tracked products across ALL sessions.
 * Used exclusively by the scheduled scraper — must not be called from user-facing routes.
 *
 * @returns {Promise<TrackedProduct[]>}
 */
export async function listAllActiveTrackedProducts() {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`DB error listing all active tracked products: ${error.message}`);
  }

  return data;
}

/**
 * Get a single tracked product by ID, scoped to the session that owns it.
 * Throws TRACKED_PRODUCT_NOT_FOUND (404) if not found OR if it belongs to a different session.
 * This prevents IDOR — a session cannot access another session's tracked product.
 *
 * @param {string} id
 * @param {string} sessionId
 * @returns {Promise<TrackedProduct>}
 */
export async function getTrackedProductByIdAndSession(id, sessionId) {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('id', id)
    .eq('session_id', sessionId)
    .single();

  if (error) {
    // PGRST116 = no rows returned (not found, or wrong session)
    if (error.code === 'PGRST116') {
      throw errors.trackedProductNotFound(id);
    }
    throw new Error(`DB error fetching tracked product ${id}: ${error.message}`);
  }

  return data;
}

/**
 * Deactivate a tracked product (soft delete), enforcing session ownership.
 * Throws TRACKED_PRODUCT_NOT_FOUND if the product doesn't exist or belongs to a different session.
 *
 * @param {string} id
 * @param {string} sessionId
 * @returns {Promise<TrackedProduct>}
 */
export async function deactivateTrackedProduct(id, sessionId) {
  const { data, error } = await supabase
    .from('tracked_products')
    .update({ active: false })
    .eq('id', id)
    .eq('session_id', sessionId)
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
