// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { createAccount, createWalletState, type RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { broadcast, formatRelayReject, relayAccepted } from "@/lib/services/real-sdk/spend";

const TX_HASH = "aa".repeat(32);
const TX_SECRET = "bb".repeat(32);

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 100,
    nonce: "",
    keys: {
      pub: { spend: "", view: "" },
      priv: { spend: "", view: "" },
    },
    creationHeight: 0,
    options: {},
  };
}

function fakeBuilt() {
  return {
    serialized: "deadbeef",
    hash: TX_HASH,
    txSecretKey: TX_SECRET,
  };
}

async function installBroadcastRuntime(
  sendRawTransaction: (hex: string) => Promise<{ status: string; reason?: string }>,
) {
  const alice = createAccount("english");
  const networkHeight = 100;
  const sendFn = vi.fn(sendRawTransaction);
  const store = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  });
  const storage = {
    getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
    setItem,
    removeItem: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...store.keys()]),
  };
  const fakeDaemon = {
    nodeUrl: "https://node.test/",
    getHeight: () => Promise.resolve(networkHeight),
    getNodeFeeAddress: () => Promise.resolve(""),
    sendRawTransaction: sendFn,
    getRandomOuts: () => Promise.resolve([]),
    getWalletSyncData: () => Promise.resolve([]),
    getTransactionsPool: () => Promise.resolve([]),
  };
  const runtimeMod = await import("@/lib/services/real-sdk/runtime");
  const raw = emptyRaw();
  raw.keys = {
    pub: { spend: alice.keys.spend.pub, view: alice.keys.view.pub },
    priv: { spend: alice.keys.spend.sec, view: alice.keys.view.sec },
  };
  runtimeMod._setRuntimeForTest({
    account: alice,
    raw,
    state: { ...createWalletState(alice), scannedHeight: networkHeight },
    // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
    daemon: fakeDaemon as any,
    password: "pw",
    viewOnly: false,
    storage,
  });
  const rt = runtimeMod.getRuntime();
  if (rt === null) throw new Error("runtime missing after install");
  return { rt, sendFn, setItem, runtimeMod };
}

afterEach(async () => {
  const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
  _setRuntimeForTest(null);
});

describe("relayAccepted", () => {
  it("accepts OK and Not relayed", () => {
    expect(relayAccepted("OK")).toBe(true);
    expect(relayAccepted("Not relayed")).toBe(true);
  });

  it("rejects Failed, Too big, and unknown statuses", () => {
    expect(relayAccepted("Failed")).toBe(false);
    expect(relayAccepted("Too big")).toBe(false);
    expect(relayAccepted("Busy")).toBe(false);
    expect(relayAccepted("fail")).toBe(false);
  });
});

describe("formatRelayReject", () => {
  it("includes the status in the reject text", () => {
    const text = formatRelayReject({ status: "Failed" });
    expect(text).toContain("Failed");
  });

  it("includes reason when present", () => {
    const text = formatRelayReject({ status: "Failed", reason: "double spend" });
    expect(text).toContain("Failed");
    expect(text).toContain("double spend");
  });
});

describe("broadcast status branch", () => {
  it("accepts OK and records the tx private key", async () => {
    const { rt, sendFn } = await installBroadcastRuntime(() => Promise.resolve({ status: "OK" }));
    await broadcast(rt, fakeBuilt() as never);
    expect(sendFn).toHaveBeenCalledWith("deadbeef");
    expect(rt.raw.txPrivateKeys?.[TX_HASH]).toBe(TX_SECRET);
  });

  it("accepts Not relayed on the same post-accept path as OK", async () => {
    const { rt } = await installBroadcastRuntime(() => Promise.resolve({ status: "Not relayed" }));
    await broadcast(rt, fakeBuilt() as never);
    expect(rt.raw.txPrivateKeys?.[TX_HASH]).toBe(TX_SECRET);
  });

  it("rejects Failed without post-accept side effects", async () => {
    const { rt, setItem } = await installBroadcastRuntime(() =>
      Promise.resolve({ status: "Failed" }),
    );
    const writesBefore = setItem.mock.calls.length;
    await expect(broadcast(rt, fakeBuilt() as never)).rejects.toThrow(/Failed/);
    expect(rt.raw.txPrivateKeys?.[TX_HASH]).toBeUndefined();
    expect(setItem.mock.calls.length).toBe(writesBefore);
  });

  it("rejects Too big without post-accept side effects", async () => {
    const { rt, setItem } = await installBroadcastRuntime(() =>
      Promise.resolve({ status: "Too big" }),
    );
    const writesBefore = setItem.mock.calls.length;
    await expect(broadcast(rt, fakeBuilt() as never)).rejects.toThrow(/Too big/);
    expect(rt.raw.txPrivateKeys?.[TX_HASH]).toBeUndefined();
    expect(setItem.mock.calls.length).toBe(writesBefore);
  });

  it("rejects unknown status without post-accept side effects", async () => {
    const { rt, setItem } = await installBroadcastRuntime(() =>
      Promise.resolve({ status: "Busy" }),
    );
    const writesBefore = setItem.mock.calls.length;
    await expect(broadcast(rt, fakeBuilt() as never)).rejects.toThrow(/Busy/);
    expect(rt.raw.txPrivateKeys?.[TX_HASH]).toBeUndefined();
    expect(setItem.mock.calls.length).toBe(writesBefore);
  });

  it("includes reason in the thrown reject text", async () => {
    const { rt } = await installBroadcastRuntime(() =>
      Promise.resolve({ status: "Failed", reason: "already spent" }),
    );
    await expect(broadcast(rt, fakeBuilt() as never)).rejects.toThrow(
      /Failed.*already spent|already spent.*Failed/,
    );
    expect(rt.raw.txPrivateKeys?.[TX_HASH]).toBeUndefined();
  });

  it("still fails when sendRawTransaction throws a transport error", async () => {
    const { rt, setItem } = await installBroadcastRuntime(() =>
      Promise.reject(new Error("network timeout")),
    );
    const writesBefore = setItem.mock.calls.length;
    const err = await broadcast(rt, fakeBuilt() as never).then(
      () => null,
      (error: unknown) => error,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Failed to broadcast the transaction/);
    expect((err as Error).message).toMatch(/network timeout/);
    expect(rt.raw.txPrivateKeys?.[TX_HASH]).toBeUndefined();
    expect(setItem.mock.calls.length).toBe(writesBefore);
  });
});
