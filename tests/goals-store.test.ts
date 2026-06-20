import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/goal";
import { createGoalsStore, goalsKey, inMemoryGoalsBackend } from "@/lib/storage/goals-store";

function makeGoal(id: string, over: Partial<Goal> = {}): Goal {
  return {
    id,
    name: `Goal ${id}`,
    target: "1000000000",
    contributions: [],
    status: "active",
    createdAt: "2026-06-01T00:00:00Z",
    ...over,
  };
}

describe("goals store", () => {
  it("saves (upsert), lists, updates and removes per wallet", async () => {
    const store = createGoalsStore(inMemoryGoalsBackend());
    await store.save("w1", makeGoal("a"));
    await store.save("w1", makeGoal("b"));
    expect((await store.list("w1")).map((g) => g.id)).toEqual(["a", "b"]);

    // upsert by id (no duplicate)
    await store.save("w1", makeGoal("a", { name: "Renamed" }));
    const afterUpsert = await store.list("w1");
    expect(afterUpsert).toHaveLength(2);
    expect(afterUpsert.find((g) => g.id === "a")?.name).toBe("Renamed");

    await store.update("w1", "b", { status: "archived" });
    expect((await store.list("w1")).find((g) => g.id === "b")?.status).toBe("archived");

    await store.remove("w1", "a");
    expect((await store.list("w1")).map((g) => g.id)).toEqual(["b"]);
  });

  it("isolates wallets and clears one without touching the other", async () => {
    const store = createGoalsStore(inMemoryGoalsBackend());
    await store.save("w1", makeGoal("a"));
    await store.save("w2", makeGoal("z"));
    expect(await store.list("w2")).toHaveLength(1);
    await store.clear("w1");
    expect(await store.list("w1")).toEqual([]);
    expect((await store.list("w2")).map((g) => g.id)).toEqual(["z"]);
  });

  it("skips corrupt records on read (never fatal)", async () => {
    const backend = inMemoryGoalsBackend({
      [goalsKey("w1")]: [makeGoal("ok"), { id: "bad", target: "0" } as unknown as Goal],
    });
    const store = createGoalsStore(backend);
    expect((await store.list("w1")).map((g) => g.id)).toEqual(["ok"]);
  });

  it("throws on an unresolved wallet id and on invalid input", async () => {
    const store = createGoalsStore(inMemoryGoalsBackend());
    await expect(store.list("")).rejects.toThrow();
    await expect(store.save("w1", { id: "x" } as unknown as Goal)).rejects.toThrow();
    await expect(store.update("w1", "x", { target: "0" })).resolves.toBeDefined(); // no match → no-op
    await store.save("w1", makeGoal("x"));
    await expect(store.update("w1", "x", { target: "0" })).rejects.toThrow(); // invalid patch on match
  });

  it("clearAll wipes every wallet", async () => {
    const store = createGoalsStore(inMemoryGoalsBackend());
    await store.save("w1", makeGoal("a"));
    await store.save("w2", makeGoal("b"));
    await store.clearAll();
    expect(await store.list("w1")).toEqual([]);
    expect(await store.list("w2")).toEqual([]);
  });
});
