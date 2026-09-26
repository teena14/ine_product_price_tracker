import { randomUUID } from 'crypto';
import {
  QuoteScraperError,
  scrapeCurrentQuote,
  validateQuote,
} from './priceQuoteScraper.js';

export const DEFAULT_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
});

const RETRYABLE_ERROR_CODES = new Set([
  'SCRAPE_TIMEOUT',
  'SCRAPE_NETWORK_ERROR',
  'SCRAPE_UPSTREAM_ERROR',
  'QUOTE_UNAVAILABLE',
  'SCRAPE_BROWSER_ERROR',
]);

const SAFE_ERROR_CODES = new Set([
  ...RETRYABLE_ERROR_CODES,
  'INVALID_OPTION',
  'PRODUCT_NOT_FOUND',
  'SCRAPE_VALIDATION_ERROR',
  'SCRAPE_FAILED',
]);

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function durationSince(startedAt, now) {
  const duration = Math.round(now() - startedAt);

  return Number.isFinite(duration) && duration >= 0 ? duration : 0;
}

function normalizedRetryPolicy(overrides = {}) {
  const policy = { ...DEFAULT_RETRY_POLICY, ...overrides };

  if (
    !Number.isSafeInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    !Number.isSafeInteger(policy.baseDelayMs) ||
    policy.baseDelayMs < 0 ||
    !Number.isSafeInteger(policy.maxDelayMs) ||
    policy.maxDelayMs < policy.baseDelayMs
  ) {
    throw new TypeError('Invalid scrape retry policy');
  }

  return policy;
}

function safeErrorDetails(error) {
  const code = SAFE_ERROR_CODES.has(error?.code) ? error.code : 'SCRAPE_FAILED';
  const message =
    error instanceof QuoteScraperError
      ? error.message
      : 'The quote scraper failed unexpectedly';

  return { code, message };
}

function validateScrapeInput({ productId, optionId }) {
  if (typeof productId !== 'string' || productId.trim().length === 0) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'A product ID is required for scraping');
  }
  if (typeof optionId !== 'string' || optionId.trim().length === 0) {
    throw new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'An option ID is required for scraping');
  }
}

function failedResult({ runId, productId, optionId, attempts, error, totalDurationMs }) {
  return {
    runId,
    productId,
    optionId,
    outcome: 'failed',
    error,
    attempts,
    totalDurationMs,
  };
}

/**
 * Exponential retry delay after a failed attempt. For the default policy,
 * retries wait 500ms then 1s; a maximum prevents unbounded slowdown.
 */
export function getBackoffDelayMs(attemptNumber, policyOverrides = {}) {
  const policy = normalizedRetryPolicy(policyOverrides);

  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    throw new TypeError('attemptNumber must be a positive integer');
  }

  return Math.min(policy.baseDelayMs * 2 ** (attemptNumber - 1), policy.maxDelayMs);
}

/**
 * Classifies only known temporary scraper failures as retryable. Invalid
 * product/option input and invalid quote data fail once and stay observable.
 */
export function isRetryableScrapeError(error) {
  return RETRYABLE_ERROR_CODES.has(error?.code);
}

/**
 * Runs one product quote scrape with bounded retries and returns an immutable
 * in-memory event for every attempt. This module has no database or HTTP
 * endpoint dependency: Phase 7 will persist these events append-only.
 */
export async function scrapeQuoteWithRetries(
  { productId, optionId },
  {
    runId = randomUUID(),
    retryPolicy = {},
    scrapeQuote = scrapeCurrentQuote,
    sleep = wait,
    now = Date.now,
  } = {}
) {
  const policy = normalizedRetryPolicy(retryPolicy);
  const attempts = [];
  const runStartedAt = now();

  for (let attemptNumber = 1; attemptNumber <= policy.maxAttempts; attemptNumber += 1) {
    const attemptStartedAt = now();

    try {
      validateScrapeInput({ productId, optionId });
      // The production scraper already validates its output. Validating here
      // as well keeps the retry boundary safe when a test or later caller
      // supplies a different scrape implementation.
      const quote = validateQuote(await scrapeQuote({ productId, optionId }));
      const durationMs = durationSince(attemptStartedAt, now);

      attempts.push({
        attemptNumber,
        outcome: 'success',
        price: quote.price,
        stock: quote.stock,
        errorCode: null,
        errorMessage: null,
        durationMs,
      });

      return {
        runId,
        productId,
        optionId,
        outcome: 'success',
        quote,
        attempts,
        totalDurationMs: durationSince(runStartedAt, now),
      };
    } catch (error) {
      const safeError = safeErrorDetails(error);
      const shouldRetry = attemptNumber < policy.maxAttempts && isRetryableScrapeError(error);
      const durationMs = durationSince(attemptStartedAt, now);

      attempts.push({
        attemptNumber,
        outcome: shouldRetry ? 'retried' : 'failed',
        price: null,
        stock: null,
        errorCode: safeError.code,
        errorMessage: safeError.message,
        durationMs,
      });

      if (!shouldRetry) {
        return failedResult({
          runId,
          productId,
          optionId,
          attempts,
          error: safeError,
          totalDurationMs: durationSince(runStartedAt, now),
        });
      }

      await sleep(getBackoffDelayMs(attemptNumber, policy));
    }
  }

  // The loop always returns after its final attempt. This guard preserves a
  // safe, observable result if the implementation changes in the future.
  return failedResult({
    runId,
    productId,
    optionId,
    attempts,
    error: { code: 'SCRAPE_FAILED', message: 'The quote scraper failed unexpectedly' },
    totalDurationMs: durationSince(runStartedAt, now),
  });
}

function isolatedUnexpectedFailure({ runId, productId, optionId, error }) {
  const safeError = safeErrorDetails(error);

  return failedResult({
    runId,
    productId,
    optionId,
    attempts: [
      {
        attemptNumber: 1,
        outcome: 'failed',
        price: null,
        stock: null,
        errorCode: safeError.code,
        errorMessage: safeError.message,
        durationMs: 0,
      },
    ],
    error: safeError,
    totalDurationMs: 0,
  });
}

/**
 * Executes in-memory product contexts independently. It deliberately does
 * not query Supabase, persist attempts, expose a route, or schedule work.
 * A future Phase 9 run can pass its one run ID to this helper after loading
 * active products, while Phase 7 persists every returned attempt event.
 */
export async function scrapeProductsIndependently(
  trackedProducts,
  {
    runId = randomUUID(),
    retryPolicy = {},
    scrapeQuote = scrapeCurrentQuote,
    sleep = wait,
    now = Date.now,
  } = {}
) {
  if (!Array.isArray(trackedProducts)) {
    throw new TypeError('trackedProducts must be an array');
  }

  // Treat a malformed global policy as a caller/configuration error rather
  // than fabricating one failure row for every product.
  const policy = normalizedRetryPolicy(retryPolicy);
  const results = [];

  for (const trackedProduct of trackedProducts) {
    const trackedProductId = trackedProduct?.id ?? null;
    let productId;
    let optionId;
    let result;

    try {
      productId = trackedProduct?.productId ?? trackedProduct?.product_id;
      optionId = trackedProduct?.optionId ?? trackedProduct?.option_id;
      result = await scrapeQuoteWithRetries(
        { productId, optionId },
        { runId, retryPolicy: policy, scrapeQuote, sleep, now }
      );
    } catch (error) {
      result = isolatedUnexpectedFailure({ runId, productId, optionId, error });
    }

    results.push({
      trackedProductId,
      ...result,
    });
  }

  const successful = results.filter((result) => result.outcome === 'success').length;

  return {
    runId,
    total: results.length,
    successful,
    failed: results.length - successful,
    results,
  };
}
