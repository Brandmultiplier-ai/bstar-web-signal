import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client for ingest routes. Bypasses RLS, so
 * it must never be imported from anything that runs in the browser.
 */
export function createAdminClient() {
  return createClient<Database>(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
