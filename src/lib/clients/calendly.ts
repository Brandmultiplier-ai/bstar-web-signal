import { env } from "@/lib/env";

const API_BASE = "https://api.calendly.com";

export type CalendlyEvent = {
  uri: string;
  name: string | null;
  status: string | null;
  start_time: string;
  end_time: string | null;
  created_at: string | null;
};

export type CalendlyInvitee = {
  uri: string;
  name: string | null;
  email: string | null;
  created_at: string | null;
  tracking: {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    utm_term: string | null;
  } | null;
};

async function callUrl<T>(href: string): Promise<T> {
  const response = await fetch(href, {
    headers: {
      Authorization: `Bearer ${env.calendlyApiToken()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Calendly ${href} returned ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

async function call<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return callUrl<T>(url.toString());
}

/** The token's owner, whose organization scopes the event listing. */
export async function fetchCurrentUser(): Promise<{ uri: string; current_organization: string }> {
  const { resource } = await call<{
    resource: { uri: string; current_organization: string };
  }>("/users/me");
  return resource;
}

/**
 * Walks Calendly pagination via `next_page` (a full URL). Passing
 * `page_token` as a query param is rejected as invalid.
 */
async function paginate<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const items: T[] = [];
  const first = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) {
    first.searchParams.set(key, value);
  }
  first.searchParams.set("count", "100");

  let nextUrl: string | null = first.toString();
  while (nextUrl) {
    const page: { collection: T[]; pagination: { next_page: string | null } } =
      await callUrl(nextUrl);
    items.push(...page.collection);
    nextUrl = page.pagination.next_page ?? null;
  }

  return items;
}

export async function fetchScheduledEvents(args: {
  organization: string;
  minStartTime: string;
  maxStartTime: string;
  status?: "active" | "canceled";
}): Promise<CalendlyEvent[]> {
  return paginate<CalendlyEvent>("/scheduled_events", {
    organization: args.organization,
    min_start_time: args.minStartTime,
    max_start_time: args.maxStartTime,
    ...(args.status ? { status: args.status } : {}),
  });
}

/**
 * UTM values live on the invitee, not the event, so each booking needs a
 * second call. Event URIs look like ".../scheduled_events/<uuid>".
 */
export async function fetchInvitees(eventUri: string): Promise<CalendlyInvitee[]> {
  const uuid = eventUri.split("/").pop()!;
  return paginate<CalendlyInvitee>(`/scheduled_events/${uuid}/invitees`, {});
}
