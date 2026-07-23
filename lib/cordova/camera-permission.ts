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

function getPermissionsPlugin(): CordovaPermissions | null {
  return (window as CordovaWindow).cordova?.plugins?.permissions ?? null;
}

function permissionsReady(): boolean {
  const w = window as CordovaWindow;
  return !!(w.cordova?.platformId && w.cordova?.plugins?.permissions);
}

/**
 * Wait until cordova-plugin-android-permissions is actually attached.
 * `whenCordovaReady()` only guarantees `platformId` — the permissions plugin
 * can still be missing for a few ticks after that, which used to make us
 * return "denied" without ever showing the system dialog.
 */
async function whenCordovaPermissionsReady(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isCordovaShell()) return;
  if (permissionsReady()) return;

  await whenCordovaReady();
  if (permissionsReady()) return;

  await new Promise<void>((resolve) => {
    const started = Date.now();
    const finish = () => resolve();

    const onReady = () => {
      if (permissionsReady()) finish();
    };
    document.addEventListener("deviceready", onReady, { once: true });

    const poll = setInterval(() => {
      if (permissionsReady() || Date.now() - started > 4000) {
        clearInterval(poll);
        document.removeEventListener("deviceready", onReady);
        finish();
      }
    }, 50);
  });
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
 *
 * Important: call this *before* getUserMedia. Cordova Android auto-grants the
 * WebView media permission; if native CAMERA is missing, getUserMedia can break
 * subsequent attempts until the app process is restarted.
 */
export async function ensureCameraPermissionForCordova(): Promise<boolean> {
  await whenCordovaPermissionsReady();
  if (!isCordovaAndroid()) return true;

  const permissions = getPermissionsPlugin();
  if (!permissions) return false;

  if (await checkCameraPermission(permissions)) return true;
  return requestCameraPermission(permissions);
}
