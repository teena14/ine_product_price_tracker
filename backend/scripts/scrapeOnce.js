/**
 * scrapeOnce.js — Manual one-shot scraper for development/testing.
 *
 * Usage:
 *   npm run scrape:once -- <trackedProductId>
 *   npm run scrape:headed -- <trackedProductId>
 *
 * Set SCRAPE_TRACKED_PRODUCT_ID in backend/.env, or pass an existing tracked
 * product UUID. Every retry event is persisted as its own scrape_attempt row.
 */

import 'dotenv/config';
import { getTrackedProductById } from '../src/repositories/trackedProductsRepository.js';
import { closeQuoteScraperBrowser } from '../src/scraper/priceQuoteScraper.js';
import { scrapeAndPersistTrackedProduct } from '../src/services/scrapePersistenceService.js';
import { logger } from '../src/utils/logger.js';

const argumentsWithoutNode = process.argv.slice(2);
const headed = argumentsWithoutNode.includes('--headed');
const positionalArguments = argumentsWithoutNode.filter((argument) => argument !== '--headed');

if (headed) {
  process.env.PLAYWRIGHT_HEADLESS = 'false';
}

const [trackedProductId = process.env.SCRAPE_TRACKED_PRODUCT_ID] = positionalArguments;

if (!trackedProductId) {
  logger.error('Manual scrape requires an existing tracked product ID');
  process.exitCode = 1;
} else {
  try {
    const trackedProduct = await getTrackedProductById(trackedProductId);
    if (!trackedProduct.active) {
      throw new Error('Manual scrape requires an active tracked product');
    }

    logger.info('Manual scrape started', {
      trackedProductId: trackedProduct.id,
      browserMode: headed ? 'headed' : 'headless',
    });
    const result = await scrapeAndPersistTrackedProduct(trackedProduct);
    const context = {
      trackedProductId: trackedProduct.id,
      productId: trackedProduct.product_id,
      optionId: trackedProduct.option_id,
      runId: result.runId,
      attempts: result.attempts,
      persistedAttemptIds: result.persistedAttempts.map((attempt) => attempt.id),
      totalDurationMs: result.totalDurationMs,
    };

    if (result.outcome === 'success') {
      logger.info('Manual scrape succeeded', {
        ...context,
        ...result.quote,
      });
    } else {
      logger.error('Manual scrape failed', {
        ...context,
        errorCode: result.error.code,
        errorMessage: result.error.message,
      });
      process.exitCode = 1;
    }
  } catch (error) {
    logger.error('Manual scrape failed', { errorCode: error.code || 'SCRAPE_FAILED', error });
    process.exitCode = 1;
  } finally {
    await closeQuoteScraperBrowser();
  }
}
