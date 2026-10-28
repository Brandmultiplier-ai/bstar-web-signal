/**
 * Server-side environment access. Every getter throws on a missing value so a
 * misconfigured deploy fails inside a single ingest run rather than silently
 * writing empty rows.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  ingestSecret: () => required("INGEST_SECRET"),
  captureWebhookSecret: () => required("CAPTURE_WEBHOOK_SECRET"),
  googleServiceAccountEmail: () => required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  // Secret managers and .env files both tend to store the PEM with literal
  // backslash-n rather than real newlines; Google's JWT signer needs real ones.
  googleServiceAccountPrivateKey: () =>
    required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  clarityApiToken: () => required("CLARITY_API_TOKEN"),
  calendlyApiToken: () => required("CALENDLY_API_TOKEN"),
};
