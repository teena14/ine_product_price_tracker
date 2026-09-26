import { randomUUID } from 'crypto';
import { listAllActiveTrackedProducts } from '../repositories/trackedProductsRepository.js';
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
 * Runs all active tracking records serially under one run ID. Individual
 * product failures are contained so later products still scrape and persist.
 * This is invoked only by the authenticated internal cron endpoint; it does
 * not schedule work itself.
 */
export async function runActiveTrackedProductScrape(
  {
    runId = randomUUID(),
    listActiveTrackedProducts = listAllActiveTrackedProducts,
    scrapeTrackedProduct = scrapeAndPersistTrackedProduct,
    closeBrowser = closeQuoteScraperBrowser,
    log = logger,
  } = {}
) {
  const results = [];
  log.info('Scrape run started', { runId });

  try {
    const trackedProducts = await listActiveTrackedProducts();

    for (const trackedProduct of trackedProducts) {
      try {
        const result = await scrapeTrackedProduct(trackedProduct, { runId });
        const item = resultItem(trackedProduct, result);
        results.push(item);
        log.info('Tracked product scrape completed', {
          runId,
          trackedProductId: item.trackedProductId,
          productId: item.productId,
          attemptCount: item.attemptCount,
          outcome: item.outcome,
          ...(item.errorCode ? { errorCode: item.errorCode } : {}),
        });
      } catch (error) {
        const item = isolatedFailureItem(trackedProduct, error);
        results.push(item);
        log.error('Tracked product scrape failed unexpectedly', {
          runId,
          trackedProductId: item.trackedProductId,
          productId: item.productId,
          errorCode: item.errorCode,
          error,
        });
      }
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
