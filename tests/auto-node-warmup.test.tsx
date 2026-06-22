// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The probe module is replaced with a spy so the test asserts WHETHER it is invoked — never the real
// network probe. The whole point of mounting AutoNodeWarmup on the page (not the provider) and gating
// on `env.useMockWallet` is "tests never fire a node probe"; this locks that invariant (GLM M2).
const refreshAutoNode = vi.fn();

beforeEach(() => {
  vi.resetModules();
  refreshAutoNode.mockClear();
  vi.doMock("@/lib/network/auto-node", () => ({ refreshAutoNode }));
});

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/network/auto-node");
  vi.doUnmock("@/lib/env");
});

async function renderWarmup(): Promise<void> {
  const { AutoNodeWarmup } = await import("@/components/landing/auto-node-warmup");
  render(<AutoNodeWarmup />);
  // Flush the mount effect + the dynamic import()'s microtasks.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("AutoNodeWarmup", () => {
  it("does NOT probe in mock mode", async () => {
    vi.doMock("@/lib/env", () => ({ env: { useMockWallet: true, persistWalletSession: true } }));
    await renderWarmup();
    expect(refreshAutoNode).not.toHaveBeenCalled();
  });

  it("probes once in real mode", async () => {
    vi.doMock("@/lib/env", () => ({ env: { useMockWallet: false, persistWalletSession: false } }));
    await renderWarmup();
    expect(refreshAutoNode).toHaveBeenCalledTimes(1);
  });
});
