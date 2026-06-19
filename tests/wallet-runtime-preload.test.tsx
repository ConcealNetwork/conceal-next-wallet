import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The legacy-globals warm-up must run ONLY for the `wallet-core` engine. The default
 * SDK engine imports conceal-lib-js as a module and never uses `window.nacl`/
 * `concealjs`, so preloading them there is wasted work (and surfaced a spurious
 * "Wallet runtime preload failed" warning when an idle fetch missed).
 */

// Mutable env so each test can pick the engine; the component reads it live.
const envRef = vi.hoisted(() => ({
  current: { useMockWallet: false, walletEngine: "sdk" as "sdk" | "wallet-core" },
}));
vi.mock("@/lib/env", () => ({
  get env() {
    return envRef.current;
  },
}));

const { ensureWalletRuntimeLibs, isWalletRuntimeReady } = vi.hoisted(() => ({
  ensureWalletRuntimeLibs: vi.fn().mockResolvedValue(undefined),
  isWalletRuntimeReady: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/conceal/init", () => ({ ensureWalletRuntimeLibs, isWalletRuntimeReady }));

import { WalletRuntimePreload } from "@/components/wallet/wallet-runtime-preload";

beforeEach(() => {
  ensureWalletRuntimeLibs.mockClear();
  isWalletRuntimeReady.mockReturnValue(false);
  // Run the idle/timeout preload callback synchronously on render.
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
    cb();
    return 1;
  });
  vi.stubGlobal("cancelIdleCallback", () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WalletRuntimePreload engine gating", () => {
  it("does NOT warm legacy globals under the SDK engine", () => {
    envRef.current = { useMockWallet: false, walletEngine: "sdk" };
    render(<WalletRuntimePreload />);
    expect(ensureWalletRuntimeLibs).not.toHaveBeenCalled();
  });

  it("warms legacy globals under the wallet-core escape-hatch engine", () => {
    envRef.current = { useMockWallet: false, walletEngine: "wallet-core" };
    render(<WalletRuntimePreload />);
    expect(ensureWalletRuntimeLibs).toHaveBeenCalledTimes(1);
  });

  it("does NOT warm legacy globals in mock mode", () => {
    envRef.current = { useMockWallet: true, walletEngine: "wallet-core" };
    render(<WalletRuntimePreload />);
    expect(ensureWalletRuntimeLibs).not.toHaveBeenCalled();
  });
});
