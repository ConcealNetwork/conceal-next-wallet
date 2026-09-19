"use client";

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

// Re-export only the hooks consumed through this module; QueryClient/QueryClientProvider are
// used internally here (and imported from @tanstack/react-query directly by tests).
export { useMutation, useQuery, useQueryClient };

export function WalletQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
          },
          // Offline sends must reach the service layer: it owns the retry-intent
          // queue. The default "online" mode parks a mutation until the browser
          // reports online, which strands Confirm Send and later broadcasts it.
          mutations: {
            networkMode: "always",
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
