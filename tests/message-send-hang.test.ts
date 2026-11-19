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

async function install(
  fee: () => Promise<string>,
  height: () => Promise<number> = () => Promise.resolve(10),
) {
  await init();
  const alice = createAccount("english");
  const bob = createAccount("english");
  const sendRawTransaction = vi.fn(() => Promise.resolve({ status: "OK" }));
  const getNodeFeeAddress = vi.fn(fee);
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
      getHeight: height,
      getNodeFeeAddress,
      sendRawTransaction,
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: () => Promise.resolve([]),
      getTransactionsPool: () => Promise.resolve([]),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub
    } as any,
    password: "pw",
    viewOnly: false,
    storage: {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
      keys: () => Promise.resolve([]),
    },
  });
  const rt = runtimeMod.getRuntime();
  if (!rt) throw new Error("runtime missing");
  return { bob, rt, sendRawTransaction, getNodeFeeAddress };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  const { getRuntime } = await import("@/lib/services/real-sdk/runtime");
  const { clearIntents } = await import("@/lib/services/real-sdk/send-intent");
  const rt = getRuntime();
  if (rt) clearIntents(rt);
});

describe("sendMessage hang window", () => {
  it("parks an auto intent when the tab is offline and does not call the node", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { bob, rt, sendRawTransaction, getNodeFeeAddress } = await install(() =>
      Promise.resolve(""),
    );
    const { realSdkMessageService } = await import("@/lib/services/real-sdk/message.service");
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    const sent = await realSdkMessageService.sendMessage({
      recipientAddress: bob.address,
      body: "offline",
    });

    expect(sent.queued).toBe("auto");
    expect(listIntents(rt)).toHaveLength(1);
    expect(listIntents(rt)[0]?.state).toBe("auto");
    expect(listIntents(rt)[0]?.kind).toBe("message");
    expect(getNodeFeeAddress).not.toHaveBeenCalled();
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("parks an auto intent when the fee call times out before a hash exists", async () => {
    const { bob, rt, sendRawTransaction } = await install(() =>
      Promise.reject(new Error("Daemon request timed out after 10000ms")),
    );
    const { realSdkMessageService } = await import("@/lib/services/real-sdk/message.service");
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    const sent = await realSdkMessageService.sendMessage({
      recipientAddress: bob.address,
      body: "fee timed out",
    });

    expect(sent.queued).toBe("auto");
    expect(listIntents(rt)[0]?.state).toBe("auto");
    expect(listIntents(rt)[0]?.watchedHash).toBeUndefined();
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("parks an auto intent when the fee call never returns and a late fee does not submit", async () => {
    const waiters: Array<(fee: string) => void> = [];
    const { bob, rt, sendRawTransaction } = await install(
      () =>
        new Promise((resolve) => {
          waiters.push(resolve);
        }),
      () => new Promise(() => {}),
    );
    const { connectHangMs, probeHangMs } = await import("@/lib/services/real-sdk/spend");
    const { realSdkMessageService } = await import("@/lib/services/real-sdk/message.service");
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    vi.useFakeTimers();
    const pending = realSdkMessageService.sendMessage({
      recipientAddress: bob.address,
      body: "still offline",
    });
    await vi.advanceTimersByTimeAsync(connectHangMs + probeHangMs);
    const sent = await pending;

    expect(sent.queued).toBe("auto");
    expect(listIntents(rt)).toHaveLength(1);
    expect(sendRawTransaction).not.toHaveBeenCalled();

    for (const release of waiters) release("");
    await vi.advanceTimersByTimeAsync(0);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(listIntents(rt)).toHaveLength(1);
  });
});
