import { describe, expect, it } from "vitest";
import { poolStartSec, poolStartSecForUrl } from "@/lib/network/pool-node-uptime";
import type { SmartNode } from "@/lib/types";

describe("poolStartSec", () => {
  it("parses pool status.startTime ISO strings", () => {
    const node: SmartNode = {
      id: "1",
      name: "Explorer",
      url: "https://explorer.conceal.network/daemon/",
      poolHost: "explorer.conceal.network/daemon",
      poolStartTime: "2026-07-28T04:10:21.314Z",
    };
    expect(poolStartSec(node)).toBe(Math.floor(Date.parse("2026-07-28T04:10:21.314Z") / 1000));
  });

  it("matches connected node URL to pool host", () => {
    const nodes: SmartNode[] = [
      {
        id: "1",
        name: "Explorer",
        url: "https://explorer.conceal.network/daemon/",
        poolHost: "explorer.conceal.network/daemon",
        poolStartTime: "2026-07-28T04:10:21.314Z",
      },
    ];
    expect(poolStartSecForUrl(nodes, "https://explorer.conceal.network/daemon/")).toBe(
      poolStartSec(nodes[0]),
    );
  });
});
