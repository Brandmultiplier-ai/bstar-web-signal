import type { createAdminClient } from "@/lib/supabase/admin";
import type { createServerSupabase } from "@/lib/supabase/server";

/**
 * Client types are derived from the factories rather than written out as
 * `SupabaseClient<Database, ...>`, whose generic arity changes between
 * supabase-js releases.
 */
export type AdminClient = ReturnType<typeof createAdminClient>;
export type ReaderClient = Awaited<ReturnType<typeof createServerSupabase>>;
