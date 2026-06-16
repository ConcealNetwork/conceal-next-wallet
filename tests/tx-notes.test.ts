import { describe, expect, it } from "vitest";
import {
  createTxNotesStore,
  inMemoryTxNotesBackend,
  MAX_TX_NOTE_LENGTH,
} from "@/lib/storage/tx-notes";

function makeStore(seed?: Record<string, string>) {
  const backend = inMemoryTxNotesBackend(seed);
  return { store: createTxNotesStore(backend), backend };
}

describe("tx-notes store", () => {
  it("returns an empty string when no note exists", async () => {
    const { store } = makeStore();
    expect(await store.getNote("hashA")).toBe("");
  });

  it("round-trips a saved note", async () => {
    const { store } = makeStore();
    const stored = await store.setNote("hashA", "  coffee with Ana ");
    expect(stored).toBe("coffee with Ana");
    expect(await store.getNote("hashA")).toBe("coffee with Ana");
  });

  it("keeps notes isolated per hash", async () => {
    const { store } = makeStore();
    await store.setNote("hashA", "note A");
    await store.setNote("hashB", "note B");
    expect(await store.getNote("hashA")).toBe("note A");
    expect(await store.getNote("hashB")).toBe("note B");
  });

  it("overwrites an existing note", async () => {
    const { store } = makeStore({ hashA: "old" });
    await store.setNote("hashA", "new");
    expect(await store.getNote("hashA")).toBe("new");
  });

  it("deletes the key when the note becomes empty", async () => {
    const { store, backend } = makeStore({ hashA: "temp" });
    const stored = await store.setNote("hashA", "   ");
    expect(stored).toBe("");
    expect(await store.getNote("hashA")).toBe("");
    expect(await backend.get("hashA")).toBeNull();
  });

  it("clamps an oversized note before storing", async () => {
    const { store } = makeStore();
    const stored = await store.setNote("hashA", "q".repeat(MAX_TX_NOTE_LENGTH + 100));
    expect(stored).toHaveLength(MAX_TX_NOTE_LENGTH);
    expect(await store.getNote("hashA")).toHaveLength(MAX_TX_NOTE_LENGTH);
  });

  it("rejects saving without a hash", async () => {
    const { store } = makeStore();
    await expect(store.setNote("", "orphan")).rejects.toThrow(/transaction hash/i);
  });

  it("treats a missing hash as empty on read", async () => {
    const { store } = makeStore();
    expect(await store.getNote("")).toBe("");
  });

  it("clearAll erases every note (panic wipe)", async () => {
    const { store, backend } = makeStore({ hashA: "a", hashB: "b" });
    await store.clearAll();
    expect(await store.getNote("hashA")).toBe("");
    expect(await store.getNote("hashB")).toBe("");
    expect(await backend.get("hashA")).toBeNull();
  });
});
