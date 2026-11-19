// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// Parity tests pinning sendTransaction's hang-window outcomes (issue #402).
// They pass against the inline sequence in transaction.service.ts AND after the
// migration onto raceLinkHang, so a drift in either direction fails here.

import {
  createAccount,
  createWalletState,
  crypto,
  init,
  type transactions as txns,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import {
  clearIntents,
  listIntents,
} from "@/lib/services/real-sdk/send-intent";
import {
  connectHangMs,
  lateGraceMs,
  probeHangMs,
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

type InstallOpts = {
  sendRawTransaction: (hex: string) => Promise<{ status: string }>;
  getRandomOuts?: (amounts: number[], count: number) => Promise<ReturnType<typeof decoyReply>>;
};

async function install(opts: InstallOpts) {
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
      getRandomOuts: opts.getRandomOuts ?? ((amounts: number[], count: number) =>
        Promise.resolve(decoyReply(amounts, count))),
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
  const { realSdkTransactionService } = await import(
    "@/lib/services/real-sdk/transaction.service"
  );
  return { alice, bob, rt, send: realSdkTransactionService.sendTransaction };
}

/** Past the hang window and the grace a live link gets. */
const pastWindow = connectHangMs + lateGraceMs + probeHangMs;

async function sendRow(rt: SdkRuntime) {
  return listIntents(rt).find((row) => row.kind === "send");
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  const { getRuntime, _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
  const rt = getRuntime();
  if (rt) clearIntents(rt);
  _setRuntimeForTest(null);
});

describe("sendTransaction hang-window parity (#402)", () => {
  it("link down at start: parks a queued-auto send intent without submitting", async () => {
    const sendRawTransaction = vi.fn(() => Promise.resolve({ status: "OK" }));
    const { bob, rt, send } = await install({ sendRawTransaction });
    vi.stubGlobal("navigator", { onLine: false });

    const tx = await send({ address: bob.address, amount: 0.5 });

    expect(tx.queued).toBe("auto");
    const row = await sendRow(rt);
    expect(row?.state).toBe("auto");
    expect(row?.payload).toEqual({ address: bob.address, amount: 0.5 });
    expect(row?.decoyFails).toBe(1);
    expect(row?.submitFails).toBe(0);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("body finishes in time: returns the sent transaction, leaves no intent row", async () => {
    const sendRawTransaction = vi.fn(() => Promise.resolve({ status: "OK" }));
    const { bob, rt, send } = await install({ sendRawTransaction });

    const tx = await send({ address: bob.address, amount: 0.5 });

    expect(tx.queued).toBeUndefined();
    expect(tx.hash).not.toBe("");
    expect(await sendRow(rt)).toBeUndefined();
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });

  it("late accept inside the grace: returns the sent transaction, leaves no intent row", async () => {
    const { sendRawTransaction, acceptLate } = lateSubmit();
    const { bob, rt, send } = await install({ sendRawTransaction });

    vi.useFakeTimers();
    const pending = send({ address: bob.address, amount: 0.5 });
    await vi.advanceTimersByTimeAsync(connectHangMs + probeHangMs + lateGraceMs / 2);
    acceptLate();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    const tx = await pending;
    expect(tx.queued).toBeUndefined();
    expect(tx.hash).not.toBe("");
    expect(await sendRow(rt)).toBeUndefined();
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });

  it("hung with a hash: parks hung on the built hash, and the killed gate never resubmits", async () => {
    const { sendRawTransaction, acceptLate } = lateSubmit();
    const { bob, rt, send } = await install({ sendRawTransaction });
    const { submitHung } = await import("@/lib/services/real-sdk/intent-drain");

    vi.useFakeTimers();
    const pending = send({ address: bob.address, amount: 0.5 });
    await vi.advanceTimersByTimeAsync(pastWindow);
    const tx = await pending;

    expect(tx.queued).toBe("hung");
    const row = await sendRow(rt);
    expect(row?.state).toBe("hung");
    expect(row?.watchedHash).not.toBe("");

    acceptLate();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    expect(sendRawTransaction).toHaveBeenCalledOnce();
    expect(await submitHung(rt, row?.id ?? "")).toBe(true);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });

  it("hung without a hash: parks a queued-auto send intent when the build hangs", async () => {
    const sendRawTransaction = vi.fn(() => Promise.resolve({ status: "OK" }));
    const { bob, rt, send } = await install({
      sendRawTransaction,
      getRandomOuts: () => new Promise(() => {}),
    });

    vi.useFakeTimers();
    const pending = send({ address: bob.address, amount: 0.5 });
    await vi.advanceTimersByTimeAsync(pastWindow);
    const tx = await pending;
    vi.useRealTimers();

    expect(tx.queued).toBe("auto");
    const row = await sendRow(rt);
    expect(row?.state).toBe("auto");
    expect(row?.decoyFails).toBe(1);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("abandoned after the gate is killed: keeps the parked row, never adds a second intent", async () => {
    // The body races a submit that never answers; the window kills the gate and
    // parks hung on the built hash. The late submit error then resolves the body
    // "abandoned" — it must not enqueue or change anything observable.
    const sendRawTransaction = vi.fn(() =>
      new Promise<{ status: string }>((_, reject) => {
        setTimeout(() => reject(new Error("daemon went away")), connectHangMs * 3);
      }),
    );
    const { bob, rt, send } = await install({ sendRawTransaction });

    vi.useFakeTimers();
    const pending = send({ address: bob.address, amount: 0.5 });
    await vi.advanceTimersByTimeAsync(pastWindow);
    const tx = await pending;
    expect(tx.queued).toBe("hung");
    expect((await sendRow(rt))?.state).toBe("hung");
    expect(listIntents(rt)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(connectHangMs * 3);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    expect((await sendRow(rt))?.state).toBe("hung");
    expect(listIntents(rt)).toHaveLength(1);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });

  it("submit rejected without a timeout: parks a queued-auto send intent on the submit cause", async () => {
    const sendRawTransaction = vi.fn(() => Promise.reject(new Error("Rejected: bad promise")));
    const { bob, rt, send } = await install({ sendRawTransaction });

    const tx = await send({ address: bob.address, amount: 0.5 });

    expect(tx.queued).toBe("auto");
    const row = await sendRow(rt);
    expect(row?.state).toBe("auto");
    expect(row?.submitFails).toBe(1);
    expect(row?.decoyFails).toBe(0);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });

  it("submit rejected with a timeout: parks a queued-hung send intent on the built hash", async () => {
    const sendRawTransaction = vi.fn(() =>
      Promise.reject(new Error("Daemon request timed out after 10000ms.")),
    );
    const { bob, rt, send } = await install({ sendRawTransaction });

    const tx = await send({ address: bob.address, amount: 0.5 });

    expect(tx.queued).toBe("hung");
    const row = await sendRow(rt);
    expect(row?.state).toBe("hung");
    expect(row?.watchedHash).toBe(tx.hash);
  });
});
