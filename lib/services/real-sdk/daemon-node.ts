// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Daemon node resolution + client construction for the SDK engine — which node a
 * wallet talks to and how its client is built. Split out of `runtime.ts` so the
 * lifecycle (unlock/adopt) and the sync engine (`buildSyncSources` fan-out) share
 * one node-resolution path without importing each other.
 */
import { createDaemonClient, type DaemonClient, type RawWalletV1 } from "conceal-wallet-sdk";
import { DEFAULT_DAEMON_NODES } from "@/lib/config/config";
import { readAutoNode, readPreferredNode } from "@/lib/network/node-preference";

/** Default daemon node URL (first curated public node). */
export function defaultNodeUrl(): string {
  return DEFAULT_DAEMON_NODES[0];
}

/** Resolve the effective node URL from a wallet's persisted options. */
export function nodeUrlFromRaw(raw: RawWalletV1): string {
  const options = raw.options;
  // An explicit per-wallet custom node (encrypted settings) is the most specific choice — it wins.
  if (options?.customNode && typeof options.nodeUrl === "string" && options.nodeUrl.trim()) {
    return options.nodeUrl;
  }
  // Else honor the device-local node the user picked on the open screen (persisted, shared across
  // wallets on this device).
  const preferred = readPreferredNode();
  if (preferred) {
    return preferred;
  }
  // Else the auto-probed fastest healthy node (spreads load off the static default); falls back to
  // the static default when no probe has cached one yet.
  const auto = readAutoNode();
  if (auto) {
    return auto;
  }
  return defaultNodeUrl();
}

/**
 * Build a daemon client for `nodeUrl`. `allowInsecure: true` permits a plain
 * `http://` self-hosted node (the legacy explorer allowed any node URL).
 */
export function buildDaemon(nodeUrl: string): DaemonClient {
  return createDaemonClient({ nodeUrl, allowInsecure: true });
}
