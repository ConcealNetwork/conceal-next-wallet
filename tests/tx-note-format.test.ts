import { describe, expect, it } from "vitest";
import { MAX_TX_NOTE_LENGTH, normalizeTxNote } from "@/lib/storage/tx-note-format";

describe("normalizeTxNote", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTxNote("  rent payment  ")).toBe("rent payment");
    expect(normalizeTxNote("\n\trefund\n")).toBe("refund");
  });

  it("treats empty / whitespace-only input as no note", () => {
    expect(normalizeTxNote("")).toBe("");
    expect(normalizeTxNote("   ")).toBe("");
    expect(normalizeTxNote("\n\t  ")).toBe("");
  });

  it("preserves interior whitespace and newlines", () => {
    expect(normalizeTxNote("line one\nline two")).toBe("line one\nline two");
  });

  it("clamps to the maximum length", () => {
    const long = "x".repeat(MAX_TX_NOTE_LENGTH + 50);
    expect(normalizeTxNote(long)).toHaveLength(MAX_TX_NOTE_LENGTH);
  });

  it("does not clamp input at or below the maximum", () => {
    const exact = "y".repeat(MAX_TX_NOTE_LENGTH);
    expect(normalizeTxNote(exact)).toBe(exact);
  });

  it("trims trailing whitespace exposed by the clamp", () => {
    const clamped = normalizeTxNote(`${"z".repeat(MAX_TX_NOTE_LENGTH - 1)}   tail`);
    expect(clamped).toBe("z".repeat(MAX_TX_NOTE_LENGTH - 1));
  });
});
