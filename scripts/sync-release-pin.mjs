#!/usr/bin/env node
// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Refresh `lib/config/release-pin.json` — the release pin tuple: the app version
 * (from package.json) and the mainnet height at this version (`heightAtVersion`).
 *
 * Wallet create/import fall back to the pin when the daemon `getheight` call
 * fails, so a fresh wallet never starts scanning from block 0.
 *
 * Usage (run once per release, then commit the file):
 *   npm run release:pin             refresh version + height
 *   npm run release:pin -- --force  allow a height lower than the current pin
 *
 * Exits non-zero WITHOUT writing when no default node answers with a valid
 * height, or when the height would move backwards without --force.
 */
import { readFile, writeFile } from "node:fs/promises";
import { DEFAULT_DAEMON_NODES } from "../lib/config/config.ts";

const PIN_FILE = "lib/config/release-pin.json";
const PACKAGE_FILE = "package.json";
const REQUEST_TIMEOUT_MS = 10000;

function fail(message) {
  console.error(`[release-pin] ${message}`);
  process.exit(1);
}

async function fetchHeight(nodeUrl) {
  const response = await fetch(`${nodeUrl.replace(/\/$/, "")}/getheight`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body?.status !== "OK") {
    throw new Error(`status "${body?.status ?? "missing"}"`);
  }
  const { height } = body;
  if (!Number.isSafeInteger(height) || height <= 0) {
    throw new Error(`invalid height "${String(height)}"`);
  }
  return height;
}

async function currentPinnedHeight() {
  try {
    const parsed = JSON.parse(await readFile(PIN_FILE, "utf8"));
    return Number.isSafeInteger(parsed?.heightAtVersion) ? parsed.heightAtVersion : 0;
  } catch {
    return 0;
  }
}

async function main() {
  const force = process.argv.slice(2).includes("--force");
  const { version } = JSON.parse(await readFile(PACKAGE_FILE, "utf8"));
  if (typeof version !== "string" || version.length === 0) {
    fail(`${PACKAGE_FILE} has no version.`);
  }

  let height = 0;
  let source = "";
  const failures = [];
  for (const nodeUrl of DEFAULT_DAEMON_NODES) {
    try {
      height = await fetchHeight(nodeUrl);
      source = nodeUrl;
      break;
    } catch (error) {
      failures.push(`${nodeUrl}: ${error?.message ?? error}`);
    }
  }
  if (height === 0) {
    fail(`no node returned a valid height — pin left untouched.\n  ${failures.join("\n  ")}`);
  }

  const current = await currentPinnedHeight();
  if (current > 0 && height < current && !force) {
    fail(
      `height ${height} is lower than the current pin ${current} — refusing to write ` +
        "(use --force to override).",
    );
  }

  const pin = { version, heightAtVersion: height };
  await writeFile(PIN_FILE, `${JSON.stringify(pin, null, 2)}\n`);
  console.log(
    `[release-pin] ${PIN_FILE} → version ${version}, heightAtVersion ${height}` +
      ` (was ${current}, from ${source})`,
  );
}

main().catch((error) => fail(error?.message ?? String(error)));
