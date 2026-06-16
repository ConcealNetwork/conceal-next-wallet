import { describe, expect, it } from "vitest";
import { qrModuleMatrix, qrPngFilename } from "@/lib/ui/qr-png";

describe("qrModuleMatrix", () => {
  it("returns a square boolean matrix with the standard finder patterns", () => {
    const matrix = qrModuleMatrix("ccx7test");
    const n = matrix.length;
    expect(n).toBeGreaterThanOrEqual(21); // version 1 is 21×21
    expect((n - 17) % 4).toBe(0); // valid QR dimension: 17 + 4·version
    for (const row of matrix) expect(row).toHaveLength(n);

    // Top-left finder: 7×7 dark border, light ring, 3×3 dark core.
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][6]).toBe(true);
    expect(matrix[1][1]).toBe(false);
    expect(matrix[3][3]).toBe(true);
  });

  it("encodes distinct inputs into distinct matrices", () => {
    const a = JSON.stringify(qrModuleMatrix("ccx7aaa"));
    const b = JSON.stringify(qrModuleMatrix("ccx7bbb"));
    expect(a).not.toBe(b);
  });

  it("is deterministic for the same input", () => {
    expect(JSON.stringify(qrModuleMatrix("conceal"))).toBe(
      JSON.stringify(qrModuleMatrix("conceal")),
    );
  });
});

describe("qrPngFilename", () => {
  it("builds a sanitized .png filename", () => {
    expect(qrPngFilename("ccx7AbCd1234")).toBe("conceal-qr-ccx7abcd1234.png");
  });

  it("strips unsafe characters", () => {
    expect(qrPngFilename("ccx7/../weird!!")).toBe("conceal-qr-ccx7-weird.png");
  });

  it("clamps the label to 16 characters", () => {
    expect(qrPngFilename("ccx7verylonglabelhere")).toBe("conceal-qr-ccx7verylonglabe.png");
  });

  it("does not leave a trailing dash when the clamp lands on a separator", () => {
    // 16th char is a dash → must be trimmed off after the slice.
    expect(qrPngFilename("abcdefghijklmno pqr")).toBe("conceal-qr-abcdefghijklmno.png");
  });

  it("falls back to a bare name when the label is empty", () => {
    expect(qrPngFilename("")).toBe("conceal-qr.png");
    expect(qrPngFilename("!!!")).toBe("conceal-qr.png");
  });
});
