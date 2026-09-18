/**
 * Public Supabase config, safe to read in middleware (Edge) and the browser.
 * Distinguishes "not set" from the placeholder values in `.env.example`,
 * because a filled-in-but-fake URL would still pass createClient's empty check
 * and then fail later with a less useful network error.
 */
export function getSupabasePublicConfig():
  | { ready: true; url: string; anonKey: string }
  | { ready: false } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey) return { ready: false };
  if (url.includes("your-project") || anonKey === "your-anon-key") return { ready: false };

  return { ready: true, url, anonKey };
}
