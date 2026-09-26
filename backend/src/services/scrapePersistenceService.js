import { saveScrapeAttempt, validateScrapeAttempt } from '../repositories/scrapeAttemptsRepository.js';
import { scrapeQuoteWithRetries } from '../scraper/scrapeRetryPolicy.js';

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
 * history. It does not load active products or expose an HTTP endpoint; the
 * scheduler orchestration remains Phase 9 work.
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

  return { ...scrapeResult, persistedAttempts };
}
