/**
 * Cordova shell setup helpers — port of conceal-wallet-cordova/scripts/setup-web-wallet.sh
 * steps that still apply to the Next static export (www/ copy + patches).
 */

/** Paths removed from www/ (PWA/dev artifacts + legacy CNAME). */
export const CORDOVA_REMOVE_PATHS = [
  "service-worker.js",
  "precache-manifest.json",
  "explorations",
  "CNAME",
];

/** Filenames/globs dropped from www/ after copy (legacy step 6). */
export const CORDOVA_REMOVE_FILE_PATTERNS = [/^__next.*\.txt$/i, /\.md$/i];

/** Default Cordova plugins from conceal-wallet-cordova/package.json (legacy step 13). */
export const CORDOVA_DEFAULT_PLUGINS = [
  { id: "cordova-plugin-insomnia", spec: "~4.3.0" },
  { id: "cordova-plugin-app-version", spec: "~0.1.14" },
  { id: "cordova-plugin-android-permissions", spec: "^1.1.4" },
  { id: "cordova-plugin-network-information", spec: "~3.0.0" },
  { id: "cordova-plugin-camera", spec: "^8.0.0", variables: { ANDROIDX_CORE_VERSION: "1.6.+" } },
];

/**
 * Point config.xml at the Next export entry (index.html at www root).
 * Legacy conceal-web-wallet used src/index.html — Next static export is www/index.html.
 */
export function patchConfigXml(content) {
  let next = content.replace(
    /<content\s+src=["']src\/index\.html["']\s*\/>/i,
    '<content src="index.html" />',
  );
  if (!/<content\s+src=["']index\.html["']\s*\/>/i.test(next)) {
    next = next.replace(/<content\s+src=["'][^"']+["']\s*\/>/i, '<content src="index.html" />');
  }
  return next;
}

/**
 * Worker importScripts path fixes (legacy setup-web-wallet.sh steps 10–11).
 * Next export serves lib/ at www root; normalize any stale src/lib paths.
 */
export function patchWorkerImportScripts(content) {
  return content
    .replace(/importScripts\(\s*(["'])\.\.\/src\/lib\//g, "importScripts($1../lib/")
    .replace(/importScripts\(\s*(["'])\/lib\//g, "importScripts($1../lib/")
    .replace(/importScripts\(\s*(["'])\.\/src\/lib\//g, "importScripts($1../lib/");
}

/** Apply worker-specific patches when file lives under www/workers/. */
export function patchCordovaFileContent(content, relPath, rewriteRootPaths) {
  let next = rewriteRootPaths(content);
  if (relPath.replace(/\\/g, "/").startsWith("workers/")) {
    next = patchWorkerImportScripts(next);
  }
  return next;
}

export function shouldRemoveCordovaFile(relPath) {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return CORDOVA_REMOVE_FILE_PATTERNS.some((pattern) => pattern.test(base));
}

/** Build `cordova plugin add` argv for a plugin descriptor. */
export function cordovaPluginAddArgs(plugin) {
  const args = ["plugin", "add", plugin.spec ? `${plugin.id}@${plugin.spec}` : plugin.id];
  if (plugin.variables) {
    for (const [key, value] of Object.entries(plugin.variables)) {
      args.push("--variable", `${key}=${value}`);
    }
  }
  return args;
}

/** Parse plugin IDs from `cordova plugin ls` stdout. */
export function parseCordovaPluginList(output) {
  const ids = new Set();
  for (const line of output.split("\n")) {
    const match = line.match(/^(cordova-plugin-[\w-]+)/);
    if (match) ids.add(match[1]);
  }
  return ids;
}

/** True when `cordova plugin add` failed because platform files already exist. */
export function isCordovaPluginAlreadyInstalledError(result) {
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return /already exists!/i.test(text);
}
