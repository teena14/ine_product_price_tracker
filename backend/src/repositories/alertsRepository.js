import { getSupabaseClient } from '../config/supabase.js';

const VALID_ALERT_TYPES = new Set(['price_drop', 'back_in_stock', 'out_of_stock', 'layout_changed']);

function databaseError(operation, cause) {
  return new Error(`Database error while ${operation}`, { cause });
}

/**
 * Creates an in-app alert for a tracked product.
 */
export async function createAlert({ trackedProductId, alertType, message, oldValue, newValue }) {
  if (!VALID_ALERT_TYPES.has(alertType)) {
    throw new TypeError(`Invalid alert type: ${alertType}`);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('product_alerts')
    .insert({
      tracked_product_id: trackedProductId,
      alert_type: alertType,
      message,
      old_value: oldValue != null ? String(oldValue) : null,
      new_value: newValue != null ? String(newValue) : null,
    })
    .select()
    .single();

  if (error) {
    throw databaseError('creating a product alert', error);
  }

  return data;
}

/**
 * Lists all alerts ordered by newest first. Optionally filter to unread only.
 */
export async function listAlerts({ unreadOnly = false, limit = 50 } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('product_alerts')
    .select('*, tracked_products(product_name, option_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data, error } = await query;

  if (error) {
    throw databaseError('listing alerts', error);
  }

  return data;
}

/**
 * Lists alerts for a specific tracked product.
 */
export async function listAlertsForProduct(trackedProductId, { limit = 20 } = {}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('product_alerts')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw databaseError('listing alerts for product', error);
  }

  return data;
}

/**
 * Returns the count of unread alerts across all products.
 */
export async function countUnreadAlerts() {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from('product_alerts')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null);

  if (error) {
    throw databaseError('counting unread alerts', error);
  }

  return count ?? 0;
}

/**
 * Marks all currently unread alerts as read.
 */
export async function markAllAlertsRead() {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('product_alerts')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);

  if (error) {
    throw databaseError('marking alerts as read', error);
  }
}

/**
 * Marks a specific alert as read.
 */
export async function markAlertRead(alertId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('product_alerts')
    .update({ read_at: new Date().toISOString() })
    .eq('id', alertId)
    .is('read_at', null);

  if (error) {
    throw databaseError('marking alert as read', error);
  }
}
