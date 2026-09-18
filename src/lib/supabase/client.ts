"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createBrowserSupabase() {
  if (cached) return cached;

  const config = getSupabasePublicConfig();
  if (!config.ready) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.",
    );
  }

  cached = createBrowserClient<Database>(config.url, config.anonKey);
  return cached;
}
