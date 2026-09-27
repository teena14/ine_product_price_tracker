import { jest } from '@jest/globals';
import { QuoteScraperError } from '../src/scraper/priceQuoteScraper.js';
import {
  persistScrapeAttempts,
  scrapeAndPersistTrackedProduct,
  toScrapeAttemptRecord,
} from '../src/services/scrapePersistenceService.js';

const TRACKED_PRODUCT = {
  id: 'a0b1c2d3-e4f5-4a67-8b9c-0d1e2f3a4b5c',
  product_id: '2037',
  option_id: 'o2',
};

const SUCCESS_EVENT = {
  attemptNumber: 2,
  outcome: 'success',
  price: 18145.5,
  stock: 12,
  errorCode: null,
  errorMessage: null,
  durationMs: 125,
};

const RETRIED_EVENT = {
  attemptNumber: 1,
  outcome: 'retried',
  price: null,
  stock: null,
  errorCode: 'SCRAPE_TIMEOUT',
  errorMessage: 'Timed out waiting for a quote',
  durationMs: 20_000,
};

const FAILED_EVENT = {
  attemptNumber: 1,
  outcome: 'failed',
  price: null,
  stock: null,
  errorCode: 'SCRAPE_VALIDATION_ERROR',
  errorMessage: 'The displayed price is malformed',
  durationMs: 10,
};

describe('scrape persistence service', () => {
  test('maps a successful retry event to the validated database record shape', () => {
    expect(toScrapeAttemptRecord(TRACKED_PRODUCT.id, 'run-success', SUCCESS_EVENT)).toEqual({
      tracked_product_id: TRACKED_PRODUCT.id,
      run_id: 'run-success',
      price: 18145.5,
      stock: 12,
      outcome: 'success',
      error_code: null,
      error_message: null,
      attempt_number: 2,
      duration_ms: 125,
    });
  });

  test('maps a failed event with empty quote fields and required error context', () => {
    expect(toScrapeAttemptRecord(TRACKED_PRODUCT.id, 'run-failed', FAILED_EVENT)).toMatchObject({
      tracked_product_id: TRACKED_PRODUCT.id,
      run_id: 'run-failed',
      price: null,
      stock: null,
      outcome: 'failed',
      error_code: 'SCRAPE_VALIDATION_ERROR',
      error_message: 'The displayed price is malformed',
      attempt_number: 1,
    });
  });

  test('validates every event before writing any rows', async () => {
    const saveAttempt = jest.fn();
    const invalidSuccess = { ...SUCCESS_EVENT, stock: 1.5 };

    await expect(
      persistScrapeAttempts(
        TRACKED_PRODUCT.id,
        { runId: 'run-invalid', attempts: [RETRIED_EVENT, invalidSuccess] },
        { saveAttempt }
      )
    ).rejects.toThrow('Invalid scrape attempt payload');

    expect(saveAttempt).not.toHaveBeenCalled();
  });

  test('appends retried and successful attempts in order without an update path', async () => {
    const saveAttempt = jest.fn(async (record) => ({ id: `saved-${record.attempt_number}`, ...record }));

    const saved = await persistScrapeAttempts(
      TRACKED_PRODUCT.id,
      { runId: 'run-retry-success', attempts: [RETRIED_EVENT, SUCCESS_EVENT] },
      { saveAttempt }
    );

    expect(saveAttempt.mock.calls.map(([record]) => record)).toEqual([
      expect.objectContaining({
        run_id: 'run-retry-success',
        attempt_number: 1,
        outcome: 'retried',
        price: null,
        stock: null,
      }),
      expect.objectContaining({
        run_id: 'run-retry-success',
        attempt_number: 2,
        outcome: 'success',
        price: 18145.5,
        stock: 12,
      }),
    ]);
    expect(saved.map((attempt) => attempt.id)).toEqual(['saved-1', 'saved-2']);
  });

  test('persists a final failed scrape attempt honestly', async () => {
    const saveAttempt = jest.fn(async (record) => ({ id: 'failed-row', ...record }));

    const saved = await persistScrapeAttempts(
      TRACKED_PRODUCT.id,
      { runId: 'run-final-failure', attempts: [FAILED_EVENT] },
      { saveAttempt }
    );

    expect(saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        price: null,
        stock: null,
        error_code: 'SCRAPE_VALIDATION_ERROR',
      })
    );
    expect(saved).toHaveLength(1);
  });

  test('scrapes a tracked product then persists every retry event under one run ID', async () => {
    const scrapeQuote = jest
      .fn()
      .mockRejectedValueOnce(new QuoteScraperError('SCRAPE_TIMEOUT', 'Timed out waiting for a quote'))
      .mockResolvedValueOnce({ price: 18145.5, stock: 12 });
    const saveAttempt = jest.fn(async (record) => ({ id: `row-${record.attempt_number}`, ...record }));
    const updateLastScrape = jest.fn().mockResolvedValue({});

    const result = await scrapeAndPersistTrackedProduct(TRACKED_PRODUCT, {
      runId: 'run-service',
      scrapeQuote,
      sleep: jest.fn().mockResolvedValue(),
      saveAttempt,
      updateLastScrape,
    });

    expect(result).toMatchObject({ runId: 'run-service', outcome: 'success' });
    expect(result.persistedAttempts.map((attempt) => attempt.id)).toEqual(['row-1', 'row-2']);
    expect(saveAttempt.mock.calls.map(([record]) => record)).toEqual([
      expect.objectContaining({
        tracked_product_id: TRACKED_PRODUCT.id,
        run_id: 'run-service',
        attempt_number: 1,
        outcome: 'retried',
      }),
      expect.objectContaining({
        tracked_product_id: TRACKED_PRODUCT.id,
        run_id: 'run-service',
        attempt_number: 2,
        outcome: 'success',
      }),
    ]);
  });

  test('writes last_price and last_stock to the tracking row on a successful scrape', async () => {
    const scrapeQuote = jest.fn().mockResolvedValueOnce({ price: 18145.5, stock: 12 });
    const saveAttempt = jest.fn(async (record) => ({ id: 'row-1', ...record }));
    const updateLastScrape = jest.fn().mockResolvedValue({});

    await scrapeAndPersistTrackedProduct(TRACKED_PRODUCT, {
      runId: 'run-cache-success',
      scrapeQuote,
      sleep: jest.fn().mockResolvedValue(),
      saveAttempt,
      updateLastScrape,
    });

    expect(updateLastScrape).toHaveBeenCalledTimes(1);
    expect(updateLastScrape).toHaveBeenCalledWith(
      TRACKED_PRODUCT.id,
      expect.objectContaining({ price: 18145.5, stock: 12 })
    );
  });

  test('writes only last_scraped_at (preserving previous price) on a failed scrape', async () => {
    const scrapeQuote = jest
      .fn()
      .mockRejectedValue(new QuoteScraperError('SCRAPE_VALIDATION_ERROR', 'Bad price'));
    const saveAttempt = jest.fn(async (record) => ({ id: 'row-fail', ...record }));
    const updateLastScrape = jest.fn().mockResolvedValue({});

    await scrapeAndPersistTrackedProduct(TRACKED_PRODUCT, {
      runId: 'run-cache-failure',
      scrapeQuote,
      sleep: jest.fn().mockResolvedValue(),
      saveAttempt,
      updateLastScrape,
    });

    expect(updateLastScrape).toHaveBeenCalledTimes(1);
    // price and stock must be null on failure — the repo will not overwrite previous values
    expect(updateLastScrape).toHaveBeenCalledWith(
      TRACKED_PRODUCT.id,
      expect.objectContaining({ price: null, stock: null })
    );
    // scrapedAt must be set so "Not yet checked" clears after the first attempt
    const [, payload] = updateLastScrape.mock.calls[0];
    expect(typeof payload.scrapedAt).toBe('string');
  });
});
