import { env } from "@/lib/env";
import { handleRb2bWebhook, type Rb2bInsert, type Rb2bWriteResult } from "@/lib/rb2b-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function hostnameOf(pageUrl: string | null): string | null {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl).hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

async function resolveSiteId(capturedUrl: string | null): Promise<string | null> {
  const host = hostnameOf(capturedUrl);
  if (!host) return null;
  const bare = host.startsWith("www.") ? host.slice(4) : host;
  const { data, error } = await createAdminClient()
    .from("sites")
    .select("id, domain")
    .in("domain", [bare, `www.${bare}`]);
  if (error) {
    console.error("[rb2b] failed", error.code ?? "site");
    throw new Error("site");
  }
  const match = (data ?? []).find((site) => {
    const domain = site.domain.toLowerCase();
    return domain === bare || domain === `www.${bare}`;
  });
  return match?.id ?? null;
}

async function insertVisitor(row: Rb2bInsert): Promise<Rb2bWriteResult> {
  const { error } = await createAdminClient()
    .from("rb2b_visitors")
    .insert(row);
  if (!error) return "ok";
  if (error.code === "23505") return "duplicate";
  console.error("[rb2b] failed", error.code ?? "unknown");
  return "error";
}

/**
 * Middleware skips /api/webhooks. RB2B cannot set a custom header, so the
 * shared secret is also accepted as ?secret=. The request URL is never logged.
 */
export async function POST(request: Request) {
  return handleRb2bWebhook(request, {
    expectedSecret: () => env.rb2bWebhookSecret(),
    resolveSiteId,
    insertVisitor,
  });
}
