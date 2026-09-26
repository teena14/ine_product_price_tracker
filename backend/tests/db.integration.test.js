/**
 * Real Supabase integration coverage. These tests create and delete rows, so
 * they are opt-in: after applying migration_harden_scrape_attempts.sql run
 * RUN_DB_TESTS=true npm test from backend.
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../src/config/supabase.js';
import {
  createTrackedProduct,
  getTrackedProductById,
  listTrackedProducts,
} from '../src/repositories/trackedProductsRepository.js';
import {
  getScrapeHistory,
  saveScrapeAttempt,
} from '../src/repositories/scrapeAttemptsRepository.js';

const hasDatabaseConfig = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);
const describeDatabase = process.env.RUN_DB_TESTS === 'true' && hasDatabaseConfig ? describe : describe.skip;

function testTrackingData() {
  const suffix = randomUUID();
  return {
    product_id: `__db_product_${suffix}__`,
    product_url: `https://example.test/item/${suffix}`,
    product_name: 'Database Test Product',
    option_id: `__db_option_${suffix}__`,
    option_name: 'Database Test Option',
  };
}

function successfulAttempt(trackedProductId, runId, attemptNumber = 1) {
  return {
    tracked_product_id: trackedProductId,
    run_id: runId,
    price: 199.99,
    stock: 4,
    outcome: 'success',
    error_code: null,
    error_message: null,
    attempt_number: attemptNumber,
    duration_ms: 250,
  };
}

function failedAttempt(trackedProductId, runId, outcome, attemptNumber) {
  return {
    tracked_product_id: trackedProductId,
    run_id: runId,
    price: null,
    stock: null,
    outcome,
    error_code: 'SCRAPE_TIMEOUT',
    error_message: 'Timed out waiting for a quote',
    attempt_number: attemptNumber,
    duration_ms: 1000,
  };
}

describeDatabase('Supabase shared-dashboard and scrape-history rules', () => {
  const cleanupIds = new Set();

  afterEach(async () => {
    if (!cleanupIds.size) {
      return;
    }

    await getSupabaseClient().from('tracked_products').delete().in('id', [...cleanupIds]);
    cleanupIds.clear();
  });

  test('shows a created row in the shared active dashboard and resolves it by ID', async () => {
    const created = await createTrackedProduct(testTrackingData());
    cleanupIds.add(created.id);

    await expect(getTrackedProductById(created.id)).resolves.toMatchObject({ id: created.id });

    const rows = await listTrackedProducts();
    expect(rows.some((row) => row.id === created.id)).toBe(true);
  });

  test('enforces one active shared product+option but allows a new active row after deactivation', async () => {
    const data = testTrackingData();
    const first = await createTrackedProduct(data);
    cleanupIds.add(first.id);

    await expect(createTrackedProduct(data)).rejects.toMatchObject({ code: 'DUPLICATE_TRACKING' });

    const { error: deactivateError } = await getSupabaseClient()
      .from('tracked_products')
      .update({ active: false })
      .eq('id', first.id);
    expect(deactivateError).toBeNull();

    const retracked = await createTrackedProduct(data);
    cleanupIds.add(retracked.id);
    expect(retracked.active).toBe(true);
  });

  test('records each valid outcome append-only and resets attempt numbers for a new run', async () => {
    const tracked = await createTrackedProduct(testTrackingData());
    cleanupIds.add(tracked.id);
    const runA = `run-${randomUUID()}`;
    const runB = `run-${randomUUID()}`;

    const retried = await saveScrapeAttempt(failedAttempt(tracked.id, runA, 'retried', 1));
    const success = await saveScrapeAttempt(successfulAttempt(tracked.id, runA, 2));
    const nextRun = await saveScrapeAttempt(successfulAttempt(tracked.id, runB, 1));

    expect(retried).toMatchObject({ outcome: 'retried', price: null, stock: null, attempt_number: 1 });
    expect(success).toMatchObject({ outcome: 'success', attempt_number: 2 });
    expect(nextRun).toMatchObject({ outcome: 'success', attempt_number: 1 });
    expect(nextRun.scraped_at).toBeDefined();

    await expect(saveScrapeAttempt(failedAttempt(tracked.id, runA, 'failed', 1))).rejects.toThrow(
      'Database error while saving a scrape attempt'
    );
  });

  test('database checks reject fabricated failure values and a hard delete cascades history', async () => {
    const tracked = await createTrackedProduct(testTrackingData());
    cleanupIds.add(tracked.id);
    await saveScrapeAttempt(successfulAttempt(tracked.id, `run-${randomUUID()}`));

    const { error: invalidFailureError } = await getSupabaseClient()
      .from('scrape_attempts')
      .insert({
        ...failedAttempt(tracked.id, `run-${randomUUID()}`, 'failed', 1),
        price: 10,
        stock: 0,
      });
    expect(invalidFailureError).not.toBeNull();

    const { error: deleteError } = await getSupabaseClient()
      .from('tracked_products')
      .delete()
      .eq('id', tracked.id);
    expect(deleteError).toBeNull();
    cleanupIds.delete(tracked.id);

    await expect(getScrapeHistory(tracked.id)).resolves.toEqual([]);
  });
});
