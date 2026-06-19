import { describe, expect, it } from "vitest";
import { syncAwareInterval } from "@/lib/hooks";
import type { WalletInfo } from "@/lib/types";

// #112: list/wallet queries poll on a sync-aware cadence so an open page reflects
// freshly-mined data. `syncAwareInterval` picks the fast interval while the scan is
// behind the tip and the slow one once caught up.
function infoAt(currentHeight: number, networkHeight: number): WalletInfo {
  return { currentHeight, networkHeight } as WalletInfo;
}

const FAST = 2500;
const SLOW = 20000;

describe("syncAwareInterval (#112 live-refresh cadence)", () => {
  it("uses the fast cadence while the scan is behind the tip", () => {
    expect(syncAwareInterval(infoAt(1000, 2000), [FAST, SLOW])).toBe(FAST);
  });

  it("uses the slow cadence once synced to the tip", () => {
    expect(syncAwareInterval(infoAt(2000, 2000), [FAST, SLOW])).toBe(SLOW);
  });

  it("treats within-two-blocks of the tip as synced (matches the banner threshold)", () => {
    // isWalletHeightSyncing only flags >2 blocks behind, so one block back is "synced".
    expect(syncAwareInterval(infoAt(1999, 2000), [FAST, SLOW])).toBe(SLOW);
  });

  it("uses the slow cadence when wallet info is not loaded yet", () => {
    expect(syncAwareInterval(undefined, [FAST, SLOW])).toBe(SLOW);
  });
});
