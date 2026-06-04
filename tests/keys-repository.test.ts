import { describe, expect, it } from "vitest";
import { analyzeKeysShape } from "@/lib/wallet-core/keys-normalize";

describe("keys normalization", () => {
  it("returns invalid for missing keys", () => {
    expect(analyzeKeysShape(null)).toEqual({ kind: "invalid" });
    expect(analyzeKeysShape(undefined)).toEqual({ kind: "invalid" });
  });

  it("accepts full UserKeys shape", () => {
    const keys = {
      priv: { spend: "aa", view: "bb" },
      pub: { spend: "cc", view: "dd" },
    };
    expect(analyzeKeysShape(keys)).toEqual({ kind: "ready", keys });
  });

  it("requests pub derivation when priv is present but pub is empty", () => {
    expect(
      analyzeKeysShape({
        priv: { spend: "aa", view: "bb" },
        pub: { spend: "", view: "" },
      }),
    ).toEqual({ kind: "derive_pub", spend: "aa", view: "bb" });
  });

  it("accepts Cn-style spend/view objects", () => {
    expect(
      analyzeKeysShape({
        spend: { sec: "aa", pub: "cc" },
        view: { sec: "bb", pub: "dd" },
      }),
    ).toEqual({ kind: "derive_pub", spend: "aa", view: "bb" });
  });
});
