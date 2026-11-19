// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// Differential test for issue #402: the inline hang-window sequence that
// sendTransaction used before the migration (verbatim from `development`) is the
// oracle; raceLinkHang wired the way sendTransaction wires it must produce the
// same result and the same ordered side effects across the whole scenario matrix.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectHangMs, lateGraceMs, linkGone, raceLinkHang } from "@/lib/services/real-sdk/spend";

type Row = { tag: string };
type Done = Promise<Row | "abandoned">;
type Daemon = { getHeight(): Promise<number> };

interface Hooks {
  done: Done;
  daemon: Daemon;
  killGate: () => void;
  saved: () => Row | undefined;
  hash: () => string | undefined;
  queueAuto: () => Row;
  queueHung: (hash: string) => Row;
}

/** The pre-migration inline sequence from sendTransaction, unchanged. */
async function inlineOracle(h: Hooks): Promise<Row> {
  const { done } = h;
  void done.catch(() => {});
  let hangTimer: ReturnType<typeof setTimeout> | undefined;
  const winner = await Promise.race([
    done.then((row) => ({ kind: "done" as const, row })),
    new Promise<{ kind: "timeout" }>((resolve) => {
      hangTimer = setTimeout(() => resolve({ kind: "timeout" }), connectHangMs);
    }),
  ]);
  if (hangTimer !== undefined) clearTimeout(hangTimer);

  if (winner.kind === "done") {
    return winner.row === "abandoned" ? h.queueAuto() : winner.row;
  }
  if (!(await linkGone(h.daemon))) {
    const late = await Promise.race([
      done.then((r) => ({ kind: "done" as const, r })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), lateGraceMs),
      ),
    ]);
    if (late.kind === "done") {
      return late.r === "abandoned" ? h.queueAuto() : late.r;
    }
  }
  h.killGate();
  const saved = h.saved();
  if (saved) return saved;
  const hash = h.hash();
  if (hash) return h.queueHung(hash);
  return h.queueAuto();
}

/** The wrapper exactly as sendTransaction calls the shared helper. */
function viaHelper(h: Hooks): Promise<Row> {
  return raceLinkHang<Row>({
    done: h.done,
    daemon: h.daemon,
    killGate: h.killGate,
    saved: h.saved,
    parkAuto: h.queueAuto,
    parkHung: () => {
      const hash = h.hash();
      return hash ? h.queueHung(hash) : undefined;
    },
  });
}

type BodyKind = "sync-parked" | "resolves" | "abandoned" | "parks" | "rejects" | "never";
type LinkKind = "up" | "probe-hangs" | "daemon-throws" | "offline";

interface Scenario {
  body: BodyKind;
  at: number;
  hashAt: number | null;
  link: LinkKind;
}

const bodyTimes = [0, 5_000, 10_500, 12_500, 12_999, 13_001, 14_000, 40_000];
const hashTimes = [null, 0, 10_500, 15_000];
const bodyKinds: BodyKind[] = ["resolves", "abandoned", "parks", "rejects"];
const links: LinkKind[] = ["up", "probe-hangs", "daemon-throws", "offline"];
const settleMs = 60_000;

function scenarios(link: LinkKind): Scenario[] {
  const timed = bodyKinds.flatMap((body) => bodyTimes.map((at) => ({ body, at })));
  const all = [
    { body: "sync-parked" as const, at: 0 },
    ...timed,
    { body: "never" as const, at: 0 },
  ];
  return all.flatMap((b) => hashTimes.map((hashAt) => ({ ...b, hashAt, link })));
}

function daemonFor(link: LinkKind): Daemon {
  if (link === "probe-hangs") return { getHeight: () => new Promise<number>(() => {}) };
  if (link === "daemon-throws") return { getHeight: () => Promise.reject(new Error("down")) };
  return { getHeight: () => Promise.resolve(1) };
}

interface Outcome {
  result: string;
  events: string[];
}

/** Scripted body: same schedule for every implementation under test. */
function world(s: Scenario) {
  const events: string[] = [];
  const state = {
    live: true,
    saved: undefined as Row | undefined,
    hash: undefined as string | undefined,
  };
  const at = (ms: number, fn: () => void) => (ms === 0 ? fn() : void setTimeout(fn, ms));

  if (s.hashAt !== null) {
    at(s.hashAt, () => {
      state.hash = "h1";
    });
  }

  const done: Done = new Promise((resolve, reject) => {
    if (s.body === "never") return;
    if (s.body === "sync-parked") {
      state.saved = { tag: "SAVED" };
      resolve(state.saved);
      return;
    }
    at(s.at, () => {
      if (s.body === "resolves") resolve({ tag: "SENT" });
      else if (s.body === "rejects") reject(new Error("boom"));
      else if (s.body === "abandoned" || !state.live) resolve("abandoned");
      else {
        state.saved = { tag: "PARKED" };
        resolve(state.saved);
      }
    });
  });

  const hooks: Hooks = {
    done,
    daemon: daemonFor(s.link),
    killGate: () => {
      events.push("kill");
      state.live = false;
    },
    saved: () => state.saved,
    hash: () => state.hash,
    queueAuto: () => {
      events.push("auto");
      return { tag: "AUTO" };
    },
    queueHung: (hash) => {
      events.push(`hung:${hash}`);
      return { tag: "HUNG" };
    },
  };
  return { hooks, events };
}

async function observe(impl: (h: Hooks) => Promise<Row>, s: Scenario): Promise<Outcome> {
  const { hooks, events } = world(s);
  const settled = impl(hooks).then(
    (row) => `ok:${row.tag}`,
    (error: Error) => `err:${error.message}`,
  );
  await vi.advanceTimersByTimeAsync(settleMs);
  return { result: await settled, events };
}

describe("sendTransaction hang window: inline oracle vs raceLinkHang (#402)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("yields identical results and ordered side effects across the whole matrix", async () => {
    const seen = new Set<string>();
    const mismatches: string[] = [];

    for (const link of links) {
      vi.unstubAllGlobals();
      if (link === "offline") vi.stubGlobal("navigator", { onLine: false });
      for (const s of scenarios(link)) {
        const expected = await observe(inlineOracle, s);
        const actual = await observe(viaHelper, s);
        seen.add(expected.result);
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          mismatches.push(
            `${JSON.stringify(s)}\n  oracle: ${JSON.stringify(expected)}\n  helper: ${JSON.stringify(actual)}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
    expect([...seen].sort()).toEqual(
      ["err:boom", "ok:AUTO", "ok:HUNG", "ok:PARKED", "ok:SAVED", "ok:SENT"].sort(),
    );
  });
});
