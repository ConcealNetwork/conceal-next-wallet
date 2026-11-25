// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Pure logic behind `npm run release:pin` (`scripts/sync-release-pin.mjs`):
 * validating a daemon `getheight` answer, choosing the node to trust, and the
 * guards that decide whether the pin may be rewritten. The script does the
 * network and file I/O; tests feed these functions fixtures.
 */

/** Integer height from a daemon `getheight` body; throws unless it is usable. */
export function parseDaemonHeight(body) {
  if (body?.status !== "OK") {
    throw new Error(`status "${body?.status ?? "missing"}"`);
  }
  const { height } = body;
  if (!Number.isSafeInteger(height) || height <= 0) {
    throw new Error(`invalid height "${String(height)}"`);
  }
  return height;
}

/** The height pinned in `release-pin.json` text — 0 when absent or invalid. */
export function readPinnedHeight(text) {
  try {
    const { heightAtVersion } = JSON.parse(text);
    return Number.isSafeInteger(heightAtVersion) && heightAtVersion > 0 ? heightAtVersion : 0;
  } catch {
    return 0;
  }
}

/**
 * First usable height across per-node `getheight` outcomes, in attempt order.
 * `outcomes` items are `{ nodeUrl, body, error }`: `body` is null when the
 * request itself failed, in which case `error` says why. Returns
 * `{ height, source, errors }`; `height` is null when no node is usable and
 * `errors` then lists every node's reason.
 */
export function pickPinnedHeight(outcomes) {
  const errors = [];
  for (const { nodeUrl, body, error } of outcomes) {
    if (body === null) {
      errors.push(`${nodeUrl}: ${error ?? "request failed"}`);
      continue;
    }
    try {
      return { height: parseDaemonHeight(body), source: nodeUrl, errors };
    } catch (parseError) {
      errors.push(`${nodeUrl}: ${parseError.message}`);
    }
  }
  return { height: null, source: "", errors };
}

/** May `height` replace the pinned `current`? Never moves backwards without `force`. */
export function shouldWritePin(current, height, force = false) {
  return force || current <= 0 || height >= current;
}
