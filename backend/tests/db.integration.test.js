/**
 * Real Supabase integration coverage against a dedicated test project only.
 * These tests create and delete rows. They run only when RUN_DB_TESTS=true and
 * both TEST_SUPABASE_* credentials are present. The normal service-role key
 * is never used; the normal URL is compared only to reject a same-project
 * test configuration before any client is created.
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidSupabaseUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function pointsToApplicationDatabase(testUrl) {
  if (!isValidSupabaseUrl(process.env.SUPABASE_URL)) {
    return false;
  }

  return new URL(testUrl).origin === new URL(process.env.SUPABASE_URL).origin;
}

const hasTestDatabaseConfig =
  isValidSupabaseUrl(process.env.TEST_SUPABASE_URL) &&
  isNonEmptyString(process.env.TEST_SUPABASE_SERVICE_ROLE_KEY) &&
  !pointsToApplicationDatabase(process.env.TEST_SUPABASE_URL);
const shouldRunDatabaseTests = process.env.RUN_DB_TESTS === 'true' && hasTestDatabaseConfig;
const testSupabaseClient = shouldRunDatabaseTests
  ? createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function getTestSupabaseClient() {
  if (!testSupabaseClient) {
    throw new Error('Database integration tests require TEST_SUPABASE_* credentials.');
  }

  return testSupabaseClient;
}

// Repositories still import getSupabaseClient, but this test-suite-only mock
// replaces it with the dedicated test-project client. This guarantees the
// suite cannot connect through the normal application database client.
jest.unstable_mockModule('../src/config/supabase.js', () => ({
  getSupabaseClient: getTestSupabaseClient,
}));

const {
  createTrackedProduct,
  getTrackedProductById,
  listTrackedProducts,
} = await import('../src/repositories/trackedProductsRepository.js');
const {
  getScrapeHistory,
  saveScrapeAttempt,
} = await import('../src/repositories/scrapeAttemptsRepository.js');

const describeDatabase = shouldRunDatabaseTests ? describe : describe.skip;

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

    const ids = [...cleanupIds];
    const { error } = await getTestSupabaseClient()
      .from('tracked_products')
      .delete()
      .in('id', ids);
    if (error) {
      throw new Error('Failed to clean up integration-test rows.', { cause: error });
    }
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

    const { error: deactivateError } = await getTestSupabaseClient()
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

    const { error: invalidFailureError } = await getTestSupabaseClient()
      .from('scrape_attempts')
      .insert({
        ...failedAttempt(tracked.id, `run-${randomUUID()}`, 'failed', 1),
        price: 10,
        stock: 0,
      });
    expect(invalidFailureError).not.toBeNull();

    const { error: deleteError } = await getTestSupabaseClient()
      .from('tracked_products')
      .delete()
      .eq('id', tracked.id);
    expect(deleteError).toBeNull();
    cleanupIds.delete(tracked.id);

    await expect(getScrapeHistory(tracked.id)).resolves.toEqual([]);
  });
});
