/**
 * db-connection-test.js — Verifies Supabase connection and schema.
 * Run: node scripts/dbConnectionTest.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function run() {
  console.log('[test] Testing Supabase connection...');

  // Test tracked_products
  const { error: e1 } = await supabase
    .from('tracked_products')
    .select('id')
    .limit(1);

  if (e1) {
    console.error('[FAIL] tracked_products:', e1.message);
    process.exit(1);
  }
  console.log('[OK]   tracked_products — accessible');

  // Test scrape_attempts
  const { error: e2 } = await supabase
    .from('scrape_attempts')
    .select('id')
    .limit(1);

  if (e2) {
    console.error('[FAIL] scrape_attempts:', e2.message);
    process.exit(1);
  }
  console.log('[OK]   scrape_attempts  — accessible');

  // Test insert + delete on tracked_products to verify write access and constraints
  const testRow = {
    product_id: '__test__',
    product_url: 'https://hire.ine.com/__test__',
    product_name: 'DB Connection Test Product',
    option_id: '__test_option__',
    option_name: 'Test Option',
    active: false,
  };

  const { data: inserted, error: e3 } = await supabase
    .from('tracked_products')
    .insert(testRow)
    .select('id')
    .single();

  if (e3) {
    console.error('[FAIL] Insert test failed:', e3.message);
    process.exit(1);
  }
  console.log('[OK]   Insert to tracked_products succeeded — id:', inserted.id);

  // Clean up test row
  const { error: e4 } = await supabase
    .from('tracked_products')
    .delete()
    .eq('id', inserted.id);

  if (e4) {
    console.error('[WARN] Cleanup failed (manual cleanup needed):', e4.message);
  } else {
    console.log('[OK]   Test row deleted — schema clean');
  }

  console.log('\n[PASS] All checks passed. Supabase is connected and schema is correct.');
}

run().catch((err) => {
  console.error('[FAIL] Unexpected error:', err.message);
  process.exit(1);
});
