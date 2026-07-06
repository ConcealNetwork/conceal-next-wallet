import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrCameraScanner } from "@/components/qr/qr-camera-scanner";

vi.mock("@/lib/cordova/camera-permission", () => ({
  ensureCameraPermissionForCordova: vi.fn(async () => true),
}));

const stop = vi.fn();
const getUserMedia = vi.fn();

describe("QrCameraScanner", () => {
  beforeEach(() => {
    stop.mockReset();
    getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    // jsdom doesn't implement HTMLMediaElement.play.
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("stops the camera stream when unmounted (no leaked camera)", async () => {
    let unmount = () => {};
    await act(async () => {
      ({ unmount } = render(<QrCameraScanner onDecode={vi.fn()} onCancel={vi.fn()} />));
    });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await act(async () => {
      unmount();
    });
    expect(stop).toHaveBeenCalled();
  });

  it("shows an error when the camera is unavailable, without crashing", async () => {
    getUserMedia.mockRejectedValue(new Error("denied"));
    let container: HTMLElement | null = null;
    await act(async () => {
      ({ container } = render(<QrCameraScanner onDecode={vi.fn()} onCancel={vi.fn()} />));
    });
    await waitFor(() =>
      expect(container?.textContent ?? "").toMatch(/Couldn't access the camera/i),
    );
  });
});
