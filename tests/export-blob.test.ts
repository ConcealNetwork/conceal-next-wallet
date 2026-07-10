import { afterEach, describe, expect, it, vi } from "vitest";
import { exportCordovaBlob } from "@/lib/cordova/export-blob";

vi.mock("@/lib/cordova/runtime", () => ({
  isCordovaShell: vi.fn(() => true),
  whenCordovaReady: vi.fn(() => Promise.resolve()),
}));

describe("exportCordovaBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens the native save dialog (SAF) with the blob", async () => {
    const saveFile = vi.fn(() => Promise.resolve("content://saved/wallet.json"));
    vi.stubGlobal("window", {
      cordova: { plugins: { saveDialog: { saveFile } } },
    });

    const blob = new Blob(['{"v":1}'], { type: "application/json" });
    await exportCordovaBlob("wallet.json", blob);

    expect(saveFile).toHaveBeenCalledWith(blob, "wallet.json");
  });

  it("rejects when the user cancels the save dialog", async () => {
    const saveFile = vi.fn(() => Promise.reject(new Error("User canceled")));
    vi.stubGlobal("window", {
      cordova: { plugins: { saveDialog: { saveFile } } },
    });

    await expect(
      exportCordovaBlob("wallet.json", new Blob(["{}"], { type: "application/json" })),
    ).rejects.toThrow("Export cancelled.");
  });

  it("rejects when save-dialog plugin is missing", async () => {
    vi.stubGlobal("window", { cordova: { plugins: {} } });

    await expect(
      exportCordovaBlob("wallet.json", new Blob(["{}"], { type: "application/json" })),
    ).rejects.toThrow("cordova-plugin-save-dialog");
  });
});
