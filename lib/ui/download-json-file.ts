import { triggerBlobDownload } from "@/lib/ui/download-blob";

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

/** Download pre-serialized JSON text verbatim. */
export function downloadJsonText(filename: string, json: string): Promise<void> {
  const blob = new Blob([json], { type: "application/json" });
  return triggerBlobDownload(backupDownloadFilename(filename), blob);
}

export function downloadJsonFile(filename: string, data: unknown): Promise<void> {
  return downloadJsonText(filename, JSON.stringify(data, null, 2));
}
