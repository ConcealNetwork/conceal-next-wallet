import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/goal";
import {
  addContribution,
  archiveGoal,
  buildContribution,
  buildGoal,
  editContribution,
  editGoal,
  removeContribution,
  restoreGoal,
} from "@/lib/goals/mutations";

const NOW = new Date("2026-06-01T00:00:00Z");

function makeGoal(): Goal {
  // target 1000 CCX
  return buildGoal({ name: "Laptop", target: "1000" }, NOW, "g1") as Goal;
}

describe("buildGoal / buildContribution", () => {
  it("builds a valid active goal and rejects bad input", () => {
    const g = buildGoal(
      { name: "  Trip  ", target: "5000", deadline: "2026-12-31", icon: "plane" },
      NOW,
      "g1",
    );
    expect(g).toMatchObject({
      id: "g1",
      name: "Trip",
      target: "5000000000",
      status: "active",
      deadline: "2026-12-31",
      icon: "plane",
    });
    expect(g?.contributions).toEqual([]);
    expect(buildGoal({ name: "", target: "5000" }, NOW)).toBeNull();
    expect(buildGoal({ name: "x", target: "0" }, NOW)).toBeNull();
  });

  it("builds a contribution and rejects non-positive amounts", () => {
    const c = buildContribution({ amount: "10.5", note: " saved " }, NOW, "c1");
    expect(c).toMatchObject({ id: "c1", amount: "10500000", source: "manual", note: "saved" });
    expect(buildContribution({ amount: "0" }, NOW)).toBeNull();
    expect(buildContribution({ amount: "-3" }, NOW)).toBeNull();
  });
});

describe("achieve / reopen lifecycle", () => {
  it("sets achievedAt once when the ledger first reaches target", () => {
    let g = makeGoal();
    g = addContribution(g, buildContribution({ amount: "600" }, NOW, "c1") as never, NOW);
    expect(g.status).toBe("active");
    g = addContribution(g, buildContribution({ amount: "400" }, NOW, "c2") as never, NOW);
    expect(g.status).toBe("achieved");
    expect(g.achievedAt).toBe(NOW.toISOString());

    // logging more keeps achievedAt stable (idempotent)
    const later = new Date("2026-07-01T00:00:00Z");
    g = addContribution(g, buildContribution({ amount: "50" }, later, "c3") as never, later);
    expect(g.achievedAt).toBe(NOW.toISOString());
  });

  it("reopens (active, clears achievedAt) when an edit drops below target", () => {
    let g = makeGoal();
    g = addContribution(g, buildContribution({ amount: "1000" }, NOW, "c1") as never, NOW);
    expect(g.status).toBe("achieved");
    g = removeContribution(g, "c1", NOW);
    expect(g.status).toBe("active");
    expect(g.achievedAt).toBeUndefined();
    expect(g.contributions).toEqual([]);
  });

  it("editContribution recomputes status and rejects bad amounts", () => {
    let g = makeGoal();
    g = addContribution(g, buildContribution({ amount: "1000" }, NOW, "c1") as never, NOW);
    expect(g.status).toBe("achieved");
    const edited = editContribution(g, "c1", { amount: "500" }, NOW);
    expect(edited?.status).toBe("active");
    expect(edited?.contributions[0].amount).toBe("500000000");
    expect(editContribution(g, "c1", { amount: "0" }, NOW)).toBeNull();
  });
});

describe("editGoal / archive / restore", () => {
  it("edits fields immutably and reconciles (lowering target can achieve)", () => {
    let g = makeGoal();
    g = addContribution(g, buildContribution({ amount: "500" }, NOW, "c1") as never, NOW);
    const edited = editGoal(g, { target: "400", name: "Renamed" }, NOW);
    expect(edited?.name).toBe("Renamed");
    expect(edited?.target).toBe("400000000");
    expect(edited?.status).toBe("achieved");
    expect(editGoal(g, { target: "0" }, NOW)).toBeNull();
    expect(g.name).toBe("Laptop"); // original untouched
  });

  it("archive then restore re-derives status from the ledger", () => {
    let g = makeGoal();
    g = addContribution(g, buildContribution({ amount: "1000" }, NOW, "c1") as never, NOW);
    const archived = archiveGoal(g);
    expect(archived.status).toBe("archived");
    const restored = restoreGoal(archived, NOW);
    expect(restored.status).toBe("achieved");
  });
});
