import { describe, expect, it } from "vitest";
import type { Deposit, Transaction, TransactionType } from "@/lib/types";
import { deriveInsights } from "@/lib/ui/wallet-insights";

function tx(type: TransactionType, atomic: number, timestamp: string): Transaction {
  return {
    id: `${type}-${timestamp}-${atomic}`,
    hash: "h",
    type,
    amount: { atomic },
    address: "ccx7…",
    timestamp,
    blockHeight: 1,
    confirmations: 10,
  };
}

function deposit(interestAtomic: number): Deposit {
  return {
    id: `d-${interestAtomic}`,
    txHash: "h",
    globalOutputIndex: 0,
    amount: { atomic: 1_000_000 },
    status: "active",
    durationMonths: 3,
    apr: 5,
    interest: { atomic: interestAtomic },
    unlocksInDays: 30,
    progressPct: 50,
    address: "ccx7…",
  };
}

describe("deriveInsights", () => {
  const txs: Transaction[] = [
    tx("receive", 500, "2026-01-10T00:00:00Z"),
    tx("miner", 100, "2026-01-20T00:00:00Z"),
    tx("send", 200, "2026-03-05T00:00:00Z"),
    tx("deposit", 1_000, "2026-03-06T00:00:00Z"),
    tx("withdrawal", 1_050, "2026-03-20T00:00:00Z"),
    tx("fusion", 9_999, "2026-03-21T00:00:00Z"), // neutral
    tx("message", 1, "2026-03-22T00:00:00Z"), // neutral
  ];
  const deposits: Deposit[] = [deposit(40), deposit(10)];

  it("sums received/sent/deposited and interest", () => {
    const i = deriveInsights(txs, deposits);
    expect(i.totalReceivedAtomic).toBe(600); // receive 500 + miner 100
    expect(i.totalSentAtomic).toBe(200);
    expect(i.netFlowAtomic).toBe(400);
    expect(i.depositedPrincipalAtomic).toBe(1_000);
    expect(i.interestEarnedAtomic).toBe(50);
    expect(i.txCount).toBe(7);
  });

  it("counts by type", () => {
    const i = deriveInsights(txs, deposits);
    expect(i.countByType.receive).toBe(1);
    expect(i.countByType.miner).toBe(1);
    expect(i.countByType.send).toBe(1);
    expect(i.countByType.fusion).toBe(1);
    expect(i.countByType.message).toBe(1);
  });

  it("buckets months contiguously, filling the gap (Feb has no activity)", () => {
    const i = deriveInsights(txs, deposits);
    expect(i.monthly.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(i.monthly[0]).toEqual({ month: "2026-01", inAtomic: 600, outAtomic: 0 });
    expect(i.monthly[1]).toEqual({ month: "2026-02", inAtomic: 0, outAtomic: 0 }); // gap filled
    expect(i.monthly[2]).toEqual({ month: "2026-03", inAtomic: 0, outAtomic: 200 });
  });

  it("builds a cumulative signed balance series in chronological order", () => {
    const i = deriveInsights(txs, deposits);
    // +500, +100, -200(send), -1000(deposit), +1050(withdrawal), 0(fusion), 0(message)
    expect(i.balanceSeries).toEqual([500, 600, 400, -600, 450, 450, 450]);
  });

  it("handles an empty wallet", () => {
    const i = deriveInsights([], []);
    expect(i).toMatchObject({ totalReceivedAtomic: 0, txCount: 0, monthly: [], balanceSeries: [] });
  });
});
