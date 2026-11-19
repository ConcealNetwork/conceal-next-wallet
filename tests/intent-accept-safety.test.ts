// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import {
  createAccount,
  createWalletState,
  crypto,
  init,
  type transactions as txns,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drainIntents } from "@/lib/services/real-sdk/intent-drain";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import {
  cancelIntent,
  enqueueAuto,
  listIntents,
  type WalletIntent,
} from "@/lib/services/real-sdk/send-intent";
import {
  connectHangMs,
  lateGraceMs,
  probeHangMs,
  raceLinkHang,
} from "@/lib/services/real-sdk/spend";

function fundOwnedOutput(
  owner: ReturnType<typeof createAccount>,
  amount: number,
): txns.SpendableOutput {
  const txKeys = crypto.generateKeys(crypto.randomSeed());
  const derivation = crypto.generateKeyDerivation(txKeys.pub, owner.keys.view.sec);
  const publicKey = crypto.derivePublicKey(derivation, 0, owner.keys.spend.pub);
  const ephemeralSecret = crypto.deriveSecretKey(derivation, 0, owner.keys.spend.sec);
  const keyImage = crypto.generateKeyImage(publicKey, ephemeralSecret);
  return {
    amount,
    globalIndex: 1000,
    outputIndex: 0,
    txPublicKey: txKeys.pub,
    publicKey,
    keyImage,
  };
}

function decoyReply(amounts: number[], count: number) {
  return amounts.map((amount) => ({
    amount,
    outs: Array.from({ length: count }, (_, i) => ({
      globalIndex: 3000 + i,
      publicKey: crypto.generateKeys(crypto.randomSeed()).pub,
    })),
  }));
}

/** First submit hangs until `acceptLate` runs; later submits answer OK at once. */
function lateSubmit() {
  let acceptLate: () => void = () => {};
  const first = new Promise<{ status: string }>((resolve) => {
    acceptLate = () => resolve({ status: "OK" });
  });
  const sendRawTransaction = vi.fn(() => Promise.resolve({ status: "OK" }));
  sendRawTransaction.mockImplementationOnce(() => first);
  return { sendRawTransaction, acceptLate: () => acceptLate() };
}

async function install(opts: {
  sendRawTransaction: (hex: string) => Promise<{ status: string }>;
  setItem?: () => Promise<void>;
}) {
  await init();
  const alice = createAccount("english");
  const bob = createAccount("english");
  const runtimeMod = await import("@/lib/services/real-sdk/runtime");
  runtimeMod._setRuntimeForTest({
    account: alice,
    raw: {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 10,
      nonce: "",
      options: {},
    },
    state: {
      ...createWalletState(alice),
      scannedHeight: 10,
      outputs: [fundOwnedOutput(alice, 5_000_000)],
    },
    daemon: {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(10),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: opts.sendRawTransaction,
      getRandomOuts: (amounts: number[], count: number) =>
        Promise.resolve(decoyReply(amounts, count)),
      getWalletSyncData: () => Promise.resolve([]),
      getTransactionsPool: () => Promise.resolve([]),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub
    } as any,
    password: "pw",
    viewOnly: false,
    storage: {
      getItem: () => Promise.resolve(null),
      setItem: opts.setItem ?? (() => Promise.resolve()),
      removeItem: () => Promise.resolve(),
      keys: () => Promise.resolve([]),
    },
  });
  const rt = runtimeMod.getRuntime();
  if (!rt) throw new Error("runtime missing");
  return { bob, rt, runtimeMod };
}

/** Past the hang window and the grace a live link gets. */
const pastWindow = connectHangMs + lateGraceMs + probeHangMs;

async function pendingHashes(rt: SdkRuntime): Promise<string[]> {
  const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");
  return readPendingRecords(rt.raw).map((record) => record.hash);
}

afterEach(async () => {
  vi.useRealTimers();
  const { getRuntime } = await import("@/lib/services/real-sdk/runtime");
  const { clearIntents } = await import("@/lib/services/real-sdk/send-intent");
  const rt = getRuntime();
  if (rt) clearIntents(rt);
});

describe("raceLinkHang", () => {
  function stubs(hash?: string) {
    const calls: string[] = [];
    return {
      calls,
      killGate: () => {
        calls.push("kill");
      },
      saved: () => undefined,
      parkAuto: () => {
        calls.push("auto");
        return "auto";
      },
      parkHung: () => {
        if (!hash) return undefined;
        calls.push("hung");
        return "hung";
      },
    };
  }

  it("returns the body when it finishes inside the grace, without killing the gate or leaving a timer", async () => {
    vi.useFakeTimers();
    const s = stubs("h1");
    const done = new Promise<string>((resolve) =>
      setTimeout(() => resolve("sent"), connectHangMs + 500),
    );
    const out = raceLinkHang({ done, daemon: { getHeight: () => Promise.resolve(1) }, ...s });
    await vi.advanceTimersByTimeAsync(connectHangMs + 500);

    expect(await out).toBe("sent");
    expect(s.calls).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills the gate and parks auto when the grace runs out before a hash exists", async () => {
    vi.useFakeTimers();
    const s = stubs();
    const out = raceLinkHang({
      done: new Promise<string>(() => {}),
      daemon: { getHeight: () => Promise.resolve(1) },
      ...s,
    });
    await vi.advanceTimersByTimeAsync(pastWindow);

    expect(await out).toBe("auto");
    expect(s.calls).toEqual(["kill", "auto"]);
  });

  it("kills the gate and parks hung when the link is gone and a hash exists", async () => {
    vi.useFakeTimers();
    const s = stubs("h1");
    const out = raceLinkHang({
      done: new Promise<string>(() => {}),
      daemon: { getHeight: () => new Promise<number>(() => {}) },
      ...s,
    });
    await vi.advanceTimersByTimeAsync(connectHangMs + probeHangMs);

    expect(await out).toBe("hung");
    expect(s.calls).toEqual(["kill", "hung"]);
  });
});

describe("a submit that hangs, then the node accepts late", () => {
  it("deposit: parks hung on the built hash, keeps the pending hold, and sync marks it sent", async () => {
    const { sendRawTransaction, acceptLate } = lateSubmit();
    const { rt, runtimeMod } = await install({ sendRawTransaction });
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");

    vi.useFakeTimers();
    const pending = realSdkDepositService.createDeposit({ amount: 1, durationMonths: 1 });
    await vi.advanceTimersByTimeAsync(pastWindow);
    const deposit = await pending;

    const rows = listIntents(rt);
    expect(deposit.queued).toBe("hung");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe("hung");
    const hash = rows[0]?.watchedHash ?? "";
    expect(hash).not.toBe("");

    acceptLate();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    expect(await pendingHashes(rt)).toContain(hash);
    expect(listIntents(rt)).toHaveLength(1);

    await runtimeMod.syncRuntime(rt);
    expect(listIntents(rt)[0]?.sent).toBe(true);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });

  it("message: Submit on the hung row does not send a second transaction", async () => {
    const { sendRawTransaction, acceptLate } = lateSubmit();
    const { bob, rt } = await install({ sendRawTransaction });
    const { realSdkMessageService } = await import("@/lib/services/real-sdk/message.service");
    const { submitHung } = await import("@/lib/services/real-sdk/intent-drain");

    vi.useFakeTimers();
    const pending = realSdkMessageService.sendMessage({
      recipientAddress: bob.address,
      body: "hi",
    });
    await vi.advanceTimersByTimeAsync(pastWindow);
    const sent = await pending;

    expect(sent.queued).toBe("hung");
    const row = listIntents(rt)[0];
    expect(row?.state).toBe("hung");

    acceptLate();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    expect(await pendingHashes(rt)).toContain(row?.watchedHash);
    expect(await submitHung(rt, row?.id ?? "")).toBe(true);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
    expect(listIntents(rt)).toHaveLength(1);
  });

  it("send: Submit on the hung row does not send a second transaction", async () => {
    const { sendRawTransaction, acceptLate } = lateSubmit();
    const { bob, rt } = await install({ sendRawTransaction });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { submitHung } = await import("@/lib/services/real-sdk/intent-drain");

    vi.useFakeTimers();
    const pending = realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: 0.5,
    });
    await vi.advanceTimersByTimeAsync(pastWindow);
    const tx = await pending;

    expect(tx.queued).toBe("hung");
    const row = listIntents(rt)[0];

    acceptLate();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    expect(await pendingHashes(rt)).toContain(row?.watchedHash);
    expect(await submitHung(rt, row?.id ?? "")).toBe(true);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });
});

describe("a relay accept whose local save is slow", () => {
  it("deposit: a false hung row is never sent again from Submit", async () => {
    const sendRawTransaction = vi.fn(() => Promise.resolve({ status: "OK" }));
    const saves: Array<() => void> = [];
    const { rt } = await install({
      sendRawTransaction,
      setItem: () =>
        new Promise<void>((resolve) => {
          saves.push(resolve);
        }),
    });
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const { submitHung } = await import("@/lib/services/real-sdk/intent-drain");

    vi.useFakeTimers();
    const pending = realSdkDepositService.createDeposit({ amount: 1, durationMonths: 1 });
    await vi.advanceTimersByTimeAsync(pastWindow);
    const deposit = await pending;
    vi.useRealTimers();

    const row = listIntents(rt)[0];
    expect(deposit.queued).toBe("hung");
    expect(row?.state).toBe("hung");
    expect(await pendingHashes(rt)).toContain(row?.watchedHash);
    expect(await submitHung(rt, row?.id ?? "")).toBe(true);
    expect(sendRawTransaction).toHaveBeenCalledOnce();

    for (const release of saves) release();
  });
});

describe("cancel during a drain", () => {
  it("does not rebuild a row the user cancelled while an earlier row was rebuilding", async () => {
    const rt = {} as SdkRuntime;
    const first = enqueueAuto(rt, { kind: "send", address: "ccx7first", amount: 1 }, "decoy");
    const second = enqueueAuto(rt, { kind: "send", address: "ccx7second", amount: 1 }, "decoy");
    const rebuilt: string[] = [];
    const rebuild = async (intent: WalletIntent) => {
      rebuilt.push(intent.id);
      if (intent.id === first.id) cancelIntent(rt, second.id);
      return "ok" as const;
    };
    const args = {
      scannedHeight: 1_000,
      networkHeight: 1_000,
      historyHashes: new Set<string>(),
      isLive: () => true,
      rebuild,
    };

    for (let i = 0; i <= first.waitTicks && rebuilt.length === 0; i++) {
      await drainIntents(rt, args);
    }

    expect(rebuilt).toEqual([first.id]);
    expect(listIntents(rt)).toEqual([]);
  });
});
