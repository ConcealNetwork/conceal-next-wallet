// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { walletCopy } from "@/lib/ui/wallet-copy";

/**
 * Why a message cannot be sent right now, or undefined when it can. Same rule as
 * the send button: no new intent while the wallet is syncing.
 */
export function messageSendBlock(state: {
  viewOnly: boolean;
  isSyncing: boolean;
}): string | undefined {
  if (state.viewOnly) return walletCopy.viewOnlyMessageDisabled;
  if (state.isSyncing) return walletCopy.messageSyncingDisabled;
  return undefined;
}

/** How the messages screen treats a sendMessage result. */
export function planMessageSend(queued: "auto" | "hung" | undefined): "parked" | "sent" {
  return queued ? "parked" : "sent";
}

/** Compose dialog after sendMessage finishes, including when the result is only an intent. */
export function messageComposeDone(queued: "auto" | "hung" | undefined): {
  close: boolean;
  clearForm: boolean;
  openThread: boolean;
} {
  return {
    close: true,
    clearForm: true,
    openThread: planMessageSend(queued) === "sent",
  };
}
