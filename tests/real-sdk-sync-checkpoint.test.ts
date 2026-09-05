// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Deep-sync checkpoints (Roomote finding / getnowhere ios-sync-checkpoint port).
 * Persist mid-catch-up so a tab close, lock, or process kill does not rewind
 * scannedHeight to the last end-of-loop write.
 */

const { saveStoredWalletMock, serializeWalletStateMock } = vi.hoisted(() => ({
  saveStoredWalletMock: vi.fn().mockResolvedValue(undefined),
  serializeWalletStateMock: vi.fn().mockReturnValue("{}"),
}));

vi.mock("conceal-wallet-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("conceal-wallet-sdk")>();
  return {
    ...actual,
    saveStoredWallet: saveStoredWalletMock,
    serializeWalletState: serializeWalletStateMock,
  };
});

import {
  flushReceivedRaw,
  readReceivedRecords,
  type SdkMessageRecord,
} from "@/lib/services/real-sdk/messages-store";
import {
  _setRuntimeForTest,
  disconnect,
  flushSyncCheckpoint,
  maybeCheckpoint,
  type SdkRuntime,
} from "@/lib/services/real-sdk/runtime";

function fakeStorage(): SdkRuntime["storage"] {
  return {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
  };
}

function makeRt(scannedHeight: number, lastHeight = 0): SdkRuntime {
  return {
    id: "default",
    account: { keys: {} } as SdkRuntime["account"],
    raw: { lastHeight } as SdkRuntime["raw"],
    state: { scannedHeight } as SdkRuntime["state"],
    daemon: {} as SdkRuntime["daemon"],
    password: "pw",
    viewOnly: false,
    storage: fakeStorage(),
  };
}

function makeCoord(lastCheckpointHeight = 0) {
  return {
    inFlightSync: null as Promise<number> | null,
    pendingSync: false,
    persistChain: Promise.resolve(),
    lastCheckpointHeight,
  };
}

function sampleReceived(id = "tx-in"): SdkMessageRecord {
  return {
    id,
    direction: "received",
    counterpartyAddress: "ccx1sample",
    counterpartyName: "",
    body: "hi",
    hasBody: true,
    paymentIdFrom: null,
    paymentIdTo: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    unread: true,
    blockHeight: 100,
    threadKey: "ccx1sample",
  };
}

describe("maybeCheckpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _setRuntimeForTest(null);
  });

  it("is a no-op on the light path even when the interval is exceeded", async () => {
    const lastCheckpoint = 0;
    const scannedHeight = lastCheckpoint + 2000;
    const rt = makeRt(scannedHeight);
    const coord = makeCoord(lastCheckpoint);

    await maybeCheckpoint(rt, coord, false);

    expect(saveStoredWalletMock).not.toHaveBeenCalled();
    expect(coord.lastCheckpointHeight).toBe(lastCheckpoint);
  });

  it("is a no-op when scannedHeight advanced less than the checkpoint interval", async () => {
    const lastCheckpoint = 500;
    const scannedHeight = lastCheckpoint + 999;
    const rt = makeRt(scannedHeight);
    const coord = makeCoord(lastCheckpoint);

    await maybeCheckpoint(rt, coord, true);

    expect(saveStoredWalletMock).not.toHaveBeenCalled();
    expect(coord.lastCheckpointHeight).toBe(lastCheckpoint);
  });

  it("persists and advances lastCheckpointHeight when the interval is reached", async () => {
    const lastCheckpoint = 500;
    const scannedHeight = lastCheckpoint + 1000;
    const rt = makeRt(scannedHeight);
    const coord = makeCoord(lastCheckpoint);

    await maybeCheckpoint(rt, coord, true);

    expect(saveStoredWalletMock).toHaveBeenCalledOnce();
    expect(coord.lastCheckpointHeight).toBe(scannedHeight);
  });
});

describe("flushSyncCheckpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _setRuntimeForTest(null);
  });

  it("is a no-op when the wallet is locked", async () => {
    await flushSyncCheckpoint();
    expect(saveStoredWalletMock).not.toHaveBeenCalled();
  });

  it("is a no-op when scannedHeight has not advanced past lastHeight", async () => {
    const lastHeight = 1000;
    _setRuntimeForTest(makeRt(lastHeight, lastHeight));

    await flushSyncCheckpoint();

    expect(saveStoredWalletMock).not.toHaveBeenCalled();
  });

  it("persists when scannedHeight has advanced past lastHeight", async () => {
    const lastHeight = 800;
    const rt = makeRt(lastHeight + 200, lastHeight);
    _setRuntimeForTest(rt);

    await flushSyncCheckpoint();

    expect(saveStoredWalletMock).toHaveBeenCalledOnce();
    expect(saveStoredWalletMock).toHaveBeenCalledWith(rt.storage, expect.any(Object), rt.password);
  });
});

describe("disconnect flush", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _setRuntimeForTest(null);
  });

  it("persists advanced scan progress before dropping the runtime", async () => {
    const lastHeight = 800;
    const rt = makeRt(lastHeight + 200, lastHeight);
    _setRuntimeForTest(rt);

    await disconnect();

    expect(saveStoredWalletMock).toHaveBeenCalledOnce();
    const { getRuntime } = await import("@/lib/services/real-sdk/runtime");
    expect(getRuntime()).toBeNull();
  });

  it("still locks when the checkpoint write fails", async () => {
    saveStoredWalletMock.mockRejectedValueOnce(new Error("quota"));
    _setRuntimeForTest(makeRt(1200, 800));

    await disconnect();

    const { getRuntime } = await import("@/lib/services/real-sdk/runtime");
    expect(getRuntime()).toBeNull();
  });
});

describe("flushReceivedRaw", () => {
  it("returns the same raw when nothing changed", () => {
    const raw = { lastHeight: 0 } as SdkRuntime["raw"];
    const received = new Map<string, SdkMessageRecord>([["tx-in", sampleReceived()]]);
    expect(flushReceivedRaw(raw, received, false)).toBe(raw);
  });

  it("writes received records onto the blob when the batch added inbound mail", () => {
    const raw = { lastHeight: 0 } as SdkRuntime["raw"];
    const inbound = sampleReceived();
    const received = new Map<string, SdkMessageRecord>([[inbound.id, inbound]]);
    const next = flushReceivedRaw(raw, received, true);
    expect(next).not.toBe(raw);
    expect(readReceivedRecords(next)).toEqual([inbound]);
  });
});
