 import { describe, expect, it } from "vitest";
import { backupDownloadFilename, sanitizeBackupFilename } from "@/lib/ui/download-json-file";

describe("download-json-file", () => {
  it("sanitizes backup filename stems", () => {
    expect(sanitizeBackupFilename("wallet")).toBe("wallet");
    expect(sanitizeBackupFilename(" my backup ")).toBe("my-backup");
    expect(sanitizeBackupFilename("")).toBe("wallet");
  });

  it("adds .json extension once", () => {
    expect(backupDownloadFilename("wallet")).toBe("wallet.json");
    expect(backupDownloadFilename("wallet.json")).toBe("wallet.json");
  });
});
