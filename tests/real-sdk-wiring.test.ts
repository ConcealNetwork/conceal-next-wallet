import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Locks in the SDK-engine wiring + storage coordinates WITHOUT importing the
 * engine itself (which would pull `conceal-wallet-sdk`/wasm into the mock-mode
 * unit suite). `lib/env.ts` and `lib/services/real-sdk/storage.ts` are leaf
 * modules with no wallet-engine runtime imports, so they are safe to load here.
 */

const ENGINE_ENV = "NEXT_PUBLIC_WALLET_ENGINE";

async function freshEnv() {
  // env.ts reads process.env at module-init, so reset the module cache per case.
  vi.resetModules();
  const mod = await import("@/lib/env");
  return mod.env as { useMockWallet: boolean; walletEngine: "sdk" | "wallet-core" };
}

describe("real-sdk env wiring", () => {
  const original = process.env[ENGINE_ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[ENGINE_ENV];
    else process.env[ENGINE_ENV] = original;
  });

  it("defaults walletEngine to sdk (the cutover default)", async () => {
    delete process.env[ENGINE_ENV];
    expect((await freshEnv()).walletEngine).toBe("sdk");
  });

  it("selects the sdk engine when NEXT_PUBLIC_WALLET_ENGINE=sdk", async () => {
    process.env[ENGINE_ENV] = "sdk";
    expect((await freshEnv()).walletEngine).toBe("sdk");
  });

  it("falls back to the legacy engine only on the explicit wallet-core escape hatch", async () => {
    process.env[ENGINE_ENV] = "wallet-core";
    expect((await freshEnv()).walletEngine).toBe("wallet-core");
  });

  it("treats any other value as the sdk default", async () => {
    process.env[ENGINE_ENV] = "legacy";
    expect((await freshEnv()).walletEngine).toBe("sdk");
  });
});

describe("real-sdk storage adapter", () => {
  let getSdkWalletStorage: typeof import("@/lib/services/real-sdk/storage").getSdkWalletStorage;
  let _resetSdkWalletStorage: typeof import("@/lib/services/real-sdk/storage")._resetSdkWalletStorage;

  beforeEach(async () => {
    const mod = await import("@/lib/services/real-sdk/storage");
    getSdkWalletStorage = mod.getSdkWalletStorage;
    _resetSdkWalletStorage = mod._resetSdkWalletStorage;
    _resetSdkWalletStorage();
    window.localStorage.clear();
  });

  afterEach(() => {
    _resetSdkWalletStorage();
    window.localStorage.clear();
  });

  it("round-trips the 'wallet' record through the localStorage fallback", async () => {
    // jsdom provides no IndexedDB, so the adapter uses the localStorage fallback.
    const storage = getSdkWalletStorage();
    expect(await storage.getItem("wallet")).toBeNull();

    await storage.setItem("wallet", '{"data":[1,2,3],"nonce":"abc"}');
    expect(await storage.getItem("wallet")).toBe('{"data":[1,2,3],"nonce":"abc"}');
    expect(await storage.keys()).toContain("wallet");

    await storage.removeItem("wallet");
    expect(await storage.getItem("wallet")).toBeNull();
  });
});
