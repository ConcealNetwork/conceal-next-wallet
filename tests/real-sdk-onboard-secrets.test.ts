// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { secretbox } from "conceal-lib-js";
import {
  createAccount,
  type EncryptedWalletEnvelope,
  normalizeWalletPassword,
  type RawWalletV1,
  saveEncryptedWallet,
} from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Onboarding secrets (Group 3): create first blob Envelope 3, no temp password,
 * abort drops draft, omitMnemonic after abort/finalize, file import 1/2/3 under
 * newPassword without mutating source bytes.
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

/** Legacy Envelope 2 ciphertext (pad/clamp KDF). */
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

/** Legacy Envelope 1 (encryptedKeys array, pad/clamp KDF). */
function legacyEnv1(account: Account, password: string): string {
  const key = normalizeWalletPassword(password);
  const nonce = "AAAAAAAAAAAAAAAAAAAAAAAA";
  const keysStr = account.keys.view.sec + account.keys.spend.sec;
  const cipher = secretbox(new TextEncoder().encode(keysStr), new TextEncoder().encode(nonce), key);
  return JSON.stringify({
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    encryptedKeys: Array.from(cipher),
    nonce,
    creationHeight: 0,
    options: {},
  });
}

function envelope3(raw: RawWalletV1, password: string): string {
  return JSON.stringify(saveEncryptedWallet(raw, password));
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

const LOCAL_PW = "LocalPass-Strong1!";
const BACKUP_PW = "backup-file-pw";

describe("onboard create — Envelope 3, no temp password, abort", () => {
  const serviceSrc = readFileSync(
    join(process.cwd(), "lib/services/real-sdk/wallet.service.ts"),
    "utf8",
  );

  it("finalizeCreateWallet first blob is Envelope 3 under confirmed password", async () => {
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const { parseEncryptedWalletJson, openEncryptedWallet } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");

    await realSdkWalletService.prepareCreateWallet();
    await realSdkWalletService.finalizeCreateWallet({ password: LOCAL_PW });

    const stored = await getSdkWalletStorage().getItem("wallet");
    expect(stored).toBeTruthy();
    if (!stored) throw new Error("unreachable");
    const envelope = parseEncryptedWalletJson(stored);
    expect(envelope).not.toBeNull();
    if (envelope === null) throw new Error("unreachable");
    const opened = openEncryptedWallet(envelope as EncryptedWalletEnvelope, LOCAL_PW);
    expect(opened).not.toBeNull();
    expect(opened?.envelope).toBe(3);
  });

  it("create path does not use Math.random or a temporary password", () => {
    const prepare = methodBody(serviceSrc, "prepareCreateWallet");
    const finalize = methodBody(serviceSrc, "finalizeCreateWallet");
    const combined = `${prepare}\n${finalize}`;
    expect(combined).not.toMatch(/Math\.random/);
    expect(combined).not.toMatch(/tmp[_-]?password|temporary[_-]?password|tempPassword/i);
  });

  it("abortCreateWallet drops the pending draft", async () => {
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    await realSdkWalletService.prepareCreateWallet();
    await realSdkWalletService.abortCreateWallet();
    await expect(realSdkWalletService.finalizeCreateWallet({ password: LOCAL_PW })).rejects.toThrow(
      /No wallet draft/i,
    );
  });
});

describe("onboard omitMnemonic after abort / finalize", () => {
  const serviceSrc = readFileSync(
    join(process.cwd(), "lib/services/real-sdk/wallet.service.ts"),
    "utf8",
  );

  it("finalizeCreateWallet applies omitMnemonic (source)", () => {
    const body = methodBody(serviceSrc, "finalizeCreateWallet");
    expect(body).toMatch(/omitMnemonic/);
  });

  it("mnemonic import applies omitMnemonic (source)", () => {
    const body = methodBody(serviceSrc, "importWallet");
    expect(body).toMatch(/omitMnemonic/);
  });

  it("after finalize, long-lived runtime account has no mnemonic", async () => {
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const { getRuntime } = await import("@/lib/services/real-sdk/runtime");

    await realSdkWalletService.prepareCreateWallet();
    await realSdkWalletService.finalizeCreateWallet({ password: LOCAL_PW });

    const rt = getRuntime();
    expect(rt).not.toBeNull();
    if (rt === null) throw new Error("unreachable");
    expect("mnemonic" in rt.account).toBe(false);
  });

  it("after abort, finalize cannot revive the draft mnemonic", async () => {
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const draft = await realSdkWalletService.prepareCreateWallet();
    expect(draft.mnemonic.length).toBeGreaterThan(0);
    await realSdkWalletService.abortCreateWallet();
    await expect(realSdkWalletService.finalizeCreateWallet({ password: LOCAL_PW })).rejects.toThrow(
      /No wallet draft/i,
    );
  });
});

describe("onboard file import — Envelope 1/2/3 under newPassword", () => {
  const serviceSrc = readFileSync(
    join(process.cwd(), "lib/services/real-sdk/wallet.service.ts"),
    "utf8",
  );
  const typeSrc = readFileSync(join(process.cwd(), "lib/services/wallet.service.ts"), "utf8");

  it("ImportWalletInput file arm declares newPassword", () => {
    // Bound to the file arm only — do not match changePassword's newPassword later.
    const fileArm = typeSrc.match(/method:\s*"file"[\s\S]*?label\?:/);
    expect(fileArm?.[0] ?? "").toMatch(/newPassword:\s*string/);
  });

  it("file import adopts under newPassword (source)", () => {
    const body = methodBody(serviceSrc, "importWallet");
    expect(body).toMatch(/newPassword/);
    // Backup password opens the file; adopt must use newPassword, not password alone.
    expect(body).toMatch(/password:\s*input\.newPassword/);
  });

  async function assertFileImport(backupJson: string, label: string): Promise<void> {
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const { parseEncryptedWalletJson, openEncryptedWallet } = await import(
      "@/lib/services/real-sdk/envelope"
    );
    const { getSdkWalletStorage } = await import("@/lib/services/real-sdk/storage");

    const sourceBytes = new TextEncoder().encode(backupJson);
    const file = sourceBytes.buffer.slice(
      sourceBytes.byteOffset,
      sourceBytes.byteOffset + sourceBytes.byteLength,
    );
    const before = new Uint8Array(file.slice(0));

    await realSdkWalletService.importWallet({
      method: "file",
      file,
      password: BACKUP_PW,
      newPassword: LOCAL_PW,
      label,
    });

    const after = new Uint8Array(file);
    expect(after).toEqual(before);

    const stored = await getSdkWalletStorage().getItem("wallet");
    expect(stored).toBeTruthy();
    if (!stored) throw new Error("unreachable");
    const envelope = parseEncryptedWalletJson(stored);
    expect(envelope).not.toBeNull();
    if (envelope === null) throw new Error("unreachable");

    // Local store must open under newPassword as Envelope 3 — not the backup password.
    const withLocal = openEncryptedWallet(envelope as EncryptedWalletEnvelope, LOCAL_PW);
    expect(withLocal).not.toBeNull();
    expect(withLocal?.envelope).toBe(3);

    const withBackup = openEncryptedWallet(envelope as EncryptedWalletEnvelope, BACKUP_PW);
    expect(withBackup).toBeNull();
  }

  it("imports Envelope 1 file to local Envelope 3 under newPassword", async () => {
    const account = createAccount("english");
    await assertFileImport(legacyEnv1(account, BACKUP_PW), "from-e1");
  });

  it("imports Envelope 2 file to local Envelope 3 under newPassword", async () => {
    const account = createAccount("english");
    await assertFileImport(legacyEnv2(rawFor(account), BACKUP_PW), "from-e2");
  });

  it("imports Envelope 3 file to local Envelope 3 under newPassword", async () => {
    const account = createAccount("english");
    await assertFileImport(envelope3(rawFor(account), BACKUP_PW), "from-e3");
  });
});
