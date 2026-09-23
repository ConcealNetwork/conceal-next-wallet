// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// @vitest-environment node
import { secretbox } from "conceal-lib-js";
import {
  createAccount,
  createWalletState,
  type EncryptedWalletEnvelope,
  normalizeWalletPassword,
  type RawWalletV1,
} from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * New-local password UTF-8 cap (1024): save/change reject 1025 + multibyte overflow
 * with a distinct too-long error; storage unchanged. Legacy backup/file open with
 * oversize password still decrypts via pad/clamp — never pre-rejected.
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

function asciiPw(bytes: number): string {
  return "a".repeat(bytes);
}

/** Multibyte overflow: 342 × 'é' (2 bytes) = 684, plus ASCII pad to tip over 1024. */
function multibyteOverflowPw(): string {
  // 513 × U+00E9 (2 UTF-8 bytes each) = 1026 bytes.
  return "é".repeat(513);
}

function legacyEnv2(raw: RawWalletV1, password: string): string {
  const key = normalizeWalletPassword(password);
  const nonce = "AAAAAAAAAAAAAAAAAAAAAAAA";
  const cipher = secretbox(
    new TextEncoder().encode(JSON.stringify(raw)),
    new TextEncoder().encode(nonce),
    key,
  );
  return JSON.stringify({ data: Array.from(cipher), nonce });
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
}

beforeEach(reset);
afterEach(reset);

describe("envelope password — new local UTF-8 cap", () => {
  it("accepts a 1024-byte password on persist (Envelope 3)", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const { persist } = await import("@/lib/services/real-sdk/persistence");

    const account = createAccount("english");
    const password = asciiPw(1024);
    expect(new TextEncoder().encode(password).length).toBe(1024);
    const storage = getSdkWalletStorage();

    runtime._setRuntimeForTest({
      id: "default",
      account,
      raw: rawFor(account),
      state: createWalletState(account),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub
      daemon: { nodeUrl: "" } as any,
      password,
      viewOnly: false,
      storage,
    });

    await persist();
    const stored = await storage.getItem("wallet");
    expect(stored).not.toBeNull();
    if (stored === null) throw new Error("unreachable");
    const parsed = parseEncryptedWalletJson(stored);
    expect(parsed).not.toBeNull();
    if (parsed === null) throw new Error("unreachable");
    const opened = openEncryptedWallet(parsed as EncryptedWalletEnvelope, password);
    expect(opened?.envelope).toBe(3);
  });

  it("rejects 1025-byte password on changePassword; storage and rt.password unchanged", async () => {
    const { saveStoredWallet, openEncryptedWallet, parseEncryptedWalletJson } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    const account = createAccount("english");
    const current = "current-pw";
    const storage = getSdkWalletStorage();
    await saveStoredWallet(storage, rawFor(account), current);
    const before = await storage.getItem("wallet");

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

    const tooLong = asciiPw(1025);
    expect(new TextEncoder().encode(tooLong).length).toBe(1025);

    await expect(
      realSdkWalletService.changePassword({ currentPassword: current, newPassword: tooLong }),
    ).rejects.toThrow(/too long/i);

    expect(await storage.getItem("wallet")).toBe(before);
    expect(runtime.requireRuntime().password).toBe(current);
    expect(before).not.toBeNull();
    if (before === null) throw new Error("unreachable");
    const parsedBefore = parseEncryptedWalletJson(before);
    expect(parsedBefore).not.toBeNull();
    if (parsedBefore === null) throw new Error("unreachable");
    expect(openEncryptedWallet(parsedBefore as EncryptedWalletEnvelope, current)).not.toBeNull();
  });

  it("rejects multibyte overflow password on changePassword; storage unchanged", async () => {
    const { saveStoredWallet } = await import("@/lib/services/real-sdk/envelope");
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    const account = createAccount("english");
    const current = "current-pw";
    const storage = getSdkWalletStorage();
    await saveStoredWallet(storage, rawFor(account), current);
    const before = await storage.getItem("wallet");

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

    const tooLong = multibyteOverflowPw();
    expect(new TextEncoder().encode(tooLong).length).toBeGreaterThan(1024);

    await expect(
      realSdkWalletService.changePassword({ currentPassword: current, newPassword: tooLong }),
    ).rejects.toThrow(/too long/i);

    expect(await storage.getItem("wallet")).toBe(before);
    expect(runtime.requireRuntime().password).toBe(current);
  });

  it("rejects 1025-byte password on finalizeCreateWallet; storage stays empty", async () => {
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    await realSdkWalletService.prepareCreateWallet();
    const storage = getSdkWalletStorage();
    expect(await storage.getItem("wallet")).toBeNull();

    await expect(
      realSdkWalletService.finalizeCreateWallet({ password: asciiPw(1025) }),
    ).rejects.toThrow(/too long/i);

    expect(await storage.getItem("wallet")).toBeNull();
  });
});

describe("envelope password — oversize backup/file open allowed", () => {
  it("file import does not pre-reject oversize backup password before decrypt", async () => {
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    const account = createAccount("english");
    const base = "x".repeat(32);
    const backup = legacyEnv2(rawFor(account), base);
    const sourceCopy = backup;
    const storage = getSdkWalletStorage();

    // Oversize that does NOT clamp to the legacy key → decrypt fail, NOT too-long.
    await expect(
      realSdkWalletService.importWallet({
        method: "file",
        file: backup,
        password: `z${"y".repeat(1200)}`,
        newPassword: "LocalPass-Strong1!",
      }),
    ).rejects.toThrow(/Invalid wallet file or password/i);
    expect(backup).toBe(sourceCopy);
    expect(await storage.getItem("wallet")).toBeNull();
  });
});
