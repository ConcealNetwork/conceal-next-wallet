"use client";

import { useDisplayTicker } from "@/lib/ui/ticker-preference-provider";
import { cn } from "@/lib/utils";

/** Renders a formatted amount string with the active ticker in the brand orange. */
export function CcxAmount({
  children,
  className,
}: {
  children: string | number;
  className?: string;
}) {
  const ticker = useDisplayTicker();
  const parts = String(children).split(new RegExp(`(${escapeRegExp(ticker)})`, "g"));

  return (
    <>
      {parts.map((part, index) =>
        part === ticker ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: deterministic string split with stable order and no insertion/removal, so the index is a safe key
          <span key={index} className={cn("text-primary", className)}>
            {ticker}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
