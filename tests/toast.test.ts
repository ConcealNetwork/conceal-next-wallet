import { afterEach, describe, expect, it, vi } from "vitest";

// Mock sonner so we can assert the helper's variant-duration defaults without
// rendering a real Toaster.
const calls: Record<string, unknown[]> = {};
vi.mock("sonner", () => {
  const make =
    (name: string) =>
    (...args: unknown[]) => {
      calls[name] = args;
      return 1;
    };
  const toast = Object.assign(make("base"), {
    success: make("success"),
    error: make("error"),
    info: make("info"),
    warning: make("warning"),
    message: make("message"),
    loading: make("loading"),
    promise: make("promise"),
    custom: make("custom"),
    dismiss: make("dismiss"),
  });
  return { toast };
});

import { toast } from "@/lib/ui/toast";

afterEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
});

describe("toast helper (#120)", () => {
  it("applies per-variant default durations (errors linger, success quick)", () => {
    toast.success("ok");
    toast.error("bad");
    toast.info("fyi");
    toast.warning("careful");
    expect(calls.success).toEqual(["ok", { duration: 4000 }]);
    expect(calls.error).toEqual(["bad", { duration: 8000 }]);
    expect(calls.info).toEqual(["fyi", { duration: 5000 }]);
    expect(calls.warning).toEqual(["careful", { duration: 6000 }]);
  });

  it("lets a per-call duration override the variant default", () => {
    toast.error("sticky", { duration: Number.POSITIVE_INFINITY });
    expect(calls.error).toEqual(["sticky", { duration: Number.POSITIVE_INFINITY }]);
  });

  it("preserves other per-call options alongside the default duration", () => {
    toast.success("done", { description: "saved" });
    expect(calls.success).toEqual(["done", { duration: 4000, description: "saved" }]);
  });

  it("is callable directly and exposes pass-through methods", () => {
    toast("plain", { duration: 1000 });
    expect(calls.base).toEqual(["plain", { duration: 1000 }]);
    toast.dismiss();
    expect(calls.dismiss).toBeDefined();
  });
});
