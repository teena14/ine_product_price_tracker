import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[config] WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
    'Database operations will fail. Set real values before Phase 1.'
  );
}

/**
 * Supabase client using the service role key.
 * This bypasses Row Level Security — appropriate for a backend-only service.
 * Never expose this client or key to the frontend.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
