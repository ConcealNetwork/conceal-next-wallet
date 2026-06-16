import { describe, expect, it } from "vitest";
import {
  evaluateStorageHealth,
  STORAGE_LOW_SPACE_RATIO,
  type StorageHealthInput,
} from "@/lib/ui/storage-health";

function input(overrides: Partial<StorageHealthInput> = {}): StorageHealthInput {
  return { persisted: true, usage: 0, quota: 1_000_000, ...overrides };
}

describe("evaluateStorageHealth", () => {
  it("is healthy when persisted and well under quota", () => {
    expect(evaluateStorageHealth(input({ usage: 100_000 }))).toBe("none");
  });

  it("warns when durable storage was not granted", () => {
    expect(evaluateStorageHealth(input({ persisted: false, usage: 100_000 }))).toBe(
      "not-persisted",
    );
  });

  it("warns when usage crosses the low-space ratio AND free space is genuinely low", () => {
    const quota = 1_000_000; // small quota → 85% used leaves only 150 KB free
    expect(
      evaluateStorageHealth(input({ quota, usage: Math.ceil(quota * STORAGE_LOW_SPACE_RATIO) })),
    ).toBe("low-space");
  });

  it("does NOT warn at a high ratio when the disk is large (plenty of free space)", () => {
    // 90% of 100 GB still leaves ~10 GB free — not a low-space situation.
    const quota = 100 * 1024 * 1024 * 1024;
    expect(evaluateStorageHealth({ persisted: true, quota, usage: quota * 0.9 })).toBe("none");
    // …and the not-persisted warning still applies on a roomy disk.
    expect(evaluateStorageHealth({ persisted: false, quota, usage: quota * 0.9 })).toBe(
      "not-persisted",
    );
  });

  it("stays healthy just below the low-space ratio", () => {
    const quota = 1_000_000;
    expect(
      evaluateStorageHealth(
        input({ quota, usage: Math.floor(quota * STORAGE_LOW_SPACE_RATIO) - 1 }),
      ),
    ).toBe("none");
  });

  it("prioritizes low-space over not-persisted", () => {
    const quota = 1_000_000;
    expect(evaluateStorageHealth({ persisted: false, quota, usage: quota })).toBe("low-space");
  });

  it("ignores the ratio when the quota is unknown (0)", () => {
    expect(evaluateStorageHealth(input({ quota: 0, usage: 5_000, persisted: true }))).toBe("none");
    expect(evaluateStorageHealth(input({ quota: 0, usage: 5_000, persisted: false }))).toBe(
      "not-persisted",
    );
  });
});
