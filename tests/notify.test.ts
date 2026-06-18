import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canNotify,
  getPermission,
  isNotificationSupported,
  isOptedIn,
  notify,
  requestNotificationPermission,
  selectNewKeys,
  setOptedIn,
} from "@/lib/notifications/notify";

/**
 * The jsdom env doesn't ship a Notification API, so these tests install and
 * tear down fakes per case. The key guarantees: every entry point is
 * feature-detected, opt-in is independent of OS permission, and notify() is a
 * silent no-op (never throws) when unsupported or not granted.
 */

type NotificationMock = ReturnType<typeof vi.fn> & {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
};

function installNotification(
  permission: NotificationPermission,
  requestResult: NotificationPermission = permission,
): NotificationMock {
  const ctor = vi.fn() as unknown as NotificationMock;
  ctor.permission = permission;
  ctor.requestPermission = vi.fn(async () => requestResult);
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    writable: true,
    value: ctor,
  });
  return ctor;
}

function removeNotification(): void {
  Reflect.deleteProperty(globalThis as Record<string, unknown>, "Notification");
}

afterEach(() => {
  removeNotification();
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, "serviceWorker");
  setOptedIn(false);
  vi.restoreAllMocks();
});

describe("feature detection", () => {
  it("isNotificationSupported is false when the API is absent", () => {
    removeNotification();
    expect(isNotificationSupported()).toBe(false);
    expect(getPermission()).toBe("unsupported");
    expect(canNotify()).toBe(false);
  });

  it("reflects the live permission when supported (and opted in)", () => {
    setOptedIn(true); // canNotify requires opt-in too; isolate the permission axis here
    installNotification("granted");
    expect(isNotificationSupported()).toBe(true);
    expect(getPermission()).toBe("granted");
    expect(canNotify()).toBe(true);

    installNotification("denied");
    expect(getPermission()).toBe("denied");
    expect(canNotify()).toBe(false);
  });
});

describe("opt-in persistence (independent of permission)", () => {
  beforeEach(() => localStorage.clear());

  it("defaults off and round-trips", () => {
    expect(isOptedIn()).toBe(false);
    setOptedIn(true);
    expect(isOptedIn()).toBe(true);
    setOptedIn(false);
    expect(isOptedIn()).toBe(false);
  });
});

describe("requestNotificationPermission", () => {
  it("returns 'unsupported' and never throws when the API is absent", async () => {
    removeNotification();
    await expect(requestNotificationPermission()).resolves.toBe("unsupported");
  });

  it("resolves to the granted result from a user gesture", async () => {
    installNotification("default", "granted");
    await expect(requestNotificationPermission()).resolves.toBe("granted");
  });

  it("swallows a throwing requestPermission and falls back to current permission", async () => {
    const ctor = installNotification("denied");
    ctor.requestPermission = vi.fn(() => {
      throw new Error("boom");
    });
    await expect(requestNotificationPermission()).resolves.toBe("denied");
  });
});

describe("notify()", () => {
  // notify() requires BOTH opt-in and granted permission — opt in for the
  // granted-path cases (the opt-out case overrides below).
  beforeEach(() => setOptedIn(true));

  it("is a no-op when unsupported (never throws, never constructs)", async () => {
    removeNotification();
    await expect(notify("hi")).resolves.toBeUndefined();
  });

  it("is a no-op when permission is not granted", async () => {
    const ctor = installNotification("default");
    await notify("hi");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("is a no-op when granted but not opted in (strict opt-in)", async () => {
    setOptedIn(false);
    const ctor = installNotification("granted");
    await notify("hi");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("falls back to the Notification constructor when no SW registration", async () => {
    const ctor = installNotification("granted");
    await notify("Title", { body: "Body" });
    expect(ctor).toHaveBeenCalledWith("Title", { body: "Body" });
  });

  it("prefers the service-worker registration when available", async () => {
    installNotification("granted");
    const showNotification = vi.fn(async () => {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      writable: true,
      value: { ready: Promise.resolve({ showNotification }) },
    });
    await notify("SW Title", { body: "via SW" });
    expect(showNotification).toHaveBeenCalledWith("SW Title", { body: "via SW" });
  });

  it("does not throw when the constructor throws", async () => {
    const ctor = installNotification("granted");
    (ctor as unknown as { mockImplementation: (f: () => void) => void }).mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(notify("hi")).resolves.toBeUndefined();
  });
});

describe("selectNewKeys (pure de-dupe for visibility re-check)", () => {
  it("returns only keys not already announced, de-duping within the input", () => {
    const announced = new Set(["a@1"]);
    expect(selectNewKeys(["a@1", "b@2", "b@2", "c@3"], announced)).toEqual(["b@2", "c@3"]);
  });

  it("returns nothing when everything is already announced (no re-alert on re-check)", () => {
    const announced = new Set(["a@1", "b@2"]);
    expect(selectNewKeys(["a@1", "b@2"], announced)).toEqual([]);
  });

  it("surfaces a fresh key after the underlying instance advances", () => {
    const announced = new Set(["s1@2026-02-28"]);
    // The schedule advanced → its key changed → it's new again.
    expect(selectNewKeys(["s1@2026-03-31"], announced)).toEqual(["s1@2026-03-31"]);
  });
});
