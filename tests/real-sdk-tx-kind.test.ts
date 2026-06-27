import type { WalletTransaction } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { mapTransaction } from "@/lib/services/real-sdk/mappers";

function walletTx(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    hash: "abc123",
    height: 100,
    amount: 1_000_000,
    direction: "in",
    ...overrides,
  };
}

describe("mapTransaction — SDK kind → UI type", () => {
  it("maps scan-time kinds 1:1", () => {
    const networkHeight = 105;
    for (const kind of ["miner", "deposit", "withdrawal", "fusion"] as const) {
      expect(mapTransaction(walletTx({ kind }), networkHeight).type).toBe(kind);
    }
  });

  it("falls back to direction when kind is absent (legacy blobs)", () => {
    expect(mapTransaction(walletTx({ direction: "out" }), 100).type).toBe("send");
    expect(mapTransaction(walletTx({ direction: "in" }), 100).type).toBe("receive");
  });

  it("prefers stored kind over direction", () => {
    expect(
      mapTransaction(walletTx({ kind: "fusion", direction: "in", amount: 1000 }), 100).type,
    ).toBe("fusion");
  });
});
