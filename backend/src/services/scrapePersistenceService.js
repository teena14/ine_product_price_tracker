import { saveScrapeAttempt, validateScrapeAttempt } from '../repositories/scrapeAttemptsRepository.js';
import { updateTrackedProductLastScrape } from '../repositories/trackedProductsRepository.js';
import { scrapeQuoteWithRetries } from '../scraper/scrapeRetryPolicy.js';
import { generatePriceAndStockAlerts, detectAndRecordLayoutChange } from './alertService.js';

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required for scrape-attempt persistence`);
  }
}

function validateTrackedProduct(trackedProduct) {
  if (!trackedProduct || typeof trackedProduct !== 'object') {
    throw new Error('A tracked product is required for scraping');
  }

  requireNonEmptyString(trackedProduct.id, 'trackedProduct.id');
  requireNonEmptyString(trackedProduct.product_id, 'trackedProduct.product_id');
  requireNonEmptyString(trackedProduct.option_id, 'trackedProduct.option_id');
}

/**
 * Translates one in-memory retry event into the repository/database shape.
 * Validation happens before any insert so malformed output is never saved as
 * a successful observation.
 */
export function toScrapeAttemptRecord(trackedProductId, runId, attempt) {
  requireNonEmptyString(trackedProductId, 'trackedProductId');
  requireNonEmptyString(runId, 'runId');
  if (!attempt || typeof attempt !== 'object') {
    throw new Error('A scrape attempt event is required for persistence');
  }

  const record = {
    tracked_product_id: trackedProductId,
    run_id: runId,
    price: attempt.price ?? null,
    stock: attempt.stock ?? null,
    outcome: attempt.outcome,
    error_code: attempt.errorCode ?? null,
    error_message: attempt.errorMessage ?? null,
    attempt_number: attempt.attemptNumber,
    duration_ms: attempt.durationMs ?? null,
  };

  validateScrapeAttempt(record);
  return record;
}

/**
 * Appends every event from one retry result in attempt-number order. Retried
 * and final-failure events remain distinct rows; no existing row is updated.
 */
export async function persistScrapeAttempts(
  trackedProductId,
  scrapeResult,
  { saveAttempt = saveScrapeAttempt } = {}
) {
  if (
    !scrapeResult ||
    typeof scrapeResult !== 'object' ||
    !Array.isArray(scrapeResult.attempts) ||
    scrapeResult.attempts.length === 0
  ) {
    throw new Error('A scrape result with attempt events is required for persistence');
  }

  const records = scrapeResult.attempts.map((attempt) =>
    toScrapeAttemptRecord(trackedProductId, scrapeResult.runId, attempt)
  );
  const savedAttempts = [];

  for (const record of records) {
    savedAttempts.push(await saveAttempt(record));
  }

  return savedAttempts;
}

/**
 * Scrapes one already-persisted tracking record, then appends the full retry
 * history and updates the denormalized cache columns on the tracking row so
 * the dashboard list always reflects the latest observed price and stock.
 *
 * Cache update behaviour:
 *   - Success: last_price, last_stock, and last_scraped_at are all written.
 *   - Failure: only last_scraped_at is written so the last known-good price
 *     remains visible on the card until the scraper succeeds again.
 */
export async function scrapeAndPersistTrackedProduct(
  trackedProduct,
  {
    runId,
    retryPolicy,
    scrapeQuote,
    sleep,
    now,
    saveAttempt = saveScrapeAttempt,
    updateLastScrape = updateTrackedProductLastScrape,
  } = {}
) {
  validateTrackedProduct(trackedProduct);

  const scrapeResult = await scrapeQuoteWithRetries(
    {
      productId: trackedProduct.product_id,
      optionId: trackedProduct.option_id,
    },
    { runId, retryPolicy, scrapeQuote, sleep, now }
  );
  const persistedAttempts = await persistScrapeAttempts(trackedProduct.id, scrapeResult, {
    saveAttempt,
  });

  // Always stamp last_scraped_at so "Not yet checked" clears after the first
  // attempt regardless of outcome. Only propagate price/stock on success.
  const successQuote = scrapeResult.outcome === 'success' ? scrapeResult.quote : null;
  await updateLastScrape(trackedProduct.id, {
    price: successQuote?.price ?? null,
    stock: successQuote?.stock ?? null,
    scrapedAt: new Date().toISOString(),
  });

  // Generate in-app alerts for price drops and stock changes on success
  if (successQuote) {
    await generatePriceAndStockAlerts(trackedProduct, successQuote);
    // Feature 3: detect layout changes from the manifest returned by the scraper
    if (successQuote.uiManifest) {
      await detectAndRecordLayoutChange(trackedProduct, successQuote.uiManifest);
    }
  }

  return { ...scrapeResult, persistedAttempts };
}

