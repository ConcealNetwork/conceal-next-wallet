import { isCordovaShell } from "@/lib/cordova/runtime";
import { saveBlobInCordova } from "@/lib/cordova/save-blob";

/**
 * Trigger a download of a Blob. On desktop browsers this uses a transient anchor
 * click; in Cordova WebView it opens the native share sheet so the user can save
 * the file (Android ignores `<a download>` for blob URLs).
 */
export async function triggerBlobDownload(filename: string, blob: Blob): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Download is only available in the browser.");
  }

  if (isCordovaShell()) {
    await saveBlobInCordova(filename, blob);
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
  }
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
