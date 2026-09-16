// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from "vitest";
import { drainIntents } from "@/lib/services/real-sdk/intent-drain";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import {
  enqueueAuto,
  enqueueHung,
  listIntents,
  type SendIntent,
} from "@/lib/services/real-sdk/send-intent";
import { isWalletHeightSyncing } from "@/lib/ui/wallet-sync";

type RebuildResult = "ok" | "decoy" | "submit" | "unfunded" | "skip" | { hung: string };

type DrainArgs = {
  scannedHeight: number;
  networkHeight: number;
  spendableAtomic: number;
  historyHashes: ReadonlySet<string>;
  isLive: () => boolean;
  rebuild: (intent: SendIntent) => Promise<RebuildResult>;
};

function fakeRuntime(): SdkRuntime {
  return {} as SdkRuntime;
}

function payInput(address: string, amount: number) {
  return { address, amount };
}

function syncPair(wantSyncing: boolean): { scannedHeight: number; networkHeight: number } {
  const networkHeight = 1_000;
  for (let scannedHeight = 0; scannedHeight <= networkHeight; scannedHeight++) {
    if (isWalletHeightSyncing(scannedHeight, networkHeight) === wantSyncing) {
      return { scannedHeight, networkHeight };
    }
  }
  throw new Error(wantSyncing ? "no catching-up height pair" : "no synced height pair");
}

function autoWait(): number {
  return enqueueAuto(fakeRuntime(), payInput("ccx7waitSample", 111_000), "decoy").waitTicks;
}

function hashTracker() {
  const hashes: string[] = [];
  let seq = 0;
  async function rebuild(intent: SendIntent): Promise<RebuildResult> {
    seq += 1;
    hashes.push(`hash-${intent.id}-${seq}`);
    return "decoy";
  }
  return { hashes, rebuild };
}

function drainArgs(
  heights: { scannedHeight: number; networkHeight: number },
  rebuild: (intent: SendIntent) => Promise<RebuildResult>,
  extra: Partial<DrainArgs> = {},
): DrainArgs {
  return {
    scannedHeight: heights.scannedHeight,
    networkHeight: heights.networkHeight,
    spendableAtomic: 50_000_000,
    historyHashes: new Set<string>(),
    isLive: () => true,
    rebuild,
    ...extra,
  };
}

async function tickDown(
  rt: SdkRuntime,
  args: DrainArgs,
  ticks: number,
  hashes: string[],
): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    const before = listIntents(rt)[0];
    if (!before) {
      throw new Error("intent missing before synced tick");
    }
    expect(before.waitTicks).toBeGreaterThan(0);
    const callsBefore = hashes.length;
    await drainIntents(rt, args);
    const after = listIntents(rt)[0];
    expect(after?.waitTicks).toBe(before.waitTicks - 1);
    expect(hashes).toHaveLength(callsBefore);
  }
}

describe("drainIntents", () => {
  it("does not rebuild or decrement waitTicks while catching up", async () => {
    const rt = fakeRuntime();
    const amount = 1_100_000;
    enqueueAuto(rt, payInput("ccx7catchAuto", amount), "decoy");
    const waitAfterEnqueue = listIntents(rt)[0]?.waitTicks;
    if (waitAfterEnqueue === undefined) {
      throw new Error("auto enqueue missing waitTicks");
    }

    const catching = syncPair(true);
    expect(isWalletHeightSyncing(catching.scannedHeight, catching.networkHeight)).toBe(true);

    const { hashes, rebuild } = hashTracker();
    await drainIntents(rt, drainArgs(catching, rebuild, { spendableAtomic: amount + 1 }));

    expect(hashes).toHaveLength(0);
    expect(listIntents(rt)[0]?.waitTicks).toBe(waitAfterEnqueue);
  });

  it("rebuilds after synced wait ticks with a new hash and restores wait", async () => {
    const rt = fakeRuntime();
    const amount = 2_200_000;
    const queued = enqueueAuto(rt, payInput("ccx7syncRebuild", amount), "decoy");
    const ticksLeft = listIntents(rt).find((row) => row.id === queued.id)?.waitTicks;
    if (ticksLeft === undefined) {
      throw new Error("auto enqueue missing waitTicks");
    }
    expect(ticksLeft).toBeGreaterThan(0);

    const synced = syncPair(false);
    expect(isWalletHeightSyncing(synced.scannedHeight, synced.networkHeight)).toBe(false);

    const { hashes, rebuild } = hashTracker();
    const args = drainArgs(synced, rebuild, { spendableAtomic: amount + 1 });
    const sampleWait = autoWait();

    await tickDown(rt, args, ticksLeft, hashes);
    expect(listIntents(rt)[0]?.waitTicks).toBe(0);
    expect(hashes).toHaveLength(0);

    await drainIntents(rt, args);
    expect(hashes).toHaveLength(1);
    expect(listIntents(rt)[0]?.waitTicks).toBe(sampleWait);

    await tickDown(rt, args, sampleWait, hashes);
    expect(listIntents(rt)[0]?.waitTicks).toBe(0);

    await drainIntents(rt, args);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(listIntents(rt)[0]?.waitTicks).toBe(sampleWait);
  });

  it("does not auto-rebuild a hung intent", async () => {
    const rt = fakeRuntime();
    const amount = 3_300_000;
    const queued = enqueueHung(rt, payInput("ccx7hungWatch", amount), "hash-hung-aa");
    const sampleWait = autoWait();

    const synced = syncPair(false);
    expect(isWalletHeightSyncing(synced.scannedHeight, synced.networkHeight)).toBe(false);

    const { hashes, rebuild } = hashTracker();
    const args = drainArgs(synced, rebuild, { spendableAtomic: amount + 1 });
    for (let i = 0; i < sampleWait * 3; i++) {
      await drainIntents(rt, args);
    }

    expect(hashes).toHaveLength(0);
    expect(listIntents(rt).map((row) => row.id)).toContain(queued.id);
    expect(listIntents(rt)[0]?.sent).not.toBe(true);
  });

  it("marks hung sent when watchedHash is in history", async () => {
    const rt = fakeRuntime();
    const amount = 4_400_000;
    const queued = enqueueHung(rt, payInput("ccx7hungSeen", amount), "hash-seen-aa");
    const watchedHash = queued.watchedHash;
    if (!watchedHash) {
      throw new Error("hung enqueue missing watchedHash");
    }

    const synced = syncPair(false);
    expect(isWalletHeightSyncing(synced.scannedHeight, synced.networkHeight)).toBe(false);

    const { hashes, rebuild } = hashTracker();
    await drainIntents(
      rt,
      drainArgs(synced, rebuild, {
        spendableAtomic: amount + 1,
        historyHashes: new Set([watchedHash]),
      }),
    );

    expect(hashes).toHaveLength(0);
    expect(listIntents(rt).find((row) => row.id === queued.id)?.sent).toBe(true);
  });

  it("skips rebuild when isLive is false", async () => {
    const rt = fakeRuntime();
    const amount = 5_500_000;
    const queued = enqueueAuto(rt, payInput("ccx7deadLive", amount), "decoy");
    const ticksLeft = listIntents(rt).find((row) => row.id === queued.id)?.waitTicks;
    if (ticksLeft === undefined) {
      throw new Error("auto enqueue missing waitTicks");
    }

    const synced = syncPair(false);
    expect(isWalletHeightSyncing(synced.scannedHeight, synced.networkHeight)).toBe(false);

    const { hashes, rebuild } = hashTracker();
    let live = true;
    const args = drainArgs(synced, rebuild, {
      spendableAtomic: amount + 1,
      isLive: () => live,
    });

    await tickDown(rt, args, ticksLeft, hashes);
    expect(listIntents(rt)[0]?.waitTicks).toBe(0);
    expect(hashes).toHaveLength(0);

    live = false;
    await drainIntents(rt, args);
    expect(hashes).toHaveLength(0);
  });

  it("ticks a waiting auto when a sibling is due and skips both on catch-up", async () => {
    const rt = fakeRuntime();
    const amountA = 2_200_000;
    const amountB = 3_300_000;
    const queuedA = enqueueAuto(rt, payInput("ccx7dueSibling", amountA), "decoy");
    const ticksA = listIntents(rt).find((row) => row.id === queuedA.id)?.waitTicks;
    if (ticksA === undefined) {
      throw new Error("auto A missing waitTicks");
    }

    const synced = syncPair(false);
    expect(isWalletHeightSyncing(synced.scannedHeight, synced.networkHeight)).toBe(false);

    const rebuiltIds: string[] = [];
    const rebuild = async (intent: SendIntent): Promise<RebuildResult> => {
      rebuiltIds.push(intent.id);
      return "decoy";
    };
    const args = drainArgs(synced, rebuild, { spendableAtomic: amountA + amountB + 1 });

    await tickDown(rt, args, ticksA, rebuiltIds);
    expect(listIntents(rt).find((row) => row.id === queuedA.id)?.waitTicks).toBe(0);
    expect(rebuiltIds).toHaveLength(0);

    const queuedB = enqueueAuto(rt, payInput("ccx7waitSibling", amountB), "submit");
    const waitB = listIntents(rt).find((row) => row.id === queuedB.id)?.waitTicks;
    if (waitB === undefined) {
      throw new Error("auto B missing waitTicks");
    }
    expect(waitB).toBeGreaterThan(0);
    expect(queuedB.id).not.toBe(queuedA.id);

    const catching = syncPair(true);
    expect(isWalletHeightSyncing(catching.scannedHeight, catching.networkHeight)).toBe(true);
    const waitACatch = listIntents(rt).find((row) => row.id === queuedA.id)?.waitTicks;
    await drainIntents(
      rt,
      drainArgs(catching, rebuild, { spendableAtomic: amountA + amountB + 1 }),
    );
    expect(rebuiltIds).toHaveLength(0);
    expect(listIntents(rt).find((row) => row.id === queuedA.id)?.waitTicks).toBe(waitACatch);
    expect(listIntents(rt).find((row) => row.id === queuedB.id)?.waitTicks).toBe(waitB);

    await drainIntents(rt, args);
    expect(rebuiltIds).toEqual([queuedA.id]);
    expect(listIntents(rt).find((row) => row.id === queuedB.id)?.waitTicks).toBe(waitB - 1);
  });

  it("does not count a skip rebuild as a submit fail", async () => {
    const rt = fakeRuntime();
    const amount = 6_600_000;
    const queued = enqueueAuto(rt, payInput("ccx7skipLock", amount), "submit");
    const ticksLeft = listIntents(rt).find((row) => row.id === queued.id)?.waitTicks;
    if (ticksLeft === undefined) {
      throw new Error("auto enqueue missing waitTicks");
    }

    const synced = syncPair(false);
    expect(isWalletHeightSyncing(synced.scannedHeight, synced.networkHeight)).toBe(false);

    const { hashes, rebuild } = hashTracker();
    const args = drainArgs(synced, rebuild, { spendableAtomic: amount + 1 });
    await tickDown(rt, args, ticksLeft, hashes);
    expect(listIntents(rt)[0]?.waitTicks).toBe(0);

    const before = listIntents(rt).find((row) => row.id === queued.id);
    const failsBefore = before?.submitFails;
    const waitBefore = before?.waitTicks;
    if (failsBefore === undefined || waitBefore === undefined) {
      throw new Error("auto missing submitFails or waitTicks");
    }

    await drainIntents(
      rt,
      drainArgs(synced, async () => "skip", { spendableAtomic: amount + 1 }),
    );

    const after = listIntents(rt).find((row) => row.id === queued.id);
    expect(after?.id).toBe(queued.id);
    expect(after?.submitFails).toBe(failsBefore);
    expect(after?.waitTicks).toBe(waitBefore);
  });
});
