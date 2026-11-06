"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // One client per browser session, created lazily so it is never shared
  // across requests during SSR.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stored data changes at most daily, so a cached answer is shown
            // instantly and only re-read after 10 minutes. Cached reports stay
            // for an hour so going back to a tab does not wait again.
            staleTime: 10 * 60_000,
            gcTime: 60 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
