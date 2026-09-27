import { createAlert } from '../repositories/alertsRepository.js';
import { updateManifestHash } from '../repositories/scrapeFrequencyRepository.js';
import { logger } from '../utils/logger.js';

/**
 * Creates a stable hash of the manifest object for layout change detection.
 * Uses JSON.stringify with sorted keys for determinism.
 */
function hashManifest(manifest) {
  try {
    const stable = JSON.stringify(manifest, Object.keys(manifest ?? {}).sort());
    // Simple but sufficient 32-bit FNV-1a hash — no crypto needed for this use.
    let hash = 2166136261;
    for (let i = 0; i < stable.length; i += 1) {
      hash ^= stable.charCodeAt(i);
      // eslint-disable-next-line no-bitwise
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  } catch {
    return null;
  }
}

/**
 * Compares the freshly fetched UI manifest hash with the stored one.
 * If different, creates a layout_changed alert and updates the stored hash.
 *
 * Returns true if a layout change was detected.
 */
export async function detectAndRecordLayoutChange(trackedProduct, manifest, { log = logger } = {}) {
  const newHash = hashManifest(manifest);
  if (!newHash) {
    return false;
  }

  const oldHash = trackedProduct.ui_manifest_hash;

  if (oldHash && oldHash !== newHash) {
    log.warn('UI manifest layout change detected', {
      trackedProductId: trackedProduct.id,
      productId: trackedProduct.product_id,
      oldHash,
      newHash,
    });

    try {
      await updateManifestHash(trackedProduct.id, {
        manifestHash: newHash,
        layoutChangedAt: new Date().toISOString(),
      });
      await createAlert({
        trackedProductId: trackedProduct.id,
        alertType: 'layout_changed',
        message: `Page structure changed for "${trackedProduct.product_name} — ${trackedProduct.option_name}". Scraper selectors may need review.`,
        oldValue: oldHash,
        newValue: newHash,
      });
    } catch (error) {
      log.error('Failed to record layout change', { trackedProductId: trackedProduct.id, error });
    }
    return true;
  }

  // Store hash if this is the first scrape (no stored hash yet)
  if (!oldHash) {
    try {
      await updateManifestHash(trackedProduct.id, { manifestHash: newHash });
    } catch (error) {
      log.error('Failed to store initial manifest hash', { trackedProductId: trackedProduct.id, error });
    }
  }

  return false;
}

/**
 * Compares the latest successful scrape result against the previously known
 * price/stock and creates in-app alerts for price drops and stock changes.
 */
export async function generatePriceAndStockAlerts(trackedProduct, newQuote, { log = logger } = {}) {
  const prevPrice = trackedProduct.last_price != null ? Number(trackedProduct.last_price) : null;
  const prevStock = trackedProduct.last_stock != null ? Number(trackedProduct.last_stock) : null;

  const { price: newPrice, stock: newStock } = newQuote;

  const alertsCreated = [];

  try {
    // Price drop alert
    if (prevPrice !== null && newPrice < prevPrice) {
      const alert = await createAlert({
        trackedProductId: trackedProduct.id,
        alertType: 'price_drop',
        message: `Price dropped for "${trackedProduct.product_name} — ${trackedProduct.option_name}": ${prevPrice} → ${newPrice}`,
        oldValue: prevPrice,
        newValue: newPrice,
      });
      alertsCreated.push(alert);
      log.info('Price drop alert created', {
        trackedProductId: trackedProduct.id,
        prevPrice,
        newPrice,
      });
    }

    // Back in stock alert
    if (prevStock === 0 && newStock > 0) {
      const alert = await createAlert({
        trackedProductId: trackedProduct.id,
        alertType: 'back_in_stock',
        message: `"${trackedProduct.product_name} — ${trackedProduct.option_name}" is back in stock (${newStock} units).`,
        oldValue: prevStock,
        newValue: newStock,
      });
      alertsCreated.push(alert);
      log.info('Back-in-stock alert created', {
        trackedProductId: trackedProduct.id,
        newStock,
      });
    }

    // Out of stock alert
    if (prevStock !== null && prevStock > 0 && newStock === 0) {
      const alert = await createAlert({
        trackedProductId: trackedProduct.id,
        alertType: 'out_of_stock',
        message: `"${trackedProduct.product_name} — ${trackedProduct.option_name}" went out of stock.`,
        oldValue: prevStock,
        newValue: newStock,
      });
      alertsCreated.push(alert);
      log.info('Out-of-stock alert created', {
        trackedProductId: trackedProduct.id,
      });
    }
  } catch (error) {
    log.error('Failed to create price/stock alert', { trackedProductId: trackedProduct.id, error });
  }

  return alertsCreated;
}
