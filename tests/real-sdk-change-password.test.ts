// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// @vitest-environment node
import {
  createAccount,
  createWalletState,
  type EncryptedWalletEnvelope,
  type RawWalletV1,
} from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Atomic changePassword: verify → explicit-password write → reopen from storage →
 * assign last; persistPaused queue + rollback / inconsistent-blob; best-effort
 * passkey clear after assign. @see openspec/.../wallet-change-password/spec.md
 */

type Account = ReturnType<typeof createAccount>;

function userKeysOf(account: Account) {
  return {
    pub: { spend: account.keys.spend.pub, view: account.keys.view.pub },
    priv: { spend: account.keys.spend.sec, view: account.keys.view.sec },
  };
}

function rawFor(account: Account): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
    keys: userKeysOf(account),
    creationHeight: 0,
    options: {},
  };
}

function opensWith(
  blob: string | null,
  password: string,
  open: typeof import("@/lib/services/real-sdk/envelope").openEncryptedWallet,
  parse: typeof import("@/lib/services/real-sdk/envelope").parseEncryptedWalletJson,
): boolean {
  if (blob === null) return false;
  const env = parse(blob.replace(/^\uFEFF/, "").trim());
  if (env === null) return false;
  return open(env as EncryptedWalletEnvelope, password) !== null;
}

async function reset() {
  const storage = await import("@/lib/services/real-sdk/storage");
  const index = await import("@/lib/services/real-sdk/wallets-index");
  const runtime = await import("@/lib/services/real-sdk/runtime");
  runtime.lock();
  await index._clearWalletsIndex();
  const raw = storage.getSdkWalletStorage();
  for (const key of await raw.keys()) await raw.removeItem(key);
  storage._resetSdkWalletStorage();
  vi.restoreAllMocks();
}

beforeEach(reset);
afterEach(reset);

async function installWallet(current: string) {
  const { saveStoredWallet } = await import("@/lib/services/real-sdk/envelope");
  const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
  const runtime = await import("@/lib/services/real-sdk/runtime");

  const account = createAccount("english");
  const storage = getSdkWalletStorage();
  await saveStoredWallet(storage, rawFor(account), current);

  runtime._setRuntimeForTest({
    id: "default",
    account,
    raw: rawFor(account),
    state: createWalletState(account),
    // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub
    daemon: { nodeUrl: "" } as any,
    password: current,
    viewOnly: false,
    storage,
  });

  return { account, storage, runtime };
}

describe("atomic changePassword", () => {
  it("persist reject before verified write keeps old password, disk, and drain-old", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { persistRuntime } = await import("@/lib/services/real-sdk/persistence");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const { coordinationFor } = await import("@/lib/services/real-sdk/runtime-registry");

    const current = "old-password-1";
    const next = "new-password-1";
    const { storage, runtime } = await installWallet(current);
    expect(await storage.getItem("wallet")).not.toBeNull();

    const realSet = storage.setItem.bind(storage);
    let rejectOnce = true;
    let changeEntered = false;
    let queued: Promise<void> | null = null;
    storage.setItem = async (key, value) => {
      // Queue a checkpoint once changePassword's write is attempted (pause held).
      if (!changeEntered) {
        changeEntered = true;
        queued = persistRuntime(runtime.requireRuntime());
      }
      if (rejectOnce) {
        rejectOnce = false;
        throw new Error("simulated write reject");
      }
      return realSet(key, value);
    };

    await expect(
      realSdkWalletService.changePassword({ currentPassword: current, newPassword: next }),
    ).rejects.toThrow(/simulated write reject/i);

    expect(runtime.requireRuntime().password).toBe(current);
    expect(
      opensWith(
        await storage.getItem("wallet"),
        current,
        openEncryptedWallet,
        parseEncryptedWalletJson,
      ),
    ).toBe(true);
    expect(
      opensWith(
        await storage.getItem("wallet"),
        next,
        openEncryptedWallet,
        parseEncryptedWalletJson,
      ),
    ).toBe(false);

    // Drain must run only after locks release, with both disk + rt still old.
    expect(coordinationFor("default").persistPaused).toBe(false);
    expect(queued).not.toBeNull();
    await queued;
    expect(runtime.requireRuntime().password).toBe(current);
    expect(
      opensWith(
        await storage.getItem("wallet"),
        current,
        openEncryptedWallet,
        parseEncryptedWalletJson,
      ),
    ).toBe(true);
  });

  it("persist success opens disk with new password only and updates rt.password", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    const current = "old-password-2";
    const next = "new-password-2";
    const { storage, runtime } = await installWallet(current);

    await expect(
      realSdkWalletService.changePassword({ currentPassword: current, newPassword: next }),
    ).resolves.toEqual({ ok: true });

    expect(runtime.requireRuntime().password).toBe(next);
    const blob = await storage.getItem("wallet");
    expect(opensWith(blob, next, openEncryptedWallet, parseEncryptedWalletJson)).toBe(true);
    expect(opensWith(blob, current, openEncryptedWallet, parseEncryptedWalletJson)).toBe(false);
  });

  it("checkpoint during change does not commit with new password before assign", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { persistRuntime } = await import("@/lib/services/real-sdk/persistence");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const { coordinationFor } = await import("@/lib/services/real-sdk/runtime-registry");

    const current = "old-password-3";
    const next = "new-password-3";
    const { storage, runtime } = await installWallet(current);

    const realSet = storage.setItem.bind(storage);
    const writeHold: { release: (() => void) | null } = { release: null };
    let changeWriteStarted = false;
    storage.setItem = async (key, value) => {
      if (!changeWriteStarted) {
        changeWriteStarted = true;
        await new Promise<void>((resolve) => {
          writeHold.release = resolve;
        });
      }
      return realSet(key, value);
    };

    const changePromise = realSdkWalletService.changePassword({
      currentPassword: current,
      newPassword: next,
    });

    // Wait until changePassword has begun its explicit write (pause held).
    await vi.waitFor(() => {
      expect(changeWriteStarted).toBe(true);
      expect(coordinationFor("default").persistPaused).toBe(true);
    });

    // Password must still be old until reopen verifies — checkpoint must queue.
    expect(runtime.requireRuntime().password).toBe(current);
    const midBlob = await storage.getItem("wallet");
    expect(opensWith(midBlob, current, openEncryptedWallet, parseEncryptedWalletJson)).toBe(true);
    expect(opensWith(midBlob, next, openEncryptedWallet, parseEncryptedWalletJson)).toBe(false);

    const queued = persistRuntime(runtime.requireRuntime());
    // Queued work must not have written yet while paused.
    expect(
      opensWith(
        await storage.getItem("wallet"),
        next,
        openEncryptedWallet,
        parseEncryptedWalletJson,
      ),
    ).toBe(false);

    writeHold.release?.();
    await expect(changePromise).resolves.toEqual({ ok: true });
    await queued;

    expect(runtime.requireRuntime().password).toBe(next);
    expect(
      opensWith(
        await storage.getItem("wallet"),
        next,
        openEncryptedWallet,
        parseEncryptedWalletJson,
      ),
    ).toBe(true);
  });

  it("setItem then reopen-fail rolls back; hard inconsistent discards queue (no drain-old assert)", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson, saveEncryptedWallet } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { persistRuntime } = await import("@/lib/services/real-sdk/persistence");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const { coordinationFor } = await import("@/lib/services/real-sdk/runtime-registry");

    const current = "old-password-4";
    const next = "new-password-4";
    const { storage, runtime, account } = await installWallet(current);

    const realSet = storage.setItem.bind(storage);
    let mode: "corrupt" | "rollback-fail" = "corrupt";
    let setItemCalls = 0;
    storage.setItem = async (key, _value) => {
      setItemCalls += 1;
      if (mode === "corrupt") {
        // Queue while pause is held (first write of changePassword).
        expect(coordinationFor("default").persistPaused).toBe(true);
        void persistRuntime(runtime.requireRuntime()).catch(() => {
          /* discarded on hard inconsistent */
        });
        // Write a blob that looks stored but cannot reopen with newPassword.
        await realSet(key, JSON.stringify(saveEncryptedWallet(rawFor(account), current)));
        mode = "rollback-fail";
        return;
      }
      // Rollback write also fails → hard inconsistent-blob.
      throw new Error("rollback write failed");
    };

    await expect(
      realSdkWalletService.changePassword({ currentPassword: current, newPassword: next }),
    ).rejects.toThrow(/inconsistent/i);

    expect(runtime.requireRuntime().password).toBe(current);
    expect(coordinationFor("default").persistPaused).toBe(false);
    expect(coordinationFor("default").pausedQueue).toHaveLength(0);
    // Corrupt write + failed rollback attempt only — no drain write (no drain-old assert).
    expect(setItemCalls).toBe(2);

    // Disk may still be the pre-change (or corrupt) blob — never blind-persisted old.
    const blob = await storage.getItem("wallet");
    expect(opensWith(blob, next, openEncryptedWallet, parseEncryptedWalletJson)).toBe(false);
  });

  it("failed rollback keeps pause until mutex drops; concurrent persist never blind-writes old", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson, saveEncryptedWallet } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { persistRuntime } = await import("@/lib/services/real-sdk/persistence");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const { coordinationFor } = await import("@/lib/services/real-sdk/runtime-registry");

    const current = "old-password-4c";
    const next = "new-password-4c";
    const { storage, runtime, account } = await installWallet(current);

    const realSet = storage.setItem.bind(storage);
    let mode: "corrupt" | "rollback-fail" = "corrupt";
    let setItemCalls = 0;
    storage.setItem = async (key, _value) => {
      setItemCalls += 1;
      if (mode === "corrupt") {
        expect(coordinationFor("default").persistPaused).toBe(true);
        void persistRuntime(runtime.requireRuntime()).catch(() => {
          /* discarded on hard inconsistent */
        });
        await realSet(key, JSON.stringify(saveEncryptedWallet(rawFor(account), current)));
        mode = "rollback-fail";
        return;
      }
      throw new Error("rollback write failed");
    };

    // Hook the discard splice. Defer the concurrent persist until after
    // discardPaused returns (still inside the Argon2 mutex catch) so we observe
    // whether pause was cleared too early — the blind old-password write race.
    const coord = coordinationFor("default");
    let pauseAfterDiscard: boolean | undefined;
    let racedPersist: Promise<void> | undefined;
    let discardHooks = 0;
    const realSplice = coord.pausedQueue.splice.bind(coord.pausedQueue);
    coord.pausedQueue.splice = ((...args: Parameters<typeof realSplice>) => {
      const removed = realSplice(...args);
      if (mode === "rollback-fail" && discardHooks === 0) {
        discardHooks += 1;
        queueMicrotask(() => {
          pauseAfterDiscard = coord.persistPaused;
          racedPersist = persistRuntime(runtime.requireRuntime());
        });
      }
      return removed;
    }) as typeof coord.pausedQueue.splice;

    await expect(
      realSdkWalletService.changePassword({ currentPassword: current, newPassword: next }),
    ).rejects.toThrow(/inconsistent/i);

    // Allow the deferred race microtask to settle relative to mutex release.
    await Promise.resolve();
    await Promise.resolve();

    expect(pauseAfterDiscard).toBe(true);
    expect(runtime.requireRuntime().password).toBe(current);
    expect(coordinationFor("default").persistPaused).toBe(false);
    expect(coordinationFor("default").pausedQueue).toHaveLength(0);
    // Corrupt + failed rollback only — never a third blind old-password write.
    expect(setItemCalls).toBe(2);

    const blob = await storage.getItem("wallet");
    expect(opensWith(blob, next, openEncryptedWallet, parseEncryptedWalletJson)).toBe(false);
    // Raced persist must not have completed a write (discarded / never drained).
    expect(racedPersist).toBeDefined();
    if (racedPersist === undefined) throw new Error("unreachable");
    await expect(racedPersist).rejects.toThrow();
  });

  it("setItem then reopen-fail with successful rollback keeps old password", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson, saveEncryptedWallet } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    const current = "old-password-4b";
    const next = "new-password-4b";
    const { storage, runtime, account } = await installWallet(current);

    const realSet = storage.setItem.bind(storage);
    let writes = 0;
    storage.setItem = async (key, value) => {
      writes += 1;
      if (writes === 1) {
        // First write: pretend new password write landed but reopen will fail
        // because we store a blob only openable with current.
        await realSet(key, JSON.stringify(saveEncryptedWallet(rawFor(account), current)));
        return;
      }
      // Rollback: accept the real ciphertext (old password).
      return realSet(key, value);
    };

    await expect(
      realSdkWalletService.changePassword({ currentPassword: current, newPassword: next }),
    ).rejects.toThrow();

    expect(runtime.requireRuntime().password).toBe(current);
    expect(
      opensWith(
        await storage.getItem("wallet"),
        current,
        openEncryptedWallet,
        parseEncryptedWalletJson,
      ),
    ).toBe(true);
    expect(
      opensWith(
        await storage.getItem("wallet"),
        next,
        openEncryptedWallet,
        parseEncryptedWalletJson,
      ),
    ).toBe(false);
  });

  it("post-assign passkey-clear failure still reports success", async () => {
    const bio = await import("@/lib/auth/biometric-store");
    const unlock = await import("@/lib/auth/platform-unlock");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    const current = "old-password-5";
    const next = "new-password-5";
    const { runtime } = await installWallet(current);

    vi.spyOn(bio, "getPasskeyEnrollment").mockReturnValue({
      version: 2,
      address: "ccx1test",
      credentials: [
        {
          credentialId: "cred-1",
          label: "test",
          encrypted: { iv: "aa", ciphertext: "bb" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    vi.spyOn(bio, "clearPasskeyEnrollment").mockImplementation(() => {
      throw new Error("clear failed");
    });
    vi.spyOn(unlock, "signalUnlockRemoved").mockRejectedValue(new Error("signal failed"));

    await expect(
      realSdkWalletService.changePassword({ currentPassword: current, newPassword: next }),
    ).resolves.toEqual({ ok: true });

    expect(runtime.requireRuntime().password).toBe(next);
    expect(bio.clearPasskeyEnrollment).toHaveBeenCalled();
  });
});
