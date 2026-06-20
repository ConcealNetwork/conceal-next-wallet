/**
 * Single source of truth for the app's data-visualization motion. Amounts and
 * charts share one timing language so every number that counts up and every
 * chart that draws in settles over the same window with the same easing.
 *
 * The CSS counterparts live in `app/globals.css` (`@utility animate-stroke-draw`,
 * `animate-scale-x-in`, `animate-donut-sweep`) and MUST stay in sync with
 * `CHART_DRAW_MS` / `CHART_EASING` below — CSS can't import these constants, so
 * the duration is duplicated there with a comment pointing back here.
 *
 * Everything is gated on `prefers-reduced-motion` at the point of use (the CSS
 * utilities via a media query; the recharts charts via `usePrefersReducedMotion`).
 */

/** Count-up duration for animated amounts (`useCountUp` default). */
export const AMOUNT_COUNT_UP_MS = 700;

/** Draw-in duration for charts (recharts series + the CSS draw utilities). */
export const CHART_DRAW_MS = 700;

/** Shared easing for chart draw-in. Matches the CSS `ease-out` keyword. */
export const CHART_EASING = "ease-out" as const;
