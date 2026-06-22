// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusCreateField } from "@/lib/hooks/use-create-deeplink";

// Locks the scroll+focus contract the sidebar quick-create deep-link depends on (#192): clicking
// the sidebar "+" on Scheduled / Check-ins must land focus on the add form's first field.
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("focusCreateField", () => {
  it("scrolls the element with the given id into view and focuses it", () => {
    const input = document.createElement("input");
    input.id = "target";
    // jsdom doesn't implement scrollIntoView — stub it so the helper can call it.
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    document.body.appendChild(input);

    focusCreateField("target");

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(document.activeElement).toBe(input);
  });

  it("no-ops without throwing when no element has the id", () => {
    expect(() => focusCreateField("does-not-exist")).not.toThrow();
  });
});
