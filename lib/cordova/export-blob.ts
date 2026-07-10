import type { CordovaFileWindow } from "@/lib/cordova/file-types";
import { isCordovaShell, whenCordovaReady } from "@/lib/cordova/runtime";

function safeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_");
}

function isExportCancel(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes("cancel") ||
    msg.includes("abort") ||
    msg.includes("dismiss") ||
    msg.includes("no activity")
  );
}

/**
 * Native Cordova export via Android SAF — user picks the destination (e.g. Downloads).
 * Never uses browser `<a download>` or Web Share in the WebView.
 */
export async function exportCordovaBlob(filename: string, blob: Blob): Promise<void> {
  if (!isCordovaShell()) {
    throw new Error("Cordova export is only available in the mobile app.");
  }

  await whenCordovaReady();

  const saveDlg = (window as CordovaFileWindow).cordova?.plugins?.saveDialog;
  if (!saveDlg?.saveFile) {
    throw new Error("Save is not available — rebuild the app with cordova-plugin-save-dialog.");
  }

  try {
    await saveDlg.saveFile(blob, safeFilename(filename));
  } catch (error) {
    if (isExportCancel(error)) {
      throw new Error("Export cancelled.");
    }
    throw error instanceof Error ? error : new Error("Save failed.");
  }
}
