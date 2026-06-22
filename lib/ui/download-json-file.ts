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

export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerBlobDownload(backupDownloadFilename(filename), blob);
}
