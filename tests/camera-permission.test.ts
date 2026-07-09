import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureCameraPermissionForCordova } from "@/lib/cordova/camera-permission";

function mockCordovaScriptInDom() {
  vi.spyOn(document, "querySelector").mockImplementation((selector: string) =>
    selector.includes("cordova.js") ? ({} as Element) : null,
  );
}

describe("ensureCameraPermissionForCordova", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns true when not on Cordova Android", async () => {
    vi.stubGlobal("window", { cordova: undefined });
    await expect(ensureCameraPermissionForCordova()).resolves.toBe(true);
  });

  it("returns true when camera permission is already granted", async () => {
    mockCordovaScriptInDom();
    const checkPermission = vi.fn((_perm: string, ok: (s: { hasPermission: boolean }) => void) => {
      ok({ hasPermission: true });
    });
    vi.stubGlobal("window", {
      cordova: {
        platformId: "android",
        plugins: {
          permissions: {
            CAMERA: "android.permission.CAMERA",
            checkPermission,
            requestPermission: vi.fn(),
          },
        },
      },
    });

    await expect(ensureCameraPermissionForCordova()).resolves.toBe(true);
    expect(checkPermission).toHaveBeenCalledWith(
      "android.permission.CAMERA",
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("requests permission when not yet granted", async () => {
    mockCordovaScriptInDom();
    const checkPermission = vi.fn((_perm: string, ok: (s: { hasPermission: boolean }) => void) => {
      ok({ hasPermission: false });
    });
    const requestPermission = vi.fn(
      (_perm: string, ok: (s: { hasPermission: boolean }) => void) => {
        ok({ hasPermission: true });
      },
    );
    vi.stubGlobal("window", {
      cordova: {
        platformId: "android",
        plugins: {
          permissions: {
            CAMERA: "android.permission.CAMERA",
            checkPermission,
            requestPermission,
          },
        },
      },
    });

    await expect(ensureCameraPermissionForCordova()).resolves.toBe(true);
    expect(requestPermission).toHaveBeenCalled();
  });

  it("returns false when the user denies the permission dialog", async () => {
    mockCordovaScriptInDom();
    const checkPermission = vi.fn((_perm: string, ok: (s: { hasPermission: boolean }) => void) => {
      ok({ hasPermission: false });
    });
    const requestPermission = vi.fn(
      (_perm: string, ok: (s: { hasPermission: boolean }) => void) => {
        ok({ hasPermission: false });
      },
    );
    vi.stubGlobal("window", {
      cordova: {
        platformId: "android",
        plugins: {
          permissions: {
            CAMERA: "android.permission.CAMERA",
            checkPermission,
            requestPermission,
          },
        },
      },
    });

    await expect(ensureCameraPermissionForCordova()).resolves.toBe(false);
  });

  it("waits for deviceready before requesting permission", async () => {
    mockCordovaScriptInDom();
    const checkPermission = vi.fn((_perm: string, ok: (s: { hasPermission: boolean }) => void) => {
      ok({ hasPermission: true });
    });
    vi.stubGlobal("window", { cordova: {} });

    const pending = ensureCameraPermissionForCordova();
    (window as Window & { cordova?: unknown }).cordova = {
      platformId: "android",
      plugins: {
        permissions: {
          CAMERA: "android.permission.CAMERA",
          checkPermission,
          requestPermission: vi.fn(),
        },
      },
    };
    document.dispatchEvent(new Event("deviceready"));

    await expect(pending).resolves.toBe(true);
    expect(checkPermission).toHaveBeenCalled();
  });
});
