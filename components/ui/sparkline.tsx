import { cn } from "@/lib/utils";

/**
 * Shared sparkline (#194 dedup) — one normalize→points→SVG pipeline that previously lived as five
 * near-identical private copies (account/balance/market/rail/network). All five used the same
 * y-mapping `height - ((v-min)/range)*(height - 2·padding) - padding`; the network variant's
 * `chartPoints` (100×40, inset 4) is exactly this with `width=100 height=40 padding=4`, and its
 * `<path>` of `M/L` commands draws the identical line a `<polyline>` does — so they unify with no
 * visual change. Callers vary only by parametrised props (size, padding, colour, area fill,
 * stroke width, round caps, baseline, empty-state).
 *
 * Colour comes from `stroke` (default `currentColor`, so a `text-*` class on `className` drives it);
 * pass an explicit CSS colour for the network telemetry charts. With `<2` points there's no trend:
 * renders `emptyClassName` as a height placeholder if given, else nothing.
 */
export type SparklineProps = {
  values: number[];
  className?: string;
  /** viewBox width — internal coordinate space; actual size comes from `className` (preserveAspectRatio=none). */
  width?: number;
  /** viewBox height. */
  height?: number;
  /** Vertical inset (top and bottom) so the stroke isn't clipped. */
  padding?: number;
  strokeWidth?: number;
  /** Line colour. Default `currentColor` (set via a `text-*` class on `className`). */
  stroke?: string;
  roundCaps?: boolean;
  /** Render the filled area polygon under the line. */
  area?: boolean;
  areaFill?: string;
  /** Fade the area polygon in (the account hero's treatment). */
  animateArea?: boolean;
  /** Optional dashed horizontal reference line at this value (network telemetry). */
  baseline?: number;
  /** Placeholder height class rendered when there are <2 points; omit to render nothing. */
  emptyClassName?: string;
};

export function Sparkline({
  values,
  className,
  width = 240,
  height = 40,
  padding = 3,
  strokeWidth = 2,
  stroke = "currentColor",
  roundCaps = false,
  area = false,
  areaFill = "hsl(var(--primary) / 0.08)",
  animateArea = false,
  baseline,
  emptyClassName,
}: SparklineProps) {
  if (values.length < 2) {
    return emptyClassName ? <div className={emptyClassName} /> : null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const yFor = (value: number) =>
    height - ((value - min) / range) * (height - padding * 2) - padding;
  const points = values
    .map((value, index) => `${(index * step).toFixed(2)},${yFor(value).toFixed(2)}`)
    .join(" ");
  const baselineY = baseline !== undefined ? yFor(baseline) : null;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn(className)}
    >
      {baselineY !== null ? (
        <line
          x1="0"
          y1={baselineY}
          x2={width}
          y2={baselineY}
          stroke="hsl(var(--border))"
          strokeDasharray="3 4"
        />
      ) : null}
      {area ? (
        <polygon
          className={
            animateArea
              ? "animate-fade-in motion-reduce:animate-none motion-reduce:opacity-100"
              : undefined
          }
          points={`0,${height} ${points} ${width},${height}`}
          fill={areaFill}
        />
      ) : null}
      <polyline
        className="animate-stroke-draw motion-reduce:animate-none"
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={0}
        strokeLinecap={roundCaps ? "round" : undefined}
        strokeLinejoin={roundCaps ? "round" : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
