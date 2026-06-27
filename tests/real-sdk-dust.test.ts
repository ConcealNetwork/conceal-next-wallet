import {
  createAccount,
  createWalletState,
  DUST_THRESHOLD,
  type RawWalletV1,
} from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { mapWalletInfo } from "@/lib/services/real-sdk/mappers";

function ownedOutput(amount: number, keyImage: string) {
  return {
    amount,
    globalIndex: 1,
    outputIndex: 0,
    txPublicKey: "aa".repeat(32),
    publicKey: "bb".repeat(32),
    keyImage,
  };
}

describe("mapWalletInfo — dust", () => {
  it("sums sub-threshold unspent outputs and excludes them from available", () => {
    const alice = createAccount("english");
    const spendable = ownedOutput(1_000_000, "11".repeat(32));
    const dustA = ownedOutput(DUST_THRESHOLD - 1, "22".repeat(32));
    const dustB = ownedOutput(3, "33".repeat(32));
    const state = {
      ...createWalletState(alice),
      scannedHeight: 100,
      outputs: [spendable, dustA, dustB],
    };
    const runtime = {
      account: alice,
      raw: { options: {} } as RawWalletV1,
      state,
      viewOnly: false,
      password: "pw",
      // biome-ignore lint/suspicious/noExplicitAny: minimal runtime stub for a pure mapper
    } as any;

    const info = mapWalletInfo(runtime, 100);
    expect(info.dust.atomic).toBe(DUST_THRESHOLD - 1 + 3);
    expect(info.available.atomic).toBe(1_000_000);
    expect(info.balanceTotal.atomic).toBe(1_000_000 + DUST_THRESHOLD - 1 + 3);
  });

  it("reports zero dust when every unspent output is spendable", () => {
    const alice = createAccount("english");
    const state = {
      ...createWalletState(alice),
      scannedHeight: 50,
      outputs: [ownedOutput(500_000, "44".repeat(32))],
    };
    const runtime = {
      account: alice,
      raw: { options: {} } as RawWalletV1,
      state,
      viewOnly: false,
      password: "pw",
      // biome-ignore lint/suspicious/noExplicitAny: minimal runtime stub for a pure mapper
    } as any;

    const info = mapWalletInfo(runtime, 50);
    expect(info.dust.atomic).toBe(0);
    expect(info.available.atomic).toBe(500_000);
  });
});
