import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsvFile, transactionCsvFilename } from "@/lib/ui/download-csv-file";

describe("transactionCsvFilename", () => {
  const date = new Date("2026-06-16T12:00:00.000Z");

  it("omits the slug for the All filter", () => {
    expect(transactionCsvFilename("All", date)).toBe("conceal-transactions-2026-06-16.csv");
  });

  it("encodes the active filter as a slug", () => {
    expect(transactionCsvFilename("Sent", date)).toBe("conceal-transactions-sent-2026-06-16.csv");
    expect(transactionCsvFilename("Deposits", date)).toBe(
      "conceal-transactions-deposits-2026-06-16.csv",
    );
  });
});

describe("downloadCsvFile", () => {
  const original = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  };

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    vi.restoreAllMocks();
  });

  it("builds a text/csv blob led with a UTF-8 BOM", async () => {
    let captured: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return "blob:test";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadCsvFile("conceal-transactions-2026-06-16.csv", "Date\r\n");

    expect(captured?.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array((await captured?.arrayBuffer()) ?? new ArrayBuffer(0));
    // Leading UTF-8 BOM (EF BB BF) so Excel decodes UTF-8 correctly.
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("Date\r\n");
  });
});
