/**
 * Phase 1 integration tests — Database repositories
 *
 * These tests run against the real Supabase database.
 * They are intentionally skipped in CI (no real DB credentials there).
 * Run locally with: npm test
 *
 * Each test cleans up after itself.
 */

import 'dotenv/config';
import {
  createTrackedProduct,
  getTrackedProductById,
  listActiveTrackedProducts,
  listAllTrackedProducts,
  deactivateTrackedProduct,
} from '../src/repositories/trackedProductsRepository.js';
import {
  saveScrapeAttempt,
  getScrapeHistory,
  getLatestScrapeAttempt,
  getLatestSuccessfulScrapeAttempt,
  getAllScrapeAttemptsForExport,
} from '../src/repositories/scrapeAttemptsRepository.js';

// Skip all tests if Supabase credentials are not real (CI environment)
const hasRealCreds =
  process.env.SUPABASE_URL &&
  !process.env.SUPABASE_URL.includes('placeholder') &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder');

const describeOrSkip = hasRealCreds ? describe : describe.skip;

const TEST_PRODUCT = {
  product_id: '__test_product_123__',
  product_url: 'https://hire.ine.com/__test__',
  product_name: 'Test Product (Jest)',
  option_id: '__test_option_abc__',
  option_name: 'Test Option A',
};

describeOrSkip('trackedProductsRepository', () => {
  let createdId;

  afterEach(async () => {
    // Best-effort cleanup — deactivate any test rows
    if (createdId) {
      try {
        await deactivateTrackedProduct(createdId);
      } catch { // intentional: cleanup is best-effort
        // already cleaned up or didn't exist
      }
      createdId = null;
    }
  });

  test('createTrackedProduct — inserts a new row and returns it', async () => {
    const row = await createTrackedProduct(TEST_PRODUCT);
    createdId = row.id;

    expect(row.id).toBeDefined();
    expect(row.product_id).toBe(TEST_PRODUCT.product_id);
    expect(row.option_id).toBe(TEST_PRODUCT.option_id);
    expect(row.active).toBe(true);
    expect(row.created_at).toBeDefined();
  });

  test('createTrackedProduct — throws DUPLICATE_TRACKING for same active product+option', async () => {
    const row = await createTrackedProduct(TEST_PRODUCT);
    createdId = row.id;

    await expect(createTrackedProduct(TEST_PRODUCT)).rejects.toMatchObject({
      code: 'DUPLICATE_TRACKING',
    });
  });

  test('getTrackedProductById — returns the correct row', async () => {
    const created = await createTrackedProduct(TEST_PRODUCT);
    createdId = created.id;

    const fetched = await getTrackedProductById(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.product_name).toBe(TEST_PRODUCT.product_name);
  });

  test('getTrackedProductById — throws TRACKED_PRODUCT_NOT_FOUND for unknown id', async () => {
    await expect(
      getTrackedProductById('00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'TRACKED_PRODUCT_NOT_FOUND' });
  });

  test('listActiveTrackedProducts — includes newly created active product', async () => {
    const created = await createTrackedProduct(TEST_PRODUCT);
    createdId = created.id;

    const list = await listActiveTrackedProducts();
    expect(list.some((p) => p.id === created.id)).toBe(true);
  });

  test('deactivateTrackedProduct — sets active=false', async () => {
    const created = await createTrackedProduct(TEST_PRODUCT);
    createdId = created.id;

    const deactivated = await deactivateTrackedProduct(created.id);
    expect(deactivated.active).toBe(false);

    const activeList = await listActiveTrackedProducts();
    expect(activeList.some((p) => p.id === created.id)).toBe(false);
  });

  test('listAllTrackedProducts — includes inactive products', async () => {
    const created = await createTrackedProduct(TEST_PRODUCT);
    createdId = created.id;

    await deactivateTrackedProduct(created.id);
    createdId = null; // already deactivated

    const allList = await listAllTrackedProducts();
    expect(allList.some((p) => p.id === created.id)).toBe(true);
  });
});

describeOrSkip('scrapeAttemptsRepository', () => {
  let trackedProductId;

  beforeEach(async () => {
    // Create a fresh tracked product for each scrape test
    const row = await createTrackedProduct({
      ...TEST_PRODUCT,
      option_id: `__opt_${Date.now()}__`, // unique per test run
    });
    trackedProductId = row.id;
  });

  afterEach(async () => {
    if (trackedProductId) {
      try {
        await deactivateTrackedProduct(trackedProductId);
      } catch { // intentional: cleanup is best-effort
        // ignore
      }
    }
  });

  test('saveScrapeAttempt — saves a successful attempt with price and stock', async () => {
    const attempt = await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'test-run-001',
      price: 199.99,
      stock: 42,
      outcome: 'success',
      error_code: null,
      error_message: null,
      attempt_number: 1,
      duration_ms: 3200,
    });

    expect(attempt.id).toBeDefined();
    expect(parseFloat(attempt.price)).toBeCloseTo(199.99);
    expect(attempt.stock).toBe(42);
    expect(attempt.outcome).toBe('success');
  });

  test('saveScrapeAttempt — saves a failed attempt with null price/stock', async () => {
    const attempt = await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'test-run-002',
      price: null,
      stock: null,
      outcome: 'failed',
      error_code: 'SCRAPE_TIMEOUT',
      error_message: 'Timed out waiting for price element',
      attempt_number: 1,
      duration_ms: 10000,
    });

    expect(attempt.outcome).toBe('failed');
    expect(attempt.price).toBeNull();
    expect(attempt.stock).toBeNull();
    expect(attempt.error_code).toBe('SCRAPE_TIMEOUT');
  });

  test('getScrapeHistory — returns attempts newest first', async () => {
    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-A',
      price: 100,
      stock: 5,
      outcome: 'success',
      error_code: null,
      error_message: null,
      attempt_number: 1,
      duration_ms: 2000,
    });

    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-B',
      price: null,
      stock: null,
      outcome: 'failed',
      error_code: 'SCRAPE_TIMEOUT',
      error_message: 'timeout',
      attempt_number: 1,
      duration_ms: 9000,
    });

    const history = await getScrapeHistory(trackedProductId);
    expect(history.length).toBe(2);
    // Newest first — failed is more recent
    expect(history[0].outcome).toBe('failed');
    expect(history[1].outcome).toBe('success');
  });

  test('getLatestScrapeAttempt — returns the most recent attempt', async () => {
    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-first',
      price: 100,
      stock: 5,
      outcome: 'success',
      error_code: null,
      error_message: null,
      attempt_number: 1,
      duration_ms: 1000,
    });

    // Small delay to ensure timestamp ordering
    await new Promise((r) => setTimeout(r, 50));

    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-second',
      price: null,
      stock: null,
      outcome: 'failed',
      error_code: 'SCRAPE_TIMEOUT',
      error_message: 'timeout',
      attempt_number: 1,
      duration_ms: 9000,
    });

    const latest = await getLatestScrapeAttempt(trackedProductId);
    expect(latest.run_id).toBe('run-second');
    expect(latest.outcome).toBe('failed');
  });

  test('getLatestSuccessfulScrapeAttempt — ignores failed attempts', async () => {
    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-success',
      price: 149.99,
      stock: 10,
      outcome: 'success',
      error_code: null,
      error_message: null,
      attempt_number: 1,
      duration_ms: 2000,
    });

    // A subsequent failure must NOT become the "last good" price
    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-failure',
      price: null,
      stock: null,
      outcome: 'failed',
      error_code: 'SCRAPE_TIMEOUT',
      error_message: 'timeout',
      attempt_number: 1,
      duration_ms: 10000,
    });

    const lastGood = await getLatestSuccessfulScrapeAttempt(trackedProductId);
    expect(lastGood).not.toBeNull();
    expect(lastGood.run_id).toBe('run-success');
    expect(parseFloat(lastGood.price)).toBeCloseTo(149.99);
  });

  test('getLatestSuccessfulScrapeAttempt — returns null when no successes exist', async () => {
    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-only-failure',
      price: null,
      stock: null,
      outcome: 'failed',
      error_code: 'QUOTE_UNAVAILABLE',
      error_message: 'quote failed',
      attempt_number: 1,
      duration_ms: 5000,
    });

    const lastGood = await getLatestSuccessfulScrapeAttempt(trackedProductId);
    expect(lastGood).toBeNull();
  });

  test('getAllScrapeAttemptsForExport — returns oldest first (CSV order)', async () => {
    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-old',
      price: 100,
      stock: 5,
      outcome: 'success',
      error_code: null,
      error_message: null,
      attempt_number: 1,
      duration_ms: 1000,
    });

    await new Promise((r) => setTimeout(r, 50));

    await saveScrapeAttempt({
      tracked_product_id: trackedProductId,
      run_id: 'run-new',
      price: 110,
      stock: 3,
      outcome: 'success',
      error_code: null,
      error_message: null,
      attempt_number: 1,
      duration_ms: 1200,
    });

    const rows = await getAllScrapeAttemptsForExport(trackedProductId);
    expect(rows[0].run_id).toBe('run-old');
    expect(rows[1].run_id).toBe('run-new');
  });
});
