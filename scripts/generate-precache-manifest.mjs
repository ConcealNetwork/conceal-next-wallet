#!/usr/bin/env node
/**
 * After `next build` (static export → out/), scan the export and write
 * out/precache-manifest.json — the app-shell asset list the service worker
 * precaches for offline open. Run as a postbuild step.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { buildPrecacheList } from "../lib/pwa/precache.mjs";

const OUT_DIR = join(process.cwd(), "out");
const MANIFEST = join(OUT_DIR, "precache-manifest.json");
const SW_FILE = join(OUT_DIR, "service-worker.js");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return [relative(OUT_DIR, full)];
    }),
  );
  return files.flat();
}

async function main() {
  try {
    await stat(OUT_DIR);
  } catch {
    console.error(`[precache] ${OUT_DIR} not found — run after \`next build\`.`);
    process.exit(1);
  }

  const all = await walk(OUT_DIR);
  const precache = buildPrecacheList(all);
  // Content-derived version: deterministic build output, and it only changes
  // when the shell changes (lets the SW bust its shell cache on real updates).
  const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
  await writeFile(MANIFEST, JSON.stringify({ version, urls: precache }, null, 0));
  console.log(`[precache] wrote ${precache.length} entries → ${relative(process.cwd(), MANIFEST)}`);

  // Stamp the version into the deployed SW so its bytes change when the shell
  // changes → the browser reinstalls and prunes the previous shell cache.
  try {
    const sw = await readFile(SW_FILE, "utf8");
    const stamped = sw.replace("__SW_VERSION__", version);
    if (stamped !== sw) {
      await writeFile(SW_FILE, stamped);
      console.log(`[precache] stamped service-worker.js with version ${version}`);
    } else {
      console.warn("[precache] __SW_VERSION__ token not found in service-worker.js");
    }
  } catch (error) {
    console.error("[precache] could not stamp service-worker.js:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[precache] failed:", error);
  process.exit(1);
});
