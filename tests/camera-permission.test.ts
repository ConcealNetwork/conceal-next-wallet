import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureCameraPermissionForCordova } from "@/lib/cordova/camera-permission";

describe("ensureCameraPermissionForCordova", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      cordova: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when not on Cordova Android", async () => {
    await expect(ensureCameraPermissionForCordova()).resolves.toBe(true);
  });

  it("returns true when camera permission is already granted", async () => {
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
});
