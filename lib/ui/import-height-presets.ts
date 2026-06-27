import { AVG_BLOCK_TIME_SECONDS } from "conceal-wallet-sdk";

/**
 * Maps a plain-language "when did you first use this wallet?" answer to an
 * approximate scan-start block height — fully offline, no daemon call.
 *
 * Reference anchor: a chain height observed at a known date. We extrapolate
 * from it using the average block time. The estimate deliberately errs EARLY
 * (each preset targets the *earlier* edge of its range): scanning from a bit
 * too far back is only slower, whereas starting too late would miss funds.
 * "Not sure" scans from genesis — always correct, just slowest.
 */
const REF_HEIGHT = 2_088_835;
const REF_DATE_MS = Date.UTC(2026, 5, 6); // 2026-06-06, observed tip

export type ImportHeightPreset = "month" | "year" | "1-2y" | "older" | "unsure";

export const IMPORT_HEIGHT_PRESETS: { key: ImportHeightPreset; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "1-2y", label: "1–2 years ago" },
  { key: "older", label: "Longer ago" },
  { key: "unsure", label: "Not sure" },
];

/** Early-edge target date for a preset, relative to `now`. `null` = genesis. */
function targetDate(preset: ImportHeightPreset, now: Date): Date | null {
  const d = new Date(now.getTime());
  switch (preset) {
    case "month":
      d.setUTCMonth(d.getUTCMonth() - 1); // cover the whole current month + buffer
      return d;
    case "year":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)); // Jan 1 this year
    case "1-2y":
      d.setUTCFullYear(d.getUTCFullYear() - 2); // older edge of the 1–2y range
      return d;
    case "older":
      d.setUTCFullYear(d.getUTCFullYear() - 4);
      return d;
    case "unsure":
      return null;
  }
}

/** Offline fallback tip, extrapolated from the baked-in reference. */
function extrapolatedTip(now: Date): number {
  return REF_HEIGHT + (now.getTime() - REF_DATE_MS) / 1000 / AVG_BLOCK_TIME_SECONDS;
}

/**
 * Estimated scan-start block for a preset. Never negative; "unsure" → 0.
 *
 * Pass `tipHeight` (the live chain height) for an exact, drift-free result; when
 * omitted we extrapolate from the reference (offline fallback). Either way the
 * block count between the target date and now is subtracted from the tip.
 */
export function estimateScanHeight(
  preset: ImportHeightPreset,
  now: Date = new Date(),
  tipHeight?: number | null,
): number {
  if (preset === "unsure") return 0;
  const target = targetDate(preset, now);
  if (target === null) return 0;
  const anchor = tipHeight != null && tipHeight > 0 ? tipHeight : extrapolatedTip(now);
  const blocksSinceTarget = (now.getTime() - target.getTime()) / 1000 / AVG_BLOCK_TIME_SECONDS;
  const height = Math.floor(anchor - blocksSinceTarget);
  return height > 0 ? height : 0;
}

/** Human-readable readout for the height picker. */
export function describeScanHeight(
  preset: ImportHeightPreset,
  now: Date = new Date(),
  tipHeight?: number | null,
): { text: string; range: string } {
  if (preset === "unsure") {
    return {
      text: "We'll scan your whole history from the start — safest, but it can take a while.",
      range: "genesis → now",
    };
  }
  const target = targetDate(preset, now);
  const height = estimateScanHeight(preset, now, tipHeight);
  const when =
    target === null
      ? ""
      : target.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return {
    text: `We'll look for transactions from about ${when} onward.`,
    range: `block ${height.toLocaleString("en-US")} → now`,
  };
}
