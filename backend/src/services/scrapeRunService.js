import { randomUUID } from 'crypto';
import {
  listAllActiveTrackedProducts,
} from '../repositories/trackedProductsRepository.js';
import {
  listProductsDueForCustomScrape,
  stampNextScrapeAt as persistNextScrapeAt,
} from '../repositories/scrapeFrequencyRepository.js';
import { closeQuoteScraperBrowser } from '../scraper/priceQuoteScraper.js';
import { scrapeAndPersistTrackedProduct } from './scrapePersistenceService.js';
import { logger } from '../utils/logger.js';

function failureCode(error) {
  return typeof error?.code === 'string' && error.code.trim().length > 0
    ? error.code
    : 'SCRAPE_RUN_ITEM_FAILED';
}

function resultItem(trackedProduct, result) {
  return {
    trackedProductId: trackedProduct.id,
    productId: trackedProduct.product_id,
    optionId: trackedProduct.option_id,
    outcome: result.outcome === 'success' ? 'success' : 'failed',
    attemptCount: result.attempts.length,
    ...(result.outcome === 'success' ? {} : { errorCode: result.error?.code ?? 'SCRAPE_FAILED' }),
  };
}

function isolatedFailureItem(trackedProduct, error) {
  return {
    trackedProductId: trackedProduct?.id ?? null,
    productId: trackedProduct?.product_id ?? null,
    optionId: trackedProduct?.option_id ?? null,
    outcome: 'failed',
    attemptCount: 0,
    errorCode: failureCode(error),
  };
}

/**
 * Runs one tracked product and stamps next_scrape_at if it has a custom frequency.
 */
async function scrapeOneProduct(
  trackedProduct,
  { runId, scrapeTrackedProduct, stampNextScrapeAt, log }
) {
  try {
    const result = await scrapeTrackedProduct(trackedProduct, { runId });
    const item = resultItem(trackedProduct, result);

    // Stamp the next custom scrape time after a successful or failed attempt
    if (trackedProduct.scrape_frequency_minutes !== null && trackedProduct.scrape_frequency_minutes !== undefined) {
      try {
        await stampNextScrapeAt(trackedProduct.id, trackedProduct.scrape_frequency_minutes);
      } catch (stampError) {
        log.error('Failed to stamp next_scrape_at', { runId, trackedProductId: trackedProduct.id, error: stampError });
      }
    }

    log.info('Tracked product scrape completed', {
      runId,
      trackedProductId: item.trackedProductId,
      productId: item.productId,
      attemptCount: item.attemptCount,
      outcome: item.outcome,
      ...(item.errorCode ? { errorCode: item.errorCode } : {}),
    });
    return item;
  } catch (error) {
    const item = isolatedFailureItem(trackedProduct, error);
    log.error('Tracked product scrape failed unexpectedly', {
      runId,
      trackedProductId: item.trackedProductId,
      productId: item.productId,
      errorCode: item.errorCode,
      error,
    });
    return item;
  }
}

/**
 * Runs all active tracking records serially under one run ID. Individual
 * product failures are contained so later products still scrape and persist.
 * Products with a custom scrape_frequency_minutes that are NOT yet due are
 * skipped in the global cron run to avoid over-scraping.
 * The global cron invokes the default mode. The in-process custom scheduler
 * invokes customOnly so short custom intervals run independently of that cron.
 */
export async function runActiveTrackedProductScrape(
  {
    runId = randomUUID(),
    customOnly = false,
    trackedProductId = null,
    listActiveTrackedProducts = listAllActiveTrackedProducts,
    listDueCustomProducts = listProductsDueForCustomScrape,
    scrapeTrackedProduct = scrapeAndPersistTrackedProduct,
    stampNextScrapeAt = persistNextScrapeAt,
    closeBrowser = closeQuoteScraperBrowser,
    log = logger,
  } = {}
) {
  const results = [];
  log.info('Scrape run started', { runId });

  try {
    const loadedProducts = customOnly
      ? await listDueCustomProducts()
      : await listActiveTrackedProducts();
    const trackedProducts = trackedProductId
      ? loadedProducts.filter((trackedProduct) => trackedProduct.id === trackedProductId)
      : loadedProducts;
    const now = Date.now();

    for (const trackedProduct of trackedProducts) {
      // Skip products that have a custom frequency but are not yet due
      if (
        !customOnly &&
        trackedProduct.scrape_frequency_minutes !== null &&
        trackedProduct.scrape_frequency_minutes !== undefined &&
        trackedProduct.next_scrape_at !== null &&
        trackedProduct.next_scrape_at !== undefined &&
        new Date(trackedProduct.next_scrape_at).getTime() > now
      ) {
        log.info('Skipping product not yet due for custom-frequency scrape', {
          runId,
          trackedProductId: trackedProduct.id,
          nextScrapeAt: trackedProduct.next_scrape_at,
        });
        continue;
      }

      const item = await scrapeOneProduct(trackedProduct, {
        runId,
        scrapeTrackedProduct,
        stampNextScrapeAt,
        log,
      });
      results.push(item);
    }

    const successful = results.filter((item) => item.outcome === 'success').length;
    const summary = {
      runId,
      total: results.length,
      successful,
      failed: results.length - successful,
      results,
    };
    log.info('Scrape run completed', {
      runId,
      total: summary.total,
      successful: summary.successful,
      failed: summary.failed,
    });

    return summary;
  } finally {
    try {
      await closeBrowser();
    } catch (error) {
      log.error('Failed to close quote scraper browser after scrape run', { runId, error });
    }
  }
}

/**
 * Feature 5: Scrapes multiple product options for the same product in one run.
 * Accepts an array of { productId, optionId } pairs and scrapes them all under
 * a single runId so their attempts share the same run audit trail.
 *
 * Used by the API endpoint POST /api/tracked-products/bulk-track.
 */
export async function scrapeMultipleOptions(
  trackedProducts,
  {
    runId = randomUUID(),
    scrapeTrackedProduct = scrapeAndPersistTrackedProduct,
    stampNextScrapeAt = persistNextScrapeAt,
    closeBrowser = closeQuoteScraperBrowser,
    log = logger,
  } = {}
) {
  if (!Array.isArray(trackedProducts) || trackedProducts.length === 0) {
    throw new TypeError('trackedProducts must be a non-empty array');
  }

  const results = [];
  log.info('Multi-option scrape run started', { runId, count: trackedProducts.length });

  try {
    for (const trackedProduct of trackedProducts) {
      const item = await scrapeOneProduct(trackedProduct, {
        runId,
        scrapeTrackedProduct,
        stampNextScrapeAt,
        log,
      });
      results.push(item);
    }

    const successful = results.filter((item) => item.outcome === 'success').length;
    return { runId, total: results.length, successful, failed: results.length - successful, results };
  } finally {
    try {
      await closeBrowser();
    } catch (error) {
      log.error('Failed to close browser after multi-option scrape', { runId, error });
    }
  }
}
