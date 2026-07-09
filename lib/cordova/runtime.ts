type CordovaWindow = Window & {
  cordova?: {
    platformId?: string;
    plugins?: Record<string, unknown>;
  };
};

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
