import { describe, expect, it } from "vitest"
import { clampImportHeight } from "@/lib/wallet-core/mappers"

describe("wallet mappers", () => {
  it("clamps import height like v1", () => {
    expect(clampImportHeight(0, 1000)).toBe(0)
    expect(clampImportHeight(500, 1000)).toBe(490)
    expect(clampImportHeight(2000, 1000)).toBe(989)
  })
})
