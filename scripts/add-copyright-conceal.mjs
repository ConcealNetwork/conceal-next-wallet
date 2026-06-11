#!/usr/bin/env node
/**
 * Insert Conceal copyright into source files.
 * - lib/wallet-core/** → legacy full BSD block (ported v1 style)
 * - other paths        → short SPDX header
 * Usage: node scripts/add-copyright-conceal.mjs <file> [file...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const YEAR = new Date().getFullYear();

const SHORT_HEADER = `// Copyright (c) ${YEAR} Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause`;

const WALLET_CORE_HEADER = `/*
 * Copyright (c) 2018 Gnock
 * Copyright (c) 2018-2019 The Masari Project
 * Copyright (c) 2018-2020 The Karbo developers
 * Copyright (c) 2018-${YEAR} Conceal Community, Conceal.Network & Conceal Devs
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */`;

const SKIP_DIRS = ["public/lib/", "public/workers/", "out/", "node_modules/"];

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

function isWalletCore(path) {
  const rel = relative(process.cwd(), path).replaceAll("\\", "/");
  return rel.startsWith("lib/wallet-core/");
}

function shouldSkip(path) {
  const rel = relative(process.cwd(), path).replaceAll("\\", "/");
  if (SKIP_DIRS.some((dir) => rel.startsWith(dir))) {
    return `vendor path (${rel})`;
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

function insertHeader(text, header) {
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
  parts.push(header);
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

  const header = isWalletCore(path) ? WALLET_CORE_HEADER : SHORT_HEADER;
  writeFileSync(path, insertHeader(text, header), "utf8");
  console.log(`ok   ${arg} (${isWalletCore(path) ? "full BSD" : "short"})`);
  changed++;
}

if (changed === 0 && skipped === files.length) {
  process.exitCode = 1;
}
