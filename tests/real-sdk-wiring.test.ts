import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Locks in the engine-selection env switch + the SDK storage coordinates WITHOUT
 * importing the engine itself (which would pull `conceal-wallet-sdk`/wasm into the
 * mock-mode unit suite). `lib/env.ts` and `lib/services/real-sdk/storage.ts` are
 * leaf modules with no wallet-engine runtime imports, so they load safely here.
 */

const MOCK_ENV = "NEXT_PUBLIC_USE_MOCK";

async function freshEnv() {
  // env.ts reads process.env at module-init, so reset the module cache per case.
  vi.resetModules();
  const mod = await import("@/lib/env");
  return mod.env as { useMockWallet: boolean };
}

describe("engine-selection env wiring", () => {
  const original = process.env[MOCK_ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[MOCK_ENV];
    else process.env[MOCK_ENV] = original;
  });

  it("defaults to mock services when NEXT_PUBLIC_USE_MOCK is unset", async () => {
    delete process.env[MOCK_ENV];
    expect((await freshEnv()).useMockWallet).toBe(true);
  });

  it("selects the real (SDK) engine only on NEXT_PUBLIC_USE_MOCK=false", async () => {
    process.env[MOCK_ENV] = "false";
    expect((await freshEnv()).useMockWallet).toBe(false);
  });

  it("treats any non-'false' value as mock", async () => {
    process.env[MOCK_ENV] = "true";
    expect((await freshEnv()).useMockWallet).toBe(true);
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
