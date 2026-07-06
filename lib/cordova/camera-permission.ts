type PermissionStatus = { hasPermission: boolean };

type CordovaPermissions = {
  CAMERA: string;
  checkPermission: (
    permission: string,
    success: (status: PermissionStatus) => void,
    error?: (err: unknown) => void,
  ) => void;
  requestPermission: (
    permission: string,
    success: (status: PermissionStatus) => void,
    error?: (err: unknown) => void,
  ) => void;
};

type CordovaWindow = Window & {
  cordova?: {
    platformId?: string;
    plugins?: { permissions?: CordovaPermissions };
  };
};

function whenCordovaReady(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as CordovaWindow).cordova) return Promise.resolve();
  // cordova.js is injected in mobile builds; on web there is nothing to wait for.
  if (!document.querySelector('script[src*="cordova.js"]')) return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("deviceready", () => resolve(), { once: true });
  });
}

function isCordovaAndroid(): boolean {
  return (window as CordovaWindow).cordova?.platformId === "android";
}

function getPermissionsPlugin(): CordovaPermissions | null {
  return (window as CordovaWindow).cordova?.plugins?.permissions ?? null;
}

function checkCameraPermission(permissions: CordovaPermissions): Promise<boolean> {
  return new Promise((resolve, reject) => {
    permissions.checkPermission(
      permissions.CAMERA,
      (status) => resolve(status.hasPermission),
      reject,
    );
  });
}

function requestCameraPermission(permissions: CordovaPermissions): Promise<boolean> {
  return new Promise((resolve, reject) => {
    permissions.requestPermission(
      permissions.CAMERA,
      (status) => resolve(status.hasPermission),
      reject,
    );
  });
}

/**
 * On Cordova Android, WebView `getUserMedia` does not show the system camera
 * dialog by itself — the native CAMERA runtime permission must be granted first
 * via cordova-plugin-android-permissions. No-op on web and other platforms.
 */
export async function ensureCameraPermissionForCordova(): Promise<boolean> {
  await whenCordovaReady();
  if (!isCordovaAndroid()) return true;

  const permissions = getPermissionsPlugin();
  if (!permissions) return true;

  if (await checkCameraPermission(permissions)) return true;
  return requestCameraPermission(permissions);
}
