import { jest } from '@jest/globals';
import { runActiveTrackedProductScrape } from '../src/services/scrapeRunService.js';

const TRACKED_PRODUCTS = [
  { id: 'tracked-1', product_id: '1001', option_id: 'o1' },
  { id: 'tracked-2', product_id: '1002', option_id: 'o2' },
  { id: 'tracked-3', product_id: '1003', option_id: 'o3' },
];

function createLog() {
  return { info: jest.fn(), error: jest.fn() };
}

describe('active tracked-product scrape run', () => {
  test('returns an empty run summary and closes the browser when nothing is active', async () => {
    const closeBrowser = jest.fn().mockResolvedValue();

    const summary = await runActiveTrackedProductScrape({
      runId: 'run-empty',
      listActiveTrackedProducts: jest.fn().mockResolvedValue([]),
      scrapeTrackedProduct: jest.fn(),
      closeBrowser,
      log: createLog(),
    });

    expect(summary).toEqual({
      runId: 'run-empty',
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    });
    expect(closeBrowser).toHaveBeenCalledTimes(1);
  });

  test('runs due custom-frequency products without scraping products on the global schedule', async () => {
    const customProduct = {
      id: 'custom-tracked-1',
      product_id: '1004',
      option_id: 'o4',
      scrape_frequency_minutes: 5,
      next_scrape_at: '2026-09-26T12:00:00.000Z',
    };
    const listActiveTrackedProducts = jest.fn();
    const listDueCustomProducts = jest.fn().mockResolvedValue([customProduct]);
    const scrapeTrackedProduct = jest.fn().mockResolvedValue({
      outcome: 'success',
      attempts: [{ outcome: 'success' }],
    });
    const stampNextScrapeAt = jest.fn().mockResolvedValue();

    const summary = await runActiveTrackedProductScrape({
      runId: 'run-custom-due',
      customOnly: true,
      listActiveTrackedProducts,
      listDueCustomProducts,
      scrapeTrackedProduct,
      stampNextScrapeAt,
      closeBrowser: jest.fn().mockResolvedValue(),
      log: createLog(),
    });

    expect(listActiveTrackedProducts).not.toHaveBeenCalled();
    expect(listDueCustomProducts).toHaveBeenCalledWith();
    expect(scrapeTrackedProduct).toHaveBeenCalledWith(customProduct, { runId: 'run-custom-due' });
    expect(stampNextScrapeAt).toHaveBeenCalledWith(customProduct.id, 5);
    expect(summary).toMatchObject({
      runId: 'run-custom-due',
      total: 1,
      successful: 1,
      failed: 0,
    });
  });

  test('uses one run ID, persists each product independently, and continues after an exception', async () => {
    const scrapeTrackedProduct = jest.fn((trackedProduct, { runId }) => {
      if (trackedProduct.id === 'tracked-2') {
        const error = new Error('database password=must-not-reach-client');
        error.code = 'PERSISTENCE_ERROR';
        return Promise.reject(error);
      }

      return Promise.resolve(
        trackedProduct.id === 'tracked-1'
          ? { outcome: 'success', attempts: [{ outcome: 'success' }] }
          : {
              outcome: 'failed',
              attempts: [{ outcome: 'retried' }, { outcome: 'failed' }],
              error: { code: 'QUOTE_UNAVAILABLE' },
              runId,
            }
      );
    });
    const closeBrowser = jest.fn().mockResolvedValue();
    const log = createLog();

    const summary = await runActiveTrackedProductScrape({
      runId: 'run-isolated',
      listActiveTrackedProducts: jest.fn().mockResolvedValue(TRACKED_PRODUCTS),
      scrapeTrackedProduct,
      closeBrowser,
      log,
    });

    expect(scrapeTrackedProduct).toHaveBeenCalledTimes(3);
    expect(scrapeTrackedProduct.mock.calls.map(([, options]) => options)).toEqual([
      { runId: 'run-isolated' },
      { runId: 'run-isolated' },
      { runId: 'run-isolated' },
    ]);
    expect(summary).toMatchObject({
      runId: 'run-isolated',
      total: 3,
      successful: 1,
      failed: 2,
      results: [
        { trackedProductId: 'tracked-1', outcome: 'success', attemptCount: 1 },
        {
          trackedProductId: 'tracked-2',
          outcome: 'failed',
          attemptCount: 0,
          errorCode: 'PERSISTENCE_ERROR',
        },
        {
          trackedProductId: 'tracked-3',
          outcome: 'failed',
          attemptCount: 2,
          errorCode: 'QUOTE_UNAVAILABLE',
        },
      ],
    });
    expect(closeBrowser).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      'Tracked product scrape failed unexpectedly',
      expect.objectContaining({
        runId: 'run-isolated',
        trackedProductId: 'tracked-2',
        errorCode: 'PERSISTENCE_ERROR',
      })
    );
  });

  test('can scrape one requested tracked product without scraping the rest of the dashboard', async () => {
    const scrapeTrackedProduct = jest.fn().mockResolvedValue({
      outcome: 'success',
      attempts: [{ outcome: 'success' }],
    });

    const summary = await runActiveTrackedProductScrape({
      runId: 'run-manual-one',
      trackedProductId: 'tracked-2',
      listActiveTrackedProducts: jest.fn().mockResolvedValue(TRACKED_PRODUCTS),
      scrapeTrackedProduct,
      closeBrowser: jest.fn().mockResolvedValue(),
      log: createLog(),
    });

    expect(scrapeTrackedProduct).toHaveBeenCalledTimes(1);
    expect(scrapeTrackedProduct).toHaveBeenCalledWith(TRACKED_PRODUCTS[1], { runId: 'run-manual-one' });
    expect(summary).toMatchObject({ total: 1, successful: 1, failed: 0 });
  });

  test('closes the browser and rethrows when active products cannot be loaded', async () => {
    const loadError = new Error('Database unavailable');
    const closeBrowser = jest.fn().mockResolvedValue();

    await expect(
      runActiveTrackedProductScrape({
        runId: 'run-load-error',
        listActiveTrackedProducts: jest.fn().mockRejectedValue(loadError),
        closeBrowser,
        log: createLog(),
      })
    ).rejects.toBe(loadError);

    expect(closeBrowser).toHaveBeenCalledTimes(1);
  });

  test('logs but does not replace a completed summary when browser cleanup fails', async () => {
    const cleanupError = new Error('browser close failed');
    const log = createLog();

    const summary = await runActiveTrackedProductScrape({
      runId: 'run-cleanup-error',
      listActiveTrackedProducts: jest.fn().mockResolvedValue([]),
      closeBrowser: jest.fn().mockRejectedValue(cleanupError),
      log,
    });

    expect(summary).toMatchObject({ runId: 'run-cleanup-error', total: 0 });
    expect(log.error).toHaveBeenCalledWith(
      'Failed to close quote scraper browser after scrape run',
      expect.objectContaining({ runId: 'run-cleanup-error', error: cleanupError })
    );
  });
});
