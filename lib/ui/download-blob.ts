/**
 * Trigger a browser download of a Blob via a transient anchor click. Shared by the CSV / JSON /
 * PNG exporters — each builds its own Blob + final filename, then hands them here. Revocation is
 * deferred because revoking the object URL synchronously cancels the download in WebKit/Safari.
 */
export function triggerBlobDownload(filename: string, blob: Blob): void {
  if (typeof window === "undefined") {
    throw new Error("Download is only available in the browser.");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
