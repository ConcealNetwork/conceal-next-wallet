"use client";

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { useEffect, useState } from "react";
import { WalletQrCode } from "@/components/wallet/common";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { AddressEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOGO_ADDRESS = "/brand/conceal-mark-orange.svg";
const LOGO_PID = "/brand/conceal-mark.svg";
const FADE_MS = 200;

/** Expanded contact detail: address face (yellow C) fades to inbound payment ID (grey C). */
export function ContactExpandPanel({ entry }: { entry: AddressEntry }) {
  const { t } = useI18n();
  const [showPid, setShowPid] = useState(false);
  const [opaque, setOpaque] = useState(true);
  const canFlip = Boolean(entry.paymentId);

  useEffect(() => {
    if (opaque) return;
    const id = window.setTimeout(() => {
      setShowPid((prev) => !prev);
      setOpaque(true);
    }, FADE_MS);
    return () => window.clearTimeout(id);
  }, [opaque]);

  function flip() {
    if (!canFlip || !opaque) return;
    setOpaque(false);
  }

  const value = showPid && entry.paymentId ? entry.paymentId : entry.address;
  const logoSrc = showPid ? LOGO_PID : LOGO_ADDRESS;
  const hint = !canFlip
    ? undefined
    : showPid
      ? t("addressBook.flipHintAddress")
      : t("addressBook.flipHintPid");

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
      <p className="font-semibold text-foreground">{entry.label}</p>

      <button
        type="button"
        onClick={flip}
        disabled={!canFlip}
        aria-label={
          canFlip
            ? showPid
              ? t("addressBook.flipToAddress")
              : t("addressBook.flipToPid")
            : undefined
        }
        className={cn(
          "block w-full rounded-xl text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          canFlip ? "cursor-pointer" : "cursor-default",
        )}
      >
        <div
          className={cn(
            "flex flex-col items-center gap-3 transition-opacity ease-out motion-reduce:transition-none",
            opaque ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        >
          <p className="w-full break-all rounded-lg border border-border bg-card px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground">
            {value}
          </p>
          <WalletQrCode value={value} size={160} logoSrc={logoSrc} />
          {hint ? <p className="text-center text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
      </button>
    </div>
  );
}
