type CordovaWindow = Window & {
  cordova?: {
    platformId?: string;
    plugins?: Record<string, unknown>;
  };
};

/** Poll cadence for plugin attachment, which can lag `deviceready` by a tick. */
const PLUGIN_ATTACH_POLL_INTERVAL_MS = 50;
/** Upper bound on how long to wait for a plugin to attach before giving up. */
const PLUGIN_ATTACH_TIMEOUT_MS = 4000;

/** True when running inside the Cordova shell (build flag or cordova.js in the page). */
export function isCordovaShell(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_CORDOVA === "true") return true;
  return !!document.querySelector('script[src*="cordova.js"]');
}

/** Wait until Cordova has fired `deviceready` and `platformId` is set. No-op on web. */
export function whenCordovaReady(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!isCordovaShell()) return Promise.resolve();

  const w = window as CordovaWindow;
  if (w.cordova?.platformId) return Promise.resolve();

  return new Promise((resolve) => {
    document.addEventListener("deviceready", () => resolve(), { once: true });
  });
}

export function isCordovaAndroid(): boolean {
  return (window as CordovaWindow).cordova?.platformId === "android";
}

/**
 * Resolve a dotted `pluginPath` under `window.cordova` (e.g.
 * `"plugins.biometricUnlock"` or `"plugins.permissions"`) to the value at that
 * path, or `null` when `cordova` or any segment along the path is missing.
 */
function resolveCordovaPath(pluginPath: string): unknown | null {
  const root = (window as CordovaWindow).cordova;
  if (!root) return null;
  let cursor: unknown = root;
  for (const segment of pluginPath.split(".")) {
    if (cursor == null || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor ?? null;
}

function pollUntilPluginAttached(pluginPath: string): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (resolveCordovaPath(pluginPath) || Date.now() - started > PLUGIN_ATTACH_TIMEOUT_MS) {
        clearInterval(poll);
        resolve();
      }
    }, PLUGIN_ATTACH_POLL_INTERVAL_MS);
  });
}

/**
 * Wait until Cordova has fired `deviceready` AND the plugin at `pluginPath`
 * (a dotted path under `window.cordova`, e.g. `"plugins.biometricUnlock"`)
 * has attached. Plugins can attach a tick or two after `deviceready`, so this
 * polls briefly for attachment rather than reporting "missing". No-op outside
 * the Cordova shell. This is the canonical ready contract for every Cordova
 * plugin bridge — callers keep platform guards (e.g. `isCordovaAndroid()`).
 */
export async function whenCordovaPluginReady(pluginPath: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isCordovaShell()) return;
  if (resolveCordovaPath(pluginPath)) return;

  await whenCordovaReady();
  if (resolveCordovaPath(pluginPath)) return;

  await pollUntilPluginAttached(pluginPath);
}
