import { describe, expect, it } from "vitest";
import {
  getNodeUrlFormatHints,
  normalizeNodeUrl,
  validateNodeUrlFormat,
} from "@/lib/validation/node-url";

describe("node URL validation", () => {
  it("normalizes a trailing slash", () => {
    expect(normalizeNodeUrl("https://explorer.conceal.network/daemon")).toBe(
      "https://explorer.conceal.network/daemon/",
    );
  });

  it("returns format hints for https and slash", () => {
    expect(getNodeUrlFormatHints("http://node.example/daemon")).toEqual([
      "URL must start with https://",
      "Add a trailing slash (/) at the end, e.g. …/daemon/",
    ]);
    expect(getNodeUrlFormatHints("https://explorer.conceal.network/daemon/")).toEqual([]);
  });

  it("rejects non-https URLs on apply", () => {
    const result = validateNodeUrlFormat("http://explorer.conceal.network/daemon/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("URL must start with https://");
    }
  });

  it("accepts https URLs and normalizes slash", () => {
    const result = validateNodeUrlFormat("https://explorer.conceal.network/daemon");
    expect(result).toEqual({
      ok: true,
      normalized: "https://explorer.conceal.network/daemon/",
    });
  });
});
