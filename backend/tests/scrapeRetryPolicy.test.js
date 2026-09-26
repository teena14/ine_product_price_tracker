import { jest } from '@jest/globals';
import { QuoteScraperError } from '../src/scraper/priceQuoteScraper.js';
import {
  getBackoffDelayMs,
  isRetryableScrapeError,
  scrapeProductsIndependently,
  scrapeQuoteWithRetries,
} from '../src/scraper/scrapeRetryPolicy.js';

const INPUT = { productId: '2037', optionId: 'o2' };
const QUOTE = { price: 18145.5, stock: 12 };

function scraperError(code, message = 'Scrape failed') {
  return new QuoteScraperError(code, message);
}

describe('scrape retry policy', () => {
  test('uses bounded exponential backoff', () => {
    const policy = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 1_000 };

    expect(getBackoffDelayMs(1, policy)).toBe(500);
    expect(getBackoffDelayMs(2, policy)).toBe(1_000);
    expect(getBackoffDelayMs(3, policy)).toBe(1_000);
  });

  test('retries only known temporary scraper failures', () => {
    expect(isRetryableScrapeError(scraperError('SCRAPE_TIMEOUT'))).toBe(true);
    expect(isRetryableScrapeError(scraperError('QUOTE_UNAVAILABLE'))).toBe(true);
    expect(isRetryableScrapeError(scraperError('SCRAPE_VALIDATION_ERROR'))).toBe(false);
    expect(isRetryableScrapeError(scraperError('INVALID_OPTION'))).toBe(false);
  });

  test('returns one successful, validated append-only attempt', async () => {
    const scrapeQuote = jest.fn().mockResolvedValue(QUOTE);
    const now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(125).mockReturnValueOnce(125);

    const result = await scrapeQuoteWithRetries(INPUT, {
      runId: 'run-success',
      scrapeQuote,
      now,
    });

    expect(result).toMatchObject({
      runId: 'run-success',
      outcome: 'success',
      quote: QUOTE,
      totalDurationMs: 125,
      attempts: [
        {
          attemptNumber: 1,
          outcome: 'success',
          price: QUOTE.price,
          stock: QUOTE.stock,
          errorCode: null,
          errorMessage: null,
          durationMs: 125,
        },
      ],
    });
    expect(scrapeQuote).toHaveBeenCalledWith(INPUT);
  });

  test('waits for a slow quote instead of treating it as missing data', async () => {
    const scrapeQuote = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return QUOTE;
    });

    const result = await scrapeQuoteWithRetries(INPUT, { scrapeQuote });

    expect(result.outcome).toBe('success');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(15);
  });

  test('records a retried timeout then a separate successful attempt', async () => {
    const scrapeQuote = jest
      .fn()
      .mockRejectedValueOnce(scraperError('SCRAPE_TIMEOUT', 'Timed out waiting for a quote'))
      .mockResolvedValueOnce(QUOTE);
    const sleep = jest.fn().mockResolvedValue();

    const result = await scrapeQuoteWithRetries(INPUT, {
      runId: 'run-retry-success',
      scrapeQuote,
      sleep,
    });

    expect(scrapeQuote).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(result.attempts).toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        outcome: 'retried',
        price: null,
        stock: null,
        errorCode: 'SCRAPE_TIMEOUT',
      }),
      expect.objectContaining({
        attemptNumber: 2,
        outcome: 'success',
        price: QUOTE.price,
        stock: QUOTE.stock,
        errorCode: null,
      }),
    ]);
  });

  test('records every transient failure before retry exhaustion', async () => {
    const scrapeQuote = jest
      .fn()
      .mockRejectedValue(scraperError('QUOTE_UNAVAILABLE', 'The store could not provide a quote'));
    const sleep = jest.fn().mockResolvedValue();

    const result = await scrapeQuoteWithRetries(INPUT, { scrapeQuote, sleep });

    expect(scrapeQuote).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[500], [1_000]]);
    expect(result).toMatchObject({
      outcome: 'failed',
      error: { code: 'QUOTE_UNAVAILABLE', message: 'The store could not provide a quote' },
    });
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['retried', 'retried', 'failed']);
    expect(result.attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2, 3]);
    expect(result.attempts.every((attempt) => attempt.price === null && attempt.stock === null)).toBe(true);
  });

  test('fails validation errors once without a retry or fabricated quote data', async () => {
    const scrapeQuote = jest
      .fn()
      .mockRejectedValue(scraperError('SCRAPE_VALIDATION_ERROR', 'The displayed price is malformed'));
    const sleep = jest.fn();

    const result = await scrapeQuoteWithRetries(INPUT, { scrapeQuote, sleep });

    expect(scrapeQuote).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(result.attempts).toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        outcome: 'failed',
        price: null,
        stock: null,
        errorCode: 'SCRAPE_VALIDATION_ERROR',
      }),
    ]);
  });

  test('turns missing quote data into a final validation failure', async () => {
    const scrapeQuote = jest.fn().mockResolvedValue({ price: null, stock: 12 });
    const sleep = jest.fn();

    const result = await scrapeQuoteWithRetries(INPUT, { scrapeQuote, sleep });

    expect(scrapeQuote).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: 'failed',
      attempts: [
        expect.objectContaining({
          outcome: 'failed',
          price: null,
          stock: null,
          errorCode: 'SCRAPE_VALIDATION_ERROR',
        }),
      ],
    });
  });

  test('isolates a failed product while continuing other product contexts under one run ID', async () => {
    const scrapeQuote = jest.fn(({ productId }) => {
      if (productId === 'broken') {
        return Promise.reject(scraperError('INVALID_OPTION', 'Option no longer exists'));
      }
      return Promise.resolve(QUOTE);
    });

    const summary = await scrapeProductsIndependently(
      [
        { id: 'tracked-1', product_id: 'working-first', option_id: 'o1' },
        { id: 'tracked-2', product_id: 'broken', option_id: 'o2' },
        { id: 'tracked-3', product_id: 'working-last', option_id: 'o3' },
      ],
      { runId: 'run-isolated', scrapeQuote, sleep: jest.fn().mockResolvedValue() }
    );

    expect(scrapeQuote).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({
      runId: 'run-isolated',
      total: 3,
      successful: 2,
      failed: 1,
    });
    expect(summary.results.map((result) => result.runId)).toEqual([
      'run-isolated',
      'run-isolated',
      'run-isolated',
    ]);
    expect(summary.results.map((result) => result.outcome)).toEqual(['success', 'failed', 'success']);
    expect(summary.results[1]).toMatchObject({
      trackedProductId: 'tracked-2',
      attempts: [expect.objectContaining({ outcome: 'failed', errorCode: 'INVALID_OPTION' })],
    });
  });

  test('isolates a malformed product context instead of abandoning later products', async () => {
    const scrapeQuote = jest.fn().mockResolvedValue(QUOTE);

    const summary = await scrapeProductsIndependently(
      [null, { id: 'tracked-3', product_id: 'working-last', option_id: 'o3' }],
      { runId: 'run-malformed-context', scrapeQuote }
    );

    expect(summary).toMatchObject({ total: 2, successful: 1, failed: 1 });
    expect(summary.results.map((result) => result.outcome)).toEqual(['failed', 'success']);
    expect(summary.results[0].attempts).toEqual([
      expect.objectContaining({ outcome: 'failed', errorCode: 'SCRAPE_VALIDATION_ERROR' }),
    ]);
    expect(scrapeQuote).toHaveBeenCalledTimes(1);
  });
});
