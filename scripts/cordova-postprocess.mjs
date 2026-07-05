#!/usr/bin/env node
/**
 * Copy `out/` into a Cordova project's `www/` and apply WebView-safe patches.
 * Port of conceal-wallet-cordova/scripts/setup-web-wallet.sh for conceal-next-wallet:
 *   copy www, strip dev/PWA artifacts, relative paths, cordova.js, worker paths,
 *   config.xml entry point, optional Cordova plugin ensure.
 *
 * Usage:
 *   npm run cordova
 *   node scripts/cordova-postprocess.mjs [--build] [--ensure-plugins] <cordova-project-path>
 *   node scripts/cordova-postprocess.mjs --source out ~/conceal-wallet-cordova
 *
 * `npm run cordova` builds a Cordova-ready static export (`NEXT_PUBLIC_CORDOVA=true`)
 * then copies `out/` → `<cordova-project>/www/` with WebView path patches.
 * Default project path: ~/conceal-wallet-cordova.
 */
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  CORDOVA_DEFAULT_PLUGINS,
  CORDOVA_REMOVE_PATHS,
  cordovaPluginAddArgs,
  isCordovaPluginAlreadyInstalledError,
  parseCordovaPluginList,
  patchConfigXml,
  patchCordovaFileContent,
  shouldRemoveCordovaFile,
} from "../lib/cordova/shell-setup.mjs";
import {
  CORDOVA_TEXT_EXTENSIONS,
  injectCordovaScript,
  injectPathNormScript,
  rewriteDotRelativePaths,
  wwwDepth,
} from "../lib/cordova/www-paths.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const REMOVE_PATHS = CORDOVA_REMOVE_PATHS;

function expandHome(path) {
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function usage() {
  console.log(`Usage:
  node scripts/cordova-postprocess.mjs [options] <cordova-project-path>

Options:
  --source <dir>      Static export to copy (default: ./out)
  --build             Run scripts/build-cordova-export.mjs before copying (needs .env.local)
  --ensure-plugins    Run cordova plugin add for the default mobile plugin set
  -h, --help          Show this help

Example:
  node scripts/cordova-postprocess.mjs --build ~/conceal-wallet-cordova
  node scripts/cordova-postprocess.mjs --build --ensure-plugins ~/conceal-wallet-cordova
`);
}

function parseArgs(argv) {
  const args = { source: join(ROOT, "out"), target: null, build: false, ensurePlugins: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      args.help = true;
      continue;
    }
    if (token === "--build") {
      args.build = true;
      continue;
    }
    if (token === "--ensure-plugins") {
      args.ensurePlugins = true;
      continue;
    }
    if (token === "--source") {
      const value = argv[++i];
      if (!value) throw new Error("--source requires a directory path");
      args.source = resolve(expandHome(value));
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }
    if (args.target) throw new Error("Only one Cordova project path is allowed");
    args.target = resolve(expandHome(token));
  }
  return args;
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_CORDOVA_PROJECT = join(homedir(), "conceal-wallet-cordova");

async function askTargetPath() {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`Cordova project path [${DEFAULT_CORDOVA_PROJECT}]: `);
  rl.close();
  const trimmed = answer.trim();
  return resolve(expandHome(trimmed || DEFAULT_CORDOVA_PROJECT));
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(full);
      return [full];
    }),
  );
  return files.flat();
}

async function removeRelPaths(wwwDir, relPaths) {
  for (const rel of relPaths) {
    const full = join(wwwDir, rel);
    if (!(await pathExists(full))) continue;
    await rm(full, { recursive: true, force: true });
    console.log(`[cordova] removed ${rel}`);
  }
}

async function removeDevArtifacts(wwwDir) {
  const files = await walkFiles(wwwDir);
  let removed = 0;
  for (const file of files) {
    const rel = relative(wwwDir, file);
    if (!shouldRemoveCordovaFile(rel)) continue;
    await rm(file, { force: true });
    removed++;
  }
  if (removed > 0) console.log(`[cordova] removed ${removed} dev artifact file(s)`);
}

async function patchWwwTree(wwwDir) {
  const files = await walkFiles(wwwDir);
  let htmlPatched = 0;
  let textPatched = 0;
  let workerPatched = 0;

  for (const file of files) {
    const rel = relative(wwwDir, file);
    const ext = extname(file).toLowerCase();
    if (!CORDOVA_TEXT_EXTENSIONS.has(ext)) continue;

    const depth = wwwDepth(rel);
    const original = await readFile(file, "utf8");
    let next = patchCordovaFileContent(original, rel, (content) =>
      rewriteDotRelativePaths(content, depth),
    );
    if (ext === ".html") {
      next = injectPathNormScript(next);
      next = injectCordovaScript(next);
    }
    if (next !== original) {
      await writeFile(file, next, "utf8");
      textPatched++;
      if (ext === ".html") htmlPatched++;
      if (rel.replace(/\\/g, "/").startsWith("workers/")) workerPatched++;
    }
  }

  return { htmlPatched, textPatched, workerPatched };
}

async function patchCordovaConfigXml(targetRoot) {
  const configPath = join(targetRoot, "config.xml");
  const original = await readFile(configPath, "utf8");
  const next = patchConfigXml(original);
  if (next === original) {
    console.log("[cordova] config.xml content src already index.html");
    return;
  }
  await writeFile(configPath, next, "utf8");
  console.log("[cordova] config.xml content src → index.html");
}

function runCordovaExport() {
  console.log("[cordova] running Cordova static export…");
  const result = spawnSync("node", [join(ROOT, "scripts/build-cordova-export.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error("Cordova static export failed");
  }
}

async function listInstalledCordovaPlugins(targetRoot) {
  const installed = new Set();

  try {
    const pkgRaw = await readFile(join(targetRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);
    for (const id of Object.keys(pkg.cordova?.plugins ?? {})) {
      installed.add(id);
    }
  } catch {
    // package.json may be missing cordova metadata — fall back to CLI list.
  }

  const result = spawnSync("cordova", ["plugin", "ls"], {
    cwd: targetRoot,
    encoding: "utf8",
  });
  if (result.status === 0) {
    for (const id of parseCordovaPluginList(result.stdout ?? "")) {
      installed.add(id);
    }
  }

  return installed;
}

async function ensureCordovaPlugins(targetRoot) {
  console.log("[cordova] ensuring Cordova plugins (legacy setup-web-wallet.sh step 13)…");
  const installed = await listInstalledCordovaPlugins(targetRoot);

  for (const plugin of CORDOVA_DEFAULT_PLUGINS) {
    if (installed.has(plugin.id)) {
      console.log(`[cordova] ${plugin.id} already installed — skipping`);
      continue;
    }

    const args = cordovaPluginAddArgs(plugin);
    console.log(`[cordova] cordova ${args.join(" ")}`);
    const result = spawnSync("cordova", args, {
      cwd: targetRoot,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
    });

    if (result.status === 0) {
      installed.add(plugin.id);
      continue;
    }

    if (isCordovaPluginAlreadyInstalledError(result)) {
      console.log(`[cordova] ${plugin.id} already present on platform — skipping`);
      installed.add(plugin.id);
      continue;
    }

    process.stderr.write(result.stderr ?? "");
    process.stdout.write(result.stdout ?? "");
    throw new Error(`cordova plugin add failed for ${plugin.id}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }

  const sourceDir = args.source;
  let targetRoot = args.target;
  if (!targetRoot) {
    targetRoot = await askTargetPath();
  }

  if (args.build) {
    runCordovaExport();
  }

  const configXml = join(targetRoot, "config.xml");
  if (!(await pathExists(configXml))) {
    console.error(`[cordova] config.xml not found in ${targetRoot}`);
    console.error(
      "[cordova] Pass the root of your Cordova project (e.g. ~/conceal-wallet-cordova).",
    );
    process.exit(1);
  }

  try {
    const sourceStat = await stat(sourceDir);
    if (!sourceStat.isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(`[cordova] source export not found: ${sourceDir}`);
    console.error("[cordova] Run `npm run cordova` or pass --build.");
    process.exit(1);
  }

  const wwwDir = join(targetRoot, "www");
  console.log(`[cordova] source: ${sourceDir}`);
  console.log(`[cordova] target: ${wwwDir}`);

  if (await pathExists(wwwDir)) {
    await rm(wwwDir, { recursive: true, force: true });
  }
  await mkdir(wwwDir, { recursive: true });
  await cp(sourceDir, wwwDir, { recursive: true });

  await removeRelPaths(wwwDir, REMOVE_PATHS);
  await removeDevArtifacts(wwwDir);
  const { htmlPatched, textPatched, workerPatched } = await patchWwwTree(wwwDir);
  await patchCordovaConfigXml(targetRoot);

  if (args.ensurePlugins) {
    await ensureCordovaPlugins(targetRoot);
  }

  console.log(
    `[cordova] patched ${textPatched} text file(s) (${htmlPatched} HTML, ${workerPatched} worker)`,
  );
  console.log(`[cordova] done — www/ updated at ${wwwDir}`);
  console.log(
    "[cordova] next: cd into the Cordova project and build the APK (e.g. ./switch.sh, or ./build-with-version.sh / ./build-fdroid.sh if the android platform is already set up)",
  );
}

main().catch((error) => {
  console.error("[cordova] failed:", error.message ?? error);
  process.exit(1);
});
