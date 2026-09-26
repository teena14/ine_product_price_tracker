/**
 * scrapeOnce.js — Manual one-shot scraper for development/testing.
 *
 * Usage:
 *   npm run scrape:once
 *
 * Set SCRAPE_PRODUCT_ID and SCRAPE_OPTION_ID in backend/.env, or pass them as:
 *   npm run scrape:once -- <productId> <optionId>
 */

import 'dotenv/config';
import {
  closeQuoteScraperBrowser,
} from '../src/scraper/priceQuoteScraper.js';
import { scrapeQuoteWithRetries } from '../src/scraper/scrapeRetryPolicy.js';
import { logger } from '../src/utils/logger.js';

const [productId = process.env.SCRAPE_PRODUCT_ID, optionId = process.env.SCRAPE_OPTION_ID] = process.argv.slice(2);

if (!productId || !optionId) {
  logger.error('Manual scrape requires a product and option ID');
  process.exitCode = 1;
} else {
  try {
    const result = await scrapeQuoteWithRetries({ productId, optionId });

    if (result.outcome === 'success') {
      logger.info('Manual scrape succeeded', {
        productId,
        optionId,
        runId: result.runId,
        ...result.quote,
        attempts: result.attempts,
        totalDurationMs: result.totalDurationMs,
      });
    } else {
      logger.error('Manual scrape failed', {
        productId,
        optionId,
        runId: result.runId,
        errorCode: result.error.code,
        errorMessage: result.error.message,
        attempts: result.attempts,
        totalDurationMs: result.totalDurationMs,
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
