// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  type BatchRange,
  type FetchSource,
  fetchRangeMultiSource,
  planBatches,
  sourcesForBatch,
} from "@/lib/services/real-sdk/multi-source-fetch";

/** A source that records its calls and returns the block heights it was asked for. */
function source(
  label: string,
  height: number,
  opts: { fail?: boolean; delayByStart?: (start: number) => number } = {},
): FetchSource<number> & { calls: Array<[number, number]> } {
  const calls: Array<[number, number]> = [];
  return {
    label,
    height,
    calls,
    async fetch(start: number, end: number) {
      calls.push([start, end]);
      if (opts.delayByStart) {
        await new Promise((r) => setTimeout(r, opts.delayByStart?.(start)));
      }
      if (opts.fail) throw new Error(`${label} failed [${start},${end})`);
      // Return one item per block in the range (its height) so we can verify coverage + order.
      const out: number[] = [];
      for (let h = start; h < end; h++) out.push(h);
      return out;
    },
  };
}

/** Run the driver and collect (in delivery order) the folded items + the onBatch ranges. */
async function run(
  sources: ReturnType<typeof source>[],
  start: number,
  end: number,
  batchSize: number,
) {
  const folded: number[] = [];
  const batchRanges: BatchRange[] = [];
  await fetchRangeMultiSource<number>({
    start,
    end,
    batchSize,
    sources,
    onBatch: (items, batchStart, batchEnd) => {
      folded.push(...items);
      batchRanges.push({ start: batchStart, end: batchEnd });
    },
  });
  return { folded, batchRanges };
}

describe("planBatches", () => {
  it("splits into contiguous half-open batches with no gap or overlap", () => {
    expect(planBatches(1, 251, 100)).toEqual([
      { start: 1, end: 101 },
      { start: 101, end: 201 },
      { start: 201, end: 251 },
    ]);
  });
  it("returns one batch when the range fits", () => {
    expect(planBatches(5, 9, 100)).toEqual([{ start: 5, end: 9 }]);
  });
  it("is empty for an empty range", () => {
    expect(planBatches(10, 10, 100)).toEqual([]);
  });
});

describe("sourcesForBatch", () => {
  const home = { label: "home", height: 1000, fetch: async () => [] };
  const fast = { label: "fast", height: 1000, fetch: async () => [] };
  const behind = { label: "behind", height: 150, fetch: async () => [] };
  const sources = [home, fast, behind];

  it("excludes a source whose height does not cover the batch", () => {
    const list = sourcesForBatch({ start: 200, end: 300 }, 0, sources);
    expect(list).not.toContain(behind); // behind.height 150 < 300
    expect(list).toContain(home);
    expect(list).toContain(fast);
  });
  it("always includes the home node as a failover candidate", () => {
    for (let i = 0; i < 5; i++) {
      const list = sourcesForBatch({ start: 0, end: 100 }, i, sources);
      expect(list).toContain(home);
    }
  });
  it("rotates the primary across batches so load is spread (home is not starved)", () => {
    const primaries = [0, 1, 2, 3].map((i) => sourcesForBatch({ start: 0, end: 100 }, i, [home, fast])[0]);
    // Over consecutive batches the primary alternates — both nodes get work.
    expect(primaries).toContain(home);
    expect(primaries).toContain(fast);
  });
  it("falls back to home alone when nothing else covers the batch", () => {
    const list = sourcesForBatch({ start: 900, end: 1000 }, 0, [home, behind]);
    expect(list).toEqual([home]);
  });
});

describe("fetchRangeMultiSource", () => {
  it("single source: covers the whole range in order (like a sequential fetch)", async () => {
    const home = source("home", 1000);
    const { folded } = await run([home], 1, 251, 100);
    expect(folded).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
  });

  it("multi-source: delivers batches IN ASCENDING ORDER even when fetches finish out of order", async () => {
    // Make the FIRST source slow and the second fast, so completion order != index order.
    const a = source("a", 1000, { delayByStart: (s) => (s === 1 ? 40 : 0) });
    const b = source("b", 1000, { delayByStart: () => 5 });
    const { folded, batchRanges } = await run([a, b], 1, 401, 100);
    // Folded items are strictly ascending, fully covering [1, 401).
    expect(folded).toEqual(Array.from({ length: 400 }, (_, i) => i + 1));
    // onBatch ranges are contiguous + ascending.
    expect(batchRanges).toEqual([
      { start: 1, end: 101 },
      { start: 101, end: 201 },
      { start: 201, end: 301 },
      { start: 301, end: 401 },
    ]);
  });

  it("distributes batches across sources (load is shared, not all on one node)", async () => {
    const a = source("a", 1000);
    const b = source("b", 1000);
    await run([a, b], 1, 401, 100); // 4 batches across 2 sources
    expect(a.calls.length).toBeGreaterThan(0);
    expect(b.calls.length).toBeGreaterThan(0);
    expect(a.calls.length + b.calls.length).toBe(4);
  });

  it("never assigns a batch to a source that is behind it", async () => {
    const home = source("home", 1000);
    const behind = source("behind", 150); // only covers blocks < 150
    await run([home, behind], 1, 401, 100);
    // Every range the behind-node was asked for ends at or below its height.
    expect(behind.calls.every(([, end]) => end <= behind.height)).toBe(true);
    // Full coverage still came through (home picked up the rest).
  });

  it("fails over to another source and still covers everything in order", async () => {
    const flaky = source("flaky", 1000, { fail: true });
    const home = source("home", 1000);
    // flaky is sources[1]; home is sources[0] (failover target).
    const { folded } = await run([home, flaky], 1, 401, 100);
    expect(folded).toEqual(Array.from({ length: 400 }, (_, i) => i + 1));
  });

  it("rejects (no silent gap) when a batch fails on EVERY source", async () => {
    const a = source("a", 1000, { fail: true });
    const b = source("b", 1000, { fail: true });
    await expect(run([a, b], 1, 401, 100)).rejects.toThrow(/failed/);
  });

  it("folds strictly sequentially — onBatch calls never overlap despite parallel fetches", async () => {
    const a = source("a", 1000, { delayByStart: () => 10 });
    const b = source("b", 1000, { delayByStart: () => 10 });
    let active = 0;
    let maxActive = 0;
    await fetchRangeMultiSource<number>({
      start: 1,
      end: 501,
      batchSize: 100,
      sources: [a, b],
      onBatch: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      },
    });
    expect(maxActive).toBe(1); // never two folds at once
  });
});
