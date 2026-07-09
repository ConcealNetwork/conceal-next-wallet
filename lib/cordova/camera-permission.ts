import { isCordovaAndroid, isCordovaShell, whenCordovaReady } from "@/lib/cordova/runtime";

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

async function whenCordovaPermissionsReady(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isCordovaShell()) return;

  const w = window as CordovaWindow;
  // cordova.js can load before deviceready; plugins are not ready until then.
  if (w.cordova?.platformId && w.cordova?.plugins?.permissions) return;

  await whenCordovaReady();
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
  await whenCordovaPermissionsReady();
  if (!isCordovaAndroid()) return true;

  const permissions = getPermissionsPlugin();
  if (!permissions) return false;

  if (await checkCameraPermission(permissions)) return true;
  return requestCameraPermission(permissions);
}
