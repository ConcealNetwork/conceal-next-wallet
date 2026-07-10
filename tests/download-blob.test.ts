import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerBlobDownload } from "@/lib/ui/download-blob";

vi.mock("@/lib/cordova/runtime", () => ({
  isCordovaShell: vi.fn(() => false),
}));

vi.mock("@/lib/cordova/export-blob", () => ({
  exportCordovaBlob: vi.fn(() => Promise.resolve()),
}));

import { exportCordovaBlob } from "@/lib/cordova/export-blob";
import { isCordovaShell } from "@/lib/cordova/runtime";

describe("triggerBlobDownload", () => {
  const original = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  };

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("uses an anchor click on web", async () => {
    vi.mocked(isCordovaShell).mockReturnValue(false);
    let captured: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return "blob:test";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await triggerBlobDownload("wallet.json", new Blob(['{"v":1}'], { type: "application/json" }));

    expect(captured?.type).toBe("application/json");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(exportCordovaBlob).not.toHaveBeenCalled();
  });

  it("delegates to native Cordova export on mobile shell", async () => {
    vi.mocked(isCordovaShell).mockReturnValue(true);
    const blob = new Blob(["{}"], { type: "application/json" });

    await triggerBlobDownload("wallet.json", blob);

    expect(exportCordovaBlob).toHaveBeenCalledWith("wallet.json", blob);
  });
});
