// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from "vitest";
import { messageSendBlock } from "@/lib/ui/message-send-plan";
import { walletCopy } from "@/lib/ui/wallet-copy";

describe("messageSendBlock", () => {
  it("blocks a message while the wallet is syncing, like the send button", () => {
    expect(messageSendBlock({ viewOnly: false, isSyncing: true })).toBe(
      walletCopy.messageSyncingDisabled,
    );
  });

  it("names view-only first when both apply", () => {
    expect(messageSendBlock({ viewOnly: true, isSyncing: true })).toBe(
      walletCopy.viewOnlyMessageDisabled,
    );
  });

  it("allows a message when the wallet is synced and can spend", () => {
    expect(messageSendBlock({ viewOnly: false, isSyncing: false })).toBeUndefined();
  });
});
