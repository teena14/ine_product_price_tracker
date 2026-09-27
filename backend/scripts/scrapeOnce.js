/**
 * scrapeOnce.js — Manual one-shot scraper for development/testing.
 *
 * Usage:
 *   npm run scrape:once -- <trackedProductId|index>
 *   npm run scrape:headed -- <trackedProductId|index>
 *
 * The argument can be:
 *   - A numeric index (0, 1, 2, …) → resolved against the
 *     SCRAPE_TRACKED_PRODUCT_IDS comma-separated list in backend/.env
 *   - A raw tracked-product UUID
 *   - Omitted → falls back to SCRAPE_TRACKED_PRODUCT_ID env var,
 *     then index 0 of SCRAPE_TRACKED_PRODUCT_IDS
 *
 * Every retry event is persisted as its own scrape_attempt row.
 */

import 'dotenv/config';
import { getTrackedProductById } from '../src/repositories/trackedProductsRepository.js';
import { closeQuoteScraperBrowser } from '../src/scraper/priceQuoteScraper.js';
import { scrapeAndPersistTrackedProduct } from '../src/services/scrapePersistenceService.js';
import { logger } from '../src/utils/logger.js';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

function formatDuration(durationMs) {
  return Number.isFinite(durationMs) ? `${(durationMs / 1_000).toFixed(1)}s` : 'unknown duration';
}

function formatQuote(price, stock) {
  return `${currencyFormatter.format(price)} | stock ${stock}`;
}

function logAttempt(attempt, totalAttempts) {
  const prefix = `Attempt ${attempt.attemptNumber}/${totalAttempts} — ${attempt.outcome.toUpperCase()} — ${formatDuration(attempt.durationMs)}`;

  if (attempt.outcome === 'success') {
    logger.info(`${prefix} — ${formatQuote(attempt.price, attempt.stock)}`);
    return;
  }

  logger.warn(`${prefix} — ${attempt.errorCode}: ${attempt.errorMessage}`);
}

function logResult(result) {
  for (const attempt of result.attempts) {
    logAttempt(attempt, result.attempts.length);
  }

  if (result.outcome === 'success') {
    logger.info(
      `Result — SUCCESS — ${formatQuote(result.quote.price, result.quote.stock)} — total ${formatDuration(result.totalDurationMs)} — run ${result.runId}`
    );
    return;
  }

  logger.error(
    `Result — FAILED — ${result.error.code}: ${result.error.message} — total ${formatDuration(result.totalDurationMs)} — run ${result.runId}`
  );
}

const argumentsWithoutNode = process.argv.slice(2);
const headed = argumentsWithoutNode.includes('--headed');
const positionalArguments = argumentsWithoutNode.filter((argument) => argument !== '--headed');

if (headed) {
  process.env.PLAYWRIGHT_HEADLESS = 'false';
}

// Build the ID array from SCRAPE_TRACKED_PRODUCT_IDS (comma-separated in .env).
// e.g. SCRAPE_TRACKED_PRODUCT_IDS=uuid-0,uuid-1,uuid-2
const knownIds = (process.env.SCRAPE_TRACKED_PRODUCT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function resolveTrackedProductId(arg) {
  if (!arg) {
    // No argument — fall back to legacy singular env var, then first in array.
    return process.env.SCRAPE_TRACKED_PRODUCT_ID || knownIds[0] || null;
  }

  // If it looks like a non-negative integer, treat it as an array index.
  if (/^\d+$/.test(arg)) {
    const index = Number(arg);
    const id = knownIds[index];
    if (!id) {
      logger.error(
        `Index ${index} is out of range — SCRAPE_TRACKED_PRODUCT_IDS has ${knownIds.length} entr${knownIds.length === 1 ? 'y' : 'ies'} (0–${knownIds.length - 1})`
      );
      return null;
    }
    return id;
  }

  // Otherwise treat the argument as a raw UUID.
  return arg;
}

const [rawArg] = positionalArguments;
const trackedProductId = resolveTrackedProductId(rawArg);

if (!trackedProductId) {
  logger.error('Manual scrape requires an existing tracked product ID');
  process.exitCode = 1;
} else {
  try {
    const trackedProduct = await getTrackedProductById(trackedProductId);
    if (!trackedProduct.active) {
      throw new Error('Manual scrape requires an active tracked product');
    }

    logger.info(
      `Manual scrape started — ${headed ? 'headed' : 'headless'} — product ${trackedProduct.product_id} — option ${trackedProduct.option_id}`
    );
    const result = await scrapeAndPersistTrackedProduct(trackedProduct);
    logResult(result);

    if (result.outcome !== 'success') {
      process.exitCode = 1;
    }
  } catch (error) {
    logger.error('Manual scrape failed', { errorCode: error.code || 'SCRAPE_FAILED', error });
    process.exitCode = 1;
  } finally {
    await closeQuoteScraperBrowser();
  }
}
