import { isCordovaShell, whenCordovaReady } from "@/lib/cordova/runtime";

/**
 * Save a file from Cordova WebView via the system share sheet. Android WebView
 * ignores `<a download>` blob URLs, so users must pick a destination (Files,
 * Drive, email, etc.) through native share.
 */
export async function saveBlobInCordova(filename: string, blob: Blob): Promise<void> {
  if (!isCordovaShell()) {
    throw new Error("Cordova save is only available in the mobile app.");
  }

  await whenCordovaReady();

  const file = new File([blob], filename, {
    type: blob.type || "application/octet-stream",
  });
  const shareData: ShareData = { files: [file], title: filename };

  if (typeof navigator.share !== "function") {
    throw new Error("File export is not supported on this device.");
  }
  if (typeof navigator.canShare === "function" && !navigator.canShare(shareData)) {
    throw new Error("File export is not supported on this device.");
  }

  try {
    await navigator.share(shareData);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Export cancelled.");
    }
    throw error;
  }
}
