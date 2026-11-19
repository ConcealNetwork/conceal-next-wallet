// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from "vitest";
import { type DrainArgs, drainIntents } from "@/lib/services/real-sdk/intent-drain";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import { enqueueAuto, listIntents } from "@/lib/services/real-sdk/send-intent";
import { isWalletHeightSyncing } from "@/lib/ui/wallet-sync";

function fakeRuntime(): SdkRuntime {
  return {} as SdkRuntime;
}

function syncedHeights(): { scannedHeight: number; networkHeight: number } {
  const networkHeight = 1_000;
  for (let scannedHeight = 0; scannedHeight <= networkHeight; scannedHeight++) {
    if (!isWalletHeightSyncing(scannedHeight, networkHeight)) {
      return { scannedHeight, networkHeight };
    }
  }
  throw new Error("no synced height pair");
}

describe("drainIntents re-entry", () => {
  it("rebuilds a due intent once when that rebuild syncs, then drops it", async () => {
    const rt = fakeRuntime();
    const queued = enqueueAuto(rt, { kind: "send", address: "ccx7reenter", amount: 1.1 }, "decoy");
    const ticksLeft = listIntents(rt)[0]?.waitTicks;
    if (ticksLeft === undefined) throw new Error("auto enqueue missing waitTicks");

    const heights = syncedHeights();
    const base: DrainArgs = {
      ...heights,
      historyHashes: new Set<string>(),
      isLive: () => true,
      rebuild: async () => "skip",
    };
    for (let i = 0; i < ticksLeft; i++) await drainIntents(rt, base);
    expect(listIntents(rt)[0]?.waitTicks).toBe(0);

    let calls = 0;
    const args: DrainArgs = {
      ...base,
      rebuild: async () => {
        calls += 1;
        if (calls === 1) await drainIntents(rt, args);
        return "ok";
      },
    };
    await drainIntents(rt, args);

    expect(calls).toBe(1);
    expect(listIntents(rt).map((row) => row.id)).not.toContain(queued.id);
  });
});
