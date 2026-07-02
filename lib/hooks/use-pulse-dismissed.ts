"use client";

import { useEffect, useState } from "react";
import {
  dismissPulse,
  listDismissed,
  PULSE_DISMISS_RESET,
} from "@/lib/storage/pulse-dismiss-store";

/** Device-local dismissed pulse tx ids; refreshes after wallet re-scan. */
export function usePulseDismissed(): [ReadonlySet<string>, (messageId: string) => void] {
  const [dismissed, setDismissed] = useState(() => listDismissed());

  useEffect(() => {
    const refresh = () => setDismissed(listDismissed());
    window.addEventListener(PULSE_DISMISS_RESET, refresh);
    return () => window.removeEventListener(PULSE_DISMISS_RESET, refresh);
  }, []);

  return [
    dismissed,
    (messageId: string) => {
      setDismissed(dismissPulse(messageId));
    },
  ];
}
