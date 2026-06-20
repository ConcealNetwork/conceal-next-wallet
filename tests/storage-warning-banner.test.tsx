import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Storage-warning banner: the not-persisted case must offer a "Keep on this device"
// action that requests durable storage from the click and re-probes health (#storage).

const {
  useStorageHealth,
  requestPersistentStorage,
  invalidateQueries,
  toastSuccess,
  toastInfo,
  useInstallPrompt,
} = vi.hoisted(() => ({
  useStorageHealth: vi.fn(),
  requestPersistentStorage: vi.fn(),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  useInstallPrompt: vi.fn(),
}));
vi.mock("@/lib/hooks/use-storage-health", () => ({ useStorageHealth, requestPersistentStorage }));
vi.mock("@/lib/hooks/query-provider", () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock("@/lib/hooks/use-install-prompt", () => ({ useInstallPrompt }));
vi.mock("next/navigation", () => ({ usePathname: () => "/wallet/account" }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, info: toastInfo } }));

import { StorageWarningBanner } from "@/components/wallet/storage-warning-banner";

describe("StorageWarningBanner — request persistent storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInstallPrompt.mockReturnValue({
      canInstall: false,
      isStandalone: false,
      isIOS: false,
      promptInstall: vi.fn().mockResolvedValue(false),
    });
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
  afterEach(cleanup);

  it("offers 'Keep on this device' only when storage is not persisted", () => {
    useStorageHealth.mockReturnValue({ data: "not-persisted" });
    render(<StorageWarningBanner />);
    expect(screen.getByRole("button", { name: /keep on this device/i })).toBeInTheDocument();
  });

  it("does NOT offer it for the low-space case (persist can't fix quota)", () => {
    useStorageHealth.mockReturnValue({ data: "low-space" });
    render(<StorageWarningBanner />);
    expect(screen.queryByRole("button", { name: /keep on this device/i })).toBeNull();
    expect(screen.getByRole("link", { name: /back up now/i })).toBeInTheDocument();
  });

  it("requests persistence on click, re-probes, and confirms on a grant", async () => {
    useStorageHealth.mockReturnValue({ data: "not-persisted" });
    requestPersistentStorage.mockResolvedValue(true);
    render(<StorageWarningBanner />);

    fireEvent.click(screen.getByRole("button", { name: /keep on this device/i }));

    await waitFor(() => expect(requestPersistentStorage).toHaveBeenCalledTimes(1));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["storage-health"] });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("explains the fallback (back up) when the browser denies the request", async () => {
    useStorageHealth.mockReturnValue({ data: "not-persisted" });
    requestPersistentStorage.mockResolvedValue(false);
    render(<StorageWarningBanner />);

    fireEvent.click(screen.getByRole("button", { name: /keep on this device/i }));

    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
