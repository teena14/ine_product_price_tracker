/**
 * dbConnectionTest.js - Verifies Supabase connection and schema.
 * Run: node scripts/dbConnectionTest.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../src/utils/logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function fail(message, error) {
  logger.error(message, { error });
  process.exitCode = 1;
}

async function run() {
  logger.info('Testing Supabase connection');

  const { error: trackedProductsError } = await supabase.from('tracked_products').select('id').limit(1);
  if (trackedProductsError) {
    fail('tracked_products is not accessible', trackedProductsError);
    return;
  }
  logger.info('tracked_products is accessible');

  const { error: scrapeAttemptsError } = await supabase.from('scrape_attempts').select('id').limit(1);
  if (scrapeAttemptsError) {
    fail('scrape_attempts is not accessible', scrapeAttemptsError);
    return;
  }
  logger.info('scrape_attempts is accessible');

  // This script uses an inactive row, so it does not become work for the
  // all-active scraper.
  const testRow = {
    product_id: '__test__',
    product_url: 'https://hire.ine.com/__test__',
    product_name: 'DB Connection Test Product',
    option_id: '__test_option__',
    option_name: 'Test Option',
    active: false,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('tracked_products')
    .insert(testRow)
    .select('id')
    .single();

  if (insertError) {
    fail('Insert test failed', insertError);
    return;
  }
  logger.info('Insert to tracked_products succeeded', { trackedProductId: inserted.id });

  const { error: cleanupError } = await supabase.from('tracked_products').delete().eq('id', inserted.id);
  if (cleanupError) {
    logger.warn('Cleanup failed; remove the test row manually', { error: cleanupError });
    return;
  }

  logger.info('Test row deleted; Supabase schema check passed');
}

run().catch((error) => {
  fail('Unexpected database connection test error', error);
});
