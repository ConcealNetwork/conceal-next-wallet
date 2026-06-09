#!/usr/bin/env node
/**
 * Insert the Conceal short copyright header (SPDX BSD-3-Clause) into source files.
 * Usage: node scripts/add-copyright-conceal.mjs <file> [file...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const YEAR = new Date().getFullYear();
const HEADER = `// Copyright (c) ${YEAR} Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause`;

const SKIP_DIRS = [
  "lib/wallet-core/",
  "public/lib/",
  "public/workers/",
  "out/",
  "node_modules/",
];

const SKIP_EXT = new Set([
  ".svg",
  ".png",
  ".ico",
  ".jpg",
  ".jpeg",
  ".webp",
  ".woff",
  ".woff2",
  ".lock",
  ".json",
]);

function shouldSkip(path) {
  const rel = relative(process.cwd(), path).replaceAll("\\", "/");
  if (SKIP_DIRS.some((dir) => rel.startsWith(dir))) {
    return `wallet-core / vendor path (${rel})`;
  }
  const ext = rel.slice(rel.lastIndexOf("."));
  if (SKIP_EXT.has(ext)) {
    return `unsupported extension (${ext})`;
  }
  return null;
}

function hasCopyright(text) {
  const head = text.split("\n").slice(0, 30).join("\n");
  return /Copyright/i.test(head) || /SPDX-License-Identifier/i.test(head);
}

function insertHeader(text) {
  const lines = text.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (
      line === "" ||
      line === '"use client";' ||
      line === '"use server";' ||
      line.startsWith("#!") ||
      line === "// @ts-nocheck"
    ) {
      index++;
      continue;
    }
    break;
  }

  const before = lines.slice(0, index);
  const after = lines.slice(index);
  const parts = [...before];

  if (parts.length > 0 && parts[parts.length - 1] !== "") {
    parts.push("");
  }
  parts.push(HEADER);
  if (after.length > 0) {
    parts.push("");
  }
  parts.push(...after);

  return `${parts.join("\n").replace(/\n+$/, "\n")}`;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/add-copyright-conceal.mjs <file> [file...]");
  process.exit(1);
}

let changed = 0;
let skipped = 0;

for (const arg of files) {
  const path = resolve(arg);
  const skipReason = shouldSkip(path);
  if (skipReason) {
    console.log(`skip ${arg}: ${skipReason}`);
    skipped++;
    continue;
  }

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    console.error(`error ${arg}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }

  if (hasCopyright(text)) {
    console.log(`skip ${arg}: already has copyright`);
    skipped++;
    continue;
  }

  writeFileSync(path, insertHeader(text), "utf8");
  console.log(`ok   ${arg}`);
  changed++;
}

if (changed === 0 && skipped === files.length) {
  process.exitCode = 1;
}
