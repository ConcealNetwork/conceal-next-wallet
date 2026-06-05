/** Safe filename stem for wallet backup downloads (no path or extension). */
export function sanitizeBackupFilename(name: string): string {
  const trimmed = name.trim() || "wallet";
  const safe = trimmed.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-");
  return safe.replace(/^-+|-+$/g, "") || "wallet";
}

export function backupDownloadFilename(name: string): string {
  const stem = sanitizeBackupFilename(name);
  return stem.endsWith(".json") ? stem : `${stem}.json`;
}

export function downloadJsonFile(filename: string, data: unknown): void {
  if (typeof window === "undefined") {
    throw new Error("Download is only available in the browser.");
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backupDownloadFilename(filename);
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
