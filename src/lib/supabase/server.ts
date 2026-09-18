import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Request-scoped client that carries the signed-in user's session, so reads go
 * through RLS. Used by the dashboard's own /api/metrics routes and by pages.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; middleware refreshes instead.
        }
      },
    },
  });
}
