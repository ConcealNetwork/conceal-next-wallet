// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// @vitest-environment node
import {
  createAccount,
  type EncryptedWalletEnvelope,
  openEncryptedWallet,
} from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEIGHT_AT_VERSION } from "@/lib/config/height-at-version";
import type { ImportWalletInput } from "@/lib/services/wallet.service";

/**
 * Creation-height fallback (wallet create): the daemon tip is used when
 * `getheight` answers; otherwise the pinned release height — never 0 (genesis scan).
 * The import path is unchanged: its default height is the daemon tip, else 0.
 * The SDK daemon client reads `globalThis.fetch` at construction, so stubbing
 * fetch drives `getHeight` through the real wiring.
 */

const LOCAL_PW = "LocalPass-Strong1!";
const DAEMON_TIP = 2_100_000;

function daemonAnswers(height: number) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ height, status: "OK" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function daemonDown() {
  return vi.fn(() => Promise.reject(new TypeError("fetch failed")));
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
afterEach(async () => {
  vi.unstubAllGlobals();
  await reset();
});

/** Create a wallet end-to-end and return the creationHeight persisted in the blob. */
async function createdHeight(): Promise<number> {
  const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
  const { parseEncryptedWalletJson } = await import("@/lib/services/real-sdk/envelope");
  const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");

  await realSdkWalletService.prepareCreateWallet();
  await realSdkWalletService.finalizeCreateWallet({ password: LOCAL_PW });

  const stored = await getSdkWalletStorage().getItem("wallet");
  expect(stored).toBeTruthy();
  if (!stored) throw new Error("unreachable");
  const envelope = parseEncryptedWalletJson(stored);
  if (envelope === null) throw new Error("unreachable");
  const opened = openEncryptedWallet(envelope as EncryptedWalletEnvelope, LOCAL_PW);
  if (opened === null) throw new Error("unreachable");
  return opened.raw.creationHeight ?? -1;
}

describe("prepareCreateWallet creation height", () => {
  it("seeds the wallet at the daemon tip when getheight answers", async () => {
    vi.stubGlobal("fetch", daemonAnswers(DAEMON_TIP));
    expect(await createdHeight()).toBe(DAEMON_TIP);
  });

  it("falls back to the pinned release height when getheight rejects", async () => {
    vi.stubGlobal("fetch", daemonDown());
    expect(await createdHeight()).toBe(HEIGHT_AT_VERSION);
  });

  it("falls back to the pinned release height when getheight returns 0", async () => {
    vi.stubGlobal("fetch", daemonAnswers(0));
    expect(await createdHeight()).toBe(HEIGHT_AT_VERSION);
  });
});

describe("importWallet default scan height", () => {
  type MnemonicImport = Extract<ImportWalletInput, { method: "mnemonic" }>;

  async function importedHeight(extra: Partial<MnemonicImport> = {}): Promise<number> {
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const { getRuntime } = await import("@/lib/services/real-sdk/runtime");
    await realSdkWalletService.importWallet({
      method: "mnemonic",
      mnemonic: createAccount("english").mnemonic ?? "",
      password: LOCAL_PW,
      ...extra,
    });
    const rt = getRuntime();
    expect(rt).not.toBeNull();
    if (rt === null) throw new Error("unreachable");
    return rt.raw.creationHeight ?? -1;
  }

  it("defaults to the daemon tip when getheight answers", async () => {
    vi.stubGlobal("fetch", daemonAnswers(DAEMON_TIP));
    expect(await importedHeight()).toBe(DAEMON_TIP);
  });

  it("keeps an explicit scanHeight when getheight rejects", async () => {
    vi.stubGlobal("fetch", daemonDown());
    expect(await importedHeight({ scanHeight: 123456 })).toBe(123456);
  });
});
