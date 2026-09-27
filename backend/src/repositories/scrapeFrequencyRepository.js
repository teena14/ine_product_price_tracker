import { getSupabaseClient } from '../config/supabase.js';

function databaseError(operation, cause) {
  return new Error(`Database error while ${operation}`, { cause });
}

/**
 * Updates the scrape frequency setting for a tracked product.
 * Pass null to reset to the global cron schedule.
 */
export async function setTrackedProductFrequency(id, frequencyMinutes) {
  if (frequencyMinutes !== null && (!Number.isSafeInteger(frequencyMinutes) || frequencyMinutes < 5)) {
    throw new TypeError('frequencyMinutes must be null or an integer >= 5');
  }

  const supabase = getSupabaseClient();

  // Compute next_scrape_at when a custom frequency is set
  const nextScrapeAt = frequencyMinutes != null
    ? new Date(Date.now() + frequencyMinutes * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('tracked_products')
    .update({ scrape_frequency_minutes: frequencyMinutes, next_scrape_at: nextScrapeAt })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw databaseError('updating scrape frequency', error);
  }

  return data;
}

/**
 * Returns all active products that are due for a custom-frequency scrape.
 * A product is due when next_scrape_at is in the past (or null with a set frequency).
 */
export async function listProductsDueForCustomScrape() {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('active', true)
    .not('scrape_frequency_minutes', 'is', null)
    .or(`next_scrape_at.is.null,next_scrape_at.lte.${now}`)
    .order('next_scrape_at', { ascending: true });

  if (error) {
    throw databaseError('listing products due for custom-frequency scrape', error);
  }

  return data;
}

/**
 * Stamps next_scrape_at on a product after a custom-frequency scrape completes.
 */
export async function stampNextScrapeAt(id, frequencyMinutes) {
  const supabase = getSupabaseClient();
  const nextScrapeAt = new Date(Date.now() + frequencyMinutes * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('tracked_products')
    .update({ next_scrape_at: nextScrapeAt })
    .eq('id', id);

  if (error) {
    throw databaseError('stamping next_scrape_at', error);
  }
}

/**
 * Updates the stored UI manifest hash (for change detection).
 * layoutChangedAt is set when a hash mismatch is detected.
 */
export async function updateManifestHash(id, { manifestHash, layoutChangedAt = null }) {
  const supabase = getSupabaseClient();
  const patch = { ui_manifest_hash: manifestHash };
  if (layoutChangedAt) {
    patch.layout_changed_at = layoutChangedAt;
  }

  const { error } = await supabase
    .from('tracked_products')
    .update(patch)
    .eq('id', id);

  if (error) {
    throw databaseError('updating UI manifest hash', error);
  }
}
