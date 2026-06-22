import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sparkline } from "@/components/ui/sparkline";

// Locks the shared Sparkline contract (#194 dedup) so a future refactor of this one primitive
// can't silently regress the five screens that render it.
afterEach(cleanup);

describe("Sparkline", () => {
  it("renders nothing with <2 points and no emptyClassName", () => {
    const { container } = render(<Sparkline values={[5]} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("renders a height placeholder with <2 points and an emptyClassName", () => {
    const { container } = render(<Sparkline values={[]} emptyClassName="h-9" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("div.h-9")).not.toBeNull();
  });

  it("maps values to the documented y-formula `height - ((v-min)/range)*(height-2·padding) - padding`", () => {
    const { container } = render(
      <Sparkline values={[0, 10]} width={100} height={40} padding={4} />,
    );
    // step = 100/(2-1) = 100; y(0)=40-0-4=36; y(10)=40-32-4=4
    expect(container.querySelector("polyline")?.getAttribute("points")).toBe(
      "0.00,36.00 100.00,4.00",
    );
  });

  it("renders the area polygon only when `area` is set", () => {
    const withArea = render(<Sparkline values={[1, 2, 3]} area />);
    expect(withArea.container.querySelector("polygon")).not.toBeNull();
    cleanup();
    const without = render(<Sparkline values={[1, 2, 3]} />);
    expect(without.container.querySelector("polygon")).toBeNull();
  });

  it("renders a dashed baseline line at the value's y position", () => {
    const { container } = render(
      <Sparkline values={[0, 10]} width={100} height={40} padding={4} baseline={5} />,
    );
    const line = container.querySelector("line");
    expect(line).not.toBeNull();
    // y(5) = 40 - (5/10)*32 - 4 = 20
    expect(line?.getAttribute("y1")).toBe("20");
    expect(line?.getAttribute("stroke-dasharray")).toBe("3 4");
  });

  it("applies round caps and an explicit stroke colour when asked", () => {
    const { container } = render(
      <Sparkline values={[1, 2, 3]} roundCaps stroke="hsl(var(--chart-2))" strokeWidth={1.6} />,
    );
    const line = container.querySelector("polyline");
    expect(line?.getAttribute("stroke-linecap")).toBe("round");
    expect(line?.getAttribute("stroke")).toBe("hsl(var(--chart-2))");
    expect(line?.getAttribute("stroke-width")).toBe("1.6");
  });

  it("defaults to currentColor with butt caps", () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} />);
    const line = container.querySelector("polyline");
    expect(line?.getAttribute("stroke")).toBe("currentColor");
    expect(line?.getAttribute("stroke-linecap")).toBeNull();
  });
});
