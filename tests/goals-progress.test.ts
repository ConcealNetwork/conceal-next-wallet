import { describe, expect, it } from "vitest";
import type { Goal, GoalContribution } from "@/lib/goals/goal";
import { atomicToCcx, computeGoal, sumContributions } from "@/lib/goals/progress";

const CCX = 1_000_000; // atomic per CCX

function contrib(ccx: number, id = `c${ccx}`): GoalContribution {
  return { id, amount: String(ccx * CCX), at: "2026-02-01T00:00:00Z", source: "manual" };
}

function makeGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    name: "Goal",
    target: String(9000 * CCX),
    contributions: [],
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("sums + derived money", () => {
  it("sums contributions and derives remaining/overage/pct", () => {
    const g = makeGoal({
      target: String(10_000 * CCX),
      contributions: [contrib(3000), contrib(0.5)],
    });
    const c = computeGoal(g, new Date("2026-02-01T00:00:00Z"));
    expect(c.saved).toBe(BigInt(3000 * CCX + 0.5 * CCX));
    expect(c.remaining).toBe(BigInt(10_000 * CCX - 3000.5 * CCX));
    expect(c.overage).toBe(BigInt(0));
    expect(c.progressPct).toBeCloseTo(30.005, 2);
    expect(c.visualPct).toBeCloseTo(30.005, 2);
    expect(c.achieved).toBe(false);
  });

  it("clamps visualPct and reports overage when exceeded", () => {
    const g = makeGoal({ target: String(1000 * CCX), contributions: [contrib(1500)] });
    const c = computeGoal(g, new Date("2026-02-01T00:00:00Z"));
    expect(c.achieved).toBe(true);
    expect(c.overage).toBe(BigInt(500 * CCX));
    expect(c.visualPct).toBe(100);
    expect(c.progressPct).toBeCloseTo(150, 5);
    expect(c.status).toBe("achieved");
  });

  it("atomicToCcx + sumContributions round-trip", () => {
    const g = makeGoal({ contributions: [contrib(10), contrib(5)] });
    expect(sumContributions(g)).toBe(BigInt(15 * CCX));
    expect(atomicToCcx(BigInt(15) * BigInt(CCX)).atomic).toBe(15 * CCX);
  });
});

describe("pace + on-track (linear plan + buffer)", () => {
  // created 2026-01-01, deadline 2026-04-01 → 90-day plan.
  const base = { deadline: "2026-04-01", createdAt: "2026-01-01T00:00:00Z" };
  const midPlan = new Date("2026-02-15T00:00:00Z"); // 45 of 90 days elapsed, 45 left

  it("on-track when saved ≥ expected (within buffer)", () => {
    const g = makeGoal({ ...base, contributions: [contrib(4500)] }); // expected 4500 at midpoint
    const c = computeGoal(g, midPlan);
    expect(c.pace?.onTrack).toBe(true);
    expect(c.pace?.daysLeft).toBe(45);
    expect(c.pace?.cadence).toBe("weekly");
    expect(c.status).toBe("on-track");
  });

  it("behind when saved well under expected", () => {
    const g = makeGoal({ ...base, contributions: [contrib(2000)] });
    const c = computeGoal(g, midPlan);
    expect(c.pace?.onTrack).toBe(false);
    expect(c.status).toBe("behind");
    // remaining 7000 CCX over 45 days → > 0 weekly requirement
    expect(c.pace ? c.pace.requiredPerWeek > BigInt(0) : false).toBe(true);
  });

  it("due-soon when on-track and ≤14 days left", () => {
    const g = makeGoal({ ...base, contributions: [contrib(8500)] });
    const c = computeGoal(g, new Date("2026-03-25T00:00:00Z")); // 7 days left
    expect(c.pace?.daysLeft).toBe(7);
    expect(c.pace?.onTrack).toBe(true);
    expect(c.status).toBe("due-soon");
  });

  it("deadline-passed when overdue and unmet", () => {
    const g = makeGoal({ ...base, contributions: [contrib(1000)] });
    const c = computeGoal(g, new Date("2026-05-01T00:00:00Z"));
    expect(c.pace ? c.pace.daysLeft < 0 : false).toBe(true);
    expect(c.status).toBe("deadline-passed");
  });
});

describe("no-deadline + archived precedence", () => {
  it("not-started with no deadline and nothing saved", () => {
    const c = computeGoal(makeGoal(), new Date("2026-02-01T00:00:00Z"));
    expect(c.pace).toBeNull();
    expect(c.status).toBe("not-started");
  });
  it("in-progress with no deadline and some saved", () => {
    const c = computeGoal(
      makeGoal({ contributions: [contrib(100)] }),
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(c.status).toBe("in-progress");
  });
  it("archived wins over everything", () => {
    const g = makeGoal({ status: "archived", contributions: [contrib(99999)] });
    expect(computeGoal(g, new Date("2026-02-01T00:00:00Z")).status).toBe("archived");
  });
});
