"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Permanent redirect stub: the check-ins page was renamed to Pulse and now
 * lives at `/wallet/pulse`. The app is a static export (no server redirects),
 * so old deep links — bookmarks and previously-delivered OS notification URLs —
 * land here and are bounced client-side, preserving any query string.
 */
export default function CheckInsRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/wallet/pulse${query ? `?${query}` : ""}`);
  }, [router, searchParams]);

  return null;
}
