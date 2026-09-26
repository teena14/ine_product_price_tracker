import { createClient } from '@supabase/supabase-js';

let supabaseClient;

/**
 * Fails at process start (or first database use) without ever returning the
 * service-role key to callers. Keeping creation lazy lets HTTP-only unit tests
 * import the Express app without database credentials.
 */
export function validateSupabaseConfig() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing required Supabase server configuration.');
  }
}

/**
 * Backend-only Supabase client. The service role deliberately bypasses RLS;
 * public access is limited by the Express routes, not by direct DB access.
 * Never import this client into frontend code or expose its key in an API.
 */
export function getSupabaseClient() {
  validateSupabaseConfig();

  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  return supabaseClient;
}
