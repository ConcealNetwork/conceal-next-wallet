// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Release height pin (`release-pin.json`, refreshed by `npm run release:pin`).
 *
 * A new wallet (and an import without an explicit height) is seeded at the
 * daemon tip. When `getheight` fails there, the pin is used instead of 0, so the
 * wallet never scans from genesis. A static JSON import keeps this safe for both
 * the client bundle and SSR.
 */
import releasePin from "@/lib/config/release-pin.json";

/** Mainnet height recorded when the current app version was released. */
export const HEIGHT_AT_VERSION: number = releasePin.heightAtVersion;

/**
 * Pick the creation height for a wallet seeded "now": the daemon tip when it is
 * usable, else the pinned release height. Returns 0 only when the pin is 0.
 */
export function resolveCreationHeight(
  daemonHeight: number | undefined,
  pinned: number = HEIGHT_AT_VERSION,
): number {
  if (daemonHeight !== undefined && Number.isFinite(daemonHeight) && daemonHeight > 0) {
    return Math.floor(daemonHeight);
  }
  return Number.isFinite(pinned) && pinned > 0 ? Math.floor(pinned) : 0;
}
