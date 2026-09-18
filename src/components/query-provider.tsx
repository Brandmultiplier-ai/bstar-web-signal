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
            // Data changes at most every 2 days, so aggressive refetching only
            // costs us round-trips to our own database.
            staleTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
