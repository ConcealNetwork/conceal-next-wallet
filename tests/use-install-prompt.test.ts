import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstallPrompt } from "@/lib/hooks/use-install-prompt";

// Build a fake `beforeinstallprompt` event with the surface the hook uses.
function makePromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt");
  const prompt = vi.fn().mockResolvedValue(undefined);
  const userChoice = Promise.resolve({ outcome });
  Object.assign(event, { prompt, userChoice });
  return {
    event,
    prompt,
    userChoice,
  } as const;
}

describe("useInstallPrompt", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // jsdom doesn't implement matchMedia — start each test without it so the
    // hook's "no matchMedia" guard path is the default.
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    cleanup();
  });

  function installMatchMedia(matches: (query: string) => boolean) {
    window.matchMedia = ((query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  it("is inert until the browser fires beforeinstallprompt", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
    expect(result.current.isStandalone).toBe(false);
    expect(result.current.isIOS).toBe(false);
  });

  it("sets canInstall when beforeinstallprompt fires", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);

    act(() => {
      window.dispatchEvent(makePromptEvent().event);
    });

    expect(result.current.canInstall).toBe(true);
  });

  it("promptInstall triggers the browser prompt and returns true on accept", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event, prompt } = makePromptEvent("accepted");
    act(() => {
      window.dispatchEvent(event);
    });

    let accepted = true; // initialize non-false to prove the await set it
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it("promptInstall returns false when the user dismisses", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event, prompt } = makePromptEvent("dismissed");
    act(() => {
      window.dispatchEvent(event);
    });

    let accepted = true;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(false);
  });

  it("promptInstall returns false when no event was stashed", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    let accepted = true;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });
    expect(accepted).toBe(false);
  });

  it("appinstalled clears a stashed event (canInstall -> false)", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(makePromptEvent().event);
    });
    expect(result.current.canInstall).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current.canInstall).toBe(false);
  });

  it("detects standalone via the (display-mode: standalone) matchMedia query", () => {
    installMatchMedia((query) => query === "(display-mode: standalone)");
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isStandalone).toBe(true);
  });

  it("is not standalone when the matchMedia query doesn't match", () => {
    installMatchMedia(() => false);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isStandalone).toBe(false);
  });
});
