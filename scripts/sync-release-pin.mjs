#!/usr/bin/env node
// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Refresh `lib/config/release-pin.json` — the release pin tuple: the app version
 * (from package.json) and the mainnet height at this version (`heightAtVersion`).
 *
 * Wallet create falls back to the pin when the daemon `getheight` call fails,
 * so a fresh wallet never starts scanning from block 0.
 *
 * Usage (run once per release, then commit the file):
 *   npm run release:pin             refresh version + height
 *   npm run release:pin -- --force  allow a height lower than the current pin
 *
 * Exits non-zero WITHOUT writing when no default node answers with a valid
 * height, or when the height would move backwards without --force. The
 * validation and guard logic lives in `lib/config/release-pin.mjs` (unit-tested).
 */
import { readFile, writeFile } from "node:fs/promises";
import { DEFAULT_DAEMON_NODES } from "../lib/config/config.ts";
import { pickPinnedHeight, readPinnedHeight, shouldWritePin } from "../lib/config/release-pin.mjs";

const PIN_FILE = "lib/config/release-pin.json";
const PACKAGE_FILE = "package.json";
const REQUEST_TIMEOUT_MS = 10000;

function fail(message) {
  console.error(`[release-pin] ${message}`);
  process.exit(1);
}

async function fetchGetHeight(nodeUrl) {
  const response = await fetch(`${nodeUrl.replace(/\/$/, "")}/getheight`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.json();
}

async function main() {
  const force = process.argv.slice(2).includes("--force");
  const { version } = JSON.parse(await readFile(PACKAGE_FILE, "utf8"));
  if (typeof version !== "string" || version.length === 0) {
    fail(`${PACKAGE_FILE} has no version.`);
  }

  const outcomes = [];
  for (const nodeUrl of DEFAULT_DAEMON_NODES) {
    try {
      outcomes.push({ nodeUrl, body: await fetchGetHeight(nodeUrl) });
    } catch (error) {
      outcomes.push({ nodeUrl, body: null, error: error?.message ?? String(error) });
    }
    if (pickPinnedHeight(outcomes).height !== null) break;
  }

  const { height, source, errors } = pickPinnedHeight(outcomes);
  if (height === null) {
    fail(`no node returned a valid height — pin left untouched.\n  ${errors.join("\n  ")}`);
  }

  let pinText = "";
  try {
    pinText = await readFile(PIN_FILE, "utf8");
  } catch {
    // No pin file yet — nothing to protect.
  }
  const current = readPinnedHeight(pinText);
  if (!shouldWritePin(current, height, force)) {
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
