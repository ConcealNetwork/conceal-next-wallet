// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
 * Envelope open/verify/save (Group 2): typed parse on ciphertext, oversize fail-closed,
 * post-persist Envelope 3. No live-daemon; Argon2 runs in-process (~50–100 ms).
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

/** Extract one `async name(...) { ... }` body from wallet.service.ts source. */
function methodBody(src: string, name: string): string {
  const start = src.indexOf(`async ${name}(`);
  expect(start, `missing async ${name}`).toBeGreaterThanOrEqual(0);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(brace, i + 1);
    }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

/** Legacy Envelope 2 ciphertext (pad/clamp KDF) for oversize-password open tests. */
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

describe("envelope open — no JSON.parse on ciphertext", () => {
  const serviceSrc = readFileSync(
    join(process.cwd(), "lib/services/real-sdk/wallet.service.ts"),
    "utf8",
  );

  it("verifyPassword uses parseEncryptedWalletJson, not JSON.parse", () => {
    const body = methodBody(serviceSrc, "verifyPassword");
    expect(body).toMatch(/parseEncryptedWalletJson/);
    expect(body).not.toMatch(/JSON\.parse/);
  });

  it("file import uses parseEncryptedWalletJson, not JSON.parse", () => {
    const body = methodBody(serviceSrc, "importWallet");
    // File arm must size-gate via typed parse; index JSON.parse elsewhere is OK.
    expect(body).toMatch(/parseEncryptedWalletJson/);
    expect(body).not.toMatch(/JSON\.parse/);
  });

  it("changePassword verify uses typed parse/open (lock-free, not JSON.parse)", () => {
    const body = methodBody(serviceSrc, "changePassword");
    expect(body).toMatch(/parseEncryptedWalletJson/);
    expect(body).toMatch(/openEncryptedWallet/);
    expect(body).not.toMatch(/JSON\.parse/);
    // Must not call verifyPassword — that helper may take the Argon2 mutex.
    expect(body).not.toMatch(/this\.verifyPassword|verifyPassword\(/);
  });
});

describe("envelope open — parse gate fails closed", () => {
  it("parseEncryptedWalletJson rejects oversize text (size gate)", async () => {
    const { MAX_ENVELOPE_JSON_CHARS, parseEncryptedWalletJson } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    // Allocate MAX+1 once — Latin1 one-byte packing keeps this ~32 MiB, not 64.
    const oversize = "x".repeat(MAX_ENVELOPE_JSON_CHARS + 1);
    expect(parseEncryptedWalletJson(oversize)).toBeNull();
  });

  it("verifyPassword returns false when typed parse rejects; storage unchanged", async () => {
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    // Non-object JSON — parseEncryptedWalletJson returns null (fail closed).
    const rejected = "[1,2,3]";
    const storage = getSdkWalletStorage();
    await storage.setItem("wallet", rejected);
    const before = await storage.getItem("wallet");

    await expect(realSdkWalletService.verifyPassword("any")).resolves.toBe(false);
    expect(await storage.getItem("wallet")).toBe(before);
  });

  it("file import rejects parse-gate failure with a user-safe error; no adopt", async () => {
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    const storage = getSdkWalletStorage();
    expect(await storage.getItem("wallet")).toBeNull();

    await expect(
      realSdkWalletService.importWallet({
        method: "file",
        file: "\uFEFF[1,2,3]  ",
        password: "pw",
        newPassword: "LocalPass-Strong1!",
      }),
    ).rejects.toThrow(/not valid JSON|Invalid wallet file|Couldn't import/i);

    expect(await storage.getItem("wallet")).toBeNull();
  });
});

describe("envelope open — post-persist Envelope 3", () => {
  it("persist writes a blob that reopens as envelope: 3", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson, saveEncryptedWallet } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const { persist } = await import("@/lib/services/real-sdk/persistence");

    const account = createAccount("english");
    const password = "persist-pw";
    const storage = getSdkWalletStorage();
    // Seed so adopt/unlock paths are not required — install runtime + persist.
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
    expect(opened).not.toBeNull();
    expect(opened?.envelope).toBe(3);

    // Sanity: saveEncryptedWallet shape matches.
    const direct = saveEncryptedWallet(rawFor(account), password);
    expect(direct.envelope).toBe(3);
  });
});

describe("envelope open — BOM + trim on file text", () => {
  it("file import accepts a BOM-prefixed valid backup", async () => {
    const { saveEncryptedWallet } = await import("@/lib/services/real-sdk/envelope");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    const account = createAccount("english");
    const password = "file-pw";
    const backup = `\uFEFF${JSON.stringify(saveEncryptedWallet(rawFor(account), password))}  `;

    // Wrong password still fails after BOM strip (proves parse reached open).
    await expect(
      realSdkWalletService.importWallet({
        method: "file",
        file: backup,
        password: "wrong",
        newPassword: "LocalPass-Strong1!",
      }),
    ).rejects.toThrow(/Invalid wallet file or password/i);
  });
});

describe("envelope open — legacy oversize backup password (decrypt only)", () => {
  it("openEncryptedWallet decrypts Envelope 2 with oversize password via pad/clamp", async () => {
    const { openEncryptedWallet, parseEncryptedWalletJson } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const account = createAccount("english");
    const base = "x".repeat(32);
    const oversize = `${base}${"y".repeat(1200)}`;
    expect(new TextEncoder().encode(oversize).length).toBeGreaterThan(1024);

    const text = legacyEnv2(rawFor(account), base);
    const sourceCopy = text;
    const parsed = parseEncryptedWalletJson(text);
    expect(parsed).not.toBeNull();
    if (parsed === null) throw new Error("unreachable");
    const opened = openEncryptedWallet(parsed as EncryptedWalletEnvelope, oversize);
    expect(opened).not.toBeNull();
    expect(opened?.envelope).toBe(2);
    expect(text).toBe(sourceCopy);
  });
});
