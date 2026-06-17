"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { listSchedules } from "@/lib/storage/scheduled-payments-store";
import { countDue } from "@/lib/ui/scheduled-payments";

// Fire at most once per app load — a reminder, not a nag on every navigation.
let announced = false;

/**
 * On wallet open, surface a single toast if any recurring payment reminders are
 * due. It only reminds — nothing is ever sent automatically.
 */
export function useDuePaymentReminders(): void {
  useEffect(() => {
    if (announced) return;
    announced = true;
    const due = countDue(listSchedules(), new Date().toISOString());
    if (due > 0) {
      toast.info(
        `${due} scheduled payment${due === 1 ? " is" : "s are"} due. Open “Scheduled” to send.`,
      );
    }
  }, []);
}
