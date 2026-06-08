import { describe, expect, it } from "vitest";
import {
  formatPoolUptimeForNodeUrl,
  formatSmartNodeUptime,
} from "@/lib/network/format-pool-uptime";
import { nodeUrlToPoolHost, poolEntryMatchesNodeUrl } from "@/lib/network/smart-nodes";
import type { SmartNode } from "@/lib/types";

describe("pool host matching", () => {
  it("matches wallet daemon URL to pool url.host", () => {
    expect(
      poolEntryMatchesNodeUrl(
        { id: "1", name: "Explorer", url: { host: "explorer.conceal.network/daemon", port: "" } },
        "https://explorer.conceal.network/daemon/",
      ),
    ).toBe(true);
    expect(nodeUrlToPoolHost("https://ccxapi.conceal.network/daemon/")).toBe(
      "ccxapi.conceal.network/daemon",
    );
  });
});

describe("formatSmartNodeUptime", () => {
  it("formats duration from pool status.startTime", () => {
    const start = new Date(Date.now() - 3 * 3600 * 1000 - 15 * 60 * 1000).toISOString();
    const node: SmartNode = {
      id: "1",
      name: "Explorer",
      url: "https://explorer.conceal.network/daemon/",
      poolHost: "explorer.conceal.network/daemon",
      poolStartTime: start,
    };
    expect(formatSmartNodeUptime(node)).toBe("3h 15m");
  });

  it("falls back to pool status.uptime percent", () => {
    const node: SmartNode = {
      id: "1",
      name: "Explorer",
      url: "https://explorer.conceal.network/daemon/",
      poolHost: "explorer.conceal.network/daemon",
      poolUptimePercent: 99.4,
    };
    expect(formatSmartNodeUptime(node)).toBe("99%");
  });

  it("returns em dash when node is missing", () => {
    expect(formatSmartNodeUptime(undefined)).toBe("—");
  });
});

describe("formatPoolUptimeForNodeUrl", () => {
  it("finds the list entry by url.host and computes uptime", () => {
    const start = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const nodes: SmartNode[] = [
      {
        id: "a",
        name: "Other",
        url: "https://other.example/",
        poolHost: "other.example",
      },
      {
        id: "b",
        name: "Explorer",
        url: "https://explorer.conceal.network/daemon/",
        poolHost: "explorer.conceal.network/daemon",
        poolStartTime: start,
      },
    ];
    expect(formatPoolUptimeForNodeUrl(nodes, "https://explorer.conceal.network/daemon/")).toBe(
      "2h 0m",
    );
  });
});
