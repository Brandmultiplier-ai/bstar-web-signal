import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { google } from "googleapis";

import { env } from "@/lib/env";

/**
 * One service account backs both Google APIs. It needs Viewer on each GA4
 * property and to be added as a user on each Search Console property.
 */
function credentials() {
  return {
    client_email: env.googleServiceAccountEmail(),
    private_key: env.googleServiceAccountPrivateKey(),
  };
}

export function createGa4Client() {
  return new BetaAnalyticsDataClient({ credentials: credentials() });
}

export async function createSearchConsoleClient() {
  const auth = new google.auth.JWT({
    email: env.googleServiceAccountEmail(),
    key: env.googleServiceAccountPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  await auth.authorize();
  return google.searchconsole({ version: "v1", auth });
}
