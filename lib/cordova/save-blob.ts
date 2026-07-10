import { exportCordovaBlob } from "@/lib/cordova/export-blob";

/** @deprecated Use `exportCordovaBlob`. */
export async function saveBlobInCordova(filename: string, blob: Blob): Promise<void> {
  return exportCordovaBlob(filename, blob);
}

export { exportCordovaBlob };
