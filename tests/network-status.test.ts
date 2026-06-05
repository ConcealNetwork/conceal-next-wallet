import { describe, expect, it } from "vitest";
import {
  CURATED_POOL_LIST_QUERY,
  getCuratedPoolListUrl,
  PUBLIC_NODES_POOL_BASE,
} from "@/lib/config/config";
import { formatNodeVersion } from "@/lib/network/format-node-version";

describe("formatNodeVersion", () => {
  it("prefixes bare semver from getinfo", () => {
    expect(formatNodeVersion("6.7.4")).toBe("v6.7.4");
  });

  it("strips Conceal Core prefix from legacy mock strings", () => {
    expect(formatNodeVersion("Conceal Core 6.9.2")).toBe("v6.9.2");
  });

  it("returns em dash for empty values", () => {
    expect(formatNodeVersion("")).toBe("—");
  });
});

describe("curated smart nodes pool", () => {
  it("builds the pool list URL from config (SSL + fee address + reachable)", () => {
    expect(getCuratedPoolListUrl(PUBLIC_NODES_POOL_BASE)).toBe(
      "https://explorer.conceal.network/pool/list?hasFeeAddr=true&isReachable=true&hasSSL=true",
    );
    expect(CURATED_POOL_LIST_QUERY).toBe("hasFeeAddr=true&isReachable=true&hasSSL=true");
  });
});
